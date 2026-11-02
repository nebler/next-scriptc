// Read the pinned AGPL checkout in memory. Never persist source or transpiled code.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {encodeArguments,canonicalResult} from '../../packages/scriptc-promote/src/functions/promotion-encodings.mjs';
import {dependencyClosure} from '../../packages/scriptc-promote/src/functions/dependency-closure.mjs';

const root=path.join(process.env.ASYNC_APPS??'/Users/noah/code/async-region-apps','formbricks');
const pin='76b05fb98dd870000d820ad8a27527e483dcfbb0';
assert.equal(execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),pin);
const app=path.join(root,'apps/web');
const ts=createRequire(path.join(app,'f1-check.cjs'))('typescript');
const relative='apps/web/app/(app)/workspaces/[workspaceId]/surveys/[surveyId]/(analysis)/summary/lib/surveySummary.ts';
const file=path.join(root,relative),text=fs.readFileSync(file,'utf8');
assert.equal(text,execFileSync('git',['-C',root,'show',pin+':'+relative],{encoding:'utf8',maxBuffer:4*1024*1024}));
const sf=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true);
let target;
function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(sf)==='getElementSummary')target=n.initializer;ts.forEachChild(n,visit);}
visit(sf);assert.ok(target&&ts.isArrowFunction(target));
const loop=target.body.statements.find(ts.isForOfStatement);assert.ok(loop);
const line=n=>sf.getLineAndCharacterOfPosition(n.getStart(sf)).line+1;
// Execute the exact original statement prefix through the element loop. The
// embedded-field epilogue and module initialization are deliberately outside
// this counterexample. This is not a module import or end-to-end app harness.
const escapeLines=[],dateReadLines=[];
function references(n){
 if(ts.isPropertyAccessExpression(n)&&n.expression.getText(sf)==='response'&&n.name.text==='updatedAt')dateReadLines.push(line(n));
 if((ts.isShorthandPropertyAssignment(n)&&n.name.text==='element')||(ts.isPropertyAssignment(n)&&n.name.getText(sf)==='element'&&n.initializer.getText(sf)==='element'))escapeLines.push(line(n));
 ts.forEachChild(n,references);
}
references(target);assert.ok(escapeLines.length>0&&dateReadLines.length>0);
const prefix=text.slice(target.body.statements[0].getStart(sf),loop.end);
const constants=fs.readFileSync(path.join(root,'packages/types/surveys/constants.ts'),'utf8');
const sfEnum=ts.createSourceFile('constants.ts',constants,ts.ScriptTarget.Latest,true);
const en=sfEnum.statements.find(n=>ts.isEnumDeclaration(n)&&n.name.text==='TSurveyElementTypeEnum');assert.ok(en);
const transpile=s=>ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const enumExports={};vm.runInNewContext(transpile(en.getText(sfEnum)),{exports:enumExports});
// new Function shares host prototypes with the JSON validator.
const run=new Function('TSurveyElementTypeEnum',transpile(`return (survey, elements, responses, dropOff) => {${prefix}\nreturn summary;};`))(enumExports.TSurveyElementTypeEnum);
const schema={params:['json'],result:'json'};
const element={id:'text',type:'openText',headline:{default:'Feedback'},unusedButReturned:'retained'};
const contact={id:'contact-1'},attributes={company:'Example'};
const date=new Date('2026-01-02T03:04:05.000Z');
const response={id:'response-1',data:{text:'Useful product'},updatedAt:date,createdAt:new Date('2025-01-01'),contact,contactAttributes:attributes,language:null,ttc:{},finished:true};
const aggregate=rows=>run({},[element],rows,[]);
const original=aggregate([response]);
assert.equal(original[0].element,element);
assert.equal(original[0].samples[0].updatedAt,date);
assert.equal(original[0].samples[0].contact,contact);
assert.equal(original[0].samples[0].contactAttributes,attributes);
const withoutCreatedAt={...response};delete withoutCreatedAt.createdAt;
assert.equal(JSON.stringify(aggregate([withoutCreatedAt])),JSON.stringify(original));
const withoutUpdatedAt={...withoutCreatedAt};delete withoutUpdatedAt.updatedAt;
assert.notEqual(JSON.stringify(aggregate([withoutUpdatedAt])),JSON.stringify(original));
assert.throws(()=>encodeArguments(schema,[[withoutCreatedAt]]),/plain JSON object/);
assert.throws(()=>canonicalResult(original,schema),/plain JSON object/);
const jsonRows=JSON.parse(JSON.stringify([withoutCreatedAt]));
assert.doesNotThrow(()=>encodeArguments(schema,[jsonRows]));
const serialized=aggregate(jsonRows);
assert.equal(JSON.stringify(serialized),JSON.stringify(original));
assert.equal(typeof serialized[0].samples[0].updatedAt,'string');
assert.notEqual(serialized[0].samples[0].updatedAt,date);
// Even a field unused by the loop survives through the returned element.
const copy=JSON.parse(JSON.stringify(element));delete copy.unusedButReturned;
assert.notEqual(JSON.stringify(run({},[copy],[response],[])),JSON.stringify(original));
const errors=[];
try{aggregate([{...response,data:null}]);assert.fail('expected the real loop to throw');}catch(e){assert.equal(e.constructor,TypeError);errors.push(e.name);}
const probe=text+'\nexport function __f1_boundary_probe(responses: TSurveySummaryResponse[]) { return responses.map(r => r.id); }';
let rejection;
try{dependencyClosure(probe,file,'__f1_boundary_probe',{ts});assert.fail('Date-bearing interface must reject');}catch(e){rejection=e.message;assert.match(rejection,/TSurveySummaryResponse.*Identifier Date/);}
const evidence={pin,source:relative,sourceSha256:createHash('sha256').update(text).digest('hex'),typescript:ts.version,region:{start:line(target.body.statements[0]),loopEnd:sf.getLineAndCharacterOfPosition(loop.end).line+1,end:line(target.body.statements.at(-1))},escapeLines,dateReadLines,checks:{originalDateEscapes:true,elementIdentityEscapes:true,contactIdentityEscapes:true,contactAttributesIdentityEscapes:true,dropCreatedAtPreservesBytes:true,dropUpdatedAtChangesBytes:true,dropUnusedElementFieldChangesBytes:true,projectedDateRejectedByGuard:true,resultDateRejectedByGuard:true,dateStringHasSameJSONButDifferentJSValue:true,throws:errors},interfaceProbeRejection:rejection.replaceAll(root,'<app>'),status:'blocked by the requested projection escape condition; no promotion or timing'};
if(process.argv.includes('--write'))fs.writeFileSync(new URL('evidence.json',import.meta.url),JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify(evidence,null,2));
