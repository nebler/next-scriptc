import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { NextRequest, NextResponse } from "./next-server.ts";

// scriptc documents argv[0] as "scriptc"; Node uses its executable path.
const runtime = process.argv[0] === "scriptc" ? "native" : "1";
const appVary = "rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch";

export type RouteContext = { params: Promise<Record<string, string | string[]>> };
export type RouteResponse = Response | NextResponse;
// A handler can name the params guaranteed by its own route pattern.
export type RouteHandler = {
  handle(request: NextRequest, context: RouteContext): RouteResponse | Promise<RouteResponse>;
}["handle"];
export type RouteModule = {
  GET: RouteHandler | undefined;
  HEAD: RouteHandler | undefined;
  POST: RouteHandler | undefined;
  PUT: RouteHandler | undefined;
  PATCH: RouteHandler | undefined;
  DELETE: RouteHandler | undefined;
  OPTIONS: RouteHandler | undefined;
};

type Segment = { kind: "static" | "dynamic" | "catchAll" | "optionalCatchAll"; name: string };

function compilePattern(pattern: string) {
  const segments = pattern.split("/").filter(Boolean).map((part): Segment => {
    if (part.startsWith("[[...") && part.endsWith("]]")) return { kind: "optionalCatchAll", name: part.slice(5, -2) };
    if (part.startsWith("[...") && part.endsWith("]")) return { kind: "catchAll", name: part.slice(4, -1) };
    if (part.startsWith("[") && part.endsWith("]")) return { kind: "dynamic", name: part.slice(1, -1) };
    return { kind: "static", name: part };
  });
  for (let i = 0; i < segments.length - 1; i++) {
    if (segments[i].kind === "catchAll" || segments[i].kind === "optionalCatchAll") throw new Error("Catch-all parameters must be the last segment");
  }
  return (pathname: string): Record<string, string | string[]> | null => {
    const parts = pathname.split("/");
    parts.shift();
    if (parts[parts.length - 1] === "") parts.pop();
    const params: Record<string, string | string[]> = {};
    let i = 0;
    for (const segment of segments) {
      if (segment.kind === "catchAll" || segment.kind === "optionalCatchAll") {
        if (i === parts.length) return segment.kind === "optionalCatchAll" ? params : null;
        params[segment.name] = parts.slice(i).map((part) => decodeURIComponent(part));
        return params;
      }
      if (i >= parts.length) return null;
      const part = decodeURIComponent(parts[i++]);
      if (segment.kind === "static") {
        if (part !== segment.name) return null;
      } else {
        params[segment.name] = part;
      }
    }
    return i === parts.length ? params : null;
  };
}

async function toRequest(incoming: IncomingMessage, url: string, host: string, intercepted: boolean): Promise<NextRequest> {
  // Keep an owned snapshot for NextRequest's lazy Headers, retaining repeated
  // fields. URL/params-only handlers need not construct Web headers at all.
  const headers: [string, string][] = [];
  for (let i = 0; i < incoming.rawHeaders.length; i += 2) {
    const name = incoming.rawHeaders[i];
    const lower = name.toLowerCase();
    if (lower === "host" || (lower === "next-url" && !intercepted)) continue;
    headers.push([name, incoming.rawHeaders[i + 1]]);
  }
  // Next's changeOrigin proxy replaces Host but preserves the public host here.
  headers.push(["host", host]);
  const method = incoming.method || "GET";
  const cookie = incoming.headers.cookie || "";
  if (method === "GET" || method === "HEAD") return new NextRequest(url, { method, headers }, cookie);
  const chunks = await new Promise<Buffer[]>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let ended = false;
    incoming.on("data", (chunk: Buffer) => chunks.push(chunk));
    incoming.on("end", () => { ended = true; resolve(chunks); });
    incoming.on("error", (error: Error) => reject(error));
    incoming.on("aborted", () => reject(new Error("Request aborted")));
    // scriptc can report an incomplete FIN as close alone (with complete=true).
    // Track end ourselves and avoid constructing errors on normal closes.
    incoming.on("close", () => {
      if (!ended) reject(new Error("Request aborted"));
    });
  });
  // The transport owns these buffers. A stream passes their byte views to
  // Request without concatenating them or snapshotting a Buffer in its constructor.
  // Keep consumption, locking, clone/tee and bodyUsed in the Web implementation.
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
  return new NextRequest(url, { method, headers, body }, cookie);
}

