-- Step 13E.8A: Supabase-native, annual Prediction Settings authoring V1.
--
-- Installation is inert. It does not create or supersede an Odds input
-- configuration, calculation job, publication, snapshot, worker job, or
-- current-tournament record. Historical Google-imported configurations retain
-- their original rows and provenance. Only an explicit Director stage,
-- validate, and commit operation can create the next settings revision.
begin;

do $dependencies$
begin
  if pg_catalog.to_regprocedure(
       'production_control.assert_annual_future_admin_scope_v1(jsonb,text,boolean,boolean)'
     ) is null
     or pg_catalog.to_regprocedure(
       'production_control.annual_odds_pairing_fingerprint_v1(text)'
     ) is null
     or pg_catalog.to_regprocedure(
       'public.synchronize_production_director_projection(jsonb)'
     ) is null
     or pg_catalog.to_regprocedure(
       'public.synchronize_production_future_annual_projection_v1(jsonb)'
     ) is null then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_PREDICTION_SETTINGS_AUTHORING_DEPENDENCY_REQUIRED';
  end if;
end;
$dependencies$;

create table production_control.prediction_setting_definitions_v1 (
  setting_key text primary key,
  sort_order integer not null unique check (sort_order between 1 and 30),
  category text not null check (category in (
    'category-weight', 'player-component', 'handicap-component',
    'scorecard-calibration', 'runtime-model'
  )),
  value_type text not null check (value_type in (
    'number', 'integer', 'boolean', 'enum', 'string'
  )),
  default_value jsonb not null,
  minimum_value numeric,
  maximum_value numeric,
  allowed_values jsonb not null default '[]'::jsonb check (
    pg_catalog.jsonb_typeof(allowed_values) = 'array'
  ),
  aliases jsonb not null default '[]'::jsonb check (
    pg_catalog.jsonb_typeof(aliases) = 'array'
  ),
  legacy_recalibration_default boolean not null default false,
  check (minimum_value is null or maximum_value is null
    or minimum_value <= maximum_value)
);

insert into production_control.prediction_setting_definitions_v1 (
  setting_key, sort_order, category, value_type, default_value,
  minimum_value, maximum_value, allowed_values, aliases,
  legacy_recalibration_default
) values
  ('Handicap Category Weight',1,'category-weight','number','12',null,null,'[]','[]',true),
  ('Player Category Weight',2,'category-weight','number','42',null,null,'[]','[]',true),
  ('Team Category Weight',3,'category-weight','number','28',null,null,'[]','[]',true),
  ('Opponent Category Weight',4,'category-weight','number','13',null,null,'[]','[]',true),
  ('Tournament Category Weight',5,'category-weight','number','5',null,null,'[]','[]',true),
  ('Format Win Percentage',6,'player-component','number','28',null,null,'[]','["Player - Format Win Percentage Weight"]',true),
  ('Overall Win Percentage',7,'player-component','number','22',null,null,'[]','["Player - Overall Win Percentage Weight"]',true),
  ('Recent Form',8,'player-component','number','15',null,null,'[]','["Player - Recent Form Weight"]',true),
  ('Average Points Per Match',9,'player-component','number','10',null,null,'[]','["Player - Average Points Per Match Weight"]',true),
  ('Career Points',10,'player-component','number','5',null,null,'[]','["Player - Career Points Weight"]',true),
  ('Tournament Experience',11,'player-component','number','5',null,null,'[]','["Player - Tournament Experience Weight"]',true),
  ('Sandbagger Rating',12,'player-component','number','15',null,null,'[]','["Player - Sandbagger Rating Weight"]',true),
  ('Net Stroke Advantage',13,'handicap-component','number','20',null,null,'[]','["Handicap - Net Stroke Advantage Weight"]',true),
  ('Front 9 Stroke Advantage',14,'handicap-component','number','27',null,null,'[]','["Handicap - Front 9 Stroke Advantage Weight"]',true),
  ('Back 9 Stroke Advantage',15,'handicap-component','number','27',null,null,'[]','["Handicap - Back 9 Stroke Advantage Weight"]',true),
  ('Stroke Hole Distribution',16,'handicap-component','number','26',null,null,'[]','["Handicap - Stroke Hole Distribution Weight"]',true),
  ('Better Player Handicap Difference',17,'handicap-component','number','5',null,null,'[]','[]',true),
  ('Lesser Player Handicap Difference',18,'handicap-component','number','1',null,null,'[]','[]',true),
  ('Underlying Skill Points Per Handicap',19,'handicap-component','number','0.5',null,null,'[]','[]',true),
  ('Maximum Underlying Skill Adjustment',20,'handicap-component','number','8',null,null,'[]','[]',true),
  ('Scorecard Influence Enabled',21,'scorecard-calibration','boolean','false',null,null,'[]','[]',true),
  ('Scorecard Category Weight',22,'scorecard-calibration','number','10',0,null,'[]','[]',true),
  ('Maximum Scorecard Adjustment',23,'scorecard-calibration','number','6',0,null,'[]','[]',true),
  ('Minimum Scorecard Confidence',24,'scorecard-calibration','enum','"Moderate"',null,null,'["Insufficient","Limited","Moderate","Strong"]','[]',true),
  ('Minimum Scorecard Recorded Rounds',25,'scorecard-calibration','integer','2',0,null,'[]','[]',true),
  ('Minimum Scorecard Recorded Holes',26,'scorecard-calibration','integer','36',0,null,'[]','[]',true),
  ('Maximum Win Probability',27,'runtime-model','number','90',0,100,'[]','[]',true),
  ('Minimum Win Probability',28,'runtime-model','number','10',0,100,'[]','[]',true),
  ('Minimum Matches for Full Confidence',29,'runtime-model','number','8',0,null,'[]','[]',true),
  ('Prediction Model',30,'runtime-model','string','"SBI v1.0"',null,null,'[]','[]',true);

-- Existing annual projection rows were Google-authored.  Add an explicit
-- classification without changing their content or certification.  A future
-- Director commit changes only the target Prediction Settings row to the new
-- authority; Guide and Draft remain on their existing Google workflow.
alter table production_control.future_annual_projection_bindings_v1
  add column authoring_authority text not null default 'GOOGLE_IMPORT'
  check (authoring_authority in ('GOOGLE_IMPORT', 'SUPABASE_DIRECTOR')),
  add constraint future_annual_projection_authoring_domain_v1 check (
    authoring_authority = 'GOOGLE_IMPORT'
    or domain = 'PREDICTION_SETTINGS'
  );

