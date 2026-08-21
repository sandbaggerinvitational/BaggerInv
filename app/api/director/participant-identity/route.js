import { NextResponse } from "next/server";
import { authorizePreviewDirector } from "../../../../lib/preview-director-authorization.js";
import { assertParticipantIdentityAdministrativeEnvironment, participantIdentityAuthorityEnvironment } from "../../../../lib/participant-identity-authority.js";
import { validateParticipantIdentityConfiguration } from "../../../../lib/participant-identity.js";
import {
  approveParticipantIdentityConfiguration,
  authorizeParticipantPhoneOtpVerification,
  beginParticipantPhoneOtpAttempt,
  completeParticipantPhoneOtpVerification,
  configureSingleParticipantAuthRehearsal,
  importParticipantIdentityConfiguration,
  inspectParticipantIdentityTournamentResolution,
  inspectParticipantIdentitySecurity,
  linkAuthUserToPlayer,
  manageParticipantAuthPhone,
  readParticipantAuthPhoneAdmin,
  readParticipantPhoneOtpDirectorState,
  readParticipantIdentityAdmin,
  readSingleParticipantAuthRequestAudit,
  readSingleParticipantAuthRehearsalPreflight,
  recordSingleParticipantAuthEmailConfirmation,
  recordParticipantPhoneOtpSend,
  recordParticipantPhoneOtpVerificationFailure,
  setSingleParticipantAuthRehearsalStatus,
} from "../../../../lib/participant-identity-supabase.js";
import { assertSingleParticipantAuthPreflight, safeParticipantAuthCandidate } from "../../../../lib/participant-auth-rehearsal.js";
import {
  maskParticipantAuthPhone,
  normalizeParticipantAuthPhone,
  participantAuthPhoneErrorMessage,
} from "../../../../lib/participant-auth-phone.js";
import {
  attachPhoneToExistingParticipantAuthUser,
  normalizeParticipantPhoneOtpToken,
  participantPhoneOtpClientFingerprint,
  participantPhoneOtpErrorMessage,
  participantPhoneOtpProviderFailureCode,
  requestExistingParticipantPhoneOtp,
  verifyExistingParticipantPhoneOtp,
} from "../../../../lib/participant-phone-otp.js";
import {
  participantSmsAuthFeatureConfigured,
  participantSmsProviderTestConfigured,
} from "../../../../lib/participant-sms-auth-feature.js";
import {
  assertApprovedParticipantAuthUser,
  createParticipantAuthAdminClient,
  createParticipantAuthOtpClient,
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
const PHONE_ACTIONS = new Set(["add-mobile", "change-mobile", "revoke-mobile"]);
const PHONE_OTP_ACTIONS = new Set(["send-test-phone-otp", "verify-test-phone-otp"]);

function sameOriginMutation(request) {
  const origin = clean(request.headers.get("origin"));
  const fetchSite = clean(request.headers.get("sec-fetch-site")).toLowerCase();
  let expectedOrigin = "";
  try { expectedOrigin = new URL(request.url).origin; }
  catch { return false; }
  return origin === expectedOrigin && (!fetchSite || fetchSite === "same-origin");
}

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

async function loadPhoneOwnership(tournamentId, identity) {
  const actorAuthUserId = clean(identity?.authUserId);
  if (!actorAuthUserId) return {
    available: false,
    code: "PHONE_ADMIN_AUTH_ACCOUNT_REQUIRED",
    counts: {},
    players: [],
  };
  const result = await readParticipantAuthPhoneAdmin({ tournamentId, actorAuthUserId });
  if (result.payload?.ok !== true) {
    const error = new Error(participantAuthPhoneErrorMessage(result.payload?.code));
    error.status = result.payload?.code === "PHONE_ADMIN_DIRECTOR_REQUIRED" ? 403 : 409;
    throw error;
  }
  return {
    available: true,
    ...result.payload,
    players: (result.payload.players || []).map((player) => {
      const { lastFour, ...mobile } = player.mobile || {};
      return { ...player, mobile: { ...mobile, masked: lastFour ? maskParticipantAuthPhone(lastFour) : null } };
    }),
  };
}

async function loadPhoneOtpState(tournamentId, identity) {
  const enabled = participantSmsProviderTestConfigured();
  const publicSmsLoginEnabled = participantSmsAuthFeatureConfigured();
  const actorAuthUserId = clean(identity?.authUserId);
  if (!enabled || !actorAuthUserId) return {
    enabled: false,
    publicSmsLoginEnabled,
    counts: {},
    players: [],
  };
  const result = await readParticipantPhoneOtpDirectorState({ tournamentId, actorAuthUserId });
  if (result.payload?.ok !== true) return {
    enabled: false,
    publicSmsLoginEnabled,
    counts: {},
    players: [],
  };
  return {
    enabled: true,
    publicSmsLoginEnabled,
    provider: "Supabase Auth · Twilio Verify",
    resendCooldownSeconds: 60,
    ...result.payload,
  };
}

export async function GET(request) {
  const authorization = await authorize(request);
  if (authorization.response) return authorization.response;
  try {
    const review = await loadReview();
    const [security, authRehearsal, phoneOwnership, phoneOtp] = await Promise.all([
      inspectParticipantIdentitySecurity(),
      loadAuthRehearsal(review.tournamentId),
      loadPhoneOwnership(review.tournamentId, authorization.identity),
      loadPhoneOtpState(review.tournamentId, authorization.identity),
    ]);
    return NextResponse.json({
      ok: true,
      identity: participantIdentityAuthorityEnvironment(),
      review: { ...review, contacts: undefined },
      security: security.payload,
      authRehearsal,
      phoneOwnership,
      phoneOtp,
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
    if (PHONE_OTP_ACTIONS.has(action)) {
      if (!sameOriginMutation(request)) {
        return NextResponse.json({ error: "A same-origin Director request is required." }, { status: 403 });
      }
      if (!participantSmsProviderTestConfigured()) {
        return NextResponse.json({ error: "Not found." }, { status: 404 });
      }
      const actorAuthUserId = clean(authorization.identity?.authUserId);
      if (!actorAuthUserId) {
        return NextResponse.json({ error: "A verified Director Auth account is required." }, { status: 403 });
      }
      const review = await loadReview();
      const rehearsalRead = await readSingleParticipantAuthRehearsalPreflight(review.tournamentId);
      const rehearsalPreflight = rehearsalRead.payload || {};
      const candidate = assertSingleParticipantAuthPreflight(rehearsalPreflight);
      const rehearsal = rehearsalPreflight.rehearsal;
      if (rehearsalPreflight.participantAuthUsers !== 1 || rehearsalPreflight.participantLinks !== 1 ||
          rehearsalPreflight.dummyAuthUsers !== 0 || rehearsalPreflight.dummyLinks !== 0 ||
          rehearsal?.status !== "PREPARED" || rehearsal?.playerId !== candidate.playerId || !rehearsal?.authUserId) {
        return NextResponse.json({ error: participantPhoneOtpErrorMessage("PHONE_OTP_NOT_ELIGIBLE") }, { status: 409 });
      }
      const playerId = clean(input.playerId);
      if (playerId !== candidate.playerId) {
        return NextResponse.json({ error: participantPhoneOtpErrorMessage("PHONE_OTP_NOT_ELIGIBLE") }, { status: 409 });
      }

      if (action === "send-test-phone-otp") {
        const fingerprint = participantPhoneOtpClientFingerprint(
          request,
          process.env.PARTICIPANT_PHONE_OTP_RATE_LIMIT_SECRET,
        );
        const attemptRead = await beginParticipantPhoneOtpAttempt({
          tournament_id: review.tournamentId,
          player_id: playerId,
          actor_auth_user_id: actorAuthUserId,
          client_fingerprint: fingerprint,
        });
        const attempt = attemptRead.payload || {};
        if (attempt.allowed !== true) {
          const code = attempt.code || "PHONE_OTP_NOT_ELIGIBLE";
          return NextResponse.json({
            error: participantPhoneOtpErrorMessage(code),
            code,
            retryAfterSeconds: Number(attempt.retryAfterSeconds || 0),
          }, { status: code === "PHONE_OTP_COOLDOWN" || code === "PHONE_OTP_RATE_LIMITED" ? 429 : 409 });
        }
        if (attempt.playerId !== candidate.playerId || attempt.authUserId !== rehearsal.authUserId ||
            clean(attempt.emailNormalized).toLowerCase() !== candidate.emailNormalized) {
          await recordParticipantPhoneOtpSend({
            attempt_id: attempt.attemptId,
            actor_auth_user_id: actorAuthUserId,
            succeeded: false,
            provider_called: false,
            safe_reason: "PHONE_OTP_AUTH_MISMATCH",
            duration_ms: 0,
          });
          return NextResponse.json({ error: participantPhoneOtpErrorMessage("PHONE_OTP_AUTH_MISMATCH") }, { status: 409 });
        }

        const adminClient = createParticipantAuthAdminClient();
        const otpClient = createParticipantAuthOtpClient();
        const authLookup = await adminClient.auth.admin.getUserById(attempt.authUserId);
        if (authLookup.error) throw authLookup.error;
        assertApprovedParticipantAuthUser({ user: authLookup.data?.user, candidate, tournamentId: review.tournamentId });
        const started = performance.now();
        let attachment;
        try {
          attachment = await attachPhoneToExistingParticipantAuthUser({
            adminClient,
            expectedAuthUserId: attempt.authUserId,
            expectedEmail: candidate.emailNormalized,
            targetPhone: attempt.phoneE164,
          });
          await requestExistingParticipantPhoneOtp({ otpClient, phone: attempt.phoneE164 });
        } catch (error) {
          const providerCalled = Boolean(attachment);
          const code = error?.code === "PHONE_OTP_AUTH_MISMATCH"
            ? "PHONE_OTP_AUTH_MISMATCH"
            : participantPhoneOtpProviderFailureCode(error, "send");
          await recordParticipantPhoneOtpSend({
            attempt_id: attempt.attemptId,
            actor_auth_user_id: actorAuthUserId,
            succeeded: false,
            provider_called: providerCalled,
            auth_phone_attached: attachment?.attached === true,
            safe_reason: code,
            duration_ms: Math.round(performance.now() - started),
          });
          return NextResponse.json({ error: participantPhoneOtpErrorMessage(code), code },
            { status: code === "PHONE_OTP_RATE_LIMITED" ? 429 : code === "PHONE_OTP_AUTH_MISMATCH" ? 409 : 503 });
        }
        const delivery = await recordParticipantPhoneOtpSend({
          attempt_id: attempt.attemptId,
          actor_auth_user_id: actorAuthUserId,
          succeeded: true,
          provider_called: true,
          auth_phone_attached: attachment.attached,
          safe_reason: "PROVIDER_ACCEPTED",
          duration_ms: Math.round(performance.now() - started),
        });
        if (delivery.payload?.ok !== true) {
          return NextResponse.json({ error: participantPhoneOtpErrorMessage(delivery.payload?.code || "PHONE_OTP_STALE") }, { status: 409 });
        }
        return NextResponse.json({
          ok: true,
          action,
          attemptId: attempt.attemptId,
          status: "VERIFICATION_PENDING",
          message: "Verification code requested. Enter the six-digit code from the approved phone.",
          resendCooldownSeconds: 60,
          expiresAt: delivery.payload.expiresAt || attempt.expiresAt,
          sameAuthUser: attachment.sameAuthUser,
          emailPreserved: attachment.emailPreserved,
        });
      }

      const token = normalizeParticipantPhoneOtpToken(input.token);
      const attemptId = clean(input.attemptId);
      if (!/^[0-9a-f-]{36}$/i.test(attemptId)) {
        return NextResponse.json({ error: participantPhoneOtpErrorMessage("PHONE_OTP_INVALID") }, { status: 400 });
      }
      const allowedRead = await authorizeParticipantPhoneOtpVerification({
        attempt_id: attemptId,
        actor_auth_user_id: actorAuthUserId,
      });
      const allowed = allowedRead.payload || {};
      if (allowed.allowed !== true) {
        const code = allowed.code || "PHONE_OTP_INVALID_OR_EXPIRED";
        return NextResponse.json({ error: participantPhoneOtpErrorMessage(code), code }, { status: code === "PHONE_OTP_REPLAY" ? 409 : 400 });
      }
      if (allowed.playerId !== candidate.playerId || allowed.authUserId !== rehearsal.authUserId ||
          clean(allowed.emailNormalized).toLowerCase() !== candidate.emailNormalized) {
        await recordParticipantPhoneOtpVerificationFailure({
          attempt_id: attemptId,
          actor_auth_user_id: actorAuthUserId,
          safe_reason: "PHONE_OTP_AUTH_MISMATCH",
          duration_ms: 0,
        });
        return NextResponse.json({ error: participantPhoneOtpErrorMessage("PHONE_OTP_AUTH_MISMATCH") }, { status: 409 });
      }

      const otpClient = createParticipantAuthOtpClient();
      const started = performance.now();
      const verified = await verifyExistingParticipantPhoneOtp({
        otpClient,
        phone: allowed.phoneE164,
        token,
        expectedAuthUserId: allowed.authUserId,
      });
      if (!verified.ok) {
        const code = verified.error
          ? participantPhoneOtpProviderFailureCode(verified.error, "verify")
          : "PHONE_OTP_AUTH_MISMATCH";
        await recordParticipantPhoneOtpVerificationFailure({
          attempt_id: attemptId,
          actor_auth_user_id: actorAuthUserId,
          safe_reason: code,
          duration_ms: Math.round(performance.now() - started),
        });
        if (verified.sessionCreated) await otpClient.auth.signOut({ scope: "local" }).catch(() => null);
        return NextResponse.json({ error: participantPhoneOtpErrorMessage(code), code },
          { status: code === "PHONE_OTP_AUTH_MISMATCH" ? 409 : code === "PHONE_OTP_PROVIDER_UNAVAILABLE" ? 503 : 400 });
      }

      try {
        const adminClient = createParticipantAuthAdminClient();
        const authLookup = await adminClient.auth.admin.getUserById(allowed.authUserId);
        if (authLookup.error) throw authLookup.error;
        assertApprovedParticipantAuthUser({ user: authLookup.data?.user, candidate, tournamentId: review.tournamentId });
        const completion = await completeParticipantPhoneOtpVerification({
          attempt_id: attemptId,
          actor_auth_user_id: actorAuthUserId,
          returned_auth_user_id: verified.userId,
          duration_ms: Math.round(performance.now() - started),
        });
        if (completion.payload?.ok !== true) {
          return NextResponse.json({
            error: participantPhoneOtpErrorMessage(completion.payload?.code || "PHONE_OTP_AUTH_MISMATCH"),
          }, { status: 409 });
        }
        return NextResponse.json({
          ok: true,
          action,
          status: "VERIFIED",
          sameAuthUser: completion.payload.sameAuthUser === true,
          playerIdUnchanged: completion.payload.playerId === candidate.playerId,
          emailPreserved: completion.payload.emailPreserved === true,
          message: "Mobile verified for the existing Player Passport Auth user.",
        });
      } finally {
        await otpClient.auth.signOut({ scope: "local" }).catch(() => null);
      }
    }
    if (PHONE_ACTIONS.has(action)) {
      if (!sameOriginMutation(request)) {
        return NextResponse.json({ error: "A same-origin Director request is required." }, { status: 403 });
      }
      const actorAuthUserId = clean(authorization.identity?.authUserId);
      if (!actorAuthUserId) {
        return NextResponse.json({ error: "A verified Director Auth account is required." }, { status: 403 });
      }
      const playerId = clean(input.playerId);
      let phoneE164 = "";
      if (action !== "revoke-mobile") {
        try { phoneE164 = normalizeParticipantAuthPhone(input.phone).e164; }
        catch (error) {
          return NextResponse.json({ error: participantAuthPhoneErrorMessage(error?.code || "PHONE_INVALID") }, { status: 400 });
        }
      }
      const review = await loadReview();
      if (!review.review.some((player) => player.playerId === playerId)) {
        return NextResponse.json({ error: participantAuthPhoneErrorMessage("PHONE_PLAYER_NOT_FOUND") }, { status: 404 });
      }
      const operation = action === "add-mobile" ? "ADD_PHONE"
        : action === "change-mobile" ? "CHANGE_PHONE"
        : "REVOKE_PHONE";
      const result = await manageParticipantAuthPhone({
        action: operation,
        tournament_id: review.tournamentId,
        player_id: playerId,
        phone_e164: phoneE164,
        actor_auth_user_id: actorAuthUserId,
      });
      const payload = result.payload || {};
      if (payload.ok !== true) {
        const status = payload.code === "PHONE_ADMIN_DIRECTOR_REQUIRED" ? 403
          : payload.code === "PHONE_PLAYER_NOT_FOUND" ? 404
          : payload.code === "PHONE_INVALID" ? 400
          : 409;
        return NextResponse.json({ error: participantAuthPhoneErrorMessage(payload.code), code: payload.code }, { status });
      }
      return NextResponse.json({
        ok: true,
        action,
        result: {
          changed: payload.changed === true,
          identifierId: payload.identifierId || null,
          status: payload.status,
          maskedPhone: payload.lastFour ? maskParticipantAuthPhone(payload.lastFour) : null,
          verified: payload.verified === true,
        },
      });
    }
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
    const diagnosticsCode = error?.identityDiagnostics?.code || "";
    const phoneSensitive = PHONE_ACTIONS.has(action) || PHONE_OTP_ACTIONS.has(action);
    console.error("Participant identity operation failed", {
      action,
      message: phoneSensitive ? "Participant phone operation failed." : error?.message,
      code: diagnosticsCode,
    });
    if (PHONE_OTP_ACTIONS.has(action)) {
      const code = error?.code || diagnosticsCode || "PHONE_OTP_PROVIDER_UNAVAILABLE";
      return NextResponse.json({ error: participantPhoneOtpErrorMessage(code), code }, { status: Number(error?.status) || 409 });
    }
    if (PHONE_ACTIONS.has(action)) {
      return NextResponse.json({
        error: participantAuthPhoneErrorMessage(diagnosticsCode),
        code: diagnosticsCode || "PHONE_OPERATION_FAILED",
      }, { status: Number(error?.status) || 409 });
    }
    return NextResponse.json({ error: error?.identityDiagnostics?.message || error?.message || "Participant identity operation failed." }, { status: Number(error?.status) || 400 });
  }
}
