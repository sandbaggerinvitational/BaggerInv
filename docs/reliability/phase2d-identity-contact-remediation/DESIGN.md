# Certification synthetic identity-contact correction

Owner scope: local correction and certification, plus a reviewed plan for the preserved hosted fixture. No hosted execution, deployment, release rebind, provider configuration, schema change or admission enablement is performed by this remediation.

Base: `5d053589fe29ea1db85219eaf5690749cfb3dca7`. Physical Certification project: `trmcwrljjxwhgtikfdgu`. Registered resource: `CERTIFICATION:2857f707-065a-405d-b5fc-b5b6fa1b0f51`, revision 1. The accepted hosted checkpoint has admission revision 7, admission disabled, ingress gate PAUSED, three synthetic Auth users, four players, two UPCOMING matches and zero scores/leases/unresolved work. This run makes no new hosted observation.

## Existing contract and root cause

The installed canonical schema remains the authority:

- `production_control.canonical_identity_for_auth_v1` requires a confirmed Auth email, ACTIVE `participant_identity.user_player_links`, a VERIFIED EMAIL `participant_auth_identifiers` row, an ACTIVE tournament membership and an ACTIVE `participant_identity_contacts` row whose normalized email equals that verified identifier. Missing contact fails closed with `ACTIVE_USER_PLAYER_LINK_REQUIRED`.
- `public.read_participant_identity_context` returns the identity configuration revision from `participant_identity.identity_context_revisions` along with the canonical participant context.
- `production_control.apply_player_email_v1` is the normal admitted Director authoring operation. It validates real-contact domain/enrollment/collision rules, updates contacts and configuration revision/import provenance. It is unsuitable for this dormant owner fixture: it requires admitted Director context and deliberately rejects `.invalid` synthetic domains. Its predicates are unchanged.
- The existing local annual fixture already uses explicit `SYNTHETIC_FIXTURE` contact/import provenance. This correction uses that synthetic provisioning convention, not external OTP verification or a permissive real-contact operation.

The original Part 2A fixture created Auth links, verified identifiers, memberships and a Director entitlement, but no contacts or identity context. Its usability test supplied an already-resolved Director envelope to canonical Director operations. It did not traverse the Auth-subject → canonical contact → participant resolver path. The accepted hosted sessions did traverse it and truthfully failed closed.

## Exact contact contract

`participant_identity.participant_identity_contacts` has primary key `(tournament_id, player_id)` and a membership foreign key to `scoring_authority.tournament_players`. Active normalized email is unique within the tournament. Required fields are tournament/player identity, trimmed email, lower/trimmed syntactically valid `email_normalized`, positive `configuration_revision` and non-null `source_system`. `identity_active` must be true for resolution. Verification/source/timestamp fields record provenance. The contact has no Auth UUID column: the canonical join binds Auth UUID through the unique ACTIVE link and VERIFIED email identifier to the same player and active membership.

Fixed contacts, all in synthetic tournament `2026`:

| Auth UUID | Player | Synthetic contact |
|---|---|---|
| `3003e93a-f0ec-422b-835e-5081fefb2e8e` | P01 | `part2a-director@synthetic.bagger-certification.invalid` |
| `3dcda7ec-1a08-4c93-93ec-3ec934a775bf` | P12 | `part2a-participant-a@synthetic.bagger-certification.invalid` |
| `8172c31f-99fc-4798-9fd2-ecdfd3bda21a` | P11 | `part2a-participant-b@synthetic.bagger-certification.invalid` |

P24 remains an intentionally unlinked synthetic opponent. No fourth contact is needed for Part 2A. The import records four roster members, three received/valid contacts and one intentionally missing contact; it does not falsely report a complete four-contact roster.

The synthetic contact configuration uses revision 1 and a deterministic SHA-256 fingerprint over the fixed synthetic identities, resource ID, tournament and contact contract. One APPROVED synthetic import row, one context-revision row and one identity audit row record owner approval, existing confirmed synthetic Auth, `external_verification_performed=false` and `messages_sent=0`. `verified_by=SYNTHETIC_FIXTURE` describes synthetic administrative provenance, not real external verification. `source_workbook_id` is the registered synthetic URN; no workbook or Google access occurs.

