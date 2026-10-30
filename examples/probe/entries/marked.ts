import { GET } from "../routes/marked/route.ts";
import { printResponse } from "./print.ts";

async function main() { await printResponse("marked", await GET()); }
main();
