// Offline validation of a preserved catalog/receipt. Cannot connect or install.
import assert from 'node:assert/strict';
import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {readCanonicalArtifacts,validateCanonicalArtifacts} from './canonical-bootstrap-artifacts.mjs';
import {portableCatalogValidationContract,assertPortableCatalogConvergence,assertPortableInstallationReceipt} from './portable-canonical-catalog.mjs';

try{
 const args=process.argv.slice(2);
 assert.equal(args.length,4,'Usage: node tools/reliability/validate-canonical-catalog.mjs --actual /absolute/catalog.json --receipt /absolute/receipts.json');
 assert.equal(args[0],'--actual');assert.equal(args[2],'--receipt');
 assert.ok(path.isAbsolute(args[1])&&path.isAbsolute(args[3]),'Only absolute local input paths');
 const raw=await Promise.all([readFile(args[1],'utf8'),readFile(args[3],'utf8')]);
 let actual,receipts;
 try{[actual,receipts]=raw.map(JSON.parse);}catch{throw new Error('Catalog/receipt input must be valid JSON');}
 const bundle=await readCanonicalArtifacts();
 const hashes=await validateCanonicalArtifacts(bundle);
 assertPortableInstallationReceipt(receipts,hashes,bundle.manifest.contract);
 assertPortableCatalogConvergence(actual,bundle.catalog);
 console.log(JSON.stringify({status:'PASS',validationContract:portableCatalogValidationContract,
  input:'OFFLINE_CATALOG_RECEIPT_READBACK',remoteAccess:false,installationPerformed:false,
  registrationPerformed:false,initializationPerformed:false,
  bootstrapContract:bundle.manifest.contract,receiptHashes:hashes,
  inputHashes:raw.map(value=>createHash('sha256').update(value).digest('hex')),
  dependencies:{actual:actual.dependencies.length,expected:bundle.catalog.dependencies.length,
   comparison:'COMPLETE_JSON_RECORD_MULTISET; DETERMINISTIC_STRING_ORDER'},
  otherCatalogSections:'UNCHANGED_CERTIFIED_COMPARATOR'},null,2));
}catch(error){
 console.error(JSON.stringify({status:'FAIL',error:error.message}));process.exitCode=1;
}
