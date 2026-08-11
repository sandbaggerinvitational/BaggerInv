-- Phase 2 Preview authority: keep lifecycle mutation authorization inside the
-- same database transaction and match-row lock as the canonical mutation.

alter function public.finalize_match_authoritative(jsonb)
  rename to finalize_match_authoritative_phase2_inner;
alter function public.reopen_match_authoritative(jsonb)
  rename to reopen_match_authoritative_phase2_inner;

revoke all on function public.finalize_match_authoritative_phase2_inner(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.reopen_match_authoritative_phase2_inner(jsonb)
  from public, anon, authenticated, service_role;

create or replace function public.finalize_match_authoritative(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = scoring_authority, public, extensions, pg_temp
as $$
declare
  match_row scoring_authority.matches%rowtype;
  permission_row scoring_authority.scoring_permissions%rowtype;
  target_match text := input->>'match_id';
  actor text := input#>>'{authorization,player_id}';
  role_name text := upper(coalesce(input#>>'{authorization,role}', 'PLAYER'));
  supplied_permission_revision bigint := coalesce((input#>>'{authorization,permission_revision}')::bigint, -1);
begin
  select * into match_row from scoring_authority.matches where match_id = target_match for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'MATCH_NOT_FOUND'); end if;
  if coalesce((input#>>'{authorization,passport_verified}')::boolean, false) is not true
     or input#>>'{authorization,tournament_id}' <> match_row.tournament_id
     or input#>>'{authorization,match_id}' <> target_match
     or coalesce(actor, '') = '' then
    return jsonb_build_object('ok', false, 'code', 'UNAUTHORIZED');
  end if;
  if role_name = 'PLAYER' then
    select * into permission_row from scoring_authority.scoring_permissions
    where match_id = target_match and player_id = actor;
    if not found or not permission_row.can_score or permission_row.revoked_at is not null then
      return jsonb_build_object('ok', false, 'code', 'UNAUTHORIZED');
    end if;
    if supplied_permission_revision <> permission_row.permission_revision
       or permission_row.permission_revision <> match_row.permission_revision then
      return jsonb_build_object('ok', false, 'code', 'PERMISSION_STALE',
        'current_permission_revision', match_row.permission_revision);
    end if;
  elsif role_name in ('MATCH_ACCESS', 'DIRECTOR') then
    if supplied_permission_revision <> match_row.permission_revision then
      return jsonb_build_object('ok', false, 'code', 'PERMISSION_STALE',
        'current_permission_revision', match_row.permission_revision);
    end if;
  else
    return jsonb_build_object('ok', false, 'code', 'UNAUTHORIZED');
  end if;
  return public.finalize_match_authoritative_phase2_inner(input);
end;
$$;

create or replace function public.reopen_match_authoritative(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = scoring_authority, public, extensions, pg_temp
as $$
declare
  match_row scoring_authority.matches%rowtype;
  target_match text := input->>'match_id';
  actor text := input#>>'{authorization,player_id}';
  supplied_permission_revision bigint := coalesce((input#>>'{authorization,permission_revision}')::bigint, -1);
begin
  select * into match_row from scoring_authority.matches where match_id = target_match for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'MATCH_NOT_FOUND'); end if;
  if coalesce((input#>>'{authorization,passport_verified}')::boolean, false) is not true
     or upper(coalesce(input#>>'{authorization,role}', '')) <> 'DIRECTOR'
     or input#>>'{authorization,tournament_id}' <> match_row.tournament_id
     or input#>>'{authorization,match_id}' <> target_match
     or coalesce(actor, '') = '' then
    return jsonb_build_object('ok', false, 'code', 'DIRECTOR_REQUIRED');
  end if;
  if supplied_permission_revision <> match_row.permission_revision then
    return jsonb_build_object('ok', false, 'code', 'PERMISSION_STALE',
      'current_permission_revision', match_row.permission_revision);
  end if;
  return public.reopen_match_authoritative_phase2_inner(input);
end;
$$;

revoke all on function public.finalize_match_authoritative(jsonb) from public, anon, authenticated;
revoke all on function public.reopen_match_authoritative(jsonb) from public, anon, authenticated;
grant execute on function public.finalize_match_authoritative(jsonb) to service_role;
grant execute on function public.reopen_match_authoritative(jsonb) to service_role;

notify pgrst, 'reload schema';
