export const COMMON_GOLF_SCORES = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
export const MIN_GOLF_SCORE = 1;
export const MAX_GOLF_SCORE = 20;

const clean = (value) => String(value || "").trim();

export function scoringSlotCount(format) {
  return clean(format).toUpperCase() === "BB" ? 2 : 1;
}

export function buildScoringSlots({ format, match = {}, teamNames = {}, playerNames = {} } = {}) {
  const normalizedFormat = clean(format).toUpperCase();
  const slotsPerSide = scoringSlotCount(normalizedFormat);
  return [1, 2].flatMap((side) => {
    const teamName = clean(teamNames[side]) || `Team ${side}`;
    const playerIds = [match[`Team ${side} Player 1`], match[`Team ${side} Player 2`]].filter(Boolean);
    const pairing = playerIds.map((id) => clean(playerNames[id]) || clean(id)).filter(Boolean).join(" + ");
    return Array.from({ length: slotsPerSide }, (_, index) => {
      const playerId = playerIds[index] || "";
      return {
        key: `team${side}:${index}`,
        side,
        sideKey: side === 1 ? "team1" : "team2",
        index,
        playerId,
        teamName,
        pairing,
        label: normalizedFormat === "SC"
          ? teamName
          : clean(playerNames[playerId]) || clean(playerId) || `Player ${index + 1}`,
        kind: normalizedFormat === "SC" ? "team" : "player",
      };
    });
  });
}

export function scoreFromKeypad(current, action) {
  if (action === "clear") return "";
  if (Number.isInteger(action)) {
    if (action < MIN_GOLF_SCORE || action > MAX_GOLF_SCORE) return current === "" ? "" : Number(current);
    return action;
  }
  const numeric = Number(current);
  if (action === "increment") {
    if (!Number.isInteger(numeric) || numeric < MIN_GOLF_SCORE) return 11;
    return Math.min(MAX_GOLF_SCORE, numeric + 1);
  }
  if (action === "decrement") {
    if (!Number.isInteger(numeric) || numeric < MIN_GOLF_SCORE) return MIN_GOLF_SCORE;
    return Math.max(MIN_GOLF_SCORE, numeric - 1);
  }
  return current === "" ? "" : Number(current);
}

export function nextScoringSlotIndex(currentIndex, slotCount) {
  const current = Number(currentIndex);
  const count = Number(slotCount);
  if (!Number.isInteger(current) || !Number.isInteger(count) || count < 1) return 0;
  return Math.min(count - 1, current + 1);
}

export function scoringKeypadActionLabel(action, current) {
  if (action === "clear") return "Clear selected gross score";
  if (action === "increment") return `Increase selected gross score${current ? ` from ${current}` : " above 10"}`;
  if (action === "decrement") return `Decrease selected gross score${current ? ` from ${current}` : " to 1"}`;
  return `Set selected gross score to ${action}`;
}
