export function GET(request: Request) {
  const language = request.headers.get("accept-language") ?? "en";
  const message = language.startsWith("de") ? "Hallo von next-scriptc!" : "Hello from next-scriptc!";
  return Response.json({ message }, { headers: { vary: "accept-language" } });
}
