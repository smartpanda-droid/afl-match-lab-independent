const CFG = window.AFL_CONFIG;
if(CFG?.PARALLEL_TEST){
  document.documentElement.dataset.environment='parallel-test';
  document.title='AFL Match Lab · Parallel Test';
}else{
  const b=document.getElementById('parallelTestBanner'); if(b)b.hidden=true;
}
const state = { matches:[], selected:null, legs:[], multis:[], lineup:[], recent5:new Map(), availability:new Map(), context:null, validation:[], marketPolicy:[], finalAuditSummary:[], finalAudit:[], builder:[], builderEval:null, builderEvalSeq:0, systemMultiOdds:{}, systemMultiRanking:new Map(), systemRankSeq:0, multiStability:new Map(), finalLock:null, shadowObs:[], fieldTeamFilter:'all', playerThresholds:{}, playerManualQuotes:new Map(), playerQuoteSeq:new Map(), matchQuote:null, matchQuoteSeq:0, view:'match' };


// 2026 finals branding + jumper numbers. Numbers verified against AFL official team squad pages.
const TEAM_BRAND = {
  'Fremantle': {abbr:'FRE', logo:'https://www.afl.com.au/resources/club-watermarks/25715/fre-right-colour.png', homeBg:'linear-gradient(145deg,#2b0a3d 0 42%,#fff 43% 49%,#2b0a3d 50% 59%,#fff 60% 66%,#2b0a3d 67%)', homeFg:'#fff', awayBg:'linear-gradient(145deg,#fff 0 42%,#5b2c83 43% 49%,#fff 50% 59%,#5b2c83 60% 66%,#fff 67%)', awayFg:'#4b1f69', border:'#5b2c83'},
  'Geelong Cats': {abbr:'GEEL', logo:'https://www.afl.com.au/resources/club-watermarks/25715/geel-right-colour.png', homeBg:'repeating-linear-gradient(to bottom,#0b2341 0 5px,#fff 5px 10px)', homeFg:'#0b2341', awayBg:'repeating-linear-gradient(to bottom,#fff 0 6px,#0b2341 6px 9px)', awayFg:'#0b2341', border:'#0b2341'},
  'Brisbane Lions': {abbr:'BL', logo:'https://www.afl.com.au/resources/club-watermarks/25715/bl-right-colour.png', homeBg:'linear-gradient(135deg,#7b1635 0 60%,#f5c542 61% 72%,#1d4d8f 73%)', homeFg:'#fff', awayBg:'linear-gradient(135deg,#1d4d8f 0 58%,#f5c542 59% 71%,#7b1635 72%)', awayFg:'#fff', border:'#7b1635'},
  'Adelaide Crows': {abbr:'ADEL', logo:'https://www.afl.com.au/resources/club-watermarks/25715/adel-right-colour.png', homeBg:'repeating-linear-gradient(to bottom,#071a3d 0 7px,#d71920 7px 12px,#f6c400 12px 17px)', homeFg:'#fff', awayBg:'repeating-linear-gradient(to bottom,#fff 0 8px,#d71920 8px 11px,#f6c400 11px 14px,#071a3d 14px 17px)', awayFg:'#071a3d', border:'#071a3d'}
};

