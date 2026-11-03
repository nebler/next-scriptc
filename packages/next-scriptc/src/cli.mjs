#!/usr/bin/env node
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

// Compatibility alias: run Next's CLI here, using its argument parsing and help.
// Native routes are owned by the production config hook.
if (process.argv[2] === "doctor") {
  try { (await import("scriptc-promote/doctor")).doctorCommand(); } catch(error) { console.error(error.message); process.exitCode = 1; }
} else if (process.argv[2] === "fuzz") {
  try { await (await import("scriptc-promote/fuzz")).fuzzCommand(); } catch (error) { console.error(error.message); process.exitCode = 1; }
} else if (process.argv[2] === "report") {
  const { reportCommand } = await import("scriptc-promote/report");
  try { await reportCommand(); } catch (error) { console.error(error.message); process.exitCode = 1; }
} else if (process.argv[2] === "vercel-build") {
  const { buildVercel } = await import("./vercel.mjs");
  await buildVercel(process.argv.slice(3));
  process.exit(0);
} else if (process.argv[2] !== "start") {
  console.error("Usage: next-scriptc start [directory] [Next start options] | report [directory] [report options] | vercel-build [--prod]");
  process.exit(1);
}
if (process.argv[2] === "start") {
  const require = createRequire(import.meta.url);
  const cli = require.resolve("next/dist/bin/next");
  process.argv[1] = cli;
  await import(pathToFileURL(cli).href);
}