create table production_control.prediction_settings_drafts_v1 (
  draft_id uuid primary key default extensions.gen_random_uuid(),
  tournament_id text not null references scoring_authority.tournaments(
    tournament_id
  ) on delete restrict,
  draft_revision bigint not null check (draft_revision > 0),
  state text not null check (state in (
    'STAGED', 'VALIDATED', 'COMMITTED', 'SUPERSEDED'
  )),
  authoring_kind text not null check (authoring_kind in (
    'DIRECTOR_EDIT', 'COPIED_PREVIOUS'
  )),
  expected_configuration_revision bigint not null check (
    expected_configuration_revision >= 0
  ),
  predecessor_configuration_id uuid references
    scoring_authority.odds_input_configurations(id) on delete restrict,
  source_tournament_id text references scoring_authority.tournaments(
    tournament_id
  ) on delete restrict,
  source_configuration_id uuid references
    scoring_authority.odds_input_configurations(id) on delete restrict,
  canonical_settings jsonb not null check (
    pg_catalog.jsonb_typeof(canonical_settings) = 'object'
  ),
  effective_settings jsonb not null check (
    pg_catalog.jsonb_typeof(effective_settings) = 'object'
  ),
  settings_fingerprint text not null check (
    settings_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  effective_settings_fingerprint text not null check (
    effective_settings_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  changed_keys jsonb not null check (
    pg_catalog.jsonb_typeof(changed_keys) = 'array'
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
  validated_at timestamptz,
  committed_configuration_id uuid references
    scoring_authority.odds_input_configurations(id) on delete restrict,
  committed_at timestamptz,
  unique (tournament_id, draft_revision),
  check ((state = 'COMMITTED' and committed_configuration_id is not null
      and committed_at is not null)
    or (state <> 'COMMITTED' and committed_configuration_id is null
      and committed_at is null))
);

create unique index production_prediction_settings_open_draft_v1
  on production_control.prediction_settings_drafts_v1(tournament_id)
  where state in ('STAGED', 'VALIDATED');

create table production_control.prediction_settings_revision_provenance_v1 (
  configuration_id uuid primary key references
    scoring_authority.odds_input_configurations(id) on delete restrict,
  tournament_id text not null references scoring_authority.tournaments(
    tournament_id
  ) on delete restrict,
  authoring_authority text not null check (
    authoring_authority = 'SUPABASE_DIRECTOR'
  ),
  authoring_contract text not null check (
    authoring_contract = 'production-prediction-settings-authoring-v1'
  ),
  draft_id uuid not null unique references
    production_control.prediction_settings_drafts_v1(draft_id)
    on delete restrict,
  actor_player_id text not null references scoring_authority.players(player_id)
    on delete restrict,
  actor_auth_user_id uuid not null references auth.users(id) on delete restrict,
  changed_setting_count integer not null check (
    changed_setting_count between 1 and 30
  ),
  created_at timestamptz not null default pg_catalog.clock_timestamp()
);

create table production_control.prediction_settings_operation_receipts_v1 (
  receipt_id uuid not null default extensions.gen_random_uuid() unique,
  tournament_id text not null references scoring_authority.tournaments(
    tournament_id
  ) on delete restrict,
  operation text not null check (operation in (
    'STAGE', 'COMMIT', 'COPY_PREVIOUS'
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

create table production_control.prediction_settings_audit_events_v1 (
  event_id uuid primary key default extensions.gen_random_uuid(),
  tournament_id text not null references scoring_authority.tournaments(
    tournament_id
  ) on delete restrict,
  draft_id uuid references production_control.prediction_settings_drafts_v1(
    draft_id
  ) on delete restrict,
  configuration_id uuid references scoring_authority.odds_input_configurations(
    id
  ) on delete restrict,
  action text not null check (action in (
    'REVISION_STAGED', 'REVISION_VALIDATED', 'REVISION_COMMITTED',
    'PREVIOUS_CONFIGURATION_COPIED'
  )),
  actor_player_id text not null references scoring_authority.players(player_id)
    on delete restrict,
  actor_auth_user_id uuid not null references auth.users(id) on delete restrict,
  operation_request_id uuid,
  request_payload_hash text check (
    request_payload_hash is null or request_payload_hash ~ '^[0-9a-f]{64}$'
  ),
  summary jsonb not null check (pg_catalog.jsonb_typeof(summary) = 'object'),
  created_at timestamptz not null default pg_catalog.clock_timestamp()
);

alter table production_control.prediction_setting_definitions_v1
  enable row level security;
alter table production_control.prediction_settings_drafts_v1
  enable row level security;
alter table production_control.prediction_settings_revision_provenance_v1
  enable row level security;
alter table production_control.prediction_settings_operation_receipts_v1
  enable row level security;
alter table production_control.prediction_settings_audit_events_v1
  enable row level security;

revoke all on table
  production_control.prediction_setting_definitions_v1,
  production_control.prediction_settings_drafts_v1,
  production_control.prediction_settings_revision_provenance_v1,
  production_control.prediction_settings_operation_receipts_v1,
  production_control.prediction_settings_audit_events_v1
from public, anon, authenticated, service_role;

create function production_control.reject_prediction_settings_immutable_v1()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin
  raise exception using errcode = '55000',
    message = 'PRODUCTION_PREDICTION_SETTINGS_IMMUTABLE_RECORD';
end;
$$;

create trigger production_prediction_setting_definition_immutable_v1
before update or delete on production_control.prediction_setting_definitions_v1
for each row execute function
  production_control.reject_prediction_settings_immutable_v1();
create trigger production_prediction_settings_provenance_immutable_v1
before update or delete on
  production_control.prediction_settings_revision_provenance_v1
for each row execute function
  production_control.reject_prediction_settings_immutable_v1();
create trigger production_prediction_settings_receipt_immutable_v1
before update or delete on
  production_control.prediction_settings_operation_receipts_v1
for each row execute function
  production_control.reject_prediction_settings_immutable_v1();
create trigger production_prediction_settings_audit_immutable_v1
before update or delete on
  production_control.prediction_settings_audit_events_v1
for each row execute function
  production_control.reject_prediction_settings_immutable_v1();

create function production_control.prediction_settings_hash_v1(value jsonb)
returns text language sql immutable
set search_path = pg_catalog, extensions as $$
  select pg_catalog.encode(extensions.digest(value::text, 'sha256'), 'hex')
$$;

create function production_control.validate_prediction_settings_v1(
  proposed jsonb,
  predecessor jsonb default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $validate_prediction_settings$
declare
  definition production_control.prediction_setting_definitions_v1%rowtype;
  setting_value jsonb;
  issues jsonb := '[]'::jsonb;
  effective jsonb;
  defaults jsonb;
  rows_value jsonb;
  changed jsonb;
  legacy_profile boolean := false;
begin
  if pg_catalog.jsonb_typeof(proposed) is distinct from 'object' then
    return pg_catalog.jsonb_build_object(
      'pass', false,
      'issues', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'code', 'PREDICTION_SETTINGS_COMPLETE_SCHEMA_REQUIRED'
      ))
    );
  end if;
  if (select pg_catalog.count(*) from pg_catalog.jsonb_object_keys(proposed))
       <> 30
     or exists (
       select 1 from pg_catalog.jsonb_object_keys(proposed) key_value
       where not exists (
         select 1
         from production_control.prediction_setting_definitions_v1 value
         where value.setting_key = key_value
       )
     ) then
    issues := issues || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'PREDICTION_SETTINGS_COMPLETE_SCHEMA_REQUIRED'
      )
    );
  end if;
  for definition in
    select value.*
    from production_control.prediction_setting_definitions_v1 value
    order by value.sort_order
  loop
    if not (proposed ? definition.setting_key) then
      issues := issues || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'code', 'PREDICTION_SETTINGS_MISSING_SETTING',
          'key', definition.setting_key
        )
      );
      continue;
    end if;
    setting_value := proposed -> (definition.setting_key);
    if definition.value_type in ('number', 'integer') then
      if pg_catalog.jsonb_typeof(setting_value) <> 'number' then
        issues := issues || pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object(
            'code', 'PREDICTION_SETTINGS_VALUE_TYPE_INVALID',
            'key', definition.setting_key,
            'expectedType', definition.value_type
          )
        );
      elsif definition.value_type = 'integer'
        and (setting_value#>>'{}')::numeric <>
          pg_catalog.trunc((setting_value#>>'{}')::numeric) then
        issues := issues || pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object(
            'code', 'PREDICTION_SETTINGS_INTEGER_REQUIRED',
            'key', definition.setting_key
          )
        );
      elsif definition.minimum_value is not null
        and (setting_value#>>'{}')::numeric < definition.minimum_value then
        issues := issues || pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object(
            'code', 'PREDICTION_SETTINGS_VALUE_BELOW_MINIMUM',
            'key', definition.setting_key,
            'minimum', definition.minimum_value
          )
        );
      elsif definition.maximum_value is not null
        and (setting_value#>>'{}')::numeric > definition.maximum_value then
        issues := issues || pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object(
            'code', 'PREDICTION_SETTINGS_VALUE_ABOVE_MAXIMUM',
            'key', definition.setting_key,
            'maximum', definition.maximum_value
          )
        );
      end if;
    elsif definition.value_type = 'boolean' and
      pg_catalog.jsonb_typeof(setting_value) <> 'boolean' then
      issues := issues || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'code', 'PREDICTION_SETTINGS_VALUE_TYPE_INVALID',
          'key', definition.setting_key,
          'expectedType', 'boolean'
        )
      );
    elsif definition.value_type in ('enum', 'string') then
      if pg_catalog.jsonb_typeof(setting_value) <> 'string'
         or pg_catalog.btrim(setting_value#>>'{}') = '' then
        issues := issues || pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object(
            'code', 'PREDICTION_SETTINGS_VALUE_TYPE_INVALID',
            'key', definition.setting_key,
            'expectedType', definition.value_type
          )
        );
      elsif definition.value_type = 'enum' and not exists (
        select 1
        from pg_catalog.jsonb_array_elements_text(
          definition.allowed_values
        ) allowed(value)
        where allowed.value = setting_value#>>'{}'
      ) then
        issues := issues || pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object(
            'code', 'PREDICTION_SETTINGS_ENUM_INVALID',
            'key', definition.setting_key,
            'allowedValues', definition.allowed_values
          )
        );
      end if;
    end if;
  end loop;
  select pg_catalog.jsonb_object_agg(value.setting_key, value.default_value)
    into defaults
  from production_control.prediction_setting_definitions_v1 value
  where value.legacy_recalibration_default;
  legacy_profile :=
    proposed->'Handicap Category Weight' = '15'::jsonb
    and proposed->'Player Category Weight' = '35'::jsonb
    and proposed->'Team Category Weight' = '30'::jsonb
    and proposed->'Opponent Category Weight' = '15'::jsonb
    and proposed->'Tournament Category Weight' = '5'::jsonb
    and proposed->'Better Player Handicap Difference' = '2'::jsonb
    and proposed->'Lesser Player Handicap Difference' = '2'::jsonb;
  effective := proposed || case when legacy_profile then defaults
    else '{}'::jsonb end;
  if pg_catalog.jsonb_typeof(effective->'Minimum Win Probability') = 'number'
     and pg_catalog.jsonb_typeof(effective->'Maximum Win Probability') = 'number'
     and (effective->>'Minimum Win Probability')::numeric >
       (effective->>'Maximum Win Probability')::numeric then
    issues := issues || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'PREDICTION_SETTINGS_PROBABILITY_BOUNDS_REVERSED'
      )
    );
  end if;
  select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'Setting', value.setting_key,
    'Value', proposed -> (value.setting_key)
  ) order by value.sort_order) into rows_value
  from production_control.prediction_setting_definitions_v1 value;
  select coalesce(pg_catalog.jsonb_agg(value.setting_key order by value.sort_order),
    '[]'::jsonb) into changed
  from production_control.prediction_setting_definitions_v1 value
  where predecessor is null
    or predecessor -> (value.setting_key) is distinct from
      proposed -> (value.setting_key);
  return pg_catalog.jsonb_build_object(
    'pass', pg_catalog.jsonb_array_length(issues) = 0,
    'issues', issues,
    'canonicalSettings', proposed,
    'effectiveSettings', effective,
    'settingsRows', rows_value,
    'settingsFingerprint', production_control.prediction_settings_hash_v1(
      rows_value
    ),
    'effectiveSettingsFingerprint',
      production_control.prediction_settings_hash_v1(effective),
    'changedKeys', changed,
    'changedSettingCount', pg_catalog.jsonb_array_length(changed),
    'legacyRecalibrationProfile', legacy_profile
  );
