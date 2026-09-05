-- Legacy-adopted Odds publication compatibility only. Installation is inert:
-- no publication, pointer, withdrawal, Setup, or scoring rows are changed.
begin;

-- A modern publication carries publication_state_revision explicitly. The
-- retained July 2026 Google-adopted snapshot predates that column, so its
-- immutable publication_revision is the compatible identity only when both
-- the publication and snapshot retain their certified legacy provenance.
create function production_control.odds_publication_effective_revision_v1(
  snapshot jsonb,
  publication jsonb
)
returns bigint
language plpgsql
immutable
security definer
set search_path = pg_catalog
as $effective_odds_publication_revision$
declare
  explicit_revision text := coalesce(
    snapshot->>'publication_state_revision', ''
  );
  legacy_revision text := coalesce(snapshot->>'publication_revision', '');
begin
  if explicit_revision ~ '^[0-9]+$' then
    return explicit_revision::bigint;
  end if;
  if (not snapshot ? 'publication_state_revision'
        or pg_catalog.jsonb_typeof(snapshot->'publication_state_revision') =
          'null')
     and publication->>'adoption_kind' = 'LEGACY_GOOGLE_ADOPTED'
     and snapshot->>'authority_contract_version' =
       'legacy-google-published-odds-v1'
     and legacy_revision ~ '^[0-9]+$' then
    return legacy_revision::bigint;
  end if;
  return null;
exception when invalid_text_representation or numeric_value_out_of_range then
  return null;
end;
$effective_odds_publication_revision$;

revoke all on function
  production_control.odds_publication_effective_revision_v1(jsonb,jsonb)
from public, anon, authenticated, service_role;

-- Preserve the pointer/publication fail-closed checks from migration 087. A
-- missing pointer now also clears the base current flag instead of returning a
-- possibly-current legacy projection unchanged.
create or replace function
  production_control.odds_publication_withdrawal_projection_v1(
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

  publication := coalesce(base#>'{data,publication}', '{}'::jsonb);
  select value.* into pointer
  from scoring_authority.odds_publication_public_pointer_v1 value
  where value.tournament_id = target;
  if not found then
    select coalesce(pg_catalog.jsonb_agg(
      item.value || pg_catalog.jsonb_build_object(
        'is_current_official', false,
        'publication_lifecycle', 'HISTORICAL',
        'withdrawal', 'null'::jsonb
      ) order by item.ordinality
    ), '[]'::jsonb) into snapshots
    from pg_catalog.jsonb_array_elements(coalesce(
      base#>'{data,snapshots}', '[]'::jsonb
    )) with ordinality item(value, ordinality);
    return pg_catalog.jsonb_set(
      base, '{data}',
      (base->'data') || pg_catalog.jsonb_build_object(
        'snapshots', snapshots
      )
    );
  end if;

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
        and coalesce(
          production_control.odds_publication_effective_revision_v1(
            item.value, publication
          ) = pointer.current_publication_revision,
          false
        ),
      'publication_lifecycle', case
        when event.withdrawal_event_id is not null then 'WITHDRAWN'
        when pointer.publication_state = 'PUBLISHED'
          and coalesce((item.value->>'is_current_official')::boolean, false)
          and coalesce(
            production_control.odds_publication_effective_revision_v1(
              item.value, publication
            ) = pointer.current_publication_revision,
            false
          )
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
   and event.publication_revision =
     production_control.odds_publication_effective_revision_v1(
       item.value, publication
     );

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

-- The same provenance-bounded effective revision must guard Phase B. Patch
-- only the existing snapshot-identity predicate; all locks, CAS checks,
-- idempotency, audit, and mutation statements remain byte-for-byte unchanged.
do $patch_legacy_withdrawal_identity$
declare
  definition text;
  needle text := $needle$if snapshot.publication_state_revision is distinct from
       expected_publication_revision then$needle$;
  replacement text := $replacement$if production_control.odds_publication_effective_revision_v1(
       pg_catalog.to_jsonb(snapshot), pg_catalog.to_jsonb(current_value)
     ) is distinct from expected_publication_revision then$replacement$;
begin
  if pg_catalog.to_regprocedure(
    'public.withdraw_production_odds_publication_v1(jsonb)'
  ) is null then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ODDS_WITHDRAWAL_V1_REQUIRED';
  end if;
  definition := pg_catalog.pg_get_functiondef(
    'public.withdraw_production_odds_publication_v1(jsonb)'::regprocedure
  );
  if pg_catalog.strpos(definition, needle) = 0 then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ODDS_WITHDRAWAL_IDENTITY_SOURCE_CHANGED';
  end if;
  execute pg_catalog.replace(definition, needle, replacement);
end;
$patch_legacy_withdrawal_identity$;

commit;
