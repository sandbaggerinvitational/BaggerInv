-- Owner-approved truthful Certification annual origin and resource-aware shared
-- transition cores. CLI scaffold20260930192245; repository ordinal138.
-- Production provider/legacy constraints remain mandatory for Production rows.
begin;
select pg_advisory_xact_lock(production_control.scoring_admission_lock_key());
create temporary table r2_annual138_existing_functions on commit drop as
select p.oid,p.pronamespace,p.proname,p.proargtypes,p.proowner,p.proacl,p.prosecdef,p.proconfig,p.provolatile
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname||'.'||p.proname in('production_control.guard_certification_initialization_evidence_v1','production_control.record_certification_initialization_origin_v1','production_control.capture_certification_initialization_origin_v1','production_control.guard_certification_gate_boundary_mode_v1','production_control.annual_resource_context_v2','production_control.assert_canonical_annual_transition_context_v2','production_control.lookup_canonical_annual_scoring_receipt_v2','production_control.store_canonical_annual_scoring_receipt_v2','production_control.canonical_annual_scope_key_v2','production_control.close_certification_annual_predecessor_v1','production_control.drain_certification_annual_predecessor_v1','production_control.certification_annual_predecessor_certificate_v1','production_control.assert_certification_annual_cached_context_v1','production_control.guard_certification_annual_epoch_v1','production_control.install_certification_annual_successor_v1','production_control.assert_certification_annual_abort_drain_v1','production_control.rebind_certification_annual_abort_v1','production_control.install_certification_annual_reopened_generation_v1','production_control.guard_canonical_annual_row_v1','production_control.guard_canonical_annual_receipt_v1','production_control.future_participant_identity_eligibility_core_v1','production_control.future_participant_identity_eligibility_v1','production_control.bind_future_participant_identity_runtime_v1','production_control.ensure_annual_side_game_runtime_v1','production_control.rebind_future_participant_identity_admission_generation_v1','production_control.rebind_annual_side_game_admission_generation_v1','production_control.assert_certification_historical_identity_v1','production_control.annual_scoring_transition_readiness_v1','production_control.annual_scoring_predecessor_certificate_pre_side_games_v1','production_control.close_annual_scoring_predecessor_pre_derived_workers_v1','production_control.advance_annual_scoring_transition_v1','public.prepare_production_annual_scoring_transition_v1','production_control.canonical_prepare_annual_scoring_transition_v2','public.close_production_annual_scoring_transition_v1','production_control.canonical_close_annual_scoring_transition_v2','public.drain_production_annual_scoring_transition_v1','production_control.canonical_drain_annual_scoring_transition_v2','public.activate_production_annual_scoring_transition_v1','production_control.canonical_activate_annual_scoring_transition_v2','public.abort_production_annual_scoring_transition_v1','production_control.canonical_abort_annual_scoring_transition_v2','production_control.certification_annual_transition_command_v1','public.mutate_certification_annual_transition_v1','public.read_certification_annual_transition_v1');
-- Assembly fragment for the approved Certification-origin annual transition.
-- Not an applied migration. Final assembly follows the137 behavioral gate.
create table production_control.certification_initialization_origins_v1 (
 resource_id text primary key references production_control.canonical_resource_v1(resource_id),
 resource_class text not null default 'CERTIFICATION' check(resource_class='CERTIFICATION'),
 origin_kind text not null default 'CERTIFICATION_INITIALIZATION' check(origin_kind='CERTIFICATION_INITIALIZATION'),
 installation_id uuid not null, database_name text not null, project_ref text not null, project_url text not null,
 registration_revision bigint not null check(registration_revision>0),
 installation_contract text not null references production_control.canonical_bootstrap_installation_v1(contract_version),
 registration_manifest_digest text not null check(registration_manifest_digest~'^[0-9a-f]{64}$'),
 installation_manifest_digest text not null check(installation_manifest_digest~'^[0-9a-f]{64}$'),
 schema_digest text not null check(schema_digest~'^[0-9a-f]{64}$'),
 static_data_digest text not null check(static_data_digest~'^[0-9a-f]{64}$'),
 authority_epoch_id uuid not null references scoring_authority.authority_epochs(epoch_id),
 admission_generation_id uuid not null,
 initial_tournament_id text not null references scoring_authority.tournaments(tournament_id),
 initial_pointer_revision bigint not null check(initial_pointer_revision=1),
 initial_lifecycle_revision bigint not null check(initial_lifecycle_revision>0),
 binding_id uuid not null, initialization_fingerprint text not null check(initialization_fingerprint~'^[0-9a-f]{64}$'),
 created_by text not null, created_at timestamptz not null default clock_timestamp(),
 foreign key(resource_id,resource_class) references production_control.canonical_resource_v1(resource_id,resource_class),
 foreign key(resource_id,admission_generation_id) references production_control.certification_ingress_generations_v1(resource_id,generation_id)
);
alter table production_control.certification_initialization_origins_v1 enable row level security;
revoke all on production_control.certification_initialization_origins_v1 from public,anon,authenticated,service_role;

create function production_control.guard_certification_initialization_evidence_v1()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
 -- Existing Production installation-ledger behavior is unchanged. Once a
 -- Certification origin references a receipt, that exact evidence is immutable.
 if tg_table_name='canonical_bootstrap_installation_v1' then
  if not exists(select 1 from production_control.certification_initialization_origins_v1 o
   where o.installation_contract=old.contract_version) then
   return case when tg_op='DELETE' then old else new end;
  end if;
 end if;
 raise exception using errcode='55000',message='CERTIFICATION_INITIALIZATION_EVIDENCE_IMMUTABLE';
end;$$;
create trigger guard_certification_initialization_origin before update or delete
 on production_control.certification_initialization_origins_v1 for each row
 execute function production_control.guard_certification_initialization_evidence_v1();
create trigger guard_canonical_installation_receipt before update or delete
 on production_control.canonical_bootstrap_installation_v1 for each row
 execute function production_control.guard_certification_initialization_evidence_v1();

create function production_control.record_certification_initialization_origin_v1(initial_generation uuid)
returns void language plpgsql security definer set search_path=pg_catalog as $$
declare r production_control.canonical_resource_v1%rowtype;
 i production_control.canonical_bootstrap_installation_v1%rowtype;
 a production_control.certification_admission_v1%rowtype;
 p production_control.current_tournament_pointer_v1%rowtype;
 e scoring_authority.authority_epochs%rowtype;
 g production_control.certification_ingress_generations_v1%rowtype;
 fingerprint text; admission_created_here boolean;
begin
 select * into strict g from production_control.certification_ingress_generations_v1 where generation_id=initial_generation;
 select * into strict r from production_control.canonical_resource_v1 where resource_id=g.resource_id;
 select * into strict i from production_control.canonical_bootstrap_installation_v1 where contract_version='bagger-canonical-bootstrap-v1';
 select * into strict a from production_control.certification_admission_v1 where resource_id=g.resource_id;
 select (value.xmin::text=pg_current_xact_id()::text) into strict admission_created_here
  from production_control.certification_admission_v1 value where resource_id=g.resource_id;
 select * into strict p from production_control.current_tournament_pointer_v1 where scope_key=g.resource_id;
 select * into strict e from scoring_authority.authority_epochs where epoch_id=g.authority_epoch_id;
 if r.resource_class<>'CERTIFICATION' or r.database_name<>current_database()
  or r.schema_digest is distinct from i.schema_sha256
  or a.authority_epoch_id<>e.epoch_id or a.governance_tournament_id<>'2026'
  or p.pointer_revision<>1 or p.tournament_id<>'2026' or p.tournament_year<>2026
  or g.pointer_revision<>p.pointer_revision or g.tournament_id<>p.tournament_id or g.predecessor_generation_id is not null
  or e.epoch_type<>'CERTIFICATION_INITIALIZATION' or e.status<>'COMMITTED'
  or e.authority_before<>'SUPABASE' or e.authority_after<>'SUPABASE' or e.tournament_id<>p.tournament_id
  or exists(select 1 from production_control.resource_scope) or exists(select 1 from production_control.cutover_activation_state)
  or not ((admission_created_here and not a.enabled) or exists(
   select 1 from production_control.operation_audit_events audit
   where audit.event_type='CERTIFICATION_AUTHORITY_INITIALIZED' and audit.result='SUCCEEDED'
    and audit.details->>'resource_id'=r.resource_id
    and audit.details->>'installation_id'=r.installation_id::text
    and audit.details->>'binding_id'=a.binding_id::text
    and audit.details->>'authority_epoch_id'=e.epoch_id::text
    and audit.details->>'enabled'='false' and audit.details->>'ingress'='PAUSED')) then
  raise exception using errcode='55000',message='CERTIFICATION_INITIALIZATION_RECEIPT_REQUIRED';end if;
 -- Registration-manifest authority and installation artifact manifest are
 -- intentionally distinct digests. Both are retained; neither substitutes for
 -- the other. Schema bytes must agree with the installed canonical receipt.
 fingerprint:=production_control.cutover_payload_hash(jsonb_build_object(
  'resource',to_jsonb(r)-'created_at','installation',to_jsonb(i),
  'authority_epoch_id',e.epoch_id,'admission_generation_id',g.generation_id,
  'initial_pointer',to_jsonb(p)-'updated_at','binding_id',a.binding_id));
 insert into production_control.certification_initialization_origins_v1(resource_id,installation_id,database_name,project_ref,project_url,
  registration_revision,installation_contract,registration_manifest_digest,installation_manifest_digest,schema_digest,static_data_digest,
  authority_epoch_id,admission_generation_id,initial_tournament_id,initial_pointer_revision,initial_lifecycle_revision,binding_id,
  initialization_fingerprint,created_by)
 values(r.resource_id,r.installation_id,r.database_name,r.project_ref,r.project_url,r.registration_revision,i.contract_version,
  r.manifest_digest,i.manifest_sha256,i.schema_sha256,i.static_data_sha256,e.epoch_id,g.generation_id,p.tournament_id,p.pointer_revision,
  p.lifecycle_revision,a.binding_id,fingerprint,current_user);
 insert into production_control.operation_audit_events(event_type,domain,actor,result,details)
 values('CERTIFICATION_INITIALIZATION_ORIGIN_RECORDED','RESOURCE',current_user,'SUCCEEDED',jsonb_build_object(
  'resource_id',r.resource_id,'installation_id',r.installation_id,'initialization_fingerprint',fingerprint,
  'authority_epoch_id',e.epoch_id,'admission_generation_id',g.generation_id,'installation_contract',i.contract_version,
  'registration_manifest_digest',r.manifest_digest,'installation_manifest_digest',i.manifest_sha256));
exception when no_data_found then raise exception using errcode='55000',message='CERTIFICATION_INITIALIZATION_RECEIPT_REQUIRED';
end;$$;

create function production_control.capture_certification_initialization_origin_v1()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare r production_control.canonical_resource_v1%rowtype;
 o production_control.certification_initialization_origins_v1%rowtype;
 prior production_control.certification_ingress_generations_v1%rowtype;
begin
 select * into strict r from production_control.canonical_resource_v1 where singleton;
 if r.resource_class<>'CERTIFICATION' or r.database_name<>current_database() or new.resource_id<>r.resource_id then
  raise exception using errcode='55000',message='CERTIFICATION_INITIALIZATION_RESOURCE_MISMATCH';end if;
 select * into o from production_control.certification_initialization_origins_v1 where resource_id=new.resource_id;
 if not found then
  perform production_control.record_certification_initialization_origin_v1(new.generation_id);
  return new;
 end if;
 -- Every later generation follows the actual closed predecessor in the same
 -- physical installation; existence of an origin alone grants no new lineage.
 select * into strict prior from production_control.certification_ingress_generations_v1
  where generation_id=new.predecessor_generation_id and resource_id=new.resource_id;
 if o.installation_id<>r.installation_id or o.database_name<>r.database_name
  or o.project_ref<>r.project_ref or o.project_url<>r.project_url
  or prior.state<>'CLOSED' or new.state<>'OPEN'
  or new.pointer_revision not in(prior.pointer_revision,prior.pointer_revision+1) then
  raise exception using errcode='55000',message='CERTIFICATION_INITIALIZATION_LINEAGE_MISMATCH';end if;
 return new;
exception when no_data_found then raise exception using errcode='55000',message='CERTIFICATION_INITIALIZATION_LINEAGE_REQUIRED';
end;$$;
create trigger capture_certification_initialization_origin after insert
 on production_control.certification_ingress_generations_v1 for each row
 execute function production_control.capture_certification_initialization_origin_v1();

-- Safe local upgrade derives only a still-initial pointer and the existing
-- audited initialization. A pointer already advanced cannot invent its origin.
do $existing_initial_origin$
declare value record;
begin
 for value in select r.resource_id,g.generation_id from production_control.canonical_resource_v1 r
  join production_control.certification_ingress_generations_v1 g on g.resource_id=r.resource_id and g.predecessor_generation_id is null
  where r.resource_class='CERTIFICATION' loop
  perform production_control.record_certification_initialization_origin_v1(value.generation_id);
 end loop;
 if exists(select 1 from production_control.canonical_resource_v1 r where r.resource_class='CERTIFICATION'
  and not exists(select 1 from production_control.certification_initialization_origins_v1 o where o.resource_id=r.resource_id)) then
  raise exception 'CERTIFICATION_INITIALIZATION_RECEIPT_REQUIRED';end if;
end;$existing_initial_origin$;

-- Existing historical closures remain PRODUCTION. Nullability is conditioned
-- by the physical resource class, never a caller-selectable escape hatch.
alter table production_control.scoring_admission_closures
 add column resource_class text not null default 'PRODUCTION' check(resource_class in('PRODUCTION','CERTIFICATION')),
 add column certification_resource_id text references production_control.certification_initialization_origins_v1(resource_id),
 add column prior_certification_closure_id uuid references production_control.scoring_admission_closures(closure_id),
 add constraint scoring_admission_closures_resource_provenance check(
  (resource_class='PRODUCTION' and certification_resource_id is null and prior_certification_closure_id is null)
  or(resource_class='CERTIFICATION' and certification_resource_id is not null
   and closure_kind='SUPABASE_INGRESS' and authority='SUPABASE' and prior_legacy_closure_id is null
   and external_fence_evidence_id is null and google_writer_provider_fence_id is null
   and google_writer_provider_verification_id is null and coalesce(google_checkpoints,'{}')='{}'));


-- Preserve both original044 Production boundary branches byte-for-byte as
-- PostgreSQL expressions. A maintenance closure has deliberately NULL provider
-- IDs and must retain its original stable-source/parity requirements. The new
-- Certification branch never impersonates either historical boundary mode.
do $class_boundary$
declare original_mode text;original_evidence text;
begin
 select pg_get_expr(conbin,conrelid) into strict original_mode from pg_constraint
  where conrelid='production_control.scoring_admission_closures'::regclass
   and conname='production_scoring_closure_boundary_mode_check';
 select pg_get_expr(conbin,conrelid) into strict original_evidence from pg_constraint
  where conrelid='production_control.scoring_admission_closures'::regclass
   and conname='production_scoring_closure_boundary_evidence_check';
 alter table production_control.scoring_admission_closures
  drop constraint production_scoring_closure_boundary_mode_check,
  drop constraint production_scoring_closure_boundary_evidence_check;
 execute format('alter table production_control.scoring_admission_closures add constraint production_scoring_closure_boundary_mode_check check ((resource_class=''PRODUCTION'' and (%s)) or (resource_class=''CERTIFICATION'' and boundary_mode=''CERTIFICATION_INGRESS_V1''))',original_mode);
 execute format('alter table production_control.scoring_admission_closures add constraint production_scoring_closure_boundary_evidence_check check ((resource_class=''PRODUCTION'' and (%s)) or (resource_class=''CERTIFICATION'' and boundary_mode=''CERTIFICATION_INGRESS_V1'' and external_fence_evidence_id is null and google_writer_provider_fence_id is null and google_writer_provider_verification_id is null and first_source_fingerprint is null and first_source_captured_at is null and second_source_captured_at is null and supabase_shadow_fingerprint is null and unexplained_difference_count is null))',original_evidence);
end;$class_boundary$;

alter table production_control.annual_scoring_runtime_authorities_v1
 add column resource_class text not null default 'PRODUCTION' check(resource_class in('PRODUCTION','CERTIFICATION')),
 add column certification_resource_id text references production_control.certification_initialization_origins_v1(resource_id),
 alter column legacy_root_closure_id drop not null,
 add constraint annual_scoring_authority_resource_provenance check(
  (resource_class='PRODUCTION' and certification_resource_id is null and legacy_root_closure_id is not null)
  or(resource_class='CERTIFICATION' and certification_resource_id is not null and legacy_root_closure_id is null
   and google_writer_generation_id is null and destination_workbook_id is null and google_target_contract_fingerprint is null));

alter table production_control.annual_scoring_transitions_v1
 add column resource_class text not null default 'PRODUCTION' check(resource_class in('PRODUCTION','CERTIFICATION')),
 add column certification_resource_id text references production_control.certification_initialization_origins_v1(resource_id),
 add constraint annual_scoring_transition_resource_provenance check(
  (resource_class='PRODUCTION' and certification_resource_id is null)
  or(resource_class='CERTIFICATION' and certification_resource_id is not null));

alter table production_control.annual_scoring_transition_receipts_v1
 add column certification_resource_id text references production_control.certification_initialization_origins_v1(resource_id),
 add column certification_actor_auth_user_id uuid references auth.users(id),
 add column certification_actor_player_id text references scoring_authority.players(player_id),
 add constraint annual_scoring_receipt_origin_shape check(
  (certification_resource_id is null and certification_actor_auth_user_id is null and certification_actor_player_id is null)
  or(certification_resource_id is not null and certification_actor_auth_user_id is not null and certification_actor_player_id is not null));

alter table production_control.scoring_admission_closures
 drop constraint production_scoring_admission_closure_kind_shape_check,
 add constraint production_scoring_admission_closure_kind_shape_check check(
 (resource_class='PRODUCTION' and ((closure_kind='LEGACY_ADMISSION' and prior_legacy_closure_id is null and authority='GOOGLE')
  or(closure_kind='SUPABASE_INGRESS' and prior_legacy_closure_id is not null and authority='SUPABASE')))
 or(resource_class='CERTIFICATION' and closure_kind='SUPABASE_INGRESS' and prior_legacy_closure_id is null and authority='SUPABASE'));

create unique index certification_closure_generation on production_control.scoring_admission_closures
 (certification_resource_id,admission_generation_id) where resource_class='CERTIFICATION';


-- 138 assembly fragment; insert AFTER verified existing_initial_origin and BEFORE
-- successor helpers. Root separately sets explicit mode in successor INSERTs.
-- Original Production CHECK expressions are retained, not reimplemented.
do $epoch_gate_modes$
declare e_mode text;e_evidence text;g_mode text;g_shape text;
begin
 select pg_get_expr(conbin,conrelid) into strict e_mode from pg_constraint
  where conrelid='scoring_authority.authority_epochs'::regclass and conname='production_authority_epoch_boundary_mode_check';
 select pg_get_expr(conbin,conrelid) into strict e_evidence from pg_constraint
  where conrelid='scoring_authority.authority_epochs'::regclass and conname='production_authority_epoch_boundary_evidence_check';
 select pg_get_expr(conbin,conrelid) into strict g_mode from pg_constraint
  where conrelid='scoring_authority.ingress_gates'::regclass and conname='production_scoring_gate_boundary_mode_check';
 select pg_get_expr(conbin,conrelid) into strict g_shape from pg_constraint
  where conrelid='scoring_authority.ingress_gates'::regclass and conname='production_scoring_admission_gate_shape_check';
 alter table scoring_authority.authority_epochs drop constraint production_authority_epoch_boundary_mode_check,
  drop constraint production_authority_epoch_boundary_evidence_check;
 alter table scoring_authority.ingress_gates drop constraint production_scoring_gate_boundary_mode_check,
  drop constraint production_scoring_admission_gate_shape_check;
 execute format('alter table scoring_authority.authority_epochs add constraint production_authority_epoch_boundary_mode_check check ((epoch_type not in(''CERTIFICATION_INITIALIZATION'',''CERTIFICATION_ANNUAL_TRANSITION'') and (%s)) or (epoch_type in(''CERTIFICATION_INITIALIZATION'',''CERTIFICATION_ANNUAL_TRANSITION'') and boundary_mode=''CERTIFICATION_INGRESS_V1'')) not valid',e_mode);
 execute format('alter table scoring_authority.authority_epochs add constraint production_authority_epoch_boundary_evidence_check check ((epoch_type not in(''CERTIFICATION_INITIALIZATION'',''CERTIFICATION_ANNUAL_TRANSITION'') and (%s)) or (epoch_type in(''CERTIFICATION_INITIALIZATION'',''CERTIFICATION_ANNUAL_TRANSITION'') and boundary_mode=''CERTIFICATION_INGRESS_V1'' and authority_before=''SUPABASE'' and authority_after=''SUPABASE'' and external_fence_evidence_id is null and google_writer_provider_fence_id is null and google_writer_provider_verification_id is null and google_checkpoints=''{}''::jsonb and supabase_shadow_fingerprint is null and commit_source_fingerprint is null and commit_source_verified_at is null)) not valid',e_evidence);
 execute format('alter table scoring_authority.ingress_gates add constraint production_scoring_gate_boundary_mode_check check ((boundary_mode<>''CERTIFICATION_INGRESS_V1'' and (%s)) or boundary_mode=''CERTIFICATION_INGRESS_V1'') not valid',g_mode);
 execute format('alter table scoring_authority.ingress_gates add constraint production_scoring_admission_gate_shape_check check ((boundary_mode<>''CERTIFICATION_INGRESS_V1'' and (%s)) or (boundary_mode=''CERTIFICATION_INGRESS_V1'' and authority=''SUPABASE'' and active_epoch_id is not null and not admission_protocol_enforced and external_fence_evidence_id is null and google_writer_provider_fence_id is null and google_writer_provider_verification_id is null)) not valid',g_shape);
end;$epoch_gate_modes$;

-- Class provenance only. This does not admit a mutation or replace any ingress
-- check; Certification writes still require the separately admitted136 ledger.
create function production_control.guard_certification_gate_boundary_mode_v1()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare r production_control.canonical_resource_v1%rowtype;e scoring_authority.authority_epochs%rowtype;
begin
 select * into r from production_control.canonical_resource_v1 where singleton;
 if r.resource_class is distinct from 'CERTIFICATION' then
  if new.boundary_mode='CERTIFICATION_INGRESS_V1' then
   raise exception using errcode='42501',message='CERTIFICATION_GATE_RESOURCE_REQUIRED';end if;
  return new;
 end if;
 select * into e from scoring_authority.authority_epochs where epoch_id=new.active_epoch_id;
 if r.database_name is distinct from current_database()
  or new.boundary_mode is distinct from 'CERTIFICATION_INGRESS_V1'
  or new.authority is distinct from 'SUPABASE'
  or e.tournament_id is distinct from new.tournament_id
  or e.boundary_mode is distinct from 'CERTIFICATION_INGRESS_V1'
  or e.epoch_type is null or e.epoch_type not in('CERTIFICATION_INITIALIZATION','CERTIFICATION_ANNUAL_TRANSITION')
  or exists(select 1 from production_control.resource_scope)
  or exists(select 1 from production_control.cutover_activation_state) then
  raise exception using errcode='42501',message='CERTIFICATION_GATE_RESOURCE_REQUIRED';end if;
 return new;
end;$$;
revoke all on function production_control.guard_certification_gate_boundary_mode_v1() from public,anon,authenticated,service_role;
create trigger guard_certification_gate_boundary_mode before insert or update on scoring_authority.ingress_gates
 for each row execute function production_control.guard_certification_gate_boundary_mode_v1();
do $boundary_mode_acl$begin
 if exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))a
  where p.oid='production_control.guard_certification_gate_boundary_mode_v1()'::regprocedure
   and a.privilege_type='EXECUTE' and a.grantee<>p.proowner)then raise exception 'CERTIFICATION_GATE_BOUNDARY_PRIVILEGE_EXPANDED';end if;
end;$boundary_mode_acl$;

-- Only previously verified genuine initial Certification rows are corrected.
-- There is no legacy Production mutation and no manufactured annual lineage.
do $verified_initial_modes$
declare r production_control.canonical_resource_v1%rowtype;o production_control.certification_initialization_origins_v1%rowtype;
begin
 select * into r from production_control.canonical_resource_v1 where singleton;
 if r.resource_class='CERTIFICATION' then
  select * into strict o from production_control.certification_initialization_origins_v1 where resource_id=r.resource_id;
  if o.database_name<>current_database() or exists(select 1 from scoring_authority.authority_epochs e
    where e.epoch_type in('CERTIFICATION_INITIALIZATION','CERTIFICATION_ANNUAL_TRANSITION')
     and (e.epoch_id<>o.authority_epoch_id or e.epoch_type<>'CERTIFICATION_INITIALIZATION'
      or e.external_fence_evidence_id is not null or e.google_writer_provider_fence_id is not null
      or e.google_writer_provider_verification_id is not null or e.supabase_shadow_fingerprint is not null
      or e.commit_source_fingerprint is not null or e.commit_source_verified_at is not null))
   or exists(select 1 from scoring_authority.ingress_gates g where g.active_epoch_id is distinct from o.authority_epoch_id
    or g.tournament_id is distinct from o.initial_tournament_id or g.external_fence_evidence_id is not null
    or g.google_writer_provider_fence_id is not null or g.google_writer_provider_verification_id is not null
    or g.admission_protocol_enforced) then raise exception 'CERTIFICATION_INITIAL_MODE_UPGRADE_UNREVIEWED';end if;
  update scoring_authority.authority_epochs set boundary_mode='CERTIFICATION_INGRESS_V1' where epoch_id=o.authority_epoch_id;
  update scoring_authority.ingress_gates set boundary_mode='CERTIFICATION_INGRESS_V1'
   where tournament_id=o.initial_tournament_id and active_epoch_id=o.authority_epoch_id;
 end if;
end;$verified_initial_modes$;
alter table scoring_authority.authority_epochs validate constraint production_authority_epoch_boundary_mode_check,
 validate constraint production_authority_epoch_boundary_evidence_check;
alter table scoring_authority.ingress_gates validate constraint production_scoring_gate_boundary_mode_check,
 validate constraint production_scoring_admission_gate_shape_check;