exception when invalid_text_representation or numeric_value_out_of_range then
  return pg_catalog.jsonb_build_object(
    'pass', false,
    'issues', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'code', 'PREDICTION_SETTINGS_VALUE_TYPE_INVALID'
    ))
  );
end;
$validate_prediction_settings$;

create function production_control.assert_prediction_settings_authoring_v1(
  input jsonb
)
returns text
language plpgsql
security definer
set search_path = pg_catalog
as $prediction_settings_scope$
declare
  pointer production_control.current_tournament_pointer_v1%rowtype;
  target text := pg_catalog.btrim(coalesce(
    input->>'target_tournament_id', ''
  ));
begin
  perform production_control.assert_annual_future_admin_scope_v1(
    input, 'production-prediction-settings-authoring-v1', true, false
  );
  select value.* into strict pointer
  from production_control.current_tournament_pointer_v1 value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  if target !~ '^20[0-9]{2}$' then
    raise exception using errcode = '22023',
      message = 'PREDICTION_SETTINGS_TOURNAMENT_REQUIRED';
  end if;
  if target = pointer.tournament_id then
    if not exists (
      select 1
      from production_control.future_tournament_catalog_v1 value
      where value.tournament_id = target
        and value.tournament_year = target::integer
        and value.lifecycle = 'ACTIVE'
        and value.lifecycle_revision = pointer.lifecycle_revision
    ) then
      raise exception using errcode = '55000',
        message = 'PREDICTION_SETTINGS_CURRENT_TOURNAMENT_REQUIRED';
    end if;
  elsif not exists (
    select 1
    from production_control.future_tournament_catalog_v1 catalog
    join production_control.future_tournament_resources_v1 resource
      on resource.tournament_id = catalog.tournament_id
    where catalog.tournament_id = target
      and catalog.tournament_year = target::integer
      and catalog.tournament_year > pointer.tournament_year
      and catalog.lifecycle in (
        'DRAFT', 'CONFIGURING', 'READY_FOR_ACTIVATION'
      )
      and resource.project_ref = input->>'project_ref'
      and resource.project_url = input->>'project_url'
      and resource.project_ref !~* '(preview|staging|test)'
  ) then
    raise exception using errcode = '42501',
      message = 'PREDICTION_SETTINGS_FUTURE_TOURNAMENT_REQUIRED';
  end if;
  return target;
end;
$prediction_settings_scope$;

