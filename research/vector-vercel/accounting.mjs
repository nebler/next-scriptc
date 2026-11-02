import { readArtifact } from '../lib/artifact.mjs';
// Read-only consistency audit of retained hosted diagnostics, no new requests.
import {writeFileSync} from 'node:fs';
const load=n=>JSON.parse(readArtifact(`research/vector-vercel/${n}.json`));
const observations=[];
for(let i=1;i<=3;i++)for(const k of ['node','stock','patched'])for(const d of load(`${k}-${i}`).diagnostics) observations.push({where:`${k}-${i}-deploy-${d.variant}`,body:d.body});
for(const r of load('measurements').rounds)for(const v of r.rows)if(v.afterSequential)observations.push({where:`set-${r.round}-${v.variant}-after-C1`,body:v.afterSequential.body});
const rows=observations.map(({where,body:b})=>{
 const cpuMs=(b.cpu.user+b.cpu.system)/1000,ticks=b.procCpuTicks.user+b.procCpuTicks.system;
 const procMsAt100Hz=ticks*10;
 const statusRss=/^VmRSS:\s+(\d+) kB/m.exec(b.status??'');
 return {where,cpuMs,ticks,impliedTicksPerSecond:ticks/(cpuMs/1000),procMsAt100Hz,differenceMs:cpuMs-procMsAt100Hz,rss:b.rss,procRss:statusRss?Number(statusRss[1])*1024:null};
});
const out={method:'Consistency check, not another timing series. Existing Linux protocol uses CLK_TCK=100. Compare independently read proc stat tick totals to API cumulative process CPU, with separate read times and tick quantization; hosted sysconf CLK_TCK was not queried. RSS comes from the same process status when available. This does not validate all concurrency/threads behavior.',rows};
writeFileSync('research/vector-vercel/accounting.json',JSON.stringify(out)+'\n');
console.log({observations:rows.length,maxAbsoluteCpuDifferenceMs:Math.max(...rows.map(x=>Math.abs(x.differenceMs))),rssMismatches:rows.filter(x=>x.procRss!==null&&x.rss!==x.procRss).length});
