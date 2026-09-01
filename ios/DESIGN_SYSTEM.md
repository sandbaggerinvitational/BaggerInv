# Bagger Invitational native design system

This document is the shared visual contract for the native participant app. It
keeps later polish work recognizably Bagger while preserving native iOS
behavior, the certified product hierarchy, and server authority.

The direction is:

```text
Bagger brand + native iOS ergonomics + golf personality + information clarity
```

Do not copy the PWA pixel for pixel, and do not reduce the app to generic
system styling. Use the semantic APIs in `BaggerInv/Design/` rather than adding
new brand colors, font sizes, radii, shadows, or status treatments in a product
view.

## Boundaries

The design layer may own appearance, layout dimensions, accessibility-aware
presentation, and image treatment. It may not determine identity, standings,
scoring permission, official score state, publication, financial results, or
any other product authority.

Step 2J.1 does not change:

- `Today | Matches | Score | Leaders | More`;
- screen information architecture or navigation destinations;
- DTOs, repositories, cache policy, or networking;
- the durable scoring queue or scoring state language; or
- Preview/Production authority.

Substantial screen composition belongs to the screen-specific 2J polish steps.

## Semantic colors

Use `BaggerDesign.Color` roles. The compatibility `BaggerPalette` names exist
for already-certified views; new polish work should prefer semantic roles.

| Role | Use |
|---|---|
| `backgroundPrimary` | Warm-paper application and scroll background |
| `backgroundSecondary` | Quiet grouped/form background |
| `surfacePrimary` | Ordinary cards and readable content surfaces |
| `surfaceElevated` | A sparingly raised or emphasized surface |
| `surfaceMuted` | Empty, informational, and low-emphasis inset content |
| `textPrimary` | Main participant text |
| `textSecondary` | Supporting copy and metadata |
| `textMuted` | Nonessential context where contrast remains sufficient |
| `textInverse` | Text on deep evergreen surfaces |
| `brandEvergreen` | Brand identity and ordinary primary actions |
| `brandEvergreenDeep` | Exceptional hero/background treatment |
| `brandGold` | Decorative accent, selection, and restrained borders |
| `brandGoldMuted` | Pale gold surfaces and current-context treatment |
| `borderDefault` | Warm, thin card and row separation |
| `borderStrong` | Selected or important boundaries |
| status roles | Live, final, success, warning, offline, error, and review |

Light gold is not body text on warm paper. Use the accessible dark-gold text
role when gold meaning must be communicated in text. Important meaning always
uses copy and, where helpful, an icon or shape in addition to color.

The certified app remains light-first. Do not invent a dark palette during a
screen polish step. Keep components semantic so a future deliberate dark-mode
project is possible.

## Typography

Use the semantic roles in `BaggerDesign.Typography`:

- `displayTournament` and `displaySection` use the serif brand voice for major
  tournament or section moments.
- `titlePrimary`, `titleSecondary`, and `cardTitle` establish hierarchy without
  turning every card into a hero.
- `body`, `bodyEmphasis`, `caption`, and `captionEmphasis` use readable system
  typography for participant copy and metadata.
- `statLarge`, `statMedium`, and `numericCompact` use tabular figures where
  alignment helps scores, ranks, money, Odds, or golf statistics.
- `button` and `tab` retain native control legibility.

All roles scale with Dynamic Type. Do not replace them with fixed point sizes.
Serif is selective; dense rows, body copy, controls, and statistics remain
system sans. Preserve shared golf formatting such as `8½`; provide an
accessibility value such as “8 and a half points” at the consuming semantic
element.

## Spacing and layout

Use `BaggerDesign.Space` for the shared rhythm:

```text
hairline  2
xSmall    4
small     8
medium   12
large    16
xLarge   20
xxLarge  24
xxxLarge 32
hero     40
```

Normal iPhone content uses the shared screen inset. Use the shared section-gap
role for major section-to-section separation, medium/large for
heading-to-content and card rhythm, and small/medium for compact competition
rows. Product needs may
justify a local exception, but an unexplained `13`, `17`, or `23` should not
become a new convention.

Competition surfaces are compact, editorial surfaces breathe more, and Score
keeps its proven 52–56-point one-handed controls. A global token must not shrink
a scoring target.

## Surfaces, radii, borders, and shadows

Use the small semantic sets in `BaggerDesign.Radius`, `Border`, and `Shadow`:

- small radius for compact inset content;
- control radius for buttons and selectors;
- card radius for ordinary content;
- hero radius for exceptional high-priority surfaces; and
- pill/capsule geometry only for pills and status badges.

Cards use a warm one-pixel border before they use elevation. Ordinary cards
use no or subtle green-tinted shadow; raised treatment is reserved for real
hierarchy. Do not outline every nested element or add heavy floating shadows.

Use `baggerCard(style:)` with `BaggerCardStyle.standard`, `.muted`, `.selected`,
or `.hero`. Compact composition comes from the shared compact padding/spacing
roles rather than another business-aware card type. Keep product content
outside the primitive rather than expanding it into a universal card API.

## Buttons and controls

- **Primary:** evergreen fill, inverse text, unmistakable main action.
- **Secondary:** warm/paper surface with evergreen border and text.
- **Tertiary:** unfilled semantic action with a complete touch target.
- **Destructive:** native destructive role and restrained red treatment.
- **Compact:** smaller composition only when its interactive target remains at
  least 44 points.

Use real `Button`, `Toggle`, `Picker`, `Menu`, `TextField`, and `SecureField`
controls. Do not make tappable text or imitate standard controls. Disabled
controls remain readable and semantically disabled. Preserve native pressed
feedback, alerts, confirmation dialogs, pull-to-refresh, and back behavior.

## Pills and selectors

Selected and unselected filter pills are controls; informational and status
pills are not. They must not look interchangeable. A selected control exposes
the selected accessibility trait. At accessibility sizes, adapt or wrap rather
than clip four labels into an unusable segmented row.

## Status system

Status visuals standardize tone without collapsing meaning:

| Status | Convention |
|---|---|
| Upcoming | Calm neutral surface plus explicit “Upcoming” copy |
| Live | Noticeable live tone plus text and an indicator; never color alone |
| Final / Match Final | Settled evergreen-neutral treatment |
| Official | Positive authoritative treatment only after canonical confirmation |
| Published | Visible/published treatment; distinct from final or official |
| Unpublished | Quiet locked/withheld treatment with no hidden-value hint |
| Saved on iPhone | Local durable-intent treatment, never styled as Official |
| Edited · Not saved | Local editor-warning treatment distinct from queued intent |
| Offline / Stale | Compact nonblocking warning while eligible cached data stays visible |
| Needs Review | Explicit warning/review treatment; never a normal retry badge |
| Unavailable | Neutral/error state with participant-safe explanation |

Do not change the exact product semantics. In particular, scoring must preserve
`Official`, `Saved on iPhone`, `Edited · Not saved`, `Needs Review`, `Offline`,
and `Match Final`. Financial products must preserve `Published`, `Unpublished`,
`Official`, `Projected`, `Final`, and stale/offline distinctions.

## Loading, empty, error, and offline behavior

- **Initial loading:** show a restrained loading primitive only when no eligible
  content exists.
- **Background refresh:** keep cached or current content visible; do not replace
  it with a full-screen spinner.
- **Empty:** optional SF Symbol, short title, product-specific explanation, and
  an optional real action.
- **Temporary error:** participant-safe title/copy and a retry action only when
  retry is valid.
- **Authentication/environment failure:** retain the coordinator’s global
  fail-closed behavior; a visual primitive does not override it.
- **Offline/stale:** keep eligible cached content visible with one compact,
  non-color-only freshness notice.

Do not add skeletons or a global toast framework by default. If a future cold
load benefits from a skeleton, keep it subtle and disable its motion when Reduce
Motion is active.

## Identity imagery

All identity images resolve through the Step 2J.0 `BaggerAsset` API and shared
wrappers. Never use a display name, inferred filename, filesystem path, or
remote URL as asset authority.

### Player avatars

Use a circular, aspect-fill portrait with the standardized size roles:

- small for dense identity rows;
- medium for ordinary rows/cards;
- large for emphasized identity; and
- hero for Passport or another explicitly approved hero.

The fallback is deterministic, Unicode-safe initials rendered in the same
geometry. The caller owns the participant-facing accessibility label.

### Team, course, and tournament marks

Team and course logos use aspect-fit inside a neutral warm plate; do not crop a
transparent mark. Tournament marks use compact and hero roles and fall back to
the primary Bagger mark. Missing team/course assets use the shared initials or
symbol fallback and must look intentional.

Logos are normally decorative inside a combined identity row/card. Mark the
image hidden from accessibility when surrounding text already communicates the
identity. Standalone identity imagery receives a caller-supplied label; the
resolver never guesses one.