const JUMPER_2026 = {
  'Fremantle': {'Sam Sturt':1,"Jaeger O'Meara":2,'Caleb Serong':3,'Sean Darcy':4,'Heath Chapman':5,'Jordan Clark':6,'Andrew Brayshaw':8,'Luke Jackson':9,'Shai Bolton':10,'Tobyn Murray':11,'Hugh Davies':12,'Luke Ryan':13,'Jeremy Sharp':14,'Adam Sweid':15,'Murphy Reid':16,'Judd McVee':17,'Mason Cox':18,'Leon Kickett':19,'Patrick Voss':20,'Oscar McDonald':21,'Charlie Nicholls':22,'Karl Worner':23,'Jye Amiss':24,'Alex Pearce':25,'Hayden Young':26,'Toby Whan':27,'Neil Erasmus':28,'Cooper Simpson':29,"Nathan O'Driscoll":30,'Brandon Walker':31,'Michael Frederick':32,'Ollie Murphy':33,'Corey Wagner':34,'Josh Treacy':35,'Brennan Cox':36,'Joshua Draper':37,'Jaren Carr':38,'Sam Switkowski':39,'Ryda Luke':40,'Luke Ryda':40,'Bailey Banfield':41,'Aiden Riddle':42,'Isaiah Dudley':43,'Matthew Johnson':44,'Christopher Scerri':45},
  'Geelong Cats': {'Rhys Stanley':1,'Jay Polkinghorne':2,'Bailey Smith':3,'Tanner Bruhn':4,'Jeremy Cameron':5,'Toby Conway':6,'Shaun Mannagh':7,'Jake Kolodjashnij':8,'Max Holmes':9,'Mitch Knevitt':10,'Mitchell Edwards':11,'Jack Bowes':12,'Jhye Clark':13,"Connor O'Sullivan":14,'George Stevens':15,'Sam De Koning':16,'Lawson Humphries':17,'Tyson Stengle':18,'Jack Martin':19,'Jacob Molier':20,'Oliver Wiltshire':21,'Hunter Holmes':22,'Lennox Hofmann':23,'Jed Bews':24,'Jesse Mellor':25,'Harley Barker':26,'Nicholas Driscoll':27,'Oliver Dempsey':28,'James Worpel':29,'Tom Atkins':30,'Keighton Matofai-Forbes':31,'Gryan Miers':32,'Shannon Neale':33,'Oisin Mullin':34,'Patrick Dangerfield':35,'Oliver Henry':36,'Joe Pike':37,'Jack Henry':38,'Zach Guthrie':39,"Mark O'Connor":42,'Tom Stewart':44,'Brad Close':45,'Mark Blicavs':46},
  'Brisbane Lions': {'Kai Lohmann':1,'Sam Draper':2,'Jaspa Fletcher':3,'Oscar Allen':4,'Josh Dunkley':5,'Hugh McCluggage':6,'Jarrod Berry':7,'Will Ashcroft':8,'Lachie Neale':9,'Levi Ashcroft':10,'Lincoln McCarthy':11,'Tom Doedee':12,'Logan Morris':13,'Daniel Annable':14,'Dayne Zorko':15,'Cam Rayner':16,'Luke Beecken':17,'Keidean Coleman':18,'Luke Lloyd':19,'Sam Marshall':20,'Zane Zakostelsky':21,'Ty Gallop':22,'Charlie Cameron':23,'Koby Evans':24,'Henry Smith':25,'Conor McKenna':26,'Darcy Gardiner':27,'Will McLachlan':28,'James Tunstill':29,'Eric Hipwood':30,'Harris Andrews':31,'Darcy Fort':32,'Zac Bailey':33,'Shadeau Brain':34,'Ryan Lester':35,'Reece Torrent':36,'Cody Curtin':37,'Bruce Reville':38,'Ben Murphy':39,'Jack Payne':40,'Darragh Joyce':41,'Tai Hayes':42,'Noah Answerth':43,'Darcy Wilmot':44},
  'Adelaide Crows': {'Chayce Jones':1,'Ben Keays':2,'Sam Berry':3,'Callum Ah Chee':4,'Sid Draper':5,'Daniel Curtin':6,'Riley Thilthorpe':7,'Josh Rachele':8,'Nick Murray':9,'Luke Pedlar':10,'Charlie Edwards':11,'Jordan Dawson':12,'Taylor Walker':13,'Jake Soligo':14,'Brayden Cook':15,'Max Michalanney':16,'Tyler Welsh':17,'Zac Taylor':19,'Mitchell Hinge':20,'Hugh Bond':21,'Oscar Ryan':22,'Izak Rankine':23,'Josh Worrell':24,'James Peatling':25,'Mitchell Marsh':26,'Luke Nankervis':27,'Alex Neal-Bullen':28,'Rory Laird':29,'Wayne Milera':30,'Billy Dowling':31,'Darcy Fogarty':32,'Indy Cotton':33,'Archie Ludowyke':34,'James Borlase':35,'Finnbar Maley':36,'Lachlan Sholl':38,'Toby Murray':39,'Hugo Hall-Kahan':40,'Jordon Butts':41,'Lachlan McAndrew':42,"Reilly O'Brien":43,'Isaac Cumming':44,'Mark Keane':48}
};

