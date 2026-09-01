-- Step 13E.8C: Supabase-native, annual Tournament Guide authoring V1.
--
-- Installation is inert. It creates no Guide draft or revision, advances no
-- current pointer or future binding, and does not relabel any Google-imported
-- evidence. Only an explicit, entitled Director operation can create state.
begin;

do $dependencies$
begin
  if pg_catalog.to_regprocedure(
       'production_control.assert_annual_future_admin_scope_v1(jsonb,text,boolean,boolean)'
     ) is null
     or pg_catalog.to_regprocedure(
       'production_control.prediction_settings_canonical_json_v1(jsonb)'
     ) is null
     or pg_catalog.to_regprocedure(
       'public.synchronize_production_director_projection(jsonb)'
     ) is null
     or pg_catalog.to_regprocedure(
       'public.synchronize_production_future_annual_projection_v1(jsonb)'
     ) is null
     or pg_catalog.to_regprocedure(
       'public.read_production_guide_projection(jsonb)'
     ) is null then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_GUIDE_AUTHORING_DEPENDENCY_REQUIRED';
  end if;
end;
$dependencies$;

-- 080 and 081 deliberately allowed only their two Supabase-native domains.
-- Extend that conditional allowlist to Guide without changing any row.
alter table production_control.future_annual_projection_bindings_v1
  drop constraint future_annual_projection_authoring_domain_v1;
alter table production_control.future_annual_projection_bindings_v1
  add constraint future_annual_projection_authoring_domain_v1 check (
    authoring_authority = 'GOOGLE_IMPORT'
    or domain in ('PREDICTION_SETTINGS', 'DRAFT', 'GUIDE')
  );

create table production_control.guide_authoring_drafts_v1 (
  draft_id uuid primary key default extensions.gen_random_uuid(),
  tournament_id text not null references scoring_authority.tournaments(
    tournament_id
  ) on delete restrict,
  tournament_year integer not null check (tournament_year between 2000 and 2200),
  draft_version bigint not null check (draft_version > 0),
  state text not null check (state in (
    'DRAFT', 'VALIDATED', 'PUBLISHED', 'SUPERSEDED', 'DISCARDED'
  )),
  authoring_kind text not null check (authoring_kind in (
    'DIRECTOR_EDIT', 'COPIED_PREVIOUS'
  )),
  expected_published_revision bigint not null check (
    expected_published_revision >= 0
  ),
  expected_published_revision_id uuid,
  source_tournament_id text references scoring_authority.tournaments(
    tournament_id
  ) on delete restrict,
  source_tournament_year integer,
  source_revision bigint,
  source_revision_id uuid,
  authoring_content jsonb not null check (
    pg_catalog.jsonb_typeof(authoring_content) = 'object'
  ),
  projection_payload jsonb not null check (
    pg_catalog.jsonb_typeof(projection_payload) = 'object'
  ),
  authoring_content_fingerprint text not null check (
    authoring_content_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  content_fingerprint text not null check (
    content_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  projection_payload_hash text not null check (
    projection_payload_hash ~ '^[0-9a-f]{64}$'
  ),
  canonical_reference_fingerprint text not null check (
    canonical_reference_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  validated_content_fingerprint text check (
    validated_content_fingerprint is null
    or validated_content_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  validated_canonical_reference_fingerprint text check (
    validated_canonical_reference_fingerprint is null
    or validated_canonical_reference_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  validation_diagnostics jsonb not null check (
    pg_catalog.jsonb_typeof(validation_diagnostics) = 'object'
  ),
  reason text not null check (
    pg_catalog.btrim(reason) <> '' and pg_catalog.length(reason) <= 500
  ),
  created_by_player_id text not null references scoring_authority.players(
    player_id
  ) on delete restrict,
  created_by_auth_user_id uuid not null references auth.users(id)
    on delete restrict,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  validated_at timestamptz,
  published_revision_id uuid,
  published_at timestamptz,
  discarded_at timestamptz,
  check (tournament_id = tournament_year::text),
  check ((state = 'PUBLISHED' and published_revision_id is not null
      and published_at is not null)
    or (state <> 'PUBLISHED' and published_revision_id is null
      and published_at is null)),
  check ((state = 'DISCARDED' and discarded_at is not null)
    or (state <> 'DISCARDED' and discarded_at is null)),
  check ((state in ('VALIDATED','PUBLISHED')
      and validated_content_fingerprint is not null
      and validated_canonical_reference_fingerprint is not null)
    or (state not in ('VALIDATED','PUBLISHED')
      and validated_content_fingerprint is null
      and validated_canonical_reference_fingerprint is null))
);

create unique index production_guide_authoring_open_draft_v1
  on production_control.guide_authoring_drafts_v1(tournament_id)
  where state in ('DRAFT', 'VALIDATED');

create table production_control.guide_authoring_revisions_v1 (
  revision_id uuid primary key default extensions.gen_random_uuid(),
  tournament_id text not null references scoring_authority.tournaments(
    tournament_id
  ) on delete restrict,
  tournament_year integer not null check (tournament_year between 2000 and 2200),
  revision_number bigint not null check (revision_number > 0),
  previous_published_revision bigint not null check (
    previous_published_revision >= 0
  ),
  previous_published_revision_id uuid,
  previous_native_revision_id uuid references
    production_control.guide_authoring_revisions_v1(revision_id)
    on delete restrict,
  draft_id uuid not null unique references
    production_control.guide_authoring_drafts_v1(draft_id) on delete restrict,
  authoring_content jsonb not null check (
    pg_catalog.jsonb_typeof(authoring_content) = 'object'
  ),
  projection_payload jsonb not null check (
    pg_catalog.jsonb_typeof(projection_payload) = 'object'
  ),
  authoring_content_fingerprint text not null check (
    authoring_content_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  content_fingerprint text not null check (
    content_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  projection_payload_hash text not null check (
    projection_payload_hash ~ '^[0-9a-f]{64}$'
  ),
  validation_diagnostics jsonb not null check (
    pg_catalog.jsonb_typeof(validation_diagnostics) = 'object'
  ),
  production_projection_revision_id uuid references
    production_control.projection_revisions(revision_id) on delete restrict,
  guide_content_revision_id uuid references
    scoring_authority.guide_content_revisions(revision_id) on delete restrict,
  annual_binding_revision bigint,
  published_by_player_id text not null references scoring_authority.players(
    player_id
  ) on delete restrict,
  published_by_auth_user_id uuid not null references auth.users(id)
    on delete restrict,
  published_at timestamptz not null default pg_catalog.clock_timestamp(),
  unique (tournament_id, revision_number),
  check (tournament_id = tournament_year::text),
  check ((tournament_year = 2026
      and production_projection_revision_id is not null
      and guide_content_revision_id is not null
      and annual_binding_revision is null)
    or (tournament_year <> 2026
      and production_projection_revision_id is null
      and guide_content_revision_id is null
      and annual_binding_revision is not null))
);

alter table production_control.guide_authoring_drafts_v1
  add constraint guide_authoring_drafts_published_revision_v1
  foreign key (published_revision_id)
  references production_control.guide_authoring_revisions_v1(revision_id)
  on delete restrict;

create table production_control.guide_authoring_current_v1 (
  tournament_id text primary key references scoring_authority.tournaments(
    tournament_id
  ) on delete restrict,
  tournament_year integer not null check (tournament_year between 2000 and 2200),
  revision_id uuid not null unique references
    production_control.guide_authoring_revisions_v1(revision_id)
    on delete restrict,
  revision_number bigint not null check (revision_number > 0),
  advanced_by_player_id text not null references scoring_authority.players(
    player_id
  ) on delete restrict,
  advanced_by_auth_user_id uuid not null references auth.users(id)
    on delete restrict,
  advanced_at timestamptz not null default pg_catalog.clock_timestamp(),
  check (tournament_id = tournament_year::text)
);

create table production_control.guide_authoring_revision_provenance_v1 (
  revision_id uuid primary key references
    production_control.guide_authoring_revisions_v1(revision_id)
    on delete restrict,
  tournament_id text not null references scoring_authority.tournaments(
    tournament_id
  ) on delete restrict,
  authoring_authority text not null check (
    authoring_authority = 'SUPABASE_DIRECTOR'
  ),
  authoring_contract text not null check (
    authoring_contract = 'production-guide-authoring-v1'
  ),
  draft_id uuid not null unique references
    production_control.guide_authoring_drafts_v1(draft_id) on delete restrict,
  actor_player_id text not null references scoring_authority.players(player_id)
    on delete restrict,
  actor_auth_user_id uuid not null references auth.users(id) on delete restrict,
  authoring_kind text not null check (authoring_kind in (
    'DIRECTOR_EDIT', 'COPIED_PREVIOUS'
  )),
  source_tournament_id text,
  created_at timestamptz not null default pg_catalog.clock_timestamp()
);

create table production_control.guide_authoring_operation_receipts_v1 (
  receipt_id uuid not null default extensions.gen_random_uuid() unique,
  tournament_id text not null references scoring_authority.tournaments(
    tournament_id
  ) on delete restrict,
  operation text not null check (operation in (
    'CREATE', 'UPDATE', 'VALIDATE', 'PUBLISH', 'DISCARD', 'COPY_PREVIOUS'
  )),
  operation_request_id uuid not null,
  declared_request_payload_hash text not null check (
    declared_request_payload_hash ~ '^[0-9a-f]{64}$'
  ),
  request_payload_hash text not null check (
    request_payload_hash ~ '^[0-9a-f]{64}$'
  ),
  actor_player_id text not null references scoring_authority.players(player_id)
    on delete restrict,
  actor_auth_user_id uuid not null references auth.users(id) on delete restrict,
  response jsonb not null check (pg_catalog.jsonb_typeof(response) = 'object'),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (tournament_id, operation, operation_request_id)
);

-- Normal Director audit is intentionally content-free: no contact values,
-- full payloads, canonical hashes, request IDs, or SQL/RPC terminology.
create table production_control.guide_authoring_audit_events_v1 (
  event_id uuid primary key default extensions.gen_random_uuid(),
  tournament_id text not null references scoring_authority.tournaments(
    tournament_id
  ) on delete restrict,
  draft_id uuid references production_control.guide_authoring_drafts_v1(
    draft_id
  ) on delete restrict,
  revision_id uuid references production_control.guide_authoring_revisions_v1(
    revision_id
  ) on delete restrict,
  action text not null check (action in (
    'DRAFT_CREATED', 'DRAFT_UPDATED', 'VALIDATION_COMPLETED',
    'REVISION_PUBLISHED', 'DRAFT_DISCARDED', 'PREVIOUS_GUIDE_COPIED'
  )),
  actor_player_id text not null references scoring_authority.players(player_id)
    on delete restrict,
  actor_auth_user_id uuid not null references auth.users(id) on delete restrict,
  summary jsonb not null check (pg_catalog.jsonb_typeof(summary) = 'object'),
  created_at timestamptz not null default pg_catalog.clock_timestamp()
);

alter table production_control.guide_authoring_drafts_v1 enable row level security;
alter table production_control.guide_authoring_revisions_v1 enable row level security;
alter table production_control.guide_authoring_current_v1 enable row level security;
alter table production_control.guide_authoring_revision_provenance_v1 enable row level security;
alter table production_control.guide_authoring_operation_receipts_v1 enable row level security;
alter table production_control.guide_authoring_audit_events_v1 enable row level security;

revoke all on table
  production_control.guide_authoring_drafts_v1,
  production_control.guide_authoring_revisions_v1,
  production_control.guide_authoring_current_v1,
  production_control.guide_authoring_revision_provenance_v1,
  production_control.guide_authoring_operation_receipts_v1,
  production_control.guide_authoring_audit_events_v1
from public, anon, authenticated, service_role;

create function production_control.reject_guide_authoring_immutable_v1()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin
  raise exception using errcode = '55000',
    message = 'PRODUCTION_GUIDE_AUTHORING_IMMUTABLE_RECORD';
end;
$$;

create trigger production_guide_revision_immutable_v1
before update or delete on production_control.guide_authoring_revisions_v1
for each row execute function
  production_control.reject_guide_authoring_immutable_v1();
create trigger production_guide_provenance_immutable_v1
before update or delete on
  production_control.guide_authoring_revision_provenance_v1
for each row execute function
  production_control.reject_guide_authoring_immutable_v1();
create trigger production_guide_receipt_immutable_v1
before update or delete on
  production_control.guide_authoring_operation_receipts_v1
for each row execute function
  production_control.reject_guide_authoring_immutable_v1();
create trigger production_guide_audit_immutable_v1
before update or delete on production_control.guide_authoring_audit_events_v1
for each row execute function
  production_control.reject_guide_authoring_immutable_v1();

create function production_control.guide_authoring_source_tabs_v1()
returns jsonb language sql immutable set search_path = pg_catalog as $$
  select '["Tournaments","Guide Sections","Tournament Itinerary","Tournament Timeline","Rule Book","Tournament Rules","Rounds","Dining","Local Guide","Important Contacts","Courses"]'::jsonb
$$;

create function production_control.guide_authoring_canonical_json_v1(
  value jsonb
)
returns text language sql immutable strict set search_path = pg_catalog as $$
  select production_control.prediction_settings_canonical_json_v1(value)
$$;

create function production_control.guide_authoring_hash_v1(value jsonb)
returns text language sql immutable strict
set search_path = pg_catalog, extensions as $$
  select pg_catalog.encode(extensions.digest(
    production_control.guide_authoring_canonical_json_v1(value), 'sha256'
  ), 'hex')
$$;

create function production_control.guide_date_valid_v1(
  value text,
  required_year integer
)
returns boolean
language plpgsql
immutable
strict
set search_path = pg_catalog
as $guide_date_valid$
declare
  parts text[];
  parsed_year integer;
  parsed_month integer;
  parsed_day integer;
begin
  if pg_catalog.btrim(value) = '' then return true; end if;
  parts := pg_catalog.regexp_match(pg_catalog.btrim(value),
    '^([0-9]{4})-([0-9]{1,2})-([0-9]{1,2})$');
  if parts is not null then
    parsed_year := parts[1]::integer;
    parsed_month := parts[2]::integer;
    parsed_day := parts[3]::integer;
  else
    parts := pg_catalog.regexp_match(pg_catalog.btrim(value),
      '^([0-9]{1,2})/([0-9]{1,2})/([0-9]{4})$');
    if parts is not null then
      parsed_month := parts[1]::integer;
      parsed_day := parts[2]::integer;
      parsed_year := parts[3]::integer;
    else
      -- Preserve the certified Google Date(year,zeroBasedMonth,day) parser.
      parts := pg_catalog.regexp_match(pg_catalog.btrim(value),
        '^Date\(([0-9]{4}),([0-9]{1,2}),([0-9]{1,2})\)$');
      if parts is null then return false; end if;
      parsed_year := parts[1]::integer;
      parsed_month := parts[2]::integer + 1;
      parsed_day := parts[3]::integer;
    end if;
  end if;
  perform pg_catalog.make_date(parsed_year, parsed_month, parsed_day);
  return parsed_year = required_year;
exception when datetime_field_overflow or invalid_datetime_format then
  return false;
end;
$guide_date_valid$;

create function production_control.guide_time_valid_v1(value text)
returns boolean
language sql
immutable
strict
set search_path = pg_catalog
as $guide_time_valid$
  select pg_catalog.btrim(value) = ''
    or pg_catalog.btrim(value) ~
      '^(?:[01]?[0-9]|2[0-3]):[0-5][0-9]$'
    or pg_catalog.btrim(value) ~*
      '^(?:0?[1-9]|1[0-2]):[0-5][0-9][[:space:]]*(?:AM|PM)$'
$guide_time_valid$;

create function production_control.guide_url_valid_v1(
  value text,
  asset_value boolean default false
)
returns boolean
language sql
immutable
strict
set search_path = pg_catalog
as $guide_url_valid$
  select pg_catalog.btrim(value) = '' or (
    pg_catalog.btrim(value) !~* '^(javascript|vbscript|data|file)[[:space:]]*:'
    and (
      pg_catalog.btrim(value) ~* '^https?://[^[:space:]]+$'
      or pg_catalog.btrim(value) ~*
        '^[A-Za-z0-9][A-Za-z0-9.-]*\.[A-Za-z]{2,}(?:/[^[:space:]]*)?$'
      or (asset_value
        and pg_catalog.btrim(value) ~
          '^[A-Za-z0-9][A-Za-z0-9._/-]*$'
        and pg_catalog.btrim(value) !~ '(^|/)\.\.(/|$)'
        and pg_catalog.btrim(value) !~ '\\'
        and pg_catalog.btrim(value) !~* '%(?:2e|2f|5c)')
    )
  )
$guide_url_valid$;

create function production_control.assert_guide_authoring_v1(input jsonb)
returns text
language plpgsql
security definer
set search_path = pg_catalog
as $guide_authoring_scope$
declare
  pointer production_control.current_tournament_pointer_v1%rowtype;
  target text := pg_catalog.btrim(coalesce(
    input->>'target_tournament_id', ''));
  target_year integer;
begin
  perform production_control.assert_annual_future_admin_scope_v1(
    input, 'production-guide-authoring-v1', true, false
  );
  begin
    target_year := (input->>'target_tournament_year')::integer;
  exception when others then
    raise exception using errcode = '22023',
      message = 'GUIDE_TOURNAMENT_REQUIRED';
  end;
  select value.* into strict pointer
  from production_control.current_tournament_pointer_v1 value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  if target !~ '^20[0-9]{2}$' or target <> target_year::text then
    raise exception using errcode = '22023',
      message = 'GUIDE_TOURNAMENT_REQUIRED';
  end if;
  if target = pointer.tournament_id then
    if target_year <> pointer.tournament_year or not exists (
      select 1 from production_control.future_tournament_catalog_v1 value
      where value.tournament_id = target
        and value.tournament_year = target_year
        and value.lifecycle = 'ACTIVE'
        and value.lifecycle_revision = pointer.lifecycle_revision
    ) then
      raise exception using errcode = '55000',
        message = 'GUIDE_CURRENT_TOURNAMENT_REQUIRED';
    end if;
  elsif not exists (
    select 1
    from production_control.future_tournament_catalog_v1 catalog
    join production_control.future_tournament_resources_v1 resource
      on resource.tournament_id = catalog.tournament_id
    where catalog.tournament_id = target
      and catalog.tournament_year = target_year
      and catalog.tournament_year > pointer.tournament_year
      and catalog.lifecycle in ('DRAFT','CONFIGURING','READY_FOR_ACTIVATION')
      and resource.project_ref = input->>'project_ref'
      and resource.project_url = input->>'project_url'
      and resource.project_ref !~* '(preview|staging|test)'
  ) then
    raise exception using errcode = '42501',
      message = 'GUIDE_FUTURE_TOURNAMENT_REQUIRED';
  end if;
  return target;
end;
$guide_authoring_scope$;

create function production_control.guide_current_publication_v1(target text)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $guide_current_publication$
declare
  native_revision production_control.guide_authoring_revisions_v1%rowtype;
  legacy_revision production_control.projection_revisions%rowtype;
  future_binding production_control.future_annual_projection_bindings_v1%rowtype;
begin
  select revision.* into native_revision
  from production_control.guide_authoring_current_v1 pointer
  join production_control.guide_authoring_revisions_v1 revision
    on revision.revision_id = pointer.revision_id
  where pointer.tournament_id = target;
  if native_revision.revision_id is not null then
    return pg_catalog.jsonb_build_object(
      'revision', native_revision.revision_number,
      'revisionId', native_revision.revision_id,
      'authoringAuthority', 'SUPABASE_DIRECTOR',
      'authoringContract', 'production-guide-authoring-v1',
      'authoringContent', native_revision.authoring_content,
      'projectionPayload', native_revision.projection_payload,
      'contentFingerprint', native_revision.content_fingerprint,
      'projectionPayloadHash', native_revision.projection_payload_hash,
      'publishedAt', native_revision.published_at
    );
  end if;
  if target = '2026' then
    select revision.* into legacy_revision
    from production_control.projection_current pointer
    join production_control.projection_revisions revision
      on revision.revision_id = pointer.revision_id
    where pointer.domain = 'GUIDE' and pointer.tournament_id = target;
    if legacy_revision.revision_id is not null then
      return pg_catalog.jsonb_build_object(
        'revision', legacy_revision.revision_number,
        'revisionId', legacy_revision.revision_id,
        'authoringAuthority', 'GOOGLE_SYNCHRONIZATION',
        'authoringContract', legacy_revision.contract_version,
        'authoringContent', legacy_revision.projection_payload->'content',
        'projectionPayload', legacy_revision.projection_payload,
        'contentFingerprint', production_control.guide_authoring_hash_v1(
          legacy_revision.projection_payload->'content'),
        'projectionPayloadHash', legacy_revision.payload_fingerprint,
        'publishedAt', legacy_revision.imported_at
      );
    end if;
  else
    select value.* into future_binding
    from production_control.future_annual_projection_bindings_v1 value
    where value.tournament_id = target and value.domain = 'GUIDE'
      and value.certification_status = 'CERTIFIED';
    if future_binding.tournament_id is not null then
      return pg_catalog.jsonb_build_object(
        'revision', future_binding.source_revision,
        'revisionId', null,
        'authoringAuthority', future_binding.authoring_authority,
        'authoringContract', 'guide-projection-v1',
        'authoringContent', future_binding.projection->'content',
        'projectionPayload', future_binding.projection,
        'contentFingerprint', production_control.guide_authoring_hash_v1(
          future_binding.projection->'content'),
        'projectionPayloadHash', future_binding.payload_fingerprint,
        'publishedAt', future_binding.certified_at
      );
    end if;
  end if;
  return pg_catalog.jsonb_build_object(
    'revision', 0, 'revisionId', null,
    'authoringAuthority', null, 'authoringContent', null,
    'projectionPayload', null, 'publishedAt', null
  );
end;
$guide_current_publication$;

create function production_control.guide_operation_receipt_v1(
  target text,
  operation_value text,
  request_id uuid,
  declared_hash text,
  database_hash text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $guide_operation_receipt$
declare
  receipt production_control.guide_authoring_operation_receipts_v1%rowtype;
begin
  select value.* into receipt
  from production_control.guide_authoring_operation_receipts_v1 value
  where value.tournament_id = target
    and value.operation = operation_value
    and value.operation_request_id = request_id;
  if not found then return null; end if;
  if receipt.declared_request_payload_hash = declared_hash
     and receipt.request_payload_hash = database_hash then
    return receipt.response || pg_catalog.jsonb_build_object(
      'idempotent', true);
  end if;
  return pg_catalog.jsonb_build_object(
    'ok', false, 'code', 'GUIDE_IDEMPOTENCY_CONFLICT');
end;
$guide_operation_receipt$;

create function production_control.guide_canonical_rounds_v1(target text)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $guide_canonical_rounds$
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'roundId', value.round_number::text,
    'roundNumber', value.round_number,
    'format', value.format,
    'name', value.name,
    'status', value.status,
    'teamSize', detail.team_size,
    'pointsAvailable', detail.points_available,
    'displayOrder', detail.display_order,
    'courseId', assignment.course_id,
    'teeId', assignment.tee_id
  ) order by value.round_number), '[]'::jsonb)
  from scoring_authority.rounds value
  left join scoring_authority.tournament_setup_round_details_v1 detail
    on detail.tournament_id = value.tournament_id
   and detail.round_number = value.round_number
  left join scoring_authority.tournament_setup_round_courses_v1 assignment
    on assignment.tournament_id = value.tournament_id
   and assignment.round_number = value.round_number
  where value.tournament_id = target
$guide_canonical_rounds$;

create function production_control.guide_canonical_course_context_v1(
  target text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $guide_canonical_course_context$
declare
  result_value jsonb;
begin
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'course_id', grouped.course_id,
    'tee', grouped.tee_id,
    'rating', grouped.rating,
    'slope', grouped.slope,
    'par', grouped.par,
    'configuration_consistent', grouped.hole_count = 18
      and grouped.stroke_count = 18
      and grouped.hole_par = grouped.par,
    'rounds', grouped.rounds,
    'holes', grouped.holes
  ) order by grouped.course_id, grouped.tee_id), '[]'::jsonb)
  into result_value
  from (
    select tee.course_id, tee.tee_id, tee.rating, tee.slope, tee.par,
      pg_catalog.count(hole.hole_number)::integer hole_count,
      pg_catalog.count(distinct hole.stroke_index)::integer stroke_count,
      coalesce(pg_catalog.sum(hole.par), 0)::integer hole_par,
      coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'hole_number', hole.hole_number,
        'par', hole.par,
        'stroke_index', hole.stroke_index,
        'yardage', hole.yardage
      ) order by hole.hole_number) filter (where hole.hole_number is not null),
        '[]'::jsonb) holes,
      (select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'round_number', assignment.round_number,
        'format', round_value.format,
        'name', round_value.name,
        'status', round_value.status
      ) order by assignment.round_number), '[]'::jsonb)
       from scoring_authority.tournament_setup_round_courses_v1 assignment
       join scoring_authority.rounds round_value
         on round_value.tournament_id = assignment.tournament_id
        and round_value.round_number = assignment.round_number
       where assignment.tournament_id = tee.tournament_id
         and assignment.course_id = tee.course_id
         and assignment.tee_id = tee.tee_id) rounds
    from scoring_authority.tournament_setup_course_tees_v1 tee
    join scoring_authority.tournament_setup_round_courses_v1 assignment_check
      on assignment_check.tournament_id = tee.tournament_id
     and assignment_check.course_id = tee.course_id
     and assignment_check.tee_id = tee.tee_id
    left join scoring_authority.tournament_setup_course_holes_v1 hole
      on hole.tournament_id = tee.tournament_id
     and hole.course_id = tee.course_id
     and hole.tee_id = tee.tee_id
    where tee.tournament_id = target
    group by tee.tournament_id, tee.course_id, tee.tee_id,
      tee.rating, tee.slope, tee.par
  ) grouped;
  if pg_catalog.jsonb_array_length(result_value) = 0 and target = '2026' then
    return scoring_authority.build_guide_course_context(target);
  end if;
  return result_value;
