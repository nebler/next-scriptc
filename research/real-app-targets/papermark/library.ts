import { documentViewDistribution, watchTimeSeconds } from './entry.ts';
type Event = {view_id: string; event_type: string; start_time: number; end_time: number};
export function run(input: string): string {
  const events = JSON.parse(input) as Event[];
  return JSON.stringify({watch:watchTimeSeconds(events), distribution:documentViewDistribution(events,600)});
}
