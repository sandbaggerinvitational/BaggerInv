begin;
-- Certification wrapper only; the 20 installed production functions are unchanged.
-- All fixture writes and the real dispatch claim are rolled back by a caught
-- subtransaction exception BEFORE this RPC returns. No network/provider call.
create function public.accept_production_phone_hook_fixture_v1(input jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog
set statement_timeout='3s' set lock_timeout='1s' as $acceptance$
declare
 outcome jsonb:=jsonb_build_object('ok',false,'code','ACCEPTANCE_DATABASE_DENIED','fixtureRolledBack',true);
 enrollment jsonb; claim jsonb; aid uuid;
 variant text:=input->>'fixture_case';
begin
 perform production_control.assert_production_service_role();
 if variant is null or variant not in ('authorized','wrong_uuid','wrong_phone','wrong_player','missing_attempt','stale_approval','revoked_approval','stale_attempt')
 or input->>'event_hash' is null or input->>'event_hash' !~ '^[0-9a-f]{64}$' then return outcome; end if;
 -- A crashed call rolls back; overlapping calls serialize without durable fixtures.
 if not pg_try_advisory_xact_lock(hashtextextended('SMS_OFF_HOSTED_ACCEPTANCE',0)) then return outcome;end if;
 if exists(select 1 from scoring_authority.players where player_id in ('SMS_TEST_A','SMS_TEST_B'))
 or exists(select 1 from auth.users where id in ('00000000-0000-4000-8000-000000009801','00000000-0000-4000-8000-000000009802'))
 or exists(select 1 from participant_identity.player_approved_phones_v1 where phone_e164 in ('+12025550190','+12025550191')) then return outcome;end if;
 begin
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
('00000000-0000-4000-8000-000000009801','hosted-sms-a@example.invalid',now()),
('00000000-0000-4000-8000-000000009802','hosted-sms-b@example.invalid',now());
INSERT INTO scoring_authority.players(player_id,display_name) VALUES('SMS_TEST_A','Uncommitted SMS acceptance A'),('SMS_TEST_B','Uncommitted SMS acceptance B');

INSERT INTO scoring_authority.tournament_players(tournament_id,player_id,team_id,team_side,source_roster_key) SELECT '2026','SMS_TEST_A',team_id,team_side,'UNCOMMITTED_SMS_TEST_A' FROM scoring_authority.tournament_players WHERE tournament_id='2026' ORDER BY player_id LIMIT 1;
INSERT INTO participant_identity.participant_identity_contacts(tournament_id,player_id,email,email_normalized,identity_active,configuration_revision,source_system) VALUES('2026','SMS_TEST_A','hosted-sms-a@example.invalid','hosted-sms-a@example.invalid',true,1,'UNCOMMITTED_ACCEPTANCE');
INSERT INTO participant_identity.user_player_links(auth_user_id,player_id,status,link_method,email_identity_hash,linked_at,linked_by) VALUES('00000000-0000-4000-8000-000000009801','SMS_TEST_A','ACTIVE','EMAIL',encode(sha256(convert_to('hosted-sms-a@example.invalid','UTF8')),'hex'),now(),'UNCOMMITTED_ACCEPTANCE');
INSERT INTO participant_identity.participant_auth_identifiers(player_id,auth_user_id,identifier_type,normalized_value_private,status,verified_at,source_system,source_tournament_id,created_by,updated_by) VALUES('SMS_TEST_A','00000000-0000-4000-8000-000000009801','EMAIL','hosted-sms-a@example.invalid','VERIFIED',now(),'EMAIL','2026','UNCOMMITTED_ACCEPTANCE','UNCOMMITTED_ACCEPTANCE');
INSERT INTO participant_identity.player_approved_phones_v1(tournament_id,player_id,phone_e164,status,phone_revision,approved_at,approved_by_player_id,approved_by_auth_user_id) VALUES('2026','SMS_TEST_A','+12025550190','APPROVED',1,now(),'SMS_TEST_A','00000000-0000-4000-8000-000000009801');

INSERT INTO scoring_authority.tournament_players(tournament_id,player_id,team_id,team_side,source_roster_key) SELECT '2026','SMS_TEST_B',team_id,team_side,'UNCOMMITTED_SMS_TEST_B' FROM scoring_authority.tournament_players WHERE tournament_id='2026' ORDER BY player_id LIMIT 1;
INSERT INTO participant_identity.participant_identity_contacts(tournament_id,player_id,email,email_normalized,identity_active,configuration_revision,source_system) VALUES('2026','SMS_TEST_B','hosted-sms-b@example.invalid','hosted-sms-b@example.invalid',true,1,'UNCOMMITTED_ACCEPTANCE');
INSERT INTO participant_identity.user_player_links(auth_user_id,player_id,status,link_method,email_identity_hash,linked_at,linked_by) VALUES('00000000-0000-4000-8000-000000009802','SMS_TEST_B','ACTIVE','EMAIL',encode(sha256(convert_to('hosted-sms-b@example.invalid','UTF8')),'hex'),now(),'UNCOMMITTED_ACCEPTANCE');
INSERT INTO participant_identity.participant_auth_identifiers(player_id,auth_user_id,identifier_type,normalized_value_private,status,verified_at,source_system,source_tournament_id,created_by,updated_by) VALUES('SMS_TEST_B','00000000-0000-4000-8000-000000009802','EMAIL','hosted-sms-b@example.invalid','VERIFIED',now(),'EMAIL','2026','UNCOMMITTED_ACCEPTANCE','UNCOMMITTED_ACCEPTANCE');
INSERT INTO participant_identity.player_approved_phones_v1(tournament_id,player_id,phone_e164,status,phone_revision,approved_at,approved_by_player_id,approved_by_auth_user_id) VALUES('2026','SMS_TEST_B','+12025550191','APPROVED',1,now(),'SMS_TEST_B','00000000-0000-4000-8000-000000009802');


 if variant='revoked_approval' then
 update participant_identity.player_approved_phones_v1 set status='REVOKED',revoked_at=clock_timestamp() where player_id='SMS_TEST_A';
 end if;
 enrollment:=public.production_participant_phone_enrollment_v1(jsonb_build_object('action','begin',
 'auth_user_id','00000000-0000-4000-8000-000000009801','player_id',case when variant='wrong_player' then 'SMS_TEST_B' else 'SMS_TEST_A' end,
 'tournament_id','2026','approval_revision',case when variant='stale_approval' then 2 else 1 end,'client_fingerprint',input->>'event_hash'));
 if enrollment->>'ok' is distinct from 'true' or enrollment->>'status' is distinct from 'REQUESTING' then raise exception 'ACCEPTANCE_ENROLLMENT_DENIED';end if;
 aid:=(enrollment->>'challengeId')::uuid;
 if variant='missing_attempt' then delete from participant_identity.participant_phone_otp_attempts where attempt_id=aid;end if;
 if variant='stale_attempt' then update participant_identity.participant_phone_otp_attempts set expires_at=clock_timestamp()-interval '1 second' where attempt_id=aid;end if;
 claim:=public.production_participant_phone_dispatch_v1(jsonb_build_object('action','claim','auth_user_id',input->>'auth_user_id','phone_e164',input->>'phone_e164','event_hash',input->>'event_hash'));
 if claim->>'ok' is distinct from 'true' or claim->>'state' is distinct from 'CLAIMED' or claim->>'attemptId' is distinct from aid::text then raise exception 'ACCEPTANCE_CLAIM_DENIED';end if;
 outcome:=jsonb_build_object('ok',true,'code','ACCEPTANCE_DATABASE_ROLLED_BACK','authorized',true,
 'fixtureRolledBack',true,'directorPhoneValidated',true,'attemptValidated',true,'playerId','SMS_TEST_A','authUserId','00000000-0000-4000-8000-000000009801');
 -- PL/pgSQL variables survive subtransaction rollback; database changes do not.
 raise exception using errcode='BGA01',message='ACCEPTANCE_ROLLBACK_ONLY';
 exception when sqlstate 'BGA01' then null;
 when others then outcome:=jsonb_build_object('ok',false,'code','ACCEPTANCE_DATABASE_DENIED','fixtureRolledBack',true);
 end;
 if exists(select 1 from scoring_authority.players where player_id in ('SMS_TEST_A','SMS_TEST_B'))
 or exists(select 1 from auth.users where id in ('00000000-0000-4000-8000-000000009801','00000000-0000-4000-8000-000000009802')) then raise exception 'ACCEPTANCE_CLEANUP_FAILED';end if;
 return outcome;
end;$acceptance$;
revoke all on function public.accept_production_phone_hook_fixture_v1(jsonb) from public,anon,authenticated;
grant execute on function public.accept_production_phone_hook_fixture_v1(jsonb) to service_role;
commit;
