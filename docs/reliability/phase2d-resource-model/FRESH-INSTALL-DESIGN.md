# Fresh canonical database installation design

**Historical design record.** The approval and implementation statements below describe the original design checkpoint. Implementation is now complete and locally certified at the accepted scope. The emitted final complete-profile installer passes its accepted local proof; use [CERTIFICATION.md](CERTIFICATION.md) and [EVIDENCE.md](EVIDENCE.md) for current results. This preserved design is not itself the release manifest; use the emitted versioned artifacts and their exact hashes.

Status: **PROPOSED; implementation requires owner approval.** Base `7cec5128409286f5b4a5f3524d4c5488124a7be7`. Evidence layer: SOURCE and architecture reasoning only. No SQL, source, migration or tests changed; no local install or hosted interaction executed for this design.

## Decision and boundary

Choose **B — new canonical baseline/bootstrap generated from reviewed final schema definitions plus forward migrations**. “Generated” means a deterministic, source-manifest-controlled build whose output is reviewed and committed. It is not a live Production dump, ad hoc SQL substitution, runtime string replacement, or a schema copied from the old Preview project.

Use **one immutable canonical resource per physical database**, class `PRODUCTION` or `CERTIFICATION`. No database hosts both. This preserves database-local identities and hot-path keys, and avoids converting golf tables into tenant tables. Cross-resource isolation is therefore enforced by the exact deployment/database binding, one-resource invariant, and admitted operation context; it is not claimed merely because two databases have different names.

Existing Production continues to have the same `BAGGER_INV_PRODUCTION` identity, ref, canonical origin, domain, release/activation behavior and current tournament. A fresh certification database has one `CERTIFICATION:<uuid>` resource and **no row** in the Production-only `resource_scope` or `cutover_activation_state` tables. Those definitions remain present for catalog convergence and rollback compatibility; no service wrapper can fabricate their state.

The proposed `canonical_resource_v1` registry is in the existing private control schema. Its primary resource key and singleton constraint establish the physical-database invariant. Resource registration is owner-only, exact and revisioned. The existing `current_tournament_pointer_v1.scope_key` references that registry rather than the Production-only row. Production’s existing scope key, contract, row, and pointer values remain unchanged. A certification pointer uses a distinct approved contract and its own synthetic tournament. This requires reviewed constraint/guard changes, not a second competing golf schema.

Certification uses a new `certification_admission_v1` control row for exact deployment, release, governance tournament, context revision, and allowed capability status. It stores no duplicate current tournament: the existing `current_tournament_pointer_v1` is the sole current pointer and is resolved/revalidated under the required locks. It never copies Production cutover history. Existing isolated Director v1 local/legacy-Preview behavior remains a compatibility surface; a separately admitted certification wrapper supplies the new context to the same private domain implementations. Direct core access remains revoked.

## Why not replay safe historical files

[The complete migration classification](MIGRATION-CLASSIFICATION.md) records120 files. Schema, activation, imports, compatibility provenance, conditional backfills, and exact-body patching are interleaved. Merely omitting001/019/064 prevents later objects from compiling or binding correctly. Replaying them first and deleting fake Production rows later violates the required invariant. Running all historical migrations against a database called “staging” would still establish Production-shaped authority metadata.

The local proof installer is not a clean resource-neutral installer: it creates shim Auth tables/roles, inserts synthetic GOOGLE2026 authority after038, and injects a maintenance capability after068 with replication-trigger bypass. Those are valid retained test arrangements for earlier claims, not a model to reuse for dedicated hosted provisioning.

A new baseline costs review and maintenance of one install artifact, but avoids installing or simulating obsolete historical transitions. Its object manifest must prove convergence to the forward-upgraded schema; otherwise it would become a competing implementation and must not ship.

## Deterministic source manifest

The future implementation should add an explicit, reviewed manifest under `supabase/canonical_bootstrap/` containing:

- Base Git SHA and hashes of all120 classified migrations.
- Exact required function-only artifacts: scored-match-resume; Net Skins SQL repair; exact Calcutta-job recovery; Director management read; Director single-entry clear.
- Final object identities and provenance: each table/type/constraint/index/policy/trigger/function maps to its original definition and each applied successor.
- Select the required Phase2/P0F final definitions plus `player-portrait-policy-v1.sql` as the certification compatibility profile: shipping participant/spectator reads require its RPC. Phone and account-deletion continuation/minimization extras are excluded from this certification profile and their routes/workers/provider modes remain explicitly unavailable/disabled; no supported enabled certification capability may select them. Exclude superseded `access-readiness.sql` and test-only `phone-hook-acceptance-v1.sql`. That acceptance artifact remains separately installed local test tooling; its opt-in hook mode remains disabled. No artifact is discovered by glob. Production upgrade preserves its separately verified existing optional profile and must not install/remove unrelated policy under the resource migration.
- The new resource-model forward migration(s), final object-body hashes, owner/ACL/security/search_path expectations, static reference data, and permitted class-specific bootstrap operations.
- Versioned installation identifier and manifest digest. A fresh baseline must not falsely populate the ledger as though historical data transitions ran; subsequent common forward migrations check its equivalent baseline manifest explicitly.

