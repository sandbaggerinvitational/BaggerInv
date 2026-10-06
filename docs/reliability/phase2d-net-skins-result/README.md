# Full Net Skins result-path review and local remediation

Base: `434cd813838017f51651b9fa2236d071782a4288`.
Scope: local only. No hosted RPC, deployment, publication, financial mutation,
supervisor START, Production access or old Preview access occurred.

## Finding and narrow correction

The valid participant `GET /api/leaderboards/net-skins` did not omit a required
client input. Certification selected the legacy recalculating read rather than
the shipping read-only V1 projection. With no legacy snapshot, the chain was:

`GET` → authenticated participant identity →
`currentNetSkinsOperationalResult` → legacy result/input reads →
`recalculateNetSkinsTournament` → `write_net_skins_derived_results`.

The last call supplied `input.environment = "PREVIEW"`.
`certificationReadAliasRpc` rejects a nonempty authority field named
`environment` before dispatch. The exact error was HTTP 400,
`CERTIFICATION_INPUT_INVALID`, “Certification read payload contains authority.”
No database write, worker claim or request after-hook ran. This is a
Certification adapter/read-path gap, not a calculation or golf-math defect and
not an invalid pre-result request.

Only registered Certification now selects the read-only V1 path. The existing
Production route selection and ordinary Preview path remain unchanged.
`read_production_net_skins_v1` is translated into the fixed operation
`READS.NET_SKINS_V1`; its only payload field is the server-resolved `player_id`.
The forward SQL extracts the existing 2026 frozen Production read body into a
private shared core, preserving every result-selection and publication rule.
The Production wrapper retains its original guards. Certification adds its
exact resource/context/participant predicates through the existing read gateway.

The HTTP boundary removes internal configuration/source fingerprints, raw
Full-Net provenance and presentation identity fingerprints from Certification
responses. Public summaries, winners and projected hole detail remain available.
No processor, score rule, financial calculation, claim, lease, supervisor,
Calcutta, Odds or Production HTTP behavior changes.

## Request contract

| Source | Input |
| --- | --- |
| Client | GET path; optional `presentation=participant` selects the existing presentation DTO. No body or authority fields. |
| Session/identity | Canonical active participant, auth linkage, player ID, display name and current tournament. |
| Registered server environment | Exact Certification resource/project, Preview, team/project/branch, deployment/origin/SHA. |
| Canonical runtime | Current resource registration, release/context token, authority epoch/revisions and tournament pointer. |
| Database | Current configuration, saved-entry manifest, source fingerprint, job state and current result/publication. |

Client query fields cannot change the player/resource. Missing/foreign reader
identity, arbitrary alias fields and caller-supplied authority fail closed.
Canonical SQL independently verifies the bound context. There is no generic RPC
or target selector. Bare service-role access does not establish gateway authority
and cannot invoke the new private helper.

## Result and sequencing contract

| Canonical state | Participant response under valid read admission |
| --- | --- |
| Not configured | HTTP 200, `NOT_CONFIGURED`; no results. |
| Configured, no play/result yet | HTTP 200, `CONFIGURED`; no results. |
| Play started or result pending/missing | HTTP 200, `IN_PROGRESS`; bounded metadata, no payouts/winners. |
| Calculated PROVISIONAL | HTTP 200, `IN_PROGRESS`; provisional payouts withheld. |
| Current OFFICIAL, exact current source | HTTP 200, `OFFICIAL`; published summary/winners/detail. |
| Failed/unavailable/stale | Existing V1 state and withholding rules apply; never input-invalid solely because a result is absent. |

Publication is part of canonical OFFICIAL completion. There is no separate
Net Skins publication command or official-but-unpublished window. PROVISIONAL
completion is stored truthfully but does not publish participant payouts.
Certification read admission itself remains required: a disabled Certification
resource is denied by the existing deployment/admission guard even when a result
is stored. This correction does not bypass that guard.

## Calculation architecture and separate execution gap

Shipping Production initiates `configure`, `enqueue` or `process` through the
Director-only `POST /api/admin/production-net-skins-v1`. Its Production guard and
Preview 404 remain intact. `processProductionNetSkinsV1Job` claims one canonical
job, invokes `calculateProductionFullNetSkins`, and completes or fails it through
the existing CAS functions. Claim obtains/enqueues the current configured round
work as required. The existing Net Skins claim lease is 60 seconds and the job
attempt ceiling is five; neither is the Queue worker's 90-second lease contract.

The calculation freezes configuration/entry/source input. Completion checks
job/token/worker ownership, live lease, configuration/result revision and source
fingerprint, retaining receipts and both domain/control audits. OFFICIAL
completion installs one immutable current result and publishes it. Superseded
PROVISIONAL history remains PROVISIONAL with `is_current=false` and a truthful
superseded timestamp; it is not relabeled as a different historical result.

