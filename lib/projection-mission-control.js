import { ODDS_PHASES } from "./tournament-odds.js";
import { projectionPresentationLabel } from "./projection-phases.js";

function phaseIndex(phase) {
  return ODDS_PHASES.indexOf(String(phase || ""));
}

function roundFinal(rounds, number) {
  const round = (rounds || []).find((item) => Number(item.number) === Number(number));
  return Boolean(round && (round.status === "FINAL" || (round.total > 0 && round.final === round.total)));
}

export function championshipProjectionMissionStatus({ snapshots = [], rounds = [], tournament = {}, openingStatus, roundThreeStatus } = {}) {
  const published = snapshots
    .filter((snapshot) => phaseIndex(snapshot.phase) >= 0)
    .sort((left, right) => phaseIndex(left.phase) - phaseIndex(right.phase));
  const current = published.at(-1) || null;
  const nextPhase = current ? ODDS_PHASES[phaseIndex(current.phase) + 1] || null : ODDS_PHASES[0];
  const tournamentComplete = /^(Final|Complete)$/i.test(String(tournament.status || "")) || rounds.length > 0 && rounds.every((round) => roundFinal(rounds, round.number));
  let ready = false;
  let reason = "All Championship Projection milestones have been published.";

  if (nextPhase === "Pre-Tournament") {
    ready = Boolean(openingStatus?.ready);
    reason = ready ? "Opening pairings are complete and ready for publication." : openingStatus?.firstFailure || openingStatus?.message || "Opening pairings are not complete.";
  } else if (nextPhase === "After Round 1") {
    ready = roundFinal(rounds, 1) && Boolean(openingStatus?.ready);
    reason = ready ? "Round 1 is closed and Round 2 pairings are ready." : !roundFinal(rounds, 1) ? "Close Round 1 after every match is Final." : openingStatus?.firstFailure || "Round 2 pairings are not complete.";
  } else if (nextPhase === "After Round 2") {
    ready = roundFinal(rounds, 2);
    reason = ready ? "Friday results are official and the Championship Outlook is ready." : "Close Round 2 after every match is Final.";
  } else if (nextPhase === "Round 3 Pairings Announced") {
    ready = roundFinal(rounds, 2) && Boolean(roundThreeStatus?.ready);
    reason = ready ? "Official Championship Singles pairings are ready." : !roundFinal(rounds, 2) ? "Close Round 2 before publishing Championship Singles." : roundThreeStatus?.message || "Official Championship Singles pairings are incomplete.";
  } else if (nextPhase === "Final Results") {
    ready = tournamentComplete;
    reason = ready ? "Official tournament results are ready for the Tournament Recap." : "Complete and close every tournament round first.";
  }

  return {
    currentPhase: current?.phase || null,
    currentLabel: current ? projectionPresentationLabel(current.phase) : "Not yet published",
    publishedAt: current?.publishedAt || null,
    nextPhase,
    nextLabel: nextPhase ? projectionPresentationLabel(nextPhase) : "Publication complete",
    ready,
    reason,
  };
}
