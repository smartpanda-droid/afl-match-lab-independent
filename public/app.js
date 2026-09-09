const CFG = window.AFL_CONFIG;
if(CFG?.PARALLEL_TEST){
  document.documentElement.dataset.environment='parallel-test';
  document.title='AFL Match Lab · Parallel Test';
}else{
  const b=document.getElementById('parallelTestBanner'); if(b)b.hidden=true;
}
const state = { matches:[], selected:null, legs:[], multis:[], lineup:[], recent5:new Map(), availability:new Map(), context:null, validation:[], marketPolicy:[], finalAuditSummary:[], finalAudit:[], builder:[], builderEval:null, builderEvalSeq:0, systemMultiOdds:{}, systemMultiRanking:new Map(), systemRankSeq:0, multiStability:new Map(), finalLock:null, shadowObs:[], playerThresholds:{}, view:'match' };
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':'&quot;',"'":"&#39;"}[c]));
const pct = v => v == null ? '—' : `${(Number(v)*100).toFixed(1)}%`;
const odds = v => v == null ? '—' : Number(v).toFixed(2);
const dt = iso => new Intl.DateTimeFormat('en-AU',{dateStyle:'medium',timeStyle:'short',timeZone:'Australia/Melbourne'}).format(new Date(iso));

async function api(path, options={}){
  const headers={apikey:CFG.SUPABASE_PUBLISHABLE_KEY,...(options.headers||{})};
  const r=await fetch(`${CFG.SUPABASE_URL}${path}`,{...options,headers});
  if(!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.status===204?null:r.json();
}

async function apiPaged(path, pageSize=1000){
  const out=[];
  for(let from=0;;from+=pageSize){
    const to=from+pageSize-1;
    const rows=await api(path,{headers:{Range:`${from}-${to}`,Prefer:'count=exact'}});
    out.push(...(rows||[]));
    if(!rows || rows.length<pageSize) break;
  }
  return out;
}


async function loadValidation(){
  const [validation,marketPolicy,finalAuditSummary,finalAudit]=await Promise.all([
    api('/rest/v1/afl_api_validation_summary?select=*&order=validation_type.asc,segment_type.asc,segment_key.asc'),
    api('/rest/v1/afl_api_module_market_policy?select=*&order=market.asc,module.asc'),
    api('/rest/v1/afl_api_final_recommendation_summary?select=*&order=segment_type.asc,segment_key.asc'),
    api('/rest/v1/afl_api_final_recommendation_audit?select=*&order=settled_at.desc,strategy.asc,leg_count.asc,rank_in_group.asc&limit=200')
  ]);
  state.validation=validation;
  state.marketPolicy=marketPolicy;
  state.finalAuditSummary=finalAuditSummary;
  state.finalAudit=finalAudit;
  renderValidation();
}
function gainClass(v){v=Number(v||0);return v>0?'good-text':v<0?'bad-text':'neutral-text'}
function gain(v){if(v==null)return '—';const n=Number(v);return `${n>=0?'+':''}${n.toFixed(5)}`}
function validationCard(r){return `<article class="validation-card"><div class="validation-card-top"><strong>${esc(r.segment_key.replaceAll('_',' ').toUpperCase())}</strong><span class="badge ${r.status==='improved'?'good':r.status==='regressed'?'bad':'warn'}">${esc(r.status.toUpperCase())}</span></div><div class="validation-metrics"><span>n <b>${r.sample_size}</b></span><span>Brier gain <b class="${gainClass(r.brier_gain)}">${gain(r.brier_gain)}</b></span><span>LogLoss gain <b class="${gainClass(r.logloss_gain)}">${gain(r.logloss_gain)}</b></span></div></article>`}
function renderValidation(){
  if(!$('#formalValidationSummary'))return;
  const formal=state.validation.find(r=>r.validation_type==='formal_live'&&r.segment_type==='overall');
  const overall=state.validation.find(r=>r.validation_type==='retrospective_shadow'&&r.segment_type==='overall');
  const fb=$('#formalValidationBadge');fb.className=`badge ${formal?.sample_size>0?'good':'warn'}`;fb.textContent=formal?.sample_size>0?'ACTIVE':'PENDING';
  $('#formalValidationSummary').innerHTML=formal?`${stat('Settled matches',formal.sample_size)}${stat('Status',esc(formal.status))}`:'<div class="empty">暂无正式样本</div>';
  const sb=$('#shadowValidationBadge');sb.className=`badge ${overall?.status==='improved'?'good':'bad'}`;sb.textContent=overall?.status?.toUpperCase()||'—';
  $('#shadowValidationSummary').innerHTML=overall?`${stat('Legs',overall.sample_size)}${stat('Baseline Brier',Number(overall.baseline_brier).toFixed(5))}${stat('Shadow Brier',Number(overall.shadow_brier).toFixed(5))}${stat('Brier gain',`<span class="${gainClass(overall.brier_gain)}">${gain(overall.brier_gain)}</span>`)}${stat('LogLoss gain',`<span class="${gainClass(overall.logloss_gain)}">${gain(overall.logloss_gain)}</span>`)}`:'<div class="empty">暂无 shadow backtest</div>';
  const modules=state.validation.filter(r=>r.validation_type==='retrospective_shadow'&&r.segment_type==='module');$('#validationModules').innerHTML=modules.map(validationCard).join('')||'<div class="empty">暂无模块结果</div>';
  const markets=state.validation.filter(r=>r.validation_type==='retrospective_shadow'&&r.segment_type==='market').sort((a,b)=>Number(b.brier_gain)-Number(a.brier_gain));
  $('#validationMarkets').innerHTML=markets.length?`<table class="validation-table"><thead><tr><th>Market</th><th>n</th><th>Baseline Brier</th><th>Shadow Brier</th><th>Brier gain</th><th>LogLoss gain</th><th>Status</th></tr></thead><tbody>${markets.map(r=>`<tr><td>${esc(r.segment_key.replaceAll('_',' '))}</td><td>${r.sample_size}</td><td>${Number(r.baseline_brier).toFixed(5)}</td><td>${Number(r.shadow_brier).toFixed(5)}</td><td class="${gainClass(r.brier_gain)}">${gain(r.brier_gain)}</td><td class="${gainClass(r.logloss_gain)}">${gain(r.logloss_gain)}</td><td><span class="badge ${r.status==='improved'?'good':'bad'}">${esc(r.status)}</span></td></tr>`).join('')}</tbody></table>`:'<div class="empty">暂无市场结果</div>';
  $('#validationFinals').innerHTML=state.validation.filter(r=>r.validation_type==='retrospective_shadow'&&r.segment_type==='finals').map(validationCard).join('')||'<div class="empty">暂无 Finals 分层</div>';
  $('#validationRoles').innerHTML=state.validation.filter(r=>r.validation_type==='retrospective_shadow'&&r.segment_type==='role').map(validationCard).join('')||'<div class="empty">暂无 Role 分层</div>';
  const grouped=[...new Set(state.marketPolicy.map(r=>r.market))].map(m=>{const rows=state.marketPolicy.filter(r=>r.market===m);const c=rows.find(r=>r.module==='context');const ro=rows.find(r=>r.module==='role');return {market:m,context:c,role:ro,pass:rows.some(r=>r.mode==='active_recalibrated'),n:Math.max(...rows.map(r=>Number(r.holdout_samples||0))),bg:Math.max(...rows.map(r=>Number(r.holdout_brier_gain||0))),lg:Math.max(...rows.map(r=>Number(r.holdout_logloss_gain||0)))};});
  $('#validationMarketGate').innerHTML=grouped.length?`<table class="validation-table"><thead><tr><th>Market</th><th>Context w</th><th>Role w</th><th>Holdout n</th><th>Brier gain</th><th>LogLoss gain</th><th>Gate</th></tr></thead><tbody>${grouped.map(r=>`<tr><td>${esc(r.market.replaceAll('_',' '))}</td><td>${Number(r.context?.applied_weight||0).toFixed(2)}</td><td>${Number(r.role?.applied_weight||0).toFixed(2)}</td><td>${r.n}</td><td class="${gainClass(r.bg)}">${gain(r.bg)}</td><td class="${gainClass(r.lg)}">${gain(r.lg)}</td><td><span class="badge ${r.pass?'good':'neutral'}">${r.pass?'ACTIVE':'SHADOW'}</span></td></tr>`).join('')}</tbody></table>`:'<div class="empty">暂无 market gate</div>';
  const overallAudit=state.finalAuditSummary.find(r=>r.segment_type==='overall'&&r.segment_key==='all');
  $('#finalAuditSummary').innerHTML=overallAudit?`${stat('Final multis',overallAudit.sample_size)}${stat('Hit rate',pct(overallAudit.hit_rate))}${stat('Avg Brier',Number(overallAudit.avg_brier).toFixed(5))}${stat('Avg LogLoss',Number(overallAudit.avg_log_loss).toFixed(5))}${stat('Fair-odds ROI proxy',`${Number(overallAudit.avg_fair_odds_roi_proxy)*100>=0?'+':''}${(Number(overallAudit.avg_fair_odds_roi_proxy)*100).toFixed(1)}%`)}`:'<div class="empty">等待首场真实 T-30 Final Lock 完成赛后结算</div>';
  $('#finalAuditBreakdown').innerHTML=state.finalAuditSummary.length?`<table class="validation-table"><thead><tr><th>Segment</th><th>Group</th><th>n</th><th>Hit rate</th><th>Brier</th><th>LogLoss</th><th>Fair-odds ROI proxy</th></tr></thead><tbody>${state.finalAuditSummary.filter(r=>r.segment_type!=='overall').map(r=>`<tr><td>${esc(r.segment_type)}</td><td>${esc(r.segment_key)}</td><td>${r.sample_size}</td><td>${pct(r.hit_rate)}</td><td>${r.avg_brier==null?'—':Number(r.avg_brier).toFixed(5)}</td><td>${r.avg_log_loss==null?'—':Number(r.avg_log_loss).toFixed(5)}</td><td>${r.avg_fair_odds_roi_proxy==null?'—':`${Number(r.avg_fair_odds_roi_proxy)*100>=0?'+':''}${(Number(r.avg_fair_odds_roi_proxy)*100).toFixed(1)}%`}</td></tr>`).join('')}</tbody></table>`:'<div class="empty">暂无正式 audit 分层</div>';
  $('#finalAuditRecent').innerHTML=state.finalAudit.length?`<table class="validation-table"><thead><tr><th>Strategy</th><th>Legs</th><th>Rank</th><th>Model P</th><th>Hit legs</th><th>Result</th><th>Stability</th><th>Brier</th></tr></thead><tbody>${state.finalAudit.slice(0,60).map(r=>`<tr><td>${esc(r.strategy)}</td><td>${r.leg_count}</td><td>#${r.rank_in_group}</td><td>${pct(r.model_probability)}</td><td>${r.hit_legs}/${r.settled_legs}</td><td><span class="badge ${r.hit?'good':'bad'}">${r.hit?'HIT':'MISS'}</span></td><td>${esc(r.stability_status)}</td><td>${r.brier_score==null?'—':Number(r.brier_score).toFixed(5)}</td></tr>`).join('')}</tbody></table>`:'<div class="empty">暂无真实 Final Recommendation settlement</div>';
}



function shadowSchedule(m){
  if(!m)return [];
  const start=new Date(m.start_time).getTime();
  const mins=[240,210,180,150,120,90,60,30];
  const syncs=mins.map((before,i)=>({key:`sync-${i+1}`,label:`T-${Math.floor(before/60)}${before%60?'h30':'h'} SYNC`,phase:'pregame_sync',time:new Date(start-before*60000),syncOrdinal:i+1}));
  syncs.push({key:'final',label:'T-30 FINAL LOCK',phase:'t30_final',time:new Date(start-30*60000),syncOrdinal:null});
  return syncs;
}
function shadowBadge(obs,node){
  if(obs)return `<span class="badge ${obs.phase==='t30_final'?'good':'neutral'}">${obs.phase==='t30_final'?'FINAL':'RECORDED'}</span>`;
  return `<span class="badge ${node.time.getTime()<Date.now()?'warn':'neutral'}">${node.time.getTime()<Date.now()?'AWAITING':'PENDING'}</span>`;
}
function shadowDelta(o){
  if(!o)return '';
  const parts=[];
  if(o.lineup_changed)parts.push('LINEUP');
  if(o.injury_changed)parts.push('INJURY');
  if(o.prediction_changed)parts.push(`LEGS ${o.changed_leg_count??0}`);
  if(o.multi_changed)parts.push(`MULTI ${o.changed_multi_count??0}`);
  if(o.stability_changed)parts.push('STABILITY');
  return parts.length?parts.join(' · '):'NO MATERIAL CHANGE';
}
function renderShadowLive(){
  if(!$('#shadowLiveTimeline'))return;
  const m=state.matches.find(x=>x.match_id===state.selected); if(!m)return;
  const obs=state.shadowObs||[];
  const preg=obs.filter(o=>o.phase==='pregame_sync').sort((a,b)=>Number(a.sequence_no)-Number(b.sequence_no));
  const finalObs=obs.find(o=>o.phase==='t30_final');
  const schedule=shadowSchedule(m);
  let pi=0;
  const rows=schedule.map(node=>{
    const o=node.phase==='t30_final'?finalObs:preg[pi++]||null;
    const metrics=o?`<div class="shadow-metrics"><span>Lineup <b>${o.lineup_count??'—'}</b></span><span>Injury <b>${o.active_injury_count??0}</b></span><span>Legs <b>${o.prediction_leg_count??'—'}</b></span><span>Multi <b>${o.recommended_multi_count??'—'}</b></span><span>Keep <b>${o.stability_kept_count??'—'}</b></span><span>Replace <b>${o.stability_replace_count??'—'}</b></span></div>`:'';
    return `<article class="shadow-step ${o?'recorded':''} ${node.phase==='t30_final'?'final-step':''}"><div class="shadow-dot"></div><div class="shadow-step-body"><div class="shadow-step-head"><div><strong>${esc(node.label)}</strong><span>${dt(node.time.toISOString())}${o?` · observed ${dt(o.observed_at)}`:''}</span></div>${shadowBadge(o,node)}</div>${o?`<div class="shadow-delta">${esc(shadowDelta(o))}</div>${metrics}<div class="shadow-hash">run ${esc(String(o.prediction_run_id||'—').slice(0,8))} · source ${o.source_snapshot_at?dt(o.source_snapshot_at):'—'}</div>`:`<div class="shadow-pending">等待真实同步；不会提前制造 observation。</div>`}</div></article>`;
  }).join('');
  $('#shadowLiveTimeline').innerHTML=rows;
  const latest=obs.at(-1);
  $('#shadowLiveSummary').innerHTML=stat('Recorded',obs.length)+stat('Expected',9)+stat('Latest',latest?`#${latest.sequence_no} ${esc(latest.phase)}`:'Waiting T-4h')+stat('Final lock',finalObs?'YES':'NO');
  const b=$('#shadowLiveBadge'); b.className=`badge ${finalObs?'good':obs.length?'warn':'neutral'}`; b.textContent=finalObs?'FINAL COMPLETE':obs.length?'LIVE':'WAITING T-4h';
}

function storageKey(){return `afl-multi-builder:${state.selected||'none'}`}
function loadBuilder(){try{state.builder=JSON.parse(localStorage.getItem(storageKey())||'[]')}catch{state.builder=[]} state.builderEval=null;updateBuilderCount()}
function saveBuilder(){localStorage.setItem(storageKey(),JSON.stringify(state.builder));state.builderEval=null;updateBuilderCount();renderBuilder();evaluateBuilder().catch(showError)}
function updateBuilderCount(){$('#builderCount').textContent=state.builder.length}

async function loadMatches(){
  const rows=await api('/rest/v1/afl_api_matches?select=*&season=eq.2026&order=start_time.asc');
  state.matches=rows;
  const future=rows.filter(m=>['scheduled','live'].includes(m.status));
  $('#matchSelect').innerHTML=future.map(m=>`<option value="${m.match_id}">${esc(m.round_name)} · ${esc(m.home_team_name)} vs ${esc(m.away_team_name)} · ${dt(m.start_time)}</option>`).join('');
  if(!state.selected || !future.some(m=>m.match_id===state.selected)) state.selected=future[0]?.match_id||rows.at(-1)?.match_id||null;
  $('#matchSelect').value=state.selected||'';
}

async function loadSelected(){
  if(!state.selected)return;
  const id=encodeURIComponent(state.selected);
  const [legs,multis,lineup,recent,availability,contextRows,stabilityRows,finalRows,shadowRows]=await Promise.all([
    apiPaged(`/rest/v1/afl_api_prediction_legs?select=*&match_id=eq.${id}&order=player_name.asc,market.asc,threshold.asc`),
    api(`/rest/v1/afl_api_multis?select=*&match_id=eq.${id}&order=strategy.asc,leg_count.asc,rank_in_group.asc`),
    api(`/rest/v1/afl_api_lineup?select=*&match_id=eq.${id}&order=team_name.asc,emergency.asc,bench.asc,player_name.asc`),
    api(`/rest/v1/afl_api_player_recent5?select=player_id,player_name,team_name,recent5&match_id=eq.${id}`),
    api(`/rest/v1/afl_api_availability?select=*`),
    api(`/rest/v1/afl_api_match_context?select=*&match_id=eq.${id}`),
    api(`/rest/v1/afl_api_multi_stability?select=*&match_id=eq.${id}`),
    api(`/rest/v1/afl_api_final_recommendations?select=*&match_id=eq.${id}`),
    api(`/rest/v1/afl_api_shadow_observations?select=*&match_id=eq.${id}&order=sequence_no.asc`)
  ]);
  state.legs=legs;state.multis=multis;state.lineup=lineup;state.recent5=new Map(recent.map(r=>[r.player_id,r.recent5||[]]));state.availability=new Map(availability.map(r=>[r.player_id,r]));state.context=contextRows[0]||null;state.multiStability=new Map((stabilityRows||[]).map(x=>[`${x.strategy}:${x.leg_count}:${x.slot}`,x]));state.finalLock=(finalRows||[])[0]||null;state.shadowObs=shadowRows||[];
  loadBuilder();renderAll();evaluateBuilder().catch(showError);
}

function stat(label,value){return `<div class="stat"><b>${value}</b><span>${label}</span></div>`}
function metric(label,value){return `<div class="metric"><b>${value}</b>${label}</div>`}
function probClass(p){p=Number(p);return p>=.65?'high':p>=.5?'mid':'low'}

function renderAll(){renderMatch();renderPlayerControls();renderPlayers();renderMultis();renderBuilder();renderField();renderTactics();renderValidation();renderShadowLive();$('#healthBadge').className='badge good';$('#healthBadge').textContent='Supabase Connected'}

function renderMatch(){
  const m=state.matches.find(x=>x.match_id===state.selected);if(!m)return;
  $('#matchSummary').innerHTML=`<div><div class="team-name">${esc(m.home_team_name)}</div><div class="match-meta">HOME</div></div><div class="match-mid"><div class="eyebrow">${esc(m.round_name)} · ${esc(m.venue||'TBC')}</div><strong>${dt(m.start_time)}</strong><div class="match-meta">${esc(m.status)}</div></div><div><div class="team-name">${esc(m.away_team_name)}</div><div class="match-meta">AWAY</div></div>`;
  const confirmed=!!m.lineup_confirmed,fallback=!!m.used_fallback_lineup;
  $('#lineupBadge').className=`badge ${confirmed?'good':fallback?'warn':'neutral'}`;$('#lineupBadge').textContent=confirmed?'FINAL TEAM':fallback?'FALLBACK':'PENDING';
  const bench=state.lineup.filter(x=>x.bench).length, emerg=state.lineup.filter(x=>x.emergency).length;
  $('#lineupSummary').innerHTML=stat('Players',state.lineup.length)+stat('Interchange',bench)+stat('Emergency',emerg);
  const teams=[...new Set(state.lineup.map(x=>x.team_name))];
  $('#lineupLists').innerHTML=teams.map(team=>`<div class="lineup-team"><h3>${esc(team)}</h3>${state.lineup.filter(x=>x.team_name===team).map(x=>`<span class="player-chip ${x.emergency?'emergency':x.bench?'bench':''}">${esc(x.player_name)}${x.named_position?` · ${esc(x.named_position)}`:''}</span>`).join('')}</div>`).join('');
  const locked=!!state.finalLock||!!m.final_recommendation_locked;$('#modelBadge').className=`badge ${locked||m.prediction_is_final?'good':'warn'}`;$('#modelBadge').textContent=locked?'FINAL LOCKED':m.prediction_is_final?'T-30 FINAL':'PREVIEW';
  $('#modelSummary').innerHTML=stat('Model',esc(m.model_version||'—'))+stat('Legs',state.legs.length)+stat('Multi',state.multis.filter(x=>x.recommended).length);
  $('#topLegs').innerHTML=state.legs.slice(0,10).map(l=>`<div class="top-leg"><div class="p">${pct(l.model_probability)}</div><div class="sel">${esc(l.selection)}</div><div class="meta">Fair ${odds(l.fair_odds)} · n=${l.sample_size??'—'}</div><button class="add-leg" data-leg-id="${l.prediction_leg_id}">+ Multi Lab</button></div>`).join('')||'<div class="empty">暂无预测</div>';
  $$('#topLegs .add-leg').forEach(b=>b.addEventListener('click',()=>addLegById(b.dataset.legId)));
}

function scenarioLabel(k){return ({home_control:'主队控制',away_control:'客队控制',close_contest:'全场焦灼',momentum_comeback:'追分/反扑',blowout_garbage_time:'大比分/垃圾时间',low_scoring_defensive:'低比分防守战'})[k]||k.replaceAll('_',' ')}
function renderScenarioCards(limit=6){const sw=state.context?.scenario_weights||{};return Object.entries(sw).sort((a,b)=>Number(b[1])-Number(a[1])).slice(0,limit).map(([k,v])=>`<div class="scenario-card"><div class="scenario-top"><strong>${esc(scenarioLabel(k))}</strong><span>${pct(v)}</span></div><div class="scenario-bar"><i style="width:${Math.min(100,Number(v)*100)}%"></i></div></div>`).join('')||'<div class="empty">Context 尚未生成</div>'}
function styleValue(v){return v==null?'—':Number(v).toFixed(1)}
function renderTactics(){
  const c=state.context;if(!c){$('#scenarioPreview').innerHTML='<div class="empty">Context 尚未生成</div>';$('#tacticalPreview').innerHTML='<div class="empty">暂无战术数据</div>';$('#teamStyleCards').innerHTML='<div class="empty">暂无球队画像</div>';$('#scenarioDetail').innerHTML='<div class="empty">暂无场景</div>';$('#synergyCards').innerHTML='<div class="empty">暂无协同数据</div>';$('#fieldTacticalSummary').innerHTML='<p class="note">暂无战术 context</p>';return}
  $('#scenarioPreview').innerHTML=renderScenarioCards(4);$('#scenarioDetail').innerHTML=renderScenarioCards(6);
  const t=c.tactical_summary||{};const m=state.matches.find(x=>x.match_id===state.selected);
  $('#tacticalPreview').innerHTML=`<div class="tactic-line"><span>Clearance edge</span><strong>${t.clearance_edge==='home'?esc(m?.home_team_name):t.clearance_edge==='away'?esc(m?.away_team_name):'Even'}</strong></div><div class="tactic-line"><span>Pressure edge</span><strong>${t.pressure_edge==='home'?esc(m?.home_team_name):t.pressure_edge==='away'?esc(m?.away_team_name):'Even'}</strong></div><div class="tactic-line"><span>Home style</span><strong>${esc(t.home_style||'—')}</strong></div><div class="tactic-line"><span>Away style</span><strong>${esc(t.away_style||'—')}</strong></div>`;
  const profiles=[[m?.home_team_name,c.home_profile],[m?.away_team_name,c.away_profile]];
  $('#teamStyleCards').innerHTML=profiles.map(([name,p])=>`<article class="team-style-card"><h3>${esc(name||'Team')}</h3><div class="profile-stats">${stat('Games',p?.sample_games??'—')}${stat('Avg score',styleValue(p?.avg_score))}${stat('Avg margin',styleValue(p?.avg_margin))}${stat('Home margin',styleValue(p?.home_avg_margin))}${stat('Away margin',styleValue(p?.away_avg_margin))}${stat('Clearances',styleValue(p?.avg_clearances))}${stat('Tackles',styleValue(p?.avg_tackles))}${stat('Inside 50s',styleValue(p?.avg_inside50s))}</div></article>`).join('');
  $('#synergyCards').innerHTML=(c.top_synergies||[]).map(s=>`<article class="synergy-card"><div><span class="eyebrow">${esc(s.team)}</span><h3>${esc(s.player_a)} ↔ ${esc(s.player_b)}</h3></div><div class="synergy-score ${Number(s.synergy_score)>=0?'pos':'neg'}">${Number(s.synergy_score).toFixed(3)}</div><div class="synergy-metrics"><span>Shared <b>${s.shared_games}</b></span><span>Disp <b>${s.disposal_corr==null?'—':Number(s.disposal_corr).toFixed(2)}</b></span><span>Marks <b>${s.mark_corr==null?'—':Number(s.mark_corr).toFixed(2)}</b></span><span>Fantasy <b>${s.fantasy_corr==null?'—':Number(s.fantasy_corr).toFixed(2)}</b></span></div></article>`).join('')||'<div class="empty">没有达到共同出场样本门槛的球员组合</div>';
  $('#fieldTacticalSummary').innerHTML=`<div class="mini-context"><strong>Context v0.1</strong><span>Clearance: ${esc(t.clearance_edge||'even')} · Pressure: ${esc(t.pressure_edge||'even')}</span><span>Top scenario: ${esc(scenarioLabel(Object.entries(c.scenario_weights||{}).sort((a,b)=>Number(b[1])-Number(a[1]))[0]?.[0]||'—'))}</span></div>`;
}

const MARKET_LABELS={disposals:'Disposals',kicks:'Kicks',marks:'Marks',tackles:'Tackles',fantasy_points:'Fantasy',handballs:'Handballs',hitouts:'Hitouts',clearances:'Clearances',goals:'Goals'};
function marketLabel(m){return MARKET_LABELS[m]||String(m||'').replaceAll('_',' ')}
function playerThresholdKey(playerId,market){return `${playerId}:${market}`}
function selectedPlayerLeg(options){
  const sorted=[...options].sort((a,b)=>Number(a.threshold)-Number(b.threshold));
  const key=playerThresholdKey(sorted[0]?.player_id,sorted[0]?.market);
  const wanted=Number(state.playerThresholds[key]);
  return sorted.find(x=>Number(x.threshold)===wanted)||sorted[0];
}
function renderPlayerControls(){
  const markets=[...new Set(state.legs.map(x=>x.market))].sort(), el=$('#marketFilter'), cur=el.value;
  el.innerHTML='<option value="">全部玩法</option>'+markets.map(x=>`<option value="${esc(x)}">${esc(marketLabel(x))}</option>`).join('');
  if(markets.includes(cur))el.value=cur;
}
function marketValue(game,market){return market==='fantasy_points'?game.fantasy_points:game[market]}
function renderRecent(leg){
  const games=state.recent5.get(leg.player_id)||[];
  return `<div class="recent-block"><div class="recent-caption">最近 5 场 · ${esc(marketLabel(leg.market))} ${esc(leg.threshold)}+</div><div class="recent-strip">${games.map(g=>{const v=marketValue(g,leg.market);const ok=v!=null&&Number(v)>=Number(leg.threshold);return `<span class="recent-cell ${v==null?'na':ok?'hit':'miss'}" title="${esc(g.round_name)} vs ${esc(g.opponent)}">${v??'—'}</span>`}).join('')||'<span class="recent-cell na">—</span>'}</div></div>`;
}
function renderPlayers(){
  const s=$('#playerSearch').value.trim().toLowerCase(), market=$('#marketFilter').value;
  const filtered=state.legs.filter(l=>(!s||l.player_name?.toLowerCase().includes(s))&&(!market||l.market===market));
  const byPlayer=new Map();
  filtered.forEach(l=>{
    if(!byPlayer.has(l.player_id))byPlayer.set(l.player_id,[]);
    byPlayer.get(l.player_id).push(l);
  });
  const cards=[...byPlayer.entries()].slice(0,80).map(([pid,allLegs])=>{
    const first=allLegs[0];
    const av=state.availability.get(pid);const risk=av&&av.status!=='normal';
    const badge=risk?(av.explicit_injury?'INJURY RECOVERY':av.status.toUpperCase()):(first.bench?'BENCH':'ACTIVE');
    const badgeClass=risk?(av.risk_level==='severe'||av.risk_level==='high'?'bad':'warn'):(first.bench?'warn':'neutral');
    const riskLine=av&&risk?`<div class="risk-line"><strong>${esc(badge)}</strong> · TOG ${av.latest_tog??'—'}% vs baseline ${av.baseline_tog??'—'}% · factor ${Number(av.probability_factor||1).toFixed(2)}${av.injury_type?` · ${esc(av.injury_type)}`:''}${av.expected_return?` · ${esc(av.expected_return)}`:''}</div>`:'';
    const byMarket=new Map();
    allLegs.forEach(l=>{if(!byMarket.has(l.market))byMarket.set(l.market,[]);byMarket.get(l.market).push(l)});
    const rows=[...byMarket.entries()].sort((a,b)=>marketLabel(a[0]).localeCompare(marketLabel(b[0]))).map(([m,opts])=>{
      const l=selectedPlayerLeg(opts); if(!l)return '';
      const cf=Number(l.context_factor||1),of=Number(l.opponent_factor||1),vf=Number(l.venue_factor||1),ff=Number(l.finals_factor||1);
      const ctxClass=cf>1.015?'ctx-up':cf<0.985?'ctx-down':'ctx-flat';
      const key=playerThresholdKey(pid,m);
      const optionHtml=[...opts].sort((a,b)=>Number(a.threshold)-Number(b.threshold)).map(o=>`<option value="${o.threshold}" ${Number(o.threshold)===Number(l.threshold)?'selected':''}>${esc(marketLabel(m))} ${esc(o.threshold)}+</option>`).join('');
      return `<div class="player-market-row player-market-option" data-player="${pid}" data-market="${esc(m)}"><div class="market-select-wrap"><select class="threshold-select" data-key="${esc(key)}">${optionHtml}</select></div><span class="prob ${probClass(l.model_probability)}">${pct(l.model_probability)}</span><span class="fair-odds">Fair ${odds(l.fair_odds)}</span><div class="context-line ${ctxClass}"><span>${esc((l.opponent_tier||'mid').toUpperCase())} OPP · ${esc((l.venue_role||'—').toUpperCase())}${l.is_final?' · FINALS':''}</span><span>CTX ×${cf.toFixed(3)} · O ${of.toFixed(3)} / V ${vf.toFixed(3)} / F ${ff.toFixed(3)}</span><span>n ${l.opponent_samples??0}/${l.venue_samples??0}/${l.finals_samples??0} · 2025 Finals ${l.prior_finals_samples??0} (w ${Number(l.prior_finals_weight||0).toFixed(3)})</span><span class="role-line ${Number(l.role_factor||1)>1.01?'ctx-up':Number(l.role_factor||1)<0.99?'ctx-down':'ctx-flat'}">ROLE ${esc((l.role_label||'stable').replaceAll('_',' ').toUpperCase())} · ×${Number(l.role_factor||1).toFixed(3)} · conf ${Math.round(Number(l.role_confidence||0)*100)}% · n ${l.role_samples??0}</span></div>${renderRecent(l)}<button class="add-leg" data-leg-id="${l.prediction_leg_id}">+ Multi Lab</button></div>`;
    }).join('');
    return `<article class="player-card"><div class="player-card-head"><div><h3>${esc(first.player_name)}</h3><div class="match-meta">${esc(first.team_name||'')} ${first.bench?'· Bench':''}</div>${riskLine}</div><span class="badge ${badgeClass}">${esc(badge)}</span></div>${rows}</article>`;
  });
  $('#playerCards').innerHTML=cards.join('')||'<div class="empty">没有符合条件的球员</div>';
  $$('#playerCards .threshold-select').forEach(sel=>sel.addEventListener('change',()=>{state.playerThresholds[sel.dataset.key]=Number(sel.value);renderPlayers()}));
  $$('#playerCards .add-leg').forEach(b=>b.addEventListener('click',()=>addLegById(b.dataset.legId)));
}

async function valueResult(prob,actual,resultEl){
  if(!(actual>1)){resultEl.className='value-result bad';resultEl.textContent='请输入大于 1.00 的实际赔率';return}
  resultEl.className='value-result';resultEl.textContent='计算中…';
  try{const r=await api('/rest/v1/rpc/afl_price_value',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({p_model_probability:Number(prob),p_actual_odds:Number(actual)})});const x=Array.isArray(r)?r[0]:r;resultEl.className=`value-result ${x.positive_ev?'good':'bad'}`;resultEl.textContent=`${x.value_label} · Value ${Number(x.value_pct).toFixed(2)}% · Fair ${Number(x.fair_odds).toFixed(2)}`}
  catch(e){resultEl.className='value-result bad';resultEl.textContent=`Value API error: ${e.message}`}
}
function visibleMultiRows(){
  const strategy=$('#strategyFilter').value,count=Number($('#legCountFilter').value),only=$('#recommendedOnly').checked;
  return state.multis.filter(x=>x.strategy===strategy&&Number(x.leg_count)===count&&(!only||x.recommended));
}
async function rankVisibleMultis(){
  const seq=++state.systemRankSeq;
  const rows=visibleMultiRows();
  const items=rows.map(m=>({multi_id:m.multi_id,actual_odds:Number(state.systemMultiOdds[m.multi_id]||0)})).filter(x=>x.actual_odds>1);
  if(items.length<2){state.systemMultiRanking=new Map();renderMultis();return}
  const r=await api('/rest/v1/rpc/afl_rank_system_multis',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({p_items:items})});
  if(seq!==state.systemRankSeq)return;
  const x=Array.isArray(r)?r[0]:r;
  state.systemMultiRanking=new Map((x.items||[]).map(v=>[v.multi_id,v]));
  renderMultis();
}
function renderMultis(){
  let rows=visibleMultiRows();const host=$('#multiCards');host.innerHTML='';
  if(state.finalLock){const lock=document.createElement('div');lock.className='final-lock-banner';lock.innerHTML=`<strong>🔒 T-30 FINAL RECOMMENDATION LOCK</strong><span>${dt(state.finalLock.frozen_at)} · ${state.finalLock.recommendation_count} recommendations · SHA ${esc(String(state.finalLock.snapshot_sha256||'').slice(0,12))}…</span>`;host.appendChild(lock)}
  if(!rows.length){host.innerHTML='<div class="empty">当前质量门槛下没有正式推荐；系统不会为了凑赔率加入低质量腿。</div>';return}
  const ranked=rows.filter(m=>state.systemMultiRanking.has(m.multi_id));
  if(ranked.length>=2)rows=[...rows].sort((a,b)=>{
    const ra=state.systemMultiRanking.get(a.multi_id)?.value_aware_rank??999;
    const rb=state.systemMultiRanking.get(b.multi_id)?.value_aware_rank??999;
    return ra-rb || Number(b.combined_probability)-Number(a.combined_probability);
  });
  rows.forEach(m=>{
    const vrank=state.systemMultiRanking.get(m.multi_id);
    const node=$('#multiTemplate').content.cloneNode(true);
    node.querySelector('.multi-strategy').textContent=m.strategy;
    node.querySelector('.multi-title').textContent=`${m.leg_count}串1 · #${m.rank_in_group}`;
    const rb=node.querySelector('.multi-rec');rb.textContent=m.recommended?'RECOMMENDED':'OUT OF BAND';rb.className=`multi-rec badge ${m.recommended?'good':'warn'}`;
    const st=state.multiStability.get(`${m.strategy}:${m.leg_count}:${m.rank_in_group}`);
    if(st){const sb=document.createElement('span');const reason=String(st.last_reason||'');sb.className=`badge ${reason.includes('replaced')||reason.includes('risk')||reason.includes('improvement')?'warn':'good'}`;sb.textContent=reason.includes('replaced')||reason.includes('risk')||reason.includes('improvement')?'REPLACED':'STABLE';sb.title=`${reason} · kept ${st.kept_count||0} · replaced ${st.replace_count||0}`;node.querySelector('.multi-top').appendChild(sb)}
    node.querySelector('.multi-legs').innerHTML=(m.legs||[]).map(l=>`<div class="multi-leg"><span>${esc(l.selection)}</span><strong>${pct(l.probability)}</strong></div>`).join('');
    node.querySelector('.multi-metrics').innerHTML=metric('Model P',pct(m.combined_probability))+metric('Fair Odds',odds(m.fair_odds))+metric('Corr.',Number(m.correlation_penalty||1).toFixed(3))+(vrank?metric('Quality Rank',`#${vrank.quality_rank}`)+metric('Value Rank',`#${vrank.value_aware_rank}`):'');
    node.querySelector('.send-builder').addEventListener('click',()=>sendMultiToBuilder(m));
    const input=node.querySelector('.actual-odds'),result=node.querySelector('.value-result');
    input.value=state.systemMultiOdds[m.multi_id]||'';
    if(vrank){const vp=Number(vrank.value_pct);result.className=`value-result ${vp>=0?'good':'bad'}`;result.textContent=`${String(vrank.value_label||'').replaceAll('_',' ')} · EV ${vp>=0?'+':''}${vp.toFixed(2)}% · Value Rank #${vrank.value_aware_rank}`}
    input.addEventListener('input',()=>{state.systemMultiOdds[m.multi_id]=input.value;clearTimeout(window.__systemMultiRankTimer);window.__systemMultiRankTimer=setTimeout(()=>rankVisibleMultis().catch(showError),300)});
    node.querySelector('.value-btn').addEventListener('click',()=>{state.systemMultiOdds[m.multi_id]=input.value;rankVisibleMultis().catch(showError);if(!(Number(input.value)>1))valueResult(m.combined_probability,Number(input.value),result)});
    host.appendChild(node)
  })
}

