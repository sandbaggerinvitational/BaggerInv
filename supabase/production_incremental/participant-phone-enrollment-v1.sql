-- LOCAL ONLY. Requires participant-phone-authority-v1.sql first.
-- No roster/backfill, Auth user creation, or provider mutation. Derived proof metadata only.
begin;
alter table participant_identity.participant_phone_otp_attempts
 add column enrollment_approval_revision bigint check (enrollment_approval_revision > 0);

create function participant_identity.production_phone_approval_invalidate_v1()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
 if TG_OP='UPDATE' and new.phone_e164=old.phone_e164 and new.phone_revision=old.phone_revision
 and new.status in ('APPROVED','VERIFIED') and new.revoked_at is null then return new; end if;
 update participant_identity.participant_phone_otp_attempts a set status='CANCELLED',safe_reason='PHONE_APPROVAL_CHANGED',updated_at=clock_timestamp()
 where a.tournament_id=old.tournament_id and a.player_id=old.player_id and a.status in ('REQUESTING','SENT');
 update participant_identity.participant_auth_identifiers i set status='REVOKED',revoked_at=clock_timestamp(),
 revoked_by='DIRECTOR_APPROVAL',revoke_reason='PHONE_APPROVAL_CHANGED',revision=revision+1,updated_at=clock_timestamp()
 where i.source_tournament_id=old.tournament_id and i.player_id=old.player_id and i.identifier_type='PHONE' and i.status<>'REVOKED';
 if TG_OP='DELETE' then return old; end if; return new;
end;$$;
revoke all on function participant_identity.production_phone_approval_invalidate_v1() from public,anon,authenticated,service_role;
create trigger production_phone_approval_invalidate_v1 before update or delete on participant_identity.player_approved_phones_v1
 for each row execute function participant_identity.production_phone_approval_invalidate_v1();

