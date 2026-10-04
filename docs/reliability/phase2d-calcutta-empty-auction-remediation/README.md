# Calcutta empty-auction / match-lifecycle remediation

**Local certification: PASS. Hosted execution: NOT RUN.** Base `462a3e82e24ea65a7cd8bbf59ec3355be968139e`. This package corrects automatic Calcutta demand in one existing private trigger function. It adds no client operation, privilege, policy, table, trigger, financial fact, admission mechanism or scoring rule.

## Domain decision

| State | Canonical meaning | Match lifecycle | Calcutta demand / publication |
|---|---|---|---|
| No configuration / NOT_CONFIGURED | Calcutta is not configured | Permitted if ordinary match readiness, actor and admission checks pass | No automatic demand; explicit calculation/publication lacks prerequisites |
| CONFIGURED, auction revision 0 | Configuration exists; auction facts have not been entered | Same independent readiness checks | No automatic demand; explicit calculation/publication denied |
| Valid empty revision after last-entry Clear | Immutable current `AUCTION_COMPLETE` ledger revision; purchases/owners empty, pot zero, configuration retained, UNPUBLISHED, no result | Must not acquire an extra financial prerequisite | No eligible Calcutta calculation or publication; no job or CALCUTTA intent |
| Valid nonempty revision | Entered, canonically validated purchases and complete ownership for those purchases | Same ordinary readiness checks | Automatic current-source calculation remains required, including while UNPUBLISHED |
| PUBLISHED nonempty revision | Separate, explicit Director publication controls financial visibility | Publication is not a Mark Live prerequisite | Normal derived work remains; this correction neither publishes nor unpublishes |
| Invalid/stale identity or malformed cleared state | Not a valid current empty revision | Denied rather than recognized as safe emptiness | No silent skip of corrupted/stale state |

This conclusion is independently supported by the existing contracts:

- [`director-calcutta-clear-entry-v1.sql`](../../../supabase/production_incremental/director-calcutta-clear-entry-v1.sql:119) constructs an empty immutable successor when the last entry is cleared. Its [explicit comment and guards](../../../supabase/production_incremental/director-calcutta-clear-entry-v1.sql:262) call this the supported empty, nonzero revision and prohibit Publish/Enqueue from mistaking it for entered facts. Clear preserves configuration, previous auction revisions, receipts and audits. It rejects published state and dependent results/pending or running jobs.
- [`canonical_match_control_v1`](../../../supabase/production_migrations/202609300132_certification_domain_gateways_v1.sql:1126) independently requires current match scoring readiness for Mark Live. It has no auction/publication prerequisite. Mark Live [does not open scoring access](../../../supabase/production_migrations/202609300132_certification_domain_gateways_v1.sql:1216).
- [`build_production_calcutta_v1_auction`](../../../supabase/production_migrations/202608290056_production_calcutta_v1.sql:703) and explicit Publish/Enqueue require nonempty facts. Clear is the deliberate exception for a valid stored empty revision, not authorization to calculate or publish fictitious zero financial results.
- Existing clear server/UI tests explicitly describe the cleared entry as NOT ENTERED, preserve history, and prohibit publication/recalculation without facts. The retained R2 Director chronology prepared matches before financial dependencies; it did not exercise last-entry Clear followed by Mark Live. That is a coverage gap, not a rule requiring fabrication of a replacement purchase.

The supported purchase → clear sequence is not an unrealistic fixture or test-sequencing defect. Empty is a valid cleared ledger, not disabled configuration or a published auction. Financial calculation is inapplicable until facts exist again.

## Failure chain and correction

Shipping Director API → `DIRECTOR.MATCH_CONTROL` → canonical `MARK_LIVE` → match UPDATE trigger `enqueue_production_calcutta_v1_change()` → automatic direct enqueue (or durable score-derived CALCUTTA intent) → job INSERT → `calcutta_job_requires_entries_v1` → `PRODUCTION_CALCUTTA_AUCTION_FACTS_REQUIRED` → whole domain transaction rollback. Durable ingress uncertainty is separately resolved as NOT_COMMITTED.

