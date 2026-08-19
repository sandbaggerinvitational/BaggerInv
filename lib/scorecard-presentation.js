function compactHole(hole = {}) {
  return {
    holeNumber: hole.holeNumber,
    score: hole.score,
    toPar: hole.toPar,
    strokesAllocated: hole.strokesAllocated,
    netScore: hole.netScore,
    netToPar: hole.netToPar,
  };
}

function compactNetTotals(netTotals) {
  if (!netTotals) return null;
  return {
    frontNine: netTotals.frontNine,
    backNine: netTotals.backNine,
    total: netTotals.total,
    toPar: netTotals.toPar,
  };
}

function compactMatchNetScoring(matchNetScoring) {
  if (!matchNetScoring) return null;
  return {
    available: matchNetScoring.available,
    rows: (matchNetScoring.rows || []).map((row) => ({
      side: row.side,
      name: row.name,
      label: row.label,
      available: row.available,
      holes: (row.holes || []).map(compactHole),
      netTotals: compactNetTotals(row.netTotals),
    })),
    holeWinners: (matchNetScoring.holeWinners || []).map((hole) => ({
      holeNumber: hole.holeNumber,
      winnerType: hole.winnerType,
      winnerName: hole.winnerName,
      abbreviation: hole.abbreviation,
    })),
    summary: matchNetScoring.summary ? {
      sideAWins: matchNetScoring.summary.sideAWins,
      sideBWins: matchNetScoring.summary.sideBWins,
      halved: matchNetScoring.summary.halved,
    } : null,
  };
}

/**
 * ScorecardTable is a client disclosure. Limit its RSC input to fields the
 * canonical table renders instead of serializing the full analytics model,
 * including repeated shared match projections, into every closed card.
 */
export function scorecardPresentationData(scorecards = []) {
  const sharedMatchNetScoring = scorecards.find((scorecard) => scorecard?.matchNetScoring)?.matchNetScoring;
  const sharedMatchNetScoringIndex = scorecards.findIndex((scorecard) =>
    scorecard?.status !== "MISSING" &&
    Number(scorecard?.completedHoleCount) > 0 &&
    (scorecard?.holes || []).some((hole) => hole?.score !== null && hole?.score !== undefined && hole?.score !== "")
  );

  return scorecards.map((scorecard, index) => ({
    matchId: scorecard.matchId,
    scoreType: scorecard.scoreType,
    status: scorecard.status,
    completedHoleCount: scorecard.completedHoleCount,
    courseName: scorecard.courseName,
    tee: scorecard.tee,
    side: scorecard.side,
    teamId: scorecard.teamId,
    teamName: scorecard.teamName,
    playerId: scorecard.playerId,
    playerName: scorecard.playerName,
    playerSlug: scorecard.playerSlug,
    participantNames: scorecard.participantNames,
    participantSlugs: scorecard.participantSlugs,
    frontNine: scorecard.frontNine,
    backNine: scorecard.backNine,
    total: scorecard.total,
    totalToPar: scorecard.totalToPar,
    strokesReceived: scorecard.strokesReceived,
    netAvailable: scorecard.netAvailable,
    netTotals: compactNetTotals(scorecard.netTotals),
    historySummary: scorecard.historySummary ? {
      strokesReceived: scorecard.historySummary.strokesReceived,
      netTotal: scorecard.historySummary.netTotal,
    } : null,
    holes: (scorecard.holes || []).map(compactHole),
    matchNetScoring: index === sharedMatchNetScoringIndex ? compactMatchNetScoring(sharedMatchNetScoring) : null,
  }));
}
