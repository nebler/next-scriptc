import type { RouteContext } from "../serve.ts";

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  const url = new URL(request.url);
  const mode = url.searchParams.get("case");
  if (mode === "url") return Response.json({ url: request.url, host: request.headers.get("host") });
  if (mode === "fetch") return fetch(process.env.SHIM_UPSTREAM || "");
  if (mode === "framing") return new Response("decoded", { headers: {
    "content-length": "7", connection: "x-hop", "x-hop": "preserve", "keep-alive": "timeout=5",
    "proxy-authenticate": "Basic", "x-middleware-set-cookie": "internal=only",
  } });
  if (mode === "chunked") return new Response("chunked", { headers: { "transfer-encoding": "chunked" } });
  if (mode === "encoded") return new Response(new Uint8Array([1, 2, 3]), { headers: { "content-encoding": "gzip" } });
  if (mode === "throw") throw new Error("shim fixture failure");
  if (mode === "text") return new Response("hello, 世界\n", { headers: { "x-fixture": "text" } });
  if (mode === "binary") return new Response(new Uint8Array([0, 1, 127, 128, 255]), { headers: { "content-type": "application/octet-stream" } });
  if (mode === "cookies") {
    const headers = new Headers();
    headers.append("set-cookie", "first=one; Path=/; HttpOnly");
    headers.append("set-cookie", "second=two; Expires=Wed, 21 Oct 2037 07:28:00 GMT");
    return new Response("cookies", { headers });
  }
  if (mode === "missing") return new Response("not found", { status: 404, statusText: "Fixture Missing" });
  if (mode === "empty") return new Response(null, { status: 204 });
  if (mode === "stream" || mode === "slow") {
    if (mode === "slow") console.log("shim fixture: slow request started");
    const encoder = new TextEncoder();
    return new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode("first:"));
        setTimeout(() => {
          controller.enqueue(encoder.encode("世界:last"));
          controller.close();
        }, mode === "slow" ? 150 : 10);
      },
    }));
  }
  return Response.json({
    params: await context.params,
    method: request.method,
    pathname: url.pathname,
    query: url.search,
    host: url.host,
    repeated: request.headers.get("x-repeated"),
    cookie: request.headers.get("cookie"),
    requestCookies: request.headers.getSetCookie(),
  });
}

export async function POST(request: Request): Promise<Response> {
  if (new URL(request.url).searchParams.get("case") === "binary") {
    return new Response(new Uint8Array(await request.arrayBuffer()), { headers: { "content-type": request.headers.get("content-type") || "application/octet-stream" } });
  }
  return Response.json({ method: request.method, body: await request.json() }, { status: 201 });
}

export function PUT(): Response {
  throw new Error("shim synchronous failure");
}

export async function PATCH(): Promise<Response> {
  throw new Error("shim rejected failure");
}
