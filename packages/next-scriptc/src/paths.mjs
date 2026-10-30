import { fileURLToPath } from "node:url";

export const adapterPath = fileURLToPath(new URL("./adapter.mjs", import.meta.url));
export const shimPath = fileURLToPath(new URL("../shim/serve.ts", import.meta.url));
