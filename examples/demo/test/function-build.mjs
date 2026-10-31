// Exercise real prerender invocation and native cleanup after success/type failure.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { demo } from "./function-harness.mjs";

const require = createRequire(path.join(demo, "package.json"));
const directory = await mkdtemp(path.join(demo, ".function-build-"));
try {
  await symlink(path.join(demo, "node_modules"), path.join(directory, "node_modules"));
  await mkdir(path.join(directory, "app"));
  await writeFile(path.join(directory, "tsconfig.json"), '{"compilerOptions":{"strict":true,"allowImportingTsExtensions":true,"noEmit":true,"jsx":"react-jsx","moduleResolution":"bundler","module":"esnext"}}');
  await writeFile(path.join(directory, "package.json"), '{"type":"module"}');
  await writeFile(path.join(directory, "next.config.ts"), 'import { withScriptc } from "next-scriptc"; export default withScriptc();');
  await writeFile(path.join(directory, "app/layout.tsx"), 'export default function Layout({children}: {children: React.ReactNode}) { return <html><body>{children}</body></html>; }');
  await writeFile(path.join(directory, "app/native.ts"), '"use scriptc"; export async function echo(value: string) { return value; }');
  for (const fail of [false, true]) {
    await writeFile(path.join(directory, "app/page.tsx"), `import { echo } from "./native"; ${fail ? 'const invalid: number = "type failure";' : ''} export default async function Page() { return <p>{await echo("native-prerender-result")}</p>; }`);
    const child = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "build"], {
      cwd: directory, env: { ...process.env, SCRIPTC_CHECKER_SERVER: "0" }, stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    for (const stream of [child.stdout, child.stderr]) stream.on("data", (chunk) => { output += chunk; });
    const code = await new Promise((resolve, reject) => { child.once("error", reject); child.once("close", resolve); });
    assert.equal(code === 0, !fail, output);
    const pids = [...output.matchAll(/native PID (\d+)/g)].map((match) => Number(match[1]));
    assert.equal(pids.length, 1, output);
    for (const pid of pids) assert.throws(() => process.kill(pid, 0), { code: "ESRCH" }, output);
    if (!fail) {
      const cache = path.join(directory, ".next/server/route-cache/APP_PAGE");
      const html = (await readdir(cache, { recursive: true })).find((file) => file.endsWith("/index.html"));
      assert.ok(html, output);
      assert.match(await readFile(path.join(cache, html), "utf8"), /native-prerender-result/);
    }
    else assert.match(output, /TS2322/);
    console.log(`Build ${fail ? "failure" : "success"}: native worker terminated${fail ? "" : ", native prerender output verified"}`);
  }
} finally { await rm(directory, { recursive: true, force: true }); }
