# Critical-path diagrams

These diagrams distinguish observed Release 139 behavior from the proposed 2027 architecture. They are design aids, not evidence that the proposed components exist.

## 0. Proposed implementation prerequisite DAG

Solid arrows are true prerequisites. Dashed lines are integration contracts designed jointly; they do not reverse the prerequisite arrows.

```mermaid
flowchart LR
  DB2[DB-PERF-002] --> DB3[DB-PERF-003] --> J3[BE-JOB-003]
  DB2 --> DB1[DB-PERF-001] --> D2[BE-DEP-002] --> D1[BE-DEP-001] --> J4[BE-JOB-004]
  DB3 --> J1[BE-JOB-001]
  J3 --> J1
  J1 --> J2[BE-JOB-002]
  D1 --> J2
  J1 --> S2[BE-SCORE-002]
  DB1 --> S2
  J1 -. integration .- J2
  J1 -. integration .- S2
  DB3 -. integration .- J3
  DB1 -. integration .- D2
  D1 -. integration .- J4
```

## 1. Score write: observed and proposed

Observed at the pinned candidate, score and match mutations synchronously reach Calcutta and Net Skins enqueue triggers. Incident 019 showed a Calcutta compatibility predicate could reach broad historical fingerprints and time out the entire score transaction.

```mermaid
flowchart LR
  C[Gross-only client request] --> S[score_hole RPC]
  S --> A[Authority + revision checks]
  A --> M[Server scoring math]
  M --> W[Hole + match writes]
  W --> CT[Calcutta enqueue trigger]
  W --> NT[Net Skins enqueue trigger]
  CT --> FH[Late-R3/full-history compatibility]
  FH -->|57014| RB[Whole transaction rollback]
  NT --> NJ[Net Skins job]
  W --> GO[Google outbox]
```

Proposed, the score transaction performs only bounded canonical work and writes one minimal committed event. Independent consumers can fail or pause without rolling back golf.

```mermaid
flowchart LR
  C[Gross-only client request] --> S[Score transaction]
  S --> R[Receipt/idempotency]
  S --> A[Authority + revision checks]
  S --> M[Server scoring math]
  S --> W[Canonical hole + match]
  S --> E[Minimal transactional event]
  W --> K[Commit]
  E --> K
  K --> ACK[Canonical acknowledgement]
  E -.after commit.-> CJ[Calcutta consumer]
  E -.after commit.-> NJ[Net Skins consumer]
  E -.after commit.-> OJ[Odds/intelligence consumer]
  E -.after commit.-> XJ[External mirror consumer]
```

The unified derived-state event is proposed. The existing Google outbox and post-commit consumers are useful prior art, but they do not prove this architecture is implemented.

## 2. Transactional event and durable consumers

```mermaid
sequenceDiagram
  participant Client
  participant DB as Canonical DB transaction
  participant Outbox as Derived event outbox
  participant Worker as Independent consumer
  participant Result as Derived result/pointer

  Client->>DB: submit gross + operation ID + expected revisions
  DB->>DB: lock, authorize, validate, derive, write
  DB->>Outbox: insert minimal deduplicated event
  DB-->>Client: commit canonical receipt/result
  Worker->>Outbox: claim with bounded lease
  Worker->>Worker: construct scoped semantic source
  Worker->>Result: compare-and-swap immutable result/current pointer
  Worker->>Outbox: checkpoint delivery
```

A rollback removes both canonical mutation and event. A consumer retry uses the same event/delivery identity and cannot republish stale input.

## 3. Release advancement and retained jobs

Incident 011 followed the left-hand path. The right-hand path is the proposed contract.

