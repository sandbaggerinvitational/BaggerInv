-- Phase2C.1 capability closure, local candidate only. No deployment authorized.
-- Scaffolded with Supabase migration new; named for repository sequence127.
-- Fix one protocol collision without altering current pointer, owner admission,
-- idempotency, receipt/audit atomicity, grants, RLS, or score/side-game rules.
begin;
do $annual_create$
declare definition text; actual_hash text; item jsonb; needle text;
begin
 select pg_catalog.pg_get_functiondef(oid),
        pg_catalog.encode(extensions.digest(prosrc,'sha256'),'hex')
 into strict definition,actual_hash from pg_catalog.pg_proc
 where oid='public.mutate_production_future_year_administration_v1(jsonb)'::regprocedure;
 if actual_hash is distinct from '7a566ac47d639bd28ebdf912dba1f026e19f83fefbaf32d172f264502e04fff7' then
  raise exception 'ANNUAL_CREATE_SOURCE_BASELINE_MISMATCH';
 end if;
 for item in select value from pg_catalog.jsonb_array_elements($changes$[
  [
    "      tournament_year := (input->>'tournament_year')::integer;",
    "      -- Annual CREATE v1: tournament_year is current authorization scope.\n      -- The future year is explicit target metadata, never a scope override.\n      if pg_catalog.jsonb_typeof(input->'target_tournament_year') is distinct from 'number'\n         or coalesce(input->>'target_tournament_year', '') !~ '^[0-9]{4}$' then\n        return pg_catalog.jsonb_build_object(\n          'ok', false, 'code', 'FUTURE_TOURNAMENT_METADATA_INVALID'\n        );\n      end if;\n      tournament_year := (input->>'target_tournament_year')::integer;"
  ],
  [
    "    if tournament_year <= 2026 or target_id <> tournament_year::text",
    "    if tournament_year <= (input->>'tournament_year')::integer\n       or tournament_year > 2200 or target_id <> tournament_year::text"
  ]
]$changes$::jsonb) loop
  needle:=item->>0;
  if (pg_catalog.length(definition)-pg_catalog.length(pg_catalog.replace(definition,needle,'')))/pg_catalog.length(needle)<>1 then
   raise exception 'ANNUAL_CREATE_SOURCE_ANCHOR_MISMATCH';
  end if;
  definition:=pg_catalog.replace(definition,needle,item->>1);
 end loop;
 execute definition;
end;
$annual_create$;
-- P2C1CL-ANNUAL-READ-001: match participants own a team side, not a
-- nonexistent team_id column. Resolve the side within that match's tournament.
-- The existing (tournament_id, team_side) unique key bounds this read to one row.
do $annual_read$
declare definition text; actual_hash text;
begin
 select pg_catalog.pg_get_functiondef(oid),
        pg_catalog.encode(extensions.digest(prosrc,'sha256'),'hex')
 into strict definition,actual_hash from pg_catalog.pg_proc
 where oid='public.read_production_future_runtime_v2(jsonb)'::regprocedure;
 if actual_hash is distinct from 'd944544d4d55b58817fd8f5147dd04a841ef51600a9a0d98993d9d65ab238712' then
  raise exception 'ANNUAL_READ_SOURCE_BASELINE_MISMATCH';
 end if;
 definition:=pg_catalog.replace(definition,
   $before$'teamId', participant.team_id,$before$,
   $after$'teamId', (select team.team_id
              from scoring_authority.teams team
              where team.tournament_id = match_value.tournament_id
                and team.team_side = participant.team_side),$after$);
 execute definition;
end;
$annual_read$;
commit;
