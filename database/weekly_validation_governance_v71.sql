-- AFL Match Lab v71 — Weekly Validation Performance + Candidate-Only Governance
-- Production state captured and verified 2026-09-20.
--
-- Why v71:
--   v70 is already used by resource_optimization_v70.sql.
--   The 60m/5m/12h schedule from that earlier resource-only experiment is superseded
--   by the verified matchday reliability schedule below.
--
-- Guarantees:
-- 1) Weekly retrospective validation cannot mutate Production context/role policy.
-- 2) Market search outputs go to an internal candidate table.
-- 3) Weight searches use set-based grids instead of repeated PL/pgSQL scans.
-- 4) Weekly validation fingerprints final stats and skips when data is unchanged.
-- 5) Production policy is restored to the exact 9027 frozen-control weights.
-- 6) Matchday scheduler remains 30m master / 2m fast finalizer / 6h release gate.

begin;

create table if not exists afl.model_module_market_policy_candidate (
  module text not null,
  market text not null,
  mode text not null default 'shadow_only',
  applied_weight numeric not null default 0 check(applied_weight>=0 and applied_weight<=1),
  train_samples integer,
  holdout_samples integer,
  holdout_brier_gain numeric,
  holdout_logloss_gain numeric,
  search_run_id uuid,
  reason text,
  updated_at timestamptz not null default now(),
  primary key(module,market)
);

revoke all on table afl.model_module_market_policy_candidate
from public,anon,authenticated;

CREATE OR REPLACE FUNCTION afl.run_module_weight_search()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  vrun uuid;
  sr uuid;
  best record;
  hb numeric;
  hc numeric;
  hbg numeric;
  hlb numeric;
  hlc numeric;
  hlg numeric;
  hn integer;
  v_passed boolean;
