# Step 2J.3B + 2J.3C final certification

Certification: PASS. User-approved physical acceptance and all final native, UI, build, analysis and in-place physical build/run gates are complete.

## Acceptance and starting state

The user explicitly granted `match detail pass` for the complete Match Detail experience after representative Best Ball, Scramble and Singles checks, and separately approved `scorecard pass`. One-decimal participant-facing handicap formatting is approved. This replaces earlier reports that still described physical approval as pending.

Native worktree: `/Users/claybeltran/Developer/BaggerInv-ios`; branch: `feature/native-ios-app`; starting HEAD: `b0cc22e24541021de867f8c2915b8c55f0f2d106`. All 40 intended working files matched the preserved SHA-256 manifest before final testing. Production and native-unit source remain byte-identical to the accepted candidate. Two legacy UI-test definitions were corrected during certification (Scramble handicap suppression and Today caller-stack/current Detail-fixture expectations); no discard, stash, amend, rebase or history rewrite. Fresh fetch found six local certified handoffs and no incoming remote commits. Of the original 40 working files, 39 remain byte-identical; only the Game Center UI test changed. The previously unchanged Today UI test is the additional test-only working file. No production Swift, native-unit source or fixture data changed during final certification.

## Certified handoff ancestry

| Certified source handoff | Native ancestry | Purpose |
| --- | --- | --- |
| `6d8e192337dc94f146ee9e75d47b4e59d7d67e14` | `2a57857` | Match Detail contract |
| `e76a9ba3354561de583716c31eaaba3b785dcac6` | `3f147e0` | Canonical Singles clinch |
| `e70fa8b94623d645df7e226f06abaaca532d8e59` | `24b3339` | Opaque Match Detail IDs |
| `f9ebebc5decb58d2103b5089688e941d04c494c1` | `2e7a90c` | Final exact opaque-ID contract |
| `c8f1b6d2fe3ed54d15f7061cbb0598db48fe8364` | `18fa648` | Published Scramble Team HCP pass-through |
| `309f60da8d5a9c9c818dbc2acd17411c79cbc173` | `b0cc22e` | Published participant Playing HCP precedence |

No backend feature branch was merged wholesale. No new backend/PWA work was performed for this final certification.

## Tournament-wide canonical and native parity

The latest explicitly authorized protected Preview reads were collected at 2026-09-06 00:24:32 UTC. The post-approval full native unit run decoded and audited the exact private response corpus while it was less than one hour old. The test enforces that freshness limit; it was neither weakened nor bypassed. No new OTP or protected session was created for the final native run.

| Format | Matches | Participant entries | Positive HCP | Negative/plus HCP | Zero / null |
| --- | ---: | ---: | ---: | ---: | ---: |
| Best Ball | 6 | 24 | 22 | 2 | 0 / 0 |
| Scramble | 6 | 24 | 22 | 2 | 0 / 0 |
| Singles | 12 | 24 | 24 | 0 | 0 / 0 |
| Total | 24 | 72 | 68 | 4 | 0 / 0 |

24 unique players; 72/72 exact canonical participant HCP comparisons before formatting; 72/72 participant strokes; zero mismatches. 48/48 BB/Singles participant contexts show one decimal. 24/24 Scramble participant HCP contexts are suppressed, without changing names or decoded values. All 6 Scramble Matches / 12 team contexts retain canonical Team HCP and team strokes. Zero/null HCP are absent from this live dataset; deterministic 12-Match/40-entry coverage exercises zero, positive, negative and null values equally. A separate test rejects 4.25 vs 4.26 even though both display as 4.3; another rejects missing Detail responses rather than passing a sample.

Required original defect recheck, `2026-R1-5`: David Tatum 6.9 / 4 strokes; Jupjee Kochar 11.8 / 8; Jason Powell 3.0 / 0; Nick Julian 8.9 / 5. Published participant-home presentation precedence is retained, with snapshot fallback only when the published value is absent. No calculation or canonical-value rewrite.

