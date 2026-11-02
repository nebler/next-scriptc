import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {regions} from './regions.mjs';
import {promotionCandidates} from '../../packages/scriptc-promote/src/functions/promotion-discovery.mjs';
import {checkFunctionTypes} from '../../packages/scriptc-promote/src/functions/types.mjs';
import {constructionProof,strictClosureProgram} from '../../packages/scriptc-promote/src/functions/construction-proof.mjs';
const base=process.env.COVERAGE_APPS??'/Users/noah/code/coverage-apps';
const apps={umami:{root:path.join(base,'umami'),scope:['src/lib','src/queries','src/app/api'],pin:'559e3c607c23d2c72d9bd4f6481bda428255323c'},dub:{root:path.join(base,'dub'),app:'apps/web',scope:['apps/web/lib','apps/web/app/api'],pin:'6b463b4bdd9ed2fd9aa416f67b5b77d317b1471e'},formbricks:{root:path.join(process.env.ASYNC_APPS??'/Users/noah/code/async-region-apps','formbricks'),app:'apps/web',scope:['apps/web/lib/response','apps/web/app/(app)/workspaces/[workspaceId]/surveys/[surveyId]/(analysis)/summary/lib'],pin:'76b05fb98dd870000d820ad8a27527e483dcfbb0'}};
function files(p){return fs.readdirSync(p,{withFileTypes:true}).flatMap(e=>e.name.startsWith('.')||['node_modules','tests','test','__mocks__'].includes(e.name)?[]:e.isDirectory()?files(path.join(p,e.name)):/\.[cm]?[jt]sx?$/.test(e.name)&&! /\.(test|spec)\./.test(e.name)?[path.join(p,e.name)]:[]);}
export function category(s){return /region control/.test(s)?'control flow':/construction proof/.test(s)?'construction proof':/no loop/.test(s)?'work screen':/module.init|module statement|initializer|NewExpression/.test(s)?'closure/module-init':/imports unsupported|React|JSX/.test(s)?'framework import':/import|reference|dependency|closure/.test(s)?'closure/import':/purity|mutation|reassigned/.test(s)?'purity':/\(type .*\b(any|unknown)\b/.test(s)?'any/unknown boundary':/\(type .*Prisma/.test(s)?'concrete Prisma boundary':/JSON data|optional|undefined|class instances/.test(s)?'other boundary':/construction/.test(s)?'construction proof':'other extraction';}
const output={version:1,adapterCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),apps:{}};
for(const [app,cfg] of Object.entries(apps).filter(([a])=>!process.env.RUN_APPS||process.env.RUN_APPS.split(',').includes(a))){
 const {root,pin}=cfg,appRoot=path.join(root,cfg.app??'');if(execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim()!==pin)throw Error('pin mismatch');
 const require=createRequire(path.join(appRoot,'census.cjs'));const ts=require('typescript');
 const configFile=path.join(appRoot,'tsconfig.json'),loaded=ts.readConfigFile(configFile,ts.sys.readFile),parsed=ts.parseJsonConfigFileContent(loaded.config,ts.sys,appRoot,undefined,configFile);
 const options={...parsed.options,incremental:false,noEmit:true};
 // Source paths replace absent workspace package build outputs, never fabricated declarations.
 if(app==='formbricks')options.paths={...options.paths,'@formbricks/types/*':['../../packages/types/*'],'@formbricks/database':['../../packages/database/src/index.ts'],'@formbricks/database/prisma':['../../packages/database/src/prisma.ts'],'@formbricks/database/types/*':['../../packages/database/types/*']};
 const sourceFiles=cfg.scope.flatMap(r=>files(path.join(root,r))).filter(f=>!/^\s*['"]use client['"]/.test(fs.readFileSync(f,'utf8')));
 let program=ts.createProgram(sourceFiles,options),checker=program.getTypeChecker();const virtual=new Map(),rows=[],byFile=new Map();let functions=0,expressionArrows=0,awaitLoops=0;
 for(const file of sourceFiles){const sf=program.getSourceFile(file);if(!sf)continue;const found=regions(ts,checker,sf);functions+=found.functions;expressionArrows+=found.expressionArrows;awaitLoops+=found.barriers.awaitLoops;
  if(!found.regions.length)continue;let text=sf.text;const group=[];
  for(const r of found.regions){const name='__a0_region_'+rows.length;let control=r.thisUse||r.argumentsUse||r.earlyReturn||r.externalJump;
   const params=r.liveIns.map((v,i)=>`__a0_in_${i}: ${v.type}`).join(',');const bindings=r.liveIns.map((v,i)=>`let ${v.name} = __a0_in_${i};`).join('\n')+'\n'+r.liveOuts.filter(v=>!v.definedInside&&!r.liveIns.some(i=>i.name===v.name)).map(v=>`let ${v.name}: ${v.type};`).join('\n');
   const epilogue=r.terminalReturn?'':`\nreturn ${r.liveOuts.length?'{'+r.liveOuts.map(v=>v.name).join(',')+'}':'null'};`;
   const body=r.expression?'return ('+sf.text.slice(r.start,r.end)+');':sf.text.slice(r.start,r.end);text+=`\nexport function ${name}(${params}) {\n${bindings}\n${body}${epilogue}\n}\n`;
   const clean=v=>({definedInside:v.definedInside,name:v.name,type:v.type,anyUnknown:v.anyUnknown,errorType:v.errorType});
   const row={id:name,file:path.relative(root,file),function:r.function,line:r.line,endLine:r.endLine,liveIns:r.liveIns.map(clean),liveOuts:r.liveOuts.map(clean),thisUse:r.thisUse,argumentsUse:r.argumentsUse,returns:r.returns,earlyReturn:r.earlyReturn,throws:r.throws,externalJump:r.externalJump,anyUnknown:r.liveIns.concat(r.liveOuts).some(v=>v.anyUnknown),unresolvedType:r.liveIns.concat(r.liveOuts).some(v=>v.errorType),control};rows.push(row);group.push(row);
  }virtual.set(file,text);byFile.set(file,group);
 }
 const host=ts.createCompilerHost(options),originalRead=host.readFile.bind(host);host.readFile=f=>virtual.get(f)??originalRead(f);program=ts.createProgram(sourceFiles,options,host);checker=program.getTypeChecker();
 for(const [file,group] of byFile){const text=virtual.get(file),sf=program.getSourceFile(file),modules=new Map(),failures=new Map();
  const candidates=promotionCandidates(text,file,s=>{const match=s.match(/not a candidate (__a0_region_\d+): (.*)/s);if(match)failures.set(match[1],match[2]);},{ts,options});
  for(const m of candidates)if(m.functions[0]?.name.startsWith('__a0_region_'))modules.set(m.functions[0].name,m);
  for(const r of group){const m=modules.get(r.id);r.screenAccepted=!!m;
   // Independent boundary probe exposes data blockers masked by purity/import failures.
   const decl=sf.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===r.id);
   try{checkFunctionTypes(ts,program,[{source:file,functions:[{name:r.id,start:decl.body.getStart(sf),promotion:true}]}]);r.boundaryProbe='pass';}catch(e){r.boundaryProbe=e.message.replaceAll(root,'<app>');}
   try{if(r.control)throw Error('region control: this/arguments, early return or external jump requires a protocol');if(!m)throw Error(failures.get(r.id)??'extraction produced no function');
    checkFunctionTypes(ts,program,[m]);
    const proof=constructionProof(m.native,ts);r.constructionProof=proof;r.discoveryAccepted=true;
    // Match the isolated strict-closure requirement for non-strict apps.
    if(!(options.strictNullChecks??options.strict)){const strict=strictClosureProgram(m.native,ts);const diags=ts.getPreEmitDiagnostics(strict.program);if(diags.length)throw Error('strict closure: TS'+diags[0].code+': '+ts.flattenDiagnosticMessageText(diags[0].messageText,' '));if(m.functions[0].boundary.params.includes('json')&&(!proof.eligible||!['json','number','string'].includes(m.functions[0].boundary.result)))throw Error('strict closure: construction proof or result ABI');}
    if(!proof.eligible)throw Error('construction proof: '+proof.reason);r.accepted=true;r.boundary=m.functions[0].boundary;
   }catch(e){r.accepted=false;r.rejection=e.message.replaceAll(root,'<app>');r.category=category(r.rejection);}
   // Optimistic oracle removes only the boundary's any veto, not effect/import/control screens.
   r.anyTypingUpperBound=!r.accepted&&!r.control&&r.screenAccepted&&r.anyUnknown&&/\b(any|unknown)\b/.test(r.boundaryProbe);
   if(r.anyTypingUpperBound){
    r.counterfactualWitnesses=[];
    for(const schema of ['number','string','number[]','string[]','{ id: string; workspaceId: string; websiteId: string; teamId: string; role: string; count: number; _count: number }','{ id: string; workspaceId: string; websiteId: string; teamId: string; role: string; count: number; _count: number }[]']){
     const ast=ts.createSourceFile('witness.ts',m.native,ts.ScriptTarget.Latest,true),edits=[];
     function collect(n){if(n.kind===ts.SyntaxKind.AnyKeyword||n.kind===ts.SyntaxKind.UnknownKeyword)edits.push([n.getStart(ast),n.end]);else ts.forEachChild(n,collect);}
     const target=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===r.id)||ast.statements.find(n=>ts.isFunctionDeclaration(n.declaration)&&n.declaration.name?.text===r.id)?.declaration;
     if(!target)break;target.parameters.forEach(p=>{if(p.type)collect(p.type);});if(!edits.length)break;
     let native=m.native;for(const [a,b]of edits.sort((a,b)=>b[0]-a[0]))native=native.slice(0,a)+schema+native.slice(b);
     const strict=strictClosureProgram(native,ts);if(ts.getPreEmitDiagnostics(strict.program).length)continue;
     try{const d=strict.source.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===r.id);if(!d)continue;checkFunctionTypes(ts,strict.program,[{source:strict.source.fileName,functions:[{name:r.id,start:d.body.getStart(strict.source),promotion:true}]}]);const proof=constructionProof(native,ts);if(proof.eligible)r.counterfactualWitnesses.push(schema);}catch{}
    }
   }

  }
 }
 const diagnostics=ts.getPreEmitDiagnostics(program);const histogram={};for(const r of rows)if(!r.accepted)histogram[r.category]=(histogram[r.category]??0)+1;
 output.apps[app]={commit:pin,scope:cfg.scope,typescript:ts.version,configErrors:parsed.errors.map(d=>({code:d.code,message:ts.flattenDiagnosticMessageText(d.messageText,' ')})),files:sourceFiles.length,asyncFunctions:functions,expressionArrows,awaitLoopsExcluded:awaitLoops,regions:rows.length,accepted:rows.filter(r=>r.accepted).length,discoveryAccepted:rows.filter(r=>r.discoveryAccepted).length,rejections:histogram,anyUnknownRegions:rows.filter(r=>r.anyUnknown).length,unresolvedRegions:rows.filter(r=>r.unresolvedType).length,anyTypingAdditionalUpperBound:rows.filter(r=>r.anyTypingUpperBound).length,anyTypingWitnessPasses:rows.filter(r=>r.counterfactualWitnesses?.length).length,diagnostics:Object.fromEntries([...new Set(diagnostics.map(d=>d.code))].map(code=>[code,diagnostics.filter(d=>d.code===code).length])),rows};
 fs.writeFileSync(new URL(process.env.ASYNC_OUTPUT??'census.json',import.meta.url),JSON.stringify(output,null,2)+'\n');console.log(app,JSON.stringify({...output.apps[app],rows:undefined}));
}