function brandFor(name){return TEAM_BRAND[name]||{abbr:teamAbbr(name),logo:'',homeBg:'#123',homeFg:'#fff',awayBg:'#fff',awayFg:'#123',border:'#123'}}
function teamLogoHtml(name,cls='team-logo'){const b=brandFor(name);return b.logo?`<img class="${cls}" src="${b.logo}" alt="${esc(name)} logo" onerror="this.style.display='none';this.nextElementSibling.style.display='grid'"><span class="team-logo-fallback" style="display:none">${esc(b.abbr)}</span>`:`<span class="team-logo-fallback">${esc(b.abbr)}</span>`}
function jumperNumber(team,player){return JUMPER_2026[team]?.[player] ?? ''}
function jumperCss(team,isHome){const b=brandFor(team);return `background:${isHome?b.homeBg:b.awayBg};color:${isHome?b.homeFg:b.awayFg};border-color:${b.border}`}
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
  const [legs,multis,lineup,recent,availability,contextRows,stabilityRows,finalRows,shadowRows,matchQuoteRows]=await Promise.all([
    apiPaged(`/rest/v1/afl_api_prediction_legs?select=*&match_id=eq.${id}&order=player_name.asc,market.asc,threshold.asc`),
    api(`/rest/v1/afl_api_multis?select=*&match_id=eq.${id}&order=strategy.asc,leg_count.asc,rank_in_group.asc`),
    api(`/rest/v1/afl_api_lineup?select=*&match_id=eq.${id}&order=team_name.asc,emergency.asc,bench.asc,player_name.asc`),
    api(`/rest/v1/afl_api_player_recent5?select=player_id,player_name,team_name,recent5&match_id=eq.${id}`),
    api(`/rest/v1/afl_api_availability?select=*`),
    api(`/rest/v1/afl_api_match_context?select=*&match_id=eq.${id}`),
    api(`/rest/v1/afl_api_multi_stability?select=*&match_id=eq.${id}`),
    api(`/rest/v1/afl_api_final_recommendations?select=*&match_id=eq.${id}`),
    api(`/rest/v1/afl_api_shadow_observations?select=*&match_id=eq.${id}&order=sequence_no.asc`),
    api('/rest/v1/rpc/afl_match_market_quote',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({p_match_id:state.selected,p_line:null,p_total:null})})
  ]);
  state.legs=legs;state.multis=multis;state.lineup=lineup;state.recent5=new Map(recent.map(r=>[r.player_id,r.recent5||[]]));state.availability=new Map(availability.map(r=>[r.player_id,r]));state.context=contextRows[0]||null;state.multiStability=new Map((stabilityRows||[]).map(x=>[`${x.strategy}:${x.leg_count}:${x.slot}`,x]));state.finalLock=(finalRows||[])[0]||null;state.shadowObs=shadowRows||[];state.matchQuote=Array.isArray(matchQuoteRows)?matchQuoteRows[0]:matchQuoteRows;
  loadBuilder();renderAll();evaluateBuilder().catch(showError);
}

function stat(label,value){return `<div class="stat"><b>${value}</b><span>${label}</span></div>`}
function metric(label,value){return `<div class="metric"><b>${value}</b>${label}</div>`}
function probClass(p){p=Number(p);return p>=.65?'high':p>=.5?'mid':'low'}

function renderAll(){renderMatch();renderPlayerControls();renderPlayers();renderMultis();renderBuilder();renderField();renderTactics();renderValidation();renderShadowLive();$('#healthBadge').className='badge good';$('#healthBadge').textContent='Supabase Connected'}

async function refreshMatchQuote(){
  if(!state.selected)return;
  const seq=++state.matchQuoteSeq;
  const line=Number($('#matchLineInput')?.value); const total=Number($('#matchTotalInput')?.value);
  try{
    const r=await api('/rest/v1/rpc/afl_match_market_quote',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({p_match_id:state.selected,p_line:Number.isFinite(line)?line:null,p_total:Number.isFinite(total)?total:null})});
    if(seq!==state.matchQuoteSeq)return; state.matchQuote=Array.isArray(r)?r[0]:r; renderMatchPrediction();
  }catch(e){showError(e)}
}
function n1(v){return v==null?'—':Number(v).toFixed(1)}
function n0(v){return v==null?'—':String(Math.round(Number(v)))}
function half(v){if(v==null)return null;return Math.round(Number(v)*2)/2}
function halfText(v){const n=half(v);return n==null?'—':n.toFixed(1)}
function renderMatchPrediction(){
  const q=state.matchQuote, host=$('#matchPrediction'); if(!host)return;
  if(!q){host.innerHTML='<div class="empty">暂无比赛市场预测</div>';return}
  const fairLine=half(q.fair_home_line), fairTotal=half(q.fair_total), quotedLine=half(q.quoted_line), quotedTotal=half(q.quoted_total);
  host.innerHTML=`<div class="match-pred-grid">
    <article class="prediction-card score-card"><div class="eyebrow">PREDICTED SCORE</div><div class="score-pair"><div><strong>${esc(q.home_team_name)}</strong><b>${n0(q.predicted_home_score)}</b><small>${n0(q.home_score_low)}–${n0(q.home_score_high)}</small></div><span>–</span><div><strong>${esc(q.away_team_name)}</strong><b>${n0(q.predicted_away_score)}</b><small>${n0(q.away_score_low)}–${n0(q.away_score_high)}</small></div></div><div class="win-probs"><span>${esc(q.home_team_name)} ${pct(q.home_win_probability)}</span><span>${esc(q.away_team_name)} ${pct(q.away_win_probability)}</span></div></article>
    <article class="prediction-card"><div class="eyebrow">LINE / 让球</div><div class="fair-market"><span>Model fair home line</span><b>${fairLine>=0?'+':''}${halfText(fairLine)}</b></div><div class="market-stepper"><button type="button" data-match-step="line" data-delta="-0.5">−</button><input id="matchLineInput" type="number" step="0.5" value="${halfText(quotedLine)}"><button type="button" data-match-step="line" data-delta="0.5">+</button></div><div class="market-probs"><span>Home cover <b>${pct(q.home_cover_probability)}</b></span><span>Away cover <b>${pct(q.away_cover_probability)}</b></span></div></article>
    <article class="prediction-card"><div class="eyebrow">TOTAL POINTS / 总比分</div><div class="fair-market"><span>Model fair total</span><b>${halfText(fairTotal)}</b></div><div class="market-stepper"><button type="button" data-match-step="total" data-delta="-0.5">−</button><input id="matchTotalInput" type="number" step="0.5" value="${halfText(quotedTotal)}"><button type="button" data-match-step="total" data-delta="0.5">+</button></div><div class="market-probs"><span>Over <b>${pct(q.over_probability)}</b></span><span>Under <b>${pct(q.under_probability)}</b></span></div></article>
  </div><div class="prediction-foot">Model ${esc(q.model_method)} · samples ${q.sample_home}/${q.sample_away} · Score rounded to whole points; Line / Total use 0.5 increments.</div>`;
  $$('#matchPrediction [data-match-step]').forEach(b=>b.addEventListener('click',()=>{const id=b.dataset.matchStep==='line'?'matchLineInput':'matchTotalInput';const el=$('#'+id);el.value=halfText(Number(el.value||0)+Number(b.dataset.delta));refreshMatchQuote()}));
  const snapAndRefresh=el=>{el.value=halfText(el.value);refreshMatchQuote()};
  $('#matchLineInput')?.addEventListener('change',e=>snapAndRefresh(e.currentTarget)); $('#matchTotalInput')?.addEventListener('change',e=>snapAndRefresh(e.currentTarget));
}

