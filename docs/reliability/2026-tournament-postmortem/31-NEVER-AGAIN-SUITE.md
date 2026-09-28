# 2026 Never Again suite

A regression preserves the old failure and proves corrected behavior at its actual layer. Unknown historical causes get analogous fault/containment tests without invented reproduction. All tests here are DESIGNED, NOT EXECUTED. Automated software proof does not substitute for required physical execution.

## NA-2026-001 — PWA tournament-day timezone and mounted-clock defect

**Incident:** 2026-INC-001

**Old failure / evidence scope:** Tournament schedule/day presentation did not consistently derive the live clock, day boundary, and schedule status from the published IANA tournament timezone. The recovered code centralizes published timezone selection, IANA conversion, and a mounted minute/focus/visibility clock.

**Expected assertions:** Tournament-zone day, countdown and status stay correct while mounted across midnight, device-zone mismatch and focus return; lifecycle authority does not change.

**Requirements:** CERT-NA-001, B11-READ-005

**Layers:** UNIT, PWA_BROWSER, INTEGRATION, PHYSICAL. **Environment:** Isolated/Production-shaped certification; NEVER live Production. **Physical required:** True. **Release blocking:** True. **Status:** DESIGNED — NOT EXECUTED by this audit.

## NA-2026-002 — Spectator current-match navigation mixed tournament-wide links with round-scoped position

**Incident:** 2026-INC-002

**Old failure / evidence scope:** The authoritative Game Center view supplied tournament-wide previous/next IDs while its index/count were round-scoped. The spectator adapter copied both into a native DTO whose endpoint invariants require no previous at round index 1 and no next at round index count.

**Expected assertions:** First/interior/last previous-next links target the same round and correct canonical match for paired and unpaired cases.

**Requirements:** CERT-NA-001, B11-NAV-005

**Layers:** SIMULATOR, INTEGRATION, PHYSICAL. **Environment:** Isolated/Production-shaped certification; NEVER live Production. **Physical required:** True. **Release blocking:** True. **Status:** DESIGNED — NOT EXECUTED by this audit.

## NA-2026-003 — Spectator More rendered system dark grouped cards under fixed light Bagger colors

**Incident:** 2026-INC-003

**Old failure / evidence scope:** The Release window selected dark appearance for signed-out state. A nested light preference did not override the window, and inset-grouped List rows remained system-adaptive while Bagger text/icon colors were fixed. The DEBUG gallery forced outer light appearance and masked the defect.

**Expected assertions:** The shipping root remains legible in light/dark and large text; the fixture does not conceal the production appearance hierarchy.

**Requirements:** CERT-NA-001, B11-READ-006

**Layers:** SIMULATOR, INTEGRATION, PHYSICAL. **Environment:** Isolated/Production-shaped certification; NEVER live Production. **Physical required:** True. **Release blocking:** True. **Status:** DESIGNED — NOT EXECUTED by this audit.

## NA-2026-004 — Spectator Today showed unavailable while pending and retried only one required resource

**Incident:** 2026-INC-004

**Old failure / evidence scope:** Today required serial tournament and Leaders reads but had no distinct initial-loading state, so empty nonfailed state rendered unavailable. The unavailable Try Again callback refreshed only Leaders even though tournament was also required.

**Expected assertions:** Initial reads remain Loading until resolved; failure/retry of either tournament or Leaders resource refreshes the needed resource and preserves navigation.

**Requirements:** CERT-NA-001, B11-READ-003, B11-READ-004, B11-READ-007

**Layers:** SIMULATOR, INTEGRATION, PHYSICAL. **Environment:** Isolated/Production-shaped certification; NEVER live Production. **Physical required:** True. **Release blocking:** True. **Status:** DESIGNED — NOT EXECUTED by this audit.

## NA-2026-005 — Native score entry omitted canonical per-hole stroke indicators before first save

**Incident:** 2026-INC-005

**Old failure / evidence scope:** The scoring DTO carries per-hole strokes only inside persisted score rows. Score Entry derives badge values from officialHole(holeNumber); an unscored hole has no row, so canonicalStrokes is nil and the positive-only badge rule renders nothing. Match-level stroke totals exist, but no pre-entry 18-hole allocation matrix reaches this view.

