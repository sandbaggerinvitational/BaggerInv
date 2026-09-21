-- LOCAL CANDIDATE ONLY. Install after authority + enrollment candidates, SMS still OFF.
-- No roster copy, Auth-user backfill, provider send, or phone credential repair.
begin;
alter table participant_identity.participant_phone_otp_attempts
 add column provider_send_count integer not null default 0 check(provider_send_count between 0 and 3),
 add column provider_send_events text[] not null default '{}',
 add column provider_send_state text check(provider_send_state in ('CLAIMED','SENT','FAILED','UNCERTAIN')),
 add column provider_send_event_hash text check(provider_send_event_hash ~ '^[0-9a-f]{64}$'),
 add column provider_send_started_at timestamptz,
 add column provider_send_finished_at timestamptz,
 add column provider_pending_written_at timestamptz,
 add column provider_verify_claimed_at timestamptz,
 add column provider_confirmed_at timestamptz,
 add column reservation_phone_key text;
-- Fail installation on pre-existing ambiguity; never repair data implicitly.
create unique index production_phone_pending_unique_v1 on auth.users
 (participant_identity.canonical_auth_phone(phone_change)) where nullif(phone_change,'') is not null;
alter table participant_identity.participant_phone_otp_attempts
 add column verify_service_sid text check(verify_service_sid ~ '^VA[0-9a-f]{32}$'),
 add column verification_sid text check(verification_sid ~ '^VE[0-9a-f]{32}$'),
 add column verification_sids text[] not null default '{}',
 add column verify_feedback_state text check(verify_feedback_state in ('CLAIMED','ACKNOWLEDGED','UNCERTAIN')),
 add column verify_feedback_at timestamptz;
create unique index production_phone_verify_receipt_v1 on participant_identity.participant_phone_otp_attempts(verification_sid);
create unique index production_phone_dispatch_unique_v1 on participant_identity.participant_phone_otp_attempts(provider_send_event_hash);
create unique index production_phone_active_auth_v1 on participant_identity.participant_phone_otp_attempts(auth_user_id) where status in ('REQUESTING','SENT');
create unique index production_phone_active_player_v1 on participant_identity.participant_phone_otp_attempts(player_id) where status in ('REQUESTING','SENT');
create unique index production_phone_active_phone_v1 on participant_identity.participant_phone_otp_attempts(reservation_phone_key) where status in ('REQUESTING','SENT');

create function participant_identity.production_phone_reservation_v1() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
declare i participant_identity.participant_auth_identifiers%rowtype;
begin
 if TG_OP='UPDATE' and (new.auth_user_id,new.player_id,new.identifier_id,new.identifier_revision,new.tournament_id,new.enrollment_approval_revision)
 is distinct from (old.auth_user_id,old.player_id,old.identifier_id,old.identifier_revision,old.tournament_id,old.enrollment_approval_revision) then
 raise exception 'PHONE_ATTEMPT_BINDING_IMMUTABLE'; end if;
 select * into strict i from participant_identity.participant_auth_identifiers where identifier_id=new.identifier_id;
 if i.auth_user_id<>new.auth_user_id or i.player_id<>new.player_id or i.source_tournament_id<>new.tournament_id or i.identifier_type<>'PHONE' then
 raise exception 'PHONE_ATTEMPT_BINDING_INVALID'; end if;
 new.reservation_phone_key:=encode(sha256(convert_to(participant_identity.canonical_auth_phone(i.normalized_value_private),'UTF8')),'hex');
 return new;
end;$$;
create trigger production_phone_reservation_v1 before insert or update on participant_identity.participant_phone_otp_attempts
for each row execute function participant_identity.production_phone_reservation_v1();

-- Common exact-authority check. Lock approval -> identifier -> attempt everywhere.
-- Do not lock auth.users here: an Auth transaction invokes the HTTP hook before its own UPDATE.
create function participant_identity.production_phone_assert_attempt_v1(aid uuid, at_auth_boundary boolean default false)
returns participant_identity.participant_phone_otp_attempts language plpgsql security definer set search_path=pg_catalog as $$
declare a participant_identity.participant_phone_otp_attempts%rowtype;
 p participant_identity.player_approved_phones_v1%rowtype;
 i participant_identity.participant_auth_identifiers%rowtype; c jsonb; t text; scope production_control.resource_scope%rowtype;
