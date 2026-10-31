"use native";

export async function POST(request: Request, context: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await context.params;
  const body = await request.text();
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${tenant}:${body}`));
  const hex = Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return Response.json({ tenant, sha256: hex }, { headers: { "x-request-id": crypto.randomUUID() } });
}
