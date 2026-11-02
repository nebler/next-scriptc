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
