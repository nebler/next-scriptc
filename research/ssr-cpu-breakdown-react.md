# React SSR CPU, measured locally

This experiment asks whether compiling React JSX into escaped HTML strings has enough server CPU headroom to justify a prototype. It measures production document requests, a controlled 500-row fixture, and two locally runnable open-source apps. It does not use native compilation or scriptc.

A small React Router SSR transform prototype is worth testing. The controlled Router page spends 56.6% of sampled non-idle main-thread time in Fizz, and Epic's real users page spends 24.0%. The byte-identical synthetic ceiling cuts render CPU from 1.326 to 0.497 ms, a 62.5% reduction and 2.67× speedup. Applying that reduction only to Epic's measured Fizz share gives a scenario of 15.0% less request CPU, or 1.18× capacity. This is a scenario, not a measured compiler gain.

Do not build a broad Next rendering product on this evidence. Fizz is 10.8% of the Next synthetic profile and 11.4% of the blog profile; Flight is 45.9% and 34.7%, respectively. The same Fizz-only scenario saves 6.7% and 7.1% of request CPU. Eliminating Fizz entirely would save only those 10.8% and 11.4% shares before any allocation or component-construction effects. A transform must preserve RSC, suspense, and hydration semantics, and it cannot assume it removes Flight.

The next useful experiment is a bounded React Router transform that proves identical HTML on this fixture and Epic, then measures whole-request CPU. The current evidence supports that experiment, not a claim of a production rendering product. Epic still has 21.9% unclassified self time and the sample is small. No remote-database application was measured.

## What was measured

The host was an Apple M4 Pro, 24 GiB RAM, macOS 26.6.1, Darwin 25.6.0, arm64. Every measured server and the load generator used Node 24.22.0. This was a shared interactive desktop, with unrelated Lean compilation, browser, Discord, and system activity observed. No unrelated process was stopped. These are local results, not isolated-host capacity estimates.

The synthetic builds used Next 16.4.2 App Router, React and React DOM 19.3.1, React Router 7.16.0 framework mode, and Vite 7.3.1. Next used a production webpack build with two build workers. React Router used a production Vite build. Both serve fresh documents; Next explicitly disables static rendering and revalidation. Data generation runs in memory on every render. The [fixture specification](prototypes/ssr-profile/SPEC.md) and [reproduction guide](prototypes/ssr-profile/README.md) define the shared data, component boundaries, HTML, builds, and commands.

The fixture has a static header, navigation, footer, marketing paragraph, 50 sidebar links, and 500 table rows with nested row, cell, and badge components. Names exercise all five HTML escape characters. Both plain React renderers and the concatenation renderer generate the same main subtree. Framework wrappers, hydration scripts, and Flight bytes remain in the measured responses.

The real applications are:

