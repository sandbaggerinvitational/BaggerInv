import { isPlayerExcludedFromMatchRecord } from "./ghost-match.js";

const COMPLETE_STATUSES = new Set(["COMPLETE", "VERIFIED"]);
const clean = (value) => String(value ?? "").trim();
const unique = (values) => [...new Set(values.map(clean).filter(Boolean))];
const leader = (position) => position > 0 ? "A" : position < 0 ? "B" : null;
const otherSide = (side) => side === "A" ? "B" : "A";
const formatName = (format) =>
  format === "BB" ? "Best Ball" : format === "SC" ? "Scramble" : format === "SI" ? "Singles" : format || "";

function sideCards(cards, side) {
  return cards.filter((card) => card.side === (side === "A" ? 1 : 2));
}

function participantIds(cards) {
  return unique(cards.flatMap((card) => [
    card.playerId,
    ...(card.participantPlayerIds || []),
  ]));
}

function participantNames(cards) {
  return unique(cards.flatMap((card) => [
    card.playerName,
    ...(card.participantNames || []),
  ]));
}

function longestRun(holeWinners, wantedSide) {
  let current = 0;
  let longest = 0;
  for (const hole of holeWinners) {
    const matches = wantedSide === "HALVED"
      ? hole.winnerType === "HALVED"
      : hole.winnerSide === wantedSide;
    current = matches ? current + 1 : 0;
    longest = Math.max(longest, current);
  }
  return longest;
}

function segmentResult(holeWinners, from, through, side) {
  const holes = holeWinners.filter((hole) =>
    Number(hole.holeNumber) >= from && Number(hole.holeNumber) <= through
  );
  const won = holes.filter((hole) => hole.winnerSide === side).length;
  const lost = holes.filter((hole) => hole.winnerSide === otherSide(side)).length;
  const halved = holes.filter((hole) => hole.winnerType === "HALVED").length;
  return { won, lost, halved, differential: won - lost };
}

function finalMargin(progression) {
  const last = progression.at(-1);
  if (!last || last.position === 0) {
    return { winnerSide: null, lead: 0, holesRemaining: 0, label: "Halved", value: 0 };
  }
  const winnerSide = leader(last.position);
  const clinch = progression.find((step) =>
    leader(step.position) === winnerSide &&
    Math.abs(step.position) > 18 - step.holeNumber
  ) || last;
  const lead = Math.abs(clinch.position);
  const holesRemaining = 18 - clinch.holeNumber;
  return {
    winnerSide,
    lead,
    holesRemaining,
    label: holesRemaining ? `${lead} & ${holesRemaining}` : `${lead} Up`,
    value: lead + (holesRemaining / 18),
  };
}

function sideIdentity(cards, scoringRows, side) {
  const cardsForSide = sideCards(cards, side);
  const row = scoringRows.find((item) => item.side === (side === "A" ? 1 : 2));
  return {
    side,
    teamId: row?.teamId || cardsForSide[0]?.sideTeamId || cardsForSide[0]?.teamId || "",
    teamName: row?.name || cardsForSide[0]?.teamName || (side === "A" ? "Side A" : "Side B"),
    playerIds: participantIds(cardsForSide),
    playerNames: participantNames(cardsForSide),
  };
}

/**
 * Reconstruct one match from its normalized Hole Winner data.
 * Positive position means Side A leads; negative means Side B leads.
 */
