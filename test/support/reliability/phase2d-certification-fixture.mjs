// Synthetic local authority only. Uses fresh final-schema replay and the owner-only
// registration/bootstrap contracts. No hosted URL/credentials, replica bypass,
// mocked admission assertion, seeded score receipt, Google job or fake cutover.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createCanonicalCompilerFixture,installLocalCanonicalPlatform} from './phase2d-resource-bootstrap.mjs';
import {createDatabase,destroyIsolatedCluster,jsonLiteral,sql} from './postgres17.mjs';
import {buildCanonicalArtifacts,installCanonicalBaseline} from '../../../tools/reliability/canonical-bootstrap-artifacts.mjs';
import {syntheticActor,syntheticDirector} from './synthetic-tournament.mjs';
import {buildTournamentSetupMutation,normalizeProductionTournamentSetupPayload} from '../../../lib/production-tournament-setup-contract.js';

export const certificationForwardMigrations=[
 'supabase/production_migrations/202609300131_canonical_resource_control_v1.sql',
 'supabase/production_migrations/202609300132_certification_domain_gateways_v1.sql',
 'supabase/production_migrations/202609300133_certification_derived_gateways_v1.sql',
];
export async function createCertificationFixture({forwardMigrations=certificationForwardMigrations,databases=1,registrationFactory}={}){
 const compiler=await createCanonicalCompilerFixture({forwardMigrations});
 try{
  const bundle=await buildCanonicalArtifacts(compiler);
  const resources=[];
  for(let index=0;index<databases;index++){
   const database='r2_certification_'+index;
   createDatabase(compiler.cluster,database);installLocalCanonicalPlatform(compiler.cluster,database);
   const installed=await installCanonicalBaseline(compiler.cluster,database,bundle);
   resources.push(await initializeCertificationFixture(compiler.cluster,database,installed,index,{registrationFactory}));
  }
  return{...compiler,bundle,resources,...resources[0],compilerDatabase:compiler.database};
 }catch(error){await destroyIsolatedCluster(compiler.cluster);throw error;}
}
export async function initializeCertificationFixture(cluster,database,installed,index=0,{registrationFactory}={}){
 const installationId=randomUUID(),bindingId=randomUUID(),epochId=randomUUID();
 const projectRef=String.fromCharCode(97+index).repeat(20);
 let resource={resource_id:'CERTIFICATION:'+installationId,resource_class:'CERTIFICATION',installation_id:installationId,
  project_ref:projectRef,project_url:'https://'+projectRef+'.supabase.co',vercel_team_id:'team_synthetic_certification',
  vercel_project_id:'prj_synthetic_certification',registration_revision:1,manifest_digest:installed.manifestSha256,
  schema_contract:'canonical-resource-v1',schema_digest:installed.schemaSha256};
 let deployment={vercel_team_id:resource.vercel_team_id,vercel_project_id:resource.vercel_project_id,
  git_branch:'codex/synthetic-resource-proof',deployment_class:'preview',release_commit:'c'.repeat(40),
  // Preserve the existing closure/publication deployment identifier contract.
  deployment_id:'dpl_SyntheticCertification'+index,deployment_origin:'https://synthetic-certification-'+index+'.invalid'};
 // Module-only fixture option, invoked before the owner registration exists.
 // A real JS transport proof installs the exact same synthetic manifest here;
 // its fetch adapter must never repair or rewrite an outbound envelope.
 let transportFixture;
 if(registrationFactory){
  const configured=registrationFactory({resource,deployment,installed,index});
  ({resource,deployment,transportFixture}=configured);
 }
 const q=(statement,role='')=>sql(cluster,database,statement,{role});
 const owner=(name,input)=>JSON.parse(q(`select production_control.${name}(${jsonLiteral(input)})`));
 owner('register_certification_resource_v1',resource);
 owner('initialize_certification_resource_v1',{...deployment,resource_id:resource.resource_id,
  initial_tournament_id:'2026',governance_tournament_id:'2026',binding_id:bindingId,authority_epoch_id:epochId,
  capabilities:['READS','SCORING','DIRECTOR','WORKERS','ANNUAL']});
 owner('set_certification_admission_v1',{resource_id:resource.resource_id,expected_admission_revision:1,enabled:true,reason:'Owned disposable local synthetic certification'});
 const authorization={tournament_id:'2026',role:'DIRECTOR',player_id:syntheticDirector.playerId,auth_user_id:syntheticDirector.authUserId};
 const envelope={contract_version:'certification-runtime-v1',resource,deployment,phase:'DIRECTOR',authorization};
 const rpc=(name,input,role='service_role')=>JSON.parse(q(`set role ${role};select public.${name}(${jsonLiteral(input)})`,'service_role'));
 const context=(phase='DIRECTOR',overrides={})=>rpc('read_certification_runtime_context_v1',{...envelope,phase,...overrides}).context;
 // Fixture-only owner provisioning with all constraints and triggers active.
 // The marker accurately identifies this admitted synthetic resource; no claim
 // is made that direct owner fixture construction is a shipping setup workflow.
 q(`begin;set local request.jwt.claim.role='service_role';
 select production_control.push_certification_context_v1(${jsonLiteral(envelope)},'DIRECTOR',false);
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
    insert into scoring_authority.tournament_players(
      tournament_id,player_id,team_id,team_side,participation_status,
      source_roster_key,tournament_handicap,handicap_revision_id
    ) select '2026','P'||lpad(n::text,2,'0'),case when n<13 then 'T1' else 'T2' end,
      case when n<13 then 1 else 2 end,'ACTIVE','synthetic:P'||lpad(n::text,2,'0'),
      (n-12)::numeric/2,'10000000-0000-4000-8000-000000000001'
    from generate_series(1,24)n;
    insert into scoring_authority.handicap_revision_entries(
      revision_id,tournament_id,player_id,tournament_handicap
    ) select '10000000-0000-4000-8000-000000000001','2026',
      'P'||lpad(n::text,2,'0'),(n-12)::numeric/2
    from generate_series(1,24)n;
    insert into scoring_authority.handicap_revision_current(
      tournament_id,revision_id,revision_number
    ) values('2026','10000000-0000-4000-8000-000000000001',7);

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
      false,1,now(),now()
      from scoring_authority.match_participants;

    -- Canonical Finalize snapshots require a presentation identity. This is
    -- synthetic database provenance, not a Google workbook or provider call.
    insert into scoring_authority.game_center_presentations(
      match_id,tournament_id,match_sort_order,display_match_number,
      source_workbook_id,source_payload_hash,imported_by
    ) select match_id,'2026',row_number() over(order by round_number,match_id),
      split_part(match_id,'-',3),'urn:bagger:synthetic:${resource.installation_id}',
      encode(extensions.digest(match_id,'sha256'),'hex'),'reliability-fixture'
    from scoring_authority.matches where tournament_id='2026';

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


 select production_control.pop_certification_context_v1();commit;`);
 assert.equal(q("select count(*) from production_control.resource_scope"),'0');
 assert.equal(q("select count(*) from production_control.cutover_activation_state"),'0');
 assert.equal(q("select count(*) from scoring_authority.hole_scores"),'0');
 const read=(operationId,payload={},extra={})=>rpc('read_certification_operation_v1',{...envelope,
  phase:operationId.startsWith('DIRECTOR.')?'DIRECTOR':'READS',operation_id:operationId,payload,...extra});
 const command=(operationId,payload,extra={})=>{
  const phase=operationId.startsWith('WORKERS.')?'WORKERS':operationId.startsWith('SCORING.')&&operationId!=='SCORING.REOPEN_MATCH'?'SCORING':'DIRECTOR';
  return{...envelope,phase,operation_id:operationId,payload,operation_request_id:payload.mutation_key||randomUUID(),expected_context_token:context(phase).context_token,...extra};
 };
 const execute=input=>rpc('execute_certification_operation_v1',input);
 const model=()=>normalizeProductionTournamentSetupPayload(read('DIRECTOR.READ_SETUP'));
 const setup=(action,values={},operationRequestId=randomUUID())=>{
  const payload=buildTournamentSetupMutation(action,{expectedRevision:model().revision,operationRequestId,...values});
  delete payload.operation_request_id;
  return execute(command(action==='replace-round-pairings'?'DIRECTOR.MUTATE_PAIRINGS':'DIRECTOR.MUTATE_SETUP',{...payload,action},{operation_request_id:operationRequestId}));
 };
 const control=(action,matchId='2026-R1-1',operationRequestId=randomUUID())=>{
  const match=read('DIRECTOR.READ_SETUP',{family:'MATCH_CONTROL'}).data.matches.find(m=>m.matchId===matchId);assert.ok(match);
  return execute(command('DIRECTOR.MATCH_CONTROL',{action,match_id:matchId,expected_match_revision:match.matchRevision,expected_permission_revision:match.permissionRevision},{operation_request_id:operationRequestId}));
 };
 return{cluster,database,resource,deployment,bindingId,epochId,envelope,owner,q,rpc,context,read,command,execute,model,setup,control,transportFixture};
}
