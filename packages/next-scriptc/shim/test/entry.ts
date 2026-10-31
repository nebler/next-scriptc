import { serve, serveMany, type RouteModule } from "../serve.ts";

const explicit = process.env.SHIM_METHODS === "explicit";
const empty = process.env.SHIM_METHODS === "empty";
const load = async () => {
  if (process.env.SHIM_DELAY_INIT) await import("./delayed.ts");
  const route = await import("./route.ts");
  return {
    GET: empty ? undefined : route.GET,
    HEAD: explicit ? () => new Response("discard", { status: 202, headers: { "x-explicit": "head" } }) : undefined,
    POST: explicit || empty ? undefined : route.POST,
    PUT: explicit || empty ? undefined : route.PUT,
    PATCH: explicit || empty ? undefined : route.PATCH,
    DELETE: undefined,
    OPTIONS: explicit ? () => new Response("explicit options", { status: 200 }) : undefined,
  };
};
const options = { pattern: explicit || empty ? "/api/static" : process.env.SHIM_PATTERN || "/api/[id]/[[...slug]]", port: explicit ? 0 : undefined, interceptionPatterns: process.env.SHIM_INTERCEPTION ? ["^/api/intercepted(?:/|$)"] : [] };
if (process.env.SHIM_GROUPED) {
  serveMany([
    // An unrelated module can stay initializing without blocking this route.
    { pattern: "/pending", module: () => new Promise<RouteModule>(() => {}) },
    { pattern: "/api/static", module: async () => ({ GET: () => new Response("static"), HEAD: undefined, POST: undefined, PUT: undefined, PATCH: undefined, DELETE: undefined, OPTIONS: undefined }) },
    { pattern: options.pattern, module: load },
  ], options);
} else serve(load, options);
