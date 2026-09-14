-- STEP 2K.1 local source only; not authorized for deployment.
-- Historical actor UUIDs are opaque provenance, not login identities. Preserve
-- immutable rows byte-for-byte while removing their dependency on live Auth.
-- New attribution still requires a real, current Auth user.
begin;
create table participant_identity.historical_authorship_v1 (
  subject_id uuid primary key
);
alter table participant_identity.historical_authorship_v1 enable row level security;
revoke all on participant_identity.historical_authorship_v1 from public, anon, authenticated, service_role;

create function participant_identity.require_live_authorship_v1()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
declare subject uuid;
begin
  subject := (to_jsonb(new)->>tg_argv[0])::uuid;
  if subject is null then return new; end if;
  -- Retaining an existing attribution is not assigning a new author. The
  -- registry FK still protects it, including after legitimate Auth deletion.
  if tg_op = 'UPDATE' and subject = (to_jsonb(old)->>tg_argv[0])::uuid then
    return new;
  end if;
  -- Serialize new attribution with Auth DELETE/key changes until transaction
  -- end. An unlocked existence check is insufficient under MVCC. If DELETE
  -- wins, this waits and then rejects (or serialization fails at higher
  -- isolation); if attribution wins, DELETE waits for its commit/rollback.
  perform 1 from auth.users where id = subject for key share;
  if not found then
    raise exception using errcode = '23503', message = 'LIVE_AUTHOR_AUTH_REQUIRED';
  end if;
  insert into participant_identity.historical_authorship_v1 values(subject) on conflict do nothing;
  return new;
end;
$$;
revoke all on function participant_identity.require_live_authorship_v1() from public, anon, authenticated, service_role;

-- Match only explicit actor-attribution columns in known Bagger schemas.
-- Never redirect a participant link, role, certification or session FK.
do $$
declare item record;
begin
  for item in
    select n.nspname schema_name,c.relname table_name,a.attname column_name,k.conname
    from pg_constraint k join pg_class c on c.oid=k.conrelid
    join pg_namespace n on n.oid=c.relnamespace
    join pg_attribute a on a.attrelid=c.oid and a.attnum=k.conkey[1]
    where k.contype='f' and k.confrelid='auth.users'::regclass and array_length(k.conkey,1)=1
      and n.nspname in ('scoring_authority','production_control','participant_identity')
      and (a.attname='actor_auth_user_id' or a.attname like '%\_by\_auth\_user\_id' escape '\')
      and c.relname not in ('participant_phone_otp_attempts')
    order by n.nspname,c.relname,a.attname,k.conname
  loop
    execute format('insert into participant_identity.historical_authorship_v1 select distinct %I from %I.%I where %I is not null on conflict do nothing',
      item.column_name,item.schema_name,item.table_name,item.column_name);
    execute format('alter table %I.%I drop constraint %I',item.schema_name,item.table_name,item.conname);
    execute format('alter table %I.%I add constraint %I foreign key (%I) references participant_identity.historical_authorship_v1(subject_id) on delete restrict',
      item.schema_name,item.table_name,item.conname,item.column_name);
    execute format('create trigger %I before insert or update of %I on %I.%I for each row execute function participant_identity.require_live_authorship_v1(%L)',
      'bagger_live_'||item.column_name,item.column_name,item.schema_name,item.table_name,item.column_name);
  end loop;
  -- Revoked administrative records retain provenance, but no live Auth link.
  for item in
    select n.nspname schema_name,c.relname table_name,a.attname column_name,k.conname
    from pg_constraint k join pg_class c on c.oid=k.conrelid
    join pg_namespace n on n.oid=c.relnamespace
    join pg_attribute a on a.attrelid=c.oid and a.attnum=k.conkey[1]
    where k.contype='f' and k.confrelid='auth.users'::regclass and array_length(k.conkey,1)=1
      and n.nspname='production_control' and a.attname='auth_user_id'
      and c.relname in ('director_entitlements','tournament_owner_capabilities_v1')
    order by n.nspname,c.relname,a.attname,k.conname
  loop
    execute format('alter table %I.%I alter column auth_user_id drop not null',item.schema_name,item.table_name);
    execute format('alter table %I.%I drop constraint %I',item.schema_name,item.table_name,item.conname);
    execute format('alter table %I.%I add constraint %I foreign key(auth_user_id) references auth.users(id) on delete set null',item.schema_name,item.table_name,item.conname);
  end loop;
end;
$$;
commit;
