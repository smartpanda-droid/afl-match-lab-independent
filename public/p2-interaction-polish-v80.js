/* P2 — Cross-platform Interaction Polish v80
   Tablet layout support, accessibility/keyboard and interaction polish.
   No data fetch / model mutation. */
(function(){
  'use strict';

  const q=(s,r)=> (r||document).querySelector(s);
  const qa=(s,r)=> [...(r||document).querySelectorAll(s)];
  const ROUTES={1:'match',2:'players',3:'system-multi',4:'multi-lab'};
  const LABELS={
    match:'Match',
    players:'Player Markets',
    'system-multi':'System Multi',
    'multi-lab':'Multi Lab',
    reviews:'Match Review',
    field:'Field / Lineup',
    tactics:'Tactics / Scenario',
    validation:'Validation',
    'shadow-live':'Shadow Live'
  };

  function ensureA11yShell(){
    const main=q('main');
    if(main&&!main.id)main.id='mainContent';
    if(main&&!main.hasAttribute('tabindex'))main.setAttribute('tabindex','-1');

    let skip=q('#p2SkipLink');
    if(!skip){
      skip=document.createElement('a');
      skip.id='p2SkipLink';
      skip.className='p2-skip-link';
      skip.href='#mainContent';
      skip.textContent='Skip to matchday content';
      document.body.prepend(skip);
    }

    let live=q('#p2RouteLive');
    if(!live){
      live=document.createElement('div');
      live.id='p2RouteLive';
      live.className='p2-sr-only';
      live.setAttribute('aria-live','polite');
      live.setAttribute('aria-atomic','true');
      document.body.appendChild(live);
    }
  }

  function viewName(){
    try{return state.view||'match'}catch(e){return 'match'}
  }

  function syncAria(){
    const current=viewName();
    qa('#p2PrimaryNav .p2-nav-button[data-p2-route]').forEach(btn=>{
      const active=btn.getAttribute('data-p2-route')===current;
      if(active)btn.setAttribute('aria-current','page');
      else btn.removeAttribute('aria-current');
      if(!btn.getAttribute('aria-label')){
        const label=btn.querySelector('.p2-mobile-label,.p2-nav-copy strong')?.textContent?.trim();
        if(label)btn.setAttribute('aria-label',label);
      }
    });

    const more=q('#p2HeaderMore');
    if(more){
      more.setAttribute('aria-haspopup','dialog');
      more.setAttribute('aria-expanded',document.body.classList.contains('p2-more-open')?'true':'false');
    }

    const drawer=q('#p2MoreDrawer');
    if(drawer){
      drawer.setAttribute('role','dialog');
      drawer.setAttribute('aria-label','More and Model Lab');
      if(window.matchMedia?.('(max-width:900px)').matches)drawer.setAttribute('aria-modal','true');
      else drawer.removeAttribute('aria-modal');
    }
  }

  function announce(){
    const live=q('#p2RouteLive');
    if(!live)return;
    const name=LABELS[viewName()]||viewName();
    live.textContent='';
    setTimeout(()=>{live.textContent=name+' view';},20);
  }

  function focusView(){
    const view=q('#view-'+viewName());
    if(!view)return;
    const target=view.querySelector('h1,h2,.section-head h2');
    if(target){
      target.setAttribute('tabindex','-1');
      target.focus({preventScroll:true});
    }else{
      q('#mainContent')?.focus({preventScroll:true});
    }
  }

  function closeOverlays(){
    if(document.body.classList.contains('p2-more-open')){
      q('#p2MoreDrawer .p2-drawer-close')?.click();
      return true;
    }
    if(document.body.classList.contains('system-filter-open')){
      q('#systemFilterMobileClose')?.click();
      return true;
    }
    const openDetails=qa('details[open]').reverse().find(d=>d.closest('.p2-more-drawer,.system-filter-panel'));
    if(openDetails){openDetails.removeAttribute('open');return true}
    return false;
  }

  function focusables(container){
    if(!container)return[];
    return qa('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"])',container)
      .filter(el=>el.offsetParent!==null);
  }

  function trapDrawer(e){
    if(e.key!=='Tab'||!document.body.classList.contains('p2-more-open'))return;
    const drawer=q('#p2MoreDrawer');
    const items=focusables(drawer);
    if(!items.length)return;
    const first=items[0],last=items.at(-1);
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}
    else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
  }

  function isTypingTarget(el){
    return !!el?.closest?.('input,textarea,select,[contenteditable="true"]');
  }

  function onKeydown(e){
    trapDrawer(e);
    if(e.key==='Escape'){
      if(closeOverlays()){e.preventDefault();return}
    }
    if(isTypingTarget(e.target))return;

    if(e.altKey&&!e.metaKey&&!e.ctrlKey&&ROUTES[Number(e.key)]){
      e.preventDefault();
      window.switchView?.(ROUTES[Number(e.key)]);
      setTimeout(()=>{syncAria();announce();focusView();},30);
      return;
    }

    if(e.key==='/'&&viewName()==='players'){
      const search=q('#playerSearch');
      if(search){e.preventDefault();search.focus()}
    }
  }

  function wrap(name){
    const base=window[name];
    if(typeof base!=='function'||base.__p2PolishWrapped)return;
    function wrapped(){
      const out=base.apply(this,arguments);
      Promise.resolve(out).finally(()=>{
        setTimeout(()=>{
          syncAria();
          announce();
        },0);
      });
      return out;
    }
    wrapped.__p2PolishWrapped=true;
    window[name]=wrapped;
  }

  function enhanceButtons(){
    qa('button').forEach(btn=>{
      if(!btn.getAttribute('type'))btn.setAttribute('type','button');
    });
    q('#playerSearch')?.setAttribute('aria-label','Search player name');
    q('#marketFilter')?.setAttribute('aria-label','Filter player market');
    q('#builderActualOdds')?.setAttribute('aria-label','Bookmaker actual odds');
  }

  function init(){
    ensureA11yShell();
    wrap('switchView');
    enhanceButtons();
    syncAria();
    announce();

    document.addEventListener('keydown',onKeydown);
    document.addEventListener('click',()=>setTimeout(syncAria,0));
    window.addEventListener('resize',()=>setTimeout(syncAria,0),{passive:true});

    const observer=new MutationObserver(()=>syncAria());
    observer.observe(document.body,{attributes:true,attributeFilter:['class']});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
