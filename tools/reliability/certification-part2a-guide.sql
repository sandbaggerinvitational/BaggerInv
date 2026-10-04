-- Inline owner provisioning fragment. Publication is synthetic, not a Google
-- import, Director publication receipt, annual certificate or runtime grant.
 if /*GUIDE_PRESENT*/ then
  raise exception using errcode='40001',message='CERTIFICATION_GUIDE_EXISTING_STATE_CONFLICT';
 end if;
 if (select count(*) from scoring_authority.rounds)<>1
  or not exists(select 1 from scoring_authority.rounds where tournament_id='2026' and round_number=3 and format='SI')
  or (select count(*) from scoring_authority.tournament_setup_course_tees_v1)<>1
  or not exists(select 1 from scoring_authority.tournament_setup_course_tees_v1 where tournament_id='2026'
   and course_id='C3' and tee_id='Tournament' and rating=72 and slope=120 and par=72
   and display_name=/*GUIDE_COURSE_NAME*/)
  or (select count(*) from scoring_authority.tournament_setup_round_courses_v1)<>1
  or not exists(select 1 from scoring_authority.tournament_setup_round_courses_v1 where tournament_id='2026'
   and round_number=3 and course_id='C3' and tee_id='Tournament')
  or (select count(*) from scoring_authority.tournament_setup_course_holes_v1)<>18
  or exists(select 1 from scoring_authority.tournament_setup_course_holes_v1 where tournament_id<>'2026'
   or course_id<>'C3' or tee_id<>'Tournament' or par<>4 or stroke_index<>hole_number or yardage<>400)
  or not scoring_authority.guide_course_context_is_eligible(production_control.guide_canonical_course_context_v1('2026')) then
  raise exception using errcode='42501',message='CERTIFICATION_GUIDE_SYNTHETIC_COURSE_REQUIRED';
 end if;
 guide_validation:=production_control.validate_guide_authoring_v1('2026',2026,
  /*GUIDE_AUTHORING*/,/*GUIDE_PROJECTION*/,/*GUIDE_AUTHORING_HASH*/,/*GUIDE_CONTENT_HASH*/,/*GUIDE_PAYLOAD_HASH*/);
 if (guide_validation->>'pass')::boolean is not true then
  raise exception using errcode='55000',message='CERTIFICATION_GUIDE_VALIDATION_FAILED',detail=guide_validation::text;
 end if;
 guide_source:=jsonb_build_object('tournamentId','2026','source',jsonb_build_object(
  'authoringAuthority','SYNTHETIC_FIXTURE','publicationAuthority','CERTIFICATION_OWNER',
  'contract',input->>'contract','package_sha256',input->>'package_sha256',
  'resource_id',r.resource_id,'provenance_id',r.provenance_id,'deployment',input->'deployment',
  'canonical_reference_fingerprint',production_control.guide_canonical_reference_fingerprint_v1('2026'),
  'sourceTabs',production_control.guide_authoring_source_tabs_v1()));
 guide_source_text:=production_control.guide_authoring_canonical_json_v1(guide_source);
 guide_source_hash:=encode(extensions.digest(guide_source_text,'sha256'),'hex');
 insert into production_control.projection_revisions(domain,tournament_id,tournament_year,revision_number,
  project_ref,project_url,source_workbook_id,source_tabs,contract_version,source_fingerprint,payload_fingerprint,
  source_payload,projection_payload,validation_status,validation_diagnostics,imported_by)
 values('GUIDE','2026',2026,1,r.project_ref,r.project_url,r.provenance_id,
  production_control.guide_authoring_source_tabs_v1(),'guide-projection-v1',guide_source_hash,
  guide_validation->>'projectionPayloadHash',guide_source,guide_validation->'projectionPayload','VALID',
  (guide_validation->'diagnostics')||jsonb_build_object('authoringAuthority','SYNTHETIC_FIXTURE',
   'publicationAuthority','CERTIFICATION_OWNER'),current_user) returning revision_id into guide_projection_id;
 insert into production_control.projection_current(domain,tournament_id,revision_id,advanced_by)
 values('GUIDE','2026',guide_projection_id,current_user);
 insert into scoring_authority.guide_content_revisions(tournament_id,projection_revision,source_workbook_id,
  content_fingerprint,source_workbook_fingerprint,payload_hash,source_canonical_json,content_canonical_json,
  payload_canonical_json,content_payload,validation_status,source_metadata,source_sync_sequence,trigger_type,imported_by)
 values('2026',1,r.provenance_id,guide_validation->>'contentFingerprint',guide_source_hash,
  guide_validation->>'projectionPayloadHash',guide_source_text,
  production_control.guide_authoring_canonical_json_v1(guide_validation->'projectionPayload'->'content'),
  production_control.guide_authoring_canonical_json_v1(guide_validation->'projectionPayload'),
  guide_validation->'projectionPayload','VALID',guide_source->'source',1,'MANUAL',current_user)
 returning revision_id into guide_content_id;
 insert into scoring_authority.guide_projection_current(tournament_id,source_workbook_id,revision_id,publication_sequence,source_sync_sequence)
 values('2026',r.provenance_id,guide_content_id,1,1);
 insert into production_control.operation_audit_events(event_type,domain,tournament_id,actor,request_fingerprint,result,details)
 values('CERTIFICATION_PART2A_SYNTHETIC_GUIDE_PUBLISHED','GUIDE','2026',current_user,
  production_control.guide_authoring_hash_v1(guide_source),'SUCCEEDED',guide_source->'source'||jsonb_build_object(
   'production_projection_revision_id',guide_projection_id,'guide_content_revision_id',guide_content_id,
   'publication_sequence',1,'source_fingerprint',guide_source_hash,'payload_fingerprint',guide_validation->>'projectionPayloadHash',
   'content_fingerprint',guide_validation->>'contentFingerprint','enabled',false,'ingress','PAUSED','google_calls',0));
