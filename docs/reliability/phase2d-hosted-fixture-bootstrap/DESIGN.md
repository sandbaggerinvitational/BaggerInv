# Certification Part 2A fixture provisioning

Base: `1ae328f8fb4e303af4e6ad18cb9de1ee09bb209f`. Local remediation only; the hosted checkpoint is not changed.

## Existing path and missing operation

`test/support/reliability/phase2d-certification-fixture.mjs`, `initializeCertificationFixture`, is explicitly local-only. It enables admission, pushes an admitted runtime context, directly seeds 24 players and 24 matches, links two fixture Auth users and grants a Director entitlement. `certification-director-proof.mjs`, `provisionCertificationFinancialFixture`, separately creates initial synthetic Calcutta configuration. These are test harness construction, not approved hosted operations. The previous hosted attempt was rejected before execution for that reason.

The existing Certification initializer creates only empty structural tournament/control state. Runtime identity dispatch permits identity/entitlement reads, not first-actor provisioning. Production import, first-login and entitlement operations retain their Production predicates. Future administration requires an already authorized actor. None establishes the first Certification actors while admission is disabled.

## Minimum operation

Use a repository-controlled **owner provisioning package**, `bootstrap-certification-part2a-fixture-v1`. A renderer emits one fixed, stop-on-error transaction containing a SECURITY INVOKER anonymous PostgreSQL block. It does not execute SQL or accept a connection URL. The reviewed managed `postgres` owner executes it only after independently verifying the dedicated connection. No persistent function, RPC, client API, migration, grant, policy or runtime context is added. This follows the existing owner-invoker registration/initialization boundary, without pretending fixture provisioning is admitted competitive work.

The package checks current and session owner; exact checked-in resource descriptor; physical registration/current database; existing immutable installation receipt and initialization origin; exact current deployment/release/binding, epoch, pointer, admission and ingress-generation revisions. It requires disabled admission, a PAUSED ingress gate, SUPABASE Certification initialization provenance, no Production resource/cutover rows, no leases, scores or work. Locks serialize it with resource, admission and setup controls. It does not call the admitted runtime context push operation or supply fake service-role claims.

Only the three owner-approved Auth UUIDs and their exact confirmed synthetic `.invalid` emails may be linked. Existing Auth records are verified, never created, rewritten or copied. The fixed fixture cannot accept arbitrary players, identities, tournament IDs, financial values or resources from input. A single existing owner audit table record is the transactional provisioning receipt. Its request/package/data fingerprints support exact retry, conflict rejection and drift detection. Audit failure rolls back all fixture rows.

## Minimum fixture

Four players: P01 (Director), P12 (participant A), P11 (participant B), P24 (unlinked synthetic opponent). Two teams: P01/P12 on T1, P11/P24 on T2. One Singles round (round 3), one synthetic course/tee with 18 holes, two Singles matches: `2026-R3-11` (P01/P11) and `2026-R3-12` (P12/P24). A and B cannot score each other's matches. The initializer's existing 2026 structural tournament is reused, not imported or recreated.

`mutate_round_pairings_before_late_r3_v1` permits 1–12 matches, requires the submitted match set to equal the actual round and requires complete coverage of the active roster. `apply_tournament_setup_pairings_v1` requires two participants per Singles match with opposite sides. Neither requires 24 players. Four is the smallest even roster covering the three linked identities and two independent matches. One match remains incomplete when the other finalizes, preventing accidental whole-tournament completion. No BB/Scramble or full-tournament proof is claimed.

The package creates synthetic approved handicap entries, baseline snapshots/presentation provenance, course/setup records and revoked scoring permissions. It calls the existing pure canonical handicap calculation and Calcutta configuration builder. Calcutta starts configured but empty/unpublished with nominal synthetic configuration; no auction facts, financial results or jobs are created. Net Skins entry configuration remains for the admitted Director shipping operation; no result/publication is seeded. All constraints/triggers remain active.

P01/P12 are the original R2 Director/participant identifiers; P11 is an existing valid synthetic roster identifier. Their hosted mappings are exactly the approved UUID mappings. P24 has no Auth link or entitlement.

## Contract effects and execution boundary

This adds owner-only Certification test provisioning, not application mutation authority. Production predicates, 048/057, 069, private core ACLs, RLS, public APIs, receipt semantics for competitive operations and bootstrap artifacts stay unchanged. The installed receipt continues to identify the same installed schema/static artifacts. The new package has its own content digest in its audit receipt.

Local proof must establish exact catalog parity before/after, disabled/PAUSED controls, zero work/scores, verified links/entitlement, replay/conflict, rollback and denial of all non-owner roles and mismatched resource/deployment/control/identity facts. Separate local activation and existing canonical setup/financial reads may establish fixture usability, but do not certify hosted scoring.

No hosted execution, deployment, Vercel changes, admission enablement or Part 2A resumption occurs in this remediation. After approval, deploy/rebind using the existing certified control, independently read the real new deployment context, render the package with that context, then execute it through the managed owner connection. Deployment alone does not execute the package. No hosted schema migration or reinstall is needed.
