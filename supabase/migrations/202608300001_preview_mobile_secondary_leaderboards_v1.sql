-- Isolated-Preview participant authority for the mobile Net Skins and
-- published Calcutta reads. These service-only readers never select a
-- Production resource and never expose raw tables to a native client.

begin;

create table scoring_authority.preview_mobile_calcutta_publications (
  tournament_id text primary key
    references scoring_authority.tournaments (tournament_id) on delete cascade,
  publication_state text not null default 'UNPUBLISHED'
    check (publication_state in ('UNPUBLISHED', 'PUBLISHED')),
  publication_revision bigint not null default 0 check (publication_revision >= 0),
  configuration_fingerprint text,
  published_at timestamptz,
  updated_at timestamptz not null default now(),
  check (configuration_fingerprint is null
    or configuration_fingerprint ~ '^[0-9a-f]{64}$'),
  check ((publication_state = 'PUBLISHED' and publication_revision > 0
      and configuration_fingerprint is not null and published_at is not null)
    or (publication_state = 'UNPUBLISHED' and published_at is null))
);

alter table scoring_authority.preview_mobile_calcutta_publications
  enable row level security;
revoke all on scoring_authority.preview_mobile_calcutta_publications
  from public, anon, authenticated;
grant select, insert, update on
  scoring_authority.preview_mobile_calcutta_publications to service_role;

-- Keep canonical Calcutta money and fraction facts as exact base-10 strings
-- across the PostgREST JSON boundary. Golf scores, ranks, and points remain
-- JSON numbers; this helper converts only the established financial keys.
create or replace function scoring_authority.preview_mobile_calcutta_precision_safe(
  value jsonb
)
returns jsonb
language plpgsql
immutable
set search_path = pg_catalog, scoring_authority
as $$
declare
  kind text := pg_catalog.jsonb_typeof(value);
  result jsonb;
