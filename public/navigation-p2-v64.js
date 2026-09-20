/* AFL Match Lab P2 v76 — Product Simplification.
   Four matchday primary routes + secondary More / Model Lab.
   Keeps existing views and switchView data logic intact. */
(function(){
  'use strict';
  const P2='P2 v76';
  const $p2=s=>document.querySelector(s), $$p2=s=>[...document.querySelectorAll(s)];
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  const icons={
    match:'<rect x="3.5" y="5" width="17" height="14" rx="4"/><path d="M12 5v14"/><path d="M3.5 12h17"/><circle cx="12" cy="12" r="2.3"/>',
    players:'<circle cx="9" cy="8" r="3"/><path d="M3.5 19c.4-3.2 2.4-5 5.5-5s5.1 1.8 5.5 5"/><circle cx="17" cy="9" r="2.3"/><path d="M15.5 14.5c2.8-.4 4.5 1 5 3.5"/>',
    system:'<path d="M5 6h14M5 12h14M5 18h14"/><circle cx="8" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="10" cy="18" r="2"/>',
    lab:'<path d="M9 3h6M10 3v5l-5.2 9a2.5 2.5 0 0 0 2.2 3.7h10a2.5 2.5 0 0 0 2.2-3.7L14 8V3"/><path d="M7.5 15h9"/>',
    more:'<path d="M6 12h.01M12 12h.01M18 12h.01"/>',
    review:'<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3L4.5 9"/><path d="M4.5 4.5V9H9"/><path d="M12 8v4.2l2.8 1.8"/>',
    field:'<rect x="3.5" y="5" width="17" height="14" rx="7"/><path d="M12 5v14M3.5 12h17"/><circle cx="12" cy="12" r="2.2"/>',
    tactics:'<circle cx="6" cy="6" r="2"/><circle cx="18" cy="18" r="2"/><path d="M8 6h4a4 4 0 0 1 4 4v1"/><path d="M16 13v1a4 4 0 0 1-4 4H8"/><path d="m10 15-3 3 3 3"/>',
    validation:'<path d="M12 3 19 6v5c0 4.8-2.8 8-7 10-4.2-2-7-5.2-7-10V6l7-3Z"/><path d="m9 12 2 2 4-4"/>',
    shadow:'<path d="M3 12s3.2-5.5 9-5.5S21 12 21 12s-3.2 5.5-9 5.5S3 12 3 12Z"/><circle cx="12" cy="12" r="2.5"/>'
  };
  const svg=name=>'<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'+(icons[name]||icons.more)+'</svg>';

  const primary=[
    {route:'match',view:'match',label:'MATCH',mobile:'MATCH',sub:'10-second cockpit',icon:'match'},
    {route:'players',view:'players',label:'PLAYERS',mobile:'PLAYERS',sub:'Ranked player markets',icon:'players'},
    {route:'system-multi',view:'system-multi',label:'SYSTEM MULTI',mobile:'SYSTEM',sub:'12 model combinations',icon:'system'},
    {route:'multi-lab',view:'multi-lab',label:'MULTI LAB',mobile:'MULTI LAB',sub:'Manual builder',icon:'lab'}
  ];
  const secondary=[
    {view:'reviews',label:'Match Review',sub:'Results, settlement & learning',icon:'review',group:'Review & learning'},
    {view:'field',label:'Field / Lineup',sub:'Positions, bench & roles',icon:'field',group:'Match research'},
    {view:'tactics',label:'Tactics / Scenario',sub:'Context, role & scenario lens',icon:'tactics',group:'Match research'},
    {view:'validation',label:'Validation',sub:'Calibration & release gates',icon:'validation',group:'Model Lab'},
    {view:'shadow-live',label:'Shadow Live',sub:'Pregame model observation',icon:'shadow',group:'Model Lab'}
  ];
  const flow=[
    {route:'match',n:'1',label:'Read Match',sub:'Call + risk'},
    {route:'players',n:'2',label:'Find Edges',sub:'Ranked markets'},
    {route:'system-multi',n:'3',label:'System Picks',sub:'12 combinations'},
    {route:'multi-lab',n:'4',label:'Build Multi',sub:'Manual final build'}
  ];

  function routeForView(view){
    const hit=primary.find(x=>x.view===view);
    return hit?.route||null;
  }
  function currentView(){return state?.view||'match'}
  function isSecondary(view){return secondary.some(x=>x.view===view)}

  function buildPrimaryNav(){
    let nav=$p2('#p2PrimaryNav');if(nav)return nav;
    nav=document.createElement('nav');nav.id='p2PrimaryNav';nav.className='p2-primary-nav';nav.setAttribute('aria-label','Matchday primary navigation');
    nav.innerHTML=primary.map(x=>'<button type="button" class="p2-nav-button" data-p2-route="'+x.route+'" data-p2-view="'+x.view+'" aria-label="'+x.label+'"><span class="p2-nav-icon">'+svg(x.icon)+'</span><span class="p2-nav-copy"><strong class="p2-desktop-label">'+x.label+'</strong><strong class="p2-mobile-label">'+x.mobile+'</strong><small>'+x.sub+'</small></span>'+(x.route==='multi-lab'?'<span id="p2BuilderBadge" class="p2-nav-badge">0</span>':'')+'</button>').join('')+
      '<div class="p2-nav-secondary"><button type="button" class="p2-nav-more" id="p2SideMore">'+svg('more')+'<span><strong>MORE / MODEL LAB</strong><small>Review · lineup · tactics · model ops</small></span></button></div>'+
      '<div class="p2-nav-footer">Matchday first.<br>Deep tools second.<small>AFL Match Lab · v0.76</small></div>';
    document.body.appendChild(nav);
    nav.querySelectorAll('.p2-nav-button[data-p2-route]').forEach(b=>b.addEventListener('click',()=>handlePrimary(b.dataset.p2Route)));
    nav.querySelector('#p2SideMore')?.addEventListener('click',toggleDrawer);
    return nav;
  }

  function buildHeaderMore(){
    let b=$p2('#p2HeaderMore');if(b)return b;
    const actions=$p2('.top-actions');if(!actions)return null;
    b=document.createElement('button');b.id='p2HeaderMore';b.type='button';b.className='p2-header-more';b.setAttribute('aria-label','Open More and Model Lab');b.setAttribute('aria-expanded','false');
    b.innerHTML='<span class="p2-header-more-icon">'+svg('more')+'</span><span class="p2-header-more-copy"><strong>MORE</strong><small>Model Lab</small></span>';
    actions.appendChild(b);b.addEventListener('click',toggleDrawer);return b;
  }

  function drawerGroups(){
    return ['Review & learning','Match research','Model Lab'].map(group=>{
      const items=secondary.filter(x=>x.group===group);
      return '<div class="p2-drawer-section" data-p2-group="'+esc(group)+'"><div class="p2-drawer-label">'+esc(group)+'</div><div class="p2-drawer-grid '+(items.length===1?'single':'')+'">'+items.map(x=>'<button type="button" class="p2-drawer-item" data-p2-view="'+x.view+'"><span class="p2-mini-icon">'+svg(x.icon)+'</span><strong>'+esc(x.label)+'</strong><small>'+esc(x.sub)+'</small></button>').join('')+'</div></div>';
    }).join('');
  }
  function buildMoreDrawer(){
    let d=$p2('#p2MoreDrawer');if(d)return d;
    d=document.createElement('aside');d.id='p2MoreDrawer';d.className='p2-more-drawer';d.setAttribute('aria-label','More and Model Lab');
    d.innerHTML='<div class="p2-drawer-head"><div><div class="eyebrow">MORE / MODEL LAB</div><h3>More / Model Lab</h3><p>Review, lineup, tactics and model operations.</p></div><button type="button" class="p2-drawer-close" aria-label="Close">×</button></div>'+
      drawerGroups()+
      '<div class="p2-drawer-section"><div class="p2-drawer-label">System status</div><div class="p2-system-status"><div class="p2-status-line"><strong>Data connection</strong><span id="p2SystemPill" class="p2-status-pill">Checking…</span></div><p id="p2SystemDetail">Module health follows the existing site health monitor.</p><button type="button" id="p2SystemRefresh" class="p2-system-refresh">Refresh match data</button></div></div>';
    document.body.appendChild(d);
    d.querySelector('.p2-drawer-close')?.addEventListener('click',closeDrawer);
    d.querySelectorAll('[data-p2-view]').forEach(b=>b.addEventListener('click',()=>{navigateView(b.dataset.p2View);closeDrawer()}));
    d.querySelector('#p2SystemRefresh')?.addEventListener('click',()=>{document.querySelector('#refreshBtn')?.click();closeDrawer()});
    return d;
  }

  function setMoreState(open){
    $p2('#p2HeaderMore')?.setAttribute('aria-expanded',open?'true':'false');
    $p2('#p2HeaderMore')?.classList.toggle('active',open||isSecondary(currentView()));
    $p2('#p2SideMore')?.classList.toggle('active',open||isSecondary(currentView()));
  }
  function openDrawer(){
    const d=buildMoreDrawer();d.classList.add('open');document.body.classList.add('p2-more-open');
    setMoreState(true);syncDrawerItems();syncSystemStatus();
  }
  function closeDrawer(){
    const d=$p2('#p2MoreDrawer');d?.classList.remove('open');document.body.classList.remove('p2-more-open');
    setMoreState(false);syncActive();
  }
  function toggleDrawer(){const d=buildMoreDrawer();d.classList.contains('open')?closeDrawer():openDrawer()}

  function handlePrimary(route){
    closeDrawer();
    const item=primary.find(x=>x.route===route);
    if(item)navigateView(item.view);
  }
  function navigateView(view){if(typeof window.switchView==='function')window.switchView(view)}

  function syncActive(){
    const active=routeForView(currentView());
    $$p2('.p2-nav-button[data-p2-route]').forEach(b=>b.classList.toggle('active',b.dataset.p2Route===active));
    setMoreState($p2('#p2MoreDrawer')?.classList.contains('open'));
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
    const label=source?.textContent?.trim()||'Unknown';
    pill.textContent=label;pill.className='p2-status-pill '+(source?.classList.contains('good')?'good':source?.classList.contains('warn')?'warn':'');
    if(detail)detail.textContent=source?.title||'Module health follows the existing site health monitor.';
  }

  function flowHtml(active){
    return flow.map(x=>'<button type="button" class="p2-flow-step '+(x.route===active?'active':'')+'" data-p2-flow="'+x.route+'"><span class="p2-flow-index">'+x.n+'</span><span class="p2-flow-copy"><strong>'+x.label+'</strong><small>'+x.sub+'</small></span></button>').join('');
  }
  function insertFlow(view,anchor,where='beforebegin'){
    const id='p2Flow-'+view;if($p2('#'+id)||!anchor)return;
    const route=routeForView(view),el=document.createElement('section');el.id=id;el.className='p2-decision-flow';el.setAttribute('aria-label','Matchday decision flow');el.innerHTML=flowHtml(route);
    anchor.insertAdjacentElement(where,el);
    el.querySelectorAll('[data-p2-flow]').forEach(b=>b.addEventListener('click',()=>handlePrimary(b.dataset.p2Flow)));
  }
  function ensureFlows(){
    const mobile=window.matchMedia&&window.matchMedia('(max-width: 900px)').matches;
    if(mobile){$p2('.p2-decision-flow').forEach(x=>x.remove());return}
    const band=$p2('#matchdayDecisionBand');if(band)insertFlow('match',band,'afterend');
    const players=$p2('#view-players > .panel');if(players)insertFlow('players',players,'beforebegin');
    const sys=$p2('#view-system-multi > .system-multi-workspace');if(sys)insertFlow('system-multi',sys,'beforebegin');
    const lab=$p2('#view-multi-lab > .grid');if(lab)insertFlow('multi-lab',lab,'beforebegin');
  }
  function syncFlows(){
    const active=routeForView(currentView());
    $$p2('.p2-decision-flow .p2-flow-step').forEach(b=>b.classList.toggle('active',b.dataset.p2Flow===active));
  }

  function secondaryCopy(view){
    return ({
      reviews:['MORE · REVIEW & LEARNING','Match Review','Settled results, frozen predictions and post-match learning.'],
      field:['MORE · MATCH RESEARCH','Field / Lineup','Positions, bench status and roles behind the player-market read.'],
      tactics:['MORE · MATCH RESEARCH','Tactics / Scenario','Deeper match context, role-opposition lens and scenario sensitivity.'],
      validation:['MODEL LAB · VALIDATION','Validation','Calibration, market release gates and production QA.'],
      'shadow-live':['MODEL LAB · SHADOW','Shadow Live','Observe the real pregame chain without changing Production.']
    })[view]||['MORE','Secondary workspace','Deep research and model operations'];
  }
  function ensureSecondaryContext(view){
    const host=$p2('#view-'+view);if(!host)return;
    let c=host.querySelector('.p2-secondary-context');if(c)return;
    const x=secondaryCopy(view);c=document.createElement('section');c.className='p2-secondary-context';
    c.innerHTML='<div class="p2-secondary-copy"><small>'+esc(x[0])+'</small><span><strong>'+esc(x[1])+'</strong> · '+esc(x[2])+'</span></div><div class="p2-secondary-actions"><button type="button" class="p2-secondary-more">More / Model Lab</button><button type="button" class="p2-secondary-back">← Match</button></div>';
    host.prepend(c);
    c.querySelector('.p2-secondary-more')?.addEventListener('click',openDrawer);
    c.querySelector('.p2-secondary-back')?.addEventListener('click',()=>navigateView('match'));
  }
  function ensureSecondaryContexts(){secondary.forEach(x=>ensureSecondaryContext(x.view))}

  function refreshScaffold(){
    ensureFlows();ensureSecondaryContexts();syncActive();syncSystemStatus();
  }
  function wrapFunction(name,after){
    const base=window[name];if(typeof base!=='function')return;
    window[name]=function(){const out=base.apply(this,arguments);try{after.apply(this,arguments)}catch(e){console.warn(P2,name,e)}return out};
  }

  function init(){
    if(document.body.classList.contains('p2-nav-ready'))return;
    document.body.classList.add('p2-nav-ready');
    buildPrimaryNav();buildHeaderMore();buildMoreDrawer();refreshScaffold();

    wrapFunction('switchView',()=>setTimeout(refreshScaffold,0));
    wrapFunction('renderMatch',()=>setTimeout(()=>{ensureFlows();syncActive()},0));
    wrapFunction('renderBuilder',()=>setTimeout(()=>{syncBuilderBadge();ensureFlows()},0));
    wrapFunction('renderMultis',()=>setTimeout(()=>ensureFlows(),0));
    wrapFunction('renderReview',()=>setTimeout(()=>{ensureSecondaryContext('reviews');syncActive()},0));

    const health=$p2('#healthBadge');
    if(health)new MutationObserver(syncSystemStatus).observe(health,{childList:true,attributes:true,subtree:true,attributeFilter:['class','title']});

    document.addEventListener('click',e=>{
      const d=$p2('#p2MoreDrawer'),head=$p2('#p2HeaderMore'),side=$p2('#p2SideMore');
      if(d?.classList.contains('open')&&!d.contains(e.target)&&!head?.contains(e.target)&&!side?.contains(e.target))closeDrawer();
    });
    document.addEventListener('keydown',e=>{if(e.key==='Escape')closeDrawer()});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
