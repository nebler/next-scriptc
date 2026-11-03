import {execFileSync,spawn} from 'node:child_process';
import {writeFileSync,mkdirSync,statSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
const [fork,output,mode='measure']=process.argv.slice(2);
const dir=resolve('research/native-json-decode'), scratch=join(fork,'.c2'); mkdirSync(scratch,{recursive:true});
const sources=['scr_json.c','scr_string.c','scr_array.c','scr_arena.c','scr_map.c','scr_exception.c','scr_error.c','scr_number.c','scr_console.c','scr_closure.c','scr_object.c','scr_union.c','scr_cycle.c','scr_alloc.c','scr_lib.c','scr_hash.c','scr_bytes.c','scr_shared.c','scr_bigint.c','scr_url.c','scr_url_params.c','scr_path.c'];
const bin=process.env.C2_BIN??join(scratch,'bench');
if(mode==='build') {
 const files=[join(dir,'bench.c'),...sources.map(s=>join(fork,'packages/runtime/src',s))];
 const objects=files.map((s,i)=>join(scratch,`${i}.o`));
 for(const [i,file] of files.entries()) if(!existsSync(objects[i]) || statSync(objects[i]).mtimeMs<statSync(file).mtimeMs)execFileSync('clang',['-std=c11','-O3','-g','-I',join(fork,'packages/runtime/src'),'-c',file,'-o',objects[i]],{stdio:'inherit'});
 execFileSync('clang',[...objects,'-o',bin],{stdio:'inherit'});process.exit();
}
const result=[];
for(const n of [600,6000,60000]) for(const shape of ['flat','nested']) {
 const rows=Array.from({length:n},(_,i)=>({sku:'item-'+i%91,qty:i%997,ok:i%3===0,tags:shape==='nested'?['a','b','c']:[],...(i%2?{optional:i%17}:{})}));
 const text=JSON.stringify(rows),file=join(scratch,`${shape}-${n}.json`);writeFileSync(file,text);
 const oracle=JSON.parse(text).reduce((s,r)=>s+r.qty+r.ok+Buffer.byteLength(r.sku)+r.tags.length+(r.optional??0),0);
 for(const typed of [0,1]) {
  if(mode==='profile' && n===60000) { const child=spawn(bin,[file,''+typed,'20000','1'],{stdio:'ignore'}); await new Promise(r=>setTimeout(r,300)); try{execFileSync('sample',[''+child.pid,'3','-file',join(dir,`${output}-${shape}-${typed}.txt`)],{stdio:'ignore'});}finally{child.kill();} continue; }
  if(mode==='profile')continue;
  const samples=execFileSync(bin,[file,''+typed,'40','0'],{encoding:'utf8'}).trim().split('\n').map(l=>l.split(' ').map(Number));
  if(samples.some(s=>s[3]!==oracle))throw Error('Node mismatch');
  result.push({n,shape,typed,bytes:Buffer.byteLength(text),oracle,samples});
 }
}
if(mode==='measure')writeFileSync(join(dir,output),JSON.stringify({node:process.version,result},null,2)+'\n');
