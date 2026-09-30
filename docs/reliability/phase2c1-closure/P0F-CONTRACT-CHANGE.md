# P0-F contract change — design before implementation

Base: `7b6ca99510dc2f44cc411bfe7769e7f0c05ed962`. Status: OWNER APPROVED A, B AND REDUCED C; normal runtime review and certification still required. The earlier checkpoint below is retained as history, not the current approval state.

## Historical proposal — superseded by explicit owner approval below

The five-file diagnostic read-routing proposal remains **PENDING explicit owner confirmation and normal runtime approval review**. This task prompt does not approve it. No rejected edit may be executed through another file, agent, mechanism or equivalent broader change. Files: `lib/canonical-runtime-source.js`, `lib/production-shadow-candidate.js`, `lib/production-shadow-candidate-server.js`, `lib/odds-calculation-source.js`, `app/api/preview-environment/route.js`.

The independent isolated Director context is within the owner's express minimum-context implementation scope. It must still pass the runtime's normal approval review. An encountered approval rejection stops that exact dependent implementation; it is not a license to weaken checks. Implementation complexity alone is not treated as a missing owner decision.

## Director operation context

BEFORE: isolated Director authorization can read the canonical overview and perform scoped Finalize/Reopen/Odds operations. Setup, entry registration, auction management and remaining controls either select Production-only APIs (404 before isolated authorization) or an explicitly unsupported Preview adapter. The old Preview import schema lacks the canonical setup/handicap/entry/auction ledgers. Passing those requests off as Production would be an authority defect.

AFTER (proposed): a separate, disabled-by-default, database-installed isolated context admits only exact isolated resources and the already intended authenticated Director. It uses the existing Production-shaped local canonical schema through 127, reusing its domain ledgers and private command cores. A missing schema/context fails closed. No production resource row is forged, no environment string is rewritten to PRODUCTION, and no browser credential is privileged.

The new provider-neutral isolated operations API is additive. Existing Production APIs and their admission predicates stay intact. Actor/profile/resource identity is server-bound, not taken from client JSON. The new client operation envelope carries a stable operation ID and expected context/revision token read from canonical authority. A stale token is a conflict, never permission to silently rebind. Required receipt/readback precedes success; unknown outcomes retain the operation ID. Legacy response contracts remain supported on their existing routes. PWA/Build 10 score DTOs are unchanged.

The isolated context must bind resource identity, schema contract, current tournament, governance tournament, activation/admission revision and release identity, and be locked through the mutation. These existing seven operation contracts are 2026-scoped; do not silently generalize governance or annual access. Future-year CREATE and its separate current/target contract remain unchanged. New private cores are not executable by PUBLIC/anon/authenticated/direct service-role callers. Only independently admitted service-only wrappers invoke them.

Authority baseline: active, non-impersonated, account-linked Director; current database identity/link/membership/entitlement rechecked for writes; exact installed target; valid current activation; operation-specific setup/handicap/match/permission/financial revisions. Retain current ingress/lease, lock/Final/readiness, immutable history, audit, idempotency and financial privacy checks. Invalid/signed-out/participant/spectator/cross-target/stale-context calls are denied before mutation. No new role acquires any capability.

New errors are local to the additive API: missing authority/context: 403; missing installed schema: 503; stale context: 409; unresolved transport/readback: 503 with same-operation recovery. Domain errors keep their established meaning. No canonical failure falls back to Google or resets a participant session. Telemetry remains best effort; required canonical audit remains transactional.

Migration requirement: an inert canonical-context/shared-core migration for the existing canonical schema, tested on clean and upgrade synthetic profiles. No hosted migration or registration is authorized. The older Preview-only profile must report missing capability, not create a competing financial/scoring authority. Production wrappers must be regression-tested with unchanged predicates. Existing current-target constraints are preserved rather than broadened for convenience. Delivery provenance must identify the isolated context accurately; an isolated auction change must not be recorded as Production activation work.

Affected callers: current isolated canonical Director console; reused setup/pairing, Net Skins entry and Calcutta editors; contextual match-control adapter. Minimal transport injection is permitted; no broad Director redesign. Required operation IDs and canonical receipts are preserved. No Google package/configuration/route resurrection is permitted.

## Historical diagnostic proposal — approval subsequently granted for five files

