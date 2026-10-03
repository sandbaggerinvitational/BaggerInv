# Shipping History continuity after annual activation

Status: **PASS at the scoped owned-local proof layer for2026 History after the first real annual activation. Full later-year chronology remains separately incomplete.**

**PROVEN (SOURCE, before147):** the shipping History service selected fixed2026 current reads after the current tournament advanced. Migration145 proved a separate closed-predecessor projection, but the shipping service did not select that operation. The minimum correction is now implemented in147 and the existing shipping adapters, as described below.

**PROVEN (OWNED LOCAL POSTGRESQL / RPC / SHIPPING JS / FAILURE INJECTION):** `implementation-evidence/annual-transition-2026-10-03T00-02-46-826Z.json` records the fifteenth run's actual shipping History proof. After genuine2026 scoring, explicit Odds publication, FinalRecap and annual activation to2097, the unchanged public overview and team DTOs matched their pre-transition values. The exact retained Guide pointer/payload, wrong-resource/target/stale-context denials, private-core ACLs, closed-target authoring denials, missing-Guide feature locality, no fallback, late-pointer rejection and exact-pointer plan passed. This does not establish the later2098 transition, which stopped at a separate2097 Odds input/calculation rejection.

**PROVEN (LOCAL POSTGRESQL / RPC / JS ADAPTER):** `annual-transition-2026-10-02T23-15-25-579Z.json` advanced the synthetic resource to2097, recovered predecessor score/publication outcomes, and returned24closed2026 finalized scorecards through `read_canonical_closed_tournament_view`. It also correctly denied a stale current-target History request. This is narrower than a complete shipping History service PASS.

## Before-state callers and authority

| Required path | Current destination | After current advances |
|---|---|---|
| `history-2026-service.loadHistory2026View` → `history-2026-supabase.readHistory2026SupabaseView` → `scoringShadowRpc` | `read_canonical_2026_historical_view` → `READS.HISTORY_2026` | Migration140's future gateway rejects the fixed2026 target;145 intercepts only `READS.CLOSED_TOURNAMENT` |
| The same service → `guide-supabase.readGuideProjection({tournamentId:'2026',surface:'course'})` | `read_current_guide_projection` → `READS.GUIDE` | `canonical_guide_read_v1` explicitly requires the current pointer to remain2026 |
| History team metadata when `includeTournamentPlayerMetadata` is true → `readLeaderboardsCoreView('2026')` | `READS.CURRENT_VIEW / LEADERBOARDS` | Current authority correctly rejects predecessor2026 |
| New isolated primitive, currently exercised directly by the proof | `read_canonical_closed_tournament_view` → `READS.CLOSED_TOURNAMENT` | Exact same-resource committed predecessor lineage succeeds |

The existing service requires Guide course presentation and fails if it is unavailable. Silently omitting that dependency, substituting a current2097 Guide, or fabricating an old current context would change the contract. None is proposed.

## Scope assessment under the latest owner instruction

The initial version of this document treated changed routing/admission placement as requiring another owner approval. **Correction (SOURCE / OWNER REQUIREMENT):** that conclusion was too broad. The latest owner extension §141 and §§151–152 explicitly direct ordinary resource-aware pointer, wrapper, caller and adapter defects to be fixed within the approved architecture. §155 requires the actual History service; §234 requires completed predecessor History after annual activation. A new read wrapper around the existing same-resource closed authority and retained canonical presentation implements those requirements; its size or different routing alone is not a material new authority decision.

**STRONGLY SUPPORTED:** the minimum implementation below is inside that existing approval, provided its data really is the retained canonical predecessor authority and the public/Production contracts remain unchanged. Normal runtime approval review still applies. A genuinely new boundary would arise only if missing provenance forced a new source of truth, new publication policy, invented authority/receipt, closure mutation, role expansion, or a supported client-breaking contract. None is proposed. Do not stop merely because retained-pointer evidence or a fixture still needs work; gather it and implement the already-approved read. Stop only if a concrete necessary change crosses that material boundary.

## Implemented minimum correction

**IMPLEMENTED — SCOPED LOCAL RUNTIME PROOF PASSED.** Migration147 adds one Certification-only read operation, `READS.CLOSED_HISTORY_2026`, through the existing service-only `public.read_certification_projection_v1(jsonb)` gateway. Its logical server adapter alias is `read_canonical_closed_history_2026_bundle`. Its private implementation is `production_control.certification_closed_history_2026_read_v1(jsonb,jsonb)`. There is no new public RPC, role, write operation, closure field, publication, or external provider.

