import { GET } from "../routes/jose/route.ts";
import { printResponse } from "./print.ts";

async function main() { await printResponse("jose", await GET()); }
main();
