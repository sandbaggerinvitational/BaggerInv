import { NextResponse } from "next/server";

import { deliverSupabaseOddsGoogleMirror } from "../../../../lib/championship-odds-google-mirror.js";
import {
  buildSupabaseOddsPublication,
  loadSupabaseOddsInputs,
  readSupabaseOddsPublicationDiagnostics,
  rehearseSupabaseOddsSnapshot,
} from "../../../../lib/championship-odds-supabase.js";
import {
  buildOddsWorkbookPublicationRecords,
  readOddsSnapshots,
  readWorkbookSheetsByName,
} from "../../../../lib/google-sheets-write.js";
import { oddsCalculationEnvironment } from "../../../../lib/odds-calculation-source.js";
import { validateProjectionSnapshot } from "../../../../lib/projection-publication-diagnostics.js";
import {
  buildPublishedOddsImport,
  PUBLISHED_ODDS_WORKBOOK_TABS,
  readPublishedOddsView,
} from "../../../../lib/published-odds-supabase.js";
import { authorizePreviewDirector } from "../../../../lib/preview-director-authorization.js";
import { scoringShadowPayloadHash } from "../../../../lib/scoring-shadow.js";
import {
  ODDS_PUBLICATION_CONTRACT_VERSION,
  simulateTournamentOdds,
  validateOpeningMatchups,
  validateRoundThreePairings,
} from "../../../../lib/tournament-odds.js";

export const dynamic = "force-dynamic";
export const maxDuration = 800;

const clean = (value) => String(value ?? "").trim();
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

async function directorFor(request) {
  const result = await authorizePreviewDirector({ request, allowBootstrap: true });
  return result?.status === "active" ? result : null;
}

function workbookValues(sheets = {}) {
  return Object.fromEntries(PUBLISHED_ODDS_WORKBOOK_TABS.map((tab) => [tab,
    (sheets[tab]?.records || []).map(({ record }) => record)]));
}

function publishedViewState(data = {}) {
  return {
    tournament: data.tournament,
    historyCount: data.history_count,
    snapshots: data.snapshots,
  };
}

function plannedSheets(records = {}) {
  return Object.fromEntries(PUBLISHED_ODDS_WORKBOOK_TABS.map((tab) => [tab, {
    records: (records[tab] || []).map((record, index) => ({ record, rowNumber: index + 2 })),
  }]));
}

async function diagnostics(tournamentId) {
  const result = await readSupabaseOddsPublicationDiagnostics(tournamentId);
  if (!result.payload?.ok) throw Object.assign(new Error("Published Odds publication diagnostics are unavailable."), {
    code: result.payload?.code || "ODDS_PUBLICATION_DIAGNOSTICS_UNAVAILABLE",
  });
  return result.payload.data;
}

