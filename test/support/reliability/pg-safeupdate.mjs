import assert from 'node:assert/strict';
import {mkdtemp,copyFile,readFile,access} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import {postgresBin,repositoryRoot,sql} from './postgres17.mjs';
let built;
export function buildSafeupdate(){
 return built||=build();
}
async function build(){
 const source=path.join(repositoryRoot,'test/support/reliability/pg-safeupdate');
 assert.equal(createHash('sha256').update(await readFile(path.join(source,'safeupdate.c'))).digest('hex'),
  '1351fc18b9a1e2dcc72185d349c178244458b5d9eb30007609c3d599b38aeb38');
 const directory=await mkdtemp(path.join(os.tmpdir(),'bagger-safeupdate-pg17-'));
 for(const file of ['safeupdate.c','Makefile','LICENSE'])await copyFile(path.join(source,file),path.join(directory,file));
 const env={PATH:process.env.PATH||'',LC_ALL:'C'};
 const result=spawnSync('make',[`PG_CONFIG=${path.join(postgresBin,'pg_config')}`],{cwd:directory,env,encoding:'utf8'});
 assert.equal(result.status,0,result.stderr||'PG17 safeupdate build failed');
 const library=path.join(directory,'safeupdate');
 await access(library+(process.platform==='darwin'?'.dylib':'.so'));
 return library;
}
export async function enableOwnedSafeupdate(f){
 assert.match(f.database,/^[a-z][a-z0-9_]*$/);
 const library=await buildSafeupdate();
 assert.ok(library.startsWith(os.tmpdir()+path.sep));
 sql(f.cluster,f.database,`alter database ${f.database} set session_preload_libraries='${library}';`,{role:''});
 assert.equal(f.q("select current_setting('safeupdate.enabled')"),'on');
 assert.equal(f.q('show session_preload_libraries').replaceAll('"',''),library);
 return library;
}
