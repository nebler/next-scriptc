import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {regions} from './regions.mjs';
const ts=createRequire((process.env.COVERAGE_APPS??'/Users/noah/code/coverage-apps')+'/umami/census.cjs')('typescript');
const file='/tmp/a0-validation.ts';
const text=`declare function fetchData():Promise<number[]>;
const moduleConstant=3;
async function example(input:number[]){
 const data=await fetchData();
 let sum=0; for(const x of data) sum+=x;
 const output={sum};
 await fetchData();
 return output;
}
async function mutate(xs:number[]){let count=0;await fetchData(); for(const x of xs)count+=x; await fetchData();return count;}
async function boundary(xs:number[]){try{for(const x of xs){if(x)return x;}await fetchData();}finally{xs.map(x=>x+1);}for(const x of xs){await fetchData();}}
async function overwrite(){let n=0;await fetchData();n=3;await fetchData();return n;}
const arrow=async (xs:number[])=>xs.map(x=>x+moduleConstant);
`;
const host=ts.createCompilerHost({strict:true,target:ts.ScriptTarget.ESNext});const read=host.readFile.bind(host);host.readFile=p=>p===file?text:read(p);const exists=host.fileExists.bind(host);host.fileExists=p=>p===file||exists(p);
const program=ts.createProgram([file],{strict:true,target:ts.ScriptTarget.ESNext},host),sf=program.getSourceFile(file),found=regions(ts,program.getTypeChecker(),sf);
assert.equal(found.functions,5);assert.equal(found.barriers.awaitLoops,1);
const run=found.regions.find(r=>r.function==='example'&&r.liveOuts.some(v=>v.name==='output'));
assert.deepEqual(run.liveIns.map(v=>v.name),['data']);assert.deepEqual(run.liveOuts.map(v=>v.name),['output']);
const after=found.regions.find(r=>r.function==='example'&&r.terminalReturn);assert.deepEqual(after.liveIns.map(v=>v.name),['output']);
const mutable=found.regions.find(r=>r.function==='mutate'&&r.liveOuts.some(v=>v.name==='count')&&r.liveIns.some(v=>v.name==='xs'));assert(mutable.liveIns.some(v=>v.name==='count'));
assert(found.regions.some(r=>r.earlyReturn));const arrow=found.regions.find(r=>r.expression);assert.deepEqual(arrow.liveIns.map(v=>v.name),['xs']);
assert.equal(found.regions.some(r=>text.slice(r.start,r.end).includes('await')),false);
const overwritten=found.regions.find(r=>r.function==='overwrite'&&text.slice(r.start,r.end)==='n=3;');assert.deepEqual(overwritten.liveIns,[]);assert.deepEqual(overwritten.liveOuts.map(v=>v.name),['n']);
console.log('A0 liveness, shorthand, mutation, control, await-loop and expression-arrow fixtures pass');
