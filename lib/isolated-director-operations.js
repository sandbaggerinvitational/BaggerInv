// Server-only additive isolated authority. Existing Production admission is unchanged.
import "server-only";
import { isolatedCanonicalDatabaseEnvironment } from "./canonical-runtime-source.js";
import { scoringShadowRpc } from "./scoring-shadow.js";
import { certificationRequested, requireCertificationResourceEnvironment } from "./canonical-resource-registration.js";
import { resolveCertificationRuntimeContext, certificationOperationRpc, readCertificationDirectorRecoveryMaterial, replayCertificationIngress } from "./certification-runtime-server.js";
import { buildTournamentSetupMutation, normalizeProductionTournamentSetupPayload, normalizeProductionTournamentSetupMutation, PRODUCTION_TOURNAMENT_SETUP_ACTIONS } from "./production-tournament-setup-contract.js";
import { normalizeNetSkinsEntries } from "./net-skins-entry-workspace.js";
import { entryPayload, mergeEntry, canonicalEqual } from "./calcutta-management-model.js";

export const ISOLATED_DIRECTOR_OPERATIONS_CONTRACT = "isolated-director-operations-v1";
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const HASH = /^[a-f0-9]{64}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const FAMILIES = new Set(["TOURNAMENT_SETUP", "ROUND_PAIRINGS", "NET_SKINS_ENTRIES", "NET_SKINS_CONFIGURATION", "CALCUTTA_PUBLICATION", "CALCUTTA_MANAGEMENT", "MATCH_CONTROL"]);
const CONTROL_FAILURES = new Set(["INVALID_CONTROL_OPERATION", "MATCH_NOT_FOUND", "DIRECTOR_REQUIRED", "IDEMPOTENCY_CONFLICT", "MATCH_REVISION_CONFLICT", "PERMISSION_STALE", "MATCH_FINAL", "MATCH_NOT_UPCOMING", "SCORING_LOCKED", "ACCESS_PERMISSION_SET_INCOMPLETE"]);
const DOMAIN_CODE = /^(?:ISOLATED_DIRECTOR|TOURNAMENT_SETUP|PRODUCTION_(?:DIRECTOR|CALCUTTA|MATCH))[A-Z_0-9]*$/;
const CONTROLS = new Set(["mark-live", "scoring-lock", "scoring-unlock", "access-activate", "access-revoke"]);
const clean = value => String(value ?? "").trim();
const truthy = value => /^(1|true|yes|on|enabled)$/i.test(clean(value));
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const error = (code, status = 503, extra = {}) => Object.assign(new Error("Canonical Director operation could not be confirmed."), {code, status, ...extra});
function exactKeys(value, keys) {
  if (!object(value) || Object.keys(value).some(key => !keys.includes(key))) throw error("DIRECTOR_OPERATIONS_INPUT_INVALID", 400);
}
function noAuthorityFields(value) {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (/^(authorization|resource|environment|project_ref|project_url|source_workbook_id|tournament_id|actor_auth_user_id|actor_player_id|auth_user_id|actorAuthUserId|actorPlayerId|role|context_token|expected_context_token|operation_request_id|request_payload_hash|request_fingerprint|binding_id|governance_tournament_id|activation_revision|admission_revision|authority_epoch_id|release_commit)$/.test(key)) throw error("DIRECTOR_OPERATIONS_INPUT_INVALID", 400);
    noAuthorityFields(child);
  }
}
async function scope(authorization, env, dependencies) {
  const certification = certificationRequested(env);
  const identity = authorization?.identity;
  const actorValid = authorization?.status === "active" && authorization.source === "entitlement" && identity?.actor?.role === "DIRECTOR" && identity.impersonating !== true && UUID.test(clean(identity.authUserId)) && ID.test(clean(identity.actor?.id)) && ID.test(clean(identity.tournamentId));
  if (certification) {
    if (!actorValid) throw error("DIRECTOR_OPERATIONS_AUTHORIZATION_REQUIRED", 403);
    requireCertificationResourceEnvironment(env, dependencies.certificationDependencies);
    const context = await resolveCertificationRuntimeContext({env, phase: "DIRECTOR"}, dependencies.certificationDependencies);
    // Annual play moves to the current tournament while governance retains
    // its separately validated resource context. Never rebind either value
    // from a client payload or require the two distinct authorities to match.
    if (context.tournament_id !== identity.tournamentId) throw error("DIRECTOR_OPERATIONS_SCOPE_MISMATCH", 403);
    return {contract_version: ISOLATED_DIRECTOR_OPERATIONS_CONTRACT,
      resource: {binding_id: context.binding_id}, certificationContext: context,
      authorization: {passport_verified: true, auth_user_id: clean(identity.authUserId).toLowerCase(), player_id: clean(identity.actor.id), role: "DIRECTOR", tournament_id: clean(identity.tournamentId)}};
  }
  const database = isolatedCanonicalDatabaseEnvironment(env);
  // This writer never inherits or repairs the separately governed diagnostic lane.
  if (!database.eligible || truthy(env.PRODUCTION_SHADOW_CANDIDATE_ENABLED) || clean(env.VERCEL_ENV).toLowerCase() === "production") throw error("DIRECTOR_OPERATIONS_CONTEXT_REQUIRED", 403);
  if (!actorValid) throw error("DIRECTOR_OPERATIONS_AUTHORIZATION_REQUIRED", 403);
  const bindingId = clean(env.BAGGER_ISOLATED_DIRECTOR_BINDING_ID).toLowerCase();
  if (!UUID.test(bindingId)) throw error("DIRECTOR_OPERATIONS_CONTEXT_REQUIRED", 403);
  return {contract_version: ISOLATED_DIRECTOR_OPERATIONS_CONTRACT,
    resource: {binding_id: bindingId, project_ref: database.projectRef, project_url: new URL(clean(env.SUPABASE_SCORING_MIRROR_URL)).origin},
    authorization: {auth_user_id: clean(identity.authUserId).toLowerCase(), player_id: clean(identity.actor.id), role: "DIRECTOR", tournament_id: clean(identity.tournamentId)}};
}
function contextOf(value, bound, expectedToken) {
  const context = value?.context;
  const governanceTournamentId = bound.certificationContext?.governance_tournament_id || bound.authorization.tournament_id;
  if (value?.ok !== true || !object(context) || context.contract !== ISOLATED_DIRECTOR_OPERATIONS_CONTRACT || context.bindingId !== bound.resource.binding_id || context.tournamentId !== bound.authorization.tournament_id || context.governanceTournamentId !== governanceTournamentId || !HASH.test(context.contextToken || "") || !Number.isSafeInteger(context.activationRevision) || context.activationRevision < 1 || !Number.isSafeInteger(context.admissionRevision) || context.admissionRevision < 1 || !UUID.test(context.authorityEpochId || "") || !/^[a-f0-9]{40}$/.test(context.releaseCommit || "")) throw error("DIRECTOR_OPERATIONS_RESPONSE_INVALID");
  if (expectedToken && context.contextToken !== expectedToken) throw error("DIRECTOR_OPERATIONS_CONTEXT_STALE", 409);
  // Explicit projection never returns the server transport or service credential.
  return {contract: context.contract, bindingId: context.bindingId, contextToken: context.contextToken, tournamentId: context.tournamentId, governanceTournamentId: context.governanceTournamentId, activationRevision: context.activationRevision, admissionRevision: context.admissionRevision, authorityEpochId: context.authorityEpochId, releaseCommit: context.releaseCommit};
}
function databaseError(failure) {
  const known = clean(failure?.code);
  if (/^DIRECTOR_OPERATIONS_[A-Z_]+$/.test(known)) return failure;
  if (/^(CERTIFICATION|CANONICAL_RESOURCE)_/.test(known)) {
    const code = /STALE|CONFLICT/.test(known) ? "DIRECTOR_OPERATIONS_CONTEXT_STALE"
      : /SCHEMA/.test(known) ? "DIRECTOR_OPERATIONS_SCHEMA_REQUIRED"
      : failure?.domainCode ? "DIRECTOR_OPERATIONS_DOMAIN_REJECTED"
      : failure?.status === 403 ? "DIRECTOR_OPERATIONS_CONTEXT_REQUIRED"
      : failure?.databaseSqlstate === "57014" ? "DIRECTOR_OPERATIONS_DATABASE_TIMEOUT" : "DIRECTOR_OPERATIONS_UNAVAILABLE";
    return error(code, failure?.status || 503, {...(failure?.domainCode ? {domainCode: failure.domainCode} : {}), ...(failure?.databaseSqlstate ? {databaseSqlstate: failure.databaseSqlstate} : {})});
  }
  const message = clean(failure?.shadowDiagnostics?.message || failure?.message || known);
  const extracted = /\b((?:ISOLATED_DIRECTOR|TOURNAMENT_SETUP|PRODUCTION_(?:DIRECTOR|CALCUTTA|MATCH))[A-Z_0-9]*)\b/.exec(message)?.[1];
  const domainCode = extracted || [...CONTROL_FAILURES].find(value => new RegExp(`\\b${value}\\b`).test(message));
  const state = clean(failure?.shadowDiagnostics?.code || failure?.code);
  const code = domainCode === "ISOLATED_DIRECTOR_CONTEXT_STALE" ? "DIRECTOR_OPERATIONS_CONTEXT_STALE"
    : domainCode === "ISOLATED_DIRECTOR_SCHEMA_REQUIRED" ? "DIRECTOR_OPERATIONS_SCHEMA_REQUIRED"
    : domainCode === "ISOLATED_DIRECTOR_CONTEXT_REQUIRED" ? "DIRECTOR_OPERATIONS_CONTEXT_REQUIRED"
    : /AUTHORIZATION/.test(domainCode || "") ? "DIRECTOR_OPERATIONS_AUTHORIZATION_REQUIRED"
    : domainCode ? "DIRECTOR_OPERATIONS_DOMAIN_REJECTED"
    : state === "57014" ? "DIRECTOR_OPERATIONS_DATABASE_TIMEOUT" : "DIRECTOR_OPERATIONS_UNAVAILABLE";
  const status = /CONTEXT_REQUIRED|AUTHORIZATION_REQUIRED/.test(code) ? 403 : /CONTEXT_STALE|DOMAIN_REJECTED/.test(code) ? 409 : 503;
  return error(code, status, {...(domainCode ? {domainCode} : {}), ...(state === "57014" || /^[0-9A-Z]{5}$/.test(state) ? {databaseSqlstate: state} : {})});
}
async function rpc(name, input, env, dependencies) {
  try {
    if (certificationRequested(env)) return await certificationDirectorRpc(name, input, env, dependencies);
    const result = await (dependencies.rpc || scoringShadowRpc)(name, {input}, {env});
    if (!result?.payload || result.payload.ok !== true) {
      const code = result?.payload?.receipt?.code;
      if (result?.payload?.receipt?.ok === false && (DOMAIN_CODE.test(code || "") || CONTROL_FAILURES.has(code))) throw error("DIRECTOR_OPERATIONS_DOMAIN_REJECTED", 409, {domainCode: code});
      throw error("DIRECTOR_OPERATIONS_RESPONSE_INVALID");
    }
    return result.payload;
  } catch (failure) { throw databaseError(failure); }
}
async function certificationDirectorRpc(name, input, env, dependencies) {
  const context = input.certificationContext;
  const family = input.family || "TOURNAMENT_SETUP";
  const status = input.mode === "status";
  const mutation = name === "execute_isolated_director_operation_v1";
  if (!mutation && name !== "read_isolated_director_operation_context_v1") throw error("DIRECTOR_OPERATIONS_INPUT_INVALID", 400);
  const operation = status ? {TOURNAMENT_SETUP:"DIRECTOR.SETUP_STATUS",ROUND_PAIRINGS:"DIRECTOR.SETUP_STATUS",MATCH_CONTROL:"DIRECTOR.MATCH_CONTROL_STATUS",NET_SKINS_ENTRIES:"DIRECTOR.NET_SKINS_STATUS",CALCUTTA_MANAGEMENT:"DIRECTOR.CALCUTTA_STATUS"}[family]
    : mutation ? {TOURNAMENT_SETUP:"DIRECTOR.MUTATE_SETUP",ROUND_PAIRINGS:"DIRECTOR.MUTATE_PAIRINGS",MATCH_CONTROL:"DIRECTOR.MATCH_CONTROL",NET_SKINS_ENTRIES:"DIRECTOR.SAVE_NET_SKINS_ENTRIES",NET_SKINS_CONFIGURATION:"DIRECTOR.CONFIGURE_NET_SKINS",CALCUTTA_PUBLICATION:"DIRECTOR.PUBLISH_CALCUTTA",CALCUTTA_MANAGEMENT:input.action === "clear-entry" ? "DIRECTOR.CLEAR_CALCUTTA_AUCTION" : "DIRECTOR.REPLACE_CALCUTTA_AUCTION"}[family]
    : {TOURNAMENT_SETUP:"DIRECTOR.READ_SETUP",ROUND_PAIRINGS:"DIRECTOR.READ_SETUP",MATCH_CONTROL:"DIRECTOR.READ_SETUP",NET_SKINS_ENTRIES:"DIRECTOR.READ_NET_SKINS",NET_SKINS_CONFIGURATION:"DIRECTOR.READ_NET_SKINS_CONFIGURATION",CALCUTTA_PUBLICATION:"DIRECTOR.READ_CALCUTTA_PUBLICATION",CALCUTTA_MANAGEMENT:"DIRECTOR.READ_CALCUTTA"}[family];
  const result = await certificationOperationRpc(operation, {...input.payload, family, action: input.action || "read",
    ...(status ? {original_context_token: input.expected_context_token} : {})}, {env, context,
    authorization: input.authorization, operationRequestId: input.operation_request_id,
    ...(status ? {} : {expectedContextToken: input.expected_context_token})}, dependencies.certificationDependencies);
  const projectedContext = {contract: ISOLATED_DIRECTOR_OPERATIONS_CONTRACT, bindingId: context.binding_id, contextToken: context.context_token,
    tournamentId: context.tournament_id, governanceTournamentId: context.governance_tournament_id,
    activationRevision: context.activation_revision, admissionRevision: context.admission_revision,
    authorityEpochId: context.authority_epoch_id, releaseCommit: context.release_commit};
  // These two admitted private read projections return the canonical model
  // directly, unlike mutation/status receipts. Validate that exact model;
  // absence of an `ok` envelope is not a domain rejection or new admission.
  const directFinancialRead = !mutation && !status && result.payload?.ok === undefined
    && ["NET_SKINS_ENTRIES", "CALCUTTA_MANAGEMENT"].includes(family);
  if (directFinancialRead) projectData(family, result.payload, context.tournament_id);
  else if (result.payload?.ok !== true) throw error("DIRECTOR_OPERATIONS_DOMAIN_REJECTED", 409, {domainCode: result.payload?.code});
  return {ok: true, context: projectedContext, ...(mutation ? {receipt: result.payload, operationRequestId: input.operation_request_id, family: input.family, action: input.action} : {data: result.payload})};
}
function familyName(value, required = true) {
  if (!value && !required) return null;
  if (!FAMILIES.has(value)) throw error("DIRECTOR_OPERATIONS_INPUT_INVALID", 400);
  return value;
}
function readPayload(family, payload = {}) {
  exactKeys(payload, family === "CALCUTTA_MANAGEMENT" ? ["expectedAuctionRevision"] : []);
  if (payload.expectedAuctionRevision !== undefined && (!Number.isSafeInteger(payload.expectedAuctionRevision) || payload.expectedAuctionRevision < 0)) throw error("DIRECTOR_OPERATIONS_INPUT_INVALID", 400);
  return payload.expectedAuctionRevision === undefined ? {} : {predecessor_auction_revision: payload.expectedAuctionRevision};
}
function projectData(family, data, tournamentId) {
  if (!family) return undefined;
  const value = data?.data || data;
  if (family === "MATCH_CONTROL") {
    if (!object(value) || !Array.isArray(value.matches) || String(value.tournament?.tournamentId || value.tournament?.tournament_id || value.tournament?.id || "") !== tournamentId) throw error("DIRECTOR_OPERATIONS_RESPONSE_INVALID");
    return value;
  }
  if (["TOURNAMENT_SETUP", "ROUND_PAIRINGS"].includes(family)) {
    const normalized = normalizeProductionTournamentSetupPayload(data);
    if (String(normalized.tournament.tournamentId || normalized.tournament.id || "") !== tournamentId) throw error("DIRECTOR_OPERATIONS_SCOPE_MISMATCH", 403);
    return normalized;
  }
  if (family === "NET_SKINS_CONFIGURATION") {
    if (!object(value) || value.tournament_id !== tournamentId || !Number.isSafeInteger(value.configuration_revision)
      || value.configuration_revision < 0 || !["NOT_CONFIGURED", "CONFIGURED"].includes(value.state)
      || !Array.isArray(value.rounds) || (value.configuration_revision > 0 && !HASH.test(value.configuration_fingerprint || ""))) {
      throw error("DIRECTOR_OPERATIONS_RESPONSE_INVALID");
    }
    return value;
  }
  if (family === "CALCUTTA_PUBLICATION") {
    if (!object(value) || value.tournament_id !== tournamentId || !["PUBLISHED", "UNPUBLISHED"].includes(value.publication_state)
      || ["configuration_revision", "auction_revision", "publication_revision", "result_revision"].some(key => !Number.isSafeInteger(value[key]) || value[key] < 0)
      || !HASH.test(value.configuration_fingerprint || "") || !HASH.test(value.source_fingerprint || "")
      || (value.auction_revision > 0 && !HASH.test(value.auction_fingerprint || "")) || typeof value.result_current !== "boolean") {
      throw error("DIRECTOR_OPERATIONS_RESPONSE_INVALID");
    }
    return value;
  }
  if (family === "NET_SKINS_ENTRIES") return normalizeNetSkinsEntries(value);
  if (!object(value) || value.tournament_id !== tournamentId || !Array.isArray(value.players) || !Array.isArray(value.purchases) || !Array.isArray(value.ownership)) throw error("DIRECTOR_OPERATIONS_RESPONSE_INVALID");
  return value;
}
export async function readIsolatedDirectorOperations({authorization, family = null, payload = {}, expectedContextToken, env = process.env} = {}, dependencies = {}) {
  if (["NET_SKINS_CONFIGURATION", "CALCUTTA_PUBLICATION"].includes(family) && !certificationRequested(env)) throw error("DIRECTOR_OPERATIONS_CONTEXT_REQUIRED", 403);
  const bound = await scope(authorization, env, dependencies); family = familyName(family, false);
  if (expectedContextToken !== undefined && !HASH.test(expectedContextToken)) throw error("DIRECTOR_OPERATIONS_INPUT_INVALID", 400);
  const result = await rpc("read_isolated_director_operation_context_v1", {...bound, ...(family ? {family, action: "read", payload: readPayload(family, payload)} : {}), ...(expectedContextToken ? {expected_context_token: expectedContextToken} : {})}, env, dependencies);
  const context = contextOf(result, bound, expectedContextToken);
  return {ok: true, contract: ISOLATED_DIRECTOR_OPERATIONS_CONTRACT, authority: "supabase", fallbackUsed: false, googleRequests: 0, context, family, ...(family ? {data: projectData(family, result.data, context.tournamentId)} : {})};
}
function prepareCommand(input, model, statusOnly = false) {
  const {family, action, payload, operationRequestId} = input;
  if (["TOURNAMENT_SETUP", "ROUND_PAIRINGS"].includes(family)) {
    if (!PRODUCTION_TOURNAMENT_SETUP_ACTIONS.includes(action) || (family === "ROUND_PAIRINGS") !== (action === "replace-round-pairings")) throw error("DIRECTOR_OPERATIONS_INPUT_INVALID", 400);
    return buildTournamentSetupMutation(action, {...payload, operationRequestId});
  }
  if (family === "MATCH_CONTROL") {
    exactKeys(payload, ["matchId", "expectedMatchRevision", "expectedPermissionRevision"]);
    if (!CONTROLS.has(action) || !ID.test(payload.matchId || "") || !Number.isSafeInteger(payload.expectedMatchRevision) || payload.expectedMatchRevision < 0 || !Number.isSafeInteger(payload.expectedPermissionRevision) || payload.expectedPermissionRevision < 1) throw error("DIRECTOR_OPERATIONS_INPUT_INVALID", 400);
    return {match_id: payload.matchId, expected_match_revision: payload.expectedMatchRevision, expected_permission_revision: payload.expectedPermissionRevision};
  }
  if (family === "NET_SKINS_CONFIGURATION") {
    exactKeys(payload, ["expectedConfigurationRevision", "eligibleRoundNumbers", "entryRevisions"]);
    const rounds = payload.eligibleRoundNumbers;
    if (action !== "configure" || !Number.isSafeInteger(payload.expectedConfigurationRevision) || payload.expectedConfigurationRevision < 0
      || !Array.isArray(rounds) || !rounds.length || rounds.length > 3 || rounds.some(round => !Number.isSafeInteger(round) || ![1,2,3].includes(round))
      || new Set(rounds).size !== rounds.length || !object(payload.entryRevisions)
      || Object.keys(payload.entryRevisions).length !== rounds.length
      || Object.keys(payload.entryRevisions).some(key => !rounds.some(round => String(round) === key))
      || rounds.some(round => !Number.isSafeInteger(payload.entryRevisions[round]) || payload.entryRevisions[round] < 1)) {
      throw error("DIRECTOR_OPERATIONS_INPUT_INVALID", 400);
    }
    return {expected_configuration_revision: payload.expectedConfigurationRevision,
      eligible_round_numbers: [...rounds].sort((a,b) => a-b), entry_revisions: payload.entryRevisions};
  }
  if (family === "CALCUTTA_PUBLICATION") {
    exactKeys(payload, ["expectedConfigurationRevision", "expectedConfigurationFingerprint", "expectedAuctionRevision",
      "expectedAuctionFingerprint", "expectedPublicationRevision", "expectedResultRevision", "expectedSourceFingerprint"]);
    if (action !== "publish" || ["expectedConfigurationRevision", "expectedAuctionRevision", "expectedResultRevision"].some(key => !Number.isSafeInteger(payload[key]) || payload[key] < 1)
      || !Number.isSafeInteger(payload.expectedPublicationRevision) || payload.expectedPublicationRevision < 0
      || ["expectedConfigurationFingerprint", "expectedAuctionFingerprint", "expectedSourceFingerprint"].some(key => !HASH.test(payload[key] || ""))) {
      throw error("DIRECTOR_OPERATIONS_INPUT_INVALID", 400);
    }
    // These are CAS expectations, never a client-selected result/target/payload.
    // The private core independently selects and validates the current result.
    return {expected_configuration_revision: payload.expectedConfigurationRevision,
      expected_configuration_fingerprint: payload.expectedConfigurationFingerprint, expected_auction_revision: payload.expectedAuctionRevision,
      expected_auction_fingerprint: payload.expectedAuctionFingerprint, expected_publication_revision: payload.expectedPublicationRevision,
      expected_result_revision: payload.expectedResultRevision, expected_source_fingerprint: payload.expectedSourceFingerprint};
  }
  if (family === "NET_SKINS_ENTRIES") {
    exactKeys(payload, ["roundNumber", "expectedRevision", "fieldFingerprint", "configured", "entries"]);
    if (action !== "save" || !Number.isSafeInteger(payload.roundNumber) || payload.roundNumber < 1 || payload.roundNumber > 3 || !Number.isSafeInteger(payload.expectedRevision) || payload.expectedRevision < 0 || !HASH.test(payload.fieldFingerprint || "") || typeof payload.configured !== "boolean" || !Array.isArray(payload.entries)) throw error("DIRECTOR_OPERATIONS_INPUT_INVALID", 400);
    return {round_number: payload.roundNumber, expected_revision: payload.expectedRevision, field_fingerprint: payload.fieldFingerprint, configured: payload.configured, entries: payload.entries};
  }
  exactKeys(payload, ["expectedTournamentId", "expectedConfigurationRevision", "expectedConfigurationFingerprint", "expectedAuctionRevision", "expectedAuctionFingerprint", "expectedPublicationRevision", "entry", "playerId"]);
  if (payload.expectedTournamentId !== model.tournament_id || (!statusOnly && model.publication_state !== "UNPUBLISHED")) throw error("DIRECTOR_OPERATIONS_FINANCIAL_CONFLICT", 409);
  for (const key of ["expectedConfigurationRevision", "expectedAuctionRevision", "expectedPublicationRevision"]) if (!Number.isSafeInteger(payload[key]) || payload[key] < 0) throw error("DIRECTOR_OPERATIONS_INPUT_INVALID", 400);
  const base = {expected_configuration_revision: payload.expectedConfigurationRevision, expected_configuration_fingerprint: payload.expectedConfigurationFingerprint, expected_auction_revision: payload.expectedAuctionRevision, expected_auction_fingerprint: payload.expectedAuctionFingerprint, expected_publication_revision: payload.expectedPublicationRevision};
  if (model.predecessor_auction_fingerprint !== (payload.expectedAuctionFingerprint || null)) throw error("DIRECTOR_OPERATIONS_FINANCIAL_CONFLICT", 409);
  if (action === "clear-entry") {
    if (!model.players.some(player => player.player_id === payload.playerId) || !model.predecessor_purchases.some(purchase => purchase.player_id === payload.playerId)) throw error("DIRECTOR_OPERATIONS_INPUT_INVALID", 400);
    return {...base, player_id: payload.playerId};
  }
  if (action !== "replace-auction") throw error("DIRECTOR_OPERATIONS_INPUT_INVALID", 400);
  const merged = mergeEntry({purchases: model.predecessor_purchases, ownership: model.predecessor_ownership}, entryPayload(payload.entry, model.players));
  return {...base, purchases: merged.purchases, ownership: merged.ownership};
}
function verifiedReceipt(input, raw, data, command, before) {
  const receipt = raw?.data && raw.data.ok === undefined ? {...raw.data, ok: true} : raw;
  if (!receipt?.ok) throw error("DIRECTOR_OPERATIONS_READBACK_UNCONFIRMED");
  if (["TOURNAMENT_SETUP", "ROUND_PAIRINGS"].includes(input.family)) {
    const result = normalizeProductionTournamentSetupMutation(receipt);
    if (result.action !== command.operation || data.revision < result.revision) throw error("DIRECTOR_OPERATIONS_READBACK_UNCONFIRMED");
    return result;
  }
  if (input.family === "NET_SKINS_CONFIGURATION") {
    if (receipt.code !== "PRODUCTION_NET_SKINS_V1_CONFIGURED" || !Number.isSafeInteger(receipt.configuration_revision)
      || receipt.configuration_revision < 1 || !HASH.test(receipt.configuration_fingerprint || "")
      || data.configuration_revision < receipt.configuration_revision
      || (data.configuration_revision === receipt.configuration_revision && data.configuration_fingerprint !== receipt.configuration_fingerprint)) {
      throw error("DIRECTOR_OPERATIONS_READBACK_UNCONFIRMED");
    }
    return Object.fromEntries(["ok", "code", "configuration_revision", "configuration_fingerprint", "state", "rounds", "idempotent"].map(key => [key, receipt[key]]));
  }
  if (input.family === "CALCUTTA_PUBLICATION") {
    if (!["PRODUCTION_CALCUTTA_V1_PUBLISHED", "PRODUCTION_CALCUTTA_V1_ALREADY_PUBLISHED"].includes(receipt.code)
      || receipt.publication_state !== "PUBLISHED" || data.publication_state !== "PUBLISHED" || !data.result_current
      || ["configuration_revision", "configuration_fingerprint", "auction_revision", "auction_fingerprint", "publication_revision", "result_revision"].some(key => receipt[key] !== data[key])
      || data.result_revision !== command.expected_result_revision || data.source_fingerprint !== command.expected_source_fingerprint) {
      throw error("DIRECTOR_OPERATIONS_READBACK_UNCONFIRMED");
    }
    return Object.fromEntries(["ok", "code", "configuration_revision", "configuration_fingerprint", "auction_revision", "auction_fingerprint",
      "publication_revision", "publication_state", "result_revision", "idempotent"].map(key => [key, receipt[key]]));
  }
  if (input.family === "NET_SKINS_ENTRIES") {
    const round = data.rounds.find(row => row.roundNumber === command.round_number);
    if (!Number.isSafeInteger(receipt.revision) || !round || round.revision < receipt.revision || receipt.financialMutationCreated !== false || receipt.scoringMutationCreated !== false || receipt.publicationCreated !== false) throw error("DIRECTOR_OPERATIONS_READBACK_UNCONFIRMED");
    return {ok: true, revision: receipt.revision, roundNumber: receipt.roundNumber, idempotent: receipt.idempotent === true, financialMutationCreated: false, scoringMutationCreated: false, publicationCreated: false};
  }
  if (input.family === "MATCH_CONTROL") {
    const match = data.matches.find(row => row.matchId === command.match_id);
    if (!match || receipt.match_id !== command.match_id || !Number.isSafeInteger(receipt.match_revision) || !Number.isSafeInteger(receipt.permission_revision) || !Number.isSafeInteger(match.matchRevision) || !Number.isSafeInteger(match.permissionRevision) || match.matchRevision < receipt.match_revision || match.permissionRevision < receipt.permission_revision) throw error("DIRECTOR_OPERATIONS_READBACK_UNCONFIRMED");
    return Object.fromEntries(["ok", "code", "match_id", "match_revision", "permission_revision", "status", "scoring_locked", "access_active", "semantic_noop", "audit_created"].filter(key => Object.hasOwn(receipt, key)).map(key => [key, receipt[key]]));
  }
  const intended = input.action === "clear-entry" ? {purchases: before.predecessor_purchases.filter(row => row.player_id !== command.player_id), ownership: before.predecessor_ownership.filter(row => row.player_id !== command.player_id)} : command;
  const matches = canonicalEqual(data.purchases, intended.purchases) && canonicalEqual(data.ownership, intended.ownership);
  if (!matches || data.publication_state !== "UNPUBLISHED" || ["configuration_revision", "auction_revision", "publication_revision", "configuration_fingerprint", "auction_fingerprint"].some(key => data[key] !== receipt[key])) throw error("DIRECTOR_OPERATIONS_READBACK_UNCONFIRMED");
  return Object.fromEntries(["ok", "code", "configuration_revision", "auction_revision", "publication_revision", "configuration_fingerprint", "auction_fingerprint", "publication_state", "cleared_player_id", "idempotent"].filter(key => Object.hasOwn(receipt, key)).map(key => [key, receipt[key]]));
}
export async function mutateIsolatedDirectorOperations({authorization, input, env = process.env} = {}, dependencies = {}) {
  if (["NET_SKINS_CONFIGURATION", "CALCUTTA_PUBLICATION"].includes(input?.family) && !certificationRequested(env)) throw error("DIRECTOR_OPERATIONS_CONTEXT_REQUIRED", 403);
  const bound = await scope(authorization, env, dependencies);
  exactKeys(input, ["family", "action", "payload", "operationRequestId", "expectedContextToken"]);
  familyName(input.family); noAuthorityFields(input.payload);
  if (input.family === "CALCUTTA_MANAGEMENT" && !["replace-auction", "clear-entry"].includes(input.action)) throw error("DIRECTOR_OPERATIONS_INPUT_INVALID", 400);
  if (!object(input.payload) || !UUID.test(input.operationRequestId || "") || !HASH.test(input.expectedContextToken || "") || typeof input.action !== "string") throw error("DIRECTOR_OPERATIONS_INPUT_INVALID", 400);
  const recovery = {operationRequestId: input.operationRequestId, outcome: "UNKNOWN", recovery: "CHECK_STATUS_RETRY_SAME_OPERATION"};
  let committed = false;
  try {
    const before = await readIsolatedDirectorOperations({authorization, family: input.family, payload: input.family === "CALCUTTA_MANAGEMENT" ? {expectedAuctionRevision: input.payload.expectedAuctionRevision} : {}, expectedContextToken: input.expectedContextToken, env}, dependencies);
    const command = prepareCommand(input, before.data);
    const result = await rpc("execute_isolated_director_operation_v1", {...bound, expected_context_token: input.expectedContextToken, operation_request_id: input.operationRequestId, family: input.family, action: input.action, payload: command}, env, dependencies);
    const context = contextOf(result, bound, input.expectedContextToken);
    if (result.operationRequestId !== input.operationRequestId || result.family !== input.family || result.action !== input.action || result.receipt?.ok !== true) throw error("DIRECTOR_OPERATIONS_RESPONSE_INVALID");
    committed = true;
    const after = await readIsolatedDirectorOperations({authorization, family: input.family, expectedContextToken: input.expectedContextToken, env}, dependencies);
    const receipt = verifiedReceipt(input, result.receipt, after.data, command, before.data);
    return {ok: true, contract: ISOLATED_DIRECTOR_OPERATIONS_CONTRACT, authority: "supabase", fallbackUsed: false, googleRequests: 0, family: input.family, action: input.action, operationRequestId: input.operationRequestId, context, outcome: "COMMITTED", committed: true, readbackVerified: true, receipt, data: after.data};
  } catch (failure) {
    const typed = databaseError(failure);
    // A rejected retry is not proof that an earlier attempt with this ID did not commit.
    throw Object.assign(typed, recovery, {committed, outcome: committed ? "COMMITTED" : "UNKNOWN"});
  }
}

