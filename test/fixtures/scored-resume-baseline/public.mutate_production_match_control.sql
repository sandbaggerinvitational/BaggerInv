CREATE OR REPLACE FUNCTION public.mutate_production_match_control(input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'production_control', 'scoring_authority'
AS $function$
declare
  match_row scoring_authority.matches%rowtype;
  next_match_row scoring_authority.matches%rowtype;
  mutation_row scoring_authority.score_mutations%rowtype;
  target_match text := input->>'match_id';
  operation text := pg_catalog.upper(coalesce(input->>'operation', ''));
  mutation_identity text := input->>'mutation_key';
  actor text := input#>>'{authorization,player_id}';
  expected_match bigint := coalesce(
    (input->>'expected_match_revision')::bigint, -1
  );
  expected_permission bigint := coalesce(
    (input#>>'{authorization,permission_revision}')::bigint, -1
  );
  next_match_revision bigint;
  next_permission_revision bigint;
  permission_changes boolean;
  target_locked boolean;
  target_access boolean;
  event_type text;
  mutation_type text;
  payload_hash_value text;
  result_value jsonb;
  before_permissions jsonb;
  after_permissions jsonb;
  readiness_value jsonb;
  transition_at timestamptz := pg_catalog.clock_timestamp();
begin
  perform production_control.assert_production_scoring_runtime(input);
  perform production_control.assert_production_scoring_actor(input, true);
  if operation not in (
       'MARK_LIVE', 'SCORING_LOCK', 'SCORING_UNLOCK',
       'ACCESS_ACTIVATE', 'ACCESS_REVOKE'
     ) or coalesce(target_match, '') = ''
       or coalesce(mutation_identity, '') = '' then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'INVALID_CONTROL_OPERATION'
    );
  end if;
  -- Tournament Setup always acquires this lock before locking a match. Use the
  -- same order so a setup commit and MARK_LIVE cannot pass one another.
  if operation in ('MARK_LIVE', 'ACCESS_ACTIVATE', 'SCORING_UNLOCK') then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'production-access-governance-v1:2026', 0
    ));
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'production-tournament-setup-v1:2026', 0
    ));
  end if;
  select * into match_row from scoring_authority.matches
    where match_id = target_match and tournament_id = '2026' for update;
  if not found then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'MATCH_NOT_FOUND'
    );
  end if;
  if input#>>'{authorization,match_id}' <> target_match then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'DIRECTOR_REQUIRED'
    );
  end if;
  -- Access-granting operations must validate the current canonical readiness
  -- inside the same transaction, before receipt replay or any permission write.
  -- Setup/access governance hold the advisory locks above; handicap approval
  -- takes all affected match row locks before advancing its current pointer.
  -- READ COMMITTED ensures a waiter sees authority committed before its lock.
  if operation in ('ACCESS_ACTIVATE', 'SCORING_UNLOCK') then
    if pg_catalog.current_setting('transaction_isolation') <> 'read committed' then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'code', 'SCORING_READINESS_REFRESH_REQUIRED'
      );
    end if;
    perform production_control.assert_production_scoring_runtime(input);
    perform production_control.assert_production_scoring_actor(input, true);
    readiness_value := production_control.assert_production_match_scoring_ready_v1(target_match);
    if coalesce((readiness_value->>'ready')::boolean, false) is not true then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'code', 'PRODUCTION_MATCH_NOT_SCORING_READY',
        'match_id', target_match,
        'scoring_readiness_contract', 'production-match-scoring-readiness-v1',
        'reasons', coalesce(readiness_value->'reasons', '[]'::jsonb),
        'audit_created', false, 'google_outbox_created', false
      );
    end if;
    if expected_match <> match_row.match_revision then
      return pg_catalog.jsonb_build_object('ok', false, 'code', 'MATCH_REVISION_CONFLICT');
    end if;
    if expected_permission <> match_row.permission_revision then
      return pg_catalog.jsonb_build_object('ok', false, 'code', 'PERMISSION_STALE');
    end if;
  end if;
  payload_hash_value := production_control.cutover_payload_hash(
    pg_catalog.jsonb_build_object(
      'match_id', target_match, 'operation', operation, 'actor_id', actor
    )
  );
  select * into mutation_row from scoring_authority.score_mutations
    where match_id = target_match and mutation_key = mutation_identity;
  if found then
    if mutation_row.payload_hash = payload_hash_value then
      return mutation_row.result || pg_catalog.jsonb_build_object(
        'idempotent', true
      );
    end if;
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'IDEMPOTENCY_CONFLICT'
    );
  end if;
  if expected_match <> match_row.match_revision then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'MATCH_REVISION_CONFLICT',
      'current_match_revision', match_row.match_revision
    );
  end if;
  if expected_permission <> match_row.permission_revision then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'PERMISSION_STALE',
      'current_permission_revision', match_row.permission_revision
    );
  end if;
  if match_row.status = 'FINAL' then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'MATCH_FINAL'
    );
  end if;
  if operation = 'MARK_LIVE' and match_row.status = 'LIVE' then
    return pg_catalog.jsonb_build_object(
      'ok', true, 'code', 'NO_CHANGE', 'semantic_noop', true,
      'match_id', target_match,
      'match_revision', match_row.match_revision,
      'permission_revision', match_row.permission_revision,
      'status', match_row.status,
      'scoring_locked', match_row.scoring_locked,
      'google_outbox_created', false
    );
  end if;
  if operation = 'MARK_LIVE' and match_row.status <> 'UPCOMING' then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'MATCH_NOT_UPCOMING'
    );
  end if;
  if operation = 'MARK_LIVE' then
    readiness_value :=
      production_control.assert_production_match_scoring_ready_v1(
        target_match
      );
    if coalesce((readiness_value->>'ready')::boolean, false) is not true then
      return pg_catalog.jsonb_build_object(
        'ok', false,
        'code', 'PRODUCTION_MATCH_NOT_SCORING_READY',
        'match_id', target_match,
        'match_revision', match_row.match_revision,
        'permission_revision', match_row.permission_revision,
        'status', match_row.status,
        'scoring_locked', match_row.scoring_locked,
        'scoring_readiness_contract',
          'production-match-scoring-readiness-v1',
        'reasons', coalesce(readiness_value->'reasons', '[]'::jsonb),
        'audit_created', false,
        'google_outbox_created', false
      );
    end if;
  end if;
  if operation in ('SCORING_UNLOCK', 'ACCESS_ACTIVATE') and (
       (operation = 'ACCESS_ACTIVATE' and match_row.scoring_locked)
       or (operation = 'SCORING_UNLOCK' and not match_row.scoring_locked)
     ) then
    if operation = 'ACCESS_ACTIVATE' and match_row.scoring_locked then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'code', 'SCORING_LOCKED'
      );
    end if;
    if not exists (
      select 1 from scoring_authority.scoring_permissions
      where match_id = target_match and (
        not can_score or revoked_at is not null
        or permission_revision <> match_row.permission_revision
      )
    ) then
      return pg_catalog.jsonb_build_object(
        'ok', true, 'code', 'NO_CHANGE', 'semantic_noop', true,
        'match_id', target_match,
        'match_revision', match_row.match_revision,
        'permission_revision', match_row.permission_revision,
        'scoring_locked', match_row.scoring_locked,
        'access_active', true,
        'google_outbox_created', false
      );
    end if;
  end if;
  if operation = 'SCORING_LOCK' and match_row.scoring_locked and not exists (
    select 1 from scoring_authority.scoring_permissions
    where match_id = target_match and (
      can_score or revoked_at is null
      or permission_revision <> match_row.permission_revision
    )
  ) then
    return pg_catalog.jsonb_build_object(
      'ok', true, 'code', 'NO_CHANGE', 'semantic_noop', true,
      'match_id', target_match,
      'match_revision', match_row.match_revision,
      'permission_revision', match_row.permission_revision,
      'scoring_locked', true,
      'access_active', false,
      'google_outbox_created', false
    );
  end if;
  if operation = 'ACCESS_REVOKE' and not exists (
    select 1 from scoring_authority.scoring_permissions
    where match_id = target_match and (
      can_score or revoked_at is null
      or permission_revision <> match_row.permission_revision
    )
  ) then
    return pg_catalog.jsonb_build_object(
      'ok', true, 'code', 'NO_CHANGE', 'semantic_noop', true,
      'match_id', target_match,
      'match_revision', match_row.match_revision,
      'permission_revision', match_row.permission_revision,
      'scoring_locked', match_row.scoring_locked,
      'access_active', false,
      'google_outbox_created', false
    );
  end if;

  select coalesce(pg_catalog.jsonb_agg(
    pg_catalog.to_jsonb(permission) order by player_id
  ), '[]'::jsonb) into before_permissions
  from scoring_authority.scoring_permissions permission
  where match_id = target_match;
  next_match_revision := match_row.match_revision + 1;
  permission_changes := operation <> 'MARK_LIVE';
  next_permission_revision := match_row.permission_revision
    + case when permission_changes then 1 else 0 end;
  target_locked := case operation
    when 'SCORING_LOCK' then true
    when 'SCORING_UNLOCK' then false
    else match_row.scoring_locked end;
  target_access := case operation
    when 'SCORING_LOCK' then false
    when 'SCORING_UNLOCK' then true
    when 'ACCESS_ACTIVATE' then true
    when 'ACCESS_REVOKE' then false
    else exists (
      select 1 from scoring_authority.scoring_permissions
      where match_id = target_match and can_score and revoked_at is null
    ) end;
  event_type := case operation
    when 'MARK_LIVE' then 'MATCH_MARKED_LIVE'
    when 'SCORING_LOCK' then 'SCORING_LOCKED'
    when 'SCORING_UNLOCK' then 'SCORING_UNLOCKED'
    when 'ACCESS_ACTIVATE' then 'SCORING_ACCESS_ACTIVATED'
    else 'SCORING_ACCESS_REVOKED' end;
  mutation_type := operation;

  update scoring_authority.matches set
    status = case when operation = 'MARK_LIVE' then 'LIVE' else status end,
    scoring_locked = target_locked,
    match_revision = next_match_revision,
    permission_revision = next_permission_revision,
    authority_updated_at = transition_at,
    updated_at = transition_at
  where match_id = target_match returning * into next_match_row;
  if permission_changes then
    update scoring_authority.scoring_permissions set
      can_score = target_access,
      permission_revision = next_permission_revision,
      revoked_at = case when target_access then null else transition_at end,
      updated_at = transition_at
    where match_id = target_match;
  end if;
  select coalesce(pg_catalog.jsonb_agg(
    pg_catalog.to_jsonb(permission) order by player_id
  ), '[]'::jsonb) into after_permissions
  from scoring_authority.scoring_permissions permission
  where match_id = target_match;
  result_value := pg_catalog.jsonb_build_object(
    'ok', true, 'code', operation,
    'match_id', target_match,
    'google_target_match_id', target_match,
    'match_revision', next_match_revision,
    'previous_permission_revision', match_row.permission_revision,
    'permission_revision', next_permission_revision,
    'status', next_match_row.status,
    'scoring_locked', target_locked,
    'access_active', target_access,
    'updated_at', transition_at,
    'permission_transition', pg_catalog.jsonb_build_object(
      'before', before_permissions, 'after', after_permissions
    ),
    'audit_created', true,
    'google_outbox_created', true
  );
  insert into scoring_authority.score_mutations (
    match_id, mutation_key, mutation_type, payload_hash,
    previous_match_revision, next_match_revision, result, actor_id
  ) values (
    target_match, mutation_identity, mutation_type, payload_hash_value,
    match_row.match_revision, next_match_revision, result_value, actor
  );
  insert into scoring_authority.score_revision_history (
    match_id, mutation_key, action, previous_match_revision,
    next_match_revision, before_state, after_state, actor_id
  ) values (
    target_match, mutation_identity, event_type,
    match_row.match_revision, next_match_revision,
    pg_catalog.jsonb_build_object(
      'match', pg_catalog.to_jsonb(match_row),
      'permissions', before_permissions
    ),
    pg_catalog.jsonb_build_object(
      'match', pg_catalog.to_jsonb(next_match_row),
      'permissions', after_permissions
    ),
    actor
  );
  insert into scoring_authority.audit_events (
    tournament_id, match_id, mutation_key, action, actor_id, metadata
  ) values (
    '2026', target_match, mutation_identity, event_type, actor, result_value
  );
  insert into scoring_authority.google_outbox_events (
    tournament_id, match_id, match_revision, mutation_key,
    event_type, payload, payload_hash
  ) values (
    '2026', target_match, next_match_revision, mutation_identity,
    event_type, result_value, payload_hash_value
  );
  return result_value;
end;
$function$
