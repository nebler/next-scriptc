type RevenueEvent = { day: string; region: string; amountCents: number; quantity: number };
export function revenueEventsJson(size: number): string {
  const events: RevenueEvent[] = [];
  for (let i = 0; i < size; i++) {
    events.push({ day: `2026-01-${String(1 + i % 31).padStart(2, "0")}`,
      region: `region-${i % 8}`, amountCents: 100 + (i * 7919) % 49900, quantity: 1 + i % 5 });
  }
  // A stored JSON export, parsed per query just as a file/object-store payload is.
  return JSON.stringify(events);
}
export const eventsJson = revenueEventsJson(5000);
export type { RevenueEvent };
