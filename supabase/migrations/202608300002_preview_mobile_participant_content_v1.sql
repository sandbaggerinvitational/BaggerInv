-- Isolated-Preview participant reads for bounded native History/Records and
-- explicit published-Odds visibility. The native client never receives raw
-- table access; every function remains service-role only.

begin;

create table scoring_authority.preview_mobile_odds_publications (
  tournament_id text primary key
    references scoring_authority.tournaments (tournament_id) on delete cascade,
  publication_state text not null default 'UNPUBLISHED'
    check (publication_state in ('UNPUBLISHED', 'PUBLISHED')),
  publication_revision bigint not null default 0
    check (publication_revision >= 0),
  current_snapshot_id uuid,
  current_milestone text,
  published_at timestamptz,
  updated_at timestamptz not null default pg_catalog.now(),
  check ((publication_state = 'PUBLISHED'
      and publication_revision > 0
      and current_snapshot_id is not null
      and current_milestone is not null
      and published_at is not null)
    or (publication_state = 'UNPUBLISHED'
      and current_snapshot_id is null
      and current_milestone is null
      and published_at is null))
);

alter table scoring_authority.preview_mobile_odds_publications
  enable row level security;
revoke all on scoring_authority.preview_mobile_odds_publications
  from public, anon, authenticated;
grant select, insert, update on
  scoring_authority.preview_mobile_odds_publications to service_role;

insert into scoring_authority.preview_mobile_odds_publications (
  tournament_id, publication_state, publication_revision,
  current_snapshot_id, current_milestone, published_at, updated_at
)
select value.tournament_id, 'PUBLISHED',
  greatest(1, value.publication_revision), value.id,
  value.milestone, value.published_at, pg_catalog.now()
from scoring_authority.odds_published_snapshots value
where value.is_current_official and value.publication_verified
on conflict (tournament_id) do nothing;

create or replace function scoring_authority.capture_preview_mobile_odds_publication()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, scoring_authority
as $$
begin
  if new.is_current_official and new.publication_verified
      and (tg_op = 'INSERT'
        or old.is_current_official is distinct from true
        or old.publication_verified is distinct from true) then
    insert into scoring_authority.preview_mobile_odds_publications (
      tournament_id, publication_state, publication_revision,
      current_snapshot_id, current_milestone, published_at, updated_at
    ) values (
      new.tournament_id, 'PUBLISHED',
      greatest(1, new.publication_revision),
      new.id, new.milestone, new.published_at, pg_catalog.now()
    ) on conflict (tournament_id) do update set
      publication_state = 'PUBLISHED',
      publication_revision = case
        when scoring_authority.preview_mobile_odds_publications.current_snapshot_id
          is not distinct from excluded.current_snapshot_id
          and scoring_authority.preview_mobile_odds_publications.publication_state = 'PUBLISHED'
          then scoring_authority.preview_mobile_odds_publications.publication_revision
        else scoring_authority.preview_mobile_odds_publications.publication_revision + 1
      end,
      current_snapshot_id = excluded.current_snapshot_id,
      current_milestone = excluded.current_milestone,
      published_at = excluded.published_at,
      updated_at = pg_catalog.now();
  elsif tg_op = 'UPDATE'
      and old.is_current_official and old.publication_verified
      and (not new.is_current_official or not new.publication_verified) then
    -- Revoking the verified/current source must become an explicit
    -- participant-visible withdrawal. Returning an authority error here would
    -- allow a native private cache to keep showing the formerly published
    -- representation as merely stale.
    update scoring_authority.preview_mobile_odds_publications publication
    set publication_state = 'UNPUBLISHED',
      publication_revision = publication.publication_revision + 1,
      current_snapshot_id = null,
      current_milestone = null,
      published_at = null,
      updated_at = pg_catalog.now()
    where publication.tournament_id = new.tournament_id
      and publication.publication_state = 'PUBLISHED'
      and publication.current_snapshot_id = old.id
      and not exists (
        select 1
        from scoring_authority.odds_published_snapshots candidate
        where candidate.tournament_id = new.tournament_id
          and candidate.is_current_official
          and candidate.publication_verified
      );
  end if;
  return new;
end;
$$;

revoke all on function
  scoring_authority.capture_preview_mobile_odds_publication()
  from public, anon, authenticated, service_role;

create trigger preview_mobile_odds_publication_capture
after insert or update of is_current_official, publication_verified
on scoring_authority.odds_published_snapshots
for each row execute function
  scoring_authority.capture_preview_mobile_odds_publication();

