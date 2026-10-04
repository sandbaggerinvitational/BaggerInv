-- Exact fixed Certification owner repair. No DDL, runtime RPC or worker start.
\set ON_ERROR_STOP on
begin;
set local search_path=pg_catalog;
set local lock_timeout='5s';
set local statement_timeout='60s';
DO $guide_repair$
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
 controls_before jsonb;
 controls_after jsonb;
 identity_row jsonb;
 state_hash text;
 request_hash text;
 guide_validation jsonb;
 guide_source jsonb;
 guide_source_text text;
 guide_source_hash text;
 guide_projection_id uuid;
 guide_content_id uuid;
begin
 /*PROVISIONING_GUARDS*/
 select * into strict fixture_receipt from production_control.operation_audit_events
  where event_type='CERTIFICATION_PART2A_FIXTURE_BOOTSTRAPPED' and details->>'resource_id'=r.resource_id;
 if fixture_receipt.event_id is distinct from (input#>>'{fixture_receipt,event_id}')::bigint
  or fixture_receipt.request_fingerprint is distinct from input#>>'{fixture_receipt,request_fingerprint}'
  or fixture_receipt.result<>'SUCCEEDED' or fixture_receipt.actor<>current_user
  or fixture_receipt.details->>'contract'<>'bootstrap-certification-part2a-fixture-v1'
  or fixture_receipt.details->>'package_sha256' is distinct from input#>>'{fixture_receipt,package_sha256}'
  or fixture_receipt.details->>'fixture_state_sha256' is distinct from input#>>'{fixture_receipt,fixture_state_sha256}'
  or fixture_receipt.details->'auth_links' is distinct from input->'identities'
  or fixture_receipt.details#>>'{expected,binding_id}' is distinct from a.binding_id::text
  or fixture_receipt.details#>>'{expected,authority_epoch_id}' is distinct from a.authority_epoch_id::text
  or (select count(*) from scoring_authority.players)<>4
  or (select count(*) from scoring_authority.matches)<>2
  or exists(select 1 from scoring_authority.matches where status<>'UPCOMING'
   or match_id not in('2026-R3-11','2026-R3-12') or match_revision<>case match_id when '2026-R3-12' then 1 else 0 end)
  or exists(select 1 from scoring_authority.scoring_permissions where can_score)
  or (select count(*) from participant_identity.participant_identity_contacts)<>3
  or exists(select 1 from production_control.guide_authoring_drafts_v1)
  or exists(select 1 from production_control.guide_authoring_revisions_v1) then
  raise exception using errcode='42501',message='CERTIFICATION_GUIDE_EXPECTED_FIXTURE_REQUIRED';
 end if;
 for identity_row in select value from jsonb_array_elements(input->'identities') loop
  if not exists(select 1 from participant_identity.user_player_links l
   join participant_identity.participant_identity_contacts c using(player_id)
   join participant_identity.tournament_roles tr on tr.auth_user_id=l.auth_user_id and tr.tournament_id='2026'
   where l.auth_user_id=(identity_row->>'auth_user_id')::uuid and l.player_id=identity_row->>'player_id'
    and l.status='ACTIVE' and c.identity_active and c.tournament_id='2026'
    and c.email=identity_row->>'email' and c.email_normalized=identity_row->>'email'
    and c.configuration_revision=1 and c.verified_by='SYNTHETIC_FIXTURE' and c.verified_at is not null
    and c.source_system='SYNTHETIC_FIXTURE' and c.source_workbook_id=r.provenance_id
    and tr.role=identity_row->>'role' and tr.role_active and tr.revoked_at is null) then
   raise exception using errcode='42501',message='CERTIFICATION_GUIDE_SYNTHETIC_LINK_REQUIRED';
  end if;
 end loop;
 state_hash:=encode(extensions.digest((/*PRESERVED_SNAPSHOT*/)::text,'sha256'),'hex');
 if state_hash is distinct from input->>'fixture_snapshot_sha256' then
  raise exception using errcode='40001',message='CERTIFICATION_GUIDE_PRESERVED_FIXTURE_DRIFT';
 end if;
 request_hash:=encode(extensions.digest(input::text,'sha256'),'hex');
 select * into prior from production_control.operation_audit_events
  where event_type='CERTIFICATION_PART2A_GUIDE_REPAIRED' and details->>'resource_id'=r.resource_id;
 if found then
  if prior.result<>'SUCCEEDED' or prior.request_fingerprint is distinct from request_hash
   or prior.details->>'guide_state_sha256' is distinct from encode(extensions.digest((/*GUIDE_SNAPSHOT*/)::text,'sha256'),'hex') then
   raise exception using errcode='40001',message='CERTIFICATION_GUIDE_REPAIR_CONFLICT';
  end if;
  raise notice 'CERTIFICATION_GUIDE_REPAIR_IDEMPOTENT';return;
 end if;
 /*SYNTHETIC_GUIDE*/
 controls_after:=jsonb_build_object('resource',(select to_jsonb(v) from production_control.canonical_resource_v1 v),
  'admission',(select to_jsonb(v) from production_control.certification_admission_v1 v),'pointer',(select to_jsonb(v) from production_control.current_tournament_pointer_v1 v),
  'gate',(select to_jsonb(v) from scoring_authority.ingress_gates v),'epoch',(select to_jsonb(v) from scoring_authority.authority_epochs v),
  'generation',(select to_jsonb(v) from production_control.certification_ingress_generations_v1 v),
  'origin',(select to_jsonb(v) from production_control.certification_initialization_origins_v1 v),'receipt',(select to_jsonb(v) from production_control.canonical_bootstrap_installation_v1 v));
 if controls_after is distinct from controls_before
  or state_hash is distinct from encode(extensions.digest((/*PRESERVED_SNAPSHOT*/)::text,'sha256'),'hex') then
  raise exception using errcode='55000',message='CERTIFICATION_GUIDE_PRESERVED_STATE_CHANGED';
 end if;
 insert into production_control.operation_audit_events(event_type,domain,tournament_id,actor,request_fingerprint,result,details)
 values('CERTIFICATION_PART2A_GUIDE_REPAIRED','CERTIFICATION_FIXTURE','2026',current_user,request_hash,'SUCCEEDED',
  jsonb_build_object('contract',input->>'contract','operation_id',input->>'operation_id','resource_id',r.resource_id,
   'registration_revision',r.registration_revision,'deployment',input->'deployment','expected',input->'expected',
   'package_sha256',input->>'package_sha256','original_fixture_receipt',input->'fixture_receipt',
   'preserved_fixture_sha256',state_hash,'guide_state_sha256',encode(extensions.digest((/*GUIDE_SNAPSHOT*/)::text,'sha256'),'hex'),
   'rows_created',4,'preserved_rows_modified',0,'enabled',false,'ingress','PAUSED','workers_started',0,'google_calls',0));
end;
$guide_repair$;
commit;
