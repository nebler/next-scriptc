import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmod, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { bundleFunctionSidecar, functionUsesNative, planVercelFunction, replaceFunctions } from "../src/vercel.mjs";

test("sidecar packaging preserves shared Node aliases and excludes executable/Edge outputs", async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), "scriptc-sidecar-"));
  try {
    const functions = path.join(temporary, "functions");
    for (const [name, runtime] of [["node", "nodejs24.x"], ["native", "executable"], ["edge", "edge"]]) {
      await mkdir(path.join(functions, `${name}.func`), { recursive: true });
      await writeFile(path.join(functions, `${name}.func/.vc-config.json`), JSON.stringify({ runtime, handler: "launcher.cjs" }));
      await writeFile(path.join(functions, `${name}.func/launcher.cjs`), "module.exports = () => {};\n");
    }
    await symlink("node.func", path.join(functions, "alias.func"));
    const binary = path.join(temporary, "binary");
    await writeFile(binary, "sidecar");
    assert.equal(await bundleFunctionSidecar(functions, binary), 1);
    assert.equal(await readFile(path.join(functions, "alias.func/scriptc-functions"), "utf8"), "sidecar");
    assert.equal((await lstat(path.join(functions, "node.func/scriptc-functions"))).mode & 0o777, 0o755);
    assert.equal(JSON.parse(await readFile(path.join(functions, "node.func/.vc-config.json"))).architecture, "x86_64");
    for (const name of ["native", "edge"]) await assert.rejects(readFile(path.join(functions, `${name}.func/scriptc-functions`)), { code: "ENOENT" });
  } finally { await rm(temporary, { recursive: true, force: true }); }
});

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


test("native packaging follows traced source paths, chunks and NFT files, including uncertain traces", async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), "scriptc-trace-"));
  try {
    const owner = path.join(temporary, "page.func"), root = path.join(temporary, "source");
    await mkdir(owner); await mkdir(root);
    await writeFile(path.join(owner, "handler.cjs"), "module.exports = () => {};");
    await writeFile(path.join(root, "plain.js"), "module.exports = 1;");
    await writeFile(path.join(root, "native.js"), 'Symbol.for("next-scriptc.functions.sidecar");');
    const config = (source) => ({handler:"handler.cjs", filePathMap:{"chunks/output.js": source}});
    assert.equal(await functionUsesNative(owner, config("plain.js"), root), false);
    assert.equal(await functionUsesNative(owner, config("native.js"), root), true);
    assert.equal(await functionUsesNative(owner, config("packages/next-scriptc/src/functions/client.mjs"), root), true);
    assert.equal(await functionUsesNative(owner, config("missing.js"), root), true);
    assert.equal(await functionUsesNative(owner, config("app/.next/scriptc-functions/manifest.json"), root), true);
    assert.equal(await functionUsesNative(owner, config(null), root), true);
    assert.equal(await functionUsesNative(owner, {handler:"handler.cjs"}, root), true);
    assert.equal(await functionUsesNative(owner, {handler:"handler.cjs",filePathMap:{}}, root), true);
    // Materialized traced files take precedence over build-host source paths.
    await mkdir(path.join(owner,"chunks"));
    await writeFile(path.join(owner,"chunks/output.js"), 'Symbol.for("next-scriptc.functions.sidecar");');
    assert.equal(await functionUsesNative(owner, config("plain.js"), root), true);
    await writeFile(path.join(owner,"handler.cjs.nft.json"), JSON.stringify({files:["../source/plain.js"]}));
    assert.equal(await functionUsesNative(owner, {handler:"handler.cjs"}, root), false);
    await writeFile(path.join(owner,"handler.cjs"), 'Symbol.for("next-scriptc.functions.sidecar");');
    assert.equal(await functionUsesNative(owner, {handler:"handler.cjs"}, root), true);
    await writeFile(path.join(owner,"handler.cjs.nft.json"), "{");
    assert.equal(await functionUsesNative(owner, {handler:"handler.cjs"}, root), true);
  } finally { await rm(temporary, {recursive:true,force:true}); }
});

