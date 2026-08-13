const clean = (value) => String(value ?? "").trim();
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export function applyParticipantFinalizationResult(current = {}, result = {}) {
  const match = current.match || {};
  const matchRevision = number(result.matchRevision, number(match.matchRevision || match.Revision));
  const finalizedAt = clean(result["Finalized At"] || result.updatedAt || match["Finalized At"]);
  const winner = clean(result.resultWinner || match["Matchup Winner"] || match["18-Hole Winner"]);
  return {
    ...current,
    match: {
      ...match,
      "Match Status": "Final",
      "Scoring Locked": true,
      "Scorecard Complete": true,
      "Finalized At": finalizedAt,
      "Updated At": clean(result.updatedAt || finalizedAt || match["Updated At"]),
      "Matchup Winner": winner,
      "18-Hole Winner": winner,
      Revision: matchRevision,
      matchRevision,
    },
    canConfirm: false,
    authority: {
      ...(current.authority || {}),
      source: "supabase",
      writable: false,
      status: "FINAL",
      scoringLocked: true,
      scorecardComplete: true,
      matchRevision,
    },
  };
}
