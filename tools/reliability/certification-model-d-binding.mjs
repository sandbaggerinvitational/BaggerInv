// Renderer only, not an RPC or executor. Default placeholders cannot execute.
import assert from 'node:assert/strict';
import template from '../../config/certification-model-d-registration.json' with {type:'json'};
import old from '../../config/certification-resource-registration.json' with {type:'json'};
import {certificationManifestDigest} from '../../lib/canonical-resource-registration.js';
import {readModelDImage} from './model-d-bootstrap.mjs';
const literal=v=>"'"+JSON.stringify(v).replaceAll("'","''")+"'::jsonb";
export function validateModelDRegistration(registrationManifest=template){
 assert.equal(registrationManifest.enabled,true,'Reviewed Model D identifiers required; placeholders disabled');
 assert.equal(registrationManifest.purpose,'PART2C_DRESS_REHEARSAL');
 assert.ok(!JSON.stringify(registrationManifest).includes('<NEW_'),'Unresolved hosted identity');
 const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
 assert.equal(registrationManifest.contract,old.contract);
 const r=registrationManifest.registration;
 assert.deepEqual(Object.keys(r).sort(),Object.keys(old.registration).sort());
 assert.equal(r.resource_class,'CERTIFICATION');assert.match(r.installation_id,uuid);assert.equal(r.resource_id,'CERTIFICATION:'+r.installation_id);
 assert.match(r.project_ref,/^[a-z]{20}$/);assert.equal(r.project_url,'https://'+r.project_ref+'.supabase.co');
 for(const k of ['schema_digest','server_key_sha256','public_key_sha256'])assert.match(r[k],/^[a-f0-9]{64}$/);
 assert.equal(r.schema_contract,'canonical-resource-v1');assert.match(r.vercel_team_id,/^team_[A-Za-z0-9]+$/);assert.match(r.vercel_project_id,/^prj_[A-Za-z0-9]+$/);
 assert.match(r.git_branch,/^codex\/[A-Za-z0-9._/-]+$/);assert.ok(!r.git_branch.includes('..'));assert.equal(r.deployment_class,'preview');
 for(const k of ['resource_id','installation_id','project_ref','public_key_sha256','server_key_sha256'])assert.notEqual(r[k],old.registration[k],k+' must be unique');
 assert.notEqual(r.public_key_sha256,r.server_key_sha256);assert.equal(r.registration_revision,1);
 assert.ok(!['trmcwrljjxwhgtikfdgu','idgigvjjqkfbqjeredpb','ymqhhtxaywtqllynrmxe'].includes(r.project_ref));
 return registrationManifest;
}
export function validateModelDBinding(input,{registrationManifest=template}={}){
 validateModelDRegistration(registrationManifest);const r=registrationManifest.registration;
 const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
 assert.deepEqual(Object.keys(input).sort(),['purpose','resource','deployment','binding_id','authority_epoch_id'].sort());
 assert.deepEqual(Object.keys(input.deployment).sort(),['vercel_team_id','vercel_project_id','git_branch','deployment_class','release_commit','deployment_id','deployment_origin'].sort());
 for(const k of ['resource_id','installation_id','project_ref','public_key_sha256','server_key_sha256'])assert.notEqual(r[k],old.registration[k],k+' must be unique');
 assert.notEqual(r.public_key_sha256,r.server_key_sha256);
 assert.equal(r.registration_revision,1);
 // This is the owner review template, not a client/environment override.
 assert.deepEqual(input.resource,r);assert.equal(input.purpose,registrationManifest.purpose);
 assert.match(input.authority_epoch_id,uuid);assert.match(input.binding_id,uuid);assert.notEqual(input.authority_epoch_id,input.binding_id);
 assert.notEqual(input.authority_epoch_id,'9f7a5851-7ee5-4fe5-8671-5b84ed591a63');
 assert.notEqual(input.deployment.deployment_id,'dpl_EUHsrGUpebidyFodm1SH8TWZrFeH');
 for(const k of ['vercel_team_id','vercel_project_id','git_branch','deployment_class'])assert.equal(input.deployment[k],r[k]);
 assert.match(input.deployment.deployment_id,/^dpl_[A-Za-z0-9_-]{8,128}$/);
 assert.match(input.deployment.release_commit,/^[a-f0-9]{40}$/);
 assert.match(input.deployment.deployment_origin,/^https:\/\/[a-z0-9][a-z0-9-]*\.vercel\.app$/);
 assert.ok(!['trmcwrljjxwhgtikfdgu','idgigvjjqkfbqjeredpb','ymqhhtxaywtqllynrmxe'].includes(r.project_ref));
 return registrationManifest;
}
export async function renderModelDBinding(input,dependencies={}){
 const m=validateModelDBinding(input,dependencies),b=await readModelDImage();
 assert.equal(m.registration.schema_digest,b.manifest.artifacts.schema,'Exact installed image required');
 const request={...input,manifest_digest:certificationManifestDigest(m),installation_manifest_digest:b.manifestDigest};
 return `\\set ON_ERROR_STOP on\nbegin;set local search_path=pg_catalog;set local lock_timeout='5s';
 do $binding$declare input jsonb:=${literal(request)};registered jsonb;prior jsonb;request_hash text;begin
 if current_user<>'postgres'or session_user<>current_user or coalesce(current_setting('request.jwt.claim.role',true),'')not in('','postgres')then raise exception 'MODEL_D_OWNER_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtextextended('canonical-resource-registration-v1',0));
 if not exists(select 1 from production_control.canonical_bootstrap_installation_v1 where manifest_sha256=input->>'installation_manifest_digest'and schema_sha256=input#>>'{resource,schema_digest}')then raise exception 'MODEL_D_INSTALLATION_REQUIRED';end if;
 if exists(select 1 from production_control.resource_scope)or exists(select 1 from production_control.cutover_activation_state)or exists(select 1 from production_control.certification_admission_v1 where enabled)or exists(select 1 from scoring_authority.ingress_gates where state<>'PAUSED')or exists(select 1 from production_control.worker_supervisor_v1 where state<>'OFF')then raise exception 'MODEL_D_SAFE_BINDING_REQUIRED';end if;
 request_hash:=encode(extensions.digest(input::text,'sha256'),'hex');
 select to_jsonb(d)into prior from production_control.certification_model_d_profile_v1 d;
 if found and prior->>'request_hash'<>request_hash then raise exception 'MODEL_D_BINDING_CONFLICT';end if;
 registered:=production_control.register_certification_resource_v1((input->'resource')||jsonb_build_object('manifest_digest',input->>'manifest_digest'));
 insert into production_control.certification_model_d_profile_v1(singleton,purpose,resource_id,project_ref,manifest_digest,installation_manifest_digest,request_hash)
 values(true,'PART2C_DRESS_REHEARSAL',input#>>'{resource,resource_id}',input#>>'{resource,project_ref}',input->>'manifest_digest',input->>'installation_manifest_digest',request_hash)on conflict(singleton)do nothing;
 if not production_control.worker_supervisor_model_d_v1()then raise exception 'MODEL_D_RESOURCE_DENIED';end if;
 perform production_control.initialize_certification_resource_v1((input->'deployment')||jsonb_build_object('resource_id',input#>>'{resource,resource_id}',
 'initial_tournament_id','2026','governance_tournament_id','2026','binding_id',input->>'binding_id','authority_epoch_id',input->>'authority_epoch_id','capabilities',jsonb_build_array('READS','SCORING','DIRECTOR','WORKERS','ANNUAL')));
 insert into production_control.worker_supervisor_v1(singleton,engines)values(true,production_control.worker_supervisor_engines_v1())on conflict(singleton)do nothing;
 if not exists(select 1 from production_control.worker_supervisor_v1 where singleton and state='OFF'and engines=production_control.worker_supervisor_engines_v1())then raise exception 'MODEL_D_SCOPE_DRIFT';end if;
 if prior is null then insert into production_control.operation_audit_events(event_type,domain,actor,request_fingerprint,result,details)
 values('CERTIFICATION_MODEL_D_BOUND','RESOURCE',current_user,request_hash,'SUCCEEDED',input);end if;
 end;$binding$;commit;\n`;
}

