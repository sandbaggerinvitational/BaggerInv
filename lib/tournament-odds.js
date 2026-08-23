import { formatCode, pick } from "./prediction-engine.js";
import { currentTournamentYear, getTeamContext } from "./tournament-context.js";

export const ODDS_PHASES = ["Pre-Tournament", "After Round 1", "After Round 2", "Round 3 Pairings Announced", "Final Results"];
// The simulation seed is intentionally retained so the prospective contract
// correction does not change any Monte Carlo draws or business calculations.
export const ODDS_SIMULATION_SEED_VERSION = "odds-v2-nassau";
export const ODDS_LEGACY_ENGINE_VERSION = "tournament-odds.js:odds-v2-nassau";
export const ODDS_LEGACY_PUBLICATION_CONTRACT_VERSION = "odds-v2-nassau";
export const ODDS_ENGINE_VERSION = "tournament-odds.js:odds-v3-nassau-full-precision-rank";
export const ODDS_PUBLICATION_CONTRACT_VERSION = "odds-publication-v3-full-precision-rank";
export const ODDS_CALCULATION_CHECKPOINT_CONTRACT_VERSION = "odds-calculation-checkpoint-v1";
export const ODDS_SUPPORTED_ITERATION_COUNTS = [10_000, 25_000, 50_000, 100_000];
const num = (v, f = 0) => { const n = Number.parseFloat(String(v ?? "")); return Number.isFinite(n) ? n : f; };
const randomSeedState = (seed) => { let x = 2166136261; for (const c of seed) x = Math.imul(x ^ c.charCodeAt(0), 16777619); return x >>> 0; };
const resumableRandom = (seed, retainedState) => {
  let x = retainedState === undefined || retainedState === null ? randomSeedState(seed) : Number(retainedState) >>> 0;
  return {
    next: () => ((x = Math.imul(x ^ x >>> 15, 1 | x)) >>> 0) / 4294967296,
    state: () => x >>> 0,
  };
};
const shuffle = (values, random) => { const result=[...values]; for(let i=result.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[result[i],result[j]]=[result[j],result[i]];} return result; };
export function americanOdds(probability) { const p = probability / 100; if (p <= 0) return "+∞"; if (p >= 1) return "-∞"; return p > .5 ? String(Math.round(-100 * p / (1 - p))) : `+${Math.round(100 * (1 - p) / p)}`; }

export function rankPlayerOddsRows(rows = []) {
  return rows
    .map((row, sourceOrder) => ({ row, sourceOrder }))
    .sort((left, right) => Number(right.row.rawProbability) - Number(left.row.rawProbability) || left.sourceOrder - right.sourceOrder)
    .map(({ row }, index) => ({ ...row, rank: index + 1 }));
}

export function simulateNassauMatchPoints({ pointsAvailable, teamOneWinProbability, tieProbability, random }) {
  const segmentValue = pointsAvailable / 3;
  let teamOnePoints = 0;
  for (let segment = 0; segment < 3; segment++) {
    const draw = random();
    if (draw < teamOneWinProbability) teamOnePoints += segmentValue;
    else if (draw < teamOneWinProbability + tieProbability) teamOnePoints += segmentValue / 2;
  }
  return [teamOnePoints, pointsAvailable - teamOnePoints];
}

export function simulatedPlayerPointAllocations({ format, teamOneIds, teamTwoIds, teamOnePoints, teamTwoPoints }) {
  const allocate = (ids, points) => ids.map((id) => ({ id, points: format === "SI" ? points : points / ids.length }));
  return [allocate(teamOneIds, teamOnePoints), allocate(teamTwoIds, teamTwoPoints)];
}

