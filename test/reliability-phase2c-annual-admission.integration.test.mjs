// Proof layers: POSTGRESQL / INTEGRATION / CLIENT-COMPATIBILITY.
// Reuse the real protected maintenance/cutover/rebind fixture, with current candidate
// migrations installed BEFORE annual certificates. No runtime guard is substituted.
// All provider-like identifiers below are inert fixture values in socket-only PostgreSQL.
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {repositoryRoot} from './support/reliability/postgres17.mjs';
const historical='test/step13e7b-production-annual-normal-release-rebind-postgres.integration.test.mjs';
let generator=await readFile(path.join(repositoryRoot,historical),'utf8');
const rootDeclaration=`const repositoryRoot = path.resolve(\n  path.dirname(fileURLToPath(import.meta.url)),\n  "..",\n);`;
assert.ok(generator.includes(rootDeclaration));
generator=generator.replace(rootDeclaration,`const repositoryRoot = ${JSON.stringify(repositoryRoot)};`);
const entry='await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);';
assert.ok(generator.includes(entry));generator=generator.replace(entry,'export default source;');
let {default:source}=await import(`data:text/javascript;base64,${Buffer.from(generator).toString('base64')}`);
const once=(needle,replacement)=>{assert.equal(source.split(needle).length,2,`one fixture anchor required: ${needle.slice(0,80)}`);source=source.replace(needle,replacement);};
source=`import { createIsolatedCluster as createOwnedCluster, destroyIsolatedCluster as destroyOwnedCluster, sqlResult as ownedSqlResult } from ${JSON.stringify(pathToFileURL(path.join(repositoryRoot,'test/support/reliability/postgres17.mjs')).href)};
import { futureScoreFixtureSql, futureScoreFixtureInput, futureScoreFixture } from ${JSON.stringify(pathToFileURL(path.join(repositoryRoot,'test/support/reliability/phase2c-future-score-fixture.mjs')).href)};
import { runProtectedAnnualHistoryProof } from ${JSON.stringify(pathToFileURL(path.join(repositoryRoot,'test/support/reliability/phase2c-annual-history.mjs')).href)};
import { captureAnnualAuditIndexPlans } from ${JSON.stringify(pathToFileURL(path.join(repositoryRoot,'test/support/reliability/phase2c-audit-index-plans.mjs')).href)};
import { captureFinalPublicationHistoryPlans } from ${JSON.stringify(pathToFileURL(path.join(repositoryRoot,'test/support/reliability/phase2c-final-publication-plans.mjs')).href)};
import {writeFileSync} from 'node:fs';\n`+source;
const start=source.indexOf('async function createCluster() {'),end=source.indexOf('function createDatabase(',start);
assert.ok(start>0&&end>start);
source=source.slice(0,start)+`async function createCluster() {
 const owned=await createOwnedCluster();
 return {...owned,clusterRoot:owned.directory,dataDirectory:owned.data,socketDirectory:owned.socket,logFile:owned.log};
}
async function destroyCluster(cluster) { await destroyOwnedCluster(cluster); }
\n`+source.slice(end);
const later=(await readdir(path.join(repositoryRoot,'supabase/production_migrations'))).filter(n=>/^\d{12}_.*\.sql$/.test(n)&&Number(n.slice(8,12))>=79&&Number(n.slice(8,12))<=124).sort();
assert.equal(later.at(-1)?.slice(8,12),'0124');
const extras=['supabase/production_incremental/net-skins-sql-expressions-v1.sql','supabase/production_incremental/calcutta-exact-job-activation-recovery-v1.sql','candidates/scored-match-resume.sql'];
once('        const frozenDatabase = "annual_normal_release_frozen_2026";',`
        const topologyEvidence={timestamp:new Date().toISOString(),environment:'OWNED_SOCKET_ONLY_POSTGRESQL17',snapshots:[]};
        const captureTopology=label=>{
          const topology=JSON.parse(psql(cluster,database,\`select jsonb_agg(jsonb_build_object('name',t.tgname,'relation',t.tgrelid::regclass::text,
            'function',t.tgfoid::regprocedure::text,'type',t.tgtype,'attrs',t.tgattr::text,'enabled',t.tgenabled,
            'columns',(select jsonb_agg(a.attname order by u.ordinality) from unnest(t.tgattr::smallint[]) with ordinality u(attnum,ordinality)
              join pg_attribute a on a.attrelid=t.tgrelid and a.attnum=u.attnum)))
            from pg_trigger t where not t.tgisinternal and t.tgrelid in('production_control.future_runtime_match_bindings_v2'::regclass,
              'production_control.future_match_google_compatibility_jobs_v1'::regclass,'production_control.future_google_writer_generations_v2'::regclass,
              'production_control.future_google_writer_targets_v2'::regclass,'production_control.future_google_writer_certification_receipts_v1'::regclass,
              'production_control.future_google_writer_certification_audit_v1'::regclass)\`,{role:''}));
          let manifest;try{manifest={status:'PASS',sha256:psql(cluster,database,"select encode(extensions.digest(production_control.future_google_writer_implementation_manifest_v2()::text,'sha256'),'hex')",{role:''})};}
          catch(error){manifest={status:'FAIL',error:error.message};}
          topologyEvidence.snapshots.push({label,topology,manifest});
          writeFileSync(${JSON.stringify(path.join(repositoryRoot,'docs/reliability/phase2c/evidence/annual-trigger-topology.json'))},JSON.stringify(topologyEvidence,null,2)+'\\n');
        };
        captureTopology('UNCHANGED_SCHEMA_078');
        for(const filename of ${JSON.stringify(later)}) {
          if(filename.startsWith('202609280121')) {
            for(const extra of ${JSON.stringify(extras)}) psqlFile(cluster,database,path.join(repositoryRoot,extra));
          }
          psqlFile(cluster,database,path.join(migrationsDirectory,filename));
          if(filename.startsWith('202609110102')||filename.startsWith('202609280121')) captureTopology(filename);
        }
        captureTopology('CANDIDATE_SCHEMA_124');
        psql(cluster,database,\`alter database \${database} set statement_timeout='5000ms';alter database \${database} set timezone='UTC'\`,{role:''});
        const frozenDatabase = "annual_normal_release_frozen_2026";`);
