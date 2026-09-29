# Independent final source and evidence review

Reviewed: 2026-09-29T20:34:44.544404+00:00

**Assessment:** no additional blocking correctness or security defect was found in the reviewed source. This is an independent SOURCE review plus verification of named retained runtime receipts; it is not a new test run or overall Phase 2C PASS. Final performance/package gates remain pending.

## Scope and exact identity

Base: `b1ceaa89f2d7cd0cdf2835aba04a24aca442ca18`. Worktree: `/Users/claybeltran/.codex/worktrees/reliability-phase2-score-path/BaggerInv`. All 17 reviewed shipping/operational source hashes are in the companion JSON. No PostgreSQL, network, provider, deployment or competitive-data action occurred during this review.

| Migration | SHA256 |

|---|---|

| 202609280122_score_mutation_recovery_v1.sql | `122080a69e1045c4e189e4cd14752edacd5684f4298183c0524f0bd528a696ce` |

| 202609280123_annual_worker_sql_and_net_skins_locks_v1.sql | `4159acdfa22d5cd6699cfe2d4c985261ffbf41f3fbf6087d4eeed5a4aec3bee0` |

| 202609280124_score_derived_delivery_v1.sql | `69821b9d98a585c0545e9b5e68968fa7c1a0cebf12e0ba9699c4590f5763bc48` |

## Competitive semantics and source scope

**SOURCE INSPECTED:** migration122 changes the two canonical score functions only at required receipt insertion, adding the already validated Auth UUID. Gross/strokes/net/winner/state calculations, expected revisions, write admission, locking and submit DTO remain unchanged. The read-only recovery endpoint never submits a mutation, changes permission, reopens a match, or declares NOT_COMMITTED from absence. Legacy/unbound/other-owner receipts remain indistinguishable UNKNOWN.

**SOURCE INSPECTED:** migration123 corrects 14 exact effective LEAST/GREATEST bodies, the local annual Intelligence name collision, bounded Net round ordering, the exact inherited writer constraint and exact sixth authorship trigger manifest. It does not delete the security trigger or alter financial formulas. Migration124 changes delivery policy, current-source materialization and worker lock ordering; it does not install canonical score-table triggers or edit scoring/control bodies. Supported derived calculators are reused unchanged. Intelligence re-reads canonical input after claim so a prior calculation cannot acknowledge newly materialized demand.

**Current retained SQL/integration evidence:** canonical31, full-sequence1 (432 holes /24Finalizations), recovery50, annual26, protected annual2, delivery54, deadlock10, Net-owner20, Calcutta10, family-order5 and failure-order16 wrappers all match their captured current dependency closures and raw TAP digests. These are overlapping proof families, not a summed independent-test total. The full-sequence supports unchanged golf behavior; it does not replace physical or hosted proof.

**Native boundary:** no tracked or untracked shipping native/Swift path differs from the base. Only separate test/decoder fixtures exist. Build11 navigation/timestamp behavior remains outside this candidate.

## Security and ownership

**SOURCE INSPECTED with separate current negative runtime cases:** recovery requires current verified identity plus exact tournament/match/HOLE_SCORE receipt/player/Auth ownership. Input is two allowlisted bounded identifiers, response is non-cacheable, and other-owner/missing/legacy outcomes reveal no receipt existence. Mobile admission is checked before and after read. Rate limiting is a local request control, not a claimed distributed capacity boundary.

New private helpers, ledger and sequence are revoked from API roles, including service_role where appropriate; ledger RLS is enabled. Public server entrypoints are service-only. Annual targets stay private behind the existing dispatcher; future worker scope additionally enforces workers_enabled and WORKERS phase. Owner requeue requires actual Director authorization, exact cycle/attempt/generation/source and idempotent recovery-request identity. No participant table-write shortcut or service-role credential distribution is introduced.

Optional telemetry may fail without becoming canonical authority. Required receipts and durable worker attempt records remain transactional. Financial approval/publication and Odds publication remain owner decisions; Net Skins demand may materialize automatically but its financial processor is not in the automatic runner family list.

## Lock and query conclusions

Calcutta uses intent→current→job for claims and current→job for completion/failure. Net materialization locks rounds1→2→3; owner completion locks Storylines before config/job, and a missing marker gets the exact eventual demand under the same transaction. Invalid source/lease/generation paths roll that provisional demand back. Competition/Intelligence marker ordering matches existing control triggers across claim, expiry and failure paths. Preclaim SKIP LOCKED remains unchanged with retained counterevidence.

The future Competition expiry domain is exact target plus current generation, ordered by round and engine; supported writers create five round0 keys, but the schema permits additional keys. No universal five-row bound or arbitrary privileged-writer deadlock immunity follows.

Five nonunique indexes are justified by applicable retained plans; three optional indexes were removed. Empty/current-small and delayed-Competition counterexamples remain explicit. Exact-work attempt retrieval is a proposed privileged forensic query, not a shipped worker or scoring hot path. New score/eligible/recovery plans await the current final benchmark.

## Deployment and rollback caveats

**HIGH future deployment risk until separately reviewed hosted proof.** All three migrations are transactional and reject existing annual certificates. Clean/fresh-certificate local execution is not proof of an in-place certified hosted upgrade. Install122→123→124 with source-bound manifest sequencing and no certificate deletion. Ordinary indexes may lock/build over existing data; no hosted duration, WAL or write-amplification claim is supported.

No explicit historical backfill runs. Old receipt origins stay NULL; queues acquire constant metadata defaults; the new event ledger starts empty. After candidate traffic, application rollback alone does not undo worker policy. Retain origin/event/pending-intent evidence and use compatible forward correction or an exact reviewed function package. Reverting123 restores known SQL/lock/manifest defects; restoring the obsolete false-only CHECK may reject now-valid certified rows.

Actual local process pickup/restart/crash/backlog proof does not install a hosted supervisor. Hosted credentials, cold start, alerts, capacity, restoration, physical clients and 2027 rehearsal remain later gates. Staging and Production require separate owner authorization.

## Requested-section disposition

This review addresses source/security/semantic boundaries in §§6,15,64–65,78,81,122,135–136,167,169,201–202,209,221,247,251,267–268 and286, and preserves the prior §§107–314 gap review. It closes no higher-layer P0 from source inspection. The worker-history plan gate applicability mismatch is an evidence validator defect (plans intentionally collected only at1×/10×, extras only none), not a missing runtime query; its reviewed narrow correction remains coordinated by the parent.
