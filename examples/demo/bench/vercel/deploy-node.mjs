// Preview-only local build. Hosted project settings are never changed.
import { execFileSync } from "node:child_process";
import { readFile, writeFile, mkdir, cp, readdir } from "node:fs/promises";
import path from "node:path";
import { serverEnv } from "../config.mjs";
import { digest } from "../load.mjs";

const root = path.resolve(import.meta.dirname, "../../../..");
const demo = path.join(root, "examples/demo");
const project = JSON.parse(await readFile(path.join(root, ".vercel/project.json")));
if (project.projectName !== "next-scriptc") throw new Error("Link the next-scriptc project at the repository root first");
if (Number(process.versions.node.split(".")[0]) !== 24) throw new Error("Use Node 24 for the Vercel baseline build");
// CLI normalizes preview to an omitted target; the first ever deployment can
// then be implicitly promoted. Refuse an empty project before any upload.
const recent = JSON.parse(execFileSync("vercel", ["api", `/v6/deployments?projectId=${project.projectId}&limit=1`], { cwd: root, encoding: "utf8" }));
if (!recent.deployments?.length) throw new Error("Refusing first-ever deployment: Vercel may implicitly promote it to production");
await mkdir(path.join(demo, ".vercel"), { recursive: true });
await writeFile(path.join(demo, ".vercel/project.json"), JSON.stringify({ ...project, settings: {
  ...project.settings, framework: "nextjs", nodeVersion: "24.x", rootDirectory: null, outputDirectory: ".next-node",
} }, null, 2));
await cp(path.join(root, ".vercel/.env.preview.local"), path.join(demo, ".vercel/.env.preview.local"));
execFileSync("vercel", ["build", "--cwd", demo, "--standalone"], {
  cwd: root, env: { ...process.env, ...serverEnv, NEXT_SCRIPTC_BASELINE: "node", NEXT_SCRIPTC_DEMO_GROUPS: "" }, stdio: "inherit",
});
const required = JSON.parse(await readFile(path.join(demo, ".next-node/required-server-files.json")));
if (required.config.adapterPath || required.config.distDir !== ".next-node") throw new Error("Baseline unexpectedly enabled an adapter or changed distDir");
const output = path.join(demo, ".vercel/output");
const configs = [];
for (const entry of await readdir(path.join(output, "functions"), { recursive: true })) {
  if (!entry.endsWith(".vc-config.json")) continue;
  const file = path.join(output, "functions", entry);
  const config = JSON.parse(await readFile(file));
  if (config.runtime !== "nodejs24.x") throw new Error(`Unexpected function runtime: ${config.runtime}`);
  // The local Mac builder chooses arm64. These JS-only functions have no native
  // addons; pin x86_64 to match the later scriptc Linux executable deployment.
  config.architecture = "x86_64";
  await writeFile(file, JSON.stringify(config, null, 2));
  configs.push({ path: entry, runtime: config.runtime, architecture: config.architecture });
}
if ((await readdir(path.join(output, "functions"), { recursive: true })).some((file) => file.endsWith(".node"))) {
  throw new Error("Native Node addon found: cross-architecture prebuilt deployment needs a Linux build");
}
const configFile = path.join(output, "config.json");
const config = JSON.parse(await readFile(configFile));
config.regions = ["iad1"];
await writeFile(configFile, JSON.stringify(config, null, 2));
const args = ["deploy", "--cwd", demo, "--prebuilt", "--regions", "iad1", "--environment", "preview", "--force", "--json"];
for (const [key, value] of Object.entries({ ...serverEnv, NEXT_SCRIPTC_BASELINE: "node" })) args.push("--env", `${key}=${value}`);
const response = JSON.parse(execFileSync("vercel", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }));
const deployed = response.deployment ?? response;
if (deployed.target === "production") throw new Error(`Unexpected production target: ${deployed.id}; do not benchmark`);
await writeFile(path.join(root, ".vercel/node-deployment.json"), JSON.stringify({
  variant: "node", deployed, sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  builtAt: new Date().toISOString(), node: process.version, next: "16.4.3", adapterPath: null,
  buildConfigSha256: digest(await readFile(configFile)), functions: configs,
}, null, 2) + "\n");
console.log("Preview deployment metadata saved to .vercel/node-deployment.json");
console.log(JSON.stringify({ url: deployed.url, id: deployed.id, target: deployed.target }));
