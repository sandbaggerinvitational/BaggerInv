import "server-only";

import { createHash } from "node:crypto";
import { types as nodeTypes } from "node:util";

import { PRODUCTION_GOOGLE_WORKBOOK_ID } from
  "./production-foundation-resource-contract.js";
import {
  consumeProductionGoogleDriveAclDbDispatchCapability,
  consumeProductionGoogleDriveAclDbRecoveryCapability,
} from
  "./production-google-writer-fence-receipt-server.js";

export const PRODUCTION_GOOGLE_DRIVE_ACL_FENCE_SCHEMA =
  "step12-production-google-drive-acl-fence-v1";
export const PRODUCTION_GOOGLE_DRIVE_ACL_TRANSITION_INTENT_SCHEMA =
  "step12-production-google-drive-acl-transition-intent-v1";
export const PRODUCTION_GOOGLE_DRIVE_ACL_TRANSITION_PROOF_SCHEMA =
  "step12-production-google-drive-acl-transition-proof-v1";
export const PRODUCTION_GOOGLE_DRIVE_LEGACY_EDIT_CAPABILITY_SCHEMA =
  "step12-production-google-drive-legacy-edit-capability-v1";
export const PRODUCTION_GOOGLE_DRIVE_ACL_PROVIDER_PREFLIGHT_SCHEMA =
  "step12-production-google-drive-acl-provider-preflight-v1";
export const PRODUCTION_GOOGLE_DRIVE_ACL_READ_SCOPE =
  "https://www.googleapis.com/auth/drive.metadata.readonly";
// permissions.update accepts only drive or drive.file. The dedicated identity
// requests drive.file as the least-privilege permission-management scope; a
// complete files.get + permissions.list preflight proves the token can access
// the exact workbook before any ACL PATCH is authorized.
export const PRODUCTION_GOOGLE_DRIVE_ACL_PERMISSION_SCOPE =
  "https://www.googleapis.com/auth/drive.file";
export const PRODUCTION_GOOGLE_DRIVE_ACL_INSTALL_MUTATION_CLASS =
  "DRIVE_LEGACY_PERMISSION_WRITER_TO_READER_V1";
export const PRODUCTION_GOOGLE_DRIVE_ACL_ABORT_MUTATION_CLASS =
  "DRIVE_LEGACY_PERMISSION_READER_TO_WRITER_V1";
export const PRODUCTION_GOOGLE_DRIVE_ACL_LOCAL_DISPATCH_BUDGET_MS = 12_000;

const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3";
const GOOGLE_SHEETS_MIME_TYPE = "application/vnd.google-apps.spreadsheet";
const MAX_PROVIDER_DISPATCH_WINDOW_MS = 15_000;
const MAX_PROVIDER_PREFLIGHT_AGE_MS = 30_000;
const EDIT_ROLES = new Set(["owner", "organizer", "fileorganizer", "writer"]);
const LEGACY_FENCE_ROLES = new Set(["reader", "writer"]);
const privateAclStates = new WeakMap();
const privateLegacyEditCapabilities = new WeakSet();
const privateProviderPreflights = new WeakMap();
const providerMutationCapabilities = new WeakMap();
const authoritativeProductionDriveFetch = globalThis.fetch.bind(globalThis);

const clean = (value) => String(value ?? "").trim();
const lower = (value) => clean(value).toLowerCase();
const upper = (value) => clean(value).toUpperCase();
const sha256 = (value) => createHash("sha256").update(String(value)).digest("hex");
const compare = (left, right) => left < right ? -1 : left > right ? 1 : 0;
const stableValue = (value) => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) =>
      [key, stableValue(value[key])]));
  }
  return value;
};
const fingerprint = (value) => sha256(JSON.stringify(stableValue(value)));
const scalar = (value) => {
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Number.isSafeInteger(value)) return String(value);
  return clean(value);
};
const tupleFingerprint = (domain, values) =>
  sha256([domain, ...values.map(scalar)].join("\n"));
const aclTransitionIntentFingerprint = (value) => tupleFingerprint(
  "production-google-drive-acl-transition-intent-v1",
  [
    value.schemaVersion,
    value.workbookId,
    value.fenceId,
    value.installRequestId,
    value.transitionPhase,
    value.providerMutationClass,
    value.sourceRole,
    value.targetRole,
    value.permissionManagementScope,
    value.legacyPermissionFingerprint,
    value.legacyPrincipalFingerprint,
    value.dedicatedPermissionFingerprint,
    value.dedicatedPrincipalFingerprint,
    value.dedicatedDriveIdentityFingerprint,
    value.priorPermissionInventoryFingerprint,
    value.expectedTargetPermissionInventoryFingerprint,
    value.permissionIdentityFingerprint,
    value.sharingCapabilityFingerprint,
    value.priorAclFingerprint,
    value.priorLegacyCanEdit,
    value.priorLegacyCanShare,
    value.expectedTargetLegacyCanEdit,
    value.expectedTargetLegacyCanShare,
    value.priorLegacyEditCapabilityFingerprint,
    value.expectedTargetLegacyEditCapabilityFingerprint,
    value.legacyDriveIdentityFingerprint,
    value.permissionCount,
    value.priorNonOwnerEditorCount,
    value.expectedTargetNonOwnerEditorCount,
    value.priorEffectiveNonOwnerEditorFingerprint,
    value.expectedTargetEffectiveNonOwnerEditorFingerprint,
  ],
);
const aclTransitionProofFingerprint = (value) => tupleFingerprint(
  "production-google-drive-acl-transition-proof-v1",
  [
    value.schemaVersion,
    value.workbookId,
    value.fenceId,
    value.installRequestId,
    value.transitionPhase,
    value.providerMutationClass,
    value.permissionManagementScope,
    value.transitionIntentFingerprint,
    value.legacyPermissionFingerprint,
    value.legacyPrincipalFingerprint,
    value.priorRole,
    value.currentRole,
    value.priorPermissionInventoryFingerprint,
    value.currentPermissionInventoryFingerprint,
    value.permissionIdentityFingerprint,
    value.sharingCapabilityFingerprint,
    value.dedicatedDriveIdentityFingerprint,
    value.legacyDriveIdentityFingerprint,
    value.priorAclFingerprint,
    value.currentAclFingerprint,
    value.priorLegacyCanEdit,
    value.currentLegacyCanEdit,
    value.priorLegacyCanShare,
    value.currentLegacyCanShare,
    value.priorLegacyEditCapabilityFingerprint,
    value.currentLegacyEditCapabilityFingerprint,
    value.dedicatedCanShare,
    value.writersCanShare,
  ],
);
const isFingerprint = (value) => /^[0-9a-f]{64}$/.test(lower(value));
const isRequestId = (value) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    .test(clean(value));
const timestampMs = (value) => {
  const parsed = Date.parse(clean(value));
  return Number.isFinite(parsed) ? parsed : NaN;
};

function aclOptionsSnapshot(value, allowedKeys, label) {
  const candidate = value == null ? {} : value;
  let prototype;
  let descriptors;
  try {
    if ((typeof candidate !== "object" && typeof candidate !== "function") ||
        candidate === null || nodeTypes.isProxy(candidate)) {
      throw new TypeError(`${label} must be a non-Proxy object.`);
    }
    prototype = Object.getPrototypeOf(candidate);
    descriptors = Object.getOwnPropertyDescriptors(candidate);
  } catch {
    throw aclError(
      "STEP12_GOOGLE_DRIVE_ACL_DEPENDENCY_INJECTION_FORBIDDEN",
      `${label} could not be trusted.`,
      { status: 500, diagnostics: { optionsShapeValid: false } },
    );
  }
  const keys = Reflect.ownKeys(descriptors);
  const unknownKeys = keys.filter((key) =>
    typeof key !== "string" || !allowedKeys.has(key));
  const accessorKeys = keys.filter((key) => {
    const descriptor = descriptors[key];
    return typeof descriptor?.get === "function" ||
      typeof descriptor?.set === "function";
  });
  const plain = prototype === Object.prototype || prototype === null;
  if (!plain || unknownKeys.length || accessorKeys.length) {
    throw aclError(
      "STEP12_GOOGLE_DRIVE_ACL_DEPENDENCY_INJECTION_FORBIDDEN",
      `${label} must be a bounded plain-data object.`,
      {
        status: 500,
        diagnostics: {
          accessorOptionCount: accessorKeys.length,
          optionsShapeValid: plain,
          unknownOptionCount: unknownKeys.length,
        },
      },
    );
  }
  return Object.freeze(Object.fromEntries(keys.map((key) =>
    [key, descriptors[key].value])));
}

function productionDriveTransport(snapshot) {
  const testOverridesAllowed = clean(process.env.NODE_TEST_CONTEXT) === "child-v8";
  if (!testOverridesAllowed && snapshot.fetchImpl !== undefined) {
    throw aclError(
      "STEP12_GOOGLE_DRIVE_ACL_DEPENDENCY_INJECTION_FORBIDDEN",
      "The Production Drive provider transport is module-owned.",
      { status: 500, diagnostics: { injectedProviderTransport: true } },
    );
  }
  const selected = testOverridesAllowed && snapshot.fetchImpl !== undefined
    ? snapshot.fetchImpl : authoritativeProductionDriveFetch;
  if (typeof selected !== "function") {
    throw aclError(
      "STEP12_GOOGLE_DRIVE_ACL_DEPENDENCY_INJECTION_FORBIDDEN",
      "The Production Drive provider transport was unavailable.",
      { status: 500 },
    );
  }
  return selected;
}

function aclError(code, message, { status = 409, diagnostics = {} } = {}) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  error.safeDiagnostics = Object.freeze({ ...diagnostics });
  return error;
}

