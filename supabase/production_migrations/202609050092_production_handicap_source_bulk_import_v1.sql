-- GHIN / Hybrid Phase 2A.1. Adds an inert, Director-only bulk preview and
-- atomic append operation. Installation creates no observations or pointers.
begin;

alter table production_control.handicap_source_observations_v1
  alter column low_index_date drop not null;

alter table production_control.handicap_source_operation_receipts_v1
  drop constraint handicap_source_operation_receipts_v1_operation_check;
alter table production_control.handicap_source_operation_receipts_v1
  add constraint handicap_source_operation_receipts_v1_operation_check
  check (operation in (
    'SET_IDENTITY', 'RETIRE_IDENTITY', 'RECORD_MANUAL_OBSERVATION',
    'RECORD_BULK_MANUAL_OBSERVATIONS', 'STAGE_HYBRID_DRAFT'
  ));

create function production_control.preview_bulk_manual_handicap_source_v1(
  target text,
  input_entries jsonb
)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog as $$
declare
  rows_value jsonb;
  entries_value jsonb;
  parsed_count integer;
  ready_count integer;
  invalid_count integer;
  replacing_count integer;
  source_fingerprint text;
  preview_fingerprint text;
begin
  if pg_catalog.jsonb_typeof(input_entries) is distinct from 'array'
     or pg_catalog.jsonb_array_length(input_entries) < 1
     or pg_catalog.jsonb_array_length(input_entries) > 100 then
    raise exception using errcode='22023', message='PRODUCTION_HANDICAP_SOURCE_BULK_ROWS_REQUIRED';
  end if;
  if exists (
    select 1 from pg_catalog.jsonb_array_elements(input_entries) entry
    where coalesce(entry->>'player_id','') !~ '^[A-Z0-9][A-Z0-9._:-]{0,79}$'
       or coalesce(entry->>'current_index','') !~ '^-?[0-9]+(\.[0-9]+)?$'
       or coalesce(entry->>'low_index','') !~ '^-?[0-9]+(\.[0-9]+)?$'
       or (entry->>'low_index_date' is not null and entry->>'low_index_date' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
  ) or exists (
    select 1 from pg_catalog.jsonb_array_elements(input_entries) entry
    group by pg_catalog.upper(entry->>'player_id') having pg_catalog.count(*) > 1
  ) then
    raise exception using errcode='22023', message='PRODUCTION_HANDICAP_SOURCE_BULK_INPUT_INVALID';
  end if;

  with canonical as (
    select
      pg_catalog.upper(entry->>'player_id') player_id,
      (entry->>'current_index')::numeric current_index,
      (entry->>'low_index')::numeric low_index,
      (entry->>'low_index_date')::date low_index_date
    from pg_catalog.jsonb_array_elements(input_entries) entry
  ), reviewed as (
    select canonical.*,
      player.display_name,
      roster.player_id is not null active_player_id,
      any_roster.player_id is not null roster_player_id,
      identity_value.identity_id,
      case when identity_value.identity_id is null then '' else '••••' || pg_catalog.right(identity_value.external_identifier,4) end masked_ghin,
      coalesce(source_pointer.pointer_revision,0) pointer_revision,
      source_pointer.observation_id prior_observation_id,
      observation.current_index prior_current_index,
      observation.low_index prior_low_index,
      observation.low_index_date prior_low_index_date,
      observation.hybrid_handicap prior_hybrid,
      approved.tournament_handicap approved_handicap,
      production_control.hybrid_handicap_v1(canonical.current_index,canonical.low_index) hybrid,
      case
        when player.player_id is null or any_roster.player_id is null then 'UNKNOWN_PLAYER'
        when roster.player_id is null then 'INACTIVE_PLAYER'
        when identity_value.identity_id is null then 'MISSING_GHIN_MAPPING'
        when source_pointer.observation_id is not null then 'WILL_REPLACE_CURRENT_SOURCE'
        else 'READY'
      end status
    from canonical
    left join scoring_authority.players player on player.player_id=canonical.player_id
    left join scoring_authority.tournament_players any_roster on any_roster.tournament_id=target and any_roster.player_id=canonical.player_id
    left join scoring_authority.tournament_players roster on roster.tournament_id=target and roster.player_id=canonical.player_id and roster.participation_status='ACTIVE'
    left join production_control.player_external_identities_v1 identity_value on identity_value.player_id=canonical.player_id and identity_value.provider='GHIN' and identity_value.status='VERIFIED'
    left join production_control.handicap_source_current_v1 source_pointer on source_pointer.tournament_id=target and source_pointer.player_id=canonical.player_id and source_pointer.provider='GHIN'
    left join production_control.handicap_source_observations_v1 observation on observation.observation_id=source_pointer.observation_id
    left join scoring_authority.handicap_revision_current revision_pointer on revision_pointer.tournament_id=target
    left join scoring_authority.handicap_revision_entries approved on approved.revision_id=revision_pointer.revision_id and approved.player_id=canonical.player_id
  )
  select
    pg_catalog.count(*)::integer,
    pg_catalog.count(*) filter (where status in ('READY','WILL_REPLACE_CURRENT_SOURCE'))::integer,
    pg_catalog.count(*) filter (where status not in ('READY','WILL_REPLACE_CURRENT_SOURCE'))::integer,
    pg_catalog.count(*) filter (where status='WILL_REPLACE_CURRENT_SOURCE')::integer,
    pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'playerId',player_id,'displayName',coalesce(display_name,player_id),
      'maskedGhinNumber',masked_ghin,'currentIndex',current_index::text,
      'lowIndex',low_index::text,'lowIndexDate',low_index_date,
      'hybrid',hybrid::text,'approvedTournamentHandicap',approved_handicap::text,
      'existingCurrentIndex',prior_current_index::text,'existingLowIndex',prior_low_index::text,
      'existingLowIndexDate',prior_low_index_date,'existingHybrid',prior_hybrid::text,
      'expectedIdentityId',identity_id,'expectedPointerRevision',pointer_revision,
      'status',status,
      'message',case status
        when 'READY' then 'Ready'
        when 'WILL_REPLACE_CURRENT_SOURCE' then 'Will replace current source'
        when 'INACTIVE_PLAYER' then 'Player is not active for the current tournament'
        when 'MISSING_GHIN_MAPPING' then 'Verified GHIN mapping required'
        else 'Unknown current-tournament Player ID'
      end
    ) order by player_id),
    pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'player_id',player_id,'current_index',current_index::text,
      'low_index',low_index::text,'low_index_date',low_index_date
    ) order by player_id)
  into parsed_count,ready_count,invalid_count,replacing_count,rows_value,entries_value
  from reviewed;

  source_fingerprint:=production_control.handicap_source_set_fingerprint_v1(target);
  if invalid_count=0 then
    preview_fingerprint:=production_control.handicap_source_hash_v1(pg_catalog.jsonb_build_object(
      'operation','BULK_MANUAL_SOURCE','tournamentId',target,
      'sourceFingerprint',source_fingerprint,'entries',entries_value
    ));
  end if;
  return pg_catalog.jsonb_build_object(
    'ready',invalid_count=0,'rowsParsed',parsed_count,'readyCount',ready_count,
    'invalidCount',invalid_count,'replacingCount',replacing_count,
    'sourceFingerprint',source_fingerprint,'previewFingerprint',preview_fingerprint,
    'entries',case when invalid_count=0 then entries_value else '[]'::jsonb end,
    'rows',coalesce(rows_value,'[]'::jsonb)
  );