**Expected assertions:** Before any score exists, every displayed hole stroke badge matches the canonical server allocation across formats/handicaps; saved canonical scoring remains unchanged.

**Requirements:** CERT-001, CERT-NA-001, CERT-PHY-001, B11-SCORE-007, B11-SCORE-008

**Layers:** SIMULATOR, INTEGRATION, PHYSICAL. **Environment:** Isolated/Production-shaped certification; NEVER live Production. **Physical required:** True. **Release blocking:** True. **Status:** DESIGNED — NOT EXECUTED by this audit.

## NA-2026-006 — Fractional Swift Date round-trip caused false SQLite score-intent concurrency conflicts

**Incident:** 2026-INC-006

**Old failure / evidence scope:** JSON secondsSince1970 can change a fractional Swift Date by one binary tick. Queue transitions compare the decoded SQLite record with the original in-memory Equatable record exactly. The mismatch throws concurrentModification after a valid server commit/ack or during refresh completion, then a sticky persistence-failure latch stops workers and blocks new local intents.

**Expected assertions:** Real SQLite fractional-time round trips, crash points and same-ID replay resolve matching Official intent once; mismatch stays reviewable; confirmed prior hole never blocks next entry.

**Requirements:** OBS-CORE-001, CERT-001, BE-CONTRACT-001, PWA-001, CERT-NA-001, CERT-PHY-001, CERT-IMPACT-001, B11-NAV-004, B11-SCORE-001, B11-SCORE-002, B11-SCORE-003, B11-SCORE-004, B11-SCORE-005, B11-SCORE-006, B11-READ-007

**Layers:** SQLITE_PERSISTENCE, SQL/RPC, API, SIMULATOR, PHYSICAL. **Environment:** Isolated/Production-shaped certification; NEVER live Production. **Physical required:** True. **Release blocking:** True. **Status:** DESIGNED — NOT EXECUTED by this audit.

## NA-2026-007 — Feature-coded unavailability globally replaced the authenticated shell and defaulted navigation to Today

**Incident:** 2026-INC-007

**Old failure / evidence scope:** MobileReadRepository treats MOBILE_API_UNAVAILABLE as a global authority-revalidation signal for nearly every feature. AppCoordinator changes authenticated state to checkingEnvironment, RootView removes BaggerAppShell, and a healthy recheck creates a new shell whose local @State defaults to Today, Leaders Score, and empty paths. The feature error need not represent invalid participant identity.

**Expected assertions:** Each feature-error trigger preserves valid shell, selected tab and nested path; proven identity rejection still fences protected operations.

**Requirements:** OBS-CORE-001, BE-CONTRACT-001, CERT-NA-001, CERT-PHY-001, AUTO-DEG-001, B11-NAV-001, B11-NAV-002, B11-NAV-003, B11-NAV-004, B11-READ-003, B11-READ-007

**Layers:** SIMULATOR, INTEGRATION, PHYSICAL. **Environment:** Isolated/Production-shaped certification; NEVER live Production. **Physical required:** True. **Release blocking:** True. **Status:** DESIGNED — NOT EXECUTED by this audit.

## NA-2026-008 — Legitimate seven-digit American odds failed backend and native six-digit semantic bounds

**Incident:** 2026-INC-008

**Old failure / evidence scope:** Published MH01 odds +1666567 are legitimate but both the backend projector and native structural validator permit only one through six digits (or signed infinity). Backend returns MOBILE_API_UNAVAILABLE 503; even a synthetically intended 200 DTO decodes then fails native structural compatibility.

**Expected assertions:** Every legitimate calculator output, including seven-digit odds and defined infinity representation, passes compatible backend/native presentation or a feature-local typed state.

**Requirements:** BE-CONTRACT-001, CERT-NA-001, B11-NAV-001, B11-READ-001, B11-READ-003, B11-READ-007

**Layers:** SIMULATOR, INTEGRATION, PHYSICAL. **Environment:** Isolated/Production-shaped certification; NEVER live Production. **Physical required:** True. **Release blocking:** True. **Status:** DESIGNED — NOT EXECUTED by this audit.

## NA-2026-009 — Side-game lifecycle envelopes could be valid while Build 10 detailed screens required a published presentation

**Incident:** 2026-INC-009

