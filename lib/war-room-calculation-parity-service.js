import "server-only";

import { predictionInputFingerprint, comparePredictionInputBundles } from "./prediction-input-bundle-contract.js";
import {
  classifyWarRoomInputDifference,
  predictionBundleParityProjection,
} from "./war-room-input-contract.js";
import {
  WAR_ROOM_CALCULATION_ENGINE_VERSIONS,
  WAR_ROOM_CALCULATION_PARITY_VERSION,
  WAR_ROOM_FLOATING_POINT_POLICY,
  calculationInvocationFingerprint,
  compactParitySourceRun,
  compareCalibrationParity,
  compareChampionshipParity,
  compareLineupParity,
  compareMatchupParity,
  compareSimulationParity,
  compareTeamIntelligenceParity,
  runCalibrationParitySource,
  runChampionshipParitySource,
  runLineupParitySource,
  runMatchupParitySource,
  runSimulationParitySource,
  runTeamIntelligenceParitySource,
} from "./war-room-calculation-parity.js";
import { prepareWarRoomInput } from "./war-room-input-service.js";
import { resolveWarRoomInputSource } from "./war-room-input-source.js";

const clean = (value) => String(value ?? "").trim();
const list = (value) => Array.isArray(value) ? value : [];
const hash = (value) => predictionInputFingerprint(value);

const CORRECTION_CHECKS = Object.freeze([
  { id: "2019-production-points-and-team-identity", kind: "tournament", key: "2019", domains: ["PLAYER_STATS", "SBR", "HISTORICAL_CORRECTION"] },
  { id: "2020-production-match-points", kind: "tournament", key: "2020", domains: ["PLAYER_STATS", "SBR", "HISTORICAL_CORRECTION"] },
  { id: "2023-r3-7-production-result", kind: "match", key: "2023-R3-7", domains: ["PLAYER_STATS", "SBR", "PARTNERSHIP", "H2H", "HISTORICAL_CORRECTION"] },
  { id: "ghost-match-record-eligibility", kind: "eligibility", key: "2023", domains: ["PLAYER_STATS", "SBR", "PARTNERSHIP", "H2H"] },
  { id: "2023-pete-dye-course-appearance-alias", kind: "course", key: "PDC01", domains: ["COURSE", "SCORECARD", "EVIDENCE"] },
  { id: "2023-round-3-scorecard-course-context", kind: "course-round", key: "2023-R3", domains: ["COURSE", "SCORECARD", "EVIDENCE"] },
  { id: "2024-round-2-match-4-stroke-semantics", kind: "match", key: "2024-R2-4", domains: ["HANDICAP", "PLAYER_STATS", "SBR", "HISTORICAL_CORRECTION"] },
  { id: "2025-production-team-and-award-source", kind: "tournament", key: "2025", domains: ["PLAYER_STATS", "HISTORICAL_CORRECTION"] },
  { id: "2026-reopened-r1-4-r2-5", kind: "current-matches", key: "2026-R1-4|2026-R2-5", domains: ["CURRENT_STATE", "HANDICAP"] },
]);

function currentPhase(bundle = {}) {
  if (clean(bundle.tournament?.lifecycle).toUpperCase() === "FINAL") return "Final Results";
  const round = Number(bundle.tournament?.currentRound || 0);
  if (round >= 3) return "Round 3 Pairings Announced";
  if (round === 2) return "After Round 1";
  return "Pre-Tournament";
}

function sourceSnapshot(prepared = {}) {
  const bundle = prepared.bundle || {};
  return {
    source: prepared.source,
    tournamentId: bundle.tournament?.id,
    tournamentYear: bundle.tournament?.year,
    bundleFingerprint: bundle.fingerprints?.bundle,
    orderingFingerprint: bundle.fingerprints?.sections?.ordering,
    settingsFingerprint: bundle.predictionSettings?.effectiveFingerprint,
    settingsRevision: bundle.predictionSettings?.revision,
    settingsFreshness: bundle.predictionSettings?.freshness,
    currentStateFingerprint: hash({ tournament: bundle.tournament, teams: bundle.teams, rounds: bundle.rounds, matches: bundle.matches }),
    pairingFingerprint: bundle.fingerprints?.sections?.pairings,
    historicalStatisticsFingerprint: bundle.fingerprints?.sections?.statistics,
    evidenceFingerprint: hash({ evidence: bundle.evidence, scorecards: bundle.fingerprints?.sections?.scorecards, courses: bundle.fingerprints?.sections?.courses }),
    googleForegroundRequests: Number(prepared.diagnostics?.googleForegroundRequests || 0),
    supabaseRequests: Number(prepared.diagnostics?.supabaseRequests || 0),
    fallbackUsed: Boolean(prepared.diagnostics?.fallbackUsed),
    historicalSource: prepared.diagnostics?.historicalSource || null,
    preparationMs: Number(prepared.diagnostics?.totalPreparationMs || 0),
    serializedBytes: Number(prepared.diagnostics?.serializedBytes || 0),
  };
}

