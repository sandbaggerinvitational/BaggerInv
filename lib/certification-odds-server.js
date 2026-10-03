import "server-only";
import {randomUUID} from "node:crypto";
import {requireCertificationResourceEnvironment} from "./canonical-resource-registration.js";
import {resolveCertificationRuntimeContext, certificationOddsRpc} from "./certification-runtime-server.js";
import {buildOddsCalculationInvocation, processOddsCalculationJob, ODDS_CALCULATION_JOB_CONTRACT_VERSION} from "./championship-odds-resilience.js";
import {oddsEngineInputsFromBundle, logicalOddsResult} from "./championship-odds-supabase.js";
import {canonicalJson, scoringShadowPayloadHash} from "./scoring-shadow.js";
import {ODDS_PHASES, ODDS_SUPPORTED_ITERATION_COUNTS} from "./tournament-odds.js";

export const CERTIFICATION_DIRECTOR_ODDS_CONTRACT = "certification-director-odds-v1";
const JOB_CONTRACT = "certification-odds-calculation-job-identity-v1";
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const HASH = /^[a-f0-9]{64}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const RPC = Object.freeze({inputs:"read_production_odds_calculation_inputs", request:"request_production_odds_calculation_job",
  jobs:"read_production_odds_calculation_jobs", claim:"claim_production_odds_calculation_job",
  checkpoint:"checkpoint_production_odds_calculation_job", complete:"complete_production_odds_calculation_job",
  fail:"fail_production_odds_calculation_job", publication:"read_production_odds_publication_v1",
  publish:"publish_production_championship_odds_v1"});
const clean = value => typeof value === "string" ? value.trim() : "";
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const fail = (code, status = 503, details = {}) => Object.assign(new Error("Canonical Odds operation could not be confirmed."), {code, status, ...details});
function keys(value, allowed) {
  if (!object(value) || Object.keys(value).some(key => !allowed.includes(key))) throw fail("DIRECTOR_ODDS_INPUT_INVALID", 400);
}
function actor(authorization) {
  const identity = authorization?.identity;
  if (authorization?.status !== "active" || authorization.source !== "entitlement" || identity?.actor?.role !== "DIRECTOR" ||
      identity.impersonating === true || !UUID.test(clean(identity.authUserId)) || !ID.test(clean(identity.actor.id)) || !ID.test(clean(identity.tournamentId))) {
    throw fail("DIRECTOR_ODDS_AUTHORIZATION_REQUIRED", 403);
  }
  return {passport_verified: true, auth_user_id: identity.authUserId, player_id: identity.actor.id,
    role: "DIRECTOR", tournament_id: identity.tournamentId};
}
async function scope(authorization, env, dependencies, {recovery = false} = {}) {
  const boundActor = actor(authorization);
  requireCertificationResourceEnvironment(env, dependencies);
  const context = recovery ? null : await resolveCertificationRuntimeContext({env, phase:"DIRECTOR"}, dependencies);
  if (context && context.tournament_id !== boundActor.tournament_id) throw fail("DIRECTOR_ODDS_SCOPE_MISMATCH", 403);
  return {env, context, authorization: boundActor};
}
async function call(name, payload, options, dependencies) {
  const result = await certificationOddsRpc(name, payload, options, dependencies);
  if (result.payload?.ok !== true) throw fail(result.payload?.code || "DIRECTOR_ODDS_STATE_UNAVAILABLE", 409);
  return result.payload;
}
function safeJob(job, target) {
  if (job?.tournament_id !== target || !HASH.test(job.job_id || "")) throw fail("DIRECTOR_ODDS_SCOPE_MISMATCH", 403);
  // Explicit projection: never expose stored input, credentials, claim token,
  // provenance envelope or private worker checkpoint through the Director API.
  const names = ["job_id", "tournament_id", "phase", "status", "publication_state", "total_iterations", "completed_iterations",
    "requested_at", "started_at", "completed_at", "lease_expires_at", "attempt_count", "checkpoint_count", "last_error_code"];
  return {...Object.fromEntries(names.filter(name => Object.hasOwn(job, name)).map(name => [name, job[name]])),
    ...(job.status === "SUCCEEDED" && object(job.result_payload) ? {result: job.result_payload} : {})};
}
function publicationView(payload) {
  const source = payload.publication || payload;
  const revision = source.publication_revision ?? source.revision ?? 0;
  const snapshotId = source.snapshot_id ?? source.current_snapshot_id ?? null;
  if (!Number.isSafeInteger(revision) || revision < 0 || (snapshotId !== null && !UUID.test(snapshotId)) ||
      (revision === 0 && snapshotId !== null)) throw fail("DIRECTOR_ODDS_RESPONSE_INVALID");
  return {state: source.publication_state || source.state || (revision === 0 ? "NEVER_PUBLISHED" : "PUBLISHED"), revision, snapshotId};
}
export async function readCertificationDirectorOdds({authorization, jobId, env = process.env} = {}, dependencies = {}) {
  if (jobId && !HASH.test(jobId)) throw fail("DIRECTOR_ODDS_INPUT_INVALID", 400);
  const bound = await scope(authorization, env, dependencies);
  const jobs = await call(RPC.jobs, {job_id: jobId || ""}, bound, dependencies);
  const publication = await call(RPC.publication, {}, bound, dependencies);
  if (!Array.isArray(jobs.jobs)) throw fail("DIRECTOR_ODDS_RESPONSE_INVALID");
  return {ok:true, authority:"supabase", contract:CERTIFICATION_DIRECTOR_ODDS_CONTRACT,
    context:{token:bound.context.context_token, tournamentId:bound.context.tournament_id},
    publication:publicationView(publication), jobs:jobs.jobs.map(job => safeJob(job, bound.context.tournament_id))};
}

