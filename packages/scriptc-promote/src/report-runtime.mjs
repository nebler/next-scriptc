export function mergeRuntime(report,snapshot){
 if(snapshot.version!==1||!Array.isArray(snapshot.dispatchers))throw Error('Unsupported runtime snapshot');
 const observed=new Map();
 for(const d of snapshot.dispatchers)for(const [id,f] of Object.entries(d.functions)){
  const existing=observed.get(id)??{calls:0,native:0,fallback:0,buckets:[]};
  for(const key of ['calls','native','fallback'])existing[key]+=f[key];
  existing.buckets.push(...f.buckets);observed.set(id,existing);
 }
 const rows=report.files.flatMap(f=>f.functions),matched=new Set();
 for(const row of rows){const runtimeId=observed.has(row.promotionId)?row.promotionId:row.id;const f=observed.get(runtimeId);if(f){row.runtime={...f,outcome:f.native?'promoted & running native':f.fallback?'fell back':'stayed JS',reasons:[...new Set(f.buckets.map(b=>b.reason))]};matched.add(runtimeId);}}
 for(const route of report.routes)route.runtime=rows.filter(r=>route.reachable.includes(r.id)&&r.runtime).map(r=>({id:r.id,...r.runtime}));
 const values=[...observed.values()],calls=values.reduce((n,f)=>n+f.calls,0),native=values.reduce((n,f)=>n+f.native,0);
 const estimates=values.flatMap(f=>f.buckets.map(b=>b.estimatedCpuSavedMs)).filter(n=>n!==null&&n!==undefined);
 report.runtime={functionsRanNative:values.filter(f=>f.native>0).length,calls,native,nativePercent:calls?100*native/calls:0,estimatedCpuSavedMs:estimates.length?estimates.reduce((a,b)=>a+b,0):null,unmatchedIds:[...observed.keys()].filter(id=>!matched.has(id)).sort()};
 return report;
}
const rows=r=>r.files.flatMap(f=>f.functions);
const blocked=r=>r.status==='rejected'||r.extractionStatus==='blocked'||r.compileStatus==='blocked';
const accepted=r=>!blocked(r)&&(r.status==='accepted'||r.explicit===true);
export function ciSummary(report,baseline){
 const current=rows(report),previous=baseline?rows(baseline):[],byId=new Map(current.map(r=>[r.id,r])),old=new Map(previous.map(r=>[r.id,r]));
 return {version:1,counts:{accepted:current.filter(r=>r.status==='accepted').length,explicit:current.filter(r=>r.explicit).length,blocked:current.filter(blocked).length},
 newlyAccepted:current.filter(r=>accepted(r)&&!accepted(old.get(r.id)??{})).map(r=>r.id).sort(),
 newlyBlocked:current.filter(r=>blocked(r)&&!blocked(old.get(r.id)??{})).map(r=>r.id).sort(),
 regressedAccepted:previous.filter(r=>accepted(r)&&(!byId.has(r.id)||blocked(byId.get(r.id)))).map(r=>r.id).sort(),
 regressedExplicit:previous.filter(r=>r.explicit&&!blocked(r)&&(!byId.has(r.id)||blocked(byId.get(r.id)))).map(r=>r.id).sort(),
 fuzz:report.fuzz??null,compileEvidence:report.buildEvidence??'not supplied; extraction only'};
}
export function formatCi(ci){return '# Promotion CI report\n\n'+`${ci.counts.accepted} accepted; ${ci.counts.explicit} explicit; ${ci.counts.blocked} blocked.\n\n`+['newlyAccepted','newlyBlocked','regressedAccepted','regressedExplicit'].map(k=>`${k}: ${ci[k].join(', ')||'none'}`).join('\n\n')+`\n\nCompile evidence: ${ci.compileEvidence}.\n\nFuzz: ${ci.fuzz?JSON.stringify(ci.fuzz):'not supplied'}.\n`;}
