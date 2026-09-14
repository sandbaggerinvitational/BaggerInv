-- LOCAL CERTIFICATION CANDIDATE ONLY. No production installation authorization
-- is implied by this file. No existing user/competition rows change on install.
begin;
create table participant_identity.deletion_attribution_columns_v1 (
  relation_id oid not null, column_name name not null,
  primary key (relation_id,column_name)
);
create unlogged table participant_identity.deletion_attribution_capability_v1 (
  transaction_id bigint not null, backend_pid integer not null,
  source_id uuid not null, replacement_id uuid not null,
  player_ids text[] not null default '{}',
  primary key(transaction_id,backend_pid), check(source_id <> replacement_id)
);
alter table participant_identity.deletion_attribution_columns_v1 enable row level security;
alter table participant_identity.deletion_attribution_capability_v1 enable row level security;
revoke all on participant_identity.deletion_attribution_columns_v1,
 participant_identity.deletion_attribution_capability_v1 from public,anon,authenticated,service_role;

-- Freeze the currently installed registry-FK inventory. New/unknown bindings
-- subsequently fail deletion rather than silently expanding redaction scope.
do $$ declare bad integer; begin
 select count(*) into bad from pg_constraint k join pg_class c on c.oid=k.conrelid
 join pg_namespace n on n.oid=c.relnamespace
 left join pg_attribute a on a.attrelid=c.oid and a.attnum=k.conkey[1]
 where k.contype='f' and k.confrelid='participant_identity.historical_authorship_v1'::regclass
 and (cardinality(k.conkey)<>1 or n.nspname not in ('participant_identity','production_control','scoring_authority')
 or not (a.attname='actor_auth_user_id' or a.attname like '%\_by\_auth\_user\_id' escape '\'));
 if bad <> 0 then raise exception 'ACCOUNT_DELETION_UNKNOWN_ATTRIBUTION'; end if;
 insert into participant_identity.deletion_attribution_columns_v1
 select distinct c.oid,a.attname from pg_constraint k join pg_class c on c.oid=k.conrelid
 join pg_attribute a on a.attrelid=c.oid and a.attnum=k.conkey[1]
 where k.contype='f' and k.confrelid='participant_identity.historical_authorship_v1'::regclass;
end $$;

create function participant_identity.is_deletion_attribution_update_v1(rel oid, prior jsonb, proposed jsonb)
returns boolean language plpgsql security definer set search_path=pg_catalog as $$
declare cap participant_identity.deletion_attribution_capability_v1%rowtype;
declare cols text[]; excluded text[]; col text; changed boolean := false;
begin
 select * into cap from participant_identity.deletion_attribution_capability_v1
 where transaction_id=txid_current() and backend_pid=pg_backend_pid();
 if not found then return false; end if;
 select array_agg(column_name::text order by column_name) into cols
 from participant_identity.deletion_attribution_columns_v1 where relation_id=rel;
 if cols is null then return false; end if;
 excluded := cols;
 -- This receipt records the subject Player, not necessarily the Director who
 -- entered the mapping. Never erase another Player's GHIN based on actor alone.
 if rel=to_regclass('production_control.handicap_source_operation_receipts_v1')
    and prior->'response' is distinct from proposed->'response' then
   if not coalesce((prior->'response'->>'playerId')=any(cap.player_ids),false)
      or not (prior->'response' ? 'maskedGhinNumber')
      or ((prior->'response')-'maskedGhinNumber') is distinct from (proposed->'response') then
     return false;
   end if;
   excluded := excluded || 'response'::text;
   changed := true;
 end if;
 if (prior-excluded) is distinct from (proposed-excluded) then return false; end if;
 foreach col in array cols loop
   if (prior->col) is distinct from (proposed->col) then
     if prior->>col is distinct from cap.source_id::text or
        proposed->>col is distinct from cap.replacement_id::text then return false; end if;
     changed := true;
   end if;
 end loop;
 return changed;
end $$;
revoke all on function participant_identity.is_deletion_attribution_update_v1(oid,jsonb,jsonb)
 from public,anon,authenticated,service_role;

-- Existing immutability is retained for every other operation. Besides simple
-- unconditional guards, admit only the two exact deployed guard bodies audited
-- on 2026-09-14. A different installed body fails closed at installation.
do $$ declare r record; definition text; begin
 for r in select distinct p.oid,p.proname,p.prosrc
 from pg_trigger t join pg_proc p on p.oid=t.tgfoid
 join pg_namespace n on n.oid=p.pronamespace
 where t.tgrelid in (select relation_id from participant_identity.deletion_attribution_columns_v1)
 and not t.tgisinternal and (t.tgtype & 16)=16 and (t.tgtype & 2)=2
 and (p.proname like 'reject%immutable%' or (n.nspname='production_control' and
      p.proname in ('guard_odds_snapshot_immutability','net_skins_entry_history_immutable_v1')))
 and n.nspname in ('participant_identity','production_control','scoring_authority')
 loop
   if r.proname='guard_odds_snapshot_immutability' then
     if md5(r.prosrc)<>'e222be73254a1617182d6ec83a55cc18' then
       raise exception 'ACCOUNT_DELETION_ODDS_GUARD_CHANGED';
     end if;
   elsif r.proname='net_skins_entry_history_immutable_v1' then
     if md5(r.prosrc)<>'e0ba9c5bd8f4aa8c74835559350ded4f' then
       raise exception 'ACCOUNT_DELETION_SKINS_GUARD_CHANGED';
     end if;
   elsif r.prosrc !~* '^\s*begin\s+raise\s' then
     raise exception 'ACCOUNT_DELETION_UNRECOGNIZED_IMMUTABLE_GUARD: %',r.proname;
   end if;
   definition := pg_get_functiondef(r.oid);
   definition := replace(definition,r.prosrc,regexp_replace(r.prosrc,'\mbegin\M',
    'begin
 if tg_op = ''UPDATE'' and participant_identity.is_deletion_attribution_update_v1(tg_relid,to_jsonb(old),to_jsonb(new)) then return new; end if;', 'i'));
   -- The helper is private; a guard that formerly ran as invoker must now run
   -- with its owner only to inspect the narrowly scoped transaction capability.
   execute definition;
   execute format('alter function %s security definer',r.oid::regprocedure);
   execute format('alter function %s set search_path=pg_catalog',r.oid::regprocedure);
 end loop;
end $$;

create or replace function participant_identity.require_live_authorship_v1()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare subject uuid;
begin
 subject := (to_jsonb(new)->>tg_argv[0])::uuid;
 if subject is null then return new; end if;
 if tg_op='UPDATE' then
   if subject=(to_jsonb(old)->>tg_argv[0])::uuid then return new; end if;
   if participant_identity.is_deletion_attribution_update_v1(tg_relid,to_jsonb(old),to_jsonb(new)) then return new; end if;
 end if;
 perform 1 from auth.users where id=subject for key share;
 if not found then raise exception using errcode='23503',message='LIVE_AUTHOR_AUTH_REQUIRED'; end if;
 insert into participant_identity.historical_authorship_v1 values(subject) on conflict do nothing;
 return new;
end $$;
revoke all on function participant_identity.require_live_authorship_v1() from public,anon,authenticated,service_role;

create function participant_identity.check_deletion_attribution_final_v1()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
 if exists(select 1 from participant_identity.deletion_attribution_capability_v1
 where transaction_id=txid_current() and backend_pid=pg_backend_pid()) and
 not participant_identity.is_deletion_attribution_update_v1(tg_relid,to_jsonb(old),to_jsonb(new)) then
   raise exception 'ACCOUNT_DELETION_NONATTRIBUTION_CHANGE';
 end if;
 return new;
end $$;
revoke all on function participant_identity.check_deletion_attribution_final_v1() from public,anon,authenticated,service_role;
do $$ declare r record; begin
 for r in select distinct relation_id from participant_identity.deletion_attribution_columns_v1 loop
   execute format('create trigger bagger_deletion_attribution_final_v1 after update on %s for each row execute function participant_identity.check_deletion_attribution_final_v1()',r.relation_id::regclass);
 end loop;
end $$;

create function participant_identity.minimize_requested_deletion_attribution_v1()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare r record; replacement uuid := gen_random_uuid();
declare has_rows boolean := false; row_found boolean;
declare linked_players text[];
begin
 if tg_op<>'DELETE' or tg_relid<>'auth.users'::regclass then
   raise exception 'ACCOUNT_DELETION_TRIGGER_SCOPE_REQUIRED';
 end if;
 perform 1 from participant_identity.account_deletion_requests_v1 where auth_user_id=old.id for update;
 if not found then return old; end if;
 perform participant_identity.lock_deletion_governance_v1();
 if participant_identity.account_deletion_status_v1(old.id)<>'READY' then
   raise exception 'ACCOUNT_DELETION_PROTECTED';
 end if;
 select coalesce(array_agg(distinct player_id),'{}') into linked_players
 from participant_identity.user_player_links where auth_user_id=old.id;
 for r in select * from participant_identity.deletion_attribution_columns_v1 order by relation_id,column_name loop
   execute format('select exists(select 1 from %s where %I=$1)',r.relation_id::regclass,r.column_name)
   into row_found using old.id;
   has_rows := has_rows or row_found;
 end loop;
 -- A capability is also needed for receipts entered by a different Director.
 -- Only create a replacement registry token if actual actor references exist.
 if has_rows then insert into participant_identity.historical_authorship_v1 values(replacement); end if;
 insert into participant_identity.deletion_attribution_capability_v1
 values(txid_current(),pg_backend_pid(),old.id,replacement,linked_players);
 for r in select * from participant_identity.deletion_attribution_columns_v1 order by relation_id,column_name loop
   execute format('update %s set %I=$1 where %I=$2',r.relation_id::regclass,r.column_name,r.column_name)
   using replacement,old.id;
 end loop;
 if to_regclass('production_control.handicap_source_operation_receipts_v1') is not null then
   update production_control.handicap_source_operation_receipts_v1
   set response=response-'maskedGhinNumber'
   where response->>'playerId'=any(linked_players) and response ? 'maskedGhinNumber';
 end if;
 -- A new registry binding not present in the frozen inventory blocks this FK
 -- delete and rolls back every earlier replacement and the Auth deletion.
 delete from participant_identity.historical_authorship_v1 where subject_id=old.id;
 delete from participant_identity.deletion_attribution_capability_v1
 where transaction_id=txid_current() and backend_pid=pg_backend_pid();
 return old;
end $$;
revoke all on function participant_identity.minimize_requested_deletion_attribution_v1() from public,anon,authenticated,service_role;
create trigger bagger_aa_minimize_deletion_attribution_v1 before delete on auth.users
 for each row execute function participant_identity.minimize_requested_deletion_attribution_v1();
commit;
