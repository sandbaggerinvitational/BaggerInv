import { NextResponse } from "next/server";

import { authorizePreviewDirector } from "../../../../lib/preview-director-authorization.js";
import {
  assertProductionCutoverActivation,
  assertProductionCutoverRequest,
} from "../../../../lib/production-cutover-activation-contract.js";
import {
  mutateProductionPlayersAccess,
  readProductionPlayersAccess,
} from "../../../../lib/production-player-access-server.js";
import {
  mutateProductionAccessGovernance,
  readProductionAccessGovernance,
} from "../../../../lib/production-access-governance-server.js";
import {
  mergeProductionPlayerAccessGovernance,
} from "../../../../lib/production-access-governance-contract.js";
import {
  dataAuthorityResponseHeaders,
  withDataAuthorityRequestScope,
} from "../../../../lib/data-authority-request.js";

export const dynamic = "force-dynamic";

const clean = (value) => String(value ?? "").trim();
const responseHeaders = { "Cache-Control": "private, no-store" };
const PLAYER_ACCESS_ACTIONS = new Set([
  "approve-email",
  "approve-phone",
  "revoke-phone",
  "set-login-preference",
  "suspend-access",
  "resume-access",
  "bulk-enroll",
]);
const GOVERNANCE_ACTIONS = new Set([
  "create-player",
  "set-global-status",
  "withdraw-membership",
  "reactivate-membership",
  "grant-director",
  "revoke-director",
]);
const ACTIONS = new Set([...PLAYER_ACCESS_ACTIONS, ...GOVERNANCE_ACTIONS]);

function unavailable() {
  return NextResponse.json({ error: "Not found." }, { status: 404, headers: responseHeaders });
}

async function authorize(request, { mutation = false } = {}) {
  if (clean(process.env.VERCEL_ENV).toLowerCase() !== "production") {
    return { response: unavailable() };
  }
  try {
    assertProductionCutoverActivation({ requiredPhase: "OBSERVATION" });
    if (mutation) assertProductionCutoverRequest(request, process.env, { requireOrigin: true });
  } catch {
    return { response: unavailable() };
  }
  const result = await authorizePreviewDirector({
    request,
    env: process.env,
    allowBootstrap: false,
  });
  if (result.status === "unavailable") {
    return {
      response: NextResponse.json({
        error: "Director verification is temporarily unavailable.",
        code: "DIRECTOR_AUTHORIZATION_UNAVAILABLE",
      }, { status: 503, headers: { ...responseHeaders, "Retry-After": "1" } }),
    };
  }
  if (result.status !== "active" || result.source !== "production-director-entitlement") {
    return {
      response: NextResponse.json({
        error: "Active Tournament Director access is required.",
        code: "DIRECTOR_AUTHORIZATION_REQUIRED",
      }, { status: 403, headers: responseHeaders }),
    };
  }
  return { identity: result.identity };
}

function actor(identity = {}) {
  return {
    actorAuthUserId: clean(identity.authUserId),
    actorPlayerId: clean(identity.actor?.id || identity.player?.id),
  };
}

