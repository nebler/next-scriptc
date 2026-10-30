import { GET } from "../rewrites/next-server.ts";
import { printResponse } from "./print.ts";
import { NextRequest } from "../rewrites/next-shim.ts";

async function main() {
  await printResponse("preview", await GET(new NextRequest("http://probe.test/articles/hello?preview=1", { headers: { cookie: "theme=dark" } }), { params: Promise.resolve({ slug: "hello" }) }));
}

main();
