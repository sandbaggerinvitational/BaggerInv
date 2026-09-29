# Canonical ownership and capability replacement

**PROVEN — SOURCE:** the current Supabase branch has canonical competitive authority in PostgreSQL. Imported Google provenance is not a live Google dependency. The legacy selectable Google branch was also a writer/read authority; removing that branch is an architectural retirement, not proof that Google was never used as authority.

**Scope:** candidate source and isolated synthetic fixtures. No Production query or real Google access. A `tested` entry below names its layer; it does not certify deployed data completeness, capacity, or owner usability. Final execution results are in [EVIDENCE.md](EVIDENCE.md) and [CERTIFICATION.md](CERTIFICATION.md).

## Final canonical ownership

| Capability | Canonical source and enforcing contract | Google involvement before | Google involvement after | Runtime authority after / required Google |
|---|---|---|---|---|
| Players | `scoring_authority.players`, `tournament_players`; canonical Director player/roster RPCs | Historical import plus legacy live reader | Retained import provenance only | PostgreSQL / NO |
| Identity / authorization | Supabase Auth, `participant_identity` contacts/links/tournament roles; `production_control.director_entitlements`; exact actor checks | Passport selectable identity path and import source | Canonical identity selector; retained historical import evidence | Supabase Auth + PostgreSQL / NO |
| Teams | `scoring_authority.teams` and setup revision/control APIs | Historical import / legacy authoring | No live writer/read selection | PostgreSQL / NO |
| Setup and pairings | `production_control` tournament setup/future-year catalog/match bindings; `scoring_authority.matches`, `match_participants` | Compatibility provisioning prerequisite | Exact canonical prepared context/current revisions | PostgreSQL / NO |
| Handicaps | `handicap_revisions`, approved entries and `handicap_revision_current`; frozen scoring snapshot | Historical import | Provenance retained; no runtime Google authority | PostgreSQL / NO |
| Courses / tees | Approved canonical course/tee/hole definitions in scoring snapshots/setup | Historical import plus legacy read | Current frozen course/tee context | PostgreSQL / NO |
| Scoring contexts | `scoring_snapshots`, match current snapshot reference; setup/handicap guards | Destination copy/mirror metadata | Current exact match/context authority | PostgreSQL / NO |
| Gross score | `submit_production_hole_score`, annual dispatch equivalent; `hole_scores` | Post-commit Sheets mirror; legacy selectable writer | Mirror producer removed; canonical RPC unchanged rules | PostgreSQL / NO |
| Strokes / net | Server calculation inside canonical score RPC from frozen context | Export of computed values | No consumer needed before commit | PostgreSQL / NO |
| Hole result / running match state | Canonical score RPC and `matches` state | Export mirror | No Google acknowledgement | PostgreSQL / NO |
| Match results | Canonical Finalize + complete validated scorecard and result authority | Canonical snapshot plus external archive delivery | Snapshot/audit preserved; no archive completion gate | PostgreSQL / NO |
| Team/player points | Canonical Final results/current bounded read model; unchanged rules | Legacy Sheets result/read projection | Canonical reads and derived projections | PostgreSQL / NO |
| Net Skins | Approved config/entry revisions; `net_skins_v1_*` jobs/results/current authority | Legacy configuration import and reporting | Owner-controlled current inputs; internal calculation/result only | PostgreSQL / NO |
| Calcutta ownership/prices | `calcutta_v1_auction_fact_revisions.auction_manifest` and current config/auction revisions | Historical import; export was a mirror on canonical branch | No provider write-back or destination requirement | PostgreSQL / NO |
| Calcutta result / payout inputs | `calcutta_v1_result_revisions`; internal claimed-job/current fingerprint contracts | Reporting/archive uncertainty, no canonical Sheets calculator on Supabase path | Canonical internal result; owner publication remains controlled | PostgreSQL / NO |
| Odds | Canonical input configuration, calculation jobs, `odds_published_snapshots` / current publication | Legacy publication plus optional Google mirror; annual destination metadata | Owner-controlled canonical publication; old Google origin labels remain history | PostgreSQL / NO |
| Competition / Intelligence | Durable score intents, internal job tables/current derived snapshots | Parallel Google delivery shared post-commit caller | Managed internal workers only | PostgreSQL + unchanged internal calculators / NO |
| History2017–2025 | Certified `completed_history_current_revisions` → immutable `completed_history_revisions` and normalized facts; `read_production_candidate_completed_history` | Original import; selectable live fallback | Canonical service; no live fallback | PostgreSQL / NO; real deployed completeness NOT PROVEN here |
| History2026 | Current canonical match state + coherent `finalized_scorecard_snapshots`; actual current historical read contract | Source provenance supplied through workbook config; archive export was separate | Preview wrapper derives stored SQL provenance; Production translated reader retained | PostgreSQL / NO |
| Records | Canonical completed History and current Final2026 data → request-local `secondary-history-model` / unchanged record engines | Legacy refresh/fallback from Sheets | Strict canonical source and missing-data behavior | Canonical read model / NO |
| Score recovery | Exact mutation receipt and originating actor association; `read_production_score_mutation_status_v1` | Export irrelevant to commit | Canonical receipt remains independent | PostgreSQL / NO |
| Audit | Score mutation receipts, score revision history, audit events, operation receipts; canonical snapshots | Additional external report copy | Required structured receipts retained atomically | PostgreSQL / NO |
| Release / activation | Actual certified deployment/resource tuple, pointer/generation, identities and implementation manifest | Annual/frozen post-cutover Google writer/config completion gates | Migration126 removes only Google-specific admission and keeps canonical gates | PostgreSQL / NO; actual release proof separate |
| Derived jobs | `score_derived_intents_v1` and required Calcutta/Competition/Intelligence jobs; owner-driven Net Skins/Odds where contract requires | Google outbox/archive/compatibility/mirror consumers | No new required Google jobs; old rows preserved as historical delivery evidence | PostgreSQL / NO |
| Annual initialization | Future-year CREATE/setup/configure/promotion, canonical projection authors, handicap/context, exact annual transition | Google destination certification/provisioning gate | Canonical same-database resource plus exact current generation/identity/manifest authority | PostgreSQL / NO at designed source layer; full annual runtime proof required |

