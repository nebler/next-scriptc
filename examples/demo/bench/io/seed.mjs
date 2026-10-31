import { pathToFileURL } from "node:url";

export const localRedisEnv = { UPSTASH_REDIS_REST_URL: "http://127.0.0.1:8079", UPSTASH_REDIS_REST_TOKEN: "local-redis-only" };
export const fixtureClock = 1793318400;
export const fixtureJwtSecret = "next-scriptc-io-only-jwt-signing-key-32-bytes";
export const fixtureWebhookSecret = "next-scriptc-demo-payment-signing-secret";

export function database(env = process.env) {
  const url = env.UPSTASH_REDIS_REST_URL ?? env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN ?? env.KV_REST_API_TOKEN;
  const prefix = env.DEMO_REDIS_PREFIX ?? "next-scriptc:io";
  if (!url || !token) throw new Error("Redis REST configuration required");
  if (!/^next-scriptc:(?:io|parity)(?::[a-zA-Z0-9_-]+)?$/.test(prefix)) throw new Error("Use an isolated next-scriptc:io or next-scriptc:parity namespace");
  let commands = 0;
  async function command(args) {
    commands++;
    const response = await fetch(url, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(args), signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`Redis HTTP ${response.status}`);
    const result = await response.json();
    if (result.error) throw new Error("Redis command error");
    return result.result;
  }
  return { command, prefix, get commands() { return commands; } };
}

export function fixtureOrders(userId) {
  return Array.from({ length: 50 }, (_, i) => ({ id: `seed-${i + 1}`, userId, email: "ada@example.com", createdAt: fixtureClock - i * 3600,
    status: i % 3 === 0 ? "pending" : "paid", items: [
      { sku: "LAMP", quantity: 1 + i % 3, unitPriceCents: 4900 },
      { sku: "CABLE", quantity: 1 + i % 2, unitPriceCents: 1200 },
      { sku: "MUG", quantity: 1, unitPriceCents: 1800 },
    ] }));
}

// No FLUSHDB. Only this benchmark's explicit namespace is reset; seed/cleanup
// commands are counted separately from workload commands.
export async function seed(env = process.env) {
  const db = database(env);
  let cursor = "0";
  const keys = [];
  do {
    const result = await db.command(["SCAN", cursor, "MATCH", `${db.prefix}:*`, "COUNT", 500]);
    cursor = String(result[0]); keys.push(...result[1]);
  } while (cursor !== "0");
  for (let i = 0; i < keys.length; i += 100) await db.command(["DEL", ...keys.slice(i, i + 100)]);
  for (const userId of ["user-42", "user-writer"]) {
    await db.command(["RPUSH", `${db.prefix}:orders:${userId}`, ...fixtureOrders(userId).map(JSON.stringify)]);
  }
  return { commands: db.commands, seededUsers: 2, ordersPerUser: 50, deletedKeys: keys.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.argv.includes("--reset")) throw new Error("Pass --reset to reset only the configured benchmark namespace");
  console.log(JSON.stringify(await seed()));
}