BEFORE: the exact legacy diagnostic lane requires obsolete Google configuration; generic canonical selectors no longer recognize its read-only transport. An invalid requested lane can also fall through to otherwise-valid ordinary Preview selection. This is selector evidence, not proof of successful unauthorized writes.

AFTER (pending proposal): recognize only an already-valid exact read-only diagnostic lane without Google configuration. Retain host/commit/project/DB/Auth/captcha/rate-limit/secret/request-transport conditions and the RPC read allowlist. Fail a requested invalid lane closed. Deny scoring/control/publication mutations regardless of supplied flags. Preserve existing diagnostic response fields where compatible and explicitly document any changed value/error meaning. Do not remove the transport or role checks.

Security effect: remove retired-provider configuration as a prerequisite only within the approved read-only context; no expanded write or actor authority. This changes admission semantics and some provider-value assertions, so explicit pending UI approval is required before application. Approval would permit another normal reviewed attempt, not override the runtime approval system. No Production/Google request is needed for proof.

## Acceptance before certification

7/7 actual Director capabilities, 3/3 routing cases; class-specific negative authorization; same operation retry/conflict/atomic audit/readback; correct financial and delivery provenance; unchanged Production rejection; no Google; affected release/client/security proof; zero unexplained broad regressions. SOURCE or model tests alone cannot close these gates. Until then P0-F remains PARTIAL, and no commit/push or staging advancement is claimed for this final-closure work.


## Historical checkpoint before explicit owner approval — 2026-09-30 UTC

Three separate approval controls remain unresolved. No answer/approval has been received. Elapsed time is not approval. Rejected migrations 129/130 were never written or executed. Their empty CLI scaffolds were removed. Independently accepted context 128, its context-only test, and two unmounted UI drafts were hash-preserved under `/private/tmp/bagger-p0f-approval-checkpoint-20260930` and restored/removed from the worktree so the executable candidate remains exactly 7b6ca995. The context prototype passed one isolated PostgreSQL test; it does not close any of the seven capability identities.

### A — existing five-file read-routing approval

Exact change, API effect and all retained denial predicates are described above and in `ROUTING-ADMISSION-REVIEW.md`. The existing explicit owner confirmation is still pending. The three routing cases remain RED. No equivalent selector was installed elsewhere.

### B — setup/control shared-core extraction, rejected migration 130

[Exact review](evidence/p0f-final-closure/p0f-setup-control-review.md). The proposed SQL is `/private/tmp/bagger-p0f-approval-checkpoint-20260930/review-only/p0f-setup-control-cores-v1.sql`, SHA256 `499e192f8b85e473d614ec93b72cbbe1be6c2f6f8cb1514888f4d13f7cda4633`.

The draft moves the public setup reader and match-control function to private cores; creates four public wrappers preserving the original Production admission calls; removes five nested setup-admission calls from four private bodies; adds one separately admitted isolated dispatcher; and revokes direct execution of private cores. It changes no tables, triggers, indexes or domain rules by design. Its isolated match-control read adds current permission/revision fields. Production API shapes are intended to remain unchanged, but callable function attributes/search paths and admission placement do change and require proof.

The reviewer rejected this exact write because it changes function admission/execution privileges and wrapper attributes without separate trusted approval. The tool description also mentioned ownership; the draft does not contain ALTER OWNER. Schema moves preserve function OIDs and owners, which creates a real review obligation: stored OID dependencies may continue to target a moved core. Repository source shows the round-scoring parent performs original runtime/actor checks before and after locks, but catalog `pg_depend`, owner/ACL and nested behavioral proof are NOT PROVEN. Schema privacy alone is not authorization. Approval would only permit a normal reviewed implementation attempt plus those tests, never waive them or authorize Production/staging.

### C — financial shared-core proposal, rejected migration 129

[Exact rejected proposal and body diffs](P0F-FINANCIAL-REVIEW-PREVIEW.md). The reviewer rejected the financial-domain extraction combined with audit-table/trigger changes as broader than the authorized context correction. The rejection did not execute. The generator remains review-only and must not be run.

