import { GET } from "../routes/fetch/route.ts";
import { printResponse } from "./print.ts";

async function main() {
  await printResponse("stock", await GET(new Request("http://probe.test/stock", { headers: { "x-upstream-origin": process.env.PROBE_UPSTREAM! } }), { params: Promise.resolve({ sku: "LAMP" }) }));
  await printResponse("missing", await GET(new Request("http://probe.test/stock"), { params: Promise.resolve({ sku: "LAMP" }) }));
}

main();
