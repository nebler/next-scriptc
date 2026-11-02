import { fileURLToPath } from "node:url";
export {compilerPath} from "scriptc-promote/paths";

export const adapterPath = fileURLToPath(new URL("./adapter.mjs", import.meta.url));