once('return callback(context);',`try {
        await callback(context);
      } catch(error) {
        writeFileSync(${JSON.stringify(path.join(repositoryRoot,'docs/reliability/phase2c/evidence/annual-admission-detail.json'))},JSON.stringify({
          environment:'OWNED_SOCKET_ONLY_POSTGRESQL17',result:'FAIL',runtimeGuardsSubstituted:false,
          error:error.message,timestamp:new Date().toISOString()},null,2)+'\\n');
        throw error;
      }`);
const finalMarker='        console.log(JSON.stringify({\n          result: "ANNUAL_RELEASE_REVIEW_OK",';
once(finalMarker,`        // Real annual runtime input from the protected rebind and certified writer.
        const current=baseState(cluster,database);
        const writer=JSON.parse(psql(cluster,database,"select to_jsonb(w)::text from production_control.future_google_writer_targets_v2 w where tournament_id='2099'"));
        const annualInput={...normalReleaseCapabilityScope({deployment_id:repeatedNormalReleaseDeployment, deployment_commit:repeatedNormalReleaseSha}),
          expected_epoch_id:current.authority_generation_id,
          expected_current_tournament_id:'2099',expected_pointer_revision:2,
          expected_runtime_generation_id:'10000000-0000-4000-8000-000000000091',
          expected_annual_authority_generation_id:'20000000-0000-4000-8000-000000000092',
          expected_annual_admission_generation_id:'30000000-0000-4000-8000-000000000093',
          expected_google_writer_generation_id:writer.writer_generation_id,
          expected_google_target_contract_fingerprint:writer.target_contract_fingerprint,
          annual_destination_workbook_id:writer.destination_workbook_id,
          annual_scoring_dispatch_contract:'production-annual-scoring-dispatch-v1',
          annual_scoring_operation:'read_production_score_mutation_status_v1'};
        assert.equal(psql(cluster,database,\`select production_control.assert_future_production_scoring_runtime_v1(\${jsonSql(annualInput)})\`),'2099');
        const allowlist=JSON.parse(psql(cluster,database,"select to_jsonb(v)::text from production_control.annual_scoring_rpc_allowlist_v1 v where operation_name='read_production_score_mutation_status_v1'"));
        assert.equal(allowlist.operation_class,'READ');assert.equal(allowlist.required_phase,'CURRENT_READS');
        const manifest=JSON.parse(psql(cluster,database,"select production_control.annual_side_game_implementation_manifest_v1()::text",{role:''}));
        assert.equal(manifest.scoreRecoveryContract,'score-mutation-recovery-v1');
        assert.equal(psql(cluster,database,\`select production_control.assert_annual_scoring_runtime_v1(\${jsonSql(annualInput)},'read_production_score_mutation_status_v1')\`),'2099');
        for(const changed of [{expected_pointer_revision:99},{expected_runtime_generation_id:'00000000-0000-4000-8000-000000000000'},
          {deployment_commit:'f'.repeat(40)},{expected_current_tournament_id:'2098'}]) {
          assertCommandFailure(()=>psql(cluster,database,\`select production_control.assert_future_production_scoring_runtime_v1(\${jsonSql({...annualInput,...changed})})\`),/PRODUCTION_(ANNUAL_|EXACT_RELEASE_REQUIRED)/);
        }
        const workerAuthorityDenials=[];
        const workerStateSql="select jsonb_build_object('pointer',(select to_jsonb(p)from production_control.current_tournament_pointer_v1 p where scope_key='BAGGER_INV_PRODUCTION'),'competition',(select jsonb_agg(to_jsonb(j)order by engine_key)from scoring_authority.competition_recalculation_jobs j where tournament_id='2099'),'intents',(select jsonb_agg(to_jsonb(i)order by intent_id)from scoring_authority.score_derived_intents_v1 i where tournament_id='2099'),'calcutta',(select jsonb_agg(to_jsonb(j)order by job_id)from scoring_authority.calcutta_v1_recalculation_jobs j where tournament_id='2099'))::text";
        const authorityBefore=psql(cluster,database,workerStateSql);
        for(const [family,operation]of [['CALCUTTA','claim_production_calcutta_v1_recalculation'],
          ['COMPETITION','claim_competition_derived_jobs'],['INTELLIGENCE','claim_intelligence_derived_bundle']]){
          for(const scenario of ['ACTUAL_POINTER_ADVANCED','STALE_EXPECTED_GENERATION']){
            const input={...annualInput,annual_scoring_operation:operation,worker_id:'phase2c-authority-denial',
              contract_version:family==='CALCUTTA'?'production-calcutta-v1':undefined,
              engine_keys:family==='INTELLIGENCE'?['TOURNAMENT_INTELLIGENCE','PROJECTION_EDITORIAL']:['TEAM_MOMENTUM'],
              ...(scenario==='STALE_EXPECTED_GENERATION'?{expected_runtime_generation_id:'00000000-0000-4000-8000-000000000000'}:{})};
            const result=JSON.parse(psql(cluster,database,\`begin;set local statement_timeout='5s';
              \${scenario==='ACTUAL_POINTER_ADVANCED'?"set local session_replication_role=replica;update production_control.current_tournament_pointer_v1 set pointer_revision=pointer_revision+1 where scope_key='BAGGER_INV_PRODUCTION';set local session_replication_role=origin;":''}
              create function pg_temp.capture_authority_denial(value jsonb)returns jsonb language plpgsql as $probe$
              declare state text;message text;begin
                perform public.dispatch_production_annual_scoring_v1(value);
                raise exception 'STALE_WORKER_AUTHORITY_ACCEPTED';
              exception when sqlstate '55000' then
                get stacked diagnostics state=returned_sqlstate,message=message_text;
                return jsonb_build_object('sqlstate',state,'code',message);
              end $probe$;
              set local "request.jwt.claim.role"='service_role';select pg_temp.capture_authority_denial(\${jsonSql(input)});rollback;\`,{role:''}));
            assert.equal(result.sqlstate,'55000');
            assert.ok(['PRODUCTION_ANNUAL_SCORING_RUNTIME_REQUIRED','PRODUCTION_FUTURE_SCORING_RUNTIME_REQUIRED'].includes(result.code),
              'denial must arise from actual runtime authority, not malformed worker payload');
            assert.equal(psql(cluster,database,workerStateSql),authorityBefore);
            workerAuthorityDenials.push({family,operation,scenario,...result,queueAndPointerUnchanged:true,runtimeGuardsSubstituted:false});
          }
        }
        const denied={...annualInput,match_id:'2099-R1-1',mutation_key:'synthetic-no-receipt',authorization:{tournament_id:'2099',match_id:'2099-R1-1',
          player_id:'AR01',auth_user_id:'00000000-0000-4000-8000-000000000091',role:'PLAYER'}};
        // Synthetic identity construction only; real identity/membership predicates remain installed.
        psql(cluster,database,\`begin;set local session_replication_role=replica;
          insert into scoring_authority.tournament_players(tournament_id,player_id,team_id,team_side,source_roster_key)
            values('2099','AR01','SYNTHETIC',1,'phase2c-annual-identity');
          insert into participant_identity.user_player_links(auth_user_id,player_id,status,link_method,email_identity_hash)
            values('00000000-0000-4000-8000-000000000091','AR01','ACTIVE','SYNTHETIC_FIXTURE',encode(extensions.digest('annual-review@baggerinv.com','sha256'),'hex'));
          insert into participant_identity.participant_auth_identifiers(player_id,auth_user_id,identifier_type,normalized_value_private,
            status,verified_at,verification_source,source_system,created_by,updated_by)
            values('AR01','00000000-0000-4000-8000-000000000091','EMAIL','annual-review@baggerinv.com',
              'VERIFIED',clock_timestamp(),'SYNTHETIC_FIXTURE','SYNTHETIC_FIXTURE','phase2c','phase2c');
          insert into participant_identity.tournament_roles(tournament_id,auth_user_id,role,granted_by)
            values('2099','00000000-0000-4000-8000-000000000091','PARTICIPANT','phase2c');
          insert into participant_identity.identity_context_revisions(tournament_id,context_revision,configuration_fingerprint,updated_by)
            values('2026',1,repeat('3',64),'phase2c') on conflict(tournament_id) do update set
              context_revision=1,configuration_fingerprint=repeat('3',64),updated_by='phase2c';
          insert into participant_identity.identity_config_import_runs(tournament_id,source_system,source_workbook_id,
            source_fingerprint,configuration_revision,status,requested_by,approved_by,approved_at)
            select '2026','SYNTHETIC_FIXTURE',google_workbook_id,repeat('3',64),1,'APPROVED','phase2c','phase2c',clock_timestamp()
              from production_control.resource_scope where scope_key='BAGGER_INV_PRODUCTION';
          insert into participant_identity.participant_identity_contacts(tournament_id,player_id,email,email_normalized,
            configuration_revision,source_system,source_workbook_id)
            select year,'AR01','annual-review@baggerinv.com','annual-review@baggerinv.com',1,'SYNTHETIC_FIXTURE',google_workbook_id
              from production_control.resource_scope cross join(values('2026'),('2099')) years(year) where scope_key='BAGGER_INV_PRODUCTION';
          insert into participant_identity.future_tournament_participant_bindings_v1(tournament_id,player_id,enrollment_state,
            source_identity_tournament_id,source_configuration_revision,source_contact_fingerprint,bound_link_revision,binding_revision,contact_state)
            select '2099','AR01','ENROLLED','2026',1,
              encode(extensions.digest('AR01|annual-review@baggerinv.com|1','sha256'),'hex'),link_revision,1,'APPROVED'
              from participant_identity.user_player_links where player_id='AR01';
          insert into production_control.tournament_owner_capabilities_v1(tournament_id,player_id,auth_user_id,
            adopted_from_entitlement_id,adopted_entitlement_event_id,adopted_entitlement_event_count,status,
            capability_revision,adopted_by_player_id,adopted_at)
            values('2026','AR01','00000000-0000-4000-8000-000000000091','00000000-0000-4000-8000-000000000094',1,1,
              'ACTIVE',1,'AR01',clock_timestamp());
          update participant_identity.future_tournament_identity_contexts_v1 set binding_fingerprint=
            production_control.future_participant_identity_binding_fingerprint_v1('2099') where tournament_id='2099';
          commit;\`,{role:''});
        assert.equal(psql(cluster,database,'select production_control.assert_future_participant_identity_runtime_v1()'),'2099');
        psql(cluster,database,futureScoreFixtureSql,{role:''});
        psql(cluster,database,\`insert into participant_identity.future_tournament_participant_bindings_v1(tournament_id,player_id,enrollment_state,binding_revision,contact_state)
          values('2099','AR02','NOT_ENROLLED',1,'MISSING');
          update participant_identity.future_tournament_identity_contexts_v1 set roster_count=2,not_enrolled_count=1,
            binding_fingerprint=production_control.future_participant_identity_binding_fingerprint_v1('2099') where tournament_id='2099';
          insert into participant_identity.tournament_roles(tournament_id,auth_user_id,role,granted_by)
          values('2099','00000000-0000-4000-8000-000000000091','DIRECTOR','phase2c');
          insert into production_control.director_entitlements(auth_user_id,tournament_id,player_id,role,status,granted_by)
          values('00000000-0000-4000-8000-000000000091','2099','AR01','OWNER','ACTIVE','phase2c');
          alter database \${database} set statement_timeout='1000ms'\`,{role:''});
        const actualScoreInput=futureScoreFixtureInput(annualInput);
        const scoreObservations=[];
        for(let attempt=0;attempt<5;attempt++){
          const began=performance.now();
          const score=rpc(cluster,database,'dispatch_production_annual_scoring_v1',actualScoreInput);
          assert.equal(score.ok,true);assert.equal(score.code,'ACCEPTED');
          assert.equal(Boolean(score.idempotent),attempt>0);assert.equal(score.hole_revision,1);assert.equal(score.match_revision,1);
          if(attempt>0)assert.equal(score.updated_at,scoreObservations[0].result.updated_at);
          scoreObservations.push({attempt,elapsedMs:performance.now()-began,result:score});
        }
        assert.equal(psql(cluster,database,"select count(*)from scoring_authority.score_mutations where match_id='2099-R3-1'"),'1');
        assert.equal(psql(cluster,database,"select count(*)from scoring_authority.hole_scores where match_id='2099-R3-1'"),'1');
        const ownedRecovery={...annualInput,match_id:futureScoreFixture.matchId,
          mutation_key:actualScoreInput.mutation_key,authorization:actualScoreInput.authorization};
        const ownedBefore=rpc(cluster,database,'dispatch_production_annual_scoring_v1',ownedRecovery);
        assert.equal(ownedBefore.status,'COMMITTED');
        const lockResult=rpc(cluster,database,'dispatch_production_annual_scoring_v1',{
          ...annualInput,annual_scoring_operation:'mutate_production_match_control',match_id:futureScoreFixture.matchId,
          operation:'SCORING_LOCK',mutation_key:'20990000-0000-4000-8000-000000000102',expected_match_revision:1,
          authorization:{...actualScoreInput.authorization,role:'DIRECTOR'}});
        assert.equal(lockResult.ok,true);
        const recoveryObservations=[];
        for(let attempt=0;attempt<5;attempt++){
          const began=performance.now();
          const result=rpc(cluster,database,'dispatch_production_annual_scoring_v1',ownedRecovery);
          assert.equal(result.status,'COMMITTED');
          recoveryObservations.push({attempt,elapsedMs:performance.now()-began,status:result.status});
        }
        const yearAuthority=[];
        for(const zone of ['Pacific/Kiritimati','America/Adak']) {
          const result=JSON.parse(psql(cluster,database,\`begin;set local timezone='\${zone}';select jsonb_build_object(
            'target',production_control.assert_future_production_scoring_runtime_v1(\${jsonSql(annualInput)}),
            'year',(select tournament_year from production_control.current_tournament_pointer_v1 where scope_key='BAGGER_INV_PRODUCTION'),
            'recovery',public.dispatch_production_annual_scoring_v1(\${jsonSql(ownedRecovery)})->>'status');rollback;\`));
          assert.equal(result.target,'2099');assert.equal(result.year,2099);assert.equal(result.recovery,'COMMITTED');
          yearAuthority.push({zone,...result});
        }
        psql(cluster,database,\`alter database \${database} set statement_timeout='5000ms'\`,{role:''});

        assertCommandFailure(()=>rpc(cluster,database,'dispatch_production_annual_scoring_v1',{
          ...denied,authorization:{...denied.authorization,player_id:'UNENROLLED'}}),/PRODUCTION_SCORING_AUTHORIZATION_REQUIRED/);
        const recovery=rpc(cluster,database,'dispatch_production_annual_scoring_v1',denied);
        assert.equal(recovery.status,'UNKNOWN');
        psql(cluster,database,\`begin;
          update production_control.annual_scoring_runtime_authorities_v1 set authority_status='CLOSED',
            admission_state='CLOSED',active_closure_id=predecessor_closure_id,closed_at=clock_timestamp() where tournament_id='2099';
          do $proof$ declare result jsonb;begin
            result:=public.dispatch_production_annual_scoring_v1(\${jsonSql(denied)});
            if result->>'status'<>'UNKNOWN' then raise exception 'ANNUAL_RECOVERY_READ_PHASE_FAILED';end if;
            begin perform public.dispatch_production_annual_scoring_v1(\${jsonSql({...denied,annual_scoring_operation:'submit_production_hole_score'})});
              raise exception 'ANNUAL_CLOSED_MUTATION_ACCEPTED';
            exception when sqlstate '55000' then
              if sqlerrm<>'PRODUCTION_ANNUAL_SCORING_RUNTIME_REQUIRED' then raise;end if;
            end;
          end $proof$;rollback;\`);
        const claimInput={...annualInput,annual_scoring_operation:'claim_competition_derived_jobs',
          worker_id:'phase2c-annual-admission',engine_keys:['TEAM_MOMENTUM'],lease_seconds:60};
        const actualClaim=JSON.parse(psql(cluster,database,\`begin;select public.dispatch_production_annual_scoring_v1(\${jsonSql(claimInput)});rollback;\`));
        assert.equal(actualClaim.ok,true);assert.equal(actualClaim.claims.length,1);
        assert.equal(actualClaim.claims[0].requested_source_revision.intentRevision.matchId,futureScoreFixture.matchId);
        const annualDeliveryInput={...annualInput,contract_version:'score-derived-delivery-v1',materialization_family:'COMPETITION',
          annual_scoring_operation:'score_derived_delivery_tick_v1',worker_id:'phase2c-annual-delivery',
          operation_id:'a2800000-0000-4000-8000-000000000001'};
        psql(cluster,database,\`begin;update production_control.resource_scope set workers_enabled=false where scope_key='BAGGER_INV_PRODUCTION';
          do $proof$ begin
            begin perform public.score_derived_delivery_tick_v1(\${jsonSql(annualDeliveryInput)});
              raise exception 'ANNUAL_DISABLED_WORKER_ACCEPTED';
            exception when sqlstate '55000' then
              if sqlerrm<>'PRODUCTION_DERIVED_WORKER_RUNTIME_REQUIRED' then raise;end if;
            end;
          end $proof$;rollback;\`);
        psql(cluster,database,\`begin;update production_control.resource_scope set workers_enabled=true where scope_key='BAGGER_INV_PRODUCTION';
          do $proof$ declare direct_result jsonb;dispatch_result jsonb;begin
            direct_result:=public.score_derived_delivery_tick_v1(\${jsonSql(annualDeliveryInput)});
            dispatch_result:=public.dispatch_production_annual_scoring_v1(\${jsonSql(annualDeliveryInput)});
            if direct_result#>>'{scope,tournamentId}'<>'2099' or dispatch_result#>>'{scope,tournamentId}'<>'2099'
              then raise exception 'ANNUAL_DELIVERY_SCOPE_MISMATCH';end if;
          end $proof$;rollback;\`);
        const materialized=rpc(cluster,database,'score_derived_delivery_tick_v1',annualDeliveryInput);
        assert.equal(materialized.ok,true);
        const intents=JSON.parse(psql(cluster,database,"select jsonb_agg(jsonb_build_object('family',family,'status',status,'target',tournament_id))from scoring_authority.score_derived_intents_v1 where tournament_id='2099'"));
        assert.ok(intents.length>0);assert.ok(intents.every(i=>i.status==='SUCCEEDED'&&i.target==='2099'));
        const scoreSnapshot=psql(cluster,database,"select jsonb_build_object('scores',(select jsonb_agg(to_jsonb(s)order by hole_number)from scoring_authority.hole_scores s where match_id='2099-R3-1'),'receipts',(select jsonb_agg(to_jsonb(r)order by mutation_key)from scoring_authority.score_mutations r where match_id='2099-R3-1'))::text");
        const nextSha='9'.repeat(40),nextDeployment='dpl_Phase2CAnnualCompatible004';
        const releaseState=baseState(cluster,database);
        const tuple={expected_release_sequence:4,expected_current_tournament_id:'2099',expected_pointer_revision:2,
          expected_runtime_generation_id:annualInput.expected_runtime_generation_id,
          expected_annual_authority_generation_id:annualInput.expected_annual_authority_generation_id,
          expected_annual_admission_generation_id:annualInput.expected_annual_admission_generation_id};
        const nextAuthorization=ownerControlFunction(cluster,database,'authorize_production_postcutover_normal_release',
          normalReleaseAuthorizationInput(releaseState,'phase2c-owned-score-release4',{...tuple,
            target_deployment_commit:nextSha,expected_predecessor_deployment_id:repeatedNormalReleaseDeployment,
            expected_predecessor_deployment_commit:repeatedNormalReleaseSha}));
        assert.equal(nextAuthorization.release_sequence,4);
        const nextRelease=rpc(cluster,database,'rebind_production_postcutover_normal_release',
          normalReleaseDirectInput(releaseState,'phase2c-owned-score-release4',{...tuple,
            original_deployment_id:repeatedNormalReleaseDeployment,expected_predecessor_deployment_id:repeatedNormalReleaseDeployment,
            expected_predecessor_deployment_commit:repeatedNormalReleaseSha,deployment_id:nextDeployment,
            deployment_commit:nextSha,runtime_deployment_commit:nextSha,runtime_deployment_hostname:'phase2c-annual004.vercel.app',
            runtime_odds_publication_authority:'SUPABASE',runtime_supabase_odds_publication_enabled:true,
            runtime_supabase_odds_google_mirror_enabled:false}));
        assert.equal(nextRelease.release_sequence,4);
        const compatibleRecovery=rpc(cluster,database,'dispatch_production_annual_scoring_v1',{
          ...ownedRecovery,deployment_id:nextDeployment,deployment_commit:nextSha});
        assert.equal(compatibleRecovery.status,'COMMITTED');
        assert.equal(psql(cluster,database,"select jsonb_build_object('scores',(select jsonb_agg(to_jsonb(s)order by hole_number)from scoring_authority.hole_scores s where match_id='2099-R3-1'),'receipts',(select jsonb_agg(to_jsonb(r)order by mutation_key)from scoring_authority.score_mutations r where match_id='2099-R3-1'))::text"),scoreSnapshot);
        const annualHistory=runProtectedAnnualHistoryProof({query:(db,statement,options)=>psql(cluster,db,statement,options),
          baselineDatabase:database,annualInput:{...annualInput,deployment_id:nextDeployment,deployment_commit:nextSha},
          recoveryInput:{...ownedRecovery,deployment_id:nextDeployment,deployment_commit:nextSha},
          directorAuthorization:{...actualScoreInput.authorization,role:'DIRECTOR'}});
        writeFileSync(${JSON.stringify(path.join(repositoryRoot,'docs/reliability/phase2c/evidence/annual-history.json'))},JSON.stringify(annualHistory,null,2)+'\\n');
        const publicationPlans=[1,10].map(scale=>captureFinalPublicationHistoryPlans({query:(db,statement,options)=>psql(cluster,db,statement,options),queryWithDiagnostics:(db,statement,options)=>ownedSqlResult(cluster,db,statement,options),database:'phase2c_annual_history_'+scale,scale,allowIsolatedFixture:true}));
        writeFileSync(${JSON.stringify(path.join(repositoryRoot,'docs/reliability/phase2c/evidence/final-publication-plans.json'))},JSON.stringify({schemaVersion:1,result:'PASS',plans:publicationPlans},null,2)+'\\n');
        const auditIndexPlans=[1,10].map(scale=>captureAnnualAuditIndexPlans({query:(db,statement,options)=>psql(cluster,db,statement,options),database:'phase2c_annual_history_'+scale,scale,allowIsolatedFixture:true}));
        writeFileSync(${JSON.stringify(path.join(repositoryRoot,'docs/reliability/phase2c/evidence/audit-index-plans.json'))},JSON.stringify({schemaVersion:1,result:'PASS',plans:auditIndexPlans},null,2)+'\\n');
        const artifact={schemaVersion:1,environment:'OWNED_SOCKET_ONLY_POSTGRESQL17',result:'PASS',
          timestamp:new Date().toISOString(),runtimeGuardsSubstituted:false,statementTimeoutMs:5000,timeZone:'UTC',
          candidateMigrations:${JSON.stringify(later)},actualAnnualTarget:'2099',releases:[annualRebind.release_sequence,secondRebind.release_sequence,nextRelease.release_sequence],
          annualStateUnchangedAcrossReleases:annualAfter===annualBefore,
          annualHistory,workerAuthorityDenials,scoreProof:{fixture:futureScoreFixture,scoreObservations,recoveryObservations,yearAuthority,postLock:recoveryObservations[0].status,compatibleReleaseRecovery:compatibleRecovery.status,intents,actualClaim,materialized},
          assertions:{acceptedFutureScore:'PASS',postLockOwnedRecovery:'PASS',realRuntime:'PASS',liveManifest:'PASS',recoveryReadAllowlist:'PASS',
            unauthorizedRecovery:'DENIED',authorizedRecoveryRead:'UNKNOWN',closedAdmissionRead:'PASS',closedAdmissionMutation:'DENIED',stalePointerGenerationDeployment:'DENIED',actualWorkerDispatch:'PASS',disabledDirectDelivery:'DENIED',enabledDirectAndDispatchedDelivery:'PASS'},
          limitations:['Annual fixture constructs synthetic generation/certification rows; not the entire creation/activation user flow',
            'Actual2099 Singles score/replay, Lock, owned recovery, derived-intent materialization and compatible release are proven; annual full-round/Finalize/financial completion and financial job/result history-scale remain NOT PROVEN here',
            'No Production, hosted deployment, physical client, external Google delivery, or2099 full golf tournament']};
        writeFileSync(${JSON.stringify(path.join(repositoryRoot,'docs/reliability/phase2c/evidence/annual-admission-detail.json'))},JSON.stringify(artifact,null,2)+'\\n');
`+finalMarker);
source+='\n//# sourceURL=phase2c-protected-annual-admission-generated.mjs\n';
await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
