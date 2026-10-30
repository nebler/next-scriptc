// Public demo credentials; deployments should supply their own signing secret.
export const jwtKey = new TextEncoder().encode(process.env.DEMO_JWT_SECRET ?? "next-scriptc-demo-only-signing-key-32-bytes");
export const issuer = "next-scriptc-demo";
export const audience = "demo-api";

// Tests pin the clock in both servers, so iat/exp and verification remain byte-comparable.
const configuredClock = process.env.DEMO_JWT_NOW;
const fixedClock = configuredClock === undefined ? undefined : Number(configuredClock);
if (fixedClock !== undefined && (!Number.isSafeInteger(fixedClock) || fixedClock < 0)) {
  throw new Error("DEMO_JWT_NOW must be a nonnegative integer Unix timestamp");
}

export function now() {
  return fixedClock ?? Math.floor(Date.now() / 1000);
}
