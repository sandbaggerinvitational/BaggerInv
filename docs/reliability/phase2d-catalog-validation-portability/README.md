# Catalog validation portability — PASS, local proof only

Installed application/bootstrap identity remains
`b46ea9465a3a6d0ad89e8d447d08546b84bd262b`. The containing remediation commit
identifies **additional validation tooling and evidence**, not a changed installed
bootstrap. Project `trmcwrljjxwhgtikfdgu` was not accessed or mutated in this run.
Its retained state is INSTALLED + RECEIPT-VALID + UNREGISTERED + UNINITIALIZED.

## Required semantic analysis

The frozen [catalog query](../../../supabase/canonical_bootstrap/catalog.sql)
collects `pg_depend` edges as JSON objects with `dependent`, `referenced` and
`type`. `pg_describe_object` supplies normalized logical object/subobject identity;
physical allocation OIDs and excluded TOAST/internal RI names are not the
certified comparison identity. One record is identified by the complete JSON
tuple. No field is omitted by the new comparison.

The query uses **SELECT DISTINCT**, so duplicate normalized records are not valid
output from the certified collector. Multiple physical rows that normalize to
the same tuple were already collapsed by that existing contract. The new validator
does not deduplicate its input: additions/removals of repeated records remain
detectable as multiplicity differences, including when the distinct-record set
is unchanged.

The array ordering is `ORDER BY value::text`. It is neither a graph traversal nor
a topological ordering. It carries no object-creation sequence: the schema is
installed from the independent pg_dump/pg_restore-derived artifact; comparison
occurs afterward. The source/compiler README specifies logical dependency-edge
convergence. The old ordered JSON comparison accidentally treated a presentation
order as a semantic constraint.

The preserved hosted database uses ICU `en-US` (`en_US.UTF-8` metadata); the local
compiler uses `--no-locale` and C ordering. Their text comparison rules order
otherwise identical JSON records differently. The captured inventories contain
**12,994 records each, zero missing, zero unexpected**. All other sections match.

There are two distinct contracts: the recorded artifact's bytes, including its
original array order, still have immutable hash identity; the logical dependency
inventory has unordered edge semantics. This correction changes only the latter
comparison. Tampered/reordered expected artifact bytes still fail hash validation.

## Bounded correction and receipt compatibility

[portable-canonical-catalog.mjs](../../../tools/reliability/portable-canonical-catalog.mjs)
adds the separately versioned `bagger-catalog-validation-portability-v1` validator.
It serializes every dependency record with the existing stable JSON serializer,
then orders complete keys with explicit ECMAScript string `<`/`>` comparisons.
No database/default locale or `localeCompare` is used. It keeps every record and
field, preserves multiplicity and leaves inputs unchanged.

Only the dependency arrays are canonicalized in comparison copies. The unchanged
`assertCatalogConvergence` checks every other section and retains only its existing
narrow pgcrypto platform-owner allowance. Function definitions/hashes, owners,
ACLs, security modes, search paths, RLS, grants, triggers, constraints and object
identity remain strict.

The existing compiler helper is explicitly hashed in bootstrap `toolSources`.
Changing it would change that provenance. Instead it, every numbered migration,
`catalog.sql`, all generated bootstrap artifacts and their manifests remain
**byte-identical**. The added post-install validator/CLI are outside the frozen
compiler manifest and identified by their separate repository/tooling source
hashes. No manifest/version/receipt rewrite or compatibility alias is introduced.
Bootstrap version remains `bagger-canonical-bootstrap-v1`.

The immutable receipt's manifest/schema/static hashes remain:

| Artifact | SHA256 |
| --- | --- |
| manifest | `1d0d576e21cc48160bcbe82a56d4bc3a81adbc13032145296f1c0d6baa9ae4b2` |
| schema | `7c371dc677c6b5ff244dcce68a71674482c6f500d814371517fd6f0fa2dabf42` |
| static | `7b93c4235a5c18cdd68be56b13df26ffcab1d9af8f3b3d9b27895cd6b8afb27d` |

