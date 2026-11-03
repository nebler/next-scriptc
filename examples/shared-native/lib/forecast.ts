export interface ForecastInput {
  trials: number;
  seed: number;
  cash: number;
  revenue: number;
  costs: number;
}
export interface ForecastResult {
  solvent: number;
  trials: number;
  totalEndingCash: number;
}
const MONTHS = 36;
// Mulberry32: all state mixing uses 32-bit integer operations.
function nextState(state: number): number {
  return (state + 1831565813) >>> 0;
}
function randomBits(state: number): number {
  const a = Math.imul(state ^ (state >>> 15), state | 1);
  const b = a ^ (a + Math.imul(a ^ (a >>> 7), a | 61));
  return (b ^ (b >>> 14)) >>> 0;
}
// A planning model, not financial advice: independent monthly revenue shocks,
// 1% monthly cost growth, no borrowing. Currency is whole dollars throughout.
export function forecast(input: ForecastInput): ForecastResult {
  // Bounds also keep type-generated fuzz cases finite and cheap.
  const trials = Math.max(1, Math.min(100000, Math.floor(input.trials)));
  let state = input.seed >>> 0;
  const initialCash = input.cash;
  const initialRevenue = input.revenue;
  const initialCosts = input.costs;
  let solvent = 0;
  let totalEndingCash = 0;
  for (let trial = 0; trial < trials; trial++) {
    let cash = initialCash;
    let revenue = initialRevenue;
    let costs = initialCosts;
    let survived = true;
    for (let month = 0; month < MONTHS; month++) {
      state = nextState(state);
      // Revenue growth between -12% and +16%, sampled without transcendental math.
      revenue = Math.floor(revenue * (0.88 + (randomBits(state) / 4294967296) * 0.28));
      costs = Math.floor(costs * 1.01);
      cash += revenue - costs;
      if (cash < 0) survived = false;
    }
    if (survived) solvent++;
    totalEndingCash += cash;
  }
  return {solvent, trials, totalEndingCash};
}
