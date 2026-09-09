# Best Ball meaningful-decimal handicap display certification

## Status and release boundary

Application-only correction on release73 (`a792f2a058ccec42d0ce2eaf9e8046cc6b370c06`). No migration, Production deployment, approval, pairing save or scoring preparation is part of this work. Commit/push is followed by a separate exact-SHA release gate.

## Release73 misinterpretation / historical PWA source

Release73 checked formatter/DTO-name parity, but current SQL `playing_handicap` is already integer-rounded. Appending `.0` lost the historical decimal meaning.

Retained workbook evidence (`/tmp/bagger-historical-handicap-recovery.json`, workbook `1hSn6uABZwYftU3DrtoOz08ygX4x-c1JAWzuohtQ31Ts`, revisions 5143/5146, SHA256 `160382bb95f841a27c0636318764731cab94dccb4c3cdf22cee3d61035132862`) contains Round Handicaps and Live Matches. All 24 BB and 24 SI legacy Playing HCP values equal full Course Handicap rounded to one decimal. They are not Tournament H, 90%-allowed H, or integer PH. For example historical CB01 H10.75 → CH12.838… → old Playing HCP12.8; AM01 H11.1 → CH13.25929204 →13.3; SI AM01 H11.1→CH17.4345…→17.4.

Git `2f35fc8:lib/stats.js` directly mapped `Team N Player M Playing HCP` to `playingHcp`; the PWA formatted this numeric value through `formatHandicap`. Import migration 005 expressly preserved decimal `playing_handicap` while `final_strokes` remained integer. The workbook formula source itself is not retained: the semantic conclusion is supported by all 48 joined source/result rows, the direct field mapping, and precision-preserving import contract—not guessed from a label.

## Rounding pipeline / display vs scoring

Authoritative migration 058 `production_control.handicap_v1_match_context` remains unchanged:

- Exact Course Handicap = approved Tournament H × slope /113 + rating − par.
- BB/SI stored Playing Handicap = PostgreSQL numeric round(CH,0).
- BB official received strokes = round((exact CH − minimum exact CH of four) ×0.90,0).
- SI official strokes = round(exact CH − minimum exact CH of two,0).
- SC remains round(0.35×lower exact CH +0.15×higher exact CH), then team-relative normalization.

The official BB stroke calculation does **not** subtract integer PH values. Its minimum/difference precede the allowance and final integer rounding. `displayHandicap` copies validated canonical `course_handicap`, never changes `playingHcp` or `stroke`, and never feeds scoring. The existing formatter uses absolute-value `toFixed(1)` and parentheses for negative values; its existing binary-JS boundary behavior is preserved (7.84→7.8; 7.85→7.8; 0→0.0; −0.8→(0.8)). No new rounding policy is introduced.

## Production read-only audit / all 24 R1 values

2026-09-09 fresh SQL reads were wrapped in `begin read only`. Current approved revision remains 7 / `a19f4f10-28f7-46a9-8434-159cd07cc4b6`. Setup is **17**, superseding old revision14 assumptions. All 24 matches are UPCOMING/unlocked; scored holes and unresolved mutations are zero; prepared contexts zero. The fresh public live endpoint was HTTP200, Supabase-backed, foreground Google requests0. All R1 snapshots: TPGC01 / Gold /136 /71.9 /72. The source and public DTO values agree.

Current R1-4 contains MB01/CB01 vs WO01/PN01; R1-6 contains CL01/BC01 vs CM01/CS01. No older pairing baseline is restored.

CH and relative intermediate are abbreviated below, not rounded before scoring. Relative90% is the actual `(CH−match-low CH)×0.90` intermediate, not a display allowance. A correctly sourced value can legitimately round to `.0` (PN01).

