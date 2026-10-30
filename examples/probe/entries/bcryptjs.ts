import { GET } from "../routes/bcryptjs/route.ts";
import { printResponse } from "./print.ts";

async function main() { await printResponse("bcryptjs", await GET()); }
main();
