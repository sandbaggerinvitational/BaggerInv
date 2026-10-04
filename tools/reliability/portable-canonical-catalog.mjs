// Post-install validation only. No database, installer or resource mutation API.
// Keep the receipt-hashed compiler and bootstrap artifacts byte-identical.
import assert from 'node:assert/strict';
import {assertCatalogConvergence,serialize} from './canonical-bootstrap-artifacts.mjs';

export const portableCatalogValidationContract='bagger-catalog-validation-portability-v1';

export function canonicalDependencyRecords(records){
 assert.ok(Array.isArray(records),'Dependency inventory must be an array');
 const keyed=records.map(record=>{
  assert.ok(record&&typeof record==='object'&&!Array.isArray(record),'Dependency record must be an object');
  // Complete JSON record identity, including every field. No projection or
  // deduplication: a repeated edge changes multiplicity and must still compare.
  return {record,key:serialize(record)};
 });
 // Explicit ECMAScript string comparison, never localeCompare/default DB
 // collation. Equal keys remain repeated; caller arrays/records are not mutated.
 keyed.sort((a,b)=>a.key<b.key?-1:a.key>b.key?1:0);
 return keyed.map(({record})=>record);
}

export function assertPortableCatalogConvergence(actual,expected){
 const comparison={...actual,dependencies:canonicalDependencyRecords(actual.dependencies)};
 const reference={...expected,dependencies:canonicalDependencyRecords(expected.dependencies)};
 // All other sections and the existing narrowly certified pgcrypto owner
 // allowance use the unchanged comparator; no security/catalog field is waived.
 assertCatalogConvergence(comparison,reference);
}

export function assertPortableInstallationReceipt(receipts,hashes,contract){
 assert.ok(Array.isArray(receipts)&&receipts.length===1,'Exactly one installation receipt required');
 const receipt=receipts[0];
 assert.equal(receipt.contract_version,contract,'Installed bootstrap contract differs');
 assert.equal(receipt.manifest_sha256,hashes.manifestSha256,'Installed manifest differs');
 assert.equal(receipt.schema_sha256,hashes.schemaSha256,'Installed schema artifact differs');
 assert.equal(receipt.static_data_sha256,hashes.staticDataSha256,'Installed static artifact differs');
}