The payload is exactly `{ "target_tournament_id": "2026", "include_tournament_player_metadata": false }`, with the second field an optional boolean defaulting to false. Unknown fields and all client-supplied resource, actor, project, release, context or provenance fields are denied. The existing server-bound READS envelope carries the registered resource, deployment/release and expected current context token. The operation is valid only when2026 is a different, proven closed predecessor of that exact resource. It does not generalize History to other years.

### Shipping caller selection

1. `loadHistory2026View` retains its fixed year2026 validation and ordinary Production/Preview paths.
2. In an explicitly selected Certification environment, the server resolves the existing valid READS context once. While its current tournament is2026, the three existing reads remain unchanged.
3. Only when that validated context identifies a successor does the service call the new bundle through `history-2026-supabase` → `certification-read-adapters` → `certificationProjectionRpc`. SQL independently proves the same-resource closed predecessor; the server's branch selection is not authorization.
4. The one SQL call obtains the History aggregate, required Guide presentation and optional metadata under one admitted context. It returns internal `{ ok: true, data: { history, guide, tournament_player_metadata } }`, with each member using the existing `{ ok, data }` reader shape; unrequested metadata is null. This is an additive **server-only** response contract. Existing History/Guide adapters, metadata merge, cache fingerprint and public sanitizer continue to produce the unchanged public History DTO.
5. A denied or unavailable bundle is a local History error. There is no retry through the current-read operations, another year, Production, an omitted Guide, or Google. An annual transition between context resolution and the RPC fails the existing stale-context check; it does not silently rebind.

The direct `READS.CLOSED_TOURNAMENT` primitive and all current read restrictions remain intact. In particular, `READS.HISTORY_2026`, `READS.GUIDE`, and `READS.CURRENT_VIEW` do not gain permission to read a noncurrent target. This also avoids globally changing `guide-supabase` or `leaderboards-core-supabase` admission.

### Data assembly

- **History:** call the existing145 closed-predecessor helper with target2026, retaining all its lineage and Final-snapshot checks. Apply the existing `HISTORY_2026` adapter to its canonical aggregate.
- **Team metadata:**145 already obtains `public.read_leaderboards_core_view(target)` before adding finalized snapshots. Reuse that exact admitted aggregate's tournament, teams and players; do not perform a second unadmitted current-read call. Supply only the inputs consumed by `mergeHistoryTournamentPlayerMetadata`: player IDs, team sides, tournament handicaps, captain flags/IDs and corresponding tournament/team presentation keys. Keep its identity-match errors and signed handicap semantics unchanged.
- **Guide:** read only the retained exact2026 published GUIDE pointer/revision, subject to the provenance conditions below. Preserve the Guide contract, source-tabs contract, validation, tournament identity, canonical course-context eligibility, payload/delivery fingerprints and existing adapter shape. No new Guide publish or import is part of this proposal.

Implemented scope under the existing bounded approval: `history-2026-service.js`, `history-2026-supabase.js`, the two Certification read transport/alias modules, migration147 for the private read and gateway branch, and the directly affected shipping-service/annual/security proof helper. No general History policy, ordinary Guide/leaderboard routing, annual mutation or scoring change is included.

### Source and review findings

**PROVEN (SOURCE):** the alias reaches only the existing Certification projection transport and its exact `READS.CLOSED_HISTORY_2026` allowlist entry. The service chooses it only after resolving the existing server-bound READS context and observing a successor current tournament. SQL independently checks145's same-resource closed predecessor authority; the JavaScript selection supplies no permission of its own. Ordinary Production/Preview and current2026 reads retain their existing operations. No score, publication, authoring, Finalize, annual-transition or current-read SQL definition is changed.

**PROVEN (SOURCE):**147 creates a `STABLE SECURITY DEFINER` private function with `search_path=pg_catalog` and revokes EXECUTE from PUBLIC, anon, authenticated and service_role. Its installation assertion checks owner, search path and absence of nonowner EXECUTE grants. The public gateway is modified in place;147 verifies its OID, owner, ACL, security mode, search path, volatility and stored `pg_depend` rows against the before-state. These source/install checks complement, rather than replace, the pending actual role-denial and nested-call runtime proof. PL/pgSQL body references are not a complete stored dependency graph.

**PROVEN (SOURCE):** Guide selection keeps135's exact published pointer/revision, registered project and non-authoritative provenance identifier, expected domain/year/contract/tabs and VALID status. It uses the existing canonical Guide hash functions and course-context eligibility check. The added retained-predecessor checks require nonnull publication/pointer times at or before the matched closure. No native/import receipt prerequisite or fixture-specific runtime exception is introduced. The read is deliberately not claimed to be closure-pinned.

