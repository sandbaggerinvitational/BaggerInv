import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {CERTIFICATION_WORKER_ENGINES,CALCUTTA_SCOPE_CONTRACT,certificationCalcuttaAdmitted} from '../lib/certification-worker-engines.js';
import {parseQueueMessage,QUEUE_CONTRACT} from '../lib/certification-queue-supervision.js';
import {randomUUID} from 'node:crypto';
test('closed Calcutta registry: only owner-committed BEGIN scope can admit existing processor',()=>{
 assert.equal(certificationCalcuttaAdmitted({}),false);
 assert.equal(certificationCalcuttaAdmitted({engine_scope_contract:CALCUTTA_SCOPE_CONTRACT,engines:[...CERTIFICATION_WORKER_ENGINES]}),true);
 for(const engines of [[],['CALCUTTA'],[...CERTIFICATION_WORKER_ENGINES,'ODDS'],[...CERTIFICATION_WORKER_ENGINES].reverse(),['sql','module']])
  assert.throws(()=>certificationCalcuttaAdmitted({engine_scope_contract:CALCUTTA_SCOPE_CONTRACT,engines}),/ENGINE_SCOPE_DENIED/);
 assert.throws(()=>certificationCalcuttaAdmitted({engine_scope_contract:'client-selected',engines:CERTIFICATION_WORKER_ENGINES}));
 assert.ok(Object.isFrozen(CERTIFICATION_WORKER_ENGINES));
});
for(const fields of [{engine:'CALCUTTA'},{resource:'PRODUCTION'},{module:'production-calcutta-server'},{function:'calculate'},{sql:'select 1'}])
 test('Queue payload cannot select '+Object.keys(fields)[0],()=>assert.throws(()=>parseQueueMessage({version:QUEUE_CONTRACT,invocation_id:randomUUID(),...fields})));
test('forward correction is limited to supervisor scope/accounting; no domain/lease/financial authority changes',async()=>{
 const sql=await readFile('supabase/production_incremental/certification-queue-calcutta-scope-v1.sql','utf8');
 const patches=JSON.parse(sql.split('$manifest$')[1]);assert.equal(patches.length,5);
 for(const p of patches){assert.match(p.old_hash,/^[a-f0-9]{64}$/);assert.match(p.new_hash,/^[a-f0-9]{64}$/);
  assert.match(p.signature,/worker_supervisor_|execute_certification_queue_supervisor/);}
 assert.doesNotMatch(sql,/update scoring_authority\.|insert into scoring_authority\.|grant |where true|disable row level security|safeupdate\.enabled/ig);
 assert.doesNotMatch(sql,/canonical_claim_calcutta.*replace|lease_seconds_value.*replace/);
 assert.match(sql,/where singleton and state='OFF'and engines=/);
});