function monotonicNow() {
  const observed = globalThis.performance?.now?.();
  if (!Number.isFinite(observed)) {
    throw aclError(
      "STEP12_GOOGLE_DRIVE_ACL_MONOTONIC_CLOCK_UNAVAILABLE",
      "A monotonic clock was required for the provider mutation boundary.",
      { status: 503 },
    );
  }
  return observed;
}

function principalFingerprint(type, identifier) {
  return sha256(
    `google-drive-permission-principal-v1\n${type}\n${lower(identifier)}`,
  );
}

function permissionFingerprint(permissionId) {
  return sha256(`google-drive-permission-id-v1\n${clean(permissionId)}`);
}

function normalizedEmail(value, label) {
  const selected = lower(value);
  if (!/^[^\s@]+@[^\s@]+$/.test(selected)) {
    throw aclError(
      "STEP12_GOOGLE_DRIVE_ACL_PRINCIPAL_INVALID",
      `The ${label} Drive principal was invalid.`,
      { status: 503 },
    );
  }
  return selected;
}

function accessToken(value) {
  const selected = clean(value);
  if (selected.length < 16 || /\s/.test(selected)) {
    throw aclError(
      "STEP12_GOOGLE_DRIVE_ACL_TOKEN_INVALID",
      "A short-lived Google Drive access token was required.",
      { status: 503 },
    );
  }
  return selected;
}

function safeProviderReasons(payload = {}) {
  const error = payload?.error && typeof payload.error === "object"
    ? payload.error : {};
  return [...new Set([
    error.status,
    ...(Array.isArray(error.errors) ? error.errors.map((entry) => entry?.reason) : []),
    ...(Array.isArray(error.details) ? error.details.map((entry) => entry?.reason) : []),
  ].map(clean).filter((reason) => /^[A-Za-z][A-Za-z0-9_.-]{1,79}$/.test(reason)))]
    .sort(compare);
}

function mutationClass(targetRole) {
  return targetRole === "reader"
    ? PRODUCTION_GOOGLE_DRIVE_ACL_INSTALL_MUTATION_CLASS
    : PRODUCTION_GOOGLE_DRIVE_ACL_ABORT_MUTATION_CLASS;
}

function transitionPhase(targetRole) {
  return targetRole === "reader" ? "INSTALL" : "ABORT";
}

function receiptField(value, camelName, snakeName) {
  return value?.[camelName] ?? value?.[snakeName];
}

function assertProviderMutationDispatch(capability, intent, providerPreflight) {
  const state = providerMutationCapabilities.get(capability);
  const elapsedMs = state ? monotonicNow() - state.claimStartedMonotonicMs : NaN;
  const valid = state && !state.revoked && !state.consumed &&
    elapsedMs >= 0 && elapsedMs < state.localDispatchBudgetMs &&
    state.fenceId === intent.fenceId &&
    state.installRequestId === intent.installRequestId &&
    state.mutationClass === intent.providerMutationClass &&
    state.targetRole === intent.targetRole &&
    state.transitionIntentFingerprint === intent.transitionIntentFingerprint &&
    state.providerPreflightFingerprint ===
      providerPreflight?.providerPreflightFingerprint;
  if (!valid) {
    throw aclError(
      "STEP12_GOOGLE_DRIVE_ACL_PROVIDER_DISPATCH_DENIED",
      "The ACL mutation was not authorized by a current exclusive provider dispatch.",
      {
        status: 409,
        diagnostics: {
          providerMutationRecoveryRequired: true,
          monotonicBudgetExceeded: Number.isFinite(elapsedMs) &&
            elapsedMs >= (state?.localDispatchBudgetMs ??
              PRODUCTION_GOOGLE_DRIVE_ACL_LOCAL_DISPATCH_BUDGET_MS),
        },
      },
    );
  }
  state.consumed = true;
  state.revoked = true;
  return true;
}

async function driveRequest(token, apiPath, {
  body,
  fetchImpl,
  method = "GET",
  providerMutationCapability = null,
  providerPreflight = null,
  transitionIntent = null,
} = {}) {
  const url = `${DRIVE_API_BASE}${apiPath}`;
  const request = {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  };
  // Deliberately synchronous and immediately adjacent to provider fetch. No
  // token acquisition, DB I/O, readback, or other await may occur after it.
  if (method !== "GET") {
    assertProviderMutationDispatch(
      providerMutationCapability,
      transitionIntent,
      providerPreflight,
    );
  }
  try {
    return await fetchImpl(url, request);
  } catch {
    throw aclError(
      "STEP12_GOOGLE_DRIVE_ACL_RESPONSE_UNKNOWN",
      "The Google Drive ACL provider response was not received.",
      { status: 503 },
    );
  }
}

async function driveJson(token, apiPath, options) {
  const response = await driveRequest(token, apiPath, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw aclError(
      "STEP12_GOOGLE_DRIVE_ACL_PROVIDER_REJECTED",
      "Google Drive rejected the ACL inspection.",
      {
        status: 503,
        diagnostics: {
          providerStatus: response.status,
          providerReasons: safeProviderReasons(payload),
        },
      },
    );
  }
  return payload;
}

async function readSharingCapability(token, workbookId, fetchImpl) {
  const query = new URLSearchParams({
    fields: "id,mimeType,driveId,writersCanShare,capabilities(canShare)",
    supportsAllDrives: "true",
  });
  const payload = await driveJson(
    token,
    `/files/${encodeURIComponent(workbookId)}?${query.toString()}`,
    { fetchImpl },
  );
  if (clean(payload.id) !== workbookId ||
      clean(payload.mimeType) !== GOOGLE_SHEETS_MIME_TYPE) {
    throw aclError(
      "STEP12_GOOGLE_DRIVE_ACL_WORKBOOK_INVALID",
      "The Drive ACL inspection returned an unexpected workbook.",
      { status: 503 },
    );
  }
  const canShare = payload.capabilities?.canShare;
  const writersCanShare = payload.writersCanShare;
  if (canShare !== true || writersCanShare !== true) {
    throw aclError(
      "STEP12_GOOGLE_DRIVE_ACL_OWNER_ACTION_REQUIRED",
      "The dedicated service account cannot change the legacy workbook permission; owner action is required.",
      {
        status: 409,
        diagnostics: {
          dedicatedCanShare: canShare === true,
          writersCanShare: writersCanShare === true,
          sharedDrive: Boolean(clean(payload.driveId)),
        },
      },
    );
  }
  const proof = Object.freeze({
    workbookId,
    mimeType: GOOGLE_SHEETS_MIME_TYPE,
    dedicatedCanShare: true,
    writersCanShare: true,
    sharedDrive: Boolean(clean(payload.driveId)),
  });
  return Object.freeze({ ...proof, fingerprint: fingerprint(proof) });
}

async function readCurrentDriveIdentity(token, expectedEmail, fetchImpl) {
  const query = new URLSearchParams({
    fields: "user(emailAddress,permissionId,me)",
  });
  const payload = await driveJson(token, `/about?${query.toString()}`, { fetchImpl });
  const email = lower(payload?.user?.emailAddress);
  const rawPermissionId = clean(payload?.user?.permissionId);
  if (payload?.user?.me !== true || email !== expectedEmail || !rawPermissionId) {
    throw aclError(
      "STEP12_GOOGLE_DRIVE_ACL_TOKEN_PRINCIPAL_INVALID",
      "The Drive token did not belong to the exact expected service-account principal.",
      { status: 409 },
    );
  }
  const core = Object.freeze({
    principalFingerprint: principalFingerprint("user", email),
    permissionFingerprint: permissionFingerprint(rawPermissionId),
  });
  return Object.freeze({ ...core, fingerprint: fingerprint(core) });
}

async function readPermissions(token, workbookId, fetchImpl) {
  const permissions = [];
  const pages = [];
  let pageToken = "";
  for (let page = 0; page < 20; page += 1) {
    const query = new URLSearchParams({
      fields:
        "nextPageToken,permissions(id,type,role,emailAddress,domain," +
        "allowFileDiscovery,pendingOwner,expirationTime,deleted," +
        "permissionDetails(inherited,inheritedFrom))",
      pageSize: "100",
      supportsAllDrives: "true",
    });
    if (pageToken) query.set("pageToken", pageToken);
    const payload = await driveJson(
      token,
      `/files/${encodeURIComponent(workbookId)}/permissions?${query.toString()}`,
      { fetchImpl },
    );
    if (!Array.isArray(payload.permissions)) {
      throw aclError(
        "STEP12_GOOGLE_DRIVE_ACL_INVENTORY_INCOMPLETE",
        "The Drive permission inventory was incomplete.",
        { status: 503 },
      );
    }
    permissions.push(...payload.permissions);
    const next = clean(payload.nextPageToken);
    pages.push(Object.freeze([
      page + 1,
      sha256(pageToken),
      sha256(next),
      payload.permissions.length,
    ]));
    pageToken = next;
    if (!pageToken) break;
    if (page === 19) {
      throw aclError(
        "STEP12_GOOGLE_DRIVE_ACL_INVENTORY_INCOMPLETE",
        "The Drive permission inventory exceeded its bounded page count.",
        { status: 503 },
      );
    }
  }
  if (!permissions.length) {
    throw aclError(
      "STEP12_GOOGLE_DRIVE_ACL_INVENTORY_EMPTY",
      "The Production workbook had no enumerable Drive permissions.",
      { status: 503 },
    );
  }
  return Object.freeze({ permissions, pages });
}

