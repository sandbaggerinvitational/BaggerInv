-- Production Director Tournament Awards V1. Installation is inert: the
-- migration creates no Award, revision, pointer, receipt, or public content.
begin;

create table production_control.tournament_award_revisions_v1 (
  revision_id uuid primary key default extensions.gen_random_uuid(),
  tournament_id text not null references scoring_authority.tournaments(
    tournament_id
  ) on delete restrict,
  revision_number bigint not null check (revision_number > 0),
  predecessor_revision_id uuid references
    production_control.tournament_award_revisions_v1(revision_id)
    on delete restrict,
  content_fingerprint text not null check (
    content_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  item_count integer not null check (item_count between 0 and 100),
  published_count integer not null check (
    published_count between 0 and item_count
  ),
  actor_player_id text not null references scoring_authority.players(player_id)
    on delete restrict,
  actor_auth_user_id uuid not null references auth.users(id) on delete restrict,
  operation_request_id uuid not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  unique (tournament_id, revision_number),
  unique (tournament_id, operation_request_id),
  unique (revision_id, tournament_id)
);

create table production_control.tournament_award_items_v1 (
  revision_id uuid not null,
  tournament_id text not null,
  award_id uuid not null,
  title text not null check (
    pg_catalog.btrim(title) <> '' and pg_catalog.length(title) <= 160
  ),
  description text not null default '' check (
    pg_catalog.length(description) <= 1000
  ),
  display_order integer not null check (display_order between 1 and 100),
  publication_state text not null check (
    publication_state in ('DRAFT', 'PUBLISHED', 'RETIRED')
  ),
  recipient_kind text not null check (
    recipient_kind in ('PLAYER', 'TEAM', 'TEXT', 'UNAVAILABLE')
  ),
  winner_player_id text references scoring_authority.players(player_id)
    on delete restrict,
  winner_team_id text,
  recipient_display text,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (revision_id, award_id),
  unique (revision_id, display_order),
  foreign key (revision_id, tournament_id) references
    production_control.tournament_award_revisions_v1(
      revision_id, tournament_id
    ) on delete restrict,
  foreign key (tournament_id, winner_team_id) references
    scoring_authority.teams(tournament_id, team_id) on delete restrict,
  check (
    (recipient_kind = 'PLAYER' and winner_player_id is not null
      and winner_team_id is null and recipient_display is null)
    or (recipient_kind = 'TEAM' and winner_player_id is null
      and winner_team_id is not null and recipient_display is null)
    or (recipient_kind = 'TEXT' and winner_player_id is null
      and winner_team_id is null and pg_catalog.btrim(recipient_display) <> ''
      and pg_catalog.length(recipient_display) <= 160)
    or (recipient_kind = 'UNAVAILABLE' and winner_player_id is null
      and winner_team_id is null and recipient_display is null)
  ),
  check (publication_state <> 'PUBLISHED' or recipient_kind <> 'UNAVAILABLE')
);

create table production_control.tournament_awards_current_v1 (
  tournament_id text primary key references scoring_authority.tournaments(
    tournament_id
  ) on delete restrict,
  current_revision_id uuid not null,
  current_revision bigint not null check (current_revision > 0),
  updated_by_player_id text not null references scoring_authority.players(
    player_id
  ) on delete restrict,
  updated_by_auth_user_id uuid not null references auth.users(id)
    on delete restrict,
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  foreign key (current_revision_id, tournament_id) references
    production_control.tournament_award_revisions_v1(
      revision_id, tournament_id
    ) on delete restrict
);

create table production_control.tournament_award_operation_receipts_v1 (
  receipt_id uuid not null default extensions.gen_random_uuid() unique,
  tournament_id text not null references scoring_authority.tournaments(
    tournament_id
  ) on delete restrict,
  operation_request_id uuid not null,
  declared_request_payload_hash text not null check (
    declared_request_payload_hash ~ '^[0-9a-f]{64}$'
  ),
  database_request_payload_hash text not null check (
    database_request_payload_hash ~ '^[0-9a-f]{64}$'
  ),
  revision_id uuid not null references
    production_control.tournament_award_revisions_v1(revision_id)
    on delete restrict,
  actor_player_id text not null references scoring_authority.players(player_id)
    on delete restrict,
  actor_auth_user_id uuid not null references auth.users(id) on delete restrict,
  response jsonb not null check (pg_catalog.jsonb_typeof(response) = 'object'),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (tournament_id, operation_request_id)
);

create table production_control.tournament_award_audit_events_v1 (
  event_id uuid primary key default extensions.gen_random_uuid(),
  tournament_id text not null references scoring_authority.tournaments(
    tournament_id
  ) on delete restrict,
  revision_id uuid not null references
    production_control.tournament_award_revisions_v1(revision_id)
    on delete restrict,
  revision_number bigint not null check (revision_number > 0),
  action text not null check (action = 'AWARDS_REVISION_SAVED'),
  actor_player_id text not null references scoring_authority.players(player_id)
    on delete restrict,
  actor_auth_user_id uuid not null references auth.users(id) on delete restrict,
  operation_request_id uuid not null,
  summary jsonb not null check (pg_catalog.jsonb_typeof(summary) = 'object'),
  created_at timestamptz not null default pg_catalog.clock_timestamp()
);

alter table production_control.tournament_award_revisions_v1
  enable row level security;
alter table production_control.tournament_award_items_v1
  enable row level security;
alter table production_control.tournament_awards_current_v1
  enable row level security;
alter table production_control.tournament_award_operation_receipts_v1
  enable row level security;
alter table production_control.tournament_award_audit_events_v1
  enable row level security;

revoke all on table
  production_control.tournament_award_revisions_v1,
  production_control.tournament_award_items_v1,
  production_control.tournament_awards_current_v1,
  production_control.tournament_award_operation_receipts_v1,
  production_control.tournament_award_audit_events_v1
from public, anon, authenticated, service_role;

create function production_control.reject_tournament_awards_immutable_v1()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin
  raise exception using errcode = '55000',
    message = 'PRODUCTION_TOURNAMENT_AWARDS_IMMUTABLE_RECORD';
end;
$$;

create trigger production_tournament_award_revisions_immutable_v1
before update or delete on production_control.tournament_award_revisions_v1
for each row execute function
  production_control.reject_tournament_awards_immutable_v1();
create trigger production_tournament_award_items_immutable_v1
before update or delete on production_control.tournament_award_items_v1
for each row execute function
  production_control.reject_tournament_awards_immutable_v1();
create trigger production_tournament_award_receipts_immutable_v1
before update or delete on
  production_control.tournament_award_operation_receipts_v1
for each row execute function
  production_control.reject_tournament_awards_immutable_v1();
create trigger production_tournament_award_audit_immutable_v1
before update or delete on production_control.tournament_award_audit_events_v1
for each row execute function
  production_control.reject_tournament_awards_immutable_v1();

create function production_control.tournament_awards_hash_v1(value jsonb)
returns text language sql immutable strict
set search_path = pg_catalog, extensions as $$
  select pg_catalog.encode(extensions.digest(
    production_control.prediction_settings_canonical_json_v1(value),
    'sha256'
  ), 'hex')
$$;

create function production_control.assert_tournament_awards_runtime_v1(
  input jsonb
)
returns text
language plpgsql
security definer
set search_path = pg_catalog
as $assert_tournament_awards_runtime$
declare
  scope production_control.resource_scope%rowtype;
  pointer production_control.current_tournament_pointer_v1%rowtype;
begin
  if pg_catalog.current_setting('request.jwt.claim.role', true)
       is distinct from 'service_role'
     or input->>'contract_version'
       is distinct from 'production-tournament-awards-v1'
     or input->>'environment' is distinct from 'PRODUCTION'
     or input->>'tournament_id' is distinct from '2026'
     or input#>>'{authorization,tournament_id}' is distinct from '2026'
     or input#>>'{authorization,role}' is distinct from 'DIRECTOR'
     or pg_catalog.upper(pg_catalog.btrim(coalesce(
       input->>'actor_player_id', ''
     ))) is distinct from pg_catalog.upper(pg_catalog.btrim(coalesce(
       input#>>'{authorization,player_id}', ''
     )))
     or pg_catalog.lower(pg_catalog.btrim(coalesce(
       input->>'actor_auth_user_id', ''
     ))) is distinct from pg_catalog.lower(pg_catalog.btrim(coalesce(
       input#>>'{authorization,auth_user_id}', ''
     ))) then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_TOURNAMENT_AWARDS_SCOPE_REQUIRED';
  end if;
  select value.* into strict scope
  from production_control.resource_scope value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  select value.* into strict pointer
  from production_control.current_tournament_pointer_v1 value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  if input->>'project_ref' is distinct from scope.project_ref
     or input->>'project_url' is distinct from scope.project_url
     or input->>'source_workbook_id' is distinct from scope.google_workbook_id
     or scope.current_tournament_id <> '2026'
     or scope.current_tournament_year <> 2026
     or pointer.tournament_id <> '2026'
     or pointer.tournament_year <> 2026 then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_TOURNAMENT_AWARDS_EXACT_RESOURCE_REQUIRED';
  end if;
  perform production_control.assert_production_scoring_actor(input, true);
  return '2026';
end;
$assert_tournament_awards_runtime$;

create function production_control.validate_tournament_awards_v1(
  target text,
  proposed jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $validate_tournament_awards$
declare
  item jsonb;
  normalized jsonb := '[]'::jsonb;
  award_id_value uuid;
  title_value text;
  description_value text;
  publication_value text;
  recipient_value text;
  player_value text;
  team_value text;
  display_value text;
  order_value integer;
begin
  if pg_catalog.jsonb_typeof(proposed) is distinct from 'array'
     or pg_catalog.jsonb_array_length(proposed) > 100 then
    raise exception using errcode = '22023',
      message = 'TOURNAMENT_AWARDS_COLLECTION_INVALID';
  end if;
  for item in select value from pg_catalog.jsonb_array_elements(proposed)
  loop
    begin
      award_id_value := (item->>'award_id')::uuid;
      order_value := (item->>'display_order')::integer;
    exception when others then
      raise exception using errcode = '22023',
        message = 'TOURNAMENT_AWARDS_ITEM_INVALID';
    end;
    title_value := pg_catalog.btrim(coalesce(item->>'title', ''));
    description_value := pg_catalog.btrim(coalesce(
      item->>'description', ''
    ));
    publication_value := pg_catalog.upper(pg_catalog.btrim(coalesce(
      item->>'publication_state', ''
    )));
    recipient_value := pg_catalog.upper(pg_catalog.btrim(coalesce(
      item->>'recipient_kind', ''
    )));
    player_value := nullif(pg_catalog.upper(pg_catalog.btrim(coalesce(
      item->>'winner_player_id', ''
    ))), '');
    team_value := nullif(pg_catalog.upper(pg_catalog.btrim(coalesce(
      item->>'winner_team_id', ''
    ))), '');
    display_value := nullif(pg_catalog.btrim(coalesce(
      item->>'recipient_display', ''
    )), '');
    if title_value = '' or pg_catalog.length(title_value) > 160
       or pg_catalog.length(description_value) > 1000
       or title_value ~ '[<>{}]|[[:cntrl:]]'
       or description_value ~ '[<>{}]|[[:cntrl:]]'
       or (display_value is not null and (
         pg_catalog.length(display_value) > 160
         or display_value ~ '[<>{}]|[[:cntrl:]]'
       )) then
      raise exception using errcode = '22023',
        message = 'TOURNAMENT_AWARDS_UNSAFE_CONTENT';
    end if;
    if order_value not between 1 and 100 then
      raise exception using errcode = '22023',
        message = 'TOURNAMENT_AWARDS_DISPLAY_ORDER_INVALID';
    end if;
    if publication_value not in ('DRAFT', 'PUBLISHED', 'RETIRED')
       or recipient_value not in ('PLAYER', 'TEAM', 'TEXT', 'UNAVAILABLE') then
      raise exception using errcode = '22023',
        message = 'TOURNAMENT_AWARDS_ITEM_INVALID';
    end if;
    if recipient_value = 'PLAYER' then
      if player_value is null or team_value is not null
         or display_value is not null then
        raise exception using errcode = '22023',
          message = 'TOURNAMENT_AWARDS_PLAYER_INVALID';
      end if;
      if not exists (
        select 1 from scoring_authority.tournament_players membership
        where membership.tournament_id = target
          and membership.player_id = player_value
          and membership.participation_status = 'ACTIVE'
      ) then
        raise exception using errcode = '22023',
          message = 'TOURNAMENT_AWARDS_PLAYER_NOT_ACTIVE';
      end if;
    elsif recipient_value = 'TEAM' then
      if team_value is null or player_value is not null
         or display_value is not null
         or not exists (
           select 1 from scoring_authority.teams team
           where team.tournament_id = target and team.team_id = team_value
         ) then
        raise exception using errcode = '22023',
          message = 'TOURNAMENT_AWARDS_TEAM_NOT_FOUND';
      end if;
    elsif recipient_value = 'TEXT' then
      if display_value is null or player_value is not null
         or team_value is not null then
        raise exception using errcode = '22023',
          message = 'TOURNAMENT_AWARDS_TEXT_WINNER_INVALID';
      end if;
    elsif player_value is not null or team_value is not null
          or display_value is not null then
      raise exception using errcode = '22023',
        message = 'TOURNAMENT_AWARDS_PENDING_INVALID';
    end if;
    if publication_value = 'PUBLISHED'
       and recipient_value = 'UNAVAILABLE' then
      raise exception using errcode = '22023',
        message = 'TOURNAMENT_AWARDS_PENDING_PUBLICATION_INVALID';
    end if;
    normalized := normalized || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'award_id', award_id_value,
        'title', title_value,
        'description', description_value,
        'display_order', order_value,
        'publication_state', publication_value,
        'recipient_kind', recipient_value,
        'winner_player_id', player_value,
        'winner_team_id', team_value,
        'recipient_display', display_value
      )
    );
  end loop;
  if (select pg_catalog.count(*) from pg_catalog.jsonb_array_elements(
        normalized
      )) <> (select pg_catalog.count(distinct value->>'award_id')
        from pg_catalog.jsonb_array_elements(normalized) value)
     or (select pg_catalog.count(*) from pg_catalog.jsonb_array_elements(
        normalized
      )) <> (select pg_catalog.count(distinct value->>'display_order')
        from pg_catalog.jsonb_array_elements(normalized) value) then
    raise exception using errcode = '22023',
      message = 'TOURNAMENT_AWARDS_DUPLICATE_ID_OR_ORDER';
  end if;
  return coalesce((select pg_catalog.jsonb_agg(value order by
      (value->>'display_order')::integer, value->>'award_id')
    from pg_catalog.jsonb_array_elements(normalized) value), '[]'::jsonb);
