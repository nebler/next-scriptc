// Correctness/build fixture only. No benchmark loop or performance measurement.
import {createRequire} from 'node:module';
import {writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {promotionCandidates} from '../packages/next-scriptc/src/functions/promotion-discovery.mjs';
import {checkFunctionTypes} from '../packages/next-scriptc/src/functions/types.mjs';
import {buildPromotion} from '../packages/next-scriptc/src/functions/promotion-build.mjs';
const require=createRequire(import.meta.url),ts=require(require.resolve('typescript',{paths:[process.cwd()]}));
export const scratch=fileURLToPath(new URL('../.checks/boundary/',import.meta.url));
export const fixture=`export function mixed(s:string,n:number,b:boolean,z:null,o:{x:number},a:number[]):string {"use native";return s+":"+String(n)+":"+String(b)+":"+String(z)+":"+String(o.x+a[0]);}
export function bytes(a:Uint8Array):Uint8Array {"use native";return a;}
export function numeric(n:number):number {"use native";return n;}
export function flag(b:boolean):boolean {"use native";return b;}
export function nil(z:null):null {"use native";return z;}
export function object(o:{x:string}):{x:string} {"use native";return o;}`;
export async function buildBoundary(target=`${process.platform}-${process.arch}${process.platform==='linux'?'-gnu':''}`,timing=false){
 await mkdir(scratch,{recursive:true});const source=path.join(scratch,'fixture.ts');await writeFile(source,fixture);
 const modules=promotionCandidates(fixture,source);
 checkFunctionTypes(ts,ts.createProgram([source],{strict:true,target:ts.ScriptTarget.ES2022}),modules);
 const output=path.join(scratch,target+(timing?'-timing':''));
 await buildPromotion(modules,output,{target,timing});return {output,modules};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const target=process.argv[2]??`${process.platform}-${process.arch}${process.platform==='linux'?'-gnu':''}`;
 const {output}=await buildBoundary(target,process.argv.includes('--timing'));console.log(`Built ${target}: ${output}`);
}
