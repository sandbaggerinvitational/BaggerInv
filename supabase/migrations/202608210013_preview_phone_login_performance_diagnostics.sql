-- STEP 8B.2C (Preview only): retain bounded, PII-safe authentication-to-Home
-- performance stages. This expands only the existing diagnostics allowlist.

create or replace function public.record_single_participant_auth_client_diagnostics(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = participant_identity, public, pg_temp
as $$
declare user_id uuid := nullif(input->>'auth_user_id', '')::uuid;
declare rehearsal participant_identity.participant_auth_rehearsals%rowtype;
declare sample jsonb;
declare inserted integer := 0;
declare event_name text;
begin
  select * into rehearsal from participant_identity.participant_auth_rehearsals
    where auth_user_id = user_id and status = 'PREPARED' and shadow_enabled;
  if not found then return jsonb_build_object('ok', false, 'code', 'ACTIVE_REHEARSAL_REQUIRED'); end if;
  if jsonb_array_length(coalesce(input->'samples', '[]'::jsonb)) > 50 then raise exception 'Diagnostics batch is too large.'; end if;
  for sample in select value from jsonb_array_elements(coalesce(input->'samples', '[]'::jsonb)) loop
    event_name := upper(btrim(coalesce(sample->>'event_type', '')));
    if event_name not in (
      'AUTH_PAGE_LOADED', 'SESSION_CHECK', 'OTP_REQUEST', 'OTP_VERIFICATION',
      'EMAIL_OTP_VERIFY_RESPONSE', 'PHONE_OTP_VERIFY_RESPONSE', 'AUTH_SESSION_ESTABLISHED',
      'LOGIN_REDIRECT_INITIATED', 'ROUTE_NAVIGATION', 'HOME_SHELL_RENDER',
      'HOME_FRESH_PAYLOAD', 'HOME_PRIMARY_USABLE', 'HOME_SECONDARY_COMPLETE',
      'HOME_CACHED_SHELL', 'HOME_IDENTITY_VISIBLE', 'HOME_NET_SKINS_READY',
      'PWA_REOPEN', 'APP_BACKGROUND', 'APP_FOREGROUND'
    ) then continue; end if;
    insert into participant_identity.participant_auth_client_diagnostics (
      tournament_id, player_id, auth_user_id, event_type, route_from, route_to,
      duration_ms, device_class, client_recorded_at, safe_metadata
    ) values (
      rehearsal.tournament_id, rehearsal.player_id, user_id, event_name,
      nullif(left(btrim(coalesce(sample->>'route_from', '')), 160), ''),
      nullif(left(btrim(coalesce(sample->>'route_to', '')), 160), ''),
      case when (sample->>'duration_ms') ~ '^\d+$' then least((sample->>'duration_ms')::integer, 600000) else null end,
      case when upper(coalesce(sample->>'device_class', '')) in ('IPHONE', 'MOBILE', 'DESKTOP')
        then upper(sample->>'device_class') else 'UNKNOWN' end,
      case when coalesce(sample->>'recorded_at', '') <> '' then (sample->>'recorded_at')::timestamptz else null end,
      jsonb_build_object('navigationType', left(coalesce(sample->>'navigation_type', ''), 40))
    );
    inserted := inserted + 1;
  end loop;
  return jsonb_build_object('ok', true, 'inserted', inserted);
end;
$$;

revoke all on function public.record_single_participant_auth_client_diagnostics(jsonb) from public, anon, authenticated;
grant execute on function public.record_single_participant_auth_client_diagnostics(jsonb) to service_role;

notify pgrst, 'reload schema';
