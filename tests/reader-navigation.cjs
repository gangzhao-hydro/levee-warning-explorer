const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const root=process.argv[2]||'site';
const html=fs.readFileSync(root+'/index.html','utf8');
const app=fs.readFileSync(root+'/app.js','utf8');
const reader=fs.readFileSync(root+'/reader.js','utf8');
assert(!html.includes('id="basins"'));
assert(!html.includes('#basins'));
assert(!html.includes('basin-lookup.js'));
assert(!html.includes('Find a basin'));
assert(!fs.existsSync(root+'/basin-lookup.js'));
for(const id of ['overview','exposure','emergence','warning','historical','storyEvents','toeMap','warningMap','nativeViewport'])assert(html.includes(`id="${id}"`),id);
const palette=vm.runInNewContext('('+app.match(/const catColors = (\{[^;]+\});/)[1]+')');
assert.equal(palette['Surprise'],'#bd8d3d');
assert.equal(palette['Undetected surprise'],'#bb6261');
assert.equal(palette['Advance warning'],'#5d9e8c');
assert.equal(palette['Emergence without exceedance'],'#8065ab');
assert.equal(palette.Neither,'#c9d3d5');
// The same category mapping is used for polygons, legends and category tables.
assert(app.includes("catColors[b['category_'+lev]]"));
assert(app.includes('swatch(catColors[k]'));
assert(app.includes('swatch(catColors[c]'));
for(const m of reader.matchAll(/\$\('([^']+)'\)/g))assert(html.includes(`id="${m[1]}"`),`Reader references missing ${m[1]}`);
if(process.argv[2]){
 const study=JSON.parse(fs.readFileSync(root+'/data/study.json'));
 assert.equal(study.basins.length,426);
 for(const state of ['nolev','wtlev'])for(const b of study.basins)assert(palette[b['category_'+state]],`Missing palette for ${b.basin_id}`);
 assert.equal(study.summary.nolev.paired,195);assert.equal(study.summary.wtlev.paired,195);
}
console.log('Standalone finder removed; retained navigation, 426 basin mappings and manuscript-aligned red/orange semantics verified.');
