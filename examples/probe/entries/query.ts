import { GET } from "../routes/query/route.ts";
import { printResponse } from "./print.ts";

async function main() {
  await printResponse("filtered", await GET(new Request("http://probe.test/products?q=desk&limit=1"), { params: Promise.resolve({ shop: "berlin" }) }));
  await printResponse("invalid", await GET(new Request("http://probe.test/products?limit=0"), { params: Promise.resolve({ shop: "berlin" }) }));
}

main();