function normalizedPermission(permission) {
  const id = clean(permission?.id);
  const type = lower(permission?.type);
  const role = lower(permission?.role);
  const identifier = lower(type === "anyone"
    ? "anyone"
    : permission?.emailAddress || permission?.domain || id);
  const rawExpiration = clean(permission?.expirationTime);
  const expirationTime = rawExpiration ? new Date(rawExpiration).toISOString() : "";
  if (!id || !type || !role || !identifier ||
      (rawExpiration && !Number.isFinite(Date.parse(rawExpiration)))) {
    throw aclError(
      "STEP12_GOOGLE_DRIVE_ACL_PERMISSION_AMBIGUOUS",
      "A Drive permission could not be represented by the redacted ACL contract.",
      { status: 503 },
    );
  }
  const inherited = (permission.permissionDetails || []).some((detail) =>
    detail?.inherited === true || clean(detail?.inheritedFrom));
  return Object.freeze({
    rawId: id,
    idFingerprint: permissionFingerprint(id),
    principalFingerprint: principalFingerprint(type, identifier),
    type,
    role,
    pendingOwner: permission.pendingOwner === true,
    allowFileDiscovery: permission.allowFileDiscovery === true,
    inherited,
    deleted: permission.deleted === true,
    expirationTime,
  });
}

function publicPermissionRecord(record) {
  return Object.freeze([
    record.idFingerprint,
    record.principalFingerprint,
    record.type,
    record.role,
    record.pendingOwner,
    record.allowFileDiscovery,
    record.inherited,
    record.deleted,
    record.expirationTime,
  ]);
}

function identityPermissionRecord(record) {
  return Object.freeze([
    record.idFingerprint,
    record.principalFingerprint,
    record.type,
    record.pendingOwner,
    record.allowFileDiscovery,
    record.inherited,
    record.deleted,
    record.expirationTime,
  ]);
}

function effectiveEditorRecords(permissionRecords) {
  return permissionRecords.filter((record) =>
    record[3] !== "owner" && EDIT_ROLES.has(record[3]));
}

async function inspectAcl({
  accessToken: rawAccessToken,
  dedicatedPrincipalEmail,
  fetchImpl,
  inspectionScope,
  legacyPrincipalEmail,
  workbookId,
}) {
  if (workbookId !== PRODUCTION_GOOGLE_WORKBOOK_ID || typeof fetchImpl !== "function" ||
      ![PRODUCTION_GOOGLE_DRIVE_ACL_READ_SCOPE,
        PRODUCTION_GOOGLE_DRIVE_ACL_PERMISSION_SCOPE].includes(inspectionScope)) {
    throw aclError(
      "STEP12_GOOGLE_DRIVE_ACL_INPUT_INVALID",
      "The Drive ACL inspection input was invalid.",
      { status: 503 },
    );
  }
  const token = accessToken(rawAccessToken);
  const dedicatedEmail = normalizedEmail(dedicatedPrincipalEmail, "dedicated");
  const legacyEmail = normalizedEmail(legacyPrincipalEmail, "legacy");
  if (dedicatedEmail === legacyEmail) {
    throw aclError(
      "STEP12_GOOGLE_DRIVE_ACL_PRINCIPAL_COLLISION",
      "The legacy and dedicated Drive principals must be distinct.",
      { status: 503 },
    );
  }
  const [capability, inventory, tokenIdentity] = await Promise.all([
    readSharingCapability(token, workbookId, fetchImpl),
    readPermissions(token, workbookId, fetchImpl),
    readCurrentDriveIdentity(token, dedicatedEmail, fetchImpl),
  ]);
  const normalized = inventory.permissions.map(normalizedPermission)
    .sort((left, right) => compare(JSON.stringify(publicPermissionRecord(left)),
      JSON.stringify(publicPermissionRecord(right))));
  if (normalized.length !== new Set(normalized.map((record) => record.rawId)).size ||
      normalized.length !== new Set(normalized.map((record) =>
        record.idFingerprint)).size) {
    throw aclError(
      "STEP12_GOOGLE_DRIVE_ACL_PERMISSION_DUPLICATE",
      "The Drive permission inventory contained a duplicate permission identity.",
      { status: 503 },
    );
  }
  const owners = normalized.filter((record) => record.role === "owner");
  const dedicatedFingerprint = principalFingerprint("user", dedicatedEmail);
  const legacyFingerprint = principalFingerprint("user", legacyEmail);
  const dedicated = normalized.filter((record) =>
    record.principalFingerprint === dedicatedFingerprint);
  const legacy = normalized.filter((record) =>
    record.principalFingerprint === legacyFingerprint);
  const nonOwnerEditors = normalized.filter((record) =>
    record.role !== "owner" && EDIT_ROLES.has(record.role));
  const allowedEditorPrincipals = new Set([dedicatedFingerprint, legacyFingerprint]);
  const unexpectedNonOwnerEditors = nonOwnerEditors.filter((record) =>
    !allowedEditorPrincipals.has(record.principalFingerprint));
  const expectedEditorCount = legacy[0]?.role === "reader" ? 1 : 2;
  const expectedEditorPrincipals = legacy[0]?.role === "reader"
    ? new Set([dedicatedFingerprint])
    : allowedEditorPrincipals;
  const actualEditorPrincipals = new Set(nonOwnerEditors.map((record) =>
    record.principalFingerprint));
  const exactEditorSet = actualEditorPrincipals.size === expectedEditorPrincipals.size &&
    [...expectedEditorPrincipals].every((value) => actualEditorPrincipals.has(value));
  const broadEditors = nonOwnerEditors.filter((record) =>
    ["group", "domain", "anyone"].includes(record.type));
  const unsafe = owners.length !== 1 || capability.sharedDrive ||
    normalized.some((record) => record.pendingOwner || record.deleted) ||
    dedicated.length !== 1 || legacy.length !== 1 ||
    dedicated[0]?.role !== "writer" || dedicated[0]?.inherited ||
    Boolean(dedicated[0]?.expirationTime) ||
    tokenIdentity.principalFingerprint !== dedicatedFingerprint ||
    tokenIdentity.permissionFingerprint !== dedicated[0]?.idFingerprint ||
    legacy[0]?.inherited || Boolean(legacy[0]?.expirationTime) ||
    !LEGACY_FENCE_ROLES.has(legacy[0]?.role) ||
    unexpectedNonOwnerEditors.length !== 0 || broadEditors.length !== 0 ||
    nonOwnerEditors.length !== expectedEditorCount || !exactEditorSet;
  if (unsafe) {
    throw aclError(
      "STEP12_GOOGLE_DRIVE_ACL_INVENTORY_UNSAFE",
      "The Production workbook ACL did not match the exact dedicated/legacy fence model.",
      {
        status: 409,
        diagnostics: {
          permissionCount: normalized.length,
          ownerCount: owners.length,
          pendingOwnerCount: normalized.filter((record) => record.pendingOwner).length,
          deletedPermissionCount: normalized.filter((record) => record.deleted).length,
          broadEditorCount: broadEditors.length,
          unexpectedNonOwnerEditorCount: unexpectedNonOwnerEditors.length,
          nonOwnerEditorCount: nonOwnerEditors.length,
          expectedNonOwnerEditorCount: expectedEditorCount,
          dedicatedPermissionCount: dedicated.length,
          legacyPermissionCount: legacy.length,
          dedicatedRoleWriter: dedicated[0]?.role === "writer",
          dedicatedTokenPrincipalMatched:
            tokenIdentity.principalFingerprint === dedicatedFingerprint,
          dedicatedTokenPermissionMatched:
            tokenIdentity.permissionFingerprint === dedicated[0]?.idFingerprint,
          legacyRole: LEGACY_FENCE_ROLES.has(legacy[0]?.role)
            ? legacy[0].role : "OTHER",
          dedicatedPermissionInherited: dedicated[0]?.inherited === true,
          legacyPermissionInherited: legacy[0]?.inherited === true,
          dedicatedPermissionExpiring:
            Boolean(dedicated[0]?.expirationTime),
          legacyPermissionExpiring: Boolean(legacy[0]?.expirationTime),
          sharedDrive: capability.sharedDrive,
        },
      },
    );
  }
  const permissionRecords = normalized.map(publicPermissionRecord)
    .sort((left, right) => compare(JSON.stringify(left), JSON.stringify(right)));
  const identityRecords = normalized.map(identityPermissionRecord)
    .sort((left, right) => compare(JSON.stringify(left), JSON.stringify(right)));
  const publicEditors = effectiveEditorRecords(permissionRecords);
  const permissionInventoryFingerprint = fingerprint(permissionRecords);
  const permissionIdentityFingerprint = fingerprint(identityRecords);
  const permissionPaginationFingerprint = fingerprint(inventory.pages);
  const aclFingerprint = fingerprint({
    permissionInventoryFingerprint,
    permissionIdentityFingerprint,
    permissionPaginationFingerprint,
    sharingCapabilityFingerprint: capability.fingerprint,
    driveIdentityFingerprint: tokenIdentity.fingerprint,
  });
  const publicState = Object.freeze({
    schemaVersion: PRODUCTION_GOOGLE_DRIVE_ACL_FENCE_SCHEMA,
    workbookId,
    inspectionScope,
    permissionManagementScope: PRODUCTION_GOOGLE_DRIVE_ACL_PERMISSION_SCOPE,
    sharingCapabilityFingerprint: capability.fingerprint,
    driveIdentityFingerprint: tokenIdentity.fingerprint,
    inspectionPrincipalFingerprint: tokenIdentity.principalFingerprint,
    inspectionPrincipalPermissionFingerprint:
      tokenIdentity.permissionFingerprint,
    dedicatedCanShare: true,
    writersCanShare: true,
    sharedDrive: false,
    permissionCount: permissionRecords.length,
    permissionRecords: Object.freeze(permissionRecords),
    permissionInventoryFingerprint,
    permissionIdentityFingerprint,
    permissionPageCount: inventory.pages.length,
    permissionPaginationFingerprint,
    aclFingerprint,
    ownerCount: 1,
    ownerPrincipalFingerprint: owners[0].principalFingerprint,
    broadNonOwnerEditorCount: 0,
    unexpectedNonOwnerEditorCount: 0,
    nonOwnerEditorCount: publicEditors.length,
    effectiveNonOwnerEditorFingerprint: fingerprint(publicEditors),
    dedicatedPermissionFingerprint: dedicated[0].idFingerprint,
    dedicatedPrincipalFingerprint: dedicated[0].principalFingerprint,
    dedicatedRole: "writer",
    legacyPermissionFingerprint: legacy[0].idFingerprint,
    legacyPrincipalFingerprint: legacy[0].principalFingerprint,
    legacyRole: legacy[0].role,
  });
  privateAclStates.set(publicState, Object.freeze({
    dedicatedEmail,
    legacyEmail,
    legacyPermissionId: legacy[0].rawId,
  }));
  return publicState;
}

