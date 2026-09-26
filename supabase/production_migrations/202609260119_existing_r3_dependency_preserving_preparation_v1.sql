-- Exact one-time R3 missing-context recovery. No lifecycle/access or side-game writes.
-- See docs/r3-existing-preparation-recovery.md.
begin;
create function production_control.r3_existing_preparation_state_v1() returns jsonb language sql stable security definer set search_path=pg_catalog set timezone='UTC' as $state$
select jsonb_build_object('pairing',production_control.tournament_setup_hash_v1((select jsonb_agg(jsonb_build_object('match',m.match_id,'round',m.round_number,'format',m.format,'course',d.course_id,'tee',d.tee_id,'players',(select jsonb_agg(jsonb_build_object('id',p.player_id,'side',p.team_side,'slot',p.player_slot,'team',t.team_id) order by p.team_side,p.player_slot) from scoring_authority.match_participants p join scoring_authority.tournament_players t on t.tournament_id='2026' and t.player_id=p.player_id where p.match_id=m.match_id)) order by m.match_id) from scoring_authority.matches m join scoring_authority.tournament_setup_match_details_v1 d using(match_id) where m.tournament_id='2026' and m.round_number=3)),'protected',production_control.tournament_setup_hash_v1(jsonb_build_object('setup',(select to_jsonb(x) from production_control.tournament_setup_context_v1 x where tournament_id='2026'),'rounds',(select coalesce(jsonb_agg(v order by ord::text collate "C"),'[]') from (select to_jsonb(x) v,round_number ord from scoring_authority.rounds x where tournament_id='2026' order by (round_number)::text collate "C" limit 4) bounded),'roster',(select coalesce(jsonb_agg(v order by ord::text collate "C"),'[]') from (select to_jsonb(x) v,player_id ord from scoring_authority.tournament_players x where tournament_id='2026' order by (player_id)::text collate "C" limit 25) bounded),'HI',(select to_jsonb(x) from scoring_authority.handicap_revision_current x where tournament_id='2026'),'HIEntries',(select coalesce(jsonb_agg(v order by ord::text collate "C"),'[]') from (select to_jsonb(x) v,player_id ord from scoring_authority.handicap_revision_entries x where revision_id=(select revision_id from scoring_authority.handicap_revision_current where tournament_id='2026') order by (player_id)::text collate "C" limit 25) bounded),'course',(select to_jsonb(x) from scoring_authority.tournament_setup_course_tees_v1 x where tournament_id='2026' and course_id='OCGC01' and tee_id='Gold'),'holes',(select coalesce(jsonb_agg(v order by ord::text collate "C"),'[]') from (select to_jsonb(x) v,hole_number ord from scoring_authority.tournament_setup_course_holes_v1 x where tournament_id='2026' and course_id='OCGC01' and tee_id='Gold' order by (hole_number)::text collate "C" limit 19) bounded),'assignment',(select to_jsonb(x) from scoring_authority.tournament_setup_round_courses_v1 x where tournament_id='2026' and round_number=3),'r3participants',(select coalesce(jsonb_agg(v order by ord::text collate "C"),'[]') from (select to_jsonb(x) v,match_id||':'||team_side||':'||player_slot ord from scoring_authority.match_participants x where match_id in(select match_id from scoring_authority.matches where tournament_id='2026' and round_number=3) order by (match_id||':'||team_side||':'||player_slot)::text collate "C" limit 25) bounded),'r12authority',(select coalesce(jsonb_agg(v order by ord::text collate "C"),'[]') from (select to_jsonb(x) v,match_id ord from scoring_authority.matches x where tournament_id='2026' and round_number in(1,2) order by (match_id)::text collate "C" limit 13) bounded),'skins',(select to_jsonb(x) from scoring_authority.net_skins_v1_configuration_current x where tournament_id='2026'),'skinsConfig',(select jsonb_build_object('id',configuration_revision_id,'revision',configuration_revision,'state',state,'fingerprint',configuration_fingerprint,'manifest',configuration_manifest) from scoring_authority.net_skins_v1_configuration_revisions x where configuration_revision_id=(select configuration_revision_id from scoring_authority.net_skins_v1_configuration_current where tournament_id='2026')),'odds',(select to_jsonb(x) from scoring_authority.odds_publication_current x where tournament_id='2026'),'oddsSnapshot',(select jsonb_build_object('id',id,'publication',publication_revision,'payload',payload_hash,'source',source_fingerprint,'logical',logical_payload_hash,'settings',settings_fingerprint,'ratings',ratings_fingerprint,'pairing',pairing_fingerprint,'job',source_calculation_job_id,'current',is_current_official) from scoring_authority.odds_published_snapshots x where id=(select current_snapshot_id from scoring_authority.odds_publication_current where tournament_id='2026')),'oddsSettings',(select coalesce(jsonb_agg(v order by ord::text collate "C"),'[]') from (select jsonb_build_object('id',id,'revision',configuration_revision,'settings',settings_fingerprint,'ratings',ratings_fingerprint,'pairing',pairing_fingerprint,'bundle',bundle_fingerprint,'effective',effective_settings_fingerprint,'valid',validation_status) v,configuration_revision ord from scoring_authority.odds_input_configurations x where tournament_id='2026' and is_current order by (configuration_revision)::text collate "C" limit 2) bounded),'calcutta',(select to_jsonb(x) from scoring_authority.calcutta_v1_current x where tournament_id='2026'),'calcuttaResult',(select coalesce(jsonb_agg(v order by ord::text collate "C"),'[]') from (select jsonb_build_object('id',result_id,'revision',result_revision,'state',result_state,'source',source_fingerprint,'payload',payload_hash,'job',job_id) v,result_revision ord from scoring_authority.calcutta_v1_result_revisions x where tournament_id='2026' and is_current order by (result_revision)::text collate "C" limit 2) bounded),'calcuttaAuction',(select jsonb_build_object('id',auction_revision_id,'revision',auction_revision,'state',state,'fingerprint',auction_fingerprint,'manifest',auction_manifest) from scoring_authority.calcutta_v1_auction_fact_revisions x where auction_revision_id=(select auction_revision_id from scoring_authority.calcutta_v1_current where tournament_id='2026')),'r3Lifecycle',(select coalesce(jsonb_agg(v order by ord::text collate "C"),'[]') from (select to_jsonb(x)-array['scoring_snapshot_id','updated_at'] v,match_id ord from scoring_authority.matches x where tournament_id='2026' and round_number=3 order by (match_id)::text collate "C" limit 13) bounded),'r3Activity',jsonb_build_object('permissions',(select count(*) from scoring_authority.scoring_permissions where match_id like '2026-R3-%' and can_score and revoked_at is null),'leases',(select count(*) from scoring_authority.scoring_ingress_leases where match_id like '2026-R3-%' and expires_at>clock_timestamp()),'scores',(select count(*) from scoring_authority.hole_scores where match_id like '2026-R3-%'),'results',(select count(*) from scoring_authority.finalized_scorecard_snapshots where match_id like '2026-R3-%')),'skinsActiveJobs',(select coalesce(jsonb_agg(v order by ord::text collate "C"),'[]') from (select jsonb_build_object('id',job_id,'status',status) v,job_id ord from scoring_authority.net_skins_v1_recalculation_jobs x where tournament_id='2026' and status in('PENDING','RUNNING') order by (job_id)::text collate "C" limit 4) bounded),'calcuttaActiveJobs',(select coalesce(jsonb_agg(v order by ord::text collate "C"),'[]') from (select jsonb_build_object('id',job_id,'status',status) v,job_id ord from scoring_authority.calcutta_v1_recalculation_jobs x where tournament_id='2026' and status in('PENDING','RUNNING') order by (job_id)::text collate "C" limit 2) bounded),'oddsActiveJobs',(select coalesce(jsonb_agg(v order by ord::text collate "C"),'[]') from (select jsonb_build_object('id',job_id,'status',status) v,job_id ord from scoring_authority.odds_calculation_jobs x where tournament_id='2026' and status in('PENDING','RUNNING') order by (job_id)::text collate "C" limit 4) bounded))),'contexts',production_control.tournament_setup_hash_v1(jsonb_build_object('matches',(select coalesce(jsonb_agg(v order by ord::text collate "C"),'[]') from (select to_jsonb(x) v,match_id ord from scoring_authority.matches x where match_id in(select match_id from scoring_authority.matches where tournament_id='2026' and round_number=3) order by (match_id)::text collate "C" limit 13) bounded),'tournament_setup_match_details_v1',(select coalesce(jsonb_agg(v order by ord::text collate "C"),'[]') from (select to_jsonb(x) v,match_id ord from scoring_authority.tournament_setup_match_details_v1 x where match_id in(select match_id from scoring_authority.matches where tournament_id='2026' and round_number=3) order by (match_id)::text collate "C" limit 13) bounded),'snapshots',(select coalesce(jsonb_agg(v order by ord::text collate "C"),'[]') from (select to_jsonb(x) v,match_id ord from scoring_authority.scoring_snapshots x where snapshot_id in(select scoring_snapshot_id from scoring_authority.matches where tournament_id='2026' and round_number=3) order by (match_id)::text collate "C" limit 13) bounded),'matchHoles',(select coalesce(jsonb_agg(v order by ord::text collate "C"),'[]') from (select to_jsonb(x) v,match_id||':'||lpad(hole_number::text,2,'0') ord from scoring_authority.match_holes x where match_id in(select match_id from scoring_authority.matches where tournament_id='2026' and round_number=3) order by (match_id||':'||lpad(hole_number::text,2,'0'))::text collate "C" limit 217) bounded))));
$state$;
revoke all on function production_control.r3_existing_preparation_state_v1() from public,anon,authenticated,service_role;
-- One exact 2026 recovery. Ordinary setup/dependency/financial guards are unchanged.
create table production_control.r3_existing_preparation_receipts_v1 (
 recovery_class text primary key check(recovery_class='PREPARE_EXISTING_R3_PAIRINGS_WITH_COMPATIBLE_DEPENDENCIES'),
 operation_id uuid not null unique,
 pairing_fingerprint text not null,
 setup_revision bigint not null check(setup_revision=48),
 match_ids jsonb not null check(jsonb_array_length(match_ids)=12),
 handicap_revision integer not null check(handicap_revision=13),
 course_id text not null check(course_id='OCGC01'),
 tee text not null check(tee='Gold'),
 dependency_revisions jsonb not null,
 pre_state_hash text not null, post_state_hash text not null, protected_hash text not null,
 operator_player_id text not null, receipt jsonb not null,
 created_at timestamptz not null default clock_timestamp()
);
alter table production_control.r3_existing_preparation_receipts_v1 enable row level security;
revoke all on production_control.r3_existing_preparation_receipts_v1 from public,anon,authenticated,service_role;
create trigger r3_preparation_receipt_immutable before update or delete
 on production_control.r3_existing_preparation_receipts_v1 for each row execute function production_control.late_r3_immutable_v1();

