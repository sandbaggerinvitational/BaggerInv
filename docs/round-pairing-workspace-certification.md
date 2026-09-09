# Round pairing workspace — local certification

## Release boundary

Application change plus additive migration
`202609090095_production_round_pairings_v1.sql`. Exact-SHA Production authorization
is required before applying it or deploying. No Production read or mutation was
needed for this implementation. The existing Guide audit file and `launch-video/`
are unrelated and excluded from this payload.

## Authority and operation

- Individual pairing saves retain the existing bounded operation.
- Full-round review submits one `REPLACE_ROUND_PAIRINGS` operation to the new
  service-only `mutate_production_round_pairings_v1` RPC.
- Expected Setup revision, current approved handicap revision identity, fixed
  Production/2026/Director scope, UUID request identity and canonical hashes bind
  the request. Existing runtime/entitlement assertions and Setup lock are reused.
- The complete desired round is validated before writes. Unchanged canonical
  matches participate in coverage validation but are not rewritten.
- BB/SC require four slots (two per team); SI requires two (one per team).
  Current 2026 topology is six BB, six SC and twelve SI matches: each round has
  24 slots, using each active roster Player exactly once. The RPC checks the actual
  canonical match set and format capacities against the active roster; it does
  not infer identities from names or row positions.
- Changed manifests are removed together inside the transaction, then the existing
  single-match pairing helper applies each replacement. This allows cross-match
  swaps while retaining the existing canonical handicap and allocation logic.
  Any later failure rolls back the entire operation.
- One successful changed round advances Setup once, with one immutable round
  audit and receipt. Exact retries return the original result without additional
  writes. Conflicting retries, stale revision, wrong year, duplicates, missing
  coverage, wrong teams, started matches and missing prerequisites fail closed.
- Existing pairing-derived context invalidation/revocation is reused. No scoring
  snapshot is prepared, scoring access activated, or score created automatically.

## Client state and review

Drafts are owned by the Setup workspace and keyed by stable match ID. Authoritative
reloads merge underneath pending selections. Successful single saves clean only
the matching saved selections. Compatible same-match detail saves preserve Players
and require review again. Changed external pairing/course/round/handicap/snapshot
context retains but blocks the affected draft until explicitly resolved.

Round tabs are keyboard accessible. Reviews move focus into the review heading.
The full-round review includes changed/unchanged matches, stable Player IDs,
coverage, impact counts, Setup predecessor and approved handicap revision.
Scoring context preparation remains a distinct action.

No localStorage/sessionStorage persistence was introduced. A normal browser reload
can still lose pending drafts; before-unload and link-navigation warnings protect
against accidental loss. The in-app Refresh Saved State action preserves drafts.

## Local tests

- Application regression selection: 110 passing tests across Setup, workspace,
  handicaps, scoring, War Room symmetry/parity/performance, Odds, Net Skins,
  Calcutta, Director and public/PWA boundaries.
- Native scoring contract: 6 passing tests, run with `--conditions=react-server`.
- Serial PostgreSQL integration: 4 passing tests, including atomic BB/SC/SI saves,
  an injected late-write failure with complete rollback, exact/conflicting retries,
  unchanged-match fingerprints, inert installation, grants and JS/SQL parity.
- Actual Director client in local Chromium with a synthetic fetch transport:
  draft preservation, individual successes/failure, tee-time save, round commit,
  keyboard tabs and review focus. External browser requests are blocked.
- Workspace and round review checked at 390, 430, 820, 1280 and 1440px, with
  full-length Player names, no document overflow and 44px+ action buttons.
- Production build and `git diff --check` passed. The build retains existing CSS
  warnings and unavailable legacy build-time Google reads in the offline environment.

One old Director regression expected handicap controls to be available without a
handicap read, contrary to the unchanged installed `Boolean(handicaps)` contract.
The test now checks both unavailable and available states; application behavior
was not changed to satisfy it.

### Reproduction

```sh
node --test test/round-pairing-workspace.test.mjs
node --test --test-concurrency=1 test/step13e6-production-tournament-setup-postgres.integration.test.mjs test/handicap-js-postgres-parity-postgres.integration.test.mjs
node --conditions=react-server --test test/mobile-v1-scoring-contracts.test.mjs
node --test test/round-pairing-browser.test.mjs
npm run build
git diff --check
```

Browser certification requires Playwright and its Chromium runtime. Set
`BAGGER_PLAYWRIGHT_MODULE` to a supplied runtime module if it is not installed in
the repository, and `PLAYWRIGHT_BROWSERS_PATH` if using a disposable browser cache.
`BAGGER_KEEP_BROWSER_ARTIFACTS=1` retains temporary screenshots for visual inspection.
The test does not use a signed-in Production browser or real mutation endpoint.

## Production preservation

No Production migration, deployment, pairing save, scoring preparation or other
operational action was executed. Local fixtures reproduce the revision-10 saved
R1-1 identities (JP01/MH01 versus MS01/JS01) and R1-2 identities
(DT01/AM01 versus CP01/JK01), and prove a later four-change round review retains
those canonical assignments. This is local certification, not a fresh assertion
about concurrent Production activity.
