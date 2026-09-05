-- Production Odds publication withdrawal / retirement V1.
--
-- Installation is inert: the new public-pointer row is initialized from the
-- existing authority row, and no publication, snapshot, job, setup, scoring,
-- or side-game fact changes. A later, separately authorized Director request
-- may clear the public pointer without deleting or rewriting publication
-- history. The legacy odds_publication_current row remains the monotonic
-- publication-sequence anchor used by the certified V1 publish functions.
begin;

do $dependencies$
begin
  if pg_catalog.to_regclass(
       'scoring_authority.odds_publication_current'
     ) is null
     or pg_catalog.to_regclass(
       'scoring_authority.odds_published_snapshots'
     ) is null
     or pg_catalog.to_regprocedure(
       'public.read_production_odds_publication_frozen_2026_v1(jsonb)'
     ) is null
     or pg_catalog.to_regprocedure(
       'production_control.annual_odds_publication_projection_v1(text)'
     ) is null
     or pg_catalog.to_regprocedure(
       'production_control.tournament_setup_dependency_codes_v1(text,text,integer,text,text)'
     ) is null
     or pg_catalog.to_regprocedure(
       'public.read_production_tournament_setup_v1(jsonb)'
     ) is null
     or pg_catalog.to_regprocedure(
       'production_control.prediction_settings_canonical_json_v1(jsonb)'
     ) is null
     or pg_catalog.to_regclass(
       'production_control.annual_odds_operation_allowlist_v1'
     ) is null
     or pg_catalog.to_regprocedure(
       'public.future_production_dispatch_odds_v1(jsonb)'
     ) is null then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ODDS_WITHDRAWAL_DEPENDENCY_REQUIRED';
  end if;
end;
$dependencies$;

create table production_control.odds_publication_withdrawal_events_v1 (
  withdrawal_event_id uuid primary key default extensions.gen_random_uuid(),
  tournament_id text not null references scoring_authority.tournaments(
    tournament_id
  ) on delete restrict,
  publication_revision bigint not null check (publication_revision > 0),
  snapshot_id uuid not null references
    scoring_authority.odds_published_snapshots(id) on delete restrict,
  predecessor_pointer_revision bigint not null check (
    predecessor_pointer_revision >= 0
  ),
  successor_pointer_revision bigint not null check (
    successor_pointer_revision = predecessor_pointer_revision + 1
  ),
  reason_code text not null check (reason_code in (
    'TOURNAMENT_SETUP_CHANGED', 'PUBLICATION_CORRECTION_REQUIRED'
  )),
  actor_player_id text not null references scoring_authority.players(player_id)
    on delete restrict,
  actor_auth_user_id uuid not null references auth.users(id) on delete restrict,
  operation_request_id uuid not null,
  request_payload_hash text not null check (
    request_payload_hash ~ '^[0-9a-f]{64}$'
  ),
  original_published_at timestamptz not null,
  original_publication_authority text not null check (
    original_publication_authority = 'SUPABASE'
  ),
  original_adoption_kind text,
  withdrawn_at timestamptz not null default pg_catalog.clock_timestamp(),
  unique (tournament_id, publication_revision, snapshot_id),
  unique (tournament_id, operation_request_id)
);

create table production_control.odds_publication_withdrawal_receipts_v1 (
  receipt_id uuid not null default extensions.gen_random_uuid() unique,
  tournament_id text not null references scoring_authority.tournaments(
    tournament_id
  ) on delete restrict,
  operation_request_id uuid not null,
  declared_request_payload_hash text not null check (
    declared_request_payload_hash ~ '^[0-9a-f]{64}$'
  ),
  request_payload_hash text not null check (
    request_payload_hash ~ '^[0-9a-f]{64}$'
  ),
  withdrawal_event_id uuid not null unique references
    production_control.odds_publication_withdrawal_events_v1(
      withdrawal_event_id
    ) on delete restrict,
  actor_player_id text not null references scoring_authority.players(player_id)
    on delete restrict,
  actor_auth_user_id uuid not null references auth.users(id) on delete restrict,
  response jsonb not null check (pg_catalog.jsonb_typeof(response) = 'object'),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (tournament_id, operation_request_id)
);

