import { parentPort } from "node:worker_threads";
import { GET } from "../../demo/app/api/posts/[slug]/route.ts";
import type { Job, Reply } from "./round3-worker-types.ts";
parentPort!.on("message", async (job: Job) => {
  const response = await GET(new Request(job.url, { headers: job.headers }), { params: Promise.resolve({ slug: job.slug }) });
  const headers: Record<string, string> = {};
  response.headers.forEach((value, name) => { headers[name] = value; });
  const reply: Reply = { status: response.status, headers, body: await response.text() };
  parentPort!.postMessage(reply);
});
