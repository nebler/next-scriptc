// Minimal WASI Preview 1 adapter for these compute-only reactors. No filesystem.
export function instantiate(module) {
  let api;
  const decoder=new TextDecoder(),encoder=new TextEncoder();
  const view=()=>new DataView(api.memory.buffer);
  const calls={};
  const wasi={
    environ_sizes_get:(count,bytes)=>{view().setUint32(count,0,true);view().setUint32(bytes,0,true);return 0;},
    environ_get:()=>0,
    clock_time_get:(id,precision,out)=>{if(id!==0&&id!==1)return 28;view().setBigUint64(out,BigInt(Math.floor((id===0?Date.now():performance.now())*1e6)),true);return 0;},
    fd_prestat_get:()=>8,
    fd_prestat_dir_name:()=>8,
    fd_fdstat_get:(fd,p)=>{if(fd>2)return 8;new Uint8Array(api.memory.buffer,p,24).fill(0);view().setUint8(p,2);return 0;},
    fd_fdstat_set_flags:fd=>fd<=2?0:8,
    fd_close:()=>8,
    fd_read:(fd,iovs,n,out)=>{if(fd!==0)return 8;view().setUint32(out,0,true);return 0;},
    fd_seek:()=>70,
    fd_write:(fd,iovs,n,out)=>{if(fd!==1&&fd!==2)return 8;let bytes=0;for(let i=0;i<n;i++){const p=view().getUint32(iovs+8*i,true),len=view().getUint32(iovs+8*i+4,true);console.error(decoder.decode(new Uint8Array(api.memory.buffer,p,len)));bytes+=len;}view().setUint32(out,bytes,true);return 0;},
    path_open:()=>76,
    proc_exit:code=>{throw new Error('WASI proc_exit '+code);},
  };
  const imports={};
  for(const {module:ns,name} of WebAssembly.Module.imports(module)) {
    if(ns==='scriptc'&&name==='panic')continue;
    if(ns!=='wasi_snapshot_preview1'||!wasi[name])throw new Error('Unsupported import '+ns+'.'+name);
    imports[name]=(...args)=>{calls[name]=(calls[name]||0)+1;return wasi[name](...args);};
  }
  const instance=new WebAssembly.Instance(module,{wasi_snapshot_preview1:imports,scriptc:{panic:(p,n)=>{throw new Error(decoder.decode(new Uint8Array(api.memory.buffer,p,n)));}}});
  api=instance.exports;api._initialize();api.bench_init();
  return {
    calls,
    memoryBytes:()=>api.memory.buffer.byteLength,
    run(text) {
      const input=encoder.encode(text);let p=0,slots=0;
      try {
        p=api.scriptc_alloc(input.length);slots=api.scriptc_alloc(8);
        if(!p||!slots)throw new Error('Wasm allocation failed');
        new Uint8Array(api.memory.buffer,p,input.length).set(input);
        api.bench_run(p,input.length,slots,slots+4);
        const v=view(),out=v.getUint32(slots,true),length=v.getUint32(slots+4,true);
        // Copy before the next application call resets the result arena.
        return decoder.decode(new Uint8Array(api.memory.buffer,out,length));
      } finally {if(p)api.scriptc_free(p);if(slots)api.scriptc_free(slots);}
    },
    collect(){api.bench_collect();},
  };
}
