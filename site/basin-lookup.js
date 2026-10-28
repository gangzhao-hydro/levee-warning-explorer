/* Pure lookup helpers: never infer an unverified basin name or nearest basin. */
(function(root){
'use strict';
function parse(query,ids){
  const q=String(query).trim().toLowerCase();
  const alias=/^(songhua(?: river)?(?: basin)?|松花江(?:流域)?)$/.test(q);
  const match=q.match(/^(?:(?:basin|流域)\s*)?(\d+)$/);
  const id=alias?118:match?Number(match[1]):null;
  return id!==null&&ids.has(id)?id:null;
}
function ringState(lon,lat,ring){
  if(ring.length<3)return 0;
  const points=[];let previous=ring[0][0];
  for(const p of ring){let x=p[0];while(x-previous>180)x-=360;while(x-previous< -180)x+=360;points.push([x,p[1]]);previous=x;}
  const center=points.reduce((s,p)=>s+p[0],0)/points.length;
  const x=lon+360*Math.round((center-lon)/360);let inside=false;
  for(let i=0,j=points.length-1;i<points.length;j=i++){
    const [a,b]=points[j],[c,d]=points[i];
    const cross=(x-a)*(d-b)-(lat-b)*(c-a);
    if(Math.abs(cross)<1e-9&&x>=Math.min(a,c)-1e-9&&x<=Math.max(a,c)+1e-9&&lat>=Math.min(b,d)-1e-9&&lat<=Math.max(b,d)+1e-9)return 2;
    if((b>lat)!==(d>lat)&&x<(c-a)*(lat-b)/(d-b)+a)inside=!inside;
  }
  return inside?1:0;
}
function contains(lon,lat,g){
  if(!g)return false;
  const polys=g.type==='Polygon'?[g.coordinates]:g.type==='MultiPolygon'?g.coordinates:[];
  return polys.some(poly=>ringState(lon,lat,poly[0])!==0&&!poly.slice(1).some(h=>ringState(lon,lat,h)===1));
}
function locate(lon,lat,features){
  if(!Number.isFinite(lon)||!Number.isFinite(lat)||Math.abs(lon)>180||Math.abs(lat)>90)return [];
  return features.filter(f=>contains(lon,lat,f.geometry)).map(f=>f.properties.basin_id);
}
const api={parse,contains,locate};root.BasinLookup=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
