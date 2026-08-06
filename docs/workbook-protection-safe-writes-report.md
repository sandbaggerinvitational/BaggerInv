# Workbook Protection — Safe Field Writes Report

Audit date: 2026-08-04  
Environment: Preview  
Branch: `feature/mock-tournament-qa-integration`  
Workbook: `Mock 2026 Sandbagger Tournament`

## Result

The Sprint 24 Workbook Protection Audit was rerun after implementation.

**Remaining unsafe write paths: 0.**

All Google Sheets mutations now resolve columns by field name, validate the field against the checked-in Protected Column Map, and write or clear only explicitly approved Writable or Runtime Writable cells. Unknown, missing, Formula, ARRAYFORMULA, Lookup, and Derived / Read Only columns fail closed.

No Production code path, Production workbook, odds calculation, runtime calculation, or workbook formula was modified.

## Unsafe paths resolved

| Prior finding | Resolution |
|---|---|
| Preview Reset rewrote complete Live Matches and Matches rows | Reset now computes changed approved fields and patches only those cells. Runtime result/log records are cleared only across their approved runtime fields. |
| Match finalization included formula-owned Match ID | Finalization filters the archive snapshot through the Matches writable-field allowlist. Match ID is never written. A missing workbook-generated archive row aborts finalization. |
| Tournament Guide rebuilt complete tabs | Guide records now use field-scoped updates and clears. Guide Information Item ID is excluded from all writes. New Guide Information records require a pre-generated formula row. |
| Generic CMS rewrote or cleared complete rows | Create, update, archive, delete, and reorder now use explicit writable-field sets. Protected identifiers and compatibility columns remain untouched. |
| Runtime output used complete-tab replacement | Net Skins and Odds output now clear and repopulate approved runtime fields only. No header or protected cell is included. |
| Runtime schema initialization added sheets or columns | Schema functions now validate only. Missing sheets, missing fields, and unclassified fields abort with a diagnostic and never alter workbook structure. |

## Central protection layer

`lib/workbook-protection.js` is the executable Protected Column Map.

It contains all 42 audited Preview sheets and supports exactly six classifications:

- Writable
- Runtime Writable
- Formula
- ARRAYFORMULA
- Lookup
- Derived / Read Only

The write validator enforces:

1. The sheet is registered.
2. The field exists in the workbook header row.
3. The field is classified.
4. The field is Writable or Runtime Writable.
5. The value is not a leading-apostrophe formula.
6. Protected field formulas/values match before and after an existing-row mutation.

## Match finalization

Completed match values are still frozen as historical values in approved archive fields. Formula-owned `Matches.Match ID` is excluded from updates and is never replaced with a value.

If no pre-generated Match ID row exists, finalization stops with:

`Matches requires a workbook-generated Match ID row ... Protected formulas were not modified.`

This preserves the historical snapshot model without allowing the application to manufacture or overwrite workbook formulas.

## Tournament Guide

Guide administration now updates only editable content fields and runtime audit timestamps.

`Guide Information.Item ID` remains Formula and read-only. Existing records preserve their formula cell. Creating a new Guide Information record requires an available workbook-generated formula row; otherwise the operation aborts without a workbook change.

## CMS operations

All Admin CMS operations are field-scoped:

- Update writes only changed editable/runtime fields.
- Archive writes only the archive field and supported audit fields.
- Delete clears only approved writable/runtime fields.
- Reorder writes only the configured order field.
- Creation is rejected when its identifier is workbook-generated.

`Matches.Match ID` and `Handicaps.Unnamed F` are never targeted.

## Runtime schema protection

The writer no longer contains sheet creation, column creation, header creation, `appendDimension`, or whole-row append behavior.

Current Preview schema diagnostics from the audited workbook remain:

- `Live Matches` is missing: Current Hole, Team 1 Holes Won, Team 2 Holes Won, Holes Remaining, Match Status Text.
- `Notification Log` is headerless and exposes only the export placeholder `Unnamed A`.

The application now reports these conditions and stops the affected write. It does not repair them automatically. These are workbook configuration items, not unsafe write paths.

## Validation results

| Check | Result |
|---|---|
| Protected Column Map coverage | 42 / 42 sheets |
| Audited workbook columns classified | All present columns classified |
| Formula cells in audit copy | 613 preserved |
| Lookup formula cells | 589 preserved |
| ARRAYFORMULA cells detected | 0 |
| Leading-apostrophe formula-like values | 0 |
| Defined names | 69 preserved |
| Workbook audit copy SHA-256 | `04ebbddd7bbd2cabaa27ddfb7e93308dca9aefac3caff57e28ee5bb4cab65e9a` |
| Whole-row write functions | 0 |
| Whole-row clear functions | 0 |
| Whole-tab replacement functions | 0 |
| Runtime sheet/column creation primitives | 0 |
| Unsafe write paths | 0 |
| Automated tests | 571 passing |

The exported workbook continues to report 168 Excel `#NAME?` compatibility results for Google-specific formulas. Formula text remains intact; these are export-evaluator limitations previously documented in the Sprint 24 report and were not introduced by this implementation.

## Governing architecture

The Protected Column Map is now enforced in code, not only documented. Future workbook writes must register each field by purpose and pass through the protected field writer. Unknown or ambiguous columns remain read-only by default.

Workbook reads are additionally governed by the [Workbook Data Source Architecture](./workbook-data-source-architecture.md). Worksheet names must be verified against the active Preview workbook, and existing authoritative application services must be reused instead of introducing parallel workbook assumptions.
