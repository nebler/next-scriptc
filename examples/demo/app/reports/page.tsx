import { Suspense } from "react";
import { connection } from "next/server";
import { eventsJson, type RevenueEvent } from "../api/analytics/revenue/events.ts";
import { reportAction } from "../../lib/report-action.ts";
import { echo, fail } from "../../lib/native-example.ts";

type DailyRevenue = { day: string; region: string; revenueCents: number; units: number; events: number };

async function revenue(from: string, to: string) {
  "use scriptc";
  const events = JSON.parse(eventsJson) as RevenueEvent[];
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
  return { from, to, events: matched, revenueCents, daily };
}

async function Report({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; error?: string; message?: string }> }) {
  await connection();
  const params = await searchParams;
  try {
    const result = await revenue(params.from ?? "2026-01-01", params.to ?? "2026-01-31");
    if (params.error) await fail(params.error);
    return <><h1>{await echo(params.message ?? "Revenue report")}</h1><pre id="result">{JSON.stringify(result)}</pre></>;
  } catch (error) {
    return <pre id="error">{error instanceof Error ? error.message : String(error)}</pre>;
  }
}

export default function Page({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; error?: string; message?: string }> }) {
  return <Suspense fallback={<p>Loading report…</p>}><Report searchParams={searchParams} /><form action={reportAction}><input name="value" defaultValue="Revenue report" /><button>Send through a Server Action</button></form></Suspense>;
}
