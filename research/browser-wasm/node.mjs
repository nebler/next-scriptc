import {readFile,writeFile} from 'node:fs/promises';
import {forecast} from '../../examples/shared-native/lib/forecast.ts';
import {instantiate} from '../../packages/next-scriptc/src/cloudflare/bridge.mjs';
import {measure} from './measure.mjs';
const file=process.argv[2] || '/tmp/w1-browser-wasm/compute.wasm';
const reactor=instantiate(await WebAssembly.compile(await readFile(file)));
const result=measure(forecast,reactor,{node:process.version,platform:process.platform,arch:process.arch});
await writeFile(process.argv[3] || '/tmp/w1-node.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result.rows.map(({jsSamples,wasmSamples,...r})=>r),null,2));
