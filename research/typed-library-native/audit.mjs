import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const work=process.argv[2],root=new URL('./',import.meta.url),req=createRequire(path.join(work,'package.json'));
const sha=x=>createHash('sha256').update(x).digest('hex');
const json=f=>JSON.parse(fs.readFileSync(new URL(f,root)));
const l1=JSON.parse(fs.readFileSync(new URL('../whole-library-native/check-json-2-csv-nocheck-banner.json',root)));
const l2=json('check-json-2-csv-untyped.json');
if(l1.inputSha256!==l2.inputSha256)throw Error('L1 corpus changed');
const bundle=fs.readFileSync(path.join(work,'builds/json-2-csv/untyped/bundle.js'));
if(!bundle.equals(fs.readFileSync(path.join(work,'builds/json-2-csv/nocheck-banner/bundle.js'))))throw Error('L1 bundle changed');
const report={l1CorpusSha256:l1.inputSha256,l1BundleByteIdentical:true,bundleSha256:sha(bundle),graphs:[],annotationErasureIdentical:true};
for(const [lib,variant] of [['json-2-csv','typed'],['json-2-csv','annotated'],['json-2-csv','untyped'],['fastest-levenshtein','typed'],['fastest-levenshtein','untyped']]){
 const dir=path.join(work,'builds',lib,variant);
 const files=fs.readdirSync(dir,{recursive:true}).filter(f=>f.endsWith('.ts')||['bundle.js','profile.json','tsconfig.json'].includes(f));
 report.graphs.push({library:lib,variant,files:files.map(file=>({file,sha256:sha(fs.readFileSync(path.join(dir,file)))}))});
}
const ts=req('typescript');const emit=s=>ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ESNext,module:ts.ModuleKind.ESNext,removeComments:true}}).outputText;
for(const f of ['deeks/src/utils.ts','json-2-csv/src/utils.ts','json-2-csv/src/json2csv.ts'])if(emit(fs.readFileSync(path.join(work,'builds/json-2-csv/typed/vendor',f),'utf8'))!==emit(fs.readFileSync(path.join(work,'builds/json-2-csv/annotated/vendor',f),'utf8')))throw Error('Logic changed '+f);
for(const file of fs.readdirSync(root).filter(f=>f.endsWith('.json'))){const s=fs.readFileSync(new URL(file,root),'utf8');fs.writeFileSync(new URL(file,root),s.replaceAll(work,'<TEMP>'));}
fs.writeFileSync(new URL('audit.json',root),JSON.stringify(report,null,2)+'\n');
