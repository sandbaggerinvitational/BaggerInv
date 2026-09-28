# Incident runbooks — safe action cards

**Audit boundary:** historical evidence and source review only. No Production/staging requests, mutations, builds, deployments or source changes in this audit. Proposed designs are not implemented or approved release evidence. Unknown measurements remain unknown.

**Status:** DOCUMENTED. Proposed dashboard/status controls must be implemented and owner-rehearsed before use. Existing Build10/PWA actions remain subject to canonical authority. No procedure authorizes invented scores or guard bypass.

## RUNBOOK-001 — Tournament Day

- **Prerequisites:** System healthy / approved roster
- **Safe Actions:** Use Director current round and exact published authority
- **Dangerous Actions:** No routine SQL/Terminal/Codex
- **Stop Conditions:** NO-GO on missing P0 proof
- **Fallback:** Physical cards
- **Escalation:** P0 scoring/authority outage to engineering/provider; feature-only incident queued without stopping golf
- **Recovery:** Bounded authoritative readback and capability stability window
- **Post Condition:** Receipt/readback matches expected state; unresolved items remain visible
- **Evidence Required:** Operation ID, timestamps, exact scope, canonical before/after and physical observation if relevant

## RUNBOOK-002 — Round GO

- **Prerequisites:** Round closed
- **Safe Actions:** Run proposed GO Check; verify canonical pairings, READY, HI, course/tee, health
- **Dangerous Actions:** Do not interpret green PWA HTML as healthy DB
- **Stop Conditions:** Any mismatch/stale health
- **Fallback:** Keep round closed
- **Escalation:** P0 scoring/authority outage to engineering/provider; feature-only incident queued without stopping golf
- **Recovery:** Bounded authoritative readback and capability stability window
- **Post Condition:** Receipt/readback matches expected state; unresolved items remain visible
- **Evidence Required:** Operation ID, timestamps, exact scope, canonical before/after and physical observation if relevant

## RUNBOOK-003 — Round Closeout

- **Prerequisites:** Golf completed
- **Safe Actions:** Run proposed Closeout; inspect missing Official holes/results/access
- **Dangerous Actions:** Do not finalize incomplete/conflicting card
- **Stop Conditions:** Missing golf or unknown mutation
- **Fallback:** Recover exact physical card
- **Escalation:** P0 scoring/authority outage to engineering/provider; feature-only incident queued without stopping golf
- **Recovery:** Bounded authoritative readback and capability stability window
- **Post Condition:** Receipt/readback matches expected state; unresolved items remain visible
- **Evidence Required:** Operation ID, timestamps, exact scope, canonical before/after and physical observation if relevant

## RUNBOOK-004 — Database Degraded / I/O Warning

- **Prerequisites:** Warning or correlated 5xx
- **Safe Actions:** Read small health snapshot and provider metrics; pause optional work
- **Dangerous Actions:** No history scans, retry storms or compute changes without plan
- **Stop Conditions:** Persistently unreliable authority
- **Fallback:** Continue golf on physical cards
- **Escalation:** P0 scoring/authority outage to engineering/provider; feature-only incident queued without stopping golf
- **Recovery:** Bounded authoritative readback and capability stability window
- **Post Condition:** Receipt/readback matches expected state; unresolved items remain visible
- **Evidence Required:** Operation ID, timestamps, exact scope, canonical before/after and physical observation if relevant

## RUNBOOK-005 — Score Write Failure / 500 / Timeout

- **Prerequisites:** Save failed or unknown
- **Safe Actions:** Preserve gross values and mutation ID; read exact hole/receipt
- **Dangerous Actions:** Do not type Official hole anew or use new ID
- **Stop Conditions:** Mismatch/unknown unresolved
- **Fallback:** Physical card; PWA only when its shared backend scoring authority is healthy
- **Escalation:** P0 scoring/authority outage to engineering/provider; feature-only incident queued without stopping golf
- **Recovery:** Bounded authoritative readback and capability stability window
- **Post Condition:** Receipt/readback matches expected state; unresolved items remain visible
- **Evidence Required:** Operation ID, timestamps, exact scope, canonical before/after and physical observation if relevant

## RUNBOOK-006 — Unknown Outcome

- **Prerequisites:** Response lost
- **Safe Actions:** Check same operation receipt; if committed show readback; if not committed retry same authorized key
- **Dangerous Actions:** Do not create second independent request
- **Stop Conditions:** Partial or unresolved canonical state
- **Fallback:** Pause operation; capture card for scoring
- **Escalation:** P0 scoring/authority outage to engineering/provider; feature-only incident queued without stopping golf
- **Recovery:** Bounded authoritative readback and capability stability window
- **Post Condition:** Receipt/readback matches expected state; unresolved items remain visible
- **Evidence Required:** Operation ID, timestamps, exact scope, canonical before/after and physical observation if relevant

## RUNBOOK-007 — Native Needs Review / Today Reset