export function validateOpeningMatchups(sheets, year = currentTournamentYear(sheets)) {
  const currentMatches = (sheets.matches || []).filter((match) => num(pick(match, "Year")) === Number(year));
  const teams = getTeamContext(sheets, Number(year));
  const worksheet = sheets.projectionMatchSource || "Matches";
  const tournamentRosterRows = (sheets.handicaps || []).filter((row) => num(pick(row, "Year")) === Number(year) && pick(row, "Player ID"));
  const tournamentPlayerIds = [...new Set(tournamentRosterRows.map((row) => pick(row, "Player ID")))];
  const unassignedPlayers = tournamentRosterRows
    .filter((row) => !["team 1", "team 2"].includes(String(pick(row, "Team Side")).trim().toLowerCase()))
    .map((row) => pick(row, "Player ID"));
  const roundReports = [1, 2].map((round) => {
    const matches = currentMatches.filter((match) => num(pick(match, "Round")) === round);
    const requiredPositions = matches.flatMap((match, index) => {
      const singles = formatCode(pick(match, "Format")) === "SI";
      const fields = ["Team 1 Player 1", "Team 2 Player 1", ...(singles ? [] : ["Team 1 Player 2", "Team 2 Player 2"])];
      return fields.filter((field) => !pick(match, field)).map((field) => ({
        worksheet,
        row: currentMatches.indexOf(match) + 2,
        match: pick(match, "Match", "Match Number", "Match ID") || index + 1,
        field,
      }));
    });
    const scheduled = (side) => matches.flatMap((match) => [pick(match, `Team ${side} Player 1`), pick(match, `Team ${side} Player 2`)]).filter(Boolean);
    const roster = (side) => (side === 1 ? teams.team1.players : teams.team2.players).map((player) => player.id).sort();
    const scheduledOne = scheduled(1), scheduledTwo = scheduled(2);
    const duplicates = (values) => [...new Set(values.filter((value, index) => values.indexOf(value) !== index))];
    const missing = (scheduledValues, rosterValues) => rosterValues.filter((id) => !scheduledValues.includes(id));
    const unexpected = (scheduledValues, rosterValues) => scheduledValues.filter((id) => !rosterValues.includes(id));
    const expectedPlayers = tournamentPlayerIds.length;
    const actualPlayers = scheduledOne.length + scheduledTwo.length;
    const playersPerMatch = matches.some((match) => formatCode(pick(match, "Format")) === "SI") ? 2 : 4;
    const expectedMatches = playersPerMatch ? expectedPlayers / playersPerMatch : 0;
    const missingPlayers = [...missing(scheduledOne, roster(1)), ...missing(scheduledTwo, roster(2))];
    const duplicatePlayers = [...duplicates(scheduledOne), ...duplicates(scheduledTwo)];
    const missingTeamAssignments = [...new Set([...unassignedPlayers, ...unexpected(scheduledOne, roster(1)), ...unexpected(scheduledTwo, roster(2))])];
    const ready = matches.length > 0 && Number.isInteger(expectedMatches) && matches.length === expectedMatches && !requiredPositions.length && !missingPlayers.length && !duplicatePlayers.length && !missingTeamAssignments.length;
    const reason = ready
      ? `All ${expectedMatches} matches contain each of the ${expectedPlayers} assigned players exactly once.`
      : requiredPositions.length
        ? `${requiredPositions.length} required player position${requiredPositions.length === 1 ? " is" : "s are"} blank.`
        : missingTeamAssignments.length
          ? `${missingTeamAssignments.length} player${missingTeamAssignments.length === 1 ? " has" : "s have"} a missing or conflicting team assignment.`
          : missingPlayers.length
            ? `${missingPlayers.length} assigned player${missingPlayers.length === 1 ? " is" : "s are"} missing from the round.`
            : duplicatePlayers.length
              ? `${duplicatePlayers.length} player${duplicatePlayers.length === 1 ? " appears" : "s appear"} more than once.`
              : `Expected ${expectedMatches} matches and ${expectedPlayers} player positions; found ${matches.length} matches and ${actualPlayers} player positions.`;
    return {
      round,
      status: ready ? "PASS" : "FAIL",
      ready,
      reason,
      worksheet,
      expectedPlayerCount: expectedPlayers,
      actualPlayerCount: actualPlayers,
      expectedMatchCount: expectedMatches,
      actualMatchCount: matches.length,
      missingPlayers,
      duplicatePlayers,
      missingMatches: Math.max(0, expectedMatches - matches.length),
      missingTeamAssignments,
      missingRequiredPositions: requiredPositions,
    };
  });
  const firstFailedRound = roundReports.find((report) => !report.ready);
  let firstFailure = null;
  if (firstFailedRound) {
    const position = firstFailedRound.missingRequiredPositions[0];
    if (position) firstFailure = `${position.worksheet} row ${position.row}, Match ${position.match}: ${position.field} is blank.`;
    else if (firstFailedRound.missingTeamAssignments[0]) firstFailure = `Round ${firstFailedRound.round}: player ${firstFailedRound.missingTeamAssignments[0]} has a missing or conflicting team assignment in Handicaps.`;
    else if (firstFailedRound.missingPlayers[0]) firstFailure = `Round ${firstFailedRound.round}: player ${firstFailedRound.missingPlayers[0]} is missing from ${firstFailedRound.worksheet}.`;
    else if (firstFailedRound.duplicatePlayers[0]) firstFailure = `Round ${firstFailedRound.round}: player ${firstFailedRound.duplicatePlayers[0]} appears more than once in ${firstFailedRound.worksheet}.`;
    else firstFailure = `Round ${firstFailedRound.round}: expected ${firstFailedRound.expectedMatchCount} matches and ${firstFailedRound.expectedPlayerCount} player positions, but found ${firstFailedRound.actualMatchCount} matches and ${firstFailedRound.actualPlayerCount} player positions in ${firstFailedRound.worksheet}.`;
  }
  return {
    ready: !firstFailedRound,
    missingRounds: roundReports.filter((report) => !report.ready).map((report) => report.round),
    roundReports,
    firstFailure,
    message: firstFailedRound ? "Tournament odds will display once the Round 1 and Round 2 matchups have been set." : "Round 1 and Round 2 pairing prerequisites passed.",
  };
}

