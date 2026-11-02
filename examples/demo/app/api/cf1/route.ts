import { dispatchCloudflare, cloudflareStatus } from 'next-scriptc/cloudflare';
import { run } from '../../../cloudflare/revenue';
export async function POST(request: Request) {
  const input = await request.text();
  const args = JSON.parse(input);
  if (!Array.isArray(args) || args.length !== 3 || !args.every(value => typeof value === 'string')) return new Response('Expected three strings', { status: 400 });
  const lane = new URL(request.url).searchParams.get('lane') ?? 'js';
  return new Response(dispatchCloudflare(input, run, lane), { headers: { 'content-type': 'application/json' } });
}
export async function GET() {
  const date = Date.now(), perf = performance.now();
  let sum = 0;
  for (let i = 0; i < 20_000_000; i++) sum = (sum + Math.imul(i, i)) | 0;
  return Response.json({ dateDelta: Date.now() - date, performanceDelta: performance.now() - perf, sum, wasm: cloudflareStatus() });
}
