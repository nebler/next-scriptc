// Explicit production configurations. Clear inherited switches on every launch.
export const variants = [
  { id: "node", distDir: ".next-node", env: { NEXT_SCRIPTC_BASELINE: "node", NEXT_SCRIPTC_DEMO_GROUPS: "" } },
  { id: "native", distDir: ".next", env: { NEXT_SCRIPTC_BASELINE: "", NEXT_SCRIPTC_DEMO_GROUPS: "" } },
  { id: "native-grouped", distDir: ".next-grouped", env: { NEXT_SCRIPTC_BASELINE: "", NEXT_SCRIPTC_DEMO_GROUPS: "light" } },
];
export const lightPatterns = ["/api/hello", "/api/verify", "/api/url-echo", "/api/items/[id]",
  "/api/stores/nearby", "/api/analytics/revenue", "/api/export.json.gz", "/api/uploads/verify"];
export function variant(id) {
  const selected = variants.find((item) => item.id === id);
  if (!selected) throw new Error(`Unknown benchmark variant: ${id}`);
  return selected;
}
export function runtimesFor(scope, available, reverse = false) {
  const ids = scope === "direct" ? ["node", "native"] : available;
  return reverse ? [...ids].reverse() : [...ids];
}
export async function groupedAvailability({ exists, profile }) {
  if (exists) return { status: "available" };
  if (profile !== "quick") throw new Error("Final sandbox suite requires .next-grouped; build with NEXT_SCRIPTC_DEMO_GROUPS=light first");
  return { status: "skipped", reason: ".next-grouped does not exist; local quick verification covers Node vs native only" };
}
export function validateReleaseBuild(manifest, grouped = false) {
  if ([...manifest.routes, ...(manifest.processes ?? [])].some((item) => (item.optimization ?? "release") !== "release"))
    throw new Error("Final benchmark requires release optimization for every native process and route");
  const separate = grouped ? manifest.routes.filter((route) => !lightPatterns.includes(route.pattern)) : manifest.routes;
  if (new Set(separate.map((route) => route.binary)).size !== separate.length || new Set(separate.map((route) => route.port)).size !== separate.length)
    throw new Error("Final benchmark requires separate processes for every route outside the registered light group");
}
export function validateLightGroup(manifest) {
  validateReleaseBuild(manifest, true);
  const members = lightPatterns.map((pattern) => {
    const route = manifest.routes.find((item) => item.pattern === pattern);
    if (!route) throw new Error(`Grouped build missing ${pattern}`);
    if (typeof route.binary !== "string" || !Number.isInteger(route.port)) throw new Error(`Invalid grouped process for ${pattern}`);
    return route;
  });
  if (new Set(members.map((route) => route.binary)).size !== 1 || new Set(members.map((route) => route.port)).size !== 1)
    throw new Error(".next-grouped is not the registered eight-route light process group");
  if (manifest.routes.some((route) => !lightPatterns.includes(route.pattern) && (route.binary === members[0].binary || route.port === members[0].port)))
    throw new Error(".next-grouped includes an unregistered route in the light group");
}
