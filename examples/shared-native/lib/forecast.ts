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
// Park–Miller generator: products stay below Number.MAX_SAFE_INTEGER.
function nextState(state: number): number {
  return (state * 16807) % 2147483647;
}
// A planning model, not financial advice: independent monthly revenue shocks,
// 1% monthly cost growth, no borrowing. Currency is whole dollars throughout.
export function forecast(input: ForecastInput): ForecastResult {
  // Bounds also keep type-generated fuzz cases finite and cheap.
  const trials = Math.max(1, Math.min(100000, Math.floor(input.trials)));
  let state = Math.abs(input.seed % 2147483646) + 1;
  let solvent = 0;
  let totalEndingCash = 0;
  for (let trial = 0; trial < trials; trial++) {
    let cash = input.cash;
    let revenue = input.revenue;
    let costs = input.costs;
    let survived = true;
    for (let month = 0; month < MONTHS; month++) {
      state = nextState(state);
      // Revenue growth between -12% and +16%, sampled without transcendental math.
      revenue = Math.floor(revenue * (0.88 + (state / 2147483647) * 0.28));
      costs = Math.floor(costs * 1.01);
      cash += revenue - costs;
      if (cash < 0) survived = false;
    }
    if (survived) solvent++;
    totalEndingCash += cash;
  }
  return {solvent, trials, totalEndingCash};
}
