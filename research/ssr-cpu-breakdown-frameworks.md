# SSR CPU beyond React

This extends the [React CPU report](ssr-cpu-breakdown-react.md) with Astro Node SSR, SvelteKit adapter-node on Svelte 5, and Nuxt Vue SSR on Nitro node-server. All numbers are local observations on a shared Apple M4 Pro desktop, not framework capacity claims.

Svelte 5 demonstrates useful compile-to-HTML headroom on this fixture. Its isolated render costs 0.579 CPU ms versus fresh React's 1.351 ms, a 57.1% reduction. Vue costs 2.068 ms, 53.1% more than React despite its compiled SSR templates. Compilation alone does not guarantee lower render CPU when thousands of native component instances retain setup and props machinery. A bounded React Router transform remains worth prototyping; these results do not justify a general Next Fizz-only product.

## Same fixture and measurement method

The [specification](prototypes/ssr-profile/SPEC.md) is unchanged. Each request generates 500 records and renders native Row, Cell, and Badge components, plus the same static header, sidebar links, paragraph, table, and footer. Each framework serves fresh HTML in production. Astro uses `output:server` and `prerender=false`; SvelteKit disables prerendering; Nuxt uses SSR and disables route caching. No data or rendered-document cache is added. All data stays local.

The same [runner](prototypes/ssr-profile/run.mjs), load generator, IPC CPU controller, interval clipping, source-map remapper, and summarizer serve both reports. The new dependency graph lives separately in `frameworks/`, with a compressed pinned lock. The old React dependency graph is unchanged. npm initially wrote framework lock package keys through macOS's `/tmp` alias; only those location keys were normalized, preserving versions and integrity values. The original lock is retained, and an offline `npm ci --dry-run` passes for the portable lock. The [reproduction guide](prototypes/ssr-profile/README.md) gives build, run, ceiling, and real-app commands.

Every server and load generator used Node 24.22.0. Warmup lasts two seconds at each concurrency, followed by three three-second blocks at concurrency 1, then 16. A separate eight-second concurrency-16 profile follows two seconds of warmup. Full response bodies are consumed over HTTP/1.1 keepalive with identity encoding. No task build or install overlaps timing, and targets run sequentially. No blocks are excluded. All timed responses, profile responses, and retained warmup responses must pass the [artifact audit](ssr-profile-frameworks-results/audit.json).

CPU is server-process user plus system time divided by response count. Latency and throughput are client wall measurements. Native-thread CPU contributes to process CPU but not the inspector's main-isolate categories. Profile shares are non-idle self-sample weights, not measured fractions of process CPU. They must not be multiplied into process CPU to claim measured category milliseconds.

The host matches the earlier report: Apple M4 Pro, 24 GiB, macOS 26.6.1, arm64. [Host metadata](ssr-profile-frameworks-results/host.json), per-block top-process snapshots, and ceiling snapshots retain observed activity. Desktop applications, audio/camera services, WindowServer, virtualization, and system protection activity appear. No unrelated process was stopped. Fresh React and concat render ceilings and concat HTTP measurements check drift. Next and React Router are labeled as earlier-run measurements and were not rebuilt or rerun. Their timing is contextual, not a paired experiment.

Pinned synthetic versions: `astro` 7.4.5, `@astrojs/node` 11.1.9, `@sveltejs/kit` 3.1.1, `@sveltejs/adapter-node` 6.0.1, `svelte` 5.57.3, `nuxt` 4.6.4, `vue` 3.5.44, `vite` 8.3.5.

## Canonical HTML equivalence

All three main subtrees normalize to the canonical 107,536 UTF-8 bytes. Normalization is outside every timed response and render loop. The [normalizer](prototypes/ssr-profile/normalize.mjs) removes only recognized empty and fragment comments, decodes the listed five-character entity spellings, then re-escapes text and href attributes with the canonical escape function. It does not strip whitespace, change element order, remove arbitrary attributes, or discard unknown comments. No hydration attributes or whitespace differences needed removal. Original responses, main hashes, byte counts, recognized comment sets, and equality flags are retained. React and concat still require exact equality without normalization.

