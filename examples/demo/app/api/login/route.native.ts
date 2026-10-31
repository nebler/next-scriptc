import { compareSync } from "bcryptjs";
import { SignJWT } from "jose";
import { audience, issuer, jwtKey, now } from "../verify/tokens.ts";

// A stored cost-10 hash, as a database lookup would return. Fixture password:
// "correct horse battery staple" for ada@example.com.
const account = {
  id: "user-42",
  email: "ada@example.com",
  role: "editor",
  passwordHash: "$2b$10$N9qo8uLOickgx2ZMRZoMyehtJ/whDdsI.d1w/JqKiOrDw8pCT0JLG",
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
  if (typeof email !== "string" || typeof password !== "string" || email.length > 254 || password.length === 0 || new TextEncoder().encode(password).length > 72) {
    return Response.json({ error: "Email and password required; password must be at most 72 UTF-8 bytes" }, { status: 400 });
  }

  // Synchronous verification blocks Node's event loop. Unknown users do the same hash work.
  const validPassword = compareSync(password, account.passwordHash);
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