export function validateRoundThreePairings(sheets, year = currentTournamentYear(sheets)) {
  const teams=getTeamContext(sheets,Number(year));
  const matches=(sheets.matches||[]).filter((m)=>num(pick(m,"Year"))===Number(year)&&num(pick(m,"Round"))===3);
  const side=(n)=>matches.map((m)=>pick(m,`Team ${n} Player 1`)).filter(Boolean).sort();
  const roster=(n)=>(n===1?teams.team1.players:teams.team2.players).map((p)=>p.id).sort();
  const ready=JSON.stringify(side(1))===JSON.stringify(roster(1))&&JSON.stringify(side(2))===JSON.stringify(roster(2));
  return {ready,message:"Round 3 odds cannot be published until all official Singles pairings have been entered."};
}

function prepareTournamentOddsExecution({ sheets, historical = {}, phase = "Pre-Tournament", iterations = 10_000, contractVersion = ODDS_PUBLICATION_CONTRACT_VERSION }) {
  if (![ODDS_LEGACY_PUBLICATION_CONTRACT_VERSION, ODDS_PUBLICATION_CONTRACT_VERSION].includes(contractVersion)) throw new Error(`Unsupported Odds publication contract: ${contractVersion}`);
  const totalIterations = Number(iterations);
  if (!Number.isSafeInteger(totalIterations) || totalIterations <= 0) throw new Error("Tournament simulation requires a positive integer iteration count.");
  const year = currentTournamentYear(sheets), teams = getTeamContext(sheets, year), deterministicSeed = `${year}|${phase}|${ODDS_SIMULATION_SEED_VERSION}`;
  const roster = [...teams.team1.players.map((p) => ({ ...p, side: 1 })), ...teams.team2.players.map((p) => ({ ...p, side: 2 }))];
  const names = Object.fromEntries(roster.map((p) => [p.id, p.name]));
  const matches = (sheets.matches || []).filter((m) => num(pick(m, "Year")) === year);
  const rules=(sheets.tournamentRules||[]).filter((r)=>num(pick(r,"Year"))===year);
  const pointsForRound=(round)=>num(pick(rules.find((r)=>num(String(pick(r,"Round")).replace(/\D/g,""))===round),"Points Available"),3);
  const openingMatches=matches.filter((m)=>[1,2].includes(num(pick(m,"Round"))));
  const officialRoundThree=matches.filter((m)=>num(pick(m,"Round"))===3&&pick(m,"Team 1 Player 1")&&pick(m,"Team 2 Player 1"));
  const useOfficialRoundThree=["Round 3 Pairings Announced","Final Results"].includes(phase);
  const totalPointsAvailable=openingMatches.reduce((sum,m)=>sum+pointsForRound(num(pick(m,"Round"))),0)+teams.team1.players.length*pointsForRound(3);
  const completedThrough = phase === "Pre-Tournament" ? 0 : phase === "After Round 1" ? 1 : phase === "After Round 2" || phase === "Round 3 Pairings Announced" || phase === "Final Results" ? 2 : 0;
  const strength = (id,code) => { const ratings=historical[id]?.sandbaggerRatings||{};const overall=ratings.OVERALL?.rating||1500;const specific=ratings[code];const reliability=Math.min(1,(specific?.matches||0)/6);const blended=overall+reliability*((specific?.rating||overall)-overall);return 1/(1+Math.pow(10,(1500-blended)/400)); };
  const idsFor = (m, side) => [pick(m, `Team ${side} Player 1`), pick(m, `Team ${side} Player 2`)].filter(Boolean);
  return { year, phase, contractVersion, iterations: totalIterations, teams, deterministicSeed, roster, names,
    openingMatches, officialRoundThree, useOfficialRoundThree, totalPointsAvailable, completedThrough,
    pointsForRound, strength, idsFor };
}

