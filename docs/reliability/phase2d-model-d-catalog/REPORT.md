# Model D catalog verifier remediation

Status: PASS — local provisioning/comparator certification only. No hosted reinstall is authorized or performed. Push: NO.

## Exact cause and evidence boundary

The committed Model D catalog is compiled on owned PostgreSQL 17 with C locale. The empty hosted Model D database reports PostgreSQL 17.11, ICU locale `en-US`, and `en_US.UTF-8` collation/ctype. The historical query orders dependency JSON by `value::text` using the database default collation. The installation renderer directly compares those ordered arrays, bypassing the repository's already-certified portable dependency comparison.

An owned PG17 installation with the observed ICU locale and modeled provider public-function default grants reproduces the predecessor failure. Only layer I (dependency ordering) differs: 710 positions in 13,287 complete dependency records. The full record multisets and multiplicities match exactly; all other catalog sections match exactly. The C reference passes the predecessor comparator. The ICU model fails it and passes the corrected comparator. First mismatch: the ICU ordering places the `annual_scoring_platform_certifications_v_contract_version_check` dependency before the expected `annual_scoring_platform_certifications_v1_deployment_id_check` dependency. The complete positional differences are retained in evidence/predecessor-differences.json.

This identifies a deterministic sufficient cause of the observed hosted failure. The failed hosted transaction did not retain its full actual catalog; no assertion is made that a rolled-back snapshot was recovered, or that future hosted verification cannot reveal an additional mismatch. The future installer now reports such mismatches before rollback.

## Classification and ownership

No missing/extra application objects or changed security metadata exist in the reproduced comparison. The reordered dependency descriptors refer to application-owned and Certification-control objects, still present with identical values. Their positions are BENIGN_METADATA; the database locale is PROVIDER_VARIABLE. Locale existed before installation; Bagger dependency rows did not. No owner, ACL, RLS, function body, security mode, or search_path is normalized because of this difference. The dependency multiset is deterministic even when its SQL presentation order varies.

The empty hosted catalog relevant to the existing comparator contains no application functions/relations and only `pgcrypto 1.3`, schema `extensions`, owner `postgres`. Provider default grants, role memberships, event-trigger identities, Auth column metadata and locale were read in explicit read-only transactions, without function bodies or user data. These are sanitized baseline evidence, not copied provider objects or application authority.

## Exact correction

The provisioning renderer delegates its pre-COMMIT verification block to tools/reliability/model-d-catalog-verifier.mjs. Only complete dependency records are ordered with explicit C collation on both actual and expected arrays. No projection, filtering, field deletion or deduplication is performed by the correction. Existing catalog fields remain exact. The separately certified pgcrypto owner allowance remains limited to postgres/supabase_admin; extension name/version/schema/inventory remain exact. Unsupported owners fail with diagnostics rather than being accepted.

The image creates no non-extension public relations. An additional exact empty-inventory check rejects an unexpected table, view, materialized view or sequence in public, including a client-accessible provider-shaped object. No entire schema or generic provider owner is ignored. Public non-extension functions continue to participate in exact comparison under the unchanged historical catalog query.

No image, forward SQL, historical migration/bootstrap, scoring, Director, Auth, domain processor, Queue/worker logic, dependency lock, registration selector, or branch exclusion changed. Registration remains disabled/unresolved. No shipping application change, forward SQL, or image regeneration is required.

## Comparison layers

A: application catalog definitions/identities remain exact.
B: Certification-control definitions/identities remain exact.
C: sanitized provider baseline recorded separately; no new waiver.
D: exact required pgcrypto inventory/version/schema, existing narrowly bounded owner allowance.
E: ACL/owner/security/default-privilege metadata exact.
F: RLS/force-RLS and policy catalog exact.
G: function identities/signatures and complete definition hashes exact.
H: complete function configuration/search_path exact; diagnostics expose only its digest.
I: complete dependency record multiset, preserving multiplicity; the reproduced failure occurred here.
J: unexpected inventory remains rejected, plus explicit empty non-extension public relation inventory.

## Future failure diagnostics

MODEL_D_CATALOG_MISMATCH includes DETAIL with catalog class/layer, total mismatch count for each failing class, at most ten positional mismatch identities per class, presence, owner, ACL digest, security mode, RLS state, search_path digest, expected/actual record hashes, expected catalog digest and actual normalized catalog digest. Complete function bodies, configuration values, rows, credentials, session or financial data are not emitted. Catalog-wide digests use PostgreSQL JSONB text in the SQL path; JS local diagnostics use their documented stable serialization, so these digest formats are not cross-compared.

The owner's existing BEGIN/COMMIT placement, lock, preflight, receipt insertion and replay protocol remain intact. Verification executes before COMMIT; any mismatch rolls back both schema and receipt. No persistent diagnostic function/RPC is installed.

## Local proof

42 focused tests PASS / 0 failures / 0 skip, including the existing certified dependency-portability suite. Owned PG17 with pg-safeupdate: C and modeled ICU fresh installation, exact replay, predecessor mismatch, corrected equality; SQL rejection of missing/extra function, body/owner/ACL/security/search_path drift, unexpected public relation exposure, unsafe extension owner, RLS removal, policy drift; fresh failure leaves zero application schemas and no receipt. Unit negatives also cover PUBLIC, anon/authenticated/service_role and extra-role ACL drift, private-schema exposure, dependency removal/duplication/additional fields, extension version/owner drift, and unsafe provider-shaped public functions. Sanitized diagnostics with body/search_path sentinel data emit digests, not those values.

Broad regression/build are retained because only reliability/provisioning tooling changed. Exact tracked-source comparison is in evidence/source-equality.json. No 864-hole rerun.

Counts 1,158 functions and 279 RLS-enabled tables describe the committed application catalog (private application/control schemas plus public application wrappers); they exclude provider/extension functions. The extension inventory is a separate catalog section. No count changed to match hosted output.

## Hosted boundary and next action

Hosted actions: read-only structural catalog inspection of heoqynwlmqiejyxdmbmv only. No hosted installation, DDL/DML, configuration/password change, registration, deployment, Auth, Queue, fixture or competitive work. The prior rollback proof was preserved and not rerun. The relevant empty baseline remains consistent with it. Production/original Certification/old Preview/Google/real messaging: zero access/actions.

Ready for separately authorized hosted D2 reinstall: YES. Ready D9: NO. Ready D10: NO.

Next owner action: AUTHORIZE ONE HOSTED D2 REINSTALLATION ON EXISTING MODEL D PROJECT heoqynwlmqiejyxdmbmv USING THE NEW CERTIFIED PROVIDER-AWARE CATALOG VERIFIER, FOLLOWED ONLY ON D2 PASS BY THE REMAINING D3–D8 SEQUENCE.

STOP.
