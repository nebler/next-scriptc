import type { NextConfig } from "next";
import { withScriptc } from "next-scriptc";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  async rewrites() {
    return [
      { source: "/rewrite/hello", destination: "/api/hello" },
      { source: "/rewrite/items/:id", destination: "/api/items/:id" },
    ];
  },
  ...(process.env.DEMO_PROXY_TIMEOUT_MS ? {
    experimental: { proxyTimeout: Number(process.env.DEMO_PROXY_TIMEOUT_MS) },
  } : {}),
};

const lightRoutes = [
  "/api/hello", "/api/verify", "/api/url-echo", "/api/items/[id]",
  "/api/stores/nearby", "/api/analytics/revenue", "/api/export.json.gz", "/api/uploads/verify",
];
const grouped = process.env.NEXT_SCRIPTC_DEMO_GROUPS === "light";
// Vercel bundles the Node baseline's App Routes into one Function. Explicitly
// share native routes too: one cold start and no isolation between members.
const vercelGrouped = process.env.NEXT_SCRIPTC_DEMO_GROUPS === "vercel";
const vercelRoutes = [...lightRoutes, "/api/diagnostics/memory",
  "/api/feed.xml", "/api/images/histogram", "/api/login", "/api/login-scrypt",
  "/api/posts/[slug]", "/api/primes", "/api/report", "/api/search", "/api/static-fixture",
];

export default process.env.NEXT_SCRIPTC_BASELINE === "node"
  ? { ...nextConfig, pageExtensions: ["tsx", "ts", "jsx", "js", "native.ts"], distDir: process.env.NEXT_SCRIPTC_VERCEL ? ".next" : ".next-node" }
  : withScriptc({ ...nextConfig, ...(grouped && !process.env.NEXT_SCRIPTC_VERCEL ? { distDir: ".next-grouped" } : {}) }, {
    routes: vercelGrouped
      ? Object.fromEntries(vercelRoutes.map((pattern) => [pattern, { group: "vercel" }]))
      : grouped ? Object.fromEntries(lightRoutes.map((pattern) => [pattern, { group: "light" }])) : {},
  });
