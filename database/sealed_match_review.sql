-- Review evidence stays separate from immutable pregame snapshots.
create table afl.review_data_status (
 match_id uuid primary key references afl.matches(id), stats_complete boolean not null default false,
 stats_received_at timestamptz, score_received_at timestamptz
);
alter table afl.review_data_status enable row level security;
create table public.afl_api_match_reviews (
 match_id uuid primary key, start_time timestamptz not null, home_team_name text, away_team_name text,
 frozen_at timestamptz, status text not null, summary jsonb not null, detail jsonb not null,
 updated_at timestamptz not null default now()
);
alter table public.afl_api_match_reviews enable row level security;
create policy review_public_read on public.afl_api_match_reviews for select to anon,authenticated using (true);
revoke all on public.afl_api_match_reviews from anon,authenticated;
grant select on public.afl_api_match_reviews to anon,authenticated;

create function afl.review_leg(p_match uuid,p_leg jsonb)
returns jsonb language plpgsql stable set search_path='' as $$
declare m afl.matches%rowtype; a numeric; th numeric:=nullif(p_leg->>'threshold','')::numeric;
 market text:=p_leg->>'market'; side text:=coalesce(p_leg->>'side',p_leg#>>'{metadata,side}');
 pid uuid:=nullif(p_leg->>'player_id','')::uuid; result text:='pending'; complete boolean;
begin
 select * into m from afl.matches where id=p_match;
 select stats_complete into complete from afl.review_data_status where match_id=p_match;
 if m.status='cancelled' then result:='void';
 elsif m.status='final' and m.home_score is not null and m.away_score is not null then
  if pid is not null then
   if complete then
    a:=afl.actual_stat_value(p_match,pid,market);
    if not exists(select 1 from afl.player_game_stats where match_id=p_match and player_id=pid) then result:='void';
    elsif a is not null and th is not null then result:=case when a>=th then 'hit' else 'miss' end; end if;
   end if;
  elsif market in ('match_winner','moneyline','win') then
   a:=case when side='away' then m.away_score-m.home_score else m.home_score-m.away_score end;
   result:=case when a=0 then 'push' when a>0 then 'hit' else 'miss' end;
  elsif market in ('total','total_points') then
   a:=m.home_score+m.away_score;
   if th is not null then result:=case when a=th then 'push' when (side='under' and a<th) or (side='over' and a>th) then 'hit' else 'miss' end; end if;
  elsif market in ('handicap','spread') then
   a:=case when side='away' then m.away_score-m.home_score else m.home_score-m.away_score end;
   if th is not null then result:=case when a+th=0 then 'push' when a+th>0 then 'hit' else 'miss' end; end if;
  end if;
 end if;
 return jsonb_build_object('id',coalesce(p_leg->>'id',p_leg->>'prediction_leg_id'),'player_id',pid,
  'player_name',coalesce(p_leg->>'player_name',p_leg#>>'{metadata,player_name}'),
  'market',market,'selection',p_leg->>'selection','threshold',th,'side',side,
  'probability',coalesce(nullif(p_leg->'calibrated_probability','null'::jsonb),nullif(p_leg->'raw_probability','null'::jsonb),p_leg->'probability'),
  'fair_odds',p_leg->'fair_odds','actual_value',a,'result',result);
end $$;

create function afl.review_summary(p_rows jsonb) returns jsonb language sql immutable set search_path='' as $$
 select jsonb_build_object('total',count(*),'hits',count(*) filter(where x->>'result'='hit'),
 'misses',count(*) filter(where x->>'result'='miss'),'pending',count(*) filter(where x->>'result'='pending'),
 'void',count(*) filter(where x->>'result' in ('void','push')),
 'hit_rate',count(*) filter(where x->>'result'='hit')::numeric/nullif(count(*) filter(where x->>'result' in ('hit','miss')),0))
 from jsonb_array_elements(coalesce(p_rows,'[]'::jsonb)) x
$$;

create function afl.refresh_match_review(p_match uuid) returns jsonb language plpgsql set search_path='' as $$
declare m record; s afl.final_prediction_snapshots%rowtype; rs afl.final_recommendation_snapshots%rowtype;
 legs jsonb; multis jsonb:='[]'; r jsonb; lr jsonb; ms jsonb; result text; summary jsonb; state text;
begin
 select a.*,h.name hn,w.name an into m from afl.matches a join afl.teams h on h.id=a.home_team_id join afl.teams w on w.id=a.away_team_id where a.id=p_match;
 if m.start_time+interval '10 minutes'>now() then return jsonb_build_object('status','not_archived'); end if;
 select * into s from afl.final_prediction_snapshots where match_id=p_match;
 select * into rs from afl.final_recommendation_snapshots where match_id=p_match;
 select coalesce(jsonb_agg(afl.review_leg(p_match,x)),'[]') into legs
 from jsonb_array_elements(coalesce(s.snapshot->'prediction_legs','[]')||coalesce(s.snapshot->'match_market_legs','[]')) x;
 for r in select value from jsonb_array_elements(coalesce(rs.snapshot->'recommendations',s.snapshot->'multi_recommendations','[]')) loop
  select coalesce(jsonb_agg(coalesce((select x from jsonb_array_elements(legs) x where x->>'id'=l->>'prediction_leg_id' limit 1),afl.review_leg(p_match,l))),'[]') into lr from jsonb_array_elements(coalesce(r->'legs','[]')) l;
  ms:=afl.review_summary(lr);
  result:=case when (ms->>'pending')::int>0 or (ms->>'total')::int=0 then 'pending'
    when (ms->>'misses')::int>0 then 'miss' when (ms->>'void')::int>0 then 'void' else 'hit' end;
  multis:=multis||jsonb_build_array(jsonb_build_object('strategy',r->>'strategy','leg_count',r->'leg_count','rank',r->'rank',
    'probability',r->'combined_probability','fair_odds',r->'fair_odds','result',result,'legs',lr));
 end loop;
 summary:=afl.review_summary(legs)||jsonb_build_object('multis',afl.review_summary(multis),
   'match_markets_frozen',jsonb_array_length(coalesce(s.snapshot->'match_market_legs','[]'))>0,
   'home_score',m.home_score,'away_score',m.away_score,'match_status',m.status);
 state:=case when s.id is null then 'no_snapshot' when (summary->>'total')::int=0 or (summary->>'pending')::int>0 or (summary#>>'{multis,pending}')::int>0 then 'pending' else 'verified' end;
 insert into public.afl_api_match_reviews(match_id,start_time,home_team_name,away_team_name,frozen_at,status,summary,detail,updated_at)
 values(p_match,m.start_time,m.hn,m.an,s.frozen_at,state,summary,jsonb_build_object('snapshot_id',s.id,'snapshot_sha256',s.snapshot_sha256,
  'model_version_id',s.model_version_id,'predicted_scores',s.snapshot->'match_market_quote','legs',legs,'multis',multis),now())
 on conflict(match_id) do update set start_time=excluded.start_time,home_team_name=excluded.home_team_name,away_team_name=excluded.away_team_name,
 frozen_at=excluded.frozen_at,status=excluded.status,summary=excluded.summary,detail=excluded.detail,updated_at=excluded.updated_at;
 if s.id is not null then update afl.final_prediction_snapshots set settled=state='verified',settled_at=case when state='verified' then coalesce(settled_at,now()) else null end where id=s.id; end if;
 return summary||jsonb_build_object('status',state);
end $$;

-- A read-only scoreboard request is retried while completed match data is incomplete.
create function afl.review_tick() returns jsonb language plpgsql set search_path='' as $$
declare r record; x jsonb; req bigint; n int:=0;
begin
 if not pg_try_advisory_xact_lock(714260980::bigint) then return '{"status":"busy"}'; end if;
 for r in select q.request_id,h.status_code,h.content from afl_source.requests q join net._http_response h on h.id=q.request_id where q.request_type='review_scores' and q.status='pending' loop
  begin
   if r.status_code<>200 then raise exception 'Scoreboard HTTP %',r.status_code; end if;
   for x in select value from jsonb_array_elements(r.content::jsonb->'matches') loop
    if x->>'status'='CONCLUDED' and x#>>'{home,score,totalScore}' is not null and x#>>'{away,score,totalScore}' is not null then
     update afl.matches set status='final',home_score=(x#>>'{home,score,totalScore}')::int,away_score=(x#>>'{away,score,totalScore}')::int,source_updated_at=now(),updated_at=now() where external_id=x->>'id';
     insert into afl.review_data_status(match_id,score_received_at) select id,now() from afl.matches where external_id=x->>'id'
     on conflict(match_id) do update set score_received_at=excluded.score_received_at;
    end if;
   end loop;
   update afl_source.requests set status='ok',completed_at=now(),http_status=r.status_code where request_id=r.request_id;
  exception when others then
   update afl_source.requests set status='failed',completed_at=now(),error_message=left(sqlerrm,500) where request_id=r.request_id;
  end;
 end loop;
 update afl_source.requests set status='failed',error_message='Scoreboard response timeout',completed_at=now() where request_type='review_scores' and status='pending' and requested_at<now()-interval '3 minutes';
 if exists(select 1 from afl.matches m where m.start_time+interval '8 hours'<=now() and m.start_time>now()-interval '7 days' and exists(select 1 from afl.final_prediction_snapshots s where s.match_id=m.id) and (m.status<>'final' or m.home_score is null or m.away_score is null))
 and not exists(select 1 from afl_source.requests where request_type='review_scores' and requested_at>now()-interval '5 minutes') then
  select net.http_get(url:='https://aflapi.afl.com.au/afl/v2/matches?compSeasonId=85&pageSize=1000',headers:='{"Accept":"application/json"}',timeout_milliseconds:=30000) into req;
  insert into afl_source.requests(request_id,request_type) values(req,'review_scores');
 end if;
 for r in select m.id,m.start_time from afl.matches m where m.start_time+interval '10 minutes'<=now()
 and (exists(select 1 from afl.workflow_events e where e.match_id=m.id and e.event_type='postmatch_settle') or exists(select 1 from afl.final_prediction_snapshots f where f.match_id=m.id))
 and not exists(select 1 from public.afl_api_match_reviews v where v.match_id=m.id and v.status='verified') loop
  if r.start_time+interval '8 hours'<=now() and exists(select 1 from afl.final_prediction_snapshots where match_id=r.id) then
   if not coalesce((select stats_complete from afl.review_data_status where match_id=r.id),false) and r.start_time>now()-interval '7 days' then
    perform afl.queue_postmatch_stats(r.id);
   end if;
   if exists(select 1 from afl.matches where id=r.id and status='final') then perform afl.settle_match(r.id); end if;
  end if;
  perform afl.refresh_match_review(r.id); n:=n+1;
 end loop;
 return jsonb_build_object('status','ok','processed',n);
end $$;

revoke all on function afl.review_leg(uuid,jsonb),afl.review_summary(jsonb),afl.refresh_match_review(uuid),afl.review_tick() from public,anon,authenticated;
select cron.schedule('afl-match-review','* * * * *','select afl.review_tick()');

create function afl.freeze_match_market_legs(p_match uuid) returns jsonb language sql stable set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id','match:'||q.match_id||':'||v.key,'market',v.market,'side',v.side,'threshold',v.threshold,
 'selection',v.label,'probability',v.p,'fair_odds',round(1/nullif(v.p,0),3))),'[]')
 from public.afl_match_market_quote(p_match,null,null) q cross join lateral (values
 ('home_win','match_winner','home',0::numeric,q.home_team_name||' Win',q.home_win_probability),
 ('away_win','match_winner','away',0::numeric,q.away_team_name||' Win',q.away_win_probability),
 ('over','total','over',q.quoted_total,'Over '||q.quoted_total,q.over_probability),
 ('under','total','under',q.quoted_total,'Under '||q.quoted_total,q.under_probability),
 ('home_handicap','handicap','home',q.quoted_line,q.home_team_name||' Handicap '||q.quoted_line,q.home_cover_probability),
 ('away_handicap','handicap','away',-q.quoted_line,q.away_team_name||' Handicap '||(-q.quoted_line),q.away_cover_probability)
 ) v(key,market,side,threshold,label,p)
$$;
revoke all on function afl.freeze_match_market_legs(uuid) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION afl.freeze_final_prediction(p_workflow_event_id bigint, p_claim_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  ev afl.workflow_events%rowtype;
  data_row afl.final_data_snapshots%rowtype;
  mv uuid;
  run_id uuid;
  leg_count integer;
  multi_count integer;
  prediction_json jsonb;
  digest_hex text;
  existing_id uuid;
begin
  select * into ev from afl.workflow_events
  where id=p_workflow_event_id and event_type='final_prediction' and status='running' and claim_token=p_claim_token
  for update;
  if not found then raise exception 'final_prediction workflow event is not claimed by this token'; end if;

  perform afl.freeze_final_data(p_workflow_event_id,p_claim_token);
  select * into data_row from afl.final_data_snapshots where match_id=ev.match_id;

  select id into existing_id from afl.final_prediction_snapshots where match_id=ev.match_id;
  if existing_id is not null then return jsonb_build_object('status','already_frozen','snapshot_id',existing_id); end if;

  select id into mv from afl.model_versions where status='active' order by activated_at desc nulls last, created_at desc limit 1;
  if mv is null then raise exception 'no active model version'; end if;

  select pr.id into run_id
  from afl.prediction_runs pr
  where pr.match_id=ev.match_id and pr.is_final=true and pr.model_version_id=mv
  order by pr.generated_at desc limit 1;

  if run_id is null then
    return jsonb_build_object('status','awaiting_model','data_snapshot_id',data_row.id,'model_version_id',mv);
  end if;

  select count(*) into leg_count from afl.prediction_legs where prediction_run_id=run_id;
  if leg_count=0 then
    return jsonb_build_object('status','awaiting_model_legs','data_snapshot_id',data_row.id,'prediction_run_id',run_id);
  end if;

  if not exists(select 1 from afl.multi_recommendations where prediction_run_id=run_id) then
    perform afl.generate_multi_recommendations(run_id);
  end if;
  select count(*) into multi_count from afl.multi_recommendations where prediction_run_id=run_id;

  prediction_json := jsonb_build_object(
    'schema_version',3,
    'match_market_quote',(select to_jsonb(q) from public.afl_match_market_quote(ev.match_id,null,null) q),
    'match_market_legs',afl.freeze_match_market_legs(ev.match_id),
    'data_snapshot_id',data_row.id,
    'data_snapshot_sha256',data_row.snapshot_sha256,
    'model_version_id',mv,
    'prediction_run_id',run_id,
    'prediction_legs',(
      select jsonb_agg(jsonb_build_object(
        'id',pl.id,'player_id',pl.player_id,'team_id',pl.team_id,'market',pl.market,'threshold',pl.threshold,'selection',pl.selection,
        'raw_probability',pl.raw_probability,'calibrated_probability',pl.calibrated_probability,'fair_odds',pl.fair_odds,
        'injury_adjustment',pl.injury_adjustment,'tog_adjustment',pl.tog_adjustment,'role_adjustment',pl.role_adjustment,
        'opponent_adjustment',pl.opponent_adjustment,'scenario_adjustment',pl.scenario_adjustment,'metadata',pl.metadata
      ) order by pl.created_at, pl.id)
      from afl.prediction_legs pl where pl.prediction_run_id=run_id
    ),
    'multi_recommendations',(
      select jsonb_agg(jsonb_build_object(
        'id',mr.id,'strategy',mr.strategy,'leg_count',mr.leg_count,'rank',mr.rank_in_group,
        'combined_probability',mr.combined_probability,'fair_odds',mr.fair_odds,
        'target_odds_min',mr.target_odds_min,'target_odds_max',mr.target_odds_max,
        'correlation_penalty',mr.correlation_penalty,'recommended',mr.recommended,'metadata',mr.metadata,
        'legs',(
          select jsonb_agg(jsonb_build_object('prediction_leg_id',pl.id,'selection',pl.selection,'probability',coalesce(pl.calibrated_probability,pl.raw_probability)) order by ml.leg_order)
          from afl.multi_legs ml join afl.prediction_legs pl on pl.id=ml.prediction_leg_id where ml.multi_id=mr.id
        )
      ) order by mr.strategy,mr.leg_count,mr.rank_in_group)
      from afl.multi_recommendations mr where mr.prediction_run_id=run_id
    ),
    'frozen_at',now()
  );
  digest_hex := encode(extensions.digest(convert_to(prediction_json::text,'UTF8'),'sha256'),'hex');

  insert into afl.final_prediction_snapshots(match_id,prediction_run_id,model_version_id,workflow_event_id,source_cutoff_at,lineup_confirmed,used_fallback_lineup,snapshot,snapshot_sha256,model_ready)
  values(ev.match_id,run_id,mv,ev.id,data_row.source_cutoff_at,data_row.lineup_confirmed,data_row.used_fallback_lineup,prediction_json,digest_hex,true);

  return jsonb_build_object('status','prediction_frozen','prediction_run_id',run_id,'prediction_leg_count',leg_count,'multi_count',multi_count,'snapshot_sha256',digest_hex);
end;
$function$;

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
    select 'home'::text as side,x as item from jsonb_array_elements(coalesce(p_payload->'homeTeamPlayerStats','[]'::jsonb)) x
    union all
    select 'away'::text as side,x as item from jsonb_array_elements(coalesce(p_payload->'awayTeamPlayerStats','[]'::jsonb)) x
  loop
    side:=rec.side;
    ext_player_id:=coalesce(rec.item#>>'{player,player,player,playerId}',rec.item#>>'{playerStats,player,playerId}');
    player_name:=trim(coalesce(rec.item#>>'{player,player,player,playerName,givenName}',rec.item#>>'{playerStats,player,playerName,givenName}','') || ' ' || coalesce(rec.item#>>'{player,player,player,playerName,surname}',rec.item#>>'{playerStats,player,playerName,surname}',''));
    team_provider:=coalesce(rec.item->>'teamId',rec.item#>>'{playerStats,teamId}');
    if coalesce(ext_player_id,'')='' then continue; end if;

    select t.id into team_uuid from afl.teams t where t.external_id=team_provider limit 1;
    if team_uuid is null then select case when side='home' then m.home_team_id else m.away_team_id end into team_uuid from afl.matches m where m.id=p_match_id; end if;

    insert into afl.players(external_id,team_id,name,updated_at)
    values(ext_player_id,team_uuid,coalesce(nullif(player_name,''),ext_player_id),pg_catalog.now())
    on conflict(external_id) do update set team_id=coalesce(excluded.team_id,afl.players.team_id),name=excluded.name,updated_at=pg_catalog.now()
    returning id into pid;

    insert into afl.player_game_stats(
      match_id,player_id,disposals,kicks,handballs,marks,tackles,goals,behinds,hitouts,clearances,fantasy_points,tog_pct,
      intercepts,inside50s,contested_possessions,uncontested_possessions,metres_gained,centre_clearances,stoppage_clearances,
      pressure_acts,score_involvements,disposal_efficiency,hitouts_to_advantage,source_updated_at
    ) values (
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
      pg_catalog.now()
    )
    on conflict(match_id,player_id) do update set
      disposals=excluded.disposals,kicks=excluded.kicks,handballs=excluded.handballs,marks=excluded.marks,tackles=excluded.tackles,
      goals=excluded.goals,behinds=excluded.behinds,hitouts=excluded.hitouts,clearances=excluded.clearances,fantasy_points=excluded.fantasy_points,
      tog_pct=excluded.tog_pct,intercepts=excluded.intercepts,inside50s=excluded.inside50s,contested_possessions=excluded.contested_possessions,
      uncontested_possessions=excluded.uncontested_possessions,metres_gained=excluded.metres_gained,centre_clearances=excluded.centre_clearances,
      stoppage_clearances=excluded.stoppage_clearances,pressure_acts=excluded.pressure_acts,score_involvements=excluded.score_involvements,
      disposal_efficiency=excluded.disposal_efficiency,hitouts_to_advantage=excluded.hitouts_to_advantage,source_updated_at=excluded.source_updated_at;
    written:=written+1;
  end loop;
  insert into afl.review_data_status(match_id,stats_complete,stats_received_at)
  values(p_match_id,jsonb_array_length(coalesce(p_payload->'homeTeamPlayerStats','[]'))>=22 and jsonb_array_length(coalesce(p_payload->'awayTeamPlayerStats','[]'))>=22,now())
  on conflict(match_id) do update set stats_complete=excluded.stats_complete,stats_received_at=excluded.stats_received_at;
  return jsonb_build_object('status','ok','rows_written',written);
end;
$function$;

CREATE OR REPLACE FUNCTION afl.settle_match(p_match_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare run_id uuid; mv uuid; total_n integer; settled_n integer; hit_n integer; miss_n integer; multi_n integer; multi_hit_n integer; brier numeric; ll numeric;
begin
  select f.prediction_run_id,f.model_version_id into run_id,mv from afl.final_prediction_snapshots f where f.match_id=p_match_id;
  if run_id is null then return jsonb_build_object('status','no_final_prediction'); end if;
  if not exists(select 1 from afl.player_game_stats where match_id=p_match_id) then return jsonb_build_object('status','awaiting_stats'); end if;

  if not exists(select 1 from afl.matches where id=p_match_id and status='final' and home_score is not null and away_score is not null) then return '{"status":"awaiting_final_score"}'; end if;
  if not coalesce((select stats_complete from afl.review_data_status where match_id=p_match_id),false) then return '{"status":"awaiting_complete_stats"}'; end if;
  update afl.prediction_legs pl
  set actual_value=(q.r->>'actual_value')::numeric,
      hit=case q.r->>'result' when 'hit' then true when 'miss' then false else null end,
      settled_at=case when q.r->>'result'<>'pending' then now() else null end
  from (select l->>'id' id,afl.review_leg(p_match_id,l) r from afl.final_prediction_snapshots f cross join lateral jsonb_array_elements(f.snapshot->'prediction_legs') l where f.match_id=p_match_id) q
  where pl.id::text=q.id and pl.prediction_run_id=run_id;

  update afl.multi_recommendations mr
  set hit_legs=x.hit_legs,
      hit=case when x.settled_legs=mr.leg_count then x.hit_legs=mr.leg_count else null end,
      settled_at=case when x.settled_legs=mr.leg_count then pg_catalog.now() else null end
  from (
    select ml.multi_id,count(*) filter(where pl.hit is not null)::int settled_legs,
           count(*) filter(where pl.hit=true)::int hit_legs
    from afl.multi_legs ml join afl.prediction_legs pl on pl.id=ml.prediction_leg_id
    group by ml.multi_id
  ) x where mr.id=x.multi_id and mr.prediction_run_id=run_id;

  select count(*),count(*) filter(where hit is not null),count(*) filter(where hit=true),count(*) filter(where hit=false),
    avg(power(coalesce(calibrated_probability,raw_probability)-(case when hit then 1.0 else 0.0 end),2)) filter(where hit is not null),
    avg(-(case when hit then ln(greatest(0.000001,least(0.999999,coalesce(calibrated_probability,raw_probability)))) else ln(greatest(0.000001,least(0.999999,1-coalesce(calibrated_probability,raw_probability)))) end)) filter(where hit is not null)
  into total_n,settled_n,hit_n,miss_n,brier,ll from afl.prediction_legs where prediction_run_id=run_id;

  select count(*),count(*) filter(where hit=true) into multi_n,multi_hit_n from afl.multi_recommendations where prediction_run_id=run_id and recommended=true;

  insert into afl.match_settlements(match_id,prediction_run_id,model_version_id,settled_at,leg_count,settled_leg_count,hit_count,miss_count,hit_rate,brier_score,log_loss,multi_count,multi_hit_count,metadata)
  values(p_match_id,run_id,mv,pg_catalog.now(),total_n,settled_n,hit_n,miss_n,case when settled_n>0 then hit_n::numeric/settled_n else null end,brier,ll,multi_n,multi_hit_n,
    jsonb_build_object('source','playerStats/match','settlement_version','v0.1'))
  on conflict(match_id) do update set prediction_run_id=excluded.prediction_run_id,model_version_id=excluded.model_version_id,settled_at=excluded.settled_at,
    leg_count=excluded.leg_count,settled_leg_count=excluded.settled_leg_count,hit_count=excluded.hit_count,miss_count=excluded.miss_count,hit_rate=excluded.hit_rate,
    brier_score=excluded.brier_score,log_loss=excluded.log_loss,multi_count=excluded.multi_count,multi_hit_count=excluded.multi_hit_count,metadata=excluded.metadata;

  perform afl.refresh_match_review(p_match_id);
  perform afl.refresh_calibration(mv);
  perform afl.refresh_validation_dashboard();
  return jsonb_build_object('status','settled','prediction_run_id',run_id,'settled_legs',settled_n,'hits',hit_n,'misses',miss_n,'hit_rate',case when settled_n>0 then round(hit_n::numeric/settled_n,4) else null end,'brier_score',round(brier,5),'log_loss',round(ll,5),'recommended_multis',multi_n,'multi_hits',multi_hit_n);
end$function$;

CREATE OR REPLACE FUNCTION afl.queue_postmatch_stats(p_match_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare m record;
begin
  select id,provider_id,status into m from afl.matches where id=p_match_id;
  if m.id is null then raise exception 'match not found'; end if;
  if m.provider_id is null then raise exception 'provider_id missing'; end if;

  insert into afl_source.stats_jobs(match_id,provider_id,status,next_attempt_at,priority,purpose,created_at,updated_at)
  values(p_match_id,m.provider_id,'pending',pg_catalog.now(),1,'postmatch_settlement',pg_catalog.now(),pg_catalog.now())
  on conflict(match_id) do update set
    status=case when afl_source.stats_jobs.status='running' then 'running' when afl_source.stats_jobs.status='ok' and coalesce((select stats_complete from afl.review_data_status where match_id=p_match_id),false) then 'ok' else 'pending' end,
    attempt=case when afl_source.stats_jobs.status in ('ok','failed') then 0 else afl_source.stats_jobs.attempt end,
    next_attempt_at=pg_catalog.now(),priority=1,purpose='postmatch_settlement',updated_at=pg_catalog.now(),
    error_message=case when afl_source.stats_jobs.status='ok' then afl_source.stats_jobs.error_message else null end;

  return jsonb_build_object('status','queued','match_id',p_match_id,'provider_id',m.provider_id);
end;
$function$;

CREATE OR REPLACE FUNCTION afl.settle_final_recommendations(p_match_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  snap afl.final_recommendation_snapshots%rowtype;
  rec jsonb;
  legs jsonb;
  leg_results jsonb;
  v_strategy text;
  v_leg_count int;
  v_rank int;
  v_model_p numeric;
  v_fair numeric;
  v_dep numeric;
  v_stability jsonb;
  v_kept int;
  v_replaced int;
  v_stability_status text;
  v_settled int;
  v_hits int;
  v_hit boolean;
  v_brier numeric;
  v_logloss numeric;
  v_roi numeric;
  n int:=0;
begin
  select * into snap from afl.final_recommendation_snapshots where match_id=p_match_id;
  if not found then return jsonb_build_object('status','no_final_recommendation_lock'); end if;
  if not exists(select 1 from afl.player_game_stats where match_id=p_match_id) then return jsonb_build_object('status','awaiting_stats'); end if;

  if not exists(select 1 from afl.matches where id=p_match_id and status='final' and home_score is not null and away_score is not null) then return '{"status":"awaiting_final_score"}'; end if;
  if not coalesce((select stats_complete from afl.review_data_status where match_id=p_match_id),false) then return '{"status":"awaiting_complete_stats"}'; end if;
  for rec in select value from jsonb_array_elements(coalesce(snap.snapshot->'recommendations','[]'::jsonb)) loop
    v_strategy:=rec->>'strategy';
    v_leg_count:=(rec->>'leg_count')::int;
    v_rank:=(rec->>'rank')::int;
    v_model_p:=(rec->>'combined_probability')::numeric;
    v_fair:=(rec->>'fair_odds')::numeric;
    v_dep:=nullif(rec->>'dependency_factor','')::numeric;
    v_stability:=coalesce(rec->'stability','{}'::jsonb);
    v_kept:=coalesce(nullif(v_stability->>'kept_count','')::int,0);
    v_replaced:=coalesce(nullif(v_stability->>'replace_count','')::int,0);
    v_stability_status:=case when v_replaced>0 then 'replaced' when v_kept>0 then 'kept' else 'initial' end;
    legs:=coalesce(rec->'legs','[]'::jsonb);

    select coalesce(jsonb_agg(jsonb_build_object(
      'order',nullif(l->>'order','')::int,
      'prediction_leg_id',l->>'prediction_leg_id',
      'player_id',l->>'player_id',
      'player_name',l->>'player_name',
      'market',l->>'market',
      'threshold',nullif(l->>'threshold','')::numeric,
      'selection',l->>'selection',
      'model_probability',nullif(l->>'probability','')::numeric,
      'actual_value',afl.review_leg(p_match_id,l)->'actual_value',
      'result',afl.review_leg(p_match_id,l)->>'result',
      'hit',case afl.review_leg(p_match_id,l)->>'result' when 'hit' then true when 'miss' then false else null end
    ) order by nullif(l->>'order','')::int),'[]'::jsonb)
    into leg_results
    from jsonb_array_elements(legs) l;

    select count(*) filter(where x->'hit' <> 'null'::jsonb), count(*) filter(where (x->>'hit')::boolean=true)
    into v_settled,v_hits from jsonb_array_elements(leg_results) x;
    v_hit:=case when v_settled=v_leg_count then v_hits=v_leg_count else null end;
    v_brier:=case when v_hit is null then null else power(v_model_p-(v_hit::int),2) end;
    v_logloss:=case when v_hit is null then null else -(case when v_hit then ln(greatest(.000001,least(.999999,v_model_p))) else ln(greatest(.000001,least(.999999,1-v_model_p))) end) end;
    v_roi:=case when v_hit is null then null when v_hit then v_fair-1 else -1 end;

    insert into afl.final_recommendation_settlements(snapshot_id,match_id,prediction_run_id,strategy,leg_count,rank_in_group,model_probability,fair_odds,dependency_factor,stability_status,kept_count,replace_count,settled_legs,hit_legs,hit,fair_odds_roi_proxy,brier_score,log_loss,leg_results,settled_at)
    values(snap.id,p_match_id,snap.prediction_run_id,v_strategy,v_leg_count,v_rank,v_model_p,v_fair,v_dep,v_stability_status,v_kept,v_replaced,v_settled,v_hits,v_hit,v_roi,v_brier,v_logloss,leg_results,now())
    on conflict(snapshot_id,strategy,leg_count,rank_in_group) do update set
      settled_legs=excluded.settled_legs,hit_legs=excluded.hit_legs,hit=excluded.hit,fair_odds_roi_proxy=excluded.fair_odds_roi_proxy,brier_score=excluded.brier_score,log_loss=excluded.log_loss,leg_results=excluded.leg_results,settled_at=excluded.settled_at;
    n:=n+1;
  end loop;
  perform afl.refresh_final_recommendation_audit();
  return jsonb_build_object('status','settled','recommendations',n,'snapshot_id',snap.id);
end;
$function$;