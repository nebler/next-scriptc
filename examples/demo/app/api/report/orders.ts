export const regionCount = 8;
export const scenarioCount = 12;
export const monthCount = 60;
export const totalsLength = regionCount * (scenarioCount + 1);

export function projectionIndex(scenario: number, region: number): number {
  return regionCount + scenario * regionCount + region;
}

// Integer cents keep reductions exact regardless of partitioning or runtime.
export class Order {
  customer: number;
  region: number;
  amountCents: number;
  quantity: number;

  constructor(index: number) {
    this.customer = (index * 48271) % 100_003;
    this.region = index % regionCount;
    this.amountCents = 100 + (index * 7919) % 49_900;
    this.quantity = 1 + index % 5;
  }
}

export type Partition = { start: number; end: number };
export type ReportMessage = "ready" | number[];
