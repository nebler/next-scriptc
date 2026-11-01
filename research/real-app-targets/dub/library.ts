import { convertToCSV } from './entry.ts';
export function run(input: string): string {
  return convertToCSV(JSON.parse(input) as object[]);
}