function safeFailure(error) {
  const candidate = clean(error?.code).toUpperCase();
  const code = /^(?:PLAYER_ACCESS|ACCESS_GOVERNANCE)_[A-Z0-9_]{3,120}$/.test(candidate)
    ? candidate
    : "PLAYER_ACCESS_OPERATION_FAILED";
  const messages = {
    PLAYER_ACCESS_EMAIL_INVALID: "Enter a valid, real participant email. Placeholder addresses are not allowed.",
    PLAYER_ACCESS_PHONE_INVALID: "Enter a valid mobile number with its country code.",
    PLAYER_ACCESS_EMAIL_COLLISION: "That email is already approved for another Player.",
    PLAYER_ACCESS_PHONE_COLLISION: "That mobile number is already approved for another Player.",
    PLAYER_ACCESS_ACTIVE_MEMBERSHIP_REQUIRED: "Identifiers may be approved only for an active 2026 tournament member.",
    PLAYER_ACCESS_LINKED_EMAIL_REPAIR_REQUIRED: "This linked account needs a certified identity repair before its email can change.",
    PLAYER_ACCESS_LINKED_IDENTITY_REQUIRED: "Participant access can change only after the Player has completed first-login linking.",
    PLAYER_ACCESS_ENROLLMENT_CLAIM_IN_FLIGHT: "A first-login enrollment is already in progress. Try again after it finishes.",
    PLAYER_ACCESS_VERIFIED_PHONE_REPAIR_REQUIRED: "A verified phone requires a certified repair flow before replacement or revocation.",
    PLAYER_ACCESS_PHONE_CLAIM_IN_FLIGHT: "Mobile verification is already in progress. Try again after it finishes.",
    PLAYER_ACCESS_VERIFIED_PHONE_REQUIRED: "Phone Primary becomes available only after the phone is verified.",
    PLAYER_ACCESS_DIRECTOR_ACCESS_REVIEW_REQUIRED: "Director access must be reviewed separately before participant access can be suspended.",
    PLAYER_ACCESS_RESUME_IDENTITY_NOT_READY: "Participant access cannot resume until the current membership and verified identity are valid.",
    PLAYER_ACCESS_REVISION_STALE: "Players & Access changed since this page loaded. Refresh and review again.",
    ACCESS_GOVERNANCE_PLAYER_NAME_INVALID: "Enter a valid Player name.",
    ACCESS_GOVERNANCE_DISPLAY_NAME_INVALID: "Enter a valid Player display name.",
    ACCESS_GOVERNANCE_PLAYER_SLUG_INVALID: "Use a unique lowercase profile slug containing letters, numbers, and hyphens.",
    ACCESS_GOVERNANCE_GLOBAL_STATUS_INVALID: "Select Active or Alumni.",
    ACCESS_GOVERNANCE_REASON_REQUIRED: "Enter a concise non-sensitive reason.",
    ACCESS_GOVERNANCE_CONFIRMATION_REQUIRED: "Confirm this high-impact access change before continuing.",
    ACCESS_GOVERNANCE_REVISION_STALE: "Access governance changed since this page loaded. Refresh and review again.",
    ACCESS_GOVERNANCE_PROFILE_REVISION_REQUIRED: "Refresh this Player profile before changing its status.",
    ACCESS_GOVERNANCE_MEMBERSHIP_REVISION_REQUIRED: "Refresh this tournament membership before changing it.",
    ACCESS_GOVERNANCE_PROFILE_REVISION_STALE: "This Player profile changed since the page loaded. Refresh and review the status change again.",
    ACCESS_GOVERNANCE_MEMBERSHIP_REVISION_STALE: "This tournament membership changed since the page loaded. Refresh and review the membership change again.",
    ACCESS_GOVERNANCE_PLAYER_ID_COLLISION: "The next stable Player ID could not be reserved safely. Refresh and try again.",
    ACCESS_GOVERNANCE_PLAYER_INPUT_INVALID: "Enter valid Player details before continuing.",
    ACCESS_GOVERNANCE_PLAYER_IDENTITY_COLLISION: "A Player with that identity already exists.",
    ACCESS_GOVERNANCE_PLAYER_ID_SPACE_EXHAUSTED: "A stable Player ID could not be allocated safely.",
    ACCESS_GOVERNANCE_PLAYER_SLUG_COLLISION: "That Player profile slug is already in use.",
    ACCESS_GOVERNANCE_DUPLICATE_PLAYER: "That Player already exists.",
    ACCESS_GOVERNANCE_MEMBERSHIP_DEPENDENCY_BLOCKED: "This membership change is blocked by current tournament dependencies.",
    ACCESS_GOVERNANCE_ACTIVE_MEMBERSHIP_BLOCKS_ALUMNI: "Withdraw the Player from the active tournament before changing the global status to Alumni.",
    ACCESS_GOVERNANCE_ACTIVE_MEMBERSHIP_REQUIRED: "This action requires active tournament membership.",
    ACCESS_GOVERNANCE_INACTIVE_MEMBERSHIP_REQUIRED: "Only a withdrawn or inactive tournament member can be reactivated.",
    ACCESS_GOVERNANCE_ACTIVE_GLOBAL_PLAYER_REQUIRED: "Only an Active global Player can return to the tournament roster.",
    ACCESS_GOVERNANCE_OWNER_REQUIRED: "Owner access is required for Director entitlement changes.",
    ACCESS_GOVERNANCE_ACTIVE_OWNER_REQUIRED: "Active Owner access is required for Director entitlement changes.",
    ACCESS_GOVERNANCE_OWNER_ADOPTION_REQUIRED: "Owner governance must be adopted through the certified owner process before Director entitlements can change.",
    ACCESS_GOVERNANCE_LINKED_IDENTITY_REQUIRED: "Director access requires an active linked participant identity.",
    ACCESS_GOVERNANCE_LINKED_AUTH_REQUIRED: "Director access requires an active linked and verified participant identity.",
    ACCESS_GOVERNANCE_TARGET_ALREADY_OWNER: "An active Production Owner does not need a separate Director grant.",
    ACCESS_GOVERNANCE_SELF_REVOKE_BLOCKED: "You cannot revoke your own Director access.",
    ACCESS_GOVERNANCE_OWNER_REVOKE_BLOCKED: "Owner access cannot be revoked through the Director operation.",
    ACCESS_GOVERNANCE_FINAL_OWNER_PROTECTED: "The final Production Owner cannot be revoked.",
    ACCESS_GOVERNANCE_FINAL_ADMIN_PROTECTED: "The final active Production administrator cannot be revoked.",
    ACCESS_GOVERNANCE_SAFE_REASON_REQUIRED: "Enter a concise non-sensitive governance reason.",
  };
  return {
    error: messages[code] || "The Players & Access operation did not complete.",
    code,
  };
}

