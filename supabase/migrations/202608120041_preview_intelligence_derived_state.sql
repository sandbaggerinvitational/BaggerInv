-- Preview-only Tournament Intelligence, Projection Editorial, and gated Final Recap.
-- Reuses the shared competition derived tables and keeps all administration service-only.

create or replace function public.write_intelligence_derived_bundle(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = scoring_authority, public, extensions, pg_temp
as $$
declare
  target_tournament text := btrim(coalesce(input->>'tournament_id', ''));
  target_source text := lower(btrim(coalesce(input->>'source_fingerprint', '')));
  target_actor text := left(btrim(coalesce(input->>'calculated_by', '')), 180);
  target_duration numeric := greatest(0, coalesce((input->>'duration_ms')::numeric, 0));
  engine jsonb;
  target_engine_key text;
  target_engine_version text;
  payload jsonb;
  payload_hash text;
  snapshot_id uuid;
  written jsonb := '[]'::jsonb;
begin
  if upper(btrim(coalesce(input->>'environment', ''))) <> 'PREVIEW' or target_tournament = ''
      or target_actor = '' or target_source !~ '^[0-9a-f]{64}$'
      or jsonb_typeof(input->'engines') <> 'array' then
    return jsonb_build_object('ok', false, 'code', 'COMPLETE_INTELLIGENCE_BUNDLE_REQUIRED');
  end if;
  if not exists (select 1 from scoring_authority.tournaments where tournament_id = target_tournament) then
    return jsonb_build_object('ok', false, 'code', 'TOURNAMENT_NOT_FOUND');
  end if;
  for engine in select value from jsonb_array_elements(input->'engines') loop
    target_engine_key := upper(btrim(coalesce(engine->>'key', '')));
    target_engine_version := btrim(coalesce(engine->>'version', ''));
    payload := coalesce(engine->'result', 'null'::jsonb);
    payload_hash := lower(btrim(coalesce(engine->>'payload_hash', '')));
    if target_engine_key not in ('TOURNAMENT_INTELLIGENCE', 'PROJECTION_EDITORIAL', 'TOURNAMENT_FINAL_RECAP')
        or target_engine_version = '' or jsonb_typeof(payload) <> 'object' or payload_hash !~ '^[0-9a-f]{64}$' then
      return jsonb_build_object('ok', false, 'code', 'INVALID_INTELLIGENCE_ENGINE_PAYLOAD');
    end if;
    if target_engine_key = 'TOURNAMENT_FINAL_RECAP' and coalesce((input#>>'{final_gate,eligible}')::boolean, false) is not true then
      return jsonb_build_object('ok', false, 'code', 'FINAL_RECAP_GATE_REQUIRED');
    end if;
    select id into snapshot_id from scoring_authority.competition_derived_snapshots
    where tournament_id = target_tournament and round_number = 0
      and scoring_authority.competition_derived_snapshots.engine_key = target_engine_key
      and scoring_authority.competition_derived_snapshots.engine_version = target_engine_version
      and source_fingerprint = target_source
      and scoring_authority.competition_derived_snapshots.payload_hash = payload_hash limit 1;
    update scoring_authority.competition_derived_snapshots set is_current = false
    where tournament_id = target_tournament and round_number = 0
      and scoring_authority.competition_derived_snapshots.engine_key = target_engine_key and is_current
      and id is distinct from snapshot_id;
    if snapshot_id is null then
      insert into scoring_authority.competition_derived_snapshots (
        tournament_id, round_number, engine_key, engine_version, configuration_fingerprint,
        source_fingerprint, result_state, result_payload, payload_hash, is_current, calculated_at
      ) values (target_tournament, 0, target_engine_key, target_engine_version,
        encode(digest(target_engine_version || ':canonical-supabase-input-v1', 'sha256'), 'hex'),
        target_source, case when target_engine_key = 'TOURNAMENT_FINAL_RECAP' then 'OFFICIAL' else 'PROVISIONAL' end,
        payload, payload_hash, true, now()) returning id into snapshot_id;
    else
      update scoring_authority.competition_derived_snapshots set is_current = true, calculated_at = now() where id = snapshot_id;
    end if;
    insert into scoring_authority.competition_derived_runs (
      tournament_id, round_number, engine_key, engine_version, configuration_fingerprint,
      source_fingerprint, payload_hash, status, calculated_by, started_at, completed_at, duration_ms
    ) values (target_tournament, 0, target_engine_key, target_engine_version,
      encode(digest(target_engine_version || ':canonical-supabase-input-v1', 'sha256'), 'hex'),
      target_source, payload_hash, 'SUCCEEDED', target_actor, now(), now(), target_duration)
    on conflict (tournament_id, round_number, engine_key, engine_version, configuration_fingerprint,
      source_fingerprint, payload_hash, status) do update set completed_at = now(), duration_ms = excluded.duration_ms;
    insert into scoring_authority.competition_recalculation_jobs (
      tournament_id, round_number, engine_key, status, requested_source_revision, requested_at, completed_at, updated_at
    ) values (target_tournament, 0, target_engine_key, 'SUCCEEDED',
      jsonb_build_object('sourceFingerprint', target_source, 'payloadHash', payload_hash), now(), now(), now())
    on conflict (tournament_id, round_number, engine_key) do update set status = 'SUCCEEDED',
      requested_source_revision = excluded.requested_source_revision, completed_at = now(), updated_at = now(),
      last_error_code = null, last_error_safe = null;
    written := written || jsonb_build_array(jsonb_build_object('engineKey', target_engine_key, 'snapshotId', snapshot_id));
  end loop;
  insert into scoring_authority.audit_events (tournament_id, action, actor_id, metadata)
  values (target_tournament, 'INTELLIGENCE_DERIVED_BUNDLE_CALCULATED', target_actor,
    jsonb_build_object('sourceFingerprint', target_source, 'engines', written, 'finalGate', input->'final_gate'));
  return jsonb_build_object('ok', true, 'written', written, 'final_gate', input->'final_gate');
end;
$$;

revoke all on function public.write_intelligence_derived_bundle(jsonb) from public, anon, authenticated;
grant execute on function public.write_intelligence_derived_bundle(jsonb) to service_role;

notify pgrst, 'reload schema';
