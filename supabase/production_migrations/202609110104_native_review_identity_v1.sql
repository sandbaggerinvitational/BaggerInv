-- Local-only explicit non-competing identity. No reviewer accounts or grants created.
begin;
create function participant_identity.advance_review_access_revision_v1()
returns trigger language plpgsql set search_path=pg_catalog as $$
begin
 if new.auth_user_id is distinct from old.auth_user_id then
   raise exception 'REVIEW_IDENTITY_IMMUTABLE';
 end if;
 new.revision:=old.revision+1;
 return new;
end;
$$;
create trigger review_access_revision_v1 before update on participant_identity.review_access_v1
for each row execute function participant_identity.advance_review_access_revision_v1();

create function public.read_native_review_context_v1(target_auth_user_id uuid,target_tournament_id text)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare result jsonb;
begin
 if coalesce(current_setting('request.jwt.claim.role',true),'') <> 'service_role' then
   raise exception using errcode='42501',message='SERVICE_AUTHORITY_REQUIRED';
 end if;
 select jsonb_build_object('kind','observer','authUserId',r.auth_user_id,'active',true,
   'contextRevision',r.revision,'expiresAt',r.expires_at,'finalMatchId',r.final_match_id,
   'finalMatchStatus',m.status,'scorecardComplete',m.scorecard_complete,'admin',false,'scoring',false,
   'tournament',jsonb_build_object('id',t.tournament_id,'name',t.name,'year',t.tournament_year)) into result
 from participant_identity.review_access_v1 r
 join auth.users u on u.id=r.auth_user_id and u.email_confirmed_at is not null and nullif(btrim(u.email),'') is not null
 join scoring_authority.tournaments t on t.tournament_id=r.tournament_id
 join scoring_authority.matches m on m.match_id=r.final_match_id and m.tournament_id=r.tournament_id
 where r.auth_user_id=target_auth_user_id and r.tournament_id=target_tournament_id
 and r.active and r.expires_at>now() and m.status='FINAL' and m.scorecard_complete
 and not exists(select 1 from participant_identity.user_player_links l where l.auth_user_id=r.auth_user_id)
 and not exists(select 1 from participant_identity.tournament_roles a where a.auth_user_id=r.auth_user_id)
 and not exists(select 1 from production_control.director_entitlements a where a.auth_user_id=r.auth_user_id and a.status='ACTIVE')
 and not exists(select 1 from production_control.tournament_owner_capabilities_v1 a where a.auth_user_id=r.auth_user_id and a.status='ACTIVE');
 if result is null then return jsonb_build_object('ok',false,'code','REVIEW_ACCESS_UNAVAILABLE'); end if;
 return jsonb_build_object('ok',true,'data',result);
end;
$$;
revoke all on function participant_identity.advance_review_access_revision_v1() from public,anon,authenticated,service_role;
revoke all on function public.read_native_review_context_v1(uuid,text) from public,anon,authenticated;
grant execute on function public.read_native_review_context_v1(uuid,text) to service_role;

create table participant_identity.native_review_otp_bindings_v1 (
 request_id uuid primary key references participant_identity.participant_auth_otp_attempts(request_id) on delete cascade,
 auth_user_id uuid not null references auth.users(id) on delete cascade,
 entitlement_revision bigint not null check(entitlement_revision>0)
);
alter table participant_identity.native_review_otp_bindings_v1 enable row level security;
revoke all on participant_identity.native_review_otp_bindings_v1 from public,anon,authenticated,service_role;