Protected certification evidence: collection schema PASS; Detail schema/ID/navigation 24/24; 3 owned and 21 non-owned; Detail ETag/304 24/24, plus additional Scramble 6/6, collection 1/1 and reference Detail 1/1. Auth negatives: missing bearer 401, bearer without certification 403, invalid certification 403, invalid bearer 401. Missing Match safely returns 404; forged participant/tournament selectors do not change canonical authority. The temporary certification session was revoked locally and auth material cleared before this final run; the physical session was not revoked.

## Full Game Center product

The accepted native page retains header/context, compact tournament branding, canonical Round / Match X of Y, format, course/tee/tee time, Previous/Next/Back to My Match, caller-back navigation, team logos, participant names and authenticated emphasis, HCP/strokes, prominent canonical Live/Final result and freshness. All 18 Hole Tracker cells select canonical local detail without per-hole reads. Selected Hole exposes canonical par/yardage/stroke index/story/gross/applied strokes/net/official state. Front/Back/Overall Match Flow and optional clinch are server-projected; nil clinch stays absent. Scorecard, Match Stats and Match-time Course Information remain present. Owned/non-owned, BB/SC/SI and Upcoming/Live/Final are covered.

## Canonical scorecard system and audit

One shared grid and row/cell system renders matching Front Nine 1–9 and Back Nine 10–18. Canonical DTO data supplies participant gross/applied strokes, team-side gross/strokes/net, outcome/winning side, running result, official/confirmed state and confirmation timestamp. No OUT/IN/TOT values are supplied, so none are calculated or invented.

- Best Ball: Hole / Par; team 1 band, ordered player 1/player 2, Net; team 2 band, ordered player 1/player 2, Net; Hole Result; Match Status.
- Scramble: same frame, team-side Score/Net rows only; no fabricated participant hole scores.
- Singles: same frame, one canonical participant per side; Net only where supplied and not a proven redundant row.
- Anchored compact identity column; canonical team band/logo once per side; full names remain accessible when compact labels are used.
- Canonical stroke dots or exact compact raised counts; zero has no visual marker; VoiceOver announces actual stroke count. No HCP rows or player portraits in the scorecard.
- Restrained Net rows, compact side-linked Hole Result markers and half symbol; result identity never depends only on color or colliding initials.
- Canonical Match Status stays one line; exact displayed team-name prefixes may be moved to a compact side marker without deriving a result.
- Horizontal scroll is local to each nine, with anchored identities and matching dimensions; page remains viewport-contained. Default, large and accessibility XXXL are covered.
- Disclosure preserves canonical unavailable/inProgress/confirmed state and confirmation timestamp; Final is not treated as proof of confirmation. No write authority exposed.

## Final opaque Match-ID contract

1–200 Unicode scalar values; no NUL/malformed surrogates; exact `.` and `..` excluded. Leading/trailing/internal whitespace, reserved characters, non-BMP and canonically equivalent but distinct Unicode spellings remain exact. No trimming, normalization, semantic parsing, display-number substitution or route compensation hacks. UTF-8 identity comparison/cache lookup prevents Swift canonical-equivalence equality from conflating distinct IDs. Native transport encodes one path component once and round-trips the logical string unchanged.

Five transport regressions exercise the shared valid forms, 200/201 scalar boundaries, UTF-16-over-200 valid IDs, reserved and percent sequences, Next.js prefix-like strings, malformed surrogate rejection, independently keyed equivalent Unicode spellings and model→repository→request→304 round trips. Live exact-ID evidence covers all 24 current Matches; exotic forms absent from live data are not claimed as live cases.

## Authoritative 404 revocation and failure classification

TRANSIENT offline / timeout / server failure → eligible stale cache remains visible with explicit stale/offline state.

AUTHORITATIVE participant-safe 404 → published repository value and cached envelope clear before disk suspension; only that Match Detail persisted entry is removed or durably made ineligible; safe unavailable state replaces protected content immediately. Revocation fences delayed activation and prevents reopening/offline resurrection. Identity/tournament/contract mismatch remains fail-closed. Other Match Detail entries, /matches and scoring SQLite are unaffected. Coordinator and sign-out tests distinguish protected read-cache clearing from durable scoring intent.

