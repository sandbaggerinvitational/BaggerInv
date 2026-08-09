import { LIVE_PAIRING_FIELDS } from "./live-match-pairing.js";

const clean = (value) => String(value ?? "").trim();

export function pairingSlotsForFormat(format) {
  const value = clean(format).toUpperCase();
  return value === "SI" || value === "SINGLES" ? 1 : 2;
}

export function requiredPairingFields(format) {
  const slots = pairingSlotsForFormat(format);
  return [1, 2].flatMap((side) => Array.from({ length: slots }, (_, index) => `Team ${side} Player ${index + 1}`));
}

export function roundPairingDraft(match = {}) {
  if (match.assignments) return Object.fromEntries(LIVE_PAIRING_FIELDS.map((field) => [field, clean(match.assignments[field])]));
  return Object.fromEntries(LIVE_PAIRING_FIELDS.map((field) => {
    const player = (match.players || []).find((item) => Number(item.side) === Number(field[5]) && Number(item.slot) === Number(field.at(-1)));
    return [field, clean(player?.id || match[field])];
  }));
}

export function validateRoundPairings({ year, round, format, matches = [], players = [] } = {}) {
  const requiredFields = requiredPairingFields(format);
  const slotsPerSide = pairingSlotsForFormat(format);
  const roster = players.filter((player) => !year || Number(player.year || year) === Number(year));
  const playerById = new Map(roster.map((player) => [clean(player.id), player]));
  const expectedPlayers = roster.length;
  const expectedMatches = expectedPlayers ? expectedPlayers / (slotsPerSide * 2) : 0;
  const errors = [];
  const assignments = [];

  if (!expectedPlayers) errors.push("No active tournament golfers are configured for this year.");
  if (!Number.isInteger(expectedMatches) || matches.length !== expectedMatches) errors.push(`Expected ${expectedMatches || 0} matches for ${expectedPlayers} active golfers; found ${matches.length}.`);

  for (const match of matches) {
    const draft = roundPairingDraft(match);
    for (const field of requiredFields) {
      const playerId = clean(draft[field]);
      if (!playerId) {
        errors.push(`Match ${match.match}: ${field} is unassigned.`);
        continue;
      }
      const player = playerById.get(playerId);
      if (!player) {
        errors.push(`Match ${match.match}: ${playerId} is not an active ${year} tournament golfer.`);
        continue;
      }
      const side = Number(field[5]);
      if (Number(player.side) !== side) errors.push(`Match ${match.match}: ${player.name || playerId} is assigned to the wrong team.`);
      assignments.push({ playerId, player, match: Number(match.match), field });
    }
    const selected = requiredFields.map((field) => clean(draft[field])).filter(Boolean);
    if (new Set(selected).size !== selected.length) errors.push(`Match ${match.match} contains the same golfer more than once.`);
  }

  const byPlayer = new Map();
  for (const assignment of assignments) {
    const existing = byPlayer.get(assignment.playerId) || [];
    existing.push(assignment);
    byPlayer.set(assignment.playerId, existing);
  }
  for (const [playerId, entries] of byPlayer) {
    if (entries.length < 2) continue;
    const player = playerById.get(playerId);
    errors.push(`${player?.name || playerId} is assigned to ${entries.map((entry) => `Match ${entry.match}`).join(" and ")}. Each golfer may appear only once in Round ${round}.`);
  }
  const missing = roster.filter((player) => !byPlayer.has(clean(player.id)));
  if (missing.length) errors.push(`${missing.length} active golfer${missing.length === 1 ? " is" : "s are"} still unassigned: ${missing.map((player) => player.name || player.id).join(", ")}.`);

  return {
    valid: errors.length === 0,
    errors: [...new Set(errors)],
    assignedCount: new Set(assignments.map((item) => item.playerId)).size,
    expectedPlayerCount: expectedPlayers,
    remainingCount: missing.length,
    expectedMatchCount: expectedMatches,
    requiredFields,
  };
}
