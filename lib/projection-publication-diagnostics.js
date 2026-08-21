import { americanOdds, ODDS_ENGINE_VERSION, ODDS_PUBLICATION_CONTRACT_VERSION } from "./tournament-odds.js";

export const PUBLICATION_STAGES = [
  "Workbook validation",
  "Input loading",
  "Pairing validation",
  "Simulation start",
  "Simulation complete",
  "Snapshot generation",
  "Team projections generated",
  "Player projections generated",
  "Snapshot validation",
  "Batch workbook write",
  "Workbook verification",
  "Cache invalidation",
  "Website refresh",
  "PWA refresh",
  "Publication complete",
];

export function createPublicationTrace() {
  const startedAt = Date.now();
  const stages = PUBLICATION_STAGES.map((name) => ({ name, status: "NOT REACHED", elapsedMs: null }));
  let active = null;
  return {
    stages,
    start(name, details = {}) {
      active = { name, at: Date.now() };
      const stage = stages.find((item) => item.name === name);
      if (stage) Object.assign(stage, details, { status: "RUNNING", elapsedMs: null });
    },
    pass(name, details = {}) {
      const stage = stages.find((item) => item.name === name);
      if (stage) Object.assign(stage, details, { status: "PASS", elapsedMs: Math.max(0, Date.now() - (active?.name === name ? active.at : startedAt)) });
      active = null;
    },
    fail(error, details = {}) {
      const stage = stages.find((item) => item.name === active?.name);
      if (stage) Object.assign(stage, details, {
        status: "FAIL",
        elapsedMs: Math.max(0, Date.now() - active.at),
        reason: error?.cause?.message || error?.message || String(error),
      });
    },
    complete(name, details = {}) {
      this.start(name, details);
      this.pass(name, details);
    },
    snapshot() {
      return { totalElapsedMs: Date.now() - startedAt, stages: stages.map((stage) => ({ ...stage })) };
    },
  };
}

export function validateProjectionSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") throw new Error("Projection snapshot was not generated.");
  for (const field of ["year", "phase", "publishedAt", "iterations", "totalPointsAvailable"]) {
    if (snapshot[field] === undefined || snapshot[field] === null || snapshot[field] === "") throw new Error(`Projection snapshot is missing ${field}.`);
  }
  if (!Array.isArray(snapshot.teams) || !snapshot.teams.length) throw new Error("Projection snapshot contains no team projections.");
  if (!Array.isArray(snapshot.players) || !snapshot.players.length) throw new Error("Projection snapshot contains no player projections.");
  const invalidTeam = snapshot.teams.find((row) => !row?.name || !Number.isFinite(Number(row?.probability)));
  if (invalidTeam) throw new Error(`Team projection is invalid for ${invalidTeam?.name || "an unnamed team"}.`);
  const invalidPlayer = snapshot.players.find((row) => !row?.id || !row?.name || !Number.isFinite(Number(row?.probability)));
  if (invalidPlayer) throw new Error(`Player projection is invalid for ${invalidPlayer?.id || invalidPlayer?.name || "an unidentified player"}.`);
  const currentContract = snapshot.engineVersion === ODDS_ENGINE_VERSION || snapshot.publicationContractVersion === ODDS_PUBLICATION_CONTRACT_VERSION;
  if (currentContract) {
    if (snapshot.engineVersion !== ODDS_ENGINE_VERSION || snapshot.publicationContractVersion !== ODDS_PUBLICATION_CONTRACT_VERSION) {
      throw new Error("Projection snapshot engine and publication contract versions do not match.");
    }
    const invalidTeamPrecision = snapshot.teams.find((row) => !Number.isFinite(Number(row.rawProbability))
      || Number(row.probability) !== +Number(row.rawProbability).toFixed(1)
      || String(row.americanOdds) !== americanOdds(Number(row.rawProbability)));
    if (invalidTeamPrecision) throw new Error(`Team projection full-precision contract is invalid for ${invalidTeamPrecision.name}.`);
    const ranks = snapshot.players.map((row) => Number(row.rank));
    const invalidPlayerPrecision = snapshot.players.find((row, index) => !Number.isFinite(Number(row.rawProbability))
      || !Number.isInteger(Number(row.rank)) || Number(row.rank) !== index + 1
      || Number(row.probability) !== +Number(row.rawProbability).toFixed(1)
      || String(row.americanOdds) !== americanOdds(Number(row.rawProbability)));
    if (invalidPlayerPrecision || new Set(ranks).size !== snapshot.players.length) {
      throw new Error(`Player projection full-precision contract is invalid for ${invalidPlayerPrecision?.id || "the published ranking"}.`);
    }
    const outOfOrder = snapshot.players.some((row, index) => index > 0 && Number(snapshot.players[index - 1].rawProbability) < Number(row.rawProbability));
    if (outOfOrder) throw new Error("Player projections are not ordered by full-precision probability.");
  }
  return snapshot;
}
