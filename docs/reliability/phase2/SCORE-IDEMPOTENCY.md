# Score idempotency contract

**PROVEN — SOURCE / POSTGRESQL / CONCURRENCY**, within the isolated 2026 synthetic runtime. The candidate does not replace `submit_production_hole_score`, its payload hash, permission checks or receipt key.

The identity is `(match_id, mutation_key)`, not a request/correlation ID. Its payload hash binds match, hole, gross input and actor; revisions are admission preconditions. The match row lock serializes contenders before exact receipt lookup. Receipt and canonical state commit in the same transaction. Each HTTP attempt can have its own correlation ID while preserving mutation identity.

| Attempt | Actual contract |
|---|---|
| Same ID, same payload, current authorized permission | Stored ACCEPTED receipt with `idempotent=true`; no additional hole/revision/audit mutation |
| Same ID, different payload | `IDEMPOTENCY_CONFLICT`; existing score preserved |
| New ID, matching Official gross, current revisions | `NO_CHANGE`; no new mutation receipt. Canonical score readback is required; absence of this new ID does not mean the hole is absent |
| New ID, differing gross, stale revision | Explicit revision conflict; no overwrite |
| New ID, differing gross, current revisions | Existing supported **audited correction**. This is not a new Phase 2 capability or silent stale overwrite |
| Concurrent adjacent holes using one old match revision | One admission wins, other conflicts; refresh revisions and retry original unsuccessful mutation with unchanged gross/identity |
| Lost response after commit | Exact stored receipt resolves COMMITTED; same-ID replay works while authority remains valid |
| Interrupted transaction before commit | Rollback leaves no receipt/score; once original backend has terminated, bounded readback and same-ID retry are safe |
| Receipt absent while original transaction remains in flight | **UNKNOWN**. Absence alone never proves NOT_COMMITTED |
| Replay after Lock/Finalize/revocation | Permission validation occurs before receipt lookup and can deny replay. Trusted database readback sees receipt; shipping participant recovery is **NOT PROVEN / unresolved P0** |

The SQL tests resolve canonical state through exact indexed match/mutation and match/hole reads. That is not a new public status endpoint. Returning historical receipts before authentication or relaxing revoked access was rejected as an unsafe shortcut. A separately reviewed, non-mutating status contract must preserve caller isolation, fence in-flight attempts and distinguish a receipt from NO_CHANGE.

Tests and machine results: [idempotency evidence](IDEMPOTENCY.md), [candidate score proof](evidence/score-proof-after.json). Physical clients, hosted identity, HTTP proxy timeout and response serialization are separate missing proof layers.
