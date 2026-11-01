import { documentViewDistribution, watchTimeSeconds, viewPlaybackTimeline } from './entry.ts';
const e = [{view_id:'a',event_type:'played',start_time:0,end_time:60}];
console.log(JSON.stringify(documentViewDistribution(e,60)));
console.log(JSON.stringify(watchTimeSeconds(e)));
console.log(JSON.stringify(viewPlaybackTimeline(e,60)));
