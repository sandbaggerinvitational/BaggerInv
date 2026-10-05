// Private scheduler orchestration. Existing worker, calculators and SQL claim
// predicates remain the only job engine. Never imported by a client component.
import {createHash, createHmac, timingSafeEqual} from 'node:crypto';
import {requireCertificationResourceEnvironment, certificationRegistrationEnvelope} from './canonical-resource-registration.js';
import {createCurrentScoreDerivedDeliveryAdapter} from './score-derived-delivery.js';
import {runScoreDerivedWorker, classifyDerivedFailure} from './score-derived-worker.js';

export const SUPERVISOR_CONTRACT = 'certification-worker-supervision-v1';
export const SUPERVISOR_PATH = '/api/internal/derived-worker/run';
export const SUPERVISOR_RESOURCE = 'CERTIFICATION:2857f707-065a-405d-b5fc-b5b6fa1b0f51';
export const SUPERVISOR_PROJECT = 'trmcwrljjxwhgtikfdgu';
export const SOFT_RUN_MS = 45_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const HASH = /^[0-9a-f]{64}$/;
const failure = (code, status = 403) => Object.assign(new Error(code), {code, status});
const sha = value => createHash('sha256').update(value).digest('hex');
export function supervisorSigningText(body, origin) {
  return ['POST', SUPERVISOR_PATH, origin, sha(body)].join('\n');
}
export function signSupervisorInvocation(body, origin, secret) {
  if (!/^[0-9a-f]{64,128}$/.test(secret || '')) throw failure('SUPERVISOR_SIGNING_KEY_UNAVAILABLE', 503);
  return createHmac('sha256', secret).update(supervisorSigningText(body, origin)).digest('hex');
}
function equalHash(a, b) { return HASH.test(a || '') && HASH.test(b || '') && timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex')); }
export function supervisorEnvelope(env = process.env, dependencies = {}) {
  // This guard precedes the adapter factory, which also serves Production.
  const value = certificationRegistrationEnvelope(requireCertificationResourceEnvironment(env, dependencies));
  if (value.resource.resource_id !== SUPERVISOR_RESOURCE || value.resource.project_ref !== SUPERVISOR_PROJECT)
    throw failure('SUPERVISOR_RESOURCE_DENIED');
  return value;
}
export function verifySupervisorRequest(request, body, {env = process.env, dependencies = {}, now = Date.now()} = {}) {
  const bound = supervisorEnvelope(env, dependencies);
  const url = new URL(request.url);
  if (request.method !== 'POST' || url.origin !== bound.deployment.deployment_origin || url.pathname !== SUPERVISOR_PATH || url.search || body.length > 2048
      || request.headers.get('content-type')?.split(';')[0] !== 'application/json') throw failure('SUPERVISOR_REQUEST_DENIED');
  let ticket;
  try { ticket = JSON.parse(body); } catch { throw failure('SUPERVISOR_REQUEST_DENIED'); }
  const fields = ['contract','invocation_id','nonce','epoch','revision','binding_digest','issued_at','expires_at'];
  if (!ticket || Object.keys(ticket).length !== fields.length || fields.some(k=>!Object.hasOwn(ticket,k))
      || ticket.contract !== SUPERVISOR_CONTRACT || ![ticket.invocation_id,ticket.nonce,ticket.epoch].every(v=>UUID.test(v))
      || !HASH.test(ticket.binding_digest) || !Number.isSafeInteger(ticket.revision) || ticket.revision < 1
      || !Number.isSafeInteger(ticket.issued_at) || !Number.isSafeInteger(ticket.expires_at)
      || ticket.issued_at > now + 5000 || ticket.issued_at < now - 30_000 || ticket.expires_at <= now
      || ticket.expires_at - ticket.issued_at !== 30_000) throw failure('SUPERVISOR_TICKET_EXPIRED_OR_INVALID');
  const signature = request.headers.get('x-bagger-worker-signature');
  if (!equalHash(signature, signSupervisorInvocation(body, bound.deployment.deployment_origin, env.CERTIFICATION_WORKER_SIGNING_KEY)))
    throw failure('SUPERVISOR_SIGNATURE_DENIED');
  // Request Host/forwarded headers never supply the bound origin/resource.
  return {bound, ticket, signature};
}
export function createSupervisorTransport({env = process.env, dependencies = {}} = {}) {
  const bound = supervisorEnvelope(env, dependencies);
  return async (operation, payload) => {
    const key = env.SUPABASE_SCORING_MIRROR_SECRET_KEY;
    const headers = {apikey:key, 'content-type':'application/json'};
    if (!key.startsWith('sb_secret_')) headers.authorization = `Bearer ${key}`;
    let response, value;
    try {
      response = await (dependencies.fetchImpl || fetch)(`${bound.resource.project_url}/rest/v1/rpc/execute_certification_supervisor_v1`,
        {method:'POST',redirect:'error',cache:'no-store',headers,signal:AbortSignal.timeout(5000),
         body:JSON.stringify({input:{contract:SUPERVISOR_CONTRACT,...bound,operation,...payload}})});
      value = await response.json();
    } catch { throw failure('SUPERVISOR_CONTROL_UNAVAILABLE',503); }
    if (!response.ok || value?.ok !== true) {
      const code = /\b(SUPERVISOR_[A-Z_]+)\b/.exec(value?.message || value?.code || '')?.[1] || 'SUPERVISOR_CONTROL_UNAVAILABLE';
      throw failure(code, response.status >= 500 ? 503 : 403);
    }
    return value;
  };
}

/** Await control accounting explicitly; worker telemetry is not an ACK. One
 * invocation never restarts the polling loop or resets durable job attempts. */
export async function executeBoundedSupervisor({body, signature, env = process.env, dependencies = {},
  control = createSupervisorTransport({env,dependencies}), adapterFactory = createCurrentScoreDerivedDeliveryAdapter,
  now = Date.now} = {}) {
  supervisorEnvelope(env, dependencies);
  const admission = await control('BEGIN',{body,signature});
  if (admission.admitted === false) return {ok:true,invocation_id:admission.invocation_id,outcome:admission.outcome,
    uncertain:admission.uncertain === true,admitted:false,cycles:0};
  const auth = {invocation_id:admission.invocation_id,run_token:admission.run_token};
  let sequence=0, tickSucceeded=false, tickFailure=null, jobFailure=null, stopped=false;
  let tickRecorded=false;
  const deadline = now() + SOFT_RUN_MS, controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(),SOFT_RUN_MS); timer.unref?.();
  const step = async kind => {
    if (now() >= deadline) {controller.abort(); stopped=true; throw failure('SUPERVISOR_SOFT_CUTOFF',409);}
    try { await control('STEP',{...auth,sequence:++sequence,kind}); }
    catch(error) {controller.abort();stopped=true;throw error;}
  };
  try {
    const faultTransport = createSupervisorFaultTransport({control,auth,fetchImpl:dependencies.fetchImpl || fetch});
    const adapter = await adapterFactory({env,certificationDependencies:{...dependencies,fetchImpl:faultTransport}});
    const processors = Object.fromEntries(Object.entries(adapter.processors).map(([family,processor])=>[family,async args=>{
      if (family === 'CALCUTTA') throw failure('SUPERVISOR_ENGINE_SCOPE_DENIED');
      await step(family);
      try { return await processor(args); } catch (error) {
        jobFailure = classifyDerivedFailure(error);
        if (error.deliveryFailureUnrecorded) jobFailure = {...jobFailure,classification:'UNCERTAIN'};
        throw error;
      }
    }]));
    const result = await runScoreDerivedWorker({maximumCycles:1,intervalMs:10,signal:controller.signal,
      workerId:`supervised-${admission.invocation_id}`,processors,tick:async args=>{
        await step('TICK');
        try {
          const value = await adapter.tick(args);
          if (value?.ok !== true || !value.ready || value.ready.CALCUTTA || value.waitingPublication?.FINAL_RECAP_READY)
            throw failure('SUPERVISOR_ENGINE_SCOPE_DENIED');
          tickSucceeded = true;
          await control('TICK_RESULT',{...auth,success:true});
          tickRecorded=true;
          return value;
        } catch(error) {
          tickFailure = classifyDerivedFailure(error);
          // A failed durable ACK is never classified as a successful invocation.
          await control('TICK_RESULT',{...auth,success:false,classification:tickFailure.classification,code:tickFailure.code});
          tickRecorded=true;
          throw error;
        }
      }});
    const outcome = stopped ? 'STOPPED' : tickFailure ? 'FAILED' : jobFailure?.classification === 'UNCERTAIN' ? 'UNKNOWN'
      : jobFailure?.classification === 'TERMINAL' ? 'TERMINAL' : jobFailure ? 'JOB_RETRY'
      : stopped || controller.signal.aborted || !tickSucceeded || result.ok !== true ? 'UNKNOWN' : 'SUCCEEDED';
    const final = await control('FINISH',{...auth,outcome});
    return {ok:true,invocation_id:admission.invocation_id,outcome:final.outcome,cycles:result.cycles};
  } catch(error) {
    // A deterministic adapter/setup failure is a global failure too. If any
    // accounting acknowledgement is unavailable, leave RUNNING for UNKNOWN
    // reconciliation rather than claiming a successful/rolled-back outcome.
    if (!tickRecorded && !tickFailure) {
      const classified=classifyDerivedFailure(error);
      try {
        await control('TICK_RESULT',{...auth,success:false,...classified});
        await control('FINISH',{...auth,outcome:'FAILED'});
      } catch { /* Durable reconciliation owns uncertainty. */ }
    }
    throw error;
  } finally { clearTimeout(timer); }
}

