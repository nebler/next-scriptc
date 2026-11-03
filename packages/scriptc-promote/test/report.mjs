import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm,readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {coverageReport,formatReport} from '../src/report.mjs';
import {compilerPath} from '../src/paths.mjs';
const fixtures=new URL('./support/fixtures/report/',import.meta.url).pathname;
for(const framework of ['next','nitro','sveltekit'])test(`coverage: ${framework} counts, exact diagnostics and route reachability`,async()=>{
 const report=await coverageReport(path.join(fixtures,framework));
 assert.equal(report.framework,framework);assert.equal(report.counts.totalTopLevelFunctions,5);assert.equal(report.counts.considered,3);assert.equal(report.counts.accepted,1);assert.equal(report.counts.diagnosed,2);assert.equal(report.counts.silentExclusions,2);
 assert.equal(report.nearestMisses.length,2);assert.match(report.nearestMisses.find(r=>r.id.endsWith('#tiny')).diagnostic,/work: no loop/);
 assert.equal(report.routes.length,1);assert.ok(report.routes[0].reachable.some(id=>id.endsWith('#sum')),JSON.stringify(report.routes));assert.match(formatReport(report),/not a complete denominator/);
});
test('coverage CLI JSON, Markdown, source scope and Next delegation',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'report-cli-'));try{
 const root=path.join(fixtures,'next'),json=path.join(dir,'report.json'),md=path.join(dir,'report.md');
 execFileSync(process.execPath,[new URL('../../next-scriptc/src/cli.mjs',import.meta.url).pathname,'report',root,'--framework','next','--source-dir','app','--json',json,'--md',md]);
 assert.equal(JSON.parse(await readFile(json)).counts.accepted,1);assert.match(await readFile(md,'utf8'),/# Promotion coverage report/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('coverage measurement: compute-dense native and object-heavy JS', {timeout:180000},async t=>{
 try{execFileSync(compilerPath(),['--version'],{stdio:'pipe'});execFileSync('clang',['--version'],{stdio:'pipe'});}catch{t.skip('Stock scriptc/native toolchain unavailable');return;}
 const dir=await mkdtemp(path.join(tmpdir(),'report-measure-'));try{
 // Resolve application TypeScript from this worktree without linking dependencies.
 const root=await mkdtemp(path.join(fixtures,'.measure-'));const source=path.join(root,'compute.ts');await writeFile(path.join(root,'tsconfig.json'),JSON.stringify({compilerOptions:{strict:true,target:'ESNext'}}));
 await writeFile(source,"// Scalar JSON boundary; typed storage stays inside the pure function.\nexport function numeric(n: number): number {\n const a = new Int32Array(1024);\n for(let j=0;j<1024;j++) a[j]=(j*17+13)|0;\n let total=0;\n for(let i=0;i<n;i++) {\n  for(let j=0;j<1024;j++) {\n   const x=a[j];\n   a[j]=(Math.imul(x,1664525)+1013904223)|0;\n   total=(total+(a[j]>>>16))|0;\n  }\n }\n return total;\n}\n"+'\nexport function objects(rows:{n:number;s:string}[]):number {let x=0;for(const row of rows)x+=row.n;return x;}\nexport function synthetic(rows:{n:number}[]):number {let x=0;for(const row of rows)x+=row.n;return x;}\nexport function objectFields(row:{a?:number;b?:number}):boolean{return Object.values(row).every(n=>n===undefined);}');
 try{const input=path.join(dir,'inputs.json');await writeFile(input,JSON.stringify({[path.basename(source)+'#numeric']:[[1000]],[path.basename(source)+'#objectFields']:[[[]],[{a:1,b:2}]],[path.basename(source)+'#objects']:[[],[Array.from({length:6000},(_,n)=>({n,s:'payload'}))]]}));
 const report=await coverageReport(root,{measure:true,root,inputs:input});
 const poison=report.measurements.find(r=>r.id.endsWith('#objectFields')&&r.inputIndex===0),afterPoison=report.measurements.find(r=>r.id.endsWith('#objectFields')&&r.inputIndex===1);assert.equal(poison.status,'unmeasured',JSON.stringify(poison));assert.match(poison.reason,/SC4013/);assert.equal(afterPoison.status,'ok',JSON.stringify(afterPoison));
 const numeric=report.measurements.find(r=>r.id.endsWith('#numeric')),objects=report.measurements.find(r=>r.id.endsWith('#objects')&&r.status==='ok');
 const invalid=report.measurements.find(r=>r.id.endsWith('#objects')&&r.inputIndex===0);assert.equal(invalid.status,'unmeasured');assert.match(invalid.reason,/argument count/i);assert.equal(objects.inputIndex,1);
 if(numeric?.status==='compile-rejected'&&/not found|permission|ENOENT|headers|checker|llvm/i.test(numeric.reason)){t.skip('Native build prerequisites unavailable: '+numeric.reason.slice(0,200));return;}
 assert.ok(numeric,JSON.stringify(report));assert.equal(numeric.status,'ok',JSON.stringify(numeric));assert.equal(objects.status,'ok',JSON.stringify(objects));assert.equal(numeric.verdict,'native',JSON.stringify(numeric));assert.equal(objects.verdict,'JS');assert.equal(numeric.js.n,24);assert.equal(objects.inputSource,'user-provided');assert.ok(objects.boundaryShare>0);assert.ok(objects.computeIntensity>0);const synthetic=report.measurements.find(r=>r.id.endsWith('#synthetic'));assert.equal(synthetic.status,'ok',JSON.stringify(synthetic));assert.equal(synthetic.inputSource,'synthetic');
 }finally{await rm(root,{recursive:true,force:true});}
 }finally{await rm(dir,{recursive:true,force:true});}
});