export async function inspectProductionGoogleDriveAclFence(optionsInput = {}) {
  const options = aclOptionsSnapshot(
    optionsInput,
    new Set([
      "accessToken", "dedicatedPrincipalEmail", "fetchImpl",
      "legacyPrincipalEmail", "workbookId",
    ]),
    "The Production Drive ACL inspection options",
  );
  return inspectAcl({
    accessToken: options.accessToken,
    dedicatedPrincipalEmail: options.dedicatedPrincipalEmail,
    fetchImpl: productionDriveTransport(options),
    inspectionScope: PRODUCTION_GOOGLE_DRIVE_ACL_READ_SCOPE,
    legacyPrincipalEmail: options.legacyPrincipalEmail,
    workbookId: options.workbookId ?? PRODUCTION_GOOGLE_WORKBOOK_ID,
  });
}

async function inspectProductionGoogleDriveLegacyEditCapabilityWithTransport({
  accessToken: rawAccessToken,
  expectedCanEdit,
  expectedCanShare,
  fetchImpl,
  legacyPrincipalEmail,
  workbookId = PRODUCTION_GOOGLE_WORKBOOK_ID,
} = {}) {
  if (workbookId !== PRODUCTION_GOOGLE_WORKBOOK_ID ||
      typeof fetchImpl !== "function" || typeof expectedCanEdit !== "boolean" ||
      typeof expectedCanShare !== "boolean") {
    throw aclError(
      "STEP12_GOOGLE_DRIVE_LEGACY_CAPABILITY_INPUT_INVALID",
      "The legacy Drive edit-capability input was invalid.",
      { status: 503 },
    );
  }
  const token = accessToken(rawAccessToken);
  const legacyEmail = normalizedEmail(legacyPrincipalEmail, "legacy");
  const query = new URLSearchParams({
    fields: "id,mimeType,capabilities(canEdit,canShare)",
    supportsAllDrives: "true",
  });
  const [payload, tokenIdentity] = await Promise.all([
    driveJson(
      token,
      `/files/${encodeURIComponent(workbookId)}?${query.toString()}`,
      { fetchImpl },
    ),
    readCurrentDriveIdentity(token, legacyEmail, fetchImpl),
  ]);
  const canEdit = payload.capabilities?.canEdit;
  const canShare = payload.capabilities?.canShare;
  if (clean(payload.id) !== workbookId ||
      clean(payload.mimeType) !== GOOGLE_SHEETS_MIME_TYPE ||
      typeof canEdit !== "boolean" || canEdit !== expectedCanEdit ||
      typeof canShare !== "boolean" || canShare !== expectedCanShare) {
    throw aclError(
      "STEP12_GOOGLE_DRIVE_LEGACY_CAPABILITY_INVALID",
      "The legacy identity did not have the exact expected Drive edit capability.",
      {
        status: 409,
        diagnostics: {
          legacyCanEdit: canEdit === true,
          expectedLegacyCanEdit: expectedCanEdit,
          legacyCanShare: canShare === true,
          expectedLegacyCanShare: expectedCanShare,
        },
      },
    );
  }
  const core = Object.freeze({
    schemaVersion: PRODUCTION_GOOGLE_DRIVE_LEGACY_EDIT_CAPABILITY_SCHEMA,
    workbookId,
    inspectionScope: PRODUCTION_GOOGLE_DRIVE_ACL_READ_SCOPE,
    legacyPrincipalFingerprint: tokenIdentity.principalFingerprint,
    legacyPermissionFingerprint: tokenIdentity.permissionFingerprint,
    driveIdentityFingerprint: tokenIdentity.fingerprint,
    canEdit,
    canShare,
  });
  const proof = Object.freeze({
    ...core,
    capabilityFingerprint: fingerprint(core),
  });
  privateLegacyEditCapabilities.add(proof);
  return proof;
}

export async function inspectProductionGoogleDriveLegacyEditCapability(
  optionsInput = {},
) {
  const options = aclOptionsSnapshot(
    optionsInput,
    new Set([
      "accessToken", "expectedCanEdit", "expectedCanShare", "fetchImpl",
      "legacyPrincipalEmail", "workbookId",
    ]),
    "The Production legacy Drive capability options",
  );
  return inspectProductionGoogleDriveLegacyEditCapabilityWithTransport({
    accessToken: options.accessToken,
    expectedCanEdit: options.expectedCanEdit,
    expectedCanShare: options.expectedCanShare,
    fetchImpl: productionDriveTransport(options),
    legacyPrincipalEmail: options.legacyPrincipalEmail,
    workbookId: options.workbookId ?? PRODUCTION_GOOGLE_WORKBOOK_ID,
  });
}

function assertedPublicState(value) {
  const records = value?.permissionRecords;
  const identityRecords = Array.isArray(records) ? records.map((record) => [
    record[0], record[1], record[2], ...record.slice(4),
  ]).sort((left, right) => compare(JSON.stringify(left), JSON.stringify(right))) : [];
  const expectedAclFingerprint = fingerprint({
    permissionInventoryFingerprint: value?.permissionInventoryFingerprint,
    permissionIdentityFingerprint: value?.permissionIdentityFingerprint,
    permissionPaginationFingerprint: value?.permissionPaginationFingerprint,
    sharingCapabilityFingerprint: value?.sharingCapabilityFingerprint,
    driveIdentityFingerprint: value?.driveIdentityFingerprint,
  });
  if (value?.schemaVersion !== PRODUCTION_GOOGLE_DRIVE_ACL_FENCE_SCHEMA ||
      value?.workbookId !== PRODUCTION_GOOGLE_WORKBOOK_ID ||
      value?.dedicatedCanShare !== true || value?.writersCanShare !== true ||
      value?.sharedDrive !== false || value?.ownerCount !== 1 ||
      value?.dedicatedRole !== "writer" ||
      !LEGACY_FENCE_ROLES.has(value?.legacyRole) ||
      !Array.isArray(records) || records.length !== value?.permissionCount ||
      fingerprint(records) !== value?.permissionInventoryFingerprint ||
      fingerprint(identityRecords) !== value?.permissionIdentityFingerprint ||
      expectedAclFingerprint !== value?.aclFingerprint ||
      value?.inspectionPrincipalFingerprint !==
        value?.dedicatedPrincipalFingerprint ||
      value?.inspectionPrincipalPermissionFingerprint !==
        value?.dedicatedPermissionFingerprint ||
      value?.driveIdentityFingerprint !== fingerprint({
        principalFingerprint: value?.inspectionPrincipalFingerprint,
        permissionFingerprint:
          value?.inspectionPrincipalPermissionFingerprint,
      }) ||
      !isFingerprint(value?.driveIdentityFingerprint) ||
      !isFingerprint(value?.permissionInventoryFingerprint) ||
      !isFingerprint(value?.permissionIdentityFingerprint) ||
      !isFingerprint(value?.legacyPermissionFingerprint) ||
      !isFingerprint(value?.legacyPrincipalFingerprint) ||
      !isFingerprint(value?.dedicatedPermissionFingerprint) ||
      !isFingerprint(value?.dedicatedPrincipalFingerprint)) {
    throw aclError(
      "STEP12_GOOGLE_DRIVE_ACL_STATE_INVALID",
      "An exact Drive ACL state was required by the permission fence.",
      { status: 503 },
    );
  }
  return value;
}

function assertedLiveState(value) {
  assertedPublicState(value);
  const privateState = privateAclStates.get(value);
  if (!privateState) {
    throw aclError(
      "STEP12_GOOGLE_DRIVE_ACL_LIVE_STATE_REQUIRED",
      "A fresh server-side Drive ACL inspection was required.",
      { status: 503 },
    );
  }
  return privateState;
}

function expectedRoleChangedRecords(beforeState, targetRole) {
  return beforeState.permissionRecords.map((record) => Object.freeze(
    record[0] === beforeState.legacyPermissionFingerprint
      ? [record[0], record[1], record[2], targetRole, ...record.slice(4)]
      : [...record],
  )).sort((left, right) => compare(JSON.stringify(left), JSON.stringify(right)));
}

function legacyCapabilityFingerprint(
  principal,
  permission,
  driveIdentity,
  canEdit,
  canShare,
) {
  return fingerprint({
    schemaVersion: PRODUCTION_GOOGLE_DRIVE_LEGACY_EDIT_CAPABILITY_SCHEMA,
    workbookId: PRODUCTION_GOOGLE_WORKBOOK_ID,
    inspectionScope: PRODUCTION_GOOGLE_DRIVE_ACL_READ_SCOPE,
    legacyPrincipalFingerprint: principal,
    legacyPermissionFingerprint: permission,
    driveIdentityFingerprint: driveIdentity,
    canEdit,
    canShare,
  });
}

