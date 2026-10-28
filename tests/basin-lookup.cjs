const assert=require('node:assert/strict');
const fs=require('node:fs');
const lookup=require('../site/basin-lookup.js');
const ids=new Set([2,118]);
for(const q of ['118','Basin 118','松花江','Songhua River basin'])assert.equal(lookup.parse(q,ids),118);
for(const q of ['999','Amazon','','118<script>'])assert.equal(lookup.parse(q,ids),null);
const poly=coordinates=>({type:'Polygon',coordinates});
const box=[[0,0],[10,0],[10,10],[0,10],[0,0]];
assert(lookup.contains(5,5,poly([box])));assert(!lookup.contains(20,5,poly([box])));
assert(lookup.contains(0,5,poly([box])));
assert(!lookup.contains(5,5,poly([box,[[4,4],[6,4],[6,6],[4,6],[4,4]]])));
const date=poly([[[170,-10],[-170,-10],[-170,10],[170,10],[170,-10]]]);
assert(lookup.contains(179,0,date));assert(lookup.contains(-179,0,date));assert(!lookup.contains(0,0,date));
assert.deepEqual(lookup.locate(181,0,[]),[]);
const adjacent=[{properties:{basin_id:1},geometry:poly([box])},{properties:{basin_id:2},geometry:poly([[[10,0],[20,0],[20,10],[10,10],[10,0]]])}];
assert.deepEqual(lookup.locate(10,5,adjacent),[1,2]);
if(process.argv[2]){
 const geo=JSON.parse(fs.readFileSync(process.argv[2]+'/data/basins.geojson'));
 const missed=geo.features.filter(f=>!lookup.contains(f.properties.label_lon,f.properties.label_lat,f.geometry)).map(f=>f.properties.basin_id);
 assert.deepEqual(missed,[], 'All 426 representative label points must locate inside their own simplified basin');
 assert.deepEqual(lookup.locate(0,0,geo.features),[]);
 const s=geo.features.find(f=>f.properties.basin_id===118).properties;
 assert.deepEqual(lookup.locate(s.label_lon,s.label_lat,geo.features),[118]);
 console.log('426 representative points, Songhua unique hit and outside-domain point verified.');
}
console.log('Lookup aliases, validation, holes, boundaries and antimeridian tests passed.');