begin
  if kind = 'object' then
    select coalesce(pg_catalog.jsonb_object_agg(
      item.key,
      case
        when item.key = any(array[
          'pot', 'purchase_price', 'purchasePrice',
          'ownership', 'ownership_fraction', 'ownershipFraction',
          'payoutPercent', 'payout_fraction',
          'guaranteedWinnings', 'guaranteed_winnings',
          'overallPayoutPercent', 'overall_payout_fraction',
          'totalPayoutPercent', 'total_payout_fraction',
          'currentPayoutValue', 'tournament_value',
          'netProfit', 'net_profit', 'roi',
          'remainingUpside', 'remaining_upside',
          'purchaseCost', 'purchase_cost', 'total_market_value'
        ]) and pg_catalog.jsonb_typeof(item.value) = 'number'
          then pg_catalog.to_jsonb(item.value #>> '{}')
        else scoring_authority.preview_mobile_calcutta_precision_safe(item.value)
      end), '{}'::jsonb)
      into result
    from pg_catalog.jsonb_each(value) item;
    return result;
  elsif kind = 'array' then
    select coalesce(pg_catalog.jsonb_agg(
      scoring_authority.preview_mobile_calcutta_precision_safe(item.value)
      order by item.ordinality), '[]'::jsonb)
      into result
    from pg_catalog.jsonb_array_elements(value)
      with ordinality item(value, ordinality);
    return result;
  end if;
  return value;
end;
$$;

revoke all on function
  scoring_authority.preview_mobile_calcutta_precision_safe(jsonb)
  from public, anon, authenticated, service_role;

-- Preview's participant PWA had no explicit publication ledger. Adopt only an
-- exact current model that the prior participant surface had already proven
-- visible (`available = true`). An approved configuration alone, a mismatched
-- snapshot, or a non-visible model remains unpublished. Future configuration
-- revisions always reset visibility through the trigger below.
insert into scoring_authority.preview_mobile_calcutta_publications (
  tournament_id, publication_state, publication_revision,
  configuration_fingerprint, published_at, updated_at
)
select configuration.tournament_id, 'PUBLISHED', 1,
  configuration.configuration_fingerprint,
  coalesce(snapshot.published_at, snapshot.calculated_at,
    configuration.approved_at),
  now()
from scoring_authority.calcutta_configurations configuration
join scoring_authority.competition_derived_snapshots snapshot
  on snapshot.tournament_id = configuration.tournament_id
  and snapshot.round_number = 0
  and snapshot.engine_key = 'CALCUTTA'
  and snapshot.is_current
  and snapshot.configuration_fingerprint =
    configuration.configuration_fingerprint
where configuration.is_current and configuration.status = 'APPROVED'
  and coalesce((snapshot.result_payload->>'available')::boolean, false)
on conflict (tournament_id) do nothing;

create or replace function scoring_authority.reset_preview_mobile_calcutta_publication()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, scoring_authority
as $$
begin
  if new.is_current and new.status = 'APPROVED' then
    insert into scoring_authority.preview_mobile_calcutta_publications (
      tournament_id, publication_state, publication_revision,
      configuration_fingerprint, published_at, updated_at
    ) values (
      new.tournament_id, 'UNPUBLISHED', 0,
      new.configuration_fingerprint, null, now()
    ) on conflict (tournament_id) do update set
      publication_state = 'UNPUBLISHED',
      publication_revision =
        scoring_authority.preview_mobile_calcutta_publications.publication_revision + 1,
      configuration_fingerprint = excluded.configuration_fingerprint,
      published_at = null,
      updated_at = now();
  end if;
  return new;
end;
$$;

revoke all on function
  scoring_authority.reset_preview_mobile_calcutta_publication()
  from public, anon, authenticated, service_role;

create trigger preview_mobile_calcutta_configuration_visibility
after insert or update of is_current, status, configuration_fingerprint,
  purchases, ownership, point_structure, payout_structure, financial_contract
on scoring_authority.calcutta_configurations
for each row execute function
  scoring_authority.reset_preview_mobile_calcutta_publication();

create or replace function public.set_preview_mobile_calcutta_publication(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, scoring_authority
as $$
declare
  target_tournament text := pg_catalog.btrim(coalesce(
    input->>'tournament_id', ''));
  target_state text := pg_catalog.upper(pg_catalog.btrim(coalesce(
    input->>'publication_state', '')));
  target_actor text := pg_catalog.left(pg_catalog.btrim(coalesce(
    input->>'requested_by', '')), 180);
  current_configuration scoring_authority.calcutta_configurations%rowtype;
  current_publication scoring_authority.preview_mobile_calcutta_publications%rowtype;
  next_revision bigint;
begin
  if pg_catalog.upper(coalesce(input->>'environment', '')) <> 'PREVIEW'
      or target_tournament = '' or target_actor = ''
      or target_state not in ('UNPUBLISHED', 'PUBLISHED') then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'COMPLETE_PREVIEW_CALCUTTA_PUBLICATION_REQUIRED');
  end if;
  select value.* into current_configuration
  from scoring_authority.calcutta_configurations value
  where value.tournament_id = target_tournament
    and value.is_current and value.status = 'APPROVED';
  if current_configuration.id is null then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'CALCUTTA_CONFIGURATION_REQUIRED');
  end if;
  select value.* into current_publication
  from scoring_authority.preview_mobile_calcutta_publications value
  where value.tournament_id = target_tournament
  for update;
  if current_publication.publication_state = target_state
      and current_publication.configuration_fingerprint =
        current_configuration.configuration_fingerprint then
    return pg_catalog.jsonb_build_object(
      'ok', true, 'idempotent', true,
      'publication_state', target_state,
      'publication_revision', current_publication.publication_revision);
  end if;
  next_revision := coalesce(
    current_publication.publication_revision, 0) + 1;
  insert into scoring_authority.preview_mobile_calcutta_publications (
    tournament_id, publication_state, publication_revision,
    configuration_fingerprint, published_at, updated_at
  ) values (
    target_tournament, target_state, next_revision,
    current_configuration.configuration_fingerprint,
    case when target_state = 'PUBLISHED' then now() else null end,
    now()
  ) on conflict (tournament_id) do update set
    publication_state = excluded.publication_state,
    publication_revision = excluded.publication_revision,
    configuration_fingerprint = excluded.configuration_fingerprint,
    published_at = excluded.published_at,
    updated_at = now();
  insert into scoring_authority.audit_events (
    tournament_id, action, actor_id, metadata
  ) values (
    target_tournament,
    case when target_state = 'PUBLISHED'
      then 'PREVIEW_MOBILE_CALCUTTA_PUBLISHED'
      else 'PREVIEW_MOBILE_CALCUTTA_UNPUBLISHED' end,
    target_actor,
    pg_catalog.jsonb_build_object(
      'publicationRevision', next_revision,
      'configurationFingerprint',
        current_configuration.configuration_fingerprint)
  );
  return pg_catalog.jsonb_build_object(
    'ok', true, 'idempotent', false,
    'publication_state', target_state,
    'publication_revision', next_revision);