end;
$guide_canonical_course_context$;

create function production_control.guide_canonical_reference_fingerprint_v1(
  target text
)
returns text
language sql
stable
security definer
set search_path = pg_catalog
as $guide_canonical_reference_fingerprint$
  select production_control.guide_authoring_hash_v1(
    pg_catalog.jsonb_build_object(
      'canonicalRounds',
        production_control.guide_canonical_rounds_v1(target),
      'canonicalCourseContext',
        production_control.guide_canonical_course_context_v1(target)
    ))
$guide_canonical_reference_fingerprint$;

create function production_control.guide_scalar_values_v1(value jsonb)
returns setof text
language plpgsql
immutable
strict
set search_path = pg_catalog
as $guide_scalar_values$
declare
  child jsonb;
begin
  if pg_catalog.jsonb_typeof(value) = 'object' then
    for child in select object_value
      from pg_catalog.jsonb_each(value) entry(object_key, object_value)
    loop
      return query select *
      from production_control.guide_scalar_values_v1(child);
    end loop;
  elsif pg_catalog.jsonb_typeof(value) = 'array' then
    for child in select array_value
      from pg_catalog.jsonb_array_elements(value) entry(array_value)
    loop
      return query select *
      from production_control.guide_scalar_values_v1(child);
    end loop;
  elsif pg_catalog.jsonb_typeof(value) = 'string' then
    return next value#>>'{}';
  end if;
  return;
end;
$guide_scalar_values$;