function balancedTopLegs(legs,limit=10){
  const seen=new Set();
  const ranked=(legs||[]).filter(l=>{const p=Number(l.model_probability),o=Number(l.fair_odds);return p>=0.55&&p<=0.90&&o>=1.15&&o<=1.90;}).map(l=>{
    const p=Number(l.model_probability), recent=Number(l.recent_hit_rate ?? p), n=Math.min(1,Number(l.sample_size||0)/15), o=Number(l.fair_odds);
    const returnUtility=Math.max(0,Math.min(1,(o-1.10)/0.70));
    return {...l,_balance:0.52*p+0.23*recent+0.10*n+0.15*returnUtility};
  }).sort((a,b)=>b._balance-a._balance);
  const out=[];
  for(const l of ranked){const key=`${l.player_id}:${l.market}`;if(seen.has(key))continue;seen.add(key);out.push(l);if(out.length>=limit)break;}
  if(out.length<limit){for(const l of [...(legs||[])].sort((a,b)=>Number(b.model_probability)-Number(a.model_probability))){const key=`${l.player_id}:${l.market}`;if(seen.has(key)||Number(l.model_probability)<0.50)continue;seen.add(key);out.push(l);if(out.length>=limit)break;}}
  return out;
}

function renderMatch(){
  const m=state.matches.find(x=>x.match_id===state.selected);if(!m)return;
  $('#matchSummary').innerHTML=`<div class="match-team home"><div class="team-name">${esc(m.home_team_name)}</div><div class="match-meta">HOME</div><div class="match-team-logo">${teamLogoHtml(m.home_team_name,'team-logo-large')}</div></div><div class="match-mid"><div class="eyebrow">${esc(m.round_name)} · ${esc(m.venue||'TBC')}</div><strong>${dt(m.start_time)}</strong><div class="match-meta">${esc(m.status)}</div></div><div class="match-team away"><div class="team-name">${esc(m.away_team_name)}</div><div class="match-meta">AWAY</div><div class="match-team-logo">${teamLogoHtml(m.away_team_name,'team-logo-large')}</div></div>`;
  const confirmed=!!m.lineup_confirmed,fallback=!!m.used_fallback_lineup;
  $('#lineupBadge').className=`badge ${confirmed?'good':fallback?'warn':'neutral'}`;$('#lineupBadge').textContent=confirmed?'LATEST TEAM':fallback?'PREVIOUS MATCH':'PENDING';
  const bench=state.lineup.filter(x=>x.bench&&!x.emergency).length, emerg=state.lineup.filter(x=>x.emergency).length;
  $('#lineupSummary').innerHTML=stat('Players',state.lineup.filter(x=>!x.emergency).length)+stat('Interchanges',bench)+stat('Emergencies',emerg);
  const src=$('#matchLineupSource');if(src){src.className=`lineup-source-note ${confirmed?'current':fallback?'fallback':'pending'}`;src.innerHTML=confirmed?'<strong>最新阵容</strong><span>已同步当前比赛阵容；后续数据更新将自动覆盖。</span>':fallback?'<strong>上一场阵容待入</strong><span>当前比赛最新阵容尚未发布，暂用两队上一场位置；最新阵容同步后会自动覆盖。</span>':'<strong>等待阵容</strong><span>尚未取得可用阵容。</span>';}
  const locked=!!state.finalLock||!!m.final_recommendation_locked;$('#modelBadge').className=`badge ${locked||m.prediction_is_final?'good':'warn'}`;$('#modelBadge').textContent=locked?'FINAL LOCKED':m.prediction_is_final?'T-30 FINAL':'PREVIEW';
  $('#modelSummary').innerHTML=stat('Model',esc(m.model_version||'—'))+stat('Legs',state.legs.length)+stat('Multi',state.multis.filter(x=>x.recommended).length);
  const topBalanced=balancedTopLegs(state.legs,10);
  $('#topLegs').innerHTML=topBalanced.map(l=>`<div class="top-leg"><div class="p">${pct(l.model_probability)}</div><div class="sel">${esc(l.selection)}</div><div class="meta">Fair ${odds(l.fair_odds)} · Recent ${pct(l.recent_hit_rate)} · n=${l.sample_size??'—'}</div><button class="add-leg" data-leg-id="${l.prediction_leg_id}">+ Multi Lab</button></div>`).join('')||'<div class="empty">暂无符合概率/赔率平衡条件的单腿</div>';
  $$('#topLegs .add-leg').forEach(b=>b.addEventListener('click',()=>addLegById(b.dataset.legId)));
  renderMatchPrediction();
}

