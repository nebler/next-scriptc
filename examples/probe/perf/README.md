# Indicative performance research probes

These probes use the installed scriptc 0.4.6 and a Node 24 reference, call the original demo handlers directly, and never build the demo's `.next` directory. Run one phase at a time; they deliberately do not run sustained workloads concurrently. Results are under the ignored `../.artifacts/perf-levers/` directory.

```sh
# Set this to a Node 24 executable on another machine.
export PROBE_NODE=/Users/noah/.local/share/fnm/node-versions/v24.22.0/installation/bin/node
python3 examples/probe/perf/run.py
python3 examples/probe/perf/after.py
```

`run.py` builds each entry three times per optimization mode with `SCRIPTC_NO_CACHE=1` and `SCRIPTC_CHECKER_SERVER=0`. Installed precompiled runtime packs and filesystem caches remain warm. It records three timed windows after warmup in each process, including construction and draining of Web Responses. The report route uses one worker and the complete million-order/five-year/twelve-scenario computation; only its deterministic `result` is used for parity, excluding the route's intentionally runtime-specific timing, RSS, version and sharing metadata. JWT time is fixed identically with `DEMO_JWT_NOW=1800000000`.

`after.py` runs the alternating-process release/speed/Node recheck, candidates, profiles, HTTP ablations/topology, and option checks sequentially. An optional PID argument waits for an existing owned mode run. Individual phases can also be invoked as Python scripts. `http-setup.py` regenerates the HTTP entries and shim snapshot from the current workspace; this will change the snapshot if the adapter has changed since this research.

The candidate set in `candidates.ts` is the same file in both runtimes. Inputs are deterministic and initialized once, while every request performs fresh work. Compression validates a full gzip/gunzip round trip; it compares decompressed content, allowing different valid gzip encodings. No candidate caches computed outputs or reduces inputs for one runtime.

The raw HTTP, Web-only and buffered-response variants are diagnostic ablations. They do not implement every Next/HTTP feature and must not replace the production shim without preserving those features. Grouping reuses the snapshotted request/response adaptation and pattern matcher, with a single dispatching HTTP server. Six-route memory counts are simultaneous summed RSS; shared pages may be counted repeatedly.

All controllers track their own child process groups and terminate them in `finally`. Ports are checked before starting servers. Profiling deliberately terminates a bounded warmed native loop after `sample` completes. No unrelated process is killed, no git operation mutates repository state, and no compiler source or runtime pack is modified.

`options.py` also runs the alternating Web-response-only type specialization in `typed.py`. The specialization is a negative result for CPU speed; it is retained along with the successful ablation outputs.

## Round 3 decisions

`round3.py` reuses `run.py`'s entry generator and owned process runner. It adds
all current demo routes, three alternating uncached builds per mode (stripped,
as in production), and four fresh-process alternating steady windows per mode.
Generated entries are ignored in `round3-generated/`; results and binaries live
under `.artifacts/perf-levers/round3/`. It resumes completed matrix cells; remove
that artifact directory for a completely fresh run. Never run the phases in
parallel, or alongside another sustained benchmark.

```sh
pnpm install
PROBE_NODE=/path/to/node24 python3 examples/probe/perf/round3.py
PROBE_NODE=/path/to/node24 python3 examples/probe/perf/round3.py http-build
PROBE_NODE=/path/to/node24 python3 examples/probe/perf/round3-topology.py
```

The topology probe imports the existing `shim/grouped.ts` without changing its
transport. It compares the sixteen resident native routes (excluding the
prerendered `static-fixture` and Node-only `items/new`) in sixteen, nine, and one
processes, plus a one-process prototype moving Markdown to a single retained
worker. Each topology has three fresh repetitions, reversing order on the middle
repeat. Each initializes every real handler with a successful full-size fixture,
then probes hello idle and during continuous C=1 Markdown and gzip loads. Each
p50/p99 is empirical over 300 timed requests after 30 warmups; three repetitions
are descriptive, not a tail SLA. Process RSS includes report's retained worker;
no Next frontend is started by this direct topology experiment.

`round3-worker-proxy.ts` is a bounded GET-only feasibility probe. It serializes
Markdown's URL, headers and slug to a typed message and returns status, headers
and text, admitting one job and rejecting overflow with 503. It does not provide
a general streaming, cancellation, binary-upload, multi-cookie or worker-restart
implementation. The real Markdown handler executes in the worker on every call.
