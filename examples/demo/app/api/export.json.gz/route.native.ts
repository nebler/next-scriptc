import { gzipSync } from "node:zlib";

type ExportRow = { id: string; region: string; amountCents: number; quantity: number };
const records: ExportRow[] = [];
for (let i = 0; i < 5000; i++) {
  records.push({ id: `invoice-${i + 1}`, region: `region-${i % 8}`,
    amountCents: 100 + (i * 7919) % 49900, quantity: 1 + i % 5 });
}

export function GET(request: Request) {
  const rows = Number(new URL(request.url).searchParams.get("rows") ?? "5000");
  if (!Number.isInteger(rows) || rows < 1 || rows > records.length) {
    return Response.json({ error: "rows must be an integer from 1 to 5000" }, { status: 400 });
  }
  const json = JSON.stringify({ rows: records.slice(0, rows) });
  return new Response(new Uint8Array(gzipSync(json, { level: 6 })), { headers: {
    "content-type": "application/json; charset=utf-8",
    "content-encoding": "gzip",
    "content-disposition": 'attachment; filename="export.json.gz"',
    "cache-control": "no-store",
  } });
}
