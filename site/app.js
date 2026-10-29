'use strict';
const $ = id => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';
const C = {nolev:'#267fa0',wtlev:'#bd6843',ink:'#233b43',teal:'#217b78'};
const categories = ['Advance warning','Surprise','Undetected surprise','Emergence without exceedance','Neither'];
const catColors = {'Advance warning':'#5d9e8c','Surprise':'#bd8d3d','Undetected surprise':'#bb6261','Emergence without exceedance':'#8065ab','Neither':'#c9d3d5'};
const catShort = {'Advance warning':'Advance warning','Surprise':'Surprise','Undetected surprise':'Undetected surprise','Emergence without exceedance':'Emergence only','Neither':'Neither'};
let study, exposure, geometries, land, basins, activeTab='overview', selected=118, detailToken=0, rasterToken=0;
const mapViews={toe:[0,14,1000,410],warning:[0,14,1000,410]};
let suppressMapClick=false;
const details = new Map();
const fmt = (v,n=0) => v === null || !Number.isFinite(v) ? 'Not detected' : v.toLocaleString('en-US',{maximumFractionDigits:n,minimumFractionDigits:n});
const year = v => v === null ? 'Not detected by 2100' : String(v);
const signed = v => v === null ? 'Not defined' : `${v>0?'+':''}${v} years`;
const el = (name,attrs={},text=null) => {const e=document.createElementNS(NS,name);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,String(v));if(text!==null)e.textContent=text;return e;};
function add(parent,name,attrs,text){const node=el(name,attrs,text);parent.append(node);return node;}
async function json(url){const r=await fetch(url);if(!r.ok)throw new Error(`${url}: HTTP ${r.status}`);return r.json();}
function metric(value,label,note){return `<div class="metric"><div class="metric-value">${value}</div><div class="metric-label">${label}</div><div class="metric-note">${note}</div></div>`;}
function swatch(color,label){return `<span><i class="swatch" style="background:${color}"></i>${label}</span>`;}
function table(id,headers,rows){$(id).innerHTML=`<thead><tr>${headers.map(h=>`<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map((v,i)=>i===0?`<th scope="row">${v}</th>`:`<td>${v}</td>`).join('')}</tr>`).join('')}</tbody>`;}
function tip(event,content){const t=$('tooltip');t.textContent=content;t.hidden=false;const x=Math.min(event.clientX+16,window.innerWidth-t.offsetWidth-12),y=Math.min(event.clientY+16,window.innerHeight-t.offsetHeight-12);t.style.left=Math.max(8,x)+'px';t.style.top=Math.max(8,y)+'px';}
function hideTip(){$('tooltip').hidden=true;}
function chart(id,{xmin,xmax,ymin=0,ymax=1,xticks,yticks,yLabel='',xLabel='',width=1040,height=320}){
  const svg=$(id);if(!svg.parentElement.classList.contains('chart-frame')){const frame=document.createElement('div');frame.className='chart-frame';frame.tabIndex=0;frame.setAttribute('role','region');frame.setAttribute('aria-label',svg.getAttribute('aria-label')+'; horizontally scrollable on small screens');svg.before(frame);frame.append(svg);}svg.replaceChildren();const left=65,right=22,top=28,bottom=45;
  const x=v=>left+(v-xmin)/(xmax-xmin)*(width-left-right),y=v=>height-bottom-(v-ymin)/(ymax-ymin)*(height-top-bottom);
  for(const v of yticks??Array.from({length:5},(_,i)=>ymin+(ymax-ymin)*i/4)){add(svg,'line',{x1:left,x2:width-right,y1:y(v),y2:y(v),class:'tick-line'});add(svg,'text',{x:left-12,y:y(v)+4,'text-anchor':'end'},fmt(v,Math.abs(ymax-ymin)<2?2:Math.abs(ymax-ymin)<20?1:0));}
  for(const v of xticks??[]){add(svg,'text',{x:x(v),y:height-20,'text-anchor':'middle'},v);}
  add(svg,'text',{x:left,y:14,class:'axis-title'},yLabel);
  add(svg,'text',{x:width-right,y:height-3,'text-anchor':'end',class:'axis-title'},xLabel);
  return {svg,x,y,left,right,top,bottom,width,height};
}
function pathData(xs,ys,x,y){let start=true;return xs.map((v,i)=>{if(ys[i]===null||!Number.isFinite(ys[i])){start=true;return '';}const point=`${start?'M':'L'}${x(v).toFixed(2)},${y(ys[i]).toFixed(2)}`;start=false;return point;}).join('');}
function line(p,xs,ys,color,extra={}){const node=add(p.svg,'path',{d:pathData(xs,ys,p.x,p.y),stroke:color,class:'main-line',...extra});if(extra['stroke-width'])node.style.strokeWidth=extra['stroke-width'];return node;}
function band(p,start,color){if(start!==null)add(p.svg,'rect',{x:p.x(start),y:p.top,width:p.x(Math.min(start+9,2100))-p.x(start),height:p.height-p.bottom-p.top,fill:color,opacity:.09});}
function vertical(p,v,color,label,offset=0){if(v===null)return;add(p.svg,'line',{x1:p.x(v),x2:p.x(v),y1:p.top,y2:p.height-p.bottom,stroke:color,'stroke-dasharray':'4 4','stroke-width':1});if(label)add(p.svg,'text',{x:p.x(v)+4,y:p.top+12+offset,style:`fill:${color};font-size:10px`},label);}