create function production_control.prediction_settings_receipt_v1(
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
as $prediction_settings_receipt$
declare
  receipt production_control.prediction_settings_operation_receipts_v1%rowtype;
begin
  select value.* into receipt
  from production_control.prediction_settings_operation_receipts_v1 value
  where value.tournament_id = target
    and value.operation = operation_value
    and value.operation_request_id = request_id;
  if not found then return null; end if;
  if receipt.declared_request_payload_hash = declared_hash
     and receipt.request_payload_hash = database_hash then
    return receipt.response || pg_catalog.jsonb_build_object(
      'idempotent', true
    );
  end if;
  return pg_catalog.jsonb_build_object(
    'ok', false,
    'code', 'PREDICTION_SETTINGS_IDEMPOTENCY_CONFLICT'
  );
end;
$prediction_settings_receipt$;

create function public.read_production_prediction_settings_authoring_v1(
  input jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $read_prediction_settings_authoring$
declare
  target text;
  history_limit_value integer := coalesce((input->>'history_limit')::integer, 30);
  config scoring_authority.odds_input_configurations%rowtype;
  draft production_control.prediction_settings_drafts_v1%rowtype;
  current_authority text;
  history_value jsonb;
  latest_job scoring_authority.odds_calculation_jobs%rowtype;
  publication scoring_authority.odds_publication_current%rowtype;
  calculation_current boolean := false;
  published_configuration_revision bigint := 0;
begin
  target := production_control.assert_prediction_settings_authoring_v1(input);
  if input->>'operation' is distinct from
       'READ_PRODUCTION_PREDICTION_SETTINGS_AUTHORING_V1'
     or history_limit_value not between 1 and 50 then
    raise exception using errcode = '22023',
      message = 'PREDICTION_SETTINGS_READ_INPUT_INVALID';
  end if;
  select value.* into config
  from scoring_authority.odds_input_configurations value
  where value.tournament_id = target and value.is_current;
  select value.* into draft
  from production_control.prediction_settings_drafts_v1 value
  where value.tournament_id = target
    and value.state in ('STAGED', 'VALIDATED')
  order by value.draft_revision desc limit 1;
  select value.* into latest_job
  from scoring_authority.odds_calculation_jobs value
  where value.tournament_id = target
  order by value.requested_at desc, value.job_id desc limit 1;
  select value.* into publication
  from scoring_authority.odds_publication_current value
  where value.tournament_id = target;
  calculation_current := config.id is not null and exists (
    select 1 from scoring_authority.odds_calculation_jobs value
    where value.tournament_id = target
      and value.input_configuration_id = config.id
      and value.status = 'SUCCEEDED'
  );
  begin
    published_configuration_revision := coalesce(
      (publication.source_calculation_revision->>'configuration_revision')::bigint,
      0
    );
  exception when others then published_configuration_revision := 0;
  end;
  current_authority := case when exists (
    select 1
    from production_control.prediction_settings_revision_provenance_v1 value
    where value.configuration_id = config.id
  ) then 'SUPABASE_DIRECTOR' else 'GOOGLE_IMPORT' end;
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'configurationId', value.id,
    'revision', value.configuration_revision,
    'authoringAuthority', case when provenance.configuration_id is null
      then 'GOOGLE_IMPORT' else provenance.authoring_authority end,
    'actorPlayerId', provenance.actor_player_id,
    'changedSettingCount', provenance.changed_setting_count,
    'effectiveAt', coalesce(value.synchronized_at, value.imported_at),
    'current', value.is_current
  ) order by value.configuration_revision desc), '[]'::jsonb)
  into history_value
  from (
    select history.*
    from scoring_authority.odds_input_configurations history
    where history.tournament_id = target
    order by history.configuration_revision desc
    limit history_limit_value
  ) value
  left join production_control.prediction_settings_revision_provenance_v1 provenance
    on provenance.configuration_id = value.id;
  return pg_catalog.jsonb_build_object(
    'ok', true,
    'data', pg_catalog.jsonb_build_object(
      'contractVersion', 'production-prediction-settings-authoring-v1',
      'settingsContractVersion', 'prediction-settings-v1',
      'tournamentId', target,
      'current', case when config.id is null then null else
        pg_catalog.jsonb_build_object(
          'configurationId', config.id,
          'revision', config.configuration_revision,
          'canonicalSettings', config.canonical_settings,
          'effectiveSettings', config.effective_settings,
          'authoringAuthority', current_authority,
          'effectiveAt', coalesce(config.synchronized_at, config.imported_at)
        ) end,
      'draft', case when draft.draft_id is null then null else
        pg_catalog.jsonb_build_object(
          'draftId', draft.draft_id,
          'draftRevision', draft.draft_revision,
          'state', draft.state,
          'authoringKind', draft.authoring_kind,
          'expectedConfigurationRevision',
            draft.expected_configuration_revision,
          'canonicalSettings', draft.canonical_settings,
          'effectiveSettings', draft.effective_settings,
          'changedKeys', draft.changed_keys,
          'changedSettingCount',
            pg_catalog.jsonb_array_length(draft.changed_keys),
          'createdAt', draft.created_at,
          'validatedAt', draft.validated_at
        ) end,
      'history', history_value,
      'relationship', pg_catalog.jsonb_build_object(
        'recalculationRequired', config.id is not null
          and not calculation_current,
        'latestCalculationJobId', latest_job.job_id,
        'latestCalculationStatus', latest_job.status,
        'latestCalculationSettingsRevision', coalesce(
          (latest_job.source_revision->>'configuration_revision')::bigint,
          0
        ),
        'publishedRevision', coalesce(publication.publication_revision, 0),
        'publishedSettingsRevision', published_configuration_revision,
        'publicationState', coalesce(
          publication.publication_state, 'UNPUBLISHED'
        ),
        'publishedSnapshotUnchanged', true,
        'automaticCalculationRequested', false,
        'automaticPublicationRequested', false
      ),
      'googleAuthoring', pg_catalog.jsonb_build_object(
        'productionStatus', 'RETIRED',
        'classification', 'LEGACY_NON_AUTHORITATIVE'
      )
    )
  );
exception when invalid_text_representation or numeric_value_out_of_range then
  raise exception using errcode = '22023',
    message = 'PREDICTION_SETTINGS_READ_INPUT_INVALID';
end;
$read_prediction_settings_authoring$;

create function public.stage_production_prediction_settings_revision_v1(
  input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $stage_prediction_settings$
declare
  target text;
  actor_player text := pg_catalog.upper(pg_catalog.btrim(coalesce(
    input#>>'{authorization,player_id}', ''
  )));
  actor_auth uuid;
  request_id uuid;
  declared_hash text := pg_catalog.lower(pg_catalog.btrim(coalesce(
    input->>'request_payload_hash', ''
  )));
  expected_revision bigint;
  current_config scoring_authority.odds_input_configurations%rowtype;
  validation jsonb;
  database_hash text;
  prior_receipt jsonb;
  next_draft_revision bigint;
  draft_id_value uuid;
  response_value jsonb;
  reason_value text := pg_catalog.btrim(coalesce(input->>'reason', ''));
begin
  target := production_control.assert_prediction_settings_authoring_v1(input);
  if input->>'operation' is distinct from
       'STAGE_PRODUCTION_PREDICTION_SETTINGS_REVISION_V1'
     or coalesce(input->>'operation_request_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
     or declared_hash !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'expected_configuration_revision', '')
       !~ '^[0-9]+$'
     or pg_catalog.jsonb_typeof(input->'canonical_settings')
       is distinct from 'object'
     or reason_value = '' or pg_catalog.length(reason_value) > 500 then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'PREDICTION_SETTINGS_INPUT_INVALID'
    );
  end if;
  actor_auth := (input#>>'{authorization,auth_user_id}')::uuid;
  request_id := (input->>'operation_request_id')::uuid;
  expected_revision := (input->>'expected_configuration_revision')::bigint;
  database_hash := production_control.prediction_settings_hash_v1(
    pg_catalog.jsonb_build_object(
      'operation', 'STAGE', 'tournamentId', target,
      'actorPlayerId', actor_player, 'actorAuthUserId', actor_auth,
      'expectedConfigurationRevision', expected_revision,
      'canonicalSettings', input->'canonical_settings',
      'reason', reason_value
    )
  );
  prior_receipt := production_control.prediction_settings_receipt_v1(
    target, 'STAGE', request_id, declared_hash, database_hash
  );
  if prior_receipt is not null then return prior_receipt; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'production-prediction-settings:' || target, 0
  ));
  prior_receipt := production_control.prediction_settings_receipt_v1(
    target, 'STAGE', request_id, declared_hash, database_hash
  );
  if prior_receipt is not null then return prior_receipt; end if;
  select value.* into current_config
  from scoring_authority.odds_input_configurations value
  where value.tournament_id = target and value.is_current for update;
  if coalesce(current_config.configuration_revision, 0) <> expected_revision then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'PREDICTION_SETTINGS_PREDECESSOR_STALE',
      'currentRevision', coalesce(current_config.configuration_revision, 0)
    );
  end if;
  validation := production_control.validate_prediction_settings_v1(
    input->'canonical_settings', current_config.canonical_settings
  );
  if not coalesce((validation->>'pass')::boolean, false) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'PREDICTION_SETTINGS_VALIDATION_FAILED',
      'issues', validation->'issues'
    );
  end if;
  if coalesce((validation->>'changedSettingCount')::integer, 0) = 0 then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'PREDICTION_SETTINGS_NO_CHANGES'
    );
  end if;
  update production_control.prediction_settings_drafts_v1 set
    state = 'SUPERSEDED'
  where tournament_id = target and state in ('STAGED', 'VALIDATED');
  select coalesce(pg_catalog.max(value.draft_revision), 0) + 1
    into next_draft_revision
  from production_control.prediction_settings_drafts_v1 value
  where value.tournament_id = target;
  insert into production_control.prediction_settings_drafts_v1 (
    tournament_id, draft_revision, state, authoring_kind,
    expected_configuration_revision, predecessor_configuration_id,
    canonical_settings, effective_settings, settings_fingerprint,
    effective_settings_fingerprint, changed_keys,
    validation_diagnostics, reason, created_by_player_id,
    created_by_auth_user_id
  ) values (
    target, next_draft_revision, 'STAGED', 'DIRECTOR_EDIT',
    expected_revision, current_config.id,
    validation->'canonicalSettings', validation->'effectiveSettings',
    validation->>'settingsFingerprint',
    validation->>'effectiveSettingsFingerprint',
    validation->'changedKeys',
    pg_catalog.jsonb_build_object(
      'contractVersion', 'production-prediction-settings-authoring-v1',
      'settingsContractVersion', 'prediction-settings-v1',
      'completeSchema', true,
      'legacyRecalibrationProfile',
        coalesce((validation->>'legacyRecalibrationProfile')::boolean, false),
      'issues', '[]'::jsonb
    ),
    reason_value, actor_player, actor_auth
  ) returning draft_id into draft_id_value;
  response_value := pg_catalog.jsonb_build_object(
    'ok', true,
    'code', 'PREDICTION_SETTINGS_REVISION_STAGED',
    'idempotent', false,
    'tournamentId', target,
    'draftId', draft_id_value,
    'draftRevision', next_draft_revision,
    'state', 'STAGED',
    'expectedConfigurationRevision', expected_revision,
    'changedKeys', validation->'changedKeys',
    'changedSettingCount',
      (validation->>'changedSettingCount')::integer,
    'recalculationRequiredAfterCommit', true
  );
  insert into production_control.prediction_settings_audit_events_v1 (
    tournament_id, draft_id, action, actor_player_id,
    actor_auth_user_id, operation_request_id, request_payload_hash, summary
  ) values (
    target, draft_id_value, 'REVISION_STAGED', actor_player, actor_auth,
    request_id, database_hash, pg_catalog.jsonb_build_object(
      'draftRevision', next_draft_revision,
      'predecessorConfigurationRevision', expected_revision,
      'changedSettingCount',
        (validation->>'changedSettingCount')::integer
    )
  );
  insert into production_control.prediction_settings_operation_receipts_v1 (
    tournament_id, operation, operation_request_id,
    declared_request_payload_hash, request_payload_hash,
    actor_player_id, actor_auth_user_id, response
  ) values (
    target, 'STAGE', request_id, declared_hash, database_hash,
    actor_player, actor_auth, response_value
  );
  return response_value;