**Old failure / evidence scope:** A valid base side-game envelope can represent configured/in-progress/stale/unpublished state with presentation:null. Build 10's Production detailed adapters require a published compatible presentation and throw incompatibleResponse otherwise. In Net Skins, configuration 3 also marked prior current R1/R2 results noncurrent, so historical publications survived but no current presentation existed. This local semantic gap is independent from sibling 503-driven global resets.

**Expected assertions:** R1 Official/R2 Official/R3 Configured and publication/reconfiguration transitions retain correct current/history presentation without global session reset.

**Requirements:** BE-CONTRACT-001, CERT-NA-001, AUTO-DEG-001, B11-NAV-001, B11-READ-002, B11-READ-003, B11-READ-007

**Layers:** SQL/RPC, API, SIMULATOR, FULL_LIFECYCLE, PHYSICAL. **Environment:** Isolated/Production-shaped certification; NEVER live Production. **Physical required:** True. **Release blocking:** True. **Status:** DESIGNED — NOT EXECUTED by this audit.

## NA-2026-010 — Calcutta claim SQL failed before a job could be claimed

**Incident:** 2026-INC-010

**Old failure / evidence scope:** The installed claim function used pg_catalog.greatest and pg_catalog.least as if they were catalog functions. PostgreSQL treats them as special expressions, so function initialization raised SQLSTATE 42883 before the function body, claim, attempt increment, lease, or calculation.

**Expected assertions:** The real installed PostgreSQL claim/process/complete path executes with valid expression syntax and produces the expected presentation from a published auction.

**Requirements:** CERT-001, CERT-NA-001, CERT-SYN-001, CERT-IMPACT-001, DB-PERF-002, BE-JOB-002

**Layers:** SQL/RPC, API. **Environment:** Isolated/Production-shaped certification; NEVER live Production. **Physical required:** False. **Release blocking:** True. **Status:** DESIGNED — NOT EXECUTED by this audit.

## NA-2026-011 — Normal release advancement stranded an activation-bound pending Calcutta job

**Incident:** 2026-INC-011

**Old failure / evidence scope:** Claim and completion require the job activation to equal current activation, while normal rebind increments activation and had no job carry-forward transition. A code repair through the normal release path therefore made the retained job ineligible.

**Expected assertions:** A compatible activation transition retains eligible exact job progress or produces an explicit safe supersession/carry-forward state; incompatible work is denied.

**Requirements:** AUTO-JOB-001, CERT-NA-001, REL-001, BE-JOB-002, BE-JOB-004, BE-DEP-001

**Layers:** SQL/RPC, API. **Environment:** Isolated/Production-shaped certification; NEVER live Production. **Physical required:** False. **Release blocking:** True. **Status:** DESIGNED — NOT EXECUTED by this audit.

## NA-2026-012 — Net Skins configured read and latent worker paths contained invalid SQL expressions

**Incident:** 2026-INC-012

**Old failure / evidence scope:** Seven pg_catalog.greatest/least qualifications across the participant read, claim initializer and official-result normalizer were invalid. The live read failed 42883/503; claim and normalization were proven latent failures.

**Expected assertions:** Configured/no-result and calculated/published reads, plus claim/process/complete SQL, execute correctly; injected feature 503 stays local.

**Requirements:** CERT-001, CERT-NA-001, CERT-SYN-001, CERT-IMPACT-001, DB-PERF-002, BE-JOB-002

**Layers:** SQL/RPC, API. **Environment:** Isolated/Production-shaped certification; NEVER live Production. **Physical required:** False. **Release blocking:** True. **Status:** DESIGNED — NOT EXECUTED by this audit.

## NA-2026-013 — First-write activation mutation aborted atomic R1 Open

**Incident:** 2026-INC-013

**Old failure / evidence scope:** The first canonical mutation audit trigger incremented activation. During atomic Open, the first MARK_LIVE changed activation 234 to 235 inside the transaction; the following ACCESS_ACTIVATE still required release binding 234 and raised 55000.

**Expected assertions:** First whole-round Open cannot alter activation unexpectedly; six or twelve transitions/access changes commit together or all roll back with exact receipt.

**Requirements:** DIR-OPS-001, DIR-OPS-002, CERT-NA-001, REL-001, BE-DEP-003