create function production_control.validate_guide_authoring_v1(
  target text,
  target_year integer,
  proposed_authoring jsonb,
  proposed_projection jsonb,
  declared_authoring_fingerprint text default null,
  declared_content_fingerprint text default null,
  declared_projection_hash text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $validate_guide_authoring$
declare
  issues jsonb := '[]'::jsonb;
  content_value jsonb;
  authoring_hash text;
  content_hash text;
  projection_hash text;
  domain_value record;
  item_value record;
  link_value record;
  date_value text;
  time_value text;
  round_text text;
  round_number_value integer;
  course_id_value text;
  status_value text;
begin
  if pg_catalog.jsonb_typeof(proposed_authoring) is distinct from 'object'
     or pg_catalog.jsonb_typeof(proposed_projection) is distinct from 'object'
     or proposed_projection->>'schemaVersion' is distinct from
       'guide-projection-v1'
     or pg_catalog.jsonb_typeof(proposed_projection->'content')
       is distinct from 'object' then
    return pg_catalog.jsonb_build_object(
      'pass', false,
      'issues', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'code', 'GUIDE_PROJECTION_SHAPE_INVALID',
        'message', 'The Guide projection shape is invalid.'))
    );
  end if;
  content_value := proposed_projection->'content';
  authoring_hash := production_control.guide_authoring_hash_v1(
    proposed_authoring);
  content_hash := production_control.guide_authoring_hash_v1(content_value);
  projection_hash := production_control.guide_authoring_hash_v1(
    proposed_projection);

  if pg_catalog.octet_length(proposed_authoring::text) > 1500000
     or pg_catalog.octet_length(proposed_projection::text) > 1500000 then
    issues := issues || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'GUIDE_CONTENT_TOO_LARGE',
        'message', 'The Guide exceeds the bounded authoring size.'));
  end if;
  if exists (select 1
    from production_control.guide_scalar_values_v1(proposed_authoring) value
    where pg_catalog.length(value) > 20000) then
    issues := issues || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'GUIDE_CONTENT_TOO_LARGE',
        'message', 'A Guide field exceeds the bounded text size.'));
  end if;
  if declared_authoring_fingerprint is not null
     and pg_catalog.lower(declared_authoring_fingerprint) <> authoring_hash then
    issues := issues || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'GUIDE_AUTHORING_FINGERPRINT_MISMATCH',
        'message', 'The Guide authoring fingerprint did not match.'));
  end if;
  if declared_content_fingerprint is not null
     and pg_catalog.lower(declared_content_fingerprint) <> content_hash then
    issues := issues || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'GUIDE_CONTENT_FINGERPRINT_MISMATCH',
        'message', 'The Guide content fingerprint did not match.'));
  end if;
  if declared_projection_hash is not null
     and pg_catalog.lower(declared_projection_hash) <> projection_hash then
    issues := issues || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'GUIDE_PROJECTION_FINGERPRINT_MISMATCH',
        'message', 'The Guide projection fingerprint did not match.'));
  end if;

  if exists (
    select 1 from pg_catalog.jsonb_object_keys(proposed_authoring) key_value
    where key_value not in (
      'tournament','overview','schedule','timelineRows','ruleBook',
      'tournamentRules','rounds','dining','localGuide',
      'importantContacts','courses'
    )
  ) or exists (
    select 1 from pg_catalog.jsonb_object_keys(content_value) key_value
    where key_value not in (
      'tournament','tournamentIdentity','overview','schedule','timelineRows',
      'courses','ruleBook','tournamentRules','rounds','dining','localGuide',
      'importantContacts','headers'
    )
  ) then
    issues := issues || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'GUIDE_DOMAIN_NOT_ALLOWLISTED',
        'message', 'Only the certified Tournament Guide domains are allowed.'));
  end if;

  if pg_catalog.jsonb_typeof(proposed_authoring->'tournament')
       is distinct from 'object'
     or content_value#>>'{tournamentIdentity,id}' is distinct from target
     or coalesce(content_value#>>'{tournamentIdentity,year}', '')
       is distinct from target_year::text then
    issues := issues || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'GUIDE_TOURNAMENT_SCOPE_MISMATCH',
        'message', 'Guide content must match the selected tournament and year.'));
  end if;

  for domain_value in
    select key_value, proposed_authoring->key_value value
    from pg_catalog.unnest(array[
      'overview','schedule','timelineRows','ruleBook','tournamentRules',
      'rounds','dining','localGuide','importantContacts','courses'
    ]) key_value
  loop
    if pg_catalog.jsonb_typeof(domain_value.value) is distinct from 'array' then
      issues := issues || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'code', 'GUIDE_DOMAIN_SHAPE_INVALID',
          'domain', domain_value.key_value,
          'message', 'A Guide collection was not an array.'));
    elsif pg_catalog.jsonb_array_length(domain_value.value) > 500 then
      issues := issues || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'code', 'GUIDE_COLLECTION_TOO_LARGE',
          'domain', domain_value.key_value,
          'message', 'A Guide collection exceeds 500 items.'));
    elsif exists (
      select 1 from pg_catalog.jsonb_array_elements(domain_value.value) item
      where pg_catalog.jsonb_typeof(item) <> 'object'
        or pg_catalog.btrim(coalesce(item->>'itemId', '')) = ''
        or pg_catalog.length(item->>'itemId') > 160
        or item->>'itemId' !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$'
    ) or exists (
      select 1
      from pg_catalog.jsonb_array_elements(domain_value.value) item
      group by pg_catalog.lower(pg_catalog.btrim(item->>'itemId'))
      having pg_catalog.count(*) > 1
    ) then
      issues := issues || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'code', 'GUIDE_STABLE_ITEM_ID_INVALID',
          'domain', domain_value.key_value,
          'message', 'Each Guide item needs a unique stable item ID.'));
    end if;
  end loop;

  -- Hidden authoring IDs must never cross the participant projection boundary.
  if proposed_projection::text ~ '"itemId"[[:space:]]*:' then
    issues := issues || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'GUIDE_INTERNAL_ID_PROJECTED',
        'message', 'Internal Guide item IDs are not participant content.'));
  end if;

  -- Explicit stable source IDs retain their certified duplicate semantics.
  for domain_value in
    select * from (values
      ('overview','Section ID'),
      ('schedule','Event ID'),
      ('ruleBook','Rule ID'),
      ('rounds','Format ID')
    ) pair(domain_key, identity_key)
  loop
    if exists (
      select 1
      from pg_catalog.jsonb_array_elements(
        proposed_authoring->domain_value.domain_key) item
      group by pg_catalog.lower(pg_catalog.btrim(
        item->>domain_value.identity_key))
      having pg_catalog.btrim(min(item->>domain_value.identity_key)) = ''
        or pg_catalog.count(*) > 1
    ) then
      issues := issues || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'code', 'GUIDE_STABLE_ID_DUPLICATE',
          'domain', domain_value.domain_key,
          'message', 'A certified Guide stable ID is missing or duplicated.'));
    end if;
  end loop;

  if exists (
    select 1 from pg_catalog.jsonb_array_elements(
      proposed_authoring->'overview') item
    group by pg_catalog.lower(pg_catalog.btrim(item->>'Section Slug'))
    having pg_catalog.btrim(min(item->>'Section Slug')) = ''
      or pg_catalog.count(*) > 1
  ) then
    issues := issues || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'GUIDE_SECTION_SLUG_DUPLICATE',
        'message', 'Guide section slugs must be present and unique.'));
  end if;

  -- Preserve the established composite duplicate keys alongside hidden IDs.
  if exists (select 1 from pg_catalog.jsonb_array_elements(
      proposed_authoring->'timelineRows') item
      group by pg_catalog.lower(pg_catalog.concat_ws(':', item->>'Event Date',
        item->>'Start Time', item->>'Title')) having pg_catalog.count(*) > 1)
    or exists (select 1 from pg_catalog.jsonb_array_elements(
      proposed_authoring->'tournamentRules') item
      group by pg_catalog.lower(pg_catalog.concat_ws(':', item->>'Round',
        item->>'Format')) having pg_catalog.count(*) > 1)
    or exists (select 1 from pg_catalog.jsonb_array_elements(
      proposed_authoring->'dining') item
      group by pg_catalog.lower(pg_catalog.concat_ws(':', item->>'Day',
        item->>'Meal')) having pg_catalog.count(*) > 1)
    or exists (select 1 from pg_catalog.jsonb_array_elements(
      proposed_authoring->'localGuide') item
      group by pg_catalog.lower(pg_catalog.concat_ws(':', item->>'Section',
        item->>'Title')) having pg_catalog.count(*) > 1)
    or exists (select 1 from pg_catalog.jsonb_array_elements(
      proposed_authoring->'importantContacts') item
      group by pg_catalog.lower(pg_catalog.concat_ws(':', item->>'Category',
        item->>'Name')) having pg_catalog.count(*) > 1)
    or exists (select 1 from pg_catalog.jsonb_array_elements(
      proposed_authoring->'courses') item
      group by pg_catalog.lower(pg_catalog.concat_ws(':', item->>'Course ID',
        item->>'Round')) having pg_catalog.count(*) > 1) then
    issues := issues || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'GUIDE_LOGICAL_KEY_DUPLICATE',
        'message', 'A Guide logical item key is duplicated.'));
  end if;

  -- Publication status exists only for Sections, Itinerary, and Rule Book.
  for item_value in
    select item from pg_catalog.jsonb_array_elements(
      proposed_authoring->'overview') item
    union all select item from pg_catalog.jsonb_array_elements(
      proposed_authoring->'schedule') item
    union all select item from pg_catalog.jsonb_array_elements(
      proposed_authoring->'ruleBook') item
  loop
    status_value := pg_catalog.upper(pg_catalog.btrim(coalesce(
      item_value.item->>'Status', '')));
    if status_value <> '' and status_value not in (
      'PUBLISHED','DRAFT','UNPUBLISHED','CANCELLED','ARCHIVED'
    ) then
      issues := issues || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'code', 'GUIDE_STATUS_INVALID',
          'message', 'An item uses an unsupported publication status.'));
    end if;
  end loop;

  for item_value in
    select item, 'Display Order' order_key from pg_catalog.jsonb_array_elements(
      proposed_authoring->'overview') item
    union all select item, 'Display Order' from pg_catalog.jsonb_array_elements(
      proposed_authoring->'schedule') item
    union all select item, 'Sort Order' from pg_catalog.jsonb_array_elements(
      proposed_authoring->'timelineRows') item
    union all select item, 'Display Order' from pg_catalog.jsonb_array_elements(
      proposed_authoring->'ruleBook') item
    union all select item, 'Sort Order' from pg_catalog.jsonb_array_elements(
      proposed_authoring->'dining') item
    union all select item, 'Sort Order' from pg_catalog.jsonb_array_elements(
      proposed_authoring->'localGuide') item
    union all select item, 'Sort Order' from pg_catalog.jsonb_array_elements(
      proposed_authoring->'importantContacts') item
  loop
    if pg_catalog.btrim(coalesce(item_value.item->>item_value.order_key, '')) = ''
       or item_value.item->>item_value.order_key !~ '^[0-9]+(?:\.[0-9]+)?$' then
      issues := issues || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'code', 'GUIDE_ORDER_INVALID',
          'message', 'Guide display and sort orders must be non-negative numbers.'));
    end if;
  end loop;

  -- All stored content is plain/safe presentation material. React escaping is
  -- defense in depth, not the authoring sanitizer.
  if proposed_authoring::text ~* '<[[:space:]]*/?[[:space:]]*(script|style|iframe|object|embed|svg)'
     or proposed_authoring::text ~* 'on[a-z]+[[:space:]]*='
     or proposed_authoring::text ~* '(javascript|vbscript)[[:space:]]*:'
     or proposed_authoring::text ~* 'data[[:space:]]*:[[:space:]]*text/html' then
    issues := issues || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'GUIDE_UNSAFE_CONTENT',
        'message', 'Unsafe markup or a script-capable URL was rejected.'));
  end if;

  for link_value in
    select 'Website' key_value, item->>'Website' value, false asset
      from pg_catalog.jsonb_array_elements(proposed_authoring->'localGuide') item
    union all select 'Website', item->>'Website', false
      from pg_catalog.jsonb_array_elements(proposed_authoring->'importantContacts') item
    union all select 'Website', item->>'Website', false
      from pg_catalog.jsonb_array_elements(proposed_authoring->'courses') item
    union all select 'GPS Link', item->>'GPS Link', false
      from pg_catalog.jsonb_array_elements(proposed_authoring->'courses') item
    union all select 'Course Logo', item->>'Course Logo', true
      from pg_catalog.jsonb_array_elements(proposed_authoring->'courses') item
    union all select 'Course Profile Image', item->>'Course Profile Image', true
      from pg_catalog.jsonb_array_elements(proposed_authoring->'courses') item
    union all select 'Annual Image', proposed_authoring#>>'{tournament,Annual Image}', true
    union all select 'Hero Image', proposed_authoring#>>'{tournament,Hero Image}', true
    union all select 'Mobile Hero Image', proposed_authoring#>>'{tournament,Mobile Hero Image}', true
  loop
    if not production_control.guide_url_valid_v1(
      coalesce(link_value.value, ''), link_value.asset) then
      issues := issues || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'code', 'GUIDE_URL_INVALID',
          'field', link_value.key_value,
          'message', 'A Guide URL or asset reference is invalid.'));
    end if;
  end loop;

  if exists (
    select 1 from pg_catalog.jsonb_array_elements(
      proposed_authoring->'importantContacts') item
    where pg_catalog.btrim(coalesce(item->>'Email', '')) <> ''
      and item->>'Email' !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ) then
    issues := issues || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'GUIDE_EMAIL_INVALID',
        'message', 'An Important Contact email address is invalid.'));
  end if;
  if exists (
    select 1 from (
      select item->>'Phone' phone from pg_catalog.jsonb_array_elements(
        proposed_authoring->'importantContacts') item
      union all select item->>'Phone' from pg_catalog.jsonb_array_elements(
        proposed_authoring->'localGuide') item
    ) phone_value
    where pg_catalog.btrim(coalesce(phone_value.phone, '')) <> ''
      and pg_catalog.length(pg_catalog.regexp_replace(
        phone_value.phone, '[^0-9]', '', 'g')) not between 7 and 15
  ) then
    issues := issues || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'GUIDE_PHONE_INVALID',
        'message', 'A Guide phone number is invalid.'));
  end if;
  if exists (
    select 1 from pg_catalog.jsonb_array_elements(
      proposed_authoring->'importantContacts') item
    where pg_catalog.upper(pg_catalog.btrim(coalesce(
        item->>'Visibility', item->>'Audience', ''))) in (
          'DIRECTOR','DIRECTORS','ADMIN','PRIVATE','INTERNAL'
        )
       or pg_catalog.lower(pg_catalog.btrim(coalesce(
         item->>'Sensitive', ''))) in ('true','yes','1')
  ) then
    issues := issues || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'GUIDE_CONTACT_NOT_PARTICIPANT_SAFE',
        'message', 'Private or Director-only contacts cannot enter the Guide.'));
  end if;

  for item_value in
    select item from pg_catalog.jsonb_array_elements(
      proposed_authoring->'schedule') item
    union all select item from pg_catalog.jsonb_array_elements(
      proposed_authoring->'timelineRows') item
  loop
    date_value := coalesce(item_value.item->>'Event Date', '');
    if not production_control.guide_date_valid_v1(date_value, target_year) then
      issues := issues || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'code', 'GUIDE_DATE_INVALID',
          'message', 'A Guide event date is invalid for the selected year.'));
    end if;
    time_value := coalesce(item_value.item->>'Start Time', '');
    if not production_control.guide_time_valid_v1(time_value)
       or not production_control.guide_time_valid_v1(coalesce(
         item_value.item->>'End Time', '')) then
      issues := issues || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'code', 'GUIDE_TIME_INVALID',
          'message', 'A Guide event time is invalid.'));
    end if;
  end loop;
  for item_value in
    select item from pg_catalog.jsonb_array_elements(
      proposed_authoring->'dining') item
  loop
    if not production_control.guide_time_valid_v1(coalesce(
         item_value.item->>'Start Time', ''))
       or not production_control.guide_time_valid_v1(coalesce(
         item_value.item->>'End Time', '')) then
      issues := issues || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'code', 'GUIDE_TIME_INVALID',
          'message', 'A dining time is invalid.'));
    end if;
  end loop;

  -- Guide references validate canonical assignments; they never modify them.
  for item_value in
    select item from pg_catalog.jsonb_array_elements(
      proposed_authoring->'schedule') item
  loop
    round_text := pg_catalog.btrim(coalesce(item_value.item->>'Round ID', ''));
    if round_text <> '' then
      begin
        round_number_value := pg_catalog.regexp_replace(
          round_text, '[^0-9]', '', 'g')::integer;
      exception when others then
        round_number_value := null;
      end;
      if round_number_value is null or not exists (
        select 1 from scoring_authority.rounds round_value
        where round_value.tournament_id = target
          and round_value.round_number = round_number_value
      ) then
        issues := issues || pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object(
            'code', 'GUIDE_ROUND_REFERENCE_INVALID',
            'message', 'An itinerary Round reference does not resolve.'));
      end if;
    end if;
    course_id_value := pg_catalog.btrim(coalesce(
      item_value.item->>'Course ID', ''));
    if course_id_value <> '' and not exists (
      select 1 from scoring_authority.tournament_setup_round_courses_v1 value
      where value.tournament_id = target
        and pg_catalog.upper(value.course_id) =
          pg_catalog.upper(course_id_value)
    ) then
      issues := issues || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'code', 'GUIDE_COURSE_REFERENCE_INVALID',
          'message', 'An itinerary Course reference does not resolve.'));
    end if;
  end loop;

  for item_value in
    select item from pg_catalog.jsonb_array_elements(
      proposed_authoring->'courses') item
  loop
    course_id_value := pg_catalog.btrim(coalesce(
      item_value.item->>'Course ID', ''));
    begin
      round_number_value := pg_catalog.regexp_replace(coalesce(
        item_value.item->>'Round', ''), '[^0-9]', '', 'g')::integer;
    exception when others then
      round_number_value := null;
    end;
    if course_id_value = '' or round_number_value is null or not exists (
      select 1
      from scoring_authority.tournament_setup_round_courses_v1 assignment
      where assignment.tournament_id = target
        and assignment.round_number = round_number_value
        and pg_catalog.upper(assignment.course_id) =
          pg_catalog.upper(course_id_value)
    ) then
      issues := issues || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'code', 'GUIDE_COURSE_REFERENCE_INVALID',
          'message', 'A Course presentation row does not match Tournament Setup.'));
    elsif exists (
      select 1
      from scoring_authority.tournament_setup_round_courses_v1 assignment
      join scoring_authority.tournament_setup_course_tees_v1 tee
        on tee.tournament_id = assignment.tournament_id
       and tee.course_id = assignment.course_id
       and tee.tee_id = assignment.tee_id
      join scoring_authority.rounds round_value
        on round_value.tournament_id = assignment.tournament_id
       and round_value.round_number = assignment.round_number
      where assignment.tournament_id = target
        and assignment.round_number = round_number_value
        and pg_catalog.upper(assignment.course_id) =
          pg_catalog.upper(course_id_value)
        and (
          (pg_catalog.btrim(coalesce(item_value.item->>'Format', '')) <> ''
            and pg_catalog.upper(item_value.item->>'Format') <>
              pg_catalog.upper(round_value.format))
          or (pg_catalog.btrim(coalesce(
                item_value.item->>'Tee Played', item_value.item->>'Tee', '')) <> ''
            and pg_catalog.upper(coalesce(
              item_value.item->>'Tee Played', item_value.item->>'Tee')) <>
              pg_catalog.upper(assignment.tee_id))
          or (pg_catalog.btrim(coalesce(item_value.item->>'Slope', '')) <> ''
            and item_value.item->>'Slope' ~ '^[0-9]+$'
            and (item_value.item->>'Slope')::integer <> tee.slope)
          or (pg_catalog.btrim(coalesce(item_value.item->>'Par', '')) <> ''
            and item_value.item->>'Par' ~ '^[0-9]+$'
            and (item_value.item->>'Par')::integer <> tee.par)
        )
    ) then
      issues := issues || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'code', 'GUIDE_SCORING_FACT_CONFLICT',
          'message', 'Guide presentation conflicts with canonical scoring facts.'));
    end if;
  end loop;

  if exists (
    select 1 from pg_catalog.jsonb_array_elements(
      proposed_authoring->'tournamentRules') item
    where not exists (
      select 1 from scoring_authority.rounds round_value
      where round_value.tournament_id = target
        and round_value.round_number = pg_catalog.regexp_replace(
          coalesce(item->>'Round', ''), '[^0-9]', '', 'g')::integer
        and pg_catalog.upper(round_value.format) =
          pg_catalog.upper(pg_catalog.btrim(coalesce(item->>'Format', '')))
    )
  ) or exists (
    select 1 from pg_catalog.jsonb_array_elements(
      proposed_authoring->'rounds') item
    where not exists (
      select 1 from scoring_authority.rounds round_value
      where round_value.tournament_id = target
        and pg_catalog.upper(round_value.format) =
          pg_catalog.upper(pg_catalog.btrim(item->>'Format ID'))
    )
  ) then
    issues := issues || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'GUIDE_RULE_SCORING_CONFLICT',
        'message', 'Guide rule presentation conflicts with canonical rounds.'));
  end if;

  return pg_catalog.jsonb_build_object(
    'pass', pg_catalog.jsonb_array_length(issues) = 0,
    'issues', issues,
    'diagnostics', pg_catalog.jsonb_build_object(
      'validated', pg_catalog.jsonb_array_length(issues) = 0,
      'issueCount', pg_catalog.jsonb_array_length(issues),
      'sourceTabs', production_control.guide_authoring_source_tabs_v1(),
      'domainCount', 11,
      'authoringItemCount',
        (select coalesce(pg_catalog.sum(pg_catalog.jsonb_array_length(
          proposed_authoring->key_value)), 0)::integer
         from pg_catalog.unnest(array[
           'overview','schedule','timelineRows','ruleBook','tournamentRules',
           'rounds','dining','localGuide','importantContacts','courses'
         ]) key_value)
    ),
    'authoringContent', proposed_authoring,
    'projectionPayload', proposed_projection,
    'authoringContentFingerprint', authoring_hash,
    'contentFingerprint', content_hash,
    'projectionPayloadHash', projection_hash
  );
