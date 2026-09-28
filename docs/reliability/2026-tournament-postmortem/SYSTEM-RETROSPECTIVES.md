# System retrospectives

## Evidence boundary

This retrospective uses the exact Release 139 candidate at SHA `b2065c901f9f6cbdc3dc2f1f37f6b1b782309ec6`, retained incident reports, and the generated incident catalog. “Supported” means a bounded 2026 source path or retained acceptance proves the behavior exists. “Proposed” means a 2027 design recommendation. A supported emergency operation is not automatically a supported product workflow.

## Cross-system matrix

| System | What held | What failed or stayed hidden | False-success risk | False-failure risk | Owner burden created | 2027 decision |
|---|---|---|---|---|---|---|
| Native participant app | Writable scoring remained server-gross-only; an unchanged Build 10 decoded repaired Calcutta/Net Skins responses; bounded relaunch reconciliation exists for some score intents. | Local SQLite timestamp equality, sticky persistence state, shell replacement during feature errors, missing pre-entry stroke allocation, and feature-specific semantic bounds were outside server observability. | Decode/unit success could be called “native ready” without a physical result screen or lifecycle traversal. | A canonical server commit could be followed by a local persistence conflict; a feature-local read failure could destroy the shell and look like an application-wide authority failure. | Relaunch, navigate back, switch to PWA, interpret safe unavailable copy, and verify Official state manually. | Preserve gross-only writes; add durable client operation/ack state, feature-local errors, navigation preservation, canonical pre-entry strokes, and shared conformance fixtures. |
| PWA | The existing PWA completed physical scoring after the Production signing key was installed; canonical reads and writes remained server-owned. | Production lacked `SCORING_SESSION_SECRET`; the phone's active/waiting service-worker state was not captured. Public HTML/SW health did not establish scoring-session health. | HTTP 200 for the shell or `sw.js` could be read as scoring readiness. | A persistent update banner could be blamed for a server 503 without device-worker evidence. | Reload, wait, retry session start, and rely on engineering to separate cache state from server configuration. | Add route-specific secret admission and visible active/waiting worker versions; keep Incident 015 cause `UNKNOWN`. |
| Director | Guarded pairing, setup, match control, side-game and release operations generally failed closed and retained history. | Jobs, publications, prepared contexts, receipts, leases, and dependency reasons were spread across screens or absent. Pairing returned success with `snapshotPrepared:false`. The stale Odds job had no ordinary discard action. | “Pairings saved” could be interpreted as round ready; a generic success did not prove every dependent state. | A safe blocker looked like a broken system because the exact protected fact and supported next action were hidden. | Terminal/SQL investigation, owner-signed exception plans, manually ordered recovery, and repeated readback. | One operations engine returns phase, blockers, consequences, operation ID, retryability, and bounded after-state. |
| Backend application | Authorization, idempotency, expected revisions, fail-closed error mapping, and post-commit consumers existed. | Client/server/domain errors were sometimes collapsed; synchronous side-game work was reachable from the scoring transaction; Production-only configuration was not admitted before traffic. | Application tests around a pure calculator or HTTP transport were allowed to stand in for installed database and physical behavior. | A downstream derived-state failure rolled back valid canonical scoring and appeared as a score failure. | Correlate provider request, RPC, SQLSTATE, mutation ID, job and release by hand. | Keep the synchronous boundary canonical and bounded; emit one minimal committed event; classify outcome and retryability in the response contract. |
| PostgreSQL | Transactions, row/advisory locks, immutable revisions, guards, leases and compare-and-swap prevented partial writes in the examined incidents. | Invalid qualification of PostgreSQL special expressions was installed; SQL `STABLE` planning reached expensive history before a cheap false predicate; current state had duplicate scalar/row representations. | Source review and JavaScript replay passed while the installed function initializer failed. | A planner-time derived query caused an eight-second timeout and rolled back an otherwise valid score. | Exact installed-definition extraction, isolated PostgreSQL reproduction, and bounded Production readback. | Execute installed functions on every branch; constrain current pointers; fingerprint semantic components; prohibit whole-history functions from live-write reachability. |
| Release control | Exact activation binding, protected promotion/rebind, signed plans, rollback artifacts and release locks reduced uncontrolled change. | Normal activation advancement had no disposition for a retained pending Calcutta job; required Production secret inventory was incomplete. | A healthy deployment/rebind could be declared complete while a pending job became invisible to claim or a route-specific secret was absent. | Exact activation correctly rejected work, but without a compatibility workflow it looked like a newly broken processor. | Private exact-job carry-forward, attended release, signed exception, and post-release repair. | Every release declares drain, supersede, retain or audited carry-forward for nonterminal jobs and proves target-environment dependencies before traffic. |
| Net Skins | Configuration and membership were preserved; SQL repair changed only seven invalid qualifications; per-round result revisions and guarded worker lifecycle exist. | Configured/unpublished/null-presentation was valid server state but not a populated Build 10 detail screen; read, claim and normalization shared the same SQL defect class. | HTTP 200 plus DTO decode could be called full participant success before an Official result existed. | Safe “unavailable/no results inferred” copy could be mistaken for a failed repaired backend. | Understand configured versus published, wait for real golf, and separately verify participant navigation. | Model configuration, job, current result, publication and presentation separately; keep Official auto-publication policy explicit and per round. |
| Calcutta | Immutable configuration, auction, publication, job and result histories; guarded correction workflow; protected exact-job recovery. | Claim SQL failed before body execution; release advancement stranded the pending job; synchronous invalidation reached broad history; `current.state/result_revision`, result `is_current`, and read-derived state can diverge. | A published market could be read as a current result; revision progression could be misread as contradictory evidence. | An intact auction/result could present unavailable because claim, activation or derived freshness failed. | Owner-signed release repair, carry-forward, manual processing, and exact financial comparison. | One constrained current pointer, explicit visibility, durable job disposition, semantic component manifests, and a certified immutable correction flow. |
| Odds | Calculation, review, publication, withdrawal and supersession are distinct retained operations; current public history was preserved. | A current publication and an obsolete SUCCEEDED/READY unpublished calculation independently blocked R3 setup; the Director lacked a supported ordinary clearance action. Backend/native numeric bounds also rejected a legitimate seven-digit value. | A published/current label or prior HTTP 200 could be mistaken for current semantic usability. | A stale retained calculation could look active and prevent a valid withdrawal/pairing transition. | Engineering identified changed components and invoked the supported supersede operation before the owner could withdraw. | Separate execution, freshness, review and visibility; expose exact changed components and a supported action for every blocker; share the complete output-domain contract with clients. |

