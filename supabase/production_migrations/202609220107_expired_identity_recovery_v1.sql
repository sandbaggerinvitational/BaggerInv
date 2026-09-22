-- LOCAL CANDIDATE ONLY. Installation never registers an approval or repairs a user.
begin;
create table production_control.expired_identity_recovery_approvals_v1 (
  approval_id uuid primary key,
  target_auth_user_id uuid not null references auth.users(id) on delete cascade,
  target_player_id text not null check(target_player_id in ('HM01','NJ01')),
  historical_request_id uuid not null,
  actor_player_id text not null,
  actor_auth_user_id uuid not null references auth.users(id) on delete cascade,
  reason_code text not null check(reason_code='OWNER_REVIEWED_INCOMPLETE_EMAIL_CERTIFICATION'),
  expected_state jsonb not null,
  plan_hash text not null unique check(plan_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp()
);
-- Private approval bindings are removed by ordinary Auth deletion. Receipts
-- retain only opaque hashes and historical Player IDs, never live credentials.
create table production_control.expired_identity_recovery_receipts_v1 (
  approval_id uuid primary key,
  player_id text not null,
  actor_player_id text not null,
  plan_hash text not null,
  outcome text not null check(outcome in ('RECOVERED','ALREADY_COMPLETED_BY_NORMAL_LOGIN')),
  before_state_hash text not null,
  after_state_hash text not null,
  before_link_revision bigint not null,
  after_link_revision bigint not null,
  recovered_at timestamptz not null default clock_timestamp()
);
alter table production_control.expired_identity_recovery_approvals_v1 enable row level security;
alter table production_control.expired_identity_recovery_receipts_v1 enable row level security;
revoke all on production_control.expired_identity_recovery_approvals_v1,
 production_control.expired_identity_recovery_receipts_v1 from public,anon,authenticated,service_role;
create function production_control.reject_expired_identity_receipt_mutation_v1()
returns trigger language plpgsql set search_path=pg_catalog as $$
begin raise exception 'EXPIRED_IDENTITY_IMMUTABLE_RECORD'; end $$;
create trigger expired_identity_receipt_immutable before update or delete on
 production_control.expired_identity_recovery_receipts_v1 for each row
 execute function production_control.reject_expired_identity_receipt_mutation_v1();
create trigger expired_identity_receipt_no_truncate before truncate on
 production_control.expired_identity_recovery_receipts_v1 for each statement
 execute function production_control.reject_expired_identity_receipt_mutation_v1();
create trigger expired_identity_approval_immutable before update on
 production_control.expired_identity_recovery_approvals_v1 for each row
 execute function production_control.reject_expired_identity_receipt_mutation_v1();

create function production_control.expired_identity_operator_guard_v1()
returns void language plpgsql security definer set search_path=pg_catalog as $$
begin
  -- Existing protected database operator boundary; never a participant/service API.
  if session_user <> 'postgres' then raise exception 'EXPIRED_IDENTITY_OPERATOR_REQUIRED'; end if;
  perform production_control.assert_production_participant_identity_cutover();
  if exists(select 1 from production_control.release_attempts_v1 where state='ACTIVE') then
    raise exception 'EXPIRED_IDENTITY_RELEASE_ACTIVE';
  end if;
end $$;

create function production_control.expired_identity_lock_v1()
returns void language plpgsql security definer set search_path=pg_catalog as $$
begin
  -- Bounded operator transaction. Auth SHARE lock prevents provider changes and
  -- new collision rows while validating; this is NOT Auth DDL or an Auth write.
  -- Consistent order also fences unrelated deletion/approval writers. Timeout
  -- causes full rollback; no retry or partial completion is implicit.
  perform set_config('lock_timeout','5s',true);
  -- EXCLUSIVE conflicts with the legacy certifier's initial SELECT FOR UPDATE
  -- RowShare table lock, avoiding a later lock-upgrade cycle.
  lock table participant_identity.participant_auth_otp_attempts in exclusive mode;
  lock table auth.users in share mode;
  lock table production_control.release_attempts_v1,
    participant_identity.user_player_links,
    participant_identity.participant_auth_identifiers,
    participant_identity.tournament_roles,
    participant_identity.participant_identity_contacts,
    participant_identity.identity_context_revisions,
    participant_identity.identity_config_import_runs,
    participant_identity.production_participant_enrollment_claims,
    participant_identity.player_approved_phones_v1,
    participant_identity.account_deletion_requests_v1,
    scoring_authority.players, scoring_authority.tournament_players,
    production_control.player_governance_profiles_v1,
    production_control.tournament_owner_capabilities_v1
    in share row exclusive mode;
end $$;

create function production_control.inspect_expired_identity_recovery_v1(
 target_player text, target_auth uuid, historical_request uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare u auth.users%rowtype; l participant_identity.user_player_links%rowtype;
 i participant_identity.participant_auth_identifiers%rowtype;
 c participant_identity.participant_identity_contacts%rowtype;
 a participant_identity.participant_auth_otp_attempts%rowtype;
 ph participant_identity.player_approved_phones_v1%rowtype;
 authority jsonb; state jsonb; email_hash text; completed boolean;
begin
 perform production_control.expired_identity_operator_guard_v1();
 if target_player not in ('HM01','NJ01') or target_player is null or target_auth is null or historical_request is null then
   raise exception 'EXPIRED_IDENTITY_TARGET_DENIED'; end if;
 select * into u from auth.users where id=target_auth;
 select * into l from participant_identity.user_player_links where auth_user_id=target_auth and player_id=target_player;
 select * into c from participant_identity.participant_identity_contacts where tournament_id='2026' and player_id=target_player;
 select * into i from participant_identity.participant_auth_identifiers where auth_user_id=target_auth and player_id=target_player
  and identifier_type='EMAIL' and status in ('VERIFICATION_PENDING','VERIFIED');
 select * into a from participant_identity.participant_auth_otp_attempts where request_id=historical_request;
 select * into ph from participant_identity.player_approved_phones_v1 where tournament_id='2026' and player_id=target_player;
 email_hash := encode(extensions.digest(c.email_normalized,'sha256'),'hex');
 if u.id is null or u.email_confirmed_at is null or u.deleted_at is not null
  or (u.banned_until is not null and u.banned_until>clock_timestamp())
  or coalesce(u.phone,'')<>'' or coalesce(u.phone_change,'')<>'' or u.phone_confirmed_at is not null
  or l.link_id is null or l.revoked_at is not null or l.status not in ('PENDING','ACTIVE')
  or i.identifier_id is null or i.revoked_at is not null
  or c.identity_active is distinct from true
  or lower(btrim(u.email)) is distinct from c.email_normalized
  or i.normalized_value_private is distinct from c.email_normalized
  or l.email_identity_hash is distinct from email_hash
  or u.raw_app_meta_data->>'player_id' is distinct from target_player
  or u.raw_app_meta_data->>'tournament_id' is distinct from '2026'
  or u.raw_app_meta_data->>'provisioning_scope' is distinct from 'production_controlled_first_login'
  or l.link_method is distinct from 'PRODUCTION_CONTROLLED_FIRST_LOGIN'
  or i.source_tournament_id is distinct from '2026'
  or i.source_configuration_revision is distinct from c.configuration_revision
  or ph.status is distinct from 'APPROVED' or ph.verified_at is not null
  or production_control.access_governance_global_status_v1(target_player) is distinct from 'ACTIVE'
 then raise exception 'EXPIRED_IDENTITY_CURRENT_AUTHORITY_DENIED'; end if;
 if not exists(select 1 from scoring_authority.tournament_players where tournament_id='2026' and player_id=target_player and participation_status='ACTIVE')
  or not exists(select 1 from participant_identity.identity_context_revisions r
   join participant_identity.identity_config_import_runs ir on ir.tournament_id=r.tournament_id
    and ir.configuration_revision=r.context_revision and ir.source_fingerprint=r.configuration_fingerprint
   join production_control.resource_scope rs on rs.scope_key='BAGGER_INV_PRODUCTION'
   where r.tournament_id='2026' and r.context_revision=c.configuration_revision and ir.status='APPROVED'
    and ir.approved_at is not null and c.source_workbook_id=rs.google_workbook_id)
  or not exists(select 1 from participant_identity.production_participant_enrollment_claims cl
   where cl.player_id=target_player and cl.auth_user_id=target_auth and cl.tournament_id='2026'
    and cl.status='CONSUMED' and cl.email_identity_hash=email_hash and cl.source_configuration_revision=c.configuration_revision)
  or exists(select 1 from participant_identity.account_deletion_requests_v1 where auth_user_id=target_auth)
  or exists(select 1 from participant_identity.tournament_roles where auth_user_id=target_auth and tournament_id='2026'
   and (not role_active or revoked_at is not null))
 then raise exception 'EXPIRED_IDENTITY_REVOKED_OR_STALE'; end if;
 -- Historical workflow binds provenance and the approved revision, never a new
 -- OTP success. Confirmation must predate review and follow this provisioning.
 if a.request_id is null or a.auth_user_id is distinct from target_auth or a.player_id is distinct from target_player
  or a.tournament_id is distinct from '2026' or a.verification_type is distinct from 'signup'
  or a.email_identity_hash is distinct from email_hash or a.status not in ('SENT','VERIFIED')
  or a.sent_at is null or a.requested_at>clock_timestamp()-interval '30 minutes'
  or u.email_confirmed_at<a.sent_at or u.email_confirmed_at>clock_timestamp()
 then raise exception 'EXPIRED_IDENTITY_HISTORY_DENIED'; end if;
 if (select count(*) from auth.users where lower(btrim(email))=c.email_normalized)<>1
  or exists(select 1 from auth.users where id<>target_auth and raw_app_meta_data->>'player_id'=target_player)
  or exists(select 1 from participant_identity.user_player_links where (auth_user_id=target_auth and player_id<>target_player)
   or (player_id=target_player and auth_user_id<>target_auth))
  or exists(select 1 from participant_identity.participant_identity_contacts where identity_active and email_normalized=c.email_normalized and player_id<>target_player)
  or exists(select 1 from participant_identity.participant_auth_identifiers where identifier_type='EMAIL'
   and normalized_value_private=c.email_normalized and (player_id<>target_player or auth_user_id<>target_auth))
  or exists(select 1 from participant_identity.player_approved_phones_v1 where status in ('APPROVED','VERIFIED')
   and phone_e164=ph.phone_e164 and player_id<>target_player)
  or exists(select 1 from participant_identity.participant_auth_identifiers where identifier_type='PHONE'
   and normalized_value_private=ph.phone_e164 and (player_id<>target_player or auth_user_id<>target_auth))
  or exists(select 1 from auth.users where id<>target_auth and
   (regexp_replace(coalesce(phone,''),'[^0-9]','','g')=regexp_replace(ph.phone_e164,'[^0-9]','','g')
    or regexp_replace(coalesce(phone_change,''),'[^0-9]','','g')=regexp_replace(ph.phone_e164,'[^0-9]','','g')))
 then raise exception 'EXPIRED_IDENTITY_COLLISION'; end if;
 completed := l.status='ACTIVE' and i.status='VERIFIED' and i.verified_at is not null
  and exists(select 1 from participant_identity.tournament_roles where tournament_id='2026' and auth_user_id=target_auth
   and role='PARTICIPANT' and role_active and revoked_at is null);
 if not completed and not(l.status='PENDING' and i.status='VERIFICATION_PENDING' and i.verified_at is null
   and a.status='SENT' and not exists(select 1 from participant_identity.tournament_roles where tournament_id='2026' and auth_user_id=target_auth))
 then raise exception 'EXPIRED_IDENTITY_NOT_INCOMPLETE'; end if;
 authority := jsonb_build_object('playerId',target_player,'authUserId',target_auth,'emailHash',email_hash,
  'historicalRequestId',historical_request,'linkId',l.link_id,'identifierId',i.identifier_id,
  'providerConfirmedAt',u.email_confirmed_at,'authCreatedAt',u.created_at,
  'contactHash',encode(extensions.digest(to_jsonb(c)::text,'sha256'),'hex'),
  'phoneHash',encode(extensions.digest(to_jsonb(ph)::text,'sha256'),'hex'),
  'contextHash',(select encode(extensions.digest(to_jsonb(r)::text,'sha256'),'hex') from participant_identity.identity_context_revisions r where tournament_id='2026'),
  'membershipHash',(select encode(extensions.digest(to_jsonb(t)::text,'sha256'),'hex') from scoring_authority.tournament_players t where tournament_id='2026' and player_id=target_player));
 state := jsonb_build_object('class','EXPIRED_PROVIDER_CONFIRMED_CERTIFICATION_PENDING','authority',authority,
  'state',case when completed then 'COMPLETE' else 'PENDING' end,
  'linkRevision',l.link_revision,'identifierRevision',i.revision);
 return state;
end $$;

create function production_control.register_expired_identity_recovery_v1(plan jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare observed jsonb; hash text; existing production_control.expired_identity_recovery_approvals_v1%rowtype;
begin
 perform production_control.expired_identity_operator_guard_v1();
 perform production_control.expired_identity_lock_v1();
 perform production_control.expired_identity_operator_guard_v1();
 perform production_control.assert_access_governance_owner_v1('2026',plan->>'actorPlayerId',(plan->>'actorAuthUserId')::uuid);
 if plan->>'contract' is distinct from 'expired-provider-confirmed-identity-recovery-v1'
  or plan->>'reasonCode' is distinct from 'OWNER_REVIEWED_INCOMPLETE_EMAIL_CERTIFICATION'
  or (plan->>'expiresAt')::timestamptz is null or (plan->>'expiresAt')::timestamptz<=clock_timestamp()
  or (plan->>'expiresAt')::timestamptz>clock_timestamp()+interval '15 minutes'
  or plan->>'approvalId' is null
  or (select count(*) from jsonb_object_keys(plan))<>10
 then raise exception 'EXPIRED_IDENTITY_REVIEW_REQUIRED'; end if;
 hash := encode(extensions.digest(plan::text,'sha256'),'hex');
 select * into existing from production_control.expired_identity_recovery_approvals_v1 where approval_id=(plan->>'approvalId')::uuid;
 if found then
   if existing.plan_hash<>hash then raise exception 'EXPIRED_IDENTITY_APPROVAL_CONFLICT'; end if;
   return jsonb_build_object('registered',true,'planHash',hash,'duplicate',true);
 end if;
 observed := production_control.inspect_expired_identity_recovery_v1(plan->>'playerId',(plan->>'authUserId')::uuid,(plan->>'historicalRequestId')::uuid);
 if observed->>'state'<>'PENDING' or observed is distinct from plan->'expectedState' then
  raise exception 'EXPIRED_IDENTITY_REVIEW_STALE'; end if;
 insert into production_control.expired_identity_recovery_approvals_v1
 (approval_id,target_auth_user_id,target_player_id,historical_request_id,actor_player_id,actor_auth_user_id,reason_code,expected_state,plan_hash,expires_at)
 values((plan->>'approvalId')::uuid,(plan->>'authUserId')::uuid,plan->>'playerId',(plan->>'historicalRequestId')::uuid,
 plan->>'actorPlayerId',(plan->>'actorAuthUserId')::uuid,plan->>'reasonCode',observed,hash,(plan->>'expiresAt')::timestamptz);
 return jsonb_build_object('registered',true,'planHash',hash,'duplicate',false);
end $$;

create function production_control.apply_expired_identity_recovery_v1(approval uuid, expected_plan_hash text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare reviewed production_control.expired_identity_recovery_approvals_v1%rowtype;
 receipt production_control.expired_identity_recovery_receipts_v1%rowtype;
 before_state jsonb; after_state jsonb; result text;
begin
 perform production_control.expired_identity_operator_guard_v1();
 perform production_control.expired_identity_lock_v1();
 perform production_control.expired_identity_operator_guard_v1();
 select * into reviewed from production_control.expired_identity_recovery_approvals_v1 where approval_id=approval for update;
 if not found or reviewed.plan_hash is distinct from expected_plan_hash then raise exception 'EXPIRED_IDENTITY_APPROVAL_REQUIRED'; end if;
 perform production_control.assert_access_governance_owner_v1('2026',reviewed.actor_player_id,reviewed.actor_auth_user_id);
 before_state := production_control.inspect_expired_identity_recovery_v1(reviewed.target_player_id,reviewed.target_auth_user_id,reviewed.historical_request_id);
 if before_state->'authority' is distinct from reviewed.expected_state->'authority' then raise exception 'EXPIRED_IDENTITY_REVIEW_STALE'; end if;
 select * into receipt from production_control.expired_identity_recovery_receipts_v1 where approval_id=approval;
 if found then
  if before_state->>'state'<>'COMPLETE'
   or encode(extensions.digest(before_state::text,'sha256'),'hex') is distinct from receipt.after_state_hash then
   raise exception 'EXPIRED_IDENTITY_RECEIPT_DRIFT'; end if;
  return jsonb_build_object('ok',true,'status','ALREADY_COMPLETE','approvalId',approval,'sessionIssued',false);
 end if;
 if reviewed.expires_at<=clock_timestamp() then raise exception 'EXPIRED_IDENTITY_APPROVAL_EXPIRED'; end if;
 if before_state->>'state'='COMPLETE' then
  if (before_state->>'linkRevision')::bigint is distinct from (reviewed.expected_state->>'linkRevision')::bigint+1
   or (before_state->>'identifierRevision')::bigint is distinct from (reviewed.expected_state->>'identifierRevision')::bigint+1
   or not exists(select 1 from participant_identity.participant_auth_otp_attempts where request_id=reviewed.historical_request_id and status='VERIFIED') then
   raise exception 'EXPIRED_IDENTITY_UNRECEIPTED_COMPLETION'; end if;
  result := 'ALREADY_COMPLETED_BY_NORMAL_LOGIN';
 else
  if before_state is distinct from reviewed.expected_state then raise exception 'EXPIRED_IDENTITY_REVIEW_STALE'; end if;
  update participant_identity.user_player_links set status='ACTIVE',link_revision=link_revision+1,
   linked_at=coalesce(linked_at,clock_timestamp()),linked_by='owner-reviewed-expired-certification-recovery',updated_at=clock_timestamp()
   where auth_user_id=reviewed.target_auth_user_id and player_id=reviewed.target_player_id and status='PENDING';
  update participant_identity.participant_auth_identifiers set status='VERIFIED',revision=revision+1,
   verified_at=clock_timestamp(),verification_source='OWNER_REVIEWED_PROVIDER_CONFIRMED_RECOVERY',
   updated_by='owner-reviewed-expired-certification-recovery',updated_at=clock_timestamp()
   where auth_user_id=reviewed.target_auth_user_id and player_id=reviewed.target_player_id and identifier_type='EMAIL' and status='VERIFICATION_PENDING';
  insert into participant_identity.tournament_roles(tournament_id,auth_user_id,role,role_active,granted_by)
   values('2026',reviewed.target_auth_user_id,'PARTICIPANT',true,'owner-reviewed-expired-certification-recovery');
  result := 'RECOVERED';
 end if;
 after_state := production_control.inspect_expired_identity_recovery_v1(reviewed.target_player_id,reviewed.target_auth_user_id,reviewed.historical_request_id);
 if after_state->>'state'<>'COMPLETE' then raise exception 'EXPIRED_IDENTITY_COMPLETION_FAILED'; end if;
 insert into production_control.expired_identity_recovery_receipts_v1
 (approval_id,player_id,actor_player_id,plan_hash,outcome,before_state_hash,after_state_hash,before_link_revision,after_link_revision)
 values(approval,reviewed.target_player_id,reviewed.actor_player_id,reviewed.plan_hash,result,
 encode(extensions.digest(before_state::text,'sha256'),'hex'),encode(extensions.digest(after_state::text,'sha256'),'hex'),
 (before_state->>'linkRevision')::bigint,(after_state->>'linkRevision')::bigint);
 return jsonb_build_object('ok',true,'status',result,'approvalId',approval,'sessionIssued',false);
end $$;

-- No public RPC or service_role grant. Registration/execution require the
-- attended database operator, an active adopted Owner, and a reviewed plan.
do $$ declare f regprocedure; begin
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='production_control' and p.proname in
 ('reject_expired_identity_receipt_mutation_v1','expired_identity_operator_guard_v1','expired_identity_lock_v1',
 'inspect_expired_identity_recovery_v1','register_expired_identity_recovery_v1','apply_expired_identity_recovery_v1')
 loop execute format('revoke all on function %s from public,anon,authenticated,service_role',f); end loop;
end $$;
commit;