begin
  select id into vrun
  from afl.shadow_validation_runs
  order by generated_at desc
  limit 1;

  if vrun is null then
    return jsonb_build_object('status','no_shadow_run');
  end if;

  delete from afl.module_weight_search_runs
  where shadow_run_id=vrun;

  insert into afl.module_weight_search_runs(
    shadow_run_id,train_matches,holdout_matches,
    selected_context_weight,selected_role_weight
  )
  values(vrun,20,10,0,0)
  returning id into sr;

  with ranked_matches as materialized (
    select l.match_id,
           dense_rank() over(order by min(m.start_time)) rnk
    from afl.shadow_validation_legs l
    join afl.matches m on m.id=l.match_id
    where l.run_id=vrun
    group by l.match_id
  ),
  base as materialized (
    select l.actual_hit,l.baseline_probability,
           coalesce(l.context_factor,1)::numeric context_factor,
           coalesce(l.role_factor,1)::numeric role_factor,
           r.rnk
    from afl.shadow_validation_legs l
    join ranked_matches r on r.match_id=l.match_id
    where l.run_id=vrun
  ),
  grid(context_weight,role_weight) as (
    values
      (0::numeric,0::numeric),(0,.25),(0,.5),(0,.75),(0,1),
      (.25,0),(.25,.25),(.25,.5),(.25,.75),(.25,1),
      (.5,0),(.5,.25),(.5,.5),(.5,.75),(.5,1),
      (.75,0),(.75,.25),(.75,.5),(.75,.75),(.75,1),
      (1,0),(1,.25),(1,.5),(1,.75),(1,1)
  ),
  scored as (
    select g.context_weight,g.role_weight,b.actual_hit,
           greatest(.01,least(.99,
             b.baseline_probability
             * power(b.context_factor,g.context_weight)
             * power(b.role_factor,g.role_weight)
           )) p
    from base b
    cross join grid g
    where b.rnk<=20
  )
  insert into afl.module_weight_search_grid(
    search_run_id,context_weight,role_weight,
    train_samples,train_brier,train_log_loss
  )
  select sr,context_weight,role_weight,count(*)::int,
         avg(power(p-(actual_hit::int),2))::numeric,
         avg(-(actual_hit::int)*ln(p)-(1-(actual_hit::int))*ln(1-p))::numeric
  from scored
  group by context_weight,role_weight;

  select * into best
  from afl.module_weight_search_grid
  where search_run_id=sr
  order by train_brier asc,train_log_loss asc,
           context_weight asc,role_weight asc
  limit 1;

  with ranked_matches as materialized (
    select l.match_id,
           dense_rank() over(order by min(m.start_time)) rnk
    from afl.shadow_validation_legs l
    join afl.matches m on m.id=l.match_id
    where l.run_id=vrun
    group by l.match_id
  ),
  x as (
    select l.actual_hit,l.baseline_probability,
           greatest(.01,least(.99,
             l.baseline_probability
             * power(coalesce(l.context_factor,1),best.context_weight)
             * power(coalesce(l.role_factor,1),best.role_weight)
           )) p
    from afl.shadow_validation_legs l
    join ranked_matches r on r.match_id=l.match_id
    where l.run_id=vrun and r.rnk>20
  )
  select count(*)::int,
         avg(power(baseline_probability-(actual_hit::int),2)),
         avg(power(p-(actual_hit::int),2)),
         avg(-(actual_hit::int)*ln(baseline_probability)
             -(1-(actual_hit::int))*ln(1-baseline_probability)),
         avg(-(actual_hit::int)*ln(p)
             -(1-(actual_hit::int))*ln(1-p))
  into hn,hb,hc,hlb,hlc
  from x;

  hbg:=hb-hc;
  hlg:=hlb-hlc;
  v_passed:=coalesce(hbg>0 and hlg>0,false);

  update afl.module_weight_search_runs
  set selected_context_weight=best.context_weight,
      selected_role_weight=best.role_weight,
      train_brier=best.train_brier,
      train_log_loss=best.train_log_loss,
      holdout_baseline_brier=hb,
      holdout_candidate_brier=hc,
      holdout_brier_gain=hbg,
      holdout_baseline_log_loss=hlb,
      holdout_candidate_log_loss=hlc,
      holdout_logloss_gain=hlg,
      passed=v_passed,
      metadata=jsonb_build_object(
        'engine','set_based_v2',
        'grid','0,0.25,0.5,0.75,1',
        'selection','min train brier then logloss',
        'holdout_samples',hn,
        'gate','holdout brier and logloss both improve'
      )
  where id=sr;

  -- Candidate-only search: production policy is not mutated here.

  return jsonb_build_object(
    'status','ok',
    'engine','set_based_v2',
    'search_run_id',sr,
    'context_weight',best.context_weight,
    'role_weight',best.role_weight,
    'holdout_samples',hn,
    'holdout_brier_gain',hbg,
    'holdout_logloss_gain',hlg,
    'passed',v_passed,'candidate_only',true
  );
end;
$function$;


CREATE OR REPLACE FUNCTION afl.run_market_module_weight_search()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_shadow uuid;
  v_search uuid;
  v_total_markets integer:=0;
  v_passed_markets integer:=0;
