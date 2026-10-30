// One registry for identical requests across direct and production surfaces.
// These are public parity-test fixtures, never production credentials.
export const serverEnv = {
  DEMO_JWT_NOW: "1793318400",
  DEMO_JWT_SECRET: "next-scriptc-parity-test-signing-secret-32-bytes",
};
// Precomputed HS256 token with the claims used by test/routes.mjs. Issuance is
// never part of the verify workload; the expected response is HTTP 200.
const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiZWRpdG9yIiwic3ViIjoidXNlci00MiIsImlzcyI6Im5leHQtc2NyaXB0Yy1kZW1vIiwiYXVkIjoiZGVtby1hcGkiLCJpYXQiOjE3OTMzMTg0MDAsImV4cCI6MTc5MzMyMjAwMH0.jWjMBQTutb4r9qu559CzLjdGnQumvGqhwkgXstKqKF8";
export const routes = [
  { id: "login", pattern: "/api/login", path: "/api/login", method: "POST",
    headers: { "content-type": "application/json" }, body: JSON.stringify({ email: " ADA@example.com ", password: "correct horse battery staple" }),
    category: "realistic", bounded: true },
  { id: "login-scrypt", pattern: "/api/login-scrypt", path: "/api/login-scrypt", method: "POST",
    headers: { "content-type": "application/json" }, body: JSON.stringify({ email: " ADA@example.com ", password: "correct horse battery staple" }),
    category: "realistic", bounded: true },
  { id: "verify", pattern: "/api/verify", path: "/api/verify", headers: { authorization: `Bearer ${token}` }, category: "realistic", cpuRequests: 400 },
  { id: "search", pattern: "/api/search", path: "/api/search?q=desk%20lamp&limit=7", category: "realistic", cpuRequests: 100 },
  { id: "markdown", pattern: "/api/posts/[slug]", path: "/api/posts/reliable-webhooks", category: "realistic", cpuRequests: 100 },
  { id: "feed", pattern: "/api/feed.xml", path: "/api/feed.xml", category: "realistic", cpuRequests: 100 },
  { id: "hello", pattern: "/api/hello", path: "/api/hello", category: "control", cpuRequests: 2000 },
  { id: "primes", pattern: "/api/primes", path: "/api/primes?limit=1000000", category: "synthetic", cpuRequests: 40 },
  { id: "csv", pattern: "/api/export", enabled: false, category: "refused", pending: "Papa Parse unparse refused in route probe; no CSV route exists" },
];
export const isolation = {
  // Compare synchronous bcrypt, production-style async scrypt and the CPU control.
  heavy: [routes[0], routes[1], { id: "primes", path: "/api/primes?limit=10000000", category: "synthetic" }],
  probes: [{ path: "/" }, { path: "/api/hello" }],
};
export const profiles = {
  sandbox: { coldRepeats: 3, repeats: 2, durationMs: 1000, warmupMs: 1000,
    concurrency: [1, 8, 64], isolationMs: 2000, idleMs: 300, threads: [1, 2, 4], cpuCap: 2000 },
  // One full plumbing pass, including every workload and thread variant.
  quick: { coldRepeats: 1, repeats: 1, durationMs: 400, warmupMs: 300,
    concurrency: [1, 8, 64], isolationMs: 800, idleMs: 150, threads: [1, 2, 4], cpuCap: 40 },
};
export const sectionNames = ["coverage", "cold", "direct", "production", "isolation", "threads"];
export function sectionsOption(value) {
  const sections = value ? value.split(",") : sectionNames;
  if (!sections.length || sections.some((name) => !sectionNames.includes(name))) throw new Error(`--sections must be comma-separated: ${sectionNames.join(",")}`);
  return [...new Set(["coverage", ...sections])];
}
// Both builds use the normal production Next CLI.
export function productionCommand({ next, port }) {
  return [next, "start", "-p", String(port), "-H", "127.0.0.1"];
}
