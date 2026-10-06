// Renders an owner package; never opens a provider connection or executes SQL.
import {readFile} from 'node:fs/promises';
import {readModelDImage} from './model-d-bootstrap.mjs';
import {validateModelDRegistration} from './certification-model-d-binding.mjs';
const literal=value=>"'"+JSON.stringify(value).replaceAll("'","''")+"'::jsonb";

export async function renderModelDInstallation({registrationManifest}={}) {
  const registration=validateModelDRegistration(registrationManifest).registration;
  const image=await readModelDImage();
  if(registration.schema_digest!==image.manifest.artifacts.schema)throw new Error('MODEL_D_INSTALLATION_IMAGE_MISMATCH');
  const query=await readFile(new URL('../../supabase/canonical_bootstrap/catalog.sql',import.meta.url),'utf8');
  const receipt={manifest_sha256:image.manifestDigest,schema_sha256:image.manifest.artifacts.schema,static_data_sha256:image.manifest.artifacts.staticData};
  return `\\set ON_ERROR_STOP on
-- Independently attest the physical connection to ${registration.project_ref}
-- before executing. This package has no connection or client-selection surface.
begin;set local lock_timeout='5s';
do $preflight$declare prior jsonb;begin
 if current_user<>'postgres'or session_user<>current_user or coalesce(current_setting('request.jwt.claim.role',true),'')not in('','postgres')then raise exception 'MODEL_D_OWNER_REQUIRED';end if;
 if current_setting('server_version_num')::int not between 170000 and 179999 or to_regclass('auth.users')is null or to_regclass('auth.identities')is null then raise exception 'MODEL_D_PLATFORM_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtextextended('bagger-model-d-bootstrap-v1',0));
 if to_regclass('production_control.canonical_bootstrap_installation_v1')is not null then
  execute 'select to_jsonb(r)from production_control.canonical_bootstrap_installation_v1 r'into strict prior;
  if not prior @> ${literal(receipt)} then raise exception 'MODEL_D_INSTALLATION_PREDECESSOR_MISMATCH';end if;
  perform set_config('bagger_model_d.install_required','false',true);
 else
  if exists(select 1 from pg_namespace where nspname in('participant_identity','production_control','scoring_authority','production_rehearsal'))then raise exception 'MODEL_D_EMPTY_TARGET_REQUIRED';end if;
  perform set_config('bagger_model_d.install_required','true',true);
 end if;
end;$preflight$;
select current_setting('bagger_model_d.install_required')as model_d_install_required \\gset
\\if :model_d_install_required
${image.schema}
${image.staticData}
insert into production_control.canonical_bootstrap_installation_v1(contract_version,manifest_sha256,schema_sha256,static_data_sha256)
values('bagger-canonical-bootstrap-v1','${receipt.manifest_sha256}','${receipt.schema_sha256}','${receipt.static_data_sha256}');
\\endif
do $verify$declare actual jsonb;expected jsonb:=${literal(image.catalog)};begin
 execute $catalog$${query}$catalog$ into strict actual;
 actual:=jsonb_set(actual,'{functions}',(select jsonb_agg(v-'definition'||jsonb_build_object('definitionSha256',encode(extensions.digest(v->>'definition','sha256'),'hex')))from jsonb_array_elements(actual->'functions')v));
 if jsonb_array_length(actual->'extensions')<>1 or actual#>>'{extensions,0,owner}'not in('postgres','supabase_admin')then raise exception 'MODEL_D_PLATFORM_EXTENSION_OWNER_MISMATCH';end if;
 actual:=jsonb_set(actual,'{extensions,0,owner}',expected#>'{extensions,0,owner}');
 if actual is distinct from expected then raise exception 'MODEL_D_CATALOG_MISMATCH';end if;
end;$verify$;
commit;
`;
}
