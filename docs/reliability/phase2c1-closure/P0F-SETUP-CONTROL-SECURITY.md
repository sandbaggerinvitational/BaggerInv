# P0-F setup/control security proof

Environment: owned socket-only PostgreSQL17. Candidate-only; no hosted/Production/Google access.

## Post-lock admission design correction

The first approved extraction passed local course, tee, approved-handicap readback, complete-round pairing exchange, Prepare, Mark Live, direct privilege-denial, OID/dependency guards and atomic audit rollback. It correctly failed ACCESS_ACTIVATE and SCORING_UNLOCK: the installed lifecycle function rechecks Production authority after competitive locks. Removing that recheck would weaken authority and is rejected.

The correction keeps the original public match-control function OID and replaces its body with an admitted wrapper. A new owner-only private core takes two explicit arguments: canonical command and nullable isolated envelope. The public wrapper runs the original Production runtime/actor assertions and passes NULL. The isolated gateway passes only its original independently validated envelope and server-bound command.

At the original post-lock recheck, NULL executes the identical Production assertions. The isolated branch revalidates installed binding, current actor, ingress epoch and original context token, then checks actor, target and operation identity against the canonical command. It uses existing locks: context and ingress rows are already held FOR SHARE by the gateway before governance/setup/match locks. No lock is removed, no session GUC is used, and no caller-controlled field selects Production authority. The private second argument is not a public RPC input. Readiness, CAS, receipts and all domain transitions remain unchanged.

The setup reader still moves by OID, guarded against any inbound catalog dependency. The match-control public OID now stays public, avoiding nested round-call rebinding entirely. Original round-scoring admission remains before and after its locks. Mandatory before/after metadata covers owner, grants, search path, volatility, definer and dependencies; unreviewed custom grants/search paths stop installation. Source-body comparison and direct/nested denials supplement catalog evidence because PostgreSQL does not track textual PL/pgSQL body dependencies.

## Receipt status

The additive status read freshly authorizes the current actor/resource while retaining the original operation identity. Setup lookup is exact tournament/action/UUID with original declared/database hashes. Control lookup is exact match/UUID with its existing match/operation/actor hash. A matching receipt is COMMITTED; absence is UNKNOWN, never inferred rollback. A different payload conflicts. Status never replays or changes authority. The retained control hash does not incorporate CAS revisions; this preserves the existing idempotency contract rather than inventing a new one.

## Evidence limits

Initial local run:7 PASS/3 FAIL including the failed parent case; two leaf failures were the retained post-lock Production assertion and an ambiguous status SQL column. This run is not certification. Follow-up proof must establish both protected and isolated revalidation, actor/request binding, exact privilege boundaries, lifecycle, atomicity and recovery. Hosted admission, physical clients and Production capacity remain NOT PROVEN.

## Corrected isolated proof

PROVEN — POSTGRESQL / SECURITY / INTEGRATION / FAILURE INJECTION, owned socket-only PostgreSQL 17: `test/reliability-p0f-setup-control.integration.test.mjs` completed 10 tests, 10 PASS, 0 FAIL, 0 skipped. The corrected run takes approximately 9.4 seconds; this is test-run duration, not score performance. Both disposable clusters were stopped and removed by their registered cleanup callbacks.

The run proves current course/tee writes, unchanged approved handicap authority, complete 24-player full-round pairing exchange, duplicate-player rejection, Prepare gating Mark Live, all five match control operations, CAS conflict, same-operation replay, exact receipt recovery after context revision changes, absent receipt UNKNOWN, required audit rollback, unchanged financial facts, and zero Google jobs. It additionally refuses unknown stored OID dependencies, unexpected direct grants, search-path drift and unexpected default privileges before allowing migration completion. Failed install rolls back every extraction. Reapplication fails closed against the already changed baseline; migration130 is a one-time guarded migration.

The prepared-call test creates and plans the service-role public setup read before migration130 in the same physical PostgreSQL session, executes migration130, then attempts the prepared read again. Both attempts deny unauthorized input; the cached function reference cannot bypass admission after the public-reader OID becomes private. All private cores deny direct anon, authenticated and service-role invocation. Public and nested round operations continue denying isolated authority through the protected interface.

A current privileged catalog artifact records owners, ACLs, function identities, `search_path`, security-definer flags, volatility, inbound/outbound `pg_depend` and textual callers before and after. Direct body comparison confirms domain logic unchanged apart from explicit admission placement and the independently admitted isolated post-lock branch. No owner change, RLS relaxation, role grant, domain table, index or trigger was introduced by migration130.

Evidence source hashes for this run:

- Migration130: `1dbccb261ba4c44d5dc338fae4293f6019d212a9ce436cabc79a11ef37cc38d9`.
- Test: `a5de80c7901cfb58d41bfb292ef93c482fa63f347cb1eb08a696139213a04840`.
- Fixture helper: `ea553fb6b8ba33349e31545bff365e16fe0c3a09afc9c3af2df08a89acec15d3`.

Positive protected-wrapper equivalence is a separate required gate. It uses the existing synthetic normal-release bootstrap with original admission functions, compares captured before definitions against candidate wrappers in rolled-back transactions, and must be reported separately. The isolated proof above does not itself certify hosted admission, Production behavior, or physical clients.

## Positive protected-wrapper equivalence

PROVEN — POSTGRESQL / INTEGRATION / SECURITY in the existing owned synthetic protected-platform release fixture: `evidence/p0f-approved/protected-equivalence.json` records four setup/control comparisons and three financial comparisons. The real current release, exact-resource, account, membership and Director checks remain installed. No Production endpoint was contacted and no boundary assertion was replaced.

For setup/control, the helper restores all eight exact captured pre-migration definitions inside a rolled-back transaction, performs the operation, then compares the candidate in another rolled-back transaction against the same fixture authority. The public current read agrees exactly. Tournament metadata mutation and Scoring Lock both succeed, replay idempotently, and produce the same canonical projections, revisions, audit contents and permissions. Only independently generated audit UUIDs and timestamps are excluded from value equality. Mutations and RPC readbacks run as `service_role`; privileged fixture inspection occurs separately after that role is reset. ACCESS_ACTIVATE reaches the real protected post-lock checks and then returns the identical required readiness denial on an intentionally unprepared match, without a receipt or mutation. Successful isolated Prepare and all five control actions remain covered by the separate 10-test suite.

This evidence first completed during `release-attempt-06`, whose overall suite still failed later at the historical expected-red annual CREATE assertion. The completed equivalence cases are not an overall release PASS. Attempts 01–05 preserve fixture corrections: missing 18-hole definitions, missing SQL terminators for captured definitions, a noncanonical match identifier, expected generated audit identity/timestamp differences, and missing read-contract request fields in the financial fixture. No runtime validation, schema constraint or authority guard was weakened to make these comparisons pass. The final combined release receipt, when completed, supersedes those attempts for the overall release verdict.

Positive helper SHA-256 at first completed comparison: `1bbcecb3f474bb122c71f2f5216c1bd1b402d077174a16ed08ec10bf7263812d`. Both profiles remain synthetic/local proof, not hosted admission or Production deployment proof.

## Fresh frozen-candidate receipt

The final source-bound runner now records `setup.json` 10/10 PASS, `capabilities.json` 10/10 PASS (including the seven named capability identities), and `release.json` 2/2 PASS with the protected-equivalence cases above. `annual-create.json` separately records the corrected CREATE chain; the historical expected-red helper remains preserved for its original candidate. These fresh receipts replace the failed combined release attempts for the final candidate verdict; they do not erase the fixture/debugging history or promote local evidence to hosted proof.
