import { getTeamMomentum } from "./live-tournament.js";
import { leaderboardsCoreDataFromSupabaseView, readLeaderboardsCoreView } from "./leaderboards-core-supabase.js";
import { netSkinsDataFromResultView, readNetSkinsResultView } from "./net-skins-supabase.js";
import { scoringShadowPayloadHash, scoringShadowRpc } from "./scoring-shadow.js";
import { tournamentStorylines } from "./tournament-storylines.js";

export const TEAM_MOMENTUM_ENGINE_VERSION = "team-momentum-js-v1";
export const TOURNAMENT_STORYLINES_ENGINE_VERSION = "tournament-storylines-js-v1";

const clean = (value) => String(value ?? "").trim();
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
}

export async function readCompetitionDerivedState(tournamentId, engineKeys = ["TEAM_MOMENTUM", "TOURNAMENT_STORYLINES"], options = {}) {
  return scoringShadowRpc("read_competition_derived_state", {
    target_tournament_id: clean(tournamentId), target_engine_keys: engineKeys,
  }, { ...options, timeoutMs: options.timeoutMs || 8_000 });
}

export async function writeCompetitionDerivedSnapshot(input, options = {}) {
  return scoringShadowRpc("write_competition_derived_snapshot", { input }, {
    ...options, timeoutMs: options.timeoutMs || 15_000,
  });
}

function momentumDependency(rounds = [], tournamentId = "") {
  return stable({ tournamentId: clean(tournamentId), officialResults: rounds.flatMap((round) =>
    (round.matches || []).filter((match) => clean(match.status).toUpperCase() === "FINAL").map((match) => ({
      round: number(round.number), match: clean(match.match), matchId: clean(match.id),
      format: clean(match.format), status: clean(match.status),
      frontWinner: clean(match.frontWinner), backWinner: clean(match.backWinner),
      overallWinner: clean(match.overallWinner || match.matchupWinner),
      team1Points: number(match.team1Points), team2Points: number(match.team2Points),
      finalizedAt: clean(match.finalizedAt),
    }))).sort((left, right) => left.round - right.round || left.match.localeCompare(right.match)) });
}

export function storylineSemanticRecord(story = {}) {
  return {
    id: clean(story.id), category: clean(story.category), scope: clean(story.scope),
    icon: clean(story.icon), label: clean(story.label), headline: clean(story.headline),
    detail: clean(story.detail), updatedAt: story.updatedAt == null ? null : Number(story.updatedAt),
    accessibleLabel: clean(story.accessibleLabel), editorialRank: number(story.editorialRank),
    timeRelative: clean(story.id).startsWith("clinch-"),
    expiresAt: clean(story.id).startsWith("clinch-") && Number.isFinite(Number(story.updatedAt))
      ? new Date(Number(story.updatedAt) + 60 * 60_000).toISOString() : null,
  };
}

export function activePreparedStorylines(payload = {}, now = Date.now()) {
  return (payload.stories || []).filter((story) => !story.expiresAt || Date.parse(story.expiresAt) > Number(now));
}

export function calculateCompetitionDerivedFromData(data = {}, { referenceTime = Date.now() } = {}) {
  const startedAt = performance.now();
  const tournamentId = clean(data.tournament?.id || data.tournament?.year);
  const momentumDependencyPayload = momentumDependency(data.rounds || [], tournamentId);
  const momentum = getTeamMomentum(data.rounds || []);
  const rawStories = tournamentStorylines(data, { now: Number(referenceTime) });
  const stories = rawStories.map(storylineSemanticRecord);
  const netSkinsDependencies = (data.netSkins?.rounds || []).map((round) => ({
    round: number(round.round), sourceFingerprint: clean(round.sourceFingerprint),
    configurationFingerprint: clean(round.configurationFingerprint), payloadHash: clean(round.payloadHash),
    resultState: clean(round.resultState),
  })).sort((left, right) => left.round - right.round);
  const storylineDependency = stable({
    tournamentId,
    sourceRevision: data.sourceRevision || {},
    presentationFingerprint: clean(data.presentation?.fingerprint),
    netSkins: netSkinsDependencies,
  });
  return {
    tournamentId,
    referenceTime: new Date(Number(referenceTime)).toISOString(),
    momentum: {
      value: momentum,
      sourceFingerprint: scoringShadowPayloadHash(momentumDependencyPayload),
      configurationFingerprint: scoringShadowPayloadHash({ engine: TEAM_MOMENTUM_ENGINE_VERSION, contract: "official ordered segment winners" }),
      dependency: momentumDependencyPayload,
    },
    storylines: {
      stories,
      moments: stories.slice(0, 6),
      sourceFingerprint: scoringShadowPayloadHash(storylineDependency),
      configurationFingerprint: scoringShadowPayloadHash({ engine: TOURNAMENT_STORYLINES_ENGINE_VERSION, scope: "CURRENT_TOURNAMENT", maxHomeMoments: 6 }),
      dependency: storylineDependency,
      timeRelativeContract: { labelsCalculatedOnRead: true, expiringSemanticCategories: ["recent-clinch"], referenceTime: new Date(Number(referenceTime)).toISOString() },
    },
    calculationMs: performance.now() - startedAt,
  };
}

