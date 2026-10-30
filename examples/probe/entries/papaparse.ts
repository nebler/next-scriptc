import { GET } from "../routes/papaparse/route.ts";
import { printResponse } from "./print.ts";

async function main() { await printResponse("papaparse", await GET()); }
main();
