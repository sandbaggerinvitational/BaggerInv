# Certification Calcutta post-commit adapter

Status: PASS at the tested local layer. Actual configured initial2026 calculation,
financial preservation and authorization negatives pass6/6;26 new behavioral unit
cases plus8 existing annual cases pass34/34. No migration or new authority is introduced.

## Demonstrated defect

The actual Next boot proof committed a participant score and recovered its
receipt, then logged `Calcutta recalculation remains pending` with
`CERTIFICATION_INPUT_INVALID`. `recalculateCalcuttaAfterCanonicalMutation`
selected Production only from `VERCEL_ENV=production`; the separately admitted
Certification environment therefore fell through to the old Preview calculator.
Its legacy mutation envelope correctly failed the Certification read adapter.

This did not roll back the score, mutate financial facts or remove the durable
intent. The required autonomous Certification worker already existed. Its unconfigured
case was proven separately; the newly configured test exposed the claim DTO
mismatch documented below. The stale opportunistic hook selection was an ordinary
provider-neutral adapter defect within the approved R2 architecture.

## Minimum correction

`lib/calcutta-post-commit.js` explicitly recognizes Certification before the
unchanged Production/Preview branches. It resolves the existing branded WORKERS
context and requires the supplied tournament to equal both canonical current and
scoped tournament IDs before calling a worker mutation. That exact context is
passed to the existing current delivery adapter throughout the hook; a concurrent
release/annual/admission change conflicts in SQL instead of silently rebinding.

The existing delivery tick materializes its usual required families in separate
transactions. Only the existing CALCUTTA processor executes from this hook, and
only when the tick says it is ready. The processor retains canonical claims,
source/revision checks, calculation, result writes and durable failure handling.
It cannot configure finances or publish. The normal autonomous polling worker
remains required; this post-response wakeup does not replace it.

No new RPC, phase, role, identity, financial policy, publication permission,
Google fallback or privileged client path is created. Ordinary Production and
Preview function branches are byte-identical to the frozen base. The hook's
current-target mismatch is a local409 failure; a stale or denied database context
keeps the existing fail-closed response.

## Proof

- Eight new hook behavioral transport cases cover current2026 and generic2097,
  missing/wrong target before mutation, invalid registration, denied WORKERS
  context and stale context without rebinding. The original focused run with existing tests passed26/26 and remains
  preserved. An additional18 claim-binding cases now test initial133/future141
  response contracts, missing/contradictory targets, activation and generation.
  The new hook/claim file plus8 existing annual cases passes **34/34**.
- The final actual local Next boot passes **8/8**, with147 actual RPCs, three
  successful delivery ticks and no Calcutta warning. Its initial fixture has no
  configured auction, so that boot proves correct safe routing/skipping, not a
  completed Calcutta calculation. Evidence:
  `implementation-evidence/application-boot-2026-10-03T02-21-52-716Z.json`.
- `test/reliability-phase2dr2-calcutta-post-commit.integration.test.mjs` separately
  exercises the actual hook with an authorized synthetic auction and genuine
  score, canonical calculation/readback, unchanged ownership/prices/publication,
  repeat invocation, real revision race and negative admission: **6/6 PASS**
  (five behavioral cases plus parent), sourceStable. Evidence:
  `implementation-evidence/calcutta-postcommit-final-receipt.json` and
  `implementation-evidence/calcutta-postcommit-2026-10-03T02-43-10-137Z.json`.
  The configured result is PROVISIONAL, and financial publication stays unchanged.

The original boot polling `ECONNRESET` was a separate test transport defect:
synchronous local database subprocesses prevented normal socket yielding between
Odds checkpoints. The local transport was corrected to asynchronous subprocesses
without changing SQL, roles, authorization or shipping code. Original failures
remain preserved. No hosted transport or Production behavior is inferred.

## Existing canonical claim DTO alignment

The actual configured test exposed `PRODUCTION_CALCUTTA_JOB_RUNTIME_MISMATCH`:
initial133 returns `calculation_input` with canonical tournament/configuration/core
bindings, while its legacy job object omits `tournament_id` and runtime generation.
The earlier Certification branch required that absent field and rejected every
future target unconditionally. This is the ordinary existing-wrapper/caller
repair permitted by the approved R2 scope (§150–152), not new authority.

`lib/production-calcutta-server.js` now validates the existing Certification DTO
against the already-branded WORKERS context: all three calculation target
projections and job activation must match. Initial2026 omission is accepted only
where133 already omits the fields; contradictory supplied target/generation is
rejected. Future141 requires exact response/job targets and matching valid UUID
generations. SQL independently validates the actual generation against the same
retained resource/context. Production's existing branch is unchanged. No client
field, RPC, permission, publication policy or claim/CAS predicate is added or
relaxed.

The first failed standalone fixture introduced initial configuration after the
score, so no eligible configured work was present. Its corrected chronology is
initial synthetic configuration → actual owner partial auction → actual score →
actual hook/claim/calculator/completion. One purchase is deliberately retained;
auction completeness was not fabricated to force readiness. The next failure
exposed the genuine omitted-field mismatch. A third run completed the calculation
but the new test expected the wrong stale error string. Existing131 correctly
returns `CANONICAL_RESOURCE_CONTEXT_STALE`, SQLSTATE40001, HTTP409; the assertion
now requires that exact contract. All three counterevidence files remain intact.

Future configured Calcutta calculation is **not runtime-proven by this focused
suite**. Its modeled valid response passes binding and deliberately reaches the
unchanged strict Full-Net validator; missing/misbound future DTOs fail earlier.
Annual22 and the actual local application boot used unconfigured Calcutta and
therefore did not enter this changed claim branch. Their retained evidence does
not become a claim of future configured financial execution.
