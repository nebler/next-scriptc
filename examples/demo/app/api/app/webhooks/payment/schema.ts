export type Payment = { id: string; paymentId: string; amountCents: number; currency: string; orderId: string };

// Stripe-style event envelope guard. The zod async-module version hit SC1016
// before execution; both runtimes use this same guard, with no SDK fallback.
export function parsePayment(body: unknown): Payment | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  const event = body as { id?: unknown; type?: unknown; data?: unknown };
  if (typeof event.id !== "string" || !/^evt_[a-zA-Z0-9_-]{1,64}$/.test(event.id) || event.type !== "payment_intent.succeeded") return null;
  if (typeof event.data !== "object" || event.data === null || Array.isArray(event.data)) return null;
  const data = event.data as { object?: unknown };
  if (typeof data.object !== "object" || data.object === null || Array.isArray(data.object)) return null;
  const intent = data.object as { id?: unknown; amount_received?: unknown; currency?: unknown; metadata?: unknown };
  if (typeof intent.id !== "string" || !/^pi_[a-zA-Z0-9_-]{1,64}$/.test(intent.id) || intent.currency !== "usd") return null;
  if (typeof intent.amount_received !== "number" || !Number.isInteger(intent.amount_received) || intent.amount_received < 1 || intent.amount_received > 100000000) return null;
  if (typeof intent.metadata !== "object" || intent.metadata === null || Array.isArray(intent.metadata)) return null;
  const metadata = intent.metadata as { orderId?: unknown };
  if (typeof metadata.orderId !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(metadata.orderId)) return null;
  return { id: event.id, paymentId: intent.id, amountCents: intent.amount_received, currency: intent.currency, orderId: metadata.orderId };
}