function snapshotInput({ tournamentId, engineKey, engineVersion, configurationFingerprint,
  sourceFingerprint, resultPayload, calculatedBy, startedAt, calculatedAt, durationMs }) {
  const payload = stable(resultPayload);
  return {
    environment: "PREVIEW", tournament_id: clean(tournamentId), round_number: 0,
    engine_key: engineKey, engine_version: engineVersion,
    configuration_fingerprint: configurationFingerprint, source_fingerprint: sourceFingerprint,
    result_payload: payload, payload_hash: scoringShadowPayloadHash(payload),
    calculated_by: clean(calculatedBy), started_at: startedAt,
    calculated_at: calculatedAt, duration_ms: durationMs,
  };
}

export async function recalculateCompetitionDerivedTournament(tournamentId, { calculatedBy = "Competition derived-state worker", referenceTime = Date.now() } = {}) {
  let resolvedTournamentId = clean(tournamentId);
  if (!resolvedTournamentId) {
    const scope = await readLeaderboardsCoreView("");
    if (!scope.payload?.ok) throw Object.assign(new Error("Current competition scope is unavailable."), { code: scope.payload?.code || "COMPETITION_SCOPE_UNAVAILABLE" });
    resolvedTournamentId = clean(scope.payload.data?.tournament?.tournament_id);
  }
  const startedAt = new Date().toISOString();
  const inputStarted = performance.now();
  const [coreRead, netSkinsRead] = await Promise.all([
    readLeaderboardsCoreView(resolvedTournamentId), readNetSkinsResultView(resolvedTournamentId),
  ]);
  if (!coreRead.payload?.ok) throw Object.assign(new Error("Competition canonical input is unavailable."), { code: coreRead.payload?.code || "COMPETITION_INPUT_UNAVAILABLE" });
  if (!netSkinsRead.payload?.ok) throw Object.assign(new Error("Net Skins dependency is unavailable."), { code: netSkinsRead.payload?.code || "NET_SKINS_DEPENDENCY_UNAVAILABLE" });
  const core = leaderboardsCoreDataFromSupabaseView(coreRead.payload.data);
  const netSkins = netSkinsDataFromResultView(netSkinsRead.payload.data).netSkins;
  const data = { ...core, netSkins };
  const inputReadMs = performance.now() - inputStarted;
  const calculated = calculateCompetitionDerivedFromData(data, { referenceTime });
  const calculatedAt = new Date().toISOString();
  const writes = await Promise.all([
    writeCompetitionDerivedSnapshot(snapshotInput({
      tournamentId: calculated.tournamentId, engineKey: "TEAM_MOMENTUM", engineVersion: TEAM_MOMENTUM_ENGINE_VERSION,
      configurationFingerprint: calculated.momentum.configurationFingerprint,
      sourceFingerprint: calculated.momentum.sourceFingerprint,
      resultPayload: { momentum: calculated.momentum.value, dependency: calculated.momentum.dependency },
      calculatedBy, startedAt, calculatedAt, durationMs: calculated.calculationMs,
    })),
    writeCompetitionDerivedSnapshot(snapshotInput({
      tournamentId: calculated.tournamentId, engineKey: "TOURNAMENT_STORYLINES", engineVersion: TOURNAMENT_STORYLINES_ENGINE_VERSION,
      configurationFingerprint: calculated.storylines.configurationFingerprint,
      sourceFingerprint: calculated.storylines.sourceFingerprint,
      resultPayload: {
        stories: calculated.storylines.stories, moments: calculated.storylines.moments,
        dependency: calculated.storylines.dependency,
        timeRelativeContract: calculated.storylines.timeRelativeContract,
      },
      calculatedBy, startedAt, calculatedAt, durationMs: calculated.calculationMs,
    })),
  ]);
  if (writes.some((write) => !write.payload?.ok)) throw Object.assign(new Error("Competition derived state could not be stored."),
    { code: writes.find((write) => !write.payload?.ok)?.payload?.code || "COMPETITION_DERIVED_WRITE_FAILED" });
  return { input: data, calculated, writes: writes.map((write) => write.payload),
    inputReadMs, serviceReadMs: coreRead.durationMs + netSkinsRead.durationMs };
}

