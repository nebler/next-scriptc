import test from 'node:test';import assert from 'node:assert/strict';import {category,intrinsicRefusal} from './categories.mjs';
test('source filenames do not masquerade as mutation/effect blockers',()=>{
 const msg='[next-scriptc] not a candidate helper: [next-scriptc] /tmp/nsc-dev-census/app/src/mutation.ts: function helper: unsupported reference Buffer';
 assert.equal(category(msg),'unsupported reference/type');assert.equal(intrinsicRefusal(msg),false);
 assert.equal(intrinsicRefusal('dependency closure: unresolved runtime import @lib/mutation'),false);
});
test('explicit refusals retain meaning across finer display categories',()=>{
 assert.equal(category('dependency closure: /tmp/nsc-dev-census/app/node_modules/@types/x/index.d.ts: unproved module initialization TSExportAssignment'),'declaration/type-only graph handling');
 const msg='dependency closure: transitive effect proof: nonlocal mutation at 2';assert.equal(category(msg),'transitive effect proof');assert.equal(intrinsicRefusal(msg),true);
 assert.equal(intrinsicRefusal('dependency closure: constant graph mutation or escaping reference'),true);
 assert.equal(category('purity: argument mutation'),'mutation proof');assert.equal(intrinsicRefusal('purity: argument mutation'),true);
 assert.equal(category('dependency closure: unresolved runtime import missing'),'runtime dependency boundary');assert.equal(intrinsicRefusal('dependency closure: unresolved runtime import missing'),false);
});
test('NSC locations and B1 temporary paths do not change first refusals',()=>{
 const prefix='[next-scriptc] not a candidate mutation: [next-scriptc] /tmp/b1-verified-clones/app/src/mutation.ts:4:1 - NSC1001: ';
 assert.equal(category(prefix+'function mutation: unsupported reference Buffer'),'unsupported reference/type');
 assert.equal(intrinsicRefusal(prefix+'function mutation: unsupported reference Buffer'),false);
 assert.equal(category(prefix+'dependency closure: /tmp/b1-verified-clones/app/src/mutation.ts: unresolved runtime import missing'),'runtime dependency boundary');
 for(const reason of ['unknown active export conditions','ambiguous active package export conditions for pkg','unsupported active package export condition custom']){
  assert.equal(category(prefix+'dependency closure: '+reason),'package exports/resolver policy');assert.equal(intrinsicRefusal(prefix+'dependency closure: '+reason),true);
 }
});
