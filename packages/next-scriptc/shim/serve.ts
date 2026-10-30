import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { NextRequest, NextResponse } from "./next-server.ts";

// scriptc documents argv[0] as "scriptc"; Node uses its executable path.
const runtime = process.argv[0] === "scriptc" ? "native" : "1";

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

async function toRequest(incoming: IncomingMessage, url: string, host: string): Promise<NextRequest> {
  const headers = new Headers();
  for (let i = 0; i < incoming.rawHeaders.length; i += 2) {
    headers.append(incoming.rawHeaders[i], incoming.rawHeaders[i + 1]);
  }
  // Next's changeOrigin proxy replaces Host but preserves the public host here.
  headers.set("host", host);
  const method = incoming.method || "GET";
  if (method === "GET" || method === "HEAD") return new NextRequest(url, { method, headers });
  const chunks = await new Promise<Buffer[]>((resolve, reject) => {
    const chunks: Buffer[] = [];
    incoming.on("data", (chunk: Buffer) => chunks.push(chunk));
    incoming.on("end", () => resolve(chunks));
    incoming.on("error", (error: Error) => reject(error));
    incoming.on("aborted", () => reject(new Error("Request aborted")));
  });
  const body = chunks.length === 1 ? chunks[0] : Buffer.concat(chunks);
  // HTTP data buffers are ArrayBuffer-backed; keep their existing byte view.
  return new NextRequest(url, { method, headers, body: body as Uint8Array<ArrayBuffer> });
}

async function writeResponse(response: RouteResponse, outgoing: ServerResponse, head: boolean): Promise<void> {
  outgoing.statusCode = response.status;
  if (response.statusText) outgoing.statusMessage = response.statusText;
  response.headers.forEach((value, name) => {
    if (name === "set-cookie" || name === "x-middleware-set-cookie") return;
    outgoing.setHeader(name, value);
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
  // write() compiles without callbacks. The transport can queue bytes for a slow
  // client: scriptc exposes neither write's boolean result nor a drain event.
  const reader = body.getReader();
  let finished = false;
  let disconnected = false;
  outgoing.once("close", () => {
    if (!finished) {
      disconnected = true;
      reader.cancel().catch((error: unknown) => console.error(error));
    }
  });
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done || disconnected) break;
      outgoing.write(chunk.value);
    }
    if (!disconnected) outgoing.end();
  } finally {
    finished = true;
    reader.releaseLock();
  }
}

export function serve(module: RouteModule, options: { pattern: string; port?: number }): void {
  const port = options.port ?? Number(process.env.PORT);
  if ((options.port === undefined && !process.env.PORT?.trim()) || !Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error("next-scriptc: PORT must be an integer between 0 and 65535 (or supply options.port)");
  }
  const get = module.GET;
  const head = module.HEAD || get;
  const post = module.POST;
  const put = module.PUT;
  const patch = module.PATCH;
  const remove = module.DELETE;
  const optionsHandler = module.OPTIONS;
  const match = compilePattern(options.pattern);
  const allowed = ["OPTIONS"];
  if (get) allowed.push("GET");
  if (head) allowed.push("HEAD");
  if (post) allowed.push("POST");
  if (put) allowed.push("PUT");
  if (patch) allowed.push("PATCH");
  if (remove) allowed.push("DELETE");
  const allow = allowed.sort().join(", ");
  const server = createServer(async (incoming, outgoing) => {
    try {
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
      else response = await handler(await toRequest(incoming, url.href, host), { params: Promise.resolve(params) });
      incoming.resume();
      await writeResponse(response, outgoing, method === "HEAD");
    } catch (error) {
      console.error(error);
      incoming.resume();
      if (outgoing.headersSent) outgoing.destroy();
      else {
        for (const name of outgoing.getHeaderNames()) outgoing.removeHeader(name);
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
  server.listen(port, "127.0.0.1", () => {
    const address = server.address();
    const port = address && typeof address === "object" ? address.port : options.port;
    console.log(`next-scriptc: listening on 127.0.0.1:${port}`);
  });
}
