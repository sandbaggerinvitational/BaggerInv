import { formatLiveMatchResult } from "./match-result.js";

export function scoringProgress(holeScores = [], currentHole = 1, totalHoles = 18) {
  const completed = new Set(holeScores.map((score) => Number(score["Hole Number"])).filter(Number.isFinite));
  return {
    currentHole: Math.min(totalHoles, Math.max(1, Number(currentHole) || 1)),
    completed: completed.size,
    remaining: Math.max(0, totalHoles - completed.size),
    percent: totalHoles ? Math.min(100, (completed.size / totalHoles) * 100) : 0,
  };
}

export function runningMatchStatusAtHole(scores = [], holeNumber, teamNames = {}) {
  const recorded = scores
    .filter((score) => Number(score["Hole Number"]) <= Number(holeNumber))
    .sort((a, b) => Number(a["Hole Number"]) - Number(b["Hole Number"]));
  return recorded.length ? formatLiveMatchResult(recorded, teamNames) : "";
}
