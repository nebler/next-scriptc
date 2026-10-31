import { Worker } from "node:worker_threads";
import { publish, sharesPublishedGraphs } from "@scriptc/threads";
import { Order, regionCount, scenarioCount, totalsLength, projectionIndex, type Partition, type ReportMessage } from "./orders.ts";

const poolSize = 8;
const rowCount = 1_000_000;
let orders: Order[] | undefined;

class ReportWorker {
  worker: Worker;
  ready: Promise<void>;
  failure: Error | undefined;
  pending: { resolve: (value: number[]) => void; reject: (error: Error) => void } | undefined;

  constructor(data: Order[]) {
    this.worker = new Worker(new URL("./worker.ts", import.meta.url), { workerData: data });
    this.ready = new Promise<void>((resolve, reject) => {
      this.worker.on("message", (message: ReportMessage) => {
        if (typeof message === "string") resolve();
        else {
          this.pending!.resolve(message);
          this.pending = undefined;
        }
      });
      const fail = (error: Error) => {
        if (this.failure) return;
        this.failure = error;
        const index = pool.indexOf(this);
        if (index !== -1) pool.splice(index, 1);
        reject(error);
        this.pending?.reject(error);
        this.pending = undefined;
      };
      this.worker.on("error", fail);
      this.worker.on("exit", (code: number) => {
        fail(new Error(`Report worker exited (${code})`));
      });
    });
  }

  run(partition: Partition): Promise<number[]> {
    return new Promise((resolve, reject) => {
      if (this.failure) { reject(this.failure); return; }
      this.pending = { resolve, reject };
      this.worker.postMessage(partition);
    });
  }
}

// Grow once to the requested concurrency, retaining each worker and its graph.
// This also lets RSS measurements show the cost of each additional Node clone.
const pool: ReportWorker[] = [];
let queue = Promise.resolve();

async function report(threads: number) {
  if (!orders) {
    orders = [];
    for (let i = 0; i < rowCount; i++) orders.push(new Order(i));
    publish(orders);
  }
  while (pool.length < threads) pool.push(new ReportWorker(orders));
  await Promise.all(pool.map((slot) => slot.ready));
  const start = performance.now();
  const jobs: Promise<number[]>[] = [];
  for (let i = 0; i < threads; i++) {
    jobs.push(pool[i].run({ start: Math.floor(i * rowCount / threads), end: Math.floor((i + 1) * rowCount / threads) }));
  }
  let parts: number[][];
  try {
    parts = await Promise.all(jobs);
  } catch (error) {
    // Drain surviving jobs before the next queued request can reuse their slots.
    await Promise.all(jobs.map((job) => job.catch(() => [])));
    throw error;
  }
  const totals = new Array<number>(totalsLength).fill(0);
  for (const part of parts) {
    for (let i = 0; i < totals.length; i++) totals[i] += part[i];
  }
  const projectedRevenueCents: number[][] = [];
  for (let scenario = 0; scenario < scenarioCount; scenario++) {
    const first = projectionIndex(scenario, 0);
    projectedRevenueCents.push(totals.slice(first, first + regionCount));
  }
  const elapsedMs = performance.now() - start;
  const rss = process.memoryUsage().rss;
  return {
    result: { orders: rowCount, revenueCents: totals.slice(0, regionCount), projectedRevenueCents },
    threads,
    poolSize,
    workers: pool.length,
    elapsedMs,
    sharedByReference: sharesPublishedGraphs,
    nodeVersion: sharesPublishedGraphs ? null : process.version,
    rss,
  };
}

export async function GET(request: Request) {
  const threads = Number(new URL(request.url).searchParams.get("threads") ?? "1");
  if (!Number.isInteger(threads) || threads < 1 || threads > poolSize) {
    return Response.json({ error: `threads must be an integer from 1 to ${poolSize}` }, { status: 400 });
  }
  // One report owns the pool at a time. Queueing and initialization are untimed.
  const job = queue.then(() => report(threads));
  queue = job.then(() => {}, () => {});
  return Response.json(await job);
}
