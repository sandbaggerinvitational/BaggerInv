-- Step 8: Preview-only immutable Draft projection. Google remains the Director
-- authoring authority; public application reads use only current certified
-- revisions through the bounded RPC below.

create table scoring_authority.draft_revisions (
  revision_id uuid primary key default gen_random_uuid(),
  project_ref text not null check (project_ref = 'idgigvjjqkfbqjeredpb'),
  source_workbook_id text not null check (
    length(btrim(source_workbook_id)) > 10
    and source_workbook_id <> '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4'
  ),
  source_tabs jsonb not null check (source_tabs = '["Draft Settings","Draft Picks"]'::jsonb),
  tournament_id text not null references scoring_authority.tournaments(tournament_id),
  tournament_year integer not null check (tournament_year between 2000 and 2200),
  revision_number bigint not null check (revision_number > 0),
  previous_revision_id uuid references scoring_authority.draft_revisions(revision_id),
  source_fingerprint text not null check (source_fingerprint ~ '^[0-9a-f]{64}$'),
  configuration_fingerprint text not null check (configuration_fingerprint ~ '^[0-9a-f]{64}$'),
  picks_fingerprint text not null check (picks_fingerprint ~ '^[0-9a-f]{64}$'),
  payload_fingerprint text not null check (payload_fingerprint ~ '^[0-9a-f]{64}$'),
  contract_version text not null check (contract_version = 'draft-projection-v1'),
  validation_status text not null check (validation_status = 'VALID'),
  validation_diagnostics jsonb not null default '{}'::jsonb check (jsonb_typeof(validation_diagnostics) = 'object'),
  source_settings jsonb not null check (jsonb_typeof(source_settings) = 'object'),
  source_picks jsonb not null check (jsonb_typeof(source_picks) = 'array'),
  configuration jsonb not null check (jsonb_typeof(configuration) = 'object'),
  presentation_seed jsonb not null check (jsonb_typeof(presentation_seed) = 'object'),
  operation text not null check (operation in ('INITIAL_IMPORT','CURRENT_SYNC','HISTORICAL_CORRECTION')),
  correction_reason text,
  synchronized_by text not null,
  synchronized_at timestamptz not null default now(),
  unique(tournament_id, revision_number),
  unique(tournament_id, payload_fingerprint),
  unique(revision_id, tournament_id),
  check (
    (operation <> 'HISTORICAL_CORRECTION' and correction_reason is null)
    or (operation = 'HISTORICAL_CORRECTION' and length(btrim(correction_reason)) >= 10)
  )
);

create index draft_revisions_year_idx on scoring_authority.draft_revisions(tournament_year, revision_number desc);

create table scoring_authority.draft_current_revisions (
  tournament_id text primary key references scoring_authority.tournaments(tournament_id),
  tournament_year integer not null unique,
  revision_id uuid not null unique references scoring_authority.draft_revisions(revision_id),
  advanced_by text not null,
  advanced_at timestamptz not null default now()
);

create table scoring_authority.draft_configuration_facts (
  revision_id uuid primary key references scoring_authority.draft_revisions(revision_id),
  tournament_id text not null,
  tournament_year integer not null,
  draft_name text not null,
  draft_date text,
  draft_time text,
  time_zone text,
  location text,
  status_mode text,
  draft_format text,
  total_picks integer not null check (total_picks > 0),
  team_1_id text not null,
  team_2_id text not null,
  team_1_captain_player_id text references scoring_authority.players(player_id),
  team_2_captain_player_id text references scoring_authority.players(player_id),
  first_pick_team_id text not null,
  notes text,
  foreign key (revision_id, tournament_id) references scoring_authority.draft_revisions(revision_id, tournament_id),
  foreign key (tournament_id, team_1_id) references scoring_authority.teams(tournament_id, team_id),
  foreign key (tournament_id, team_2_id) references scoring_authority.teams(tournament_id, team_id),
  foreign key (tournament_id, first_pick_team_id) references scoring_authority.teams(tournament_id, team_id),
  check (team_1_id <> team_2_id),
  check (first_pick_team_id in (team_1_id, team_2_id)),
  check (team_1_captain_player_id is null or team_1_captain_player_id is distinct from team_2_captain_player_id)
);