function sourceRevision(configuration, provenance, context) {
  const result = {configuration_id: configuration.id, configuration_revision: configuration.configuration_revision};
  if (!UUID.test(result.configuration_id || "") || !Number.isSafeInteger(result.configuration_revision) || result.configuration_revision < 1) throw fail("ODDS_CALCULATION_INPUT_INCOMPLETE");
  for (const key of ["source_fingerprint", "bundle_fingerprint", "settings_fingerprint", "effective_settings_fingerprint", "ratings_fingerprint", "pairing_fingerprint"]) {
    if (!HASH.test(configuration[key] || "")) throw fail("ODDS_CALCULATION_INPUT_INCOMPLETE");
    result[key] = configuration[key];
  }
  if (!object(provenance) || provenance.resource_id !== context.resource_id || provenance.installation_id !== context.installation_id ||
      provenance.authority_epoch_id !== context.authority_epoch_id || provenance.pointer_revision !== context.pointer_revision ||
      provenance.release_commit !== context.release_commit || !UUID.test(provenance.certification_ingress_generation_id || "") ||
      (provenance.runtime_generation_id !== null && !UUID.test(provenance.runtime_generation_id || ""))) throw fail("DIRECTOR_ODDS_SCOPE_MISMATCH", 403);
  return {...result, certification_odds_contract:"certification-odds-v1", resource_class:"CERTIFICATION",
    resource_id:context.resource_id, installation_id:context.installation_id,
    certification_ingress_generation_id:provenance.certification_ingress_generation_id,
    annual_tournament_id:context.tournament_id, annual_runtime_generation_id:provenance.runtime_generation_id,
    annual_pointer_revision:context.pointer_revision, annual_authority_generation_id:context.authority_epoch_id,
    annual_admission_generation_id:provenance.certification_ingress_generation_id,
    job_identity_contract:JOB_CONTRACT, annual_odds_contract:"certification-odds-v1"};
}

