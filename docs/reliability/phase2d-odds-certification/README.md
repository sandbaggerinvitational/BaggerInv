# Local Odds Certification path

Authorization: local implementation and certification only. No hosted reads,
mutations, publication, deployment, Production/old Preview access, or Google
access occurred. Hosted OFF/disabled/paused and zero pending work are the
owner-provided checkpoint, not a fresh hosted observation in this task.

Base: `a2f6c44cc7a1f85e70d64649b22821554f83b641`.

## Findings and correction

The hosted input error is truthful: canonical Odds calculation requires a valid
`scoring_authority.odds_input_configurations` revision. None exists. Production
settings authoring is Production-only; the legacy settings synchronization uses
Google. Neither is an authorized Certification seed path.

Production authoring stages and validates a draft before committing through its
Director authority. Its commit requires an existing seed configuration to retain
ratings/source lineage. Calling that transport to bootstrap Certification would
misrepresent authority/provenance. The reusable domain core is
`production_control.validate_prediction_settings_v1(jsonb,jsonb)`, the canonical
hash functions, immutable configuration revision store, audit store and receipt
helpers. This correction reuses those cores without copying a Production seed,
adding a Production-shaped binding, or changing Production transports.

The Production RPC sequence is `stage_production_prediction_settings_revision_v1`
→ `validate_production_prediction_settings_revision_v1` →
`commit_production_prediction_settings_revision_v1`, with immutable
`prediction_settings_drafts_v1`, `prediction_settings_revision_provenance_v1`,
`prediction_settings_operation_receipts_v1` and audit history. The legacy
`/api/odds/prediction-settings` synchronization reads the Google Prediction
Settings tab, builds its projection and imports through
`import_preview_championship_odds_inputs`. It is neither called nor used as a
fallback by this Certification chain. No existing transport is repurposed.

`DIRECTOR.CONFIGURE_ODDS_INPUTS` is admitted through the existing
`/api/director/canonical-operations` route, family `ODDS_INPUT_CONFIGURATION`,
action `configure`. This is a fixed Certification profile, not a general settings
editor. The only payload fields are expected revision, fixed profile,
confirmation and reason. Resource/project/tournament/release/deployment/Director
identity come from the authenticated server context and are checked again by SQL.
Director admission must be enabled by the existing owner control. Configuration
itself neither starts calculation nor publishes anything.

A related installed guard denied every Odds publication at supervisor START.
Publishing creates normal TOURNAMENT_INTELLIGENCE/PROJECTION_EDITORIAL demand,
so that guard made a complete post-publication drain impossible. The forward
artifact narrows this guard to reject unverified/Final Results publications and
retains the canonical FinalRecap eligibility exclusion. The five-engine registry
is unchanged: TEAM_MOMENTUM, TOURNAMENT_STORYLINES, TOURNAMENT_INTELLIGENCE,
PROJECTION_EDITORIAL, CALCUTTA. **Odds is not a Queue engine.** No reservation,
claim, lease, STOP/HALT, retention, visibility, worker implementation, or financial
mutation authority changes.

## Fixed deterministic synthetic profile

Profile `CERTIFICATION_DEFAULTS_V1` supplies all 30 required settings from the
canonical definition defaults. The validator's settings fingerprint must equal
`d95218665e2dac25867f6f7f40b4c16256201e6b51eaa38152cb88a2cc92b4c0`;
definition drift fails closed. The caller cannot submit settings values.

| Canonical field | Value | Purpose |
| --- | --- | --- |
| Handicap Category Weight | 12 | Required category blend |
| Player Category Weight | 42 | Required category blend |
| Team Category Weight | 28 | Required category blend |
| Opponent Category Weight | 13 | Required category blend |
| Tournament Category Weight | 5 | Required category blend |
| Format Win Percentage | 28 | Required player component |
| Overall Win Percentage | 22 | Required player component |
| Recent Form | 15 | Required player component |
| Average Points Per Match | 10 | Required player component |
| Career Points | 5 | Required player component |
| Tournament Experience | 5 | Required player component |
| Sandbagger Rating | 15 | Required player component |
| Net Stroke Advantage | 20 | Required handicap component |
| Front 9 Stroke Advantage | 27 | Required handicap component |
| Back 9 Stroke Advantage | 27 | Required handicap component |
| Stroke Hole Distribution | 26 | Required handicap component |
| Better Player Handicap Difference | 5 | Required handicap component |
| Lesser Player Handicap Difference | 1 | Required handicap component |
| Underlying Skill Points Per Handicap | 0.5 | Required handicap scale |
| Maximum Underlying Skill Adjustment | 8 | Required adjustment bound |
| Scorecard Influence Enabled | false | No fabricated calibration history |
| Scorecard Category Weight | 10 | Required inactive calibration parameter |
| Maximum Scorecard Adjustment | 6 | Required inactive calibration bound |
| Minimum Scorecard Confidence | Moderate | Required calibration enum |
| Minimum Scorecard Recorded Rounds | 2 | Required calibration minimum |
| Minimum Scorecard Recorded Holes | 36 | Required calibration minimum |
| Maximum Win Probability | 90 | Required probability bound |
| Minimum Win Probability | 10 | Required probability bound |
| Minimum Matches for Full Confidence | 8 | Required confidence scale |
| Prediction Model | SBI v1.0 | Required model identifier |