function scenarioLabel(k){return ({home_control:'主队控制',away_control:'客队控制',close_contest:'全场焦灼',momentum_comeback:'追分/反扑',blowout_garbage_time:'大比分/垃圾时间',low_scoring_defensive:'低比分防守战'})[k]||k.replaceAll('_',' ')}
function renderScenarioCards(limit=6){const sw=state.context?.scenario_weights||{};return Object.entries(sw).sort((a,b)=>Number(b[1])-Number(a[1])).slice(0,limit).map(([k,v])=>`<div class="scenario-card"><div class="scenario-top"><strong>${esc(scenarioLabel(k))}</strong><span>${pct(v)}</span></div><div class="scenario-bar"><i style="width:${Math.min(100,Number(v)*100)}%"></i></div></div>`).join('')||'<div class="empty">Context 尚未生成</div>'}
function styleValue(v){return v==null?'—':Number(v).toFixed(1)}
function renderTactics(){
  const c=state.context;if(!c){$('#scenarioPreview').innerHTML='<div class="empty">Context 尚未生成</div>';$('#tacticalPreview').innerHTML='<div class="empty">暂无战术数据</div>';$('#teamStyleCards').innerHTML='<div class="empty">暂无球队画像</div>';$('#scenarioDetail').innerHTML='<div class="empty">暂无场景</div>';$('#synergyCards').innerHTML='<div class="empty">暂无协同数据</div>';if($('#fieldTacticalSummary'))$('#fieldTacticalSummary').innerHTML='<p class="note">暂无战术 context</p>';if($('#matchFieldTacticalSummary'))$('#matchFieldTacticalSummary').innerHTML='<p class="note">暂无战术 context</p>';return}
  $('#scenarioPreview').innerHTML=renderScenarioCards(4);$('#scenarioDetail').innerHTML=renderScenarioCards(6);
  const t=c.tactical_summary||{};const m=state.matches.find(x=>x.match_id===state.selected);
  $('#tacticalPreview').innerHTML=`<div class="tactic-line"><span>Clearance edge</span><strong>${t.clearance_edge==='home'?esc(m?.home_team_name):t.clearance_edge==='away'?esc(m?.away_team_name):'Even'}</strong></div><div class="tactic-line"><span>Pressure edge</span><strong>${t.pressure_edge==='home'?esc(m?.home_team_name):t.pressure_edge==='away'?esc(m?.away_team_name):'Even'}</strong></div><div class="tactic-line"><span>Home style</span><strong>${esc(t.home_style||'—')}</strong></div><div class="tactic-line"><span>Away style</span><strong>${esc(t.away_style||'—')}</strong></div>`;
  const profiles=[[m?.home_team_name,c.home_profile],[m?.away_team_name,c.away_profile]];
  $('#teamStyleCards').innerHTML=profiles.map(([name,p])=>`<article class="team-style-card"><h3>${esc(name||'Team')}</h3><div class="profile-stats">${stat('Games',p?.sample_games??'—')}${stat('Avg score',styleValue(p?.avg_score))}${stat('Avg margin',styleValue(p?.avg_margin))}${stat('Home margin',styleValue(p?.home_avg_margin))}${stat('Away margin',styleValue(p?.away_avg_margin))}${stat('Clearances',styleValue(p?.avg_clearances))}${stat('Tackles',styleValue(p?.avg_tackles))}${stat('Inside 50s',styleValue(p?.avg_inside50s))}</div></article>`).join('');
  $('#synergyCards').innerHTML=(c.top_synergies||[]).map(s=>`<article class="synergy-card"><div><span class="eyebrow">${esc(s.team)}</span><h3>${esc(s.player_a)} ↔ ${esc(s.player_b)}</h3></div><div class="synergy-score ${Number(s.synergy_score)>=0?'pos':'neg'}">${Number(s.synergy_score).toFixed(3)}</div><div class="synergy-metrics"><span>Shared <b>${s.shared_games}</b></span><span>Disp <b>${s.disposal_corr==null?'—':Number(s.disposal_corr).toFixed(2)}</b></span><span>Marks <b>${s.mark_corr==null?'—':Number(s.mark_corr).toFixed(2)}</b></span><span>Fantasy <b>${s.fantasy_corr==null?'—':Number(s.fantasy_corr).toFixed(2)}</b></span></div></article>`).join('')||'<div class="empty">没有达到共同出场样本门槛的球员组合</div>';
  const fieldSummary=`<div class="mini-context"><strong>Context v0.1</strong><span>Clearance: ${esc(t.clearance_edge||'even')} · Pressure: ${esc(t.pressure_edge||'even')}</span><span>Top scenario: ${esc(scenarioLabel(Object.entries(c.scenario_weights||{}).sort((a,b)=>Number(b[1])-Number(a[1]))[0]?.[0]||'—'))}</span></div>`;
  if($('#fieldTacticalSummary'))$('#fieldTacticalSummary').innerHTML=fieldSummary;
  if($('#matchFieldTacticalSummary'))$('#matchFieldTacticalSummary').innerHTML=fieldSummary;
}

