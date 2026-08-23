-- Step 8 deployment correction: Preview contains deliberately out-of-range
-- scoring fixture tournaments. They must never make the real current Draft
-- look historical to the immutable projection importer.

do $$
declare
  function_definition text;
  old_statement constant text := 'select max(tournament_year) into current_year from scoring_authority.tournaments;';
  new_statement constant text := 'select max(tournament_year) into current_year from scoring_authority.tournaments
    where tournament_year between 2000 and 2200;';
begin
  select pg_get_functiondef('public.import_preview_draft_projection(jsonb)'::regprocedure)
    into function_definition;
  if position(old_statement in function_definition) > 0 then
    execute replace(function_definition, old_statement, new_statement);
  elsif position(new_statement in function_definition) = 0 then
    raise exception 'Step 8 Draft importer current-year statement was not recognized.';
  end if;
end; $$;

notify pgrst,'reload schema';