```mermaid
flowchart TD
  P[Pending job bound to activation 232] --> R[Release rebind advances to 233]
  R --> Q{Disposition recorded?}
  Q -->|Observed: no| I[Job remains pending but claim-ineligible]
  Q -->|Drain| D[Complete before activation]
  Q -->|Supersede| S[Retain history + immutable receipt]
  Q -->|Compatible carry-forward| V[Validate contract/source/config/attempt/lease]
  V --> G[Private authority transition + receipt]
  G --> C[Claim under activation 233]
  Q -->|Incompatible| B[Block promotion with exact reason]
```

Exact activation guards stay in place. A compatible transition changes authority through a recorded operation; consumers never ignore expected activation.

## 4. R3 pair, prepare and open

```mermaid
stateDiagram-v2
  [*] --> Unpaired
  Unpaired --> Paired: pairing commit receipt
  Paired --> Preparing: build 12 canonical snapshots
  Preparing --> Prepared: 12/12 READY and dependency plan compatible
  Preparing --> Blocked: named match or dependency failed
  Blocked --> Preparing: supported recovery + new receipt
  Prepared --> Opening: atomic Open operation
  Opening --> Open: committed receipt found
  Opening --> Unknown: response lost and no result yet
  Unknown --> Open: receipt/canonical reconciliation proves commit
  Unknown --> Prepared: receipt proves no commit and predecessor still matches
  Unknown --> Stale: another operation changed pair/preparation/access state
```

Incident 017 had 12 pairings but 0/12 prepared snapshots. Pairing success must therefore never render as ready. Incident 018 also shows that an unknown whole-round Open cannot be retried after separate per-match operations changed state.

## 5. Unknown mutation outcome

```mermaid
flowchart TD
  A[Submit operation ID X] --> T{Response received?}
  T -->|Yes| C[Render canonical receipt/result]
  T -->|No or timeout| L[Lookup receipt X + canonical scope]
  L -->|Committed| C
  L -->|No commit and predecessor unchanged| R[Enable same-ID replay]
  L -->|No commit and scope advanced| S[Mark saved intent stale]
  L -->|Lookup unavailable| U[Hold; do not create a replacement ID]
```

## 6. Calcutta ownership correction

The workflow below is supported by the pinned candidate's source. It must be certified end to end before routine tournament use.

```mermaid
flowchart LR
  O[Published Official result] --> U[Unpublish]
  U --> A[Write complete immutable auction revision]
  A --> H[Preserve prices + unaffected ownership]
  A --> X[Supersede pending/running job and current result]
  X --> P[Create new unpublished publication revision]
  P --> RP[Republish]
  RP --> J[Queue one calculation]
  J --> N[New immutable Official result]
  N --> V[Participant projection uses corrected owners]
```

The reference fixture is only the read-only snapshot at `2026-09-27T12:26:41.188212Z`: auction revision 37, publication 41, result 424, 24 purchases totaling $18,500, and all 24 golfers final. It is historical, not a current-live assertion.

## Source anchors

- Gross-only scoring transaction: `contracts/mobile/v1/scoring-hole-request.schema.json:11-12` and `supabase/production_migrations/202608240021_production_scoring_operations.sql:931-1145`.
- Calcutta synchronous triggers: `supabase/production_migrations/202608290056_production_calcutta_v1.sql:1529-1615`.
- Net Skins synchronous triggers: `supabase/production_migrations/202608290055_production_net_skins_v1.sql:1138-1213`.
- Existing score Google outbox: `supabase/production_migrations/202608240021_production_scoring_operations.sql:1138-1144`.
- Calcutta replace/publish/unpublish paths: `supabase/production_migrations/202608290056_production_calcutta_v1.sql:1033-1178`, `:1698-1858` and `:1867-2010`.
- Incident evidence: `/private/tmp/bagger-calcutta-processor-repair/REPORT.md`, `/private/tmp/bagger-r3-readiness-recovery/REPORT.md`, `/private/tmp/bagger-r3-open-outcome/REPORT.md`, `/private/tmp/bagger-r3-write-timeout/REPORT.md` and `/private/tmp/bagger-calcutta-ownership-readonly/REPORT.md`.