exception when invalid_text_representation or numeric_value_out_of_range then
  return pg_catalog.jsonb_build_object(
    'ok', false, 'code', 'PREDICTION_SETTINGS_INPUT_INVALID'
  );
end;
$stage_prediction_settings$;

create function public.validate_production_prediction_settings_revision_v1(
  input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $validate_prediction_settings_draft$
declare
  target text;
  draft_id_value uuid;
  expected_revision bigint;
  draft production_control.prediction_settings_drafts_v1%rowtype;
  current_config scoring_authority.odds_input_configurations%rowtype;
  validation jsonb;
begin
  target := production_control.assert_prediction_settings_authoring_v1(input);
  if input->>'operation' is distinct from
       'VALIDATE_PRODUCTION_PREDICTION_SETTINGS_REVISION_V1'
     or coalesce(input->>'draft_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'expected_configuration_revision', '')
       !~ '^[0-9]+$' then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'PREDICTION_SETTINGS_INPUT_INVALID'
    );
  end if;
  draft_id_value := (input->>'draft_id')::uuid;
  expected_revision := (input->>'expected_configuration_revision')::bigint;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'production-prediction-settings:' || target, 0
  ));
  select value.* into strict draft
  from production_control.prediction_settings_drafts_v1 value
  where value.draft_id = draft_id_value
    and value.tournament_id = target for update;
  select value.* into current_config
  from scoring_authority.odds_input_configurations value
  where value.tournament_id = target and value.is_current for update;
  if coalesce(current_config.configuration_revision, 0) <> expected_revision
     or draft.expected_configuration_revision <> expected_revision
     or draft.state not in ('STAGED', 'VALIDATED') then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'PREDICTION_SETTINGS_PREDECESSOR_STALE'
    );
  end if;
  validation := production_control.validate_prediction_settings_v1(
    draft.canonical_settings, current_config.canonical_settings
  );
  if not coalesce((validation->>'pass')::boolean, false) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'PREDICTION_SETTINGS_VALIDATION_FAILED',
      'issues', validation->'issues'
    );
  end if;
  if coalesce((validation->>'changedSettingCount')::integer, 0) = 0 then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'PREDICTION_SETTINGS_NO_CHANGES'
    );
  end if;
  update production_control.prediction_settings_drafts_v1 set
    state = 'VALIDATED',
    effective_settings = validation->'effectiveSettings',
    settings_fingerprint = validation->>'settingsFingerprint',
    effective_settings_fingerprint =
      validation->>'effectiveSettingsFingerprint',
    changed_keys = validation->'changedKeys',
    validation_diagnostics = validation_diagnostics ||
      pg_catalog.jsonb_build_object('validated', true),
    validated_at = coalesce(validated_at, pg_catalog.clock_timestamp())
  where draft_id = draft_id_value;
  if draft.state = 'STAGED' then
    insert into production_control.prediction_settings_audit_events_v1 (
      tournament_id, draft_id, action, actor_player_id,
      actor_auth_user_id, summary
    ) values (
      target, draft_id_value, 'REVISION_VALIDATED',
      pg_catalog.upper(input#>>'{authorization,player_id}'),
      (input#>>'{authorization,auth_user_id}')::uuid,
      pg_catalog.jsonb_build_object(
        'draftRevision', draft.draft_revision,
        'changedSettingCount',
          (validation->>'changedSettingCount')::integer
      )
    );
  end if;
  return pg_catalog.jsonb_build_object(
    'ok', true,
    'code', 'PREDICTION_SETTINGS_REVISION_VALIDATED',
    'idempotent', draft.state = 'VALIDATED',
    'draftId', draft_id_value,
    'draftRevision', draft.draft_revision,
    'state', 'VALIDATED',
    'canonicalSettings', draft.canonical_settings,
    'effectiveSettings', validation->'effectiveSettings',
    'changedKeys', validation->'changedKeys',
    'changedSettingCount',
      (validation->>'changedSettingCount')::integer
  );
exception when no_data_found then
  return pg_catalog.jsonb_build_object(
    'ok', false, 'code', 'PREDICTION_SETTINGS_DRAFT_NOT_FOUND'
  );
end;
$validate_prediction_settings_draft$;

create function public.commit_production_prediction_settings_revision_v1(
  input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $commit_prediction_settings$
declare
  target text;
  actor_player text := pg_catalog.upper(pg_catalog.btrim(coalesce(
    input#>>'{authorization,player_id}', ''
  )));
  actor_auth uuid;
  request_id uuid;
  draft_id_value uuid;
  declared_hash text := pg_catalog.lower(pg_catalog.btrim(coalesce(
    input->>'request_payload_hash', ''
  )));
  expected_revision bigint;
  database_hash text;
  prior_receipt jsonb;
  draft production_control.prediction_settings_drafts_v1%rowtype;
  current_config scoring_authority.odds_input_configurations%rowtype;
  seed_config scoring_authority.odds_input_configurations%rowtype;
  pointer production_control.current_tournament_pointer_v1%rowtype;
  catalog production_control.future_tournament_catalog_v1%rowtype;
  promotion production_control.future_runtime_promotions_v2%rowtype;
  resource production_control.future_tournament_resources_v1%rowtype;
  binding production_control.future_annual_projection_bindings_v1%rowtype;
  validation jsonb;
  pairing_fingerprint_value text;
  next_revision bigint;
  next_binding_revision bigint;
  next_bundle text;
  source_fingerprint_value text;
  source_workbook_value text;
  projection_value jsonb;
  payload_fingerprint_value text;
  configuration_id_value uuid;
  response_value jsonb;
begin
  target := production_control.assert_prediction_settings_authoring_v1(input);
  if input->>'operation' is distinct from
       'COMMIT_PRODUCTION_PREDICTION_SETTINGS_REVISION_V1'
     or coalesce(input->>'operation_request_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'draft_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
     or declared_hash !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'expected_configuration_revision', '')
       !~ '^[0-9]+$'
     or input->>'confirmation' is distinct from
       'SAVE PREDICTION SETTINGS REVISION' then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'PREDICTION_SETTINGS_COMMIT_INPUT_INVALID'
    );
  end if;
  actor_auth := (input#>>'{authorization,auth_user_id}')::uuid;
  request_id := (input->>'operation_request_id')::uuid;
  draft_id_value := (input->>'draft_id')::uuid;
  expected_revision := (input->>'expected_configuration_revision')::bigint;
  database_hash := production_control.prediction_settings_hash_v1(
    pg_catalog.jsonb_build_object(
      'operation', 'COMMIT', 'tournamentId', target,
      'actorPlayerId', actor_player, 'actorAuthUserId', actor_auth,
      'draftId', draft_id_value,
      'expectedConfigurationRevision', expected_revision,
      'confirmation', input->>'confirmation'
    )
  );
  prior_receipt := production_control.prediction_settings_receipt_v1(
    target, 'COMMIT', request_id, declared_hash, database_hash
  );
  if prior_receipt is not null then return prior_receipt; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'production-prediction-settings:' || target, 0
  ));
  prior_receipt := production_control.prediction_settings_receipt_v1(
    target, 'COMMIT', request_id, declared_hash, database_hash
  );
  if prior_receipt is not null then return prior_receipt; end if;
  select value.* into strict draft
  from production_control.prediction_settings_drafts_v1 value
  where value.draft_id = draft_id_value
    and value.tournament_id = target for update;
  select value.* into current_config
  from scoring_authority.odds_input_configurations value
  where value.tournament_id = target and value.is_current for update;
  if coalesce(current_config.configuration_revision, 0) <> expected_revision
     or draft.expected_configuration_revision <> expected_revision then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'PREDICTION_SETTINGS_PREDECESSOR_STALE'
    );
  end if;
  if draft.state <> 'VALIDATED' then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'PREDICTION_SETTINGS_DRAFT_NOT_VALIDATED'
    );
  end if;
  validation := production_control.validate_prediction_settings_v1(
    draft.canonical_settings, current_config.canonical_settings
  );
  if not coalesce((validation->>'pass')::boolean, false)
     or coalesce((validation->>'changedSettingCount')::integer, 0) = 0 then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'PREDICTION_SETTINGS_VALIDATION_FAILED',
      'issues', validation->'issues'
    );
  end if;
  select value.* into strict pointer
  from production_control.current_tournament_pointer_v1 value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  if current_config.id is not null then
    seed_config := current_config;
  else
    select value.* into strict seed_config
    from scoring_authority.odds_input_configurations value
    where value.tournament_id = pointer.tournament_id
      and value.is_current and value.validation_status = 'VALID';
  end if;
  if target = pointer.tournament_id then
    pairing_fingerprint_value := seed_config.pairing_fingerprint;
    source_workbook_value := seed_config.source_workbook_id;
  else
    select value.* into strict catalog
    from production_control.future_tournament_catalog_v1 value
    where value.tournament_id = target for update;
    select value.* into promotion
    from production_control.future_runtime_promotions_v2 value
    where value.tournament_id = target;
    select value.* into strict resource
    from production_control.future_tournament_resources_v1 value
    where value.tournament_id = target
      and value.source_workbook_id is not null
      and value.resource_status = 'CURRENT_RESOURCE_BOUND'
    for share;
    select value.* into binding
    from production_control.future_annual_projection_bindings_v1 value
    where value.tournament_id = target
      and value.domain = 'PREDICTION_SETTINGS'
    for update;

    -- Match the installed annual-projection invalidation semantics.  Before
    -- promotion, Prediction Settings are part of the setup manifest and
    -- advance setup revision.  After promotion, the promoted structure stays
    -- immutable, but readiness is cleared and a Ready candidate is returned
    -- to Configuring for explicit review.
    update production_control.future_tournament_catalog_v1 value set
      lifecycle = case when value.lifecycle = 'READY_FOR_ACTIVATION'
        then 'CONFIGURING' else value.lifecycle end,
      lifecycle_revision = case
        when value.lifecycle = 'READY_FOR_ACTIVATION'
          then value.lifecycle_revision + 1
        else value.lifecycle_revision end,
      setup_revision = case when promotion.tournament_id is null
        then value.setup_revision + 1 else value.setup_revision end,
      readiness_fingerprint = null,
      readiness_setup_revision = null,
      updated_by_player_id = actor_player,
      updated_at = pg_catalog.clock_timestamp()
    where value.tournament_id = target;
    select value.* into strict catalog
    from production_control.future_tournament_catalog_v1 value
    where value.tournament_id = target;

    source_workbook_value := resource.source_workbook_id;
    pairing_fingerprint_value := production_control
      .annual_odds_pairing_fingerprint_v1(target);
  end if;
  select coalesce(pg_catalog.max(value.configuration_revision), 0) + 1
    into next_revision
  from scoring_authority.odds_input_configurations value
  where value.tournament_id = target;
  source_fingerprint_value := production_control.prediction_settings_hash_v1(
    pg_catalog.jsonb_build_object(
      'contractVersion', 'production-prediction-settings-authoring-v1',
      'authoringAuthority', 'SUPABASE_DIRECTOR',
      'tournamentId', target,
      'configurationRevision', next_revision,
      'canonicalSettings', validation->'canonicalSettings'
    )
  );
  next_bundle := production_control.prediction_settings_hash_v1(
    pg_catalog.jsonb_build_object(
      'contractVersion', 'production-odds-input-bundle-v1',
      'tournamentId', target,
      'configurationRevision', next_revision,
      'settingsFingerprint', validation->>'settingsFingerprint',
      'effectiveSettingsFingerprint',
        validation->>'effectiveSettingsFingerprint',
      'ratingsFingerprint', seed_config.ratings_fingerprint,
      'pairingFingerprint', pairing_fingerprint_value,
      'previousConfigurationId', current_config.id
    )
  );
  update scoring_authority.odds_input_configurations set
    is_current = false,
    superseded_at = pg_catalog.clock_timestamp()
  where tournament_id = target and is_current;
  insert into scoring_authority.odds_input_configurations (
    tournament_id, configuration_revision, source_workbook_id,
    settings, historical_ratings, settings_fingerprint,
    ratings_fingerprint, pairing_fingerprint, bundle_fingerprint,
    is_current, imported_by, source_tab, source_fingerprint,
    canonical_settings, effective_settings,
    effective_settings_fingerprint, settings_contract_version,
    validation_status, validation_diagnostics, synchronized_at,
    previous_configuration_id
  ) values (
    target, next_revision, source_workbook_value,
    validation->'settingsRows', seed_config.historical_ratings,
    validation->>'settingsFingerprint', seed_config.ratings_fingerprint,
    pairing_fingerprint_value, next_bundle, true,
    'Production Director ' || actor_player, 'Prediction Settings',
    source_fingerprint_value, validation->'canonicalSettings',
    validation->'effectiveSettings',
    validation->>'effectiveSettingsFingerprint',
    'prediction-settings-v1', 'VALID',
    pg_catalog.jsonb_build_object(
      'authoringAuthority', 'SUPABASE_DIRECTOR',
      'authoringContract', 'production-prediction-settings-authoring-v1',
      'completeSchema', true,
      'legacyRecalibrationProfile',
        (validation->>'legacyRecalibrationProfile')::boolean,
      'changedSettingCount',
        (validation->>'changedSettingCount')::integer,
      'annualSetupRevision', case when target = pointer.tournament_id
        then null else catalog.setup_revision end,
      'annualProjectionBindingRevision', case
        when target = pointer.tournament_id then null
        else coalesce(binding.binding_revision, 0) + 1 end,
      'automaticCalculationRequested', false,
      'automaticPublicationRequested', false
    ),
    pg_catalog.clock_timestamp(), current_config.id
  ) returning id into configuration_id_value;

  if target <> pointer.tournament_id then
    next_binding_revision := coalesce(binding.binding_revision, 0) + 1;
    projection_value := pg_catalog.jsonb_build_object(
      'environment', 'PRODUCTION',
      'tournament_id', target,
      'tournament_year', catalog.tournament_year,
      'source_workbook_id', source_workbook_value,
      'source_tab', 'Prediction Settings',
      'source_revision', next_revision,
      'settings', validation->'settingsRows',
      'source_fingerprint', source_fingerprint_value,
      'settings_fingerprint', validation->>'settingsFingerprint',
      'canonical_settings', validation->'canonicalSettings',
      'effective_settings', validation->'effectiveSettings',
      'effective_settings_fingerprint',
        validation->>'effectiveSettingsFingerprint',
      'settings_contract_version', 'prediction-settings-v1',
      'validation_status', 'VALID',
      'validation_diagnostics', pg_catalog.jsonb_build_object(
        'authoringAuthority', 'SUPABASE_DIRECTOR',
        'authoringContract',
          'production-prediction-settings-authoring-v1',
        'annualSetupRevision', catalog.setup_revision,
        'annualProjectionBindingRevision', next_binding_revision,
        'completeSchema', true
      ),
      'authoring_authority', 'SUPABASE_DIRECTOR'
    );
    payload_fingerprint_value := production_control
      .prediction_settings_hash_v1(projection_value);
    insert into production_control.future_annual_projection_bindings_v1 (
      tournament_id, domain, source_workbook_id, source_revision,
      binding_revision, source_fingerprint, payload_fingerprint,
      projection, certification_status, certified_by_player_id,
      certified_at, authoring_authority
    ) values (
      target, 'PREDICTION_SETTINGS', source_workbook_value, next_revision,
      next_binding_revision, source_fingerprint_value,
      payload_fingerprint_value, projection_value, 'CERTIFIED',
      actor_player, pg_catalog.clock_timestamp(), 'SUPABASE_DIRECTOR'
    ) on conflict (tournament_id, domain) do update set
      source_workbook_id = excluded.source_workbook_id,
      source_revision = excluded.source_revision,
      binding_revision = excluded.binding_revision,
      source_fingerprint = excluded.source_fingerprint,
      payload_fingerprint = excluded.payload_fingerprint,
      projection = excluded.projection,
      certification_status = excluded.certification_status,
      certified_by_player_id = excluded.certified_by_player_id,
      certified_at = excluded.certified_at,
      authoring_authority = excluded.authoring_authority,
      updated_at = pg_catalog.clock_timestamp();
  end if;
  insert into production_control.prediction_settings_revision_provenance_v1 (
    configuration_id, tournament_id, authoring_authority,
    authoring_contract, draft_id, actor_player_id, actor_auth_user_id,
    changed_setting_count
  ) values (
    configuration_id_value, target, 'SUPABASE_DIRECTOR',
    'production-prediction-settings-authoring-v1', draft_id_value,
    actor_player, actor_auth,
    (validation->>'changedSettingCount')::integer
  );
  update production_control.prediction_settings_drafts_v1 set
    state = 'COMMITTED',
    committed_configuration_id = configuration_id_value,
    committed_at = pg_catalog.clock_timestamp()
  where draft_id = draft_id_value;
  response_value := pg_catalog.jsonb_build_object(
    'ok', true,
    'code', 'PREDICTION_SETTINGS_REVISION_COMMITTED',
    'idempotent', false,
    'tournamentId', target,
    'configurationId', configuration_id_value,
    'configurationRevision', next_revision,
    'changedKeys', validation->'changedKeys',
    'changedSettingCount',
      (validation->>'changedSettingCount')::integer,
    'recalculationRequired', true,
    'automaticCalculationRequested', false,
    'automaticPublicationRequested', false,
    'publishedSnapshotUnchanged', true,
    'authoringAuthority', 'SUPABASE_DIRECTOR'
  );
  insert into production_control.prediction_settings_audit_events_v1 (
    tournament_id, draft_id, configuration_id, action,
    actor_player_id, actor_auth_user_id, operation_request_id,
    request_payload_hash, summary
  ) values (
    target, draft_id_value, configuration_id_value,
    'REVISION_COMMITTED', actor_player, actor_auth, request_id,
    database_hash, pg_catalog.jsonb_build_object(
      'configurationRevision', next_revision,
      'predecessorConfigurationRevision', expected_revision,
      'changedSettingCount',
        (validation->>'changedSettingCount')::integer,
      'recalculationRequired', true,
      'automaticCalculationRequested', false,
      'automaticPublicationRequested', false
    )
  );
  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint,
    result, details
  ) values (
    'PRODUCTION_PREDICTION_SETTINGS_REVISION_COMMITTED',
    'PREDICTION_SETTINGS', target, actor_player, database_hash,
    'SUCCEEDED', pg_catalog.jsonb_build_object(
      'configuration_revision', next_revision,
      'changed_setting_count',
        (validation->>'changedSettingCount')::integer,
      'authoring_authority', 'SUPABASE_DIRECTOR',
      'recalculation_required', true,
      'automatic_calculation_requested', false,
      'automatic_publication_requested', false
    )
  );
  insert into production_control.prediction_settings_operation_receipts_v1 (
    tournament_id, operation, operation_request_id,
    declared_request_payload_hash, request_payload_hash,
    actor_player_id, actor_auth_user_id, response
  ) values (
    target, 'COMMIT', request_id, declared_hash, database_hash,
    actor_player, actor_auth, response_value
  );
  return response_value;
