-- Fixed owner-only Certification repair. No persistent function, DDL or client API.
\set ON_ERROR_STOP on
begin;
set local search_path=pg_catalog;
set local lock_timeout='5s';
set local statement_timeout='60s';
DO $certification_fixture_repair$
declare
 input jsonb:=/*OWNER_REQUEST*/;
 r production_control.canonical_resource_v1%rowtype;
 a production_control.certification_admission_v1%rowtype;
 p production_control.current_tournament_pointer_v1%rowtype;
 g scoring_authority.ingress_gates%rowtype;
 epoch scoring_authority.authority_epochs%rowtype;
 gen production_control.certification_ingress_generations_v1%rowtype;
 origin production_control.certification_initialization_origins_v1%rowtype;
 installed production_control.canonical_bootstrap_installation_v1%rowtype;
 prior production_control.operation_audit_events%rowtype;
 fixture_receipt production_control.operation_audit_events%rowtype;
 request_hash text;
 controls_before jsonb;
 controls_after jsonb;
 state_hash text;
 legacy_state_hash text;
 contact_fingerprint text;
 identity_row jsonb;
begin
 /*PROVISIONING_GUARDS*/
 select * into strict fixture_receipt from production_control.operation_audit_events
  where event_type='CERTIFICATION_PART2A_FIXTURE_BOOTSTRAPPED' and details->>'resource_id'=r.resource_id;
 legacy_state_hash:=encode(extensions.digest((/*LEGACY_FIXTURE_SNAPSHOT*/)::text,'sha256'),'hex');
 if fixture_receipt.event_id is distinct from (input#>>'{fixture_receipt,event_id}')::bigint
  or fixture_receipt.request_fingerprint is distinct from input#>>'{fixture_receipt,request_fingerprint}'
  or fixture_receipt.result<>'SUCCEEDED' or fixture_receipt.actor<>current_user
  or fixture_receipt.details->>'contract' is distinct from 'bootstrap-certification-part2a-fixture-v1'
  or fixture_receipt.details->>'operation_id' is distinct from 'certification-part2a-initial-fixture'
  or fixture_receipt.details->>'package_sha256' is distinct from /*LEGACY_PACKAGE_SHA256*/
  or fixture_receipt.details->>'package_sha256' is distinct from input#>>'{fixture_receipt,package_sha256}'
  or fixture_receipt.details->>'fixture_state_sha256' is distinct from input#>>'{fixture_receipt,fixture_state_sha256}'
  or legacy_state_hash is distinct from fixture_receipt.details->>'fixture_state_sha256'
  or fixture_receipt.details->'auth_links' is distinct from input->'identities'
  or (fixture_receipt.details->>'registration_revision')::bigint is distinct from r.registration_revision
  or fixture_receipt.details#>>'{expected,binding_id}' is distinct from a.binding_id::text
  or fixture_receipt.details#>>'{expected,authority_epoch_id}' is distinct from a.authority_epoch_id::text
  or (select count(*) from participant_identity.user_player_links)<>3
  or (select count(*) from participant_identity.participant_auth_identifiers)<>3
  or (select count(*) from participant_identity.tournament_roles)<>3
  or (select count(*) from production_control.director_entitlements)<>1
  or (select count(*) from scoring_authority.players)<>4
  or (select count(*) from scoring_authority.matches)<>2
  or exists(select 1 from scoring_authority.matches where status<>'UPCOMING' or match_revision<>0)
  or exists(select 1 from scoring_authority.scoring_permissions where can_score) then
  raise exception using errcode='42501',message='CERTIFICATION_CONTACT_REPAIR_EXPECTED_FIXTURE_REQUIRED';
 end if;
 for identity_row in select value from jsonb_array_elements(input->'identities') loop
  if not exists(select 1 from participant_identity.user_player_links l
   join participant_identity.participant_auth_identifiers n on n.auth_user_id=l.auth_user_id and n.player_id=l.player_id
   join scoring_authority.tournament_players m on m.player_id=l.player_id and m.tournament_id='2026'
   join participant_identity.tournament_roles role_value on role_value.auth_user_id=l.auth_user_id and role_value.tournament_id='2026'
   where l.auth_user_id=(identity_row->>'auth_user_id')::uuid and l.player_id=identity_row->>'player_id'
    and l.status='ACTIVE' and l.email_identity_hash=encode(extensions.digest(identity_row->>'email','sha256'),'hex')
    and n.identifier_type='EMAIL' and n.status='VERIFIED' and n.verified_at is not null
    and n.normalized_value_private=identity_row->>'email' and n.verification_source='SYNTHETIC_FIXTURE'
    and m.participation_status='ACTIVE' and role_value.role=identity_row->>'role'
    and role_value.role_active and role_value.revoked_at is null) then
   raise exception using errcode='42501',message='CERTIFICATION_CONTACT_REPAIR_SYNTHETIC_LINK_REQUIRED';
  end if;
 end loop;
 request_hash:=encode(extensions.digest(input::text,'sha256'),'hex');
 select * into prior from production_control.operation_audit_events
  where event_type='CERTIFICATION_PART2A_IDENTITY_CONTACTS_REPAIRED' and details->>'resource_id'=r.resource_id;
 if found then
  state_hash:=encode(extensions.digest((/*CONTACT_STATE_SNAPSHOT*/)::text,'sha256'),'hex');
  if prior.request_fingerprint is distinct from request_hash or prior.result<>'SUCCEEDED'
   or prior.details->>'contact_state_sha256' is distinct from state_hash then
   raise exception using errcode='40001',message='CERTIFICATION_CONTACT_REPAIR_CONFLICT';
  end if;
  raise notice 'CERTIFICATION_CONTACT_REPAIR_IDEMPOTENT';
  return;
 end if;
 if /*CONTACT_STATE_PRESENT*/ then
  raise exception using errcode='40001',message='CERTIFICATION_CONTACT_REPAIR_UNEXPECTED_CONTACT_STATE';
 end if;
 /*IDENTITY_CONTACTS*/
 controls_after:=jsonb_build_object('resource',(select to_jsonb(v) from production_control.canonical_resource_v1 v),
  'admission',(select to_jsonb(v) from production_control.certification_admission_v1 v),'pointer',(select to_jsonb(v) from production_control.current_tournament_pointer_v1 v),
  'gate',(select to_jsonb(v) from scoring_authority.ingress_gates v),'epoch',(select to_jsonb(v) from scoring_authority.authority_epochs v),
  'generation',(select to_jsonb(v) from production_control.certification_ingress_generations_v1 v),
  'origin',(select to_jsonb(v) from production_control.certification_initialization_origins_v1 v),'receipt',(select to_jsonb(v) from production_control.canonical_bootstrap_installation_v1 v));
 if controls_after is distinct from controls_before
  or legacy_state_hash is distinct from encode(extensions.digest((/*LEGACY_FIXTURE_SNAPSHOT*/)::text,'sha256'),'hex') then
  raise exception using errcode='55000',message='CERTIFICATION_CONTACT_REPAIR_PRESERVED_STATE_CHANGED';
 end if;
 state_hash:=encode(extensions.digest((/*CONTACT_STATE_SNAPSHOT*/)::text,'sha256'),'hex');
 insert into production_control.operation_audit_events(event_type,domain,tournament_id,actor,request_fingerprint,result,details)
 values('CERTIFICATION_PART2A_IDENTITY_CONTACTS_REPAIRED','CERTIFICATION_FIXTURE','2026',current_user,request_hash,'SUCCEEDED',
  jsonb_build_object('contract',input->>'contract','operation_id',input->>'operation_id','resource_id',r.resource_id,
   'registration_revision',r.registration_revision,'deployment',input->'deployment','expected',input->'expected',
   'package_sha256',input->>'package_sha256','original_fixture_receipt',input->'fixture_receipt',
   'contact_state_sha256',state_hash,'configuration_fingerprint',contact_fingerprint,
   'contacts_created',3,'preserved_rows_modified',0,'enabled',false,'ingress','PAUSED','messages_sent',0));
end;
$certification_fixture_repair$;
commit;
