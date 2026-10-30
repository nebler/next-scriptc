"use scriptc";

export async function GET(request: Request, context: { params: Promise<{ sku: string }> }) {
  const { sku } = await context.params;
  const origin = request.headers.get("x-upstream-origin");
  if (!origin) return Response.json({ error: "Missing upstream origin" }, { status: 503 });
  const upstream = await fetch(`${origin}/inventory/${encodeURIComponent(sku)}`, {
    headers: { accept: "application/json", "x-api-key": "probe-local-only" },
    signal: AbortSignal.timeout(5000),
  });
  if (!upstream.ok) return Response.json({ error: "Inventory unavailable" }, { status: 502 });
  const stock = await upstream.json() as { available: number; warehouse: string };
  return Response.json({ sku, available: stock.available, warehouse: stock.warehouse }, { headers: { "cache-control": "no-store" } });
}
