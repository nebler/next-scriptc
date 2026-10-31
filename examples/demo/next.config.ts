import type { NextConfig } from "next";
import { withScriptc } from "next-scriptc";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  ...(process.env.DEMO_PROXY_TIMEOUT_MS ? {
    experimental: { proxyTimeout: Number(process.env.DEMO_PROXY_TIMEOUT_MS) },
  } : {}),
};

const lightRoutes = [
  "/api/hello", "/api/verify", "/api/url-echo", "/api/items/[id]",
  "/api/stores/nearby", "/api/analytics/revenue", "/api/export.json.gz", "/api/uploads/verify",
];
const grouped = process.env.NEXT_SCRIPTC_DEMO_GROUPS === "light";

export default process.env.NEXT_SCRIPTC_BASELINE === "node"
  ? { ...nextConfig, distDir: ".next-node" }
  : withScriptc({ ...nextConfig, ...(grouped ? { distDir: ".next-grouped" } : {}) }, {
    routes: grouped ? Object.fromEntries(lightRoutes.map((pattern) => [pattern, { group: "light" }])) : {},
  });