exception when no_data_found then
  return pg_catalog.jsonb_build_object(
    'ok', false, 'code', 'PREDICTION_SETTINGS_ODDS_CONTEXT_REQUIRED'
  );
when unique_violation then
  return pg_catalog.jsonb_build_object(
    'ok', false, 'code', 'PREDICTION_SETTINGS_OPERATION_CONFLICT'
  );
end;
$commit_prediction_settings$;

create function public.copy_production_prediction_settings_draft_v1(
  input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $copy_prediction_settings$
declare
  target text;
  source_target text := pg_catalog.btrim(coalesce(
    input->>'source_tournament_id', ''
  ));
  actor_player text := pg_catalog.upper(pg_catalog.btrim(coalesce(
    input#>>'{authorization,player_id}', ''
  )));
  actor_auth uuid;
  request_id uuid;
  declared_hash text := pg_catalog.lower(pg_catalog.btrim(coalesce(
    input->>'request_payload_hash', ''
  )));
  expected_revision bigint;
  database_hash text;
  prior_receipt jsonb;
  pointer production_control.current_tournament_pointer_v1%rowtype;
  source_config scoring_authority.odds_input_configurations%rowtype;
  target_config scoring_authority.odds_input_configurations%rowtype;
  validation jsonb;
  next_draft_revision bigint;
  draft_id_value uuid;
  response_value jsonb;
  reason_value text := pg_catalog.btrim(coalesce(input->>'reason', ''));
begin
  target := production_control.assert_prediction_settings_authoring_v1(input);
  if input->>'operation' is distinct from
       'COPY_PRODUCTION_PREDICTION_SETTINGS_DRAFT_V1'
     or coalesce(input->>'operation_request_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
     or declared_hash !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'expected_configuration_revision', '')
       !~ '^[0-9]+$'
     or source_target !~ '^20[0-9]{2}$'
     or reason_value = '' or pg_catalog.length(reason_value) > 500 then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'PREDICTION_SETTINGS_INPUT_INVALID'
    );
  end if;
  select value.* into strict pointer
  from production_control.current_tournament_pointer_v1 value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  if target = pointer.tournament_id
     or source_target <> pointer.tournament_id then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'code', 'PREDICTION_SETTINGS_COPY_SOURCE_NOT_PREVIOUS_CURRENT'
    );
  end if;
  actor_auth := (input#>>'{authorization,auth_user_id}')::uuid;
  request_id := (input->>'operation_request_id')::uuid;
  expected_revision := (input->>'expected_configuration_revision')::bigint;
  database_hash := production_control.prediction_settings_hash_v1(
    pg_catalog.jsonb_build_object(
      'operation', 'COPY_PREVIOUS', 'tournamentId', target,
      'sourceTournamentId', source_target,
      'actorPlayerId', actor_player, 'actorAuthUserId', actor_auth,
      'expectedConfigurationRevision', expected_revision,
      'reason', reason_value
    )
  );
  prior_receipt := production_control.prediction_settings_receipt_v1(
    target, 'COPY_PREVIOUS', request_id, declared_hash, database_hash
  );
  if prior_receipt is not null then return prior_receipt; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'production-prediction-settings:' || target, 0
  ));
  prior_receipt := production_control.prediction_settings_receipt_v1(
    target, 'COPY_PREVIOUS', request_id, declared_hash, database_hash
  );
  if prior_receipt is not null then return prior_receipt; end if;
  select value.* into strict source_config
  from scoring_authority.odds_input_configurations value
  where value.tournament_id = source_target
    and value.is_current and value.validation_status = 'VALID';
  select value.* into target_config
  from scoring_authority.odds_input_configurations value
  where value.tournament_id = target and value.is_current for update;
  if coalesce(target_config.configuration_revision, 0) <> expected_revision then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'PREDICTION_SETTINGS_PREDECESSOR_STALE'
    );
  end if;
  validation := production_control.validate_prediction_settings_v1(
    source_config.canonical_settings, target_config.canonical_settings
  );
  if not coalesce((validation->>'pass')::boolean, false) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'PREDICTION_SETTINGS_VALIDATION_FAILED',
      'issues', validation->'issues'
    );
  end if;
  if coalesce((validation->>'changedSettingCount')::integer, 0) = 0 then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'PREDICTION_SETTINGS_NO_CHANGES'
    );
  end if;
  update production_control.prediction_settings_drafts_v1 set
    state = 'SUPERSEDED'
  where tournament_id = target and state in ('STAGED', 'VALIDATED');
  select coalesce(pg_catalog.max(value.draft_revision), 0) + 1
    into next_draft_revision
  from production_control.prediction_settings_drafts_v1 value
  where value.tournament_id = target;
  insert into production_control.prediction_settings_drafts_v1 (
    tournament_id, draft_revision, state, authoring_kind,
    expected_configuration_revision, predecessor_configuration_id,
    source_tournament_id, source_configuration_id,
    canonical_settings, effective_settings, settings_fingerprint,
    effective_settings_fingerprint, changed_keys,
    validation_diagnostics, reason, created_by_player_id,
    created_by_auth_user_id
  ) values (
    target, next_draft_revision, 'STAGED', 'COPIED_PREVIOUS',
    expected_revision, target_config.id, source_target, source_config.id,
    validation->'canonicalSettings', validation->'effectiveSettings',
    validation->>'settingsFingerprint',
    validation->>'effectiveSettingsFingerprint',
    validation->'changedKeys',
    pg_catalog.jsonb_build_object(
      'contractVersion', 'production-prediction-settings-authoring-v1',
      'settingsContractVersion', 'prediction-settings-v1',
      'copiedValuesOnly', true,
      'sourceTournamentId', source_target,
      'sourceConfigurationRevision', source_config.configuration_revision,
      'jobsCopied', false,
      'snapshotsCopied', false,
      'publicationCopied', false,
      'auditCopied', false
    ),
    reason_value, actor_player, actor_auth
  ) returning draft_id into draft_id_value;
  response_value := pg_catalog.jsonb_build_object(
    'ok', true,
    'code', 'PREDICTION_SETTINGS_PREVIOUS_CONFIGURATION_COPIED',
    'idempotent', false,
    'tournamentId', target,
    'sourceTournamentId', source_target,
    'draftId', draft_id_value,
    'draftRevision', next_draft_revision,
    'state', 'STAGED',
    'requiresReview', true,
    'madeCurrent', false,
    'jobsCopied', false,
    'snapshotsCopied', false,
    'publicationCopied', false
  );
  insert into production_control.prediction_settings_audit_events_v1 (
    tournament_id, draft_id, action, actor_player_id,
    actor_auth_user_id, operation_request_id, request_payload_hash, summary
  ) values (
    target, draft_id_value, 'PREVIOUS_CONFIGURATION_COPIED',
    actor_player, actor_auth, request_id, database_hash,
    pg_catalog.jsonb_build_object(
      'draftRevision', next_draft_revision,
      'sourceTournamentId', source_target,
      'sourceConfigurationRevision', source_config.configuration_revision,
      'copiedValuesOnly', true,
      'madeCurrent', false
    )
  );
  insert into production_control.prediction_settings_operation_receipts_v1 (
    tournament_id, operation, operation_request_id,
    declared_request_payload_hash, request_payload_hash,
    actor_player_id, actor_auth_user_id, response
  ) values (
    target, 'COPY_PREVIOUS', request_id, declared_hash, database_hash,
    actor_player, actor_auth, response_value
  );
  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint,
    result, details
  ) values (
    'PRODUCTION_PREDICTION_SETTINGS_PREVIOUS_CONFIGURATION_COPIED',
    'PREDICTION_SETTINGS', target, actor_player, database_hash,
    'SUCCEEDED', pg_catalog.jsonb_build_object(
      'draft_revision', next_draft_revision,
      'source_tournament_id', source_target,
      'source_configuration_revision', source_config.configuration_revision,
      'copied_values_only', true,
      'made_current', false
    )
  );
  return response_value;
