-- Step 6C: keep public profile/editorial fields Sheet-authored while exposing
-- a bounded, audited Supabase projection to secondary historical consumers.
-- No tournament, match, score, permission, authority, or epoch row is touched.

create or replace function public.sync_preview_secondary_history_players(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = scoring_authority, public, extensions, pg_temp
as $$
declare
  preview_project constant text := 'idgigvjjqkfbqjeredpb';
  production_workbook constant text := '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4';
  contract_value constant text := 'player-public-profile-v1';
  authorization_value jsonb := coalesce(input->'authorization', '{}'::jsonb);
  source_workbook text := btrim(coalesce(input->>'source_workbook_id', ''));
  source_fingerprint_value text := lower(btrim(coalesce(input->>'source_fingerprint', '')));
  actor text := btrim(coalesce(authorization_value->>'actor_id', ''));
  player_count integer := jsonb_array_length(coalesce(input->'players', '[]'::jsonb));
  changed_count integer := 0;
  sync_time timestamptz := now();
begin
  if upper(btrim(coalesce(input->>'environment', ''))) <> 'PREVIEW'
     or btrim(coalesce(input->>'project_ref', '')) <> preview_project
     or source_workbook = ''
     or source_workbook = production_workbook then
    return jsonb_build_object('ok', false, 'code', 'PREVIEW_PLAYER_PROFILE_SCOPE_REQUIRED');
  end if;
  if input->>'contract_version' <> contract_value
     or source_fingerprint_value !~ '^[0-9a-f]{64}$'
     or jsonb_typeof(coalesce(input->'players', 'null'::jsonb)) <> 'array'
     or player_count = 0 then
    return jsonb_build_object('ok', false, 'code', 'PLAYER_PUBLIC_PROFILE_CONTRACT_INVALID');
  end if;
  if coalesce((authorization_value->>'authorized')::boolean, false) is not true
     or authorization_value->>'scope' <> 'SECONDARY_HISTORY_PLAYER_PROFILE_SYNC'
     or actor = ''
     or btrim(coalesce(authorization_value->>'authorization_id', '')) = '' then
    return jsonb_build_object('ok', false, 'code', 'DIRECTOR_AUTHORIZATION_REQUIRED');
  end if;
  if (select count(distinct value->>'player_id') from jsonb_array_elements(input->'players')) <> player_count
     or exists (
       select 1 from jsonb_array_elements(input->'players') value
       where btrim(coalesce(value->>'player_id', '')) = ''
          or jsonb_typeof(coalesce(value->'public_profile', 'null'::jsonb)) <> 'object'
          or btrim(coalesce(value->'public_profile'->>'Display Name', '')) = ''
          or btrim(coalesce(value->'public_profile'->>'Slug', '')) = ''
     ) then
    return jsonb_build_object('ok', false, 'code', 'PLAYER_PUBLIC_PROFILE_IDENTITY_INVALID');
  end if;
  if exists (
    select 1 from jsonb_array_elements(input->'players') value
    where not exists (
      select 1 from scoring_authority.players player
      where player.player_id = value->>'player_id'
    )
  ) or exists (
    select 1 from scoring_authority.players player
    where not exists (
      select 1 from jsonb_array_elements(input->'players') value
      where value->>'player_id' = player.player_id
    )
  ) then
    return jsonb_build_object('ok', false, 'code', 'PLAYER_PUBLIC_PROFILE_CANONICAL_IDENTITY_DIVERGENCE');
  end if;

  with incoming as (
    select value->>'player_id' as player_id, value->'public_profile' as public_profile
    from jsonb_array_elements(input->'players') value
  )
  select count(*) into changed_count
  from incoming
  join scoring_authority.players player using (player_id)
  where coalesce(player.source_payload->'public_profile', '{}'::jsonb) <> incoming.public_profile
     or coalesce(player.source_payload->>'public_profile_source_fingerprint', '') <> source_fingerprint_value;

  if changed_count > 0 then
    with incoming as (
      select value->>'player_id' as player_id, value->'public_profile' as public_profile
      from jsonb_array_elements(input->'players') value
    )
    update scoring_authority.players player
    set source_payload = coalesce(player.source_payload, '{}'::jsonb) || jsonb_build_object(
      'public_profile', incoming.public_profile,
      'public_profile_contract_version', contract_value,
      'public_profile_source_workbook_id', source_workbook,
      'public_profile_source_fingerprint', source_fingerprint_value,
      'public_profile_synced_at', sync_time
    )
    from incoming
    where player.player_id = incoming.player_id;

    insert into scoring_authority.audit_events (tournament_id, action, actor_id, metadata)
    values (
      '2026', 'SECONDARY_HISTORY_PLAYER_PROFILE_SYNCED', actor,
      jsonb_build_object(
        'authorizationId', authorization_value->>'authorization_id',
        'contractVersion', contract_value,
        'sourceWorkbookId', source_workbook,
        'sourceFingerprint', source_fingerprint_value,
        'playerCount', player_count,
        'changedCount', changed_count,
        'syncedAt', sync_time
      )
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'changed', changed_count > 0,
    'player_count', player_count,
    'changed_count', changed_count,
    'contract_version', contract_value,
    'source_workbook_id', source_workbook,
    'source_fingerprint', source_fingerprint_value,
    'synced_at', sync_time
  );
exception when others then
  return jsonb_build_object('ok', false, 'code', 'PLAYER_PUBLIC_PROFILE_SYNC_FAILED');
end;
$$;

create or replace function public.read_preview_secondary_history_players(input jsonb)
returns jsonb
language plpgsql
security definer
stable
set search_path = scoring_authority, public, extensions, pg_temp
as $$
declare
  preview_project constant text := 'idgigvjjqkfbqjeredpb';
  contract_value constant text := 'player-public-profile-v1';
  rows_value jsonb;
  profile_count integer;
  canonical_count integer;
  fingerprint_value text;
  source_workbook text;
  synced_at_value timestamptz;
begin
  if upper(btrim(coalesce(input->>'environment', ''))) <> 'PREVIEW'
     or btrim(coalesce(input->>'project_ref', '')) <> preview_project
     or input->>'contract_version' <> contract_value then
    return jsonb_build_object('ok', false, 'code', 'PREVIEW_PLAYER_PROFILE_SCOPE_REQUIRED');
  end if;

  select count(*) into canonical_count from scoring_authority.players;
  select count(*),
         min(player.source_payload->>'public_profile_source_fingerprint'),
         min(player.source_payload->>'public_profile_source_workbook_id'),
         min(nullif(player.source_payload->>'public_profile_synced_at', '')::timestamptz),
         coalesce(jsonb_agg(jsonb_build_object(
           'player_id', player.player_id,
           'canonical_display_name', player.display_name,
           'public_profile', player.source_payload->'public_profile'
         ) order by player.player_id), '[]'::jsonb)
  into profile_count, fingerprint_value, source_workbook, synced_at_value, rows_value
  from scoring_authority.players player
  where jsonb_typeof(player.source_payload->'public_profile') = 'object';

  if canonical_count = 0 or profile_count <> canonical_count
     or fingerprint_value is null
     or exists (
       select 1 from scoring_authority.players player
       where coalesce(player.source_payload->>'public_profile_source_fingerprint', '') <> fingerprint_value
     ) then
    return jsonb_build_object('ok', false, 'code', 'PLAYER_PUBLIC_PROFILE_PROJECTION_INCOMPLETE');
  end if;

  return jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object(
      'contract_version', contract_value,
      'player_count', profile_count,
      'source_workbook_id', source_workbook,
      'source_fingerprint', fingerprint_value,
      'synced_at', synced_at_value,
      'players', rows_value
    )
  );
end;
$$;

revoke all on function public.sync_preview_secondary_history_players(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.sync_preview_secondary_history_players(jsonb) to service_role;

revoke all on function public.read_preview_secondary_history_players(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.read_preview_secondary_history_players(jsonb) to service_role;
