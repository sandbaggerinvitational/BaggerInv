# P0-F canonical Director API and client proof

Google remains retired. The additive isolated Director route is `/api/director/canonical-operations`. Existing Production routes, PWA score responses and Build 10 models are unchanged by these files.

## Authority and transport

**PROVEN — source, API boundary tests, owned PostgreSQL integration:** the route authorizes the actual Director session through the existing `authorizePreviewDirector` adapter. The server requires an active non-impersonated entitlement and binds actor, tournament, database resource and context registration from server authority. Caller-supplied resource/actor/role metadata is rejected. PostgreSQL independently rechecks current identity, membership and Director entitlement before invoking private domain operations.

POST requires same origin. GET is read-only. Neither the browser nor the response receives a service credential. A requested diagnostic lane is not admitted to this isolated writer. Production environment/resource identities cannot be repaired or rewritten by this path.

The allowed families are setup, whole-round pairings, match controls, explicit Net Skins entries, and Calcutta auction entry/clear. Calcutta configuration is explicitly rejected. Calculation, financial publication and scoring rules are not added to this endpoint.

## Seven capability chains

The actual integration suite uses the shipping browser adapter, the shipping route handler, the shipping server operation, real SQL installed in an owned socket-only PostgreSQL fixture, and canonical readback. The external account-session lookup is substituted with a synthetic identity; database actor verification and all domain operations remain real. This is not hosted authentication or browser-device proof.

| Identity | Exercised behavior | Exact regression |
|---|---|---|
| BROAD-NEW-007 | Course/tee update; unchanged approved handicap revision and canonical readback | `BROAD-NEW-007 course/tee and approved handicap authority through shipping adapter` |
| BROAD-NEW-008 | Reviewed setup operation; exact receipt/readback; same-ID recovery; conflicting local payload refused | `BROAD-NEW-008 shared reviewed operation ID, receipt, readback and retry pipeline` |
| BROAD-NEW-009 | Six-match round pairing replacement with frozen handicap reference | `BROAD-NEW-009 atomic full round pairing replacement with frozen handicap reference` |
| BROAD-NEW-010 | Explicit entry ledger update; no scoring, financial configuration or publication mutation | `BROAD-NEW-010 Net Skins explicit entry ledger and server-owned field authority` |
| BROAD-NEW-011 | Purchase and ownership entry, followed by clear; configuration unchanged and publication remains unpublished | `BROAD-NEW-011 Calcutta purchase/ownership and clear are canonical, unpublished, no configuration write` |
| BROAD-NEW-012 | Mark Live denied until current setup preparation is valid | `BROAD-NEW-012 contextual lifecycle refuses Mark Live before current preparation` |
| BROAD-NEW-174 | Prepare, Mark Live, lock, unlock, revoke and activate with canonical receipts and state | `BROAD-NEW-174 Prepare then Mark Live, lock, unlock, revoke and activate preserve canonical receipts` |

All rows are in `test/reliability-p0f-operations.integration.test.mjs`. BROAD-NEW-007 covers current approved handicap authority, frozen revision binding and server-owned Prepare; it does not add isolated handicap revision authoring or handicap-index editing. Separate migration suites prove finer SQL atomicity, privilege and domain invariants. These seven paths do not certify every Director screen or every lifecycle sequence.

## Mutation and recovery contract

The browser creates one operation UUID for a reviewed command. The transport records its family, action, payload and original expected context. A same-ID different local payload is rejected. The server builds canonical domain inputs and validates the returned receipt plus current canonical readback before reporting confirmed success.

An attempted review is never rebound to a new context on retry. It first performs read-only exact receipt resolution under **current** actor/resource/binding admission. The original token is only original request identity, not authority to write. A matching receipt establishes COMMITTED; absence establishes UNKNOWN, not NOT_COMMITTED. A different payload conflicts. A committed receipt and verified current readback allow the editor to finish the original review. If readback is unavailable or superseded incompatibly, the commit remains known but the capability is unconfirmed.

