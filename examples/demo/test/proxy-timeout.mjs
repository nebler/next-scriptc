// Test-only config override: loaded hosts can take >30s for native cost-10 bcrypt.
// Keep production defaults intact while matching the parity client's 180s budget.
import adapter from "../../../packages/next-scriptc/src/adapter.mjs";

const modifyConfig = adapter.modifyConfig;
adapter.modifyConfig = function (config, context) {
  if (context.phase === "phase-production-server") {
    config = { ...config, experimental: { ...config.experimental, proxyTimeout: 180_000 } };
  }
  return modifyConfig.call(this, config, context);
};