create table scoring_authority.draft_pick_facts (
  revision_id uuid not null references scoring_authority.draft_revisions(revision_id),
  tournament_id text not null,
  tournament_year integer not null,
  pick_number integer not null check (pick_number > 0),
  round_number integer not null check (round_number > 0),
  pick_within_round integer not null check (pick_within_round > 0),
  source_team_id text,
  team_id text,
  player_id text references scoring_authority.players(player_id),
  player_name_snapshot text,
  selected_at_source text,
  selected_by_source text,
  pick_status text not null check (pick_status in ('PENDING','SELECTED')),
  notes text,
  presentation_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(presentation_snapshot) = 'object'),
  primary key(revision_id, pick_number),
  unique(revision_id, player_id),
  foreign key (revision_id, tournament_id) references scoring_authority.draft_revisions(revision_id, tournament_id),
  foreign key (tournament_id, team_id) references scoring_authority.teams(tournament_id, team_id),
  check (
    (pick_status = 'PENDING' and player_id is null)
    or (pick_status = 'SELECTED' and player_id is not null and team_id is not null)
  )
);

create index draft_pick_player_idx on scoring_authority.draft_pick_facts(player_id, tournament_year desc);

alter table scoring_authority.draft_revisions enable row level security;
alter table scoring_authority.draft_current_revisions enable row level security;
alter table scoring_authority.draft_configuration_facts enable row level security;
alter table scoring_authority.draft_pick_facts enable row level security;

create or replace function scoring_authority.guard_draft_projection_write() returns trigger
language plpgsql set search_path=scoring_authority,public,extensions,pg_temp as $$
begin
  if current_setting('scoring_authority.draft_projection_import', true) <> 'on' then
    raise exception 'Draft revisions are immutable outside the supported projection import operation.'
      using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end; $$;

create trigger draft_revisions_supported_write_guard
  before insert or update or delete on scoring_authority.draft_revisions
  for each row execute function scoring_authority.guard_draft_projection_write();
create trigger draft_current_revisions_supported_write_guard
  before insert or update or delete on scoring_authority.draft_current_revisions
  for each row execute function scoring_authority.guard_draft_projection_write();
create trigger draft_configuration_supported_write_guard
  before insert or update or delete on scoring_authority.draft_configuration_facts
  for each row execute function scoring_authority.guard_draft_projection_write();
create trigger draft_picks_supported_write_guard
  before insert or update or delete on scoring_authority.draft_pick_facts
  for each row execute function scoring_authority.guard_draft_projection_write();
revoke all on function scoring_authority.guard_draft_projection_write() from public,anon,authenticated;

revoke all on scoring_authority.draft_revisions, scoring_authority.draft_current_revisions,
  scoring_authority.draft_configuration_facts, scoring_authority.draft_pick_facts
  from public, anon, authenticated;
grant select on scoring_authority.draft_revisions, scoring_authority.draft_current_revisions,
  scoring_authority.draft_configuration_facts, scoring_authority.draft_pick_facts to service_role;

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
  expected_team_id text;
  first_team_id text;
  second_team_id text;
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
    first_team_id := draft->'configuration'->>'first_pick_team_id';
    second_team_id := case when first_team_id=draft->'configuration'->>'team_1_id'
      then draft->'configuration'->>'team_2_id' else draft->'configuration'->>'team_1_id' end;
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
      if upper(btrim(coalesce(draft->'configuration'->>'format','')))='SNAKE'
          and upper(btrim(coalesce(pick->>'status','')))='SELECTED' then
        expected_team_id := case
          when mod((pick_number_value - 1) / 2,2)=mod(pick_number_value - 1,2) then first_team_id
          else second_team_id end;
        if pick->>'team_id' <> expected_team_id then
          return jsonb_build_object('ok',false,'code','DRAFT_PICK_ORDER_INVALID','year',target_year,
            'pick',pick_number_value,'expected_team_id',expected_team_id,'actual_team_id',pick->>'team_id');
        end if;
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

create or replace function public.read_preview_draft_view(
  target_scope text default 'YEARS', target_year integer default null, target_player_id text default null
) returns jsonb
language plpgsql security definer stable set search_path=scoring_authority,public,extensions,pg_temp as $$
declare
  scope_value text := upper(btrim(coalesce(target_scope,'YEARS')));
  drafts jsonb;
  selected_year integer;
