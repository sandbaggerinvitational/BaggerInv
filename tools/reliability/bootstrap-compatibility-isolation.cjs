// Local proof only: deny outbound sockets and preserve historical evidence.
require('./phase2-network-deny.cjs');
const fs=require('node:fs'),path=require('node:path'),{fileURLToPath}=require('node:url');
const {syncBuiltinESMExports}=require('node:module');
const root=path.resolve(__dirname,'../..');
const destinationRoot=path.join(root,'docs/reliability/phase2d-bootstrap-compatibility/evidence');
let privateProof=0;
function destination(file){
 const value=file instanceof URL?fileURLToPath(file):file;
 if(typeof value!=='string')return file;
 const resolved=path.resolve(value),prefix=path.join(root,'docs/reliability')+path.sep;
 if(!resolved.startsWith(prefix)||resolved.startsWith(path.dirname(destinationRoot)+path.sep))return file;
 if(resolved.endsWith('/bootstrap-private-core-security.json'))
  return path.join(destinationRoot,`private-core-security-${++privateProof}.json`);
 return path.join(destinationRoot,'side-effects',resolved.slice(prefix.length));
}
for(const object of [fs,fs.promises])for(const name of ['writeFile','appendFile','mkdir','writeFileSync','appendFileSync','mkdirSync','createWriteStream']){
 if(typeof object[name]!=='function')continue;
 const original=object[name];object[name]=function(file,...args){
  const mapped=destination(file);
  if(name!=='mkdir'&&name!=='mkdirSync'&&typeof mapped==='string')fs.mkdirSync(path.dirname(mapped),{recursive:true});
  return Reflect.apply(original,this,[mapped,...args]);
 };
}
syncBuiltinESMExports();
