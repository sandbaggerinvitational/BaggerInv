import { randomUUID } from "node:crypto";
import { jsonLiteral, sql } from "./postgres17.mjs";

export const syntheticActor = Object.freeze({
  playerId: "P12",
  authUserId: "10000000-0000-4000-8000-000000000012",
  email: "golfer12@synthetic.invalid",
});

export const syntheticDirector = Object.freeze({
  playerId: "P01",
  authUserId: "10000000-0000-4000-8000-000000000001",
  email: "director01@synthetic.invalid",
});

export const syntheticRuntime = Object.freeze({
  deploymentId: "dpl_ReliabilityFixture139",
  deploymentCommit: "7".repeat(40),
  capabilityContract: "production-maintenance-single-deployment-capability-v1",
  capabilityCeiling: "OBSERVATION",
  projectRef: "ymqhhtxaywtqllynrmxe",
  projectUrl: "https://ymqhhtxaywtqllynrmxe.supabase.co",
  sourceWorkbookId: "1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4",
});

export function runtimeScope(overrides = {}) {
  return {
    environment: "PRODUCTION",
    project_ref: syntheticRuntime.projectRef,
    project_url: syntheticRuntime.projectUrl,
    source_workbook_id: syntheticRuntime.sourceWorkbookId,
    tournament_id: "2026",
    expected_tournament_id: "2026",
    deployment_id: syntheticRuntime.deploymentId,
    deployment_commit: syntheticRuntime.deploymentCommit,
    deployment_capability_contract: syntheticRuntime.capabilityContract,
    deployment_capability_ceiling: syntheticRuntime.capabilityCeiling,
    expected_epoch_id: "30000000-0000-4000-8000-000000000001",
    expected_activation_revision: 139,
    vercel_project_id: "prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU",
    vercel_team_id: "team_kPw5zaib8uaQJALAwj4fWI6R",
    vercel_environment: "production",
    player_id: syntheticActor.playerId,
    actor_id: "reliability-fixture",
    authorization: {
      tournament_id: "2026",
      match_id: "2026-R3-12",
      player_id: syntheticActor.playerId,
      auth_user_id: syntheticActor.authUserId,
      role: "PLAYER",
      permission_revision: 1,
    },
    ...overrides,
  };
}

export function scoreInput(overrides = {}) {
  return runtimeScope({
    match_id: "2026-R3-12",
    hole_number: 1,
    mutation_key: randomUUID(),
    expected_match_revision: 0,
    expected_hole_revision: 0,
    team_1_gross_scores: [4],
    team_2_gross_scores: [5],
    ...overrides,
  });
}

