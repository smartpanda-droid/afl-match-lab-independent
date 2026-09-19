-- SUPERSEDED BY database/weekly_validation_governance_v71.sql
-- Do not re-apply this schedule block to Production.
-- The 60m master / 5m pregame finalizer / 12h release-gate experiment reduced
-- idle DB activity, but it was too coarse for the asynchronous T-60/T-30
-- token -> roster -> freeze path. Production uses 30m / 2m / 6h.
--
-- AFL Match Lab v70 — Minimum Supabase Access Policy
-- Production-applied 2026-09-20.
--
-- Keeps the four pregame accuracy keyframes intact while reducing idle polling.
--   master scheduler: 30m -> 60m
--   pregame fast finalizer: 2m -> 5m
--   release gate: 6h -> 12h
--   late lineup delta: only execute expensive capture when all source snapshots are ready

select cron.alter_job(
  job_id := (select jobid from cron.job where jobname='afl-event-driven-master'),
  schedule := '0 * * * *'
);

select cron.alter_job(
  job_id := (select jobid from cron.job where jobname='afl-pregame-fast-finalizer'),
  schedule := '*/5 * * * *'
);

select cron.alter_job(
  job_id := (select jobid from cron.job where jobname='afl-independent-release-gate'),
  schedule := '17 */12 * * *'
);

create or replace function afl.late_lineup_delta_tick()
returns jsonb
language plpgsql
set search_path to ''
as $function$
declare
  r record;
  result jsonb;
  processed integer := 0;
  captured integer := 0;
  failed integer := 0;
begin
  for r in
    select e.id,e.match_id
    from afl.workflow_events e
    join afl.matches m on m.id=e.match_id
    where e.event_type='pregame_sync'
      and coalesce((e.metadata->>'offset_minutes')::integer,0)=-30
      and e.status in ('ok','completed')
      and e.completed_at is not null
      and m.start_time > now()-interval '3 hours'
      and exists(select 1 from afl.final_prediction_snapshots f where f.match_id=e.match_id)
      and exists(select 1 from afl.final_data_snapshots f where f.match_id=e.match_id)
      and exists(
        select 1
        from afl.pregame_state ps
        where ps.match_id=e.match_id
          and ps.source_snapshot_at is not null
          and ps.source_snapshot_at >= e.completed_at - interval '5 minutes'
      )
      and not exists(select 1 from afl.late_lineup_deltas d where d.match_id=e.match_id)
    order by e.completed_at
    limit 3
  loop
    begin
      result := afl.capture_late_lineup_delta(r.match_id,r.id);
      update afl.workflow_events
      set metadata=metadata || jsonb_build_object(
        'late_lineup_delta',result,
        'late_lineup_delta_checked_at',now()
      )
      where id=r.id;
      if result->>'status'='captured' then captured:=captured+1; end if;
    exception when others then
      failed:=failed+1;
      update afl.workflow_events
      set metadata=metadata || jsonb_build_object(
        'late_lineup_delta_error',left(sqlerrm,500),
        'late_lineup_delta_checked_at',now()
      )
      where id=r.id;
    end;
    processed:=processed+1;
  end loop;
  return jsonb_build_object(
    'status','ok',
    'processed',processed,
    'captured',captured,
    'failed',failed,
    'policy','ready_only_single_capture_v70'
  );
end;
$function$;
