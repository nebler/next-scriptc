import assert from "node:assert/strict";
import { test } from "node:test";
import { chmod, mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { prepareFunctions } from "../src/functions/build.mjs";

// "use native" means compiled-or-fail: a missing toolchain must stop the build
// instead of silently serving the function as JS.
test('explicit "use native" functions fail the build when the toolchain is missing', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "nsc-explicit-toolchain-"));
  const previous = process.env.SCRIPTC_COMPILER;
  try {
    await mkdir(path.join(dir, "app"), { recursive: true });
    await mkdir(path.join(dir, "node_modules"));
    await symlink(path.dirname(createRequire(import.meta.url).resolve("typescript/package.json")), path.join(dir, "node_modules", "typescript"));
    await writeFile(path.join(dir, "package.json"), '{"name":"t","private":true}\n');
    await writeFile(path.join(dir, "tsconfig.json"), '{"compilerOptions":{"strict":true}}\n');
    await writeFile(path.join(dir, "app", "score.ts"), '"use native";\nexport async function score(xs: number[]): Promise<number> { let s = 0; for (const x of xs) s += x; return s; }\n');
    const fake = path.join(dir, "fake-scriptc");
    await writeFile(fake, "#!/bin/sh\necho 'Error: spawnSync ar ENOENT' >&2\nexit 1\n");
    await chmod(fake, 0o755);
    process.env.SCRIPTC_COMPILER = fake;
    await assert.rejects(prepareFunctions({ experimental: {}, typescript: {} }, dir), err => {
      assert.match(err.message, /NSC2001: Toolchain unavailable \(ar\)/);
      assert.match(err.message, /"use native" require it, so the build stops/);
      assert.match(err.message, /app\/score\.ts#score/);
      return true;
    });
  } finally {
    if (previous === undefined) delete process.env.SCRIPTC_COMPILER; else process.env.SCRIPTC_COMPILER = previous;
    await rm(dir, { recursive: true, force: true });
  }
});