exception when invalid_text_representation or numeric_value_out_of_range
  or division_by_zero then
  return pg_catalog.jsonb_build_object(
    'pass', false,
    'issues', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'code', 'GUIDE_FIELD_VALUE_INVALID',
      'message', 'A Guide field value could not be validated.'))
  );
end;
$validate_guide_authoring$;

create function production_control.guide_authoring_with_item_ids_v1(
  value jsonb
)
returns jsonb
language plpgsql
immutable
strict
set search_path = pg_catalog
as $guide_authoring_with_item_ids$
declare
  result_value jsonb := pg_catalog.jsonb_build_object(
    'tournament', coalesce(value->'tournament', '{}'::jsonb));
  domain_key text;
  items_value jsonb;
begin
  foreach domain_key in array array[
    'overview','schedule','timelineRows','ruleBook','tournamentRules',
    'rounds','dining','localGuide','importantContacts','courses'
  ] loop
    select coalesce(pg_catalog.jsonb_agg(
      case when pg_catalog.btrim(coalesce(item->>'itemId', '')) = '' then
        item || pg_catalog.jsonb_build_object(
          'itemId', domain_key || ':' || pg_catalog.substring(
            production_control.guide_authoring_hash_v1(item), 1, 24))
      else item end order by ordinal_value), '[]'::jsonb)
    into items_value
    from pg_catalog.jsonb_array_elements(coalesce(
      value->domain_key, '[]'::jsonb)) with ordinality source(item, ordinal_value);
    result_value := pg_catalog.jsonb_set(
      result_value, array[domain_key], items_value, true);
  end loop;
  return result_value;
end;
$guide_authoring_with_item_ids$;

create function production_control.guide_clone_authoring_v1(
  source_value jsonb,
  target text,
  target_year integer
)
returns jsonb
language plpgsql
immutable
strict
set search_path = pg_catalog
as $guide_clone_authoring$
declare
  result_value jsonb;
  domain_key text;
  items_value jsonb;
begin
  result_value := production_control.guide_authoring_with_item_ids_v1(
    source_value);
  result_value := pg_catalog.jsonb_set(result_value, '{tournament}',
    (result_value->'tournament') || pg_catalog.jsonb_build_object(
      'Tournament ID', target, 'Tournament Year', target_year,
      'Year', target_year, 'Dates', '', 'Tournament Dates', '',
      'Start Date', '', 'End Date', ''), true);
  foreach domain_key in array array[
    'overview','schedule','timelineRows','ruleBook','tournamentRules',
    'rounds','dining','localGuide','courses'
  ] loop
    select coalesce(pg_catalog.jsonb_agg((item
      || pg_catalog.jsonb_build_object(
        'Tournament ID', target, 'Tournament Year', target_year,
        'Year', target_year)
      || case when domain_key in ('overview','schedule','ruleBook') then
        pg_catalog.jsonb_build_object('Status','Draft','Published',false)
        else '{}'::jsonb end
      || case when domain_key = 'ruleBook' then
        pg_catalog.jsonb_build_object('Effective Year', target_year)
        else '{}'::jsonb end
      || case when domain_key in ('schedule','timelineRows') then
        pg_catalog.jsonb_build_object(
          'Event Date','','Start Time','','End Time','')
        else '{}'::jsonb end
      || case when domain_key = 'dining' then
        pg_catalog.jsonb_build_object(
          'Day','','Start Time','','End Time','')
        else '{}'::jsonb end
      || case when domain_key = 'localGuide' then
        pg_catalog.jsonb_build_object('Phone','','Website','')
        else '{}'::jsonb end
      || case when domain_key = 'courses' then
        pg_catalog.jsonb_build_object('Website','','GPS Link','')
        else '{}'::jsonb end
    ) order by ordinal_value), '[]'::jsonb)
    into items_value
    from pg_catalog.jsonb_array_elements(result_value->domain_key)
      with ordinality source(item, ordinal_value);
    result_value := pg_catalog.jsonb_set(
      result_value, array[domain_key], items_value, true);
  end loop;
  -- Participant-visible contact values and identity are never carried forward.
  result_value := pg_catalog.jsonb_set(
    result_value, '{importantContacts}', '[]'::jsonb, true);
  return result_value;
end;
$guide_clone_authoring$;

create function production_control.guide_projection_from_clone_v1(
  authoring_value jsonb,
  source_projection jsonb,
  target text,
  target_year integer
)
returns jsonb
language plpgsql
immutable
strict
set search_path = pg_catalog
as $guide_projection_from_clone$
declare
  content_value jsonb;
  domain_key text;
  items_value jsonb;
begin
  content_value := pg_catalog.jsonb_build_object(
    'tournament', authoring_value->'tournament',
    'tournamentIdentity', coalesce(
      source_projection#>'{content,tournamentIdentity}', '{}'::jsonb)
      || pg_catalog.jsonb_build_object(
        'id', target, 'year', target_year, 'dates', '',
        'startDate', '', 'endDate', ''),
    'overview', '[]'::jsonb,
    'schedule', '[]'::jsonb,
    'timelineRows', '[]'::jsonb,
    'ruleBook', '[]'::jsonb,
    'headers', coalesce(source_projection#>'{content,headers}', '{}'::jsonb)
  );
  foreach domain_key in array array[
    'tournamentRules','rounds','dining','localGuide','importantContacts','courses'
  ] loop
    select coalesce(pg_catalog.jsonb_agg(
      item - 'itemId' order by ordinal_value), '[]'::jsonb)
    into items_value
    from pg_catalog.jsonb_array_elements(authoring_value->domain_key)
      with ordinality source(item, ordinal_value);
    content_value := pg_catalog.jsonb_set(
      content_value, array[domain_key], items_value, true);
  end loop;
  return pg_catalog.jsonb_build_object(
    'schemaVersion','guide-projection-v1','content',content_value);
end;
$guide_projection_from_clone$;

create function public.read_production_guide_authoring_v1(input jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $read_guide_authoring$
declare
  target text;
  target_year integer;
  history_limit_value integer := coalesce((input->>'history_limit')::integer,30);
  annual_pointer production_control.current_tournament_pointer_v1%rowtype;
  open_draft production_control.guide_authoring_drafts_v1%rowtype;
  current_value jsonb;
  history_value jsonb;
  targets_value jsonb;
  audit_value jsonb;
begin
  target := production_control.assert_guide_authoring_v1(input);
  target_year := target::integer;
  if input->>'operation' is distinct from
       'READ_PRODUCTION_GUIDE_AUTHORING_V1'
     or history_limit_value not between 1 and 50 then
    raise exception using errcode = '22023',
      message = 'GUIDE_READ_INPUT_INVALID';
  end if;
  select value.* into strict annual_pointer
  from production_control.current_tournament_pointer_v1 value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  current_value := production_control.guide_current_publication_v1(target);
  select value.* into open_draft
  from production_control.guide_authoring_drafts_v1 value
  where value.tournament_id = target and value.state in ('DRAFT','VALIDATED')
  order by value.created_at desc limit 1;

  with native_history as (
    select revision.revision_id, revision.revision_number,
      revision.previous_published_revision,
      'SUPABASE_DIRECTOR'::text authority,
      provenance.authoring_kind operation_value,
      revision.published_at effective_at,
      revision.content_fingerprint,
      revision.revision_id = (select pointer.revision_id
        from production_control.guide_authoring_current_v1 pointer
        where pointer.tournament_id = target) current_value
    from production_control.guide_authoring_revisions_v1 revision
    join production_control.guide_authoring_revision_provenance_v1 provenance
      on provenance.revision_id = revision.revision_id
    where revision.tournament_id = target
  ), legacy_history as (
    select revision.revision_id, revision.revision_number,
      coalesce(previous.revision_number,0) previous_published_revision,
      'GOOGLE_SYNCHRONIZATION'::text authority,
      'GOOGLE_IMPORT'::text operation_value,
      revision.imported_at effective_at,
      production_control.guide_authoring_hash_v1(
        revision.projection_payload->'content') content_fingerprint,
      revision.revision_id = (select pointer.revision_id
        from production_control.projection_current pointer
        where pointer.domain='GUIDE' and pointer.tournament_id=target)
        and not exists (select 1
          from production_control.guide_authoring_current_v1 native_pointer
          where native_pointer.tournament_id=target) current_value
    from production_control.projection_revisions revision
    left join production_control.projection_revisions previous
      on previous.revision_id=revision.previous_revision_id
    where target='2026' and revision.domain='GUIDE'
      and revision.tournament_id=target
      and not exists (select 1
        from production_control.guide_authoring_revisions_v1 native_revision
        where native_revision.production_projection_revision_id=
          revision.revision_id)
  ), combined as (
    select * from native_history union all select * from legacy_history
  )
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'revisionId', combined.revision_id,
    'revision', combined.revision_number,
    'predecessorRevision', combined.previous_published_revision,
    'authoringAuthority', combined.authority,
    'operation', combined.operation_value,
    'contentFingerprint', combined.content_fingerprint,
    'effectiveAt', combined.effective_at,
    'current', combined.current_value
  ) order by combined.revision_number desc), '[]'::jsonb)
  into history_value
  from (select * from combined order by revision_number desc
    limit history_limit_value) combined;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'tournamentId', catalog.tournament_id,
    'tournamentYear', catalog.tournament_year,
    'name', catalog.tournament_name,
    'lifecycle', catalog.lifecycle,
    'current', catalog.tournament_id=annual_pointer.tournament_id
  ) order by catalog.tournament_year), '[]'::jsonb) into targets_value
  from production_control.future_tournament_catalog_v1 catalog
  join production_control.future_tournament_resources_v1 resource
    on resource.tournament_id=catalog.tournament_id
  where resource.project_ref=input->>'project_ref'
    and resource.project_url=input->>'project_url'
    and resource.project_ref !~* '(preview|staging|test)'
    and ((catalog.tournament_id=annual_pointer.tournament_id
          and catalog.tournament_year=annual_pointer.tournament_year
          and catalog.lifecycle='ACTIVE'
          and catalog.lifecycle_revision=annual_pointer.lifecycle_revision)
      or (catalog.tournament_year>annual_pointer.tournament_year
          and catalog.lifecycle in (
            'DRAFT','CONFIGURING','READY_FOR_ACTIVATION')));

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'action', event.action,
    'summary', event.summary,
    'actorPlayerId', event.actor_player_id,
    'createdAt', event.created_at
  ) order by event.created_at desc), '[]'::jsonb) into audit_value
  from (select value.*
    from production_control.guide_authoring_audit_events_v1 value
    where value.tournament_id=target
    order by value.created_at desc limit 50) event;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'data', pg_catalog.jsonb_build_object(
      'contractVersion','production-guide-authoring-v1',
      'guideContractVersion','guide-projection-v1',
      'sourceTabs',production_control.guide_authoring_source_tabs_v1(),
      'tournamentId',target,'tournamentYear',target_year,
      'currentTournamentId',annual_pointer.tournament_id,
      'currentTournamentYear',annual_pointer.tournament_year,
      'current',current_value,
      'openDraft',case when open_draft.draft_id is null then null else
        pg_catalog.jsonb_build_object(
          'draftId',open_draft.draft_id,
          'draftVersion',open_draft.draft_version,
          'state',open_draft.state,
          'authoringKind',open_draft.authoring_kind,
          'expectedPublishedRevision',open_draft.expected_published_revision,
          'expectedPublishedRevisionId',
            open_draft.expected_published_revision_id,
          'sourceTournamentId',open_draft.source_tournament_id,
          'authoringContent',open_draft.authoring_content,
          'preview',open_draft.projection_payload,
          'projectionPayload',open_draft.projection_payload,
          'authoringContentFingerprint',
            open_draft.authoring_content_fingerprint,
          'contentFingerprint',open_draft.content_fingerprint,
          'projectionPayloadHash',open_draft.projection_payload_hash,
          'canonicalReferenceFingerprint',
            open_draft.canonical_reference_fingerprint,
          'validatedContentFingerprint',
            open_draft.validated_content_fingerprint,
          'validatedCanonicalReferenceFingerprint',
            open_draft.validated_canonical_reference_fingerprint,
          'validationDiagnostics',open_draft.validation_diagnostics,
          'createdAt',open_draft.created_at,
          'updatedAt',open_draft.updated_at,
          'validatedAt',open_draft.validated_at
        ) end,
      'history',history_value,
      'targets',targets_value,
      'canonicalRounds',
        production_control.guide_canonical_rounds_v1(target),
      'canonicalCourseContext',
        production_control.guide_canonical_course_context_v1(target),
      'canonicalReferenceFingerprint',
        production_control.guide_canonical_reference_fingerprint_v1(target),
      'canonicalTournamentContext',(select pg_catalog.jsonb_build_object(
        'tournamentId', tournament.tournament_id,
        'tournamentYear', tournament.tournament_year,
        'name', tournament.name,
        'lifecycle', catalog.lifecycle,
        'scoringAuthority', tournament.scoring_authority,
        'currentRound',(select round_value.round_number
          from scoring_authority.rounds round_value
          where round_value.tournament_id=tournament.tournament_id
            and round_value.status='LIVE'
          order by round_value.round_number limit 1),
        'destination', operational.destination,
        'startDate', operational.start_date,
        'endDate', operational.end_date,
        'timezone', operational.timezone
      ) from scoring_authority.tournaments tournament
      left join scoring_authority.tournament_setup_operational_v1 operational
        on operational.tournament_id=tournament.tournament_id
      left join production_control.future_tournament_catalog_v1 catalog
        on catalog.tournament_id=tournament.tournament_id
      where tournament.tournament_id=target),
      'audit',audit_value,
      'googleAuthoring',pg_catalog.jsonb_build_object(
        'productionStatus','RETIRED',
        'classification','LEGACY_NON_AUTHORITATIVE')
    )
  );
