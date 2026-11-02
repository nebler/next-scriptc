import { revenueCore } from '../lib/revenue-core.ts';
import { serialize } from '../../../packages/next-scriptc/src/functions/json.ts';
export function run(input: string): string {
  const a = JSON.parse(input) as [string, string, string];
  const value = revenueCore(a[0], a[1], a[2]);
  return serialize(value, true, () => JSON.stringify(value));
}
