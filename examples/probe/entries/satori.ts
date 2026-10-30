import { GET } from "../routes/satori/route.ts";
import { printResponse } from "./print.ts";

async function main() { await printResponse("satori", await GET()); }
main();