**Layers:** SQL/RPC, API. **Environment:** Isolated/Production-shaped certification; NEVER live Production. **Physical required:** False. **Release blocking:** True. **Status:** DESIGNED — NOT EXECUTED by this audit.

## NA-2026-014 — PWA scoring-session signing key missing in Production

**Incident:** 2026-INC-014

**Old failure / evidence scope:** SCORING_SESSION_SECRET existed for Preview but was absent from Production. Authorized START_SCORING requests reached session creation, which threw before setting the match-scoped cookie.

**Expected assertions:** Each hosted environment rejects missing signing configuration before freeze; valid configuration loads Official hole and saves one isolated new hole with confirmation/advance.

**Requirements:** BE-CONTRACT-001, PWA-001, CERT-NA-001, CERT-PHY-001, REL-001, BE-JOB-005

**Layers:** SQL/RPC, API, PHYSICAL. **Environment:** Isolated/Production-shaped certification; NEVER live Production. **Physical required:** True. **Release blocking:** True. **Status:** DESIGNED — NOT EXECUTED by this audit.

## NA-2026-015 — Persistent physical-phone service-worker Update banner

**Incident:** 2026-INC-015

**Old failure / evidence scope:** UNKNOWN. The phone's active/waiting/installing worker state was not captured. Source reload behavior and Mac worker state cannot establish the physical phone cause.

**Expected assertions:** Physical active/waiting worker scenarios exercise Update, controller change and reload while preserving auth/intent; do not claim reproduction of the unknown 2026 phone cause.

**Requirements:** PWA-001, CERT-NA-001, BE-JOB-005

**Layers:** SQL/RPC, API, PHYSICAL. **Environment:** Isolated/Production-shaped certification; NEVER live Production. **Physical required:** True. **Release blocking:** True. **Status:** DESIGNED — NOT EXECUTED by this audit.

## NA-2026-016 — Stale Odds lifecycle records blocked initial R3 pairing

**Incident:** 2026-INC-016

**Old failure / evidence scope:** Two independent Odds records blocked setup: the current After-R2 publication and an old After-R1 SUCCEEDED/READY unpublished calculation whose canonical inputs had advanced but whose lifecycle state had not been superseded. Withdrawal itself was blocked by the orphan READY row, and the Director UI exposed no discard/supersede control.

**Expected assertions:** An obsolete unpublished calculation is visibly stale and safely superseded only when no live/public dependency exists; legitimate publication guard remains until owner action.

**Requirements:** DIR-OPS-001, AUTO-JOB-001, DIR-NEXT-001, CERT-NA-001, CERT-SYN-001, DIR-MOB-001, BE-JOB-002, BE-JOB-003, BE-DEP-001, BE-DEP-002, BE-DEP-003, BE-DEP-004

**Layers:** SQL/RPC, API. **Environment:** Isolated/Production-shaped certification; NEVER live Production. **Physical required:** False. **Release blocking:** True. **Status:** DESIGNED — NOT EXECUTED by this audit.

## NA-2026-017 — R3 pairings were committed without preparation, then trapped behind side-game dependencies

**Incident:** 2026-INC-017

**Old failure / evidence scope:** REPLACE_ROUND_PAIRINGS explicitly committed snapshotPrepared:false. All twelve matches retained empty S1 snapshots with NULL prepared revision and handicap revision. Later Net Skins configuration, Odds publication, and Calcutta dependencies blocked ordinary per-match preparation; the late-R3 compatibility predicate was also invalidated by unrelated Net Skins history/pointer changes captured in its broad consumed fingerprint.

**Expected assertions:** Pairing success reports preparation separately; whole-round Prepare proves all contexts current/READY or rolls back; post-R2 side-game chronology cannot produce hidden deadlock.

**Requirements:** CERT-001, DIR-OPS-001, DIR-OPS-002, DIR-CLOSE-001, DIR-NEXT-001, CERT-NA-001, CERT-SYN-001, CERT-PHY-001, DIR-MOB-001, AUTO-HEALTH-001, DB-PERF-001, DB-PERF-003, BE-DEP-001, BE-DEP-002, BE-DEP-003, BE-DEP-004