create or replace function public.set_preview_mobile_odds_publication(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, scoring_authority
as $$
declare
  target_tournament text := pg_catalog.btrim(coalesce(
    input->>'tournament_id', ''));
  target_state text := pg_catalog.upper(pg_catalog.btrim(coalesce(
    input->>'publication_state', '')));
  target_actor text := pg_catalog.left(pg_catalog.btrim(coalesce(
    input->>'requested_by', '')), 180);
  snapshot_value scoring_authority.odds_published_snapshots%rowtype;
  current_value scoring_authority.preview_mobile_odds_publications%rowtype;
  next_revision bigint;
begin
  if pg_catalog.upper(coalesce(input->>'environment', '')) <> 'PREVIEW'
      or target_tournament = '' or target_actor = ''
      or target_state not in ('UNPUBLISHED', 'PUBLISHED') then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'COMPLETE_PREVIEW_ODDS_PUBLICATION_REQUIRED');
  end if;
  select value.* into current_value
  from scoring_authority.preview_mobile_odds_publications value
  where value.tournament_id = target_tournament for update;
  select value.* into snapshot_value
  from scoring_authority.odds_published_snapshots value
  where value.tournament_id = target_tournament
    and value.is_current_official and value.publication_verified;
  if target_state = 'PUBLISHED' and snapshot_value.id is null then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'VERIFIED_PREVIEW_ODDS_PUBLICATION_REQUIRED');
  end if;
  if current_value.publication_state = target_state
      and (target_state = 'UNPUBLISHED'
        or current_value.current_snapshot_id = snapshot_value.id) then
    return pg_catalog.jsonb_build_object(
      'ok', true, 'idempotent', true,
      'publication_state', target_state,
      'publication_revision', current_value.publication_revision);
  end if;
  next_revision := coalesce(current_value.publication_revision, 0) + 1;
  insert into scoring_authority.preview_mobile_odds_publications (
    tournament_id, publication_state, publication_revision,
    current_snapshot_id, current_milestone, published_at, updated_at
  ) values (
    target_tournament, target_state, next_revision,
    case when target_state = 'PUBLISHED' then snapshot_value.id else null end,
    case when target_state = 'PUBLISHED' then snapshot_value.milestone else null end,
    case when target_state = 'PUBLISHED' then snapshot_value.published_at else null end,
    pg_catalog.now()
  ) on conflict (tournament_id) do update set
    publication_state = excluded.publication_state,
    publication_revision = excluded.publication_revision,
    current_snapshot_id = excluded.current_snapshot_id,
    current_milestone = excluded.current_milestone,
    published_at = excluded.published_at,
    updated_at = pg_catalog.now();
  insert into scoring_authority.audit_events (
    tournament_id, action, actor_id, metadata
  ) values (
    target_tournament,
    case when target_state = 'PUBLISHED'
      then 'PREVIEW_MOBILE_ODDS_PUBLISHED'
      else 'PREVIEW_MOBILE_ODDS_UNPUBLISHED' end,
    target_actor,
    pg_catalog.jsonb_build_object(
      'publicationRevision', next_revision,
      'milestone', case when target_state = 'PUBLISHED'
        then snapshot_value.milestone else null end)
  );
  return pg_catalog.jsonb_build_object(
    'ok', true, 'idempotent', false,
    'publication_state', target_state,
    'publication_revision', next_revision);
end;
$$;

