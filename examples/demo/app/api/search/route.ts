"use scriptc";

import MiniSearch from "minisearch";
import { products, type Product } from "./catalog.ts";

// Each server builds and retains the catalog index once, rather than per request.
const index = new MiniSearch({
  fields: ["title", "description", "category"],
  searchOptions: { boost: { title: 3, category: 2 }, prefix: true, fuzzy: 0.2, combineWith: "AND" },
});
index.addAll(products);
const byId = new Map<string, Product>();
for (const product of products) byId.set(product.id, product);

export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const query = (params.get("q") ?? "").trim();
  const limit = Number(params.get("limit") ?? "20");
  if (query.length > 200 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
    return Response.json({ error: "q must be at most 200 characters; limit must be an integer from 1 to 100" }, { status: 400 });
  }
  const matches = query ? index.search(query) : [];
  matches.sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return Response.json({
    query,
    total: matches.length,
    results: matches.slice(0, limit).map((match) => {
      const product = byId.get(match.id as string)!;
      return { id: product.id, title: product.title, category: product.category, priceCents: product.priceCents, stock: product.stock };
    }),
  }, { headers: { "cache-control": "no-store" } });
}
