-- AFL Match Lab v68 — Sync & Resource Optimization
-- Production-deployed 2026-09-20.
--
-- Goals:
-- - event-driven score -> next-fixture dependency refresh
-- - lineup sync keyframes only: T-240/T-120/T-60/T-30
-- - lineup fingerprint: unchanged payload = no roster rewrite / no prediction refresh
-- - fixture ingest: unchanged fixtures = no DB rewrite / no workflow replan
-- - stats self-heal: collect arrived responses and stale running claims
-- - injury sync circuit breaker + T-240/T-60 only
-- - scoreboard: only changed results written; 60-minute retry TTL
-- - no additional cron job; existing 30-minute master remains the only master scheduler
--
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
    public_refresh_needed := true;
  end if;

  if exists (
    select 1 from afl.workflow_events
    where event_type='pregame_sync'
      and status='ok'
      and completed_at > now()-interval '40 minutes'
  ) then
    r := afl.refresh_upcoming_predictions();
    out := out || jsonb_build_object('model_refresh',r);
    public_refresh_needed := true;
    availability_refresh_needed := true;
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
    availability_refresh_needed := true;
  end if;

  if exists(select 1 from afl_source.injury_sync_requests where status='requested') then
    r := afl_source.collect_injury_sync();
    out := out || jsonb_build_object('injury_collect',r);
    availability_refresh_needed := true;
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


CREATE OR REPLACE FUNCTION afl.plan_workflow()
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  mel_now timestamp;
  next_fixture_local timestamp;
  next_fixture_at timestamptz;
  inserted_fixture integer := 0;
  inserted_match_events integer := 0;
  removed_stale_events integer := 0;
  init_result jsonb;
begin
  mel_now := pg_catalog.now() at time zone 'Australia/Melbourne';
  next_fixture_local := pg_catalog.date_trunc('week', mel_now) + interval '1 day 8 hours';
  if next_fixture_local <= mel_now then
    next_fixture_local := next_fixture_local + interval '7 days';
  end if;
  next_fixture_at := next_fixture_local at time zone 'Australia/Melbourne';

  insert into afl.workflow_events(event_type, scheduled_for, metadata)
  values ('fixtures_sync', next_fixture_at, jsonb_build_object(
    'timezone','Australia/Melbourne','local_time','08:00','source','independent_planner'
  ))
  on conflict do nothing;
  get diagnostics inserted_fixture = row_count;

  init_result := afl.initialize_scheduled_prediction_chains();

  with desired as (
    select m.id match_id,'pregame_sync'::text event_type,m.start_time+x.offset_minutes*interval '1 minute' scheduled_for
    from afl.matches m
    cross join (values(-240),(-120),(-60),(-30)) x(offset_minutes)
    where m.status in ('scheduled','postponed') and m.start_time>pg_catalog.now()-interval '1 day'
    union all
    select m.id,'final_prediction',m.start_time-interval '60 minutes'
    from afl.matches m
    where m.status in ('scheduled','postponed') and m.start_time>pg_catalog.now()-interval '1 day'
    union all
    select m.id,'postmatch_settle',m.start_time+interval '480 minutes'
    from afl.matches m
    where m.status<>'cancelled' and m.start_time>pg_catalog.now()-interval '2 days'
  )
  delete from afl.workflow_events e
  where e.status='pending'
    and e.event_type in ('pregame_sync','final_prediction','postmatch_settle')
    and e.match_id is not null
    and not exists (
      select 1 from desired d
      where d.match_id=e.match_id and d.event_type=e.event_type and d.scheduled_for=e.scheduled_for
    );
  get diagnostics removed_stale_events = row_count;

  with candidate_events as (
    select m.id match_id,'pregame_sync'::text event_type,
           m.start_time+x.offset_minutes*interval '1 minute' scheduled_for,
           jsonb_build_object('offset_minutes',x.offset_minutes,'sync_policy','v68_sparse_keyframes') metadata
    from afl.matches m
    cross join (values(-240),(-120),(-60),(-30)) x(offset_minutes)
    where m.status in ('scheduled','postponed') and m.start_time>pg_catalog.now()-interval '1 day'
    union all
    select m.id,'final_prediction',m.start_time-interval '60 minutes',
           jsonb_build_object('offset_minutes',-60,'freeze',true,'requires_same_slot_sync',true)
    from afl.matches m
    where m.status in ('scheduled','postponed') and m.start_time>pg_catalog.now()-interval '1 day'
    union all
    select m.id,'postmatch_settle',m.start_time+interval '480 minutes',
           jsonb_build_object('offset_minutes',480)
    from afl.matches m
    where m.status<>'cancelled' and m.start_time>pg_catalog.now()-interval '2 days'
  )
  insert into afl.workflow_events(match_id,event_type,scheduled_for,metadata)
  select match_id,event_type,scheduled_for,metadata from candidate_events
  on conflict do nothing;
  get diagnostics inserted_match_events = row_count;

  return jsonb_build_object(
    'status','ok',
    'fixtures_sync_added',inserted_fixture,
    'match_events_added',inserted_match_events,
    'stale_events_removed',removed_stale_events,
    'prediction_chain',init_result,
    'next_fixtures_sync',next_fixture_at,
    'schedule','tuesday-0800-melbourne / fixture-init-preview / T-240,T-120,T-60,T-30 lineup / T-60 final lock / T+480 settlement',
    'lineup_sync_policy','sparse_keyframes_v68'
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
    'mode','change_driven_pregame_sync',
    'observation_logging',true
  );
