# Participant mobile UX — Odds Center and Tournament Guide

## Status and release boundary

Presentation-only work based on `4096f972fbeecaa71462a598a3531b9cde0c9274`. No migration, deployment, publication, or Production mutation. Exact-SHA release authorization is required after push.

## Odds Center mobile

At 800px and below, the existing team cards stack with tighter spacing. Their existing rounded probability, American odds and expected-points rendering is unchanged. The public snapshot has Pickles raw probability 54.052% (54.1% displayed), -118, 36.58 points; Lipp it and Rip it 45.948% (45.9%), +118, 35.42 points.

### Tournament Favorite / Top Contenders / Remaining Field

The first retained ranked player is featured with canonical portrait and metrics; ranks 2–10 use compact cards; ranks 11–24 use a four-column list without horizontal scrolling. Every player appears once in the visible mobile hierarchy. Secondary expected-record/average-finish values remain accessible in native disclosures. Existing desktop player table is unchanged.

Portraits use one existing cached Supabase public-presentation lookup, joined by stable Player ID and passed separately from the immutable Odds snapshot. Only photo references for displayed IDs reach this component. Missing/unavailable portraits retain initials; there is no name-based runtime mapping or Google fallback.

### Projection history and future snapshots

View Projection History starts collapsed on mobile, expanded on desktop. Every existing timeline entry remains rendered. Expanded mobile history wraps rather than horizontally scrolling. Existing biggest movers remain present; mobile cards retain prior probability/odds and percentage-point movement where prior evidence exists. A synthetic later milestone was inspected locally, including keyboard-opened history. It is not a Production artifact.

## Guide mobile

### Jump navigation

Six 44px-minimum shortcuts: Schedule, Rules, Courses, Dining, Local Guide and Important Contacts. Courses uses the existing `/courses` destination; other links are anchors. Schedule/Rules anchor landings were verified below the fixed header. All existing sections remain reachable; desktop retains the Overview shortcut.

### Rules collapse

The published model contains 26 rule-book entries and three round-format disclosures. All 29 start collapsed on mobile. Desktop retains the existing 20 important rules expanded. Category/title/body wording and ordering are unchanged. Native details/summary supports keyboard activation and visible focus; ordinary rerenders do not reset participant choices.

### Schedule / Dining / Local Guide / Contacts

Schedule spacing is reduced; all ten events remain ordered with time, title, location, format and existing detail links. Descriptions stay visible because they can contain critical logistics. No event text is hidden or reordered. Dining copy and all existing Call/Email/Directions/Website links remain unchanged; mobile actions have 44px minimum height.

### Golf Genius and published copy preservation

Captured public Guide revision 10, fingerprint `99a70ad15391c1d51ca948e3ad988cec9c9a05cd1b7b7eaf3e5308858571958f`. The real old and new Guide components rendered against the same captured published content produce identical normalized text and existing links, excluding only the new Courses navigation label. All four Golf Genius occurrences in the source fixture are preserved. No native app/scoring terminology or capability state was added.

## Responsive / accessibility / desktop

Local real-component previews use captured public responses and serve GET-only on loopback, with no Production connections. Both surfaces were checked at 390, 430, 820, 1280 and 1440px. Document width equals viewport at each width. Screenshots at 390/430 were explicitly inspected: favorite portrait, cards, remaining list, Guide rules and chronological schedule. No clipped names/probabilities/odds were found. History stays closed at 390/430 and open at desktop widths. Guide rule defaults correctly change at the responsive boundary.

Screenshots: `/tmp/bagger-participant-mobile-captures/` (including `odds-favorite-390.png`, `odds-remaining-390.png`, `guide-rules-390.png`, `guide-schedule-430.png`, full-page width captures and a later-history fixture). Use viewport captures for visual review; full-page browser stitching can temporarily rescale captures when switching widths.

## Tests

- Focused suite: 62 passed, including real published-data before/after rendering, Odds review/history, Guide boundaries and public navigation.
- Relevant regression suite: 72 passed, including Match Center, Best Ball decimal display, friendly times/team assets, PWA/native Guide isolation, Odds publication transaction, Director history and Guide isolation.
- New tests against synthetic fixtures independently: 6 passed.
- Production build passed; existing unrelated CSS autoprefixer warnings remain.
- `git diff --check` passed.

Two supplementary checks are explicitly not reported as green: the unchanged `public-website-shell-restoration` test still expects the obsolete pre-release-91 tagline; its inputs/test are byte-identical to the base commit. The pre-existing Playwright website-polish browser test could not bind its local server under the sandbox. No assertion was weakened. Responsive acceptance for this task used the supported browser control and actual local components instead. No Production browser mutation was used for any test.

## Production data impact

Public Odds snapshot JSON was identical before/after local work; SHA-256 `87b5eca66f3a8ba35461790b7812d9f7dce5da7060a99ba3f994b81be8b0c3b8`. Guide content JSON and fingerprint were also identical. Reads only; no requests to calculate/publish Odds, publish Guide or change any tournament/scoring/native state. Unrelated untracked files are preserved.

ODDS MOBILE UX: PASS

TOURNAMENT FAVORITE FEATURE: YES

TOP CONTENDER MOBILE CARDS: YES

REMAINING FIELD MOBILE-OPTIMIZED: YES

ODDS MOBILE HORIZONTAL SCROLL: NO

PLAYER PROJECTION HISTORY PRESERVED: YES

LATER ODDS MOVEMENT SUPPORTED: YES

GUIDE MOBILE UX: PASS

GUIDE JUMP NAVIGATION: YES

GUIDE RULES COLLAPSED BY DEFAULT ON MOBILE: YES

GUIDE CONTENT CHANGED: NO

GOLF GENIUS REFERENCES CHANGED: NO

NATIVE APP EXPOSED: NO

DESKTOP REGRESSION: NO

ODDS MATHEMATICS CHANGED: NO

CURRENT ODDS SNAPSHOT CHANGED: NO

GUIDE REPUBLISHED: NO

ODDS REPUBLISHED: NO

MIGRATION: NONE

PRODUCTION MUTATIONS: 0
