/* P1.3 — System Multi Compare v79.2
   UI / decision-support only.
   Reuses loaded System Multi rows and evidence. No fetch/API/model mutation. */
(function(){
  'use strict';

  const q=(s,r)=> (r||document).querySelector(s);
  const qa=(s,r)=> [...(r||document).querySelectorAll(s)];
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:null};
  const pct=v=>{const n=num(v);return n==null?'—':Math.round(n*100)+'%'};
  const odds=v=>{const n=num(v);return n&&n>0?n.toFixed(2):'—'};
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const STRATEGIES=['conservative','balanced','aggressive'];
  const LABEL={conservative:'保守',balanced:'平衡',aggressive:'激进'};
  let compareLegCount=0;

  function availabilityFor(playerId){
    try{return state.availability?.get?.(playerId)||null}catch(e){return null}
  }

  function legRisk(leg){
    const av=availabilityFor(leg?.player_id);
    const latest=num(av?.latest_tog),base=num(av?.baseline_tog);
    const ratio=latest!=null&&base>0?latest/base:null;
    let score=0;
    const reasons=[];
    const injury=!!leg?.active_injury||!!av?.explicit_injury||(av?.status&&av.status!=='normal');
    if(injury){score+=1;reasons.push('injury')}
    if(leg?.bench){score+=.42;reasons.push('bench')}
    if(ratio!=null&&ratio<.88){score+=Math.min(.8,(.88-ratio)*4.5);reasons.push('TOG '+Math.round(latest)+' / '+Math.round(base)+'%')}
    const rc=num(leg?.role_confidence);
    if(rc!=null&&rc<.48){score+=.32;reasons.push('role confidence')}
    const rf=num(leg?.role_factor)??1;
    if(rf<.975){score+=.14;reasons.push('role ×'+rf.toFixed(3))}
    return {score,reasons,injury,ratio,latest,base};
  }

  function weakestLeg(m){
    const rows=(m?.legs||[]).map(leg=>{
      const p=num(leg.probability??leg.model_probability)??0;
      const recent=num(leg.recent_hit_rate);
      const sample=num(leg.sample_size);
      const rc=num(leg.role_confidence);
      const risk=legRisk(leg);
      let quality=.62*p;
      quality+=(recent==null?.5:recent)*.13;
      quality+=(sample==null?.55:Math.min(1,sample/18))*.09;
      quality+=(rc==null?.55:Math.max(0,Math.min(1,rc)))*.08;
      quality+=risk.ratio==null?.045:Math.min(1,risk.ratio)*.045;
      quality-=risk.score*.10;
      return {leg,risk,quality};
    }).sort((a,b)=>a.quality-b.quality);
    return rows[0]||null;
  }

  function correlation(m){
    const factor=num(m?.correlation_penalty)??1;
    const dev=Math.abs(1-factor);
    const legs=m?.legs||[];
    let samePlayer=0,sameTeam=0;
    for(let i=0;i<legs.length;i++)for(let j=i+1;j<legs.length;j++){
      if(legs[i].player_id&&legs[i].player_id===legs[j].player_id)samePlayer++;
      else if(legs[i].team_name&&legs[i].team_name===legs[j].team_name)sameTeam++;
    }
    const level=dev>=.08||samePlayer?'HIGH':dev>=.035||sameTeam>=2?'MED':'LOW';
    return {factor,level,cls:level==='HIGH'?'bad':level==='MED'?'warn':'good'};
  }

  function roleTog(m){
    let worst={score:0,label:'CLEAR',detail:'No elevated loaded flag',cls:'good'};
    for(const leg of (m?.legs||[])){
      if(!leg.player_id)continue;
      const r=legRisk(leg);
      if(r.score<=worst.score)continue;
      let label='WATCH',detail=r.reasons[0]||'role / TOG';
      if(r.injury||r.score>=.85)label='HIGH';
      worst={score:r.score,label,detail,cls:label==='HIGH'?'bad':'warn'};
    }
    return worst;
  }

  function marketName(market){
    try{return typeof marketLabel==='function'?marketLabel(market):String(market||'').replaceAll('_',' ')}
    catch(e){return String(market||'').replaceAll('_',' ')}
  }

  function marketMix(m){
    const counts=new Map();
    for(const leg of (m?.legs||[])){
      const k=marketName(leg.market);
      counts.set(k,(counts.get(k)||0)+1);
    }
    const rows=[...counts.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));
    const label=rows.slice(0,2).map(([k,n])=>n>1?k+' ×'+n:k).join(' · ')||'—';
    let primary='—';
    try{
      if(typeof multiMarketMixStats==='function'){
        const x=multiMarketMixStats(m);
        if(x)primary=(x.primary??0)+'/'+(m.leg_count??(m.legs||[]).length)+' primary';
      }
    }catch(e){}
    return {label,primary};
  }

  function currentRows(){
    let rows=[];
    try{
      const f=state.systemFilterActive;
      const key=f&&typeof systemFilterSignature==='function'?systemFilterSignature(f):null;
      const hasSim=!!(key&&state.systemSimulationMeta?.key===key);
      rows=hasSim?[...(state.systemSimulationRows||[])]:
        (typeof visibleMultiRows==='function'?[...visibleMultiRows()]:[...(state.multis||[])]);
      const ranked=rows.filter(m=>state.systemMultiRanking?.has?.(m.multi_id));
      if(ranked.length>=2){
        rows.sort((a,b)=>{
          const ra=state.systemMultiRanking.get(a.multi_id)?.value_aware_rank??999;
          const rb=state.systemMultiRanking.get(b.multi_id)?.value_aware_rank??999;
          return ra-rb||Number(b.combined_probability||0)-Number(a.combined_probability||0);
        });
      }
    }catch(e){
      rows=[...(state.multis||[])];
    }
    return rows;
  }

  function availableLegCounts(rows){
    return [...new Set(rows.map(x=>Number(x.leg_count)).filter(x=>x>=2&&x<=5))].sort((a,b)=>a-b);
  }

  function resolvedLegCount(rows){
    const counts=availableLegCounts(rows);
    if(!counts.length)return 0;
    let active=0;
    try{active=Number(state.systemFilterActive?.legCount||0)}catch(e){}
    if(active&&counts.includes(active)){compareLegCount=active;return active}
    if(compareLegCount&&counts.includes(compareLegCount))return compareLegCount;
    compareLegCount=counts[0];
    return compareLegCount;
  }

  function bestOfStrategy(rows,strategy,legCount){
    const candidates=rows.filter(m=>m.strategy===strategy&&Number(m.leg_count)===Number(legCount));
    if(!candidates.length)return null;
    return candidates.slice().sort((a,b)=>{
      const ar=state.systemMultiRanking?.get?.(a.multi_id)?.value_aware_rank??999;
      const br=state.systemMultiRanking?.get?.(b.multi_id)?.value_aware_rank??999;
      if(ar!==br)return ar-br;
      if(!!a.recommended!==!!b.recommended)return a.recommended?-1:1;
      const ai=Number(a.rank_in_group??999),bi=Number(b.rank_in_group??999);
      if(ai!==bi)return ai-bi;
      return Number(b.combined_probability||0)-Number(a.combined_probability||0);
    })[0];
  }

  function cardHtml(m,strategy){
    if(!m){
      return '<article class="p13-compare-card empty-card" data-strategy="'+esc(strategy)+'">'+
        '<div class="p13-strategy">'+esc(LABEL[strategy])+'</div>'+
        '<div class="p13-empty">当前腿数暂无可比较组合</div>'+
      '</article>';
    }
    const weak=weakestLeg(m),corr=correlation(m),rt=roleTog(m),mix=marketMix(m);
    const wl=weak?.leg;
    const weakName=wl?.selection||((wl?.player_name||'')+(wl?.threshold!=null?' '+wl.threshold+'+':''));
    const weakP=pct(wl?.probability??wl?.model_probability);
    const rec=m.recommended!==false;
    return '<article class="p13-compare-card '+esc(strategy)+'" data-p13-multi-id="'+esc(m.multi_id)+'">'+
      '<div class="p13-card-head">'+
        '<div><span class="p13-strategy">'+esc(LABEL[strategy])+'</span><strong>'+esc(m.leg_count)+' 串 1</strong></div>'+
        '<span class="p13-rec '+(rec?'good':'warn')+'">'+(rec?'RECOMMENDED':'WATCH')+'</span>'+
      '</div>'+
      '<div class="p13-primary-metrics">'+
        '<div><span>MODEL P</span><strong>'+pct(m.combined_probability)+'</strong></div>'+
        '<div><span>FAIR ODDS</span><strong>'+odds(m.fair_odds)+'</strong></div>'+
      '</div>'+
      '<div class="p13-compare-row weakest"><span>WEAKEST LEG</span><strong>'+esc(weakName||'—')+'</strong><small>'+esc(weakP)+'</small></div>'+
      '<div class="p13-risk-grid">'+
        '<div class="'+esc(corr.cls)+'"><span>CORR</span><strong>'+esc(corr.level)+'</strong><small>×'+corr.factor.toFixed(3)+'</small></div>'+
        '<div class="'+esc(rt.cls)+'"><span>ROLE / TOG</span><strong>'+esc(rt.label)+'</strong><small>'+esc(rt.detail)+'</small></div>'+
      '</div>'+
      '<div class="p13-compare-row mix"><span>MARKET MIX</span><strong>'+esc(mix.label)+'</strong><small>'+esc(mix.primary)+'</small></div>'+
      '<button type="button" class="p13-view-detail" data-p13-target="'+esc(m.multi_id)+'">查看详细组合</button>'+
    '</article>';
  }

  function ensurePanel(){
    const cards=q('#multiCards');
    if(!cards)return null;
    let panel=q('#p13MultiCompare');
    if(!panel){
      panel=document.createElement('section');
      panel.id='p13MultiCompare';
      panel.className='panel p13-multi-compare';
      cards.insertAdjacentElement('beforebegin',panel);
    }
    return panel;
  }

  function mapDetailedCards(rows){
    const cards=qa('#multiCards .multi-card');
    cards.forEach(c=>c.removeAttribute('data-p13-multi-id'));
    cards.forEach((card,i)=>{
      const m=rows[i];
      if(m?.multi_id)card.dataset.p13MultiId=String(m.multi_id);
    });
  }

  function render(){
    if(!q('#view-system-multi'))return;
    const panel=ensurePanel();
    if(!panel)return;
    const rows=currentRows();
    mapDetailedCards(rows);
    const counts=availableLegCounts(rows);
    if(!rows.length){
      panel.innerHTML='<div class="p13-empty-panel">等待 System Multi 数据</div>';
      return;
    }
    const legCount=resolvedLegCount(rows);
    panel.innerHTML=
      '<div class="p13-compare-head">'+
        '<div><div class="eyebrow">P1.3 · SAME LEG COUNT COMPARE</div><h3>策略横向比较</h3><p>同腿数比较保守 / 平衡 / 激进，避免不同组合长度造成错觉。</p></div>'+
        '<div class="p13-leg-tabs" aria-label="Compare leg count">'+
          counts.map(n=>'<button type="button" data-p13-leg="'+n+'" class="'+(n===legCount?'active':'')+'">'+n+' 腿</button>').join('')+
        '</div>'+
      '</div>'+
      '<div class="p13-compare-grid">'+
        STRATEGIES.map(s=>cardHtml(bestOfStrategy(rows,s,legCount),s)).join('')+
      '</div>';

    qa('[data-p13-leg]',panel).forEach(b=>b.addEventListener('click',()=>{
      compareLegCount=Number(b.dataset.p13Leg);
      render();
    }));
    qa('[data-p13-target]',panel).forEach(b=>b.addEventListener('click',()=>{
      const id=b.dataset.p13Target;
      const card=qa('#multiCards .multi-card').find(x=>String(x.dataset.p13MultiId||'')===String(id));
      if(card){
        card.classList.add('p13-focus-card');
        card.scrollIntoView({behavior:'smooth',block:'center'});
        window.setTimeout(()=>card.classList.remove('p13-focus-card'),1400);
      }
    }));
  }

  function wrap(name){
    const base=window[name];
    if(typeof base!=='function'||base.__p13Wrapped)return;
    function wrapped(){
      const out=base.apply(this,arguments);
      Promise.resolve(out).finally(()=>window.setTimeout(render,0));
      return out;
    }
    wrapped.__p13Wrapped=true;
    window[name]=wrapped;
  }

  function init(){
    wrap('renderMultis');
    render();
    window.setTimeout(render,120);
    document.addEventListener('click',e=>{
      if(e.target.closest?.('#systemFilterConfirm,#systemFilterReset,#systemFilterMobileToggle,[data-strategy],[data-leg-count]')){
        window.setTimeout(render,80);
      }
    });
    document.addEventListener('change',e=>{
      if(e.target.closest?.('#view-system-multi'))window.setTimeout(render,80);
    });
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