These ownership statements do not claim every removed legacy operator convenience has a replacement. The following matrix makes that distinction explicit.

## Legacy capability replacement matrix

| Legacy Google capability | Still needed | Canonical replacement | Implementation exists | Tested layer / limitation | Google runtime may be removed |
|---|---|---|---|---|---|
| Automatic score/report mirror | NO | Score receipts/current state/Director canonical reads | YES | Actual score/control SQL no-enqueue and injected route tests | YES |
| Google scorecard archive delivery | NO for canonical correctness | Validated finalized snapshots and audit | YES | Actual18-hole Finalize/Reopen retains snapshot/invalidation without external jobs | YES |
| Human-readable spreadsheet report | Optional convenience | Existing Director views; future bounded CSV/JSON if requested | Director views YES; new export NOT IMPLEMENTED | No report/export feature parity claimed | YES for tournament runtime |
| External financial synchronization | NO | Current Calcutta/Net Skins authority and internal calculation jobs | YES | Synthetic financial authority byte-preserved while retired delivery denied; worker proof separately required | YES |
| Historical import/reconstruction | YES for maintenance when needed | Retained historical builders/evidence and approved canonical import | Source preserved; live integration retired | Not invoked by boot/read/worker; no real account test | YES; maintenance reconstruction remains separate |
| Future-year match provisioning in Sheets | NO | Canonical match/setup/context APIs | YES | Actual zero-Google annual rehearsal is separate required gate | YES only with annual proof |
| Guide / Draft / Prediction Settings authoring | YES | `production-guide-authoring-server`, `production-draft-authoring-server`, `production-prediction-settings-server`; protected SQL revision/publish contracts | YES | Existing canonical authoring contracts; full new annual initialization remains NOT PROVEN; no Google source certification substitute | YES |
| History rendering | YES | Certified completed-history facts and current2026 snapshots | YES | Injected canonical2017–2026 service fixtures; actual Preview2026 SQL. Real corrected dataset export NOT FOUND locally | YES for source/runtime; external artifacts must be preserved |
| Records | YES | Canonical History/Final2026 record model | YES | Injected semantic fixtures, original record definitions; actual deployed data parity NOT PROVEN | YES for runtime |
| Required audit evidence | YES | Structured canonical score/operation receipts and immutable snapshots | YES | SQL assertions retain receipts/audit/validated snapshots | YES |
| Backup-like spreadsheet copy | Disaster recovery is required, but Sheets was not established as a sufficient backup | Provider backup + independently verified non-Production restore drill | Restore proof UNKNOWN | No restore performed; global backup/restore P0 OPEN | Google reporting is not required DR; do not delete external copies |
| CMS static media/site presentation editing | Requiredness UNKNOWN; likely operator convenience, not golf authority | Canonical presentation reads exist; no established complete editing replacement in this audit | PARTIAL / UNKNOWN | Do not infer editing parity from successful page reads | Runtime read retirement may proceed; optional capability decision remains explicit |
| Passport notification/readiness logs | Optional messaging/readiness convenience; exact parity UNKNOWN | Canonical Supabase enrollment/PlayersAccess/auth exists | Identity YES; message/log replacement NOT ESTABLISHED | No real notification; do not claim optional feature parity | YES for canonical identity; optional loss must remain visible |

