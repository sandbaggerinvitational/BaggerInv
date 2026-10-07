\set ON_ERROR_STOP on
-- Owner-installed, read-only minimum session classification; no competitive admission.
begin;
select pg_advisory_xact_lock(hashtextextended('certification-session-link-status-v1-install',0));
do $$begin if current_user<>'postgres' or session_user<>current_user or coalesce(current_setting('request.jwt.claim.role',true),'')not in('','postgres')then raise exception 'CERTIFICATION_SESSION_INSTALL_OWNER_REQUIRED';end if;end$$;
do $$begin
 if to_regclass('production_control.certification_session_keys_v1')is not null and not exists(
  select 1 from pg_class where oid=to_regclass('production_control.certification_session_keys_v1')
  and relowner='postgres'::regrole and relrowsecurity and not relforcerowsecurity
  and relacl=array['postgres=arwdDxtm/postgres']::aclitem[])then raise exception 'CERTIFICATION_SESSION_KEY_METADATA_MISMATCH';end if;
 if to_regclass('production_control.certification_session_keys_v1')is not null and (
  (select array_agg(attname::text||':'||format_type(atttypid,atttypmod)||':'||attnotnull::text order by attnum)
   from pg_attribute where attrelid=to_regclass('production_control.certification_session_keys_v1')and attnum>0 and not attisdropped)
   is distinct from array['resource_id:text:true','registration_revision:bigint:true','authority_epoch_id:uuid:true','attestation_key:bytea:true']::text[]
  or exists(select 1 from pg_attribute where attrelid=to_regclass('production_control.certification_session_keys_v1')and attnum>0 and (attisdropped or atthasdef or attgenerated<>''or attidentity<>''))
  or (select array_agg(pg_get_constraintdef(oid,true)order by pg_get_constraintdef(oid,true)collate "C")from pg_constraint where conrelid=to_regclass('production_control.certification_session_keys_v1'))
   is distinct from array['CHECK (octet_length(attestation_key) = 32)','CHECK (registration_revision > 0)','PRIMARY KEY (resource_id)']::text[]
  or exists(select 1 from pg_constraint where conrelid=to_regclass('production_control.certification_session_keys_v1')and (not convalidated or condeferrable or condeferred))
  or exists(select 1 from pg_trigger where tgrelid=to_regclass('production_control.certification_session_keys_v1')and not tgisinternal))then
  raise exception 'CERTIFICATION_SESSION_KEY_STRUCTURE_MISMATCH';end if;
end$$;
create table if not exists production_control.certification_session_keys_v1(
 resource_id text primary key,registration_revision bigint not null check(registration_revision>0),
 authority_epoch_id uuid not null,attestation_key bytea not null check(octet_length(attestation_key)=32));
alter table production_control.certification_session_keys_v1 enable row level security;
revoke all on production_control.certification_session_keys_v1 from public,anon,authenticated,service_role;