// Read-only reconciliation uses current admission plus the original command
// identity. An old token identifies the receipt; it never authorizes a write.
export async function resolveIsolatedDirectorOperation({authorization, input, env = process.env} = {}, dependencies = {}) {
  const certification = certificationRequested(env);
  if (["NET_SKINS_CONFIGURATION", "CALCUTTA_PUBLICATION"].includes(input?.family) && !certification) throw error("DIRECTOR_OPERATIONS_CONTEXT_REQUIRED", 403);
  const bound = certification ? null : await scope(authorization, env, dependencies);
  exactKeys(input, ["mode", "family", "action", "payload", "operationRequestId", "expectedContextToken"]);
  familyName(input.family); noAuthorityFields(input.payload);
  if (input.mode !== "status" || !object(input.payload) || !UUID.test(input.operationRequestId || "") || !HASH.test(input.expectedContextToken || "") || typeof input.action !== "string" || (input.family === "CALCUTTA_MANAGEMENT" && !["replace-auction", "clear-entry"].includes(input.action))) throw error("DIRECTOR_OPERATIONS_INPUT_INVALID", 400);
  if (certification) return resolveCertificationDirectorOperation({authorization, input, env}, dependencies);
  try {
    const current = await readIsolatedDirectorOperations({authorization, family: input.family, payload: input.family === "CALCUTTA_MANAGEMENT" ? {expectedAuctionRevision: input.payload.expectedAuctionRevision} : {}, env}, dependencies);
    const command = prepareCommand(input, current.data, true);
    const statusResponse = await rpc("read_isolated_director_operation_context_v1", {...bound, mode: "status", family: input.family, action: input.action, operation_request_id: input.operationRequestId, expected_context_token: input.expectedContextToken, payload: command}, env, dependencies);
    const context = contextOf(statusResponse, bound);
    const status = statusResponse.data;
    if (status?.ok !== true || !["COMMITTED", "UNKNOWN"].includes(status.outcome) || (status.outcome === "COMMITTED" ? status.receipt?.ok !== true : status.receipt !== null)) throw error("DIRECTOR_OPERATIONS_RESPONSE_INVALID");
    const result = {ok: true, contract: ISOLATED_DIRECTOR_OPERATIONS_CONTRACT, authority: "supabase", fallbackUsed: false, googleRequests: 0, mode: "status", family: input.family, action: input.action, operationRequestId: input.operationRequestId, context, outcome: status.outcome, committed: status.outcome === "COMMITTED", receipt: status.receipt, readbackVerified: false, recovery: status.outcome === "COMMITTED" ? "REFRESH_CURRENT_AUTHORITY" : "CHECK_STATUS_RETRY_SAME_OPERATION"};
    if (result.committed) {
      try {
        const after = await readIsolatedDirectorOperations({authorization, family: input.family, expectedContextToken: context.contextToken, env}, dependencies);
        result.receipt = verifiedReceipt(input, status.receipt, after.data, command, current.data);
        result.data = after.data; result.readbackVerified = true;
      } catch { /* Exact committed receipt remains true even when current readback is unavailable. */ }
    }
    return result;
  } catch (failure) {
    throw Object.assign(databaseError(failure), {operationRequestId: input.operationRequestId, outcome: "UNKNOWN", recovery: "CHECK_STATUS_RETRY_SAME_OPERATION"});
  }
}

