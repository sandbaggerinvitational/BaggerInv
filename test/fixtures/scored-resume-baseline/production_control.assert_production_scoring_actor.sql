CREATE OR REPLACE FUNCTION production_control.assert_production_scoring_actor(input jsonb, require_director boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'production_control', 'participant_identity', 'scoring_authority', 'auth'
AS $function$
declare
  actor text := btrim(coalesce(input#>>'{authorization,player_id}', ''));
  actor_role text := upper(coalesce(input#>>'{authorization,role}', 'PLAYER'));
  actor_auth_user uuid := nullif(input#>>'{authorization,auth_user_id}', '')::uuid;
begin
  if input#>>'{authorization,tournament_id}' <> '2026'
     or actor = ''
     or actor_auth_user is null
     or actor_role not in ('PLAYER', 'DIRECTOR')
     or (require_director and actor_role <> 'DIRECTOR') then
    raise exception using errcode = '42501', message = case when require_director
      then 'PRODUCTION_DIRECTOR_AUTHORIZATION_REQUIRED'
      else 'PRODUCTION_SCORING_AUTHORIZATION_REQUIRED' end;
  end if;

  -- Never trust a role/player assertion supplied by the server request. Re-read
  -- the current Auth link, confirmed identifier, tournament membership and
  -- role on every mutation so revoked/stale sessions lose authority promptly.
  if not exists (
    select 1
    from participant_identity.user_player_links link
    join auth.users auth_user
      on auth_user.id = link.auth_user_id and auth_user.email_confirmed_at is not null
    join participant_identity.participant_auth_identifiers identifier
      on identifier.auth_user_id = link.auth_user_id
     and identifier.player_id = link.player_id
     and identifier.identifier_type = 'EMAIL'
     and identifier.status = 'VERIFIED'
    join participant_identity.tournament_roles tournament_role
      on tournament_role.tournament_id = '2026'
     and tournament_role.auth_user_id = link.auth_user_id
     and tournament_role.role = case when actor_role = 'DIRECTOR' then 'DIRECTOR' else 'PARTICIPANT' end
     and tournament_role.role_active
     and tournament_role.revoked_at is null
    join scoring_authority.tournament_players membership
      on membership.tournament_id = '2026'
     and membership.player_id = link.player_id
     and membership.participation_status = 'ACTIVE'
    where link.auth_user_id = actor_auth_user
      and link.player_id = actor
      and link.status = 'ACTIVE'
      and link.revoked_at is null
  ) then
    raise exception using errcode = '42501', message = case when require_director
      then 'PRODUCTION_DIRECTOR_AUTHORIZATION_REQUIRED'
      else 'PRODUCTION_SCORING_AUTHORIZATION_REQUIRED' end;
  end if;

  if actor_role = 'DIRECTOR' and not exists (
    select 1
    from production_control.director_entitlements entitlement
    where entitlement.auth_user_id = actor_auth_user
      and entitlement.tournament_id = '2026'
      and entitlement.player_id = actor
      and entitlement.role in ('DIRECTOR', 'OWNER')
      and entitlement.status = 'ACTIVE'
      and entitlement.revoked_at is null
  ) then
    raise exception using errcode = '42501', message = 'PRODUCTION_DIRECTOR_AUTHORIZATION_REQUIRED';
  end if;
end;
$function$
