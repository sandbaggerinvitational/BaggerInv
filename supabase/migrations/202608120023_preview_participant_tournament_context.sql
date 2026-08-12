-- Resolve Preview participant identity through the Director-approved tournament
-- configuration, never by choosing the numerically largest tournament year.
-- Isolated Phase 2 scoring rehearsals intentionally use year + 1000 and must
-- never become participant identity context.

create or replace function participant_identity.resolve_approved_participant_tournament(target_auth_user_id uuid)
returns text
language sql
security definer
stable
set search_path = participant_identity, scoring_authority, public, extensions, pg_temp
as $$
  select contact.tournament_id
  from participant_identity.user_player_links link
  join participant_identity.participant_identity_contacts contact
    on contact.player_id = link.player_id
   and contact.identity_active
   and link.email_identity_hash = encode(extensions.digest(contact.email_normalized::text, 'sha256'::text), 'hex')
  join scoring_authority.tournament_players membership
    on membership.tournament_id = contact.tournament_id
   and membership.player_id = contact.player_id
   and membership.participation_status = 'ACTIVE'
  join participant_identity.identity_context_revisions revision
    on revision.tournament_id = contact.tournament_id
  join lateral (
    select run.approved_at
    from participant_identity.identity_config_import_runs run
    where run.tournament_id = contact.tournament_id
      and run.status = 'APPROVED'
      and run.source_fingerprint = revision.configuration_fingerprint
    order by run.approved_at desc nulls last, run.requested_at desc
    limit 1
  ) approved on true
  where link.auth_user_id = target_auth_user_id
    and link.status = 'ACTIVE'
  order by approved.approved_at desc nulls last, contact.updated_at desc, contact.tournament_id
  limit 1
$$;

revoke all on function participant_identity.resolve_approved_participant_tournament(uuid)
  from public, anon, authenticated;
grant execute on function participant_identity.resolve_approved_participant_tournament(uuid)
  to service_role;

create or replace function public.read_participant_identity_context_for_auth(
  target_auth_user_id uuid,
  target_tournament_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = participant_identity, scoring_authority, public, extensions, pg_temp
as $$
declare link_row participant_identity.user_player_links%rowtype;
declare target_tournament text := nullif(btrim(coalesce(target_tournament_id, '')), '');
declare approved_tournament text;
declare membership_status text;
declare context jsonb;
begin
  select * into link_row
  from participant_identity.user_player_links
  where auth_user_id = target_auth_user_id;

  if not found then return jsonb_build_object('ok', false, 'code', 'ACTIVE_USER_PLAYER_LINK_REQUIRED'); end if;
  if link_row.status = 'SUSPENDED' then return jsonb_build_object('ok', false, 'code', 'USER_PLAYER_LINK_SUSPENDED'); end if;
  if link_row.status = 'REVOKED' then return jsonb_build_object('ok', false, 'code', 'USER_PLAYER_LINK_REVOKED'); end if;
  if link_row.status <> 'ACTIVE' then return jsonb_build_object('ok', false, 'code', 'ACTIVE_USER_PLAYER_LINK_REQUIRED'); end if;

  approved_tournament := participant_identity.resolve_approved_participant_tournament(target_auth_user_id);
  if approved_tournament is null then
    return jsonb_build_object('ok', false, 'code', 'APPROVED_TOURNAMENT_CONTEXT_REQUIRED');
  end if;
  if target_tournament is null then target_tournament := approved_tournament; end if;
  if target_tournament <> approved_tournament then
    return jsonb_build_object('ok', false, 'code', 'WRONG_TOURNAMENT');
  end if;

  select participation_status into membership_status
  from scoring_authority.tournament_players
  where tournament_id = target_tournament and player_id = link_row.player_id;
  if membership_status is null then return jsonb_build_object('ok', false, 'code', 'WRONG_TOURNAMENT'); end if;
  if membership_status <> 'ACTIVE' then return jsonb_build_object('ok', false, 'code', 'TOURNAMENT_MEMBERSHIP_INACTIVE'); end if;

  context := public.read_participant_identity_context(target_tournament, link_row.player_id);
  if coalesce((context->>'ok')::boolean, false) then
    return jsonb_set(context, '{data,authUserId}', to_jsonb(target_auth_user_id), true);
  end if;
  return context;
end;
$$;

create or replace function public.inspect_participant_identity_tournament_resolution(target_auth_user_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = participant_identity, scoring_authority, public, extensions, pg_temp
as $$
declare link_row participant_identity.user_player_links%rowtype;
declare selected_tournament text;
declare candidates jsonb;
begin
  select * into link_row
  from participant_identity.user_player_links
  where auth_user_id = target_auth_user_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'ACTIVE_USER_PLAYER_LINK_REQUIRED'); end if;

  selected_tournament := participant_identity.resolve_approved_participant_tournament(target_auth_user_id);
  select coalesce(jsonb_agg(jsonb_build_object(
    'tournamentId', tournament.tournament_id,
    'tournamentYear', tournament.tournament_year,
    'tournamentName', tournament.name,
    'membershipStatus', membership.participation_status,
    'approvedIdentityConfiguration', contact.tournament_id is not null and exists (
      select 1
      from participant_identity.identity_config_import_runs run
      join participant_identity.identity_context_revisions revision
        on revision.tournament_id = run.tournament_id
       and revision.configuration_fingerprint = run.source_fingerprint
      where run.tournament_id = tournament.tournament_id and run.status = 'APPROVED'
    ),
    'selected', tournament.tournament_id = selected_tournament
  ) order by tournament.tournament_year, tournament.tournament_id), '[]'::jsonb)
  into candidates
  from scoring_authority.tournament_players membership
  join scoring_authority.tournaments tournament
    on tournament.tournament_id = membership.tournament_id
  left join participant_identity.participant_identity_contacts contact
    on contact.tournament_id = membership.tournament_id
   and contact.player_id = membership.player_id
   and contact.identity_active
   and link_row.email_identity_hash = encode(extensions.digest(contact.email_normalized::text, 'sha256'::text), 'hex')
  where membership.player_id = link_row.player_id
    and membership.participation_status = 'ACTIVE';

  return jsonb_build_object(
    'ok', selected_tournament is not null,
    'code', case when selected_tournament is null then 'APPROVED_TOURNAMENT_CONTEXT_REQUIRED' else 'RESOLVED' end,
    'playerId', link_row.player_id,
    'selectedTournamentId', selected_tournament,
    'candidates', candidates
  );
end;
$$;

revoke all on function public.read_participant_identity_context_for_auth(uuid, text)
  from public, anon, authenticated;
grant execute on function public.read_participant_identity_context_for_auth(uuid, text)
  to service_role;
revoke all on function public.inspect_participant_identity_tournament_resolution(uuid)
  from public, anon, authenticated;
grant execute on function public.inspect_participant_identity_tournament_resolution(uuid)
  to service_role;

notify pgrst, 'reload schema';
