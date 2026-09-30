// Test-only output/network containment; never imported by application runtime.
require('./phase2-network-deny.cjs');
const fs=require('node:fs'),path=require('node:path'),{fileURLToPath}=require('node:url');
const {syncBuiltinESMExports}=require('node:module');
const root=path.resolve(__dirname,'../..');
const output=path.join(root,'docs/reliability/phase2c1-closure/evidence/p0f-approved');
function destination(value){
 const str=value instanceof URL?fileURLToPath(value):value;
 if(typeof str!=='string')return value;
 const absolute=path.resolve(str);
 if(absolute===output||absolute.startsWith(output+path.sep))return value;
 for(const phase of ['phase2c1-closure','phase2c1','phase2c','phase2']){
  const prefix=path.join(root,'docs/reliability',phase)+path.sep;
  if(absolute.startsWith(prefix))return path.join(output,'revalidation',phase,absolute.slice(prefix.length));
 }
 return value;
}
for(const name of ['writeFileSync','appendFileSync','mkdirSync','createWriteStream']){
 const original=fs[name];fs[name]=function(file,...args){const mapped=destination(file);if(name!=='mkdirSync'&&(typeof mapped==='string'||mapped instanceof URL))fs.mkdirSync(path.dirname(mapped instanceof URL?fileURLToPath(mapped):mapped),{recursive:true});return Reflect.apply(original,this,[mapped,...args]);};
}
for(const object of [fs,fs.promises])for(const name of ['writeFile','appendFile','mkdir']){
 const original=object[name];object[name]=function(file,...args){const mapped=destination(file);if(name!=='mkdir'&&(typeof mapped==='string'||mapped instanceof URL))fs.mkdirSync(path.dirname(mapped instanceof URL?fileURLToPath(mapped):mapped),{recursive:true});return Reflect.apply(original,this,[mapped,...args]);};
}
syncBuiltinESMExports();
