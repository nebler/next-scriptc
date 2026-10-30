import { POST } from "../routes/crypto/route.ts";
import { printResponse } from "./print.ts";

async function main() {
  await printResponse("digest", await POST(new Request("http://probe.test/hash", { method: "POST", body: "invoice-123" }), { params: Promise.resolve({ tenant: "acme" }) }), true);
}

main();
