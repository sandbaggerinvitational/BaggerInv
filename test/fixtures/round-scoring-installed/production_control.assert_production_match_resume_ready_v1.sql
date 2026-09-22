CREATE OR REPLACE FUNCTION production_control.assert_production_match_resume_ready_v1(target_match_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'production_control', 'scoring_authority'
AS $function$
declare
 m scoring_authority.matches%rowtype;
 anchor scoring_authority.score_mutations%rowtype;
 context_result jsonb;
 reason text;
 progress jsonb;
 context_hash text;
begin
 select * into m from scoring_authority.matches where match_id=target_match_id and tournament_id='2026';
 context_result := production_control.match_scoring_context_readiness_v1(target_match_id,true);
 if coalesce((context_result->>'ready')::boolean,false) is not true then
   return context_result || jsonb_build_object('contractVersion','production-match-resume-readiness-v1');
 end if;
 context_hash := production_control.match_resume_context_hash_v1(target_match_id);
 select * into anchor from scoring_authority.score_mutations
 where match_id=target_match_id and mutation_type in ('ACCESS_ACTIVATE','SCORING_UNLOCK')
   and result->>'scoring_context_hash' is not null
 order by next_match_revision limit 1;
 if m.status <> 'LIVE' or m.finalized_at is not null then
   reason := 'RESUME_REQUIRES_LIVE_NONFINAL_MATCH';
 elsif m.unresolved_mutations <> 0 or exists(
   select 1 from scoring_authority.scoring_ingress_leases l
   where l.tournament_id=m.tournament_id and l.match_id=m.match_id and l.expires_at>clock_timestamp()
 ) or exists(select 1 from scoring_authority.finalized_scorecard_snapshots f where f.match_id=m.match_id)
   or exists(select 1 from scoring_authority.score_mutations r where r.match_id=m.match_id and r.mutation_type in('FINALIZE','REOPEN')) then
   reason := 'RESUME_CORRECTION_OR_MUTATION_CONFLICT';
 elsif anchor.mutation_key is null or context_hash is null
   or anchor.result->>'scoring_context_hash' is distinct from context_hash then
   reason := 'RESUME_AUTHORITY_BINDING_MISMATCH';
 elsif exists(select 1 from scoring_authority.scoring_permissions p where p.match_id=m.match_id
   and (p.can_score or p.revoked_at is null)) then
   reason := 'RESUME_REQUIRES_REVOKED_ACCESS';
 elsif exists(select 1 from scoring_authority.score_mutations r where r.match_id=m.match_id
   and r.previous_match_revision>=anchor.previous_match_revision
   and (r.next_match_revision<>r.previous_match_revision+1
     or r.next_match_revision>m.match_revision
     or r.mutation_type not in('ACCESS_ACTIVATE','SCORING_UNLOCK','ACCESS_REVOKE','SCORING_LOCK','MARK_LIVE','HOLE_SCORE')
     or (r.mutation_type in('ACCESS_ACTIVATE','SCORING_UNLOCK')
         and r.result->>'scoring_context_hash' is distinct from context_hash)
     or (select count(*) from scoring_authority.score_revision_history h
         where h.match_id=r.match_id and h.mutation_key=r.mutation_key
           and h.previous_match_revision=r.previous_match_revision and h.next_match_revision=r.next_match_revision
           and h.actor_id=r.actor_id
           and (case when r.mutation_type='HOLE_SCORE' then h.after_state=r.result
             else h.after_state#>>'{match,scoring_snapshot_id}'=m.scoring_snapshot_id
               and h.before_state#>>'{match,scoring_snapshot_id}'=m.scoring_snapshot_id end))<>1))
   or (select count(*) from scoring_authority.score_mutations r where r.match_id=m.match_id
       and r.previous_match_revision>=anchor.previous_match_revision)<>m.match_revision-anchor.previous_match_revision
   or (select count(distinct r.next_match_revision) from scoring_authority.score_mutations r where r.match_id=m.match_id
       and r.previous_match_revision>=anchor.previous_match_revision)<>m.match_revision-anchor.previous_match_revision then
   reason := 'RESUME_REVISION_HISTORY_INVALID';
 elsif exists(select 1 from scoring_authority.hole_scores h left join scoring_authority.score_mutations r
     on r.match_id=h.match_id and r.mutation_key=h.mutation_key
   where h.match_id=m.match_id and (r.mutation_key is null or r.mutation_type<>'HOLE_SCORE'
     or r.previous_match_revision<anchor.next_match_revision
     or r.hole_number is distinct from h.hole_number or r.next_hole_revision is distinct from h.hole_revision
     or r.result->'gross' is distinct from jsonb_build_object('team_1',h.team_1_gross_scores,'team_2',h.team_2_gross_scores)
     or r.result->'strokes' is distinct from jsonb_build_object('team_1',h.team_1_strokes,'team_2',h.team_2_strokes)
     or r.result->'net' is distinct from jsonb_build_object('team_1',h.team_1_net_score,'team_2',h.team_2_net_score)
     or r.result->>'hole_winner' is distinct from h.hole_winner
     or (select count(*) from scoring_authority.score_mutations q where q.match_id=h.match_id
          and q.mutation_type='HOLE_SCORE' and q.hole_number=h.hole_number)<>h.hole_revision
     or (select count(distinct q.next_hole_revision) from scoring_authority.score_mutations q where q.match_id=h.match_id
          and q.mutation_type='HOLE_SCORE' and q.hole_number=h.hole_number
          and q.next_hole_revision=q.previous_hole_revision+1 and q.next_hole_revision between 1 and h.hole_revision)<>h.hole_revision))
   or exists(select 1 from scoring_authority.score_mutations r where r.match_id=m.match_id and r.mutation_type='HOLE_SCORE'
     and not exists(select 1 from scoring_authority.hole_scores h where h.match_id=r.match_id and h.hole_number=r.hole_number)) then
   reason := 'RESUME_SCORE_HISTORY_INVALID';
 end if;
 if reason is null then
   progress := scoring_authority.match_progress(m.match_id,m.format);
   if (select jsonb_object_agg(k,to_jsonb(m)->k) from unnest(array[
       'scored_holes','current_hole','holes_remaining','team_1_holes_won','team_2_holes_won',
       'running_result','result_winner','clinched','scorecard_complete']) k)
      is distinct from (select jsonb_object_agg(k,progress->k) from unnest(array[
       'scored_holes','current_hole','holes_remaining','team_1_holes_won','team_2_holes_won',
       'running_result','result_winner','clinched','scorecard_complete']) k) then
     reason := 'RESUME_PROGRESS_MISMATCH';
   end if;
 end if;
 return jsonb_build_object('ready',reason is null,'contractVersion','production-match-resume-readiness-v1',
   'matchId',target_match_id,'scoring_context_hash',context_hash,
   'reasons',case when reason is null then '[]'::jsonb else jsonb_build_array(jsonb_build_object('code',reason)) end);
exception when others then
 return jsonb_build_object('ready',false,'contractVersion','production-match-resume-readiness-v1',
   'reasons',jsonb_build_array(jsonb_build_object('code','RESUME_READINESS_UNAVAILABLE')));
end $function$
;
