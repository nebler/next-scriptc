import {forecast} from '../../../lib/forecast';
import {panelFromSnapshot} from '../../../lib/panel.mjs';
import {runtimeSnapshot} from 'scriptc-promote/runtime';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  const input = await request.json().catch(() => null);
  if (!input || !['trials', 'seed', 'cash', 'revenue', 'costs'].every(k =>
    typeof input[k] === 'number' && Number.isSafeInteger(input[k])) ||
    input.trials < 1 || input.trials > 100000 || input.seed < 1 || input.seed > 4294967295 ||
    ['cash', 'revenue', 'costs'].some(k => input[k] < 0 || input[k] > 10000000)) {
    return Response.json({error: 'Use integer trials 1–100000, seed 1–4294967295, and amounts 0–10000000.'}, {status: 400});
  }
  const start = performance.now();
  const result = forecast(input);
  const serverMs = performance.now() - start;
  return Response.json({result, serverMs, panel: panelFromSnapshot(runtimeSnapshot(), process.env.SHARED_NATIVE_FUNCTION_ID)});
}
