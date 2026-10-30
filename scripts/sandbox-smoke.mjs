// Smoke test: can a Vercel Sandbox build the demo's native routes on Linux?
// Run from the workspace root: node --env-file=.env.local scripts/sandbox-smoke.mjs
import { execFileSync } from "node:child_process";
import { Sandbox } from "@vercel/sandbox";

const archive = execFileSync("git", ["archive", "--format=tar", "HEAD"], { maxBuffer: 64 * 1024 * 1024 });
const commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();

const sandbox = await Sandbox.create({
  image: "vercel/sandbox/node:24",
  resources: { vcpus: 4 },
  timeout: 30 * 60 * 1000,
  persistent: false,
});
const started = Date.now();
console.log(`sandbox ${sandbox.name} created; uploading ${commit} (${(archive.length / 1024).toFixed(0)} KiB)`);

async function step(label, script, { sudo = false } = {}) {
  console.log(`\n=== ${label}`);
  const result = await sandbox.runCommand({ cmd: "bash", args: ["-lc", `set -euo pipefail\n${script}`], sudo, stdout: process.stdout, stderr: process.stderr });
  if (result.exitCode !== 0) throw new Error(`${label} failed (exit ${result.exitCode})`);
}

try {
  await sandbox.writeFiles([{ path: "repo.tar", content: archive }]);
  await step("environment", `
    cat /etc/os-release | head -2
    uname -mr
    echo "node $(node -v), $(nproc) vCPUs, $(free -m | awk '/Mem:/ {print $2}') MiB RAM"
    command -v clang && clang --version | head -1 || echo "clang: missing"
    command -v dnf || command -v apt-get || true`);
  await step("install clang", "command -v clang >/dev/null || (command -v dnf >/dev/null && dnf install -y -q clang) || (apt-get update -qq && apt-get install -y -qq clang)", { sudo: true });
  await step("unpack + pnpm install", `
    mkdir -p next-scriptc && tar -xf repo.tar -C next-scriptc
    cd next-scriptc && npx -y pnpm@11.1.3 install --frozen-lockfile --reporter=silent
    echo "scriptc $(packages/next-scriptc/node_modules/.bin/scriptc --version)"`);
  await step("native build", `
    cd next-scriptc && npx -y pnpm@11.1.3 --filter demo build 2>&1 | grep -E "next-scriptc\\]|rror|warn" || true
    ls -la examples/demo/.next/scriptc/route-*
    file examples/demo/.next/scriptc/route-0 2>/dev/null || true`);
  await step("serve hello natively", `
    cd next-scriptc/examples/demo
    (npx -y pnpm@11.1.3 start -p 3517 > /tmp/start.log 2>&1 &)
    node --input-type=module -e '
      const base = "http://localhost:3517";
      for (let i = 0; i < 120; i++) {
        try { await fetch(base + "/api/hello"); break; } catch { await new Promise((r) => setTimeout(r, 500)); }
      }
      for (const route of ["/api/hello", "/api/report?threads=4"]) {
        const response = await fetch(base + route);
        console.log(route, response.status, "x-next-scriptc:", response.headers.get("x-next-scriptc"));
        console.log((await response.text()).slice(0, 300));
      }' || { cat /tmp/start.log; exit 1; }`);
} finally {
  const stopped = await sandbox.stop();
  console.log(`\nstopped after ${((Date.now() - started) / 1000).toFixed(0)} s; active CPU ${((stopped.activeCpuDurationMs ?? 0) / 1000).toFixed(0)} s`);
}
