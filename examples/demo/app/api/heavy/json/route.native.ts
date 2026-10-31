import { add, headers, invalid, sorted, type Total } from "../common.ts";
type Customer = { id: number; region: number; discountBps: number };
type Order = {
  id: number;
  customerId: number;
  amountCents: number;
  quantity: number;
  status: string;
  note: string;
};
type Export = { customers: Customer[]; orders: Order[] };
type Item = {
  id: number;
  customerId: number;
  region: number;
  netCents: number;
};
function bounded(n: number, min: number, max: number) {
  return Number.isSafeInteger(n) && n >= min && n <= max;
}
export async function POST(request: Request) {
  try {
    const text = await request.text();
    if (text.length > 16 * 1024 * 1024) return invalid();
    const input = JSON.parse(text) as Export;
    if (
      !input ||
      !Array.isArray(input.customers) ||
      !Array.isArray(input.orders)
    )
      return invalid();
    const customers = new Map<number, Customer>();
    for (const customer of input.customers) {
      if (
        !customer ||
        !bounded(customer.id, 0, 1_000_000) ||
        !bounded(customer.region, 0, 7) ||
        !bounded(customer.discountBps, 0, 5000) ||
        customers.has(customer.id)
      )
        return invalid();
      customers.set(customer.id, customer);
    }
    const totals = new Map<number, Total>();
    const items: Item[] = [];
    for (const order of input.orders) {
      if (
        !order ||
        !bounded(order.id, 0, 1_000_000) ||
        !bounded(order.customerId, 0, 1_000_000) ||
        !bounded(order.amountCents, 0, 1_000_000) ||
        !bounded(order.quantity, 1, 100) ||
        typeof order.note !== "string" ||
        (order.status !== "paid" && order.status !== "refund")
      )
        return invalid();
      const customer = customers.get(order.customerId);
      if (!customer) return invalid();
      if (order.status === "paid") {
        const netCents = Math.floor(
          (order.amountCents *
            order.quantity *
            (10000 - customer.discountBps)) /
            10000,
        );
        items.push({
          id: order.id,
          customerId: order.customerId,
          region: customer.region,
          netCents,
        });
        add(totals, customer.region, netCents);
      }
    }
    items.sort((a, b) => b.netCents - a.netCents || a.id - b.id);
    return Response.json(
      {
        rows: input.orders.length,
        accepted: items.length,
        groups: sorted(totals),
        items,
      },
      { headers },
    );
  } catch {
    return invalid();
  }
}
