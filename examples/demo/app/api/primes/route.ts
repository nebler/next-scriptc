"use scriptc";

export function GET(request: Request) {
  const value = new URL(request.url).searchParams.get("limit");
  const limit = value === null ? 1_000_000 : Number(value);
  if (!Number.isInteger(limit) || limit < 2 || limit > 10_000_000) {
    return Response.json({ error: "limit must be an integer between 2 and 10000000" }, { status: 400 });
  }

  const composite = new Uint8Array(limit + 1);
  for (let prime = 2; prime * prime <= limit; prime++) {
    if (composite[prime] !== 0) continue;
    for (let multiple = prime * prime; multiple <= limit; multiple += prime) {
      composite[multiple] = 1;
    }
  }

  let count = 0;
  let lastPrime = 0;
  for (let candidate = 2; candidate <= limit; candidate++) {
    if (composite[candidate] === 0) {
      count++;
      lastPrime = candidate;
    }
  }
  return Response.json({ limit, count, lastPrime });
}