## Surface parity: supported and proposed

Legend: **Supported** is evidenced in the pinned system or retained reports; **Proposed** is a 2027 product capability; **Not a participant action** is intentionally unavailable to Native/PWA participants; **Unproven** means the source/report review did not establish that surface.

| Capability | Native | PWA | Director | Server/worker |
|---|---|---|---|---|
| Read canonical match/hole authority | Supported, with known Build 10 presentation/lifecycle gaps | Supported | Supported | Supported |
| Submit a hole | Supported; gross-only; known local queue defects | Supported; gross-only | Supported by server authority; routine Director recovery UI proposed | Supported |
| Reconcile lost score response | Bounded relaunch path supported; general receipt UI proposed | Refresh/readback supported; explicit receipt UI proposed | Proposed operation search | Mutation row/readback supported; universal receipt contract proposed |
| Finalize a complete match | Supported contract; physical breadth is limited | Supported | Supported server operation; unified workflow proposed | Supported |
| Pair a round | Not a participant action | Not a participant action | Supported | Supported whole-round mutation |
| Prepare scoring contexts | Not a participant action | Not a participant action | Per-match supported; whole-round self-certifying workflow proposed | Per-match supported; Release 138 exact recovery was incident-specific |
| Open, Lock, Resume a round | Not a participant action | Not a participant action | Supported atomic round controls | Supported with immutable round receipt |
| Inspect every setup blocker before mutation | Not a participant action | Not a participant action | Proposed | Proposed dependency plan; current guards return bounded blockers at individual steps |
| Net Skins lifecycle | Supported participant projection, including safe unavailable state | Supported participant projection | Supported configuration/processing; clearer per-round lifecycle proposed | Supported guarded worker |
| Calcutta lifecycle and correction | Supported participant projection | Supported participant projection | Core operations supported; routine end-to-end correction certification proposed | Supported immutable revisions and guarded worker |
| Odds lifecycle clearance | Supported participant projection with known numeric-domain gap | Supported projection | Publish/withdraw/supersede supported; combined action plan proposed | Supported job/publication authority |
| Physical-card reconciliation | No dedicated workflow | No dedicated workflow | Proposed P0 | 2026 incident procedure proved a safe per-hole pattern; product workflow proposed |
| Close and archive tournament | Read-only archive consumption only | Read-only archive consumption only | Proposed | Proposed manifest/receipt operation |

## Hidden state, false success and false failure

### Hidden state

The most consequential hidden state was not one table. It was state that existed at a boundary but was invisible to the next operator:

- a pending job's activation binding across a release;
- an Odds READY row distinct from the current publication;
- paired matches whose preparation pointers were still empty;
- an operation UUID without a recorded client time/error and without a round receipt;
- a phone service worker's active/waiting/installing state;
- a native score intent whose server result and local SQLite transition disagreed;
- a side-game current pointer, publication visibility and derived read state that could disagree.

Every hidden state needs an owner, a durable identity, a current status, a reason, and a supported next action. If it can block a tournament action, it belongs in the Director operation plan.

### False success

Certification produced false confidence when it proved a lower layer and named a higher one: pure calculation instead of PostgreSQL claim, DTO decode instead of populated physical screen, shell health instead of scoring-session health, pairing commit instead of preparation, or result revision existence instead of visibility/currentness. The proof label must always carry its scope.

### False failure

Valid protective behavior also looked like failure: exact activation rejected a stranded job; side-game dependency guards rejected setup; safe pre-golf Net Skins rendered unavailable; stale fingerprints rejected replay. The product must explain the protected fact and recovery path so operators do not bypass a correct guard.

