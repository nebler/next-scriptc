import { readArtifact } from '../lib/artifact.mjs';
import fs from 'node:fs';
const census=JSON.parse(readArtifact(new URL('census.json',import.meta.url)));
const historical=JSON.parse(readArtifact(new URL('../coverage-baseline/summary.json',import.meta.url))).filter(r=>/^(umami|dub)-/.test(r.name));
const output={method:'Static A0 census; historical K1 JavaScript profiles only. No region timing or native compilation.',apps:{},historicalK1:historical};
for(const [app,a] of Object.entries(census.apps)){
 const path=r=>app==='umami'?r.file==='src/queries/sql/events/saveEventData.ts':app==='dub'?r.file==='apps/web/app/api/links/export/route.ts':false;
 const probe={};for(const r of a.rows){const c=r.boundaryProbe==='pass'?'pass':/\(type .*\b(any|unknown)\b/.test(r.boundaryProbe)?'any/unknown':/Date|(?:createdAt|updatedAt).*toString/.test(r.boundaryProbe)?'Date/callable':/Prisma/.test(r.boundaryProbe)?'Prisma named type':'other';probe[c]=(probe[c]??0)+1;}
 output.apps[app]={files:a.files,asyncFunctions:a.asyncFunctions,regions:a.regions,accepted:a.accepted,discoveryBoundaryPassBeforeStrictAndProof:a.discoveryAccepted,rejections:a.rejections,boundaryProbeFirstFailure:probe,anyUnknownLiveBoundary:a.anyUnknownRegions,unresolvedLiveBoundary:a.unresolvedRegions,concreteDateLiveBoundary:a.rows.filter(r=>r.liveIns.concat(r.liveOuts).some(v=>/\bDate\b/.test(v.type)&&!v.anyUnknown)).length,anyTyping:{verifiedWitnessCount:a.anyTypingWitnessPasses,optimisticUpperBound:a.anyTypingAdditionalUpperBound,witnessRegions:a.rows.filter(r=>r.counterfactualWitnesses?.length).map(r=>({file:r.file,line:r.line,schemas:r.counterfactualWitnesses,profiledPath:path(r)}))},k1PathRegions:a.rows.filter(path).map(r=>({file:r.file,line:r.line,endLine:r.endLine,function:r.function,accepted:r.accepted,rejection:r.rejection,anyUnknown:r.anyUnknown})),acceptedRegions:a.rows.filter(r=>r.accepted).map(r=>({file:r.file,line:r.line,profiledPath:path(r)})),newlyAcceptedK1CpuSharePercent:app==='formbricks'?null:0};
}
fs.writeFileSync(new URL('summary.json',import.meta.url),JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({...output,historicalK1:undefined},null,2));
