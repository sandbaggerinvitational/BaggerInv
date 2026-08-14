import { NextResponse } from "next/server";
import { authorizePreviewDirector } from "../../../../lib/preview-director-authorization.js";
import { assertParticipantIdentityAdministrativeEnvironment, participantIdentityAuthorityEnvironment } from "../../../../lib/participant-identity-authority.js";
import { validateParticipantIdentityConfiguration } from "../../../../lib/participant-identity.js";
import {
  approveParticipantIdentityConfiguration,
  configureSingleParticipantAuthRehearsal,
  importParticipantIdentityConfiguration,
  inspectParticipantIdentityTournamentResolution,
  inspectParticipantIdentitySecurity,
  linkAuthUserToPlayer,
  readParticipantIdentityAdmin,
  readSingleParticipantAuthRequestAudit,
  readSingleParticipantAuthRehearsalPreflight,
  recordSingleParticipantAuthEmailConfirmation,
  setSingleParticipantAuthRehearsalStatus,
} from "../../../../lib/participant-identity-supabase.js";
import { assertSingleParticipantAuthPreflight, safeParticipantAuthCandidate } from "../../../../lib/participant-auth-rehearsal.js";
import {
  assertApprovedParticipantAuthUser,
  createParticipantAuthAdminClient,
  provisionApprovedAuthUser,
  safeParticipantAuthUserState,
} from "../../../../lib/supabase-auth-admin.js";
import {
  initializePreviewParticipantIdentityConfiguration,
  readPreviewParticipantIdentityTournamentId,
  readPreviewParticipantIdentityConfiguration,
} from "../../../../lib/google-sheets-write.js";

export const dynamic = "force-dynamic";

const unavailable = () => NextResponse.json({ error: "Not found." }, { status: 404 });
const clean = (value) => String(value ?? "").trim();

