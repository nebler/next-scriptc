// Development fixture: a deliberately accepted scalar helper in a hot JS loop.
export function scalarWeight(value: number): number {
  "use native";
  return value > 0 ? value * 3 + 1 : 0;
}
export function nestedAggregation(records: string): number {
  const values = JSON.parse(records) as number[];
  let total = 0;
  for (const value of values) total += scalarWeight(value) + scalarWeight(value + 1);
  return total;
}
