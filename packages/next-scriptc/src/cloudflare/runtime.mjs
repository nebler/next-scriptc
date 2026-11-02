// The wrapper installs a precompiled reactor; no timers or Node APIs are used.
const key = Symbol.for('next-scriptc.cloudflare');
export function installCloudflare(api) { globalThis[key] = api ? { api, buckets: new Map() } : undefined; }
export function dispatchCloudflare(input, js, lane = 'js') {
  const state = globalThis[key];
  if (lane !== 'wasm' || !state) return js(input);
  const bucket = Math.floor(Math.log2(Math.max(1, new TextEncoder().encode(input).length)));
  const count = state.buckets.get(bucket) ?? 0;
  const shadow = count < 3 || count % 32 === 0;
  // Capture JS first, before any native code can fail.
  const expected = shadow ? js(input) : undefined;
  try {
    const actual = state.api.run(input);
    if (!shadow || actual === expected) {
      state.buckets.set(bucket, count + 1);
      return actual;
    }
  } catch { /* A trap or mismatch disables this isolate permanently. */ }
  globalThis[key] = undefined;
  return shadow ? expected : js(input);
}
export function cloudflareStatus() {
  const state = globalThis[key];
  return { available: !!state, buckets: state ? Object.fromEntries(state.buckets) : {}, memoryBytes: state?.api.memoryBytes() ?? 0 };
}