exception when invalid_text_representation or numeric_value_out_of_range then
  raise exception using errcode='22023',message='GUIDE_READ_INPUT_INVALID';
end;
$read_guide_authoring$;

create function public.create_production_guide_draft_v1(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $create_guide_draft$
declare
  target text;
  target_year integer;
  actor_player text := pg_catalog.upper(pg_catalog.btrim(coalesce(
    input#>>'{authorization,player_id}','')));
  actor_auth uuid;
  request_id uuid;
  declared_hash text := pg_catalog.lower(pg_catalog.btrim(coalesce(
    input->>'request_payload_hash','')));
  expected_revision bigint;
  expected_revision_id_text text := pg_catalog.lower(pg_catalog.btrim(
    coalesce(input->>'expected_published_revision_id','')));
  reason_value text := pg_catalog.btrim(coalesce(input->>'reason',''));
  authoring_value jsonb := coalesce(input->'authoring_content',input->'content');
  projection_value jsonb := input->'projection_payload';
  validation jsonb;
  current_value jsonb;
  database_hash text;
  prior_receipt jsonb;
  draft_id_value uuid;
  response_value jsonb;
begin
  target := production_control.assert_guide_authoring_v1(input);
  target_year := target::integer;
  if input->>'operation' is distinct from
       'CREATE_PRODUCTION_GUIDE_DRAFT_V1'
     or coalesce(input->>'operation_request_id','')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
     or declared_hash !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'expected_published_revision','') !~ '^[0-9]+$'
     or coalesce(input->>'authoring_content_fingerprint','')
       !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'content_fingerprint','') !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'projection_payload_hash','') !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'canonical_reference_fingerprint','')
       !~ '^[0-9a-f]{64}$'
     or pg_catalog.jsonb_typeof(authoring_value) is distinct from 'object'
     or pg_catalog.jsonb_typeof(projection_value) is distinct from 'object'
     or reason_value='' or pg_catalog.length(reason_value)>500 then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','GUIDE_INPUT_INVALID');
  end if;
  actor_auth := (input#>>'{authorization,auth_user_id}')::uuid;
  request_id := (input->>'operation_request_id')::uuid;
  expected_revision := (input->>'expected_published_revision')::bigint;
  validation := production_control.validate_guide_authoring_v1(
    target,target_year,authoring_value,projection_value,
    input->>'authoring_content_fingerprint',input->>'content_fingerprint',
    input->>'projection_payload_hash');
  database_hash := production_control.guide_authoring_hash_v1(
    pg_catalog.jsonb_build_object(
      'operation','CREATE','tournamentId',target,
      'actorPlayerId',actor_player,'actorAuthUserId',actor_auth,
      'expectedPublishedRevision',expected_revision,
      'expectedPublishedRevisionId',expected_revision_id_text,
      'authoringContent',authoring_value,'projectionPayload',projection_value,
      'canonicalReferenceFingerprint',
        input->>'canonical_reference_fingerprint',
      'reason',reason_value));
  prior_receipt := production_control.guide_operation_receipt_v1(
    target,'CREATE',request_id,declared_hash,database_hash);
  if prior_receipt is not null then return prior_receipt; end if;
  if not coalesce((validation->>'pass')::boolean,false) then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','GUIDE_VALIDATION_FAILED',
      'issues',validation->'issues');
  end if;
  if input->>'canonical_reference_fingerprint' is distinct from
       production_control.guide_canonical_reference_fingerprint_v1(target) then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','GUIDE_CANONICAL_REFERENCE_STALE');
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'production-guide-authoring:'||target,0));
  prior_receipt := production_control.guide_operation_receipt_v1(
    target,'CREATE',request_id,declared_hash,database_hash);
  if prior_receipt is not null then return prior_receipt; end if;
  if input->>'canonical_reference_fingerprint' is distinct from
       production_control.guide_canonical_reference_fingerprint_v1(target) then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','GUIDE_CANONICAL_REFERENCE_STALE');
  end if;
  current_value := production_control.guide_current_publication_v1(target);
  if (current_value->>'revision')::bigint <> expected_revision
     or (expected_revision_id_text <> '' and expected_revision_id_text
       is distinct from pg_catalog.lower(coalesce(
         current_value->>'revisionId',''))) then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','GUIDE_PREDECESSOR_STALE',
      'currentRevision',(current_value->>'revision')::bigint,
      'currentRevisionId',current_value->>'revisionId');
  end if;
  if exists (select 1
    from production_control.guide_authoring_drafts_v1 value
    where value.tournament_id=target and value.state in ('DRAFT','VALIDATED'))
  then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','GUIDE_OPEN_DRAFT_EXISTS');
  end if;
  insert into production_control.guide_authoring_drafts_v1 (
    tournament_id,tournament_year,draft_version,state,authoring_kind,
    expected_published_revision,expected_published_revision_id,
    authoring_content,projection_payload,authoring_content_fingerprint,
    content_fingerprint,projection_payload_hash,canonical_reference_fingerprint,
    validation_diagnostics,
    reason,created_by_player_id,created_by_auth_user_id
  ) values (
    target,target_year,1,'DRAFT','DIRECTOR_EDIT',expected_revision,
    nullif(expected_revision_id_text,'')::uuid,
    validation->'authoringContent',validation->'projectionPayload',
    validation->>'authoringContentFingerprint',
    validation->>'contentFingerprint',validation->>'projectionPayloadHash',
    input->>'canonical_reference_fingerprint',
    (validation->'diagnostics')||pg_catalog.jsonb_build_object(
      'validated',false,'requiresReview',false),reason_value,
    actor_player,actor_auth
  ) returning draft_id into draft_id_value;
  response_value := pg_catalog.jsonb_build_object(
    'ok',true,'code','GUIDE_DRAFT_CREATED','idempotent',false,
    'tournamentId',target,'draftId',draft_id_value,'draftVersion',1,
    'state','DRAFT','expectedPublishedRevision',expected_revision,
    'authoringContent',validation->'authoringContent',
    'preview',validation->'projectionPayload',
    'projectionPayload',validation->'projectionPayload',
    'validationDiagnostics',validation->'diagnostics');
  insert into production_control.guide_authoring_audit_events_v1 (
    tournament_id,draft_id,action,actor_player_id,actor_auth_user_id,summary
  ) values (
    target,draft_id_value,'DRAFT_CREATED',actor_player,actor_auth,
    pg_catalog.jsonb_build_object(
      'draftVersion',1,
      'predecessorRevision',expected_revision,
      'itemCount',validation#>>'{diagnostics,authoringItemCount}'));
  insert into production_control.guide_authoring_operation_receipts_v1 (
    tournament_id,operation,operation_request_id,
    declared_request_payload_hash,request_payload_hash,
    actor_player_id,actor_auth_user_id,response
  ) values (
    target,'CREATE',request_id,declared_hash,database_hash,
    actor_player,actor_auth,response_value);
  return response_value;
exception when invalid_text_representation or numeric_value_out_of_range then
  return pg_catalog.jsonb_build_object(
    'ok',false,'code','GUIDE_INPUT_INVALID');
when unique_violation then
  return pg_catalog.jsonb_build_object(
    'ok',false,'code','GUIDE_OPERATION_CONFLICT');
end;
$create_guide_draft$;

create function public.update_production_guide_draft_v1(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $update_guide_draft$
declare
  target text;
  target_year integer;
  actor_player text := pg_catalog.upper(pg_catalog.btrim(coalesce(
    input#>>'{authorization,player_id}','')));
  actor_auth uuid;
  request_id uuid;
  draft_id_value uuid;
  expected_draft_version bigint;
  expected_revision bigint;
  declared_hash text := pg_catalog.lower(pg_catalog.btrim(coalesce(
    input->>'request_payload_hash','')));
  reason_value text := pg_catalog.btrim(coalesce(input->>'reason',''));
  authoring_value jsonb := coalesce(input->'authoring_content',input->'content');
  projection_value jsonb := input->'projection_payload';
  validation jsonb;
  current_value jsonb;
  draft production_control.guide_authoring_drafts_v1%rowtype;
  database_hash text;
  prior_receipt jsonb;
  response_value jsonb;
begin
  target := production_control.assert_guide_authoring_v1(input);
  target_year := target::integer;
  if input->>'operation' is distinct from
       'UPDATE_PRODUCTION_GUIDE_DRAFT_V1'
     or coalesce(input->>'operation_request_id','')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'draft_id','')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
     or declared_hash !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'expected_draft_version','') !~ '^[1-9][0-9]*$'
     or coalesce(input->>'expected_published_revision','') !~ '^[0-9]+$'
     or coalesce(input->>'authoring_content_fingerprint','')
       !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'content_fingerprint','') !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'projection_payload_hash','') !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'canonical_reference_fingerprint','')
       !~ '^[0-9a-f]{64}$'
     or pg_catalog.jsonb_typeof(authoring_value) is distinct from 'object'
     or pg_catalog.jsonb_typeof(projection_value) is distinct from 'object'
     or reason_value='' or pg_catalog.length(reason_value)>500 then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','GUIDE_INPUT_INVALID');
  end if;
  actor_auth := (input#>>'{authorization,auth_user_id}')::uuid;
  request_id := (input->>'operation_request_id')::uuid;
  draft_id_value := (input->>'draft_id')::uuid;
  expected_draft_version := (input->>'expected_draft_version')::bigint;
  expected_revision := (input->>'expected_published_revision')::bigint;
  validation := production_control.validate_guide_authoring_v1(
    target,target_year,authoring_value,projection_value,
    input->>'authoring_content_fingerprint',input->>'content_fingerprint',
    input->>'projection_payload_hash');
  database_hash := production_control.guide_authoring_hash_v1(
    pg_catalog.jsonb_build_object(
      'operation','UPDATE','tournamentId',target,
      'actorPlayerId',actor_player,'actorAuthUserId',actor_auth,
      'draftId',draft_id_value,'expectedDraftVersion',expected_draft_version,
      'expectedPublishedRevision',expected_revision,
      'authoringContent',authoring_value,'projectionPayload',projection_value,
      'canonicalReferenceFingerprint',
        input->>'canonical_reference_fingerprint',
      'reason',reason_value));
  prior_receipt := production_control.guide_operation_receipt_v1(
    target,'UPDATE',request_id,declared_hash,database_hash);
  if prior_receipt is not null then return prior_receipt; end if;
  if not coalesce((validation->>'pass')::boolean,false) then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','GUIDE_VALIDATION_FAILED','issues',validation->'issues');
  end if;
  if input->>'canonical_reference_fingerprint' is distinct from
       production_control.guide_canonical_reference_fingerprint_v1(target) then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','GUIDE_CANONICAL_REFERENCE_STALE');
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'production-guide-authoring:'||target,0));
  prior_receipt := production_control.guide_operation_receipt_v1(
    target,'UPDATE',request_id,declared_hash,database_hash);
  if prior_receipt is not null then return prior_receipt; end if;
  if input->>'canonical_reference_fingerprint' is distinct from
       production_control.guide_canonical_reference_fingerprint_v1(target) then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','GUIDE_CANONICAL_REFERENCE_STALE');
  end if;
  select value.* into strict draft
  from production_control.guide_authoring_drafts_v1 value
  where value.draft_id=draft_id_value and value.tournament_id=target
  for update;
  current_value := production_control.guide_current_publication_v1(target);
  if draft.state not in ('DRAFT','VALIDATED')
     or draft.draft_version<>expected_draft_version then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','GUIDE_DRAFT_VERSION_STALE',
      'currentDraftVersion',draft.draft_version);
  end if;
  if draft.expected_published_revision<>expected_revision
     or (current_value->>'revision')::bigint<>expected_revision
     or draft.expected_published_revision_id::text is distinct from
       nullif(current_value->>'revisionId','') then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','GUIDE_PREDECESSOR_STALE',
      'currentRevision',(current_value->>'revision')::bigint);
  end if;
  if draft.authoring_content_fingerprint=
       validation->>'authoringContentFingerprint'
     and draft.projection_payload_hash=validation->>'projectionPayloadHash' then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','GUIDE_NO_CHANGES');
  end if;
  update production_control.guide_authoring_drafts_v1 set
    draft_version=draft_version+1,state='DRAFT',
    authoring_content=validation->'authoringContent',
    projection_payload=validation->'projectionPayload',
    authoring_content_fingerprint=validation->>'authoringContentFingerprint',
    content_fingerprint=validation->>'contentFingerprint',
    projection_payload_hash=validation->>'projectionPayloadHash',
    canonical_reference_fingerprint=
      input->>'canonical_reference_fingerprint',
    validated_content_fingerprint=null,
    validated_canonical_reference_fingerprint=null,
    validation_diagnostics=(validation->'diagnostics')||
      pg_catalog.jsonb_build_object(
        'validated',false,'requiresReview',false,'reviewed',true),
    reason=reason_value,updated_at=pg_catalog.clock_timestamp(),validated_at=null
  where draft_id=draft_id_value;
  response_value := pg_catalog.jsonb_build_object(
    'ok',true,'code','GUIDE_DRAFT_UPDATED','idempotent',false,
    'tournamentId',target,'draftId',draft_id_value,
    'draftVersion',expected_draft_version+1,'state','DRAFT',
    'authoringContent',validation->'authoringContent',
    'preview',validation->'projectionPayload',
    'projectionPayload',validation->'projectionPayload',
    'validationDiagnostics',validation->'diagnostics');
  insert into production_control.guide_authoring_audit_events_v1 (
    tournament_id,draft_id,action,actor_player_id,actor_auth_user_id,summary
  ) values (
    target,draft_id_value,'DRAFT_UPDATED',actor_player,actor_auth,
    pg_catalog.jsonb_build_object(
      'draftVersion',expected_draft_version+1,
      'itemCount',validation#>>'{diagnostics,authoringItemCount}'));
  insert into production_control.guide_authoring_operation_receipts_v1 (
    tournament_id,operation,operation_request_id,
    declared_request_payload_hash,request_payload_hash,
    actor_player_id,actor_auth_user_id,response
  ) values (
    target,'UPDATE',request_id,declared_hash,database_hash,
    actor_player,actor_auth,response_value);
  return response_value;
exception when no_data_found then
  return pg_catalog.jsonb_build_object(
    'ok',false,'code','GUIDE_DRAFT_NOT_FOUND');
when invalid_text_representation or numeric_value_out_of_range then
  return pg_catalog.jsonb_build_object(
    'ok',false,'code','GUIDE_INPUT_INVALID');
end;
$update_guide_draft$;

create function public.validate_production_guide_draft_v1(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $validate_guide_draft$
declare
  target text;
  target_year integer;
  actor_player text := pg_catalog.upper(pg_catalog.btrim(coalesce(
    input#>>'{authorization,player_id}','')));
  actor_auth uuid;
  request_id uuid;
  draft_id_value uuid;
  expected_draft_version bigint;
  declared_hash text := pg_catalog.lower(pg_catalog.btrim(coalesce(
    input->>'request_payload_hash','')));
  authoring_value jsonb := coalesce(input->'authoring_content',input->'content');
  projection_value jsonb := input->'projection_payload';
  database_hash text;
  prior_receipt jsonb;
  draft production_control.guide_authoring_drafts_v1%rowtype;
  current_value jsonb;
  validation jsonb;
  next_version bigint;
  response_value jsonb;
begin
  target := production_control.assert_guide_authoring_v1(input);
  target_year := target::integer;
  if input->>'operation' is distinct from
       'VALIDATE_PRODUCTION_GUIDE_DRAFT_V1'
     or coalesce(input->>'operation_request_id','')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'draft_id','')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'expected_draft_version','') !~ '^[1-9][0-9]*$'
     or declared_hash !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'authoring_content_fingerprint','')
       !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'content_fingerprint','') !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'projection_payload_hash','') !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'canonical_reference_fingerprint','')
       !~ '^[0-9a-f]{64}$'
     or pg_catalog.jsonb_typeof(authoring_value) is distinct from 'object'
     or pg_catalog.jsonb_typeof(projection_value) is distinct from 'object' then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','GUIDE_INPUT_INVALID');
  end if;
  actor_auth := (input#>>'{authorization,auth_user_id}')::uuid;
  request_id := (input->>'operation_request_id')::uuid;
  draft_id_value := (input->>'draft_id')::uuid;
  expected_draft_version := (input->>'expected_draft_version')::bigint;
  database_hash := production_control.guide_authoring_hash_v1(
    pg_catalog.jsonb_build_object(
      'operation','VALIDATE','tournamentId',target,
      'actorPlayerId',actor_player,'actorAuthUserId',actor_auth,
      'draftId',draft_id_value,'expectedDraftVersion',expected_draft_version,
      'authoringContent',authoring_value,'projectionPayload',projection_value,
      'canonicalReferenceFingerprint',
        input->>'canonical_reference_fingerprint'));
  prior_receipt := production_control.guide_operation_receipt_v1(
    target,'VALIDATE',request_id,declared_hash,database_hash);
  if prior_receipt is not null then return prior_receipt; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'production-guide-authoring:'||target,0));
  prior_receipt := production_control.guide_operation_receipt_v1(
    target,'VALIDATE',request_id,declared_hash,database_hash);
  if prior_receipt is not null then return prior_receipt; end if;
  select value.* into strict draft
  from production_control.guide_authoring_drafts_v1 value
  where value.draft_id=draft_id_value and value.tournament_id=target
  for update;
  current_value := production_control.guide_current_publication_v1(target);
  if draft.state not in ('DRAFT','VALIDATED')
     or draft.draft_version<>expected_draft_version then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','GUIDE_DRAFT_VERSION_STALE',
      'currentDraftVersion',draft.draft_version);
  end if;
  if draft.expected_published_revision<>(current_value->>'revision')::bigint
     or draft.expected_published_revision_id::text is distinct from
       nullif(current_value->>'revisionId','') then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','GUIDE_PREDECESSOR_STALE');
  end if;
  if coalesce((draft.validation_diagnostics->>'requiresReview')::boolean,false)
  then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','GUIDE_COPY_REVIEW_REQUIRED');
  end if;
  if authoring_value is distinct from draft.authoring_content then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','GUIDE_DRAFT_CONTENT_STALE');
  end if;
  if input->>'canonical_reference_fingerprint' is distinct from
       production_control.guide_canonical_reference_fingerprint_v1(target) then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','GUIDE_CANONICAL_REFERENCE_STALE');
  end if;
  validation := production_control.validate_guide_authoring_v1(
    target,target_year,authoring_value,projection_value,
    input->>'authoring_content_fingerprint',input->>'content_fingerprint',
    input->>'projection_payload_hash');
  if not coalesce((validation->>'pass')::boolean,false) then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','GUIDE_VALIDATION_FAILED','issues',validation->'issues');
  end if;
  next_version := case when draft.state='VALIDATED'
      and draft.projection_payload=projection_value
      and draft.authoring_content_fingerprint=
        validation->>'authoringContentFingerprint'
      and draft.content_fingerprint=validation->>'contentFingerprint'
      and draft.projection_payload_hash=validation->>'projectionPayloadHash'
      and draft.canonical_reference_fingerprint=
        input->>'canonical_reference_fingerprint'
      and draft.validated_canonical_reference_fingerprint=
        input->>'canonical_reference_fingerprint'
    then draft.draft_version else draft.draft_version+1 end;
  if next_version<>draft.draft_version then
    update production_control.guide_authoring_drafts_v1 set
      draft_version=next_version,state='VALIDATED',
      projection_payload=validation->'projectionPayload',
      authoring_content_fingerprint=
        validation->>'authoringContentFingerprint',
      content_fingerprint=validation->>'contentFingerprint',
      projection_payload_hash=validation->>'projectionPayloadHash',
      canonical_reference_fingerprint=
        input->>'canonical_reference_fingerprint',
      validated_content_fingerprint=validation->>'contentFingerprint',
      validated_canonical_reference_fingerprint=
        input->>'canonical_reference_fingerprint',
      validation_diagnostics=(validation->'diagnostics')||
        pg_catalog.jsonb_build_object(
          'validated',true,'validatedDraftVersion',next_version,
          'requiresReview',false),
      validated_at=pg_catalog.clock_timestamp(),
      updated_at=pg_catalog.clock_timestamp()
    where draft_id=draft_id_value;
    insert into production_control.guide_authoring_audit_events_v1 (
      tournament_id,draft_id,action,actor_player_id,actor_auth_user_id,summary
    ) values (
      target,draft_id_value,'VALIDATION_COMPLETED',actor_player,actor_auth,
      pg_catalog.jsonb_build_object(
        'draftVersion',next_version,
        'issueCount',0,
        'itemCount',validation#>>'{diagnostics,authoringItemCount}'));
  end if;
  response_value := pg_catalog.jsonb_build_object(
    'ok',true,'code','GUIDE_DRAFT_VALIDATED','idempotent',false,
    'tournamentId',target,'draftId',draft_id_value,
    'draftVersion',next_version,'state','VALIDATED',
    'authoringContent',validation->'authoringContent',
    'preview',validation->'projectionPayload',
    'projectionPayload',validation->'projectionPayload',
    'validationDiagnostics',validation->'diagnostics');
  insert into production_control.guide_authoring_operation_receipts_v1 (
    tournament_id,operation,operation_request_id,
    declared_request_payload_hash,request_payload_hash,
    actor_player_id,actor_auth_user_id,response
  ) values (
    target,'VALIDATE',request_id,declared_hash,database_hash,
    actor_player,actor_auth,response_value);
  return response_value;
exception when no_data_found then
  return pg_catalog.jsonb_build_object(
    'ok',false,'code','GUIDE_DRAFT_NOT_FOUND');
when invalid_text_representation or numeric_value_out_of_range then
  return pg_catalog.jsonb_build_object(
    'ok',false,'code','GUIDE_INPUT_INVALID');
end;
$validate_guide_draft$;

create function public.preview_production_guide_draft_v1(input jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $preview_guide_draft$
declare
  target text;
  target_year integer;
  draft_id_value uuid;
  expected_draft_version bigint;
  authoring_value jsonb := coalesce(input->'authoring_content',input->'content');
  projection_value jsonb := input->'projection_payload';
  draft production_control.guide_authoring_drafts_v1%rowtype;
  validation jsonb;
begin
  target := production_control.assert_guide_authoring_v1(input);
  target_year := target::integer;
  if input->>'operation' is distinct from
       'PREVIEW_PRODUCTION_GUIDE_DRAFT_V1'
     or coalesce(input->>'draft_id','')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'expected_draft_version','') !~ '^[1-9][0-9]*$'
     or coalesce(input->>'canonical_reference_fingerprint','')
       !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'authoring_content_fingerprint','')
       !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'content_fingerprint','') !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'projection_payload_hash','') !~ '^[0-9a-f]{64}$'
     or pg_catalog.jsonb_typeof(authoring_value) is distinct from 'object'
     or pg_catalog.jsonb_typeof(projection_value) is distinct from 'object' then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','GUIDE_PREVIEW_INPUT_INVALID');
  end if;
  draft_id_value := (input->>'draft_id')::uuid;
  expected_draft_version := (input->>'expected_draft_version')::bigint;
  select value.* into strict draft
  from production_control.guide_authoring_drafts_v1 value
  where value.draft_id=draft_id_value and value.tournament_id=target;
  if draft.state<>'VALIDATED' or draft.draft_version<>expected_draft_version
     or authoring_value is distinct from draft.authoring_content then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','GUIDE_PREVIEW_VALIDATED_DRAFT_REQUIRED');
  end if;
  if input->>'canonical_reference_fingerprint' is distinct from
       production_control.guide_canonical_reference_fingerprint_v1(target)
     or draft.canonical_reference_fingerprint is distinct from
       input->>'canonical_reference_fingerprint'
     or draft.validated_canonical_reference_fingerprint is distinct from
       input->>'canonical_reference_fingerprint' then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','GUIDE_CANONICAL_REFERENCE_STALE');
  end if;
  validation := production_control.validate_guide_authoring_v1(
    target,target_year,authoring_value,projection_value,
    input->>'authoring_content_fingerprint',input->>'content_fingerprint',
    input->>'projection_payload_hash');
  if not coalesce((validation->>'pass')::boolean,false)
     or validation->>'authoringContentFingerprint' is distinct from
       draft.authoring_content_fingerprint
     or validation->>'contentFingerprint' is distinct from
       draft.content_fingerprint
     or draft.validated_content_fingerprint is distinct from
       validation->>'contentFingerprint'
     or validation->>'projectionPayloadHash' is distinct from
       draft.projection_payload_hash
     or projection_value is distinct from draft.projection_payload then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','GUIDE_DRAFT_VALIDATION_STALE',
      'issues',coalesce(validation->'issues','[]'::jsonb));
  end if;
  return pg_catalog.jsonb_build_object(
    'ok',true,'code','GUIDE_DRAFT_PREVIEW_READY',
    'tournamentId',target,'draftId',draft_id_value,
    'draftVersion',draft.draft_version,'state',draft.state,
    'label','DRAFT PREVIEW','public',false,'participantCurrent',false,
    'preview',draft.projection_payload,
    'projectionPayload',draft.projection_payload,
    'validationDiagnostics',draft.validation_diagnostics);
