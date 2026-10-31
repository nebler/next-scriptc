export const headers = { "cache-control": "no-store" };
export function invalid() {
  return Response.json({ error: "invalid input" }, { status: 400, headers });
}
export type Total = { key: number; orders: number; revenueCents: number };
export function add(totals: Map<number, Total>, key: number, revenue: number) {
  const total = totals.get(key);
  if (total) {
    total.orders++;
    total.revenueCents += revenue;
  } else totals.set(key, { key, orders: 1, revenueCents: revenue });
}
export function sorted(totals: Map<number, Total>): Total[] {
  return Array.from(totals.values()).sort(
    (a, b) => b.revenueCents - a.revenueCents || a.key - b.key,
  );
}
export function integer(value: string, min: number, max: number): number {
  if (value.length === 0) throw new Error("empty integer");
  for (let i = 0; i < value.length; i++)
    if (value.charCodeAt(i) < 48 || value.charCodeAt(i) > 57)
      throw new Error("invalid integer");
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < min || n > max)
    throw new Error("integer range");
  return n;
}
