# Tournament Guide incremental draft / Director UX certification

## GUIDE EDITOR CORRECTION STATUS

Implemented and locally certified on `codex/guide-incremental-drafts-ux`. Production release requires separate exact-SHA authorization. No real Guide draft or content was entered.

## ROOT CAUSE

`stageProductionGuideDraft` used the publication projection validator. Its seven-domain completeness policy coupled normal persistence to publication readiness. SQL also rejected blank event dates, and Preview required VALIDATED rather than a structurally safe saved draft. Overview fields used primary names while retained import values were in `Annual` and `Dates`.

## DRAFT SAVE BEHAVIOR

`normalizeProductionGuideAuthoring` now has explicit server-selected DRAFT and PUBLICATION levels. Empty, overview-only, partial itinerary/timeline/rules/dining/local/contact content can be saved privately. Stable identities, exact tournament scope, bounded types/lengths, distinct orders, malformed values, unsafe/private content, and canonical references remain checked. Dates and other incomplete editorial fields may be blank in private drafts, but malformed supplied values are rejected.

The existing transactional create/update/copy paths use the structural validator. Existing optimistic version checks, operation identities, receipts, immutable audit, authorization, and published pointers remain intact. Repeated saves and subsequent read-back preserve the private draft. This does not create a second Guide model.

## PUBLICATION VALIDATION

Full application validation remains required for Validate for Publication and Publish. The SQL publication validator independently requires complete publication domains and rejects private item statuses in the public projection. Publish still requires the exact validated version/fingerprint, canonical context, expected published predecessor, and explicit confirmation. Incomplete private drafts do not become public through Preview.

## DRAFT VS PUBLISHED UX

The editor separates Published revision, Working draft — not visible to participants, private saved state, and unsaved changes. Primary editing action is Save Draft. Validate for Publication, Preview Saved Draft, and Publish Revision are distinct. Unsaved changes disable validation/preview/publication; publication remains disabled without validation. Overview spans the full form workspace on desktop.

## OVERVIEW FIELD COMPATIBILITY

Client-safe read mapping resolves `Annual` to Tournament Edition and `Dates` to Tournament Dates; existing primary values win. A genuine missing tournament name stays missing. No imported publication is rewritten. Operational Setup start/end/timezone are not inferred from display dates.

## TOURNAMENT SETUP VS GUIDE CLARITY

Short helper text identifies Guide fields as presentation and identifies courses, tees, ratings, slopes, pars, and holes as Setup-managed. No technical course-entry controls, Setup writes, handicap math, or scoring changes were added.

## SCHEDULE VS TIMELINE

Guide Itinerary appears inside the Guide. Home Timeline is entered separately for Home. Neither creates the other or changes match tee times. Existing keyboard Move Up/Move Down controls remain; order fields have explanatory copy.

## RULE BOOK FIXES

`guideRoundLabel` handles both numeric and retained `Round 1` labels without duplicating Round. Public and participant rules with no meaningful body render static cards rather than empty disclosures. Participant format summaries still come from the unchanged `formatRuleSummary` implementation; no rule text or scoring policy was fabricated.

## GOLF GENIUS

The existing Local Guide model now recognizes a Golf Genius grouping instead of placing it under Other. Director help explains Section, Title, instructions/public event code in Description, and URL in Website. No new content subsystem or access-control behavior was introduced.

## CONTACT / PUBLIC-VISIBILITY SAFETY

The editor explicitly warns that published Guide content may be seen by participants and public website visitors. It does not promise a Sensitive/private setting. Restricted access codes and private contact details should not be entered. Existing backend sanitization and no-private-data rules remain enforced.

## PUBLICATION READINESS

The advisory checklist shows Overview name and the existing seven publication domains: Sections, Guide Itinerary, Home Timeline, Rule Book, Dining, Local Information, Contacts. States are Complete, Incomplete, or Not started. This checklist does not replace server publication validation or block a structurally valid draft save.

## PREVIEW

Saved DRAFT and VALIDATED records support Director-private preview. DRAFT preview includes unfinished and item-Draft rows as escaped presentation fields. It is marked DRAFT PREVIEW, shows missing content honestly, and does not update pointers or create preview receipts. Exact saved version, content hashes, current canonical references, Director authorization, and same-origin POST protections are retained. Tab remains in the modal, Escape closes it, and focus returns to Preview Saved Draft.