export function certificationOddsCalculationRequest({bundle, context, actorId, phase, iterations, outputTimestamp}) {
  const inputs = oddsEngineInputsFromBundle(bundle);
  if (!HASH.test(bundle.certification_live_source_fingerprint || "")) throw fail("ODDS_CALCULATION_INPUT_INCOMPLETE");
  // Service-only canonical read evidence. This is part of the immutable input
  // identity, never a browser-selected authority or an engine math parameter.
  inputs.metadata.certificationLiveSourceFingerprint = bundle.certification_live_source_fingerprint;
  const base = buildOddsCalculationInvocation({inputs, phase, iterations, requestedBy:actorId, outputTimestamp});
  if (base.tournament_id !== context.tournament_id) throw fail("DIRECTOR_ODDS_SCOPE_MISMATCH", 403);
  const revision = sourceRevision(bundle.input_configuration, bundle.certification_context, context);
  const identity = {jobIdentityContract:JOB_CONTRACT, jobContractVersion:ODDS_CALCULATION_JOB_CONTRACT_VERSION,
    tournamentId:base.tournament_id, phase:base.phase, iterations:base.total_iterations,
    inputFingerprint:base.input_fingerprint, settingsFingerprint:revision.settings_fingerprint,
    engineVersion:base.engine_version, publicationContractVersion:base.publication_contract_version,
    checkpointContractVersion:base.checkpoint_contract_version, deterministicSeed:base.deterministic_seed,
    operationMode:"CERTIFICATION", deploymentCommit:context.release_commit,
    candidateHostname:new URL(context.deployment_origin).hostname,
    certificationResourceId:context.resource_id, certificationInstallationId:context.installation_id,
    certificationIngressGenerationId:revision.certification_ingress_generation_id,
    annualRuntimeGenerationId:revision.annual_runtime_generation_id, annualPointerRevision:context.pointer_revision,
    annualAuthorityGenerationId:context.authority_epoch_id, annualAdmissionGenerationId:revision.annual_admission_generation_id};
  const {environment: _legacyEnvironment, ...invocation} = base;
  const jobId = scoringShadowPayloadHash(identity);
  return {...invocation, job_id:jobId, invocation_fingerprint:jobId, source_revision:revision,
    input_configuration_id:revision.configuration_id, configuration_revision:revision.configuration_revision,
    settings_fingerprint:revision.settings_fingerprint, effective_settings_fingerprint:revision.effective_settings_fingerprint,
    input_bundle_fingerprint:revision.bundle_fingerprint, invocation_canonical_json:canonicalJson(identity),
    input_snapshot_canonical_json:canonicalJson(base.input_snapshot), checkpoint_canonical_json:canonicalJson(base.checkpoint_payload)};
}

export async function mutateCertificationDirectorOdds({authorization, input, env = process.env} = {}, dependencies = {}) {
  const baseKeys = ["action", "operationRequestId", "expectedContextToken", "operationTournamentId"];
  const extra = {calculate:["phase", "iterations"], publish:["jobId", "confirmPublication", "expectedPublicationRevision", "expectedSnapshotId"],
    status:["originalAction"]};
  if (!Object.hasOwn(extra, input?.action || "")) throw fail("DIRECTOR_ODDS_INPUT_INVALID", 400);
  keys(input, [...baseKeys, ...extra[input.action]]);
  if (Object.hasOwn(input, "operationTournamentId") && !/^20[0-9]{2}$/.test(clean(input.operationTournamentId))) throw fail("DIRECTOR_ODDS_INPUT_INVALID", 400);
  if (!UUID.test(input.operationRequestId || "") || (input.action !== "status" && !HASH.test(input.expectedContextToken || ""))) throw fail("DIRECTOR_ODDS_INPUT_INVALID", 400);
  const recovery = input.action === "status";
  const bound = await scope(authorization, env, dependencies, {recovery});
  const options = {...bound, operationRequestId:input.operationRequestId, expectedContextToken:input.expectedContextToken};
  if (recovery) {
    const name = {calculate:RPC.request, publish:RPC.publish}[input.originalAction];
    if (!name) throw fail("DIRECTOR_ODDS_INPUT_INVALID", 400);
    // This is an untrusted original receipt selector. SQL independently checks
    // this actor's historical entitlement and exact resource/target/operation.
    const target = input.operationTournamentId || bound.authorization.tournament_id;
    const status = await call(name, {target_tournament_id:target}, {...options, recovery:true,
      authorization:{...bound.authorization,tournament_id:target}}, dependencies);
    if (!["COMMITTED", "UNKNOWN"].includes(status.state)) throw fail("DIRECTOR_ODDS_RESPONSE_INVALID");
    const receipt = status.result || status.receipt;
    if (status.state === "COMMITTED" && !object(receipt)) throw fail("DIRECTOR_ODDS_RESPONSE_INVALID");
    return {ok:true, contract:CERTIFICATION_DIRECTOR_ODDS_CONTRACT, operationRequestId:input.operationRequestId, state:status.state,
      ...(status.state === "COMMITTED" ? {receipt:{ok:receipt.ok === true,
        ...(HASH.test(receipt.job_id || receipt.job?.job_id || "") ? {jobId:receipt.job_id || receipt.job.job_id} : {}),
        ...(UUID.test(receipt.snapshot_id || "") ? {snapshotId:receipt.snapshot_id, publication:publicationView(receipt)} : {})}} : {}),
      recovery:"RETRY_SAME_OPERATION"};
  }
  if (input.operationTournamentId && input.operationTournamentId !== bound.context.tournament_id) throw fail("DIRECTOR_ODDS_SCOPE_MISMATCH", 403);
  if (input.action === "calculate") {
    if (!ODDS_PHASES.includes(input.phase) || !ODDS_SUPPORTED_ITERATION_COUNTS.includes(input.iterations)) throw fail("DIRECTOR_ODDS_INPUT_INVALID", 400);
    const loaded = await call(RPC.inputs, {}, options, dependencies);
    const command = certificationOddsCalculationRequest({bundle:loaded.data, context:bound.context,
      actorId:bound.authorization.player_id, phase:input.phase, iterations:input.iterations});
    const requested = await call(RPC.request, command, options, dependencies);
    if (requested.job) safeJob(requested.job, bound.context.tournament_id);
    return {ok:true, accepted:true, authority:"supabase", contract:CERTIFICATION_DIRECTOR_ODDS_CONTRACT,
      operationRequestId:input.operationRequestId, jobId:command.job_id, publicationCreated:false};
  }
  if (!HASH.test(input.jobId || "") || input.confirmPublication !== true || !Number.isSafeInteger(input.expectedPublicationRevision) ||
      input.expectedPublicationRevision < 0 || (input.expectedSnapshotId !== null && !UUID.test(input.expectedSnapshotId || "")) ||
      (input.expectedPublicationRevision === 0 && input.expectedSnapshotId !== null)) throw fail("DIRECTOR_ODDS_INPUT_INVALID", 400);
  const retained = await call(RPC.jobs, {job_id:input.jobId}, options, dependencies);
  const job = retained.jobs?.find(value => value.job_id === input.jobId);
  if (!job || job.tournament_id !== bound.context.tournament_id || job.status !== "SUCCEEDED" || !HASH.test(job.result_fingerprint || "") ||
      !HASH.test(job.source_revision?.source_fingerprint || "")) throw fail("ODDS_CALCULATION_NOT_READY", 409);
  const publication = await call(RPC.publish, {job_id:input.jobId, expected_publication_revision:input.expectedPublicationRevision,
    expected_snapshot_id:input.expectedSnapshotId, milestone:job.phase,
    expected_source_fingerprint:job.source_revision.source_fingerprint, expected_result_fingerprint:job.result_fingerprint}, options, dependencies);
  if (!UUID.test(publication.snapshot_id || "") || !object(publication.published_payload)) throw fail("DIRECTOR_ODDS_READBACK_UNCONFIRMED", 503,
    {operationRequestId:input.operationRequestId, outcome:"UNKNOWN", recovery:"CHECK_STATUS_RETRY_SAME_OPERATION"});
  return {ok:true, authority:"supabase", contract:CERTIFICATION_DIRECTOR_ODDS_CONTRACT, operationRequestId:input.operationRequestId,
    publicationCreated:true, snapshotId:publication.snapshot_id, snapshot:publication.published_payload,
    publication:publicationView(publication), duplicate:publication.idempotent === true || publication.duplicate === true};
}