async function writeResponse(response: RouteResponse, outgoing: ServerResponse, head: boolean): Promise<void> {
  outgoing.statusCode = response.status;
  if (response.statusText) outgoing.statusMessage = response.statusText;
  response.headers.forEach((value, name) => {
    if (name === "set-cookie" || name === "x-middleware-set-cookie") return;
    if (name === "vary") {
      // Next sendResponse appends Vary, deduplicating whole header values only.
      const current = outgoing.getHeader("vary");
      if (typeof current === "string" && current !== value) outgoing.setHeader(name, [current, value]);
      else if (current !== value) outgoing.setHeader(name, value);
    } else outgoing.setHeader(name, value);
  });
  const cookies = response.headers.getSetCookie();
  if (cookies.length) outgoing.setHeader("set-cookie", cookies);
  outgoing.setHeader("x-next-scriptc", runtime);
  const body = response.body;
  if (!body || head) {
    if (body) await body.cancel();
    outgoing.end();
    return;
  }
  if (!(response instanceof Response) && response.bufferedBody) {
    outgoing.end(new Uint8Array(await response.arrayBuffer()));
    return;
  }
  // write() compiles without callbacks. The transport can queue bytes for a slow
  // client: scriptc exposes neither write's boolean result nor a drain event.
  const reader = body.getReader();
  let bodyClosed = false;
  reader.closed.then(() => { bodyClosed = true; }, () => {});
  let finished = false;
  let disconnected = false;
  outgoing.once("close", () => {
    if (!finished) {
      disconnected = true;
      reader.cancel().catch((error: unknown) => console.error(error));
    }
  });
  try {
    let chunk = await reader.read();
    // Consuming a static body's only chunk schedules its stream closure. Give
    // that microtask time to run without waiting for a streaming body's next chunk.
    if (!bodyClosed) await Promise.resolve();
    if (bodyClosed && !chunk.done && !disconnected) {
      // Pin the byte overload when the app includes Node's callback overload.
      outgoing.end(chunk.value as Uint8Array<ArrayBuffer>);
      return;
    }
    while (!chunk.done && !disconnected) {
      outgoing.write(chunk.value);
      chunk = await reader.read();
    }
    if (!disconnected) outgoing.end();
  } finally {
    finished = true;
    reader.releaseLock();
  }
}