function initialTournamentOddsCheckpoint(context) {
  return {
    checkpointContractVersion: ODDS_CALCULATION_CHECKPOINT_CONTRACT_VERSION,
    deterministicSeed: context.deterministicSeed,
    totalIterations: context.iterations,
    completedIterations: 0,
    randomState: randomSeedState(context.deterministicSeed),
    rosterOrder: context.roster.map((player) => player.id),
    team: { 1: { wins: 0, points: 0 }, 2: { wins: 0, points: 0 } },
    player: Object.fromEntries(context.roster.map((player) => [player.id, { top: 0, points: 0, wins: 0, losses: 0, halves: 0, finish: 0 }])),
  };
}

function validatedTournamentOddsCheckpoint(context, checkpoint) {
  const retained = checkpoint || initialTournamentOddsCheckpoint(context);
  if (retained.checkpointContractVersion !== ODDS_CALCULATION_CHECKPOINT_CONTRACT_VERSION ||
      retained.deterministicSeed !== context.deterministicSeed || Number(retained.totalIterations) !== context.iterations ||
      JSON.stringify(retained.rosterOrder || []) !== JSON.stringify(context.roster.map((player) => player.id))) {
    throw new Error("Tournament Odds checkpoint does not match the frozen calculation invocation.");
  }
  const completedIterations = Number(retained.completedIterations);
  if (!Number.isSafeInteger(completedIterations) || completedIterations < 0 || completedIterations > context.iterations) throw new Error("Tournament Odds checkpoint progress is invalid.");
  if (!Number.isSafeInteger(Number(retained.randomState)) || Number(retained.randomState) < 0 || Number(retained.randomState) > 0xffffffff) throw new Error("Tournament Odds checkpoint random state is invalid.");
  const player = Object.fromEntries(context.roster.map(({ id }) => {
    const row = retained.player?.[id];
    if (!row) throw new Error(`Tournament Odds checkpoint is missing player ${id}.`);
    return [id, { top: Number(row.top), points: Number(row.points), wins: Number(row.wins), losses: Number(row.losses), halves: Number(row.halves), finish: Number(row.finish) }];
  }));
  return { ...retained, completedIterations, randomState: Number(retained.randomState) >>> 0,
    team: { 1: { wins: Number(retained.team?.[1]?.wins), points: Number(retained.team?.[1]?.points) },
      2: { wins: Number(retained.team?.[2]?.wins), points: Number(retained.team?.[2]?.points) } }, player };
}

