const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const root=process.argv[2]||'site',app=fs.readFileSync(root+'/app.js','utf8');
const read=p=>JSON.parse(fs.readFileSync(root+'/'+p));
const study=read('data/study.json'),history=read('data/exceedance-history.json');
assert.deepEqual(history.rate_years,Array.from({length:45},(_,i)=>1970+i));
assert.equal(history.data_version,study.version);assert.equal(Object.keys(history.basins).length,426);
const render=app.slice(app.indexOf('function renderRates('),app.indexOf('function sampleWindow('));
let config,lines,nodes,tooltip;
const context={study,basinColors:{nolev:'#0072b2',wtlev:'#d55e00',target:'#3f3f3f'},chart:(id,c)=>{config=c;return {svg:{},x:x=>x,y:y=>y,top:28,bottom:45,height:320};},
 add:(parent,name,attrs,text)=>{const n={name,attrs,text,events:{},addEventListener(type,fn){this.events[type]=fn;}};nodes.push(n);return n;},
 line:(p,xs,ys,color,extra)=>lines.push({xs,ys,color,extra}),band:()=>{},vertical:()=>{},
 tip:(e,t)=>{tooltip=t;},hideTip:()=>{}};
vm.createContext(context);vm.runInContext(render,context);
for(const basin of study.basins){
 const d=read('data/basins/'+basin.basin_id+'.json'),before=JSON.stringify(d);
 context.d=d;context.b=basin;context.h=history;lines=[];nodes=[];
 vm.runInContext('renderRates(d,b,h)',context);
 assert.equal(config.xmin,1970);assert.equal(config.xmax,2100);assert(config.yLabel.includes('(%)'));
 assert.equal(lines.length,2);assert.equal(nodes.filter(n=>n.name==='circle').length,244);
 for(const [i,state] of ['nolev','wtlev'].entries()){
  assert.equal(lines[i].xs.length,122);assert.equal(lines[i].xs[0],1970);assert.equal(lines[i].xs.at(-1),2091);
  assert.deepEqual(Array.from(lines[i].ys.slice(45)),d[state].rates.map(v=>100*v));
  for(const [j,v] of history.basins[basin.basin_id][state].entries()){
   assert(Number.isFinite(v)&&v>=0&&v<=1);assert(Math.abs(v*110-Math.round(v*110))<.000006);
   assert.equal(lines[i].ys[j],v*100);
  }
 }
 assert.equal(JSON.stringify(d),before);
 if(basin.basin_id===118){
  const points=nodes.filter(n=>n.name==='circle');
  points[0].events.pointermove({});assert(tooltip.includes('1970–1979')&&tooltip.includes('Historical window; context only'));
  points[36].events.pointermove({});assert(tooltip.includes('2006–2015')&&tooltip.includes('boundary-spanning'));
  points[45].events.pointermove({});assert(tooltip.includes('2015–2024')&&tooltip.includes('eligible for ToE'));
 }
}
(async()=>{
 const loader=app.slice(app.indexOf('let exceedanceHistoryPromise;'),app.indexOf('const fmt'));
 let calls=0,fail=true;
 const l={json:async()=>{calls++;if(fail)throw Error('simulated missing history');return history;}};
 vm.createContext(l);vm.runInContext(loader,l);
 await assert.rejects(vm.runInContext('loadExceedanceHistory()',l),/simulated/);
 fail=false;const [a,b]=await Promise.all([vm.runInContext('loadExceedanceHistory()',l),vm.runInContext('loadExceedanceHistory()',l)]);
 assert.equal(a,b);assert.equal(calls,2);
 // A stale historical fetch must not overwrite the newer basin selection.
 const detail=app.slice(app.indexOf('async function loadDetail('),app.indexOf('function renderRates('));
 let resolveHistory;const deferred=new Promise(resolve=>{resolveHistory=resolve;}),rendered=[];
 const elements={rateLoading:{textContent:''},rateChart:{replaceChildren(){}},sampleNo:{replaceChildren(){}},sampleWith:{replaceChildren(){}}};
 const r={$:id=>elements[id],detailToken:0,details:new Map([[118,{basin_id:118}],[19,{basin_id:19}]]),
  loadExceedanceHistory:()=>deferred,renderRates:d=>rendered.push(d.basin_id),renderSamples:()=>{}};
 vm.createContext(r);vm.runInContext(detail,r);
 const old=vm.runInContext('loadDetail({basin_id:118})',r),recent=vm.runInContext('loadDetail({basin_id:19})',r);
 resolveHistory(history);await Promise.all([old,recent]);
 assert.deepEqual(rendered,[19]);assert.equal(elements.rateLoading.textContent,'Basin 19 · 11 models');
 console.log('PASS: 426 full-period plots, percent conversion, unchanged future arrays, contextual historical/cross-boundary tooltips, retry/cache and stale-selection protection.');
})().catch(e=>{console.error(e);process.exitCode=1;});