| Framework | Raw main bytes | Extra document bytes | Precisely observed differences |
|---|---:|---:|---|
| Astro | 106,536 | 80 | 1,000 apostrophes use `&#39;` instead of `&#x27;`; no comments |
| SvelteKit | 113,565 | 1,487 | 2,500 empty comments, two opening and two closing fragment anchors; text leaves 501 greater-than signs, 1,000 double quotes, and 1,000 apostrophes literal |
| Nuxt | 106,568 | 1,250 | Two opening and two closing fragment anchors; 1,000 apostrophes use `&#39;` instead of `&#x27;` |

Svelte escapes fewer text characters than canonical concat. That is semantically valid HTML, but it reduces escaping work as well as changing the rendering machinery. The speed difference cannot be assigned entirely to compilation. The exact original responses are the `*.response.html.gz` files in [raw results](ssr-profile-frameworks-results/).

## Synthetic request comparison

| Framework/run | CPU ms/req C1 / C16 | req/s C1 / C16 | Response bytes | Isolated render CPU ms |
|---|---:|---:|---:|---:|
| Next, earlier run | 16.894 / 15.133 | 71.67 / 80.53 | 363,280 | 1.326† |
| React Router, earlier run | 2.680 / 2.704 | 384.51 / 404.63 | 110,175 | 1.326† |
| Astro, new | 2.425 / 2.308 | 414.62 / 453.33 | 106,616 | 2.486‡ |
| SvelteKit, new | 1.305 / 1.118 | 774.12 / 920.65 | 115,052 | 0.579 |
| Nuxt, new | 3.774 / 3.789 | 277.22 / 292.43 | 107,818 | 2.068 |
| Concat, new | 0.620 / 0.591 | 1432.39 / 1702.86 | 107,536 | 0.496–0.608 |

† Historical plain React renderToString ceiling for the same main tree, not a separately isolated Next or Router render. Next Flight and framework wrappers are excluded from that ceiling. Fresh plain React is 1.351 ms. ‡ Astro container renders the entire tiny fixture document and extracts main. A pure main-only Astro cost is not available. Concat range spans the four fresh paired ceiling medians, not a confidence interval.

## Throughput and latency for every new target

Medians and min/max are across all three blocks. p50 and p95 are medians of block quantiles. Closed-loop latency has no coordinated-omission correction. Real apps have different data and markup and cannot rank the frameworks against one another.

| Page | C | N | CPU ms/req median [min,max] | req/s median [min,max] | p50 ms | p95 ms |
|---|---:|---:|---:|---:|---:|---:|
| astro-paper | 1 | 1647 | 5.63 [5.58, 5.83] | 182.60 [181.54, 184.01] | 5.02 | 5.82 |
| astro-paper | 16 | 1742 | 5.60 [5.58, 5.63] | 188.02 [187.88, 189.46] | 82.98 | 124.54 |
| astro | 1 | 3703 | 2.43 [2.39, 2.49] | 414.62 [396.74, 422.64] | 2.35 | 2.67 |
| astro | 16 | 4126 | 2.31 [2.31, 2.32] | 453.33 [453.25, 453.40] | 34.86 | 47.55 |
| concat | 1 | 12942 | 0.62 [0.62, 0.62] | 1432.39 [1432.11, 1448.73] | 0.69 | 0.75 |
| concat | 16 | 15356 | 0.59 [0.59, 0.59] | 1702.86 [1695.50, 1704.67] | 8.76 | 17.41 |
| dashboard | 1 | 609 | 20.60 [18.87, 20.94] | 66.93 [66.12, 69.60] | 13.91 | 19.83 |
| dashboard | 16 | 661 | 19.41 [18.63, 19.48] | 71.97 [69.39, 72.69] | 217.63 | 245.25 |
| nuxt | 1 | 2476 | 3.77 [3.71, 3.84] | 277.22 [268.99, 278.33] | 3.55 | 4.07 |
| nuxt | 16 | 2629 | 3.79 [3.63, 3.84] | 292.43 [282.49, 296.81] | 46.07 | 89.19 |
| svelte | 1 | 7014 | 1.30 [1.30, 1.32] | 774.12 [765.85, 797.64] | 1.22 | 1.49 |
| svelte | 16 | 8387 | 1.12 [1.08, 1.20] | 920.65 [919.19, 940.06] | 16.23 | 31.81 |

