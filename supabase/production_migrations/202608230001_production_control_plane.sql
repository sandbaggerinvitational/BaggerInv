-- Step 10A Production control plane. No application authority is activated.
begin;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create schema if not exists production_control;
revoke all on schema production_control from public, anon, authenticated;
grant usage on schema production_control to service_role;

create table production_control.resource_scope (
  scope_key text primary key check (scope_key = 'BAGGER_INV_PRODUCTION'),
  project_ref text not null check (project_ref = 'ymqhhtxaywtqllynrmxe'),
  project_url text not null check (project_url = 'https://ymqhhtxaywtqllynrmxe.supabase.co'),
  google_workbook_id text not null check (google_workbook_id = '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4'),
  vercel_project text not null check (vercel_project = 'bagger-inv'),
  canonical_domain text not null check (canonical_domain = 'https://baggerinv.com'),
  current_tournament_id text not null check (current_tournament_id = '2026'),
  current_tournament_year integer not null check (current_tournament_year = 2026),
  current_tournament_read_authority text not null default 'GOOGLE' check (current_tournament_read_authority = 'GOOGLE'),
  scoring_authority text not null default 'GOOGLE' check (scoring_authority = 'GOOGLE'),
  participant_identity_authority text not null default 'PASSPORT' check (participant_identity_authority = 'PASSPORT'),
  public_supabase_reads_enabled boolean not null default false check (not public_supabase_reads_enabled),
  scoring_ingress_enabled boolean not null default false check (not scoring_ingress_enabled),
  google_writes_enabled boolean not null default false check (not google_writes_enabled),
  auth_user_creation_enabled boolean not null default false check (not auth_user_creation_enabled),
  odds_publication_enabled boolean not null default false check (not odds_publication_enabled),
  workers_enabled boolean not null default false check (not workers_enabled),
  contract_version text not null default 'production-foundation-v1',
  created_at timestamptz not null default now()
);

insert into production_control.resource_scope (
  scope_key, project_ref, project_url, google_workbook_id, vercel_project,
  canonical_domain, current_tournament_id, current_tournament_year
)
values (
  'BAGGER_INV_PRODUCTION', 'ymqhhtxaywtqllynrmxe',
  'https://ymqhhtxaywtqllynrmxe.supabase.co',
  '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4', 'bagger-inv',
  'https://baggerinv.com', '2026', 2026
);

create table production_control.tournament_scopes (
  tournament_id text not null,
  tournament_year integer not null check (tournament_year between 2017 and 2026),
  source_workbook_id text not null check (source_workbook_id = '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4'),
  scope_kind text not null check (scope_kind in ('COMPLETED_HISTORY','CURRENT_TOURNAMENT')),
  active_for_shadow_import boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (tournament_id, tournament_year, source_workbook_id),
  unique (tournament_year, source_workbook_id),
  check ((tournament_year = 2026 and tournament_id = '2026' and scope_kind = 'CURRENT_TOURNAMENT')
      or (tournament_year between 2017 and 2025 and tournament_id = tournament_year::text and scope_kind = 'COMPLETED_HISTORY'))
);

insert into production_control.tournament_scopes
  (tournament_id, tournament_year, source_workbook_id, scope_kind)
select y::text, y, '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4',
       case when y = 2026 then 'CURRENT_TOURNAMENT' else 'COMPLETED_HISTORY' end
from generate_series(2017, 2026) as y;

create table production_control.import_runs (
  import_run_id uuid primary key default extensions.gen_random_uuid(),
  domain text not null check (domain in (
    'COMPLETED_HISTORY','CURRENT_TOURNAMENT','CURRENT_SCORING_SHADOW','GUIDE',
    'PLAYER_EDITORIAL','PREDICTION_SETTINGS','DRAFT','HANDICAP_CONFIGURATION',
    'NET_SKINS_CONFIGURATION','CALCUTTA_CONFIGURATION','PUBLISHED_ODDS'
  )),
  tournament_id text not null,
  tournament_year integer not null,
  source_workbook_id text not null,
  source_fingerprint text not null check (source_fingerprint ~ '^[0-9a-f]{64}$'),
  payload_fingerprint text not null check (payload_fingerprint ~ '^[0-9a-f]{64}$'),
  database_fingerprint text check (database_fingerprint is null or database_fingerprint ~ '^[0-9a-f]{64}$'),
  importer_contract text not null,
  correction_registry_version text,
  actor text not null,
  status text not null default 'PENDING' check (status in ('PENDING','RUNNING','SUCCEEDED','FAILED','DUPLICATE')),
  previous_import_run_id uuid references production_control.import_runs(import_run_id),
  error_code text,
  error_message text,
  counts jsonb not null default '{}'::jsonb check (jsonb_typeof(counts) = 'object'),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  foreign key (tournament_id, tournament_year, source_workbook_id)
    references production_control.tournament_scopes(tournament_id, tournament_year, source_workbook_id),
  unique (domain, tournament_id, tournament_year, source_workbook_id, source_fingerprint, payload_fingerprint),
  check ((domain = 'COMPLETED_HISTORY' and tournament_year between 2017 and 2025 and tournament_id = tournament_year::text)
      or (domain <> 'COMPLETED_HISTORY' and tournament_year = 2026 and tournament_id = '2026')),
  check ((status in ('SUCCEEDED','FAILED','DUPLICATE') and completed_at is not null)
      or (status in ('PENDING','RUNNING') and completed_at is null)),
  check (status <> 'SUCCEEDED' or database_fingerprint is not null)
);

