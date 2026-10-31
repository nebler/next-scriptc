import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { extractFunctions } from "../../../packages/next-scriptc/src/functions/extract.mjs";
import { callNative } from "../../../packages/next-scriptc/src/functions/client.mjs";
import { build, demo, report, start, stop, wait } from "./function-harness.mjs";

const basePort = Number(process.env.FUNCTION_TEST_PORT ?? "3461");
const results = [];
for (const mode of ["native", "node", "dev"]) {
  const port = basePort + ["native", "node", "dev"].indexOf(mode);
  if (mode !== "dev" && !process.argv.includes("--skip-build")) await build(mode === "node");
  const state = await start(port, mode === "node", mode === "dev");
  try {
    const values = [];
    for (const query of ["", "?from=2026-01-10&to=2026-01-13", "?from=2027-01-01", "?error=expected-message"]) values.push(await report(port, query));
    assert.equal(JSON.parse(values[0].value).events, 5000);
    assert.deepEqual(values[3], { kind: "error", value: "expected-message" });
    for (const size of [50000, 200000]) {
      const large = await report(port, `?size=${size}`);
      assert.equal(JSON.parse(large.value).events, size);
      values.push(large);
    }
    const api = await fetch(`http://127.0.0.1:${port}/api/function-example?value=route-call`);
    assert.deepEqual(await api.json(), { value: "route-call" });
    const failed = await fetch(`http://127.0.0.1:${port}/api/function-example?error=route-failure`);
    assert.equal(failed.status, 400);
    assert.deepEqual(await failed.json(), { error: "route-failure" });
    if (mode !== "dev") {
      const actions = JSON.parse(await readFile(path.join(demo, mode === "node" ? ".next-node" : ".next", "server/server-reference-manifest.json"), "utf8"));
      const action = Object.entries(actions.node).find(([, value]) => value.exportedName === "reportAction");
      assert.ok(action, "Server Action is registered");
      const form = new FormData(); form.set("value", "action-call"); form.set(`$ACTION_ID_${action[0]}`, "");
      const response = await fetch(`http://127.0.0.1:${port}/reports`, { method: "POST", body: form });
      assert.equal(response.status, 200, (await response.text()) + "\n" + state.output);
      assert.equal(new URL(response.url).searchParams.get("message"), "action-call", "Action uses the native result in its redirect");
    }
    if (mode === "native") {
      const manifest = JSON.parse(await readFile(path.join(demo, ".next/scriptc-functions/manifest.json"), "utf8"));
      for (const file of await readdir(path.join(demo, ".next/static"), { recursive: true })) {
        if (file.endsWith(".js")) assert.doesNotMatch(await readFile(path.join(demo, ".next/static", file), "utf8"), /__scriptc_|Native process unavailable|Cyclic JSON data/);
      }
      const source = path.join(demo, "lib/native-example.ts");
      const echo = extractFunctions(await readFile(source, "utf8"), source).functions.find((fn) => fn.name === "echo");
      const nativePort = manifest.processes[0].port;
      const pid = Number(state.output.match(/native functions → native PID (\d+)/)[1]);
      process.kill(pid, "SIGSTOP");
      const pending = callNative(nativePort, echo.id, ["in-flight"]);
      const rejection = assert.rejects(pending, /Native process unavailable/);
      await new Promise((resolve) => setTimeout(resolve, 50));
      const offset = state.output.length;
      process.kill(pid, "SIGKILL");
      await rejection;
      await wait(state, /native functions → native PID/, offset);
      assert.equal(await callNative(nativePort, echo.id, ["recovered"]), "recovered");
    } else if (mode === "dev") assert.doesNotMatch(state.output, /native PID/);
    results.push(values);
    console.log(`${mode}: report, errors, route handler${mode === "dev" ? "" : ", Server Action"} passed`);
  } finally { await stop(state); }
}
assert.deepEqual(results[0], results[1], "native / Node production results match");
assert.deepEqual(results[0], results[2], "native / untransformed dev results match");
console.log("Function E2E passed, including native in-flight crash rejection and restart");
