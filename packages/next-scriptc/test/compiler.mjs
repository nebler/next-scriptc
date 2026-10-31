import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { compilerPath } from "../src/paths.mjs";

test("compiler override is an absolute file path and default remains installed scriptc", () => {
  assert.ok(path.isAbsolute(compilerPath({})));
  assert.equal(compilerPath({ SCRIPTC_COMPILER: "/tmp/custom scriptc" }), "/tmp/custom scriptc");
  for (const value of ["", "scriptc", "./scriptc", "scriptc --fast"])
    assert.throws(() => compilerPath({ SCRIPTC_COMPILER: value }), /absolute executable path/);
});
