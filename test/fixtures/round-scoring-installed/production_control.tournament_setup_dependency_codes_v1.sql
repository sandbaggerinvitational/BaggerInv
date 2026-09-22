CREATE OR REPLACE FUNCTION production_control.tournament_setup_dependency_codes_v1(target_player text DEFAULT NULL::text, target_team text DEFAULT NULL::text, target_round integer DEFAULT NULL::integer, target_match text DEFAULT NULL::text, change_kind text DEFAULT 'STRUCTURAL'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare codes jsonb;
begin
  codes:=production_control.tournament_setup_dependency_codes_before_late_r3_v1(
    target_player,target_team,target_round,target_match,change_kind);
  if target_player is null and target_team is null and target_round=3
    and change_kind in('PAIRINGS','SCORING_CONTEXT') and exists(
      select 1 from production_control.late_r3_transactions_v1 t
      where transaction_id=txid_current() and target_match=any(eligible_matches)
        and ((change_kind='PAIRINGS' and operation in('REPLACE_PAIRINGS','REPLACE_ROUND_PAIRINGS'))
          or (change_kind='SCORING_CONTEXT' and operation='PREPARE_SCORING_CONTEXT')))
  then
    select coalesce(jsonb_agg(value),'[]') into codes from jsonb_array_elements(codes)
      where value not in('"CALCUTTA_AUCTION_DEPENDENCY"'::jsonb,'"CALCUTTA_RESULT_DEPENDENCY"'::jsonb);
  end if;
  return codes;
end;
$function$
;