begin
 select * into strict a from participant_identity.participant_phone_otp_attempts where attempt_id=aid;
 select * into strict p from participant_identity.player_approved_phones_v1 where tournament_id=a.tournament_id and player_id=a.player_id for update;
 select * into strict i from participant_identity.participant_auth_identifiers where identifier_id=a.identifier_id for update;
 select * into strict a from participant_identity.participant_phone_otp_attempts where attempt_id=aid for update;
 if at_auth_boundary then
 -- Auth's database connection does not carry a PostgREST service JWT. Validate
 -- the same canonical 2026 resource/link/contact/membership records directly;
 -- never manufacture a service-role claim or relax the public RPC guard.
 -- This fixed-cohort provider adapter intentionally rejects future tournaments.
 select tournament_id into strict t from production_control.current_tournament_pointer_v1 where scope_key='BAGGER_INV_PRODUCTION' and tournament_year=2026 for share;
 select * into strict scope from production_control.resource_scope where scope_key='BAGGER_INV_PRODUCTION' for share;
 if t<>'2026' or scope.project_ref<>'ymqhhtxaywtqllynrmxe' or scope.project_url<>'https://ymqhhtxaywtqllynrmxe.supabase.co'
 or scope.google_workbook_id<>'1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4' or scope.vercel_project<>'bagger-inv'
 or scope.canonical_domain<>'https://baggerinv.com' or scope.current_tournament_id<>'2026' or scope.current_tournament_year<>2026
 or scope.participant_identity_authority<>'SUPABASE' or not scope.auth_user_creation_enabled then raise exception 'PHONE_PRODUCTION_SCOPE_DENIED'; end if;
 perform 1 from production_control.cutover_activation_state where scope_key='BAGGER_INV_PRODUCTION' and state<>'DORMANT' and expected_deployment_commit is not null for share;
 if not found then raise exception 'PHONE_PRODUCTION_SCOPE_DENIED'; end if;
 perform 1 from participant_identity.participant_identity_contacts where tournament_id=t and player_id=a.player_id and identity_active for share;
 if not found or not exists(select 1 from participant_identity.participant_identity_contacts v join auth.users u on u.id=a.auth_user_id where v.tournament_id=t and v.player_id=a.player_id and v.email_normalized=lower(btrim(u.email))) then raise exception 'PHONE_CONTACT_DENIED'; end if;
 perform 1 from scoring_authority.tournament_players where tournament_id=t and player_id=a.player_id and participation_status='ACTIVE' for share;
 if not found then raise exception 'PHONE_MEMBERSHIP_DENIED'; end if;
 perform 1 from participant_identity.user_player_links where player_id=a.player_id or auth_user_id=a.auth_user_id for share;
 c:=public.read_participant_identity_context(t,a.player_id);
 else
 t:=participant_identity.production_phone_runtime_v1()->>'tournamentId';
 c:=participant_identity.production_phone_context_v1(a.auth_user_id,t);
 end if;
 if t is distinct from '2026' or a.tournament_id<>t or c->>'ok' is distinct from 'true' or c#>>'{data,playerId}' is distinct from a.player_id
 or c#>>'{data,tournament,id}' is distinct from t
 or not exists(select 1 from participant_identity.user_player_links where auth_user_id=a.auth_user_id and player_id=a.player_id and status='ACTIVE' and revoked_at is null)
 or (select count(*) from participant_identity.user_player_links where auth_user_id=a.auth_user_id and status='ACTIVE' and revoked_at is null)<>1
 or (select count(*) from participant_identity.user_player_links where player_id=a.player_id and status in ('PENDING','ACTIVE','SUSPENDED'))<>1
 or a.requested_by_auth_user_id<>a.auth_user_id or a.status not in ('REQUESTING','SENT') or a.expires_at<=clock_timestamp()
 or a.expires_at>a.requested_at+interval '10 minutes 1 second'
 or p.status not in ('APPROVED','VERIFIED') or p.revoked_at is not null or p.phone_e164 !~ '^\+[1-9][0-9]{7,14}$'
 or i.status not in ('VERIFICATION_PENDING','VERIFIED') or i.revoked_at is not null
 or i.identifier_type<>'PHONE' or i.auth_user_id<>a.auth_user_id or i.player_id<>a.player_id or i.source_tournament_id<>t
 or i.revision<>a.identifier_revision or i.normalized_value_private<>p.phone_e164 or i.approved_phone_revision is distinct from p.phone_revision
 or (a.enrollment_approval_revision is not null and a.enrollment_approval_revision<>p.phone_revision)
 or (a.enrollment_approval_revision is null and (p.status<>'VERIFIED' or i.status<>'VERIFIED' or p.verified_at is null))
 then raise exception 'PHONE_AUTHORITY_DENIED'; end if;
 if not exists(select 1 from auth.users u join participant_identity.participant_auth_identifiers e on e.auth_user_id=u.id
 where u.id=a.auth_user_id and u.email_confirmed_at is not null and e.identifier_type='EMAIL' and e.status='VERIFIED'
 and e.player_id=a.player_id and e.source_tournament_id=t and e.normalized_value_private=lower(btrim(u.email))) then raise exception 'PHONE_EMAIL_REQUIRED'; end if;
 if exists(select 1 from auth.users u where u.id<>a.auth_user_id and (participant_identity.canonical_auth_phone(u.phone)=participant_identity.canonical_auth_phone(p.phone_e164)
 or participant_identity.canonical_auth_phone(u.phone_change)=participant_identity.canonical_auth_phone(p.phone_e164)))
 or exists(select 1 from auth.identities v where v.provider='phone' and v.user_id<>a.auth_user_id and participant_identity.canonical_auth_phone(v.identity_data->>'phone')=participant_identity.canonical_auth_phone(p.phone_e164))
 or exists(select 1 from participant_identity.player_approved_phones_v1 v where (v.tournament_id,v.player_id)<>(t,a.player_id) and v.status in ('APPROVED','VERIFIED') and v.revoked_at is null and v.phone_e164=p.phone_e164)
 then raise exception 'PHONE_COLLISION'; end if;
 return a;
