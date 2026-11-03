import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir,rm} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {parseProfile,profileReport,formatProfile} from '../src/report-profile.mjs';
const frame=(url,functionName,lineNumber=0,columnNumber=0)=>({url,functionName,lineNumber,columnNumber});
const capture=(frames,samples=[2,3,3],timeDeltas=[10,20,30])=>({nodes:frames.map((callFrame,i)=>({id:i+1,callFrame,children:i===0?[2]:i===1?[3]:[]})),samples,timeDeltas});
test('profile timing, absent deltas, malformed nodes, samples and cycles',()=>{
 const p=capture([frame('','root'),frame('','a'),frame('','b')]);assert.equal(parseProfile(p).totalUs,60);
 assert.match(parseProfile({...p,timeDeltas:undefined,startTime:0,endTime:90}).timing,/uniform/);
 for(const bad of [{...p,timeDeltas:[1]},{...p,samples:[99]},{...p,timeDeltas:[-1,2,3]},{...p,nodes:[...p.nodes,p.nodes[0]]},{...p,nodes:p.nodes.map(n=>({...n,children:[n.id]}))}])assert.throws(()=>parseProfile(bad));
});
test('bundled minified map, statuses, inclusive recursion, ranking, ratios and heuristic honesty',async()=>{
 const root=await mkdtemp('/tmp/p3-test-');
 try{
  await mkdir(path.join(root,'lib'));await mkdir(path.join(root,'.next/server'),{recursive:true});
  await writeFile(path.join(root,'lib/a.ts'),'export function accepted(x: number) { return x * x; }\nexport function blocked(x: number) { return x + 1; }\nexport async function asyncCore() { return 42; }\n');
  const generated=path.join(root,'.next/server/chunk.js');
  await writeFile(generated,'function a(x){return x*x}function b(x){return x+1}\n//# sourceMappingURL=chunk.js.map');
  await writeFile(generated+'.map',JSON.stringify({version:3,sources:['../../lib/a.ts'],names:[],mappings:'AAAA,yBACA'}));
  const rows=['accepted','blocked','asyncCore'].map((name,i)=>({id:`lib/a.ts#${name}`,file:'lib/a.ts',name,line:i+1,status:i===0?'accepted':i===1?'rejected':'excluded',async:i===2,diagnostics:i===1?["strict closure: Object is possibly 'undefined'."]:[]}));
  const report={root,files:[{file:'lib/a.ts',functions:rows}],measurements:[{id:rows[0].id,status:'ok',metric:'thread-cpu',js:{median:100},native:{median:25}}]};
  const p=capture([frame('','root'),frame(pathToFileURL(generated).href,'a',0,0),frame(pathToFileURL(generated).href,'b',0,25)]);
  const f=path.join(root,'one.cpuprofile');await writeFile(f,JSON.stringify(p));
  const result=await profileReport(report,[f],{suggest:true});
  assert.equal(result.mappedSelfShare,1);assert.equal(result.functions[0].name,'blocked');assert.equal(result.functions[0].status,'rejected');assert.equal(result.functions[0].selfUs,50);
  assert.deepEqual(result.functions[0].confidence,['source-map']);assert.match(result.hotBlocked[0].blockers[0].hint,/Guard/);
  const accepted=result.functions.find(r=>r.name==='accepted');assert.equal(accepted.inclusiveUs,60);assert.equal(accepted.potential.share,10/60*.75);
  assert.match(formatProfile(result),/Hot but blocked/);assert.ok(result.suggestions.length);
  const heuristic=capture([frame('','root'),frame('webpack://app/./lib/a.ts','asyncCore'),frame('node:internal','other')]);
  await writeFile(f,JSON.stringify(heuristic));const h=await profileReport(report,[f,f],{suggest:true});assert.equal(h.totalUs,120);assert.equal(h.mappedSelfUs,20);
  assert.match(h.functions[0].confidence[0],/heuristic/);assert.equal(h.hotBlocked[0].async,true);assert.match(h.suggestions[0],/synchronous CPU core/);assert.match(h.functions[0].potential.kind,/ceiling only/);
  // Repeated source frames must contribute inclusive duration only once.
  await writeFile(f,JSON.stringify(capture([frame('','root'),frame('webpack://app/./lib/a.ts','accepted'),frame('webpack://app/./lib/a.ts','accepted')])));
  const recursive=await profileReport(report,[f]);assert.equal(recursive.functions[0].inclusiveUs,60);assert.equal(recursive.functions[0].selfUs,60);
  report.measurements[0].metric='wall';const wall=await profileReport(report,[f]);assert.match(wall.functions[0].potential.kind,/ceiling only/);
  rows[0].runtime={buckets:[{decision:{metric:'thread-cpu',samples:24,ratio:.5}}]};const snapshot=await profileReport(report,[f]);assert.equal(snapshot.functions[0].potential.share,.5);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('inline indexed map honors sourceRoot; idle is excluded and all-idle is finite',async()=>{
 const root=await mkdtemp('/tmp/p3-map-');try{
  await mkdir(path.join(root,'src'));await writeFile(path.join(root,'src/a.ts'),'export function a() { return 1; }');
  const map={version:3,sections:[{offset:{line:0,column:0},map:{version:3,sourceRoot:'src',sources:['a.ts'],names:[],mappings:'AAAA'}}]};
  const js=path.join(root,'bundle.js');await writeFile(js,'function z(){return 1}\n//# sourceMappingURL=data:application/json;base64,'+Buffer.from(JSON.stringify(map)).toString('base64'));
  const row={id:'src/a.ts#a',file:'src/a.ts',name:'a',line:1,status:'explicit',diagnostics:[]};
  const report={root,files:[{functions:[row]}]},file=path.join(root,'p.cpuprofile');
  await writeFile(file,JSON.stringify(capture([frame('','root'),frame(pathToFileURL(js).href,'z'),frame('','(idle)')])));
  const result=await profileReport(report,[file]);assert.equal(result.totalUs,10);assert.equal(result.idleUs,50);assert.equal(result.functions[0].selfShare,1);assert.equal(result.functions[0].status,'explicit');assert.deepEqual(result.functions[0].confidence,['source-map']);
  await writeFile(file,JSON.stringify(capture([frame('','root'),frame('','a'),frame('','(idle)')],[3],[100])));
  const idle=await profileReport(report,[file]);assert.equal(idle.totalUs,0);assert.equal(idle.mappedSelfShare,0);assert.doesNotMatch(formatProfile(idle),/NaN|Infinity/);
  await writeFile(path.join(root,'src/method.ts'),'class C { async core() { return 42; } }');report.files.push({file:'src/method.ts',functions:[]});
  await writeFile(file,JSON.stringify(capture([frame('','root'),frame(pathToFileURL(path.join(root,'src/method.ts')).href,'core',0,10),frame('','unknown')])));
  const method=await profileReport(report,[file]);assert.equal(method.functions[0].name,'core');assert.equal(method.functions[0].async,true);assert.equal(method.functions[0].status,'excluded');assert.deepEqual(method.functions[0].confidence,['source-position']);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('profile joins real discovery and the repeatable CLI flags',async()=>{
 const {coverageReport}=await import('../src/report.mjs');const {execFileSync}=await import('node:child_process');
 const fixture=new URL('./support/fixtures/report/next/',import.meta.url).pathname;
 const dir=await mkdtemp('/tmp/p3-cli-');try{
  const report=await coverageReport(fixture),rows=report.files.flatMap(f=>f.functions),accepted=rows.find(r=>r.status==='accepted'),rejected=rows.find(r=>r.status==='rejected');
  const f=path.join(dir,'p.cpuprofile'),json=path.join(dir,'report.json');
  await writeFile(f,JSON.stringify(capture([frame('','root'),frame('webpack://app/'+accepted.file,accepted.name),frame('webpack://app/'+rejected.file,rejected.name)])));
  execFileSync(process.execPath,[new URL('../src/cli.mjs',import.meta.url).pathname,'report',fixture,'--profile',f,'--profile',f,'--suggest','--json',json]);
  const {readFile}=await import('node:fs/promises');const joined=JSON.parse(await readFile(json,'utf8')).profile;
  assert.equal(joined.captures.length,2);assert.equal(joined.functions.find(r=>r.id===accepted.id).status,'accepted');assert.deepEqual(joined.hotBlocked.find(r=>r.id===rejected.id).diagnostics,rejected.diagnostics);assert.ok(joined.suggestions.length);
 }finally{await rm(dir,{recursive:true,force:true});}
});