test("bootstrap starts one shared child before the launcher and preserves exports and bundling groups", async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), "scriptc-bootstrap-"));
  try {
    const functions = path.join(temporary,"functions");
    const handler = `const sidecar = globalThis[Symbol.for("next-scriptc.functions.sidecar")];
module.exports = { attempts: sidecar?.state.attempts ?? 0, pid: sidecar?.state.pid, stop: () => sidecar?.stop() };
module.exports.getRequestHandlerWithMetadata = metadata => metadata;
`;
    for(const name of ["native","plain","different"]) {
      const owner = path.join(functions, name+".func"); await mkdir(owner,{recursive:true});
      await writeFile(path.join(owner,"chunk.js"), name === "native" ? 'Symbol.for("next-scriptc.functions.sidecar");' : "module.exports = 1;");
      // All three share launcher code in the native test. The plain handler
      // below excludes the marker used by the detector without changing bytes
      // across the two otherwise-bundleable outputs.
      await writeFile(path.join(owner,"launcher.cjs"), (name === "different" ? handler+"// different launcher" : handler).replace('"next-scriptc.functions.sidecar"','"next-scriptc." + "functions.sidecar"'));
      await writeFile(path.join(owner,".vc-config.json"),JSON.stringify({runtime:"nodejs24.x",handler:"launcher.cjs",filePathMap:{"chunk.js":"unavailable.js"}}));
    }
    await symlink("native.func",path.join(functions,"alias.func"));
    const binary = path.join(temporary,"binary");
    await writeFile(binary, `#!${process.execPath}
const {createServer} = require('node:http');
const {writeFileSync} = require('node:fs');
const server = createServer((req,res) => {
  if (req.url !== '/__warmup') throw Error('user dispatch');
  writeFileSync('warmup.json', JSON.stringify({url:req.url}));
  req.resume(); res.end('{"warmup":true,"args":[]}');
});
server.listen(0,'127.0.0.1',()=>console.log('next-scriptc: listening on 127.0.0.1:'+server.address().port));
`); await chmod(binary,0o755);
    assert.equal(await bundleFunctionSidecar(functions,binary,{traceRoot:temporary}),1);
    const bootstrap = name => path.join(functions,name+".func/scriptc-bootstrap.cjs");
    const first = await readFile(bootstrap("native"), "utf8");
    assert.equal(await bundleFunctionSidecar(functions,binary,{traceRoot:temporary}),1);
    assert.equal(await readFile(bootstrap("native"), "utf8"), first, "packaging can be repeated");
    assert.equal(await readFile(bootstrap("native"),"utf8"),await readFile(bootstrap("plain"),"utf8"));
    assert.notEqual(await readFile(bootstrap("native"),"utf8"),await readFile(bootstrap("different"),"utf8"));
    await assert.rejects(readFile(path.join(functions,"plain.func/scriptc-functions")),{code:"ENOENT"});
    for(const [name,attempts] of [["native",1],["plain",0]]) {
      const script = `const Module = require('node:module'), load = Module._load;
Module._load = function(id, ...args) { if(id.endsWith('.mjs')) throw Error('Vercel rejects require(ESM)'); return load.call(this,id,...args); };
const handler = require('./scriptc-bootstrap.cjs');
const runtime = ${attempts} ? require('./scriptc-sidecar.cjs') : null;
if(runtime && runtime.nativeAgent !== globalThis[Symbol.for('next-scriptc.functions.agent')]) throw Error('separate HTTP pool');
if(runtime && runtime.startSidecar('./scriptc-functions') !== globalThis[Symbol.for('next-scriptc.functions.sidecar')]) throw Error('duplicate');
(async () => {
  try {
    if(runtime) {
      await runtime.startSidecar('./scriptc-functions').port();
      const fs = require('node:fs'), deadline = Date.now() + 3000;
      while(!fs.existsSync('warmup.json') && Date.now() < deadline) await new Promise(r=>setTimeout(r,5));
      if(JSON.parse(fs.readFileSync('warmup.json')).url !== '/__warmup') throw Error('missing warm-up');
    }
    console.log(JSON.stringify({attempts:handler.attempts,pid:handler.pid,metadata:handler.getRequestHandlerWithMetadata({a:1})}));
  } finally { handler.stop(); }
})().catch(error=>{console.error(error);process.exitCode=1;});`;
      const result = JSON.parse(execFileSync(process.execPath,["-e",script],{cwd:path.join(functions,name+".func"),env:{...process.env,VERCEL:"",NEXT_SCRIPTC_VERCEL:""},encoding:"utf8"}));
      assert.equal(result.attempts,attempts); assert.deepEqual(result.metadata,{a:1});
      if(attempts) assert.ok(result.pid>0);
    }
  } finally { await rm(temporary,{recursive:true,force:true}); }
});

