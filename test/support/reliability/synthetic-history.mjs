import assert from "node:assert/strict";
import { sql } from "./postgres17.mjs";
import { syntheticActor } from "./synthetic-tournament.mjs";

export const retainedIncidentCounts = Object.freeze({
  tournamentPlayers: 24,
  matches: 24,
  matchParticipants: 72,
  courseHoles: 54,
  matchHoles: 432,
  holeScores: 380,
  scoreMutations: 327,
  scoreRevisionHistory: 327,
  googleOutboxEvents: 285,
  setupReceipts: 48,
  setupAuditEvents: 48,
  normalReleaseRebindings: 137,
  calcuttaConfigurationRevisions: 2,
  calcuttaAuctionRevisions: 37,
  calcuttaPublicationRevisions: 41,
  calcuttaJobs: 745,
  calcuttaResults: 407,
  netSkinsConfigurationRevisions: 3,
  netSkinsJobs: 569,
  netSkinsResults: 2,
  oddsInputConfigurations: 2,
  oddsJobs: 10,
  oddsPublishedSnapshots: 7,
});

export const supportedScaleFactors = Object.freeze([1, 2, 5, 10]);

export function targetCounts(scale) {
  assert.ok(supportedScaleFactors.includes(scale), `unsupported history scale ${scale}`);
  const constant = new Set([
    "tournamentPlayers", "matches", "matchParticipants", "courseHoles",
    "matchHoles", "holeScores",
  ]);
  return Object.fromEntries(Object.entries(retainedIncidentCounts).map(
    ([name, count]) => [name, constant.has(name) ? count : count * scale],
  ));
}

