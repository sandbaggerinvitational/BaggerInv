# Phase2D-R2 — canonical resource/control design

> **Current execution checkpoint — 2026-09-30: PARTIAL, stopped for a new bounded authority decision.** Owner approval covers resource/control, Certification annual origin and durable ingress. Migrations131–142 are an uncommitted draft. Actual432 holes/24 Finals and automatic worker drain passed at the recorded checkpoint, but annual CLOSE requires owner-directed Odds publication/Final Recap that Certification cannot yet admit truthfully. See the [exact blocker and minimum approval](CERTIFICATION-ANNUAL-PUBLICATION-BLOCKER.md), [current certification](CERTIFICATION.md), [evidence](EVIDENCE.md) and [next action](NEXT-PHASE.md). Scoped durable-ingress, two-resource-class and unit proof are preserved; no final installer, commit, push, hosted provisioning or deployment. [Current proof checkpoint](CURRENT-PROOF-CHECKPOINT.md) supersedes the status and approval requests in the historical design/checkpoint sections below; those sections retain their original dates and scopes.

> **Durable-ingress owner approval received — 2026-09-30.** The bounded Certification lease/outcome lifecycle is now approved. The earlier section 6 blocker remains preserved as counterevidence, but its approval request is resolved. Implementation resumes locally in this order: focused durable-ingress proof; first-write receipt/resource context; scoring-context pointer; Director status/text-ID compatibility; shared annual transition; required isolation/P0/full-sequence/regression/performance/fresh-install proof. No PASS, commit, push or hosted permission is implied by approval. The final installer remains disabled until every required gate passes.

> **Current approval-extension status — 2026-09-30: PARTIAL.** The owner has approved the Certification-origin annual closure; that earlier approval request is resolved. The subsequent source and owned local PostgreSQL audit reached the owner's **section 6 stop condition**: Certification has transaction exclusion but no durable ingress lease/control lifecycle. See [current evidence and disposition](APPROVAL-EXTENSION-STATUS.md), [exact missing contract](ANNUAL-INGRESS-LEASE-BLOCKER.md), and [remaining domain root causes](REMAINING-GAPS-ROOT-CAUSE.md). Application source and migrations are unchanged from the prior draft checkpoint. The historical records below retain their original stage-specific verdicts and requests; those requests are superseded by this addendum.

> **Implementation addendum — 2026-09-30: PARTIAL; stopped for owner review.** The design record below is preserved as originally reviewed. Implementation was subsequently authorized and a local draft exists, but the annual transition closure requires an additional authority contract. See [implementation status](IMPLEMENTATION-STATUS.md), [exact blocker and proposed additional scope](ANNUAL-TRANSITION-BLOCKER.md), and [evidence ledger](implementation-evidence.json). No candidate was committed, pushed, provisioned, or deployed.

**Design status: PASS — review complete; proposal ready for owner decision. Implementation: NOT STARTED.** This is a design-gate verdict, not runtime certification or implementation approval.

| Item | Recorded state |
|---|---|
| Base application SHA | `7cec5128409286f5b4a5f3524d4c5488124a7be7` |
| Review branch | `codex/reliability-phase2d-staging-admission` |
| Isolated worktree | `/private/tmp/bagger-phase2d-staging-admission` |
| Source / migrations / tests changed | NO / NO / NO |
| New migrations / local database execution | NONE / NONE |
| Hosted resource creation / Vercel changes | NO / NO |
| Production / old Preview / real Google accessed | NO / NO / NO |
| Historical P0 A–F | PASS at the base SHA; preserved, not reissued for this unimplemented model |
| Current changes | These ten uncommitted design documents only; no push or deployment |

## Finding and decision

**PROVEN — SOURCE:** the schema/control lineage creates a fixed Production resource, makes the current pointer depend on it, and reads it in canonical admission, isolated Director, annual, worker and audit paths. Ordinary Preview scoring selects legacy RPCs instead of the Phase2 canonical score RPCs. A new Supabase ref alone cannot establish correct certification authority.

**STRONGLY SUPPORTED — design:** use one explicitly registered resource per physical database, with only PRODUCTION and CERTIFICATION classes. Keep one canonical domain schema and implementation; preserve Production admission and identity; add separate certification context/wrappers. No generic multi-tenancy or client resource selector. Separate schema installation, exact resource registration, synthetic authority and activation.

Select fresh-install **Strategy B**: reviewed final-schema baseline plus convergent forward migrations. All120 numbered migrations and15 adjacent SQL artifacts are inventoried. Their interleaved seeds, activation, imports and exact-body patches preclude an unchanged historical replay as a clean certification installer.

## Review package

| Document | Purpose |
|---|---|
| [OWNER-REVIEW.md](OWNER-REVIEW.md) | Decision, scope, consequences and key risks |
| [RESOURCE-MODEL.md](RESOURCE-MODEL.md) | Chosen singleton model, table names, pointer, governance, receipts and trust |
| [DEPENDENCY-INVENTORY.md](DEPENDENCY-INVENTORY.md) | Actual resource semantics across domain, control and client paths |
| [MIGRATION-CLASSIFICATION.md](MIGRATION-CLASSIFICATION.md) |120/120 numbered lineage and15 adjacent artifacts, categories/order/hazards |
| [FRESH-INSTALL-DESIGN.md](FRESH-INSTALL-DESIGN.md) | Empty schema, explicit registration, bootstrap and catalog convergence |
| [PRODUCTION-UPGRADE-DESIGN.md](PRODUCTION-UPGRADE-DESIGN.md) | Forward upgrade, unchanged Production behavior, backfill and rollback |
| [SECURITY.md](SECURITY.md) | Trust chain, immutable identity, fail-closed threats and negative tests |
| [CLIENT-COMPATIBILITY.md](CLIENT-COMPATIBILITY.md) | Additive certification contracts, unchanged client DTOs, dispatch and privacy |
| [IMPLEMENTATION-PLAN.md](IMPLEMENTATION-PLAN.md) | Proposed file/migration scope and mandatory local proof gates |

## Evidence limits

The proof layer here is **SOURCE plus architecture review**. Installation, catalog convergence, Production-equivalence behavior, ACL/RLS execution, new context/admission, client integration and new performance are **NOT PROVEN**. Actual future project identity/credential provenance and deployed Production catalog are **UNKNOWN**, deliberately unqueried. They are later separately authorized gates, not values to invent.

No SOURCE finding is promoted to an integration or hosted PASS. The proposed design intentionally changes authority plumbing; it must recertify all affected P0 A–F behavior and retain their original historical evidence. Backup/restore, Production capacity/I/O/connections, diagnostic admission, full Round Control chronology, native queue/navigation, physical scoring and owner rehearsal remain separate unresolved program gates.

Document validation: all ten required artifacts present;120/120 numbered migration filenames accounted for with no duplicates; local Markdown links resolve; whitespace checks pass; no tracked source/test/migration change and no untracked file outside this design directory. These checks validate the review package only. No application build, database install or behavioral test was run for this design task.

**Next owner decision: approve bounded local implementation, YES or NO.** No source or migration implementation begins automatically after this design review. No hosted creation/configuration/deployment or Production interaction is authorized.