### Owner burden

The owner repeatedly had to translate generic states into operational decisions: approve protected releases, verify physical cards, select exact retries, distinguish publication from calculation, refresh an unchanged app, and confirm post-repair screens. The redesign should move evidence collection and bounded comparison into the system while leaving financial publication, correction and competitive overrides under explicit owner control.

## Simplification register

| ID | Simplification | Removes | Preserves |
|---|---|---|---|
| SIM-BE-01 | One gross-only writable scoring contract across Native, PWA, Director and recovery | Per-client derived-score interpretations | Server scoring authority and optimistic revisions |
| SIM-BE-02 | One immutable operation receipt shape | Ad hoc request keys, child-key forensics and ambiguous retries | Domain-specific payloads and guards |
| SIM-BE-03 | One constrained current pointer per derived domain/scope | Scalar revision plus independent `is_current` plus read-derived currentness | Immutable result history |
| SIM-BE-04 | One minimal canonical-change event seam | Synchronous side-game snapshot/hash construction in score writes | Transactional durability and independent consumers |
| SIM-BE-05 | One dependency-plan vocabulary | First-blocker-only generic errors | Exact activation/source/publication guards |
| SIM-BE-06 | One release job-disposition gate | Emergency carry-forward discovery after promotion | Exact activation and audited compatibility |
| SIM-BE-07 | One lifecycle vocabulary for execution, freshness, review and visibility | Overloaded `READY`, `CURRENT` and `UNAVAILABLE` labels | Domain publication policy |
| SIM-BE-08 | One bounded before/after/readback envelope | Whole-database comparisons and unbounded historical diagnostics | Immutable history outside the live path |

## Debt register

| Category | Debt | Evidence | Retirement condition |
|---|---|---|---|
| Architecture | Side-game work is synchronously reachable from score/match updates. | Incident 019 and Calcutta/Net Skins triggers. | Worker pause cannot make canonical scoring fail; one minimal event commits with the score. |
| Architecture | Current state is duplicated across pointers, flags and derived reads. | Calcutta schema/fail/read paths. | One foreign-key pointer and a reconciliation query establish currentness. |
| Architecture | Dependency hashes include history/control metadata. | Incident 017 broad fingerprint reconstruction. | Versioned component manifest changes only for consumed semantic facts. |
| Operations | Pair, Prepare and Open are separable but were presented without one phase model. | Incidents 017 and 018. | Director exposes `PAIRED_UNPREPARED`, `READY`, `LIVE` and receipt-backed transitions. |
| Operations | Physical-card recovery is an incident procedure. | Incident 020: bounded per-hole recovery, no corruption found. | P0 Director workflow handles missing, matching, conflicting and unknown holes. |
| Operations | Side-game and correction actions require engineering interpretation. | Incidents 011, 016 and historical Calcutta correction report. | Every blocker has one supported action or explicit safe stop. |
| Test | Application tests can bypass installed SQL paths. | Incidents 010 and 012. | Every installed function branch executes on the supported PostgreSQL major. |
| Test | Certification labels do not always state physical/lifecycle scope. | Net Skins pre-golf screen and R3 bounded recovery. | Evidence catalog uses scoped layer names and retains limitations. |
| Test | History growth and planner behavior were absent from live-write certification. | Incident 019. | Production-shaped history/plan evidence is a release artifact. |
| Observability | Request, operation, mutation, job and provider traces are not one chain. | Unknown Open and infrastructure investigations. | Director lookup returns bounded lineage and outcome without terminal access. |
| Observability | PWA worker and native durable-intent states are invisible to support. | Incidents 006 and 015. | Safe client telemetry shows versions/status/retryability without secrets. |
| Observability | Public shell health obscures domain health. | Incident 014 and infrastructure reports. | Route/domain health is separately measured and release-gated. |
| Automation | Releases do not disposition nonterminal jobs. | Incident 011. | Promotion blocks until every job has drain/supersede/retain/carry-forward policy. |
| Automation | Setup discovers blockers serially. | Incidents 016 and 017. | Read-only plan returns all blockers and consequences before the first mutation. |
| Automation | Derived consumers lack one independent replay/checkpoint contract. | Incident 019; existing Google outbox is only prior art. | Independent consumers pass pause, replay, duplicate and poison-event drills. |

## Evidence anchors

- Native and surface findings: `incident-register.json`, Incidents 004-009.
- Backend/database/release findings: `incident-register.json`, Incidents 010-020.
- Pairing contract: `supabase/production_migrations/202609090095_production_round_pairings_v1.sql:46-185`.
- Atomic round controls: `supabase/production_migrations/202609220108_atomic_round_scoring_v1.sql:20-158`.
- Scoring/finalization: `supabase/production_migrations/202608240021_production_scoring_operations.sql:549-679` and `:931-1145`.
- Side-game lifecycle: `docs/19-SIDE-GAME-LIFECYCLE.md`.
- Exact retained incident evidence is indexed in `evidence-ledger.json`.