begin
  select id into v_shadow
  from afl.shadow_validation_runs
  order by generated_at desc
  limit 1;

  if v_shadow is null then
    return jsonb_build_object('status','no_shadow_run');
  end if;

  delete from afl.module_market_weight_search_runs;
  delete from afl.model_module_market_policy_candidate;

  insert into afl.module_market_weight_search_runs(shadow_run_id,metadata)
  values(
    v_shadow,
    jsonb_build_object(
      'engine','set_based_v2',
      'grid','0,0.25,0.5,0.75,1',
      'train_matches',20,
      'holdout_matches',10,
      'gate','holdout samples >=300 and Brier+LogLoss both improve'
    )
  )
  returning id into v_search;

  with ranked_matches as materialized (
    select l.match_id,
           dense_rank() over(order by min(m.start_time)) rnk
    from afl.shadow_validation_legs l
    join afl.matches m on m.id=l.match_id
    where l.run_id=v_shadow
    group by l.match_id
  ),
  base as materialized (
    select l.market,l.actual_hit,l.baseline_probability,
           coalesce(l.context_factor,1)::numeric context_factor,
           coalesce(l.role_factor,1)::numeric role_factor,
           r.rnk
    from afl.shadow_validation_legs l
    join ranked_matches r on r.match_id=l.match_id
    where l.run_id=v_shadow
  ),
  grid(context_weight,role_weight) as (
    values
      (0::numeric,0::numeric),(0,.25),(0,.5),(0,.75),(0,1),
      (.25,0),(.25,.25),(.25,.5),(.25,.75),(.25,1),
      (.5,0),(.5,.25),(.5,.5),(.5,.75),(.5,1),
      (.75,0),(.75,.25),(.75,.5),(.75,.75),(.75,1),
      (1,0),(1,.25),(1,.5),(1,.75),(1,1)
  ),
  scored as (
    select b.market,g.context_weight,g.role_weight,b.actual_hit,
           greatest(.01,least(.99,
             b.baseline_probability
             * power(b.context_factor,g.context_weight)
             * power(b.role_factor,g.role_weight)
           )) p
    from base b
    cross join grid g
    where b.rnk<=20
  )
  insert into afl.module_market_weight_search_grid(
    search_run_id,market,context_weight,role_weight,
    train_samples,train_brier,train_log_loss
  )
  select v_search,market,context_weight,role_weight,count(*)::int,
         avg(power(p-(actual_hit::int),2))::numeric,
         avg(-(actual_hit::int)*ln(p)-(1-(actual_hit::int))*ln(1-p))::numeric
  from scored
  group by market,context_weight,role_weight;

  with best as materialized (
    select distinct on (market)
      market,context_weight,role_weight,train_samples,train_brier,train_log_loss
    from afl.module_market_weight_search_grid
    where search_run_id=v_search
    order by market,train_brier asc,train_log_loss asc,
             (context_weight+role_weight) asc,context_weight asc,role_weight asc
  ),
  ranked_matches as materialized (
    select l.match_id,
           dense_rank() over(order by min(m.start_time)) rnk
    from afl.shadow_validation_legs l
    join afl.matches m on m.id=l.match_id
    where l.run_id=v_shadow
    group by l.match_id
  ),
  holdout as (
    select
      l.market,
      b.context_weight,
      b.role_weight,
      count(*)::int holdout_samples,
      avg(power(l.baseline_probability-(l.actual_hit::int),2)) holdout_baseline_brier,
      avg(power(
        greatest(.01,least(.99,
          l.baseline_probability
          * power(coalesce(l.context_factor,1),b.context_weight)
          * power(coalesce(l.role_factor,1),b.role_weight)
        ))-(l.actual_hit::int),2
      )) holdout_candidate_brier,
      avg(
        -(l.actual_hit::int)*ln(l.baseline_probability)
        -(1-(l.actual_hit::int))*ln(1-l.baseline_probability)
      ) holdout_baseline_log_loss,
      avg(
        -(l.actual_hit::int)*ln(greatest(.01,least(.99,
          l.baseline_probability
          * power(coalesce(l.context_factor,1),b.context_weight)
          * power(coalesce(l.role_factor,1),b.role_weight)
        )))
        -(1-(l.actual_hit::int))*ln(1-greatest(.01,least(.99,
          l.baseline_probability
          * power(coalesce(l.context_factor,1),b.context_weight)
          * power(coalesce(l.role_factor,1),b.role_weight)
        )))
      ) holdout_candidate_log_loss
    from afl.shadow_validation_legs l
    join ranked_matches r on r.match_id=l.match_id
    join best b on b.market=l.market
    where l.run_id=v_shadow and r.rnk>20
    group by l.market,b.context_weight,b.role_weight
  )
  update afl.module_market_weight_search_grid g
  set holdout_samples=h.holdout_samples,
      holdout_baseline_brier=h.holdout_baseline_brier,
      holdout_candidate_brier=h.holdout_candidate_brier,
      holdout_brier_gain=h.holdout_baseline_brier-h.holdout_candidate_brier,
      holdout_baseline_log_loss=h.holdout_baseline_log_loss,
      holdout_candidate_log_loss=h.holdout_candidate_log_loss,
      holdout_logloss_gain=h.holdout_baseline_log_loss-h.holdout_candidate_log_loss,
      selected=true,
      passed=coalesce(
        h.holdout_samples>=300
        and h.holdout_baseline_brier-h.holdout_candidate_brier>=0.0005
        and h.holdout_baseline_log_loss-h.holdout_candidate_log_loss>=0.0010,
        false
      )
  from holdout h
  where g.search_run_id=v_search
    and g.market=h.market
    and g.context_weight=h.context_weight
    and g.role_weight=h.role_weight;

  insert into afl.model_module_market_policy_candidate(
    module,market,mode,applied_weight,train_samples,holdout_samples,
    holdout_brier_gain,holdout_logloss_gain,search_run_id,reason
  )
  select
    module_name,
    g.market,
    case
      when g.passed and chosen_weight>0 then 'active_recalibrated'
      else 'shadow_only'
    end,
    case when g.passed then chosen_weight else 0 end,
    g.train_samples,g.holdout_samples,g.holdout_brier_gain,g.holdout_logloss_gain,
    v_search,
    case when g.passed then 'market holdout gate passed' else 'market holdout gate failed' end
  from afl.module_market_weight_search_grid g
  cross join lateral (
    values
      ('context'::text,g.context_weight),
      ('role'::text,g.role_weight)
  ) x(module_name,chosen_weight)
  where g.search_run_id=v_search and g.selected=true;

  select count(distinct market)::int,
         count(distinct market) filter(where passed)::int
  into v_total_markets,v_passed_markets
  from afl.module_market_weight_search_grid
  where search_run_id=v_search and selected=true;

  -- Candidate-only search: active production market policy remains frozen.

  return jsonb_build_object(
    'status','ok',
    'engine','set_based_v2',
    'search_run_id',v_search,
    'markets',v_total_markets,
    'passed_markets',v_passed_markets,'candidate_only',true
  );
