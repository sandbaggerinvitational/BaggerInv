// LOCAL DESIGN MODEL ONLY. No route, SDK client, network, SQL, or deployment.
// Provider-private delivery and owner authority are injected object capabilities;
// this does not implement or certify either hosted authentication boundary.
import {createHash, randomBytes} from 'node:crypto';
import {runScoreDerivedWorker} from '../../../lib/score-derived-worker.js';

export const FIXED = Object.freeze({resource:'CERTIFICATION:2857f707-065a-405d-b5fc-b5b6fa1b0f51',
  project:'trmcwrljjxwhgtikfdgu', deployment:'dpl_LOCAL_SYNTHETIC', release:'LOCAL_SYNTHETIC_RELEASE',
  environment:'preview', generation:'LOCAL_SYNTHETIC_GENERATION'});
const digest = value => createHash('sha256').update(value).digest('hex');
const deny = code => {throw Object.assign(new Error(code),{code});};

export function createLocalCustodyModel({binding=FIXED, clock=()=>Date.now(), durable={}}={}) {
  // Symbols deliberately cannot be supplied in JSON or fabricated HTTP headers.
  const owner=Symbol('local modeled owner'), platform=Symbol('local modeled private queue');
  durable.state ??= 'OFF'; durable.epoch ??= 0; durable.ledger ??= new Map();
  const check = candidate => {
    if(Object.keys(candidate).length!==Object.keys(FIXED).length ||
      Object.keys(FIXED).some(k=>candidate[k]!==binding[k]) ||
      binding.resource!==FIXED.resource || binding.project!==FIXED.project || binding.environment!=='preview') deny('BINDING_DENIED');
  };
  const requireOwner = actor => {if(actor!==owner) deny('OWNER_DENIED');};
  const start = (actor,{expiresAt,budget=2}={}) => {
    requireOwner(actor); check(binding);
    if(!Number.isSafeInteger(expiresAt)||expiresAt<=clock()||expiresAt>clock()+7_200_000||
      !Number.isSafeInteger(budget)||budget<1||budget>120) deny('WINDOW_DENIED');
    durable.state='ENABLED'; durable.epoch++; durable.expiresAt=expiresAt; durable.budget=budget;
  };
  const stop = actor => {requireOwner(actor); durable.state='OFF';};
  const reserve = actor => {
    if(actor!==platform) deny('PRIVATE_QUEUE_REQUIRED'); check(binding);
    if(durable.state!=='ENABLED'||clock()>=durable.expiresAt||durable.budget<1) deny('SUPERVISOR_DORMANT');
    // Raw single-use proof exists only in the modeled private Vercel message.
    // The database ledger stores a digest, not a Vault/HMAC/signing credential.
    const proof=randomBytes(32).toString('hex'), id=randomBytes(16).toString('hex');
    durable.ledger.set(id,{proofHash:digest(proof),state:'RESERVED',epoch:durable.epoch,expiresAt:clock()+30_000});
    durable.budget--;
    return {id,proof,epoch:durable.epoch,binding:{...binding}};
  };
  const deliver = async (actor,message,adapter) => {
    if(actor!==platform) deny('PRIVATE_QUEUE_REQUIRED'); check(message.binding);
    const row=durable.ledger.get(message.id);
    if(durable.state!=='ENABLED'||clock()>=durable.expiresAt) deny('SUPERVISOR_DORMANT');
    if(!row||row.proofHash!==digest(message.proof)||row.epoch!==durable.epoch||
      message.epoch!==durable.epoch||row.expiresAt<=clock()) deny('RESERVATION_DENIED');
    if(row.state!=='RESERVED') deny('REPLAY_DENIED');
    // Synchronous modeled CAS, before awaiting the existing worker engine.
    row.state='RUNNING';
    const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),45_000);
    timer.unref?.();
    try {
      const result=await runScoreDerivedWorker({...adapter,signal:controller.signal,maximumCycles:1,intervalMs:10,
        workerId:`local-custody-${message.id}`});
      row.state=result.ok&&!controller.signal.aborted?'SUCCEEDED':'UNKNOWN';
      return {outcome:row.state,cycles:result.cycles};
    } catch(error) {row.state='UNKNOWN';throw error;} finally {clearTimeout(timer);}
  };
  const status = actor => {requireOwner(actor);return {state:durable.state,epoch:durable.epoch,budget:durable.budget,
    invocations:[...durable.ledger.values()].map(({state})=>({state}))};};
  return {owner,platform,start,stop,reserve,deliver,status,durable};
}
