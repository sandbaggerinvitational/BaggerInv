# Release B final certification

2026-09-09 — **PASS, local candidate only. Production deployment NOT AUTHORIZED.**

## Authority baseline and release boundary

Parent: release 75 / `76dfb0097f23d132c7010131f34c2df895bdb856`.
The prior integration pass refreshed Production read-only: R1/R2 24 participants each and unstarted, R3 empty; Net Skins NOT_CONFIGURED revision 1 with no entries/results/active jobs; Calcutta NOT_CONFIGURED revision 1, auction 0, unpublished and no results/active jobs. This tie-fix pass made no Production queries or mutations. Refresh all live bindings before any separately authorized deployment; local PASS is not live certification.

Prospective correction: YES. No historical result migration is required for the last observed unconfigured/unpublished Production state. No Preview QA handicap values were imported. No native, Odds, Release A, scoring or financial records were changed.

## Exact tie-metadata loss and correction

The canonical engine already calculated correct pair/player tie groups, occupied places and averaged awards. `calcuttaPublicationRecords` omitted round tie size from its serialized rows. The second `buildCalcuttaModel` pass, using those published rows, hard-coded `tieSize: 1`. That caused metadata loss before the result payload was stored, not in PostgreSQL or the participant decoder.

The only new application behavior in this blocker-resolution pass is in `lib/calcutta.js`:

1. Copy canonical `round.tieSize` into additive publication field `Tie Size`.
2. Read that field unchanged in the published-result rebuild, with the previous `1` fallback only for historical rows lacking the field.

No independent tie grouping or ranking was introduced. No financial formula changed. A test injects an explicit metadata sentinel and proves readback copies it rather than reranking. Historical missing-field rows retain baseline behavior; no historical records are rewritten or retrospectively certified as recovered tie groups.

The existing immutable result representation stores the engine JSONB payload, including round `tieSize`. The installed `project_production_calcutta_v1_result(jsonb)` explicitly allowlists and copies it. Existing Production participant, PWA and mobile decoders preserve it. The QA result-view adapter also passes it through. Actual PostgreSQL projection tests exercise this field for BB, SC and SI with 1/2/3-way groups. Normal publication/QA state gates remain unchanged.

**Migration decision:** application/server source accompanying Release B only. No successor migration needed. 098 and 099 remain byte-for-byte identical to the integrated candidate before the tie fix. Applied 095/096/097 remain untouched.

## Fresh certification results

All commands ran after the metadata fix. Prior failing runs are not counted as PASS.

| Run | Passed | Failed / skipped |
|---|---:|---:|
| Tie metadata + Full Net + entry UI + Production worker/server suites | 38 | 0 / 0 |
| Complete combined PostgreSQL entry/Full-Net/Release-A/handicap parity suites | 40 | 0 / 0 |
| Director, Odds, award engines, Scramble placement, Production participant/mobile/scoring suites | 152 | 0 / 0 |
| Total test executions | 230 | 0 / 0 |

Counts include Node parent/imported baseline tests, not 230 independently named business scenarios. PostgreSQL suite files: `release-a-late-r3`, `release-b-full-net`, `net-skins-entries`, `net-skins-entries-ancestry`, and `handicap-js-postgres-parity` integration tests. Lifecycle reduced fixtures install exact 099 projection/source functions; complete 001–097 → 098 → 099 installation is also exercised separately against actual migration ancestry.

`npm run build`: PASS, exit 0. Existing CSS/webpack warnings and unavailable historical-sheet fetches using the existing bundled fallback remain; they were not corrected or treated as live-data verification. `git diff --check`: PASS.

### Required metadata and money checks

- BB PLAYER, SC PAIR, SI PLAYER: untied 1, two-way 2, three-way 3 — PASS.
- Calculation → publication → JSON serialization → model rebuild — PASS.
- Installed SQL participant projection → existing participant/PWA/mobile decoder behavior — PASS (SQL projection and decoder coverage are separate deterministic checks).
- QA vs published projection canonical tie metadata — PASS.
- Exact comparison against the pre-fix engine at baseline SHA: all model and publication values equal after excluding only `tieSize`/`Tie Size` — PASS.
- This equality includes place, Points, purchase price, ownership, market, round winnings, guaranteed value, projected/final value, profit/loss, ROI and owner portfolios. Pair award averaging and player 50/50 allocation remain unchanged.
- Existing JavaScript floating-point/payout precision remains unchanged; no new rounding or financial aggregation formula.