## Data and historical evidence preservation

| Artifact/dataset | Current known location | Canonical | Historical value | Durable non-Google copy | Runtime removal / external cleanup |
|---|---|---|---|---|---|
| Score receipts/current/finalized2026 | Canonical schema and retained incident evidence | YES | YES | Canonical database contract exists; real deployed backup NOT VERIFIED | Runtime delivery removable; no real data touched |
| Old Google outbox/archive/checkpoint records | Canonical database historical delivery tables | NO as score authority; YES as delivery evidence | YES | Existing records retained byte-for-byte by125 upgrade test | Runtime retired; old statuses not falsified |
| Completed2017–2025 corrected History | Certified canonical revisions according to read contract | YES when admitted by current pointer | YES | Complete real corrected export NOT FOUND in bounded local inventory | Preserve real account files; owner follow-up before eventual deletion |
| Bundled `lib/historical-data.json` | Repository | NOT SUFFICIENT | YES | YES | Preserved; must not replace certified data. Known stale2019/2020 facts and incomplete scorecard payloads |
| Synthetic fixtures2017–2026 | Repository tests | NO real authority | Test value | YES | Prove behavior only; cannot certify real preservation |
| Original Google reports/Sheets/Drive attachments | Real owner account, not accessed | UNKNOWN per artifact | Potentially YES | UNKNOWN | Never deleted or accessed here; future inventory/preservation required |
|2026 postmortem/release evidence | `docs/reliability/2026-tournament-postmortem` and existing evidence packages | Forensic evidence | YES | YES for preserved package | Unchanged; do not rewrite historical Google references |

**GOOGLE REPORTING/EXPORT IS NOT BAGGER'S DATABASE DISASTER-RECOVERY STRATEGY.** Google retirement does not close backup/restore P0. A separate safe restored-copy drill must establish backup source, completeness, recovery point, restore time and correctness.

## Guardrails for future implementations

Required canonical functionality may not be removed merely because a transport now returns410. Critical runtime proof must execute boot, reads, score/recovery, controls, required side games, workers, annual setup and the432-hole sequence without Google credentials or network. Optional legacy CMS and messaging gaps remain explicit; if either is later established as tournament-critical, its canonical replacement becomes a retirement blocker before promotion. No external Google file or credential is removed in this task.
