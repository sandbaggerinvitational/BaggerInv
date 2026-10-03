// One real protected Production-shaped local database and one fresh Certification
// database. Both are owned disposable databases in the same socket-only cluster.
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {createDatabase,sql,jsonLiteral} from './postgres17.mjs';
import {canonicalSourceManifest,installLocalCanonicalPlatform} from './phase2d-resource-bootstrap.mjs';
import {initializeCertificationFixture} from './phase2d-certification-fixture.mjs';
import {buildCanonicalArtifacts,installCanonicalBaseline,canonicalCatalog,assertCatalogConvergence} from '../../../tools/reliability/canonical-bootstrap-artifacts.mjs';
import {buildTournamentSetupMutation,normalizeProductionTournamentSetupPayload} from '../../../lib/production-tournament-setup-contract.js';

export async function runProductionCertificationIsolation({cluster,database,scope,forwardMigrations}) {
 const query=statement=>sql(cluster,database,statement,{role:''});
 const rpc=(name,input)=>JSON.parse(sql(cluster,database,`set role service_role;select public.${name}(${jsonLiteral(input)})`,{role:'service_role'}));
 assert.equal(query("select resource_class from production_control.canonical_resource_v1 where singleton"),'PRODUCTION');
 const activation=JSON.parse(query("select jsonb_build_object('revision',activation_revision,'epoch',authority_generation_id)from production_control.cutover_activation_state where scope_key='BAGGER_INV_PRODUCTION'"));
 const common={...scope,expected_activation_revision:Number(activation.revision),expected_epoch_id:activation.epoch,
  authorization:{tournament_id:'2026',role:'DIRECTOR',player_id:'PX01',auth_user_id:'b0000000-0000-4000-8000-000000000001'},
  actor_player_id:'PX01',actor_auth_user_id:'b0000000-0000-4000-8000-000000000001'};
 const prodRead={...common,contract_version:'production-tournament-setup-v1',operation:'READ_PRODUCTION_TOURNAMENT_SETUP_V1'};
 const originalRead=rpc('read_production_tournament_setup_v1',prodRead);assert.equal(originalRead.ok,true);
 const fixture={cluster,database,forwardMigrations,sourceManifest:await canonicalSourceManifest({forwardMigrations})};
 const bundle=await buildCanonicalArtifacts(fixture);
 const certDatabase='r2_cert_against_production';createDatabase(cluster,certDatabase);installLocalCanonicalPlatform(cluster,certDatabase);
 const installed=await installCanonicalBaseline(cluster,certDatabase,bundle);
 const cert=await initializeCertificationFixture(cluster,certDatabase,installed,9);
 assertCatalogConvergence(await canonicalCatalog(cluster,certDatabase),await canonicalCatalog(cluster,database));
 const modes=JSON.parse(cert.q("select jsonb_build_object('epoch',e.boundary_mode,'epochType',e.epoch_type,'gate',g.boundary_mode,'legacyAdmissionEnforced',g.admission_protocol_enforced)from scoring_authority.authority_epochs e join scoring_authority.ingress_gates g on g.active_epoch_id=e.epoch_id where g.tournament_id='2026'"));
 assert.deepEqual(modes,{epoch:'CERTIFICATION_INGRESS_V1',epochType:'CERTIFICATION_INITIALIZATION',gate:'CERTIFICATION_INGRESS_V1',legacyAdmissionEnforced:false});
 assert.throws(()=>cert.q("update scoring_authority.ingress_gates set boundary_mode='PROVIDER_FENCE_V2' where tournament_id='2026'"),/CERTIFICATION_GATE_RESOURCE_REQUIRED/);
 assert.throws(()=>cert.q("update scoring_authority.authority_epochs set boundary_mode='PROVIDER_FENCE_V2' where epoch_type='CERTIFICATION_INITIALIZATION'"),/production_authority_epoch_boundary_mode_check|production_authority_epoch_boundary_evidence_check/);
 assert.throws(()=>query("update scoring_authority.ingress_gates set boundary_mode='CERTIFICATION_INGRESS_V1' where tournament_id='2026'"),/CERTIFICATION_GATE_RESOURCE_REQUIRED/);
 assert.equal(cert.read('DIRECTOR.READ_SETUP').ok,true);
 const before=query("select name from scoring_authority.tournaments where tournament_id='2026'");
 const operationId=randomUUID();
 const certPayload=buildTournamentSetupMutation('update-tournament',{expectedRevision:cert.model().revision,operationRequestId:operationId,
  name:'Certification has independent authority',destination:'Synthetic only',startDate:'2026-09-20',endDate:'2026-09-22',timeZone:'America/Chicago',operationalStatus:'UPCOMING'});
 delete certPayload.operation_request_id;
 const certInput=cert.command('DIRECTOR.MUTATE_SETUP',{...certPayload,action:'update-tournament'},{operation_request_id:operationId});
 const admitted=cert.rpc('admit_certification_operation_v1',certInput);
 assert.equal(cert.rpc('execute_certification_operation_v1',{...certInput,ingress:{lease_id:admitted.lease_id,admission_generation_id:admitted.admission_generation_id}}).ok,true);
 assert.equal(query("select name from scoring_authority.tournaments where tournament_id='2026'"),before);
 const productionCommand={...common,contract_version:'production-tournament-setup-v1',
  ...buildTournamentSetupMutation('update-tournament',{expectedRevision:normalizeProductionTournamentSetupPayload(originalRead).revision,operationRequestId:operationId,
  name:'Production-shaped local authority only',destination:'Synthetic only',startDate:'2026-09-20',endDate:'2026-09-22',timeZone:'America/Chicago',operationalStatus:'UPCOMING'})};
 const productionInput={...productionCommand,request_payload_hash:createHash('sha256').update(JSON.stringify(productionCommand)).digest('hex')};
 assert.equal(rpc('mutate_production_tournament_setup_v1',productionInput).ok,true);
 assert.equal(rpc('mutate_production_tournament_setup_v1',productionInput).idempotent,true);
 assert.equal(query("select name from scoring_authority.tournaments where tournament_id='2026'"),'Production-shaped local authority only');
 const denied=[];
 for(const name of ['read_certification_runtime_context_v1','admit_certification_operation_v1','read_certification_ingress_status_v1','resolve_certification_ingress_v1']){
  assert.throws(()=>rpc(name,certInput),/RESOURCE_BINDING_DENIED|RESOURCE_CONTEXT|INGRESS_RESOURCE_DENIED|CERTIFICATION_INGRESS_SCHEMA_REQUIRED/);denied.push('PRODUCTION rejects '+name);
 }
 assert.throws(()=>rpc('execute_certification_operation_v1',{...certInput,ingress:{lease_id:admitted.lease_id,admission_generation_id:admitted.admission_generation_id}}),/RESOURCE_BINDING_DENIED|RESOURCE_CONTEXT|INGRESS_RESOURCE_DENIED|CERTIFICATION_INGRESS_SCHEMA_REQUIRED/);
 denied.push('PRODUCTION rejects Certification execute/lease');
 for(const [name,input]of [
  ['read_production_tournament_setup_v1',prodRead],
  ['mutate_production_tournament_setup_v1',productionInput],
  ['mutate_production_match_control',{...common,authorization:{...common.authorization,permission_revision:1},operation:'SCORING_LOCK',match_id:'2026-R1-1',mutation_key:operationId,expected_match_revision:0}],
 ]){
  assert.throws(()=>cert.rpc(name,input),/PRODUCTION_|RESOURCE_|CAPABILITY_|EXACT_SCOPE|no rows/);denied.push('CERTIFICATION rejects '+name);
 }
 assert.equal(cert.q("select name from scoring_authority.tournaments where tournament_id='2026'"),'Certification has independent authority');
 assert.equal(query('select count(*)from production_control.certification_ingress_leases_v1'),'0');
 assert.equal(cert.q('select count(*)from production_control.resource_scope'),'0');
 assert.equal(cert.q('select count(*)from production_control.cutover_activation_state'),'0');
 assert.equal(query('select count(*)from scoring_authority.google_outbox_events'),'0');
 assert.equal(cert.q('select count(*)from scoring_authority.google_outbox_events'),'0');
 assert.equal(rpc('read_production_tournament_setup_v1',prodRead).ok,true);
 return{status:'PASS',environment:'TWO_OWNED_LOCAL_DATABASES_PRODUCTION_SHAPED_AND_CERTIFICATION',hostedAccess:false,productionAccess:false,
  sourceManifest:fixture.sourceManifest,identicalCanonicalCatalog:true,boundaryModes:modes,boundaryModeClassNegatives:3,productionPositiveCurrentRead:true,productionPositiveCommittedSetup:true,certificationPositiveCommittedSetup:true,
  denied,foreignWrites:0,googleCalls:0,googleJobs:0,limitations:['Synthetic local protected Production authority, not hosted or live Production',
   'Covers registered class/envelope/lease/read/control separation; full annual and worker lifecycle proof is separate']};
}
