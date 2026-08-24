begin;

-- Preserve a bounded operator taxonomy while distinguishing a provider handoff
-- rate limit from GoTrue's own limiter. Ambiguous 429s remain explicitly
-- unknown instead of being attributed to either system without evidence.
alter table participant_identity.participant_auth_otp_attempts
  drop constraint if exists participant_auth_otp_attempts_production_safe_reason_check;

alter table participant_identity.participant_auth_otp_attempts
  add constraint participant_auth_otp_attempts_production_safe_reason_check
  check (safe_reason is null or safe_reason in (
    'NOT_ELIGIBLE', 'COOLDOWN', 'RATE_LIMIT', 'APPROVED',
    'DELIVERY_ACCEPTED', 'AUTH_CAPTCHA_REJECTED',
    'AUTH_SUPABASE_RATE_LIMITED', 'AUTH_SMTP_PROVIDER_RATE_LIMITED',
    'AUTH_EMAIL_RATE_LIMITED_UNKNOWN_SOURCE',
    'AUTH_EMAIL_CONFIGURATION_FAILED', 'AUTH_SMTP_PROVIDER_REJECTED',
    'AUTH_EMAIL_SERVICE_UNAVAILABLE', 'AUTH_EMAIL_SEND_FAILED',
    'SESSION_ESTABLISHED', 'INVALID_OR_EXPIRED_CODE'
  ));

create or replace function public.record_production_auth_candidate_otp_delivery(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, participant_identity, pg_temp
as $$
declare request uuid := nullif(input->>'request_id', '')::uuid;
declare succeeded boolean := coalesce((input->>'succeeded')::boolean, false);
declare requested_reason text := upper(btrim(coalesce(input->>'safe_reason', 'AUTH_EMAIL_SEND_FAILED')));
begin
  perform production_control.assert_production_auth_candidate_rpc();
  if requested_reason not in (
    'AUTH_CAPTCHA_REJECTED', 'AUTH_SUPABASE_RATE_LIMITED',
    'AUTH_SMTP_PROVIDER_RATE_LIMITED', 'AUTH_EMAIL_RATE_LIMITED_UNKNOWN_SOURCE',
    'AUTH_EMAIL_CONFIGURATION_FAILED', 'AUTH_SMTP_PROVIDER_REJECTED',
    'AUTH_EMAIL_SERVICE_UNAVAILABLE', 'AUTH_EMAIL_SEND_FAILED'
  ) then
    requested_reason := 'AUTH_EMAIL_SEND_FAILED';
  end if;
  update participant_identity.participant_auth_otp_attempts set
    status = case when succeeded then 'SENT' else 'DELIVERY_FAILED' end,
    safe_reason = case when succeeded then 'DELIVERY_ACCEPTED' else requested_reason end,
    request_duration_ms = greatest(0, coalesce((input->>'duration_ms')::integer, 0)),
    sent_at = case when succeeded then now() else sent_at end, updated_at = now()
  where request_id = request and status = 'AUTHORIZED';
  if not found then raise exception 'OTP request is not in an authorized delivery state.'; end if;
  return jsonb_build_object('ok', true, 'requestId', request,
    'status', case when succeeded then 'SENT' else 'DELIVERY_FAILED' end);
end;
$$;

revoke all on function public.record_production_auth_candidate_otp_delivery(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.record_production_auth_candidate_otp_delivery(jsonb)
  to service_role;

commit;
