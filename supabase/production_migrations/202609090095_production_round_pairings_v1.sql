-- Inert installation. No pairings, contexts, revisions, or receipts are created.
begin;

alter table production_control.tournament_setup_operation_receipts_v1
  drop constraint tournament_setup_operation_receipts_v1_action_check;
alter table production_control.tournament_setup_operation_receipts_v1
  add constraint tournament_setup_operation_receipts_v1_action_check check (action in (
    'UPDATE_TOURNAMENT', 'UPDATE_TEAM', 'ASSIGN_ROSTER_TEAM', 'UPDATE_ROUND',
    'UPSERT_COURSE', 'UPSERT_MATCH', 'REPLACE_PAIRINGS', 'PREPARE_SCORING_CONTEXT',
    'REPLACE_ROUND_PAIRINGS'
  ));

create function public.mutate_production_round_pairings_v1(input jsonb)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, production_control, scoring_authority
as $$
declare
  actor text := input#>>'{authorization,player_id}';
  actor_auth uuid;
  request_id uuid;
  expected bigint;
  current_revision bigint;
  next_revision bigint;
  declared_hash text := input->>'request_payload_hash';
  database_hash text;
  receipt production_control.tournament_setup_operation_receipts_v1%rowtype;
  round_number_value integer;
  current_handicap uuid;
  match_value scoring_authority.matches%rowtype;
  row_value jsonb;
  player_value jsonb;
  canonical jsonb;
  changed_ids text[] := '{}';
  seen_players text[] := '{}';
  seen_slots text[];
  target text;
  player_id_value text;
  side_value integer;
  slot_value integer;
  required_count integer;
  roster_count integer;
  result_value jsonb;
  response_value jsonb;
  failure_code text;
