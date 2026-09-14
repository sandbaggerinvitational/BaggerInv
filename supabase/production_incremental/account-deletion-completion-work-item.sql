-- STEP 2K.5L local candidate: original-request continuation only.
-- Not a complete minimization migration. No request is created or consumed
-- by installation. No scheduler, provider call, or Auth deletion is installed.
begin;
create or replace function public.read_account_deletion_work_item_v1(operation_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare item participant_identity.account_deletion_requests_v1%rowtype;
declare target uuid;
declare next_status text;
begin
  perform production_control.assert_production_service_role();
  if operation_id is null then
    raise exception using errcode = '22023', message = 'ACCOUNT_DELETION_INVALID_REQUEST';
  end if;
  select * into strict item from participant_identity.account_deletion_requests_v1
    where request_id = operation_id;
  if item.status = 'COMPLETED' then
    return jsonb_build_object('requestId', item.request_id, 'authUserId', null,
      'status', 'COMPLETED', 'completed', true);
  end if;
  target := item.auth_user_id;
  -- Match the established Auth-row -> governance -> request lock order.
  perform 1 from auth.users where id = target for update;
  if not found then
    -- A concurrent successful deletion may have completed while we waited.
    select * into strict item from participant_identity.account_deletion_requests_v1
      where request_id = operation_id;
    if item.status = 'COMPLETED' and item.auth_user_id is null then
      return jsonb_build_object('requestId', item.request_id, 'authUserId', null,
        'status', 'COMPLETED', 'completed', true);
    end if;
    raise exception using errcode = '55000', message = 'ACCOUNT_DELETION_STATE_UNCERTAIN';
  end if;
  perform participant_identity.lock_deletion_governance_v1();
  select * into strict item from participant_identity.account_deletion_requests_v1
    where request_id = operation_id for update;
  if item.auth_user_id is distinct from target or item.status = 'COMPLETED' then
    raise exception using errcode = '55000', message = 'ACCOUNT_DELETION_STATE_UNCERTAIN';
  end if;
  next_status := participant_identity.account_deletion_status_v1(target);
  if next_status not in ('READY', 'PENDING_ADMINISTRATIVE_HANDOFF', 'PENDING_REVIEW_ACCESS_HANDOFF') then
    raise exception using errcode = '55000', message = 'ACCOUNT_DELETION_STATE_UNCERTAIN';
  end if;
  if next_status is distinct from item.status then
    update participant_identity.account_deletion_requests_v1
      set status = next_status, updated_at = clock_timestamp()
      where request_id = operation_id;
  end if;
  return jsonb_build_object('requestId', item.request_id, 'authUserId', target,
    'status', next_status, 'completed', false);
end;
$$;
revoke all on function public.read_account_deletion_work_item_v1(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.read_account_deletion_work_item_v1(uuid) to service_role;
commit;