export async function GET(request) {
  const access = await authorize(request);
  if (access.response) return access.response;
  try {
    const scoped = await withDataAuthorityRequestScope({
      label: "production-players-access-read",
      source: "supabase-production-players-access-v1",
    }, async () => {
      const identity = actor(access.identity);
      const [playersAccess, governance] = await Promise.all([
        readProductionPlayersAccess(identity),
        readProductionAccessGovernance(identity),
      ]);
      return mergeProductionPlayerAccessGovernance(playersAccess, governance);
    });
    return NextResponse.json({ ok: true, data: scoped.result }, {
      headers: { ...responseHeaders, ...dataAuthorityResponseHeaders(scoped.diagnostics) },
    });
  } catch (error) {
    console.error("Production Players & Access read failed", {
      code: clean(error?.code || "PLAYER_ACCESS_READ_FAILED"),
      status: Number(error?.status || 0),
    });
    return NextResponse.json(safeFailure(error), {
      status: Number(error?.status || 503),
      headers: responseHeaders,
    });
  }
}

export async function POST(request) {
  const access = await authorize(request, { mutation: true });
  if (access.response) return access.response;
  let input;
  try { input = await request.json(); }
  catch {
    return NextResponse.json({
      error: "A JSON request body is required.",
      code: "PLAYER_ACCESS_INPUT_INVALID",
    }, { status: 400, headers: responseHeaders });
  }
  const action = clean(input?.action).toLowerCase();
  if (!ACTIONS.has(action)) {
    return NextResponse.json({
      error: "Unsupported Players & Access action.",
      code: "PLAYER_ACCESS_ACTION_INVALID",
    }, { status: 400, headers: responseHeaders });
  }
  try {
    const governanceAction = GOVERNANCE_ACTIONS.has(action);
    const scoped = await withDataAuthorityRequestScope({
      label: `production-players-access-${action}`,
      source: governanceAction
        ? "supabase-production-access-governance-v1"
        : "supabase-production-players-access-v1",
    }, () => governanceAction
      ? mutateProductionAccessGovernance({
        ...actor(access.identity),
        action,
        expectedRevision: input.governanceRevision ?? input.expectedGovernanceRevision ?? input.expectedRevision,
        expectedProfileRevision: input.expectedProfileRevision,
        expectedMembershipRevision: input.expectedMembershipRevision,
        operationRequestId: input.operationRequestId,
        playerId: input.playerId,
        firstName: input.firstName,
        lastName: input.lastName,
        displayName: input.displayName,
        slug: input.slug,
        globalStatus: input.globalStatus,
        reason: input.reason,
        confirmed: input.confirmed,
      })
      : mutateProductionPlayersAccess({
        ...actor(access.identity),
        action,
        expectedRevision: input.expectedRevision,
        operationRequestId: input.operationRequestId,
        playerId: input.playerId,
        email: input.email,
        phone: input.phone,
        preferredLoginMethod: input.preferredLoginMethod,
        entries: input.entries,
      }));
    return NextResponse.json({
      ok: true,
      action,
      data: scoped.result,
      fallbackUsed: false,
      googleRequests: 0,
    }, {
      headers: { ...responseHeaders, ...dataAuthorityResponseHeaders(scoped.diagnostics) },
    });
  } catch (error) {
    console.error("Production Players & Access mutation failed", {
      action,
      code: clean(error?.code || "PLAYER_ACCESS_OPERATION_FAILED"),
      status: Number(error?.status || 0),
    });
    return NextResponse.json(safeFailure(error), {
      status: Number(error?.status || 503),
      headers: responseHeaders,
    });
  }
}