The minimum required operations are `save_production_net_skins_entries_v1`, `replace_production_calcutta_v1_auction_facts`, `clear_production_calcutta_v1_auction_entry`, and the existing target-scoped management projection. The rejected combined draft also extracted Calcutta configuration, changed concurrent replay behavior and expanded cross-family provenance columns/triggers. Those extras are not established as necessary and are NOT included in a minimum approval request. Accurate isolated audit provenance still needs a concrete safe design; it cannot be omitted or mislabeled. No reduced or equivalent implementation was attempted after the rejection. Minimum authority review must explicitly permit the three named shared mutations with all original financial/domain predicates retained; configuration/retry/provenance expansion requires separate justification and review.

### Shared additive API proposal

[API review](evidence/p0f-final-closure/p0f-director-api-approval-draft-review.md). The uninstalled API adds stable context/operation fields and canonical readback. Existing PWA/native DTOs and Production routes are unchanged. New-context receipt recovery after a lost response remains NOT PROVEN; rejecting stale context and retaining an ID is safe containment, not complete outcome resolution. This is a proof obligation, not permission to broaden admission.

Minimum owner action: resolve the pending exact read-routing decision and review the separately blocked setup/control and minimum financial authority extractions. Normal runtime approval review remains mandatory after any owner confirmation. No approval permits removing Director/role/resource/CAS/financial gates, bypassing RLS, using Google fallback, or advancing staging.


## Explicit owner approval — current execution authority

The owner explicitly approved A, B and reduced C in the subsequent user instruction. This supersedes the earlier pending-owner decisions, but does not override normal runtime approval review. No extra confirmation is inferred or needed for that approved scope.

- **A approved:** the five-file diagnostic read correction only. Google workbook configuration ceases to be an admission prerequisite. All exact host/SHA/project/database/Auth/captcha/rate-limit/secret/request transport checks and the RPC read allowlist remain. Explicit invalid diagnostic requests fail closed, including when an ordinary isolated or Production configuration would otherwise be usable. Writes/control/publication stay denied.
- **B approved:** existing private setup/control logic can be shared by separately admitted Production and isolated wrappers. Actual owners, ACLs, search paths, security mode, stored OID dependencies, nested callers, unchanged Production predicates and negative authority must be proved. Schema privacy is insufficient.
- **Reduced C approved:** only entry registration, auction ownership/purchase replacement, single-entry clear and the existing management projection. No Calcutta configuration extraction, replay semantic change, cross-family columns, broad trigger redesign or financial-rule change. Only minimum operation-specific accurate provenance is permitted; a demonstrably broader requirement must stop for separate approval.
- **Additive API approved:** server-bound identity/resource/context; stable operation ID and expected context/revision; canonical receipts/readback; stale conflicts and same-ID unknown-outcome containment. Existing Production routes and PWA/Build10 score DTOs stay intact. Existing2026 scope and annual CREATE semantics are not generalized.

### A response/provider values documented before source edit

The diagnostic lane now reads canonical Supabase authority. `SCORING_AUTHORITY` defaults to `supabase`. The existing `google` token remains accepted only as a deprecated, non-authoritative compatibility label on this exact read-only lane; it never selects a Google adapter or grants mutation authority. Other tokens fail closed. This preserves older diagnostic fixture/configuration inputs while eliminating Google as a requirement. The emitted provider values are corrected and tested. The observational safety field reports scoring authority `none`, because the lane has no mutation authority. The server overlay requests canonical reads and publication `unavailable`, never Google. Odds publication reports `unavailable` with its existing denial code regardless of publication flags. A new `googleConfigurationRequired:false` diagnostic field explicitly identifies the retired prerequisite; existing diagnostic fields remain available. `workbookApproved` remains informational only, never forced true. The immutable historical workbook ID may remain solely as a database provenance key, not a live credential, Google request or authorization prerequisite.

Positive and failure-locality tests must use the actual request overlay/adapters with remote network denied. Each retained security predicate receives a negative case; all named scoring/control/publication RPCs remain forbidden before transport. Changes to provider/error values are accounted as approved contract updates, not blanket exclusions. Production/staging/realGoogle/native remain prohibited. Approval is not a PASS claim.


## Newly exposed adapter boundary — approval requested, not implemented

After approved A, the focused routing/security selection is41PASS/1FAIL (42 tests, including additional approved-lane regression coverage). The original broad routing assertion advances far enough to expose a second History condition that previously could not execute. No authority change below has been applied.

