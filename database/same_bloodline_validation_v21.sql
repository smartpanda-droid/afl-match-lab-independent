-- AFL Match Lab — V2.1 Same-Bloodline Validation
-- Production-deployed 2026-09-20.
-- Internal only. Does not promote or alter the production model.
-- Promotion requires genuine T-30 +/-15m snapshots, confirmed lineup,
-- cluster-weighted Brier + LogLoss improvement, calibration non-regression,
-- no material market regression, and two consecutive PASS checkpoints.

create table if not exists afl.v21_validation_snapshots (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references afl.matches(id) on delete cascade,
  workflow_event_id bigint references afl.workflow_events(id) on delete set null,
  source_final_snapshot_id uuid references afl.final_prediction_snapshots(id) on delete set null,
  snapshot_kind text not null check (snapshot_kind in ('t30_live','legacy_t60_reference','manual_reference')),
  source_cutoff_at timestamptz not null,
  captured_at timestamptz not null default now(),
  production_run_id uuid not null references afl.prediction_runs(id) on delete cascade,
  model_version_id uuid not null references afl.model_versions(id),
  calibration_map jsonb not null default '[]'::jsonb,
  lineup_confirmed boolean not null default false,
  used_fallback_lineup boolean not null default false,
  cutoff_minutes_before_start numeric,
  promotion_eligible boolean not null default false,
  eligibility_reason text not null,
  leg_count integer not null default 0,
  settled_leg_count integer not null default 0,
  settled_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  unique(match_id,snapshot_kind)
);

create index if not exists idx_v21_snapshots_promotion
  on afl.v21_validation_snapshots(promotion_eligible,settled_at,captured_at);
create index if not exists idx_v21_snapshots_run
  on afl.v21_validation_snapshots(production_run_id);

create table if not exists afl.v21_validation_legs (
  snapshot_id uuid not null references afl.v21_validation_snapshots(id) on delete cascade,
  prediction_leg_id uuid not null references afl.prediction_legs(id) on delete cascade,
  match_id uuid not null references afl.matches(id) on delete cascade,
  player_id uuid not null references afl.players(id) on delete cascade,
  team_id uuid references afl.teams(id) on delete set null,
  market text not null,
  threshold numeric not null,
  control_raw_probability numeric not null,
  control_probability numeric not null,
  shadow_raw_probability numeric not null,
  shadow_probability numeric not null,
  production_availability_factor numeric not null default 1,
  derived_tog_status text,
  derived_tog_risk_level text,
  derived_tog_factor numeric not null default 1,
  derived_tog_ratio numeric,
  derived_tog_baseline numeric,
  derived_tog_latest numeric,
  derived_tog_recovery_streak integer,
  derived_tog_applied boolean not null default false,
  actual_value numeric,
  hit boolean,
  cluster_weight numeric,
  control_brier numeric,
  shadow_brier numeric,
  control_logloss numeric,
  shadow_logloss numeric,
  settled_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  primary key(snapshot_id,prediction_leg_id)
);

create index if not exists idx_v21_legs_cluster
  on afl.v21_validation_legs(snapshot_id,player_id,market);
create index if not exists idx_v21_legs_adjusted
  on afl.v21_validation_legs(snapshot_id,derived_tog_applied,market);

create table if not exists afl.v21_gate_history (
  id bigserial primary key,
  evaluated_at timestamptz not null default now(),
  promotion_matches integer not null,
  clusters integer not null,
  adjusted_clusters integer not null,
  decision text not null,
  report jsonb not null,
  unique(promotion_matches,clusters,adjusted_clusters)
);

revoke all on table afl.v21_validation_snapshots, afl.v21_validation_legs, afl.v21_gate_history
from public,anon,authenticated;

CREATE OR REPLACE FUNCTION afl.v21_backfill_legacy_reference()
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  r record;
  result jsonb;
  n integer:=0;
  skipped integer:=0;
