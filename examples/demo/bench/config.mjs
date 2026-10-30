// This is the only workload registry. Keep requests and inputs identical in all
// four surfaces. A new workload must have deterministic output and be validated
// before any timings are accepted. Pin clocks/keys when configuring JWT fixtures.
export const routes = [
  { id: "hello", pattern: "/api/hello", path: "/api/hello", category: "control", cpuRequests: 1000 },
  { id: "primes", pattern: "/api/primes", path: "/api/primes?limit=1000000", category: "synthetic", cpuRequests: 100 },
  // Integration placeholders: confirm the route author's URL, input, and output
  // contract before enabling. These are deliberately not guessed or auto-enabled.
  { id: "login", pattern: "/api/login", path: "/api/login", method: "POST",
    headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "ada@example.com", password: "correct horse battery staple" }),
    enabled: false, category: "realistic", pending: "clock/key configured; integrated parity pending; budget cost-10 native bcrypt before high concurrency or 20 cold requests" },
  { id: "search", pattern: "/api/search", path: "/api/search?q=desk%20lamp&limit=20", cpuRequests: 200,
    enabled: false, category: "realistic", pending: "representative request supplied by route owner; enable after integrated HTTP parity" },
  { id: "markdown", pattern: "/api/posts/[slug]", path: "/api/posts/reliable-webhooks", cpuRequests: 200,
    enabled: false, category: "realistic", pending: "representative request supplied by route owner; enable after integrated HTTP parity" },
  { id: "feed", pattern: "/api/feed.xml", path: "/api/feed.xml", cpuRequests: 100,
    enabled: false, category: "realistic", pending: "representative request supplied by route owner; enable after integrated HTTP parity" },
  { id: "csv", pattern: "/api/export", enabled: false, category: "realistic", pending: "Papa Parse unparse refused in route probe; no CSV route exists" },
  { id: "jwt", pattern: "/api/verify", path: "/api/verify", enabled: false, category: "realistic", pending: "add valid precomputed Bearer token for serverEnv clock/key; do not benchmark the 401 fast path" },
];

// Public test fixtures, never production credentials. Every benchmark server
// receives the same clock/key, so future login tokens remain byte-comparable.
export const serverEnv = {
  DEMO_JWT_NOW: "1793318400",
  DEMO_JWT_SECRET: "next-scriptc-public-benchmark-fixture-key-32-bytes",
};

export const isolation = {
  heavy: { path: "/api/primes?limit=10000000" },
  probes: [{ path: "/" }, { path: "/api/hello" }],
  // Replace heavy with the configured login request once integrated. Keep the
  // synchronous primes control too if the login implementation is asynchronous.
};

export const profiles = {
  full: { coldRepeats: 20, repeats: 3, durationMs: 2000, warmupMs: 1000,
    concurrency: [1, 8, 64], isolationMs: 5000, idleMs: 500, threads: [1, 2, 4] },
  // A short plumbing check on a loaded developer machine, never publishable.
  quick: { coldRepeats: 2, repeats: 2, durationMs: 300, warmupMs: 150,
    concurrency: [1, 8, 64], isolationMs: 1500, idleMs: 150, threads: [1, 2, 4] },
};