end;
$function$;


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
  fingerprint text;
  previous_fingerprint text;
  t0 timestamptz;
  t1 timestamptz;
  t2 timestamptz;
  t3 timestamptz;
  t4 timestamptz;
  t5 timestamptz;
begin
  select md5(
    count(*)::text||'|'||
    count(distinct s.match_id)::text||'|'||
    coalesce(max(s.source_updated_at)::text,'none')
  )
  into fingerprint
  from afl.player_game_stats s
  join afl.matches m on m.id=s.match_id
  where m.status='final';

  select metadata->>'weekly_source_fingerprint'
  into previous_fingerprint
  from afl.shadow_validation_runs
  order by generated_at desc
  limit 1;

  maintenance:=afl.cleanup_cron_history();

  if previous_fingerprint=fingerprint then
    return jsonb_build_object(
      'status','skipped_no_new_stats',
      'source_fingerprint',fingerprint,
      'maintenance',maintenance
    );
  end if;

  t0:=clock_timestamp();

  dep:=afl.refresh_market_dependency_profiles();
  pubdep:=afl.refresh_public_dependency_profiles();
  t1:=clock_timestamp();

  s:=afl.run_shadow_validation(30);

  update afl.shadow_validation_runs
  set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
    'weekly_source_fingerprint',fingerprint,
    'weekly_completed_source_at',(
      select max(gs.source_updated_at)
      from afl.player_game_stats gs
      join afl.matches mm on mm.id=gs.match_id
      where mm.status='final'
    )
  )
  where id=(s->>'run_id')::uuid;

  t2:=clock_timestamp();

  w:=afl.run_module_weight_search();
  t3:=clock_timestamp();

  mw:=afl.run_market_module_weight_search();
  t4:=clock_timestamp();

  d:=afl.refresh_validation_dashboard();
  t5:=clock_timestamp();

  return jsonb_build_object(
    'status','ok',
    'source_fingerprint',fingerprint,
    'dependency',dep,
    'public_dependency',pubdep,
    'shadow',s,
    'weight_search',w,
    'market_weight_search',mw,
    'dashboard',d,
    'maintenance',maintenance,
    'timing_ms',jsonb_build_object(
      'dependencies',round(extract(epoch from (t1-t0))*1000),
      'shadow',round(extract(epoch from (t2-t1))*1000),
      'global_weight',round(extract(epoch from (t3-t2))*1000),
      'market_weight',round(extract(epoch from (t4-t3))*1000),
      'dashboard',round(extract(epoch from (t5-t4))*1000),
      'total',round(extract(epoch from (t5-t0))*1000)
    )
  );
