-- Release B. Prospective, inert installation: no configuration, opt-in,
-- score, job, auction, result, publication or handicap revision is created.
-- 055/074/085/095/096/097 remain immutable. Matchup authority is untouched.
begin;

create function production_control.full_net_match_v1(target text, match_key text)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare
  m scoring_authority.matches%rowtype;
  s scoring_authority.scoring_snapshots%rowtype;
  r scoring_authority.handicap_revisions%rowtype;
  authority_ok boolean; side integer; p record; h record;
  ids jsonb; partners jsonb; entries jsonb:='[]'; cells jsonb;
  ch numeric; allocation integer; applied integer; gross numeric;
  complete boolean; entity_id text; slot integer;
begin
  select * into m from scoring_authority.matches where tournament_id=target and match_id=match_key;
  if not found then raise exception 'FULL_NET_MATCH_BINDING_REQUIRED'; end if;
  select * into s from scoring_authority.scoring_snapshots where snapshot_id=m.scoring_snapshot_id
    and tournament_id=target and match_id=m.match_id;
  select * into r from scoring_authority.handicap_revisions where revision_id=s.handicap_revision_id
    and tournament_id=target;
  authority_ok:=s.snapshot_id is not null and s.canonical_hash is not null
    and r.approved_at is not null and r.status in('APPROVED','SUPERSEDED')
    and s.slope is not null and s.rating is not null and s.par is not null
    and exists(select 1 from scoring_authority.tournament_setup_match_details_v1 d
      where d.tournament_id=target and d.match_id=m.match_id and d.prepared_setup_revision is not null)
    and (select count(*) from scoring_authority.match_participants where match_id=m.match_id)=case m.format when 'SI' then 2 else 4 end
    and not exists(select 1 from scoring_authority.match_participants bound
      left join scoring_authority.handicap_revision_entries e on e.revision_id=s.handicap_revision_id
        and e.tournament_id=target and e.player_id=bound.player_id
      where bound.match_id=m.match_id and (bound.handicap_revision_id is distinct from s.handicap_revision_id
        or e.player_id is null or bound.course_handicap is null
        or bound.course_handicap is distinct from e.tournament_handicap*(s.slope::numeric/113::numeric)+(s.rating-s.par::numeric)
        or not exists(select 1 from jsonb_array_elements(coalesce(s.participant_configuration->('team_'||bound.team_side),'[]')) frozen
          where frozen->>'id'=bound.player_id and (frozen->>'slot')::integer=bound.player_slot
            and frozen->>'handicap_revision_id'=s.handicap_revision_id::text
            and (frozen->>'course_handicap')::numeric=bound.course_handicap)))
    and (select count(*)=18 and count(distinct stroke_index)=18
      and min(stroke_index)=1 and max(stroke_index)=18 and min(hole_number)=1 and max(hole_number)=18
      from scoring_authority.match_holes where match_id=m.match_id);
  authority_ok:=coalesce(authority_ok,false);
  for side in 1..2 loop
    for p in select mp.* from scoring_authority.match_participants mp where mp.match_id=m.match_id
      and mp.team_side=side and (m.format<>'SC' or mp.player_slot=1) order by mp.player_slot loop
      select jsonb_agg(mp.player_id order by mp.player_slot),jsonb_agg(jsonb_build_object(
        'playerId',mp.player_id,'slot',mp.player_slot,'tournamentHandicap',e.tournament_handicap::text,
        'courseHandicap',mp.course_handicap::text) order by mp.player_slot)
      into ids,partners from scoring_authority.match_participants mp
      left join scoring_authority.handicap_revision_entries e on e.revision_id=s.handicap_revision_id
        and e.tournament_id=target and e.player_id=mp.player_id
      where mp.match_id=m.match_id and mp.team_side=side and (m.format='SC' or mp.player_id=p.player_id);
      if m.format='SC' then
        -- Exact established 058 boundary: full numeric partner CH, sum first,
        -- one PostgreSQL numeric half-away-from-zero round. NO opponent offset.
        select round(min(course_handicap)*0.35+max(course_handicap)*0.15,0) into ch
          from scoring_authority.match_participants where match_id=m.match_id and team_side=side;
        slot:=0; entity_id:=m.match_id||':S'||side;
      else ch:=p.course_handicap; slot:=p.player_slot-1; entity_id:=p.player_id;
      end if;
      allocation:=case when not authority_ok then null when m.format='SC' then ch::integer
        else round(ch,0)::integer end;
      cells:='[]';
      for h in select mh.hole_number,mh.par,mh.stroke_index,hs.team_1_gross_scores,hs.team_2_gross_scores
        from scoring_authority.match_holes mh left join scoring_authority.hole_scores hs
          on hs.match_id=mh.match_id and hs.hole_number=mh.hole_number
        where mh.match_id=m.match_id order by mh.hole_number loop
        gross:=nullif((case side when 1 then h.team_1_gross_scores else h.team_2_gross_scores end)->>slot,'')::numeric;
        -- Signed 18-hole cycles: positive SI 1 upward, negative SI 18 downward.
        applied:=case when allocation is null then null else sign(allocation)::integer*(abs(allocation)/18+
          case when (allocation>0 and h.stroke_index<=abs(allocation)%18)
            or (allocation<0 and h.stroke_index>18-abs(allocation)%18) then 1 else 0 end) end;
        cells:=cells||jsonb_build_array(jsonb_build_object('hole',h.hole_number,'par',h.par,
          'strokeIndex',h.stroke_index,'gross',gross,'fullCourseHandicapStrokes',applied,'fullNet',gross-applied));
      end loop;
      complete:=authority_ok and jsonb_array_length(cells)=18 and not exists(
        select 1 from jsonb_array_elements(cells) c where c->>'gross' is null or c->>'fullNet' is null);
      entries:=entries||jsonb_build_array(jsonb_build_object('entityId',entity_id,'playerIds',ids,
        'teamSide',side,'scope',case m.format when 'SC' then 'TEAM' else 'PLAYER' end,
        'partners',partners,'courseHandicap',case when authority_ok and m.format<>'SC' then ch::text end,
        'teamCourseHandicap',case when authority_ok and m.format='SC' then ch::text end,
        'fullCourseHandicapStrokes',allocation,'holes',cells,'complete',complete,
        'totalGross',case when complete then (select sum((c->>'gross')::numeric) from jsonb_array_elements(cells)c) end,
        'totalFullNet',case when complete then (select sum((c->>'fullNet')::numeric) from jsonb_array_elements(cells)c) end));
    end loop;
  end loop;
  return jsonb_build_object('policy','production-full-course-handicap-v1','tournamentId',target,
    'matchId',m.match_id,'roundNumber',m.round_number,'format',m.format,'authorityAvailable',authority_ok,
    'lifecycle',case when m.status='UPCOMING' then 'UNSTARTED_REFRESHABLE' else 'FROZEN' end,
    'official',m.status='FINAL' and m.scorecard_complete,'snapshotId',s.snapshot_id,'snapshotHash',s.canonical_hash,
    'handicapRevisionId',s.handicap_revision_id,'handicapRevisionFingerprint',r.canonical_fingerprint,
    'courseId',s.course_id,'tee',s.tee,'slope',s.slope,'rating',s.rating,'par',s.par,'entries',entries);