revoke all on function public.set_preview_mobile_odds_publication(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.set_preview_mobile_odds_publication(jsonb)
  to service_role;

create or replace function public.read_preview_mobile_participant_content_v1(
  input jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, scoring_authority, public
as $$
declare
  preview_project constant text := 'idgigvjjqkfbqjeredpb';
  history_workbook constant text :=
    '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4';
  target_tournament text := pg_catalog.btrim(coalesce(
    input->>'tournament_id', ''));
  target_player text := pg_catalog.btrim(coalesce(
    input->>'player_id', ''));
  target_scope text := pg_catalog.upper(pg_catalog.btrim(coalesce(
    input->>'scope', '')));
  target_year integer;
  nested jsonb;
  result_value jsonb := '[]'::jsonb;
  publication_value scoring_authority.preview_mobile_odds_publications%rowtype;
begin
  if pg_catalog.upper(coalesce(input->>'environment', '')) <> 'PREVIEW'
      or target_tournament = '' or target_player = ''
      or target_scope not in (
        'HISTORY_ARCHIVE', 'COMPLETED_HISTORY_BUNDLE', 'ODDS')
      or not exists (
        select 1 from scoring_authority.tournament_players membership
        where membership.tournament_id = target_tournament
          and membership.player_id = target_player
          and membership.participation_status = 'ACTIVE'
      ) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'PREVIEW_PARTICIPANT_RESOURCE_REQUIRED');
  end if;

  if target_scope = 'HISTORY_ARCHIVE' then
    select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'tournament_id', revision.tournament_id,
      'tournament_year', revision.tournament_year,
      'revision_id', revision.revision_id,
      'revision_number', revision.revision_number,
      'tournament', pg_catalog.jsonb_build_object(
        'name', tournament.name,
        'start_date', fact.start_date,
        'end_date', fact.end_date,
        'destination', fact.destination,
        'lifecycle', fact.lifecycle,
        'score_availability', fact.score_availability,
        'official_team_1_points', fact.official_team_1_points,
        'official_team_2_points', fact.official_team_2_points,
        'champion_team_side', fact.champion_team_side,
        'champion_team_id', fact.champion_team_id),
      'teams', coalesce((
        select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'team_id', team.team_id,
          'team_side', team.team_side,
          'name', team.name)
          order by team.team_side)
        from scoring_authority.completed_history_team_facts team
        where team.revision_id = revision.revision_id
      ), '[]'::jsonb)
    ) order by revision.tournament_year desc), '[]'::jsonb)
    into result_value
    from scoring_authority.completed_history_current_revisions current_pointer
    join scoring_authority.completed_history_revisions revision
      on revision.revision_id = current_pointer.revision_id
    join scoring_authority.tournaments tournament
      on tournament.tournament_id = revision.tournament_id
    join scoring_authority.completed_history_tournament_facts fact
      on fact.revision_id = revision.revision_id;
    return pg_catalog.jsonb_build_object(
      'ok', true, 'data', pg_catalog.jsonb_build_object(
        'scope', target_scope, 'completed_years', result_value));
  end if;

  if target_scope = 'COMPLETED_HISTORY_BUNDLE' then
    for target_year in 2017..2025 loop
      nested := public.read_preview_completed_history(
        pg_catalog.jsonb_build_object(
          'environment', 'PREVIEW',
          'project_ref', preview_project,
          'source_workbook_id', history_workbook,
          'mode', 'YEAR',
          'tournament_year', target_year));
      if not coalesce((nested->>'ok')::boolean, false)
          or nested->'data' is null then
        return pg_catalog.jsonb_build_object(
          'ok', false,
          'code', coalesce(nested->>'code',
            'PREVIEW_COMPLETED_HISTORY_BUNDLE_UNAVAILABLE'));
      end if;
      result_value := result_value || pg_catalog.jsonb_build_array(
        nested->'data');
    end loop;
    return pg_catalog.jsonb_build_object(
      'ok', true, 'data', pg_catalog.jsonb_build_object(
        'scope', target_scope, 'completed_years', result_value));
  end if;

  select value.* into publication_value
  from scoring_authority.preview_mobile_odds_publications value
  where value.tournament_id = target_tournament;
  if publication_value.tournament_id is null then
    return pg_catalog.jsonb_build_object(
      'ok', true, 'data', pg_catalog.jsonb_build_object(
        'scope', target_scope,
        'tournament_id', target_tournament,
        'publication', pg_catalog.jsonb_build_object(
          'state', 'UNPUBLISHED', 'revision', 0,
          'published_at', null, 'current_milestone', null),
        'snapshots', '[]'::jsonb));
  end if;
  if publication_value.publication_state = 'UNPUBLISHED' then
    return pg_catalog.jsonb_build_object(
      'ok', true, 'data', pg_catalog.jsonb_build_object(
        'scope', target_scope,
        'tournament_id', target_tournament,
        'publication', pg_catalog.jsonb_build_object(
          'state', 'UNPUBLISHED',
          'revision', publication_value.publication_revision,
          'published_at', null, 'current_milestone', null),
        'snapshots', '[]'::jsonb));
  end if;
  if not exists (
    select 1 from scoring_authority.odds_published_snapshots value
    where value.id = publication_value.current_snapshot_id
      and value.tournament_id = target_tournament
      and value.is_current_official and value.publication_verified
  ) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'PREVIEW_ODDS_PUBLICATION_INCONSISTENT');
  end if;
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'snapshot_id', value.id,
    'milestone', value.milestone,
    'phase_order', value.phase_order,
    'publication_revision', value.publication_revision,
    'published_at', value.published_at,
    'payload', value.published_payload,
    'is_current_official', value.id = publication_value.current_snapshot_id,
    'publication_verified', value.publication_verified)
    order by value.phase_order), '[]'::jsonb)
    into result_value
  from scoring_authority.odds_published_snapshots value
  where value.tournament_id = target_tournament
    and value.is_current_for_milestone and value.publication_verified;
  return pg_catalog.jsonb_build_object(
    'ok', true, 'data', pg_catalog.jsonb_build_object(
      'scope', target_scope,
      'tournament_id', target_tournament,
      'publication', pg_catalog.jsonb_build_object(
        'state', 'PUBLISHED',
        'revision', publication_value.publication_revision,
        'published_at', publication_value.published_at,
        'current_milestone', publication_value.current_milestone),
      'snapshots', result_value));
end;
$$;

revoke all on function public.read_preview_mobile_participant_content_v1(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.read_preview_mobile_participant_content_v1(jsonb)
  to service_role;

notify pgrst, 'reload schema';

commit;
