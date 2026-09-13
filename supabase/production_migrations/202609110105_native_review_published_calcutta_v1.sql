-- Shared published Calcutta projection; explicit participant OR observer authorization.
-- No financial calculation, persisted result or publication rule changes.
begin;
create function production_control.native_calcutta_reader_v1(player text,target text,observer uuid)
returns boolean language plpgsql stable security definer set search_path=pg_catalog as $$
begin
 if observer is not null then
   if nullif(btrim(player),'') is not null then return false; end if;
   return public.read_native_review_context_v1(observer,target)->>'ok'='true';
 end if;
 return nullif(btrim(player),'') is not null and exists(select 1 from scoring_authority.tournament_players m
  where m.tournament_id=target and m.player_id=player and m.participation_status='ACTIVE');
end;
$$;
revoke all on function production_control.native_calcutta_reader_v1(text,text,uuid) from public,anon,authenticated,service_role;
do $$
declare definition text; original text; start_at integer; end_at integer; prefix text;
begin
 definition:=pg_get_functiondef('public.read_production_calcutta_frozen_2026_v1(jsonb)'::regprocedure);
 start_at:=strpos(definition,'     or participant_player =');
 end_at:=strpos(definition,' then'||chr(10)||'    raise exception using errcode = ''42501'',');
 if start_at=0 or end_at<=start_at then raise exception 'FROZEN_CALCUTTA_READER_BOUNDARY_CHANGED'; end if;
 definition:=left(definition,start_at-1)||'     or not production_control.native_calcutta_reader_v1(participant_player,''2026'',nullif(input->>''observer_auth_user_id'','''')::uuid)'||substr(definition,end_at);
 execute definition;
 definition:=pg_get_functiondef('production_control.read_annual_calcutta_v1(text,text)'::regprocedure);
 definition:=replace(definition,'read_annual_calcutta_v1(target text, participant_player text)','read_annual_calcutta_v1(target text, participant_player text, observer_auth uuid)');
 start_at:=strpos(definition,'  if participant_player =');
 end_at:=strpos(definition,' then'||chr(10)||'    raise exception using errcode = ''42501'',');
 if start_at=0 or end_at<=start_at then raise exception 'ANNUAL_CALCUTTA_READER_BOUNDARY_CHANGED'; end if;
 definition:=left(definition,start_at-1)||'  if not production_control.native_calcutta_reader_v1(participant_player,target,observer_auth)'||substr(definition,end_at);
 execute definition;
 -- The original participant signature delegates to that same projection with no observer.
 execute 'create or replace function production_control.read_annual_calcutta_v1(target text,participant_player text) returns jsonb language sql stable security definer set search_path=pg_catalog as ''select production_control.read_annual_calcutta_v1(target,participant_player,null::uuid)''';
 definition:=pg_get_functiondef('public.read_production_future_current_view_v1(jsonb)'::regprocedure);
 original:='target, pg_catalog.btrim(coalesce(input->>''player_id'', ''''))';
 if strpos(definition,original)=0 then raise exception 'ANNUAL_CALCUTTA_DISPATCH_BOUNDARY_CHANGED'; end if;
 execute replace(definition,original,original||', nullif(input->>''observer_auth_user_id'','''')::uuid');
end;
$$;
revoke all on function production_control.read_annual_calcutta_v1(text,text,uuid) from public,anon,authenticated,service_role;
-- Bind the additive read authorization/projection helpers into the existing
-- implementation fingerprint. Later activation must recertify this exact code.
do $$
declare definition text; original text;
begin
 definition:=pg_get_functiondef('production_control.annual_side_game_implementation_manifest_pre_triggers_v1()'::regprocedure);
 original:='''production_control.read_annual_calcutta_v1(text,text)''';
 if strpos(definition,original)=0 then raise exception 'CALCUTTA_MANIFEST_BOUNDARY_CHANGED'; end if;
 execute replace(definition,original,original||', '||
  quote_literal('production_control.read_annual_calcutta_v1(text,text,uuid)')||', '||
  quote_literal('production_control.native_calcutta_reader_v1(text,text,uuid)')||', '||
  quote_literal('public.read_native_review_context_v1(uuid,text)'));
end;
$$;
commit;
