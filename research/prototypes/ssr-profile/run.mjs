import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, writeFileSync, openSync, closeSync } from "node:fs";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { load } from "./load.mjs";
import { attribute } from "./attribute.mjs";
import { concat } from "./shared/concat.js";
import { createHash } from "node:crypto";
import { normalizeMain } from "./normalize.mjs";
// run.mjs LABEL URL OUTPUT_DIR CWD ENTRY [ARGS...]
const [label, url, out, cwd, entry, ...args] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const log = openSync(resolve(out, label + ".log"), "w");
const child = spawn(
  process.execPath,
  [
    "--import",
    new URL("./control.mjs", import.meta.url).pathname,
    entry,
    ...args,
  ],
  {
    cwd,
    env: {
      ...process.env,
      NODE_ENV: "production",
      NEXT_TELEMETRY_DISABLED: "1",
      PORT: new URL(url).port,
      HOST: "127.0.0.1",
    },
    stdio: ["ignore", log, log, "ipc"],
  },
);
let id = 0;
const pending = new Map();
child.on("message", (m) => {
  const p = pending.get(m.id);
  if (p) {
    pending.delete(m.id);
    m.error ? p.reject(Error(m.error)) : p.resolve(m);
  }
});
function command(op, profile = false) {
  return new Promise((resolve, reject) => {
    const key = ++id;
    pending.set(key, { resolve, reject });
    child.send({ id: key, op, profile });
  });
}
const results = {
  label,
  url,
  node: process.version,
  started: new Date().toISOString(),
  blocks: [],
};
try {
  let ready = false;
  for (let i = 0; i < 120; i++) {
    if (child.exitCode !== null) throw Error("Server exited " + child.exitCode);
    try {
      const r = await fetch(url);
      if (r.status === 200) {
        const html = await r.text();
        if (process.env.EXPECT && !html.includes(process.env.EXPECT))
          throw Error("Missing expected content");
        if (process.env.VERIFY === "1") {
          const canonical = concat();
          const start = html.indexOf('<main id="benchmark">'),
            stop = html.indexOf("</main>", start) + 7;
          if (start < 0 || stop < 7) throw Error("Missing main subtree");
          const actual = html.slice(start, stop);
          const normalized = normalizeMain(actual, process.env.NORMALIZE);
          writeFileSync(resolve(out, label + ".response.html.gz"), gzipSync(html));
          results.equivalence = {
            equal: actual === canonical,
            normalizedEqual: normalized === canonical,
            normalization: process.env.NORMALIZE || null,
            comments: [...new Set(actual.match(/<!--[\s\S]*?-->/g) || [])],
            normalizedBytes: Buffer.byteLength(normalized),
            canonicalBytes: Buffer.byteLength(canonical),
            actualBytes: Buffer.byteLength(actual),
            sha256: createHash("sha256").update(actual).digest("hex"),
            extraBytes: Buffer.byteLength(html) - Buffer.byteLength(actual),
          };
          if (normalized !== canonical) throw Error("Canonical HTML mismatch");
        }
        results.responseBytes = Buffer.byteLength(html);
        results.sample = html.slice(0, 300);
        ready = true;
        break;
      }
    } catch (e) { results.readinessError = String(e); }
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!ready) throw Error("Server readiness failed");
  for (const c of process.env.PROFILE_ONLY ? [] : [1, 16]) {
    const warmup = await load(url, c, 2);
    (results.warmups ||= []).push({concurrency:c,...warmup});
    for (let b = 0; b < 3; b++) {
      const host = execFileSync("ps", ["-A", "-o", "pid,pcpu,comm", "-r"], {encoding:"utf8"}).split("\n").slice(0,21);
      await command("start");
      const r = await load(url, c, 3);
      const { usage } = await command("stop");
      results.blocks.push({
        concurrency: c,
        host,
        block: b,
        ...r,
        cpu: usage,
        cpuMsPerRequest: (usage.user + usage.system) / 1000 / r.n,
      });
      console.log(label, c, b, r.n);
    }
  }
  results.profileWarmup = await load(url, 16, 2);
  await command("start", true);
  const r = await load(url, 16, 8);
  const { usage, profile, bounds } = await command("stop", true);
  writeFileSync(
    resolve(out, label + ".cpuprofile.gz"),
    gzipSync(JSON.stringify(profile)),
  );
  results.profile = {
    ...r,
    cpu: usage,
    bounds,
    attribution: attribute(profile, bounds),
  };
} catch (e) {
  results.error = String(e);
  process.exitCode = 1;
} finally {
  writeFileSync(
    resolve(out, label + ".json.gz"),
    gzipSync(JSON.stringify(results)),
  );
  if (child.exitCode === null) {
    if (child.connected) child.disconnect();
    child.kill("SIGTERM");
    const timer = setTimeout(() => child.kill("SIGKILL"), 5000);
    await new Promise((r) => child.once("exit", r));
    clearTimeout(timer);
  }
  closeSync(log);
}
