// Read-only independent observations for the owned local annual chronology.
// These helpers never create score, publication, worker or certificate facts.
import assert from 'node:assert/strict';
import {jsonLiteral} from './postgres17.mjs';

export function assertNoPrivateResourceProvenance(value,label='publicData'){
 const forbidden=new Set(['resource_id','resourceId','service_context','serviceContext',
  'installation_receipt','installationReceipt','installation_id','installationId',
  'ingress_generation_id','ingressGenerationId','admission_generation_id','admissionGenerationId',
  'operation_request_id','operationRequestId','private_operation_id','privateOperationId']);
 const visit=(item,path)=>{
  if(!item||typeof item!=='object')return;
  for(const [key,nested]of Object.entries(item)){
   assert.ok(!forbidden.has(key),path+'.'+key+' leaks private resource provenance');
   visit(nested,path+'.'+key);
  }
 };
 visit(value,label);
 return{status:'PASS',checkedKeys:[...forbidden],scope:'Domain DTO fields; approved existing public provenance remains unchanged'};
}

export function certificationAnnualObservations(fixture,tournamentId){
 const target=jsonLiteral(String(tournamentId))+"#>>'{}'";
 const rows=query=>JSON.parse(fixture.q(query));
 const aggregate=(table,condition)=>`coalesce((select jsonb_agg(to_jsonb(v)order by to_jsonb(v)::text)from ${table} v where ${condition}),'[]'::jsonb)`;
 const hash=expression=>`encode(extensions.digest((${expression})::text,'sha256'),'hex')`;
 const competitive=`jsonb_build_object(
  'matches',${aggregate('scoring_authority.matches',`v.tournament_id=${target}`)},
  'holes',${aggregate('scoring_authority.hole_scores',`v.match_id in(select match_id from scoring_authority.matches where tournament_id=${target})`)},
  'participants',${aggregate('scoring_authority.match_participants',`v.match_id in(select match_id from scoring_authority.matches where tournament_id=${target})`)},
  'snapshots',${aggregate('scoring_authority.scoring_snapshots',`v.tournament_id=${target}`)})`;
 const financial=`jsonb_build_object(
  'calcuttaOwnershipAndPrices',${aggregate('scoring_authority.calcutta_v1_auction_fact_revisions',`v.tournament_id=${target}`)},
  'netSkinsEntries',${aggregate('production_control.net_skins_entry_revisions_v1',`v.tournament_id=${target}`)},
  'netSkinsResults',${aggregate('scoring_authority.net_skins_v1_result_revisions',`v.tournament_id=${target}`)})`;
 const state=()=>rows(`select jsonb_build_object(
  'tournamentId',${target},'competitiveFingerprint',${hash(competitive)},'financialFingerprint',${hash(financial)},
  'matches',(select count(*)from scoring_authority.matches where tournament_id=${target}),
  'finals',(select count(*)from scoring_authority.matches where tournament_id=${target}and status='FINAL'and scorecard_complete),
  'holes',(select count(*)from scoring_authority.hole_scores h join scoring_authority.matches m using(match_id)where m.tournament_id=${target}),
  'publishedSnapshots',(select count(*)from scoring_authority.odds_published_snapshots where tournament_id=${target}),
  'currentPublication',(select to_jsonb(v)from scoring_authority.odds_publication_current v where tournament_id=${target}),
  'finalRecapEligible',production_control.derived_final_recap_ready_v1(${target}),
  'finalRecapJobs',${aggregate('scoring_authority.competition_recalculation_jobs',`v.tournament_id=${target}and v.engine_key='TOURNAMENT_FINAL_RECAP'`)},
  'currentFinalRecap',${aggregate('scoring_authority.competition_derived_snapshots',`v.tournament_id=${target}and v.engine_key='TOURNAMENT_FINAL_RECAP'and v.is_current`)},
  'pendingRequiredJobs',(select count(*)from scoring_authority.competition_recalculation_jobs where tournament_id=${target}and status<>'SUCCEEDED'
   and((engine_key in('TEAM_MOMENTUM','TOURNAMENT_STORYLINES')and round_number=0)
    or engine_key in('TOURNAMENT_INTELLIGENCE','PROJECTION_EDITORIAL','TOURNAMENT_FINAL_RECAP'))),
  'unresolvedIngress',(select count(*)from production_control.certification_ingress_leases_v1 where tournament_id=${target}and state in('ADMITTED','UNKNOWN')),
  'googleJobs',(select count(*)from scoring_authority.google_outbox_events where tournament_id=${target})+
   (select count(*)from scoring_authority.odds_google_mirror_jobs where tournament_id=${target}))`);
 const publicationProof=()=>{
  const started=performance.now();
  const eligible=fixture.q(`select production_control.derived_final_recap_ready_v1(${target})`)==='t';
  const elapsedMs=performance.now()-started;
  const plan=rows(`explain(analyze,buffers,format json)
   select current_snapshot_id,publication_revision from scoring_authority.odds_publication_current
   where tournament_id=${target}`);
  return{eligible,eligibilityElapsedMs:elapsedMs,publicationPointerPlan:plan,
   method:'Single local SQL client/process-inclusive eligibility observation; pointer plan reports PostgreSQL execution separately',
   samples:1,environment:'OWNED_LOCAL_POSTGRESQL17',p95:'NOT PROVEN',p99:'NOT PROVEN'};
 };
 const applicationState=()=>{
  const tables=['production_control.canonical_resource_v1','production_control.canonical_bootstrap_installation_v1',
   'production_control.certification_admission_v1','production_control.certification_ingress_generations_v1',
   'production_control.certification_ingress_leases_v1','production_control.certification_odds_receipts_v1',
   'scoring_authority.score_derived_intents_v1','scoring_authority.competition_recalculation_jobs',
   'scoring_authority.odds_calculation_jobs','scoring_authority.odds_published_snapshots',
   'scoring_authority.odds_publication_current','scoring_authority.competition_derived_snapshots',
   'production_control.current_tournament_pointer_v1','production_control.annual_scoring_transitions_v1'];
  return Object.fromEntries(tables.map(table=>[table,rows(`select jsonb_build_object('rows',count(*),
   'fingerprint',${hash("coalesce(jsonb_agg(to_jsonb(v)order by to_jsonb(v)::text),'[]'::jsonb)")})from ${table} v`)]));
 };
 const workerBindings=()=>{
  const generation=fixture.q(`select runtime_generation_id from production_control.future_annual_runtime_generations_v1
   where tournament_id=${target}and generation_status='ACTIVE'`)||null;
  const families=Object.fromEntries([
   ['COMPETITION','competition_recalculation_jobs'],['NET_SKINS','net_skins_v1_recalculation_jobs'],
   ['CALCUTTA','calcutta_v1_recalculation_jobs']].map(([family,table])=>[family,rows(`select jsonb_build_object(
    'rows',count(*),'unbound',count(*)filter(where runtime_generation_id is null),
    'mismatched',count(*)filter(where runtime_generation_id is distinct from
     ${generation?'('+jsonLiteral(generation)+"#>>'{}')::uuid":'null::uuid'}))
    from scoring_authority.${table} where tournament_id=${target}`)]));
  return{expectedRuntimeGeneration:generation,families};
 };
 const scoreIntegrity=()=>{
  const holes=rows(`select jsonb_agg(jsonb_build_object('score',to_jsonb(h),'format',m.format,'strokeIndex',mh.stroke_index,
   'configuration',s.team_configuration,'participants',(select jsonb_agg(to_jsonb(p)order by team_side,player_slot)
    from scoring_authority.match_participants p where p.match_id=m.match_id))order by m.match_id,h.hole_number)
   from scoring_authority.hole_scores h join scoring_authority.matches m using(match_id)
   join scoring_authority.match_holes mh using(match_id,hole_number)
   join scoring_authority.scoring_snapshots s on s.snapshot_id=m.scoring_snapshot_id where m.tournament_id=${target}`);
  assert.equal(holes.length,432);
  const rounds={BB:0,SC:0,SI:0};
  for(const {score,format,strokeIndex,configuration,participants}of holes){
   const length=format==='BB'?2:1;
   assert.deepEqual(score.team_1_gross_scores,Array(length).fill(4));
   assert.deepEqual(score.team_2_gross_scores,Array(length).fill(5));
   // Independent arithmetic, not a call back to the SQL implementation.
   const allocated=total=>total<=0?0:Math.floor(total/18)+(strokeIndex<=total%18?1:0);
   const strokes=side=>format==='SC'?[allocated(configuration['team_'+side+'_strokes'])]:participants
    .filter(p=>p.team_side===side).map(p=>allocated(p.final_strokes));
   const s1=strokes(1),s2=strokes(2);
   assert.deepEqual(score.team_1_strokes,s1);assert.deepEqual(score.team_2_strokes,s2);
   const n1=Math.min(...s1.map(s=>4-s)),n2=Math.min(...s2.map(s=>5-s));
   assert.equal(score.team_1_net_score,n1);assert.equal(score.team_2_net_score,n2);
   assert.equal(score.hole_winner,n1===n2?'Halved':n1<n2?'Team 1':'Team 2');
   rounds[format]++;
  }
  assert.deepEqual(rounds,{BB:108,SC:108,SI:216});
  const matches=rows(`select jsonb_agg(jsonb_build_object('match',to_jsonb(m),'finalization',v.result)order by m.match_id)
   from scoring_authority.matches m join scoring_authority.score_mutations v using(match_id)
   where m.tournament_id=${target}and v.mutation_type='FINALIZE'`);
  assert.equal(matches.length,24);
  for(const {match,finalization}of matches){
   const matchHoles=holes.filter(h=>h.score.match_id===match.match_id);
   assert.equal(matchHoles.length,18);
   const side=winner=>winner==='Team 1'?1:winner==='Team 2'?-1:0;
   const winner=delta=>delta>0?'Team 1':delta<0?'Team 2':'Halved';
   const sum=list=>list.reduce((total,h)=>total+side(h.score.hole_winner),0);
   const points=result=>result==='Team 1'?1:result==='Team 2'?0:0.5;
   const overall=winner(sum(matchHoles));let expectedWinner=overall,expectedPoints;
   if(match.format==='SI'){
    let lead=0;
    for(const hole of matchHoles){lead+=side(hole.score.hole_winner);
     if(Math.abs(lead)>18-hole.score.hole_number){expectedWinner=winner(lead);break;}}
    expectedPoints=3*points(expectedWinner);
   }else expectedPoints=points(winner(sum(matchHoles.slice(0,9))))+
     points(winner(sum(matchHoles.slice(9))))+points(overall);
   assert.equal(match.result_winner,expectedWinner);
   assert.equal(finalization.result_winner,expectedWinner);
   assert.equal(finalization.team_1_points,expectedPoints);
   assert.equal(finalization.team_2_points,3-expectedPoints);
   assert.equal(match.scorecard_complete,true);assert.equal(match.status,'FINAL');
   assert.equal(match.team_1_holes_won,matchHoles.filter(h=>h.score.hole_winner==='Team 1').length);
   assert.equal(match.team_2_holes_won,matchHoles.filter(h=>h.score.hole_winner==='Team 2').length);
  }
  return{holes:holes.length,rounds,gross:'PASS',serverOwnedStrokes:'PASS',net:'PASS',holeWinner:'PASS',
   matchResults:'PASS',points:'PASS',finalizations:matches.length};
 };
 return{state,scoreIntegrity,publicationProof,applicationState,workerBindings};
}
