-- Entry authority only. No Full-Net calculation/configuration/publication.
-- Release B's uninstalled 098 draft must become a separately certified successor.
begin;
create table production_control.net_skins_entry_revisions_v1 (
  tournament_id text not null references scoring_authority.tournaments(tournament_id),
  round_number integer not null,
  revision bigint not null check(revision>0),
  request_id uuid not null,
  request_hash text not null,
  field_fingerprint text not null,
  configured boolean not null,
  entries jsonb not null check(jsonb_typeof(entries)='array'),
  actor_player_id text not null references scoring_authority.players(player_id),
  actor_auth_user_id uuid not null references auth.users(id),
  source text not null default 'DIRECTOR_EXPLICIT_ROUND_ENTRY_V1',
  created_at timestamptz not null default clock_timestamp(),
  response jsonb not null,
  primary key(tournament_id,round_number,revision),
  unique(tournament_id,request_id),
  foreign key(tournament_id,round_number) references scoring_authority.rounds(tournament_id,round_number)
);
alter table production_control.net_skins_entry_revisions_v1 enable row level security;
revoke all on production_control.net_skins_entry_revisions_v1 from public,anon,authenticated,service_role;
create function production_control.net_skins_entry_history_immutable_v1() returns trigger
language plpgsql set search_path=pg_catalog as $$
begin raise exception 'TOURNAMENT_SETUP_SKINS_ENTRY_HISTORY_IMMUTABLE'; end;
$$;
create trigger net_skins_entry_history_immutable before update or delete
  on production_control.net_skins_entry_revisions_v1 for each row
  execute function production_control.net_skins_entry_history_immutable_v1();

-- Read-only canonical field. Pairing history prevents clear/repopulate from
-- reviving consent even when the same people return. No pairing write changed.
create function production_control.net_skins_entry_field_v1(target text, rn integer)
returns jsonb language sql stable security definer set search_path=pg_catalog as $$
with candidates as (
  select m.match_id,m.round_number,coalesce(d.match_number,g.match_sort_order) match_number,m.format,p.team_side,
    case when m.format='SC' then 0 else p.player_slot end slot,
    jsonb_agg(p.player_id order by p.player_slot) ids,
    jsonb_agg(jsonb_build_object('id',p.player_id,'name',person.display_name) order by p.player_slot) players,
    min(tp.team_id) team_id,min(t.name) team_name,
    coalesce((select max(a.next_revision) from production_control.tournament_setup_audit_events_v1 a
      where a.tournament_id=target and a.result='CHANGED' and
      ((a.action='REPLACE_PAIRINGS' and a.target_id=m.match_id) or
       (a.action='REPLACE_ROUND_PAIRINGS' and a.safe_metadata->'changedMatches' ? m.match_id))),0) pairing_revision
  from scoring_authority.matches m join scoring_authority.match_participants p using(match_id)
  left join scoring_authority.tournament_setup_match_details_v1 d on d.match_id=m.match_id
  left join scoring_authority.game_center_presentations g on g.match_id=m.match_id
  join scoring_authority.tournament_players tp on tp.tournament_id=m.tournament_id and tp.player_id=p.player_id
    and tp.participation_status='ACTIVE' and tp.team_side=p.team_side
  join scoring_authority.players person on person.player_id=p.player_id
  join scoring_authority.teams t on t.tournament_id=tp.tournament_id and t.team_id=tp.team_id
  where m.tournament_id=target and m.round_number=rn and m.format in('BB','SC','SI')
    and m.format=(select format from scoring_authority.rounds where tournament_id=target and round_number=rn)
  group by m.match_id,m.round_number,d.match_number,g.match_sort_order,m.format,p.team_side,
    case when m.format='SC' then 0 else p.player_slot end
  having count(*)=case m.format when 'SC' then 2 else 1 end and count(distinct tp.team_id)=1
), items as (
  select match_number,team_side,slot,jsonb_build_object(
    'key',match_id||':'||team_side||':'||slot,'matchId',match_id,'matchNumber',match_number,
    'roundNumber',round_number,'format',format,'scope',case format when 'SC' then 'PAIR' else 'PLAYER' end,
    'playerIds',ids,'players',players,'teamId',team_id,'teamName',team_name,
    'bindingFingerprint',production_control.tournament_setup_hash_v1(jsonb_build_object(
      'tournament',target,'round',rn,'match',match_id,'format',format,'side',team_side,
      'players',ids,'team',team_id,'pairingRevision',pairing_revision))) item from candidates
)
select coalesce(jsonb_agg(item order by match_number,item->>'matchId',team_side,slot),'[]') from items;
$$;

