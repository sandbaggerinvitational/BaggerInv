-- Preserve canonical tournament-team presentation metadata without replacing
-- scores, match state, roster identity, or any other competition fact.

alter function public.replace_preview_scoring_authority_import(jsonb)
  rename to replace_preview_scoring_authority_import_full;

revoke all on function public.replace_preview_scoring_authority_import_full(jsonb)
  from public, anon, authenticated;
grant execute on function public.replace_preview_scoring_authority_import_full(jsonb)
  to service_role;

create function public.replace_preview_scoring_authority_import(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = scoring_authority, public, extensions, pg_temp
as $$
declare
  import_scope text := upper(coalesce(payload->>'import_scope', 'FULL'));
  tournament_key text := payload->'tournament'->>'tournament_id';
  incoming_team_count integer;
  stored_team_count integer;
  incoming_team_id_count integer;
  updated_team_count integer := 0;
  captain_count integer := 0;
  item jsonb;
  captain_player_id text;
  stored_team scoring_authority.teams%rowtype;
begin
  if import_scope <> 'TEAM_METADATA' then
    return public.replace_preview_scoring_authority_import_full(payload);
  end if;

  if coalesce(tournament_key, '') = ''
    or upper(coalesce(payload->>'environment', '')) <> 'PREVIEW' then
    return jsonb_build_object('ok', false, 'code', 'PREVIEW_IMPORT_REQUIRED');
  end if;
  if coalesce(payload->>'source_workbook_id', '') = '' then
    return jsonb_build_object('ok', false, 'code', 'SOURCE_WORKBOOK_REQUIRED');
  end if;
  if coalesce(jsonb_typeof(payload->'teams'), '') <> 'array' then
    return jsonb_build_object('ok', false, 'code', 'CANONICAL_TEAMS_REQUIRED');
  end if;
  incoming_team_count := jsonb_array_length(payload->'teams');
  if incoming_team_count = 0 then
    return jsonb_build_object('ok', false, 'code', 'CANONICAL_TEAMS_REQUIRED');
  end if;
  select count(distinct value->>'team_id') into incoming_team_id_count
  from jsonb_array_elements(payload->'teams');
  if incoming_team_id_count <> incoming_team_count then
    return jsonb_build_object('ok', false, 'code', 'CANONICAL_TEAM_ID_DUPLICATE');
  end if;
  if not exists (
    select 1 from scoring_authority.tournaments t
    where t.tournament_id = tournament_key
      and t.source_workbook_id = payload->>'source_workbook_id'
  ) then
    return jsonb_build_object('ok', false, 'code', 'CANONICAL_TOURNAMENT_SOURCE_MISMATCH');
  end if;

  select count(*) into stored_team_count
  from scoring_authority.teams t where t.tournament_id = tournament_key;
  if stored_team_count <> incoming_team_count then
    return jsonb_build_object('ok', false, 'code', 'CANONICAL_TEAM_COUNT_MISMATCH');
  end if;

  -- Validate the complete source batch before changing either team.
  for item in select value from jsonb_array_elements(payload->'teams') loop
    select t.* into stored_team
    from scoring_authority.teams t
    where t.tournament_id = tournament_key and t.team_id = item->>'team_id';
    if not found
      or stored_team.team_side <> coalesce((item->>'team_side')::integer, -1)
      or stored_team.name <> coalesce(item->>'name', '') then
      return jsonb_build_object('ok', false, 'code', 'CANONICAL_TEAM_IDENTITY_MISMATCH',
        'team_id', item->>'team_id');
    end if;

    captain_player_id := btrim(coalesce(item->'source_payload'->>'Captain', ''));
    if captain_player_id <> '' and not exists (
      select 1 from scoring_authority.tournament_players tp
      where tp.tournament_id = tournament_key
        and tp.team_id = stored_team.team_id
        and tp.team_side = stored_team.team_side
        and tp.player_id = captain_player_id
        and tp.participation_status = 'ACTIVE'
    ) then
      return jsonb_build_object('ok', false, 'code', 'CANONICAL_CAPTAIN_ROSTER_MISMATCH',
        'team_id', stored_team.team_id);
    end if;
  end loop;

  for item in select value from jsonb_array_elements(payload->'teams') loop
    captain_player_id := btrim(coalesce(item->'source_payload'->>'Captain', ''));
    update scoring_authority.teams t
    set source_payload = case
      when captain_player_id = '' then t.source_payload - 'Captain'
      else jsonb_set(t.source_payload, '{Captain}', to_jsonb(captain_player_id), true)
    end
    where t.tournament_id = tournament_key and t.team_id = item->>'team_id';
    updated_team_count := updated_team_count + 1;
    if captain_player_id <> '' then captain_count := captain_count + 1; end if;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'scope', import_scope,
    'tournament_id', tournament_key,
    'teams_updated', updated_team_count,
    'captains_preserved', captain_count,
    'competition_state_changed', false
  );
end;
$$;

revoke all on function public.replace_preview_scoring_authority_import(jsonb)
  from public, anon, authenticated;
grant execute on function public.replace_preview_scoring_authority_import(jsonb)
  to service_role;

notify pgrst, 'reload schema';
