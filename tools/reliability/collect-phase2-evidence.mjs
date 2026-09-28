#!/usr/bin/env node
// Evidence compiler only. Reads local retained receipts; cannot certify missing layers.
import assert from 'node:assert/strict';
import {evaluateScorePerformance} from './phase2-performance-gate.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {repositoryRoot} from '../../test/support/reliability/postgres17.mjs';
const directory=path.join(repositoryRoot,'docs/reliability/phase2');
const read=async file=>JSON.parse(await readFile(path.join(directory,file),'utf8'));
const sha=v=>createHash('sha256').update(v).digest('hex');
const head=execFileSync('git',['rev-parse','HEAD'],{cwd:repositoryRoot,encoding:'utf8'}).trim();
const sourcePaths=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z','--','supabase/production_migrations/202609280121_score_derived_intents_v1.sql','tools/reliability','test'],{cwd:repositoryRoot,encoding:'utf8'}).split('\0').filter(v=>v.includes('phase2')||v.endsWith('202609280121_score_derived_intents_v1.sql'));
const sources=await Promise.all([...new Set(sourcePaths)].sort().map(async file=>({file,sha256:sha(await readFile(path.join(repositoryRoot,file)))})));
const migrationHash=sha(await readFile(path.join(repositoryRoot,'supabase/production_migrations/202609280121_score_derived_intents_v1.sql')));
const claims=[];
for(const [file,testFile] of [
 ['evidence/score-proof-after.json','test/reliability-phase2-score-proof.integration.test.mjs'],
 ['evidence/derived-proof-after.json','test/reliability-phase2-derived-proof.integration.test.mjs'],
 ['evidence/migration-safety.json','test/reliability-phase2-migration-safety.integration.test.mjs'],
]){
 const artifact=await read(file);
 if ((artifact.candidate?.sha256||artifact.migrationSha256)!==migrationHash) throw Error('Evidence migration mismatch: '+file);
 for(const test of artifact.tests){
  const annual=test.id==='P2-MIG-ANNUAL-EXPECTED-RED';
  const recovery=test.id==='P2-IDEM-LOCKED-READBACK';
  const layers=test.id.includes('CONC')||test.id.includes('BURST')||test.id.includes('RACE')?['POSTGRESQL','CONCURRENCY']:test.id.includes('FAIL')||test.id.includes('ATOMIC')||test.id.includes('RESTART')||test.id.includes('DEADLOCK')?['POSTGRESQL','FAILURE_INJECTION']:['POSTGRESQL','INTEGRATION'];
  claims.push({id:test.id,requirement:test.id.includes('IDEM')||test.id.includes('UNKNOWN')?'BE-SCORE-003':test.id.includes('DERIVED')?'BE-JOB-001':'BE-SCORE-002',claim:test.name||test.title,proofLayers:layers,environment:artifact.environment,fixture:artifact.fixture||'bagger-r139-synthetic-history-v1',testFile,result:test.result,capabilityResult:annual?'EXPECTED_RED_PRE_EXISTING':recovery?'NOT_PROVEN_CLIENT_RECOVERY':test.result,artifact:file,sourceMigrationSha256:artifact.candidate?.sha256||artifact.migrationSha256,limitations:artifact.limitations||[],production:'NOT_PROVEN',physical:'NOT_PROVEN'});
 }
}
const pending=[
 {id:'P2-RECOVERY-001',gate:'Supported participant unknown-outcome status after permission revocation',result:'NOT_PROVEN'},
 {id:'P2-DELIVERY-001',gate:'Autonomous durable retry and supported dead-letter recovery',result:'NOT_PROVEN'},
 {id:'P2-ANNUAL-001',gate:'Future annual worker execution',result:'EXPECTED_RED_PRE_EXISTING'},
 {id:'P2-ATTESTATION-001',gate:'Real annual/hosted admission and recertification',result:'NOT_PROVEN'},
 {id:'P2-PROOF-001',gate:'Complete HTTP/control/release races, resource pressure and finite-timeout headroom',result:'NOT_PROVEN'},
];
const measuredGate=evaluateScorePerformance(await read('benchmark-before.json'),await read('benchmark-after.json'),await read('eligible-history-before.json'),await read('eligible-history-after.json'));
assert.equal(measuredGate.result,'PASS','Cannot create passing measurement claims from incomplete/failed gate');
const extra=[
 ['P2-PERF-COMMON','BE-SCORE-002',['PERFORMANCE'],'benchmark-after.json','tools/reliability/benchmark-phase2.mjs','Validated common-path history-scale measurements; local rollback only'],
 ['P2-PERF-ELIGIBLE','BE-SCORE-002',['PERFORMANCE'],'eligible-history-after.json','tools/reliability/benchmark-phase2-eligible.mjs','Synthetic eligible branches; protected receipt issuer lifecycle not proven'],
 ['P2-LOCK-BOUNDS','BE-SCORE-002',['PERFORMANCE'],'lock-duration-after.json','tools/reliability/measure-phase2-locks.mjs','Measured lock lower and transaction upper bounds, not exact COMMIT timing'],
 ['P2-FENCE-HISTORY','DB-PERF-001',['POSTGRESQL','PERFORMANCE'],'evidence/fence-history-final.json','test/reliability-phase2-fence-history.test.mjs','Exact safety predicate preserved; restored history excluded'],
 ];
