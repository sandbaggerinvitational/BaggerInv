// Server-only fixed synthetic profile. No caller-selected settings or targets.
import "server-only";
import {certificationOperationRpc} from "./certification-runtime-server.js";

const FAMILY = "ODDS_INPUT_CONFIGURATION";
const CONTRACT = "isolated-director-operations-v1";
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const HASH = /^[a-f0-9]{64}$/;
const fail = (code, status = 409, extra = {}) => Object.assign(
  new Error("Odds input configuration could not be confirmed."), {code, status, ...extra});
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);

function command(input) {
  if (!object(input) || Object.keys(input).some(key => !["mode", "family", "action", "payload", "operationRequestId", "expectedContextToken"].includes(key))
      || input.family !== FAMILY || input.action !== "configure" || !UUID.test(input.operationRequestId || "") || !HASH.test(input.expectedContextToken || "")
      || !object(input.payload) || Object.keys(input.payload).some(key => !["expectedConfigurationRevision", "profile", "confirmation", "reason"].includes(key))) {
    throw fail("DIRECTOR_OPERATIONS_INPUT_INVALID", 400);
  }
  const payload = input.payload;
  if (!Number.isSafeInteger(payload.expectedConfigurationRevision) || payload.expectedConfigurationRevision < 0
      || payload.profile !== "CERTIFICATION_DEFAULTS_V1" || payload.confirmation !== "CONFIGURE SYNTHETIC ODDS INPUTS"
      || typeof payload.reason !== "string" || !payload.reason.trim() || payload.reason.length > 500) {
    throw fail("DIRECTOR_OPERATIONS_INPUT_INVALID", 400);
  }
  return {expected_configuration_revision: payload.expectedConfigurationRevision, profile: payload.profile,
    confirmation: payload.confirmation, reason: payload.reason};
}

function base(bound) {
  const context = bound.certificationContext;
  return {ok: true, contract: CONTRACT, authority: "supabase", fallbackUsed: false, googleRequests: 0, family: FAMILY,
    context: {contract: CONTRACT, bindingId: context.binding_id, contextToken: context.context_token,
      tournamentId: context.tournament_id, governanceTournamentId: context.governance_tournament_id,
      activationRevision: context.activation_revision, admissionRevision: context.admission_revision,
      authorityEpochId: context.authority_epoch_id, releaseCommit: context.release_commit}};
}

async function call(operation, payload, {bound, env, input, dependencies}) {
  try {
    return (await certificationOperationRpc(operation, payload, {env, context: bound.certificationContext,
      authorization: bound.authorization, operationRequestId: input?.operationRequestId,
      ...(operation === "DIRECTOR.CONFIGURE_ODDS_INPUTS" ? {expectedContextToken: input.expectedContextToken} : {})},
    dependencies.certificationDependencies)).payload;
  } catch (error) {
    const code = error.domainCode ? "DIRECTOR_OPERATIONS_DOMAIN_REJECTED"
      : error.status === 403 ? "DIRECTOR_OPERATIONS_CONTEXT_REQUIRED"
        : error.status === 409 ? "DIRECTOR_OPERATIONS_CONTEXT_STALE" : "DIRECTOR_OPERATIONS_UNAVAILABLE";
    throw fail(code, error.status || 503, {domainCode: error.domainCode, outcome: "UNKNOWN", operationRequestId: input?.operationRequestId});
  }
}

export async function readCertificationOddsConfiguration(args) {
  const result = await call("DIRECTOR.READ_ODDS_INPUT_CONFIGURATION", {}, args);
  if (result?.ok !== true || result.data?.tournament_id !== args.bound.authorization.tournament_id
      || !Number.isSafeInteger(result.data.configuration_revision) || !["NOT_CONFIGURED", "CONFIGURED"].includes(result.data.state)) {
    throw fail("DIRECTOR_OPERATIONS_RESPONSE_INVALID", 503);
  }
  return {...base(args.bound), data: result.data};
}

export async function resolveCertificationOddsConfiguration(args) {
  const payload = command(args.input);
  const status = await call("DIRECTOR.ODDS_INPUT_CONFIGURATION_STATUS", payload, args);
  if (status?.ok !== true || !["COMMITTED", "NOT_COMMITTED", "UNKNOWN"].includes(status.outcome)
      || (status.outcome === "COMMITTED" ? status.receipt?.ok !== true : status.receipt !== null)) {
    throw fail("DIRECTOR_OPERATIONS_RESPONSE_INVALID", 503);
  }
  const current = await readCertificationOddsConfiguration(args);
  return {...base(args.bound), mode: "status", action: "configure", operationRequestId: args.input.operationRequestId,
    outcome: status.outcome, committed: status.outcome === "COMMITTED", receipt: status.receipt, data: current.data,
    readbackVerified: status.outcome === "COMMITTED",
    recovery: status.outcome === "COMMITTED" ? "REFRESH_CURRENT_AUTHORITY" : "CHECK_STATUS_RETRY_SAME_OPERATION"};
}

export async function configureCertificationOddsInputs(args) {
  const payload = command(args.input);
  if (args.input.mode !== undefined || args.input.expectedContextToken !== args.bound.certificationContext.context_token) {
    throw fail("DIRECTOR_OPERATIONS_CONTEXT_STALE", 409);
  }
  let receipt;
  try {
    receipt = await call("DIRECTOR.CONFIGURE_ODDS_INPUTS", payload, args);
  } catch (error) {
    try {
      const status = await resolveCertificationOddsConfiguration(args);
      if (status.outcome === "COMMITTED") return {...status, mode: undefined};
      Object.assign(error, {outcome: status.outcome});
    } catch {
      // A failed read cannot establish rollback after an uncertain write.
    }
    throw error;
  }
  const current = await readCertificationOddsConfiguration(args);
  if (receipt?.ok !== true || current.data.configuration_revision < receipt.configuration_revision) {
    throw fail("DIRECTOR_OPERATIONS_READBACK_UNCONFIRMED", 503, {outcome: "COMMITTED", committed: true});
  }
  return {...base(args.bound), action: "configure", operationRequestId: args.input.operationRequestId,
    outcome: "COMMITTED", committed: true, readbackVerified: true, receipt, data: current.data};
}
