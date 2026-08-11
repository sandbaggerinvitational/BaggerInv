-- Playing Handicap snapshots may retain pre-allocation decimal precision.
-- final_strokes remains the immutable integer used by scoring.

alter table scoring_authority.match_participants
  alter column playing_handicap type numeric using playing_handicap::numeric;

alter function public.replace_preview_scoring_authority_import(jsonb)
  rename to replace_preview_scoring_authority_import_phase2_precision_inner;

revoke all on function public.replace_preview_scoring_authority_import_phase2_precision_inner(jsonb)
  from public, anon, authenticated, service_role;

create or replace function public.replace_preview_scoring_authority_import(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = scoring_authority, public, extensions, pg_temp
as $$
declare
  sanitized jsonb := payload;
  item jsonb;
  participant_rows jsonb;
  result jsonb;
begin
  select coalesce(jsonb_agg(
    case
      when nullif(value->>'playing_handicap', '') is null then value
      else jsonb_set(value, '{playing_handicap}', to_jsonb(round((value->>'playing_handicap')::numeric)::integer))
    end
  ), '[]'::jsonb)
  into participant_rows
  from jsonb_array_elements(coalesce(payload->'match_participants', '[]'::jsonb));

  sanitized := jsonb_set(sanitized, '{match_participants}', participant_rows);
  result := public.replace_preview_scoring_authority_import_phase2_precision_inner(sanitized);
  if coalesce((result->>'ok')::boolean, false) is not true then return result; end if;

  for item in select value from jsonb_array_elements(coalesce(payload->'match_participants', '[]'::jsonb)) loop
    update scoring_authority.match_participants
    set playing_handicap = nullif(item->>'playing_handicap', '')::numeric
    where match_id = item->>'match_id'
      and team_side = (item->>'team_side')::integer
      and player_slot = (item->>'player_slot')::integer;
  end loop;
  return result;
end;
$$;

revoke all on function public.replace_preview_scoring_authority_import(jsonb)
  from public, anon, authenticated;
grant execute on function public.replace_preview_scoring_authority_import(jsonb) to service_role;

notify pgrst, 'reload schema';
