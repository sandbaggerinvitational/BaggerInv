# Phase 2D-R2 annual-transition approval extension — checkpoint

> Historical September30 approval checkpoint. The origin, durable ingress and explicit owner-publication extensions below were subsequently approved and implemented locally. Current results and separate pending decisions are in [CERTIFICATION.md](CERTIFICATION.md) and [EVIDENCE.md](EVIDENCE.md); the historical statements below are preserved.

**2026-09-30 — PARTIAL. No new candidate SHA. No commit or push.**

The owner approved truthful Certification-origin annual closures while retaining mandatory Production legacy/provider fences. That decision is accepted and remains in force. It is not pending another approval.

The audit then reached the approval's explicit section 6 stop condition: Certification ingress has real transaction locking and exact resource/context validation, but does not durably capture admission, write start, outcome or unresolved work under a bound ingress generation. An empty lease table cannot certify the required watermark, late-write exclusion or drain. The existing Production BEGIN protocol requires legacy Google authority and cannot serve Certification unchanged. See [the exact missing prerequisite and bounded proposal](ANNUAL-INGRESS-LEASE-BLOCKER.md).

This is an owner-specified stop, not an automatic approval-review rejection. No migration 136 or annual closure implementation was attempted. The approved Production provider constraints remain unchanged; no fake provider evidence was created. Full Production-equivalence behavior is still **NOT PROVEN** for the earlier uncommitted draft.

## Evidence and freshness

| Claim | Strength / proof layer | Evidence and limit |
|---|---|---|
| Certification dispatch has no durable ingress lifecycle | **PROVEN — SOURCE**, corroborated by installed PostgreSQL metadata | Independent adapter/domain/catalog reviews; no BEGIN/mark/outcome contract. Transaction exclusion is acknowledged, not treated as durable lease evidence. |
| Enabled Certification context does not bind the gate's lease generation | **PROVEN — POSTGRESQL / RPC** | Admission enabled, Certification revision 2; gate protocol false, gate revision 0, enforcement timestamp/deployment null. Exact generation absent from context. |
| Actual gateway reaches canonical validation | **PROVEN — RPC** | Correctly bound synthetic missing-match call returns `MATCH_NOT_FOUND`; no successful canonical score tested. |
| Existing annual certificate does not accept the fresh Certification fixture | **PROVEN — POSTGRESQL** | `certified=false`, `PREDECESSOR_SCORING_CLOSE_CERTIFICATE_UNAVAILABLE`. Does not prove proposed transition behavior. |
| Prior runtime/source checkpoint preserved | **PROVEN — SOURCE** | All 40 entries in [the earlier source manifest](implementation-evidence.json) retain their SHA-256 hashes; HEAD remains the base SHA. Documentation/evidence additions only in this step. |
| Owned test resource removed | **PROVEN — local harness completion** | Probe `finally` destroyed its uniquely owned Unix-socket cluster; no shared/hosted database used. |

New evidence: [sanitized structured counterevidence](implementation-evidence/annual-ingress-counterevidence.json) and [the exact scratch probe](implementation-evidence/annual-ingress-probe.mjs). Its absolute local fixture path records the executed checkpoint; it is evidence tooling, not a released test or installer. Raw local output/catalog paths and hashes are recorded in the JSON. No secret or live credential was used. A scratch derived-field detector correction is disclosed there; no database observation was modified.

The prior **186 UNIT/injected-transport passes, 11 provisional-bootstrap passes, 9 annual CREATE/read passes and local build PASS** retain their original limited scopes. They were not rerun or promoted to transition/full-sequence proof. The new bounded probe is a counterexample investigation, not another passing test count.

Final documentation checks passed: `git diff --check`, new-document whitespace, local Markdown links, preserved probe JavaScript syntax, all recorded raw/probe/source hashes, and a limited private-key/token pattern scan across the six current/additive documents and two new evidence artifacts. This is not a full credential audit. Sandbox process-list access was unavailable; teardown evidence is the owned harness's successful stop/removal path, not a claim about every process on the machine.

## Remaining gates

| Gate | Current result |
|---|---|
| Certification immutable annual predecessor/origin closure | PARTIAL — approved, not implemented pending actual ingress contract |
| Lease, drain, readiness, CAS and abort/recovery transition proof | PARTIAL / NOT PROVEN |
| Production transition equivalence / new permissive cases | NOT PROVEN / NOT MEASURED for the draft; no source edits during this extension |
| Fresh-install release artifact | PARTIAL; provisional structural proof only; `AWAITING_COMPLETE_FORWARD_PROFILE` retained |
| Scoring-context preparation | Real omitted resource seam; observed failure retained; corrective work deferred |
| Director Finalize/Reopen status | Missing installed SQL operation; corrective work deferred |
| Reopen mutation identity | SQL phase-based UUID validation conflicts with established scoring text ID; corrective work deferred |
| Additional receipt trigger resource seam | Production first-write trigger remains on Certification receipt path; SOURCE finding, runtime consequence strongly supported |
| Two-database behavioral isolation / complete security | NOT PROVEN / PARTIAL |
| New-draft P0 A, B, C, D, E, F | All PARTIAL / not recertified. Base-SHA historical PASS remains separate. |
| Certification 432 holes / 24 Finals | NOT RUN; unresolved mutations and required backlog NOT MEASURED |
| Broad regression / performance | NOT RUN; new/unaccounted failure count and performance regression UNKNOWN |

[Remaining-gap root causes](REMAINING-GAPS-ROOT-CAUSE.md) distinguish observed failures from SOURCE findings. Under section 27, fixes follow a passing annual-transition authority contract; none was applied out of order.

## Source and boundary

- Base and current HEAD: `7cec5128409286f5b4a5f3524d4c5488124a7be7`.
- Branch: `codex/reliability-phase2d-staging-admission`; remote `origin` (`git@github.com:sandbaggerinvitational/BaggerInv.git`).
- Worktree: `/private/tmp/bagger-phase2d-staging-admission`; intentionally uncommitted draft, not clean and not release-ready.
- Checked-in Certification registration: disabled. Final install manifest: not emitted. New migrations/source changes in this extension: none.
- Hosted resources created/deployed, Vercel changed, Production queried/mutated/deployed, old Preview mutated, real Google accessed, real messages sent, real competitive data changed, Build 11/native shipping changes: **NO**.

**Ready for Phase 2D-P: NO.** Exactly one owner action: approve or revise the bounded Certification ingress lease lifecycle in [ANNUAL-INGRESS-LEASE-BLOCKER.md](ANNUAL-INGRESS-LEASE-BLOCKER.md). The already-approved Certification-origin closure follows that prerequisite; no hosted permission is requested.
