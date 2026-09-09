# Round Pairing Workspace read-envelope correction

## Scope and lineage

Base: release 70, `4da1d472b2ad27b8c05e6fb80ddb1903bfd73536`.
Only migration 096 changes executable behavior: it replaces the existing stable,
service-only Tournament Setup reader. No application runtime, native/Auth,
Today cache, scoring, or pairing-write implementation changes. Migration 095 is
byte-for-byte unchanged. All other changes are certification tests and this report.

## Root cause and complete field inventory

The retained reader returns `{ok, data}`. Migration 095 iterated the nonexistent
outer `matches`, produced an empty outer array, and attached metadata outside
the `data` payload selected by the established normalizer.

| Field in 095 | Correct location | Consumer / purpose |
|---|---|---|
| outer `matches` | `data.matches` | All workspace match cards and reviews |
| outer `matches[].detailsManaged` | `data.matches[].detailsManaged` | Individual and round Match Details prerequisite |
| outer `matches[].contextFingerprint` | `data.matches[].contextFingerprint` | Draft reconciliation and stale-context protection for individual and round workflows |
| outer `approvedHandicapRevisionId` | `data.approvedHandicapRevisionId` | Individual/round roster coverage and round optimistic handicap predecessor |
| outer `approvedHandicapRevisionNumber` | `data.approvedHandicapRevisionNumber` | Both review displays; identity remains the authority |

None of these fields prepares a scoring context or changes scoring readiness.
The fingerprint includes retained context as evidence; it is not an authorization
to score. Existing snapshot/readiness fields are preserved unchanged.

## Correction

`202609090096_production_round_pairing_read_envelope_v1.sql` calls the same private
reader (retaining scope/actor checks), requires the canonical object/array shape,
enriches `data.matches`, and replaces only `data` in the original envelope. It
retains fixed search paths, stable/security-definer attributes and service-role
execution grants. There is no alternate-shape client fallback or duplicated
outer metadata.

Installation is inert: no DML, Setup increment, participants, snapshots,
receipts, or audits. PostgreSQL fingerprints verify installation neutrality and
unchanged atomic-write function definition.

## Certification

- Application/read-envelope and main regressions: 115 passed.
- Native/mobile/Auth/Today and lineage regressions: 364 passed.
- Ancillary War Room/side-game regressions: 98 passed.
- Disposable PostgreSQL integrations: 4 passed, no skips.
- Real Director client browser acceptance: 1 passed, widths 390, 430, 820,
  1280, and 1440; no document overflow; existing 44px action checks retained.
- Production build passed. Existing CSS/tooling warnings remain; no runtime
  source was changed to address unrelated warnings.
- `git diff --check` passed.

The corrected `095 atomic full-round pairings, unchanged matches, exchanges,
rollback and grants` integration first installs 095, asserts six inner R1
matches, and proves `assertCanonicalRoundReader` rejects its outer enrichment.
It then installs 096 and applies the same assertion successfully. Assertions
require the exact six match IDs before checking any per-match fields. All
pre-existing reader fields are compared for equality after stripping only the
new canonical metadata.

The same real SQL reader is exercised with Setup 12, approved Handicap 7 and
UUID `a19f4f10-28f7-46a9-8434-159cd07cc4b6`, 24 active covered Players, the exact
four saved R1 pairing identities, and R1-5/R1-6 empty. Retained snapshots are not
prepared scoring contexts. Its normalized output reaches individual and complete
round review in pure client validation without a mutation. Retained inactive
fixture members are explicitly excluded from the active coverage count.

The browser acceptance also starts from the canonical nested response, verifies
all four saved pairings and two empty cards, fills the remaining slots only in
local synthetic state, reaches individual review bound visibly to Setup 12 /
Handicap 7, then reviews six matches with two changed matches/eight assignments.
This acceptance sends zero mutation requests. The pre-existing isolated-browser
mock-save scenarios still certify draft preservation, Match Details interaction,
failure retention and round Save-All.

Genuine unsaved/unmanaged details, missing or stale handicap coverage,
duplicates, missing Players, wrong teams and context conflicts still fail closed.
Atomic SQL tests retain unchanged-match, exchange, full BB/SC/SI round coverage,
rollback after an intermediate write, exact retry, conflicting retry, stale
revision, frozen context and least-privilege assertions.

## Release boundary

Production baseline supplied/previously verified: Setup 12 / Handicap 7; four
saved Round 1 pairings preserved, R1-5/R1-6 empty. This implementation performs
no Production mutation or new operational action. It does not claim fresh live
acceptance of the correction: migration 096 must be separately authorized and
released. No migration was applied to Production, no deployment/rebind performed,
and no pairing or Match Details save submitted.

Stop for exact-SHA release authorization. Preserve unrelated untracked files.