## Where sampled time goes

The original columns remain HTML, Flight, application, framework serialization, data, routing, HTTP, GC, and other. Flight is zero for the new frameworks. Serialization includes devalue, Nuxt payload helpers, Svelte serialization helpers, and Astro prop serialization. Zero means no sample weight matched, not proof of no work.

New HTML rules cover Astro server render runtime, Svelte server runtime and escaping, Vue server-renderer and shared escaping, and source-mapped native `.astro`, `.svelte`, and `.vue` template code. Compiled templates emit HTML inside component functions, so omitting those functions would make compiled rendering appear free. These functions can also contain component setup. Shared data generation remains application code where source maps identify it. React retains its earlier division between Fizz and application component functions. The HTML column is therefore an operational rendering-pass category, not an exact cross-framework instruction taxonomy. The new rules have regression tests alongside the original Flight, Fizz, interval, and package-ownership tests.

| Page/run | HTML | Flight | App | Framework serial | Data | Routing | HTTP | GC | Other |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Next, earlier | 10.8 | 45.9 | 3.7 | 0.0 | 0.0 | 7.1 | 5.8 | 21.7 | 5.0 |
| Router, earlier | 56.6 | 0.0 | 9.7 | 0.1 | 0.0 | 7.6 | 13.0 | 1.9 | 11.1 |
| astro | 52.9 | 0.0 | 8.0 | 0.0 | 0.0 | 23.9 | 7.5 | 3.3 | 4.5 |
| svelte | 41.8 | 0.0 | 18.7 | 0.2 | 0.0 | 21.4 | 10.0 | 2.0 | 5.9 |
| nuxt | 22.4 | 0.0 | 3.8 | 0.5 | 0.0 | 65.1 | 1.2 | 3.5 | 3.5 |
| astro-paper | 5.9 | 0.0 | 78.0 | 0.0 | 0.0 | 1.9 | 1.2 | 1.2 | 11.8 |
| dashboard | 10.2 | 0.0 | 13.5 | 1.1 | 0.0 | 49.2 | 1.4 | 8.2 | 16.4 |
| concat | 0.0 | 0.0 | 87.4 | 0.0 | 0.0 | 0.0 | 2.3 | 1.2 | 9.1 |

| New page | Profile N | Wall ms | Process CPU ms | Active sample ms | Idle ms | Excluded ms | Mapped/total nodes |
|---|---:|---:|---:|---:|---:|---:|---:|
| astro | 3472 | 8033.6 | 8740.6 | 7998.9 | 36.3 | 112.0 | 132/369 |
| svelte | 7329 | 8016.4 | 8389.9 | 7968.9 | 49.5 | 129.5 | 146/336 |
| nuxt | 2279 | 8037.6 | 8668.2 | 8012.1 | 25.5 | 84.8 | 6/793 |
| astro-paper | 1529 | 8083.8 | 8570.9 | 8071.8 | 12.5 | 78.0 | 401/894 |
| dashboard | 568 | 8137.3 | 11289.3 | 8120.9 | 15.6 | 242.4 | 1377/9037 |
| concat | 13551 | 8010.1 | 8085.6 | 7978.9 | 36.0 | 32.4 | 0/58 |