for(const [id,requirement,proofLayers,file,testFile,claim] of extra){
 const artifact=await read(file);
 if ((artifact.candidate?.sha256||artifact.candidateMigrationSha256)!==migrationHash) throw Error('Evidence migration mismatch: '+file);
 if(id==='P2-LOCK-BOUNDS') { assert.equal(artifact.rows.length,8); assert.ok(artifact.rows.every(r=>r.successCount===100&&r.failureCount===0&&r.canonicalRollbackDigestVerified)); }
 if(id==='P2-FENCE-HISTORY') { assert.deepEqual(artifact.rows.map(r=>r.restoredRows),[0,100,1000]); assert.equal(artifact.rows.at(-1).after.truthTable.length,5); assert.ok(artifact.rows.filter(r=>r.restoredRows>0).every(r=>r.after.scorePlan.scans.every(s=>s.index==='google_writer_fence_rehearsals_unrestored_idx'&&s.rowsRemovedByFilter===0))); }
 claims.push({id,requirement,claim,proofLayers,environment:artifact.environment,fixture:artifact.fixture||artifact.fixtureVersion,testFile,result:'PASS',capabilityResult:'SCOPED_LOCAL_PROOF_ONLY',artifact:file,sourceMigrationSha256:migrationHash,limitations:artifact.limitations,production:'NOT_PROVEN',physical:'NOT_PROVEN'});
}
const files=['benchmark-before.json','benchmark-after.json','eligible-history-before.json','eligible-history-after.json','lock-duration-before.json','lock-duration-after.json','performance-gate.json','evidence/application-baseline.json','evidence/application-candidate.json','evidence/application-comparison.json','evidence/foundation-unit.json','evidence/foundation-sql.json','evidence/foundation-build.json','evidence/eligible-history-candidate.json','evidence/score-proof-before.json','evidence/score-proof-after.json','evidence/derived-proof-after.json','evidence/migration-safety.json','evidence/fence-history-experiment.json','evidence/fence-history-final.json'];
const artifacts=await Promise.all(files.map(async file=>({file,sha256:sha(await readFile(path.join(directory,file)))})));
const value={schemaVersion:1,generatedAt:new Date().toISOString(),executionHead:head,candidateMigrationSha256:migrationHash,sourceDigest:sha(JSON.stringify(sources)),sources,artifacts,claims,requiredPendingProof:pending,status:claims.some(c=>c.result==='FAIL')?'FAIL':'PARTIAL',statusReason:'Required recovery/delivery/annual/runtime proof is incomplete; tests asserting a known defect do not close its capability.',production:{queried:false,mutated:false,deployed:false},physical:'NOT_PROVEN',build11Implemented:false,tournamentReady:false};
await writeFile(path.join(directory,'evidence-ledger.json'),JSON.stringify(value,null,2)+'\n');
const testCatalog={schemaVersion:1,baseCatalog:'../2026-tournament-postmortem/test-catalog.json',historicalCatalogUnchanged:true,tests:claims.map(c=>({id:c.id,requirement:c.requirement,incidentIds:c.requirement==='BE-SCORE-003'?['2026-INC-018','2026-INC-020']:['2026-INC-019'],basis:/FENCE|MIG|FIXTURE|STANDALONE/.test(c.id)?'ARCHITECTURE_DERIVED':'INCIDENT_DERIVED',layer:c.proofLayers,environment:c.environment,automated:true,physical:false,frequency:'Every affected score-path candidate',futureReleaseBlocking:true,testFile:c.testFile,artifact:c.artifact,capabilityResult:c.capabilityResult}))};
await writeFile(path.join(directory,'test-catalog-addendum.json'),JSON.stringify(testCatalog,null,2)+'\n');
console.log(JSON.stringify({claims:claims.length,status:value.status,sourceDigest:value.sourceDigest,pending:pending.length},null,2));
