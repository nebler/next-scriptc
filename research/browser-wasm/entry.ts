import {forecast, type ForecastInput} from '../../examples/shared-native/lib/forecast.ts';
export function run(input: string): string {
  const args = JSON.parse(input) as [ForecastInput];
  return JSON.stringify(forecast(args[0]));
}
