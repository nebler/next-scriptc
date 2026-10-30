scriptc 0.4.6 refusal log
=======================

1. Iterating the HTTP request directly:

error SC0001: Type 'IncomingMessage' must have a '[Symbol.asyncIterator]()' method that returns an async iterator.

Workaround: collect Buffer chunks with IncomingMessage data/end/error/aborted
events, then concatenate once (or reuse the sole chunk).

2. Using an HTTP response write callback:

error SC0001: Expected 1 arguments, but got 2.
error SC0001: Parameter 'error' implicitly has an 'any' type.

3. Listening for an HTTP ServerResponse error:

error SC0001: Argument of type '"error"' is not assignable to parameter of type '"close" | "finish"'.

Workaround for 2 and 3: buffer the Web response and call ServerResponse.end with
its Uint8Array. The fallback attempts below established that Node stream casts
do not enable a supported backpressure or error-aware write path in this release.

4. Constructing a Response directly from an ArrayBuffer in the test fixture:

error SC0001: Argument of type 'ArrayBuffer' is not assignable to parameter of type 'string | ReadableStream<Uint8Array<ArrayBufferLike>> | Uint8Array<ArrayBufferLike> | null | undefined'.
  Type 'ArrayBuffer' is missing the following properties from type 'Uint8Array<ArrayBufferLike>': BYTES_PER_ELEMENT, buffer, byteOffset, copyWithin, and 29 more.

Workaround: new Uint8Array(await request.arrayBuffer()), a byte view without an
additional payload copy.

5. Casting HTTP handles to Node stream interfaces:

error SC0001: Conversion of type 'IncomingMessage' to type 'Readable' may be a mistake because neither type sufficiently overlaps with the other. If this was intentional, convert the expression to 'unknown' first.
  Type 'IncomingMessage' is missing the following properties from type 'Readable': _read, _destroy, [Symbol.asyncIterator], iterator, and 38 more.

error SC0001: Conversion of type 'ServerResponse' to type 'Writable' may be a mistake because neither type sufficiently overlaps with the other. If this was intentional, convert the expression to 'unknown' first.
  Type 'ServerResponse' is missing the following properties from type 'Writable': _write, _writev, _final, _destroy, and 21 more.

Trying the compiler's suggested intermediate unknown cast then produced:

error SC1090: 'IncomingMessage' values where 'Readable' is expected is not supported yet

error SC1090: 'ServerResponse' values where 'Writable' is expected is not supported yet

error SC2020: 'write completion callbacks taking the error argument' is part of the standard library types but has no scriptc lowering yet

  hint: () => void callbacks are supported (listen for 'error' to observe failures)

Workaround: retain HTTP handles in their original types. Request event collection
and response buffering avoid these unsupported conversions and callbacks.

6. Passing the mandated imported module namespace to a typed serve implementation:

error SC2002: record shapes must match exactly or width-coerce: expected '{ DELETE: (unknown, { params: Promise<{ [key: string]: string[] | number | string | undefined }> }) => unknown | undefined; GET: (unknown, { params: Promise<{ [key: string]: string[] | number | string | undefined }> }) => unknown | undefined; HEAD: (unknown, { params: Promise<{ [key: string]: string[] | number | string | undefined }> }) => unknown | undefined; OPTIONS: (unknown, { params: Promise<{ [key: string]: string[] | number | string | undefined }> }) => unknown | undefined; PATCH: (unknown, { params: Promise<{ [key: string]: string[] | number | string | undefined }> }) => unknown | undefined; POST: (unknown, { params: Promise<{ [key: string]: string[] | number | string | undefined }> }) => unknown | undefined; PUT: (unknown, { params: Promise<{ [key: string]: string[] | number | string | undefined }> }) => unknown | undefined }', got 'module namespace 'file:/Users/noah/code/next-scriptc/packages/next-scriptc/shim/test/route.ts''

  hint: width subtyping compiles as a copy (each expected field copied off the source; extra fields drop) — this pair is outside the copy's rules; build a literal with exactly the expected fields instead

Resolution: pass a literal containing all seven required keys in GET, HEAD, POST,
PUT, PATCH, DELETE, OPTIONS order. Missing handlers are explicit undefined values.
RouteModule has required RouteHandler | undefined fields. The single typed serve
implementation compiles under 0.4.6; no any or overload is needed.

