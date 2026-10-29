/* Native Float32 flood viewer. COG ranges are decoded in the browser; no tile server.
 * Base-grid values remain in metres. Display overviews never supply point values.
 */
window.NativeFlood = (() => {
  'use strict';
  const W=43200,H=21600,$=id=>document.getElementById(id);
  const handles=new Map(),previewImages=new Map();
  let initialized=false,config,land,chunkManifest,baseURL='',zoom=1,cx=W/2,cy=H/2,token=0,queryToken=0,controller=null,
      timer=null,lastPixel=null,drag=null,dividerPointer=null,ready=false,view={x:0,y:0,w:W,h:H},pool=null;
  let totals={bytes:0,requests:0};
  const presets={global:[0,0,1],yangtze:[114.3,30.6,64],ganges:[90.3,24,64],mekong:[105.6,10.2,64],mississippi:[-90.3,30,64],rhine:[6.7,51.5,64]};
  const ramp=[[.1,130,218,214,120],[.3,49,183,178,165],[.7,39,139,220,205],[1.5,67,86,217,225],[3,126,63,210,238],[6,220,64,142,248],[12,239,68,68,255],[60,127,29,29,255]];
  const year=()=>Number($('rasterYear').value);
  const native=()=>$('rasterMode').value==='native';
  const status=text=>{$('rasterStatus').textContent=text;};
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  function bytes(n){return n<1048576?`${(n/1024).toFixed(0)} KB`:`${(n/1048576).toFixed(2)} MB`;}
  function setView(){const w=Math.max(128,Math.round(W/zoom)),h=Math.round(w/2);cx=clamp(cx,w/2,W-w/2);cy=clamp(cy,h/2,H-h/2);view={x:Math.round(cx-w/2),y:Math.round(cy-h/2),w,h};
    $('nativeViewport').classList.toggle('zoomed',zoom>1);
    $('mapInteraction').textContent=zoom>1?'Drag the ↔ handle to compare · Drag the map to pan · Click a cell to inspect its depth.':'Global view · Drag the ↔ handle to compare. Zoom in (+ or double-click) before panning the map.';
  }
  function lonlat(px,py){return [-180+px/120,90-py/120];}
  function point(event){const r=$('nativeViewport').getBoundingClientRect();return {x:clamp((event.clientX-r.left)/r.width,0,.999999),y:clamp((event.clientY-r.top)/r.height,0,.999999)};}
  function updateDivider(){const split=Number($('swipeRange').value);$('nativeNoLayer').style.clipPath=`inset(0 ${100-split}% 0 0)`;$('nativeDivider').style.left=split+'%';$('nativeDivider').setAttribute('aria-valuenow',split);$('nativeDivider').setAttribute('aria-valuetext',`${split}% no-levee view`);}
  function clearPanPreview(){for(const id of ['nativeWith','nativeNo'])$(id).style.transform='';$('nativeViewport').classList.remove('panning');}
  function markBusy(value){$('nativeViewport').classList.toggle('loading',value);$('nativeViewport').setAttribute('aria-busy',String(value));}
  function resetPoint(){queryToken++;lastPixel=null;$('nativeCrosshair').hidden=true;$('downloadPixel').disabled=true;$('pixelReadout').innerHTML='<strong>Inspect an original 30″ cell</strong><span>Click the map to read both protection states at the same source-grid cell.</span>';}
  function schedule(){clearTimeout(timer);token++;controller?.abort();ready=false;markBusy(true);timer=setTimeout(render,180);}
  async function loadJSON(path){const r=await fetch(path);if(!r.ok)throw new Error(`${path}: HTTP ${r.status}`);return r.json();}
  async function open(layer,yr){
    if(!baseURL)throw new Error('30″ data hosting is not connected. Set the public raster URL before publishing; the lightweight overview remains available.');
    const key=`${layer}-${yr}`;
    if(handles.has(key)){const value=handles.get(key);handles.delete(key);handles.set(key,value);return value;}
    const url=new URL(config.filename_template.replace('{layer}',layer).replace('{year}',yr),baseURL).href;
    const promise=(async()=>{
      const client=chunkManifest?FloodChunks.client(chunkManifest.files[`${key}.tif`],baseURL,n=>{totals.requests++;totals.bytes+=n;}):{request:async({headers,signal})=>{
        const response=await fetch(url,{headers,signal});
        // Never accept an unbounded full-file download when a host ignores Range.
        if(response.status!==206){await response.body?.cancel();throw new Error(response.status===404?`30″ raster ${key} is unavailable.`:`Raster host must return HTTP 206 byte ranges (received ${response.status}).`);}
        totals.requests++;
        return {ok:response.ok,status:response.status,getHeader:name=>response.headers.get(name),
          getData:async()=>{const buffer=await response.arrayBuffer();totals.bytes+=buffer.byteLength;return buffer;}};
      }};
      const tiff=await GeoTIFF.fromCustomClient(client,{allowFullFile:false,maxRanges:0,blockSize:65536,cacheSize:64});
      const count=await tiff.getImageCount(),images=[];
      for(let i=0;i<count;i++)images.push(await tiff.getImage(i));
      if(images[0].getWidth()!==W||images[0].getHeight()!==H)throw new Error('Unexpected raster grid: expected 43200 × 21600.');
      return {tiff,images};
    })();
    handles.set(key,promise);
    promise.catch(()=>{if(handles.get(key)===promise)handles.delete(key);});
    while(handles.size>4)handles.delete(handles.keys().next().value);
    return promise;
  }
  function base(ctx,v,width,height){
    ctx.fillStyle='#f2f7f8';ctx.fillRect(0,0,width,height);ctx.fillStyle='#e2ebe6';
    const sx=x=>(x-v.x)/v.w*width,sy=y=>(y-v.y)/v.h*height;
    for(const feature of land.features){const g=feature.geometry;if(!g)continue;const polys=g.type==='Polygon'?[g.coordinates]:g.type==='MultiPolygon'?g.coordinates:[];
      for(const poly of polys){ctx.beginPath();for(const ring of poly){let previous=null;ring.forEach(([lon,lat],i)=>{const x=sx((lon+180)*120),y=sy((90-lat)*120);if(i===0||Math.abs(lon-previous)>180)ctx.moveTo(x,y);else ctx.lineTo(x,y);previous=lon;});ctx.closePath();}ctx.fill('evenodd');}}
    ctx.strokeStyle='#bfced080';ctx.lineWidth=.5;const step=zoom<4?30:zoom<16?10:zoom<64?2:1;
    ctx.beginPath();for(let lon=-180;lon<=180;lon+=step){const px=(lon+180)*120;if(px<v.x||px>v.x+v.w)continue;ctx.moveTo(sx(px),0);ctx.lineTo(sx(px),height);}for(let lat=-90;lat<=90;lat+=step){const py=(90-lat)*120;if(py<v.y||py>v.y+v.h)continue;ctx.moveTo(0,sy(py));ctx.lineTo(width,sy(py));}ctx.stroke();
  }
  function rgba(values){
    const result=new Uint8ClampedArray(values.length*4);
    for(let i=0;i<values.length;i++){const v=values[i];if(!Number.isFinite(v)||v<=.1)continue;let j=1;while(j<ramp.length-1&&v>ramp[j][0])j++;const a=ramp[j-1],b=ramp[j],t=clamp((v-a[0])/(b[0]-a[0]),0,1);for(let c=1;c<=4;c++)result[i*4+c-1]=a[c]+(b[c]-a[c])*t;}
    return result;
  }
  async function nativeLayer(layer,yr,v,width,height,signal){
    const h=await open(layer,yr);if(signal.aborted)throw new DOMException('Aborted','AbortError');
    const target=v.w/width;let image=h.images[0];
    for(const candidate of h.images){if(W/candidate.getWidth()<=target)image=candidate;}
    const fx=W/image.getWidth(),fy=H/image.getHeight();
    const win=[Math.floor(v.x/fx),Math.floor(v.y/fy),Math.ceil((v.x+v.w)/fx),Math.ceil((v.y+v.h)/fy)];
    const outWidth=Math.min(width,win[2]-win[0]),outHeight=Math.min(height,win[3]-win[1]);
    const values=await image.readRasters({window:win,samples:[0],interleave:true,width:outWidth,height:outHeight,resampleMethod:'nearest',pool,signal});
    const tile=document.createElement('canvas');tile.width=outWidth;tile.height=outHeight;
    tile.getContext('2d').putImageData(new ImageData(rgba(values),outWidth,outHeight),0,0);
    return {tile,factor:fx,rect:[(win[0]*fx-v.x)/v.w*width,(win[1]*fy-v.y)/v.h*height,(win[2]-win[0])*fx/v.w*width,(win[3]-win[1])*fy/v.h*height]};
  }
  async function overviewLayer(layer,yr){
    const key=`${layer}-${yr}`;if(!previewImages.has(key)){previewImages.set(key,new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>{previewImages.delete(key);reject(new Error('Overview unavailable'));};image.src=layer==='population'?'rasters/population.webp':`rasters/${key}.webp?v=vic2000-20261029`;}));}
    while(previewImages.size>4)previewImages.delete(previewImages.keys().next().value);
    return previewImages.get(key);
  }
  async function render(){
    clearTimeout(timer);const current=++token;controller?.abort();controller=new AbortController();const signal=controller.signal;
    drag=null;
    setView();const v={...view},yr=year(),isNative=native();ready=false;markBusy(true);resetPoint();
    const frame=$('nativeViewport'),width=Math.min(1600,Math.max(768,Math.round(frame.clientWidth*Math.min(devicePixelRatio||1,1.5)))),height=Math.round(width/2);
    const before={...totals};status(`Loading ${yr} · ${isNative?'30″ source, visible region only':'lightweight overview'}…`);
    try{
      const layers=await Promise.all(['wtlev','nolev'].map(layer=>isNative?nativeLayer(layer,yr,v,width,height,signal):overviewLayer(layer,yr)));
      const pop=$('population').checked?await overviewLayer('population',2020):null;
      if(current!==token||signal.aborted)return;
      ['nativeWith','nativeNo'].forEach((id,i)=>{const canvas=$(id);canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=false;base(ctx,v,width,height);
        if(isNative)ctx.drawImage(layers[i].tile,...layers[i].rect);else{const im=layers[i];ctx.drawImage(im,v.x/W*im.width,v.y/H*im.height,v.w/W*im.width,v.h/H*im.height,0,0,width,height);}
        if(pop){ctx.globalAlpha=.45;ctx.drawImage(pop,v.x/W*pop.width,v.y/H*pop.height,v.w/W*pop.width,v.h/H*pop.height,0,0,width,height);ctx.globalAlpha=1;}
      });
      clearPanPreview();
      const factor=isNative?Math.max(...layers.map(l=>l.factor)):W/2048;
      $('nativeResolution').textContent=isNative?(factor===1?'Original 30″ cells':`Overview · ${Math.round(30*factor)}″ display / 30″ source`):'Preview only · ~633″';
      $('nativeResolution').classList.toggle('native',isNative&&factor===1);
      status(`${yr} · ${zoom.toFixed(zoom%1?1:0)}× · ${isNative?`${bytes(totals.bytes-before.bytes)} fetched in ${totals.requests-before.requests} ${chunkManifest?'file parts':'range requests'}${factor===1?' · native grid, no smoothing':''}`:'overview image enlarged; select 30″ detail for the original grid'}`);
      frame.dataset.renderYear=String(yr);frame.dataset.resolutionArcsec=String(isNative?30*factor:30*W/2048);frame.dataset.mode=isNative?'native':'overview';
      frame.dataset.viewX=String(v.x);frame.dataset.viewY=String(v.y);frame.dataset.viewWidth=String(v.w);frame.dataset.viewHeight=String(v.h);
      ready=true;updateDivider();
    }catch(e){if(current!==token||signal.aborted)return;clearPanPreview();status(`Map could not load: ${e.message} Select Lightweight overview to continue.`);$('nativeResolution').textContent='30″ data unavailable';frame.dataset.mode='error';for(const id of ['nativeWith','nativeNo']){const canvas=$(id),ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);}frame.removeAttribute('data-render-year');}
    finally{if(current===token)markBusy(false);}
  }
  async function inspect(px,py){
    if(!ready)return;
    const ix=clamp(Math.floor(px),0,W-1),iy=clamp(Math.floor(py),0,H-1),yr=year(),q=++queryToken,r=token;
    const [lon,lat]=lonlat(ix+.5,iy+.5);
    $('pixelReadout').textContent=`Reading original cell at ${lon.toFixed(5)}°, ${lat.toFixed(5)}°…`;$('downloadPixel').disabled=true;
    try{
      const values=await Promise.all(['nolev','wtlev'].map(async layer=>{const h=await open(layer,yr);const data=await h.images[0].readRasters({window:[ix,iy,ix+1,iy+1],samples:[0],interleave:true,pool});return Number(data[0]);}));
      if(q!==queryToken||r!==token)return;
      lastPixel={year:yr,longitude:lon,latitude:lat,column_zero_based:ix,row_zero_based:iy,resolution_arcsec:30,nolev_depth_m:values[0],wtlev_depth_m:values[1],difference_nolev_minus_wtlev_m:values[0]-values[1]};
      const show=v=>Number.isFinite(v)?`${v.toFixed(4)} m`:'No data';
      $('pixelReadout').innerHTML=`<strong>${lon.toFixed(5)}°, ${lat.toFixed(5)}° · ${yr} · original 30″ cell</strong><span>No levees: <b>${show(values[0])}</b> &nbsp; With levees: <b>${show(values[1])}</b> &nbsp; Difference: <b>${show(values[0]-values[1])}</b></span><small>Cell centre · column ${ix}, row ${iy} (zero-based). Values shown to 4 decimal places; the CSV retains the decoded Float32 values.</small>`;
      const marker=$('nativeCrosshair');marker.style.left=(ix+.5-view.x)/view.w*100+'%';marker.style.top=(iy+.5-view.y)/view.h*100+'%';marker.hidden=false;$('downloadPixel').disabled=false;
    }catch(e){if(q===queryToken&&r===token)$('pixelReadout').textContent=`Exact-cell lookup unavailable: ${e.message}`;}
  }
  function go(lon,lat,z){cx=(lon+180)*120;cy=(90-lat)*120;zoom=z;$('rasterLon').value=lon;$('rasterLat').value=lat;render();}
  function changeZoom(factor,anchor={x:.5,y:.5}){setView();const px=view.x+anchor.x*view.w,py=view.y+anchor.y*view.h;zoom=clamp(zoom*factor,1,256);const w=W/zoom,h=H/zoom;cx=px+(.5-anchor.x)*w;cy=py+(.5-anchor.y)*h;schedule();}
  function wire(){
    $('rasterYear').addEventListener('change',render);$('rasterMode').addEventListener('change',render);$('population').addEventListener('change',render);
    $('rasterZoomIn').addEventListener('click',()=>changeZoom(2));$('rasterZoomOut').addEventListener('click',()=>changeZoom(.5));$('rasterReset').addEventListener('click',()=>go(0,0,1));
    $('rasterRegion').addEventListener('change',()=>go(...presets[$('rasterRegion').value]));
    $('coordinateForm').addEventListener('submit',e=>{e.preventDefault();const lon=Number($('rasterLon').value),lat=Number($('rasterLat').value);if(Number.isFinite(lon)&&Number.isFinite(lat)&&Math.abs(lon)<=180&&Math.abs(lat)<=90)go(lon,lat,64);});
    $('swipeRange').addEventListener('input',updateDivider);
    const frame=$('nativeViewport');
    const divider=$('nativeDivider'),moveDivider=e=>{$('swipeRange').value=String(Math.round(point(e).x*100));updateDivider();};
    divider.addEventListener('pointerdown',e=>{e.stopPropagation();if(e.button!==0||dividerPointer!==null)return;e.preventDefault();dividerPointer=e.pointerId;divider.focus({preventScroll:true});divider.setPointerCapture(e.pointerId);divider.classList.add('dragging');moveDivider(e);});
    divider.addEventListener('pointermove',e=>{if(dividerPointer!==e.pointerId)return;e.stopPropagation();moveDivider(e);});
    const endDivider=e=>{e.stopPropagation();if(dividerPointer!==e.pointerId)return;dividerPointer=null;divider.classList.remove('dragging');if(divider.hasPointerCapture(e.pointerId))divider.releasePointerCapture(e.pointerId);};
    divider.addEventListener('pointerup',endDivider);divider.addEventListener('pointercancel',endDivider);divider.addEventListener('lostpointercapture',endDivider);
    divider.addEventListener('dblclick',e=>e.stopPropagation());
    divider.addEventListener('keydown',e=>{e.stopPropagation();const current=Number($('swipeRange').value);let next=current;if(e.key==='ArrowLeft'||e.key==='ArrowDown')next-=5;else if(e.key==='ArrowRight'||e.key==='ArrowUp')next+=5;else if(e.key==='Home')next=0;else if(e.key==='End')next=100;else return;e.preventDefault();$('swipeRange').value=String(clamp(next,0,100));updateDivider();});
    frame.addEventListener('pointerdown',e=>{if(!ready||e.button!==0||drag)return;e.preventDefault();frame.focus({preventScroll:true});drag={id:e.pointerId,x:e.clientX,y:e.clientY,cx,cy,w:view.w,h:view.h,moved:false};frame.setPointerCapture(e.pointerId);});
    frame.addEventListener('pointermove',e=>{const p=point(e),[lon,lat]=lonlat(view.x+p.x*view.w,view.y+p.y*view.h);$('mapCoordinate').textContent=`${lon.toFixed(3)}°, ${lat.toFixed(3)}°`;
      if(!drag||drag.id!==e.pointerId)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(!drag.moved&&Math.abs(dx)+Math.abs(dy)>5){drag.moved=true;resetPoint();}
      if(!drag.moved)return;
      if(zoom===1){$('mapInteraction').textContent='The whole world is already visible. Use + or double-click to zoom in, then drag to pan. The ↔ handle compares both states at any zoom.';return;}
      cx=clamp(drag.cx-dx/frame.clientWidth*drag.w,drag.w/2,W-drag.w/2);cy=clamp(drag.cy-dy/frame.clientHeight*drag.h,drag.h/2,H-drag.h/2);
      const tx=(drag.cx-cx)/drag.w*frame.clientWidth,ty=(drag.cy-cy)/drag.h*frame.clientHeight;
      for(const id of ['nativeWith','nativeNo'])$(id).style.transform=`translate(${tx}px, ${ty}px)`;
      frame.classList.add('panning');$('mapInteraction').textContent='Panning · release to load the new region.';
    });
    const endPan=(e,cancelled=false)=>{if(!drag||drag.id!==e.pointerId)return;const previous=drag;drag=null;frame.classList.remove('panning');if(frame.hasPointerCapture(e.pointerId))frame.releasePointerCapture(e.pointerId);
      if(cancelled){cx=previous.cx;cy=previous.cy;clearPanPreview();setView();return;}
      if(previous.moved){if(cx!==previous.cx||cy!==previous.cy)render();else clearPanPreview();}
      else{const p=point(e);inspect(view.x+p.x*view.w,view.y+p.y*view.h);}
    };
    frame.addEventListener('pointerup',endPan);frame.addEventListener('pointercancel',e=>endPan(e,true));frame.addEventListener('lostpointercapture',e=>endPan(e,true));
    frame.addEventListener('dblclick',e=>{e.preventDefault();changeZoom(2,point(e));});
    frame.addEventListener('wheel',e=>{if(!e.ctrlKey&&!e.metaKey)return;e.preventDefault();changeZoom(e.deltaY<0?1.4:1/1.4,point(e));},{passive:false});
    frame.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-','Enter'].includes(e.key))e.preventDefault();else return;if(e.key==='Enter'){inspect(cx,cy);return;}if(e.key==='+'||e.key==='='){changeZoom(2);return;}if(e.key==='-'){changeZoom(.5);return;}if(e.key==='ArrowLeft')cx-=view.w*.25;if(e.key==='ArrowRight')cx+=view.w*.25;if(e.key==='ArrowUp')cy-=view.h*.25;if(e.key==='ArrowDown')cy+=view.h*.25;schedule();});
    $('downloadPixel').addEventListener('click',()=>{if(!lastPixel)return;const blob=new Blob([Object.keys(lastPixel).join(',')+'\n'+Object.values(lastPixel).join(',')+'\n'],{type:'text/csv'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`flood-cell-${lastPixel.year}-${lastPixel.column_zero_based}-${lastPixel.row_zero_based}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
    let resize;new ResizeObserver(()=>{clearTimeout(resize);resize=setTimeout(()=>{if(!$('historical').hidden&&initialized&&!drag)render();},350);}).observe(frame);
  }
  async function init(){
    if(initialized)return;
    initialized=true;
    try{
      [config,land]=await Promise.all([loadJSON('rasters/native-config.json?v=vic2000-20261029'),loadJSON('data/land.geojson')]);
      if(config.chunk_manifest)chunkManifest=await loadJSON(config.chunk_manifest);
      const local=['localhost','127.0.0.1','[::1]'].includes(location.hostname);
      const url=config.base_url||(local?config.local_base_url:'');baseURL=url?new URL(url.endsWith('/')?url:url+'/',document.baseURI).href:'';
      if(baseURL&&!local&&!baseURL.startsWith('https://'))throw new Error('The production raster URL must use HTTPS.');
      if(!baseURL){$('rasterMode').value='overview';$('nativeNote').prepend('This deployment currently includes the lightweight overview; its 30″ data host has not been connected. ');}
      $('rasterYear').innerHTML=config.years.map(y=>`<option>${y}</option>`).join('');$('rasterYear').value=String(config.years.includes(config.default_year)?config.default_year:config.years[0]);$('rasterYear').disabled=config.years.length===1;
      pool=new GeoTIFF.Pool(2);wire();await render();
    }catch(e){initialized=false;status(`Unable to initialize the 30″ map: ${e.message}`);}
  }
  return {init};
})();