## Native unit results

741/741 PASS; 0 failures; 0 skips; 44 suites. Includes 162 focused Match Detail/scorecard/opaque-ID/handicap tests. Full scoring SQLite, current/hole, conflict/correction, same-ID recovery and finalization regressions are included, using deterministic injected transport only.

| Suite | Passed |
| --- | ---: |
| AppCoordinatorTests | 36/36 |
| BaggerAppBuildInfoTests | 2/2 |
| BaggerAssetTests | 12/12 |
| BaggerCertificationStoreTests | 6/6 |
| BaggerDesignSystemTests | 8/8 |
| HTTPTransportSecurityTests | 5/5 |
| HandicapDisplayFormatterTests | 6/6 |
| LeadersPresentationTests | 8/8 |
| LeadersReadRepositoryTests | 14/14 |
| MatchDetailCoordinatorTests | 8/8 |
| MatchDetailPresentationTests | 26/26 |
| MatchDetailReadRepositoryTests | 28/28 |
| MatchDetailStateAndHandicapPolishTests | 12/12 |
| MatchGameCenterCompetitionPresentationTests | 11/11 |
| MatchGolfScorecardPresentationTests | 40/40 |
| MatchesPresentationTests | 19/19 |
| MobileAPIClientTests | 7/7 |
| MobileHealthContractTests | 6/6 |
| MobileLeadersModelDecodingTests | 7/7 |
| MobileMatchDetailModelTests | 22/22 |
| MobileModelDecodingTests | 9/9 |
| MobileReadAPIClientTests | 12/12 |
| MobileReadCredentialProviderTests | 6/6 |
| MobileReadModelDecodingTests | 17/17 |
| MobileReadRepositoryTests | 23/23 |
| MobileScoringAPIClientTests | 26/26 |
| MobileScoringModelDecodingTests | 21/21 |
| MorePresentationTests | 13/13 |
| NativeEnvironmentTests | 5/5 |
| OpaqueMatchIDTransportTests | 5/5 |
| ParticipantContentModelTests | 9/9 |
| ReadCacheStoreTests | 17/17 |
| SQLiteScoringQueueRepositoryTests | 56/56 |
| ScoringCurrentStoreTests | 13/13 |
| ScoringFinalizationCoordinatorTests | 49/49 |
| ScoringFinalizationProbeStoreTests | 8/8 |
| ScoringPresentationTests | 22/22 |
| ScoringQueueCoordinatorTests | 76/76 |
| ScoringQueueModelTests | 15/15 |
| ScoringQueuePolicyTests | 12/12 |
| TodayPresentationTests | 13/13 |
| TodayUITestLaunchTests | 10/10 |
| TournamentDataCoordinatorTests | 17/17 |
| TournamentHandicapParityTests | 4/4 |

## UI results

Final acceptance set: **120/120 PASS; zero failures/skips in the accepted results**. This is all **112 ordinary UI tests**, with the 8 scorecard tests repeated on the second phone size. Both focused test-repair rechecks also pass, **2/2**, reported separately rather than inflating unique coverage.

| Suite | iPhone 17 Pro Max / iOS 26.5 | iPhone 17 Pro / iOS 26.5 |
| --- | ---: | ---: |
| Assets/design-system gallery | 4/4 | — |
| Canonical scorecard | 8/8 | 8/8 |
| Leaders | 17/17 | — |
| Game Center polish | 9/9 | — |
| Matches | 11/11 | — |
| More / Passport | 13/13 | — |
| Score / Scorecard | 16/16 | — |
| Today | 11/11 | — |
| Full Game Center | — | 22/22 |
| Signed-out layout / keyboard | — | 1/1 |
| Total | 89/89 | 31/31 |

The signed-out keyboard test is the one ordinary fixture test inside the otherwise opt-in live class. The 12 opt-in authenticated/OTP/live-scoring test helpers were not invoked; they are excluded, not counted as skipped. No new OTP was requested.