function intentCore(
  beforeState,
  beforeLegacyCapability,
  targetRole,
  fenceId,
  installRequestId,
) {
  const expectedRecords = expectedRoleChangedRecords(beforeState, targetRole);
  const expectedEditors = effectiveEditorRecords(expectedRecords);
  return Object.freeze({
    schemaVersion: PRODUCTION_GOOGLE_DRIVE_ACL_TRANSITION_INTENT_SCHEMA,
    workbookId: beforeState.workbookId,
    fenceId: lower(fenceId),
    installRequestId: lower(installRequestId),
    transitionPhase: transitionPhase(targetRole),
    providerMutationClass: mutationClass(targetRole),
    sourceRole: beforeState.legacyRole,
    targetRole,
    permissionManagementScope: PRODUCTION_GOOGLE_DRIVE_ACL_PERMISSION_SCOPE,
    legacyPermissionFingerprint: beforeState.legacyPermissionFingerprint,
    legacyPrincipalFingerprint: beforeState.legacyPrincipalFingerprint,
    dedicatedPermissionFingerprint: beforeState.dedicatedPermissionFingerprint,
    dedicatedPrincipalFingerprint: beforeState.dedicatedPrincipalFingerprint,
    dedicatedDriveIdentityFingerprint: beforeState.driveIdentityFingerprint,
    priorPermissionInventoryFingerprint:
      beforeState.permissionInventoryFingerprint,
    expectedTargetPermissionInventoryFingerprint: fingerprint(expectedRecords),
    permissionIdentityFingerprint: beforeState.permissionIdentityFingerprint,
    sharingCapabilityFingerprint: beforeState.sharingCapabilityFingerprint,
    priorAclFingerprint: beforeState.aclFingerprint,
    priorLegacyCanEdit: beforeLegacyCapability.canEdit,
    priorLegacyCanShare: beforeLegacyCapability.canShare,
    expectedTargetLegacyCanEdit: targetRole === "writer",
    expectedTargetLegacyCanShare: targetRole === "writer",
    priorLegacyEditCapabilityFingerprint:
      beforeLegacyCapability.capabilityFingerprint,
    expectedTargetLegacyEditCapabilityFingerprint: legacyCapabilityFingerprint(
      beforeState.legacyPrincipalFingerprint,
      beforeState.legacyPermissionFingerprint,
      beforeLegacyCapability.driveIdentityFingerprint,
      targetRole === "writer",
      targetRole === "writer",
    ),
    legacyDriveIdentityFingerprint:
      beforeLegacyCapability.driveIdentityFingerprint,
    permissionCount: beforeState.permissionCount,
    priorNonOwnerEditorCount: beforeState.nonOwnerEditorCount,
    expectedTargetNonOwnerEditorCount: expectedEditors.length,
    priorEffectiveNonOwnerEditorFingerprint:
      beforeState.effectiveNonOwnerEditorFingerprint,
    expectedTargetEffectiveNonOwnerEditorFingerprint:
      fingerprint(expectedEditors),
  });
}

export function createProductionGoogleDriveAclTransitionIntent({
  beforeLegacyCapability,
  beforeState,
  fenceId,
  installRequestId,
  targetRole,
} = {}) {
  assertedLiveState(beforeState);
  const selectedTarget = lower(targetRole);
  if (!isRequestId(fenceId) || !isRequestId(installRequestId) ||
      !privateLegacyEditCapabilities.has(beforeLegacyCapability) ||
      beforeLegacyCapability.workbookId !== beforeState.workbookId ||
      beforeLegacyCapability.legacyPrincipalFingerprint !==
        beforeState.legacyPrincipalFingerprint ||
      beforeLegacyCapability.legacyPermissionFingerprint !==
        beforeState.legacyPermissionFingerprint ||
      beforeLegacyCapability.canEdit !== (beforeState.legacyRole === "writer") ||
      beforeLegacyCapability.canShare !== (beforeState.legacyRole === "writer") ||
      !LEGACY_FENCE_ROLES.has(selectedTarget) ||
      beforeState.legacyRole === selectedTarget ||
      !((beforeState.legacyRole === "writer" && selectedTarget === "reader") ||
        (beforeState.legacyRole === "reader" && selectedTarget === "writer"))) {
    throw aclError(
      "STEP12_GOOGLE_DRIVE_ACL_TRANSITION_INVALID",
      "The ACL transition must be the exact fenced writer/reader role change.",
      { status: 409 },
    );
  }
  const core = intentCore(
    beforeState,
    beforeLegacyCapability,
    selectedTarget,
    fenceId,
    installRequestId,
  );
  return Object.freeze({
    ...core,
    transitionIntentFingerprint: aclTransitionIntentFingerprint(core),
  });
}

function assertedIntent(intent) {
  if (!intent || typeof intent !== "object") {
    throw aclError(
      "STEP12_GOOGLE_DRIVE_ACL_TRANSITION_INTENT_INVALID",
      "A durable ACL transition intent was required.",
      { status: 409 },
    );
  }
  const { transitionIntentFingerprint, ...core } = intent;
  const validRoleChange =
    (intent.sourceRole === "writer" && intent.targetRole === "reader") ||
    (intent.sourceRole === "reader" && intent.targetRole === "writer");
  if (intent.schemaVersion !== PRODUCTION_GOOGLE_DRIVE_ACL_TRANSITION_INTENT_SCHEMA ||
      intent.workbookId !== PRODUCTION_GOOGLE_WORKBOOK_ID ||
      !isRequestId(intent.fenceId) || !isRequestId(intent.installRequestId) ||
      !validRoleChange || intent.transitionPhase !== transitionPhase(intent.targetRole) ||
      intent.providerMutationClass !== mutationClass(intent.targetRole) ||
      intent.permissionManagementScope !== PRODUCTION_GOOGLE_DRIVE_ACL_PERMISSION_SCOPE ||
      !isFingerprint(transitionIntentFingerprint) ||
      aclTransitionIntentFingerprint(core) !== transitionIntentFingerprint ||
      !isFingerprint(intent.legacyPermissionFingerprint) ||
      !isFingerprint(intent.legacyPrincipalFingerprint) ||
      !isFingerprint(intent.dedicatedPermissionFingerprint) ||
      !isFingerprint(intent.dedicatedPrincipalFingerprint) ||
      !isFingerprint(intent.dedicatedDriveIdentityFingerprint) ||
      !isFingerprint(intent.priorPermissionInventoryFingerprint) ||
      !isFingerprint(intent.expectedTargetPermissionInventoryFingerprint) ||
      !isFingerprint(intent.permissionIdentityFingerprint) ||
      !isFingerprint(intent.sharingCapabilityFingerprint) ||
      !isFingerprint(intent.priorAclFingerprint) ||
      typeof intent.priorLegacyCanEdit !== "boolean" ||
      typeof intent.priorLegacyCanShare !== "boolean" ||
      typeof intent.expectedTargetLegacyCanEdit !== "boolean" ||
      typeof intent.expectedTargetLegacyCanShare !== "boolean" ||
      intent.priorLegacyCanEdit !== (intent.sourceRole === "writer") ||
      intent.priorLegacyCanShare !== (intent.sourceRole === "writer") ||
      intent.expectedTargetLegacyCanEdit !== (intent.targetRole === "writer") ||
      intent.expectedTargetLegacyCanShare !== (intent.targetRole === "writer") ||
      !isFingerprint(intent.priorLegacyEditCapabilityFingerprint) ||
      !isFingerprint(intent.expectedTargetLegacyEditCapabilityFingerprint) ||
      !isFingerprint(intent.legacyDriveIdentityFingerprint) ||
      intent.priorLegacyEditCapabilityFingerprint !== legacyCapabilityFingerprint(
        intent.legacyPrincipalFingerprint,
        intent.legacyPermissionFingerprint,
        intent.legacyDriveIdentityFingerprint,
        intent.priorLegacyCanEdit,
        intent.priorLegacyCanShare,
      ) ||
      intent.expectedTargetLegacyEditCapabilityFingerprint !==
        legacyCapabilityFingerprint(
          intent.legacyPrincipalFingerprint,
          intent.legacyPermissionFingerprint,
          intent.legacyDriveIdentityFingerprint,
          intent.expectedTargetLegacyCanEdit,
          intent.expectedTargetLegacyCanShare,
        ) ||
      !isFingerprint(intent.priorEffectiveNonOwnerEditorFingerprint) ||
      !isFingerprint(intent.expectedTargetEffectiveNonOwnerEditorFingerprint) ||
      !Number.isSafeInteger(intent.permissionCount) || intent.permissionCount < 3 ||
      !Number.isSafeInteger(intent.priorNonOwnerEditorCount) ||
      !Number.isSafeInteger(intent.expectedTargetNonOwnerEditorCount)) {
    throw aclError(
      "STEP12_GOOGLE_DRIVE_ACL_TRANSITION_INTENT_INVALID",
      "The durable ACL transition intent was invalid.",
      { status: 409 },
    );
  }
  return intent;
}