-- Keep OID/owner/ACL/security/config: CREATE OR REPLACE from authentic definition.
do $initialize_truthful_boundary$
declare definition text;body text;before_oid oid;before_owner oid;before_acl aclitem[];before_config text[];v record;
begin
 select p.oid,p.proowner,p.proacl,p.proconfig,p.prosrc,pg_get_functiondef(p.oid)
 into strict before_oid,before_owner,before_acl,before_config,body,definition
 from pg_proc p where p.oid='production_control.initialize_certification_resource_v1(jsonb)'::regprocedure;
 if encode(extensions.digest(body,'sha256'),'hex')<>'0c8ff4d0ebc46bee27d98bd23c0ba6878bbce109987c57ce8d947b11a69d0ee2' then
  raise exception 'CERTIFICATION_INITIALIZER_BOUNDARY_PREDECESSOR_MISMATCH';end if;
 for v in select *from(values
  ('reconciliation_fingerprint,google_checkpoints,supabase_match_revisions,deployment_commit,actor_id,reason,committed_at)',
   'reconciliation_fingerprint,google_checkpoints,supabase_match_revisions,deployment_commit,actor_id,reason,committed_at,boundary_mode)'),
  ('''Owner-installed synthetic Certification authority; no prior provider authority'',clock_timestamp());',
   '''Owner-installed synthetic Certification authority; no prior provider authority'',clock_timestamp(),''CERTIFICATION_INGRESS_V1'');'),
  ('insert into scoring_authority.ingress_gates(tournament_id,state,authority,active_epoch_id,unresolved_client_queues,updated_by)',
   'insert into scoring_authority.ingress_gates(tournament_id,state,authority,active_epoch_id,unresolved_client_queues,updated_by,boundary_mode)'),
  ('values(''2026'',''PAUSED'',''SUPABASE'',epoch_id,0,current_user);',
   'values(''2026'',''PAUSED'',''SUPABASE'',epoch_id,0,current_user,''CERTIFICATION_INGRESS_V1'');'))x(old_part,new_part)loop
  if (length(definition)-length(replace(definition,v.old_part,'')))/length(v.old_part)<>1 then
   raise exception 'CERTIFICATION_INITIALIZER_BOUNDARY_ANCHOR_MISMATCH';end if;
  definition:=replace(definition,v.old_part,v.new_part);
 end loop;
 execute definition;
 if exists(select 1 from pg_proc p where p.oid=before_oid and
  (p.proowner<>before_owner or p.proacl is distinct from before_acl or p.proconfig is distinct from before_config
   or p.prosecdef or p.provolatile<>'v'))then raise exception 'CERTIFICATION_INITIALIZER_BOUNDARY_PRIVILEGE_CHANGED';end if;
 if 'production_control.initialize_certification_resource_v1(jsonb)'::regprocedure::oid<>before_oid then
  raise exception 'CERTIFICATION_INITIALIZER_BOUNDARY_OID_CHANGED';end if;
end;$initialize_truthful_boundary$;


create function production_control.annual_resource_context_v2()
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare r production_control.canonical_resource_v1%rowtype;
 s production_control.resource_scope%rowtype;p production_control.current_tournament_pointer_v1%rowtype;
begin
 select * into strict r from production_control.canonical_resource_v1 where singleton;
 if r.resource_class='CERTIFICATION' then return production_control.current_canonical_resource_context_v1();end if;
 select * into strict s from production_control.resource_scope where scope_key='BAGGER_INV_PRODUCTION';
 select * into strict p from production_control.current_tournament_pointer_v1 where scope_key=s.scope_key;
 return jsonb_build_object('resource_class','PRODUCTION','resource_id',s.scope_key,'project_ref',s.project_ref,
  'project_url',s.project_url,'provenance_id',s.google_workbook_id,'installation_id',r.installation_id,
  'registration_revision',r.registration_revision,'manifest_digest',r.manifest_digest,'schema_digest',r.schema_digest,
  'current_tournament_id',p.tournament_id,'current_tournament_year',p.tournament_year,'pointer_revision',p.pointer_revision,
  'lifecycle_revision',p.lifecycle_revision,'governance_tournament_id','2026');
end;$$;

create function production_control.assert_canonical_annual_transition_context_v2(input jsonb, context jsonb)
returns void language plpgsql security definer set search_path=pg_catalog as $$
declare live jsonb; marker production_control.canonical_operation_context_v1%rowtype;
begin
 if context->>'resource_class'='PRODUCTION' then
  if context<>jsonb_build_object('resource_class','PRODUCTION','resource_id','BAGGER_INV_PRODUCTION')then
   raise exception using errcode='42501',message='CANONICAL_ANNUAL_CONTEXT_REQUIRED';end if;
  -- Only original admitted Production wrappers call this private core branch.
  -- Its resource/actor admission remains at the original wrapper boundary.
  if not exists(select 1 from production_control.canonical_resource_v1 where singleton and resource_class='PRODUCTION')then
   raise exception using errcode='42501',message='CANONICAL_ANNUAL_CONTEXT_REQUIRED';end if;
  return;
 end if;
 live:=production_control.current_certification_context_v1();
 select * into strict marker from production_control.canonical_operation_context_v1
 where backend_pid=pg_backend_pid() and transaction_id=pg_current_xact_id();
 if context is distinct from live or context->>'phase' is distinct from 'ANNUAL'
  or not marker.mutation or input->>'operation_request_id' is distinct from context->>'operation_request_id'
  or context->>'resource_class' is distinct from 'CERTIFICATION'
  or input->>'environment' is distinct from 'CERTIFICATION'
  or input#>>'{authorization,player_id}' is distinct from context#>>'{authorization,player_id}'
  or input#>>'{authorization,auth_user_id}' is distinct from context#>>'{authorization,auth_user_id}'
  or input#>>'{authorization,role}' is distinct from 'DIRECTOR' then
  raise exception using errcode='42501',message='CANONICAL_ANNUAL_CONTEXT_REQUIRED';end if;
 -- Current authority was verified before constructing this stable logical
 -- operation envelope. Historical request target is never new write authority.
end;$$;

