// Owner-only renderer. No provider connection, RPC, key generator or executor.
// Key material is supplied privately at execution via the operator environment,
// never embedded in the reviewed SQL or registration manifest.
import assert from 'node:assert/strict';
import {requireCertificationResourceEnvironment,certificationRegistrationEnvelope} from '../../lib/canonical-resource-registration.js';
const literal=v=>"'"+JSON.stringify(v).replaceAll("'","''")+"'::jsonb";
export function renderCertificationSessionKey({env=process.env,authorityEpoch}={},dependencies={}){
 assert.match(authorityEpoch,/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
 const state=requireCertificationResourceEnvironment(env,dependencies);
 const envelope=certificationRegistrationEnvelope(state);
 const request={contract_version:'certification-runtime-v1',...envelope};
 return `\\set ON_ERROR_STOP on
\\getenv session_attestation_key BAGGER_CERTIFICATION_SESSION_ATTESTATION_KEY
begin;set local search_path=pg_catalog;
set local bagger_session.attestation_key=:'session_attestation_key';
do $owner$declare input jsonb:=${literal(request)};r production_control.canonical_resource_v1%rowtype;
 a production_control.certification_admission_v1%rowtype;prior production_control.certification_session_keys_v1%rowtype;
 key_value text:=current_setting('bagger_session.attestation_key');begin
 if current_user<>'postgres'or session_user<>current_user or coalesce(current_setting('request.jwt.claim.role',true),'')not in('','postgres')then raise exception 'CERTIFICATION_SESSION_KEY_OWNER_REQUIRED';end if;
 if key_value!~'^[0-9a-f]{64}$'then raise exception 'CERTIFICATION_SESSION_KEY_REQUIRED';end if;
 perform set_config('request.jwt.claim.role','service_role',true);
 r:=production_control.certification_ingress_recovery_resource_v1(input);
 perform set_config('request.jwt.claim.role','',true);
 select * into strict a from production_control.certification_admission_v1 where resource_id=r.resource_id for share;
 if not ((r.resource_id='CERTIFICATION:2857f707-065a-405d-b5fc-b5b6fa1b0f51'and r.project_ref='trmcwrljjxwhgtikfdgu')or production_control.worker_supervisor_model_d_v1())
 or a.authority_epoch_id<>'${authorityEpoch}'::uuid or a.enabled
 or exists(select 1 from scoring_authority.ingress_gates where state<>'PAUSED')
 or exists(select 1 from production_control.worker_supervisor_v1 where state<>'OFF')then raise exception 'CERTIFICATION_SESSION_KEY_SAFE_BINDING_REQUIRED';end if;
 select * into prior from production_control.certification_session_keys_v1 where resource_id=r.resource_id for update;
 if found then
  if prior.registration_revision<>r.registration_revision or prior.authority_epoch_id<>a.authority_epoch_id
   or prior.attestation_key<>decode(key_value,'hex')then raise exception 'CERTIFICATION_SESSION_KEY_CONFLICT';end if;
 else
  insert into production_control.certification_session_keys_v1(resource_id,registration_revision,authority_epoch_id,attestation_key)
  values(r.resource_id,r.registration_revision,a.authority_epoch_id,decode(key_value,'hex'));
 end if;
end;$owner$;commit;
`;
}
