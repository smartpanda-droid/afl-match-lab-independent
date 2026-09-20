/* AFL Match Lab v78 — responsive showcase UI enhancements.
   Reads existing in-memory state only. No fetch, Supabase write, model mutation or probability override. */
(function(){
  'use strict';

  function q(s,r){return (r||document).querySelector(s)}
  function qa(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s))}
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
  function num(v){var n=Number(v);return Number.isFinite(n)?n:null}
  function pct(v){var n=num(v);return n==null?'—':Math.round(n*100)+'%'}
  function one(v){var n=num(v);return n==null?'—':n.toFixed(1)}
  function odds(v){var n=num(v);return n&&n>0?n.toFixed(2):'—'}

  function currentMatch(){
    try{return (state.matches||[]).find(function(x){return x.match_id===state.selected})||null}catch(e){return null}
  }

  function ensureMobileTabs(){
    var summary=q('#matchSummary'); if(!summary)return null;
    var tabs=q('#v78MobileMatchTabs');
    if(!tabs){
      tabs=document.createElement('nav');
      tabs.id='v78MobileMatchTabs';
      tabs.className='v78-mobile-match-tabs';
      tabs.setAttribute('aria-label','Match quick navigation');
      tabs.innerHTML=
        '<button type="button" class="active" data-v78-tab="summary">Summary</button>'+
        '<button type="button" data-v78-tab="markets">Markets</button>'+
        '<button type="button" data-v78-tab="multi">Multi</button>'+
        '<button type="button" data-v78-tab="insights">Insights</button>';
      summary.insertAdjacentElement('afterend',tabs);
      tabs.addEventListener('click',function(e){
        var b=e.target.closest('[data-v78-tab]'); if(!b)return;
        var target=b.getAttribute('data-v78-tab');
        if(target==='markets'&&typeof window.switchView==='function'){window.switchView('players');return}
        if(target==='multi'&&typeof window.switchView==='function'){window.switchView('system-multi');return}
        if(target==='insights'){
          var risk=q('#v78RiskPreview')||q('#matchAlerts');
          if(risk)risk.scrollIntoView({behavior:'smooth',block:'start'});
          return;
        }
        summary.scrollIntoView({behavior:'smooth',block:'start'});
      });
    }
    return tabs;
  }

  function renderMatchStatus(){
    var m=currentMatch(),mid=q('#matchSummary .match-mid'); if(!mid||!m)return;
    q('.v78-match-status',mid)?.remove();
    q('.v78-countdown',mid)?.remove();
    var countdown='';
    var start=Date.parse(m.start_time||'');
    if(Number.isFinite(start)){
      var mins=Math.round((start-Date.now())/60000);
      if(mins>0&&mins<=480)countdown='T-'+mins+'m';
      else if(mins>480&&mins<2880)countdown='T-'+Math.ceil(mins/60)+'h';
    }
    if(countdown){var c=document.createElement('span');c.className='v78-countdown';c.textContent=countdown;mid.appendChild(c)}
    var status=document.createElement('div');status.className='v78-match-status';
    var lineup=m.lineup_confirmed?'<span class="good">✓ LINEUP CONFIRMED</span>':m.used_fallback_lineup?'<span>LINEUP FALLBACK</span>':'<span>LINEUP PENDING</span>';
    var sealed=(state&&state.finalLock)||m.prediction_is_final||m.final_recommendation_locked;
    var model=sealed?'<span class="info">▣ MODEL SEALED</span>':'<span>MODEL PREVIEW</span>';
    status.innerHTML=lineup+model;mid.appendChild(status);
  }

  function confidenceInfo(){
    var m=currentMatch();
    var finalLock=false;
    try{finalLock=!!state.finalLock||!!(m&&m.prediction_is_final)||!!(m&&m.final_recommendation_locked)}catch(e){}
    var lineup=!!(m&&m.lineup_confirmed);
    if(finalLock&&lineup)return {label:'HIGH',klass:'',detail:'Lineup confirmed · model sealed'};
    if(finalLock||lineup)return {label:'MEDIUM',klass:'medium',detail:finalLock?'Model sealed · lineup pending':'Lineup confirmed · preview model'};
    return {label:'PREVIEW',klass:'low',detail:'Waiting for final pre-match evidence'};
  }

  function ensureKpis(){
    var summary=q('#matchSummary'); if(!summary)return null;
    var strip=q('#v78KpiStrip');
    if(!strip){
      strip=document.createElement('section');
      strip.id='v78KpiStrip';
      strip.className='v78-kpi-strip';
      strip.setAttribute('aria-label','Match decision summary');
      var tabs=q('#v78MobileMatchTabs');
      (tabs||summary).insertAdjacentElement('afterend',strip);
    }
    return strip;
  }

  function renderKpis(){
    var strip=ensureKpis(); if(!strip)return;
    var m=currentMatch();
    var qte=null;
    try{qte=state.matchQuote||null}catch(e){}
    if(!m){
      strip.innerHTML=
        '<article class="v78-kpi"><div class="v78-label">Win Probability</div><div class="v78-main">—</div><div class="v78-sub">Waiting for next confirmed match</div></article>'+
        '<article class="v78-kpi"><div class="v78-label">Projected Margin</div><div class="v78-main">—</div><div class="v78-sub">Model standby</div></article>'+
        '<article class="v78-kpi"><div class="v78-label">Total Points</div><div class="v78-main">—</div><div class="v78-sub">Model standby</div></article>'+
        '<article class="v78-kpi"><div class="v78-label">Model Confidence</div><div class="v78-main">PREVIEW</div><div class="v78-sub">Waiting for fixture evidence</div></article>';
      return;
    }
    var hp=qte?num(qte.home_win_probability):null;
    var ap=qte?num(qte.away_win_probability):null;
    var hs=qte?num(qte.predicted_home_score):null;
    var as=qte?num(qte.predicted_away_score):null;
    var margin=hs!=null&&as!=null?hs-as:null;
    var marginTeam=margin==null?'—':(margin>=0?m.home_team_name:m.away_team_name);
    var total=qte?num(qte.fair_total):null;
    var c=confidenceInfo();
    var left=hp==null?50:Math.max(0,Math.min(100,Math.round(hp*100)));
    var right=ap==null?100-left:Math.max(0,Math.min(100,Math.round(ap*100)));
    strip.innerHTML=
      '<article class="v78-kpi"><div class="v78-label"><span>Win Probability</span><span>MODEL</span></div>'+
        '<div class="v78-split"><div><span>'+esc(m.home_team_name)+'</span><strong>'+pct(hp)+'</strong></div><div style="text-align:right"><span>'+esc(m.away_team_name)+'</span><strong>'+pct(ap)+'</strong></div></div>'+
        '<div class="v78-prob-bar"><i style="width:'+left+'%"></i><b style="width:'+right+'%"></b></div></article>'+
      '<article class="v78-kpi"><div class="v78-label"><span>Projected Margin</span><span>FAIR</span></div>'+
        '<div class="v78-main">'+(margin==null?'—':esc(marginTeam)+' '+Math.abs(margin).toFixed(1))+'</div>'+
        '<div class="v78-sub">Predicted score differential</div></article>'+
      '<article class="v78-kpi"><div class="v78-label"><span>Total Points</span><span>FAIR</span></div>'+
        '<div class="v78-main">'+one(total)+'</div>'+
        '<div class="v78-sub">'+(qte&&qte.quoted_total!=null?'Quoted '+one(qte.quoted_total):'Model fair total')+'</div></article>'+
      '<article class="v78-kpi" title="Readiness signal from lineup and model-seal state; it is not a betting probability."><div class="v78-label"><span>Model Confidence</span><span>STATUS</span></div>'+
        '<div class="v78-main">'+esc(c.label)+'</div><div class="v78-ready '+esc(c.klass)+'">'+esc(c.detail)+'</div></article>';
  }

  function strategyLabel(v){
    v=String(v||'').toLowerCase();
    if(v.indexOf('conserv')>=0)return 'Conservative';
    if(v.indexOf('aggress')>=0)return 'Aggressive';
    return 'Balanced';
  }

  function pickMultis(){
    var rows=[];
    try{rows=(state.multis||[]).filter(function(x){return x.recommended!==false})}catch(e){}
    var buckets={};
    rows.forEach(function(x){
      var k=strategyLabel(x.strategy);
      if(!buckets[k]||Number(x.combined_probability||0)>Number(buckets[k].combined_probability||0))buckets[k]=x;
    });
    return ['Conservative','Balanced','Aggressive'].map(function(k){return buckets[k]}).filter(Boolean);
  }

  function ensureMultiPreview(){
    var top=q('.top-edges-panel'); if(!top)return null;
    var host=q('#v78MultiPreview');
    if(!host){
      host=document.createElement('section');
      host.id='v78MultiPreview';
      host.className='panel v78-multi-preview';
      top.insertAdjacentElement('afterend',host);
    }
    return host;
  }

  function renderMultiPreview(){
    var host=ensureMultiPreview(); if(!host)return;
    var rows=pickMultis();
    host.innerHTML=
      '<div class="v78-preview-head"><div><div class="eyebrow">SYSTEM MULTI</div><h2>Model-built combinations</h2><p>Fast comparison before opening the full simulation workspace.</p></div><button type="button" class="v78-preview-action">View all</button></div>'+
      (rows.length?'<div class="v78-multi-grid">'+rows.map(function(m){
        var label=strategyLabel(m.strategy);
        return '<article class="v78-multi-card '+(label==='Balanced'?'featured':'')+'"><small>'+esc(label)+'</small><strong>'+esc(String(m.leg_count||((m.legs||[]).length)||'—'))+' legs · '+pct(m.combined_probability)+'</strong><span>Fair '+odds(m.fair_odds||m.combined_fair_odds)+' · '+(m.recommended===false?'Watch':'Recommended')+'</span></article>';
      }).join('')+'</div>':'<div class="empty">System Multi will appear here when recommended combinations are loaded.</div>');
    q('.v78-preview-action',host).addEventListener('click',function(){if(typeof window.switchView==='function')window.switchView('system-multi')});
  }

  function ensureRiskPreview(){
    var multi=q('#v78MultiPreview'); if(!multi)return null;
    var host=q('#v78RiskPreview');
    if(!host){
      host=document.createElement('section');
      host.id='v78RiskPreview';
      host.className='panel v78-risk-preview';
      multi.insertAdjacentElement('afterend',host);
    }
    return host;
  }

  function renderRiskPreview(){
    var host=ensureRiskPreview(); if(!host)return;
    var alerts=qa('#matchAlerts .match-alert').slice(0,3);
    var rows=alerts.map(function(a){
      var strong=q('strong',a),span=q('span',a);
      return '<div class="v78-risk-row"><i class="v78-risk-dot"></i><div><strong>'+esc(strong?strong.textContent:'Match context')+'</strong><span>'+esc(span?span.textContent:'')+'</span></div></div>';
    }).join('');
    host.innerHTML='<div class="v78-preview-head"><div><div class="eyebrow">KEY RISKS</div><h2>What can change the read?</h2></div><button type="button" class="v78-preview-action">Insights</button></div><div class="v78-risk-preview-list">'+(rows||'<div class="empty">Risk context is loading.</div>')+'</div>';
    q('.v78-preview-action',host).addEventListener('click',function(){
      var rail=q('.match-dashboard-rail'); if(rail)rail.scrollIntoView({behavior:'smooth',block:'start'});
    });
  }

  function ensureInsightRow(){
    var top=q('.top-edges-panel'),multi=q('#v78MultiPreview'),recent=q('.recent-form-panel'),risk=q('#v78RiskPreview');
    if(!top||!multi||!recent||!risk)return null;
    var row=q('#v78InsightRow');
    if(!row){row=document.createElement('section');row.id='v78InsightRow';row.className='v78-insight-row';top.insertAdjacentElement('afterend',row)}
    if(multi.parentElement!==row)row.appendChild(multi);
    if(recent.parentElement!==row)row.appendChild(recent);
    if(risk.parentElement!==row)row.appendChild(risk);
    return row;
  }

  function ensureMatchOrder(){
    var row=q('#v78InsightRow'),prediction=q('#matchPrediction');
    if(row&&prediction&&row.nextElementSibling!==prediction)row.insertAdjacentElement('afterend',prediction);
  }

  function syncMobileLegacyLayers(){
    var mobile=window.matchMedia&&window.matchMedia('(max-width: 900px)').matches;
    qa('#matchdayStatusStrip,#matchdayDecisionBand,.p2-decision-flow').forEach(function(el){
      if(mobile){el.hidden=true;el.style.setProperty('display','none','important')}
      else{el.hidden=false;el.style.removeProperty('display')}
    });
  }

  function syncMobileActionCopy(){
    var mobile=window.matchMedia&&window.matchMedia('(max-width: 430px)').matches;
    var items=[
      ['#view-players .player-market-footer .add-leg','加入 Multi'],
      ['#view-match .top-edges-panel .add-leg','+ Multi']
    ];
    items.forEach(function(pair){
      qa(pair[0]).forEach(function(el){
        if(!el.dataset.v78OriginalLabel)el.dataset.v78OriginalLabel=el.textContent.trim();
        el.textContent=mobile?pair[1]:el.dataset.v78OriginalLabel;
      });
    });
  }

  function syncCompactNavLabels(){
    var system=q('.p2-nav-button[data-p2-route="system-multi"] .p2-mobile-label');
    var lab=q('.p2-nav-button[data-p2-route="multi-lab"] .p2-mobile-label');
    if(system)system.textContent='MULTI';
    if(lab)lab.textContent='LAB';
  }

  function ensureMobileBuilder(){
    var bar=q('#v78MobileBuilder');
    if(!bar){
      bar=document.createElement('aside');
      bar.id='v78MobileBuilder';
      bar.className='v78-mobile-builder';
      bar.setAttribute('aria-label','Current Multi Lab build');
      document.body.appendChild(bar);
    }
    return bar;
  }

  function renderMobileBuilder(){
    var bar=ensureMobileBuilder(),n=0,view='';
    try{n=Array.isArray(state.builder)?state.builder.length:0;view=state.view||''}catch(e){}
    var visible=n>0&&view!=='multi-lab';
    bar.hidden=!visible;
    document.body.classList.toggle('v78-has-builder',visible);
    if(!visible){bar.innerHTML='';return}
    var summary=n+' leg'+(n===1?'':'s')+' selected';
    bar.innerHTML='<div><strong>'+esc(summary)+'</strong><span>Multi Lab</span></div><button type="button">View Multi</button>';
    q('button',bar).addEventListener('click',function(){if(typeof window.switchView==='function')window.switchView('multi-lab')});
  }

  function syncAll(){
    document.body.classList.add('v78-showcase');
    ensureMobileTabs();
    renderMatchStatus();
    renderKpis();
    renderMultiPreview();
    renderRiskPreview();
    ensureInsightRow();
    ensureMatchOrder();
    syncMobileLegacyLayers();
    syncMobileActionCopy();
    syncCompactNavLabels();
    renderMobileBuilder();
  }

  function wrap(name){
    var fn=window[name];
    if(typeof fn!=='function'||fn.__v78wrapped)return;
    function wrapped(){
      var out=fn.apply(this,arguments);
      Promise.resolve().then(syncAll);
      return out;
    }
    wrapped.__v78wrapped=true;
    window[name]=wrapped;
  }

  function init(){
    document.body.classList.add('v78-showcase');
    ['renderMatch','renderMatchPrediction','renderMatchRail','renderMultis','renderBuilder','switchView'].forEach(wrap);
    syncAll();
    window.setTimeout(syncAll,0);
    window.setTimeout(syncAll,350);
    var select=q('#matchSelect');
    if(select)select.addEventListener('change',function(){window.setTimeout(syncAll,0)});
    var legacyObserver=new MutationObserver(function(mutations){
      if(!(window.matchMedia&&window.matchMedia('(max-width: 900px)').matches))return;
      var needs=false;
      mutations.forEach(function(m){Array.prototype.forEach.call(m.addedNodes||[],function(n){if(n&&n.nodeType===1&&(n.matches?.('.p2-decision-flow,#matchdayStatusStrip,#matchdayDecisionBand')||n.querySelector?.('.p2-decision-flow,#matchdayStatusStrip,#matchdayDecisionBand')))needs=true})});
      if(needs)syncMobileLegacyLayers();
    });
    legacyObserver.observe(document.body,{childList:true,subtree:true});
    window.addEventListener('resize',function(){window.setTimeout(function(){syncMobileLegacyLayers();syncMobileActionCopy()},0)},{passive:true});
    document.addEventListener('click',function(e){
      if(e.target.closest('.add-leg,.send-builder,[data-p2-route],[data-p2-view]'))window.setTimeout(syncAll,0);
    });
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
