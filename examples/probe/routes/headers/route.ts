"use native";

export async function GET(request: Request, context: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await context.params;
  const cookie = request.headers.get("cookie") ?? "";
  let theme = "light";
  for (const part of cookie.split(";")) {
    const pair = part.trim().split("=");
    if (pair[0] === "theme" && pair[1] === "dark") theme = "dark";
  }
  const headers = new Headers({ "cache-control": "private, no-store", vary: "Cookie, Accept-Language" });
  headers.append("set-cookie", `theme=${theme}; Path=/; HttpOnly; SameSite=Lax`);
  headers.append("set-cookie", "visited=1; Path=/; SameSite=Lax");
  headers.set("x-tenant", tenant);
  return Response.json({ tenant, theme, language: request.headers.get("accept-language") ?? "en" }, { headers });
}
