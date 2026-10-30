import * as route from "./route.ts";
import { serve } from "../serve.ts";

const explicit = process.env.SHIM_METHODS === "explicit";
const empty = process.env.SHIM_METHODS === "empty";
serve({
  GET: empty ? undefined : route.GET,
  HEAD: explicit ? () => new Response("discard", { status: 202, headers: { "x-explicit": "head" } }) : undefined,
  POST: explicit || empty ? undefined : route.POST,
  PUT: explicit || empty ? undefined : route.PUT,
  PATCH: explicit || empty ? undefined : route.PATCH,
  DELETE: undefined,
  OPTIONS: explicit ? () => new Response("explicit options", { status: 200 }) : undefined,
}, { pattern: explicit || empty ? "/api/static" : process.env.SHIM_PATTERN || "/api/[id]/[[...slug]]", port: explicit ? 0 : undefined });
