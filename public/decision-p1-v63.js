/* AFL Match Lab P1 v63 — matchup lens, scenario stress test, correlation visualisation.
   Explanation only: does not mutate production probabilities. */
(function(){
  'use strict';
  const P1='P1 v63';
  const $q=s=>document.querySelector(s), $$q=s=>[...document.querySelectorAll(s)];
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:null};
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pct=v=>{const n=num(v);return n==null?'—':Math.round(n*100)+'%'};
  const mk=v=>{try{return typeof marketLabel==='function'?marketLabel(v):String(v||'').replaceAll('_',' ')}catch{return String(v||'').replaceAll('_',' ')}};
  const currentMatch=()=>state.matches?.find(x=>x.match_id===state.selected)||null;

  function roleFromPosition(pos){
    const p=String(pos||'').toUpperCase();
    if(p==='RK')return 'Ruck';
    if(['R','RR'].includes(p))return 'Inside Mid';
    if(['C','WL','WR'].includes(p))return 'Wing / Outside Mid';
    if(['HBFL','CHB','HBFR','BPL','FB','BPR'].includes(p))return p.startsWith('HB')?'Half Back':'Defender';
    if(['HFFL','CHF','HFFR'].includes(p))return 'Half Forward';
    if(['FPL','FF','FPR'].includes(p))return p==='FF'?'Key Forward':'Forward';
    return 'Flexible Role';
  }
  function roleBucket(leg){
    const lineup=state.lineup?.find(x=>String(x.player_id)===String(leg?.player_id));
    const named=roleFromPosition(lineup?.named_position);
    const label=String(leg?.role_label||'').replaceAll('_',' ').trim();
    return label&&label.toLowerCase()!=='stable'?label:named;
  }
  function matchupLens(leg){
    const rf=num(leg?.role_factor)??1,of=num(leg?.opponent_factor)??1,combined=rf*of;
    const cls=combined>1.02?'favourable':combined<0.98?'tough':'neutral';
    const label=cls==='favourable'?'Favourable':cls==='tough'?'Tough':'Neutral';
    return {rf,of,combined,cls,label,role:roleBucket(leg),tier:String(leg?.opponent_tier||'mid').toUpperCase()};
  }
  function uniqueBestLegs(limit=8){
    const src=(state.legs||[]).filter(l=>num(l.model_probability)>0&&num(l.model_probability)<=1);
    const best=new Map();
    for(const l of src){
      const key=String(l.player_id)+':'+String(l.market);
      const prev=best.get(key);
      if(!prev||num(l.model_probability)>num(prev.model_probability))best.set(key,l);
    }
    return [...best.values()].sort((a,b)=>{
      const la=matchupLens(a),lb=matchupLens(b);
      const sa=Math.abs(la.combined-1)*.65+(num(a.model_probability)||0)*.35;
      const sb=Math.abs(lb.combined-1)*.65+(num(b.model_probability)||0)*.35;
      return sb-sa;
    }).slice(0,limit);
  }

  function scenarioSide(key,leg){
    const m=currentMatch();if(!m)return 0;
    const home=String(leg?.team_name||'')===String(m.home_team_name);
    if(key==='home_control')return home?1:-1;
    if(key==='away_control')return home?-1:1;
    return 0;
  }
  function scenarioImpact(leg,key){
    const market=String(leg?.market||''),role=roleBucket(leg),side=scenarioSide(key,leg);
    let impact=0;
    if(['goals'].includes(market)){
      if(key==='home_control'||key==='away_control')impact=2*side;
      else if(key==='blowout_garbage_time')impact=side?1:0;
      else if(key==='low_scoring_defensive')impact=-2;
      else if(key==='close_contest')impact=0;
      else if(key==='momentum_comeback')impact=1;
    }else if(['disposals','kicks','handballs','fantasy_points','clearances'].includes(market)){
      if(role.includes('Inside')) {
        if(key==='close_contest'||key==='low_scoring_defensive')impact=1;
        if(key==='blowout_garbage_time')impact=-1;
      } else if(role.includes('Half Back')||role==='Defender'){
        if((key==='home_control'||key==='away_control')&&side<0)impact=1;
        if((key==='home_control'||key==='away_control')&&side>0)impact=-1;
        if(key==='low_scoring_defensive')impact=1;
      } else if(role.includes('Wing')){
        if(key==='close_contest')impact=1;
        if(key==='blowout_garbage_time')impact=-1;
      }
      if(market==='fantasy_points'&&key==='close_contest')impact=Math.max(impact,1);
    }else if(market==='marks'){
      if(role.includes('Half Back')||role==='Defender'){
        if((key==='home_control'||key==='away_control')&&side<0)impact=2;
        if(key==='low_scoring_defensive')impact=1;
      } else if(role.includes('Forward')){
        if((key==='home_control'||key==='away_control')&&side>0)impact=1;
        if(key==='low_scoring_defensive')impact=-1;
      }
    }else if(market==='tackles'){
      if(key==='close_contest'||key==='low_scoring_defensive')impact=1;
      if(key==='blowout_garbage_time')impact=-1;
    }else if(market==='hitouts'){
      if(key==='close_contest'||key==='low_scoring_defensive')impact=1;
      if(key==='blowout_garbage_time')impact=-1;
    }
    const av=state.availability?.get?.(leg?.player_id);
    if(av&&av.status&&av.status!=='normal'&&impact>0)impact-=1;
    return Math.max(-2,Math.min(2,impact));
  }
  function impactLabel(v){
    return v>=2?{text:'↑ Boost',cls:'boost'}:v===1?{text:'↗ Slight boost',cls:'slight-boost'}:
      v<=-2?{text:'↓ Pressure',cls:'pressure'}:v===-1?{text:'↘ Slight pressure',cls:'slight-pressure'}:{text:'↔ Neutral',cls:'neutral'};
  }
  function sensitivityForLeg(leg,scenarios){
    const vals=scenarios.map(([k,w])=>({k,w:num(w)||0,v:scenarioImpact(leg,k)}));
    const active=vals.filter(x=>x.w>=.08);
    const spread=active.length?Math.max(...active.map(x=>x.v))-Math.min(...active.map(x=>x.v)):0;
    const weighted=active.reduce((a,x)=>a+Math.abs(x.v)*x.w,0);
    const level=spread>=3||weighted>=.8?'HIGH':spread>=2||weighted>=.35?'MEDIUM':'LOW';
    return {level,vals};
  }

  function ensureTacticsPanels(){
    const view=$q('#view-tactics');if(!view)return {};
    let role=$q('#p1RoleOppositionPanel'),scenario=$q('#p1ScenarioSensitivityPanel');
    const synergy=$q('#synergyCards')?.closest('.panel');
    if(!role){
      role=document.createElement('section');role.id='p1RoleOppositionPanel';role.className='panel p1-panel';
      if(synergy)synergy.insertAdjacentElement('beforebegin',role);else view.appendChild(role);
    }
    if(!scenario){
      scenario=document.createElement('section');scenario.id='p1ScenarioSensitivityPanel';scenario.className='panel p1-panel p1-scenario-panel';
      if(synergy)synergy.insertAdjacentElement('beforebegin',scenario);else view.appendChild(scenario);
    }
    return {role,scenario};
  }
  function renderRoleOpposition(){
    const {role}=ensureTacticsPanels();if(!role)return;
    if(!state.selected){role.innerHTML='<div class="empty">等待未来赛事</div>';return}
    if(state.fullLegsMatch!==state.selected){
      role.innerHTML='<div class="section-head"><div><div class="eyebrow">ROLE × OPPOSITION</div><h2>位置 / 角色对位</h2><p class="p1-panel-note">正在按需载入完整球员预测数据…</p></div></div>';
      if(typeof ensureFullLegs==='function'&&!role.dataset.loading){
        role.dataset.loading='1';
        Promise.resolve(ensureFullLegs()).then(()=>{delete role.dataset.loading;renderP1Tactics()}).catch(()=>{delete role.dataset.loading});
      }
      return;
    }
    const legs=uniqueBestLegs(8);
    role.innerHTML='<div class="section-head"><div><div class="eyebrow">ROLE × OPPOSITION LENS</div><h2>位置 / 角色对位</h2><p class="p1-panel-note">这里组合的是模型已经存在的 Role factor 与 Opponent factor。它是解释层，不等于一个新训练的 role-vs-role 概率模型。</p></div><span class="badge neutral p1-method-badge">EXPLAIN ONLY</span></div>'+
      '<div class="p1-role-grid">'+(legs.length?legs.map(l=>{
        const x=matchupLens(l),rc=num(l.role_confidence),rs=l.role_samples??0,os=l.opponent_samples??0;
        return '<article class="p1-role-card"><div class="p1-role-main"><div class="p1-kicker"><span class="p1-role-badge">'+esc(x.role)+'</span><span class="p1-lens-badge '+x.cls+'">'+x.label+' lens</span></div><h3>'+esc(l.player_name)+' · '+esc(mk(l.market))+' '+esc(l.threshold)+'+</h3><p>'+pct(l.model_probability)+' model probability · '+esc(x.tier)+' opposition tier</p></div>'+
          '<div class="p1-role-metrics"><div class="p1-role-metric"><span>Role factor</span><b>×'+x.rf.toFixed(3)+'</b></div><div class="p1-role-metric"><span>Opponent factor</span><b>×'+x.of.toFixed(3)+'</b></div><div class="p1-role-metric"><span>Combined lens</span><b>×'+x.combined.toFixed(3)+'</b></div><div class="p1-role-metric"><span>Role confidence</span><b>'+(rc==null?'—':Math.round(rc*100)+'%')+'</b></div></div>'+
          '<div class="p1-role-foot"><span>Role n='+esc(rs)+'</span><span>Opponent n='+esc(os)+'</span><span>Position '+esc(state.lineup?.find(p=>String(p.player_id)===String(l.player_id))?.named_position||'—')+'</span></div></article>';
      }).join(''):'<div class="empty">暂无带 Role / Opposition 证据的球员预测</div>')+'</div>';
  }

  function renderScenarioSensitivity(){
    const {scenario}=ensureTacticsPanels();if(!scenario)return;
    const weights=Object.entries(state.context?.scenario_weights||{}).sort((a,b)=>num(b[1])-num(a[1])).slice(0,4);
    if(!weights.length){
      scenario.innerHTML='<div class="section-head"><div><div class="eyebrow">SCENARIO SENSITIVITY</div><h2>Scenario Stress Test</h2></div></div><div class="empty">Scenario context 尚未生成</div>';return;
    }
    if(state.fullLegsMatch!==state.selected){scenario.innerHTML='<div class="empty">等待完整球员预测数据</div>';return}
    const legs=uniqueBestLegs(8);
    const head=weights.map(([k,w])=>'<th>'+esc(typeof scenarioLabel==='function'?scenarioLabel(k):k.replaceAll('_',' '))+'<br>'+pct(w)+'</th>').join('');
    const rows=legs.map(l=>{
      const sen=sensitivityForLeg(l,weights);
      const impacts=weights.map(([k])=>{const x=impactLabel(scenarioImpact(l,k));return '<td><span class="p1-impact '+x.cls+'">'+x.text+'</span></td>'}).join('');
      return '<tr><td><div class="p1-scenario-player"><strong>'+esc(l.player_name)+' · '+esc(mk(l.market))+' '+esc(l.threshold)+'+</strong><span>'+esc(roleBucket(l))+' · Base '+pct(l.model_probability)+'</span></div></td><td><span class="p1-sensitivity '+sen.level.toLowerCase()+'">'+sen.level+'</span></td>'+impacts+'</tr>';
    }).join('');
    scenario.innerHTML='<div class="section-head"><div><div class="eyebrow">SCENARIO SENSITIVITY</div><h2>Scenario Stress Test</h2><p class="p1-panel-note">方向性压力测试：用当前角色、玩法和比赛场景判断哪类走势更容易帮助或压制该腿。它不会生成新的概率，也不会修改 production probability。</p></div><span class="badge warn p1-method-badge">HEURISTIC · NOT CALIBRATED</span></div>'+
      '<div class="p1-scenario-wrap"><table class="p1-scenario-table"><thead><tr><th>Player / Market</th><th>Sensitivity</th>'+head+'</tr></thead><tbody>'+rows+'</tbody></table></div>'+
      '<div class="p1-scenario-legend"><span><b>Base P</b> = production model probability</span><span><b>↑ / ↓</b> = directional stress only</span><span><b>Scenario %</b> = current match scenario weight, not leg probability</span></div>';
  }
  function renderP1Tactics(){renderRoleOpposition();renderScenarioSensitivity()}

  function enhancePlayerExplanations(){
    $$q('#playerCards .player-market-option').forEach(row=>{
      if(row.dataset.p1Explain)return;
      const pid=row.dataset.player,market=row.dataset.market;
      const opts=(state.legs||[]).filter(l=>String(l.player_id)===String(pid)&&String(l.market)===String(market));
      if(!opts.length)return;
      let leg;
      try{leg=typeof selectedPlayerLeg==='function'?selectedPlayerLeg(opts):opts[0]}catch{leg=opts[0]}
      if(!leg)return;
      const detail=row.querySelector('.p0-explain-body');if(!detail)return;
      const lens=matchupLens(leg);
      const scenarios=Object.entries(state.context?.scenario_weights||{}).sort((a,b)=>num(b[1])-num(a[1])).slice(0,4);
      const sen=scenarios.length?sensitivityForLeg(leg,scenarios):{level:'—'};
      const addon=document.createElement('div');addon.className='p1-explain-addon';
      addon.innerHTML='<div class="p1-explain-addon-head"><strong>ROLE × OPPOSITION / SCENARIO</strong><span>Explain only</span></div><div class="p1-explain-addon-grid">'+
        '<div><span>Role</span><b>'+esc(lens.role)+'</b></div><div><span>Role factor</span><b>×'+lens.rf.toFixed(3)+'</b></div><div><span>Opponent</span><b>'+esc(lens.tier)+' · ×'+lens.of.toFixed(3)+'</b></div><div><span>Scenario sensitivity</span><b>'+esc(sen.level)+'</b></div></div>';
      detail.appendChild(addon);row.dataset.p1Explain='1';
    });
  }

  function corrRisk(ev){
    const pairs=ev?.pair_details||[], dep=num(ev?.dependency_factor)??1;
    const maxDev=Math.max(Math.abs(dep-1),...pairs.map(x=>Math.abs((num(x.factor)??1)-1)));
    const proxy=String(ev?.method||'').includes('proxy');
    const level=proxy||maxDev>=.08?'HIGH':maxDev>=.035?'MEDIUM':'LOW';
    return {level,maxDev,proxy};
  }
  function pairDirection(f){
    const n=num(f)??1,dev=Math.abs(n-1);
    if(dev<.025)return {text:'Near neutral',cls:'neutral',strength:'Light'};
    if(n>1)return {text:'Positive joint',cls:'positive',strength:dev>=.08?'Strong':'Moderate'};
    return {text:'Negative joint',cls:'negative',strength:dev>=.08?'Strong':'Moderate'};
  }
  function enhanceBuilderCorrelation(){
    const dep=$q('#builderDependencyDetails'),ev=state.builderEval;
    if(!dep||!ev||ev.status!=='ok'||state.builder.length<2)return;
    if(dep.querySelector('.p1-corr-shell'))return;
    const naive=state.builder.reduce((a,l)=>a*(num(l.probability)||1),1),joint=num(ev.joint_probability),delta=joint==null?null:(joint-naive);
    const risk=corrRisk(ev),pairs=ev.pair_details||[];
    dep.innerHTML='';
    const shell=document.createElement('div');shell.className='p1-corr-shell';
    shell.innerHTML='<div class="p1-corr-hero"><div class="p1-corr-risk '+risk.level.toLowerCase()+'"><span>Correlation risk</span><strong>'+risk.level+'</strong></div>'+
      '<div class="p1-corr-metric"><span>Independent P</span><strong>'+pct(naive)+'</strong><small>Simple multiplication</small></div>'+
      '<div class="p1-corr-metric"><span>Adjusted P</span><strong>'+pct(joint)+'</strong><small>Dependency-adjusted</small></div>'+
      '<div class="p1-corr-metric"><span>Adjustment</span><strong>'+(delta==null?'—':(delta>=0?'+':'')+(delta*100).toFixed(1)+' pp')+'</strong><small>Factor ×'+(num(ev.dependency_factor)??1).toFixed(3)+'</small></div></div>'+
      (pairs.length?'<div class="p1-corr-pairs">'+pairs.map(x=>{const d=pairDirection(x.factor);return '<div class="p1-corr-pair"><div><strong>'+esc(x.player_a)+' '+esc(mk(x.market_a))+' ↔ '+esc(x.player_b)+' '+esc(mk(x.market_b))+'</strong><span>'+d.strength+' dependency · n='+(x.sample_size??'fallback')+'</span></div><div class="p1-corr-direction '+d.cls+'">'+d.text+'</div><div class="p1-corr-factor">×'+(num(x.factor)??1).toFixed(3)+'</div></div>'}).join('')+'</div>':'')+
      '<div class="p1-corr-method '+(risk.proxy?'warn':'')+'">'+(risk.proxy?'Custom / match-market legs are using the existing proxy dependency method. Treat the adjusted probability as an estimate until an empirical pair is available.':pairs.length?'Pair factors come from the existing empirical dependency evaluator. Factor > 1 lifts both-hit probability versus independence; factor < 1 reduces it.':'No material empirical pair dependency was returned; the combination is being treated close to independent.')+'</div>';
    dep.appendChild(shell);
  }

  function enhanceSystemMultiCorrelation(){
    $$q('#multiCards .multi-card').forEach(card=>{
      if(card.dataset.p1Corr)return;
      const metric=[...card.querySelectorAll('.metric')].find(x=>x.textContent.includes('Corr.'));
      const factor=num(metric?.querySelector('b')?.textContent);
      if(factor==null)return;
      const dev=Math.abs(factor-1),level=dev>=.08?'HIGH':dev>=.035?'MEDIUM':'LOW';
      const badge=document.createElement('span');badge.className='p1-corr-badge '+level.toLowerCase();badge.textContent='CORR RISK '+level;badge.title='Aggregate correlation/dependency factor ×'+factor.toFixed(3);
      card.querySelector('.multi-top')?.appendChild(badge);card.dataset.p1Corr='1';
    });
  }

  function afterView(){
    if(state.view==='tactics')renderP1Tactics();
    if(state.view==='players')enhancePlayerExplanations();
    if(state.view==='multi-lab')enhanceBuilderCorrelation();
    if(state.view==='system-multi')enhanceSystemMultiCorrelation();
  }
  function wrap(name,fn){
    const base=window[name];if(typeof base!=='function')return;
    window[name]=function(){const out=base.apply(this,arguments);try{fn()}catch(e){console.warn(P1,name,e)}return out};
  }
  wrap('renderTactics',renderP1Tactics);
  wrap('renderPlayers',enhancePlayerExplanations);
  wrap('renderBuilder',enhanceBuilderCorrelation);
  wrap('renderMultis',enhanceSystemMultiCorrelation);

  document.addEventListener('click',e=>{
    const v=e.target.closest?.('[data-view]')?.dataset.view||e.target.closest?.('[data-mobile-view]')?.dataset.mobileView||e.target.closest?.('[data-go]')?.dataset.go;
    if(v)setTimeout(afterView,0);
  });
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)afterView()});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(afterView,0),{once:true});else setTimeout(afterView,0);
})();