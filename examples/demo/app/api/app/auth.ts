import { jwtVerify } from "jose";
import { audience, issuer, jwtKey, now } from "../verify/tokens.ts";

export async function subject(request: Request): Promise<string | null> {
  const cookie = request.headers.get("cookie") ?? "";
  let token = "";
  for (const part of cookie.split(";")) {
    const entry = part.trim();
    if (entry.startsWith("session=")) token = entry.slice(8);
  }
  try {
    const { payload } = await jwtVerify(token, jwtKey, {
      algorithms: ["HS256"], issuer, audience, requiredClaims: ["sub", "iat", "exp"],
      currentDate: new Date(now() * 1000),
    });
    if (typeof payload.sub !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(payload.sub)) return null;
    return payload.sub;
  } catch { return null; }
}