Names here are proposed implementation scope, not created files. Actual migration timestamps follow repository tooling/convention after approval.

## Proposed installation phases

| Phase | Definitions or operation | Required postcondition | Failure behavior |
|---|---|---|---|
|0. Verify owned database|Inspect fresh local PostgreSQL17 fixture or later approved dedicated Supabase identity; managed Auth/roles/extensions inspected separately.|Empty application schemas; exact known target; no Production/old Preview connection.|Stop on unknown/mixed identity; never infer from name.|
|1. Canonical schema|Install final types, private schemas, canonical domain/identity/control tables, constraints and indexes; no tournament, resource, user, activation or job seed.|Same canonical catalog as forward-upgrade output; no canonical authority active.|Transactional rollback.|
|2. Private implementation|Install final reviewed scoring/annual/side-game/audit/worker functions and admitted wrappers; then dependencies, triggers, RLS, grants, revocations.|No directly callable private core; default PUBLIC execute removed; exact owner/security/search_path inventory.|Transactional rollback; fail on unreviewed dependency or privilege.|
|3. Static contract data|Install deterministic operation allowlists, rule definitions, implementation manifests and retired-family exclusions only.|No mutable tournament facts, fake release, resource pointer or Google worker state.|Rollback; unknown contract version fails closed.|
|4. Exact resource registration|Owner-only registration consumes approved exact project ref/URL, deployment project/class, schema manifest and resource revision.|Exactly one CERTIFICATION resource; Production row count0. A Production install uses separate exact Production registration, never this operation.|Same-registration replay deterministic; conflicting registration refused; no actor authority granted.|
|5. Initial synthetic authority|Explicit bootstrap creates permitted synthetic governance/current tournament foundation; provision synthetic Auth identities via separate non-sending administrative mechanism and bind existing Director role/entitlement.|No real player, financial, score or imported workbook data; current pointer and governance refer only to registered resource.|Transaction rollback or explicit non-operational pending state; never READY on partial setup.|
|6. Certification admission|Owner-only exact release/deployment registration, server-bound Director context and independent checks open only approved certification capabilities.|No Production activation row; missing/stale registration denies; API cannot choose resource.|Replays preserve operation ID; conflict or incomplete binding stays closed.|
|7. Verification|Inventory functions, dependencies/ACL/RLS, install receipts, retired Google rows, no cron/provider hook and no unexpected jobs; run local protocol tests.|Schema and authority are reviewable before a separate hosted deployment is considered.|Do not advance on a missing capability.|

No phase writes a fake Production resource, sets `session_replication_role=replica`, populates a Production-shaped activation for certification, grants browser/service direct core access, creates actual Google delivery, or starts a provider send. Phase1–3 contain no live data. Resource registration and activation remain separate so a installed schema alone cannot authorize use.

## Catalog and row parity

Two owned local databases are required during implementation:

1. **Upgrade fixture:** preserved synthetic Production-shaped baseline at the exact approved source/runtime manifest, with the same selected portrait optional profile as the fresh fixture, then the new forward migration. This fixture construction is not evidence that the deployed database already contains that optional profile.
2. **Fresh fixture:** clean supported platform foundation, new canonical baseline, owner-registered CERTIFICATION resource, then synthetic authority bootstrap.

Compare normalized catalog identities, columns/defaults/constraints, indexes, trigger ordering and enabled state, RLS/policies, grant/owner/security/search_path attributes, final function source hashes, and stored dependency edges. Physical OIDs differ; relationship identities must match. The fresh and upgraded canonical function definitions must be the same, including class dispatch; only class-specific registered/control data differ. Any version-normalization exception must be explicit in the manifest and must not hide a different domain implementation.

The equality comparison selects the same explicit optional profile on both fixtures. An actual later Production upgrade preserves any supported installed optional profile and its hashes; it does not install or delete phone/deletion/portrait policy merely to match a certification fixture. If the deployed optional inventory differs from every reviewed manifest, preflight stops and the additional manifest receives separate equivalence proof. The shared canonical model must still converge; optional inactive integration inventory does not justify parallel golf implementations.

