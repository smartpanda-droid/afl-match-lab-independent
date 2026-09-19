/* AFL Match Lab P2 v64 — primary IA and matchday navigation shell.
   Keeps the existing views and switchView data logic intact. */
(function(){
  'use strict';
  const P2='P2 v64';
  const $p2=s=>document.querySelector(s), $$p2=s=>[...document.querySelectorAll(s)];
  const icons={
    match:'<path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/>',
    players:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    multi:'<path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/>',
    review:'<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/>',
    more:'<circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none"/>',
    field:'<rect x="3" y="4" width="18" height="16" rx="8"/><path d="M12 4v16M3 12h18"/><circle cx="12" cy="12" r="2.5"/>',
    tactics:'<circle cx="6" cy="6" r="2"/><circle cx="18" cy="18" r="2"/><path d="M8 6h4a4 4 0 0 1 4 4 4 4 0 0 1-4 4H8"/><path d="m10 11-3 3 3 3"/>',
    validation:'<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>',
    shadow:'<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>'
  };
  const svg=name=>'<svg viewBox="0 0 24 24" aria-hidden="true">'+(icons[name]||icons.more)+'</svg>';
  const primary=[
    {route:'match',label:'MATCH',sub:'Matchday Cockpit',icon:'match'},
    {route:'players',label:'PLAYERS',sub:'Player markets',icon:'players'},
    {route:'multi',label:'MULTI',sub:'System + builder',icon:'multi'},
    {route:'reviews',label:'REVIEW',sub:'Results & learning',icon:'review'},
    {route:'more',label:'MORE',sub:'Research & system',icon:'more'}
  ];
  const secondary=[
    {view:'field',label:'Field / Lineup',sub:'Positions & roles',icon:'field',group:'Match research'},
    {view:'tactics',label:'Tactics / Scenario',sub:'Match context & P1',icon:'tactics',group:'Match research'},
    {view:'validation',label:'Validation',sub:'Calibration & release',icon:'validation',group:'Model operations'},
    {view:'shadow-live',label:'Shadow Live',sub:'Pregame observation',icon:'shadow',group:'Model operations'}
  ];
  const flow=[
    {route:'match',n:'1',label:'Read Match',sub:'Cockpit & risks'},
    {route:'players',n:'2',label:'Find Edges',sub:'Probability + confidence'},
    {route:'multi',n:'3',label:'Build Multi',sub:'Dependency-aware'},
    {route:'reviews',n:'4',label:'Review',sub:'Result → learning'}
  ];
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function routeForView(view){
    if(view==='match')return 'match';
    if(view==='players')return 'players';
    if(view==='system-multi'||view==='multi-lab')return 'multi';
    if(view==='reviews')return 'reviews';
    if(['field','tactics','validation','shadow-live'].includes(view))return 'more';
    return 'match';
  }
  function currentView(){return state?.view||'match'}

  function buildPrimaryNav(){
    let nav=$p2('#p2PrimaryNav');if(nav)return nav;
    nav=document.createElement('nav');nav.id='p2PrimaryNav';nav.className='p2-primary-nav';nav.setAttribute('aria-label','Matchday primary navigation');
    nav.innerHTML=primary.map(x=>'<button type="button" class="p2-nav-button" data-p2-route="'+x.route+'" aria-label="'+x.label+'"><span class="p2-nav-icon">'+svg(x.icon)+'</span><span class="p2-nav-copy"><strong>'+x.label+'</strong><small>'+x.sub+'</small></span>'+(x.route==='multi'?'<span id="p2BuilderBadge" class="p2-nav-badge">0</span>':'')+'</button>').join('')+
      '<div class="p2-nav-footer">Matchday intelligence.<br>Decision first.<small>AFL Match Lab · v0.64</small></div>';
    document.body.appendChild(nav);
    nav.querySelectorAll('[data-p2-route]').forEach(b=>b.addEventListener('click',()=>handlePrimary(b.dataset.p2Route)));
    return nav;
  }

  function drawerGroups(){
    return ['Match research','Model operations'].map(group=>{
      const items=secondary.filter(x=>x.group===group);
      return '<div class="p2-drawer-section"><div class="p2-drawer-label">'+group+'</div><div class="p2-drawer-grid">'+items.map(x=>'<button type="button" class="p2-drawer-item" data-p2-view="'+x.view+'"><span class="p2-mini-icon">'+svg(x.icon)+'</span><strong>'+x.label+'</strong><small>'+x.sub+'</small></button>').join('')+'</div></div>';
    }).join('');
  }
  function buildMoreDrawer(){
    let d=$p2('#p2MoreDrawer');if(d)return d;
    d=document.createElement('aside');d.id='p2MoreDrawer';d.className='p2-more-drawer';d.setAttribute('aria-label','More research and system tools');
    d.innerHTML='<div class="p2-drawer-head"><div><div class="eyebrow">MORE</div><h3>Research & system tools</h3><p>Deep research and model operations stay available without competing with matchday decisions.</p></div><button type="button" class="p2-drawer-close" aria-label="Close">×</button></div>'+
      drawerGroups()+
      '<div class="p2-drawer-section"><div class="p2-drawer-label">System status</div><div class="p2-system-status"><div class="p2-status-line"><strong>Data connection</strong><span id="p2SystemPill" class="p2-status-pill">Checking…</span></div><p id="p2SystemDetail">Module health follows the existing site health monitor.</p><button type="button" id="p2SystemRefresh" class="p2-system-refresh">Refresh match data</button></div></div>';
    document.body.appendChild(d);
    d.querySelector('.p2-drawer-close')?.addEventListener('click',()=>closeDrawer());
    d.querySelectorAll('[data-p2-view]').forEach(b=>b.addEventListener('click',()=>{navigateView(b.dataset.p2View);closeDrawer()}));
    d.querySelector('#p2SystemRefresh')?.addEventListener('click',()=>{document.querySelector('#refreshBtn')?.click();closeDrawer()});
    return d;
  }

  function openDrawer(){
    const d=buildMoreDrawer();d.classList.add('open');syncActive();
    const btn=$p2('[data-p2-route="more"]');btn?.setAttribute('aria-expanded','true');
    syncDrawerItems();syncSystemStatus();
  }
  function closeDrawer(){
    const d=$p2('#p2MoreDrawer');d?.classList.remove('open');
    $p2('[data-p2-route="more"]')?.setAttribute('aria-expanded','false');
    syncActive();
  }
  function toggleDrawer(){const d=buildMoreDrawer();d.classList.contains('open')?closeDrawer():openDrawer()}

  function handlePrimary(route){
    if(route==='more'){toggleDrawer();return}
    closeDrawer();
    if(route==='multi'){
      const v=currentView();
      navigateView(v==='multi-lab'?'multi-lab':'system-multi');return;
    }
    navigateView(route);
  }
  function navigateView(view){
    if(typeof window.switchView==='function')window.switchView(view);
  }

  function syncActive(){
    const drawerOpen=$p2('#p2MoreDrawer')?.classList.contains('open');
    const active=drawerOpen?'more':routeForView(currentView());
    $$p2('.p2-nav-button[data-p2-route]').forEach(b=>b.classList.toggle('active',b.dataset.p2Route===active));
    syncDrawerItems();syncBuilderBadge();syncFlows();
    document.body.dataset.p2View=currentView();
  }
  function syncDrawerItems(){
    $$p2('#p2MoreDrawer [data-p2-view]').forEach(b=>b.classList.toggle('active',b.dataset.p2View===currentView()));
  }
  function syncBuilderBadge(){
    const b=$p2('#p2BuilderBadge');if(!b)return;
    const n=Array.isArray(state?.builder)?state.builder.length:0;b.textContent=String(n);b.classList.toggle('has-items',n>0);
  }
  function syncSystemStatus(){
    const source=$p2('#healthBadge'),pill=$p2('#p2SystemPill'),detail=$p2('#p2SystemDetail');if(!pill)return;
    const text=source?.textContent?.trim()||'Unknown';
    pill.textContent=text;pill.className='p2-status-pill '+(source?.classList.contains('good')?'good':source?.classList.contains('warn')?'warn':'');
    if(detail)detail.textContent=source?.title||'Module health follows the existing site health monitor.';
  }

  function flowHtml(active){
    return flow.map(x=>'<button type="button" class="p2-flow-step '+(x.route===active?'active':'')+'" data-p2-flow="'+x.route+'"><span class="p2-flow-index">'+x.n+'</span><span class="p2-flow-copy"><strong>'+x.label+'</strong><small>'+x.sub+'</small></span></button>').join('');
  }
  function insertFlow(view,anchor,where='beforebegin'){
    const id='p2Flow-'+view;if($p2('#'+id))return;
    if(!anchor)return;
    const route=routeForView(view),el=document.createElement('section');el.id=id;el.className='p2-decision-flow';el.setAttribute('aria-label','Matchday decision flow');el.innerHTML=flowHtml(route);
    anchor.insertAdjacentElement(where,el);
    el.querySelectorAll('[data-p2-flow]').forEach(b=>b.addEventListener('click',()=>handlePrimary(b.dataset.p2Flow)));
  }
  function ensureFlows(){
    const band=$p2('#matchdayDecisionBand');
    if(band)insertFlow('match',band,'afterend');
    const players=$p2('#view-players > .panel');if(players)insertFlow('players',players,'beforebegin');
    const sys=$p2('#view-system-multi > .system-multi-layout');if(sys)insertFlow('system-multi',sys,'beforebegin');
    const lab=$p2('#view-multi-lab > .grid');if(lab)insertFlow('multi-lab',lab,'beforebegin');
    const review=$p2('#view-reviews > .panel');if(review)insertFlow('reviews',review,'beforebegin');
  }
  function syncFlows(){
    const active=routeForView(currentView());
    $$p2('.p2-decision-flow .p2-flow-step').forEach(b=>b.classList.toggle('active',b.dataset.p2Flow===active));
  }

  function multiSwitcherHtml(active){
    return '<div class="p2-multi-switcher-copy"><strong>MULTI WORKSPACE</strong><span>System recommendations and manual construction share one decision workspace.</span></div><div class="p2-multi-modes"><button type="button" class="p2-multi-mode '+(active==='system-multi'?'active':'')+'" data-p2-multi-view="system-multi">System Picks</button><button type="button" class="p2-multi-mode '+(active==='multi-lab'?'active':'')+'" data-p2-multi-view="multi-lab">Multi Lab</button></div>';
  }
  function ensureMultiSwitchers(){
    [['system-multi','#view-system-multi'],['multi-lab','#view-multi-lab']].forEach(([view,sel])=>{
      const host=$p2(sel);if(!host)return;
      let sw=host.querySelector('.p2-multi-switcher');
      if(!sw){sw=document.createElement('section');sw.className='p2-multi-switcher';host.prepend(sw)}
      sw.innerHTML=multiSwitcherHtml(view);
      sw.querySelectorAll('[data-p2-multi-view]').forEach(b=>b.addEventListener('click',()=>navigateView(b.dataset.p2MultiView)));
    });
  }

  function secondaryCopy(view){
    return ({
      field:['MORE · MATCH RESEARCH','Field / Lineup','Use positions and named roles to support the player-market read.'],
      tactics:['MORE · MATCH RESEARCH','Tactics / Scenario','Deep context, role-opposition lens and scenario sensitivity.'],
      validation:['MORE · MODEL OPERATIONS','Validation','Calibration, market release gates and model QA.'],
      'shadow-live':['MORE · MODEL OPERATIONS','Shadow Live','Observe the real pregame chain without changing production decisions.']
    })[view]||['MORE','Research tool','Secondary workspace'];
  }
  function ensureSecondaryContext(view){
    const host=$p2('#view-'+view);if(!host)return;
    let c=host.querySelector('.p2-secondary-context');if(c)return;
    const x=secondaryCopy(view);c=document.createElement('section');c.className='p2-secondary-context';
    c.innerHTML='<span><strong>'+esc(x[1])+'</strong> · '+esc(x[2])+'</span><button type="button" class="p2-secondary-back">← Back to Match</button>';
    host.prepend(c);c.querySelector('.p2-secondary-back')?.addEventListener('click',()=>navigateView('match'));
  }
  function ensureSecondaryContexts(){secondary.forEach(x=>ensureSecondaryContext(x.view))}

  function refreshScaffold(){
    ensureFlows();ensureMultiSwitchers();ensureSecondaryContexts();syncActive();syncSystemStatus();
  }

  function wrapFunction(name,after){
    const base=window[name];if(typeof base!=='function')return;
    window[name]=function(){const out=base.apply(this,arguments);try{after.apply(this,arguments)}catch(e){console.warn(P2,name,e)}return out};
  }

  function init(){
    if(document.body.classList.contains('p2-nav-ready'))return;
    document.body.classList.add('p2-nav-ready');
    buildPrimaryNav();buildMoreDrawer();refreshScaffold();

    wrapFunction('switchView',()=>setTimeout(refreshScaffold,0));
    wrapFunction('renderMatch',()=>setTimeout(()=>{ensureFlows();syncActive()},0));
    wrapFunction('renderBuilder',()=>setTimeout(()=>{syncBuilderBadge();ensureMultiSwitchers()},0));
    wrapFunction('renderMultis',()=>setTimeout(()=>ensureMultiSwitchers(),0));
    wrapFunction('renderReview',()=>setTimeout(()=>{ensureFlows();syncActive()},0));

    const health=$p2('#healthBadge');
    if(health)new MutationObserver(syncSystemStatus).observe(health,{childList:true,attributes:true,subtree:true,attributeFilter:['class','title']});

    document.addEventListener('click',e=>{
      const d=$p2('#p2MoreDrawer'),more=$p2('[data-p2-route="more"]');
      if(d?.classList.contains('open')&&!d.contains(e.target)&&!more?.contains(e.target))closeDrawer();
    });
    document.addEventListener('keydown',e=>{if(e.key==='Escape')closeDrawer()});
    window.addEventListener('resize',()=>{if(window.innerWidth>900&&$p2('#p2MoreDrawer')?.classList.contains('open'))syncSystemStatus()});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();