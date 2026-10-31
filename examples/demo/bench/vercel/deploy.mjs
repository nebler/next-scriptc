// Preview-only helper for either variant; never changes hosted project settings.
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildDemo, root } from "./build.mjs";
import { serverEnv } from "../config.mjs";
import { digest } from "../load.mjs";

const project = JSON.parse(await readFile(path.join(root, ".vercel/project.json")));
if (project.projectName !== "next-scriptc") throw new Error("Link the next-scriptc project first");
const recent = JSON.parse(execFileSync("vercel", ["api", `/v6/deployments?projectId=${project.projectId}&limit=1`], { cwd: root, encoding: "utf8" }));
if (!recent.deployments?.length) throw new Error("Refusing first-ever deployment: Vercel may implicitly promote it to production");
const metadata = await buildDemo();
if (process.env.HEAVY_GO_BENCH === "1") {
  const { addHeavyGo } = await import("./heavy-go.mjs");
  metadata.heavyGo = await addHeavyGo();
}
const args = ["deploy", "--prebuilt", "--regions", "iad1", "--environment", "preview", "--force", "--json"];
for (const [key, value] of Object.entries({ ...serverEnv, NEXT_SCRIPTC_BASELINE: metadata.variant === "node" ? "node" : "" })) args.push("--env", `${key}=${value}`);
const response = JSON.parse(execFileSync("vercel", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }));
const deployed = response.deployment ?? response;
const url = new URL(deployed.url.startsWith("https://") ? deployed.url : `https://${deployed.url}`).origin;
// Preserve accepted identity even if control-plane inspection fails next.
await writeFile(path.join(root, `.vercel/${metadata.variant}-accepted.json`), JSON.stringify({
  sourceCommit: metadata.sourceCommit, id: deployed.id, url, acceptedAt: new Date().toISOString(),
}, null, 2) + "\n");
const info = JSON.parse(execFileSync("vercel", ["inspect", url, "--json"], { cwd: root, encoding: "utf8" }));
if (info.target === "production" || info.readyState !== "READY") throw new Error(`Expected READY preview: ${info.id}, ${info.target}, ${info.readyState}`);
await writeFile(path.join(root, `.vercel/${metadata.variant}-deployment.json`), JSON.stringify({
  ...metadata, deployed: info,
  buildConfigSha256: digest(await readFile(path.join(root, ".vercel/output/config.json"))),
}, null, 2) + "\n");
console.log(JSON.stringify({ url, id: info.id, target: info.target, status: info.readyState }));
