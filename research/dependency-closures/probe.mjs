// Dependency sources and generated compiler inputs stay outside the repository.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {compilerPath} from '../../packages/next-scriptc/src/paths.mjs';
import {dependencyClosure} from '../../packages/next-scriptc/src/functions/dependency-closure.mjs';
const deps=process.env.K1_DEPS??'/tmp/next-scriptc-k1-deps';
const require=createRequire(path.join(deps,'package.json'));
const ts=createRequire(import.meta.url)('typescript');
const hash=x=>createHash('sha256').update(x).digest('hex');
const output={compiler:'0.4.6',packages:[],probes:[]};
for(const name of ['json-2-csv','deeks','doc-path']){
 const root=path.join(deps,'node_modules',name),pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json')));
 function files(d){return fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(d,e.name)):[path.join(d,e.name)]);}
 const entries=files(root).sort().map(f=>({file:path.relative(root,f),hash:hash(fs.readFileSync(f))}));
 output.packages.push({name,version:pkg.version,hash:hash(JSON.stringify(entries)),files:entries});
}
// Static require graph, including modules loaded only for the reverse converter.
const seen=new Set();output.moduleInitialization=[];
function audit(file){
 if(seen.has(file))return;seen.add(file);
 const text=fs.readFileSync(file,'utf8'),ast=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
 const imports=[],features=new Set();
 function scan(n){
  if(ts.isCallExpression(n)&&ts.isIdentifier(n.expression)&&n.expression.text==='require'){
   if(n.arguments.length!==1||!ts.isStringLiteral(n.arguments[0]))features.add('dynamic require');
   else imports.push(createRequire(file).resolve(n.arguments[0].text));
  }
  if(ts.isGetAccessor(n))features.add('getter');
  if(ts.isPropertyAssignment(n)&&n.name.getText(ast)==='get'&&ts.isFunctionExpression(n.initializer))features.add('getter descriptor');
  if(ts.isNewExpression(n))features.add('new '+n.expression.getText(ast));
  if(ts.isPropertyAccessExpression(n)&&['defineProperty','getOwnPropertyDescriptor','prototype','setPath'].includes(n.name.text))features.add(n.name.text);
  ts.forEachChild(n,scan);
 }
 scan(ast);
 output.moduleInitialization.push({file:path.relative(path.join(deps,'node_modules'),file),hash:hash(text),imports:imports.map(f=>path.relative(path.join(deps,'node_modules'),f)),topLevel:ast.statements.map(n=>ts.SyntaxKind[n.kind]),features:[...features].sort()});
 imports.forEach(audit);
}
audit(require.resolve('json-2-csv'));
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'k1-compiler-'));
try{
 const probes={
  'package-entry':`import {json2csv} from ${JSON.stringify(require.resolve('json-2-csv'))}; export function run(x:string):string{return json2csv(JSON.parse(x));}`,
  'cjs-export':'function twice(n:number):number{return n*2;} exports.twice=twice; export function run(x:string):string{return String(twice(Number(x)));}',
  'dynamic-key':'export function run(x:string):string{const o=JSON.parse(x);return String(o[Object.keys(o)[0]]);}',
  'module-set':'const prefixes=new Set(["=","+"]);export function run(x:string):string{return prefixes.has(x[0])?"x"+x:x;}',
  'callback-default':'function call(f:(x:string)=>string,x:string):string{return f(x);}export function run(x:string):string{return call(v=>v.replace(/a/g,"b"),x);}',
 };
 for(const [name,source] of Object.entries(probes)){
  const entry=path.join(temp,'entry.ts');fs.writeFileSync(entry,source);
  const profile=path.join(temp,'profile.json');fs.writeFileSync(profile,JSON.stringify({profile_format:1,name:'closure-probe',entry:'entry.ts',emission:'llvm',abi:{prefix:'probe_',init_symbol:'probe_init',sink_register_symbol:'probe_sink',collect_symbol:'probe_collect',localize_runtime:true,instance_per_thread:false},exports:[{export:'run',symbol:'probe_run',params:['string'],returns:'string'}]}));
  try{execFileSync(compilerPath(),['build','--lib','--profile',profile,'-o',path.join(temp,'probe.a')],{cwd:temp,encoding:'utf8',env:{...process.env,SCRIPTC_CHECKER_SERVER:'0'},stdio:'pipe'});output.probes.push({name,compiled:true});}
  catch(e){const message=String(e.stderr??e.message).replaceAll(temp,'<temp>').replaceAll(deps,'<deps>');output.probes.push({name,compiled:false,codes:[...new Set(message.match(/SC\d+/g)??[])],diagnostic:message});}
 }
 const app='/Users/noah/code/coverage-apps/dub',file=path.join(app,'apps/web/lib/analytics/utils/convert-to-csv.ts');
 output.dubCommit=execFileSync('git',['-C',app,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
 try{dependencyClosure(fs.readFileSync(file,'utf8'),file,'convertToCSV');output.dubClosure='accepted';}catch(e){output.dubClosure=e.message;}
 fs.writeFileSync(new URL('results.json',import.meta.url),JSON.stringify(output,null,2)+'\n');console.log(output.probes.map(({diagnostic,...p})=>p),output.dubClosure);
}finally{fs.rmSync(temp,{recursive:true,force:true});}