create function public.prepare_existing_r3_with_compatible_dependencies_v1(input jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog set timezone='UTC' as $$
declare
 expected constant jsonb := '{"setupRevision":48,"handicapRevision":13,"course":"OCGC01","tee":"Gold","fingerprints":{"pairing":"7d4972d7e59c2177b9a0d9f941abd7af3ff0fb106c2f8f019136c0cec85c32a6","contexts":"d62d0e801a81844c77e2f39effb106c5cca7903782c25e868f38c1b48510391e","protected":"5ddb11258bcd7c3faee5b7933363cb95a4e96548c6d27095a93b7cc3a3bcccdb"},"dependencies":{"netSkins":3,"odds":7,"calcuttaConfiguration":2,"calcuttaAuction":37,"calcuttaPublication":41,"calcuttaResult":231}}'::jsonb;
 recovery constant text := 'PREPARE_EXISTING_R3_PAIRINGS_WITH_COMPATIBLE_DEPENDENCIES';
 before_state jsonb; after_state jsonb; retained production_control.r3_existing_preparation_receipts_v1%rowtype;
 current_match scoring_authority.matches%rowtype; s scoring_authority.scoring_snapshots%rowtype;
 d scoring_authority.tournament_setup_match_details_v1%rowtype;
 c scoring_authority.tournament_setup_course_tees_v1%rowtype; r scoring_authority.rounds%rowtype;
 h uuid; holes jsonb; manifest jsonb; context jsonb; pf text; next_id text;
 match_ids jsonb := '[]'; result jsonb; actor text; op uuid; code text;
begin
 perform production_control.assert_production_service_role();
 perform production_control.assert_tournament_setup_runtime_v1(input);
 actor:=input#>>'{authorization,player_id}';
 if input->>'recovery_class' is distinct from recovery
   or input->'expected' is distinct from expected
   or input->>'round' is distinct from '3'
   or input->>'operation_id' is null then raise exception 'R3_RECOVERY_SCOPE_MISMATCH'; end if;
 op:=(input->>'operation_id')::uuid;
 if not pg_try_advisory_xact_lock(hashtextextended('production-tournament-setup-v1:2026',0))
 then raise exception 'R3_RECOVERY_BUSY'; end if;
 -- Coordinate with ordinary and legacy writers. SELECTs remain available.
 -- No data can change between eligibility, materialization and preservation proof.
 lock table auth.users,participant_identity.participant_auth_identifiers,participant_identity.tournament_roles,participant_identity.user_player_links,production_control.director_entitlements,production_control.net_skins_entry_revisions_v1,production_control.r3_existing_preparation_receipts_v1,production_control.tournament_setup_audit_events_v1,production_control.tournament_setup_context_v1,scoring_authority.calcutta_v1_auction_fact_revisions,scoring_authority.calcutta_v1_configuration_revisions,scoring_authority.calcutta_v1_current,scoring_authority.calcutta_v1_publication_revisions,scoring_authority.calcutta_v1_recalculation_jobs,scoring_authority.calcutta_v1_result_revisions,scoring_authority.finalized_scorecard_snapshots,scoring_authority.handicap_revision_current,scoring_authority.handicap_revision_entries,scoring_authority.handicap_revisions,scoring_authority.hole_scores,scoring_authority.match_holes,scoring_authority.match_participants,scoring_authority.matches,scoring_authority.net_skins_configuration_entries,scoring_authority.net_skins_configurations,scoring_authority.net_skins_v1_configuration_current,scoring_authority.net_skins_v1_configuration_revisions,scoring_authority.net_skins_v1_recalculation_jobs,scoring_authority.net_skins_v1_result_revisions,scoring_authority.odds_calculation_jobs,scoring_authority.odds_input_configurations,scoring_authority.odds_publication_current,scoring_authority.odds_publication_public_pointer_v1,scoring_authority.odds_published_snapshots,scoring_authority.rounds,scoring_authority.score_mutations,scoring_authority.score_revision_history,scoring_authority.scoring_ingress_leases,scoring_authority.scoring_permissions,scoring_authority.scoring_snapshots,scoring_authority.tournament_players,scoring_authority.tournament_setup_course_holes_v1,scoring_authority.tournament_setup_course_tees_v1,scoring_authority.tournament_setup_match_details_v1,scoring_authority.tournament_setup_round_courses_v1 in exclusive mode nowait;
 perform production_control.assert_production_scoring_actor(input,true);
 before_state:=production_control.r3_existing_preparation_state_v1();
 select * into retained from production_control.r3_existing_preparation_receipts_v1 where recovery_class=recovery;
 if found then
   if before_state->>'pairing'=retained.pairing_fingerprint
     and before_state->>'contexts'=retained.post_state_hash
     and before_state->>'protected'=retained.protected_hash
     and not exists(select 1 from scoring_authority.matches where tournament_id='2026' and round_number=3
       and not coalesce((production_control.assert_production_match_scoring_ready_v1(match_id)->>'ready')::boolean,false))
   then return retained.receipt||jsonb_build_object('idempotent',true); end if;
   raise exception 'R3_RECOVERY_RECEIPT_STATE_MISMATCH';
 end if;
 if before_state is distinct from expected->'fingerprints' then raise exception 'R3_RECOVERY_AUTHORITY_CHANGED'; end if;
 if (select revision from production_control.tournament_setup_context_v1 where tournament_id='2026') is distinct from 48::bigint
   or (select count(*) from scoring_authority.matches where tournament_id='2026' and round_number=3)<>12
   or exists(select 1 from scoring_authority.matches where tournament_id='2026' and round_number=3
     and (status<>'UPCOMING' or format<>'SI' or scoring_locked or scored_holes<>0 or unresolved_mutations<>0
       or scorecard_complete or finalized_at is not null or result_winner<>''))
   or exists(select 1 from scoring_authority.hole_scores where match_id like '2026-R3-%')
   or exists(select 1 from scoring_authority.finalized_scorecard_snapshots where match_id like '2026-R3-%')
   or exists(select 1 from scoring_authority.score_revision_history where match_id like '2026-R3-%')
   or exists(select 1 from scoring_authority.score_mutations where match_id like '2026-R3-%')
   or exists(select 1 from scoring_authority.scoring_permissions where match_id like '2026-%' and (can_score or revoked_at is null))
   or exists(select 1 from scoring_authority.scoring_ingress_leases where tournament_id='2026' and expires_at>clock_timestamp())
 then raise exception 'R3_RECOVERY_PRISTINE_SCOPE_REQUIRED'; end if;
 if (select count(distinct p.player_id)=24 and count(*)=24 from scoring_authority.match_participants p
      join scoring_authority.matches m using(match_id) where m.tournament_id='2026' and m.round_number=3) is not true
   or exists(select 1 from scoring_authority.match_participants p join scoring_authority.matches m using(match_id)
      left join scoring_authority.tournament_players t on t.tournament_id='2026' and t.player_id=p.player_id
      where m.tournament_id='2026' and m.round_number=3 and (t.player_id is null or t.participation_status<>'ACTIVE'
        or t.team_side<>p.team_side or p.player_slot<>1))
 then raise exception 'R3_RECOVERY_PAIRING_INVALID'; end if;
 select revision_id into h from scoring_authority.handicap_revision_current where tournament_id='2026' and revision_number=13;
 if h is distinct from '7d02cc22-c634-4502-91e1-1d54d4e0edf9'::uuid then raise exception 'R3_RECOVERY_HANDICAP_MISMATCH'; end if;
 select * into strict c from scoring_authority.tournament_setup_course_tees_v1 where tournament_id='2026' and course_id='OCGC01' and tee_id='Gold';
 select * into strict r from scoring_authority.rounds where tournament_id='2026' and round_number=3;
 select jsonb_agg(jsonb_build_object('hole_number',hole_number,'par',par,'stroke_index',stroke_index,'yardage',yardage) order by hole_number)
 into holes from scoring_authority.tournament_setup_course_holes_v1 where tournament_id='2026' and course_id='OCGC01' and tee_id='Gold';
 if r.format<>'SI' or c.rating<>74.7 or c.slope<>150 or c.par<>72 or jsonb_array_length(holes)<>18
 then raise exception 'R3_RECOVERY_COURSE_MISMATCH'; end if;
 -- Exact saved Net Skins membership/pairing binding must still agree.
 if exists(select 1 from scoring_authority.net_skins_v1_configuration_revisions cfg
   cross join lateral jsonb_array_elements(cfg.configuration_manifest->'rounds') rr
   cross join lateral jsonb_array_elements(rr->'entries') ee
   where cfg.configuration_revision_id='af1b6491-bc40-499c-8dd5-fb3218a18b5e'::uuid
   and rr->>'round_number'='3' and not exists(select 1 from jsonb_array_elements(production_control.net_skins_entry_field_v1('2026',3)) f
     where f->>'key'=ee->>'entry_key' and f->>'bindingFingerprint'=ee->>'binding_fingerprint'
       and f->'playerIds'=ee->'player_ids'))
 then raise exception 'R3_RECOVERY_SKINS_BINDING_MISMATCH'; end if;
 -- Build only missing context authority. Match revisions/lifecycle and all
 -- already-canonical participant values stay byte-for-byte unchanged. This
 -- does not fire match-revision/lifecycle side-game recalculation triggers.
 for current_match in select * from scoring_authority.matches where tournament_id='2026' and round_number=3 order by match_id loop
   select * into strict s from scoring_authority.scoring_snapshots where snapshot_id=current_match.scoring_snapshot_id;
   select * into strict d from scoring_authority.tournament_setup_match_details_v1 where match_id=current_match.match_id;
   if s.snapshot_id<>current_match.match_id||':S1' or s.snapshot_revision<>1 or s.handicap_revision_id is not null
      or coalesce(s.participant_configuration->'all_ids','[]')<>'[]'
      or coalesce(s.participant_configuration->'team_1','[]')<>'[]'
      or coalesce(s.participant_configuration->'team_2','[]')<>'[]'
      or d.setup_revision<>48 or d.prepared_setup_revision is not null or d.prepared_configuration_fingerprint is not null
      or d.course_id<>'OCGC01' or d.tee_id<>'Gold' or s.course_id<>d.course_id or s.tee<>d.tee_id
      or s.rating<>c.rating or s.slope<>c.slope or s.par<>c.par or s.hole_definitions is distinct from holes
      or (select count(*) from scoring_authority.scoring_snapshots where match_id=current_match.match_id)<>1
   then raise exception 'R3_RECOVERY_EXISTING_CONTEXT_MISMATCH'; end if;
   if (select jsonb_agg(jsonb_build_object('hole_number',hole_number,'par',par,'stroke_index',stroke_index,'yardage',yardage) order by hole_number)
        from scoring_authority.match_holes where match_id=current_match.match_id) is distinct from holes
   then raise exception 'R3_RECOVERY_HOLE_BINDING_MISMATCH'; end if;
   context:=production_control.handicap_v1_match_context(current_match.match_id,h);
   if exists(select 1 from jsonb_array_elements(context->'participants') v
     left join scoring_authority.match_participants p on p.match_id=current_match.match_id and p.player_id=v->>'player_id'
     where p.player_id is null or p.handicap_revision_id is distinct from h
       or p.tournament_handicap is distinct from (v->>'tournament_handicap')::numeric
       or p.handicap_index is distinct from (v->>'handicap_index')::numeric
       or p.course_handicap is distinct from (v->>'course_handicap')::numeric
       or p.playing_handicap is distinct from (v->>'playing_handicap')::numeric
       or p.final_strokes is distinct from (v->>'final_strokes')::integer)
   then raise exception 'R3_RECOVERY_DERIVED_VALUE_MISMATCH'; end if;
   select jsonb_agg(jsonb_build_object('player_id',player_id,'team_side',team_side,'player_slot',player_slot) order by team_side,player_slot)
     into manifest from scoring_authority.match_participants where match_id=current_match.match_id;
   pf:=production_control.tournament_setup_hash_v1(jsonb_build_object('contract_version','production-tournament-setup-v1',
     'tournament_id','2026','match_id',current_match.match_id,'round_number',3,'format',current_match.format,'handicap_allowance',r.handicap_allowance,
     'course_id',d.course_id,'tee',d.tee_id,'rating',c.rating,'slope',c.slope,'par',c.par,'holes',holes,
     'participants',manifest,'handicap_revision_id',h,'setup_revision',d.setup_revision));
   next_id:=current_match.match_id||':S2';
   insert into scoring_authority.scoring_snapshots(snapshot_id,tournament_id,match_id,snapshot_revision,scoring_rules_version,format,
     handicap_allowance,course_id,tee,rating,slope,par,match_netting_baseline,hole_definitions,participant_configuration,team_configuration,
     effective_at,canonical_hash,handicap_revision_id)
   values(next_id,'2026',current_match.match_id,2,s.scoring_rules_version,current_match.format,r.handicap_allowance,d.course_id,d.tee_id,c.rating,c.slope,c.par,
     s.match_netting_baseline,holes,context->'participant_configuration',context->'team_configuration',clock_timestamp(),
     production_control.tournament_setup_hash_v1(jsonb_build_object('preparation_fingerprint',pf,'snapshot_revision',2,
       'participants',context->'participant_configuration','teams',context->'team_configuration')),h);
   update scoring_authority.matches set scoring_snapshot_id=next_id,updated_at=clock_timestamp() where match_id=current_match.match_id;
   update scoring_authority.match_holes set snapshot_id=next_id where match_id=current_match.match_id;
   update scoring_authority.tournament_setup_match_details_v1 set prepared_setup_revision=48,prepared_configuration_fingerprint=pf,
     updated_by_player_id=actor,updated_at=clock_timestamp() where match_id=current_match.match_id;
   if not coalesce((production_control.assert_production_match_scoring_ready_v1(current_match.match_id)->>'ready')::boolean,false)
   then raise exception 'R3_RECOVERY_READINESS_FAILED'; end if;
   match_ids:=match_ids||jsonb_build_array(current_match.match_id);
 end loop;
 after_state:=production_control.r3_existing_preparation_state_v1();
 if jsonb_array_length(match_ids)<>12 or after_state->>'pairing'<>before_state->>'pairing'
   or after_state->>'protected'<>before_state->>'protected'
 then raise exception 'R3_RECOVERY_PRESERVATION_FAILED'; end if;
 result:=jsonb_build_object('ok',true,'recoveryClass',recovery,'operationId',op,'round',3,'setupRevision',48,
   'pairingFingerprint',before_state->>'pairing','matchIds',match_ids,'handicapRevision',13,'course','OCGC01','tee','Gold',
   'golferIds',(select jsonb_agg(player_id order by player_id) from scoring_authority.match_participants where match_id in(select match_id from scoring_authority.matches where tournament_id='2026' and round_number=3)),'dependencies',expected->'dependencies','preStateHash',before_state->>'contexts','postStateHash',after_state->>'contexts',
   'protectedHash',after_state->>'protected','operator',actor,'at',clock_timestamp(),'ready',12,'upcoming',12,'live',0,
   'access',0,'leases',0,'scores',0,'results',0,'idempotent',false);
 insert into production_control.r3_existing_preparation_receipts_v1 values(recovery,op,before_state->>'pairing',48,match_ids,13,'OCGC01','Gold',
   expected->'dependencies',before_state->>'contexts',after_state->>'contexts',after_state->>'protected',actor,result,clock_timestamp());
 return result;
exception when others then
 get stacked diagnostics code=message_text;
 -- This exception block rolls the complete twelve-match transaction back.
 if code !~ '^(R3_RECOVERY_|PRODUCTION_|TOURNAMENT_SETUP_)[A-Z0-9_]+$' then code:='R3_RECOVERY_TRANSACTION_ABORTED'; end if;
 return jsonb_build_object('ok',false,'code',code);
end;
$$;
revoke all on function public.prepare_existing_r3_with_compatible_dependencies_v1(jsonb) from public,anon,authenticated;
grant execute on function public.prepare_existing_r3_with_compatible_dependencies_v1(jsonb) to service_role;

commit;
