// Node's best-practice shared-memory implementation of the report microbenchmark.
// Same integer arithmetic, partitioning and totals as app/api/report/worker.ts.
// Kept outside Next: all three variants are timed inside their worker dispatch /
// reduction, excluding HTTP, dataset construction and pool initialization.
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
// Dimensions come from orders.ts in the unmeasured controller. Importing that
// TypeScript file here would load Node's type stripper into every worker and
// inflate the best-practice Node baseline for no computational reason.
const parameters = isMainThread ? JSON.parse(process.argv[2]) : workerData;
const { regionCount, scenarioCount, monthCount, totalsLength } = parameters.dimensions;
const projectionIndex = (scenario, region) => regionCount + scenario * regionCount + region;

if (!isMainThread) {
  const { customer, region, amountCents, quantity } = workerData.data;
  parentPort.on("message", ({ start, end }) => {
    const totals = new Array(totalsLength).fill(0);
    for (let i = start; i < end; i++) {
      const revenue = amountCents[i] * quantity[i];
      const regionId = region[i], customerId = customer[i];
      totals[regionId] += revenue;
      for (let scenario = 0; scenario < scenarioCount; scenario++) {
        let projected = 0;
        for (let month = 0; month < monthCount; month++) {
          const basisPoints = 8500 + scenario * 100 + (customerId * 17 + month * 97) % 2001;
          projected += Math.floor(revenue * basisPoints / 10_000);
        }
        totals[projectionIndex(scenario, regionId)] += projected;
      }
    }
    parentPort.postMessage(totals);
  });
  parentPort.postMessage("ready");
} else {
  const { counts, repeats } = parameters;
  const rowCount = 1_000_000;
  const array = () => new Int32Array(new SharedArrayBuffer(rowCount * 4));
  const data = { customer: array(), region: array(), amountCents: array(), quantity: array() };
  for (let i = 0; i < rowCount; i++) {
    data.customer[i] = (i * 48271) % 100_003;
    data.region[i] = i % regionCount;
    data.amountCents[i] = 100 + (i * 7919) % 49_900;
    data.quantity[i] = 1 + i % 5;
  }
  const workers = [];
  try {
    const samples = [];
    for (const threads of counts) {
      while (workers.length < threads) {
        const worker = new Worker(new URL(import.meta.url), { workerData: { data, dimensions: parameters.dimensions } });
        workers.push(worker);
        await new Promise((resolve, reject) => { worker.once("message", resolve); worker.once("error", reject); });
      }
      // Match the object route readiness job, then two warmups at each count.
      for (let iteration = threads === 1 ? -3 : -2; iteration < repeats; iteration++) {
        const start = performance.now();
        const parts = await Promise.all(workers.map((worker, i) => new Promise((resolve, reject) => {
          const fail = (error) => { worker.off("message", finish); reject(error); };
          const finish = (result) => { worker.off("error", fail); resolve(result); };
          worker.once("message", finish);
          worker.once("error", fail);
          worker.postMessage({ start: Math.floor(i * rowCount / threads), end: Math.floor((i + 1) * rowCount / threads) });
        })));
        const totals = new Array(totalsLength).fill(0);
        for (const part of parts) for (let i = 0; i < totals.length; i++) totals[i] += part[i];
        const projectedRevenueCents = [];
        for (let scenario = 0; scenario < scenarioCount; scenario++) {
          const first = projectionIndex(scenario, 0);
          projectedRevenueCents.push(totals.slice(first, first + regionCount));
        }
        const elapsedMs = performance.now() - start;
        const rss = process.memoryUsage().rss;
        if (iteration >= 0) samples.push({ elapsedMs, rss,
          threads, repeat: iteration, workers: threads,
          result: { orders: rowCount, revenueCents: totals.slice(0, regionCount), projectedRevenueCents } });
      }
    }
    process.stdout.write(JSON.stringify(samples));
  } finally { await Promise.all(workers.map((worker) => worker.terminate())); }
}
