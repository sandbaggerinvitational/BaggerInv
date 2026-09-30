import test from 'node:test';import assert from 'node:assert/strict';import {execFileSync}from'node:child_process';import fs from'node:fs';
const base='f6929bbe5a254ab6e938c56184f336c5fc617666';
const allowed='supabase/production_incremental/calcutta-exact-job-activation-recovery-v1.sql';
const git=(...args)=>execFileSync('git',args,{encoding:'utf8',maxBuffer:20e6});
// Retired behavior: One-release byte-preservation certification was superseded by owner-approved Phase 1/2/2C/retirement source changes. Old release evidence remains immutable in Git/reliability reports. Current canonical rules, authorization, receipts and no-native/no-Production boundaries require separate behavioral and scope evidence; this deleted old-release assertion receives no PASS credit.

test('recovery has no public/runtime grant, no replacement job and only changes activation',()=>{
 const s=fs.readFileSync(allowed,'utf8');assert.match(s,/revoke all on function production_control.carry_forward_exact_calcutta_job_v1\(jsonb\)\s+from public,anon,authenticated,service_role/);
 assert.doesNotMatch(s,/grant execute|insert into scoring_authority.calcutta_v1_recalculation_jobs|delete from scoring_authority|set status\s*=/i);
 assert.match(s,/set activation_revision=a.activation_revision where job_id=j.job_id/);
 assert.match(s,/set timezone='UTC'/);assert.match(s,/for share/);
});
