import * as v from "valibot";

// Zod was tested first; its async module loader path refuses SC1016. Both
// variants use this unmodified Valibot schema with the same constraints.
export const createOrder = v.strictObject({
  id: v.pipe(v.string(), v.regex(/^[a-zA-Z0-9_-]{1,64}$/)),
  email: v.pipe(v.string(), v.email(), v.maxLength(254)),
  items: v.pipe(v.array(v.strictObject({
    sku: v.picklist(["LAMP", "DESK", "CABLE", "MUG"]),
    quantity: v.pipe(v.number(), v.integer(), v.check((quantity) => quantity >= 1 && quantity <= 20, "Quantity must be between 1 and 20")),
  })), v.minLength(1), v.maxLength(10)),
});

export type Order = {
  id: string; userId: string; email: string; createdAt: number; status: string;
  items: { sku: string; quantity: number; unitPriceCents: number }[];
};

export function price(sku: string) {
  if (sku === "LAMP") return 4900;
  if (sku === "DESK") return 29900;
  if (sku === "CABLE") return 1200;
  return 1800;
}
