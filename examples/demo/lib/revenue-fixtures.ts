import { performance } from "node:perf_hooks";
import { revenueEventsJson } from "../app/api/analytics/revenue/events.ts";

// Materialize only the requested export, once per size and runtime. In a native
// build the transformed Node module no longer generates unused large fixtures.
const fixtures = new Map<number, string>();
export function revenueFixture(size: number): string | undefined {
  if (![5000, 15000, 50000, 200000].includes(size)) return undefined;
  let value = fixtures.get(size);
  if (value === undefined) {
    const begin = performance.now();
    value = revenueEventsJson(size);
    fixtures.set(size, value);
    if (process.env.NEXT_SCRIPTC_STARTUP_TIMING === "1") console.log("scriptc-startup " + JSON.stringify({ event: "fixture", size, durationMs: performance.now() - begin, uptimeMs: process.uptime() * 1000 }));
  }
  return value;
}