create function public.native_review_otp_v1(operation text,input jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare actor uuid; target text; ctx jsonb; attempt participant_identity.participant_auth_otp_attempts%rowtype;
 request uuid; email_hash text; client_hash text; normalized text; revision bigint;
begin
 if coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role' then
   raise exception using errcode='42501',message='SERVICE_AUTHORITY_REQUIRED'; end if;
 if operation='request' then
   normalized:=lower(btrim(input->>'email')); client_hash:=input->>'client_request_hash';
   if client_hash !~ '^[0-9a-f]{64}$' or normalized is null then raise exception 'INVALID_REVIEW_REQUEST'; end if;
   select r.auth_user_id,r.tournament_id into actor,target from participant_identity.review_access_v1 r
    join auth.users u on u.id=r.auth_user_id where lower(btrim(u.email))=normalized;
   if actor is null then return jsonb_build_object('handled',false); end if;
   ctx:=public.read_native_review_context_v1(actor,target);
   if ctx->>'ok' is distinct from 'true' then return jsonb_build_object('handled',true,'allowed',false); end if;
   email_hash:=encode(extensions.digest(normalized,'sha256'),'hex');
   perform pg_advisory_xact_lock(hashtextextended(least('client:'||client_hash,'email:'||email_hash),0));
   perform pg_advisory_xact_lock(hashtextextended(greatest('client:'||client_hash,'email:'||email_hash),0));
   if (select count(*) from participant_identity.participant_auth_otp_attempts where client_request_hash=client_hash and requested_at>now()-interval '15 minutes')>=5
    or (select count(*) from participant_identity.participant_auth_otp_attempts where email_identity_hash=email_hash and requested_at>now()-interval '15 minutes')>=3
    or exists(select 1 from participant_identity.participant_auth_otp_attempts where auth_user_id=actor and requested_at>now()-interval '60 seconds' and status in('AUTHORIZED','SENT')) then
    return jsonb_build_object('handled',true,'allowed',false); end if;
   request:=extensions.gen_random_uuid();
   insert into participant_identity.participant_auth_otp_attempts(request_id,tournament_id,auth_user_id,email_identity_hash,client_request_hash,status,safe_reason,verification_type)
    values(request,target,actor,email_hash,client_hash,'AUTHORIZED','APPROVED','email');
   insert into participant_identity.native_review_otp_bindings_v1 values(request,actor,(ctx#>>'{data,contextRevision}')::bigint);
   return jsonb_build_object('handled',true,'allowed',true,'requestId',request,'authUserId',actor,'tournamentId',target,'email',normalized,'verificationType','email','context',ctx->'data');
 end if;
 request:=(input->>'request_id')::uuid;
 select a.* into attempt from participant_identity.participant_auth_otp_attempts a
   join participant_identity.native_review_otp_bindings_v1 b on b.request_id=a.request_id
   where a.request_id=request for update of a;
 if not found then return jsonb_build_object('handled',false); end if;
 select entitlement_revision into revision from participant_identity.native_review_otp_bindings_v1 where request_id=request;
 ctx:=public.read_native_review_context_v1(attempt.auth_user_id,attempt.tournament_id);
 if ctx->>'ok' is distinct from 'true' or (ctx#>>'{data,contextRevision}')::bigint<>revision or attempt.requested_at<=now()-interval '15 minutes' then
   return jsonb_build_object('handled',true,'allowed',false); end if;
 if operation='delivery' then
   if attempt.status<>'AUTHORIZED' then return jsonb_build_object('handled',true,'allowed',false); end if;
   update participant_identity.participant_auth_otp_attempts set status=case when input->>'succeeded'='true' then 'SENT' else 'DELIVERY_FAILED' end,
    sent_at=case when input->>'succeeded'='true' then now() else null end,updated_at=now() where request_id=request;
 elsif operation in('verify','complete') then
   if attempt.auth_user_id::text is distinct from input->>'auth_user_id' or attempt.email_identity_hash is distinct from input->>'email_identity_hash'
     or attempt.status not in('SENT','VERIFIED') then return jsonb_build_object('handled',true,'allowed',false); end if;
   if operation='complete' then
    update participant_identity.participant_auth_otp_attempts set status='VERIFIED',verified_at=coalesce(verified_at,now()),updated_at=now() where request_id=request;
   end if;
 else raise exception 'INVALID_REVIEW_OPERATION'; end if;
 return jsonb_build_object('handled',true,'allowed',true,'authUserId',attempt.auth_user_id,'tournamentId',attempt.tournament_id,'context',ctx->'data');
end;
$$;
revoke all on function public.native_review_otp_v1(text,jsonb) from public,anon,authenticated;
grant execute on function public.native_review_otp_v1(text,jsonb) to service_role;
-- A replacement credential must satisfy the same non-competing and completed
-- scorecard prerequisites before it can release sole-reviewer protection.
do $$
declare definition text;
begin
 definition:=pg_get_functiondef('participant_identity.account_deletion_status_v1(uuid)'::regprocedure);
 if strpos(definition,'m.status = ''FINAL''')=0 then raise exception 'REVIEW_DELETION_BOUNDARY_CHANGED'; end if;
 definition:=replace(definition,'m.status = ''FINAL''','m.status = ''FINAL'' and m.scorecard_complete');
 definition:=replace(definition,'and other.active and other.expires_at > clock_timestamp()',
  $replacement$and other.active and other.expires_at > clock_timestamp()
   and nullif(btrim(u.email),'') is not null
   and not exists(select 1 from participant_identity.tournament_roles role_value where role_value.auth_user_id=u.id)
   and not exists(select 1 from production_control.tournament_owner_capabilities_v1 owner_value where owner_value.auth_user_id=u.id and owner_value.status='ACTIVE')$replacement$);
 execute definition;
end;
$$;
commit;
