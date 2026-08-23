-- Preserve the authoritative team assignment recorded on each Draft Pick.
-- The initial projection RPC inferred an untraded two-team snake order from
-- Draft Settings. Historical Drafts can contain Director-approved trades or
-- explicit order overrides, so that inference rejected valid source facts.
-- All pick-number, round, identity, roster/team, duplicate, immutability, and
-- fingerprint checks remain unchanged.

create or replace function public.import_preview_draft_projection(input jsonb) returns jsonb
language plpgsql security definer set search_path=scoring_authority,public,extensions,pg_temp as $$
declare
  draft jsonb;
  pick jsonb;
  target text;
  target_year integer;
  actor text := btrim(coalesce(input->>'requested_by',''));
  workbook text := btrim(coalesce(input->>'source_workbook_id',''));
  source_hash text;
  config_hash text;
  picks_hash text;
  payload_hash text;
  current_revision scoring_authority.draft_revisions%rowtype;
  inserted_revision scoring_authority.draft_revisions%rowtype;
  next_revision bigint;
  current_year integer;
  operation_value text;
  correction text;
  results jsonb := '[]'::jsonb;
  changed_count integer := 0;
  duplicate_count integer := 0;
  selected_count integer;
  distinct_player_count integer;
  pick_count integer;
  distinct_pick_count integer;
  minimum_pick integer;
  maximum_pick integer;
  pick_number_value integer;