The automatic hook formerly used `auction_revision > 0` as sufficient evidence of eligible facts. Last-entry Clear legally invalidates that inference.

The [forward artifact](../../../supabase/production_incremental/calcutta-empty-auction-demand-v1.sql) preserves the complete predecessor hook and inserts one eligibility check **after the existing resource/context gates, before either direct enqueue or intent append**. It reads the current immutable auction by ID, tournament, revision, fingerprint and actual manifest hash. An empty manifest is accepted only if it exactly matches the canonical zero-fact shape, has no owners/nonzero pot/extra fields, remains AUCTION_COMPLETE/UNPUBLISHED/result revision 0, and retains an exact current hashed configuration. Otherwise the normal revision/input error aborts the transaction. Valid nonempty auctions continue through the original demand/processor path.

Explicit Publish/Enqueue guards, Clear, ownership/purchase mathematics, financial visibility, match authorization/readiness, scoring and receipt/recovery implementations are unchanged. No eligible nonempty demand is suppressed. For the reviewed empty starting state, no Calcutta job or intent is created, so there is no Calcutta work to strand. This is not full autonomous-worker or clear-during-undelivered-intent concurrency certification; those remain later worker scope.

## Local evidence

- [New integration proof](evidence/focused-integration.json): **20 behavioral cases + parent = 21 pass, 0 fail, 0 skip**. Reproduces the original failure before applying the artifact; proves atomic rollback and authoritative UNKNOWN → NOT_COMMITTED/replay, supported purchase/clear, valid empty Mark Live through the real shipping JS client/route/server/SQL stack, duplicate receipt, actor/resource binding, invalid/stale state, access/score/lock without empty Calcutta demand, privacy/role/resource/context denials, and normal nonempty worker calculation with no publication. HTTP/session lookup alone are local adapters; this is not hosted Auth proof.
- Fresh baseline plus forward artifact and already installed baseline plus forward artifact converge exactly. Only one function definition changes among 1,117 functions. Every ACL, function owner, security mode, search path, dependency, trigger, policy, RLS state and other catalog section remains identical. Runtime roles cannot install the artifact; an injected postflight failure rolls back the replacement; exact artifact replay is a no-op. Initial installation receipts and all application rows remain untouched by installation.
- [Affected suites](evidence/focused.json): **205 pass / 2 failures / 0 skip**, including the passing new integration, R2 Director, R2 Calcutta postcommit, lifecycle, runtime and resource tests. The two historical harness failures occur before the new artifact at migration 069's retained provider-origin requirement. [Untouched-base control](evidence/base-historical-control.tap.gz) reproduces both exact identities and errors without the remediation artifact. They are not new application failures and are not silently counted as passes.
- [Broad regression](evidence/application.json): **4,077 pass / 20 established failures / 0 skip**. [Failure accounting](evidence/failure-accounting.json) proves exact baseline identity equality and **0 new unexplained failures**.
- [Local build](evidence/build.json): **PASS**, credential-free, remote network denied. Expected fail-closed optional-data build warnings are retained in the log.
- [Source impact](evidence/source-impact.json): every base-tracked file remains byte-identical. Added forward SQL changes automatic eligibility only. Golf mathematics, calculators, scoring transactions, authority/RLS, annual behavior, bootstrap artifacts, registration and native source are untouched. **864-hole rerun not required**; the affected lifecycle/demand contracts receive focused proof. Retained R2 evidence for unaffected contracts remains applicable. Historical 048/057 remain NOT REPRODUCIBLE FROM RETAINED EVIDENCE — NOT PROVEN; neither is reopened. The approved 069 correction is preserved.

## Installation identity and reviewed hosted plan

