import assert from "node:assert/strict";
import { chmod, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { planVercelFunction, replaceFunctions } from "../src/vercel.mjs";

test("native replacement preserves shared Node aliases, variants and prerender files", async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), "scriptc-vercel-"));
  try {
    const functions = path.join(temporary, "functions");
    const native = path.join(functions, "items/[id].func");
    const node = path.join(functions, "node.func");
    const alias = path.join(functions, "other.func");
    const variant = path.join(functions, "items/[id].rsc.func");
    await mkdir(native, { recursive: true });
    await writeFile(path.join(native, "node.js"), "original Node function");
    await symlink("items/[id].func", node);
    await symlink("items/[id].func", alias);
    await symlink("[id].func", variant);
    const prerender = path.join(functions, "node.prerender-config.json");
    await writeFile(prerender, '{"expiration":false}');
    const binary = path.join(temporary, "binary");
    await writeFile(binary, "native binary");
    await chmod(binary, 0o755);
    const config = { runtime: "executable", handler: "executable", maxDuration: 30, memory: 1024, regions: ["iad1"], supportsResponseStreaming: true };
    await replaceFunctions(functions, [{ functions: [native, variant], binary, config }]);
    assert.equal(await readFile(path.join(node, "node.js"), "utf8"), "original Node function");
    assert.equal(await readFile(path.join(alias, "node.js"), "utf8"), "original Node function");
    assert.equal(await readFile(path.join(variant, "executable"), "utf8"), "native binary");
    assert.deepEqual((await readdir(native)).sort(), [".vc-config.json", "executable"]);
    assert.ok((await lstat(variant)).isSymbolicLink());
    assert.equal((await lstat(path.join(native, "executable"))).mode & 0o777, 0o755);
    assert.deepEqual(JSON.parse(await readFile(path.join(native, ".vc-config.json"))), config);
    assert.equal(await readFile(prerender, "utf8"), '{"expiration":false}');
    await assert.rejects(readFile(path.join(native, "node.js")), { code: "ENOENT" });
  } finally { await rm(temporary, { recursive: true, force: true }); }
});

test("grouped routes share one Function across nested aliases and preserve independent Functions", async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), "scriptc-vercel-group-"));
  try {
    const functionsDir = path.join(temporary, "functions");
    const members = [{ pattern: "/api/hello", group: "all" }, { pattern: "/api/items/[id]", group: "all" }];
    const appRoutes = members.flatMap(({ pattern }) => [
      { pathname: pattern, filePath: `${pattern}/route.js` },
      { pathname: `${pattern}.rsc`, filePath: `${pattern}/route.js` },
    ]);
    for (const route of [...appRoutes, { pathname: "/node" }]) {
      const directory = path.join(functionsDir, `${route.pathname.slice(1)}.func`);
      await mkdir(directory, { recursive: true });
      await writeFile(path.join(directory, ".vc-config.json"), JSON.stringify({ runtime: "nodejs24.x", memory: 1024, regions: ["iad1"] }));
    }
    const plan = await planVercelFunction(functionsDir, appRoutes, members);
    assert.equal(plan.functions.length, 4);
    const binary = path.join(temporary, "binary");
    await writeFile(binary, "multi-route executable");
    await replaceFunctions(functionsDir, [{ ...plan, binary }]);
    const owner = path.join(functionsDir, "api/hello.func");
    for (const file of plan.functions) {
      assert.equal(await realpath(file), await realpath(owner));
      assert.equal(await readFile(path.join(file, "executable"), "utf8"), "multi-route executable");
      assert.equal((await lstat(file)).isSymbolicLink(), file !== owner);
    }
    assert.equal(JSON.parse(await readFile(path.join(functionsDir, "node.func/.vc-config.json"))).runtime, "nodejs24.x");
    assert.equal(plan.config.memory, 1024);
    // Re-plan with conflicting Vercel settings: sharing must fail explicitly.
    await rm(path.join(functionsDir, "api/items/[id].func"));
    await mkdir(path.join(functionsDir, "api/items/[id].func"));
    await writeFile(path.join(functionsDir, "api/items/[id].func/.vc-config.json"), '{"memory":2048}');
    await assert.rejects(planVercelFunction(functionsDir, appRoutes, members), /incompatible Vercel Function settings/);
  } finally { await rm(temporary, { recursive: true, force: true }); }
});
