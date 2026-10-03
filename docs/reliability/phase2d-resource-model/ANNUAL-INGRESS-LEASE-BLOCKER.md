# Certification ingress lease contract — section 6 stop

> **Subsequent decision — 2026-09-30:** the owner approved the bounded Certification durable ingress lease/outcome lifecycle. The approval request below is resolved; the observations remain valid counterevidence at the preserved checkpoint. Implementation and new proof are in progress. Approval does not itself close any certification gate or authorize hosted work.

**Status: PARTIAL — annual transition implementation stopped at the owner's explicit prerequisite.**

The owner approved the Certification-origin annual closure extension. That approval resolves the earlier provenance decision in [ANNUAL-TRANSITION-BLOCKER.md](ANNUAL-TRANSITION-BLOCKER.md); it is not being requested again. The new issue is the required ingress evidence on which that closure must depend.

The approval states: **“If the current Certification ingress architecture lacks a required lease/control fact: STOP that portion and identify the exact missing contract.”** It also prohibits treating an empty lease table as proof. The source and bounded local database audit establish that this condition applies. No new closure/migration or runtime change was made during this extension audit. This is the owner's explicit stop condition, not a runtime auto-review rejection.

## Finding

**PROVEN — SOURCE:** the draft Certification path validates an admitted context, invokes one canonical operation RPC and records successful mutation audit. It has no durable ingress admission/write-start/outcome lifecycle. Its transaction-local context marker is removed before returning and rolls back with a failed transaction. A JavaScript `UNKNOWN` error is retained for the caller, but that alone is not durable admission/drain evidence.