The frozen `bagger-canonical-bootstrap-v1` installer remains unchanged. Its receipt truthfully identifies the initial installation and must not be rewritten to claim a later function body. The [forward manifest](manifest.json) separately pins the exact artifact, predecessor and successor `prosrc` hashes. The predecessor equals the actual function in [retained hosted evidence](evidence/retained-hosted-checkpoint.json). The integration evidence additionally records both function-definition hashes and exact catalog delta.

Fresh future resources use the immutable baseline **then this reviewed forward artifact**, before registration/activation. Existing resources use the same artifact; do not reinstall or rerun the raw baseline. Post-correction convergence/readback must compare the certified base catalog plus this single explicit definition delta. A baseline-only catalog comparison correctly reports the changed body and is not an appropriate upgrade expectation. The resource descriptor/registration and initial receipt remain unchanged; the new repository SHA identifies the correction package separately.

**No hosted data repair is required.** Both matches, closed scoring permissions, empty auction revision 2, financial history and resolved failed operation are already truthful. Do not create a replacement purchase, delete history or manually complete a job.

A later, explicit owner authorization must cover the repository-controlled forward SQL installation in addition to isolated deployment/rebind/resumption. Vercel deployment alone cannot replace a PostgreSQL function. Reviewed order:

1. Verify only `trmcwrljjxwhgtikfdgu`, resource `CERTIFICATION:2857f707-065a-405d-b5fc-b5b6fa1b0f51`, the current real release/deployment, disabled scoring/Director admission, PAUSED ingress, zero leases/UNKNOWN/claims/dead letters/required work, current empty revision 2, and exact predecessor owner/ACL/body. Stop on drift; no automatic repair.
2. Execute the exact hash-verified forward SQL file through the already-reviewed managed `postgres` owner connection, transactionally. No copied SQL, statement skipping, raw baseline replay, receipt rewrite, registration update, financial facts or new authority. The artifact refuses an unknown predecessor and non-owner/runtime roles, and preserves existing object ownership and ACLs. Read back the single allowed catalog delta and unchanged provider namespaces/defaults, receipt, registration, controls and data. Exact artifact replay is supported.
3. Deploy the separately approved new candidate to the existing isolated Certification Preview branch; verify real READY identity and safely rebind through the existing certified owner operation. Admission remains disabled/ingress paused during installation and binding.
4. Resume only remaining Part 2A gates using the preserved fixture. Keep the existing failed operation's truthful NOT_COMMITTED result; use the supported fresh current-context lifecycle operation after rebind. Do not restart completed Auth/RLS/Guide/Director007–011 or job-drain proofs without impact reason. Future legitimate required work must follow normal processors, never manual completion. Return to the disabled/paused checkpoint on failure and at completion.

## Hosted boundary and source delivery

This run did not contact or mutate hosted Certification, deploy, rebind, activate admission, run hosted workers, access Production/old Preview/Google, or send messages. The retained hosted checkpoint remains disabled/paused at admission revision 17, two UPCOMING matches, zero scores, zero required pending work/claims/leases/UNKNOWN/dead letters. These are retained facts, not a new provider readback.

The isolated branch's unchanged `vercel.json` explicitly suppresses Git deployment for `codex/reliability-phase2d-staging-admission`. A bounded source/evidence push does not authorize or create a hosted release. No credential files were consumed. Evidence contains synthetic local identities, hashes and sanitized non-secret retained facts only.

**Next owner action:** authorize the exact repository-controlled Calcutta-demand forward SQL correction on disabled Certification, deployment of this locally certified candidate, safe release rebind, and resumption of remaining Phase2D-P Part2A from the preserved fixture. Do not begin Part2B.

Full raw logs are preserved byte-for-byte in deterministic `.tap.gz` archives; their uncompressed SHA-256 values are recorded in the JSON receipts. Generated plaintext `.tap` files remain local and ignored to keep the source/evidence commit bounded.
