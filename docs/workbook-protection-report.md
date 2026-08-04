# Workbook Protection Report

> Historical Sprint 24 audit baseline. The unsafe paths identified here were resolved in Sprint 24A. See [Workbook Protection — Safe Field Writes Report](./workbook-protection-safe-writes-report.md) for the current zero-unsafe-path audit.

Audit date: 2026-08-04  
Environment: Preview  
Branch: `feature/mock-tournament-qa-integration`  
Workbook: `Mock 2026 Sandbagger Tournament`  
Workbook ID: `1hSn6uABZwYftU3DrtoOz08ygX4x-c1JAWzuohtQ31Ts`

## Executive summary

This was a read-only audit. No workbook values, formulas, formatting, validation, named ranges, or runtime behavior were changed.

The Preview workbook contains 42 sheets, 613 formula cells, 69 defined names, and no detected formula-like values with a leading apostrophe. The audit found no `ARRAYFORMULA` cells in the current Preview export. This does not relax protection: any future `ARRAYFORMULA` column is read-only by default.

The audit found **four critical/high-risk write paths that are not compliant with the Workbook Protection Standard**:

1. Preview Reset rewrites complete `Live Matches` and `Matches` rows. This can replace formula and lookup cells with static values.
2. Match finalization rewrites every populated `Matches` field, including the formula-owned `Match ID` column.
3. Tournament Guide save/delete clears and rebuilds entire tabs. `Guide Information.Item ID` is formula-owned in the current workbook.
4. Generic Admin CMS update/delete/reorder uses whole-row writes. The `Matches` CMS resource therefore writes or clears the formula-owned `Match ID` column.

These findings are audit results only. The affected runtime paths were not changed in this sprint. Until remediated, **Preview Reset, Tournament Guide administration, and Admin CMS mutation of Matches must be treated as unsafe workbook operations**.

## Governing classification

Each column below has exactly one classification:

- **Writable** — intentional human/configuration input.
- **Runtime Writable** — approved application-owned operational output.
- **Formula** — formula-owned and always read-only.
- **ARRAYFORMULA** — array-formula-owned and always read-only.
- **Lookup** — formula-backed mapping/lookup and always read-only.
- **Derived / Read Only** — identifier, compatibility, or calculated/reference data that runtime code must not write.

Column names, never letters, are authoritative. A column not listed in this map is read-only until explicitly classified.

## Protected Column Map

The map covers every current Preview sheet reached by a runtime mutation path. Columns are grouped by classification; every present column appears exactly once.

### Tournament operations

#### Tournaments

| Classification | Columns |
|---|---|
| Writable | Year; Annual; Annual Image; Dates; Destination; Course 1; Course 2; Course 3; Championship Course; Hero Image; Team Size; Sandbagger of the Year; Captain Team 1; Captain Team 2; Winning Captain; Tournament Name; Start Date; End Date; Location; Format Label; Countdown Enabled; Mobile Hero Image; Tie Advantage Team; Start Time; Time Zone; Preview Timeline Date |
| Runtime Writable | Winning Team; Runner-Up Team; Final Score; Tournament Status; Current Round; Updated At; Updated By; Status Mode; Director Automation Enabled; Auto Open Round; Auto Set Matches Live |
| Formula | None |
| ARRAYFORMULA | None |
| Lookup | None |
| Derived / Read Only | None |

#### Live Matches

| Classification | Columns |
|---|---|
| Writable | Year; Round; Format; Match; Course ID; Tee Time; Team 1 Player 1; Team 1 Player 2; Team 2 Player 1; Team 2 Player 2 |
| Runtime Writable | Matchup Winner; Front 9 Winner; Back 9 Winner; 18-Hole Winner; Team 1 Points; Team 2 Points; Match Status; Notes; Updated At; Updated By; Finalized At; Finalized By; Access Code Hash; Access Token Hash; Access Selector; Access Active; Access Expires At; Access Version |
| Formula | Team 1 Player 1 Playing HCP; Team 1 Player 1 Stroke; Team 1 Player 2 Playing HCP; Team 1 Player 2 Stroke; Team 1 Playing HCP; Team 1 Stroke; Team 2 Player 1 Playing HCP; Team 2 Player 1 Stroke; Team 2 Player 2 Playing HCP; Team 2 Player 2 Stroke; Team 2 Playing HCP; Team 2 Stroke |
| ARRAYFORMULA | None |
| Lookup | T1 P1 Playing HCP; T1 P2 Playing HCP; T2 P1 Playing HCP; T2 P2 Playing HCP |
| Derived / Read Only | Match ID |

