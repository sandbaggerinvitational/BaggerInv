-- Fix PostgreSQL operator precedence in the completed-History importer.
--
-- The original fallback expression was parsed as if the literal "Round " were
-- JSON before applying ->>, which raised 22P02 before the atomic import could
-- commit.  Patch only the two known expressions in the already-defined
-- function and fail closed if its deployed definition is not the expected one.
do $migration$
declare
  function_signature regprocedure :=
    'public.import_preview_completed_history_year(jsonb)'::regprocedure;
  current_definition text;
  patched_definition text;
  unsafe_fragment constant text := '''Round '' || item->>''round_number''';
  safe_fragment constant text := '''Round '' || (item->>''round_number'')';
  unsafe_occurrences integer;
  safe_occurrences integer;
begin
  select pg_get_functiondef(function_signature) into current_definition;
  unsafe_occurrences := (
    length(current_definition) - length(replace(current_definition, unsafe_fragment, ''))
  ) / length(unsafe_fragment);

  if unsafe_occurrences <> 2 then
    raise exception using
      errcode = 'P0001',
      message = 'COMPLETED_HISTORY_ROUND_NAME_PATCH_PRECONDITION_FAILED',
      detail = format('Expected 2 unsafe expressions, found %s.', unsafe_occurrences);
  end if;

  patched_definition := replace(current_definition, unsafe_fragment, safe_fragment);
  execute patched_definition;

  select pg_get_functiondef(function_signature) into current_definition;
  unsafe_occurrences := (
    length(current_definition) - length(replace(current_definition, unsafe_fragment, ''))
  ) / length(unsafe_fragment);
  safe_occurrences := (
    length(current_definition) - length(replace(current_definition, safe_fragment, ''))
  ) / length(safe_fragment);

  if unsafe_occurrences <> 0 or safe_occurrences < 2 then
    raise exception using
      errcode = 'P0001',
      message = 'COMPLETED_HISTORY_ROUND_NAME_PATCH_VERIFICATION_FAILED',
      detail = format(
        'Unsafe expressions: %s; safe expressions: %s.',
        unsafe_occurrences,
        safe_occurrences
      );
  end if;
end;
$migration$;

notify pgrst, 'reload schema';
