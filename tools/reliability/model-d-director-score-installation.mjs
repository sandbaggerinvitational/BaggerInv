// Fixed owner protocol; renders SQL only. Never connects to a provider.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {readModelDImage} from './model-d-bootstrap.mjs';
import {normalizeModelDCatalog,modelDCatalogVerificationSql} from './model-d-catalog-verifier.mjs';
import {serialize} from './canonical-bootstrap-artifacts.mjs';
import {renderModelDLineageVerification,staticVerificationSql} from './certification-forward-lineage.mjs';
import {validateModelDBinding} from './certification-model-d-binding.mjs';
import {certificationManifestDigest} from '../../lib/canonical-resource-registration.js';
const hash=v=>createHash('sha256').update(v).digest('hex');
const literal=v=>"'"+JSON.stringify(v).replaceAll("'","''")+"'::jsonb";
export const directorScoreArtifact='supabase/production_incremental/certification-model-d-director-score-v1.sql';
export async function directorScoreCatalog(){
 const b=await readModelDImage();
 const text=await readFile(new URL('../../supabase/model_d_bootstrap/catalog-manifest.json',import.meta.url));
 const delta=JSON.parse(await readFile(new URL('../../config/certification-model-d-director-score-catalog.json',import.meta.url)));
 assert.equal(hash(text),delta.baseArtifactSha256);
 const catalog=normalizeModelDCatalog(b.catalog,b.catalog);
 for(const patch of [...delta.patches].reverse()){
  assert.deepEqual(catalog[patch.section].slice(patch.index,patch.index+patch.remove.length),patch.remove);
  catalog[patch.section].splice(patch.index,patch.remove.length,...patch.add);
 }
 assert.equal(hash(serialize(catalog)),delta.expectedNormalizedSha256);
 assert.equal(catalog.functions.length,1162);assert.equal(catalog.relations.filter(r=>r.rls).length,281);
 return {catalog,delta};
}
export async function renderModelDDirectorScoreInstallation(input,{registrationManifest}={}){
 validateModelDBinding({resource:input.resource,deployment:input.deployment,purpose:'PART2C_DRESS_REHEARSAL',binding_id:input.expected.binding_id,authority_epoch_id:input.expected.authority_epoch_id},{registrationManifest});
 const b=await readModelDImage(),{catalog,delta}=await directorScoreCatalog();
 for(const key of ['admission_revision','activation_revision'])assert.ok(Number.isSafeInteger(input.expected[key])&&input.expected[key]>0);
 const predecessorVerification=await renderModelDLineageVerification(input,{registrationManifest});
 const query=await readFile(new URL('../../supabase/canonical_bootstrap/catalog.sql',import.meta.url),'utf8');
 const source=await readFile(new URL('../../'+directorScoreArtifact,import.meta.url),'utf8');
 const body=source.replace(/^\\set ON_ERROR_STOP on\n/,'').replace(/\bbegin;/,'').replace(/commit;\s*$/,'');
 const resource={...input.resource,manifest_digest:certificationManifestDigest(registrationManifest)};
 const envelope={contract_version:'certification-runtime-v1',resource,deployment:input.deployment};
 const evidence={contract:'model-d-director-score-forward-v1',retrospective:false,artifact_id:directorScoreArtifact,artifact_sha256:hash(source),
  predecessor_catalog_artifact_sha256:b.manifest.artifacts.catalog,successor_normalized_catalog_sha256:delta.expectedNormalizedSha256,
  resource_id:resource.resource_id,project_ref:resource.project_ref,authority_epoch_id:input.expected.authority_epoch_id,binding:input.deployment};
 return `\\set ON_ERROR_STOP on
begin;set local search_path=pg_catalog;
do $binding$declare r production_control.canonical_resource_v1%rowtype;a production_control.certification_admission_v1%rowtype;begin
 if current_user<>'postgres'or session_user<>current_user or coalesce(current_setting('request.jwt.claim.role',true),'')not in('','postgres')then raise exception 'MODEL_D_DIRECTOR_SCORE_OWNER_REQUIRED';end if;
 perform pg_advisory_xact_lock(production_control.scoring_admission_lock_key());
 perform set_config('request.jwt.claim.role','service_role',true);r:=production_control.certification_ingress_recovery_resource_v1(${literal(envelope)});perform set_config('request.jwt.claim.role','',true);
 select * into strict a from production_control.certification_admission_v1 where resource_id=r.resource_id for share;
 if not production_control.worker_supervisor_model_d_v1()or a.enabled or a.binding_id::text<>${literal(input.expected)}->>'binding_id'or a.authority_epoch_id::text<>${literal(input.expected)}->>'authority_epoch_id'
 or a.admission_revision<>${input.expected.admission_revision} or a.activation_revision<>${input.expected.activation_revision}
 or exists(select 1 from production_control.worker_supervisor_v1 where state<>'OFF')or exists(select 1 from scoring_authority.ingress_gates where state<>'PAUSED')then raise exception 'MODEL_D_DIRECTOR_SCORE_BINDING_DENIED';end if;
 if exists(select 1 from jsonb_each_text(production_control.worker_supervisor_counts_v1())v where v.value::bigint<>0)or exists(select 1 from production_control.worker_supervisor_invocations_v1 where state in('RESERVED','RUNNING','UNKNOWN'))or exists(select 1 from production_control.worker_supervisor_publication_permits_v3 where state in('ISSUED','CONSUMED')and expires_at>clock_timestamp())or exists(select 1 from production_control.worker_supervisor_faults_v1 where expires_at>clock_timestamp())then raise exception 'MODEL_D_DIRECTOR_SCORE_DRAIN_REQUIRED';end if;
 if (select count(*)from scoring_authority.matches)<>24 or exists(select 1 from scoring_authority.matches where status<>'UPCOMING')or exists(select 1 from scoring_authority.hole_scores)or exists(select 1 from scoring_authority.scoring_permissions where can_score)then raise exception 'MODEL_D_DIRECTOR_SCORE_D9_REQUIRED';end if;
end;$binding$;
select to_regprocedure('production_control.assert_model_d_director_score_v1(jsonb,boolean)')is null as score_install_required \\gset
\\if :score_install_required
${predecessorVerification}
\\else
${modelDCatalogVerificationSql(query,literal(catalog))}
\\endif
${body}
${modelDCatalogVerificationSql(query,literal(catalog))}
${staticVerificationSql(b.staticData)}
do $record$declare original jsonb;prior production_control.certification_forward_lineage_v1%rowtype;expected jsonb:=${literal(evidence)};begin
 select to_jsonb(r)into strict original from production_control.canonical_bootstrap_installation_v1 r;
 if not exists(select 1 from production_control.certification_forward_lineage_v1 where attestation_id='MODEL_D_SESSION_LINK_V1'and resource_id=expected->>'resource_id'and revision=1 and original_receipt=original)then raise exception 'MODEL_D_DIRECTOR_SCORE_PREDECESSOR_LINEAGE_REQUIRED';end if;
 expected:=expected||jsonb_build_object('predecessor_attestation_sha256',(select encode(extensions.digest(to_jsonb(t)::text,'sha256'),'hex')from production_control.certification_forward_lineage_v1 t where attestation_id='MODEL_D_SESSION_LINK_V1'));
 if exists(select 1 from production_control.certification_forward_lineage_v1 where attestation_id not in('MODEL_D_SESSION_LINK_V1','MODEL_D_DIRECTOR_SCORE_V1'))then raise exception 'MODEL_D_DIRECTOR_SCORE_UNKNOWN_LINEAGE';end if;
 select * into prior from production_control.certification_forward_lineage_v1 where attestation_id='MODEL_D_DIRECTOR_SCORE_V1'for update;
 if found then if prior.payload<>expected or prior.original_receipt<>original or prior.resource_id<>expected->>'resource_id'or prior.revision<>2 then raise exception 'MODEL_D_DIRECTOR_SCORE_LINEAGE_CONFLICT';end if;
 else insert into production_control.certification_forward_lineage_v1(attestation_id,resource_id,revision,payload,original_receipt)values('MODEL_D_DIRECTOR_SCORE_V1',expected->>'resource_id',2,expected,original);end if;
end;$record$;
commit;
`;
}