The runtime also expects `Current Hole`, `Team 1 Holes Won`, `Team 2 Holes Won`, `Holes Remaining`, and `Match Status Text` as Runtime Writable fields, but those headers are absent from the audited workbook. They are not approved for writes until present and registered in the workbook schema.

#### Matches

| Classification | Columns |
|---|---|
| Writable | Year; Round; Format; Match; Team 1 Player 1; Team 1 Player 2; Team 2 Player 1; Team 2 Player 2; Course ID; Tee Time; Starting Hole |
| Runtime Writable | Team 1 Player 1 Playing HCP; Team 1 Player 1 Stroke; Team 1 Player 2 Playing HCP; Team 1 Player 2 Stroke; Team 1 Playing HCP; Team 1 Stroke; Team 2 Player 1 Playing HCP; Team 2 Player 1 Stroke; Team 2 Player 2 Playing HCP; Team 2 Player 2 Stroke; Team 2 Playing HCP; Team 2 Stroke; Matchup Winner; Front 9 Winner; Back 9 Winner; 18-Hole Winner; Team 1 Points; Team 2 Points; Match Status; Notes; Updated At; Updated By; Finalized By; Completed At; Finalized At; Match Number; Team 1 Player 1 Name; Team 1 Player 2 Name; Team 2 Player 1 Name; Team 2 Player 2 Name; Team 1 Player Names; Team 2 Player Names; Course; Tee; Final Result; Winner |
| Formula | Match ID |
| ARRAYFORMULA | None |
| Lookup | None |
| Derived / Read Only | FInalized At |

`FInalized At` is a legacy misspelled header and is not an approved runtime target. `Finalized At` is the active runtime field.

#### Live Hole Scores

| Classification | Columns |
|---|---|
| Writable | None |
| Runtime Writable | Hole Score ID; Match ID; Hole Number; Stroke Index; Format; Team 1 Gross Scores; Team 2 Gross Scores; Team 1 Net Score; Team 2 Net Score; Hole Winner; Revision; Updated At; Updated By |
| Formula | None |
| ARRAYFORMULA | None |
| Lookup | None |
| Derived / Read Only | None |

#### Match Update Log

| Classification | Columns |
|---|---|
| Writable | None |
| Runtime Writable | Log ID; Match ID; Action; Previous Value; New Value; Updated By; Updated At |
| Formula | None |
| ARRAYFORMULA | None |
| Lookup | None |
| Derived / Read Only | None |

#### Net Skins Result

| Classification | Columns |
|---|---|
| Writable | None |
| Runtime Writable | Year; Round; Hole; Winner; Winner Player ID; Winner Player ID 2; Skin Value; Round Pot; Winning Net Score; Format; Match |
| Formula | None |
| ARRAYFORMULA | None |
| Lookup | None |
| Derived / Read Only | None |

`Net Skins Results` (plural) is not written by the current runtime and is outside the runtime-write map. `Net Skins Result` (singular) is the official runtime output sheet.

### Odds, projections, and tournament intelligence

#### Odds Control

| Classification | Columns |
|---|---|
| Runtime Writable | Year; Current Official Phase; Updated At |
| Writable / Formula / ARRAYFORMULA / Lookup / Derived | None |

#### Odds Snapshots

| Classification | Columns |
|---|---|
| Runtime Writable | Year; Phase; Published At; Snapshot JSON |
| Writable / Formula / ARRAYFORMULA / Lookup / Derived | None |

#### Odds Team Results

| Classification | Columns |
|---|---|
| Runtime Writable | Year; Phase; Team; Win Probability; American Odds; Expected Points |
| Writable / Formula / ARRAYFORMULA / Lookup / Derived | None |

#### Odds Player Results

| Classification | Columns |
|---|---|
| Runtime Writable | Year; Phase; Player ID; Player; Top Player Probability; American Odds; Expected Points; Expected Record; Average Finish |
| Writable / Formula / ARRAYFORMULA / Lookup / Derived | None |

Storylines, Projection History, Biggest Movers, and Tournament Intelligence do not have separate workbook write paths. They are presentation-time derivations from published odds snapshots and tournament data. Their workbook access is read-only.

### Passport, devices, and notifications

#### Player Passport

| Classification | Columns |
|---|---|
| Runtime Writable | Tournament ID; Player ID; Invite Reference; Activation Code Hash; Activation Active; Activation Expires At; Activation Used At; Passport Version; Created At; Updated At; Updated By |
| Writable / Formula / ARRAYFORMULA / Lookup / Derived | None |