**Layers:** SQL/RPC, API, FULL_LIFECYCLE. **Environment:** Isolated/Production-shaped certification; NEVER live Production. **Physical required:** False. **Release blocking:** True. **Status:** DESIGNED — NOT EXECUTED by this audit.

## NA-2026-018 — R3 whole-round Open returned an unknown outcome, then its expected fingerprint became stale

**Incident:** 2026-INC-018

**Old failure / evidence scope:** The client retained the operation UUID but not original creation time or HTTP error. No round receipt or any of 24 child mutation keys existed, proving no commit by that operation. Separate per-match Opens changed round state, making the original request fingerprint obsolete; replay would correctly return ROUND_STATE_CHANGED.

**Expected assertions:** Lost Open response resolves using original receipt/ID; independent authority changes produce an explained stale review, never duplicate Open or false partial-commit claim.

**Requirements:** OBS-CORE-001, DIR-OPS-001, DIR-OPS-002, DIR-NEXT-001, CERT-NA-001, CERT-PHY-001, DIR-MOB-001, AUTO-HEALTH-001, BE-SCORE-003, BE-JOB-003, BE-DEP-003

**Layers:** SQL/RPC, API, PHYSICAL. **Environment:** Isolated/Production-shaped certification; NEVER live Production. **Physical required:** True. **Release blocking:** True. **Status:** DESIGNED — NOT EXECUTED by this audit.

## NA-2026-019 — Synchronous side-game invalidation made score writes time out

**Incident:** 2026-INC-019

**Old failure / evidence scope:** Hole and match writes synchronously fired Calcutta and Net Skins enqueue triggers. Calcutta current-result selection called a SQL STABLE compatibility function whose planner evaluated whole-history financial and consumed fingerprints even though result 407 had no qualifying receipt. Both score transactions hit the 8-second statement timeout (57014) and rolled back.

**Expected assertions:** Exact score RPC remains within approved matched-environment latency/plan budgets at accumulated history scale; history/derived failure cannot undo a committed Official score.

**Requirements:** OBS-CORE-001, CERT-001, PERF-001, PWA-001, CERT-NA-001, CERT-SYN-001, OPS-DR-001, HIST-001, CERT-IMPACT-001, BE-SCORE-001, BE-SCORE-002, DB-PERF-001, DB-PERF-002, DB-PERF-003, BE-JOB-001, BE-JOB-002, BE-DEP-002

**Layers:** SQL/RPC, API, PERFORMANCE, QUERY_PLAN. **Environment:** Isolated/Production-shaped certification; NEVER live Production. **Physical required:** False. **Release blocking:** True. **Status:** DESIGNED — NOT EXECUTED by this audit.

## NA-2026-020 — Four physical R3 cards reconciled through supported authority; one was already complete at recovery

**Incident:** 2026-INC-020

**Old failure / evidence scope:** The retained evidence proves a physical-to-canonical completion gap after timeouts and concurrent scoring. It does not prove database corruption or establish one single cause for every missing hole. One card completed independently while recovery was running.

**Expected assertions:** Owner compares a mixed physical card, skips exact Official holes, writes only missing values under canonical guards, stops on conflict, handles concurrent filling and verifies finalization.

**Requirements:** DIR-REC-001, DIR-CLOSE-001, CERT-NA-001, CERT-PHY-001, OPS-DR-001, DIR-MOB-001, BE-SCORE-001, BE-SCORE-003, BE-SCORE-004, BE-JOB-003

**Layers:** SQL/RPC, API, PHYSICAL. **Environment:** Isolated/Production-shaped certification; NEVER live Production. **Physical required:** True. **Release blocking:** True. **Status:** DESIGNED — NOT EXECUTED by this audit.

## NA-2026-021 — No supported way to clear the last draft Calcutta purchase before real auction

**Incident:** 2026-INC-021

**Old failure / evidence scope:** Save-entry contract could replace an entry but did not represent clearing the final entry; missing supported product operation.

**Expected assertions:** Draft clear-last-purchase is explicit and audited; published-state guards, total preservation and immutable prior revisions remain enforced.

**Requirements:** DIR-FIN-001, CERT-NA-001

**Layers:** SQL/RPC, API. **Environment:** Isolated/Production-shaped certification; NEVER live Production. **Physical required:** False. **Release blocking:** True. **Status:** DESIGNED — NOT EXECUTED by this audit.

