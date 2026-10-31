"use native";

const products = [
  { id: 1, name: "Desk lamp", price: 39 },
  { id: 2, name: "Monitor arm", price: 89 },
  { id: 3, name: "Desk mat", price: 25 },
];

export async function GET(request: Request, context: { params: Promise<{ shop: string }> }) {
  const { shop } = await context.params;
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  const limit = Number(url.searchParams.get("limit") ?? "20");
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    return Response.json({ error: "limit must be an integer between 1 and 100" }, { status: 400 });
  }
  const items = products.filter((product) => product.name.toLowerCase().includes(query)).slice(0, limit);
  return Response.json({ shop, items, count: items.length }, { headers: { "cache-control": "public, max-age=60" } });
}
