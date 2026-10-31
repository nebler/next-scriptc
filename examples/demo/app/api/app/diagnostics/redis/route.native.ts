import { json, prefix, redis } from "../../common.ts";

// Separate unmeasured diagnostic: actual fixture command, including HTTP/TLS,
// body drain and JSON envelope parsing. No timers in the measured routes.
export async function GET(request: Request) {
  const user = new URL(request.url).searchParams.get("user") ?? "user-42";
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(user)) return json({ error: "Invalid user" }, 400);
  const start = performance.now();
  try {
    const rows = await redis(["LRANGE", `${prefix}:orders:${user}`, 0, 49]) as string[];
    return json({ redisMs: performance.now() - start, rows: rows.length });
  } catch { return json({ error: "Redis unavailable" }, 503); }
}