begin
  if scope_value not in ('YEARS','YEAR','CURRENT','PLAYER','DIAGNOSTICS') then
    return jsonb_build_object('ok',false,'code','DRAFT_READ_SCOPE_INVALID');
  end if;
  if scope_value='YEAR' and target_year is null then return jsonb_build_object('ok',false,'code','DRAFT_YEAR_REQUIRED'); end if;
  if scope_value='PLAYER' and btrim(coalesce(target_player_id,''))='' then return jsonb_build_object('ok',false,'code','DRAFT_PLAYER_ID_REQUIRED'); end if;
  select max(tournament_year) into selected_year from scoring_authority.draft_current_revisions;
  select coalesce(jsonb_agg(jsonb_build_object(
    'revision_id',r.revision_id,'revision_number',r.revision_number,'previous_revision_id',r.previous_revision_id,
    'tournament_id',r.tournament_id,'tournament_year',r.tournament_year,
    'source_workbook_id',r.source_workbook_id,'source_tabs',r.source_tabs,
    'source_fingerprint',r.source_fingerprint,'configuration_fingerprint',r.configuration_fingerprint,
    'picks_fingerprint',r.picks_fingerprint,'payload_fingerprint',r.payload_fingerprint,
    'contract_version',r.contract_version,'validation_status',r.validation_status,
    'validation_diagnostics',r.validation_diagnostics,'configuration',r.configuration,
    'presentation_seed',case when scope_value='DIAGNOSTICS' then null else r.presentation_seed end,
    'normalized_picks',case when scope_value='DIAGNOSTICS' then '[]'::jsonb else (
      select coalesce(jsonb_agg(jsonb_build_object(
        'pick_number',p.pick_number,'round_number',p.round_number,'pick_within_round',p.pick_within_round,
        'source_team_id',coalesce(p.source_team_id,''),'team_id',coalesce(p.team_id,''),
        'player_id',coalesce(p.player_id,''),'player_name',coalesce(p.player_name_snapshot,''),
        'selected_at',coalesce(p.selected_at_source,''),'selected_by',coalesce(p.selected_by_source,''),
        'status',p.pick_status,'notes',coalesce(p.notes,''),'presentation',p.presentation_snapshot
      ) order by p.pick_number),'[]'::jsonb) from scoring_authority.draft_pick_facts p where p.revision_id=r.revision_id
    ) end,
    'operation',r.operation,'correction_reason',r.correction_reason,
    'synchronized_by',r.synchronized_by,'synchronized_at',r.synchronized_at
  ) order by r.tournament_year desc),'[]'::jsonb) into drafts
  from scoring_authority.draft_current_revisions c
  join scoring_authority.draft_revisions r on r.revision_id=c.revision_id
  where (scope_value not in ('YEAR','CURRENT') or r.tournament_year=case when scope_value='CURRENT' then selected_year else target_year end)
    and (scope_value <> 'PLAYER' or exists(
      select 1 from scoring_authority.draft_pick_facts p where p.revision_id=r.revision_id and p.player_id=target_player_id
    ));
  if jsonb_array_length(drafts)=0 then
    return jsonb_build_object('ok',false,'code',case when scope_value='PLAYER' then 'DRAFT_PLAYER_HISTORY_UNAVAILABLE' else 'DRAFT_PROJECTION_UNAVAILABLE' end);
  end if;
  return jsonb_build_object('ok',true,'data',jsonb_build_object(
    'contract_version','draft-projection-v1','validation_status','VALID','scope',scope_value,
    'drafts',drafts,'draft_count',jsonb_array_length(drafts),
    'google_foreground_requests',0,'fallback_used',false
  ));
end; $$;

revoke all on function public.import_preview_draft_projection(jsonb) from public,anon,authenticated;
revoke all on function public.read_preview_draft_view(text,integer,text) from public,anon,authenticated;
grant execute on function public.import_preview_draft_projection(jsonb) to service_role;
grant execute on function public.read_preview_draft_view(text,integer,text) to service_role;

notify pgrst,'reload schema';