end;
$validate_tournament_awards$;

create function production_control.tournament_awards_public_projection_v1(
  target text
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $tournament_awards_public_projection$
  select pg_catalog.jsonb_build_object(
    'tournamentId', target,
    'revision', coalesce(pointer.current_revision,0),
    'awards', coalesce((select pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'awardId',item.award_id,'title',item.title,
        'description',item.description,'displayOrder',item.display_order,
        'recipientKind',item.recipient_kind,
        'recipient',case item.recipient_kind
          when 'PLAYER' then pg_catalog.jsonb_build_object(
            'kind','PLAYER','id',player.player_id,'name',player.display_name,
            'slug',coalesce(profile.profile_slug,
              nullif(player.source_payload->>'Slug',''),''),
            'image',case when coalesce(
              player.source_payload->>'Photo Filename','')='' then '' else
              '/images/players/' || pg_catalog.regexp_replace(
                player.source_payload->>'Photo Filename',
                '\.(png|jpe?g|webp|avif)$','','i') || '.webp' end,
            'teamId',coalesce(membership.team_id,''),
            'teamName',coalesce(player_team.name,'')
          )
          when 'TEAM' then pg_catalog.jsonb_build_object(
            'kind','TEAM','id',winner_team.team_id,'name',winner_team.name,
            'image',coalesce(
              nullif(winner_team.source_payload->>'Team Logo',''),
              nullif(winner_team.source_payload->>'Logo Filename',''),'')
          )
          when 'TEXT' then pg_catalog.jsonb_build_object(
            'kind','TEXT','name',item.recipient_display
          )
          else pg_catalog.jsonb_build_object(
            'kind','UNAVAILABLE','name','Pending'
          ) end
      ) order by item.display_order,item.award_id)
      from production_control.tournament_award_items_v1 item
      left join scoring_authority.players player
        on player.player_id=item.winner_player_id
      left join production_control.player_governance_profiles_v1 profile
        on profile.player_id=player.player_id
      left join scoring_authority.tournament_players membership
        on membership.tournament_id=target
       and membership.player_id=player.player_id
      left join scoring_authority.teams player_team
        on player_team.tournament_id=membership.tournament_id
       and player_team.team_id=membership.team_id
      left join scoring_authority.teams winner_team
        on winner_team.tournament_id=target
       and winner_team.team_id=item.winner_team_id
      where item.revision_id=pointer.current_revision_id
        and item.publication_state='PUBLISHED'), '[]'::jsonb)
  )
  from (select target tournament_id) requested
  left join production_control.tournament_awards_current_v1 pointer
    on pointer.tournament_id=requested.tournament_id
