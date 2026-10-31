import type { AsyncLocalStorage } from "node:async_hooks";

type Sample = { functionMs?: number; readyBeforeCall?: boolean; bootMs?: number | null; attempts?: number; pid?: number | null };
export async function timeRevenue<T>(call: () => Promise<T>): Promise<T> {
  if (process.env.NATIVE_VERCEL_TIMING !== "1") return call();
  const globals = globalThis as typeof globalThis & { [key: symbol]: unknown };
  const sample = (globals[Symbol.for("next-scriptc.report-timing")] as AsyncLocalStorage<Sample> | undefined)?.getStore();
  const sidecar = globals[Symbol.for("next-scriptc.functions.sidecar")] as { state: { ready: boolean; readyMs: number | null; attempts: number; pid: number | null } } | undefined;
  if (sample) sample.readyBeforeCall = sidecar?.state.ready ?? false;
  const begin = performance.now();
  try { return await call(); }
  finally {
    if (sample) Object.assign(sample, { functionMs: performance.now() - begin, bootMs: sidecar?.state.readyMs, attempts: sidecar?.state.attempts, pid: sidecar?.state.pid });
  }
}
