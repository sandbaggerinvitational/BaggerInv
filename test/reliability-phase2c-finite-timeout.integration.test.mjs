// Proof layers: POSTGRESQL / FAILURE_INJECTION / INTEGRATION. Owned local socket only.
import assert from 'node:assert/strict';
import test from 'node:test';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createPhase2CFixture} from './support/reliability/phase2c-fixture.mjs';
import {cloneScoreProofDatabase,inputFor,rpc,rpcSql,canonicalState,exactReceipt} from './support/reliability/phase2-score-fixture.mjs';
import {sql,sqlResult,openSqlSession,destroyIsolatedCluster,repositoryRoot} from './support/reliability/postgres17.mjs';
import {normalScoreTimeoutMs,normalWorkerTimeoutMs,tightTimeoutMs} from './support/reliability/phase2c-install.mjs';
const recover=(c,d,i)=>rpc(c,d,'read_production_score_mutation_status_v1',i);
const save=(c,d,i)=>rpc(c,d,'submit_production_hole_score',i);
test('Phase2C finite timeout and bounded outcome recovery',{timeout:300000},async t=>{
 const f=await createPhase2CFixture(),c=f.cluster,rows=[];
 const run=async(id,name,fn)=>t.test(`${id}: ${name}`,async()=>{const row={id,name,result:'FAIL',proofLayer:['POSTGRESQL','FAILURE_INJECTION']};try{row.details=await fn();row.result='PASS';}catch(e){row.error=e.message;throw e;}finally{rows.push(row);}});
 try{
  await run('P2C-TIME-001','normal finite database default applies to every new score connection',()=>{
   const d=cloneScoreProofDatabase(f,'finite_formats');assert.equal(sql(c,d,'show statement_timeout'),'1s');
   const outcomes=[];for(const round of [1,2,3]){const i=inputFor(c,d,`2026-R${round}-1`,1);const r=save(c,d,i);assert.equal(r.code,'ACCEPTED');assert.equal(recover(c,d,i).status,'COMMITTED');outcomes.push({round,code:r.code});}
   return {timeoutMs:normalScoreTimeoutMs,outcomes};
  });
  for(const table of ['hole_scores','score_mutations','score_derived_intents_v1'])await run(`P2C-TIME-${table}`,'25ms timeout rolls back canonical and durable work at '+table,()=>{
   const d=cloneScoreProofDatabase(f,`time_${table}`),i=inputFor(c,d),before=canonicalState(c,d);
   sql(c,d,`create function public.p2c_slow() returns trigger language plpgsql as $$begin perform pg_sleep(.1);return new;end$$;
    create trigger p2c_slow before insert on scoring_authority.${table} for each row execute function public.p2c_slow();`,{role:''});
   const result=sqlResult(c,d,`\\set VERBOSITY verbose\nset statement_timeout='25ms';${rpcSql('submit_production_hole_score',i)}`);
   assert.notEqual(result.status,0);assert.match(result.stderr,/57014/);assert.deepEqual(canonicalState(c,d),before);assert.equal(exactReceipt(c,d,i),null);
   assert.equal(recover(c,d,i).status,'UNKNOWN','absence cannot prove permanent noncommit');
   sql(c,d,`drop trigger p2c_slow on scoring_authority.${table};drop function public.p2c_slow();`,{role:''});
   assert.equal(save(c,d,i).code,'ACCEPTED');assert.equal(recover(c,d,i).status,'COMMITTED');
   return {timeoutMs:tightTimeoutMs,injectedDelayMs:100,sqlstate:'57014',partialState:false,readAfterRollback:'UNKNOWN',sameMutationRetry:'ACCEPTED'};
  });
  await run('P2C-TIME-LOCK','score lock timeout cannot fabricate a committed outcome',async()=>{
   const d=cloneScoreProofDatabase(f,'finite_lock'),i=inputFor(c,d),a=openSqlSession(c,d),b=openSqlSession(c,d);
   try{await a.query('begin');await a.query("select match_id from scoring_authority.matches where match_id='2026-R3-12' for update");
    await assert.rejects(b.query(`set statement_timeout='25ms';${rpcSql('submit_production_hole_score',i)}`),/statement timeout/);
    assert.equal(recover(c,d,i).status,'UNKNOWN');assert.equal(exactReceipt(c,d,i),null);await a.query('rollback');
    assert.equal(save(c,d,i).code,'ACCEPTED');assert.equal(recover(c,d,i).status,'COMMITTED');return {lockTimeoutMs:25,canonical:'UNCHANGED_UNTIL_SAFE_SAME_MUTATION_RETRY'};
   }finally{await a.query('rollback').catch(()=>{});await Promise.allSettled([a.close(),b.close()]);}
  });
  await run('P2C-TIME-RECOVERY','finite recovery timeout never erases the committed receipt',async()=>{
   const d=cloneScoreProofDatabase(f,'finite_recovery'),i=inputFor(c,d);assert.equal(save(c,d,i).code,'ACCEPTED');
   const control=inputFor(c,d,undefined,1,{director:true,operation:'SCORING_LOCK',key:'lock-after-commit'});assert.equal(rpc(c,d,'mutate_production_match_control',control).ok,true);
   const a=openSqlSession(c,d),b=openSqlSession(c,d);
   try{await a.query('begin');await a.query('lock scoring_authority.score_mutations in access exclusive mode');
    await assert.rejects(b.query(`set statement_timeout='25ms';${rpcSql('read_production_score_mutation_status_v1',i)}`),/statement timeout/);
    await a.query('rollback');assert.equal(recover(c,d,i).status,'COMMITTED');assert.equal(save(c,d,i).ok,false);
    return {timeoutMs:25,afterRelease:'COMMITTED',newWritePermission:false,receiptPreserved:true};
   }finally{await a.query('rollback').catch(()=>{});await Promise.allSettled([a.close(),b.close()]);}
  });
 }finally{
  await writeFile(path.join(repositoryRoot,'docs/reliability/phase2c/timeout-results.json'),JSON.stringify({schemaVersion:1,environment:'LOCAL_NON_PRODUCTION',fixture:f.phase2c,normalScoreTimeoutMs,normalWorkerTimeoutMs,tightTimeoutMs,rows,production:false,limitations:['Synthetic runtime admission substitution','No provider IO capacity claim','Worker5s separate delivery suite','Finite timeout does not guarantee latency under hosted resource pressure']},null,2)+'\n');
  await destroyIsolatedCluster(c);
 }
});
