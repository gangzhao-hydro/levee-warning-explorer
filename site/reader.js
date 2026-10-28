'use strict';
(function(){
  let ready=false,page=0,storyState='nolev';const pageSize=25;
  const name=id=>id===118?'Songhua River basin · 118':`Basin ${id}`;
  function story(){
    const b=basins.get(118),toe=b['toe_'+storyState],lead=b['lead_'+storyState];
    const events=[{title:'Detectable change · ToE',date:toe,color:C[storyState]},{title:'Record exceedance · RET',date:b.ret,color:C.ink}].sort((a,b)=>a.date-b.date);
    $('storyEvents').innerHTML=events.map((v,i)=>`${i?'<span class="event-arrow" aria-hidden="true">→</span>':''}<div class="story-event" style="border-color:${v.color}"><span>${v.title}</span><strong>${v.date}</strong><small>Window ${v.date}–${v.date+9}</small></div>`).join('');
    $('storyExplanation').textContent=lead>=0?`Without levees, the detectable signal begins ${lead} years before the protected-system record-exceedance window. Lead time: ${b.ret} − ${toe} = +${lead} years.`:`With levees, the detectable signal begins ${-lead} years after the record-exceedance window. Lead time: ${b.ret} − ${toe} = ${lead} years. The shared RET has not changed; detection comes later.`;
    document.querySelectorAll('[data-story-state]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.storyState===storyState)));
  }
  function map(){
    const svg=$('basinLocator');svg.replaceChildren();drawLand(svg);
    for(const f of geometries.features){const id=f.properties.basin_id,b=basins.get(id);if(!b)continue;
      const path=add(svg,'path',{d:geoPath(f.geometry),fill:detectColors[detection(b)],class:'basin-path'+(id===selected?' selected':''),role:'button',tabindex:id===selected?0:-1,'aria-label':`${name(id)}; ${detection(b)}`});
      add(path,'title',{},name(id));path.addEventListener('click',()=>choose(id,false));path.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();choose(id,false);}});path.addEventListener('pointermove',e=>tip(e,`${name(id)} · ${detection(b)}`));path.addEventListener('pointerleave',hideTip);
    }
    const f=geometries.features.find(f=>f.properties.basin_id===selected);if(f){const p=f.properties;add(svg,'circle',{cx:(p.label_lon+180)*1000/360,cy:(90-p.label_lat)*500/180,r:5,fill:'none',stroke:C.ink,'stroke-width':1.5,'pointer-events':'none'});}
  }
  function choose(id,zoom=true){
    selectBasin(id);$('basinQuery').value=id===118?'Songhua':String(id);$('lookupStatus').textContent=`${name(id)} selected. Its report is below the map.`;
    if(zoom){const f=geometries.features.find(f=>f.properties.basin_id===id),p=f.properties,x=(p.label_lon+180)*1000/360,y=(90-p.label_lat)*500/180;$('basinLocator').setAttribute('viewBox',`${Math.max(0,Math.min(600,x-200))} ${Math.max(14,Math.min(260,y-82))} 400 164`);}
  }
  function report(){
    const b=basins.get(selected);$('basinReportTitle').textContent=name(selected);$('basinReportMeta').textContent=`${fmt(b.area_km2)} km² · Basin-median protection standard ${fmt(b.levee_standard_median,1)} years`;
    $('basinReportNumbers').innerHTML=basinStat('NO-LEVEE ToE',b.toe_nolev??'Not detected','First qualifying window start',C.nolev)+basinStat('WITH-LEVEE ToE',b.toe_wtlev??'Not detected','First qualifying window start',C.wtlev)+basinStat('SHARED RET',b.ret??'Not detected','Protected-system record exceedance',C.ink);
    let message='';
    if(b.toe_nolev!==null&&b.toe_wtlev!==null){const d=b.toe_wtlev-b.toe_nolev;message=d===0?'The emergence window starts at the same time in both protection states.':`With levees, emergence is detected ${Math.abs(d)} years ${d>0?'later':'earlier'} than without levees.`;}
    else if(b.toe_nolev!==null)message='Emergence is detected without levees, but is not detected with levees by 2100. This is classified as a levee-masked signal.';
    else if(b.toe_wtlev!==null)message='Emergence is detected with levees only; no-levee emergence is not detected by 2100.';
    else message='Emergence is not detected by 2100 in either protection state. This does not establish that the hazard is unchanged.';
    if(b.lead_wtlev!==null)message+=b.lead_wtlev>0?` The with-levee signal precedes record exceedance by ${b.lead_wtlev} years.`:b.lead_wtlev<0?` Record exceedance precedes the with-levee signal by ${-b.lead_wtlev} years.`:' The with-levee ToE and shared RET have the same window start.';
    else message+=' A with-levee lead time cannot be calculated because ToE or RET is not detected.';
    $('basinInterpretation').textContent=message;
    table('basinComparison',['Diagnostic','Without levees','With levees'],[['Time of emergence (ToE)',year(b.toe_nolev),year(b.toe_wtlev)],['Shared record-exceedance time (RET)',year(b.ret),year(b.ret)],['Lead time: RET − ToE',signed(b.lead_nolev),signed(b.lead_wtlev)],['Warning classification',b.category_nolev,b.category_wtlev]]);
    $('basinSupport').textContent=(b.common_support?`Included in the ${study.summary.nolev.paired}-basin common-support lead-time comparison: both ToEs and the shared RET are detected.`:'Excluded from the common-support lead-time comparison because at least one timing is not detected; retained in the full 426-basin classification.')+' All dates are ten-year window starts, not individual event predictions.';
    $('reportDetection').href=`#emergence?basin=${selected}&view=basin`;$('reportWarning').href=`#warning?basin=${selected}&view=basin`;
  }
  function directory(){
    const filter=$('basinClassFilter').value,sort=$('basinSort').value;
    const rows=study.basins.filter(b=>filter==='all'||b.category_wtlev===filter).sort((a,b)=>sort==='area'?b.area_km2-a.area_km2:sort==='lead'?(a.lead_wtlev??Infinity)-(b.lead_wtlev??Infinity)||a.basin_id-b.basin_id:a.basin_id-b.basin_id);
    const pages=Math.max(1,Math.ceil(rows.length/pageSize));page=Math.min(page,pages-1);
    table('basinDirectory',['Basin','Area (km²)','With-levee ToE','Lead (years)','With-levee class'],rows.slice(page*pageSize,(page+1)*pageSize).map(b=>[`<button type="button" class="directory-link" data-basin-id="${b.basin_id}">${name(b.basin_id)}</button>`,fmt(b.area_km2),year(b.toe_wtlev),b.lead_wtlev??'Not defined',catShort[b.category_wtlev]]));
    $('directoryCount').textContent=`${rows.length} of 426 basins`;$('directoryPage').textContent=`Page ${page+1} of ${pages}`;$('directoryPrev').disabled=page===0;$('directoryNext').disabled=page===pages-1;
  }
  function sync(){if(!ready)return;report();map();}
  function init(){if(ready)return;ready=true;
    const h=exposure.periods.historical;$('storyReduction').textContent=`${Math.round(100*(h.nolev-h.wtlev)/h.nolev)}%`;$('storyMasked').textContent=`${study.summary.masked} / ${study.summary.basin_count}`;$('storyLead').textContent=`${study.summary.nolev.median_lead} → ${study.summary.wtlev.median_lead} yr`;
    $('locatorLegend').innerHTML=Object.entries(detectColors).map(([k,v])=>swatch(v,k)).join('');
    for(const c of categories){const o=document.createElement('option');o.value=c;o.textContent=catShort[c];$('basinClassFilter').append(o);}
    document.querySelectorAll('[data-story-state]').forEach(b=>b.addEventListener('click',()=>{storyState=b.dataset.storyState;story();}));
    $('basinLookup').addEventListener('submit',e=>{e.preventDefault();const id=BasinLookup.parse($('basinQuery').value,basins);if(id===null){$('lookupStatus').textContent='No match in the 426-basin study domain. Use a basin ID, Songhua / 松花江, the map, or coordinates. The previous selection remains displayed.';return;}choose(id);});
    $('pointLookup').addEventListener('submit',e=>{e.preventDefault();const ids=BasinLookup.locate(Number($('pointLon').value),Number($('pointLat').value),geometries.features);if(ids.length===1){choose(ids[0]);$('lookupStatus').textContent=`Point located in ${name(ids[0])} using the simplified study boundary. Check the map near basin edges.`;}else $('lookupStatus').textContent=ids.length?`This point touches more than one simplified boundary: ${ids.join(', ')}. Select the intended basin by ID.`:'No study basin contains this point. The domain covers 426 selected sub-basins, not all land or river systems. The previous selection remains displayed.';});
    $('locatorReset').addEventListener('click',()=>$('basinLocator').setAttribute('viewBox','0 14 1000 410'));
    for(const id of ['basinClassFilter','basinSort'])$(id).addEventListener('change',()=>{page=0;directory();});
    $('directoryPrev').addEventListener('click',()=>{page--;directory();});$('directoryNext').addEventListener('click',()=>{page++;directory();});
    $('basinDirectory').addEventListener('click',e=>{const b=e.target.closest('[data-basin-id]');if(b){choose(Number(b.dataset.basinId));$('basinReport').scrollIntoView({block:'start'});}});
    $('copyBasinReport').addEventListener('click',async()=>{const url=new URL(location.href);url.hash=`basins?basin=${selected}`;try{await navigator.clipboard.writeText(url.href);$('lookupStatus').textContent='Basin report link copied.';}catch{$('lookupStatus').textContent=`Share this basin: ${url.href}`;}});
    $('downloadBasinReport').addEventListener('click',async()=>{const id=selected;try{if(!details.has(id))details.set(id,await json(`data/basins/${id}.json`));downloadText(`basin-${id}-research-data.json`,JSON.stringify({study:study.title,version:study.version,scenario:'SSP5-8.5',percentile:'P95',ret_min_models:2,timing_definition:'Ten-year window start; lead = shared RET - ToE',diagnostics:basins.get(id),series:details.get(id)},null,2),'application/json');}catch{$('lookupStatus').textContent='Could not download the basin data. Please retry.';}});
    story();directory();sync();
  }
  window.ReaderCompanion={sync};window.addEventListener('research-ready',init);if(document.documentElement.dataset.researchReady==='true')init();
})();
