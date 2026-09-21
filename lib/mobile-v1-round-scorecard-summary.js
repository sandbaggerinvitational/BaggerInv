import { completeTotal } from "./scorecard-net.js";
import { strokeAllocation } from "./leaderboards-core-supabase.js";
import { requireLeadersValue } from "./mobile-v1-leaders-intelligence.js";

// An additive read product, sharing the existing complete-range aggregator and
// the accepted null-versus-zero precedence. No allocation or Net formula here.
export function mobileRoundScorecardSummary(entry, performance, holes, official, totals, published = {}) {
  const participant = entry.participants.find((p) => p.player_id === performance.playerId);
  requireLeadersValue(participant);
  const side = participant.team_side;
  const teamScope = performance.format === "SC";
  const publishedPlayer = (published[`team${side}Players`] || []).find((p) => p.id === performance.playerId);
  const matchStrokes = strokeAllocation(
    teamScope ? published[`team${side}Stroke`] : publishedPlayer?.stroke,
    teamScope ? entry.snapshot?.team_configuration?.[`team_${side}_strokes`] : participant.final_strokes,
    Boolean(entry.scores?.length),
  );
  requireLeadersValue(matchStrokes === null || (Number.isSafeInteger(matchStrokes) && matchStrokes >= 0));
  const summary = {
    out: { par: completeTotal(holes, 1, 9, "par"), gross: null, net: totals.frontNet },
    in: { par: completeTotal(holes, 10, 18, "par"), gross: null, net: totals.backNet },
    total: { par: completeTotal(holes, 1, 18, "par"), gross: totals.totalGross, net: totals.totalNet },
  };
  if (official) {
    summary.out.gross = completeTotal(holes, 1, 9, "gross");
    summary.in.gross = completeTotal(holes, 10, 18, "gross");
    // Verify against the existing completed authority, never repair a value.
    requireLeadersValue(completeTotal(holes, 1, 18, "gross") === totals.totalGross &&
      completeTotal(holes, 1, 18, "net") === totals.totalNet &&
      completeTotal(holes, 1, 18, "appliedStrokes") === matchStrokes);
  }
  return { matchStrokes, summary };
}
