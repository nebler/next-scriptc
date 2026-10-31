import { readFileSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";

type RevenueEvent = { day: string; region: string; amountCents: number; quantity: number };
type DailyRevenue = { day: string; region: string; revenueCents: number; units: number; events: number };

// Body of demo/lib/revenue.ts, with the stored JSON passed directly and the
// aggregate timer split around sorting. Both Node and scriptc run this file.
function revenue(input: string, from: string, to: string, profile: boolean) {
  const begin = profile ? performance.now() : 0;
  const events = JSON.parse(input) as RevenueEvent[];
  const parsed = profile ? performance.now() : 0;
  const totals = new Map<string, DailyRevenue>();
  let matched = 0;
  let revenueCents = 0;
  for (const event of events) {
    if (event.day < from || event.day > to) continue;
    const key = `${event.day}/${event.region}`;
    let total = totals.get(key);
    if (!total) {
      total = { day: event.day, region: event.region, revenueCents: 0, units: 0, events: 0 };
      totals.set(key, total);
    }
    const amount = event.amountCents * event.quantity;
    total.revenueCents += amount;
    total.units += event.quantity;
    total.events++;
    matched++;
    revenueCents += amount;
  }
  const grouped = profile ? performance.now() : 0;
  const daily = Array.from(totals.values());
  daily.sort((a, b) => a.day < b.day ? -1 : a.day > b.day ? 1 : a.region < b.region ? -1 : a.region > b.region ? 1 : 0);
  const sorted = profile ? performance.now() : 0;
  return { from, to, events: matched, revenueCents, daily,
    timings: profile ? { parseMs: parsed - begin, groupMs: grouped - parsed, sortMs: sorted - grouped } : null };
}

const input = readFileSync(process.env.INPUT!, "utf8");
const count = Number(process.env.ITERATIONS ?? "40");
const warmup = Number(process.env.WARMUP ?? "10");
const profile = process.env.PROFILE === "1";
const from = process.env.FROM ?? "2026-01-01";
const to = process.env.TO ?? "2026-01-31";
const samples: number[] = [];
const phases: { parseMs: number; groupMs: number; sortMs: number; remainderMs: number }[] = [];
let expected = "";
for (let i = -warmup; i < count; i++) {
  const start = performance.now();
  const result = revenue(input, from, to, profile);
  const elapsed = performance.now() - start;
  if (i >= 0) {
    samples.push(elapsed);
    if (result.timings) phases.push({ ...result.timings,
      remainderMs: elapsed - result.timings.parseMs - result.timings.groupMs - result.timings.sortMs });
  }
  // Output serialization/equality is outside the timed kernel in every runtime.
  result.timings = null;
  const output = JSON.stringify(result);
  if (expected && output !== expected) throw new Error("iteration output mismatch");
  expected = output;
}
writeFileSync(process.env.OUTPUT!, expected);
console.log(JSON.stringify({ samples, phases, count, warmup }));
