"use scriptc";

export async function GET(request: Request, context: { params: Promise<{ job: string }> }) {
  const { job } = await context.params;
  const format = new URL(request.url).searchParams.get("format") ?? "ndjson";
  if (format !== "ndjson") return Response.json({ error: "Only NDJSON is supported" }, { status: 400 });
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(JSON.stringify({ job, state: "started" }) + "\n"));
      controller.enqueue(encoder.encode(JSON.stringify({ job, state: "complete", rows: 2500 }) + "\n"));
      controller.close();
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson", "cache-control": "no-store" } });
}
