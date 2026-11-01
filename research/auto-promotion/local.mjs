import {writeFile} from 'node:fs/promises';
import {overhead} from '../../.checks/auto-promotion/stage/bench.mjs';
await writeFile(import.meta.dirname+'/raw/local-overhead.json',JSON.stringify({at:new Date().toISOString(),node:process.version,conditions:'Shared workstation; concurrent agent running WebAssembly CPU benchmarks; no idle-machine claim.',result:overhead(),initial:overhead({mode:'auto'})},null,2));
