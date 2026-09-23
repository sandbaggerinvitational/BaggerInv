import test from 'node:test';
import assert from 'node:assert/strict';
import {publicGuideGolf, publicHistoryArchiveGolf, publicGolfAllowlist} from '../lib/spectator-golf-projection.js';
import {mobilePublicGuideGolfData, mobileGuideDataFromProjection} from '../lib/mobile-v1-guide.js';
import {createPublicGolfReader} from '../lib/spectator-golf-service.js';
import {publishedRead} from './fixtures/expanded-spectator/guide.mjs';
import {historicalView} from './fixtures/reviewer-history.mjs';
const excluded=['netSkins','calcutta','email','phone','authUserId','participantAccess','leaseToken','writeToken','myMatch','ownership','holdings','purchasePrice','contacts','dining','localGuide','revision','deliveryFingerprint'];
function poison(v,key){if(Array.isArray(v))return v.map(x=>poison(x,key));if(v&&typeof v==='object')return {...Object.fromEntries(Object.entries(v).map(([k,x])=>[k,poison(x,key)])),[key]:'SECRET_CANARY'};return v;}
for(const [resource,value] of Object.entries({guide:mobilePublicGuideGolfData(publishedRead()),archive:{tournaments:[publicHistoryArchiveGolf([historicalView()]).tournaments[0]]}}))for(const key of excluded)test(`${resource} closed recursive ${key}`,()=>{assert.deepEqual(publicGolfAllowlist(resource,poison(value,key)),publicGolfAllowlist(resource,value));assert(!JSON.stringify(publicGolfAllowlist(resource,poison(value,key))).includes('SECRET_CANARY'));});
test('Guide public golf retains existing native content without account/contact authority',()=>{
 const read=publishedRead(),d=publicGuideGolf(read);
 const participant=mobileGuideDataFromProjection(read,{playerId:'P1',tournamentId:'2026',context:{membership:{active:true},tournament:{id:'2026',year:2026}}});
 for(const key of ['tournament','overview','courses','rules','assets'])assert.deepEqual(d[key],participant[key]);
 for(const key of ['contacts','dining','localGuide'])assert(!(key in d));
 assert.equal(d.courses[0].assignments[0].holes.length,18);
});
test('Guide money/contact editorial sections do not become public',()=>{
 const r=publishedRead();const c=r.payload.data.content.content;
 c.overview.push({...c.overview[0], 'Section ID':'private','Section Name':'Calcutta','Description':'purchase price $400'});
 c.ruleBook.push({...c.ruleBook[0], 'Rule ID':'private',Title:'Contact',Body:'reach support@example.com or 843-555-0199'});
 const d=JSON.stringify(publicGuideGolf(r));assert(!/purchase|\$400|support@example|843-555|Calcutta/.test(d));
});
test('Guide unauthenticated projection never weakens participant identity guard',()=>{assert.throws(()=>mobileGuideDataFromProjection(publishedRead(),{}));});
test('Archive preserves canonical native year fields, no internal revision',()=>{const d=publicHistoryArchiveGolf([historicalView()]);assert.equal(d.tournaments[0].year,2025);assert(!('revision' in d.tournaments[0]));assert.throws(()=>publicHistoryArchiveGolf([historicalView(),historicalView()]));assert.throws(()=>publicHistoryArchiveGolf([{...historicalView(),year:2027}]));});
test('Guide revalidates publication every read, archive guard runs on warm cache',async()=>{
 let n=0,guard=0;const reads={guard:()=>{guard++},guide:async()=>{n++;return publishedRead()},archive:async()=>[historicalView()]};const read=createPublicGolfReader(reads);
 await read(['guide']);await read(['guide']);await read(['archive']);await read(['archive']);assert.equal(n,2);assert.equal(guard,4);
 reads.guard=()=>{throw Error('disabled')};await assert.rejects(read(['archive']),/disabled/);
});
