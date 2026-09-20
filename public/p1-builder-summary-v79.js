/* P1.4 — Multi Lab Decision Summary v79.3
   Presentation only. Reuses existing builder state/evaluation. */
(function(){
  'use strict';
  const q=(s,r)=> (r||document).querySelector(s);
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:null};
  const pct=v=>{const n=num(v);return n==null?'—':Math.round(n*1000)/10+'%'};
  const odds=v=>{const n=num(v);return n&&n>0?n.toFixed(2):'—'};
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function weakestLeg(){
    const legs=state.builder||[];
    if(!legs.length)return null;
    return legs.slice().sort((a,b)=>Number(a.probability??a.model_probability??1)-Number(b.probability??b.model_probability??1))[0];
  }
  function dependencyRisk(ev){
    if(!ev||ev.status!=='ok')return {level:'WAIT',cls:'neutral',title:'Dependency pending',detail:'等待组合相关性计算'};
    const f=num(ev.dependency_factor)??1;
    const pairs=(ev.pair_details||[]).filter(x=>num(x.factor)!=null).sort((a,b)=>Number(a.factor)-Number(b.factor));
    const weak=pairs[0];
    if(ev.method?.includes('proxy')){
      return {level:'PROXY',cls:'warn',title:'Proxy dependency ×'+f.toFixed(3),detail:'含比赛/自定义报价，相关性为近似'};
    }
    if(weak){
      const label=[weak.player_a,weak.market_a,'↔',weak.player_b,weak.market_b].filter(Boolean).join(' ');
      const level=Number(weak.factor)<.90?'HIGH':Number(weak.factor)<.965?'MED':'LOW';
      return {level,cls:level==='HIGH'?'bad':level==='MED'?'warn':'good',title:'Weakest pair ×'+Number(weak.factor).toFixed(3),detail:label||'Dependent pair'};
    }
    const level=f<.90?'HIGH':f<.965?'MED':'LOW';
    return {level,cls:level==='HIGH'?'bad':level==='MED'?'warn':'good',title:'Dependency ×'+f.toFixed(3),detail:level==='LOW'?'No elevated loaded dependency':'Combined dependency adjustment'};
  }
  function valueInfo(ev,actual){
    if(!actual||actual<=1)return {label:'ENTER ODDS',cls:'neutral',detail:'输入博彩公司赔率后判断 Value'};
    if(!ev||ev.status!=='ok'||num(ev.value_pct)==null)return {label:'CALCULATING',cls:'neutral',detail:'等待 dependency-adjusted value'};
    const v=Number(ev.value_pct);
    if(v>=8)return {label:'STRONG VALUE',cls:'good',detail:'EV +'+v.toFixed(1)+'%'};
    if(v>=3)return {label:'VALUE',cls:'good',detail:'EV +'+v.toFixed(1)+'%'};
    if(v>-3)return {label:'FAIR',cls:'warn',detail:'EV '+(v>=0?'+':'')+v.toFixed(1)+'%'};
    return {label:'POOR VALUE',cls:'bad',detail:'EV '+v.toFixed(1)+'%'};
  }
  function ensure(){
    const panel=q('#view-multi-lab .builder-grid > .panel:first-child');
    const head=panel?.querySelector('.section-head');
    if(!panel||!head)return null;
    let host=q('#p14BuilderDecision');
    if(!host){
      host=document.createElement('section');
      host.id='p14BuilderDecision';
      host.className='p14-builder-decision';
      head.insertAdjacentElement('afterend',host);
    }
    return host;
  }
  function render(){
    const host=ensure();
    if(!host)return;
    const legs=state.builder||[],ev=state.builderEval,ok=ev?.status==='ok';
    if(!legs.length){
      host.innerHTML='<div class="p14-empty"><strong>Multi Lab ready</strong><span>加入至少 2 腿后显示 dependency-adjusted 决策摘要。</span></div>';
      return;
    }
    const naive=legs.reduce((a,l)=>a*Number(l.probability??l.model_probability??0),1);
    const modelP=legs.length>=2?(ok?num(ev.joint_probability):null):null;
    const fair=legs.length>=2?(ok?num(ev.fair_odds):null):null;
    const actual=num(q('#builderActualOdds')?.value);
    const dep=dependencyRisk(ev);
    const value=valueInfo(ev,actual);
    const weak=weakestLeg();
    const weakLabel=weak?.selection||weak?.player_name||'—';
    const weakP=num(weak?.probability??weak?.model_probability);
    const status=legs.length<2?'ADD LEG':ok?'READY':'EVALUATING';
    const statusCls=legs.length<2?'warn':ok?'good':'neutral';

    host.innerHTML=
      '<div class="p14-head">'+
        '<div><div class="eyebrow">P1.4 · DECISION SUMMARY</div><h3>当前组合</h3></div>'+
        '<span class="p14-status '+statusCls+'">'+status+'</span>'+
      '</div>'+
      '<div class="p14-metrics">'+
        '<div><span>LEGS</span><strong>'+legs.length+'</strong></div>'+
        '<div><span>MODEL P</span><strong>'+(modelP!=null?pct(modelP):legs.length<2?'—':'…')+'</strong><small>Naive '+pct(naive)+'</small></div>'+
        '<div><span>FAIR ODDS</span><strong>'+(fair!=null?odds(fair):'—')+'</strong></div>'+
        '<div><span>BOOK ODDS</span><strong>'+(actual&&actual>1?actual.toFixed(2):'—')+'</strong></div>'+
      '</div>'+
      '<div class="p14-decision-grid">'+
        '<div class="p14-decision '+value.cls+'"><span>VALUE STATUS</span><strong>'+esc(value.label)+'</strong><small>'+esc(value.detail)+'</small></div>'+
        '<div class="p14-decision '+dep.cls+'"><span>DEPENDENCY RISK</span><strong>'+esc(dep.level)+'</strong><small>'+esc(dep.title)+'</small></div>'+
        '<div class="p14-decision"><span>WEAKEST LEG</span><strong>'+esc(weakLabel)+'</strong><small>'+pct(weakP)+'</small></div>'+
      '</div>'+
      '<div class="p14-actions">'+
        '<button type="button" class="p14-odds-focus">'+(actual&&actual>1?'Edit Book Odds':'Enter Book Odds')+'</button>'+
        '<button type="button" class="p14-dependency-focus" '+(legs.length<2?'disabled':'')+'>View Dependency</button>'+
      '</div>';

    q('.p14-odds-focus',host)?.addEventListener('click',()=>{
      q('#builderActualOdds')?.focus({preventScroll:true});
      q('#builderActualOdds')?.scrollIntoView({behavior:'smooth',block:'center'});
    });
    q('.p14-dependency-focus',host)?.addEventListener('click',()=>{
      q('#builderDependencyDetails')?.scrollIntoView({behavior:'smooth',block:'center'});
    });
  }
  function wrap(name){
    const base=window[name];
    if(typeof base!=='function'||base.__p14Wrapped)return;
    function wrapped(){
      const out=base.apply(this,arguments);
      Promise.resolve(out).finally(()=>setTimeout(render,0));
      return out;
    }
    wrapped.__p14Wrapped=true;
    window[name]=wrapped;
  }
  function init(){
    wrap('renderBuilder');
    wrap('evaluateBuilder');
    render();
    setTimeout(render,120);
    document.addEventListener('input',e=>{
      if(e.target.matches?.('#builderActualOdds'))setTimeout(render,0);
    });
    document.addEventListener('click',e=>{
      if(e.target.closest?.('#clearBuilder,.remove-leg,.send-builder,.add-leg,.match-leg-choice'))setTimeout(render,60);
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