## RESPONSIVE / ACCESSIBILITY

The actual editor component was exercised in an isolated localhost Next harness using synthetic data only. Overview, partial itinerary, and private preview were measured at 390, 430, 820, 1280, and 1440 pixels. At every width: zero document overflow, no clipped form controls, minimum button height 44px. The preview remains contained (approximately 374/413/787/980/980px respectively). Desktop and mobile screenshots were inspected. Accessible field errors reference the validation region; missing tournament name was verified through the rendered invalid field. Keyboard modal containment, Escape, and focus restoration were exercised. Published fixture revision 1 remained separate while synthetic draft versions advanced from 1 to 2.

Live Production testing of the revised UI remains a post-release gate; no unreleased code was exercised against Production mutations.

## TESTS

Application regression selection: 195 tests passed, covering Guide authoring/readers/publication/privacy, Director Console, public/PWA navigation, Tournament Setup, scoring lifecycle/no-change protections, and Step 14D performance. Native scoring contract: six tests passed with the required react-server condition.

Isolated PostgreSQL integration passed: inert installation, private empty/partial create/update/reload, exact retries, no preview receipts, publication incompleteness rejection, unchanged live publication, completed valid validation/preview/publication, CAS/conflicting retries, future-year isolation, RLS/grants, and canonical-context drift checks. Test-only database fixtures were disposed after the run. Initial macOS shared-memory failures were environmental; only this task's two unused segments were removed before successful reruns.

Production build and `git diff --check` passed. Existing unrelated CSS compatibility warnings and local legacy Google DNS/static-render diagnostics remain; no Google fallback was added by this change.

## MIGRATION

New additive migration: `202609070093_production_guide_incremental_drafts_v1.sql`. Applied only in isolated local PostgreSQL certification. Existing migrations are untouched. Installation changes function definitions, not operational rows. New structural helper has no public/anon/authenticated/service-role direct execution grant; existing public service-scoped endpoints retain their authorization boundaries.

Migration 093 has NOT been applied to Production.

## DEPLOYMENT

Commit/push is authorized for this locally certified payload. No deployment, rebind, or Production migration execution is authorized in this phase. Exact SHA must be approved separately. Unrelated `launch-video/` and the earlier entry-playbook audit file are excluded from this payload.

## PRODUCTION DATA IMPACT

Before/after read-only Production baseline comparisons were identical:

- Tournament 2026; Guide publication revision 1, UUID `17805350-33d2-4c21-8068-98863e8d8bc4`.
- Content fingerprint `2c5211714b23777c4a67642587ac4585efd5903fc86f0d7be7a365e2b998073c`.
- Projection payload hash `73c2a57ba8637187e554f67fced6668fb0a76e80e7d37178a48b2956dd622c4c`.
- Guide drafts, receipts, and audit events: zero. Seven editorial content domains: zero rows. Retained three Courses, three Tournament Rules, and three Formats unchanged.
- Imported edition `10th Annual Sandbagger Invitational`; dates `September 25 - 26, 2026`; destination Kiawah Island; annual asset `sandbagger-2026`; hero `ocean-course`. Tournament name remains missing.
- Setup revision 3. R1 TPGC01/Gold/BB (71.9/136/72), R2 CPGC01/Black/SC (72.7/138/72), R3 OCGC01/Gold/SI (74.7/150/72), including identical complete 18-hole contexts.
- Separate final authoritative SELECT confirmed first tee times R1 07:30, R2 14:00, R3 10:10.

No Production Guide, Setup, scoring, handicap, Odds, Awards, Net Skins, Calcutta, or native operation was performed.

INCREMENTAL GUIDE DRAFT SAVES: READY

INCOMPLETE DRAFT CAN SAVE: YES

INCOMPLETE DRAFT CAN PUBLISH: NO

PUBLISHED GUIDE REMAINS LIVE WHILE DRAFTING: YES

GUIDE DRAFT PREVIEW: READY

TOURNAMENT SETUP COURSE AUTHORITY: UNCHANGED

GUIDE EDITS AFFECT SCORING: NO

PRODUCTION GUIDE MUTATIONS: 0

NATIVE IOS CONTRACT IMPACT: NONE