| Match / Player | Tournament H | Exact CH (6dp) | Relative 90% (6dp) | Integer PH | Release73 HCP | Corrected HCP | Strokes |
|---|---:|---:|---:|---:|---:|---:|---:|
| R1-1 JP01 / Jason Powell | 2.8 | 3.269912 | 2.274690 | 3 | 3.0 | 3.3 | 2 |
| R1-1 MH01 / Michael Hunnicutt | 6.1 | 7.241593 | 5.849204 | 7 | 7.0 | 7.2 | 6 |
| R1-1 MS01 / Memo Saldana | 0.7 | 0.742478 | 0.000000 | 1 | 1.0 | 0.7 | 0 |
| R1-1 JS01 / Jack Samis | 7.5 | 8.926549 | 7.365664 | 9 | 9.0 | 8.9 | 7 |
| R1-2 DT01 / David Tatum | 5.7 | 6.760177 | 0.000000 | 7 | 7.0 | 6.8 | 0 |
| R1-2 AM01 / Alex Monteleone | 10.8 | 12.898230 | 5.524248 | 13 | 13.0 | 12.9 | 6 |
| R1-2 CP01 / Chase Patterson | 8.5 | 10.130088 | 3.032920 | 10 | 10.0 | 10.1 | 3 |
| R1-2 JK01 / Jupjee Kochar | 9.8 | 11.694690 | 4.441062 | 12 | 12.0 | 11.7 | 4 |
| R1-3 HM01 / Holman Moores | 1.5 | 1.705310 | 0.541593 | 2 | 2.0 | 1.7 | 1 |
| R1-3 BA01 / Brian Atkinson | 7.9 | 9.407965 | 7.473982 | 9 | 9.0 | 9.4 | 7 |
| R1-3 MM01 / Max Markley | 1.0 | 1.103540 | 0.000000 | 1 | 1.0 | 1.1 | 0 |
| R1-3 NJ01 / Nick Julian | 7.8 | 9.287611 | 7.365664 | 9 | 9.0 | 9.3 | 7 |
| R1-4 MB01 / Miles Berger | -0.8 | -1.062832 | 0.000000 | -1 | (1.0) | (1.1) | 0 |
| R1-4 CB01 / Clay Beltran | 12.2 | 14.583186 | 14.081416 | 15 | 15.0 | 14.6 | 14 |
| R1-4 WO01 / Will Oliver | 0.4 | 0.381416 | 1.299823 | 0 | 0.0 | 0.4 | 1 |
| R1-4 PN01 / Patrick Noonan | 4.2 | 4.954867 | 5.415929 | 5 | 5.0 | 5.0 | 5 |
| R1-5 MS02 / Matthew Smith | 1.6 | 1.825664 | 2.491327 | 2 | 2.0 | 1.8 | 2 |
| R1-5 JK02 / Jack Keffler | 13.0 | 15.546018 | 14.839646 | 16 | 16.0 | 15.5 | 15 |
| R1-5 RM01 / Robert Murphy | -0.7 | -0.942478 | 0.000000 | -1 | (1.0) | (0.9) | 0 |
| R1-5 TL01 / Taylor Lippincott | 12.4 | 14.823894 | 14.189735 | 15 | 15.0 | 14.8 | 14 |
| R1-6 CL01 / Caleb Lewis | 7.9 | 9.407965 | 0.000000 | 9 | 9.0 | 9.4 | 0 |
| R1-6 BC01 / Brenan Cavanaugh | 8.0 | 9.528319 | 0.108319 | 10 | 10.0 | 9.5 | 0 |
| R1-6 CM01 / Chris Micheal | 11.6 | 13.861062 | 4.007788 | 14 | 14.0 | 13.9 | 4 |
| R1-6 CS01 / Chris Seekely | 13.8 | 16.508850 | 6.390796 | 17 | 17.0 | 16.5 | 6 |

## Pre-start/frozen boundary

