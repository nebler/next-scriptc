import { GET } from "../routes/stream/route.ts";
import { printResponse } from "./print.ts";

async function main() {
  await printResponse("ndjson", await GET(new Request("http://probe.test/export"), { params: Promise.resolve({ job: "job-42" }) }));
  await printResponse("invalid", await GET(new Request("http://probe.test/export?format=csv"), { params: Promise.resolve({ job: "job-42" }) }));
}

main();