export function syntheticHistorySql(scale) {
  const counts = targetCounts(scale);
  return `
    set session_replication_role=replica;
    delete from scoring_authority.calcutta_v1_current;
    delete from scoring_authority.calcutta_v1_result_revisions;
    delete from scoring_authority.calcutta_v1_recalculation_jobs;
    delete from scoring_authority.calcutta_v1_publication_revisions;
    delete from scoring_authority.calcutta_v1_auction_fact_revisions;
    delete from scoring_authority.calcutta_v1_configuration_revisions;

    insert into scoring_authority.calcutta_v1_configuration_revisions(
      configuration_revision_id,tournament_id,configuration_revision,
      contract_version,state,configuration_manifest,configuration_fingerprint,
      resource_fingerprint,activation_revision,configured_by_player_id,
      configured_by_auth_user_id,request_fingerprint,request_payload_hash,configured_at
    ) select md5('calcutta-config:'||n)::uuid,'2026',n,
      'production-calcutta-v1','CONFIGURED',
      jsonb_build_object(
        'point_structure',jsonb_build_array(),
        'payout_structure',jsonb_build_array(),
        'financial_contract',jsonb_build_object('synthetic',true)
      ),encode(extensions.digest('calcutta-config:'||n,'sha256'),'hex'),
      repeat('1',64),139,'P01','${syntheticActor.authUserId}',
      encode(extensions.digest('calcutta-config-request:'||n,'sha256'),'hex'),
      encode(extensions.digest('calcutta-config-payload:'||n,'sha256'),'hex'),
      '2026-01-01T00:00:00Z'::timestamptz+n*interval '1 minute'
    from generate_series(1,${counts.calcuttaConfigurationRevisions}) as generated(n);

    insert into scoring_authority.calcutta_v1_auction_fact_revisions(
      auction_revision_id,tournament_id,auction_revision,state,auction_manifest,
      auction_fingerprint,resource_fingerprint,activation_revision,
      recorded_by_player_id,recorded_by_auth_user_id,request_fingerprint,
      request_payload_hash,recorded_at
    ) select md5('calcutta-auction:'||n)::uuid,'2026',n,'AUCTION_COMPLETE',
      jsonb_build_object(
        'pot',24000,
        'purchases',(select jsonb_agg(jsonb_build_object(
          'player_id',player_id,'purchase_price',1000) order by player_id)
          from scoring_authority.tournament_players where tournament_id='2026'),
        'ownership',(select jsonb_agg(jsonb_build_object(
          'player_id',player_id,'owner_player_id','P01','ownership_fraction',1)
          order by player_id) from scoring_authority.tournament_players where tournament_id='2026')
      ),encode(extensions.digest('calcutta-auction:'||n,'sha256'),'hex'),
      repeat('2',64),139,'P01','${syntheticActor.authUserId}',
      encode(extensions.digest('calcutta-auction-request:'||n,'sha256'),'hex'),
      encode(extensions.digest('calcutta-auction-payload:'||n,'sha256'),'hex'),
      '2026-02-01T00:00:00Z'::timestamptz+n*interval '1 minute'
    from generate_series(1,${counts.calcuttaAuctionRevisions}) as generated(n);

    insert into scoring_authority.calcutta_v1_publication_revisions(
      publication_revision_id,tournament_id,publication_revision,
      configuration_revision,auction_revision,configuration_fingerprint,
      auction_fingerprint,publication_state,action,actor_player_id,
      actor_auth_user_id,request_fingerprint,request_payload_hash,published_at
    ) select md5('calcutta-publication:'||n)::uuid,'2026',n,
      ${counts.calcuttaConfigurationRevisions},${counts.calcuttaAuctionRevisions},
      encode(extensions.digest('calcutta-config:${counts.calcuttaConfigurationRevisions}','sha256'),'hex'),
      encode(extensions.digest('calcutta-auction:${counts.calcuttaAuctionRevisions}','sha256'),'hex'),
      case when n=${counts.calcuttaPublicationRevisions} then 'PUBLISHED' else 'UNPUBLISHED' end,
      case when n=${counts.calcuttaPublicationRevisions} then 'DIRECTOR_PUBLISHED' else 'DIRECTOR_UNPUBLISHED' end,
      'P01','${syntheticActor.authUserId}',
      encode(extensions.digest('calcutta-publication-request:'||n,'sha256'),'hex'),
      encode(extensions.digest('calcutta-publication-payload:'||n,'sha256'),'hex'),
      case when n=${counts.calcuttaPublicationRevisions}
        then '2026-03-01T00:00:00Z'::timestamptz+n*interval '1 minute' else null end
    from generate_series(1,${counts.calcuttaPublicationRevisions}) as generated(n);

    insert into scoring_authority.calcutta_v1_current(
      tournament_id,configuration_revision_id,configuration_revision,
      configuration_fingerprint,auction_revision_id,auction_revision,
      auction_fingerprint,publication_revision_id,publication_revision,
      publication_state,state,result_revision
    ) values(
      '2026',md5('calcutta-config:${counts.calcuttaConfigurationRevisions}')::uuid,
      ${counts.calcuttaConfigurationRevisions},
      encode(extensions.digest('calcutta-config:${counts.calcuttaConfigurationRevisions}','sha256'),'hex'),
      md5('calcutta-auction:${counts.calcuttaAuctionRevisions}')::uuid,
      ${counts.calcuttaAuctionRevisions},
      encode(extensions.digest('calcutta-auction:${counts.calcuttaAuctionRevisions}','sha256'),'hex'),
      md5('calcutta-publication:${counts.calcuttaPublicationRevisions}')::uuid,
      ${counts.calcuttaPublicationRevisions},'PUBLISHED','IN_PROGRESS',
      ${counts.calcuttaResults}
    );

    insert into scoring_authority.calcutta_v1_recalculation_jobs(
      job_id,tournament_id,configuration_revision_id,configuration_revision,
      configuration_fingerprint,auction_revision_id,auction_revision,
      auction_fingerprint,activation_revision,source_revision,source_fingerprint,
      status,reason,requested_by,attempts,requested_at,completed_at
    ) select md5('calcutta-job:'||n)::uuid,'2026',
      md5('calcutta-config:${counts.calcuttaConfigurationRevisions}')::uuid,
      ${counts.calcuttaConfigurationRevisions},
      encode(extensions.digest('calcutta-config:${counts.calcuttaConfigurationRevisions}','sha256'),'hex'),
      md5('calcutta-auction:${counts.calcuttaAuctionRevisions}')::uuid,
      ${counts.calcuttaAuctionRevisions},
      encode(extensions.digest('calcutta-auction:${counts.calcuttaAuctionRevisions}','sha256'),'hex'),
      139,jsonb_build_object('syntheticHistoryOrdinal',n),
      encode(extensions.digest('calcutta-source:'||n,'sha256'),'hex'),
      'SUCCEEDED','SYNTHETIC_HISTORY','reliability-fixture',1,
      '2026-04-01T00:00:00Z'::timestamptz+n*interval '1 second',
      '2026-04-01T00:00:01Z'::timestamptz+n*interval '1 second'
    from generate_series(1,${counts.calcuttaJobs}) as generated(n);

    insert into scoring_authority.calcutta_v1_result_revisions(
      result_id,tournament_id,configuration_revision_id,configuration_revision,
      configuration_fingerprint,auction_revision_id,auction_revision,
      auction_fingerprint,result_revision,job_id,engine_version,source_fingerprint,
      result_state,engine_result_payload,payload_hash,is_current,calculated_by,
      calculated_at,superseded_at
    ) select md5('calcutta-result:'||n)::uuid,'2026',
      md5('calcutta-config:${counts.calcuttaConfigurationRevisions}')::uuid,
      ${counts.calcuttaConfigurationRevisions},
      encode(extensions.digest('calcutta-config:${counts.calcuttaConfigurationRevisions}','sha256'),'hex'),
      md5('calcutta-auction:${counts.calcuttaAuctionRevisions}')::uuid,
      ${counts.calcuttaAuctionRevisions},
      encode(extensions.digest('calcutta-auction:${counts.calcuttaAuctionRevisions}','sha256'),'hex'),
      n,md5('calcutta-job:'||n)::uuid,'calcutta-js-v1',
      encode(extensions.digest('calcutta-source:'||n,'sha256'),'hex'),
      'PROVISIONAL',jsonb_build_object('available',true,'synthetic',true,
        'historyOrdinal',n,'golfers',jsonb_build_array(),'portfolios',jsonb_build_array()),
      encode(extensions.digest('calcutta-result-payload:'||n,'sha256'),'hex'),
      n=${counts.calcuttaResults},'reliability-fixture',
      '2026-05-01T00:00:00Z'::timestamptz+n*interval '1 second',
      case when n=${counts.calcuttaResults} then null
        else '2026-05-02T00:00:00Z'::timestamptz+n*interval '1 second' end
    from generate_series(1,${counts.calcuttaResults}) as generated(n);
    update scoring_authority.calcutta_v1_result_revisions r set
      source_fingerprint=production_control.calcutta_v1_hash(
        production_control.calcutta_v1_source_revision('2026'))
    where r.is_current;
    update scoring_authority.calcutta_v1_recalculation_jobs j set
      source_fingerprint=r.source_fingerprint,
      source_revision=production_control.calcutta_v1_source_revision('2026')
    from scoring_authority.calcutta_v1_result_revisions r
    where r.is_current and j.job_id=r.job_id;

    delete from scoring_authority.net_skins_v1_result_revisions;
    delete from scoring_authority.net_skins_v1_recalculation_jobs;
    delete from scoring_authority.net_skins_v1_configuration_current;
    delete from scoring_authority.net_skins_v1_configuration_revisions;
    insert into scoring_authority.net_skins_v1_configuration_revisions(
      configuration_revision_id,tournament_id,configuration_revision,
      contract_version,state,publication_policy,configuration_manifest,
      configuration_fingerprint,resource_fingerprint,activation_revision,
      configured_by_player_id,configured_by_auth_user_id,request_fingerprint,
      request_payload_hash,configured_at
    ) select md5('skins-config:'||n)::uuid,'2026',n,'production-net-skins-v1',
      'CONFIGURED','OFFICIAL_ONLY',jsonb_build_object('rounds',jsonb_build_array(
        jsonb_build_object('round_id','2026-R1','round_number',1,'format','BB',
          'entry_type','PLAYER','buy_in_per_entry',25,'configuration_fingerprint',repeat('a',64),
          'match_ids',(select jsonb_agg(match_id order by match_id) from scoring_authority.matches where round_number=1),
          'entries',(select jsonb_agg(jsonb_build_object('entry_id','R1:'||player_id,
            'entry_type','PLAYER','match_id',null,'player_ids',jsonb_build_array(player_id),'eligible',true)
            order by player_id) from scoring_authority.tournament_players)),
        jsonb_build_object('round_id','2026-R2','round_number',2,'format','SC',
          'entry_type','PAIR','buy_in_per_entry',50,'configuration_fingerprint',repeat('b',64),
          'match_ids',(select jsonb_agg(match_id order by match_id) from scoring_authority.matches where round_number=2),
          'entries',(select jsonb_agg(jsonb_build_object('entry_id','R2:'||x,
            'entry_type','PAIR','match_id','2026-R2-'||((x+1)/2),
            'player_ids',jsonb_build_array('P'||lpad(x::text,2,'0'),'P'||lpad((x+12)::text,2,'0')),
            'eligible',true) order by x) from generate_series(1,12) as generated(x))
      ))),encode(extensions.digest('skins-config:'||n,'sha256'),'hex'),repeat('3',64),139,
      'P01','${syntheticActor.authUserId}',
      encode(extensions.digest('skins-request:'||n,'sha256'),'hex'),
      encode(extensions.digest('skins-payload:'||n,'sha256'),'hex'),now()
    from generate_series(1,${counts.netSkinsConfigurationRevisions}) as generated(n);
    insert into scoring_authority.net_skins_v1_configuration_current(
      tournament_id,configuration_revision_id,configuration_revision,state
    ) values('2026',md5('skins-config:${counts.netSkinsConfigurationRevisions}')::uuid,
      ${counts.netSkinsConfigurationRevisions},'CONFIGURED');
    insert into scoring_authority.net_skins_v1_recalculation_jobs(
      job_id,tournament_id,round_number,configuration_revision_id,
      configuration_revision,configuration_fingerprint,source_revision,
      source_fingerprint,status,reason,requested_by,attempts,requested_at,completed_at
    ) select md5('skins-job:'||n)::uuid,'2026',1+((n-1)%2),
      md5('skins-config:${counts.netSkinsConfigurationRevisions}')::uuid,
      ${counts.netSkinsConfigurationRevisions},
      encode(extensions.digest('skins-config:${counts.netSkinsConfigurationRevisions}','sha256'),'hex'),
      production_control.net_skins_v1_round_source_revision('2026',1+((n-1)%2)),
      production_control.net_skins_v1_hash(
        production_control.net_skins_v1_round_source_revision('2026',1+((n-1)%2))),
      'SUCCEEDED','SYNTHETIC_HISTORY','reliability-fixture',1,
      '2026-06-01T00:00:00Z'::timestamptz+n*interval '1 second',
      '2026-06-01T00:00:01Z'::timestamptz+n*interval '1 second'
    from generate_series(1,${counts.netSkinsJobs}) as generated(n);
    insert into scoring_authority.net_skins_v1_result_revisions(
      result_id,tournament_id,round_number,configuration_revision_id,
      configuration_revision,result_revision,job_id,engine_version,
      configuration_fingerprint,source_fingerprint,result_state,
      engine_result_payload,public_result_payload,payload_hash,is_current,
      calculated_by,calculated_at,published_at,superseded_at
    ) select md5('skins-result:'||n)::uuid,'2026',1+((n-1)%2),
      md5('skins-config:${counts.netSkinsConfigurationRevisions}')::uuid,
      ${counts.netSkinsConfigurationRevisions},1+((n-1)/2),md5('skins-job:'||n)::uuid,
      'net-skins-js-v1',
      encode(extensions.digest('skins-config:${counts.netSkinsConfigurationRevisions}','sha256'),'hex'),
      production_control.net_skins_v1_hash(
        production_control.net_skins_v1_round_source_revision('2026',1+((n-1)%2))),
      'PROVISIONAL',jsonb_build_object('synthetic',true,'historyOrdinal',n),null,
      encode(extensions.digest('skins-result:'||n,'sha256'),'hex'),
      n>${counts.netSkinsResults}-2,'reliability-fixture',
      '2026-07-01T00:00:00Z'::timestamptz+n*interval '1 second',null,
      case when n>${counts.netSkinsResults}-2 then null
        else '2026-07-02T00:00:00Z'::timestamptz+n*interval '1 second' end
    from generate_series(1,${counts.netSkinsResults}) as generated(n);

    -- Scale retained operational history while keeping the one current
    -- tournament shape fixed. These rows are synthetic cardinality/load, not
    -- claims that each retained Production row had identical contents.
    insert into scoring_authority.score_mutations(
      match_id,mutation_key,mutation_type,hole_number,payload_hash,
      previous_match_revision,next_match_revision,previous_hole_revision,
      next_hole_revision,result,actor_id
    ) select h.match_id,'scaled-history:'||n,'HOLE_SCORE',h.hole_number,
      encode(extensions.digest('scaled-history:'||n,'sha256'),'hex'),n-1,n,0,1,
      jsonb_build_object('ok',true,'synthetic',true),'reliability-fixture'
    from generate_series(328,${counts.scoreMutations}) as generated(n)
    cross join lateral (select * from scoring_authority.hole_scores
      order by match_id,hole_number offset ((n-1)%380) limit 1) h;
    insert into scoring_authority.score_revision_history(
      match_id,hole_number,mutation_key,action,previous_match_revision,
      next_match_revision,previous_hole_revision,next_hole_revision,
      before_state,after_state,actor_id
    ) select h.match_id,h.hole_number,'scaled-history:'||n,'HOLE_SCORE_UPSERTED',
      n-1,n,0,1,'{}',jsonb_build_object('synthetic',true),'reliability-fixture'
    from generate_series(328,${counts.scoreRevisionHistory}) as generated(n)
    cross join lateral (select * from scoring_authority.hole_scores
      order by match_id,hole_number offset ((n-1)%380) limit 1) h;
    insert into scoring_authority.google_outbox_events(
      id,tournament_id,match_id,match_revision,hole_number,hole_revision,
      mutation_key,event_type,payload,payload_hash,status,delivered_at
    ) select md5('scaled-outbox:'||n)::uuid,'2026',h.match_id,n,h.hole_number,1,
      'scaled-outbox:'||n,'HOLE_SCORE_UPSERTED',jsonb_build_object('synthetic',true),
      encode(extensions.digest('scaled-outbox:'||n,'sha256'),'hex'),'DELIVERED',now()
    from generate_series(286,${counts.googleOutboxEvents}) as generated(n)
    cross join lateral (select * from scoring_authority.hole_scores
      order by match_id,hole_number offset ((n-1)%380) limit 1) h;
    insert into production_control.tournament_setup_operation_receipts_v1(
      receipt_id,tournament_id,action,operation_request_id,
      declared_request_payload_hash,database_request_payload_hash,
      actor_player_id,actor_auth_user_id,prior_revision,next_revision,response
    ) select md5('scaled-setup-receipt:'||n)::uuid,'2026','PREPARE_SCORING_CONTEXT',
      md5('scaled-setup-operation:'||n)::uuid,
      encode(extensions.digest('scaled-declared:'||n,'sha256'),'hex'),
      encode(extensions.digest('scaled-database:'||n,'sha256'),'hex'),
      'P01','${syntheticActor.authUserId}',n-1,n,
      jsonb_build_object('ok',true,'synthetic',true)
    from generate_series(49,${counts.setupReceipts}) as generated(n);
    insert into production_control.tournament_setup_audit_events_v1(
      event_id,tournament_id,action,target_kind,target_id,actor_player_id,
      actor_auth_user_id,operation_request_id,prior_revision,next_revision,
      result,safe_metadata
    ) select md5('scaled-setup-audit:'||n)::uuid,'2026','PREPARE_SCORING_CONTEXT',
      'SCORING_CONTEXT','scaled-synthetic:'||n,'P01','${syntheticActor.authUserId}',
      md5('scaled-setup-operation:'||n)::uuid,n-1,n,'CHANGED',
      jsonb_build_object('synthetic',true)
    from generate_series(49,${counts.setupAuditEvents}) as generated(n);

    delete from production_control.postcutover_normal_release_head;
    delete from production_control.postcutover_normal_release_rebindings;
    insert into production_control.postcutover_normal_release_rebindings(
      release_rebind_id,scope_key,boundary_mode,contract_version,release_kind,
      release_sequence,predecessor_release_sequence,baseline_application_rebind_id,
      predecessor_release_rebind_id,capability_binding_id,tournament_id,epoch_id,
      authority_generation_id,admission_generation_id,predecessor_deployment_id,
      predecessor_deployment_commit,deployment_id,deployment_commit,
      deployment_hostname,vercel_project_id,vercel_team_id,capability_contract,
      capability_ceiling,activation_revision_before,activation_revision_after,
      admission_revision_before,admission_revision_after,runtime_manifest,
      runtime_fingerprint,runtime_observed_at,request_fingerprint,payload_hash,
      actor_id,response_value,created_at
    ) select md5('release:'||n)::uuid,'BAGGER_INV_PRODUCTION','MAINTENANCE_WINDOW_V1',
      'production-postcutover-normal-release-rebind-v1',
      case when n=1 then 'BASELINE_053' else 'NORMAL' end,n,
      case when n=1 then null else n-1 end,
      '71000000-0000-4000-8000-000000000001',
      case when n=1 then null else md5('release:'||(n-1))::uuid end,
      '75000000-0000-4000-8000-000000000001','2026',
      '30000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000002',
      'dpl_Reliability'||lpad((n-1)::text,6,'0'),repeat('6',40),
      'dpl_Reliability'||lpad(n::text,6,'0'),
      lpad(to_hex(n),40,'0'),'reliability-'||n||'.vercel.app',
      'prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU','team_kPw5zaib8uaQJALAwj4fWI6R',
      'production-maintenance-single-deployment-capability-v1','OBSERVATION',
      n-1,n,n-1,n,jsonb_build_object('synthetic',true,'ordinal',n),
      encode(extensions.digest('release-runtime:'||n,'sha256'),'hex'),
      '2026-08-01T00:00:00Z'::timestamptz+n*interval '1 second',
      encode(extensions.digest('release-request:'||n,'sha256'),'hex'),
      encode(extensions.digest('release-payload:'||n,'sha256'),'hex'),
      'reliability-fixture',jsonb_build_object('synthetic',true),
      '2026-08-01T00:00:00Z'::timestamptz+n*interval '1 second'
    from generate_series(1,${counts.normalReleaseRebindings}) as generated(n);

    delete from scoring_authority.odds_published_snapshots;
    delete from scoring_authority.odds_calculation_jobs;
    delete from scoring_authority.odds_input_configurations;
    insert into scoring_authority.odds_input_configurations(
      id,tournament_id,configuration_revision,source_workbook_id,settings,
      historical_ratings,settings_fingerprint,ratings_fingerprint,
      pairing_fingerprint,bundle_fingerprint,is_current,imported_by,imported_at,
      source_tab,source_fingerprint,canonical_settings,effective_settings,
      effective_settings_fingerprint,settings_contract_version,validation_status,
      validation_diagnostics,synchronized_at
    ) select md5('odds-config:'||n)::uuid,'2026',n,'synthetic-local-only','[]',
      jsonb_build_object('synthetic',true),
      encode(extensions.digest('odds-settings:'||n,'sha256'),'hex'),
      encode(extensions.digest('odds-ratings:'||n,'sha256'),'hex'),
      encode(extensions.digest('odds-pairing:'||n,'sha256'),'hex'),
      encode(extensions.digest('odds-bundle:'||n,'sha256'),'hex'),
      n=${counts.oddsInputConfigurations},'reliability-fixture',
      '2026-08-02T00:00:00Z'::timestamptz+n*interval '1 second','Synthetic',
      encode(extensions.digest('odds-source:'||n,'sha256'),'hex'),
      '{}'::jsonb,'{}'::jsonb,
      encode(extensions.digest('odds-effective:'||n,'sha256'),'hex'),
      'prediction-settings-v1','VALID',jsonb_build_object('synthetic',true),
      '2026-08-02T00:00:00Z'::timestamptz+n*interval '1 second'
    from generate_series(1,${counts.oddsInputConfigurations}) as generated(n);
    insert into scoring_authority.odds_calculation_jobs(
      job_id,tournament_id,phase,total_iterations,completed_iterations,
      engine_version,publication_contract_version,checkpoint_contract_version,
      deterministic_seed,input_fingerprint,settings_fingerprint,
      invocation_fingerprint,source_revision,input_snapshot,checkpoint_payload,
      checkpoint_hash,checkpoint_count,status,attempt_count,requested_by,
      requested_at,updated_at,completed_at,output_timestamp,result_payload,
      result_fingerprint,output_payload_bytes,resource_metrics,
      publication_status,publication_reference,input_configuration_id,
      effective_settings_fingerprint,input_bundle_fingerprint,
      production_operation_mode,production_deployment_commit,
      production_candidate_hostname,lease_owner
    ) select encode(extensions.digest('odds-job:'||n,'sha256'),'hex'),'2026',
      (array['Pre-Tournament','After Round 1','After Round 2',
        'Round 3 Pairings Announced','Final Results'])[1+((n-1)%5)],
      10000,10000,'synthetic-odds-v1','production-odds-publication-v1',
      'synthetic-checkpoint-v1','synthetic-seed-'||n,
      encode(extensions.digest('odds-input:'||n,'sha256'),'hex'),
      encode(extensions.digest('odds-settings:'||n,'sha256'),'hex'),
      encode(extensions.digest('odds-job:'||n,'sha256'),'hex'),
      jsonb_build_object('production_job_identity_contract',
        'production-odds-calculation-job-identity-v2','synthetic',true),
      jsonb_build_object('synthetic',true),jsonb_build_object('synthetic',true),
      encode(extensions.digest('odds-checkpoint:'||n,'sha256'),'hex'),1,
      'SUPERSEDED',1,'reliability-fixture',
      '2026-08-03T00:00:00Z'::timestamptz+n*interval '1 second',
      '2026-08-03T00:00:01Z'::timestamptz+n*interval '1 second',
      '2026-08-03T00:00:01Z'::timestamptz+n*interval '1 second',
      '2026-08-03T00:00:01Z'::timestamptz+n*interval '1 second',
      jsonb_build_object('synthetic',true),
      encode(extensions.digest('odds-result:'||n,'sha256'),'hex'),128,
      jsonb_build_object('synthetic',true),'STALE','{}'::jsonb,
      md5('odds-config:'||(1+((n-1)%${counts.oddsInputConfigurations})))::uuid,
      encode(extensions.digest('odds-effective:'||n,'sha256'),'hex'),
      encode(extensions.digest('odds-bundle-job:'||n,'sha256'),'hex'),
      'PRODUCTION_CUTOVER',repeat('7',40),null,null
    from generate_series(1,${counts.oddsJobs}) as generated(n);
    insert into scoring_authority.odds_published_snapshots(
      id,tournament_id,milestone,phase_order,publication_revision,published_at,
      published_payload,payload_hash,source_fingerprint,engine_version,
      engine_metadata,google_publication_fingerprint,
      google_publication_reference,is_current_for_milestone,is_current_official,
      publication_verified,imported_by,imported_at,created_at,mirror_status,
      authority_contract_version,publication_authority
    ) select md5('odds-snapshot:'||n)::uuid,'2026',
      (array['Pre-Tournament','After Round 1','After Round 2',
        'Round 3 Pairings Announced','Final Results'])[1+((n-1)%5)],
      (n-1)%5,n,'2026-08-04T00:00:00Z'::timestamptz+n*interval '1 second',
      jsonb_build_object('synthetic',true,'historyOrdinal',n),
      encode(extensions.digest('odds-snapshot-payload:'||n,'sha256'),'hex'),
      encode(extensions.digest('odds-snapshot-source:'||n,'sha256'),'hex'),
      'synthetic-odds-v1',jsonb_build_object('synthetic',true),
      encode(extensions.digest('odds-google:'||n,'sha256'),'hex'),
      jsonb_build_object('synthetic',true),n>${counts.oddsPublishedSnapshots}-5,
      n=${counts.oddsPublishedSnapshots},true,
      'reliability-fixture','2026-08-04T00:00:00Z'::timestamptz+n*interval '1 second',
      '2026-08-04T00:00:00Z'::timestamptz+n*interval '1 second',
      'VERIFIED_GOOGLE_IMPORT','legacy-google-published-odds-v1','GOOGLE'
    from generate_series(1,${counts.oddsPublishedSnapshots}) as generated(n);
    set session_replication_role=origin;
  `;
}