exception when no_data_found then
  return pg_catalog.jsonb_build_object(
    'ok',false,'code','GUIDE_DRAFT_NOT_FOUND');
when invalid_text_representation or numeric_value_out_of_range then
  return pg_catalog.jsonb_build_object(
    'ok',false,'code','GUIDE_PREVIEW_INPUT_INVALID');
end;
$preview_guide_draft$;

create function public.publish_production_guide_draft_v1(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $publish_guide_draft$
declare
  target text;
  target_year integer;
  actor_player text := pg_catalog.upper(pg_catalog.btrim(coalesce(
    input#>>'{authorization,player_id}','')));
  actor_auth uuid;
  request_id uuid;
  draft_id_value uuid;
  expected_draft_version bigint;
  expected_published_revision bigint;
  expected_published_revision_id_text text := pg_catalog.lower(
    pg_catalog.btrim(coalesce(input->>'expected_published_revision_id','')));
  expected_content_fingerprint text := pg_catalog.lower(
    pg_catalog.btrim(coalesce(input->>'expected_content_fingerprint','')));
  reason_value text := pg_catalog.btrim(coalesce(input->>'reason',''));
  declared_hash text := pg_catalog.lower(pg_catalog.btrim(coalesce(
    input->>'request_payload_hash','')));
  authoring_value jsonb := coalesce(input->'authoring_content',input->'content');
  projection_value jsonb := input->'projection_payload';
  database_hash text;
  prior_receipt jsonb;
  draft production_control.guide_authoring_drafts_v1%rowtype;
  current_value jsonb;
  validation jsonb;
  annual_pointer production_control.current_tournament_pointer_v1%rowtype;
  resource production_control.resource_scope%rowtype;
  catalog production_control.future_tournament_catalog_v1%rowtype;
  annual_resource production_control.future_tournament_resources_v1%rowtype;
  promotion production_control.future_runtime_promotions_v2%rowtype;
  binding production_control.future_annual_projection_bindings_v1%rowtype;
  next_revision bigint;
  next_binding_revision bigint;
  native_revision_id uuid;
  previous_native_revision_id uuid;
  production_revision_id uuid;
  legacy_current_projection_id uuid;
  guide_revision_id uuid;
  source_value jsonb;
  source_text text;
  content_text text;
  payload_text text;
  source_hash text;
  effective_at_value timestamptz;
  response_value jsonb;
begin
  target := production_control.assert_guide_authoring_v1(input);
  target_year := target::integer;
  if input->>'operation' is distinct from
       'PUBLISH_PRODUCTION_GUIDE_DRAFT_V1'
     or coalesce(input->>'operation_request_id','')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'draft_id','')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'expected_draft_version','') !~ '^[1-9][0-9]*$'
     or coalesce(input->>'expected_published_revision','') !~ '^[0-9]+$'
     or expected_content_fingerprint !~ '^[0-9a-f]{64}$'
     or declared_hash !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'authoring_content_fingerprint','')
       !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'content_fingerprint','') !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'projection_payload_hash','') !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'canonical_reference_fingerprint','')
       !~ '^[0-9a-f]{64}$'
     or pg_catalog.jsonb_typeof(authoring_value) is distinct from 'object'
     or pg_catalog.jsonb_typeof(projection_value) is distinct from 'object'
     or input->>'confirmation' is distinct from
       'PUBLISH TOURNAMENT GUIDE'
     or reason_value='' or pg_catalog.length(reason_value)>500 then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','GUIDE_PUBLISH_INPUT_INVALID');
  end if;
  actor_auth := (input#>>'{authorization,auth_user_id}')::uuid;
  request_id := (input->>'operation_request_id')::uuid;
  draft_id_value := (input->>'draft_id')::uuid;
  expected_draft_version := (input->>'expected_draft_version')::bigint;
  expected_published_revision :=
    (input->>'expected_published_revision')::bigint;
  database_hash := production_control.guide_authoring_hash_v1(
    pg_catalog.jsonb_build_object(
      'operation','PUBLISH','tournamentId',target,
      'actorPlayerId',actor_player,'actorAuthUserId',actor_auth,
      'draftId',draft_id_value,'expectedDraftVersion',expected_draft_version,
      'expectedPublishedRevision',expected_published_revision,
      'expectedPublishedRevisionId',expected_published_revision_id_text,
      'expectedContentFingerprint',expected_content_fingerprint,
      'authoringContent',authoring_value,'projectionPayload',projection_value,
      'canonicalReferenceFingerprint',
        input->>'canonical_reference_fingerprint',
      'confirmation',input->>'confirmation','reason',reason_value));
  prior_receipt := production_control.guide_operation_receipt_v1(
    target,'PUBLISH',request_id,declared_hash,database_hash);
  if prior_receipt is not null then return prior_receipt; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'production-guide-authoring:'||target,0));
  prior_receipt := production_control.guide_operation_receipt_v1(
    target,'PUBLISH',request_id,declared_hash,database_hash);
  if prior_receipt is not null then return prior_receipt; end if;
  perform 1 from production_control.guide_authoring_current_v1 value
    where value.tournament_id=target for update;
  if target='2026' then
    select value.revision_id into legacy_current_projection_id
    from production_control.projection_current value
    where value.domain='GUIDE' and value.tournament_id=target for update;
    perform 1 from scoring_authority.guide_projection_current value
      where value.tournament_id=target for update;
  else
    perform 1 from production_control.future_annual_projection_bindings_v1 value
      where value.tournament_id=target and value.domain='GUIDE' for update;
  end if;
  select value.* into strict draft
  from production_control.guide_authoring_drafts_v1 value
  where value.draft_id=draft_id_value and value.tournament_id=target
  for update;
  current_value := production_control.guide_current_publication_v1(target);
  if draft.state<>'VALIDATED' or draft.draft_version<>expected_draft_version
     or coalesce((draft.validation_diagnostics->>'validated')::boolean,false)
       is not true
     or coalesce((draft.validation_diagnostics->>'validatedDraftVersion')::bigint,0)
       <> expected_draft_version then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','GUIDE_VALIDATED_DRAFT_REQUIRED');
  end if;
  if draft.expected_published_revision<>(current_value->>'revision')::bigint
     or draft.expected_published_revision_id::text is distinct from
       nullif(current_value->>'revisionId','')
     or expected_published_revision<>draft.expected_published_revision
     or (expected_published_revision_id_text<>'' and
       expected_published_revision_id_text is distinct from
         pg_catalog.lower(coalesce(current_value->>'revisionId',''))) then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','GUIDE_PREDECESSOR_STALE',
      'currentRevision',(current_value->>'revision')::bigint);
  end if;
  if authoring_value is distinct from draft.authoring_content
     or projection_value is distinct from draft.projection_payload then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','GUIDE_DRAFT_CONTENT_STALE');
  end if;
  if input->>'canonical_reference_fingerprint' is distinct from
       production_control.guide_canonical_reference_fingerprint_v1(target)
     or draft.canonical_reference_fingerprint is distinct from
       input->>'canonical_reference_fingerprint'
     or draft.validated_canonical_reference_fingerprint is distinct from
       input->>'canonical_reference_fingerprint' then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','GUIDE_CANONICAL_REFERENCE_STALE');
  end if;
  validation := production_control.validate_guide_authoring_v1(
    target,target_year,authoring_value,projection_value,
    input->>'authoring_content_fingerprint',input->>'content_fingerprint',
    input->>'projection_payload_hash');
  if not coalesce((validation->>'pass')::boolean,false) then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','GUIDE_VALIDATION_FAILED','issues',validation->'issues');
  end if;
  if validation->>'authoringContentFingerprint' is distinct from
       draft.authoring_content_fingerprint
     or validation->>'contentFingerprint' is distinct from
       draft.content_fingerprint
     or validation->>'contentFingerprint' is distinct from
       draft.validated_content_fingerprint
     or validation->>'projectionPayloadHash' is distinct from
       draft.projection_payload_hash
     or expected_content_fingerprint is distinct from
       draft.validated_content_fingerprint then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','GUIDE_DRAFT_VALIDATION_STALE');
  end if;
  if current_value->>'projectionPayloadHash' =
       validation->>'projectionPayloadHash' then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','GUIDE_NO_CHANGES');
  end if;

  select value.* into strict annual_pointer
  from production_control.current_tournament_pointer_v1 value
  where value.scope_key='BAGGER_INV_PRODUCTION';
  select value.* into strict resource
  from production_control.resource_scope value
  where value.scope_key='BAGGER_INV_PRODUCTION';
  select value.revision_id into previous_native_revision_id
  from production_control.guide_authoring_current_v1 value
  where value.tournament_id=target;
  next_revision := (current_value->>'revision')::bigint + 1;
  effective_at_value := pg_catalog.clock_timestamp();
  source_value := pg_catalog.jsonb_build_object(
    'tournamentId',target,
    'source',pg_catalog.jsonb_build_object(
      'authoringAuthority','SUPABASE_DIRECTOR',
      'authoringContract','production-guide-authoring-v1',
      'sourceTabs',production_control.guide_authoring_source_tabs_v1(),
      'draftId',draft_id_value,'draftVersion',draft.draft_version));
  source_text := production_control.guide_authoring_canonical_json_v1(
    source_value);
  content_text := production_control.guide_authoring_canonical_json_v1(
    validation->'projectionPayload'->'content');
  payload_text := production_control.guide_authoring_canonical_json_v1(
    validation->'projectionPayload');
  source_hash := pg_catalog.encode(extensions.digest(source_text,'sha256'),'hex');

  if target='2026' then
    insert into production_control.projection_revisions (
      domain,tournament_id,tournament_year,revision_number,
      previous_revision_id,project_ref,project_url,source_workbook_id,
      source_tabs,contract_version,source_fingerprint,payload_fingerprint,
      source_payload,projection_payload,validation_status,
      validation_diagnostics,imported_by,imported_at
    ) values (
      'GUIDE','2026',2026,next_revision,
      legacy_current_projection_id,
      resource.project_ref,resource.project_url,resource.google_workbook_id,
      production_control.guide_authoring_source_tabs_v1(),
      'guide-projection-v1',source_hash,
      validation->>'projectionPayloadHash',source_value,
      validation->'projectionPayload','VALID',
      (validation->'diagnostics')||pg_catalog.jsonb_build_object(
        'authoringAuthority','SUPABASE_DIRECTOR',
        'authoringContract','production-guide-authoring-v1'),
      actor_player,effective_at_value
    ) returning revision_id into production_revision_id;
    insert into production_control.projection_current (
      domain,tournament_id,revision_id,advanced_by,advanced_at
    ) values (
      'GUIDE','2026',production_revision_id,actor_player,effective_at_value
    ) on conflict (domain,tournament_id) do update set
      revision_id=excluded.revision_id,advanced_by=excluded.advanced_by,
      advanced_at=excluded.advanced_at;

    select value.revision_id into guide_revision_id
    from scoring_authority.guide_content_revisions value
    where value.tournament_id='2026'
      and value.content_fingerprint=validation->>'contentFingerprint';
    if guide_revision_id is null then
      insert into scoring_authority.guide_content_revisions (
        tournament_id,projection_revision,source_workbook_id,
        content_fingerprint,source_workbook_fingerprint,payload_hash,
        source_canonical_json,content_canonical_json,payload_canonical_json,
        content_payload,validation_status,source_metadata,
        source_sync_sequence,trigger_type,imported_by,imported_at
      ) values (
        '2026',next_revision,resource.google_workbook_id,
        validation->>'contentFingerprint',source_hash,
        validation->>'projectionPayloadHash',source_text,content_text,
        payload_text,validation->'projectionPayload','VALID',
        pg_catalog.jsonb_build_object(
          'authoringAuthority','SUPABASE_DIRECTOR',
          'authoringContract','production-guide-authoring-v1',
          'draftVersion',draft.draft_version),
        next_revision,'MANUAL',actor_player,effective_at_value
      ) returning revision_id into guide_revision_id;
    end if;
    insert into scoring_authority.guide_projection_current (
      tournament_id,source_workbook_id,revision_id,publication_sequence,
      source_sync_sequence,published_at,last_verified_at
    ) values (
      '2026',resource.google_workbook_id,guide_revision_id,next_revision,
      next_revision,effective_at_value,effective_at_value
    ) on conflict (tournament_id) do update set
      source_workbook_id=excluded.source_workbook_id,
      revision_id=excluded.revision_id,
      publication_sequence=excluded.publication_sequence,
      source_sync_sequence=excluded.source_sync_sequence,
      published_at=excluded.published_at,
      last_verified_at=excluded.last_verified_at;
  else
    select value.* into strict catalog
    from production_control.future_tournament_catalog_v1 value
    where value.tournament_id=target for update;
    select value.* into strict annual_resource
    from production_control.future_tournament_resources_v1 value
    where value.tournament_id=target for share;
    select value.* into promotion
    from production_control.future_runtime_promotions_v2 value
    where value.tournament_id=target;
    select value.* into binding
    from production_control.future_annual_projection_bindings_v1 value
    where value.tournament_id=target and value.domain='GUIDE' for update;
    update production_control.future_tournament_catalog_v1 value set
      lifecycle=case when value.lifecycle='READY_FOR_ACTIVATION'
        then 'CONFIGURING' else value.lifecycle end,
      lifecycle_revision=case when value.lifecycle='READY_FOR_ACTIVATION'
        then value.lifecycle_revision+1 else value.lifecycle_revision end,
      setup_revision=case when promotion.tournament_id is null
        then value.setup_revision+1 else value.setup_revision end,
      readiness_fingerprint=null,readiness_setup_revision=null,
      updated_by_player_id=actor_player,updated_at=effective_at_value
    where value.tournament_id=target;
    next_binding_revision:=coalesce(binding.binding_revision,0)+1;
    insert into production_control.future_annual_projection_bindings_v1 (
      tournament_id,domain,source_workbook_id,source_revision,
      binding_revision,source_fingerprint,payload_fingerprint,projection,
      certification_status,certified_by_player_id,certified_at,
      authoring_authority
    ) values (
      target,'GUIDE',coalesce(annual_resource.source_workbook_id,
        'SUPABASE_DIRECTOR'),next_revision,
      next_binding_revision,source_hash,validation->>'projectionPayloadHash',
      validation->'projectionPayload','CERTIFIED',actor_player,
      effective_at_value,'SUPABASE_DIRECTOR'
    ) on conflict (tournament_id,domain) do update set
      source_workbook_id=excluded.source_workbook_id,
      source_revision=excluded.source_revision,
      binding_revision=excluded.binding_revision,
      source_fingerprint=excluded.source_fingerprint,
      payload_fingerprint=excluded.payload_fingerprint,
      projection=excluded.projection,
      certification_status=excluded.certification_status,
      certified_by_player_id=excluded.certified_by_player_id,
      certified_at=excluded.certified_at,
      authoring_authority=excluded.authoring_authority,
      updated_at=effective_at_value;
  end if;

  insert into production_control.guide_authoring_revisions_v1 (
    tournament_id,tournament_year,revision_number,
    previous_published_revision,previous_published_revision_id,
    previous_native_revision_id,draft_id,authoring_content,
    projection_payload,authoring_content_fingerprint,content_fingerprint,
    projection_payload_hash,validation_diagnostics,
    production_projection_revision_id,guide_content_revision_id,
    annual_binding_revision,published_by_player_id,published_by_auth_user_id,
    published_at
  ) values (
    target,target_year,next_revision,(current_value->>'revision')::bigint,
    nullif(current_value->>'revisionId','')::uuid,previous_native_revision_id,
    draft_id_value,validation->'authoringContent',
    validation->'projectionPayload',validation->>'authoringContentFingerprint',
    validation->>'contentFingerprint',validation->>'projectionPayloadHash',
    (validation->'diagnostics')||pg_catalog.jsonb_build_object(
      'authoringAuthority','SUPABASE_DIRECTOR'),production_revision_id,
    guide_revision_id,case when target='2026' then null
      else next_binding_revision end,actor_player,actor_auth,effective_at_value
  ) returning revision_id into native_revision_id;
  insert into production_control.guide_authoring_revision_provenance_v1 (
    revision_id,tournament_id,authoring_authority,authoring_contract,draft_id,
    actor_player_id,actor_auth_user_id,authoring_kind,source_tournament_id,
    created_at
  ) values (
    native_revision_id,target,'SUPABASE_DIRECTOR',
    'production-guide-authoring-v1',draft_id_value,actor_player,actor_auth,
    draft.authoring_kind,draft.source_tournament_id,effective_at_value);
  insert into production_control.guide_authoring_current_v1 (
    tournament_id,tournament_year,revision_id,revision_number,
    advanced_by_player_id,advanced_by_auth_user_id,advanced_at
  ) values (
    target,target_year,native_revision_id,next_revision,
    actor_player,actor_auth,effective_at_value
  ) on conflict (tournament_id) do update set
    tournament_year=excluded.tournament_year,
    revision_id=excluded.revision_id,revision_number=excluded.revision_number,
    advanced_by_player_id=excluded.advanced_by_player_id,
    advanced_by_auth_user_id=excluded.advanced_by_auth_user_id,
    advanced_at=excluded.advanced_at;
  update production_control.guide_authoring_drafts_v1 set
    state='SUPERSEDED',published_revision_id=null,published_at=null,
    validated_content_fingerprint=null,
    validated_canonical_reference_fingerprint=null,
    updated_at=effective_at_value
  where tournament_id=target and state='PUBLISHED';
  update production_control.guide_authoring_drafts_v1 set
    state='PUBLISHED',draft_version=draft_version+1,
    published_revision_id=native_revision_id,published_at=effective_at_value,
    updated_at=effective_at_value
  where draft_id=draft_id_value;

  response_value:=pg_catalog.jsonb_build_object(
    'ok',true,'code','GUIDE_REVISION_PUBLISHED','idempotent',false,
    'tournamentId',target,'revisionId',native_revision_id,
    'revision',next_revision,
    'previousRevision',(current_value->>'revision')::bigint,
    'authoringAuthority','SUPABASE_DIRECTOR',
    'effectiveAt',effective_at_value,
    'current',pg_catalog.jsonb_build_object(
      'revision',next_revision,'revisionId',native_revision_id,
      'authoringAuthority','SUPABASE_DIRECTOR',
      'projectionPayload',validation->'projectionPayload',
      'contentFingerprint',validation->>'contentFingerprint',
      'projectionPayloadHash',validation->>'projectionPayloadHash'));
  insert into production_control.guide_authoring_audit_events_v1 (
    tournament_id,draft_id,revision_id,action,actor_player_id,
    actor_auth_user_id,summary
  ) values (
    target,draft_id_value,native_revision_id,'REVISION_PUBLISHED',
    actor_player,actor_auth,pg_catalog.jsonb_build_object(
      'revision',next_revision,
      'predecessorRevision',(current_value->>'revision')::bigint,
      'summary','Tournament Guide Revision '||next_revision||' published'));
  insert into production_control.operation_audit_events (
    event_type,domain,tournament_id,actor,request_fingerprint,result,details
  ) values (
    'PRODUCTION_GUIDE_REVISION_PUBLISHED','GUIDE',target,actor_player,null,
    'SUCCEEDED',pg_catalog.jsonb_build_object(
      'revision',next_revision,'authoring_authority','SUPABASE_DIRECTOR'));
  insert into production_control.guide_authoring_operation_receipts_v1 (
    tournament_id,operation,operation_request_id,
    declared_request_payload_hash,request_payload_hash,
    actor_player_id,actor_auth_user_id,response
  ) values (
    target,'PUBLISH',request_id,declared_hash,database_hash,
    actor_player,actor_auth,response_value);
  return response_value;
