-- Preserve the canonical roster source key on each immutable History revision.
-- The already-certified 2017 revision stays immutable. Its read projection
-- obtains the same key from the tournament-scoped canonical roster. Future
-- revisions store the key directly.
alter table scoring_authority.completed_history_roster_facts
  add column source_roster_key text;

alter table scoring_authority.completed_history_roster_facts
  add constraint completed_history_roster_source_key_nonempty
    check (source_roster_key is not null and length(btrim(source_roster_key)) > 0)
    not valid;

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

-- Compatibility for the one immutable revision created before this column
-- existed. The current read contract remains deterministic and tournament-
-- scoped; it never uses a free-text player join.
do $read_contract$
declare
  function_signature regprocedure :=
    'public.read_preview_completed_history(jsonb)'::regprocedure;
  current_definition text;
  patched_definition text;
  unsafe_fragment constant text :=
    'select jsonb_agg(to_jsonb(roster) order by roster.team_side, roster.display_name, roster.player_id)
        from scoring_authority.completed_history_roster_facts roster
        where roster.revision_id = revision_value';
  safe_fragment constant text :=
    'select jsonb_agg(
          to_jsonb(roster) || jsonb_build_object(
            ''source_roster_key'',
            coalesce(roster.source_roster_key, canonical_roster.source_roster_key)
          )
          order by roster.team_side, roster.display_name, roster.player_id
        )
        from scoring_authority.completed_history_roster_facts roster
        left join scoring_authority.tournament_players canonical_roster
          on canonical_roster.tournament_id = roster.tournament_id
         and canonical_roster.player_id = roster.player_id
        where roster.revision_id = revision_value';
  unsafe_occurrences integer;
begin
  select pg_get_functiondef(function_signature) into current_definition;
  unsafe_occurrences := (
    length(current_definition) - length(replace(current_definition, unsafe_fragment, ''))
  ) / length(unsafe_fragment);
  if unsafe_occurrences <> 1 then
    raise exception using
      errcode = 'P0001',
      message = 'COMPLETED_HISTORY_ROSTER_READ_PATCH_PRECONDITION_FAILED',
      detail = format('Expected 1 read fragment, found %s.', unsafe_occurrences);
  end if;

  patched_definition := replace(current_definition, unsafe_fragment, safe_fragment);
  execute patched_definition;

  select pg_get_functiondef(function_signature) into current_definition;
  if position(safe_fragment in current_definition) = 0 then
    raise exception using
      errcode = 'P0001',
      message = 'COMPLETED_HISTORY_ROSTER_READ_PATCH_VERIFICATION_FAILED';
  end if;
end;
$read_contract$;

notify pgrst, 'reload schema';
