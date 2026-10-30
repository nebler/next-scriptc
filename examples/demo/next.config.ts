import type { NextConfig } from "next";
import { withScriptc } from "next-scriptc";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
};

export default process.env.NEXT_SCRIPTC_BASELINE === "node"
  ? { ...nextConfig, distDir: ".next-node" }
  : withScriptc(nextConfig);
