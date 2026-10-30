"use scriptc";

export function GET(request: Request) {
  return Response.json({ url: request.url, host: request.headers.get("host") });
}