#### Trusted Devices

| Classification | Columns |
|---|---|
| Runtime Writable | Device ID; Tournament ID; Player ID; Session Version; Created At; Last Used At; Expires At; Revoked At; Device Label; PWA Installed; PWA Installed At; Notifications Enabled; Notifications Updated At; Notification Permission; Push Subscription; Subscription Updated At; Device Last Seen |
| Writable / Formula / ARRAYFORMULA / Lookup / Derived | None |

#### Notification Log

The current Preview sheet is empty and exports with a placeholder `Unnamed A` column.

| Classification | Columns |
|---|---|
| Runtime Writable (expected schema) | Notification ID; Notification Type; Tournament ID; Player ID; Device ID; Recipient; Time Sent; Delivery Status; Failure; Notification Preview Template |
| Derived / Read Only (current placeholder) | Unnamed A |
| Writable / Formula / ARRAYFORMULA / Lookup | None |

This is an exact schema mismatch. First notification logging currently relies on runtime header creation.

### Administrative content mutation

#### Players

| Classification | Columns |
|---|---|
| Writable | Player ID; First; Last; Display Name; Slug; Active; First Year; Last Year; Captain Eligible; Photo Filename; Board of Governors; Rookie; Handicap Committee; Nickname; Bio; Hometown; Captain; GHIN; Home Club; Career Notes; Role |
| Runtime Writable / Formula / ARRAYFORMULA / Lookup / Derived | None |

#### Handicaps

| Classification | Columns |
|---|---|
| Writable | Year; Player ID; Team Side; Tournament Handicap; Handicap Method |
| Derived / Read Only | Unnamed F |
| Runtime Writable / Formula / ARRAYFORMULA / Lookup | None |

#### Team Names

| Classification | Columns |
|---|---|
| Writable | Year; Team Side; Team ID; Team Names; Captain; Team Logo; Primary Color; Secondary Color; Motto; Description |
| Runtime Writable / Formula / ARRAYFORMULA / Lookup / Derived | None |

#### Courses

| Classification | Columns |
|---|---|
| Writable | Course ID; Year; Round; Format; Course; City; State; Destination; Tee Played; Slope; Rating; Yardage; Par; Year Opened; Designer; Website; Course Logo; Course Profile Image; GPS Link |
| Runtime Writable / Formula / ARRAYFORMULA / Lookup / Derived | None |

#### Awards

| Classification | Columns |
|---|---|
| Writable | Year; Award; Winner |
| Runtime Writable / Formula / ARRAYFORMULA / Lookup / Derived | None |

#### Draft Settings

| Classification | Columns |
|---|---|
| Writable | Year; Draft Name Override; Draft Date; Draft Time; Time Zone; Draft Location; Draft Status Mode; Draft Format; Total Picks; Team 1 ID; Team 2 ID; Team 1 Captain Player ID; Team 2 Captain Player ID; First Pick Team ID; Notes |
| Runtime Writable | Updated At; Updated By |
| Formula / ARRAYFORMULA / Lookup / Derived | None |

#### Draft Picks

| Classification | Columns |
|---|---|
| Writable | Year; Pick Number; Team ID; Player ID; Notes |
| Runtime Writable | Selected At; Selected By; Updated At; Updated By |
| Formula / ARRAYFORMULA / Lookup / Derived | None |

#### Tournament Itinerary

| Classification | Columns |
|---|---|
| Writable | Event ID; Tournament ID; Event Date; Day Label; Start Time; End Time; Event Type; Title; Subtitle; Location; Details; Round ID; Course ID; Display Order; Status; Featured |
| Runtime Writable | Updated At |
| Formula / ARRAYFORMULA / Lookup / Derived | None |

#### Guide Sections

| Classification | Columns |
|---|---|
| Writable | Section ID; Tournament ID; Section Name; Section Slug; Description; Display Order; Status |
| Runtime Writable | Updated At |
| Formula / ARRAYFORMULA / Lookup / Derived | None |

#### Rule Book

| Classification | Columns |
|---|---|
| Writable | Rule ID; Tournament ID; Category; Subcategory; Title; Body; Display Order; Status; Effective Year; Important |
| Runtime Writable | Updated At |
| Formula / ARRAYFORMULA / Lookup / Derived | None |

#### Guide Information