1. **`lib/history-2026-read-source.js`:** an exact admitted diagnostic read has canonical source `supabase`, but this adapter additionally requires `SUPABASE_SCORING_MIRROR_ENABLED`. The diagnostic contract forbids that writer flag. Actual reproduction: canonical=`supabase`, History=`unavailable`, reason=`supabase-service-disabled`. Proposed correction: for `state.productionShadowCandidate===true` only, derive canonical read authority/service availability from that already-validated read context. Preserve fixed2026 target and all existing isolated/Production checks. Its immutable workbook database provenance may be carried from the already-approved diagnostic read state, without Google configuration or transport. Missing/invalid context continues to reject. This corrects read admission for the same intended lane, not a new role or write permission.

2. **`lib/prediction-input-bundle-source.js`:** an explicitly invalid requested diagnostic lane can still fall through this separate adapter to ordinary Preview: actual reproduction canonical selector `blocked=true`, bundle `available=true`, reason=`preview-supabase-prediction-input-bundle`. Proposed correction: before ordinary Preview/Production selection, if a diagnostic lane was explicitly requested, return only its exact existing read admission result. Invalid requests return unavailable with the diagnostic reason; valid requests retain the current read-only result and exact project. No substring/Preview fallback may substitute authority for that requested lane. Ordinary non-diagnostic behavior is not redesigned.

These two adapters are outside the five named A files, so implementation is stopped pending explicit scope approval. The minimum extension is only the two described branches plus tests for exact context, wrong target/transport/resource, no Google, no write authority and compatibility. It does not authorize general History/Prediction policy changes, current-data migration, roles, publication or Production access. No workaround through fake cutover metadata, mutable environment flags, proxies or another file will be used.

Before implementation, owner scope approval and normal runtime review are both required. B and reduced C remain independently authorized and continue. Evidence: local mock/no-network focused routing receipt at `/private/tmp/bagger-p0f-approved-routing/routing.json`; source selectors executed directly with synthetic credentials and no transport.


## Owner-approved two-adapter extension — current authority

The owner subsequently explicitly approved only `lib/history-2026-read-source.js` and `lib/prediction-input-bundle-source.js`, plus required tests/documentation. This supersedes the pending decision in the preceding section for those two branches only. Normal runtime review remains required.

History: only when the existing canonical selector returns `state.productionShadowCandidate === true`, use that validated read context for canonical service/authority eligibility. Do not enable the mirror writer. Preserve fixed2026 target, existing non-diagnostic behavior and every existing diagnostic admission predicate. Carry immutable workbook provenance only from the existing validated diagnostic read helper.

Prediction: handle an explicitly requested diagnostic lane before the ordinary cutover/Preview branches. The exact eligible read result remains available; an invalid requested lane returns unavailable with its exact diagnostic reason and `fallbackUsed:false`. Preserve the existing contract fields/error taxonomy and ordinary non-diagnostic selection. No new role, RPC allowlist entry, write/control/publication permission or external request is added.

The extension does not authorize any further adapter change. A downstream History RPC-selection concern is being characterized through the actual no-network adapter path; no unapproved transport/allowlist/cutover workaround is permitted.


## Historical checkpoint: additional History RPC adapter boundary — then NOT APPROVED / NOT IMPLEMENTED

The two approved selectors now work in the direct no-network reproduction: exact diagnostic History resolves Supabase without the mirror writer; an explicitly invalid Prediction lane is unavailable with its diagnostic reason and no fallback. The actual History reader then fails closed with HTTP403 / `PRODUCTION_SHADOW_CANDIDATE_RPC_FORBIDDEN`, before any fetch.

Exact source: `lib/history-2026-supabase.js`. `history2026RpcContext` retains only `productionCutover`; the subsequent RPC selector chooses `read_canonical_2026_historical_view` whenever that cutover flag is false. A diagnostic lane is correctly not a Production cutover. The unchanged diagnostic translator recognizes the existing `read_preview_2026_historical_view` alias, translating it to the already-allowlisted canonical `read_production_candidate_current_view` / `HISTORY_2026`. The direct canonical RPC name is not on that diagnostic allowlist. This denial prevents an actual History read; successful source selection alone cannot close P0-F.

Minimum proposed third-file extension (review only):

