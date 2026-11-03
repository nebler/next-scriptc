// Derive literal call shapes from tests, replacing string payloads deterministically.
import {createRequire} from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const require=createRequire(new URL('../../../packages/scriptc-promote/package.json',import.meta.url));
const ts=require('typescript');
const [root,file,namesJson,out]=process.argv.slice(2),names=JSON.parse(namesJson),inputs={},provenance={};
let files=[];try{files=execFileSync('rg',['-l','--glob','*.test.*','--glob','*.spec.*',names.join('|'),root],{encoding:'utf8'}).trim().split('\n').filter(Boolean);}catch{}
function literal(n){
 if(ts.isStringLiteral(n)||ts.isNoSubstitutionTemplateLiteral(n))return n.text.replace(/[A-Za-z]/g,(_,i)=>String.fromCharCode(97+i%26)).replace(/[0-9]/g,'3');
 if(ts.isNumericLiteral(n))return Number(n.text);
 if(n.kind===ts.SyntaxKind.TrueKeyword)return true;if(n.kind===ts.SyntaxKind.FalseKeyword)return false;if(n.kind===ts.SyntaxKind.NullKeyword)return null;
 if(ts.isPrefixUnaryExpression(n)&&n.operator===ts.SyntaxKind.MinusToken)return -literal(n.operand);
 if(ts.isArrayLiteralExpression(n))return n.elements.map(literal);
 if(ts.isObjectLiteralExpression(n))return Object.fromEntries(n.properties.map(p=>{if(!ts.isPropertyAssignment(p))throw Error();return [p.name.text,literal(p.initializer)];}));
 throw Error('nonliteral');
}
for(const test of files){
 const ast=ts.createSourceFile(test,fs.readFileSync(test,'utf8'),ts.ScriptTarget.Latest,true);
 function visit(n){if(ts.isCallExpression(n)){const name=ts.isIdentifier(n.expression)?n.expression.text:ts.isPropertyAccessExpression(n.expression)?n.expression.name.text:'';
 if(names.includes(name))try{const args=n.arguments.map(literal),id=file+'#'+name;if(args.length&&(inputs[id]?.length??0)<3){(inputs[id]??=[]).push(args);provenance[id]={kind:'test-shape-derived',file:path.relative(root,test),note:'Literal sizes, numbers and object keys retained; string payloads synthesized. No production frequencies.'};}}catch{}}
 ts.forEachChild(n,visit);}visit(ast);
}
fs.writeFileSync(out,JSON.stringify(inputs));fs.writeFileSync(out+'.meta',JSON.stringify(provenance));
