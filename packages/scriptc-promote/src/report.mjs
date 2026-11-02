import {createHash} from 'node:crypto';
import {extractFunctions} from './functions/extract.mjs';
import {createRequire} from 'node:module';
import {readFile, writeFile, readdir, mkdtemp, rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {discoverPromotions} from './functions/promotion-discovery.mjs';
const require=createRequire(import.meta.url);
const ignored=new Set(['node_modules','research','test','tests']);
const relative=(root,file)=>path.relative(root,file).split(path.sep).join('/');
async function files(dir,distDir){const out=[];for(const e of await readdir(dir,{withFileTypes:true})){if(e.name.startsWith('.')||ignored.has(e.name)||e.isSymbolicLink())continue;const f=path.join(dir,e.name);if(f===distDir)continue;if(e.isDirectory())out.push(...await files(f,distDir));else if(/\.[cm]?[jt]sx?$/.test(f))out.push(f);}return out.sort();}
export async function detectFramework(root){
 let pkg={};try{pkg=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));}catch{}
 const deps={...pkg.dependencies,...pkg.devDependencies},names=await readdir(root);
 for(const [name,dep,config] of [['next','next',/^next\.config\./],['sveltekit','@sveltejs/kit',/^svelte\.config\./],['astro','astro',/^astro\.config\./],['react-router','@react-router/dev',/^react-router\.config\./],['tanstack','@tanstack/react-start',/^app\.config\./],['nitro','nitropack',/^(nitro|nuxt)\.config\./],['cloudflare','wrangler',/^wrangler\./],['vite','vite',/^vite\.config\./]])if(deps[dep]||(name==='nitro'&&(deps.nitro||deps.nuxt))||names.some(n=>config.test(n)))return name;
 return 'generic';
}
function routeKind(file,framework){
 if(framework==='next'&&/(^|\/)(app\/.*\/(route|page)|app\/(route|page)|pages\/.+)\.[^.]+$/.test(file))return /(^|\/)pages\/api\//.test(file)||/\/route\./.test(file)?'endpoint':'page';
 if(framework==='sveltekit'&&/(^|\/)routes\/.*\+(server|page\.server)\.[^.]+$/.test(file))return 'server';
 if(framework==='nitro'&&/(^|\/)server\/(api|routes)\//.test(file))return 'endpoint';
 if(framework==='astro'&&/(^|\/)pages\/.*\.[cm]?[jt]s$/.test(file))return 'endpoint';
 if(framework==='react-router')return 'loader/action';
 if(framework==='tanstack')return 'server-function';
 return null;
}
function explanation(message){
 if(/work:/.test(message))return 'No substantial compute pattern was found; small calls often cost more to cross the boundary.';
 if(/purity:/.test(message))return 'Native promotion requires deterministic work without observable external effects or mutation.';
 if(/JSON|parameter|return|strict closure/.test(message))return 'The existing boundary/type checker could not prove a supported argument or result contract.';
 return 'The existing extractor could not close and validate this function; see the exact diagnostic.';
}
export async function coverageReport(directory='.',options={}){
 const root=path.resolve(directory),framework=options.framework??await detectFramework(root);
 if(!['next','nitro','sveltekit','astro','react-router','tanstack','cloudflare','vite','generic'].includes(framework))throw Error(`Unknown framework: ${framework}`);
 const sourceDir=path.resolve(root,options.sourceDir??'.'),sources=await files(sourceDir,path.join(root,'dist'));
 const ts=require(require.resolve('typescript',{paths:[root,path.dirname(fileURLToPath(import.meta.url))]}));
 const configFile=path.join(root,'tsconfig.json'),loaded=ts.readConfigFile(configFile,ts.sys.readFile);
 const parsed=ts.parseJsonConfigFileContent(loaded.config??{compilerOptions:{strict:true}},ts.sys,root);
 const program=ts.createProgram({rootNames:[...new Set([...sources,...parsed.fileNames])],options:{...parsed.options,allowJs:true,checkJs:false,noEmit:true}}),checker=program.getTypeChecker();
 const explicitDirective=node=>{for(const s of node?.statements??[]){if(!ts.isExpressionStatement(s)||!ts.isStringLiteral(s.expression))break;if(s.expression.text==='use native')return true;}return false;};
 const rows=[],byDeclaration=new Map(),internals=new Map();
 for(const file of sources){const sf=program.getSourceFile(file);if(!sf)continue;
  const add=(node,name,declaration,exported)=>{const row={id:`${relative(root,file)}#${name}`,file:relative(root,file),name,line:sf.getLineAndCharacterOfPosition(node.getStart(sf)).line+1,exported,async:!!node.modifiers?.some(m=>m.kind===ts.SyntaxKind.AsyncKeyword),explicit:explicitDirective(sf)&&exported||explicitDirective(node.body),status:'excluded',diagnostics:[],calls:[]};rows.push(row);byDeclaration.set(declaration,row);internals.set(row,{node,sf});};
  for(const stmt of sf.statements){const exported=!!stmt.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword);
   if(ts.isFunctionDeclaration(stmt)&&stmt.body)add(stmt,stmt.name?.text??'default',stmt,exported);
   if(ts.isVariableStatement(stmt))for(const d of stmt.declarationList.declarations){if(!ts.isIdentifier(d.name)||!d.initializer)continue;let f=d.initializer;if(ts.isArrowFunction(f)||ts.isFunctionExpression(f))add(f,d.name.text,d,exported);else if(ts.isCallExpression(f)||ts.isObjectLiteralExpression(f)){const callbacks=[];function visit(n){if(ts.isArrowFunction(n)||ts.isFunctionExpression(n)||ts.isMethodDeclaration(n))callbacks.push(n);else ts.forEachChild(n,visit);}visit(f);if(callbacks.length)add(f,d.name.text,d,exported);}}
   if(ts.isExportAssignment(stmt)){let callable=false;function visit(n){if(ts.isArrowFunction(n)||ts.isFunctionExpression(n))callable=true;else ts.forEachChild(n,visit);}visit(stmt.expression);if(callable)add(stmt.expression,'default',stmt,true);}
  }
 }
 for(const sf of program.getSourceFiles()){const symbol=checker.getSymbolAtLocation(sf);if(!symbol)continue;for(let exported of checker.getExportsOfModule(symbol)){const exportName=exported.name;if(exported.flags&ts.SymbolFlags.Alias)try{exported=checker.getAliasedSymbol(exported);}catch{}for(const d of exported.declarations??[]){const row=byDeclaration.get(d);if(row){row.exported=true;(row.exportNames??=[]).push(exportName);}}}}
 for(const row of rows){const {node,sf}=internals.get(row);if(row.exported&&explicitDirective(sf))row.explicit=true;const edges=new Set();function visit(n){if(ts.isIdentifier(n)){let sym=checker.getSymbolAtLocation(n);if(sym?.flags&ts.SymbolFlags.Alias)try{sym=checker.getAliasedSymbol(sym);}catch{}for(const d of sym?.declarations??[]){const target=byDeclaration.get(d);if(target&&target!==row)edges.add(target.id);}}ts.forEachChild(n,visit);}visit(node);row.calls=[...edges].sort();}
 const considered=new Set(),diagnostics=[];
 const modules=await discoverPromotions(root,path.join(root,'dist'),{reportOnly:true,promotionSourceDir:sourceDir,typescript:{implementation:ts},onConsidered:({source,name})=>considered.add(`${relative(root,source)}#${name}`),onDiagnostic:d=>diagnostics.push({...d,file:relative(root,d.source)})},()=>{});
 const accepted=new Map(modules.flatMap(m=>m.functions.map(f=>[`${relative(root,m.source)}#${f.name}`,f])));
 for(const row of rows){row.diagnostics=diagnostics.filter(d=>d.file===row.file&&d.name===row.name).map(d=>d.message);row.status=accepted.has(row.id)?'accepted':row.diagnostics.length?'rejected':considered.has(row.id)?'considered-undecided':'excluded';if(accepted.has(row.id)){row.boundary=accepted.get(row.id).boundary;row.promotionId=accepted.get(row.id).id;}}
 for(const row of rows.filter(r=>r.explicit)) {
  row.status='explicit';row.buildStatus='not inspected (static report; run a production build)';
  if(accepted.has(row.id)){row.extractionStatus='extracted';continue;}
  if(row.diagnostics.length){row.extractionStatus='blocked';continue;}
  try {const {sf}=internals.get(row);const module=extractFunctions(sf.text,sf.fileName);row.extractionStatus=module?.functions.some(fn=>fn.name===row.name)?'extracted':'not extracted';}
  catch(error){row.extractionStatus='blocked';row.diagnostics.push(error.message);}
 }
 if(framework==='next'){
  for(const row of rows.filter(r=>r.explicit&&r.async)){
   row.buildStatus='not built (default .next artifact absent or stale)';
   try{const manifest=JSON.parse(await readFile(path.join(root,'.next/scriptc-functions/manifest.json'),'utf8'));const buildId=(await readFile(path.join(root,'.next/BUILD_ID'),'utf8')).trim();const {sf}=internals.get(row);
    if(manifest.buildId===buildId&&manifest.functions?.some(f=>path.resolve(f.source)===path.resolve(sf.fileName)&&f.names.includes(row.name)&&f.hash===createHash('sha256').update(sf.text).digest('hex'))){await readFile(path.join(root,'.next/scriptc-functions/functions'));row.buildStatus='built (artifact present; execution unverified)';}
   }catch{}
  }
 }
 const byId=new Map(rows.map(r=>[r.id,r]));
 const routes=[];for(const row of rows){const kind=routeKind(row.file,framework);if(!kind||!row.exported)continue;const http=/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/;const entry=framework==='tanstack'?/createServerFn/.test(internals.get(row).node.getText()):framework==='react-router'?/^(loader|action|clientLoader|clientAction)$/.test(row.name):framework==='sveltekit'?http.test(row.name)||['load','actions'].includes(row.name):http.test(row.name)||row.exportNames?.some(n=>http.test(n)||n==='default')||row.name==='default'||!!internals.get(row).node.modifiers?.some(m=>m.kind===ts.SyntaxKind.DefaultKeyword);if(!entry)continue;const seen=new Set();function walk(id){if(seen.has(id))return;seen.add(id);for(const next of byId.get(id)?.calls??[])walk(next);}walk(row.id);routes.push({file:row.file,entry:row.id,kind,reachable:[...seen].sort()});}
 const histogram=new Map();for(const d of diagnostics){const blocker=d.message.replace(/^.*?not a candidate(?: [^:]+)?: /,'').replace(/\[next-scriptc\] .*?: function .*?: /,'');histogram.set(blocker,(histogram.get(blocker)??0)+1);}
 const result={version:1,root,sourceDir,framework,counts:{files:sources.length,totalTopLevelFunctions:rows.length,exportedFunctions:rows.filter(r=>r.exported).length,considered:considered.size,diagnosed:rows.filter(r=>r.diagnostics.length).length,accepted:rows.filter(r=>r.status==='accepted').length,explicit:rows.filter(r=>r.explicit).length,silentExclusions:rows.filter(r=>r.status==='excluded').length},files:sources.map(f=>({file:relative(root,f),functions:rows.filter(r=>r.file===relative(root,f))})),routes,blockers:[...histogram].map(([diagnostic,count])=>({diagnostic,count,explanation:explanation(diagnostic)})).sort((a,b)=>b.count-a.count),nearestMisses:rows.filter(r=>r.diagnostics.length===1).map(r=>({id:r.id,diagnostic:r.diagnostics[0]})),diagnostics:diagnostics.map(({file,name,message})=>({file,name,message})),limitations:['Discovery diagnostics are not a complete denominator. Async/generator handlers, directives, unused private functions and other early exclusions may be silent.','Nearest misses have exactly one emitted diagnostic; discovery stops at the first failure, so fixing it may reveal others.','Reachability is a conservative identifier-reference graph through local TypeScript-resolved symbols, not a request trace. Dynamic imports, framework magic, namespace property calls and dependency code may be missing; references may overcount calls.','Static acceptance does not guarantee stock compiler acceptance or a speedup. No application config files are executed. Wrapped top-level callbacks count as one callable binding.','Runtime state is process-local (dispatcher.snapshot()). No running app is contacted. Capture snapshots in the app for observed decisions.']};
 if(options.measure)result.measurements=await measurePromotions(modules,{...options,root});
 return result;
}
export function formatReport(report){
 const c=report.counts;const lines=[`scriptc-promote coverage — ${report.framework}`,`${c.files} files; ${c.totalTopLevelFunctions} top-level callable bindings (${c.exportedFunctions} exported)`,`${c.considered} considered; ${c.diagnosed} diagnosed; ${c.accepted} accepted; ${c.explicit??0} explicit; ${c.silentExclusions} silently excluded`,'Diagnostics are not a complete denominator; acceptance is not a speedup.'];
 for(const file of report.files)for(const fn of file.functions)lines.push(`${fn.status.padEnd(20)} ${fn.id}${fn.explicit?` — extraction: ${fn.extractionStatus}; build: ${fn.buildStatus}`:''}${fn.diagnostics.length?' — '+fn.diagnostics.join('; '):''}`);
 for(const route of report.routes)lines.push(`Route ${route.entry}: ${route.reachable.join(', ')}`);
 lines.push('Top blockers:');for(const b of report.blockers.slice(0,5))lines.push(`  ${b.count} × ${b.diagnostic}\n    ${b.explanation}`);
 lines.push(`Nearest misses (one emitted diagnostic, further blockers may exist): ${report.nearestMisses.map(r=>r.id).join(', ')||'none'}`);
 for(const m of report.measurements??[])lines.push(`Measured ${m.id}: ${m.status==='ok'?`${m.inputSource}, N=${m.js.n}, ${m.metric}, JS ${m.js.median.toFixed(0)} ns/call [p10 ${m.js.p10.toFixed(0)}, p90 ${m.js.p90.toFixed(0)}], native ${m.native.median.toFixed(0)} ns/call [p10 ${m.native.p10.toFixed(0)}, p90 ${m.native.p90.toFixed(0)}], native ${m.nsPerInputJsonByte.native.toFixed(2)} ns/input byte, boundary ${m.boundaryShare===null?'unavailable':(100*m.boundaryShare).toFixed(1)+'%'}, intensity ${m.computeIntensity.toFixed(2)} JS ns/input byte, verdict ${m.verdict}`:m.status+' — '+m.reason}`);
 lines.push(...report.limitations.map(s=>'Note: '+s));return lines.join('\n')+'\n';
}
async function measurePromotions(modules,options){
 const {execFile}=await import('node:child_process');const {promisify}=await import('node:util');
 const inputs=options.inputs?JSON.parse(await readFile(options.inputs,'utf8')):{};
 if(!inputs||Array.isArray(inputs)||typeof inputs!=='object')throw Error('Inputs must map function IDs to arrays of argument tuples');
 const valid=new Set(modules.flatMap(m=>m.functions.flatMap(fn=>[fn.id,`${relative(options.root,m.source)}#${fn.name}`])));
 for(const id of Object.keys(inputs))if(!valid.has(id))throw Error(`Unknown accepted function input ID: ${id}`);
 const temp=await mkdtemp(path.join(os.tmpdir(),'scriptc-report-'));
 try{
  await writeFile(path.join(temp,'request.json'),JSON.stringify({modules,inputs,root:options.root??process.cwd()}));
  try{await promisify(execFile)(process.execPath,[fileURLToPath(new URL('./report-measure.mjs',import.meta.url)),temp],{timeout:180000,maxBuffer:8*1024*1024});}
  catch(e){return modules.flatMap(m=>m.functions.map(fn=>({id:`${relative(options.root??process.cwd(),m.source)}#${fn.name}`,status:'unavailable',reason:`Measurement subprocess failed: ${e.signal??e.stderr??e.message}`})));}
  return JSON.parse(await readFile(path.join(temp,'result.json'),'utf8'));
 }finally{await rm(temp,{recursive:true,force:true});}
}
export async function reportCommand(args=process.argv.slice(2)){
 if(args[0]==='report')args=args.slice(1);
 let directory='.',seenDir=false;const options={};
 for(let i=0;i<args.length;i++){const arg=args[i];if(arg==='--measure')options.measure=true;else if(['--framework','--source-dir','--json','--md','--inputs'].includes(arg)){if(!args[i+1]||args[i+1].startsWith('--'))throw Error(`Missing value for ${arg}`);options[{'--source-dir':'sourceDir'}[arg]??arg.slice(2)]=args[++i];}else if(arg.startsWith('-')||seenDir)throw Error(`Unexpected argument: ${arg}`);else{directory=arg;seenDir=true;}}
 options.root=path.resolve(directory);
 const report=await coverageReport(directory,options),terminal=formatReport(report);process.stdout.write(terminal);
 if(options.json)await writeFile(options.json,JSON.stringify(report,null,2)+'\n');
 if(options.md)await writeFile(options.md,'# Promotion coverage report\n\n```text\n'+terminal.replaceAll('```','~~~')+'```\n');
 return report;
}