- **Prerequisites:** Native unavailable, server safe
- **Safe Actions:** Read canonical state; use accepted PWA after matching-hole check; Build10 full termination may recover matching intent
- **Dangerous Actions:** No queue deletion/signout-as-cleanup/false reassurance
- **Stop Conditions:** Unsent intent or conflict
- **Fallback:** Physical card
- **Escalation:** P0 scoring/authority outage to engineering/provider; feature-only incident queued without stopping golf
- **Recovery:** Bounded authoritative readback and capability stability window
- **Post Condition:** Receipt/readback matches expected state; unresolved items remain visible
- **Evidence Required:** Operation ID, timestamps, exact scope, canonical before/after and physical observation if relevant

## RUNBOOK-008 — PWA Unavailable

- **Prerequisites:** PWA route fails
- **Safe Actions:** Check direct supported route and authority; reload/new tab without clearing auth
- **Dangerous Actions:** Do not erase Safari website data by default
- **Stop Conditions:** PWA/backend unavailable
- **Fallback:** Physical card
- **Escalation:** P0 scoring/authority outage to engineering/provider; feature-only incident queued without stopping golf
- **Recovery:** Bounded authoritative readback and capability stability window
- **Post Condition:** Receipt/readback matches expected state; unresolved items remain visible
- **Evidence Required:** Operation ID, timestamps, exact scope, canonical before/after and physical observation if relevant

## RUNBOOK-009 — Round Open Failure / Partial

- **Prerequisites:** Open response unknown
- **Safe Actions:** Check exact ID/current matches/access; preserve original request
- **Dangerous Actions:** No second whole-round Open; partial state is red
- **Stop Conditions:** Partial/unknown/stale fingerprint
- **Fallback:** Round remains closed until supported reconciliation
- **Escalation:** P0 scoring/authority outage to engineering/provider; feature-only incident queued without stopping golf
- **Recovery:** Bounded authoritative readback and capability stability window
- **Post Condition:** Receipt/readback matches expected state; unresolved items remain visible
- **Evidence Required:** Operation ID, timestamps, exact scope, canonical before/after and physical observation if relevant

## RUNBOOK-010 — Round Preparation Failure

- **Prerequisites:** Paired but not READY
- **Safe Actions:** Verify prepared context pointers and dependency blockers; proposed Prepare round must self-certify
- **Dangerous Actions:** Do not confuse pairings with preparation or weaken guards
- **Stop Conditions:** Incomplete context/dependency incompatible
- **Fallback:** Keep scoring closed
- **Escalation:** P0 scoring/authority outage to engineering/provider; feature-only incident queued without stopping golf
- **Recovery:** Bounded authoritative readback and capability stability window
- **Post Condition:** Receipt/readback matches expected state; unresolved items remain visible
- **Evidence Required:** Operation ID, timestamps, exact scope, canonical before/after and physical observation if relevant

## RUNBOOK-011 — Net Skins Unavailable / Blocking

- **Prerequisites:** Configured/current mismatch
- **Safe Actions:** Inspect config/job/result/publication and exact round; preserve prior round history
- **Dangerous Actions:** Do not reset membership or process to guess
- **Stop Conditions:** Incompatible inputs or unknown job
- **Fallback:** Delay side game; scoring continues if independent
- **Escalation:** P0 scoring/authority outage to engineering/provider; feature-only incident queued without stopping golf
- **Recovery:** Bounded authoritative readback and capability stability window
- **Post Condition:** Receipt/readback matches expected state; unresolved items remain visible
- **Evidence Required:** Operation ID, timestamps, exact scope, canonical before/after and physical observation if relevant

## RUNBOOK-012 — Calcutta Pending / Correction

- **Prerequisites:** Auction published/result stale
- **Safe Actions:** Inspect exact job; for ownership correction use reviewed Unpublish→edit shares preserving price→republish→Process
- **Dangerous Actions:** No direct SQL/no silent ownership changes
- **Stop Conditions:** Incomplete fractions or financial mismatch
- **Fallback:** Keep historical publication/result; communicate temporary unavailable
- **Escalation:** P0 scoring/authority outage to engineering/provider; feature-only incident queued without stopping golf
- **Recovery:** Bounded authoritative readback and capability stability window
- **Post Condition:** Receipt/readback matches expected state; unresolved items remain visible
- **Evidence Required:** Operation ID, timestamps, exact scope, canonical before/after and physical observation if relevant

## RUNBOOK-013 — Odds Blocking Setup

- **Prerequisites:** Pairing guard denial
- **Safe Actions:** Show exact stale calculation/publication; supersede only certified eligible unpublished job, owner reviews withdrawal
- **Dangerous Actions:** Do not blindly calculate/unpublish
- **Stop Conditions:** Publication/input race or true dependency
- **Fallback:** Keep pairings unchanged
- **Escalation:** P0 scoring/authority outage to engineering/provider; feature-only incident queued without stopping golf
- **Recovery:** Bounded authoritative readback and capability stability window
- **Post Condition:** Receipt/readback matches expected state; unresolved items remain visible
- **Evidence Required:** Operation ID, timestamps, exact scope, canonical before/after and physical observation if relevant

## RUNBOOK-014 — Physical Score Recovery

