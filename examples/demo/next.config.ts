import type { NextConfig } from "next";
import { withScriptc } from "next-scriptc";

const publicDemo = process.env.NODE_ENV === "production" && process.env.NEXT_SCRIPTC_PUBLIC_DEMO === "1";
const nextConfig: NextConfig = {
  ...(process.env.NEXT_SCRIPTC_CLOUDFLARE === "1" ? { experimental: { cpus: 2 } } : {}),
  // Inline the opt-in into Next's output; runtime env changes cannot open the proxy.
  env: { NEXT_SCRIPTC_PUBLIC_DEMO: publicDemo ? "1" : "0" },
  // Timing previews need response headers from the complete dynamic render.
  cacheComponents: process.env.NATIVE_VERCEL_TIMING !== "1",
  partialPrefetching: process.env.NATIVE_VERCEL_TIMING !== "1",
  async rewrites() {
    return [
      ...(process.env.HEAVY_GO_ORIGIN ? [{ source: "/api/heavy-go/:path*", destination: `${process.env.HEAVY_GO_ORIGIN}/api/heavy/:path*` }] : []),
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
const heavyRoutes = ["csv", "json", "thumbnail", "bcrypt", "vectors", "vectors-imul", "diagnostics"].map((name) => `/api/heavy/${name}`);
const vercelRoutes = [...lightRoutes, ...heavyRoutes, "/api/diagnostics/memory",
  "/api/app/orders", "/api/app/webhooks/payment", "/api/app/diagnostics/redis", "/api/app/diagnostics/process",
  "/api/feed.xml", "/api/images/histogram", "/api/login", "/api/login-scrypt",
  "/api/posts/[slug]", "/api/primes", "/api/report", "/api/search", "/api/static-fixture",
];

export default process.env.NEXT_SCRIPTC_BASELINE === "node"
  ? { ...nextConfig, pageExtensions: ["tsx", "ts", "jsx", "js", "native.ts"], distDir: process.env.NEXT_SCRIPTC_VERCEL ? ".next" : ".next-node" }
  : withScriptc({ ...nextConfig, ...(grouped && !process.env.NEXT_SCRIPTC_VERCEL ? { distDir: ".next-grouped" } : {}) }, {
    ...(process.env.NEXT_SCRIPTC_CLOUDFLARE === "1" ? { target: "cloudflare" as const, cloudflare: { entry: "cloudflare/revenue.ts" } } : {}),
    routes: vercelGrouped
      ? Object.fromEntries(vercelRoutes.map((pattern) => [pattern, { group: "vercel" }]))
      : grouped ? Object.fromEntries(lightRoutes.map((pattern) => [pattern, { group: "light" }])) : {},
  });
