// AGPL source stays in the pinned external checkout and in memory.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {lowerOpaqueHandles} from '../../packages/scriptc-promote/src/functions/opaque-handles.mjs';
import {dependencyClosure} from '../../packages/scriptc-promote/src/functions/dependency-closure.mjs';
const root=process.env.ASYNC_APPS??'/Users/noah/code/async-region-apps';
const app=path.join(root,'formbricks'),pin='76b05fb98dd870000d820ad8a27527e483dcfbb0';
assert.equal(execFileSync('git',['-C',app,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),pin);
const relative='apps/web/app/(app)/workspaces/[workspaceId]/surveys/[surveyId]/(analysis)/summary/lib/surveySummary.ts';
const file=path.join(app,relative),text=fs.readFileSync(file,'utf8');
assert.equal(text,execFileSync('git',['-C',app,'show',`${pin}:${relative}`],{encoding:'utf8'}));
const ts=createRequire(path.join(app,'apps/web/h1.cjs'))('typescript');
const sf=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true);let target;
function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(sf)==='getElementSummary')target=n.initializer;ts.forEachChild(n,visit);}visit(sf);
assert.ok(target&&ts.isArrowFunction(target));
// The stand-in probe is diagnostic only: scalar discriminants are unknown.
// The typed closure probe below determines the actual next adapter gate.
const candidate=`function h1(survey:object,elements:object[],responses:object[],dropOff:object){${text.slice(target.body.getStart(sf)+1,target.body.end-1)}}`;
let scopeRejection;
try{const lowered=lowerOpaqueHandles(candidate,'h1',ts);scopeRejection=lowered.inputs?'lowered':'no boundary specialization';}catch(e){scopeRejection=e.message;}
const configFile=path.join(app,'apps/web/tsconfig.json'),loaded=ts.readConfigFile(configFile,ts.sys.readFile);
const options=ts.parseJsonConfigFileContent(loaded.config,ts.sys,path.dirname(configFile),undefined,configFile).options;
options.paths={...options.paths,'@formbricks/types/*':['../../packages/types/*'],'@formbricks/database':['../../packages/database/src/index.ts'],'@formbricks/database/prisma':['../../packages/database/src/prisma.ts'],'@formbricks/database/types/*':['../../packages/database/types/*']};
let closureRejection;
try{dependencyClosure(text+'\nexport function h1_response(rows:TSurveySummaryResponse[]){return rows.map(r=>({id:r.id,updatedAt:r.updatedAt,contact:r.contact,contactAttributes:r.contactAttributes}));}',file,'h1_response',{ts,options});closureRejection='accepted';}catch(e){closureRejection=e.message.replaceAll(app,'<app>');}
let summaryClosureRejection;
const summaryProbe=text+'\nexport function h2_summary('+target.parameters.map(p=>p.getText(sf)).join(',')+')'+target.body.getText(sf);
try{dependencyClosure(summaryProbe,file,'h2_summary',{ts,options});summaryClosureRejection='accepted';}catch(e){summaryClosureRejection=e.message.replaceAll(app,'<app>');}
const evidence={summaryClosureRejection,pin,source:relative,sourceSha256:createHash('sha256').update(text).digest('hex'),typescript:ts.version,scopeRejection,closureRejection,status:'H2 probe; no native summary or timing claimed',nativeSummary:false,timing:false};
fs.writeFileSync(new URL('evidence.json',import.meta.url),JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence,null,2));
