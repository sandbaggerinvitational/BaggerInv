-- Local STEP 2K.5L candidate, not deployed. Inert installation.
-- Erase the external GHIN number, not the referenced competition-evidence ID.
begin;
do $$
declare item record;
declare changed integer := 0;
begin
  for item in select conname from pg_constraint
    where conrelid = 'production_control.player_external_identities_v1'::regclass
      and contype = 'c'
      and (pg_get_constraintdef(oid) like '%external_identifier%'
        or pg_get_constraintdef(oid) like '%status%')
  loop
    changed := changed + 1;
    execute format('alter table production_control.player_external_identities_v1 drop constraint %I', item.conname);
  end loop;
  if changed <> 3 then raise exception 'GHIN_PRIVACY_CONSTRAINT_TOPOLOGY_CHANGED'; end if;
end $$;
alter table production_control.player_external_identities_v1
  alter column external_identifier drop not null;
alter table production_control.player_external_identities_v1
  add constraint external_identity_privacy_state_v1 check (
    (status = 'REDACTED' and external_identifier is null)
    or (status = 'VERIFIED' and external_identifier is not null
      and external_identifier ~ '^[0-9]{5,12}$'
      and retired_at is null and retired_by_player_id is null and retired_by_auth_user_id is null)
    or (status = 'RETIRED' and external_identifier is not null
      and external_identifier ~ '^[0-9]{5,12}$'
      and retired_at is not null and retired_by_player_id is not null and retired_by_auth_user_id is not null)
  );

create function participant_identity.redact_deleted_external_identifiers_v1()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
declare linked_players text[];
begin
  if tg_op <> 'DELETE' or tg_relid <> 'auth.users'::regclass then
    raise exception 'ACCOUNT_DELETION_TRIGGER_SCOPE_REQUIRED';
  end if;
  if not exists (select 1 from participant_identity.account_deletion_requests_v1
    where auth_user_id = old.id and status <> 'COMPLETED') then return old; end if;
  perform participant_identity.lock_deletion_governance_v1();
  if participant_identity.account_deletion_status_v1(old.id) <> 'READY' then
    raise exception 'ACCOUNT_DELETION_PROTECTED';
  end if;
  select array_agg(distinct player_id) into linked_players
    from participant_identity.user_player_links where auth_user_id = old.id;
  -- All other fields, including timestamps and actor attribution, are unchanged.
  update production_control.player_external_identities_v1
    set external_identifier = null, status = 'REDACTED'
    where player_id = any(linked_players) and status <> 'REDACTED';
  return old;
end;
$$;
revoke all on function participant_identity.redact_deleted_external_identifiers_v1()
  from public, anon, authenticated, service_role;
create trigger aa_deleted_external_identifiers_v1 before delete on auth.users
  for each row execute function participant_identity.redact_deleted_external_identifiers_v1();
commit;
