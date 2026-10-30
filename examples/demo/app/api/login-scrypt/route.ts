"use scriptc";

import { scrypt, timingSafeEqual } from "node:crypto";
import { SignJWT } from "jose";
import { audience, issuer, jwtKey, now } from "../verify/tokens.ts";

// Public stored scrypt fixture, as a database lookup would return. Password:
// "correct horse battery staple" for ada@example.com.
const account = {
  id: "user-42",
  email: "ada@example.com",
  role: "editor",
  salt: "a8f5f167f44f4964e6c998dee827110c",
  passwordHash: "cff3c67adafce6045536dbda0ef24af08c157db07493d96fbcf2f6440a135b504f65ff192006ec9c7cf3814cde63cf03894c04a10465e943c8dc742130663b97",
};

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return Response.json({ error: "Email and password required" }, { status: 400 });
  }
  const input = body as Record<string, unknown>;
  const email = input.email;
  const password = input.password;
  if (typeof email !== "string" || typeof password !== "string" || email.length > 254 || password.length === 0 || new TextEncoder().encode(password).length > 1024) {
    return Response.json({ error: "Email and password required; password must be at most 1024 UTF-8 bytes" }, { status: 400 });
  }

  // Async scrypt leaves Node's event loop free; no threadpool-size tuning.
  // N=2^15, r=8, p=1 uses about 32 MiB; maxmem allows algorithm overhead.
  // Unknown users perform the same derivation and constant-time hash comparison.
  const derived = await new Promise<Buffer>((resolve, reject) => {
    scrypt(password, Buffer.from(account.salt, "hex"), 64,
      { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, key) => {
        if (error) reject(error); else resolve(key);
      });
  });
  const validPassword = timingSafeEqual(derived, Buffer.from(account.passwordHash, "hex"));
  if (!validPassword || email.trim().toLowerCase() !== account.email) {
    return Response.json({ error: "Invalid credentials" }, { status: 401, headers: { "cache-control": "no-store" } });
  }
  const issuedAt = now();
  const accessToken = await new SignJWT({ role: account.role })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(account.id).setIssuer(issuer).setAudience(audience)
    .setIssuedAt(issuedAt).setExpirationTime(issuedAt + 3600).sign(jwtKey);
  return Response.json({ accessToken, tokenType: "Bearer", expiresIn: 3600 }, { headers: { "cache-control": "no-store" } });
}
