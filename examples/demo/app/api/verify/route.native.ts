import { jwtVerify } from "jose";
import { audience, issuer, jwtKey, now } from "./tokens.ts";

export async function GET(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) {
    return Response.json({ error: "Bearer token required" }, {
      status: 401,
      headers: { "www-authenticate": "Bearer", "cache-control": "no-store" },
    });
  }
  try {
    const { payload } = await jwtVerify(authorization.slice(7), jwtKey, {
      algorithms: ["HS256"],
      issuer,
      audience,
      requiredClaims: ["sub", "iat", "exp"],
      currentDate: new Date(now() * 1000),
    });
    return Response.json({ subject: payload.sub, role: payload.role, expiresAt: payload.exp }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ error: "Invalid or expired token" }, {
      status: 401,
      headers: { "www-authenticate": 'Bearer error="invalid_token"', "cache-control": "no-store" },
    });
  }
}
