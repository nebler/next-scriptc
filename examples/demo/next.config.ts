import type { NextConfig } from "next";
import { withScriptc } from "next-scriptc";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  ...(process.env.DEMO_PROXY_TIMEOUT_MS ? {
    experimental: { proxyTimeout: Number(process.env.DEMO_PROXY_TIMEOUT_MS) },
  } : {}),
};

export default process.env.NEXT_SCRIPTC_BASELINE === "node"
  ? { ...nextConfig, distDir: ".next-node" }
  : withScriptc(nextConfig);
