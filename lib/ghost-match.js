const clean = (value) => String(value ?? "").trim();

export function normalizeGhostMatchId(value) {
  return clean(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function ghostMatchExclusionKey(matchId, playerId) {
  return `${normalizeGhostMatchId(matchId)}::${normalizeGhostMatchId(playerId)}`;
}

export function buildGhostMatchExclusionSet(rows = []) {
  return new Set(rows
    .map((row) => ghostMatchExclusionKey(row?.["Match ID"], row?.["Player ID"]))
    .filter((key) => !key.startsWith("::") && !key.endsWith("::")));
}

export function isPlayerExcludedFromMatchRecord(matchId, playerId, exclusions = new Set()) {
  if (!matchId || !playerId) return false;
  return exclusions.has(ghostMatchExclusionKey(matchId, playerId));
}

export function playerMatchEligibility(matchId, playerId, exclusions = new Set()) {
  return {
    includeOfficialRecord: !isPlayerExcludedFromMatchRecord(matchId, playerId, exclusions),
    includeScorecardAnalytics: true,
  };
}

function matchPlayers(match) {
  return [
    match?.["Team 1 Player 1"],
    match?.["Team 1 Player 2"],
    match?.["Team 2 Player 1"],
    match?.["Team 2 Player 2"],
  ].map(clean).filter(Boolean);
}

export function validateGhostMatchRows({ rows = [], matches = [], players = [] } = {}) {
  const warnings = [];
  const matchMap = new Map(matches.map((match) => [normalizeGhostMatchId(match["Match ID"]), match]));
  const playerIds = new Set(players.map((player) => normalizeGhostMatchId(player["Player ID"])));
  const counts = new Map();
  const matchExclusionCounts = new Map();

  for (const row of rows) {
    const matchId = normalizeGhostMatchId(row?.["Match ID"]);
    const playerId = normalizeGhostMatchId(row?.["Player ID"]);
    const composite = ghostMatchExclusionKey(matchId, playerId);
    counts.set(composite, (counts.get(composite) || 0) + 1);
    matchExclusionCounts.set(matchId, (matchExclusionCounts.get(matchId) || 0) + 1);
    const match = matchMap.get(matchId);
    if (!match) {
      warnings.push({ code: "Unknown Ghost Match ID", matchId: clean(row?.["Match ID"]), playerId: clean(row?.["Player ID"]) });
      continue;
    }
    if (!playerIds.has(playerId)) {
      warnings.push({ code: "Unknown Ghost Match Player ID", matchId: clean(row?.["Match ID"]), playerId: clean(row?.["Player ID"]) });
    } else if (!matchPlayers(match).some((id) => normalizeGhostMatchId(id) === playerId)) {
      warnings.push({ code: "Ghost Match Player Not In Match", matchId: clean(row?.["Match ID"]), playerId: clean(row?.["Player ID"]) });
    }
    if (clean(match["Match Status"]).toUpperCase() !== "GHOST MATCH") {
      warnings.push({ code: "Ghost Exclusion Without Ghost Match Status", matchId: clean(row?.["Match ID"]), playerId: clean(row?.["Player ID"]) });
    }
  }

  for (const [composite, count] of counts) {
    if (count > 1) {
      const [matchId, playerId] = composite.split("::");
      warnings.push({ code: "Duplicate Ghost Match Exclusion", matchId, playerId, count });
    }
  }
  for (const match of matches) {
    const matchId = normalizeGhostMatchId(match["Match ID"]);
    if (clean(match["Match Status"]).toUpperCase() === "GHOST MATCH" && !matchExclusionCounts.has(matchId)) {
      warnings.push({ code: "Ghost Match Status Without Exclusions", matchId: clean(match["Match ID"]), playerId: "" });
    }
  }
  return warnings;
}
