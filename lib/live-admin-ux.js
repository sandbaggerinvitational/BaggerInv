const clean = (value) => String(value ?? "").trim();

export function hasUnsavedMatchChanges(match = {}, draft = {}, fields = []) {
  return fields.some((field) => clean(draft[field]) !== clean(match[field]));
}

export function finalizationReview({ match = {}, draft = {}, teamOne = "Team 1", teamTwo = "Team 2", playerNames = {} } = {}) {
  const pairing = [1, 2].map((side) =>
    [1, 2]
      .map((slot) => draft[`Team ${side} Player ${slot}`])
      .filter(Boolean)
      .map((id) => playerNames[id] || id)
      .join(" / ") || "Pairing not announced"
  );
  const winner = draft["Matchup Winner"] || draft["18-Hole Winner"] || "Pending";
  return {
    match: match["Match ID"] || `Match ${match.Match || ""}`.trim(),
    pairing: `${pairing[0]} vs ${pairing[1]}`,
    segments: [
      ["Front 9", draft["Front 9 Winner"]],
      ["Back 9", draft["Back 9 Winner"]],
      ["Overall", draft["18-Hole Winner"] || draft["Matchup Winner"]],
    ].filter(([, value]) => value),
    winner: winner === "Team 1" ? teamOne : winner === "Team 2" ? teamTwo : winner,
    points: `${teamOne} ${draft["Team 1 Points"] || 0} – ${draft["Team 2 Points"] || 0} ${teamTwo}`,
  };
}