| Classification | Columns |
|---|---|
| Writable | Tournament ID; Section; Title; Body; Label; Link Text; Link URL; Display Order; Status; Sensitive |
| Runtime Writable | Updated At |
| Formula | Item ID |
| ARRAYFORMULA / Lookup / Derived | None |

#### Media Library

| Classification | Columns |
|---|---|
| Writable | Asset ID; Category; Label; Filename; URL; Alt Text; Status |
| Runtime Writable | Updated At; Updated By |
| Formula / ARRAYFORMULA / Lookup / Derived | None |

#### Site Settings

| Classification | Columns |
|---|---|
| Writable | Setting; Value; Description |
| Runtime Writable | Updated At; Updated By |
| Formula / ARRAYFORMULA / Lookup / Derived | None |

#### Prediction Settings

| Classification | Columns |
|---|---|
| Writable | Setting; Value; Description |
| Runtime Writable | Updated At; Updated By |
| Formula / ARRAYFORMULA / Lookup / Derived | None |

#### Admin Audit Log

| Classification | Columns |
|---|---|
| Runtime Writable | Audit ID; Resource; Record ID; Action; Summary; Previous Value; New Value; Updated By; Updated At |
| Writable / Formula / ARRAYFORMULA / Lookup / Derived | None |

### Reset-referenced sheets absent from Preview

Preview Reset also probes `Closest to Pin`, `Closest to Pin Results`, `Closest To Pin`, and `Closest To Pin Results`. None exists in the audited workbook. Because there is no schema to classify, all future columns on any of these tabs must be treated as Derived / Read Only until a Protected Column Map is registered.

### Remaining Preview sheets

These sheets have no current application write path, but are included so the map covers all 42 sheets in the audited workbook. Their classification is fail-safe: derived operational data is read-only unless a named write contract is introduced.

#### Tournament Rules

| Classification | Columns |
|---|---|
| Writable | Year; Round; Format; Team Size; Points Available; Front 9 Used; Back 9 Used; Overall Used; Front 9 Points; Back 9 Points; Overall Points |
| Runtime Writable / Formula / ARRAYFORMULA / Lookup / Derived | None |

#### Rounds

| Classification | Columns |
|---|---|
| Writable | Format ID; Name; Team Size |
| Runtime Writable / Formula / ARRAYFORMULA / Lookup / Derived | None |

#### Ghost Match

| Classification | Columns |
|---|---|
| Writable | Match ID; Player ID |
| Runtime Writable / Formula / ARRAYFORMULA / Lookup / Derived | None |

#### Course Holes

| Classification | Columns |
|---|---|
| Writable | Course ID; Tee; Hole Number; Yardage; Par; Stroke Index |
| Runtime Writable / Formula / ARRAYFORMULA / Lookup / Derived | None |

#### Round Scorecards

| Classification | Columns |
|---|---|
| Writable | Year; Round; Match; Format; Course ID; Player ID; Team ID; Hole 1; Hole 2; Hole 3; Hole 4; Hole 5; Hole 6; Hole 7; Hole 8; Hole 9; Hole 10; Hole 11; Hole 12; Hole 13; Hole 14; Hole 15; Hole 16; Hole 17; Hole 18; Score Type; Source; Notes; Scorecard Status |
| Formula | Match ID |
| Runtime Writable / ARRAYFORMULA / Lookup / Derived | None |

#### Course Scorecards

| Classification | Columns |
|---|---|
| Writable | Course ID; Course Name; Tee; Gender; Rating; Slope; Par |
| Runtime Writable / Formula / ARRAYFORMULA / Lookup / Derived | None |

#### Live Tournaments

| Classification | Columns |
|---|---|
| Formula | Team 1 Score; Team 2 Score |
| Derived / Read Only | Year; Tournament Status; Current Round; Last Updated; Live Message |
| Writable / Runtime Writable / ARRAYFORMULA / Lookup | None |

#### Net Skins

| Classification | Columns |
|---|---|
| Writable | Year; Round; Format; Player ID 1; Player ID 2; Buy-In; Eligible |
| Lookup | Handicap |
| Runtime Writable / Formula / ARRAYFORMULA / Derived | None |

#### Net Skins Results

| Classification | Columns |
|---|---|
| Derived / Read Only | Year; Round; Hole; Winner; Skin Value; Net Score |
| Writable / Runtime Writable / Formula / ARRAYFORMULA / Lookup | None |

#### Live Round Handicaps

