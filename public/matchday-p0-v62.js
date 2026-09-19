/* AFL Match Lab P0 v62 — decision layer only. Does not change model probabilities. */
(function(){
  'use strict';
  const P0='P0 v62';
  const $p=s=>document.querySelector(s);
  const $$p=s=>[...document.querySelectorAll(s)];
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:null};
  const escp=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pctp=v=>{const n=num(v);return n==null?'—':Math.round(n*100)+'%'};
  const oddsp=v=>{const n=num(v);return n&&n>0?n.toFixed(2):'—'};
  const labelMarket=v=>{
    try{return typeof marketLabel==='function'?marketLabel(v):String(v||'').replaceAll('_',' ')}
    catch{return String(v||'').replaceAll('_',' ')}
  };
  const matchNow=()=>state.matches?.find(x=>x.match_id===state.selected)||null;
  const quoteNow=()=>state.matchQuote||null;

  function firstTimestamp(obj){
    if(!obj)return null;
    const keys=['source_updated_at','updated_at','calculated_at','generated_at','created_at','frozen_at','synced_at','observed_at'];
    for(const k of keys){if(obj[k]&&Number.isFinite(Date.parse(obj[k])))return obj[k]}
    return null;
  }
  function newestTimestamp(rows){
    const xs=(Array.isArray(rows)?rows:[rows]).map(firstTimestamp).filter(Boolean).map(Date.parse).filter(Number.isFinite);
    return xs.length?new Date(Math.max(...xs)).toISOString():null;
  }
  function ageText(ts){
    if(!ts||!Number.isFinite(Date.parse(ts)))return 'Timestamp unavailable';
    const ms=Math.max(0,Date.now()-Date.parse(ts)),m=Math.round(ms/60000);
    if(m<1)return 'Updated now';
    if(m<60)return 'Updated '+m+' min ago';
    const h=Math.round(m/60);if(h<24)return 'Updated '+h+'h ago';
    return 'Updated '+Math.round(h/24)+'d ago';
  }
  function moduleState(name){
    const x=state.moduleStatus?.[name];
    if(!x)return {text:'Waiting',cls:'neutral',at:null};
    const s=typeof x==='string'?x:x.status;
    if(s==='ok')return {text:'Loaded',cls:'good',at:x.at||null};
    if(s==='cache')return {text:'Cached',cls:'warn',at:x.at||null};
    if(s==='loading')return {text:'Updating',cls:'neutral',at:x.at||null};
    if(s==='error')return {text:'Error',cls:'bad',at:x.at||null};
    return {text:String(s||'Waiting'),cls:'neutral',at:x.at||null};
  }

  function confidenceLevel(ratio){
    if(ratio>=.76)return 'HIGH';
    if(ratio>=.53)return 'MEDIUM';
    return 'LOW';
  }
  function confidenceClass(level){return level==='HIGH'?'high':level==='MEDIUM'?'medium':'low'}

  function legConfidence(leg){
    const m=matchNow();let score=0,max=0;const details=[];
    const add=(label,pts,cap,text)=>{score+=pts;max+=cap;details.push({label,text})};

    const sample=num(leg?.sample_size);
    add('Sample quality',sample>=18?2:sample>=9?1:0,2,sample==null?'Unknown':sample>=18?'Good · n='+sample:sample>=9?'Moderate · n='+sample:'Thin · n='+sample);

    if(m?.lineup_confirmed)add('Lineup certainty',2,2,'High · latest team');
    else if(m?.used_fallback_lineup)add('Lineup certainty',1,2,'Medium · previous-match fallback');
    else add('Lineup certainty',0,2,'Low · lineup pending');

    const av=state.availability?.get?.(leg?.player_id);
    const injury=!!leg?.active_injury || !!av?.explicit_injury || (av?.status&&av.status!=='normal');
    add('Injury uncertainty',injury?0:2,2,injury?'Elevated':'Low');

    const rc=num(leg?.role_confidence);
    if(rc!=null)add('Role stability',rc>=.72?2:rc>=.48?1:0,2,(rc>=.72?'High':rc>=.48?'Medium':'Low')+' · '+Math.round(rc*100)+'%');

    const os=num(leg?.opponent_samples);
    if(os!=null)add('Opposition evidence',os>=8?1:os>=4?0.5:0,1,os>=8?'Good · n='+os:os>=4?'Moderate · n='+os:'Thin · n='+os);

    const ratio=max?score/max:0;
    return {level:confidenceLevel(ratio),ratio,details,injury};
  }

  function matchConfidence(){
    const m=matchNow(),q=quoteNow();let score=0,max=8;const details=[];
    if(m?.lineup_confirmed){score+=2;details.push(['Lineup','High · latest team'])}
    else if(m?.used_fallback_lineup){score+=1;details.push(['Lineup','Medium · fallback'])}
    else details.push(['Lineup','Low · pending']);

    if(state.finalLock||m?.final_recommendation_locked||m?.prediction_is_final){score+=2;details.push(['Model stage','Final / locked'])}
    else {score+=1;details.push(['Model stage','Pregame preview'])}

    const samples=[num(q?.sample_home),num(q?.sample_away)].filter(v=>v!=null);
    const s=samples.length?Math.min(...samples):null;
    if(s!=null&&s>=10){score+=2;details.push(['Match sample','Good · '+s+'+'])}
    else if(s!=null&&s>=5){score+=1;details.push(['Match sample','Moderate · '+s+'+'])}
    else details.push(['Match sample',s==null?'Unknown':'Thin · '+s]);

    const names=['lineup','quote','context','top'],mods=names.map(moduleState);
    const good=mods.filter(x=>x.cls==='good').length,errors=mods.filter(x=>x.cls==='bad').length;
    if(errors===0&&good>=3)score+=2;else if(errors===0&&good>=1)score+=1;
    details.push(['Data modules',errors?errors+' error(s)':good+'/'+names.length+' loaded']);

    const ratio=score/max;
    return {level:confidenceLevel(ratio),ratio,details};
  }

  function whyRisk(leg){
    const c=legConfidence(leg),m=matchNow(),why=[],risk=[];
    const recent=num(leg?.recent_hit_rate),sample=num(leg?.sample_size);
    if(recent!=null)why.push('Recent hit rate '+pctp(recent));
    if(sample!=null)why.push('Model sample n='+sample);
    const cf=num(leg?.context_factor);if(cf!=null&&cf>1.015)why.push('Positive context adjustment ×'+cf.toFixed(3));
    const of=num(leg?.opponent_factor);if(of!=null&&of>1.015)why.push('Positive opposition adjustment ×'+of.toFixed(3));
    const rc=num(leg?.role_confidence);if(rc!=null&&rc>=.70)why.push('Stable role evidence '+Math.round(rc*100)+'%');
    if(m?.lineup_confirmed)why.push('Current lineup confirmed');

    if(!m?.lineup_confirmed)risk.push(m?.used_fallback_lineup?'Using previous-match lineup':'Final lineup not confirmed');
    if(c.injury)risk.push('Injury / availability uncertainty flagged');
    if(sample!=null&&sample<10)risk.push('Thin model sample');
    if(rc!=null&&rc<.5)risk.push('Role evidence is unstable');
    const os=num(leg?.opponent_samples);if(os!=null&&os<4)risk.push('Limited opposition-role sample');
    if(!risk.length)risk.push('No elevated structural risk in currently loaded inputs');
    if(!why.length)why.push('Model edge is driven by the current probability engine; supporting evidence is still loading');
    return {why:why.slice(0,4),risk:risk.slice(0,4),confidence:c};
  }

  function confidenceHtml(c,compact=false){
    const details=c.details.map(x=>'<div><span>'+escp(x.label)+'</span><b>'+escp(x.text)+'</b></div>').join('');
    return '<span class="confidence-pill '+confidenceClass(c.level)+'">'+c.level+' CONFIDENCE</span>'+
      (compact?'':'<details class="confidence-explainer"><summary>Why this confidence?</summary><div class="confidence-grid">'+details+'</div></details>');
  }

  function ensureMatchP0Nodes(){
    const summary=$p('#matchSummary');if(!summary)return {};
    let status=$p('#matchdayStatusStrip');
    if(!status){status=document.createElement('section');status.id='matchdayStatusStrip';status.className='matchday-status-strip';summary.insertAdjacentElement('afterend',status)}
    let band=$p('#matchdayDecisionBand');
    if(!band){band=document.createElement('section');band.id='matchdayDecisionBand';band.className='matchday-decision-band';status.insertAdjacentElement('afterend',band)}
    return {status,band};
  }

  function renderDecisionBand(){
    const {band}=ensureMatchP0Nodes();if(!band)return;
    const m=matchNow(),q=quoteNow(),c=matchConfidence();
    if(!m){
      band.innerHTML='<div class="matchday-decision-head"><div><div class="eyebrow">MATCHDAY COCKPIT</div><h2>Next match intelligence</h2><p>Fixture confirmation is required before decision metrics can be published.</p></div></div><div class="matchday-kpi"><span>Status</span><strong>STANDBY</strong><small>No active fixture</small></div>';
      return;
    }
    const hp=num(q?.home_win_probability),ap=num(q?.away_win_probability);
    const homeLeads=hp!=null&&ap!=null?hp>=ap:null;
    const winner=homeLeads===null?'Waiting':(homeLeads?m.home_team_name:m.away_team_name);
    const winp=homeLeads===null?null:(homeLeads?hp:ap);
    const score=q?Math.round(Number(q.predicted_home_score||0))+'–'+Math.round(Number(q.predicted_away_score||0)):'—';
    const line=num(q?.fair_home_line);
    const lineText=line==null?'—':m.home_team_name+' '+(line>=0?'+':'')+(Math.round(line*2)/2).toFixed(1);
    const qt=num(q?.quoted_total),ft=num(q?.fair_total),op=num(q?.over_probability),up=num(q?.under_probability);
    let totalText=ft==null?'—':'Fair '+(Math.round(ft*2)/2).toFixed(1),totalSub='Model fair total';
    if(qt!=null&&op!=null&&up!=null){const over=op>=up;totalText=(over?'Over ':'Under ')+(Math.round(qt*2)/2).toFixed(1);totalSub=pctp(over?op:up)+' at current line'}
    const lineup=m.lineup_confirmed?'FINAL / LATEST':m.used_fallback_lineup?'FALLBACK':'PENDING';
    const ts=firstTimestamp(state.finalLock)||firstTimestamp(q)||firstTimestamp(m);
    band.innerHTML='<div class="matchday-decision-head"><div><div class="eyebrow">MATCHDAY COCKPIT · DECISION LAYER</div><h2>'+escp(m.home_team_name)+' vs '+escp(m.away_team_name)+'</h2><p>Probability answers “how likely”; Confidence answers “how much evidence supports that estimate”.</p></div>'+confidenceHtml(c,true)+'</div>'+
      '<div class="matchday-decision-grid">'+
      '<div class="matchday-kpi primary"><span>Model lean</span><strong>'+escp(winner)+'</strong><small>'+pctp(winp)+' win probability</small></div>'+
      '<div class="matchday-kpi"><span>Projected</span><strong>'+escp(score)+'</strong><small>'+escp(m.home_team_name)+' – '+escp(m.away_team_name)+'</small></div>'+
      '<div class="matchday-kpi"><span>Fair line</span><strong>'+escp(lineText)+'</strong><small>Model fair handicap</small></div>'+
      '<div class="matchday-kpi"><span>Total lean</span><strong>'+escp(totalText)+'</strong><small>'+escp(totalSub)+'</small></div>'+
      '<div class="matchday-kpi"><span>Lineup</span><strong>'+escp(lineup)+'</strong><small>'+escp(m.lineup_confirmed?'Current team loaded':m.used_fallback_lineup?'Awaiting latest team':'Not confirmed')+'</small></div>'+
      '<div class="matchday-kpi"><span>Data</span><strong>'+escp(ts?ageText(ts):'Loaded')+'</strong><small>'+escp(state.finalLock?'Final lock '+ageText(state.finalLock.frozen_at):'Pregame model')+'</small></div>'+
      '</div><details class="confidence-explainer"><summary>Confidence evidence</summary><div class="confidence-grid">'+c.details.map(x=>'<div><span>'+escp(x[0])+'</span><b>'+escp(x[1])+'</b></div>').join('')+'</div></details>';
  }

  function renderStatusStrip(){
    const {status}=ensureMatchP0Nodes();if(!status)return;
    const m=matchNow();
    if(!m){status.innerHTML='<span class="matchday-status-chip neutral">Fixture pending</span><span class="matchday-status-chip neutral">Model standby</span>';return}
    const injuryCount=new Set((state.topLegs||[]).filter(x=>x.active_injury).map(x=>x.player_id)).size;
    const modelTs=firstTimestamp(state.finalLock)||firstTimestamp(state.matchQuote)||firstTimestamp(m);
    const chips=[];
    chips.push('<span class="matchday-status-chip '+(m.lineup_confirmed?'good':m.used_fallback_lineup?'warn':'warn')+'">'+(m.lineup_confirmed?'Lineup latest':m.used_fallback_lineup?'Lineup fallback':'Lineup pending')+'</span>');
    chips.push('<span class="matchday-status-chip '+(state.finalLock||m.prediction_is_final?'good':'neutral')+'">'+(state.finalLock?'Final recommendation locked':m.prediction_is_final?'T-30 final model':'Pregame model')+'</span>');
    chips.push('<span class="matchday-status-chip '+(injuryCount?'warn':'good')+'">'+(injuryCount?injuryCount+' top-edge injury flag'+(injuryCount>1?'s':''):'No top-edge injury flag')+'</span>');
    chips.push('<span class="matchday-status-chip '+(modelTs?'good':'neutral')+'">'+(modelTs?ageText(modelTs):'Model timestamp unavailable')+'</span>');
    chips.push('<span class="matchday-status-chip neutral">Weather feed not connected</span>');
    status.innerHTML=chips.join('');
  }

  function freshnessText(name,rows){
    const ms=moduleState(name),ts=newestTimestamp(rows);
    if(ms.cls==='bad')return {text:'ERROR',cls:'bad'};
    if(ts)return {text:ageText(ts),cls:ms.cls==='warn'?'warn':'good'};
    return {text:ms.text+(ms.cls==='good'?' · no timestamp':''),cls:ms.cls};
  }
  function renderFreshness(){
    const rail=$p('.match-dashboard-rail');if(!rail)return;
    let panel=$p('#p0FreshnessPanel');
    if(!panel){
      panel=document.createElement('section');panel.id='p0FreshnessPanel';panel.className='panel match-rail-panel p0-freshness-panel';
      const info=$p('.match-dashboard-rail .match-rail-panel:nth-of-type(2)');(info||rail.lastElementChild)?.insertAdjacentElement('afterend',panel);
    }
    const rows=[
      ['Lineup',freshnessText('lineup',state.lineup)],
      ['Player model',freshnessText('top',state.topLegs)],
      ['Match context',freshnessText('context',state.context)],
      ['Match quote',freshnessText('quote',state.matchQuote)],
      ['Final lock',state.finalLock?{text:ageText(state.finalLock.frozen_at),cls:'good'}:{text:'Not locked',cls:'neutral'}],
      ['Odds source',{text:'Manual / model quote',cls:'neutral'}],
      ['Weather',{text:'Not connected',cls:'warn'}]
    ];
    panel.innerHTML='<div class="section-head"><div><div class="eyebrow">DATA FRESHNESS</div><h2>模块新鲜度</h2></div><span class="badge neutral">'+P0+'</span></div><div class="p0-freshness-list">'+rows.map(([n,x])=>'<div class="p0-freshness-row"><span>'+escp(n)+'</span><strong class="'+escp(x.cls)+'">'+escp(x.text)+'</strong></div>').join('')+'</div>';
  }

  function enhanceTopEdges(){
    $$p('#topLegs .top-leg').forEach(node=>{
      if(node.dataset.p0Confidence)return;
      const id=node.querySelector('.add-leg')?.dataset.legId;
      const leg=(state.topLegs||state.legs||[]).find(x=>String(x.prediction_leg_id)===String(id));if(!leg)return;
      const wr=whyRisk(leg);
      node.dataset.p0Confidence='1';
      const box=document.createElement('details');box.className='p0-top-explain';
      box.innerHTML='<summary>'+confidenceHtml(wr.confidence,true)+' · WHY / RISK</summary><div class="p0-explain-body"><div class="p0-explain-col"><strong>WHY</strong>'+wr.why.map(x=>'<span>'+escp(x)+'</span>').join('')+'</div><div class="p0-explain-col risk"><strong>WHAT CAN BREAK IT</strong>'+wr.risk.map(x=>'<span>'+escp(x)+'</span>').join('')+'</div></div>';
      node.appendChild(box);
    });
  }

  function enhancePremiumCockpit(){
    const b=(()=>{
      const xs=(state.topLegs||state.legs||[]).filter(x=>num(x.model_probability||x.probability)>0);
      return [...xs].sort((a,b)=>num(b.model_probability||b.probability)-num(a.model_probability||a.probability))[0]||null;
    })();
    const best=$p('#cockpitBestEdge');if(best&&b){
      best.querySelector('.p0-confidence-inline')?.remove();
      const wr=whyRisk(b),el=document.createElement('div');el.className='p0-confidence-inline';
      el.innerHTML=confidenceHtml(wr.confidence,true)+'<span class="p0-explain-mini">'+escp(wr.why[0]||'')+'</span>';
      best.appendChild(el);
    }
  }

  function enhancePlayers(){
    $$p('#playerCards .player-market-option').forEach(row=>{
      if(row.dataset.p0Confidence)return;
      const pid=row.dataset.player,market=row.dataset.market;
      const opts=(state.legs||[]).filter(l=>String(l.player_id)===String(pid)&&String(l.market)===String(market));
      if(!opts.length)return;
      let leg;
      try{leg=typeof selectedPlayerLeg==='function'?selectedPlayerLeg(opts):[...opts].sort((a,b)=>num(b.model_probability)-num(a.model_probability))[0]}catch{leg=opts[0]}
      if(!leg)return;
      const wr=whyRisk(leg);row.dataset.p0Confidence='1';row.classList.add('p0-confidence-ready');
      const d=document.createElement('details');d.className='p0-market-explain';
      d.innerHTML='<summary>'+confidenceHtml(wr.confidence,true)+' · WHY / RISK</summary><div class="p0-explain-body"><div class="p0-explain-col"><strong>WHY</strong>'+wr.why.map(x=>'<span>'+escp(x)+'</span>').join('')+'</div><div class="p0-explain-col risk"><strong>WHAT CAN BREAK IT</strong>'+wr.risk.map(x=>'<span>'+escp(x)+'</span>').join('')+'</div></div>';
      row.appendChild(d);
    });
  }

  function reviewMarketLeg(legs,types){
    return (legs||[]).find(x=>types.includes(String(x.market||'').toLowerCase()))||null;
  }
  function resultWord(r){return r==='hit'?'HIT':r==='miss'?'MISS':r==='push'?'PUSH':r==='void'?'VOID':'PENDING'}
  function reviewOutcome(label,leg,fallback){
    if(!leg)return '<div class="p0-review-outcome"><span>'+escp(label)+'</span><strong>'+escp(fallback||'Not frozen')+'</strong><small>No sealed market leg</small></div>';
    return '<div class="p0-review-outcome"><span>'+escp(label)+'</span><strong>'+escp(leg.selection||labelMarket(leg.market))+'</strong><small>'+resultWord(leg.result)+' · Pregame '+pctp(leg.probability)+'</small></div>';
  }
  function missDiagnostic(leg){
    const av=num(leg.actual_value),th=num(leg.threshold),p=pctp(leg.probability);
    let note='Frozen selection did not settle as predicted.';
    if(av!=null&&th!=null&&leg.player_id)note='Actual '+av+' vs threshold '+th+' · pregame '+p+'.';
    else if(av!=null)note='Actual match value '+av+' · pregame '+p+'.';
    return '<div class="p0-miss-item"><div><strong>'+escp(leg.player_name||leg.selection||labelMarket(leg.market))+'</strong><span>'+escp(note)+'</span></div><b>'+escp(labelMarket(leg.market))+'</b></div>';
  }
  function enhanceReview(){
    const page=$p('#view-reviews');if(!page)return;page.classList.add('p0-review-ready');
    const summary=$p('#reviewSummary');if(!summary)return;
    summary.querySelector('.p0-review-hero')?.remove();
    const r=state.reviewRows?.find(x=>x.match_id===state.reviewSelected),d=state.reviewDetail,s=r?.summary||{};
    if(!r||!d)return;
    const legs=d.legs||[];
    const win=reviewMarketLeg(legs,['match_winner','moneyline','win']);
    const line=reviewMarketLeg(legs,['match_line','handicap','spread']);
    const total=reviewMarketLeg(legs,['match_total','total','total_points']);
    const misses=legs.filter(x=>x.result==='miss').sort((a,b)=>(num(b.probability)||0)-(num(a.probability)||0)).slice(0,5);
    const score=d.predicted_scores;
    const predicted=score&&score.predicted_home_score!=null?Math.round(Number(score.predicted_home_score))+'–'+Math.round(Number(score.predicted_away_score)):'Not frozen';
    const actual=s.home_score!=null&&s.away_score!=null?s.home_score+'–'+s.away_score:'Pending';
    const hero=document.createElement('div');hero.className='p0-review-hero';
    hero.innerHTML='<div class="section-head compact"><div><div class="eyebrow">DECISION → RESULT → LEARNING</div><h3>Matchday outcome</h3></div></div>'+
      '<div class="p0-review-flow">'+
      '<div class="p0-review-outcome"><span>Score</span><strong>'+escp(predicted)+' → '+escp(actual)+'</strong><small>Predicted → actual</small></div>'+
      reviewOutcome('Winner',win,'Not frozen')+reviewOutcome('Line',line,'Not frozen')+reviewOutcome('Total',total,'Not frozen')+
      '</div>'+
      (misses.length?'<div class="p0-review-diagnostic"><h3>WHY WE MISSED · evidence-first</h3><p>This section reports what failed in the sealed prediction. It does not invent a causal story when the post-match dataset cannot support one.</p><div class="p0-miss-list">'+misses.map(missDiagnostic).join('')+'</div></div>':'<div class="p0-review-diagnostic"><h3>No settled miss in the current sealed legs</h3><p>Pending and void legs are excluded from this statement.</p></div>');
    summary.appendChild(hero);
  }

  function renderAllP0(){
    renderStatusStrip();renderDecisionBand();renderFreshness();enhanceTopEdges();enhancePremiumCockpit();
    if(state.view==='players')enhancePlayers();
    if(state.view==='reviews')enhanceReview();
  }

  function wrap(name,after){
    try{
      const base=window[name];if(typeof base!=='function')return;
      window[name]=function(){const out=base.apply(this,arguments);try{after()}catch(e){console.warn(P0,name,e)}return out};
    }catch(e){console.warn(P0,'wrap '+name,e)}
  }

  wrap('renderMatch',()=>{renderStatusStrip();renderDecisionBand();renderFreshness();enhanceTopEdges();enhancePremiumCockpit()});
  wrap('renderMatchPrediction',()=>renderDecisionBand());
  wrap('renderPlayers',()=>enhancePlayers());
  wrap('renderReview',()=>enhanceReview());
  wrap('renderTactics',()=>{renderDecisionBand();enhancePremiumCockpit()});

  if(typeof window.renderPremiumCockpit==='function'){
    const premium=window.renderPremiumCockpit;
    window.renderPremiumCockpit=function(){const out=premium.apply(this,arguments);try{enhancePremiumCockpit()}catch(e){console.warn(P0,'premium',e)}return out};
  }

  document.addEventListener('click',e=>{
    const v=e.target.closest?.('[data-view]')?.dataset.view||e.target.closest?.('[data-mobile-view]')?.dataset.mobileView;
    if(v)setTimeout(()=>{if(v==='players')enhancePlayers();if(v==='reviews')enhanceReview();renderFreshness()},0);
  });
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)renderAllP0()});
  setInterval(()=>{if(!document.hidden&&state.view==='match'){renderStatusStrip();renderDecisionBand();renderFreshness()}},60000);

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(renderAllP0,0),{once:true});
  else setTimeout(renderAllP0,0);
})();