// Reproduce Next deleting everything outside cache, then the hosted output hook.
test("Vercel completion publishes cached promotion before the output adapter and bundles traced Node functions", async () => {
  const {default:adapter} = await import('../src/adapter.mjs');
  const {withScriptc} = await import('../src/index.mjs');
  const dir=await mkdtemp(path.join(tmpdir(),'scriptc-vercel-promotion-'));
  const previous={NEXT_SCRIPTC_VERCEL:process.env.NEXT_SCRIPTC_VERCEL,NEXT_ADAPTER_PATH:process.env.NEXT_ADAPTER_PATH};
  try {
    const distDir=path.join(dir,'.next');
    const fixture=path.join(dir,'output-adapter.mjs');
    await writeFile(fixture,`import {mkdir,readFile,writeFile} from 'node:fs/promises';import path from 'node:path';
export default {modifyConfig:c=>c,async onBuildComplete({distDir}){
 await readFile(path.join(distDir,'scriptc-promotion/promotion.node'));
 for(const [name,runtime,content] of [['native','nodejs24.x','next-scriptc.functions.promotion'],['plain','nodejs24.x','plain'],['edge','edge','next-scriptc.functions.promotion']]){
 const owner=path.join(distDir,'output/functions',name+'.func');await mkdir(owner,{recursive:true});await writeFile(path.join(owner,'handler.js'),content);await writeFile(path.join(owner,'.vc-config.json'),JSON.stringify({runtime,handler:'handler.js',filePathMap:{'handler.js':'handler.js'}}));}
}};`);
    process.env.NEXT_SCRIPTC_VERCEL=path.join(dir,'.vercel/scriptc-build');
    process.env.NEXT_ADAPTER_PATH=fixture;
    await adapter.modifyConfig(withScriptc({distDir:'.next'}),{phase:'phase-production-build',projectDir:dir});
    const artifacts=['promotion.node','ids.json','encodings.json'];
    const cache=path.join(distDir,'cache/scriptc-promotion');await mkdir(cache,{recursive:true});
    for(const name of artifacts)await writeFile(path.join(cache,name),`fixture ${name}`);
    await mkdir(path.join(distDir,'scriptc-promotion'),{recursive:true});
    await rm(path.join(distDir,'scriptc-promotion'),{recursive:true});
    await writeFile(path.join(distDir,'required-server-files.json'),JSON.stringify({config:{outputFileTracingRoot:dir}}));
    await adapter.onBuildComplete({projectDir:dir,distDir,buildId:'fixture',outputs:{appRoutes:[],prerenders:[]}});
    for(const name of artifacts)assert.equal(await readFile(path.join(distDir,'output/functions/native.func/.next/scriptc-promotion',name),'utf8'),`fixture ${name}`);
    for(const name of ['plain','edge'])await assert.rejects(lstat(path.join(distDir,`output/functions/${name}.func/.next/scriptc-promotion`)),{code:'ENOENT'});
  } finally {
    for(const [name,value] of Object.entries(previous)){if(value===undefined)delete process.env[name];else process.env[name]=value;}
    await rm(dir,{recursive:true,force:true});
  }
});