end;
$$;
revoke all on function production_control.full_net_match_v1(text,text) from public,anon,authenticated,service_role;

create function production_control.full_net_tournament_v1(target text, selected_rounds integer[] default null)
returns jsonb language sql stable security definer set search_path=pg_catalog as $$
  select jsonb_build_object('policy','production-full-course-handicap-v1','tournamentId',target,'matches',
    coalesce(jsonb_agg(production_control.full_net_match_v1(target,m.match_id)
      order by m.round_number,m.match_id),'[]')) from scoring_authority.matches m
    where m.tournament_id=target and m.format in('BB','SC','SI')
      and (selected_rounds is null or m.round_number=any(selected_rounds));
$$;
revoke all on function production_control.full_net_tournament_v1(text,integer[]) from public,anon,authenticated,service_role;

-- Persisted 098 entries, bound into the existing immutable
-- configuration manifest + request fingerprint. No client consent or roster fallback.
create function production_control.full_net_skins_manifest_v2(target text, selected_rounds integer[], entry_revisions jsonb)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare rr record; opt jsonb; mp record; ids jsonb; side integer; entries jsonb; rounds jsonb:='[]'; item jsonb;
  seen text[]:='{}'; key text; entry_id text; expected integer; buy_in numeric;
  registry jsonb; saved_round jsonb; opt_ins jsonb:='[]';
