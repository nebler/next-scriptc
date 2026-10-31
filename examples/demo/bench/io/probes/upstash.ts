import { Redis } from '@upstash/redis';
async function main() {
  const redis = new Redis({ url: process.env.UPSTASH_REDIS_REST_URL ?? 'http://127.0.0.1:8079', token: process.env.UPSTASH_REDIS_REST_TOKEN ?? 'local-redis-only', enableAutoPipelining: false, retry: false });
  console.log(await redis.set('next-scriptc:probe', 'ok'));
  console.log(await redis.get<string>('next-scriptc:probe'));
}
main();
