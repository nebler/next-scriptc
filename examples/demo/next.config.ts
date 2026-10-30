import type { NextConfig } from "next";
import { withScriptc } from "next-scriptc";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
};

export default withScriptc(nextConfig);