-- This is the actual current-publication authority. It is intentionally
-- separate from immutable snapshots and from the older publication-sequence
-- anchor. A withdrawn pointer has no current snapshot, while retaining the
-- last publication identity so the next publication remains revision N+1.
create table scoring_authority.odds_publication_public_pointer_v1 (
  tournament_id text primary key references scoring_authority.tournaments(
    tournament_id
  ) on delete restrict,
  contract_version text not null check (
    contract_version = 'production-odds-publication-pointer-v1'
  ),
  publication_state text not null check (
    publication_state in ('UNPUBLISHED', 'PUBLISHED', 'WITHDRAWN')
  ),
  current_snapshot_id uuid unique references
    scoring_authority.odds_published_snapshots(id) on delete restrict,
  current_publication_revision bigint check (
    current_publication_revision is null or current_publication_revision > 0
  ),
  last_published_snapshot_id uuid references
    scoring_authority.odds_published_snapshots(id) on delete restrict,
  last_publication_revision bigint not null default 0 check (
    last_publication_revision >= 0
  ),
  pointer_revision bigint not null default 0 check (pointer_revision >= 0),
  last_withdrawal_event_id uuid unique references
    production_control.odds_publication_withdrawal_events_v1(
      withdrawal_event_id
    ) on delete restrict,
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  check (
    (publication_state = 'PUBLISHED'
      and current_snapshot_id is not null
      and current_publication_revision is not null
      and current_publication_revision = last_publication_revision
      and current_snapshot_id = last_published_snapshot_id
      and last_withdrawal_event_id is null)
    or
    (publication_state = 'WITHDRAWN'
      and current_snapshot_id is null
      and current_publication_revision is null
      and last_published_snapshot_id is not null
      and last_publication_revision > 0
      and last_withdrawal_event_id is not null)
    or
    (publication_state = 'UNPUBLISHED'
      and current_snapshot_id is null
      and current_publication_revision is null
      and last_published_snapshot_id is null
      and last_publication_revision = 0
      and last_withdrawal_event_id is null)
  )
);

alter table production_control.odds_publication_withdrawal_events_v1
  enable row level security;
alter table production_control.odds_publication_withdrawal_receipts_v1
  enable row level security;
alter table scoring_authority.odds_publication_public_pointer_v1
  enable row level security;

revoke all on table
  production_control.odds_publication_withdrawal_events_v1,
  production_control.odds_publication_withdrawal_receipts_v1,
  scoring_authority.odds_publication_public_pointer_v1
from public, anon, authenticated, service_role;
grant select on table
  production_control.odds_publication_withdrawal_events_v1,
  scoring_authority.odds_publication_public_pointer_v1
to service_role;

create function production_control.reject_odds_withdrawal_immutable_v1()
returns trigger
language plpgsql
set search_path = pg_catalog
as $odds_withdrawal_immutable$
begin
  raise exception using errcode = '55000',
    message = 'PRODUCTION_ODDS_WITHDRAWAL_EVIDENCE_IMMUTABLE';
end;
$odds_withdrawal_immutable$;

create trigger production_odds_withdrawal_event_immutable_v1
before update or delete
on production_control.odds_publication_withdrawal_events_v1
for each row execute function
  production_control.reject_odds_withdrawal_immutable_v1();
create trigger production_odds_withdrawal_receipt_immutable_v1
before update or delete
on production_control.odds_publication_withdrawal_receipts_v1
for each row execute function
  production_control.reject_odds_withdrawal_immutable_v1();

revoke all on function
  production_control.reject_odds_withdrawal_immutable_v1()
from public, anon, authenticated, service_role;

-- Seed only an equivalent public pointer. No existing row or flag changes.
insert into scoring_authority.odds_publication_public_pointer_v1 (
  tournament_id, contract_version, publication_state,
  current_snapshot_id, current_publication_revision,
  last_published_snapshot_id, last_publication_revision,
  pointer_revision, last_withdrawal_event_id
)
select
  value.tournament_id,
  'production-odds-publication-pointer-v1',
  case when value.publication_authority = 'SUPABASE'
            and value.publication_state = 'PUBLISHED'
         then 'PUBLISHED' else 'UNPUBLISHED' end,
  case when value.publication_authority = 'SUPABASE'
            and value.publication_state = 'PUBLISHED'
         then value.current_snapshot_id else null end,
  case when value.publication_authority = 'SUPABASE'
            and value.publication_state = 'PUBLISHED'
         then value.publication_revision else null end,
  case when value.publication_authority = 'SUPABASE'
            and value.publication_state = 'PUBLISHED'
         then value.current_snapshot_id else null end,
  case when value.publication_authority = 'SUPABASE'
            and value.publication_state = 'PUBLISHED'
         then value.publication_revision else 0 end,
  case when value.publication_authority = 'SUPABASE'
            and value.publication_state = 'PUBLISHED'
         then value.publication_revision else 0 end,
  null
from scoring_authority.odds_publication_current value;

