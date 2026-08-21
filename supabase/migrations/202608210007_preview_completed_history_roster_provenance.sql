-- Preserve the canonical roster source key on each immutable History revision.
-- Existing values are copied from the same tournament-scoped canonical roster;
-- no historical fact is inferred or rewritten.
alter table scoring_authority.completed_history_roster_facts
  add column source_roster_key text;

select set_config('scoring_authority.completed_history_import', 'on', true);

update scoring_authority.completed_history_roster_facts fact
set source_roster_key = roster.source_roster_key
from scoring_authority.tournament_players roster
where roster.tournament_id = fact.tournament_id
  and roster.player_id = fact.player_id
  and fact.source_roster_key is null;

do $backfill$
begin
  if exists (
    select 1
    from scoring_authority.completed_history_roster_facts
    where btrim(coalesce(source_roster_key, '')) = ''
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'COMPLETED_HISTORY_ROSTER_PROVENANCE_BACKFILL_FAILED';
  end if;
end;
$backfill$;

alter table scoring_authority.completed_history_roster_facts
  alter column source_roster_key set not null,
  add constraint completed_history_roster_source_key_nonempty
    check (length(btrim(source_roster_key)) > 0);

-- Add the field to future immutable revision inserts. Fail closed if the
-- deployed function is not the exact contract established by 210005/210006.
do $migration$
declare
  function_signature regprocedure :=
    'public.import_preview_completed_history_year(jsonb)'::regprocedure;
  current_definition text;
  patched_definition text;
  unsafe_columns constant text :=
    'participation_status, is_captain, is_governor, tournament_handicap, source_payload';
  safe_columns constant text :=
    'participation_status, is_captain, is_governor, tournament_handicap, source_roster_key, source_payload';
  unsafe_values constant text :=
    'nullif(item->>''tournament_handicap'', '''')::numeric,
      coalesce(item->''source_payload'', ''{}''::jsonb)';
  safe_values constant text :=
    'nullif(item->>''tournament_handicap'', '''')::numeric,
      item->>''source_roster_key'',
      coalesce(item->''source_payload'', ''{}''::jsonb)';
  column_occurrences integer;
  value_occurrences integer;
begin
  select pg_get_functiondef(function_signature) into current_definition;
  column_occurrences := (
    length(current_definition) - length(replace(current_definition, unsafe_columns, ''))
  ) / length(unsafe_columns);
  value_occurrences := (
    length(current_definition) - length(replace(current_definition, unsafe_values, ''))
  ) / length(unsafe_values);

  if column_occurrences <> 1 or value_occurrences <> 1 then
    raise exception using
      errcode = 'P0001',
      message = 'COMPLETED_HISTORY_ROSTER_PROVENANCE_PATCH_PRECONDITION_FAILED',
      detail = format(
        'Column fragments: %s; value fragments: %s.',
        column_occurrences,
        value_occurrences
      );
  end if;

  patched_definition := replace(current_definition, unsafe_columns, safe_columns);
  patched_definition := replace(patched_definition, unsafe_values, safe_values);
  execute patched_definition;

  select pg_get_functiondef(function_signature) into current_definition;
  if position(safe_columns in current_definition) = 0
     or position(safe_values in current_definition) = 0 then
    raise exception using
      errcode = 'P0001',
      message = 'COMPLETED_HISTORY_ROSTER_PROVENANCE_PATCH_VERIFICATION_FAILED';
  end if;
end;
$migration$;

notify pgrst, 'reload schema';
