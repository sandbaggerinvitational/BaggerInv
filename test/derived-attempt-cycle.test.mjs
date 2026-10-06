import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const source=await readFile(new URL('../supabase/production_incremental/certification-derived-attempt-cycle-v1.sql',import.meta.url),'utf8');
const manifest=JSON.parse(source.split('$manifest$')[1]);
test('forward artifact corrects exactly the shared state transition and legacy source adapter',()=>{
 assert.deepEqual(manifest.map(p=>p.signature),['production_control.capture_derived_delivery_transition_v1()',
  'scoring_authority.enqueue_competition_derived_job(text,text,text,jsonb)','scoring_authority.enqueue_annual_derived_v1_change()']);
 for(const p of manifest){assert.equal(p.edits.length,1);for(const [key,body]of [['old_hash','old'],['new_hash','new']])
  assert.equal(createHash('sha256').update(p.edits[0][body]).digest('hex'),p[key]);}
 assert.match(source,/begin;/);assert.match(source,/commit;/);assert.match(source,/FUNCTION_METADATA_DRIFT/);
 assert.match(source,/CERTIFICATION:2857f707-065a-405d-b5fc-b5b6fa1b0f51/);assert.match(source,/trmcwrljjxwhgtikfdgu/);
 assert.doesNotMatch(source,/disable.*safeupdate|safeupdate.enabled.*off|where true/i);
});
test('same-source no-op preserves all states; provenance cannot create fresh cycles',()=>{
 const body=manifest[0].edits[0].new;
 assert.match(body,/new.delivery_cycle=old.delivery_cycle/);
 assert.match(body,/requested_source_revision-array\['reason','transactional','derivedIntentId','priorRevision'\]/);
 assert.match(body,/old.status in\('PENDING','RUNNING','SUCCEEDED','FAILED'\) then return old/);
 assert.match(body,/DERIVED_DELIVERY_RECOVERY_REQUIRED/);
 assert.match(body,/new.requested_source_revision:=old.requested_source_revision/);
});
test('new source and explicit recovery preserve the existing five-attempt/history contracts',()=>{
 const body=manifest[0].edits[0].new;
 assert.match(body,/new.delivery_cycle:=old.delivery_cycle\+1/);assert.match(body,/new.delivery_attempts>=5/);
 assert.match(body,/CANONICAL_SOURCE_ADVANCED/);assert.match(body,/'SUPERSEDED'/);
 assert.doesNotMatch(body,/delete from|update production_control.score_derived_delivery_attempts_v1/i);
 assert.match(body,/new.delivery_available_at:=clock_timestamp\(\)\+production_control.derived_delivery_delay_v1/);
 assert.match(manifest[2].edits[0].new,/prior_revision_value:=jsonb_build_object\('matchId',target_match,'sourceAbsent',true\)/);
});
test('fresh-source tool fixes target and operation; it cannot prepare, unlock, score, enqueue or reset attempts',async()=>{
 const code=await readFile(new URL('../tools/reliability/certification-worker-source-demand.mjs',import.meta.url),'utf8');
 assert.match(code,/matchId='2026-R3-11'/);assert.match(code,/action:'scoring-lock'/);
 assert.match(code,/replayCertificationIngress/);assert.match(code,/DURABLE_CHECKPOINT_REQUIRED/);
 assert.match(code,/m.scoringLocked!==false/);assert.match(code,/m.accessActive!==false/);
 assert.doesNotMatch(code,/scoring-unlock|prepare-scoring-context|REQUEUE_DERIVED|delivery_attempts|enqueue_competition/);
});
