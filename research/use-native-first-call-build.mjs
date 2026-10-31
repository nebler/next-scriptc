// Reproduce the timing artifacts; runtime call/startup tracing is selected only
// when deploying a trace-* label. Ordinary after-* measurements keep it off.
import { readFile, writeFile } from 'node:fs/promises';
const phase = process.argv[2];
if (!['before','after'].includes(phase)) throw Error('Use before or after');
const file = 'packages/next-scriptc/src/functions/sidecar.mjs';
const source = await readFile(file);
try {
  if (phase === 'before') {
    const cold = source.toString().replace('if (warmup) setImmediate(', 'if (false) setImmediate(');
    if (cold === source.toString()) throw Error('Cannot locate automatic warm-up');
    await writeFile(file, cold);
  }
  process.env.SCRIPTC_CHECKER_SERVER = '0';
  process.env.NATIVE_VERCEL_TIMING = '1';
  process.env.NEXT_SCRIPTC_DEMO_GROUPS = 'vercel';
  await import('./use-native-vercel-build.mjs');
} finally { await writeFile(file, source); }
