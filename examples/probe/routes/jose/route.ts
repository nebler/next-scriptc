"use native";

import { SignJWT, jwtVerify } from "jose";
const key = new TextEncoder().encode("probe-only-signing-key-at-least-32-bytes");
export async function GET() {
  const token = await new SignJWT({ role: "editor" }).setProtectedHeader({ alg: "HS256" }).setSubject("user-42").setIssuer("probe").setAudience("demo").setIssuedAt(1793318400).setExpirationTime(1793322000).sign(key);
  const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"], issuer: "probe", audience: "demo", currentDate: new Date(1793318400 * 1000) });
  let rejected = false;
  try { await jwtVerify(token + "x", key); } catch { rejected = true; }
  return Response.json({ token, payload, rejected });
}
