# Director Calcutta management candidate

Base: `3985efb0c6c6cf99ffc38e92ca2b8b31f0b38971`.
Branch: `codex/director-calcutta-management`.
Production has not been read or mutated during implementation. The owner-provided
baseline (configuration revision 2, unpublished, no auction/results) is untouched.

## Scope

- Existing Director Odds & Side Games gains separate Points & Payouts and
  Auction / Ownership editors. Existing results/publication actions stay separate.
- Exact decimal percentages, totals, 50/50 Scramble shares, ownership costs and
  hypothetical payout previews are presentation helpers, not a second financial engine.
- Canonical active roster determines the year, identities and number of places.
  Existing buyers are roster participants; external buyer identities are not supported
  by the installed canonical auction contract and are not invented here.
- Config saves call the existing immutable configuration operation. The intentional
  non-monotonic overall payout is accepted. Every returned value is read back.
- Entry saves change one golfer through the existing whole-auction immutable revision
  contract. The server merges the selected entry with its immutable predecessor;
  other entries are retained. Existing CAS and receipt/idempotency guards remain authoritative.
- Uncertain responses retain the exact request in the mounted editor. Retrying uses
  the same immutable predecessor and identity. Discard/reload reads canonical state.
  Leaving/reloading the page discards local intent; the browser warns on unsaved changes.
- No new configuration, auction, publication, calculation job or result is created on load.

## Additive migration

`supabase/production_incremental/director-calcutta-management-read-v1.sql`

Creates a private, allowlisted current-tournament read projection and its frozen /
annual runtime wrappers. Projection includes only editing fields, active buyer/golfer
IDs and names, decimal strings, configuration/auction IDs and revision fingerprints,
publication status and the requested immutable auction predecessor. It exposes no
Auth UUID, contact information, source payloads, GHIN data or audit metadata.

The service-only frozen wrapper uses existing runtime and Director entitlement
assertions and verifies the current pointer. Future tournaments use the existing
annual dispatcher and runtime guards. The helper and future target are not directly
executable by service_role; the future target is invoked by the existing security-definer
dispatcher. Anonymous and authenticated participant roles have no execution privilege.

No table/schema redesign; no existing financial, scoring, publication or mutation
function is replaced. The annual allowlist gains one READ operation. Installation
creates no financial facts and does not advance a tournament or Calcutta pointer.
Participant endpoints and their unpublished-data restrictions are unchanged.

## Certification

- Focused model/server suite: 17 passed (including request replay after uncertain
  readback, conflicting retry, stale predecessor, full readback, current/future routing).
- Disposable PostgreSQL 17 integration: passed; full predecessor migrations are
  installed, the new migration is inert, existing mutation bodies are byte-for-byte
  unchanged, private grants deny participant access, revision-2 values and exact
  currency survive projection, self/multiple ownership validates, incomplete ownership
  fails, and service-role direct updates cannot alter historical revision rows.
- The installed Calcutta revision contract uses revoked table UPDATE privileges and
  append-only bounded RPCs; it does not promise immutability against a DB superuser.
- Synthetic browser acceptance: 390, 430, 820, 1280 and 1440px; no document overflow,
  44px actions, labeled controls, keyboard access, explicit confirmation, no write on
  load, invalid ownership blocked, self-purchase and Save & Next verified.
- Production build passed. `git diff --check` passed.
- Broad Calcutta/Director/PWA run: 305 passed, 5 failed. The unchanged base reproduces
  the SAME five failures (277 passed, 5 failed). They are stale source-text expectations:
  old leaderboard-module rendering; old Net Skins explanatory copy; old Setup action
  copy; old Director bootstrap call shape; and old `/home` redirect. No assertion was
  weakened or deleted to obtain a pass. The broad suite is therefore not fully green.
- Director entitlement tests require `--conditions=react-server`; all nine pass with
  that runtime. Running without it produces a pre-existing server-only import failure.

## Reproduction

```sh
node --conditions=react-server --test test/calcutta-management-server.test.mjs
node --test --test-concurrency=1 test/step13e7b1-production-annual-calcutta-postgres.integration.test.mjs
npm run build
git diff --check
```

The PostgreSQL runner uses a disposable local cluster and stops/removes it afterward.
It may require execution outside the filesystem sandbox for shared memory.
Browser runner: `scripts/calcutta-management-browser.mjs`; supply an installed
Playwright module via `BAGGER_TEST_PLAYWRIGHT_PATH` and its local browser cache via
`PLAYWRIGHT_BROWSERS_PATH`. The runner bundles the actual editor with synthetic
intercepted requests; it cannot call Production or publish anything.

## Exact proposed deployment scope — NOT authorized yet

1. Reconfirm then-current Production lineage and revision-2/auction/results baseline.
2. Install only the additive private read migration once.
3. Deploy/rebind the separately authorized candidate SHA through the established gate.
4. Read-only acceptance: editor reads canonical current revision, no write on load,
   protected financial/publication/competition fingerprints unchanged, participant
   reads still exclude unpublished information.
5. Do not enter auction data, save configuration or publish during release acceptance.

No application deployment, database installation, environment change or Production
mutation occurred in this implementation task. This is an owner-review candidate;
the pre-existing regression failures are explicitly retained as a certification caveat.