export function reconstructMatchProgression(cards = []) {
  if (!cards.length) return null;
  const scoring = cards.find((card) => card.matchNetScoring)?.matchNetScoring;
  const holeWinners = [...(scoring?.holeWinners || [])]
    .sort((a, b) => Number(a.holeNumber) - Number(b.holeNumber));
  if (holeWinners.length !== 18 || holeWinners.some((hole) =>
    hole.winnerType === "UNAVAILABLE" ||
    (!["A", "B"].includes(hole.winnerSide) && hole.winnerType !== "HALVED")
  )) return null;

  let position = 0;
  let lastNonSquareLeader = null;
  let leadChanges = 0;
  const progression = holeWinners.map((hole) => {
    if (hole.winnerSide === "A") position += 1;
    if (hole.winnerSide === "B") position -= 1;
    const currentLeader = leader(position);
    if (currentLeader && lastNonSquareLeader && currentLeader !== lastNonSquareLeader) leadChanges += 1;
    if (currentLeader) lastNonSquareLeader = currentLeader;
    return {
      holeNumber: Number(hole.holeNumber),
      winnerSide: hole.winnerSide || null,
      winnerType: hole.winnerType,
      position,
      leaderSide: currentLeader,
      lead: Math.abs(position),
    };
  });

  const sideA = sideIdentity(cards, scoring?.rows || [], "A");
  const sideB = sideIdentity(cards, scoring?.rows || [], "B");
  const margin = finalMargin(progression);
  const largestLeadA = Math.max(0, ...progression.map((step) => step.position));
  const largestLeadB = Math.max(0, ...progression.map((step) => -step.position));
  const holesWonA = holeWinners.filter((hole) => hole.winnerSide === "A").length;
  const holesWonB = holeWinners.filter((hole) => hole.winnerSide === "B").length;
  const base = cards[0];
  const largestDeficitOvercome = margin.winnerSide === "A"
    ? largestLeadB
    : margin.winnerSide === "B" ? largestLeadA : 0;
  const losingSide = margin.winnerSide ? otherSide(margin.winnerSide) : null;
  const largestLeadBlown = losingSide === "A" ? largestLeadA : losingSide === "B" ? largestLeadB : 0;

  return {
    matchId: base.matchId,
    year: base.year,
    round: base.round,
    matchNumber: base.matchNumber,
    format: base.format,
    formatName: formatName(base.format),
    courseId: base.courseId,
    courseName: base.courseName,
    sideA,
    sideB,
    holeWinners,
    progression,
    finalMargin: margin,
    winnerSide: margin.winnerSide,
    losingSide,
    leadChanges,
    largestLead: { A: largestLeadA, B: largestLeadB },
    largestComeback: largestDeficitOvercome,
    largestLeadBlown,
    holesWon: { A: holesWonA, B: holesWonB },
    holesLost: { A: holesWonB, B: holesWonA },
    holesHalved: holeWinners.filter((hole) => hole.winnerType === "HALVED").length,
    longestHolesWon: {
      A: longestRun(holeWinners, "A"),
      B: longestRun(holeWinners, "B"),
    },
    longestHolesHalved: longestRun(holeWinners, "HALVED"),
    frontNine: {
      A: segmentResult(holeWinners, 1, 9, "A"),
      B: segmentResult(holeWinners, 1, 9, "B"),
    },
    backNine: {
      A: segmentResult(holeWinners, 10, 18, "A"),
      B: segmentResult(holeWinners, 10, 18, "B"),
    },
    closing: {
      A: segmentResult(holeWinners, 16, 18, "A"),
      B: segmentResult(holeWinners, 16, 18, "B"),
    },
    leadAfterNine: progression.find((step) => step.holeNumber === 9)?.position ?? 0,
  };
}

function emptyPlayer(playerId, playerName) {
  return {
    playerId,
    playerName: playerName || playerId,
    matches: 0,
    largestLeadHeld: 0,
    largestComebackCompleted: 0,
    matchesWonAfterTrailing: 0,
    largestLeadBlown: 0,
    mostLeadChangesExperienced: 0,
    totalLeadChangesExperienced: 0,
    mostConsecutiveHolesWon: 0,
    mostConsecutiveHolesLost: 0,
    mostClosingHolesWon: 0,
    totalClosingHolesWon: 0,
    frontNine: { won: 0, lost: 0, halved: 0 },
    backNine: { won: 0, lost: 0, halved: 0 },
    closing: { won: 0, lost: 0, halved: 0 },
  };
}

function addSegment(target, segment) {
  target.won += segment.won;
  target.lost += segment.lost;
  target.halved += segment.halved;
}