Schema, application/domain/authority semantics, resource model, RLS, grants,
scoring, annual operations, Odds and Director behavior: **NO CHANGE**.

## Executed proof

| Gate | Result | Evidence |
| --- | --- | --- |
| Affected validator tests | **19 pass / 0 fail / 0 skip** | [Receipt](evidence/validator.json), [raw log](evidence/validator.log.gz) |
| Actual local PostgreSQL17 C and ICU en-US | PASS; genuinely different record order, identical logical inventory | Same validator log; PostgreSQL17.11 |
| Preserved actual hosted inventory | PASS under portable validator; FAIL reproduced under old comparator | [Snapshot provenance](evidence/input-provenance.json), [compressed catalog](evidence/hosted-catalog-readback.json.gz) |
| Missing / unexpected / changed / multiplicity / wrong dependent / wrong referenced | All detected; six cases repeated under both actual collations | Validator tests/log |
| Extra record field / malformed inventory / other security changes | Detected | Validator tests/log |
| Receipt hashes and expected artifact byte identity | PASS; wrong hashes/duplicate receipts/reordered expected artifact rejected | [Unchanged receipt](evidence/installed-receipt.json), validator tests |
| Accepted 493-file broad selection | **4,077 pass / 20 established failures / 0 skip** | [Run](evidence/application.json), [raw log](evidence/application.log.gz) |
| Broad accounting | **0 new unexplained failures**; exact identities and normalized diagnostics unchanged | [Accounting](evidence/broad-accounting.json) |
| Build | Prior PASS retained; no build input changed, no new tooling import from application | [Impact](evidence/source-impact.json), prior privilege-portability build receipt |

The 19 new validator cases are separate from the frozen 4,097-test broad selection;
they are not counted as removed/replaced baseline tests. The broad raw suite still
fails its established 20 cases. No exclusion, deletion or reclassification occurred.

## Reviewed Part1A validation addendum — execution still needs owner authorization

This supersedes only the post-install **dependency comparison ordering** in the
earlier hosted addenda. All installation, resource identity, receipt, role,
security, admission and registration gates remain unchanged. Do not reinstall,
update receipt, modify database locale, patch SQL or recompile the bootstrap.

1. Under separately authorized Part1A resumption, reverify the exact physical
   project and safe unregistered/uninitialized state. Capture a fresh read-only
   catalog using unchanged `catalog.sql`, with unchanged canonical function-body
   SHA256 transformation. Capture exactly one installation receipt as a JSON array.
   Retain raw readback/provenance; do not overwrite the historical failed comparison.
2. Execute the offline, repository-controlled validator on those local files:

   ```sh
   node tools/reliability/validate-canonical-catalog.mjs \
     --actual /absolute/path/to/catalog.json \
     --receipt /absolute/path/to/receipts.json
   ```

   It validates the frozen artifacts/source hashes and receipt before comparison.
   It cannot connect, install, register or initialize; its PASS describes only the
   supplied snapshot. Any real record/security/hash difference must stop advancement.
3. Finish the unchanged hosted provider/security/external/preinitialization checks.
   Only after all fresh gates pass may the already-certified owner-only physical
   resource registration be invoked under the new owner authorization.
4. Stop INSTALLED + REGISTERED + UNINITIALIZED, with no deployment/release/admission/
   ingress authority. Part1B remains separately authorized.

## Source impact and stop boundary

See [source impact](evidence/source-impact.json). No existing base file was changed;
only validator/testing tools and this evidence package were added. Neither 864-hole
chronology, hosted bootstrap nor full scoring certification was rerun. Existing R2
proof remains valid by unchanged source/artifact identity. Historical048/057 remain
NOT REPRODUCIBLE FROM RETAINED EVIDENCE — NOT PROVEN;069 remains unchanged.

No hosted connection/mutation, registration, initialization, Vercel change,
deployment, Production/old Preview access, Google access or Build11 occurred.
Git-triggered deployment remains disabled for the existing isolated branch.

**Ready to resume Part1A catalog validation and registration: YES.** This is a local
validator certification, not fresh hosted registration or hosted application PASS.
Owner must authorize resumption; this run stops after commit/push.
