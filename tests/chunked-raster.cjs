const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {client}=require('../site/chunked-raster.js');

(async()=>{
  const data=Uint8Array.from({length:997},(_,i)=>i%251),size=192;
  const chunks=[];
  for(let i=0;i<data.length;i+=size){const bytes=data.slice(i,i+size);chunks.push({path:`sample/${i/size}.bin`,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}
  const descriptor={bytes:data.length,chunk_size:size,chunks};
  let calls=0,transferred=0;
  const fetcher=async url=>{calls++;const index=Number(url.pathname.split('/').pop().split('.')[0]);return new Response(data.slice(index*size,(index+1)*size));};
  const c=client(descriptor,'https://example.test/',n=>transferred+=n,fetcher);
  const read=async(a,b)=>{const r=await c.request({headers:{Range:`bytes=${a}-${b}`}});assert.equal(r.status,206);assert.equal(r.getHeader('Content-Range'),`bytes ${a}-${Math.min(b,data.length-1)}/${data.length}`);return new Uint8Array(await r.getData());};
  assert.deepEqual(await read(187,600),data.slice(187,601)); // crosses three part boundaries
  const previous=calls;
  assert.deepEqual(await read(190,200),data.slice(190,201));
  assert.equal(calls,previous); // reuse downloaded parts
  // A CDN-compressed response exposes encoded Content-Length, but a decoded body.
  const compressed=client(descriptor,'https://example.test/',()=>{},async url=>{
    const index=Number(url.pathname.split('/').pop().split('.')[0]);
    return new Response(data.slice(index*size,(index+1)*size),{headers:{'Content-Encoding':'gzip','Content-Length':'17'}});
  });
  const decoded=await compressed.request({headers:{Range:'bytes=187-600'}});
  assert.deepEqual(new Uint8Array(await decoded.getData()),data.slice(187,601));
  assert.deepEqual(await read(990,1200),data.slice(990)); // final short part / EOF
  assert(transferred<data.length);
  await assert.rejects(()=>c.request({headers:{Range:'bytes=9999-10000'}}),/Invalid raster byte range/);
  await assert.rejects(()=>c.request({headers:{Range:'bytes=0-20,40-60'}}),/bounded single byte ranges/);
  const controller=new AbortController();controller.abort();
  await assert.rejects(()=>c.request({headers:{Range:'bytes=0-31'},signal:controller.signal}),/Aborted/);
  const bad=client(descriptor,'https://example.test/',()=>{},async()=>new Response(new Uint8Array(size)));
  await assert.rejects(()=>bad.request({headers:{Range:'bytes=0-31'}}),/checksum mismatch/);
  const oversize=client(descriptor,'https://example.test/',()=>{},async()=>new Response(new Uint8Array(size+1)));
  await assert.rejects(()=>oversize.request({headers:{Range:'bytes=0-31'}}),/exceeds its declared size/);
  console.log('PASS: byte boundaries, CDN compression, final part, cache, abort, invalid range, checksum and bounded downloads');
})().catch(e=>{console.error(e);process.exitCode=1;});