### Preserved runtime counterevidence

The thirteenth annual run installed the forward profile through147 and completed genuine432/432 holes and24/24 Finals, then the **pre-transition** shipping History capture failed in the existing Round Scorecards adapter: `The finalized snapshot is missing required Round Scorecards identity/configuration fields.` The initial synthetic fixture stored `display_match_number=match_id`, while the established archive/History contract requires a numeric display number. Future139 authoring already writes the canonical numeric match number. The fixture was corrected before scoring; no Final snapshot or runtime adapter check was weakened.

The fourteenth run passed actual before/after History DTO equality and authoring/ACL checks but its rollback fault-injection query set SQL ROLE without the required JWT service-role claim. The real gateway correctly returned `PRODUCTION_SERVICE_ROLE_REQUIRED`. The helper was corrected to supply both the normal synthetic transport claim and SQL role; the actual admission predicate remained unchanged. The fifteenth run then passed all scoped History assertions. Both earlier failures remain preserved counterevidence rather than being relabeled PASS.

## Guide provenance: what exists and what is not proven

**PROVEN (SOURCE):** a GUIDE pointer alone is not a frozen annual-close certificate. Migration138's `certification_annual_predecessor_certificate_v1` fingerprints resource/origin, closure, epoch/generation, admission revision/watermark, lease set and match revisions. It does **not** include a Guide revision ID, Guide payload hash, course-presentation hash or team-metadata hash. Migration145 does not add those fields. The proposal must say **retained published predecessor presentation**, not **closure-pinned Guide**.

**PROVEN (SOURCE):** native Guide publications have useful stronger evidence. Migration082 makes `guide_authoring_revisions_v1`, revision provenance, operation receipts and audit events immutable. Migration139's publisher atomically links the native revision to the production projection revision and Guide content revision, records their fingerprints, advances the pointers and writes the receipt/audit. Its resource guard rejects a closed target. The Certification gateway for `ANNUAL.GUIDE_*` is narrower still: it admits only future DRAFT/CONFIGURING/READY_FOR_ACTIVATION targets. It does not authorize manufacturing a current2026 publication for this proof.

**PROVEN (SOURCE):** legacy `projection_revisions`/`projection_current` and import ledger rows contain exact project/provenance, revision/fingerprint and publication/import timestamps. Their ordinary runtime roles have no direct write privileges;082 revokes both old Guide import RPCs. However, the inspected source does not establish an immutable annual binding for those rows, and calling the import ledger "immutable" in a comment does not prove an immutable trigger exists. The exact installed ACLs, nested callable writers and the actual retained initial Guide provenance still require runtime inspection.

The proposed read may succeed only if all of the following are proven for the selected row:

1. Exact `(GUIDE,2026)` current pointer, exact referenced revision/domain/year, expected `guide-projection-v1` and tabs, `VALID` validation, and exact registered Certification project URL/ref and non-authoritative provenance identifier.
2. Pointer/revision publication times precede the matched predecessor closure. Fingerprints are checked using the established canonical serialization/hash contracts, not a guessed JSON encoding.
3. Preserve the existing135 runtime authority: exact canonical published pointer/revision, registered project/provenance, contract, validation and hashes. Do not add a new native/import receipt prerequisite or an `INITIAL_FIXTURE` runtime exception. Inspect native/import receipt linkage as supporting forensic evidence where it exists. In tests, owner-provisioned initial synthetic Guide content is honestly identified in the **evidence manifest only**, with its exact initial pointer and payload recorded before the chronology and preserved unchanged. No fictitious runtime publication/import receipt is inserted. This proves synthetic continuity, not provenance of an unseen real legacy artifact.
4. No admitted callable path can advance or alter that closed target's Guide, metadata or setup authority. Prove actual ACLs and nested callers, and exercise closed-target authoring denial. Preserved Production wrappers must still reject Certification authority; dormant import functions must remain nonexecutable by runtime roles.
5. Before/after real annual activation, the selected Guide pointer, payload and public course presentation remain identical. A successor publication cannot substitute for them. Team metadata remains the exact predecessor's presentation, not the global/current roster's data.

**PROVEN for the declared local fixture:** the initial synthetic2026 Guide authority satisfies the retained-pointer contract through the first actual annual activation. **NOT PROVEN:** provenance of any unseen hosted/real legacy artifact. That distinction does not authorize inserting publication/import receipts, adding closure metadata, creating a new2026 runtime publication, rewriting old history or relaxing admission.

## Required predicates and privacy

