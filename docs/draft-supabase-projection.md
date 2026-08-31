# Draft Supabase Projection and Authoring Contract

Step 13E.8B makes the Production Director Console the Draft authoring surface.
Directors stage, validate, review, and commit bounded tournament-scoped Draft
revisions in Supabase. Installing the authoring workflow does not create a
revision or change an existing configuration, pick, status, or current pointer.
The valid Google-imported Production revisions remain unchanged and retain
their Google synchronization provenance.

Production public, participant, and Director reads use the canonical Supabase
Draft projection with no foreground Google request or Google fallback. The
Google `Draft Settings` and `Draft Picks` tabs remain historical,
non-authoritative records. Preview may retain its isolated Google authoring and
explicit two-tab synchronization workflow.

## Consumers

| Consumer | Facts | Derived inputs | Current source |
| --- | --- | --- | --- |
| `/draft` | Current configuration, picks, teams, players | Current Draft analysis | Bounded Supabase Draft read plus canonical History and Published Odds |
| `/draft/[year]` | One recorded Draft revision | Year analysis | Year-addressed Supabase Draft read plus canonical History and Published Odds |
| `/draft/analytics` | Recorded Draft years and picks | DVS, captain/player summaries, trends | Supabase Draft plus request-local canonical History/Statistics |
| Player Profile | A player's selected picks | Finish and DVS | Bounded `PLAYER` Draft scope plus canonical profile History |
| History year page | Recorded Draft-year availability | None | Bounded Supabase Draft read |
| Sitemap | Recorded Draft years | None | Bounded Supabase Draft read |

No homepage or participant PWA component currently consumes Draft facts. The
Production Admin CMS Draft tab now shows a legacy/non-authoritative notice and
routes Directors to the Supabase-native editor.

## Draft Setup

The existing semantics remain `Year`, `Draft Name Override`, `Draft Date`,
`Draft Time`, `Time Zone`, `Draft Location`, `Draft Status Mode`, `Draft
Format`, `Total Picks`, `Team 1 ID`, `Team 2 ID`, `Team 1 Captain Player ID`,
`Team 2 Captain Player ID`, `First Pick Team ID`, and `Notes`. The legacy
Google import also retains `Updated At` and `Updated By` as source provenance;
the Director does not edit those values.

Year, total picks, two distinct canonical Teams, captain identities when
present, and first-pick Team are validated against the exact tournament.
Date, time, time zone, location, name, status, format, and notes remain
lossless strings, so values such as `7/12/2026`, `7:00 PM`, and `CST` are not
silently coerced. Draft Setup consumes canonical tournament Team and roster
facts and never mutates them.

## Draft Board and Picks

The existing pick semantics remain `Year`, `Pick Number`, `Team ID`, `Player
ID`, `Selected At`, `Selected By`, and `Notes`. Pick numbers must be unique,
contiguous, and within the configured total. Selected Players use stable
Player IDs, must be active in the canonical tournament roster and assigned to
the selected Team, and may appear only once. Captains cannot also be selected
as Draft picks.

Projection retains deterministic `round_number`, `pick_within_round`, and
explicit `PENDING` or `SELECTED` evidence. `Team ID` remains authoritative for
the actual selecting Team; a retained Director-approved trade or order
override is diagnosed rather than rewritten from the default `Snake`
configuration. Selection timestamps and actor provenance are server-owned and
are not editable in the Console.

## Recorded historical coverage

The preserved Google-imported projection contains settings and 22 selections
for 2025 and settings and 22 selections for 2026. No earlier year is projected
or fabricated. The raw 2025 `CRIPSYBOYS` source value remains in provenance
while the certified canonical Team ID is `CRISPYBOYS`.

## Revision workflow and mutability

Each tournament has its own append-only revisions and current pointer. A
Director edit follows `Edit → Validate → Review Changes → Save Revision`.
Mutations require the exact predecessor revision, a stable operation request
identity, a canonical payload hash, and same-key/same-payload idempotency.
Same-key/different-payload reuse is rejected. Privileged table transport stays
server-only; clients do not write Draft tables directly.

Mutable setup and in-progress Drafts may advance through complete reviewed
revisions. A completed, fully selected, frozen, historical, or archived Draft
is read-only in the ordinary workflow and returns `CORRECTION_REQUIRED`.
Step 13E.8B does not install a historical correction operation. Existing
history is never rewritten merely to make the Console editable.

Canonical roster or Team changes that conflict with an existing Draft are
reported as a dependency-readiness conflict. They do not silently remove a
drafted Player, change a pick, or rewrite history.

## Annual isolation and copy

Reads and mutations are scoped to one exact tournament. Current and future
tournaments have independent setup, picks, current pointers, staged revisions,
and history. Copy Previous Draft Setup is available only for a mutable future
tournament and uses its immediately preceding year. It creates a review draft,
not a current revision, and copies no selected Player, completed status,
selection timestamp, or historical audit fact. Copied Team and captain defaults
must validate against the target tournament.

## Production and Preview source contract

Production hard-resolves Draft reads and Director authoring to Supabase. The
retired Production Google synchronization and Admin CMS mutation paths return a
typed retirement response before acquiring Google credentials or transport.
Later edits to the Google Draft tabs cannot change Production Draft state.

`DRAFT_READ_SOURCE=google|supabase` and the Google two-tab synchronization
adapter remain Preview-only compatibility boundaries. Preview requires its
isolated non-Production project and workbook. Guide synchronization is
unchanged and remains the sole Production Google human-authoring workflow.