// Fault plan selection/consumption is performed by the owner-installed private
// ledger. No request flags, arbitrary SQL, error strings or targets are accepted.
export function createSupervisorFaultTransport({control,auth,fetchImpl}) {
  return async (url,init) => {
    const name = new URL(url).pathname.split('/').at(-1);
    const input = JSON.parse(init.body).input;
    const operation = input.operation_id;
    const watched = name === 'execute_certification_operation_v1' && ['WORKERS.COMPETITION_CLAIM','WORKERS.INTELLIGENCE_CLAIM','WORKERS.COMPETITION_WRITE','WORKERS.INTELLIGENCE_WRITE'].includes(operation);
    if (!watched) return fetchImpl(url,init);
    // Before completion, the canonical claim still names its exact source cycle.
    // Only the real successful completion response is dropped for LOST_ACK.
    let plan = operation.endsWith('WRITE') ? await control('FAULT',{...auth,fault_operation:operation,payload:input.payload}) : {};
    if (plan.fault === 'TRANSIENT') throw Object.assign(new Error('SUPERVISOR_TEST_TRANSIENT'),{code:'ECONNRESET'});
    if (plan.fault === 'TERMINAL') return Response.json({code:'22023',message:'SUPERVISOR_TEST_TERMINAL'},{status:400});
    const response = await fetchImpl(url,init);
    if (!response.ok) return response;
    const value = await response.clone().json();
    if (operation.endsWith('CLAIM')) plan = await control('FAULT',{...auth,fault_operation:operation,payload:input.payload,request_id:input.operation_request_id});
    if (plan.fault === 'LOST_ACK' && value.ok === true) throw Object.assign(new Error('SUPERVISOR_TEST_TRANSPORT_LOST'),{code:'ECONNRESET'});
    // This is a real disappearance seam: never return to the processor (which
    // would otherwise acknowledge failure). Provider termination is the bound.
    if (plan.fault === 'DISAPPEAR' || plan.fault === 'SUPERSEDE') {
      for (;;) { await new Promise(resolve=>setTimeout(resolve,1000));
        if (plan.fault === 'SUPERSEDE') {
          const check = await control('BARRIER',{...auth,plan_id:plan.plan_id});
          if (check.released) break;
        }
      }
    }
    return response;
  };
}

export async function handleSupervisorRequest(request, options = {}) {
  try {
    if (!HASH.test(request.headers.get('x-bagger-worker-signature') || '') || Number(request.headers.get('content-length')) > 2048) throw failure('SUPERVISOR_REQUEST_DENIED');
    const reader=request.body?.getReader(); let bytes=0, chunks=[];
    if(!reader)throw failure('SUPERVISOR_REQUEST_DENIED');
    for (;;) {const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;
      if(bytes>2048){await reader.cancel();throw failure('SUPERVISOR_REQUEST_DENIED');}chunks.push(Buffer.from(part.value));}
    const body=Buffer.concat(chunks).toString('utf8');
    const {signature}=verifySupervisorRequest(request,body,options);
    const result=await executeBoundedSupervisor({...options,body,signature});
    return Response.json(result,{headers:{'cache-control':'no-store'}});
  } catch(error) {
    const code=/^SUPERVISOR_[A-Z_]+$/.test(error?.code || '')?error.code:'SUPERVISOR_UNAVAILABLE';
    return Response.json({ok:false,code},{status:error?.status || 503,headers:{'cache-control':'no-store'}});
  }
}
