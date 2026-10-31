import { safeParse, flatten } from "valibot";
import { json, now, prefix, redis } from "../common.ts";
import { subject } from "../auth.ts";
import { createOrder, price, type Order } from "./schema.ts";

export async function GET(request: Request) {
  const userId = await subject(request);
  if (userId === null) return json({ error: "Invalid or missing session" }, 401);
  const status = new URL(request.url).searchParams.get("status");
  if (status !== null && status !== "pending" && status !== "paid") return json({ error: "Invalid status filter" }, 400);
  try {
    const rows = await redis(["LRANGE", `${prefix}:orders:${userId}`, 0, 49]) as string[];
    const orders = rows.map((row) => JSON.parse(row) as Order)
      .filter((order) => status === null || order.status === status)
      .map((order) => ({
        id: order.id, createdAt: order.createdAt, status: order.status,
        itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
        totalCents: order.items.reduce((sum, item) => sum + item.quantity * item.unitPriceCents, 0),
        items: order.items.map((item) => ({ sku: item.sku, quantity: item.quantity, unitPriceCents: item.unitPriceCents })),
      }));
    return json({ userId, currency: "USD", orders, totalCents: orders.reduce((sum, order) => sum + order.totalCents, 0) });
  } catch { return json({ error: "Order storage unavailable" }, 503); }
}

// Keep the recent list bounded and update it atomically under concurrent writes.
const append = "redis.call('LPUSH', KEYS[1], ARGV[1]); redis.call('LTRIM', KEYS[1], 0, 49); return 1";

export async function POST(request: Request) {
  const userId = await subject(request);
  if (userId === null) return json({ error: "Invalid or missing session" }, 401);
  const raw = await request.text();
  if (raw.length > 16384) return json({ error: "Order body too large" }, 413);
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return json({ error: "Invalid JSON" }, 400); }
  const parsed = safeParse(createOrder, body);
  if (!parsed.success) return json({ error: "Invalid order", issues: flatten(parsed.issues) }, 422);
  const order: Order = {
    id: parsed.output.id, userId, email: parsed.output.email, createdAt: now(), status: "pending",
    items: parsed.output.items.map((item) => ({ sku: item.sku, quantity: item.quantity, unitPriceCents: price(item.sku) })),
  };
  const totalCents = order.items.reduce((sum, item) => sum + item.quantity * item.unitPriceCents, 0);
  try {
    await redis(["EVAL", append, 1, `${prefix}:orders:${userId}`, JSON.stringify(order)]);
    return json({ order, currency: "USD", totalCents }, 201);
  } catch { return json({ error: "Order storage unavailable" }, 503); }
}
