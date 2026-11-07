const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const root=process.argv[2]||'site',app=fs.readFileSync(root+'/app.js','utf8');
const read=p=>JSON.parse(fs.readFileSync(root+'/'+p));
const study=read('data/study.json'),exposure=read('data/exposure.json');
const before=JSON.stringify({study,exposure});
const declarations=['scenarioColors','basinColors','toeColors','catColors'].map(name=>app.match(new RegExp('const '+name+' = ([^;]+);'))[0]).join('\n');
const maps=app.slice(app.indexOf('function detection('),app.indexOf('function renderMap('));
const c={study};vm.createContext(c);vm.runInContext(declarations+'\n'+maps,c);
assert.deepEqual(Array.from(vm.runInContext('[2015,2040,2041,2070,2071,2091,null].map(toeColor)',c)),['#d9827a','#d9827a','#e5b55f','#e5b55f','#f4e4a6','#f4e4a6','#ede8e0']);
for(const [lev,expected] of Object.entries({nolev:[219,70,39,98],wtlev:[123,56,43,97,107]})){
 c.lev=lev;
 const items=vm.runInContext('toeLegendItems(lev)',c);
 assert.deepEqual(Array.from(items,x=>Number(x[1].split(' · ')[1])),expected);
 const counts={};for(const b of study.basins){c.b=b;const color=vm.runInContext('toeMapColor(b,lev)',c);counts[color]=(counts[color]||0)+1;}
 assert.deepEqual(Array.from(items,x=>counts[x[0]]),expected);
}
for(const b of study.basins){c.b=b;const color=vm.runInContext("toeMapColor(b,'detection')",c);assert(color);if(b.toe_nolev!==null&&b.toe_wtlev===null)assert.equal(color,'#b7c9db');}
// Render each scenario with individual lines on/off: validate data and every semantic stroke.
let lines,nodes;
const elements={scenario:{value:'ssp585',selectedOptions:[{textContent:'SSP5-8.5'}]},individualModels:{checked:false},exposureLegend:{},modelCount:{}};
const ctx={exposure,$:id=>elements[id],swatch:(color,label)=>color+':'+label,chart:()=>({svg:{},x:x=>x,y:y=>y,top:28,bottom:45,left:65,right:22}),
 add:(svg,name,attrs,text)=>{const n={name,attrs,text,addEventListener(){}};nodes.push(n);return n;},line:(p,xs,ys,color,extra)=>lines.push({xs,ys,color,extra}),pathData:()=>'',vertical(){}};
vm.createContext(ctx);vm.runInContext(declarations+'\n'+app.slice(app.indexOf('function renderExposure('),app.indexOf('function geoPath(')),ctx);
for(const scenario of ['ssp585','ssp245','ssp126'])for(const show of [false,true]){
 elements.scenario.value=scenario;elements.individualModels.checked=show;lines=[];nodes=[];
 vm.runInContext('renderExposure()',ctx);
 const means=lines.filter(l=>l.extra['data-series']==='ensemble-mean');assert.equal(means.length,4);
 for(const l of lines){
  const period=l.extra['data-scenario'],lev=l.extra['data-protection'],v=exposure.series[period][lev],hist=exposure.series.historical[lev];
  ctx.period=period;assert.equal(l.color,vm.runInContext('scenarioColors[period]',ctx));
  assert.equal(l.extra['stroke-dasharray'],lev==='wtlev'?'7 4':'none');
  let ys=l.extra['data-series']==='model'?v.models[v.model_names.indexOf(l.extra['data-model'])]:v.mean;
  assert.deepEqual(Array.from(l.xs),period==='historical'?v.years:[2014,...v.years]);
  assert.deepEqual(Array.from(period==='historical'?l.ys:l.ys.slice(1)),ys);
  if(period!=='historical'){const i=hist.model_names.indexOf(l.extra['data-model']);assert.equal(l.ys[0],l.extra['data-series']==='model'?hist.models[i].at(-1):hist.mean.at(-1));}
 }
 assert.equal(lines.filter(l=>l.extra['data-series']==='model').length,show?2*(11+(scenario==='ssp126'?10:11)):0);
 assert(elements.exposureLegend.innerHTML.includes('Historical'));
}
assert.equal(JSON.stringify({study,exposure}),before);
console.log('PASS: exact manuscript palette, bin boundaries, all 426 map fills/counts, 3 scenarios × 2 model toggles, unchanged data and bridge points.');