### Combined authority checks

- 098 explicit PLAYER/PAIR entry, opt-out, non-entered exclusion, stale/reformed-pair consent, duplicates, idempotency, CAS, service/Director authorization and tournament isolation — PASS.
- 099 shared frozen individual Full Net for BB/SI and Team Full Net for SC; full-precision Course Handicap, final rounding, signed/plus strokes, full 18-hole cycles and incomplete/unavailable scores — PASS.
- Calcutta purchased-player field remains independent of Skins consent — PASS.
- Net Skins buy-ins, unique-low/tie/no-carry and payouts unchanged; no active-field or Playing-HCP fallback — PASS.
- Matchup products preserved; Release A incremental R3, pre-delete classification, Save-All rollback/retries, clear/repopulate protection, prepared/start/approval lifecycle, financial compatibility and job races — PASS.
- Actual Release A initialization → preparation → explicit 098 Singles entry while R1/R2 remain protected — PASS.
- Odds and Net Skins lifecycle guards preserved; no guard exemption added — PASS.

## Migration hashes (SHA-256)

| Migration | Hash |
|---|---|
| 095 | `3e70203056f6a6e0f59aa7f06161cc01352057027ec4643e41e92948ebf99919` |
| 096 | `0c2c5894aebe7d1cde4eb7fa9b8ead6c2f246df24f7cfaecd6e24257cba07af7` |
| 097 | `ba6af5585889b956b9d336c02deeff0db8cefdc67a22e1c35175dcb130002109` |
| 098 | `a7a3ebca7d552934e3ff0531362098467ac5a7c0c5ee84e9a4bb4869b979c8e8` |
| 099 | `0f8524925e62ab21243c81511f258990fb4acee5da7e9dc80193bdf3bcf7d59d` |

098 matches the certified entry-prerequisite draft byte-for-byte. The original former-098 Full-Net draft and its worktree remain preserved; [integration report](release-b-098-099-integration-certification.md) records the exact six-part integration diff to 099.

## Exact candidate file boundary

```text
app/admin/director/ProductionDirectorOperations.js
app/admin/director/ProductionNetSkinsEntries.js
app/admin/director/net-skins-entries.module.css
app/api/admin/production-net-skins-v1/route.js
app/api/director/net-skins-entries/route.js
docs/release-b-098-099-integration-certification.md
docs/release-b-final-certification.md
lib/calcutta-supabase.js
lib/calcutta.js
lib/net-skins-entry-workspace.js
lib/production-calcutta-server.js
lib/production-full-net.js
lib/production-net-skins-server.js
lib/production-tournament-setup-server.js
supabase/production_migrations/202609090098_production_net_skins_entries_v1.sql
supabase/production_migrations/202609090099_production_full_net_consumers_v3.sql
test/calcutta-tie-metadata.test.mjs
test/fixtures/calcutta-tie-metadata.mjs
test/fixtures/release-b-canonical-sql.mjs
test/net-skins-entries-ancestry-postgres.integration.test.mjs
test/net-skins-entries-postgres.integration.test.mjs
test/net-skins-entries-server.test.mjs
test/net-skins-entry-workspace.test.mjs
test/production-calcutta-v1-server.test.mjs
test/production-net-skins-v1-server.test.mjs
test/release-a-late-r3-postgres.integration.test.mjs
test/release-b-full-net-postgres.integration.test.mjs
test/release-b-full-net.test.mjs
test/step13e6-production-tournament-setup-application.test.mjs
test/step13e7b1-production-annual-calcutta-postgres.integration.test.mjs
```

The local node_modules symlink is not part of the candidate. No native or unrelated worktree files are included.

## Deployment and recovery gate

No deployment/activation, migration application, opt-in save, scoring, financial operation or result publication is authorized by this certification. The exact candidate commit is prepared for separate review only; its SHA is supplied with the handoff.

Future authorization must refresh Production release/migration/configuration state and confirm this prospective boundary still holds. Apply new transactional 098 then 099 only through the authorized release process. If 099 fails, its transaction rolls back while successfully installed 098 remains; do not rewrite 098 or delete consent/history. Preserve historical calculation/revision identities. Use a reviewed versioned recovery if required, never an implicit-eligibility/Playing-HCP fallback or result republication as a workaround.
