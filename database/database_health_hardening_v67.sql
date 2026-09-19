-- AFL Match Lab database health hardening
-- Applied to Supabase production on 2026-09-20.
-- Goals:
-- 1) make player availability refresh set-based;
-- 2) avoid prediction-chain work for matches that do not need it;
-- 3) prevent event_driven_tick from repeatedly refreshing the full public API when nothing changed;
-- 4) expire stale final_prediction workflow events after match start instead of leaving permanent pending rows.

create or replace function afl.refresh_player_availability()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare n_state integer:=0; n_events integer:=0; n_resolved integer:=0;
begin
  with ranked as materialized (
    select s.player_id,s.match_id,m.start_time,s.tog_pct,
      row_number() over(partition by s.player_id order by m.start_time desc) rn
    from afl.player_game_stats s
    join afl.matches m on m.id=s.match_id
    where s.tog_pct is not null and m.status='final'
  ),
  summary as materialized (
    select player_id,
      avg(tog_pct) filter(where rn between 2 and 6)::numeric baseline_tog,
      count(*) filter(where rn between 2 and 6)::int prior_n,
      avg(tog_pct) filter(where rn between 3 and 7)::numeric recovery_baseline
    from ranked group by player_id
  ),
  recovery as (
    select r.player_id,
      count(*) filter(
        where r.rn between 1 and 2
          and r.tog_pct >= 0.90 * nullif(s.recovery_baseline,0)
      )::int recovery_streak
    from ranked r
    join summary s using(player_id)
    where r.rn between 1 and 2
    group by r.player_id
  ),
  latest as (
    select r.player_id,r.match_id,r.start_time,r.tog_pct latest_tog,
      s.baseline_tog,coalesce(rec.recovery_streak,0)::int recovery_streak,s.prior_n
    from ranked r
    join summary s using(player_id)
    left join recovery rec using(player_id)
    where r.rn=1
  ),
  explicit as (
    select i.player_id,true explicit_injury
    from afl.injuries i
    where i.active=true
    group by i.player_id
  ),
  calc as (
    select l.*,round(l.latest_tog/nullif(l.baseline_tog,0),4) tog_ratio,
      coalesce(e.explicit_injury,false) explicit_injury
    from latest l
    left join explicit e on e.player_id=l.player_id
    where l.prior_n>=4 and l.baseline_tog is not null and l.baseline_tog>=45
  )
  insert into afl.player_availability_state(
    player_id,status,risk_level,baseline_tog,latest_tog,tog_ratio,recovery_streak,
    latest_match_id,explicit_injury,probability_factor,reason,source,updated_at
  )
  select c.player_id,
    case when c.explicit_injury then 'injury_recovery'
         when c.recovery_streak>=2 then 'normal'
         when c.tog_ratio<0.55 then 'high_risk'
         when c.tog_ratio<0.75 then 'restricted'
         when c.tog_ratio<0.85 then 'watch'
         else 'normal' end,
    case when c.explicit_injury and c.tog_ratio<0.65 then 'severe'
         when c.explicit_injury then 'high'
         when c.recovery_streak>=2 then 'low'
         when c.tog_ratio<0.55 then 'severe'
         when c.tog_ratio<0.75 then 'high'
         when c.tog_ratio<0.85 then 'moderate'
         else 'low' end,
    round(c.baseline_tog,2),c.latest_tog,c.tog_ratio,c.recovery_streak,c.match_id,c.explicit_injury,
    case when c.explicit_injury and c.tog_ratio<0.65 then 0.78
         when c.explicit_injury then 0.85
         when c.recovery_streak>=2 then 1.00
         when c.tog_ratio<0.55 then 0.80
         when c.tog_ratio<0.75 then 0.88
         when c.tog_ratio<0.85 then 0.94
         else 1.00 end,
    jsonb_build_object(
      'method','latest_vs_prior5_tog',
      'latest_tog',c.latest_tog,
      'baseline_tog',round(c.baseline_tog,2),
      'tog_ratio',c.tog_ratio,
      'recovery_rule','2 consecutive games >=90% prior baseline',
      'injury_claimed',c.explicit_injury
    ),
    case when c.explicit_injury then 'injury_plus_tog' else 'derived_tog' end,
    now()
  from calc c
  on conflict(player_id) do update set
    status=excluded.status,risk_level=excluded.risk_level,
    baseline_tog=excluded.baseline_tog,latest_tog=excluded.latest_tog,
    tog_ratio=excluded.tog_ratio,recovery_streak=excluded.recovery_streak,
    latest_match_id=excluded.latest_match_id,explicit_injury=excluded.explicit_injury,
    probability_factor=excluded.probability_factor,reason=excluded.reason,
    source=excluded.source,updated_at=now();
  get diagnostics n_state=row_count;

  insert into afl.player_risk_events(
    player_id,match_id,event_type,severity,observed_tog,baseline_tog,details,source,active,observed_at
  )
  select a.player_id,a.latest_match_id,'tog_anomaly',
    case when a.risk_level='severe' then 'severe' when a.risk_level='high' then 'high' else 'moderate' end,
    a.latest_tog,a.baseline_tog,a.reason,'derived_tog',true,coalesce(m.start_time,now())
  from afl.player_availability_state a
  left join afl.matches m on m.id=a.latest_match_id
  where a.status in ('watch','restricted','high_risk')
  on conflict(player_id,match_id,event_type) where source='derived_tog' do update set
    severity=excluded.severity,observed_tog=excluded.observed_tog,
    baseline_tog=excluded.baseline_tog,details=excluded.details,
    active=true,resolved_at=null;
  get diagnostics n_events=row_count;

  update afl.player_risk_events e
  set active=false,resolved_at=now()
  from afl.player_availability_state a
  where e.player_id=a.player_id and e.source='derived_tog'
    and e.event_type='tog_anomaly' and e.active=true and a.status='normal';
  get diagnostics n_resolved=row_count;

  return jsonb_build_object(
    'status','ok','states_refreshed',n_state,'events_upserted',n_events,
    'events_resolved',n_resolved,'engine','set_based_v2'
  );
