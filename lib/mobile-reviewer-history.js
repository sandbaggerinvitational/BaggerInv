import {MobileApiError} from './mobile-api-v1.js';
import {requireReviewerRead,readCanonicalReviewer,sameReviewerHistoricalFixture} from './mobile-reviewer-identity.js';
import {requireMobileProductionReadContext} from './mobile-v1-production-read-context.js';
import {scoringShadowPayloadHash} from './scoring-shadow.js';

const requireValue = value => { if (!value) throw new MobileApiError('MATCH_NOT_FOUND'); };
// Reuses the completed-history adapter's scorecard analytics. No scoring,
// segment-winner, award, handicap or net calculation is performed here.
export function historicalReviewerMatchData(view, fixture) {
  requireValue(view?.source === 'supabase' && view.year === fixture.year &&
    view.tournament?.id === fixture.tournamentId && view.revision?.revision_id === fixture.revisionId);
  const match=view.matches?.find(m=>m.id===fixture.matchId);
  requireValue(match?.lifecycle==='FINAL' && match.completionState==='LEGACY_FINAL' && match.scorecardCoverage==='COMPLETE');
  const cards=view.scorecardAnalytics?.scorecards?.filter(c=>c.matchId===fixture.matchId) || [];
  const expected=match.format==='BB'?4:2;
  requireValue(['SI','BB','SC'].includes(match.format) && cards.length===expected && cards.every(c=>
    c.completedHoleCount===18 && c.holes?.length===18 && c.holes.every((h,i)=>h.holeNumber===i+1 && Number.isInteger(h.score) && h.score>0 && h.score<=20)));
  const teams=[1,2].map(side=>{
    const team=view.tournament.teams.find(t=>t.sideNumber===side);
    const players=side===1?match.team1Players:match.team2Players;
    requireValue(team && players.length===(match.format==='SI'?1:2));
    return {side,teamId:team.id,name:team.name,playingHandicap:match.format==='SC'?(side===1?match.team1PlayingHcp:match.team2PlayingHcp):null,
      strokesReceived:match.format==='SC'?(side===1?match.team1Stroke:match.team2Stroke):null,
      participants:players.map(p=>({playerId:p.id,displayName:p.name,teamSide:side,isAuthenticatedPlayer:false,
        playingHandicap:p.playingHcp??null,strokesReceived:match.format==='SC'?null:p.stroke??null}))};
  });
  const holeSide=(side,index)=>{
    const team=teams[side-1];
    if(match.format==='SC') {
      const c=cards.find(c=>c.side===side);requireValue(c);
      return {side,scope:'team',playerScores:[],teamScore:{gross:c.holes[index].score,strokes:c.holes[index].strokesAllocated??null},netScore:c.holes[index].netScore??null};
    }
    const playerCards=team.participants.map(p=>cards.find(c=>c.playerId===p.playerId));requireValue(playerCards.every(Boolean));
    // Best-ball team net is not reconstructed from individual cards. It remains unavailable.
    return {side,scope:'players',playerScores:playerCards.map(c=>({playerId:c.playerId,gross:c.holes[index].score,strokes:c.holes[index].strokesAllocated??null})),
      teamScore:null,netScore:match.format==='SI'?playerCards[0].holes[index].netScore??null:null};
  };
  const course=view.tournament.courses.find(c=>c['Course ID']===match.course.id && c['Tee Played']===match.course.tee);
  requireValue(course && course.holeDefinitions?.length===18 && course.holeDefinitions.every((h,i)=>h.hole_number===i+1));
  const winner=match.matchupWinner==='Team 1'?1:match.matchupWinner==='Team 2'?2:null;
  const holes=cards[0].holes.map((h,i)=>({holeNumber:h.holeNumber,par:h.par??null,yardage:course.holeDefinitions[i].yardage??null,
    strokeIndex:h.strokeIndex??null,state:'historicalRecorded',official:false,winningSide:null,
    sideOne:holeSide(1,i),sideTwo:holeSide(2,i),resultLabel:null,runningResult:null,story:null,updatedAt:null}));
  return {historical:{...fixture,finality:'LEGACY_FINAL',teamOnePoints:match.team1Points??null,teamTwoPoints:match.team2Points??null},
    tournament:{tournamentId:fixture.tournamentId,name:view.tournament['Tournament Name'] || `${fixture.year} Bagger Invitational`,year:fixture.year,
      status:'FINAL',timeZone:view.tournament.timeZone,location:view.tournament.Destination||null},
    match:{matchId:fixture.matchId,displayMatchNumber:String(match.matchNumber),round:{roundNumber:match.round,name:`Round ${match.round}`,format:match.format,formatName:match.formatName},
      status:'completed',course:{courseId:match.course.id,name:match.course.name,tee:match.course.tee||null,yardage:course.Yardage??null,par:course.Par??null,rating:course.Rating??null,slope:course.Slope??null},teeTime:null,
      teams,authenticatedPlayer:{involved:false,teamSide:null,partnerPlayerIds:[],opponentPlayerIds:[]},
      progress:{currentHole:18,holesPlayed:18,holesRemaining:0,statusText:null},
      result:{summary:winner?teams[winner-1].name:match.finalResult,notation:null,winnerSide:winner,winnerTeamId:winner?teams[winner-1].teamId:null},
      navigation:{roundMatchIndex:1,roundMatchCount:1,previousMatchId:null,nextMatchId:null,myMatchId:null,isMyMatch:false},
      scorecard:{state:'historicalFinal',complete:true,confirmedAt:null,holes},flow:null,clinch:null,stats:null,freshness:{updatedAt:null,confirmedAt:null}}};
}

export async function mobileReviewerHistoryResult(identity,matchId,{env=process.env,now,dependencies={}}={}) {
  const fixture=identity.requestedHistoricalFixture;
  requireReviewerRead(identity.context,{surface:'match-detail',matchId,historicalFixture:fixture});
  const runtime=await requireMobileProductionReadContext(identity,{env,dependencies});
  const reader=dependencies.readReviewer || readCanonicalReviewer;
  const recheck=async()=>{
    const current=await reader({authUserId:identity.authUserId,tournamentId:identity.tournamentId},{env});
    requireValue(sameReviewerHistoricalFixture(current?.historicalFixture,fixture));
  };
  await recheck();
  const load=dependencies.loadCompletedHistoryView || (await import('./completed-history-service.js')).loadCompletedHistoryView;
  const loaded=await load({year:fixture.year,env});
  const data=historicalReviewerMatchData(loaded.view || loaded,fixture);
  await recheck();
  await requireMobileProductionReadContext(identity,{env,dependencies,expectedRuntime:runtime});
  const revision=scoringShadowPayloadHash({product:'mobile-review-history-v1',subject:identity.authUserId,data});
  return {status:200,revision,body:{ok:true,apiVersion:'v1',data,meta:{generatedAt:new Date(now||Date.now()).toISOString(),revision}}};
}
