# Additive isolated Director API — draft approval checkpoint

Status: **DRAFT ONLY — NOT INSTALLED, NOT RUNTIME CERTIFIED.**

The independent API/client implementation was prepared under the P0-F contract design, then held when automatic approval review rejected the required 129 financial and 130 setup/control shared-core implementations. No draft was copied into the repository. No equivalent adapter, alternate private core, Production identity substitution, dynamic patch, or admission relaxation was applied. The five separately pending diagnostic-routing files remain unchanged.

## Temporary draft artifacts

- `/private/tmp/p0f-isolated-director-operations.js`: narrowed server draft for context, setup/pairings and match controls only. Net Skins entries and Calcutta families fail explicitly unavailable; no financial write implementation is included.
- `/private/tmp/p0f-canonical-operations-route.js`: additive `/api/director/canonical-operations` route draft.
- `/private/tmp/p0f-canonical-director-operations-client.js`: browser-safe client and reusable setup/control transport draft.
- `/private/tmp/p0f-isolated-director-operations-financial-review-draft.js`: earlier full proposal, retained privately only for review. Not approved, not installed, not tested.
- `/private/tmp/p0f-canonical-director-operations-client-financial-review-draft.js`: corresponding earlier client proposal. Not approved, not installed, not tested.

Only `node --check` syntax checks ran on the three narrowed files. No successful API, PostgreSQL, security, or capability claim follows from those checks. No candidate source hash should include these files.

## Proposed contract

The route is additive. Existing Production APIs, resource admission, request shapes, and clients remain unchanged. No rejected routing source is imported through a replacement implementation; the new server consumes the unchanged `isolatedCanonicalDatabaseEnvironment` predicate and independently refuses a requested diagnostic context for this writer.

The real shipping handler would invoke `authorizePreviewDirector({request,allowBootstrap:false})`. The server requires active, account-linked, non-impersonated Director authorization from the existing `entitlement` source, plus exact isolated database admission and a server-only `BAGGER_ISOLATED_DIRECTOR_BINDING_ID`. The browser cannot provide actor, resource, project, tournament authority, activation, release, service credentials, or request hashes. POST additionally requires same origin before authorization. Responses are private/no-store and errors are feature-local.

GET reads a canonical context and optional capability state through `read_isolated_director_operation_context_v1(input)`. POST invokes `execute_isolated_director_operation_v1(input)`. These are the two shared RPCs agreed with the context owner. The server envelope contains:

- `contract_version: isolated-director-operations-v1`
- `resource: {binding_id, project_ref, project_url}` from server configuration and validated isolated resource
- `authorization: {auth_user_id, player_id, role:DIRECTOR, tournament_id}` from verified authorization
- mutation `expected_context_token`, stable UUID `operation_request_id`, `family`, `action`, and validated domain `payload`

The browser envelope contains only family, action, payload, operationRequestId, expectedContextToken. Required context binds installation, current/governance tournament, admission/activation revision, epoch and release. The database independently rechecks actor, context and operation authority; an HTTP entitlement alone is insufficient.

Setup requests reuse the existing pure `buildTournamentSetupMutation` rather than another rules model. Match control uses the existing separate Mark Live/Lock/Unlock/Access operations and their required revisions. No new scoring, handicap, financial or lifecycle rules are introduced by the API proposal.

A successful mutation must echo the exact family/action/operation ID, carry the same canonical context, return a valid receipt, and pass a separate canonical readback. Setup and control readback compare canonical revisions; a malformed or mismatched response remains unconfirmed. No Google fallback exists.

Unknown transport, ambiguous database failure, malformed response, or stale-context retry retains the same operation ID. A later rejected attempt cannot prove an earlier same-ID attempt never committed. A response positively confirmed committed but losing readback returns COMMITTED with same-ID recovery, not successful completion. The client binds an operation ID to the original command and context token and refuses to silently rebind it after refresh.

## Required verification before installation/certification

1. Normal approval review permits the exact shared command/context implementation; do not bypass rejected function-admission edits.
2. Validate the final SQL response shapes and exact enabled-family contract. Missing family/schema must remain a local unavailable capability, not an implied authorization grant.
3. Actual shipping client → route → server → disposable PostgreSQL → readback for each required operation. Model tests alone cannot close any of the seven gaps.
4. Negative account, impersonation, resource, diagnostic-context, role, cross-tournament, stale-context, origin, malformed payload, actor spoof and privileged-field injection cases. HTTP authorization and database authorization both require proof.
5. Same-ID/same-payload replay, conflicting payload, audit rollback, post-commit readback loss, context change while operation is uncertain, and exact receipt status recovery.
6. Readback validators must be exercised against real setup/control payloads and current-versus-receipt revision behavior. No draft result has been run against installed SQL.
7. Missing 129 financial context remains required work. Do not mount financial controls or classify their families as optional merely because approval is pending.
8. Zero credentials/network, no Google job/fallback, unchanged Production rejection, telemetry failure isolation, broad regression and build.

## Open draft questions / no hidden PASS

- Context-change recovery of an already committed but uncertain operation requires an exact receipt/status contract. Strict rejection and retaining the ID is safe containment, but does not itself prove recovery closure.
- The proposed transport stores pending context per operation in client memory; cross-reload recovery is not certified. No native queue behavior is changed.
- The new isolated context is intentionally tied to the existing canonical 2026-scoped command contracts. It must not silently generalize future-year governance; annual CREATE retains its separate approved contract.
- The database-installed enabled families and exact migration ordering must be verified before any control is advertised. Context existence alone is not 7/7 capability availability.
- Required financial/entry API capability and its tests remain unimplemented pending the exact blocked core review. The full private drafts are proposals, not an alternative path to executing the rejected change.

No Production/staging query or deployment, no real Google access, no native change, and no real competitive mutation occurred. Return to the owner approval checkpoint; do not advance certification from this draft.
