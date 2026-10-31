import { z } from "zod";

export const createOrder = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),
  email: z.string().email().max(254),
  items: z.array(z.object({
    sku: z.enum(["LAMP", "DESK", "CABLE", "MUG"]),
    quantity: z.number().int().min(1).max(20),
  }).strict()).min(1).max(10),
}).strict();

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
