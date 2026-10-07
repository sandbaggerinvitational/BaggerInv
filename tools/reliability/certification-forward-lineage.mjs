// Owner renderers only: no provider connection, RPC or arbitrary artifact input.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {repositoryRoot} from '../../test/support/reliability/postgres17.mjs';
import {readModelDImage} from './model-d-bootstrap.mjs';
import {modelDCatalogVerificationSql} from './model-d-catalog-verifier.mjs';
import {certificationManifestDigest} from '../../lib/canonical-resource-registration.js';
import {validateModelDBinding} from './certification-model-d-binding.mjs';
export const originalModelDReceipt=Object.freeze({manifest_sha256:'c50d395eeab4a2e6b35815537b4e27b42af8c93df003d31afdda0d9de146d1b5',schema_sha256:'a82345ddbaa01dadb153baeed1973f30290cf7084ff8038bf50e247122fb5ae2',static_data_sha256:'7b93c4235a5c18cdd68be56b13df26ffcab1d9af8f3b3d9b27895cd6b8afb27d'});
const evidencePath='docs/reliability/phase2d-forward-lineage/evidence/retained-execution.json';
const evidenceDigest='965307ff9a2bedd5dd8d5038f715cfc3ba834616d2bfcaa074dedb338dd35e50';
const artifact='supabase/production_incremental/certification-session-link-status-v1.sql';
const artifactDigest='bcbffcaa33440a4137a997b1c3d1d2f1515675d300abb6bd36b8a442f77f3d0a';
const literal=v=>"'"+JSON.stringify(v).replaceAll("'","''")+"'::jsonb";
const hash=v=>createHash('sha256').update(v).digest('hex');
const catalogHashStatement="reference_catalog:=jsonb_set(reference_catalog,'{dependencies}',(select coalesce(jsonb_agg(v order by v::text collate \"C\"),'[]'::jsonb)from jsonb_array_elements(reference_catalog->'dependencies')v));expected:=expected||jsonb_build_object('current_normalized_catalog_sha256',encode(extensions.digest(reference_catalog::text,'sha256'),'hex'));";
export function staticVerificationSql(text){
 const matches=[...text.matchAll(/INSERT INTO ([\w.]+) \(([^)]+)\)\s*SELECT[\s\S]*?jsonb_populate_recordset\(NULL::[\w.]+,'((?:[^']|'')*)'::jsonb\);/g)];
 assert.ok(matches.length>0,'Committed static baseline required');
 return matches.map(([,table,columns,json])=>{assert.match(table,/^[a-z_]+\.[a-z0-9_]+$/);assert.match(columns,/^[a-z0-9_", ]+$/);const rows=JSON.parse(json.replaceAll("''","'"));return `do $static$begin if (select coalesce(jsonb_agg(v order by v::text collate "C"),'[]'::jsonb)from(select to_jsonb(t)v from(select ${columns} from ${table})t)s)is distinct from(select coalesce(jsonb_agg(v order by v::text collate "C"),'[]'::jsonb)from jsonb_array_elements(${literal(rows)})v)then raise exception 'MODEL_D_LINEAGE_STATIC_MISMATCH:${table}';end if;end;$static$;`;}).join('\n');
}
export async function currentStateVerificationSql(){const b=await readModelDImage(),q=await readFile(new URL('../../supabase/canonical_bootstrap/catalog.sql',import.meta.url),'utf8');return modelDCatalogVerificationSql(q,literal(b.catalog))+'\n'+staticVerificationSql(b.staticData);}
async function contract(input,{registrationManifest}={}){
 validateModelDBinding({resource:input.resource,deployment:input.deployment,purpose:'PART2C_DRESS_REHEARSAL',binding_id:input.expected.binding_id,authority_epoch_id:input.expected.authority_epoch_id},{registrationManifest});
 for(const k of ['admission_revision','activation_revision'])assert.ok(Number.isSafeInteger(input.expected[k])&&input.expected[k]>0);
 const b=await readModelDImage();
 const e=await readFile(new URL('../../'+evidencePath,import.meta.url));assert.equal(hash(e),evidenceDigest);const retained=JSON.parse(e);
 assert.equal(hash(await readFile(new URL('../../'+artifact,import.meta.url))),artifactDigest);
 assert.ok(retained.execution.every(x=>x.exit===0&&x.artifactDigest===artifactDigest));assert.equal(retained.current_catalog.exactCatalogPass,true);
 // Retrospective evidence is fixed to the actual target, never copied to another resource.
 const expectedResource=retained.resource_id,expectedProject=retained.project_ref;
 const payload={contract:'certification-forward-lineage-v1',operation:'attest-model-d-session-link-v1',revision:1,retrospective:true,
 original_installation:originalModelDReceipt,artifact_id:artifact,artifact_sha256:artifactDigest,
 predecessor:{identity:'ORIGINAL_MODEL_D_IMAGE',schema_sha256:originalModelDReceipt.schema_sha256},
 successor:{identity:'SESSION_LINK_V1_CURRENT_STATE',catalog_artifact_sha256:'c1d39293dd14bc30910ff7c78054552abec79cb5416836ab4dfe2b5e17dbd4e2'},
 execution_evidence:{reference:evidencePath,sha256:evidenceDigest,provenance:'RETAINED_OWNER_EXECUTION_CAPTURE',execution_time:null,transaction_id:null,historical_actor:null,migration_sequence:null},
 evidence_classes:['ORIGINAL_INSTALLATION_RECEIPT','FORWARD_ARTIFACT','RETAINED_EXECUTION_EVIDENCE','CURRENT_CATALOG','CURRENT_STATIC_DATA','RESOURCE_BINDING','ATTESTATION'],
 proven_order:['ORIGINAL_INSTALLATION','SESSION_LINK_V1','CURRENT_CATALOG'],resource_id:expectedResource,project_ref:expectedProject,
 current_catalog_artifact_sha256:b.manifest.artifacts.catalog,current_static_sha256:b.manifest.artifacts.staticData,
 binding:input.deployment,authority_epoch_id:input.expected.authority_epoch_id,resource_revision:input.resource.registration_revision,
 attestation_protocol:'RETROSPECTIVE_CURRENT_STATE_VERIFIED_NOT_ORIGINAL_MIGRATION_RECEIPT'};
 assert.equal(b.manifest.artifacts.staticData,originalModelDReceipt.static_data_sha256);
 return {b,payload,expectedResource,expectedProject};
}
function bindingSql(input,registrationManifest){const resource=Object.fromEntries(['resource_id','resource_class','installation_id','project_ref','project_url','registration_revision','schema_contract','schema_digest'].map(k=>[k,input.resource[k]]));resource.manifest_digest=certificationManifestDigest(registrationManifest);const envelope={contract_version:'certification-runtime-v1',resource,deployment:input.deployment};return `
do $binding$declare r production_control.canonical_resource_v1%rowtype;a production_control.certification_admission_v1%rowtype;begin
 if current_user<>'postgres'or session_user<>current_user or coalesce(current_setting('request.jwt.claim.role',true),'')not in('','postgres')then raise exception 'MODEL_D_LINEAGE_OWNER_REQUIRED';end if;
 perform pg_advisory_xact_lock(production_control.scoring_admission_lock_key());
 perform set_config('request.jwt.claim.role','service_role',true);r:=production_control.certification_ingress_recovery_resource_v1(${literal(envelope)});perform set_config('request.jwt.claim.role','',true);
 select * into strict a from production_control.certification_admission_v1 where resource_id=r.resource_id for share;
 if not production_control.worker_supervisor_model_d_v1()or a.enabled or a.binding_id<>'${input.expected.binding_id}'::uuid or a.authority_epoch_id<>'${input.expected.authority_epoch_id}'::uuid or a.admission_revision<>${input.expected.admission_revision} or a.activation_revision<>${input.expected.activation_revision}
 or exists(select 1 from production_control.worker_supervisor_v1 where state<>'OFF')or exists(select 1 from scoring_authority.ingress_gates where state<>'PAUSED')then raise exception 'MODEL_D_LINEAGE_BINDING_DENIED';end if;
end;$binding$;`;}
export async function renderModelDSessionLineageAttestation(input,dependencies={}){
 const {b,payload,expectedResource,expectedProject}=await contract(input,dependencies);
 assert.equal(input.resource.resource_id,expectedResource);assert.equal(input.resource.project_ref,expectedProject);
 return `\\set ON_ERROR_STOP on\nbegin;set local search_path=pg_catalog;\n${bindingSql(input,dependencies.registrationManifest)}\n${await currentStateVerificationSql()}
do $attest$declare receipt jsonb;prior production_control.certification_forward_lineage_v1%rowtype;expected jsonb:=${literal(payload)};reference_catalog jsonb:=${literal(b.catalog)};begin
 ${catalogHashStatement}
 select to_jsonb(r)into strict receipt from production_control.canonical_bootstrap_installation_v1 r;
 if not receipt @> ${literal(originalModelDReceipt)} or (select schema_digest from production_control.canonical_resource_v1)<>${literal(originalModelDReceipt)}->>'schema_sha256'then raise exception 'MODEL_D_LINEAGE_ORIGINAL_RECEIPT_DENIED';end if;
 if exists(select 1 from scoring_authority.players)or exists(select 1 from participant_identity.user_player_links)or exists(select 1 from scoring_authority.matches)then raise exception 'MODEL_D_LINEAGE_PRE_FIXTURE_REQUIRED';end if;
 select * into prior from production_control.certification_forward_lineage_v1 for update;
 if found then if prior.attestation_id<>'MODEL_D_SESSION_LINK_V1'or prior.resource_id<>expected->>'resource_id'or prior.revision<>1 or prior.payload<>expected or prior.original_receipt<>receipt or prior.recorded_by<>'postgres'then raise exception 'MODEL_D_LINEAGE_CONFLICT';end if;
 else insert into production_control.certification_forward_lineage_v1(attestation_id,resource_id,revision,payload,original_receipt)values('MODEL_D_SESSION_LINK_V1',expected->>'resource_id',1,expected,receipt);end if;
end;$attest$;commit;\n`;
}
export async function renderModelDLineageVerification(input,dependencies={}){
 const {b,payload,expectedResource,expectedProject}=await contract(input,dependencies);
 const current={manifest_sha256:b.manifestDigest,schema_sha256:b.manifest.artifacts.schema,static_data_sha256:b.manifest.artifacts.staticData};
 return `${bindingSql(input,dependencies.registrationManifest)}\n${await currentStateVerificationSql()}
do $lineage$declare receipt jsonb;row production_control.certification_forward_lineage_v1%rowtype;expected jsonb:=${literal(payload)};reference_catalog jsonb:=${literal(b.catalog)};begin
 ${catalogHashStatement}
 select to_jsonb(r)into strict receipt from production_control.canonical_bootstrap_installation_v1 r;
 if receipt @> ${literal(current)} then
  if (select schema_digest from production_control.canonical_resource_v1)<>${literal(current)}->>'schema_sha256'or exists(select 1 from production_control.certification_forward_lineage_v1)then raise exception 'MODEL_D_LINEAGE_FRESH_PROVENANCE_DENIED';end if;
 elsif receipt @> ${literal(originalModelDReceipt)} then
  if (select schema_digest from production_control.canonical_resource_v1)<>${literal(originalModelDReceipt)}->>'schema_sha256'or '${input.resource.resource_id}'<>'${expectedResource}'or '${input.resource.project_ref}'<>'${expectedProject}'then raise exception 'MODEL_D_LINEAGE_RESOURCE_DENIED';end if;
  select * into strict row from production_control.certification_forward_lineage_v1;
  if row.attestation_id<>'MODEL_D_SESSION_LINK_V1'or row.resource_id<>expected->>'resource_id'or row.revision<>1 or row.payload<>expected or row.original_receipt<>receipt or row.recorded_by<>'postgres'or row.created_at>clock_timestamp()then raise exception 'MODEL_D_LINEAGE_ATTESTATION_DENIED';end if;
 else raise exception 'MODEL_D_LINEAGE_ORIGINAL_RECEIPT_DENIED';end if;
 perform set_config('bagger_model_d.lineage_receipt',receipt::text,true);
exception when no_data_found or too_many_rows then raise exception 'MODEL_D_LINEAGE_MISSING_OR_EXTRA_RECORD';end;$lineage$;`;
}

// The fixed owner install protocol verifies exact pre/post catalogs inside one
// transaction. Future reviewed corrections must use this same atomic pattern;
// adding an artifact requires a separately certified source allowlist successor.
export async function renderModelDLineageInstallation(input,dependencies={}){
 await contract(input,dependencies);
 const b=await readModelDImage();
 const priorText=execFileSync('git',['show','2e3f3042e3d2b7e39f078ca7d10f6081a5d008b4:supabase/model_d_bootstrap/catalog-manifest.json'],{cwd:repositoryRoot,maxBuffer:32*1024*1024,encoding:'utf8'});
 assert.equal(hash(priorText),'c1d39293dd14bc30910ff7c78054552abec79cb5416836ab4dfe2b5e17dbd4e2');
 const query=await readFile(new URL('../../supabase/canonical_bootstrap/catalog.sql',import.meta.url),'utf8');
 const forward=await readFile(new URL('../../supabase/production_incremental/certification-forward-lineage-attestation-v1.sql',import.meta.url),'utf8');
 const body=forward.replace(/^\\set ON_ERROR_STOP on\n/,'').replace(/\bbegin;/,'').replace(/commit;\s*$/,'');
 return `\\set ON_ERROR_STOP on
begin;set local search_path=pg_catalog;
${bindingSql(input,dependencies.registrationManifest)}
select to_regclass('production_control.certification_forward_lineage_v1')is null as lineage_install_required \\gset
\\if :lineage_install_required
${modelDCatalogVerificationSql(query,literal(JSON.parse(priorText)))}
\\else
${await currentStateVerificationSql()}
\\endif
${body}
${await currentStateVerificationSql()}
commit;`;
}