R1-1, R1-4 and R1-6 have empty active holes; complete agreeing 18-hole snapshot definitions remain. R1-1:S1 retains an obsolete one-Player CB01 import participant list, but no bound handicap revision or prepared-context contract. Tests reproduce those exact shapes. Strictly unstarted/unprepared display validates current active membership, stable team identity, approved H versus participant H, canonical CH, course metadata and complete agreeing course evidence. It does not treat legacy partial participants as a prepared handicap context.

Prepared/started matches require a bound handicap context with exact participant identities and matching frozen CH. They never recompute from today's roster. Missing, partial, conflicting or stale inputs yield explicit unavailable display, not integer fallback or fake zero. Original imported evidence is not edited. Complete retained holes are inspected in memory; nothing prepares active holes/snapshots.

## Consumers / isolation

Only the existing web/PWA Match Center opt-in receives the additive `displayHandicap` field. PublicMatchCard and participant TournamentDashboard use the same selector and formatter. Legacy/history DTOs without this field keep their legacy value. Explicit null remains unavailable. Existing Game Center scoring DTO, mobile/native/default read projection, prediction/Odds readers and all scoring paths remain unchanged.

Singles uses full CH when complete pairings/context exist; all current R3 matches are unpaired, so no values are fabricated. The release73 Scramble helper remains byte-for-byte unchanged, with team PH/strokes 6/3:3/0, 2/4:0/2, 3/3:0/0, 3/2:1/0, 1/3:0/2, 6/6:0/0.

## Integrity evidence

Before/after fingerprints were re-read and match exactly: canonical participants `3bc7850fa60759c39f51819959e50dfa`; snapshots `3f68081fae33319dc461fccb1f80289a`; handicap entries `459921612c3dbb26c7c0c2c4976fb606`. Setup remains17, approved revision7, 24UPCOMING, scored/unresolved mutations/prepared contexts0. All 24 PH/stroke fields and all allocated hole strokes are compared before/after projection in tests. No official SQL/math/SC helper/native code changes. No extra database reads; bounded in-memory checks over the existing aggregate read. A 100-sample local 12-paired-match projection measured median0.374ms/p95 0.565ms (fixture timing, not a Production latency promise).

## Certification

Locally certified, ready for commit/push and separate exact-SHA release authorization:

- 198 focused/regression application tests pass, with no skips: new decimal semantics, old-PWA evidence, all24 labels/PH/strokes/hole allocations, incomplete/conflicting/frozen contexts, Singles, Scramble, handicap management, scoring, Setup/round workspace, native/mobile/Auth/Today isolation, War Room, Odds, Net Skins, Calcutta and website/PWA boundary.
- 31 PostgreSQL integration tests pass, no skips. This runs the unmodified canonical migration058 function for all six R1 and six R2 pairings, plus actual Setup/round pairing and scoring-context contracts in disposable databases. A local shared-memory startup limit was resolved by removing only this turn's detached56-byte failed-test segment; no Production connection or SQL assertion weakening.
- Real rendered component/browser test passes at390/430/820/1280/1440px with complete Player names. Clay14.6 versus old15.0 and unchanged14strokes are asserted. All cards have identical heights to the prior presentation, contained labels and no document overflow. Screenshots inspected, including mobile and desktop Clay cards. Evidence directory: `/tmp/bagger-match-handicap-browser-RNjPte`.
- Production build passes. Local static-build network warnings for unavailable Google DNS do not represent Production foreground requests; the live endpoint separately reported Google0.
- `git diff --check` passes. All prior migrations, official formula code, native runtime and release73 Scramble helper remain byte-identical. The historical release73 lineage test is pinned to its immutable commit; a separate current-payload allowlist protects everything outside the five presentation files.

Known unrelated baseline failure: `test/public-website-shell-restoration.test.mjs:16` expects an older public-menu JSX source pattern and fails against unchanged release73 `app/Menu.js`; neither file is changed. The broader exploratory run was161pass/1fail. Dedicated website/PWA boundary suites pass in the198-test final suite; this is not a claim that the old failing assertion passed.

Production mutations: 0. Native iOS contract impact: none.
