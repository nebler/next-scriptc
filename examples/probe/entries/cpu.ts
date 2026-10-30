import { GET } from "../routes/cpu/route.ts";
import { printResponse } from "./print.ts";

async function main() {
  await printResponse("report", await GET(new Request("http://probe.test/report?min=75"), { params: Promise.resolve({ account: "acme" }) }));
  await printResponse("invalid", await GET(new Request("http://probe.test/report?min=nope"), { params: Promise.resolve({ account: "acme" }) }));
}

main();
