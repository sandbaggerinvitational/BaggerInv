-- Phase A single-player email-confirmation repair and safe request audit.
-- This migration creates no Auth users and sends no email.

create or replace function public.record_single_participant_auth_email_confirmation(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = participant_identity, scoring_authority, public, auth, pg_temp
as $$
declare target_tournament text := btrim(coalesce(input->>'tournament_id', ''));
declare target_player text := btrim(coalesce(input->>'player_id', ''));
declare target_user uuid := nullif(input->>'auth_user_id', '')::uuid;
declare expected_fingerprint text := lower(btrim(coalesce(input->>'approved_fingerprint', '')));
declare actor text := btrim(coalesce(input->>'actor', ''));
declare previously_confirmed boolean := coalesce((input->>'previously_confirmed')::boolean, false);
declare rehearsal participant_identity.participant_auth_rehearsals%rowtype;
declare contact participant_identity.participant_identity_contacts%rowtype;
declare confirmed_at timestamptz;
declare audit_request text;
declare audit_created boolean := false;
begin
  if target_tournament = '' or target_player = '' or target_user is null or actor = '' or expected_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception 'Complete approved email-confirmation context is required.';
  end if;
  select * into rehearsal from participant_identity.participant_auth_rehearsals
    where tournament_id = target_tournament for update;
  if not found or rehearsal.player_id <> target_player or rehearsal.auth_user_id <> target_user or
      rehearsal.status <> 'PREPARED' or rehearsal.approved_fingerprint <> expected_fingerprint then
    raise exception 'Prepared single-player rehearsal does not match the approved confirmation target.';
  end if;
  if not exists (
    select 1 from participant_identity.identity_config_import_runs r
    join participant_identity.identity_context_revisions c on c.tournament_id = r.tournament_id
    where r.tournament_id = target_tournament and r.status = 'APPROVED'
      and r.source_fingerprint = expected_fingerprint and c.configuration_fingerprint = expected_fingerprint
      and r.run_id = (select r2.run_id from participant_identity.identity_config_import_runs r2
        where r2.tournament_id = target_tournament order by r2.requested_at desc limit 1)
  ) then raise exception 'The approved identity fingerprint is no longer current.'; end if;
  select * into contact from participant_identity.participant_identity_contacts
    where tournament_id = target_tournament and player_id = target_player and identity_active;
  if not found then raise exception 'Approved active participant identity contact is required.'; end if;
  if not exists (
    select 1 from participant_identity.user_player_links l
    where l.auth_user_id = target_user and l.player_id = target_player and l.status = 'ACTIVE'
  ) then raise exception 'Active approved user-to-player link is required.'; end if;
  select u.email_confirmed_at into confirmed_at from auth.users u
    where u.id = target_user and lower(btrim(u.email)) = contact.email_normalized;
  if not found or confirmed_at is null then raise exception 'The approved Auth email has not been confirmed by Supabase.'; end if;

  audit_request := 'phase-a-email-confirm:' || target_user::text;
  if not exists (select 1 from participant_identity.identity_audit_events where request_id = audit_request) then
    insert into participant_identity.identity_audit_events (
      event_type, tournament_id, auth_user_id, player_id, actor_name, request_id,
      reason_code, configuration_revision, safe_metadata
    ) values (
      'AUTH_EMAIL_ADMIN_CONFIRMED', target_tournament, target_user, target_player, actor, audit_request,
      'DIRECTOR_APPROVED_IDENTITY_MAPPING', contact.configuration_revision,
      jsonb_build_object('previouslyConfirmed', previously_confirmed, 'confirmed', true,
        'authenticationFactor', 'EMAIL_OTP', 'emailValueStored', false)
    );
    audit_created := true;
  end if;
  return jsonb_build_object('ok', true, 'playerId', target_player, 'confirmed', true,
    'confirmedAt', confirmed_at, 'auditCreated', audit_created, 'reasonCode', 'DIRECTOR_APPROVED_IDENTITY_MAPPING');
end;
$$;

create or replace function public.read_single_participant_auth_request_audit(target_tournament_id text)
returns jsonb
language plpgsql
security definer
set search_path = participant_identity, public, auth, pg_temp
as $$
declare target text := btrim(coalesce(target_tournament_id, ''));
declare rehearsal participant_identity.participant_auth_rehearsals%rowtype;
declare latest participant_identity.participant_auth_otp_attempts%rowtype;
declare user_email text;
declare auth_actions jsonb := '[]'::jsonb;
declare attempt_count integer := 0;
begin
  select * into rehearsal from participant_identity.participant_auth_rehearsals where tournament_id = target;
  if not found then return jsonb_build_object('ok', true, 'attemptCount', 0, 'latestAttempt', null, 'authLogActions', auth_actions); end if;
  select count(*) into attempt_count from participant_identity.participant_auth_otp_attempts
    where tournament_id = target and player_id = rehearsal.player_id and auth_user_id = rehearsal.auth_user_id;
  select * into latest from participant_identity.participant_auth_otp_attempts
    where tournament_id = target and player_id = rehearsal.player_id and auth_user_id = rehearsal.auth_user_id
    order by requested_at desc limit 1;
  select lower(btrim(email)) into user_email from auth.users where id = rehearsal.auth_user_id;
  if to_regclass('auth.audit_log_entries') is not null then
    execute $query$
      select coalesce(jsonb_agg(item order by created_at desc), '[]'::jsonb)
      from (
        select jsonb_build_object(
          'action', coalesce(payload->>'action', 'UNKNOWN'),
          'logType', coalesce(payload->>'log_type', ''),
          'createdAt', created_at
        ) as item, created_at
        from auth.audit_log_entries
        where payload->>'actor_id' = $1::text
           or payload->'traits'->>'user_id' = $1::text
           or lower(payload->>'actor_username') = $2
        order by created_at desc
        limit 20
      ) safe_logs
    $query$ using rehearsal.auth_user_id, user_email into auth_actions;
  end if;
  return jsonb_build_object(
    'ok', true,
    'attemptCount', attempt_count,
    'latestAttempt', case when latest.request_id is null then null else jsonb_build_object(
      'status', latest.status, 'safeReason', latest.safe_reason,
      'requestedAt', latest.requested_at, 'sentAt', latest.sent_at,
      'requestDurationMs', latest.request_duration_ms,
      'verifiedAt', latest.verified_at
    ) end,
    'authLogActions', coalesce(auth_actions, '[]'::jsonb)
  );
end;
$$;

revoke all on function public.record_single_participant_auth_email_confirmation(jsonb) from public, anon, authenticated;
revoke all on function public.read_single_participant_auth_request_audit(text) from public, anon, authenticated;
grant execute on function public.record_single_participant_auth_email_confirmation(jsonb) to service_role;
grant execute on function public.read_single_participant_auth_request_audit(text) to service_role;
