// Production packaging for the existing linked next-scriptc project. All
// settings below are LOCAL build/output settings, never hosted project edits.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cp, mkdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

const root = path.resolve(import.meta.dirname, "../../../..");
const demo = path.join(root, "examples/demo");
assert.equal(Number(process.versions.node.split(".")[0]), 24, "Use Node 24");
const project = JSON.parse(await readFile(path.join(root, ".vercel/project.json")));
assert.equal(project.projectName, "next-scriptc");
assert.equal(project.projectId, "prj_loKFn5UhqXo1q4KesfMY8SZjQzEu");
await mkdir(path.join(demo, ".vercel"), { recursive: true });
await writeFile(path.join(demo, ".vercel/project.json"), JSON.stringify({ ...project, settings: {
  ...project.settings, framework: "nextjs", nodeVersion: "24.x", rootDirectory: null,
  outputDirectory: ".next", buildCommand: null, installCommand: null,
} }));
await cp(path.join(root, ".vercel/.env.production.local"), path.join(demo, ".vercel/.env.production.local"));
await rm(path.join(root, ".vercel/output"), { recursive: true, force: true });
execFileSync("pnpm", ["exec", "next-scriptc", "vercel-build", "--prod"], {
  cwd: demo, stdio: "inherit", env: {
    ...process.env, NEXT_SCRIPTC_PUBLIC_DEMO: "1", NEXT_SCRIPTC_DEMO_GROUPS: "vercel",
    NEXT_SCRIPTC_BASELINE: "", VECTOR_VERCEL_TIMING: "", HEAVY_GO_ORIGIN: "",
    SCRIPTC_COMPILER: path.join(import.meta.dirname, "public-compiler.mjs"),
  },
});
const audit = JSON.parse(await readFile(path.join(demo, ".vercel/scriptc-build/public-dispatch.json")));
const output = path.join(demo, ".vercel/output");
const native = await realpath(path.join(output, "functions/api/heavy/vectors.func"));
assert.equal(createHash("sha256").update(await readFile(path.join(native, "executable"))).digest("hex"), audit.sha256);
const configFile = path.join(native, ".vc-config.json");
const config = JSON.parse(await readFile(configFile));
config.environment = { ...config.environment, NEXT_SCRIPTC_PUBLIC_DEMO: "1", VECTOR_DISPATCH_ADDRESS: String(audit.address) };
await writeFile(configFile, JSON.stringify(config, null, 2) + "\n");
// Next's filePathMap entries are relative to the monorepo, so upload from root.
await rename(output, path.join(root, ".vercel/output"));
await writeFile(path.join(root, ".vercel/public-dispatch.json"), JSON.stringify(audit) + "\n");
console.log("Public production output ready at .vercel/output (not deployed).");