async function resolveCertificationDirectorOperation({authorization, input, env}, dependencies) {
  const identity = authorization?.identity;
  if (authorization?.status !== "active" || authorization.source !== "entitlement" || identity?.actor?.role !== "DIRECTOR" ||
    identity.impersonating === true || !UUID.test(clean(identity.authUserId)) || !ID.test(clean(identity.actor?.id)) || !ID.test(clean(identity.tournamentId))) {
    throw error("DIRECTOR_OPERATIONS_AUTHORIZATION_REQUIRED", 403);
  }
  const actor = {passport_verified: true, auth_user_id: clean(identity.authUserId).toLowerCase(),
    player_id: clean(identity.actor.id), role: "DIRECTOR", tournament_id: clean(identity.tournamentId)};
  const operation = {TOURNAMENT_SETUP:"DIRECTOR.MUTATE_SETUP", ROUND_PAIRINGS:"DIRECTOR.MUTATE_PAIRINGS",
    MATCH_CONTROL:"DIRECTOR.MATCH_CONTROL", NET_SKINS_ENTRIES:"DIRECTOR.SAVE_NET_SKINS_ENTRIES", NET_SKINS_CONFIGURATION:"DIRECTOR.CONFIGURE_NET_SKINS",CALCUTTA_PUBLICATION:"DIRECTOR.PUBLISH_CALCUTTA",
    CALCUTTA_MANAGEMENT: input.action === "clear-entry" ? "DIRECTOR.CLEAR_CALCUTTA_AUCTION" : "DIRECTOR.REPLACE_CALCUTTA_AUCTION"}[input.family];
  const options = {env, authorization: actor, operationRequestId: input.operationRequestId};
  try {
    const material = (await readCertificationDirectorRecoveryMaterial(operation,
      input.family === "MATCH_CONTROL" ? {match_id: input.payload.matchId} : {}, options, dependencies.certificationDependencies)).payload;
    if (material.lease_id === null) throw error("DIRECTOR_OPERATIONS_RECOVERY_UNCONFIRMED");
    const original = material.admission_context;
    const projected = {contract: ISOLATED_DIRECTOR_OPERATIONS_CONTRACT, bindingId: original.binding_id,
      contextToken: original.context_token, tournamentId: original.tournament_id, governanceTournamentId: original.governance_tournament_id,
      activationRevision: original.activation_revision, admissionRevision: original.admission_revision,
      authorityEpochId: original.authority_epoch_id, releaseCommit: original.release_commit};
    const context = contextOf({ok: true, context: projected}, {resource: {binding_id: original.binding_id},
      authorization: {tournament_id: original.tournament_id}}, input.expectedContextToken);
    // Financial commands reuse the exact admitted predecessor revision. They
    // cannot normalize against a different current tournament or auction.
    const before = material.predecessor_projection;
    const command = prepareCommand(input, before, true);
    const outcome = (await replayCertificationIngress(operation, {...command, family: input.family, action: input.action},
      options, dependencies.certificationDependencies)).payload;
    if (outcome.lease_id !== material.lease_id || outcome.request_hash !== material.request_hash) throw error("DIRECTOR_OPERATIONS_RESPONSE_INVALID");
    const committed = outcome.state === "COMMITTED";
    const result = {ok: true, contract: ISOLATED_DIRECTOR_OPERATIONS_CONTRACT, authority: "supabase", fallbackUsed: false, googleRequests: 0,
      mode: "status", family: input.family, action: input.action, operationRequestId: input.operationRequestId, context,
      outcome: committed ? "COMMITTED" : "UNKNOWN", committed, receipt: committed ? outcome.result : null, readbackVerified: false,
      recovery: committed ? "REFRESH_CURRENT_AUTHORITY" : "CHECK_STATUS_RETRY_SAME_OPERATION"};
    if (committed) {
      try {
        const after = await readIsolatedDirectorOperations({authorization, family: input.family, expectedContextToken: context.contextToken, env}, dependencies);
        result.receipt = verifiedReceipt(input, outcome.result, after.data, command, before);
        result.data = after.data; result.readbackVerified = true;
      } catch { /* A historical committed receipt remains true without fresh readback. */ }
    }
    return result;
  } catch (failure) {
    throw Object.assign(databaseError(failure), {operationRequestId: input.operationRequestId, outcome: "UNKNOWN", recovery: "CHECK_STATUS_RETRY_SAME_OPERATION"});
  }
}