-- Serialize approval/identifier/attempt transitions. Inputs come only from the server's
-- verified Email enrollment proof; anon/authenticated callers cannot execute this RPC.
create function public.production_participant_phone_enrollment_v1(input jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
 actor uuid := nullif(input->>'auth_user_id','')::uuid;
 tour text; player text; context jsonb; runtime jsonb;
 action text := input->>'action';
 approval participant_identity.player_approved_phones_v1%rowtype;
 identifier participant_identity.participant_auth_identifiers%rowtype;
 attempt participant_identity.participant_phone_otp_attempts%rowtype;
 user_row auth.users%rowtype;
 target_attempt uuid := nullif(input->>'challenge_id','')::uuid;
 fingerprint text := input->>'client_fingerprint';
 stamp timestamptz := clock_timestamp();
 result jsonb;
begin
 runtime:=participant_identity.production_phone_runtime_v1(); tour:=runtime->>'tournamentId';
 if actor is null or action not in ('state','begin','resend','expire','sent','send_failed','verify','verify_failed','complete') then
 return jsonb_build_object('ok',false,'code','PHONE_ENROLLMENT_DENIED'); end if;
 if (select count(*) from participant_identity.user_player_links where auth_user_id=actor and status='ACTIVE' and revoked_at is null)<>1 then
 return jsonb_build_object('ok',false,'code','PHONE_ENROLLMENT_DENIED'); end if;
 select player_id into player from participant_identity.user_player_links where auth_user_id=actor and status='ACTIVE' and revoked_at is null;
 if (select count(*) from participant_identity.user_player_links where player_id=player and status in ('PENDING','ACTIVE','SUSPENDED'))<>1 then
 return jsonb_build_object('ok',false,'code','PHONE_ENROLLMENT_DENIED'); end if;
 context:=participant_identity.production_phone_context_v1(actor,tour);
 if context->>'ok' is distinct from 'true' or context#>>'{data,playerId}' is distinct from player
 or context#>>'{data,tournament,id}' is distinct from tour or input->>'player_id' is distinct from player
 or input->>'tournament_id' is distinct from tour then
 return jsonb_build_object('ok',false,'code','PHONE_ENROLLMENT_DENIED'); end if;
 select * into approval from participant_identity.player_approved_phones_v1 where tournament_id=tour and player_id=player for update;
 if not found or approval.status not in ('APPROVED','VERIFIED') or approval.revoked_at is not null
 or approval.phone_e164 !~ '^\+[1-9][0-9]{7,14}$' then
 return jsonb_build_object('ok',false,'code','PHONE_ENROLLMENT_NOT_ELIGIBLE'); end if;
 select * into user_row from auth.users where id=actor;
 if not found or user_row.email_confirmed_at is null
 or not exists(select 1 from participant_identity.participant_auth_identifiers i where i.auth_user_id=actor and i.player_id=player
 and i.source_tournament_id=tour and i.identifier_type='EMAIL' and i.status='VERIFIED'
 and i.normalized_value_private=lower(btrim(user_row.email))) then
 return jsonb_build_object('ok',false,'code','PHONE_ENROLLMENT_EMAIL_REQUIRED'); end if;
 if exists(select 1 from participant_identity.player_approved_phones_v1 p where p.status in ('APPROVED','VERIFIED')
 and (p.player_id<>player or p.tournament_id<>tour) and participant_identity.canonical_auth_phone(p.phone_e164)=participant_identity.canonical_auth_phone(approval.phone_e164))
 or exists(select 1 from participant_identity.participant_auth_identifiers i where i.identifier_type='PHONE' and i.status<>'REVOKED'
 and (i.player_id<>player or i.auth_user_id<>actor) and participant_identity.canonical_auth_phone(i.normalized_value_private)=participant_identity.canonical_auth_phone(approval.phone_e164))
 or exists(select 1 from auth.users u where u.id<>actor and
 (participant_identity.canonical_auth_phone(nullif(u.phone,''))=participant_identity.canonical_auth_phone(approval.phone_e164)
 or participant_identity.canonical_auth_phone(nullif(u.phone_change,''))=participant_identity.canonical_auth_phone(approval.phone_e164)))
 or exists(select 1 from auth.identities i where i.provider='phone' and i.user_id<>actor
 and participant_identity.canonical_auth_phone(i.identity_data->>'phone')=participant_identity.canonical_auth_phone(approval.phone_e164)) then
 return jsonb_build_object('ok',false,'code','PHONE_ENROLLMENT_CONFLICT'); end if;
 -- Never overwrite a different existing or pending provider credential.
 if (nullif(user_row.phone,'') is not null and participant_identity.canonical_auth_phone(user_row.phone)<>participant_identity.canonical_auth_phone(approval.phone_e164))
 or (nullif(user_row.phone_change,'') is not null and participant_identity.canonical_auth_phone(user_row.phone_change)<>participant_identity.canonical_auth_phone(approval.phone_e164)) then
 return jsonb_build_object('ok',false,'code','PHONE_ENROLLMENT_REVIEW_REQUIRED'); end if;
 select * into identifier from participant_identity.participant_auth_identifiers where player_id=player and identifier_type='PHONE' and status<>'REVOKED' for update;
 stamp:=clock_timestamp();
 if found and (identifier.auth_user_id<>actor or identifier.source_tournament_id<>tour
 or identifier.normalized_value_private<>approval.phone_e164 or identifier.approved_phone_revision is distinct from approval.phone_revision) then
 return jsonb_build_object('ok',false,'code','PHONE_ENROLLMENT_REVIEW_REQUIRED'); end if;
 result:=jsonb_build_object('ok',true,'playerId',player,'tournamentId',tour,'approvalRevision',approval.phone_revision,
 'maskedPhone','••• ••• '||right(approval.phone_e164,4),'phoneE164',approval.phone_e164,'authUserId',actor);
 if action='state' then
 return result||jsonb_build_object('status',case when approval.status='VERIFIED' and identifier.status='VERIFIED' then 'VERIFIED' else 'ELIGIBLE' end); end if;
 if action='begin' then
 if nullif(input->>'approval_revision','')::bigint is distinct from approval.phone_revision
 or fingerprint !~ '^[0-9a-f]{64}$' or fingerprint is null then
 return jsonb_build_object('ok',false,'code','PHONE_ENROLLMENT_STALE'); end if;
 if approval.status='VERIFIED' and identifier.status='VERIFIED' then
 return result||jsonb_build_object('status','VERIFIED','idempotent',true); end if;
 if approval.status<>'APPROVED' or identifier.status='VERIFIED' then
 return jsonb_build_object('ok',false,'code','PHONE_ENROLLMENT_REVIEW_REQUIRED'); end if;
 if nullif(user_row.phone_change,'') is not null or exists(select 1 from participant_identity.participant_phone_otp_attempts where auth_user_id=actor and status in ('REQUESTING','SENT') and (provider_send_state in ('CLAIMED','SENT','UNCERTAIN') or safe_reason='PHONE_ENROLLMENT_VERIFYING')) then
 return jsonb_build_object('ok',false,'code','PHONE_ENROLLMENT_REVIEW_REQUIRED'); end if;
 -- Account + client throttles apply across approval revisions/identifier replacements.
 perform pg_advisory_xact_lock(hashtextextended('phone-enrollment:'||fingerprint,0));
 stamp:=clock_timestamp();
 if exists(select 1 from participant_identity.participant_phone_otp_attempts where auth_user_id=actor and requested_at>stamp-interval '60 seconds')
 or (select count(*) from participant_identity.participant_phone_otp_attempts where auth_user_id=actor and requested_at>stamp-interval '1 hour')>=3
 or (select count(*) from participant_identity.participant_phone_otp_attempts where client_fingerprint=fingerprint and requested_at>stamp-interval '1 hour')>=6 then
 return jsonb_build_object('ok',false,'code','PHONE_ENROLLMENT_RATE_LIMITED'); end if;
 if exists(select 1 from participant_identity.participant_phone_otp_attempts where auth_user_id=actor and status in ('REQUESTING','SENT') and expires_at>stamp) then
 return jsonb_build_object('ok',false,'code','PHONE_ENROLLMENT_IN_PROGRESS'); end if;
 update participant_identity.participant_phone_otp_attempts set status='EXPIRED',safe_reason='PHONE_ENROLLMENT_EXPIRED',updated_at=stamp
 where auth_user_id=actor and status in ('REQUESTING','SENT') and expires_at<=stamp;
 if identifier.identifier_id is null then
 insert into participant_identity.participant_auth_identifiers(player_id,auth_user_id,identifier_type,normalized_value_private,status,
 source_system,source_tournament_id,created_by,updated_by,approved_phone_revision)
 values(player,actor,'PHONE',approval.phone_e164,'VERIFICATION_PENDING','PRODUCTION_DIRECTOR_APPROVAL',tour,player,player,approval.phone_revision)
 returning * into identifier;
 end if;
 insert into participant_identity.participant_phone_otp_attempts(tournament_id,identifier_id,identifier_revision,player_id,auth_user_id,requested_by_auth_user_id,
 client_fingerprint,status,safe_reason,expires_at,enrollment_approval_revision)
 values(tour,identifier.identifier_id,identifier.revision,player,actor,actor,fingerprint,'REQUESTING','PHONE_ENROLLMENT_SENDING',stamp+interval '10 minutes',approval.phone_revision)
 returning * into attempt;
 return result||jsonb_build_object('status','REQUESTING','challengeId',attempt.attempt_id,'issuedAt',attempt.requested_at,'expiresAt',attempt.expires_at);
 end if;
 select * into attempt from participant_identity.participant_phone_otp_attempts where attempt_id=target_attempt and auth_user_id=actor for update;
 stamp:=clock_timestamp();
 if action='expire' and attempt.attempt_id is not null and attempt.auth_user_id=actor and attempt.player_id=player and attempt.tournament_id=tour
 and attempt.identifier_id=identifier.identifier_id and attempt.identifier_revision=identifier.revision and attempt.enrollment_approval_revision=approval.phone_revision
 and attempt.expires_at<=stamp and attempt.provider_send_state='SENT' and attempt.provider_pending_written_at is not null
 and attempt.provider_confirmed_at is null and attempt.provider_verify_claimed_at is null
 and ((attempt.status='SENT' and attempt.safe_reason='PHONE_ENROLLMENT_SENT') or (attempt.status='REQUESTING' and attempt.safe_reason='PHONE_ENROLLMENT_VERIFY_LOCKED')) then
 -- Only a conclusively completed send with no in-flight verification is eligible.
 -- Never wait behind an Auth writer while holding approval: fail/retry explicitly.
 select * into user_row from auth.users where id=actor for update nowait;
 if nullif(user_row.phone,'') is not null or participant_identity.canonical_auth_phone(user_row.phone_change) is distinct from participant_identity.canonical_auth_phone(approval.phone_e164) then
 return jsonb_build_object('ok',false,'code','PHONE_ENROLLMENT_REVIEW_REQUIRED'); end if;
 update auth.users set phone_change='',phone_change_token='',phone_change_sent_at=null where id=actor;
 update participant_identity.participant_phone_otp_attempts set status='EXPIRED',safe_reason='PHONE_ENROLLMENT_EXPIRED',updated_at=stamp where attempt_id=target_attempt;
 insert into participant_identity.identity_audit_events(event_type,tournament_id,auth_user_id,player_id,actor_id,actor_name,request_id,safe_metadata)
 values('PHONE_ENROLLMENT_EXPIRED',tour,actor,player,player,'Authenticated participant',target_attempt::text,jsonb_build_object('approvalRevision',approval.phone_revision,'pendingOnly',true,'rawPhoneLogged',false,'otpLogged',false));
 return jsonb_build_object('ok',true,'status','EXPIRED','challengeId',target_attempt); end if;
 if not found or attempt.enrollment_approval_revision is null or attempt.enrollment_approval_revision<>approval.phone_revision
 or attempt.tournament_id<>tour or attempt.player_id<>player or attempt.identifier_id is distinct from identifier.identifier_id
 or attempt.identifier_revision is distinct from identifier.revision or attempt.expires_at<=stamp
 or attempt.status not in ('REQUESTING','SENT') then
 return jsonb_build_object('ok',false,'code','PHONE_ENROLLMENT_STALE'); end if;
 if action='resend' then
 if attempt.status<>'SENT' or attempt.safe_reason<>'PHONE_ENROLLMENT_SENT' or attempt.provider_send_state is distinct from 'SENT' or attempt.provider_pending_written_at is null or attempt.provider_confirmed_at is not null
 or input->>'approval_revision' is distinct from approval.phone_revision::text or attempt.sent_at>stamp-interval '60 seconds'
 or (select coalesce(sum(provider_send_count),0) from participant_identity.participant_phone_otp_attempts where auth_user_id=actor and requested_at>stamp-interval '1 hour')>=3
 or participant_identity.canonical_auth_phone(user_row.phone_change) is distinct from participant_identity.canonical_auth_phone(approval.phone_e164) then
 return jsonb_build_object('ok',false,'code','PHONE_ENROLLMENT_STALE'); end if;
 update participant_identity.participant_phone_otp_attempts set status='REQUESTING',safe_reason='PHONE_ENROLLMENT_SENDING',provider_send_state=null,provider_send_event_hash=null,provider_send_started_at=null,provider_send_finished_at=null,provider_pending_written_at=null,updated_at=stamp where attempt_id=target_attempt;
 return result||jsonb_build_object('status','REQUESTING','challengeId',target_attempt,'issuedAt',attempt.requested_at,'expiresAt',attempt.expires_at); end if;
 if action='sent' and (attempt.provider_send_state is distinct from 'SENT' or attempt.provider_pending_written_at is null) then return jsonb_build_object('ok',false,'code','PHONE_ENROLLMENT_PROVIDER_UNCERTAIN'); end if;
 if action='send_failed' and attempt.provider_send_state is distinct from 'FAILED' then return jsonb_build_object('ok',false,'code','PHONE_ENROLLMENT_PROVIDER_UNCERTAIN'); end if;
 if action in ('sent','send_failed') and attempt.status='REQUESTING' and attempt.safe_reason='PHONE_ENROLLMENT_SENDING' then
 update participant_identity.participant_phone_otp_attempts set status=case when action='sent' then 'SENT' else 'SEND_FAILED' end,
 safe_reason=case when action='sent' then 'PHONE_ENROLLMENT_SENT' else 'PHONE_ENROLLMENT_SEND_FAILED' end,
 provider_called=true,sent_at=case when action='sent' then stamp else null end,updated_at=stamp where attempt_id=target_attempt;
 return result||jsonb_build_object('status',case when action='sent' then 'SENT' else 'SEND_FAILED' end,'challengeId',target_attempt,'expiresAt',attempt.expires_at);
 elsif action='verify' and attempt.status='SENT' and attempt.safe_reason='PHONE_ENROLLMENT_SENT' and attempt.verify_failure_count<5 and attempt.provider_send_state='SENT' and attempt.provider_pending_written_at is not null and attempt.provider_confirmed_at is null then
 update participant_identity.participant_phone_otp_attempts set status='REQUESTING',safe_reason='PHONE_ENROLLMENT_VERIFYING',updated_at=stamp where attempt_id=target_attempt;
 return result||jsonb_build_object('status','VERIFYING','challengeId',target_attempt);
 elsif action='verify_failed' and attempt.status='REQUESTING' and attempt.safe_reason='PHONE_ENROLLMENT_VERIFYING' and attempt.provider_confirmed_at is null then
 update participant_identity.participant_phone_otp_attempts set verify_failure_count=verify_failure_count+1,
 status=case when verify_failure_count>=4 then 'REQUESTING' else 'SENT' end,
 safe_reason=case when verify_failure_count>=4 then 'PHONE_ENROLLMENT_VERIFY_LOCKED' else 'PHONE_ENROLLMENT_SENT' end,updated_at=stamp where attempt_id=target_attempt;
 return jsonb_build_object('ok',true,'status','DENIED');
 elsif action='complete' and attempt.status='REQUESTING' and attempt.safe_reason='PHONE_ENROLLMENT_VERIFYING' then
 if attempt.provider_confirmed_at is null or input->>'returned_auth_user_id' is distinct from actor::text or user_row.phone_confirmed_at is null
 or nullif(user_row.phone_change,'') is not null or participant_identity.canonical_auth_phone(user_row.phone) is distinct from participant_identity.canonical_auth_phone(approval.phone_e164)
 or (select count(*) from auth.identities i where i.user_id=actor and i.provider='phone'
 and participant_identity.canonical_auth_phone(i.identity_data->>'phone')=participant_identity.canonical_auth_phone(approval.phone_e164))<>1 then
 return jsonb_build_object('ok',false,'code','PHONE_ENROLLMENT_PROVIDER_MISMATCH'); end if;
 update participant_identity.participant_auth_identifiers set status='VERIFIED',verified_at=stamp,verification_source='SUPABASE_AUTH_APPROVED_SMS_HOOK',updated_at=stamp,updated_by=player
 where identifier_id=identifier.identifier_id;
 update participant_identity.player_approved_phones_v1 set status='VERIFIED',verified_at=stamp,updated_at=stamp where tournament_id=tour and player_id=player;
 update participant_identity.participant_phone_otp_attempts set status='VERIFIED',safe_reason='PHONE_ENROLLMENT_VERIFIED',verified_at=stamp,used_at=stamp,auth_phone_attached=true,updated_at=stamp where attempt_id=target_attempt;
 insert into participant_identity.identity_audit_events(event_type,tournament_id,auth_user_id,player_id,actor_id,actor_name,request_id,safe_metadata)
 values('PHONE_ENROLLMENT_VERIFIED',tour,actor,player,player,'Authenticated participant',target_attempt::text,
 jsonb_build_object('approvalRevision',approval.phone_revision,'sameAuthUser',true,'rawPhoneLogged',false,'otpLogged',false));
 return result||jsonb_build_object('status','VERIFIED','challengeId',target_attempt,'sameAuthUser',true);
 end if;
 return jsonb_build_object('ok',false,'code','PHONE_ENROLLMENT_STALE');
end;$$;
revoke all on function public.production_participant_phone_enrollment_v1(jsonb) from public,anon,authenticated;
grant execute on function public.production_participant_phone_enrollment_v1(jsonb) to service_role;
commit;
