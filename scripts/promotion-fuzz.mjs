import {fuzzPromotion} from '../packages/next-scriptc/test/support/promotion-fuzzer.mjs';
console.log(JSON.stringify(await fuzzPromotion()));
