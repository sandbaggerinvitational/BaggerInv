-- Resolve Supabase's pgcrypto functions from hardened participant-identity
-- SECURITY DEFINER RPCs. pgcrypto is installed in the extensions schema on
-- hosted Supabase, which was absent from the original function search paths.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

alter function public.import_participant_identity_configuration(jsonb)
  set search_path = participant_identity, scoring_authority, public, extensions, pg_temp;

alter function public.admin_link_auth_user_to_player(jsonb)
  set search_path = participant_identity, scoring_authority, public, auth, extensions, pg_temp;

-- Migration-time execution probe: this fails the migration unless the exact
-- text/text pgcrypto signature resolves and produces canonical SHA-256 output.
do $$
declare fingerprint text;
begin
  select encode(extensions.digest(
    'participant-identity-preview-probe'::text,
    'sha256'::text
  ), 'hex'::text) into fingerprint;
  if fingerprint <> 'a484de7736d931eaed53ab7afebb8e973d8e8691850c1880ba4ec877bedbf2e0' then
    raise exception 'Participant identity pgcrypto fingerprint probe failed.';
  end if;
end $$;

revoke all on function public.import_participant_identity_configuration(jsonb) from public, anon, authenticated;
revoke all on function public.admin_link_auth_user_to_player(jsonb) from public, anon, authenticated;
grant execute on function public.import_participant_identity_configuration(jsonb) to service_role;
grant execute on function public.admin_link_auth_user_to_player(jsonb) to service_role;

notify pgrst, 'reload schema';
