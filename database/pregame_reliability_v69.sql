-- AFL Match Lab v69 — Pregame Reliability + Injury Identity Hardening
-- Production-deployed and verified 2026-09-20.
--
-- Includes:
-- - 2-minute lightweight pregame finalizer for async token -> roster completion
-- - T-60 final freeze only after same-slot lineup sync completes
-- - T-30 late lineup delta ambiguity fix
-- - no duplicate preview immediately before final freeze
-- - change-driven public API refresh
-- - canonical official injury source reconciliation
-- - injury-only placeholder players upgraded in-place by later lineup/stats external IDs
-- - fallback lineup provenance/source_snapshot_at repair
-- - preserved lineup metadata during repeated polling
-- - weekly cron history retention cleanup
--
CREATE OR REPLACE FUNCTION afl.capture_late_lineup_delta(p_match_id uuid, p_workflow_event_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  ev afl.workflow_events%rowtype;
  fps afl.final_prediction_snapshots%rowtype;
  fds afl.final_data_snapshots%rowtype;
  gen jsonb;
  shadow_run uuid;
  late_source timestamptz;
  late_confirmed boolean := false;
  added jsonb := '[]'::jsonb;
  removed jsonb := '[]'::jsonb;
  role_changes jsonb := '[]'::jsonb;
  prob_changes jsonb := '[]'::jsonb;
  added_n integer := 0;
  removed_n integer := 0;
  role_n integer := 0;
  prob_n integer := 0;
  max_delta numeric := 0;
  lineup_changed_flag boolean := false;
  snap jsonb;
  digest_hex text;
  outrow afl.late_lineup_deltas%rowtype;
begin
  if not pg_catalog.pg_try_advisory_xact_lock(hashtextextended('afl_late_lineup_delta_' || p_match_id::text,0)) then
    return jsonb_build_object('status','busy');
  end if;

  select * into outrow from afl.late_lineup_deltas where match_id=p_match_id;
  if found then
    return jsonb_build_object('status','already_captured','delta_id',outrow.id,'snapshot_sha256',outrow.snapshot_sha256);
  end if;

  select * into ev from afl.workflow_events
  where id=p_workflow_event_id and match_id=p_match_id and event_type='pregame_sync'
    and coalesce((metadata->>'offset_minutes')::integer,0)=-30
    and status in ('ok','completed') and completed_at is not null;
  if not found then return jsonb_build_object('status','awaiting_t30_sync'); end if;

  select * into fps from afl.final_prediction_snapshots where match_id=p_match_id;
  if not found then return jsonb_build_object('status','awaiting_final_snapshot'); end if;

  select * into fds from afl.final_data_snapshots where match_id=p_match_id;
  if not found then return jsonb_build_object('status','awaiting_final_data_snapshot'); end if;

  select ps.source_snapshot_at,
         coalesce((ps.state#>>'{lineup,confirmed}')::boolean,false)
    into late_source,late_confirmed
  from afl.pregame_state ps where ps.match_id=p_match_id;

  if late_source is null or late_source < ev.completed_at - interval '5 minutes' then
    return jsonb_build_object('status','awaiting_t30_state','event_completed_at',ev.completed_at,'source_snapshot_at',late_source);
  end if;

  gen := afl.generate_baseline_prediction_run(p_match_id,false);
  if gen->>'status' not in ('generated','existing') then
    return jsonb_build_object('status','shadow_generation_' || coalesce(gen->>'status','unknown'),'generation',gen);
  end if;
  shadow_run := (gen->>'prediction_run_id')::uuid;

  with final_lineup as (
    select (x->>'player_id')::uuid player_id,
           x->>'name' player_name,
           x->>'team' team_name,
           x->>'position' named_position,
           coalesce((x->>'bench')::boolean,false) bench,
           coalesce((x->>'emergency')::boolean,false) emergency
    from jsonb_array_elements(coalesce(fds.snapshot->'lineup','[]'::jsonb)) x
  ), late_lineup as (
    select mp.player_id,p.name player_name,t.name team_name,mp.named_position,
           coalesce(mp.bench,false) bench,coalesce(mp.emergency,false) emergency,
           coalesce(mp.confirmed,false) confirmed
    from afl.match_players mp
    join afl.players p on p.id=mp.player_id
    left join afl.teams t on t.id=mp.team_id
    where mp.match_id=p_match_id
  )
  select coalesce(jsonb_agg(jsonb_build_object('player_id',l.player_id,'player_name',l.player_name,'team_name',l.team_name,'position',l.named_position,'bench',l.bench,'emergency',l.emergency,'confirmed',l.confirmed) order by l.team_name,l.player_name),'[]'::jsonb),count(*)::int
  into added,added_n
  from late_lineup l left join final_lineup f using(player_id) where f.player_id is null;

  with final_lineup as (
    select (x->>'player_id')::uuid player_id,
           x->>'name' player_name,x->>'team' team_name,x->>'position' named_position,
           coalesce((x->>'bench')::boolean,false) bench,coalesce((x->>'emergency')::boolean,false) emergency
    from jsonb_array_elements(coalesce(fds.snapshot->'lineup','[]'::jsonb)) x
  ), late_lineup as (
    select mp.player_id from afl.match_players mp where mp.match_id=p_match_id
  )
  select coalesce(jsonb_agg(jsonb_build_object('player_id',f.player_id,'player_name',f.player_name,'team_name',f.team_name,'position',f.named_position,'bench',f.bench,'emergency',f.emergency) order by f.team_name,f.player_name),'[]'::jsonb),count(*)::int
  into removed,removed_n
  from final_lineup f left join late_lineup l using(player_id) where l.player_id is null;

  with final_lineup as (
    select (x->>'player_id')::uuid player_id,
           x->>'name' player_name,x->>'team' team_name,x->>'position' named_position,
           coalesce((x->>'bench')::boolean,false) bench,coalesce((x->>'emergency')::boolean,false) emergency
    from jsonb_array_elements(coalesce(fds.snapshot->'lineup','[]'::jsonb)) x
  ), late_lineup as (
    select mp.player_id,p.name player_name,t.name team_name,mp.named_position,
           coalesce(mp.bench,false) bench,coalesce(mp.emergency,false) emergency,coalesce(mp.confirmed,false) confirmed
    from afl.match_players mp join afl.players p on p.id=mp.player_id left join afl.teams t on t.id=mp.team_id
    where mp.match_id=p_match_id
  ), changed as (
    select f.player_id,coalesce(l.player_name,f.player_name) player_name,coalesce(l.team_name,f.team_name) team_name,
           f.named_position final_position,l.named_position late_position,
           f.bench final_bench,l.bench late_bench,f.emergency final_emergency,l.emergency late_emergency,l.confirmed late_player_confirmed
    from final_lineup f join late_lineup l using(player_id)
    where coalesce(f.named_position,'') is distinct from coalesce(l.named_position,'')
       or f.bench is distinct from l.bench or f.emergency is distinct from l.emergency
  )
  select coalesce(jsonb_agg(jsonb_build_object('player_id',player_id,'player_name',player_name,'team_name',team_name,'final_position',final_position,'late_position',late_position,'final_bench',final_bench,'late_bench',late_bench,'final_emergency',final_emergency,'late_emergency',late_emergency,'late_confirmed',late_player_confirmed) order by team_name,player_name),'[]'::jsonb),count(*)::int
  into role_changes,role_n from changed;

  with diffs as (
    select f.player_id,coalesce(p.name,f.metadata->>'player_name') player_name,t.name team_name,
           f.market,f.threshold,f.selection,
           coalesce(f.calibrated_probability,f.raw_probability) final_probability,
           coalesce(s.calibrated_probability,s.raw_probability) late_probability,
           round((coalesce(s.calibrated_probability,s.raw_probability)-coalesce(f.calibrated_probability,f.raw_probability))::numeric,6) probability_delta
    from afl.prediction_legs f
    join afl.prediction_legs s on s.prediction_run_id=shadow_run
      and s.player_id=f.player_id and s.market=f.market and s.threshold is not distinct from f.threshold
    left join afl.players p on p.id=f.player_id
    left join afl.teams t on t.id=f.team_id
    where f.prediction_run_id=fps.prediction_run_id
  ), significant as (
    select * from diffs where abs(probability_delta)>=0.05
    order by abs(probability_delta) desc,player_name,market,threshold nulls last
  ), top_changes as (
    select * from significant limit 50
  )
  select
    coalesce((select jsonb_agg(jsonb_build_object('player_id',player_id,'player_name',player_name,'team_name',team_name,'market',market,'threshold',threshold,'selection',selection,'final_probability',final_probability,'late_probability',late_probability,'probability_delta',probability_delta) order by abs(probability_delta) desc) from top_changes),'[]'::jsonb),
    (select count(*)::int from significant),
    coalesce((select max(abs(probability_delta)) from diffs),0)
  into prob_changes,prob_n,max_delta;

  lineup_changed_flag := added_n>0 or removed_n>0 or role_n>0;

  snap := jsonb_build_object(
    'schema_version',1,
    'kind','t30_late_lineup_delta',
    'match_id',p_match_id,
    'workflow_event_id',p_workflow_event_id,
    'final_prediction_run_id',fps.prediction_run_id,
    'shadow_prediction_run_id',shadow_run,
    'final_source_cutoff_at',fps.source_cutoff_at,
    'late_source_snapshot_at',late_source,
    'final_lineup_confirmed',fps.lineup_confirmed,
    'late_lineup_confirmed',late_confirmed,
    'confirmation_upgraded',(not fps.lineup_confirmed and late_confirmed),
    'lineup_changed',lineup_changed_flag,
    'added_players',added,
    'removed_players',removed,
    'role_changes',role_changes,
    'significant_probability_threshold_pp',5,
    'significant_probability_changes',prob_changes,
    'significant_probability_change_count',prob_n,
    'max_abs_probability_delta',max_delta,
    'captured_at',now()
  );
  digest_hex := encode(extensions.digest(convert_to(snap::text,'UTF8'),'sha256'),'hex');

  insert into afl.late_lineup_deltas(match_id,workflow_event_id,final_prediction_snapshot_id,final_prediction_run_id,shadow_prediction_run_id,captured_at,final_source_cutoff_at,late_source_snapshot_at,final_lineup_confirmed,late_lineup_confirmed,lineup_changed,added_count,removed_count,role_change_count,significant_probability_change_count,max_abs_probability_delta,snapshot,snapshot_sha256)
  values(p_match_id,p_workflow_event_id,fps.id,fps.prediction_run_id,shadow_run,now(),fps.source_cutoff_at,late_source,fps.lineup_confirmed,late_confirmed,lineup_changed_flag,added_n,removed_n,role_n,prob_n,max_delta,snap,digest_hex)
  returning * into outrow;

  insert into public.afl_api_late_lineup_delta(match_id,captured_at,final_source_cutoff_at,late_source_snapshot_at,final_lineup_confirmed,late_lineup_confirmed,lineup_changed,added_count,removed_count,role_change_count,significant_probability_change_count,max_abs_probability_delta,snapshot_sha256,changes,updated_at)
  values(p_match_id,outrow.captured_at,fps.source_cutoff_at,late_source,fps.lineup_confirmed,late_confirmed,lineup_changed_flag,added_n,removed_n,role_n,prob_n,max_delta,digest_hex,
    jsonb_build_object('confirmation_upgraded',(not fps.lineup_confirmed and late_confirmed),'added_players',added,'removed_players',removed,'role_changes',role_changes,'significant_probability_changes',prob_changes),now())
  on conflict(match_id) do nothing;

  return jsonb_build_object('status','captured','delta_id',outrow.id,'snapshot_sha256',digest_hex,'lineup_changed',lineup_changed_flag,'added_count',added_n,'removed_count',removed_n,'role_change_count',role_n,'significant_probability_change_count',prob_n,'max_abs_probability_delta',max_delta,'late_lineup_confirmed',late_confirmed,'shadow_prediction_run_id',shadow_run);
end;
$function$


CREATE OR REPLACE FUNCTION afl.cleanup_cron_history()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  orphan_deleted integer:=0;
  current_deleted integer:=0;
begin
  delete from cron.job_run_details d
  where d.jobid not in (select j.jobid from cron.job j)
    and coalesce(d.end_time,d.start_time)<now()-interval '7 days';
  get diagnostics orphan_deleted=row_count;

  delete from cron.job_run_details d
  where d.jobid in (select j.jobid from cron.job j)
    and coalesce(d.end_time,d.start_time)<now()-interval '30 days';
  get diagnostics current_deleted=row_count;

  return jsonb_build_object(
    'status','ok',
    'orphan_history_deleted',orphan_deleted,
    'current_job_history_deleted',current_deleted,
    'orphan_retention_days',7,
    'current_job_retention_days',30
  );
end;
$function$


CREATE OR REPLACE FUNCTION afl.ensure_fallback_lineup(p_match_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target record;
  inserted_count integer:=0;
  inserted_home integer:=0;
  inserted_away integer:=0;
  home_existing integer:=0;
  away_existing integer:=0;
  prev_id uuid;
  fallback_total integer:=0;
begin
  select m.id,m.start_time,m.home_team_id,m.away_team_id into target
  from afl.matches m where m.id=p_match_id;
  if not found then return jsonb_build_object('status','match_not_found'); end if;

  select count(*) into home_existing
  from afl.match_players where match_id=p_match_id and team_id=target.home_team_id;

  select count(*) into away_existing
  from afl.match_players where match_id=p_match_id and team_id=target.away_team_id;

  if home_existing=0 then
    select m2.id into prev_id
    from afl.matches m2
    where m2.start_time<target.start_time
      and (m2.home_team_id=target.home_team_id or m2.away_team_id=target.home_team_id)
      and exists(
        select 1 from afl.match_players x
        where x.match_id=m2.id and x.team_id=target.home_team_id
      )
    order by m2.start_time desc
    limit 1;

    if prev_id is not null then
      insert into afl.match_players(
        match_id,player_id,team_id,named_position,bench,emergency,confirmed,source_updated_at
      )
      select p_match_id,mp.player_id,mp.team_id,mp.named_position,mp.bench,mp.emergency,false,now()
      from afl.match_players mp
      where mp.match_id=prev_id and mp.team_id=target.home_team_id
      on conflict(match_id,player_id) do nothing;
      get diagnostics inserted_home=row_count;
    end if;
  end if;

  prev_id:=null;
  if away_existing=0 then
    select m2.id into prev_id
    from afl.matches m2
    where m2.start_time<target.start_time
      and (m2.home_team_id=target.away_team_id or m2.away_team_id=target.away_team_id)
      and exists(
        select 1 from afl.match_players x
        where x.match_id=m2.id and x.team_id=target.away_team_id
      )
    order by m2.start_time desc
    limit 1;

    if prev_id is not null then
      insert into afl.match_players(
        match_id,player_id,team_id,named_position,bench,emergency,confirmed,source_updated_at
      )
      select p_match_id,mp.player_id,mp.team_id,mp.named_position,mp.bench,mp.emergency,false,now()
      from afl.match_players mp
      where mp.match_id=prev_id and mp.team_id=target.away_team_id
      on conflict(match_id,player_id) do nothing;
      get diagnostics inserted_away=row_count;
    end if;
  end if;

  inserted_count:=inserted_home+inserted_away;

  select count(*) into fallback_total
  from afl.match_players
  where match_id=p_match_id and confirmed=false;

  if fallback_total>0 then
    insert into afl.pregame_state(match_id,state,source_snapshot_at,updated_at)
    values(
      p_match_id,
      jsonb_build_object(
        'lineup',jsonb_build_object(
          'confirmed',false,
          'fallback_previous_lineup',true,
          'fallback_players_written',fallback_total,
          'fallback_generated_at',now()
        )
      ),
      now(),now()
    )
    on conflict(match_id) do update set
      state=jsonb_set(
        jsonb_set(
          jsonb_set(
            coalesce(afl.pregame_state.state,'{}'::jsonb),
            '{lineup,confirmed}','false'::jsonb,true
          ),
          '{lineup,fallback_previous_lineup}','true'::jsonb,true
        ),
        '{lineup,fallback_players_written}',to_jsonb(fallback_total),true
      ),
      source_snapshot_at=now(),
      updated_at=now();
  end if;

  return jsonb_build_object(
    'status',case
      when inserted_count>0 then 'inserted'
      when home_existing>0 and away_existing>0 then 'existing_both'
      else 'partial_no_previous_lineup'
    end,
    'inserted_home',inserted_home,
    'inserted_away',inserted_away,
    'home_existing_before',home_existing,
    'away_existing_before',away_existing,
    'fallback_total',fallback_total,
    'source_snapshot_refreshed',fallback_total>0
  );
end;
$function$


CREATE OR REPLACE FUNCTION afl.event_driven_tick()
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  out jsonb := '{}'::jsonb;
  r jsonb;
  has_active_window boolean;
  public_refresh_needed boolean := false;
  availability_refresh_needed boolean := false;
  last_public_refresh timestamptz;
  last_availability_refresh timestamptz;
  expired_final_events integer := 0;
  mel_now timestamp := now() at time zone 'Australia/Melbourne';
begin
  perform afl.release_stale_workflow_claims(interval '15 minutes');

  select max(updated_at) into last_public_refresh from public.afl_api_matches;
  select max(updated_at) into last_availability_refresh from public.afl_api_availability;

  if not exists (
      select 1 from afl.workflow_events
      where status='pending' and scheduled_for > now()
        and event_type in ('pregame_sync','final_prediction','postmatch_settle')
    )
    or (extract(isodow from mel_now)=2 and extract(hour from mel_now) between 7 and 9)
  then
    r := afl.plan_workflow();
    out := out || jsonb_build_object('planner',r);
  end if;

  if exists (
    select 1 from afl.workflow_events
    where event_type='fixtures_sync'
      and status='pending'
      and coalesce(next_attempt_at,scheduled_for)<=now()
      and attempt<max_attempts
  ) then
    r := afl_source.fixture_tick();
    out := out || jsonb_build_object('fixtures',r);
    public_refresh_needed := true;
  end if;

  select exists(
    select 1 from afl.matches m
    where m.status in ('scheduled','postponed')
      and m.start_time between now()+interval '25 minutes' and now()+interval '4 hours 5 minutes'
  ) into has_active_window;

  if exists (
    select 1 from afl.workflow_events
    where event_type='pregame_sync'
      and status='pending'
      and coalesce(next_attempt_at,scheduled_for)<=now()
      and attempt<max_attempts
  ) then
    r := afl_source.lineup_tick();
    out := out || jsonb_build_object('lineup',r);
  end if;

  if exists (
    select 1 from afl.workflow_events
    where event_type='pregame_sync'
      and status='ok'
      and completed_at > now()-interval '40 minutes'
  ) then
    r := afl.refresh_upcoming_predictions();
    out := out || jsonb_build_object('model_refresh',r);
    if coalesce((r->>'refreshed')::integer,0)>0 then
      public_refresh_needed := true;
    end if;
  end if;

  -- A final prediction that is still pending after the match has started can no
  -- longer become a legitimate pre-game seal. Preserve that fact explicitly
  -- rather than leaving a permanent pending event.
  update afl.workflow_events e
  set status='skipped',
      completed_at=coalesce(e.completed_at,now()),
      error_message=coalesce(nullif(e.error_message,''),'missed_final_window'),
      metadata=coalesce(e.metadata,'{}'::jsonb) || jsonb_build_object(
        'scheduler_reconciled_at',now(),
        'scheduler_reconcile_reason','missed_final_window',
        'existing_final_snapshot',exists(
          select 1 from afl.final_prediction_snapshots s where s.match_id=e.match_id
        )
      )
  from afl.matches m
  where e.match_id=m.id
    and e.event_type='final_prediction'
    and e.status='pending'
    and m.start_time<=now();
  get diagnostics expired_final_events=row_count;

  if expired_final_events>0 then
    out := out || jsonb_build_object(
      'expired_final_events',
      jsonb_build_object('status','reconciled','count',expired_final_events,'reason','missed_final_window')
    );
  end if;

  if exists (
    select 1
    from afl.workflow_events e
    join afl.matches m on m.id=e.match_id
    where e.event_type='final_prediction'
      and e.status='pending'
      and coalesce(e.next_attempt_at,e.scheduled_for)<=now()
      and e.attempt<e.max_attempts
      and m.start_time>now()
      and not exists (
        select 1
        from afl.workflow_events s
        where s.match_id=e.match_id
          and s.event_type='pregame_sync'
          and s.scheduled_for=e.scheduled_for
          and s.status<>'ok'
      )
  ) then
    r := afl.final_prediction_tick();
    out := out || jsonb_build_object('final_freeze',r);
    if coalesce((r->>'frozen')::integer,0)>0 then
      public_refresh_needed := true;
      availability_refresh_needed := true;
    end if;
  end if;

  if afl_source.stats_work_needed() then
    r := afl_source.stats_tick();
    out := out || jsonb_build_object('stats',r);
    public_refresh_needed := true;
    availability_refresh_needed := true;
  end if;

  if exists (
    select 1
    from afl.workflow_events e
    where e.event_type='postmatch_settle'
      and e.status='pending'
      and coalesce(e.next_attempt_at,e.scheduled_for)<=now()
      and e.attempt<e.max_attempts
      and exists(
        select 1 from afl.final_prediction_snapshots fps
        where fps.match_id=e.match_id and fps.model_ready=true
      )
  ) then
    r := afl.postmatch_tick();
    out := out || jsonb_build_object('postmatch',r);
    if coalesce((r->>'settled')::integer,0)>0 then
      public_refresh_needed := true;
      availability_refresh_needed := true;
    end if;
  end if;

  if has_active_window
     or (extract(isodow from mel_now)=2 and extract(hour from mel_now)=8)
     or exists(select 1 from afl_source.injury_sync_requests where status='requested')
  then
    r := afl_source.injury_sync_tick();
    out := out || jsonb_build_object('injury_sync',r);
  end if;

  if exists(select 1 from afl_source.injury_sync_requests where status='requested') then
    r := afl_source.collect_injury_sync();
    out := out || jsonb_build_object('injury_collect',r);
  end if;

  if exists (
    select 1
    from afl.workflow_events e
    join afl.matches m on m.id=e.match_id
    where e.event_type='pregame_sync'
      and coalesce((e.metadata->>'offset_minutes')::integer,0)=-30
      and e.status='ok'
      and e.completed_at is not null
      and not (e.metadata ? 'late_lineup_delta_error')
      and m.start_time > now()-interval '3 hours'
      and exists(select 1 from afl.final_prediction_snapshots f where f.match_id=e.match_id)
      and not exists(select 1 from afl.late_lineup_deltas d where d.match_id=e.match_id)
  ) then
    r := afl.late_lineup_delta_tick();
    out := out || jsonb_build_object('late_lineup_delta',r);
    if coalesce(r->>'status','')='captured' then
      public_refresh_needed := true;
    end if;
  end if;

  if exists (
    select 1 from afl.matches m
    where m.start_time>now()-interval '7 days'
      and exists(select 1 from afl.final_prediction_snapshots s where s.match_id=m.id)
      and (
        (m.start_time+interval '210 minutes'<=now() and (m.status<>'final' or m.home_score is null or m.away_score is null))
        or
        (m.start_time+interval '8 hours'<=now() and not exists(select 1 from public.afl_api_match_reviews v where v.match_id=m.id and v.status='verified'))
      )
  ) then
    r := afl.review_tick();
    out := out || jsonb_build_object('review',r);
  end if;

  -- Backstop for changes created outside this tick. Only model/public-facing
  -- workflow completions should trigger the expensive projection refresh.
  if exists (
    select 1 from afl.workflow_events
    where status='ok'
      and event_type in ('fixtures_sync','pregame_sync','final_prediction')
      and completed_at > coalesce(last_public_refresh,'epoch'::timestamptz)
  ) then
    public_refresh_needed := true;
  end if;

  if exists (
    select 1 from afl.injuries
    where updated_at > coalesce(last_availability_refresh,'epoch'::timestamptz)
  )
  or exists (
    select 1 from afl_source.stats_jobs
    where status='ok' and updated_at > coalesce(last_availability_refresh,'epoch'::timestamptz)
  ) then
    availability_refresh_needed := true;
  end if;

  if (
    last_availability_refresh is null
    or last_availability_refresh < now()-interval '12 hours'
  ) and exists (
    select 1 from afl.matches
    where status in ('scheduled','postponed')
      and start_time between now() and now()+interval '14 days'
  ) then
    availability_refresh_needed := true;
  end if;

  if public_refresh_needed then
    r := afl.refresh_public_api_projection();
    out := out || jsonb_build_object('public_api',r);
    r := afl.refresh_public_match_context();
    out := out || jsonb_build_object('public_context',r);
  end if;

  if availability_refresh_needed then
    r := afl.refresh_public_availability();
    out := out || jsonb_build_object('public_availability',r);
  end if;

  r := afl.v21_validation_tick();
  if coalesce((r->>'captured')::integer,0)>0 or coalesce((r->>'settled')::integer,0)>0 then
    out := out || jsonb_build_object('v21_validation',r);
  end if;

  return jsonb_build_object(
    'status','ok',
    'active_match_window',has_active_window,
    'public_refresh_needed',public_refresh_needed,
    'availability_refresh_needed',availability_refresh_needed,
    'expired_final_events',expired_final_events,
    'actions',out
  );
end;
$function$


CREATE OR REPLACE FUNCTION afl.ingest_injury_report(p_source text, p_reported_at timestamp with time zone, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  item jsonb;
  pid uuid;
  team_uuid uuid;
  n int:=0;
  skipped int:=0;
  placeholders_created int:=0;
  rec boolean;
  existing_id uuid;
  existed_before boolean;
  player_name text;
  team_name text;
begin
  insert into afl.injury_report_snapshots(source,reported_at,payload)
  values(p_source,p_reported_at,p_payload)
  on conflict(source,reported_at) do update set payload=excluded.payload;

  for item in
    select value from jsonb_array_elements(coalesce(p_payload,'[]'::jsonb))
  loop
    player_name:=nullif(trim(item->>'player'),'');
    team_name:=nullif(trim(item->>'team_name'),'');

    if player_name is null then
      skipped:=skipped+1;
      continue;
    end if;

    team_uuid:=null;
    if team_name is not null then
      select t.id into team_uuid
      from afl.teams t
      where lower(t.name)=lower(team_name)
      limit 1;
    end if;

    select exists(
      select 1 from afl.players p
      where lower(p.name)=lower(player_name)
        and (team_uuid is null or p.team_id=team_uuid)
    ) into existed_before;

    if team_uuid is not null then
      pid:=afl_source.resolve_player_identity(null,team_uuid,player_name);
    else
      select p.id into pid
      from afl.players p
      where lower(p.name)=lower(player_name)
      order by p.active desc,p.updated_at desc
      limit 1;
    end if;

    if pid is null then
      skipped:=skipped+1;
      continue;
    end if;

    if not existed_before and team_uuid is not null then
      placeholders_created:=placeholders_created+1;
    end if;

    rec:=coalesce((item->>'tog_recovery_required')::boolean,true);

    select id into existing_id
    from afl.injuries
    where player_id=pid and active=true and source=p_source
    order by updated_at desc
    limit 1;

    if existing_id is null then
      insert into afl.injuries(
        player_id,injury_type,status,occurred_at,expected_return,
        tog_recovery_required,notes,source,active,updated_at
      )
      values(
        pid,item->>'injury',coalesce(item->>'status','reported'),
        p_reported_at,item->>'estimated_return',rec,
        item->>'notes',p_source,true,now()
      );
    else
      update afl.injuries
      set injury_type=item->>'injury',
          status=coalesce(item->>'status','reported'),
          expected_return=item->>'estimated_return',
          tog_recovery_required=rec,
          notes=item->>'notes',
          updated_at=now()
      where id=existing_id;
    end if;

    n:=n+1;
  end loop;

  perform afl.refresh_player_availability();

  return jsonb_build_object(
    'status','ok',
    'ingested',n,
    'unmatched_players',skipped,
    'placeholders_created',placeholders_created
  );
end;
$function$


CREATE OR REPLACE FUNCTION afl.pregame_fast_tick()
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  c jsonb;
  s jsonb;
  f jsonb;
  d jsonb;
  v jsonb;
  refreshed jsonb;
  pub jsonb;
  ctx jsonb;
  relevant boolean:=false;
  completed_recent boolean:=false;
  lineup_changed_recent boolean:=false;
  should_refresh_public boolean:=false;
begin
  select
    exists(
      select 1
      from afl.matches m
      where m.status in ('scheduled','postponed')
        and m.start_time between now()+interval '20 minutes' and now()+interval '5 hours'
    )
    or exists(
      select 1
      from afl_source.requests q
      where q.request_type in ('lineup_token','lineup_roster')
        and q.status='pending'
    )
    or exists(
      select 1
      from afl.workflow_events e
      where e.event_type in ('pregame_sync','final_prediction')
        and e.status='pending'
        and coalesce(e.next_attempt_at,e.scheduled_for)<=now()
        and e.scheduled_for>now()-interval '90 minutes'
    )
  into relevant;

  if not relevant then
    return jsonb_build_object('status','idle');
  end if;

  if exists(
    select 1
    from afl_source.requests q
    where q.request_type in ('lineup_token','lineup_roster')
      and q.status='pending'
      and (
        exists(select 1 from net._http_response h where h.id=q.request_id)
        or q.requested_at<now()-interval '10 minutes'
      )
  ) then
    c:=afl_source.collect_lineup_responses();
  end if;

  if exists(
    select 1
    from afl.workflow_events e
    where e.event_type='pregame_sync'
      and e.status='pending'
      and coalesce(e.next_attempt_at,e.scheduled_for)<=now()
      and e.attempt<e.max_attempts
      and e.scheduled_for>now()-interval '90 minutes'
  ) then
    s:=afl_source.start_lineup_requests(2);
  end if;

  select
    exists(
      select 1 from afl.workflow_events e
      where e.event_type='pregame_sync'
        and e.status='ok'
        and e.completed_at>now()-interval '5 minutes'
    ),
    exists(
      select 1 from afl.workflow_events e
      where e.event_type='pregame_sync'
        and e.status='ok'
        and e.completed_at>now()-interval '5 minutes'
        and coalesce((e.metadata#>>'{lineup,changed}')::boolean,true)
    )
  into completed_recent,lineup_changed_recent;

  if completed_recent then
    refreshed:=afl.refresh_upcoming_predictions();
    if coalesce((refreshed->>'refreshed')::integer,0)>0 or lineup_changed_recent then
      should_refresh_public:=true;
    end if;
  end if;

  if exists(
    select 1
    from afl.workflow_events e
    join afl.matches m on m.id=e.match_id
    where e.event_type='final_prediction'
      and e.status='pending'
      and coalesce(e.next_attempt_at,e.scheduled_for)<=now()
      and e.attempt<e.max_attempts
      and m.start_time>now()
      and not exists(
        select 1
        from afl.workflow_events p
        where p.match_id=e.match_id
          and p.event_type='pregame_sync'
          and p.scheduled_for=e.scheduled_for
          and p.status not in ('ok','completed')
      )
  ) then
    f:=afl.final_prediction_tick();
    if coalesce((f->>'frozen')::integer,0)>0 then
      should_refresh_public:=true;
    end if;
  end if;

  if exists(
    select 1
    from afl.workflow_events e
    join afl.matches m on m.id=e.match_id
    where e.event_type='pregame_sync'
      and coalesce((e.metadata->>'offset_minutes')::integer,0)=-30
      and e.status='ok'
      and e.completed_at is not null
      and m.start_time>now()-interval '60 minutes'
      and exists(select 1 from afl.final_prediction_snapshots x where x.match_id=e.match_id)
      and not exists(select 1 from afl.late_lineup_deltas x where x.match_id=e.match_id)
  ) then
    d:=afl.late_lineup_delta_tick();
    v:=afl.v21_validation_tick();
  end if;

  if should_refresh_public then
    pub:=afl.refresh_public_api_projection();
    ctx:=afl.refresh_public_match_context();
  end if;

  return jsonb_build_object(
    'status','ok',
    'collect',coalesce(c,'{}'::jsonb),
    'start',coalesce(s,'{}'::jsonb),
    'prediction_refresh',coalesce(refreshed,'{}'::jsonb),
    'final_freeze',coalesce(f,'{}'::jsonb),
    'late_delta',coalesce(d,'{}'::jsonb),
    'v21',coalesce(v,'{}'::jsonb),
    'public_refreshed',should_refresh_public
  );
end;
$function$


CREATE OR REPLACE FUNCTION afl.reconcile_injury_report(p_source text, p_reported_at timestamp with time zone, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  ingest_result jsonb;
  removed_missing int:=0;
  recovered_tog int:=0;
  suspended_rows int:=0;
  superseded_rows int:=0;
begin
  ingest_result:=afl.ingest_injury_report(p_source,p_reported_at,p_payload);

  -- The newest official AFL source becomes canonical for any player it contains.
  -- Older AFL.com.au-derived rows remain for audit history but are no longer active.
  update afl.injuries old
  set active=false,
      status='superseded_source',
      updated_at=now(),
      notes=coalesce(old.notes,'') ||
        case when coalesce(old.notes,'')='' then '' else ' | ' end ||
        'Superseded by '||p_source
  where old.active=true
    and old.source<>p_source
    and old.source ilike 'afl.com.au%'
    and exists(
      select 1
      from afl.injuries cur
      where cur.player_id=old.player_id
        and cur.source=p_source
        and cur.active=true
    );
  get diagnostics superseded_rows=row_count;

  update afl.injuries i
  set active=false,status='suspended',tog_recovery_required=false,updated_at=now()
  where i.source=p_source and lower(coalesce(i.injury_type,''))='suspended';
  get diagnostics suspended_rows=row_count;

  update afl.injuries i
  set status='removed_from_current_list',updated_at=now()
  where i.source=p_source
    and i.active=true
    and not exists(
      select 1
      from jsonb_array_elements(coalesce(p_payload,'[]'::jsonb)) x
      join afl.players p on lower(p.name)=lower(x->>'player')
      where p.id=i.player_id
    )
    and i.status<>'removed_from_current_list';
  get diagnostics removed_missing=row_count;

  perform afl.refresh_player_availability();

  update afl.injuries i
  set active=false,status='recovered_tog',updated_at=now()
  from afl.player_availability_state a
  where i.player_id=a.player_id
    and i.source=p_source
    and i.active=true
    and i.status='removed_from_current_list'
    and i.tog_recovery_required=true
    and a.recovery_streak>=2;
  get diagnostics recovered_tog=row_count;

  if recovered_tog>0 or suspended_rows>0 or superseded_rows>0 then
    perform afl.refresh_player_availability();
  end if;

  perform afl.refresh_public_availability();

  return jsonb_build_object(
    'status','ok',
    'ingest',ingest_result,
    'superseded_older_sources',superseded_rows,
    'suspensions_excluded',suspended_rows,
    'removed_from_current_list',removed_missing,
    'recovered_tog',recovered_tog
  );
end;
$function$


CREATE OR REPLACE FUNCTION afl.refresh_upcoming_predictions()
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare r record; result jsonb; refreshed integer:=0; skipped integer:=0; obs jsonb;
begin
  for r in
    with due as (
      select m.id,m.updated_at,
             e.id latest_event_id,
             e.completed_at latest_sync_completed,
             coalesce((e.metadata#>>'{lineup,changed}')::boolean,true) lineup_changed,
             (select max(pr.generated_at)
              from afl.prediction_runs pr
              where pr.match_id=m.id and pr.is_final=false) latest_preview
      from afl.matches m
      join lateral (
        select we.id,we.completed_at,we.metadata
        from afl.workflow_events we
        where we.match_id=m.id
          and we.event_type='pregame_sync'
          and we.status in ('ok','completed')
        order by we.completed_at desc nulls last,we.id desc
        limit 1
      ) e on true
      where m.status='scheduled'
        and m.start_time>pg_catalog.now()+interval '30 minutes'
        and m.start_time<=pg_catalog.now()+interval '4 hours 5 minutes'
        and exists(select 1 from afl.match_players mp where mp.match_id=m.id)
        and not exists(
          select 1
          from afl.workflow_events f
          where f.match_id=m.id
            and f.event_type='final_prediction'
            and f.status='pending'
            and coalesce(f.next_attempt_at,f.scheduled_for)<=pg_catalog.now()
        )
    )
    select *
    from due
    where latest_sync_completed is not null
      and latest_sync_completed<=pg_catalog.now()-interval '30 seconds'
      and (
        latest_preview is null
        or updated_at>latest_preview
        or (lineup_changed and latest_preview<latest_sync_completed)
      )
  loop
    result:=afl.generate_baseline_prediction_run(r.id,false);
    if result->>'status'='generated' then
      refreshed:=refreshed+1;
      obs:=afl.record_live_shadow_observation(
        r.id,(result->>'prediction_run_id')::uuid,'pregame_sync',r.latest_event_id
      );
    else
      skipped:=skipped+1;
    end if;
  end loop;

  return jsonb_build_object(
    'status','ok','refreshed',refreshed,'skipped',skipped,
    'mode','change_driven_pregame_sync_no_duplicate_final',
    'observation_logging',true
  );
end;
$function$


CREATE OR REPLACE FUNCTION afl.weekly_validation_tick()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  dep jsonb;
  pubdep jsonb;
  s jsonb;
  w jsonb;
  mw jsonb;
  d jsonb;
  maintenance jsonb;
begin
  dep:=afl.refresh_market_dependency_profiles();
  pubdep:=afl.refresh_public_dependency_profiles();
  s:=afl.run_shadow_validation(30);
  w:=afl.run_module_weight_search();
  mw:=afl.run_market_module_weight_search();
  d:=afl.refresh_validation_dashboard();
  maintenance:=afl.cleanup_cron_history();

  return jsonb_build_object(
    'status','ok',
    'dependency',dep,
    'public_dependency',pubdep,
    'shadow',s,
    'weight_search',w,
    'market_weight_search',mw,
    'dashboard',d,
    'maintenance',maintenance
  );
end;
$function$


CREATE OR REPLACE FUNCTION afl_source.apply_previous_lineup_fallback(p_match_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  cur record;
  team_uuid uuid;
  prev_match uuid;
  copied integer:=0;
  team_copied integer;
begin
  select id,start_time,home_team_id,away_team_id into cur
  from afl.matches where id=p_match_id;
  if cur.id is null then raise exception 'Match not found'; end if;

  delete from afl.match_players
  where match_id=p_match_id and confirmed=false;

  foreach team_uuid in array array[cur.home_team_id,cur.away_team_id]
  loop
    select m.id into prev_match
    from afl.matches m
    where m.start_time<cur.start_time
      and (m.home_team_id=team_uuid or m.away_team_id=team_uuid)
      and exists(
        select 1 from afl.match_players mp
        where mp.match_id=m.id and mp.team_id=team_uuid and mp.confirmed=true
      )
    order by m.start_time desc
    limit 1;

    if prev_match is not null then
      insert into afl.match_players(
        match_id,player_id,team_id,named_position,bench,emergency,confirmed,source_updated_at
      )
      select p_match_id,mp.player_id,mp.team_id,mp.named_position,mp.bench,mp.emergency,false,now()
      from afl.match_players mp
      where mp.match_id=prev_match and mp.team_id=team_uuid
      on conflict(match_id,player_id) do update set
        team_id=excluded.team_id,
        named_position=excluded.named_position,
        bench=excluded.bench,
        emergency=excluded.emergency,
        confirmed=false,
        source_updated_at=excluded.source_updated_at;
      get diagnostics team_copied=row_count;
      copied:=copied+team_copied;
    end if;
  end loop;

  update afl.pregame_state
  set state=jsonb_set(
        jsonb_set(coalesce(state,'{}'::jsonb),
          '{lineup,fallback_players_written}',to_jsonb(copied),true),
        '{lineup,fallback_previous_lineup}','true'::jsonb,true
      ),
      source_snapshot_at=now(),
      updated_at=now()
  where match_id=p_match_id;

  return jsonb_build_object(
    'fallback_players_written',copied,
    'source_snapshot_refreshed',true
  );
end;
$function$


CREATE OR REPLACE FUNCTION afl_source.ingest_lineup_payload(p_match_id uuid, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  home_status text; away_status text; home_count integer; away_count integer; confirmed boolean;
  home_team uuid; away_team uuid; rec record; pid uuid; inserted_count integer:=0;
  fallback_result jsonb; state_result jsonb; payload_changed boolean;
  existing_count integer:=0;
  ext_id text;
  full_name text;
begin
  home_status:=p_payload#>>'{matchRoster,homeTeam,teamStatus}';
  away_status:=p_payload#>>'{matchRoster,awayTeam,teamStatus}';
  home_count:=jsonb_array_length(coalesce(p_payload#>'{matchRoster,homeTeam,positions}','[]'::jsonb));
  away_count:=jsonb_array_length(coalesce(p_payload#>'{matchRoster,awayTeam,positions}','[]'::jsonb));
  confirmed:=home_status='FINAL_TEAM' and away_status='FINAL_TEAM' and home_count>0 and away_count>0;

  state_result:=afl_source.record_lineup_state(p_match_id,p_payload);
  payload_changed:=coalesce((state_result->>'changed')::boolean,true);

  if not confirmed then
    select count(*) into existing_count
    from afl.match_players
    where match_id=p_match_id and confirmed=false;

    if not payload_changed and existing_count>0 then
      return jsonb_build_object(
        'confirmed',false,'home_status',home_status,'away_status',away_status,
        'home_positions',home_count,'away_positions',away_count,
        'fallback_previous_lineup',true,'players_written',0,
        'fallback_players_written',existing_count,'changed',false,
        'write_mode','no_change'
      );
    end if;

    fallback_result:=afl_source.apply_previous_lineup_fallback(p_match_id);
    return jsonb_build_object(
      'confirmed',false,'home_status',home_status,'away_status',away_status,
      'home_positions',home_count,'away_positions',away_count,
      'fallback_previous_lineup',true,'players_written',0,
      'fallback_players_written',coalesce((fallback_result->>'fallback_players_written')::integer,0),
      'changed',payload_changed,'write_mode','fallback_refresh'
    );
  end if;

  select count(*) into existing_count
  from afl.match_players
  where match_id=p_match_id and confirmed=true;

  if not payload_changed and existing_count>0 then
    return jsonb_build_object(
      'confirmed',true,'home_status',home_status,'away_status',away_status,
      'home_positions',home_count,'away_positions',away_count,
      'fallback_previous_lineup',false,'players_written',0,
      'existing_players',existing_count,'changed',false,
      'write_mode','no_change'
    );
  end if;

  select m.home_team_id,m.away_team_id into home_team,away_team
  from afl.matches m where m.id=p_match_id;
  if home_team is null or away_team is null then
    raise exception 'Match teams not found';
  end if;

  delete from afl.match_players where match_id=p_match_id;

  for rec in
    select home_team team_id,x item
    from jsonb_array_elements(p_payload#>'{matchRoster,homeTeam,positions}') x
    union all
    select away_team team_id,x item
    from jsonb_array_elements(p_payload#>'{matchRoster,awayTeam,positions}') x
  loop
    ext_id:=nullif(rec.item#>>'{player,playerId}','');
    if ext_id is null then continue; end if;

    full_name:=trim(
      coalesce(rec.item#>>'{player,playerName,givenName}','')||' '||
      coalesce(rec.item#>>'{player,playerName,surname}','')
    );

    pid:=afl_source.resolve_player_identity(ext_id,rec.team_id,full_name);

    insert into afl.match_players(
      match_id,player_id,team_id,named_position,bench,emergency,confirmed,source_updated_at
    )
    values(
      p_match_id,pid,rec.team_id,rec.item->>'position',
      rec.item->>'position'='INT',rec.item->>'position'='EMERG',true,now()
    )
    on conflict(match_id,player_id) do update set
      team_id=excluded.team_id,
      named_position=excluded.named_position,
      bench=excluded.bench,
      emergency=excluded.emergency,
      confirmed=true,
      source_updated_at=excluded.source_updated_at;

    inserted_count:=inserted_count+1;
  end loop;

  update afl.pregame_state
  set state=jsonb_set(
        jsonb_set(coalesce(state,'{}'::jsonb),'{lineup,players_written}',to_jsonb(inserted_count),true),
        '{lineup,fallback_players_written}','0'::jsonb,true
      ),
      source_snapshot_at=now(),
      updated_at=now()
  where match_id=p_match_id;

  return jsonb_build_object(
    'confirmed',true,'home_status',home_status,'away_status',away_status,
    'home_positions',home_count,'away_positions',away_count,
    'fallback_previous_lineup',false,'players_written',inserted_count,
    'fallback_players_written',0,'changed',true,'write_mode','full_refresh'
  );
end;
$function$


CREATE OR REPLACE FUNCTION afl_source.ingest_player_stats_payload(p_match_id uuid, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  rec record; pid uuid; team_uuid uuid; written integer:=0; side text;
  ext_player_id text; player_name text; team_provider text;
begin
  for rec in
    select 'home'::text side,x item
    from jsonb_array_elements(coalesce(p_payload->'homeTeamPlayerStats','[]'::jsonb)) x
    union all
    select 'away'::text side,x item
    from jsonb_array_elements(coalesce(p_payload->'awayTeamPlayerStats','[]'::jsonb)) x
  loop
    side:=rec.side;
    ext_player_id:=coalesce(
      rec.item#>>'{player,player,player,playerId}',
      rec.item#>>'{playerStats,player,playerId}'
    );
    player_name:=trim(
      coalesce(
        rec.item#>>'{player,player,player,playerName,givenName}',
        rec.item#>>'{playerStats,player,playerName,givenName}',''
      )||' '||
      coalesce(
        rec.item#>>'{player,player,player,playerName,surname}',
        rec.item#>>'{playerStats,player,playerName,surname}',''
      )
    );
    team_provider:=coalesce(rec.item->>'teamId',rec.item#>>'{playerStats,teamId}');
    if coalesce(ext_player_id,'')='' then continue; end if;

    select t.id into team_uuid
    from afl.teams t
    where t.external_id=team_provider
    limit 1;

    if team_uuid is null then
      select case when side='home' then m.home_team_id else m.away_team_id end
      into team_uuid
      from afl.matches m
      where m.id=p_match_id;
    end if;

    pid:=afl_source.resolve_player_identity(
      ext_player_id,
      team_uuid,
      coalesce(nullif(player_name,''),ext_player_id)
    );

    insert into afl.player_game_stats(
      match_id,player_id,disposals,kicks,handballs,marks,tackles,goals,behinds,hitouts,
      clearances,fantasy_points,tog_pct,intercepts,inside50s,contested_possessions,
      uncontested_possessions,metres_gained,centre_clearances,stoppage_clearances,
      pressure_acts,score_involvements,disposal_efficiency,hitouts_to_advantage,source_updated_at
    )
    values(
      p_match_id,pid,
      nullif(rec.item#>>'{playerStats,stats,disposals}','')::numeric::integer,
      nullif(rec.item#>>'{playerStats,stats,kicks}','')::numeric::integer,
      nullif(rec.item#>>'{playerStats,stats,handballs}','')::numeric::integer,
      nullif(rec.item#>>'{playerStats,stats,marks}','')::numeric::integer,
      nullif(rec.item#>>'{playerStats,stats,tackles}','')::numeric::integer,
      nullif(rec.item#>>'{playerStats,stats,goals}','')::numeric::integer,
      nullif(rec.item#>>'{playerStats,stats,behinds}','')::numeric::integer,
      nullif(rec.item#>>'{playerStats,stats,hitouts}','')::numeric::integer,
      nullif(rec.item#>>'{playerStats,stats,clearances,totalClearances}','')::numeric::integer,
      nullif(rec.item#>>'{playerStats,stats,dreamTeamPoints}','')::numeric,
      nullif(rec.item#>>'{playerStats,timeOnGroundPercentage}','')::numeric,
      nullif(rec.item#>>'{playerStats,stats,intercepts}','')::numeric::integer,
      nullif(rec.item#>>'{playerStats,stats,inside50s}','')::numeric::integer,
      nullif(rec.item#>>'{playerStats,stats,contestedPossessions}','')::numeric::integer,
      nullif(rec.item#>>'{playerStats,stats,uncontestedPossessions}','')::numeric::integer,
      nullif(rec.item#>>'{playerStats,stats,metresGained}','')::numeric,
      nullif(rec.item#>>'{playerStats,stats,clearances,centreClearances}','')::numeric::integer,
      nullif(rec.item#>>'{playerStats,stats,clearances,stoppageClearances}','')::numeric::integer,
      nullif(rec.item#>>'{playerStats,stats,extendedStats,pressureActs}','')::numeric::integer,
      nullif(rec.item#>>'{playerStats,stats,scoreInvolvements}','')::numeric::integer,
      nullif(rec.item#>>'{playerStats,stats,disposalEfficiency}','')::numeric,
      nullif(rec.item#>>'{playerStats,stats,extendedStats,hitoutsToAdvantage}','')::numeric::integer,
      now()
    )
    on conflict(match_id,player_id) do update set
      disposals=excluded.disposals,kicks=excluded.kicks,handballs=excluded.handballs,
      marks=excluded.marks,tackles=excluded.tackles,goals=excluded.goals,behinds=excluded.behinds,
      hitouts=excluded.hitouts,clearances=excluded.clearances,fantasy_points=excluded.fantasy_points,
      tog_pct=excluded.tog_pct,intercepts=excluded.intercepts,inside50s=excluded.inside50s,
      contested_possessions=excluded.contested_possessions,
      uncontested_possessions=excluded.uncontested_possessions,
      metres_gained=excluded.metres_gained,centre_clearances=excluded.centre_clearances,
      stoppage_clearances=excluded.stoppage_clearances,pressure_acts=excluded.pressure_acts,
      score_involvements=excluded.score_involvements,
      disposal_efficiency=excluded.disposal_efficiency,
      hitouts_to_advantage=excluded.hitouts_to_advantage,
      source_updated_at=excluded.source_updated_at;

    written:=written+1;
  end loop;

  insert into afl.review_data_status(match_id,stats_complete,stats_received_at)
  values(
    p_match_id,
    jsonb_array_length(coalesce(p_payload->'homeTeamPlayerStats','[]'))>=22
      and jsonb_array_length(coalesce(p_payload->'awayTeamPlayerStats','[]'))>=22,
    now()
  )
  on conflict(match_id) do update set
    stats_complete=excluded.stats_complete,
    stats_received_at=excluded.stats_received_at;

  return jsonb_build_object('status','ok','rows_written',written);
end;
$function$


CREATE OR REPLACE FUNCTION afl_source.injury_sync_tick()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  local_ts timestamp;
  slot text;
  due_label text;
  target_match uuid;
  target_external text;
  mins_to_start numeric;
  req jsonb;
  col jsonb;
  recent_same_failures integer:=0;
  latest_failure timestamptz;
begin
  local_ts:=now() at time zone 'Australia/Melbourne';

  col:=afl_source.collect_injury_sync();

  if extract(isodow from local_ts)=2
     and extract(hour from local_ts)=8
     and exists(select 1 from afl.matches m where m.status='scheduled' and m.start_time>now())
  then
    slot:='tuesday-'||to_char(local_ts,'YYYY-MM-DD');
  else
    select m.id,m.external_id,extract(epoch from (m.start_time-now()))/60.0
    into target_match,target_external,mins_to_start
    from afl.matches m
    where m.status='scheduled'
      and m.start_time between now()+interval '25 minutes' and now()+interval '4 hours 5 minutes'
    order by m.start_time
    limit 1;

    if target_match is null then
      return jsonb_build_object('status','not_due','collector',col);
    end if;

    if mins_to_start between 180 and 245 then
      due_label:='T240';
    elsif mins_to_start between 30 and 90 then
      due_label:='T60';
    else
      return jsonb_build_object(
        'status','not_due',
        'collector',col,
        'minutes_to_match',round(mins_to_start,1),
        'policy','T240_and_T60_only'
      );
    end if;

    slot:='match-'||target_external||'-'||due_label;

    select
      count(*) filter(
        where status='failed'
          and coalesce(error_message,'') ilike 'Could not discover latest AFL injury article%'
      )::int,
      max(requested_at)
    into recent_same_failures,latest_failure
    from (
      select status,error_message,requested_at
      from afl_source.injury_sync_requests
      order by requested_at desc
      limit 3
    ) z;

    if recent_same_failures>=3 and latest_failure>now()-interval '12 hours' then
      return jsonb_build_object(
        'status','circuit_open',
        'collector',col,
        'cooldown_hours',12,
        'reason','three consecutive injury-source discovery failures',
        'next_slot',slot
      );
    end if;
  end if;

  req:=afl_source.request_injury_sync(slot);
  return jsonb_build_object(
    'status','ok',
    'request',req,
    'collector',col,
    'slot',slot,
    'policy','tuesday_plus_T240_T60_v68'
  );
end;
$function$


CREATE OR REPLACE FUNCTION afl_source.record_lineup_state(p_match_id uuid, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  home_status text;
  away_status text;
  home_count integer;
  away_count integer;
  confirmed boolean;
  payload_hash text;
  old_hash text;
  changed boolean;
  new_lineup jsonb;
begin
  home_status:=p_payload#>>'{matchRoster,homeTeam,teamStatus}';
  away_status:=p_payload#>>'{matchRoster,awayTeam,teamStatus}';
  home_count:=jsonb_array_length(coalesce(p_payload#>'{matchRoster,homeTeam,positions}','[]'::jsonb));
  away_count:=jsonb_array_length(coalesce(p_payload#>'{matchRoster,awayTeam,positions}','[]'::jsonb));
  confirmed:=home_status='FINAL_TEAM' and away_status='FINAL_TEAM' and home_count>0 and away_count>0;

  payload_hash:=md5(jsonb_build_object(
    'home_status',home_status,
    'away_status',away_status,
    'home_positions',coalesce(p_payload#>'{matchRoster,homeTeam,positions}','[]'::jsonb),
    'away_positions',coalesce(p_payload#>'{matchRoster,awayTeam,positions}','[]'::jsonb)
  )::text);

  select state#>>'{lineup,payload_hash}' into old_hash
  from afl.pregame_state
  where match_id=p_match_id;

  changed:=old_hash is distinct from payload_hash;

  new_lineup:=jsonb_build_object(
    'home_status',home_status,
    'away_status',away_status,
    'home_positions',home_count,
    'away_positions',away_count,
    'confirmed',confirmed,
    'fallback_previous_lineup',not confirmed,
    'source','api.afl.com.au/cfs/afl/matchRoster/full',
    'payload_hash',payload_hash,
    'changed',changed,
    'last_checked_at',now()
  );

  insert into afl.pregame_state(match_id,state,source_snapshot_at,updated_at)
  values(
    p_match_id,
    jsonb_build_object('lineup',new_lineup),
    now(),now()
  )
  on conflict(match_id) do update set
    state=jsonb_set(
      coalesce(afl.pregame_state.state,'{}'::jsonb),
      '{lineup}',
      coalesce(afl.pregame_state.state->'lineup','{}'::jsonb) || new_lineup,
      true
    ),
    source_snapshot_at=excluded.source_snapshot_at,
    updated_at=now();

  return jsonb_build_object(
    'home_status',home_status,'away_status',away_status,
    'home_positions',home_count,'away_positions',away_count,
    'confirmed',confirmed,'fallback_previous_lineup',not confirmed,
    'payload_hash',payload_hash,'changed',changed
  );
end;
$function$


CREATE OR REPLACE FUNCTION afl_source.resolve_player_identity(p_external_id text, p_team_id uuid, p_name text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id uuid;
  v_name text:=nullif(trim(p_name),'');
  v_external text:=nullif(trim(p_external_id),'');
begin
  if v_name is null and v_external is null then
    return null;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      coalesce(p_team_id::text,'')||'|'||lower(coalesce(v_name,v_external,'')),
      0
    )
  );

  if v_external is not null then
    select p.id into v_id
    from afl.players p
    where p.external_id=v_external
    limit 1;

    if v_id is not null then
      update afl.players
      set team_id=coalesce(p_team_id,team_id),
          name=coalesce(v_name,name),
          active=true,
          updated_at=case
            when team_id is distinct from coalesce(p_team_id,team_id)
              or name is distinct from coalesce(v_name,name)
              or active is distinct from true
            then now() else updated_at end
      where id=v_id;
      return v_id;
    end if;
  end if;

  if v_name is not null and p_team_id is not null then
    select p.id into v_id
    from afl.players p
    where p.team_id=p_team_id
      and lower(p.name)=lower(v_name)
    order by (p.external_id is null) desc,p.updated_at desc
    limit 1
    for update;

    if v_id is not null then
      if v_external is not null then
        update afl.players
        set external_id=v_external,
            name=v_name,
            active=true,
            updated_at=now()
        where id=v_id and external_id is null;
      end if;
      return v_id;
    end if;
  end if;

  insert into afl.players(external_id,team_id,name,active,updated_at)
  values(v_external,p_team_id,coalesce(v_name,v_external),true,now())
  returning id into v_id;

  return v_id;
exception
  when unique_violation then
    select p.id into v_id
    from afl.players p
    where p.external_id=v_external
    limit 1;
    return v_id;
end;
$function$


-- Idempotent cron registration. Existing job name is replaced/upserted by pg_cron.
select cron.schedule(
  'afl-pregame-fast-finalizer',
  '*/2 * * * *',
  'select afl.pregame_fast_tick();'
);
