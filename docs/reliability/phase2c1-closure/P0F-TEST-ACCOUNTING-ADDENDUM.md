# P0-F approved admission test accounting addendum

This supplements, and does not rewrite, the historical [TEST-ACCOUNTING.md](TEST-ACCOUNTING.md). Exact identities/actions and file hashes are in [p0f-test-accounting-addendum.json](p0f-test-accounting-addendum.json).

**PROVEN — SOURCE/UNIT:** two new broad failures expected Google Sheet configuration to remain an admission prerequisite. Owner-approved A intentionally removes that prerequisite while preserving canonical database provenance and all request/security gates. Updating these expectations does not classify an actual capability failure as test cleanup.

| Existing test | Action | Coverage preserved/replaced |
|---|---|---|
| `candidate control rejects SHA, branch, deployment, project, and Production resource drift` | Remove retired Sheet-ID rejection; replace obsolete canonical `supabase` rejection with unsupported-provider rejection. Identity unchanged. | Every SHA, branch, deployment, project, canonical database, host, origin, method, path, HTTPS and entitlement denial remains. New zero-Google test verifies immutable provenance plus scoring/mirror/publication denial. |
| `Step 11 Production Odds gate requires the exact isolated candidate and keeps publication Google` | Rename to `Step 11 Production Odds gate requires the exact isolated candidate and forbids candidate publication`; remove retired Sheet-ID rejection only. | Existing publication-enable, external-write, project/ref, rehearsal-secret and retained-job scope denials remain. New zero-Google test verifies absent/mismatched configuration and publication unavailable. |

The two new exact identities are:

- `candidate control requires canonical resources but no Google workbook configuration`
- `Step 11 diagnostic Odds admission ignores retired Google workbook config and never enables publication`

The historical Step11 rehearsal contract still carries its existing disabled-publication compatibility label. These tests do not reactivate Google or change that maintenance contract. The candidate database provenance identifier is preserved; neither new test contacts the resource it names.

## Inventory arithmetic

The original fixed 493-file broad selection remains unchanged. Before this addendum it contains 4,095 tests. These changes delete **0**, add **2**, and rename **1** test, giving **4,097** tests. Both previously failing identities retain their required security coverage. The 20 known baseline failures are untouched. No exclusion or skip was added.

**PROVEN — LOCAL UNIT:** both affected files together pass **14/14**, fail 0, skip 0, with outbound network denied. Development raw log: `/private/tmp/p0f-approved-google-prerequisite-tests.tap`. Final broad totals and failure identities must come from the coordinator's fresh source-bound `evidence/p0f-approved/application.json`; this addendum does not predict that outcome.

No source/runtime, SQL, authorization implementation, Production, Google account or competitive data change was made by this test-accounting adjustment.

## Final approved read-adapter coverage

The separate focused file `test/reliability-p0f-read-adapter-extension.test.mjs` adds55 tests outside the frozen493-file broad selection. Its first44 identities are preserved exactly; the final History RPC approval adds11 service/adjacent-reader/compatibility cases, with0 deletions,0 renames and0 skips. The old required actual-History failure is now a passing positive assertion under the approved runtime correction. It was not weakened or excluded.

The source-bound combined adapter run is112/112 PASS (55focused +57existing compatibility tests). These overlap other suite selections and must not be summed into a unique grand total. The broad inventory remains4,097; final broad execution and20 unchanged full normalized failure diagnostics are recorded separately. No baseline failure was modified to improve totals.
