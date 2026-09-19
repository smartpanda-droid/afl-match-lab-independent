-- AFL Match Lab — Simulation V2 Shadow
-- Shadow-only reinforcement layer. Does NOT replace the active production model.
-- Purpose:
--   1) surface derived TOG/availability risk that production currently records but does not
--      apply unless an explicit injury is active;
--   2) translate selected-lineup availability risk into a small, bounded team scoring effect;
--   3) turn the current closed-form match quote into a deterministic simulation distribution
--      with scenario-informed uncertainty.
--
-- Promotion rule: do not wire this into Production until genuine frozen T-30 observations
-- show non-inferior/improved Brier + LogLoss versus the current control.

create or replace function afl.shadow_v2_team_availability(p_match_id uuid)
returns table(
  team_id uuid,
  roster_size integer,
  risk_players integer,
  weighted_risk numeric,
  score_factor numeric,
  metadata jsonb
)
language sql
stable
set search_path=''
as $function$
with target as (
  select id,start_time from afl.matches where id=p_match_id
), roster as (
  select mp.team_id,mp.player_id
  from afl.match_players mp
  where mp.match_id=p_match_id and not mp.emergency
), importance as (
  select r.team_id,r.player_id,
    greatest(20::numeric,coalesce((
      select avg(x.fantasy_points)::numeric
      from (
        select s.fantasy_points
        from afl.player_game_stats s
        join afl.matches m on m.id=s.match_id
        cross join target t
        where s.player_id=r.player_id
          and m.status='final'
          and m.start_time<t.start_time
          and s.fantasy_points is not null
        order by m.start_time desc
        limit 8
      ) x
    ),50::numeric)) importance_score,
    coalesce(av.probability_factor,1::numeric) availability_factor,
    coalesce(av.status,'unknown') availability_status,
    coalesce(av.risk_level,'low') risk_level,
    coalesce(av.source,'none') availability_source
  from roster r
  left join afl.player_availability_state av on av.player_id=r.player_id
), weighted as (
  select i.*,
    importance_score/nullif(sum(importance_score) over(partition by team_id),0) importance_share
  from importance i
), team as (
  select team_id,
    count(*)::int roster_size,
    count(*) filter(where availability_factor<.98)::int risk_players,
    coalesce(sum(importance_share*(1-availability_factor)),0)::numeric weighted_risk,
    jsonb_agg(
      jsonb_build_object(
        'player_id',player_id,
        'importance_share',round(importance_share,4),
        'availability_factor',availability_factor,
        'status',availability_status,
        'risk_level',risk_level,
        'source',availability_source
      )
      order by importance_share desc
    ) filter(where availability_factor<.98) risk_detail
  from weighted
  group by team_id
)
select team_id,roster_size,risk_players,
  round(weighted_risk,6),
  round(greatest(.92::numeric,least(1.00::numeric,1-.75*weighted_risk)),6) score_factor,
  jsonb_build_object(
    'engine','shadow-v2-lineup-availability',
    'importance_basis','last8 fantasy average with bounded fallback',
    'risk_drag_multiplier',.75,
    'score_factor_cap','0.92-1.00',
    'risk_detail',coalesce(risk_detail,'[]'::jsonb)
  )
from team;
$function$;

revoke all on function afl.shadow_v2_team_availability(uuid)
from public,anon,authenticated;


create or replace function afl.shadow_v2_player_legs(p_prediction_run_id uuid)
returns table(
  prediction_leg_id uuid,
  player_id uuid,
  market text,
  threshold numeric,
  control_probability numeric,
  shadow_probability numeric,
  probability_delta numeric,
  derived_tog_applied boolean,
  availability_status text,
  availability_risk_level text,
  availability_factor numeric,
  metadata jsonb
)
language sql
stable
set search_path=''
as $function$
with legs as (
  select pl.*,pr.model_version_id,
    coalesce(nullif(pl.metadata->>'availability_factor','')::numeric,1::numeric) production_availability_factor
  from afl.prediction_legs pl
  join afl.prediction_runs pr on pr.id=pl.prediction_run_id
  where pl.prediction_run_id=p_prediction_run_id
), x as (
  select l.*,
    coalesce(av.probability_factor,1::numeric) current_availability_factor,
    coalesce(av.status,'unknown') availability_status,
    coalesce(av.risk_level,'low') availability_risk_level,
    coalesce(av.source,'none') availability_source,
    case
      when l.production_availability_factor<.999 then 1::numeric
      when coalesce(av.explicit_injury,false) then 1::numeric
      when coalesce(av.probability_factor,1)<.999 then coalesce(av.probability_factor,1)
      else 1::numeric
    end incremental_factor
  from legs l
  left join afl.player_availability_state av on av.player_id=l.player_id
), y as (
  select x.*,
    greatest(.01::numeric,least(.99::numeric,x.raw_probability*x.incremental_factor)) shadow_raw
  from x
)
select id,player_id,market,threshold,
  round(coalesce(calibrated_probability,raw_probability),6) control_probability,
  round(afl.calibrate_probability(model_version_id,market,shadow_raw),6) shadow_probability,
  round(
    afl.calibrate_probability(model_version_id,market,shadow_raw)
    -coalesce(calibrated_probability,raw_probability),6
  ) probability_delta,
  incremental_factor<.999 derived_tog_applied,
  availability_status,availability_risk_level,
  round(current_availability_factor,4),
  jsonb_build_object(
    'engine','shadow-v2-derived-tog',
    'production_availability_factor',production_availability_factor,
    'incremental_factor',incremental_factor,
    'availability_source',availability_source,
    'double_penalty_guard',true,
    'bench_penalty_added',false,
    'note','Only derived TOG risk not already represented by the production injury factor is applied'
  )