end;
$function$


CREATE OR REPLACE FUNCTION afl.review_tick()
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  r record;
  x jsonb;
  req bigint;
  n int:=0;
  changed_rows int:=0;
  newly_finalized int:=0;
  fixture_refresh_queued int:=0;
begin
  if not pg_try_advisory_xact_lock(714260980::bigint) then
    return '{"status":"busy"}';
  end if;

  for r in
    select q.request_id,h.status_code,h.content
    from afl_source.requests q
    join net._http_response h on h.id=q.request_id
    where q.request_type='review_scores' and q.status='pending'
  loop
    begin
      if r.status_code<>200 then raise exception 'Scoreboard HTTP %',r.status_code; end if;

      for x in select value from jsonb_array_elements(r.content::jsonb->'matches')
      loop
        if x->>'status'='CONCLUDED'
           and x#>>'{home,score,totalScore}' is not null
           and x#>>'{away,score,totalScore}' is not null
        then
          update afl.matches m
          set status='final',
              home_score=(x#>>'{home,score,totalScore}')::int,
              away_score=(x#>>'{away,score,totalScore}')::int,
              source_updated_at=now(),
              updated_at=now()
          where m.external_id=x->>'id'
            and (
              m.status is distinct from 'final'
              or m.home_score is distinct from (x#>>'{home,score,totalScore}')::int
              or m.away_score is distinct from (x#>>'{away,score,totalScore}')::int
            );
          get diagnostics changed_rows=row_count;

          if changed_rows>0 then
            newly_finalized:=newly_finalized+changed_rows;
            insert into afl.review_data_status(match_id,score_received_at)
            select id,now() from afl.matches where external_id=x->>'id'
            on conflict(match_id) do update set score_received_at=excluded.score_received_at;
          end if;
        end if;
      end loop;

      update afl_source.requests
      set status='ok',completed_at=now(),http_status=r.status_code
      where request_id=r.request_id;
    exception when others then
      update afl_source.requests
      set status='failed',completed_at=now(),error_message=left(sqlerrm,500)
      where request_id=r.request_id;
    end;
  end loop;

  update afl_source.requests
  set status='failed',error_message='Scoreboard response timeout',completed_at=now()
  where request_type='review_scores'
    and status='pending'
    and requested_at<now()-interval '3 minutes';

  if exists(
      select 1
      from afl.matches m
      where m.start_time+interval '210 minutes'<=now()
        and m.start_time>now()-interval '7 days'
        and exists(select 1 from afl.final_prediction_snapshots s where s.match_id=m.id)
        and (m.status<>'final' or m.home_score is null or m.away_score is null)
    )
    and not exists(
      select 1 from afl_source.requests
      where request_type='review_scores'
        and requested_at>now()-interval '60 minutes'
    )
  then
    select net.http_get(
      url:='https://aflapi.afl.com.au/afl/v2/matches?compSeasonId=85&pageSize=1000',
      headers:='{"Accept":"application/json"}',
      timeout_milliseconds:=30000
    ) into req;
    insert into afl_source.requests(request_id,request_type)
    values(req,'review_scores');
  end if;

  if newly_finalized>0
     and exists(
       select 1
       from afl.matches fm
       join afl.teams ht on ht.id=fm.home_team_id
       join afl.teams at on at.id=fm.away_team_id
       where fm.status in ('scheduled','postponed')
         and fm.start_time>now()
         and (
           ht.name~*'^(Winner|Loser) of '
           or at.name~*'^(Winner|Loser) of '
           or coalesce(fm.venue,'') ilike 'To Be Confirmed%'
         )
     )
     and not exists(
       select 1 from afl_source.requests
       where request_type='fixtures'
         and requested_at>now()-interval '30 minutes'
     )
     and not exists(
       select 1 from afl.workflow_events
       where event_type='fixtures_sync'
         and status in ('pending','running')
         and scheduled_for<=now()+interval '60 minutes'
     )
  then
    insert into afl.workflow_events(event_type,scheduled_for,metadata)
    values(
      'fixtures_sync',now(),
      jsonb_build_object(
        'source','postmatch_dependency_resolution',
        'reason','new_final_result_with_future_placeholder'
      )
    )
    on conflict do nothing;
    get diagnostics fixture_refresh_queued=row_count;
  end if;

  for r in
    select m.id,m.start_time
    from afl.matches m
    where m.start_time+interval '10 minutes'<=now()
      and (
        exists(select 1 from afl.workflow_events e where e.match_id=m.id and e.event_type='postmatch_settle')
        or exists(select 1 from afl.final_prediction_snapshots f where f.match_id=m.id)
      )
      and not exists(
        select 1 from public.afl_api_match_reviews v
        where v.match_id=m.id and v.status='verified'
      )
  loop
    if r.start_time+interval '8 hours'<=now()
       and exists(select 1 from afl.final_prediction_snapshots where match_id=r.id)
    then
      if not coalesce((select stats_complete from afl.review_data_status where match_id=r.id),false)
         and r.start_time>now()-interval '7 days'
      then
        perform afl.queue_postmatch_stats(r.id);
      end if;
      if exists(select 1 from afl.matches where id=r.id and status='final') then
        perform afl.settle_match(r.id);
      end if;
    end if;

    perform afl.refresh_match_review(r.id);
    n:=n+1;
  end loop;

  return jsonb_build_object(
    'status','ok',
    'processed',n,
    'newly_finalized',newly_finalized,
    'fixture_refresh_queued',fixture_refresh_queued,
    'score_retry_ttl_minutes',60
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
  if home_team is null or away_team is null then raise exception 'Match teams not found'; end if;

  delete from afl.match_players where match_id=p_match_id;

  for rec in
    select home_team team_id,x item
    from jsonb_array_elements(p_payload#>'{matchRoster,homeTeam,positions}') x
    union all
    select away_team team_id,x item
    from jsonb_array_elements(p_payload#>'{matchRoster,awayTeam,positions}') x
  loop
    if coalesce(rec.item#>>'{player,playerId}','')='' then continue; end if;

    insert into afl.players(external_id,team_id,name,updated_at)
    values(
      rec.item#>>'{player,playerId}',rec.team_id,
      trim(coalesce(rec.item#>>'{player,playerName,givenName}','')||' '||
           coalesce(rec.item#>>'{player,playerName,surname}','')),
      pg_catalog.now()
    )
    on conflict(external_id) do update set
      team_id=excluded.team_id,
      name=excluded.name,
      updated_at=case
        when afl.players.team_id is distinct from excluded.team_id
          or afl.players.name is distinct from excluded.name
        then pg_catalog.now() else afl.players.updated_at end
    returning id into pid;

    insert into afl.match_players(
      match_id,player_id,team_id,named_position,bench,emergency,confirmed,source_updated_at
    )
    values(
      p_match_id,pid,rec.team_id,rec.item->>'position',
      rec.item->>'position'='INT',rec.item->>'position'='EMERG',true,pg_catalog.now()
    )
    on conflict(match_id,player_id) do update set
      team_id=excluded.team_id,named_position=excluded.named_position,
      bench=excluded.bench,emergency=excluded.emergency,
      confirmed=true,source_updated_at=excluded.source_updated_at;

    inserted_count:=inserted_count+1;
  end loop;

  update afl.pregame_state
  set state=jsonb_set(
        jsonb_set(coalesce(state,'{}'::jsonb),'{lineup,players_written}',to_jsonb(inserted_count),true),
        '{lineup,fallback_players_written}','0'::jsonb,true
      ),
      updated_at=pg_catalog.now()
  where match_id=p_match_id;

  return jsonb_build_object(
    'confirmed',true,'home_status',home_status,'away_status',away_status,
    'home_positions',home_count,'away_positions',away_count,
    'fallback_previous_lineup',false,'players_written',inserted_count,
    'fallback_players_written',0,'changed',true,'write_mode','full_refresh'
  );
end;
$function$


CREATE OR REPLACE FUNCTION afl_source.ingest_matches_payload(p_payload jsonb, p_season integer DEFAULT 2026)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  m jsonb;
  home_id uuid;
  away_id uuid;
  existing afl.matches%rowtype;
  match_status text;
  n integer:=0;
  changed_count integer:=0;
  incoming_start timestamptz;
  incoming_round text;
  incoming_home text;
  incoming_away text;
  incoming_external text;
  incoming_provider text;
  incoming_venue text;
  incoming_home_score integer;
  incoming_away_score integer;
  effective_venue text;
  effective_start timestamptz;
  effective_home uuid;
  effective_away uuid;
begin
  if p_payload is null or jsonb_typeof(p_payload->'matches')<>'array' then
    raise exception 'Invalid AFL matches payload';
  end if;

  for m in select value from jsonb_array_elements(p_payload->'matches')
  loop
    n:=n+1;
    incoming_round:=nullif(m#>>'{round,name}','');
    incoming_home:=coalesce(nullif(m#>>'{home,team,name}',''),'Unknown Home');
    incoming_away:=coalesce(nullif(m#>>'{away,team,name}',''),'Unknown Away');
    incoming_start:=(m->>'utcStartTime')::timestamptz;
    incoming_external:=coalesce(nullif(m->>'id',''),nullif(m->>'providerId',''));
    incoming_provider:=nullif(m->>'providerId','');
    incoming_venue:=nullif(m#>>'{venue,name}','');
    incoming_home_score:=nullif(m#>>'{home,score,totalScore}','')::integer;
    incoming_away_score:=nullif(m#>>'{away,score,totalScore}','')::integer;

    select id into home_id from afl.teams where name=incoming_home;
    if home_id is null then
      insert into afl.teams(external_id,name,short_name,updated_at)
      values(
        nullif(m#>>'{home,team,providerId}',''),
        incoming_home,
        nullif(m#>>'{home,team,abbreviation}',''),
        now()
      )
      returning id into home_id;
    else
      update afl.teams
      set external_id=coalesce(afl.teams.external_id,nullif(m#>>'{home,team,providerId}','')),
          short_name=coalesce(nullif(m#>>'{home,team,abbreviation}',''),afl.teams.short_name),
          updated_at=now()
      where id=home_id
        and (
          afl.teams.external_id is distinct from coalesce(afl.teams.external_id,nullif(m#>>'{home,team,providerId}',''))
          or afl.teams.short_name is distinct from coalesce(nullif(m#>>'{home,team,abbreviation}',''),afl.teams.short_name)
        );
    end if;

    select id into away_id from afl.teams where name=incoming_away;
    if away_id is null then
      insert into afl.teams(external_id,name,short_name,updated_at)
      values(
        nullif(m#>>'{away,team,providerId}',''),
        incoming_away,
        nullif(m#>>'{away,team,abbreviation}',''),
        now()
      )
      returning id into away_id;
    else
      update afl.teams
      set external_id=coalesce(afl.teams.external_id,nullif(m#>>'{away,team,providerId}','')),
          short_name=coalesce(nullif(m#>>'{away,team,abbreviation}',''),afl.teams.short_name),
          updated_at=now()
      where id=away_id
        and (
          afl.teams.external_id is distinct from coalesce(afl.teams.external_id,nullif(m#>>'{away,team,providerId}',''))
          or afl.teams.short_name is distinct from coalesce(nullif(m#>>'{away,team,abbreviation}',''),afl.teams.short_name)
        );
    end if;

    match_status:=case upper(coalesce(m->>'status',''))
      when 'CONCLUDED' then 'final'
      when 'LIVE' then 'live'
      when 'IN_PROGRESS' then 'live'
      when 'CANCELLED' then 'cancelled'
      when 'CANCELED' then 'cancelled'
      when 'POSTPONED' then 'postponed'
      else 'scheduled'
    end;

    select * into existing from afl.matches where external_id=incoming_external;

    if existing.id is null then
      insert into afl.matches(
        external_id,provider_id,season,round_name,venue,start_time,
        home_team_id,away_team_id,status,home_score,away_score,
        source_updated_at,updated_at
      )
      values(
        incoming_external,incoming_provider,p_season,incoming_round,incoming_venue,incoming_start,
        home_id,away_id,match_status,incoming_home_score,incoming_away_score,now(),now()
      );
      changed_count:=changed_count+1;
    else
      effective_venue:=case
        when incoming_round in ('Semi Finals','Preliminary Finals','Grand Final')
          and coalesce(incoming_venue,'') ilike 'To Be Confirmed%'
          and coalesce(existing.venue,'') not ilike 'To Be Confirmed%'
        then existing.venue else incoming_venue end;

      effective_start:=case
        when incoming_round in ('Preliminary Finals','Grand Final')
          and match_status='scheduled'
          and incoming_start<=now()+interval '12 hours'
          and existing.start_time>now()+interval '12 hours'
        then existing.start_time else incoming_start end;

      effective_home:=case
        when incoming_round in ('Semi Finals','Preliminary Finals','Grand Final')
          and incoming_home~*'^(Winner|Loser) of '
        then existing.home_team_id else home_id end;

      effective_away:=case
        when incoming_round in ('Semi Finals','Preliminary Finals','Grand Final')
          and incoming_away~*'^(Winner|Loser) of '
        then existing.away_team_id else away_id end;

      if existing.provider_id is distinct from incoming_provider
        or existing.round_name is distinct from incoming_round
        or existing.venue is distinct from effective_venue
        or existing.start_time is distinct from effective_start
        or existing.home_team_id is distinct from effective_home
        or existing.away_team_id is distinct from effective_away
        or existing.status is distinct from match_status
        or existing.home_score is distinct from incoming_home_score
        or existing.away_score is distinct from incoming_away_score
      then
        update afl.matches
        set provider_id=incoming_provider,
            round_name=incoming_round,
            venue=effective_venue,
            start_time=effective_start,
            home_team_id=effective_home,
            away_team_id=effective_away,
            status=match_status,
            home_score=incoming_home_score,
            away_score=incoming_away_score,
            source_updated_at=now(),
            updated_at=now()
        where id=existing.id;
        changed_count:=changed_count+1;
      end if;
    end if;
  end loop;

  if changed_count>0 then
    perform afl.plan_workflow();
  end if;

  return n;
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

  insert into afl.pregame_state(match_id,state,source_snapshot_at,updated_at)
  values(
    p_match_id,
    jsonb_build_object(
      'lineup',jsonb_build_object(
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
      )
    ),
    now(),now()
  )
  on conflict(match_id) do update set
    state=coalesce(afl.pregame_state.state,'{}'::jsonb) || excluded.state,
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


CREATE OR REPLACE FUNCTION afl_source.stats_work_needed()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select
    exists(
      select 1
      from afl_source.stats_jobs j
      where j.status='pending'
        and j.next_attempt_at<=now()
        and j.attempt<j.max_attempts
    )
    or exists(
      select 1
      from afl_source.stats_jobs j
      where j.status='running'
        and j.claimed_at<now()-interval '10 minutes'
    )
    or exists(
      select 1
      from afl_source.requests q
      where q.request_type in ('stats_token','stats_payload')
        and q.status='pending'
        and (
          q.requested_at<now()-interval '10 minutes'
          or exists(select 1 from net._http_response h where h.id=q.request_id)
        )
    );
$function$

