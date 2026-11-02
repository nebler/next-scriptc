import { readArtifact } from '../lib/artifact.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { createClient, quantile } from '../../examples/demo/bench/heavy/client.mjs';
import { spec } from '../../examples/demo/bench/heavy/fixtures.mjs';
export const secret = parseEnv(readFileSync('.env.local','utf8')).VERCEL_AUTOMATION_BYPASS_SECRET;
if (!secret) throw new Error('Missing private protection bypass');
export const reference = JSON.parse(readArtifact('research/vector-vercel/reference.json'));
export const client = createClient({secret,budget:1800,deadlineMs:30000});
export const fixture = {...spec('vectors',100000),expected:reference.responseSha256};
export const save = (name,data) => writeFileSync(`research/vector-vercel/${name}.json`,JSON.stringify(data)+'\n');
export const load = name => JSON.parse(readArtifact(`research/vector-vercel/${name}.json`));
export function sample(r) {
 const computeMs=Number(/^compute;dur=([\d.]+)$/.exec(r.headers['server-timing'])?.[1]);
 const cpuMs=Number(r.headers['x-vector-cpu-us'])/1000, rss=Number(r.headers['x-vector-rss']);
 if (![computeMs,cpuMs,rss].every(x=>Number.isFinite(x)&&x>=0)||rss===0||!r.headers['x-vector-instance']) throw new Error('Missing/invalid observations');
 return {e2eMs:r.ms,computeMs,cpuMs,rss,instance:r.headers['x-vector-instance'],initMs:Number(r.headers['x-vector-init-ms']),requestId:r.headers['x-vercel-id'],digest:r.digest,reusedSocket:r.reusedSocket};
}
export const variants = (kind,url) => kind==='node' ? [
 {variant:'node',url,path:'/api/heavy/vectors',diagnostic:'/api/heavy/diagnostics',firstScope:'deployment-first'},
 {variant:'go-plain',url,path:'/api/heavy-go/vectors?kernel=plain',diagnostic:'/api/heavy-go/diagnostics',firstScope:'Function-first, after Node request'},
 {variant:'go-simd',url,path:'/api/heavy-go-simd/vectors?kernel=simd',diagnostic:'/api/heavy-go-simd/diagnostics',firstScope:'Function-first, after Node and Go plain requests'},
] : [{variant:kind==='stock'?'stock-natural':'patched-natural',url,path:'/api/heavy/vectors',diagnostic:'/api/heavy/diagnostics',firstScope:'deployment-first'},
 ...(kind==='stock'?[{variant:'stock-imul',url,path:'/api/heavy/vectors-imul',diagnostic:'/api/heavy/diagnostics',firstScope:'route-first, shares already-invoked natural Function'}]:[])];
export {quantile};
