import { createHmac, createHash } from "node:crypto";
import { fixtureClock, fixtureOrders, fixtureWebhookSecret } from "./seed.mjs";
import { serverEnv } from "../config.mjs";

export const ioServerEnv = { ...serverEnv, DEMO_WEBHOOK_SECRET: fixtureWebhookSecret };
const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
function token(sub) {
  const message = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub, iss: "next-scriptc-demo", aud: "demo-api", iat: fixtureClock, exp: fixtureClock + 3600 })}`;
  return `${message}.${createHmac("sha256", serverEnv.DEMO_JWT_SECRET).update(message).digest("base64url")}`;
}
const cookies = Object.fromEntries(["user-42", "user-writer"].map((user) => [user, `session=${token(user)}`]));
export const workloads = ["orders-get", "orders-post", "payment"];
export const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const rows = fixtureOrders("user-42").map((order) => ({ id: order.id, createdAt: order.createdAt, status: order.status,
  itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
  totalCents: order.items.reduce((sum, item) => sum + item.quantity * item.unitPriceCents, 0), items: order.items }));
const getBody = { userId: "user-42", currency: "USD", orders: rows, totalCents: rows.reduce((sum, row) => sum + row.totalCents, 0) };
export function spec(workload, index = 0, phase = "load") {
  if (!/^[a-z0-9_-]{1,24}$/.test(phase) || !Number.isSafeInteger(index) || index < 0) throw new Error("Invalid request sequence");
  if (workload === "orders-get") return { workload, path: "/api/app/orders", headers: { cookie: cookies["user-42"] }, status: 200, expected: digest(JSON.stringify(getBody)) };
  if (workload === "orders-post") {
    const body = { id: `${phase}-${index}`, email: "ada@example.com", items: [{ sku: "LAMP", quantity: 2 }, { sku: "CABLE", quantity: 1 }] };
    const expected = { order: { id: body.id, userId: "user-writer", email: body.email, createdAt: fixtureClock, status: "pending",
      items: [{ sku: "LAMP", quantity: 2, unitPriceCents: 4900 }, { sku: "CABLE", quantity: 1, unitPriceCents: 1200 }] }, currency: "USD", totalCents: 11000 };
    return { workload, path: "/api/app/orders", method: "POST", body: JSON.stringify(body), status: 201,
      headers: { cookie: cookies["user-writer"], "content-type": "application/json" }, expected: digest(JSON.stringify(expected)) };
  }
  if (workload !== "payment") throw new Error(`Unknown workload: ${workload}`);
  const body = JSON.stringify({ id: `evt_${phase}-${index}`, type: "payment_intent.succeeded", data: { object: {
    id: `pi_${phase}-${index}`, amount_received: 11000, currency: "usd", metadata: { orderId: `${phase}-${index}` },
  } } });
  const signature = createHmac("sha256", fixtureWebhookSecret).update(`${fixtureClock}.${body}`).digest("hex");
  return { workload, path: "/api/app/webhooks/payment", method: "POST", status: 200, body,
    headers: { "content-type": "application/json", "stripe-signature": `t=${fixtureClock},v1=${signature}` },
    expected: digest(JSON.stringify({ received: true, duplicate: false })) };
}
