# Score failure and retry semantics

These are engineering mappings and future client inputs, not Build 11 implementation. Existing public responses remain unchanged. Internal Phase 1 telemetry distinguishes SQLSTATE 57014 from authorization or feature availability.

| Domain | Observed/example code | Canonical implication | Safe next action |
|---|---|---|---|
| AUTH_INVALID | Invalid/unconfirmed identity | Request denied before authorized mutation | Reauthenticate; do not invent replacement mutation |
| AUTHORIZATION_DENIED | UNAUTHORIZED / permission stale | This request denied; earlier attempt may still have committed | Resolve original identity/receipt with supported authority; no auth weakening |
| MATCH_LOCKED / final lifecycle | Existing locked/Final checks | New write denied | Owner-controlled lifecycle decision; keep gross locally |
| STALE_CONTEXT / revision | MATCH_REVISION_CONFLICT / HOLE_REVISION_CONFLICT | Rejected stale attempt | Refresh current canonical authority; compare gross before same-ID retry |
| INVALID_SCORE | Invalid hole/gross/cardinality | Rejected | Correct draft input; intentional changes need explicit reviewed identity semantics |
| CONFLICT | IDEMPOTENCY_CONFLICT | Existing mutation's meaning cannot be reused | Stop; review canonical result, never blind retry with a new ID |
| DATABASE_TIMEOUT | PostgreSQL 57014 | Pre-commit SQL transaction aborted when this response is authoritative; a lost transport response is still ambiguous | Check original status; reuse mutation only after reconciliation |
| DATABASE_UNAVAILABLE | Connection class 08 / shutdown 57P01 | Before/during/after commit cannot be inferred from HTTP class | UNKNOWN; preserve original ID and local gross |
| UNKNOWN_OUTCOME | Lost response/in-flight receipt absent | May be committed | Exact receipt/current score status, do not submit an independent new mutation |
| INTERNAL_ERROR | Other SQL/application exception | SQL transaction atomicity protects partial write; transport outcome may be unknown | Record correlation/mutation, resolve then retry only same operation |
| Derived retry/dead letter | Intent SQLSTATE/attempt | Score remains Official; financial/projection work delayed | Fresh supported worker operation; escalate persistent failure. No automatic repair of financial facts |

**PROVEN:** SQL rollback, exact readback, typed 57014, and optional JavaScript telemetry failure containment in their tested layers. **UNKNOWN:** hosted HTTP response serialization/drop and a shipping authorized status endpoint after permissions change. “Your Official score is safe” is appropriate only after canonical evidence, not merely because the client saw an exception.

A future physical-card recovery tool must compare each hole to canonical gross: matching skip, missing eligible to submit through canonical RPC, differing Official explicit correction review. Any bounded batch preserves per-hole mutation/audit/server calculations. No direct score-table API is introduced.

IDs belong in structured logs/traces, not metric labels. Route/domain/outcome/SQLSTATE family are bounded metric dimensions. Telemetry exports remain optional; canonical mutation/history/audit/Google outbox and new durable intent inserts remain transactional and may correctly abort when persistence fails.