async function authorize(request) {
  if (process.env.VERCEL_ENV !== "preview") return { response: unavailable() };
  try { assertParticipantIdentityAdministrativeEnvironment(); }
  catch { return { response: unavailable() }; }
  const result = await authorizePreviewDirector({ request, allowBootstrap: true });
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
  const tournamentId = await readPreviewParticipantIdentityTournamentId();
  const admin = await readParticipantIdentityAdmin(tournamentId);
  const source = await readPreviewParticipantIdentityConfiguration();
  const current = admin.payload?.data || {};
  const roster = (current.players || []).map((player) => ({
    playerId: player.playerId,
    displayName: player.displayName,
    teamId: player.teamId,
    participationStatus: player.participationStatus,
  }));
  const resolvedTournamentId = clean(current.tournamentId);
  const validation = validateParticipantIdentityConfiguration({
    tournamentId: resolvedTournamentId,
    roster,
    records: source.records.map(({ record }) => record),
  });
  return {
    tournamentId: resolvedTournamentId,
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

async function loadAuthRehearsal(tournamentId) {
  const result = await readSingleParticipantAuthRehearsalPreflight(tournamentId);
  const data = result.payload || {};
  let authUser = { exists: false, emailConfirmed: false, emailConfirmedAt: null, lastSignInAt: null };
  if (data.rehearsal?.authUserId && data.candidate) {
    const adminClient = createParticipantAuthAdminClient();
    const lookup = await adminClient.auth.admin.getUserById(data.rehearsal.authUserId);
    if (lookup.error) throw lookup.error;
    assertApprovedParticipantAuthUser({ user: lookup.data?.user, candidate: data.candidate, tournamentId });
    authUser = safeParticipantAuthUserState(lookup.data.user);
  }
  const requestAudit = await readSingleParticipantAuthRequestAudit(tournamentId).then((value) => value.payload).catch(() => null);
  const tournamentResolution = data.rehearsal?.authUserId
    ? await inspectParticipantIdentityTournamentResolution(data.rehearsal.authUserId).then((value) => value.payload).catch(() => null)
    : null;
  return {
    approved: data.approved === true,
    ready: data.ready === true,
    approvedFingerprint: data.approvedFingerprint || "",
    activePlayers: Number(data.activePlayers || 0),
    realIdentityCount: Number(data.realIdentityCount || 0),
    dummyIdentityCount: Number(data.dummyIdentityCount || 0),
    participantAuthUsers: Number(data.participantAuthUsers || 0),
    dummyAuthUsers: Number(data.dummyAuthUsers || 0),
    participantLinks: Number(data.participantLinks || 0),
    dummyLinks: Number(data.dummyLinks || 0),
    candidate: safeParticipantAuthCandidate(data.candidate),
    authUser,
    requestAudit,
    tournamentResolution,
    rehearsal: data.rehearsal ? {
      playerId: data.rehearsal.playerId,
      status: data.rehearsal.status,
      shadowEnabled: data.rehearsal.shadowEnabled === true,
      rehearsalRevision: Number(data.rehearsal.rehearsalRevision || 0),
      configuredAt: data.rehearsal.configuredAt,
      configuredBy: data.rehearsal.configuredBy,
    } : null,
  };
}

export async function GET(request) {
  const authorization = await authorize(request);
  if (authorization.response) return authorization.response;
  try {
    const review = await loadReview();
    const [security, authRehearsal] = await Promise.all([
      inspectParticipantIdentitySecurity(),
      loadAuthRehearsal(review.tournamentId),
    ]);
    return NextResponse.json({
      ok: true,
      identity: participantIdentityAuthorityEnvironment(),
      review: { ...review, contacts: undefined },
      security: security.payload,
      authRehearsal,
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
      const tournamentId = await readPreviewParticipantIdentityTournamentId();
      const admin = await readParticipantIdentityAdmin(tournamentId);
      const current = admin.payload?.data || {};
      const players = (current.players || []).filter((player) => clean(player.participationStatus).toUpperCase() === "ACTIVE");
      if (!clean(current.tournamentId) || players.length !== 24) {
        return NextResponse.json({ error: "The canonical Preview tournament roster must contain exactly 24 active Player IDs before initialization." }, { status: 409 });
      }
      const source = await initializePreviewParticipantIdentityConfiguration(director, {
        tournamentId: current.tournamentId,
        players,
      });
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
    if (action === "provision-single-auth") {
      const review = await loadReview();
      const raw = await readSingleParticipantAuthRehearsalPreflight(review.tournamentId);
      const preflight = raw.payload || {};
      const candidate = assertSingleParticipantAuthPreflight(preflight);
      if (review.latestRun?.status !== "APPROVED" || review.latestRun.fingerprint !== preflight.approvedFingerprint || review.fingerprint !== preflight.approvedFingerprint) {
        return NextResponse.json({ error: "The Director-approved mapping fingerprint is no longer current." }, { status: 409 });
      }
      const adminClient = createParticipantAuthAdminClient();
      const provisioned = await provisionApprovedAuthUser({
        email: candidate.emailNormalized,
        playerId: candidate.playerId,
        tournamentId: review.tournamentId,
      }, { client: adminClient });
      if (!provisioned.created && provisioned.user?.app_metadata?.provisioning_scope !== "preview_phase_a_single_player") {
        return NextResponse.json({ error: "An existing Auth identity requires explicit Director review before linking." }, { status: 409 });
      }
      try {
        const linked = await linkAuthUserToPlayer({
          auth_user_id: provisioned.user.id,
          player_id: candidate.playerId,
          tournament_id: review.tournamentId,
          linked_by: director,
        });
        const configured = await configureSingleParticipantAuthRehearsal({
          auth_user_id: provisioned.user.id,
          player_id: candidate.playerId,
          tournament_id: review.tournamentId,
          approved_fingerprint: preflight.approvedFingerprint,
          configured_by: director,
        });
        const verified = await loadAuthRehearsal(review.tournamentId);
        if (verified.dummyAuthUsers !== 0 || verified.dummyLinks !== 0 || verified.participantAuthUsers !== 1 || verified.participantLinks !== 1) {
          throw new Error("Single-player provisioning verification failed closed.");
        }
        return NextResponse.json({ ok: true, action, created: provisioned.created,
          linkCreated: linked.payload?.created === true, configured: configured.payload?.ok === true,
          authRehearsal: verified });
      } catch (error) {
        if (provisioned.created) await adminClient.auth.admin.deleteUser(provisioned.user.id).catch(() => null);
        throw error;
      }
    }
    if (action === "confirm-single-auth-email") {
      const review = await loadReview();
      const raw = await readSingleParticipantAuthRehearsalPreflight(review.tournamentId);
      const preflight = raw.payload || {};
      const candidate = assertSingleParticipantAuthPreflight(preflight);
      if (review.latestRun?.status !== "APPROVED" || review.latestRun.fingerprint !== preflight.approvedFingerprint || review.fingerprint !== preflight.approvedFingerprint) {
        return NextResponse.json({ error: "The Director-approved mapping fingerprint is no longer current." }, { status: 409 });
      }
      if (preflight.participantAuthUsers !== 1 || preflight.participantLinks !== 1 || preflight.dummyAuthUsers !== 0 || preflight.dummyLinks !== 0 ||
          preflight.rehearsal?.playerId !== candidate.playerId || !preflight.rehearsal?.authUserId) {
        return NextResponse.json({ error: "The single-player Auth rehearsal is not in the required isolated state." }, { status: 409 });
      }
      const adminClient = createParticipantAuthAdminClient();
      const beforeLookup = await adminClient.auth.admin.getUserById(preflight.rehearsal.authUserId);
      if (beforeLookup.error) throw beforeLookup.error;
      const beforeUser = assertApprovedParticipantAuthUser({ user: beforeLookup.data?.user, candidate, tournamentId: review.tournamentId });
      const before = safeParticipantAuthUserState(beforeUser);
      let afterUser = beforeUser;
      if (!before.emailConfirmed) {
        const updated = await adminClient.auth.admin.updateUserById(beforeUser.id, { email_confirm: true });
        if (updated.error) throw updated.error;
        const afterLookup = await adminClient.auth.admin.getUserById(beforeUser.id);
        if (afterLookup.error) throw afterLookup.error;
        afterUser = assertApprovedParticipantAuthUser({ user: afterLookup.data?.user, candidate, tournamentId: review.tournamentId });
      }
      const after = safeParticipantAuthUserState(afterUser);
      if (!after.emailConfirmed) throw new Error("Supabase did not confirm the approved Preview participant email.");
      const audited = await recordSingleParticipantAuthEmailConfirmation({
        tournament_id: review.tournamentId,
        player_id: candidate.playerId,
        auth_user_id: afterUser.id,
        approved_fingerprint: preflight.approvedFingerprint,
        actor: director,
        previously_confirmed: before.emailConfirmed,
      });
      const verified = await loadAuthRehearsal(review.tournamentId);
      if (!verified.authUser.emailConfirmed || verified.participantAuthUsers !== 1 || verified.participantLinks !== 1 ||
          verified.dummyAuthUsers !== 0 || verified.dummyLinks !== 0) {
        throw new Error("CB01 email confirmation verification failed closed.");
      }
      return NextResponse.json({ ok: true, action, before, after: verified.authUser, audit: audited.payload, authRehearsal: verified });
    }
    if (action === "suspend-single-auth" || action === "resume-single-auth") {
      const review = await loadReview();
      const raw = await readSingleParticipantAuthRehearsalPreflight(review.tournamentId);
      const authUserId = raw.payload?.rehearsal?.authUserId;
      if (!authUserId) return NextResponse.json({ error: "Prepared single-player Auth rehearsal was not found." }, { status: 409 });
      const nextStatus = action === "suspend-single-auth" ? "SUSPENDED" : "PREPARED";
      const adminClient = createParticipantAuthAdminClient();
      const { error: authError } = await adminClient.auth.admin.updateUserById(authUserId, {
        ban_duration: nextStatus === "SUSPENDED" ? "876000h" : "none",
      });
      if (authError) throw authError;
      const changed = await setSingleParticipantAuthRehearsalStatus({
        tournament_id: review.tournamentId, status: nextStatus, actor: director,
        reason: nextStatus === "SUSPENDED" ? "Director suspended Preview Auth rehearsal" : "",
      });
      return NextResponse.json({ ok: true, action, result: changed.payload });
    }
    return NextResponse.json({ error: "Unsupported identity operation." }, { status: 400 });
  } catch (error) {
    console.error("Participant identity operation failed", { action, message: error?.message, code: error?.identityDiagnostics?.code || "" });
    return NextResponse.json({ error: error?.identityDiagnostics?.message || error?.message || "Participant identity operation failed." }, { status: Number(error?.status) || 400 });
  }
}
