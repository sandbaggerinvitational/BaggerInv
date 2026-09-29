# Net Skins lock-order correction

**CURRENT CANDIDATE — PROVEN in local PostgreSQL:** [deadlock.json](evidence/deadlock.json) records 10/10 passing Node tests, zero failures, on migration124 `69821b9d98a585c0545e9b5e68968fa7c1a0cebf12e0ba9699c4590f5763bc48`, completed 2026-09-29T20:18:28.644Z. The shared artifact validator verified the original capture-time dependency closure, raw output hash and current installed migration/source identities before this report refresh. This proves the stated runtime branches only. No Production, hosted or physical proof is implied.

## Historical mechanism

Two worker transactions materialized different rounds and retained their round advisory locks. Each subsequent flush requested the other round. One owned R1 and waited for R2; the other owned R2 and waited for R1. PostgreSQL reported 40P01. The old flush retained a RETRYABLE intent, but the Phase2 reproduction needed manual clock advancement and a later explicit flush. That was not autonomous recovery. [Before evidence](evidence/before-migration.json), `P2-MIG-SKINS-DEADLOCK`, preserves the reciprocal wait graph and SQLSTATE.

This was worker-to-worker lock inversion. Canonical scores already append per-match intents and do not acquire the derived-round keys. A score isolation PASS could not substitute for a worker concurrency test.

## Candidate lock discipline

Migration 123 makes `flush_score_derived_intents_v1` acquire all three existing Net Skins enqueue keys in R1→R2→R3 order before selecting or locking an intent. The prefix applies only to NET_SKINS, is scoped to its tournament, and includes the runtime generation for annual targets. Migration 124 preserves the prefix.

Sorting a single batch is insufficient: another flush in the same transaction can request an earlier round while retaining a later key. Acquiring the complete bounded three-round set first prevents that inversion across repeated calls. Commit or rollback releases the locks.

This deliberately serializes short Net Skins materialization/claim transactions for one tournament/generation. It does not serialize canonical score transactions, other derived families, other tournaments or external calculator execution. No scoring rule, membership, calculator or publication policy changes.

## Executed matrix

- The exact opposite-round repeated-flush schedule now produces one-way waiting. The captured graph has one waiter and no reciprocal dependency; all four intents complete.
- Forty deterministic batches use three workers each: R1/R2, R2/R3, R1/R3, all three rounds and same-round work. Start order alternates by recorded iteration. Zero 40P01 occurred, every expected intent materialized and current job fingerprints equal serial execution.
- Canonical scoring commits under a1000 ms statement budget while another transaction holds all three Net Skins keys. Workers use5000 ms statements.

The fixture uses synthetic current authority and local PostgreSQL 17. These are application/database lock-behavior results, not Production contention frequency or provider-capacity measurements. Actual three-round calculation parity is now part of this suite; official publication remains outside its scope.

## Residual deadlocks and autonomous recovery

The ordered prefix prevents this known cycle. It does not replace bounded failure handling. Migration 124 and the delivery suite separately establish persisted attempts, SQLSTATE classification, backoff, lease recovery and terminal escalation. Autonomous financial/calculation retry applies only to the already-authorized Calcutta, Competition and Intelligence families. Net Skins intents can be materialized and retried automatically, but financial calculation still requires an explicit owner action; a generic40P01 retry test is not proof of automatic Net Skins financial processing. A RETRYABLE row alone is not a liveness proof. P0-D's overall disposition must reference both this lock matrix and final delivery evidence for any residual 40P01; this document closes neither unrelated lock-order risks nor hosted worker scheduling.

## Composition and rollback

The private signature and response shape remain unchanged. Post123 flush source hash: `658d7c0d742ea872fe7330f7593d3f58a7623bf64916df3b20174c2e312e625e`. Migration 124 checks this hash before extending delivery. Restoring the pre-123 body alone would invalidate 124 assumptions and restore the known cycle. Future changes must retain the prefix or prove a safe replacement.

The linked current test used123 SHA256 `4159acdfa22d5cd6699cfe2d4c985261ffbf41f3fbf6087d4eeed5a4aec3bee0` and124 SHA256 `69821b9d98a585c0545e9b5e68968fa7c1a0cebf12e0ba9699c4590f5763bc48`. No Production database, real side game or external provider was accessed.

## Actual financial parity and stale workers

`P2C-D-FINANCIAL` clones identical synthetic authorities, commits the same canonical score/correction for R1/R2/R3, then compares serial materialization against three concurrent workers. An explicit owner-requested public claim → unchanged full-net JavaScript calculator → public completion sequence processes all three rounds in each copy. Current result fingerprints, complete payloads and revisions match exactly. Claims/completions replay idempotently; exactly three new PROVISIONAL results appear in each copy. Existing result payloads, configuration and explicit membership remain immutable. No public financial publication occurs, and participant reads withhold provisional financial payloads.

`P2C-D-STALE-CURRENT` runs eight additional schedules with alternating start order. Actual old Net Skins completions are either stale-but-running or already SUPERSEDED while a current intent materializes. Every old completion is denied by its existing source/lease guard; no old job writes a result, the current job retains the canonical fingerprint and no40P01 occurs. This complements the forty mixed-round batches; it is not a replacement for them.

The parent delivery tests additionally discovered a different control-versus-worker cycle: the original all-family tick retained Net Skins and Calcutta/Competition locks in an order that could oppose supported Lock/Resume operations. Migration124 now materializes exactly one family per RPC transaction; the adapter commits three sequential family calls and preserves partial progress on cancellation. Intelligence prefix ordering matches its inherited bounded engine order. Those separate before/after lock graphs and full-round controls belong to `worker-lock-order.json` and `full-sequence.json`, not to a blanket claim that the three-round prefix solves every lock pattern.