Retained screenshots were inspected for BB/SC/SI scorecard grammar, matching nines, anchored labels, reachable last-hole columns, compact stroke/result notation, single-line Match Status at XXXL, Scramble team-only HCP, Match Flow and Course Information. Pro Max and Pro visual evidence is retained. Physical design approval remains the user's explicit approval, not agent self-approval.

### Transparent test-only corrections

- Initial `SecondaryUI.xcresult`: 29/30 (scorecard 8/8; Game Center 21/22). A legacy Scramble test still demanded individual nonzero/negative participant HCP labels. That contradicted the approved Scramble-only suppression rule. The corrected test requires canonical names and Team HCP/strokes and rejects the participant labels. Focused `ScrambleUIRecheck.xcresult`: 1/1. Complete `GameCenterFinal.xcresult`: Game Center 22/22 plus signed-out keyboard 1/1.
- Initial `PrimaryUI.xcresult`: 88/89, with Today 10/11. The old Today navigation test expected a cross-tab jump to Matches rather than the approved return-to-caller Today stack. After correcting that assertion, `TodayUIRecheck.xcresult` exposed another obsolete expectation in the same test: collection-era Cougar/Turtle course and player labels rather than the dedicated Match Detail DTO fixture's published course/participants. Expectations were audited directly against `MatchDetailUITestFixture.swift`; neither app nor fixture data was changed. The exact Match ID, format, canonical Detail course/participant and back-to-Today assertions remain required. Focused `TodayUIRecheck02.xcresult`: 1/1; complete `TodayFinal.xcresult`: 11/11.

All original failures and the intermediate Today recheck are retained. Final passing results supersede those three obsolete-assertion failures across two test definitions; they are not hidden retries or production behavior changes. Native units/builds remain valid for the unchanged production and native-unit source.

## Builds, analysis and Release

Clean Simulator build-for-testing: PASS. Separate clean generic signed-device build + static analysis: PASS. Separate clean phone-specific build: PASS. Strict signatures verified for both clean device artifacts; valid existing Preview profile includes Klay's iPhone and expires September 12, 2026. Compiler warnings: 0; analyzer findings: 0. Optimized Release Simulator build: PASS; normal sign-in smoke and ignored Debug fixture arguments visually verified. No Debug fixture symbols in Release. Disposable smoke Simulator removed; screenshots retained.

An initial incremental switch from generic to physical destination invalidated the generated Assets.car signature. That artifact was never installed. Clean destination-specific builds resolved it; no source, entitlement, profile or signing configuration change was needed.

## Physical build/run

User acceptance: PASS across representative BB/SC/SI and the full page, including the scorecard. Final clean phone-specific Preview build, strict signature, in-place install and normal foreground launch: PASS on Klay's iPhone 17 Pro Max / iOS 26.6.1.

Installed executable SHA-256: `06250f58d2bca1d844c52d68b253b1facd1dd056ff250d4e7d130555ba3672b2`. Bundle: `com.sandbaggerinvitational.bagger.preview`; installation identifier: `EAE37DF5-FE3C-47CA-A62E-44A988BCE3CE`. Launch succeeded September 5, 2026 at 9:11 PM America/Chicago, without test/debug/auth arguments or payload URL.

Scoring SQLite main/WAL/SHM metadata: **3/3 exactly unchanged before/after installation**. No scoring file contents copied/read, no uninstall, app-container clearing, keychain/session clearing, sign-out or scoring action. Normal launch was independently verified; the representative full-page physical acceptance is the user's earlier explicit approval of this unchanged production source. No new OTP was sent or requested.

## Scope, commit structure and deferred work

Step 2J.3C remains part of the intended Step 2J.3B implementation commit: it shares the newly introduced Match Detail DTOs, presenters and views and has never existed as an independent committed base. Splitting it now would create an artificial dependency boundary and disrupt the approved combined candidate. Planned commit message: `feat: build native Match Game Center`.

No native golf calculations or new canonical authority. No backend/PWA, schema, migration, deployment or configuration changes during final certification. Public Preview health was reconfirmed at 2026-09-06 01:43:42 UTC: exact isolated Preview authority, Production shadow false. Only existing isolated Preview API/auth hosts are used; no Production authentication, reads, scoring, deployment, migration, aliases or configuration access. No unrelated checkout/branch changes.

