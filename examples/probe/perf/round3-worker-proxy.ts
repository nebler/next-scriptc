import { Worker } from "node:worker_threads";
import type { Job, Reply } from "./round3-worker-types.ts";
// One retained Markdown worker, one admitted request; excess load gets 503.
// Error/exit invalidates this slot. No unbounded application queue.
const worker = new Worker(new URL("./round3-worker.ts", import.meta.url));
let pending: { resolve: (reply: Reply) => void; reject: (error: Error) => void } | undefined;
let failed: Error | undefined;
worker.on("message", (reply: Reply) => { pending?.resolve(reply); pending = undefined; });
function fail(error: Error) { failed = error; pending?.reject(error); pending = undefined; }
worker.on("error", fail);
worker.on("exit", (code: number) => fail(new Error(`worker exited ${code}`)));
export async function GET(request: Request, context: { params: Promise<Record<string, string | string[]>> }) {
  const params = await context.params;
  const slug = params.slug;
  if (typeof slug !== "string") return new Response(null, { status: 400 });
  if (failed) throw failed;
  if (pending) return new Response(null, { status: 503 });
  const headers: Record<string, string> = {};
  request.headers.forEach((value, name) => { headers[name] = value; });
  const job: Job = { url: request.url, slug, headers };
  const result = await new Promise<Reply>((resolve, reject) => { pending = { resolve, reject }; worker.postMessage(job); });
  return new Response(result.body, { status: result.status, headers: result.headers });
}
