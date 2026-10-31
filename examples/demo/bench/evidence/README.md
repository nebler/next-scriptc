# Round 4 local verification evidence

These are **indicative local checks**, not public performance evidence. Node 24.22.0, scriptc 0.4.6, Next 16.4.3, shared Apple M4 Pro; no affinity. Native-grouped is explicitly skipped because `.next-grouped` does not exist on this worktree. Both reports are retained verbatim, compressed with gzip; `checksums.json` hashes the original uncompressed bytes. Decompress a matching JSON/Markdown pair together to inspect the report's adjacent raw data.

- `round4-attempt1.{json,md}.gz`: one full `--profile quick` invocation, **failed** after coverage, all 52 cold samples, and all direct workloads (175 measured rows). At the first production Node login, the connection to port 3417 was refused after hello readiness/idle sampling. Production, isolation and threads were not completed. The original exception is retained. No cause was established; a focused startup/login check passed. Do not present this as a successful uninterrupted suite.
- `round4-followup.{json,md}.gz`: targeted `--profile quick --sections production,isolation,threads`, **complete**, 126 rows. Coverage is automatically included; cold and direct are explicitly absent. Every production workload, all four isolation loads and all 1/2/4-worker variants completed. Server exit/output capture was added before this run; its source hash and dirty state are recorded. This is a separate invocation, not a continuation or replacement of failed rows.

Do not combine the two reports into a single successful dataset, compare selected timing cells between attempts, or publish local timing ratios. A final public run still needs the integrated grouped adapter/config, all three sequential builds, and one complete sandbox invocation from committed HEAD. The sandbox was not run during preparation.

The standalone typed-array repro has its own complete nine-window-per-runtime evidence at `examples/probe/repros/typed-array-histogram-results.json`.