function assertStateMatchesIntent(state, intent) {
  assertedPublicState(state);
  assertedIntent(intent);
  const source = state.legacyRole === intent.sourceRole &&
    state.permissionInventoryFingerprint ===
      intent.priorPermissionInventoryFingerprint &&
    state.aclFingerprint === intent.priorAclFingerprint &&
    state.nonOwnerEditorCount === intent.priorNonOwnerEditorCount &&
    state.effectiveNonOwnerEditorFingerprint ===
      intent.priorEffectiveNonOwnerEditorFingerprint;
  const target = state.legacyRole === intent.targetRole &&
    state.permissionInventoryFingerprint ===
      intent.expectedTargetPermissionInventoryFingerprint &&
    state.nonOwnerEditorCount === intent.expectedTargetNonOwnerEditorCount &&
    state.effectiveNonOwnerEditorFingerprint ===
      intent.expectedTargetEffectiveNonOwnerEditorFingerprint;
  const shared = state.workbookId === intent.workbookId &&
    state.permissionCount === intent.permissionCount &&
    state.permissionIdentityFingerprint === intent.permissionIdentityFingerprint &&
    state.sharingCapabilityFingerprint === intent.sharingCapabilityFingerprint &&
    state.legacyPermissionFingerprint === intent.legacyPermissionFingerprint &&
    state.legacyPrincipalFingerprint === intent.legacyPrincipalFingerprint &&
    state.dedicatedPermissionFingerprint === intent.dedicatedPermissionFingerprint &&
    state.dedicatedPrincipalFingerprint === intent.dedicatedPrincipalFingerprint &&
    state.driveIdentityFingerprint === intent.dedicatedDriveIdentityFingerprint &&
    state.dedicatedRole === "writer";
  if (!shared || (!source && !target)) {
    throw aclError(
      "STEP12_GOOGLE_DRIVE_ACL_DURABLE_BINDING_INVALID",
      "The recaptured Drive ACL did not match the durable transition binding.",
      { status: 409 },
    );
  }
  return source ? "SOURCE" : "TARGET";
}

function assertLegacyCapabilityMatchesIntent(capability, intent, position) {
  const source = position === "SOURCE";
  const expectedCanEdit = source
    ? intent.priorLegacyCanEdit
    : intent.expectedTargetLegacyCanEdit;
  const expectedCanShare = source
    ? intent.priorLegacyCanShare
    : intent.expectedTargetLegacyCanShare;
  const expectedFingerprint = source
    ? intent.priorLegacyEditCapabilityFingerprint
    : intent.expectedTargetLegacyEditCapabilityFingerprint;
  if (!privateLegacyEditCapabilities.has(capability) ||
      capability.workbookId !== intent.workbookId ||
      capability.legacyPrincipalFingerprint !== intent.legacyPrincipalFingerprint ||
      capability.legacyPermissionFingerprint !== intent.legacyPermissionFingerprint ||
      capability.driveIdentityFingerprint !== intent.legacyDriveIdentityFingerprint ||
      capability.canEdit !== expectedCanEdit ||
      capability.canShare !== expectedCanShare ||
      capability.capabilityFingerprint !== expectedFingerprint) {
    throw aclError(
      "STEP12_GOOGLE_DRIVE_LEGACY_CAPABILITY_BINDING_INVALID",
      "The legacy token capability did not match the durable ACL transition.",
      { status: 409 },
    );
  }
  return capability;
}

export function assertProductionGoogleDriveAclDurableBinding(state, binding = {}) {
  return assertStateMatchesIntent(state, binding);
}

export async function preflightProductionGoogleDriveAclTransition(
  optionsInput = {},
) {
  const options = aclOptionsSnapshot(
    optionsInput,
    new Set([
      "currentState", "fetchImpl", "legacyReadAccessToken",
      "permissionAccessToken", "transitionIntent",
    ]),
    "The Production Drive ACL preflight options",
  );
  const currentState = options.currentState;
  const fetchImpl = productionDriveTransport(options);
  const legacyReadAccessToken = options.legacyReadAccessToken;
  const permissionAccessToken = options.permissionAccessToken;
  const transitionIntent = options.transitionIntent;
  const currentPrivate = assertedLiveState(currentState);
  const intent = assertedIntent(transitionIntent);
  assertStateMatchesIntent(currentState, intent);
  const permissionToken = accessToken(permissionAccessToken);
  const legacyToken = accessToken(legacyReadAccessToken);
  const providerState = await inspectAcl({
    accessToken: permissionToken,
    dedicatedPrincipalEmail: currentPrivate.dedicatedEmail,
    fetchImpl,
    inspectionScope: PRODUCTION_GOOGLE_DRIVE_ACL_PERMISSION_SCOPE,
    legacyPrincipalEmail: currentPrivate.legacyEmail,
    workbookId: currentState.workbookId,
  });
  const position = assertStateMatchesIntent(providerState, intent);
  const legacyCapability = await inspectProductionGoogleDriveLegacyEditCapabilityWithTransport({
    accessToken: legacyToken,
    expectedCanEdit: position === "SOURCE"
      ? intent.priorLegacyCanEdit
      : intent.expectedTargetLegacyCanEdit,
    expectedCanShare: position === "SOURCE"
      ? intent.priorLegacyCanShare
      : intent.expectedTargetLegacyCanShare,
    fetchImpl,
    legacyPrincipalEmail: currentPrivate.legacyEmail,
    workbookId: currentState.workbookId,
  });
  assertLegacyCapabilityMatchesIntent(legacyCapability, intent, position);
  const core = Object.freeze({
    schemaVersion: PRODUCTION_GOOGLE_DRIVE_ACL_PROVIDER_PREFLIGHT_SCHEMA,
    workbookId: intent.workbookId,
    fenceId: intent.fenceId,
    installRequestId: intent.installRequestId,
    transitionIntentFingerprint: intent.transitionIntentFingerprint,
    providerMutationClass: intent.providerMutationClass,
    targetRole: intent.targetRole,
    position,
    permissionTokenInspectionScope: providerState.inspectionScope,
    dedicatedDriveIdentityFingerprint: providerState.driveIdentityFingerprint,
    providerAclFingerprint: providerState.aclFingerprint,
    providerPermissionInventoryFingerprint:
      providerState.permissionInventoryFingerprint,
    legacyEditCapabilityFingerprint: legacyCapability.capabilityFingerprint,
  });
  const providerPreflight = Object.freeze({
    ...core,
    providerPreflightFingerprint: fingerprint(core),
  });
  const providerPrivate = assertedLiveState(providerState);
  const query = new URLSearchParams({
    fields: "id,type,role,emailAddress,domain,allowFileDiscovery,pendingOwner," +
      "expirationTime,deleted,permissionDetails(inherited,inheritedFrom)",
    supportsAllDrives: "true",
  });
  privateProviderPreflights.set(providerPreflight, {
    capturedAtMonotonicMs: monotonicNow(),
    consumed: false,
    currentPrivate,
    fetchImpl,
    intentFingerprint: intent.transitionIntentFingerprint,
    legacyCapability,
    legacyReadAccessToken: legacyToken,
    permissionAccessToken: permissionToken,
    providerApiPath:
      `/files/${encodeURIComponent(providerState.workbookId)}/permissions/` +
      `${encodeURIComponent(providerPrivate.legacyPermissionId)}?${query.toString()}`,
    providerState,
  });
  return providerPreflight;
}

export function reconcileProductionGoogleDriveAclTransition({
  afterState,
  legacyEditCapability,
  transitionIntent,
} = {}) {
  assertedLiveState(afterState);
  if (assertStateMatchesIntent(afterState, transitionIntent) !== "TARGET" ||
      !privateLegacyEditCapabilities.has(legacyEditCapability) ||
      legacyEditCapability.workbookId !== transitionIntent.workbookId ||
      legacyEditCapability.legacyPrincipalFingerprint !==
        transitionIntent.legacyPrincipalFingerprint ||
      legacyEditCapability.legacyPermissionFingerprint !==
        transitionIntent.legacyPermissionFingerprint ||
      legacyEditCapability.driveIdentityFingerprint !==
        transitionIntent.legacyDriveIdentityFingerprint ||
      legacyEditCapability.canEdit !==
        transitionIntent.expectedTargetLegacyCanEdit ||
      legacyEditCapability.canShare !==
        transitionIntent.expectedTargetLegacyCanShare ||
      legacyEditCapability.capabilityFingerprint !==
        transitionIntent.expectedTargetLegacyEditCapabilityFingerprint) {
    throw aclError(
      "STEP12_GOOGLE_DRIVE_ACL_TRANSITION_READBACK_INVALID",
      "The Drive ACL readback did not prove the exact target role.",
      { status: 409 },
    );
  }
  const proofCore = Object.freeze({
    schemaVersion: PRODUCTION_GOOGLE_DRIVE_ACL_TRANSITION_PROOF_SCHEMA,
    workbookId: transitionIntent.workbookId,
    fenceId: transitionIntent.fenceId,
    installRequestId: transitionIntent.installRequestId,
    transitionPhase: transitionIntent.transitionPhase,
    providerMutationClass: transitionIntent.providerMutationClass,
    permissionManagementScope: PRODUCTION_GOOGLE_DRIVE_ACL_PERMISSION_SCOPE,
    transitionIntentFingerprint:
      transitionIntent.transitionIntentFingerprint,
    legacyPermissionFingerprint:
      transitionIntent.legacyPermissionFingerprint,
    legacyPrincipalFingerprint:
      transitionIntent.legacyPrincipalFingerprint,
    priorRole: transitionIntent.sourceRole,
    currentRole: transitionIntent.targetRole,
    priorPermissionInventoryFingerprint:
      transitionIntent.priorPermissionInventoryFingerprint,
    currentPermissionInventoryFingerprint:
      afterState.permissionInventoryFingerprint,
    permissionIdentityFingerprint:
      transitionIntent.permissionIdentityFingerprint,
    sharingCapabilityFingerprint:
      transitionIntent.sharingCapabilityFingerprint,
    dedicatedDriveIdentityFingerprint:
      transitionIntent.dedicatedDriveIdentityFingerprint,
    legacyDriveIdentityFingerprint:
      transitionIntent.legacyDriveIdentityFingerprint,
    priorAclFingerprint: transitionIntent.priorAclFingerprint,
    currentAclFingerprint: afterState.aclFingerprint,
    priorLegacyCanEdit: transitionIntent.priorLegacyCanEdit,
    currentLegacyCanEdit: legacyEditCapability.canEdit,
    priorLegacyCanShare: transitionIntent.priorLegacyCanShare,
    currentLegacyCanShare: legacyEditCapability.canShare,
    priorLegacyEditCapabilityFingerprint:
      transitionIntent.priorLegacyEditCapabilityFingerprint,
    currentLegacyEditCapabilityFingerprint:
      legacyEditCapability.capabilityFingerprint,
    dedicatedCanShare: true,
    writersCanShare: true,
  });
  return Object.freeze({
    ...proofCore,
    transitionFingerprint: aclTransitionProofFingerprint(proofCore),
  });
}

