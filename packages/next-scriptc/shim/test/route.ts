import { NextResponse, type NextRequest } from "next/server";
import type { RouteContext } from "../serve.ts";

export async function GET(request: NextRequest, context: RouteContext) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("case");
  if (mode === "next-cookie-snapshot") {
    request.headers.set("cookie", "theme=changed");
    return NextResponse.json({ theme: request.cookies.get({ name: "theme" }) });
  }
  if (mode === "next-typed") return typedJson();
  if (mode === "next-cookie-percent" || mode === "next-cookie-percent-invalid") {
    const value = mode === "next-cookie-percent" ? "%2525" : "%25";
    const response = new NextResponse("cookie", { headers: { "set-cookie": `initial=${value}` } });
    response.cookies.set("other", "value");
    return response;
  }
  if (mode === "next-json") {
    const response = NextResponse.json({
      pathname: request.nextUrl.pathname, query: request.nextUrl.searchParams.getAll("q"),
      theme: request.cookies.get("theme"), flags: request.cookies.getAll(),
      selected: request.cookies.getAll({ name: "theme" }), missing: request.cookies.getAll("missing"),
      has: request.cookies.has("theme"), header: request.headers.get("x-fixture"),
    }, { status: 201, headers: { "x-next-fixture": "json", "set-cookie": "initial=one; HttpOnly; SameSite=Lax" } });
    response.cookies.set("theme", "dark 世界", { httpOnly: true, sameSite: "lax", secure: true, priority: "high", partitioned: true });
    response.cookies.set({ name: "second", value: "two", path: "/account", domain: "fixture.test", expires: new Date("2037-10-21T07:28:00Z"), maxAge: 0 });
    response.cookies.set("flags", "hello 世界", { path: "", secure: true, httpOnly: true, sameSite: true, partitioned: true, priority: "high" });
    response.cookies.set("theme", "updated", { httpOnly: true });
    response.cookies.delete("gone");
    response.cookies.delete({ name: "scoped", path: "/account", domain: "fixture.test", secure: true });
    return response;
  }
  if (mode === "next-redirect") return NextResponse.redirect(new URL("/destination?q=世界", request.url));
  if (mode === "next-redirect-302") return NextResponse.redirect("https://fixture.test/other", { status: 302, headers: { "x-fixture": "redirect" } });
  if (mode === "next-invalid-redirect") return NextResponse.redirect("https://fixture.test", 200);
  if (mode === "next-body") return new NextResponse("constructed:世界", { status: 202, headers: { "x-fixture": "constructor" } });
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
  if (mode === "cancel") return new Response(new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(new TextEncoder().encode("first:")); },
    cancel() { console.log("shim fixture: stream cancelled"); },
  }));
  if (mode === "stream" || mode === "slow") {
    if (mode === "slow") console.log("shim fixture: slow request started");
    const encoder = new TextEncoder();
    return new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode("first:"));
        setTimeout(() => {
          controller.enqueue(encoder.encode("世界:last"));
          controller.close();
        }, mode === "slow" ? 220 : 10);
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

function typedJson(): Response { return NextResponse.json({ typed: true }); }
