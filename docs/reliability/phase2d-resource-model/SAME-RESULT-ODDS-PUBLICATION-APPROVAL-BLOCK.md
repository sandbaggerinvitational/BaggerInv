# Same-result Odds publication: approved-scope reconciliation

Status: **WITHIN EXISTING OWNER APPROVAL — LOCAL CORRECTION PROVEN**.

The filename preserves the initial review checkpoint. Re-reading the complete
owner instructions resolved the apparent approval question before any request
for additional owner permission or implementation. Original approval sections
10/14 require the exact current canonical source and a genuine READY result;
16/18 require later CAS and same-operation identity. Continuation sections56/72
require supported later publications to create a new revision rather than rewrite
history. No predicate requires a changed numerical result. The separately
approved148 contract makes the canonical live source part of that exact input.

Section56 alone is conditional and would not authorize an arbitrary new
publication policy. Taken with those explicit eligibility and source contracts,
this demonstrated fresh-source case is already supported. Versioning its full
source fingerprint corrects the implementation's incomplete representation; it
adds no publication permission, source authority or replay policy. Introducing a
new same-result rejection instead would narrow the approved capability. The
parent engineering review confirmed this scope decision under continuation
sections151/152: fix ordinary implementation defects; stop only for a materially
new authority boundary. Normal runtime approval review still applies.

## Demonstrated failure

Release run7 made two distinct explicit Director publication requests after real
calculation. An authorized hole-score mutation advanced canonical live source;
the second job used that fresh source with the same Pre-Tournament phase and
10,000 iterations. Its logical result was identical to the first result. The
second publication failed with SQLSTATE `23505`,
`odds_native_publication_idempotency_idx`, in
`canonical_publish_odds_v2(jsonb,text,jsonb)` line333. The transaction did not
commit a new publication.

Evidence: `implementation-evidence/release-transition-2026-10-03T01-29-40.988Z.json`;
raw log: `/private/tmp/r2-release-approved7-oct3.log`. This is a real Certification
API/PostgreSQL counterexample, not a fabricated snapshot or a Production query.
The separately passing149 guard tests use a distinct configuration revision and
do not close this case. Release tests using different supported iteration counts
exercise release mechanics only; they do not repair this failure.

## Existing identity and why it collides

The unique index is inherited unchanged from Preview038 and Production002. Its
nine fields are:

1. tournament ID;
2. milestone;
3. logical payload/result hash;
4. source fingerprint;
5. settings fingerprint;
6. ratings fingerprint;
7. pairing fingerprint;
8. engine version;
9. deterministic seed.

The preserved Production057/073 publisher and extracted143 core store the
**configuration** source fingerprint in field4. A replay of the same committed
operation/job has its own recovery path. A different READY job otherwise reaches
an unconditional snapshot INSERT. The148 canonical live-source fingerprint is
captured in the immutable calculation input and job identity, but is absent from
the nine-field publication identity. A changed live source therefore produces a
different valid job without necessarily producing a different publication key.

Source anchors: `202608230002_production_final_domain_schema.sql:1954`;
`202608300073_production_annual_odds_v1.sql:1437` and `:1617`;
`202609300143_certification_odds_owner_publication_v1.sql:1094` and `:1290`;
`lib/certification-odds-server.js:75` and `:96`. The retained Preview038 publisher
has a separate identical-nine-field duplicate lookup; that old provider contract
does not establish what a newly certified source should mean here.

This mismatch is latent in pre-R2 source. Its occurrence is proved only in the
current local Certification path; no Production runtime occurrence is claimed.

## Alternatives reviewed

**A — Selected within the existing approval:** an explicit Director publication of a freshly validated,
different canonical live source may create a new Certification publication
revision even when the numerical result is identical. Record the new source
provenance truthfully; retain the predecessor unchanged except its existing
current-selection flags.

**B — Rejected scope alternative:** retain the existing publication equivalence class
and return a specific, deterministic equivalent-result rejection with no new
publication or receipt claiming a new publication. The previous immutable
publication remains official under the existing published-snapshot semantics.
The new job must not be falsely marked PUBLISHED or silently relabeled as the old
snapshot's source. Any additional terminal/drain behavior for that rejected READY
job would need to be stated explicitly; this choice by itself does not prove that
the job can drain or that the required capability is complete.

Returning the old snapshot as though the new source had been published is not a
safe third option. Nor may an implementation rewrite old provenance, alter the
numerical result to force uniqueness, auto-publish, or invent an operation retry.

## Implemented boundary for A

