-- Fixed synthetic owner-approved contact provenance, not external OTP verification.
-- Membership and the exact confirmed Auth/link/identifier facts already exist.
 contact_fingerprint:=encode(extensions.digest(jsonb_build_object(
  'contract','certification-part2a-synthetic-contacts-v1','resource_id',r.resource_id,
  'tournament_id','2026','identities',input->'identities')::text,'sha256'),'hex');
 insert into participant_identity.identity_context_revisions
  (tournament_id,context_revision,configuration_fingerprint,updated_by)
 values('2026',1,contact_fingerprint,'SYNTHETIC_FIXTURE');
 insert into participant_identity.identity_config_import_runs
  (tournament_id,source_system,source_workbook_id,source_fingerprint,configuration_revision,status,
   roster_count,received_count,valid_count,missing_count,validation_report,requested_by,approved_by,approved_at)
 values('2026','SYNTHETIC_FIXTURE',r.provenance_id,contact_fingerprint,1,'APPROVED',4,3,3,1,
  jsonb_build_object('contract','certification-part2a-synthetic-contacts-v1','resource_class','CERTIFICATION',
   'resource_id',r.resource_id,'synthetic',true,'verification','OWNER_APPROVED_SYNTHETIC_EXISTING_CONFIRMED_AUTH',
   'external_verification_performed',false,'messages_sent',0,'unlinked_opponent','P24'),
  current_user,'SYNTHETIC_FIXTURE',clock_timestamp());
 for identity_row in select value from jsonb_array_elements(input->'identities') loop
  insert into participant_identity.participant_identity_contacts
   (tournament_id,player_id,email,email_normalized,identity_active,configuration_revision,
    verified_by,verified_at,source_system,source_workbook_id,source_updated_at)
  values('2026',identity_row->>'player_id',identity_row->>'email',identity_row->>'email',true,1,
   'SYNTHETIC_FIXTURE',clock_timestamp(),'SYNTHETIC_FIXTURE',r.provenance_id,clock_timestamp());
 end loop;
 insert into participant_identity.identity_audit_events
  (event_type,tournament_id,actor_name,request_id,configuration_revision,safe_metadata)
 values('CERTIFICATION_PART2A_SYNTHETIC_CONTACTS_PROVISIONED','2026',current_user,
  input->>'operation_id',1,jsonb_build_object('resource_class','CERTIFICATION','resource_id',r.resource_id,
   'operation_contract',input->>'contract','contact_count',3,'configuration_fingerprint',contact_fingerprint,
   'verification','OWNER_APPROVED_SYNTHETIC_EXISTING_CONFIRMED_AUTH',
   'external_verification_performed',false,'messages_sent',0));