function correctionFact(bundle = {}, check = {}) {
  const facts = bundle.historicalFacts || {};
  if (check.kind === "match") return list(facts.matches).find((row) => clean(row.id || row.matchId) === check.key) || null;
  if (check.kind === "tournament") return list(facts.tournaments).find((row) => String(row.year) === check.key) || null;
  if (check.kind === "eligibility") return list(facts.recordEligibility).filter((row) => String(row.year) === check.key);
  if (check.kind === "course") return list(bundle.courses).filter((row) => clean(row.stableCourseId) === check.key && Number(row.year) === 2023);
  if (check.kind === "course-round") return {
    courses: list(bundle.courses).filter((row) => Number(row.year) === 2023 && Number(row.round) === 3),
    scorecards: list(bundle.scorecards).filter((row) => Number(row.year) === 2023 && Number(row.round) === 3),
  };
  if (check.kind === "current-matches") {
    const ids = new Set(check.key.split("|"));
    return list(bundle.matches).filter((row) => ids.has(clean(row.id)));
  }
  return null;
}

function correctionInputAudit(google, supabase) {
  return CORRECTION_CHECKS.map((check) => {
    const googleFact = correctionFact(google.bundle, check);
    const supabaseFact = correctionFact(supabase.bundle, check);
    const googleFingerprint = hash(googleFact);
    const supabaseFingerprint = hash(supabaseFact);
    return {
      id: check.id,
      inputDifference: googleFingerprint !== supabaseFingerprint,
      googleFingerprint,
      supabaseFingerprint,
      causalDomains: check.domains,
    };
  });
}

function inputParity(google, supabase) {
  const compared = comparePredictionInputBundles(
    predictionBundleParityProjection(google.bundle),
    predictionBundleParityProjection(supabase.bundle)
  );
  const differences = compared.differences.map(classifyWarRoomInputDifference);
  const unexplained = differences.filter((row) => row.disposition === "UNEXPLAINED");
  const order = differences.filter((row) => row.classification === "ORDER");
  const reasonCounts = {};
  for (const row of differences) if (row.reason) reasonCounts[row.reason] = (reasonCounts[row.reason] || 0) + 1;
  return {
    pass: unexplained.length === 0 && order.length === 0,
    totalDifferences: differences.length,
    unexplainedDifferences: unexplained.length,
    orderDifferences: order.length,
    reasonCounts,
    unexplained: unexplained.slice(0, 25),
  };
}

