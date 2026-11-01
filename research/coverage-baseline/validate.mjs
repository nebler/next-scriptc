import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=n=>JSON.parse(fs.readFileSync(new URL(n,import.meta.url)));
const p=read('profiles.json'),s=read('summary.json'),c=read('census.json');
assert.equal(p.results.length,6);assert.equal(s.length,6);
for(const r of p.results){assert.equal(r.rounds.length,3);for(const t of r.rounds){assert.ok(t.cpuUs>=500000);assert.equal(Object.values(t.profile.counts).reduce((a,b)=>a+b,0),t.profile.activeSamples);assert.ok(Math.abs(Object.values(t.profile.shares).reduce((a,b)=>a+b,0)-100)<1e-8);}}
for(const r of s){assert.ok(Math.abs(Object.values(r.split).reduce((a,b)=>a+b.mean,0)-100)<1e-8);}
assert.equal(c.apps.papermark.actual.accepted.length,5);assert.equal(c.apps.dub.actual.accepted.length,9);assert.equal(c.apps.umami.actual.accepted.length,0);assert.equal(c.apps.umami.strictCounterfactual.accepted.length,3);
assert.ok(c.apps.papermark.actual.accepted.find(r=>r.name==='documentViewDistribution').constructionProof.eligible);
console.log('Validated six profiles, category accounting, and discovery census.');
