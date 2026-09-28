# Idempotency and unknown outcomes

**Evidence boundary:** all runtime results below are isolated local PostgreSQL17 or local application tests. No Production query, deployment, real competitive mutation or physical-device test occurred. PASS applies only to the named fixture/layer. Recommendations are not implemented facts.

**Canonical SQL idempotency protections PASS in tested scope. End-to-end unknown-outcome recovery PARTIAL.** See [formal contract](SCORE-IDEMPOTENCY.md).

| Test family | Outcome |
|---|---|
|Same ID/same payload sequential/concurrent | Stored ACCEPTED receipt; one canonical mutation |
|Same ID/different payload | IDEMPOTENCY_CONFLICT, no overwrite |
|New ID/same Official/current revisions | NO_CHANGE; no new receipt; bounded canonical readback required |
|New ID/different Official/stale revisions | Explicit revision conflict |
|New ID/different Official/current revisions | Existing audited correction; before/after history retained |
|Lost connection before COMMIT | Complete rollback after backend termination; same-ID retry accepted |
|Lost connection after COMMIT | Exact receipt resolves COMMITTED; same-ID retry returns stored outcome |
|Timeout57014 precommit | Rollback; receipt absent after confirmed termination; safe same-ID retry |
|Receipt absent while original still running | UNKNOWN until outcome/termination is known |
|Committed score then permission revoked by Lock | Trusted exact receipt exists, participant replay denied |

The last row is **P2-RECOVERY-001**, not a successful participant recovery certificate. SQL resolves via indexed `(match_id,mutation_key)` and `(match_id,hole)`; no supported public status endpoint was added because its authorization/NO_CHANGE/in-flight semantics require compatibility review. Returning a receipt before authenticating or allowing revoked users to mutate would weaken security and was not used.

Required status semantics: COMMITTED only when exact authenticated mutation/operation receipt evidence proves that mutation committed. Matching current gross alone means CANONICAL_MATCH or ALREADY_OFFICIAL; it cannot attribute a different client's score to the original mutation. NOT_COMMITTED only after the original transaction cannot still commit; UNKNOWN when in-flight/transport state is unresolved. An absent receipt alone is insufficient. Retry only the same mutation with unchanged semantic payload and correctly refreshed admission revisions as permitted. Request correlation identity remains distinct from mutation identity.

Unproven injection layers: actual HTTP response serialization failure, proxy post-commit timeout, physical client lost-ack workflow, hosted receipt read authority after revocation. They are not silently substituted by backend termination tests. [Machine failure matrix](failure-injection-results.json) retains exact points and assertions.
