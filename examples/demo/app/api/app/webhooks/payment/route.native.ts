import { createHmac, timingSafeEqual } from "node:crypto";
import { parsePayment } from "./schema.ts";
import { json, now, prefix, redis, webhookSecret } from "../../common.ts";

// Deduplication and the payment-ledger update commit together. A failure cannot
// leave a processed marker without the payment (or apply a replay twice).
const apply = "if redis.call('EXISTS', KEYS[1]) == 1 then return 0 end; redis.call('HSET', KEYS[2], ARGV[1], ARGV[2]); redis.call('SET', KEYS[1], '1', 'EX', 86400); return 1";

export async function POST(request: Request) {
  const raw = await request.text();
  if (raw.length > 65536) return json({ error: "Webhook body too large" }, 413);
  const header = request.headers.get("stripe-signature") ?? "";
  let timestamp = "";
  const signatures: string[] = [];
  for (const entry of header.split(",")) {
    if (entry.startsWith("t=")) timestamp = entry.slice(2);
    if (entry.startsWith("v1=")) signatures.push(entry.slice(3));
  }
  if (!/^\d{1,12}$/.test(timestamp) || Math.abs(now() - Number(timestamp)) > 300) return json({ error: "Invalid webhook signature" }, 400);
  const expected = createHmac("sha256", webhookSecret).update(`${timestamp}.${raw}`).digest();
  let verified = false;
  for (const signature of signatures) {
    if (/^[a-fA-F0-9]{64}$/.test(signature) && timingSafeEqual(expected, Buffer.from(signature, "hex"))) verified = true;
  }
  if (!verified) return json({ error: "Invalid webhook signature" }, 400);
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return json({ error: "Invalid JSON" }, 400); }
  const event = parsePayment(body);
  if (event === null) return json({ error: "Invalid payment event" }, 422);
  try {
    const applied = await redis(["EVAL", apply, 2, `${prefix}:event:${event.id}`, `${prefix}:payments`, event.orderId,
      JSON.stringify({ paymentId: event.paymentId, amountCents: event.amountCents, currency: event.currency, status: "paid" })]);
    return json({ received: true, duplicate: applied === 0 });
  } catch { return json({ error: "Payment storage unavailable" }, 503); }
}
