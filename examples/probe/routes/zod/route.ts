"use scriptc";

import { z } from "zod";

const createOrder = z.object({
  email: z.string().email(),
  quantity: z.number().int().min(1).max(100),
  sku: z.string().min(3),
});

export async function POST(request: Request, context: { params: Promise<{ shop: string }> }) {
  const { shop } = await context.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = createOrder.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid order", issues: parsed.error.issues }, { status: 422 });
  }
  return Response.json({ shop, order: parsed.data }, { status: 201, headers: { location: `/shops/${shop}/orders/new` } });
}
