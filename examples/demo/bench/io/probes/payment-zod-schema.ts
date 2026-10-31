import { z } from "zod";

export const payment = z.object({
  id: z.string().regex(/^evt_[a-zA-Z0-9_-]{1,64}$/),
  type: z.enum(["payment_intent.succeeded"]),
  data: z.object({ object: z.object({
    id: z.string().regex(/^pi_[a-zA-Z0-9_-]{1,64}$/),
    amount_received: z.number().int().min(1).max(100000000),
    currency: z.enum(["usd"]),
    metadata: z.object({ orderId: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/) }),
  }) }),
});