export function createTournamentOddsCheckpoint(input = {}) {
  return initialTournamentOddsCheckpoint(prepareTournamentOddsExecution(input));
}

export function executeTournamentOddsChunk({ checkpoint = null, chunkIterations, ...input } = {}) {
  const context = prepareTournamentOddsExecution(input);
  const retained = validatedTournamentOddsCheckpoint(context, checkpoint);
  const requestedChunk = chunkIterations === undefined ? context.iterations : Number(chunkIterations);
  if (!Number.isSafeInteger(requestedChunk) || requestedChunk <= 0) throw new Error("Tournament Odds chunk size must be a positive integer.");
  const finalIteration = Math.min(context.iterations, retained.completedIterations + requestedChunk);
  const randomStream = resumableRandom(context.deterministicSeed, retained.randomState);
  const random = randomStream.next;
  const player = retained.player;
  const team = retained.team;
  const { roster, openingMatches, officialRoundThree, useOfficialRoundThree, totalPointsAvailable,
    completedThrough, pointsForRound, strength, idsFor, year } = context;
  for (let run = retained.completedIterations; run < finalIteration; run++) {
    const totals = Object.fromEntries(roster.map((p) => [p.id, 0])), records = Object.fromEntries(roster.map((p) => [p.id, [0, 0, 0]])); let team1 = 0, team2 = 0;
    const a = shuffle(roster.filter((p) => p.side === 1),random), b = shuffle(roster.filter((p) => p.side === 2),random);
    const projectedRoundThree=a.map((p,i)=>({Year:year,Round:3,Format:"SI","Team 1 Player 1":p.id,"Team 2 Player 1":b[i]?.id}));
    const runMatches=[...openingMatches,...(useOfficialRoundThree?officialRoundThree:projectedRoundThree)];
    for (const m of runMatches) {
      const round = num(pick(m, "Round")), a = idsFor(m, 1), b = idsFor(m, 2); if (!a.length || !b.length) continue;
      const code = formatCode(pick(m, "Format")), max = pointsForRound(round);
      let outcome, p1, p2;
      const actual1 = num(pick(m, "Team 1 Points"), NaN), actual2 = num(pick(m, "Team 2 Points"), NaN);
      const useActual = (round <= completedThrough || context.phase === "Final Results") && Number.isFinite(actual1) && Number.isFinite(actual2);
      if (useActual) { p1 = actual1; p2 = actual2; outcome = p1 === p2 ? 0 : p1 > p2 ? 1 : 2; }
      else { const sa = a.reduce((s, id) => s + strength(id,code), 0) / a.length, sb = b.reduce((s, id) => s + strength(id,code), 0) / b.length; const tie = code === "SI" ? .11 : .09; const pa = (1 - tie) * (.5 + Math.max(-.3, Math.min(.3, (sa - sb) * .7))); [p1,p2] = simulateNassauMatchPoints({ pointsAvailable:max, teamOneWinProbability:pa, tieProbability:tie, random }); outcome = p1 === p2 ? 0 : p1 > p2 ? 1 : 2; }
      team1 += p1; team2 += p2; const allocations = simulatedPlayerPointAllocations({ format:code, teamOneIds:a, teamTwoIds:b, teamOnePoints:p1, teamTwoPoints:p2 }); for (const [sideAllocations, side] of [[allocations[0],1],[allocations[1],2]]) for (const allocation of sideAllocations) { totals[allocation.id] += allocation.points; records[allocation.id][outcome === 0 ? 2 : outcome === side ? 0 : 1]++; }
    }
    if(Math.abs(team1+team2-totalPointsAvailable)>.001) throw new Error(`Tournament simulation produced ${team1+team2} of ${totalPointsAvailable} configured points.`);
    team[1].points += team1; team[2].points += team2; if (team1 > team2) team[1].wins++; else if (team2 > team1) team[2].wins++; else { team[1].wins += .5; team[2].wins += .5; }
    const high = Math.max(...Object.values(totals)); const leaders = Object.keys(totals).filter((id) => totals[id] === high); const championshipCredit = 1 / leaders.length; const ordered = [...new Set(Object.values(totals))].sort((a,b)=>b-a);
    for (const id of Object.keys(totals)) { const row = player[id]; if (totals[id] === high) row.top += championshipCredit; row.points += totals[id]; row.finish += ordered.indexOf(totals[id]) + 1; row.wins += records[id][0]; row.losses += records[id][1]; row.halves += records[id][2]; }
  }
  return { ...retained, completedIterations: finalIteration, randomState: randomStream.state(), team, player };
}