function renderExposure(){
  const sc=$('scenario').value,modelLines=$('individualModels').checked;
  const series=exposure.series;
  const ymax=Math.ceil(Math.max(...['historical',sc].flatMap(s=>['nolev','wtlev'].flatMap(l=>series[s][l].max)))/2)*2;
  const ymin=Math.max(0,Math.floor(Math.min(...['historical',sc].flatMap(s=>['nolev','wtlev'].flatMap(l=>series[s][l].min)))/2)*2-2);
  const p=chart('exposureChart',{xmin:1970,xmax:2100,ymin,ymax,xticks:[1970,1990,2015,2040,2060,2080,2100],yLabel:'Population exposed (%)',xLabel:'Year',height:350});
  add(p.svg,'rect',{x:p.x(1970),y:p.top,width:p.x(2015)-p.x(1970),height:350-p.top-p.bottom,fill:'#f0f5f6',opacity:.65});
  for(const lev of ['nolev','wtlev']){
    const historical=series.historical[lev],future=series[sc][lev];
    const years=[...historical.years,...future.years],low=[...historical.min,...future.min],high=[...historical.max,...future.max];
    const area=pathData(years,high,p.x,p.y)+pathData([...years].reverse(),[...low].reverse(),p.x,p.y).replace(/^M/,'L')+'Z';
    add(p.svg,'path',{d:area,fill:C[lev],opacity:.08,'data-series':'model-range','data-protection':lev});
    if(modelLines)for(const name of new Set([...historical.model_names,...future.model_names])){
      const before=historical.models[historical.model_names.indexOf(name)]??historical.years.map(()=>null);
      const after=future.models[future.model_names.indexOf(name)]??future.years.map(()=>null);
      line(p,years,[...before,...after],C[lev],{'stroke-width':.6,opacity:.18,'data-series':'model','data-model':name,'data-protection':lev});
    }
    line(p,years,[...historical.mean,...future.mean],C[lev],{'stroke-dasharray':lev==='wtlev'?'7 4':'none','data-series':'ensemble-mean','data-protection':lev});
  }
  vertical(p,2015,'#87948c');
  add(p.svg,'text',{x:p.x(1972),y:42},'Historical baseline');
  add(p.svg,'text',{x:p.x(2017),y:42},$('scenario').selectedOptions[0].textContent);
  const cursor=add(p.svg,'line',{x1:0,x2:0,y1:p.top,y2:305,stroke:'#233b43',opacity:0,'stroke-dasharray':'2 4'});
  const target=add(p.svg,'rect',{x:p.left,y:p.top,width:1040-p.left-p.right,height:350-p.top-p.bottom,fill:'transparent'});
  target.addEventListener('pointermove',event=>{
    const pt=p.svg.createSVGPoint();pt.x=event.clientX;pt.y=event.clientY;const local=pt.matrixTransform(p.svg.getScreenCTM().inverse());
    const yr=Math.max(1970,Math.min(2100,Math.round(1970+(local.x-p.left)/(1040-p.left-p.right)*130)));
    const s=yr<=2014?'historical':sc,v=series[s],i=v.nolev.years.indexOf(yr);
    cursor.setAttribute('x1',p.x(yr));cursor.setAttribute('x2',p.x(yr));cursor.setAttribute('opacity',.5);
    $('exposureReadout').textContent=`${yr} · No levees ${fmt(v.nolev.mean[i],2)}% · With levees ${fmt(v.wtlev.mean[i],2)}% · Difference ${fmt(v.nolev.mean[i]-v.wtlev.mean[i],2)} percentage points`;
  });
  target.addEventListener('pointerleave',()=>cursor.setAttribute('opacity',0));
  $('modelCount').textContent=`Historical: ${series.historical.nolev.model_names.length} models. ${$('scenario').selectedOptions[0].textContent}: ${series[sc].nolev.model_names.length} available models.${sc==='ssp126'?' GFDL-CM4 is absent from the source files for SSP1-2.6.':''} The basin analyses in Results 2–3 use all 11 models under SSP5-8.5.`;
}

