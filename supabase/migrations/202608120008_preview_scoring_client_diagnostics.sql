-- Preview-only physical-device scoring diagnostics. These observations are
-- downstream of participant scoring and never participate in authorization,
-- mutation success, Google delivery, or finalization.

create table scoring_authority.client_diagnostics (
  match_id text not null references scoring_authority.matches(match_id) on delete cascade,
  mutation_key text not null,
  tournament_id text not null references scoring_authority.tournaments(tournament_id) on delete cascade,
  hole_number integer not null check (hole_number between 1 and 18),
  player_id text not null,
  metrics jsonb not null default '{}'::jsonb check (jsonb_typeof(metrics) = 'object'),
  local_measured_at timestamptz,
  authoritative_confirmed_at timestamptz,
  queue_cleared_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (match_id, mutation_key)
);

create index scoring_authority_client_diagnostics_recent_idx
  on scoring_authority.client_diagnostics (tournament_id, updated_at desc);

alter table scoring_authority.client_diagnostics enable row level security;
revoke all on table scoring_authority.client_diagnostics from public, anon, authenticated;
grant all on table scoring_authority.client_diagnostics to service_role;

create or replace function public.record_preview_scoring_client_diagnostic(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = scoring_authority, public, extensions, pg_temp
as $$
declare
  target_match text := input->>'match_id';
  target_tournament text := input->>'tournament_id';
  target_hole integer := (input->>'hole_number')::integer;
  mutation_identity text := input->>'mutation_key';
begin
  if upper(coalesce(input->>'environment', '')) <> 'PREVIEW' then
    return jsonb_build_object('ok', false, 'code', 'PREVIEW_REQUIRED');
  end if;
  if target_match is null or target_tournament is null or mutation_identity is null or target_hole not between 1 and 18 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_DIAGNOSTIC');
  end if;
  if not exists (
    select 1 from scoring_authority.matches
    where match_id = target_match and tournament_id = target_tournament
  ) then return jsonb_build_object('ok', false, 'code', 'MATCH_NOT_FOUND'); end if;

  insert into scoring_authority.client_diagnostics (
    match_id, mutation_key, tournament_id, hole_number, player_id, metrics,
    local_measured_at, authoritative_confirmed_at, queue_cleared_at
  ) values (
    target_match, mutation_identity, target_tournament, target_hole,
    coalesce(nullif(input->>'player_id', ''), 'Authorized participant'),
    coalesce(input->'metrics', '{}'::jsonb),
    nullif(input->>'local_measured_at', '')::timestamptz,
    nullif(input->>'authoritative_confirmed_at', '')::timestamptz,
    nullif(input->>'queue_cleared_at', '')::timestamptz
  )
  on conflict (match_id, mutation_key) do update set
    metrics = scoring_authority.client_diagnostics.metrics || excluded.metrics,
    local_measured_at = coalesce(excluded.local_measured_at, scoring_authority.client_diagnostics.local_measured_at),
    authoritative_confirmed_at = coalesce(excluded.authoritative_confirmed_at, scoring_authority.client_diagnostics.authoritative_confirmed_at),
    queue_cleared_at = coalesce(excluded.queue_cleared_at, scoring_authority.client_diagnostics.queue_cleared_at),
    updated_at = now();
  return jsonb_build_object('ok', true, 'match_id', target_match, 'hole_number', target_hole);
end;
$$;

revoke all on function public.record_preview_scoring_client_diagnostic(jsonb) from public, anon, authenticated;
grant execute on function public.record_preview_scoring_client_diagnostic(jsonb) to service_role;

create or replace function public.read_preview_scoring_participant_context(input jsonb)
returns jsonb
language plpgsql
security definer
stable
set search_path = scoring_authority, public, extensions, pg_temp
as $$
declare
  target_match text := input->>'match_id';
  actor text := input->>'player_id';
  participant_role text := upper(coalesce(input->>'role', 'PLAYER'));
  supplied_permission_revision bigint := coalesce((input->>'permission_revision')::bigint, -1);
  match_row scoring_authority.matches%rowtype;
  permission_ok boolean := false;
begin
  select * into match_row from scoring_authority.matches where match_id = target_match;
  if not found then return jsonb_build_object('ok', false, 'code', 'MATCH_NOT_FOUND'); end if;

  if coalesce((input->>'passport_verified')::boolean, false) is true and
     input->>'tournament_id' = match_row.tournament_id and supplied_permission_revision = match_row.permission_revision then
    if participant_role = 'PLAYER' then
      select exists (
        select 1 from scoring_authority.scoring_permissions
        where match_id = target_match and player_id = actor and can_score and revoked_at is null
          and permission_revision = match_row.permission_revision
      ) into permission_ok;
    elsif participant_role in ('MATCH_ACCESS', 'DIRECTOR') then
      permission_ok := true;
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object(
      'match', to_jsonb(match_row),
      'holes', coalesce((select jsonb_agg(to_jsonb(h) order by hole_number) from scoring_authority.hole_scores h where h.match_id = target_match), '[]'::jsonb),
      'authorization', jsonb_build_object(
        'verified', permission_ok,
        'writable', permission_ok and match_row.status <> 'FINAL' and not match_row.scoring_locked,
        'permission_revision', match_row.permission_revision
      )
    )
  );
end;
$$;

revoke all on function public.read_preview_scoring_participant_context(jsonb) from public, anon, authenticated;
grant execute on function public.read_preview_scoring_participant_context(jsonb) to service_role;

notify pgrst, 'reload schema';
