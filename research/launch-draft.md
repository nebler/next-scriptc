# Launch draft (not posted — for review)

All numbers below come from `research/vercel-final.md` (Vercel previews, iad1, 5 fresh interleaved Node/native pairs, commit `10d23f6`) and `research/function-level.md` (round 3, Linux Vercel Sandbox, self-hosted). Re-check each number against those files before posting.

## Thread

**1/ (hook, with video)**

> route.go, but you keep writing TypeScript.
>
> `route.native.ts` → compiled to a native binary at build time and deployed as its own Vercel Function.
> No fork of Next.js, just an adapter.
>
> Same app on Vercel vs vanilla Next.js 👇

**2/ (numbers)**

> Same routes, same code, same data, 5 fresh deployments each:
>
> • first request after deploy: 126 ms vs 240 ms
> • memory per instance: 5.6 MiB vs 80 MiB
> • CPU per request: 0.57 ms vs 3.1 ms (hello), 2.4 vs 7.0 ms (revenue aggregation)
>
> Warm latency is the same (~23 ms, that's the platform).

**3/ (honest losses)**

> Where it loses: regex-heavy npm libraries.
>
> Markdown via `marked` is 2.5× slower and uses 8.8× more CPU, because scriptc's regex engine is an interpreter and V8's is a JIT.
>
> Typed app code wins, untyped/regex-heavy libraries don't (yet).

**4/ (the hook for the future: "use native")**

> It also works on single functions, like "use server":
>
> ```ts
> async function revenue(from: string, to: string) {
>   "use native";
>   …
> }
> ```
>
> A Server Component dashboard over 200k orders: 48 ms vs 113 ms. Below ~15k rows the serialization boundary eats the win. (Self-hosted for now.)

**5/ (how it works + ask)**

> How:
> - scriptc compiles the TS route to a static Linux binary that speaks Vercel's function protocol itself
> - the adapter wraps Vercel's own Next.js adapter and swaps the native routes in
> - dev runs the same file on Node
>
> Repo + RFC for a real Next primitive (`runtime = "scriptc"`): <link>

## Caveats to keep next to the numbers (in the repo README / replies)

- Preview deployments on a Hobby account; all 17 native routes share one Function (Hobby's 12-Function limit), mirroring how Vercel bundles the Node App Routes.
- "First request after deploy" = first drained response on an untouched preview, measured from a Sandbox in iad1. Not a certified process-cold time (Observability Plus is unavailable on Hobby).
- Memory = RSS of the serving process (Node: the Next server process; native: the single executable), not whole-instance usage.
- CPU per request = self-reported process CPU (`process.cpuUsage()`, validated against `/proc`), not Vercel's billed Active CPU. Node verify/gzip rows were unavailable (instance changes during windows).
- Warm throughput differences (1.06–1.2×) come from one pair and short windows; gzip windows saturated the load generator.
- "use native" numbers are self-hosted on Linux (Vercel Sandbox, 2 vCPU), C=1, page p50 incl. React rendering. On Vercel, function-level code still runs on Node.

## Video script (~40 s, screen recording)

1. **0–6 s:** editor showing `app/api/analytics/revenue/route.native.ts`. It's ordinary TypeScript; the file name is the only marker. Caption: "route.native.ts".
2. **6–14 s:** terminal: `next-scriptc vercel-build && vercel deploy --prebuilt` (sped up). Show the log line `Built 17 native routes in 1 Vercel Function`.
3. **14–20 s:** `curl -i …/api/analytics/revenue` → `x-next-scriptc: native` highlighted.
4. **20–30 s:** chart: first request after deploy (126 vs 240 ms), memory (5.6 vs 80 MiB), CPU/request (hello, revenue, nearby). Same chart shows Markdown in red as the loss.
5. **30–40 s:** a Server Component with `"use native"` inside a function, a page refresh with the timing overlay "200k orders: 48 ms vs 113 ms". End card: repo link.

## Open before posting

- The user reviews every number and caveat.
- The tagging decision (route.go thread / Next.js team) is the user's.
- The repo needs a README that leads with the same numbers and caveats.
- File the scriptc regex upstream issue first (`research/upstream-issues.md`), so the loss tweet can link it (needs the user's OK).
