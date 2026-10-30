import { POST } from "../routes/zod/route.ts";
import { printResponse } from "./print.ts";

async function main() {
  await printResponse("created", await POST(new Request("http://probe.test/orders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "ada@example.com", quantity: 2, sku: "LAMP" }) }), { params: Promise.resolve({ shop: "berlin" }) }));
  await printResponse("invalid", await POST(new Request("http://probe.test/orders", { method: "POST", body: JSON.stringify({ email: "bad", quantity: 0, sku: "x" }) }), { params: Promise.resolve({ shop: "berlin" }) }));
  await printResponse("malformed", await POST(new Request("http://probe.test/orders", { method: "POST", body: "{" }), { params: Promise.resolve({ shop: "berlin" }) }));
}

main();