exception when no_data_found then
  return pg_catalog.jsonb_build_object(
    'ok', false, 'code', 'PREDICTION_SETTINGS_COPY_SOURCE_REQUIRED'
  );
end;
$copy_prediction_settings$;

-- Production Google Prediction Settings synchronization is permanently
-- retired. The frozen implementations remain for Guide/Draft and historical
-- evidence, while the new public wrappers fail closed before any Google read
-- can be materialized into canonical Odds inputs.
alter function public.synchronize_production_director_projection(jsonb)
  rename to sync_prod_director_projection_before_ps_retirement_v1;
revoke all on function
  public.sync_prod_director_projection_before_ps_retirement_v1(jsonb)
  from public, anon, authenticated, service_role;

create function public.synchronize_production_director_projection(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $retire_current_prediction_settings_google_sync$
begin
  if pg_catalog.upper(pg_catalog.btrim(coalesce(input->>'domain', ''))) =
       'PREDICTION_SETTINGS' then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'code', 'PREDICTION_SETTINGS_GOOGLE_AUTHORING_RETIRED',
      'authoringAuthority', 'SUPABASE',
      'googleClassification', 'LEGACY_NON_AUTHORITATIVE'
    );
  end if;
  return public
    .sync_prod_director_projection_before_ps_retirement_v1(input);
