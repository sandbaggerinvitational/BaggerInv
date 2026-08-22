-- Step 8B.2B.2: make the already-approved controlled login reachable from a
-- fully signed-out Preview browser. The browser supplies no phone, Auth UUID,
-- Player ID, identifier ID, or tournament ID. This service-role-only resolver
-- permits exactly one canonical PREPARED rehearsal with one VERIFIED Twilio-
-- backed PHONE identifier; the existing proof authorization then rechecks all
-- Auth, identity, Player Passport, membership, collision, scoring, and Director
-- entitlement invariants before an application request can reach Supabase SMS.

create or replace function public.authorize_controlled_participant_phone_login_surface()
returns jsonb
language plpgsql
security definer
stable
set search_path = participant_identity, public, pg_temp
as $$
declare designated record;
declare designated_count integer := 0;
begin
  select count(*) into designated_count
  from participant_identity.participant_auth_rehearsals rehearsal
  join participant_identity.participant_auth_identifiers identifier
    on identifier.source_tournament_id = rehearsal.tournament_id
   and identifier.player_id = rehearsal.player_id
   and identifier.auth_user_id = rehearsal.auth_user_id
   and identifier.identifier_type = 'PHONE'
   and identifier.status = 'VERIFIED'
   and identifier.verification_source = 'SUPABASE_AUTH_TWILIO_VERIFY'
  where rehearsal.status = 'PREPARED' and rehearsal.shadow_enabled;

  if designated_count <> 1 then
    return jsonb_build_object('ok', true, 'allowed', false, 'code', 'PHONE_OTP_NOT_ELIGIBLE');
  end if;

  select rehearsal.tournament_id, rehearsal.player_id, rehearsal.auth_user_id
    into designated
  from participant_identity.participant_auth_rehearsals rehearsal
  join participant_identity.participant_auth_identifiers identifier
    on identifier.source_tournament_id = rehearsal.tournament_id
   and identifier.player_id = rehearsal.player_id
   and identifier.auth_user_id = rehearsal.auth_user_id
   and identifier.identifier_type = 'PHONE'
   and identifier.status = 'VERIFIED'
   and identifier.verification_source = 'SUPABASE_AUTH_TWILIO_VERIFY'
  where rehearsal.status = 'PREPARED' and rehearsal.shadow_enabled;

  return public.authorize_participant_phone_login_proof(jsonb_build_object(
    'tournament_id', designated.tournament_id,
    'player_id', designated.player_id,
    'auth_user_id', designated.auth_user_id
  ));
end;
$$;

revoke all on function public.authorize_controlled_participant_phone_login_surface() from public, anon, authenticated;
grant execute on function public.authorize_controlled_participant_phone_login_surface() to service_role;

notify pgrst, 'reload schema';
