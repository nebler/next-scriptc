// Both benchmark variants use the same local Vercel/Next pipeline. No hosted
// project settings are changed. Run from the repository root with Node 24.
import { execFileSync } from "node:child_process";
import { cp, mkdir, readFile, readdir, realpath, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { serverEnv } from "../config.mjs";

export const root = path.resolve(import.meta.dirname, "../../../..");
export const demo = path.join(root, "examples/demo");

export async function buildDemo() {
  if (Number(process.versions.node.split(".")[0]) !== 24) throw new Error("Use Node 24 for Vercel builds");
  const project = JSON.parse(await readFile(path.join(root, ".vercel/project.json")));
  if (project.projectName !== "next-scriptc") throw new Error("Link the next-scriptc project at the repository root first");
  await mkdir(path.join(demo, ".vercel"), { recursive: true });
  await writeFile(path.join(demo, ".vercel/project.json"), JSON.stringify({ ...project, settings: {
    ...project.settings, framework: "nextjs", nodeVersion: "24.x", rootDirectory: null,
    outputDirectory: ".next", buildCommand: null, installCommand: null,
  } }, null, 2));
  await cp(path.join(root, ".vercel/.env.preview.local"), path.join(demo, ".vercel/.env.preview.local"));
  // A failed build must not leave the previous variant deployable at the root.
  await rm(path.join(root, ".vercel/output"), { recursive: true, force: true });
  const started = performance.now();
  execFileSync(process.execPath, [path.join(root, "packages/next-scriptc/src/cli.mjs"), "vercel-build"], {
    cwd: demo, env: { ...process.env, ...serverEnv }, stdio: "inherit",
  });
  const output = path.join(demo, ".vercel/output");
  const functionsDir = path.join(output, "functions");
  const topology = new Map();
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.name.endsWith(".func")) {
        const owner = await realpath(file);
        if (!topology.has(owner)) topology.set(owner, []);
        topology.get(owner).push(path.relative(functionsDir, file));
      } else if (entry.isDirectory()) await visit(file);
    }
  }
  await visit(functionsDir);
  const functions = [];
  for (const [owner, paths] of topology) {
    const file = path.join(owner, ".vc-config.json");
    const config = JSON.parse(await readFile(file));
    if (!["nodejs24.x", "executable"].includes(config.runtime)) throw new Error(`Unexpected runtime: ${config.runtime}`);
    // JS-only Node bundles built on macOS can run on x86_64; refuse addons.
    const files = await readdir(owner, { recursive: true });
    if (files.some((name) => name.endsWith(".node")) || Object.keys(config.filePathMap ?? {}).some((name) => name.endsWith(".node"))) {
      throw new Error("Native Node addon found: use a Linux x64 build host");
    }
    config.architecture = "x86_64";
    config.regions = ["iad1"];
    config.memory = 2048;
    config.maxDuration = 300;
    await writeFile(file, JSON.stringify(config, null, 2) + "\n");
    functions.push({ owner: path.relative(functionsDir, owner), paths, runtime: config.runtime, architecture: config.architecture, regions: config.regions, memory: config.memory, maxDuration: config.maxDuration });
  }
  const configFile = path.join(output, "config.json");
  const config = JSON.parse(await readFile(configFile));
  config.regions = ["iad1"];
  await writeFile(configFile, JSON.stringify(config, null, 2) + "\n");
  const metadata = {
    variant: process.env.NEXT_SCRIPTC_BASELINE === "node" ? "node" : "native",
    buildSeconds: (performance.now() - started) / 1000, node: process.version, next: "16.4.3",
    sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
    dirty: Boolean(execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim()),
    builtAt: new Date().toISOString(), groups: process.env.NEXT_SCRIPTC_DEMO_GROUPS ?? "",
    functions,
  };
  // The adapter traces relative to the monorepo root, including node_modules.
  // Upload from that root so filePathMap resolves in the same namespace.
  await rm(path.join(root, ".vercel/output"), { recursive: true, force: true });
  await rename(output, path.join(root, ".vercel/output"));
  await writeFile(path.join(root, `.vercel/${metadata.variant}-build.json`), JSON.stringify(metadata, null, 2) + "\n");
  console.log(JSON.stringify(metadata, null, 2));
  return metadata;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await buildDemo();