| Classification | Columns |
|---|---|
| Writable | Year; Round; Format; Player; Handicap Index; Low Handicap Index |
| Formula | Hybrid Handicap; Course Handicap |
| Lookup | Player ID; Course ID; Tee; Slope; Rating; Par |
| Runtime Writable / ARRAYFORMULA / Derived | None |

#### Dining

| Classification | Columns |
|---|---|
| Writable | Year; Day; Meal; Cuisine; Start Time; End Time; Location; Dress Code; Reservation Required; Notes; Sort Order |
| Runtime Writable / Formula / ARRAYFORMULA / Lookup / Derived | None |

#### Important Contacts

| Classification | Columns |
|---|---|
| Writable | Year; Category; Name; Role; Phone; Text Enabled; Email; Website; Sort Order |
| Runtime Writable / Formula / ARRAYFORMULA / Lookup / Derived | None |

#### Local Guide

| Classification | Columns |
|---|---|
| Writable | Year; Section; Title; Description; Address; Phone; Website; Sort Order |
| Runtime Writable / Formula / ARRAYFORMULA / Lookup / Derived | None |

#### Tournament Timeline

| Classification | Columns |
|---|---|
| Writable | Year; Tournament Day; Event Date; Start Time; End Time; Event Type; Title; Subtitle; Location; Display on Home; Notification Minutes; Sort Order; Status Override |
| Runtime Writable / Formula / ARRAYFORMULA / Lookup / Derived | None |

## Runtime write audit

| Operation | Sheet(s) | Write method | Audit result |
|---|---|---|---|
| Live scoring | Live Hole Scores; Live Matches | Full row on runtime-only score rows; named-field updates on Live Matches | **Safe for existing mapped columns.** Live Matches writes target player pairing fields, results, status, access, and audit fields; formula/lookup fields are not targeted. Expected live-progress headers are missing from Preview. |
| Match finalization | Matches; Live Matches; logs; Net Skins Result | Full archive-field update/append; named-field live update | **Unsafe.** Existing Matches rows are updated across every header, including formula-owned Match ID. New appended archive rows also place a static value in the formula-owned column. |
| Match reopen | Matches; Live Matches; logs; Net Skins Result | Named-field updates | **Safe for mapped columns.** Only result/status/finalization fields are targeted. |
| Preview Reset | Tournaments; Live Matches; Matches; runtime result/log tabs | Named-field tournament write; full-row match writes; whole-tab clear/rebuild | **Critical unsafe.** Full-row writes can convert protected formulas/lookups to static values. Whole-tab replacement has no protected-column gate. |
| Net Skins synchronization | Net Skins Result | Whole-tab clear/rebuild | **Safe in the current map** because the sheet is wholly runtime-owned; structurally unsafe if a protected column is later added. |
| Odds publishing | Odds Control; Odds Snapshots; Odds Team Results; Odds Player Results | Whole-tab clear/rebuild | **Safe in the current map** because all four tabs are wholly runtime-owned. No simulation or projection presentation writes occur elsewhere. |
| Storylines / Tournament Intelligence | None | No workbook mutation | **Safe.** Read-only derivation from published data. |
| Passport/device lifecycle | Player Passport; Trusted Devices; Admin Audit Log | Append/full runtime row | **Safe in the current map.** These sheets are wholly runtime-owned. |
| Notifications | Trusted Devices; Notification Log | Named/full runtime writes and append | **Conditionally safe.** Columns are runtime-owned, but Notification Log currently lacks the expected headers and relies on runtime schema mutation. |
| Tournament administration | Tournaments; Admin Audit Log | Whole-row update | **Currently data-safe** because the audited Tournaments sheet has no protected columns, but the whole-row method is not future-safe. |
| Tournament Guide administration | Guide Sections; Rule Book; Tournament Itinerary; Guide Information | Whole-tab clear/rebuild | **Unsafe.** `Guide Information.Item ID` is formula-owned and will be replaced by a static ID. |
| Generic Admin CMS | Players; Team Names; Handicaps; Draft Settings; Draft Picks; Tournament Itinerary; Courses; Matches; Media Library; Awards; Site Settings; Prediction Settings | Whole-row update, whole-row clear, append, reorder | **Unsafe where protected columns exist.** Matches and Handicaps contain protected columns. The same blanket pattern lacks a column-purpose allowlist on all resources. |
| Admin audit | Admin Audit Log | Append | **Safe.** Dedicated runtime-only sheet. |
| Runtime schema initialization | Live Matches; Live Hole Scores; Passport/device/log sheets; odds tabs | Appends columns/headers or creates sheets | **Governance gap.** It mutates workbook structure without checking a Protected Column Map. |