- [Epic Stack](https://github.com/epicweb-dev/epic-stack/tree/893610db76127fb5a5f1ffa786bee6b050637429), MIT, revision `893610db76127fb5a5f1ffa786bee6b050637429`. `/users` renders a real Prisma SQLite query and the existing user-card components. The database contains 100 deterministic local users; the existing query limits the response to 50. No route or renderer source changed. The normal rate limiter was raised through its existing test environment setting. The app uses React Router 7.16.0, React 19.2.4, Prisma 6.19.2. Its Node engine declaration is 22; npm warned, but the build and measured runtime succeeded on the required Node 24.
- [Tailwind Next.js Starter Blog](https://github.com/timlrx/tailwind-nextjs-starter-blog/tree/b45bef66b40c63b6f57c15ee8cd090682238df4c), MIT, revision `b45bef66b40c63b6f57c15ee8cd090682238df4c`. `/blog/` renders the bundled local MDX content and existing tags, navigation, and post list. Contentlayer generated 13 documents. Root layout configuration forces dynamic rendering, and the Google font download was replaced with an empty font variable. The production build reports `/blog` dynamic. The app uses Next 15.5.12 and React 19.2.4. This is a public content app, not a database dashboard; its client components still render post content into the initial HTML.

[Umami](https://github.com/umami-software/umami/tree/559e3c607c23d2c72d9bd4f6481bda428255323c) was cloned and screened before installation. Its dashboard entry delegates to client components with client-loaded board data. Measuring an empty dashboard shell would not answer the seeded data-rendering question. It was replaced with the blog rather than attempting login or remote services. These two measured apps are a starter and a content site; they do not establish the CPU distribution of business applications with slow databases.

## CPU and latency method

A separate Node process drives HTTP/1.1 loopback keepalive requests, consumes every response body, and sends `Accept-Encoding: identity`. No assets or client-side requests are fetched. Each concurrency has two seconds of warmup followed by three three-second blocks. Concurrency 1 precedes 16. Blocks are not randomized. There is no coordinated-omission correction because this is a closed-loop concurrency experiment, not an open-loop traffic simulation.

The server reports `process.cpuUsage()` over an IPC control channel at the block boundaries. CPU milliseconds per response include user and system CPU for the server process, including native threads. They exclude the load generator and any separate processes. Throughput and latency include scheduling, loopback, response transfer, and I/O waits. A separate eight-second concurrency-16 block captures V8 inspector samples at a requested 1 ms interval, after two more seconds of warmup. Startup, build, warmup, and profile serialization are outside the timed measurement blocks. No task build, install, or other target runs during a timed block.

The [raw results](ssr-profile-react-results/) retain all per-request latencies, HTTP status counts, process CPU deltas, raw profiles, mapped profiles, build logs, install provenance, and failed attempts. No outlier or slow block is filtered. Every measured response must be checked through the recorded status counts. The throughput table gives the median and min/max across three blocks; latency columns give the median of the three block quantiles. `N` is the total response count across those blocks. The in-process ceiling has five blocks of 2,000 renders per renderer after 500 warmup renders.

## Throughput and wall latency

| Page | C | N | CPU ms/req median [min,max] | req/s median [min,max] | p50 ms | p95 ms |
|---|---:|---:|---:|---:|---:|---:|
| plain-string | 1 | 5807 | 1.46 [1.46, 1.46] | 644.80 [642.41, 647.67] | 1.54 | 1.64 |
| plain-string | 16 | 6030 | 1.52 [1.46, 1.62] | 665.01 [638.05, 691.65] | 23.00 | 43.23 |
| plain-stream | 1 | 3826 | 2.27 [2.25, 2.34] | 427.67 [417.54, 429.48] | 2.32 | 2.47 |
| plain-stream | 16 | 4197 | 2.23 [2.23, 2.24] | 461.03 [458.80, 463.91] | 32.80 | 56.25 |
| concat | 1 | 12849 | 0.63 [0.62, 0.63] | 1425.52 [1411.56, 1445.53] | 0.69 | 0.76 |
| concat | 16 | 15265 | 0.59 [0.59, 0.59] | 1690.34 [1689.77, 1692.76] | 8.84 | 17.56 |
| next | 1 | 646 | 16.89 [16.61, 16.91] | 71.67 [70.80, 72.08] | 11.55 | 24.55 |
| next | 16 | 745 | 15.13 [14.90, 15.30] | 80.53 [80.09, 80.70] | 197.90 | 218.36 |
| router | 1 | 3408 | 2.68 [2.66, 2.86] | 384.51 [365.86, 385.08] | 2.53 | 2.98 |
| router | 16 | 3634 | 2.70 [2.67, 2.76] | 404.63 [385.44, 406.62] | 38.41 | 45.51 |
| epic-users | 1 | 3914 | 2.52 [2.47, 2.75] | 437.08 [421.62, 445.65] | 2.18 | 3.13 |
| epic-users | 16 | 4714 | 2.31 [2.24, 2.61] | 517.22 [508.80, 531.87] | 30.47 | 33.62 |
| blog | 1 | 2346 | 4.34 [4.32, 4.85] | 262.10 [251.47, 267.77] | 3.56 | 5.94 |
| blog | 16 | 2634 | 4.14 [3.97, 4.20] | 289.32 [288.57, 292.82] | 54.60 | 61.58 |

## Category split and byte-identical ceiling

Percent of non-idle main-thread sample weight in fresh, bounded profile captures:

| Page | HTML | Flight | App | JSON/serial | Data | Routing | HTTP | GC | Other |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| plain-string | 59.9 | 0.0 | 19.5 | 0.0 | 0.0 | 4.8 | 3.0 | 1.3 | 11.6 |
| plain-stream | 62.2 | 0.0 | 9.6 | 0.0 | 0.0 | 6.0 | 12.9 | 3.1 | 6.2 |
| concat | 0.0 | 0.0 | 86.3 | 0.0 | 0.0 | 0.0 | 3.0 | 0.9 | 9.8 |
| next | 10.8 | 45.9 | 3.7 | 0.0 | 0.0 | 7.1 | 5.8 | 21.7 | 5.0 |
| router | 56.6 | 0.0 | 9.7 | 0.1 | 0.0 | 7.6 | 13.0 | 1.9 | 11.1 |
| epic-users | 24.0 | 0.0 | 2.8 | 2.3 | 1.6 | 28.5 | 12.6 | 6.3 | 21.9 |
| blog | 11.4 | 34.7 | 15.2 | 0.0 | 0.0 | 14.5 | 11.0 | 4.4 | 8.9 |


The concat renderer's custom HTML construction is classified as application code because it lives in the shared fixture, while the HTML column specifically identifies React DOM server work. Zero in that column does not mean concat builds no HTML. Values rounded to one decimal may not total exactly 100. Zero means no sampled weight under the rule, not proof that no work occurs.

The in-process ceiling includes fresh deterministic data generation for each render. Both renderers emit exactly 107,536 UTF-8 bytes with SHA-256 `ad2d3e2588bb278254c39605bfb2390f56acda8f070691eace1cb2dd86b799c9`. There is no normalization or marker removal.

| Renderer | N | CPU ms/render median [min,max] | Wall ms/render median |
|---|---:|---:|---:|
| React `renderToString` | 10,000 | 1.3257 [1.3210, 1.3299] | 1.3206 |
| Escaped concatenation | 10,000 | 0.4972 [0.4923, 0.4999] | 0.4969 |

This saves 0.8285 CPU ms/render. Over HTTP at concurrency 1, the corresponding medians are 1.46 versus 0.63 CPU ms/request. The streaming React baseline is 2.27 CPU ms/request. These are separate runs, not paired differences.

Next's main subtree matches the canonical HTML exactly, with 255,744 extra response bytes for framework content and Flight. React Router's main subtree also matches, with 2,639 extra bytes. Both plain React string and stream outputs match the concatenation output in full. The real apps have their own layouts and data and are not compared against the synthetic canonical HTML.

Applying the ceiling's 62.5% reduction only to the HTML column gives illustrative CPU savings of 35.4% for synthetic Router, 15.0% for Epic, 6.7% for synthetic Next, and 7.1% for the blog. These calculations assume the sampled shares represent CPU shares and the reduction transfers to each renderer. Neither assumption has been established. They do not include changes in component construction, Flight, or GC.

## How samples become categories

Attribution is self time only. Each sample's `timeDelta` goes to its leaf frame, never to every ancestor. Fresh profile captures exclude only time outside explicit server-side monotonic start and stop timestamps. This removes inspector startup and shutdown, whose self frames otherwise diluted the split, especially in Epic. Original captures remain in the raw results. Every interval is clipped to these timestamps, with excluded microseconds reported. Idle samples are retained separately and excluded from percentage denominators. This produces a split of non-idle main-thread sample weight, not a direct measurement of each category's operating-system CPU. V8 sample intervals can include descheduling, and native worker CPU is missing from the JavaScript profile. The profile CPU and wall table below makes that difference visible.

Rules run in this order in [attribute.mjs](prototypes/ssr-profile/attribute.mjs):

1. V8 idle and garbage-collector pseudo-frames become idle and GC.
2. React server DOM package paths become Flight serialization.
3. React DOM server package paths become HTML rendering, including Fizz tree traversal, escaping, and HTML emission.
4. JSON, serialize, stringify, devalue, and turbo-stream names or paths become JSON/serialization.
5. Prisma, SQLite, query engine, PostgreSQL protocol, and driver paths become data access.
6. Node HTTP, streams, net, TLS, buffer, zlib, encoding paths, and native write/encoding function names become HTTP/streams.
7. Shared fixture code, application paths, and application build output become application component/helper code.
8. Next distribution and source paths, React Router, Express, router, and React core package paths become routing/framework runtime.
9. Remaining native, V8, bootstrap, timer, and unclassified frames become other.

Next's production bundle contains both Fizz and Flight, so its filename alone cannot split them. [remap.mjs](prototypes/ssr-profile/remap.mjs) resolves frame positions through the exact installed source maps before applying these rules. Both original and generated package paths remain available, so Prisma ownership survives source-map paths that omit the package name. It retains generated frame positions and the raw profiles. Vite application bundles are mapped similarly. Unknown or unmapped frames remain in their broad URL category. Function names help identify serialization but do not prove semantic ownership. React core element creation is in framework runtime; application data generation and escaping helpers are in application. GC is not assigned to the code that allocated objects. A JSX compiler could remove some of that work, so the HTML column alone is not the entire potential saving.

| Page | Profile N | Wall ms | Process CPU ms | Active sample ms | Idle sample ms | Boundary-excluded ms | Mapped/total frame nodes |
|---|---:|---:|---:|---:|---:|---:|---:|
| plain-string | 5406 | 8023.7 | 8177.4 | 7980.6 | 44.8 | 51.2 | 0/330 |
| plain-stream | 3405 | 8036.0 | 8505.3 | 8014.0 | 22.9 | 51.9 | 0/330 |
| concat | 13312 | 8009.6 | 8186.8 | 7989.2 | 25.0 | 28.9 | 0/103 |
| next | 605 | 8069.9 | 10039.5 | 8061.1 | 10.1 | 86.3 | 1393/1955 |
| router | 3081 | 8038.6 | 8750.0 | 8001.6 | 38.0 | 105.8 | 16/1013 |
| epic-users | 3508 | 8041.4 | 11060.4 | 7986.2 | 56.6 | 363.7 | 197/2215 |
| blog | 2224 | 8023.6 | 9946.8 | 7991.2 | 32.7 | 183.4 | 2624/3808 |

All throughput and profile responses returned HTTP 200. The initial Epic readiness failure is a separate retained artifact and contributes no timing blocks. Profile captures were restarted with two seconds of warmup; throughput blocks remain the original three-block runs. Process CPU can exceed wall time because it counts multiple native and GC threads. Main-thread sample time remains close to the eight-second wall window. Do not scale these percentages directly into per-category process CPU milliseconds.

Idle weight is below 57 ms in every eight-second profile. These warm, local data and content routes do not exhibit large I/O waits. Epic's small data-access self share includes the Prisma JavaScript side, but not an attribution of its native engine threads. The distinction matters: 11.1 seconds of process CPU occurred in its 8.0-second profile window.

## Limits on the decision

The hand-written renderer removes React component dispatch and element construction as well as the HTML walk. It is an optimistic empirical ceiling for the complete synthetic render, not proof that a practical compiler can preserve React semantics at that speed. The same concatenation renderer does not replace Flight, routing, suspense, hydration, loaders, ORM, or framework scripts. End-to-end gains cannot be inferred by substituting the entire plain React speedup into a Next request.

Source maps classify sampled locations, not causality. Inlined functions, generated code, minified names without mappings, native string operations, and garbage collection limit precision. Prisma's native engine may spend CPU on worker threads which the main-thread inspector cannot attribute. Database wall waits appear in latency and idle gaps rather than data-access self time. Neither a small data-access sample share nor low idle time on these warm local fixtures establishes the cost of a production database.

The load generator shares the host with the server. The fastest concatenation target can be affected by client CPU and response transfer. Measurements run in a fixed order and can drift with temperature or desktop activity. Three short blocks describe this run's spread, not a population confidence interval. There is one process per target, one host, one main data size, no browser hydration measurement, and one app per framework. No framework's default cached or statically generated performance is being evaluated.

The first ceiling pilot accidentally loaded development React and was stopped before producing results. A production-mode assertion now prevents that mistake. Initial Epic installs failed because npm did not read the clone's peer-dependency settings when invoked with `--prefix`; installation succeeded from its directory with the explicit setting. The first blog build failed on whitespace lint after the font patch and was corrected. The React Router process needed a forced stop after results were saved because its shutdown retained IPC. The runner now disconnects IPC and bounds shutdown. Epic also failed its first readiness check because production cache setup required `LITEFS_DIR`; the local SQLite directory satisfied that requirement, and the failed response log was retained. These events are retained in [attempts.json](ssr-profile-react-results/attempts.json).

All third-party clones, node installations, package cache, and builds were kept under `/tmp/nsc-ssr-r1/` and removed after results were saved. No third-party application source, dependencies, or build output is committed. No Docker, login, account call, deploy, hosting call, push, PR, issue, or public post was used.

Validation passed for 42 throughput blocks and seven bounded profile captures, all HTTP 200, five canonical HTML checks, all gzip round trips, and two attribution tests. `node scripts/compress-artifacts.mjs --check`, `node scripts/check-research-links.mjs`, and `git diff --cached --check` passed. The link check covered 1,000 relative research links.
