# Use native diagnostics in your editor

Install `scriptc-promote` and TypeScript in your application workspace. If you use
`next-scriptc`, add `scriptc-promote` directly so tsserver can resolve the plugin
under strict package managers.

Add this entry to your application's `tsconfig.json`:

```json
{
	"compilerOptions": {
		"plugins": [{ "name": "scriptc-promote/ts-plugin" }]
	}
}
```

Restart the TypeScript language server. In VS Code, run **TypeScript: Select
TypeScript Version**, then choose **Use Workspace Version**. WebStorm must use
the project's TypeScript language service. In Neovim, configure your tsserver
client to use workspace TypeScript and load tsconfig plugins. No separate editor
extension is required. Clients that use another checker instead of tsserver do
not load this plugin. These instructions use tsserver's plugin protocol; only the
TypeScript language-service harness has been tested locally.

For example, this function produces an error at `missing`:

```ts
export function score(value: number): number {
	"use native";
	return missing(value);
}
```

The message contains `NSC1001`, the unsupported reference, and the build's repair
hint. Hover over the function to see its extraction status. Fix the reference to
a supported calculation, and the status changes to eligible. Eligibility means
static extraction and boundary checks passed; compiler acceptance, native speed,
and runtime verification still require a production build.

## Configure optional hints

Unmarked functions have no plugin diagnostics by default. To see automatic
candidates and their nearest blockers, enable suggestions:

```json
{
	"compilerOptions": {
		"plugins": [{
			"name": "scriptc-promote/ts-plugin",
			"unmarkedHints": true,
			"debounceMs": 150
		}]
	}
}
```

Your editor must display suggestion diagnostics to show these hints.
`debounceMs` defaults to 150 and is bounded to 20–2,000 milliseconds. Automatic
eligibility does not predict the dispatcher's measured lane choice.

## Behavior and limits

The plugin calls the existing discovery pipeline in report-only mode. Explicit
async functions and file directives use the existing explicit extractor and
boundary checker. A file-level `"use native"` retains the explicit build contract:
its value exports must be named async functions. Nested functions and other
unsupported shapes retain the extractor's refusals. Functions the build does not
consider, such as unreferenced non-exported synchronous functions, show an
unassessed hover status. No acceptance rule changes.

Discovery runs in a worker after typing pauses. The first request returns the
usual TypeScript results; a diagnostic refresh follows analysis. Unsaved source
buffers are included. File and project versions invalidate displayed results.
Dependency content hashes, including observed resolution-file existence, validate
worker reuse. Disk-only dependency changes are checked on the next request after
a one-second validation interval. Idle editors do not poll the filesystem.

Analysis uses the application's on-disk tsconfig for discovery and the language
service's options for explicit boundary checks. Save tsconfig changes and restart
the server if the editor has not reloaded them. Application-specific bundler
aliases and adapter configuration are not supplied to discovery. The build
remains authoritative for those integrations.

Each project has at most one worker, 32 cached or queued files, 256 source
buffers, two million source characters per job, and 256 returned diagnostics and
hover statuses. Requests that exceed the source limits receive ordinary
TypeScript results. Jobs exceeding five seconds are terminated and discarded.
Worker or plugin failures preserve TypeScript's diagnostics and hover; plugin
failures are written to the tsserver log. Closing a project disposes the worker.

The plugin does not invoke stock scriptc, compile artifacts, execute application
code, or apply code fixes. Compiler-only errors and generated-to-source compiler
mapping remain build checks. Repair hints are text suggestions; guards and other
semantic edits require your judgment. See the [design and measured latency](../research/editor-plugin.md).
