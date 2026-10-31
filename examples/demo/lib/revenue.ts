import { revenueTrace, revenueMark } from "./revenue-trace.ts";
import { performance } from "node:perf_hooks";
import type { RevenueEvent } from "../app/api/analytics/revenue/events.ts";
import { revenueFixture } from "./revenue-fixtures.ts";

type DailyRevenue = { day: string; region: string; revenueCents: number; units: number; events: number };

export async function revenue(from: string, to: string, size: number, profile: boolean) {
  "use native";
  const begin = profile ? performance.now() : 0;
  const trace = revenueTrace();
  const fixture = revenueFixture(size)!;
  revenueMark(trace);
  const events = JSON.parse(fixture) as RevenueEvent[];
  revenueMark(trace);
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
  const daily = Array.from(totals.values());
  daily.sort((a, b) => a.day < b.day ? -1 : a.day > b.day ? 1 : a.region < b.region ? -1 : a.region > b.region ? 1 : 0);
  revenueMark(trace, true);
  return { from, to, events: matched, revenueCents, daily, timings: profile ? { parseMs: parsed - begin, aggregateMs: performance.now() - parsed } : null };
}

