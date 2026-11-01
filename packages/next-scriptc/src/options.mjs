// Next preserves rewrites by reference while normalizing config; symbol metadata
// carries build-only options without unsupported config keys or public env vars.
export const optionsKey = Symbol.for("next-scriptc.options");
export const optimizationModes = ["release", "speed", "dev"];

function object(value, label) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error(`[next-scriptc] ${label} must be a plain object.`);
  }
}

export function validateOptions(options) {
  object(options, "Options");
  for (const key of Object.keys(options)) {
    if (key !== "routes" && key !== "nativePromotion") throw new Error(`[next-scriptc] Unsupported option ${JSON.stringify(key)}.`);
  }
  if (options.nativePromotion !== undefined && !["auto", "off"].includes(options.nativePromotion)) throw new Error("[next-scriptc] nativePromotion must be auto or off.");
  const routes = options.routes === undefined ? {} : options.routes;
  object(routes, "Options.routes");
  const result = {};
  for (const [pattern, value] of Object.entries(routes)) {
    object(value, `Options for ${pattern}`);
    for (const key of Object.keys(value)) {
      if (key !== "group" && key !== "optimization") throw new Error(`[next-scriptc] Unsupported option ${JSON.stringify(key)} for ${pattern}.`);
    }
    if ("group" in value && (typeof value.group !== "string" || !value.group.trim() || value.group !== value.group.trim())) {
      throw new Error(`[next-scriptc] group for ${pattern} must be a nonempty string without surrounding whitespace.`);
    }
    if ("optimization" in value && !optimizationModes.includes(value.optimization)) {
      throw new Error(`[next-scriptc] optimization for ${pattern} must be release, speed, or dev.`);
    }
    Object.defineProperty(result, pattern, { value: { ...value, optimization: value.optimization ?? "release" }, enumerable: true });
  }
  return { routes: result, ...(options.nativePromotion === undefined ? {} : { nativePromotion: options.nativePromotion }) };
}

export function planRoutes(discovered, options = {}) {
  const settings = validateOptions(options).routes;
  const patterns = new Set(discovered.map((route) => route.pattern));
  for (const pattern of Object.keys(settings)) {
    if (!patterns.has(pattern)) throw new Error(`[next-scriptc] Unknown native route ${JSON.stringify(pattern)}. Use a normalized discovered Next route pattern from route.native.ts.`);
  }
  const groups = new Map();
  return discovered.map((route) => {
    const { group, optimization = "release" } = settings[route.pattern] ?? {};
    let process = group === undefined ? undefined : groups.get(group);
    if (process && process.optimization !== optimization) {
      throw new Error(`[next-scriptc] Group ${JSON.stringify(group)} has conflicting optimization: ${process.pattern} uses ${process.optimization}, ${route.pattern} uses ${optimization}. Omitted optimization defaults to release.`);
    }
    if (!process) {
      process = { pattern: route.pattern, id: route.binary, binary: route.binary, port: route.port, optimization };
      if (group !== undefined) groups.set(group, process);
    }
    return { ...route, ...(group === undefined ? {} : { group }), process: process.id, binary: process.binary, port: process.port, optimization };
  });
}

export function planProcesses(routes) {
  const processes = new Map();
  for (const route of routes) {
    if (!processes.has(route.process)) {
      processes.set(route.process, { id: route.process, binary: route.binary, port: route.port, optimization: route.optimization, ...(route.group === undefined ? {} : { group: route.group }), routes: [] });
    }
    processes.get(route.process).routes.push(route.pattern);
  }
  return [...processes.values()];
}
