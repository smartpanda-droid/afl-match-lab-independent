/* P1.1 — Persistent Match Context Bar v79
   Uses existing in-memory state only. No fetch/API/model mutation. */
(function(){
  'use strict';

  const PRIMARY=new Set(['match','players','system-multi','multi-lab']);
  function q(s,r){return (r||document).querySelector(s)}
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}

  function match(){
    try{return (state.matches||[]).find(x=>x.match_id===state.selected)||null}catch(e){return null}
  }
  function currentView(){
    try{return state.view||'match'}catch(e){return 'match'}
  }
  function countdown(m){
    const start=Date.parse(m?.start_time||'');
    if(!Number.isFinite(start))return '';
    const mins=Math.round((start-Date.now())/60000);
    if(mins>2880)return 'T-'+Math.ceil(mins/1440)+'d';
    if(mins>120)return 'T-'+Math.ceil(mins/60)+'h';
    if(mins>0)return 'T-'+mins+'m';
    if(mins>=-240)return 'STARTED';
    return '';
  }
  function modelStatus(m){
    let locked=false;
    try{locked=!!state.finalLock||!!m?.final_recommendation_locked}catch(e){}
    if(locked)return {label:'MODEL LOCKED',cls:'info'};
    if(m?.prediction_is_final)return {label:'T-30 SEALED',cls:'info'};
    return {label:'MODEL PREVIEW',cls:'warn'};
  }
  function lineupStatus(m){
    if(m?.lineup_confirmed)return {label:'LINEUP CONFIRMED',cls:'good'};
    if(m?.used_fallback_lineup)return {label:'LINEUP FALLBACK',cls:'warn'};
    return {label:'LINEUP PENDING',cls:''};
  }
  function timeLabel(m){
    const d=new Date(m?.start_time||'');
    if(!Number.isFinite(d.getTime()))return '';
    try{
      return new Intl.DateTimeFormat(undefined,{weekday:'short',hour:'numeric',minute:'2-digit'}).format(d);
    }catch(e){return ''}
  }
  function ensure(){
    let bar=q('#p1MatchContext');
    if(bar)return bar;
    bar=document.createElement('aside');
    bar.id='p1MatchContext';
    bar.setAttribute('aria-label','Current match context');
    bar.hidden=true;
    const top=q('.topbar');
    if(top)top.insertAdjacentElement('afterend',bar);
    else document.body.prepend(bar);
    return bar;
  }
  function render(){
    const bar=ensure(),m=match(),view=currentView();
    const visible=PRIMARY.has(view)&&!!m;
    bar.hidden=!visible;
    document.body.classList.toggle('p1-context-visible',visible);
    document.body.classList.add('p1-context-ready');
    if(!visible)return;

    const lineup=lineupStatus(m),model=modelStatus(m),cd=countdown(m);
    const meta=[m.round_name,m.venue,timeLabel(m)].filter(Boolean).join(' · ');
    bar.innerHTML=
      '<div class="p1-context-inner">'+
        '<div class="p1-context-match">'+
          '<div class="p1-context-teams">'+
            '<span class="team">'+esc(m.home_team_name)+'</span>'+
            '<span class="vs">VS</span>'+
            '<span class="team">'+esc(m.away_team_name)+'</span>'+
          '</div>'+
          '<div class="p1-context-meta">'+esc(meta)+'</div>'+
        '</div>'+
        '<div class="p1-context-status">'+
          (cd?'<span class="p1-context-countdown">'+esc(cd)+'</span>':'')+
          '<span class="p1-context-pill '+esc(lineup.cls)+'">'+esc(lineup.label)+'</span>'+
          '<span class="p1-context-pill p1-model-label '+esc(model.cls)+'">'+esc(model.label)+'</span>'+
        '</div>'+
      '</div>';
  }
  function wrap(name){
    const fn=window[name];
    if(typeof fn!=='function'||fn.__p1ContextWrapped)return;
    function wrapped(){
      const out=fn.apply(this,arguments);
      Promise.resolve(out).finally(()=>window.setTimeout(render,0));
      return out;
    }
    wrapped.__p1ContextWrapped=true;
    window[name]=wrapped;
  }
  function init(){
    ['switchView','renderMatch','loadSelected','renderBuilder','renderPlayers','renderMultis'].forEach(wrap);
    render();
    window.setTimeout(render,120);
    window.setInterval(render,60000);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)render()});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
