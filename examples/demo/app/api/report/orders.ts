// Integer cents keep reductions exact regardless of partitioning or runtime.
export class Order {
  customer: number;
  region: number;
  amountCents: number;
  quantity: number;

  constructor(index: number) {
    this.customer = (index * 48271) % 100_003;
    this.region = index % 8;
    this.amountCents = 100 + (index * 7919) % 49_900;
    this.quantity = 1 + index % 5;
  }
}

export type Partition = { start: number; end: number };