begin
  for r in
    select f.*,m.start_time,
           round(extract(epoch from (m.start_time-f.source_cutoff_at))/60.0,1) mins
    from afl.final_prediction_snapshots f
    join afl.matches m on m.id=f.match_id
    where m.status='final'
      and f.model_ready=true
      and f.source_cutoff_at is not null
      and round(extract(epoch from (m.start_time-f.source_cutoff_at))/60.0,1) between 45 and 75
      and not exists(
        select 1 from afl.v21_validation_snapshots v
        where v.match_id=f.match_id and v.snapshot_kind='legacy_t60_reference'
      )
    order by m.start_time
  loop
    result:=afl.v21_insert_snapshot(
      r.match_id,r.prediction_run_id,r.source_cutoff_at,'legacy_t60_reference',
      r.workflow_event_id,r.id,r.lineup_confirmed,r.used_fallback_lineup,true
    );
    if result->>'status'='captured' then n:=n+1; else skipped:=skipped+1; end if;
  end loop;
  return jsonb_build_object('status','ok','captured',n,'skipped',skipped);
end;
$function$


CREATE OR REPLACE FUNCTION afl.v21_capture_t30(p_match_id uuid, p_workflow_event_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  e afl.workflow_events%rowtype;
  m afl.matches%rowtype;
  ps afl.pregame_state%rowtype;
  gen jsonb;
  run_id uuid;
  confirmed boolean;
begin
  if exists(
    select 1 from afl.v21_validation_snapshots
    where match_id=p_match_id and snapshot_kind='t30_live'
  ) then
    return jsonb_build_object('status','already_captured');
  end if;

  select * into e from afl.workflow_events
  where id=p_workflow_event_id
    and match_id=p_match_id
    and event_type='pregame_sync'
    and coalesce((metadata->>'offset_minutes')::integer,0)=-30
    and status='ok'
    and completed_at is not null;
  if not found then return jsonb_build_object('status','awaiting_t30_sync'); end if;

  select * into m from afl.matches where id=p_match_id;
  select * into ps from afl.pregame_state where match_id=p_match_id;
  if ps.source_snapshot_at is null then
    return jsonb_build_object('status','awaiting_pregame_state');
  end if;

  confirmed:=coalesce((ps.state#>>'{lineup,confirmed}')::boolean,false);

  gen:=afl.generate_baseline_prediction_run(p_match_id,false);
  if gen->>'status' not in ('generated','existing') then
    return jsonb_build_object('status','production_generation_failed','generation',gen);
  end if;
  run_id:=(gen->>'prediction_run_id')::uuid;

  return afl.v21_insert_snapshot(
    p_match_id,run_id,ps.source_snapshot_at,'t30_live',
    p_workflow_event_id,null,confirmed,not confirmed,false
  );
end;
$function$


CREATE OR REPLACE FUNCTION afl.v21_insert_snapshot(p_match_id uuid, p_prediction_run_id uuid, p_cutoff_at timestamp with time zone, p_snapshot_kind text, p_workflow_event_id bigint DEFAULT NULL::bigint, p_source_final_snapshot_id uuid DEFAULT NULL::uuid, p_lineup_confirmed boolean DEFAULT false, p_used_fallback_lineup boolean DEFAULT false, p_force_reference boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  m afl.matches%rowtype;
  pr afl.prediction_runs%rowtype;
  mv afl.model_versions%rowtype;
  sid uuid;
  mins numeric;
  leg_n integer;
  eligible boolean;
  reason text;
begin
  select * into m from afl.matches where id=p_match_id;
  if not found then return jsonb_build_object('status','match_not_found'); end if;

  select * into pr from afl.prediction_runs
  where id=p_prediction_run_id and match_id=p_match_id;
  if not found then return jsonb_build_object('status','run_not_found'); end if;

  select * into mv from afl.model_versions where id=pr.model_version_id;

  mins:=round(extract(epoch from (m.start_time-p_cutoff_at))/60.0,1);
  leg_n:=(select count(*) from afl.prediction_legs where prediction_run_id=p_prediction_run_id);

  eligible:=(
    not p_force_reference
    and p_snapshot_kind='t30_live'
    and p_cutoff_at<=m.start_time
    and mins between 15 and 45
    and p_lineup_confirmed
    and not p_used_fallback_lineup
    and leg_n>0
  );

  reason:=case
    when p_force_reference then 'reference_only'
    when p_snapshot_kind<>'t30_live' then 'reference_snapshot_kind'
    when p_cutoff_at>m.start_time then 'cutoff_after_start'
    when mins not between 15 and 45 then 'outside_t30_plus_minus_15'
    when not p_lineup_confirmed then 'lineup_not_confirmed'
    when p_used_fallback_lineup then 'fallback_lineup_used'
    when leg_n=0 then 'no_prediction_legs'
    else 'eligible_t30_same_bloodline'
  end;

  insert into afl.v21_validation_snapshots(
    match_id,workflow_event_id,source_final_snapshot_id,snapshot_kind,
    source_cutoff_at,captured_at,production_run_id,model_version_id,calibration_map,
    lineup_confirmed,used_fallback_lineup,cutoff_minutes_before_start,
    promotion_eligible,eligibility_reason,leg_count,metadata
  )
  values(
    p_match_id,p_workflow_event_id,p_source_final_snapshot_id,p_snapshot_kind,
    p_cutoff_at,now(),p_prediction_run_id,pr.model_version_id,
    coalesce(mv.parameters->'calibration_map','[]'::jsonb),
    p_lineup_confirmed,p_used_fallback_lineup,mins,
    eligible,reason,leg_n,
    jsonb_build_object(
      'validation_version','v2.1',
      'same_prediction_run',true,
      'same_players',true,
      'same_markets_thresholds',true,
      'point_in_time_availability',true,
      'cluster_unit','match_player_market',
      'production_generated_at',pr.generated_at,
      'production_source_snapshot_at',pr.source_snapshot_at
    )
  )
  on conflict(match_id,snapshot_kind) do update set
    metadata=afl.v21_validation_snapshots.metadata ||
      jsonb_build_object('duplicate_capture_attempt_at',now())
  returning id into sid;

  insert into afl.v21_validation_legs(
    snapshot_id,prediction_leg_id,match_id,player_id,team_id,market,threshold,
    control_raw_probability,control_probability,shadow_raw_probability,shadow_probability,
    production_availability_factor,derived_tog_status,derived_tog_risk_level,
    derived_tog_factor,derived_tog_ratio,derived_tog_baseline,derived_tog_latest,
    derived_tog_recovery_streak,derived_tog_applied,metadata
  )
  select
    sid,x.prediction_leg_id,x.match_id,x.player_id,x.team_id,x.market,x.threshold,
    x.control_raw_probability,x.control_probability,x.shadow_raw_probability,x.shadow_probability,
    x.production_availability_factor,x.derived_tog_status,x.derived_tog_risk_level,
    x.derived_tog_factor,x.derived_tog_ratio,x.derived_tog_baseline,x.derived_tog_latest,
    x.derived_tog_recovery_streak,x.derived_tog_applied,x.metadata
  from afl.v21_shadow_legs_asof(p_prediction_run_id,p_cutoff_at) x
  on conflict(snapshot_id,prediction_leg_id) do nothing;

  update afl.v21_validation_snapshots
  set leg_count=(select count(*) from afl.v21_validation_legs where snapshot_id=sid)
  where id=sid;

  return jsonb_build_object(
    'status','captured',
    'snapshot_id',sid,
    'snapshot_kind',p_snapshot_kind,
    'cutoff_minutes_before_start',mins,
    'promotion_eligible',eligible,
    'eligibility_reason',reason,
    'legs',(select count(*) from afl.v21_validation_legs where snapshot_id=sid),
    'adjusted_legs',(select count(*) from afl.v21_validation_legs where snapshot_id=sid and derived_tog_applied)
  );
end;
$function$


CREATE OR REPLACE FUNCTION afl.v21_record_gate()
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  rep jsonb;
  m integer;
  c integer;
  a integer;
  d text;
  last_two_pass integer;
  recorded boolean:=false;
begin
  rep:=afl.v21_validation_report(true);
  m:=coalesce((rep#>>'{sample,matches}')::integer,0);
  c:=coalesce((rep#>>'{sample,clusters}')::integer,0);
  a:=coalesce((rep#>>'{sample,adjusted_clusters}')::integer,0);
  d:=coalesce(rep#>>'{promotion_gate,decision}','UNKNOWN');

  if m>0 then
    insert into afl.v21_gate_history(
      promotion_matches,clusters,adjusted_clusters,decision,report
    )
    values(m,c,a,d,rep)
    on conflict(promotion_matches,clusters,adjusted_clusters) do nothing;
    get diagnostics recorded=row_count;
  end if;

  select count(*)::int into last_two_pass
  from (
    select decision
    from afl.v21_gate_history
    order by promotion_matches desc,evaluated_at desc
    limit 2
  ) x
  where decision='PASS';

  return jsonb_build_object(
    'status','ok',
    'recorded',recorded,
    'promotion_matches',m,
    'clusters',c,
    'adjusted_clusters',a,
    'current_decision',d,
    'last_two_pass_count',last_two_pass,
    'release_readiness',case
      when d='PASS' and last_two_pass>=2 then 'PASS_STREAK_READY'
      when d='PASS' then 'WAIT_CONSECUTIVE_PASS'
      else d
    end,
    'auto_promote',false
  );
end;
$function$


CREATE OR REPLACE FUNCTION afl.v21_run_availability_asof(p_prediction_run_id uuid, p_cutoff_at timestamp with time zone)
 RETURNS TABLE(player_id uuid, status text, risk_level text, baseline_tog numeric, latest_tog numeric, tog_ratio numeric, recovery_streak integer, latest_match_id uuid, probability_factor numeric, prior_n integer, latest_source_updated_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
with run_target as (
  select pr.match_id,m.start_time target_start
  from afl.prediction_runs pr
  join afl.matches m on m.id=pr.match_id
  where pr.id=p_prediction_run_id
),
players as (
  select distinct pl.player_id
  from afl.prediction_legs pl
  where pl.prediction_run_id=p_prediction_run_id
    and pl.player_id is not null
),
ranked as materialized (
  select
    s.player_id,s.match_id,m.start_time,s.tog_pct,s.source_updated_at,
    row_number() over(partition by s.player_id order by m.start_time desc,m.id) rn
  from players p
  join afl.player_game_stats s on s.player_id=p.player_id
  join afl.matches m on m.id=s.match_id
  cross join run_target t
  where s.tog_pct is not null
    and m.status='final'
    and m.start_time<t.target_start
    and m.start_time<p_cutoff_at
    and coalesce(s.source_updated_at,m.start_time)<=p_cutoff_at
),
summary as materialized (
  select player_id,
    avg(tog_pct) filter(where rn between 2 and 6)::numeric baseline_tog,
    count(*) filter(where rn between 2 and 6)::int prior_n,
    avg(tog_pct) filter(where rn between 3 and 7)::numeric recovery_baseline
  from ranked
  group by player_id
),
recovery as (
  select r.player_id,
    count(*) filter(
      where r.rn between 1 and 2
        and r.tog_pct>=.90*nullif(s.recovery_baseline,0)
    )::int recovery_streak
  from ranked r
  join summary s using(player_id)
  where r.rn between 1 and 2
  group by r.player_id
),
latest as (
  select r.player_id,r.match_id,r.tog_pct latest_tog,r.source_updated_at,
    s.baseline_tog,s.prior_n,coalesce(x.recovery_streak,0)::int recovery_streak
  from ranked r
  join summary s using(player_id)
  left join recovery x using(player_id)
  where r.rn=1
),
calc as (
  select *,
    round(latest_tog/nullif(baseline_tog,0),4) ratio
  from latest
  where prior_n>=4 and baseline_tog is not null and baseline_tog>=45
)
select
  player_id,
  case
    when recovery_streak>=2 then 'normal'
    when ratio<.55 then 'high_risk'
    when ratio<.75 then 'restricted'
    when ratio<.85 then 'watch'
    else 'normal'
  end,
  case
    when recovery_streak>=2 then 'low'
    when ratio<.55 then 'severe'
    when ratio<.75 then 'high'
    when ratio<.85 then 'moderate'
    else 'low'
  end,
  round(baseline_tog,2),
  latest_tog,
  ratio,
  recovery_streak,
  match_id,
  case
    when recovery_streak>=2 then 1.00
    when ratio<.55 then .80
    when ratio<.75 then .88
    when ratio<.85 then .94
    else 1.00
  end::numeric,
  prior_n,
  source_updated_at
from calc;
$function$


CREATE OR REPLACE FUNCTION afl.v21_settle_snapshot(p_snapshot_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  s afl.v21_validation_snapshots%rowtype;
  n integer:=0;
  total_n integer:=0;
begin
  select * into s from afl.v21_validation_snapshots where id=p_snapshot_id;
  if not found then return jsonb_build_object('status','snapshot_not_found'); end if;

  update afl.v21_validation_legs l
  set
    actual_value=afl.market_value(gs,l.market),
    hit=(afl.market_value(gs,l.market)>=l.threshold),
    control_brier=power(
      greatest(.000001::numeric,least(.999999::numeric,l.control_probability))
      -(afl.market_value(gs,l.market)>=l.threshold)::int,2
    ),
    shadow_brier=power(
      greatest(.000001::numeric,least(.999999::numeric,l.shadow_probability))
      -(afl.market_value(gs,l.market)>=l.threshold)::int,2
    ),
    control_logloss=case
      when afl.market_value(gs,l.market)>=l.threshold
        then -ln(greatest(.000001::numeric,least(.999999::numeric,l.control_probability)))
      else -ln(1-greatest(.000001::numeric,least(.999999::numeric,l.control_probability)))
    end,
    shadow_logloss=case
      when afl.market_value(gs,l.market)>=l.threshold
        then -ln(greatest(.000001::numeric,least(.999999::numeric,l.shadow_probability)))
      else -ln(1-greatest(.000001::numeric,least(.999999::numeric,l.shadow_probability)))
    end,
    settled_at=now()
  from afl.player_game_stats gs
  where l.snapshot_id=p_snapshot_id
    and gs.match_id=s.match_id
    and gs.player_id=l.player_id
    and afl.market_value(gs,l.market) is not null;

  with weights as (
    select snapshot_id,prediction_leg_id,
      1.0/count(*) over(partition by snapshot_id,player_id,market)::numeric w
    from afl.v21_validation_legs
    where snapshot_id=p_snapshot_id and hit is not null
  )
  update afl.v21_validation_legs l
  set cluster_weight=w.w
  from weights w
  where l.snapshot_id=w.snapshot_id and l.prediction_leg_id=w.prediction_leg_id;

  select count(*),count(*) filter(where hit is not null)
  into total_n,n
  from afl.v21_validation_legs
  where snapshot_id=p_snapshot_id;

  update afl.v21_validation_snapshots
  set leg_count=total_n,
      settled_leg_count=n,
      settled_at=case when n>0 then now() else settled_at end,
      metadata=metadata||jsonb_build_object(
        'settled_fraction',case when total_n>0 then round(n::numeric/total_n,4) else 0 end,
        'settlement_source','player_game_stats',
        'settled_at_last',now()
      )
  where id=p_snapshot_id;

  return jsonb_build_object(
    'status',case when n>0 then 'settled' else 'awaiting_stats' end,
    'snapshot_id',p_snapshot_id,
    'legs',total_n,
    'settled_legs',n,
    'settled_fraction',case when total_n>0 then round(n::numeric/total_n,4) else 0 end
  );
end;
$function$


CREATE OR REPLACE FUNCTION afl.v21_shadow_legs_asof(p_prediction_run_id uuid, p_cutoff_at timestamp with time zone)
 RETURNS TABLE(prediction_leg_id uuid, match_id uuid, player_id uuid, team_id uuid, market text, threshold numeric, control_raw_probability numeric, control_probability numeric, shadow_raw_probability numeric, shadow_probability numeric, production_availability_factor numeric, derived_tog_status text, derived_tog_risk_level text, derived_tog_factor numeric, derived_tog_ratio numeric, derived_tog_baseline numeric, derived_tog_latest numeric, derived_tog_recovery_streak integer, derived_tog_applied boolean, metadata jsonb)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
with run as (
  select pr.id,pr.match_id,pr.model_version_id,
         coalesce(mv.parameters->'calibration_map','[]'::jsonb) calibration_map
  from afl.prediction_runs pr
  join afl.model_versions mv on mv.id=pr.model_version_id
  where pr.id=p_prediction_run_id
),
base as (
  select
    pl.id prediction_leg_id,
    r.match_id,
    pl.player_id,
    pl.team_id,
    pl.market,
    pl.threshold,
    pl.raw_probability::numeric control_raw_probability,
    coalesce(pl.calibrated_probability,pl.raw_probability)::numeric control_probability,
    coalesce(nullif(pl.metadata->>'availability_factor','')::numeric,1::numeric) production_availability_factor,
    coalesce(av.status,'unavailable') derived_tog_status,
    coalesce(av.risk_level,'unknown') derived_tog_risk_level,
    coalesce(av.probability_factor,1::numeric) derived_tog_factor,
    av.tog_ratio derived_tog_ratio,
    av.baseline_tog derived_tog_baseline,
    av.latest_tog derived_tog_latest,
    av.recovery_streak derived_tog_recovery_streak,
    r.model_version_id,
    r.calibration_map,
    pl.injury_adjustment,
    av.latest_source_updated_at
  from run r
  join afl.prediction_legs pl on pl.prediction_run_id=r.id
  left join afl.v21_run_availability_asof(p_prediction_run_id,p_cutoff_at) av
    on av.player_id=pl.player_id
  where pl.player_id is not null and pl.threshold is not null
),
factored as (
  select b.*,
    case
      when abs(coalesce(b.injury_adjustment,0))>.000001 then 1::numeric
      when b.production_availability_factor<.999 then 1::numeric
      when b.derived_tog_factor<.999 then b.derived_tog_factor
      else 1::numeric
    end incremental_factor
  from base b
),
shadow as (
  select f.*,
    greatest(.01::numeric,least(.99::numeric,f.control_raw_probability*f.incremental_factor)) shadow_raw
  from factored f
),
calibrated as (
  select s.*,
    coalesce(
      (
        select (e->>'calibrated_probability')::numeric
        from jsonb_array_elements(s.calibration_map) e
        where e->>'market'=s.market
          and s.shadow_raw >= (e->>'lower_bound')::numeric
          and s.shadow_raw < (e->>'upper_bound')::numeric
        limit 1
      ),
      s.shadow_raw
    ) shadow_p
  from shadow s
)
select
  prediction_leg_id,match_id,player_id,team_id,market,threshold,
  round(control_raw_probability,6),
  round(control_probability,6),
  round(shadow_raw,6),
  round(shadow_p,6),
  round(production_availability_factor,4),
  derived_tog_status,
  derived_tog_risk_level,
  round(derived_tog_factor,4),
  derived_tog_ratio,
  derived_tog_baseline,
  derived_tog_latest,
  derived_tog_recovery_streak,
  incremental_factor<.999,
  jsonb_build_object(
    'engine','v2.1-same-bloodline-derived-tog',
    'point_in_time_cutoff',p_cutoff_at,
    'stats_source_updated_cutoff_enforced',true,
    'production_injury_guard',abs(coalesce(injury_adjustment,0))>.000001,
    'production_availability_guard',production_availability_factor<.999,
    'incremental_factor',incremental_factor,
    'latest_source_updated_at',latest_source_updated_at,
    'calibration_source','frozen model-version calibration map'
  )
from calibrated;
$function$


CREATE OR REPLACE FUNCTION afl.v21_validation_report(p_promotion_only boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
with scored as (
  select l.*,v.snapshot_kind,v.promotion_eligible,v.cutoff_minutes_before_start,
         v.lineup_confirmed,v.used_fallback_lineup
  from afl.v21_validation_legs l
  join afl.v21_validation_snapshots v on v.id=l.snapshot_id
  where l.hit is not null
    and l.cluster_weight is not null
    and (not p_promotion_only or v.promotion_eligible)
),
overall as (
  select
    count(distinct snapshot_id)::int matches,
    count(*)::int legs,
    count(distinct (snapshot_id,player_id,market))::int clusters,
    count(*) filter(where derived_tog_applied)::int adjusted_legs,
    count(distinct (snapshot_id,player_id,market)) filter(where derived_tog_applied)::int adjusted_clusters,
    sum(cluster_weight) weight_sum,
    sum(control_brier*cluster_weight)/nullif(sum(cluster_weight),0) control_brier,
    sum(shadow_brier*cluster_weight)/nullif(sum(cluster_weight),0) shadow_brier,
    sum(control_logloss*cluster_weight)/nullif(sum(cluster_weight),0) control_logloss,
    sum(shadow_logloss*cluster_weight)/nullif(sum(cluster_weight),0) shadow_logloss,
    sum(control_brier*cluster_weight) filter(where derived_tog_applied)
      /nullif(sum(cluster_weight) filter(where derived_tog_applied),0) adjusted_control_brier,
    sum(shadow_brier*cluster_weight) filter(where derived_tog_applied)
      /nullif(sum(cluster_weight) filter(where derived_tog_applied),0) adjusted_shadow_brier,
    sum(control_logloss*cluster_weight) filter(where derived_tog_applied)
      /nullif(sum(cluster_weight) filter(where derived_tog_applied),0) adjusted_control_logloss,
    sum(shadow_logloss*cluster_weight) filter(where derived_tog_applied)
      /nullif(sum(cluster_weight) filter(where derived_tog_applied),0) adjusted_shadow_logloss
  from scored
),
control_bins as (
  select width_bucket(control_probability,0::numeric,1::numeric,10) bin,
    sum(cluster_weight) w,
    sum(control_probability*cluster_weight)/sum(cluster_weight) mean_p,
    sum((hit::int)*cluster_weight)/sum(cluster_weight) mean_y
  from scored group by 1
),
shadow_bins as (
  select width_bucket(shadow_probability,0::numeric,1::numeric,10) bin,
    sum(cluster_weight) w,
    sum(shadow_probability*cluster_weight)/sum(cluster_weight) mean_p,
    sum((hit::int)*cluster_weight)/sum(cluster_weight) mean_y
  from scored group by 1
),
cal as (
  select
    (select sum(w*abs(mean_p-mean_y))/nullif(sum(w),0) from control_bins) control_ece,
    (select sum(w*abs(mean_p-mean_y))/nullif(sum(w),0) from shadow_bins) shadow_ece
),
market as (
  select market,
    count(distinct (snapshot_id,player_id,market))::int clusters,
    sum(control_brier*cluster_weight)/sum(cluster_weight) control_brier,
    sum(shadow_brier*cluster_weight)/sum(cluster_weight) shadow_brier,
    sum(control_logloss*cluster_weight)/sum(cluster_weight) control_logloss,
    sum(shadow_logloss*cluster_weight)/sum(cluster_weight) shadow_logloss,
    count(distinct (snapshot_id,player_id,market)) filter(where derived_tog_applied)::int adjusted_clusters
  from scored
  group by market
),
gate as (
  select o.*,c.control_ece,c.shadow_ece,
    (o.control_brier-o.shadow_brier) brier_gain,
    (o.control_logloss-o.shadow_logloss) logloss_gain,
    (o.adjusted_control_brier-o.adjusted_shadow_brier) adjusted_brier_gain,
    (o.adjusted_control_logloss-o.adjusted_shadow_logloss) adjusted_logloss_gain,
    (select count(*) from market
      where clusters>=30 and shadow_brier-control_brier>.005)::int material_market_regressions
  from overall o cross join cal c
)
select jsonb_build_object(
  'status','ok',
  'validation_version','v2.1',
  'scope',case when p_promotion_only then 'promotion_t30_only' else 'all_reference_and_promotion' end,
  'unit','match_x_player_x_market_cluster_weighted',
  'sample',jsonb_build_object(
    'matches',coalesce(g.matches,0),
    'legs',coalesce(g.legs,0),
    'clusters',coalesce(g.clusters,0),
    'adjusted_legs',coalesce(g.adjusted_legs,0),
    'adjusted_clusters',coalesce(g.adjusted_clusters,0)
  ),
  'overall',jsonb_build_object(
    'control_brier',round(g.control_brier,6),
    'shadow_brier',round(g.shadow_brier,6),
    'brier_gain',round(g.brier_gain,6),
    'control_logloss',round(g.control_logloss,6),
    'shadow_logloss',round(g.shadow_logloss,6),
    'logloss_gain',round(g.logloss_gain,6),
    'control_ece',round(g.control_ece,6),
    'shadow_ece',round(g.shadow_ece,6)
  ),
  'adjusted_subset',jsonb_build_object(
    'control_brier',round(g.adjusted_control_brier,6),
    'shadow_brier',round(g.adjusted_shadow_brier,6),
    'brier_gain',round(g.adjusted_brier_gain,6),
    'control_logloss',round(g.adjusted_control_logloss,6),
    'shadow_logloss',round(g.adjusted_shadow_logloss,6),
    'logloss_gain',round(g.adjusted_logloss_gain,6)
  ),
  'by_market',coalesce((
    select jsonb_agg(jsonb_build_object(
      'market',market,'clusters',clusters,'adjusted_clusters',adjusted_clusters,
      'control_brier',round(control_brier,6),'shadow_brier',round(shadow_brier,6),
      'brier_gain',round(control_brier-shadow_brier,6),
      'control_logloss',round(control_logloss,6),'shadow_logloss',round(shadow_logloss,6),
      'logloss_gain',round(control_logloss-shadow_logloss,6)
    ) order by market)
    from market
  ),'[]'::jsonb),
  'promotion_gate',jsonb_build_object(
    'decision',case
      when not p_promotion_only then 'REFERENCE_ONLY'
      when coalesce(g.matches,0)<10 then 'INSUFFICIENT_MATCHES'
      when coalesce(g.clusters,0)<300 then 'INSUFFICIENT_CLUSTERS'
      when coalesce(g.adjusted_clusters,0)<20 then 'INSUFFICIENT_ADJUSTED_CLUSTERS'
      when coalesce(g.brier_gain,-999)<=0 then 'FAIL_GLOBAL_BRIER'
      when coalesce(g.logloss_gain,-999)<=0 then 'FAIL_GLOBAL_LOGLOSS'
      when coalesce(g.adjusted_brier_gain,-999)<=0 then 'FAIL_ADJUSTED_BRIER'
      when coalesce(g.adjusted_logloss_gain,-999)<=0 then 'FAIL_ADJUSTED_LOGLOSS'
      when coalesce(g.shadow_ece,999)>coalesce(g.control_ece,999)+.005 then 'FAIL_CALIBRATION'
      when coalesce(g.material_market_regressions,0)>0 then 'FAIL_MARKET_REGRESSION'
      else 'PASS'
    end,
    'minimum_matches',10,
    'minimum_clusters',300,
    'minimum_adjusted_clusters',20,
    'requires_positive_global_brier_gain',true,
    'requires_positive_global_logloss_gain',true,
    'requires_positive_adjusted_brier_gain',true,
    'requires_positive_adjusted_logloss_gain',true,
    'max_ece_regression',.005,
    'market_regression_threshold_brier',.005,
    'material_market_regressions',coalesce(g.material_market_regressions,0)
  )
)
from gate g;
$function$


CREATE OR REPLACE FUNCTION afl.v21_validation_tick()
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  r record;
  x jsonb;
  gate jsonb;
  captured integer:=0;
  settled integer:=0;
  settled_promotion integer:=0;
begin
  for r in
    select e.id event_id,e.match_id
    from afl.workflow_events e
    join afl.matches m on m.id=e.match_id
    where e.event_type='pregame_sync'
      and coalesce((e.metadata->>'offset_minutes')::integer,0)=-30
      and e.status='ok'
      and e.completed_at is not null
      and m.start_time>now()-interval '90 minutes'
      and m.start_time<now()+interval '90 minutes'
      and not exists(
        select 1 from afl.v21_validation_snapshots v
        where v.match_id=e.match_id and v.snapshot_kind='t30_live'
      )
    order by e.completed_at
    limit 2
  loop
    x:=afl.v21_capture_t30(r.match_id,r.event_id);
    if x->>'status'='captured' then captured:=captured+1; end if;
  end loop;

  for r in
    select v.id,v.promotion_eligible
    from afl.v21_validation_snapshots v
    join afl.matches m on m.id=v.match_id
    where m.status='final'
      and v.settled_at is null
      and exists(select 1 from afl.player_game_stats s where s.match_id=v.match_id)
    order by m.start_time
    limit 4
  loop
    x:=afl.v21_settle_snapshot(r.id);
    if x->>'status'='settled' then
      settled:=settled+1;
      if r.promotion_eligible then settled_promotion:=settled_promotion+1; end if;
    end if;
  end loop;

  if settled_promotion>0 then
    gate:=afl.v21_record_gate();
  end if;

  return jsonb_build_object(
    'status','ok',
    'captured',captured,
    'settled',settled,
    'settled_promotion',settled_promotion,
    'gate',coalesce(gate,'{}'::jsonb)
  );
end;
$function$


-- Existing afl.event_driven_tick() in production calls afl.v21_validation_tick()
-- once per master tick. No additional pg_cron job is created.
-- See database/database_health_hardening_v67.sql for the master scheduler body.
