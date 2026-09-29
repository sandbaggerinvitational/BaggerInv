# Recovery after score-access revocation

## Current proof snapshot

Generated 2026-09-29T21:40:11.927846+00:00. These labels apply only to the selected current-source artifacts. They do not close the overall phase or approve deployment. Pending/stale receipts remain NOT PROVEN.

| Proof | Current artifact validation | Scope |
|---|---|---|
| Recovery50 and current candidate DTOs | PROVEN_LOCAL | Real local SQL/API; injected provider identity/transport |
| Retained Swift24 decoder checks | PROVEN_LOCAL | macOS models; UTC; no native HTTP/queue/UI |
| 1×/2×/5×/10× after supported Lock | PROVEN_LOCAL | Local indexed receipt lookup; not Production capacity |

Detailed validation reasons are retained in the review package [recovery scope review](evidence/recovery-scope-review.json); final checked-in reports must link the corresponding durable execution artifacts.

## Current proof snapshot

Generated 2026-09-29T20:53:14.987845+00:00. These labels apply only to the selected current-source artifacts. They do not close the overall phase or approve deployment. Pending/stale receipts remain NOT PROVEN.

| Proof | Current artifact validation | Scope |
|---|---|---|
| Recovery50 and current candidate DTOs | PROVEN_LOCAL | Real local SQL/API; injected provider identity/transport |
| Retained Swift24 decoder checks | PROVEN_LOCAL | macOS models; UTC; no native HTTP/queue/UI |
| 1×/2×/5×/10× after supported Lock | PROVEN_LOCAL | Local indexed receipt lookup; not Production capacity |

Detailed validation reasons are retained in the review package [recovery scope review](evidence/recovery-scope-review.json); final checked-in reports must link the corresponding durable execution artifacts.

The implementation authority is [Score mutation recovery v1](SCORE-MUTATION-RECOVERY-CONTRACT.md). This document distinguishes the implemented contract from its recorded proof. Current executed counts, candidate migration hashes and failure details are authoritative in [recovery execution](evidence/recovery.json), [behavioral details](evidence/recovery-proof.json) and [actual 121 upgrade](evidence/recovery-upgrade-proof.json). Do not substitute an older passing run for the final composed candidate.

| State | Original score-submit RPC | Read-only mutation-status contract |
|---|---|---|
| Current verified identity and Live scoring permission | Existing write/idempotency semantics | Exact owned accepted receipt → COMMITTED |
| Current verified identity; match Locked/Final or whole round Locked; scoring permission revoked | Existing permission/lifecycle checks still deny illegal writes and submit replay | Exact owned accepted receipt → COMMITTED |
| Unverified/deleted Auth account, revoked link/role/membership | Denied | Denied; receipt is not disclosed |
| Valid identity; absent/inflight/legacy-unbound/foreign mutation | Existing submit semantics if authorized | UNKNOWN; never inferred NOT_COMMITTED |
| Valid identity; accepted original followed by legitimate correction | Existing revision-aware correction rules | Each mutation resolves its own immutable acknowledgement |
| A replacement account is validly linked to the same golfer | Existing current-account admission | Replacement account cannot claim the prior account's receipt; its own later receipt is distinct |

SOURCE INSPECTED:122 captures the validated Auth UUID atomically only for a newly accepted HOLE_SCORE receipt. Recovery checks that immutable origin together with actor, match and tournament, after current identity/runtime checks. It does not re-grant scoring access, acquire the match write lock, derive ownership from present-day account linkage, or infer an accepted mutation from matching gross scores. The SQL query is an exact receipt lookup joined to exact match authority.

## Runtime proof map

The following are actual test identities, not substitute proof from source inspection. Their final result must be read from the execution artifacts above.

| Capability | Actual local proof |
|---|---|
| Ownership and account lifecycle | ORIGIN; SPOOF; ENUMERATION; REASSIGNED; identity/link/role/membership denial variants; DELETED |
| Lock/Finalize recovery in all formats | LOCK-BB/SC/SI; FINAL-BB/SC/SI; three hundred repeated reads compare full canonical state |
| Whole-round Lock | ROUND-LOCK invokes the existing round RPC, checks all 12 matches/access, recovers the owned receipt and verifies new score denial |
| Held match write lock | NO-WRITE-LOCK holds the lock on an independent connection; a competing writer gets55P03 both before and after successful read-only recovery |
| Correction semantics | CORRECTION loses the correction acknowledgement after actual commit and resolves both original and corrected revisions distinctly |
| Inflight/rollback | INFLIGHT observes UNKNOWN before commit, COMMITTED afterward, and UNKNOWN after rollback; there is no false terminal failure claim |
| Lost response/process restart | PROCESS-RESTART commits through the shipping PWA adapter in child A, exits 77 without acknowledging, then uses fresh child B's actual handler/RPC after Lock |
| Additive migration | UPGRADE commits a real receipt on 121, installs122–124, compares exact prior receipt/result hashes, leaves legacy origin NULL/UNKNOWN, and recovers a new bound receipt after Lock |
| Read-only/error behavior | READONLY, TIMEOUT, actual ACL executions, safe telemetry, and sink-failure tests |

## Format-specific edge cases (§§280–285,299)

Best Ball retains the complete two-golfer gross/stroke arrays per side; Scramble uses the installed single team-gross contract. Final-hole loss is exercised before actual Finalize in all three formats. Halved 18-hole matches retain 1.5/1.5 points. Recovery never recomputes those results.

Singles can clinch at Hole 10 with 10&8; the Best Ball/Scramble Nassau fixtures are correctly 10 UP and unclinched at that point. The first expanded EARLY test incorrectly expected all formats to clinch; that failing artifact is retained, and only the test expectation was corrected. Shipping golf rules were not changed. All formats still require the installed completion rules for Finalize.

## Deliberate boundaries

The principal 2026 fixture substitutes its initial prepared/Live/runtime boundary and uses synthetic verified Auth rows; actual actor, score, receipt, control and recovery SQL execute. The separate [protected annual proof](RELEASE-COMPATIBILITY.md) exercises genuine annual assertions, accepted 2099 scoring, Lock, owned recovery, compatible release and explicit cross-timezone tournament selection. Neither is hosted Supabase Auth, a browser/native UX flow, Production or a physical iPhone.

Current account and runtime read admission remain mandatory. Archived/post-close identity retrieval is not newly authorized. A COMMITTED response resolves the original mutation; clients must separately read current score authority before displaying a newer correction or attempting another revision. Existing PWA/native interfaces do not automatically adopt this new endpoint.

## Separate recovery performance prerequisite

The candidate benchmark must submit an owned accepted mutation, invoke supported SCORING_LOCK, verify canonical LIVE+locked and zero active permissions, then time read-only COMMITTED lookups at1×/2×/5×/10×. Every timed result and unchanged revoked authority are checked. A prior active-Live receipt benchmark does not satisfy post-revocation timing. Finalize-state timing is not measured separately. Use the current proof snapshot above: this dimension remains NOT PROVEN until the benchmark passes with matching tool/fixture/migration provenance.

## Separate recovery performance prerequisite

The candidate benchmark must submit an owned accepted mutation, invoke supported SCORING_LOCK, verify canonical LIVE+locked and zero active permissions, then time read-only COMMITTED lookups at1×/2×/5×/10×. Every timed result and unchanged revoked authority are checked. A prior active-Live receipt benchmark does not satisfy post-revocation timing. Finalize-state timing is not measured separately. Use the current proof snapshot above: this dimension remains NOT PROVEN until the benchmark passes with matching tool/fixture/migration provenance.