-- Every existing/future publish already updates odds_publication_current.
-- Synchronize that trusted transition into the separated public pointer. A
-- non-semantic update to the legacy row cannot accidentally undo withdrawal.
create function production_control.sync_odds_publication_public_pointer_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $sync_odds_publication_pointer$
begin
  if tg_op = 'UPDATE'
     and new.publication_authority is not distinct from old.publication_authority
     and new.publication_state is not distinct from old.publication_state
     and new.current_snapshot_id is not distinct from old.current_snapshot_id
     and new.publication_revision is not distinct from old.publication_revision
  then
    return new;
  end if;

  insert into scoring_authority.odds_publication_public_pointer_v1 (
    tournament_id, contract_version, publication_state,
    current_snapshot_id, current_publication_revision,
    last_published_snapshot_id, last_publication_revision,
    pointer_revision, last_withdrawal_event_id, updated_at
  ) values (
    new.tournament_id, 'production-odds-publication-pointer-v1',
    case when new.publication_authority = 'SUPABASE'
              and new.publication_state = 'PUBLISHED'
         then 'PUBLISHED' else 'UNPUBLISHED' end,
    case when new.publication_authority = 'SUPABASE'
              and new.publication_state = 'PUBLISHED'
         then new.current_snapshot_id else null end,
    case when new.publication_authority = 'SUPABASE'
              and new.publication_state = 'PUBLISHED'
         then new.publication_revision else null end,
    case when new.publication_authority = 'SUPABASE'
              and new.publication_state = 'PUBLISHED'
         then new.current_snapshot_id else null end,
    case when new.publication_authority = 'SUPABASE'
              and new.publication_state = 'PUBLISHED'
         then new.publication_revision else 0 end,
    case when new.publication_authority = 'SUPABASE'
              and new.publication_state = 'PUBLISHED'
         then new.publication_revision else 0 end,
    null, pg_catalog.clock_timestamp()
  ) on conflict (tournament_id) do update set
    publication_state = excluded.publication_state,
    current_snapshot_id = excluded.current_snapshot_id,
    current_publication_revision = excluded.current_publication_revision,
    last_published_snapshot_id = excluded.last_published_snapshot_id,
    last_publication_revision = excluded.last_publication_revision,
    pointer_revision =
      scoring_authority.odds_publication_public_pointer_v1.pointer_revision + 1,
    last_withdrawal_event_id = null,
    updated_at = excluded.updated_at;
  return new;
end;
$sync_odds_publication_pointer$;

create trigger production_odds_publication_public_pointer_sync_v1
after insert or update of publication_authority, publication_state,
  current_snapshot_id, publication_revision
on scoring_authority.odds_publication_current
for each row execute function
  production_control.sync_odds_publication_public_pointer_v1();

revoke all on function
  production_control.sync_odds_publication_public_pointer_v1()
from public, anon, authenticated, service_role;

