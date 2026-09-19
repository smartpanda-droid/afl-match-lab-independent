/* AFL Match Lab P0 Completion v65
   Completes the original P0 late-change/freshness/review scope.
   Weather is informational only and never mutates model probabilities. */
(function(){
  'use strict';
  const VERSION='P0 COMPLETE v65';
  const $c=s=>document.querySelector(s), $$c=s=>[...document.querySelectorAll(s)];
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:null};
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pct=v=>{const n=num(v);return n==null?'—':Math.round(n*100)+'%'};
  const matchNow=()=>state.matches?.find(x=>x.match_id===state.selected)||null;

  const VENUES=[
    {keys:['mcg','melbourne cricket ground'],lat:-37.81997,lon:144.98345},
    {keys:['marvel stadium','docklands'],lat:-37.8165,lon:144.9475},
    {keys:['gmhba','kardinia'],lat:-38.1582,lon:144.3547},
    {keys:['adelaide oval'],lat:-34.9154,lon:138.5960},
    {keys:['optus stadium','perth stadium'],lat:-31.9514,lon:115.8890},
    {keys:['gabba','brisbane cricket ground'],lat:-27.4858,lon:153.0381},
    {keys:['scg','sydney cricket ground'],lat:-33.8915,lon:151.2248},
    {keys:['engie stadium','giants stadium','showground stadium'],lat:-33.8432,lon:151.0679},
    {keys:['people first stadium','metricon','carrara'],lat:-28.0064,lon:153.3677},
    {keys:['utas stadium','york park'],lat:-41.4258,lon:147.1390},
    {keys:['blundstone arena','bellerive'],lat:-42.8773,lon:147.3730},
    {keys:['manuka oval'],lat:-35.3183,lon:149.1340},
    {keys:['tio stadium'],lat:-12.3992,lon:130.8870}
  ];

  const late={
    matchId:null,shadowRows:[],shadowFetchedAt:null,shadowError:null,lastObserved:null,
    browserDelta:null,weather:null,weatherDelta:null,weatherError:null,weatherFetchedAt:null
  };

  function age(ts,prefix=''){
    const t=typeof ts==='number'?ts:Date.parse(ts);
    if(!Number.isFinite(t))return prefix+'time unavailable';
    const mins=Math.max(0,Math.round((Date.now()-t)/60000));
    if(mins<1)return prefix+'now';
    if(mins<60)return prefix+mins+' min ago';
    const h=Math.round(mins/60);if(h<24)return prefix+h+'h ago';
    return prefix+Math.round(h/24)+'d ago';
  }
  function formatWhen(ts){
    const t=Date.parse(ts);if(!Number.isFinite(t))return '—';
    try{return new Intl.DateTimeFormat(undefined,{weekday:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(t))}
    catch{return new Date(t).toLocaleString()}
  }
  function sourceTimestamp(rows){
    const keys=['source_snapshot_at','source_updated_at','generated_at','calculated_at','synced_at','observed_at','frozen_at','updated_at','created_at'];
    const arr=Array.isArray(rows)?rows:[rows];let best=null;
    for(const obj of arr){
      if(!obj||typeof obj!=='object')continue;
      for(const k of keys){
        const t=Date.parse(obj[k]);if(Number.isFinite(t)&&(!best||t>best.t)){best={t,key:k,value:obj[k]};break}
      }
    }
    return best;
  }
  function moduleLoaded(name){
    const x=state.moduleStatus?.[name];if(!x||typeof x==='string')return {status:typeof x==='string'?x:'waiting',at:null};
    return {status:x.status||'waiting',at:num(x.at)};
  }
  function freshnessRow(name,module,rows,opts={}){
    const src=sourceTimestamp(rows),loaded=moduleLoaded(module);
    let cls='neutral',sourceText='Source time unavailable';
    if(loaded.status==='error')cls='bad';
    else if(loaded.status==='cache')cls='warn';
    else if(src){
      const maxAge=opts.maxAgeMs||12*3600000;
      cls=Date.now()-src.t>maxAge?'warn':'good';
      sourceText='Source '+age(src.t);
    }else if(loaded.status==='ok')cls='neutral';
    const loadText=loaded.at?'Loaded '+age(loaded.at):loaded.status==='loading'?'Loading now':loaded.status==='cache'?'Cached response':loaded.status==='error'?'Load error':'Not loaded';
    return {name,cls,sourceText,loadText,src,loaded};
  }

  function weatherVenue(name){
    const n=String(name||'').toLowerCase();
    return VENUES.find(v=>v.keys.some(k=>n.includes(k)))||null;
  }
  function weatherStoreKey(matchId){return 'afl:p0:weather:'+matchId}
  function weatherCompare(prev,cur){
    if(!prev||!cur)return null;
    const items=[];
    const diff=(a,b)=>num(b)-num(a);
    const rain=diff(prev.precipProbability,cur.precipProbability);
    const gust=diff(prev.windGust,cur.windGust);
    const wind=diff(prev.wind,cur.wind);
    const temp=diff(prev.temp,cur.temp);
    const precip=diff(prev.precip,cur.precip);
    if(Number.isFinite(rain)&&Math.abs(rain)>=20)items.push('Rain probability '+(rain>0?'+':'')+Math.round(rain)+' pp');
    if(Number.isFinite(gust)&&Math.abs(gust)>=10)items.push('Wind gust '+(gust>0?'+':'')+Math.round(gust)+' km/h');
    else if(Number.isFinite(wind)&&Math.abs(wind)>=8)items.push('Wind '+(wind>0?'+':'')+Math.round(wind)+' km/h');
    if(Number.isFinite(precip)&&Math.abs(precip)>=2)items.push('Hourly precipitation '+(precip>0?'+':'')+precip.toFixed(1)+' mm');
    if(Number.isFinite(temp)&&Math.abs(temp)>=5)items.push('Temperature '+(temp>0?'+':'')+Math.round(temp)+'°C');
    return items.length?{major:true,items}:null;
  }
  async function loadWeather(force=false){
    const m=matchNow();if(!m||!state.selected)return;
    if(late.matchId!==state.selected)resetForMatch();
    const venue=weatherVenue(m.venue);
    if(!venue){late.weather=null;late.weatherError='Venue coordinates unavailable';renderCompletion();return}
    const start=Date.parse(m.start_time);
    if(!Number.isFinite(start)){late.weather=null;late.weatherError='Match time unavailable';renderCompletion();return}
    const days=(start-Date.now())/86400000;
    if(days>16){late.weather=null;late.weatherError='Forecast not available beyond 16 days';renderCompletion();return}
    if(days<-1){late.weather=null;late.weatherError='Match weather window closed';renderCompletion();return}
    if(!force&&late.weatherFetchedAt&&Date.now()-late.weatherFetchedAt<15*60000)return;
    late.weatherError=null;
    try{
      const url='https://api.open-meteo.com/v1/forecast?latitude='+encodeURIComponent(venue.lat)+'&longitude='+encodeURIComponent(venue.lon)+
        '&hourly=temperature_2m,precipitation_probability,precipitation,wind_speed_10m,wind_gusts_10m&forecast_days=16&timeformat=unixtime&timezone=UTC';
      const res=await fetch(url,{headers:{Accept:'application/json'}});
      if(!res.ok)throw new Error('Weather HTTP '+res.status);
      const data=await res.json(),times=data?.hourly?.time||[];
      if(!times.length)throw new Error('Weather forecast empty');
      const target=start/1000;let idx=0,best=Infinity;
      times.forEach((t,i)=>{const d=Math.abs(Number(t)-target);if(d<best){best=d;idx=i}});
      const cur={
        matchId:state.selected,forecastTime:new Date(Number(times[idx])*1000).toISOString(),
        temp:num(data.hourly.temperature_2m?.[idx]),precipProbability:num(data.hourly.precipitation_probability?.[idx]),
        precip:num(data.hourly.precipitation?.[idx]),wind:num(data.hourly.wind_speed_10m?.[idx]),
        windGust:num(data.hourly.wind_gusts_10m?.[idx]),fetchedAt:Date.now(),venue:m.venue
      };
      let prev=null;try{prev=JSON.parse(localStorage.getItem(weatherStoreKey(state.selected))||'null')}catch{}
      late.weatherDelta=weatherCompare(prev,cur);late.weather=cur;late.weatherFetchedAt=Date.now();
      try{localStorage.setItem(weatherStoreKey(state.selected),JSON.stringify(cur))}catch{}
    }catch(e){late.weatherError=e?.message||String(e);late.weatherFetchedAt=Date.now()}
    renderCompletion();
  }

  function shadowMaterial(o){
    if(!o)return [];
    const out=[];
    if(o.lineup_changed)out.push('Lineup changed');
    if(o.injury_changed)out.push('Injury changed');
    if(o.prediction_changed)out.push('Model recalculated'+(o.changed_leg_count!=null?' · '+o.changed_leg_count+' leg(s)':''));
    if(o.multi_changed)out.push('Multi changed'+(o.changed_multi_count!=null?' · '+o.changed_multi_count+' combo(s)':''));
    if(o.stability_changed)out.push('Recommendation stability changed');
    return out;
  }
  async function pollShadow(initial=false){
    if(!state.selected)return;
    if(late.matchId!==state.selected)resetForMatch();
    const matchId=state.selected,id=encodeURIComponent(matchId);
    try{
      const rows=await api('/rest/v1/afl_api_shadow_observations?select=*&match_id=eq.'+id+'&order=sequence_no.asc',{},4500);
      if(state.selected!==matchId)return;
      late.shadowRows=rows||[];late.shadowFetchedAt=Date.now();late.shadowError=null;
      const latest=late.shadowRows.at(-1)||null,stamp=latest?.observed_at||latest?.source_snapshot_at||null;
      const isNew=!!stamp&&!!late.lastObserved&&stamp!==late.lastObserved;
      late.lastObserved=stamp||late.lastObserved;
      state.shadowObs=late.shadowRows;
      if(state.view==='shadow-live'&&typeof renderShadowLive==='function')renderShadowLive();
      if(!initial&&isNew&&shadowMaterial(latest).length&&typeof loadSelected==='function'){
        await loadSelected();
        if(state.selected===matchId)setTimeout(captureStableSnapshot,250);
      }
    }catch(e){late.shadowError=e?.message||String(e);late.shadowFetchedAt=Date.now()}
    renderCompletion();
  }

  function snapshotKey(matchId){return 'afl:p0:decision-snapshot:'+matchId}
  function buildSnapshot(){
    const m=matchNow(),q=state.matchQuote;if(!m||!q||!state.lineup?.length)return null;
    const mods=['lineup','quote','top'].map(x=>moduleLoaded(x));
    if(mods.some(x=>x.status==='loading'||x.status==='error'))return null;
    const lineup=(state.lineup||[]).map(x=>({
      id:String(x.player_id||x.player_name||''),name:x.player_name||'',team:x.team_name||'',
      bench:!!x.bench,emergency:!!x.emergency,pos:x.named_position||''
    })).sort((a,b)=>a.id.localeCompare(b.id));
    const injuries=[...new Set((state.topLegs||[]).filter(x=>x.active_injury).map(x=>String(x.player_id)))].sort();
    const top={};(state.topLegs||[]).slice(0,180).forEach(x=>{const p=num(x.model_probability);if(x.prediction_leg_id&&p!=null)top[String(x.prediction_leg_id)]={p,selection:x.selection||'',player:x.player_name||''}});
    const cur={matchId:state.selected,capturedAt:Date.now(),lineup,injuries,quote:{
      homeWin:num(q.home_win_probability),awayWin:num(q.away_win_probability),
      homeScore:num(q.predicted_home_score),awayScore:num(q.predicted_away_score),
      fairLine:num(q.fair_home_line),fairTotal:num(q.fair_total)
    },top};
    cur.fingerprint=JSON.stringify({lineup:cur.lineup,injuries:cur.injuries,quote:cur.quote,top:cur.top});
    return cur;
  }
  function compareSnapshots(prev,cur){
    if(!prev||!cur)return null;
    const items=[],major=[];
    const pm=new Map((prev.lineup||[]).map(x=>[x.id,x])),cm=new Map((cur.lineup||[]).map(x=>[x.id,x]));
    const added=[...cm.keys()].filter(k=>!pm.has(k)),removed=[...pm.keys()].filter(k=>!cm.has(k));
    if(added.length||removed.length){
      const text=(added.length?'In: '+added.map(k=>cm.get(k)?.name||k).slice(0,4).join(', '):'')+
        (added.length&&removed.length?' · ':'')+(removed.length?'Out: '+removed.map(k=>pm.get(k)?.name||k).slice(0,4).join(', '):'');
      items.push(['Lineup',text]);major.push('lineup');
    }
    const bench=[],role=[];
    for(const [k,n] of cm){const p=pm.get(k);if(!p)continue;if(p.bench!==n.bench)bench.push(n.name+' '+(n.bench?'→ bench':'→ field'));if(p.pos!==n.pos)role.push(n.name+' '+(p.pos||'—')+'→'+(n.pos||'—'))}
    if(bench.length){items.push(['Bench role',bench.slice(0,5).join(' · ')]);major.push('bench')}
    if(role.length)items.push(['Named position',role.slice(0,5).join(' · ')]);
    const pi=new Set(prev.injuries||[]),ci=new Set(cur.injuries||[]);
    const newInj=[...ci].filter(x=>!pi.has(x)),cleared=[...pi].filter(x=>!ci.has(x));
    if(newInj.length||cleared.length){items.push(['Injury flags',(newInj.length?'New '+newInj.length:'')+(newInj.length&&cleared.length?' · ':'')+(cleared.length?'Cleared '+cleared.length:'')]);major.push('injury')}
    const pp=num(prev.quote?.homeWin),cp=num(cur.quote?.homeWin);
    if(pp!=null&&cp!=null&&Math.abs(cp-pp)>=.005){
      const d=(cp-pp)*100;items.push(['Match win P','Home '+pct(pp)+' → '+pct(cp)+' ('+(d>=0?'+':'')+d.toFixed(1)+' pp)']);
      if(Math.abs(d)>=2)major.push('match-probability');
    }
    const ps=num(prev.quote?.homeScore),cs=num(cur.quote?.homeScore),pa=num(prev.quote?.awayScore),ca=num(cur.quote?.awayScore);
    if(ps!=null&&cs!=null&&pa!=null&&ca!=null&&((Math.abs(cs-ps)+Math.abs(ca-pa))>=2)){
      items.push(['Projected score',Math.round(ps)+'–'+Math.round(pa)+' → '+Math.round(cs)+'–'+Math.round(ca)]);
      if((Math.abs(cs-ps)+Math.abs(ca-pa))>=6)major.push('score');
    }
    const changed=[];
    for(const [id,x] of Object.entries(cur.top||{})){
      const p=prev.top?.[id];if(!p)continue;const d=(num(x.p)-num(p.p))*100;
      if(Number.isFinite(d)&&Math.abs(d)>=2)changed.push({d,txt:(x.player||x.selection||id)+' '+(d>=0?'+':'')+d.toFixed(1)+' pp'});
    }
    changed.sort((a,b)=>Math.abs(b.d)-Math.abs(a.d));
    if(changed.length){items.push(['Player probability',changed.slice(0,4).map(x=>x.txt).join(' · ')]);if(Math.abs(changed[0].d)>=5)major.push('player-probability')}
    return items.length?{items,major:[...new Set(major)],capturedAt:cur.capturedAt}:null;
  }
  function captureStableSnapshot(){
    const cur=buildSnapshot();if(!cur)return;
    let prev=null;try{prev=JSON.parse(localStorage.getItem(snapshotKey(cur.matchId))||'null')}catch{}
    if(prev?.fingerprint===cur.fingerprint)return;
    late.browserDelta=compareSnapshots(prev,cur);
    try{localStorage.setItem(snapshotKey(cur.matchId),JSON.stringify(cur))}catch{}
    renderCompletion();
  }

  function resetForMatch(){
    late.matchId=state.selected;late.shadowRows=[];late.shadowFetchedAt=null;late.shadowError=null;late.lastObserved=null;
    late.browserDelta=null;late.weather=null;late.weatherDelta=null;late.weatherError=null;late.weatherFetchedAt=null;
  }

  function ensureLateNode(){
    const band=$c('#matchdayDecisionBand');if(!band)return null;
    let node=$c('#p0cLateChange');
    if(!node){node=document.createElement('section');node.id='p0cLateChange';node.className='p0c-late-change';band.insertAdjacentElement('afterend',node)}
    return node;
  }
  function currentProbabilityText(){
    const m=matchNow(),q=state.matchQuote;if(!m||!q)return null;
    const hp=num(q.home_win_probability),ap=num(q.away_win_probability);if(hp==null||ap==null)return null;
    return (hp>=ap?m.home_team_name:m.away_team_name)+' '+pct(Math.max(hp,ap));
  }
  function renderLateChange(){
    const node=ensureLateNode();if(!node)return;
    const m=matchNow();if(!m){node.className='p0c-late-change';node.innerHTML='<div class="p0c-late-icon">↻</div><div class="p0c-late-main"><div class="p0c-late-head"><strong>LATE CHANGE MONITOR</strong><span>STANDBY</span></div><p>Waiting for a confirmed fixture.</p></div>';return}
    const latest=late.shadowRows.at(-1)||null,shadowItems=shadowMaterial(latest);
    const local=late.browserDelta,weather=late.weatherDelta;
    const majorLocal=local?.major?.length||0,hasMaterial=shadowItems.length||local?.items?.length||weather?.items?.length;
    const severe=!!(latest?.lineup_changed||latest?.injury_changed||local?.major?.includes('lineup')||local?.major?.includes('bench')||local?.major?.includes('injury'));
    const cls=severe?'bad':hasMaterial?'warn':latest?'good':'';
    const title=severe?'MAJOR LATE CHANGE':hasMaterial?'LATE UPDATE DETECTED':latest?'NO MAJOR LATE CHANGE':'LATE CHANGE MONITOR';
    const tag=latest?.phase==='t30_final'?'T-30 FINAL':latest?'BACKEND OBSERVED':'AWAITING OBSERVATION';
    const summary=[];
    if(shadowItems.length)summary.push(shadowItems.join(' · '));
    if(local?.items?.length)summary.push('Exact browser delta available');
    if(weather?.items?.length)summary.push('Weather forecast moved materially');
    if(!summary.length)summary.push(latest?'Latest recorded sync has no material change flags.':'No backend observation has been recorded yet.');
    const details=[];
    if(latest)details.push(['Workflow observation',(latest.observed_at?formatWhen(latest.observed_at)+' · ':'')+(shadowItems.join(' · ')||'No material change')]);
    if(local?.items?.length)local.items.forEach(x=>details.push(x));
    if(weather?.items?.length)details.push(['Weather change',weather.items.join(' · ')]);
    const prob=(latest?.prediction_changed||local?.major?.some(x=>x.includes('probability')))?currentProbabilityText():null;
    node.className='p0c-late-change '+cls;
    node.innerHTML='<div class="p0c-late-icon">'+(severe?'!':hasMaterial?'↻':'✓')+'</div>'+
      '<div class="p0c-late-main"><div class="p0c-late-head"><strong>'+esc(title)+'</strong><span>'+esc(tag)+'</span></div><p>'+esc(summary.join(' · '))+'</p></div>'+
      '<div class="p0c-late-meta"><span>'+(m.lineup_confirmed?'Lineup FINAL':m.used_fallback_lineup?'Lineup FALLBACK':'Lineup PENDING')+'</span><span>'+(state.finalLock?'Model LOCKED':'Model PREGAME')+'</span>'+(prob?'<span>Current '+esc(prob)+'</span>':'')+'</div>'+
      (details.length?'<details class="p0c-late-details"><summary>What changed / evidence</summary><div class="p0c-delta-grid">'+details.slice(0,10).map(x=>'<div class="p0c-delta-item"><strong>'+esc(x[0])+'</strong><span>'+esc(x[1])+'</span></div>').join('')+'</div></details>':'');
  }

  function weatherCard(){
    const w=late.weather;
    if(!w)return '<div class="p0c-weather-card"><div class="p0c-weather-head"><strong>Weather</strong><span>INFO ONLY · NOT IN MODEL</span></div><div class="p0c-weather-foot">'+esc(late.weatherError||'Loading forecast…')+'</div></div>';
    return '<div class="p0c-weather-card"><div class="p0c-weather-head"><strong>Weather · '+esc(w.venue||'Venue')+'</strong><span>INFO ONLY · NOT IN MODEL</span></div>'+
      '<div class="p0c-weather-grid">'+
      '<div class="p0c-weather-metric"><span>Temp</span><b>'+(w.temp==null?'—':Math.round(w.temp)+'°C')+'</b></div>'+
      '<div class="p0c-weather-metric"><span>Rain chance</span><b>'+(w.precipProbability==null?'—':Math.round(w.precipProbability)+'%')+'</b></div>'+
      '<div class="p0c-weather-metric"><span>Wind</span><b>'+(w.wind==null?'—':Math.round(w.wind)+' km/h')+'</b></div>'+
      '<div class="p0c-weather-metric"><span>Gust</span><b>'+(w.windGust==null?'—':Math.round(w.windGust)+' km/h')+'</b></div></div>'+
      '<div class="p0c-weather-foot">Forecast hour '+esc(formatWhen(w.forecastTime))+' · fetched '+esc(age(w.fetchedAt))+' · <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo</a></div></div>';
  }

  function renderAccurateFreshness(){
    const panel=$c('#p0FreshnessPanel');if(!panel)return;
    const rows=[
      freshnessRow('Lineup','lineup',state.lineup,{maxAgeMs:4*3600000}),
      freshnessRow('Player model','top',state.topLegs,{maxAgeMs:4*3600000}),
      freshnessRow('Match context','context',state.context,{maxAgeMs:12*3600000}),
      freshnessRow('Match quote','quote',state.matchQuote,{maxAgeMs:4*3600000})
    ];
    if(state.finalLock){
      const t=sourceTimestamp(state.finalLock);rows.push({name:'Final lock',cls:'good',sourceText:t?'Frozen '+age(t.t):'Frozen · source time unavailable',loadText:'Authoritative sealed recommendation'});
    }else rows.push({name:'Final lock',cls:'neutral',sourceText:'Not locked',loadText:'Pregame model remains mutable'});
    if(late.shadowRows.length){
      const t=sourceTimestamp(late.shadowRows);rows.push({name:'Late-change feed',cls:'good',sourceText:t?'Observation '+age(t.t):'Observation time unavailable',loadText:late.shadowFetchedAt?'Checked '+age(late.shadowFetchedAt):'Loaded'});
    }else rows.push({name:'Late-change feed',cls:late.shadowError?'warn':'neutral',sourceText:late.shadowError?'Unavailable':'No observation yet',loadText:late.shadowFetchedAt?'Checked '+age(late.shadowFetchedAt):'Checking'});
    if(late.weather){
      rows.push({name:'Weather',cls:'good',sourceText:'Forecast '+formatWhen(late.weather.forecastTime),loadText:'Fetched '+age(late.weather.fetchedAt)});
    }else rows.push({name:'Weather',cls:late.weatherError?'warn':'neutral',sourceText:late.weatherError||'Loading forecast',loadText:late.weatherFetchedAt?'Checked '+age(late.weatherFetchedAt):'Not loaded'});
    panel.classList.add('p0c-freshness-ready');
    panel.innerHTML='<div class="section-head"><div><div class="eyebrow">DATA FRESHNESS · SOURCE vs LOAD</div><h2>模块新鲜度</h2></div><span class="badge neutral">'+VERSION+'</span></div>'+
      '<div class="p0-freshness-list">'+rows.map(x=>'<div class="p0c-fresh-row"><span>'+esc(x.name)+'</span><div class="p0c-fresh-values"><strong class="'+esc(x.cls)+'">'+esc(x.sourceText)+'</strong><small>'+esc(x.loadText)+'</small></div></div>').join('')+'</div>'+
      '<div class="p0c-fresh-note">“Loaded” only means the browser successfully fetched a module. It is not treated as proof that the source data itself is fresh.</div>'+weatherCard();
  }

  function patchDecisionData(){
    const band=$c('#matchdayDecisionBand');if(!band)return;
    const kpis=[...band.querySelectorAll('.matchday-kpi')],data=kpis.find(x=>x.querySelector('span')?.textContent?.trim()==='Data');if(!data)return;
    const source=sourceTimestamp(state.finalLock)||sourceTimestamp(state.matchQuote);
    const loaded=state.finalLock?moduleLoaded('final'):moduleLoaded('quote');
    const strong=data.querySelector('strong'),small=data.querySelector('small');
    if(strong)strong.textContent=source?age(source.t):'SOURCE TIME N/A';
    if(small)small.textContent=(state.finalLock?'Final lock':'Match quote')+' · '+(loaded.at?'loaded '+age(loaded.at):'load time unavailable');
  }

  function renderReviewKpis(){
    const hero=$c('#reviewSummary .p0-review-hero');if(!hero||hero.querySelector('.p0c-review-kpis'))return;
    const r=state.reviewRows?.find(x=>x.match_id===state.reviewSelected),d=state.reviewDetail;if(!r||!d)return;
    const player=(d.legs||[]).filter(x=>x.player_id&&['hit','miss'].includes(x.result));
    const ph=player.filter(x=>x.result==='hit').length,pm=player.filter(x=>x.result==='miss').length,pr=ph+pm?ph/(ph+pm):null;
    const multis=(d.multis||[]).filter(x=>['hit','miss'].includes(x.result));
    const mh=multis.filter(x=>x.result==='hit').length,mm=multis.filter(x=>x.result==='miss').length,mr=mh+mm?mh/(mh+mm):null;
    const highMiss=[...player.filter(x=>x.result==='miss')].sort((a,b)=>(num(b.probability)||0)-(num(a.probability)||0))[0];
    const box=document.createElement('div');box.className='p0c-review-kpis';
    box.innerHTML='<div class="p0c-review-kpi"><span>Player markets</span><b>'+esc(pr==null?'—':pct(pr))+'</b><small>'+ph+' hit / '+(ph+pm)+' settled</small></div>'+
      '<div class="p0c-review-kpi"><span>System multis</span><b>'+esc(mr==null?'—':pct(mr))+'</b><small>'+mh+' hit / '+(mh+mm)+' settled</small></div>'+
      '<div class="p0c-review-kpi"><span>Highest-P miss</span><b>'+esc(highMiss?pct(highMiss.probability):'None')+'</b><small>'+esc(highMiss?.player_name||highMiss?.selection||'No settled player miss')+'</small></div>'+
      '<div class="p0c-review-kpi"><span>Learning set</span><b>'+esc(String(ph+pm))+'</b><small>Settled player legs only</small></div>';
    hero.appendChild(box);
  }

  function renderCompletion(){
    renderLateChange();renderAccurateFreshness();patchDecisionData();if(state.view==='reviews')renderReviewKpis();
  }
  function afterDataLoad(){setTimeout(()=>{captureStableSnapshot();renderCompletion();loadWeather(false)},250)}

  function wrap(name,after){
    const base=window[name];if(typeof base!=='function')return;
    window[name]=function(){
      const out=base.apply(this,arguments);
      if(out&&typeof out.then==='function')out.then(()=>{try{after()}catch(e){console.warn(VERSION,name,e)}}).catch(()=>{});
      else try{after()}catch(e){console.warn(VERSION,name,e)}
      return out;
    };
  }

  wrap('renderMatch',()=>setTimeout(renderCompletion,0));
  wrap('renderMatchPrediction',()=>setTimeout(()=>{patchDecisionData();renderLateChange()},0));
  wrap('renderReview',()=>setTimeout(renderReviewKpis,0));
  wrap('loadSelected',afterDataLoad);

  function init(){
    resetForMatch();
    setTimeout(()=>{renderCompletion();captureStableSnapshot();pollShadow(true);loadWeather(true)},700);
    setTimeout(()=>{captureStableSnapshot();renderCompletion()},3500);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden){renderCompletion();pollShadow(false);loadWeather(false);captureStableSnapshot()}});
    setInterval(()=>{if(!document.hidden){renderCompletion();captureStableSnapshot()}},30000);
    setInterval(()=>{if(!document.hidden&&state.selected)pollShadow(false)},60000);
    setInterval(()=>{if(!document.hidden&&state.selected)loadWeather(false)},15*60000);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();