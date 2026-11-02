// Adapted from L1 check.mjs: three entries, typed JS reference, larger inputs, boundary controls.
// Link an already-built archive through the production addon, without closure extraction.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {loadPromotion} from '../../packages/scriptc-promote/src/functions/promotion-runtime.mjs';
process.env.TZ='UTC';
const [work,library,variant='neutral']=process.argv.slice(2);
const dir=path.join(work,'builds',library,variant),req=createRequire(import.meta.url);
const report={library,variant,parity:{attempted:0,matched:0,mismatches:[],errors:[]},timingLabel:'local indicative, needs stand-in/hosted confirmation',host:{node:process.version,platform:process.platform,arch:process.arch},timings:[]};
const save=()=>fs.writeFileSync(new URL(`./check-${library}-${variant}.json`,import.meta.url),JSON.stringify(report,null,2)+'\n');
if(!process.argv.includes('--run')){
 let source=fs.readFileSync(new URL('../../packages/scriptc-promote/src/functions/promotion-addon.c',import.meta.url),'utf8');
 source=source.replace('/* TABLE */',[0,1,2,3].map(i=>`extern void rev_fn_${i}(const uint8_t *,size_t,const uint8_t **,size_t *);
static void invoke${i}(Job *j){const uint8_t *out=NULL;size_t len=0;rev_fn_${i}((uint8_t *)j->inputs[0].data,j->inputs[0].len,&out,&len);copy_output(j,out,len);}`).join('\n')+'\nstatic void (*entries[])(Job *)={invoke0,invoke1,invoke2,invoke3};\nstatic const Schema schemas[]={{1,{0},0},{1,{0},0},{1,{0},0},{1,{0},0}};');
 const {build}=createRequire(path.join(work,'package.json'))('esbuild');
 await build({entryPoints:[path.join(dir,'facade.ts')],bundle:true,platform:'node',format:'esm',outfile:path.join(dir,'reference.mjs')});
 fs.writeFileSync(path.join(dir,'addon.c'),source);
 const compile=spawnSync('clang',['-O2','-DSERIALIZED_RUNTIME','-fPIC','-I'+path.join(process.env.HOME,'Library/Caches/node-gyp',process.versions.node,'include/node'),path.join(dir,'addon.c'),path.join(dir,'functions.lib.a'),'-o',path.join(dir,'promotion.node'),'-bundle','-undefined','dynamic_lookup'],{encoding:'utf8'});
 report.link={exit:compile.status,diagnostic:compile.stderr};save();if(compile.status)process.exit(1);
 fs.writeFileSync(path.join(dir,'ids.json'),JSON.stringify([library]));fs.writeFileSync(path.join(dir,'encodings.json'),JSON.stringify({timing:false,functions:{[library]:{params:['string'],result:'string'}}}));
 const run=spawnSync(process.execPath,[new URL(import.meta.url).pathname,work,library,variant,'--run'],{encoding:'utf8',timeout:300000,maxBuffer:1024*1024});
 const existing=JSON.parse(fs.readFileSync(new URL(`./check-${library}-${variant}.json`,import.meta.url)));existing.process={exit:run.status,signal:run.signal,error:run.error?.message,stderr:run.stderr,stdout:run.stdout};fs.writeFileSync(new URL(`./check-${library}-${variant}.json`,import.meta.url),JSON.stringify(existing,null,2)+'\n');process.exit(0);
}
const addon=req(path.join(dir,'promotion.node'));
const {run:bundleRun}=await import(pathToFileURL(path.join(dir,'reference.mjs')));
const original=createRequire(path.join(work,'package.json'))(library);
const renderer=library==='markdown-it'?new original({html:false,linkify:false,typographer:false}):null;
const js=library==='fastest-levenshtein'?input=>{const p=JSON.parse(input);return String(original.distance(p.a,p.b));}:library==='json-2-csv'?input=>original.json2csv(JSON.parse(input)):library==='markdown-it'?renderer.render.bind(renderer):library==='dayjs'?input=>original(input).format('YYYY-MM-DD HH:mm:ss'):original;
const bundled=bundleRun;
const native=loadPromotion(path.join(dir,'promotion.node'),{mode:'native',log:()=>{},crashGuard:{directory:path.join(dir,'markers-native')}});
const auto=loadPromotion(path.join(dir,'promotion.node'),{jsSamples:1,sampleEvery:1,perMinute:1000,policy:{samples:1000,required:501,coldSamples:0},log:()=>{},crashGuard:{directory:path.join(dir,'markers-auto')}});
const texts=['','plain','"\'&<>','äé漢字🙂','a\u0000b','line\n\nnext','**bold** _em_ `code`','# title\n\n> quote','[x](https://example.test/?a=1&b=2)','<script>x</script>','- a\n  - b','```js\nconst x="<";\n```'];
const inputs=library==='fastest-levenshtein'?Array.from({length:240},(_,i)=>JSON.stringify({a:texts[i%texts.length].repeat(i%19),b:texts[(i*7+3)%texts.length].repeat((i*3)%23)})):library==='json-2-csv'?Array.from({length:240},(_,i)=>JSON.stringify(Array.from({length:i%17+1},(_,j)=>({id:j,text:texts[(i+j)%texts.length],meta:{note:texts[(i*3+j)%texts.length]}})))):library==='dayjs'?Array.from({length:240},(_,i)=>i===0?'':i===1?'invalid':`${1900+i%125}-${String(i%12+1).padStart(2,'0')}-${String(i%28+1).padStart(2,'0')}T12:34:56`):Array.from({length:240},(_,i)=>texts[i%texts.length]+(i<texts.length?'':('\n'+texts[(i*7)%texts.length]).repeat(i%7)));
for(const input of inputs){report.parity.attempted++;save();try{
 const expected=js(input);if(bundled(input)!==expected)throw Error('Bundled JS differs from original package');const actual=addon.run(0,[input]);
 if(Buffer.from(actual).equals(Buffer.from(expected)))report.parity.matched++;else report.parity.mismatches.push({index:report.parity.attempted-1,input,expected,actual});
 const dispatched=native.dispatch(library,js,[input]);if(dispatched!==expected)report.parity.errors.push('forced dispatcher mismatch '+(report.parity.attempted-1));
 auto.dispatch(library,js,[input]);while(auto.pending)await new Promise(resolve=>setTimeout(resolve,1));
 }catch(e){report.parity.errors.push({index:report.parity.attempted-1,message:String(e)});break;}}
