CREATE OR REPLACE FUNCTION production_control.match_resume_context_hash_v1(target_match_id text)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'production_control', 'scoring_authority'
AS $function$
 select production_control.cutover_payload_hash(jsonb_build_object(
   'match_id', m.match_id, 'tournament_id', m.tournament_id,
   'round_number', m.round_number, 'format', m.format,
   'snapshot', to_jsonb(s),
   'participants', (select jsonb_agg(to_jsonb(p) order by p.team_side,p.player_slot)
     from scoring_authority.match_participants p where p.match_id=m.match_id),
   'holes', (select jsonb_agg(to_jsonb(h) order by h.hole_number)
     from scoring_authority.match_holes h where h.match_id=m.match_id),
   'approved_handicaps', (select jsonb_agg(to_jsonb(e) order by e.player_id)
     from scoring_authority.handicap_revision_entries e where e.revision_id=s.handicap_revision_id
       and e.player_id in(select p.player_id from scoring_authority.match_participants p where p.match_id=m.match_id)),
   'setup', (select jsonb_build_object('course_id',d.course_id,'tee_id',d.tee_id,
     'setup_revision',d.setup_revision,'prepared_setup_revision',d.prepared_setup_revision,
     'fingerprint',d.prepared_configuration_fingerprint)
     from scoring_authority.tournament_setup_match_details_v1 d where d.match_id=m.match_id)
 )) from scoring_authority.matches m join scoring_authority.scoring_snapshots s
 on s.snapshot_id=m.scoring_snapshot_id and s.match_id=m.match_id and s.tournament_id=m.tournament_id
 where m.match_id=target_match_id and m.tournament_id='2026'
$function$
;