end;
$function$;

create or replace function afl.initialize_scheduled_prediction_chains()
returns jsonb
language plpgsql
set search_path to ''
as $function$
declare
  r record; v_result jsonb; v_fallback jsonb;
  initialized integer:=0; refreshed integer:=0; skipped integer:=0;
begin
  for r in
    select m.id,m.updated_at,pr.latest_preview,
      exists(select 1 from afl.match_players mp where mp.match_id=m.id) has_lineup
    from afl.matches m
    left join lateral (
      select max(x.generated_at) latest_preview
      from afl.prediction_runs x
      where x.match_id=m.id and x.is_final=false
    ) pr on true
    where m.status in ('scheduled','postponed')
      and m.start_time>pg_catalog.now()
      and (
        pr.latest_preview is null
        or m.updated_at>pr.latest_preview
        or not exists(select 1 from afl.match_players mp where mp.match_id=m.id)
      )
    order by m.start_time
  loop
    if not r.has_lineup then
      v_fallback:=afl.ensure_fallback_lineup(r.id);
    end if;

    if r.latest_preview is null or r.updated_at>r.latest_preview or not r.has_lineup then
      v_result:=afl.generate_baseline_prediction_run(r.id,false);
      if v_result->>'status'='generated' then
        if r.latest_preview is null then initialized:=initialized+1; else refreshed:=refreshed+1; end if;
      else
        skipped:=skipped+1;
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'status','ok','initialized',initialized,'refreshed',refreshed,'skipped',skipped,
    'trigger','fixture_or_schedule_change','candidate_only',true
  );
end;
$function$;

create or replace function afl.event_driven_tick()
returns jsonb
language plpgsql
set search_path to ''
as $function$
declare
  out jsonb:='{}'::jsonb; r jsonb; has_active_window boolean;
  public_refresh_needed boolean:=false;
  availability_refresh_needed boolean:=false;
  last_public_refresh timestamptz;
  last_availability_refresh timestamptz;
  expired_final_events integer:=0;
  mel_now timestamp:=now() at time zone 'Australia/Melbourne';
