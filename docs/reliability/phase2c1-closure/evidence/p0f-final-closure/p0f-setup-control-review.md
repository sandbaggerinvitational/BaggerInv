# Proposed setup/control core extraction — NOT APPLIED

Base: 7b6ca99510dc2f44cc411bfe7769e7f0c05ed962. Draft: `/tmp/p0f-setup-control-cores-v1.sql` (182 lines). SHA256: `499e192f8b85e473d614ec93b72cbbe1be6c2f6f8cb1514888f4d13f7cda4633`.

Automatic approval review rejected writing this migration into the repository. It has not been applied, retried, or executed through another path. This file is an owner-review description only. The repository migration130 scaffold remains empty. Separate approval and a new normal review are required before implementation.

## Exact scope

- Zero table, index, trigger, data, score, financial, or rule changes.
- Four existing private function bodies change only by removing their embedded Production setup admission invocation: `read_tournament_setup_before_round_workspace_v1(jsonb)` (one call), `mutate_setup_before_late_r3_v1(jsonb)` (one), `mutate_round_pairings_before_late_r3_v1(jsonb)` (one), `mutate_late_r3_dispatch_v1(jsonb,boolean)` (two).
- Existing public `read_production_tournament_setup_v1(jsonb)` moves to private `production_control.canonical_tournament_setup_read_v1(jsonb)` with its domain body unchanged. Its replacement public wrapper first executes the original `assert_tournament_setup_runtime_v1(input)` then calls the shared private reader.
- Existing public setup and round-pairing entry points retain their signatures but become PL/pgSQL wrappers, call the original setup admission, then call the same private late-R3 dispatcher. The round wrapper preserves its established sanitized false/error envelope for admission failure.
- Existing public `mutate_production_match_control(jsonb)` moves to private `production_control.canonical_match_control_v1(jsonb)`. Only its original two admission statements move to the replacement public wrapper: `assert_production_scoring_runtime(input)` and `assert_production_scoring_actor(input,true)`. The private transition/readiness/CAS/receipt/audit code remains unchanged.
- One new private dispatcher, `production_control.isolated_director_setup_operation_v1(jsonb,jsonb,boolean)`, is reachable only through the independently admitted isolated gateway in migration128. It binds target2026, governance2026, actor and request UUID from trusted context, excludes caller resource/actor fields, uses `environment:ISOLATED`, computes the existing canonical request hash, and dispatches only the existing setup/batch/control actions.
- MATCH_CONTROL reads enrich the bounded current setup projection with current match/permission revisions, access state and permission completeness for the review UI. This is a new isolated response only; original Production response shapes are unchanged.

## ACL and wrapper attributes

Before: the original four public RPCs are service-role executable, not public/anon/authenticated. The four internal setup functions are already revoked from all four roles. After: the original public RPC names keep that service-only access. All seven private functions (the four existing internals, two moved cores and new dispatcher) explicitly revoke PUBLIC/anon/authenticated/service_role. Only a security-definer admitted entry point, executing under the database migration/function owner, calls the private cores.

No ALTER OWNER is proposed. Moving/renaming functions preserves their existing owner. Replacement wrappers are created by the normal migration owner, matching the repository migration convention. Owner identity consistency must still be verified in actual migration tests.

The reader remains PL/pgSQL STABLE SECURITY DEFINER. Its wrapper search_path narrows to pg_catalog; the preserved private reader keeps its existing search_path. Setup and batch wrappers change SQL to PL/pgSQL to execute explicit admission, remain VOLATILE SECURITY DEFINER, and use pg_catalog. Match-control wrapper remains PL/pgSQL VOLATILE SECURITY DEFINER with pg_catalog. These are real callable-function changes requiring review, even though the protected admission predicates remain unchanged.

## Authority effect and why this is minimal

Protected Production requests continue through exactly the existing Production predicates. A non-Production caller cannot acquire those permissions through the old RPCs. The new isolated gateway supplies a separate verified context and reuses the private domain code. The draft does not forge a Production project/environment, install a no-op authorization function, use a session GUC escape hatch, expose privileged browser credentials, or grant a new role.

This intentionally changes admission placement from nested domain functions to independently admitted public boundaries. It must be proven that no other granted function can invoke the now admission-free internals without equivalent authorization. This caller/ACL proof is mandatory before PASS; it has not run because the proposed migration is blocked. No claim of runtime safety is made from this draft alone.

The alternative Preview import adapters would rewrite whole authority or conflate financial configuration with entry consent. A second Preview control/calculation engine would duplicate rules. Shared private bodies preserve the existing canonical computation, dependency checks, locks, CAS and immutable receipts instead.

## Captured baseline and required proof

Actual installed function definitions/hashes for eight affected baseline functions were captured from the owned socket-only PostgreSQL17 fixture through127 in `/tmp/p0f-director-source-definitions.json`. The draft embeds all eight SHA256 guards and exact admission-anchor counts. The owned cluster was stopped and removed after capture.

Before implementation: owner review and normal approval of this exact extraction. After approval: install migration128 and130 on a disposable canonical schema; verify all current private callers/ACLs; baseline-normalized domain-body comparison; unchanged protected Production denial; isolated role/resource/target/stale-context denial; course/tee and prepared handicap context; complete-round swaps; lifecycle readiness and lock/access separation; same-ID retry/conflict; atomic rollback; lost-response recovery; current readback; zero Google and no financial mutation. Repeated application is deliberately rejected by exact baseline guards; rollback restores prior definitions from this captured baseline and must be tested before staging review.

Two earlier independently accepted UI changes remain unmounted pending root disposition: injected request/isolated props in the existing setup editor, and the standalone `CanonicalDirectorMatchControls` component. They do not expose the blocked writer.
