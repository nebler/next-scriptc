#!/usr/bin/env node
// SCRIPTC_COMPILER wrapper: use the L1-verified patched CLI + V4 musl pack,
// recording the dispatch symbol before applying the adapter's requested strip.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

const args = process.argv.slice(2);
assert(args.includes("--cpu-dispatch") && args.includes("--strip"));
const binary = args[args.indexOf("-o") + 1];
const root = path.resolve(import.meta.dirname, "../../../..");
execFileSync(path.join(root, "research/vector-vercel/patched-cli.sh"), args.filter((arg) => arg !== "--strip"), { stdio: "inherit" });
const llvm = process.env.LLVM_BIN ?? "/opt/homebrew/opt/llvm/bin";
const nm = execFileSync(path.join(llvm, "llvm-nm"), [binary], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
const address = /^([0-9a-f]+) [a-zA-Z] sc_cpu_level$/m.exec(nm);
assert(address, "Missing CPU dispatch symbol");
assert.match(execFileSync(path.join(llvm, "llvm-readelf"), ["-h", binary], { encoding: "utf8" }), /EXEC \(Executable file\)/);
execFileSync(path.join(llvm, "llvm-strip"), ["--strip-all", binary]);
writeFileSync(path.join(path.dirname(binary), "public-dispatch.json"), JSON.stringify({
  address: parseInt(address[1], 16),
  sha256: createHash("sha256").update(readFileSync(binary)).digest("hex"),
}) + "\n");
