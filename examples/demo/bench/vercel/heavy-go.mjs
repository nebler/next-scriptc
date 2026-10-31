// Bench-only packaging equivalent to adapter-vercel#147. Never imported by the product.
import { execFileSync } from "node:child_process";
import {
  mkdir,
  readFile,
  writeFile,
  chmod,
  symlink,
  rm,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
export const proxyCommit = "84878e532142f0ac584953695658b324eb9e5b80";
const root = fileURLToPath(new URL("../../../../", import.meta.url));
const run = (cmd, args, cwd, env = {}) =>
  execFileSync(cmd, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: "inherit",
  });
export async function addHeavyGo() {
  const output = path.join(root, ".vercel/output");
  const cache = path.join(root, ".vercel/heavy-proxy");
  await mkdir(cache, { recursive: true });
  let cached = false;
  try {
    cached =
      (await readFile(path.join(cache, "commit"), "utf8")).trim() ===
      proxyCommit;
  } catch {}
  const env = { GOOS: "linux", GOARCH: "amd64", CGO_ENABLED: "0" };
  if (!cached) {
    const source = path.join(cache, "source");
    await rm(source, { recursive: true, force: true });
    await mkdir(source, { recursive: true });
    run("git", ["init", "--quiet"], source);
    run(
      "git",
      ["remote", "add", "origin", "https://github.com/vercel/vercel.git"],
      source,
    );
    run(
      "git",
      ["sparse-checkout", "set", "internals/ipc-proxy/bootstrap"],
      source,
    );
    run(
      "git",
      [
        "fetch",
        "--quiet",
        "--depth=1",
        "--filter=blob:none",
        "origin",
        proxyCommit,
      ],
      source,
    );
    run("git", ["checkout", "--quiet", "--detach", "FETCH_HEAD"], source);
    run(
      "go",
      [
        "build",
        "-trimpath",
        "-ldflags=-s -w",
        "-o",
        path.join(cache, "executable"),
        ".",
      ],
      path.join(source, "internals/ipc-proxy/bootstrap"),
      env,
    );
    await writeFile(path.join(cache, "commit"), proxyCommit + "\n");
  }
  const func = path.join(output, "functions/api/heavy-go/csv.func");
  await mkdir(func, { recursive: true });
  run(
    "go",
    [
      "build",
      "-mod=readonly",
      "-buildvcs=false",
      "-trimpath",
      "-ldflags=-s -w",
      "-o",
      path.join(func, "user-server"),
      ".",
    ],
    path.join(root, "examples/demo/go"),
    env,
  );
  await writeFile(
    path.join(func, "executable"),
    await readFile(path.join(cache, "executable")),
  );
  for (const name of ["executable", "user-server"])
    await chmod(path.join(func, name), 0o755);
  await writeFile(
    path.join(func, ".vc-config.json"),
    JSON.stringify(
      {
        runtime: "executable",
        handler: "executable",
        architecture: "x86_64",
        regions: ["iad1"],
        memory: 2048,
        maxDuration: 300,
        supportsResponseStreaming: true,
      },
      null,
      2,
    ) + "\n",
  );
  for (const name of ["json", "thumbnail", "bcrypt", "diagnostics"])
    await symlink(
      "csv.func",
      path.join(output, `functions/api/heavy-go/${name}.func`),
    );
  const configFile = path.join(output, "config.json");
  const config = JSON.parse(await readFile(configFile));
  // These explicit routes precede Next's catch-all routing and preserve the public URL.
  config.routes.unshift(
    ...["csv", "json", "thumbnail", "bcrypt", "diagnostics"].map((name) => ({
      src: `^/api/heavy-go/${name}$`,
      dest: `/api/heavy-go/${name}`,
    })),
  );
  await writeFile(configFile, JSON.stringify(config, null, 2) + "\n");
  const hashes = {};
  for (const name of ["executable", "user-server"])
    hashes[name] = createHash("sha256")
      .update(await readFile(path.join(func, name)))
      .digest("hex");
  const metadata = {
    proxyCommit,
    go: execFileSync("go", ["version"], { encoding: "utf8" }).trim(),
    env,
    hashes,
    paths: ["csv", "json", "thumbnail", "bcrypt", "diagnostics"].map(
      (name) => `api/heavy-go/${name}`,
    ),
  };
  await writeFile(
    path.join(root, ".vercel/heavy-go-build.json"),
    JSON.stringify(metadata, null, 2) + "\n",
  );
  return metadata;
}
if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
)
  console.log(await addHeavyGo());
