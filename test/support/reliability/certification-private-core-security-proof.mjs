// Test-only runtime privilege proof for the explicit provisional R2 profile.
// This inventory identifies functions newly introduced relative to frozen130;
// existing private wrappers are captured separately, never blanket-denied.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {sql,sqlResult,jsonLiteral,repositoryRoot} from './postgres17.mjs';
import {certificationProvisionalProfile} from './certification-provisional-profile.mjs';
const newPrivateFunctions=[
 "production_control.assert_legacy_provider_origin_v1",
 "production_control.annual_resource_context_v2",
 "production_control.assert_canonical_annual_actor_v2",
 "production_control.assert_canonical_annual_context_v2",
 "production_control.assert_canonical_annual_transition_context_v2",
 "production_control.assert_canonical_derived_scope_v1",
 "production_control.assert_canonical_financial_worker_context_v1",
 "production_control.assert_canonical_future_authoring_resource_v2",
 "production_control.assert_canonical_future_calcutta_worker_v1",
 "production_control.assert_canonical_future_identity_runtime_v1",
 "production_control.assert_canonical_future_net_skins_worker_v1",
 "production_control.assert_canonical_future_scoring_actor_v1",
 "production_control.assert_canonical_future_scoring_runtime_v1",
 "production_control.assert_canonical_future_worker_runtime_v1",
 "production_control.assert_canonical_odds_job_v1",
 "production_control.assert_canonical_scoring_context_v1",
 "production_control.assert_certification_annual_abort_drain_v1",
 "production_control.assert_certification_annual_cached_context_v1",
 "production_control.assert_certification_context_v1",
 "production_control.assert_certification_current_projection_v1",
 "production_control.assert_certification_historical_identity_v1",
 "production_control.assert_certification_ingress_recovery_actor_v1",
 "production_control.assert_certification_odds_actor_v1",
 "production_control.assert_certification_odds_live_source_v1",
 "production_control.assert_certification_read_v1",
 "production_control.assert_current_certification_future_context_v1",
 "production_control.assert_draft_authoring_resource_v2",
 "production_control.assert_guide_authoring_resource_v2",
 "production_control.assert_prediction_settings_authoring_resource_v2",
 "production_control.canonical_abort_annual_scoring_transition_v2",
 "production_control.canonical_activate_annual_scoring_transition_v2",
 "production_control.canonical_annual_scope_key_v2",
 "production_control.canonical_claim_calcutta_v1_recalculation_core_v2",
 "production_control.canonical_claim_competition_derived_jobs_core_v2",
 "production_control.canonical_claim_intelligence_derived_bundle_core_v2",
 "production_control.canonical_claim_net_skins_v1_recalculation_core_v2",
 "production_control.canonical_close_annual_scoring_transition_v2",
 "production_control.canonical_commit_draft_revision_resource_v2",
 "production_control.canonical_commit_prediction_settings_revision_resource_v2",
 "production_control.canonical_complete_calcutta_v1_recalculation_core_v2",
 "production_control.canonical_complete_net_skins_v1_recalculation_core_v2",
 "production_control.canonical_completed_history_read_v1",
 "production_control.canonical_create_guide_draft_resource_v2",
 "production_control.canonical_current_view_read_v1",
 "production_control.canonical_director_entitlement_read_v1",
 "production_control.canonical_director_financial_operation_v2",
 "production_control.canonical_director_setup_operation_v2",
 "production_control.canonical_draft_read_v1",
 "production_control.canonical_drain_annual_scoring_transition_v2",
 "production_control.canonical_execution_activation_revision_v1",
 "production_control.canonical_execution_resource_id_v1",
 "production_control.canonical_fail_calcutta_v1_recalculation_core_v2",
 "production_control.canonical_fail_intelligence_derived_bundle_v1_core_v2",
 "production_control.canonical_fail_net_skins_v1_recalculation_core_v2",
 "production_control.canonical_fail_score_derived_preclaim_v1_core_v2",
 "production_control.canonical_finalize_match_v2",
 "production_control.canonical_finalized_tournament_projection_v1",
 "production_control.canonical_future_claim_calcutta_recalculation_v1_resource",
 "production_control.canonical_future_claim_competition_derived_jobs_v1_resource",
 "production_control.canonical_future_claim_intelligence_derived_bundle_v1_resource",
 "production_control.canonical_future_claim_net_skins_recalculation_v1_resource",
 "production_control.canonical_future_complete_calcutta_recalculation_v1_resource",
 "production_control.canonical_future_complete_net_skins_recalculation_v1_resource",
 "production_control.canonical_future_director_entitlement_v1",
 "production_control.canonical_future_fail_calcutta_recalculation_v1_resource",
 "production_control.canonical_future_fail_competition_derived_job_v1_resource",
 "production_control.canonical_future_fail_net_skins_recalculation_v1_resource",
 "production_control.canonical_future_finalize_match_v1_resource",
 "production_control.canonical_future_identity_for_auth_v1",
 "production_control.canonical_future_identity_for_player_v1",
 "production_control.canonical_future_mutate_match_control_v1_resource",
 "production_control.canonical_future_read_scoring_authority_v1_resource",
 "production_control.canonical_future_read_scoring_participant_context_v1_resource",
 "production_control.canonical_future_reopen_match_v1_resource",
 "production_control.canonical_future_submit_hole_score_v1_resource",
 "production_control.canonical_future_write_competition_derived_snapshot_v1_resource",
 "production_control.canonical_future_write_intelligence_derived_bundle_v1_resource",
 "production_control.canonical_guide_read_v1",
 "production_control.canonical_identity_for_auth_v1",
 "production_control.canonical_identity_for_player_v1",
 "production_control.canonical_mark_competition_derived_job_failed_core_v2",
 "production_control.canonical_mutate_future_runtime_resource_v2",
 "production_control.canonical_mutate_future_year_administration_v2",
 "production_control.canonical_odds_dispatch_v2",
 "production_control.canonical_odds_inputs_v2",
 "production_control.canonical_player_editorial_read_v1",
 "production_control.canonical_prepare_annual_scoring_transition_v2",
 "production_control.canonical_projection_read_v1",
 "production_control.canonical_publish_guide_draft_resource_v2",
 "production_control.canonical_publish_odds_v2",
 "production_control.canonical_published_odds_projection_v2",
 "production_control.canonical_read_future_year_administration_v2",
 "production_control.canonical_read_scoring_authority_v2",
 "production_control.canonical_read_scoring_participant_context_v2",
 "production_control.canonical_reopen_match_v2",
 "production_control.canonical_requeue_score_derived_delivery_v1_core_v2",
 "production_control.canonical_score_derived_delivery_tick_v1_core_v2",
 "production_control.canonical_stage_draft_revision_resource_v2",
 "production_control.canonical_stage_prediction_settings_revision_resource_v2",
 "production_control.canonical_submit_hole_score_v2",
 "production_control.canonical_validate_draft_revision_resource_v2",
 "production_control.canonical_validate_guide_draft_resource_v2",
 "production_control.canonical_validate_prediction_settings_revision_resource_v2",
 "production_control.canonical_write_competition_derived_snapshot_core_v2",
 "production_control.canonical_write_intelligence_derived_bundle_core_v2",
 "production_control.capture_certification_initialization_origin_v1",
 "production_control.certification_annual_predecessor_certificate_v1",
 "production_control.certification_annual_transition_command_v1",
 "production_control.certification_closed_tournament_read_v1",
 "production_control.certification_closed_history_2026_read_v1",
 "production_control.certification_ingress_canonical_receipt_v1",
 "production_control.certification_ingress_evidence_v1",
 "production_control.certification_ingress_identity_v1",
 "production_control.certification_ingress_lookup_v1",
 "production_control.certification_ingress_recovery_resource_v1",
 "production_control.certification_ingress_request_hash_v1",
 "production_control.certification_ingress_required_v1",
 "production_control.certification_ingress_response_v1",
 "production_control.certification_odds_publication_state_v1",
 "production_control.certification_odds_pairing_structure_fingerprint_v1",
 "production_control.certification_odds_request_hash_v1",
 "production_control.certification_odds_runtime_v1",
 "production_control.certification_operation_phase_v1",
 "production_control.certification_published_odds_read_v1",
 "production_control.certification_successor_current_read_v1",
 "production_control.certification_worker_current_projection_v1",
 "production_control.close_certification_annual_predecessor_v1",
 "production_control.close_certification_ingress_generation_v1",
 "production_control.current_canonical_odds_inputs_v2",
 "production_control.current_canonical_resource_context_v1",
 "production_control.current_certification_context_v1",
 "production_control.dispatch_certification_annual_v1",
 "production_control.dispatch_certification_derived_operation_v1",
 "production_control.dispatch_certification_future_scoring_v1",
 "production_control.dispatch_certification_future_worker_v1",
 "production_control.dispatch_certification_operation_v1",
 "production_control.drain_certification_annual_predecessor_v1",
 "production_control.future_participant_identity_eligibility_core_v1",
 "production_control.guard_canonical_annual_receipt_v1",
 "production_control.guard_canonical_annual_row_v1",
 "production_control.guard_canonical_resource_identity_v1",
 "production_control.guard_certification_annual_epoch_v1",
 "production_control.guard_certification_epoch_v1",
 "production_control.guard_certification_future_resource_v1",
 "production_control.guard_certification_gate_boundary_mode_v1",
 "production_control.guard_certification_ingress_generation_v1",
 "production_control.guard_certification_ingress_lease_v1",
 "production_control.guard_certification_initialization_evidence_v1",
 "production_control.guard_certification_odds_job_v1",
 "production_control.initialize_certification_ingress_v1",
 "production_control.initialize_certification_resource_v1",
 "production_control.install_certification_annual_reopened_generation_v1",
 "production_control.install_certification_annual_successor_v1",
 "production_control.lookup_canonical_annual_scoring_receipt_v2",
 "production_control.lock_certification_odds_source_v1",
 "production_control.mark_certification_read_v1",
 "production_control.pop_certification_context_v1",
 "production_control.production_annual_context_v2",
 "production_control.push_certification_context_v1",
 "production_control.read_certification_future_match_control_v1",
 "production_control.read_certification_score_recovery_v1",
 "production_control.rebind_certification_annual_abort_v1",
 "production_control.rebind_certification_release_v1",
 "production_control.record_certification_initialization_origin_v1",
 "production_control.register_certification_resource_v1",
 "production_control.reopen_certification_ingress_generation_v1",
 "production_control.require_certification_ingress_execution_v1",
 "production_control.set_certification_admission_v1",
 "production_control.store_canonical_annual_scoring_receipt_v2"
];
const newPublicFunctions=[
 "public.admit_certification_operation_v1",
 "public.dispatch_certification_odds_v1",
 "public.execute_certification_operation_v1",
 "public.mark_certification_ingress_unknown_v1",
 "public.mutate_certification_annual_transition_v1",
 "public.mutate_certification_future_authoring_v1",
 "public.mutate_certification_future_year_administration_v1",
 "public.read_certification_annual_transition_v1",
 "public.read_certification_director_recovery_material_v1",
 "public.read_certification_future_year_administration_v1",
 "public.read_certification_ingress_status_v1",
 "public.read_certification_odds_operation_v1",
 "public.read_certification_operation_v1",
 "public.read_certification_projection_v1",
 "public.read_certification_runtime_context_v1",
 "public.resolve_certification_ingress_v1"
];
const sha=value=>createHash('sha256').update(value).digest('hex');