Final tables use the standalone remapped attribution files. Inline attribution in raw captures retains the rules that existed at capture time. Day.js, date-fns, and UI class helpers are application work; mapped framework package ownership takes priority over a generated application build path.

No inference assigns GC back to a renderer. Native string operations and unmapped frames remain other where ownership is unknown. Inlining can move work into compiled template frames. AstroPaper's build warns about imperfect transition source maps. Mapped profiles and original generated frames remain available for review; no raw samples are replaced or dropped. Unlike the React report's additional steady captures, these new profiles use the runner's already-bounded first capture after all throughput blocks.

## Isolated rendering against escaped concat

The generalized ceiling script uses five blocks of 2,000 renders after 500 warmups for each renderer. Every render generates fresh data. Verification happens once before timing. Each new ceiling run also measures canonical concat in the same process. Awaiting a result supports Vue and Astro's asynchronous renderer APIs; the fresh React and concat loops use the same await path.

| Isolated target | Render CPU ms median [min,max] | Paired concat CPU ms | Render/concat | Wall ms/render median |
|---|---:|---:|---:|---:|
| react | 1.3509 [1.3465, 1.3536] | 0.4962 | 2.72× | 1.3444 |
| svelte | 0.5790 [0.5767, 0.5904] | 0.4984 | 1.16× | 0.5710 |
| vue | 2.0679 [2.0476, 2.1814] | 0.5030 | 4.11× | 2.0153 |
| astro | 2.4860 [2.3892, 2.5671] | 0.6076 | 4.09× | 2.3244 |

The fresh React median is 1.9% above the earlier 1.3257 ms; paired concat is 0.2% below the earlier 0.4972 ms. New concat HTTP medians are 0.620 and 0.591 CPU ms/request versus earlier 0.63 and 0.59. These anchors support retaining the historical request rows with explicit labels. The last Astro ceiling's paired concat rises to 0.608 ms, about 22% above the other paired concat medians. It is retained without filtering; late host drift limits the precision of the Astro comparison.

Svelte and Vue use production Vite SSR compilation of the fixture's native components, preserving every Row, Cell, and Badge boundary. Vue includes `createSSRApp` and `renderToString` for each render. Svelte uses `svelte/server` render. Astro uses a reusable container to render the built index document, then extracts main. That Astro number includes the container, document wrapper, and extraction overhead; a pure main-subtree number was not isolated. None includes HTTP, routing, hydration execution, or state-payload emission by the full framework. The compiler already turns Svelte and Vue templates into HTML-building calls, but component and runtime costs remain.

## Real-app screen and measured routes

All clones lived under `/tmp/nsc-ssr-r2/`. No held-out repository was used. Revisions, package manifests, and license headers are retained in [real-app metadata](ssr-profile-frameworks-results/real-apps.json). Third-party source is not committed. The measured apps' npm install locks, build and install logs, response timings, and profiles are retained. The small [preparation script](prototypes/ssr-profile/prepare-framework-apps.mjs) records local changes without copying app source.