begin
  perform production_control.assert_tournament_setup_runtime_v1(input);
  if input->>'operation' is distinct from 'REPLACE_ROUND_PAIRINGS'
    or coalesce(input->>'expected_revision','') !~ '^[0-9]+$'
    or coalesce(input->>'round_number','') !~ '^[1-3]$'
    or coalesce(declared_hash,'') !~ '^[0-9a-f]{64}$'
    or jsonb_typeof(input->'matches') is distinct from 'array'
    or jsonb_array_length(input->'matches') not between 1 and 12
    or input->>'actor_player_id' is distinct from actor
    or input->>'actor_auth_user_id' is distinct from input#>>'{authorization,auth_user_id}' then
    raise exception 'TOURNAMENT_SETUP_INPUT_INVALID';
  end if;
  actor_auth := (input#>>'{authorization,auth_user_id}')::uuid;
  request_id := (input->>'operation_request_id')::uuid;
  if request_id is null then raise exception 'TOURNAMENT_SETUP_OPERATION_REQUEST_ID_REQUIRED'; end if;
  expected := (input->>'expected_revision')::bigint;
  round_number_value := (input->>'round_number')::integer;
  database_hash := production_control.tournament_setup_hash_v1(input-'request_payload_hash');
  -- Same lock as individual Setup mutations; idempotency is checked before CAS.
  perform pg_advisory_xact_lock(hashtextextended('production-tournament-setup-v1:2026',0));
  select * into receipt from production_control.tournament_setup_operation_receipts_v1
    where tournament_id='2026' and action='REPLACE_ROUND_PAIRINGS' and operation_request_id=request_id;
  if found then
    if receipt.database_request_payload_hash=database_hash and receipt.declared_request_payload_hash=declared_hash then
      return receipt.response || jsonb_build_object('idempotent',true);
    end if;
    raise exception 'TOURNAMENT_SETUP_IDEMPOTENCY_CONFLICT';
  end if;
  current_revision := production_control.tournament_setup_revision_v1('2026');
  if current_revision<>expected then raise exception 'TOURNAMENT_SETUP_REVISION_STALE'; end if;
  next_revision := current_revision+1;
  -- Hold the approved pointer and roster while validating and writing the set.
  select revision_id into strict current_handicap from scoring_authority.handicap_revision_current
    where tournament_id='2026' for share;
  if input->>'expected_handicap_revision_id' is distinct from current_handicap::text then
    raise exception 'TOURNAMENT_SETUP_HANDICAP_REVISION_STALE';
  end if;
  perform 1 from scoring_authority.tournament_players where tournament_id='2026' for share;
  select count(*) into roster_count from scoring_authority.tournament_players
    where tournament_id='2026' and participation_status='ACTIVE';
  if (select count(*) from scoring_authority.matches where tournament_id='2026'
      and round_number=round_number_value) <> jsonb_array_length(input->'matches')
    or (select count(distinct value->>'match_id') from jsonb_array_elements(input->'matches'))
       <> jsonb_array_length(input->'matches') then
    raise exception 'TOURNAMENT_SETUP_ROUND_MATCH_SET_INVALID';
  end if;

  -- Validate the complete desired round BEFORE any write. Cross-match swaps are
  -- checked against the desired set, not against obsolete assignments.
  for row_value in select value from jsonb_array_elements(input->'matches') order by value->>'match_id' loop
    target := row_value->>'match_id';
    player_id_value := null;
    select * into match_value from scoring_authority.matches where match_id=target
      and tournament_id='2026' and round_number=round_number_value for update;
    if not found then raise exception 'TOURNAMENT_SETUP_ROUND_MATCH_SET_INVALID'; end if;
    perform production_control.assert_tournament_setup_match_mutable_v1(target);
    if not exists(select 1 from scoring_authority.tournament_setup_match_details_v1 where match_id=target) then
      raise exception 'TOURNAMENT_SETUP_MATCH_DETAILS_REQUIRED';
    end if;
    if match_value.format not in ('BB','SC','SI') or row_value->>'format' is distinct from match_value.format then
      raise exception 'TOURNAMENT_SETUP_PAIRING_FORMAT_MISMATCH';
    end if;
    required_count := case when match_value.format='SI' then 2 else 4 end;
    if jsonb_typeof(row_value->'participants') is distinct from 'array'
      or jsonb_array_length(row_value->'participants')<>required_count then
      raise exception 'TOURNAMENT_SETUP_PAIRING_COUNT_INVALID';
    end if;
    seen_slots := '{}';
    for player_value in select value from jsonb_array_elements(row_value->'participants') loop
      player_id_value := player_value->>'player_id';
      side_value := (player_value->>'team_side')::integer;
      slot_value := (player_value->>'player_slot')::integer;
      if player_id_value is null or side_value is null or slot_value is null
        or side_value not in (1,2) or slot_value not between 1 and required_count/2
        or (side_value::text||':'||slot_value::text)=any(seen_slots) then
        raise exception 'TOURNAMENT_SETUP_PAIRING_STRUCTURE_INVALID';
      end if;
      if player_id_value=any(seen_players) then raise exception 'TOURNAMENT_SETUP_ROUND_DUPLICATE_PLAYER'; end if;
      seen_players := array_append(seen_players,player_id_value);
      seen_slots := array_append(seen_slots,side_value::text||':'||slot_value::text);
      if not exists(select 1 from scoring_authority.tournament_players where tournament_id='2026'
        and player_id=player_id_value and team_side=side_value and participation_status='ACTIVE') then
        raise exception 'TOURNAMENT_SETUP_PAIRING_ACTIVE_TEAM_MEMBERSHIP_REQUIRED';
      end if;
      if not exists(select 1 from scoring_authority.handicap_revision_entries where tournament_id='2026'
        and revision_id=current_handicap and player_id=player_id_value and tournament_handicap is not null) then
        raise exception 'TOURNAMENT_SETUP_PAIRING_APPROVED_HANDICAP_REQUIRED';
      end if;
    end loop;
    select coalesce(jsonb_agg(jsonb_build_object('player_id',player_id,'team_side',team_side,'player_slot',player_slot)
      order by team_side,player_slot),'[]') into canonical from scoring_authority.match_participants where match_id=target;
    select jsonb_agg(value order by (value->>'team_side')::integer,(value->>'player_slot')::integer)
      into result_value from jsonb_array_elements(row_value->'participants');
    if canonical is distinct from result_value then
      result_value := production_control.tournament_setup_dependency_codes_v1(null,null,round_number_value,target,'PAIRINGS');
      if jsonb_array_length(result_value)>0 then raise exception 'TOURNAMENT_SETUP_DEPENDENCY_BLOCKED'; end if;
      changed_ids := array_append(changed_ids,target);
    end if;
  end loop;
  if cardinality(seen_players)<>roster_count then raise exception 'TOURNAMENT_SETUP_ROUND_COVERAGE_INCOMPLETE'; end if;

  -- Remove only changed manifests so the shared single-match validator can
  -- accept cross-match exchanges. Any later failure rolls this entire function
  -- back, including deletions, pointer changes, audit, and receipt.
  delete from scoring_authority.match_participants where match_id=any(changed_ids);
  for row_value in select value from jsonb_array_elements(input->'matches') order by value->>'match_id' loop
    target := row_value->>'match_id';
    player_id_value := null;
    if target=any(changed_ids) then
      result_value := production_control.apply_tournament_setup_pairings_v1(row_value,next_revision,actor);
      if not coalesce((result_value->>'ok')::boolean,false) then
        raise exception using message=coalesce(result_value->>'code','TOURNAMENT_SETUP_OPERATION_FAILED');
      end if;
    end if;
  end loop;
  if cardinality(changed_ids)=0 then next_revision:=current_revision;
  else
    insert into production_control.tournament_setup_context_v1
      (tournament_id,contract_version,revision,updated_by_player_id,updated_by_auth_user_id)
      values('2026','production-tournament-setup-v1',next_revision,actor,actor_auth)
      on conflict(tournament_id) do update set revision=excluded.revision,
        updated_by_player_id=excluded.updated_by_player_id,updated_by_auth_user_id=excluded.updated_by_auth_user_id,
        updated_at=clock_timestamp();
  end if;
  response_value:=jsonb_build_object('ok',true,'code','TOURNAMENT_SETUP_UPDATED','action','REPLACE_ROUND_PAIRINGS',
    'revision',next_revision,'target','2026-R'||round_number_value,'idempotent',false,
    'changed',cardinality(changed_ids)>0,'changedMatches',to_jsonb(changed_ids),'snapshotPrepared',false,
    'scoringPermissionGranted',false,'scoringMutationCreated',false,'timestamp',clock_timestamp(),
    'readiness',production_control.tournament_setup_readiness_v1());
  insert into production_control.tournament_setup_audit_events_v1
    (tournament_id,action,target_kind,target_id,actor_player_id,actor_auth_user_id,operation_request_id,
      prior_revision,next_revision,result,safe_metadata)
    values('2026','REPLACE_ROUND_PAIRINGS','ROUND','2026-R'||round_number_value,actor,actor_auth,request_id,
      current_revision,next_revision,case when cardinality(changed_ids)>0 then 'CHANGED' else 'NO_CHANGE' end,
      jsonb_build_object('changedMatches',to_jsonb(changed_ids),'handicapRevisionId',current_handicap,
        'participantCount',cardinality(seen_players),'snapshotPrepared',false,'scoringPermissionGranted',false));
  insert into production_control.tournament_setup_operation_receipts_v1
    (tournament_id,action,operation_request_id,declared_request_payload_hash,database_request_payload_hash,
      actor_player_id,actor_auth_user_id,prior_revision,next_revision,response)
    values('2026','REPLACE_ROUND_PAIRINGS',request_id,declared_hash,database_hash,actor,actor_auth,
      current_revision,next_revision,response_value);
  return response_value;
exception when others then
  -- PL/pgSQL exception block rolls back every write before returning a failure.
  get stacked diagnostics failure_code=message_text;
  if failure_code !~ '^TOURNAMENT_SETUP_[A-Z0-9_]+$' then failure_code:='TOURNAMENT_SETUP_ROUND_OPERATION_FAILED'; end if;
  return jsonb_build_object('ok',false,'code',failure_code,'matchId',target,
    'playerId',case when player_id_value ~ '^[A-Z0-9_-]{1,64}$' then player_id_value else null end);
end;
$$;
revoke all on function public.mutate_production_round_pairings_v1(jsonb) from public,anon,authenticated;
grant execute on function public.mutate_production_round_pairings_v1(jsonb) to service_role;

-- Extend the existing bounded reader; retain its authorization and projection.
alter function public.read_production_tournament_setup_v1(jsonb) set schema production_control;
alter function production_control.read_production_tournament_setup_v1(jsonb) rename to read_tournament_setup_before_round_workspace_v1;
revoke all on function production_control.read_tournament_setup_before_round_workspace_v1(jsonb) from public,anon,authenticated,service_role;
create function public.read_production_tournament_setup_v1(input jsonb)
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,production_control,scoring_authority
as $$
declare result_value jsonb; matches_value jsonb;
begin
  result_value:=production_control.read_tournament_setup_before_round_workspace_v1(input);
  select jsonb_agg(item.value || jsonb_build_object(
    'detailsManaged',d.match_id is not null,
    'contextFingerprint',production_control.tournament_setup_hash_v1(jsonb_build_object(
      'details',to_jsonb(d),'round',to_jsonb(r),'course',to_jsonb(c),
      'holes',(select jsonb_agg(to_jsonb(h) order by h.hole_number)
        from scoring_authority.tournament_setup_course_holes_v1 h where h.tournament_id='2026'
          and h.course_id=d.course_id and h.tee_id=d.tee_id),
      'snapshot',item.value->'snapshot',
      'handicap',(select revision_id from scoring_authority.handicap_revision_current where tournament_id='2026')
    ))) order by (item.value->>'roundNumber')::integer,(item.value->>'matchNumber')::integer)
    into matches_value from jsonb_array_elements(result_value->'matches') item(value)
    left join scoring_authority.tournament_setup_match_details_v1 d on d.match_id=item.value->>'matchId'
    left join scoring_authority.rounds r on r.tournament_id='2026' and r.round_number=(item.value->>'roundNumber')::integer
    left join scoring_authority.tournament_setup_course_tees_v1 c on c.tournament_id='2026' and c.course_id=d.course_id and c.tee_id=d.tee_id;
  return result_value || jsonb_build_object('matches',coalesce(matches_value,'[]'),
    'approvedHandicapRevisionId',(select revision_id from scoring_authority.handicap_revision_current where tournament_id='2026'),
    'approvedHandicapRevisionNumber',(select to_jsonb(c)->'revision_number' from scoring_authority.handicap_revision_current c where tournament_id='2026'));
end;
$$;
revoke all on function public.read_production_tournament_setup_v1(jsonb) from public,anon,authenticated;
grant execute on function public.read_production_tournament_setup_v1(jsonb) to service_role;
commit;