exception when no_data_found then
  return pg_catalog.jsonb_build_object(
    'ok',false,'code','GUIDE_DRAFT_OR_RESOURCE_NOT_FOUND');
when invalid_text_representation or numeric_value_out_of_range then
  return pg_catalog.jsonb_build_object(
    'ok',false,'code','GUIDE_PUBLISH_INPUT_INVALID');
when unique_violation then
  return pg_catalog.jsonb_build_object(
    'ok',false,'code','GUIDE_OPERATION_CONFLICT');
end;
$publish_guide_draft$;

create function public.discard_production_guide_draft_v1(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $discard_guide_draft$
declare
  target text;
  actor_player text := pg_catalog.upper(pg_catalog.btrim(coalesce(
    input#>>'{authorization,player_id}','')));
  actor_auth uuid;
  request_id uuid;
  draft_id_value uuid;
  expected_draft_version bigint;
  declared_hash text := pg_catalog.lower(pg_catalog.btrim(coalesce(
    input->>'request_payload_hash','')));
  reason_value text := pg_catalog.btrim(coalesce(input->>'reason',''));
  database_hash text;
  prior_receipt jsonb;
  draft production_control.guide_authoring_drafts_v1%rowtype;
  current_value jsonb;
  response_value jsonb;
begin
  target := production_control.assert_guide_authoring_v1(input);
  if input->>'operation' is distinct from
       'DISCARD_PRODUCTION_GUIDE_DRAFT_V1'
     or coalesce(input->>'operation_request_id','')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'draft_id','')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'expected_draft_version','') !~ '^[1-9][0-9]*$'
     or declared_hash !~ '^[0-9a-f]{64}$'
     or reason_value='' or pg_catalog.length(reason_value)>500 then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','GUIDE_DISCARD_INPUT_INVALID');
  end if;
  actor_auth := (input#>>'{authorization,auth_user_id}')::uuid;
  request_id := (input->>'operation_request_id')::uuid;
  draft_id_value := (input->>'draft_id')::uuid;
  expected_draft_version := (input->>'expected_draft_version')::bigint;
  database_hash := production_control.guide_authoring_hash_v1(
    pg_catalog.jsonb_build_object(
      'operation','DISCARD','tournamentId',target,
      'actorPlayerId',actor_player,'actorAuthUserId',actor_auth,
      'draftId',draft_id_value,'expectedDraftVersion',expected_draft_version,
      'reason',reason_value));
  prior_receipt := production_control.guide_operation_receipt_v1(
    target,'DISCARD',request_id,declared_hash,database_hash);
  if prior_receipt is not null then return prior_receipt; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'production-guide-authoring:'||target,0));
  prior_receipt := production_control.guide_operation_receipt_v1(
    target,'DISCARD',request_id,declared_hash,database_hash);
  if prior_receipt is not null then return prior_receipt; end if;
  select value.* into strict draft
  from production_control.guide_authoring_drafts_v1 value
  where value.draft_id=draft_id_value and value.tournament_id=target
  for update;
  current_value := production_control.guide_current_publication_v1(target);
  if draft.state not in ('DRAFT','VALIDATED')
     or draft.draft_version<>expected_draft_version then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','GUIDE_DRAFT_VERSION_STALE',
      'currentDraftVersion',draft.draft_version);
  end if;
  if draft.expected_published_revision<>(current_value->>'revision')::bigint
     or draft.expected_published_revision_id::text is distinct from
       nullif(current_value->>'revisionId','') then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','GUIDE_PREDECESSOR_STALE');
  end if;
  update production_control.guide_authoring_drafts_v1 set
    state='DISCARDED',draft_version=draft_version+1,reason=reason_value,
    validated_content_fingerprint=null,
    validated_canonical_reference_fingerprint=null,
    validated_at=null,discarded_at=pg_catalog.clock_timestamp(),
    updated_at=pg_catalog.clock_timestamp()
  where draft_id=draft_id_value;
  response_value := pg_catalog.jsonb_build_object(
    'ok',true,'code','GUIDE_DRAFT_DISCARDED','idempotent',false,
    'tournamentId',target,'draftId',draft_id_value,
    'draftVersion',expected_draft_version+1,'state','DISCARDED',
    'currentChanged',false);
  insert into production_control.guide_authoring_audit_events_v1 (
    tournament_id,draft_id,action,actor_player_id,actor_auth_user_id,summary
  ) values (
    target,draft_id_value,'DRAFT_DISCARDED',actor_player,actor_auth,
    pg_catalog.jsonb_build_object(
      'draftVersion',expected_draft_version+1,
      'publishedRevisionUnchanged',(current_value->>'revision')::bigint));
  insert into production_control.guide_authoring_operation_receipts_v1 (
    tournament_id,operation,operation_request_id,
    declared_request_payload_hash,request_payload_hash,
    actor_player_id,actor_auth_user_id,response
  ) values (
    target,'DISCARD',request_id,declared_hash,database_hash,
    actor_player,actor_auth,response_value);
  return response_value;
