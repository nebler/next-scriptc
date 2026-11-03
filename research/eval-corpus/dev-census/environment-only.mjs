// Resolver evidence for report-only census batches. No application code executes.
import path from 'node:path';
import {environmentEvidence} from './environment.mjs';
const root=path.resolve(process.argv[2]),scopes=process.argv.slice(3);
if(!scopes.length)throw Error('Supply explicit source scopes');
console.log(JSON.stringify({environment:environmentEvidence(root,scopes),mode:'resolver evidence only; discovery counts come from report'}));
