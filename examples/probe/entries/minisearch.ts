import { GET } from "../routes/minisearch/route.ts";
import { printResponse } from "./print.ts";

async function main() { await printResponse("minisearch", await GET()); }
main();