export function competitionDerivedDataFromView(view = {}, { now = Date.now() } = {}) {
  const snapshots = new Map((view.snapshots || []).map((snapshot) => [clean(snapshot.engine_key), snapshot]));
  const jobs = new Map((view.jobs || []).map((job) => [clean(job.engine_key), job]));
  const momentumSnapshot = snapshots.get("TEAM_MOMENTUM") || null;
  const storylineSnapshot = snapshots.get("TOURNAMENT_STORYLINES") || null;
  const stale = (engine) => clean(jobs.get(engine)?.status).toUpperCase() !== "SUCCEEDED";
  return {
    momentum: momentumSnapshot?.result_payload?.momentum ?? null,
    storylines: storylineSnapshot ? activePreparedStorylines(storylineSnapshot.result_payload, now) : [],
    moments: storylineSnapshot ? activePreparedStorylines(storylineSnapshot.result_payload, now).slice(0, 6) : [],
    metadata: {
      momentum: momentumSnapshot ? { sourceFingerprint: momentumSnapshot.source_fingerprint,
        configurationFingerprint: momentumSnapshot.configuration_fingerprint,
        payloadHash: momentumSnapshot.payload_hash, calculatedAt: momentumSnapshot.calculated_at,
        stale: stale("TEAM_MOMENTUM") } : { stale: true, missing: true },
      storylines: storylineSnapshot ? { sourceFingerprint: storylineSnapshot.source_fingerprint,
        configurationFingerprint: storylineSnapshot.configuration_fingerprint,
        payloadHash: storylineSnapshot.payload_hash, calculatedAt: storylineSnapshot.calculated_at,
        stale: stale("TOURNAMENT_STORYLINES") } : { stale: true, missing: true },
      queryMs: number(view.query_ms),
    },
  };
}

export async function currentCompetitionDerivedState(tournamentId, options = {}) {
  const read = await readCompetitionDerivedState(tournamentId, options.engineKeys);
  if (!read.payload?.ok) throw Object.assign(new Error("Prepared competition state is unavailable."), { code: read.payload?.code || "COMPETITION_DERIVED_READ_UNAVAILABLE" });
  return { ...competitionDerivedDataFromView(read.payload.data, options), serviceMs: read.durationMs };
}

export function compareCompetitionDerivedParity(expectedData, actualData, { referenceTime = Date.now() } = {}) {
  const expected = calculateCompetitionDerivedFromData(expectedData, { referenceTime });
  const actual = calculateCompetitionDerivedFromData(actualData, { referenceTime });
  const momentumPass = JSON.stringify(expected.momentum.value) === JSON.stringify(actual.momentum.value);
  const storylinesPass = JSON.stringify(expected.storylines.stories) === JSON.stringify(actual.storylines.stories);
  return { pass: momentumPass && storylinesPass, momentum: { pass: momentumPass,
    expected: momentumPass ? undefined : expected.momentum.value, actual: momentumPass ? undefined : actual.momentum.value },
    storylines: { pass: storylinesPass, expectedCount: expected.storylines.stories.length,
      actualCount: actual.storylines.stories.length,
      expected: storylinesPass ? undefined : expected.storylines.stories,
      actual: storylinesPass ? undefined : actual.storylines.stories } };
}