7. JSX-extension imports without a JSX-enabled tsconfig (even without JSX syntax):

error SC0001: Module '.../route.jsx' was resolved to '.../route.jsx', but '--jsx' is not set.
error SC0001: Module '.../route.tsx' was resolved to '.../route.tsx', but '--jsx' is not set.
error SC1010: the '.../route.jsx' package (nothing installed resolves it) is not supported yet
error SC1010: the '.../route.tsx' package (nothing installed resolves it) is not supported yet

Resolution: use the Next project's strict tsconfig with jsx: react-jsx, as the
adapter already does by placing entries under .next in that project.

8. Forwarded headers under the Next project's complete Node type declarations:

error SC2020: 'string | string[].includes' is part of the standard library types but has no scriptc lowering yet
error SC1090: string conversions of unions with object arms (narrow first: check a discriminant field, or compare with '!== undefined'/'!== null' for unit arms) are not supported yet

Resolution: narrow forwarded header values with typeof value === "string" before
calling includes or interpolating the host. The standalone shim compilation did
not load these wider Node declarations; the demo build exposed the difference.

Duplicate occurrences of the same message at multiple call sites are listed once.


Realistic route library probes (2026-10-30, scriptc 0.4.6)
--------------------------------------------------------

9. Papa Parse 5.7.0 with @types/papaparse 5.5.2 and @types/node 24.19.2:

error SC0001: Duplicate identifier 'strict'.

First source: node_modules/.pnpm/@scriptc+cli-darwin-arm64@0.4.6/node_modules/@scriptc/cli-darwin-arm64/dist/lib/declarations/node-fallback/assert-strict.d.ts:1:1

Build reports 961 declaration errors, including collisions between scriptc's
Node fallback declarations and @types/node pulled in by @types/papaparse.
Node successfully serializes and parses the CSV. Repro:
examples/probe/entries/papaparse.ts. The original first diagnostic remains in
the initial summary JSON; the final native-only diagnostics replace
examples/probe/.artifacts/papaparse/build.stderr. No CSV demo route was added.

10. Satori 0.63.2, default compiler options, first native execution refusal:

Uncaught Error: require() of the package 'camelize' in an expression (the package is not compiled into this program) is not supported yet [SC1090 at /Users/noah/code/next-scriptc/node_modules/.pnpm/css-to-react-native@3.2.0/node_modules/css-to-react-native/index.js:15]

Compilation succeeded with SC8023/SC8001 warnings but native startup exited 1;
Node rendered SVG. This is an observed package startup fence, not evidence of
a Yoga/WASM failure. Initial logs are preserved under
examples/probe/.artifacts/satori-default/. The final probe uses React.createElement
and --node-islands=off to test native compilation without a Node fallback.


11. Final native-only library probes (--node-islands=off):

Papa Parse 5.7.0:
error SC1090: the reference to 'unparse' (a binding form with no lowering) is not supported yet
error SC1090: the reference to 'parse' (a binding form with no lowering) is not supported yet

Source: examples/probe/routes/papaparse/route.ts:6:20 and :7:23.
The default build's declaration collision in item 9 happened while attempting
its Node-island build. Native-only compilation reveals the export binding
blocker first. Final logs overwrite .artifacts/papaparse/build.stderr with this
native-only result; the original first diagnostic remains in the initial
summary-bcryptjs-jose-marked-minisearch-papaparse-satori.json.

Satori 0.63.2, with React.createElement and @types/react 19.3.0:
error SC2013: cannot compile npm package 'fflate' statically: its createRequire import is used outside a supported call based on the current file

Source: node_modules/.pnpm/satori@0.63.2/node_modules/satori/dist/index.js:5:46174.
Adding the matching React declarations resolved a preceding SC2013 that React
ships no own .d.ts declaration surface. Native-only compilation now refuses
fflate; no SVG demo route was added. This does not establish a Yoga/WASM failure.

12. MiniSearch 7.2.0 search result storeFields access in application TypeScript:

error SC1090: reading 'title' from a value of type '{ id: any; score: number; terms: string[]; queryTerms: any; match: any; }' is not supported yet