## Fresh fixture correction

The existing renderer now composes the fresh fixture template, the unchanged owner/resource/control guards and a fixed contact insertion block. Memberships/links/identifiers exist before contacts; contacts/provenance, Director entitlement and remaining fixture state commit with the one fixture audit in one transaction. The full replay snapshot includes contacts and provenance. Same request replays without writes; conflicting request/contact/fixture state is rejected. A required audit error rolls back the entire transaction.

No persistent function, RPC, HTTP endpoint, new schema, grant, role, RLS policy or shipping business logic is added. The owner anonymous SQL package is unavailable to runtime clients. The fixture contract name remains `bootstrap-certification-part2a-fixture-v1`; its actual package digest changes truthfully and is recorded in the operation audit. The package digest now binds the three named repository SQL artifacts. Installed `bagger-canonical-bootstrap-v1` schema/static artifacts and their immutable installation receipt are unchanged.

## Preserved-fixture repair

Separate fixed operation: `repair-certification-part2a-identity-contacts-v1`, operation ID `certification-part2a-identity-contacts-repair`. Render with the existing tool's `--repair` option. It is an owner INVOKER anonymous transaction, not a persistent client API.

Guards require the checked-in physical Certification registration; managed database owner and matching session user; no runtime JWT-role impersonation; the immutable installation receipt and initialization origin; exact current release/deployment/branch, binding, epoch, activation/admission/pointer/generation revisions; disabled admission; PAUSED ingress; no scores, leases or derived work; exactly the three fixed confirmed synthetic Auth identities.

It additionally requires the original successful fixture audit, the certified omitted-contact package SHA-256 `fd4dcf5aef0bc06e3977340d894d751834ae82a785c63681e73e09ec093296e2`, exact receipt event/fingerprint/state hash, and an exact hash of all 24 original fixture tables. Exact three links, VERIFIED synthetic identifiers, memberships/roles, one Director entitlement, four players, two revision-zero UPCOMING matches and closed permissions must remain intact. Any preexisting contact/context/import/identity-audit state is rejected before first execution.

The repair inserts exactly three contacts, one context revision, one import provenance, one identity audit and one repair operation audit. It modifies zero existing rows. It checks the preserved fixture and authority/control state again before commit. The original fixture receipt is never rewritten. Same-request replay validates the recorded contact-state hash and produces no second logical repair. Conflicts and partial state are denied; errors roll back atomically. No messages, workers or competitive operations are invoked.

## Local proof boundary

Disposable PostgreSQL 17 fixtures model the managed non-superuser installation owner and retained provider Auth privileges. They use the exact certified installed schema/catalog. The old fixture is reproduced from its byte-identical retained template and a receipt actually created by that local execution; no missing historical fact or hosted receipt is fabricated.

Identity proof executes the unchanged canonical Certification SQL projection and unchanged JavaScript resolver. Auth subject verification is an explicit local dependency seam, not a forged JWT or a claim of hosted session certification. The resolver's existing ordinary Preview test configuration uses fake credentials solely to enter the unchanged resolver; the injected transport always executes the registered Certification SQL in the local database, with remote sockets denied. Resource routing itself is covered by the affected resource-selection tests; future real hosted Auth/session proof remains Part 2A.

The existing three Auth users and coherent hosted fixture must be reused. Do not delete/recreate them or rerun the fresh bootstrap against the preserved fixture. Do not relax contacts, identity errors, RLS, Director authorization or admission to compensate for fixture omission.

Historical Production 048/057 remain NOT REPRODUCIBLE FROM RETAINED EVIDENCE — NOT PROVEN; unchanged. The certified 069 correction remains unchanged. No 864-hole rerun is justified: only owner fixture provisioning/tooling and its local proof are affected.
