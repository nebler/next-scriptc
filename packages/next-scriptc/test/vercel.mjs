import assert from "node:assert/strict";
import { chmod, lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { replaceFunctions } from "../src/vercel.mjs";

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
    await replaceFunctions(functions, [{ functions: [native, variant], binary, executable: binary, config }]);
    assert.equal(await readFile(path.join(node, "node.js"), "utf8"), "original Node function");
    assert.equal(await readFile(path.join(alias, "node.js"), "utf8"), "original Node function");
    assert.equal(await readFile(path.join(variant, "user-server"), "utf8"), "native binary");
    assert.ok((await lstat(variant)).isSymbolicLink());
    assert.equal((await lstat(path.join(native, "user-server"))).mode & 0o777, 0o755);
    assert.deepEqual(JSON.parse(await readFile(path.join(native, ".vc-config.json"))), config);
    assert.equal(await readFile(prerender, "utf8"), '{"expiration":false}');
    await assert.rejects(readFile(path.join(native, "node.js")), { code: "ENOENT" });
  } finally { await rm(temporary, { recursive: true, force: true }); }
});
