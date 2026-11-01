import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {stat} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {Worker} from 'node:worker_threads';
import assert from 'node:assert/strict';
import {addonPath,addon,args,hash,scratch,save} from './common.mjs';
const {revenue}=await import(scratch+'/stage/revenue-js.ts');
const expected=hash(JSON.stringify(await revenue(...args(1000))));
const serial=!!process.env.NAPI_SERIALIZED;
const selectedPath=serial?addonPath.replace('.node','-serialized.node'):addonPath;
const a=createRequire(import.meta.url)(selectedPath);
const before=a.diagnostics();
const unicode=['','x','é😀\u0000漢字','\ud800','a'.repeat(100000)];
for(const text of unicode)assert.equal(a.echo(text),Buffer.from(text).toString('utf8'));
const afterInit=a.diagnostics();assert.deepEqual(afterInit,{...before,threads:before.threads+(serial?1:0)});
await Promise.all(Array.from({length:16},()=>stat(addonPath)));const beforeAsync=a.diagnostics();
let ticks=0;const timer=setInterval(()=>ticks++,1);
const values=await Promise.all(Array.from({length:32},()=>a.revenueJsonAsync(JSON.stringify(args(1000)))));
clearInterval(timer);values.forEach(v=>assert.equal(hash(v),expected));
const afterAsync=a.diagnostics();assert.deepEqual(afterAsync,beforeAsync);
const invalid=spawnSync(process.execPath,['--input-type=module','-e',`
import {createRequire} from 'node:module';
const a=createRequire(import.meta.url)(${JSON.stringify(selectedPath)});
const out={};try{a.revenueJson('{');}catch(e){out.first=String(e);}
try{a.revenueJson(${JSON.stringify(JSON.stringify(args(1000)))});}catch(e){out.second=String(e);}
try{out.sibling=await a.revenueJsonAsync(${JSON.stringify(JSON.stringify(args(1000)))});}catch(e){out.siblingError=String(e);}
console.log(JSON.stringify(out));`],{encoding:'utf8'});
assert.equal(invalid.status,0,invalid.stderr);const errors=JSON.parse(invalid.stdout);assert.match(errors.first,/Uncaught|SyntaxError|SC4013/);assert.match(errors.second,/poisoned/);if(serial)assert.match(errors.siblingError,/poisoned/);else assert.equal(hash(errors.sibling),expected);delete errors.sibling;
// Independent Node worker isolates load the same addon, on separate OS threads.
const workers=await Promise.all(Array.from({length:4},()=>new Promise((resolve,reject)=>{
 const w=new Worker(`const {parentPort}=require('node:worker_threads');const a=require(${JSON.stringify(selectedPath)});let result;for(let i=0;i<100;i++)result=a.revenueJson(${JSON.stringify(JSON.stringify(args(1000)))});parentPort.postMessage(result);`,{eval:true});
 w.on('message',v=>{assert.equal(hash(v),expected);resolve({sha256:hash(v),calls:100});});w.on('error',reject);
})));
await save(serial?'coexist-serialized':'coexist',{node:process.version,before,afterInit,beforeAsync,afterAsync,timerTicksDuringAsync:ticks,concurrentCalls:32,workers,unicode:unicode.map(v=>({utf8Bytes:Buffer.byteLength(v),sha256:hash(Buffer.from(v).toString('utf8'))})),poisonTest:{status:invalid.status,...errors}});
console.log('coexist passed',before,afterAsync,'ticks',ticks);
