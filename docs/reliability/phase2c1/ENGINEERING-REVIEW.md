# Engineering review

**Candidate only; Phase2C.1 PARTIAL pending final evidence reconciliation.** Base `ab909d4519ea1331e27b0924de1572ebaf690777`. Production, real Google, competitive data and native shipping source are untouched. Distinguish elimination of a provider edge from proof of every replacement surface.

## Architecture and transaction boundary

Before: protected PostgreSQL score/result/receipt writes still inserted Google outbox demand. Finalize atomically captured a canonical snapshot and separately enqueued Sheets archive delivery. PWA/native/control post-commit hooks attempted those consumers; some Director/control acknowledgements waited for delivery. Annual admission/release certification bound canonical generations to an external Google writer certificate. Legacy selectors could choose Google/Passport or fall back to it.

After: canonical score calculations, security, idempotency, audit and snapshots remain; provider outbox/archive insertions are absent. Calcutta/Competition/Intelligence durable internal work remains. Canonical selectors require the approved database; Google transport fails before credentials, OAuth or publicCSV dispatch. Annual transitions retain exact canonical database project/provenance, pointer and authority/admission/runtime generations, identity and actual implementation manifests. Google destination is no longer part of current authority.

No new SaaS, microservice, outbox, score-path work or scoring/side-game formula is added. Stored `source_workbook_id` is retained immutable provenance where required; it is not a current network/destination requirement.

## SQL changes and migration safety

| Candidate migration | Scope | Safety / rollback implication |
|---|---|---|
|125 `google_runtime_retirement_v1` |27 exact installed 124 function bodies;34 legacy service RPC grants revoked;4 provider generation triggers removed;7 retired annual worker entries disabled;3 destination metadata columns nullable | Exact sourceSHA and unique anchor checks; canonical ACLs preserved; old job/checkpoint/history rows untouched; immutable allowlist trigger restored in same transaction |
|126 `google_retired_release_admission_v1` |5 exact release/context functions; disable retired Google worker controls and Google writes flag with prior state recorded | Keeps canonical release lock/SHA/pointer/generation/security checks; rejects revived provider worker state; actual protected release tests required |
|Preview 0001 `canonical_history_provenance_v1` |New service-only `read_canonical_2026_historical_view(text)` delegates original safe projection using storedSQL provenance | Production historical reader unchanged; anon/authenticated denied; cannot use Production workbook provenance through Preview function |

125 deliberately rejects pre-existing annual side-game certificates rather than silently trusting a stale implementation hash. Later installation requires reviewed certificate recertification in an isolated deployment rehearsal. This is a migration gate, not a reason to alter real certificates now. No speculative indexes or timeout increases. An old release needs original provider grants/flags/code; rollback must restore the reviewed full contract, not only application files. Retain credentials and external resources until later authorized stability/rollback windows close.

## Evidence and review corrections

Owned SQL suite: **8 PASS/0 FAIL**, fixture `phase2c1-google-retirement-sql-v1`, ownedUnixsocketPG 17, corrected 125 `355be26c45d1e52ad0fd8a8e1520b7b0ad06dedba6a48b4aa15c6e2d3ee6b7dc`. It preserves old 19 outbox/1 archive/1 snapshot records exactly, verifies new 18-hole Finalize/Reopen with 0 newproviderjobs, preserves 23 audits/22 receipts atFinalize, checks privateRLS/grants and internal triggers, protects syntheticfinancialhistory and executes Previewhistoricalreader. [Evidence](evidence/google-retirement-sql.json).

Review caught false `google_outbox_created:true` after producer removal. Fixed eight new-operation response builders before receipt commit; old true receipts unchanged. Earlier benchmark/full-sequence artifacts retain the old 125 hash as counterevidence; fresh proof must match corrected source. This did not change golf semantics.

Read-only review also identified invalid explicitly requested Production-shadow identity falling back to ordinary Preview identity. The candidate correction now has seven new behavioral tests (six reproduced failures before) and 28/28 focused after checks; the broader retirement-security receipt is 84/84 current-source PASS. See `evidence/identity-admission-security-correction.json` and `evidence/retirement-security.json`. This is local UNIT/injected proof, not hosted auth certification. The current Preview Director page still selects legacy DirectorDashboard, whose GET route is 410. Canonical ProductionDirectorConsole existing is not sufficient proof for that page. This required interface issue prevents broad client/staging readiness until addressed or accurately scoped.

Release input fields historically named `runtime_*_secret_configured` are now hardcodedfalse with retired workers. Effective capability beingfalse is correct; actual retained secret presence can differ. This is explicitly documented as an effective-retired contract in `evidence/rebind-effective-capability-fields.md`, not proof of external credential deletion. No real credential/config change occurred. Future attestation should retain truthful configured-vs-effective distinctions.

## Performance, workers and compatibility

Corrected-source delivery 54/54, recovery 50/50, finite timeout 7/7, deadlock 10/10 and full sequence 1/1 pass in fresh isolated runs. The sequence commits 432 holes and 24 Final results, creates 0 Google jobs/calls and drains the stopped-worker backlog 180 to 0 required work. [P0-B](P0-B-RECERTIFICATION.md) is PASS at the local remaining-family layer. Candidate history-scale benchmarking is separate and must use its own final receipt. Do not copy Phase2C timing/counts as candidate measurements. Local PostgreSQL does not prove Production I/O, pool or capacity. The prior unexplained tail-variance finding remains open unless new evidence resolves it.

PWA and native score response shapes remain, including a truthful false compatibility field. No native shipping behavior changes. Canonical operation success no longer waits for a retired delivery receipt. Legacy import/rehearsal routes return 410 and historical source is retained under maintenance; this is an intentional retirement, not a working feature replacement. History/Records service tests use canonical synthetic fixtures; real corrected 2017–2025 completeness is not proven.

## Open review gates

- Local identity/security negatives pass 84/84; final broad security comparison and hosted admission remain required.
- Required isolated Director route/client replacement and other UNKNOWN optional capability decisions.
- Actual future-year initialization is blocked by independent P2C1-ANNUAL-001: CREATE `input.tournament_year` must equal current 2026 at `assert_annual_future_admin_scope_v1`, but the CREATE body requires targetyear >2026. Real 2026 and 2098 input variants both fail. This is a pre-existing protocol contradiction, not a remaining Google authority requirement. Do not weaken the guard to make a test pass.
- Autonomous delivery and zero-Google 432-hole local proofs pass; hosted scheduler/supervision and complete owner-controlled side-game chronology remain separate.
- Exact broad-regression identity adjudication and build with final source manifest.
- Later hosted admission/RLS/pooling, migration recertification and rollback; actual historical preservation.

[Change summary](CHANGE-SUMMARY.md), [traceability](TRACEABILITY.md), [catalog overlay](CURRENT-CATALOG-OVERLAY.md). No current review outcome authorizes staging or Production deployment.