begin
  if jsonb_typeof(entry_revisions) is distinct from 'object' or selected_rounds is null
    or cardinality(selected_rounds)=0 or cardinality(selected_rounds)<>(select count(distinct v) from unnest(selected_rounds)v)
    or (select count(*) from scoring_authority.rounds where tournament_id=target and round_number=any(selected_rounds)
      and format in('BB','SC','SI'))<>cardinality(selected_rounds)
  then raise exception 'FULL_NET_EXPLICIT_OPT_INS_REQUIRED'; end if;
  registry:=production_control.net_skins_entries_projection_v1(target);
  if (select count(*) from jsonb_object_keys(entry_revisions))<>cardinality(selected_rounds)
    then raise exception 'FULL_NET_ENTRY_REVISION_REQUIRED'; end if;
  for saved_round in select value from jsonb_array_elements(registry->'rounds')
    where (value->>'roundNumber')::integer=any(selected_rounds) loop
    if saved_round->>'configured' is distinct from 'true' or saved_round->>'state'<>'ENTRIES_SAVED'
      or (saved_round->>'enteredCount')::integer=0
      or entry_revisions->(saved_round->>'roundNumber') is distinct from saved_round->'revision'
      then raise exception 'FULL_NET_ENTRY_REVISION_STALE_OR_UNAVAILABLE'; end if;
    for item in select value from jsonb_array_elements(saved_round->'entrants') where value->>'entered'='true' loop
      opt_ins:=opt_ins||jsonb_build_array(jsonb_build_object('round_number',saved_round->'roundNumber',
        'match_id',item->>'matchId','player_ids',item->'playerIds','entry_revision',saved_round->'revision',
        'entry_key',item->>'key','binding_fingerprint',item->>'bindingFingerprint'));
    end loop;
  end loop;
  if exists(select 1 from jsonb_array_elements(opt_ins) o where (o->>'round_number')::integer is null
    or not (o->>'round_number')::integer=any(selected_rounds)) then raise exception 'FULL_NET_OPT_IN_ROUND_INVALID'; end if;
  for rr in select * from scoring_authority.rounds where tournament_id=target and round_number=any(selected_rounds) order by round_number loop
    entries:='[]'; buy_in:=case rr.format when 'SC' then 50 else 25 end;
    for opt in select value from jsonb_array_elements(opt_ins) order by value->>'match_id',value->'player_ids' loop
      if (opt->>'round_number')::integer<>rr.round_number then continue; end if;
      expected:=case rr.format when 'SC' then 2 else 1 end;
      if jsonb_typeof(opt->'player_ids') is distinct from 'array' or jsonb_array_length(opt->'player_ids')<>expected
        or not exists(select 1 from scoring_authority.matches where tournament_id=target and round_number=rr.round_number
          and match_id=opt->>'match_id' and format=rr.format) then raise exception 'FULL_NET_OPT_IN_BINDING_INVALID'; end if;
      select min(p.team_side) into side from scoring_authority.match_participants p where p.match_id=opt->>'match_id'
        and p.player_id in(select jsonb_array_elements_text(opt->'player_ids'));
      select jsonb_agg(p.player_id order by p.player_slot) into ids from scoring_authority.match_participants p
        join scoring_authority.tournament_players tp on tp.tournament_id=target and tp.player_id=p.player_id
        where p.match_id=opt->>'match_id' and p.team_side=side and tp.participation_status='ACTIVE'
          and (rr.format='SC' or p.player_id=opt#>>'{player_ids,0}');
      if ids is null or jsonb_array_length(ids)<>expected or not ids @> (opt->'player_ids')
        or not (opt->'player_ids') @> ids then raise exception 'FULL_NET_OPT_IN_BINDING_INVALID'; end if;
      for key in select rr.round_number||':'||value from jsonb_array_elements_text(ids) loop
        if key=any(seen) then raise exception 'FULL_NET_DUPLICATE_OPT_IN'; end if; seen:=array_append(seen,key);
      end loop;
      entry_id:=target||':R'||rr.round_number||case rr.format when 'SC' then ':PAIRING:'|| (opt->>'match_id')||':S'||side else ':PLAYER:'||(ids->>0) end;
      entries:=entries||jsonb_build_array(jsonb_build_object('entry_id',entry_id,'entry_type',case rr.format when 'SC' then 'PAIRING' else 'INDIVIDUAL' end,
        'match_id',opt->>'match_id','match_number',coalesce((select nullif(display_match_number,'') from scoring_authority.game_center_presentations
          where tournament_id=target and match_id=opt->>'match_id'),opt->>'match_id'),
        'player_ids',ids,'player_id_1',ids->>0,'player_id_2',ids->>1,'team_handicap',null,
        'individual_stroke_allocation',null,'buy_in',buy_in,'eligible',true,'eligibility_authority','DIRECTOR_EXPLICIT_ROUND_ENTRY_V1',
        'entry_revision',opt->'entry_revision','entry_key',opt->>'entry_key','binding_fingerprint',opt->>'binding_fingerprint'));
    end loop;
    item:=jsonb_build_object('round_id',target||':R'||rr.round_number,'round_number',rr.round_number,'round_name',rr.name,'format',rr.format,
      'entry_type',case rr.format when 'SC' then 'PAIRING' else 'INDIVIDUAL' end,'buy_in_per_entry',buy_in,
      'expected_pot',jsonb_array_length(entries)*buy_in,'eligible_holes',(select jsonb_agg(v) from generate_series(1,18)v),
      'net_handicap_basis','production-full-course-handicap-v1','eligibility_authority','DIRECTOR_EXPLICIT_ROUND_ENTRY_V1','entry_revision',entry_revisions->rr.round_number::text,
      'completion_rule','ALL_ELIGIBLE_ENTRIES_18_HOLES_AND_REFERENCED_MATCHES_OFFICIAL','payout_rounding','NONE',
      'tie_rule','NO_SKIN_NO_CARRY','carry_rule','NO_CARRY','publication_policy','OFFICIAL_ONLY',
      'match_ids',(select coalesce(jsonb_agg(v order by v),'[]') from(select distinct e->>'match_id' v from jsonb_array_elements(entries)e)s),
      'entries',entries);
    rounds:=rounds||jsonb_build_array(item||jsonb_build_object('configuration_fingerprint',production_control.net_skins_v1_hash(item)));
  end loop;
  return jsonb_build_object('contract_version','production-net-skins-v1','tournament_id',target,
    'calculation_policy','production-full-course-handicap-v1','entry_revisions',entry_revisions,'publication_policy','OFFICIAL_ONLY','rounds',rounds);
end;
$$;
revoke all on function production_control.full_net_skins_manifest_v2(text,integer[],jsonb) from public,anon,authenticated,service_role;

-- Fingerprint the exact shared authority. Old result identities remain intact;
-- a different calculation policy must never make an old result silently fresh.
alter function production_control.calcutta_v1_source_revision(text) rename to calcutta_source_before_full_net_v3;
create function production_control.calcutta_v1_source_revision(target_tournament_id text)
returns jsonb language sql stable security definer set search_path=pg_catalog as $$
  select production_control.calcutta_source_before_full_net_v3(target_tournament_id)||jsonb_build_object(
    'calculation_policy','production-full-course-handicap-v1','full_net_authority',production_control.full_net_tournament_v1(
      target_tournament_id,production_control.calcutta_v1_completed_rounds(target_tournament_id)));
$$;
alter function production_control.net_skins_v1_round_source_revision(text,integer) rename to skins_source_before_full_net_v2;
create function production_control.net_skins_v1_round_source_revision(target_tournament_id text,target_round_number integer)
returns jsonb language sql stable security definer set search_path=pg_catalog as $$
  select production_control.skins_source_before_full_net_v2(target_tournament_id,target_round_number)||jsonb_build_object(
    'calculation_policy','production-full-course-handicap-v1','full_net_authority',production_control.full_net_tournament_v1(target_tournament_id,array[target_round_number]),
    'explicit_entry_authority',(select value from jsonb_array_elements(production_control.net_skins_entries_projection_v1(target_tournament_id)->'rounds') where (value->>'roundNumber')::integer=target_round_number));
$$;
revoke all on function production_control.calcutta_v1_source_revision(text),production_control.net_skins_v1_round_source_revision(text,integer)
  from public,anon,authenticated,service_role;

-- Only certified call sites change. Existing auth/runtime/CAS/lease/history/
-- completion/publication and configuration audit logic remains in place.
do $bindings$
declare signature text; definition text; needle text; replacement text; i integer;
  signatures text[]:=array[
    'public.configure_production_net_skins_v1(jsonb)',
    'public.future_production_configure_net_skins_v1(jsonb)',
    'public.claim_production_net_skins_v1_recalculation(jsonb)',
    'public.future_production_claim_net_skins_recalculation_v1(jsonb)',
    'public.claim_production_calcutta_v1_recalculation(jsonb)',
    'public.future_production_claim_calcutta_recalculation_v1(jsonb)'];
begin
  for i in 1..array_length(signatures,1) loop
    signature:=signatures[i]; definition:=pg_get_functiondef(to_regprocedure(signature));
    if i=1 then
      needle:='production_control.build_production_net_skins_v1_manifest(selected_rounds)';
      replacement:='production_control.full_net_skins_manifest_v2(''2026'',selected_rounds,input->''entry_revisions'')';
    elsif i=2 then
      needle:=E'production_control.build_annual_net_skins_v1_manifest(\n    target, selected_rounds\n  )';
      replacement:='production_control.full_net_skins_manifest_v2(target,selected_rounds,input->''entry_revisions'')';
    elsif i in(3,4) then
      needle:=case i when 3 then 'calculation_input := public.read_net_skins_input_view(''2026'');' else 'calculation_input := public.read_net_skins_input_view(target);' end;
      replacement:=needle||E'\n  calculation_input := jsonb_set(calculation_input,''{data,full_net_authority}'',production_control.full_net_tournament_v1('||case i when 3 then '''2026''' else 'target' end||'));';
    else
      needle:=case i when 5 then 'core_view := public.read_leaderboards_core_view(''2026'');' else 'core_view := public.read_leaderboards_core_view(target);' end;
      replacement:=needle||E'\n  core_view := jsonb_set(core_view,''{data,full_net_authority}'',production_control.full_net_tournament_v1('||case i when 5 then '''2026''' else 'target' end||'));';
    end if;
    if definition is null or (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then
      raise exception 'RELEASE_B_CALL_SITE_DRIFT: %',signature; end if;
    definition:=replace(definition,needle,replacement);
    if i in(1,2) then
      -- Same lock order as 098 / Director. Classification and configuration are
      -- serialized with pairing writes and entry revisions, before row locks.
      needle:=case i when 1 then 'perform production_control.assert_production_net_skins_v1_runtime(input);'
        else E'perform production_control.assert_future_production_scoring_actor_v1(\n    input, target, true\n  );' end;
      if position(needle in definition)=0 then raise exception 'RELEASE_B_CONFIG_LOCK_DRIFT: %',signature; end if;
      definition:=replace(definition,needle,needle||E'\n  perform pg_advisory_xact_lock(hashtextextended(''production-tournament-setup-v1:''||'||case i when 1 then '''2026''' else 'target' end||',0));');
      needle:='''Individual Stroke Allocation'',';
      if position(needle in definition)=0 then raise exception 'RELEASE_B_ENTRY_PROVENANCE_DRIFT: %',signature; end if;
      definition:=replace(definition,needle,'''Entry Revision'',entry_value->''entry_revision'','||
        '''Entry Key'',entry_value->>''entry_key'','||'''Entry Binding Fingerprint'',entry_value->>''binding_fingerprint'','||needle);
    elsif i in(3,4) then
      definition:=replace(definition,replacement,replacement||E'\n  calculation_input := jsonb_set(calculation_input,''{data,net_skins_entry_authority}'',production_control.net_skins_entries_projection_v1('||case i when 3 then '''2026''' else 'target' end||'));');
    end if;
    execute definition;
  end loop;
end;
$bindings$;

alter table scoring_authority.net_skins_v1_result_revisions drop constraint net_skins_v1_result_revisions_engine_version_check;
alter table scoring_authority.net_skins_v1_result_revisions add constraint net_skins_v1_result_revisions_engine_version_check
  check(engine_version in('net-skins-js-v1','net-skins-full-net-v2'));
alter table scoring_authority.calcutta_v1_result_revisions drop constraint calcutta_v1_result_revisions_engine_version_check;
alter table scoring_authority.calcutta_v1_result_revisions add constraint calcutta_v1_result_revisions_engine_version_check
  check(engine_version in('calcutta-js-v1','calcutta-js-v2','calcutta-full-net-v3'));
do $versions$
declare sig text; body text; old text; new text;
begin
  foreach sig in array array['public.complete_production_net_skins_v1_recalculation(jsonb)',
    'public.future_production_complete_net_skins_recalculation_v1(jsonb)',
    'public.complete_production_calcutta_v1_recalculation(jsonb)','public.future_production_complete_calcutta_recalculation_v1(jsonb)'] loop
    old:=case when sig like '%net_skins%' then 'net-skins-js-v1' else 'calcutta-js-v2' end;
    new:=case when sig like '%net_skins%' then 'net-skins-full-net-v2' else 'calcutta-full-net-v3' end;
    body:=pg_get_functiondef(to_regprocedure(sig));
    if body is null or (length(body)-length(replace(body,old,'')))/length(old)<>2 then raise exception 'RELEASE_B_ENGINE_DRIFT: %',sig; end if;
    execute replace(body,old,new);
  end loop;
end;
$versions$;
commit;
