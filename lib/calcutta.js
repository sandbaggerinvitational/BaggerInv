const clean = (value) => String(value ?? "").trim();

function numeric(value) {
  const parsed = Number.parseFloat(clean(value).replace(/[$,%]/g, "").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function fraction(value) {
  const raw = clean(value);
  const parsed = numeric(raw);
  if (!parsed) return 0;
  return raw.includes("%") || parsed > 1 ? parsed / 100 : parsed;
}

// Calcutta Payout stores percentage points (for example, 1.25 means 1.25%).
// A value already formatted with % has the same meaning.
function payoutFraction(value) {
  const raw = clean(value);
  const parsed = numeric(raw);
  return parsed ? parsed / 100 : 0;
}

const yearRows = (rows, year) => (rows || []).filter((row) => Number(row.Year) === Number(year));
const roundNumber = (value) => Number(clean(value).match(/\d+/)?.[0]);
const rankValue = (value) => Number(clean(value).match(/\d+/)?.[0]);

export const CALCUTTA_FULL_COURSE_HANDICAP_POLICY = "calcutta-bb-si-full-course-handicap-v1";
const CALCUTTA_INDIVIDUAL_FORMATS = new Set(["BB", "SI"]);

function finiteNumber(value) {
  if (value === null || value === undefined || clean(value) === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

// PostgreSQL numeric round(numeric, 0) rounds halves away from zero. Keep this
// helper Calcutta-specific so the canonical match-play allocation is unchanged.
export function roundCalcuttaCourseHandicap(value) {
  const parsed = finiteNumber(value);
  if (parsed === null) return null;
  const roundedMagnitude = Math.floor(Math.abs(parsed) + 0.5);
  if (roundedMagnitude === 0) return 0;
  return parsed < 0 ? -roundedMagnitude : roundedMagnitude;
}

// Full-course-handicap Calcutta scoring is signed. Positive values receive
// strokes from SI 1 upward; negative values give strokes back from SI 18
// downward. Both directions repeat complete 18-hole cycles.
export function getCalcuttaSignedStrokesOnHole(totalStrokes, strokeIndex) {
  const total = Number(totalStrokes);
  const index = Number(strokeIndex);
  if (!Number.isInteger(total) || !Number.isInteger(index) || index < 1 || index > 18 || total === 0) return 0;
  const direction = total > 0 ? 1 : -1;
  const magnitude = Math.abs(total);
  const completeCycles = Math.floor(magnitude / 18);
  const remaining = magnitude % 18;
  const receivesRemainder = direction > 0
    ? index <= remaining
    : index > 18 - remaining;
  const allocated = completeCycles + (remaining > 0 && receivesRemainder ? 1 : 0);
  return allocated === 0 ? 0 : direction * allocated;
}

function calcuttaContextError(message) {
  return Object.assign(new Error(message), { code: "CALCUTTA_FROZEN_SCORING_CONTEXT_REQUIRED" });
}

function grossScores(value) {
  if (Array.isArray(value)) return value.map(finiteNumber);
  const source = clean(value);
  if (!source) return [];
  try {
    const parsed = JSON.parse(source);
    if (Array.isArray(parsed)) return parsed.map(finiteNumber);
  } catch {
    // Retained compatibility values can be delimiter-separated rather than JSON.
  }
  return source.split(/[,/|]/).map((item) => finiteNumber(item));
}

function formatCode(value) {
  const format = clean(value).toUpperCase();
  if (format === "BEST BALL" || format === "BESTBALL") return "BB";
  if (format === "SINGLES" || format === "SINGLE") return "SI";
  if (format === "SCRAMBLE") return "SC";
  return format;
}

function completedRoundNumbers(rounds = []) {
  return new Set(rounds.filter((round) => {
    if (clean(round.status).toUpperCase() === "FINAL") return true;
    return Array.isArray(round.matches) && round.matches.length > 0
      && round.matches.every((match) => ["final", "finalized", "complete", "completed"].includes(clean(match.status).toLowerCase()));
  }).map((round) => roundNumber(round.number ?? round.round ?? round.round_number)));
}

/**
 * Derive BB/SI Calcutta results from immutable match materialization rather
 * than the matchup-relative leaderboard net. Scramble deliberately stays on
 * its existing canonical team gross/net path.
 */
export function calcuttaRoundResultsFromFrozenScoringContext({ year, rounds = [], matches = [] } = {}) {
  const completedRounds = completedRoundNumbers(rounds);
  const results = [];
  const seen = new Set();
  for (const entry of matches) {
    const match = entry?.match || {};
    const round = Number(match.round_number ?? match.round
      ?? clean(match.match_id).match(/-R(\d+)-/)?.[1]);
    const format = formatCode(match.format ?? entry?.round?.format);
    if (!completedRounds.has(round) || !CALCUTTA_INDIVIDUAL_FORMATS.has(format)) continue;
    if (!clean(entry?.snapshot?.snapshot_id) || !clean(entry?.snapshot?.canonical_hash)) {
      throw calcuttaContextError(`Completed ${format} Match ${clean(match.match_id)} has no frozen scoring snapshot.`);
    }
    const holes = [...(entry.holes || [])].sort((left, right) => Number(left.hole_number) - Number(right.hole_number));
    const scores = new Map((entry.scores || []).map((score) => [Number(score.hole_number), score]));
    if (holes.length !== 18 || new Set(holes.map((hole) => Number(hole.hole_number))).size !== 18
        || new Set(holes.map((hole) => Number(hole.stroke_index))).size !== 18 || scores.size !== 18) {
      throw calcuttaContextError(`Completed ${format} Match ${clean(match.match_id)} does not contain a complete frozen scorecard.`);
    }
    const participants = [...(entry.participants || [])].sort((left, right) =>
      Number(left.team_side) - Number(right.team_side) || Number(left.player_slot) - Number(right.player_slot));
    const expectedParticipants = format === "BB" ? 4 : 2;
    const participantSlots = new Set(participants.map((participant) =>
      `${Number(participant.team_side)}:${Number(participant.player_slot)}`));
    if (participants.length !== expectedParticipants || participantSlots.size !== expectedParticipants
        || participants.some((participant) => ![1, 2].includes(Number(participant.team_side))
          || Number(participant.player_slot) < 1 || Number(participant.player_slot) > (format === "BB" ? 2 : 1))) {
      throw calcuttaContextError(`Completed ${format} Match ${clean(match.match_id)} has incomplete frozen participants.`);
    }
    for (const participant of participants) {
      const playerId = clean(participant.player_id);
      const resultKey = `${round}:${playerId}`;
      const fullCourseHandicap = roundCalcuttaCourseHandicap(participant.course_handicap);
      if (!playerId || seen.has(resultKey) || fullCourseHandicap === null) {
        throw calcuttaContextError(`Completed ${format} Match ${clean(match.match_id)} has an invalid frozen Player handicap context.`);
      }
      let grossTotal = 0;
      let netTotal = 0;
      for (const hole of holes) {
        const holeNumber = Number(hole.hole_number);
        const strokeIndex = Number(hole.stroke_index);
        const score = scores.get(holeNumber);
        const sideScores = grossScores(score?.[`team_${Number(participant.team_side)}_gross_scores`]);
        const gross = sideScores[Number(participant.player_slot) - 1];
        if (!Number.isInteger(strokeIndex) || strokeIndex < 1 || strokeIndex > 18 || gross === null || gross === undefined) {
          throw calcuttaContextError(`Completed ${format} Match ${clean(match.match_id)} has incomplete frozen hole attribution.`);
        }
        const signedStroke = getCalcuttaSignedStrokesOnHole(fullCourseHandicap, strokeIndex);
        grossTotal += gross;
        netTotal += gross - signedStroke;
      }
      seen.add(resultKey);
      results.push({
        Year: Number(year), Round: round, Format: format, "Player IDs": playerId,
        "Gross Score": grossTotal, "Net Score": netTotal,
        "Full Course Handicap": fullCourseHandicap,
        "Calcutta Handicap Policy": CALCUTTA_FULL_COURSE_HANDICAP_POLICY,
      });
    }
  }
  return results.sort((left, right) => Number(left.Round) - Number(right.Round)
    || clean(left["Player IDs"]).localeCompare(clean(right["Player IDs"])));
}

function awardForPlaces(rows, round, start, count, kind) {
  const field = kind === "points" ? `Round ${round} Award` : `Round ${round} Award %`;
  const byPlace = new Map(rows.map((row) => [rankValue(row.Place), kind === "points" ? numeric(row[field]) : payoutFraction(row[field])]));
  let total = 0;
  for (let place = start; place < start + count; place += 1) total += byPlace.get(place) || 0;
  return total / count;
}

export function rankWithTieAverages(entries, value, direction, award) {
  const factor = direction === "asc" ? 1 : -1;
  const sorted = [...entries].sort((left, right) => (value(left) - value(right)) * factor || clean(left.playerId).localeCompare(clean(right.playerId)));
  const ranked = [];
  for (let index = 0; index < sorted.length;) {
    let end = index + 1;
    while (end < sorted.length && value(sorted[end]) === value(sorted[index])) end += 1;
    const place = index + 1;
    const tied = end - index;
    const averagedAward = award(place, tied);
    for (let cursor = index; cursor < end; cursor += 1) ranked.push({ ...sorted[cursor], place, tieSize: tied, award: averagedAward });
    index = end;
  }
  return ranked;
}

function normalizedPlayer(playerMap, playerId) {
  const player = playerMap[playerId] || {};
  return { id: playerId, name: player.name || playerId, photo: player.photo || "", slug: player.slug || "" };
}

export function deriveCalcuttaRoundResults({ year, roundResults = [], liveRoundHandicaps = [], handicaps = [] }) {
  const liveHandicap = (playerId, round) => {
    const row = yearRows(liveRoundHandicaps, year).find((item) => clean(item["Player ID"] || item.Player) === playerId && roundNumber(item.Round) === round);
    if (row && clean(row["Course Handicap"]) !== "") return numeric(row["Course Handicap"]);
    const fallback = yearRows(handicaps, year).find((item) => clean(item["Player ID"]) === playerId);
    return numeric(fallback?.["Tournament Handicap"]);
  };
  return yearRows(roundResults, year).flatMap((row) => {
    const round = roundNumber(row.Round);
    const format = clean(row.Format);
    const playerIds = clean(row["Player IDs"] || row["Player ID"] || row["Golfer Player ID"]).split(/[,/|]/).map(clean).filter(Boolean);
    if (!round || !playerIds.length) return [];
    const gross = numeric(row["Gross Score"] ?? row.Gross);
    const pairingId = playerIds.length === 2 ? [...playerIds].sort().join("|") : "";
    return playerIds.map((playerId) => {
      let fullCourseHandicap = clean(row["Full Course Handicap"]) !== "" ? numeric(row["Full Course Handicap"]) : liveHandicap(playerId, round);
      if (/scramble|^sc$/i.test(format) && playerIds.length === 2 && clean(row["Full Course Handicap"]) === "") {
        const courseHandicaps = playerIds.map((id) => liveHandicap(id, round)).sort((a, b) => a - b);
        fullCourseHandicap = Math.round(courseHandicaps[0] * 0.35 + courseHandicaps[1] * 0.15);
      }
      const net = clean(row["Net Score"] ?? row.Net) !== "" ? numeric(row["Net Score"] ?? row.Net) : gross - fullCourseHandicap;
      return { Year: year, Round: round, Format: format, "Player ID": playerId, "Gross Score": gross, "Net Score": net, "Full Course Handicap": fullCourseHandicap, pairingId };
    });
  });
}

function scrambleRound(entries, round) {
  return Number(round) === 2 && entries.some((entry) => /scramble|^sc$/i.test(entry.format));
}

function rankScrambleTeams(entries, award) {
  const teams = new Map();
  entries.forEach((entry) => {
    if (!entry.pairingId) return;
    const team = teams.get(entry.pairingId) || { pairingId: entry.pairingId, net: entry.net, members: [] };
    team.members.push(entry);
    teams.set(entry.pairingId, team);
  });
  const validTeams = [...teams.values()].filter((team) => team.members.length === 2);
  if (validTeams.length * 2 !== entries.length) return null;
  return rankWithTieAverages(validTeams, (team) => team.net, "asc", award)
    .flatMap((team) => team.members.map((member) => ({ ...member, place: team.place, tieSize: team.tieSize, award: team.award / 2, teamAward: team.award })));
}

function publishedScramblePayoutRanks(entries, resultsForYear, payoutsForYear, round) {
  const byPlace = new Map();
  entries.forEach((entry) => {
    const source = resultsForYear.find((row) => roundNumber(row.Round) === round && clean(row["Player ID"]) === entry.playerId);
    const place = rankValue(source?.Place);
    const group = byPlace.get(place) || [];
    group.push(entry);
    byPlace.set(place, group);
  });
  return [...byPlace.entries()].flatMap(([place, members]) => {
    const tiedTeams = members.length / 2;
    const teamAward = awardForPlaces(payoutsForYear, round, place, tiedTeams, "payout");
    return members.map((member) => ({ ...member, place, tieSize: tiedTeams, award: teamAward / 2, teamAward }));
  });
}

export function calcuttaRoundResultsFromTournamentModel({ year, rounds = [], scoreLeaderboard = [] }) {
  const completedRounds = completedRoundNumbers(rounds);
  return (scoreLeaderboard || []).filter((row) => completedRounds.has(roundNumber(row.round))).map((row) => ({
    Year: Number(year),
    Round: roundNumber(row.round),
    Format: clean(row.format),
    "Player IDs": (row.playerIds || []).map(clean).filter(Boolean).join(","),
    "Gross Score": numeric(row.gross),
    "Net Score": numeric(row.net),
    "Full Course Handicap": numeric(row.gross) - numeric(row.net),
  }));
}

export function calcuttaPublicationRecords(input) {
  const year = Number(input.year);
  const purchasedPlayers = new Set(yearRows(input.purchases, year).map((row) => clean(row["Golfer Player ID"])).filter(Boolean));
  const candidates = deriveCalcuttaRoundResults(input);
  const completedRounds = new Set([1, 2, 3].filter((round) => {
    const players = new Set(candidates.filter((row) => roundNumber(row.Round) === round).map((row) => clean(row["Player ID"])).filter(Boolean));
    return purchasedPlayers.size > 0 && [...purchasedPlayers].every((playerId) => players.has(playerId));
  }));
  const derived = candidates.filter((row) => completedRounds.has(roundNumber(row.Round)) && purchasedPlayers.has(clean(row["Player ID"])));
  if (!derived.length) return { roundResults: [], standings: [] };
  const model = buildCalcuttaModel({ ...input, roundResults: derived, standings: [] });
  if (!model.available) return { roundResults: [], standings: [] };
  const updatedAt = input.updatedAt || new Date().toISOString();
  const roundResults = model.golfers.flatMap((golfer) => Object.values(golfer.rounds).map((round) => ({
    Year: year,
    Round: round.round,
    Format: round.format,
    "Player ID": golfer.playerId,
    "Gross Score": round.gross,
    "Full Course Handicap": round.fullCourseHandicap,
    "Net Score": round.net,
    Place: round.place,
    "Calcutta Points": round.points,
  })));
  const standings = model.golfers.map((golfer) => ({
    Year: year,
    Rank: golfer.rank,
    "Player ID": golfer.playerId,
    "Purchase Price": golfer.purchasePrice,
    "Round 1 Points": golfer.rounds[1]?.points || 0,
    "Round 2 Points": golfer.rounds[2]?.points || 0,
    "Round 3 Points": golfer.rounds[3]?.points || 0,
    "Total Points": golfer.totalPoints,
    "Round 1 Payout %": golfer.rounds[1]?.payoutPercent || 0,
    "Round 2 Payout %": golfer.rounds[2]?.payoutPercent || 0,
    "Round 3 Payout %": golfer.rounds[3]?.payoutPercent || 0,
    "Overall Payout %": golfer.overallPayoutPercent || 0,
    "Total Payout %": golfer.totalPayoutPercent || 0,
    "Current Payout Value": golfer.currentPayoutValue || 0,
    ROI: golfer.roi || 0,
    "Updated At": updatedAt,
  }));
  return { roundResults, standings };
}

export function calcuttaPublicationReadiness(input) {
  const year = Number(input.year);
  const purchasedPlayers = [...new Set(yearRows(input.purchases, year)
    .map((row) => clean(row["Golfer Player ID"]))
    .filter(Boolean))];
  const candidates = deriveCalcuttaRoundResults(input);
  const rounds = [1, 2, 3].map((round) => {
    const availablePlayers = [...new Set(candidates
      .filter((row) => roundNumber(row.Round) === round)
      .map((row) => clean(row["Player ID"]))
      .filter(Boolean))];
    const available = new Set(availablePlayers);
    const missingPlayers = purchasedPlayers.filter((playerId) => !available.has(playerId));
    return { round, qualifies: purchasedPlayers.length > 0 && missingPlayers.length === 0, availablePlayers, missingPlayers };
  });
  return { year, purchasedPlayers, candidates: candidates.length, rounds };
}

export function buildCalcuttaModel({ year, players = {}, purchases = [], ownership = [], pointStructure = [], payoutStructure = [], roundResults = [], standings = [], ownerLeaderboard = [] }) {
  const purchasesForYear = yearRows(purchases, year);
  const ownershipForYear = yearRows(ownership, year);
  const pointsForYear = yearRows(pointStructure, year);
  const payoutsForYear = yearRows(payoutStructure, year);
  const resultsForYear = yearRows(roundResults, year);
  const publishedStandings = yearRows(standings, year);
  const publishedByPlayer = new Map(publishedStandings.map((row) => [clean(row["Player ID"]), row]));
  const usesPublishedOutputs = publishedStandings.length > 0 && resultsForYear.some((row) => clean(row.Place) !== "" && clean(row["Calcutta Points"]) !== "");
  const purchaseByPlayer = new Map(purchasesForYear.map((row) => [clean(row["Golfer Player ID"]), numeric(row["Purchase Price"])]));
  const pot = [...purchaseByPlayer.values()].reduce((sum, price) => sum + price, 0);
  const pointsConfigured = pointsForYear.some((row) => [1, 2, 3].some((round) => numeric(row[`Round ${round} Award`]) > 0));
  const payoutsConfigured = payoutsForYear.some((row) => ["Round 1 Award %", "Round 2 Award %", "Round 3 Award %", "Overall Award %"].some((field) => payoutFraction(row[field]) > 0));
  const entries = new Map();
  const ensure = (playerId) => {
    if (!entries.has(playerId)) entries.set(playerId, {
      playerId,
      player: normalizedPlayer(players, playerId),
      purchasePrice: purchaseByPlayer.get(playerId) || 0,
      rounds: {}, totalPoints: 0, totalPayoutPercent: 0, currentPayoutValue: 0, roi: 0,
    });
    return entries.get(playerId);
  };
  purchaseByPlayer.forEach((_price, playerId) => ensure(playerId));

  for (const round of [1, 2, 3]) {
    const eligible = resultsForYear.filter((row) => roundNumber(row.Round) === round && clean(row["Player ID"]) && clean(row["Net Score"]) !== "").map((row) => ({
      playerId: clean(row["Player ID"]),
      format: clean(row.Format),
      pairingId: clean(row.pairingId),
      gross: numeric(row["Gross Score"]),
      net: numeric(row["Net Score"]),
      fullCourseHandicap: numeric(row["Full Course Handicap"]),
    }));
    const isScrambleRound = scrambleRound(eligible, round) && (usesPublishedOutputs || eligible.every((entry) => entry.pairingId));
    const pointRanks = usesPublishedOutputs
      ? eligible.map((entry) => {
          const source = resultsForYear.find((row) => roundNumber(row.Round) === round && clean(row["Player ID"]) === entry.playerId);
          return { ...entry, place: rankValue(source?.Place), tieSize: 1, award: numeric(source?.["Calcutta Points"]) };
        })
      : isScrambleRound
        ? rankScrambleTeams(eligible, (place, count) => awardForPlaces(pointsForYear, round, place, count, "points"))
        : rankWithTieAverages(eligible, (entry) => entry.net, "asc", (place, count) => awardForPlaces(pointsForYear, round, place, count, "points"));
    // Payout percentages always come from Calcutta Payout. Published standings
    // are derived output and must never become a second payout authority.
    const configuredPayoutRanks = isScrambleRound
      ? usesPublishedOutputs
        ? publishedScramblePayoutRanks(eligible, resultsForYear, payoutsForYear, round)
        : rankScrambleTeams(eligible, (place, count) => awardForPlaces(payoutsForYear, round, place, count, "payout"))
      : rankWithTieAverages(eligible, (entry) => entry.net, "asc", (place, count) => awardForPlaces(payoutsForYear, round, place, count, "payout"));
    const configuredPayoutByPlayer = new Map(configuredPayoutRanks.map((entry) => [entry.playerId, entry.award]));
    const payoutRanks = configuredPayoutRanks;
    const payoutByPlayer = new Map(payoutRanks.map((entry) => [entry.playerId, entry.award]));
    pointRanks.forEach((result) => {
      const entry = ensure(result.playerId);
      entry.rounds[round] = {
        round,
        format: result.format,
        gross: result.gross,
        net: result.net,
        fullCourseHandicap: result.fullCourseHandicap,
        place: result.place,
        tieSize: result.tieSize,
        points: result.award,
        configuredPayoutPercent: configuredPayoutByPlayer.get(result.playerId) || 0,
        payoutPercent: payoutByPlayer.get(result.playerId) || 0,
        guaranteedWinnings: pot * (payoutByPlayer.get(result.playerId) || 0),
      };
      entry.totalPoints += result.award;
      entry.totalPayoutPercent += payoutByPlayer.get(result.playerId) || 0;
    });
  }

  const overallByPlace = new Map(payoutsForYear.map((row) => [rankValue(row.Place), payoutFraction(row["Overall Award %"])]));
  const overall = rankWithTieAverages([...entries.values()], (entry) => entry.totalPoints, "desc", (place, count) => {
    let total = 0;
    for (let rank = place; rank < place + count; rank += 1) total += overallByPlace.get(rank) || 0;
    return total / count;
  });
  overall.forEach((ranked) => {
    const entry = entries.get(ranked.playerId);
    entry.rank = ranked.place;
    entry.tieSize = ranked.tieSize;
    entry.overallPayoutPercent = ranked.award;
    entry.totalPayoutPercent += ranked.award;
    entry.currentPayoutValue = pot * entry.totalPayoutPercent;
    entry.netProfit = entry.currentPayoutValue - entry.purchasePrice;
    entry.roi = entry.purchasePrice ? entry.netProfit / entry.purchasePrice : 0;
    entry.guaranteedWinnings = pot * Object.values(entry.rounds).reduce((sum, round) => sum + round.payoutPercent, 0);
    entry.remainingUpside = Math.max(0, entry.currentPayoutValue - entry.guaranteedWinnings);
  });

  const completedRounds = [1, 2, 3].filter((round) => [...entries.values()].some((entry) => entry.rounds[round]));
  const tournamentComplete = completedRounds.includes(3);

  const ownerMap = new Map();
  for (const row of ownershipForYear) {
    const playerId = clean(row["Golfer Player ID"]);
    const ownerId = clean(row["Owner Player ID"]);
    const share = fraction(row["Ownership %"]);
    if (!playerId || !ownerId || !share || !entries.has(playerId)) continue;
    const golfer = entries.get(playerId);
    const owner = ownerMap.get(ownerId) || { ownerId, owner: normalizedPlayer(players, ownerId), investments: [], purchaseCost: 0, currentPayoutValue: 0, netProfit: 0, roi: 0 };
    const investment = {
      playerId,
      player: golfer.player,
      ownership: share,
      purchasePrice: golfer.purchasePrice * share,
      guaranteedWinnings: golfer.guaranteedWinnings * share,
      currentPayoutValue: golfer.currentPayoutValue * share,
    };
    investment.netProfit = investment.currentPayoutValue - investment.purchasePrice;
    investment.roi = investment.purchasePrice ? investment.netProfit / investment.purchasePrice : 0;
    owner.investments.push(investment);
    owner.purchaseCost += investment.purchasePrice;
    owner.guaranteedWinnings = Number(owner.guaranteedWinnings || 0) + investment.guaranteedWinnings;
    owner.currentPayoutValue += investment.currentPayoutValue;
    ownerMap.set(ownerId, owner);
    golfer.owners ||= [];
    golfer.owners.push({ ownerId, owner: owner.owner, ownership: share });
  }
  const portfolios = [...ownerMap.values()].map((owner) => ({
    ...owner,
    netProfit: owner.currentPayoutValue - owner.purchaseCost,
    roi: owner.purchaseCost ? (owner.currentPayoutValue - owner.purchaseCost) / owner.purchaseCost : 0,
  })).sort((a, b) => b.currentPayoutValue - a.currentPayoutValue || b.roi - a.roi || a.owner.name.localeCompare(b.owner.name)).map((owner, index) => ({ ...owner, rank: index + 1 }));

  const golfers = [...entries.values()].sort((a, b) => a.rank - b.rank || b.totalPoints - a.totalPoints || a.player.name.localeCompare(b.player.name));
  const distributedPrizePool = golfers.reduce((sum, golfer) => sum + golfer.currentPayoutValue, 0);
  const byRoi = [...golfers].sort((a, b) => b.roi - a.roi || b.netProfit - a.netProfit);
  const byGain = [...golfers].sort((a, b) => b.netProfit - a.netProfit || b.roi - a.roi);
  const mostExpensive = [...golfers].sort((a, b) => b.purchasePrice - a.purchasePrice)[0];
  const highestGuaranteed = [...golfers].sort((a, b) => b.guaranteedWinnings - a.guaranteedWinnings)[0];
  const highestUpside = [...golfers].sort((a, b) => b.remainingUpside - a.remainingUpside)[0];
  const completedRoundWinnings = golfers.reduce((sum, golfer) => sum + golfer.guaranteedWinnings, 0);
  const guaranteedDistributed = tournamentComplete ? distributedPrizePool : completedRoundWinnings;
  const storylines = [];
  if (byRoi[0]?.purchasePrice) storylines.push({ icon: "📈", title: "Highest ROI", subject: byRoi[0].player.name, detail: `${byRoi[0].player.name} leads at ${Math.round(byRoi[0].roi * 100)}% since the opening auction.` });
  if (highestGuaranteed?.guaranteedWinnings) storylines.push({ icon: "🏆", title: "Largest Guaranteed Winner", subject: highestGuaranteed.player.name, detail: `${highestGuaranteed.player.name} has already secured ${highestGuaranteed.guaranteedWinnings.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}.` });
  if (!tournamentComplete && highestUpside?.remainingUpside) storylines.push({ icon: "↗", title: "Highest Remaining Upside", subject: highestUpside.player.name, detail: `${highestUpside.player.name} still has ${highestUpside.remainingUpside.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })} left to play for.` });
  if (portfolios[0]) storylines.push({ icon: "💼", title: "Most Valuable Portfolio", subject: portfolios[0].owner.name, detail: `${portfolios[0].owner.name}'s portfolio leads at ${portfolios[0].currentPayoutValue.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}.` });
  if (mostExpensive?.purchasePrice) storylines.push({ icon: "💰", title: "Most Expensive Purchase", subject: mostExpensive.player.name, detail: `${mostExpensive.player.name} drew the opening auction's top price at ${mostExpensive.purchasePrice.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}.` });

  return {
    available: Boolean(pot > 0 && pointsConfigured && payoutsConfigured),
    year,
    pot,
    distributedPrizePool,
    guaranteedDistributed,
    remainingPrizePool: Math.max(0, pot - guaranteedDistributed),
    completedRounds,
    tournamentComplete,
    golfers,
    portfolios,
    storylines,
    hero: { leadingPortfolio: portfolios[0] || null, highestRoi: byRoi[0] || null, bestInvestment: byGain[0] || null, highestGuaranteed: highestGuaranteed?.guaranteedWinnings ? highestGuaranteed : null, highestUpside: highestUpside?.remainingUpside ? highestUpside : null },
    source: { mode: usesPublishedOutputs ? "official" : "derived", purchases: purchasesForYear.length, ownership: ownershipForYear.length, pointStructure: pointsForYear.length, payoutStructure: payoutsForYear.length, roundResults: resultsForYear.length, standings: publishedStandings.length, ownerLeaderboard: yearRows(ownerLeaderboard, year).length },
  };
}
