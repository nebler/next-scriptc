import { parentPort, workerData } from "node:worker_threads";
import { publish } from "@scriptc/threads";
import { monthCount, scenarioCount, totalsLength, projectionIndex, type Order, type Partition } from "./orders.ts";

const orders = publish(workerData as Order[]);

parentPort!.on("message", ({ start, end }: Partition) => {
  const totals = new Array<number>(totalsLength).fill(0);
  for (let i = start; i < end; i++) {
    const order = orders[i];
    const revenue = order.amountCents * order.quantity;
    totals[order.region] += revenue;
    // Five-year monthly revenue projections over twelve pricing scenarios.
    // Round each invoice in cents before summing, as in a financial report.
    for (let scenario = 0; scenario < scenarioCount; scenario++) {
      let projected = 0;
      for (let month = 0; month < monthCount; month++) {
        const basisPoints = 8500 + scenario * 100 + (order.customer * 17 + month * 97) % 2001;
        projected += Math.floor(revenue * basisPoints / 10_000);
      }
      totals[projectionIndex(scenario, order.region)] += projected;
    }
  }
  parentPort!.postMessage(totals);
});
// Readiness includes receiving and publishing the graph; exclude setup from jobs.
parentPort!.postMessage("ready");
