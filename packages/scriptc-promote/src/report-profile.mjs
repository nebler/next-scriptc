import {readFile} from 'node:fs/promises';
import {SourceMap, createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {repair} from './functions/diagnostics.mjs';
const require=createRequire(import.meta.url);

// V8 timestamps and deltas are microseconds. Never infer CPU from hitCount.
export function parseProfile(profile){
 if(!Array.isArray(profile.nodes)||!Array.isArray(profile.samples)||!profile.samples.length)throw Error('CPU profile requires nodes and nonempty samples');
 const nodes=new Map(),parents=new Map();
 for(const n of profile.nodes){if(nodes.has(n.id)||!n.callFrame)throw Error('Invalid CPU profile node');nodes.set(n.id,n);}
 for(const n of profile.nodes)for(const id of n.children??[]){if(!nodes.has(id)||parents.has(id))throw Error('Invalid CPU profile tree');parents.set(id,n.id);}
 for(const id of nodes.keys()){const seen=new Set();let at=id;while(at!==undefined){if(seen.has(at))throw Error('Cyclic CPU profile tree');seen.add(at);at=parents.get(at);}}
 let weights=profile.timeDeltas, timing='timeDeltas';
 if(!weights){const duration=profile.endTime-profile.startTime;if(!Number.isFinite(duration)||duration<=0)throw Error('CPU profile has no timing data');weights=profile.samples.map(()=>duration/profile.samples.length);timing='uniform duration estimate (timeDeltas absent)';}
 if(weights.length!==profile.samples.length||weights.some(n=>!Number.isFinite(n)||n<0)||profile.samples.some(id=>!nodes.has(id)))throw Error('Invalid CPU profile samples/timeDeltas');
 const totalUs=weights.reduce((a,b)=>a+b,0);if(!totalUs)throw Error('CPU profile has zero sampled duration');
 return {nodes,parents,samples:profile.samples,weights,totalUs,timing};
}
function cleanFile(url){
 try{if(url.startsWith('file:'))return fileURLToPath(url);}catch{return '';}
 return url.replace(/[?#].*$/,'').replace(/\\/g,'/');
}
function sourceFile(url,root,rows,base=root){
 let file=cleanFile(url).replace(/^.*?\[project\]\//,'').replace(/^webpack:\/\/[^/]*\//,'').replace(/^turbopack:\/\/\/?/,'');
 file=file.replace(/^\([^)]*\)\//,'').replace(/^\.\//,'');
 const exact=rows.filter(r=>path.resolve(root,r.file)===path.resolve(base,file));
 if(exact.length)return exact[0].file;
 const matches=[...new Set(rows.filter(r=>file===r.file||file.endsWith('/'+r.file)).map(r=>r.file))];
 return matches.length===1?matches[0]:null;
}
function resolveSourceRoots(data){
 if(data.sections)return {...data,sections:data.sections.map(section=>({...section,map:resolveSourceRoots(section.map)}))};
 return {...data,sourceRoot:'',sources:(data.sources??[]).map(source=>data.sourceRoot&&!/^(?:[a-z]+:|\/)/i.test(source)?data.sourceRoot.replace(/\/?$/,'/')+source:source)};
}
async function mapper(report){
 const rows=report.files.flatMap(f=>f.functions),fileRows=[...rows,...report.files.filter(f=>f.file)], maps=new Map(),inventories=new Map();
 const ts=require(require.resolve('typescript',{paths:[report.root,import.meta.dirname]}));
 async function inventory(file){
  if(inventories.has(file))return inventories.get(file);
  const out=[];inventories.set(file,out);
  try{const text=await readFile(path.resolve(report.root,file),'utf8'), sf=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true);
   function visit(n){if(ts.isFunctionLike(n)&&n.body){const start=n.getStart(sf),end=n.getEnd(),line=sf.getLineAndCharacterOfPosition(start).line+1;
    let name=n.name?.getText(sf);if(!name&&ts.isVariableDeclaration(n.parent))name=n.parent.name.getText(sf);
    const existing=rows.find(r=>r.file===file&&r.line===line&&(r.name===name||r.name==='default'));
    out.push({start,end,sf,row:existing??{id:`${file}#${name??'<anonymous>'}@${line}`,file,name:name??'<anonymous>',line,status:'excluded',async:!!n.modifiers?.some(m=>m.kind===ts.SyntaxKind.AsyncKeyword),diagnostics:[]}});
   }ts.forEachChild(n,visit);}visit(sf);
  }catch{}
  return out;
 }
 async function locate(file,line,column){
  const entries=await inventory(file);if(line<0||column<0||!entries.length)return null;
  const sf=entries[0].sf;if(line>=sf.getLineStarts().length)return null;
  const starts=sf.getLineStarts();if(column>(starts[line+1]??sf.text.length)-starts[line])return null;
  const offset=sf.getPositionOfLineAndCharacter(line,column);
  return entries.filter(e=>e.start<=offset&&offset<e.end).sort((a,b)=>(a.end-a.start)-(b.end-b.start))[0]?.row;
 }
 async function loadMap(url){
  const generated=cleanFile(url);if(!path.isAbsolute(generated))return null;
  if(maps.has(generated))return maps.get(generated);
  let result=null;
  try{const text=await readFile(generated,'utf8'), ref=[...text.matchAll(/[#@]\s*sourceMappingURL=([^\s*]+)/g)].at(-1)?.[1];
   let payload,base=path.dirname(generated);
   if(ref?.startsWith('data:')){const comma=ref.indexOf(',');payload=ref.slice(0,comma).includes(';base64')?Buffer.from(ref.slice(comma+1),'base64').toString():decodeURIComponent(ref.slice(comma+1));}
   else {const mapFile=ref?path.resolve(base,decodeURIComponent(ref)):generated+'.map';base=path.dirname(mapFile);payload=await readFile(mapFile,'utf8');}
   const data=JSON.parse(payload);result={map:new SourceMap(resolveSourceRoots(data)),base};
  }catch{}
  maps.set(generated,result);return result;
 }
 return async frame=>{
  const loaded=await loadMap(frame.url??'');
  if(loaded){const entry=loaded.map.findEntry(frame.lineNumber,frame.columnNumber);
   if(entry.originalSource){const file=sourceFile(entry.originalSource,report.root,fileRows,loaded.base);
    if(file){const row=await locate(file,entry.originalLine,entry.originalColumn);if(row)return {row,confidence:'source-map'};}
   }
  }
  const file=sourceFile(frame.url??'',report.root,fileRows);
  if(file){const direct=cleanFile(frame.url??'');
   if(path.resolve(direct)===path.resolve(report.root,file)){const row=await locate(file,frame.lineNumber,frame.columnNumber);if(row)return {row,confidence:'source-position'};}
   const name=(frame.functionName??'').replace(/^async /,'');const matches=rows.filter(r=>r.file===file&&r.name===name);
   if(matches.length===1)return {row:matches[0],confidence:'heuristic (file + function name)'};
  }
  return null;
 };
}
function estimate(row,share,report){
 const measurements=(report.measurements??[]).filter(m=>m.id===row.id&&m.status==='ok'&&m.metric==='thread-cpu'&&m.js.median>0).map(m=>m.native.median/m.js.median);
 const runtime=(row.runtime?.buckets??[]).filter(b=>b.decision?.metric==='thread-cpu'&&b.decision.samples>0).map(b=>b.decision.ratio);
 const ratios=(measurements.length?measurements:runtime).filter(r=>Number.isFinite(r)&&r>=0);
 if(!ratios.length)return {share,kind:'CPU share ceiling only; no measured CPU ratio'};
 const ratio=Math.min(...ratios);return {share:share*Math.max(0,1-ratio),ratio,kind:`optimistic estimate using best ${measurements.length?'--measure':'snapshot'} native/JS CPU ratio; assumes JS baseline and representative inputs`};
}
export async function profileReport(report,files,{suggest=false}={}){
 const map=await mapper(report),hot=new Map(),unmapped=new Map(),captures=[];let totalUs=0,mappedSelfUs=0,idleUs=0;
 for(const file of files){const parsed=parseProfile(JSON.parse(await readFile(file,'utf8'))),mapped=new Map();
  for(const [id,node] of parsed.nodes)mapped.set(id,await map(node.callFrame));
  const captureIdle=parsed.samples.reduce((sum,id,i)=>sum+(parsed.nodes.get(id).callFrame.functionName==='(idle)'?parsed.weights[i]:0),0);
  captures.push({file,sampledUs:parsed.totalUs,idleUs:captureIdle,totalUs:parsed.totalUs-captureIdle,samples:parsed.samples.length,timing:parsed.timing});totalUs+=parsed.totalUs-captureIdle;idleUs+=captureIdle;
  for(let i=0;i<parsed.samples.length;i++){const id=parsed.samples[i],weight=parsed.weights[i],self=mapped.get(id);
   if(parsed.nodes.get(id).callFrame.functionName==='(idle)')continue;
   if(self)mappedSelfUs+=weight;else {const f=parsed.nodes.get(id).callFrame,key=`${f.url}:${f.functionName}`;const u=unmapped.get(key)??{url:f.url,name:f.functionName,selfUs:0};u.selfUs+=weight;unmapped.set(key,u);}
   const seen=new Set();let at=id;
   while(at!==undefined){const match=mapped.get(at);if(match){const key=match.row.id;let h=hot.get(key);if(!h){h={...match.row,selfUs:0,inclusiveUs:0,confidence:[]};hot.set(key,h);}if(!h.confidence.includes(match.confidence))h.confidence.push(match.confidence);
     if(at===id)h.selfUs+=weight;if(!seen.has(key)){h.inclusiveUs+=weight;seen.add(key);}}
    at=parsed.parents.get(at);
   }
  }
 }
 const functions=[...hot.values()].map(row=>{const selfShare=totalUs?row.selfUs/totalUs:0,inclusiveShare=totalUs?row.inclusiveUs/totalUs:0;const exclusionReason=row.status==='excluded'?(row.async?'Async functions are excluded from automatic synchronous promotion.':/\.native\.[cm]?[jt]s$/.test(row.file)?'Native route handlers use the separate route compiler; extract a pure synchronous helper for function promotion.':'Discovery emitted no diagnostic; this callable is outside the accepted inventory (possibly nested, opted out, or an early exclusion).'):null;return {...row,exclusionReason,selfShare,inclusiveShare,potential:estimate(row,selfShare,report),blockers:row.diagnostics.map(message=>({message,hint:message.includes('Hint:')?message.split('Hint:').at(-1).trim():repair(message)}))};}).sort((a,b)=>b.potential.share-a.potential.share||b.selfUs-a.selfUs||a.id.localeCompare(b.id));
 const hotBlocked=functions.filter(r=>r.blockers.length||r.status==='excluded'||r.async),suggestions=[];
 if(suggest)for(const r of functions){const at=`${r.file}:${r.line}`;
  if(r.async)suggestions.push(`Extract the synchronous CPU core of ${r.name} at ${at} into a pure helper; awaits stay in JS.`);
  else if(r.blockers.length)suggestions.push(`${at} (${r.name}): ${r.blockers[0].hint}`);
  else if(r.status==='excluded')suggestions.push(`Inspect ${r.name} at ${at}: ${r.exclusionReason}`);
  else if(r.status==='accepted')suggestions.push(`Consider adding 'use native' to ${r.name} at ${at} for build-enforced compilation; measure representative inputs first.`);
  if(suggestions.length>=5)break;
 }
 return {version:1,totalUs,idleUs,mappedSelfUs,mappedSelfShare:totalUs?mappedSelfUs/totalUs:0,captures,functions,hotBlocked,suggestions,unmapped:[...unmapped.values()].sort((a,b)=>b.selfUs-a.selfUs),limitations:['V8 non-idle sample durations approximate on-CPU time; idle is excluded, while GC, native and unmapped frames stay in the denominator. This is not process CPU accounting.','Rank uses self CPU to avoid double counting nested candidates. Inclusive shares overlap; recursive source functions count once per sample. Savings estimates cannot be summed.','Source maps must match the capture and local source revision. Mapping confidence describes location evidence, not compiler eligibility. Missing maps fall back only to an unambiguous file and name.','Native work, inlining, optimized-away frames and async continuations can hide source CPU. A hot async frame suggests inspection, not proof of an outlineable core.','Best measured ratios are optimistic across inputs; wall-time ratios are excluded. Capture a JS baseline for savings estimates, since already-native profiles hide displaced JS work.']};
}
export function formatProfile(profile){
 const pct=n=>(100*n).toFixed(2)+'%';
 const lines=['Profile-guided promotion (ranked by self CPU potential):',`${(profile.totalUs/1000).toFixed(1)} ms non-idle sampled; ${pct(profile.mappedSelfShare)} self CPU mapped to app functions`];
 for(const r of profile.functions)lines.push(`${r.id} ${r.file}:${r.line} — ${r.status}${r.async?' (async; inspect sync core)':''}; self ${pct(r.selfShare)}, inclusive ${pct(r.inclusiveShare)}; potential ${pct(r.potential.share)} (${r.potential.kind}); mapping ${r.confidence.join(', ')}`);
 lines.push('Hot but blocked:');
 for(const r of profile.hotBlocked){lines.push(`  ${r.id}${r.exclusionReason?' — '+r.exclusionReason:r.async?' — async excluded from automatic sync promotion; inspect synchronous core':''}`);for(const b of r.blockers)lines.push(`    ${b.message}\n    Hint: ${b.hint}`);}
 if(!profile.hotBlocked.length)lines.push('  none mapped');
 for(const u of profile.unmapped.slice(0,10))lines.push(`Unmapped ${u.name||'<anonymous>'} ${u.url}: ${pct(profile.totalUs?u.selfUs/profile.totalUs:0)} self CPU`);
 if(profile.suggestions.length)lines.push('Suggested actions:',...profile.suggestions.map(s=>'  '+s));
 lines.push(...profile.limitations.map(s=>'Profile note: '+s));return lines.join('\n');
}
