"use scriptc";

export async function GET(request: Request, context: { params: Promise<{ account: string }> }) {
  const { account } = await context.params;
  const minimum = Number(new URL(request.url).searchParams.get("min") ?? "25");
  if (!Number.isFinite(minimum) || minimum < 0) return Response.json({ error: "Invalid minimum" }, { status: 400 });
  const rows = Array.from({ length: 2500 }, (_, index) => ({
    id: index + 1,
    amount: (index * 7919) % 10000,
    category: index % 3 === 0 ? "hardware" : "software",
  }));
  const selected = rows.filter((row) => row.amount >= minimum * 100);
  const cents = selected.reduce((total, row) => total + row.amount, 0);
  const top = selected.sort((a, b) => b.amount - a.amount).slice(0, 3);
  return Response.json({ account, count: selected.length, cents, top });
}