async function rehearsePublication({ actorId, tournamentId }) {
  const sources = oddsCalculationEnvironment();
  if (sources.inputSource !== "supabase") throw Object.assign(new Error("Supabase Odds inputs are required for native publication rehearsal."), {
    code: "ODDS_REHEARSAL_SUPABASE_INPUTS_REQUIRED",
  });
  const beforeView = await readPublishedOddsView({ tournamentId, sourceWorkbookId: process.env.GOOGLE_SHEETS_ID });
  if (!beforeView.payload?.ok) throw Object.assign(new Error("Published Odds history is unavailable."), { code: beforeView.payload?.code });
  const current = (beforeView.payload.data.snapshots || []).find((row) => row.is_current_official === true);
  if (!current?.payload) throw Object.assign(new Error("A current official publication is required for rehearsal."), { code: "CURRENT_ODDS_PUBLICATION_REQUIRED" });

  const inputs = await loadSupabaseOddsInputs(tournamentId);
  const opening = validateOpeningMatchups(inputs.sheets);
  if (!opening.ready) throw Object.assign(new Error(opening.firstFailure || "Official pairings are incomplete."), { code: "ODDS_PAIRINGS_INCOMPLETE" });
  if (["Round 3 Pairings Announced", "Final Results"].includes(current.milestone)) {
    const singles = validateRoundThreePairings(inputs.sheets);
    if (!singles.ready) throw Object.assign(new Error(singles.message), { code: "ODDS_SINGLES_PAIRINGS_INCOMPLETE" });
  }

  const iterations = number(current.payload.iterations, 10_000);
  const calculationStartedAt = performance.now();
  const candidate = simulateTournamentOdds({ ...inputs, phase: current.milestone, iterations });
  const calculationMs = performance.now() - calculationStartedAt;
  validateProjectionSnapshot(candidate);

  const googleBeforeSheets = await readWorkbookSheetsByName(PUBLISHED_ODDS_WORKBOOK_TABS);
  const googleBeforeFingerprint = scoringShadowPayloadHash(workbookValues(googleBeforeSheets));
  const workbookPlan = buildOddsWorkbookPublicationRecords(candidate, await readOddsSnapshots());
  const mirrorImport = buildPublishedOddsImport({
    sheets: plannedSheets(workbookPlan.records),
    tournamentId,
    tournamentYear: number(beforeView.payload.data.tournament?.tournament_year),
    sourceWorkbookId: process.env.GOOGLE_SHEETS_ID,
    requestedBy: `${actorId} · publication rehearsal`,
  });
  const mirroredCandidate = mirrorImport.snapshots.find((row) => row.milestone === candidate.phase);
  const reportingFingerprint = clean(mirroredCandidate?.google_publication_fingerprint);
  const publication = buildSupabaseOddsPublication({ snapshot: candidate, tournamentId, actorId, metadata: inputs.metadata });
  const beforeDiagnostics = await diagnostics(tournamentId);
  const rehearsed = await rehearseSupabaseOddsSnapshot({ ...publication,
    rehearsal_google_publication_fingerprint: reportingFingerprint });
  if (!rehearsed.payload?.ok) throw Object.assign(new Error("The native Odds publication rehearsal failed."), {
    code: rehearsed.payload?.code || "ODDS_PUBLICATION_REHEARSAL_FAILED",
    rehearsal: rehearsed.payload,
  });

  const [afterView, afterDiagnostics, googleAfterSheets] = await Promise.all([
    readPublishedOddsView({ tournamentId, sourceWorkbookId: process.env.GOOGLE_SHEETS_ID }),
    diagnostics(tournamentId),
    readWorkbookSheetsByName(PUBLISHED_ODDS_WORKBOOK_TABS),
  ]);
  if (!afterView.payload?.ok) throw Object.assign(new Error("Published Odds history could not be re-read after rehearsal."), { code: afterView.payload?.code });
  const googleAfterFingerprint = scoringShadowPayloadHash(workbookValues(googleAfterSheets));
  const supabaseBeforeFingerprint = scoringShadowPayloadHash(publishedViewState(beforeView.payload.data));
  const supabaseAfterFingerprint = scoringShadowPayloadHash(publishedViewState(afterView.payload.data));
  const diagnosticsBeforeFingerprint = scoringShadowPayloadHash(beforeDiagnostics);
  const diagnosticsAfterFingerprint = scoringShadowPayloadHash(afterDiagnostics);
  const mirrorPayloadPass = scoringShadowPayloadHash(mirroredCandidate?.published_payload) === scoringShadowPayloadHash(candidate);
  const playerContractPass = candidate.publicationContractVersion === ODDS_PUBLICATION_CONTRACT_VERSION
    && candidate.players.every((player, index) => Number.isInteger(player.rank) && player.rank === index + 1 && Number.isFinite(Number(player.rawProbability)));
  const legacyRows = (beforeView.payload.data.snapshots || []).filter((row) => clean(row.payload?.publicationContractVersion || "odds-v2-nassau") === "odds-v2-nassau");
  const pass = mirrorPayloadPass && playerContractPass
    && googleBeforeFingerprint === googleAfterFingerprint
    && supabaseBeforeFingerprint === supabaseAfterFingerprint
    && diagnosticsBeforeFingerprint === diagnosticsAfterFingerprint
    && rehearsed.payload.rollback?.official_state_unchanged === true
    && rehearsed.payload.duplicate_publication?.duplicate === true
    && rehearsed.payload.failed_delivery?.status === "FAILED"
    && rehearsed.payload.successful_delivery?.status === "SUCCEEDED"
    && rehearsed.payload.duplicate_claim?.duplicate === true;

  return {
    pass,
    authorities: { calculationInputs: sources.inputSource, publicationConfigured: sources.requestedPublication,
      publicationResolved: sources.publicationAuthority },
    candidate: { milestone: candidate.phase, phaseOrder: candidate.phaseOrder, iterations: candidate.iterations,
      publishedAt: candidate.publishedAt, engineVersion: candidate.engineVersion,
      contractVersion: candidate.publicationContractVersion, deterministicSeed: candidate.deterministicSeed,
      teams: candidate.teams.length, players: candidate.players.length,
      payloadFingerprint: publication.payload_hash, logicalPayloadFingerprint: publication.logical_payload_hash,
      sourceFingerprint: publication.source_fingerprint, settingsFingerprint: publication.settings_fingerprint,
      ratingsFingerprint: publication.ratings_fingerprint, pairingFingerprint: publication.pairing_fingerprint },
    nativeTransaction: rehearsed.payload,
    immutability: { officialMilestonesBefore: beforeView.payload.data.history_count,
      officialMilestonesAfter: afterView.payload.data.history_count,
      supabaseBeforeFingerprint, supabaseAfterFingerprint,
      diagnosticsBeforeFingerprint, diagnosticsAfterFingerprint, preserved: supabaseBeforeFingerprint === supabaseAfterFingerprint
        && diagnosticsBeforeFingerprint === diagnosticsAfterFingerprint },
    googleMirror: { verified: mirrorPayloadPass, reportingFingerprint,
      plannedSnapshots: workbookPlan.records["Odds Snapshots"].length,
      plannedTeamRows: workbookPlan.records["Odds Team Results"].length,
      plannedPlayerRows: workbookPlan.records["Odds Player Results"].length,
      googleWrites: 0, googleBeforeFingerprint, googleAfterFingerprint,
      unchanged: googleBeforeFingerprint === googleAfterFingerprint },
    contracts: { legacyV2SnapshotsPreserved: legacyRows.length, prospectiveV3FullPrecisionRank: playerContractPass,
      currentOfficialWouldAdvanceTo: rehearsed.payload.simulated_state?.current_official || null },
    timings: { inputPostgresMs: inputs.diagnostics?.queryMs, inputServiceMs: inputs.diagnostics?.serviceMs,
      calculationMs, rehearsalServiceMs: rehearsed.durationMs },
  };
}