## NA-2026-022 — Overnight Production authority 503

**Incident:** 2026-INC-022

**Old failure / evidence scope:** UNKNOWN: The reason for the restart; The exact outage start/end; A provider incident; Disk I/O budget reaching zero; A release binding mismatch; The historical query causing the outage

**Expected assertions:** Injected database connection loss/restart produces truthful health, preserved client intent and bounded recovery; canonical state survives.

**Requirements:** OBS-CORE-001, BE-CONTRACT-001, CERT-NA-001, OPS-DR-001, AUTO-HEALTH-001, AUTO-DEG-001

**Layers:** FAILURE-INJECTION, PERFORMANCE, API. **Environment:** Isolated/Production-shaped certification; NEVER live Production. **Physical required:** False. **Release blocking:** True. **Status:** DESIGNED — NOT EXECUTED by this audit.

## NA-2026-023 — Morning authority outage recurrence and heavy live diagnostic risk

**Incident:** 2026-INC-023

**Old failure / evidence scope:** UNKNOWN: A live query plan or block/temp/WAL profile for the 90-second query; OOM, I/O exhaustion, lock contention, or provider failure at the exact window; The broad query causing rather than coinciding with the outage

**Expected assertions:** Tournament diagnostic admission rejects unbounded historical work; injected shared-resource pressure cannot trigger retry storms or misleading commit claims.

**Requirements:** OBS-CORE-001, PERF-001, OPS-SAFE-001, CERT-NA-001, HIST-001

**Layers:** FAILURE-INJECTION, PERFORMANCE, API. **Environment:** Isolated/Production-shaped certification; NEVER live Production. **Physical required:** False. **Release blocking:** True. **Status:** DESIGNED — NOT EXECUTED by this audit.

## NA-2026-024 — Disk I/O budget warning and unproven capacity

**Incident:** 2026-INC-024

**Old failure / evidence scope:** UNKNOWN: The warning's underlying metric values and timezone; Whether the budget hit 100 percent; Whether I/O pressure caused INC-022, INC-023, or the later scoring timeouts; Current compute, storage, pool, region, or plan configuration

**Expected assertions:** Known-capacity fixture triggers warning/no-GO at approved headroom bounds and clears only after stable measured recovery; no inference about historical exhaustion.

**Requirements:** OBS-CORE-001, CERT-001, OPS-SAFE-001, CERT-NA-001, OPS-DR-001, AUTO-DEG-001

**Layers:** FAILURE-INJECTION, PERFORMANCE, API. **Environment:** Isolated/Production-shaped certification; NEVER live Production. **Physical required:** False. **Release blocking:** True. **Status:** DESIGNED — NOT EXECUTED by this audit.

## NA-2026-025 — Insufficient observability prevented root-cause closure

**Incident:** 2026-INC-025

**Old failure / evidence scope:** UNKNOWN: A single common root cause for all failures; That additional provider telemetry would by itself have prevented the incidents

**Expected assertions:** One induced incident is traceable across client/API/RPC/receipt without secrets; missing telemetry is explicit rather than promoted to a cause.

**Requirements:** OBS-CORE-001

**Layers:** FAILURE-INJECTION, PERFORMANCE, API. **Environment:** Isolated/Production-shaped certification; NEVER live Production. **Physical required:** False. **Release blocking:** True. **Status:** DESIGNED — NOT EXECUTED by this audit.

## NA-2026-026 — Physical spectator slow/unavailable observation without request-level causal proof

**Incident:** 2026-INC-026

**Old failure / evidence scope:** UNKNOWN. Candidate requests near observation were200; duration/upstream/correlation unavailable.

**Expected assertions:** Physical slow-network and pending/error cases remain usable and attributable with timing/IDs; original unattributed event remains unknown.

**Requirements:** OBS-CORE-001

**Layers:** FAILURE-INJECTION, PERFORMANCE, API, PHYSICAL. **Environment:** Isolated/Production-shaped certification; NEVER live Production. **Physical required:** True. **Release blocking:** True. **Status:** DESIGNED — NOT EXECUTED by this audit.

Every Never Again regression blocks a tournament release candidate. Critical proof cannot be waived; any noncritical limitation requires explicit governed acceptance rather than silently changing a failed test to PASS.
