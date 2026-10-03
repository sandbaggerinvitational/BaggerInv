# Local privilege portability certification

STATUS: **PASS**

Scope: owner-approved repository-controlled function ACL bootstrap correction.
SOURCE, POSTGRESQL, SECURITY, FAILURE INJECTION, REGRESSION and BUILD proof on
owned local PostgreSQL17.11. Managed hosted installation remains NOT PROVEN.

| Requirement | Result / proof | Limitation |
|---|---|---|
| Ordinary local installation | PROVEN: focused suite15/15; full final catalog equals certified reference | Local socket-only fixture |
| Managed default function grants | PROVEN: genuinely non-superuser postgres; explicit public EXECUTE defaults for anon/authenticated/service_role; full catalog parity | Supabase-shaped local fixture, not hosted Auth/PostgREST proof |
| Prior defect control | PROVEN: without normalization the local transaction gives all444 public functions anon/authenticated/service_role EXECUTE; transaction rolls back | No historical/hosted install implied |
| Exact function ACLs | PROVEN:1117 exact function ACL/owner/body/security/path/effective privilege entries match in both shapes;444 public functions deny anon/authenticated;162 deny service_role | Catalog and actual bounded calls; not positive tournament rehearsal |
| Legitimate grants | PROVEN: all17 intentional PUBLIC grants and305 service-executable entries remain exact; allowed wrapper reaches canonical authority denial rather than ACL denial in both shapes | Authority deliberately uninitialized; positive domain proof retained from source-stable R2 |
| Private cores | PROVEN:169 new private functions +1 retained guard;510 actual42501 calls per shape,1020 total;16 new and77 touched public wrapper attributes checked | Existing private privileges are not assumed blanket-denied |
| Provider preservation | PROVEN: default-ACL rows and provider functions in auth/storage/realtime/extensions plus public.rls_auto_enable retain OIDs, owners, bodies and ACLs through install/replacement/replay | Local platform approximation |
| Replacement | PROVEN: all1117 definitions replaced with their identical definitions under existing defaults; full catalog remains exact | New unrelated future functions still require reviewed ACLs |
| Atomicity / replay | PROVEN: existing three fault boundaries roll back application schema/receipt; exact replay preserves counts, permissions, ownership and no authority | No remote lost-connection/hosted transaction proof inferred |
| Security/RLS/catalog | PROVEN:1117 functions,269 relations,260 RLS tables,218 triggers,691 indexes,12994 dependencies unchanged | Only previous pgcrypto provider-owner allowance remains |
| Broad regression | PROVEN:493 files,4097 tests;4077 pass /20 established failures /0 skip; exact normalized failure diagnostics equal prior accepted baseline | Raw broad result remains FAIL; no exclusion or reclassification |
| Build | PROVEN: local Next buildPASS with no provider configuration/outbound sockets | Build only; no deployment |

Raw [bootstrap](evidence/bootstrap.log.gz), [application](evidence/application.log.gz)
and [build](evidence/build.log.gz) logs are preserved losslessly. Execution receipts
contain original-byte SHA256, source snapshots and archive hashes. Full private
catalog/runtime proofs: [managed](evidence/private-core-security-1.json) and
[ordinary local](evidence/private-core-security-2.json). [ACL parity](evidence/acl-parity.json)
records both shapes,1020 private denials,6 additional public ACL denials and2
canonical wrapper denials. [Accounting](evidence/broad-accounting.json) proves
zero new unexplained failures. The bootstrap suite itself reproducibly compiles
the recorded schema/catalog/static data/manifest and repeats artifact generation.

The first focused run had two new harness probe failures: the server wrapper call
used SET ROLE but omitted the existing service-role request claim. ACL parity
already passed. Only the new probe was corrected to include the normal claim;
no admission/body changed. [Counterevidence](evidence/initial-probe-context/bootstrap.json)
and its raw log are preserved. Final affected proof passes15/15.

## Hash and version

Keep `bagger-canonical-bootstrap-v1` and profile `phase2-p0f-portrait-v1`.
The receipt format, authority references and application catalog are unchanged;
artifact SHA256 identifies each package. Old installation receipts are neither
rewritten nor accepted as identifying the new bytes.

Schema hash:
`7c371dc677c6b5ff244dcce68a71674482c6f500d814371517fd6f0fa2dabf42`.
Manifest hash:
`1d0d576e21cc48160bcbe82a56d4bc3a81adbc13032145296f1c0d6baa9ae4b2`.
Static/catalog hashes unchanged. The generator source hash changes truthfully.

## Retained evidence and boundaries

All149 application/migration source hashes,22 forward migrations, five static
tables and normalized catalog remain identical to base. P0A–F remain accepted
local PASS; the installation portion of P0C is recertified. The864-hole chronology
is not rerun because domain/scoring/resource/admission/client/release definitions
and data contracts are unchanged. This does not expand its original proof layer.

048/057: **NOT REPRODUCIBLE FROM RETAINED EVIDENCE — NOT PROVEN**, unchanged.
069 remains unchanged. Google remains retired. No shipping native change.

During remediation: hosted accesses/mutations0; Production/old Preview accesses0;
Vercel changes0; deployments0; Google accesses0; new projects0. Existing project
`trmcwrljjxwhgtikfdgu` preserved; last Part1A evidence says clean/uninstalled/
unregistered. It was not re-queried here. Messaging safety audit remains incomplete.
No credential or secret values committed. No automatic Part1A or Part1B continuation.
