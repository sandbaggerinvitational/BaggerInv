// Real protected local Production-shaped authority, never a hosted target.
// The existing local release fixture starts from an explicitly synthetic
// admitted maintenance baseline; it is not historical preparation chronology.
// The annual proof uses actual canonical public operations.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {repositoryRoot} from './support/reliability/postgres17.mjs';
let source=await readFile(path.join(repositoryRoot,'test/reliability-phase2dr2-production-equivalence.integration.test.mjs'),'utf8');
source=source.replace("from './support/reliability/postgres17.mjs'",`from ${JSON.stringify(pathToFileURL(path.join(repositoryRoot,'test/support/reliability/postgres17.mjs')).href)}`);
const entry="await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);";
assert.ok(source.trimEnd().endsWith(entry));source=source.slice(0,source.lastIndexOf(entry))+'export default source;';
let {default:generated}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
generated=`import {runProductionAnnualGolden} from ${JSON.stringify(pathToFileURL(path.join(repositoryRoot,'test/support/reliability/production-annual-golden.mjs')).href)};\n`+generated;
const marker='        // R2_OWNED_RESOURCE_UPGRADE_COMPLETE';
assert.equal(generated.split(marker).length,2);
generated=generated.replace(marker,`
writeFileSync('/private/tmp/r2-production-current-profile-closures.json',psql(cluster,database,"select jsonb_build_object('rows',(select jsonb_agg(jsonb_build_object('closureId',closure_id,'kind',closure_kind,'status',status,'boundaryMode',boundary_mode,'externalFenceNull',external_fence_evidence_id is null,'providerFenceNull',google_writer_provider_fence_id is null,'verificationNull',google_writer_provider_verification_id is null,'leaseHighWatermark',lease_high_watermark,'leaseFingerprint',lease_set_fingerprint,'firstSourcePresent',first_source_fingerprint is not null,'firstCapturePresent',first_source_captured_at is not null,'secondCapturePresent',second_source_captured_at is not null,'capturesOrdered',second_source_captured_at>=first_source_captured_at,'sourceEqualsFinal',first_source_fingerprint=final_source_fingerprint,'sourceEqualsShadow',first_source_fingerprint=supabase_shadow_fingerprint,'unexplainedDifferences',unexplained_difference_count))from production_control.scoring_admission_closures),'columns',(select jsonb_agg(jsonb_build_object('name',attname,'notNull',attnotnull))from pg_attribute where attrelid='production_control.scoring_admission_closures'::regclass and attname in('external_fence_evidence_id','google_writer_provider_fence_id','google_writer_provider_verification_id')),'constraints',(select jsonb_agg(jsonb_build_object('name',conname,'definition',pg_get_constraintdef(oid)))from pg_constraint where conrelid='production_control.scoring_admission_closures'::regclass))::text")+'\\n');
`+marker);
const proof='const protectedProof=runP0FProductionEquivalence({cluster,database:frozenDatabase,psql,jsonSql,scope:normalReleaseCapabilityScope(),beforeDefinitions:p0fBeforeDefinitions});';
assert.equal(generated.split(proof).length,2);
generated=generated.replace(proof,"const protectedProof=await runProductionAnnualGolden({cluster,database:frozenDatabase,psql,jsonSql,scope:normalReleaseCapabilityScope(),stopAfterFuturePreparation:true});assert.equal(protectedProof.futureSetup,'PASS');assert.equal(protectedProof.status,'PARTIAL');assert.equal(protectedProof.completeProtectedAnnual,'NOT_PROVEN');");
generated=generated.replaceAll('production-protected-equivalence.json','production-annual-golden.json');
const callback='await t.test("commit, workers, Odds, and observation require each database milestone", () => {';
assert.equal(generated.split(callback).length,2);generated=generated.replace(callback,callback.replace('() =>','async () =>'));
// Preserve the original generator's child-selection key; rename only the
// emitted label, otherwise its exact filter would silently omit the proof.
const emittedLabel='future annual authorization, replay, stale and invariance';
assert.equal(generated.split(emittedLabel).length,2);
generated=generated.replace(emittedLabel,'scoped protected future setup; complete annual remains PARTIAL without historical adoption');
try{await import(`data:text/javascript;base64,${Buffer.from(generated).toString('base64')}`);}
catch(error){throw new Error('Production annual fixture module: '+error.message,{cause:undefined});}
