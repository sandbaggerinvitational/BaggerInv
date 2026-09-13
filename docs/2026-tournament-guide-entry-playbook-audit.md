# 2026 Tournament Guide — Director UX audit and Clay’s entry playbook

Read-only Production audit, September 7, 2026. No Guide save, validation operation, publication, Setup change, migration, deployment, or other Production mutation was performed. Examples below are proposed entry templates, not saved tournament facts. Bracketed placeholders must be replaced with confirmed information before entry.

## TOURNAMENT GUIDE STATUS

**The Guide is live but incomplete. The course context is ready; the logistics and substantive Rule Book are not. Do not publish a replacement yet.**

The actual location is [Director → Draft & Guide](https://baggerinv.com/admin/director?section=draft-guide), then scroll past the separate, completed Player Draft to **Tournament Guide**. “Draft” at the top of that page means the Player-selection Draft; “Create Guide Draft” below means an unpublished editorial revision. They are unrelated workflows.

There are two material entry problems:

1. **Imported Overview aliases are not shown correctly in the editor.** Annual label and Dates appear blank even though the stored `Annual` and `Dates` values render publicly. Tournament name is actually absent in both accepted Guide name fields; the public title uses other presentation/fallback information. The server requires a name when staging a new Guide draft.
2. **Partial-content saves fail the publication-completeness gate.** The normalizer used by Create/Save Draft permits all seven participant-content collections to be empty, but once any contains publishable content it requires all seven: Sections, Schedule, Timeline, Rule Book, Dining, Local Guide, and Contacts. This was reproduced locally without any Production write. A conventional “complete Dining, save, then work on Contacts tomorrow” workflow is not safe to promise.

Recommendation: collect the missing information first. Either assemble a genuinely complete bundle before its first save under the installed contract, or separately authorize a draft-validation UX correction. Do not invent placeholder events, rules, meals, or contacts to satisfy validation.

## CURRENT 2026 GUIDE INVENTORY

### Authoritative publication

| Attribute | Observed value |
|---|---|
| Tournament | 2026 |
| Current Guide publication | Revision 1 |
| Publication UUID | `17805350-33d2-4c21-8068-98863e8d8bc4` |
| Recorded publication/import timestamp | `2026-08-24T01:50:58.850565+00:00` |
| Provenance | `GOOGLE_SYNCHRONIZATION` — retained imported evidence in Supabase |
| Contract | `guide-projection-v1` |
| Content fingerprint | `2c5211714b23777c4a67642587ac4585efd5903fc86f0d7be7a365e2b998073c` |
| Payload hash | `73c2a57ba8637187e554f67fced6668fb0a76e80e7d37178a48b2956dd622c4c` |
| Open Guide draft | None |
| Native Guide authoring drafts / receipts / audit events | 0 / 0 / 0 at read-only inspection |
| Tournament Setup revision | 3 |

“CURRENT” means the current publication pointer, not that all content is finished or operationally current. The import timestamp is not evidence that the Director reviewed all 2026 logistics that day.

### Complete collection inventory

| Director area | Existing records | Current content and visibility | Completion / conflict assessment |
|---|---:|---|---|
| Overview | 1 | Edition, dates, destination and existing image references; public and participant header | Partially populated; editor alias mismatch; operational dates are separate |
| Sections | 0 | No authored section introductions | Missing |
| Schedule / Itinerary | 0 | No dated Guide events | Missing; participant Schedule shows an intentional empty state |
| Timeline | 0 | No Guide-authored Home timeline events | Missing; not generated automatically from Schedule |
| Rule Book | 0 | No individual rules, categories, or important notices | Missing |
| Tournament Rules | 3 | BB, SC, SI round presentation and point structure | Structural values present; prose empty; imported Round label compatibility defect |
| Rounds Presentation | 3 | BB/Best Ball/2, SC/Scramble/2, SI/Singles/1 | Format identities present; all descriptive/rule/handicap/scoring prose fields empty |
| Dining | 0 | No meals/reservations | Missing |
| Local Guide | 0 | No lodging, travel, resort, Golf Genius, or other resource records | Missing |
| Important Contacts | 0 | No public tournament contacts | Missing |
| Courses | 3 | Names, round/format associations, locations, websites, assets, designers/opening years | Course identities and canonical technical context ready; editorial enhancements optional |

There are no authored sections/events/rules/meals/contacts to enumerate beyond these zero counts. All nine existing course/round/format rows come from the same revision-1 imported Guide. They have no individual publication status or explicit order field; inclusion is by the Guide publication as a whole. They are not evidence of an independently published Rule Book.

### Existing Overview values

- `Year`: 2026. Stored `Tournament ID` is blank; the authoring server supplies the exact selected scope when staging.
- `Annual`: **10th Annual Sandbagger Invitational**. Editor’s `Tournament Edition` is blank.
- `Dates`: **September 25 - 26, 2026**. Editor’s `Tournament Dates` is blank.
- `Destination`: **Kiawah Island**.
- `Annual Image`: `sandbagger-2026`; `Hero Image`: `ocean-course`.
- Both Guide name fields are blank. Location, structured Start/End Date, Time Zone, Mobile Hero Image, and alternative asset aliases are blank.
- The stored normalized Guide identity has `America/Chicago` as a fallback timezone. This is not a certified Kiawah local-time decision.

### Existing round and format rows

| Stored Round | Format / name | Team size | Available points | Front / back / overall enabled | Point split | Prose |
|---|---|---:|---:|---|---|---|
| `Round 1` | BB / Best Ball | 2 | 3 | Yes / Yes / Yes | 1 / 1 / 1 | Empty |
| `Round 2` | SC / Scramble | 2 | 3 | Yes / Yes / Yes | 1 / 1 / 1 | Empty |
| `Round 3` | SI / Singles | 1 | 3 | No / No / Yes | 0 / 0 / 3 | Empty |

These are presentation records, not an instruction to change points or handicap mathematics. Public headings currently show **“ROUND ROUND 1”**, etc. Expanding the public Best Ball disclosure reveals no additional authored prose. Participant Rules separately supplies code-default summaries: BB 90% / Nassau, SC 35%–15% / Nassau, SI 100% / 18-hole match play. Those summaries are not newly entered 2026 policy.

### Existing course presentation rows

Stored array order: Cougar Point, Ocean Course, Turtle Point. Participant course cards correctly render Round 1, 2, 3.

| Course | Existing editorial facts | Existing assets | Website |
|---|---|---|---|
| CPGC01 — Cougar Point Golf Course | Round 2 / SC; Kiawah Island, SC; destination Kiawah Island; 1976; Gary Player | `cougar-point-logo`, `cougar-point-profile` | [Existing course website](https://kiawahresort.com/golf/cougar-point-golf-course/) |
| OCGC01 — The Ocean Course | Round 3 / SI; Kiawah Island, SC; destination Kiawah Island; 1991; Pete Dye | `ocean-course-logo`, `ocean-course-profile` | [Existing course website](https://kiawahresort.com/golf/the-ocean-course/) |
| TPGC01 — Turtle Point Golf Course | Round 1 / BB; Kiawah Island, SC; destination Kiawah Island; 1981; Jack Nicklaus | `turtle-point-logo`, `turtle-point-profile` | [Existing course website](https://kiawahresort.com/golf/turtle-point-golf-course/) |

All three have blank authored Overview, Playing Tips, Signature Holes, History, Notes and GPS link fields. These are optional: course detail rendering already has repository editorial fallbacks in `course-guide-content.js`. Do not mistake visible fallback copy for saved Guide content. Historical course appearances are a separate archive, not editable 2026 records.

## DIRECTOR FIELD-BY-FIELD MAP

The complete label/key/requiredness/format/example map is in Appendix A. It covers all eleven domains, Draft note, and every action. The key architectural point is that these are **JSON fields in a versioned Guide document**, not separate editable Google sheets or independent database tables per tab.

### Installed storage and delivery

All following native tables are in `production_control`:

- `guide_authoring_drafts_v1`: private full `authoring_content`, draft version and validation state.
- `guide_authoring_revisions_v1`: immutable published authoring content and participant projection.
- `guide_authoring_current_v1`: current published authority/pointer.
- `guide_authoring_revision_provenance_v1`: provenance.
- `guide_authoring_operation_receipts_v1`, `guide_authoring_audit_events_v1`: idempotency and immutable audit.
- Current imported revision fallback: existing `projection_current` / `projection_revisions`, domain GUIDE. `guide_current_publication_v1` chooses the native publication when present or the retained 2026 import otherwise.

`GET /api/director/guide` → `readProductionGuideAuthoring` → `read_production_guide_authoring_v1` supplies Director content. Bounded POST actions are `stage`, `validate`, `preview`, `publish`, `discard`, `copy-previous`.

Public delivery: `read_current_guide_projection` → `readGuideProjection` → `guideParticipantProjection` / `contentFromSupabase`. Canonical course context is merged into presentation; the current live tournament model supplies lifecycle context. Production resolves Supabase and fails closed rather than falling back to Google. Legacy Google code and imported field names remain in the repository; neither the `GOOGLE_SYNCHRONIZATION` badge nor an old “workbook” label means a foreground Google fetch. The inspected public DOM reports `data-guide-source="supabase"`.

## TOURNAMENT SETUP VS GUIDE

| Information | Authoritative source | Director entry location | Guide display source | Scoring impact |
|---|---|---|---|---|
| Round IDs, BB/SC/SI, team size / competition configuration | Supabase competition/round contracts | Tournament Setup → Rounds | Canonical references plus existing Guide format names/copy | Operational changes belong outside Guide |
| Round course and tee | Setup-managed round/course/tee context | Tournament Setup → Courses; match-specific assignment in Matches & Pairings | Canonical context joined to Guide course presentation | Scoring-sensitive in Setup; Guide cannot change it |
| Rating, slope, par, yardages, 18 holes, Stroke Index | Setup course tees/holes and scoring context | Tournament Setup → Courses | Automatically merged canonical values | Scoring-sensitive; no Guide input controls |
| Course name, images, designer, overview, tips, website | Published course presentation; optional static editorial fallback | Guide → Courses | Presentation join by Course ID | None from Guide edits |
| Tournament operational dates, destination, timezone | Tournament Setup metadata | Tournament Setup → Tournament | Live runtime context where used; not a write-through from Guide | Operational metadata; separate controlled change |
| Display dates, annual label, Guide hero | Guide tournament presentation / retained aliases | Guide → Overview | Public/participant Guide header | None; does not complete Setup |
| Individual round calendar dates | No populated Guide itinerary dates; rounds source contains only Year/Round/Format | Guide → Schedule for the participant plan; separate operational setup if supported/needed | Authored Event date, not inferred from tournament banner | None from Guide entries |
| Match tee times | Current match metadata; existing imported times retained | Tournament Setup → Matches & Pairings | Match surfaces; Guide event Start time is a separate manually synchronized field | Guide never changes the match tee time |
| Teams, captains, roster, pairings | Stable Supabase identities / tournament membership / match participants | Teams & Captains, Roster, Matches & Pairings | Canonical linked surfaces, not free-text Guide authority | None from Guide copy |
| Rule explanation / tournament etiquette | Director-approved Guide prose | Rule Book; round-specific copy in Tournament Rules | Published rules/format disclosures | None; copy does not configure enforcement |
| Actual score / strokes / handicap / points calculation | Approved handicap and SQL scoring contracts | Existing operational workflows | Read-only canonical context / explanatory summaries | Guide cannot change the formulas |
| Meals, lodging, transport, public contacts | Director-authored Guide content | Dining, Local Guide, Important Contacts | Published cards and links | None |
| Golf Genius or side-game explanation | Director-authored Guide content, if deliberately supplied | Local Guide / Rule Book as applicable | Informational copy only | None; no external scoring integration created |

**Directly observed Setup metadata gap:** name is Sandbagger Invitational, but destination, Start date, End date and Time zone are blank. Setup warns “Tournament dates, destination, and timezone need review.” Do not assume typing the Guide banner resolves that warning. Do not change those fields under this read-only audit.

## COURSES

Verified by the read-only `guide_canonical_course_context_v1('2026')` and Director course readiness:

| Round | Format | Course | Tee | Rating | Slope | Par | Holes / consistency |
|---|---|---|---|---:|---:|---:|---|
| 1 | BB | TPGC01 — Turtle Point Golf Course | Gold | 71.9 | 136 | 72 | 18 / consistent |
| 2 | SC | CPGC01 — Cougar Point Golf Course | Black | 72.7 | 138 | 72 | 18 / consistent |
| 3 | SI | OCGC01 — The Ocean Course | Gold | 74.7 | 150 | 72 | 18 / consistent |

Source tables are `scoring_authority.tournament_setup_round_courses_v1`, `tournament_setup_course_tees_v1`, and `tournament_setup_course_holes_v1`, with canonical rounds. Every course reports `configuration_consistent=true`; hole numbers and stroke indexes cover 1–18. No conflicting course definition was found in the inspected current context.

Ordered hole evidence, holes 1–18 (read only):

- R1 par: `4,5,4,3,5,4,3,4,4,5,4,4,5,3,4,3,4,4`; SI: `9,5,15,13,7,11,17,1,3,12,6,4,10,16,8,14,18,2`.
- R2 par: `4,3,5,4,4,3,4,4,5,4,5,3,4,3,5,4,4,4`; SI: `13,11,17,1,5,9,7,15,3,4,18,8,10,16,14,6,12,2`.
- R3 par: `4,5,4,4,3,4,5,3,4,4,5,4,4,3,4,5,3,4`; SI: `15,3,9,1,11,13,7,17,5,16,8,10,2,14,18,4,12,6`.

Leave the three existing Course ID / Round / Format selections and course technical facts alone. Guide presentation already has the necessary course rows. Additional manual copy is optional, not a prerequisite to calculating course handicaps.

## ITINERARY / SCHEDULE

### What exists and what does not

There are **zero Guide schedule events and zero timeline rows**, so no arrival, meal, round-date, awards-time, or departure itinerary has been entered.

However, current match tee-time metadata is **not empty**:

| Round | Match tee times already visible in Setup |
|---|---|
| R1, matches 1–6 | 07:30, 07:40, 07:50, 08:00, 08:10, 08:20 |
| R2, matches 1–6 | 14:00, 14:10, 14:20, 14:30, 14:40, 14:50 |
| R3, matches 1–12 | 10:10, 10:10, 10:20, 10:20, 10:30, 10:30, 10:40, 10:40, 10:50, 10:50, 11:00, 11:10 |

Original display strings mix 24-hour and AM/PM notation; the table above normalizes them for reading only. These existing times do **not** prove which calendar day each round takes place or which timezone the owner intended. Do not infer R1/R2 on the 25th and R3 on the 26th without confirmation.

### Schedule semantics

- Event date is a validated real date within 2026; use the date control/ISO `YYYY-MM-DD`.
- Start/End time controls are text fields validated as clock values (`07:30`, `7:30 AM`); not a datetime or a timezone-aware timestamp. Start is required, End optional. “TBD” is not a valid required time.
- Event ID is a unique, stable identifier you supply. It is not a Player, Match, or GHIN ID.
- Day label is required in source, but participant weekday presentation can be derived from the date. Keep them consistent.
- Round ID and Course ID are optional selectors. Use the existing Round 1/2/3 choices for golf events, and their matching courses. There is no separate itinerary Format input: format presentation derives from the round.
- For a bound round, the resolved course name can replace Location, and the format name can replace Subtitle. Put “meet at bag drop 30 minutes before tee time,” room details and other instructions in **Details**, not only in Subtitle/Location.
- With no explicit Round ID, the current parser also examines title/subtitle digits for a round number. Avoid titles beginning with `2026` or unrelated numbers; explicitly bind golf events and use plain titles for non-golf events.
- No arbitrary event Link/Link label field exists. Course links are generated from the binding; other actionable URLs belong in Local Guide’s Website field.
- The participant event status can be derived from time and canonical round lifecycle. Guide item Status is a publication filter, not MARK_LIVE.
- **Schedule and Timeline are separate authored lists.** Timeline drives Home presentation; Schedule supplies the Guide itinerary. Adding one does not create the other.
- Timeline “Notification minutes” becomes `notificationEvents` metadata. The searched application has no consumer proving an automatic notification is sent from this field. Do not promise push/SMS reminders.
- Runtime schedule calculations use the resolved live tournament timezone, with `America/Chicago` fallback. Guide Time zone does not reliably override an available live tournament context. Confirm intended `America/New_York` local scheduling and resolve operational metadata separately before relying on live countdown/status behavior.

### Exact entry templates — not confirmed dates/times

For every row below: Event date = **confirmed date**, Day label = matching weekday, Status = Draft while preparing; Display order = suggested number. Set Published only for intended final inclusion, before saving the complete bundle. Do not paste bracketed placeholders.

| Event ID | Title / Event type | Start time | Round / Course | Details to supply | Order |
|---|---|---|---|---|---:|
| `arrival` | Arrival / Travel | Confirmed arrival/check-in time | Blank / blank | Check-in process, meeting location, transport | 10 |
| `draft` | Draft / Draft | **Already recorded July 12, 7:00 PM** if deliberately including the historical event | Blank / blank | Online; completed, not a new September draft | 20 |
| `breakfast-r1` | Breakfast / Meal | Confirmed breakfast time | Blank / blank | Venue, service window, payment/reservation details | 30 |
| `round-1` | Round 1 / Golf | Existing first tee 07:30, subject to date/timezone confirmation | Round 1 / TPGC01 | Meet-up/check-in time, bag drop, participant instructions | 40 |
| `lunch` | Lunch / Meal | Confirmed lunch time | Blank / blank | Venue and plan | 50 |
| `round-2` | Round 2 / Golf | Existing first tee 14:00, subject to confirmation | Round 2 / CPGC01 | Transfer and arrival instructions | 60 |
| `dinner` | Dinner / Meal | Confirmed dinner time | Blank / blank | Venue, reservation, dress code; fuller detail also in Dining | 70 |
| `round-3` | Round 3 / Golf | Existing first tee 10:10, subject to confirmation | Round 3 / OCGC01 | Meet-up and transport instructions | 80 |
| `awards` | Awards / Gathering | Confirmed ceremony time | Blank / blank | Venue and event instructions, not Award winners/configuration | 90 |
| `departure` | Departure / Travel | Confirmed departure/check-out time | Blank / blank | Checkout and transport plan | 100 |

The actual Player Draft is recorded as Complete, July 12, 2026, 7:00 PM, Online, timezone label CST. **Do not create a new September Draft itinerary event by assumption.** Prefer omitting it from tournament-week logistics unless Clay wants an explicitly historical entry; clarify the old timezone label before using it for chronology.

## RULES

Use **Rule Book** for the six requested policy groups. All bodies below must be supplied/approved by Clay; none is invented by this audit.

| Category | Suggested Title / Subcategory | Where it appears / caution |
|---|---|---|
| GENERAL | Tournament conduct / General | General competition rules; owner supplies exact policy |
| BEST BALL | Best Ball procedures / Round 1 | Participant format routing recognizes “Best Ball”; do not use only an unexplained BB category |
| SCRAMBLE | Scramble procedures / Round 2 | Scramble-format content |
| SINGLES | Singles procedures / Round 3 | Singles-format content |
| TIEBREAKERS | Tiebreaker procedure / Competition | Public Category grouping; participant general-rule grouping may consolidate it |
| PACE / CONCESSIONS / LOCAL RULES | Prefer separate titled rows for Pace, Concessions, Local rules | Category is free text, but participant grouping uses content heuristics; preview each result |

Use stable Rule IDs, e.g. `2026-general-conduct`, `2026-bb-procedure`; Title and Body required. Important is emphasis/default disclosure behavior, not privacy or enforcement. Subcategory is explanatory metadata; Display order controls row order, not the hard-coded format order. Effective year can be 2026.

Use **Tournament Rules** for prose specific to an existing round, and **Rounds Presentation** for reusable format prose. Avoid copying the same paragraph into all three tabs. The rendered rules model combines multiple sources and can show redundant text. Existing points/team sizes should be left alone. Publication validation checks supported structural conflicts, but cannot verify that arbitrary human policy prose agrees with every scoring rule.

## GOLF GENIUS

**No dedicated Golf Genius editor/domain is installed in the current Production Guide contract.** The retired editor contains an `information` model with Golf Genius, Link URL, Link Text and Sensitive fields, but Production redirects that old authoring route to Director. Those fields are not accepted by the new eleven-domain allowlist. No current event code, instructions or URL exists in the inspected Guide.

If Clay confirms a participant-facing informational entry is appropriate, the installed generic alternative is:

- Local Guide → Section: `Golf Genius`; Title: `Golf Genius instructions`.
- Description: confirmed code and instructions **only if the code is deliberately public-safe**.
- Website: Clay’s verified event URL.
- Link label: **not editable**; the participant button says Website.
- Participant Local Guide normalizes this unfamiliar Section to **Other**. It will not become a dedicated Golf Genius directory tile. Public cards can retain the source Section label.

This is an imperfect workaround, not feature parity with the old editor. Do not publish access secrets or imply Golf Genius is Bagger’s scoring authority. If restricted code sharing or a dedicated tile/custom button is required, that is a separate product/implementation decision.

## CALCUTTA / NET SKINS

Live Director inspection confirmed **Net Skins NOT CONFIGURED** and **Calcutta NOT CONFIGURED / Unpublished**, with no calculation listed for either. Calcutta auction revision is 0. Current Championship Odds publication is absent/withdrawn; Guide publication cannot restore it.

Guide prose can explain an owner-approved intended process, or explicitly say details are not finalized. It cannot create rules, a buy-in, payout configuration, auction, ownership, calculation, or publication in those systems. No dedicated Calcutta/Skins Guide domain is installed; Rule Book or a Local Guide informational card is possible, with the same generic grouping limitations described above.

Do not publish amounts, eligibility, carryovers, allocation/payout promises, deadlines, or payment instructions until Clay approves them and the copy is checked against the actual configured contract. Optional side-game text may be omitted; it is not itself a required seventh collection.

## DINING / LODGING / TRAVEL

- **Dining:** Day, Meal, Cuisine, Start/End time, Location, Dress code, Reservation required, Notes, Sort order. Day/Meal/Location/order required; times optional. No structured booking number, per-meal URL, or date picker. Distinct records need distinct Day+Meal identity; two dinners on the same day cannot silently share that identity.
- **Lodging / resort:** Local Guide → Section `Lodging` or `Resort`, Title, Description, Address, Phone, Website, Sort order. Participant grouping becomes Airport & Hotel. No dedicated room-assignment or private check-in field.
- **Transportation:** Local Guide → Section `Transportation`, a titled resource, instructions, address/pickup point, phone and website. Add a separate Schedule event only for an actual timed departure/transfer.
- **Reservations / addresses:** Dining Notes can explain an approved public-safe reservation plan. Put a venue’s actionable link/address in a Local Guide card if needed. There is no automatic join between the Dining and Schedule rows, so keep duplicated event times consistent.
- All are currently empty. Do not infer dining reservations, lodging, shuttles or checkout arrangements from the tournament destination.

## CONTACTS / SENSITIVE CONTENT

Important Contacts accepts Category, Name, Role, Phone, Text enabled, Email, Website and Sort order. Names/contacts are manually supplied; player enrollment/Auth contacts are not automatically copied. Role `Tournament Director` receives emphasized participant styling. The detail page supports Call, optional Text, Email and Website; the public root does not expose every detail-page action identically.

**There is no Sensitive checkbox or private/audience selector in the current Director editor.** Retained import filtering can exclude `Sensitive` records and director/admin/private/internal contact audiences, but those keys are not writable through the current authoring allowlist. This does not offer a current “save it privately inside Contacts” workflow.

All entered Contacts/Local Guide content must be safe for the public web when the Guide revision is published—not merely for authenticated golfers. Do not enter room access codes, private room assignments, personal travel details, enrollment information, payment secrets or non-consenting personal contacts. Keep those outside this public Guide workflow.

## STATUS / PUBLICATION

### Two different kinds of “draft”

1. **Whole Guide draft:** private editorial document saved in Supabase. Saving it does not replace revision 1.
2. **Item Status:** only Sections, Schedule and Rule Book support Draft / Published / Archived / Cancelled. Only Published items enter the participant projection. The other statuses exclude the item; they are not separate independently published revisions.

Dining, Local Guide, Contacts, Courses, Tournament Rules and Rounds Presentation have no item publication switch. They accompany the next Guide publication. Timeline Status override is event-display state, **not** an item privacy/publication switch.

### Actual actions and messages

| UI/action | What actually happens |
|---|---|
| Tournament selector | Loads another permitted tournament scope; not a tournament-fact editor |
| Tab / item selector | Selects a local editor pane only |
| Add | Adds an unsaved row in browser memory; initializes Draft where supported and order where applicable |
| Remove | Confirmation removes a row from the local proposed document; saved/published history is not deleted |
| ↑ / ↓ | Accessible Move up/down buttons swap rows and renumber the ordered collection; not drag-only |
| Create Guide Draft | Stages the entire document after server normalization; not a blank shell unaffected by validation |
| Save Draft Changes | Saves the whole unpublished document with version/CAS checks; live publication unchanged |
| Validate | Validates the stored draft against canonical reference state and records validation state; do not treat as a purely local button |
| Preview | Available only for a saved, validated draft; private sanitized projection summary, not a full replica of public/mobile rendering |
| Publish Revision | Confirmation; atomic new immutable revision and current-pointer switch; no scoring writes |
| Discard Draft | Confirmation; discards unpublished work, leaves current publication intact |
| Copy Previous Guide as Draft | Future-tournament workflow only; not offered for current 2026 in the inspected state |
| Guide revision history | Disclosure showing revision, provenance, timestamp and Current marker |
| Retry | Reloads after an authoring read failure |
| Close Preview / Escape | Closes preview; the modal includes focus handling |

Visible messages include “Published Guide unchanged,” “Draft changes are not validated,” “Save this draft before Validate, Preview, or Publish Revision,” and “Validation needs attention.” API errors distinguish stale predecessor, stale draft version, changed canonical setup, invalid reference/link, duplicate stable identity and idempotency conflict. A failed save must not be treated as stored work.

No autosave exists. Unsaved edits live in browser state and can be lost on reload/navigation. After a successful save, Validate is separate. Any later edit requires Save and Validate again. Publish is only enabled for a non-dirty validated draft; it switches all eligible content together and preserves prior history. There is no ordinary “unpublish whole Guide” button in this editor.

### Completeness blocker reproduced

Pure local normalizer checks, using existing test fixtures:

| Candidate | Result |
|---|---|
| Seven participant areas empty, otherwise valid course/format context | Accepted |
| Only first real Dining row added | Rejected before staging |
| Only first Published Schedule row added | Rejected before staging |
| Only a complete but item-Draft Schedule row added | Accepted, because participant projection remains empty |
| Overview with both name aliases missing | Rejected: overview incomplete |

Thus Draft item status can temporarily keep Sections/Schedule/Rule Book out of the published projection, but does **not** solve gradual Dining/Timeline/Contacts entry. Never weaken this guard, add fictitious content, or claim a partial Guide has been saved successfully.

## ORDERING

- Use ordinary positive integers for clarity. Server order validation actually accepts non-negative finite numbers, not only integers; some downstream `value || 9999` fallbacks make zero undesirable. Prefer 10, 20, 30 while drafting, or 1, 2, 3 after arrow reordering.
- Up/down applies to Sections, Schedule, Timeline, Rule Book, Dining, Local Guide and Contacts; moving one item renumbers that collection 1…N. Course/round/format panes do not have these order controls.
- Schedule sorts by actual event date/start time first, then display order. Moving dinner above breakfast numerically does not make it earlier chronologically.
- Sections order does **not** reorder the public page or participant directory. Both layouts use fixed supported destinations. Slugs supply section-description lookups, not arbitrary new navigation.
- Public Rule Book groups by Category; participant rules consolidate using format/category/content heuristics. Review both surfaces.
- Participant Local Guide uses fixed category order: Transportation, Airport & Hotel, Essentials, Medical & Emergency, Other; Sort order operates within that grouping. An arbitrary Section name does not guarantee a new named accordion.
- Contacts order feeds grouping by Category; keep categories spelled consistently. Dining groups by day; order is not a substitute for dates.

## PARTICIPANT EXPERIENCE

| Entry | Public website | Participant/PWA |
|---|---|---|
| Overview | `/tournament-guide` header/overview | `/app/guide` hero |
| Sections | Descriptions for supported anchored areas, not a page builder | Fixed directory labels/routes; not arbitrary authorable tiles |
| Schedule | Conditional Schedule anchor/day/event cards | `/app/guide/schedule`, dated itinerary |
| Timeline | Not the public Guide’s main itinerary | Home timeline projection; Display on Home controls eligibility |
| Rules / format prose | `/tournament-guide#rules`, disclosures | `/app/guide/rules`, format summaries and grouped rules |
| Courses | `/courses` and course detail | `/app/courses` and stable Course-ID details |
| Dining | Conditional Dining cards | `/app/guide/dining`, meal/day presentation |
| Local Guide | Conditional resource cards | `/app/guide/getting-around`, category disclosures; Directions/Call/Website |
| Contacts | Conditional contact cards | `/app/guide/contacts`, grouped action cards |

Public `/tournament-guide/schedule`, `/rules`, `/dining`, `/getting-around`, `/contacts` routes redirect to the corresponding public root anchor. They do not route public visitors into PWA. The participant directory always offers its six destinations, even when a destination contains no published information.

**Live observations:** public root currently has only Overview and Rules navigation; participant Guide has six directory links. Participant Schedule displays “Published tournament information will appear here when available.” The participant Courses list shows all three expected names/logos/rounds. Public Best Ball disclosure expands but has no authored body. Participant rules show fallback summaries and the outdated sentence “combined from the existing workbook.”

**Responsive/accessibility audit:** live Director and public Guide inspected at effective 1280px; document scroll width also 1280px, with no desktop document overflow. Director fields have labels and keyboard-capable native controls; sections scroll locally. Existing CSS collapses the toolbar/workspace below 900px and forms below 620px; participant directory/cards also have mobile breakpoints. A requested 390px browser override did not take effect—the DOM remained 1280px—and was reset. Therefore **live mobile visual acceptance is not certified**. Several measured Director controls were about 37–38px tall, so 44px touch targets are not guaranteed. No draft was created to exercise an empty-domain form or publication modal live; those were traced in code instead.

## CONFUSING UX FINDINGS

Classification: A clear; B usable but confusing; C should improve; D functional defect.

| Class | Finding | Owner-facing consequence |
|---|---|---|
| D | Create/Save Draft invokes all-seven-area participant completeness | Cannot reliably save one logistics area at a time |
| D | Overview primary-key-only form ignores populated imported aliases | Annual label / Dates misleadingly blank; public and editor appear contradictory |
| D | Stored `Round 1` interpolated as `Round ${value}` publicly | “ROUND ROUND 1”; legacy Current value also duplicates the canonical Round selector choice |
| C | Actual Guide name missing; required marker not clear | First save can fail although the public page already has a title |
| C | Guide dates vs blank operational dates/timezone not clearly separated | Entering banner copy can be mistaken for completing Setup; runtime time interpretation remains unresolved |
| C | Schedule and Timeline are parallel lists with no auto-link | Duplicate entry and drift risk; need explicit owner instructions |
| C | No dedicated Golf Genius / custom link-label / current Sensitive controls | Legacy instructions do not match installed authoring capabilities |
| C | “Sections” looks like navigation authoring, but nav/order are fixed | Adding/reordering a section may have no expected visible result |
| C | Public and participant Rule Book grouping differ | Category/order alone does not guarantee placement; preview is not WYSIWYG |
| C | Course-bound schedule can override Location/Subtitle; title digits can imply round | Important logistics may be hidden or incorrectly bound |
| C | Notification minutes has no demonstrated delivery consumer | Owner could assume reminders will be sent |
| B | Three rules-related tabs overlap | Duplication of policies; only some fields are automatically summarized |
| B | Item Published versus whole Guide Publish Revision | Status changes alone do not go live; other collections lack a private item state |
| B | `GOOGLE_SYNCHRONIZATION` and workbook copy | Misleading implication of current Google authority |
| B | Completed Player Draft above editorial Guide | “Correction required” belongs to a different card and may distract from Guide work |
| C | Missing required-field hints, mixed free text/selector conventions, optional order decimals | Owner must understand server validation instead of simply filling a guided form |
| C | Mobile action size and live mobile layout unverified | Do not certify mobile usability from CSS alone |
| A | Explicit Save / Validate / Preview / Publish separation and confirmations | Good publication safety when the document is valid |
| A | Canonical scoring-course fields not editable; contact privacy notice | Good authority/privacy boundary |

No correction was implemented. These are bounded findings, not permission to refactor the Guide or change operational facts.

## CLAY’S 2026 GUIDE ENTRY PLAYBOOK

### STEP 0 — Prepare a complete content packet before editing

**Not ready yet:** answer the missing-information checklist below. Agree which material is public. Resolve the date/timezone ambiguity through a separately scoped operational task if needed. Keep the actual course/tee/hole facts unchanged.

Choose one path before starting:

- **Installed path:** prepare real content for all seven required areas, then assemble/save the complete unpublished bundle. Do not depend on incremental saves of partial logistics.
- **Recommended UX follow-up:** separately authorize relaxing draft-only completeness while retaining publication checks. This audit did not implement that change.

### STEP 1 — Overview

Go to Director → Draft & Guide → **Tournament Guide** → Overview. Confirm Tournament 2026 / current revision 1 / no other Director’s open draft.

For the future authorized content-entry session, enter:

- Tournament name → `Sandbagger Invitational`.
- Annual label → `10th Annual Sandbagger Invitational` (already present under the imported alias).
- Dates → `September 25–26, 2026` (already present as display copy).
- Destination → leave `Kiawah Island`.
- Annual image → leave `sandbagger-2026`; Website hero → leave `ocean-course`.
- Start/End date → use September 25/26 only after confirming these are the intended structured tournament dates, not travel dates.
- Time zone → confirm the intended local-time policy; do not silently copy the Chicago fallback.
- Location / Mobile hero → optional; leave blank unless approved content/assets are available.

Do not edit scope or enter tees/ratings/handicaps here. Participant sees header/identity. **Scoring impact: NONE.** Creating a Guide draft is a future write; none was performed in this audit.

### STEP 2 — Sections

Click Sections → Add. Define introductions only for supported destinations you will populate. Example: Section ID `2026-overview`, Name `Overview`, Slug `overview`, Description = Clay’s welcome copy, Display order 1. Recognized description slugs include `overview`, `itinerary`/`schedule`, `rules`, `dining`, `local-guide`/`getting-around`, `contacts`/`important-contacts`.

Use unique IDs/slugs, real descriptions and deliberate item Status. Do not expect Name/Slug/order to create or reorder navigation. Participant sees supported introductory copy, not arbitrary new pages. **Scoring impact: NONE.**

### STEP 3 — Schedule / Itinerary

Click Schedule / Itinerary → Add for each confirmed event. Use the ten-row template above as a checklist, not as a directive to invent all ten events. Supply actual dates/start times. Bind R1→TPGC01, R2→CPGC01, R3→OCGC01 with selectors. Keep non-golf Round/Course blank.

Use Details for meetup/pickup/venue-room instructions. Preserve the known first-tee times unless an independently authorized operational update changes them. Leave the already completed Player Draft alone; include a historical July entry only if wanted.

Participant sees chronological day/event cards. **Scoring impact: NONE; no match time/assignment changes.**

### STEP 4 — Timeline

Click Timeline → Add for the genuine events intended for Home. Manually mirror the confirmed date/time/title/location from Schedule. Display on Home → checked only when intended. Status override → normally blank; it does not change golf lifecycle. Leave Notification minutes blank unless a separate notification requirement has been verified.

There is no automatic Schedule-to-Timeline copy. Keep the two lists synchronized. The installed validation expects Timeline content once the participant Guide is populated. If Home events are not wanted, use only genuine content and clarify this requirement rather than inventing an event. **Scoring impact: NONE.**

### STEP 5 — Rule Book

Click Rule Book → Add for each confirmed rule. Enter unique Rule ID, Category, Title, exact Body, order, optional Subcategory, Effective year 2026. Important only for genuinely prominent notices. Use the category plan above.

Draft = not included; Published = eligible for inclusion when the whole Guide is published. Do not manufacture concessions, mulligans, local rules, tie procedures, penalties or side-game amounts. Participant sees expandable rules. **Scoring impact: NONE.**

### STEP 6 — Tournament Rules / Rounds Presentation

**Already populated — leave structural values alone:** BB/SC/SI, team sizes, current point splits. Add approved round-specific prose in Tournament Rules and reusable format prose in Rounds Presentation only when needed. Do not enter the same rule three times. Use the canonical selector choices for any newly authored references; do not perform an incidental rewrite of retained rows during this audit.

Review public and participant grouping, including fallback summary wording. **Scoring impact: NONE; these are not handicap/points configuration controls.**

### STEP 7 — Courses

**Automatically derived — do not duplicate:** Gold/Black tees, 71.9/72.7/74.7 ratings, 136/138/150 slopes, par72, 18-hole definitions and Stroke Index.

**Already populated — leave alone:** all three course rows, names, round/format associations, websites, designer/opening year, logos/profile assets. Optional: add verified arrival/GPS instructions or owner-approved editorial copy. Empty copy can already use static course-detail fallbacks.

Participant sees the course directory/details; Guide root reports three venues. **Scoring impact: NONE.**

### STEP 8 — Dining

Click Dining → Add. Enter Day, Meal, confirmed Location and order; add service times, Cuisine, Dress code, Reservation required and public-safe Notes where known. No row status exists: all Dining rows accompany the next publication. Do not enter an unconfirmed booking as a fact.

For a timed meal, add/maintain its separate itinerary event. Participant sees meals by day. **Scoring impact: NONE.**

### STEP 9 — Local Guide, lodging and transportation

Click Local Guide → Add. Use Section `Transportation`, `Lodging`/`Resort`, or another appropriate category. Enter a useful Title, confirmed instructions, address, business phone, verified website, and order. Website renders an actionable generic button; body text is not a rich-link editor.

If Golf Genius is required, use the documented generic alternative only for intentionally public-safe information. Otherwise leave it out pending a dedicated workflow decision. Do not put access codes/private accommodation information in this public content. **Scoring impact: NONE.**

### STEP 10 — Contacts and optional side-game explanation

Click Important Contacts → Add. Enter Category, consenting/public contact Name, Role, action details and order. Enable Text only if appropriate. There is no private toggle.

Optional approved Calcutta/Skins explanation belongs in Rule Book or an informational resource, not a financial configuration operation. If plans are undecided, omit policy claims. Guide Awards ceremony logistics do not create actual Awards. **Scoring impact: NONE.**

### STEP 11 — Save the complete private draft

Review every collection for blank accidentally added rows, duplicate logical IDs and unintended public details. Enter Draft note, e.g. `Prepare verified 2026 participant logistics and rules`.

Under the current installed completeness rule, ensure all seven required participant areas have genuine eligible content together. Set Sections/Schedule/Rule Book entries intended for publication to Published in the **private draft**; they still do not go live merely because the item says Published.

Click **Create Guide Draft** (or Save Draft Changes if a draft already exists). Require the explicit saved message and the Open draft version to update. If it fails, stop; do not assume the text is safe in Supabase. Do not use the unrelated Player Draft card.

### STEP 12 — Validate and Preview

Click **Validate** on the saved version. Resolve every reported issue; after changes, Save and Validate again. If Setup or another Director’s draft changed, refresh/review rather than overwriting stale state.

Click **Preview**. Check only intended content appears; dates/times/links/contact privacy are correct; rules do not duplicate/conflict; canonical courses are unchanged. Preview is a sanitized content summary, not a promise of identical mobile layout. Do not proceed while a required policy or logistics value is unknown.

### STEP 13 — Publish only the reviewed revision

At a separately authorized content-entry/publication session, click **Publish Revision** and confirm. This creates the next immutable Guide revision and atomically changes participant/public reads. It does not change Setup, scoring, Player Draft, handicap, Awards, Odds or side-game authority.

Verify afterward: public `/tournament-guide` and participant Guide destinations show the intended revision’s content; chronology and local times agree; course facts remain unchanged; contact links are appropriate; no private information appears; mobile layout is checked on an actual effective mobile viewport. Review Guide revision history. Stop after Guide work—do not use publication as a reason to configure matches or side games.

## INFORMATION STILL NEEDED FROM CLAY

You can answer this checklist directly in chat:

1. Which **calendar date** is each of R1, R2 and R3? Confirm the existing tee-time blocks above are still intended, and whether all local times should be Eastern (`America/New_York`). No need to resend course/tee/rating/slope/par/holes.
2. Arrival/check-in and departure/check-out dates, times, venues and instructions; lodging name/address and only public-safe access guidance.
3. Breakfast/lunch/dinner plans: day, location, time/window, reservation status, dress code and approved notes.
4. Transportation/pickup/transfer details and which events should also appear on Home.
5. Exact 2026 policy text for general rules, BB, Scramble, Singles, tiebreakers, pace, concessions and local rules—or identify which categories are intentionally unnecessary.
6. Whether Golf Genius is needed; if so, verified URL, instructions, intended code and whether it is public-safe. No restricted code should be posted in public Guide.
7. Awards ceremony date/time/location, if planned. The completed July Player Draft is already known; say whether to omit it from weekend logistics or include it as history.
8. Consenting/public tournament, resort, transportation and emergency contacts to list, including whether texting is appropriate.
9. Optional welcome/section-introduction copy and any desired course-specific logistics. Existing course assets/details need not be supplied again.
10. Whether any Calcutta/Skins explanation should appear before configuration. Provide approved policy/amounts only if finalized; otherwise these can wait.

## Appendix A — Complete editable-field dictionary

### Reading this dictionary

Each group specifies its JSON path under `authoring_content`; publication preserves this in `guide_authoring_revisions_v1` and emits its safe projection. **Every field below has scoring-write impact NONE.** Nothing here changes Setup/handicap/match/side-game authority. Private Draft note is the exception to eventual public content, not to scoring isolation.

`R` = required for a valid authored row (even when item status is Draft); `O` = optional; `A` = protected/automatically supplied. `P` = participant/public text or action; `M` = projection/routing/display metadata rather than standalone visible copy; `H` = Home presentation; `D` = Director-private. All P/M/H values must be treated as public-safe on publication—M does **not** mean secret. Unknown examples in brackets are instructions to obtain a value, not literal valid entries.

Common formats: plain text (no HTML/scripts/control characters); prose up to 20,000 UTF-8 bytes, ordinary scalar text up to 2,000; identifiers up to 128. URL fields accept safe HTTP(S)/domain form; prefer a complete HTTPS URL. Asset fields reference existing safe asset identifiers/relative paths or HTTP(S) assets; they are not upload controls. Dates use real 2026 ISO dates; times use a valid clock value. Contact details require intentional public permission.

### Overview — `tournament`

| UI label → key | Req. | Purpose / format | Visibility | Example / instruction |
|---|---|---|---|---|
| Tournament ID → `Tournament ID` | A | Protected exact scope | M | 2026; server fills current blank |
| Year → `Year` | A | Tournament year | M/P | 2026 |
| Tournament name → `Tournament Name` | R | Guide title/name, text; `Name` accepted as legacy alternative | P | Sandbagger Invitational |
| Annual label → `Tournament Edition` | O | Edition caption; legacy `Annual` still read | P | 10th Annual Sandbagger Invitational |
| Dates → `Tournament Dates` | O | Human-readable date label; legacy `Dates` still read | P | September 25–26, 2026 |
| Destination → `Destination` | O | Destination label | P | Kiawah Island, already present |
| Location → `Location` | O | Alternative location presentation | P | [Confirmed venue detail, if needed] |
| Start date → `Start Date` | O | Structured Guide date, ISO; not Setup write-through | M | 2026-09-25 after confirmation |
| End date → `End Date` | O | Structured Guide date, ISO | M | 2026-09-26 after confirmation |
| Time zone → `Time Zone` | O | Timezone presentation metadata, IANA intended; runtime live context may take precedence | M | Confirm America/New_York, do not inherit Chicago blindly |
| Tournament logo / annual image → `Annual Image` | O | Existing image reference | P | sandbagger-2026 |
| Website hero image → `Hero Image` | O | Hero asset consumed where supported | P | ocean-course |
| Mobile hero image → `Mobile Hero Image` | O | Optional mobile alternative; blank uses existing fallback | P | Leave blank unless a verified asset exists |

### Sections — `overview[]`

| UI label → key | Req. | Purpose / format | Visibility | Example |
|---|---|---|---|---|
| Section ID → `Section ID` | R | Stable unique text ID | M | 2026-overview |
| Name → `Section Name` | O | Authoring label; does not rename fixed navigation | M | Overview |
| Slug → `Section Slug` | R | Unique lower-case hyphenated lookup key | M | overview |
| Description → `Description` | R | Introductory prose for supported section | P | [Clay’s welcome paragraph] |
| Display order → `Display Order` | R | Non-negative number; does not reorder page shell | M | 1 |
| Status → `Status` | O/default Draft | Draft / Published / Archived / Cancelled; inclusion filter | M | Draft while preparing |

### Schedule / Itinerary — `schedule[]`

| UI label → key | Req. | Purpose / format | Visibility | Example |
|---|---|---|---|---|
| Event ID → `Event ID` | R | Unique stable ID | M | round-1 |
| Event date → `Event Date` | R | Real date; not inferred | P/M | [Confirmed R1 date] |
| Day label → `Day Label` | R | Day caption consistent with date | P/M | [Friday or Saturday, confirmed] |
| Start time → `Start Time` | R | Valid clock text | P/M | 07:30, existing R1 first tee, date/zone pending |
| End time → `End Time` | O | Optional end clock | P/M | [Confirmed end], otherwise blank |
| Event type → `Event Type` | R | Event classification text | P/M | Golf |
| Title → `Title` | R | Event heading | P | Round 1 |
| Subtitle → `Subtitle` | O | Secondary copy; bound format can supersede it | P | Best Ball |
| Location → `Location` | O | Meeting/location text; bound course can supersede it | P | Turtle Point Golf Course |
| Details → `Details` | O | Full participant instructions | P | [Confirmed bag-drop/meeting instructions] |
| Round ID → `Round ID` | O | Canonical selector, not a new round | M | Round 1 · BB |
| Course ID → `Course ID` | O | Canonical selector / generated course link | M/P | TPGC01 |
| Display order → `Display Order` | R | Tie-breaker after chronology | M | 40 |
| Status → `Status` | O/default Draft | Publication inclusion, not live scoring state | M | Draft until final bundle review |
| Featured → `Featured` | O | Checkbox; visual highlight | P/M | Check only for a featured event |

### Timeline — `timelineRows[]`

| UI label → key | Req. | Purpose / format | Visibility | Example |
|---|---|---|---|---|
| Tournament day → `Tournament Day` | O | Home day caption | H | [Confirmed weekday] |
| Event date → `Event Date` | R | Real date | H/M | [Confirmed R1 date] |
| Start time → `Start Time` | R | Valid clock | H/M | 07:30 only after date/zone review |
| End time → `End Time` | O | Valid end clock | H/M | Blank if unknown |
| Event type → `Event Type` | O | Classification; golf status follows canonical round | H/M | Golf |
| Title → `Title` | R | Timeline heading / inferred round matching | H | Round 1 |
| Subtitle → `Subtitle` | O | Secondary timeline copy | H | Best Ball |
| Location → `Location` | O | Timeline location | H | Turtle Point Golf Course |
| Display on Home → `Display on Home` | O | Checkbox eligibility | M | True only if intended |
| Notification minutes → `Notification Minutes` | O | Numeric metadata; delivery not demonstrated | M | Leave blank |
| Sort order → `Sort Order` | R | Numeric timeline ordering | M | 1 |
| Status override → `Status Override` | O | Blank/Upcoming/Live/Completed/Complete/Delayed/Cancelled/Canceled | H/M | Blank for normal derivation |

Year is supplied from tournament scope, not a separate visible field.

### Rule Book — `ruleBook[]`

| UI label → key | Req. | Purpose / format | Visibility | Example |
|---|---|---|---|---|
| Rule ID → `Rule ID` | R | Stable unique rule ID | M | 2026-general-conduct |
| Category → `Category` | R | Rule grouping text | P/M | GENERAL |
| Subcategory → `Subcategory` | O | Additional grouping/caption | P/M | Conduct |
| Title → `Title` | R | Disclosure heading | P | Tournament conduct |
| Body → `Body` | R | Exact approved policy prose | P | [Clay-approved text] |
| Display order → `Display Order` | R | Rule order within rendering groups | M | 10 |
| Status → `Status` | O/default Draft | Publication filter | M | Draft until ready |
| Effective year → `Effective Year` | O | Rule-year metadata, not scoring revision | M | 2026 |
| Important → `Important` | O | Checkbox; emphasizes/opens where supported | P/M | True for an important approved notice |

### Tournament Rules — `tournamentRules[]`

All entries refer to existing rounds; no individual status/order control.

| UI label → key | Req. | Purpose / format | Visibility | R1 example / instruction |
|---|---|---|---|---|
| Round → `Round` | R | Canonical round selector | M/P | Existing R1; avoid unrelated change |
| Format → `Format` | R | Format code validated against reference | M/P | BB |
| Team size → `Team Size` | O | Presentation number | P/M | 2, leave alone |
| Points available → `Points Available` | R | Displayed point total, numeric text | P | 3, leave alone |
| Front 9 used → `Front 9 Used` | O | Presentation checkbox | P/M | True |
| Back 9 used → `Back 9 Used` | O | Presentation checkbox | P/M | True |
| Overall used → `Overall Used` | O | Presentation checkbox | P/M | True |
| Front 9 points → `Front 9 Points` | O | Numeric presentation | P/M | 1 |
| Back 9 points → `Back 9 Points` | O | Numeric presentation | P/M | 1 |
| Overall points → `Overall Points` | O | Numeric presentation | P/M | 1 |
| Description → `Description` | O | Round introduction | P | [Approved R1 description] |
| Rules → `Rules` | O | Round-specific rules prose | P | [Approved R1 instructions] |
| Handicap copy → `Handicap Allocation` | O | Explanation, never a formula setting | P | [Reviewed explanation of existing BB policy] |
| Scoring presentation → `Scoring Format` | O | Summary label | P | Nassau Match Play, only if deliberately documenting existing behavior |
| Match format copy → `Match Format` | O | Additional format explanation | P | [Approved description] |

### Rounds Presentation — `rounds[]`

| UI label → key | Req. | Purpose / format | Visibility | Example / instruction |
|---|---|---|---|---|
| Format ID → `Format ID` | R | Stable format identity | M | BB; preserve existing |
| Name → `Name` | R | Human-readable format | P | Best Ball |
| Team size → `Team Size` | R | Numeric presentation | P/M | 2 |
| Description → `Description` | O | Reusable format introduction | P | [Approved description] |
| Rules → `Rules` | O | Reusable format rules | P | [Approved policy; avoid Rule Book duplicates] |
| Handicap copy → `Handicap Allocation` | O | Explanatory text | P | [Reviewed existing-policy explanation] |
| Scoring presentation → `Scoring Format` | O | Summary label | P | [Approved label] |
| Match format copy → `Match Format` | O | Format wording | P | [Approved wording] |

### Dining — `dining[]`

| UI label → key | Req. | Purpose / format | Visibility | Example |
|---|---|---|---|---|
| Day → `Day` | R | Meal day text, not a date picker | P/M | [Confirmed Friday/Saturday] |
| Meal → `Meal` | R | Meal name; part of unique Day+Meal identity | P | Dinner |
| Cuisine → `Cuisine` | O | Food description | P | [Confirmed cuisine] |
| Start time → `Start Time` | O | Service/reservation clock | P | [Confirmed time], or blank |
| End time → `End Time` | O | Service end | P | [Confirmed time], or blank |
| Location → `Location` | R | Confirmed venue | P | [Restaurant name] |
| Dress code → `Dress Code` | O | Venue policy | P | [Confirmed requirement] |
| Reservation required → `Reservations Required` | O | Checkbox; not a booking action | P/M | Check only if confirmed |
| Notes → `Notes` | O | Public-safe reservation/meal details | P | [Confirmed group instructions] |
| Sort order → `Sort Order` | R/default available | Numeric order | M | 10 |

### Local Guide — `localGuide[]`

| UI label → key | Req. | Purpose / format | Visibility | Example |
|---|---|---|---|---|
| Section → `Section` | R | Group text; participant normalizes known categories | P/M | Transportation |
| Title → `Title` | R | Resource heading; unique with Section | P | [Confirmed shuttle/resource name] |
| Description → `Description` | O | Participant instructions | P | [Confirmed instructions] |
| Address → `Address` | O | Address used for Directions | P | [Verified public address] |
| Phone → `Phone` | O | Valid phone text, public-safe | P | [Verified business number] |
| Website → `Website` | O | Safe URL; generic Website action | P | [Verified HTTPS URL] |
| Sort order → `Sort Order` | R/default available | Order inside grouping | M | 10 |

### Important Contacts — `importantContacts[]`

| UI label → key | Req. | Purpose / format | Visibility | Example |
|---|---|---|---|---|
| Category → `Category` | R | Contact grouping | P | Tournament |
| Name → `Name` | R | Consenting/public contact | P | [Confirmed contact name] |
| Role → `Role` | O | Contact purpose | P | Tournament Director |
| Phone → `Phone` | O | Valid public-safe phone | P | [Consented number] |
| Text enabled → `Text Enabled` | O | Adds participant Text action where supported | P/M | True only when appropriate |
| Email → `Email` | O | Valid public-safe email | P | [Consented address] |
| Website → `Website` | O | Safe contact URL | P | [Verified URL] |
| Sort order → `Sort Order` | R/default available | Order/group sequence | M | 10 |

All Contacts are potentially sensitive personal data; only intentionally public contacts belong here. No current Sensitive control exists.

### Courses — `courses[]`

| UI label → key | Req. | Purpose / format | Visibility | Example / instruction |
|---|---|---|---|---|
| Canonical Course ID → `Course ID` | R | Select an existing course, not create one | M | CPGC01; preserve existing |
| Round → `Round` | R | Select canonical round | M/P | Round 2 |
| Format → `Format` | R | Canonical-compatible code | M/P | SC |
| Course name → `Course` | R | Presentation name | P | Cougar Point Golf Course |
| City → `City` | O | Location text | P | Kiawah Island |
| State → `State` | O | Location text | P | SC |
| Destination → `Destination` | O | Destination presentation | P/M | Kiawah Island |
| Year opened → `Year Opened` | O | Historical editorial fact | P | 1976 |
| Designer → `Designer` | O | Architect credit | P | Gary Player |
| Website → `Website` | O | Verified external course site | P | Existing Cougar Point website |
| Course logo → `Course Logo` | O | Existing asset reference | P | cougar-point-logo |
| Course profile image → `Course Profile Image` | O | Existing asset reference | P | cougar-point-profile |
| GPS link → `GPS Link` | O | Safe directions URL; consumer-dependent | P/M | [Verified URL], currently blank |
| Overview → `Course Overview` | O | Authored course intro overrides editorial fallback | P | [Approved optional prose] |
| Playing tips → `Playing Tips` | O | Optional advice | P | [Approved optional prose] |
| Signature holes → `Signature Holes` | O | Optional hole highlights, not hole facts | P | [Verified optional description] |
| History → `History` | O | Editorial course history | P | [Approved optional prose] |
| Notes → `Course Notes` | O | Additional editorial/history fallback copy; not a private field | P | [Public-safe optional note] |

### Shared private field

| UI label → request field | Req. | Purpose / format | Visibility | Example |
|---|---|---|---|---|
| Draft note → `reason` | O/default reason | Bounded audit explanation, max 500 characters; no raw secrets/HTML | D | Prepare verified 2026 participant logistics and rules |

## Evidence and verification notes

Local source references:

- [Director fields and controls](/Users/claybeltran/Developer/BaggerInv/app/admin/director/ProductionGuideEditor.js:23)
- [Authoring schema / required fields](/Users/claybeltran/Developer/BaggerInv/lib/production-guide-authoring-contract.js:122)
- [Stage-time full projection validation](/Users/claybeltran/Developer/BaggerInv/lib/production-guide-authoring-contract.js:728)
- [All-seven-participant-areas gate](/Users/claybeltran/Developer/BaggerInv/lib/tournament-guide-projection.js:632)
- [Server operations and trusted canonical context](/Users/claybeltran/Developer/BaggerInv/lib/production-guide-authoring-server.js:414)
- [Director route authorization and errors](/Users/claybeltran/Developer/BaggerInv/app/api/director/guide/route.js:31)
- [Storage / immutable revision / current pointer contracts](/Users/claybeltran/Developer/BaggerInv/supabase/production_migrations/202608310082_production_guide_authoring_v1.sql:41)
- [Production read-source selection](/Users/claybeltran/Developer/BaggerInv/lib/guide-read-source.js)
- [Public/participant model resolver](/Users/claybeltran/Developer/BaggerInv/app/tournament-guide/resolveGuideContent.js:60)
- [Public renderer](/Users/claybeltran/Developer/BaggerInv/app/tournament-guide/PublicTournamentGuide.js)
- [Participant detail renderer](/Users/claybeltran/Developer/BaggerInv/app/tournament-guide/GuideDetailPage.js)
- [Schedule clock, bindings and ordering](/Users/claybeltran/Developer/BaggerInv/lib/tournament-guide-schedule.js:78)
- [Timeline lifecycle / metadata](/Users/claybeltran/Developer/BaggerInv/lib/tournament-timeline.js:140)
- [Rules fallback summaries](/Users/claybeltran/Developer/BaggerInv/lib/rules-format-summary.js:4)
- [Local Guide grouping](/Users/claybeltran/Developer/BaggerInv/lib/tournament-guide-local.js:3)
- [Contact grouping/actions](/Users/claybeltran/Developer/BaggerInv/lib/tournament-guide-contacts.js:15)
- [Course editorial fallbacks](/Users/claybeltran/Developer/BaggerInv/lib/course-detail.js:67)
- [Operational metadata UI](/Users/claybeltran/Developer/BaggerInv/app/admin/director/ProductionTournamentSetupPanel.js:60)

Verification: authenticated Production UI inspection; three read-only SELECTs of the published Guide, canonical context/counters and final no-change state; public/participant rendering inspection; nine existing Guide-authoring application tests passed; isolated in-memory normalization checks reproduced the save issues. A dictionary completeness check matched all 121 visible field definitions to Appendix A. `git diff --check` passed; the new report also has no trailing whitespace. Final Guide revision remained 1 with the same content fingerprint; drafts/receipts/audit events remained 0/0/0 and Setup revision remained 3. No Production write endpoint was exercised. No implementation changes or Production build were necessary. Local report only; not committed/pushed. The pre-existing untracked `launch-video/` directory was untouched.

2026 TOURNAMENT GUIDE: INCOMPLETE

TOURNAMENT SETUP COURSE DATA: READY

GUIDE ITINERARY: INCOMPLETE

GUIDE RULES: INCOMPLETE

GUIDE LOGISTICS: INCOMPLETE

GUIDE PUBLICATION: NOT READY

SCORING IMPACT OF GUIDE EDITS: NONE

PRODUCTION MUTATIONS: 0
