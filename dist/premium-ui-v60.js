/* AFL Match Lab v61 — approved visual system and responsive navigation. */
(function(){
  const icons={
    logo:'<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="3" y="24" width="7" height="12" rx="1.5" fill="currentColor"/><rect x="15" y="15" width="7" height="21" rx="1.5" fill="currentColor"/><rect x="27" y="5" width="7" height="31" rx="1.5" fill="currentColor"/></svg>',
    home:'<path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/>',
    users:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    layers:'<path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/>',
    flask:'<path d="M9 3h6"/><path d="M10 9V3h4v6l5 8.5A2.3 2.3 0 0 1 17 21H7a2.3 2.3 0 0 1-2-3.5L10 9Z"/><path d="M7.5 15h9"/>',
    history:'<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/>',
    shield:'<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>',
    settings:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21h-4v-.09A1.7 1.7 0 0 0 9 19.36a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.62 15 1.7 1.7 0 0 0 3.07 14H3v-4h.09A1.7 1.7 0 0 0 4.64 9a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.62 1.7 1.7 0 0 0 10 3.07V3h4v.09A1.7 1.7 0 0 0 15 4.64a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.38 9 1.7 1.7 0 0 0 20.93 10H21v4h-.09A1.7 1.7 0 0 0 19.4 15Z"/>',
    field:'<rect x="3" y="4" width="18" height="16" rx="8"/><path d="M12 4v16M3 12h18"/><circle cx="12" cy="12" r="2.5"/>',
    tactics:'<circle cx="6" cy="6" r="2"/><circle cx="18" cy="18" r="2"/><path d="M8 6h4a4 4 0 0 1 4 4v0a4 4 0 0 1-4 4H8"/><path d="m10 11-3 3 3 3"/>',
    eye:'<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    more:'<circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none"/>',
    menu:'<path d="M4 7h16M4 12h16M4 17h16"/>',
    refresh:'<path d="M20 6v5h-5"/><path d="M4 18v-5h5"/><path d="M18.5 9A7 7 0 0 0 6 6.5L4 11M5.5 15A7 7 0 0 0 18 17.5l2-4.5"/>'
  };
  const nav={
    match:{label:'Match',mobile:'Matchday',sub:'Matchday Cockpit',icon:'home'},
    players:{label:'Player Markets',mobile:'Players',sub:'Find player edges',icon:'users'},
    'system-multi':{label:'System Multi',mobile:'Multi',sub:'Pre-built multis',icon:'layers'},
    'multi-lab':{label:'Multi Lab',sub:'Build & optimise',icon:'flask'},
    reviews:{label:'Review',sub:'Results & analytics',icon:'history'},
    validation:{label:'Validation',sub:'Model tracking',icon:'shield'},
    field:{label:'Field',sub:'Lineup & roles',icon:'field'},
    tactics:{label:'Tactics',sub:'Scenario analysis',icon:'tactics'},
    'shadow-live':{label:'Shadow Live',sub:'Live observation',icon:'eye'}
  };
  function svg(name,cls=''){
    const p=icons[name]||icons.more;
    if(p.startsWith('<svg'))return p;
    return '<svg class="'+cls+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+p+'</svg>';
  }
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
    return Object.entries(sw).sort((a,b)=>Number(b[1])-Number(a[1]))[0]||null;
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
      const p=Number(r.model_probability||r.probability),av=state.availability?.get?.(r.player_id);
      const reason=av&&av.status!=='normal'?(String(av.status).replaceAll('_',' ')+' · TOG '+(av.latest_tog??'—')+'%'):'Lower-confidence edge in the current shortlist';
      risk.innerHTML='<span class="hero-metric">'+safePct(p)+'</span><div class="kicker">Biggest Risk</div><h3>'+h(r.player_name||r.selection||'Model risk')+'</h3><p>'+h(reason)+'</p><div class="mini-meta"><span>Check role</span><span>Check final lineup</span></div>';
    }else risk.innerHTML='<div class="kicker">Biggest Risk</div><h3>No elevated risk flagged</h3><p>Availability and role risk will surface here.</p>';
    if(sc){
      const label=(typeof scenarioLabel==='function'?scenarioLabel(sc[0]):String(sc[0]).replaceAll('_',' '));
      shape.innerHTML='<span class="hero-metric">'+safePct(sc[1])+'</span><div class="kicker">Match Shape</div><h3>'+h(label)+'</h3><p>Highest-weight scenario from the current tactical context. Use it as a sensitivity guide, not as a standalone probability.</p><div class="mini-meta"><span>Scenario engine</span><span>Context layer</span></div>';
    }else shape.innerHTML='<div class="kicker">Match Shape</div><h3>Context building</h3><p>The highest-weight game scenario will appear after context loads.</p>';
  };

  function enhanceNavigation(){
    const tabs=document.querySelector('.tabs');
    const review=tabs?.querySelector('[data-view="reviews"]'),validation=tabs?.querySelector('[data-view="validation"]');
    if(review&&validation)tabs.insertBefore(review,validation);
    tabs?.querySelectorAll('.tab[data-view]').forEach(tab=>{
      const cfg=nav[tab.dataset.view];if(!cfg)return;
      const count=tab.querySelector('.count-pill')?.textContent||'0';
      tab.setAttribute('aria-label',cfg.label);
      tab.innerHTML='<span class="nav-icon">'+svg(cfg.icon)+'</span><span class="nav-copy"><strong><span class="desktop-label">'+cfg.label+'</span><span class="mobile-label">'+(cfg.mobile||cfg.label)+'</span></strong><small>'+cfg.sub+'</small></span>';
      if(tab.dataset.view==='multi-lab')tab.insertAdjacentHTML('beforeend','<span id="builderCount" class="count-pill">'+h(count)+'</span>');
    });
    const more=document.getElementById('mobileMoreTrigger');
    if(more)more.innerHTML='<span class="nav-icon">'+svg('more')+'</span><span>More</span>';
    document.querySelectorAll('#mobileMoreSheet [data-mobile-view]').forEach(btn=>{
      const cfg=nav[btn.dataset.mobileView];if(!cfg||btn.querySelector('.sheet-icon'))return;
      btn.insertAdjacentHTML('afterbegin','<span class="sheet-icon">'+svg(cfg.icon)+'</span>');
    });
  }
  function enhanceHeader(){
    const mark=document.querySelector('.brand-mark');if(mark)mark.innerHTML=icons.logo;
    const top=document.querySelector('.topbar'),picker=document.querySelector('main>.match-picker'),actions=document.querySelector('.top-actions');
    if(top&&picker&&actions){picker.classList.add('topbar-match-picker');top.insertBefore(picker,actions)}
    if(top&&!top.querySelector('.mobile-header-menu')){
      const menu=document.createElement('button');menu.className='mobile-header-menu';menu.type='button';menu.setAttribute('aria-label','Open more navigation');menu.innerHTML=svg('menu');
      actions?.appendChild(menu);
      menu.addEventListener('click',()=>document.getElementById('mobileMoreSheet')?.classList.toggle('open'));
    }
    const refresh=document.getElementById('refreshBtn');
    if(refresh)refresh.innerHTML=svg('refresh')+'<span> Refresh</span>';
  }
  function enhanceSidebar(){
    if(document.querySelector('.sidebar-footer'))return;
    const el=document.createElement('div');el.className='sidebar-footer';el.innerHTML='Better information.<br>Better decisions.<small>AFL Match Lab<br>v1.0.0</small>';document.body.appendChild(el);
  }
  function setMobileView(view){
    const btn=[...document.querySelectorAll('.tab[data-view]')].find(x=>x.dataset.view===view);
    if(btn){btn.click();document.getElementById('mobileMoreSheet')?.classList.remove('open')}
  }
  function bindMenus(){
    const more=document.getElementById('mobileMoreTrigger'),sheet=document.getElementById('mobileMoreSheet');
    more?.addEventListener('click',e=>{e.preventDefault();sheet?.classList.toggle('open')});
    sheet?.querySelectorAll('[data-mobile-view]').forEach(b=>b.addEventListener('click',()=>setMobileView(b.dataset.mobileView)));
    document.querySelectorAll('.tab[data-view]').forEach(b=>b.addEventListener('click',()=>sheet?.classList.remove('open')));
    document.addEventListener('click',e=>{if(sheet?.classList.contains('open')&&!sheet.contains(e.target)&&!more?.contains(e.target)&&!e.target.closest?.('.mobile-header-menu'))sheet.classList.remove('open')});
    document.addEventListener('keydown',e=>{if(e.key==='Escape')sheet?.classList.remove('open')});
  }
  function init(){
    if(document.body.dataset.premiumV60)return;document.body.dataset.premiumV60='ready';
    enhanceHeader();enhanceNavigation();enhanceSidebar();bindMenus();
    try{window.renderPremiumCockpit()}catch{}
  }
  if(typeof renderMatch==='function'){
    const base=renderMatch;renderMatch=function(){const out=base.apply(this,arguments);try{window.renderPremiumCockpit()}catch{}return out};
  }
  if(typeof renderTactics==='function'){
    const base=renderTactics;renderTactics=function(){const out=base.apply(this,arguments);try{window.renderPremiumCockpit()}catch{}return out};
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
