import {readFileSync} from "node:fs";
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
export async function certifyAccessReadiness({cluster,database,sql,sqlFile,rpc,json,bin,environment,markLiveInput,root}) {
 sqlFile(cluster,database,`${root}/candidates/access-readiness.sql`);
 const make=(operation='ACCESS_ACTIVATE')=>({...markLiveInput('2026-R1-2','local-access-readiness'),operation});
 const call=(input)=>`select public.mutate_production_match_control(${json(input)})::text;`;
 const check=(setup,input=make())=>JSON.parse(sql(cluster,database,`begin; ${setup} ${call(input)} rollback;`));
 assert.equal(check('').ok,true,'ready match accepts in rolled-back synthetic transaction');
 for(const setup of [
  "update scoring_authority.scoring_snapshots set handicap_revision_id=null where match_id='2026-R1-2';",
  "update scoring_authority.match_participants set handicap_revision_id=null where match_id='2026-R1-2';",
  "delete from scoring_authority.handicap_revision_current where tournament_id='2026';",
  "update scoring_authority.scoring_snapshots set tee='STALE' where match_id='2026-R1-2';",
  "delete from scoring_authority.match_holes where match_id='2026-R1-2' and hole_number=1;"
 ]) {
  const result=check(setup);assert.equal(result.code,'PRODUCTION_MATCH_NOT_SCORING_READY');
  assert.equal(check(setup,make('ACCESS_REVOKE')).ok,true,'revoke works while unready');
  assert.equal(check(setup,make('SCORING_LOCK')).ok,true,'lock works while unready');
  assert.equal(check(setup,make('SCORING_UNLOCK')).code,'PRODUCTION_MATCH_NOT_SCORING_READY','unlock grants access and must be gated');
 }
 const controls=JSON.parse(readFileSync(new URL('./access-readiness-controls.json',import.meta.url)));
 assert.equal(controls.filter(x=>x.ready).length,2);
 assert.equal(controls.filter(x=>!x.ready).length,10);
 for(const control of controls) {
  // Replay the audited readiness condition against the same real validator
  // and mutation function using synthetic match/player data, not live copies.
  const result=check(control.ready?'':"update scoring_authority.scoring_snapshots set handicap_revision_id=null where match_id='2026-R1-2';");
  if(control.ready) assert.equal(result.ok,true,control.matchId);
  else {assert.equal(result.code,'PRODUCTION_MATCH_NOT_SCORING_READY',control.matchId);assert.ok(result.reasons.some(x=>x.code==='HANDICAP_CONTEXT_NOT_CURRENT'));}
 }
 const denied=make();denied.authorization.role='PARTICIPANT';
 assert.throws(()=>check('',denied),/DIRECTOR/);
 const wrong=make();wrong.tournament_id='2025';assert.throws(()=>check('',wrong),/SCOPE|RUNTIME|RESOURCE|AUTHORITY/);
 const stale=make();stale.expected_match_revision-=1;assert.equal(check('',stale).code,'MATCH_REVISION_CONFLICT');
 const outputs=sql(cluster,database,`begin; ${call(make())} ${call(make())} rollback;`).split('\n').map(JSON.parse);
 assert.equal(outputs[0].ok,true);assert.equal(outputs[1].code,'MATCH_REVISION_CONFLICT','historical activation receipt cannot bypass current revisions');
 const repeat=JSON.parse(sql(cluster,database,`begin isolation level repeatable read; ${call(make())} rollback;`));
 assert.equal(repeat.code,'SCORING_READINESS_REFRESH_REQUIRED');
 // Real two-connection race. Simulate the approval transaction's established
 // all-match row locking protocol; change authority before the waiting call.
 const original=sql(cluster,database,"select revision_id from scoring_authority.handicap_revision_current where tournament_id='2026';");
 const holder=spawn(bin.psql,['-X','-qAt','-v','ON_ERROR_STOP=1','-d',database],{env:environment(cluster),stdio:['pipe','pipe','pipe']});
 let stderr='';holder.stderr.on('data',x=>stderr+=x);
 const done=new Promise((resolve,reject)=>holder.on('close',code=>code===0?resolve():reject(new Error(stderr))));
 const locked=new Promise(resolve=>holder.stdout.on('data',x=>{if(x.toString().includes('LOCK_HELD'))resolve();}));
 holder.stdin.end("begin; select match_id from scoring_authority.matches where tournament_id='2026' order by match_id for update; select 'LOCK_HELD'; select pg_sleep(1); update scoring_authority.handicap_revision_current set revision_id='99999999-9999-4999-8999-999999999999' where tournament_id='2026'; commit;");
 await locked;
 const raced=rpc(cluster,database,'mutate_production_match_control',make());
 await done;
 assert.equal(raced.code,'PRODUCTION_MATCH_NOT_SCORING_READY','waiting activation sees newly committed authority');
 sql(cluster,database,`update scoring_authority.handicap_revision_current set revision_id='${original}' where tournament_id='2026';`);
 const activation=spawn(bin.psql,['-X','-qAt','-v','ON_ERROR_STOP=1','-d',database],{env:environment(cluster),stdio:['pipe','pipe','pipe']});
 const activated=new Promise(resolve=>activation.stdout.on('data',x=>{if(x.toString().includes('ACTIVATION_HELD'))resolve();}));
 const ended=new Promise((resolve,reject)=>activation.on('close',code=>code===0?resolve():reject(new Error('activation transaction failed'))));
 activation.stdin.end(`begin; ${call(make())} select 'ACTIVATION_HELD'; select pg_sleep(1); rollback;`);
 await activated;
 assert.throws(()=>sql(cluster,database,"begin; set local lock_timeout='100ms'; select match_id from scoring_authority.matches where match_id='2026-R1-2' for update; rollback;"),/lock timeout/,'authority writer cannot cross validation/commit interval');
 await ended;
 assert.equal(sql(cluster,database,"select count(*) from scoring_authority.score_mutations where mutation_key='local-access-readiness';"),'0','no residual test activation');
}
