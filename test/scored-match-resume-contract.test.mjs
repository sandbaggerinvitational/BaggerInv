import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {canonicalPersistenceError} from '../lib/scoring-persistence-adapter.js';
const source=readFileSync(new URL('../candidates/scored-match-resume.sql',import.meta.url),'utf8');
test('initial validator body retained verbatim apart from private factoring and explicit activity parameter',()=>{
 const old=readFileSync(new URL('./fixtures/scored-resume-baseline/production_control.assert_production_match_scoring_ready_v1.sql',import.meta.url),'utf8').trim().replace(/;$/,'');
 const factored=source.slice(source.indexOf('CREATE OR REPLACE FUNCTION'),source.indexOf('$function$;')+'$function$'.length)
  .replace('match_scoring_context_readiness_v1(target_match_id text, allow_scoring_activity boolean)','assert_production_match_scoring_ready_v1(target_match_id text)')
  .replace('if not allow_scoring_activity and (match_value.scored_holes <> 0','if match_value.scored_holes <> 0')
  .replace('lease.expires_at > pg_catalog.clock_timestamp()\n     )) then','lease.expires_at > pg_catalog.clock_timestamp()\n     ) then');
 assert.equal(factored,old);
});
test('resume rejection is an actionable conflict and never recommends destroying scored history',()=>{
 const e=canonicalPersistenceError({code:'PRODUCTION_MATCH_NOT_RESUME_READY'});
 assert.equal(e.status,409);assert.equal(e.code,'PRODUCTION_MATCH_NOT_RESUME_READY');
 assert.match(e.message,/Keep the match paused/);assert.match(e.message,/do not reinitialize or erase scores/);
});
test('candidate does not replace score/finalize/reopen calculations or native/client authority',()=>{
 const functions=[...source.matchAll(/create (?:or replace )?function\s+([\w.]+)/gi)].map(x=>x[1]);
 assert.deepEqual(functions,[
 'production_control.match_scoring_context_readiness_v1','production_control.assert_production_match_scoring_ready_v1',
 'production_control.match_resume_context_hash_v1','production_control.assert_production_match_resume_ready_v1','public.mutate_production_match_control']);
 assert.doesNotMatch(source,/update scoring_authority\.(hole_scores|scoring_snapshots|match_participants|match_holes|handicap_revision)/i);
});
