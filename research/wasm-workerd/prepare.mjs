import {readFile,writeFile,copyFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'../..'),scratch=root+'/.checks/wasm-workerd';
const require=createRequire(scratch+'/package.json');const esbuild=require('esbuild');
// JS keeps the original async revenue export. Wasm has the documented sync edit.
await writeFile(scratch+'/stage/revenue-js.ts',(await readFile(scratch+'/stage/revenue.ts','utf8')).replace('export function revenue','export async function revenue'));
for(const kind of ['revenue','regex','vector'])for(const variant of ['js','wasm']) {
 const name=kind+'-'+variant;
 const entry=`import {serialize} from './json.ts';\n${variant==='wasm'?`import module from 'bench.wasm';import {instantiate} from ${JSON.stringify(root+'/research/wasm-workerd/src/bridge.mjs')};`:`import {${kind}} from './${kind==='revenue'?'revenue-js':kind}.ts';`}\nlet api;\nexport default {async fetch(request){try {const url=new URL(request.url);if(url.pathname==='/health')return new Response('ready');if(url.pathname==='/meta')return Response.json({memoryBytes:api?.memoryBytes(),calls:api?.calls});const args=JSON.parse(await request.text());let value;${variant==='wasm'?`api ||= instantiate(module);value=JSON.parse(api.run(serialize(args)));`:`value=await ${kind}(...args);`}return Response.json(value);}catch(error){return new Response(String(error.stack||error),{status:500});}}};\n`;
 await writeFile(scratch+'/stage/worker-'+name+'.ts',entry);
 await esbuild.build({entryPoints:[scratch+'/stage/worker-'+name+'.ts'],outfile:scratch+'/'+name+'.mjs',bundle:true,format:'esm',platform:'browser',external:['bench.wasm'],define:{'process.env.NEXT_SCRIPTC_STARTUP_TIMING':'""'},plugins:[{name:'perf',setup(build){build.onResolve({filter:/^node:perf_hooks$/},()=>({path:'perf',namespace:'perf'}));build.onLoad({filter:/.*/,namespace:'perf'},()=>({contents:'export const performance = globalThis.performance;',loader:'js'}));}}]});
 const schema='./node_modules/workerd/workerd.capnp';
 await writeFile(scratch+'/'+name+'.capnp',`using Workerd = import ${JSON.stringify(schema)};\nconst config :Workerd.Config = (services=[(name="main",worker=(modules=[(name="worker.mjs",esModule=embed "${name}.mjs")${variant==='wasm'?`,(name="bench.wasm",wasm=embed "${kind}.wasm")`:''}],compatibilityDate="2026-10-31"))],sockets=[(name="http",address="127.0.0.1:8799",http=(),service="main")]);\n`);
}
// Preserve exact dependency versions without committing downloaded artifacts.
await copyFile(scratch+'/package.json',import.meta.dirname+'/scratch-package.json');
await copyFile(scratch+'/package-lock.json',import.meta.dirname+'/scratch-package-lock.json');