function geoPath(geometry){
  if(!geometry)return '';
  const polys=geometry.type==='Polygon'?[geometry.coordinates]:geometry.type==='MultiPolygon'?geometry.coordinates:[];
  return polys.flatMap(poly=>poly.map(ring=>{
    let prev=null;
    return ring.map(([lon,lat],i)=>{const jump=prev!==null&&Math.abs(lon-prev)>180;prev=lon;return `${i===0||jump?'M':'L'}${((lon+180)*1000/360).toFixed(2)},${((90-lat)*500/180).toFixed(2)}`;}).join('')+'Z';
  })).join('');
}
function renderDomain(){
  const svg=$('domainMap');if(!svg)return;svg.replaceChildren();
  add(svg,'title',{},'Geographic coverage of the 426 major-river sub-basins');
  for(const f of land.features)add(svg,'path',{d:geoPath(f.geometry),class:'domain-land'});
  for(const f of geometries.features)add(svg,'path',{d:geoPath(f.geometry),class:'domain-basin'});
}
function drawLand(svg){for(const f of land.features)add(svg,'path',{d:geoPath(f.geometry),class:'land-path'});}
function detection(b){if(b.toe_nolev!==null&&b.toe_wtlev!==null)return 'Both detected';if(b.toe_nolev!==null)return 'Levee-masked';if(b.toe_wtlev!==null)return 'With-levee only';return 'Neither detected';}
const detectColors={'Both detected':'#5d9e8c','Levee-masked':'#bb6261','With-levee only':'#8065ab','Neither detected':'#c9d3d5'};
function toeColor(value){if(value===null)return '#c9d3d5';const stops=['#e0f4f3','#a8dfd6','#6ccbbf','#42a9b1','#3e81a4','#526b9c'];return stops[Math.min(5,Math.floor((value-2015)/15))];}
function mapColor(b,kind){const lev=$(kind==='toe'?'toeLayer':'warningLayer').value;return kind==='toe'?(lev==='detection'?detectColors[detection(b)]:toeColor(b['toe_'+lev])):catColors[b['category_'+lev]];}
function renderMap(kind){
  const svg=$(kind==='toe'?'toeMap':'warningMap');svg.replaceChildren();svg.setAttribute('viewBox',mapViews[kind].join(' '));drawLand(svg);
  for(const lat of [-60,-30,0,30,60])add(svg,'line',{x1:0,x2:1000,y1:(90-lat)*500/180,y2:(90-lat)*500/180,stroke:'#dce7e9','stroke-width':.4,'stroke-dasharray':'3 5'});
  for(const f of geometries.features){
    const id=f.properties.basin_id,b=basins.get(id);if(!b)continue;
    const path=add(svg,'path',{d:geoPath(f.geometry),fill:mapColor(b,kind),class:'basin-path'+(id===selected?' selected':''),'data-basin':id,tabindex:id===selected?0:-1,role:'button','aria-label':`Basin ${id}; ${kind==='toe'?detection(b):b['category_'+$('warningLayer').value]}`});
    add(path,'title',{},`Basin ${id}`);
    path.addEventListener('click',()=>{if(!suppressMapClick)selectBasin(id);});
    path.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();selectBasin(id);}});
    path.addEventListener('pointermove',e=>tip(e,`Basin ${id} · ${fmt(b.area_km2)} km²\nNo-levee ToE: ${year(b.toe_nolev)}\nWith-levee ToE: ${year(b.toe_wtlev)}\nShared RET: ${year(b.ret)}\n${kind==='toe'?detection(b):b['category_'+$('warningLayer').value]}`));
    path.addEventListener('pointerleave',hideTip);
  }
  const feature=geometries.features.find(f=>f.properties.basin_id===selected);
  if(feature){const {label_lon, label_lat}=feature.properties;const cx=(label_lon+180)*1000/360,cy=(90-label_lat)*500/180;add(svg,'circle',{cx,cy,r:5,fill:'none',stroke:'#233b43','stroke-width':1.4,'pointer-events':'none'});add(svg,'circle',{cx,cy,r:1.5,fill:'#233b43','pointer-events':'none'});}
  if(kind==='toe')$('toeLegend').innerHTML=$('toeLayer').value==='detection'?Object.entries(detectColors).map(([k,v])=>swatch(v,k)).join(''):[2015,2030,2045,2060,2075,2090].map(v=>swatch(toeColor(v),String(v))).join('')+swatch('#c9d3d5','Not detected by 2100');
  else $('warningLegend').innerHTML=categories.map(k=>swatch(catColors[k],`${catShort[k]} · ${study.summary[$('warningLayer').value].categories[k]}`)).join('');
}
function basinStat(label,value,note,color){return `<div class="basin-stat" style="border-color:${color}"><span>${label}</span><strong>${value}</strong><small>${note}</small></div>`;}
function openBasinDetail(){
  const id=activeTab==='emergence'?'toeDrilldown':activeTab==='warning'?'warningDrilldown':null;
  if(id)$(id).open=true;
}
function selectBasin(id,updateURL=true){
  if(!basins.has(Number(id)))return;
  selected=Number(id);const b=basins.get(selected);
  for(const prefix of ['toe','warning']){$(prefix+'Basin').value=String(id);$(prefix+'BasinMeta').textContent=`Basin ${id} · ${fmt(b.area_km2)} km² · Median protection ${fmt(b.levee_standard_median,1)} years`;}
  $('toeDetails').innerHTML=basinStat('NO-LEVEE ToE',b.toe_nolev??'Not detected','First qualifying window start',C.nolev)+basinStat('WITH-LEVEE ToE',b.toe_wtlev??'Not detected','First qualifying window start',C.wtlev)+basinStat('PAIRED TIMING SHIFT',b.toe_nolev!==null&&b.toe_wtlev!==null?signed(b.toe_wtlev-b.toe_nolev):'Not defined',detection(b),'#8065ab');
  $('warningDetails').innerHTML=basinStat('SHARED PROTECTED-SYSTEM RET',b.ret??'Not detected','Same RET in both comparisons',C.ink)+basinStat('LEAD FROM NO-LEVEE ToE',signed(b.lead_nolev),b.category_nolev,C.nolev)+basinStat('LEAD FROM WITH-LEVEE ToE',signed(b.lead_wtlev),b.category_wtlev,C.wtlev);
  if(updateURL){history.replaceState(null,'',`#${activeTab}?basin=${selected}&view=basin`);openBasinDetail();}
  for(const prefix of ['toe','warning'])$(prefix+'DrilldownTitle').textContent=`Explore basin ${selected}`;
  renderMap('toe');renderMap('warning');renderTimeline(b);loadDetail(b);
}
async function loadDetail(b){
  const token=++detailToken;$('rateLoading').textContent=`Loading basin ${b.basin_id}…`;$('rateChart').replaceChildren();
  if($('sampleNo'))$('sampleNo').replaceChildren();if($('sampleWith'))$('sampleWith').replaceChildren();
  try{if(!details.has(b.basin_id))details.set(b.basin_id,await json(`data/basins/${b.basin_id}.json`));if(token!==detailToken)return;
    const d=details.get(b.basin_id);renderRates(d,b);renderSamples(d,b);$('rateLoading').textContent=`Basin ${b.basin_id} · 11 models`;
  }catch(e){if(token===detailToken)$('rateLoading').textContent=`Could not load basin data. Select a basin to retry. ${e.message}`;}
}
function renderRates(d,b){
  const p=chart('rateChart',{xmin:2015,xmax:2100,ymax:Math.min(1,Math.max(.2,...d.nolev.rates,...d.wtlev.rates)*1.12),xticks:[2015,2030,2050,2070,2090,2100],yLabel:'Exceedance frequency',xLabel:'10-year window start'});
  for(const lev of ['nolev','wtlev'])band(p,b['toe_'+lev],C[lev]);
  for(const [v,color,dash] of [[d.hist_rate,'#9eaeb1','3 5'],[d.detection_rate,'#8065ab','4 4']])add(p.svg,'line',{x1:p.x(2015),x2:p.x(2100),y1:p.y(v),y2:p.y(v),stroke:color,'stroke-dasharray':dash});
  add(p.svg,'text',{x:p.x(2099),y:p.y(d.detection_rate)-6,'text-anchor':'end',style:'fill:#8065ab'},`Target ${d.detection_rate.toFixed(3)}`);
  for(const lev of ['nolev','wtlev']){
    line(p,d.rate_years,d[lev].rates,C[lev],{'stroke-dasharray':lev==='wtlev'?'6 4':'none'});
    d.rate_years.forEach((yr,i)=>{const point=add(p.svg,'circle',{cx:p.x(yr),cy:p.y(d[lev].rates[i]),r:4,fill:C[lev],opacity:0});point.addEventListener('pointermove',e=>tip(e,`${lev==='nolev'?'No levees':'With levees'} · ${yr}–${yr+9}\nExceedance frequency: ${d[lev].rates[i].toFixed(3)}\nDetection target: ${d.detection_rate.toFixed(3)}`));point.addEventListener('pointerleave',hideTip);});
    vertical(p,b['toe_'+lev],C[lev],b['toe_'+lev]!==null?`${lev==='nolev'?'No':'With'}-levee ToE ${b['toe_'+lev]}`:'',lev==='wtlev'?14:0);
  }
}
function sampleWindow(p,start,kind,color,labelRow=0){
  if(start===null)return null;
  const end=Math.min(start+9,2100),x=p.x(start),width=p.x(end)-x,height=p.height-p.bottom-p.top;
  const g=add(p.svg,'g',{'data-window':kind,'data-start':start,'data-end':end});
  add(g,'title',{},`${kind} window: ${start}–${end}`);
  add(g,'rect',{x,y:p.top,width,height,fill:color,opacity:kind==='RET'?.06:.12});
  if(kind==='RET'){
    const id=`${p.svg.id}-ret-hatch`,pattern=add(add(g,'defs'),'pattern',{id,width:6,height:6,patternUnits:'userSpaceOnUse'});
    add(pattern,'path',{d:'M-1,1L1,-1M0,6L6,0M5,7L7,5',stroke:color,'stroke-width':1,opacity:.4});
    add(g,'rect',{x,y:p.top,width,height,fill:`url(#${id})`});
  }
  add(g,'line',{x1:x,x2:x,y1:p.top,y2:p.height-p.bottom,stroke:color,'stroke-width':1,'stroke-dasharray':kind==='RET'?'2 3':'5 3'});
  const nearRight=x>p.width-p.right-75;
  return el('text',{x:x+(nearRight?-4:4),y:p.top+12+labelRow*15,'text-anchor':nearRight?'end':'start',style:`fill:${color};font-size:10px;font-weight:600;paint-order:stroke;stroke:#ffffff;stroke-width:3px;stroke-linejoin:round`},`${kind} ${start}`);
}
function sampleWindowKey(kind,start,color,hatched=false){
  const label=start===null?`${kind}: not detected by 2100`:`${kind} window · ${start}–${Math.min(start+9,2100)}`;
  return `<span><i aria-hidden="true" class="window-swatch${hatched?' hatched':''}${start===null?' not-detected':''}" style="--window-color:${color}"></i>${label}</span>`;
}
function renderSamples(d,b){
  if(!$('sampleNo')){
    const container=document.createElement('div');container.className='two-col';container.innerHTML='<article class="card"><h3>No-levee flooded-area samples</h3><svg id="sampleNo" class="chart" viewBox="0 0 500 300" role="img" aria-label="No-levee model-year flooded areas" aria-describedby="sampleNoLegend"></svg><div id="sampleNoLegend" class="legend sample-window-legend" aria-label="No-levee detection window"></div><p class="note">Dots: model-years; line: ensemble median. Dashed line: common historical P95; dotted line: historical no-levee maximum. Blue shading marks the 10-year ToE window. Zero inundation is retained; no missing samples in the corrected series.</p></article><article class="card"><h3>With-levee flooded-area samples</h3><svg id="sampleWith" class="chart" viewBox="0 0 500 300" role="img" aria-label="With-levee model-year flooded areas" aria-describedby="sampleWithLegend"></svg><div id="sampleWithLegend" class="legend sample-window-legend" aria-label="With-levee detection windows"></div><p class="note">Orange shading: 10-year ToE window. Purple hatching: shared 10-year RET window. Red dots exceed the historical no-levee maximum; RET requires at least two models within its window. Line: ensemble median. Dashed / dotted lines: historical P95 / maximum.</p></article>';
    $('sampleCharts').append(container);
  }
  const ymax=Math.max(...d.nolev.samples_km2.flat().filter(v=>v!==null),...d.wtlev.samples_km2.flat().filter(v=>v!==null))*1.08;
  for(const lev of ['nolev','wtlev']){
    const p=chart(lev==='nolev'?'sampleNo':'sampleWith',{xmin:1970,xmax:2100,ymax,xticks:[1970,2015,2050,2100],width:500,height:300,yLabel:'Flooded area (km²)',xLabel:'Year'});
    const labels=[sampleWindow(p,b['toe_'+lev],'ToE',C[lev])];
    if(lev==='wtlev')labels.push(sampleWindow(p,b.ret,'RET','#8065ab',1));
    $(lev==='nolev'?'sampleNoLegend':'sampleWithLegend').innerHTML=sampleWindowKey('ToE',b['toe_'+lev],C[lev])+(lev==='wtlev'?sampleWindowKey('RET',b.ret,'#8065ab',true):'');
    d[lev].samples_km2.forEach((model,mi)=>model.forEach((value,i)=>{if(value===null)return;const record=lev==='wtlev'&&d.years[i]>=2015&&value>d.historical_max_km2;const point=add(p.svg,'circle',{cx:p.x(d.years[i]),cy:p.y(value),r:record?1.9:1.1,fill:record?'#bb6261':value>d.p95_km2?C[lev]:'#8e9ea4',opacity:record?.8:.3});add(point,'title',{},`${study.models[mi]}, ${d.years[i]}: ${fmt(value,2)} km²`);}));
    line(p,d.years,d[lev].median_km2,C[lev],{'stroke-width':1.5});
    for(const [value,color,dash] of [[d.p95_km2,'#bf9564','5 4'],[d.historical_max_km2,'#77888e','2 3']])add(p.svg,'line',{x1:p.x(1970),x2:p.x(2100),y1:p.y(value),y2:p.y(value),stroke:color,'stroke-width':.8,'stroke-dasharray':dash});
    vertical(p,2015,'#8c988f');
    for(const label of labels)if(label)p.svg.append(label);
  }
}
function renderTimeline(b){
  $('timelineTitle').textContent=`Basin ${b.basin_id} · one record-exceedance time, two warning sequences`;
  const p=chart('timeline',{xmin:2015,xmax:2100,ymax:1,xticks:[2015,2030,2050,2070,2090,2100],yticks:[],height:240,xLabel:'Window start year'});
  for(const [lev,yy] of [['nolev',85],['wtlev',145]]){
    add(p.svg,'line',{x1:p.x(2015),x2:p.x(2100),y1:yy,y2:yy,stroke:'#e1e9eb','stroke-width':3});
    const toe=b['toe_'+lev];
    if(toe!==null&&b.ret!==null){const lo=Math.min(toe,b.ret),hi=Math.max(toe,b.ret);add(p.svg,'line',{x1:p.x(lo),x2:p.x(hi),y1:yy,y2:yy,stroke:C[lev],'stroke-width':7,opacity:.45});}
    add(p.svg,'text',{x:p.left,y:yy-20,style:`fill:${C[lev]}`},`${lev==='nolev'?'No-levee':'With-levee'} ToE ${toe===null?'not detected':toe} · lead ${signed(b['lead_'+lev])}`);
    if(toe!==null)add(p.svg,'circle',{cx:p.x(toe),cy:yy,r:6,fill:C[lev],stroke:'white','stroke-width':2});
  }
  if(b.ret!==null){add(p.svg,'line',{x1:p.x(b.ret),x2:p.x(b.ret),y1:35,y2:165,stroke:'#bb6261','stroke-width':2,'stroke-dasharray':'4 3'});add(p.svg,'text',{x:Math.min(880,p.x(b.ret)+7),y:27,style:'fill:#bb6261'},`Shared RET ${b.ret}`);}
  else add(p.svg,'text',{x:p.left,y:27},'Shared RET not detected by 2100');
}
function renderLead(){
  const common=study.basins.filter(b=>b.lead_nolev!==null&&b.lead_wtlev!==null);
  const values=common.flatMap(b=>[b.lead_nolev,b.lead_wtlev]).filter(v=>v!==null);
  const xmin=Math.floor(Math.min(...values)/20)*20,xmax=Math.ceil(Math.max(...values)/20)*20;
  const p=chart('leadChart',{xmin,xmax,ymax:100,xticks:Array.from({length:(xmax-xmin)/20+1},(_,i)=>xmin+i*20),width:500,height:320,yLabel:'Cumulative share (%)',xLabel:'Warning lead (years)'});
  add(p.svg,'rect',{x:p.x(xmin),y:p.top,width:p.x(0)-p.x(xmin),height:320-p.top-p.bottom,fill:'#bb6261',opacity:.045});vertical(p,0,'#a5afa7');
  for(const lev of ['nolev','wtlev']){const v=common.map(b=>b['lead_'+lev]).filter(v=>v!==null).sort((a,b)=>a-b);let points=`M${p.x(xmin)},${p.y(0)}`;v.forEach((value,i)=>points+=`H${p.x(value)}V${p.y((i+1)/v.length*100)}`);points+=`H${p.x(xmax)}`;add(p.svg,'path',{d:points,stroke:C[lev],class:'main-line','stroke-dasharray':lev==='wtlev'?'6 4':'none'});}
}
function renderTables(){
  const scenarioNames={historical:'Historical',ssp126:'SSP1-2.6',ssp245:'SSP2-4.5',ssp585:'SSP5-8.5'};
  table('periodTable',['Period / scenario','No levees','With levees','Difference'],Object.entries(exposure.periods).map(([s,v])=>[scenarioNames[s],fmt(v.nolev,2)+'%',fmt(v.wtlev,2)+'%',fmt(v.nolev-v.wtlev,2)+' pp']));
  table('protectionTable',['Standard','Basins','No-levee detected','With-levee detected','Masked','Paired mean shift'],study.protection_classes.map(v=>[`${v.protection_class}<br><small>${v.protection_range}</small>`,v.basins_total,`${v.nolevee_detected} / ${v.basins_total}`,`${v.withlevee_detected} / ${v.basins_total}`,v.masked_from_nolevee_detected,`${fmt(v.paired_mean_shift_years,1)} years (n=${v.both_detected})`]));
  table('categoryTable',['Class','No-levee ToE','With-levee ToE'],categories.map(c=>[swatch(catColors[c],catShort[c]),...['nolev','wtlev'].map(l=>`${study.summary[l].categories[c]} <small>(${fmt(study.summary[l].categories[c]/426*100,1)}%)</small>`)]));
  const transitions=new Map(study.transitions.map(v=>[v.category_nolev+'|'+v.category_wtlev,v.count]));
  table('transitionTable',['From ↓ / To →',...categories.map(c=>catShort[c]),'Total'],categories.map(a=>[catShort[a],...categories.map(b=>{const n=transitions.get(a+'|'+b)??0;return `<span style="display:block;padding:5px;background:rgba(38,127,160,${n?Math.max(.06,n/180*.35):0});border-radius:3px">${n||'—'}</span>`;}),study.summary.nolev.categories[a]]));
}
function activate(){
  const [tab,query='']=location.hash.slice(1).split('?');activeTab=['overview','exposure','emergence','warning','historical'].includes(tab)?tab:'overview';
  document.body.dataset.page=activeTab;
  document.querySelectorAll('.page').forEach(p=>p.hidden=p.id!==activeTab);
  document.querySelectorAll('[data-tab]').forEach(a=>{const current=a.dataset.tab===activeTab;a.classList.toggle('active',current);if(current)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
  const basinParam=new URLSearchParams(query).get('basin'),requested=Number(basinParam);if(requested&&basins.has(requested)&&requested!==selected)selectBasin(requested,false);
  if(new URLSearchParams(query).get('view')==='basin')openBasinDetail();
  if(activeTab==='historical')initRaster();
  hideTip();
}
function downloadText(name,text,type='text/plain'){
  const blob=new Blob([text],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function installExplorerTools(){
  for(const kind of ['toe','warning']){
    const svg=$(kind==='toe'?'toeMap':'warningMap');
    const toolbar=document.createElement('div');toolbar.className='map-toolbar';
    toolbar.innerHTML=`<form class="basin-search"><label for="${kind}Search">Find basin ID</label><input id="${kind}Search" inputmode="numeric" pattern="[0-9]+" placeholder="e.g. 118" aria-label="Find basin ID" required><button type="submit">Locate →</button><span class="search-status" role="status"></span></form><div class="map-actions"><button type="button" data-zoom="in" aria-label="Zoom in map">+</button><button type="button" data-zoom="out" aria-label="Zoom out map">−</button><button type="button" data-zoom="reset">Reset map</button></div>`;
    svg.before(toolbar);
    toolbar.querySelector('form').addEventListener('submit',e=>{e.preventDefault();const id=Number($(kind+'Search').value),status=toolbar.querySelector('.search-status');if(!basins.has(id)){status.textContent=`Basin ${id} is outside the 426-basin analysis domain.`;return;}status.textContent=`Basin ${id} selected`;selectBasin(id);const f=geometries.features.find(f=>f.properties.basin_id===id);const x=(f.properties.label_lon+180)*1000/360,y=(90-f.properties.label_lat)*500/180;mapViews[kind]=[Math.max(0,Math.min(600,x-200)),Math.max(0,Math.min(282,y-94)),400,188];renderMap(kind);});
    toolbar.querySelectorAll('[data-zoom]').forEach(button=>button.addEventListener('click',()=>{
      const action=button.dataset.zoom;if(action==='reset')mapViews[kind]=[0,14,1000,410];else{const [x,y,w,h]=mapViews[kind],nw=Math.max(125,Math.min(1000,w*(action==='in'?.65:1/.65))),nh=nw*.41;mapViews[kind]=[Math.max(0,Math.min(1000-nw,x+w/2-nw/2)),Math.max(14,Math.min(424-nh,y+h/2-nh/2)),nw,nh];}svg.setAttribute('viewBox',mapViews[kind].join(' '));
    }));
    let drag=null;
    svg.addEventListener('pointerdown',e=>{suppressMapClick=false;if(e.pointerType==='touch')return;drag={x:e.clientX,y:e.clientY,view:[...mapViews[kind]],moved:false};});
    svg.addEventListener('pointermove',e=>{if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.abs(dx)+Math.abs(dy)>5){drag.moved=true;suppressMapClick=true;svg.setPointerCapture(e.pointerId);}if(!drag.moved)return;const r=svg.getBoundingClientRect(),[x,y,w,h]=drag.view;mapViews[kind]=[Math.max(0,Math.min(1000-w,x-dx*w/r.width)),Math.max(0,Math.min(470-h,y-dy*h/r.height)),w,h];svg.setAttribute('viewBox',mapViews[kind].join(' '));hideTip();});
    svg.addEventListener('pointerup',()=>{drag=null;setTimeout(()=>{suppressMapClick=false;},0);});svg.addEventListener('pointercancel',()=>{drag=null;});
    const heading=$(kind+'Basin').closest('.basin-heading');
    const button=document.createElement('button');button.className='quiet';button.textContent='Download basin data ↓';
    button.addEventListener('click',async()=>{try{if(!details.has(selected))details.set(selected,await json(`data/basins/${selected}.json`));downloadText(`basin-${selected}.json`,JSON.stringify({diagnostics:basins.get(selected),series:details.get(selected)},null,2),'application/json');}catch{button.textContent='Download failed — retry';}});heading.append(button);
    const share=document.createElement('button');share.className='quiet';share.textContent='Copy basin link';share.addEventListener('click',async()=>{const url=new URL(location.href);url.hash=`${activeTab}?basin=${selected}&view=basin`;try{await navigator.clipboard.writeText(url.href);share.textContent='Link copied ✓';setTimeout(()=>share.textContent='Copy basin link',1800);}catch{share.textContent='Use the link in your address bar';}});heading.append(share);
  }
  for(const id of ['exposureChart','rateChart','leadChart','timeline']){
    const svg=$(id),button=document.createElement('button');button.className='chart-download';button.textContent='Export chart SVG ↓';button.addEventListener('click',()=>{const copy=svg.cloneNode(true);copy.setAttribute('xmlns',NS);const style=el('style',{},'text{font-family:Arial,sans-serif;font-size:11px;fill:#617780}.tick-line{stroke:#e8eef0;stroke-width:1}.main-line{fill:none;stroke-width:2.2;stroke-linejoin:round}');copy.prepend(style,el('rect',{width:'100%',height:'100%',fill:'#ffffff'}));downloadText(`${id}${id==='rateChart'||id==='timeline'?'-basin-'+selected:''}.svg`,new XMLSerializer().serializeToString(copy),'image/svg+xml');});svg.after(button);
  }
}
function initRaster(){ return window.NativeFlood.init(); }
async function init(){
  try{
    [study,exposure,geometries,land]=await Promise.all(['data/study.json','data/exposure.json','data/basins.geojson','data/land.geojson'].map(json));
    basins=new Map(study.basins.map(b=>[b.basin_id,b]));
    if(basins.size!==426||geometries.features.length!==426)throw new Error('The analysis domain must contain exactly 426 basins.');
    const h=exposure.periods.historical, reduction=(h.nolev-h.wtlev)/100*exposure.population/1e6;
    $('exposureMetrics').innerHTML=metric(`${fmt(h.nolev,2)} → ${fmt(h.wtlev,2)}%`,'Historical exposed share','No levees → with levees · 1970–2014');
    $('exposureExtraMetrics').innerHTML=metric(`−${fmt(reduction)}m`,'People exposed','Approximate reduction under fixed 2020 population')+metric('28%','Relative exposure reduction','Existing levees, historical ensemble mean');
    $('emergenceMetrics').innerHTML=metric(`${study.summary.detected_nolev} → ${study.summary.detected_wtlev}`,'Basins with detected ToE','No levees → with levees · out of 426');
    $('emergenceExtraMetrics').innerHTML=metric(study.summary.masked,'Levee-masked ToEs','No-levee detection; with-levee non-detection')+metric(study.summary.both,'Basins detected in both states','Including 21 with an earlier with-levee ToE');
    $('warningMetrics').innerHTML=metric(`${study.summary.nolev.median_lead} → ${study.summary.wtlev.median_lead} yr`,'Median statistical warning lead','No levees → with levees · same common-support sample, n = 195');
    $('warningExtraMetrics').innerHTML=metric(`${fmt(study.summary.nolev.surprise_paired_percent,1)}% → ${fmt(study.summary.wtlev.surprise_paired_percent,1)}%`,'RET precedes detectable ToE','Within the same 195 basins; RET-only cases excluded')+metric(study.summary.ret_detected,'Shared RET detections','One protected-system RET per basin');
    const options=study.basins.map(b=>`<option value="${b.basin_id}">Basin ${b.basin_id}</option>`).join('');$('toeBasin').innerHTML=options;$('warningBasin').innerHTML=options;
    $('status').hidden=true;renderDomain();renderExposure();renderTables();renderLead();activate();selectBasin(selected,false);installExplorerTools();
    $('scenario').addEventListener('change',renderExposure);$('individualModels').addEventListener('change',renderExposure);
    $('toeLayer').addEventListener('change',()=>renderMap('toe'));$('warningLayer').addEventListener('change',()=>renderMap('warning'));
    for(const prefix of ['toe','warning']){$(prefix+'Basin').addEventListener('change',e=>selectBasin(Number(e.target.value)));$(prefix+'Example').addEventListener('click',()=>selectBasin(118));}
    window.addEventListener('hashchange',activate);window.addEventListener('scroll',hideTip,{passive:true});
    // One handler also covers generated report links and browser history.
    document.addEventListener('click',e=>{const a=e.target.closest('a[href^="#"]');if(!a)return;const hash=a.getAttribute('href').slice(1),[name,query='']=hash.split('?');if(!['overview','exposure','emergence','warning','historical'].includes(name))return;e.preventDefault();const params=new URLSearchParams(query);if(!params.has('basin'))params.set('basin',selected);history.pushState(null,'',`#${name}?${params}`);activate();$(activeTab).scrollIntoView({block:'start',behavior:'auto'});});
    window.addEventListener('popstate',activate);
    document.documentElement.dataset.researchReady='true';window.dispatchEvent(new Event('research-ready'));

  }catch(e){$('status').hidden=false;$('status').textContent=`Unable to load research data: ${e.message}. Serve this folder over HTTP rather than opening index.html directly.`;}
}
init();
