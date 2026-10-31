import { now } from "../verify/tokens.ts";

export { now };
export const prefix = process.env.DEMO_REDIS_PREFIX ?? "next-scriptc:io";
export const webhookSecret = process.env.DEMO_WEBHOOK_SECRET ?? "next-scriptc-demo-payment-signing-secret";
export const privateHeaders = { "cache-control": "no-store" };

export function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: privateHeaders });
}

// The same REST transport runs in both variants. No retry, local data fallback,
// timing instrumentation, SDK substitution or runtime-specific fast path.
export async function redis(command: (string | number)[]): Promise<unknown> {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new Error("Redis REST configuration required");
  const options = {
    method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(command),
    signal: AbortSignal.timeout(10000),
  };
  const response = await fetch(url, options);
  if (!response.ok) throw new Error("Redis HTTP request failed");
  const body = await response.json() as { result?: unknown; error?: string };
  if (body.error !== undefined) throw new Error("Redis command failed");
  return body.result;
}