do $$begin if not exists(select 1 from pg_proc where oid='production_control.certification_ingress_recovery_resource_v1(jsonb)'::regprocedure and encode(extensions.digest(prosrc,'sha256'),'hex')='de4e9485862d833b85b7647f274b46f166c7be444ff808b9c7b42983e9ff9de7' and proowner='postgres'::regrole and prosecdef and proconfig=array['search_path=pg_catalog'] and proacl=array['postgres=X/postgres']::aclitem[])then raise exception 'CERTIFICATION_SESSION_PREDECESSOR_MISMATCH:production_control.certification_ingress_recovery_resource_v1(jsonb)';end if;end$$;
do $$begin if not exists(select 1 from pg_proc where oid='production_control.assert_certification_context_v1(jsonb, text, boolean)'::regprocedure and encode(extensions.digest(prosrc,'sha256'),'hex')='36a266b5bf8e49f3c753807f0558c383c70a247fe4819cd9c65cb899d32f5f65' and proowner='postgres'::regrole and prosecdef and proconfig=array['search_path=pg_catalog'] and proacl=array['postgres=X/postgres']::aclitem[])then raise exception 'CERTIFICATION_SESSION_PREDECESSOR_MISMATCH:production_control.assert_certification_context_v1(jsonb, text, boolean)';end if;end$$;
do $$begin if not exists(select 1 from pg_proc where oid='production_control.worker_supervisor_model_d_v1()'::regprocedure and encode(extensions.digest(prosrc,'sha256'),'hex')='fbe02956fd69d1f21cc4609f733ec23fff47e3f63d698aceea3df94d50334ba4' and proowner='postgres'::regrole and prosecdef and proconfig=array['search_path=pg_catalog'] and proacl=array['postgres=X/postgres']::aclitem[])then raise exception 'CERTIFICATION_SESSION_PREDECESSOR_MISMATCH:production_control.worker_supervisor_model_d_v1()';end if;end$$;
do $$begin if to_regprocedure('production_control.certification_session_link_status_v1(jsonb)')is not null and not exists(select 1 from pg_proc where oid=to_regprocedure('production_control.certification_session_link_status_v1(jsonb)') and encode(extensions.digest(prosrc,'sha256'),'hex')='6333e7d979dbaea9e8f0d1a930fd7c81c2d04912d32e17b7e113ed5cc6f6942d' and proowner='postgres'::regrole and prosecdef and proconfig=array['search_path=pg_catalog'] and proacl=array['postgres=X/postgres']::aclitem[])then raise exception 'CERTIFICATION_SESSION_INSTALLED_MISMATCH:production_control.certification_session_link_status_v1';end if;end$$;
create or replace function production_control.certification_session_link_status_v1(input jsonb)returns jsonb language plpgsql security definer set search_path=pg_catalog as $body$
declare r production_control.canonical_resource_v1%rowtype;
 a production_control.certification_admission_v1%rowtype;
 p production_control.current_tournament_pointer_v1%rowtype;
 h jsonb;subject uuid;key_row production_control.certification_session_keys_v1%rowtype;stamp bigint;message text;
