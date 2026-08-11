-- Preview-only parity companion for the one-column Google Live Matches migration.
-- It makes lifecycle truth explicit for already-Final canonical matches without
-- changing match, hole, or permission revision domains.

create or replace function public.backfill_preview_final_match_locks(input jsonb)
returns jsonb language plpgsql security definer
set search_path = scoring_authority, public, extensions, pg_temp
as $$
declare
  target_tournament text := input->>'tournament_id';
  actor text := input->>'actor_id';
  gate scoring_authority.ingress_gates%rowtype;
  changed_ids text[] := array[]::text[];
  changed_count integer := 0;
  final_count integer := 0;
begin
  if upper(coalesce(input->>'environment', '')) <> 'PREVIEW'
     or coalesce((input->>'director_authorized')::boolean, false) is not true
     or coalesce(target_tournament, '') = ''
     or coalesce(actor, '') = '' then
    return jsonb_build_object('ok', false, 'code', 'DIRECTOR_REQUIRED');
  end if;

  select * into gate from scoring_authority.ingress_gates
    where tournament_id = target_tournament for update;
  if not found or gate.authority <> 'SUPABASE' or gate.state <> 'OPEN' then
    return jsonb_build_object('ok', false, 'code', 'PREVIEW_AUTHORITY_GATE_REQUIRED');
  end if;
  if exists (select 1 from scoring_authority.google_outbox_events
      where tournament_id = target_tournament and status <> 'DELIVERED') then
    return jsonb_build_object('ok', false, 'code', 'GOOGLE_OUTBOX_NOT_DRAINED');
  end if;

  with updated as (
    update scoring_authority.matches
      set scoring_locked = true, updated_at = clock_timestamp()
      where tournament_id = target_tournament and status = 'FINAL' and not scoring_locked
      returning match_id
  ) select coalesce(array_agg(match_id order by match_id), array[]::text[]), count(*)::integer
    into changed_ids, changed_count from updated;

  select count(*)::integer into final_count from scoring_authority.matches
    where tournament_id = target_tournament and status = 'FINAL';

  if changed_count > 0 then
    insert into scoring_authority.audit_events
      (tournament_id, match_id, mutation_key, action, actor_id, metadata)
    select target_tournament, match_id,
      'preview-live-matches-scoring-locked:' || match_id,
      'PREVIEW_SCORING_LOCK_SCHEMA_BACKFILLED', actor,
      jsonb_build_object('scoring_locked', true, 'match_revision_unchanged', true,
        'hole_revisions_unchanged', true, 'permission_revision_unchanged', true)
    from unnest(changed_ids) match_id;
  end if;

  return jsonb_build_object('ok', true, 'code', 'FINAL_MATCH_LOCKS_BACKFILLED',
    'changed', changed_count, 'changed_match_ids', to_jsonb(changed_ids),
    'final_matches', final_count, 'revisions_changed', false);
end;
$$;

revoke all on function public.backfill_preview_final_match_locks(jsonb) from public, anon, authenticated;
grant execute on function public.backfill_preview_final_match_locks(jsonb) to service_role;

notify pgrst, 'reload schema';
