# Explicit answers to all final verdict questions

Answers distinguish historical observations, bounded proof and recommendations. See [evidence](56-EVIDENCE-LEDGER.md), [incident register](02-INCIDENT-REGISTER.md), [unknowns](68-UNRESOLVED-QUESTIONS.md).

## Did the software fail at an unacceptable rate?

Yes. Repeated scoring, round setup/open, side-game and native-navigation failures required six incident-driven releases 134–139 and physical recovery. A numerical failure rate cannot be computed from missing traffic/telemetry.

## Did canonical competitive authority remain intact, and why?

The examined snapshots and receipts support preserved canonical golf, with all 24 Final / 432 Official and exact card reconciliation. Server scoring, atomic rollback, idempotency and guarded mutations prevented client/derived failures from silently changing scores. No exhaustive historical comparison was run.

## Was Build 10 over-certified relative to evidence, and why?

Overall confidence was too broad. The documented local/simulator suites were real, but did not prove physical persisted multi-hole scoring or full lifecycle resilience. Some original reports explicitly withheld physical proof; their qualifiers must remain.

## Were failures primarily code, architecture, infrastructure, testing, operations or multifactor?

Multifactor. Several immediate code defects are proven; shared architectural and certification gaps let them escape and enlarge impact. Infrastructure availability failed, while exact resource causation remains unknown.

## Single biggest technical failure class?

Overcoupled state and synchronous dependencies: optional feature errors changed global shell state, broad side-game/activation dependencies blocked progression, and derived history work blocked score commits. These share coupling as a design class, not one code bug.

## Single biggest certification failure?

Substituting component or wrong-layer success for complete, Production-shaped chronological and physical proof.

## Single biggest operational failure?

Director lacked a self-explanatory, self-verifying supported workflow for hidden dependencies, preparation, unknown outcomes and physical score recovery; engineering became the live control plane.

## Single biggest infrastructure risk?

Unmeasured resource headroom on the shared database primary, exposed by an I/O depletion warning and connection outages, with diagnostics and scoring competing for capacity.

## Most dangerous incident to competitive integrity?

The score-write/unknown-outcome failures created the greatest duplication/overwrite hazard if blindly retried or manually repaired. Atomic/idempotent contracts and exact comparisons prevented that outcome in examined evidence. No proved corruption incident is ranked as though corruption happened.

## Most owner burden?

The R3 preparation→health→Open→score-timeout→physical-card sequence collectively. Exact person-hours and a defensible single-event maximum are unknown.

## Failure class contributing to most incidents?

Certification boundary gaps are the broadest common escape mechanism. Lifecycle/dependency coupling is the broadest concrete backend architectural contributor; incident associations are enumerated rather than treated as statistically independent counts.

## Safeguard that saved the most serious consequences?

Canonical server authority with atomic transactions and idempotent receipts. Physical cards and PWA protected tournament completion when digital paths failed.

## Could the majority have been caught before the tournament? How?

Yes: actual installed SQL lifecycle, real SQLite persistence, long-lived physical multi-device scoring, hosted configuration checks, post-R2 → R3 chronological rehearsal and history-growth benchmarks. Exact external outage timing may be unforeseeable; recovery behavior and headroom are testable.

## Was raw test count given too much weight?

Yes when used to imply overall readiness. Counts still accurately describe the executed regressions and should be retained with requirement/layer coverage.

## Did component testing exceed complete lifecycle testing?

Strongly supported. The observed failures crossed component boundaries and lifecycle states absent from the retained pre-event proof.

## Did we confuse simulator/local with physical/Production proof?

Overall confidence sometimes did. Several reports explicitly distinguished them; the audit preserves that counterevidence and does not accuse every report of the same mistake.

## Was Production used for diagnostics that belonged elsewhere?

Yes. A broad historical eligibility aggregation exceeded 90 seconds during live operations. Deep comparisons belonged in an isolated copy.

## Did diagnostic/certification activity create material Production risk?

Yes, unbounded shared-primary work created material resource risk. Its causal role in the outages is plausible, not proven.

## Was database capacity adequately certified?

No adequate retained resource, headroom, or soak proof was found. HTTP 200 health windows are not capacity certification.

## Were side-game dependencies too broad?

Yes in inspected paths: Calcutta compatibility included Net Skins, history, and pointer changes beyond relevant financial and completed-golf meaning, and future preparation was blocked despite semantic preservation being provable.

## Was score submission doing too much synchronous work?

Yes. The proven SQL `57014` stack reached Calcutta compatibility and fingerprint work from score and match triggers.

## Was native feature health too coupled to session/navigation?

Yes. Generic unavailability invoked global authority revalidation, removed authenticated shell and recreated default Today. Write authority may be fenced without destroying valid navigation.

## Did Director expose enough state for nonengineering operation?

No. Jobs, exact dependency causes, prepared absence and operation outcomes required forensic interpretation.

## Were fallbacks adequate; which worked?

Partially. PWA worked after Release 137 and physical cards plus canonical recovery completed golf. PWA shares the backend and failed with its timeout; Director recovery needed engineering. Fallbacks existed but were not sufficiently rehearsed/productized.

## What must be true before trusting native scoring again?

Normalized real persistence; same-ID reconciliation, lost-acknowledgement, and conflict tests; context-preserving typed errors; physical 18-hole, all-format, multi-device, network, and upgrade proof against current contracts; safe handoff. One successful relaunch is insufficient, and Build 10's first relaunch was not guaranteed in the retained exact-code matrix.

## What must be true before trusting round operations again?

Exact atomic contracts, fresh GO, current contexts, receipt/readback and stale-fingerprint recovery; concurrency/rollback/lost-response tests and owner chronological rehearsal.

## What must be true before trusting side-game automation?

Real SQL full lifecycle and job compatibility; narrow semantic inputs; current/history presentation; visible retry and supersession; financial review and publication boundaries; idempotency; and chronological regression.

## What must be true before saying Tournament Ready?

Every mandatory fresh P0 proof layer passes; full synthetic, physical, and owner chronology passes; measured capacity, fallback, restore, security, and rollback checks pass; no P0 evidence is missing; and P1 limitations are explicitly accepted.

## Did we lose canonical data?

No evidence of loss in examined canonical snapshots and recovered cards. Failed and uncommitted digital golf was reconstructed from physical records; that is distinct from losing committed Official data. Exhaustive history-wide absence of loss remains unproven.

## Did we duplicate canonical competitive data?

No duplicate score commit was found in exact replay/recovery evidence; all 72 recovered holes matched their intended canonical records. Jobs and results legitimately have revisions; broad history-wide duplicate analysis was not performed.

## Should we keep Supabase and evaluate AWS?

HARDEN Supabase first, high confidence in sequencing. AWS is a conditional POC decision gate, not a current migration requirement. Same SQL defects would follow a migration.

## Can current system be trusted for another tournament unchanged?

No as primary 2027 tournament software under the requested readiness standard. Safe golf authority is valuable but does not establish reliable availability/operability.

## What should never be automatic?

Conflicting Official score resolution, approved handicap/pairing changes, financial ownership changes, public financial publication, historical competitive correction, final Close, or bypassing core guards without named owner authority.

## What should be automated?

Bounded health/GO/closeout, exact operation status/readback, safe stale-job detection, current projections, alerting, evidence/impact gates and supported lifecycle guidance; owner retains competitive judgment.
