// Two previews only; no aliases, project changes or production deployments.
import { execFileSync } from "node:child_process";
import { readFile, writeFile, access } from "node:fs/promises";
const prefix = "research/benchmarks/heavy-deployments.json";
try {
  await access(prefix);
  throw new Error("Deployments already started; inspect retained identities");
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
const cli = (args) =>
  JSON.parse(
    execFileSync("vercel", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"],
    }),
  );
const project = JSON.parse(await readFile(".vercel/project.json"));
const selected = cli(["project", "inspect", "--non-interactive", "--json"]);
if (
  JSON.stringify(selected).includes(project.projectId) === false ||
  project.projectName !== "next-scriptc"
)
  throw new Error("Project target mismatch");
const data = {
  sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  status: "running",
  previews: [],
  invocationLimit: 20000,
  previewLimit: 8,
};
async function save() {
  await writeFile(prefix, JSON.stringify(data, null, 2) + "\n");
}
await save();
try {
  for (const variant of ["node", "native"]) {
    const env = {
      ...process.env,
      NEXT_SCRIPTC_BASELINE: variant === "node" ? "node" : "",
      NEXT_SCRIPTC_DEMO_GROUPS: variant === "native" ? "vercel" : "",
      HEAVY_GO_BENCH: variant === "native" ? "1" : "",
      SCRIPTC_CHECKER_SERVER: "0",
    };
    try {
      execFileSync(
        process.execPath,
        ["examples/demo/bench/vercel/deploy.mjs"],
        { env, stdio: "inherit" },
      );
    } finally {
      const accepted = JSON.parse(
        await readFile(`.vercel/${variant}-accepted.json`),
      );
      if (accepted.sourceCommit === data.sourceCommit) {
        data.previews.push({ variant, ...accepted });
        await save();
      }
    }
    const metadata = JSON.parse(
      await readFile(`.vercel/${variant}-deployment.json`),
    );
    data.previews.at(-1).metadata = metadata;
    await save();
  }
  const node = data.previews.find((p) => p.variant === "node"),
    native = data.previews.find((p) => p.variant === "native");
  const targets = [
    {
      variant: "node",
      url: node.url,
      prefix: "/api/heavy/",
      deploymentId: node.id,
    },
    {
      variant: "native",
      url: native.url,
      prefix: "/api/heavy/",
      deploymentId: native.id,
    },
    {
      variant: "go",
      url: native.url,
      prefix: "/api/heavy-go/",
      deploymentId: native.id,
    },
  ];
  for (const t of targets) {
    const preview = data.previews.find((p) => p.id === t.deploymentId);
    const info = preview.metadata.deployed;
    const funcs = info.builds
      .flatMap((b) => b.output ?? [])
      .filter((o) => o.lambda);
    const names = new Set(funcs.map((o) => o.lambda.functionName));
    if (names.size > 12) throw new Error("Hobby function limit");
    let name;
    t.functions = funcs
      .filter((o) => o.path.startsWith(t.prefix.slice(1)))
      .map((o) => ({ path: o.path, ...o.lambda }));
    for (const route of ["csv", "json", "thumbnail", "bcrypt", "diagnostics"]) {
      const fn = t.functions.find((o) => o.path === t.prefix.slice(1) + route);
      if (
        !fn ||
        fn.runtime !== (t.variant === "node" ? "nodejs24.x" : "executable") ||
        fn.memorySize !== 2048 ||
        fn.timeout !== 300 ||
        fn.deployedTo?.join() !== "iad1"
      )
        throw new Error("Function mapping/resources mismatch");
      if (name && name !== fn.functionName)
        throw new Error("Diagnostic must share workload Function");
      name = fn.functionName;
    }
  }
  const remote = cli(["api", `/v9/projects/${project.projectId}`]);
  data.platform = { resourceConfig: remote.resourceConfig };
  await writeFile(
    ".vercel/heavy-job.json",
    JSON.stringify(
      { sourceCommit: data.sourceCommit, targets, platform: data.platform },
      null,
      2,
    ) + "\n",
  );
  data.status = "complete";
} catch (e) {
  data.status = "failed";
  data.error = e.stack;
  throw e;
} finally {
  await save();
}
