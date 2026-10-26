/* Preserve a COG byte-for-byte while hosting bounded static parts on Pages. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.FloodChunks=factory();
})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  function client(file,baseURL,onTransfer=()=>{},fetcher=fetch){
    if(!file||!Number.isSafeInteger(file.bytes)||file.bytes<1||
      !Number.isSafeInteger(file.chunk_size)||file.chunk_size<1||file.chunk_size>4194304||
      file.chunks.length!==Math.ceil(file.bytes/file.chunk_size))throw new Error('Invalid raster parts manifest.');
    const cache=new Map();
    async function part(index){
      if(cache.has(index)){const result=cache.get(index);cache.delete(index);cache.set(index,result);return result;}
      const meta=file.chunks[index],expected=Math.min(file.chunk_size,file.bytes-index*file.chunk_size);
      if(meta.bytes!==expected||!/^[-a-z0-9/]+\.bin$/.test(meta.path)||!/^[a-f0-9]{64}$/.test(meta.sha256))throw new Error('Invalid raster part.');
      const pending=(async()=>{
        // Each URL is at most 4 MiB. Full responses are safe for these bounded parts.
        const response=await fetcher(new URL(meta.path,baseURL));
        if(response.status!==200){await response.body?.cancel();throw new Error(`Raster part: HTTP ${response.status}`);}
        const length=response.headers.get('content-length');
        const encoding=response.headers.get('content-encoding');
        // Fetch decodes CDN gzip/br bodies; Content-Length still counts wire bytes.
        if((!encoding||encoding==='identity')&&length!==null&&Number(length)!==expected){await response.body?.cancel();throw new Error('Raster part size mismatch.');}
        const reader=response.body.getReader(),data=new Uint8Array(expected);let offset=0;
        while(true){const {done,value}=await reader.read();if(done)break;if(offset+value.length>expected){await reader.cancel();throw new Error('Raster part exceeds its declared size.');}data.set(value,offset);offset+=value.length;}
        if(offset!==expected)throw new Error('Incomplete raster part.');
        const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),x=>x.toString(16).padStart(2,'0')).join('');
        if(hash!==meta.sha256)throw new Error('Raster part checksum mismatch.');
        onTransfer(expected);return data;
      })();
      cache.set(index,pending);pending.catch(()=>{if(cache.get(index)===pending)cache.delete(index);});
      while(cache.size>8)cache.delete(cache.keys().next().value);
      return pending;
    }
    return {request:async({headers,signal})=>{
      if(signal?.aborted)throw new DOMException('Aborted','AbortError');
      const match=/^bytes=(\d+)-(\d+)$/.exec(new Headers(headers).get('range')||'');
      if(!match)throw new Error('Only bounded single byte ranges are supported.');
      const start=Number(match[1]),end=Math.min(Number(match[2]),file.bytes-1);
      if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||end-start>16777216)throw new Error('Invalid raster byte range.');
      const output=new Uint8Array(end-start+1);
      for(let i=Math.floor(start/file.chunk_size);i<=Math.floor(end/file.chunk_size);i++){
        const data=await part(i);if(signal?.aborted)throw new DOMException('Aborted','AbortError');
        const from=Math.max(start,i*file.chunk_size),to=Math.min(end+1,(i+1)*file.chunk_size);
        output.set(data.subarray(from-i*file.chunk_size,to-i*file.chunk_size),from-start);
      }
      const responseHeaders=new Headers({'Content-Range':`bytes ${start}-${end}/${file.bytes}`,'Content-Length':String(output.length),'Accept-Ranges':'bytes'});
      return {ok:true,status:206,getHeader:name=>responseHeaders.get(name),getData:async()=>output.buffer};
    }};
  }
  return {client};
});
