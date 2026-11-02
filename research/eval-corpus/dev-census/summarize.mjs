// Aggregate only frozen DEV artifacts; message baselines are kept separate.
import fs from 'node:fs';import path from 'node:path';import {gunzipSync,gzipSync} from 'node:zlib';
const dir='research/eval-corpus/dev-census',manifest=JSON.parse(fs.readFileSync('research/eval-corpus/manifest.json'));
const read=p=>JSON.parse(p.endsWith('.gz')?gunzipSync(fs.readFileSync(p)):fs.readFileSync(p));
import {category,intrinsicRefusal} from './categories.mjs';
import {isMeasuredSource} from './scope-policy.mjs';
const repos=[],functions=[],before={};
for(const repo of manifest.repositories.filter(r=>r.split==='DEV')){
 const slug=repo.repository.split('/')[1],p=path.join(dir,slug+'.json');if(!fs.existsSync(p)&&!fs.existsSync(p+'.gz'))continue;
 const data=read(fs.existsSync(p+'.gz')?p+'.gz':p);if(data.repository!==repo.repository||data.sha!==repo.sha)throw Error('pin mismatch');
 const supplementPath=path.join(dir,'supplements',slug+'.json.gz');const supplement=fs.existsSync(supplementPath)?read(supplementPath):null;
 const scans=[...(data.scans??[]),...(supplement?.scans??[])].filter(s=>!s.excludedFromServerCensus);
 const rows=new Map(),parserErrors=new Map();let considered=0,accepted=0,diagnosed=0;
 for(const scan of scans){const report=scan.report;if(!report)continue;const prefix=scan.scanRoot==='.'?'':scan.scanRoot+'/';
  for(const e of report.fileErrors??[])if(isMeasuredSource(prefix+e.source))parserErrors.set(prefix+e.source,e);
  const evidence=scan.ev1?.environment?.files??[],graph=new Map(evidence.map(x=>[x.file,x.imports]));
  function unresolved(file,seen=new Set()) {if(seen.has(file))return [];seen.add(file);return (graph.get(file)??[]).flatMap(i=>i.resolved?unresolved(i.resolved,seen):/^(node:|fs$|path$|util$|crypto$|http$|https$|stream$|os$|events$|url$|assert$|buffer$|zlib$|net$|tls$|child_process$|worker_threads$)/.test(i.specifier)?[]:[{file,specifier:i.specifier}]);}
  for(const f of report.files.flatMap(f=>f.functions)){
   const key=prefix+f.id;if(!isMeasuredSource(prefix+f.file)||rows.has(key))continue;
   const diagnostics=[...new Set(f.diagnostics)],cat=diagnostics.length?category(diagnostics[0]):null;
   const missing=diagnostics.length?unresolved(f.file):[],configErrors=scan.ev1?.environment?.configErrors??[];
   // Pure syntax/effect/work refusals do not depend on installing types.
   const intrinsic=intrinsicRefusal(diagnostics[0]??'');
   const state=!diagnostics.length?null:intrinsic?'real':missing.length||configErrors.length?'environment-affected':data.install?.exit!==0?'uncertain (install failed)':!scan.ev1?.environment?.includesDeclarationImports?'uncertain (resolver evidence incomplete)':'real';
   const row={repository:repo.repository,sha:repo.sha,id:key,file:prefix+f.file,name:f.name,line:f.line,status:f.status,typescriptVersion:scan.ev1?.environment?.typescript??null,compilerHostMode:scan.reportProcess.command?.some(a=>a.endsWith('/typescript-host.mjs'))?'compatible override':'app compiler',category:cat,classification:state,diagnostics,configErrors,unresolved:missing.slice(0,12),url:`${repo.url}/blob/${repo.sha}/${prefix+f.file}#L${f.line}`};rows.set(key,row);functions.push(row);
  }
  considered+=report.counts.considered;accepted+=report.counts.accepted;diagnosed+=report.counts.diagnosed;
 }
 const scannedFiles=new Set(scans.flatMap(scan=>(scan.report?.files??[]).map(f=>(scan.scanRoot==='.'?'':scan.scanRoot+'/')+f.file)).filter(isMeasuredSource));
 const omissions=(data.scopePartitionOmissions??[]).filter(f=>!scannedFiles.has(f)&&!supplement?.excluded.includes(f));
 const unique=[...rows.values()];considered=unique.filter(f=>f.status!=='excluded').length;diagnosed=unique.filter(f=>f.diagnostics.length).length;accepted=unique.filter(f=>f.status==='accepted').length;
 const count={files:scannedFiles.size,considered,diagnosed,accepted,parserFiles:parserErrors.size,inventory:rows.size};repos.push({repository:repo.repository,status:data.status,installExit:data.install?.exit,scopes:data.scopes,counts:count,supplementArtifact:supplement?path.relative(dir,supplementPath):null,remainingPartitionOmissions:omissions,supplementedFiles:scannedFiles.size,scanFailures:scans.filter(s=>s.reportProcess.exit!==0).map(s=>({scope:s.scope,error:s.reportProcess.output})),parserExamples:[...parserErrors.entries()].slice(0,3)});
 // DEV-only EV1 message baseline, not a matched function denominator.
 if(repo.census.artifact){let b=path.join('research/eval-corpus',repo.census.artifact);if(!fs.existsSync(b))b+='.gz';if(fs.existsSync(b)){const old=read(b);for(const msg of old.logs??[]) {let c=category(msg);before[c]=(before[c]??0)+1;}}}
}
const histogram={};for(const f of functions.filter(f=>f.diagnostics.length)){let h=histogram[f.classification]??={};h[f.category]=(h[f.category]??0)+1;}
const result={repos,histogram,ev1DevMessages:before,functions},bytes=Buffer.from(JSON.stringify(result,null,2));
fs.writeFileSync(path.join(dir,'summary.json.gz'),gzipSync(bytes,{level:9}));fs.rmSync(path.join(dir,'summary.json'),{force:true});
console.log(JSON.stringify({repos:repos.map(r=>({repo:r.repository,status:r.status,...r.counts})),histogram,before},null,2));