from y;
$function$;

revoke all on function afl.shadow_v2_player_legs(uuid)
from public,anon,authenticated;


create or replace function afl.match_simulation_v2_shadow(
  p_match_id uuid,
  p_line numeric default null,
  p_total numeric default null,
  p_draws integer default 4000
)
returns jsonb
language plpgsql
stable
set search_path=''
as $function$
declare
  q record;
  m record;
  ctx jsonb;
  h record;
  a record;
  home_factor numeric:=1;
  away_factor numeric:=1;
  close_w numeric:=.25;
  blowout_w numeric:=.20;
  low_w numeric:=.15;
  comeback_w numeric:=.12;
  margin_mu numeric;
  total_mu numeric;
  margin_sd_v2 numeric;
  total_sd_v2 numeric;
  r record;
begin
  if p_draws<500 or p_draws>10000 then
    return jsonb_build_object('status','invalid_draw_count','min',500,'max',10000);
  end if;

  select * into q
  from public.afl_match_market_quote(p_match_id,p_line,p_total);
  if q.match_id is null then
    return jsonb_build_object('status','not_found_or_insufficient_history');
  end if;

  select * into m from afl.matches where id=p_match_id;
  select scenario_weights into ctx from afl.match_context where match_id=p_match_id;

  close_w:=coalesce(nullif(ctx->>'close_contest','')::numeric,close_w);
  blowout_w:=coalesce(nullif(ctx->>'blowout_garbage_time','')::numeric,blowout_w);
  low_w:=coalesce(nullif(ctx->>'low_scoring_defensive','')::numeric,low_w);
  comeback_w:=coalesce(nullif(ctx->>'momentum_comeback','')::numeric,comeback_w);

  select * into h
  from afl.shadow_v2_team_availability(p_match_id)
  where team_id=m.home_team_id;
  select * into a
  from afl.shadow_v2_team_availability(p_match_id)
  where team_id=m.away_team_id;

  home_factor:=coalesce(h.score_factor,1);
  away_factor:=coalesce(a.score_factor,1);

  -- Keep the current match mean as the anchor. Availability can only trim the mean;
  -- context scenarios alter uncertainty, not the mean, to avoid double-counting team form.
  margin_mu:=q.predicted_home_score*home_factor-q.predicted_away_score*away_factor;
  total_mu:=q.predicted_home_score*home_factor+q.predicted_away_score*away_factor;

  margin_sd_v2:=q.margin_sd
    * greatest(.85::numeric,least(1.25::numeric,
        1 + .10*blowout_w + .12*comeback_w - .08*close_w));
  total_sd_v2:=q.total_sd
    * greatest(.85::numeric,least(1.20::numeric,
        1 + .08*blowout_w - .10*low_w));

  with draws as (
    select i,
      ((hashtextextended(p_match_id::text||':m1:'||i::text,0) & 2147483647)::numeric+.5)/2147483648 u1,
      ((hashtextextended(p_match_id::text||':m2:'||i::text,0) & 2147483647)::numeric+.5)/2147483648 u2,
      ((hashtextextended(p_match_id::text||':t1:'||i::text,0) & 2147483647)::numeric+.5)/2147483648 u3,
      ((hashtextextended(p_match_id::text||':t2:'||i::text,0) & 2147483647)::numeric+.5)/2147483648 u4
    from generate_series(1,p_draws) g(i)
  ), normals as (
    select i,
      sqrt(-2*ln(greatest(u1,.000000001)))*cos(2*pi()*u2) z_margin,
      sqrt(-2*ln(greatest(u3,.000000001)))*cos(2*pi()*u4) z_total
    from draws
  ), sim as (
    select
      margin_mu+margin_sd_v2*z_margin margin,
      greatest(0::numeric,total_mu+total_sd_v2*z_total) total
    from normals
  ), scores as (
    select margin,total,
      greatest(0::numeric,(total+margin)/2) home_score,
      greatest(0::numeric,(total-margin)/2) away_score
    from sim
  )
  select
    avg((margin>0)::int)::numeric home_win_p,
    avg((margin<0)::int)::numeric away_win_p,
    avg((margin+q.quoted_line>0)::int)::numeric home_cover_p,
    avg((margin+q.quoted_line<0)::int)::numeric away_cover_p,
    avg((total>q.quoted_total)::int)::numeric over_p,
    avg((total<q.quoted_total)::int)::numeric under_p,
    percentile_cont(.10) within group(order by home_score) home_p10,
    percentile_cont(.50) within group(order by home_score) home_p50,
    percentile_cont(.90) within group(order by home_score) home_p90,
    percentile_cont(.10) within group(order by away_score) away_p10,
    percentile_cont(.50) within group(order by away_score) away_p50,
    percentile_cont(.90) within group(order by away_score) away_p90,
    percentile_cont(.10) within group(order by margin) margin_p10,
    percentile_cont(.50) within group(order by margin) margin_p50,
    percentile_cont(.90) within group(order by margin) margin_p90,
    percentile_cont(.10) within group(order by total) total_p10,
    percentile_cont(.50) within group(order by total) total_p50,
    percentile_cont(.90) within group(order by total) total_p90
  into r
  from scores;

  return jsonb_build_object(
    'status','ok',
    'engine','simulation-v2-shadow',
    'mode','shadow_only',
    'draws',p_draws,
    'match_id',p_match_id,
    'control',jsonb_build_object(
      'model_method',q.model_method,
      'predicted_home_score',q.predicted_home_score,
      'predicted_away_score',q.predicted_away_score,
      'predicted_margin',q.predicted_margin,
      'predicted_total',q.predicted_total,
      'home_win_probability',q.home_win_probability,
      'away_win_probability',q.away_win_probability,
      'home_cover_probability',q.home_cover_probability,
      'away_cover_probability',q.away_cover_probability,
      'over_probability',q.over_probability,
      'under_probability',q.under_probability,
      'margin_sd',q.margin_sd,
      'total_sd',q.total_sd,
      'quoted_line',q.quoted_line,
      'quoted_total',q.quoted_total
    ),
    'shadow',jsonb_build_object(
      'mean_home_score',round(q.predicted_home_score*home_factor,2),
      'mean_away_score',round(q.predicted_away_score*away_factor,2),
      'mean_margin',round(margin_mu,2),
      'mean_total',round(total_mu,2),
      'margin_sd',round(margin_sd_v2,2),
      'total_sd',round(total_sd_v2,2),
      'home_win_probability',round(r.home_win_p,4),
      'away_win_probability',round(r.away_win_p,4),
      'home_cover_probability',round(r.home_cover_p,4),
      'away_cover_probability',round(r.away_cover_p,4),
      'over_probability',round(r.over_p,4),
      'under_probability',round(r.under_p,4),
      'home_score_p10_p50_p90',jsonb_build_array(round(r.home_p10::numeric,1),round(r.home_p50::numeric,1),round(r.home_p90::numeric,1)),
      'away_score_p10_p50_p90',jsonb_build_array(round(r.away_p10::numeric,1),round(r.away_p50::numeric,1),round(r.away_p90::numeric,1)),
      'margin_p10_p50_p90',jsonb_build_array(round(r.margin_p10::numeric,1),round(r.margin_p50::numeric,1),round(r.margin_p90::numeric,1)),
      'total_p10_p50_p90',jsonb_build_array(round(r.total_p10::numeric,1),round(r.total_p50::numeric,1),round(r.total_p90::numeric,1))
    ),
    'availability',jsonb_build_object(
      'home_score_factor',home_factor,
      'away_score_factor',away_factor,
      'home',coalesce(h.metadata,'{}'::jsonb),
      'away',coalesce(a.metadata,'{}'::jsonb)
    ),
    'scenario_uncertainty',jsonb_build_object(
      'close_contest',close_w,
      'blowout_garbage_time',blowout_w,
      'low_scoring_defensive',low_w,
      'momentum_comeback',comeback_w,
      'mean_shift_from_scenario',false,
      'variance_only',true
    ),
    'guards',jsonb_build_object(
      'production_unchanged',true,
      'deterministic_seed',true,
      'synergy_mean_boost',false,
      'promotion_requires_formal_validation',true
    )
  );
end;
$function$;

revoke all on function afl.match_simulation_v2_shadow(uuid,numeric,numeric,integer)
from public,anon,authenticated;
