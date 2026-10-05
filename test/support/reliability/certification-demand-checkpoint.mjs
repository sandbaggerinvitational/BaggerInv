// Durable synthetic operation journal inside the verified owned local cluster.
import {open,rename} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
export function demandCheckpointSink(cluster){
 if(!path.basename(cluster.directory).startsWith('bagger-reliability-pg17-'))throw new Error('OWNED_CLUSTER_REQUIRED');
 return async checkpoint=>{
  if(!/^[0-9a-f-]{36}$/.test(checkpoint.operation_request_id))throw new Error('CHECKPOINT_ID_REQUIRED');
  const name=path.join(cluster.directory,'demand-'+checkpoint.operation_request_id+'.json'),tmp=name+'.'+randomUUID()+'.tmp';
  const file=await open(tmp,'w',0o600);
  try{await file.writeFile(JSON.stringify(checkpoint)+'\n');await file.sync();}finally{await file.close();}
  await rename(tmp,name);
  const dir=await open(cluster.directory,'r');try{await dir.sync();}finally{await dir.close();}
 };
}
