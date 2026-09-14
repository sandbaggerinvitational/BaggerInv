-- Inert, private continuation queue for ORIGINAL deletion requests only.
-- Install after account-deletion-completion-work-item.sql. No provider call or
-- request is created by installation. The authenticated server worker owns calls.
begin;
create table participant_identity.account_deletion_retry_state_v1 (
  request_id uuid primary key references participant_identity.account_deletion_requests_v1(request_id) on delete cascade,
  attempts bigint not null default 0 check(attempts>=0),
  next_attempt_at timestamptz not null default clock_timestamp(),
  lease_token uuid,
  lease_expires_at timestamptz,
  check((lease_token is null)=(lease_expires_at is null))
);
alter table participant_identity.account_deletion_retry_state_v1 enable row level security;
revoke all on participant_identity.account_deletion_retry_state_v1 from public,anon,authenticated,service_role;

create function public.claim_account_deletion_batch_v1()
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare r record; token uuid; items jsonb:='[]';
begin
  perform production_control.assert_production_service_role();
  for r in
    select q.request_id from participant_identity.account_deletion_requests_v1 q
    left join participant_identity.account_deletion_retry_state_v1 s using(request_id)
    where q.status<>'COMPLETED'
      and coalesce(s.next_attempt_at,'-infinity'::timestamptz)<=clock_timestamp()
      and coalesce(s.lease_expires_at,'-infinity'::timestamptz)<=clock_timestamp()
    order by coalesce(s.next_attempt_at,q.requested_at),q.request_id
    limit 5 for update of q skip locked
  loop
    token:=gen_random_uuid();
    insert into participant_identity.account_deletion_retry_state_v1(request_id,lease_token,lease_expires_at)
    values(r.request_id,token,clock_timestamp()+interval '5 minutes')
    on conflict(request_id) do update set lease_token=excluded.lease_token,lease_expires_at=excluded.lease_expires_at;
    items:=items||jsonb_build_array(jsonb_build_object('requestId',r.request_id,'leaseToken',token));
  end loop;
  return jsonb_build_object('items',items);
end $$;

create function public.finish_account_deletion_attempt_v1(operation_id uuid, attempt_token uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare q participant_identity.account_deletion_requests_v1%rowtype;
declare s participant_identity.account_deletion_retry_state_v1%rowtype;
begin
  perform production_control.assert_production_service_role();
  select * into strict q from participant_identity.account_deletion_requests_v1 where request_id=operation_id for update;
  select * into s from participant_identity.account_deletion_retry_state_v1 where request_id=operation_id for update;
  if q.status='COMPLETED' and not found then
    return jsonb_build_object('completed',true,'idempotent',true);
  end if;
  if s.lease_token is null or s.lease_token is distinct from attempt_token then
    raise exception 'ACCOUNT_DELETION_ATTEMPT_CONFLICT';
  end if;
  if q.status='COMPLETED' then
    -- Completion needs no durable scheduler attribution or retry metadata.
    delete from participant_identity.account_deletion_retry_state_v1 where request_id=operation_id;
  else
    update participant_identity.account_deletion_retry_state_v1
    set attempts=attempts+1,lease_token=null,lease_expires_at=null,
      next_attempt_at=clock_timestamp()+interval '5 minutes'
    where request_id=operation_id;
  end if;
  return jsonb_build_object('completed',q.status='COMPLETED','idempotent',false);
end $$;
revoke all on function public.claim_account_deletion_batch_v1(),public.finish_account_deletion_attempt_v1(uuid,uuid)
 from public,anon,authenticated,service_role;
grant execute on function public.claim_account_deletion_batch_v1(),public.finish_account_deletion_attempt_v1(uuid,uuid) to service_role;
commit;