**PROVEN — SOURCE:** the database does hold the shared scoring admission advisory transaction lock and resource/admission/pointer/gate row locks. That supplies real transaction exclusion. It does **not** establish the separately required request lease high-watermark, lease-set fingerprint, unresolved outcome state, or a generation-bound record for delayed/lost requests. No such equivalence is claimed. PostgreSQL documents that [transaction-level locks end with the transaction](https://www.postgresql.org/docs/17/explicit-locking.html).

| Required fact | Current implementation | Evidence |
|---|---|---|
| Durable admitted operation | Absent from Certification gateway; direct RPC dispatch | `lib/certification-runtime-server.js`, `certificationOperationRpc`; `lib/scoring-authority-supabase.js`, Certification branch |
| Admission generation bound to operation | Certification context carries admission revision and authority epoch, not the ingress gate's admission generation | Migration131, `assert_certification_context_v1` |
| Actual ingress protocol enforcement | Bootstrap leaves inherited `admission_protocol_enforced=false`; owner admission changes gate state and separate Certification revision only | Migration131, `initialize_certification_resource_v1` / `set_certification_admission_v1`; migration034 defaults |
| Active/write-started/unknown/terminal lease state | No Certification lease writer or completion/recovery operation | Migrations131–135; installed catalog reachability audit |
| Lease sequence/high-watermark/fingerprint | Existing annual helpers read `scoring_ingress_leases`; no Certification gateway populates it | Migration069, `annual_scoring_unresolved_count_v1`, `annual_scoring_lease_fingerprint_v1`, close/certificate functions |
| Durable audit | Successful non-idempotent operation audit exists; it is not a substitute for unresolved ingress lifecycle | Migration132, `execute_certification_operation_v1` |
| Database-only active transaction exclusion | Present; shared/exclusive admission locking | Migration131 context assertion/admission-setting functions |

The bootstrap's random inherited gate generation is a stored value, but no Certification request binds or uses it as a durable ingress generation. A context revision is not silently reinterpreted as that missing contract.

## Bounded local database counterevidence

**PROVEN — POSTGRESQL / RPC, 2026-09-30:** a fresh owned PostgreSQL 17 fixture installed the provisional 131–135 profile, registered synthetic Certification authority and enabled its admission. The actual context RPC returned Certification admission revision `2`; the installed ingress gate remained `admission_protocol_enforced=false`, admission revision `0`, with null enforcement timestamp/deployment. Its generated admission generation was absent from the returned context. A correctly bound `SCORING.SUBMIT_HOLE` gateway call reached canonical domain validation and returned `MATCH_NOT_FOUND` for an intentionally absent synthetic match. No score was written. This is admission-path counterevidence, not successful score or complete failure-injection proof.

The existing annual predecessor certificate returned `certified=false` with `PREDECESSOR_SCORING_CLOSE_CERTIFICATE_UNAVAILABLE`. The fixture contained zero leases before and after; those counts are **not drain proof**. The installed catalog contained 995 functions (994 application functions plus a local platform shim) and 204 triggers. A lexical graph of fully qualified calls reached 257 functions with no lease-writing function; it over-approximates explicit branches but does not itself establish dynamic SQL/trigger reachability. Source review of the adapters, gateway and relevant triggers supplies the complementary evidence. The 13 detected installed lease-writing functions belong to existing Production/legacy/annual control paths, not Certification ingress capture.

The [preserved machine-readable probe evidence](implementation-evidence/annual-ingress-counterevidence.json) records the observations, source hashes, raw-artifact hashes and limitations. The owned cluster was stopped and removed. No source or migration was changed and no hosted resource was contacted. The scratch probe initially misclassified `release_commit` as a lease field; that derived detector was corrected, raw output retained, and the correction explicitly recorded. Database observations did not change.

## Why the existing Production lease API cannot be selected unchanged

**PROVEN — SOURCE:** `begin_production_scoring_ingress_v2` requires exact Production cutover scope, `GOOGLE` authority and `GOOGLE_LEASE_ARMED` state. V3 further requires the legacy writer/provider capability. Those are historical provider semantics, not a provider-neutral Certification lease.

All installed direct ingress-lease INSERT implementations belong to that Production API family; completion/drain/recovery routines consume those lease contracts. Certification dispatch does not call them. Inherited domain triggers that inspect active leases do not create missing ingress history.

Calling that API with invented Production/Google state would violate the approved resource model. Treating no rows as a drained generation would violate section 6. Removing its predicates would violate Production equivalence. None was attempted.

## Exact additional contract proposed for review

This is a proposed bounded contract, **not implemented**. It would stay inside the Certification resource/control layer and reuse canonical domain operations. It is not a request to weaken Production predicates or introduce a new worker architecture.

1. **Admit durably before execution.** A private, separately admitted server/database operation records the exact registered resource, installation, current tournament/pointer, admission generation, epoch, actor, existing operation identity and request hash. Neither client JSON nor a flag creates that authority. The admission record has a real monotonic sequence.
2. **Bind execution to that admission.** The existing Certification mutation gateway requires its exact live lease, current generation, unchanged request hash and actor. It acquires the required locks, then rechecks close/expiry/revocation before any domain write. Missing or stale admission fails closed. Ordinary reads do not acquire write authority.
3. **Record the canonical outcome atomically.** A successful canonical mutation, required receipt/audit and its terminal admission outcome commit together. Domain rejection, transaction rollback, transport loss and timeout need explicit meanings. Loss/expiry alone must never mean `NOT_COMMITTED`.
4. **Resolve uncertain attempts safely.** Resolution uses the same operation identity and exact canonical receipt, with locking that prevents an old delayed execution after a proven-no-write resolution. Active/uncertain attempts remain drain blockers until authoritative resolution; no blind new mutation ID.
5. **Fence and capture real state.** Close serializes with admission/execution, closes the actual generation, captures its real high-watermark/fingerprint and active/unknown counts, and excludes later writes. Abort/reopen rotates or restores generation according to explicit CAS/retry rules; old capabilities cannot silently become current.
6. **Use class-specific provenance only.** Production keeps its existing legacy/provider lease and fence contract. Certification leases prohibit provider/Google provenance and cannot satisfy Production certificates or vice versa. Storage reuse versus a minimal private Certification ledger must be selected to preserve these invariants and tested; no generic tenant or client resource selector.

The outstanding decisions are durable transaction ordering, terminal/unknown resolution semantics, stale lease behavior, and the exact resource/generation binding consumed by the annual certificate. Those cannot be replaced with zeros or inferred from locks after the fact.

Required proof after approval includes real nonempty leases, interrupted requests, lost acknowledgements, timeout/rollback, delayed writes, stale generations, close/execute and abort/activation races, cross-resource evidence rejection, and unchanged Production positive/negative behavior. Only then can the already-approved Certification-origin closure and shared annual transitions proceed.

## Current disposition

The new annual origin/closure implementation, final bootstrap manifest, transition certificate and dependent certification remain stopped. The original implementation draft remains uncommitted and disabled for hosted selection. Historical migrations, Production fences, provider requirements and existing evidence are preserved.

Read-only root-cause work on the already-authorized gaps is recorded in [REMAINING-GAPS-ROOT-CAUSE.md](REMAINING-GAPS-ROOT-CAUSE.md). Fixes remain deferred under the owner's section 27 ordering until the annual transition authority contract passes.

**Next owner action:** review and approve or revise the bounded Certification ingress lease lifecycle above. This is the one missing prerequisite; the Certification-origin closure approval remains in force.