export function seedSyntheticSideGameHistory(cluster, database, scale) {
  sql(cluster, database, syntheticHistorySql(scale), { role: "" });
}

export function actualCounts(cluster, database) {
  return JSON.parse(sql(cluster, database, `select jsonb_build_object(
    'tournamentPlayers',(select count(*) from scoring_authority.tournament_players),
    'matches',(select count(*) from scoring_authority.matches),
    'matchParticipants',(select count(*) from scoring_authority.match_participants),
    'courseHoles',(select count(*) from scoring_authority.tournament_setup_course_holes_v1),
    'matchHoles',(select count(*) from scoring_authority.match_holes),
    'holeScores',(select count(*) from scoring_authority.hole_scores),
    'scoreMutations',(select count(*) from scoring_authority.score_mutations),
    'scoreRevisionHistory',(select count(*) from scoring_authority.score_revision_history),
    'googleOutboxEvents',(select count(*) from scoring_authority.google_outbox_events),
    'setupReceipts',(select count(*) from production_control.tournament_setup_operation_receipts_v1),
    'setupAuditEvents',(select count(*) from production_control.tournament_setup_audit_events_v1),
    'calcuttaConfigurationRevisions',(select count(*) from scoring_authority.calcutta_v1_configuration_revisions),
    'calcuttaAuctionRevisions',(select count(*) from scoring_authority.calcutta_v1_auction_fact_revisions),
    'calcuttaPublicationRevisions',(select count(*) from scoring_authority.calcutta_v1_publication_revisions),
    'calcuttaJobs',(select count(*) from scoring_authority.calcutta_v1_recalculation_jobs),
    'calcuttaResults',(select count(*) from scoring_authority.calcutta_v1_result_revisions),
    'netSkinsConfigurationRevisions',(select count(*) from scoring_authority.net_skins_v1_configuration_revisions),
    'netSkinsJobs',(select count(*) from scoring_authority.net_skins_v1_recalculation_jobs),
    'netSkinsResults',(select count(*) from scoring_authority.net_skins_v1_result_revisions),
    'normalReleaseRebindings',(select count(*) from production_control.postcutover_normal_release_rebindings),
    'oddsInputConfigurations',(select count(*) from scoring_authority.odds_input_configurations),
    'oddsJobs',(select count(*) from scoring_authority.odds_calculation_jobs),
    'oddsPublishedSnapshots',(select count(*) from scoring_authority.odds_published_snapshots)
  )`, { role: "" }));
}
