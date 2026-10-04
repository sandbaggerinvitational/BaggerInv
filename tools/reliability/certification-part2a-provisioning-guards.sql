-- Shared exact owner/resource/disabled-context guards; rendered into both fixed packages.
 -- Invoker authority, not a SECURITY DEFINER bridge or JWT impersonation.
 if current_user<>pg_get_userbyid((select relowner from pg_class where oid='production_control.canonical_resource_v1'::regclass))
  or session_user<>current_user
  or coalesce(current_setting('request.jwt.claim.role',true),'') not in('','postgres') then
  raise exception using errcode='42501',message='CERTIFICATION_FIXTURE_OWNER_REQUIRED';
 end if;
 if input->>'contract' is distinct from /*APPROVED_CONTRACT*/
  or input->>'operation_id' is distinct from /*APPROVED_OPERATION*/
  or input->'resource' is distinct from /*APPROVED_REGISTRATION*/
  or input->'identities' is distinct from /*APPROVED_IDENTITIES*/ then
  raise exception using errcode='42501',message='CERTIFICATION_FIXTURE_APPROVED_REQUEST_REQUIRED';
 end if;
 perform pg_advisory_xact_lock(hashtextextended('canonical-resource-registration-v1',0));
 perform pg_advisory_xact_lock(production_control.scoring_admission_lock_key());
 perform pg_advisory_xact_lock(hashtextextended('production-tournament-setup-v1:2026',0));
 lock table production_control.canonical_resource_v1,production_control.certification_admission_v1,
  production_control.current_tournament_pointer_v1,scoring_authority.ingress_gates,
  scoring_authority.authority_epochs,production_control.certification_ingress_generations_v1,
  production_control.certification_initialization_origins_v1,
  production_control.certification_ingress_leases_v1,production_control.certification_ingress_execution_v1,
  production_control.operation_audit_events,auth.users,/*LOCK_FIXTURE_TABLES*/
  in share row exclusive mode nowait;
 select * into strict r from production_control.canonical_resource_v1 where singleton;
 if r.resource_class<>'CERTIFICATION' or r.database_name<>current_database()
  or r.resource_id is distinct from input#>>'{resource,resource_id}'
  or r.installation_id::text is distinct from input#>>'{resource,installation_id}'
  or r.project_ref is distinct from input#>>'{resource,project_ref}'
  or r.project_url is distinct from input#>>'{resource,project_url}'
  or r.registration_revision is distinct from (input#>>'{resource,registration_revision}')::bigint
  or r.schema_contract is distinct from input#>>'{resource,schema_contract}'
  or r.schema_digest is distinct from input#>>'{resource,schema_digest}'
  or r.manifest_digest is distinct from input->>'registration_manifest_digest'
  or r.vercel_team_id is distinct from input#>>'{deployment,vercel_team_id}'
  or r.vercel_project_id is distinct from input#>>'{deployment,vercel_project_id}'
  or r.provenance_id is distinct from 'urn:bagger:synthetic:'||r.installation_id::text
  or exists(select 1 from production_control.resource_scope)
  or exists(select 1 from production_control.cutover_activation_state) then
  raise exception using errcode='42501',message='CERTIFICATION_FIXTURE_RESOURCE_DENIED';
 end if;
 select * into strict installed from production_control.canonical_bootstrap_installation_v1;
 select * into strict origin from production_control.certification_initialization_origins_v1 where resource_id=r.resource_id;
 if installed.contract_version<>'bagger-canonical-bootstrap-v1'
  or installed.manifest_sha256 is distinct from input->>'installed_manifest_sha256'
  or installed.schema_sha256 is distinct from input->>'installed_schema_sha256'
  or installed.static_data_sha256 is distinct from input->>'installed_static_sha256'
  or origin.resource_class<>'CERTIFICATION' or origin.origin_kind<>'CERTIFICATION_INITIALIZATION'
  or origin.installation_id<>r.installation_id or origin.database_name<>current_database()
  or origin.project_ref<>r.project_ref or origin.project_url<>r.project_url
  or origin.registration_revision<>r.registration_revision
  or origin.registration_manifest_digest<>r.manifest_digest
  or origin.installation_manifest_digest<>installed.manifest_sha256
  or origin.schema_digest<>installed.schema_sha256 or origin.static_data_digest<>installed.static_data_sha256 then
  raise exception using errcode='42501',message='CERTIFICATION_FIXTURE_INSTALLATION_DENIED';
 end if;
 select * into strict a from production_control.certification_admission_v1 where resource_id=r.resource_id;
 select * into strict p from production_control.current_tournament_pointer_v1 where scope_key=r.resource_id;
 select * into strict g from scoring_authority.ingress_gates where tournament_id=p.tournament_id;
 select * into strict epoch from scoring_authority.authority_epochs where epoch_id=g.active_epoch_id;
 select * into strict gen from production_control.certification_ingress_generations_v1
  where resource_id=r.resource_id and generation_id=(input#>>'{expected,generation_id}')::uuid;
 if a.resource_class<>'CERTIFICATION' or a.enabled or a.deployment_class<>'preview'
  or a.binding_id is distinct from (input#>>'{expected,binding_id}')::uuid
  or a.activation_revision is distinct from (input#>>'{expected,activation_revision}')::bigint
  or a.admission_revision is distinct from (input#>>'{expected,admission_revision}')::bigint
  or a.authority_epoch_id is distinct from (input#>>'{expected,authority_epoch_id}')::uuid
  or a.release_commit is distinct from input#>>'{deployment,release_commit}'
  or a.deployment_id is distinct from input#>>'{deployment,deployment_id}'
  or a.deployment_origin is distinct from input#>>'{deployment,deployment_origin}'
  or a.git_branch is distinct from input#>>'{deployment,git_branch}'
  or a.governance_tournament_id<>'2026' or a.authority_epoch_id<>origin.authority_epoch_id
  or a.binding_id<>origin.binding_id
  or not a.capabilities @> array['READS','DIRECTOR','SCORING']::text[]
  or p.tournament_id<>'2026' or p.tournament_year<>2026
  or p.pointer_revision is distinct from (input#>>'{expected,pointer_revision}')::bigint
  or g.state<>'PAUSED' or g.authority<>'SUPABASE' or g.unresolved_client_queues<>0
  or g.active_epoch_id<>a.authority_epoch_id or g.boundary_mode<>'CERTIFICATION_INGRESS_V1'
  or epoch.status<>'COMMITTED' or epoch.epoch_type<>'CERTIFICATION_INITIALIZATION'
  or epoch.boundary_mode<>'CERTIFICATION_INGRESS_V1' or epoch.tournament_id<>'2026'
  or epoch.authority_before<>'SUPABASE' or epoch.authority_after<>'SUPABASE'
  or gen.state<>'OPEN' or gen.authority_epoch_id<>a.authority_epoch_id
  or gen.tournament_id<>'2026' or gen.pointer_revision<>p.pointer_revision
  or gen.revision is distinct from (input#>>'{expected,generation_revision}')::bigint
  or (select count(*) from production_control.certification_ingress_generations_v1)<>1
  or exists(select 1 from production_control.certification_ingress_leases_v1)
  or exists(select 1 from production_control.certification_ingress_execution_v1)
  or exists(select 1 from scoring_authority.scoring_ingress_leases)
  or exists(select 1 from scoring_authority.hole_scores)
  or exists(select 1 from scoring_authority.score_mutations)
  or exists(select 1 from scoring_authority.score_derived_intents_v1)
  or exists(select 1 from scoring_authority.competition_recalculation_jobs)
  or exists(select 1 from scoring_authority.net_skins_v1_recalculation_jobs)
  or exists(select 1 from scoring_authority.calcutta_v1_recalculation_jobs)
  or exists(select 1 from scoring_authority.odds_calculation_jobs)
  or exists(select 1 from scoring_authority.odds_published_snapshots)
  or (select count(*) from scoring_authority.tournaments)<>1
  or not exists(select 1 from scoring_authority.tournaments where tournament_id='2026'
   and tournament_year=2026 and scoring_authority='SUPABASE' and source_workbook_id=r.provenance_id) then
  raise exception using errcode='42501',message='CERTIFICATION_FIXTURE_DISABLED_BOUND_CONTEXT_REQUIRED';
 end if;
 controls_before:=jsonb_build_object('resource',to_jsonb(r),'admission',to_jsonb(a),'pointer',to_jsonb(p),
  'gate',to_jsonb(g),'epoch',to_jsonb(epoch),'generation',to_jsonb(gen),'origin',to_jsonb(origin),'receipt',to_jsonb(installed));
 if (select count(*) from auth.users)<>3 then
  raise exception using errcode='42501',message='CERTIFICATION_FIXTURE_SYNTHETIC_AUTH_REQUIRED';
 end if;
 for identity_row in select value from jsonb_array_elements(input->'identities') loop
  if not exists(select 1 from auth.users u where u.id=(identity_row->>'auth_user_id')::uuid
   and u.email=identity_row->>'email' and u.email_confirmed_at is not null and u.phone is null
   and coalesce(to_jsonb(u)->>'role','authenticated')='authenticated') then
   raise exception using errcode='42501',message='CERTIFICATION_FIXTURE_SYNTHETIC_AUTH_REQUIRED';
  end if;
 end loop;