export function serve(module: RouteModule | (() => Promise<RouteModule>), options: { pattern: string; port?: number; interceptionPatterns?: string[] }): void {
  const port = options.port ?? Number(process.env.PORT);
  if ((options.port === undefined && !process.env.PORT?.trim()) || !Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error("next-scriptc: PORT must be an integer between 0 and 65535 (or supply options.port)");
  }
  let get: RouteHandler | undefined;
  let head: RouteHandler | undefined;
  let post: RouteHandler | undefined;
  let put: RouteHandler | undefined;
  let patch: RouteHandler | undefined;
  let remove: RouteHandler | undefined;
  let optionsHandler: RouteHandler | undefined;
  let allow = "";
  let initializing: Promise<void> | null = null;
  function initialize(route: RouteModule): void {
    get = route.GET;
    head = route.HEAD || get;
    post = route.POST;
    put = route.PUT;
    patch = route.PATCH;
    remove = route.DELETE;
    optionsHandler = route.OPTIONS;
    const allowed = ["OPTIONS"];
    if (get) allowed.push("GET");
    if (head) allowed.push("HEAD");
    if (post) allowed.push("POST");
    if (put) allowed.push("PUT");
    if (patch) allowed.push("PATCH");
    if (remove) allowed.push("DELETE");
    allow = allowed.sort().join(", ");
    initializing = null;
  }
  if (typeof module !== "function") initialize(module);
  const match = compilePattern(options.pattern);
  const interceptionPatterns = (options.interceptionPatterns || []).map((pattern) => new RegExp(pattern));
  const interceptionRoute = options.pattern.split("/").some((part) =>
    part.startsWith("(.)") || part.startsWith("(..)") || part.startsWith("(...)")
  );
  const server = createServer(async (incoming, outgoing) => {
    try {
      if (initializing) await initializing;
      const forwardedHost = incoming.headers["x-forwarded-host"];
      const forwardedProto = incoming.headers["x-forwarded-proto"];
      const host = typeof forwardedHost === "string" && forwardedHost ? forwardedHost : incoming.headers.host || "127.0.0.1";
      const protocol = typeof forwardedProto === "string" && forwardedProto.includes("https") ? "https" : "http";
      const url = new URL(incoming.url || "/", `${protocol}://${host}`);
      // Next reserializes the query before Node route execution; its proxy uses querystring instead.
      if (typeof forwardedHost === "string") url.search = url.searchParams.toString();
      let params: Record<string, string | string[]> | null;
      try {
        params = match(url.pathname);
      } catch {
        incoming.resume();
        await writeResponse(new Response(null, { status: 400 }), outgoing, false);
        return;
      }
      // BaseServer.setVaryHeader runs before App Route dispatch, including
      // automatic HEAD/OPTIONS/405 and handler failures, but after route matching.
      const intercepted = interceptionRoute || interceptionPatterns.some((pattern) => pattern.test(url.pathname));
      if (params !== null) {
        outgoing.setHeader("vary", intercepted ? `${appVary}, next-url` : appVary);
      }
      const method = incoming.method || "GET";
      let handler: RouteHandler | undefined;
      if (method === "GET") handler = get;
      else if (method === "HEAD") handler = head;
      else if (method === "POST") handler = post;
      else if (method === "PUT") handler = put;
      else if (method === "PATCH") handler = patch;
      else if (method === "DELETE") handler = remove;
      else if (method === "OPTIONS") handler = optionsHandler;
      let response: RouteResponse;
      if (params === null) response = new Response(null, { status: 404 });
      else if (method === "OPTIONS" && !handler) response = new Response(null, { status: 204, headers: { Allow: allow } });
      else if (!handler) response = new Response(null, { status: 405, headers: { Allow: allow } });
      else response = await handler(await toRequest(incoming, url.href, host, intercepted), { params: Promise.resolve(params) });
      incoming.resume();
      await writeResponse(response, outgoing, method === "HEAD");
    } catch (error) {
      console.error(error);
      incoming.resume();
      if (outgoing.headersSent) outgoing.destroy();
      else {
        for (const name of outgoing.getHeaderNames()) {
          if (name !== "vary") outgoing.removeHeader(name);
        }
        outgoing.statusCode = 500;
        outgoing.statusMessage = "Internal Server Error";
        outgoing.setHeader("x-next-scriptc", runtime);
        outgoing.end();
      }
    }
  });
  // httpxy pools loopback sockets across requests. Retain them through short
  // idle gaps; server.close() still closes idle connections during shutdown.
  server.keepAliveTimeout = 60_000;
  let closing = false;
  function shutdown(): void {
    if (closing) return;
    closing = true;
    server.close(() => process.exit(0));
  }
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
  const parent = Number(process.env.NEXT_SCRIPTC_PARENT);
  if (parent > 0) {
    // The expected PID comes from the owner, covering death before we start.
    setInterval(() => {
      if (process.ppid !== parent) process.exit(0);
    }, 1000).unref();
  }
  server.listen(port, "127.0.0.1", () => {
    const address = server.address();
    const port = address && typeof address === "object" ? address.port : options.port;
    console.log(`next-scriptc: listening on 127.0.0.1:${port}`);
    // The parent waits only for bound ports, letting Next initialize alongside
    // route modules. Connections queue in the kernel during synchronous import;
    // asynchronous module initialization is awaited by the request callback.
    if (typeof module === "function") {
      initializing = module().then(initialize);
      initializing.catch((error: unknown) => {
        console.error(error);
        process.exit(1);
      });
    }
  });
}