// D3 registration has no fictitious deployment or execution authority. D4 is
// inactive staging; canonical initialization completes in D6 after real READY.
export async function renderModelDRegistration({purpose,resource},dependencies={}){
 const m=validateModelDRegistration(dependencies.registrationManifest),b=await readModelDImage();
 assert.equal(purpose,m.purpose);assert.deepEqual(resource,m.registration);
 assert.equal(resource.schema_digest,b.manifest.artifacts.schema);
 const request={...resource,manifest_digest:certificationManifestDigest(m)};
 return `\\set ON_ERROR_STOP on
begin;set local search_path=pg_catalog;set local lock_timeout='5s';
do $registration$begin
 if current_user<>'postgres' or session_user<>current_user or coalesce(current_setting('request.jwt.claim.role',true),'')not in('','postgres')then raise exception 'MODEL_D_OWNER_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtextextended('canonical-resource-registration-v1',0));
 if not exists(select 1 from production_control.canonical_bootstrap_installation_v1 where manifest_sha256='${b.manifestDigest}'and schema_sha256='${resource.schema_digest}')then raise exception 'MODEL_D_INSTALLATION_REQUIRED';end if;
 if exists(select 1 from production_control.resource_scope)or exists(select 1 from production_control.cutover_activation_state)or exists(select 1 from production_control.certification_admission_v1 where enabled)or exists(select 1 from scoring_authority.ingress_gates where state<>'PAUSED')or exists(select 1 from production_control.worker_supervisor_v1 where state<>'OFF')then raise exception 'MODEL_D_SAFE_BINDING_REQUIRED';end if;
 perform production_control.register_certification_resource_v1(${literal(request)});
end;$registration$;commit;
`;
}
