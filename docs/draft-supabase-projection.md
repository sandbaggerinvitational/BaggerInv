# Draft Supabase Projection Contract

Step 8 keeps Google Sheets as the Tournament Director authoring authority and
projects the two Draft tabs into immutable, tournament-scoped Supabase
revisions. Application routes never write Draft facts and the Supabase read
path has no Google or bundled-data fallback.

## Consumers

| Consumer | Facts | Derived inputs | Step 8 source |
| --- | --- | --- | --- |
| `/draft` | Current configuration, picks, teams, players | Current Draft analysis | Bounded Supabase Draft read plus canonical History and Published Odds |
| `/draft/[year]` | One recorded Draft revision | Year analysis | Bounded Supabase Draft read plus canonical History and Published Odds |
| `/draft/analytics` | Recorded Draft years and picks | DVS, captain/player summaries, trends | Supabase Draft plus request-local canonical History/Statistics |
| Player Profile | A player's selected picks | Finish and DVS | Bounded `PLAYER` Draft scope plus canonical profile History |
| History year page | Recorded Draft-year availability | None | Bounded Supabase Draft read |
| Sitemap | Recorded Draft years | None | Bounded Supabase Draft read |

No homepage or participant PWA component currently consumes Draft facts. The
Admin CMS remains the only Draft writer and continues writing Google first.

## Draft Settings

The exact source fields are `Year`, `Draft Name Override`, `Draft Date`, `Draft
Time`, `Time Zone`, `Draft Location`, `Draft Status Mode`, `Draft Format`,
`Total Picks`, `Team 1 ID`, `Team 2 ID`, `Team 1 Captain Player ID`, `Team 2
Captain Player ID`, `First Pick Team ID`, `Notes`, `Updated At`, and `Updated
By`. Year, total picks, two distinct canonical teams, captain identities when
present, and first-pick team are validated. Date, time, zone, location, name,
status, format, notes, and source audit values remain lossless strings so the
storage migration does not invent new Draft rules.

## Draft Picks

The exact source fields are `Year`, `Pick Number`, `Team ID`, `Player ID`,
`Selected At`, `Selected By`, `Notes`, `Updated At`, and `Updated By`.
Projection adds deterministic `round_number`, `pick_within_round`, and an
explicit `PENDING` or `SELECTED` evidence state. Pick numbers must be unique,
contiguous, and in range. Selected players use stable Player IDs, must belong
to the canonical tournament roster/team, and may appear only once per Draft.
Pick numbers are validated for uniqueness, range, and deterministic source
ordering. `Draft Picks.Team ID` remains authoritative for the actual selecting
team; a Director-approved trade or order override is retained and diagnosed
rather than rewritten from the default `Snake` configuration.

## Recorded historical coverage

The authoritative Draft tabs contain settings and 22 selections for 2025 and
settings and 22 selections for 2026. No earlier year is projected or
fabricated. The raw 2025 `CRIPSYBOYS` setting remains in provenance while the
certified canonical team identity is `CRISPYBOYS`. All other unresolved team,
captain, player, roster, duplicate, or ordering conditions fail closed.

## Versioning and mutability

Each recorded year has one current pointer to append-only revisions. A source,
configuration, picks, and complete payload fingerprint are stored with the
workbook, exact two-tab source, actor, timestamp, previous revision, validation
diagnostics, and contract version. An unchanged synchronization is a no-op.
The active/current tournament may advance through ordinary supported CMS
synchronization. A completed historical year requires a Director-supplied
correction reason and creates a new revision; it never updates certified facts
in place. Database triggers reject direct writes outside the security-definer
import operation, including service-role table writes.

## Source and failure contract

`DRAFT_READ_SOURCE=google|supabase` is Preview-only. Production hard-resolves
to the existing Google behavior. Supabase selection additionally requires the
exact isolated Preview project, an isolated non-Production workbook, and
server-only credentials. Missing/invalid projections fail explicitly through
the Draft error boundary. There is no automatic Google, mutable `stats.js`, or
bundled historical fallback on the Supabase branch.

The supported synchronization reads only `Draft Settings` and `Draft Picks`.
Google remains editable; Supabase remains the sole application-readable
versioned projection when selected.
