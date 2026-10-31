import { eventsJson, type RevenueEvent } from "./events.ts";

type DailyRevenue = { day: string; region: string; revenueCents: number; units: number; events: number };
function validDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const from = params.get("from") ?? "2026-01-01";
  const to = params.get("to") ?? "2026-01-31";
  if (!validDay(from) || !validDay(to) || from > to) {
    return Response.json({ error: "from and to must be ordered ISO calendar dates" }, { status: 400 });
  }
  // This fixture is trusted application data; query parameters are validated above.
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
  return Response.json({ from, to, events: matched, revenueCents, daily }, { headers: { "cache-control": "no-store" } });
}
