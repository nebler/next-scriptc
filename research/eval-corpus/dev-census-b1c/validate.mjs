import fs from 'node:fs';
import crypto from 'node:crypto';
import {readJsonArtifact} from '../../lib/artifact.mjs';
const dir=new URL('./',import.meta.url),summary=readJsonArtifact(new URL('summary.json',dir)),comparison=readJsonArtifact(new URL('comparison.json',dir));
const manifest=JSON.parse(fs.readFileSync(new URL('../manifest.json',import.meta.url)));
const expected=new Set(readJsonArtifact(new URL('../dev-census-b1/comparison.json',import.meta.url)).lostCoveredAcceptances.map(r=>r.repository));
const records=[];
for(const repository of expected){const pin=manifest.repositories.find(r=>r.repository===repository);if(pin.split!=='DEV'||/papermark/i.test(repository))throw Error('non-DEV selection');const data=readJsonArtifact(new URL(repository.split('/')[1]+'.json',dir));if(data.sha!==pin.sha)throw Error('pin drift');if(data.install&&data.freeBytesBeforeInstall<12_000_000_000)throw Error('disk floor');records.push({repository,status:data.status,installExit:data.install?.exit??null,freeBytesBeforeInstall:data.freeBytesBeforeInstall??null});}
if(summary.repos.length!==expected.size||comparison.lostTotal!==211||comparison.restored+comparison.keptRefused+comparison.unknown!==211)throw Error('comparison denominator');
const files=['construction-local.mjs','dependency-closure.mjs','module-initialization.mjs','promotion-discovery.mjs','module-functions.mjs','runtime-export-target.mjs','checked-index.mjs','extract.mjs'];
const sourceHashes=Object.fromEntries(files.map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(new URL('../../../packages/scriptc-promote/src/functions/'+file,dir))).digest('hex')]));
// Resolve from the repository root explicitly; no dependency paths are inspected.
fs.writeFileSync(new URL('validation.json',dir),JSON.stringify({records,sourceHashes,denominator:211,restored:comparison.restored,keptRefused:comparison.keptRefused,unknown:comparison.unknown,newlyAccepted:comparison.newlyAccepted.length,scope:'affected DEV repositories only',clones:'serial runner, at most one task-owned installed application clone',baseline:'b9c7f56',b1:'6cfeb847000084a35683bb813483e4608e59560a'},null,2)+'\n');
