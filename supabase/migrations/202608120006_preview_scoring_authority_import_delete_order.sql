-- Canonical replacement must remove match-owned rows before immutable
-- snapshots because match_holes also references the snapshot.

alter function public.replace_preview_scoring_authority_import(jsonb)
  rename to replace_preview_scoring_authority_import_phase2_delete_inner;

revoke all on function public.replace_preview_scoring_authority_import_phase2_delete_inner(jsonb)
  from public, anon, authenticated, service_role;

create or replace function public.replace_preview_scoring_authority_import(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = scoring_authority, public, extensions, pg_temp
as $$
declare
  tournament_key text := payload#>>'{tournament,tournament_id}';
begin
  if coalesce(tournament_key, '') <> '' then
    delete from scoring_authority.matches where tournament_id = tournament_key;
    delete from scoring_authority.scoring_snapshots where tournament_id = tournament_key;
    delete from scoring_authority.tournaments where tournament_id = tournament_key;
  end if;
  return public.replace_preview_scoring_authority_import_phase2_delete_inner(payload);
end;
$$;

revoke all on function public.replace_preview_scoring_authority_import(jsonb)
  from public, anon, authenticated;
grant execute on function public.replace_preview_scoring_authority_import(jsonb) to service_role;

notify pgrst, 'reload schema';
