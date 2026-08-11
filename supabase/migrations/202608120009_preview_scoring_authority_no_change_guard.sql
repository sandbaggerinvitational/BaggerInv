-- Prevent a same-hole/same-score client resubmission from creating a new
-- logical score revision or Google outbox event. The existing mutation-key
-- idempotency contract remains authoritative and true corrections continue to
-- execute through the original transaction.

alter function public.submit_hole_score_authoritative(jsonb)
  rename to submit_hole_score_authoritative_phase2_inner;

revoke all on function public.submit_hole_score_authoritative_phase2_inner(jsonb)
  from public, anon, authenticated;

create or replace function public.submit_hole_score_authoritative(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = scoring_authority, public, extensions, pg_temp
as $$
declare
  server_started timestamptz := clock_timestamp();
  lock_started timestamptz := clock_timestamp();
  locked_at timestamptz;
  match_row scoring_authority.matches%rowtype;
  hole_row scoring_authority.hole_scores%rowtype;
  mutation_row scoring_authority.score_mutations%rowtype;
  permission_row scoring_authority.scoring_permissions%rowtype;
  tournament_row scoring_authority.tournaments%rowtype;
  gate_row scoring_authority.ingress_gates%rowtype;
  target_match text := input->>'match_id';
  target_hole integer := nullif(input->>'hole_number', '')::integer;
  mutation_identity text := input->>'mutation_key';
  actor text := input#>>'{authorization,player_id}';
  actor_role text := upper(coalesce(input#>>'{authorization,role}', 'PLAYER'));
  team_1_gross jsonb := input->'team_1_gross_scores';
  team_2_gross jsonb := input->'team_2_gross_scores';
  expected_count integer;
  rehearsal boolean := coalesce((input->>'rehearsal')::boolean, false);
  payload_hash_value text;
  progress jsonb;
begin
  if coalesce(target_match, '') = '' or coalesce(mutation_identity, '') = '' then
    return jsonb_build_object('ok', false, 'code', 'INVALID_REQUEST');
  end if;

  select * into match_row
  from scoring_authority.matches
  where match_id = target_match
  for update;
  locked_at := clock_timestamp();
  if not found then return jsonb_build_object('ok', false, 'code', 'MATCH_NOT_FOUND'); end if;

  select * into tournament_row from scoring_authority.tournaments where tournament_id = match_row.tournament_id;
  select * into gate_row from scoring_authority.ingress_gates where tournament_id = match_row.tournament_id;
  if gate_row.state <> 'OPEN' then return jsonb_build_object('ok', false, 'code', 'SCORING_INGRESS_PAUSED'); end if;
  if not rehearsal and (gate_row.authority <> 'SUPABASE' or tournament_row.scoring_authority <> 'SUPABASE') then
    return jsonb_build_object('ok', false, 'code', 'SUPABASE_NOT_AUTHORITY');
  end if;
  if rehearsal and actor_role <> 'DIRECTOR' then
    return jsonb_build_object('ok', false, 'code', 'REHEARSAL_DIRECTOR_REQUIRED');
  end if;

  if coalesce((input#>>'{authorization,passport_verified}')::boolean, false) is not true or
     input#>>'{authorization,tournament_id}' <> match_row.tournament_id or
     input#>>'{authorization,match_id}' <> target_match or coalesce(actor, '') = '' then
    return jsonb_build_object('ok', false, 'code', 'UNAUTHORIZED');
  end if;
  if actor_role = 'PLAYER' then
    select * into permission_row
    from scoring_authority.scoring_permissions
    where match_id = target_match and player_id = actor;
    if not found or not permission_row.can_score or permission_row.revoked_at is not null then
      return jsonb_build_object('ok', false, 'code', 'UNAUTHORIZED');
    end if;
    if coalesce((input#>>'{authorization,permission_revision}')::bigint, -1) <> permission_row.permission_revision or
       permission_row.permission_revision <> match_row.permission_revision then
      return jsonb_build_object('ok', false, 'code', 'PERMISSION_STALE', 'current_permission_revision', match_row.permission_revision);
    end if;
  elsif actor_role in ('MATCH_ACCESS', 'DIRECTOR') then
    if coalesce((input#>>'{authorization,permission_revision}')::bigint, -1) <> match_row.permission_revision then
      return jsonb_build_object('ok', false, 'code', 'PERMISSION_STALE', 'current_permission_revision', match_row.permission_revision);
    end if;
  else
    return jsonb_build_object('ok', false, 'code', 'UNAUTHORIZED');
  end if;

  if match_row.scoring_locked then return jsonb_build_object('ok', false, 'code', 'SCORING_LOCKED'); end if;
  if match_row.status = 'FINAL' then return jsonb_build_object('ok', false, 'code', 'MATCH_FINAL'); end if;
  if target_hole not between 1 and 18 then return jsonb_build_object('ok', false, 'code', 'INVALID_HOLE'); end if;

  expected_count := case when match_row.format = 'BB' then 2 else 1 end;
  if not scoring_authority.valid_gross_scores(team_1_gross, expected_count) or
     not scoring_authority.valid_gross_scores(team_2_gross, expected_count) then
    return jsonb_build_object('ok', false, 'code', 'INVALID_GROSS_SCORES');
  end if;

  payload_hash_value := encode(digest(jsonb_build_object(
    'match_id', target_match,
    'hole_number', target_hole,
    'team_1_gross_scores', team_1_gross,
    'team_2_gross_scores', team_2_gross,
    'actor_id', actor
  )::text, 'sha256'), 'hex');
  select * into mutation_row
  from scoring_authority.score_mutations
  where match_id = target_match and mutation_key = mutation_identity;
  if found then
    if mutation_row.payload_hash = payload_hash_value then
      return mutation_row.result || jsonb_build_object('idempotent', true);
    end if;
    return jsonb_build_object('ok', false, 'code', 'IDEMPOTENCY_CONFLICT');
  end if;

  select * into hole_row
  from scoring_authority.hole_scores
  where match_id = target_match and hole_number = target_hole;
  if found and hole_row.team_1_gross_scores = team_1_gross and hole_row.team_2_gross_scores = team_2_gross then
    progress := scoring_authority.match_progress(target_match, match_row.format);
    return jsonb_build_object(
      'ok', true,
      'code', 'NO_CHANGE',
      'semantic_noop', true,
      'idempotent', true,
      'match_id', target_match,
      'hole_number', target_hole,
      'google_target_match_id', coalesce(input->>'google_target_match_id', target_match),
      'hole_revision', hole_row.hole_revision,
      'match_revision', match_row.match_revision,
      'updated_at', hole_row.updated_at,
      'gross', jsonb_build_object('team_1', hole_row.team_1_gross_scores, 'team_2', hole_row.team_2_gross_scores),
      'strokes', jsonb_build_object('team_1', hole_row.team_1_strokes, 'team_2', hole_row.team_2_strokes),
      'net', jsonb_build_object('team_1', hole_row.team_1_net_score, 'team_2', hole_row.team_2_net_score),
      'hole_winner', hole_row.hole_winner,
      'match', progress,
      'audit_created', false,
      'google_outbox_created', false,
      'timings', jsonb_build_object(
        'lock_wait_ms', extract(milliseconds from locked_at - lock_started),
        'server_transaction_ms', extract(milliseconds from clock_timestamp() - server_started)
      )
    );
  end if;

  return public.submit_hole_score_authoritative_phase2_inner(input);
end;
$$;

revoke all on function public.submit_hole_score_authoritative(jsonb)
  from public, anon, authenticated;
grant execute on function public.submit_hole_score_authoritative(jsonb) to service_role;

notify pgrst, 'reload schema';
