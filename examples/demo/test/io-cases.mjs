import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { database, fixtureOrders, fixtureWebhookSecret } from "../bench/io/seed.mjs";

export function ioCases({ token, clock, env }) {
  const cookie = { cookie: `theme=dark; session=${token}` };
  const order = { id: "created-1", email: "ada@example.com", items: [{ sku: "LAMP", quantity: 2 }, { sku: "MUG", quantity: 1 }] };
  const event = { id: "evt_parity_1", type: "payment_intent.succeeded", data: { object: {
    id: "pi_parity_1", amount_received: 11600, currency: "usd", metadata: { orderId: "created-1" },
  } } };
  const payment = (raw, stamp = clock, signature) => ({ path: "/api/app/webhooks/payment", method: "POST", body: raw,
    headers: { "stripe-signature": signature ?? `t=${stamp},v1=${createHmac("sha256", fixtureWebhookSecret).update(`${stamp}.${raw}`).digest("hex")}` } });
  const create = (body, status = 422) => ({ path: "/api/app/orders", method: "POST", headers: cookie, body: JSON.stringify(body), status });
  return [
    { path: "/api/app/orders", status: 401 },
    { path: "/api/app/orders", headers: { cookie: "session=broken" }, status: 401 },
    { path: "/api/app/orders", method: "POST", body: JSON.stringify(order), status: 401 },
    { path: "/api/app/orders", headers: cookie, status: 200, check(body) {
      const result = JSON.parse(body);
      assert.equal(result.orders.length, 50);
      assert.equal(result.totalCents, fixtureOrders("user-42").reduce((sum, row) => sum + row.items.reduce((n, item) => n + item.quantity * item.unitPriceCents, 0), 0));
      assert.equal(result.orders[0].totalCents, 7900);
      assert.equal(result.orders[0].itemCount, 3);
      assert.equal(result.orders[49].id, "seed-50");
    } },
    { path: "/api/app/orders?status=paid", headers: cookie, status: 200, check(body) {
      const result = JSON.parse(body); assert.equal(result.orders.length, 33); assert.ok(result.orders.every((o) => o.status === "paid"));
    } },
    { path: "/api/app/orders?status=unknown", headers: cookie, status: 400 },
    { path: "/api/app/orders", method: "POST", headers: cookie, body: "{", status: 400 },
    ...[null, [], {}, { ...order, extra: true }, { ...order, email: "bad" }, { ...order, items: [] },
      { ...order, id: "../../bad" }, { ...order, items: [{ sku: "FAKE", quantity: 1 }] },
      ...[0, 21, 1.5, "2"].map((quantity) => ({ ...order, items: [{ sku: "LAMP", quantity }] })),
      { ...order, items: Array(11).fill(order.items[0]) },
    ].map((value) => create(value)),
    { ...create(order, 201), check(body) { const result = JSON.parse(body); assert.equal(result.totalCents, 11600); assert.equal(result.order.userId, "user-42"); } },
    { path: "/api/app/orders", headers: cookie, status: 200, check(body) {
      const result = JSON.parse(body); assert.equal(result.orders.length, 50); assert.equal(result.orders[0].id, "created-1"); assert.equal(result.orders.at(-1).id, "seed-49");
    } },
    { path: "/api/app/orders", method: "POST", headers: cookie, body: "a".repeat(16385), status: 413 },
    { ...payment(JSON.stringify(event), clock - 301), status: 400 },
    { ...payment(JSON.stringify(event), clock + 301), status: 400 },
    { ...payment(JSON.stringify(event), clock, `t=${clock},v1=${"0".repeat(64)}`), status: 400 },
    { ...payment(JSON.stringify(event), clock, `t=${clock},v1=abc`), status: 400 },
    { ...payment(JSON.stringify(event), clock, ""), status: 400 },
    { ...payment("{"), status: 400 },
    { ...payment("null"), status: 422 },
    { ...payment(JSON.stringify({ ...event, type: "payment_intent.failed" })), status: 422 },
    { ...payment(JSON.stringify(event)), status: 200, check(body) { assert.deepEqual(JSON.parse(body), { received: true, duplicate: false }); } },
    { ...payment(JSON.stringify(event)), status: 200, check(body) { assert.deepEqual(JSON.parse(body), { received: true, duplicate: true }); } },
    { ...payment(JSON.stringify({ ...event, data: { object: { ...event.data.object, amount_received: 99999 } } })), status: 200, async check(body) {
      assert.deepEqual(JSON.parse(body), { received: true, duplicate: true });
      const db = database(env);
      const ledger = JSON.parse(await db.command(["HGET", `${db.prefix}:payments`, "created-1"]));
      assert.deepEqual(ledger, { paymentId: "pi_parity_1", amountCents: 11600, currency: "usd", status: "paid" });
    } },
    { ...payment("a".repeat(65537)), status: 413 },
  ];
}