Historical ratings are `{}`: no invented player history. The existing engine
handles this supported empty history normally. Settings, effective settings,
ratings, pairing, source and bundle fingerprints are canonical. Validation
retains the installed type/enum/range, weight-group and probability rules; Odds
mathematics and input preparation are unchanged.

Provenance is `CERTIFICATION_SYNTHETIC`, with explicit synthetic/owner-approved,
Google-access=false, Production-source=false, profile, Director auth identity,
resource, release and deployment metadata. The existing registered synthetic
resource provenance URN is stored in the historically named `source_workbook_id`
field; this is not a Google workbook, credential or request. The source tab and
imported-by labels explicitly identify Certification. No falsely classified
Google/Production draft/projection row is created.

The current configuration uses the existing partial unique current index and
monotonic configuration revision; predecessor configuration IDs/history remain.
The advisory lock plus revision CAS serialize configuration writes. Identical
operation replay resolves the exact canonical receipt; changed payload under
that identity conflicts. A fresh identical fixed-profile request is UNCHANGED,
not another configuration revision. Absence of a receipt after the same
transaction lock proves NOT_COMMITTED for this wholly atomic operation. A failed
status read still leaves UNKNOWN; transport failure alone cannot prove rollback.
Certification uses the existing `cutover_operation_receipts` helpers and the
Prediction Settings audit table. Explicit Certification provenance is kept in
the canonical configuration's diagnostics, not falsely inserted into the
Production provenance table's SUPABASE_DIRECTOR/Google classification.

## Execution and publication trace

The existing `/api/director/canonical-odds` route authenticates an active entitled
Director and enforces same-origin POST. It calls the Certification canonical
Odds adapter, checks current runtime/input/source context, and creates the
canonical calculation job/checkpoint. `after()` schedules
`processCertificationOddsCalculationJob` in the same bound Preview runtime.

The processor delegates to the unchanged checkpointed Odds engine. The SQL job
identity binds resource installation, release/runtime and admission generations,
input revision/settings/ratings/pairing/source fingerprints and deterministic
calculation identity. Claim ownership uses a 12-minute lease; each stored
checkpoint renews that lease. Default chunks are 2,500 iterations. Completion
requires the same owner, complete verified checkpoint, exact canonical result
fingerprint and current source. Source advance supersedes old work rather than
publishing it. Concurrent/repeated successful jobs do not execute twice.

The route declares `maxDuration=800`. That is a requested configuration, not a
newly measured hosted duration guarantee. The minimal supported 10,000-iteration
local fixture completes with four checkpoints, comfortably below a 60-second
runtime. If hosting ends processing early, durable checkpoints/lease survive;
Director GET schedules PENDING/RETRYABLE or expired RUNNING work. An explicit
failure records RETRYABLE and preserves progress/attempt count. This installed
Odds architecture has no automatic five-attempt job ceiling or autonomous Queue
retry budget; retries are Director-initiated with current authority. Those
semantics are retained, not imported from the derived Queue worker.

Durable state is in `odds_calculation_jobs` and `odds_calculation_checkpoints`.
Calculation identity/result fingerprint live on the canonical job; there is no
additional fabricated result table. A rejected stale publication rolls back its
transaction and therefore need not relabel the historical READY job immediately.
The existing claim validator reconciles it to SUPERSEDED/STALE without executing
another calculation. The local proof exercises that authoritative disposition.

Calculation produces SUCCEEDED/READY, not a publication. Director publish is
already Certification-admitted via the same canonical Odds route and shared
`canonical_publish_odds_v2` core. It validates job/result, exact current inputs,
source, milestone/phase and publication pointer CAS. It writes an immutable
publication revision, current-per-milestone/current-official pointers, receipt
and audit. Workers have no publication dependency. Exact replay uses the durable
Certification Odds receipt without duplicating publication. Unknown request
status remains UNKNOWN rather than inventing NOT_COMMITTED.
Publication history is `odds_published_snapshots`; the canonical current pointer
is `odds_publication_current`. Certification operation recovery uses
`certification_odds_receipts_v1`. These existing stores/cores are unchanged.

