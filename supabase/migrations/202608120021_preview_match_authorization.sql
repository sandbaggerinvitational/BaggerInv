-- Preview-only service/server match-access authorization. Player Passport stays
-- the identity authority; the trusted server supplies its effective Player ID.

create or replace function scoring_authority.match_access_decision(
  target_tournament_id text,
  target_player_id text,
  target_match_id text,
  requested_action text
)
returns jsonb
language plpgsql
stable
set search_path = scoring_authority, participant_identity, public, extensions, pg_temp
as $$
declare
  started_at timestamptz := clock_timestamp();
  tournament_key text := btrim(coalesce(target_tournament_id, ''));
  player_key text := btrim(coalesce(target_player_id, ''));
  match_key text := btrim(coalesce(target_match_id, ''));
  action_key text := upper(btrim(coalesce(requested_action, '')));
  match_row scoring_authority.matches%rowtype;
  permission_row scoring_authority.scoring_permissions%rowtype;
  membership_active boolean := false;
  participant_member boolean := false;
  permission_active boolean := false;
  player_name text := '';
  allowed_value boolean := false;
  reason_code text := 'AUTHORIZED';
  context_revision_value bigint := 0;
begin
  select * into match_row from scoring_authority.matches m
    where m.match_id = match_key and m.tournament_id = tournament_key;
  select exists(select 1 from scoring_authority.tournament_players tp
    where tp.tournament_id = tournament_key and tp.player_id = player_key
      and tp.participation_status = 'ACTIVE') into membership_active;
  select exists(select 1 from scoring_authority.match_participants mp
    where mp.match_id = match_key and mp.player_id = player_key) into participant_member;
  select coalesce(p.display_name, '') into player_name from scoring_authority.players p where p.player_id = player_key;
  select * into permission_row from scoring_authority.scoring_permissions sp
    where sp.match_id = match_key and sp.player_id = player_key;
  permission_active := found and permission_row.can_score and permission_row.revoked_at is null;
  select coalesce(cr.context_revision, 0) into context_revision_value
    from participant_identity.identity_context_revisions cr where cr.tournament_id = tournament_key;
  context_revision_value := coalesce(context_revision_value, 0);

  if action_key not in ('VIEW_MATCH', 'VIEW_FINAL_SCORECARD', 'START_SCORING', 'VIEW_GAME_CENTER') then
    reason_code := 'INVALID_ACTION';
  elsif match_row.match_id is null then reason_code := 'MATCH_NOT_FOUND';
  elsif not membership_active then reason_code := 'TOURNAMENT_MEMBERSHIP_INACTIVE';
  elsif not participant_member then reason_code := 'NOT_MATCH_PARTICIPANT';
  elsif action_key in ('VIEW_MATCH', 'VIEW_GAME_CENTER') then allowed_value := true;
  elsif action_key = 'VIEW_FINAL_SCORECARD' then
    if match_row.status <> 'FINAL' then reason_code := 'MATCH_NOT_FINAL';
    else allowed_value := true;
    end if;
  elsif action_key = 'START_SCORING' then
    if match_row.status = 'FINAL' then reason_code := 'MATCH_FINAL';
    elsif match_row.scoring_locked then reason_code := 'MATCH_LOCKED';
    elsif not permission_active then reason_code := 'SCORING_PERMISSION_REVOKED';
    elsif permission_row.permission_revision <> match_row.permission_revision then reason_code := 'SCORING_PERMISSION_STALE';
    elsif match_row.status <> 'LIVE' then reason_code := 'MATCH_NOT_SCOREABLE';
    else allowed_value := true;
    end if;
  end if;

  return jsonb_build_object(
    'allowed', allowed_value,
    'code', case when allowed_value then 'AUTHORIZED' else reason_code end,
    'action', action_key,
    'tournament_id', tournament_key,
    'player_id', player_key,
    'player_display_name', coalesce(player_name, ''),
    'match_id', match_key,
    'membership_active', membership_active,
    'participant_membership', participant_member,
    'match_status', coalesce(match_row.status, ''),
    'scoring_locked', coalesce(match_row.scoring_locked, false),
    'can_score', permission_active,
    'permission_revision', coalesce(permission_row.permission_revision, 0),
    'match_permission_revision', coalesce(match_row.permission_revision, 0),
    'match_revision', coalesce(match_row.match_revision, 0),
    'context_revision', context_revision_value,
    'read_only', action_key <> 'START_SCORING',
    'query_ms', round(extract(epoch from (clock_timestamp() - started_at)) * 1000, 3)
  );
end;
$$;

revoke all on function scoring_authority.match_access_decision(text,text,text,text)
  from public, anon, authenticated;

create or replace function public.authorize_match_access(
  target_tournament_id text,
  target_player_id text,
  target_match_id text,
  requested_action text
)
returns jsonb
language sql
security definer
stable
set search_path = scoring_authority, participant_identity, public, extensions, pg_temp
as $$
  select scoring_authority.match_access_decision(
    target_tournament_id, target_player_id, target_match_id, requested_action
  );
$$;

create or replace function public.read_match_authorization_matrix(target_tournament_id text)
returns jsonb
language plpgsql
security definer
stable
set search_path = scoring_authority, participant_identity, public, extensions, pg_temp
as $$
declare
  started_at timestamptz := clock_timestamp();
  tournament_key text := btrim(coalesce(target_tournament_id, ''));
  decisions jsonb;
begin
  select coalesce(jsonb_agg(
    scoring_authority.match_access_decision(tournament_key, tp.player_id, m.match_id, action_name)
    order by tp.player_id, m.match_id, action_name
  ), '[]'::jsonb) into decisions
  from scoring_authority.tournament_players tp
  cross join scoring_authority.matches m
  cross join unnest(array['START_SCORING','VIEW_FINAL_SCORECARD','VIEW_GAME_CENTER','VIEW_MATCH']) action_name
  where tp.tournament_id = tournament_key and tp.participation_status = 'ACTIVE'
    and m.tournament_id = tournament_key;
  return jsonb_build_object(
    'ok', true,
    'tournament_id', tournament_key,
    'decisions', decisions,
    'query_ms', round(extract(epoch from (clock_timestamp() - started_at)) * 1000, 3)
  );
end;
$$;

revoke all on function public.authorize_match_access(text,text,text,text) from public, anon, authenticated;
revoke all on function public.read_match_authorization_matrix(text) from public, anon, authenticated;
grant execute on function public.authorize_match_access(text,text,text,text) to service_role;
grant execute on function public.read_match_authorization_matrix(text) to service_role;

notify pgrst, 'reload schema';
