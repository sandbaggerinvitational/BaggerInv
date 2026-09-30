// Proof layer: UNIT. Actual browser annual client adapter; no provider or database.
import assert from 'node:assert/strict';
import test from 'node:test';
import {submitFutureYearAdministration} from '../lib/future-year-administration-client.js';
import {buildFutureYearAdministrationMutation} from '../lib/production-future-year-administration-contract.js';
const operationRequestId='a1111111-1111-4111-8111-111111111111';
const review={action:'create',expectedRevision:0,operationRequestId,values:{targetTournamentId:'2098',tournamentYear:2098,name:'Synthetic year',destination:'Synthetic course',startDate:'2098-09-20',endDate:'2098-09-22',timeZone:'America/Chicago',reason:'Synthetic canonical annual proof',creationMode:'BLANK'}};
const receipt={ok:true,targetTournamentId:'2098',revision:1,lifecycle:'DRAFT',operation:'CREATE_TOURNAMENT',receiptId:'synthetic-receipt'};
const current={selectedTournament:{tournamentId:'2098',tournamentYear:2098,revision:1,lifecycle:'DRAFT'}};
const respond=(data,status=200)=>Response.json({ok:status===200,data},{status});
test('NA-2026-ANNUAL-CREATE-CONTRACT: target year never overwrites current authority field',()=>{
 const operation=buildFutureYearAdministrationMutation('create',{...review.values,expectedRevision:0,operationRequestId});
 assert.equal(operation.target_tournament_year,2098);assert.equal(Object.hasOwn(operation,'tournament_year'),false);
});
test('annual client confirms only after exact canonical readback and selects no retired route',async()=>{
 const calls=[];const confirmed=await submitFutureYearAdministration(review,{fetchImpl:async(url,init)=>{
  calls.push({url,init});return calls.length===1?respond(receipt):respond(current);
 }});
 assert.deepEqual(confirmed,{receipt,data:current});assert.deepEqual(calls.map(c=>c.url),['/api/director/future-tournaments','/api/director/future-tournaments?targetTournamentId=2098']);
 assert.equal(JSON.parse(calls[0].init.body).tournamentYear,2098);assert.equal(JSON.parse(calls[0].init.body).operationRequestId,operationRequestId);
});
for(const [label,selected]of [['wrong target',{...current.selectedTournament,tournamentId:'2097'}],['wrong year',{...current.selectedTournament,tournamentYear:2097}],['stale revision',{...current.selectedTournament,revision:0}],['missing',undefined]]){
 test(`annual client rejects ${label} readback without Google fallback`,async()=>{
  let count=0;await assert.rejects(submitFutureYearAdministration(review,{fetchImpl:async()=>++count===1?respond(receipt):respond({selectedTournament:selected})}),error=>error.code==='FUTURE_YEAR_CANONICAL_READBACK_REQUIRED'&&error.operationRequestId===operationRequestId);assert.equal(count,2);
 });
}
test('annual canonical failure remains feature-local with no fallback',async()=>{
 let calls=0;await assert.rejects(submitFutureYearAdministration(review,{fetchImpl:async()=>{calls++;return Response.json({ok:false,code:'FUTURE_TOURNAMENT_NOT_READY',error:'Not ready'},{status:409});}}),{code:'FUTURE_TOURNAMENT_NOT_READY'});assert.equal(calls,1);
});
test('annual runtime operation revision is not confused with setup revision',async()=>{
 const runtime={...review,action:'promote-runtime',expectedRevision:0};let calls=0;
 const confirmed=await submitFutureYearAdministration(runtime,{fetchImpl:async()=>++calls===1?respond({...receipt,revision:20,operation:'PROMOTE_RUNTIME_STRUCTURE'}):respond(current)});
 assert.equal(confirmed.receipt.revision,20);assert.equal(confirmed.data.selectedTournament.revision,1);
});

for(const [label,point,code]of [['lost mutation response',1,'FUTURE_YEAR_OUTCOME_UNKNOWN'],['lost readback response',2,'FUTURE_YEAR_CANONICAL_READBACK_REQUIRED']]){
 test(`annual client classifies ${label} and retains logical operation identity`,async()=>{
  let calls=0;await assert.rejects(submitFutureYearAdministration(review,{fetchImpl:async()=>{if(++calls===point)throw new Error('Synthetic connection loss');return respond(receipt);}}),error=>error.code===code&&error.operationRequestId===operationRequestId);assert.equal(calls,point);
 });
}

test('annual malformed successful response remains unknown with the same mutation identity',async()=>{
 await assert.rejects(submitFutureYearAdministration(review,{fetchImpl:async()=>new Response('incomplete',{status:200})}),error=>error.code==='FUTURE_YEAR_OUTCOME_UNKNOWN'&&error.operationRequestId===operationRequestId);
});
test('global course receipt reads exact canonical course without fabricating tournament ownership',async()=>{
 const courseReview={...review,action:'add-global-course',values:{targetTournamentId:'2098',tournamentYear:2098,courseName:'Synthetic course',reason:'Synthetic global course proof'}};
 const courseReceipt={ok:true,targetTournamentId:'',courseId:'COURSE-001',revision:2};let calls=0;
 const data={...current,futureRuntime:{courseCatalog:[{courseId:'COURSE-001',teeContexts:[]}]}};
 assert.equal((await submitFutureYearAdministration(courseReview,{fetchImpl:async()=>++calls===1?respond(courseReceipt):respond(data)})).receipt.courseId,'COURSE-001');
 calls=0;await assert.rejects(submitFutureYearAdministration(courseReview,{fetchImpl:async()=>++calls===1?respond(courseReceipt):respond(current)}),{code:'FUTURE_YEAR_CANONICAL_READBACK_REQUIRED'});
});