/** Uses the existing deterministic engine; only the persistence/admission
 * adapter differs. A worker has no publish dependency or actor authority. */
export async function processCertificationOddsCalculationJob(jobId, {env = process.env, dependencies = {}, ...workerOptions} = {}) {
  if (!HASH.test(jobId || "")) throw fail("DIRECTOR_ODDS_INPUT_INVALID", 400);
  const context = await resolveCertificationRuntimeContext({env, phase:"WORKERS"}, dependencies);
  const worker = (name, payload) => {
    const {environment, ...domain} = payload;
    if (environment !== undefined && environment !== "PREVIEW") throw fail("CERTIFICATION_INPUT_INVALID", 400);
    return certificationOddsRpc(name, domain, {env, context, operationRequestId:randomUUID()}, dependencies);
  };
  return processOddsCalculationJob(jobId, {...workerOptions, dependencies:{
    claimJob: async (id, {workerId}) => {
      const result = await worker(RPC.claim, {job_id:id, worker_id:workerId});
      if (result.payload?.job) safeJob(result.payload.job, context.tournament_id);
      return result;
    },
    writeCheckpoint: input => worker(RPC.checkpoint, {...input, checkpoint_canonical_json:canonicalJson(input.checkpoint_payload)}),
    completeJob: input => worker(RPC.complete, {...input, result_fingerprint_payload:logicalOddsResult(input.result_payload),
      result_canonical_json:canonicalJson(logicalOddsResult(input.result_payload))}),
    failJob: input => worker(RPC.fail, input),
  }});
}