function normalizeLeg(l){return {prediction_leg_id:l.prediction_leg_id,player_id:l.player_id||null,player_name:l.player_name,team_name:l.team_name||null,market:l.market,threshold:Number(l.threshold),selection:l.selection,probability:Number(l.model_probability??l.probability),fair_odds:Number(l.fair_odds||0)}}
function addLegById(id){const l=state.legs.find(x=>x.prediction_leg_id===id);if(!l)return;if(state.builder.some(x=>x.prediction_leg_id===id))return;state.builder.push(normalizeLeg(l));saveBuilder();switchView('multi-lab')}
function sendMultiToBuilder(m){state.builder=[];(m.legs||[]).forEach(l=>{const full=state.legs.find(x=>x.prediction_leg_id===l.prediction_leg_id);state.builder.push(normalizeLeg(full||l))});saveBuilder();switchView('multi-lab')}
function builderProbability(){return state.builder.reduce((a,l)=>a*Number(l.probability||0),1)}
async function evaluateBuilder(){
  const seq=++state.builderEvalSeq;
  if(state.builder.length<2){state.builderEval=null;renderBuilder();return}
  const actual=Number($('#builderActualOdds')?.value||0);
  const result=await api('/rest/v1/rpc/afl_multi_lab_evaluate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({p_leg_ids:state.builder.map(l=>l.prediction_leg_id),p_actual_odds:actual>1?actual:null})});
  if(seq!==state.builderEvalSeq)return;
  state.builderEval=result;renderBuilder();
}
function renderBuilder(){
  $('#builderLegs').innerHTML=state.builder.length?state.builder.map((l,i)=>`<div class="builder-leg"><span><strong>${esc(l.selection)}</strong><br><span class="match-meta">${esc(l.player_name)} · ${pct(l.probability)}</span></span><span>${odds(l.fair_odds)}</span><button class="remove-leg" data-i="${i}">移除</button></div>`).join(''):'<div class="empty">尚未加入单腿。可从 Player Markets、System Multi 或球场阵容添加。</div>';
  $$('#builderLegs .remove-leg').forEach(b=>b.addEventListener('click',()=>{state.builder.splice(Number(b.dataset.i),1);saveBuilder()}));
  const naive=state.builder.length?builderProbability():0,ev=state.builderEval,ok=ev?.status==='ok';
  const joint=ok?Number(ev.joint_probability):naive;
  $('#builderSummary').innerHTML=stat('Legs',state.builder.length)+stat('Naive P',state.builder.length?pct(naive):'—')+stat('Model P',state.builder.length>=2?(ok?pct(joint):'计算中…'):'—')+stat('Fair Odds',state.builder.length>=2?(ok?odds(ev.fair_odds):'—'):'—');
  const dep=$('#builderDependencyDetails');
  if(dep){
    if(ok){const pairs=ev.pair_details||[];dep.innerHTML=`<div class="dependency-head"><strong>Dependency ×${Number(ev.dependency_factor||1).toFixed(3)}</strong><span>${ev.empirical_pairs??0}/${ev.dependent_pairs??0} empirical pairs</span></div>${pairs.length?pairs.map(x=>`<div class="dependency-row"><span>${esc(x.player_a)} ${esc(String(x.market_a).replaceAll('_',' '))} ↔ ${esc(x.player_b)} ${esc(String(x.market_b).replaceAll('_',' '))}</span><b>×${Number(x.factor).toFixed(3)}</b><small>n=${x.sample_size??'fallback'}</small></div>`).join(''):'<div class="match-meta">组合腿之间没有同球员/同队依赖，按独立处理。</div>'}`}
    else dep.innerHTML=state.builder.length>=2?'<div class="match-meta">正在计算 empirical dependency…</div>':'';
  }
  const vr=$('#builderValueResult');
  if(vr){if(ok&&ev.actual_odds){vr.className=`value-result ${Number(ev.value_pct)>=0?'good':'bad'}`;vr.textContent=`${String(ev.value_label||'').replaceAll('_',' ')} · Value ${Number(ev.value_pct)>=0?'+':''}${Number(ev.value_pct).toFixed(2)}% · Model P ${pct(ev.joint_probability)} · Fair ${odds(ev.fair_odds)}`}else if(state.builder.length>=2){vr.className='value-result';vr.textContent='输入实际赔率后自动计算 Value'}else{vr.className='value-result';vr.textContent=''}}
  const search=$('#builderSearch').value.trim().toLowerCase();const candidates=state.legs.filter(l=>!state.builder.some(x=>x.prediction_leg_id===l.prediction_leg_id)&&(!search||`${l.player_name} ${l.market} ${l.selection}`.toLowerCase().includes(search))).slice(0,50);
  $('#builderCandidates').innerHTML=candidates.map(l=>`<div class="candidate"><span><strong>${esc(l.selection)}</strong><br><span class="match-meta">${pct(l.model_probability)} · Fair ${odds(l.fair_odds)}</span></span><span class="prob ${probClass(l.model_probability)}">${pct(l.model_probability)}</span><button data-leg-id="${l.prediction_leg_id}">+</button></div>`).join('')||'<div class="empty">没有更多候选</div>';
  $$('#builderCandidates button').forEach(b=>b.addEventListener('click',()=>addLegById(b.dataset.legId)));updateBuilderCount();
}

function renderField(){
  const teams=[...new Set(state.lineup.map(x=>x.team_name))];
  $('#fieldTeams').innerHTML=teams.map(team=>`<div class="field-team"><h3>${esc(team)}</h3>${state.lineup.filter(x=>x.team_name===team).map(p=>`<button class="field-player ${p.emergency?'emergency':p.bench?'bench':''}" data-player-id="${p.player_id}"><strong>${esc(p.player_name)}</strong><br><span>${esc(p.named_position||'')}</span></button>`).join('')}</div>`).join('');
  $$('#fieldTeams .field-player').forEach(b=>b.addEventListener('click',()=>fieldAdd(b.dataset.playerId)));
}
function fieldAdd(playerId){const market=$('#fieldMarket').value;let legs=state.legs.filter(l=>l.player_id===playerId);if(market!=='best')legs=legs.filter(l=>l.market===market);legs.sort((a,b)=>Number(b.model_probability)-Number(a.model_probability));if(legs[0])addLegById(legs[0].prediction_leg_id)}

function switchView(name){state.view=name;$$('.view').forEach(v=>v.classList.remove('active-view'));$(`#view-${name}`)?.classList.add('active-view');$$('.tab').forEach(t=>t.classList.toggle('active',t.dataset.view===name));if(name==='multi-lab')renderBuilder();if(name==='validation')renderValidation();if(name==='shadow-live')renderShadowLive()}
function showError(e){console.error(e);$('#healthBadge').className='badge bad';$('#healthBadge').textContent='API Error'}
async function bootstrap(){try{await loadValidation();await loadMatches();await loadSelected()}catch(e){showError(e)}}

$$('.tab').forEach(t=>t.addEventListener('click',()=>switchView(t.dataset.view)));$$('[data-go]').forEach(b=>b.addEventListener('click',()=>switchView(b.dataset.go)));
$('#matchSelect').addEventListener('change',e=>{state.selected=e.target.value;state.systemMultiOdds={};state.systemMultiRanking=new Map();loadSelected().catch(showError)});
$('#playerSearch').addEventListener('input',renderPlayers);$('#marketFilter').addEventListener('change',renderPlayers);
['#strategyFilter','#legCountFilter','#recommendedOnly'].forEach(s=>$(s).addEventListener('change',renderMultis));
$('#builderSearch').addEventListener('input',renderBuilder);$('#clearBuilder').addEventListener('click',()=>{state.builder=[];saveBuilder()});
let builderOddsTimer;$('#builderActualOdds').addEventListener('input',()=>{clearTimeout(builderOddsTimer);builderOddsTimer=setTimeout(()=>evaluateBuilder().catch(showError),250)});
$('#builderValueBtn').addEventListener('click',()=>evaluateBuilder().catch(showError));
$('#refreshBtn').addEventListener('click',bootstrap);
bootstrap();
