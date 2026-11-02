// Static census of an arbitrary checkout. The caller owns dependency installation.
// node census.mjs /tmp/clone scope [scope ...] > result.json
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {readdir,readFile} from 'node:fs/promises';
import {discoverPromotions} from '../../packages/scriptc-promote/src/functions/promotion-discovery.mjs';
const root=path.resolve(process.argv[2]), scopes=process.argv.slice(3);
if(!scopes.length)throw Error('Supply explicit source scopes');
const logs=[], accepted=[], errors=[],considered=[],diagnostics=[],fileErrors=[];let files=0;
for(const scope of scopes){
 try{
  async function count(dir){for(const e of await readdir(dir,{withFileTypes:true})){
   if(e.name.startsWith('.')||['node_modules','test','tests'].includes(e.name))continue;
   if(e.isDirectory())await count(path.join(dir,e.name));else if(/\.[cm]?[jt]sx?$/.test(e.name))files++;
  }}
  await count(path.join(root,scope));
  const modules=await discoverPromotions(root,path.join(root,'dist'),{promotionSourceDir:scope,onConsidered:d=>considered.push({file:path.relative(root,d.source),name:d.name}),onDiagnostic:d=>diagnostics.push({file:path.relative(root,d.source),name:d.name,message:d.message.replaceAll(root,'<app>')}),onFileError:d=>fileErrors.push({...d,source:path.relative(root,d.source)})},s=>logs.push(s.replaceAll(root,'<app>')));
  for(const m of modules)for(const f of m.functions){
   const source=await readFile(m.source,'utf8');
   accepted.push({file:path.relative(root,m.source),name:f.name,line:source.slice(0,source.indexOf(f.name)).split('\n').length,boundary:f.boundary});
  }
 }catch(e){errors.push({scope,error:e.message.replaceAll(root,'<app>')});}
}
function category(s){return /runtime import|opaque import/.test(s)?'runtime import':/no loop/.test(s)?'work screen':/mutation/.test(s)?'mutation':/any, unknown|JSON data|type undefined/.test(s)?'broad/unresolved boundary':/strict closure/.test(s)?'strict closure':/purity/.test(s)?'effects':/unsupported|reference/.test(s)?'unsupported reference/type':'other';}
let environment;try{environment=process.env.DEV_CENSUS_SKIP_ENVIRONMENT?{skipped:'Explicit resource-limited discovery-only retry'}:(await import('./dev-census/environment.mjs')).environmentEvidence(root,scopes);}catch(e){environment={error:e.message.replaceAll(root,'<app>')};}
const counts={};for(const s of logs){const c=category(s);counts[c]=(counts[c]??0)+1;}
console.log(JSON.stringify({sha:execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),scopes,files,considered,diagnostics,fileErrors,accepted,counts,logs,errors,environment,mode:'static discovery; caller supplies dependency installation status'},null,2));
