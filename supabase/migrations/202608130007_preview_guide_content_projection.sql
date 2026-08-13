-- Preview-only, versioned Tournament Guide projection.
-- Google remains the Director CMS.  These tables are the persisted participant
-- delivery projection and deliberately do not participate in scoring authority.

create table scoring_authority.guide_content_revisions (
  revision_id uuid primary key default gen_random_uuid(),
  tournament_id text not null check (tournament_id = '2026'),
  projection_revision bigint not null check (projection_revision > 0),
  source_workbook_id text not null,
  content_fingerprint text not null check (content_fingerprint ~ '^[0-9a-f]{64}$'),
  source_workbook_fingerprint text not null check (source_workbook_fingerprint ~ '^[0-9a-f]{64}$'),
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  source_canonical_json text not null,
  content_canonical_json text not null,
  payload_canonical_json text not null,
  content_payload jsonb not null,
  validation_status text not null check (validation_status = 'VALID'),
  source_metadata jsonb not null default '{}'::jsonb,
  source_sync_sequence bigint not null check (source_sync_sequence > 0),
  trigger_type text not null check (trigger_type in ('INITIAL', 'SCHEDULED', 'MANUAL')),
  imported_by text not null,
  imported_at timestamptz not null default now(),
  check (jsonb_typeof(content_payload) = 'object'),
  check (coalesce(content_payload->>'schemaVersion', '') = 'guide-projection-v1'),
  check (coalesce(jsonb_typeof(content_payload->'content'), '') = 'object'),
  check (jsonb_typeof(source_metadata) = 'object'),
  check (btrim(source_workbook_id) <> ''),
  check (source_workbook_id <> '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4'),
  check (jsonb_typeof(source_canonical_json::jsonb) = 'object'),
  check (coalesce((source_canonical_json::jsonb)->>'tournamentId', '') = tournament_id),
  check (coalesce(jsonb_typeof((source_canonical_json::jsonb)->'source'), '') = 'object'),
  check (coalesce((content_canonical_json::jsonb)#>>'{tournamentIdentity,id}', '') = tournament_id),
  check (coalesce(((content_canonical_json::jsonb)#>>'{tournamentIdentity,year}')::integer, 0) = 2026),
  check (content_canonical_json::jsonb = content_payload->'content'),
  check (payload_canonical_json::jsonb = content_payload),
  check (encode(extensions.digest(source_canonical_json, 'sha256'), 'hex') = source_workbook_fingerprint),
  check (encode(extensions.digest(content_canonical_json, 'sha256'), 'hex') = content_fingerprint),
  check (encode(extensions.digest(payload_canonical_json, 'sha256'), 'hex') = payload_hash),
  check (btrim(imported_by) <> ''),
  unique (tournament_id, projection_revision),
  unique (tournament_id, content_fingerprint),
  unique (tournament_id, revision_id),
  unique (tournament_id, source_workbook_id, revision_id)
);

-- Publication is a pointer so immutable content revisions are never edited merely
-- to advance, roll back, or re-verify the current participant projection.
create table scoring_authority.guide_projection_current (
  tournament_id text primary key check (tournament_id = '2026'),
  source_workbook_id text not null
    check (btrim(source_workbook_id) <> '')
    check (source_workbook_id <> '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4'),
  revision_id uuid not null,
  publication_sequence bigint not null default 1 check (publication_sequence > 0),
  source_sync_sequence bigint not null check (source_sync_sequence > 0),
  published_at timestamptz not null default now(),
  last_verified_at timestamptz not null default now(),
  foreign key (tournament_id, source_workbook_id, revision_id)
    references scoring_authority.guide_content_revisions (
      tournament_id, source_workbook_id, revision_id
    )
);

create table scoring_authority.guide_sync_controls (
  tournament_id text primary key check (tournament_id = '2026'),
  next_attempt_sequence bigint not null default 1 check (next_attempt_sequence > 0),
  newest_claimed_sequence bigint not null default 0 check (newest_claimed_sequence >= 0),
  newest_completed_sequence bigint not null default 0 check (newest_completed_sequence >= 0),
  newest_published_sequence bigint not null default 0 check (newest_published_sequence >= 0),
  updated_at timestamptz not null default now()
);

create table scoring_authority.guide_sync_runs (
  run_id uuid primary key default gen_random_uuid(),
  tournament_id text not null check (tournament_id = '2026'),
  attempt_sequence bigint not null check (attempt_sequence > 0),
  claim_token uuid not null unique,
  project_ref text not null check (project_ref = 'idgigvjjqkfbqjeredpb'),
  source_workbook_id text not null,
  trigger_type text not null check (trigger_type in ('INITIAL', 'SCHEDULED', 'MANUAL')),
  actor_id text not null,
  status text not null default 'CLAIMED'
    check (status in ('CLAIMED', 'SUCCEEDED', 'NOOP', 'FAILED', 'REJECTED', 'STALE')),
  previous_content_fingerprint text,
  source_workbook_fingerprint text,
  new_content_fingerprint text,
  changed boolean,
  validation_status text not null default 'NOT_RUN'
    check (validation_status in ('NOT_RUN', 'VALID', 'INVALID')),
  published_revision_id uuid,
  failure_category text,
  failure_safe text,
  audit_metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  duration_ms numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (previous_content_fingerprint is null or previous_content_fingerprint ~ '^[0-9a-f]{64}$'),
  check (source_workbook_fingerprint is null or source_workbook_fingerprint ~ '^[0-9a-f]{64}$'),
  check (new_content_fingerprint is null or new_content_fingerprint ~ '^[0-9a-f]{64}$'),
  check (jsonb_typeof(audit_metadata) = 'object'),
  check (btrim(source_workbook_id) <> ''),
  check (source_workbook_id <> '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4'),
  check (btrim(actor_id) <> ''),
  check (duration_ms is null or duration_ms >= 0),
  unique (tournament_id, attempt_sequence),
  foreign key (tournament_id, published_revision_id)
    references scoring_authority.guide_content_revisions (tournament_id, revision_id)
);

create index scoring_authority_guide_sync_runs_recent_idx
  on scoring_authority.guide_sync_runs (tournament_id, attempt_sequence desc);
create index scoring_authority_guide_sync_runs_status_idx
  on scoring_authority.guide_sync_runs (status, started_at desc);

alter table scoring_authority.guide_content_revisions enable row level security;
alter table scoring_authority.guide_projection_current enable row level security;
alter table scoring_authority.guide_sync_controls enable row level security;
alter table scoring_authority.guide_sync_runs enable row level security;

revoke all on scoring_authority.guide_content_revisions from public, anon, authenticated;
revoke all on scoring_authority.guide_projection_current from public, anon, authenticated;
revoke all on scoring_authority.guide_sync_controls from public, anon, authenticated;
revoke all on scoring_authority.guide_sync_runs from public, anon, authenticated;
revoke all on scoring_authority.guide_content_revisions from service_role;
revoke all on scoring_authority.guide_projection_current from service_role;
revoke all on scoring_authority.guide_sync_controls from service_role;
revoke all on scoring_authority.guide_sync_runs from service_role;
grant select on scoring_authority.guide_content_revisions to service_role;
grant select on scoring_authority.guide_projection_current to service_role;
grant select on scoring_authority.guide_sync_controls to service_role;
grant select on scoring_authority.guide_sync_runs to service_role;

-- Content rows are immutable even to an accidental privileged update.  Publication
-- changes are represented by the pointer and sync-run audit tables instead.
create or replace function scoring_authority.reject_guide_revision_mutation()
returns trigger
language plpgsql
set search_path = scoring_authority, public, pg_temp
as $$
begin
  raise exception using errcode = 'P0001', message = 'GUIDE_CONTENT_REVISION_IMMUTABLE';
end;
$$;

create trigger scoring_authority_guide_revision_immutable
before update or delete on scoring_authority.guide_content_revisions
for each row execute function scoring_authority.reject_guide_revision_mutation();

create or replace function public.claim_preview_guide_sync(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = scoring_authority, public, extensions, pg_temp
as $$
declare
  target_tournament constant text := '2026';
  target_project constant text := 'idgigvjjqkfbqjeredpb';
  production_workbook constant text := '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4';
  source_workbook text := btrim(coalesce(input->>'source_workbook_id', ''));
  actor text := left(btrim(coalesce(input->>'requested_by', '')), 180);
  requested_trigger text := upper(btrim(coalesce(input->>'trigger_type', '')));
  next_sequence bigint;
  token uuid := gen_random_uuid();
  current_fingerprint text;
  current_revision bigint;
begin
  if upper(btrim(coalesce(input->>'environment', ''))) <> 'PREVIEW'
     or btrim(coalesce(input->>'project_ref', '')) <> target_project
     or btrim(coalesce(input->>'tournament_id', '')) <> target_tournament
     or coalesce((input->>'tournament_year')::integer, 0) <> 2026
     or source_workbook = '' or source_workbook = production_workbook or actor = ''
     or requested_trigger not in ('INITIAL', 'SCHEDULED', 'MANUAL') then
    return jsonb_build_object('ok', false, 'code', 'PREVIEW_GUIDE_SYNC_CLAIM_INVALID');
  end if;
  if not exists (
    select 1 from scoring_authority.tournaments t
    where t.tournament_id = target_tournament and t.tournament_year = 2026
      and t.source_workbook_id = source_workbook
  ) then
    return jsonb_build_object('ok', false, 'code', 'PREVIEW_GUIDE_SOURCE_MISMATCH');
  end if;

  insert into scoring_authority.guide_sync_controls (tournament_id)
  values (target_tournament) on conflict (tournament_id) do nothing;
  select c.next_attempt_sequence into next_sequence
  from scoring_authority.guide_sync_controls c
  where c.tournament_id = target_tournament for update;
  update scoring_authority.guide_sync_controls set
    next_attempt_sequence = next_sequence + 1,
    newest_claimed_sequence = next_sequence,
    updated_at = now()
  where tournament_id = target_tournament;

  select r.content_fingerprint, r.projection_revision
    into current_fingerprint, current_revision
  from scoring_authority.guide_projection_current p
  join scoring_authority.guide_content_revisions r
    on r.tournament_id = p.tournament_id
    and r.source_workbook_id = p.source_workbook_id
    and r.revision_id = p.revision_id
  where p.tournament_id = target_tournament
    and p.source_workbook_id = source_workbook;

  insert into scoring_authority.guide_sync_runs (
    tournament_id, attempt_sequence, claim_token, project_ref, source_workbook_id,
    trigger_type, actor_id, previous_content_fingerprint
  ) values (
    target_tournament, next_sequence, token, target_project, source_workbook,
    requested_trigger, actor, current_fingerprint
  );

  return jsonb_build_object(
    'ok', true,
    'run_id', (select run_id from scoring_authority.guide_sync_runs where claim_token = token),
    'claim_token', token,
    'attempt_sequence', next_sequence,
    'current_content_fingerprint', current_fingerprint,
    'current_projection_revision', current_revision
  );
exception when invalid_text_representation then
  return jsonb_build_object('ok', false, 'code', 'PREVIEW_GUIDE_SYNC_CLAIM_INVALID');
end;
$$;

create or replace function public.publish_preview_guide_projection(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = scoring_authority, public, extensions, pg_temp
as $$
declare
  target_tournament constant text := '2026';
  target_project constant text := 'idgigvjjqkfbqjeredpb';
  production_workbook constant text := '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4';
  source_workbook text := btrim(coalesce(input->>'source_workbook_id', ''));
  token_text text := btrim(coalesce(input->>'claim_token', ''));
  token uuid;
  content_fingerprint_value text := lower(btrim(coalesce(input->>'content_fingerprint', '')));
  source_fingerprint_value text := lower(btrim(coalesce(input->>'source_workbook_fingerprint', '')));
  payload_hash_value text := lower(btrim(coalesce(input->>'payload_hash', '')));
  source_canonical_text text := coalesce(input->>'source_canonical_json', '');
  content_canonical_text text := coalesce(input->>'content_canonical_json', '');
  payload_canonical_text text := coalesce(input->>'payload_canonical_json', '');
  source_canonical_value jsonb;
  content_canonical_value jsonb;
  payload_canonical_value jsonb;
  payload_value jsonb := coalesce(input->'content_payload', 'null'::jsonb);
  source_metadata_value jsonb := coalesce(input->'source_metadata', '{}'::jsonb);
  run_row scoring_authority.guide_sync_runs%rowtype;
  control_row scoring_authority.guide_sync_controls%rowtype;
  existing_revision scoring_authority.guide_content_revisions%rowtype;
  current_revision scoring_authority.guide_content_revisions%rowtype;
  current_pointer scoring_authority.guide_projection_current%rowtype;
  next_revision bigint;
  next_publication bigint;
  changed_value boolean;
  reused_revision boolean := false;
  elapsed numeric;
begin
  if upper(btrim(coalesce(input->>'environment', ''))) <> 'PREVIEW'
     or btrim(coalesce(input->>'project_ref', '')) <> target_project
     or btrim(coalesce(input->>'tournament_id', '')) <> target_tournament
     or coalesce((input->>'tournament_year')::integer, 0) <> 2026
     or source_workbook = '' or source_workbook = production_workbook
     or token_text !~ '^[0-9a-fA-F-]{36}$'
     or content_fingerprint_value !~ '^[0-9a-f]{64}$'
     or source_fingerprint_value !~ '^[0-9a-f]{64}$'
     or payload_hash_value !~ '^[0-9a-f]{64}$'
     or jsonb_typeof(payload_value) <> 'object'
     or payload_value = '{}'::jsonb
     or btrim(source_canonical_text) = ''
     or btrim(content_canonical_text) = ''
     or btrim(payload_canonical_text) = ''
     or jsonb_typeof(source_metadata_value) <> 'object'
     or upper(btrim(coalesce(input->>'validation_status', ''))) <> 'VALID' then
    return jsonb_build_object('ok', false, 'code', 'VALIDATED_GUIDE_PROJECTION_REQUIRED');
  end if;
  begin
    source_canonical_value := source_canonical_text::jsonb;
    content_canonical_value := content_canonical_text::jsonb;
    payload_canonical_value := payload_canonical_text::jsonb;
  exception when invalid_text_representation then
    return jsonb_build_object('ok', false, 'code', 'GUIDE_PROJECTION_CANONICAL_JSON_INVALID');
  end;
  if coalesce(jsonb_typeof(source_canonical_value), '') <> 'object'
     or coalesce(jsonb_typeof(content_canonical_value), '') <> 'object'
     or coalesce(jsonb_typeof(payload_canonical_value), '') <> 'object'
     or coalesce(source_canonical_value->>'tournamentId', '') <> target_tournament
     or coalesce(jsonb_typeof(source_canonical_value->'source'), '') <> 'object'
     or coalesce(content_canonical_value#>>'{tournamentIdentity,id}', '') <> target_tournament
     or coalesce((content_canonical_value#>>'{tournamentIdentity,year}')::integer, 0) <> 2026
     or payload_canonical_value <> payload_value
     or coalesce(payload_canonical_value->>'schemaVersion', '') <> 'guide-projection-v1'
     or coalesce(jsonb_typeof(payload_canonical_value->'content'), '') <> 'object'
     or payload_canonical_value->'content' <> content_canonical_value
     or encode(extensions.digest(source_canonical_text, 'sha256'), 'hex') <> source_fingerprint_value
     or encode(extensions.digest(content_canonical_text, 'sha256'), 'hex') <> content_fingerprint_value
     or encode(extensions.digest(payload_canonical_text, 'sha256'), 'hex') <> payload_hash_value then
    return jsonb_build_object('ok', false, 'code', 'GUIDE_PROJECTION_HASH_MISMATCH');
  end if;
  token := token_text::uuid;
  if not exists (
    select 1 from scoring_authority.tournaments t
    where t.tournament_id = target_tournament and t.tournament_year = 2026
      and t.source_workbook_id = source_workbook
  ) then return jsonb_build_object('ok', false, 'code', 'PREVIEW_GUIDE_SOURCE_MISMATCH'); end if;

  select * into run_row from scoring_authority.guide_sync_runs r
  where r.tournament_id = target_tournament and r.claim_token = token for update;
  if not found or run_row.status <> 'CLAIMED'
     or run_row.project_ref <> target_project or run_row.source_workbook_id <> source_workbook then
    return jsonb_build_object('ok', false, 'code', 'STALE_GUIDE_SYNC', 'superseded', true);
  end if;
  select * into control_row from scoring_authority.guide_sync_controls c
  where c.tournament_id = target_tournament for update;
  if exists (
    select 1 from scoring_authority.guide_projection_current p
    where p.tournament_id = target_tournament
      and p.source_workbook_id <> source_workbook
  ) then
    return jsonb_build_object('ok', false, 'code', 'GUIDE_CURRENT_WORKBOOK_MISMATCH');
  end if;
  if run_row.attempt_sequence < control_row.newest_published_sequence then
    update scoring_authority.guide_sync_runs set
      status = 'STALE', completed_at = now(), validation_status = 'VALID',
      source_workbook_fingerprint = source_fingerprint_value,
      new_content_fingerprint = content_fingerprint_value,
      changed = null, failure_category = 'SUPERSEDED_BY_NEWER_PUBLICATION',
      failure_safe = 'A newer valid Guide publication superseded this work.',
      duration_ms = round(extract(epoch from (clock_timestamp() - started_at)) * 1000, 3),
      updated_at = now()
    where run_id = run_row.run_id;
    return jsonb_build_object('ok', false, 'code', 'STALE_GUIDE_SYNC', 'superseded', true);
  end if;

  select * into current_pointer
  from scoring_authority.guide_projection_current p
  where p.tournament_id = target_tournament
    and p.source_workbook_id = source_workbook;
  if found then
    select * into current_revision
    from scoring_authority.guide_content_revisions r
    where r.tournament_id = target_tournament
      and r.source_workbook_id = source_workbook
      and r.revision_id = current_pointer.revision_id;
  end if;
  changed_value := current_revision.revision_id is null
    or current_revision.content_fingerprint <> content_fingerprint_value;
  elapsed := round(extract(epoch from (clock_timestamp() - run_row.started_at)) * 1000, 3);

  if not changed_value then
    if current_revision.source_workbook_id <> source_workbook
       or current_revision.payload_hash <> payload_hash_value
       or current_revision.content_payload <> payload_value
       or current_revision.content_canonical_json <> content_canonical_text
       or current_revision.payload_canonical_json <> payload_canonical_text then
      return jsonb_build_object('ok', false, 'code', 'GUIDE_PROJECTION_CANONICAL_MISMATCH');
    end if;
    update scoring_authority.guide_projection_current set
      source_sync_sequence = run_row.attempt_sequence,
      last_verified_at = now()
    where tournament_id = target_tournament and source_workbook_id = source_workbook;
    update scoring_authority.guide_sync_controls set
      newest_completed_sequence = greatest(newest_completed_sequence, run_row.attempt_sequence),
      newest_published_sequence = greatest(newest_published_sequence, run_row.attempt_sequence),
      updated_at = now()
    where tournament_id = target_tournament;
    update scoring_authority.guide_sync_runs set
      status = 'NOOP', completed_at = now(), validation_status = 'VALID', changed = false,
      source_workbook_fingerprint = source_fingerprint_value,
      new_content_fingerprint = content_fingerprint_value,
      published_revision_id = current_revision.revision_id,
      duration_ms = elapsed, audit_metadata = source_metadata_value, updated_at = now()
    where run_id = run_row.run_id;
    update scoring_authority.guide_sync_runs set
      status = 'STALE', completed_at = now(),
      failure_category = 'SUPERSEDED_BY_NEWER_PUBLICATION',
      failure_safe = 'A newer valid Guide publication superseded this work.',
      duration_ms = round(extract(epoch from (clock_timestamp() - started_at)) * 1000, 3),
      updated_at = now()
    where tournament_id = target_tournament
      and status = 'CLAIMED'
      and attempt_sequence < run_row.attempt_sequence;
    insert into scoring_authority.audit_events (tournament_id, action, actor_id, metadata)
    values (target_tournament, 'GUIDE_SYNC_NOOP', run_row.actor_id,
      jsonb_build_object('attemptSequence', run_row.attempt_sequence,
        'triggerType', run_row.trigger_type, 'contentFingerprint', content_fingerprint_value,
        'projectionRevision', current_revision.projection_revision));
    return jsonb_build_object('ok', true, 'changed', false, 'no_op', true,
      'projection_revision', current_revision.projection_revision,
      'publication_sequence', current_pointer.publication_sequence,
      'revision_id', current_revision.revision_id,
      'content_fingerprint', current_revision.content_fingerprint);
  end if;

  select * into existing_revision from scoring_authority.guide_content_revisions r
  where r.tournament_id = target_tournament and r.content_fingerprint = content_fingerprint_value;
  if existing_revision.revision_id is null then
    select coalesce(max(r.projection_revision), 0) + 1 into next_revision
    from scoring_authority.guide_content_revisions r where r.tournament_id = target_tournament;
    insert into scoring_authority.guide_content_revisions (
      tournament_id, projection_revision, source_workbook_id, content_fingerprint,
      source_workbook_fingerprint, payload_hash, source_canonical_json,
      content_canonical_json, payload_canonical_json, content_payload, validation_status,
      source_metadata, source_sync_sequence, trigger_type, imported_by
    ) values (
      target_tournament, next_revision, source_workbook, content_fingerprint_value,
      source_fingerprint_value, payload_hash_value, source_canonical_text,
      content_canonical_text, payload_canonical_text, payload_value, 'VALID',
      source_metadata_value, run_row.attempt_sequence, run_row.trigger_type, run_row.actor_id
    ) returning * into existing_revision;
  else
    if existing_revision.source_workbook_id <> source_workbook
       or existing_revision.payload_hash <> payload_hash_value
       or existing_revision.content_payload <> payload_value
       or existing_revision.content_canonical_json <> content_canonical_text
       or existing_revision.payload_canonical_json <> payload_canonical_text then
      return jsonb_build_object('ok', false, 'code', 'GUIDE_REVISION_REUSE_MISMATCH');
    end if;
    reused_revision := true;
  end if;

  select coalesce(p.publication_sequence, 0) + 1 into next_publication
  from (select 1) singleton
  left join scoring_authority.guide_projection_current p
    on p.tournament_id = target_tournament;
  insert into scoring_authority.guide_projection_current (
    tournament_id, source_workbook_id, revision_id, publication_sequence, source_sync_sequence
  ) values (
    target_tournament, source_workbook, existing_revision.revision_id,
    next_publication, run_row.attempt_sequence
  ) on conflict (tournament_id) do update set
    source_workbook_id = excluded.source_workbook_id,
    revision_id = excluded.revision_id,
    publication_sequence = excluded.publication_sequence,
    source_sync_sequence = excluded.source_sync_sequence,
    published_at = now(),
    last_verified_at = now();
  update scoring_authority.guide_sync_controls set
    newest_completed_sequence = greatest(newest_completed_sequence, run_row.attempt_sequence),
    newest_published_sequence = greatest(newest_published_sequence, run_row.attempt_sequence),
    updated_at = now()
  where tournament_id = target_tournament;
  update scoring_authority.guide_sync_runs set
    status = 'SUCCEEDED', completed_at = now(), validation_status = 'VALID', changed = true,
    source_workbook_fingerprint = source_fingerprint_value,
    new_content_fingerprint = content_fingerprint_value,
    published_revision_id = existing_revision.revision_id,
    duration_ms = elapsed, audit_metadata = source_metadata_value, updated_at = now()
  where run_id = run_row.run_id;
  update scoring_authority.guide_sync_runs set
    status = 'STALE', completed_at = now(),
    failure_category = 'SUPERSEDED_BY_NEWER_PUBLICATION',
    failure_safe = 'A newer valid Guide publication superseded this work.',
    duration_ms = round(extract(epoch from (clock_timestamp() - started_at)) * 1000, 3),
    updated_at = now()
  where tournament_id = target_tournament
    and status = 'CLAIMED'
    and attempt_sequence < run_row.attempt_sequence;
  insert into scoring_authority.audit_events (tournament_id, action, actor_id, metadata)
  values (target_tournament, 'GUIDE_PROJECTION_PUBLISHED', run_row.actor_id,
    jsonb_build_object('attemptSequence', run_row.attempt_sequence,
      'triggerType', run_row.trigger_type, 'contentFingerprint', content_fingerprint_value,
      'sourceWorkbookFingerprint', source_fingerprint_value,
      'projectionRevision', existing_revision.projection_revision,
      'publicationSequence', next_publication, 'reusedRevision', reused_revision));
  return jsonb_build_object('ok', true, 'changed', true, 'no_op', false,
    'reused_revision', reused_revision, 'projection_revision', existing_revision.projection_revision,
    'publication_sequence', next_publication, 'revision_id', existing_revision.revision_id,
    'content_fingerprint', existing_revision.content_fingerprint);
exception when invalid_text_representation then
  return jsonb_build_object('ok', false, 'code', 'VALIDATED_GUIDE_PROJECTION_REQUIRED');
end;
$$;

create or replace function public.mark_preview_guide_sync_failed(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = scoring_authority, public, extensions, pg_temp
as $$
declare
  target_tournament constant text := '2026';
  target_project constant text := 'idgigvjjqkfbqjeredpb';
  production_workbook constant text := '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4';
  source_workbook text := btrim(coalesce(input->>'source_workbook_id', ''));
  token_text text := btrim(coalesce(input->>'claim_token', ''));
  token uuid;
  run_row scoring_authority.guide_sync_runs%rowtype;
  newest_published_sequence bigint;
  validation_value text := upper(btrim(coalesce(input->>'validation_status', 'NOT_RUN')));
  failure_category_value text := left(upper(btrim(coalesce(input->>'failure_category', 'GUIDE_SYNC_FAILED'))), 120);
  failure_safe_value text := left(btrim(coalesce(input->>'failure_safe', 'Guide synchronization did not complete.')), 400);
  source_fingerprint_value text := lower(btrim(coalesce(input->>'source_workbook_fingerprint', '')));
  changed_value boolean;
begin
  if upper(btrim(coalesce(input->>'environment', ''))) <> 'PREVIEW'
     or btrim(coalesce(input->>'project_ref', '')) <> target_project
     or btrim(coalesce(input->>'tournament_id', '')) <> target_tournament
     or coalesce((input->>'tournament_year')::integer, 0) <> 2026
     or source_workbook = '' or source_workbook = production_workbook
     or token_text !~ '^[0-9a-fA-F-]{36}$'
     or validation_value not in ('NOT_RUN', 'INVALID')
     or failure_category_value = '' then
    return jsonb_build_object('ok', false, 'code', 'PREVIEW_GUIDE_SYNC_FAILURE_INVALID');
  end if;
  token := token_text::uuid;
  select * into run_row from scoring_authority.guide_sync_runs r
  where r.tournament_id = target_tournament and r.claim_token = token for update;
  if not found or run_row.status <> 'CLAIMED'
     or run_row.project_ref <> target_project or run_row.source_workbook_id <> source_workbook then
    return jsonb_build_object('ok', false, 'code', 'STALE_GUIDE_SYNC', 'superseded', true);
  end if;
  select c.newest_published_sequence into newest_published_sequence
  from scoring_authority.guide_sync_controls c
  where c.tournament_id = target_tournament for update;
  if source_fingerprint_value !~ '^[0-9a-f]{64}$' then source_fingerprint_value := null; end if;
  changed_value := case when input ? 'changed' then (input->>'changed')::boolean else null end;
  update scoring_authority.guide_sync_runs set
    status = case when run_row.attempt_sequence < newest_published_sequence then 'STALE'
      when validation_value = 'INVALID' then 'REJECTED' else 'FAILED' end,
    completed_at = now(), validation_status = validation_value,
    source_workbook_fingerprint = source_fingerprint_value,
    changed = changed_value, failure_category = failure_category_value,
    failure_safe = failure_safe_value,
    duration_ms = round(extract(epoch from (clock_timestamp() - started_at)) * 1000, 3),
    audit_metadata = case when jsonb_typeof(input->'audit_metadata') = 'object'
      then input->'audit_metadata' else '{}'::jsonb end,
    updated_at = now()
  where run_id = run_row.run_id;
  update scoring_authority.guide_sync_controls set
    newest_completed_sequence = greatest(newest_completed_sequence, run_row.attempt_sequence),
    updated_at = now()
  where tournament_id = target_tournament;
  insert into scoring_authority.audit_events (tournament_id, action, actor_id, metadata)
  values (target_tournament,
    case when validation_value = 'INVALID' then 'GUIDE_SYNC_VALIDATION_REJECTED' else 'GUIDE_SYNC_FAILED' end,
    run_row.actor_id,
    jsonb_build_object('attemptSequence', run_row.attempt_sequence,
      'triggerType', run_row.trigger_type, 'failureCategory', failure_category_value,
      'validationStatus', validation_value,
      'superseded', run_row.attempt_sequence < newest_published_sequence));
  return jsonb_build_object('ok', true, 'recorded', true,
    'last_known_good_preserved', true,
    'superseded', run_row.attempt_sequence < newest_published_sequence);
exception when invalid_text_representation then
  return jsonb_build_object('ok', false, 'code', 'PREVIEW_GUIDE_SYNC_FAILURE_INVALID');
end;
$$;

-- One private canonical course-context builder serves both the import-time source
-- adapter and the published participant read.  This keeps Course ID + tee
-- deduplication and scoring-snapshot ownership identical across both paths.
create or replace function scoring_authority.build_guide_course_context(
  target_tournament text
)
returns jsonb
language plpgsql
security definer
stable
set search_path = scoring_authority, public, extensions, pg_temp
as $$
declare
  course_context_value jsonb;
begin
  if btrim(coalesce(target_tournament, '')) <> '2026' then return '[]'::jsonb; end if;
  with raw_context as (
    select m.match_id, m.round_number, m.format, m.match_revision,
      ss.snapshot_id, ss.snapshot_revision, ss.course_id, ss.tee,
      ss.rating, ss.slope, ss.par, ss.canonical_hash,
      ss.tournament_id as snapshot_tournament_id,
      ss.match_id as snapshot_match_id,
      ss.format as snapshot_format,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'hole_number', mh.hole_number,
          'par', mh.par,
          'stroke_index', mh.stroke_index,
          'yardage', mh.yardage
        ) order by mh.hole_number)
        from scoring_authority.match_holes mh
        where mh.match_id = m.match_id and mh.snapshot_id = ss.snapshot_id
      ), '[]'::jsonb) as holes
    from scoring_authority.matches m
    join scoring_authority.scoring_snapshots ss on ss.snapshot_id = m.scoring_snapshot_id
    where m.tournament_id = target_tournament
  ), validated_context as (
    select raw_context.*,
      raw_context.snapshot_tournament_id = target_tournament
      and raw_context.snapshot_match_id = raw_context.match_id
      and raw_context.snapshot_format = raw_context.format
      and exists (
        select 1 from scoring_authority.rounds canonical_round
        where canonical_round.tournament_id = target_tournament
          and canonical_round.round_number = raw_context.round_number
          and canonical_round.format = raw_context.format
      )
      and btrim(raw_context.course_id) <> ''
      and btrim(raw_context.tee) <> ''
      and raw_context.rating is not null
      and raw_context.slope is not null and raw_context.slope > 0
      and jsonb_array_length(raw_context.holes) = 18
      and not exists (
        select 1 from generate_series(1, 18) expected(hole_number)
        where not exists (
          select 1 from jsonb_array_elements(raw_context.holes) hole
          where (hole->>'hole_number')::integer = expected.hole_number
        )
      )
      and not exists (
        select 1 from generate_series(1, 18) expected(stroke_index)
        where not exists (
          select 1 from jsonb_array_elements(raw_context.holes) hole
          where (hole->>'stroke_index')::integer = expected.stroke_index
        )
      )
      and raw_context.par = coalesce((
        select sum((hole->>'par')::integer)
        from jsonb_array_elements(raw_context.holes) hole
      ), 0) as context_valid
    from raw_context
  ), ranked_context as (
    select validated_context.*,
      row_number() over (
        partition by upper(btrim(validated_context.course_id)), upper(btrim(validated_context.tee))
        order by validated_context.snapshot_revision desc,
          validated_context.match_id
      ) as context_rank
    from validated_context
  ), selected_context as (
    select * from ranked_context where context_rank = 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'course_id', selected.course_id,
    'tee', selected.tee,
    'rating', selected.rating,
    'slope', selected.slope,
    'par', selected.par,
    'scoring_snapshot_id', selected.snapshot_id,
    'scoring_snapshot_fingerprint', selected.canonical_hash,
    'configuration_fingerprint', encode(extensions.digest(jsonb_build_object(
      'course_id', selected.course_id,
      'tee', selected.tee,
      'rating', selected.rating,
      'slope', selected.slope,
      'par', selected.par,
      'holes', selected.holes
    )::text, 'sha256'), 'hex'),
    'configuration_consistent', selected.context_valid and not exists (
      select 1 from ranked_context compared
      where upper(btrim(compared.course_id)) = upper(btrim(selected.course_id))
        and upper(btrim(compared.tee)) = upper(btrim(selected.tee))
        and (
          not compared.context_valid
          or compared.rating is distinct from selected.rating
          or compared.slope is distinct from selected.slope
          or compared.par is distinct from selected.par
          or compared.holes is distinct from selected.holes
        )
    ),
    'rounds', coalesce((
      select jsonb_agg(jsonb_build_object(
        'round_number', assignment.round_number,
        'format', assignment.format,
        'name', assignment.name,
        'status', assignment.status
      ) order by assignment.round_number, assignment.format)
      from (
        select distinct compared.round_number, compared.format, r.name, r.status
        from ranked_context compared
        join scoring_authority.rounds r
          on r.tournament_id = target_tournament and r.round_number = compared.round_number
          and r.format = compared.format
        where upper(btrim(compared.course_id)) = upper(btrim(selected.course_id))
          and upper(btrim(compared.tee)) = upper(btrim(selected.tee))
      ) assignment
    ), '[]'::jsonb),
    'holes', selected.holes
  ) order by selected.course_id, selected.tee), '[]'::jsonb)
  into course_context_value
  from selected_context selected;
  return course_context_value;
end;
$$;

create or replace function scoring_authority.guide_course_context_is_eligible(
  course_context jsonb
)
returns boolean
language sql
immutable
set search_path = scoring_authority, public, extensions, pg_temp
as $$
  select case
    when coalesce(jsonb_typeof(course_context), '') <> 'array' then false
    when jsonb_array_length(course_context) = 0 then false
    else not exists (
      select 1
      from jsonb_array_elements(course_context) context
      where coalesce((context->>'configuration_consistent')::boolean, false) is not true
        or btrim(coalesce(context->>'course_id', '')) = ''
        or btrim(coalesce(context->>'tee', '')) = ''
        or coalesce(jsonb_typeof(context->'rounds'), '') <> 'array'
        or jsonb_array_length(context->'rounds') = 0
        or coalesce(jsonb_typeof(context->'holes'), '') <> 'array'
        or jsonb_array_length(context->'holes') <> 18
        or exists (
          select 1 from generate_series(1, 18) expected(hole_number)
          where not exists (
            select 1 from jsonb_array_elements(context->'holes') hole
            where (hole->>'hole_number')::integer = expected.hole_number
          )
        )
        or exists (
          select 1 from generate_series(1, 18) expected(stroke_index)
          where not exists (
            select 1 from jsonb_array_elements(context->'holes') hole
            where (hole->>'stroke_index')::integer = expected.stroke_index
          )
        )
    )
  end;
$$;

-- Service-only source context for the first import and subsequent Google CMS
-- validations.  It deliberately does not require a published Guide revision.
create or replace function public.read_preview_guide_source_context(input jsonb)
returns jsonb
language plpgsql
security definer
stable
set search_path = scoring_authority, public, extensions, pg_temp
as $$
declare
  started_at timestamptz := clock_timestamp();
  production_workbook constant text := '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4';
  target_tournament text := btrim(coalesce(input->>'tournament_id', ''));
  source_workbook text := btrim(coalesce(input->>'source_workbook_id', ''));
  tournament_value jsonb;
  course_context_value jsonb;
begin
  if upper(btrim(coalesce(input->>'environment', ''))) <> 'PREVIEW'
     or btrim(coalesce(input->>'project_ref', '')) <> 'idgigvjjqkfbqjeredpb'
     or target_tournament <> '2026'
     or coalesce((input->>'tournament_year')::integer, 0) <> 2026
     or source_workbook = '' or source_workbook = production_workbook then
    return jsonb_build_object('ok', false, 'code', 'PREVIEW_GUIDE_SOURCE_CONTEXT_INVALID');
  end if;
  select jsonb_build_object(
    'tournament_id', t.tournament_id,
    'tournament_year', t.tournament_year,
    'name', t.name
  ) into tournament_value
  from scoring_authority.tournaments t
  where t.tournament_id = target_tournament and t.tournament_year = 2026
    and t.source_workbook_id = source_workbook;
  if tournament_value is null then
    return jsonb_build_object('ok', false, 'code', 'PREVIEW_GUIDE_SOURCE_MISMATCH');
  end if;
  course_context_value := scoring_authority.build_guide_course_context(target_tournament);
  if not scoring_authority.guide_course_context_is_eligible(course_context_value) then
    return jsonb_build_object('ok', false, 'code', 'GUIDE_CANONICAL_COURSE_CONTEXT_INVALID');
  end if;
  return jsonb_build_object('ok', true, 'data', jsonb_build_object(
    'tournament', tournament_value,
    'course_context', course_context_value,
    'query_ms', round(extract(epoch from (clock_timestamp() - started_at)) * 1000, 3)
  ));
exception when invalid_text_representation then
  return jsonb_build_object('ok', false, 'code', 'PREVIEW_GUIDE_SOURCE_CONTEXT_INVALID');
end;
$$;

-- Participant-safe server read.  Execution is service-only; the application may
-- expose the returned published payload through its participant-safe endpoint.
-- Course scoring context is read directly from canonical scoring snapshots and
-- match_holes, deduplicated by stable Course ID + tee.
create or replace function public.read_current_guide_projection(
  target_tournament_id text,
  target_source_workbook_id text
)
returns jsonb
language plpgsql
security definer
stable
set search_path = scoring_authority, public, extensions, pg_temp
as $$
declare
  started_at timestamptz := clock_timestamp();
  production_workbook constant text := '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4';
  target_tournament text := btrim(coalesce(target_tournament_id, ''));
  source_workbook text := btrim(coalesce(target_source_workbook_id, ''));
  tournament_value jsonb;
  revision_value scoring_authority.guide_content_revisions%rowtype;
  pointer_value scoring_authority.guide_projection_current%rowtype;
  course_context_value jsonb;
  course_context_fingerprint_value text;
  delivery_fingerprint_value text;
begin
  if target_tournament <> '2026' or source_workbook = ''
     or source_workbook = production_workbook then
    return jsonb_build_object('ok', false, 'code', 'APPROVED_2026_GUIDE_CONTEXT_REQUIRED');
  end if;
  select jsonb_build_object(
    'tournament_id', t.tournament_id,
    'tournament_year', t.tournament_year,
    'name', t.name
  ) into tournament_value
  from scoring_authority.tournaments t
  where t.tournament_id = target_tournament and t.tournament_year = 2026
    and t.source_workbook_id = source_workbook;
  if tournament_value is null then
    return jsonb_build_object('ok', false, 'code', 'PREVIEW_GUIDE_SOURCE_MISMATCH');
  end if;
  select * into pointer_value from scoring_authority.guide_projection_current p
  where p.tournament_id = target_tournament
    and p.source_workbook_id = source_workbook;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'GUIDE_PROJECTION_NOT_PUBLISHED');
  end if;
  select * into revision_value from scoring_authority.guide_content_revisions r
  where r.tournament_id = target_tournament
    and r.source_workbook_id = source_workbook
    and r.revision_id = pointer_value.revision_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'GUIDE_CURRENT_REVISION_INVALID');
  end if;

  course_context_value := scoring_authority.build_guide_course_context(target_tournament);
  if not scoring_authority.guide_course_context_is_eligible(course_context_value) then
    return jsonb_build_object('ok', false, 'code', 'GUIDE_CANONICAL_COURSE_CONTEXT_INVALID');
  end if;
  course_context_fingerprint_value := encode(
    extensions.digest(course_context_value::text, 'sha256'), 'hex'
  );
  delivery_fingerprint_value := encode(extensions.digest(
    revision_value.content_fingerprint || ':' || course_context_fingerprint_value,
    'sha256'
  ), 'hex');

  return jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object(
      'tournament', tournament_value,
      'projection_revision', revision_value.projection_revision,
      'publication_sequence', pointer_value.publication_sequence,
      'content_fingerprint', revision_value.content_fingerprint,
      'course_context_fingerprint', course_context_fingerprint_value,
      'delivery_fingerprint', delivery_fingerprint_value,
      'payload_hash', revision_value.payload_hash,
      'published_at', pointer_value.published_at,
      'last_verified_at', pointer_value.last_verified_at,
      'content', revision_value.content_payload,
      'course_context', course_context_value,
      'query_ms', round(extract(epoch from (clock_timestamp() - started_at)) * 1000, 3)
    )
  );
end;
$$;

create or replace function public.read_preview_guide_sync_status(input jsonb)
returns jsonb
language plpgsql
security definer
stable
set search_path = scoring_authority, public, extensions, pg_temp
as $$
declare
  target_tournament constant text := '2026';
  target_project constant text := 'idgigvjjqkfbqjeredpb';
  production_workbook constant text := '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4';
  source_workbook text := btrim(coalesce(input->>'source_workbook_id', ''));
  current_value jsonb;
  last_attempt_value jsonb;
  last_success_value jsonb;
begin
  if upper(btrim(coalesce(input->>'environment', ''))) <> 'PREVIEW'
     or btrim(coalesce(input->>'project_ref', '')) <> target_project
     or btrim(coalesce(input->>'tournament_id', '')) <> target_tournament
     or source_workbook = '' or source_workbook = production_workbook then
    return jsonb_build_object('ok', false, 'code', 'PREVIEW_GUIDE_STATUS_CONTEXT_INVALID');
  end if;
  if not exists (
    select 1 from scoring_authority.tournaments t
    where t.tournament_id = target_tournament and t.tournament_year = 2026
      and t.source_workbook_id = source_workbook
  ) then return jsonb_build_object('ok', false, 'code', 'PREVIEW_GUIDE_SOURCE_MISMATCH'); end if;

  select jsonb_build_object(
    'revision_id', r.revision_id,
    'projection_revision', r.projection_revision,
    'publication_sequence', p.publication_sequence,
    'content_fingerprint', r.content_fingerprint,
    'payload_hash', r.payload_hash,
    'published_at', p.published_at,
    'last_verified_at', p.last_verified_at
  ) into current_value
  from scoring_authority.guide_projection_current p
  join scoring_authority.guide_content_revisions r
    on r.tournament_id = p.tournament_id
    and r.source_workbook_id = p.source_workbook_id
    and r.revision_id = p.revision_id
  where p.tournament_id = target_tournament
    and p.source_workbook_id = source_workbook;

  select jsonb_build_object(
    'attempt_sequence', r.attempt_sequence,
    'trigger_type', r.trigger_type,
    'status', r.status,
    'started_at', r.started_at,
    'completed_at', r.completed_at,
    'changed', r.changed,
    'validation_status', r.validation_status,
    'source_workbook_fingerprint', r.source_workbook_fingerprint,
    'failure_category', r.failure_category
  ) into last_attempt_value
  from scoring_authority.guide_sync_runs r
  where r.tournament_id = target_tournament and r.source_workbook_id = source_workbook
  order by r.attempt_sequence desc limit 1;

  select jsonb_build_object(
    'attempt_sequence', r.attempt_sequence,
    'trigger_type', r.trigger_type,
    'status', r.status,
    'completed_at', r.completed_at,
    'changed', r.changed
  ) into last_success_value
  from scoring_authority.guide_sync_runs r
  where r.tournament_id = target_tournament
    and r.source_workbook_id = source_workbook
    and r.status in ('SUCCEEDED', 'NOOP')
  order by r.attempt_sequence desc limit 1;

  return jsonb_build_object(
    'ok', true,
    'tournament_id', target_tournament,
    'current', current_value,
    'last_attempt', last_attempt_value,
    'last_success', last_success_value,
    'state', case
      when current_value is null then 'UNPUBLISHED'
      when coalesce(last_attempt_value->>'status', '') in ('FAILED', 'REJECTED') then 'FAILED_REFRESH'
      when coalesce(last_attempt_value->>'status', '') = 'CLAIMED' then 'SYNCING'
      else 'CURRENT'
    end,
    'last_known_good_available', current_value is not null
  );
end;
$$;

revoke all on function scoring_authority.reject_guide_revision_mutation() from public, anon, authenticated;
revoke all on function scoring_authority.build_guide_course_context(text) from public, anon, authenticated, service_role;
revoke all on function scoring_authority.guide_course_context_is_eligible(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.claim_preview_guide_sync(jsonb) from public, anon, authenticated;
revoke all on function public.publish_preview_guide_projection(jsonb) from public, anon, authenticated;
revoke all on function public.mark_preview_guide_sync_failed(jsonb) from public, anon, authenticated;
revoke all on function public.read_preview_guide_source_context(jsonb) from public, anon, authenticated;
revoke all on function public.read_current_guide_projection(text, text) from public, anon, authenticated;
revoke all on function public.read_preview_guide_sync_status(jsonb) from public, anon, authenticated;
grant execute on function public.claim_preview_guide_sync(jsonb) to service_role;
grant execute on function public.publish_preview_guide_projection(jsonb) to service_role;
grant execute on function public.mark_preview_guide_sync_failed(jsonb) to service_role;
grant execute on function public.read_preview_guide_source_context(jsonb) to service_role;
grant execute on function public.read_current_guide_projection(text, text) to service_role;
grant execute on function public.read_preview_guide_sync_status(jsonb) to service_role;

notify pgrst, 'reload schema';
