/* AFL Match Lab P1 Decision Speed v75
   UI / decision-support only. Reuses data already loaded by app.js.
   Does not mutate production probabilities or make network requests. */
(function(){
  'use strict';
  const VERSION='P1 DECISION SPEED v75';
  const $d=s=>document.querySelector(s), $$d=s=>[...document.querySelectorAll(s)];
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:null};
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pct=v=>{const n=num(v);return n==null?'—':Math.round(n*100)+'%'};
  const odds=v=>{const n=num(v);return n&&n>0?n.toFixed(2):'—'};
  const clamp=v=>Math.max(0,Math.min(1,num(v)??0));
  let playerMode='edge';

  const MODES=[
    ['edge','Best Edges','综合概率 / 近期 / 样本 / 风险'],
    ['confidence','Confidence','证据最完整'],
    ['value','Value Watch','Fair odds shortlist · 需实际赔率验证 EV'],
    ['role','Role Change','角色变化最明显'],
    ['risk','Injury / TOG','伤病、Bench 与 TOG 风险']
  ];

  function currentMatch(){return state.matches?.find(x=>x.match_id===state.selected)||null}
  function availabilityFor(playerId){return state.availability?.get?.(playerId)||null}
  function roleLabel(l){
    const f=num(l?.role_factor)??1;
    if(f>=1.025)return 'ROLE ↑';
    if(f<=.975)return 'ROLE ↓';
    return 'ROLE ↔';
  }
  function togInfo(playerId){
    const av=availabilityFor(playerId),latest=num(av?.latest_tog),base=num(av?.baseline_tog);
    const ratio=latest!=null&&base>0?latest/base:null;
    return {av,latest,base,ratio};
  }
  function legRisk(l){
    const t=togInfo(l?.player_id),roleConf=num(l?.role_confidence),sample=num(l?.sample_size),reasons=[];
    let score=0;
    const injury=!!l?.active_injury||!!t.av?.explicit_injury||(t.av?.status&&t.av.status!=='normal');
    if(injury){score+=1;reasons.push('injury / availability flag')}
    if(l?.bench){score+=.42;reasons.push('bench / interchange')}
    if(t.ratio!=null&&t.ratio<.88){score+=Math.min(.8,(.88-t.ratio)*4.5);reasons.push('TOG '+Math.round(t.latest)+'% vs '+Math.round(t.base)+'% baseline')}
    if(roleConf!=null&&roleConf<.48){score+=.32;reasons.push('low role confidence')}
    if(sample!=null&&sample<8){score+=.18;reasons.push('thin sample n='+sample)}
    return {score,reasons,tog:t,injury};
  }
  function legConfidenceScore(l){
    const m=currentMatch(),risk=legRisk(l),sample=Math.min(1,(num(l?.sample_size)??0)/18),rc=num(l?.role_confidence);
    const role=rc==null?.5:clamp(rc),recent=num(l?.recent_hit_rate),p=num(l?.model_probability??l?.probability)??0;
    const lineup=m?.lineup_confirmed?1:m?.used_fallback_lineup?.55:.25;
    const stability=recent==null?.5:Math.max(0,1-Math.abs(recent-p)/.35);
    return clamp(sample*.28+role*.24+lineup*.18+(risk.injury?0:1)*.18+stability*.12);
  }
  function edgeScore(l){
    const p=num(l?.model_probability??l?.probability)??0,recent=num(l?.recent_hit_rate)??p,sample=Math.min(1,(num(l?.sample_size)??0)/18);
    const rc=num(l?.role_confidence)??.5,rf=num(l?.role_factor)??1,risk=legRisk(l);
    const roleLift=Math.max(-.08,Math.min(.08,rf-1));
    return .50*p+.21*recent+.11*sample+.10*clamp(rc)+roleLift-risk.score*.12;
  }
  function valueWatchScore(l){
    const p=num(l?.model_probability??l?.probability)??0,recent=num(l?.recent_hit_rate)??p,fair=num(l?.fair_odds);
    if(!(fair>=1.20&&fair<=2.40))return -1;
    const priceRoom=clamp((fair-1.20)/1.20),sample=Math.min(1,(num(l?.sample_size)??0)/18);
    return .45*p+.22*recent+.18*priceRoom+.15*sample-legRisk(l).score*.10;
  }
  function roleScore(l){
    const rf=num(l?.role_factor)??1,rc=num(l?.role_confidence)??0,rs=Math.min(1,(num(l?.role_samples)??0)/10);
    return Math.abs(rf-1)*5.5+rc*.25+rs*.15;
  }
  function legModeScore(l,mode){
    if(mode==='confidence')return legConfidenceScore(l);
    if(mode==='value')return valueWatchScore(l);
    if(mode==='role')return roleScore(l);
    if(mode==='risk')return legRisk(l).score;
    return edgeScore(l);
  }
  function filteredLegs(){
    const search=($d('#playerSearch')?.value||'').trim().toLowerCase(),market=$d('#marketFilter')?.value||'';
    return (state.legs||[]).filter(l=>(!search||String(l.player_name||'').toLowerCase().includes(search))&&(!market||l.market===market));
  }
  function rankedPlayers(mode=playerMode){
    const groups=new Map();
    for(const l of filteredLegs()){
      const key=String(l.player_id??l.player_name??'');if(!key)continue;
      if(!groups.has(key))groups.set(key,[]);
      groups.get(key).push(l);
    }
    const rows=[];
    for(const [key,legs] of groups){
      let best=null,bestScore=-Infinity;
      for(const l of legs){
        const s=legModeScore(l,mode);
        if(s>bestScore){bestScore=s;best=l}
      }
      if(!best)continue;
      if(mode==='risk'&&bestScore<=.05)continue;
      if(mode==='role'&&Math.abs((num(best.role_factor)??1)-1)<.008)continue;
      if(mode==='value'&&bestScore<0)continue;
      rows.push({key,playerId:best.player_id,name:best.player_name||'Player',team:best.team_name||'',leg:best,score:bestScore,risk:legRisk(best),confidence:legConfidenceScore(best)});
    }
    return rows.sort((a,b)=>b.score-a.score);
  }
  function playerMeta(row,mode){
    const l=row.leg,t=row.risk.tog;
    if(mode==='confidence')return 'Evidence '+Math.round(row.confidence*100)+'% · n='+(l.sample_size??'—');
    if(mode==='value')return 'Fair '+odds(l.fair_odds)+' · '+pct(l.model_probability)+' P · check bookmaker price';
    if(mode==='role')return roleLabel(l)+' ×'+(num(l.role_factor)??1).toFixed(3)+' · conf '+pct(l.role_confidence);
    if(mode==='risk')return row.risk.reasons[0]||'No elevated loaded risk';
    return pct(l.model_probability)+' P · Recent '+pct(l.recent_hit_rate)+' · n='+(l.sample_size??'—');
  }
  function playerTag(row,mode){
    const l=row.leg;
    if(mode==='risk')return row.risk.score>=1?'HIGH RISK':row.risk.score>=.45?'WATCH':'LOW';
    if(mode==='role')return roleLabel(l);
    if(mode==='confidence')return row.confidence>=.76?'HIGH CONF':row.confidence>=.53?'MED CONF':'LOW CONF';
    if(mode==='value')return 'FAIR '+odds(l.fair_odds);
    return 'EDGE '+pct(l.model_probability);
  }
  function focusPlayer(name){
    const input=$d('#playerSearch');if(!input)return;
    input.value=name;
    try{renderPlayers()}catch{}
    input.focus();
    $d('#playerCards')?.scrollIntoView({behavior:'smooth',block:'start'});
  }
  function ensurePlayerScanner(){
    const toolbar=$d('#view-players .player-market-toolbar');if(!toolbar)return null;
    let panel=$d('#p1DecisionSpeedScanner');
    if(!panel){
      panel=document.createElement('section');
      panel.id='p1DecisionSpeedScanner';panel.className='panel p1d-player-scanner';
      toolbar.insertAdjacentElement('afterend',panel);
    }
    return panel;
  }
  function addPlayerRiskChips(){
    $$d('#playerCards .player-card').forEach(card=>{
      card.querySelector('.p1d-player-risk-chips')?.remove();
      const name=card.querySelector('.player-card-name h3')?.textContent?.trim();if(!name)return;
      const legs=(state.legs||[]).filter(l=>String(l.player_name||'').trim()===name);if(!legs.length)return;
      const best=[...legs].sort((a,b)=>edgeScore(b)-edgeScore(a))[0],r=legRisk(best),chips=[];
      const rf=num(best.role_factor);
      if(rf!=null&&Math.abs(rf-1)>=.012)chips.push('<span class="'+(rf>1?'up':'down')+'">'+roleLabel(best)+' ×'+rf.toFixed(3)+'</span>');
      if(best.bench)chips.push('<span class="warn">BENCH</span>');
      if(r.injury)chips.push('<span class="bad">INJURY WATCH</span>');
      if(r.tog.ratio!=null)chips.push('<span class="'+(r.tog.ratio<.88?'bad':r.tog.ratio<.95?'warn':'neutral')+'">TOG '+Math.round(r.tog.latest)+' / '+Math.round(r.tog.base)+'%</span>');
      if(!chips.length)return;
      const div=document.createElement('div');div.className='p1d-player-risk-chips';div.innerHTML=chips.join('');
      const head=card.querySelector('.player-card-head');head?.insertAdjacentElement('afterend',div);
    });
  }
  function renderPlayerScanner(){
    const panel=ensurePlayerScanner();if(!panel)return;
    const rows=rankedPlayers(playerMode),top=rows.slice(0,5),mode=MODES.find(x=>x[0]===playerMode)||MODES[0];
    panel.innerHTML='<div class="p1d-scanner-head"><div><div class="eyebrow">DECISION SPEED · PLAYER SCANNER</div><h2>快速排行榜</h2><p>'+esc(mode[2])+'</p></div><span class="badge neutral">'+VERSION+'</span></div>'+
      '<div class="p1d-mode-tabs">'+MODES.map(([k,label])=>'<button type="button" data-p1d-mode="'+k+'" class="'+(k===playerMode?'active':'')+'">'+esc(label)+'</button>').join('')+'</div>'+
      (top.length?'<div class="p1d-ranking-grid">'+top.map((r,i)=>'<button type="button" class="p1d-rank-card" data-p1d-player="'+esc(r.name)+'"><span class="p1d-rank-no">#'+(i+1)+'</span><div><small>'+esc(r.team)+' · '+esc(typeof marketLabel==='function'?marketLabel(r.leg.market):r.leg.market)+'</small><strong>'+esc(r.name)+'</strong><b>'+esc(r.leg.selection||((r.leg.threshold??'')+'+'))+'</b><em>'+esc(playerMeta(r,playerMode))+'</em></div><span class="p1d-rank-tag">'+esc(playerTag(r,playerMode))+'</span></button>').join('')+'</div>':
      '<div class="p1d-scanner-empty">'+(playerMode==='risk'?'当前已加载证据中没有明显 Injury / TOG 风险球员。':'当前筛选下没有足够证据生成排行榜。')+'</div>')+
      (playerMode==='value'?'<div class="p1d-value-note">Value Watch 只按模型概率、Fair Odds、近期表现和样本筛选候选；真正 EV 必须输入博彩公司实际赔率后判断。</div>':'');
    panel.querySelectorAll('[data-p1d-mode]').forEach(b=>b.addEventListener('click',()=>{playerMode=b.dataset.p1dMode;renderPlayerScanner();reorderPlayerCards()}));
    panel.querySelectorAll('[data-p1d-player]').forEach(b=>b.addEventListener('click',()=>focusPlayer(b.dataset.p1dPlayer)));
  }
  function reorderPlayerCards(){
    const host=$d('#playerCards');if(!host)return;
    const ranked=rankedPlayers(playerMode),order=new Map(ranked.map((x,i)=>[String(x.name).trim(),i]));
    const cards=$$d('#playerCards .player-card');
    cards.forEach(c=>{c.classList.remove('p1d-top-player');c.removeAttribute('data-p1d-rank')});
    cards.sort((a,b)=>{
      const an=a.querySelector('.player-card-name h3')?.textContent?.trim()||'',bn=b.querySelector('.player-card-name h3')?.textContent?.trim()||'';
      return (order.get(an)??9999)-(order.get(bn)??9999);
    }).forEach((c,i)=>{if(i<5){c.classList.add('p1d-top-player');c.dataset.p1dRank=String(i+1)}host.appendChild(c)});
  }
  function enhancePlayers(){
    renderPlayerScanner();addPlayerRiskChips();reorderPlayerCards();
  }

  function currentMultiRows(){
    let rows=[];
    try{
      const f=state.systemFilterActive;
      const key=f&&typeof systemFilterSignature==='function'?systemFilterSignature(f):null;
      const hasSim=!!(key&&state.systemSimulationMeta?.key===key);
      rows=hasSim?[...(state.systemSimulationRows||[])]:typeof visibleMultiRows==='function'?[...visibleMultiRows()]:[...(state.multis||[])];
      const ranked=rows.filter(m=>state.systemMultiRanking?.has?.(m.multi_id));
      if(ranked.length>=2)rows.sort((a,b)=>{
        const ra=state.systemMultiRanking.get(a.multi_id)?.value_aware_rank??999,rb=state.systemMultiRanking.get(b.multi_id)?.value_aware_rank??999;
        return ra-rb||Number(b.combined_probability)-Number(a.combined_probability);
      });
    }catch{rows=[...(state.multis||[])]}
    return rows;
  }
  function multiWeakestLeg(m){
    const rows=(m.legs||[]).map(l=>{
      const p=num(l.probability??l.model_probability)??0,recent=num(l.recent_hit_rate),sample=num(l.sample_size),rc=num(l.role_confidence),risk=legRisk(l);
      let q=.62*p;
      q+=(recent==null?.5:recent)*.13;
      q+=(sample==null?.55:Math.min(1,sample/18))*.09;
      q+=(rc==null?.55:clamp(rc))*.08;
      q+=risk.tog.ratio==null?.045:Math.min(1,risk.tog.ratio)*.045;
      q-=risk.score*.10;
      return {leg:l,quality:q,risk};
    }).sort((a,b)=>a.quality-b.quality);
    return rows[0]||null;
  }
  function correlationIntel(m){
    const factor=num(m.correlation_penalty)??1,dev=Math.abs(1-factor);
    const legs=m.legs||[];let sameTeam=0,samePlayer=0;
    for(let i=0;i<legs.length;i++)for(let j=i+1;j<legs.length;j++){
      if(legs[i].player_id&&legs[i].player_id===legs[j].player_id)samePlayer++;
      else if(legs[i].team_name&&legs[i].team_name===legs[j].team_name)sameTeam++;
    }
    const level=dev>=.08||samePlayer?'HIGH':dev>=.035||sameTeam>=2?'MEDIUM':'LOW';
    const note=samePlayer?samePlayer+' same-player dependency':sameTeam>=2?sameTeam+' same-team links':dev>=.035?'dependency adjustment is material':'dependency is limited in current structure';
    return {factor,level,note};
  }
  function whyMulti(m){
    const reasons=[];
    let st=null,mix=null;
    try{st=typeof multiStructureStats==='function'?multiStructureStats(m):null}catch{}
    try{mix=typeof multiMarketMixStats==='function'?multiMarketMixStats(m):null}catch{}
    if(st?.valid)reasons.push(st.anchors+' anchor + '+st.values+' value legs satisfy structure');
    else if(st)reasons.push(st.anchors+' anchor + '+st.values+' value legs');
    if(mix?.majority)reasons.push(mix.primary+'/'+m.leg_count+' legs use primary markets');
    const c=correlationIntel(m);if(c.level==='LOW')reasons.push('Low aggregate dependency risk');
    const uniquePlayers=new Set((m.legs||[]).filter(x=>x.player_id).map(x=>x.player_id)).size;
    if(uniquePlayers>=Math.max(2,(m.leg_count||0)-1))reasons.push('Player exposure is diversified');
    if(m.monte_carlo_search)reasons.push('Survived local Monte Carlo shortlist');
    if(!reasons.length)reasons.push('Selected by current probability / structure / odds-range ranking');
    return reasons.slice(0,2);
  }
  function roleTogRisk(m){
    const risks=[],hasAvailability=(state.availability?.size||0)>0;
    for(const l of (m.legs||[])){
      if(!l.player_id)continue;
      const r=legRisk(l),rf=num(l.role_factor)??1;
      if(r.injury)risks.push((l.player_name||'Player')+': injury / availability');
      else if(r.tog.ratio!=null&&r.tog.ratio<.88)risks.push((l.player_name||'Player')+': TOG '+Math.round(r.tog.latest)+' vs '+Math.round(r.tog.base)+'%');
      else if(l.bench)risks.push((l.player_name||'Player')+': bench role');
      else if((num(l.role_confidence)??1)<.48)risks.push((l.player_name||'Player')+': role confidence '+pct(l.role_confidence));
      else if(rf<.975)risks.push((l.player_name||'Player')+': role pressure ×'+rf.toFixed(3));
    }
    return {risks:[...new Set(risks)].slice(0,2),hasAvailability};
  }
  function weakestReason(w){
    if(!w)return 'No leg evidence';
    if(w.risk.reasons.length)return w.risk.reasons[0];
    const l=w.leg,p=num(l.probability??l.model_probability),recent=num(l.recent_hit_rate);
    if(p!=null&&p<.58)return 'lowest probability in this combo';
    if(recent!=null&&p!=null&&recent+0.08<p)return 'recent hit rate trails model probability';
    if((num(l.sample_size)??99)<9)return 'smaller evidence sample';
    return 'lowest composite leg quality';
  }
  function enhanceSystemMultis(){
    const cards=$$d('#multiCards .multi-card'),rows=currentMultiRows();
    cards.forEach((card,i)=>{
      card.querySelector('.p1d-multi-intel')?.remove();
      const m=rows[i];if(!m)return;
      const weak=multiWeakestLeg(m),corr=correlationIntel(m),why=whyMulti(m),rt=roleTogRisk(m);
      const weakLeg=weak?.leg;
      const section=document.createElement('section');section.className='p1d-multi-intel';
      section.innerHTML='<div class="p1d-intel-grid">'+
        '<div class="p1d-intel-cell why"><span>WHY THIS COMBO</span><strong>'+esc(why[0]||'Current structure fit')+'</strong><small>'+esc(why[1]||'Probability and fair-odds fit')+'</small></div>'+
        '<div class="p1d-intel-cell weakest"><span>WEAKEST LEG</span><strong>'+esc(weakLeg?.selection||'—')+'</strong><small>'+(weakLeg?pct(weakLeg.probability??weakLeg.model_probability)+' · ':'')+esc(weakestReason(weak))+'</small></div>'+
        '<div class="p1d-intel-cell corr '+corr.level.toLowerCase()+'"><span>CORRELATION RISK</span><strong>'+esc(corr.level)+' · ×'+corr.factor.toFixed(3)+'</strong><small>'+esc(corr.note)+'</small></div>'+
      '</div>'+
      '<div class="p1d-role-tog '+(rt.risks.length?'warn':'good')+'"><b>ROLE / TOG</b><span>'+esc(rt.risks.length?rt.risks.join(' · '):(rt.hasAvailability?'No elevated role / TOG flag in loaded evidence':'No elevated role / bench / injury flag · TOG availability not preloaded'))+'</span></div>';
      card.querySelector('.multi-metrics')?.insertAdjacentElement('afterend',section);
    });
  }

  function wrap(name,after){
    const base=window[name];if(typeof base!=='function')return;
    window[name]=function(){
      const out=base.apply(this,arguments);
      try{after()}catch(e){console.warn(VERSION,name,e)}
      return out;
    };
  }
  wrap('renderPlayers',enhancePlayers);
  wrap('renderMultis',enhanceSystemMultis);

  document.addEventListener('input',e=>{
    if(e.target?.matches?.('#playerSearch'))setTimeout(()=>{renderPlayerScanner();reorderPlayerCards()},0);
  });
  document.addEventListener('change',e=>{
    if(e.target?.matches?.('#marketFilter'))setTimeout(()=>{renderPlayerScanner();reorderPlayerCards()},0);
  });
  document.addEventListener('click',e=>{
    const v=e.target.closest?.('[data-view]')?.dataset.view||e.target.closest?.('[data-mobile-view]')?.dataset.mobileView||e.target.closest?.('[data-go]')?.dataset.go;
    if(v==='players')setTimeout(enhancePlayers,0);
    if(v==='system-multi')setTimeout(enhanceSystemMultis,0);
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden)return;if(state.view==='players')enhancePlayers();if(state.view==='system-multi')enhanceSystemMultis()});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(()=>{if(state.view==='players')enhancePlayers();if(state.view==='system-multi')enhanceSystemMultis()},0),{once:true});
})();
