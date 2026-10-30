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