export async function certificationPrivateCoreSecurityProof({cluster,database,
 forwardMigrations=certificationProvisionalProfile,expectedOwner='postgres'}={}){
 assert.deepEqual(forwardMigrations,certificationProvisionalProfile,'Explicit owner-approved131–152 proof profile only');
 const sourceFiles={},definitions=new Map();
 const header=/^\s*create\s+(?:or\s+replace\s+)?function\s+((?:"?\w+"?\.)?"?\w+"?)\s*\(([\s\S]*?)\)\s*returns([\s\S]*?)\bas\s+\$[\w]*\$/gim;
 for(const file of forwardMigrations){
  const body=await readFile(repositoryRoot+'/'+file,'utf8');sourceFiles[file]=sha(body);
  for(const match of body.matchAll(header)){
   const name=match[1].replaceAll('"',''),attributes=match[3];
   const path=/\bset\s+search_path\s*(?:=|to)\s*([^\n]+)/i.exec(attributes);
   // PostgreSQL permits consecutive SET attributes on one header line. The
   // following lock_timeout belongs to its own configuration entry.
   const searchPath=path?.[1].split(/\s+set\s+/i)[0].split(',').map(value=>value.trim().replace(/^['"]|['"]$/g,''));
   definitions.set(name,{source:file,headerSha256:sha(match[0]),securityDefiner:/\bsecurity\s+definer\b/i.test(attributes),searchPath});
  }
 }
 // Owner-approved069 installation-boundary correction adds one private guard.
 // Include its actual runtime privileges rather than relying on schema privacy.
 const providerSource='supabase/production_migrations/202608300069_production_annual_scoring_authority_v1.sql';
 const providerBody=await readFile(repositoryRoot+'/'+providerSource,'utf8');sourceFiles[providerSource]=sha(providerBody);
 const providerHeader=[...providerBody.matchAll(header)].find(match=>match[1]==='production_control.assert_legacy_provider_origin_v1');
 assert.ok(providerHeader,'Approved069 provider-origin guard required');
 definitions.set(providerHeader[1],{source:providerSource,headerSha256:sha(providerHeader[0]),
  securityDefiner:/\bsecurity\s+definer\b/i.test(providerHeader[3]),
  searchPath:/\bset\s+search_path\s*(?:=|to)\s*([^\n]+)/i.exec(providerHeader[3])?.[1].split(',').map(value=>value.trim())});
 //148 derives the new structural helper from the immutable073 header rather
 // than duplicating that function. Capture the actual predecessor attributes;
 // the migration separately proves the exact status-only manifest removal.
 const structuralSource='supabase/production_migrations/202608300073_production_annual_odds_v1.sql';
 const structuralBody=await readFile(repositoryRoot+'/'+structuralSource,'utf8');
 sourceFiles[structuralSource]=sha(structuralBody);
 const predecessor=[...structuralBody.matchAll(header)].find(match=>match[1]==='production_control.annual_odds_pairing_fingerprint_v1');
 assert.ok(predecessor,'Exact structural helper predecessor header required');
 const structuralPath=/\bset\s+search_path\s*(?:=|to)\s*([^\n]+)/i.exec(predecessor[3]);
 definitions.set('production_control.certification_odds_pairing_structure_fingerprint_v1',{
  source:structuralSource,derivedBy:'supabase/production_migrations/202609300148_certification_odds_two_part_freshness_v1.sql',
  headerSha256:sha(predecessor[0]),securityDefiner:/\bsecurity\s+definer\b/i.test(predecessor[3]),
  searchPath:structuralPath?.[1].split(',').map(value=>value.trim().replace(/^['"]|['"]$/g,'')),
 });
 //149 replaces the existing trigger body in place, with original057 owner,
 // ACL and security attributes. It is a retained private guard, not a new core.
 const guardSource='supabase/production_migrations/202608290057_production_odds_publication_authority_v1.sql';
 const guardBody=await readFile(repositoryRoot+'/'+guardSource,'utf8');sourceFiles[guardSource]=sha(guardBody);
 const guardName='production_control.guard_odds_snapshot_immutability';
 const guardHeader=[...guardBody.matchAll(header)].find(match=>match[1]===guardName);
 assert.ok(guardHeader,'Exact immutable snapshot guard predecessor required');
 definitions.set(guardName,{source:guardSource,
  derivedBy:'supabase/production_migrations/202609300149_certification_odds_snapshot_guard_v1.sql',
  headerSha256:sha(guardHeader[0]),securityDefiner:/\bsecurity\s+definer\b/i.test(guardHeader[3]),
  searchPath:/\bset\s+search_path\s*(?:=|to)\s*([^\n]+)/i.exec(guardHeader[3])?.[1].split(',').map(value=>value.trim()),
 });
 const privateSet=new Set(newPrivateFunctions),publicSet=new Set(newPublicFunctions);
 for(const name of[...privateSet,...publicSet])assert.ok(definitions.has(name),'Source-defined function missing: '+name);
 for(const name of['production_control.canonical_director_setup_operation_v2','production_control.canonical_director_financial_operation_v2'])assert.ok(privateSet.has(name));
 const touched=[...definitions.keys()],q=query=>sql(cluster,database,query,{role:''});
 const catalog=JSON.parse(q(`with touched as(select p.*,n.nspname,l.lanname from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace join pg_language l on l.oid=p.prolang
  where n.nspname||'.'||p.proname in(select jsonb_array_elements_text(${jsonLiteral(touched)}))),
  edges as(select d.deptype,(pg_identify_object(d.classid,d.objid,d.objsubid)).type object_type,
   (pg_identify_object(d.classid,d.objid,d.objsubid)).identity object_identity,
   (pg_identify_object(d.refclassid,d.refobjid,d.refobjsubid)).type referenced_type,
   (pg_identify_object(d.refclassid,d.refobjid,d.refobjsubid)).identity referenced_identity
   from pg_depend d where(d.classid='pg_proc'::regclass and d.objid in(select oid from touched))
    or(d.refclassid='pg_proc'::regclass and d.refobjid in(select oid from touched)))
  select jsonb_build_object('functions',(select jsonb_agg(jsonb_build_object(
   'name',p.nspname||'.'||p.proname,'identity',(pg_identify_object('pg_proc'::regclass,p.oid,0)).identity,
   'owner',pg_get_userbyid(p.proowner),'securityDefiner',p.prosecdef,'configuration',p.proconfig,'language',p.lanname,
   'definitionSha256',encode(extensions.digest(pg_get_functiondef(p.oid),'sha256'),'hex'),
   'publicExecute',exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))a where a.grantee=0 and a.privilege_type='EXECUTE'),
   'roleExecute',jsonb_build_object('anon',has_function_privilege('anon',p.oid,'EXECUTE'),
    'authenticated',has_function_privilege('authenticated',p.oid,'EXECUTE'),'service_role',has_function_privilege('service_role',p.oid,'EXECUTE')),
   'acl',p.proacl::text,'call',format('select %I.%I(%s)',p.nspname,p.proname,
    (select coalesce(string_agg('NULL::'||format_type(a.arg,null),','order by a.ordinality),'')from unnest(p.proargtypes::oid[])with ordinality a(arg,ordinality))))
   order by p.nspname,p.proname,p.oid::regprocedure::text)from touched p),
   'dependencies',(select coalesce(jsonb_agg(to_jsonb(e)order by object_identity,referenced_identity,deptype),'[]')from edges e),
   'schemas',(select jsonb_agg(jsonb_build_object('name',n.nspname,'owner',pg_get_userbyid(n.nspowner),
    'publicCreate',exists(select 1 from aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner)))a where a.grantee=0 and a.privilege_type='CREATE'),
    'roleCreate',jsonb_build_object('anon',has_schema_privilege('anon',n.oid,'CREATE'),
     'authenticated',has_schema_privilege('authenticated',n.oid,'CREATE'),'service_role',has_schema_privilege('service_role',n.oid,'CREATE')))
    order by n.nspname)from pg_namespace n where n.nspname in('pg_catalog','production_control','scoring_authority','participant_identity','extensions','auth','public')))`));
 const privateRows=catalog.functions.filter(row=>privateSet.has(row.name));
 for(const name of touched)assert.ok(catalog.functions.some(row=>row.name===name),'Touched source function absent from runtime catalog: '+name);
 assert.equal(privateRows.length,privateSet.size,'One catalog signature per explicit new private function');
 const denialProbes=[];
 // Check privileges before issuing any call: no unexpected privileged body is
 // executed even if a new ACL defect exists. Every later role probe must fail.
 const assertSourceSecurity=row=>{
  const definition=definitions.get(row.name);
  assert.equal(row.owner,expectedOwner,row.identity+' owner');
  assert.equal(row.securityDefiner,definition.securityDefiner,row.identity+' security mode');
  assert.ok(definition.searchPath?.length,row.identity+' explicit source search_path');
  const installed=(row.configuration||[]).find(value=>value.startsWith('search_path='))?.slice(12).split(',').map(value=>value.trim().replace(/^"|"$/g,''));
  assert.deepEqual(installed,definition.searchPath,row.identity+' exact search_path');
  assert.equal(installed[0],'pg_catalog',row.identity+' catalog first');
  for(const schema of installed){
   // Existing identity cores explicitly place pg_temp last. Preserve this
   // safe ordering and prove every earlier named schema is not role-writable.
   if(schema==='pg_temp'){assert.equal(installed.at(-1),'pg_temp',row.identity+' temporary schema last');continue;}
   const namespace=catalog.schemas.find(value=>value.name===schema);assert.ok(namespace,row.identity+' known schema '+schema);
   assert.equal(namespace.publicCreate,false,row.identity+' PUBLIC must not create in '+schema);
   for(const role of['anon','authenticated','service_role'])assert.equal(namespace.roleCreate[role],false,row.identity+' '+role+' must not create in '+schema);
  }
 };
 const retainedGuardRows=catalog.functions.filter(row=>row.name===guardName);
 assert.equal(retainedGuardRows.length,1,'One exact retained immutable guard signature');
 for(const row of [...privateRows,...retainedGuardRows]){
  assertSourceSecurity(row);
  assert.equal(row.publicExecute,false,row.identity+' PUBLIC execute');
  for(const role of['anon','authenticated','service_role'])assert.equal(row.roleExecute[role],false,row.identity+' '+role+' execute');
 }
 for(const row of [...privateRows,...retainedGuardRows])for(const role of['anon','authenticated','service_role']){
  const result=sqlResult(cluster,database,`\\set VERBOSITY verbose\nset role ${role};${row.call};`,{role:''});
  assert.notEqual(result.status,0,row.identity+' must deny '+role);
  assert.match(result.stderr,/ERROR:\s+42501:/,row.identity+' must fail as insufficient privilege for '+role);
  denialProbes.push({identity:row.identity,role,sqlstate:'42501',denied:true});
 }
 const publicRows=catalog.functions.filter(row=>row.name.startsWith('public.'));
 for(const name of publicSet){
  const row=publicRows.find(value=>value.name===name);assert.ok(row,name);
  assert.equal(row.owner,expectedOwner,name+' owner');assert.equal(row.publicExecute,false,name+' PUBLIC');
  assert.deepEqual(row.roleExecute,{anon:false,authenticated:false,service_role:true},name+' explicit wrapper grants');
  assertSourceSecurity(row);
 }
 for(const row of catalog.functions)delete row.call;
 const evidence={status:'PASS',environment:'OWNED_SOCKET_ONLY_POSTGRESQL17_NON_PRODUCTION',
  proofLayers:['SOURCE','POSTGRESQL','SECURITY'],profile:forwardMigrations,sourceFiles,
  inventory:{baseline:'7cec5128409286f5b4a5f3524d4c5488124a7be7',newPrivateFunctions,newPublicFunctions,
   methodology:'Explicit source-defined new-function inventory; prior130 private wrappers are not assumed to be new or denied'},
  counts:{newPrivateFunctions:privateRows.length,retainedPrivateGuardsAsserted:retainedGuardRows.length,newPublicWrappers:publicSet.size,touchedPublicWrappers:publicRows.length,actualDeniedCalls:denialProbes.length},
  retainedPrivateFunctionsCapturedWithoutBlanketGrantAssumption:catalog.functions.filter(row=>!privateSet.has(row.name)&&!row.name.startsWith('public.')).map(row=>row.identity),
  functions:catalog.functions,dependencies:catalog.dependencies,schemas:catalog.schemas,denialProbes,
  sourceDefinitions:Object.fromEntries([...definitions]),
  limitations:['Semantic pg_depend identities omit installation-specific numeric OIDs',
   'PostgreSQL does not track every textual PL/pgSQL nested call in pg_depend; behavioral admitted nested-call proof remains separate',
   'No positive hosted or Production authority is inferred; this is owner/ACL/search_path/security and actual role-denial proof',
   'Legacy private functions are captured but their preexisting ACLs are not blanket-overridden by this test']};
 const directory=repositoryRoot+'/docs/reliability/phase2d-resource-model/implementation-evidence';
 await mkdir(directory,{recursive:true});await writeFile(directory+'/bootstrap-private-core-security.json',JSON.stringify(evidence,null,2)+'\n');
 return evidence;
}