create function production_control.odds_publication_blocks_setup_v1(
  target text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $odds_publication_blocks_setup$
  select
    exists (
      select 1
      from scoring_authority.odds_publication_public_pointer_v1 pointer
      where pointer.tournament_id = target
        and pointer.publication_state = 'PUBLISHED'
        and pointer.current_snapshot_id is not null
    )
    or exists (
      select 1 from scoring_authority.odds_calculation_jobs job
      where job.tournament_id = target
        and (
          job.status in ('PENDING', 'RUNNING', 'RETRYABLE')
          or (job.status = 'SUCCEEDED' and job.publication_status = 'READY')
        )
    )
$odds_publication_blocks_setup$;

create function production_control.odds_publication_is_current_v1(
  target text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $odds_publication_is_current$
  select exists (
    select 1
    from scoring_authority.odds_publication_public_pointer_v1 pointer
    where pointer.tournament_id = target
      and pointer.publication_state = 'PUBLISHED'
      and pointer.current_snapshot_id is not null
  )
$odds_publication_is_current$;

revoke all on function
  production_control.odds_publication_blocks_setup_v1(text)
from public, anon, authenticated, service_role;
revoke all on function
  production_control.odds_publication_is_current_v1(text)
from public, anon, authenticated, service_role;

-- Patch only the Odds clause in the installed Setup dependency function. All
-- non-Odds dependency behavior remains byte-for-byte the installed body.
do $patch_setup_dependency$
declare
  definition text;
  patched text;
  needle text := $needle$exists (
      select 1 from scoring_authority.odds_publication_current current_value
      where current_value.tournament_id = '2026'
        and current_value.publication_state = 'PUBLISHED'
    ) or exists (
      select 1 from scoring_authority.odds_calculation_jobs job
      where job.tournament_id = '2026'
        and (
          job.status in ('PENDING', 'RUNNING', 'RETRYABLE')
          or (job.status = 'SUCCEEDED' and job.publication_status = 'READY')
        )
    )$needle$;
begin
  definition := pg_catalog.pg_get_functiondef(
    'production_control.tournament_setup_dependency_codes_v1(text,text,integer,text,text)'::regprocedure
  );
  if pg_catalog.strpos(definition, needle) = 0 then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ODDS_WITHDRAWAL_SETUP_GUARD_SOURCE_CHANGED';
  end if;
  patched := pg_catalog.replace(
    definition, needle,
    'production_control.odds_publication_blocks_setup_v1(''2026'')'
  );
  execute patched;
end;
$patch_setup_dependency$;

-- The Director Setup dependency summary must describe the separated public
-- pointer, not the historical sequence anchor.
do $patch_setup_read$
declare
  definition text;
  patched text;
  needle text := $needle$exists (
      select 1 from scoring_authority.odds_publication_current current_value
      where current_value.tournament_id = '2026'
        and current_value.publication_state = 'PUBLISHED'
    )$needle$;
begin
  definition := pg_catalog.pg_get_functiondef(
    'public.read_production_tournament_setup_v1(jsonb)'::regprocedure
  );
  if pg_catalog.strpos(definition, needle) = 0 then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ODDS_WITHDRAWAL_SETUP_READ_SOURCE_CHANGED';
  end if;
  patched := pg_catalog.replace(
    definition, needle,
    'production_control.odds_publication_is_current_v1(''2026'')'
  );
  execute patched;
end;
$patch_setup_read$;

create function production_control.odds_publication_withdrawal_projection_v1(
  base jsonb,
  target text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $odds_withdrawal_projection$
declare
  pointer scoring_authority.odds_publication_public_pointer_v1%rowtype;
  withdrawal production_control.odds_publication_withdrawal_events_v1%rowtype;
  publication jsonb;
  snapshots jsonb;
begin
  if base->>'ok' is distinct from 'true'
     or pg_catalog.jsonb_typeof(base->'data') <> 'object' then
    return base;
  end if;
  select value.* into pointer
  from scoring_authority.odds_publication_public_pointer_v1 value
  where value.tournament_id = target;
  if not found then return base; end if;

  publication := coalesce(base#>'{data,publication}', '{}'::jsonb);
  if pointer.publication_state = 'PUBLISHED' and (
       publication->>'state' is distinct from 'PUBLISHED'
       or publication->>'snapshot_id' is distinct from
         pointer.current_snapshot_id::text
       or coalesce((publication->>'publication_revision')::bigint, -1)
         <> pointer.current_publication_revision
     ) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ODDS_PUBLIC_POINTER_DIVERGED';
  end if;
  if pointer.publication_state = 'WITHDRAWN' then
    select value.* into strict withdrawal
    from production_control.odds_publication_withdrawal_events_v1 value
    where value.withdrawal_event_id = pointer.last_withdrawal_event_id
      and value.tournament_id = target
      and value.publication_revision = pointer.last_publication_revision
      and value.snapshot_id = pointer.last_published_snapshot_id;
  end if;

  select coalesce(pg_catalog.jsonb_agg(
    item.value || pg_catalog.jsonb_build_object(
      'is_current_official',
        pointer.publication_state = 'PUBLISHED'
        and coalesce((item.value->>'is_current_official')::boolean, false)
        and case when coalesce(
          item.value->>'publication_state_revision', ''
        ) ~ '^[0-9]+$' then
          (item.value->>'publication_state_revision')::bigint =
            pointer.current_publication_revision
        else false end,
      'publication_lifecycle', case
        when event.withdrawal_event_id is not null then 'WITHDRAWN'
        when pointer.publication_state = 'PUBLISHED'
          and coalesce((item.value->>'is_current_official')::boolean, false)
          then 'PUBLISHED'
        else 'HISTORICAL' end,
      'withdrawal', case when event.withdrawal_event_id is null
        then 'null'::jsonb
        else pg_catalog.jsonb_build_object(
          'state', 'WITHDRAWN',
          'reason_code', event.reason_code,
          'withdrawn_at', event.withdrawn_at,
          'withdrawn_by_player_id', event.actor_player_id
        ) end
    ) order by item.ordinality
  ), '[]'::jsonb) into snapshots
  from pg_catalog.jsonb_array_elements(coalesce(
    base#>'{data,snapshots}', '[]'::jsonb
  )) with ordinality item(value, ordinality)
  left join production_control.odds_publication_withdrawal_events_v1 event
    on event.tournament_id = target
   and coalesce(item.value->>'publication_state_revision', '') ~ '^[0-9]+$'
   and event.publication_revision =
     (item.value->>'publication_state_revision')::bigint;

  publication := publication || pg_catalog.jsonb_build_object(
    'state', pointer.publication_state,
    'snapshot_id', pointer.current_snapshot_id,
    'publication_revision', pointer.last_publication_revision,
    'current_publication_revision', pointer.current_publication_revision,
    'publication_pointer_revision', pointer.pointer_revision,
    'currently_published', pointer.publication_state = 'PUBLISHED',
    'predecessor_snapshot_id', pointer.last_published_snapshot_id,
    'published_at', case when pointer.publication_state = 'PUBLISHED'
      then publication->'published_at' else 'null'::jsonb end,
    'last_published_at', publication->'published_at',
    'withdrawal', case when withdrawal.withdrawal_event_id is null
      then 'null'::jsonb
      else pg_catalog.jsonb_build_object(
        'state', 'WITHDRAWN',
        'reason_code', withdrawal.reason_code,
        'withdrawn_at', withdrawal.withdrawn_at,
        'withdrawn_by_player_id', withdrawal.actor_player_id
      ) end
  );

  return pg_catalog.jsonb_set(
    base, '{data}',
    (base->'data') || pg_catalog.jsonb_build_object(
      'publication', publication,
      'snapshots', snapshots,
      'withdrawal_history', (
        select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'publication_revision', event.publication_revision,
          'reason_code', event.reason_code,
          'withdrawn_at', event.withdrawn_at,
          'withdrawn_by_player_id', event.actor_player_id
        ) order by event.withdrawn_at desc), '[]'::jsonb)
        from production_control.odds_publication_withdrawal_events_v1 event
        where event.tournament_id = target
      )
    )
  );
end;
$odds_withdrawal_projection$;

revoke all on function
  production_control.odds_publication_withdrawal_projection_v1(jsonb,text)
from public, anon, authenticated, service_role;

-- Preserve the annual body and wrap its result so all future-current reads use
-- the same separated public-pointer lifecycle.
alter function production_control.annual_odds_publication_projection_v1(text)
  rename to annual_odds_publication_projection_pre_withdrawal_v1;
create function production_control.annual_odds_publication_projection_v1(
  target text
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $annual_odds_withdrawal_projection$
  select production_control.odds_publication_withdrawal_projection_v1(
    production_control.annual_odds_publication_projection_pre_withdrawal_v1(
      target
    ), target
  )
$annual_odds_withdrawal_projection$;
revoke all on function production_control
  .annual_odds_publication_projection_pre_withdrawal_v1(text)
from public, anon, authenticated, service_role;
revoke all on function
  production_control.annual_odds_publication_projection_v1(text)
from public, anon, authenticated, service_role;

create or replace function public.read_production_odds_publication_v1(
  input jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $read_2026_odds_withdrawal_projection$
begin
  perform production_control.assert_frozen_2026_current_read_v1();
  return production_control.odds_publication_withdrawal_projection_v1(
    public.read_production_odds_publication_frozen_2026_v1(input), '2026'
  );
end;
$read_2026_odds_withdrawal_projection$;
revoke all on function public.read_production_odds_publication_v1(jsonb)
from public, anon, authenticated, service_role;
grant execute on function public.read_production_odds_publication_v1(jsonb)
to service_role;

create or replace function public.read_published_odds_view(
  target_tournament_id text default null,
  target_source_workbook_id text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $annual_published_odds_withdrawal_read$
declare
  pointer production_control.current_tournament_pointer_v1%rowtype;
  generation production_control.future_annual_runtime_generations_v1%rowtype;
  annual_resource production_control.future_tournament_resources_v1%rowtype;
  input jsonb;
begin
  perform pg_catalog.pg_advisory_xact_lock_shared(
    production_control.scoring_admission_lock_key()
  );
  select value.* into strict pointer
  from production_control.current_tournament_pointer_v1 value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  if pointer.tournament_id = '2026' then
    if pg_catalog.btrim(coalesce(target_tournament_id, '')) <> '2026'
       or pg_catalog.btrim(coalesce(target_source_workbook_id, '')) <>
         '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4' then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'code', 'PRODUCTION_ODDS_EXACT_RESOURCE_REQUIRED'
      );
    end if;
    return production_control.odds_publication_withdrawal_projection_v1(
      public.read_published_odds_view_frozen_2026_v1(
        target_tournament_id, target_source_workbook_id
      ), '2026'
    );
  end if;
  select value.* into strict generation
  from production_control.future_annual_runtime_generations_v1 value
  where value.tournament_id = pointer.tournament_id
    and value.generation_status = 'ACTIVE';
  select value.* into strict annual_resource
  from production_control.future_tournament_resources_v1 value
  where value.tournament_id = pointer.tournament_id;
  if pg_catalog.btrim(coalesce(target_tournament_id, '')) <>
       pointer.tournament_id
     or pg_catalog.btrim(coalesce(target_source_workbook_id, '')) not in (
       annual_resource.source_workbook_id,
       '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4'
     ) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'PRODUCTION_ODDS_EXACT_RESOURCE_REQUIRED'
    );
  end if;
  input := pg_catalog.jsonb_build_object(
    'target_tournament_id', pointer.tournament_id,
    'expected_current_tournament_id', pointer.tournament_id,
    'expected_pointer_revision', pointer.pointer_revision,
    'expected_runtime_generation_id', generation.runtime_generation_id,
    'expected_annual_authority_generation_id',
      generation.authority_generation_id,
    'expected_annual_admission_generation_id',
      generation.admission_generation_id
  );
  perform production_control.assert_annual_current_read_v1(input);
  return production_control.annual_odds_publication_projection_v1(
    pointer.tournament_id
  );
exception
  when invalid_text_representation or numeric_value_out_of_range
    or no_data_found then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'PRODUCTION_ODDS_EXACT_RESOURCE_REQUIRED'
    );
end;
$annual_published_odds_withdrawal_read$;
revoke all on function public.read_published_odds_view(text,text)
from public, anon, authenticated, service_role;
grant execute on function public.read_published_odds_view(text,text)
to service_role;

create function production_control.odds_withdrawal_receipt_v1(
  target text,
  request_id uuid,
  declared_hash text,
  database_hash text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $odds_withdrawal_receipt$
declare
  receipt production_control.odds_publication_withdrawal_receipts_v1%rowtype;
begin
  select value.* into receipt
  from production_control.odds_publication_withdrawal_receipts_v1 value
  where value.tournament_id = target
    and value.operation_request_id = request_id;
  if not found then return null; end if;
  if receipt.declared_request_payload_hash = declared_hash
     and receipt.request_payload_hash = database_hash then
    return receipt.response || pg_catalog.jsonb_build_object(
      'idempotent', true
    );
  end if;
  return pg_catalog.jsonb_build_object(
    'ok', false, 'code', 'ODDS_WITHDRAWAL_IDEMPOTENCY_CONFLICT'
  );
end;
$odds_withdrawal_receipt$;

revoke all on function production_control.odds_withdrawal_receipt_v1(
  text,uuid,text,text
) from public, anon, authenticated, service_role;

create function public.withdraw_production_odds_publication_v1(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $withdraw_production_odds_publication$
declare
  target text := pg_catalog.btrim(coalesce(
    input->>'target_tournament_id', ''
  ));
  actor_player text := pg_catalog.upper(pg_catalog.btrim(coalesce(
    input#>>'{authorization,player_id}', ''
  )));
  actor_auth uuid;
  request_id uuid;
  expected_snapshot uuid;
  expected_publication_revision bigint;
  expected_publication_pointer_revision bigint;
  expected_annual_pointer_revision bigint;
  reason_value text := pg_catalog.upper(pg_catalog.btrim(coalesce(
    input->>'reason_code', ''
  )));
  declared_hash text := pg_catalog.lower(coalesce(
    input->>'request_payload_hash', ''
  ));
  canonical_text text := coalesce(input->>'request_canonical_json', '');
  canonical_value jsonb;
  database_value jsonb;
  database_hash text;
  prior_receipt jsonb;
  annual_pointer production_control.current_tournament_pointer_v1%rowtype;
  current_value scoring_authority.odds_publication_current%rowtype;
  public_pointer scoring_authority.odds_publication_public_pointer_v1%rowtype;
  snapshot scoring_authority.odds_published_snapshots%rowtype;
  event_id uuid := extensions.gen_random_uuid();
  occurred_at timestamptz := pg_catalog.clock_timestamp();
  response_value jsonb;
begin
  begin
    actor_auth := (input#>>'{authorization,auth_user_id}')::uuid;
    request_id := (input->>'operation_request_id')::uuid;
    expected_snapshot := (input->>'expected_snapshot_id')::uuid;
    expected_publication_revision :=
      (input->>'expected_publication_revision')::bigint;
    expected_publication_pointer_revision :=
      (input->>'expected_publication_pointer_revision')::bigint;
    expected_annual_pointer_revision :=
      (input->>'expected_annual_pointer_revision')::bigint;
    canonical_value := canonical_text::jsonb;
  exception when others then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'ODDS_WITHDRAWAL_INPUT_INVALID'
    );
  end;

  if input->>'operation' is distinct from
       'WITHDRAW_PRODUCTION_ODDS_PUBLICATION_V1'
     or input->>'contract_version' is distinct from
       'production-odds-publication-withdrawal-v1'
     or target !~ '^20[0-9]{2}$'
     or input#>>'{authorization,tournament_id}' is distinct from target
     or input#>>'{authorization,role}' is distinct from 'DIRECTOR'
     or actor_player !~ '^[A-Z0-9][A-Z0-9_-]{1,63}$'
     or expected_publication_revision < 1
     or expected_publication_pointer_revision < 1
     or expected_annual_pointer_revision < 1
     or reason_value not in (
       'TOURNAMENT_SETUP_CHANGED', 'PUBLICATION_CORRECTION_REQUIRED'
     )
     or declared_hash !~ '^[0-9a-f]{64}$' then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'ODDS_WITHDRAWAL_INPUT_INVALID'
    );
  end if;

  if target = '2026' then
    perform production_control.assert_production_scoring_actor(input, true);
  else
    perform production_control.assert_future_production_scoring_actor_v1(
      input, target, true
    );
  end if;

  database_value := pg_catalog.jsonb_build_object(
    'actorAuthUserId', pg_catalog.lower(actor_auth::text),
    'actorPlayerId', actor_player,
    'contractVersion', 'production-odds-publication-withdrawal-v1',
    'expectedAnnualPointerRevision', expected_annual_pointer_revision,
    'expectedCurrentTournamentId', target,
    'expectedPublicationPointerRevision',
      expected_publication_pointer_revision,
    'expectedPublicationRevision', expected_publication_revision,
    'expectedPublicationSnapshotId',
      pg_catalog.lower(expected_snapshot::text),
    'operation', 'WITHDRAW',
    'reasonCode', reason_value,
    'targetTournamentId', target
  );
  database_hash := pg_catalog.encode(extensions.digest(
    production_control.prediction_settings_canonical_json_v1(database_value),
    'sha256'
  ), 'hex');
  if canonical_value is distinct from database_value
     or canonical_text is distinct from
       production_control.prediction_settings_canonical_json_v1(
         database_value
       )
     or declared_hash is distinct from database_hash then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'ODDS_WITHDRAWAL_PAYLOAD_HASH_INVALID'
    );
  end if;

  prior_receipt := production_control.odds_withdrawal_receipt_v1(
    target, request_id, declared_hash, database_hash
  );
  if prior_receipt is not null then return prior_receipt; end if;

  perform pg_catalog.pg_advisory_xact_lock_shared(
    production_control.scoring_admission_lock_key()
  );
  select value.* into strict annual_pointer
  from production_control.current_tournament_pointer_v1 value
  where value.scope_key = 'BAGGER_INV_PRODUCTION' for share;
  if annual_pointer.tournament_id is distinct from target
     or annual_pointer.pointer_revision is distinct from
       expected_annual_pointer_revision then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'ODDS_WITHDRAWAL_CURRENT_TOURNAMENT_STALE'
    );
  end if;

  -- Match the installed publication order: sequence anchor first, separated
  -- pointer second. Future publication and withdrawal therefore serialize on
  -- the same rows without a dual-current window.
  select value.* into strict current_value
  from scoring_authority.odds_publication_current value
  where value.tournament_id = target for update;
  select value.* into strict public_pointer
  from scoring_authority.odds_publication_public_pointer_v1 value
  where value.tournament_id = target for update;

  prior_receipt := production_control.odds_withdrawal_receipt_v1(
    target, request_id, declared_hash, database_hash
  );
  if prior_receipt is not null then return prior_receipt; end if;

  if exists (
    select 1 from scoring_authority.odds_calculation_jobs job
    where job.tournament_id = target
      and (
        job.status in ('PENDING', 'RUNNING', 'RETRYABLE')
        or (job.status = 'SUCCEEDED' and job.publication_status = 'READY')
      )
  ) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'ODDS_WITHDRAWAL_CALCULATION_IN_PROGRESS'
    );
  end if;

  if current_value.publication_authority <> 'SUPABASE'
     or current_value.publication_state <> 'PUBLISHED'
     or current_value.publication_revision < 1
     or current_value.current_snapshot_id is null
     or public_pointer.publication_state <> 'PUBLISHED'
     or public_pointer.current_snapshot_id is null then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'ODDS_WITHDRAWAL_NO_CURRENT_PUBLICATION'
    );
  end if;
  if current_value.publication_revision is distinct from
       expected_publication_revision
     or current_value.current_snapshot_id is distinct from expected_snapshot
     or public_pointer.current_publication_revision is distinct from
       expected_publication_revision
     or public_pointer.current_snapshot_id is distinct from expected_snapshot
     or public_pointer.pointer_revision is distinct from
       expected_publication_pointer_revision then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'ODDS_WITHDRAWAL_PREDECESSOR_STALE'
    );
  end if;

  select value.* into strict snapshot
  from scoring_authority.odds_published_snapshots value
  where value.id = expected_snapshot
    and value.tournament_id = target
    and value.publication_verified
    and value.is_current_official for update;
  if snapshot.publication_state_revision is distinct from
       expected_publication_revision then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'ODDS_WITHDRAWAL_SNAPSHOT_IDENTITY_INVALID'
    );
  end if;

  insert into production_control.odds_publication_withdrawal_events_v1 (
    withdrawal_event_id, tournament_id, publication_revision, snapshot_id,
    predecessor_pointer_revision, successor_pointer_revision, reason_code,
    actor_player_id, actor_auth_user_id, operation_request_id,
    request_payload_hash, original_published_at,
    original_publication_authority, original_adoption_kind, withdrawn_at
  ) values (
    event_id, target, expected_publication_revision, expected_snapshot,
    expected_publication_pointer_revision,
    expected_publication_pointer_revision + 1, reason_value,
    actor_player, actor_auth, request_id, database_hash,
    current_value.published_at, current_value.publication_authority,
    current_value.adoption_kind, occurred_at
  );

  -- is_current_official is an explicitly mutable pointer flag under the
  -- installed snapshot-immutability trigger; payload/provenance stay intact.
  update scoring_authority.odds_published_snapshots set
    is_current_official = false
  where id = expected_snapshot;

  update scoring_authority.odds_publication_public_pointer_v1 set
    publication_state = 'WITHDRAWN',
    current_snapshot_id = null,
    current_publication_revision = null,
    pointer_revision = expected_publication_pointer_revision + 1,
    last_withdrawal_event_id = event_id,
    updated_at = occurred_at
  where tournament_id = target;

  response_value := pg_catalog.jsonb_build_object(
    'ok', true,
    'code', 'PRODUCTION_ODDS_PUBLICATION_WITHDRAWN',
    'idempotent', false,
    'tournament_id', target,
    'publication_state', 'WITHDRAWN',
    'current_publication', false,
    'current_snapshot_id', null,
    'publication_revision', expected_publication_revision,
    'withdrawn_snapshot_id', expected_snapshot,
    'publication_pointer_revision',
      expected_publication_pointer_revision + 1,
    'withdrawal_event_id', event_id,
    'reason_code', reason_value,
    'withdrawn_at', occurred_at,
    'historical_publication_preserved', true,
    'calculation_created', false,
    'publication_created', false,
    'google_writes', 0
  );

  insert into scoring_authority.audit_events (
    tournament_id, action, actor_id, metadata
  ) values (
    target, 'CHAMPIONSHIP_ODDS_PUBLICATION_WITHDRAWN', actor_player,
    pg_catalog.jsonb_build_object(
      'publicationRevision', expected_publication_revision,
      'reasonCode', reason_value,
      'currentPublication', false,
      'historicalPublicationPreserved', true
    )
  );
  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint,
    result, details
  ) values (
    'PRODUCTION_CHAMPIONSHIP_ODDS_PUBLICATION_WITHDRAWN',
    'CHAMPIONSHIP_ODDS_PUBLICATION', target, actor_player,
    database_hash, 'SUCCEEDED', pg_catalog.jsonb_build_object(
      'publication_revision', expected_publication_revision,
      'reason_code', reason_value,
      'current_publication', false,
      'historical_publication_preserved', true
    )
  );
  insert into production_control.odds_publication_withdrawal_receipts_v1 (
    tournament_id, operation_request_id, declared_request_payload_hash,
    request_payload_hash, withdrawal_event_id, actor_player_id,
    actor_auth_user_id, response
  ) values (
    target, request_id, declared_hash, database_hash, event_id,
    actor_player, actor_auth, response_value
  );
  return response_value;
