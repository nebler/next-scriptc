import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

export const demo = path.resolve(import.meta.dirname, "..");
const require = createRequire(path.join(demo, "package.json"));
const next = require.resolve("next/dist/bin/next");

export function run(args, baseline = false) {
  const child = spawn(process.execPath, [next, ...args], {
    cwd: demo,
    env: { ...process.env, NEXT_SCRIPTC_BASELINE: baseline ? "node" : "", SCRIPTC_CHECKER_SERVER: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const state = { child, output: "" };
  for (const stream of [child.stdout, child.stderr]) stream.on("data", (chunk) => { state.output += chunk; });
  state.exit = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => resolve({ code, signal }));
  });
  return state;
}

export async function wait(state, pattern, offset = 0) {
  const deadline = Date.now() + 30_000;
  while (!pattern.test(state.output.slice(offset))) {
    if (state.child.exitCode !== null || state.child.signalCode || Date.now() > deadline) throw new Error(state.output);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

export async function build(baseline) {
  const state = run(["build"], baseline);
  const { code } = await state.exit;
  if (code !== 0) throw new Error(state.output);
  console.log(`Built ${baseline ? "Node" : "native"} demo`);
}

export async function start(port, baseline = false, dev = false) {
  const state = run([dev ? "dev" : "start", "-p", String(port)], baseline);
  try {
    await wait(state, /Ready in/);
    const response = await fetch(`http://127.0.0.1:${port}/reports`, { signal: AbortSignal.timeout(30_000) });
    await response.text();
    if (response.status !== 200) throw new Error(state.output);
    return state;
  } catch (error) { await stop(state); throw error; }
}

export async function stop(state) {
  if (state.child.exitCode !== null || state.child.signalCode) return;
  state.child.kill("SIGTERM");
  const timer = setTimeout(() => state.child.kill("SIGKILL"), 6000);
  await state.exit;
  clearTimeout(timer);
}

export async function report(port, query = "") {
  const response = await fetch(`http://127.0.0.1:${port}/reports${query}`);
  const html = await response.text();
  if (response.status !== 200) throw new Error(html);
  const match = html.match(/<pre id="(result|error)">([\s\S]*?)<\/pre>/);
  if (!match) throw new Error(html);
  return { kind: match[1], value: match[2].replaceAll("&quot;", '"').replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&#x27;", "'").replaceAll("&amp;", "&") };
}