export function finalizeTournamentOddsExecution({ checkpoint, publishedAt, ...input } = {}) {
  const context = prepareTournamentOddsExecution(input);
  const retained = validatedTournamentOddsCheckpoint(context, checkpoint);
  if (retained.completedIterations !== context.iterations) throw new Error("Tournament Odds calculation is incomplete.");
  const { year, phase, contractVersion, iterations, teams, deterministicSeed, roster, names, totalPointsAvailable } = context;
  const { player, team } = retained;
  const rawTeamRows = [1,2].map((side) => { const rawProbability = team[side].wins / iterations * 100; return { side, name: side === 1 ? teams.team1.name : teams.team2.name, rawProbability, probability:+rawProbability.toFixed(1), americanOdds:americanOdds(rawProbability), expectedPoints:+(team[side].points/iterations).toFixed(2) }; });
  const rawPlayerRows = roster.map((p) => { const r=player[p.id], rawProbability=r.top/iterations*100; return { id:p.id, name:names[p.id], teamSide:p.side, rawProbability, probability:+rawProbability.toFixed(1), americanOdds:americanOdds(rawProbability), expectedPoints:+(r.points/iterations).toFixed(2), expectedRecord:`${(r.wins/iterations).toFixed(1)}-${(r.losses/iterations).toFixed(1)}-${(r.halves/iterations).toFixed(1)}`, averageFinish:+(r.finish/iterations).toFixed(1) }; });
  const resolvedPublishedAt = publishedAt ? String(publishedAt) : new Date().toISOString();
  if (contractVersion === ODDS_LEGACY_PUBLICATION_CONTRACT_VERSION) {
    const teams = rawTeamRows.map(({ rawProbability: _rawProbability, ...row }) => row);
    const players = rawPlayerRows.map(({ rawProbability: _rawProbability, ...row }, sourceOrder) => ({ row, sourceOrder }))
      .sort((left, right) => right.row.probability - left.row.probability || left.sourceOrder - right.sourceOrder).map(({ row }) => row);
    return { year, phase, phaseOrder:ODDS_PHASES.indexOf(phase), publishedAt:resolvedPublishedAt, iterations, totalPointsAvailable, teams, players };
  }
  const teamRows = rawTeamRows;
  const playerRows = rankPlayerOddsRows(rawPlayerRows);
  return { year, phase, phaseOrder:ODDS_PHASES.indexOf(phase), publishedAt:resolvedPublishedAt, iterations, totalPointsAvailable,
    engineVersion:ODDS_ENGINE_VERSION, publicationContractVersion:ODDS_PUBLICATION_CONTRACT_VERSION, deterministicSeed,
    teams:teamRows, players:playerRows };
}

export function simulateTournamentOdds({ publishedAt, ...input }) {
  const checkpoint = executeTournamentOddsChunk({ ...input, chunkIterations: Number(input.iterations ?? 10_000) });
  return finalizeTournamentOddsExecution({ ...input, checkpoint, publishedAt });
}