$tournament_awards_public_projection$;

create function production_control.tournament_awards_archive_projection_v1(
  target text,
  selected_revision uuid default null
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $tournament_awards_archive_projection$
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'award_id',item.award_id::text,
    'award_type',item.award_id::text,
    'label',item.title,
    'recipient_kind',item.recipient_kind,
    'winner_player_id',item.winner_player_id,
    'winner_team_id',item.winner_team_id,
    'recipient_display',item.recipient_display,
    'source_payload',pg_catalog.jsonb_build_object(
      'description',item.description,
      'displayOrder',item.display_order,
      'source','SUPABASE_DIRECTOR'
    )
  ) order by item.display_order,item.award_id), '[]'::jsonb)
  from production_control.tournament_award_items_v1 item
  left join production_control.tournament_awards_current_v1 pointer
    on pointer.tournament_id=target
  where item.tournament_id=target
    and item.revision_id=coalesce(selected_revision,pointer.current_revision_id)
    and item.publication_state='PUBLISHED'
$tournament_awards_archive_projection$;

create function public.read_production_tournament_awards_v1(input jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $read_production_tournament_awards$
declare
  target text;
  pointer production_control.tournament_awards_current_v1%rowtype;
  awards_value jsonb;
  roster_value jsonb;
  teams_value jsonb;
  history_value jsonb;
  audit_value jsonb;
begin
  target := production_control.assert_tournament_awards_runtime_v1(input);
  if input->>'operation' is distinct from
       'READ_PRODUCTION_TOURNAMENT_AWARDS_V1' then
    raise exception using errcode = '22023',
      message = 'TOURNAMENT_AWARDS_READ_INPUT_INVALID';
  end if;
  select value.* into pointer
  from production_control.tournament_awards_current_v1 value
  where value.tournament_id=target;
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'awardId',item.award_id,'title',item.title,
    'description',item.description,'displayOrder',item.display_order,
    'publicationState',item.publication_state,
    'recipientKind',item.recipient_kind,
    'winnerPlayerId',item.winner_player_id,
    'winnerTeamId',item.winner_team_id,
    'recipientDisplay',item.recipient_display,
    'recipient',case item.recipient_kind
      when 'PLAYER' then pg_catalog.jsonb_build_object(
        'kind','PLAYER','id',winner_player.player_id,
        'name',winner_player.display_name,
        'slug',coalesce(winner_profile.profile_slug,
          nullif(winner_player.source_payload->>'Slug',''),''),
        'image',case when coalesce(
          winner_player.source_payload->>'Photo Filename','')='' then '' else
          '/images/players/' || pg_catalog.regexp_replace(
            winner_player.source_payload->>'Photo Filename',
            '\.(png|jpe?g|webp|avif)$','','i') || '.webp' end,
        'teamId',coalesce(winner_membership.team_id,''),
        'teamName',coalesce(winner_player_team.name,'')
      )
      when 'TEAM' then pg_catalog.jsonb_build_object(
        'kind','TEAM','id',winner_team.team_id,'name',winner_team.name,
        'image',coalesce(nullif(winner_team.source_payload->>'Team Logo',''),
          nullif(winner_team.source_payload->>'Logo Filename',''),'')
      )
      when 'TEXT' then pg_catalog.jsonb_build_object(
        'kind','TEXT','name',item.recipient_display
      )
      else pg_catalog.jsonb_build_object(
        'kind','UNAVAILABLE','name','Pending'
      ) end
  ) order by item.display_order,item.award_id), '[]'::jsonb)
  into awards_value
  from production_control.tournament_award_items_v1 item
  left join scoring_authority.players winner_player
    on winner_player.player_id=item.winner_player_id
  left join production_control.player_governance_profiles_v1 winner_profile
    on winner_profile.player_id=winner_player.player_id
  left join scoring_authority.tournament_players winner_membership
    on winner_membership.tournament_id=target
   and winner_membership.player_id=winner_player.player_id
  left join scoring_authority.teams winner_player_team
    on winner_player_team.tournament_id=winner_membership.tournament_id
   and winner_player_team.team_id=winner_membership.team_id
  left join scoring_authority.teams winner_team
    on winner_team.tournament_id=target
   and winner_team.team_id=item.winner_team_id
  where item.revision_id=pointer.current_revision_id;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'playerId',player.player_id,'displayName',player.display_name,
    'teamId',membership.team_id,'teamName',team.name,
    'slug',coalesce(profile.profile_slug,
      nullif(player.source_payload->>'Slug',''),''),
    'image',case when coalesce(
      player.source_payload->>'Photo Filename','')='' then '' else
      '/images/players/' || pg_catalog.regexp_replace(
        player.source_payload->>'Photo Filename',
        '\.(png|jpe?g|webp|avif)$','','i') || '.webp' end
  ) order by player.display_name,player.player_id), '[]'::jsonb)
  into roster_value
  from scoring_authority.tournament_players membership
  join scoring_authority.players player on player.player_id=membership.player_id
  join scoring_authority.teams team
    on team.tournament_id=membership.tournament_id
   and team.team_id=membership.team_id
  left join production_control.player_governance_profiles_v1 profile
    on profile.player_id=player.player_id
  where membership.tournament_id=target
    and membership.participation_status='ACTIVE';

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'teamId',team.team_id,'side',team.team_side,'name',team.name,
    'logo',coalesce(nullif(team.source_payload->>'Team Logo',''),
      nullif(team.source_payload->>'Logo Filename',''),'')
  ) order by team.team_side,team.team_id), '[]'::jsonb)
  into teams_value from scoring_authority.teams team
  where team.tournament_id=target;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'revisionId',revision.revision_id,
    'revision',revision.revision_number,
    'itemCount',revision.item_count,
    'publishedCount',revision.published_count,
    'createdAt',revision.created_at
  ) order by revision.revision_number desc), '[]'::jsonb)
  into history_value from (
    select value.* from production_control.tournament_award_revisions_v1 value
    where value.tournament_id=target
    order by value.revision_number desc limit 25
  ) revision;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'eventId',audit.event_id,'revision',audit.revision_number,
    'action',audit.action,'actorPlayerId',audit.actor_player_id,
    'summary',audit.summary,'createdAt',audit.created_at
  ) order by audit.created_at desc), '[]'::jsonb)
  into audit_value from (
    select value.* from production_control.tournament_award_audit_events_v1 value
    where value.tournament_id=target order by value.created_at desc limit 25
  ) audit;

  return pg_catalog.jsonb_build_object(
    'ok',true,'code','TOURNAMENT_AWARDS_READ_READY',
    'tournamentId',target,'revision',coalesce(pointer.current_revision,0),
    'revisionId',pointer.current_revision_id,'awards',awards_value,
    'roster',roster_value,'teams',teams_value,'history',history_value,
    'audit',audit_value,'public',
      production_control.tournament_awards_public_projection_v1(target)
  );
