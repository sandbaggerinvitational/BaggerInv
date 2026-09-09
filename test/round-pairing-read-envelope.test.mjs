import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {productionEnvelope,assertCanonicalRoundReader,roundPairs,participants,handicapRevision} from './fixtures/round-read-envelope.mjs';
import {normalizeProductionTournamentSetupPayload} from '../lib/production-tournament-setup-contract.js';
import {createPairingDraft,validatePairingWorkspace} from '../lib/round-pairing-workspace.js';

function reviewFixture() {
  const data=assertCanonicalRoundReader(productionEnvelope());
  const drafts=Object.fromEntries(data.matches.map(m=>[m.matchId,createPairingDraft(m)]));
  for(let i=4;i<6;i++)drafts[`2026-R1-${i+1}`].participants=participants(roundPairs[i]);
  return {data,drafts};
}
test('canonical nested reader has revision12, handicap7, 24 covered Players, four pairs and two empty matches',()=>{
  const model=assertCanonicalRoundReader(productionEnvelope());
  assert.equal(model.revision,12);assert.equal(model.approvedHandicapRevisionId,handicapRevision);
  assert.equal(model.roster.length,24);assert.equal(new Set(model.roster.map(p=>p.playerId)).size,24);
  assert.ok(model.roster.every(p=>p.handicapRevisionId===handicapRevision&&p.tournamentHandicap!==''));
  assert.equal(model.matches.length,24);
  assert.ok(model.matches.every(m=>m.strictlyUnstarted&&!m.snapshot.prepared&&!m.scoringReady));
  assert.deepEqual(model.matches.slice(0,6).map(m=>m.participants.map(p=>p.playerId)),[...roundPairs.slice(0,4),[],[]]);
  assert.equal(model.rounds.length,3);
});
test('release70 outer enrichment fails the same nonempty canonical assertion; no consumer fallback',()=>{
  const broken=productionEnvelope();
  broken.matches=[];
  for(const key of ['approvedHandicapRevisionId','approvedHandicapRevisionNumber']){broken[key]=broken.data[key];delete broken.data[key];}
  for(const m of broken.data.matches){delete m.detailsManaged;delete m.contextFingerprint;}
  assert.throws(()=>assertCanonicalRoundReader(broken),/outside data/);
  const model=normalizeProductionTournamentSetupPayload(broken);
  assert.equal(model.approvedHandicapRevisionId,'');assert.equal(model.matches[0].detailsManaged,false);
  const empty=productionEnvelope();empty.data.matches=[];
  assert.throws(()=>assertCanonicalRoundReader(empty),/six actual/);
});
test('individual R1-5 review and complete round review bind current authority without false prerequisites',()=>{
  const {data,drafts}=reviewFixture();const before=JSON.stringify(data);
  const single=validatePairingWorkspace(data,drafts,1,{fullRound:false,matchId:'2026-R1-5'});
  assert.deepEqual(single.errors,[]);
  const round=validatePairingWorkspace(data,drafts,1);
  assert.deepEqual(round.errors,[]);assert.equal(round.coverage,24);assert.equal(round.changed,2);
  assert.equal(round.assignments.length,6);assert.equal(round.changedAssignments,8);
  assert.equal(JSON.stringify(data),before,'review does not mutate authoritative fixture');
});
test('real dirty/unmanaged details, missing/stale handicap and invalid coverage remain fail-closed',()=>{
  for(const kind of ['dirty','unmanaged','stale','missing','duplicate','wrong-team','missing-player','conflict']) {
    const fixture=reviewFixture(),data=structuredClone(fixture.data),drafts=fixture.drafts;
    if(kind==='dirty')drafts['2026-R1-5'].metadata.teeTime='09:00';
    if(kind==='unmanaged')data.matches[4].detailsManaged=false;
    if(kind==='stale')data.roster.find(p=>p.playerId==='CB01').handicapRevisionId='old';
    if(kind==='missing')data.roster.find(p=>p.playerId==='CB01').tournamentHandicap='';
    if(kind==='duplicate')drafts['2026-R1-5'].participants[0].playerId='JP01';
    if(kind==='wrong-team')drafts['2026-R1-5'].participants[0].playerId='WO01';
    if(kind==='missing-player')drafts['2026-R1-5'].participants.pop();
    if(kind==='conflict')drafts['2026-R1-5'].conflict=true;
    assert.ok(validatePairingWorkspace(data,drafts,1).errors.length,kind);
    assert.ok(validatePairingWorkspace(data,drafts,1,{fullRound:false,matchId:'2026-R1-5'}).errors.length,kind);
  }
});
test('096 replaces only the stable secured reader and keeps one canonical envelope',async()=>{
  const sql=await readFile(new URL('../supabase/production_migrations/202609090096_production_round_pairing_read_envelope_v1.sql',import.meta.url),'utf8');
  assert.equal((sql.match(/create or replace function/gi)||[]).length,1);
  assert.match(sql,/jsonb_array_elements\(data_value->'matches'\)/);
  assert.match(sql,/jsonb_set\(result_value,'\{data\}'/);
  assert.match(sql,/stable security definer/);assert.match(sql,/set search_path=pg_catalog,production_control,scoring_authority/);
  assert.doesNotMatch(sql,/\b(insert into|update\s+scoring_authority|delete from|alter table)\b/i);
  assert.match(sql,/from public,anon,authenticated/);assert.match(sql,/to service_role/);
});