end;
$retire_current_prediction_settings_google_sync$;

alter function public.synchronize_production_future_annual_projection_v1(jsonb)
  rename to sync_prod_future_annual_projection_before_ps_retirement_v1;
revoke all on function
  public.sync_prod_future_annual_projection_before_ps_retirement_v1(jsonb)
  from public, anon, authenticated, service_role;

create function public.synchronize_production_future_annual_projection_v1(
  input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $retire_future_prediction_settings_google_sync$
begin
  if pg_catalog.upper(pg_catalog.btrim(coalesce(input->>'domain', ''))) =
       'PREDICTION_SETTINGS' then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'code', 'PREDICTION_SETTINGS_GOOGLE_AUTHORING_RETIRED',
      'authoringAuthority', 'SUPABASE',
      'googleClassification', 'LEGACY_NON_AUTHORITATIVE'
    );
  end if;
  return public
    .sync_prod_future_annual_projection_before_ps_retirement_v1(input);
end;
$retire_future_prediction_settings_google_sync$;

revoke all on function public.import_production_prediction_settings(jsonb)
  from public, anon, authenticated, service_role;

revoke all on function
  production_control.reject_prediction_settings_immutable_v1(),
  production_control.prediction_settings_hash_v1(jsonb),
  production_control.validate_prediction_settings_v1(jsonb,jsonb),
  production_control.assert_prediction_settings_authoring_v1(jsonb),
  production_control.prediction_settings_receipt_v1(text,text,uuid,text,text)
from public, anon, authenticated, service_role;

revoke all on function
  public.read_production_prediction_settings_authoring_v1(jsonb),
  public.stage_production_prediction_settings_revision_v1(jsonb),
  public.validate_production_prediction_settings_revision_v1(jsonb),
  public.commit_production_prediction_settings_revision_v1(jsonb),
  public.copy_production_prediction_settings_draft_v1(jsonb),
  public.synchronize_production_director_projection(jsonb),
  public.synchronize_production_future_annual_projection_v1(jsonb)
from public, anon, authenticated, service_role;

grant execute on function
  public.read_production_prediction_settings_authoring_v1(jsonb),
  public.stage_production_prediction_settings_revision_v1(jsonb),
  public.validate_production_prediction_settings_revision_v1(jsonb),
  public.commit_production_prediction_settings_revision_v1(jsonb),
  public.copy_production_prediction_settings_draft_v1(jsonb),
  public.synchronize_production_director_projection(jsonb),
  public.synchronize_production_future_annual_projection_v1(jsonb)
to service_role;

comment on function public.read_production_prediction_settings_authoring_v1(jsonb)
is 'Director-only annual Prediction Settings editor read. Returns canonical values, sanitized provenance/history, persisted review draft, and Odds calculation/publication relationship without Google access.';

comment on function public.commit_production_prediction_settings_revision_v1(jsonb)
is 'Director-only, revision-protected, idempotent Supabase Prediction Settings commit. Creates no calculation or publication and preserves the current published snapshot.';

notify pgrst, 'reload schema';
commit;