end;
$read_production_tournament_awards$;

create function public.save_production_tournament_awards_v1(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $save_production_tournament_awards$
declare
  target text;
  actor_player text := pg_catalog.upper(pg_catalog.btrim(coalesce(
    input#>>'{authorization,player_id}',''
  )));
  actor_auth uuid;
  request_id uuid;
  expected_value bigint;
  declared_hash text := pg_catalog.lower(pg_catalog.btrim(coalesce(
    input->>'request_payload_hash',''
  )));
  database_hash text;
  normalized jsonb;
  prior production_control.tournament_award_operation_receipts_v1%rowtype;
  pointer production_control.tournament_awards_current_v1%rowtype;
  next_revision bigint;
  revision_id_value uuid := extensions.gen_random_uuid();
  item jsonb;
  item_count_value integer;
  published_count_value integer;
  response_value jsonb;
begin
  target := production_control.assert_tournament_awards_runtime_v1(input);
  if input->>'operation' is distinct from
       'SAVE_PRODUCTION_TOURNAMENT_AWARDS_V1'
     or coalesce(input->>'operation_request_id','')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'expected_revision','') !~ '^[0-9]+$'
     or declared_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023',
      message = 'TOURNAMENT_AWARDS_INPUT_INVALID';
  end if;
  actor_auth := (input#>>'{authorization,auth_user_id}')::uuid;
  request_id := (input->>'operation_request_id')::uuid;
  expected_value := (input->>'expected_revision')::bigint;
  normalized := production_control.validate_tournament_awards_v1(
    target, input->'awards'
  );
  database_hash := production_control.tournament_awards_hash_v1(
    pg_catalog.jsonb_build_object(
      'operation','SAVE','tournamentId',target,
      'actorPlayerId',actor_player,'actorAuthUserId',actor_auth,
      'expectedRevision',expected_value,'awards',normalized
    )
  );
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'production-tournament-awards:'||target,0
  ));
  select value.* into prior
  from production_control.tournament_award_operation_receipts_v1 value
  where value.tournament_id=target
    and value.operation_request_id=request_id;
  if found then
    if prior.declared_request_payload_hash=declared_hash
       and prior.database_request_payload_hash=database_hash then
      return prior.response || pg_catalog.jsonb_build_object('idempotent',true);
    end if;
    raise exception using errcode = '23505',
      message = 'TOURNAMENT_AWARDS_OPERATION_REQUEST_CONFLICT';
  end if;
  select value.* into pointer
  from production_control.tournament_awards_current_v1 value
  where value.tournament_id=target for update;
  if expected_value <> coalesce(pointer.current_revision,0) then
    raise exception using errcode = '40001',
      message = 'TOURNAMENT_AWARDS_REVISION_STALE';
  end if;
  if pointer.current_revision_id is not null and exists (
    select 1 from production_control.tournament_award_items_v1 old_item
    where old_item.revision_id=pointer.current_revision_id
      and old_item.publication_state='PUBLISHED'
      and not exists (
        select 1 from pg_catalog.jsonb_array_elements(normalized) new_item
        where new_item->>'award_id'=old_item.award_id::text
          and new_item->>'publication_state' in ('PUBLISHED','RETIRED')
      )
  ) then
    raise exception using errcode = '22023',
      message = 'TOURNAMENT_AWARDS_PUBLISHED_REMOVAL_INVALID';
  end if;
  next_revision := coalesce(pointer.current_revision,0)+1;
  item_count_value := pg_catalog.jsonb_array_length(normalized);
  select pg_catalog.count(*)::integer into published_count_value
  from pg_catalog.jsonb_array_elements(normalized) value
  where value->>'publication_state'='PUBLISHED';
  insert into production_control.tournament_award_revisions_v1 (
    revision_id,tournament_id,revision_number,predecessor_revision_id,
    content_fingerprint,item_count,published_count,actor_player_id,
    actor_auth_user_id,operation_request_id
  ) values (
    revision_id_value,target,next_revision,pointer.current_revision_id,
    production_control.tournament_awards_hash_v1(normalized),
    item_count_value,published_count_value,actor_player,actor_auth,request_id
  );
  for item in select value from pg_catalog.jsonb_array_elements(normalized)
  loop
    insert into production_control.tournament_award_items_v1 (
      revision_id,tournament_id,award_id,title,description,display_order,
      publication_state,recipient_kind,winner_player_id,winner_team_id,
      recipient_display
    ) values (
      revision_id_value,target,(item->>'award_id')::uuid,item->>'title',
      item->>'description',(item->>'display_order')::integer,
      item->>'publication_state',item->>'recipient_kind',
      nullif(item->>'winner_player_id',''),nullif(item->>'winner_team_id',''),
      nullif(item->>'recipient_display','')
    );
  end loop;
  insert into production_control.tournament_awards_current_v1 (
    tournament_id,current_revision_id,current_revision,
    updated_by_player_id,updated_by_auth_user_id
  ) values (target,revision_id_value,next_revision,actor_player,actor_auth)
  on conflict (tournament_id) do update set
    current_revision_id=excluded.current_revision_id,
    current_revision=excluded.current_revision,
    updated_by_player_id=excluded.updated_by_player_id,
    updated_by_auth_user_id=excluded.updated_by_auth_user_id,
    updated_at=pg_catalog.clock_timestamp();
  response_value := pg_catalog.jsonb_build_object(
    'ok',true,'code','TOURNAMENT_AWARDS_REVISION_SAVED',
    'idempotent',false,'tournamentId',target,
    'revisionId',revision_id_value,'revision',next_revision,
    'itemCount',item_count_value,'publishedCount',published_count_value
  );
  insert into production_control.tournament_award_audit_events_v1 (
    tournament_id,revision_id,revision_number,action,actor_player_id,
    actor_auth_user_id,operation_request_id,summary
  ) values (
    target,revision_id_value,next_revision,'AWARDS_REVISION_SAVED',
    actor_player,actor_auth,request_id,pg_catalog.jsonb_build_object(
      'itemCount',item_count_value,'publishedCount',published_count_value,
      'draftCount',(select pg_catalog.count(*) from
        pg_catalog.jsonb_array_elements(normalized) value
        where value->>'publication_state'='DRAFT'),
      'retiredCount',(select pg_catalog.count(*) from
        pg_catalog.jsonb_array_elements(normalized) value
        where value->>'publication_state'='RETIRED')
    )
  );
  insert into production_control.tournament_award_operation_receipts_v1 (
    tournament_id,operation_request_id,declared_request_payload_hash,
    database_request_payload_hash,revision_id,actor_player_id,
    actor_auth_user_id,response
  ) values (
    target,request_id,declared_hash,database_hash,revision_id_value,
    actor_player,actor_auth,response_value
  );
  return response_value;
end;
$save_production_tournament_awards$;

comment on function production_control.tournament_awards_archive_projection_v1(
  text,uuid
) is 'Archive adapter only. A future completed-history transition materializes published Award identities into the existing immutable completed_history_awards shape.';

revoke all on function
  production_control.reject_tournament_awards_immutable_v1(),
  production_control.tournament_awards_hash_v1(jsonb),
  production_control.assert_tournament_awards_runtime_v1(jsonb),
  production_control.validate_tournament_awards_v1(text,jsonb),
  production_control.tournament_awards_public_projection_v1(text),
  production_control.tournament_awards_archive_projection_v1(text,uuid)
from public, anon, authenticated, service_role;

revoke all on function
  public.read_production_tournament_awards_v1(jsonb),
  public.save_production_tournament_awards_v1(jsonb)
from public, anon, authenticated;

grant execute on function
  public.read_production_tournament_awards_v1(jsonb),
  public.save_production_tournament_awards_v1(jsonb)
to service_role;

notify pgrst, 'reload schema';
commit;
