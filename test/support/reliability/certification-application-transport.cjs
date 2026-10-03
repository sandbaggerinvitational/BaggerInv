// Test-only process boundary for a real local Next build/start. No application
// module, authorization result, domain result or SQL envelope is replaced.
// Only the registered synthetic HTTPS transport and Auth JWKS are modeled.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{execFile}=require('node:child_process');
require('../../../tools/reliability/phase2-network-deny.cjs');
const config=JSON.parse(fs.readFileSync(process.env.BAGGER_R2_LOCAL_TRANSPORT_FILE,'utf8'));
if(path.resolve(path.dirname(path.dirname(config.socket)))!==path.resolve(os.tmpdir())||
 !/^bagger-reliability-pg17-/.test(path.basename(path.dirname(config.socket)))||path.basename(config.socket)!=='socket'||!/^r2_certification_\d+$/.test(config.database)||
 !/^https:\/\/[a-z]{20}\.supabase\.co$/.test(config.projectUrl))throw Error('LOCAL_APPLICATION_TRANSPORT_SCOPE_INVALID');
const allowed=new Set(['read_certification_runtime_context_v1','read_certification_projection_v1','read_certification_operation_v1',
 'admit_certification_operation_v1','execute_certification_operation_v1','mark_certification_ingress_unknown_v1',
 'read_certification_ingress_status_v1','read_certification_director_recovery_material_v1','dispatch_certification_odds_v1',
 'read_certification_odds_operation_v1','mutate_certification_future_authoring_v1']);
const record=value=>fs.appendFileSync(config.observationFile,JSON.stringify(value)+'\n');
const original=globalThis.fetch;
globalThis.fetch=async(value,init={})=>{
 const url=new URL(typeof value==='string'||value instanceof URL?value:value.url);
 if(['127.0.0.1','localhost','[::1]'].includes(url.hostname))return original(value,init);
 if(url.origin!==config.projectUrl){record({kind:'DENIED_NETWORK',host:url.hostname,path:url.pathname});throw Error('LOCAL_APPLICATION_REMOTE_NETWORK_DENIED');}
 if(url.pathname==='/auth/v1/.well-known/jwks.json'){
  record({kind:'SYNTHETIC_AUTH_JWKS'});return Response.json({keys:[config.publicJwk]});
 }
 const name=url.pathname.split('/').at(-1);
 if(url.pathname!=='/rest/v1/rpc/'+name||!allowed.has(name)||init.method!=='POST'||init.redirect!=='error'){
  record({kind:'DENIED_PROVIDER_PATH',path:url.pathname});throw Error('LOCAL_APPLICATION_PROVIDER_OPERATION_DENIED');
 }
 const headers=new Headers(init.headers);
 if(headers.get('apikey')!==config.serverKey)throw Error('LOCAL_APPLICATION_CREDENTIAL_MISMATCH');
 const body=JSON.parse(init.body);
 if(!body.input||Object.keys(body).length!==1)throw Error('LOCAL_APPLICATION_RPC_ENVELOPE_INVALID');
 const input=JSON.stringify(body.input).replaceAll("'","''");
 // Model both PostgREST database role and its verified service JWT claim.
 // Application actor authorization still executes inside the real RPC.
 const statement=`\\set VERBOSITY verbose\nset request.jwt.claim.role='service_role';set role service_role;select public.${name}('${input}'::jsonb);`;
 // Real provider HTTP yields to socket events. Preserve that scheduling here,
 // rather than blocking Next's event loop through every worker checkpoint.
 const result=await new Promise(resolve=>{
  const child=execFile(config.psql,['-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-h',config.socket,'-p',String(config.port),'-U','postgres','-d',config.database],
   {encoding:'utf8',maxBuffer:32*1024*1024,timeout:20000},(error,stdout,stderr)=>resolve({status:error?error.code:0,stdout,stderr}));
  child.stdin.end(statement);
 });
 record({kind:'CANONICAL_RPC',name,operation:body.input.operation_id||body.input.operation||null,sqlSucceeded:result.status===0});
 if(result.status!==0){
  const error=/ERROR:\s+([0-9A-Z]{5}):\s*([^\n]+)/.exec(result.stderr||'');
  return Response.json({code:error?.[1]||'P0001',message:error?.[2]||'LOCAL_SQL_TRANSPORT_FAILED'},{status:400});
 }
 return Response.json(JSON.parse(result.stdout.trim()));
};
