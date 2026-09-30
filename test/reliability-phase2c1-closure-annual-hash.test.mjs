// Proof layer: UNIT. Actual PostgreSQL agreement is in annual-create integration.
import assert from 'node:assert/strict';
import test from 'node:test';
import {annualRuntimeRequestHash,annualRuntimeRequestJsonbText} from '../lib/annual-runtime-request-hash.js';

test('annual wire hash follows PostgreSQL UTF-8 key ordering and decimal exponent expansion',()=>{
 assert.equal(annualRuntimeRequestJsonbText({bb:1,a:1e-7,é:'été',aa:1.23e21}),'{"a": 0.0000001, "aa": 1230000000000000000000, "bb": 1, "é": "été"}');
 assert.equal(annualRuntimeRequestJsonbText([-0,-1.23e-7,1e21]),'[0, -0.000000123, 1000000000000000000000]');
});
test('annual wire hash matches actual JSON omission and remains order independent',()=>{
 assert.equal(annualRuntimeRequestHash({a:1,discard:undefined,b:[undefined,true]}),annualRuntimeRequestHash({b:[null,true],a:1}));
 assert.notEqual(annualRuntimeRequestHash({a:1}),annualRuntimeRequestHash({a:2}));
});