export function seedSyntheticTournament(cluster, database) {
  sql(cluster, database, `
    set session_replication_role=replica;

    update production_control.cutover_activation_state set
      state='SCORING_COMMITTED', current_authority='SUPABASE',
      read_cutover_phase='OBSERVATION', scoring_ingress_enabled=true,
      boundary_mode='MAINTENANCE_WINDOW_V1', activation_revision=139,
      authority_generation_id='30000000-0000-4000-8000-000000000001',
      expected_deployment_commit='${syntheticRuntime.deploymentCommit}',
      expected_vercel_project_id='prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU',
      active_transition_epoch_id=null,
      maintenance_state='NORMAL',
      first_supabase_write_possible_at=now(),
      first_supabase_write_observed_at=now(),
      first_supabase_mutation_key='synthetic-baseline',
      first_supabase_match_id='2026-R1-1',
      first_supabase_match_revision=18;
    update production_control.resource_scope set
      scoring_authority='SUPABASE', current_tournament_read_authority='SUPABASE',
      participant_identity_authority='SUPABASE',
      public_supabase_reads_enabled=true, scoring_ingress_enabled=true,
      current_tournament_id='2026', current_tournament_year=2026;
    update scoring_authority.tournaments set scoring_authority='SUPABASE'
      where tournament_id='2026';
    update scoring_authority.ingress_gates set
      state='OPEN', authority='SUPABASE',
      active_epoch_id='30000000-0000-4000-8000-000000000001',
      admission_state='OPEN', admission_revision=139,
      admission_protocol_enforced=false, admission_enforced_at=null,
      admission_opened_at=null, admission_deployment_id=null,
      legacy_lease_set_fingerprint=null;
    update production_control.maintenance_deployment_capability_bindings set
      epoch_id='30000000-0000-4000-8000-000000000001',
      deployment_id='${syntheticRuntime.deploymentId}',
      deployment_commit='${syntheticRuntime.deploymentCommit}',
      capability_manifest='{}'::jsonb,
      capability_fingerprint=encode(extensions.digest('{}'::jsonb::text,'sha256'),'hex');
    update production_control.annual_scoring_platform_certifications_v1 set
      project_ref='${syntheticRuntime.projectRef}',
      project_url='${syntheticRuntime.projectUrl}',
      source_workbook_id='${syntheticRuntime.sourceWorkbookId}',
      authority_generation_id='30000000-0000-4000-8000-000000000001',
      admission_generation_id=(select admission_generation_id from scoring_authority.ingress_gates where tournament_id='2026'),
      deployment_id='${syntheticRuntime.deploymentId}',
      deployment_commit='${syntheticRuntime.deploymentCommit}',
      capability_contract='${syntheticRuntime.capabilityContract}',
      capability_ceiling='${syntheticRuntime.capabilityCeiling}',
      resource_fingerprint=production_control.future_runtime_hash_v2(
        jsonb_build_object(
          'environment','PRODUCTION','scopeKey','BAGGER_INV_PRODUCTION',
          'projectRef','${syntheticRuntime.projectRef}',
          'projectUrl','${syntheticRuntime.projectUrl}',
          'sourceWorkbookId','${syntheticRuntime.sourceWorkbookId}',
          'platformTournamentId','2026'
        )
      );
    update production_control.annual_scoring_platform_certifications_v1 c set
      certification_fingerprint=production_control.future_runtime_hash_v2(
        jsonb_build_object(
          'contractVersion',c.contract_version,
          'resourceFingerprint',c.resource_fingerprint,
          'authorityGenerationId',c.authority_generation_id,
          'admissionGenerationId',c.admission_generation_id,
          'deploymentId',c.deployment_id,
          'deploymentCommit',c.deployment_commit,
          'capabilityContract',c.capability_contract,
          'capabilityCeiling',c.capability_ceiling
        )
      );
    -- Hosted admission and maintenance capability proofs depend on provider
    -- evidence that a local test must not forge. Keep the exact RPC/query and
    -- trigger bodies, but substitute two narrow local-only boundary assertions.
    -- The benchmark manifest records both substitutions.
    create or replace function production_control.assert_production_scoring_runtime(
      input jsonb, required_worker text default null
    ) returns void language plpgsql security definer
    set search_path=pg_catalog as $$begin
      if current_setting('request.jwt.claim.role',true)<>'service_role'
         or input->>'environment' is distinct from 'PRODUCTION'
         or input->>'tournament_id' is distinct from '2026'
         or input->>'deployment_id' is distinct from '${syntheticRuntime.deploymentId}'
         or input->>'deployment_commit' is distinct from '${syntheticRuntime.deploymentCommit}'
         or required_worker is not null then
        raise exception 'RELIABILITY_LOCAL_RUNTIME_SCOPE_DENIED';
      end if;
    end$$;
    create or replace function production_control.assert_production_cutover_read_scope(
      input jsonb, required_phase text
    ) returns production_control.resource_scope language plpgsql security definer
    set search_path=pg_catalog,production_control as $$declare
      resource production_control.resource_scope%rowtype;
    begin
      if current_setting('request.jwt.claim.role',true)<>'service_role'
         or input->>'environment' is distinct from 'PRODUCTION'
         or input->>'tournament_id' is distinct from '2026'
         or input->>'project_ref' is distinct from '${syntheticRuntime.projectRef}'
         or input->>'project_url' is distinct from '${syntheticRuntime.projectUrl}'
         or input->>'source_workbook_id' is distinct from '${syntheticRuntime.sourceWorkbookId}'
         or required_phase not in ('OBSERVATION','CURRENT_READS','READ_CUTOVER') then
        raise exception 'RELIABILITY_LOCAL_READ_SCOPE_DENIED';
      end if;
      select value.* into strict resource from production_control.resource_scope value
      where value.scope_key='BAGGER_INV_PRODUCTION';
      return resource;
    end$$;

    insert into auth.users(id,email,email_confirmed_at)
    values
      ('${syntheticActor.authUserId}','${syntheticActor.email}',now()),
      ('${syntheticDirector.authUserId}','${syntheticDirector.email}',now());
    insert into scoring_authority.players(player_id,display_name)
    select 'P'||lpad(n::text,2,'0'),'Synthetic Golfer '||lpad(n::text,2,'0')
    from generate_series(1,24)n;
    insert into scoring_authority.teams(tournament_id,team_id,team_side,name)
    values('2026','T1',1,'Synthetic Team One'),('2026','T2',2,'Synthetic Team Two');
    insert into scoring_authority.rounds(
      tournament_id,round_number,format,name,handicap_allowance
    ) values('2026',1,'BB','Best Ball',0.9),('2026',2,'SC','Scramble',1),
      ('2026',3,'SI','Singles',1);

    insert into scoring_authority.handicap_revisions(
      revision_id,tournament_id,revision_number,status,effective_date,method,
      canonical_fingerprint,roster_fingerprint,predecessor_revision,
      context_contract_version,created_by,approved_by,approved_at
    ) values(
      '10000000-0000-4000-8000-000000000001','2026',7,'APPROVED',
      '2026-09-23','SYNTHETIC RELIABILITY FIXTURE',repeat('a',64),repeat('b',64),0,
      'production-handicap-context-v1','reliability-fixture','P01',now()
    );
    insert into scoring_authority.handicap_revision_entries(
      revision_id,tournament_id,player_id,tournament_handicap
    ) select '10000000-0000-4000-8000-000000000001','2026',
      'P'||lpad(n::text,2,'0'),(n-12)::numeric/2
    from generate_series(1,24)n;
    insert into scoring_authority.handicap_revision_current(
      tournament_id,revision_id,revision_number
    ) values('2026','10000000-0000-4000-8000-000000000001',7);
    insert into scoring_authority.tournament_players(
      tournament_id,player_id,team_id,team_side,participation_status,
      source_roster_key,tournament_handicap,handicap_revision_id
    ) select '2026',player_id,case when player_id<'P13' then 'T1' else 'T2' end,
      case when player_id<'P13' then 1 else 2 end,'ACTIVE','synthetic:'||player_id,
      tournament_handicap,revision_id
    from scoring_authority.handicap_revision_entries where tournament_id='2026';

    with match_seed as (
      select r round_number,n match_number,
        '2026-R'||r||'-'||n match_id,
        case r when 1 then 'BB' when 2 then 'SC' else 'SI' end format
      from generate_series(1,3)r
      cross join lateral generate_series(1,case when r=3 then 12 else 6 end)n
    )
    insert into scoring_authority.scoring_snapshots(
      snapshot_id,tournament_id,match_id,snapshot_revision,scoring_rules_version,
      format,handicap_allowance,course_id,tee,rating,slope,par,
      match_netting_baseline,hole_definitions,participant_configuration,
      team_configuration,canonical_hash,handicap_revision_id
    ) select match_id||':S1','2026',match_id,1,'synthetic-reliability-v1',format,
      case when format='BB' then 0.9 else 1 end,'C'||round_number,'Tournament',
      72,120,72,'synthetic',
      (select jsonb_agg(jsonb_build_object('hole_number',h,'par',4,
        'stroke_index',h,'yardage',400)
        order by h) from generate_series(1,18)h),
      '{}','{}',encode(extensions.digest(match_id||':S1','sha256'),'hex'),
      '10000000-0000-4000-8000-000000000001'
    from match_seed;
    with match_seed as (
      select r round_number,n match_number,'2026-R'||r||'-'||n match_id,
        case r when 1 then 'BB' when 2 then 'SC' else 'SI' end format
      from generate_series(1,3)r
      cross join lateral generate_series(1,case when r=3 then 12 else 6 end)n
    )
    insert into scoring_authority.matches(
      match_id,tournament_id,round_number,format,scoring_snapshot_id,status
    ) select match_id,'2026',round_number,format,match_id||':S1','UPCOMING'
    from match_seed;

    insert into scoring_authority.match_participants(
      match_id,player_id,team_side,player_slot,tournament_handicap,handicap_index,
      course_handicap,playing_handicap,final_strokes,handicap_revision_id
    )
    select m.match_id,
      case when side=1 then 'P'||lpad((case when m.round_number=3 then match_number
        else 2*match_number+slot-2 end)::text,2,'0')
      else 'P'||lpad((12+case when m.round_number=3 then match_number
        else 2*match_number+slot-2 end)::text,2,'0') end,
      side,slot,0,0,0,0,0,'10000000-0000-4000-8000-000000000001'
    from (
      select value.*,split_part(match_id,'-',3)::integer match_number
      from scoring_authority.matches value where tournament_id='2026'
    )m cross join generate_series(1,2)side
    cross join lateral generate_series(1,case when m.round_number=3 then 1 else 2 end)slot;

    insert into scoring_authority.tournament_setup_course_tees_v1(
      tournament_id,course_id,tee_id,display_name,rating,slope,par,
      setup_revision,updated_by_player_id
    ) select '2026','C'||r,'Tournament','Synthetic Course '||r,72,120,72,1,'P01'
      from generate_series(1,3)r;
    insert into scoring_authority.tournament_setup_course_holes_v1
    select '2026','C'||r,'Tournament',h,4,h,400,1
      from generate_series(1,3)r cross join generate_series(1,18)h;
    insert into scoring_authority.tournament_setup_round_courses_v1(
      tournament_id,round_number,course_id,tee_id,setup_revision,updated_by_player_id
    ) select '2026',r,'C'||r,'Tournament',1,'P01' from generate_series(1,3)r;
    insert into scoring_authority.tournament_setup_match_details_v1(
      match_id,tournament_id,round_number,match_number,course_id,tee_id,
      setup_revision,prepared_setup_revision,prepared_configuration_fingerprint,
      updated_by_player_id
    ) select match_id,'2026',round_number,split_part(match_id,'-',3)::integer,
      'C'||round_number,'Tournament',1,1,repeat('d',64),'P01'
      from scoring_authority.matches where tournament_id='2026';
    insert into production_control.tournament_setup_context_v1(
      tournament_id,contract_version,revision,updated_by_player_id,
      updated_by_auth_user_id
    ) values('2026','production-tournament-setup-v1',1,'P01','${syntheticActor.authUserId}');

    do $$declare m record;ctx jsonb;p jsonb;begin
      for m in select * from scoring_authority.matches where tournament_id='2026' loop
        ctx:=production_control.handicap_v1_match_context(
          m.match_id,'10000000-0000-4000-8000-000000000001');
        update scoring_authority.scoring_snapshots set
          participant_configuration=ctx->'participant_configuration',
          team_configuration=ctx->'team_configuration'
        where snapshot_id=m.scoring_snapshot_id;
        for p in select value from jsonb_array_elements(ctx->'participants') loop
          update scoring_authority.match_participants set
            tournament_handicap=(p->>'tournament_handicap')::numeric,
            handicap_index=(p->>'handicap_index')::numeric,
            course_handicap=(p->>'course_handicap')::numeric,
            playing_handicap=(p->>'playing_handicap')::numeric,
            final_strokes=(p->>'final_strokes')::integer
          where match_id=m.match_id and player_id=p->>'player_id';
        end loop;
      end loop;
    end$$;
    insert into scoring_authority.match_holes(
      match_id,hole_number,snapshot_id,stroke_index,par,yardage
    ) select match_id,h,scoring_snapshot_id,h,4,400
      from scoring_authority.matches cross join generate_series(1,18)h
      where tournament_id='2026';
    insert into scoring_authority.scoring_permissions(
      match_id,player_id,can_score,permission_revision,revoked_at,updated_at
    ) select match_id,player_id,
      match_id='2026-R3-12' and player_id='${syntheticActor.playerId}',1,
      case when match_id='2026-R3-12' and player_id='${syntheticActor.playerId}'
        then null else now() end,now()
      from scoring_authority.match_participants;

    insert into participant_identity.user_player_links(
      auth_user_id,player_id,status,link_method,email_identity_hash
    ) values('${syntheticActor.authUserId}','${syntheticActor.playerId}',
      'ACTIVE','SYNTHETIC_FIXTURE',repeat('1',64));
    insert into participant_identity.participant_auth_identifiers(
      player_id,auth_user_id,identifier_type,normalized_value_private,status,
      verified_at,verification_source,source_system,created_by,updated_by
    ) values('${syntheticActor.playerId}','${syntheticActor.authUserId}','EMAIL',
      '${syntheticActor.email}','VERIFIED',now(),'SYNTHETIC_FIXTURE',
      'SYNTHETIC_FIXTURE','reliability-fixture','reliability-fixture');
    insert into participant_identity.tournament_roles(
      tournament_id,auth_user_id,role,granted_by
    ) values('2026','${syntheticActor.authUserId}','PARTICIPANT','reliability-fixture');
    insert into participant_identity.user_player_links(
      auth_user_id,player_id,status,link_method,email_identity_hash
    ) values('${syntheticDirector.authUserId}','${syntheticDirector.playerId}',
      'ACTIVE','SYNTHETIC_FIXTURE',repeat('2',64));
    insert into participant_identity.participant_auth_identifiers(
      player_id,auth_user_id,identifier_type,normalized_value_private,status,
      verified_at,verification_source,source_system,created_by,updated_by
    ) values('${syntheticDirector.playerId}','${syntheticDirector.authUserId}','EMAIL',
      '${syntheticDirector.email}','VERIFIED',now(),'SYNTHETIC_FIXTURE',
      'SYNTHETIC_FIXTURE','reliability-fixture','reliability-fixture');
    insert into participant_identity.tournament_roles(
      tournament_id,auth_user_id,role,granted_by
    ) values('2026','${syntheticDirector.authUserId}','DIRECTOR','reliability-fixture');
    insert into production_control.director_entitlements(
      auth_user_id,tournament_id,player_id,role,granted_by
    ) values('${syntheticDirector.authUserId}','2026','${syntheticDirector.playerId}',
      'DIRECTOR','reliability-fixture');

    with scored as (
      select m.*,h from scoring_authority.matches m cross join generate_series(1,18)h
      where m.round_number in(1,2) or (m.round_number=3 and split_part(m.match_id,'-',3)::integer<=9)
      union all
      select m.*,h from scoring_authority.matches m cross join generate_series(1,2)h
      where m.match_id='2026-R3-10'
    )
    insert into scoring_authority.hole_scores(
      match_id,hole_number,hole_revision,team_1_gross_scores,team_2_gross_scores,
      team_1_strokes,team_2_strokes,team_1_net_score,team_2_net_score,
      hole_winner,mutation_key,actor_id
    ) select match_id,h,1,
      case when format='BB' then '[4,5]'::jsonb else '[4]'::jsonb end,
      case when format='BB' then '[5,6]'::jsonb else '[5]'::jsonb end,
      case when format='BB' then '[0,0]'::jsonb else '[0]'::jsonb end,
      case when format='BB' then '[0,0]'::jsonb else '[0]'::jsonb end,
      4,5,'Team 1','synthetic:'||match_id||':'||h,'reliability-fixture'
    from scored;
    update scoring_authority.matches set status='FINAL',scoring_locked=true,
      match_revision=18,scored_holes=18,current_hole=18,holes_remaining=0,
      running_result='Synthetic Final',result_winner='Team 1',
      scorecard_complete=true,finalized_at=now()
    where round_number in(1,2) or (round_number=3 and split_part(match_id,'-',3)::integer<=9);
    update scoring_authority.matches set status='LIVE',match_revision=2,
      scored_holes=2,current_hole=2,holes_remaining=16,running_result='Synthetic Live'
    where match_id='2026-R3-10';
    update scoring_authority.matches set status='LIVE',scoring_locked=false
    where match_id in('2026-R3-11','2026-R3-12');

    with history as (
      select h.*,row_number() over(order by match_id,hole_number) n
      from scoring_authority.hole_scores h limit 327
    )
    insert into scoring_authority.score_mutations(
      match_id,mutation_key,mutation_type,hole_number,payload_hash,
      previous_match_revision,next_match_revision,previous_hole_revision,
      next_hole_revision,result,actor_id
    ) select match_id,'history:'||n,'HOLE_SCORE',hole_number,
      encode(extensions.digest('history:'||n,'sha256'),'hex'),n-1,n,0,1,
      jsonb_build_object('ok',true,'synthetic',true),'reliability-fixture'
    from history;
    with history as (
      select h.*,row_number() over(order by match_id,hole_number) n
      from scoring_authority.hole_scores h limit 327
    )
    insert into scoring_authority.score_revision_history(
      match_id,hole_number,mutation_key,action,previous_match_revision,
      next_match_revision,previous_hole_revision,next_hole_revision,
      before_state,after_state,actor_id
    ) select match_id,hole_number,'history:'||n,'HOLE_SCORE_UPSERTED',
      n-1,n,0,1,'{}',jsonb_build_object('synthetic',true),'reliability-fixture'
    from history;
    with history as (
      select h.*,row_number() over(partition by match_id order by hole_number) revision,
        row_number() over(order by match_id,hole_number) n
      from scoring_authority.hole_scores h limit 285
    )
    insert into scoring_authority.google_outbox_events(
      id,tournament_id,match_id,match_revision,hole_number,hole_revision,
      mutation_key,event_type,payload,payload_hash,status,delivered_at
    ) select md5('outbox:'||n)::uuid,'2026',match_id,revision,hole_number,1,
      'outbox:'||n,'HOLE_SCORE_UPSERTED',jsonb_build_object('synthetic',true),
      encode(extensions.digest('outbox:'||n,'sha256'),'hex'),'DELIVERED',now()
    from history;

    insert into production_control.tournament_setup_operation_receipts_v1(
      receipt_id,tournament_id,action,operation_request_id,
      declared_request_payload_hash,database_request_payload_hash,
      actor_player_id,actor_auth_user_id,prior_revision,next_revision,response
    ) select md5('setup-receipt:'||n)::uuid,'2026','PREPARE_SCORING_CONTEXT',
      md5('setup-operation:'||n)::uuid,
      encode(extensions.digest('declared:'||n,'sha256'),'hex'),
      encode(extensions.digest('database:'||n,'sha256'),'hex'),
      'P01','${syntheticActor.authUserId}',n-1,n,
      jsonb_build_object('ok',true,'synthetic',true)
    from generate_series(1,48)n;
    insert into production_control.tournament_setup_audit_events_v1(
      event_id,tournament_id,action,target_kind,target_id,actor_player_id,
      actor_auth_user_id,operation_request_id,prior_revision,next_revision,
      result,safe_metadata
    ) select md5('setup-audit:'||n)::uuid,'2026','PREPARE_SCORING_CONTEXT',
      'SCORING_CONTEXT','synthetic:'||n,'P01','${syntheticActor.authUserId}',
      md5('setup-operation:'||n)::uuid,n-1,n,'CHANGED',
      jsonb_build_object('synthetic',true)
    from generate_series(1,48)n;

    insert into scoring_authority.game_center_presentations(
      match_id,tournament_id,match_sort_order,display_match_number,
      source_workbook_id,source_payload_hash,imported_by
    ) select match_id,'2026',row_number() over(order by round_number,match_id),
      match_id,'synthetic-local-only',
      encode(extensions.digest(match_id,'sha256'),'hex'),'reliability-fixture'
    from scoring_authority.matches;
    set session_replication_role=origin;
  `, { role: "" });
}

export function invokeScore(cluster, database, input = scoreInput()) {
  return JSON.parse(sql(cluster, database,
    `select public.submit_production_hole_score(${jsonLiteral(input)})::text;`));
}