## Unsafe writes discovered

### Critical — Preview Reset can overwrite formulas and lookups

- `resetPreviewTournament` calls `writeSheetRow` for every scoped `Live Matches` row and every scoped `Matches` row.
- The source records are value-only objects returned by the Sheets Values API. Writing those values back across the complete row replaces formula cells with their displayed values.
- `Live Matches` has 16 protected formula/lookup columns. `Matches.Match ID` is formula-owned.
- The reset also uses `replaceTab`, which clears `A:ZZ` and reconstructs full tabs without a column-purpose guard.

Locations: `lib/google-sheets-write.js:141-143`, `lib/google-sheets-write.js:158-203`.

### Critical — Match finalization writes the formula-owned Match ID

- Existing permanent matches are updated with an object built from every current header.
- Appended permanent matches include a static `Match ID` value in the formula-owned column.

Location: `lib/google-sheets-write.js:1621-1627`.

### Critical — Guide Information administration replaces Item ID formulas

- Guide save and delete clear and rebuild the whole tab.
- The current `Guide Information.Item ID` column contains formulas, while `safeGuideRecord` generates and writes a static ID.

Locations: `lib/google-sheets-write.js:1749-1766`, `lib/google-sheets-write.js:1775-1799`.

### High — Generic CMS uses unbounded whole-row writes

- Update/archive/reorder writes every existing header.
- Delete clears the complete row.
- The `Matches` CMS resource therefore overwrites or clears the formula-owned `Match ID`.
- `Handicaps.Unnamed F` is outside the CMS schema but is still included in full-row writes because the writer uses all actual sheet headers.

Locations: `lib/google-sheets-write.js:2044-2045`, `lib/google-sheets-write.js:2061`, `lib/google-sheets-write.js:2072`, `lib/google-sheets-write.js:2089-2090`.

### High — Schema mutation is not protected by the column map

- `ensureTabHeaders` appends missing columns and writes header cells at runtime.
- The audited Preview workbook is missing five live-progress headers and all Notification Log headers.
- This is not a formula overwrite today, but it bypasses the requirement to preserve workbook structure and creates columns without a registered protection classification.

Locations: `lib/google-sheets-write.js:359-385`, `lib/google-sheets-write.js:427-433`.

## Formula integrity verification

| Check | Result |
|---|---|
| Workbook audited without writes | Pass |
| Workbook export SHA-256 before/after audit | `04ebbddd7bbd2cabaa27ddfb7e93308dca9aefac3caff57e28ee5bb4cab65e9a` |
| Formula cells preserved in audit copy | 613 |
| Standard Formula cells | 24 |
| Lookup formula cells | 589 |
| ARRAYFORMULA cells detected | 0 |
| Leading-apostrophe formula-like values | 0 |
| Defined names present | 69 |
| Workbook source modified | No |

The Excel audit engine reported 168 `#NAME?` results in exported Google-specific `FILTER`/`INDEX` formulas on `Live Matches` and `Live Round Handicaps`. The formula text remains present. These results are an Excel/export evaluator compatibility warning, not evidence that this audit changed formulas. Formula calculation health must be verified in Google Sheets itself; the export alone cannot prove Google-native function evaluation.

## Required architecture going forward

The Workbook Protection Standard is the governing architecture for all future development:

1. Introduce a checked-in, field-name-based Protected Column Map before any further workbook mutation work.
2. Route every write through a protected writer that rejects Formula, ARRAYFORMULA, Lookup, Derived / Read Only, and unknown columns.
3. Replace whole-row writes with named-field patches.
4. Replace whole-tab clears with scoped row deletion/update that preserves protected columns and workbook structure.
5. Make schema initialization compare against the map and fail closed instead of appending unregistered columns.
6. Add pre-write formula snapshots and post-write verification for every workbook-mutating test.
7. Do not execute Preview Reset until its Live Matches and Matches writes are column-scoped.

## Audit conclusion

The workbook itself was not altered, and its formulas were preserved during this audit. Current targeted live-scoring, notification, passport/device, Net Skins, and odds-output writes are compatible with their mapped runtime-owned columns. However, Preview Reset, permanent match finalization, Guide Information administration, and generic CMS whole-row mutations are not compliant with the Workbook Protection Standard and can overwrite protected workbook cells.

This report establishes the Protected Column Map as the required baseline for future workbook development. Unknown or ambiguous columns are read-only by default.