create table production_control.worker_controls (
  worker_name text primary key,
  enabled boolean not null default false check (not enabled),
  scheduler_installed boolean not null default false check (not scheduler_installed),
  google_writes_allowed boolean not null default false check (not google_writes_allowed),
  last_verified_at timestamptz,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object')
);

insert into production_control.worker_controls (worker_name) values
  ('SCORING_GOOGLE_OUTBOX'),
  ('ROUND_SCORECARDS_ARCHIVE'),
  ('GUIDE_SYNCHRONIZATION'),
  ('DRAFT_SYNCHRONIZATION'),
  ('PREDICTION_SETTINGS_SYNCHRONIZATION'),
  ('ODDS_CALCULATION'),
  ('ODDS_GOOGLE_MIRROR'),
  ('NET_SKINS_RECALCULATION'),
  ('CALCUTTA_RECALCULATION'),
  ('COMPETITION_DERIVED');

create table production_control.operation_audit_events (
  event_id bigint generated always as identity primary key,
  event_type text not null,
  domain text not null,
  tournament_id text,
  actor text not null,
  request_fingerprint text,
  result text not null,
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default now()
);

create table production_control.director_entitlements (
  entitlement_id uuid primary key default extensions.gen_random_uuid(),
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  tournament_id text not null,
  player_id text,
  role text not null check (role in ('DIRECTOR','OWNER')),
  status text not null default 'ACTIVE' check (status in ('ACTIVE','REVOKED')),
  granted_by text not null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (auth_user_id, tournament_id),
  check ((status = 'ACTIVE' and revoked_at is null) or (status = 'REVOKED' and revoked_at is not null))
);

create table production_control.director_entitlement_events (
  event_id bigint generated always as identity primary key,
  entitlement_id uuid not null references production_control.director_entitlements(entitlement_id),
  action text not null check (action in ('GRANTED','REVOKED','VERIFIED')),
  actor text not null,
  reason text,
  created_at timestamptz not null default now()
);

create table production_control.provider_readiness (
  provider text primary key check (provider in ('SUPABASE_AUTH','RESEND_SMTP','TWILIO_SMS','CLOUDFLARE_TURNSTILE','GOOGLE_SERVICE_ACCOUNT','VERCEL')),
  status text not null check (status in ('STRUCTURAL_ONLY','CONFIGURED_PHYSICAL_TEST_PENDING','CONFIGURED_AND_CERTIFIED','OWNER_ACTION_REQUIRED')),
  secret_present boolean not null default false,
  physical_test_completed boolean not null default false,
  notes text,
  updated_at timestamptz not null default now()
);

insert into production_control.provider_readiness (provider,status,notes) values
  ('SUPABASE_AUTH','STRUCTURAL_ONLY','Site URL and safe Auth defaults prepared; participant authority remains Passport.'),
  ('RESEND_SMTP','OWNER_ACTION_REQUIRED','Custom SMTP is not configured in the dormant Production Auth project.'),
  ('TWILIO_SMS','OWNER_ACTION_REQUIRED','Phone provider is disabled and unconfigured.'),
  ('CLOUDFLARE_TURNSTILE','OWNER_ACTION_REQUIRED','Bot Protection is disabled pending exact Production key configuration.'),
  ('GOOGLE_SERVICE_ACCOUNT','CONFIGURED_PHYSICAL_TEST_PENDING','Current live Production Google integration remains unchanged.'),
  ('VERCEL','CONFIGURED_PHYSICAL_TEST_PENDING','Live deployment remains the legacy Google/Passport application.');

alter table production_control.resource_scope enable row level security;
alter table production_control.tournament_scopes enable row level security;
alter table production_control.import_runs enable row level security;
alter table production_control.worker_controls enable row level security;
alter table production_control.operation_audit_events enable row level security;
alter table production_control.director_entitlements enable row level security;
alter table production_control.director_entitlement_events enable row level security;
alter table production_control.provider_readiness enable row level security;

revoke all on all tables in schema production_control from public, anon, authenticated, service_role;
revoke all on all sequences in schema production_control from public, anon, authenticated, service_role;
grant select on all tables in schema production_control to service_role;
grant usage, select on all sequences in schema production_control to service_role;
alter default privileges in schema production_control revoke all on tables from public, anon, authenticated;
alter default privileges in schema production_control revoke all on sequences from public, anon, authenticated;
alter default privileges in schema production_control revoke all on functions from public, anon, authenticated;

commit;
