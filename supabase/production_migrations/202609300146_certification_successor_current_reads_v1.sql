-- CLI scaffold20261002220432; repository ordinal146. Existing public-domain
-- read DTOs at the exact admitted Certification successor, never arbitrary years.
begin;
create temporary table certification_successor_read_originals on commit drop as
 select p.oid,p.proowner,p.proacl,p.prosecdef,p.proconfig,p.provolatile,p.prosrc,
  (select coalesce(jsonb_agg(to_jsonb(d)order by to_jsonb(d)::text),'[]')from pg_depend d
   where d.classid='pg_proc'::regclass and d.objid=p.oid)dependencies
 from pg_proc p where p.oid in('production_control.canonical_current_view_read_v1(jsonb,jsonb)'::regprocedure,
  'public.read_certification_projection_v1(jsonb)'::regprocedure,
  'public.read_leaderboards_core_view(text)'::regprocedure,'public.read_participant_home_view(text,text)'::regprocedure,
  'public.read_my_match_view(text,text)'::regprocedure,'public.read_game_center_view(text)'::regprocedure);

create function production_control.certification_successor_current_read_v1(input jsonb,context jsonb)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare target text:=coalesce(input->>'target_tournament_id',context->>'current_tournament_id');surface text:=input->>'surface';
 player_id_value text:=btrim(coalesce(input->>'player_id',''));match_id_value text:=btrim(coalesce(input->>'match_id',''));
 result_value jsonb;
begin
 perform production_control.assert_certification_current_projection_v1(target,context);
 if target='2026' or jsonb_typeof(input) is distinct from 'object'
  or exists(select 1 from jsonb_object_keys(input)k where k not in('surface','target_tournament_id','player_id','match_id'))
  or (surface not in('PARTICIPANT_HOME','MY_MATCH') and input?'player_id')
  or (surface<>'GAME_CENTER' and input?'match_id') then
  raise exception using errcode='42501',message='CERTIFICATION_READ_TARGET_DENIED';end if;
 case surface
 when 'TOURNAMENT_LIVE' then result_value:=public.read_leaderboards_core_view(target);
 when 'PARTICIPANT_HOME','MY_MATCH' then
  if player_id_value='' then return jsonb_build_object('ok',false,'code','PLAYER_ID_REQUIRED');end if;
  if not exists(select 1 from scoring_authority.tournament_players p
    where p.tournament_id=target and p.player_id=player_id_value)then
   raise exception using errcode='42501',message='CERTIFICATION_READ_PLAYER_DENIED';end if;
  if surface='PARTICIPANT_HOME'then result_value:=public.read_participant_home_view(target,player_id_value);
  else result_value:=public.read_my_match_view(target,player_id_value);end if;
 when 'GAME_CENTER' then
  if match_id_value=''or not exists(select 1 from scoring_authority.matches m
    where m.tournament_id=target and m.match_id=match_id_value)then
   return jsonb_build_object('ok',false,'code','PRODUCTION_MATCH_NOT_FOUND');end if;
  result_value:=public.read_game_center_view(match_id_value);
 else raise exception using errcode='42501',message='CERTIFICATION_FUTURE_READ_OPERATION_DENIED';end case;
 return production_control.mark_certification_read_v1(result_value,context);
end;$$;
revoke all on function production_control.certification_successor_current_read_v1(jsonb,jsonb)
 from public,anon,authenticated,service_role;

do $patch$declare d text;old_clause text:=$old$ if (context->>'current_tournament_year')::integer>2026 then
  perform production_control.assert_current_certification_future_context_v1(context);$old$;
begin
 d:=pg_get_functiondef('public.read_certification_projection_v1(jsonb)'::regprocedure);
 if(length(d)-length(replace(d,old_clause,'')))/length(old_clause)<>1 then
  raise exception 'CERTIFICATION_SUCCESSOR_READ_PREDECESSOR_MISMATCH';end if;
 execute replace(d,old_clause,old_clause||$new$
  if input->>'operation'='READS.CURRENT_VIEW' and payload->>'surface' in('TOURNAMENT_LIVE','PARTICIPANT_HOME','MY_MATCH','GAME_CENTER')then
   result:=production_control.certification_successor_current_read_v1(payload,context);
   perform production_control.pop_certification_context_v1();return result;end if;$new$);
end;$patch$;

do $acl$declare p pg_proc%rowtype;o record;deps jsonb;begin
 for o in select * from certification_successor_read_originals loop
  select * into strict p from pg_proc where oid=o.oid;
  select coalesce(jsonb_agg(to_jsonb(d)order by to_jsonb(d)::text),'[]')into deps from pg_depend d
   where d.classid='pg_proc'::regclass and d.objid=p.oid;
  if p.proowner<>o.proowner or p.proacl is distinct from o.proacl or p.prosecdef<>o.prosecdef
   or p.proconfig is distinct from o.proconfig or p.provolatile<>o.provolatile or deps is distinct from o.dependencies
   or(p.oid<>'public.read_certification_projection_v1(jsonb)'::regprocedure and p.prosrc<>o.prosrc)then
   raise exception 'CERTIFICATION_SUCCESSOR_READ_EXISTING_AUTHORITY_CHANGED';end if;
 end loop;
 select * into strict p from pg_proc where oid='production_control.certification_successor_current_read_v1(jsonb,jsonb)'::regprocedure;
 if p.proowner<>(select oid from pg_roles where rolname=current_user)or not p.prosecdef
  or p.proconfig<>array['search_path=pg_catalog']or exists(
   select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))a
   where a.grantee<>p.proowner and a.privilege_type='EXECUTE')then
  raise exception 'CERTIFICATION_SUCCESSOR_READ_PRIVATE_PRIVILEGE_EXPANSION';end if;
end;$acl$;
commit;