end;$$;

-- Only authenticated server hook calls this operation. No OTP/payload stored.
create function public.production_participant_phone_dispatch_v1(input jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare a participant_identity.participant_phone_otp_attempts%rowtype; aid uuid;
 actor uuid:=nullif(input->>'auth_user_id','')::uuid; destination text:=input->>'phone_e164'; event_hash text:=input->>'event_hash'; action text:=input->>'action'; i participant_identity.participant_auth_identifiers%rowtype;
begin
 if event_hash is null or event_hash !~ '^[0-9a-f]{64}$' or actor is null or destination is null or destination !~ '^\+[1-9][0-9]{7,14}$' then raise exception 'PHONE_SEND_DENIED'; end if;
 select attempt_id into strict aid from participant_identity.participant_phone_otp_attempts where auth_user_id=actor and status in ('REQUESTING','SENT');
 a:=participant_identity.production_phone_assert_attempt_v1(aid);
 select * into strict i from participant_identity.participant_auth_identifiers where identifier_id=a.identifier_id;
 if i.normalized_value_private<>destination then raise exception 'PHONE_SEND_DENIED'; end if;
 if action='claim' then
 if a.status<>'REQUESTING' or a.safe_reason not in ('PHONE_ENROLLMENT_SENDING','PHONE_LOGIN_PREFLIGHT_PASSED') or a.provider_send_state is not null
 or exists(select 1 from auth.users where id=actor and nullif(phone_change,'') is not null and (a.enrollment_approval_revision is null or a.provider_send_count=0 or participant_identity.canonical_auth_phone(phone_change)<>participant_identity.canonical_auth_phone(destination)))
 or exists(select 1 from participant_identity.participant_phone_otp_attempts where event_hash=any(provider_send_events))
 or a.provider_send_count>=3
 or (a.enrollment_approval_revision is not null and exists(select 1 from auth.users where id=actor and nullif(phone,'') is not null))
 then raise exception 'PHONE_SEND_DENIED'; end if;
 update participant_identity.participant_phone_otp_attempts set provider_send_count=provider_send_count+1,provider_send_events=array_append(provider_send_events,event_hash),provider_send_state='CLAIMED',provider_send_event_hash=event_hash,provider_send_started_at=clock_timestamp() where attempt_id=aid;
 elsif action in ('sent','failed','uncertain') then
 if a.provider_send_event_hash is distinct from event_hash or a.provider_send_state<>'CLAIMED' then raise exception 'PHONE_SEND_REPLAY'; end if;
 if action='sent' then
 if input->>'verification_sid' is null or input->>'verification_sid' !~ '^VE[0-9a-f]{32}$'
 or input->>'verify_service_sid' is null or input->>'verify_service_sid' !~ '^VA[0-9a-f]{32}$'
 or (a.verify_service_sid is not null and a.verify_service_sid<>input->>'verify_service_sid')
 or exists(select 1 from participant_identity.participant_phone_otp_attempts where (input->>'verification_sid')=any(verification_sids))
 then raise exception 'PHONE_VERIFY_RECEIPT_INVALID';end if;
 update participant_identity.participant_phone_otp_attempts set verification_sid=input->>'verification_sid',verify_service_sid=input->>'verify_service_sid',verification_sids=array_append(verification_sids,input->>'verification_sid') where attempt_id=aid;
 end if;
 update participant_identity.participant_phone_otp_attempts set provider_send_state=upper(action),provider_send_finished_at=clock_timestamp() where attempt_id=aid;
 else raise exception 'PHONE_SEND_DENIED'; end if;
 return jsonb_build_object('ok',true,'attemptId',aid,'state',case when action='claim' then 'CLAIMED' else upper(action) end,'priorVerificationSid',a.verification_sid,'verifyServiceSid',a.verify_service_sid);
end;$$;
revoke all on function public.production_participant_phone_dispatch_v1(jsonb) from public,anon,authenticated;
grant execute on function public.production_participant_phone_dispatch_v1(jsonb) to service_role;

create function participant_identity.production_auth_phone_write_v1() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
declare a participant_identity.participant_phone_otp_attempts%rowtype; aid uuid; target text;
begin
 if TG_OP='INSERT' then
 if nullif(new.phone,'') is not null or nullif(new.phone_change,'') is not null or new.phone_confirmed_at is not null then raise exception 'PHONE_SIGNUP_DENIED'; end if;
 return new; end if;
 -- Email/session/metadata writes do not acquire enrollment authority or get blocked.
 if (new.phone,new.phone_change,new.phone_confirmed_at,new.phone_change_token,new.phone_change_sent_at)
 is not distinct from (old.phone,old.phone_change,old.phone_confirmed_at,old.phone_change_token,old.phone_change_sent_at) then return new; end if;
 if new.id<>old.id then raise exception 'PHONE_AUTH_UUID_IMMUTABLE'; end if;
 if new.phone is not distinct from old.phone and new.phone_confirmed_at is not distinct from old.phone_confirmed_at
 and (nullif(new.phone_change,'') is null or new.phone_change is not distinct from old.phone_change)
 and nullif(new.phone_change_token,'') is null and new.phone_change_sent_at is null then
 update participant_identity.participant_phone_otp_attempts set safe_reason='PHONE_PROVIDER_SECURITY_INVALIDATED',updated_at=clock_timestamp() where auth_user_id=new.id and status in ('REQUESTING','SENT');
 return new; end if;
 select attempt_id into strict aid from participant_identity.participant_phone_otp_attempts where auth_user_id=new.id and status in ('REQUESTING','SENT');
 a:=participant_identity.production_phone_assert_attempt_v1(aid,true);
 select participant_identity.canonical_auth_phone(normalized_value_private) into strict target from participant_identity.participant_auth_identifiers where identifier_id=a.identifier_id;
 if a.provider_send_state is distinct from 'SENT' then raise exception 'PHONE_SEND_RECEIPT_REQUIRED'; end if;
 if a.enrollment_approval_revision is not null and a.status='REQUESTING' and a.safe_reason='PHONE_ENROLLMENT_SENDING'
 and a.provider_pending_written_at is null and nullif(old.phone,'') is null
 and (nullif(old.phone_change,'') is null or (a.provider_send_count>1 and participant_identity.canonical_auth_phone(old.phone_change)=target))
 and new.phone is not distinct from old.phone and new.phone_confirmed_at is not distinct from old.phone_confirmed_at
 and participant_identity.canonical_auth_phone(new.phone_change)=target and nullif(new.phone_change_token,'') is not null and new.phone_change_sent_at is not null then
 update participant_identity.participant_phone_otp_attempts set provider_pending_written_at=clock_timestamp() where attempt_id=aid;
 elsif a.enrollment_approval_revision is not null and a.status='REQUESTING' and a.safe_reason='PHONE_ENROLLMENT_VERIFYING'
 and a.provider_pending_written_at is not null and a.provider_confirmed_at is null
 and participant_identity.canonical_auth_phone(old.phone_change)=target and nullif(old.phone,'') is null
 and participant_identity.canonical_auth_phone(new.phone)=target and nullif(new.phone_change,'') is null
 and nullif(new.phone_change_token,'') is null and new.phone_confirmed_at is not null then
 update participant_identity.participant_phone_otp_attempts set provider_confirmed_at=clock_timestamp() where attempt_id=aid;
 elsif a.enrollment_approval_revision is null and a.status='SENT' and a.safe_reason='PHONE_LOGIN_CODE_SENT'
 and a.provider_verify_claimed_at is not null and a.provider_confirmed_at is null
 and new.phone is not distinct from old.phone and participant_identity.canonical_auth_phone(new.phone)=target
 and nullif(old.phone_change,'') is null and new.phone_change is not distinct from old.phone_change
 and new.phone_change_token is not distinct from old.phone_change_token and new.phone_change_sent_at is not distinct from old.phone_change_sent_at
 and old.phone_confirmed_at is not null and new.phone_confirmed_at is not null then
 update participant_identity.participant_phone_otp_attempts set provider_confirmed_at=clock_timestamp() where attempt_id=aid;
 else raise exception 'PHONE_TRANSITION_DENIED'; end if;
 return new;
end;$$;
create trigger production_auth_phone_write_v1 before insert or update on auth.users for each row execute function participant_identity.production_auth_phone_write_v1();

-- Keep uncertain remote operations reserved even after the challenge expires.
create function participant_identity.production_phone_terminal_guard_v1() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
begin
 if new.status='EXPIRED' and new.safe_reason='PHONE_ENROLLMENT_EXPIRED' and old.safe_reason='PHONE_PROVIDER_SECURITY_INVALIDATED'
 and old.provider_send_state='SENT' and old.provider_pending_written_at is not null and old.provider_confirmed_at is null and old.provider_verify_claimed_at is null
 and old.expires_at<=clock_timestamp() and exists(select 1 from auth.users where id=old.auth_user_id and nullif(phone,'') is null and nullif(phone_change,'') is null) then return new; end if;
 if old.status in ('REQUESTING','SENT') and new.status not in ('REQUESTING','SENT','VERIFIED')
 and (old.provider_send_state in ('CLAIMED','UNCERTAIN') or old.provider_verify_claimed_at is not null or old.safe_reason='PHONE_ENROLLMENT_VERIFYING'
 or (old.enrollment_approval_revision is not null and old.provider_send_state='SENT')) then
 raise exception 'PHONE_PENDING_REVIEW_REQUIRED'; end if;
 return new;
end;$$;
create trigger production_phone_terminal_guard_v1 before update on participant_identity.participant_phone_otp_attempts for each row execute function participant_identity.production_phone_terminal_guard_v1();
-- All helper functions private, including to ordinary service-role RPC callers.
revoke all on function participant_identity.production_phone_reservation_v1(),participant_identity.production_phone_assert_attempt_v1(uuid,boolean),
 participant_identity.production_auth_phone_write_v1(),participant_identity.production_phone_terminal_guard_v1() from public,anon,authenticated,service_role;

-- Server-only, one-shot feedback. Never an authentication/verification authority.
create function public.production_participant_phone_feedback_v1(input jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare a participant_identity.participant_phone_otp_attempts%rowtype;i participant_identity.participant_auth_identifiers%rowtype;action text:=input->>'action';
begin
 perform production_control.assert_production_service_role();
 select * into strict a from participant_identity.participant_phone_otp_attempts where attempt_id=(input->>'attempt_id')::uuid for update;
 if a.auth_user_id is distinct from (input->>'auth_user_id')::uuid or a.status<>'VERIFIED' or a.provider_confirmed_at is null or a.used_at is null
 or a.verification_sid is null or a.verify_service_sid is null or a.provider_send_state<>'SENT' then raise exception 'PHONE_FEEDBACK_DENIED';end if;
 select * into strict i from participant_identity.participant_auth_identifiers where identifier_id=a.identifier_id;
 if action='claim' then
 if a.verify_feedback_state is not null then raise exception 'PHONE_FEEDBACK_REPLAY';end if;
 update participant_identity.participant_phone_otp_attempts set verify_feedback_state='CLAIMED',verify_feedback_at=clock_timestamp() where attempt_id=a.attempt_id;
 elsif action in ('acknowledged','uncertain') then
 if a.verify_feedback_state is distinct from 'CLAIMED' then raise exception 'PHONE_FEEDBACK_REPLAY';end if;
 update participant_identity.participant_phone_otp_attempts set verify_feedback_state=upper(action),verify_feedback_at=clock_timestamp() where attempt_id=a.attempt_id;
 else raise exception 'PHONE_FEEDBACK_DENIED';end if;
 return jsonb_build_object('ok',true,'state',case when action='claim' then 'CLAIMED' else upper(action) end,'attemptId',a.attempt_id,'verificationSid',a.verification_sid,'verifyServiceSid',a.verify_service_sid,'phoneE164',i.normalized_value_private);
end;$$;
revoke all on function public.production_participant_phone_feedback_v1(jsonb) from public,anon,authenticated;
grant execute on function public.production_participant_phone_feedback_v1(jsonb) to service_role;
commit;
