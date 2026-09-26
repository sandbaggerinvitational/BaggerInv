import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../supabase/production_migrations/202609260119_existing_r3_dependency_preserving_preparation_v1.sql',import.meta.url),'utf8');
test('recovery adds only isolated authority; no ordinary guard or client runtime replacement',()=>{
 const funcs=[...sql.matchAll(/create (?:or replace )?function ([\w.]+)/gi)].map(x=>x[1]);assert.deepEqual(funcs,['production_control.r3_existing_preparation_state_v1','public.prepare_existing_r3_with_compatible_dependencies_v1']);
 assert.doesNotMatch(sql,/\b(?:delete from|truncate|drop)\b/i);assert.doesNotMatch(sql,/\bupdate\s+scoring_authority\.(?:hole_scores|match_participants|scoring_permissions|net_skins\w*|calcutta\w*|odds\w*)\b/i);
 assert.doesNotMatch(sql,/set\s+(?:status|match_revision|permission_revision|scoring_locked)\s*=/i);
});
test('eligibility helper is bounded and does not aggregate historical calculation payloads',()=>{
 const helper=sql.split('$state$')[1];assert.doesNotMatch(helper,/input_snapshot|checkpoint_payload|result_payload|source_revision|late_r3_consumed_fingerprint/);
 for(const n of [2,4,13,19,25,217])assert.match(helper,new RegExp('limit '+n+'\\b'));
 assert.match(helper,/collate "C"/);assert.match(helper,/status in\('PENDING','RUNNING'\)/);
});
test('service-only Director operation binds exact closed scope and rolls all writes back on failure',()=>{
 assert.match(sql,/revoke all on function public\.prepare_existing_r3_with_compatible_dependencies_v1\(jsonb\) from public,anon,authenticated/);
 assert.match(sql,/assert_tournament_setup_runtime_v1\(input\)/);assert.match(sql,/assert_production_scoring_actor\(input,true\)/);
 assert.match(sql,/in exclusive mode nowait/);assert.match(sql,/pg_try_advisory_xact_lock/);
 assert.match(sql,/before_state is distinct from expected->'fingerprints'/);assert.match(sql,/exception when others then/);
 assert.match(sql,/round_number=3\)<>12/);assert.match(sql,/count\(distinct p.player_id\)=24 and count\(\*\)=24/);
 assert.match(sql,/enable row level security/);assert.match(sql,/before update or delete/);assert.match(sql,/'golferIds'/);assert.match(sql,/'idempotent',true/);
});
