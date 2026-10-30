import { GET } from "../routes/headers/route.ts";
import { printResponse } from "./print.ts";

async function main() {
  await printResponse("cookies", await GET(new Request("http://probe.test/preferences", { headers: { cookie: "session=abc; theme=dark", "accept-language": "de-DE" } }), { params: Promise.resolve({ tenant: "acme" }) }));
  await printResponse("defaults", await GET(new Request("http://probe.test/preferences"), { params: Promise.resolve({ tenant: "acme" }) }));
}

main();
