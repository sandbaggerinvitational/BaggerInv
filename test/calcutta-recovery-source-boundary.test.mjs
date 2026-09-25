import test from 'node:test';import assert from 'node:assert/strict';import {execFileSync}from'node:child_process';import fs from'node:fs';
const base='f6929bbe5a254ab6e938c56184f336c5fc617666';
const allowed='supabase/production_incremental/calcutta-exact-job-activation-recovery-v1.sql';
const git=(...args)=>execFileSync('git',args,{encoding:'utf8',maxBuffer:20e6});
test('Release 133 runtime is byte-preserved except the authorized additive recovery SQL',()=>{
 for(const line of git('ls-tree','-rz',base).split('\0').filter(Boolean)){
  const [meta,path]=line.split('\t');if(path.startsWith('test/')||path.startsWith('docs/'))continue;
  assert.equal(git('hash-object',path).trim(),meta.split(' ')[2],path);
 }
 for(const path of git('ls-files','--cached','--others','--exclude-standard','-z').split('\0').filter(Boolean)){
  if(path.startsWith('test/')||path.startsWith('docs/')||path===allowed)continue;
  assert.ok(git('ls-tree',base,'--',path).trim(),`unrelated runtime addition: ${path}`);
 }
});
test('recovery has no public/runtime grant, no replacement job and only changes activation',()=>{
 const s=fs.readFileSync(allowed,'utf8');assert.match(s,/revoke all on function production_control.carry_forward_exact_calcutta_job_v1\(jsonb\)\s+from public,anon,authenticated,service_role/);
 assert.doesNotMatch(s,/grant execute|insert into scoring_authority.calcutta_v1_recalculation_jobs|delete from scoring_authority|set status\s*=/i);
 assert.match(s,/set activation_revision=a.activation_revision where job_id=j.job_id/);
 assert.match(s,/set timezone='UTC'/);assert.match(s,/for share/);
});