- **Prerequisites:** Digital card missing golf
- **Safe Actions:** Proposed Director compare: matching skip, missing submit, different review; server computes strokes/net
- **Dangerous Actions:** No direct score-table writes
- **Stop Conditions:** Any conflict or unknown outcome
- **Fallback:** Retain signed physical card
- **Escalation:** P0 scoring/authority outage to engineering/provider; feature-only incident queued without stopping golf
- **Recovery:** Bounded authoritative readback and capability stability window
- **Post Condition:** Receipt/readback matches expected state; unresolved items remain visible
- **Evidence Required:** Operation ID, timestamps, exact scope, canonical before/after and physical observation if relevant

## RUNBOOK-015 — Emergency Release

- **Prerequisites:** Proven P0 with no safe operational recovery
- **Safe Actions:** Reproduce exact path isolated; minimum patch→regress→stage→sign→promote→readback→close lock
- **Dangerous Actions:** No force promotion/unrelated cleanup
- **Stop Conditions:** Security/idempotency/rollback proof fails
- **Fallback:** Rollback compatible candidate or physical cards
- **Escalation:** P0 scoring/authority outage to engineering/provider; feature-only incident queued without stopping golf
- **Recovery:** Bounded authoritative readback and capability stability window
- **Post Condition:** Receipt/readback matches expected state; unresolved items remain visible
- **Evidence Required:** Operation ID, timestamps, exact scope, canonical before/after and physical observation if relevant

## RUNBOOK-016 — Tournament Close

- **Prerequisites:** All rounds complete
- **Safe Actions:** Proposed Close Tournament verifies golf, zero access/leases, side-game decisions, archive/champion
- **Dangerous Actions:** No side-game job may change champion
- **Stop Conditions:** Incomplete authority/unknown operation
- **Fallback:** Leave close pending
- **Escalation:** P0 scoring/authority outage to engineering/provider; feature-only incident queued without stopping golf
- **Recovery:** Bounded authoritative readback and capability stability window
- **Post Condition:** Receipt/readback matches expected state; unresolved items remain visible
- **Evidence Required:** Operation ID, timestamps, exact scope, canonical before/after and physical observation if relevant

## RUNBOOK-017 — Provider Outage / Restart / AUTHORITY_INCOMPATIBLE

- **Prerequisites:** Core authority unavailable
- **Safe Actions:** Preserve local intents; use provider event/read-only health; distinguish timeout from version mismatch
- **Dangerous Actions:** No auth reset because read timed out
- **Stop Conditions:** Authority cannot be reliably read
- **Fallback:** Physical cards; bounded backoff
- **Escalation:** P0 scoring/authority outage to engineering/provider; feature-only incident queued without stopping golf
- **Recovery:** Bounded authoritative readback and capability stability window
- **Post Condition:** Receipt/readback matches expected state; unresolved items remain visible
- **Evidence Required:** Operation ID, timestamps, exact scope, canonical before/after and physical observation if relevant

## RUNBOOK-018 — Lock / Resume

- **Prerequisites:** Owner integrity/security concern or play pause
- **Safe Actions:** Review exact effect on current matches/leases; supported operation + receipt
- **Dangerous Actions:** Do not Lock solely for one broken optional feature
- **Stop Conditions:** Unknown operation/conflict
- **Fallback:** Suspend digital entry and capture gross
- **Escalation:** P0 scoring/authority outage to engineering/provider; feature-only incident queued without stopping golf
- **Recovery:** Bounded authoritative readback and capability stability window
- **Post Condition:** Receipt/readback matches expected state; unresolved items remain visible
- **Evidence Required:** Operation ID, timestamps, exact scope, canonical before/after and physical observation if relevant

## RUNBOOK-019 — Backup Restore / Disaster Recovery

- **Prerequisites:** Isolated drill or real approved disaster
- **Safe Actions:** Restore snapshot to isolated environment; validate canonical invariants, plan cutover
- **Dangerous Actions:** No overwrite live DB to test backup
- **Stop Conditions:** Restore unverified/data gap
- **Fallback:** Physical records + preserved authority
- **Escalation:** P0 scoring/authority outage to engineering/provider; feature-only incident queued without stopping golf
- **Recovery:** Bounded authoritative readback and capability stability window
- **Post Condition:** Receipt/readback matches expected state; unresolved items remain visible
- **Evidence Required:** Operation ID, timestamps, exact scope, canonical before/after and physical observation if relevant

## RUNBOOK-020 — Account/Auth Failure

- **Prerequisites:** Proven identity invalid
- **Safe Actions:** Reauthenticate supported flow; preserve quarantined local intent bound to correct identity
- **Dangerous Actions:** Do not expose participant private data or bypass grants
- **Stop Conditions:** Identity/role cannot be validated
- **Fallback:** Director/card workflow
- **Escalation:** P0 scoring/authority outage to engineering/provider; feature-only incident queued without stopping golf
- **Recovery:** Bounded authoritative readback and capability stability window
- **Post Condition:** Receipt/readback matches expected state; unresolved items remain visible
- **Evidence Required:** Operation ID, timestamps, exact scope, canonical before/after and physical observation if relevant
