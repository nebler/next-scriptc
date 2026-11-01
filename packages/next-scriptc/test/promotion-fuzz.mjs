import test from 'node:test';
import {fuzzPromotion} from './support/promotion-fuzzer.mjs';
test('seeded real-addon strict/construction differential fuzz',async()=>{console.log(JSON.stringify(await fuzzPromotion()));});
