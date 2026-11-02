type RevenueEvent = { day: string; region: string; amountCents: number; quantity: number };

type DailyRevenue = { day: string; region: string; revenueCents: number; units: number; events: number };

export function revenueCore(from: string, to: string, eventsJson: string) {
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
  return { from, to, events: matched, revenueCents, daily, timings: null };
}


export function timeDecoy(values: number[]): number { let n=0;for(const v of values)n+=v;return n+Date.now(); }
export function getterDecoy(value: number): number {return value;}
// Native corruption is deliberately injected by the measurement harness only.
export function mismatchCandidate(values: number[]): number {let n=0;for(const v of values)n+=v;return n;}