-- Safe read product: no Director identity, request IDs, authorization or audit
-- internals. An unavailable/stale saved binding never contributes eligibility.
create function production_control.net_skins_entries_projection_v1(target text)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare rr record; saved production_control.net_skins_entry_revisions_v1%rowtype;
  field jsonb; rows jsonb; stale jsonb; result jsonb:='[]'; item jsonb; old jsonb; eligible integer;
begin
  for rr in select round_number,format from scoring_authority.rounds where tournament_id=target
    and format in('BB','SC','SI') order by round_number loop
    select * into saved from production_control.net_skins_entry_revisions_v1 where tournament_id=target
      and round_number=rr.round_number order by revision desc limit 1;
    field:=production_control.net_skins_entry_field_v1(target,rr.round_number); rows:='[]'; eligible:=0;
    for item in select value from jsonb_array_elements(field) loop
      select value into old from jsonb_array_elements(coalesce(saved.entries,'[]'))
        where value->>'key'=item->>'key' and value->>'bindingFingerprint'=item->>'bindingFingerprint';
      if saved.configured and old->>'entered'='true' then eligible:=eligible+1; end if;
      rows:=rows||jsonb_build_array(item||jsonb_build_object('entered',coalesce(saved.configured and old->>'entered'='true',false)));
    end loop;
    select coalesce(jsonb_agg(e),'[]') into stale from jsonb_array_elements(coalesce(saved.entries,'[]')) e
      where e->>'entered'='true' and not exists(select 1 from jsonb_array_elements(field) f
        where f->>'key'=e->>'key' and f->>'bindingFingerprint'=e->>'bindingFingerprint');
    result:=result||jsonb_build_array(jsonb_build_object('roundNumber',rr.round_number,'format',rr.format,
      'scope',case rr.format when 'SC' then 'PAIR' else 'PLAYER' end,'revision',coalesce(saved.revision,0),
      'configured',coalesce(saved.configured,false),'source','DIRECTOR_EXPLICIT_ROUND_ENTRY_V1',
      'savedAt',saved.created_at,'fieldFingerprint',production_control.tournament_setup_hash_v1(field),
      'entrants',rows,'staleEntries',stale,'enteredCount',eligible,
      'state',case when jsonb_array_length(stale)>0 then 'REVIEW_REQUIRED' when not coalesce(saved.configured,false)
        then 'NOT_CONFIGURED' when jsonb_array_length(field)=0 then 'WAITING_FOR_PAIRINGS' else 'ENTRIES_SAVED' end));
  end loop;
  return jsonb_build_object('contract','production-net-skins-entries-v1','tournamentId',target,'rounds',result);
end;
$$;

create function public.read_production_net_skins_entries_v1(input jsonb)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
begin
  perform production_control.assert_tournament_setup_runtime_v1(input);
  return jsonb_build_object('ok',true,'data',production_control.net_skins_entries_projection_v1('2026'));
end;
$$;

