import { publishedOddsInsights } from "./championship-odds-insights.js";
import { readCompetitionDerivedState } from "./competition-derived-supabase.js";
import { leaderboardsCoreDataFromSupabaseView, readLeaderboardsCoreView } from "./leaderboards-core-supabase.js";
import { playerProjectionSummary, projectionHistoryHighlights, publishedPlayerHistory, tournamentProjectionStory } from "./projection-editorial.js";
import { publishedOddsSnapshotsFromView, readPublishedOddsView } from "./published-odds-supabase.js";
import { scoringShadowPayloadHash, scoringShadowRpc } from "./scoring-shadow.js";
import { buildTournamentRecapIntelligence } from "./tournament-recap-intelligence.js";
import { tournamentIntelligenceStorylines } from "./tournament-intelligence-storylines.js";

export const TOURNAMENT_INTELLIGENCE_ENGINE_VERSION = "tournament-intelligence-js-v1";
export const PROJECTION_EDITORIAL_ENGINE_VERSION = "projection-editorial-js-v1";
export const TOURNAMENT_FINAL_RECAP_ENGINE_VERSION = "tournament-final-recap-js-v1";
export const INTELLIGENCE_ENGINE_KEYS = ["TOURNAMENT_INTELLIGENCE", "PROJECTION_EDITORIAL", "TOURNAMENT_FINAL_RECAP"];

const clean = (value) => String(value ?? "").trim();
const stable = (value) => Array.isArray(value) ? value.map(stable) : value && typeof value === "object"
  ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])])) : value;

function finalGate(core = {}, snapshots = []) {
  const matches = (core.rounds || []).flatMap((round) => round.matches || []);
  const revisions = new Map((core.sourceRevision?.matches || []).map((match) => [clean(match.matchId), match]));
  const allMatchesFinal = matches.length === 24 && matches.every((match) => clean(match.status).toUpperCase() === "FINAL");
  const allScorecardsComplete = matches.length === 24 && matches.every((match) => revisions.get(clean(match.id))?.scorecardComplete === true);
  const finalOddsPublished = snapshots.some((snapshot) => clean(snapshot.phase) === "Final Results");
  const officialWinner = allMatchesFinal && Number.isFinite(Number(core.tournament?.teamOne?.score)) && Number.isFinite(Number(core.tournament?.teamTwo?.score));
  return { eligible: allMatchesFinal && allScorecardsComplete && finalOddsPublished && officialWinner,
    requirements: { expectedMatches: 24, actualMatches: matches.length, allMatchesFinal, allScorecardsComplete, finalOddsPublished, officialWinner } };
}

export function calculateIntelligenceDerivedFromData({ core = {}, snapshots = [], oddsMetadata = {} } = {}) {
  const started = performance.now();
  const playerTeams = new Map((core.leaderboard || []).map((player) => [clean(player.id), player.team]));
  const odds = publishedOddsInsights(snapshots);
  const intelligence = tournamentIntelligenceStorylines({ snapshots, playerTeams });
  const histories = Object.fromEntries((odds.players || []).map((player) => {
    const history = projectionHistoryHighlights(publishedPlayerHistory(snapshots, player.id));
    return [clean(player.id), { history, summary: playerProjectionSummary(player.name, history) }];
  }));
  const editorial = { insights: odds, tournamentStory: tournamentProjectionStory({ current: odds.current, previous: odds.previous, playerTeams }), histories };
  const gate = finalGate(core, snapshots);
  const recap = gate.eligible ? buildTournamentRecapIntelligence({ snapshots, tournament: core.tournament, leaderboard: core.leaderboard }) : null;
  const dependency = stable({ tournamentId: clean(core.tournament?.id), standings: core.sourceFingerprint,
    oddsPublication: { id: clean(oddsMetadata.currentPublicationId), revision: oddsMetadata.currentRevision || null,
      hash: clean(oddsMetadata.currentPayloadHash), history: (oddsMetadata.history || []).map((item) => ({ milestone: item.milestone, hash: item.payload_hash })) } });
  const sourceFingerprint = scoringShadowPayloadHash(dependency);
  return { tournamentId: clean(core.tournament?.id), dependency, sourceFingerprint,
    intelligence: { result: { storylines: intelligence }, payloadHash: scoringShadowPayloadHash({ storylines: intelligence }) },
    editorial: { result: editorial, payloadHash: scoringShadowPayloadHash(editorial) },
    recap: { gate, result: recap, payloadHash: recap ? scoringShadowPayloadHash(recap) : null },
    calculationMs: performance.now() - started };
}