end;
$function$;


revoke all on function afl.run_module_weight_search()
from public,anon,authenticated;
revoke all on function afl.run_market_module_weight_search()
from public,anon,authenticated;
revoke all on function afl.weekly_validation_tick()
from public,anon,authenticated;

-- Production control policy recovered from frozen match 9027 metadata.
with restored(module,market,weight) as (
  values
    ('context','clearances',0.75::numeric),
    ('role','clearances',1::numeric),
    ('context','disposals',0::numeric),
    ('role','disposals',0::numeric),
    ('context','fantasy_points',0::numeric),
    ('role','fantasy_points',1::numeric),
    ('context','goals',0.25::numeric),
    ('role','goals',0.25::numeric),
    ('context','handballs',0::numeric),
    ('role','handballs',0::numeric),
    ('context','hitouts',0::numeric),
    ('role','hitouts',1::numeric),
    ('context','kicks',0::numeric),
    ('role','kicks',0::numeric),
    ('context','marks',0::numeric),
    ('role','marks',0::numeric),
    ('context','tackles',0::numeric),
    ('role','tackles',0::numeric)
)
insert into afl.model_module_market_policy(
  module,market,mode,applied_weight,train_samples,holdout_samples,
  holdout_brier_gain,holdout_logloss_gain,search_run_id,reason,updated_at
)
select module,market,
       case when weight>0 then 'active_recalibrated' else 'shadow_only' end,
       weight,null,null,null,null,null,
       'restored from frozen 9027 production metadata; weekly search is candidate-only',
       now()
from restored
on conflict(module,market) do update set
  mode=excluded.mode,
  applied_weight=excluded.applied_weight,
  train_samples=null,
  holdout_samples=null,
  holdout_brier_gain=null,
  holdout_logloss_gain=null,
  search_run_id=null,
  reason=excluded.reason,
  updated_at=excluded.updated_at;

update afl.model_module_policy
set applied_weight=0,
    mode='shadow_only',
    reason='global fallback disabled; production market policy restored from frozen control',
    updated_at=now()
where module in ('context','role');

-- Restore the matchday-reliability schedule that supersedes the old v70 resource experiment.
select cron.alter_job(
  job_id := (select jobid from cron.job where jobname='afl-event-driven-master'),
  schedule := '*/30 * * * *'
);
select cron.alter_job(
  job_id := (select jobid from cron.job where jobname='afl-pregame-fast-finalizer'),
  schedule := '*/2 * * * *'
);
select cron.alter_job(
  job_id := (select jobid from cron.job where jobname='afl-independent-release-gate'),
  schedule := '17 */6 * * *'
);

commit;