exception
  when no_data_found then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'ODDS_WITHDRAWAL_STATE_UNAVAILABLE'
    );
  when unique_violation then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'ODDS_WITHDRAWAL_OPERATION_CONFLICT'
    );
end;
$withdraw_production_odds_publication$;

revoke all on function public.withdraw_production_odds_publication_v1(jsonb)
from public, anon, authenticated, service_role;
grant execute on function public.withdraw_production_odds_publication_v1(jsonb)
to service_role;

-- The server continues using the established annual Odds dispatcher after the
-- current pointer moves beyond 2026. Extend only its immutable operation
-- allowlist and route this single operation to the same tournament-scoped RPC.
insert into production_control.annual_odds_operation_allowlist_v1 (
  operation_name, operation_class
) values ('withdraw_production_odds_publication_v1', 'MUTATION');

alter function public.future_production_dispatch_odds_v1(jsonb)
  rename to future_production_dispatch_odds_pre_withdrawal_v1;
create function public.future_production_dispatch_odds_v1(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $future_annual_odds_withdrawal_dispatch$
begin
  if input->>'annual_odds_operation' =
       'withdraw_production_odds_publication_v1' then
    perform production_control.assert_annual_odds_runtime_v1(
      input, 'withdraw_production_odds_publication_v1'
    );
    return public.withdraw_production_odds_publication_v1(input);
  end if;
  return public.future_production_dispatch_odds_pre_withdrawal_v1(input);
end;
$future_annual_odds_withdrawal_dispatch$;
revoke all on function
  public.future_production_dispatch_odds_pre_withdrawal_v1(jsonb),
  public.future_production_dispatch_odds_v1(jsonb)
from public, anon, authenticated, service_role;

comment on table scoring_authority.odds_publication_public_pointer_v1 is
  'Current public Odds authority, separated from immutable publication history. WITHDRAWN clears current_snapshot_id while preserving the monotonic last publication revision.';
comment on table production_control.odds_publication_withdrawal_events_v1 is
  'Immutable Director-authorized Odds withdrawal evidence. Referenced published snapshots and their payloads remain unchanged.';
comment on function public.withdraw_production_odds_publication_v1(jsonb) is
  'Bounded, pointer-aware, idempotent Director operation that withdraws only the current public Odds authority and preserves immutable publication history.';

commit;
