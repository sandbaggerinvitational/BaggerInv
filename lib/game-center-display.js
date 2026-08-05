import { formatOfficialMatchResult } from "./match-result.js";

export function liveProgressLabel(state, throughValue) {
  if (state !== "live") return "";
  const through = Math.max(0, Math.min(18, Number(throughValue) || 0));
  if (!through) return "Match in progress";
  const remaining = 18 - through;
  return `Through ${through} • ${remaining} Hole${remaining === 1 ? "" : "s"} Remaining`;
}

function sideName(side, teamNames) {
  return side === 1 ? teamNames[1] : side === 2 ? teamNames[2] : "";
}

export function segmentMatchResult(holes, start, end, teamNames, officialResult = "") {
  const segment = (holes || []).filter((hole) => hole.number >= start && hole.number <= end && hole.winner);
  if (!segment.length) return { team: "", result: "Not started", recorded: 0 };
  const teamOne = segment.filter((hole) => hole.winner === "Team 1").length;
  const teamTwo = segment.filter((hole) => hole.winner === "Team 2").length;
  const margin = Math.abs(teamOne - teamTwo);
  if (!margin) return { team: "", result: "All Square", recorded: segment.length };
  const side = teamOne > teamTwo ? 1 : 2;
  let result = `${margin} UP`;
  if (officialResult && start === 1 && end === 18) {
    const upperName = sideName(side, teamNames).toUpperCase();
    const upperResult = String(officialResult).toUpperCase();
    result = formatOfficialMatchResult(upperResult.startsWith(upperName) ? upperResult.slice(upperName.length).trim() : upperResult);
  }
  return { team: sideName(side, teamNames), result, recorded: segment.length };
}

export function holeStory(holes, holeNumber, teamNames) {
  const selected = (holes || []).find((hole) => hole.number === Number(holeNumber));
  if (!selected?.winner) return "This hole has not been recorded yet.";
  const through = (holes || []).filter((hole) => hole.number <= Number(holeNumber) && hole.winner);
  const before = through.slice(0, -1);
  const balance = (items) => items.reduce((total, hole) => total + (hole.winner === "Team 1" ? 1 : hole.winner === "Team 2" ? -1 : 0), 0);
  const prior = balance(before);
  const current = balance(through);
  const status = !current ? "The match is All Square." : `${sideName(current > 0 ? 1 : 2, teamNames)} leads ${Math.abs(current)} UP.`;
  if (selected.winner === "Halved") return `Hole ${holeNumber} was halved. ${!current ? "The match remains All Square." : `The lead remains ${Math.abs(current)} UP.`}`;
  const winner = sideName(selected.winner === "Team 1" ? 1 : 2, teamNames);
  const priorMagnitude = Math.abs(prior);
  const currentMagnitude = Math.abs(current);
  const movement = !current ? "The match returns to All Square." : !prior ? status : currentMagnitude > priorMagnitude ? `The lead increases to ${currentMagnitude} UP.` : currentMagnitude < priorMagnitude ? `The lead is reduced to ${currentMagnitude} UP.` : status;
  return `${winner} won Hole ${holeNumber}. ${movement}`;
}