end;
$$;

create or replace function public.read_preview_mobile_net_skins_v1(input jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, scoring_authority
as $$
declare
  target_tournament text := pg_catalog.btrim(coalesce(
    input->>'tournament_id', ''));
  target_player text := pg_catalog.btrim(coalesce(
    input->>'player_id', ''));
  input_view jsonb;
  result_view jsonb;
  tournament_value jsonb;
  configuration_revision_value bigint;
  result_revision_value bigint;
begin
  if pg_catalog.upper(coalesce(input->>'environment', '')) <> 'PREVIEW'
      or target_tournament = '' or target_player = ''
      or not exists (
        select 1 from scoring_authority.tournament_players membership
        where membership.tournament_id = target_tournament
          and membership.player_id = target_player
          and membership.participation_status = 'ACTIVE'
      ) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'PREVIEW_PARTICIPANT_RESOURCE_REQUIRED');
  end if;
  select pg_catalog.to_jsonb(value) into tournament_value
  from scoring_authority.tournaments value
  where value.tournament_id = target_tournament;
  if tournament_value is null then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'PREVIEW_TOURNAMENT_REQUIRED');
  end if;
  input_view := public.read_net_skins_input_view(target_tournament);
  if not coalesce((input_view->>'ok')::boolean, false)
      and input_view->>'code' = 'NET_SKINS_CONFIGURATION_REQUIRED' then
    input_view := pg_catalog.jsonb_build_object(
      'ok', true,
      'data', pg_catalog.jsonb_build_object(
        'tournament', tournament_value,
        'configurations', '[]'::jsonb,
        'players', '[]'::jsonb,
        'matches', '[]'::jsonb,
        'source_revision', pg_catalog.jsonb_build_object(
          'tournamentId', target_tournament,
          'matches', '[]'::jsonb,
          'holes', '[]'::jsonb),
        'query_ms', 0));
  elsif not coalesce((input_view->>'ok')::boolean, false) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'PREVIEW_NET_SKINS_AUTHORITY_UNAVAILABLE');
  end if;
  result_view := public.read_net_skins_result_view(target_tournament);
  if not coalesce((result_view->>'ok')::boolean, false) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'PREVIEW_NET_SKINS_AUTHORITY_UNAVAILABLE');
  end if;
  select pg_catalog.count(*) into configuration_revision_value
  from scoring_authority.net_skins_configuration_import_runs value
  where value.tournament_id = target_tournament
    and value.status = 'APPLIED';
  select pg_catalog.count(*) into result_revision_value
  from scoring_authority.competition_derived_snapshots value
  where value.tournament_id = target_tournament
    and value.engine_key = 'NET_SKINS';
  return pg_catalog.jsonb_build_object(
    'ok', true,
    'data', pg_catalog.jsonb_build_object(
      'input', input_view->'data',
      'result', result_view->'data',
      'configuration_revision', configuration_revision_value,
      'result_revision', result_revision_value));
end;
$$;