export async function captureWarRoomCalculationPair({ env = process.env, timeoutMs = 50_000, expectedSnapshotToken = "" } = {}) {
  const selected = resolveWarRoomInputSource(env);
  if (selected.resolved !== "google") {
    const error = new Error("Step 7E requires the user-facing Preview War Room source to remain Google.");
    error.code = "WAR_ROOM_STEP7E_SOURCE_CHANGED";
    error.status = 409;
    throw error;
  }
  const startedAt = performance.now();
  const google = await prepareWarRoomInput({ scope: "team-intelligence", requestedSource: "google", env, timeoutMs });
  const settingsVerification = {
    sourceFingerprint: google.bundle.predictionSettings.sourceFingerprint,
    effectiveSettingsFingerprint: google.bundle.predictionSettings.effectiveFingerprint,
  };
  const supabase = await prepareWarRoomInput({ scope: "team-intelligence", requestedSource: "supabase", env, timeoutMs, settingsVerification });
  const googleSnapshot = sourceSnapshot(google);
  const supabaseSnapshot = sourceSnapshot(supabase);
  const settingsPass = googleSnapshot.settingsFingerprint === supabaseSnapshot.settingsFingerprint &&
    google.bundle.predictionSettings.contractVersion === "prediction-settings-v1" &&
    supabase.bundle.predictionSettings.contractVersion === "prediction-settings-v1" &&
    supabaseSnapshot.settingsFreshness === "CURRENT";
  if (!settingsPass) {
    const error = new Error("Prediction Settings must be identical and CURRENT before calculation parity runs.");
    error.code = "WAR_ROOM_CALCULATION_SETTINGS_MISMATCH";
    error.status = 409;
    error.diagnostics = { google: googleSnapshot.settingsFingerprint, supabase: supabaseSnapshot.settingsFingerprint, freshness: supabaseSnapshot.settingsFreshness };
    throw error;
  }
  const parity = inputParity(google, supabase);
  if (!parity.pass) {
    const error = new Error("Paired PredictionInputBundle parity contains an unexplained or ordering difference.");
    error.code = "WAR_ROOM_CALCULATION_INPUT_PARITY_BLOCKED";
    error.status = 409;
    error.diagnostics = parity;
    throw error;
  }
  const googlePhase = currentPhase(google.bundle);
  const supabasePhase = currentPhase(supabase.bundle);
  if (google.bundle.tournament.id !== supabase.bundle.tournament.id || googlePhase !== supabasePhase) {
    const error = new Error("Paired inputs do not represent the same tournament and calculation phase.");
    error.code = "WAR_ROOM_CALCULATION_SOURCE_WINDOW_MISMATCH";
    error.status = 409;
    error.diagnostics = {
      google: {
        tournamentId: google.bundle.tournament.id,
        lifecycle: google.bundle.tournament.lifecycle,
        currentRound: google.bundle.tournament.currentRound,
        phase: googlePhase,
      },
      supabase: {
        tournamentId: supabase.bundle.tournament.id,
        lifecycle: supabase.bundle.tournament.lifecycle,
        currentRound: supabase.bundle.tournament.currentRound,
        phase: supabasePhase,
      },
    };
    throw error;
  }
  const snapshotToken = hash({
    googleBundle: googleSnapshot.bundleFingerprint,
    supabaseBundle: supabaseSnapshot.bundleFingerprint,
    googleCurrent: googleSnapshot.currentStateFingerprint,
    supabaseCurrent: supabaseSnapshot.currentStateFingerprint,
    googlePairings: googleSnapshot.pairingFingerprint,
    supabasePairings: supabaseSnapshot.pairingFingerprint,
    settings: googleSnapshot.settingsFingerprint,
    phase: googlePhase,
  });
  if (clean(expectedSnapshotToken) && clean(expectedSnapshotToken) !== snapshotToken) {
    const error = new Error("Tournament/configuration state changed after the paired Step 7E snapshot was frozen.");
    error.code = "WAR_ROOM_CALCULATION_SNAPSHOT_CHANGED";
    error.status = 409;
    error.diagnostics = { expectedSnapshotToken: clean(expectedSnapshotToken), actualSnapshotToken: snapshotToken };
    throw error;
  }
  const publicCapture = {
    contract: WAR_ROOM_CALCULATION_PARITY_VERSION,
    capturedAt: new Date().toISOString(),
    captureWindowMs: Math.max(0, performance.now() - startedAt),
    snapshotToken,
    phase: googlePhase,
    selectedRuntimeSource: selected.resolved,
    calculationConsumersChanged: 0,
    settings: {
      pass: settingsPass,
      contractVersion: google.bundle.predictionSettings.contractVersion,
      effectiveFingerprint: googleSnapshot.settingsFingerprint,
      supabaseRevision: supabaseSnapshot.settingsRevision,
      supabaseFreshness: supabaseSnapshot.settingsFreshness,
    },
    inputParity: parity,
    snapshots: { google: googleSnapshot, supabase: supabaseSnapshot },
    zeroGoogleSupabaseShadow: supabaseSnapshot.googleForegroundRequests === 0 && !supabaseSnapshot.fallbackUsed,
    hiddenFallbackUsed: googleSnapshot.fallbackUsed || supabaseSnapshot.fallbackUsed,
    corrections: correctionInputAudit(google, supabase),
  };
  return { google, supabase, capture: publicCapture };
}

function invocationFor(prepared, operation, capture, options = {}) {
  return calculationInvocationFingerprint({
    bundleFingerprint: prepared.bundle.fingerprints.bundle,
    engineVersion: WAR_ROOM_CALCULATION_ENGINE_VERSIONS[operation],
    calculationType: operation,
    phase: capture.phase,
    iterations: options.iterations || 0,
    seed: options.seed || `step7e|${operation}|v1`,
    selectedPlayers: prepared.bundle.ordering?.keys?.roster || [],
    format: options.format || "SI",
    lineupOrdering: prepared.bundle.ordering?.keys?.pairings || [],
    settingsFingerprint: prepared.bundle.predictionSettings.effectiveFingerprint,
  });
}

function staleFallbackImpact(capture, comparison = {}) {
  const source = capture.snapshots.google.historicalSource || { mode: "unknown", usedBundledFallback: null };
  return {
    mode: source.mode || "unknown",
    usedBundledFallback: source.usedBundledFallback,
    errorCode: source.errorCode || "",
    measuredOutputDifferences: source.usedBundledFallback
      ? Number(comparison.outputDifferenceCount || comparison.intentionalCanonicalDifferences || comparison.playerDifferenceCount || 0)
      : 0,
    interpretation: source.usedBundledFallback
      ? "The measured Google output includes the established bundled fallback; Supabase was not degraded to reproduce it."
      : source.usedBundledFallback === false
        ? "The certification Google bundle used live Google historical data; bundled fallback impact is zero."
        : "The Google historical source mode could not be independently established.",
  };
}