export async function GET(request) {
  if (process.env.VERCEL_ENV !== "preview") return NextResponse.json({ error: "Not found." }, { status: 404 });
  const director = await directorFor(request);
  if (!director) return NextResponse.json({ error: "Tournament Director access is required." }, { status: 401 });
  try {
    const tournamentId = clean(director.identity?.tournamentId || "2026");
    return NextResponse.json({ ok: true, sources: oddsCalculationEnvironment(), diagnostics: await diagnostics(tournamentId) });
  } catch (error) {
    return NextResponse.json({ error: "Published Odds publication diagnostics are unavailable.", code: error?.code || "ODDS_PUBLICATION_DIAGNOSTICS_UNAVAILABLE" }, { status: 503 });
  }
}

export async function POST(request) {
  if (process.env.VERCEL_ENV !== "preview") return NextResponse.json({ error: "Not found." }, { status: 404 });
  const director = await directorFor(request);
  if (!director) return NextResponse.json({ error: "Tournament Director access is required." }, { status: 401 });
  try {
    const input = await request.json();
    const action = clean(input.action || "rehearse");
    const actorId = clean(director.identity?.player?.id || "Director");
    const tournamentId = clean(director.identity?.tournamentId || "2026");
    if (action === "rehearse") {
      const result = await rehearsePublication({ actorId, tournamentId });
      return NextResponse.json({ ok: result.pass, action, result }, { status: result.pass ? 200 : 409 });
    }
    if (action === "retry-google-mirror") {
      const sources = oddsCalculationEnvironment();
      if (sources.publicationAuthority !== "supabase") return NextResponse.json({ error: "Supabase is not the selected Preview publication authority." }, { status: 409 });
      const result = await deliverSupabaseOddsGoogleMirror({ snapshotId: clean(input.snapshotId), actorId });
      return NextResponse.json({ ok: result.ok, action, result }, { status: result.ok ? 200 : 503 });
    }
    return NextResponse.json({ error: "Unsupported Odds publication operation." }, { status: 400 });
  } catch (error) {
    console.error("Championship Odds publication operation failed", { code: error?.code || "ODDS_PUBLICATION_OPERATION_FAILED",
      message: error?.message || String(error) });
    return NextResponse.json({ error: "Championship Odds publication certification could not be completed.",
      code: error?.code || "ODDS_PUBLICATION_OPERATION_FAILED",
      ...(process.env.VERCEL_ENV === "preview" && error?.rehearsal ? { rehearsal: error.rehearsal } : {}) }, { status: 503 });
  }
}
