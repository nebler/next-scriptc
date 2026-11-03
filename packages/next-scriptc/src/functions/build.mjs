import {translateDiagnostics,infrastructureFailure} from 'scriptc-promote/functions/diagnostics.mjs';
import { optionsKey } from "../options.mjs";
import { discoverPromotions } from "./promotion-discovery.mjs";
import { buildPromotion } from "./promotion-build.mjs";
import { promotionArtifacts } from "./promotion-runtime.mjs";
import { compilerPath } from "../paths.mjs";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { access, cp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { prepareNativeSources } from "../native-config.mjs";
import { startNativeProcesses } from "../runtime.mjs";
import { discoverFunctions } from "./extract.mjs";
import { withFunctions } from "./config.mjs";

const plans = new Map();
const counts = new Map();
export function functionCounts(projectDir) { const result=counts.get(projectDir)??{functions:0,modules:0};counts.delete(projectDir);return result; }

export function takeFunctionPlan(projectDir) {
  const plan = plans.get(projectDir);
  plans.delete(projectDir);
  return plan;
}

export async function prepareFunctions(config, projectDir) {
  const distDir = path.resolve(projectDir, config.distDir ?? ".next");
  const promotionOutput = path.join(distDir, 'cache/scriptc-promotion');
  await rm(promotionOutput, { recursive: true, force: true });
  let promotions=[],promotionFile;
  let modules = await discoverFunctions(projectDir, distDir, config);
  if(config.rewrites?.[optionsKey]?.nativePromotion === 'auto'){
    const candidates=await discoverPromotions(projectDir,distDir,config);
    // Next cleans distDir after modifyConfig, but preserves its cache.
    const output=promotionOutput;
    promotions=await buildPromotion(candidates,output,{fuzz:config.rewrites?.[optionsKey]?.fuzz,linux:!!process.env.NEXT_SCRIPTC_VERCEL,...(process.env.NEXT_SCRIPTC_STRICT_RESULTS==='1'?{constructionResults:false}:{})});
    if(promotions.length&&config.output)throw new Error('[next-scriptc] Auto promotion requires the local Next server (export/standalone unsupported).');
    promotionFile=path.join(distDir,'scriptc-promotion/promotion.node');
  }
  counts.set(projectDir,{functions:[...modules,...promotions].reduce((n,m)=>n+m.functions.length,0),modules:new Set([...modules,...promotions].map(m=>m.source)).size});
  if (!modules.length) { plans.delete(projectDir); return withFunctions(config,promotions,0,projectDir,promotionFile); }
  if (config.output) throw new Error("[next-scriptc] Native functions require the local Next server (output: export/standalone is unsupported).");
  const port = 40000 + createHash("sha256").update(projectDir).digest().readUInt16BE(0) % 10000;
  const output = path.join(distDir, "cache/scriptc-functions");
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  const { functionServePath: serve } = await prepareNativeSources(projectDir, output, config);
  await writeFile(path.join(output, "package.json"), '{"type":"module"}\n');
  let entry = `import { serveFunctions, type FunctionResult } from ${JSON.stringify(serve)};\n`;
  const cases = [];
  let index = 0;
  for (const [moduleIndex, module] of modules.entries()) {
    const file = path.join(output, `module-${moduleIndex}.ts`);
    await writeFile(file, module.native);
    for (const fn of module.functions) {
      const name = `fn${index++}`;
      entry += `import { ${fn.name} as ${name} } from ${JSON.stringify(file)};\n`;
      cases.push(`case ${JSON.stringify(fn.id)}: {
  const args = JSON.parse(body) as Parameters<typeof ${name}>;
  if (trace) trace.push(Number(process.hrtime.bigint()) / 1e6); // args parsed
  if (trace) trace.push(Number(process.hrtime.bigint()) / 1e6); // dispatch start
  const value = await ${name}(${fn.params.map((_, i) => `args[${i}]`).join(", ")});
  if (trace) trace.push(Number(process.hrtime.bigint()) / 1e6); // user function done
  return { value, encode: () => JSON.stringify(value) };
}`);
    }
  }
  entry += `serveFunctions(async (id: string, body: string, trace: number[] | null): Promise<FunctionResult> => { switch (id) {\n${cases.join("\n")}\ndefault: throw new Error("Unknown native function");\n} });\n`;
  const file = path.join(output, "entry.ts");
  await writeFile(file, entry);
  const compiler = compilerPath();
  console.log(`[next-scriptc] Compiling ${index} native function(s)`);
  let compilerOutput="";
  try { await new Promise((resolve, reject) => {
    const child = spawn(compiler, ["build", file, "-o", path.join(output, "functions"), "--optimization", "release", "--strip", "--no-keep-llvm", "--node-islands=off"], { cwd: projectDir, stdio: ["ignore","pipe","pipe"] });
    child.stdout.on("data",data=>compilerOutput+=data);
    child.stderr.on("data",data=>compilerOutput+=data);
    child.once("error", reject);
    child.once("exit", (code, signal) => code === 0 ? resolve() : reject(new Error(`[next-scriptc] Function compilation failed (${signal ?? `exit ${code}`}). See scriptc diagnostics above.`)));
  }); } catch(error) {
    const infrastructure=infrastructureFailure({message:error.message,stderr:compilerOutput,code:error.code,path:error.path});
    if(infrastructure){plans.delete(projectDir);console.log(infrastructure);counts.set(projectDir,{functions:promotions.reduce((n,m)=>n+m.functions.length,0),modules:new Set(promotions.map(m=>m.source)).size});return withFunctions(config,promotions,0,projectDir,promotionFile);}
    throw Error(translateDiagnostics(compilerOutput,modules.map((module,i)=>({file:path.join(output,`module-${i}.ts`),module})))+"\n"+error.message);
  }
  if(compilerOutput)console.log(translateDiagnostics(compilerOutput,modules.map((module,i)=>({file:path.join(output,`module-${i}.ts`),module}))));
  const processes = [{ binary: "functions", port, routes: ["native functions"] }];
  plans.set(projectDir, { output, processes, functions:modules.map(m=>({source:m.source,hash:m.hash,names:m.functions.map(f=>f.name)})) });
  await startNativeProcesses(projectDir, output, processes);
  return withFunctions(config, [...modules,...promotions], port, projectDir,promotionFile);
}

export async function publishPromotion(distDir) {
  const promotionOutput = path.join(distDir, 'scriptc-promotion');
  await rm(promotionOutput, { recursive: true, force: true });
  const promotionCache = path.join(distDir, 'cache/scriptc-promotion');
  const hasPromotion = await stat(path.join(promotionCache, 'promotion.node')).then(() => true, error => {
    if (error.code === 'ENOENT') return false;
    throw error;
  });
  if (hasPromotion) {
    await mkdir(promotionOutput, { recursive: true });
    for (const name of promotionArtifacts) await cp(path.join(promotionCache, name), path.join(promotionOutput, name));
  }
}

export async function finishFunctions(projectDir, distDir, buildId) {
  await publishPromotion(distDir);
  const output = path.join(distDir, "scriptc-functions");
  await rm(output, { recursive: true, force: true });
  const plan = plans.get(projectDir);
  if (!plan) return;
  await mkdir(output, { recursive: true });
  await cp(path.join(plan.output, "functions"), path.join(output, "functions"));
  await writeFile(path.join(output, "manifest.json"), JSON.stringify({ buildId, functions:plan.functions, processes: plan.processes }) + "\n");
  plans.delete(projectDir);
}

export async function startFunctions(projectDir, distDir) {
  const output = path.join(distDir, "scriptc-functions");
  let manifest;
  try { manifest = JSON.parse(await readFile(path.join(output, "manifest.json"), "utf8")); }
  catch (cause) {
    if (cause.code === "ENOENT") return;
    throw new Error("[next-scriptc] Cannot read native functions manifest. Rebuild the application.", { cause });
  }
  if (manifest?.buildId !== (await readFile(path.join(distDir, "BUILD_ID"), "utf8")).trim()) {
    throw new Error("[next-scriptc] Native functions build ID mismatch. Rebuild the application.");
  }
  const processes = manifest.processes;
  const native = Array.isArray(processes) && processes.length === 1 ? processes[0] : null;
  if (!native || native.binary !== "functions" || !Number.isInteger(native.port) || native.port < 1 || native.port > 65535 ||
      !Array.isArray(native.routes) || !native.routes.length || native.routes.some((label) => typeof label !== "string" || !label.trim())) {
    throw new Error("[next-scriptc] Invalid native functions manifest. Rebuild the application.");
  }
  try {
    if (!(await stat(path.join(output, "functions"))).isFile()) throw new Error("Invalid binary");
    await access(path.join(output, "functions"), constants.X_OK);
  } catch (cause) {
    throw new Error("[next-scriptc] Missing or invalid native functions binary. Rebuild the application.", { cause });
  }
  await startNativeProcesses(projectDir, output, processes);
}