The All Matches VS optical vertical-alignment item remains explicitly deferred to final whole-app micro-polish. No next polish step is authorized or started.

## Final Git gate

Commit gate: PASS. This report belongs with the combined implementation commit, using `feat: build native Match Game Center`. Commit/push outcome and the fresh post-push HEAD/origin, 0/0 divergence, clean-worktree and diff checks are recorded in the final handoff. No separate scorecard commit or automatic next step.

## Final certification decisions

```text
STEP 2J.3B: PASS
STEP 2J.3C: PASS
FULL NATIVE MATCH GAME CENTER: VERIFIED
OWNED / NON-OWNED MATCH DETAIL: VERIFIED
BEST BALL / SCRAMBLE / SINGLES: VERIFIED
UPCOMING / LIVE / FINAL: VERIFIED
CANONICAL MATCH NAVIGATION: VERIFIED
HOLE TRACKER / SELECTED HOLE: VERIFIED
MATCH FLOW / CANONICAL CLINCH: VERIFIED
MATCH STATS / COURSE INFORMATION: VERIFIED
CANONICAL NATIVE SCORECARD SYSTEM: READY
BEST BALL SCORECARD: READY
SCRAMBLE SCORECARD: READY
SINGLES SCORECARD: READY
FRONT / BACK SCORECARD PARITY: VERIFIED
SCORECARD HCP ROWS: NONE
PER-HOLE STROKE MARKERS: VERIFIED
HOLE RESULT COMPACT NOTATION: VERIFIED
MATCH STATUS SINGLE-LINE: VERIFIED
LOCAL HORIZONTAL SCROLL: VERIFIED
PAGE-LEVEL HORIZONTAL OVERFLOW: NONE
OUT / IN / TOTAL: CANONICAL ONLY
ACCESSIBILITY: VERIFIED
OPAQUE MATCH-ID CONTRACT: VERIFIED
OPAQUE MATCH-ID NATIVE ROUND-TRIP: VERIFIED
UNICODE MATCH-ID SEMANTICS: VERIFIED
WHITESPACE MATCH-ID PRESERVATION: VERIFIED
RESERVED CHARACTER MATCH-ID ROUND-TRIP: VERIFIED
MATCH-ID CLIENT PARSING: NONE
AUTHORITATIVE 404 CACHE REVOCATION: VERIFIED
IN-MEMORY MATCH DETAIL REVOCATION: VERIFIED
TRANSIENT OFFLINE RETENTION: VERIFIED
ETAG / 304: VERIFIED
AUTH / TOURNAMENT / CACHE ISOLATION: VERIFIED
TOURNAMENT-WIDE HCP / STROKE PARITY: VERIFIED — 24 MATCHES, 72 ENTRIES, 0 MISMATCHES
PARTICIPANT-FACING HANDICAP DISPLAY: EXACTLY ONE DECIMAL
SCRAMBLE INDIVIDUAL HCP: ABSENT
SCRAMBLE TEAM HCP / STROKES: VERIFIED
SCORING SQLITE: PRESERVED
NATIVE GOLF AUTHORITY / CALCULATIONS: NONE
PHYSICAL SCORECARD / FULL MATCH DETAIL ACCEPTANCE: APPROVED BY USER
CLEAN SIMULATOR / GENERIC SIGNED DEVICE / PHYSICAL BUILD-RUN / RELEASE SMOKE: PASS
COMPILER WARNINGS: 0
ANALYZER FINDINGS: 0
GIT DIFF --CHECK: PASS
PWA / BACKEND: NO NEW CHANGES
ARCHITECTURE CHANGES DURING FINAL CERTIFICATION: NONE
PRODUCTION ISOLATION: VERIFIED
ALL MATCHES VS OPTICAL ALIGNMENT: DEFERRED TO FINAL WHOLE-APP MICRO-POLISH
NEXT STEP: NOT STARTED
```
