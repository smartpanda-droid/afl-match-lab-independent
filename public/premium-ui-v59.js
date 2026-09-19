/* AFL Match Lab v59 — premium cockpit augmentation */
(function(){
  function safePct(v){const n=Number(v);return Number.isFinite(n)?Math.round(n*100)+'%':'—'}
  function fair(v){const n=Number(v);return Number.isFinite(n)&&n>0?n.toFixed(2):'—'}
  function h(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  function bestLeg(){
    const xs=(state.topLegs||state.legs||[]).filter(x=>Number(x.model_probability||x.probability)>0);
    return [...xs].sort((a,b)=>Number(b.model_probability||b.probability)-Number(a.model_probability||a.probability))[0]||null;
  }
  function riskLeg(){
    const xs=(state.topLegs||state.legs||[]).filter(x=>Number(x.model_probability||x.probability)>0);
    const risky=xs.find(x=>{const a=state.availability?.get?.(x.player_id);return a&&a.status&&a.status!=='normal'});
    return risky||[...xs].sort((a,b)=>Number(a.model_probability||a.probability)-Number(b.model_probability||b.probability))[0]||null;
  }
  function topScenario(){
    const sw=state.context?.scenario_weights||{};
    const e=Object.entries(sw).sort((a,b)=>Number(b[1])-Number(a[1]))[0];
    return e||null;
  }
  window.renderPremiumCockpit=function(){
    const best=document.getElementById('cockpitBestEdge'),risk=document.getElementById('cockpitRisk'),shape=document.getElementById('cockpitShape');
    if(!best||!risk||!shape)return;
    const b=bestLeg(),r=riskLeg(),sc=topScenario();
    if(b){
      const p=Number(b.model_probability||b.probability);
      best.innerHTML='<span class="hero-metric">'+safePct(p)+'</span><div class="kicker">Best Edge</div><h3>'+h(b.player_name||b.selection||'Top model edge')+'</h3><p>'+h((b.market||'').replaceAll('_',' '))+' '+h(b.threshold!=null?b.threshold+'+':'')+' · Fair '+fair(b.fair_odds||1/p)+'</p><div class="mini-meta"><span>Model probability</span><span>Tradable edge</span></div>';
    }else best.innerHTML='<div class="kicker">Best Edge</div><h3>Waiting for player model</h3><p>The strongest current market edge will appear here.</p>';
    if(r){
      const p=Number(r.model_probability||r.probability);
      const av=state.availability?.get?.(r.player_id);
      const reason=av&&av.status!=='normal'?(String(av.status).replaceAll('_',' ')+' · TOG '+(av.latest_tog??'—')+'%'):'Lower-confidence edge in the current shortlist';
      risk.innerHTML='<span class="hero-metric">'+safePct(p)+'</span><div class="kicker">Biggest Risk</div><h3>'+h(r.player_name||r.selection||'Model risk')+'</h3><p>'+h(reason)+'</p><div class="mini-meta"><span>Check role</span><span>Check final lineup</span></div>';
    }else risk.innerHTML='<div class="kicker">Biggest Risk</div><h3>No elevated risk flagged</h3><p>Availability and role risk will surface here.</p>';
    if(sc){
      const label=(typeof scenarioLabel==='function'?scenarioLabel(sc[0]):String(sc[0]).replaceAll('_',' '));
      shape.innerHTML='<span class="hero-metric">'+safePct(sc[1])+'</span><div class="kicker">Match Shape</div><h3>'+h(label)+'</h3><p>Highest-weight scenario from the current tactical context. Use it as a sensitivity guide, not as a standalone probability.</p><div class="mini-meta"><span>Scenario engine</span><span>Context layer</span></div>';
    }else shape.innerHTML='<div class="kicker">Match Shape</div><h3>Context building</h3><p>The highest-weight game scenario will appear after context loads.</p>';
  };
  if(typeof renderMatch==='function'){
    const base=renderMatch;
    renderMatch=function(){const out=base.apply(this,arguments);try{window.renderPremiumCockpit()}catch{}return out};
  }
  if(typeof renderTactics==='function'){
    const base=renderTactics;
    renderTactics=function(){const out=base.apply(this,arguments);try{window.renderPremiumCockpit()}catch{}return out};
  }
  document.addEventListener('DOMContentLoaded',()=>{setTimeout(()=>{try{window.renderPremiumCockpit()}catch{}},500)});
})();