const compact=s=>Object.fromEntries(Object.entries(s).map(([id,f])=>[id,{calls:f.calls,native:f.native,fallback:f.fallback,buckets:f.buckets.map(b=>({bucket:b.bucket,state:b.state,verified:b.verified,nativeAttempts:b.nativeAttempts,nativeFallbacks:b.nativeFallbacks}))}]));
report.inputSha256=createHash('sha256').update(JSON.stringify(inputs)).digest('hex');report.forcedDispatcher=compact(native.snapshot());report.shadowDispatcher=compact(auto.snapshot());save();
// Only time byte-correct implementations. Repeated asynchronous samples use the
// addon's caller+owner thread CPU accounting; JS uses the caller thread clock.
if(report.parity.matched===inputs.length&&!report.parity.errors.length){
 for(const repeats of [1,16,128,4096]){
 const input=library==='fastest-levenshtein'?JSON.stringify({a:'abcDEF0123456789'.repeat(repeats===4096?2:repeats),b:'abdDEF0123456780'.repeat(repeats===4096?8192:repeats)}):library==='json-2-csv'?JSON.stringify(Array.from({length:repeats},(_,i)=>({id:i,text:texts[i%texts.length],meta:{note:'nested, \"value\" 🙂'}}))):library==='dayjs'?'2024-06-15T12:34:56':texts.slice(2).join('\n\n').repeat(repeats),pairs=[];
 for(let i=0;i<40;i++){
 const begin=addon.threadCpuMs();const expected=js(input);const jsMs=addon.threadCpuMs()-begin;
 const sample=await addon.runShadow(0,[input]);const echo=await addon.runShadow(1,[input]);const parse=await addon.runShadow(2,[input]);const sink=await addon.runShadow(3,[input]);if(echo.value!==input||parse.value!==input)throw Error('Control mismatch');if(sample.value!==expected)throw Error('Timing parity failure');if(i>=5)pairs.push({jsMs,nativeMs:sample.cpuMs,echoMs:echo.cpuMs,parseMs:parse.cpuMs,sinkMs:sink.cpuMs});
 }
 const median=a=>a.sort((a,b)=>a-b)[Math.floor(a.length/2)];
 report.timings.push({inputBytes:Buffer.byteLength(input),outputBytes:Buffer.byteLength(js(input)),samples:pairs.length,sinkMedianMs:median(pairs.map(p=>p.sinkMs)),echoMedianMs:median(pairs.map(p=>p.echoMs)),parseMedianMs:median(pairs.map(p=>p.parseMs)),jsMedianMs:median(pairs.map(p=>p.jsMs)),nativeMedianMs:median(pairs.map(p=>p.nativeMs)),pairs});save();
 }
}
if(library==='json-2-csv'){report.emptyInput={};for(const [name,call] of [['js',()=>js('[]')],['native',()=>addon.run(0,['[]'])],['dispatcher',()=>native.dispatch(library,js,['[]'])]]){try{report.emptyInput[name]={value:call()};}catch(e){report.emptyInput[name]={error:String(e)};}}}

save();
