\set ON_ERROR_STOP on
-- Owner-only storage. No public RPC and no invented historical execution time.
begin;
select pg_advisory_xact_lock(hashtextextended('certification-forward-lineage-attestation-v1',0));
do $$begin
 if current_user<>'postgres'or session_user<>current_user or coalesce(current_setting('request.jwt.claim.role',true),'')not in('','postgres')then raise exception 'MODEL_D_LINEAGE_OWNER_REQUIRED';end if;
 if not exists(select 1 from pg_proc where oid='production_control.certification_session_link_status_v1(jsonb)'::regprocedure and encode(extensions.digest(prosrc,'sha256'),'hex')='6333e7d979dbaea9e8f0d1a930fd7c81c2d04912d32e17b7e113ed5cc6f6942d'and proowner='postgres'::regrole and prosecdef and proconfig=array['search_path=pg_catalog']and proacl=array['postgres=X/postgres']::aclitem[])
 or not exists(select 1 from pg_proc where oid='public.read_certification_session_link_status_v1(jsonb)'::regprocedure and encode(extensions.digest(prosrc,'sha256'),'hex')='49b392e9bc3c41a34673f4daccb0e8981e2b7e12d16944bd50bfe88a7a4e18c5'and proowner='postgres'::regrole and prosecdef and proconfig=array['search_path=pg_catalog']and proacl=array['postgres=X/postgres','service_role=X/postgres']::aclitem[])then raise exception 'MODEL_D_LINEAGE_PREDECESSOR_MISMATCH';end if;
 if to_regclass('production_control.certification_forward_lineage_v1')is not null then
  if not exists(select 1 from pg_class where oid='production_control.certification_forward_lineage_v1'::regclass and relowner='postgres'::regrole and relrowsecurity and not relforcerowsecurity and relacl=array['postgres=arwdDxtm/postgres']::aclitem[])then raise exception 'MODEL_D_LINEAGE_METADATA_MISMATCH';end if;
  if (select array_agg(attname::text||':'||format_type(atttypid,atttypmod)||':'||attnotnull::text order by attnum)from pg_attribute where attrelid='production_control.certification_forward_lineage_v1'::regclass and attnum>0 and not attisdropped)is distinct from array['attestation_id:text:true','resource_id:text:true','revision:integer:true','payload:jsonb:true','original_receipt:jsonb:true','created_at:timestamp with time zone:true','recorded_by:text:true']::text[]then raise exception 'MODEL_D_LINEAGE_STRUCTURE_MISMATCH';end if;
 end if;
end$$;
create table if not exists production_control.certification_forward_lineage_v1(
 attestation_id text primary key,resource_id text not null,revision integer not null check(revision>0),
 payload jsonb not null,original_receipt jsonb not null,
 created_at timestamptz not null default clock_timestamp(),recorded_by text not null default current_user,unique(resource_id,revision));
alter table production_control.certification_forward_lineage_v1 enable row level security;
revoke all on production_control.certification_forward_lineage_v1 from public,anon,authenticated,service_role;
-- Existing receipt and new attestations are append-only even for ordinary owner DML.
do $$begin if to_regprocedure('production_control.reject_certification_lineage_mutation_v1()')is not null and not exists(select 1 from pg_proc where oid=to_regprocedure('production_control.reject_certification_lineage_mutation_v1()')and encode(extensions.digest(prosrc,'sha256'),'hex')='51622dd1ff7433579f0526a1323fb398e3950e7836483f18a153086a32275bf7'and proowner='postgres'::regrole and not prosecdef and proconfig=array['search_path=pg_catalog']and proacl=array['postgres=X/postgres']::aclitem[])then raise exception 'MODEL_D_LINEAGE_INSTALLED_MISMATCH';end if;end$$;
create or replace function production_control.reject_certification_lineage_mutation_v1()returns trigger language plpgsql set search_path=pg_catalog as $body$
begin
 raise exception using errcode='42501',message='MODEL_D_LINEAGE_IMMUTABLE';
end;
$body$;
revoke all on function production_control.reject_certification_lineage_mutation_v1()from public,anon,authenticated,service_role;
do $$declare t text;begin
 foreach t in array array['certification_forward_lineage_v1','canonical_bootstrap_installation_v1']loop
  if not exists(select 1 from pg_trigger where tgrelid=('production_control.'||t)::regclass and tgname='certification_lineage_immutable_v1')then
   execute format('create trigger certification_lineage_immutable_v1 before update or delete or truncate on production_control.%I for each statement execute function production_control.reject_certification_lineage_mutation_v1()',t);
  elsif not exists(select 1 from pg_trigger where tgrelid=('production_control.'||t)::regclass and tgname='certification_lineage_immutable_v1'and tgfoid='production_control.reject_certification_lineage_mutation_v1()'::regprocedure and tgtype=58 and tgenabled='O')then raise exception 'MODEL_D_LINEAGE_TRIGGER_MISMATCH';end if;
 end loop;
end$$;
commit;
