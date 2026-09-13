import assert from 'node:assert/strict';
import test from 'node:test';
import {productionCalcuttaPresentation} from '../lib/mobile-v1-calcutta-presentation.js';
const contract = () => ({published:true,publicationState:'PUBLISHED',state:'OFFICIAL',tournamentId:'2030',currencyCode:'USD',configurationRevision:1,configurationFingerprint:'a'.repeat(64),market:{purchases:[]},result:{completedRounds:[2],golfers:[{player:{playerId:'A'},rounds:[{roundNumber:2,format:'SC',points:100}]}]}});
test('published projection copies canonical financial values and omits absent Pair Points',()=>{
 const c=contract();const before=structuredClone(c);const p=productionCalcuttaPresentation(c,{distributedPrizePool:'123.456',guaranteedDistributed:'99.5',privateSecret:'never'},'viewer');
 assert.equal(p.market,c.market);assert.equal(p.result,c.result);assert.deepEqual(c,before);
 assert.deepEqual(p.financialSummary,{projectedPool:'123.456',guaranteedAllocation:'99.5'});
 assert.deepEqual(p.entries,[]);assert.equal(p.result.golfers[0].rounds[0].points,100);
 assert.equal(JSON.stringify(p).includes('teamCompetition'),false);assert.equal(JSON.stringify(p).includes('privateSecret'),false);
});
test('unpublished and unavailable published result never expose presentation',()=>{
 for(const changes of [{published:false},{publicationState:'UNPUBLISHED'},{result:null},{market:null}]) assert.equal(productionCalcuttaPresentation({...contract(),...changes},{distributedPrizePool:1,guaranteedDistributed:1},'viewer'),null);
 assert.equal(productionCalcuttaPresentation(contract(),{},'viewer'),null);
});
test('conflicting canonical round formats fail closed',()=>{
 const c=contract();c.result.golfers.push({rounds:[{roundNumber:2,format:'BB'}]});
 assert.throws(()=>productionCalcuttaPresentation(c,{distributedPrizePool:1,guaranteedDistributed:1},'viewer'));
});
