# Tournament Guide optional-content publication contract

## Status and root cause

Implemented on `codex/guide-optional-content-publication`, application + additive migration 094. No Production deployment or mutation has occurred. The real private 2026 draft was not opened, rewritten, discarded or published.

Production authoring selected the shared projection's historical seven-domain completeness policy. Migration 093 independently required nonempty public arrays for those same seven domains. The advisory Director checklist also classified all empty domains as incomplete. None of these conditions distinguished optional content from the core itinerary.

The new explicit `REQUIRE_ITINERARY` projection policy is selected only by Production authoring. Existing legacy/import policies are retained unchanged. SQL publication validation independently enforces the new policy, calling the unchanged structural validator first. No publish transaction, authorization, CAS, hash, audit, receipt, private draft persistence or preview RPC is replaced.

## Required publication content

- Exact tournament ID/year and a nonblank name remain required.
- Annual label, display dates and destination/location are required presentation identity. Existing aliases (`Annual`, `Dates`, `Location`, `Name`) remain accepted.
- A valid timezone is required because publication includes dated/timed participant itinerary content; no timezone is inferred from display copy.
- Structured start/end dates are optional presentation bounds, not operational Setup facts. If supplied, both must be real dates in the target year and start must not exceed end. Existing application and PostgreSQL date validators are reused.
- Images are optional. No image or missing presentation value is fabricated by publication validation.
- At least one published Guide Itinerary event is required, with existing date/time/reference/order/status checks for every supplied event.
- Existing Course, Round rule and Format presentation requirements and canonical Setup consistency remain. Tests preserve three of each without course overview/tips/signature holes/GPS or format prose.

## Optional domains

Guide Sections, Home Timeline, Rule Book, Dining, Local Guide and Important Contacts may each contain zero records. Every supplied record still undergoes authoring validation and the existing structural/privacy/reference checks; incompleteness cannot be hidden behind a private item status. Public item-status filtering remains unchanged. Section Name is explicitly required when a section is used, alongside its ID, slug, description and order.

Home Timeline remains separate from Guide Itinerary, with no automatic copying. Rule Book may be absent while structured round/format presentation remains. Dining and Local Guide require no filler. Golf Genius remains informational Local Guide content only. Zero contacts is valid, with existing public-information warnings and safe contact validation retained; no phone/email is required merely to publish a Guide.

## Readiness UX

The checklist separates Required (Overview, Guide Itinerary) and Optional domains. Empty optional domains say `Not used` neutrally. Used domains show item counts or `Needs attention`. The checklist is advisory; the existing actionable server/field validation region remains authoritative and continues to surface malformed values and reference errors.

## Draft and preview

Incremental structurally safe incomplete drafts still save privately. Saved partial preview remains available before publication validation. Preview now omits empty domains and does not misleadingly label blank optional course/format prose as an incomplete body. Existing saved-version checks, modal keyboard/focus behavior and explicit Publish confirmation are unchanged. No published pointer changes on save or preview.

## Participant presentation

The public Guide already conditionally omits empty optional sections and their navigation. Real JSX rendering confirms no unused Dining/Local/Contacts headings or links, no empty rule disclosures, itinerary retained, and all three structured formats retained without prose.

The participant directory previously always linked all six destinations. It now filters them against actual content using the existing read, so empty optional destinations do not leave dead cards. Schedule/Courses/Rules remain when populated. `/app/guide` and `/app/courses` routing remains distinct from public website navigation. Private preview omits all six empty optional domains. No new routes, data models, loaders, Google fallback or scoring logic were added.

## Tests and caveats

- Focused Guide authoring/projection/Director/render coverage passed; see final release-readiness report for totals.
- Broader application selection: 193 passed, one pre-existing unrelated assertion failed, zero skipped. The failing assertion is `test/step13e1-production-director-console-foundation.test.mjs:191`: its fixture supplies no `handicaps` model but expects `capabilities.handicapManagement === true`. The unchanged implementation in `lib/production-director-console.js` deliberately computes `Boolean(handicaps)`, yielding false. Both files and their relevant dependency are byte-for-byte unchanged from the starting commit. This test was neither skipped nor weakened; no unrelated capability change is included.
- Disposable PostgreSQL integration passed with no skips: inert installation, minimum-content create/validate/publish, all optional domains zero/valid/invalid/duplicate, Overview/date/timezone requirements, public item-status rejection, incomplete save/preview, canonical context drift, CAS, exact/conflicting retry, full-content publication, copy-forward/cross-year isolation and existing security/grants.
- Installing the migration over an already-existing isolated private draft preserved the full draft/receipt/public-pointer fingerprint exactly.
- Native scoring contract: 6 passed. Public/PWA, Setup and scoring regressions passed within the broader selection.
- Production build and `git diff --check` passed. Existing unrelated CSS compatibility warnings remain.
- One sandboxed broad invocation also encountered PostgreSQL shared-memory permissions; the required integration was rerun separately outside the sandbox. A later resource-exhaustion rerun was resolved by removing only this task's identified unattached orphan segment; final PostgreSQL run passed. No assertions were disabled.

## Migration and release boundary

`202609080094_production_guide_optional_content_v1.sql` replaces only the private publication validator, keeps its fixed `pg_catalog` search path, revokes direct access from public/anon/authenticated/service_role, and changes no operational rows. Applied migrations 082 and 093 are unmodified. Migration 094 has not been applied to Production.

Commit/push only in this phase; exact-SHA Production authorization is required before applying 094 or deploying/rebinding. No actual 2026 content is included in fixtures. No Production Guide, Setup, scoring, handicap, Odds, Awards, Net Skins, Calcutta or native state was changed.

OVERVIEW REQUIRED: YES

MINIMUM ITINERARY EVENTS: 1

GUIDE SECTIONS REQUIRED: NO

HOME TIMELINE REQUIRED: NO

RULE BOOK REQUIRED: NO

DINING REQUIRED: NO

LOCAL GUIDE REQUIRED: NO

IMPORTANT CONTACTS REQUIRED: NO

OPTIONAL CONTENT VALIDATED WHEN USED: YES

INCOMPLETE DRAFT CAN SAVE: YES

EMPTY OPTIONAL PARTICIPANT AREAS OMITTED CLEANLY: YES

PRODUCTION GUIDE DRAFT MUTATIONS: 0