**Deliberate containment:** an UNKNOWN receipt result does not automatically resubmit, issue a replacement UUID or erase the pending review. The current adapter retains this state only in page memory; reload/crash persistence and a general abandon/resubmit workflow are not certified here. Structured 4xx errors are not blanket evidence that an earlier attempt never committed.

The lost-response integration case commits a setup operation, discards its API response, changes the isolated activation revision, then resolves the original exact receipt and verifies current canonical authority without another execute call. Current database entitlement revocation denies access despite an active account-adapter test stub. Unit cases reject malformed/foreign-provider commit markers, nested authority fields, wrong resources, impersonation, non-Director roles and financial configuration.

## UI reachability

`CanonicalDirectorOperations` mounts the existing setup, entry and auction editors with the new transport and the new small match-control panel. Failed context admission renders a local error and no editing tools. Setup's default request remains `fetch` and its default profile remains Production. Auction-only mode hides configuration; its default remains unchanged for existing Production consumers. Net Skins' standalone option changes explanatory copy only; its separate isolated option enables uncertain-operation containment without changing existing Production consumers.

The sixteen component tests evaluate actual component output and handlers with virtual elements: transport injection, no editors before admission, local failure, auction-only mode, preserved defaults, review UUID retention and reachable same-operation recovery. After an attempted isolated setup operation, editing, discard and reads that could replace the review are disabled until verified success. Its review text acknowledges uncertainty. Isolated Net Skins retains the exact entry payload and UUID, freezes entry edits, and blocks workspace reload and other round edits that could remount an unresolved round. Auction-only Calcutta prevents discard/reload while its saved request is unresolved. Seven added tests prove these behaviors and independently preserve all three existing Production-mode behaviors. They are UNIT proof, not physical interaction or visual certification. Page reload/crash persistence remains unproved and is not implemented.

## Evidence and interpretation

Development results before coordinator source-bound reruns:

- `test/reliability-p0f-operations-api.test.mjs`: **38/38**.
- `test/reliability-p0f-operations.integration.test.mjs`: **10/10**, including nine named subtests plus their parent; seven capability identities are not counted as ten independent capabilities.
- `test/reliability-p0f-director-workspace.test.mjs`: **16/16**.

Final candidate receipts live under [evidence/p0f-approved](evidence/p0f-approved/), generated by `tools/reliability/run-p0f-tests.mjs`; use those source manifests and final counts for certification. Earlier failed development runs are retained as diagnostic evidence, not overwritten as passes. The first expanded component run passed 14/16; two SetupPanel cases could not load its existing mixed default/named import in the virtual-component harness. Supporting that import fixed the harness; no runtime assertion was weakened.

The first integration invocation omitted the candidate fixture flags and correctly failed migration 130's exact baseline guard. Correct invocation sets both `BAGGER_PHASE2C1_CANDIDATE=1` and `BAGGER_PHASE2C1_CLOSURE=1`; dedicated integration fixtures explicitly install 128/129/130 rather than using automatic `BAGGER_P0F_CANDIDATE` installation.

Subsequent failures exposed two legitimate test preconditions: an unset fixture captain requires explicit selection of a current team member; setup preparation must precede an auction because the existing `CALCUTTA_AUCTION_DEPENDENCY` freezes that authority. Setup response-loss recovery also runs before Mark Live freezes team changes. No domain guard was relaxed. Migration 130's separately documented nested post-lock admission correction was required for isolated controls.

Legacy Google queue counts remain unchanged across the seven chains, and Google network/provider use is blocked. This does not delete historical jobs or certify external Google cleanup.

## Limits

No Production, hosted staging, real Google account or real competitive data was accessed. No native shipping source changed. Current scope is the approved isolated 2026 capability profile; generic future-year initialization is separately tested by the annual contract suite. Local passing chains do not establish Production capacity, hosted auth, physical UI behavior, native queue recovery, or tournament readiness.