begin
 perform production_control.assert_production_service_role();
 if jsonb_typeof(input) is distinct from 'object'
 or input->>'contract_version' is distinct from 'certification-session-link-v1'
 or exists(select 1 from jsonb_object_keys(input) k where k not in('contract_version','resource','deployment'))then
  raise exception using errcode='42501',message='CERTIFICATION_SESSION_INPUT_DENIED';end if;
 -- A server transport assertion, never a client/body-selected target. The
 -- session adapter emits it only from its opaque provider-verified result.
 h:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
 if h->>'x-bagger-session-contract' is distinct from 'certification-session-link-v1'
 or coalesce(h->>'x-bagger-session-subject','')!~'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'then
  raise exception using errcode='42501',message='CERTIFICATION_SESSION_SUBJECT_REQUIRED';end if;
 subject:=(h->>'x-bagger-session-subject')::uuid;
 if coalesce(h->>'x-bagger-session-time','')!~'^[0-9]{10}$'
 or coalesce(h->>'x-bagger-session-proof','')!~'^[0-9a-f]{64}$'
 or coalesce(h->>'x-bagger-session-epoch','')!~'^[0-9a-fA-F-]{36}$'then
  raise exception using errcode='42501',message='CERTIFICATION_SESSION_SUBJECT_REQUIRED';end if;
 stamp:=(h->>'x-bagger-session-time')::bigint;
 if abs(extract(epoch from statement_timestamp())::bigint-stamp)>60 then
  raise exception using errcode='42501',message='CERTIFICATION_SESSION_PROOF_STALE';end if;
 -- Reuse the exact-origin recovery binding assertion, not its recovery
 -- operations. It validates registration/schema/physical/deployment/release
 -- under the same shared admission fence without enabling competitive reads.
 r:=production_control.certification_ingress_recovery_resource_v1(
  input||jsonb_build_object('contract_version','certification-runtime-v1'));
 if not ((r.resource_id='CERTIFICATION:2857f707-065a-405d-b5fc-b5b6fa1b0f51'
  and r.project_ref='trmcwrljjxwhgtikfdgu')or production_control.worker_supervisor_model_d_v1())then
  raise exception using errcode='42501',message='CERTIFICATION_SESSION_RESOURCE_DENIED';end if;
 select * into strict a from production_control.certification_admission_v1 where resource_id=r.resource_id for share;
 select * into strict p from production_control.current_tournament_pointer_v1 where scope_key=r.resource_id for share;
 if a.activation_revision<1 or a.admission_revision<1
 or not exists(select 1 from scoring_authority.ingress_gates g
  join scoring_authority.authority_epochs e on e.epoch_id=g.active_epoch_id
  join scoring_authority.tournaments t on t.tournament_id=g.tournament_id
  where g.tournament_id=p.tournament_id and g.authority='SUPABASE'
  and g.active_epoch_id=a.authority_epoch_id and e.status='COMMITTED'
  and e.authority_after='SUPABASE' and t.scoring_authority='SUPABASE'
  and t.tournament_year=p.tournament_year)
 then
  raise exception using errcode='42501',message='CERTIFICATION_SESSION_AUTHORITY_DENIED';end if;
 select * into strict key_row from production_control.certification_session_keys_v1 where resource_id=r.resource_id for share;
 if key_row.registration_revision<>r.registration_revision
 or key_row.authority_epoch_id<>a.authority_epoch_id
 or h->>'x-bagger-session-epoch' is distinct from a.authority_epoch_id::text then
  raise exception using errcode='42501',message='CERTIFICATION_SESSION_AUTHORITY_DENIED';end if;
 message:=concat_ws('|',input->>'contract_version',subject::text,stamp::text,
  input#>>'{resource,resource_id}',input#>>'{resource,resource_class}',input#>>'{resource,installation_id}',
  input#>>'{resource,project_ref}',input#>>'{resource,project_url}',input#>>'{resource,registration_revision}',
  input#>>'{resource,manifest_digest}',input#>>'{resource,schema_contract}',input#>>'{resource,schema_digest}',
  input#>>'{deployment,vercel_team_id}',input#>>'{deployment,vercel_project_id}',input#>>'{deployment,git_branch}',
  input#>>'{deployment,deployment_class}',input#>>'{deployment,release_commit}',input#>>'{deployment,deployment_id}',
  input#>>'{deployment,deployment_origin}',h->>'x-bagger-session-epoch');
 if h->>'x-bagger-session-proof' is distinct from encode(extensions.hmac(convert_to(message,'UTF8'),key_row.attestation_key,'sha256'),'hex')then
  raise exception using errcode='42501',message='CERTIFICATION_SESSION_SUBJECT_DENIED';end if;
 if not exists(select 1 from auth.users u where u.id=subject)then
  raise exception using errcode='42501',message='CERTIFICATION_SESSION_AUTHORITY_DENIED';end if;
 return jsonb_build_object('contract','certification-session-link-v1','linked',
  exists(select 1 from participant_identity.user_player_links l where l.auth_user_id=subject and l.status='ACTIVE'));
exception when no_data_found then
 raise exception using errcode='55000',message='CERTIFICATION_SESSION_BINDING_UNAVAILABLE';
when invalid_text_representation then
 raise exception using errcode='22023',message='CERTIFICATION_SESSION_INPUT_INVALID';
end;
$body$;
revoke all on function production_control.certification_session_link_status_v1(jsonb) from public,anon,authenticated,service_role;
do $$begin if to_regprocedure('public.read_certification_session_link_status_v1(jsonb)')is not null and not exists(select 1 from pg_proc where oid=to_regprocedure('public.read_certification_session_link_status_v1(jsonb)') and encode(extensions.digest(prosrc,'sha256'),'hex')='49b392e9bc3c41a34673f4daccb0e8981e2b7e12d16944bd50bfe88a7a4e18c5' and proowner='postgres'::regrole and prosecdef and proconfig=array['search_path=pg_catalog'] and proacl=array['postgres=X/postgres','service_role=X/postgres']::aclitem[])then raise exception 'CERTIFICATION_SESSION_INSTALLED_MISMATCH:public.read_certification_session_link_status_v1';end if;end$$;
create or replace function public.read_certification_session_link_status_v1(input jsonb)returns jsonb language plpgsql security definer set search_path=pg_catalog as $body$
begin
 perform production_control.assert_production_service_role();
 return production_control.certification_session_link_status_v1(input);
end;
$body$;
revoke all on function public.read_certification_session_link_status_v1(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.read_certification_session_link_status_v1(jsonb) to service_role;
commit;
