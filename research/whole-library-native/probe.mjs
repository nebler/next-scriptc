// Third-party installs, generated facades, bundles and compiler output stay in work.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const work=path.resolve(process.argv[2]??'');
if(!process.argv[2]||work.startsWith(process.cwd()+path.sep))throw Error('Pass an external temporary install directory');
const req=createRequire(path.join(work,'package.json'));
const {build}=await import(pathToFileURL(req.resolve('esbuild')));
const compiler=path.join(work,'node_modules/scriptc/bin/scriptc.exe');
const hash=s=>createHash('sha256').update(s).digest('hex');
const specs=[
 {name:'json-2-csv',version:'5.5.0',entry:"export {json2csv as entry} from 'json-2-csv';",facade:"type Row={id:number;text:string;meta:{note:string}}; export function run(input:string):string {return entry(JSON.parse(input) as Row[]);}"},
 {name:'markdown-it',version:'14.1.0',entry:"import MarkdownIt from 'markdown-it'; const renderer=new MarkdownIt({html:false,linkify:false,typographer:false}); export function entry(s){return renderer.render(s);}",facade:'export function run(input:string):string {return entry(input);}'},
 {name:'dayjs',version:'1.11.13',entry:"import dayjs from 'dayjs'; export function entry(s){return dayjs(s).format('YYYY-MM-DD HH:mm:ss');}",facade:'export function run(input:string):string {return entry(input);}'},
 {name:'escape-html',version:'1.0.3',entry:"import escapeHtml from 'escape-html'; export {escapeHtml as entry};",facade:'export function run(input:string):string {return entry(input);}'}
];
const variants=[
 {name:'no-check',platform:'node',target:'esnext'},
 {name:'require-entry',platform:'node',target:'es2022',minifySyntax:true,define:{self:'globalThis','process.env.NODE_ENV':'"production"'}},
 {name:'require-nocheck',platform:'node',target:'es2022',minifySyntax:true,banner:{js:'// @ts-nocheck'},define:{self:'globalThis','process.env.NODE_ENV':'"production"'}},
 {name:'nocheck-banner',platform:'node',target:'es2022',banner:{js:'// @ts-nocheck'}},
 {name:'neutral',platform:'neutral',target:'esnext'},
 {name:'node',platform:'node',target:'esnext'},
 {name:'lowered',platform:'node',target:'es2015',supported:{'object-rest-spread':false}},
 {name:'minified',platform:'node',target:'es2022',minify:true},
 {name:'keep-names',platform:'neutral',target:'es2022',keepNames:true},
 {name:'no-object-extensions',platform:'node',target:'es2015',supported:{'object-rest-spread':false,'arrow':false,'template-literal':false}}
];
const lock=JSON.parse(fs.readFileSync(path.join(work,'package-lock.json')));
const results={schema:1,date:new Date().toISOString(),host:{platform:os.platform(),arch:os.arch(),node:process.version,cpu:os.cpus()[0].model},compiler:{version:spawnSync(compiler,['--version'],{encoding:'utf8'}).stdout.trim(),sha256:hash(fs.readFileSync(compiler)),integrity:lock.packages['node_modules/scriptc'].integrity},esbuild:'0.25.12',packages:[],attempts:[]};
for(const [key,p] of Object.entries(lock.packages))if(key.startsWith('node_modules/')&&fs.existsSync(path.join(work,key,'package.json'))){
 const manifest=JSON.parse(fs.readFileSync(path.join(work,key,'package.json')));
 const licenseFiles=fs.readdirSync(path.join(work,key)).filter(n=>/^(license|copying)(\.|$)/i.test(n));
 results.packages.push({name:manifest.name,version:p.version,license:manifest.license,integrity:p.integrity,licenseFiles:licenseFiles.map(n=>({file:n,sha256:hash(fs.readFileSync(path.join(work,key,n)))}))});
 if(manifest.name!=='argparse'&&!['MIT','Apache-2.0','Apache-2.0 WITH LLVM-exception','BSD-2-Clause','BSD-3-Clause','(MIT OR CC0-1.0)'].includes(manifest.license))throw Error('Review license '+manifest.name+': '+manifest.license);
}
for(const spec of specs.filter(s=>!process.env.LIBRARIES||process.env.LIBRARIES.split(',').includes(s.name)))for(const variant of variants.filter(v=>process.env.VARIANTS?process.env.VARIANTS.split(',').includes(v.name):!['no-check','require-entry','require-nocheck','nocheck-banner'].includes(v.name))){
 const dir=path.join(work,'builds',spec.name,variant.name);fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(path.join(dir,'tsconfig.json'),JSON.stringify({compilerOptions:{strict:true,...(variant.name==='no-check'?{noCheck:true}:{}),allowJs:true,checkJs:false,skipLibCheck:true,target:'ESNext',module:'ESNext',moduleResolution:'bundler',types:[]}}));
 const {name,...options}=variant;
 const bundle=await build({stdin:{contents:variant.name.startsWith('require-')?({'json-2-csv':"const f=require('json-2-csv');export function entry(s){return f.json2csv(s);}",'escape-html':"const f=require('escape-html');export function entry(s){return f(s);}",'markdown-it':"const M=require('markdown-it');const m=new M({html:false,linkify:false,typographer:false});export function entry(s){return m.render(s);}",'dayjs':"const f=require('dayjs');export function entry(s){return f(s).format('YYYY-MM-DD HH:mm:ss');}"}[spec.name]??spec.entry):spec.entry,resolveDir:work,sourcefile:'entry.js'},bundle:true,format:'esm',write:false,metafile:true,mainFields:['module','main'],define:{'process.env.NODE_ENV':'"production"'},...options});
 const code=bundle.outputFiles[0].text;
 fs.writeFileSync(path.join(dir,'bundle.js'),code);
 fs.writeFileSync(path.join(dir,'facade.ts'),"import {entry} from './bundle.js';\n"+spec.facade+'\n');
 fs.writeFileSync(path.join(dir,'profile.json'),JSON.stringify({profile_format:1,name:'promotion',entry:'facade.ts',emission:'llvm',abi:{prefix:'rev_',init_symbol:'rev_init',sink_register_symbol:'rev_sink',collect_symbol:'rev_collect',localize_runtime:true,instance_per_thread:false},exports:[{export:'run',symbol:'rev_fn_0',params:['string'],returns:'string'}]}));
 const args=['build','--lib','--profile',path.join(dir,'profile.json'),'-o',path.join(dir,'functions.lib.a')];
 const t=Date.now(),out=spawnSync(compiler,args,{cwd:dir,env:{...process.env,SCRIPTC_CHECKER_SERVER:'0'},encoding:'utf8',timeout:120000,maxBuffer:4*1024*1024});
 const diagnostic=(out.stderr+out.stdout).replaceAll(work,'<TEMP>');
 fs.writeFileSync(path.join(dir,'diagnostic.txt'),diagnostic);
 const match=diagnostic.match(/(SC\d{4})[^\n]*/);
 const attempt={library:spec.name,version:spec.version,variant,facade:spec.facade,bundleSha256:hash(code),bundleBytes:Buffer.byteLength(code),inputs:Object.keys(bundle.metafile.inputs).map(file=>({file:path.relative(work,path.resolve(file)),sha256:fs.existsSync(file)?hash(fs.readFileSync(file)):null})),command:['scriptc',...args.map(a=>a.replaceAll(work,'<TEMP>'))],exit:out.status,signal:out.signal,error:out.error?.message,elapsedMs:Date.now()-t,firstCode:match?.[1]??null,diagnostic:diagnostic.split('\n').filter(l=>/SC\d{4}|^\d+ errors?\.|functions.lib.a$/.test(l)).join('\n')};
 results.attempts.push(attempt);console.log(spec.name,name,out.status,match?.[0]??diagnostic.slice(0,200));
 fs.writeFileSync(new URL(process.env.RESULTS_FILE??'./results.json',import.meta.url),JSON.stringify(results,null,2)+'\n');
}