- [AstroPaper](https://github.com/satnaing/astro-paper/tree/befb05d9d5f359497a1cb4146f5c37fab22f7678), MIT, revision `befb05d9d5f359497a1cb4146f5c37fab22f7678`. The home page renders bundled local posts, existing cards, navigation, and date formatting. Node adapter and dynamic SSR replace the static deployment configuration. The hosted font is replaced by local monospace, with no content or component rewrite. Build-time content indexing remains, while the document renders every request. Median request CPU is 5.63 ms at C1 and 5.60 at C16. HTML is 5.9% of samples. Day.js timezone formatting dominates sampled application work; this is an example where optimizing HTML emission alone has little headroom.
- [Nuxt UI dashboard](https://github.com/nuxt-ui-templates/dashboard/tree/82afa8d630945ea60f35a2bf187721dc6e28a568), MIT, revision `82afa8d630945ea60f35a2bf187721dc6e28a568`. The existing home route renders local generated sales and dashboard components. The local sales email is checked in initial HTML before timing. Upstream random/time-dependent sample data is retained, so response bytes can vary. The byte count in summary is a readiness response; raw load blocks retain total bytes. Fonts and telemetry are disabled, and the server is built for node-server. Median request CPU is 20.60 ms at C1 and 19.41 at C16. HTML is 10.2% of sampled weight; routing/framework runtime is 49.2%. This includes substantial Vue component and props setup. No login, remote database, or external API is needed by the measured GET.

The `withastro/astro.build` screen found a Cloudflare adapter with binding-dependent configuration. It was not built or executed, and no Cloudflare call was made. AstroPaper was a smaller local-content alternative. Evidence's current revision uses a custom CLI adapter with binary packaging and a Bun-oriented CLI, rather than an adapter-node web app ready to serve a local data page. The other screened SvelteKit blog, `mattjennings/sveltekit-blog-template`, uses Svelte 3 and Kit 1. Neither was installed or migrated. There is no real Svelte 5 measurement in this report. This is a practical screen limitation, not evidence that SvelteKit real apps are slow or unavailable.

## Limits and decision

Svelte reaches 1.16× its paired concat CPU cost while retaining component boundaries and hydration anchors. That supports the feasibility of reducing a large React HTML pass toward string-building costs. Vue remains 4.11× its paired concat cost and 1.53× fresh React. Its profile has substantial `finishComponentSetup`, `applyOptions`, props initialization, and VNode work in framework runtime. A compiler that changes template emission but leaves all component setup intact may save little. Astro's container cost is 4.09× its late paired concat cost, with the measurement caveat above.

On full synthetic requests, sampled HTML shares are Astro 52.9%, SvelteKit 41.8%, and Nuxt 22.4%. Vue/Nuxt retains 65.1% in routing/framework runtime. SvelteKit has nontrivial framework hashing outside template rendering. Real AstroPaper spends only 5.9% in HTML because local date formatting dominates. The real Nuxt dashboard spends 10.2% in HTML. These results reinforce the need to profile the entire request rather than infer request savings from an isolated render speedup.

Prototype a bounded transform for plain React SSR and React Router first. Fresh React-to-concat reduction is 63.3%; Svelte provides a measured compiler/runtime precedent at 57.1% below React. The earlier Router HTML share is 56.6%, and real Epic is 24.0%, leaving a reason to measure end-to-end gains. Preserve escaping, component semantics, suspense, and hydration before claiming success. For Next App Router, the earlier 45.9% Flight share versus 10.8% Fizz share still argues against a Fizz-only product as the first target. No result here shows that an HTML compiler removes Flight. Svelte and Vue already compile SSR templates, so this study provides no case for recreating that transform there; investigate their measured runtime and application costs instead.

This is one fixture size on one shared host, with short fixed-order blocks. Source maps classify locations rather than causal costs. Real routes include local content and a small dashboard, not representative remote-database workloads. No client hydration, cold-start, cache-hit, or production traffic distribution was measured. Svelte and Vue compiled templates preserve framework runtime behavior, while hand concat is an optimistic empirical ceiling without those semantics. Changing component boundaries, escaping policy, framework versions, or compiler options could change the outcome.

[Failed attempts and corrections](ssr-profile-frameworks-results/attempts.json) remain alongside successful results. All task clones, installs, stores, and builds were deleted after attribution. No Docker, login, account call, hosting call, deploy, push, PR, issue, or public post was used.

Validation passed for 36 throughput blocks, six profiles, four five-block paired ceilings, 110,330 total audited HTTP responses including warmups, and five attribution/normalization tests. Reclassifying all seven historical React mapped profiles reproduces their original category totals exactly. Artifact compression, research links, and staged whitespace checks passed.