begin
  perform afl.release_stale_workflow_claims(interval '15 minutes');

  select max(updated_at) into last_public_refresh from public.afl_api_matches;
  select max(updated_at) into last_availability_refresh from public.afl_api_availability;

  if not exists (
      select 1 from afl.workflow_events
      where status='pending' and scheduled_for>now()
        and event_type in ('pregame_sync','final_prediction','postmatch_settle')
    )
    or exists (
      select 1 from afl.workflow_events
      where event_type='fixtures_sync' and status='ok'
        and completed_at>now()-interval '40 minutes'
    )
    or (extract(isodow from mel_now)=2 and extract(hour from mel_now) between 7 and 9)
  then
    r:=afl.plan_workflow();
    out:=out||jsonb_build_object('planner',r);
  end if;

  if exists (
    select 1 from afl.workflow_events
    where event_type='fixtures_sync' and status='pending'
      and coalesce(next_attempt_at,scheduled_for)<=now() and attempt<max_attempts
  ) then
    r:=afl_source.fixture_tick();
    out:=out||jsonb_build_object('fixtures',r);
    public_refresh_needed:=true;
  end if;

  select exists(
    select 1 from afl.matches m
    where m.status in ('scheduled','postponed')
      and m.start_time between now()+interval '25 minutes' and now()+interval '4 hours 5 minutes'
  ) into has_active_window;

  if exists (
    select 1 from afl.workflow_events
    where event_type='pregame_sync' and status='pending'
      and coalesce(next_attempt_at,scheduled_for)<=now() and attempt<max_attempts
  ) then
    r:=afl_source.lineup_tick();
    out:=out||jsonb_build_object('lineup',r);
    public_refresh_needed:=true;
  end if;

  if exists (
    select 1 from afl.workflow_events
    where event_type='pregame_sync' and status='ok'
      and completed_at>now()-interval '40 minutes'
  ) then
    r:=afl.refresh_upcoming_predictions();
    out:=out||jsonb_build_object('model_refresh',r);
    public_refresh_needed:=true;
    availability_refresh_needed:=true;
  end if;

  update afl.workflow_events e
  set status='skipped',
      completed_at=coalesce(e.completed_at,now()),
      error_message=coalesce(nullif(e.error_message,''),'missed_final_window'),
      metadata=coalesce(e.metadata,'{}'::jsonb)||jsonb_build_object(
        'scheduler_reconciled_at',now(),
        'scheduler_reconcile_reason','missed_final_window',
        'existing_final_snapshot',exists(
          select 1 from afl.final_prediction_snapshots s where s.match_id=e.match_id
        )
      )
  from afl.matches m
  where e.match_id=m.id and e.event_type='final_prediction'
    and e.status='pending' and m.start_time<=now();
  get diagnostics expired_final_events=row_count;

  if expired_final_events>0 then
    out:=out||jsonb_build_object(
      'expired_final_events',
      jsonb_build_object('status','reconciled','count',expired_final_events,'reason','missed_final_window')
    );
  end if;

  if exists (
    select 1
    from afl.workflow_events e
    join afl.matches m on m.id=e.match_id
    where e.event_type='final_prediction' and e.status='pending'
      and coalesce(e.next_attempt_at,e.scheduled_for)<=now()
      and e.attempt<e.max_attempts and m.start_time>now()
      and not exists (
        select 1 from afl.workflow_events s
        where s.match_id=e.match_id and s.event_type='pregame_sync'
          and s.scheduled_for=e.scheduled_for and s.status<>'ok'
      )
  ) then
    r:=afl.final_prediction_tick();
    out:=out||jsonb_build_object('final_freeze',r);
    if coalesce((r->>'frozen')::integer,0)>0 then
      public_refresh_needed:=true;
      availability_refresh_needed:=true;
    end if;
  end if;

  if exists (
    select 1 from afl_source.stats_jobs
    where status='pending' and next_attempt_at<=now() and attempt<max_attempts
  ) then
    r:=afl_source.stats_tick();
    out:=out||jsonb_build_object('stats',r);
    public_refresh_needed:=true;
    availability_refresh_needed:=true;
  end if;

  if exists (
    select 1 from afl.workflow_events e
    where e.event_type='postmatch_settle' and e.status='pending'
      and coalesce(e.next_attempt_at,e.scheduled_for)<=now()
      and e.attempt<e.max_attempts
      and exists(
        select 1 from afl.final_prediction_snapshots fps
        where fps.match_id=e.match_id and fps.model_ready=true
      )
  ) then
    r:=afl.postmatch_tick();
    out:=out||jsonb_build_object('postmatch',r);
    if coalesce((r->>'settled')::integer,0)>0 then
      public_refresh_needed:=true;
      availability_refresh_needed:=true;
    end if;
  end if;

  if has_active_window
     or (extract(isodow from mel_now)=2 and extract(hour from mel_now)=8)
     or exists(select 1 from afl_source.injury_sync_requests where status='requested')
  then
    r:=afl_source.injury_sync_tick();
    out:=out||jsonb_build_object('injury_sync',r);
    availability_refresh_needed:=true;
  end if;

  if exists(select 1 from afl_source.injury_sync_requests where status='requested') then
    r:=afl_source.collect_injury_sync();
    out:=out||jsonb_build_object('injury_collect',r);
    availability_refresh_needed:=true;
  end if;

  if exists (
    select 1
    from afl.workflow_events e
    join afl.matches m on m.id=e.match_id
    where e.event_type='pregame_sync'
      and coalesce((e.metadata->>'offset_minutes')::integer,0)=-30
      and e.status='ok' and e.completed_at is not null
      and not (e.metadata?'late_lineup_delta_error')
      and m.start_time>now()-interval '3 hours'
      and exists(select 1 from afl.final_prediction_snapshots f where f.match_id=e.match_id)
      and not exists(select 1 from afl.late_lineup_deltas d where d.match_id=e.match_id)
  ) then
    r:=afl.late_lineup_delta_tick();
    out:=out||jsonb_build_object('late_lineup_delta',r);
    if coalesce(r->>'status','')='captured' then public_refresh_needed:=true; end if;
  end if;

  if exists (
    select 1 from afl.matches m
    where m.start_time+interval '8 hours'<=now()
      and m.start_time>now()-interval '7 days'
      and exists(select 1 from afl.final_prediction_snapshots s where s.match_id=m.id)
      and not exists(
        select 1 from public.afl_api_match_reviews v
        where v.match_id=m.id and v.status='verified'
      )
  ) then
    r:=afl.review_tick();
    out:=out||jsonb_build_object('review',r);
  end if;

  if exists (
    select 1 from afl.workflow_events
    where status='ok'
      and event_type in ('fixtures_sync','pregame_sync','final_prediction')
      and completed_at>coalesce(last_public_refresh,'epoch'::timestamptz)
  ) then
    public_refresh_needed:=true;
  end if;

  if exists (
    select 1 from afl.injuries
    where updated_at>coalesce(last_availability_refresh,'epoch'::timestamptz)
  ) then
    availability_refresh_needed:=true;
  end if;

  if (
    last_availability_refresh is null
    or last_availability_refresh<now()-interval '12 hours'
  ) and exists (
    select 1 from afl.matches
    where status in ('scheduled','postponed')
      and start_time between now() and now()+interval '14 days'
  ) then
    availability_refresh_needed:=true;
  end if;

  if public_refresh_needed then
    r:=afl.refresh_public_api_projection();
    out:=out||jsonb_build_object('public_api',r);
    r:=afl.refresh_public_match_context();
    out:=out||jsonb_build_object('public_context',r);
  end if;

  if availability_refresh_needed then
    r:=afl.refresh_public_availability();
    out:=out||jsonb_build_object('public_availability',r);
  end if;

  return jsonb_build_object(
    'status','ok','active_match_window',has_active_window,
    'public_refresh_needed',public_refresh_needed,
    'availability_refresh_needed',availability_refresh_needed,
    'expired_final_events',expired_final_events,'actions',out
  );
end;
$function$;