const MARKET_LABELS={disposals:'Disposals',kicks:'Kicks',marks:'Marks',tackles:'Tackles',fantasy_points:'Fantasy',handballs:'Handballs',hitouts:'Hitouts',clearances:'Clearances',goals:'Goals'};
function marketLabel(m){return MARKET_LABELS[m]||String(m||'').replaceAll('_',' ')}
function playerThresholdKey(playerId,market){return `${playerId}:${market}`}
function selectedPlayerLeg(options){
  const sorted=[...options].sort((a,b)=>Number(a.threshold)-Number(b.threshold));
  const key=playerThresholdKey(sorted[0]?.player_id,sorted[0]?.market);
  const wanted=Number(state.playerThresholds[key]);
  const exact=sorted.find(x=>Number(x.threshold)===wanted);
  if(exact)return exact;
  const quote=state.playerManualQuotes.get(key);
  if(quote&&Number(quote.threshold)===wanted)return {...sorted[0],...quote,prediction_leg_id:null,manual_quote:true};
  return sorted[0];
}
async function quotePlayerThreshold(playerId,market,threshold){
  const key=playerThresholdKey(playerId,market), seq=(state.playerQuoteSeq.get(key)||0)+1; state.playerQuoteSeq.set(key,seq);
  state.playerThresholds[key]=threshold;
  try{
    const r=await api('/rest/v1/rpc/afl_player_market_quote',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({p_match_id:state.selected,p_player_id:playerId,p_market:market,p_threshold:threshold})});
    if(state.playerQuoteSeq.get(key)!==seq)return; const q=Array.isArray(r)?r[0]:r; if(q)state.playerManualQuotes.set(key,q); renderPlayers();
  }catch(e){showError(e)}
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
      const chosen=Number(state.playerThresholds[key]??l.threshold);
      return `<div class="player-market-row player-market-option" data-player="${pid}" data-market="${esc(m)}"><div class="market-select-wrap threshold-stepper"><span>${esc(marketLabel(m))}</span><button type="button" class="threshold-step" data-player="${pid}" data-market="${esc(m)}" data-delta="-1">−</button><input class="threshold-input" data-player="${pid}" data-market="${esc(m)}" data-key="${esc(key)}" type="number" min="1" step="1" value="${chosen}"><button type="button" class="threshold-step" data-player="${pid}" data-market="${esc(m)}" data-delta="1">+</button><em>+</em></div><span class="prob ${probClass(l.model_probability)}">${pct(l.model_probability)}</span><span class="fair-odds">Fair ${odds(l.fair_odds)}</span><div class="context-line ${ctxClass}"><span>${esc((l.opponent_tier||'mid').toUpperCase())} OPP · ${esc((l.venue_role||'—').toUpperCase())}${l.is_final?' · FINALS':''}</span><span>CTX ×${cf.toFixed(3)} · O ${of.toFixed(3)} / V ${vf.toFixed(3)} / F ${ff.toFixed(3)}</span><span>n ${l.opponent_samples??0}/${l.venue_samples??0}/${l.finals_samples??0} · 2025 Finals ${l.prior_finals_samples??0} (w ${Number(l.prior_finals_weight||0).toFixed(3)})</span><span class="role-line ${Number(l.role_factor||1)>1.01?'ctx-up':Number(l.role_factor||1)<0.99?'ctx-down':'ctx-flat'}">ROLE ${esc((l.role_label||'stable').replaceAll('_',' ').toUpperCase())} · ×${Number(l.role_factor||1).toFixed(3)} · conf ${Math.round(Number(l.role_confidence||0)*100)}% · n ${l.role_samples??0}</span></div>${renderRecent(l)}<button class="add-leg" ${l.prediction_leg_id?`data-leg-id="${l.prediction_leg_id}"`:'disabled title="Custom threshold will be enabled in Multi Lab parity step"'}>${l.prediction_leg_id?'+ Multi Lab':'Custom quote'}</button></div>`;
    }).join('');
    return `<article class="player-card"><div class="player-card-head"><div><h3>${esc(first.player_name)}</h3><div class="match-meta">${esc(first.team_name||'')} ${first.bench?'· Bench':''}</div>${riskLine}</div><span class="badge ${badgeClass}">${esc(badge)}</span></div>${rows}</article>`;
  });
  $('#playerCards').innerHTML=cards.join('')||'<div class="empty">没有符合条件的球员</div>';
  $$('#playerCards .threshold-input').forEach(inp=>inp.addEventListener('change',()=>{const v=Math.max(1,Math.round(Number(inp.value)||1));quotePlayerThreshold(inp.dataset.player,inp.dataset.market,v)}));
  $$('#playerCards .threshold-step').forEach(btn=>btn.addEventListener('click',()=>{const key=playerThresholdKey(btn.dataset.player,btn.dataset.market);const current=Number(state.playerThresholds[key]||btn.closest('.threshold-stepper').querySelector('.threshold-input').value||1);quotePlayerThreshold(btn.dataset.player,btn.dataset.market,Math.max(1,current+Number(btn.dataset.delta)))}));
  $$('#playerCards .add-leg[data-leg-id]').forEach(b=>b.addEventListener('click',()=>addLegById(b.dataset.legId)));
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