function correctionImpact(capture, comparison = {}) {
  const domains = new Set([
    ...Object.keys(comparison.attributionCounts || {}),
    ...list(comparison.causalDomains),
    ...Object.values(comparison.formats || {}).flatMap((row) => list(row.causalDomains)),
    ...list(comparison.comparisons).flatMap((row) => list(row.causalDomains)),
    ...list(comparison.factual?.causalDomains),
    ...list(comparison.editorial?.causalDomains),
  ]);
  const measuredDifferences = Number(comparison.outputDifferenceCount || comparison.intentionalCanonicalDifferences || comparison.playerDifferenceCount || 0);
  return capture.corrections.map((row) => ({
    id: row.id,
    inputDifference: row.inputDifference,
    calculationRelevantDomainChanged: row.causalDomains.some((domain) => domains.has(domain)),
    measuredAggregateOutputDifferences: row.inputDifference && row.causalDomains.some((domain) => domains.has(domain)) ? measuredDifferences : 0,
    attributionScope: "Aggregate deterministic output impact; Step 7E does not mutate facts to run a counterfactual correction rollback.",
  }));
}

export async function runWarRoomCalculationParity({
  operation = "capture",
  env = process.env,
  expectedSnapshotToken = "",
  iterations = 10_000,
  repeat = 2,
  timeoutMs = 50_000,
} = {}) {
  const pair = await captureWarRoomCalculationPair({ env, timeoutMs, expectedSnapshotToken });
  if (operation === "capture") return { ok: true, operation, capture: pair.capture };
  const options = { iterations: Math.max(10_000, Math.trunc(Number(iterations) || 10_000)), repeat: Math.max(2, Math.trunc(Number(repeat) || 2)), phase: pair.capture.phase };
  let google;
  let supabase;
  let comparison;
  if (operation === "championship") {
    google = runChampionshipParitySource(pair.google, options);
    supabase = runChampionshipParitySource(pair.supabase, options);
    comparison = compareChampionshipParity(google, supabase);
  } else if (operation === "matchup") {
    google = runMatchupParitySource(pair.google, options);
    supabase = runMatchupParitySource(pair.supabase, options);
    comparison = compareMatchupParity(google, supabase);
  } else if (operation === "simulation") {
    google = runSimulationParitySource(pair.google, options);
    supabase = runSimulationParitySource(pair.supabase, { ...options, scenarioIds: google.rows.map((row) => row.id) });
    comparison = compareSimulationParity(google, supabase);
  } else if (operation === "optimizer") {
    google = runLineupParitySource(pair.google, options);
    supabase = runLineupParitySource(pair.supabase, options);
    comparison = compareLineupParity(google, supabase);
  } else if (operation === "team-intelligence") {
    google = runTeamIntelligenceParitySource(pair.google, options);
    supabase = runTeamIntelligenceParitySource(pair.supabase, options);
    comparison = compareTeamIntelligenceParity(google, supabase);
  } else if (operation === "calibration") {
    google = runCalibrationParitySource(pair.google, options);
    supabase = runCalibrationParitySource(pair.supabase, options);
    comparison = compareCalibrationParity(google, supabase);
  } else {
    const error = new Error(`Unsupported Step 7E calculation operation ${operation}.`);
    error.code = "WAR_ROOM_CALCULATION_OPERATION_INVALID";
    error.status = 400;
    throw error;
  }
  const invocations = {
    google: invocationFor(pair.google, operation, pair.capture, options),
    supabase: invocationFor(pair.supabase, operation, pair.capture, options),
  };
  const repeatabilityPass = operation === "simulation"
    ? google.rows.every((row) => row.repeatability.pass) && supabase.rows.every((row) => row.repeatability.pass)
    : operation === "optimizer"
      ? Object.values(google.formats).every((row) => row.repeatability.pass) && Object.values(supabase.formats).every((row) => row.repeatability.pass)
      : google.repeatability?.pass !== false && supabase.repeatability?.pass !== false;
  const pass = Boolean(comparison.pass && repeatabilityPass && pair.capture.zeroGoogleSupabaseShadow && pair.capture.settings.pass && pair.capture.selectedRuntimeSource === "google");
  return {
    ok: pass,
    operation,
    capture: pair.capture,
    engineVersion: WAR_ROOM_CALCULATION_ENGINE_VERSIONS[operation],
    floatingPointPolicy: WAR_ROOM_FLOATING_POINT_POLICY,
    invocations,
    runs: { google: compactParitySourceRun(google), supabase: compactParitySourceRun(supabase) },
    comparison,
    repeatabilityPass,
    staleJsonFallbackImpact: staleFallbackImpact(pair.capture, comparison),
    historicalCorrectionImpact: correctionImpact(pair.capture, comparison),
    cutoverRecommendation: pass ? "ELIGIBLE_AFTER_ALL_STEP_7E_OPERATIONS_PASS" : "BLOCKED",
  };
}
