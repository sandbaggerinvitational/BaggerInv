import { NextResponse } from "next/server";
import { playerPassportTokenFromRequest } from "../../../../lib/player-passport.js";
import { inspectTournamentDirectorToken } from "../../../../lib/player-passport-server.js";
import { assertParticipantIdentityAdministrativeEnvironment, participantIdentityAuthorityEnvironment } from "../../../../lib/participant-identity-authority.js";
import { validateParticipantIdentityConfiguration } from "../../../../lib/participant-identity.js";
import {
  approveParticipantIdentityConfiguration,
  importParticipantIdentityConfiguration,
  inspectParticipantIdentitySecurity,
  readParticipantIdentityAdmin,
} from "../../../../lib/participant-identity-supabase.js";
import {
  initializePreviewParticipantIdentityConfiguration,
  readPreviewParticipantIdentityConfiguration,
} from "../../../../lib/google-sheets-write.js";

export const dynamic = "force-dynamic";

const unavailable = () => NextResponse.json({ error: "Not found." }, { status: 404 });
const clean = (value) => String(value ?? "").trim();

async function authorize(request) {
  if (process.env.VERCEL_ENV !== "preview") return { response: unavailable() };
  try { assertParticipantIdentityAdministrativeEnvironment(); }
  catch { return { response: unavailable() }; }
  const result = await inspectTournamentDirectorToken(playerPassportTokenFromRequest(request));
  if (result.status === "unavailable") return { response: NextResponse.json({ error: "Director verification is temporarily unavailable." }, { status: 503 }) };
  if (result.status !== "active") return { response: NextResponse.json({ error: "Tournament Director access is required." }, { status: 403 }) };
  return { identity: result.identity };
}
function safeLatestRun(run) {
  if (!run) return null;
  return {
    runId: run.run_id,
    status: run.status,
    fingerprint: run.source_fingerprint,
    configurationRevision: Number(run.configuration_revision || 0),
    requestedBy: run.requested_by,
    requestedAt: run.requested_at,
    approvedBy: run.approved_by || "",
    approvedAt: run.approved_at || "",
    quality: run.validation_report || {},
  };
}

async function loadReview() {
  const admin = await readParticipantIdentityAdmin("");
  const source = await readPreviewParticipantIdentityConfiguration();
  const current = admin.payload?.data || {};
  const roster = (current.players || []).map((player) => ({
    playerId: player.playerId,
    displayName: player.displayName,
    teamId: player.teamId,
    participationStatus: player.participationStatus,
  }));
  const tournamentId = clean(current.tournamentId);
  const validation = validateParticipantIdentityConfiguration({
    tournamentId,
    roster,
    records: source.records.map(({ record }) => record),
  });
  return {
    tournamentId,
    source: { exists: source.exists, headers: source.headers, rowCount: source.records.length },
    review: validation.review,
    quality: validation.quality,
    fingerprint: validation.fingerprint,
    contacts: validation.contacts,
    latestRun: safeLatestRun(current.latestRun),
    contextRevision: current.contextRevision?.context_revision || 0,
    linkCount: Number(current.linkCount || 0),
  };
}

export async function GET(request) {
  const authorization = await authorize(request);
  if (authorization.response) return authorization.response;
  try {
    const [review, security] = await Promise.all([loadReview(), inspectParticipantIdentitySecurity()]);
    return NextResponse.json({
      ok: true,
      identity: participantIdentityAuthorityEnvironment(),
      review: { ...review, contacts: undefined },
      security: security.payload,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Participant identity review failed", { message: error?.message, code: error?.identityDiagnostics?.code || "" });
    return NextResponse.json({ error: "Participant identity review is temporarily unavailable." }, { status: 503 });
  }
}

export async function POST(request) {
  const authorization = await authorize(request);
  if (authorization.response) return authorization.response;
  const input = await request.json().catch(() => ({}));
  const action = clean(input.action);
  const director = authorization.identity?.actor?.name || "Tournament Director";
  try {
    if (action === "initialize-source") {
      const source = await initializePreviewParticipantIdentityConfiguration(director);
      return NextResponse.json({ ok: true, action, source: { changed: source.changed, exists: source.exists, headers: source.headers, rowCount: source.records.length } });
    }
    if (action === "refresh") {
      const review = await loadReview();
      if (!review.source.exists) return NextResponse.json({ error: "Initialize Participant Identity Configuration before refreshing." }, { status: 409 });
      const imported = await importParticipantIdentityConfiguration({
        tournament_id: review.tournamentId,
        source_system: "GOOGLE_PREVIEW",
        source_workbook_id: process.env.GOOGLE_SHEETS_ID || process.env.GOOGLE_SHEETS_SPREADSHEET_ID,
        source_fingerprint: review.fingerprint,
        requested_by: director,
        contacts: review.contacts,
      });
      return NextResponse.json({ ok: true, action, result: imported.payload, review: { ...review, contacts: undefined } });
    }
    if (action === "approve") {
      const review = await loadReview();
      const runId = clean(input.runId || review.latestRun?.runId);
      const fingerprint = clean(input.fingerprint || review.latestRun?.fingerprint);
      if (!runId || !fingerprint || !review.quality.pass || review.fingerprint !== fingerprint) {
        return NextResponse.json({ error: "A clean current 24-player mapping must be reviewed before approval." }, { status: 409 });
      }
      const approved = await approveParticipantIdentityConfiguration({ runId, fingerprint, approvedBy: director });
      return NextResponse.json({ ok: true, action, result: approved.payload });
    }
    return NextResponse.json({ error: "Unsupported identity operation." }, { status: 400 });
  } catch (error) {
    console.error("Participant identity operation failed", { action, message: error?.message, code: error?.identityDiagnostics?.code || "" });
    return NextResponse.json({ error: error?.identityDiagnostics?.message || error?.message || "Participant identity operation failed." }, { status: Number(error?.status) || 400 });
  }
}