create function public.save_production_net_skins_entries_v1(input jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare rn integer; expected bigint; request_id_value uuid; hash_value text; current_revision bigint;
  prior production_control.net_skins_entry_revisions_v1%rowtype;
  field jsonb; row_value jsonb; canonical jsonb:='[]'; item jsonb; configured_value boolean; response_value jsonb;
begin
  perform production_control.assert_tournament_setup_runtime_v1(input);
  if coalesce(input->>'round_number','') !~ '^[1-9][0-9]?$' or coalesce(input->>'expected_revision','') !~ '^[0-9]+$'
    or jsonb_typeof(input->'configured') is distinct from 'boolean' or jsonb_typeof(input->'entries') is distinct from 'array'
    or input->>'actor_player_id' is distinct from input#>>'{authorization,player_id}'
    or input->>'actor_auth_user_id' is distinct from input#>>'{authorization,auth_user_id}' then
    raise exception 'TOURNAMENT_SETUP_SKINS_ENTRIES_INPUT_INVALID'; end if;
  rn:=(input->>'round_number')::integer; expected:=(input->>'expected_revision')::bigint;
  configured_value:=(input->>'configured')::boolean; request_id_value:=(input->>'operation_request_id')::uuid;
  if request_id_value is null then raise exception 'TOURNAMENT_SETUP_OPERATION_REQUEST_ID_REQUIRED'; end if;
  hash_value:=production_control.tournament_setup_hash_v1(input);
  -- Serialize with ordinary single/round pair saves, then with financial workers.
  perform pg_advisory_xact_lock(hashtextextended('production-tournament-setup-v1:2026',0));
  select * into prior from production_control.net_skins_entry_revisions_v1 where tournament_id='2026' and request_id=request_id_value;
  if found then
    if prior.request_hash is distinct from hash_value then raise exception 'TOURNAMENT_SETUP_IDEMPOTENCY_CONFLICT'; end if;
    return prior.response||jsonb_build_object('idempotent',true);
  end if;
  lock table scoring_authority.matches,scoring_authority.match_participants,scoring_authority.tournament_players,
    scoring_authority.scoring_permissions,scoring_authority.scoring_ingress_leases,
    scoring_authority.net_skins_configuration_entries,scoring_authority.net_skins_v1_recalculation_jobs,
    scoring_authority.net_skins_v1_result_revisions in share mode;
  select coalesce(max(revision),0) into current_revision from production_control.net_skins_entry_revisions_v1
    where tournament_id='2026' and round_number=rn;
  if expected<>current_revision then raise exception 'TOURNAMENT_SETUP_SKINS_ENTRIES_REVISION_STALE'; end if;
  if not exists(select 1 from scoring_authority.rounds where tournament_id='2026' and round_number=rn and format in('BB','SC','SI'))
    then raise exception 'TOURNAMENT_SETUP_SKINS_ROUND_INVALID'; end if;
  if exists(select 1 from scoring_authority.matches m where m.tournament_id='2026' and m.round_number=rn
      and not production_control.handicap_v1_match_is_unstarted(m.match_id))
    or exists(select 1 from scoring_authority.scoring_permissions p join scoring_authority.matches m using(match_id)
      where m.tournament_id='2026' and m.round_number=rn and p.can_score and p.revoked_at is null)
    or exists(select 1 from scoring_authority.scoring_ingress_leases l join scoring_authority.matches m using(match_id)
      where m.tournament_id='2026' and m.round_number=rn and l.expires_at>clock_timestamp())
    or exists(select 1 from scoring_authority.net_skins_configuration_entries where tournament_id='2026' and round_number=rn)
    or exists(select 1 from scoring_authority.net_skins_v1_result_revisions where tournament_id='2026' and round_number=rn)
    or exists(select 1 from scoring_authority.net_skins_v1_recalculation_jobs where tournament_id='2026' and round_number=rn and status in('PENDING','RUNNING'))
    then raise exception 'TOURNAMENT_SETUP_SKINS_ENTRIES_DEPENDENCY_BLOCKED'; end if;
  field:=production_control.net_skins_entry_field_v1('2026',rn);
  if exists(select 1 from jsonb_array_elements(field) f cross join lateral jsonb_array_elements_text(f->'playerIds') p
    group by p having count(*)>1) then raise exception 'TOURNAMENT_SETUP_SKINS_DUPLICATE_PLAYER'; end if;
  if input->>'field_fingerprint' is distinct from production_control.tournament_setup_hash_v1(field)
    then raise exception 'TOURNAMENT_SETUP_SKINS_PAIRING_STALE'; end if;
  if jsonb_array_length(input->'entries')<>jsonb_array_length(field)
    or (select count(distinct value->>'key') from jsonb_array_elements(input->'entries'))<>jsonb_array_length(field)
    then raise exception 'TOURNAMENT_SETUP_SKINS_ENTRY_SET_INVALID'; end if;
  for item in select value from jsonb_array_elements(field) loop
    select value into row_value from jsonb_array_elements(input->'entries') where value->>'key'=item->>'key';
    if row_value is null or jsonb_typeof(row_value->'entered') is distinct from 'boolean'
      or row_value->>'bindingFingerprint' is distinct from item->>'bindingFingerprint'
      or (not configured_value and row_value->>'entered'='true') then
      raise exception 'TOURNAMENT_SETUP_SKINS_ENTRY_BINDING_INVALID'; end if;
    canonical:=canonical||jsonb_build_array(item||jsonb_build_object('entered',(row_value->>'entered')::boolean));
  end loop;
  if configured_value and jsonb_array_length(field)=0 then raise exception 'TOURNAMENT_SETUP_SKINS_PAIRINGS_REQUIRED'; end if;
  response_value:=jsonb_build_object('ok',true,'revision',current_revision+1,'roundNumber',rn,'idempotent',false,
    'scoringMutationCreated',false,'financialMutationCreated',false,'publicationCreated',false);
  insert into production_control.net_skins_entry_revisions_v1(tournament_id,round_number,revision,request_id,request_hash,
    field_fingerprint,configured,entries,actor_player_id,actor_auth_user_id,response)
    values('2026',rn,current_revision+1,request_id_value,hash_value,input->>'field_fingerprint',configured_value,canonical,
      input->>'actor_player_id',(input->>'actor_auth_user_id')::uuid,response_value);
  return response_value;
end;
$$;
revoke all on function production_control.net_skins_entry_history_immutable_v1(),
  production_control.net_skins_entry_field_v1(text,integer),production_control.net_skins_entries_projection_v1(text),
  public.read_production_net_skins_entries_v1(jsonb),public.save_production_net_skins_entries_v1(jsonb)
  from public,anon,authenticated,service_role;
grant execute on function public.read_production_net_skins_entries_v1(jsonb),
  public.save_production_net_skins_entries_v1(jsonb) to service_role;
commit;
