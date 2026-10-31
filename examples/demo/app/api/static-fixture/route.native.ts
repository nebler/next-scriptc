// E2E fixture: keep this pure so Next owns its prerendered response.
export function GET() {
  return Response.json({ fixture: "static" });
}