end;
$$;

create function public.preview_production_bulk_manual_handicap_source_v1(input jsonb)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog as $$
declare target text; result_value jsonb;
begin
  target:=production_control.assert_handicap_source_runtime_v1(input);
  if input->>'operation' is distinct from 'PREVIEW_PRODUCTION_BULK_MANUAL_HANDICAP_SOURCE_V1'
     or pg_catalog.jsonb_typeof(input->'entries') is distinct from 'array' then
    raise exception using errcode='22023',message='PRODUCTION_HANDICAP_SOURCE_BULK_PREVIEW_INPUT_INVALID';
  end if;
  result_value:=production_control.preview_bulk_manual_handicap_source_v1(target,input->'entries');
  return result_value||pg_catalog.jsonb_build_object(
    'ok',true,'code',case when (result_value->>'ready')::boolean
      then 'PRODUCTION_HANDICAP_SOURCE_BULK_PREVIEW_READY'
      else 'PRODUCTION_HANDICAP_SOURCE_BULK_PREVIEW_INVALID' end,
    'idempotent',false
  );
end;
$$;

create function public.record_production_bulk_manual_handicap_source_v1(input jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  target text; actor_player text; actor_auth uuid; request_id uuid;
  declared_hash text; database_hash text; expected_preview text;
  prior production_control.handicap_source_operation_receipts_v1%rowtype;
  preview_value jsonb; entry_value jsonb; player_value text;
  identity_value uuid; pointer_value production_control.handicap_source_current_v1%rowtype;
  observation_value uuid; event_value uuid; evidence_hash text;
  current_value numeric; low_value numeric; low_date_value date;
  result_rows jsonb:='[]'::jsonb; response_value jsonb;
begin
  target:=production_control.assert_handicap_source_runtime_v1(input);
  actor_player:=pg_catalog.upper(pg_catalog.btrim(input#>>'{authorization,player_id}'));
  actor_auth:=(input#>>'{authorization,auth_user_id}')::uuid;
  declared_hash:=pg_catalog.lower(pg_catalog.btrim(coalesce(input->>'request_payload_hash','')));
  expected_preview:=pg_catalog.lower(pg_catalog.btrim(coalesce(input->>'expected_preview_fingerprint','')));
  if input->>'operation' is distinct from 'RECORD_PRODUCTION_BULK_MANUAL_HANDICAP_SOURCE_V1'
     or input->>'entry_mode' is distinct from 'BULK_IMPORT'
     or coalesce(input->>'operation_request_id','') !~ '^[0-9a-fA-F-]{36}$'
     or expected_preview !~ '^[0-9a-f]{64}$'
     or declared_hash !~ '^[0-9a-f]{64}$'
     or pg_catalog.jsonb_typeof(input->'entries') is distinct from 'array' then
    raise exception using errcode='22023',message='PRODUCTION_HANDICAP_SOURCE_BULK_INPUT_INVALID';
  end if;
  request_id:=(input->>'operation_request_id')::uuid;
  database_hash:=production_control.handicap_source_hash_v1(pg_catalog.jsonb_build_object(
    'operation','RECORD_BULK_MANUAL_OBSERVATIONS','entryMode','BULK_IMPORT',
    'expectedPreviewFingerprint',expected_preview,'entries',input->'entries',
    'actorPlayerId',actor_player,'actorAuthUserId',actor_auth
  ));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('production-handicap-source-bulk:'||target,0));
  select value.* into prior from production_control.handicap_source_operation_receipts_v1 value
    where value.tournament_id=target and value.operation_request_id=request_id;
  if found then
    if prior.declared_request_payload_hash=declared_hash and prior.database_request_payload_hash=database_hash then
      return prior.response||pg_catalog.jsonb_build_object('idempotent',true);
    end if;
    raise exception using errcode='23505',message='PRODUCTION_HANDICAP_SOURCE_IDEMPOTENCY_CONFLICT';
  end if;
  for player_value in
    select pg_catalog.upper(entry->>'player_id') from pg_catalog.jsonb_array_elements(input->'entries') entry
    order by pg_catalog.upper(entry->>'player_id')
  loop
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('production-handicap-source:'||target||':'||player_value,0));
  end loop;
  preview_value:=production_control.preview_bulk_manual_handicap_source_v1(target,input->'entries');
  if coalesce((preview_value->>'ready')::boolean,false) is not true then
    raise exception using errcode='22023',message='PRODUCTION_HANDICAP_SOURCE_BULK_VALIDATION_FAILED';
  end if;
  if preview_value->>'previewFingerprint' is distinct from expected_preview then
    raise exception using errcode='40001',message='PRODUCTION_HANDICAP_SOURCE_BULK_PREVIEW_STALE';
  end if;

  for entry_value in
    select value from pg_catalog.jsonb_array_elements(preview_value->'entries') entries(value)
    order by value->>'player_id'
  loop
    player_value:=entry_value->>'player_id';
    current_value:=(entry_value->>'current_index')::numeric;
    low_value:=(entry_value->>'low_index')::numeric;
    low_date_value:=(entry_value->>'low_index_date')::date;
    select identity_id into strict identity_value
      from production_control.player_external_identities_v1
      where player_id=player_value and provider='GHIN' and status='VERIFIED' for share;
    select value.* into pointer_value from production_control.handicap_source_current_v1 value
      where value.tournament_id=target and value.player_id=player_value and value.provider='GHIN' for update;
    observation_value:=extensions.gen_random_uuid();
    event_value:=extensions.gen_random_uuid();
    evidence_hash:=production_control.handicap_source_hash_v1(pg_catalog.jsonb_build_object(
      'provider','GHIN','identityId',identity_value,'playerId',player_value,
      'currentIndex',current_value,'lowIndex',low_value,'lowIndexDate',low_date_value,
      'provenance','DIRECTOR_MANUAL','entryMode','BULK_IMPORT'
    ));
    insert into production_control.handicap_source_observations_v1(
      observation_id,tournament_id,player_id,identity_id,provider,current_index,low_index,
      low_index_date,provenance,status,source_evidence_fingerprint,
      created_by_player_id,created_by_auth_user_id
    ) values (
      observation_value,target,player_value,identity_value,'GHIN',current_value,low_value,
      low_date_value,'DIRECTOR_MANUAL','ACCEPTED',evidence_hash,actor_player,actor_auth
    );
    insert into production_control.handicap_source_current_v1(
      tournament_id,player_id,provider,observation_id,pointer_revision,source_status,
      updated_by_player_id,updated_by_auth_user_id
    ) values (
      target,player_value,'GHIN',observation_value,coalesce(pointer_value.pointer_revision,0)+1,
      'CURRENT',actor_player,actor_auth
    ) on conflict(tournament_id,player_id,provider) do update set
      observation_id=excluded.observation_id,pointer_revision=excluded.pointer_revision,
      source_status='CURRENT',updated_by_player_id=excluded.updated_by_player_id,
      updated_by_auth_user_id=excluded.updated_by_auth_user_id,
      updated_at=pg_catalog.clock_timestamp();
    insert into production_control.handicap_source_audit_events_v1(
      event_id,tournament_id,action,player_id,identity_id,observation_id,
      actor_player_id,actor_auth_user_id,operation_request_id,before_state,after_state
    ) values (
      event_value,target,'MANUAL_SOURCE_RECORDED',player_value,identity_value,observation_value,
      actor_player,actor_auth,request_id,
      case when pointer_value.observation_id is null then '{}'::jsonb else pg_catalog.jsonb_build_object(
        'observationId',pointer_value.observation_id,'pointerRevision',pointer_value.pointer_revision
      ) end,
      pg_catalog.jsonb_build_object(
        'observationId',observation_value,'pointerRevision',coalesce(pointer_value.pointer_revision,0)+1,
        'evidenceFingerprint',evidence_hash,'entryMode','BULK_IMPORT'
      )
    );
    result_rows:=result_rows||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'playerId',player_value,'observationId',observation_value,
      'pointerRevision',coalesce(pointer_value.pointer_revision,0)+1,
      'currentIndex',current_value::text,'lowIndex',low_value::text,
      'lowIndexDate',low_date_value,'hybrid',production_control.hybrid_handicap_v1(current_value,low_value)::text
    ));
  end loop;
  response_value:=pg_catalog.jsonb_build_object(
    'ok',true,'code','PRODUCTION_HANDICAP_SOURCE_BULK_RECORDED','idempotent',false,
    'entryMode','BULK_IMPORT','recordedCount',pg_catalog.jsonb_array_length(result_rows),
    'rows',result_rows,'sourceFingerprint',production_control.handicap_source_set_fingerprint_v1(target)
  );
  perform production_control.handicap_source_receipt_v1(
    target,'RECORD_BULK_MANUAL_OBSERVATIONS',request_id,declared_hash,database_hash,
    actor_player,actor_auth,response_value
  );
  return response_value;
end;
$$;

comment on function public.preview_production_bulk_manual_handicap_source_v1(jsonb) is
  'Read-only Director preview for stable-ID Current/Low bulk import; returns masked GHIN presentation and authoritative Hybrid values.';
comment on function public.record_production_bulk_manual_handicap_source_v1(jsonb) is
  'Atomic append-only Director bulk source import with source-set CAS, one receipt, and immutable per-Player audit.';

revoke all on function production_control.preview_bulk_manual_handicap_source_v1(text,jsonb),
  public.preview_production_bulk_manual_handicap_source_v1(jsonb),
  public.record_production_bulk_manual_handicap_source_v1(jsonb)
from public,anon,authenticated,service_role;

grant execute on function public.preview_production_bulk_manual_handicap_source_v1(jsonb),
  public.record_production_bulk_manual_handicap_source_v1(jsonb)
to service_role;

notify pgrst, 'reload schema';
commit;