exception when no_data_found then
  return pg_catalog.jsonb_build_object(
    'ok',false,'code','GUIDE_DRAFT_NOT_FOUND');
when invalid_text_representation or numeric_value_out_of_range then
  return pg_catalog.jsonb_build_object(
    'ok',false,'code','GUIDE_DISCARD_INPUT_INVALID');
end;
$discard_guide_draft$;

create function public.copy_previous_production_guide_as_draft_v1(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $copy_previous_guide$
declare
  target text;
  target_year integer;
  source_target text := pg_catalog.btrim(coalesce(
    input->>'source_tournament_id',''));
  source_year integer;
  actor_player text := pg_catalog.upper(pg_catalog.btrim(coalesce(
    input#>>'{authorization,player_id}','')));
  actor_auth uuid;
  request_id uuid;
  declared_hash text := pg_catalog.lower(pg_catalog.btrim(coalesce(
    input->>'request_payload_hash','')));
  expected_revision bigint;
  expected_revision_id_text text := pg_catalog.lower(pg_catalog.btrim(
    coalesce(input->>'expected_published_revision_id','')));
  reason_value text := pg_catalog.btrim(coalesce(input->>'reason',''));
  database_hash text;
  prior_receipt jsonb;
  annual_pointer production_control.current_tournament_pointer_v1%rowtype;
  source_value jsonb;
  current_value jsonb;
  copied_authoring jsonb;
  copied_projection jsonb;
  validation jsonb;
  draft_id_value uuid;
  response_value jsonb;
begin
  target := production_control.assert_guide_authoring_v1(input);
  target_year := target::integer;
  begin source_year := (input->>'source_tournament_year')::integer;
  exception when others then source_year := 0; end;
  if input->>'operation' is distinct from
       'COPY_PREVIOUS_PRODUCTION_GUIDE_AS_DRAFT_V1'
     or coalesce(input->>'operation_request_id','')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
     or declared_hash !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'expected_published_revision','') !~ '^[0-9]+$'
     or source_target !~ '^20[0-9]{2}$'
     or source_target<>source_year::text
     or source_year<>target_year-1
     or reason_value='' or pg_catalog.length(reason_value)>500 then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','GUIDE_COPY_INPUT_INVALID');
  end if;
  select value.* into strict annual_pointer
  from production_control.current_tournament_pointer_v1 value
  where value.scope_key='BAGGER_INV_PRODUCTION';
  if target_year<=annual_pointer.tournament_year then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','GUIDE_COPY_FUTURE_TARGET_REQUIRED');
  end if;
  actor_auth := (input#>>'{authorization,auth_user_id}')::uuid;
  request_id := (input->>'operation_request_id')::uuid;
  expected_revision := (input->>'expected_published_revision')::bigint;
  database_hash := production_control.guide_authoring_hash_v1(
    pg_catalog.jsonb_build_object(
      'operation','COPY_PREVIOUS','tournamentId',target,
      'sourceTournamentId',source_target,'sourceTournamentYear',source_year,
      'actorPlayerId',actor_player,'actorAuthUserId',actor_auth,
      'expectedPublishedRevision',expected_revision,
      'expectedPublishedRevisionId',expected_revision_id_text,
      'reason',reason_value));
  prior_receipt := production_control.guide_operation_receipt_v1(
    target,'COPY_PREVIOUS',request_id,declared_hash,database_hash);
  if prior_receipt is not null then return prior_receipt; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'production-guide-authoring:'||target,0));
  prior_receipt := production_control.guide_operation_receipt_v1(
    target,'COPY_PREVIOUS',request_id,declared_hash,database_hash);
  if prior_receipt is not null then return prior_receipt; end if;
  if exists (select 1
    from production_control.guide_authoring_drafts_v1 value
    where value.tournament_id=target and value.state in ('DRAFT','VALIDATED'))
  then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','GUIDE_OPEN_DRAFT_EXISTS');
  end if;
  source_value := production_control.guide_current_publication_v1(source_target);
  current_value := production_control.guide_current_publication_v1(target);
  if source_value->'projectionPayload' is null
     or (source_value->>'revision')::bigint=0 then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','GUIDE_COPY_SOURCE_REQUIRED');
  end if;
  if (current_value->>'revision')::bigint<>expected_revision
     or (expected_revision_id_text<>'' and expected_revision_id_text
       is distinct from pg_catalog.lower(coalesce(
         current_value->>'revisionId',''))) then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','GUIDE_PREDECESSOR_STALE',
      'currentRevision',(current_value->>'revision')::bigint);
  end if;
  copied_authoring := production_control.guide_clone_authoring_v1(
    source_value->'authoringContent',target,target_year);
  copied_projection := production_control.guide_projection_from_clone_v1(
    copied_authoring,source_value->'projectionPayload',target,target_year);
  validation := production_control.validate_guide_authoring_v1(
    target,target_year,copied_authoring,copied_projection);
  if validation->>'authoringContentFingerprint' is null
     or validation->>'contentFingerprint' is null
     or validation->>'projectionPayloadHash' is null then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','GUIDE_COPY_TARGET_VALIDATION_FAILED',
      'issues',validation->'issues');
  end if;
  insert into production_control.guide_authoring_drafts_v1 (
    tournament_id,tournament_year,draft_version,state,authoring_kind,
    expected_published_revision,expected_published_revision_id,
    source_tournament_id,source_tournament_year,source_revision,
    source_revision_id,authoring_content,projection_payload,
    authoring_content_fingerprint,content_fingerprint,
    projection_payload_hash,canonical_reference_fingerprint,
    validation_diagnostics,reason,created_by_player_id,created_by_auth_user_id
  ) values (
    target,target_year,1,'DRAFT','COPIED_PREVIOUS',expected_revision,
    nullif(expected_revision_id_text,'')::uuid,source_target,source_year,
    (source_value->>'revision')::bigint,
    nullif(source_value->>'revisionId','')::uuid,
    validation->'authoringContent',validation->'projectionPayload',
    validation->>'authoringContentFingerprint',
    validation->>'contentFingerprint',validation->>'projectionPayloadHash',
    production_control.guide_canonical_reference_fingerprint_v1(target),
    (validation->'diagnostics')||pg_catalog.jsonb_build_object(
      'validated',false,'requiresReview',true,
      'sourceTournamentId',source_target,
      'issues',coalesce(validation->'issues','[]'::jsonb),
      'datesAndTimesCopied',false,'contactsCopied',false,
      'publicationStateCopied',false,'auditCopied',false),
    reason_value,actor_player,actor_auth
  ) returning draft_id into draft_id_value;
  response_value := pg_catalog.jsonb_build_object(
    'ok',true,'code','GUIDE_PREVIOUS_GUIDE_COPIED','idempotent',false,
    'tournamentId',target,'sourceTournamentId',source_target,
    'sourceRevision',(source_value->>'revision')::bigint,
    'draftId',draft_id_value,'draftVersion',1,'state','DRAFT',
    'requiresReview',true,'madeCurrent',false,
    'authoringContent',validation->'authoringContent',
    'preview',validation->'projectionPayload',
    'projectionPayload',validation->'projectionPayload');
  insert into production_control.guide_authoring_audit_events_v1 (
    tournament_id,draft_id,action,actor_player_id,actor_auth_user_id,summary
  ) values (
    target,draft_id_value,'PREVIOUS_GUIDE_COPIED',actor_player,actor_auth,
    pg_catalog.jsonb_build_object(
      'draftVersion',1,'sourceTournamentId',source_target,
      'sourceRevision',(source_value->>'revision')::bigint,
      'requiresReview',true,'contactsCopied',false,'madeCurrent',false));
  insert into production_control.operation_audit_events (
    event_type,domain,tournament_id,actor,request_fingerprint,result,details
  ) values (
    'PRODUCTION_GUIDE_PREVIOUS_COPIED','GUIDE',target,actor_player,null,
    'SUCCEEDED',pg_catalog.jsonb_build_object(
      'source_tournament_id',source_target,'requires_review',true,
      'made_current',false));
  insert into production_control.guide_authoring_operation_receipts_v1 (
    tournament_id,operation,operation_request_id,
    declared_request_payload_hash,request_payload_hash,
    actor_player_id,actor_auth_user_id,response
  ) values (
    target,'COPY_PREVIOUS',request_id,declared_hash,database_hash,
    actor_player,actor_auth,response_value);
  return response_value;
exception when no_data_found then
  return pg_catalog.jsonb_build_object(
    'ok',false,'code','GUIDE_COPY_SOURCE_OR_RESOURCE_REQUIRED');
when invalid_text_representation or numeric_value_out_of_range then
  return pg_catalog.jsonb_build_object(
    'ok',false,'code','GUIDE_COPY_INPUT_INVALID');
when unique_violation then
  return pg_catalog.jsonb_build_object(
    'ok',false,'code','GUIDE_OPERATION_CONFLICT');
end;
$copy_previous_guide$;

-- Retire only Guide from both current and future Production Google
-- synchronization. The wrapper chain continues to enforce the previously
-- retired Prediction Settings and Draft domains and delegates retained domains.
alter function public.synchronize_production_director_projection(jsonb)
  rename to sync_prod_director_projection_before_guide_retirement_v1;
revoke all on function
  public.sync_prod_director_projection_before_guide_retirement_v1(jsonb)
from public, anon, authenticated, service_role;

create function public.synchronize_production_director_projection(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $retire_current_guide_google_sync$
begin
  if pg_catalog.upper(pg_catalog.btrim(coalesce(input->>'domain','')))='GUIDE'
  then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','GUIDE_GOOGLE_AUTHORING_RETIRED',
      'authoringAuthority','SUPABASE',
      'googleClassification','LEGACY_NON_AUTHORITATIVE');
  end if;
  return public.sync_prod_director_projection_before_guide_retirement_v1(
    input);
end;
$retire_current_guide_google_sync$;

alter function public.synchronize_production_future_annual_projection_v1(jsonb)
  rename to sync_prod_future_projection_before_guide_retirement_v1;
revoke all on function
  public.sync_prod_future_projection_before_guide_retirement_v1(jsonb)
from public, anon, authenticated, service_role;

create function public.synchronize_production_future_annual_projection_v1(
  input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $retire_future_guide_google_sync$
begin
  if pg_catalog.upper(pg_catalog.btrim(coalesce(input->>'domain','')))='GUIDE'
  then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','GUIDE_GOOGLE_AUTHORING_RETIRED',
      'authoringAuthority','SUPABASE',
      'googleClassification','LEGACY_NON_AUTHORITATIVE');
  end if;
  return public.sync_prod_future_projection_before_guide_retirement_v1(input);
end;
$retire_future_guide_google_sync$;

-- The legacy import functions remain as preserved implementation evidence but
-- have no Production transport grant after Guide retirement.
revoke all on function public.import_production_guide_projection(jsonb)
from public, anon, authenticated, service_role;
revoke all on function
  public.import_production_guide_projection_dormant_internal(jsonb)
from public, anon, authenticated, service_role;

revoke all on function
  production_control.reject_guide_authoring_immutable_v1(),
  production_control.guide_authoring_source_tabs_v1(),
  production_control.guide_authoring_canonical_json_v1(jsonb),
  production_control.guide_authoring_hash_v1(jsonb),
  production_control.guide_date_valid_v1(text,integer),
  production_control.guide_time_valid_v1(text),
  production_control.guide_url_valid_v1(text,boolean),
  production_control.assert_guide_authoring_v1(jsonb),
  production_control.guide_current_publication_v1(text),
  production_control.guide_operation_receipt_v1(text,text,uuid,text,text),
  production_control.guide_canonical_rounds_v1(text),
  production_control.guide_canonical_course_context_v1(text),
  production_control.guide_canonical_reference_fingerprint_v1(text),
  production_control.guide_scalar_values_v1(jsonb),
  production_control.validate_guide_authoring_v1(
    text,integer,jsonb,jsonb,text,text,text
  ),
  production_control.guide_authoring_with_item_ids_v1(jsonb),
  production_control.guide_clone_authoring_v1(jsonb,text,integer),
  production_control.guide_projection_from_clone_v1(jsonb,jsonb,text,integer)
from public, anon, authenticated, service_role;

revoke all on function
  public.read_production_guide_authoring_v1(jsonb),
  public.create_production_guide_draft_v1(jsonb),
  public.update_production_guide_draft_v1(jsonb),
  public.validate_production_guide_draft_v1(jsonb),
  public.preview_production_guide_draft_v1(jsonb),
  public.publish_production_guide_draft_v1(jsonb),
  public.discard_production_guide_draft_v1(jsonb),
  public.copy_previous_production_guide_as_draft_v1(jsonb),
  public.synchronize_production_director_projection(jsonb),
  public.synchronize_production_future_annual_projection_v1(jsonb)
from public, anon, authenticated, service_role;

grant execute on function
  public.read_production_guide_authoring_v1(jsonb),
  public.create_production_guide_draft_v1(jsonb),
  public.update_production_guide_draft_v1(jsonb),
  public.validate_production_guide_draft_v1(jsonb),
  public.preview_production_guide_draft_v1(jsonb),
  public.publish_production_guide_draft_v1(jsonb),
  public.discard_production_guide_draft_v1(jsonb),
  public.copy_previous_production_guide_as_draft_v1(jsonb),
  public.synchronize_production_director_projection(jsonb),
  public.synchronize_production_future_annual_projection_v1(jsonb)
to service_role;

comment on function public.read_production_guide_authoring_v1(jsonb)
is 'Director-only annual Tournament Guide authoring read. Returns published history, one isolated draft, canonical Round/Course references, and sanitized audit without Google access.';

comment on function public.preview_production_guide_draft_v1(jsonb)
is 'Director-only validated Tournament Guide draft preview. It is read-only and never advances a public or participant current pointer.';

comment on function public.publish_production_guide_draft_v1(jsonb)
is 'Director-only, optimistic, idempotent Tournament Guide publication. It revalidates exact content and canonical references before atomically advancing the year-scoped Supabase projection.';

notify pgrst, 'reload schema';
commit;
