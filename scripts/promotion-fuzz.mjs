import {fuzzPromotion} from '../packages/scriptc-promote/test/support/promotion-fuzzer.mjs';
console.log(JSON.stringify(await fuzzPromotion()));
