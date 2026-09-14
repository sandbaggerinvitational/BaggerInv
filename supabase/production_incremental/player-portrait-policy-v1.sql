-- Additive, inert policy installation. No competitive or account row is changed.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
-- Prevent an account deletion from crossing installation without a tombstone.
lock table auth.users, participant_identity.account_deletion_requests_v1
 in share row exclusive mode;
do $$ begin
 if exists(select 1 from participant_identity.account_deletion_requests_v1 where status='COMPLETED') then
   raise exception 'PORTRAIT_POLICY_REQUIRES_DELETED_PLAYER_BACKFILL_REVIEW';
 end if;
end $$;

create table participant_identity.player_portrait_policy_clock_v1 (
 singleton boolean primary key default true check(singleton),
 revision bigint not null default 0 check(revision between 0 and 9007199254740991)
);
insert into participant_identity.player_portrait_policy_clock_v1 values(true,0);
create table participant_identity.player_portrait_policy_v1 (
 player_id text primary key references scoring_authority.players(player_id) on delete restrict,
 policy text not null check(policy='SUPPRESSED'),
 revision bigint not null check(revision between 1 and 9007199254740991)
);
alter table participant_identity.player_portrait_policy_clock_v1 enable row level security;
alter table participant_identity.player_portrait_policy_v1 enable row level security;
revoke all on participant_identity.player_portrait_policy_clock_v1,
 participant_identity.player_portrait_policy_v1 from public,anon,authenticated,service_role;

create function participant_identity.preserve_portrait_suppression_v1()
returns trigger language plpgsql set search_path=pg_catalog as $$ begin
 raise exception 'PORTRAIT_SUPPRESSION_IMMUTABLE';
end $$;
revoke all on function participant_identity.preserve_portrait_suppression_v1() from public,anon,authenticated,service_role;
create trigger portrait_suppression_immutable before update or delete
 on participant_identity.player_portrait_policy_v1 for each row
 execute function participant_identity.preserve_portrait_suppression_v1();

create function participant_identity.suppress_requested_deletion_portraits_v1()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare target_players text[]; next_revision bigint;
begin
 if not exists(select 1 from participant_identity.account_deletion_requests_v1 where auth_user_id=old.id) then
   return old;
 end if;
 perform participant_identity.lock_deletion_governance_v1();
 if participant_identity.account_deletion_status_v1(old.id)<>'READY' then
   raise exception using errcode='55000',message='ACCOUNT_DELETION_PROTECTED';
 end if;
 -- Serialize revisions through transaction commit, not a nontransactional sequence.
 perform 1 from participant_identity.player_portrait_policy_clock_v1 where singleton for update;
 select array_agg(distinct l.player_id order by l.player_id) into target_players
 from participant_identity.user_player_links l
 where l.auth_user_id=old.id and not exists(
   select 1 from participant_identity.player_portrait_policy_v1 p where p.player_id=l.player_id);
 if cardinality(target_players)>0 then
   update participant_identity.player_portrait_policy_clock_v1 set revision=revision+1
    where singleton returning revision into next_revision;
   insert into participant_identity.player_portrait_policy_v1(player_id,policy,revision)
    select unnest(target_players),'SUPPRESSED',next_revision;
 end if;
 -- Subsequent Auth cleanup/guards remain authoritative. Any failure rolls this back.
 return old;
end $$;
revoke all on function participant_identity.suppress_requested_deletion_portraits_v1()
 from public,anon,authenticated,service_role;
create trigger ab_requested_deletion_portraits_v1 before delete on auth.users
 for each row execute function participant_identity.suppress_requested_deletion_portraits_v1();

create function public.read_player_portrait_policy_v1()
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare result jsonb;
begin
 perform production_control.assert_production_service_role();
 if (select count(*) from scoring_authority.players)>4096 then
   raise exception 'PORTRAIT_POLICY_CAPACITY_EXCEEDED';
 end if;
 select jsonb_build_object('contractVersion','player-portrait-policy-v1',
   'revision',c.revision,'players',coalesce((
     select jsonb_agg(jsonb_build_object('playerId',p.player_id,
       'policy',coalesce(s.policy,'ACTIVE'),'revision',coalesce(s.revision,0)) order by p.player_id)
     from scoring_authority.players p left join participant_identity.player_portrait_policy_v1 s using(player_id)
   ),'[]'::jsonb)) into result
 from participant_identity.player_portrait_policy_clock_v1 c where singleton;
 return result;
end $$;
revoke all on function public.read_player_portrait_policy_v1() from public,anon,authenticated,service_role;
grant execute on function public.read_player_portrait_policy_v1() to service_role;
commit;