/** Convert a server-only authoritative PROVIDER_MUTATING receipt into a
 * one-shot opaque capability. Its mutable fields are not trusted afterward. */
export function acceptProductionGoogleDriveAclProviderMutationDispatch({
  databaseDispatchCapability,
  providerPreflight,
  transitionIntent,
} = {}) {
  const intent = assertedIntent(transitionIntent);
  let databaseReceipt;
  try {
    databaseReceipt = consumeProductionGoogleDriveAclDbDispatchCapability(
      databaseDispatchCapability,
    );
  } catch {
    throw aclError(
      "STEP12_GOOGLE_DRIVE_ACL_DB_DISPATCH_REQUIRED",
      "A module-issued durable DB provider-dispatch receipt was required.",
      { status: 409 },
    );
  }
  const { claimStartedMonotonicMs, durableDispatch, recordOutcome } =
    databaseReceipt;
  const preflight = privateProviderPreflights.get(providerPreflight);
  const registeredAtMonotonicMs = monotonicNow();
  if (!Number.isFinite(claimStartedMonotonicMs) ||
      !preflight || preflight.consumed ||
      providerPreflight.position !== "SOURCE" ||
      preflight.intentFingerprint !== intent.transitionIntentFingerprint ||
      registeredAtMonotonicMs - preflight.capturedAtMonotonicMs < 0 ||
      registeredAtMonotonicMs - preflight.capturedAtMonotonicMs >=
        MAX_PROVIDER_PREFLIGHT_AGE_MS) {
    throw aclError(
      "STEP12_GOOGLE_DRIVE_ACL_PROVIDER_CLAIM_CLOCK_INVALID",
      "The provider mutation claim was not preceded by a fresh local clock capture.",
      { status: 409 },
    );
  }
  const dispatchId = lower(receiptField(durableDispatch, "dispatchId", "dispatch_id"));
  const dispatchRequestId = lower(receiptField(
    durableDispatch,
    "dispatchRequestId",
    "dispatch_request_id",
  ));
  const fenceId = lower(receiptField(durableDispatch, "fenceId", "fence_id"));
  const installRequestId = lower(receiptField(
    durableDispatch,
    "installRequestId",
    "install_request_id",
  ));
  const mutation = upper(receiptField(
    durableDispatch,
    "providerMutationClass",
    "provider_mutation_class",
  ));
  const targetRole = lower(receiptField(durableDispatch, "targetRole", "target_role"));
  const intentFingerprint = lower(receiptField(
    durableDispatch,
    "transitionIntentFingerprint",
    "transition_intent_fingerprint",
  ));
  const status = upper(receiptField(durableDispatch, "status", "status"));
  const preflightFingerprint = lower(receiptField(
    durableDispatch,
    "providerPreflightFingerprint",
    "provider_preflight_fingerprint",
  ));
  const remainingDispatchBudgetMs = Number(receiptField(
    durableDispatch,
    "remainingDispatchBudgetMs",
    "remaining_dispatch_budget_ms",
  ));
  const issuedAt = timestampMs(receiptField(durableDispatch, "issuedAt", "issued_at"));
  const expiresAt = timestampMs(receiptField(durableDispatch, "expiresAt", "expires_at"));
  const localElapsedMs = registeredAtMonotonicMs - claimStartedMonotonicMs;
  const valid = typeof recordOutcome === "function" &&
    isRequestId(dispatchId) && isRequestId(dispatchRequestId) &&
    fenceId === intent.fenceId && installRequestId === intent.installRequestId &&
    mutation === intent.providerMutationClass && targetRole === intent.targetRole &&
    intentFingerprint === intent.transitionIntentFingerprint &&
    preflightFingerprint === providerPreflight?.providerPreflightFingerprint &&
    status === "PROVIDER_MUTATING" &&
    Number.isFinite(issuedAt) && Number.isFinite(expiresAt) &&
    expiresAt > issuedAt &&
    expiresAt - issuedAt <= MAX_PROVIDER_DISPATCH_WINDOW_MS &&
    Number.isSafeInteger(remainingDispatchBudgetMs) &&
    remainingDispatchBudgetMs > 0 &&
    remainingDispatchBudgetMs <= MAX_PROVIDER_DISPATCH_WINDOW_MS &&
    localElapsedMs >= 0 &&
    localElapsedMs < Math.min(
      PRODUCTION_GOOGLE_DRIVE_ACL_LOCAL_DISPATCH_BUDGET_MS,
      remainingDispatchBudgetMs,
    );
  if (!valid) {
    throw aclError(
      "STEP12_GOOGLE_DRIVE_ACL_PROVIDER_DISPATCH_INVALID",
      "The durable provider mutation dispatch was invalid or expired.",
      {
        status: 409,
        diagnostics: {
          providerMutationRecoveryRequired: true,
          localClaimBudgetExceeded: Number.isFinite(localElapsedMs) &&
            localElapsedMs >= PRODUCTION_GOOGLE_DRIVE_ACL_LOCAL_DISPATCH_BUDGET_MS,
        },
      },
    );
  }
  const capability = Object.freeze(Object.create(null));
  providerMutationCapabilities.set(capability, {
    claimStartedMonotonicMs,
    dispatchId,
    dispatchRequestId,
    fenceId,
    installRequestId,
    mutationClass: mutation,
    targetRole,
    transitionIntentFingerprint: intentFingerprint,
    providerPreflightFingerprint: preflightFingerprint,
    localDispatchBudgetMs: Math.min(
      PRODUCTION_GOOGLE_DRIVE_ACL_LOCAL_DISPATCH_BUDGET_MS,
      remainingDispatchBudgetMs,
    ),
    issuedAt,
    expiresAt,
    recordOutcome,
    outcomeRecorded: false,
    consumed: false,
    revoked: false,
  });
  return capability;
}

export function revokeProductionGoogleDriveAclProviderMutationDispatch(capability) {
  const state = providerMutationCapabilities.get(capability);
  if (!state) return false;
  state.revoked = true;
  return true;
}

/** Settle one already-issued durable dispatch from a fresh exact provider
 * readback without authorizing another PATCH. SOURCE remains OUTCOME_UNKNOWN;
 * only the exact TARGET proof can advance the durable lifecycle. */