Rows are intentionally different: Production retained resource/activation/history stays intact; certification has no such rows and only its explicit registry/admission/synthetic rows. The *schema and canonical golf/domain implementations* converge. The baseline must preserve historical tables needed for upgrade/history/API contracts, while omitting historical seed data and disabling obsolete delivery. It must not drop old audit facts from an upgraded database merely because a fresh database has none.

## Production forward path and rollback

Preserve all historical migration files. Add a forward migration that registers the existing exact Production row in `canonical_resource_v1`, asserts one known identity, replaces the pointer FK with the registry FK without changing the pointer row, adds narrowly required class-aware constraints and the empty certification admission structures, and updates only selected context-resolver/private-core boundaries. It does not automatically install any adjacent optional candidate; existing supported optional definitions are preserved under exact manifest checks. No Production database recreation and no blanket resource_id backfill on scores/players/jobs.

Exact existing Production domain rows remain database-local authority. Explicit backfill is limited to registry metadata and links required for current/future resource context; link the already-known Production identity deterministically, never infer from arbitrary URLs. Future-tournament resource rows must reference the same registered singleton. For History/Draft/Guide rows already carrying project_ref (or project_ref plus project_url), replace the fixed-ref CHECK with an exact FK to the singleton registry where nullability/legacy contracts permit; do not mechanically add another resource_id to these tables. Preserve existing columns, Production values and historical rows. Existing fixed source_workbook_id constraints require a class-aware provenance rule: Production keeps the original immutable identifier; certification uses an owner-registered non-Google synthetic provenance identifier, for example urn:bagger:synthetic:<installation-id>. That value is selected from the database registration, not trusted from client JSON, and confers no authorization or delivery authority. Retired worker configuration tables may remain empty with their old compatibility checks; active canonical History/Draft/Guide constraints may not force the Production workbook into a certification row.

**OLD APP / NEW SCHEMA: CONDITIONAL (design target compatible).** Keep old Production names/signatures/response/error/admission behavior and resource/cutover rows. Prove equivalence before claiming compatibility. **NEW APP / OLD SCHEMA: FAIL-CLOSED for certification**, with typed missing-contract response; existing Production path must be separately regression tested. Application rollback is preferred over dropping schema, columns, receipts or history. Never replay an old migration over new final bodies. Any downgrade must account for new certification records; no destructive downgrade is implied.

## Additional mandatory proof

- Fresh install is repeatable from empty application schemas, with explicit handling of a repeated baseline invocation and deterministic interrupted-install rollback/retry. No manual patch or test-only mock supplies authority.
- Registration rejects second resource, class conversion, arbitrary ref, mixed public/server/Auth project, Production identity on certification, untrusted caller and stale owner registration revision.
- Exact canonical code and resource-bound context run score/mutation/receipt recovery, annual CREATE, Lock/Resume/Finalize, seven Director identities, three routing cases, all required workers and side games. Same-operation retries/conflicts and atomic audit/readback are preserved.
- Wrong-project credentials fail before mutation; independent databases demonstrate that copied mutation/job identifiers cannot resolve or claim across resources. Physical separation does not replace server-bound resource assertions.
- All six local Phase2 P0 proofs, security/client/release equivalence, Google absence, full432-hole sequence, broad regression, build and1×/2×/5×/10× score-path bounded performance must be rerun according to actual change impact. Do not reuse prior PASS as new-candidate proof.
- PostgreSQL17 local proof does not prove hosted Supabase Auth, PostgREST schema cache, extension ownership, service-role credential identity, network, cron or messaging isolation. Those remain later hosted gates.

## Design verdict and open implementation risks

**STRONGLY SUPPORTED:** Strategy B is the smallest deterministic approach that avoids fake Production identity while preserving one set of canonical golf logic. **NOT PROVEN:** fresh installation, forward-upgrade convergence, old-app/new-schema compatibility or local P0 recertification. This is an implementation recommendation, not an install manifest ready for execution.

The largest risks are incomplete stored/dynamic dependency discovery; hash-based successor patches after refactoring; omitted non-numbered function prerequisites; accidental DEFAULT/PUBLIC EXECUTE grants; Production-specific predicates embedded below shared wrapper level; false audit provenance; and imported project/workbook constraints used as live authority. Each is a fail-closed implementation gate, not an unresolved choice between resource architectures. The exact platform owner/extension versions and authored object/dependency hashes must be fixed in the reviewed installer before a new candidate is certified. The selected baseline/profile boundaries are explicit above; later evidence that a required capability cannot fit them stops implementation for owner review.