create function production_control.lookup_canonical_annual_scoring_receipt_v2(operation_value text,input jsonb,context jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare result jsonb;r production_control.annual_scoring_transition_receipts_v1%rowtype;
begin
 if context->>'resource_class'='PRODUCTION' then
  return production_control.lookup_annual_scoring_receipt_v1(operation_value,input);
 end if;
 if coalesce(input->>'request_payload_hash','')!~'^[0-9a-f]{64}$'
  or input->>'request_payload_hash' is distinct from production_control.future_runtime_hash_v2(input-'request_payload_hash') then
  raise exception using errcode='22023',message='PRODUCTION_ANNUAL_SCORING_PAYLOAD_HASH_INVALID';end if;
 -- No receipt-existence/payload-conflict oracle before origin is established.
 select * into r from production_control.annual_scoring_transition_receipts_v1
 where operation=operation_value and operation_request_id=(input->>'operation_request_id')::uuid;
 if not found then return null;end if;
 if r.certification_resource_id is distinct from context->>'resource_id'
  or r.certification_actor_player_id is distinct from context#>>'{authorization,player_id}'
  or r.certification_actor_auth_user_id::text is distinct from context#>>'{authorization,auth_user_id}'then
  return null;
 end if;
 result:=production_control.lookup_annual_scoring_receipt_v1(operation_value,input);
 return result;
end;$$;

create function production_control.store_canonical_annual_scoring_receipt_v2(operation_value text,input jsonb,response_value jsonb,context jsonb)
returns void language plpgsql security definer set search_path=pg_catalog as $$
begin
 if context->>'resource_class'='PRODUCTION' then
  perform production_control.store_annual_scoring_receipt_v1(operation_value,input,response_value);return;end if;
 -- Called only by the private shared transition core, after wrapper admission
 -- and while the exclusive fence remains held. Activation has atomically
 -- advanced current context by this point; its immutable origin is retained.
 insert into production_control.annual_scoring_transition_receipts_v1(operation,operation_request_id,request_payload_hash,response,
  certification_resource_id,certification_actor_auth_user_id,certification_actor_player_id)
 values(operation_value,(input->>'operation_request_id')::uuid,production_control.future_runtime_hash_v2(input-'request_payload_hash'),
  response_value,context->>'resource_id',(context#>>'{authorization,auth_user_id}')::uuid,context#>>'{authorization,player_id}');
 insert into production_control.operation_audit_events(event_type,domain,tournament_id,actor,request_fingerprint,result,details)
 values('CERTIFICATION_ANNUAL_TRANSITION','ANNUAL',input->>'expected_current_tournament_id',context#>>'{authorization,player_id}',
  production_control.future_runtime_hash_v2(input-'request_payload_hash'),'SUCCEEDED',jsonb_build_object(
   'resource_class','CERTIFICATION','resource_id',context->>'resource_id','installation_id',context->>'installation_id',
   'operation',operation_value,'operation_request_id',input->>'operation_request_id','actor_auth_user_id',context#>>'{authorization,auth_user_id}',
   'origin_pointer_revision',context->'pointer_revision','origin_authority_epoch_id',context->>'authority_epoch_id',
   'origin_admission_revision',context->'admission_revision','release_commit',context->>'release_commit','receipt',response_value));
end;$$;

create function production_control.canonical_annual_scope_key_v2() returns text
language plpgsql security definer set search_path=pg_catalog as $$
begin
 if exists(select 1 from production_control.canonical_resource_v1 where singleton and resource_class='CERTIFICATION')then
  return production_control.current_certification_context_v1()->>'resource_id';
 end if;
 return 'BAGGER_INV_PRODUCTION';
end;$$;


-- Certification-specific ingress adapter. Canonical transition algorithms call
-- this only after the separately admitted annual owner wrapper takes the fence.
create function production_control.close_certification_annual_predecessor_v1(input jsonb,target_tournament text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare c jsonb:=production_control.annual_resource_context_v2();e jsonb;revisions jsonb;source_hash text;
 g production_control.certification_ingress_generations_v1%rowtype;
 o production_control.certification_initialization_origins_v1%rowtype;
 a production_control.annual_scoring_runtime_authorities_v1%rowtype;
 closed production_control.scoring_admission_closures%rowtype;prior_closure uuid;
begin
 if c->>'resource_class' is distinct from 'CERTIFICATION' or c->>'phase' is distinct from 'ANNUAL'
  or c->>'current_tournament_id' is distinct from target_tournament then
  raise exception using errcode='42501',message='CERTIFICATION_ANNUAL_CONTEXT_REQUIRED';end if;
 perform pg_advisory_xact_lock(production_control.scoring_admission_lock_key());
 select * into strict o from production_control.certification_initialization_origins_v1 where resource_id=c->>'resource_id';
 select * into strict g from production_control.certification_ingress_generations_v1
 where resource_id=o.resource_id and tournament_id=target_tournament and state='OPEN' for update;
 if input->>'expected_certification_admission_generation_id' is distinct from g.generation_id::text
  or input->>'expected_certification_admission_revision' is distinct from g.revision::text
  or g.authority_epoch_id::text is distinct from c->>'authority_epoch_id'
  or g.pointer_revision::text is distinct from c->>'pointer_revision' then
  raise exception using errcode='40001',message='CERTIFICATION_ANNUAL_GENERATION_STALE';end if;
 if not exists(select 1 from scoring_authority.matches where tournament_id=target_tournament)
  or exists(select 1 from scoring_authority.matches where tournament_id=target_tournament
   and(status<>'FINAL' or not scorecard_complete or unresolved_mutations<>0))then
  raise exception using errcode='55000',message='PREDECESSOR_FINAL_SCORING_FACTS_REQUIRED';end if;
 if target_tournament<>o.initial_tournament_id then
  select * into strict a from production_control.annual_scoring_runtime_authorities_v1 where tournament_id=target_tournament for update;
  if a.resource_class<>'CERTIFICATION' or a.certification_resource_id<>o.resource_id
   or a.authority_status<>'ACTIVE' or a.admission_state<>'OPEN'
   or a.admission_generation_id<>g.generation_id or a.authority_generation_id<>g.authority_epoch_id
   or a.pointer_revision<>g.pointer_revision then
   raise exception using errcode='40001',message='CERTIFICATION_ANNUAL_GENERATION_STALE';end if;
  prior_closure:=a.predecessor_closure_id;
 elsif g.predecessor_generation_id is not null then
  select closure_id into strict prior_closure from production_control.scoring_admission_closures
   where certification_resource_id=o.resource_id and admission_generation_id=g.predecessor_generation_id;
 end if;
 revisions:=production_control.current_match_revisions(target_tournament);
 source_hash:=production_control.future_runtime_hash_v2(revisions);
 e:=production_control.close_certification_ingress_generation_v1(o.resource_id,g.generation_id,g.revision);
 insert into production_control.scoring_admission_closures(resource_class,certification_resource_id,closure_kind,boundary_mode,prior_certification_closure_id,
  tournament_id,authority,authority_generation_id,admission_generation_id,deployment_id,status,opening_admission_revision,
  closing_admission_revision,lease_high_watermark,start_source_fingerprint,google_checkpoints,close_request_fingerprint,close_payload_hash,actor_id)
 values('CERTIFICATION',o.resource_id,'SUPABASE_INGRESS','CERTIFICATION_INGRESS_V1',prior_closure,target_tournament,'SUPABASE',g.authority_epoch_id,g.generation_id,
  c->>'deployment_id','CLOSING',g.revision,(e->>'generation_revision')::bigint,(e->>'captured_high_watermark')::bigint,source_hash,'{}',
  production_control.future_runtime_hash_v2(jsonb_build_object('resource_id',o.resource_id,'generation_id',g.generation_id,
   'operation_request_id',input->>'operation_request_id')),production_control.future_runtime_hash_v2(input-'request_payload_hash'),
  c#>>'{authorization,player_id}') returning * into closed;
 update scoring_authority.ingress_gates set state='PAUSED',updated_by=c#>>'{authorization,player_id}',updated_at=clock_timestamp()
 where tournament_id=target_tournament and authority='SUPABASE' and active_epoch_id=g.authority_epoch_id;
 if not found then raise exception using errcode='40001',message='CERTIFICATION_ANNUAL_GENERATION_STALE';end if;
 if a.runtime_generation_id is not null then
  update production_control.annual_scoring_runtime_authorities_v1 set admission_state='CLOSING',active_closure_id=closed.closure_id,
   admission_revision=admission_revision+1,updated_at=clock_timestamp() where runtime_generation_id=a.runtime_generation_id;
 end if;
 return jsonb_build_object('closure_id',closed.closure_id,'active_or_unresolved_leases',
  (e->>'active_count')::bigint+(e->>'unknown_count')::bigint,'certification_ingress',e);
end;$$;

create function production_control.drain_certification_annual_predecessor_v1(target_closure uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare c jsonb:=production_control.annual_resource_context_v2();e jsonb;revisions jsonb;closed production_control.scoring_admission_closures%rowtype;
 g production_control.certification_ingress_generations_v1%rowtype;
begin
 if c->>'resource_class' is distinct from 'CERTIFICATION' or c->>'phase' is distinct from 'ANNUAL' then
  raise exception using errcode='42501',message='CERTIFICATION_ANNUAL_CONTEXT_REQUIRED';end if;
 perform pg_advisory_xact_lock(production_control.scoring_admission_lock_key());
 select * into strict closed from production_control.scoring_admission_closures where closure_id=target_closure for update;
 select * into strict g from production_control.certification_ingress_generations_v1
 where resource_id=c->>'resource_id' and generation_id=closed.admission_generation_id for update;
 if closed.resource_class<>'CERTIFICATION' or closed.certification_resource_id<>c->>'resource_id'
  or closed.tournament_id is distinct from c->>'current_tournament_id' or closed.status not in('CLOSING','CLOSED')
  or closed.authority_generation_id<>g.authority_epoch_id or closed.closing_admission_revision<>g.revision
  or closed.lease_high_watermark is distinct from g.high_watermark then
  raise exception using errcode='40001',message='CERTIFICATION_ANNUAL_GENERATION_STALE';end if;
 e:=production_control.close_certification_ingress_generation_v1(g.resource_id,g.generation_id,g.revision);
 if e->>'state'<>'CLOSED' or not(e->>'drained')::boolean then
  return jsonb_build_object('ready_to_finalize',false,'active_or_unresolved_leases',
   (e->>'active_count')::bigint+(e->>'unknown_count')::bigint,'certification_ingress',e);end if;
 if not(e->>'fingerprint_matches')::boolean then
  raise exception using errcode='55000',message='CERTIFICATION_INGRESS_CLOSED_EVIDENCE_INVALID';end if;
 revisions:=production_control.current_match_revisions(closed.tournament_id);
 if closed.status='CLOSING' then
  update production_control.scoring_admission_closures set status='CLOSED',closed_at=clock_timestamp(),
   closed_admission_revision=g.revision,final_source_fingerprint=production_control.future_runtime_hash_v2(revisions),
   reconciliation_fingerprint=production_control.future_runtime_hash_v2(jsonb_build_object('resource_id',g.resource_id,
    'generation_id',g.generation_id,'watermark',g.high_watermark,'lease_fingerprint',e->>'fingerprint','match_revisions',revisions)),
   lease_set_fingerprint=e->>'fingerprint',supabase_match_revisions=revisions,google_checkpoints='{}'
  where closure_id=closed.closure_id;
  update production_control.annual_scoring_runtime_authorities_v1 set authority_status='CLOSED',admission_state='CLOSED',
   closed_at=clock_timestamp(),updated_at=clock_timestamp()
  where resource_class='CERTIFICATION' and certification_resource_id=g.resource_id and tournament_id=g.tournament_id;
 end if;
 return jsonb_build_object('ready_to_finalize',true,'active_or_unresolved_leases',0,'certification_ingress',e);
end;$$;

create function production_control.certification_annual_predecessor_certificate_v1(target_tournament text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare c jsonb:=production_control.annual_resource_context_v2();e jsonb;blocks jsonb:='[]';fp text;
 o production_control.certification_initialization_origins_v1%rowtype;
 closed production_control.scoring_admission_closures%rowtype;
 g production_control.certification_ingress_generations_v1%rowtype;
 a production_control.annual_scoring_runtime_authorities_v1%rowtype;
begin
 if c->>'resource_class' is distinct from 'CERTIFICATION' or c->>'phase' is distinct from 'ANNUAL'
  or c->>'current_tournament_id' is distinct from target_tournament then
  raise exception using errcode='42501',message='CERTIFICATION_ANNUAL_CONTEXT_REQUIRED';end if;
 select * into strict o from production_control.certification_initialization_origins_v1 where resource_id=c->>'resource_id';
 select * into closed from production_control.scoring_admission_closures
 where certification_resource_id=o.resource_id and tournament_id=target_tournament and status in('CLOSING','CLOSED')
 order by closing_at desc,closure_id limit 1;
 if closed.closure_id is null then
  return jsonb_build_object('certified',false,'tournamentId',target_tournament,'fingerprint',null,
   'blockers',jsonb_build_array('PREDECESSOR_SCORING_ADMISSION_NOT_CLOSED'));end if;
 select * into strict g from production_control.certification_ingress_generations_v1
 where resource_id=o.resource_id and generation_id=closed.admission_generation_id;
 e:=production_control.certification_ingress_evidence_v1(o.resource_id,g.generation_id);
 if target_tournament<>o.initial_tournament_id then
  select * into strict a from production_control.annual_scoring_runtime_authorities_v1 where tournament_id=target_tournament;
  if a.resource_class<>'CERTIFICATION' or a.certification_resource_id<>o.resource_id or a.authority_status<>'CLOSED'
   or a.admission_state<>'CLOSED' or a.active_closure_id is distinct from closed.closure_id
   or a.admission_generation_id<>g.generation_id or a.authority_generation_id<>g.authority_epoch_id
   or a.predecessor_closure_id is distinct from closed.prior_certification_closure_id then
   blocks:=blocks||jsonb_build_array('PREDECESSOR_SCORING_ADMISSION_NOT_CLOSED');end if;
 end if;
 if closed.resource_class<>'CERTIFICATION' or closed.status<>'CLOSED' or g.state<>'CLOSED'
  or exists(select 1 from production_control.certification_ingress_generations_v1 child
   where child.resource_id=g.resource_id and child.predecessor_generation_id=g.generation_id)
  or closed.authority<>'SUPABASE' or closed.closure_kind<>'SUPABASE_INGRESS'
  or g.tournament_id<>target_tournament or g.pointer_revision::text is distinct from c->>'pointer_revision'
  or closed.authority_generation_id<>g.authority_epoch_id or closed.lease_high_watermark is distinct from g.high_watermark
  or closed.lease_set_fingerprint is distinct from e->>'fingerprint'
  or closed.closed_admission_revision is distinct from g.revision
  or not exists(select 1 from scoring_authority.ingress_gates where tournament_id=target_tournament and state='PAUSED'
   and authority='SUPABASE' and active_epoch_id=g.authority_epoch_id)then
  blocks:=blocks||jsonb_build_array('PREDECESSOR_SCORING_ADMISSION_NOT_CLOSED');end if;
 if not(e->>'drained')::boolean or not(e->>'fingerprint_matches')::boolean then
  blocks:=blocks||jsonb_build_array('PREDECESSOR_SCORING_DRAIN_INCOMPLETE');end if;
 if not exists(select 1 from scoring_authority.matches where tournament_id=target_tournament)
  or exists(select 1 from scoring_authority.matches where tournament_id=target_tournament
   and(status<>'FINAL' or not scorecard_complete or unresolved_mutations<>0))
  or closed.supabase_match_revisions is distinct from production_control.current_match_revisions(target_tournament)then
  blocks:=blocks||jsonb_build_array('PREDECESSOR_FINAL_SCORING_FACTS_REQUIRED');end if;
 fp:=production_control.future_runtime_hash_v2(jsonb_build_object('contractVersion','certification-annual-close-v1',
  'resource_id',o.resource_id,'origin',o.initialization_fingerprint,'closure_id',closed.closure_id,
  'prior_closure_id',closed.prior_certification_closure_id,'authority_epoch_id',g.authority_epoch_id,
  'generation_id',g.generation_id,'closed_revision',closed.closed_admission_revision,'watermark',g.high_watermark,
  'lease_fingerprint',e->>'fingerprint','match_revisions',closed.supabase_match_revisions));
 return jsonb_build_object('certified',jsonb_array_length(blocks)=0,'tournamentId',target_tournament,
  'closureId',closed.closure_id,'certificationOriginResourceId',o.resource_id,
  'authorityGenerationId',g.authority_epoch_id,'admissionGenerationId',g.generation_id,'fingerprint',fp,
  'postCloseLeaseCount',e->'post_close_admissions','certificationIngress',e,'blockers',blocks);
exception when no_data_found then return jsonb_build_object('certified',false,'tournamentId',target_tournament,'fingerprint',null,
 'blockers',jsonb_build_array('PREDECESSOR_SCORING_CLOSE_CERTIFICATE_UNAVAILABLE'));
end;$$;


-- SCRATCH ONLY. Annual138 generation installation/reopen domain helpers.
-- No public gateway, no arbitrary context rebinding, no runtime grants.

-- Used only at the end of the same private annual transaction after its own
-- pointer CAS intentionally invalidates current_certification_context_v1().
-- It cannot validate a client JSON context: the exact protected entry marker,
-- originating transaction, original admission, owner identity and already-held
-- exclusive admission fence are all mandatory.
create function production_control.assert_certification_annual_cached_context_v1(ctx jsonb)
returns void language plpgsql security definer set search_path=pg_catalog as $$
declare m production_control.canonical_operation_context_v1%rowtype;
 r production_control.canonical_resource_v1%rowtype;
 a production_control.certification_admission_v1%rowtype;
 fence bigint:=production_control.scoring_admission_lock_key();
begin
 perform production_control.assert_production_service_role();
 if not exists(select 1 from pg_locks l where l.pid=pg_backend_pid() and l.locktype='advisory'
  and l.database=(select oid from pg_database where datname=current_database())
  and l.classid=((fence>>32)&4294967295)::oid and l.objid=(fence&4294967295)::oid
  and l.objsubid=1 and l.mode='ExclusiveLock' and l.granted) then
  raise exception using errcode='42501',message='CERTIFICATION_ANNUAL_EXCLUSIVE_FENCE_REQUIRED';end if;
 select * into strict m from production_control.canonical_operation_context_v1
  where backend_pid=pg_backend_pid() and transaction_id=pg_current_xact_id();
 select * into strict r from production_control.canonical_resource_v1 where singleton for share;
 select * into strict a from production_control.certification_admission_v1 where resource_id=r.resource_id for update;
 if m.phase<>'ANNUAL' or not m.mutation or m.context is distinct from ctx
  or ctx->>'resource_class' is distinct from 'CERTIFICATION' or ctx->>'phase' is distinct from 'ANNUAL'
  or r.resource_class<>'CERTIFICATION' or r.database_name<>current_database()
  or ctx->>'resource_id' is distinct from r.resource_id or ctx->>'installation_id' is distinct from r.installation_id::text
  or ctx->>'project_ref' is distinct from r.project_ref or ctx->>'project_url' is distinct from r.project_url
  or ctx->>'registration_revision' is distinct from r.registration_revision::text
  or ctx->>'manifest_digest' is distinct from r.manifest_digest or ctx->>'schema_digest' is distinct from r.schema_digest
  or ctx->>'binding_id' is distinct from a.binding_id::text or not a.enabled
  or ctx->>'authority_epoch_id' is distinct from a.authority_epoch_id::text
  or ctx->>'activation_revision' is distinct from a.activation_revision::text
  or ctx->>'admission_revision' is distinct from a.admission_revision::text
  or ctx->>'release_commit' is distinct from a.release_commit
  or ctx#>>'{authorization,role}' is distinct from 'DIRECTOR'
  or not exists(select 1 from production_control.future_global_owner_eligibility_v1() o
   where o.player_id=ctx#>>'{authorization,player_id}' and o.auth_user_id::text=ctx#>>'{authorization,auth_user_id}')
  or exists(select 1 from production_control.resource_scope) or exists(select 1 from production_control.cutover_activation_state) then
  raise exception using errcode='42501',message='CERTIFICATION_ANNUAL_CACHED_CONTEXT_REQUIRED';end if;
exception when no_data_found then raise exception using errcode='42501',message='CERTIFICATION_ANNUAL_CACHED_CONTEXT_REQUIRED';
end;$$;

-- This resource-specific epoch describes an actual canonical annual pointer
-- transition. It is neither a Production cutover nor a replacement provider.
alter table scoring_authority.authority_epochs drop constraint authority_epochs_epoch_type_check,
 add constraint authority_epochs_epoch_type_check check(epoch_type in(
  'CUTOVER','ROLLBACK','CERTIFICATION_INITIALIZATION','CERTIFICATION_ANNUAL_TRANSITION'));
create function production_control.guard_certification_annual_epoch_v1()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare m production_control.canonical_operation_context_v1%rowtype;
begin
 if new.epoch_type<>'CERTIFICATION_ANNUAL_TRANSITION' then return new;end if;
 select * into strict m from production_control.canonical_operation_context_v1
  where backend_pid=pg_backend_pid() and transaction_id=pg_current_xact_id();
 perform production_control.assert_certification_annual_cached_context_v1(m.context);
 if new.status<>'COMMITTED' or new.authority_before<>'SUPABASE' or new.authority_after<>'SUPABASE'
  or new.google_checkpoints<>'{}'::jsonb
  or not exists(select 1 from production_control.annual_scoring_transitions_v1 t
   join production_control.future_annual_runtime_generations_v1 g on g.runtime_generation_id=t.runtime_generation_id
   where t.resource_class='CERTIFICATION' and t.certification_resource_id=m.context->>'resource_id'
    and t.transition_status='COMMITTED' and t.predecessor_tournament_id=m.context->>'current_tournament_id'
    and t.authority_generation_id=new.epoch_id and t.successor_tournament_id=new.tournament_id
    and g.generation_status='ACTIVE' and g.authority_generation_id=new.epoch_id
    and new.actor_id=m.context#>>'{authorization,player_id}'
    and new.deployment_commit=m.context->>'release_commit') then
  raise exception using errcode='42501',message='CERTIFICATION_ANNUAL_EPOCH_REQUIRED';end if;
 return new;
exception when no_data_found then raise exception using errcode='42501',message='CERTIFICATION_ANNUAL_EPOCH_REQUIRED';
end;$$;
create trigger guard_certification_annual_epoch before insert or update on scoring_authority.authority_epochs
 for each row execute function production_control.guard_certification_annual_epoch_v1();

create function production_control.install_certification_annual_successor_v1(target_transition uuid,ctx jsonb)
returns void language plpgsql security definer set search_path=pg_catalog as $$
declare t production_control.annual_scoring_transitions_v1%rowtype;
 p production_control.current_tournament_pointer_v1%rowtype;
 a production_control.annual_scoring_runtime_authorities_v1%rowtype;
 f production_control.future_annual_runtime_generations_v1%rowtype;
 c production_control.scoring_admission_closures%rowtype;
 g production_control.certification_ingress_generations_v1%rowtype;
 e jsonb;fingerprint text;
begin
 perform production_control.assert_certification_annual_cached_context_v1(ctx);
 select * into strict t from production_control.annual_scoring_transitions_v1 where transition_id=target_transition for update;
 select * into strict p from production_control.current_tournament_pointer_v1 where scope_key=ctx->>'resource_id' for update;
 select * into strict a from production_control.annual_scoring_runtime_authorities_v1 where runtime_generation_id=t.runtime_generation_id for update;
 select * into strict f from production_control.future_annual_runtime_generations_v1 where runtime_generation_id=t.runtime_generation_id for update;
 select * into strict c from production_control.scoring_admission_closures where closure_id=t.predecessor_closure_id for update;
 select * into strict g from production_control.certification_ingress_generations_v1
  where resource_id=ctx->>'resource_id' and generation_id=c.admission_generation_id for update;
 e:=production_control.certification_ingress_evidence_v1(g.resource_id,g.generation_id);
 if t.resource_class<>'CERTIFICATION' or t.certification_resource_id is distinct from ctx->>'resource_id'
  or t.transition_status<>'COMMITTED' or t.predecessor_tournament_id is distinct from ctx->>'current_tournament_id'
  or t.expected_pointer_revision::text is distinct from ctx->>'pointer_revision'
  or p.tournament_id<>t.successor_tournament_id or p.pointer_revision<>t.expected_pointer_revision+1
  or f.generation_status<>'ACTIVE' or f.tournament_id<>p.tournament_id or f.pointer_revision<>p.pointer_revision
  or f.authority_generation_id<>t.authority_generation_id or f.admission_generation_id<>t.admission_generation_id
  or a.resource_class<>'CERTIFICATION' or a.certification_resource_id<>g.resource_id
  or a.authority_status<>'ACTIVE' or a.admission_state<>'OPEN'
  or a.tournament_id<>p.tournament_id or a.pointer_revision<>p.pointer_revision or a.lifecycle_revision<>p.lifecycle_revision
  or a.authority_generation_id<>f.authority_generation_id or a.admission_generation_id<>f.admission_generation_id
  or a.predecessor_closure_id<>c.closure_id or a.predecessor_boundary_fingerprint<>t.predecessor_boundary_fingerprint
  or c.resource_class<>'CERTIFICATION' or c.certification_resource_id<>g.resource_id or c.status<>'CLOSED'
  or c.tournament_id<>g.tournament_id or c.authority_generation_id<>g.authority_epoch_id
  or c.closed_admission_revision<>g.revision or c.lease_high_watermark is distinct from g.high_watermark
  or c.lease_set_fingerprint is distinct from e->>'fingerprint'
  or g.state<>'CLOSED' or g.tournament_id<>t.predecessor_tournament_id
  or g.authority_epoch_id::text is distinct from ctx->>'authority_epoch_id'
  or not(e->>'drained')::boolean or not(e->>'fingerprint_matches')::boolean
  or not exists(select 1 from participant_identity.future_tournament_identity_contexts_v1 i
   where i.tournament_id=f.tournament_id and i.status='CERTIFIED' and i.runtime_generation_id=f.runtime_generation_id
    and i.authority_generation_id=f.authority_generation_id and i.admission_generation_id=f.admission_generation_id
    and i.pointer_revision=f.pointer_revision)
  or not exists(select 1 from production_control.annual_side_game_runtime_certifications_v1 s
   where s.runtime_generation_id=f.runtime_generation_id and s.admission_generation_id=f.admission_generation_id
    and s.authority_generation_id=f.authority_generation_id and s.pointer_revision=f.pointer_revision)
  or exists(select 1 from production_control.certification_ingress_generations_v1 x
   where x.resource_id=g.resource_id and x.state in('OPEN','CLOSING')) then
  raise exception using errcode='40001',message='CERTIFICATION_ANNUAL_SUCCESSOR_INSTALL_CONFLICT';end if;
 fingerprint:=production_control.future_runtime_hash_v2(jsonb_build_object('resource_id',g.resource_id,
  'transition_id',t.transition_id,'predecessor_closure_id',c.closure_id,'predecessor_lease_fingerprint',e->>'fingerprint',
  'runtime_generation_id',f.runtime_generation_id,'authority_epoch_id',f.authority_generation_id,
  'admission_generation_id',f.admission_generation_id,'pointer',to_jsonb(p)));
 insert into scoring_authority.authority_epochs(epoch_id,tournament_id,epoch_type,status,authority_before,authority_after,
  reconciliation_fingerprint,google_checkpoints,supabase_match_revisions,deployment_commit,actor_id,reason,committed_at,boundary_mode)
 values(f.authority_generation_id,f.tournament_id,'CERTIFICATION_ANNUAL_TRANSITION','COMMITTED','SUPABASE','SUPABASE',
  fingerprint,'{}',production_control.current_match_revisions(f.tournament_id),ctx->>'release_commit',
  ctx#>>'{authorization,player_id}','Canonical Certification annual transition; no external provider authority',clock_timestamp(),'CERTIFICATION_INGRESS_V1');
 insert into production_control.certification_ingress_generations_v1(resource_id,generation_id,tournament_id,
  authority_epoch_id,pointer_revision,predecessor_generation_id)
 values(g.resource_id,f.admission_generation_id,f.tournament_id,f.authority_generation_id,f.pointer_revision,g.generation_id);
 insert into scoring_authority.ingress_gates(tournament_id,state,authority,active_epoch_id,unresolved_client_queues,
  updated_by,admission_generation_id,admission_state,admission_revision,boundary_mode)
 values(f.tournament_id,'OPEN','SUPABASE',f.authority_generation_id,0,ctx#>>'{authorization,player_id}',
  f.admission_generation_id,'OPEN',1,'CERTIFICATION_INGRESS_V1');
 -- Legacy Production protocol fields stay false/null, as on initial
 -- Certification authority. The resource-local durable generation above owns
 -- Certification enforcement; no Production provider evidence is fabricated.
 -- No helper that revalidates the old current context may run after this final
 -- admission update. Wrapper pops its exact original marker without rebinding.
 update production_control.certification_admission_v1 set authority_epoch_id=f.authority_generation_id,
  activation_revision=activation_revision+1,admission_revision=admission_revision+1
 where resource_id=g.resource_id and authority_epoch_id=g.authority_epoch_id
  and admission_revision=(ctx->>'admission_revision')::bigint;
 if not found then raise exception using errcode='40001',message='CERTIFICATION_ANNUAL_SUCCESSOR_INSTALL_CONFLICT';end if;
 insert into production_control.operation_audit_events(event_type,domain,tournament_id,actor,result,details)
 values('CERTIFICATION_ANNUAL_GENERATION_INSTALLED','ANNUAL',f.tournament_id,ctx#>>'{authorization,player_id}','SUCCEEDED',
  jsonb_build_object('resource_id',g.resource_id,'transition_id',t.transition_id,'prior_generation_id',g.generation_id,
   'generation_id',f.admission_generation_id,'authority_epoch_id',f.authority_generation_id,
   'pointer_revision',f.pointer_revision,'source_fingerprint',fingerprint));
exception when no_data_found then raise exception using errcode='40001',message='CERTIFICATION_ANNUAL_SUCCESSOR_INSTALL_CONFLICT';
end;$$;

create function production_control.assert_certification_annual_abort_drain_v1(target_closure uuid,ctx jsonb)
returns void language plpgsql security definer set search_path=pg_catalog as $$
declare c production_control.scoring_admission_closures%rowtype;
 g production_control.certification_ingress_generations_v1%rowtype;e jsonb;
begin
 perform production_control.assert_certification_annual_cached_context_v1(ctx);
 if production_control.current_certification_context_v1() is distinct from ctx then
  raise exception using errcode='40001',message='CANONICAL_RESOURCE_CONTEXT_STALE';end if;
 select * into strict c from production_control.scoring_admission_closures where closure_id=target_closure for update;
 select * into strict g from production_control.certification_ingress_generations_v1
  where resource_id=ctx->>'resource_id' and generation_id=c.admission_generation_id for update;
 if c.resource_class<>'CERTIFICATION' or c.certification_resource_id<>g.resource_id
  or c.tournament_id is distinct from ctx->>'current_tournament_id' or c.tournament_id<>g.tournament_id
  or c.authority_generation_id<>g.authority_epoch_id or c.status not in('CLOSING','CLOSED')
  or g.state not in('CLOSING','CLOSED') or c.lease_high_watermark is distinct from g.high_watermark
  or c.closing_admission_revision<>g.revision or g.pointer_revision::text is distinct from ctx->>'pointer_revision' then
  raise exception using errcode='40001',message='CERTIFICATION_ANNUAL_ABORT_NOT_SAFE';end if;
 e:=production_control.close_certification_ingress_generation_v1(g.resource_id,g.generation_id,g.revision);
 if e->>'state'<>'CLOSED' or not(e->>'drained')::boolean or not(e->>'fingerprint_matches')::boolean then
  raise exception using errcode='55000',message='CERTIFICATION_ANNUAL_ABORT_DRAIN_REQUIRED';end if;
 -- The immutable generation contains actual evidence. The outer abort may
 -- reopen the tournament only by installing a different generation identifier.
exception when no_data_found then raise exception using errcode='40001',message='CERTIFICATION_ANNUAL_ABORT_NOT_SAFE';
end;$$;

create function production_control.rebind_certification_annual_abort_v1(target_closure uuid,input jsonb,nextgen uuid,ctx jsonb)
returns void language plpgsql security definer set search_path=pg_catalog as $$
declare c production_control.scoring_admission_closures%rowtype;
 g production_control.certification_ingress_generations_v1%rowtype;
 a production_control.annual_scoring_runtime_authorities_v1%rowtype;
 f production_control.future_annual_runtime_generations_v1%rowtype;
begin
 perform production_control.assert_certification_annual_abort_drain_v1(target_closure,ctx);
 select * into strict c from production_control.scoring_admission_closures where closure_id=target_closure for update;
 select * into strict g from production_control.certification_ingress_generations_v1
  where resource_id=ctx->>'resource_id' and generation_id=c.admission_generation_id for update;
 if nextgen is null or nextgen in(g.generation_id,g.authority_epoch_id)
  or input->>'expected_certification_admission_generation_id' is distinct from g.generation_id::text
  or input->>'expected_certification_admission_revision' is distinct from g.revision::text
  or exists(select 1 from production_control.certification_ingress_generations_v1 where generation_id=nextgen) then
  raise exception using errcode='40001',message='CERTIFICATION_ANNUAL_ABORT_NOT_SAFE';end if;
 if c.tournament_id<>'2026' then
  select * into strict a from production_control.annual_scoring_runtime_authorities_v1 where tournament_id=c.tournament_id for update;
  select * into strict f from production_control.future_annual_runtime_generations_v1 where runtime_generation_id=a.runtime_generation_id for update;
  if a.resource_class<>'CERTIFICATION' or a.certification_resource_id<>g.resource_id
   or a.active_closure_id is distinct from c.closure_id or a.authority_status not in('ACTIVE','CLOSED')
   or a.admission_state not in('CLOSING','CLOSED') or a.admission_generation_id<>g.generation_id
   or a.authority_generation_id<>g.authority_epoch_id or f.generation_status<>'ACTIVE'
   or f.admission_generation_id<>g.generation_id or f.authority_generation_id<>g.authority_epoch_id
   or input->>'expected_predecessor_runtime_generation_id' is distinct from f.runtime_generation_id::text
   or input->>'expected_predecessor_annual_authority_generation_id' is distinct from a.authority_generation_id::text
   or input->>'expected_predecessor_annual_admission_generation_id' is distinct from a.admission_generation_id::text
   or input->>'expected_predecessor_annual_admission_revision' is distinct from a.admission_revision::text then
   raise exception using errcode='40001',message='CERTIFICATION_ANNUAL_ABORT_NOT_SAFE';end if;
  update production_control.future_annual_runtime_generations_v1 set admission_generation_id=nextgen,
   runtime_revision=runtime_revision+1,updated_at=clock_timestamp() where runtime_generation_id=f.runtime_generation_id;
  perform production_control.rebind_future_participant_identity_admission_generation_v1(c.tournament_id,f.runtime_generation_id,
   f.authority_generation_id,g.generation_id,nextgen,g.pointer_revision);
  update production_control.annual_scoring_runtime_authorities_v1 set authority_status='ACTIVE',admission_state='OPEN',
   admission_generation_id=nextgen,admission_revision=admission_revision+1,active_closure_id=null,closed_at=null,
   updated_at=clock_timestamp() where runtime_generation_id=a.runtime_generation_id;
  perform production_control.rebind_annual_side_game_admission_generation_v1(c.tournament_id,f.runtime_generation_id,
   f.authority_generation_id,g.generation_id,nextgen,g.pointer_revision);
 end if;
 update production_control.scoring_admission_closures set status='REOPENED',reopened_at=clock_timestamp()
  where closure_id=c.closure_id;
 -- Certification admission, gate and pointer remain unchanged until the outer
 -- canonical abort has also marked its abandoned successor ABORTED/CONFIGURING.
end;$$;

create function production_control.install_certification_annual_reopened_generation_v1(target_closure uuid,nextgen uuid,ctx jsonb)
returns void language plpgsql security definer set search_path=pg_catalog as $$
declare c production_control.scoring_admission_closures%rowtype;
 g production_control.certification_ingress_generations_v1%rowtype;
 p production_control.current_tournament_pointer_v1%rowtype;e jsonb;
begin
 perform production_control.assert_certification_annual_cached_context_v1(ctx);
 if production_control.current_certification_context_v1() is distinct from ctx then
  raise exception using errcode='40001',message='CANONICAL_RESOURCE_CONTEXT_STALE';end if;
 select * into strict c from production_control.scoring_admission_closures where closure_id=target_closure for update;
 select * into strict g from production_control.certification_ingress_generations_v1
  where resource_id=ctx->>'resource_id' and generation_id=c.admission_generation_id for update;
 select * into strict p from production_control.current_tournament_pointer_v1 where scope_key=g.resource_id for update;
 e:=production_control.certification_ingress_evidence_v1(g.resource_id,g.generation_id);
 if c.resource_class<>'CERTIFICATION' or c.certification_resource_id<>g.resource_id or c.status<>'REOPENED'
  or c.tournament_id<>p.tournament_id or g.tournament_id<>p.tournament_id or g.pointer_revision<>p.pointer_revision
  or g.authority_epoch_id::text is distinct from ctx->>'authority_epoch_id' or g.state<>'CLOSED'
  or nextgen is null or nextgen in(g.generation_id,g.authority_epoch_id)
  or not(e->>'drained')::boolean or not(e->>'fingerprint_matches')::boolean
  or not exists(select 1 from production_control.annual_scoring_transitions_v1 t
   join production_control.future_annual_runtime_generations_v1 f on f.runtime_generation_id=t.runtime_generation_id
   join production_control.future_tournament_catalog_v1 catalog on catalog.tournament_id=t.successor_tournament_id
   where t.resource_class='CERTIFICATION' and t.certification_resource_id=g.resource_id and t.predecessor_closure_id=c.closure_id
    and t.transition_status='ABORTED' and t.predecessor_tournament_id=p.tournament_id
    and t.expected_pointer_revision=p.pointer_revision and f.generation_status='ABORTED' and catalog.lifecycle='CONFIGURING') then
  raise exception using errcode='40001',message='CERTIFICATION_ANNUAL_ABORT_NOT_SAFE';end if;
 if p.tournament_id<>'2026' and not exists(
  select 1 from production_control.annual_scoring_runtime_authorities_v1 a
  join production_control.future_annual_runtime_generations_v1 f using(runtime_generation_id)
  join participant_identity.future_tournament_identity_contexts_v1 i using(runtime_generation_id)
  join production_control.annual_side_game_runtime_certifications_v1 s using(runtime_generation_id)
  where a.tournament_id=p.tournament_id and a.resource_class='CERTIFICATION' and a.certification_resource_id=g.resource_id
   and a.authority_status='ACTIVE' and a.admission_state='OPEN' and a.admission_generation_id=nextgen
   and a.authority_generation_id=g.authority_epoch_id and a.pointer_revision=p.pointer_revision
   and f.generation_status='ACTIVE' and f.admission_generation_id=nextgen
   and i.status='CERTIFIED' and i.admission_generation_id=nextgen and s.admission_generation_id=nextgen
   and i.pointer_revision=p.pointer_revision and s.pointer_revision=p.pointer_revision) then
  raise exception using errcode='40001',message='CERTIFICATION_ANNUAL_ABORT_REBIND_REQUIRED';end if;
 insert into production_control.certification_ingress_generations_v1(resource_id,generation_id,tournament_id,
  authority_epoch_id,pointer_revision,predecessor_generation_id)
 values(g.resource_id,nextgen,g.tournament_id,g.authority_epoch_id,g.pointer_revision,g.generation_id);
 update scoring_authority.ingress_gates set state='OPEN',admission_state='OPEN',admission_generation_id=nextgen,
  admission_revision=admission_revision+1,active_closure_id=null,updated_by=ctx#>>'{authorization,player_id}',updated_at=clock_timestamp()
 where tournament_id=p.tournament_id and authority='SUPABASE' and active_epoch_id=g.authority_epoch_id and state='PAUSED';
 if not found then raise exception using errcode='40001',message='CERTIFICATION_ANNUAL_ABORT_NOT_SAFE';end if;
 update production_control.certification_admission_v1 set admission_revision=admission_revision+1
 where resource_id=g.resource_id and authority_epoch_id=g.authority_epoch_id
  and admission_revision=(ctx->>'admission_revision')::bigint;
 if not found then raise exception using errcode='40001',message='CERTIFICATION_ANNUAL_ABORT_NOT_SAFE';end if;
 insert into production_control.operation_audit_events(event_type,domain,tournament_id,actor,result,details)
 values('CERTIFICATION_ANNUAL_ADMISSION_REOPENED','ANNUAL',g.tournament_id,ctx#>>'{authorization,player_id}','SUCCEEDED',
  jsonb_build_object('resource_id',g.resource_id,'closure_id',c.closure_id,'closed_generation_id',g.generation_id,
   'new_generation_id',nextgen,'authority_epoch_id',g.authority_epoch_id,'pointer_revision',g.pointer_revision,
   'closed_fingerprint',e->>'fingerprint','old_generation_reopened',false));
end;$$;

revoke all on function production_control.assert_certification_annual_cached_context_v1(jsonb),
 production_control.guard_certification_annual_epoch_v1(),
 production_control.install_certification_annual_successor_v1(uuid,jsonb),
 production_control.assert_certification_annual_abort_drain_v1(uuid,jsonb),
 production_control.rebind_certification_annual_abort_v1(uuid,jsonb,uuid,jsonb),
 production_control.install_certification_annual_reopened_generation_v1(uuid,uuid,jsonb)
 from public,anon,authenticated,service_role;

do $generation_private_acl$
declare item record;
begin
 for item in select p.* from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='production_control' and p.proname in(
   'assert_certification_annual_cached_context_v1','guard_certification_annual_epoch_v1',
   'install_certification_annual_successor_v1','assert_certification_annual_abort_drain_v1',
   'rebind_certification_annual_abort_v1','install_certification_annual_reopened_generation_v1') loop
  if item.proowner<>(select oid from pg_roles where rolname=current_user) or not item.prosecdef
   or item.proconfig is distinct from array['search_path=pg_catalog']::text[]
   or exists(select 1 from aclexplode(coalesce(item.proacl,acldefault('f',item.proowner)))a
    where a.grantee<>item.proowner and a.privilege_type='EXECUTE') then
   raise exception 'CERTIFICATION_ANNUAL_GENERATION_PRIVILEGE_MISMATCH: %',item.oid::regprocedure;end if;
 end loop;
end;$generation_private_acl$;


-- Class-conditioned provenance, not a new authority source. Runtime roles have
-- no table writes; guards additionally prevent wrong-class privileged imports.
create function production_control.guard_canonical_annual_row_v1()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare physical production_control.canonical_resource_v1%rowtype;
 origin production_control.certification_initialization_origins_v1%rowtype;
 prior production_control.scoring_admission_closures%rowtype;
 gen production_control.certification_ingress_generations_v1%rowtype;
 row_value jsonb:=to_jsonb(new);old_value jsonb;
begin
 select * into strict physical from production_control.canonical_resource_v1 where singleton;
 if physical.database_name<>current_database()then
  raise exception using errcode='42501',message='CANONICAL_RESOURCE_BINDING_DENIED';end if;
 if tg_op='UPDATE'then
  old_value:=to_jsonb(old);
  if row_value->>'resource_class' is distinct from old_value->>'resource_class'
   or row_value->>'certification_resource_id' is distinct from old_value->>'certification_resource_id'then
   raise exception using errcode='55000',message='CERTIFICATION_ANNUAL_PROVENANCE_IMMUTABLE';end if;
 end if;
 if physical.resource_class='PRODUCTION' then
  if row_value->>'resource_class' is distinct from 'PRODUCTION' or row_value->>'certification_resource_id' is not null then
   raise exception using errcode='42501',message='CERTIFICATION_ANNUAL_CROSS_CLASS_DENIED';end if;
  return new;
 end if;
 if row_value->>'resource_class' is distinct from 'CERTIFICATION'
  or row_value->>'certification_resource_id' is distinct from physical.resource_id then
  raise exception using errcode='42501',message='CERTIFICATION_ANNUAL_CROSS_CLASS_DENIED';end if;
 select * into strict origin from production_control.certification_initialization_origins_v1 where resource_id=physical.resource_id;
 if origin.installation_id<>physical.installation_id or origin.database_name<>physical.database_name then
  raise exception using errcode='42501',message='CERTIFICATION_ANNUAL_ORIGIN_REQUIRED';end if;
 if tg_table_name='scoring_admission_closures' then
  if tg_op='UPDATE' and
   (row_value->'closure_id' is distinct from old_value->'closure_id'
    or row_value->'admission_generation_id' is distinct from old_value->'admission_generation_id'
    or row_value->'authority_generation_id' is distinct from old_value->'authority_generation_id'
    or row_value->'tournament_id' is distinct from old_value->'tournament_id'
    or row_value->'prior_certification_closure_id' is distinct from old_value->'prior_certification_closure_id')then
   raise exception using errcode='55000',message='CERTIFICATION_ANNUAL_PROVENANCE_IMMUTABLE';end if;
  select * into strict gen from production_control.certification_ingress_generations_v1
   where resource_id=physical.resource_id and generation_id=new.admission_generation_id;
  if gen.authority_epoch_id<>new.authority_generation_id or gen.tournament_id<>new.tournament_id
   or gen.state not in('CLOSING','CLOSED') or gen.high_watermark is distinct from new.lease_high_watermark then
   raise exception using errcode='42501',message='CERTIFICATION_ANNUAL_LINEAGE_REQUIRED';end if;
  if new.prior_certification_closure_id is not null then
   select * into strict prior from production_control.scoring_admission_closures where closure_id=new.prior_certification_closure_id;
   if prior.resource_class<>'CERTIFICATION' or prior.certification_resource_id<>physical.resource_id
    or prior.status not in('CLOSED','CONSUMED','REOPENED')
    or gen.predecessor_generation_id is distinct from prior.admission_generation_id then
    raise exception using errcode='42501',message='CERTIFICATION_ANNUAL_LINEAGE_REQUIRED';end if;
  elsif new.tournament_id<>origin.initial_tournament_id or gen.predecessor_generation_id is not null then
   raise exception using errcode='42501',message='CERTIFICATION_ANNUAL_LINEAGE_REQUIRED';end if;
 elsif tg_table_name='annual_scoring_runtime_authorities_v1' then
  select * into strict prior from production_control.scoring_admission_closures where closure_id=new.predecessor_closure_id;
  if prior.resource_class<>'CERTIFICATION' or prior.certification_resource_id<>physical.resource_id
   or prior.status not in('CLOSED','CONSUMED') or prior.tournament_id<>new.predecessor_tournament_id
   or new.platform_authority_generation_id<>origin.authority_epoch_id
   or new.platform_admission_generation_id<>origin.admission_generation_id then
   raise exception using errcode='42501',message='CERTIFICATION_ANNUAL_LINEAGE_REQUIRED';end if;
 elsif tg_table_name='annual_scoring_transitions_v1' and new.predecessor_closure_id is not null then
  select * into strict prior from production_control.scoring_admission_closures where closure_id=new.predecessor_closure_id;
  if prior.resource_class<>'CERTIFICATION' or prior.certification_resource_id<>physical.resource_id
   or prior.tournament_id<>new.predecessor_tournament_id then
   raise exception using errcode='42501',message='CERTIFICATION_ANNUAL_LINEAGE_REQUIRED';end if;
 end if;
 return new;
exception when no_data_found then raise exception using errcode='42501',message='CERTIFICATION_ANNUAL_LINEAGE_REQUIRED';
end;$$;
create trigger guard_canonical_annual_closure_v1 before insert or update on production_control.scoring_admission_closures
 for each row execute function production_control.guard_canonical_annual_row_v1();
create trigger guard_canonical_annual_authority_v1 before insert or update on production_control.annual_scoring_runtime_authorities_v1
 for each row execute function production_control.guard_canonical_annual_row_v1();
create trigger guard_canonical_annual_transition_v1 before insert or update on production_control.annual_scoring_transitions_v1
 for each row execute function production_control.guard_canonical_annual_row_v1();

create function production_control.guard_canonical_annual_receipt_v1()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare r production_control.canonical_resource_v1%rowtype;m production_control.canonical_operation_context_v1%rowtype;
begin
 select * into strict r from production_control.canonical_resource_v1 where singleton;
 if r.database_name<>current_database()then raise exception using errcode='42501',message='CANONICAL_RESOURCE_BINDING_DENIED';end if;
 if r.resource_class='PRODUCTION'then
  if new.certification_resource_id is not null then raise exception using errcode='42501',message='CERTIFICATION_ANNUAL_CROSS_CLASS_DENIED';end if;
  return new;
 end if;
 -- A completed activation intentionally changed current context. The private
 -- wrapper's still-held marker is exact PID/xid provenance, not re-admission.
 select * into strict m from production_control.canonical_operation_context_v1
 where backend_pid=pg_backend_pid() and transaction_id=pg_current_xact_id();
 if not m.mutation or m.phase<>'ANNUAL' or m.context->>'resource_id' is distinct from r.resource_id
  or m.context->>'installation_id' is distinct from r.installation_id::text
  or new.certification_resource_id is distinct from r.resource_id
  or new.operation_request_id::text is distinct from m.context->>'operation_request_id'
  or new.certification_actor_player_id is distinct from m.context#>>'{authorization,player_id}'
  or new.certification_actor_auth_user_id::text is distinct from m.context#>>'{authorization,auth_user_id}'then
  raise exception using errcode='42501',message='CERTIFICATION_ANNUAL_RECEIPT_ORIGIN_REQUIRED';end if;
 return new;
exception when no_data_found then raise exception using errcode='42501',message='CERTIFICATION_ANNUAL_RECEIPT_ORIGIN_REQUIRED';
end;$$;
create trigger guard_canonical_annual_receipt_v1 before insert on production_control.annual_scoring_transition_receipts_v1
 for each row execute function production_control.guard_canonical_annual_receipt_v1();


-- SCRATCH ONLY: candidate138 annual identity and side-game resource seams.
-- No BEGIN/COMMIT: parent assembles after review. No hosted execution.

CREATE OR REPLACE FUNCTION production_control.future_participant_identity_eligibility_core_v1(target_tournament_id text, target_resource_id text, target_provenance_id text)
 RETURNS TABLE(player_id text, auth_user_id uuid, link_revision bigint, source_configuration_revision bigint, source_email text, source_email_normalized text, source_updated_at timestamp with time zone, source_contact_fingerprint text, contact_approved boolean, linked_verified boolean, runtime_eligible boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
  with resource as (
    select target_provenance_id as google_workbook_id
  ), source_context as (
    select value.context_revision, value.configuration_fingerprint
    from participant_identity.identity_context_revisions value
    where value.tournament_id = '2026'
      and value.configuration_fingerprint ~ '^[0-9a-f]{64}$'
  ), approved_run as (
    select value.source_system, value.source_workbook_id
    from participant_identity.identity_config_import_runs value
    cross join source_context
    cross join resource
    where value.tournament_id = '2026'
      and value.configuration_revision = source_context.context_revision
      and value.source_fingerprint = source_context.configuration_fingerprint
      and value.source_workbook_id = resource.google_workbook_id
      and value.status = 'APPROVED'
      and value.approved_at is not null
    order by value.approved_at desc, value.requested_at desc
    limit 1
  ), active_roster as (
    select membership.player_id
    from scoring_authority.tournament_players membership
    where membership.tournament_id = pg_catalog.btrim(target_tournament_id)
      and membership.participation_status = 'ACTIVE'
  ), approved_contacts as (
    select roster.player_id, contact.configuration_revision,
      contact.email, contact.email_normalized, contact.updated_at,
      encode(extensions.digest(pg_catalog.concat_ws('|',
        contact.player_id, contact.email_normalized,
        contact.configuration_revision::text)::text, 'sha256'), 'hex')
        as contact_fingerprint
    from active_roster roster
    join participant_identity.participant_identity_contacts contact
      on contact.tournament_id = '2026'
     and contact.player_id = roster.player_id
     and contact.identity_active
    join source_context
      on source_context.context_revision = contact.configuration_revision
    join approved_run
      on approved_run.source_workbook_id = contact.source_workbook_id
     and approved_run.source_system = contact.source_system
    where contact.player_id = pg_catalog.upper(pg_catalog.btrim(
        contact.player_id
      ))
      and contact.player_id ~ '^[A-Z0-9][A-Z0-9_-]{1,31}$'
      and contact.email_normalized = pg_catalog.lower(pg_catalog.btrim(
        contact.email
      ))
      and contact.email_normalized ~* (
        '^[A-Z0-9.!#$%&''*+/=?^_`{|}~-]+@'
        || '[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?'
        || '(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$'
      )::pg_catalog.text collate "C"
      and pg_catalog.split_part(contact.email_normalized, '@', 2)
        !~* '(^|\.)(example\.(com|net|org)|invalid|test|localhost)$'
  ), link_candidates as (
    select contact.player_id, link.auth_user_id, link.link_revision,
      pg_catalog.count(*) over (partition by contact.player_id)
        as candidate_count
    from approved_contacts contact
    join participant_identity.user_player_links link
      on link.player_id = contact.player_id
     and link.status = 'ACTIVE'
     and link.revoked_at is null
     and link.email_identity_hash = encode(extensions.digest(
       contact.email_normalized::text, 'sha256'), 'hex')
    join participant_identity.participant_auth_identifiers identifier
      on identifier.player_id = link.player_id
     and identifier.auth_user_id = link.auth_user_id
     and identifier.identifier_type = 'EMAIL'
     and identifier.status = 'VERIFIED'
     and identifier.revoked_at is null
     and identifier.normalized_value_private = contact.email_normalized
    join auth.users auth_user
      on auth_user.id = link.auth_user_id
     and auth_user.email_confirmed_at is not null
     and pg_catalog.lower(pg_catalog.btrim(coalesce(auth_user.email, '')))
       = contact.email_normalized
  ), pointer as (
    select value.*
    from production_control.current_tournament_pointer_v1 value
    where value.scope_key = target_resource_id
  ), catalog as (
    select value.*
    from production_control.future_tournament_catalog_v1 value
    where value.tournament_id = pg_catalog.btrim(target_tournament_id)
  ), generation as (
    select value.*
    from production_control.future_annual_runtime_generations_v1 value
    where value.tournament_id = pg_catalog.btrim(target_tournament_id)
      and value.generation_status = 'ACTIVE'
  )
  select roster.player_id,
    link.auth_user_id, link.link_revision,
    contact.configuration_revision, contact.email,
    contact.email_normalized, contact.updated_at,
    contact.contact_fingerprint,
    contact.player_id is not null as contact_approved,
    link.player_id is not null as linked_verified,
    coalesce(link.player_id is not null
      and pointer.tournament_id = pg_catalog.btrim(target_tournament_id)
      and pointer.tournament_year > 2026
      and catalog.lifecycle = 'ACTIVE'
      and catalog.lifecycle_revision = pointer.lifecycle_revision
      and generation.pointer_revision = pointer.pointer_revision
      and generation.authority = 'SUPABASE'
      and generation.ingress_state = 'OPEN'
      and context.status = 'CERTIFIED'
      and context.runtime_generation_id = generation.runtime_generation_id
      and context.authority_generation_id = generation.authority_generation_id
      and context.admission_generation_id = generation.admission_generation_id
      and context.pointer_revision = generation.pointer_revision
      and binding.enrollment_state = 'ENROLLED'
      and binding.contact_state = 'APPROVED'
      and binding.binding_revision = context.binding_revision
      and binding.bound_link_revision = link.link_revision
      and binding.source_configuration_revision =
        contact.configuration_revision
      and binding.source_contact_fingerprint =
        contact.contact_fingerprint
      and future_contact.identity_active
      and future_contact.email_normalized = contact.email_normalized
      and participant_role.role_active
      and participant_role.revoked_at is null, false) as runtime_eligible
  from active_roster roster
  left join approved_contacts contact
    on contact.player_id = roster.player_id
  left join link_candidates link
    on link.player_id = roster.player_id
   and link.candidate_count = 1
  cross join pointer
  left join catalog on true
  left join generation on true
  left join participant_identity.future_tournament_identity_contexts_v1 context
    on context.tournament_id = pg_catalog.btrim(target_tournament_id)
  left join participant_identity.future_tournament_participant_bindings_v1 binding
    on binding.tournament_id = pg_catalog.btrim(target_tournament_id)
   and binding.player_id = roster.player_id
  left join participant_identity.participant_identity_contacts future_contact
    on future_contact.tournament_id = pg_catalog.btrim(target_tournament_id)
   and future_contact.player_id = roster.player_id
  left join participant_identity.tournament_roles participant_role
    on participant_role.tournament_id = pg_catalog.btrim(target_tournament_id)
   and participant_role.auth_user_id = link.auth_user_id
   and participant_role.role = 'PARTICIPANT'
  order by roster.player_id;
$function$;
revoke all on function production_control.future_participant_identity_eligibility_core_v1(text,text,text) from public,anon,authenticated,service_role;

do $gate$ begin if encode(extensions.digest((select prosrc from pg_proc where oid='production_control.future_participant_identity_eligibility_v1(text)'::regprocedure),'sha256'),'hex')<>'f5be5d41153880eee706e823653f6eae5c3f00cb496f4a1c7243cb61eecc80dd' then raise exception 'ANNUAL_DOMAIN_PREDECESSOR_MISMATCH: future_participant_identity_eligibility_v1';end if;end;$gate$;

CREATE OR REPLACE FUNCTION production_control.future_participant_identity_eligibility_v1(target_tournament_id text)
 RETURNS TABLE(player_id text, auth_user_id uuid, link_revision bigint, source_configuration_revision bigint, source_email text, source_email_normalized text, source_updated_at timestamp with time zone, source_contact_fingerprint text, contact_approved boolean, linked_verified boolean, runtime_eligible boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare resource_context jsonb; provenance text;
begin
  if exists(select 1 from production_control.canonical_resource_v1 where singleton and resource_class='CERTIFICATION') then
    resource_context:=production_control.annual_resource_context_v2();
    if resource_context->>'resource_class' is distinct from 'CERTIFICATION' then
      raise exception using errcode='42501',message='CERTIFICATION_ANNUAL_RESOURCE_REQUIRED';end if;
    return query select * from production_control.future_participant_identity_eligibility_core_v1(
      target_tournament_id,resource_context->>'resource_id',resource_context->>'provenance_id');
  else
    -- Preserve missing/invalid Production source as an unapproved contact set,
    -- not a new exception. The fixed Production pointer still scopes the roster.
    select value.google_workbook_id into provenance from production_control.resource_scope value
     where value.scope_key='BAGGER_INV_PRODUCTION' and value.project_ref='ymqhhtxaywtqllynrmxe'
      and value.project_url='https://ymqhhtxaywtqllynrmxe.supabase.co';
    return query select * from production_control.future_participant_identity_eligibility_core_v1(
      target_tournament_id,'BAGGER_INV_PRODUCTION',provenance);
  end if;
end;
$function$;

do $gate$ begin if encode(extensions.digest((select prosrc from pg_proc where oid='production_control.bind_future_participant_identity_runtime_v1(text,uuid,uuid,uuid,text,uuid)'::regprocedure),'sha256'),'hex')<>'707a4d67e3cee69f7165af08b382c8b6b53388aebd41e260bf5fa59d6a5b0e12' then raise exception 'ANNUAL_DOMAIN_PREDECESSOR_MISMATCH: bind_future_participant_identity_runtime_v1';end if;end;$gate$;

CREATE OR REPLACE FUNCTION production_control.bind_future_participant_identity_runtime_v1(target_tournament_id text, target_runtime_generation_id uuid, target_authority_generation_id uuid, target_admission_generation_id uuid, target_actor_player_id text, target_actor_auth_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  resource production_control.resource_scope%rowtype;
  resource_context jsonb;
  provenance_value text;
  identity_source_system text := 'PRODUCTION_FUTURE_RUNTIME_BINDING';
  pointer production_control.current_tournament_pointer_v1%rowtype;
  catalog production_control.future_tournament_catalog_v1%rowtype;
  generation production_control.future_annual_runtime_generations_v1%rowtype;
  source_context participant_identity.identity_context_revisions%rowtype;
  source_run participant_identity.identity_config_import_runs%rowtype;
  existing participant_identity.future_tournament_identity_contexts_v1%rowtype;
  roster_count_value integer;
  contact_count_value integer;
  enrolled_count_value integer;
  not_enrolled_count_value integer;
  binding_fingerprint_value text;
  source_manifest jsonb;
begin
  perform production_control.assert_production_service_role();
  perform pg_catalog.pg_advisory_xact_lock_shared(
    production_control.scoring_admission_lock_key()
  );
  if exists(select 1 from production_control.canonical_resource_v1 where singleton and resource_class='CERTIFICATION') then
    resource_context:=production_control.annual_resource_context_v2();
    if resource_context->>'resource_class' is distinct from 'CERTIFICATION'
      or resource_context->>'provenance_id' is distinct from 'urn:bagger:synthetic:'||(resource_context->>'installation_id') then
      raise exception using errcode='42501',message='FUTURE_PARTICIPANT_IDENTITY_RESOURCE_MISMATCH';end if;
    provenance_value:=resource_context->>'provenance_id';
    identity_source_system:='CERTIFICATION_FUTURE_RUNTIME_BINDING';
    select value.* into strict pointer from production_control.current_tournament_pointer_v1 value
     where value.scope_key=resource_context->>'resource_id';
  else
    select value.* into strict resource
    from production_control.resource_scope value
    where value.scope_key = 'BAGGER_INV_PRODUCTION';
    select value.* into strict pointer
    from production_control.current_tournament_pointer_v1 value
    where value.scope_key = 'BAGGER_INV_PRODUCTION';
    provenance_value:=resource.google_workbook_id;
  end if;
  select value.* into strict catalog
  from production_control.future_tournament_catalog_v1 value
  where value.tournament_id = pg_catalog.btrim(target_tournament_id)
  for update;
  select value.* into strict generation
  from production_control.future_annual_runtime_generations_v1 value
  where value.tournament_id = catalog.tournament_id
    and value.runtime_generation_id = target_runtime_generation_id
  for update;
  if catalog.tournament_year <= 2026
     or catalog.lifecycle <> 'READY_FOR_ACTIVATION'
     or pointer.tournament_id = catalog.tournament_id
     or generation.generation_status <> 'PREPARED'
     or generation.pointer_revision <> pointer.pointer_revision + 1
     or generation.authority_generation_id
       <> target_authority_generation_id
     or generation.admission_generation_id
       <> target_admission_generation_id
     or target_runtime_generation_id in (
       target_authority_generation_id, target_admission_generation_id
     )
     or target_authority_generation_id = target_admission_generation_id
     or generation.authority <> 'SUPABASE'
     or generation.ingress_state <> 'OPEN'
     or target_actor_player_id is null
     or target_actor_auth_user_id is null then
    raise exception using errcode = '55000',
      message = 'FUTURE_PARTICIPANT_IDENTITY_BINDING_SCOPE_INVALID';
  end if;
  if resource_context is null and (resource.project_ref <> 'ymqhhtxaywtqllynrmxe'
     or resource.project_url <> 'https://ymqhhtxaywtqllynrmxe.supabase.co'
     or pg_catalog.btrim(coalesce(resource.google_workbook_id, '')) = '') then
    raise exception using errcode = '42501',
      message = 'FUTURE_PARTICIPANT_IDENTITY_RESOURCE_MISMATCH';
  end if;

  select value.* into strict source_context
  from participant_identity.identity_context_revisions value
  where value.tournament_id = '2026';
  select value.* into strict source_run
  from participant_identity.identity_config_import_runs value
  where value.tournament_id = '2026'
    and value.configuration_revision = source_context.context_revision
    and value.source_fingerprint = source_context.configuration_fingerprint
    and value.status = 'APPROVED'
    and value.approved_at is not null
  order by value.approved_at desc, value.requested_at desc
  limit 1;
  if source_context.configuration_fingerprint !~ '^[0-9a-f]{64}$'
     or source_run.source_workbook_id is distinct from
       provenance_value then
    raise exception using errcode = '55000',
      message = 'FUTURE_PARTICIPANT_IDENTITY_SOURCE_NOT_CERTIFIED';
  end if;

  select pg_catalog.count(*)::integer,
    pg_catalog.count(*) filter (
      where eligibility.contact_approved
    )::integer,
    pg_catalog.count(*) filter (
      where eligibility.linked_verified
    )::integer
  into roster_count_value, contact_count_value, enrolled_count_value
  from production_control.future_participant_identity_eligibility_v1(
    catalog.tournament_id
  ) eligibility;
  not_enrolled_count_value := roster_count_value - enrolled_count_value;
  if roster_count_value < 1 or contact_count_value < 1 then
    raise exception using errcode = '55000',
      message = 'FUTURE_PARTICIPANT_IDENTITY_APPROVED_ROSTER_REQUIRED';
  end if;
  if not exists (
    select 1
    from production_control.future_global_owner_eligibility_v1() owner_value
    where owner_value.player_id = target_actor_player_id
      and owner_value.auth_user_id = target_actor_auth_user_id
  ) then
    raise exception using errcode = '42501',
      message = 'FUTURE_PARTICIPANT_IDENTITY_OWNER_REQUIRED';
  end if;
  if not exists (
    select 1
    from production_control.future_participant_identity_eligibility_v1(
      catalog.tournament_id
    ) eligibility
    join production_control.director_entitlements entitlement
      on entitlement.tournament_id = catalog.tournament_id
     and entitlement.player_id = eligibility.player_id
     and entitlement.auth_user_id = eligibility.auth_user_id
     and entitlement.role = 'DIRECTOR'
     and entitlement.status = 'ACTIVE'
     and entitlement.revoked_at is null
    join participant_identity.tournament_roles role_value
      on role_value.tournament_id = entitlement.tournament_id
     and role_value.auth_user_id = entitlement.auth_user_id
     and role_value.role = 'DIRECTOR'
     and role_value.role_active
     and role_value.revoked_at is null
    where eligibility.linked_verified
  ) then
    raise exception using errcode = '55000',
      message = 'FUTURE_PARTICIPANT_IDENTITY_DIRECTOR_REQUIRED';
  end if;

  select coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'playerId', eligibility.player_id,
      'contactState', case when eligibility.contact_approved
        then 'APPROVED' else 'MISSING' end,
      'state', case when eligibility.linked_verified
        then 'ENROLLED' else 'NOT_ENROLLED' end,
      'sourceContactFingerprint', case when eligibility.contact_approved
        then eligibility.source_contact_fingerprint else null end,
      'linkRevision', case when eligibility.linked_verified
        then eligibility.link_revision else null end
    ) order by eligibility.player_id
  ), '[]'::jsonb)
  into source_manifest
  from production_control.future_participant_identity_eligibility_v1(
    catalog.tournament_id
  ) eligibility;
  binding_fingerprint_value := encode(extensions.digest(
    pg_catalog.convert_to(pg_catalog.jsonb_build_object(
      'contract', 'production-future-participant-identity-context-v1',
      'tournamentId', catalog.tournament_id,
      'runtimeGenerationId', target_runtime_generation_id,
      'authorityGenerationId', target_authority_generation_id,
      'admissionGenerationId', target_admission_generation_id,
      'pointerRevision', generation.pointer_revision,
      'sourceTournamentId', '2026',
      'sourceContextRevision', source_context.context_revision,
      'sourceConfigurationFingerprint',
        source_context.configuration_fingerprint,
      'roster', source_manifest
    )::text, 'UTF8'), 'sha256'), 'hex');

  select value.* into existing
  from participant_identity.future_tournament_identity_contexts_v1 value
  where value.tournament_id = catalog.tournament_id;
  if existing.tournament_id is not null then
    if existing.runtime_generation_id <> target_runtime_generation_id
       or existing.authority_generation_id
         <> target_authority_generation_id
       or existing.admission_generation_id
         <> target_admission_generation_id
       or existing.pointer_revision <> generation.pointer_revision
       or existing.binding_fingerprint <> binding_fingerprint_value
       or existing.roster_count <> roster_count_value
       or existing.enrolled_count <> enrolled_count_value
       or existing.not_enrolled_count <> not_enrolled_count_value then
      raise exception using errcode = '40001',
        message = 'FUTURE_PARTICIPANT_IDENTITY_BINDING_CONFLICT';
    end if;
    return pg_catalog.jsonb_build_object(
      'ok', true, 'tournamentId', catalog.tournament_id,
      'rosterCount', existing.roster_count,
      'approvedContactCount', contact_count_value,
      'enrolledCount', existing.enrolled_count,
      'notEnrolledCount', existing.not_enrolled_count,
      'bindingRevision', existing.binding_revision,
      'bindingFingerprint', existing.binding_fingerprint,
      'idempotent', true
    );
  end if;

  insert into participant_identity.future_tournament_identity_contexts_v1 (
    tournament_id, contract_version, binding_revision,
    source_identity_tournament_id, source_context_revision,
    source_configuration_fingerprint, binding_fingerprint,
    roster_count, enrolled_count, not_enrolled_count, status,
    certified_by_player_id, certified_by_auth_user_id,
    runtime_generation_id, authority_generation_id,
    admission_generation_id, pointer_revision
  ) values (
    catalog.tournament_id,
    'production-future-participant-identity-context-v1',
    1, '2026', source_context.context_revision,
    source_context.configuration_fingerprint, binding_fingerprint_value,
    roster_count_value, enrolled_count_value, not_enrolled_count_value,
    'CERTIFIED', target_actor_player_id, target_actor_auth_user_id,
    target_runtime_generation_id, target_authority_generation_id,
    target_admission_generation_id, generation.pointer_revision
  );

  insert into participant_identity.future_tournament_participant_bindings_v1 (
    tournament_id, player_id, enrollment_state, contact_state,
    source_identity_tournament_id, source_configuration_revision,
    source_contact_fingerprint, bound_link_revision, binding_revision
  )
  select catalog.tournament_id, eligibility.player_id,
    case when eligibility.linked_verified
      then 'ENROLLED' else 'NOT_ENROLLED' end,
    case when eligibility.contact_approved
      then 'APPROVED' else 'MISSING' end,
    case when eligibility.contact_approved then '2026' else null end,
    case when eligibility.contact_approved
      then eligibility.source_configuration_revision else null end,
    case when eligibility.contact_approved
      then eligibility.source_contact_fingerprint else null end,
    case when eligibility.linked_verified
      then eligibility.link_revision else null end,
    1
  from production_control.future_participant_identity_eligibility_v1(
    catalog.tournament_id
  ) eligibility;

  insert into participant_identity.identity_context_revisions (
    tournament_id, context_revision, configuration_fingerprint, updated_by
  ) values (
    catalog.tournament_id, 1, binding_fingerprint_value,
    'future-runtime-identity-binding-v2'
  );
  insert into participant_identity.identity_config_import_runs (
    tournament_id, source_system, source_workbook_id,
    source_fingerprint, configuration_revision, status,
    roster_count, received_count, valid_count, missing_count,
    duplicate_count, malformed_count, shared_count, inactive_count,
    unknown_player_count, mapping_conflict_count, validation_report,
    requested_by, approved_by, approved_at
  ) values (
    catalog.tournament_id, identity_source_system,
    provenance_value, binding_fingerprint_value, 1, 'APPROVED',
    roster_count_value, contact_count_value, contact_count_value,
    roster_count_value - contact_count_value, 0, 0, 0, 0, 0, 0,
    pg_catalog.jsonb_build_object(
      'contractVersion',
        'production-future-participant-identity-context-v1',
      'partialRosterPolicy', true,
      'approvedContactCount', contact_count_value,
      'linkedVerifiedCount', enrolled_count_value,
      'controlledFirstLoginEligibleCount',
        contact_count_value - enrolled_count_value,
      'rawIdentifiersStoredInReport', false
    ), 'future-runtime-identity-binding-v2', target_actor_player_id,
    pg_catalog.clock_timestamp()
  );
  insert into participant_identity.participant_identity_contacts (
    tournament_id, player_id, email, email_normalized, identity_active,
    configuration_revision, verified_by, verified_at, source_system,
    source_workbook_id, source_updated_at
  )
  select catalog.tournament_id, eligibility.player_id,
    eligibility.source_email, eligibility.source_email_normalized, true, 1,
    'future-runtime-identity-binding-v2', pg_catalog.clock_timestamp(),
    identity_source_system, provenance_value,
    eligibility.source_updated_at
  from production_control.future_participant_identity_eligibility_v1(
    catalog.tournament_id
  ) eligibility
  where eligibility.contact_approved;

  insert into participant_identity.tournament_roles (
    tournament_id, auth_user_id, role, role_active, granted_by
  )
  select catalog.tournament_id, eligibility.auth_user_id,
    'PARTICIPANT', true, 'future-runtime-identity-binding-v2'
  from production_control.future_participant_identity_eligibility_v1(
    catalog.tournament_id
  ) eligibility
  where eligibility.linked_verified
  on conflict (tournament_id, auth_user_id, role) do update set
    role_active = true, revoked_at = null, revoked_by = null,
    role_revision = participant_identity.tournament_roles.role_revision + 1,
    updated_at = pg_catalog.clock_timestamp();

  insert into participant_identity.identity_audit_events (
    event_type, tournament_id, player_id, actor_id, actor_name,
    configuration_revision, safe_metadata
  ) values (
    'FUTURE_TOURNAMENT_IDENTITY_RUNTIME_BOUND', catalog.tournament_id,
    target_actor_player_id, target_actor_player_id,
    'future-runtime-owner-activation-v2', 1,
    pg_catalog.jsonb_build_object(
      'contractVersion',
        'production-future-participant-identity-context-v1',
      'rosterCount', roster_count_value,
      'approvedContactCount', contact_count_value,
      'enrolledCount', enrolled_count_value,
      'notEnrolledCount', not_enrolled_count_value,
      'controlledFirstLoginEligibleCount',
        contact_count_value - enrolled_count_value,
      'rawIdentifiersStoredInAudit', false,
      'authUsersCreated', false,
      'ownerAddedToAnnualRoster', false,
      'futureDirectorEntitlementCloned', false
    ) || case when resource_context is null then '{}'::jsonb else pg_catalog.jsonb_build_object(
      'resourceClass','CERTIFICATION','resourceId',resource_context->>'resource_id',
      'installationId',resource_context->>'installation_id','provenanceId',provenance_value) end
  );
  return pg_catalog.jsonb_build_object(
    'ok', true, 'tournamentId', catalog.tournament_id,
    'rosterCount', roster_count_value,
    'approvedContactCount', contact_count_value,
    'enrolledCount', enrolled_count_value,
    'notEnrolledCount', not_enrolled_count_value,
    'bindingRevision', 1,
    'bindingFingerprint', binding_fingerprint_value,
    'idempotent', false
  );
end;
$function$;

do $gate$ begin if encode(extensions.digest((select prosrc from pg_proc where oid='production_control.ensure_annual_side_game_runtime_v1(text,uuid,uuid,uuid,boolean)'::regprocedure),'sha256'),'hex')<>'9fe9e56a13d5b2d49ad35b5cdff4d85b5a8bd1228308b672104be816b9e95235' then raise exception 'ANNUAL_DOMAIN_PREDECESSOR_MISMATCH: ensure_annual_side_game_runtime_v1';end if;end;$gate$;

CREATE OR REPLACE FUNCTION production_control.ensure_annual_side_game_runtime_v1(target_tournament_id text, expected_runtime_generation_id uuid, expected_authority_generation_id uuid, expected_admission_generation_id uuid, allow_binding boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  generation production_control.future_annual_runtime_generations_v1%rowtype;
  catalog production_control.future_tournament_catalog_v1%rowtype;
  resource production_control.future_tournament_resources_v1%rowtype;
  scope production_control.resource_scope%rowtype;
  resource_context jsonb;
  expected_project_ref text;
  expected_project_url text;
  promotion production_control.future_runtime_promotions_v2%rowtype;
  writer production_control.future_google_writer_targets_v2%rowtype;
  retained
    production_control.annual_side_game_runtime_certifications_v1%rowtype;
  implementation_manifest_value jsonb;
  resource_manifest_value jsonb;
  implementation_fingerprint_value text;
  resource_fingerprint_value text;
  certification_fingerprint_value text;
begin
  if target_tournament_id is null or target_tournament_id = '2026' then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ANNUAL_SIDE_GAME_RUNTIME_REQUIRED';
  end if;
  select value.* into strict generation
  from production_control.future_annual_runtime_generations_v1 value
  where value.tournament_id = target_tournament_id
    and value.runtime_generation_id = expected_runtime_generation_id;
  select value.* into strict catalog
  from production_control.future_tournament_catalog_v1 value
  where value.tournament_id = target_tournament_id;
  select value.* into strict resource
  from production_control.future_tournament_resources_v1 value
  where value.tournament_id = target_tournament_id;
  if exists(select 1 from production_control.canonical_resource_v1 where singleton and resource_class='CERTIFICATION') then
    resource_context:=production_control.annual_resource_context_v2();
    if resource_context->>'resource_class' is distinct from 'CERTIFICATION'
      or resource.source_workbook_id is distinct from resource_context->>'provenance_id' then
      raise exception using errcode='55000',message='PRODUCTION_ANNUAL_SIDE_GAME_RUNTIME_REQUIRED';end if;
    expected_project_ref:=resource_context->>'project_ref';
    expected_project_url:=resource_context->>'project_url';
  else
    select value.* into strict scope
    from production_control.resource_scope value
    where value.scope_key = 'BAGGER_INV_PRODUCTION';
    expected_project_ref:=scope.project_ref;
    expected_project_url:=scope.project_url;
  end if;
  select value.* into strict promotion
  from production_control.future_runtime_promotions_v2 value
  where value.tournament_id = target_tournament_id;
  -- Google runtime retired: external delivery is not canonical authority.

  implementation_manifest_value :=
    production_control.annual_side_game_implementation_manifest_v1();
  implementation_fingerprint_value :=
    production_control.future_runtime_hash_v2(
      implementation_manifest_value
    );
  resource_manifest_value := pg_catalog.jsonb_build_object(
    'contractVersion', 'production-annual-side-game-resource-v2-google-retired',
    'environment', case when resource_context is null then 'PRODUCTION' else 'CERTIFICATION' end,
    'projectRef', resource.project_ref,
    'projectUrl', resource.project_url,
    'sourceWorkbookId', resource.source_workbook_id,
    'tournamentId', target_tournament_id,
    'tournamentYear', catalog.tournament_year,
    'resourceRevision', resource.resource_revision,
    'promotionRevision', promotion.promotion_revision,
    'promotionFingerprint', promotion.promoted_manifest_fingerprint,
    'runtimeGenerationId', generation.runtime_generation_id,
    'pointerRevision', generation.pointer_revision,
    'authorityGenerationId', generation.authority_generation_id,
    'admissionGenerationId', generation.admission_generation_id,
    'externalGoogleDelivery', 'RETIRED'
  ) || case when resource_context is null then '{}'::jsonb else pg_catalog.jsonb_build_object(
    'resourceId',resource_context->>'resource_id','installationId',resource_context->>'installation_id',
    'schemaDigest',resource_context->>'schema_digest','manifestDigest',resource_context->>'manifest_digest') end;
  resource_fingerprint_value :=
    production_control.future_runtime_hash_v2(resource_manifest_value);
  certification_fingerprint_value :=
    production_control.future_runtime_hash_v2(
      pg_catalog.jsonb_build_object(
        'contractVersion', 'production-annual-side-game-runtime-v1',
        'resourceFingerprint', resource_fingerprint_value,
        'implementationFingerprint', implementation_fingerprint_value
      )
    );

  if generation.authority_generation_id is distinct from
       expected_authority_generation_id
     or generation.admission_generation_id is distinct from
       expected_admission_generation_id
     or resource.project_ref is distinct from expected_project_ref
     or resource.project_url is distinct from expected_project_url
     or resource.resource_status <> 'CURRENT_RESOURCE_BOUND'
     or resource.source_workbook_id is null

     or promotion.runtime_status not in ('READY', 'ACTIVE')
     or generation.generation_status not in ('PREPARED', 'ACTIVE')
     or catalog.lifecycle not in ('READY_FOR_ACTIVATION', 'ACTIVE') then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ANNUAL_SIDE_GAME_RUNTIME_REQUIRED';
  end if;

  select value.* into retained
  from production_control.annual_side_game_runtime_certifications_v1 value
  where value.runtime_generation_id = generation.runtime_generation_id
    and value.admission_generation_id = generation.admission_generation_id;
  if retained.runtime_generation_id is null then
    if not allow_binding
       or generation.generation_status not in ('PREPARED', 'ACTIVE') then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_ANNUAL_SIDE_GAME_CERTIFICATION_REQUIRED';
    end if;
    insert into production_control.annual_side_game_runtime_certifications_v1 (
      runtime_generation_id, contract_version, tournament_id,
      pointer_revision, authority_generation_id, admission_generation_id,
      project_ref, project_url, source_workbook_id, resource_revision,
      resource_fingerprint, implementation_manifest,
      implementation_fingerprint, certification_fingerprint
    ) values (
      generation.runtime_generation_id,
      'production-annual-side-game-runtime-v1', target_tournament_id,
      generation.pointer_revision, generation.authority_generation_id,
      generation.admission_generation_id, resource.project_ref,
      resource.project_url, resource.source_workbook_id,
      resource.resource_revision, resource_fingerprint_value,
      implementation_manifest_value, implementation_fingerprint_value,
      certification_fingerprint_value
    ) returning * into retained;
  end if;

  if retained.contract_version <> 'production-annual-side-game-runtime-v1'
     or retained.tournament_id <> target_tournament_id
     or retained.pointer_revision <> generation.pointer_revision
     or retained.authority_generation_id is distinct from
       generation.authority_generation_id
     or retained.admission_generation_id is distinct from
       generation.admission_generation_id
     or retained.project_ref is distinct from resource.project_ref
     or retained.project_url is distinct from resource.project_url
     or retained.source_workbook_id is distinct from
       resource.source_workbook_id
     or retained.resource_revision <> resource.resource_revision
     or retained.resource_fingerprint is distinct from
       resource_fingerprint_value
     or retained.implementation_manifest is distinct from
       implementation_manifest_value
     or retained.implementation_fingerprint is distinct from
       implementation_fingerprint_value
     or retained.certification_fingerprint is distinct from
       certification_fingerprint_value then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ANNUAL_SIDE_GAME_CERTIFICATION_REQUIRED';
  end if;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'contractVersion', retained.contract_version,
    'tournamentId', retained.tournament_id,
    'runtimeGenerationId', retained.runtime_generation_id,
    'resourceFingerprint', retained.resource_fingerprint,
    'implementationFingerprint', retained.implementation_fingerprint,
    'certificationFingerprint', retained.certification_fingerprint
  );
exception
  when no_data_found or invalid_text_representation
    or numeric_value_out_of_range then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ANNUAL_SIDE_GAME_RUNTIME_REQUIRED';
end;
$function$;

do $gate$ begin if encode(extensions.digest((select prosrc from pg_proc where oid='production_control.rebind_future_participant_identity_admission_generation_v1(text,uuid,uuid,uuid,uuid,bigint)'::regprocedure),'sha256'),'hex')<>'8dbb65d16a962a32a8f009d2b58def0021ef9fe6eb521093c07c9f62fb9ae161' then raise exception 'ANNUAL_DOMAIN_PREDECESSOR_MISMATCH: rebind_future_participant_identity_admission_generation_v1';end if;end;$gate$;

CREATE OR REPLACE FUNCTION production_control.rebind_future_participant_identity_admission_generation_v1(target_tournament_id text, expected_runtime_generation_id uuid, expected_authority_generation_id uuid, expected_old_admission_generation_id uuid, target_new_admission_generation_id uuid, expected_pointer_revision bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  pointer production_control.current_tournament_pointer_v1%rowtype;
  generation production_control.future_annual_runtime_generations_v1%rowtype;
  context participant_identity.future_tournament_identity_contexts_v1%rowtype;
  next_fingerprint text;
begin
  perform production_control.assert_production_service_role();
  perform pg_catalog.pg_advisory_xact_lock(
    production_control.scoring_admission_lock_key()
  );
  select value.* into strict pointer
  from production_control.current_tournament_pointer_v1 value
  where value.scope_key = case when exists(select 1 from production_control.canonical_resource_v1 where singleton and resource_class='CERTIFICATION')
    then production_control.annual_resource_context_v2()->>'resource_id' else 'BAGGER_INV_PRODUCTION' end;
  select value.* into strict generation
  from production_control.future_annual_runtime_generations_v1 value
  where value.tournament_id = pointer.tournament_id
    and value.generation_status = 'ACTIVE'
  for update;
  select value.* into strict context
  from participant_identity.future_tournament_identity_contexts_v1 value
  where value.tournament_id = pointer.tournament_id
    and value.status = 'CERTIFIED'
  for update;
  if pointer.tournament_year <= 2026
     or pointer.tournament_id <> pg_catalog.btrim(target_tournament_id)
     or pointer.pointer_revision <> expected_pointer_revision
     or generation.pointer_revision <> pointer.pointer_revision
     or generation.runtime_generation_id
       <> expected_runtime_generation_id
     or generation.authority_generation_id
       <> expected_authority_generation_id
     or generation.admission_generation_id
       <> target_new_admission_generation_id
     or target_new_admission_generation_id in (
       expected_runtime_generation_id, expected_authority_generation_id
     )
     or context.runtime_generation_id
       <> expected_runtime_generation_id
     or context.authority_generation_id
       <> expected_authority_generation_id
     or context.admission_generation_id
       <> expected_old_admission_generation_id
     or context.pointer_revision <> expected_pointer_revision then
    raise exception using errcode = '40001',
      message = 'FUTURE_PARTICIPANT_IDENTITY_ADMISSION_REBIND_STALE';
  end if;
  update participant_identity.future_tournament_identity_contexts_v1 set
    admission_generation_id = target_new_admission_generation_id,
    updated_at = pg_catalog.clock_timestamp()
  where tournament_id = pointer.tournament_id;
  next_fingerprint := production_control
    .future_participant_identity_binding_fingerprint_v1(
      pointer.tournament_id
    );
  update participant_identity.future_tournament_identity_contexts_v1 set
    binding_fingerprint = next_fingerprint,
    updated_at = pg_catalog.clock_timestamp()
  where tournament_id = pointer.tournament_id;
  insert into participant_identity.identity_audit_events (
    event_type, tournament_id, actor_name, safe_metadata
  ) values (
    'FUTURE_TOURNAMENT_IDENTITY_ADMISSION_REBOUND',
    pointer.tournament_id, 'future-runtime-admission-abort-v1',
    pg_catalog.jsonb_build_object(
      'pointerRevision', pointer.pointer_revision,
      'runtimeGenerationId', expected_runtime_generation_id,
      'authorityGenerationId', expected_authority_generation_id,
      'oldAdmissionGenerationId', expected_old_admission_generation_id,
      'newAdmissionGenerationId', target_new_admission_generation_id,
      'authUsersCreated', false,
      'rolesChanged', false
    )
  );
  return pg_catalog.jsonb_build_object(
    'ok', true,
    'tournamentId', pointer.tournament_id,
    'pointerRevision', pointer.pointer_revision,
    'admissionGenerationId', target_new_admission_generation_id,
    'bindingFingerprint', next_fingerprint
  );
end;
$function$;

do $gate$ begin if encode(extensions.digest((select prosrc from pg_proc where oid='production_control.rebind_annual_side_game_admission_generation_v1(text,uuid,uuid,uuid,uuid,bigint)'::regprocedure),'sha256'),'hex')<>'a6c7e41c03fc5ca6ff7dfe2525900b4e5be196ca3b1f27f747617a01ddaaed65' then raise exception 'ANNUAL_DOMAIN_PREDECESSOR_MISMATCH: rebind_annual_side_game_admission_generation_v1';end if;end;$gate$;

CREATE OR REPLACE FUNCTION production_control.rebind_annual_side_game_admission_generation_v1(target_tournament_id text, target_runtime_generation_id uuid, target_authority_generation_id uuid, prior_admission_generation_id uuid, target_admission_generation_id uuid, target_pointer_revision bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  pointer production_control.current_tournament_pointer_v1%rowtype;
  generation production_control.future_annual_runtime_generations_v1%rowtype;
  annual production_control.annual_scoring_runtime_authorities_v1%rowtype;
  identity_context
    participant_identity.future_tournament_identity_contexts_v1%rowtype;
  prior_certification
    production_control.annual_side_game_runtime_certifications_v1%rowtype;
  rebound jsonb;
begin
  perform production_control.assert_production_service_role();
  select value.* into strict pointer
  from production_control.current_tournament_pointer_v1 value
  where value.scope_key = case when exists(select 1 from production_control.canonical_resource_v1 where singleton and resource_class='CERTIFICATION')
    then production_control.annual_resource_context_v2()->>'resource_id' else 'BAGGER_INV_PRODUCTION' end;
  select value.* into strict generation
  from production_control.future_annual_runtime_generations_v1 value
  where value.tournament_id = target_tournament_id
    and value.runtime_generation_id = target_runtime_generation_id;
  select value.* into strict annual
  from production_control.annual_scoring_runtime_authorities_v1 value
  where value.tournament_id = target_tournament_id
    and value.runtime_generation_id = target_runtime_generation_id;
  select value.* into strict identity_context
  from participant_identity.future_tournament_identity_contexts_v1 value
  where value.tournament_id = target_tournament_id;
  select value.* into strict prior_certification
  from production_control.annual_side_game_runtime_certifications_v1 value
  where value.runtime_generation_id = target_runtime_generation_id
    and value.admission_generation_id = prior_admission_generation_id;

  if target_tournament_id = '2026'
     or target_admission_generation_id = prior_admission_generation_id
     or pointer.tournament_id <> target_tournament_id
     or pointer.pointer_revision <> target_pointer_revision
     or generation.generation_status <> 'ACTIVE'
     or generation.pointer_revision <> target_pointer_revision
     or generation.authority_generation_id is distinct from
       target_authority_generation_id
     or generation.admission_generation_id is distinct from
       target_admission_generation_id
     or annual.authority_status <> 'ACTIVE'
     or annual.admission_state <> 'OPEN'
     or annual.authority_generation_id is distinct from
       target_authority_generation_id
     or annual.admission_generation_id is distinct from
       target_admission_generation_id
     or identity_context.status <> 'CERTIFIED'
     or identity_context.runtime_generation_id is distinct from
       target_runtime_generation_id
     or identity_context.authority_generation_id is distinct from
       target_authority_generation_id
     or identity_context.admission_generation_id is distinct from
       target_admission_generation_id
     or identity_context.pointer_revision <> target_pointer_revision
     or prior_certification.tournament_id <> target_tournament_id
     or prior_certification.authority_generation_id is distinct from
       target_authority_generation_id then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ANNUAL_SIDE_GAME_ADMISSION_REBIND_REQUIRED';
  end if;

  rebound := production_control.ensure_annual_side_game_runtime_v1(
    target_tournament_id, target_runtime_generation_id,
    target_authority_generation_id, target_admission_generation_id, true
  );
  return rebound || pg_catalog.jsonb_build_object(
    'priorAdmissionGenerationId', prior_admission_generation_id,
    'admissionGenerationId', target_admission_generation_id,
    'rebound', true
  );
exception
  when no_data_found then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ANNUAL_SIDE_GAME_ADMISSION_REBIND_REQUIRED';
end;
$function$;


-- SCRATCH ONLY: append to reviewed138 after shared eligibility core.
-- Historical recovery checks retained identity authority, never a current/open
-- write lane. Called only after136 static resource + exact-origin lease lookup.
create function production_control.assert_certification_historical_identity_v1(
 target_tournament text, target_player text, target_auth_user uuid, target_role text)
returns void language plpgsql security definer set search_path=pg_catalog as $$
declare
 resource production_control.canonical_resource_v1%rowtype;
 context participant_identity.future_tournament_identity_contexts_v1%rowtype;
 generation production_control.future_annual_runtime_generations_v1%rowtype;
 binding participant_identity.future_tournament_participant_bindings_v1%rowtype;
 eligibility record;
 annual_resource production_control.future_tournament_resources_v1%rowtype;
begin
 perform production_control.assert_production_service_role();
 select * into strict resource from production_control.canonical_resource_v1 where singleton;
 if resource.resource_class<>'CERTIFICATION' or resource.database_name<>current_database()
  or resource.provenance_id is distinct from 'urn:bagger:synthetic:'||resource.installation_id::text
  or target_tournament is null or target_tournament!~'^[0-9]{4}$' or target_tournament<='2026'
  or target_player is null or target_auth_user is null or target_role is null
  or target_role not in('PLAYER','DIRECTOR') then
  raise exception using errcode='42501',message='CERTIFICATION_INGRESS_RECOVERY_AUTHORIZATION_REQUIRED';end if;
 select * into strict annual_resource from production_control.future_tournament_resources_v1
  where tournament_id=target_tournament;
 select * into strict context from participant_identity.future_tournament_identity_contexts_v1
  where tournament_id=target_tournament;
 select * into strict generation from production_control.future_annual_runtime_generations_v1
  where runtime_generation_id=context.runtime_generation_id and tournament_id=target_tournament;
 select * into strict binding from participant_identity.future_tournament_participant_bindings_v1
  where tournament_id=target_tournament and player_id=target_player;
 -- Core retains the original approved-run, approved-contact, email, unique-link,
 -- verified identifier, and confirmed Auth equality predicates. Its computed
 -- runtime_eligible is intentionally not execution authority in this read path.
 select * into strict eligibility from production_control.future_participant_identity_eligibility_core_v1(
  target_tournament,resource.resource_id,resource.provenance_id) where player_id=target_player;
 if annual_resource.project_ref is distinct from resource.project_ref
  or annual_resource.project_url is distinct from resource.project_url
  or annual_resource.source_workbook_id is distinct from resource.provenance_id
  or context.status<>'CERTIFIED' or context.source_identity_tournament_id<>'2026'
  or context.binding_fingerprint is distinct from production_control.future_participant_identity_binding_fingerprint_v1(target_tournament)
  or generation.authority<>'SUPABASE'
  or context.authority_generation_id is distinct from generation.authority_generation_id
  or context.admission_generation_id is distinct from generation.admission_generation_id
  or context.pointer_revision is distinct from generation.pointer_revision
  or binding.enrollment_state<>'ENROLLED' or binding.contact_state<>'APPROVED'
  or binding.binding_revision is distinct from context.binding_revision
  or binding.source_identity_tournament_id<>'2026'
  or not eligibility.contact_approved or not eligibility.linked_verified
  or eligibility.auth_user_id is distinct from target_auth_user
  or binding.bound_link_revision is distinct from eligibility.link_revision
  or binding.source_configuration_revision is distinct from eligibility.source_configuration_revision
  or binding.source_contact_fingerprint is distinct from eligibility.source_contact_fingerprint
  or not exists(select 1 from participant_identity.participant_identity_contacts c
   where c.tournament_id=target_tournament and c.player_id=target_player and c.identity_active
    and c.email_normalized=eligibility.source_email_normalized)
  or not exists(select 1 from participant_identity.tournament_roles r
   where r.tournament_id=target_tournament and r.auth_user_id=target_auth_user
    and r.role='PARTICIPANT' and r.role_active and r.revoked_at is null) then
  raise exception using errcode='42501',message='CERTIFICATION_INGRESS_RECOVERY_AUTHORIZATION_REQUIRED';end if;
 -- DIRECTOR entitlement/role and exact originating lease actor are independently
 -- enforced by136 before this helper. This helper grants neither role nor lease.
exception when no_data_found then
 raise exception using errcode='42501',message='CERTIFICATION_INGRESS_RECOVERY_AUTHORIZATION_REQUIRED';
end;$$;
revoke all on function production_control.assert_certification_historical_identity_v1(text,text,uuid,text)
 from public,anon,authenticated,service_role;

do $identity_privilege_gate$
declare item record;
begin
 for item in select p.* from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='production_control' and p.proname in(
   'future_participant_identity_eligibility_core_v1','assert_certification_historical_identity_v1') loop
  if item.proowner<>(select oid from pg_roles where rolname=current_user) or not item.prosecdef
   or item.proconfig is distinct from array['search_path=pg_catalog']::text[]
   or exists(select 1 from aclexplode(coalesce(item.proacl,acldefault('f',item.proowner))) a
    where a.privilege_type='EXECUTE' and a.grantee<>item.proowner) then
   raise exception 'CERTIFICATION_ANNUAL_IDENTITY_PRIVILEGE_MISMATCH: %',item.oid::regprocedure;end if;
 end loop;
end;$identity_privilege_gate$;


do $source$begin if encode(extensions.digest((select prosrc from pg_proc where oid='production_control.annual_scoring_transition_readiness_v1(text)'::regprocedure),'sha256'),'hex')<>'5da45e8358a2b11a34e254141aaa93e3cac757d9c880c04a59ad438d1086c09c'then raise exception 'CERTIFICATION_ANNUAL_PREDECESSOR_MISMATCH:production_control.annual_scoring_transition_readiness_v1';end if;end;$source$;
CREATE OR REPLACE FUNCTION production_control.annual_scoring_transition_readiness_v1(target_tournament_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  pointer production_control.current_tournament_pointer_v1%rowtype;
  baseline jsonb;
  certificate jsonb;
  blockers jsonb;
  fingerprint_value text;
begin
  select value.* into strict pointer
  from production_control.current_tournament_pointer_v1 value
  where value.scope_key = production_control.canonical_annual_scope_key_v2();
  baseline := production_control.future_runtime_readiness_v2(
    target_tournament_id
  );
  select coalesce(pg_catalog.jsonb_agg(value), '[]'::jsonb)
    into blockers
  from pg_catalog.jsonb_array_elements(
    coalesce(baseline->'blockers', '[]'::jsonb)
  ) value
  where value->>'code' <>
    'FUTURE_PREDECESSOR_SCORING_CLOSE_FENCE_NOT_CERTIFIED';
  -- Preserve069's missing-certificate denial for Production only. Certification
  -- retains its separately admitted origin and does not acquire this certificate.
  if production_control.canonical_annual_scope_key_v2() = 'BAGGER_INV_PRODUCTION'
     and not exists (
       select 1 from production_control.annual_scoring_platform_certifications_v1
       where scope_key = 'BAGGER_INV_PRODUCTION'
     ) then
    blockers := blockers || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'PRODUCTION_ANNUAL_SCORING_PLATFORM_CERTIFICATION_REQUIRED',
        'section', 'Activation',
        'message', 'Annual activation requires its lawful platform certification.'
      )
    );
  end if;
  certificate :=
    production_control.annual_scoring_predecessor_certificate_v1(
      pointer.tournament_id
    );
  if coalesce((certificate->>'certified')::boolean, false) is not true then
    blockers := blockers || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'FUTURE_PREDECESSOR_SCORING_CLOSE_FENCE_NOT_CERTIFIED',
        'section', 'Activation',
        'message', 'The current tournament scoring close and drain boundary is not certified.',
        'details', certificate->'blockers'
      )
    );
  end if;
  fingerprint_value := production_control.future_runtime_hash_v2(
    pg_catalog.jsonb_build_object(
      'contractVersion', 'production-annual-scoring-transition-readiness-v1',
      'targetTournamentId', target_tournament_id,
      'predecessorTournamentId', pointer.tournament_id,
      'expectedPointerRevision', pointer.pointer_revision,
      'baselineFingerprint', baseline->>'fingerprint',
      'predecessorBoundaryFingerprint', certificate->>'fingerprint',
      'blockers', blockers
    )
  );
  return pg_catalog.jsonb_build_object(
    'ok', true,
    'contractVersion',
      'production-annual-scoring-transition-readiness-v1',
    'targetTournamentId', target_tournament_id,
    'predecessorTournamentId', pointer.tournament_id,
    'expectedPointerRevision', pointer.pointer_revision,
    'ready', pg_catalog.jsonb_array_length(blockers) = 0,
    'fingerprint', fingerprint_value,
    'predecessorCertificate', certificate,
    'blockers', blockers
  );
end;
$function$
;

do $source$begin if encode(extensions.digest((select prosrc from pg_proc where oid='production_control.annual_scoring_predecessor_certificate_pre_side_games_v1(text)'::regprocedure),'sha256'),'hex')<>'873af659c603459453b439e7f9e20d7e76f9d79fdf8bed705c3f56b6ddf66340'then raise exception 'CERTIFICATION_ANNUAL_PREDECESSOR_MISMATCH:production_control.annual_scoring_predecessor_certificate_pre_side_games_v1';end if;end;$source$;
CREATE OR REPLACE FUNCTION production_control.annual_scoring_predecessor_certificate_pre_side_games_v1(target_tournament_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  activation production_control.cutover_activation_state%rowtype;
  gate scoring_authority.ingress_gates%rowtype;
  annual production_control.annual_scoring_runtime_authorities_v1%rowtype;
  closure production_control.scoring_admission_closures%rowtype;
  legacy_root production_control.scoring_admission_closures%rowtype;
  authority_generation uuid;
  admission_generation uuid;
  blocker_values jsonb := '[]'::jsonb;
  fingerprint_value text;
  unresolved_leases integer;
  legacy_blockers integer := 0;
  post_close_lease_count integer := 0;
  unresolved_outbox integer;
  unresolved_archive integer;
begin
  if exists(select 1 from production_control.canonical_resource_v1 where singleton and resource_class='CERTIFICATION')then
    return production_control.certification_annual_predecessor_certificate_v1(target_tournament_id);
  end if;
  if target_tournament_id = '2026' then
    select value.* into strict activation
    from production_control.cutover_activation_state value
    where value.scope_key = 'BAGGER_INV_PRODUCTION';
    select value.* into strict gate
    from scoring_authority.ingress_gates value
    where value.tournament_id = '2026';
    select value.* into closure
    from production_control.scoring_admission_closures value
    where value.closure_id = gate.active_closure_id;
    authority_generation := activation.authority_generation_id;
    admission_generation := gate.admission_generation_id;
    if closure.closure_kind = 'SUPABASE_INGRESS' then
      select value.* into legacy_root
      from production_control.scoring_admission_closures value
      where value.closure_id = closure.prior_legacy_closure_id;
    else
      legacy_root := closure;
    end if;
    if gate.state <> 'PAUSED' or gate.admission_state <> 'CLOSED'
       or closure.closure_id is null
       or closure.tournament_id <> '2026'
       or closure.closure_kind <> 'SUPABASE_INGRESS'
       or closure.authority <> 'SUPABASE'
       or closure.status <> 'CLOSED'
       or closure.authority_generation_id is distinct from
         authority_generation
       or closure.admission_generation_id is distinct from
         admission_generation
       or legacy_root.closure_kind <> 'LEGACY_ADMISSION'
       or legacy_root.status <> 'CONSUMED' then
      blocker_values := blocker_values || pg_catalog.jsonb_build_array(
        'PREDECESSOR_SCORING_ADMISSION_NOT_CLOSED'
      );
    end if;
  else
    select value.* into annual
    from production_control.annual_scoring_runtime_authorities_v1 value
    where value.tournament_id = target_tournament_id;
    select value.* into closure
    from production_control.scoring_admission_closures value
    where value.closure_id = annual.active_closure_id;
    select value.* into legacy_root
    from production_control.scoring_admission_closures value
    where value.closure_id = annual.legacy_root_closure_id;
    authority_generation := annual.authority_generation_id;
    admission_generation := annual.admission_generation_id;
    if annual.runtime_generation_id is null
       or annual.authority_status <> 'CLOSED'
       or annual.admission_state <> 'CLOSED'
       or closure.closure_id is null
       or closure.tournament_id <> target_tournament_id
       or closure.closure_kind <> 'SUPABASE_INGRESS'
       or closure.authority <> 'SUPABASE'
       or closure.status <> 'CLOSED'
       or closure.authority_generation_id is distinct from
         authority_generation
       or closure.admission_generation_id is distinct from
         admission_generation
       or legacy_root.closure_kind <> 'LEGACY_ADMISSION'
       or legacy_root.status <> 'CONSUMED' then
      blocker_values := blocker_values || pg_catalog.jsonb_build_array(
        'PREDECESSOR_SCORING_ADMISSION_NOT_CLOSED'
      );
    end if;
  end if;
  unresolved_leases :=
    production_control.annual_scoring_unresolved_count_v1(
      target_tournament_id, admission_generation
    );
  if target_tournament_id = '2026' then
    legacy_blockers :=
      production_control.scoring_admission_legacy_blocker_count(
        gate.admission_enforced_at
      );
  end if;
  select pg_catalog.count(*)::integer into post_close_lease_count
  from scoring_authority.scoring_ingress_leases value
  where value.tournament_id = target_tournament_id
    and value.admission_generation_id = admission_generation
    and value.admission_sequence > closure.lease_high_watermark;
  unresolved_outbox := 0; -- Retired external delivery is not required work.
  unresolved_archive := 0; -- Canonical snapshots already committed; export is retired.
  if unresolved_leases <> 0 or legacy_blockers <> 0
     or post_close_lease_count <> 0 or unresolved_outbox <> 0
     or unresolved_archive <> 0 then
    blocker_values := blocker_values || pg_catalog.jsonb_build_array(
      'PREDECESSOR_SCORING_DRAIN_INCOMPLETE'
    );
  end if;
  if not exists (
       select 1 from scoring_authority.matches value
       where value.tournament_id = target_tournament_id
     ) or exists (
       select 1 from scoring_authority.matches value
       where value.tournament_id = target_tournament_id
         and (value.status <> 'FINAL' or not value.scorecard_complete
           or value.unresolved_mutations <> 0)
     ) then
    blocker_values := blocker_values || pg_catalog.jsonb_build_array(
      'PREDECESSOR_FINAL_SCORING_FACTS_REQUIRED'
    );
  end if;
  fingerprint_value := production_control.future_runtime_hash_v2(
    pg_catalog.jsonb_build_object(
      'contractVersion', 'production-annual-scoring-close-certificate-v1',
      'tournamentId', target_tournament_id,
      'closureId', closure.closure_id,
      'legacyRootClosureId', legacy_root.closure_id,
      'authorityGenerationId', authority_generation,
      'admissionGenerationId', admission_generation,
      'closedAdmissionRevision', closure.closed_admission_revision,
      'leaseSetFingerprint', closure.lease_set_fingerprint,
      'matchRevisions', closure.supabase_match_revisions,
      'googleCheckpoints', closure.google_checkpoints,
      'unresolvedLeases', unresolved_leases,
      'legacyAdmissionBlockers', legacy_blockers,
      'postCloseLeaseCount', post_close_lease_count,
      'unresolvedOutbox', unresolved_outbox,
      'unresolvedArchive', unresolved_archive
    )
  );
  return pg_catalog.jsonb_build_object(
    'certified', pg_catalog.jsonb_array_length(blocker_values) = 0,
    'tournamentId', target_tournament_id,
    'closureId', closure.closure_id,
    'legacyRootClosureId', legacy_root.closure_id,
    'authorityGenerationId', authority_generation,
    'admissionGenerationId', admission_generation,
    'legacyAdmissionBlockers', legacy_blockers,
    'postCloseLeaseCount', post_close_lease_count,
    'fingerprint', fingerprint_value,
    'blockers', blocker_values
  );
exception when no_data_found then
  return pg_catalog.jsonb_build_object(
    'certified', false, 'tournamentId', target_tournament_id,
    'fingerprint', null,
    'blockers', pg_catalog.jsonb_build_array(
      'PREDECESSOR_SCORING_CLOSE_CERTIFICATE_UNAVAILABLE'
    )
  );
end;
$function$
;

do $source$begin if encode(extensions.digest((select prosrc from pg_proc where oid='production_control.close_annual_scoring_predecessor_pre_derived_workers_v1(jsonb,text)'::regprocedure),'sha256'),'hex')<>'ffaafa02d2682da25a8e27b60663f4fc0f28f4a0c95dfc1fbd57f4d4cd31ddf8'then raise exception 'CERTIFICATION_ANNUAL_PREDECESSOR_MISMATCH:production_control.close_annual_scoring_predecessor_pre_derived_workers_v1';end if;end;$source$;
CREATE OR REPLACE FUNCTION production_control.close_annual_scoring_predecessor_pre_derived_workers_v1(input jsonb, target_tournament_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  pointer production_control.current_tournament_pointer_v1%rowtype;
  activation production_control.cutover_activation_state%rowtype;
  gate scoring_authority.ingress_gates%rowtype;
  annual production_control.annual_scoring_runtime_authorities_v1%rowtype;
  generation production_control.future_annual_runtime_generations_v1%rowtype;
  legacy_root production_control.scoring_admission_closures%rowtype;
  closure production_control.scoring_admission_closures%rowtype;
  actor_player text := pg_catalog.upper(pg_catalog.btrim(
    input#>>'{authorization,player_id}'
  ));
  close_fingerprint text := production_control.future_runtime_hash_v2(
    pg_catalog.jsonb_build_object(
      'contractVersion', 'production-annual-scoring-transition-v1',
      'operationRequestId', input->>'operation_request_id',
      'requestPayloadHash', input->>'request_payload_hash',
      'stage', 'CLOSE_PREDECESSOR'
    )
  );
  close_input jsonb;
  high_watermark bigint;
  unresolved integer;
  response_value jsonb;
begin
  if exists(select 1 from production_control.canonical_resource_v1 where singleton and resource_class='CERTIFICATION')then
    return production_control.close_certification_annual_predecessor_v1(input,target_tournament_id);
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    production_control.scoring_admission_lock_key()
  );
  select value.* into strict pointer
  from production_control.current_tournament_pointer_v1 value
  where value.scope_key = 'BAGGER_INV_PRODUCTION' for update;
  if pointer.tournament_id <> target_tournament_id
     or input->>'expected_current_tournament_id' is distinct from
       pointer.tournament_id
     or coalesce((input->>'expected_pointer_revision')::bigint, -1)
       <> pointer.pointer_revision
     or coalesce(input->>'start_source_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'final_source_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'reconciliation_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or not exists (
       select 1 from scoring_authority.matches value
       where value.tournament_id = pointer.tournament_id
     )
     or exists (
       select 1 from scoring_authority.matches value
       where value.tournament_id = pointer.tournament_id
         and (value.status <> 'FINAL' or not value.scorecard_complete
           or value.unresolved_mutations <> 0)
     ) then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_ANNUAL_SCORING_PREDECESSOR_NOT_CLOSEABLE';
  end if;

  if pointer.tournament_id = '2026' then
    select value.* into strict activation
    from production_control.cutover_activation_state value
    where value.scope_key = 'BAGGER_INV_PRODUCTION' for update;
    select value.* into strict gate
    from scoring_authority.ingress_gates value
    where value.tournament_id = '2026' for update;
    if coalesce((input->>'expected_platform_activation_revision')::bigint, -1)
         <> activation.activation_revision
       or input->>'expected_platform_authority_generation_id'
         is distinct from activation.authority_generation_id::text
       or input->>'expected_platform_admission_generation_id'
         is distinct from gate.admission_generation_id::text
       or coalesce((input->>'expected_platform_admission_revision')::bigint, -1)
         <> gate.admission_revision then
      raise exception using errcode = '40001',
        message = 'PRODUCTION_ANNUAL_SCORING_PREDECESSOR_REVISION_CONFLICT';
    end if;
    close_input := input || pg_catalog.jsonb_build_object(
      'actor_id', actor_player,
      'expected_authority', 'SUPABASE',
      'expected_activation_revision', activation.activation_revision,
      'expected_authority_generation', activation.authority_generation_id,
      'expected_admission_generation', gate.admission_generation_id,
      'expected_admission_revision', gate.admission_revision,
      'request_fingerprint', close_fingerprint
    );
    return public.close_production_scoring_admission(close_input);
  end if;

  select value.* into strict annual
  from production_control.annual_scoring_runtime_authorities_v1 value
  where value.tournament_id = pointer.tournament_id for update;
  select value.* into strict generation
  from production_control.future_annual_runtime_generations_v1 value
  where value.runtime_generation_id = annual.runtime_generation_id
    and value.generation_status = 'ACTIVE' for update;
  select value.* into strict legacy_root
  from production_control.scoring_admission_closures value
  where value.closure_id = annual.legacy_root_closure_id;
  if input->>'expected_predecessor_runtime_generation_id' is distinct from
       generation.runtime_generation_id::text
     or input->>'expected_predecessor_annual_authority_generation_id'
       is distinct from
       annual.authority_generation_id::text
     or input->>'expected_predecessor_annual_admission_generation_id'
       is distinct from
       annual.admission_generation_id::text
     or coalesce(
       (input->>'expected_predecessor_annual_admission_revision')::bigint, -1
     )
       <> annual.admission_revision
     or annual.authority_status <> 'ACTIVE'
     or annual.admission_state <> 'OPEN'
     or annual.active_closure_id is not null
     or generation.admission_generation_id is distinct from
       annual.admission_generation_id then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_ANNUAL_SCORING_PREDECESSOR_REVISION_CONFLICT';
  end if;
  select coalesce(pg_catalog.max(value.admission_sequence), 0)
    into high_watermark
  from scoring_authority.scoring_ingress_leases value
  where value.tournament_id = pointer.tournament_id
    and value.admission_generation_id = annual.admission_generation_id;
  insert into production_control.scoring_admission_closures (
    closure_kind, prior_legacy_closure_id, tournament_id, authority,
    authority_generation_id, admission_generation_id, deployment_id,
    status, opening_admission_revision, closing_admission_revision,
    lease_high_watermark, start_source_fingerprint,
    external_fence_evidence_id, google_writer_provider_fence_id,
    google_writer_provider_verification_id, close_request_fingerprint,
    close_payload_hash, actor_id
  ) values (
    'SUPABASE_INGRESS', legacy_root.closure_id, pointer.tournament_id,
    'SUPABASE', annual.authority_generation_id,
    annual.admission_generation_id, legacy_root.deployment_id,
    'CLOSING', annual.admission_revision, annual.admission_revision + 1,
    high_watermark, pg_catalog.lower(input->>'start_source_fingerprint'),
    legacy_root.external_fence_evidence_id,
    legacy_root.google_writer_provider_fence_id,
    legacy_root.google_writer_provider_verification_id,
    close_fingerprint,
    production_control.future_runtime_hash_v2(
      input - 'request_payload_hash'
    ), actor_player
  ) returning * into closure;
  update scoring_authority.scoring_ingress_leases set
    close_fence_id = closure.closure_id
  where tournament_id = pointer.tournament_id
    and admission_generation_id = annual.admission_generation_id
    and resolution_state in (
      'ADMITTED', 'WRITE_STARTED', 'AMBIGUOUS', 'PARTIAL_WRITE',
      'LEGACY_UNCLASSIFIED'
    );
  unresolved := production_control.annual_scoring_unresolved_count_v1(
    pointer.tournament_id, annual.admission_generation_id
  );
  update production_control.annual_scoring_runtime_authorities_v1 set
    admission_state = 'CLOSING',
    admission_revision = admission_revision + 1,
    active_closure_id = closure.closure_id,
    updated_at = pg_catalog.clock_timestamp()
  where runtime_generation_id = annual.runtime_generation_id;
  response_value := pg_catalog.jsonb_build_object(
    'ok', true,
    'code', 'PRODUCTION_ANNUAL_SCORING_PREDECESSOR_CLOSING',
    'closure_id', closure.closure_id,
    'authority_generation_id', annual.authority_generation_id,
    'admission_generation_id', annual.admission_generation_id,
    'admission_revision', annual.admission_revision + 1,
    'admission_state', 'CLOSING',
    'active_or_unresolved_leases', unresolved,
    'lease_high_watermark', closure.lease_high_watermark,
    'idempotent', false
  );
  return response_value;
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_ANNUAL_SCORING_PREDECESSOR_REVISION_CONFLICT';
end;
$function$
;

do $source$begin if encode(extensions.digest((select prosrc from pg_proc where oid='production_control.advance_annual_scoring_transition_v1(uuid,jsonb)'::regprocedure),'sha256'),'hex')<>'0686dba7e0ab61e10e3a6ab5ba2799d4e8437bda0a742c1b7f87483a72b99969'then raise exception 'CERTIFICATION_ANNUAL_PREDECESSOR_MISMATCH:production_control.advance_annual_scoring_transition_v1';end if;end;$source$;
CREATE OR REPLACE FUNCTION production_control.advance_annual_scoring_transition_v1(target_transition_id uuid, input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  canonical_context jsonb:=jsonb_build_object('resource_class','PRODUCTION','resource_id','BAGGER_INV_PRODUCTION');
  transition_value production_control.annual_scoring_transitions_v1%rowtype;
  pointer production_control.current_tournament_pointer_v1%rowtype;
  target production_control.future_tournament_catalog_v1%rowtype;
  generation production_control.future_annual_runtime_generations_v1%rowtype;
  activation production_control.cutover_activation_state%rowtype;
  gate scoring_authority.ingress_gates%rowtype;
  annual production_control.annual_scoring_runtime_authorities_v1%rowtype;
  closure production_control.scoring_admission_closures%rowtype;
  actor_player text := pg_catalog.upper(pg_catalog.btrim(
    input#>>'{authorization,player_id}'
  ));
  actor_auth uuid := (input#>>'{authorization,auth_user_id}')::uuid;
  drain_input jsonb;
  drain_response jsonb;
  finalize_input jsonb;
  finalize_response jsonb;
  certificate jsonb;
  readiness jsonb;
  lease_fingerprint text;
  revisions jsonb;
  checkpoints jsonb;
  unresolved integer;
  unresolved_outbox integer;
  unresolved_archive integer;
  post_close_count integer;
  next_lifecycle_revision bigint;
begin
  if exists(select 1 from production_control.canonical_resource_v1 where singleton and resource_class='CERTIFICATION')then
    canonical_context:=production_control.annual_resource_context_v2();
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    production_control.scoring_admission_lock_key()
  );
  select value.* into strict transition_value
  from production_control.annual_scoring_transitions_v1 value
  where value.transition_id = target_transition_id for update;
  select value.* into strict pointer
  from production_control.current_tournament_pointer_v1 value
  where value.scope_key = canonical_context->>'resource_id' for update;
  select value.* into strict target
  from production_control.future_tournament_catalog_v1 value
  where value.tournament_id = transition_value.successor_tournament_id
  for update;
  select value.* into strict generation
  from production_control.future_annual_runtime_generations_v1 value
  where value.runtime_generation_id = transition_value.runtime_generation_id
  for update;
  select value.* into strict closure
  from production_control.scoring_admission_closures value
  where value.closure_id = transition_value.predecessor_closure_id
  for update;
  if transition_value.transition_status = 'CLOSED' then
    return pg_catalog.jsonb_build_object(
      'ok', true,
      'code', 'PRODUCTION_ANNUAL_SCORING_PREDECESSOR_CLOSED',
      'transitionId', transition_value.transition_id,
      'predecessorTournamentId', transition_value.predecessor_tournament_id,
      'successorTournamentId', transition_value.successor_tournament_id,
      'expectedPointerRevision', transition_value.expected_pointer_revision,
      'runtimeGenerationId', transition_value.runtime_generation_id,
      'authorityGenerationId', transition_value.authority_generation_id,
      'admissionGenerationId', transition_value.admission_generation_id,
      'readinessFingerprint', transition_value.readiness_fingerprint,
      'pointerChanged', false, 'predecessorClosed', true,
      'successorActivated', false, 'idempotent', true
    );
  end if;
  if transition_value.transition_status <> 'CLOSING'
     or pointer.tournament_id <> transition_value.predecessor_tournament_id
     or pointer.pointer_revision <> transition_value.expected_pointer_revision
     or input->>'expected_current_tournament_id' is distinct from
       pointer.tournament_id
     or coalesce((input->>'expected_pointer_revision')::bigint, -1)
       <> pointer.pointer_revision
     or target.lifecycle <> 'READY_FOR_ACTIVATION'
     or generation.generation_status <> 'PREPARED'
     or closure.status not in ('CLOSING', 'CLOSED') then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_ANNUAL_SCORING_DRAIN_REVISION_CONFLICT';
  end if;

  if canonical_context->>'resource_class'='CERTIFICATION' then
    drain_response:=production_control.drain_certification_annual_predecessor_v1(closure.closure_id);
    if not coalesce((drain_response->>'ready_to_finalize')::boolean,false)then
      return jsonb_build_object('ok',true,'code','PRODUCTION_ANNUAL_SCORING_PREDECESSOR_DRAINING',
       'transitionId',target_transition_id,'predecessorTournamentId',pointer.tournament_id,'successorTournamentId',target.tournament_id,
       'closureId',closure.closure_id,'activeOrUnresolvedLeases',drain_response->'active_or_unresolved_leases',
       'pointerChanged',false,'predecessorClosed',false,'successorActivated',false,'idempotent',false);
    end if;
  elsif pointer.tournament_id = '2026' then
    select value.* into strict activation
    from production_control.cutover_activation_state value
    where value.scope_key = 'BAGGER_INV_PRODUCTION' for update;
    select value.* into strict gate
    from scoring_authority.ingress_gates value
    where value.tournament_id = '2026' for update;
    if closure.status = 'CLOSING' then
      drain_input := input || pg_catalog.jsonb_build_object(
        'actor_id', actor_player,
        'closure_id', closure.closure_id,
        'external_fence_evidence_id', closure.external_fence_evidence_id,
        'expected_activation_revision', activation.activation_revision,
        'expected_authority_generation', activation.authority_generation_id,
        'expected_admission_generation', gate.admission_generation_id,
        'expected_admission_revision', gate.admission_revision,
        'request_fingerprint', production_control.future_runtime_hash_v2(
          pg_catalog.jsonb_build_object(
            'operationRequestId', input->>'operation_request_id',
            'requestPayloadHash', input->>'request_payload_hash',
            'transitionId', target_transition_id,
            'stage', 'DRAIN_PREDECESSOR'
          )
        )
      );
      drain_response := public.drain_production_scoring_admission(drain_input);
      if coalesce((drain_response->>'ready_to_finalize')::boolean, false)
           is not true then
        return pg_catalog.jsonb_build_object(
          'ok', true,
          'code', 'PRODUCTION_ANNUAL_SCORING_PREDECESSOR_DRAINING',
          'transitionId', target_transition_id,
          'predecessorTournamentId', pointer.tournament_id,
          'successorTournamentId', target.tournament_id,
          'closureId', closure.closure_id,
          'activeOrUnresolvedLeases',
            coalesce((drain_response->>'active_or_unresolved_leases')::integer, 0),
          'pointerChanged', false, 'predecessorClosed', false,
          'successorActivated', false, 'idempotent', false
        );
      end if;
      select value.* into strict activation
      from production_control.cutover_activation_state value
      where value.scope_key = 'BAGGER_INV_PRODUCTION' for update;
      select value.* into strict gate
      from scoring_authority.ingress_gates value
      where value.tournament_id = '2026' for update;
      revisions := production_control.current_match_revisions('2026');
      checkpoints := production_control.current_google_checkpoints('2026');
      finalize_input := input || pg_catalog.jsonb_build_object(
        'actor_id', actor_player,
        'closure_id', closure.closure_id,
        'external_fence_evidence_id', closure.external_fence_evidence_id,
        'expected_activation_revision', activation.activation_revision,
        'expected_authority_generation', activation.authority_generation_id,
        'expected_admission_generation', gate.admission_generation_id,
        'expected_admission_revision', gate.admission_revision,
        'boundary_captured_at', pg_catalog.clock_timestamp(),
        'lease_set_fingerprint', drain_response->>'lease_set_fingerprint',
        'supabase_match_revisions', revisions,
        'google_checkpoints', checkpoints,
        'request_fingerprint', production_control.future_runtime_hash_v2(
          pg_catalog.jsonb_build_object(
            'operationRequestId', input->>'operation_request_id',
            'requestPayloadHash', input->>'request_payload_hash',
            'transitionId', target_transition_id,
            'stage', 'FINALIZE_PREDECESSOR'
          )
        )
      );
      finalize_response :=
        public.finalize_production_scoring_admission(finalize_input);
    end if;
  else
    select value.* into strict annual
    from production_control.annual_scoring_runtime_authorities_v1 value
    where value.tournament_id = pointer.tournament_id for update;
    perform value.lease_id
    from scoring_authority.scoring_ingress_leases value
    where value.tournament_id = pointer.tournament_id
      and value.admission_generation_id = annual.admission_generation_id
    order by value.lease_id for update;
    unresolved := production_control.annual_scoring_unresolved_count_v1(
      pointer.tournament_id, annual.admission_generation_id
    );
    unresolved_outbox := 0; -- Retired external delivery is not required work.
    unresolved_archive := 0; -- Canonical snapshots already committed; export is retired.
    select pg_catalog.count(*)::integer into post_close_count
    from scoring_authority.scoring_ingress_leases value
    where value.tournament_id = pointer.tournament_id
      and value.admission_generation_id = annual.admission_generation_id
      and value.admission_sequence > closure.lease_high_watermark;
    update production_control.annual_scoring_runtime_authorities_v1 set
      admission_revision = admission_revision + 1,
      updated_at = pg_catalog.clock_timestamp()
    where runtime_generation_id = annual.runtime_generation_id
    returning * into annual;
    if unresolved <> 0 or unresolved_outbox <> 0
       or unresolved_archive <> 0 or post_close_count <> 0 then
      return pg_catalog.jsonb_build_object(
        'ok', true,
        'code', 'PRODUCTION_ANNUAL_SCORING_PREDECESSOR_DRAINING',
        'transitionId', target_transition_id,
        'predecessorTournamentId', pointer.tournament_id,
        'successorTournamentId', target.tournament_id,
        'closureId', closure.closure_id,
        'activeOrUnresolvedLeases', unresolved,
        'unresolvedOutbox', unresolved_outbox,
        'unresolvedArchive', unresolved_archive,
        'postCloseLeaseCount', post_close_count,
        'pointerChanged', false, 'predecessorClosed', false,
        'successorActivated', false, 'idempotent', false
      );
    end if;
    lease_fingerprint :=
      production_control.annual_scoring_lease_fingerprint_v1(
        pointer.tournament_id, annual.admission_generation_id
      );
    revisions := production_control.current_match_revisions(
      pointer.tournament_id
    );
    checkpoints := production_control.current_google_checkpoints(
      pointer.tournament_id
    );
    update production_control.scoring_admission_closures set
      status = 'CLOSED',
      closed_admission_revision = annual.admission_revision + 1,
      final_source_fingerprint =
        pg_catalog.lower(input->>'final_source_fingerprint'),
      reconciliation_fingerprint =
        pg_catalog.lower(input->>'reconciliation_fingerprint'),
      lease_set_fingerprint = lease_fingerprint,
      supabase_match_revisions = revisions,
      google_checkpoints = checkpoints,
      closed_at = pg_catalog.clock_timestamp()
    where closure_id = closure.closure_id
      and status = 'CLOSING'
    returning * into closure;
    if not found then
      raise exception using errcode = '40001',
        message = 'PRODUCTION_ANNUAL_SCORING_DRAIN_REVISION_CONFLICT';
    end if;
    update production_control.annual_scoring_runtime_authorities_v1 set
      authority_status = 'CLOSED', admission_state = 'CLOSED',
      admission_revision = admission_revision + 1,
      closed_at = pg_catalog.clock_timestamp(),
      updated_at = pg_catalog.clock_timestamp()
    where runtime_generation_id = annual.runtime_generation_id;
  end if;

  certificate :=
    production_control.annual_scoring_predecessor_certificate_v1(
      pointer.tournament_id
    );
  readiness := production_control.annual_scoring_transition_readiness_v1(
    target.tournament_id
  );
  if coalesce((certificate->>'certified')::boolean, false) is not true
     or coalesce((readiness->>'ready')::boolean, false) is not true then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ANNUAL_SCORING_PREDECESSOR_CERTIFICATION_REQUIRED',
      detail = coalesce((readiness->'blockers')::text, '[]');
  end if;
  update production_control.future_annual_runtime_generations_v1 set
    readiness_fingerprint = readiness->>'fingerprint',
    runtime_revision = runtime_revision + 1,
    updated_at = pg_catalog.clock_timestamp()
  where runtime_generation_id = generation.runtime_generation_id
    and generation_status = 'PREPARED';
  update production_control.future_tournament_catalog_v1 set
    readiness_fingerprint = readiness->>'fingerprint',
    readiness_setup_revision = setup_revision,
    updated_by_player_id = actor_player,
    updated_by_auth_user_id = actor_auth,
    updated_at = pg_catalog.clock_timestamp()
  where tournament_id = target.tournament_id
    and lifecycle = 'READY_FOR_ACTIVATION'
    and lifecycle_revision = target.lifecycle_revision;
  if not found then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_ANNUAL_SCORING_PRECOMMIT_ABORTED';
  end if;
  update production_control.future_runtime_promotions_v2 set
    runtime_status = 'READY', updated_at = pg_catalog.clock_timestamp()
  where tournament_id = target.tournament_id;
  update production_control.annual_scoring_transitions_v1 set
    transition_status = 'CLOSED',
    predecessor_boundary_fingerprint = certificate->>'fingerprint',
    readiness_fingerprint = readiness->>'fingerprint',
    updated_at = pg_catalog.clock_timestamp()
  where transition_id = transition_value.transition_id
    and transition_status = 'CLOSING';
  perform production_control.assert_future_scoring_runtime_capability_v1(
    target.tournament_id, generation.runtime_generation_id,
    generation.authority_generation_id, generation.admission_generation_id
  );
  return pg_catalog.jsonb_build_object(
    'ok', true,
    'code', 'PRODUCTION_ANNUAL_SCORING_PREDECESSOR_CLOSED',
    'transitionId', transition_value.transition_id,
    'predecessorTournamentId', pointer.tournament_id,
    'successorTournamentId', target.tournament_id,
    'expectedPointerRevision', pointer.pointer_revision,
    'runtimeGenerationId', generation.runtime_generation_id,
    'authorityGenerationId', generation.authority_generation_id,
    'admissionGenerationId', generation.admission_generation_id,
    'readinessFingerprint', readiness->>'fingerprint',
    'pointerChanged', false, 'predecessorClosed', true,
    'successorActivated', false, 'idempotent', false
  );
end;
$function$
;

do $source$begin if encode(extensions.digest((select prosrc from pg_proc where oid='public.prepare_production_annual_scoring_transition_v1(jsonb)'::regprocedure),'sha256'),'hex')<>'03d47ec5fba958528c31f476572409a117fb396a4e38bf1ea95f495d8235d936'then raise exception 'CERTIFICATION_ANNUAL_PREDECESSOR_MISMATCH:public.prepare_production_annual_scoring_transition_v1';end if;end;$source$;
CREATE OR REPLACE FUNCTION public.prepare_production_annual_scoring_transition_v1(input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
 SET lock_timeout TO '5s'
AS $function$
begin
 perform production_control.assert_annual_transition_platform_owner_v1(input);
 return production_control.canonical_prepare_annual_scoring_transition_v2(input,jsonb_build_object('resource_class','PRODUCTION','resource_id','BAGGER_INV_PRODUCTION'));
end;$function$;
;
CREATE OR REPLACE FUNCTION production_control.canonical_prepare_annual_scoring_transition_v2(input jsonb, canonical_context jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
 SET lock_timeout TO '5s'
AS $function$
declare
  existing jsonb;
  pointer production_control.current_tournament_pointer_v1%rowtype;
  target production_control.future_tournament_catalog_v1%rowtype;
  readiness jsonb;
  generation_id uuid := extensions.gen_random_uuid();
  authority_id uuid := extensions.gen_random_uuid();
  admission_id uuid := extensions.gen_random_uuid();
  actor_player text := pg_catalog.upper(pg_catalog.btrim(
    input#>>'{authorization,player_id}'
  ));
  actor_auth uuid := (input#>>'{authorization,auth_user_id}')::uuid;
  transition_value production_control.annual_scoring_transitions_v1%rowtype;
  response_value jsonb;
begin
  perform production_control.assert_canonical_annual_transition_context_v2(input,canonical_context);
  existing := production_control.lookup_canonical_annual_scoring_receipt_v2(
    'PREPARE', input, canonical_context
  );
  if existing is not null then return existing; end if;
  perform pg_catalog.pg_advisory_xact_lock(
    production_control.scoring_admission_lock_key()
  );
  existing := production_control.lookup_canonical_annual_scoring_receipt_v2(
    'PREPARE', input, canonical_context
  );
  if existing is not null then return existing; end if;
  select value.* into strict pointer
  from production_control.current_tournament_pointer_v1 value
  where value.scope_key = canonical_context->>'resource_id' for update;
  select value.* into strict target
  from production_control.future_tournament_catalog_v1 value
  where value.tournament_id = input->>'target_tournament_id' for update;
  readiness := production_control.annual_scoring_transition_readiness_v1(
    target.tournament_id
  );
  if input->>'expected_current_tournament_id' is distinct from
       pointer.tournament_id
     or coalesce((input->>'expected_pointer_revision')::bigint, -1)
       <> pointer.pointer_revision
     or coalesce((input->>'expected_revision')::bigint, -1)
       <> target.lifecycle_revision
     or target.lifecycle <> 'CONFIGURING'
     or input->>'readiness_fingerprint'
       is distinct from readiness->>'fingerprint'
     or pointer.tournament_id = target.tournament_id
     or exists (
       select 1
       from pg_catalog.jsonb_array_elements(
         coalesce(readiness->'blockers', '[]'::jsonb)
       ) blocker
       where blocker->>'code' <>
         'FUTURE_PREDECESSOR_SCORING_CLOSE_FENCE_NOT_CERTIFIED'
     )
     or exists (
       select 1
       from production_control.annual_scoring_transitions_v1 value
       where value.transition_status in ('PREPARED', 'CLOSING', 'CLOSED')
     )
     or exists (
       select 1
       from production_control.postcutover_normal_release_intents value
       where value.scope_key = canonical_context->>'resource_id'
         and value.status = 'PENDING'
     )
     or exists (
       select 1
       from production_control.future_annual_runtime_generations_v1 value
       where value.tournament_id = target.tournament_id
         and value.generation_status <> 'ABORTED'
     ) then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_ANNUAL_SCORING_PRECOMMIT_ABORTED',
      detail = coalesce((readiness->'blockers')::text, '[]');
  end if;
  insert into production_control.future_annual_runtime_generations_v1 (
    runtime_generation_id, tournament_id, generation_status,
    runtime_revision, pointer_revision, authority_generation_id,
    admission_generation_id, authority, ingress_state,
    readiness_fingerprint
  ) values (
    generation_id, target.tournament_id, 'PREPARED', 1,
    pointer.pointer_revision + 1, authority_id, admission_id,
    'SUPABASE', 'OPEN', readiness->>'fingerprint'
  );
  update production_control.future_tournament_catalog_v1 set
    lifecycle = 'READY_FOR_ACTIVATION',
    lifecycle_revision = lifecycle_revision + 1,
    readiness_fingerprint = readiness->>'fingerprint',
    readiness_setup_revision = setup_revision,
    updated_by_player_id = actor_player,
    updated_by_auth_user_id = actor_auth,
    updated_at = pg_catalog.clock_timestamp()
  where tournament_id = target.tournament_id
    and lifecycle = 'CONFIGURING'
    and lifecycle_revision = target.lifecycle_revision;
  if not found then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_ANNUAL_SCORING_PRECOMMIT_ABORTED';
  end if;
  update production_control.future_runtime_promotions_v2 set
    runtime_status = 'READY', updated_at = pg_catalog.clock_timestamp()
  where tournament_id = target.tournament_id;
  insert into production_control.annual_scoring_transitions_v1 (
    resource_class,certification_resource_id,contract_version, transition_status, predecessor_tournament_id,
    successor_tournament_id, expected_pointer_revision,
    predecessor_lifecycle_revision,
    successor_prepared_lifecycle_revision, predecessor_closure_id,
    predecessor_boundary_fingerprint, runtime_generation_id,
    authority_generation_id, admission_generation_id,
    readiness_fingerprint, prepared_by_player_id,
    prepared_by_auth_user_id
  ) values (
    canonical_context->>'resource_class',case when canonical_context->>'resource_class'='CERTIFICATION' then canonical_context->>'resource_id' end,
    'production-annual-scoring-transition-v1', 'PREPARED',
    pointer.tournament_id, target.tournament_id, pointer.pointer_revision,
    pointer.lifecycle_revision, target.lifecycle_revision + 1,
    null, null, generation_id, authority_id, admission_id,
    readiness->>'fingerprint', actor_player, actor_auth
  ) returning * into transition_value;
  perform production_control.assert_future_scoring_runtime_capability_v1(
    target.tournament_id, generation_id, authority_id, admission_id
  );
  response_value := pg_catalog.jsonb_build_object(
    'ok', true,
    'code', 'PRODUCTION_ANNUAL_SCORING_TRANSITION_PREPARED',
    'transitionId', transition_value.transition_id,
    'predecessorTournamentId', pointer.tournament_id,
    'successorTournamentId', target.tournament_id,
    'expectedPointerRevision', pointer.pointer_revision,
    'runtimeGenerationId', generation_id,
    'authorityGenerationId', authority_id,
    'admissionGenerationId', admission_id,
    'readinessFingerprint', readiness->>'fingerprint',
    'pointerChanged', false, 'predecessorClosed', false,
    'predecessorAdmissionStopped', false,
    'successorActivated', false, 'idempotent', false
  );
  perform production_control.store_canonical_annual_scoring_receipt_v2(
    'PREPARE', input, response_value, canonical_context
  );
  return response_value;
exception
  when invalid_text_representation or numeric_value_out_of_range
    or no_data_found then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_ANNUAL_SCORING_PRECOMMIT_ABORTED';
end;
$function$
;
revoke all on function production_control.canonical_prepare_annual_scoring_transition_v2(jsonb,jsonb) from public,anon,authenticated,service_role;

do $source$begin if encode(extensions.digest((select prosrc from pg_proc where oid='public.close_production_annual_scoring_transition_v1(jsonb)'::regprocedure),'sha256'),'hex')<>'5e80e88a91515ce804cba99a0c094027ffd76237ae4b4a522f8c4b8943f33696'then raise exception 'CERTIFICATION_ANNUAL_PREDECESSOR_MISMATCH:public.close_production_annual_scoring_transition_v1';end if;end;$source$;
CREATE OR REPLACE FUNCTION public.close_production_annual_scoring_transition_v1(input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
 SET lock_timeout TO '5s'
AS $function$
begin
 perform production_control.assert_annual_transition_platform_owner_v1(input);
 return production_control.canonical_close_annual_scoring_transition_v2(input,jsonb_build_object('resource_class','PRODUCTION','resource_id','BAGGER_INV_PRODUCTION'));
end;$function$;
;
CREATE OR REPLACE FUNCTION production_control.canonical_close_annual_scoring_transition_v2(input jsonb, canonical_context jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
 SET lock_timeout TO '5s'
AS $function$
declare
  existing jsonb;
  transition_value production_control.annual_scoring_transitions_v1%rowtype;
  pointer production_control.current_tournament_pointer_v1%rowtype;
  target production_control.future_tournament_catalog_v1%rowtype;
  generation production_control.future_annual_runtime_generations_v1%rowtype;
  close_response jsonb;
  response_value jsonb;
begin
  perform production_control.assert_canonical_annual_transition_context_v2(input,canonical_context);
  existing := production_control.lookup_canonical_annual_scoring_receipt_v2(
    'CLOSE', input, canonical_context
  );
  if existing is not null then return existing; end if;
  perform pg_catalog.pg_advisory_xact_lock(
    production_control.scoring_admission_lock_key()
  );
  existing := production_control.lookup_canonical_annual_scoring_receipt_v2(
    'CLOSE', input, canonical_context
  );
  if existing is not null then return existing; end if;
  select value.* into strict transition_value
  from production_control.annual_scoring_transitions_v1 value
  where value.transition_id = (input->>'transition_id')::uuid
  for update;
  select value.* into strict pointer
  from production_control.current_tournament_pointer_v1 value
  where value.scope_key = canonical_context->>'resource_id' for update;
  select value.* into strict target
  from production_control.future_tournament_catalog_v1 value
  where value.tournament_id = transition_value.successor_tournament_id
  for update;
  select value.* into strict generation
  from production_control.future_annual_runtime_generations_v1 value
  where value.runtime_generation_id = transition_value.runtime_generation_id
  for update;
  if transition_value.transition_status <> 'PREPARED'
     or transition_value.predecessor_closure_id is not null
     or pointer.tournament_id <> transition_value.predecessor_tournament_id
     or pointer.pointer_revision <> transition_value.expected_pointer_revision
     or input->>'expected_current_tournament_id' is distinct from
       pointer.tournament_id
     or coalesce((input->>'expected_pointer_revision')::bigint, -1)
       <> pointer.pointer_revision
     or target.lifecycle <> 'READY_FOR_ACTIVATION'
     or target.lifecycle_revision <>
       transition_value.successor_prepared_lifecycle_revision
     or generation.generation_status <> 'PREPARED'
     or input->>'expected_runtime_generation_id' is distinct from
       generation.runtime_generation_id::text
     or input->>'expected_annual_authority_generation_id' is distinct from
       generation.authority_generation_id::text
     or input->>'expected_annual_admission_generation_id' is distinct from
       generation.admission_generation_id::text then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_ANNUAL_SCORING_CLOSE_REVISION_CONFLICT';
  end if;
  close_response :=
    production_control.close_annual_scoring_predecessor_v1(
      input, pointer.tournament_id
    );
  update production_control.annual_scoring_transitions_v1 set
    transition_status = 'CLOSING',
    predecessor_closure_id = (close_response->>'closure_id')::uuid,
    updated_at = pg_catalog.clock_timestamp()
  where transition_id = transition_value.transition_id
    and transition_status = 'PREPARED';
  if not found then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_ANNUAL_SCORING_CLOSE_REVISION_CONFLICT';
  end if;
  response_value := pg_catalog.jsonb_build_object(
    'ok', true,
    'code', 'PRODUCTION_ANNUAL_SCORING_PREDECESSOR_CLOSING',
    'transitionId', transition_value.transition_id,
    'predecessorTournamentId', pointer.tournament_id,
    'successorTournamentId', target.tournament_id,
    'closureId', close_response->>'closure_id',
    'activeOrUnresolvedLeases',
      coalesce((close_response->>'active_or_unresolved_leases')::integer, 0),
    'pointerChanged', false,
    'predecessorAdmissionStopped', true,
    'predecessorClosed', false,
    'successorActivated', false,
    'idempotent', false
  );
  perform production_control.store_canonical_annual_scoring_receipt_v2(
    'CLOSE', input, response_value, canonical_context
  );
  return response_value;
exception
  when invalid_text_representation or numeric_value_out_of_range
    or no_data_found then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_ANNUAL_SCORING_CLOSE_REVISION_CONFLICT';
end;
$function$
;
revoke all on function production_control.canonical_close_annual_scoring_transition_v2(jsonb,jsonb) from public,anon,authenticated,service_role;

do $source$begin if encode(extensions.digest((select prosrc from pg_proc where oid='public.drain_production_annual_scoring_transition_v1(jsonb)'::regprocedure),'sha256'),'hex')<>'778dec1a9081b3a6b88f022a8a1c5a4f2d761bf610c9bf14c8b788d7386fea24'then raise exception 'CERTIFICATION_ANNUAL_PREDECESSOR_MISMATCH:public.drain_production_annual_scoring_transition_v1';end if;end;$source$;
CREATE OR REPLACE FUNCTION public.drain_production_annual_scoring_transition_v1(input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
 SET lock_timeout TO '5s'
AS $function$
begin
 perform production_control.assert_annual_transition_platform_owner_v1(input);
 return production_control.canonical_drain_annual_scoring_transition_v2(input,jsonb_build_object('resource_class','PRODUCTION','resource_id','BAGGER_INV_PRODUCTION'));
end;$function$;
;
CREATE OR REPLACE FUNCTION production_control.canonical_drain_annual_scoring_transition_v2(input jsonb, canonical_context jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
 SET lock_timeout TO '5s'
AS $function$
declare
  existing jsonb;
  response_value jsonb;
begin
  perform production_control.assert_canonical_annual_transition_context_v2(input,canonical_context);
  existing := production_control.lookup_canonical_annual_scoring_receipt_v2(
    'DRAIN', input, canonical_context
  );
  if existing is not null then return existing; end if;
  perform pg_catalog.pg_advisory_xact_lock(
    production_control.scoring_admission_lock_key()
  );
  existing := production_control.lookup_canonical_annual_scoring_receipt_v2(
    'DRAIN', input, canonical_context
  );
  if existing is not null then return existing; end if;
  response_value := production_control.advance_annual_scoring_transition_v1(
    (input->>'transition_id')::uuid, input
  );
  perform production_control.store_canonical_annual_scoring_receipt_v2(
    'DRAIN', input, response_value, canonical_context
  );
  return response_value;
exception
  when invalid_text_representation or numeric_value_out_of_range
    or no_data_found then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_ANNUAL_SCORING_DRAIN_REVISION_CONFLICT';
end;
$function$
;
revoke all on function production_control.canonical_drain_annual_scoring_transition_v2(jsonb,jsonb) from public,anon,authenticated,service_role;

do $source$begin if encode(extensions.digest((select prosrc from pg_proc where oid='public.activate_production_annual_scoring_transition_v1(jsonb)'::regprocedure),'sha256'),'hex')<>'3eaa7db248ab9f24248b78b086772c5ad7b9e63f962594e0e50ef91852990ea2'then raise exception 'CERTIFICATION_ANNUAL_PREDECESSOR_MISMATCH:public.activate_production_annual_scoring_transition_v1';end if;end;$source$;
CREATE OR REPLACE FUNCTION public.activate_production_annual_scoring_transition_v1(input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
 SET lock_timeout TO '5s'
AS $function$
begin
 perform production_control.assert_annual_transition_platform_owner_v1(input);
 return production_control.canonical_activate_annual_scoring_transition_v2(input,jsonb_build_object('resource_class','PRODUCTION','resource_id','BAGGER_INV_PRODUCTION'));
end;$function$;
;
CREATE OR REPLACE FUNCTION production_control.canonical_activate_annual_scoring_transition_v2(input jsonb, canonical_context jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
 SET lock_timeout TO '5s'
AS $function$
declare
  origin_value production_control.certification_initialization_origins_v1%rowtype;
  existing jsonb;
  transition_value production_control.annual_scoring_transitions_v1%rowtype;
  pointer production_control.current_tournament_pointer_v1%rowtype;
  predecessor production_control.future_tournament_catalog_v1%rowtype;
  successor production_control.future_tournament_catalog_v1%rowtype;
  generation production_control.future_annual_runtime_generations_v1%rowtype;
  prior_annual production_control.annual_scoring_runtime_authorities_v1%rowtype;
  certificate jsonb;
  activation production_control.cutover_activation_state%rowtype;
  gate scoring_authority.ingress_gates%rowtype;
  closure production_control.scoring_admission_closures%rowtype;
  legacy_root_id uuid;
  actor_player text := pg_catalog.upper(pg_catalog.btrim(
    input#>>'{authorization,player_id}'
  ));
  actor_auth uuid := (input#>>'{authorization,auth_user_id}')::uuid;
  predecessor_next_revision bigint;
  successor_next_revision bigint;
  certified_writer jsonb;
  response_value jsonb;
begin
  perform production_control.assert_canonical_annual_transition_context_v2(input,canonical_context);
  existing := production_control.lookup_canonical_annual_scoring_receipt_v2(
    'ACTIVATE', input, canonical_context
  );
  if existing is not null then return existing; end if;
  perform pg_catalog.pg_advisory_xact_lock(
    production_control.scoring_admission_lock_key()
  );
  existing := production_control.lookup_canonical_annual_scoring_receipt_v2(
    'ACTIVATE', input, canonical_context
  );
  if existing is not null then return existing; end if;
  select value.* into strict transition_value
  from production_control.annual_scoring_transitions_v1 value
  where value.transition_id = (input->>'transition_id')::uuid
  for update;
  select value.* into strict pointer
  from production_control.current_tournament_pointer_v1 value
  where value.scope_key = canonical_context->>'resource_id' for update;
  select value.* into strict predecessor
  from production_control.future_tournament_catalog_v1 value
  where value.tournament_id = transition_value.predecessor_tournament_id
  for update;
  select value.* into strict successor
  from production_control.future_tournament_catalog_v1 value
  where value.tournament_id = transition_value.successor_tournament_id
  for update;
  select value.* into strict generation
  from production_control.future_annual_runtime_generations_v1 value
  where value.runtime_generation_id = transition_value.runtime_generation_id
  for update;
  if canonical_context->>'resource_class'='PRODUCTION' then
  select value.* into strict activation
  from production_control.cutover_activation_state value
  where value.scope_key = canonical_context->>'resource_id';
  select value.* into strict gate
  from scoring_authority.ingress_gates value
  where value.tournament_id = '2026';
  else
    select * into strict origin_value from production_control.certification_initialization_origins_v1
    where resource_id=canonical_context->>'resource_id';
  end if;
  certificate :=
    production_control.annual_scoring_predecessor_certificate_v1(
      pointer.tournament_id
    );
  select value.* into strict closure
  from production_control.scoring_admission_closures value
  where value.closure_id = transition_value.predecessor_closure_id;
  if pointer.tournament_id <> '2026' then
    select value.* into strict prior_annual
    from production_control.annual_scoring_runtime_authorities_v1 value
    where value.tournament_id = pointer.tournament_id for update;
    legacy_root_id := prior_annual.legacy_root_closure_id;
  else
    legacy_root_id := closure.prior_legacy_closure_id;
  end if;
  if transition_value.transition_status <> 'CLOSED'
     or pointer.tournament_id <> transition_value.predecessor_tournament_id
     or pointer.pointer_revision <> transition_value.expected_pointer_revision
     or input->>'expected_current_tournament_id' is distinct from
       pointer.tournament_id
     or coalesce((input->>'expected_pointer_revision')::bigint, -1)
       <> pointer.pointer_revision
     or predecessor.lifecycle <> 'ACTIVE'
     or predecessor.lifecycle_revision <>
       transition_value.predecessor_lifecycle_revision
     or successor.lifecycle <> 'READY_FOR_ACTIVATION'
     or successor.lifecycle_revision <>
       transition_value.successor_prepared_lifecycle_revision
     or successor.readiness_fingerprint is distinct from
       transition_value.readiness_fingerprint
     or generation.generation_status <> 'PREPARED'
     or generation.pointer_revision <> pointer.pointer_revision + 1
     or generation.authority_generation_id is distinct from
       transition_value.authority_generation_id
     or generation.admission_generation_id is distinct from
       transition_value.admission_generation_id
     or input->>'expected_runtime_generation_id'
       is distinct from generation.runtime_generation_id::text
     or input->>'expected_annual_authority_generation_id'
       is distinct from generation.authority_generation_id::text
     or input->>'expected_annual_admission_generation_id'
       is distinct from generation.admission_generation_id::text
     or coalesce((certificate->>'certified')::boolean, false) is not true
     or certificate->>'closureId'
       is distinct from transition_value.predecessor_closure_id::text
     or certificate->>'fingerprint'
       is distinct from transition_value.predecessor_boundary_fingerprint
     or exists (
       select 1 from production_control.future_annual_runtime_generations_v1
       where generation_status = 'ACTIVE'
         and tournament_id <> pointer.tournament_id
     ) then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_ANNUAL_SCORING_PRECOMMIT_ABORTED',
      detail = coalesce((certificate->'blockers')::text, '[]');
  end if;
  perform production_control.assert_future_scoring_runtime_capability_v1(
    successor.tournament_id, generation.runtime_generation_id,
    generation.authority_generation_id, generation.admission_generation_id
  );


  if pg_catalog.to_regprocedure(
    'production_control.bind_future_participant_identity_runtime_v1(text,uuid,uuid,uuid,text,uuid)'
  ) is null then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ANNUAL_IDENTITY_CAPABILITY_REQUIRED';
  end if;
  execute 'select production_control.bind_future_participant_identity_runtime_v1($1,$2,$3,$4,$5,$6)'
    using successor.tournament_id, generation.runtime_generation_id,
      generation.authority_generation_id, generation.admission_generation_id,
      actor_player, actor_auth;
  predecessor_next_revision := predecessor.lifecycle_revision + 1;
  successor_next_revision := successor.lifecycle_revision + 1;
  update production_control.future_tournament_catalog_v1 set
    lifecycle = 'CLOSED', lifecycle_revision = predecessor_next_revision,
    updated_by_player_id = actor_player,
    updated_by_auth_user_id = actor_auth,
    updated_at = pg_catalog.clock_timestamp()
  where tournament_id = predecessor.tournament_id
    and lifecycle = 'ACTIVE'
    and lifecycle_revision = predecessor.lifecycle_revision;
  if not found then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_ANNUAL_SCORING_POINTER_CAS_FAILED';
  end if;
  if predecessor.tournament_id <> '2026' then
    update production_control.future_annual_runtime_generations_v1 set
      generation_status = 'CLOSED',
      closed_by_player_id = actor_player,
      closed_at = pg_catalog.clock_timestamp(),
      runtime_revision = runtime_revision + 1,
      updated_at = pg_catalog.clock_timestamp()
    where tournament_id = predecessor.tournament_id
      and generation_status = 'ACTIVE';
    if not found then
      raise exception using errcode = '40001',
        message = 'PRODUCTION_ANNUAL_SCORING_POINTER_CAS_FAILED';
    end if;
  end if;
  update production_control.future_tournament_catalog_v1 set
    lifecycle = 'ACTIVE', lifecycle_revision = successor_next_revision,
    updated_by_player_id = actor_player,
    updated_by_auth_user_id = actor_auth,
    updated_at = pg_catalog.clock_timestamp()
  where tournament_id = successor.tournament_id
    and lifecycle = 'READY_FOR_ACTIVATION'
    and lifecycle_revision = successor.lifecycle_revision;
  if not found then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_ANNUAL_SCORING_POINTER_CAS_FAILED';
  end if;
  update production_control.current_tournament_pointer_v1 set
    tournament_id = successor.tournament_id,
    tournament_year = successor.tournament_year,
    pointer_revision = pointer.pointer_revision + 1,
    lifecycle_revision = successor_next_revision,
    updated_by_player_id = actor_player,
    updated_by_auth_user_id = actor_auth,
    updated_at = pg_catalog.clock_timestamp()
  where scope_key = canonical_context->>'resource_id'
    and tournament_id = predecessor.tournament_id
    and pointer_revision = transition_value.expected_pointer_revision
    and lifecycle_revision = predecessor.lifecycle_revision;
  if not found then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_ANNUAL_SCORING_POINTER_CAS_FAILED';
  end if;
  update production_control.future_annual_runtime_generations_v1 set
    generation_status = 'ACTIVE',
    pointer_revision = pointer.pointer_revision + 1,
    activated_by_player_id = actor_player,
    activated_by_auth_user_id = actor_auth,
    activated_at = pg_catalog.clock_timestamp(),
    updated_at = pg_catalog.clock_timestamp()
  where runtime_generation_id = generation.runtime_generation_id
    and generation_status = 'PREPARED';
  if not found then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_ANNUAL_SCORING_POINTER_CAS_FAILED';
  end if;
  insert into production_control.annual_scoring_runtime_authorities_v1 (
    resource_class,certification_resource_id,runtime_generation_id, tournament_id, platform_tournament_id,
    platform_authority_generation_id, platform_admission_generation_id,
    pointer_revision, lifecycle_revision, authority_generation_id,
    admission_generation_id, google_writer_generation_id,
    destination_workbook_id, google_target_contract_fingerprint,
    authority_status, admission_state,
    admission_revision, legacy_root_closure_id,
    predecessor_tournament_id, predecessor_closure_id,
    predecessor_boundary_fingerprint, activated_by_player_id,
    activated_by_auth_user_id
  ) values (
    canonical_context->>'resource_class',case when canonical_context->>'resource_class'='CERTIFICATION' then canonical_context->>'resource_id' end,
    generation.runtime_generation_id, successor.tournament_id, '2026',
    case when canonical_context->>'resource_class'='CERTIFICATION' then origin_value.authority_epoch_id else activation.authority_generation_id end,
    case when canonical_context->>'resource_class'='CERTIFICATION' then origin_value.admission_generation_id else gate.admission_generation_id end,
    pointer.pointer_revision + 1, successor_next_revision,
    generation.authority_generation_id, generation.admission_generation_id,
    null, null, null, -- Retired optional destination metadata; never fabricated certification.
    'ACTIVE', 'OPEN', 1, legacy_root_id,
    predecessor.tournament_id, closure.closure_id,
    transition_value.predecessor_boundary_fingerprint,
    actor_player, actor_auth
  );
  update production_control.future_runtime_promotions_v2 set
    runtime_status = 'ACTIVE', updated_at = pg_catalog.clock_timestamp()
  where tournament_id = successor.tournament_id;
  update production_control.annual_scoring_transitions_v1 set
    transition_status = 'COMMITTED',
    committed_at = pg_catalog.clock_timestamp(),
    updated_at = pg_catalog.clock_timestamp()
  where transition_id = transition_value.transition_id
    and transition_status = 'CLOSED';
  if not found then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_ANNUAL_SCORING_POINTER_CAS_FAILED';
  end if;
  if canonical_context->>'resource_class'='CERTIFICATION' then
    perform production_control.install_certification_annual_successor_v1(transition_value.transition_id,canonical_context);
  end if;
  response_value := pg_catalog.jsonb_build_object(
    'ok', true, 'code', 'PRODUCTION_ANNUAL_SCORING_TRANSITION_COMMITTED',
    'transitionId', transition_value.transition_id,
    'predecessorTournamentId', predecessor.tournament_id,
    'successorTournamentId', successor.tournament_id,
    'pointerRevision', pointer.pointer_revision + 1,
    'runtimeGenerationId', generation.runtime_generation_id,
    'authorityGenerationId', generation.authority_generation_id,
    'admissionGenerationId', generation.admission_generation_id,
    'predecessorClosed', true, 'successorActivated', true,
    'pointerChanged', true, 'idempotent', false
  );
  perform production_control.store_canonical_annual_scoring_receipt_v2(
    'ACTIVATE', input, response_value, canonical_context
  );
  return response_value;
exception
  when invalid_text_representation or numeric_value_out_of_range
    or no_data_found then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_ANNUAL_SCORING_PRECOMMIT_ABORTED';
end;
$function$
;
revoke all on function production_control.canonical_activate_annual_scoring_transition_v2(jsonb,jsonb) from public,anon,authenticated,service_role;

do $source$begin if encode(extensions.digest((select prosrc from pg_proc where oid='public.abort_production_annual_scoring_transition_v1(jsonb)'::regprocedure),'sha256'),'hex')<>'a893efccc6bd6022b0f90bcd96262edbfaa81b150a6a59db7be4ccde541b73aa'then raise exception 'CERTIFICATION_ANNUAL_PREDECESSOR_MISMATCH:public.abort_production_annual_scoring_transition_v1';end if;end;$source$;
CREATE OR REPLACE FUNCTION public.abort_production_annual_scoring_transition_v1(input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
 SET lock_timeout TO '5s'
AS $function$
begin
 perform production_control.assert_annual_transition_platform_owner_v1(input);
 return production_control.canonical_abort_annual_scoring_transition_v2(input,jsonb_build_object('resource_class','PRODUCTION','resource_id','BAGGER_INV_PRODUCTION'));
end;$function$;
;
CREATE OR REPLACE FUNCTION production_control.canonical_abort_annual_scoring_transition_v2(input jsonb, canonical_context jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
 SET lock_timeout TO '5s'
AS $function$
declare
  existing jsonb;
  transition_value production_control.annual_scoring_transitions_v1%rowtype;
  pointer production_control.current_tournament_pointer_v1%rowtype;
  target production_control.future_tournament_catalog_v1%rowtype;
  successor_generation
    production_control.future_annual_runtime_generations_v1%rowtype;
  current_generation
    production_control.future_annual_runtime_generations_v1%rowtype;
  activation production_control.cutover_activation_state%rowtype;
  gate scoring_authority.ingress_gates%rowtype;
  annual production_control.annual_scoring_runtime_authorities_v1%rowtype;
  closure production_control.scoring_admission_closures%rowtype;
  legacy_root production_control.scoring_admission_closures%rowtype;
  actor_player text := pg_catalog.upper(pg_catalog.btrim(
    input#>>'{authorization,player_id}'
  ));
  actor_auth uuid := (input#>>'{authorization,auth_user_id}')::uuid;
  next_admission_generation uuid := extensions.gen_random_uuid();
  admission_was_stopped boolean;
  predecessor_was_closed boolean;
  post_close_count integer;
  identity_rebind jsonb;
  side_game_rebind jsonb;
  response_value jsonb;
begin
  perform production_control.assert_canonical_annual_transition_context_v2(input,canonical_context);
  existing := production_control.lookup_canonical_annual_scoring_receipt_v2(
    'ABORT', input, canonical_context
  );
  if existing is not null then return existing; end if;
  perform pg_catalog.pg_advisory_xact_lock(
    production_control.scoring_admission_lock_key()
  );
  existing := production_control.lookup_canonical_annual_scoring_receipt_v2(
    'ABORT', input, canonical_context
  );
  if existing is not null then return existing; end if;
  select value.* into strict transition_value
  from production_control.annual_scoring_transitions_v1 value
  where value.transition_id = (input->>'transition_id')::uuid
  for update;
  select value.* into strict pointer
  from production_control.current_tournament_pointer_v1 value
  where value.scope_key = canonical_context->>'resource_id' for update;
  select value.* into strict target
  from production_control.future_tournament_catalog_v1 value
  where value.tournament_id = transition_value.successor_tournament_id
  for update;
  select value.* into strict successor_generation
  from production_control.future_annual_runtime_generations_v1 value
  where value.runtime_generation_id = transition_value.runtime_generation_id
  for update;
  admission_was_stopped := transition_value.transition_status in (
    'CLOSING', 'CLOSED'
  );
  predecessor_was_closed := transition_value.transition_status = 'CLOSED';
  if transition_value.transition_status not in (
       'PREPARED', 'CLOSING', 'CLOSED'
     )
     or pointer.tournament_id <>
       transition_value.predecessor_tournament_id
     or pointer.pointer_revision <>
       transition_value.expected_pointer_revision
     or input->>'expected_current_tournament_id' is distinct from
       pointer.tournament_id
     or coalesce((input->>'expected_pointer_revision')::bigint, -1)
       <> pointer.pointer_revision
     or target.lifecycle <> 'READY_FOR_ACTIVATION'
     or target.lifecycle_revision <>
       transition_value.successor_prepared_lifecycle_revision
     or successor_generation.generation_status <> 'PREPARED'
     or input->>'expected_runtime_generation_id' is distinct from
       successor_generation.runtime_generation_id::text
     or input->>'expected_annual_authority_generation_id' is distinct from
       successor_generation.authority_generation_id::text
     or input->>'expected_annual_admission_generation_id' is distinct from
       successor_generation.admission_generation_id::text then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_ANNUAL_SCORING_ABORT_NOT_SAFE';
  end if;

  if admission_was_stopped then
    select value.* into strict closure
    from production_control.scoring_admission_closures value
    where value.closure_id = transition_value.predecessor_closure_id
    for update;
    if canonical_context->>'resource_class'='CERTIFICATION' then
      perform production_control.assert_certification_annual_abort_drain_v1(closure.closure_id,canonical_context);
    else
    select pg_catalog.count(*)::integer into post_close_count
    from scoring_authority.scoring_ingress_leases value
    where value.tournament_id = pointer.tournament_id
      and value.admission_generation_id = closure.admission_generation_id
      and value.admission_sequence > closure.lease_high_watermark;
    if production_control.annual_scoring_unresolved_count_v1(
         pointer.tournament_id, closure.admission_generation_id
       ) <> 0
       or post_close_count <> 0 then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_ANNUAL_SCORING_ABORT_DRAIN_REQUIRED';
    end if;

    end if;

    if canonical_context->>'resource_class'='CERTIFICATION' then
      perform production_control.rebind_certification_annual_abort_v1(closure.closure_id,input,next_admission_generation,canonical_context);
    elsif pointer.tournament_id = '2026' then
      select value.* into strict activation
      from production_control.cutover_activation_state value
      where value.scope_key = canonical_context->>'resource_id' for update;
      select value.* into strict gate
      from scoring_authority.ingress_gates value
      where value.tournament_id = '2026' for update;
      select value.* into strict legacy_root
      from production_control.scoring_admission_closures value
      where value.closure_id = closure.prior_legacy_closure_id;
      if coalesce((input->>'expected_platform_activation_revision')::bigint, -1)
           <> activation.activation_revision
         or input->>'expected_platform_authority_generation_id'
           is distinct from activation.authority_generation_id::text
         or input->>'expected_platform_admission_generation_id'
           is distinct from gate.admission_generation_id::text
         or coalesce((input->>'expected_platform_admission_revision')::bigint, -1)
           <> gate.admission_revision
         or activation.state <> 'SCORING_COMMITTED'
         or activation.current_authority <> 'SUPABASE'
         or not activation.scoring_ingress_enabled
         or activation.active_transition_epoch_id is not null
         or gate.state <> 'PAUSED'
         or gate.authority <> 'SUPABASE'
         or gate.admission_state <> 'CLOSED'
         or gate.active_closure_id is distinct from closure.closure_id
         or closure.closure_kind <> 'SUPABASE_INGRESS'
         or closure.authority <> 'SUPABASE'
         or closure.status not in ('CLOSING', 'CLOSED')
         or legacy_root.closure_kind <> 'LEGACY_ADMISSION'
         or legacy_root.status <> 'CONSUMED' then
        raise exception using errcode = '40001',
          message = 'PRODUCTION_ANNUAL_SCORING_ABORT_NOT_SAFE';
      end if;
      update production_control.scoring_admission_closures set
        status = 'REOPENED', reopened_at = pg_catalog.clock_timestamp()
      where closure_id = closure.closure_id;
      update scoring_authority.ingress_gates set
        state = 'OPEN', authority = 'SUPABASE',
        admission_state = 'CLOSED',
        admission_revision = admission_revision + 1,
        active_closure_id = legacy_root.closure_id,
        external_fence_evidence_id = legacy_root.external_fence_evidence_id,
        unresolved_client_queues = 0,
        updated_by = actor_player,
        updated_at = pg_catalog.clock_timestamp()
      where tournament_id = '2026';
      update production_control.cutover_activation_state set
        activation_revision = activation_revision + 1,
        updated_by = actor_player,
        updated_at = pg_catalog.clock_timestamp()
      where scope_key = canonical_context->>'resource_id';
    else
      select value.* into strict annual
      from production_control.annual_scoring_runtime_authorities_v1 value
      where value.tournament_id = pointer.tournament_id for update;
      select value.* into strict current_generation
      from production_control.future_annual_runtime_generations_v1 value
      where value.runtime_generation_id = annual.runtime_generation_id
        and value.generation_status = 'ACTIVE' for update;
      if annual.active_closure_id is distinct from closure.closure_id
         or annual.authority_status not in ('ACTIVE', 'CLOSED')
         or annual.admission_state not in ('CLOSING', 'CLOSED')
         or annual.admission_generation_id is distinct from
           current_generation.admission_generation_id
         or input->>'expected_predecessor_runtime_generation_id'
           is distinct from
           current_generation.runtime_generation_id::text
         or input->>'expected_predecessor_annual_authority_generation_id'
           is distinct from
           annual.authority_generation_id::text
         or input->>'expected_predecessor_annual_admission_generation_id'
           is distinct from
           annual.admission_generation_id::text
         or coalesce(
           (input->>'expected_predecessor_annual_admission_revision')::bigint,
           -1
         )
           <> annual.admission_revision then
        raise exception using errcode = '40001',
          message = 'PRODUCTION_ANNUAL_SCORING_ABORT_NOT_SAFE';
      end if;
      update production_control.future_annual_runtime_generations_v1 set
        admission_generation_id = next_admission_generation,
        runtime_revision = runtime_revision + 1,
        updated_at = pg_catalog.clock_timestamp()
      where runtime_generation_id = current_generation.runtime_generation_id
        and admission_generation_id = annual.admission_generation_id;
      if pg_catalog.to_regprocedure(
        'production_control.rebind_future_participant_identity_admission_generation_v1(text,uuid,uuid,uuid,uuid,bigint)'
      ) is null then
        raise exception using errcode = '55000',
          message = 'PRODUCTION_ANNUAL_IDENTITY_ADMISSION_REBIND_REQUIRED';
      end if;
      execute 'select production_control.rebind_future_participant_identity_admission_generation_v1($1,$2,$3,$4,$5,$6)'
        into identity_rebind
        using pointer.tournament_id, current_generation.runtime_generation_id,
          current_generation.authority_generation_id,
          annual.admission_generation_id, next_admission_generation,
          pointer.pointer_revision;
      update production_control.scoring_admission_closures set
        status = 'REOPENED', reopened_at = pg_catalog.clock_timestamp()
      where closure_id = closure.closure_id;
      update production_control.annual_scoring_runtime_authorities_v1 set
        authority_status = 'ACTIVE', admission_state = 'OPEN',
        admission_generation_id = next_admission_generation,
        admission_revision = admission_revision + 1,
        active_closure_id = null, closed_at = null,
        updated_at = pg_catalog.clock_timestamp()
      where runtime_generation_id = annual.runtime_generation_id;
      if pg_catalog.to_regprocedure(
        'production_control.rebind_annual_side_game_admission_generation_v1(text,uuid,uuid,uuid,uuid,bigint)'
      ) is null then
        raise exception using errcode = '55000',
          message = 'PRODUCTION_ANNUAL_SIDE_GAME_ADMISSION_REBIND_REQUIRED';
      end if;
      execute 'select production_control.rebind_annual_side_game_admission_generation_v1($1,$2,$3,$4,$5,$6)'
        into side_game_rebind
        using pointer.tournament_id, current_generation.runtime_generation_id,
          current_generation.authority_generation_id,
          annual.admission_generation_id, next_admission_generation,
          pointer.pointer_revision;
    end if;
  end if;

  update production_control.future_annual_runtime_generations_v1 set
    generation_status = 'ABORTED',
    closed_by_player_id = actor_player,
    closed_at = pg_catalog.clock_timestamp(),
    runtime_revision = runtime_revision + 1,
    updated_at = pg_catalog.clock_timestamp()
  where runtime_generation_id = transition_value.runtime_generation_id
    and generation_status = 'PREPARED';
  if not found then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_ANNUAL_SCORING_ABORT_NOT_SAFE';
  end if;
  update production_control.future_tournament_catalog_v1 set
    lifecycle = 'CONFIGURING', lifecycle_revision = lifecycle_revision + 1,
    readiness_fingerprint = null, readiness_setup_revision = null,
    updated_by_player_id = actor_player,
    updated_by_auth_user_id = actor_auth,
    updated_at = pg_catalog.clock_timestamp()
  where tournament_id = target.tournament_id
    and lifecycle = 'READY_FOR_ACTIVATION';
  update production_control.future_runtime_promotions_v2 set
    runtime_status = 'PROMOTED', updated_at = pg_catalog.clock_timestamp()
  where tournament_id = target.tournament_id
    and runtime_status = 'READY';
  update production_control.annual_scoring_transitions_v1 set
    transition_status = 'ABORTED', aborted_at = pg_catalog.clock_timestamp(),
    updated_at = pg_catalog.clock_timestamp()
  where transition_id = transition_value.transition_id
    and transition_status in ('PREPARED', 'CLOSING', 'CLOSED');
  if admission_was_stopped and canonical_context->>'resource_class'='CERTIFICATION' then
    perform production_control.install_certification_annual_reopened_generation_v1(closure.closure_id,next_admission_generation,canonical_context);
  end if;
  response_value := pg_catalog.jsonb_build_object(
    'ok', true, 'code', 'PRODUCTION_ANNUAL_SCORING_PRECOMMIT_ABORTED_SAFE',
    'transitionId', transition_value.transition_id,
    'predecessorTournamentId', pointer.tournament_id,
    'successorTournamentId', target.tournament_id,
    'pointerRevision', pointer.pointer_revision,
    'pointerChanged', false, 'predecessorClosed', false,
    'predecessorWasClosed', predecessor_was_closed,
    'successorActivated', false,
    'predecessorAdmissionReopened', admission_was_stopped,
    'requiresExplicitAdmissionRecovery', false,
    'idempotent', false
  );
  perform production_control.store_canonical_annual_scoring_receipt_v2(
    'ABORT', input, response_value, canonical_context
  );
  return response_value;
exception
  when invalid_text_representation or no_data_found then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_ANNUAL_SCORING_ABORT_NOT_SAFE';
end;
$function$
;
revoke all on function production_control.canonical_abort_annual_scoring_transition_v2(jsonb,jsonb) from public,anon,authenticated,service_role;


-- Explicit annual owner boundary. The exclusive fence precedes context row
-- locks; no shared-to-exclusive upgrade is required by concurrent controls.
create function production_control.certification_annual_transition_command_v1(input jsonb,ctx jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare payload jsonb:=input->'payload';r production_control.canonical_resource_v1%rowtype;command jsonb;
begin
 if ctx is distinct from production_control.current_certification_context_v1()
  or ctx->>'phase' is distinct from 'ANNUAL' or jsonb_typeof(payload) is distinct from 'object' then
  raise exception using errcode='42501',message='CERTIFICATION_ANNUAL_CONTEXT_REQUIRED';end if;
 if payload ?| array['authorization','environment','contract_version','resource','deployment','actor_player_id','actor_auth_user_id',
  'project_ref','project_url','source_workbook_id','tournament_id','tournament_year','operation_request_id','operation_id',
  'resource_id','resource_class','installation_id','governance_tournament_id','expected_context_token','request_payload_hash']then
  raise exception using errcode='42501',message='CERTIFICATION_OPERATION_AUTHORITY_FIELD_REJECTED';end if;
 perform production_control.assert_canonical_annual_actor_v2(input,ctx,true);
 select * into strict r from production_control.canonical_resource_v1 where resource_id=ctx->>'resource_id';
 -- Stable logical predecessor is an expected CAS value, not execution authority.
 -- Current authority was independently validated above. This permits exact
 -- receipt replay after successful activation without silently rebinding it.
 if coalesce(payload->>'expected_current_tournament_id','')!~'^20[0-9]{2}$'then
  raise exception using errcode='22023',message='CERTIFICATION_ANNUAL_INPUT_INVALID';end if;
 command:=payload||jsonb_build_object('contract_version','production-future-runtime-activation-v2','environment','CERTIFICATION',
  'project_ref',r.project_ref,'project_url',r.project_url,'source_workbook_id',r.provenance_id,
  'tournament_id',ctx->>'governance_tournament_id','tournament_year',(ctx->>'governance_tournament_id')::integer,
  'authorization',jsonb_build_object('role','DIRECTOR','player_id',ctx#>>'{authorization,player_id}',
   'auth_user_id',ctx#>>'{authorization,auth_user_id}','tournament_id',payload->>'expected_current_tournament_id'),
  'operation_request_id',input->>'operation_request_id');
 return command||jsonb_build_object('request_payload_hash',production_control.future_runtime_hash_v2(command));
end;$$;

create function public.mutate_certification_annual_transition_v1(input jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog set lock_timeout='5s' as $$
declare ctx jsonb;command jsonb;result jsonb;action text:=input->>'operation_id';
begin
 perform production_control.assert_production_service_role();
 if action is null or action not in('ANNUAL.PREPARE','ANNUAL.CLOSE','ANNUAL.DRAIN','ANNUAL.ACTIVATE','ANNUAL.ABORT')then
  raise exception using errcode='42501',message='CERTIFICATION_OPERATION_FORBIDDEN';end if;
 perform pg_advisory_xact_lock(production_control.scoring_admission_lock_key());
 ctx:=production_control.push_certification_context_v1(input,'ANNUAL',true);
 command:=production_control.certification_annual_transition_command_v1(input,ctx);
 case action
 when 'ANNUAL.PREPARE' then result:=production_control.canonical_prepare_annual_scoring_transition_v2(command,ctx);
 when 'ANNUAL.CLOSE' then result:=production_control.canonical_close_annual_scoring_transition_v2(command,ctx);
 when 'ANNUAL.DRAIN' then result:=production_control.canonical_drain_annual_scoring_transition_v2(command,ctx);
 when 'ANNUAL.ACTIVATE' then result:=production_control.canonical_activate_annual_scoring_transition_v2(command,ctx);
 when 'ANNUAL.ABORT' then result:=production_control.canonical_abort_annual_scoring_transition_v2(command,ctx);
 else raise exception using errcode='42501',message='CERTIFICATION_OPERATION_FORBIDDEN';end case;
 perform production_control.pop_certification_context_v1();return result;
end;$$;

create function public.read_certification_annual_transition_v1(input jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog set lock_timeout='5s' as $$
declare ctx jsonb;result jsonb;command jsonb;action text:=input->>'operation_id';
begin
 perform production_control.assert_production_service_role();
 if action is null or action not in('ANNUAL.READINESS','ANNUAL.STATUS')then
  raise exception using errcode='42501',message='CERTIFICATION_OPERATION_FORBIDDEN';end if;
 perform pg_advisory_xact_lock(production_control.scoring_admission_lock_key());
 ctx:=production_control.push_certification_context_v1(input,'ANNUAL',false);
 command:=production_control.certification_annual_transition_command_v1(input,ctx);
 if action='ANNUAL.READINESS' then
  result:=production_control.annual_scoring_transition_readiness_v1(command->>'target_tournament_id');
 else
  if input->>'status_operation' is null or input->>'status_operation' not in('PREPARE','CLOSE','DRAIN','ACTIVATE','ABORT')then
   raise exception using errcode='42501',message='CERTIFICATION_OPERATION_FORBIDDEN';end if;
  result:=production_control.lookup_canonical_annual_scoring_receipt_v2(input->>'status_operation',command,ctx);
  result:=case when result is null then jsonb_build_object('ok',true,'status','UNKNOWN')
   else jsonb_build_object('ok',true,'status','COMMITTED','receipt',result)end;
 end if;
 perform production_control.pop_certification_context_v1();return result;
end;$$;
revoke all on function public.mutate_certification_annual_transition_v1(jsonb),public.read_certification_annual_transition_v1(jsonb)
 from public,anon,authenticated,service_role;
grant execute on function public.mutate_certification_annual_transition_v1(jsonb),public.read_certification_annual_transition_v1(jsonb) to service_role;

-- Restrict only newly introduced private helpers. Existing OIDs, ACLs, owners
-- and execution attributes must survive the resource-aware body replacement.
do $private_acl$
declare function_item record; function_attrs record;
begin
 for function_item in select proc.* from pg_proc proc join pg_namespace n on n.oid=proc.pronamespace
  where n.nspname='production_control' and n.nspname||'.'||proc.proname in('production_control.guard_certification_initialization_evidence_v1','production_control.record_certification_initialization_origin_v1','production_control.capture_certification_initialization_origin_v1','production_control.guard_certification_gate_boundary_mode_v1','production_control.annual_resource_context_v2','production_control.assert_canonical_annual_transition_context_v2','production_control.lookup_canonical_annual_scoring_receipt_v2','production_control.store_canonical_annual_scoring_receipt_v2','production_control.canonical_annual_scope_key_v2','production_control.close_certification_annual_predecessor_v1','production_control.drain_certification_annual_predecessor_v1','production_control.certification_annual_predecessor_certificate_v1','production_control.assert_certification_annual_cached_context_v1','production_control.guard_certification_annual_epoch_v1','production_control.install_certification_annual_successor_v1','production_control.assert_certification_annual_abort_drain_v1','production_control.rebind_certification_annual_abort_v1','production_control.install_certification_annual_reopened_generation_v1','production_control.guard_canonical_annual_row_v1','production_control.guard_canonical_annual_receipt_v1','production_control.future_participant_identity_eligibility_core_v1','production_control.future_participant_identity_eligibility_v1','production_control.bind_future_participant_identity_runtime_v1','production_control.ensure_annual_side_game_runtime_v1','production_control.rebind_future_participant_identity_admission_generation_v1','production_control.rebind_annual_side_game_admission_generation_v1','production_control.assert_certification_historical_identity_v1','production_control.annual_scoring_transition_readiness_v1','production_control.annual_scoring_predecessor_certificate_pre_side_games_v1','production_control.close_annual_scoring_predecessor_pre_derived_workers_v1','production_control.advance_annual_scoring_transition_v1','public.prepare_production_annual_scoring_transition_v1','production_control.canonical_prepare_annual_scoring_transition_v2','public.close_production_annual_scoring_transition_v1','production_control.canonical_close_annual_scoring_transition_v2','public.drain_production_annual_scoring_transition_v1','production_control.canonical_drain_annual_scoring_transition_v2','public.activate_production_annual_scoring_transition_v1','production_control.canonical_activate_annual_scoring_transition_v2','public.abort_production_annual_scoring_transition_v1','production_control.canonical_abort_annual_scoring_transition_v2','production_control.certification_annual_transition_command_v1','public.mutate_certification_annual_transition_v1','public.read_certification_annual_transition_v1')
   and not exists(select 1 from r2_annual138_existing_functions before where before.oid=proc.oid) loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',function_item.oid::regprocedure);
  select * into function_attrs from pg_proc where oid=function_item.oid;
  if function_attrs.proowner<>(select oid from pg_roles where rolname=current_user) or not function_attrs.prosecdef
   or not ('search_path=pg_catalog'=any(coalesce(function_attrs.proconfig,'{}')))
   or exists(select 1 from aclexplode(coalesce(function_attrs.proacl,acldefault('f',function_attrs.proowner)))acl
    where acl.grantee<>function_attrs.proowner and acl.privilege_type='EXECUTE')then
   raise exception 'CERTIFICATION_ANNUAL_PRIVATE_CORE_PRIVILEGE_EXPANDED: %',function_item.oid::regprocedure;end if;
 end loop;
 if exists(select 1 from r2_annual138_existing_functions b left join pg_proc a using(oid)
  where a.oid is null or row(a.pronamespace,a.proname,a.proargtypes,a.proowner,a.proacl,a.prosecdef,a.proconfig,a.provolatile)
   is distinct from row(b.pronamespace,b.proname,b.proargtypes,b.proowner,b.proacl,b.prosecdef,b.proconfig,b.provolatile))then
  raise exception 'CERTIFICATION_ANNUAL_ORIGINAL_FUNCTION_ATTRIBUTES_CHANGED';end if;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))acl
  where n.nspname='public' and p.proname in('mutate_certification_annual_transition_v1','read_certification_annual_transition_v1')
   and acl.grantee not in(p.proowner,(select oid from pg_roles where rolname='service_role')) and acl.privilege_type='EXECUTE')then
  raise exception 'CERTIFICATION_ANNUAL_WRAPPER_PRIVILEGE_EXPANDED';end if;
 if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
  cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner)))acl
  where n.nspname='production_control' and c.relname='certification_initialization_origins_v1'
   and acl.grantee<>c.relowner)then raise exception 'CERTIFICATION_INITIALIZATION_RELATION_PRIVILEGE_EXPANDED';end if;
end;$private_acl$;
notify pgrst,'reload schema';
commit;