export async function recoverProductionGoogleDriveAclTransitionOutcome({
  databaseRecoveryCapability,
  providerPreflight,
  transitionIntent,
} = {}) {
  const intent = assertedIntent(transitionIntent);
  const preflight = privateProviderPreflights.get(providerPreflight);
  let recoveryReceipt;
  try {
    recoveryReceipt = consumeProductionGoogleDriveAclDbRecoveryCapability(
      databaseRecoveryCapability,
    );
  } catch {
    throw aclError(
      "STEP12_GOOGLE_DRIVE_ACL_DB_RECOVERY_REQUIRED",
      "A module-issued durable DB recovery receipt was required.",
      { status: 409 },
    );
  }
  const { durableDispatch, recordOutcome } = recoveryReceipt;
  const dispatchId = lower(receiptField(
    durableDispatch,
    "dispatchId",
    "dispatch_id",
  ));
  const dispatchRequestId = lower(receiptField(
    durableDispatch,
    "dispatchRequestId",
    "dispatch_request_id",
  ));
  const valid = preflight && !preflight.consumed &&
    preflight.intentFingerprint === intent.transitionIntentFingerprint &&
    providerPreflight.transitionIntentFingerprint ===
      intent.transitionIntentFingerprint &&
    isRequestId(dispatchId) && isRequestId(dispatchRequestId) &&
    lower(receiptField(durableDispatch, "fenceId", "fence_id")) ===
      intent.fenceId &&
    lower(receiptField(
      durableDispatch,
      "installRequestId",
      "install_request_id",
    )) === intent.installRequestId &&
    upper(receiptField(
      durableDispatch,
      "providerMutationClass",
      "provider_mutation_class",
    )) === intent.providerMutationClass &&
    lower(receiptField(durableDispatch, "targetRole", "target_role")) ===
      intent.targetRole &&
    lower(receiptField(
      durableDispatch,
      "transitionIntentFingerprint",
      "transition_intent_fingerprint",
    )) === intent.transitionIntentFingerprint &&
    lower(receiptField(
      durableDispatch,
      "providerPreflightFingerprint",
      "provider_preflight_fingerprint",
    )) === providerPreflight.providerPreflightFingerprint &&
    ["PROVIDER_MUTATING", "OUTCOME_UNKNOWN"].includes(upper(
      receiptField(durableDispatch, "status", "status"),
    )) && durableDispatch.dispatch_usable === false &&
    durableDispatch.replay_usable === false &&
    durableDispatch.idempotent === true && typeof recordOutcome === "function";
  if (!valid) {
    throw aclError(
      "STEP12_GOOGLE_DRIVE_ACL_DB_RECOVERY_INVALID",
      "The durable Drive ACL recovery receipt did not match the exact transition.",
      { status: 409 },
    );
  }
  preflight.consumed = true;
  const position = providerPreflight.position;
  const transitionProof = position === "TARGET"
    ? reconcileProductionGoogleDriveAclTransition({
      afterState: preflight.providerState,
      legacyEditCapability: preflight.legacyCapability,
      transitionIntent: intent,
    })
    : null;
  let durableAclResultReceipt;
  try {
    durableAclResultReceipt = await recordOutcome(Object.freeze({
      outcomeStatus: position === "TARGET"
        ? "TARGET_CONFIRMED" : "OUTCOME_UNKNOWN",
      providerObservedAt: new Date().toISOString(),
      transitionProof,
    }));
  } catch {
    throw aclError(
      "STEP12_GOOGLE_DRIVE_ACL_OUTCOME_RECEIPT_UNKNOWN",
      "The recovery readback could not be durably recorded.",
      { status: 503, diagnostics: { providerMutationRecoveryRequired: true } },
    );
  }
  if (position !== "TARGET") {
    const error = aclError(
      "STEP12_GOOGLE_DRIVE_ACL_UPDATE_OUTCOME_UNKNOWN",
      "The existing provider dispatch remains unknown at the exact source state.",
      {
        status: 503,
        diagnostics: {
          durableAclResultRecorded: true,
          providerMutationRecoveryRequired: true,
        },
      },
    );
    Object.defineProperty(error, "durableAclResultReceipt", {
      configurable: false,
      enumerable: false,
      value: durableAclResultReceipt,
      writable: false,
    });
    throw error;
  }
  return Object.freeze({
    ...transitionProof,
    afterState: preflight.providerState,
    ambiguousOutcomeRecovered: true,
    durableAclResultReceipt,
    idempotentResume: true,
    legacyEditCapability: preflight.legacyCapability,
    permissionTokenPreflightProved: true,
    providerPatchDispatched: false,
    providerResponseKnown: false,
    providerStatus: null,
  });
}

export async function transitionProductionGoogleLegacyDriveRole({
  providerPreflight,
  providerMutationCapability = null,
  transitionIntent,
} = {}) {
  const intent = assertedIntent(transitionIntent);
  const mutationState = providerMutationCapabilities.get(
    providerMutationCapability,
  );
  const preflight = privateProviderPreflights.get(providerPreflight);
  if (!preflight || preflight.consumed ||
      preflight.intentFingerprint !== intent.transitionIntentFingerprint ||
      providerPreflight.transitionIntentFingerprint !==
        intent.transitionIntentFingerprint) {
    throw aclError(
      "STEP12_GOOGLE_DRIVE_ACL_PROVIDER_PREFLIGHT_INVALID",
      "A fresh module-issued provider preflight was required.",
      { status: 409 },
    );
  }
  preflight.consumed = true;
  if (providerPreflight.position === "TARGET") {
    return Object.freeze({
      ...reconcileProductionGoogleDriveAclTransition({
        afterState: preflight.providerState,
        legacyEditCapability: preflight.legacyCapability,
        transitionIntent: intent,
      }),
      providerPatchDispatched: false,
      providerResponseKnown: true,
      providerStatus: null,
      idempotentResume: true,
      ambiguousOutcomeRecovered: false,
      permissionTokenPreflightProved: true,
      legacyEditCapability: preflight.legacyCapability,
      afterState: preflight.providerState,
    });
  }
  let response = null;
  let responsePayload = {};
  let providerResponseKnown = true;
  const recordDurableOutcome = async ({ outcomeStatus, transitionProof }) => {
    if (!mutationState || mutationState.outcomeRecorded ||
        typeof mutationState.recordOutcome !== "function") {
      throw aclError(
        "STEP12_GOOGLE_DRIVE_ACL_OUTCOME_RECORDER_REQUIRED",
        "The Drive ACL outcome could not be bound to its durable dispatch.",
        { status: 409, diagnostics: { providerMutationRecoveryRequired: true } },
      );
    }
    mutationState.outcomeRecorded = true;
    try {
      return await mutationState.recordOutcome(Object.freeze({
        outcomeStatus,
        providerObservedAt: new Date().toISOString(),
        transitionProof,
      }));
    } catch {
      throw aclError(
        "STEP12_GOOGLE_DRIVE_ACL_OUTCOME_RECEIPT_UNKNOWN",
        "The durable Drive ACL outcome receipt was not confirmed.",
        { status: 503, diagnostics: { providerMutationRecoveryRequired: true } },
      );
    }
  };
  const recordUnknownAndThrow = async (message, diagnostics = {}) => {
    const durableAclResultReceipt = await recordDurableOutcome({
      outcomeStatus: "OUTCOME_UNKNOWN",
      transitionProof: null,
    });
    const error = aclError(
      "STEP12_GOOGLE_DRIVE_ACL_UPDATE_OUTCOME_UNKNOWN",
      message,
      {
        status: 503,
        diagnostics: {
          ...diagnostics,
          durableAclResultRecorded: Boolean(durableAclResultReceipt),
          providerMutationRecoveryRequired: true,
        },
      },
    );
    Object.defineProperty(error, "durableAclResultReceipt", {
      configurable: false,
      enumerable: false,
      value: durableAclResultReceipt,
      writable: false,
    });
    throw error;
  };
  try {
    response = await driveRequest(
      preflight.permissionAccessToken,
      preflight.providerApiPath,
      {
      body: { role: intent.targetRole },
      fetchImpl: preflight.fetchImpl,
      method: "PATCH",
      providerMutationCapability,
      providerPreflight,
      transitionIntent: intent,
      },
    );
    responsePayload = await response.json().catch(() => ({}));
  } catch (error) {
    if (error?.code !== "STEP12_GOOGLE_DRIVE_ACL_RESPONSE_UNKNOWN") throw error;
    providerResponseKnown = false;
  }

  let afterState;
  try {
    afterState = await inspectAcl({
      accessToken: preflight.permissionAccessToken,
      dedicatedPrincipalEmail: preflight.currentPrivate.dedicatedEmail,
      fetchImpl: preflight.fetchImpl,
      inspectionScope: PRODUCTION_GOOGLE_DRIVE_ACL_PERMISSION_SCOPE,
      legacyPrincipalEmail: preflight.currentPrivate.legacyEmail,
      workbookId: intent.workbookId,
    });
  } catch {
    return recordUnknownAndThrow(
      "The ACL update outcome remained unknown after provider readback.",
      { providerStatus: response?.status ?? null },
    );
  }

  let readbackPosition;
  try {
    readbackPosition = assertStateMatchesIntent(afterState, intent);
  } catch {
    return recordUnknownAndThrow(
      "The ACL update readback did not match the exact source or target state.",
      { providerStatus: response?.status ?? null },
    );
  }

  let legacyEditCapability;
  try {
    legacyEditCapability = await inspectProductionGoogleDriveLegacyEditCapabilityWithTransport({
      accessToken: preflight.legacyReadAccessToken,
      expectedCanEdit: readbackPosition === "TARGET"
        ? intent.expectedTargetLegacyCanEdit
        : intent.priorLegacyCanEdit,
      expectedCanShare: readbackPosition === "TARGET"
        ? intent.expectedTargetLegacyCanShare
        : intent.priorLegacyCanShare,
      fetchImpl: preflight.fetchImpl,
      legacyPrincipalEmail: preflight.currentPrivate.legacyEmail,
      workbookId: intent.workbookId,
    });
  } catch {
    return recordUnknownAndThrow(
      "The target legacy edit capability was not proved after the ACL update.",
      { providerStatus: response?.status ?? null },
    );
  }

  try {
    assertLegacyCapabilityMatchesIntent(
      legacyEditCapability,
      intent,
      readbackPosition,
    );
  } catch {
    return recordUnknownAndThrow(
      "The legacy capability readback did not match the exact source or target state.",
      { providerStatus: response?.status ?? null },
    );
  }

  if (readbackPosition === "SOURCE") {
    return recordUnknownAndThrow(
      "The provider mutation may still commit after the exact source readback.",
      {
        providerStatus: response?.status ?? null,
        providerReasons: safeProviderReasons(responsePayload),
        sourceAclFingerprint: afterState.aclFingerprint,
        sourceLegacyEditCapabilityFingerprint:
          legacyEditCapability.capabilityFingerprint,
      },
    );
  }

  let transition;
  try {
    transition = reconcileProductionGoogleDriveAclTransition({
      afterState,
      legacyEditCapability,
      transitionIntent: intent,
    });
  } catch (error) {
    if (!providerResponseKnown) {
      return recordUnknownAndThrow(
        "The ACL update response was lost and the target role was not proved.",
      );
    }
    throw error;
  }
  const durableAclResultReceipt = await recordDurableOutcome({
    outcomeStatus: "TARGET_CONFIRMED",
    transitionProof: transition,
  });
  return Object.freeze({
    ...transition,
    providerPatchDispatched: true,
    providerResponseKnown,
    providerStatus: response?.status ?? null,
    idempotentResume: false,
    ambiguousOutcomeRecovered: !providerResponseKnown || Boolean(response && !response.ok),
    permissionTokenPreflightProved: true,
    durableAclResultReceipt,
    legacyEditCapability,
    afterState,
  });
}
