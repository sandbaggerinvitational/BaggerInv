const requireValue = v => { if (!v) throw new Error('Published Net Skins detail binding is invalid.'); };
const key = ids => [...ids].sort().join('|');
const formats = {BB:'Best Ball',SC:'Scramble',SI:'Singles'};

// Project stored official outcomes and frozen Full Net cells. Never determine
// low scores, calculate strokes, decide winners, or divide a payout here.
export function productionNetSkinsPresentation(view, contract, viewerPlayerId) {
  const rounds=[];let tournamentName;
  for (const round of contract.rounds) {
    if (round.state !== 'OFFICIAL') continue;
    const raw=view.rounds.find(r=>r.round_id===round.roundId)?.result_payload;
    if (!raw?.participantLabels || raw.calculationPolicy!=='production-full-course-handicap-v1' || !Array.isArray(raw.fullNetDetail)) return null;
    const labels=raw.participantLabels;
    requireValue(typeof labels.tournamentName==='string' && labels.tournamentName && (!tournamentName || tournamentName===labels.tournamentName));
    tournamentName=labels.tournamentName;
    const official=round.officialResults;
    requireValue(official && Array.isArray(labels.entries) && labels.entries.length===round.entries.length && raw.fullNetDetail.length===round.entries.length);
    const entries=round.entries.map(e=>{
      const found=labels.entries.filter(l=>l.entryId===e.entryId && l.matchId===e.matchId);
      requireValue(found.length===1 && key(found[0].players.map(p=>p.playerId))===key(e.playerIds));
      const l=found[0];
      return {entryId:l.entryId,matchId:l.matchId,players:l.players.map(p=>({playerId:p.playerId,name:p.name})),
        team:{teamId:l.team.teamId,name:l.team.name},course:{courseId:l.course.courseId,name:l.course.name??null,tee:l.course.tee}};
    });
    const holes=Array.from({length:18},(_,i)=>{
      const hole=i+1;
      const participants=round.entries.map(e=>{
        const details=raw.fullNetDetail.filter(d=>d.entryId===e.entryId && d.matchId===e.matchId && key(d.playerIds)===key(e.playerIds));
        const leaders=raw.leaderboard.filter(l=>key(l.playerIds)===key(e.playerIds));
        requireValue(details.length===1 && leaders.length===1 && details[0].official===true && details[0].authorityAvailable===true);
        const cells=details[0].holes.filter(h=>h.hole===hole), outcomes=leaders[0].holeResults.filter(h=>h.hole===hole);
        requireValue(cells.length===1 && outcomes.length===1);
        const c=cells[0],o=outcomes[0];
        requireValue(Number.isInteger(c.fullCourseHandicapStrokes) && Number.isInteger(c.par) && Number.isInteger(c.gross) && Number.isInteger(c.fullNet) &&
          o.gross===c.gross && o.net===c.fullNet && o.par===c.par && typeof o.wonSkin==='boolean' && typeof o.tiedLow==='boolean' && !(o.wonSkin && o.tiedLow));
        return {entryId:e.entryId,par:c.par,gross:c.gross,fullCourseHandicapStrokes:c.fullCourseHandicapStrokes,fullNet:c.fullNet,
          outcome:o.wonSkin?'won':o.tiedLow?'tiedLow':'noSkin'};
      });
      const wins=participants.filter(p=>p.outcome==='won'),ties=participants.filter(p=>p.outcome==='tiedLow');
      const skins=official.skins.filter(s=>s.holeNumber===hole);
      requireValue(wins.length<=1 && (wins.length===1 ? skins.length===1 && skins[0].winnerEntryId===wins[0].entryId && ties.length===0 : skins.length===0 && ties.length>=2));
      return {hole,par:participants.every(p=>p.par===participants[0]?.par)?participants[0].par:null,
        state:wins.length?'won':'tied',winnerEntryId:wins[0]?.entryId??null,tiedEntryIds:ties.map(p=>p.entryId),
        winningFullNet:skins[0]?.winningNetScore??null,qaPayout:skins[0]?.skinValue??null,participants};
    });
    rounds.push({round:round.roundNumber,format:round.format,formatDisplayName:formats[round.format],scope:round.format==='SC'?'TEAM':'PLAYER',
      scoringBasis:round.format==='SC'?'TEAM_FULL_NET':'INDIVIDUAL_FULL_NET',course:null,publicationState:'PUBLISHED',readiness:'CALCULATED',allMatchesOfficial:true,
      eligibleCount:round.eligibleEntryCount,pot:official.pot,skinsAwarded:official.skinsAwarded,skinValue:official.skinValue,entries,
      winners:official.leaderboard.filter(e=>e.skinsWon>0).map(e=>({entryId:e.entryId,skinsWon:e.skinsWon,qaPayout:e.totalWinnings,winningHoles:e.winningHoleNumbers})),holes});
  }
  if (!rounds.length) return null;
  return {contractVersion:'production-net-skins-presentation-v1',policy:'production-full-course-handicap-v1',purpose:'CANONICAL_PUBLISHED_PARTICIPANT_RESULT',published:true,
    tournament:{tournamentId:contract.tournamentId,name:tournamentName},playerId:viewerPlayerId,revisionId:contract.revision,authorityFingerprint:contract.configurationFingerprint,rounds};
}
