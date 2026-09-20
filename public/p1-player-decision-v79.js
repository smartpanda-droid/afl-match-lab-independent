/* P1.2 — Player Market Decision Hierarchy v79.1
   Presentation / decision-support only.
   Reuses loaded state; no fetch/API/model mutation. */
(function(){
  'use strict';

  const q=(s,r)=> (r||document).querySelector(s);
  const qa=(s,r)=> [...(r||document).querySelectorAll(s)];
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:null};
  const clamp=v=>Math.max(0,Math.min(1,num(v)??0));
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function currentMatch(){
    try{return (state.matches||[]).find(x=>x.match_id===state.selected)||null}catch(e){return null}
  }
  function availability(playerId){
    try{return state.availability?.get?.(playerId)||null}catch(e){return null}
  }
  function marketValue(game,market){
    return market==='fantasy_points'?game?.fantasy_points:game?.[market];
  }
  function selectedLeg(row){
    const pid=row.dataset.player,market=row.dataset.market;
    const threshold=Number(q('.threshold-input',row)?.value);
    const legs=(state.legs||[]).filter(l=>String(l.player_id)===String(pid)&&l.market===market);
    if(!legs.length)return null;
    const exact=legs.find(l=>Number(l.threshold)===threshold);
    if(exact)return exact;
    return legs.slice().sort((a,b)=>Math.abs(Number(a.threshold)-threshold)-Math.abs(Number(b.threshold)-threshold))[0]||null;
  }
  function recentEvidence(leg){
    if(!leg)return {hits:0,total:0,text:'—'};
    const games=(state.recent5?.get?.(leg.player_id)||[]).slice(-5);
    const threshold=Number(leg.threshold);
    let hits=0,total=0;
    games.forEach(g=>{
      const v=marketValue(g,leg.market);
      if(v==null||!Number.isFinite(Number(v)))return;
      total++;
      if(Number(v)>=threshold)hits++;
    });
    return {hits,total,text:total?hits+'/'+total:'—'};
  }
  function riskInfo(leg){
    const av=availability(leg?.player_id);
    const latest=num(av?.latest_tog),base=num(av?.baseline_tog);
    const ratio=latest!=null&&base>0?latest/base:null;
    const reasons=[];
    let score=0;
    const injury=!!leg?.active_injury||!!av?.explicit_injury||(av?.status&&av.status!=='normal');
    if(injury){score+=1;reasons.push('INJURY')}
    if(leg?.bench){score+=.42;reasons.push('BENCH')}
    if(ratio!=null&&ratio<.88){score+=Math.min(.8,(.88-ratio)*4.5);reasons.push('TOG ↓')}
    const rc=num(leg?.role_confidence);
    if(rc!=null&&rc<.48){score+=.32;reasons.push('ROLE CONF ↓')}
    const sample=num(leg?.sample_size);
    if(sample!=null&&sample<8){score+=.18;reasons.push('THIN SAMPLE')}
    return {av,latest,base,ratio,score,reasons,injury};
  }
  function confidence(leg){
    if(!leg)return {score:0,label:'LOW',cls:'low'};
    const m=currentMatch(),risk=riskInfo(leg);
    const sample=Math.min(1,(num(leg.sample_size)??0)/18);
    const rc=num(leg.role_confidence);
    const role=rc==null?.5:clamp(rc);
    const recent=num(leg.recent_hit_rate);
    const p=num(leg.model_probability??leg.probability)??0;
    const lineup=m?.lineup_confirmed?1:m?.used_fallback_lineup?.55:.25;
    const stability=recent==null?.5:Math.max(0,1-Math.abs(recent-p)/.35);
    const score=clamp(sample*.28+role*.24+lineup*.18+(risk.injury?0:1)*.18+stability*.12);
    return score>=.76?{score,label:'HIGH',cls:'high'}:score>=.53?{score,label:'MED',cls:'med'}:{score,label:'LOW',cls:'low'};
  }
  function roleTog(leg){
    if(!leg)return {label:'—',cls:'neutral',detail:''};
    const risk=riskInfo(leg),rf=num(leg.role_factor)??1;
    if(risk.injury)return {label:'INJURY WATCH',cls:'bad',detail:risk.av?.injury_type||''};
    if(leg.bench)return {label:'BENCH',cls:'warn',detail:'role risk'};
    if(risk.ratio!=null&&risk.ratio<.88)return {label:'TOG ↓',cls:'bad',detail:Math.round(risk.latest)+' / '+Math.round(risk.base)+'%'};
    if(rf>=1.025)return {label:'ROLE ↑',cls:'good',detail:'×'+rf.toFixed(3)};
    if(rf<=.975)return {label:'ROLE ↓',cls:'warn',detail:'×'+rf.toFixed(3)};
    if(risk.ratio!=null)return {label:'TOG OK',cls:'good',detail:Math.round(risk.latest)+' / '+Math.round(risk.base)+'%'};
    return {label:'ROLE STABLE',cls:'neutral',detail:'×'+rf.toFixed(3)};
  }

  function stripHtml(leg){
    const recent=recentEvidence(leg),rt=roleTog(leg),conf=confidence(leg);
    const sample=num(leg?.sample_size);
    return '<div class="p12-decision-strip" aria-label="Player market decision summary">'+
      '<div class="p12-decision-cell recent"><span>RECENT 5</span><strong>'+esc(recent.text)+'</strong><small>'+(sample!=null?'n='+esc(sample):'loaded form')+'</small></div>'+
      '<div class="p12-decision-cell role '+esc(rt.cls)+'"><span>ROLE / TOG</span><strong>'+esc(rt.label)+'</strong><small>'+esc(rt.detail||'no elevated flag')+'</small></div>'+
      '<div class="p12-decision-cell confidence '+esc(conf.cls)+'"><span>CONFIDENCE</span><strong>'+esc(conf.label)+'</strong><small>'+Math.round(conf.score*100)+'% evidence</small></div>'+
    '</div>';
  }

  function enhanceRows(){
    qa('#playerCards .player-market-row').forEach(row=>{
      q('.p12-decision-strip',row)?.remove();
      const leg=selectedLeg(row);
      if(!leg)return;
      const recent=q('.recent-block',row);
      if(recent)recent.insertAdjacentHTML('afterend',stripHtml(leg));
      else q('.player-market-row-head',row)?.insertAdjacentHTML('afterend',stripHtml(leg));
      row.dataset.p12Confidence=confidence(leg).cls;
    });
  }

  function collapseSecondaryContext(){
    qa('#playerCards .player-context-details[open]').forEach(d=>d.removeAttribute('open'));
  }

  function enhancePlayers(){
    enhanceRows();
    collapseSecondaryContext();
  }

  function wrap(name){
    const base=window[name];
    if(typeof base!=='function'||base.__p12Wrapped)return;
    function wrapped(){
      const out=base.apply(this,arguments);
      Promise.resolve(out).finally(()=>window.setTimeout(enhancePlayers,0));
      return out;
    }
    wrapped.__p12Wrapped=true;
    window[name]=wrapped;
  }

  function init(){
    wrap('renderPlayers');
    wrap('quotePlayerThreshold');
    enhancePlayers();
    window.setTimeout(enhancePlayers,100);
    document.addEventListener('click',e=>{
      if(e.target.closest?.('#view-players .threshold-step,#view-players .add-leg,[data-p1d-player]')){
        window.setTimeout(enhancePlayers,0);
      }
    });
    document.addEventListener('change',e=>{
      if(e.target.matches?.('#view-players .threshold-input,#marketFilter'))window.setTimeout(enhancePlayers,0);
    });
    document.addEventListener('input',e=>{
      if(e.target.matches?.('#playerSearch'))window.setTimeout(enhancePlayers,0);
    });
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