Forward150 implements a versioned **Certification-only publication source identity** composed from
the existing configuration source fingerprint and the already-approved canonical
live-source fingerprint. Both inputs must come from the retained job and be
revalidated under148's existing publication locks. The client supplies neither.
Include a version discriminator such as
`certification-odds-publication-source-v1` in the hashed identity.

The chosen representation puts that composite fingerprint in the
existing snapshot `source_fingerprint` for **new Certification publications
only**, with the version and both original component fingerprints retained in
the existing immutable `source_calculation_revision`/resource provenance JSON.
Keep the configuration fingerprint unchanged in `job.source_revision` and record
it explicitly as configuration provenance. This uses the retained unique index
without altering its global definition or weakening legacy/Production rows.
No new authoritative table, broad schema column, or trigger exception is needed.

This is a versioned representation change to the Certification publication fingerprint,
not a claim that field4 already has this meaning. The service-only read envelope
must identify the version; existing public payload/DTO shapes and the calculator's
result must remain unchanged. `publishedOddsFreshness` exposes the stored source
fingerprint and compares it with a payload source fingerprint when present, so
its actual caller behavior requires explicit compatibility proof. Do not change
the engine result or bypass that check to accommodate the representation.

A forward migration changes only the admitted Certification branch of
`canonical_publish_odds_v2` plus directly required internal read/provenance
handling. Preserve function identities, owner/ACL/search_path, trigger guards,
first/later CAS, source-lock ordering, atomic audit/receipt, actor/resource binding,
Google retirement and existing operation recovery. Production and legacy
fingerprints, index behavior, admission and publication/replay policy stay
unchanged. No old configuration/snapshot is backfilled or rewritten. Same live
source plus same result does not automatically gain permission for unlimited
duplicate revisions; the existing approval distinguishes **different live sources**.

If this representation cannot pass compatibility or requires a global index,
Production change, new replay policy or historical rewrite, stop and return that
additional boundary rather than substituting another design silently.

## Required proof before closure

- Reproduce the exact same-iterations, identical-result, different-live-source
  failure, then show two real explicit publications with distinct truthful source
  identities and revisions; the original configuration stays byte-identical.
- Preserve original calculation results and algorithm/reference equality.
- Same-operation retry and lost-response status return the one committed result;
  changed request under the same operation conflicts; concurrent publication CAS
  allows only the intended winner.
- Stale source/job, forged or missing live identity, wrong resource/actor/context,
  and worker publication remain denied. Both source/publication lock orders stay
  safe; no new source may be silently rebound.
- Inject failure after predecessor flag updates and before required receipt/audit;
  everything rolls back. Historical payload/provenance and Google metadata remain
  immutable. No automatic publication occurs.
- Exercise actual Director API, participant Odds/public freshness and Build10
  projections. No private resource/ingress provenance leaks or DTO shape change.
- Verify the old Production core branch and index definition remain unchanged;
  rerun protected calculation/replay/no-adoption rejection. Positive historical
  Production publication remains separately NOT PROVEN without a valid fixture.
- Rerun affected release drain and genuine annual publication/FinalRecap chronology.

All work remains local/non-Production. No further owner permission is requested
for this existing approved capability. Hosting, deployment, Production access
and Google access remain prohibited.

## Local closure evidence

Forward150 is installed and the exact same-result case passes11/11 through the
actual shipping API, canonical calculator and owned PostgreSQL. The original
23505 evidence remains unchanged. `odds150-proof-receipt.json` records this proof
and the separate full150 expanded/freshness/protected rerun38/38. Original
configuration and job source fingerprints remain unchanged, the index definition
is identical, and publication core attributes/dependencies and the Production
branch pass exact reversal checks. No new private helper or grant is introduced.

The public freshness result remains CURRENT_OFFICIAL; actual PWA/Build10
projections expose no private provenance. Same-operation recovery, same-source
nonduplication, concurrent CAS, stale-source rejection and atomic rollback pass.
Affected final-profile release/annual/bootstrap/boot proofs remain separate gates.
This result is not hosted, Production or whole-R2 certification.

## Final full-profile refresh

The exact same-result regression again passes11/11 on the final shared131–152
profile in `odds-publication-identity-2026-10-03T02-45-04-937Z.json`. The combined
expanded/freshness/identity/protected run is49/49 with an unchanged complete
consumed-source manifest. See `implementation-evidence/odds152-proof-receipt.json`.
No iteration-change workaround, global index change or Production policy change
was used to pass the same-result case.