The participant route is `GET /api/leaderboards/insights?year=2026`. It reads the
canonical published Odds projection and existing derived Intelligence projections.
It does not calculate. Participant auth is required. Private settings, ratings,
raw input snapshots, checkpoints, claim tokens, private provenance/audit data are
withheld. Public publication metadata/freshness hashes retain their installed
policy. Google and legacy worker paths are rejected in the local harness.

## Fixture and truthful phase

The owned PostgreSQL fixture uses the existing synthetic provisioning mechanism
and real canonical Director/scoring operations. It models two Round 3 singles
covering the four synthetic players: primary FINAL with 18 scores; secondary
UPCOMING/unscored; opted-in P12 Net Skins entry/configuration revision 1 produces
OFFICIAL; Calcutta history retains empty 2 and nonempty 3, with published
PROVISIONAL calculation. These are local counterparts, not a replay of hosted
scores or an assertion that their entire historical revision numbers match.

The lawful Odds phase/milestone is **Round 3 Pairings Announced**. Neither Net
Skins nor Calcutta publication is an Odds prerequisite. The installed pairing,
settings, competitive facts and milestone guards are the authority. Two matches
cannot satisfy Final Results. FinalRecap requires exactly 24 canonical matches,
all FINAL, complete scorecards, and verified current Odds publication whose
milestone and payload phase are both Final Results. The non-Final publication
here leaves FinalRecap ineligible, with zero attempts/processes/publications.

## SQL and authority

`supabase/production_incremental/certification-odds-input-configuration-v1.sql`
contains three hash-guarded existing function corrections plus one private
Director configuration helper. Install is Certification-only, atomic, requires
OFF/disabled/paused and quiescence, checks all predecessor hashes before edits,
and checks unchanged validator/Odds dispatcher/publication cores. Exact replay
is idempotent; mismatch rolls back. Owner/ACL/security/search_path metadata are
preserved; the new security-definer helper has `search_path=pg_catalog` and no
PUBLIC/anon/authenticated/service_role execute grant. RLS and roles are unchanged.
No historical migration/bootstrap is edited.

The positive actor must have an actual active Director entitlement. Participant
A/B, forged Director role with participant identity, signed-out, ordinary
session/authenticated, anon and bare service_role lack operation authority.
Wrong resource/project/deployment/release, Production-shaped/old Preview-shaped
contexts, stale expected context/revision, arbitrary target/settings/processor
fields all fail closed. Production-only settings/process/publication wrappers
remain unchanged; Certification does not expose them to ordinary Preview.

## Verification and hosted continuation

Run `node tools/reliability/certify-odds-configuration.mjs focused`,
`application`, and `build`. The wrapper removes real credentials and denies
remote sockets; PG17/safeupdate uses owned local sockets. Evidence lives in
`evidence/`. Final focused result: **162 pass / 0 fail / 0 skip**; the build
passes. Broad regression: **4,077 pass / 20 established failures / 0 skip**,
with zero new failures. All three final source manifests match the files.
The 10,000-iteration Director initiation/after()/completion proof takes
**759 ms** locally (four checkpoints), not a hosted performance guarantee. Focused integration covers config/replay/conflict/authority,
real Director after()/processor/checkpoints, actual database restart, lost ACK,
stale completion/result, publication replay, participant read/privacy,
FinalRecap negative eligibility and final ordinary derived drain. No 864-hole
run or scoring/domain math change.

Prepare only, do not execute without separate hosted authorization:

1. Freshly verify hosted safe checkpoint and installed artifacts. Preserve hosted
   Net Skins and Calcutta PASS; do not recreate their financial/domain state.
2. Install only the missing reviewed Odds forward artifact after exact hash match;
   verify replay, metadata, unchanged registry and RLS.
3. Deploy one consolidated successor, verify Preview identity, safely rebind while
   OFF/disabled/paused, verify replay.
4. Activate only the installed Director/Certification authority; configure the
   fixed synthetic profile once at expected input revision 0, prove bounded replay
   and authority negatives.
5. Initiate 10,000-iteration current-phase Odds through the existing Director route;
   observe bound Preview after(), checkpoints, completion and source identity.
6. Publish exact current result through existing Director publication; verify
   canonical participant read and FinalRecap remains ineligible.
7. Use the existing finite Queue supervisor only for legitimate publication-derived
   Intelligence work; drain/reconcile without Odds Queue admission or fault-matrix
   repetition. STOP and restore disabled/paused with all live authority/claims/
   UNKNOWN/unexpected dead letters/stranded work zero. Do not begin Part 2C.
