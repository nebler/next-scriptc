import { compareSync } from "bcryptjs";

const stored = "$2b$10$N9qo8uLOickgx2ZMRZoMyehtJ/whDdsI.d1w/JqKiOrDw8pCT0JLG";
const password = "correct horse battery staple";
console.log(compareSync(password, stored));
const count = Number(process.env.REPRO_COUNT ?? "3");
const start = performance.now();
let verified = 0;
for (let i = 0; i < count; i++) verified += Number(compareSync(password, stored));
console.log(JSON.stringify({ count, ms: performance.now() - start, verified }));