Retain exact registered resource/database, deployment/release and READS context validation; current pointer integrity; same-resource COMMITTED annual transition; CLOSED Certification closure with matching epoch/generation/revision/watermark/fingerprint; closed predecessor lifecycle; complete Final canonical scorecards; exact target; and private-core non-executability by PUBLIC/anon/authenticated/service_role.

Guide must additionally preserve its exact publication pointer, domain/contract/tabs, validation and resource provenance as above. Missing or inconsistent authority returns unavailable/denied. It never rebinds to current data. No raw Guide contact directory, account/contact identifiers, financial facts, audit actors or imported source payload is added to the public History response. The server-only bundle is not a new browser data API.

The public History sanitizer and existing DTO remain unchanged. Internal resource IDs, installation receipts, ingress generations, private operation IDs, service context and private financial facts must not be introduced. Existing immutable database provenance is not a Google runtime authority.

## Authority/API effect and review limit

This implements the already-approved historical read through truthful closed-predecessor authority after the current pointer advances. It does **not** admit a current-target request for an old year, add a role, add write authority, relax the Production read boundary or enable Google. The new server-only operation/DTO is additive and preserves the existing browser History contract. No additional owner decision is established by source evidence at this point. Normal runtime review remains mandatory; no automatic approval denial is overridden.

Proposed error contract: preserve existing stale-context/resource/target/closed-authority denials from the Certification gateway and145; return a feature-local unavailable result for missing Guide publication (`GUIDE_PROJECTION_UNAVAILABLE`) and a distinct internal `CERTIFICATION_HISTORY_GUIDE_PROVENANCE_UNAVAILABLE` for absent/inconsistent retained provenance. The latter maps to the existing History unavailable response, without exposing internal IDs. Malformed payload remains input-invalid. No error creates actor authority, triggers a provider fallback, resets a participant session or changes scoring health.

## Required proof

1. Run the actual shipping History service before and after real annual activation, including ordinary and team-metadata requests. Compare sanitized domain DTOs and required course presentation.
2. Exercise real JS adapters, canonical RPCs and database reads with no Google credentials/network. The test must not choose a new helper alias in place of the shipping caller.
3. Prove missing Guide publication fails locally; a successor Guide never substitutes for predecessor Guide.
4. Deny wrong resource, unclosed target, unrelated year, stale context, missing lineage and unauthorized direct private-core calls. Preserve stale current-target denial.
5. Verify owner/ACL/search_path/security/pg_depend and Production wrapper equivalence for any extracted core.
6. Inspect public History, Guide and metadata DTOs for private resource/financial leakage; retain frozen2026 DTO compatibility.
7. Capture bounded exact-pointer plans and confirm no historical discovery scan or score-transaction work is introduced.
8. Retain actual pre-close publication/import/fixture provenance evidence separately from the annual certificate. Prove closed-target mutation denial and exact pointer/payload preservation. If this fails, keep shipping History NOT PROVEN; do not invent a receipt or widen annual authoring.

## Source anchors for implementation review

| Source | Evidence |
|---|---|
| `lib/history-2026-service.js:108` | Three required reader calls and feature-local Guide requirement |
| `lib/history-2026-supabase.js` / `lib/certification-read-adapters.js` | Fixed2026 alias currently chooses `READS.HISTORY_2026`; current Guide/leaderboard aliases are separate |
| `lib/history-team-metadata.js:50` | Exact player-ID merge and bounded captain/handicap inputs |
| `lib/history-2026-adapter.js:385` | Guide presentation fields actually used by History; scoring course rules still come from canonical scoring snapshots |
| Migration135 `canonical_projection_read_v1` / `canonical_guide_read_v1` | Current2026 admission, exact provenance, canonical course context and delivery fingerprint |
| Migration145 `certification_closed_tournament_read_v1` | Closed same-resource lineage and complete finalized scoring projection; no Guide support |
| Migration138 `certification_annual_predecessor_certificate_v1` | Closure fingerprint fields; no Guide or metadata binding |
| Migration139 `assert_guide_authoring_resource_v2`, publisher, Certification authoring gateway | Closed target denied; atomic native publication linkage; Certification gateway remains future-only |
| Migration082 Guide immutable triggers and final import revocations | Native publication provenance is immutable; legacy transport is retired |
| Migrations001/004 import ledger and projection definitions | Retained import/projection fields and ACLs; not evidence of a Guide closure pin |

No hosted, Production, Google-account or physical proof is implied. The actual shipping History service passes this scoped local predecessor-continuity proof; complete later-year chronology and its independent Odds/publication gates remain governed by the annual evidence.