create or replace function public.read_preview_mobile_calcutta_v1(input jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, scoring_authority
as $$
declare
  target_tournament text := pg_catalog.btrim(coalesce(
    input->>'tournament_id', ''));
  target_player text := pg_catalog.btrim(coalesce(
    input->>'player_id', ''));
  configuration_value jsonb;
  snapshot_value jsonb;
  job_value jsonb;
  publication_value jsonb;
  players_value jsonb;
  result_revision_value bigint;
begin
  if pg_catalog.upper(coalesce(input->>'environment', '')) <> 'PREVIEW'
      or target_tournament = '' or target_player = ''
      or not exists (
        select 1 from scoring_authority.tournament_players membership
        where membership.tournament_id = target_tournament
          and membership.player_id = target_player
          and membership.participation_status = 'ACTIVE'
      ) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'PREVIEW_PARTICIPANT_RESOURCE_REQUIRED');
  end if;
  if not exists (
    select 1 from scoring_authority.tournaments value
    where value.tournament_id = target_tournament
  ) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'PREVIEW_TOURNAMENT_REQUIRED');
  end if;
  select pg_catalog.jsonb_build_object(
    'tournament_id', value.tournament_id,
    'tournament_year', value.tournament_year,
    'configuration_revision', value.configuration_revision,
    'configuration_fingerprint', value.configuration_fingerprint,
    'purchases', scoring_authority.preview_mobile_calcutta_precision_safe(
      value.purchases),
    'ownership', scoring_authority.preview_mobile_calcutta_precision_safe(
      value.ownership),
    'financial_contract',
      scoring_authority.preview_mobile_calcutta_precision_safe(
        value.financial_contract),
    'imported_at', value.imported_at,
    'approved_at', value.approved_at)
    into configuration_value
  from scoring_authority.calcutta_configurations value
  where value.tournament_id = target_tournament
    and value.is_current and value.status = 'APPROVED';
  select pg_catalog.jsonb_build_object(
    'result_state', value.result_state,
    'result_payload',
      scoring_authority.preview_mobile_calcutta_precision_safe(
        value.result_payload),
    'configuration_fingerprint', value.configuration_fingerprint,
    'source_fingerprint', value.source_fingerprint,
    'payload_hash', value.payload_hash,
    'calculated_at', value.calculated_at,
    'published_at', value.published_at)
    into snapshot_value
  from scoring_authority.competition_derived_snapshots value
  where value.tournament_id = target_tournament
    and value.round_number = 0 and value.engine_key = 'CALCUTTA'
    and value.is_current;
  select pg_catalog.jsonb_build_object(
    'status', value.status,
    'requested_at', value.requested_at,
    'started_at', value.started_at,
    'completed_at', value.completed_at)
    into job_value
  from scoring_authority.competition_recalculation_jobs value
  where value.tournament_id = target_tournament
    and value.round_number = 0 and value.engine_key = 'CALCUTTA';
  select pg_catalog.to_jsonb(value) into publication_value
  from scoring_authority.preview_mobile_calcutta_publications value
  where value.tournament_id = target_tournament;
  select coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'player_id', player.player_id,
      'display_name', player.display_name)
    order by player.player_id), '[]'::jsonb)
    into players_value
  from scoring_authority.players player
  where player.player_id in (
    select purchase->>'player_id'
    from pg_catalog.jsonb_array_elements(
      coalesce(configuration_value->'purchases', '[]'::jsonb)
    ) purchase
    union
    select ownership->>'owner_player_id'
    from pg_catalog.jsonb_array_elements(
      coalesce(configuration_value->'ownership', '[]'::jsonb)
    ) ownership
  );
  select pg_catalog.count(*) into result_revision_value
  from scoring_authority.competition_derived_snapshots value
  where value.tournament_id = target_tournament
    and value.round_number = 0 and value.engine_key = 'CALCUTTA';
  return pg_catalog.jsonb_build_object(
    'ok', true,
    'data', pg_catalog.jsonb_build_object(
      'tournament_id', target_tournament,
      'configuration', configuration_value,
      'snapshot', snapshot_value,
      'job', job_value,
      'publication', publication_value,
      'players', players_value,
      'result_revision', result_revision_value));
end;
$$;

revoke all on function public.set_preview_mobile_calcutta_publication(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.read_preview_mobile_net_skins_v1(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.read_preview_mobile_calcutta_v1(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.set_preview_mobile_calcutta_publication(jsonb)
  to service_role;
grant execute on function public.read_preview_mobile_net_skins_v1(jsonb)
  to service_role;
grant execute on function public.read_preview_mobile_calcutta_v1(jsonb)
  to service_role;

notify pgrst, 'reload schema';

commit;
