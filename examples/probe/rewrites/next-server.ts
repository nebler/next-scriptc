"use scriptc";

import { NextRequest, NextResponse } from "./next-shim.ts";

export async function GET(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const preview = request.nextUrl.searchParams.get("preview") === "1";
  const theme = request.cookies.get("theme")?.value ?? "light";
  return NextResponse.json({ slug, preview, theme }, { headers: { "cache-control": "private, no-store" } });
}