export async function loadIntelligenceCanonicalInputs(tournamentId = "") {
  const started = performance.now();
  const [coreRead, oddsRead] = await Promise.all([readLeaderboardsCoreView(tournamentId), readPublishedOddsView({ tournamentId })]);
  if (!coreRead.payload?.ok) throw Object.assign(new Error("Standings input is unavailable."), { code: coreRead.payload?.code || "STANDINGS_UNAVAILABLE" });
  if (!oddsRead.payload?.ok) throw Object.assign(new Error("Published Odds input is unavailable."), { code: oddsRead.payload?.code || "ODDS_PUBLICATION_UNAVAILABLE" });
  const core = leaderboardsCoreDataFromSupabaseView(coreRead.payload.data);
  const snapshots = publishedOddsSnapshotsFromView(oddsRead.payload.data);
  const rows = oddsRead.payload.data.snapshots || [];
  const current = rows.find((row) => row.is_current_official) || null;
  return { core, snapshots, oddsMetadata: { currentPublicationId: current?.id, currentRevision: current?.publication_revision,
    currentPayloadHash: current?.payload_hash, history: rows }, inputReadMs: performance.now() - started,
    postgresMs: Number(coreRead.payload.data.query_ms || 0) + Number(oddsRead.payload.data.query_ms || 0), serviceMs: coreRead.durationMs + oddsRead.durationMs };
}

export const writeIntelligenceDerivedBundle = (input, options = {}) => scoringShadowRpc("write_intelligence_derived_bundle", { input }, { ...options, timeoutMs: options.timeoutMs || 15_000 });

export async function recalculateIntelligenceDerivedTournament(tournamentId, { calculatedBy = "Intelligence derived worker" } = {}) {
  const inputs = await loadIntelligenceCanonicalInputs(tournamentId);
  const calculated = calculateIntelligenceDerivedFromData(inputs);
  const payload = { environment: "PREVIEW", tournament_id: calculated.tournamentId, calculated_by: calculatedBy,
    source_fingerprint: calculated.sourceFingerprint, dependency: calculated.dependency,
    engines: [
      { key: "TOURNAMENT_INTELLIGENCE", version: TOURNAMENT_INTELLIGENCE_ENGINE_VERSION, result: calculated.intelligence.result, payload_hash: calculated.intelligence.payloadHash },
      { key: "PROJECTION_EDITORIAL", version: PROJECTION_EDITORIAL_ENGINE_VERSION, result: calculated.editorial.result, payload_hash: calculated.editorial.payloadHash },
      ...(calculated.recap.gate.eligible ? [{ key: "TOURNAMENT_FINAL_RECAP", version: TOURNAMENT_FINAL_RECAP_ENGINE_VERSION, result: calculated.recap.result, payload_hash: calculated.recap.payloadHash }] : []),
    ], final_gate: calculated.recap.gate, duration_ms: calculated.calculationMs };
  const write = await writeIntelligenceDerivedBundle(payload);
  if (!write.payload?.ok) throw Object.assign(new Error("Intelligence derived state could not be stored."), { code: write.payload?.code || "INTELLIGENCE_WRITE_FAILED" });
  return { inputs, calculated, write: write.payload };
}

export async function currentIntelligenceDerivedState(tournamentId) {
  const read = await readCompetitionDerivedState(tournamentId, INTELLIGENCE_ENGINE_KEYS);
  if (!read.payload?.ok) throw Object.assign(new Error("Intelligence derived state is unavailable."), { code: read.payload?.code || "INTELLIGENCE_READ_UNAVAILABLE" });
  const snapshots = new Map((read.payload.data.snapshots || []).map((row) => [clean(row.engine_key), row]));
  const jobs = new Map((read.payload.data.jobs || []).map((row) => [clean(row.engine_key), row]));
  const module = (key) => { const row = snapshots.get(key); return row ? { result: row.result_payload, engineKey: key,
    engineVersion: row.engine_version, sourceFingerprint: row.source_fingerprint, payloadHash: row.payload_hash,
    calculatedAt: row.calculated_at, stale: clean(jobs.get(key)?.status).toUpperCase() !== "SUCCEEDED" } : null; };
  return { tournamentIntelligence: module("TOURNAMENT_INTELLIGENCE"), projectionEditorial: module("PROJECTION_EDITORIAL"),
    finalRecap: module("TOURNAMENT_FINAL_RECAP"), queryMs: Number(read.payload.data.query_ms || 0), serviceMs: read.durationMs };
}

export { finalGate as tournamentFinalRecapGate };