function sideEntry(match, side, value, {
  negative = false,
  ghostMatchExclusions = new Set(),
  valueDisplay = "",
} = {}) {
  const identity = side === "A" ? match.sideA : match.sideB;
  const participants = identity.playerIds.map((id, index) => ({
    id,
    name: identity.playerNames[index] || id,
  }));
  const eligible = negative
    ? participants.filter((player) =>
        !isPlayerExcludedFromMatchRecord(match.matchId, player.id, ghostMatchExclusions)
      )
    : participants;
  if (!eligible.length || !Number.isFinite(Number(value)) || Number(value) <= 0) return null;
  return {
    entityType: "TEAM_PERFORMANCE",
    value: Number(value),
    valueDisplay,
    teamId: identity.teamId,
    teamName: identity.teamName,
    playerIds: eligible.map((player) => player.id),
    playerNames: eligible.map((player) => player.name),
    matchId: match.matchId,
    year: match.year,
    round: match.round,
    format: match.format,
    formatName: match.formatName,
    courseId: match.courseId,
    courseName: match.courseName,
  };
}

function matchEntry(match, value) {
  if (!Number.isFinite(Number(value)) || Number(value) <= 0) return null;
  return {
    entityType: "MATCH_PERFORMANCE",
    value: Number(value),
    name: `${match.sideA.teamName} vs ${match.sideB.teamName}`,
    matchId: match.matchId,
    year: match.year,
    round: match.round,
    format: match.format,
    formatName: match.formatName,
    courseId: match.courseId,
    courseName: match.courseName,
  };
}

function record(slug, title, entries, { signed = false, formatter = null } = {}) {
  const eligible = entries.filter(Boolean).sort((a, b) =>
    b.value - a.value ||
    clean(a.teamName || a.name).localeCompare(clean(b.teamName || b.name))
  );
  const top = eligible[0]?.value;
  return {
    slug,
    title,
    group: "match-progression",
    direction: "highest",
    signed,
    formatter,
    entries: eligible,
    winners: eligible.filter((entry) => entry.value === top),
  };
}

function buildRecords(matches, ghostMatchExclusions) {
  const sideRows = (valueFor, optionsFor = () => ({})) => matches.flatMap((match) =>
    ["A", "B"].map((side) => sideEntry(
      match,
      side,
      valueFor(match, side),
      { ghostMatchExclusions, ...optionsFor(match, side) }
    )).filter(Boolean)
  );
  return [
    record("largest-match-victory", "Largest Match Victory", matches.map((match) =>
      match.winnerSide
        ? sideEntry(match, match.winnerSide, match.finalMargin.value, {
            ghostMatchExclusions,
            valueDisplay: match.finalMargin.label,
          })
        : null
    ), { formatter: (entry) => entry.valueDisplay }),
    record("largest-comeback", "Largest Comeback", matches.map((match) =>
      match.winnerSide
        ? sideEntry(match, match.winnerSide, match.largestComeback, { ghostMatchExclusions })
        : null
    )),
    record("largest-lead", "Largest Lead", sideRows((match, side) => match.largestLead[side])),
    record("largest-lead-blown", "Largest Lead Blown", matches.map((match) =>
      match.losingSide
        ? sideEntry(match, match.losingSide, match.largestLeadBlown, {
            negative: true,
            ghostMatchExclusions,
          })
        : null
    )),
    record("most-lead-changes", "Most Lead Changes", matches.map((match) =>
      matchEntry(match, match.leadChanges)
    )),
    record("most-consecutive-holes-won-match", "Most Consecutive Holes Won", sideRows((match, side) => match.longestHolesWon[side])),
    record("most-consecutive-holes-halved", "Most Consecutive Holes Halved", matches.map((match) =>
      matchEntry(match, match.longestHolesHalved)
    )),
    record("most-holes-won-one-match", "Most Holes Won in One Match", sideRows((match, side) => match.holesWon[side])),
    record("most-holes-lost-one-match", "Most Holes Lost in One Match", sideRows(
      (match, side) => match.holesLost[side],
      () => ({ negative: true })
    )),
    record("best-front-nine-match", "Best Front Nine", sideRows((match, side) => match.frontNine[side].differential)),
    record("best-back-nine-match", "Best Back Nine", sideRows((match, side) => match.backNine[side].differential)),
    record("best-closing-stretch-match", "Best Closing Stretch", sideRows((match, side) => match.closing[side].differential)),
  ];
}

