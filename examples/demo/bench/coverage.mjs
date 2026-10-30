import assert from "node:assert/strict";
import { exec } from "./processes.mjs";

export function parseCoverage(stdout) {
  const number = (pattern) => {
    const match = stdout.match(pattern);
    assert.ok(match, `Unrecognized scriptc coverage output: ${pattern}`);
    return Number(match[1]);
  };
  const packages = stdout.split("npm package compilation:")[1]?.split(/\n\s*\n/)[0] ?? "";
  return {
    statements: number(/statements analyzed\s+(\d+)/),
    staticStatements: number(/compile statically\s+(\d+)/),
    staticPercent: number(/compile statically\s+\d+\s+\((\d+)%\)/),
    dynamicTierStatements: Number(stdout.match(/in dynamic tier\s+(\d+)/)?.[1] ?? 0),
    packages: packages.trim().split("\n").filter(Boolean).map((line) => {
      const [, name, mode] = line.match(/^\s*(\S+)\s+(.+)$/) ?? [];
      assert.ok(name && mode, `Unrecognized package coverage: ${line}`);
      return { name, mode: mode.trim() };
    }),
  };
}
export async function coverage(compiler, entry, cwd) {
  const args = ["coverage", entry]; // Same default policy as the adapter's build.
  const { stdout, stderr } = await exec(compiler, args, { cwd, timeout: 90_000, maxBuffer: 8 * 1024 * 1024 });
  return { ...parseCoverage(stdout), command: [compiler, ...args], stdout, stderr };
}