An official result requires complete/finalized opted-in entries and their
referenced match/score/snapshot facts. It does not require every match in the
round to be FINAL. The owned fixture proves entry revision 1 with sole entrant
P12 in round 3, configuration revision 1, primary FINAL with 18 canonical scores
and secondary UPCOMING/locked/unscored can yield a nonempty OFFICIAL result.
This matches the reported hosted eligibility shape, not its entire historical
revision chronology. Owned scores are created through canonical scoring;
hosted scores and entry revision 1 are not touched.

**Separate gap:** the Certification runtime operation registry already admits
Director-authorized `DIRECTOR.NET_SKINS_CLAIM`, `...COMPLETE` and `...FAIL`, but
the application Director gateway has no reviewed `process` calculation adapter.
The only shipping application process entry is Production-only, and the Queue
registry contains the four certified derived engines plus CALCUTTA, not Net
Skins. The processor has no built-in Certification dispatch branch.

The local proof reuses the real shipping processor and real canonical database
operations via its existing dependency seam. It substitutes provider-specific
transport and models external session authentication. It proves domain/core
compatibility, not an existing hosted application calculation entry. No Queue
engine or new calculation endpoint is introduced in this task. Hosted Part 2B-2
resumption remains gated on a separately reviewed narrow Director calculation
adapter reusing this processor and authority chain.

## Forward SQL

Artifact:
`supabase/production_incremental/certification-net-skins-result-read-v1.sql`.

Atomic, Certification-only, OFF/disabled/paused install. Two existing function
bodies have exact old/new SHA-256 guards:

| Function | Predecessor body hash |
| --- | --- |
| `public.read_production_net_skins_frozen_2026_v1(jsonb)` | `87627be217c3a4b1579efea32f1ce9ba6290783f1aa62906882f4aa29ff158b1` |
| `public.read_certification_projection_v1(jsonb)` | `b2a5f297dc9b07dddb10de715b6adb4677b7738ffe6fd118253c5deab46c1bee` |

One private helper, `production_control.canonical_read_net_skins_v1(jsonb,jsonb)`,
uses the original owner's privileges, a fixed search path and owner-only EXECUTE.
All predecessor bodies are checked before changes. Replay verifies the new
hashes, helper body/owner/security/search path/ACL and unchanged existing function
metadata. Hash mismatch or helper ACL drift rolls back rather than normalizing
permissions. No tables, RLS, roles or historical migration/bootstrap changes.

## Local evidence and limits

Final certificate results: focused **106 pass / 0 fail / 0 skip**; broad frozen
application selection **4,077 pass / 20 established failures / 0 skip**, with
**0 new failures**; production build **PASS**. Every run's executable source
manifest stayed unchanged. The broad underlying test process exits 1 for its
20 known failures; the certificate accepts only that exact established set.

`evidence/integration.json` records the owned PostgreSQL 17 + real pg-safeupdate
proof: original 400 predicate, install/mismatch/replay, private helper ACL,
pre-result read, PROVISIONAL withholding, OFFICIAL result, 18 public hole cells,
receipts/audits, replay/history, stale and authority negatives, unchanged
Production core, reconciliation and final drain.

`evidence/focused.json`, `application.json` and `build.json` record the final
checks and source hashes; corresponding TAP files retain raw output.
The application run uses the frozen baseline selection and compares failures by
name against the established 20 failures. Focused tests cover the new path and
existing V1/configuration/native presentation contracts. No 864-hole rerun.

External networking is denied and real credentials removed for certificate
commands. PostgreSQL uses owned Unix sockets. Auth session lookup, Next response
wrapper and HTTP/provider transport are modeled at explicit module seams;
identity linkage, entitlement, context, domain operations, SQL guards, result
calculation and participant DTOs execute real code. This is not a hosted proof.

## Prepared hosted continuation — not executed

First obtain separate local-only authorization for the missing Director
calculation adapter; do not publish another Queue engine. Then, following its
local certification and separate hosted authorization:

1. Freshly verify the preserved hosted fixture and saved config/entry revision 1.
2. Install only reviewed forward SQL while OFF/disabled/paused.
3. Deploy the exact certified application candidate and safely rebind/replay.
4. Enable only existing required Certification/Director admission.
5. Execute one bounded Director calculation through the reviewed adapter;
   OFFICIAL completion publishes automatically.
6. Verify the exact failed participant route plus summary/winners/hole detail,
   privacy, replay and current source.
7. Resume Calcutta, inspect Odds and verify FinalRecap's negative prerequisite
   gate, preserving prior PASS evidence without infrastructure recertification.
8. Reconcile/drain, STOP and return OFF/disabled/paused.

Hosted state in this review is the owner's reported safe checkpoint, not a fresh
hosted readback: supervisor OFF, pending 0, no local task hosted mutations.