/**
 * Shared archive service for match progression, player progression aggregates,
 * and Records leaderboards.
 */
export function buildMatchProgressionAnalytics(
  scorecards = [],
  { ghostMatchExclusions = new Set() } = {}
) {
  const complete = scorecards.filter((card) =>
    COMPLETE_STATUSES.has(clean(card.status).toUpperCase()) &&
    card.completedHoleCount === 18
  );
  const byMatch = new Map();
  for (const card of complete) {
    if (!card.matchId) continue;
    if (!byMatch.has(card.matchId)) byMatch.set(card.matchId, []);
    byMatch.get(card.matchId).push(card);
  }
  const matches = [...byMatch.values()].map(reconstructMatchProgression).filter(Boolean);
  const players = new Map();
  const ensure = (id, name) => {
    if (!players.has(id)) players.set(id, emptyPlayer(id, name));
    return players.get(id);
  };

  for (const match of matches) {
    for (const side of ["A", "B"]) {
      const identity = side === "A" ? match.sideA : match.sideB;
      for (const [index, playerId] of identity.playerIds.entries()) {
        const player = ensure(playerId, identity.playerNames[index]);
        const negativeAllowed = !isPlayerExcludedFromMatchRecord(
          match.matchId,
          playerId,
          ghostMatchExclusions
        );
        player.matches += 1;
        player.largestLeadHeld = Math.max(player.largestLeadHeld, match.largestLead[side]);
        player.mostLeadChangesExperienced = Math.max(player.mostLeadChangesExperienced, match.leadChanges);
        player.totalLeadChangesExperienced += match.leadChanges;
        player.mostConsecutiveHolesWon = Math.max(player.mostConsecutiveHolesWon, match.longestHolesWon[side]);
        player.mostClosingHolesWon = Math.max(player.mostClosingHolesWon, match.closing[side].won);
        player.totalClosingHolesWon += match.closing[side].won;
        addSegment(player.frontNine, match.frontNine[side]);
        addSegment(player.backNine, match.backNine[side]);
        addSegment(player.closing, match.closing[side]);
        if (match.winnerSide === side) {
          player.largestComebackCompleted = Math.max(player.largestComebackCompleted, match.largestComeback);
          if (match.largestComeback > 0) player.matchesWonAfterTrailing += 1;
        }
        if (negativeAllowed) {
          if (match.losingSide === side) {
            player.largestLeadBlown = Math.max(player.largestLeadBlown, match.largestLeadBlown);
          }
          player.mostConsecutiveHolesLost = Math.max(
            player.mostConsecutiveHolesLost,
            match.longestHolesWon[otherSide(side)]
          );
        }
      }
    }
  }

  const records = buildRecords(matches, ghostMatchExclusions);
  return {
    matches,
    players: [...players.values()].sort((a, b) => a.playerName.localeCompare(b.playerName)),
    records,
    byRecordSlug: Object.fromEntries(records.map((item) => [item.slug, item])),
    match: (matchId) => matches.find((item) => item.matchId === matchId) || null,
    player: (playerId) => players.get(playerId) || null,
  };
}

export function formatMatchPosition(position, sideAName = "Side A", sideBName = "Side B") {
  if (!position) return "All Square";
  return `${position > 0 ? sideAName : sideBName} ${Math.abs(position)} Up`;
}

export function matchProgressionLeaderboardRows(recordDefinition) {
  return recordDefinition.entries.map((entry, index) => ({
    id: `${recordDefinition.slug}-${entry.matchId}-${entry.teamId || entry.name || index}-${index}`,
    entityType: entry.entityType,
    name: entry.teamName || entry.name,
    subtitle: (entry.playerNames || []).join(" & "),
    value: entry.value,
    valueDisplay: entry.valueDisplay || (
      recordDefinition.signed && entry.value > 0 ? `+${entry.value}` : String(entry.value)
    ),
    year: entry.year ?? "",
    round: entry.round ? `Round ${entry.round}` : "",
    format: entry.formatName || "",
    course: entry.courseName || "",
  }));
}
