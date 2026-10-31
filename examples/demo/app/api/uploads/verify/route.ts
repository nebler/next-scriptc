"use scriptc";

import { createHash } from "node:crypto";

export async function POST(request: Request) {
  const expected = request.headers.get("x-content-sha256") ?? "";
  if (!/^[0-9a-f]{64}$/i.test(expected)) {
    return Response.json({ error: "x-content-sha256 must be a hex SHA-256 digest" }, { status: 400 });
  }
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.length > 4 * 1024 * 1024) {
    return Response.json({ error: "upload must be at most 4 MiB" }, { status: 413 });
  }
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const verified = sha256 === expected.toLowerCase();
  return Response.json({ verified, sha256, bytes: bytes.length }, {
    status: verified ? 200 : 422, headers: { "cache-control": "no-store" },
  });
}
