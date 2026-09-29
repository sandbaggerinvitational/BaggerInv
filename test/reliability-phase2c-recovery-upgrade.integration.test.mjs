// Proof layers: POSTGRESQL / INTEGRATION / MIGRATION.
// Actual121 receipt -> reviewed122(+123/124 when requested) upgrade. Synthetic
// actor/runtime fixture only; no historical Production receipt or provider call.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { mkdir,writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createScoreProofFixture,inputFor,rpc,canonicalState } from './support/reliability/phase2-score-fixture.mjs';
import { configureFiniteTimeout,installPhase2C } from './support/reliability/phase2c-install.mjs';
import { sql,jsonLiteral,destroyIsolatedCluster,repositoryRoot } from './support/reliability/postgres17.mjs';

const artifact=path.join(repositoryRoot,'docs/reliability/phase2c/evidence/recovery-upgrade-proof.json');
const digest=value=>createHash('sha256').update(value).digest('hex');

test('P2C-A-UPGRADE: actual pre122 receipt stays byte-identical and unbound; new receipt recovers after Lock',
 {timeout:120000,concurrency:false},async()=>{
  let fixture;
  const evidence={schemaVersion:1,id:'P2C-A-UPGRADE',requirements:['P2C-268','P2C-064','P2C-008'],
   proofLayers:['POSTGRESQL','INTEGRATION'],environment:'OWNED_SOCKET_ONLY_POSTGRESQL17',
   startedAt:new Date().toISOString(),production:false,result:'FAIL',
   limitations:['Synthetic prepared/Live and runtime fixture; real actor and SQL bodies execute',
    'Legacy receipt is genuinely committed by121, not manufactured by setting a new receipt ownership NULL',
    'No Production data/provider identity or hosted upgrade proof; not a general migration matrix']};
  // The ordinary candidate fixture opt-in is intentionally disabled ONLY while
  // building this owned pre-upgrade cluster. Restore it before any assertions or
  // install. Node executes this top-level test sequentially (concurrency:false).
  const candidateFlag=process.env.BAGGER_PHASE2C_CANDIDATE;
  try{
   try{
    delete process.env.BAGGER_PHASE2C_CANDIDATE;
    fixture=await createScoreProofFixture({candidateSql:'supabase/production_migrations/202609280121_score_derived_intents_v1.sql'});
   }finally{
    if(candidateFlag===undefined)delete process.env.BAGGER_PHASE2C_CANDIDATE;
    else process.env.BAGGER_PHASE2C_CANDIDATE=candidateFlag;
   }
   const c=fixture.cluster,d=fixture.database;
   evidence.beforeFixture={...fixture.metadata,candidate:fixture.candidate};
   assert.equal(fixture.phase2c,null);
   assert.equal(sql(c,d,"select exists(select 1 from pg_attribute where attrelid='scoring_authority.score_mutations'::regclass and attname='originating_auth_user_id' and not attisdropped)"),'f');
   assert.equal(sql(c,d,"select to_regprocedure('public.read_production_score_mutation_status_v1(jsonb)') is null"),'t');
   configureFiniteTimeout(c,d,1000);
   const oldInput=inputFor(c,d,undefined,1,{key:'upgrade-old-actual121'});
   const oldAccepted=rpc(c,d,'submit_production_hole_score',oldInput);
   assert.equal(oldAccepted.code,'ACCEPTED');
   const predicate=`r.match_id=${jsonLiteral(oldInput.match_id)}#>>'{}' and r.mutation_key=${jsonLiteral(oldInput.mutation_key)}#>>'{}'`;
   const receiptSql=`select to_jsonb(r)::text from scoring_authority.score_mutations r where ${predicate}`;
   const resultSql=`select r.result::text from scoring_authority.score_mutations r where ${predicate}`;
   const oldReceipt=sql(c,d,receiptSql),oldResult=sql(c,d,resultSql),before=canonicalState(c,d);
   assert.equal(before.holes.length,1);assert.equal(before.receipts.length,1);
   assert.deepEqual(JSON.parse(oldResult),oldAccepted);
   const through=candidateFlag==='1'?124:122;
   evidence.upgrade=await installPhase2C(c,d,{through});
   const after=canonicalState(c,d);
   assert.equal(after.receipts.length,1);
   assert.equal(after.receipts[0].originating_auth_user_id,null);
   // Compare every pre-existing canonical field.124 adds only delivery_cycle to
   // intent rows; it does not excuse changing their existing retained contents.
   const originalShape=structuredClone(after);
   for(const receipt of originalShape.receipts)delete receipt.originating_auth_user_id;
   for(const intent of originalShape.derived_intents){
    if(through===124)assert.equal(intent.delivery_cycle,1);
    delete intent.delivery_cycle;
   }
   assert.deepEqual(originalShape,before);
   const retainedReceipt=sql(c,d,`select (to_jsonb(r)-'originating_auth_user_id')::text from scoring_authority.score_mutations r where ${predicate}`);
   assert.equal(retainedReceipt,oldReceipt);
   assert.equal(sql(c,d,resultSql),oldResult);
   const legacyStatus=rpc(c,d,'read_production_score_mutation_status_v1',oldInput);
   assert.equal(legacyStatus.status,'UNKNOWN');assert.equal(legacyStatus.result,undefined);
   assert.deepEqual(canonicalState(c,d),after);
   const next=inputFor(c,d,undefined,2,{key:'upgrade-new-bound'});
   const newAccepted=rpc(c,d,'submit_production_hole_score',next);assert.equal(newAccepted.code,'ACCEPTED');
   const newReceipt=canonicalState(c,d).receipts.find(r=>r.mutation_key===next.mutation_key);
   assert.equal(newReceipt.originating_auth_user_id,next.authorization.auth_user_id);
   const lock=rpc(c,d,'mutate_production_match_control',inputFor(c,d,undefined,2,
    {key:'upgrade-lock',director:true,operation:'SCORING_LOCK'}));assert.equal(lock.ok,true,JSON.stringify(lock));
   const locked=canonicalState(c,d);assert.equal(locked.holes.length,2);
   assert.equal(locked.receipts.filter(r=>r.mutation_type==='HOLE_SCORE').length,2);
   assert.equal(locked.receipts.filter(r=>r.mutation_type==='SCORING_LOCK').length,1);
   assert.deepEqual(rpc(c,d,'read_production_score_mutation_status_v1',next).result,newAccepted);
   assert.equal(rpc(c,d,'read_production_score_mutation_status_v1',oldInput).status,'UNKNOWN');
   const newWrite=rpc(c,d,'submit_production_hole_score',inputFor(c,d,undefined,3,{key:'upgrade-denied'}));
   assert.equal(newWrite.ok,false);assert.ok(['UNAUTHORIZED','PERMISSION_STALE','SCORING_LOCKED'].includes(newWrite.code),JSON.stringify(newWrite));
   assert.deepEqual(canonicalState(c,d),locked);
   assert.equal(sql(c,d,resultSql),oldResult);
   assert.equal(sql(c,d,`select (to_jsonb(r)-'originating_auth_user_id')::text from scoring_authority.score_mutations r where ${predicate}`),oldReceipt);
   evidence.details={through,preUpgradeAccepted:true,preUpgradeOwnershipColumnAbsent:true,
    preUpgradeReceiptSha256:digest(oldReceipt),postUpgradeLegacyReceiptSha256:digest(retainedReceipt),
    preUpgradeResultSha256:digest(oldResult),postUpgradeResultSha256:digest(sql(c,d,resultSql)),
    legacyOwnership:null,legacyStatus:'UNKNOWN',oldCanonicalFieldsUnchanged:true,
    newAcceptedReceiptBound:true,newAfterLockStatus:'COMMITTED',newWritesDenied:newWrite.code,
    recoveryWrites:false,canonicalHoles:2,canonicalScoreReceipts:2,lockReceipts:1,
    totalMutationReceipts:locked.receipts.length,statementTimeoutMs:1000,timeZone:'UTC'};
   evidence.result='PASS';
  }catch(error){evidence.error=error.message;throw error;}
  finally{
   if(fixture){await destroyIsolatedCluster(fixture.cluster);evidence.clusterDestroyed=true;}
   evidence.completedAt=new Date().toISOString();
   await mkdir(path.dirname(artifact),{recursive:true});await writeFile(artifact,JSON.stringify(evidence,null,2)+'\n');
  }
 });
