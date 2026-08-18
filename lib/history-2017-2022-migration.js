const FIRST_YEAR = 2017;
const LAST_YEAR = 2022;

const clean = (value) => String(value ?? "").trim();

function finiteHalfPoint(value) {
  if (value === null || value === undefined || clean(value) === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) && Number.isInteger(numeric * 2)
    ? numeric
    : null;
}

function field(row, ...names) {
  const name = names.find((candidate) =>
    Object.prototype.hasOwnProperty.call(row || {}, candidate)
  );
  return name ? row[name] : null;
}

function tournamentTeamSide(team) {
  const match = clean(team?.side ?? team?.["Team Side"]).match(/(?:team\s*)?([12])$/i);
  return match ? Number(match[1]) : null;
}

function displayPoint(value) {
  return Number.isInteger(value) ? String(value) : String(value);
}

function parsedStoredFinal(value) {
  const parts = clean(value).split(/\s*[-–—]\s*/);
  if (parts.length !== 2) return null;
  const scores = parts.map(finiteHalfPoint);
  return scores.every((score) => score !== null) ? scores : null;
}

export function isStep3CCompletedHistoryYear(value) {
  const year = Number(value);
  return Number.isInteger(year) && year >= FIRST_YEAR && year <= LAST_YEAR;
}

/**
 * Audits the canonical point population for one Step 3C year. A tournament
 * total is supported only when every canonical match has a stable identity,
 * an official result, and exact half-point allocations for both sides.
 */
export function auditStep3CTournamentPoints({ year, matches = [], tournament = null } = {}) {
  const targetYear = Number(year ?? tournament?.year ?? tournament?.Year);
  const rows = matches
    .filter((match) => Number(field(match, "Year", "year")) === targetYear)
    .map((match) => ({
      id: clean(field(match, "Match ID", "matchId", "id")),
      round: Number(field(match, "Round", "round")),
      match: Number(field(match, "Match", "match", "matchNumber")),
      result: clean(field(match, "Matchup Winner", "matchupWinner", "18-Hole Winner", "overallWinner")),
      team1Points: finiteHalfPoint(field(match, "Team 1 Points", "team1Points")),
      team2Points: finiteHalfPoint(field(match, "Team 2 Points", "team2Points")),
    }))
    .sort((left, right) => left.round - right.round || left.match - right.match);

  const uniqueIds = new Set(rows.map((row) => row.id).filter(Boolean));
  const completePointRows = rows.filter((row) =>
    row.team1Points !== null && row.team2Points !== null
  );
  const complete = rows.length > 0 &&
    uniqueIds.size === rows.length &&
    completePointRows.length === rows.length &&
    rows.every((row) => row.result);
  const team1Points = complete
    ? rows.reduce((total, row) => total + row.team1Points, 0)
    : null;
  const team2Points = complete
    ? rows.reduce((total, row) => total + row.team2Points, 0)
    : null;
  const rounds = [...new Set(rows.map((row) => row.round))]
    .filter(Number.isFinite)
    .sort((left, right) => left - right)
    .map((round) => {
      const roundRows = rows.filter((row) => row.round === round);
      const roundComplete = roundRows.length > 0 && roundRows.every((row) =>
        row.team1Points !== null && row.team2Points !== null && row.result
      );
      return {
        round,
        matches: roundRows.length,
        complete: roundComplete,
        team1Points: roundComplete
          ? roundRows.reduce((total, row) => total + row.team1Points, 0)
          : null,
        team2Points: roundComplete
          ? roundRows.reduce((total, row) => total + row.team2Points, 0)
          : null,
      };
    });

  const championSide = tournamentTeamSide(tournament?.championTeam);
  const runnerUpSide = tournamentTeamSide(tournament?.runnerUpTeam);
  const identityComplete = [1, 2].includes(championSide) &&
    [1, 2].includes(runnerUpSide) && championSide !== runnerUpSide;
  const pointsForSide = (side) => side === 1 ? team1Points : team2Points;
  const matchDerivedFinal = complete && identityComplete
    ? [pointsForSide(championSide), pointsForSide(runnerUpSide)]
    : null;
  const storedFinal = parsedStoredFinal(tournament?.["Final Score"]);

  return {
    year: targetYear,
    rows,
    rounds,
    matches: rows.length,
    completePointAllocations: completePointRows.length,
    partialPointAllocations: rows.filter((row) =>
      (row.team1Points === null) !== (row.team2Points === null)
    ).length,
    noPointAllocations: rows.filter((row) =>
      row.team1Points === null && row.team2Points === null
    ).length,
    complete,
    team1Points,
    team2Points,
    championSide,
    runnerUpSide,
    matchDerivedFinal,
    storedFinal,
    storedFinalReconciles: storedFinal && matchDerivedFinal
      ? storedFinal.every((score, index) => score === matchDerivedFinal[index])
      : null,
  };
}

/**
 * Projects a participant-facing Final from the complete canonical match-point
 * population. Source rows remain untouched and incomplete evidence fails
 * closed to the source tournament summary.
 */
export function projectStep3CTournamentFinal({ year, tournament, matches = [] } = {}) {
  const audit = auditStep3CTournamentPoints({ year, tournament, matches });
  if (!audit.complete || !audit.matchDerivedFinal) {
    return { tournament, audit, applied: false };
  }
  const finalScore = audit.matchDerivedFinal.map(displayPoint).join(" - ");
  return {
    tournament: { ...tournament, "Final Score": finalScore },
    audit,
    applied: true,
    finalScore,
  };
}
