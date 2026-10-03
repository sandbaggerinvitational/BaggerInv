# Local bootstrap certification

STATUS: **PASS**

Scope: the owner-approved portability correction to the bootstrap compiled from
application base `9f09f6f15afe1f1a0b326edd078cd54ab4001f71`. SOURCE, POSTGRESQL,
FAILURE INJECTION, SECURITY, REGRESSION and BUILD proof only. Hosted Supabase,
PostgREST/Auth/Storage, Production and physical-device proof remain NOT PROVEN.

## Affected proof

| Claim | Result and proof | Limitation |
|---|---|---|
| Absent namespace installation | PROVEN: focused suite14/14; clean owned local target plus genuinely non-superuser `postgres` target | PostgreSQL17.11 local fixture |
| Existing provider namespace/extension | PROVEN: namespace and pgcrypto owned by `supabase_admin`; OIDs/owners/ACLs/bodies unchanged across install and replay | Supabase-shaped local setup; no hosted provider claim |
| Missing pgcrypto in existing namespace | PROVEN: trusted extension installation by non-superuser `postgres`, preserving provider namespace owner/ACL | Provider binaries/configuration must be verified later |
| Catalog convergence | PROVEN:1117 functions,269 relations,260 RLS tables,218 triggers,691 indexes,12994 dependencies; application catalog byte-identical to base | Only pgcrypto platform ownership has an explicit `postgres`/`supabase_admin` allowance; raw owner is retained |
| Private cores | PROVEN:169 new private functions +1 retained guard;16 new public/77 touched public wrappers;510 actual42501 denials per environment,1020 total | Authenticated/anon/service-role privilege probes; no positive hosted authority inferred |
| Atomic installation | PROVEN: three existing injected failure boundaries still roll back; incompatible pgcrypto schema fails with no app schema/receipt | No usable Certification authority is created by bootstrap |
| Receipt/replay | PROVEN: exact source/artifact validation and receipt replay; deterministic compiler checkPASS | Different existing manifest/receipt remains fail-closed |
| Regression | PROVEN:493 preserved files;4097 total,4077 pass,20 fail,0 skip; exact identity and normalized diagnostic equality for all20 baseline failures | Raw broad suite remains FAIL by the established cases |
| Build | PROVEN: unconfigured local Next buildPASS, outbound network denied | Compilation only; no deployment |

See [bootstrap log](evidence/bootstrap.log.gz), [managed private-core proof](evidence/private-core-security-1.json),
[owned-local private-core proof](evidence/private-core-security-2.json),
[regeneration](evidence/check.json), [broad accounting](evidence/broad-accounting.json),
[source impact](evidence/source-impact.json), and [build](evidence/build.json).
No tests were skipped, removed or reclassified in this correction.
Raw logs are losslessly gzip-archived; receipts retain original-byte hashes and
record archive hashes. This preserves Node's whitespace/terminal output without
rewriting diagnostics to satisfy source whitespace checks. The runner produces
plain logs; archive them after execution when preserving a release artifact.

## Hash/version decision

Keep `bagger-canonical-bootstrap-v1` and profile `phase2-p0f-portrait-v1`.
These identify the existing receipt/schema contract; artifacts are identified
separately by SHA256. Migrations131/138 bind the receipt's manifest/schema/static
digests, not one fixed compiler dump. Application catalog, five static tables,
149 source entries and the ordered forward profile are unchanged. Changing the
contract version would unnecessarily alter annual/resource authority references.

The schema hash changes from
`9640535f1116dd7b009f0101a1d4cdfb447a582a38706c0383163844646c10a9` to
`4e67e3084e341c543a192cc0e665a0a776bd7badc22d9bf9b821ebf21aa0ef04`.
The new manifest hash is
`a96889846994f10a2d0e38e77d3cc6fa2b28a48cca86ce2c8cada90b3d8a3eec`.
Static and catalog hashes are unchanged. The generator hash is updated truthfully.
Old receipts are not rewritten or accepted as identifying the new artifact.

## Retained R2 proof

All149 application/migration sources, the catalog and static contracts remain
unchanged. P0A–F retain their accepted local PASS; the installation part of P0C
is freshly proven here. The864-hole chronology, scoring/side-game rules, resource
and admission model, client contracts, recovery, finite timeouts and release
semantics are unaffected, so their source-bound R2 evidence is retained without
an expensive rerun. Zero-Google architecture remains unchanged.

048/057: **NOT REPRODUCIBLE FROM RETAINED EVIDENCE — NOT PROVEN**, unchanged.
069's approved forward correction and exact bridge remain source-identical.

## Environment qualification

The first local run encountered the Mac's exhausted SystemV shared-memory IDs.
Read-only inspection found unattached56-byte segments from dead processes.
Only segments owned by this user with zero attachments and dead creator/last-user
processes were removed through normal reviewed local execution. No live process,
database data, operating-system setting or hosted resource was changed. The final
proof then ran and cleaned its disposable clusters. No privilege/Supautils shim
was added to the installer. Provider roles/internal schemas are prepared only by
the local fixture; installation itself connects as non-superuser `postgres`.

Ready to resume Part1A: **YES**, subject to separate owner authorization and
managed-target preflight/catalog readback. This PASS does not authorize resource
creation, Vercel configuration, deployment, Production, Google or Build11.
