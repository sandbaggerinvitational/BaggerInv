-- Step 10B: preserve legacy Production publication payloads without creating
-- a new Odds publication. Migration 004 used an unqualified `milestone`
-- reference that conflicts with its PL/pgSQL variable and fails before the
-- first immutable snapshot can be imported.

create or replace function public.import_production_published_odds(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = production_control, scoring_authority, public, extensions, pg_temp
as $$
declare
  tabs constant jsonb := '["Odds Control","Odds Snapshots","Odds Team Results","Odds Player Results"]'::jsonb;
  registration jsonb;
  item jsonb;
  milestone_value text;
  current_milestone text := btrim(coalesce(input#>>'{payload,current_official_milestone}',''));
  item_published_at timestamptz;
  payload_published_at timestamptz;
  snapshot_id uuid;
  current_snapshot_id uuid;
  next_revision bigint;
  snapshot_count integer;
  error_state text;
  error_constraint text;
begin
  perform production_control.assert_projection_scope(input,'PUBLISHED_ODDS','published-odds-v1',tabs);
  if upper(input->>'validation_status') <> 'VALID'
     or current_milestone not in ('Pre-Tournament','After Round 1','After Round 2','Round 3 Pairings Announced','Final Results')
     or jsonb_typeof(input#>'{payload,snapshots}') <> 'array'
     or jsonb_array_length(input#>'{payload,snapshots}') = 0 then
    return jsonb_build_object('ok',false,'code','COMPLETE_PRODUCTION_PUBLISHED_ODDS_REQUIRED');
  end if;
  snapshot_count := jsonb_array_length(input#>'{payload,snapshots}');
  if (select count(distinct value->>'milestone') from jsonb_array_elements(input#>'{payload,snapshots}')) <> snapshot_count
     or not exists(select 1 from jsonb_array_elements(input#>'{payload,snapshots}') s where s->>'milestone'=current_milestone) then
    return jsonb_build_object('ok',false,'code','PRODUCTION_PUBLISHED_ODDS_MILESTONE_INVALID');
  end if;

  for item in select value from jsonb_array_elements(input#>'{payload,snapshots}') loop
    milestone_value := btrim(coalesce(item->>'milestone',''));
    if milestone_value not in ('Pre-Tournament','After Round 1','After Round 2','Round 3 Pairings Announced','Final Results')
       or coalesce((item->>'phase_order')::integer,-1) <>
          array_position(array['Pre-Tournament','After Round 1','After Round 2','Round 3 Pairings Announced','Final Results'],milestone_value)-1
       or coalesce((item#>>'{published_payload,year}')::integer,0) <> 2026
       or item#>>'{published_payload,phase}' <> milestone_value
       or jsonb_typeof(item#>'{published_payload,teams}') <> 'array'
       or jsonb_array_length(item#>'{published_payload,teams}') = 0
       or jsonb_typeof(item#>'{published_payload,players}') <> 'array'
       or jsonb_array_length(item#>'{published_payload,players}') = 0
       or lower(btrim(coalesce(item->>'payload_hash',''))) !~ '^[0-9a-f]{64}$'
       or lower(btrim(coalesce(item->>'google_publication_fingerprint',''))) !~ '^[0-9a-f]{64}$'
       or coalesce((item->>'publication_verified')::boolean,false) is not true then
      return jsonb_build_object('ok',false,'code','PRODUCTION_PUBLISHED_ODDS_SNAPSHOT_INVALID','milestone',milestone_value);
    end if;
    begin
      item_published_at := (item->>'published_at')::timestamptz;
      payload_published_at := (item#>>'{published_payload,publishedAt}')::timestamptz;
    exception when others then
      return jsonb_build_object('ok',false,'code','PRODUCTION_PUBLISHED_ODDS_TIMESTAMP_INVALID');
    end;
    if item_published_at is null or payload_published_at is null or item_published_at <> payload_published_at then
      return jsonb_build_object('ok',false,'code','PRODUCTION_PUBLISHED_ODDS_TIMESTAMP_MISMATCH');
    end if;
  end loop;

  registration := production_control.register_projection_revision(input,'PUBLISHED_ODDS','published-odds-v1',tabs);
  if not coalesce((registration->>'changed')::boolean,false) then return registration; end if;

  for item in select value from jsonb_array_elements(input#>'{payload,snapshots}')
    order by (value->>'phase_order')::integer loop
    milestone_value := item->>'milestone';
    snapshot_id := null;
    select s.id into snapshot_id
    from scoring_authority.odds_published_snapshots s
    where s.tournament_id = '2026'
      and s.milestone = item->>'milestone'
      and s.published_at = (item->>'published_at')::timestamptz
      and s.payload_hash = lower(item->>'payload_hash');
    if snapshot_id is null then
      select coalesce(max(s.publication_revision),0)+1 into next_revision
      from scoring_authority.odds_published_snapshots s
      where s.tournament_id = '2026' and s.milestone = item->>'milestone';
      insert into scoring_authority.odds_published_snapshots(
        tournament_id,milestone,phase_order,publication_revision,published_at,published_payload,
        payload_hash,source_fingerprint,engine_version,engine_metadata,
        google_publication_fingerprint,google_publication_reference,is_current_for_milestone,
        is_current_official,publication_verified,imported_by,logical_payload_hash,
        settings_fingerprint,ratings_fingerprint,pairing_fingerprint,deterministic_seed,
        publication_actor_id,mirror_status
      ) values(
        '2026',milestone_value,(item->>'phase_order')::integer,next_revision,
        (item->>'published_at')::timestamptz,item->'published_payload',lower(item->>'payload_hash'),
        nullif(lower(btrim(coalesce(item->>'source_fingerprint',''))),''),
        nullif(btrim(coalesce(item->>'engine_version','')),''),coalesce(item->'engine_metadata','{}'::jsonb),
        lower(item->>'google_publication_fingerprint'),coalesce(item->'google_publication_reference','{}'::jsonb),
        false,false,true,input->>'requested_by',
        nullif(lower(btrim(coalesce(item->>'logical_payload_hash',''))),''),
        nullif(lower(btrim(coalesce(item->>'settings_fingerprint',''))),''),
        nullif(lower(btrim(coalesce(item->>'ratings_fingerprint',''))),''),
        nullif(lower(btrim(coalesce(item->>'pairing_fingerprint',''))),''),
        nullif(btrim(coalesce(item->>'deterministic_seed','')),''),
        nullif(btrim(coalesce(item->>'publication_actor_id','')),''),'VERIFIED_GOOGLE_IMPORT'
      ) returning id into snapshot_id;
    end if;
    update scoring_authority.odds_published_snapshots s set is_current_for_milestone=false
    where s.tournament_id='2026' and s.milestone=item->>'milestone'
      and s.id<>snapshot_id and s.is_current_for_milestone;
    update scoring_authority.odds_published_snapshots s
    set is_current_for_milestone=true where s.id=snapshot_id;
    if milestone_value=current_milestone then current_snapshot_id:=snapshot_id; end if;
  end loop;

  update scoring_authority.odds_published_snapshots s set is_current_official=false
  where s.tournament_id='2026' and s.is_current_official and s.id<>current_snapshot_id;
  update scoring_authority.odds_published_snapshots s
  set is_current_official=true where s.id=current_snapshot_id;
  insert into scoring_authority.odds_snapshot_import_runs(
    tournament_id,source_workbook_id,import_fingerprint,current_official_milestone,status,snapshot_count,requested_by
  ) values('2026',input->>'source_workbook_id',lower(input->>'payload_fingerprint'),current_milestone,
    'APPLIED',snapshot_count,input->>'requested_by');
  return registration || jsonb_build_object(
    'snapshot_count',snapshot_count,
    'current_official_milestone',current_milestone,
    'current_snapshot_id',current_snapshot_id,
    'values_recalculated',false,
    'publication_created',false,
    'mirror_job_created',false,
    'shadow_only',true
  );
exception when others then
  get stacked diagnostics error_state = returned_sqlstate, error_constraint = constraint_name;
  return jsonb_build_object(
    'ok',false,
    'code','PRODUCTION_PUBLISHED_ODDS_IMPORT_FAILED',
    'failure_class',case
      when error_state='42702' then 'AMBIGUOUS_REFERENCE'
      when error_state like '23%' then 'DATA_CONSTRAINT'
      else 'DATABASE_OPERATION'
    end,
    'sqlstate',error_state,
    'constraint',nullif(error_constraint,'')
  );
end;
$$;

revoke all on function public.import_production_published_odds(jsonb)
from public, anon, authenticated, service_role;
grant execute on function public.import_production_published_odds(jsonb) to service_role;