begin
  if upper(btrim(coalesce(input->>'environment',''))) <> 'PREVIEW'
      or btrim(coalesce(input->>'project_ref','')) <> 'idgigvjjqkfbqjeredpb'
      or workbook = '' or workbook = '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4'
      or input->'source_tabs' <> '["Draft Settings","Draft Picks"]'::jsonb
      or btrim(coalesce(input->>'contract_version','')) <> 'draft-projection-v1'
      or actor = '' or jsonb_typeof(input->'drafts') <> 'array' or jsonb_array_length(input->'drafts') = 0 then
    return jsonb_build_object('ok',false,'code','COMPLETE_PREVIEW_DRAFT_PROJECTION_REQUIRED');
  end if;
  perform set_config('scoring_authority.draft_projection_import','on',true);
  select max(tournament_year) into current_year from scoring_authority.tournaments
    where tournament_year between 2000 and 2200;

  for draft in select value from jsonb_array_elements(input->'drafts') loop
    current_revision := null;
    target := btrim(coalesce(draft->>'tournament_id',''));
    target_year := coalesce((draft->>'tournament_year')::integer,0);
    source_hash := lower(btrim(coalesce(draft->>'source_fingerprint','')));
    config_hash := lower(btrim(coalesce(draft->>'configuration_fingerprint','')));
    picks_hash := lower(btrim(coalesce(draft->>'picks_fingerprint','')));
    payload_hash := lower(btrim(coalesce(draft->>'payload_fingerprint','')));
    correction := nullif(btrim(coalesce(draft->>'correction_reason',input->>'correction_reason','')),'');
    if target = '' or target_year < 2000
        or source_hash !~ '^[0-9a-f]{64}$' or config_hash !~ '^[0-9a-f]{64}$'
        or picks_hash !~ '^[0-9a-f]{64}$' or payload_hash !~ '^[0-9a-f]{64}$'
        or upper(btrim(coalesce(draft->>'validation_status',''))) <> 'VALID'
        or jsonb_typeof(draft->'validation_diagnostics') <> 'object'
        or jsonb_typeof(draft->'source_settings') <> 'object'
        or jsonb_typeof(draft->'source_picks') <> 'array'
        or jsonb_typeof(draft->'configuration') <> 'object'
        or jsonb_typeof(draft->'picks') <> 'array'
        or jsonb_typeof(draft->'presentation_seed') <> 'object' then
      return jsonb_build_object('ok',false,'code','COMPLETE_VALID_DRAFT_REVISION_REQUIRED','year',target_year);
    end if;
    if not exists(select 1 from scoring_authority.tournaments where tournament_id=target and tournament_year=target_year) then
      return jsonb_build_object('ok',false,'code','DRAFT_TOURNAMENT_NOT_FOUND','year',target_year);
    end if;
    if jsonb_array_length(draft->'picks') <> coalesce((draft->'configuration'->>'total_picks')::integer,0)
        or jsonb_array_length(draft->'picks') = 0 then
      return jsonb_build_object('ok',false,'code','DRAFT_PICK_COUNT_MISMATCH','year',target_year);
    end if;
    if not exists(select 1 from scoring_authority.teams where tournament_id=target and team_id=draft->'configuration'->>'team_1_id')
        or not exists(select 1 from scoring_authority.teams where tournament_id=target and team_id=draft->'configuration'->>'team_2_id')
        or not exists(select 1 from scoring_authority.teams where tournament_id=target and team_id=draft->'configuration'->>'first_pick_team_id') then
      return jsonb_build_object('ok',false,'code','DRAFT_TEAM_ID_UNRESOLVED','year',target_year);
    end if;
    if nullif(draft->'configuration'->>'team_1_captain_player_id','') is not null
        and not exists(select 1 from scoring_authority.players where player_id=draft->'configuration'->>'team_1_captain_player_id') then
      return jsonb_build_object('ok',false,'code','DRAFT_CAPTAIN_ID_UNRESOLVED','year',target_year);
    end if;
    if nullif(draft->'configuration'->>'team_2_captain_player_id','') is not null
        and not exists(select 1 from scoring_authority.players where player_id=draft->'configuration'->>'team_2_captain_player_id') then
      return jsonb_build_object('ok',false,'code','DRAFT_CAPTAIN_ID_UNRESOLVED','year',target_year);
    end if;
    select count(*),count(distinct (value->>'pick_number')::integer),
      min((value->>'pick_number')::integer),max((value->>'pick_number')::integer)
      into pick_count,distinct_pick_count,minimum_pick,maximum_pick
      from jsonb_array_elements(draft->'picks');
    if pick_count <> distinct_pick_count or minimum_pick <> 1
        or maximum_pick <> coalesce((draft->'configuration'->>'total_picks')::integer,0) then
      return jsonb_build_object('ok',false,'code','DRAFT_PICK_NUMBER_SEQUENCE_INVALID','year',target_year);
    end if;
    select count(*) filter(where nullif(value->>'player_id','') is not null),
      count(distinct nullif(value->>'player_id','')) filter(where nullif(value->>'player_id','') is not null)
      into selected_count,distinct_player_count from jsonb_array_elements(draft->'picks');
    if selected_count <> distinct_player_count then
      return jsonb_build_object('ok',false,'code','DRAFT_PLAYER_DUPLICATE','year',target_year);
    end if;
    -- Draft Picks.Team ID is the authoritative historical selecting-team fact.
    -- Draft Settings.format and first_pick_team_id describe the default format,
    -- but cannot reconstruct Director-approved trades/order overrides.
    for pick in select value from jsonb_array_elements(draft->'picks') loop
      pick_number_value := (pick->>'pick_number')::integer;
      if (pick->>'round_number')::integer <> ((pick_number_value - 1) / 2) + 1
          or (pick->>'pick_within_round')::integer <> mod(pick_number_value - 1,2) + 1 then
        return jsonb_build_object('ok',false,'code','DRAFT_PICK_ROUND_ORDER_INVALID','year',target_year,'pick',pick_number_value);
      end if;
      if upper(btrim(coalesce(pick->>'status',''))) not in ('PENDING','SELECTED')
          or (upper(btrim(coalesce(pick->>'status','')))='PENDING' and nullif(pick->>'player_id','') is not null)
          or (upper(btrim(coalesce(pick->>'status','')))='SELECTED'
            and (nullif(pick->>'player_id','') is null or nullif(pick->>'team_id','') is null)) then
        return jsonb_build_object('ok',false,'code','DRAFT_PICK_STATUS_INVALID','year',target_year,'pick',pick_number_value);
      end if;
      if nullif(pick->>'player_id','') is not null
          and not exists(select 1 from scoring_authority.players where player_id=pick->>'player_id') then
        return jsonb_build_object('ok',false,'code','DRAFT_PLAYER_ID_UNRESOLVED','year',target_year,'pick',pick->>'pick_number');
      end if;
      if nullif(pick->>'player_id','') is not null
          and not exists(select 1 from scoring_authority.tournament_players
            where tournament_id=target and player_id=pick->>'player_id' and team_id=pick->>'team_id') then
        return jsonb_build_object('ok',false,'code','DRAFT_PICK_ROSTER_TEAM_MISMATCH','year',target_year,'pick',pick->>'pick_number');
      end if;
      if nullif(pick->>'team_id','') is not null
          and not exists(select 1 from scoring_authority.teams where tournament_id=target and team_id=pick->>'team_id') then
        return jsonb_build_object('ok',false,'code','DRAFT_PICK_TEAM_ID_UNRESOLVED','year',target_year,'pick',pick->>'pick_number');
      end if;
    end loop;

    perform pg_advisory_xact_lock(hashtext('draft-projection:' || target));
    select r.* into current_revision from scoring_authority.draft_current_revisions c
      join scoring_authority.draft_revisions r on r.revision_id=c.revision_id
      where c.tournament_id=target for update of c;
    if current_revision.revision_id is not null
        and current_revision.source_fingerprint=source_hash
        and current_revision.configuration_fingerprint=config_hash
        and current_revision.picks_fingerprint=picks_hash
        and current_revision.payload_fingerprint=payload_hash then
      duplicate_count := duplicate_count + 1;
      results := results || jsonb_build_array(jsonb_build_object(
        'year',target_year,'changed',false,'duplicate',true,
        'revision_id',current_revision.revision_id,'revision_number',current_revision.revision_number,
        'payload_fingerprint',payload_hash));
      continue;
    end if;
    if current_revision.revision_id is not null and current_revision.source_fingerprint=source_hash then
      return jsonb_build_object('ok',false,'code','DRAFT_SOURCE_PROJECTION_CONFLICT','year',target_year);
    end if;
    if current_revision.revision_id is null then
      operation_value := 'INITIAL_IMPORT';
      correction := null;
    elsif target_year < current_year then
      if correction is null or length(correction) < 10 then
        return jsonb_build_object('ok',false,'code','DRAFT_HISTORICAL_CORRECTION_REASON_REQUIRED','year',target_year);
      end if;
      operation_value := 'HISTORICAL_CORRECTION';
    else
      operation_value := 'CURRENT_SYNC';
      correction := null;
    end if;
    select coalesce(max(revision_number),0)+1 into next_revision from scoring_authority.draft_revisions where tournament_id=target;
    insert into scoring_authority.draft_revisions(
      project_ref,source_workbook_id,source_tabs,tournament_id,tournament_year,revision_number,
      previous_revision_id,source_fingerprint,configuration_fingerprint,picks_fingerprint,payload_fingerprint,
      contract_version,validation_status,validation_diagnostics,source_settings,source_picks,
      configuration,presentation_seed,operation,correction_reason,synchronized_by
    ) values(
      'idgigvjjqkfbqjeredpb',workbook,input->'source_tabs',target,target_year,next_revision,
      current_revision.revision_id,source_hash,config_hash,picks_hash,payload_hash,
      'draft-projection-v1','VALID',draft->'validation_diagnostics',draft->'source_settings',draft->'source_picks',
      draft->'configuration',draft->'presentation_seed',operation_value,correction,actor
    ) returning * into inserted_revision;
    insert into scoring_authority.draft_configuration_facts(
      revision_id,tournament_id,tournament_year,draft_name,draft_date,draft_time,time_zone,location,
      status_mode,draft_format,total_picks,team_1_id,team_2_id,team_1_captain_player_id,
      team_2_captain_player_id,first_pick_team_id,notes
    ) values(
      inserted_revision.revision_id,target,target_year,draft->'configuration'->>'name',
      nullif(draft->'configuration'->>'date',''),nullif(draft->'configuration'->>'time',''),
      nullif(draft->'configuration'->>'time_zone',''),nullif(draft->'configuration'->>'location',''),
      nullif(draft->'configuration'->>'status_mode',''),nullif(draft->'configuration'->>'format',''),
      (draft->'configuration'->>'total_picks')::integer,draft->'configuration'->>'team_1_id',draft->'configuration'->>'team_2_id',
      nullif(draft->'configuration'->>'team_1_captain_player_id',''),nullif(draft->'configuration'->>'team_2_captain_player_id',''),
      draft->'configuration'->>'first_pick_team_id',nullif(draft->'configuration'->>'notes','')
    );
    insert into scoring_authority.draft_pick_facts(
      revision_id,tournament_id,tournament_year,pick_number,round_number,pick_within_round,
      source_team_id,team_id,player_id,player_name_snapshot,selected_at_source,selected_by_source,
      pick_status,notes,presentation_snapshot
    ) select inserted_revision.revision_id,target,target_year,(value->>'pick_number')::integer,
      (value->>'round_number')::integer,(value->>'pick_within_round')::integer,
      nullif(value->>'source_team_id',''),nullif(value->>'team_id',''),nullif(value->>'player_id',''),
      nullif(value->>'player_name',''),nullif(value->>'selected_at',''),nullif(value->>'selected_by',''),
      value->>'status',nullif(value->>'notes',''),coalesce(value->'presentation','{}'::jsonb)
      from jsonb_array_elements(draft->'picks');
    insert into scoring_authority.draft_current_revisions(tournament_id,tournament_year,revision_id,advanced_by)
      values(target,target_year,inserted_revision.revision_id,actor)
      on conflict(tournament_id) do update set revision_id=excluded.revision_id,
        tournament_year=excluded.tournament_year,advanced_by=excluded.advanced_by,advanced_at=now();
    insert into scoring_authority.audit_events(tournament_id,action,actor_id,metadata)
      values(target,'DRAFT_PROJECTION_VERSIONED',actor,jsonb_build_object(
        'year',target_year,'revisionId',inserted_revision.revision_id,'revisionNumber',next_revision,
        'previousRevisionId',current_revision.revision_id,'operation',operation_value,
        'sourceFingerprint',source_hash,'configurationFingerprint',config_hash,
        'picksFingerprint',picks_hash,'payloadFingerprint',payload_hash,'correctionReason',correction));
    changed_count := changed_count + 1;
    results := results || jsonb_build_array(jsonb_build_object(
      'year',target_year,'changed',true,'duplicate',false,'operation',operation_value,
      'revision_id',inserted_revision.revision_id,'revision_number',next_revision,
      'previous_revision_id',current_revision.revision_id,'payload_fingerprint',payload_hash));
    current_revision := null;
  end loop;
  return jsonb_build_object('ok',true,'changed',changed_count>0,'changed_count',changed_count,
    'duplicate_count',duplicate_count,'synchronization_fingerprint',input->>'synchronization_fingerprint','results',results);
end; $$;

revoke all on function public.import_preview_draft_projection(jsonb) from public,anon,authenticated;
grant execute on function public.import_preview_draft_projection(jsonb) to service_role;

notify pgrst,'reload schema';
