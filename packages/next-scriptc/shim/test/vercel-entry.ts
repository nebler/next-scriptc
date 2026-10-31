import { serve, serveMany, type RouteModule } from "../serve.ts";

function GET(request: Request): Response {
  const url = new URL(request.url);
  const mode = url.searchParams.get("mode");
  if (mode === "throw") throw new Error("IPC fixture failure");
  if (mode === "stream" || mode === "stream-error" || mode === "cancel") {
    let timer: ReturnType<typeof setTimeout>;
    return new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("first"));
        timer = setTimeout(() => {
          if (mode === "stream-error") controller.error(new Error("IPC stream failure"));
          else {
            controller.enqueue(new TextEncoder().encode("last"));
            controller.close();
          }
        }, mode === "cancel" ? 5000 : 150);
      },
      cancel() { clearTimeout(timer); console.log("fixture: cancelled"); },
    }));
  }
  const headers: [string, string][] = [];
  request.headers.forEach((value, name) => headers.push([name, value]));
  return Response.json({ url: request.url, headers });
}
const module: RouteModule = {
  GET, HEAD: undefined, POST: async (request) => new Response(await request.text()),
  PUT: undefined, PATCH: undefined, DELETE: undefined, OPTIONS: undefined,
};
const options = { port: 0, vercel: process.env.SELF_HOSTED !== "1" };
if (process.env.GROUPED) serveMany([{ pattern: "/api/[id]", module }], options);
else serve(module, { pattern: "/api/[id]", ...options });