Recommended later use:

- player portraits: Passport and selected identity rows;
- team logos: Tournament Score, Match identity, team headers, and History;
- course logos: Courses and selected course context; and
- tournament marks: tournament context, History, and restrained brand moments.

Do not automatically add every asset to every screen.

## Rows, lists, and navigation

Use shared standard navigation, identity, metric, action, and contact row
patterns where their semantics match. A disclosure indicator means the row
navigates. Static data must not look tappable.

Use native `List`/`Form` when they improve settings, accessibility, and native
interaction. Use `ScrollView` for branded composition. Both must retain the
warm-paper background and shared spacing.

Continue using native `TabView`, `NavigationStack`, native back controls,
sheets, alerts, and confirmation dialogs. The five tabs and the Score clipboard
symbol do not change in a visual-foundation step. Preview remains conspicuous.

## Accessibility and motion

Every shared primitive must support:

- Dynamic Type through accessibility XXXL;
- vertical growth for long player/team/course names, large values, and
  multi-line explanations;
- at least 44-point ordinary touch targets;
- meaningful text/icon/shape in addition to color;
- logical reading order and one coherent announcement per semantic row;
- caller-owned identity labels to avoid duplicate announcements;
- Increase Contrast where practical; and
- native, restrained motion that respects Reduce Motion.

Do not add haptics globally. Future product steps may use restrained haptics for
a meaningful score save, scoring conflict/error, or selector change, but not
for every navigation tap.

## Reusable primitive inventory

The shared implementation in `BaggerInv/Design/` and `BaggerInv/Views/Shared/`
provides:

- `BaggerDesign` tokens, plus `BaggerPalette`/`BaggerLayout` compatibility;
- `baggerCard(style:)`, `BaggerCardStyle`, `BaggerSectionHeading`, and
  `BaggerSectionHeader`;
- `BaggerPrimaryButtonStyle`, `BaggerSecondaryButtonStyle`,
  `BaggerTertiaryButtonStyle`, and `BaggerDestructiveButtonStyle`;
- `BaggerSelectionPill`, `BaggerStatusBadge`, and `BaggerFreshnessBanner`;
- `BaggerLoadingState`, `BaggerEmptyState`, and `BaggerErrorState`;
- `BaggerNavigationRow` and `BaggerMetricRow`; and
- `BaggerPlayerAvatar`, `BaggerTeamLogo`, `BaggerCourseLogo`,
  `BaggerTournamentMark`, and `BaggerBrandMark`, with
  `BaggerImageAccessibility` and the Step 2J.0 fallbacks.

Use the concrete shared type or modifier rather than recreating its appearance
inside a product view. Keep formatters—half points, money, records, dates, and
times—outside the design-token namespace.

## DEBUG gallery

The DEBUG-only gallery is deterministic visual proof for colors, typography,
cards, buttons, pills, statuses, section headers, rows, state treatments,
identity wrappers, catalog assets, and fallbacks. It is not participant
navigation or a fake product screen. It contains no credentials or private
payloads and is compiled out of Release.

Validate the gallery at default Dynamic Type and accessibility XXXL on both the
required Pro and Pro Max Simulators, then perform one representative physical
iPhone smoke. Prefer semantic UI assertions and accessibility audits over
pixel-perfect snapshot tests.

## Anti-patterns

Later polish steps must avoid:

- display-name or fuzzy asset lookup;
- one-off evergreen/gold/neutral colors;
- arbitrary font sizes, spacing, card radii, and heavy shadows;
- status conveyed by color alone;
- using serif for dense body/data content;
- desktop-style or horizontally scrolling statistics/financial tables;
- web-style nested navigation or custom back controls;
- unlabeled icon-only actions;
- hiding cached content during background refresh;
- making a static metric row look tappable;
- putting domain authority or format calculations in design tokens; and
- broad screen redesign while adopting a shared primitive.

## Step 2J.2 Today handoff

Today polish may now evaluate the shared application background, navigation
chrome, section heading, card surface, status badge, freshness/offline notice,
loading/empty/error states, and identity wrappers. The current tournament →
current Match → personal Matches → Tournament Score → immediate Schedule
hierarchy remains authoritative.

Step 2J.2 should decide deliberately where a hero card, team logo, tournament
mark, or player identity treatment improves Today. It should not add all of
them automatically, change the selected Match, calculate standings, alter
cached-first behavior, or begin polishing another tab.