1. In `history2026RpcContext`, add `productionShadowCandidate: source.productionShadowCandidate === true`, taken only from the validated source, never client JSON or a fabricated cutover flag.
2. In `readHistory2026SupabaseView`, after the unchanged explicit tournament/year2026 validation, define `certifiedReadTransport = context.productionCutover || context.productionShadowCandidate`.
3. Use the existing `read_preview_2026_historical_view` RPC alias and its existing immutable workbook provenance only when that boolean is true. Keep `read_canonical_2026_historical_view` for ordinary isolated reads. Preserve the existing `productionCutover` value.
4. No translator, RPC allowlist, SQL function, role, target, RLS, write/control/publication authority or Google behavior changes. The existing transport independently revalidates the diagnostic scope. No new provider or fallback is introduced.

API effect: an internal context object gains the explicit diagnostic boolean; external History DTOs remain unchanged. Before: exact diagnostic reads are rejected by the allowlist because the wrong internal RPC is selected. After proposed: the same admitted context reaches its existing certified read transport; ordinary isolated and real-cutover branches keep their existing RPCs. Security effect: routing correction only; fixed2026 target and all original read/role/resource predicates remain. Migration: NONE.

Required proof after explicit approval and normal runtime review: actual History reader/service with mocked canonical transport, exact translated RPC/body and sanitized result; negative target/year/resource/transport/context; existing mutation allowlist denials; ordinary isolated and Production-cutover compatibility; zero external network/Google; failure locality; affected broad/build evidence. Adjacent Guide, leaderboard, completed-history and player-editorial RPCs already map in source; their runtime behavior must still be tested, not inferred from names.

This file is outside the approved two-adapter extension and is untouched. No equivalent fix through another file, mutable environment flag, proxy, allowlist expansion or fake `productionCutover.handled` is authorized. Owner approval for this exact additional adapter is required before implementation; normal runtime review remains mandatory.


## Final owner approval — History RPC adapter only

The owner explicitly approved the exact preceding proposal in `lib/history-2026-supabase.js`, with directly required tests/documentation. This supersedes the pending third-file decision, not the historical record. Normal runtime review remains mandatory. No further adapter, allowlist, SQL, role, RLS, target/year, external DTO, publication or mutation change is authorized.

Implementation must carry `productionShadowCandidate: source.productionShadowCandidate === true` only from the validated source; after existing2026 target validation select the existing certified read alias when the real cutover flag OR that diagnostic flag is true. Preserve the original cutover value and ordinary isolated canonical RPC. No environment flag is enabled and no cutover metadata is fabricated.

Required proof includes the actual History reader and service, translated RPC/body, sanitized response, negative context/target/transport, existing mutation denials, ordinary isolated and Production-cutover compatibility, and actual adjacent Guide/leaderboard/completed-history/player-editorial adapters. All certification remains no-network/local; commit/push is authorized only after all P0-F gates pass. Any further unapproved boundary stops its implementation.

## Final approved History RPC implementation and proof

PROVEN — SOURCE / LOCAL API-ADAPTER: the final owner-approved one-file correction passed normal runtime review and is implemented exactly. The validated source diagnostic boolean is retained independently of the truthful cutover boolean; after the unchanged explicit2026 target/year check, either certified read lane selects the existing History alias and immutable database provenance. Ordinary isolated reads retain their original canonical RPC. No allowlist, translator, SQL, role, RLS, target, external DTO, writer flag or publication change was made by this extension.

The source-bound `evidence/p0f-approved/read-adapters.json` is112/112 PASS:55 focused behavioral tests plus57 existing compatibility tests. The actual History reader/service uses real translators, builder and sanitizer over mocked canonical wire payloads. Required negatives reject before fetch; privileged inspection/scoring/control/publication RPCs remain denied. Public sanitized History remains publicly readable; signed-out public reads are not misrepresented as privileged operations. Guide, leaderboard, completed-history and player-editorial readers execute their actual adapters. No external network or Google request occurs. Ordinary isolated and protected-cutover selection/body remain unchanged under synthetic compatibility fixtures. These are local adapter/service proofs, not hosted database or physical-client proof.

All scoped owner approvals A, B, reduced C, additive API, the two read-adapter branches and this final History RPC branch are approved and implemented. No further authority boundary was discovered; no approval is pending. Previous pending/rejected proposals above are historical, not current authorization. The rejected broad financial proposal was not installed.