The first stored-field read is the reported blocker. The library's
SearchResult index signature admits these stored fields, but the compiler's
inferred result shape does not. Supported formulation: retain the catalog in
a Map by ID, index only the searchable fields, and fetch the typed product
using each search hit's ID. This is also a normal application design: the
index ranks IDs while the catalog owns the result metadata. Repro of the
full handlers: examples/probe/entries/demo-routes.ts. A five-line reduction is
examples/probe/repros/minisearch-stored-fields.ts (run with
--only=minisearch-stored-fields). Node prints the title; scriptc refuses the
property read at :5:37 with the exact diagnostic above.


Adapter shim integration (2026-10-30, scriptc 0.4.6)
---------------------------------------------------

13. Web subclassing:

```text
error SC1090: extending classes not declared in the program ('Request') is not supported yet
error SC1090: extending classes not declared in the program ('Response') is not supported yet
```

Resolution: composition, not subclassing or a Node fallback.

14. DOM-only body type alias:

```text
error SC0001: Cannot find name 'BodyInit'.
```

Resolution: spell the supported string/byte/ReadableStream/null input union.

15. Optional record/capture formulations in cookie code:

```text
error SC1090: reading 'name' from a value of type '{ name: string; }' is not supported yet
error SC1090: a logical or conditional receiver containing a runtime-optional capture is not supported yet
```

The first occurred for `key?.name` on an optional string-or-record parameter.
The second occurred on a conditional Date receiver and on a conditional string
receiver inside the initial-cookie loop. Resolution: explicit undefined/type
branches and named intermediate strings.

16. Older app Node declarations versus scriptc's fallback declarations:

```text
error SC0001: Property 'isReloadNavigation' does not exist on type 'Request'.
error SC0001: Property 'isHistoryNavigation' does not exist on type 'Request'.
error SC0001: Property 'bytes' does not exist on type 'Request'.
error SC0001: Property 'bytes' does not exist on type 'Response'.
```

Resolution: unavailable navigation fields are declared never, and bytes() uses
`new Uint8Array(await arrayBuffer())`. No cast to an invented Request shape.
Wider Node declarations also required structural compatibility for blob/formData:

```text
error SC0001: Type '(_request: Request, context: { params: Promise<Record<string, string | string[]>>; }) => Promise<Response>' is not assignable to type 'RouteHandler'.
  Types of parameters '_request' and 'request' are incompatible.
    Type 'NextRequest' is missing the following properties from type 'Request': blob, formData
```

Resolution: declare unsupported methods never, so their calls fail preflight.

17. A structural response record instead of the Response/NextResponse union
compiled without warnings, but the first ordinary JSON response returned 500.
Native stderr was exactly:

```text
[TypeError: expected object at $, got Response]
```

Resolution: keep the working union and report its SC6104 checked-dynamic cost.
A mapped `Pick<Response,...>` also emitted SC6104 rather than providing a static
record. Neither attempted formulation remains in the implementation.

18. Named route context versus the original broad callback signature:

```text
error SC0001: Type '(_request: Request, context: { params: Promise<{ slug: string; }>; }) => Promise<Response>' is not assignable to type 'RouteHandler'.
  Types of parameters 'context' and 'context' are incompatible.
    Type 'RouteContext' is not assignable to type '{ params: Promise<{ slug: string; }>; }'.
      Types of property 'params' are incompatible.
        Type 'Promise<Record<string, string | string[]>>' is not assignable to type 'Promise<{ slug: string; }>'.
          Property 'slug' is missing in type 'Record<string, string | string[]>' but required in type '{ slug: string; }'.
```

Resolution: a method signature accepts each handler's narrowed context. Runtime
pattern matching constructs those named params. Both the compile test and real
posts handler now pass.

19. ServerResponse.end overload selection with the demo's Node declarations:

The single-chunk fast path compiled, but `outgoing.end(chunk.value)` returned
HTTP 500 under the demo's complete @types/node declarations. Native stderr:

```text
[TypeError: expected function at $, got Uint8Array]
```

Resolution: pin the byte overload with
`outgoing.end(chunk.value as Uint8Array<ArrayBuffer>)`. The assertion copies no
payload. Standalone fallback declarations did not reproduce the failure, so the
shim parity fixture now explicitly includes the demo's Node types and asserts
single-chunk Content-Length as well as response parity. It also tests stdin EOF
with an active never-ending response.