function teamAbbr(name){
  const n=String(name||'').trim();
  const known={'Geelong Cats':'GEEL','Fremantle':'FRE','Brisbane Lions':'BL','Adelaide Crows':'ADEL','Carlton':'CARL'};
  if(known[n])return known[n];
  const words=n.split(/\s+/).filter(Boolean);return (words.length>1?words.map(x=>x[0]).join(''):n.slice(0,4)).toUpperCase().slice(0,4);
}
function positionPlayer(team,pos){return state.lineup.find(x=>x.team_name===team&&!x.bench&&!x.emergency&&x.named_position===pos)}
function lineupPlayerCard(p,teamIndex){
  if(!p)return '<div class="lineup-player-card empty-slot"></div>';
  const m=state.matches.find(x=>x.match_id===state.selected);const isHome=p.team_name===m?.home_team_name;const no=jumperNumber(p.team_name,p.player_name);
  return `<button class="lineup-player-card team-${teamIndex} ${isHome?'home-strip':'away-strip'}" data-player-id="${p.player_id}" title="${esc(p.named_position||'')} · ${isHome?'Home':'Away'} guernsey"><span class="jumper-token" style="${jumperCss(p.team_name,isHome)}">${no!==''?esc(no):'–'}</span><strong>${esc(p.player_name)}</strong></button>`;
}
function lineRow(team,teamIndex,label,positions){return `<div class="position-row team-${teamIndex}"><span class="position-label">${esc(label)}</span><div class="position-three">${positions.map(pos=>lineupPlayerCard(positionPlayer(team,pos),teamIndex)).join('')}</div></div>`}
function followerCards(team,teamIndex){return ['RK','R','RR'].map(pos=>lineupPlayerCard(positionPlayer(team,pos),teamIndex)).join('')}
function benchCards(team,teamIndex){return state.lineup.filter(x=>x.team_name===team&&x.bench&&!x.emergency).map(p=>lineupPlayerCard(p,teamIndex)).join('')}
function emergencyCards(team,teamIndex){return state.lineup.filter(x=>x.team_name===team&&x.emergency).map(p=>lineupPlayerCard(p,teamIndex)).join('')}
function renderMatchFieldBoard(){
  const m=state.matches.find(x=>x.match_id===state.selected);
  const teams=[m?.home_team_name,m?.away_team_name].filter(Boolean);
  const host=$('#matchFieldTeams');if(!host)return;
  if(teams.length<2||!state.lineup.length){host.innerHTML='<div class="empty">暂无阵容</div>';return}
  if(!['all',...teams].includes(state.fieldTeamFilter))state.fieldTeamFilter='all';
  const visible=i=>state.fieldTeamFilter==='all'||state.fieldTeamFilter===teams[i];
  const filters=`<div class="lineup-team-filters"><button data-team="all" class="${state.fieldTeamFilter==='all'?'active':''}">All</button>${teams.map((t,i)=>`<button data-team="${esc(t)}" class="${state.fieldTeamFilter===t?'active':''}">${teamAbbr(t)}</button>`).join('<span class="filter-divider"></span>')}</div>`;
  const legend=`<div class="lineup-team-legend">${teams.map((t,i)=>`<span class="legend-team team-${i} ${visible(i)?'':'dim'}"><span class="legend-logo">${teamLogoHtml(t,'team-logo-small')}</span>${esc(t)} <small>${i===0?'HOME':'AWAY'}</small></span>`).join('')}</div>`;
  const rows=[];
  if(visible(0)){rows.push(lineRow(teams[0],0,'FB',['BPL','FB','BPR']));rows.push(lineRow(teams[0],0,'HB',['HBFL','CHB','HBFR']));rows.push(lineRow(teams[0],0,'C',['WL','C','WR']));rows.push(lineRow(teams[0],0,'HF',['HFFL','CHF','HFFR']));rows.push(lineRow(teams[0],0,'FF',['FPL','FF','FPR']));}
  if(visible(1)){const r=[lineRow(teams[1],1,'FF',['FPL','FF','FPR']),lineRow(teams[1],1,'HF',['HFFL','CHF','HFFR']),lineRow(teams[1],1,'C',['WL','C','WR']),lineRow(teams[1],1,'HB',['HBFL','CHB','HBFR']),lineRow(teams[1],1,'FB',['BPL','FB','BPR'])];if(state.fieldTeamFilter==='all'){rows.splice(1,0,r[0]);rows.splice(3,0,r[1]);rows.splice(5,0,r[2]);rows.splice(7,0,r[3]);rows.push(r[4]);}else rows.push(...r);}
  let centerRows;
  if(state.fieldTeamFilter==='all'){
    centerRows=[lineRow(teams[0],0,'FB',['BPL','FB','BPR']),lineRow(teams[1],1,'FF',['FPL','FF','FPR']),lineRow(teams[0],0,'HB',['HBFL','CHB','HBFR']),lineRow(teams[1],1,'HF',['HFFL','CHF','HFFR']),lineRow(teams[0],0,'C',['WL','C','WR']),lineRow(teams[1],1,'C',['WL','C','WR']),lineRow(teams[0],0,'HF',['HFFL','CHF','HFFR']),lineRow(teams[1],1,'HB',['HBFL','CHB','HBFR']),lineRow(teams[0],0,'FF',['FPL','FF','FPR']),lineRow(teams[1],1,'FB',['BPL','FB','BPR'])].join('');
  }else{
    const i=state.fieldTeamFilter===teams[0]?0:1,t=teams[i];
    const defs=i===0?[['FB',['BPL','FB','BPR']],['HB',['HBFL','CHB','HBFR']],['C',['WL','C','WR']],['HF',['HFFL','CHF','HFFR']],['FF',['FPL','FF','FPR']]]:[['FF',['FPL','FF','FPR']],['HF',['HFFL','CHF','HFFR']],['C',['WL','C','WR']],['HB',['HBFL','CHB','HBFR']],['FB',['BPL','FB','BPR']]];
    centerRows=defs.map(([l,p])=>lineRow(t,i,l,p)).join('');
  }
  const left=`<aside class="lineup-side followers"><h3>Followers</h3>${teams.map((t,i)=>visible(i)?`<div class="side-team-block team-${i}">${followerCards(t,i)}</div>`:'').join('')}</aside>`;
  const right=`<aside class="lineup-side interchanges"><h3>Interchanges</h3>${teams.map((t,i)=>visible(i)?`<div class="side-team-block team-${i}">${benchCards(t,i)}</div>`:'').join('')}</aside>`;
  const emergencies=teams.map((t,i)=>visible(i)?emergencyCards(t,i):'').join('');
  host.innerHTML=`${filters}${legend}<div class="lineup-main-grid">${left}<div class="afl-oval"><div class="oval-markings"><div class="centre-square"></div><div class="centre-circle"></div><div class="arc arc-top"></div><div class="arc arc-bottom"></div></div><div class="position-stack">${centerRows}</div></div>${right}</div>${emergencies?`<div class="emergency-strip"><span>Emergencies</span>${emergencies}</div>`:''}`;
  $$('#matchFieldTeams .lineup-team-filters button').forEach(b=>b.addEventListener('click',()=>{state.fieldTeamFilter=b.dataset.team;renderMatchFieldBoard()}));
  $$('#matchFieldTeams .lineup-player-card[data-player-id]').forEach(b=>b.addEventListener('click',()=>fieldAdd(b.dataset.playerId,$('#matchFieldMarket')?.value||'best')));
}
function renderField(){
  renderMatchFieldBoard();
  const teams=[...new Set(state.lineup.map(x=>x.team_name))];
  const markup=teams.map(team=>`<div class="field-team"><h3>${esc(team)}</h3>${state.lineup.filter(x=>x.team_name===team).map(p=>`<button class="field-player ${p.emergency?'emergency':p.bench?'bench':''}" data-player-id="${p.player_id}"><strong>${esc(p.player_name)}</strong><br><span>${esc(p.named_position||'')}</span></button>`).join('')}</div>`).join('')||'<div class="empty">暂无阵容</div>';
  const host=$('#fieldTeams');if(host)host.innerHTML=markup;
  $$('#fieldTeams .field-player').forEach(b=>b.addEventListener('click',()=>fieldAdd(b.dataset.playerId,$('#fieldMarket')?.value||'best')));
}

function fieldAdd(playerId,market='best'){let legs=state.legs.filter(l=>l.player_id===playerId);if(market!=='best')legs=legs.filter(l=>l.market===market);legs.sort((a,b)=>Number(b.model_probability)-Number(a.model_probability));if(legs[0])addLegById(legs[0].prediction_leg_id)}

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
