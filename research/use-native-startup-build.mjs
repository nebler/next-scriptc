// Reproduce instrumented before/after artifacts without retaining source edits.
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
const variant = process.argv[2];
if (!['before','after'].includes(variant)) throw Error('Use before or after');
const revenue = 'examples/demo/lib/revenue.ts', fixtures = 'examples/demo/lib/revenue-fixtures.ts';
const adapter = 'packages/next-scriptc/src/vercel.mjs', sidecar = 'packages/next-scriptc/src/functions/sidecar.mjs';
const snapshots = new Map(await Promise.all([revenue,fixtures,adapter,sidecar].map(async file => [file,await readFile(file)])));
const base = file => execFileSync('git',['show',`53da3a7:${file}`],{encoding:'utf8'});
try {
  if (variant === 'before') {
    const source = base(revenue);
    await writeFile(adapter, base(adapter));
    let runtime = base(sidecar);
    runtime = runtime.replace('const begin = performance.now();', `const begin = performance.now();
    const timing = process.env.NEXT_SCRIPTC_STARTUP_TIMING === '1';
    if(timing) console.error('scriptc-startup '+JSON.stringify({event:'spawn',monoMs:Number(process.hrtime.bigint())/1e6,uptimeMs:process.uptime()*1000,cpu:process.cpuUsage()}));`);
    runtime = runtime.replace('state.readyMs = performance.now() - begin;', `state.readyMs = performance.now() - begin;
          if(timing) console.error('scriptc-startup '+JSON.stringify({event:'observed-ready',elapsedMs:state.readyMs,monoMs:Number(process.hrtime.bigint())/1e6,uptimeMs:process.uptime()*1000,cpu:process.cpuUsage()}));`);
    runtime = runtime.replace('const match = /^next-scriptc:', `if(timing && line.startsWith('scriptc-startup ')) console.error(line);
        const match = /^next-scriptc:`);
    await writeFile(sidecar, runtime);
    await writeFile(revenue, source.replace('revenueEventsJson, type RevenueEvent','type RevenueEvent').replace('const fixtures = new Map([5000, 15000, 50000, 200000].map((size) => [size, revenueEventsJson(size)]));', 'const fixtures = createRevenueFixtures();').replace('// The same stored monthly exports', 'import { createRevenueFixtures } from "./revenue-fixtures.ts";\n\n// The same stored monthly exports'));
    await writeFile(fixtures, `import { performance } from "node:perf_hooks";
import { revenueEventsJson } from "../app/api/analytics/revenue/events.ts";
export function createRevenueFixtures(): Map<number,string> {
  const begin = performance.now();
  const value = new Map([5000,15000,50000,200000].map(size => [size,revenueEventsJson(size)]));
  if(process.env.NEXT_SCRIPTC_STARTUP_TIMING === "1") console.log("scriptc-startup " + JSON.stringify({event:"fixtures",durationMs:performance.now()-begin,uptimeMs:process.uptime()*1000}));
  return value;
}
`);
  }
  process.env.SCRIPTC_COMPILER = path.resolve('research/use-native-startup-compiler.mjs');
  process.env.SCRIPTC_CHECKER_SERVER = '0';
  process.env.NATIVE_VERCEL_TIMING = '1';
  process.env.NEXT_SCRIPTC_DEMO_GROUPS = 'vercel';
  await import('./use-native-vercel-build.mjs');
} finally {
  for(const [file,source] of snapshots) await writeFile(file,source);
}
