# Bagger Invitational native iOS product and screen specification

Status: Step 1E implementation blueprint

Scope: Product and UX behavior only; no Swift, runtime, API, database, PWA, or Production changes
Primary navigation: **Today | Matches | Score | Leaders | More**

## 1. Purpose and authority

This document defines the first native Bagger Invitational iPhone product. It is the product source of truth for the initial SwiftUI implementation phase: implementation may choose appropriate iOS APIs and component composition, but it must not invent different product behavior where this specification is explicit.

The approved native app is a purpose-built tournament client, not a website wrapper. Its first responsibility is the current participant tournament loop:

1. restore the authenticated golfer;
2. show what matters now;
3. make the golfer's Match easy to find;
4. make score entry fast and reliable;
5. distinguish local scoring intent from official tournament truth;
6. keep tournament score, Matches, and schedule easy to understand; and
7. move secondary website content out of the primary loop.

The five tab meanings are fixed:

- **Today:** What do I need to know right now?
- **Matches:** What is happening in the selected/current Round?
- **Score:** Enter and manage the score for the Match I am authorized to score.
- **Leaders:** What is the tournament score, and who is performing best?
- **More:** Everything useful outside the primary tournament loop.

This specification derives from the following approved foundations:

- Step 1A: `GET /api/mobile/v1/health` and `GET /api/mobile/v1/session`, Supabase Bearer identity, and canonical Player resolution.
- Step 1B: `GET /api/mobile/v1/today`, `/matches`, `/leaders`, and `/schedule`, with private ETag revalidation.
- Step 1C: `GET /api/mobile/v1/scoring/current`, `POST /scoring/hole`, and `POST /scoring/finalize`, all delegated to canonical scoring authority.
- Step 1D: `offline-scoring-reliability-spec.md`, including its queue states, save-first rule, retry rules, reconciliation, and online-only finalization.

When this document conflicts with a speculative mockup, this document wins. When a requested UI field is absent from the approved server contracts, the contract-gap register in section 31 wins: the client must omit or degrade that presentation rather than calculate tournament truth independently.

## 2. Non-negotiable product invariants

1. **Server truth remains official.** The app never calculates official handicap, strokes, net score, hole winner, Match result, points, rank, lifecycle, or finalization readiness.
2. **No false official success.** A locally persisted score may be shown optimistically only as `Saved on iPhone`; it is not `Official` until canonical acknowledgement or an authoritative equivalent-state refresh.
3. **No silent intent loss.** Unresolved scoring intent survives network loss, app termination, sign-out, account changes, tournament changes, and app updates under Step 1D.
4. **No silent stale overwrite.** A revision conflict is a review state. Reapplying creates new intent with a new mutation ID and current canonical revisions.
5. **No cross-identity replay.** A score saved by one Auth UUID/Player/tournament/Match partition is never exposed or submitted under another account.
6. **Authentication is not scoring permission.** The Score UI follows canonical `canScore`, `readOnly`, `canFinalize`, Match membership, and lifecycle state.
7. **Score means score entry.** Tournament standings do not replace the Score tab.
8. **The primary loop stays native.** Today, Matches, Score, Leaders, Schedule, account context, and Settings are native V1 surfaces.
9. **Secondary web content stays honest.** Web-backed pages open as web content; the app does not disguise a web page as a native primary screen or inject Bearer tokens into it.
10. **Golf-course usability is required.** Primary scoring works one-handed, in bright light, under limited attention, without precision gestures or keyboard entry.
11. **Status is accessible.** Offline, local-only, review, read-only, and final states use persistent text and accessibility labels, never color, haptics, or transient toast alone.
12. **Preview is unmistakable.** A non-Production build cannot plausibly be mistaken for the live tournament app.

## 3. Design principles

The product should prioritize, in order:

1. current tournament context;
2. authenticated golfer context;
3. fast access to the golfer's relevant Match;
4. extremely fast score entry;
5. tournament awareness;
6. cached-first perceived performance;
7. clear local-versus-official scoring status;
8. one-handed outdoor usability;
9. minimal navigation; and
10. progressive disclosure.

The initial implementation should use restrained native hierarchy rather than stacked dashboard cards. Branding, team identity, and course identity provide orientation, but actionable tournament information stays above decorative art. Full-screen spinners, giant heroes, nested cards, repeated logos, tiny metadata, and web-style menu systems are not part of V1.

## 4. Primary tab architecture

Each tab owns its own navigation stack. Switching tabs preserves the top-level state and reasonable in-tab position, but an explicit deep link may reset the target stack to the linked destination. The Score tab is central and may receive a stronger tint or accessibility badge for pending/review work; it remains a normal iOS tab destination, not a floating custom button.

SF Symbols listed here are concepts to verify against the deployment target when Xcode is available. A semantically equivalent available symbol is acceptable.

| Tab | Symbol concept | Purpose and primary content | Stack | Refresh and cache | Empty/offline/auth behavior | Cross-tab relationship |
| --- | --- | --- | --- | --- | --- | --- |
| Today | `sun.max` or `house` | Compact tournament context, relevant Match hero, personal Match summary, tournament score, immediate schedule, optional bounded pulse | Today → Match Detail; Today → Schedule | Render private participant-partitioned cache, then revalidate `/today`; also use cached/revalidated `/matches` and `/leaders` for sections | Purpose-built no-tournament/no-Match states; cached data remains visibly stale offline; personal content requires restored same-account context | Tournament score opens Leaders; scoring CTA activates Score; schedule opens More's native Schedule destination |
| Matches | `rectangle.stack` | Selected Round, authenticated golfer's Match, and every participant-visible Match in that Round | Matches → Match Detail | Render cached `/matches`, then ETag revalidate; active Round refreshes more frequently while visible | Cached Round remains browsable offline with freshness label; no-Match Round has an intentional state; auth required | Authorized scoring CTA activates Score with Match context |
| Score | `figure.golf` if available, otherwise `pencil.and.list.clipboard` | Contextual upcoming/read-only/active/completed scoring product | Score → Scorecard; Score → Conflict Review; finalization confirmation is a sheet/dialog | Scoring reads are private/no-store; display the last canonical snapshot as explicitly last-known, layered with Step 1D durable local intent; refresh on Step 1D events | Never a broken blank tab: sign-in, no tournament, upcoming, unavailable, read-only, offline, review, and final states all have defined content | Match/Today CTAs focus this tab; completed state links to Scorecard and next Match context |
| Leaders | `trophy` | Tournament Score, canonical Round Scores, Player Leaders, official Net Skins, and published Calcutta | Leaders only in V1; rows do not open native Player detail | Render participant-partitioned caches for `/leaders`, `/net-skins`, and `/calcutta`, revalidate with representation ETags, and preserve independently valid products | Before-first-point, unpublished, empty, unavailable, and stale states are product-specific; one secondary failure does not blank Tournament Score | Today's Tournament Score opens this tab |
| More | `ellipsis.circle` | Curated native and web-backed secondary destinations | More → Schedule / Player Passport / Settings; web content opens in an in-app browser | Native destinations use their own policies; the menu itself is static | Remains useful without tournament data; web links explain that connectivity may be required | Houses full Schedule linked from Today and account/settings used by authentication flows |

Recommended conceptual deep-link roots are `bagger://today`, `bagger://matches`, `bagger://score`, `bagger://leaders`, and `bagger://more`. Universal links should eventually use the existing Bagger domain, but no Associated Domains configuration belongs in this step.

## 5. High-level app state

The app has one global state plus contextual tournament and scoring substates. Screens consume the same state model so they do not disagree about whether the golfer is signed in, whether mobile authority is available, or what tournament is current.

### 5.1 Global states

| State | Meaning | Product behavior |
| --- | --- | --- |
| `launching` | Secure session and partitioned cache are being restored | Show the native shell immediately; render safe same-partition cache when known; avoid a second branded loading screen |
| `authenticationRequired` | No restorable Supabase session | Present Sign In; generic branding and non-sensitive shell may remain, but private participant data and queues stay hidden |
| `authenticated` | Valid Supabase session and canonical Player context resolved | Enter the current tournament state |
| `mobileApiUnavailable` | Preview mobile authority is intentionally disabled/unavailable | Keep retained safe cache visible as stale/read-only where possible; disable scoring submission; explain temporary unavailability without fallback |
| `noTournament` | Player resolved but no current tournament context is available | Show account context, previous web history destinations, and no live scoring; never fabricate a future tournament |
| `tournamentActive` | Current tournament products are available | Drive all five tabs from canonical tournament context |
| `tournamentCompleted` | Tournament status is canonical final/completed | Shift Today and Leaders to final results; retain Matches and scorecards; Score becomes read-only |

### 5.2 Tournament substates

Within an active tournament, the app may be before a Round, in a live Round, between the golfer's Matches, actively scoring, offline with local intent, in conflict review, after a Match, or between Rounds. These are not independent boolean flags: canonical tournament/Match state, scoring permission, and local Step 1D state determine the presentation in that order.

Priority for abnormal Score states is:

1. wrong/absent authenticated identity;
2. unresolved identity-integrity or quarantined record;
3. conflict/action required;
4. read-only/final lifecycle;
5. scoring authority unavailable;
6. offline/retrying local intent;
7. active syncing;
8. normal writable/official state.

An unresolved local intent remains visible for review even if canonical Match state later becomes final.

## 6. Before, during, and after behavior

| Tournament moment | Today | Matches | Score | Leaders | More |
| --- | --- | --- | --- | --- | --- |
| Before tournament | Compact year/status; next canonical Match if scheduled; first immediate events | Default first/current scheduled Round | Upcoming Match context or scoring-not-yet-available state | Teams with `No points yet`; Player list may be empty/zero | Full Schedule and trip resources are prominent |
| Tournament morning | Current date/round when available; next Match and today's events | Current Round selected; tee-time ordering | Upcoming Match, course, format, tee time from read products; no controls until canonical permission | Tournament Score at zero/current points | Schedule current/next event |
| Before golfer's Match | Next Match hero dominates; CTA View Match or Enter Score only when permitted | Your Match hero above Round list | Match context and canonical reason scoring is not yet available; View Match | Current overall score and leaders | No special change |
| During Match | Live hero, canonical status, Continue Scoring when writable | Current Round; Your Match live; all Matches show available status/progress | Focused hole entry with persistent reliability state | Revalidate periodically; cached values never masquerade as current offline | Secondary resources remain quiet |
| Between Matches | Next upcoming Match becomes hero; completed one stays in Your Matches | Current Round or remembered selection | Next Match context; prior completed scorecard link | Current score and Player leaders | Schedule becomes useful for the gap |
| After golfer's Match | Most relevant next Match, otherwise final Match hero and result | Your Match marked Final; Round remains browsable | Final result and read-only scorecard; next Match hint if canonical | Updated points after canonical publication | No special change |
| After Round | Next Round if canonical currentRound advanced; otherwise completed summary | Current/new Round selected; prior Rounds available | Upcoming next Match or between-Matches state | Overall score; Round breakdown only after P1 contract gap is resolved | Schedule for next event/day |
| Tournament completed | Final Tournament Score, golfer's completed Matches, remaining itinerary if useful | Default final or remembered Round; all results accessible | No active scoring; last completed Match/scorecards | Winner treatment and final Player Leaders | History gains prominence |

## 7. Launch, authentication, and session restoration

### 7.1 Launch experience

Launch should be brief:

```text
native launch
→ tab shell and restrained Bagger branding
→ same-account cached Today when safe
→ secure session restoration and canonical context validation
→ background ETag refresh
```

Do not add an onboarding carousel, long animated logo, or splash-to-loading-to-loading sequence. On a cold start without cache, show a stable shell with localized placeholders. If authentication is required, transition directly to Sign In.

### 7.2 Sign-in flow

Native V1 uses the existing approved Supabase Participant Identity:

```text
Open Bagger
→ restore Supabase session?
   ├─ yes: GET /api/mobile/v1/session
   │       → canonical Bagger Player
   └─ no: Sign In
           → enter email
           → request OTP through Supabase Auth
           → enter OTP
           → Supabase session
           → GET /api/mobile/v1/session
           → canonical Bagger Player
```

There is no arbitrary sign-up flow. The sign-in screen contains Bagger identity, an email field, a clear `Send Code` action, and concise help. The OTP screen supports system one-time-code autofill/paste, six-or-configured-digit entry without tiny boxes, resend after a bounded delay, changing email, and accessible error focus.

Product states:

- Invalid email syntax: local inline validation.
- Invalid/expired OTP: `That code did not work. Request a new one or try again.`
- Supabase session exists but `/session` returns participant-not-found: `This email is not linked to an active Bagger player.` Provide support guidance; do not create an account.
- Mobile authority unavailable: `Bagger mobile sign-in is temporarily unavailable in this build.` Retain no false fallback.
- Temporary network failure: keep entered email/code when safe and allow retry.
- Phone/SMS: post-V1 unless already intentionally enabled when implementation starts; email OTP must not wait on it.

### 7.3 Session restoration and expiry

The app restores auth secrets through the Supabase auth/session layer's secure storage, never the scoring queue. It then verifies `/session` and uses only the returned canonical Player/tournament context.

Safe cached content rules while validation is pending:

- Generic shell and branding may appear immediately.
- Same-partition cached tournament reads may appear if the prior secure session identity is known and the content is clearly read-only while validation occurs.
- Scoring controls and mutation replay remain disabled until valid authentication is restored.
- A different or unknown identity never sees prior personal Match data or unresolved scoring intent.
- If refresh fails temporarily, cached Schedule/Leaders/Matches may remain labeled `Offline · Showing last update`; private scoring intent stays protected and hidden unless the same partition is restored.

Token expiry triggers one normal Supabase session refresh. UI language is `Sign in again to continue scoring`, not token terminology. Step 1D controls pending-intent preservation.

### 7.4 Sign out and account switching

If no unresolved scoring work exists, sign-out removes the active session, clears/hides account-scoped read caches, and returns to Sign In. A short non-sensitive app configuration cache may remain.

If unresolved scoring work exists:

1. pause automatic sync;
2. present a persistent unresolved-score warning before confirmation;
3. retain the protected queue in its original Auth UUID/Player/tournament/Match partition;
4. hide that partition after sign-out;
5. never submit it with another user's token; and
6. restore it only after the original identity returns and canonical context is revalidated.

Player B receives a clean shell and cannot see Player A's names, Match, scores, or queue status. Account switching uses Sign Out followed by the normal sign-in flow; there is no quick account picker that weakens partitioning.

## 8. Cached-first read experience

`/today`, `/matches`, `/leaders`, and `/schedule` are private authenticated products with canonical `meta.revision` and strong ETags. The client should maintain a bounded, identity-and-tournament-partitioned local cache for decoded V1 DTOs.

Screen entry behavior is:

```text
open tab
→ render valid partitioned cache immediately
→ issue If-None-Match revalidation
→ 304: retain current view and update freshness bookkeeping
→ 200/new revision: decode, persist atomically, update in place
→ failure: retain cache and disclose stale/offline state when material
```

Do not replace a populated screen with a spinner during revalidation. True cold loads use stable skeletons matching final section geometry. Sections may load independently: for example, Today can show `/today` Match context while `/leaders` tournament score is still a localized placeholder.

Scoring is different. `/scoring/current`, acknowledgements, conflicts, and finalization are private/no-store. The client may retain the last canonical scoring snapshot in protected local storage to orient the golfer, but it must label it last-known when offline and never treat it as current permission or finalization authority. Step 1D local intent overlays that snapshot; it does not turn it into official truth.

### 8.1 Starting refresh intent

Intervals remain configurable and should be tuned through Preview measurements. Reasonable starting ranges are:

- Today: launch, foreground, pull-to-refresh, and approximately every 60–120 seconds while visible during live tournament play.
- Matches: launch/foreground and approximately every 15–30 seconds while the selected current Round is live; relax to several minutes for completed/future Rounds.
- Leaders: approximately every 30–60 seconds while visible during live play; much less often before/after play.
- Schedule: launch/foreground, pull-to-refresh, and approximately every 15 minutes or around known event boundaries.
- Score: Step 1D event-driven refresh after acknowledgement, conflict, permission/lifecycle response, restart, significant backgrounding, and before finalization. Optional passive refresh while visible must never race or bypass the Match queue.

Reachability is a hint. Pull-to-refresh remains available on read screens. Repeated failures use backoff rather than continuous polling.

### 8.2 Freshness language

Do not show timestamps when content is current and revalidation succeeds. Show concise language only when confidence matters:

- `Updated 1 min ago`
- `Last updated 9:42 AM`
- `Offline · Showing last update`

For a live Match, stale status becomes material after roughly two minutes without a successful refresh. For Leaders, roughly five minutes is a useful warning threshold during play. Schedule can tolerate a longer cache, but a failed foreground refresh or passed event boundary should show freshness. These are product defaults, not server guarantees.

## 9. Today

### 9.1 Purpose and hierarchy

Today answers one question within seconds: **What does this golfer need to know right now?**

Its order is fixed:

1. compact Tournament Context;
2. Your Current/Next Match hero;
3. Your Matches summary;
4. Tournament Score;
5. Today's Schedule/Up Next; and
6. optional bounded Tournament Pulse.

The page is a vertical native scroll view with a compact navigation title. It is not a grid dashboard. The Match hero occupies the strongest visual position without pushing the tournament context offscreen.

### 9.2 Tournament context

The header contains tournament name/year, canonical status, and current Round when available. It may include course/location only when that clarifies the current Match or day; it never becomes a large image hero.

| Canonical state | Header behavior |
| --- | --- |
| Before tournament | Year/name, `Tournament begins soon` or canonical scheduled status, first Round when present |
| Live | Name/year, `Round N · Live`; show a current day label only if a canonical day/date exists |
| Between Rounds | Name/year, next/current canonical Round, `Between Rounds` only when derivable from Match state |
| Completed | Name/year and `Tournament Final`; winning team comes from Leaders, not local calculation |

The mobile tournament DTO currently has status/currentRound/timezone but no canonical `Day N`; the UI must not derive a tournament day number from the phone calendar.

### 9.3 Your Match hero

The hero always chooses the authenticated golfer's most relevant canonical Match:

1. writable or read-only live Match;
2. next scheduled Match;
3. most recently completed Match when no future Match exists; or
4. no-Match state.

`/today.currentMatch` already follows live → scheduled → recent completed. The client may augment the golfer's own Match with `/scoring/current?matchId=...` for canonical live status text, progress, scorecard state, and permission. It must not reconstruct a match-play differential from raw holes.

Information hierarchy:

1. `YOUR MATCH` or `YOUR NEXT MATCH` plus Round;
2. both sides' participant names and restrained team accents;
3. canonical live result/status (`2 UP`, `Tied`, `Thru 7`) or upcoming course/tee time;
4. final result for completed Match; and
5. one context-sensitive primary action.

| Match state | Primary action | Destination |
| --- | --- | --- |
| Scheduled, not writable | `View Match` | Match Detail |
| Scheduled/live and canonical `canScore=true` | `Enter Score` or `Continue Scoring` | Score tab focused on that Match |
| Live but read-only/not authorized | `View Match` | Match Detail; no scoring button |
| Completed | `View Scorecard` for golfer's own canonical scoring Match; otherwise `View Match` | Native Scorecard or Match Detail |
| No Match | No disabled button | Concise `You do not have a Match scheduled right now.`; next schedule remains visible |

Between Matches, the next scheduled Match replaces the prior final hero while the completed Match remains in Your Matches. After the golfer's final Match of the day, the hero may show the most recent final with `You're finished for today` only when the full personal Match list proves no later Match. It must not infer that from local time alone.

### 9.4 Your Matches

This is a compact personal tournament summary, not a second Matches screen. It filters `/matches` by `authenticatedPlayer.involved` and shows one row per Round in ascending Round order:

- Round label/number;
- `Upcoming`, `Live`, or `Final`;
- tee time for scheduled Matches;
- canonical progress for live Matches;
- canonical final result summary for completed Matches; and
- a chevron/tap target to Match Detail.

The current/relevant Match receives a small `Current` treatment and stronger text weight. Rows remain compact enough to scan three Rounds together. If no personal Matches exist, omit the section or show one concise sentence; do not render empty placeholder cards.

### 9.5 Tournament Score

Today fetches/reuses `/leaders.teamStandings`; it does not expect `/today` to contain standings and it does not sum Match results locally.

Display both team names and canonical points, with the leading team visually stronger but not identified by color alone. Half points use `½` for exact half-point values; other canonical numeric values use locale formatting without client rounding that changes meaning. Include current Round/status from the tournament DTO.

- Before any points: show both teams with `0` when canonical zero exists; if points are null/absent, show `No points yet`, not fabricated zero.
- Live: show team score plus `Round N · In Progress` when canonical state supports it.
- Final: show `Tournament Final`, winner emphasis, or `Tournament tied` when canonical standings are tied.
- Tap anywhere in the module: switch to Leaders at its top.

### 9.6 Today's Schedule / Up Next

Use `/today.immediateSchedule`, which is bounded to three current/future published events. Do not duplicate the entire Guide.

- Sort is already chronological; preserve it.
- An event whose canonical UTC interval contains now is marked `Now` with persistent text.
- Upcoming events show tournament-local time, title, and one-line location when present.
- Completed events are normally omitted from this bounded Today section; the full Schedule can show them.
- Maximum rows: three, matching the contract.
- If all events are on the current tournament-local calendar date, title the section `Today`; otherwise use `Up Next`.
- `View Full Schedule` opens the native Schedule destination in More's navigation stack.
- Empty: `Nothing else is scheduled right now.` only when the schedule read succeeded; otherwise use the data-unavailable state.

### 9.7 Tournament Pulse

Tournament Pulse is optional for V1. A bounded, non-narrative pulse may be derived from `/matches` using only canonical status counts, for example `4 Matches live · 3 final`. For the golfer's own Match, canonical scoring status may be included.

Do not create claims such as `won 3 of the last 4` or team-leading Match counts from incomplete DTOs. The current `/matches` contract lacks live match-play differential for non-owned Matches, and no mobile storyline contract exists. Rich narrative or team-leading Pulse is therefore **P2 — POST-V1 DATA CONTRACT GAP**. If the bounded count is not useful, omit Pulse entirely without leaving a placeholder.

### 9.8 Today loading, offline, error, and empty behavior

- Cold load: tournament/header skeleton, one Match-card skeleton, and localized placeholders for score/schedule.
- Cached load: render immediately; sections revalidate independently.
- Offline: keep valid cache, show `Offline · Showing last update` near the page freshness/status area, and ensure live Match/score modules do not imply freshness.
- `/leaders` fails while `/today` succeeds: keep the Match hero and show a localized Tournament Score unavailable row; do not fail the full page.
- `/schedule` data absent: omit schedule rows and retain `View Full Schedule` only if a cached full schedule exists.
- No tournament: branded no-current-tournament state with Player/account access and web History link.
- No Player mapping: leave the tournament shell and present the identity-resolution state; never show another golfer's cache.

## 10. Matches

### 10.1 Purpose and screen structure

Matches answers: **What is happening in this Round?** Its approved structure is:

```text
Round Selector
→ Your Match (when one exists in the selected Round)
→ All Matches for Selected Round
```

The primary architecture is not `My Matches | All Matches`. Personal relevance is expressed by the hero inside the selected Round.

### 10.2 Round selector

Available Round numbers come from `/matches[].round.roundNumber`; labels/formats use canonical nullable fields. The selector defaults as follows:

1. preserve the last selected Round for this tournament during normal navigation;
2. on a new session/tournament, use `tournament.currentRound` when it exists among available Rounds;
3. otherwise choose a Round containing a live Match;
4. otherwise the earliest scheduled Round; and
5. for a completed tournament, the final Round.

Use a compact native segmented/paging control for a small Round count or a centered label with visible previous/next controls. A swipe may supplement, but never replace, explicit controls. The control announces `Round 2 of 3` to VoiceOver.

| Round state | Behavior |
| --- | --- |
| Current/live | Selected by default and labeled `Live` outside the segment if useful |
| Completed | Fully browsable; Match rows show final results |
| Future | Tee times and scheduled state; no live scoring claims |
| Tournament complete | Final or remembered Round is selected; all Rounds remain reachable |
| No Matches | Keep the Round header and show `No Matches are scheduled for this Round.` |

Do not infer future Rounds that have no canonical Match rows.

### 10.3 Your Match hero

If `authenticatedPlayer.involved=true` for a Match in the selected Round, show it first in a visually stronger summary. It contains Round/format, participants, course/tee/tee time where present, and canonical state:

- Before: `Upcoming` and tee time.
- Live: `Live · Thru N`; add the canonical match-play differential only when available from the golfer's authorized `/scoring/current` state.
- Completed: `Final` and canonical `result.summary`.

CTA resolution uses `/scoring/current?matchId=...`, not assumptions from `/matches.status`:

| Canonical state | CTA |
| --- | --- |
| Upcoming/not writable | `View Match` |
| Writable and no official holes yet | `Enter Score` |
| Writable with progress | `Continue Scoring` |
| Read-only | `View Match` or `View Scorecard`; no score mutation action |
| Completed | `View Scorecard` |

If the golfer has no Match in the selected Round, omit the hero and place a small `You are not scheduled in this Round` note above the list. Do not reserve an empty hero-sized area.

### 10.4 Round Match list

Every participant-visible Match in the selected Round appears below `Round N Matches`. The list is denser than the personal hero.

Each row includes:

- two sides' participant names;
- small team name/accent and optional small bundled logo;
- tee time before play;
- `Upcoming`, `Live`, or `Final`;
- `Thru N` for live Matches when current hole is present;
- final result summary when present; and
- live match-play differential only when a canonical mobile field eventually supplies it.

Presentation order is ascending machine-readable local tee time when present, followed by rows without time, with the server's stable Match-ID order as tie-breaker. This is presentation sorting, not a change to tournament authority.

The Step 1B Match DTO currently has live `currentHole` but no live differential/status text for non-owned Matches. V1 may truthfully show `Live · Thru 7`; it must not calculate `2 UP`. Rich live Match cards require the P1 gap in section 31.

Tap any row to Match Detail. Rows are full-width tap targets, not collections of small nested buttons.

### 10.5 Match Detail

Match Detail is the tournament-following destination. It answers: **What is happening in this Match?**

Always available from `/matches`:

- Round and format;
- status;
- course, tee, and tee-time label when present;
- both sides and participants;
- authenticated golfer relationship;
- live current-hole progress when present; and
- completed result summary/points when present.

For a Match involving the authenticated golfer, `/scoring/current?matchId=...` can add canonical live status text, sides, course holes, official score rows, handicap/stroke context, permissions, and result. Scoring controls appear only when `canScore=true`; read-only status remains inspectable.

For a Match not involving the authenticated golfer, V1 remains a summary view. The mobile read contract does not expose arbitrary hole-by-hole scoring state. The screen must not call web-internal endpoints, infer scoring from Leaderboards, or expose Director controls. Hole-by-hole spectator Match Detail is a P2 gap.

Primary actions are:

- `Enter Score` / `Continue Scoring` only for canonical permission;
- `View Scorecard` for the golfer's own available scoring snapshot;
- no correction/finalization control in Match Detail itself; and
- Back to the selected Round.

### 10.6 Matches loading, cached, offline, and error behavior

- Cold load: Round selector shell plus compact row skeletons.
- Cached: selected Round renders immediately and maintains scroll position.
- Offline: all cached rows remain browsable with one page-level freshness label; `Live` becomes `Live · Last updated …` when materially stale.
- Missing Match after a link: show `This Match is no longer available` with Back to Matches and refresh.
- No Round rows: intentional empty state, not a retry loop.
- Authentication required: preserve the requested Match deep link, sign in, then revalidate authorization before opening.

## 11. Score

### 11.1 Purpose

Score is the permanent contextual scoring destination. It answers: **What may I score right now, and what is official?** It does not contain tournament standings.

`GET /scoring/current` is the scoring UI's canonical context. `/today` or `/matches` may supplement upcoming tee time because the scoring DTO does not include tee time, but they never grant scoring permission. All mutation behavior follows Step 1D.

### 11.2 Score tab state table

| Context | Score content | Primary action |
| --- | --- | --- |
| 1. No authenticated Player | Sign-in-required explanation | `Sign In` |
| 2. Authenticated, no tournament | Branded no-current-tournament state | `View Account` / web History |
| 3. Upcoming Match | Round, participants, course, tee time from read product, format | `View Match`; scoring availability text |
| 4. Match scheduled, scoring unavailable | Same context plus canonical reason in golfer language | No disabled fake Save; `Check Again`/`View Match` |
| 5. Active and writable | Focused current-hole entry | `Save & Next` |
| 6. Active but read-only | Official current state and scorecard | `View Scorecard` |
| 7. Offline with queued scores | Last canonical state plus local editor/queue overlay | Continue valid local entry; finalization disabled |
| 8. Conflict/action required/quarantine | Persistent `Needs Review`, affected hole and comparison path | `Review Hole` |
| 9. Ready to finalize | Resolved queue, refreshed complete scorecard, canonical `canFinalize=true` | `Review Scorecard`, then `Finish Match` |
| 10. Completed Match | Final result and read-only scorecard | `View Scorecard` |
| 11. Between Matches | Next upcoming Match if canonical; previous result link | `View Next Match` or `View Scorecard` |

The Score tab never fabricates a scoring session. `data.scoring:null` means there is no canonical participant Match to score; present upcoming data only if `/today` or `/matches` actually supplies it.

### 11.3 Before a Match

Show the next canonical Match instead of an empty screen:

- Round and format;
- sides/participants;
- course and tee when available;
- tee time from `/today` or `/matches` matched by Match ID;
- `Scoring will become available for this Match` for scheduled/not-active state; and
- Match Detail link.

Do not show editable controls or enable an `Enter Score` action until `/scoring/current.permission.canScore=true`. A refresh action may check again; it cannot override lifecycle state.

### 11.4 Active scoring hierarchy

The active screen keeps the hole editor above secondary detail:

1. compact Round/course/format header;
2. current Match status and reliability status row;
3. large hole number plus par, yardage, and stroke index when non-null;
4. required score controls in immutable canonical slot order;
5. read-only stroke indicators from the scoring snapshot;
6. explicit `Save & Next`;
7. visible Previous / Scorecard / Next navigation; and
8. current canonical Match state (`Tied`, `Team Name 2 UP`, `Thru 6`) from `statusText`, never a client calculation.

Nullable yardage, par, or stroke index simply disappears; it does not create `0 yds` or `HCP 0`. Team/Player order exactly follows `/scoring/current.sides[].participants[].slot` and mutation arrays use that same order.

### 11.5 Format support

The current canonical V1 formats are `BB`, `SC`, and `SI`.

| Format | Canonical request shape | Native editor |
| --- | --- | --- |
| Best Ball (`BB`) | Two gross values per side | Four participant rows, grouped subtly by side; every required Player score is confirmed before Save |
| Scramble (`SC`) | One gross value per side | One team/pair score row per side; participant names remain context, but do not collect four individual values |
| Singles (`SI`) | One gross value per side | One Player score row per side |

No other format is accepted by the current Step 1C schema. If canonical scoring adds a format, the client must add an explicit editor mapping before enabling scoring; it must not guess based on participant count.

Strokes, playing handicap, net, winner, Match progress, and result are read-only canonical outputs. Stroke dots/badges may explain who receives strokes but never modify the submitted gross intent.

### 11.6 V1 score-control decision

Use a large horizontal control per required score:

```text
Player Name             stroke indicator
[ large minus ]   [ large score ]   [ large plus ]
```

Decision details:

- The center value presents par as a **suggested, unconfirmed** starting value when canonical par exists. Save remains disabled until each required row is explicitly touched/confirmed.
- Tapping minus/plus both confirms and adjusts. Tapping the center opens a large numeric selection sheet covering the valid canonical `1...20` range; no keyboard is required.
- If par is null, the center starts `—` and the numeric selector is the first action.
- Minimum target size is 48 points, with a 52–56 point target preferred on the active scoring screen.
- Holding a button may repeat slowly only if accessible and resistant to accidental runaway values; single taps remain primary.
- Dynamic Type may stack the label above controls. The control must never force horizontal scrolling.
- VoiceOver announces Player/team, current proposed gross score, whether it is confirmed, and increment/decrement actions.
- Team color, stroke marks, and haptics supplement text; none is the only signal.

This is faster than keyboard entry, supports unusually high scores through direct selection, and prevents an untouched field from being silently submitted as par.

### 11.7 Save and advancement

V1 uses **explicit Save & Next**, not automatic submission when the final field becomes complete.

```text
enter/confirm every required gross score
→ tap Save & Next
→ validate locally against the immutable format/1...20 bounds
→ durable Step 1D queue transaction commits
→ show Saved on iPhone
→ advance to the next appropriate hole
→ sync asynchronously
→ canonical acknowledgement/refresh changes status to Official
```

The golfer may advance after durable local persistence without waiting for network acknowledgement. If durable persistence fails, remain on the populated editor, say `Score was not saved on this iPhone`, and do not issue a direct network request outside the queue.

A Save-operation lock and intent fingerprint absorb a rapid double tap into one durable mutation. The button shows localized progress while the local transaction commits, not until the server responds.

The next hole is the next canonical hole requiring attention. The app does not automatically finalise after Hole 18.

### 11.8 Hole navigation

Visible controls always exist for:

- Previous hole;
- Next hole when navigation is valid;
- Scorecard/jump list; and
- returning from prior-hole editing.

A horizontal swipe may be added as an enhancement, never the sole method. The scorecard identifies:

- official completed holes;
- local pending holes;
- current editor hole;
- conflict/review holes;
- unentered holes; and
- final read-only holes.

Leaving a dirty, not-yet-durably-saved editor requires a concise confirmation. Navigating among clean/queued holes does not show repeated dialogs.

### 11.9 Reliability status system

A compact persistent status row sits immediately below Match progress and above the hole editor. It uses one consistent vocabulary:

| Product state | Presentation |
| --- | --- |
| Official | `✓ Official through Hole 6` or `Hole 7 Official`; subtle and durable |
| Saved locally | `Saved on iPhone` and optional pending count |
| Syncing | `Syncing Hole 7…`; duplicate Save disabled |
| Offline | `Offline · 2 holes saved on iPhone` |
| Retrying | `Waiting to sync · Retry` when manual retry is eligible |
| Needs review | `Hole 7 needs review`; persistent, high priority, opens comparison |
| Scoring unavailable | `Scoring is temporarily unavailable. Your saved scores are safe.` |
| Read-only | `Scorecard is read-only` plus canonical reason translated into golfer language |
| Match finalized | `Match Final` plus official result |
| Authentication required | `Sign in again to sync saved scores` |

Normal `Official` status is visually quiet. Offline, retry, review, unavailable, auth, and final states remain visible until resolved and expose equivalent VoiceOver text. A Score-tab badge may show `!`/accessible `Needs review` for conflict or a bounded pending count; it must not imply that pending values are official.

### 11.10 Offline experience

When connectivity disappears, the golfer may continue entering scores as long as the last immutable snapshot is valid, the same identity partition is restored, canonical state was writable when offline began, and no Step 1D blocking state exists.

The screen shows:

- `Saved on iPhone` immediately after durable save;
- number of unresolved holes when useful;
- last canonical Match status labeled as last-updated;
- normal hole navigation and Save & Next;
- no claim that Leaders/Match result has updated; and
- finalization unavailable with `Connect to finish this Match`.

Temporary offline state should feel controlled, not catastrophic. Do not use destructive red banners for ordinary signal loss. Aged, conflicted, identity-mismatched, or quarantined intent receives stronger review treatment under Step 1D.

### 11.11 Conflict review

`REVISION_CONFLICT` stops automatic replay for the affected Match. Conflict Review presents two clear, fully labeled values:

```text
Hole 7 Needs Review

Your saved score
Clay 4 · Connor 5 · Jack 5 · Wade 6

Official score
Clay 4 · Connor 4 · Jack 5 · Wade 6

[ Keep Official Score ]
[ Reapply My Score ]
```

No normal golfer copy exposes mutation IDs or revisions.

- **Keep Official Score:** performs no score write; records local `resolved/keptOfficial`, retains the bounded receipt, refreshes, and releases later queue work only when Step 1D says it is safe.
- **Reapply My Score:** refreshes canonical state first, asks for explicit confirmation, creates a **new** mutation ID using current canonical revisions, and submits through normal authorization. It never edits/recycles the conflicting mutation.
- Official value now equals local intent: resolve as canonical equivalent without a second write.
- Refresh unavailable: keep the conflict and both local/last-known official values protected; do not allow a blind action.
- `IDEMPOTENCY_CONFLICT`: present `This saved score needs support review`; quarantine and do not offer a one-tap new-ID escape. A controlled official/reapply flow is available only after integrity review.

### 11.12 Prior-hole correction

The golfer opens Scorecard, selects a hole, reviews the official values, then taps explicit `Edit Hole`. This separates correction from ordinary inspection and prevents accidental edits while scrolling.

Correction requirements:

- Match remains canonically writable and the golfer remains authorized;
- current official score and local status are shown before editing;
- a changed correction is new scoring intent with a new mutation ID unless Step 1D's provably-never-transmitted supersession rule applies;
- an exact equivalent creates no mutation;
- Step 1D queue ordering and same-hole rules remain intact;
- canonical transaction recalculates net, winner, Match state, and revisions; and
- conflict is possible and follows the same review path.

Finalized Matches have no correction control. Director reopen/correction remains web-admin-only.

### 11.13 Native scorecard

Native V1 includes a compact Scorecard because `/scoring/current` provides sufficient canonical data for the authenticated golfer's Match.

Entry points:

- Score header/toolbar during active scoring;
- `Review Scorecard` before finalization;
- completed Score state;
- golfer's Match Detail; and
- completed Match hero when the Match belongs to the golfer.

Each hole row shows hole number, par, optional yardage/stroke index in secondary detail, canonical gross values in slot order, canonical winner/result, and status. Local overlays may show `Pending` or `Needs Review` next to the affected hole, clearly separate from official values.

The scorecard supports reviewing all holes, jumping to an editable prior hole, identifying missing/pending/conflict holes, final review, and completed Match review. It is not a printable traditional scorecard and does not duplicate the active editor's large controls.

For non-owned Matches, the current contracts do not provide a spectator scorecard; do not reuse this scoring destination to bypass Match authorization.

### 11.14 Finalization

Finalization is **online-only** and explicit. It is never an ordinary queued hole mutation.

Required sequence:

```text
Hole 18 saved locally
→ every hole mutation canonically acknowledged
→ no conflict/action-required/quarantined records
→ fresh uncached /scoring/current
→ scorecardComplete=true and canFinalize=true
→ Review Scorecard
→ Finish Match
→ explicit confirmation naming the Match/result context
→ POST /scoring/finalize with current Match revision
→ canonical refresh
→ final result
```

`Finish Match` never appears enabled from optimistic local completeness. `FINALIZATION_NOT_READY` returns the golfer to review with a plain explanation. If the request has an unknown network outcome, show `Checking official Match status…`, refresh `/scoring/current?matchId=...`, and resolve from canonical state. Do not enter a blind retry loop. If still active and eligible, require another explicit confirmation before retry.

The native client cannot submit a winner, result, points, or completed status.

### 11.15 Completed Match

After canonical finalization, Score becomes read-only and shows:

- `Round N Complete`;
- sides;
- canonical final result;
- finalization timestamp only if useful/available;
- `View Scorecard`; and
- next canonical Match context when one exists.

No score controls remain. Any unresolved local intent that differs from a Match finalized elsewhere remains a separate Needs Review record; the app never reopens the Match.

### 11.16 Match Detail versus Scorecard

| Destination | Question | Content | Mutation role |
| --- | --- | --- | --- |
| Match Detail | What is happening in this Match? | Round, format, participants, course/tee time, summary status/result; owned Match may show canonical progress | Links to Score only when authorized; no inline hole editing |
| Scorecard | What has officially been recorded, what is local/pending, and what may I correct? | Hole rows, canonical gross/result, local pending/review overlays, completeness | Authorized prior-hole correction and final review |

Overlap is limited to participants, Match status, and a scorecard link. Match Detail remains useful for every participant-visible Match even when hole detail is unavailable; Scorecard is an authenticated scoring/review product for the golfer's own Match.

## 12. Leaders

### 12.1 Purpose and order

Leaders answers: **What is the tournament score, and who is performing best?**

Its order is:

1. Tournament Score;
2. Round Score Breakdown;
3. Player Leaders;
4. Net Skins; and
5. published Calcutta.

The Tournament Score intentionally appears on both Today and Leaders. Today uses it as context; Leaders is the definitive place to understand it.

### 12.2 Tournament Score

Use `/leaders.teamStandings` exactly as ranked by the canonical Leaderboards Core authority. Do not sum Matches or reorder the two teams based on a local calculation.

Presentation includes:

- tournament name/year;
- both team names and restrained identity marks;
- canonical total points;
- current Round/status; and
- final winner/tie treatment.

The leading team receives stronger type and an accessible `Leading` label. For final state, use `Champions` for the canonical winning team or `Tournament tied`. Before the first canonical point, show `No points yet` if values are null and `0 — 0` if canonical values are zero.

Half-point formatting follows the Today rule: exact `.5` values may display `½`; all other values preserve canonical numeric meaning.

### 12.3 Round Score Breakdown

`/leaders.roundStandings` is the bounded authoritative Round team-score projection from Leaderboards Core. It supplies numeric Round order, canonical Round name/status, and canonical team points/rank/record/remaining Matches. Only official Match results contribute points. A Round with no official result supplies null rank/points rather than a fabricated zero.

The native section shows each Round in the order supplied, both teams' canonical Round points, and `Live`, `Final`, or `Not Started` from the authority. Tapping a Round may switch to the corresponding Matches Round; it does not open another leaderboard page. Swift never sums `/matches` for this product.

### 12.4 Player Leaders

Use `/leaders.playerStandings` in canonical display-rank order. Each row includes:

- rank;
- display name;
- text team identity plus accent;
- canonical points; and
- canonical record where useful.

Ties retain the server's canonical display rank. The app does not break ties alphabetically or assign dense/sequential ranks independently. Null points use `—`, not zero.

Show the top 10 rows initially when the list is longer, plus `Show All` expanding in place. If the authenticated golfer is outside the initial set, show a separate `Your Position` row using the canonical rank without duplicating it in the expanded list. Emphasis uses label/weight and an accessibility annotation, not color alone.

V1 Player rows are **not tappable**. A native Player performance detail would expand scope, and the mobile DTO has no stable web profile URL/slug. This is the simplest useful V1 and avoids dead or misleading navigation. A web/native Player detail is P2.

### 12.5 Secondary leaderboards

| Module | Classification | Rationale |
| --- | --- | --- |
| Overall Tournament Score | Native V1 | Core tournament truth already available |
| Round team scores | Native V1 | Canonical `/leaders.roundStandings` is available |
| Player points/record | Native V1 | Already in canonical mobile standings |
| Separate Match-record board | Exclude as a module in V1 | Record is already secondary text in Player rows |
| Round Player performance | Post-V1 | No bounded mobile contract; less important than core scoring |
| Net Skins | Native V1 | Same participant DTO is available through isolated Preview and the separately gated Production reader |
| Published Odds Center | Web-backed V1 | Existing participant-facing web product; not tournament scoring truth |
| Calcutta standings | Native V1 in isolated Preview | `production-calcutta-v1` is the shared participant DTO; publication remains server-enforced and Production-native serving remains disabled |
| Career/statistical leaderboards | Web-backed V1 | Useful secondary history, outside live native loop |

#### 12.5.1 Calcutta V1 contract boundary

`GET /api/mobile/v1/calcutta` is the additive participant-safe Calcutta contract. It uses the existing verified Bearer session plus Bagger certification and derives the viewer only from the canonical Auth UUID → stable Player ID → active tournament membership chain. The request never selects a Player, tournament, environment, publication, or revision.

The contract states are `NOT_CONFIGURED`, `CONFIGURED`, `AUCTION_COMPLETE`, `IN_PROGRESS`, `OFFICIAL`, and `UNAVAILABLE`. Auction lifecycle and publication are separate: there is no `AUCTION_OPEN` because the installed product records the completed auction manually and has no live-bidding authority. An authenticated active participant receives the full market only when `publicationState` is `PUBLISHED`; unpublished purchase, ownership, and result facts remain absent. Explicit unpublish preserves the canonical lifecycle and facts, so an `IN_PROGRESS` or `OFFICIAL` response may be `UNPUBLISHED` with both market and result hidden.

The server supplies stable Player IDs and display names, recorded purchases and ownership, official Round inputs, ranks, points, and the complete participant-visible golfer/portfolio result. It supplies every USD money value and every ownership/payout/ROI fraction as a canonical decimal string because the authoritative rule is no payout rounding and valid results may contain fractions of a cent. Swift formats those values but never derives a payout, rank, tie award, ROI, ownership allocation, or finality state.

A result may be marked stale only when its configuration and completed-auction revisions still match the current canonical revisions. A configuration or auction change invalidates that result. `data.revision` binds configuration, auction, publication, result, lifecycle state, and publication state. The response `meta.revision` and ETag additionally bind the current source fingerprint and stale/updating flags, so a freshness transition cannot be hidden by a `304`; response timestamps are not authority.

Isolated Preview now supplies this same DTO from Preview Supabase through a service-only, configuration-fingerprint-bound publication ledger. A new Preview configuration returns to `UNPUBLISHED`; unpublished market and result values remain absent before Swift decoding. Production serving remains a later explicitly authorized milestone.

### 12.6 Leaders states

- Cold load: stable Tournament Score geometry and row skeletons.
- Cached: render immediately; animate value changes subtly without resorting the list before the new complete DTO is committed.
- Offline/stale: retain rows with a single freshness message; do not mark a cached team as currently leading without stale context.
- Empty Player standings: keep Tournament Score and say `Player results will appear after scoring begins.`
- Data unavailable: localized retry; Today and other tabs remain independently usable.
- Tournament final: winner emphasis, final score, final Player ranks; no live refresh cadence.

## 13. More

### 13.1 Purpose and exact grouping

More is curated, not a mirror of every website route. Use native list sections with concise descriptions only where ambiguity exists.

```text
TOURNAMENT
  Schedule                         Native
  Tournament Guide                 Web
  Courses                          Web
  Rules                            Web
  Published Odds                   Web

YOU
  Player Passport                  Native

HISTORY
  Tournament History               Web
  Records                          Web
  Career Statistics                Web

TRIP
  Dining                           Web
  Local Guide                      Web
  Important Contacts               Web

APP
  Settings                         Native
```

Course Archive is the web Courses destination rather than a duplicate row. Net Skins and published Calcutta belong in the native Leaders product once their canonical Preview readers are certified; they do not need duplicate More rows. Director, editing, publication, War Room, and intelligence tools never appear for normal participants.

### 13.2 Native V1 destinations

#### Schedule

The full Schedule is native and uses `/schedule`. Group events by canonical `date` in tournament timezone, with sticky or clear day headings. Within a day, preserve chronological `startAt` ordering.

Each event shows local start time, optional end time, title, optional subtitle, location, and type only when useful. Current events receive `Now`; completed events are visually subdued but readable; the next event receives a clear `Next` label. Missing optional fields collapse without placeholders.

Cached Schedule is fully browsable offline with a page-level freshness message. An empty successful response says `No schedule events are published yet.` An unavailable response preserves cache or shows retry without exposing Guide/editorial metadata.

#### Player Passport

The lightweight native account screen answers: **Who am I signed in as, and which tournament identity is this app using?**

From `/session` it shows:

- display name;
- team name/identity when non-null;
- tournament name/year;
- canonical Player ID only in a secondary support/diagnostics disclosure, not as headline copy;
- `Signed in` status;
- app version/build; and
- Sign Out.

Handicap is omitted because `/session` does not expose it and scoring handicap is Match-specific. Notification status may be added after APNs work; it is not a V1 placeholder row that leads nowhere. The screen does not recreate career profile, phone/email, Director role, or browser Player Passport credentials.

#### Settings

Settings remains minimal:

- signed-in Player summary linking to Player Passport;
- Sign Out;
- app version/build;
- Preview environment label in non-Production builds;
- privacy/support web links when canonical URLs are approved;
- bounded support identifier only if it contains no token, email, phone, or scoring intent; and
- notification status later, only when notification support exists.

Do not expose API URLs, Supabase project details, source selectors, raw Player links, environment variables, or service diagnostics.

### 13.3 Web-backed V1 destinations

Use an `SFSafariViewController`-style in-app browser for public participant web content, or open an approved universal link. Show a native browser title/close control so the boundary is obvious.

The native app must not inject the Supabase Bearer token, scoring credential, or queue content into a URL, cookie, JavaScript bridge, `WKWebView`, or arbitrary web request. If a page requires separate website authentication, the web surface owns that sign-in and the limitation is documented to testers.

| Destination | Existing route/product | Native V1 boundary |
| --- | --- | --- |
| Tournament Guide | `/tournament-guide` | Web-backed V1; rich editorial content remains web |
| Courses / Course Archive | `/courses` and detail routes | Web-backed V1; native Match screens show only current course context |
| Rules | `/rules` or Guide rules | Web-backed V1 |
| Tournament History | `/history` | Web-backed V1 |
| Records | `/records` | Web-backed V1 |
| Career Statistics / Player directory | `/statistics`, `/players` | Web-backed V1; no native Player row navigation |
| Dining | `/tournament-guide/dining` | Web-backed V1 |
| Local Guide | `/tournament-guide/getting-around` | Web-backed V1 |
| Important Contacts | `/tournament-guide/contacts` | Web-backed V1; system phone/link handling may occur inside Safari |
| Published Odds | `/odds-center` | Web-backed V1, clearly labeled projections rather than official Tournament Score |

### 13.4 Post-V1 native candidates

- selected Guide sections when a stable participant mobile projection exists;
- Courses/course-hole orientation;
- History, Records, and career profiles;
- rich Player detail from Leaders;
- Round Player performance if a bounded participant contract is later approved;
- Production activation of the approved Net Skins and Calcutta participant contracts as a separate authority milestone; and
- notifications and notification settings.

### 13.5 Web/Admin-only exclusions

The participant native app never links to:

- Director Mission Control or Director scoring controls;
- Guide editing or CMS administration;
- odds generation/publishing controls;
- War Room/team administrative intelligence;
- draft administration;
- data-health/source-authority controls;
- Supabase/Google diagnostic pages; or
- Match reopen/correction administration.

Public published intelligence may be linked as participant web content; its administration remains excluded.

## 14. Native versus web boundary summary

| Classification | Destinations |
| --- | --- |
| **Native V1** | Login/OTP, Today, Matches, Match Detail summary, Score, owned-Match Scorecard, Conflict Review, Leaders with Tournament/Round/Player standings, official Net Skins, published Calcutta, More, Schedule, Player Passport, Settings |
| **Web-backed V1** | Full Tournament Guide, Courses/Course Archive, Rules, History, Records, Career/Players/Statistics, Dining, Local Guide, Important Contacts, published Odds Center |
| **Post-V1 native** | Rich Guide modules, Courses, History/Records/Career, native Player detail, Round Player performance, notifications, and Production activation work that remains separately authorized |
| **Web/Admin only** | Director, Guide editing, odds publishing, War Room/admin intelligence, source/data health, draft admin, scoring correction/reopen |

## 15. Navigation model

Each tab owns a shallow navigation stack:

- **Today:** Match hero/row → Match Detail; Tournament Score → Leaders tab; Full Schedule → More's Schedule destination.
- **Matches:** row/hero → Match Detail; scoring CTA → Score tab focused on canonical Match ID.
- **Score:** active editor → Scorecard; affected hole → Conflict Review; Finish Match → confirmation sheet → final result state.
- **Leaders:** Round row → Matches tab with that Round selected; Player rows have no action in V1.
- **More:** native Schedule/Passport/Settings destinations or explicit in-app browser for web-backed content.

Avoid more than two pushes from a primary tab. Switching from Today/Matches into Score should activate the existing Score tab rather than push a second scoring screen. The selected Match ID is a navigation hint only; `/scoring/current?matchId` revalidates identity and Match scope.

### 15.1 Deep links

Conceptual schemes:

| Link | Destination | Gating behavior |
| --- | --- | --- |
| `bagger://today` | Today root | Auth/session gate, then current context |
| `bagger://matches` | Matches current/remembered Round | Auth and tournament required |
| `bagger://matches/<matchId>` | Match Detail | Validate participant-visible Match; missing/changed Match gets safe state |
| `bagger://score` | Contextual Score | Auth and canonical scoring state; never accepts Player ID |
| `bagger://leaders` | Leaders root | Auth under current mobile v1 contract |
| `bagger://schedule` | Native Schedule | Auth and current tournament |

Future universal links from the website and push notifications should resolve through the same router. A link received while signed out is retained only as a non-sensitive destination, then revalidated after sign-in. Match IDs never carry authority. No Associated Domains or notification implementation belongs in this step.

### 15.2 Future notification placeholders

Post-core notification categories may include Match approaching, scoring available, Match result, schedule change, and tournament update. Expected destinations are Today, Match Detail, Score, Schedule, and Leaders. Push is not required for the first TestFlight milestone and notification UI does not appear until the capability exists.

## 16. Empty and error states

### 16.1 Intentional empty states

| Condition | Product response |
| --- | --- |
| No current tournament | `There is no current Bagger tournament.` Show signed-in golfer, web History, and no Score capability |
| No Match in selected Round | `You are not scheduled in this Round.` Continue showing all Round Matches |
| No upcoming Match | Show most recent completed own Match or `No upcoming Match is scheduled.` |
| No Matches loaded after successful empty response | `No Matches are published for this Round.` |
| No leaderboard points yet | Team score `No points yet`; Player section `Player results will appear after scoring begins.` |
| No schedule events | `No schedule events are published yet.` |
| Scoring not yet available | Upcoming Match context plus `Scoring will become available for this Match.` |
| Tournament completed | Final context, results, and read-only scorecards rather than an empty live shell |
| No Player mapping | `This account is not linked to an active Bagger player.` Support/account path; no alternate identity creation |
| Mobile API unavailable | `Bagger mobile is temporarily unavailable in this build.` Retain safe stale cache; no authority fallback |

### 16.2 Error-to-product mapping

Raw API codes may be retained in bounded local diagnostics but are never shown as primary golfer copy.

| API/error class | Product state/copy concept | Action |
| --- | --- | --- |
| `UNAUTHORIZED`, `INVALID_TOKEN` | `Sign in again to continue.` | Restore/refresh session once, then Sign In; preserve hidden queue |
| `PARTICIPANT_NOT_FOUND` | `This account is not linked to an active Bagger player.` | Account/support; no retry loop |
| `MOBILE_API_UNAVAILABLE` | `Bagger mobile is temporarily unavailable in this build.` | Retain cache, retry with backoff; Preview remains fail-closed |
| Tournament read failure | `Tournament information could not be refreshed.` | Keep cache with timestamp; localized Retry |
| `SCORING_UNAVAILABLE` | `Scoring is temporarily unavailable. Your saved scores are safe.` | Preserve queue, Step 1D retry/backoff |
| `MATCH_NOT_FOUND` | `This Match is no longer available.` | Refresh Matches; retain unresolved intent for review |
| `SCORING_NOT_AUTHORIZED` | `Your scoring access has changed.` | Stop replay, refresh, Needs Review if intent exists |
| `SCORING_READ_ONLY` | `This scorecard is read-only.` | Refresh and show official state; preserve differing intent |
| `INVALID_SCORE_INPUT` | `This saved score could not be submitted.` | Needs Review/quarantine; no silent repair |
| `REVISION_CONFLICT` | `Hole N needs review.` | Open official-versus-saved comparison |
| `IDEMPOTENCY_CONFLICT` | `This saved score needs support review.` | Quarantine; no automatic retry/new ID |
| `FINALIZATION_NOT_READY` | `This Match is not ready to finish.` | Refresh/review scorecard and queue |
| `MATCH_ALREADY_FINALIZED` | `This Match is already final.` | Refresh final state; review unresolved local intent |
| `INTERNAL_ERROR` / unexpected 5xx | `Something went wrong while contacting Bagger.` | Same-ID retry only for unresolved mutation; generic read Retry |

Do not expose database exceptions, stack traces, source systems, revisions, mutation IDs, or authorization internals in normal UI.

## 17. Vocabulary

### 17.1 Match vocabulary

Use the same terms everywhere:

| Canonical meaning | Golfer-facing language |
| --- | --- |
| Scheduled/not started | `Upcoming` |
| `inProgress` | `Live` |
| Completed/finalized | `Final` |
| Even Match | `Tied` |
| One-hole advantage | `1 UP` |
| Larger current advantage | `2 UP`, `3 UP`, etc., only from canonical status text |
| Dormie/final margin | Canonical result such as `3 & 2`; do not reconstruct |
| Progress | `Thru 7` |
| Round | `Round 2`, not `R2` in primary copy |

Backend terms such as `inProgress`, `permissionRevision`, `matchRevision`, or `teamOne` do not appear. Team names replace generic side labels.

### 17.2 Scoring/reliability vocabulary

| Internal meaning | Approved copy |
| --- | --- |
| Canonically acknowledged/equivalent | `Official` |
| Durably local, unacknowledged | `Saved on iPhone` |
| Network submission active | `Syncing` |
| Transport unavailable | `Offline` or `Waiting to sync` |
| Transient backoff | `Retrying` / `Waiting to sync` |
| Conflict/action/quarantine | `Needs Review` |
| Canonical no-write state | `Read-only` / `Scorecard is read-only` |
| Final lifecycle | `Final` / `Match Final` |
| Auth recovery | `Sign in again` |
| Environment/authority failure | `Scoring unavailable` |

Never use `mutation`, `revision`, `idempotency`, `RPC`, `queue`, `Bearer`, `token`, or `capability` in ordinary golfer-facing copy.

### 17.3 Tournament terminology

- **Tournament Score:** team-versus-team total, such as `Pickles 8½ — 7½ Rippers`.
- **Round Score:** team points earned within one Round.
- **Player Leaders:** individual canonical performance.
- **Score:** hole score entry, never shorthand for standings.

## 18. Visual direction and identity

The app should look related to Bagger Invitational without looking like a screenshot of the website:

- native navigation and typography;
- strong but compact Bagger branding;
- restrained cards with clear hierarchy;
- generous whitespace around actions, denser rows where scanning benefits;
- large scoring controls and sunlight-readable contrast;
- team accents used consistently;
- course identity used for orientation; and
- no blanket glass effects, excessive gradients, repeated giant logos, or card-inside-card dashboards.

### 18.1 Team identity

Across Today score, Match cards, Score, Leaders, and Passport, use the same mapping of canonical `teamId` to:

- team name text (always present when available);
- one restrained accent color;
- optional small bundled logo/mark; and
- an accessibility label.

Color never replaces the team name. On mixed-team Match rows, accents should be narrow edges, small marks, or labels rather than full saturated backgrounds.

The mobile API does not provide asset URLs; native asset mapping is a P2 asset-delivery gap. V1 may bundle approved team marks keyed by stable canonical team ID, with a text/accent fallback.

### 18.2 Course identity

Course name is useful on Match hero, Match Detail, and Score header. Tee appears as secondary context. A small course logo may be bundled later when it helps orientation, but repeated course logos do not belong in every Match-list row. Yardage/hole identity belongs in Score; broader course editorial content remains web-backed V1.

### 18.3 App icon and launch branding

The eventual icon should be a standalone recognizable Bagger mark, readable at small iOS sizes, without tiny text. Launch branding is brief and cannot delay the shell. Asset design is a later step; existing PWA icons are references, not automatically accepted native production artwork.

## 19. Accessibility and golf-course usability

Native V1 must satisfy:

- Dynamic Type through accessibility sizes; dense tables reflow instead of clipping.
- VoiceOver reading order follows visual hierarchy and announces Match/team/status context once, not on every decorative mark.
- Primary score targets are at least 48 points; 52–56 points is preferred.
- Contrast remains legible in bright sun in light and dark appearance; disabled states remain distinguishable.
- Status never relies on color, a tiny icon, haptic, animation, or transient toast.
- Team identity includes team names; Match state includes text.
- Every gesture has a visible button alternative.
- Score entry requires no keyboard, horizontal scrolling, precision drag, or repeated modal confirmation.
- Conflict, offline, read-only, and final state text persists and is exposed to accessibility APIs.
- Focus moves to inline validation/error summary after failed Save, OTP, or conflict action.
- Reduced Motion disables nonessential transitions; Bold Text and Increase Contrast remain usable.

Physical-device acceptance must include one-hand/thumb-only four-player Best Ball entry in bright outdoor light, while walking/standing, with intermittent connectivity and potentially wet hands. A hardware keyboard cannot be assumed.

### 19.1 Haptics

Future haptics may reinforce:

- score selection with a light, rate-limited tick;
- successful canonical acknowledgement with a subtle success event;
- conflict/error with a distinct warning; and
- finalization with a stronger success event.

Haptics never replace visible/text feedback, and routine four-player entry must not vibrate excessively.

### 19.2 Animation

Use restrained animation for Match-card state changes, acknowledgement, leaderboard value transitions, and conflict presentation. Never delay input or navigation. Routine hole saves receive subtle feedback; stronger tournament-final celebration can be evaluated post-V1. Reduced Motion receives immediate state changes/fades.

## 20. Performance experience targets

These are perceived-product expectations, not unmeasured service-level promises:

- Cached primary tabs feel immediate.
- Cold API screens show a useful shell/placeholder quickly.
- Tab switches never wait on a new network request.
- Local Score Save feels immediate because durable persistence precedes asynchronous network work.
- Offline Score Save immediately confirms local safety.
- Leaders updates in place without returning to a full-screen spinner.
- Match-level score sync is serialized per Step 1D; the UI does not create concurrent dependent writes to appear faster.
- Background sync is opportunistic; correctness works with no background time.

Avoid continuous polling, repeated auth refresh, per-row network requests, or syncing every queue record concurrently. Cache once per product revision and share decoded data among Today/Matches/Leaders sections inside the same identity/tournament partition.

## 21. Data-source and cache matrix

Every product claim below was checked against the Step 1A–1C schemas and adapters. `Auth` means Supabase session plus Step 1A canonical Player resolution. `Local queue` means the approved Step 1D state machine, not an API source.

| UI surface | Data source | Cache policy | Auth | Missing data / rule |
| --- | --- | --- | --- | --- |
| Environment gate | `GET /api/mobile/v1/health` | No-store; use for startup/environment diagnostics, not continuous polling | No | Returns Preview compatibility only; no secrets |
| Signed-in golfer/tournament | `GET /api/mobile/v1/session` | Private no-store; persist minimal protected context for launch partition selection | Yes | No handicap, email, phone, profile URL, or role |
| Today tournament header | `/today.data.tournament` | Private local cache + ETag | Yes | No canonical day number/date |
| Today relevant Match | `/today.data.currentMatch` | Same `/today` ETag | Yes | Live differential absent in read DTO; augment own Match with `/scoring/current` |
| Today Your Matches | `/matches`, filter `authenticatedPlayer.involved` | Private cache + ETag | Yes | Available across Rounds; no separate endpoint needed |
| Today Tournament Score | `/leaders.teamStandings` | Private cache + ETag | Yes | Available; parallel/local shared product, not in `/today` |
| Today immediate Schedule | `/today.immediateSchedule` | `/today` cache + ETag | Yes | Maximum three; current/future published events only |
| Today bounded Pulse | `/matches` status/progress counts | `/matches` cache | Yes | Counts only; narrative/live advantage gap |
| Matches Round selector | `/matches.tournament.currentRound` + distinct `roundNumber` | `/matches` cache + ETag | Yes | No separate Round catalog; use only returned Rounds |
| Matches Your Match hero | `/matches` + `/scoring/current?matchId` when owned | Read cache plus no-store scoring refresh | Yes | Own canonical live status available through scoring; permission always scoring endpoint |
| All Round Matches | `/matches.matches` | Private cache + ETag | Yes | Live current hole exists; live differential/status text for other Matches absent |
| Match Detail summary | Selected `/matches` row | Private cache + ETag | Yes | Round/format/course/tee time/participants/progress/final result supported |
| Owned Match Detail progress | `/scoring/current?matchId` | Private no-store; protected last-known snapshot only | Yes + Match membership | Supported for own Match |
| Non-owned Match hole detail | None in mobile v1 | None | — | P2 gap; summary only |
| Score upcoming context | `/scoring/current` plus matching `/today` or `/matches` tee time | Scoring no-store; read DTO cached | Yes + canonical Match | Supported by composition; tee time absent from scoring DTO |
| Score active Match/context | `/scoring/current` | Private/no-store/no ETag | Yes + scoring authorization | Full sides, slots, format, course holes, handicap/strokes, scores, progress, permission |
| Score local reliability | Step 1D durable queue and last canonical snapshot | Durable protected local transaction; no shared cache | Same identity partition | Never official by itself |
| Save Hole | `POST /scoring/hole` | No-store; persist acknowledgement atomically | Yes + canonical authorization | Client sends gross intent only; 1–20; BB 2/side, SC/SI 1/side |
| Conflict Review | Step 1D record + refresh `/scoring/current?matchId` | Protected durable record; scoring refresh no-store | Same identity/Match | Reapply uses new mutation ID/current revisions |
| Scorecard, owned Match | `/scoring/current.scores` + local overlay | Canonical snapshot no-store/last-known; local queue durable | Yes + Match membership | Supported up to 18 holes |
| Finalization | Refresh `/scoring/current`, then `POST /scoring/finalize` | No-store; outcome probe only per Step 1D | Yes + `canFinalize` | Online-only; no blind retry |
| Leaders Tournament Score | `/leaders.teamStandings` | Private cache + ETag | Yes | Canonical overall points/rank/record |
| Leaders Round Scores | `/leaders.roundStandings` | Private cache + representation ETag | Yes | Canonical team scores/status by Round; never derive from Match list |
| Player Leaders | `/leaders.playerStandings` | Private cache + ETag | Yes | Rank/name/team/points/record; no profile URL |
| Net Skins | `/net-skins` | Private cache + representation ETag | Yes | Server-enforced `OFFICIAL_ONLY`; no provisional payout authority in Swift |
| Published Calcutta | `/calcutta` | Private cache + representation ETag | Yes | Market/result only when server publication is `PUBLISHED`; canonical decimal strings |
| Full Schedule | `/schedule` | Private cache + ETag | Yes | Published participant itinerary only |
| Player Passport | `/session` + local app build metadata | Session no-store; protected minimal local context | Yes | Handicap and rich career/profile fields absent |
| Settings | Local app metadata/session state; approved public support/privacy URLs | Local | Session only for account actions | No backend configuration exposed |
| Web-backed More pages | Existing participant website routes | Browser-managed web cache | Depends on page | No Bearer-token bridge; separate web auth may be required |

### 21.1 Date/time behavior

- Schedule calendar dates are `YYYY-MM-DD` and absolute times are ISO-8601 UTC, interpreted/displayed with the returned tournament IANA `timeZone`.
- Schedule also has normalized tournament-local clocks. The app formats these using the device locale while retaining tournament timezone semantics.
- Match tee times contain only `localTime`, `timeZone`, and a label; there is no canonical calendar date. The app displays the local time within Round context and does not create an absolute instant or notification from it.
- `meta.generatedAt` is response generation time, not tournament data truth; ETag/revision determines product change.
- Scoring `meta.generatedAt` is not a revision. Match/hole revisions are internal concurrency data and never user copy.

### 21.2 Verified contract mappings

- `mobileTodayResult` reuses participant Home plus published Guide schedule, chooses live → scheduled → recent completed, and returns at most three events.
- `mobileMatchesResult` reuses Tournament Live plus Guide course projection and returns all participant-visible matches.
- `mobileLeadersResult` reuses Leaderboards Core plus its canonical team/Player ranking helpers.
- `mobileScheduleResult` returns the published participant Guide projection only.
- Mobile scoring delegates to the same canonical scoring persistence/finalization authority; the native UI must never duplicate those calculations.
- Step 1D is exactly compatible with `accepted:true`, `idempotent:true`, `REVISION_CONFLICT`, `IDEMPOTENCY_CONFLICT`, scoring-current refresh, and explicit online finalization.

## 22. Contract gap register

Priority definitions:

- **P0 — Blocks first native build:** cannot produce the first useful authenticated SwiftUI shell/core flow.
- **P1 — Blocks recommended V1:** Xcode work can begin, but the recommended TestFlight product should close the gap.
- **P2 — Post-V1 enhancement:** useful, but the core native tournament/scoring loop remains truthful without it.

### 22.1 P0 gaps

**None.** Authentication, canonical identity, the primary read products, the authenticated golfer's scoring snapshot, durable-queue-compatible mutations, conflict handling, and finalization are sufficient to begin Xcode work.

### 22.2 P1 gaps

| Gap | Screen / desired information | Why it matters | Closest existing mobile source | Suggested later backend step |
| --- | --- | --- | --- | --- |
| Live differential for participant-visible non-owned Matches | Matches list/Match Detail: `Tied`, `2 UP`, etc. while live | `Live · Thru N` is truthful but less informative; acceptance target is full Round awareness | `/matches.progress.currentHole`; owned Match `/scoring/current.progress.statusText` | Add a participant-safe canonical `statusText`/match-state summary to Match DTO from Tournament Live authority; do not expose hole scores or revisions |

The first SwiftUI build and even an internal Preview milestone can proceed with these sections omitted/degraded. The recommended TestFlight V1 should resolve them or explicitly approve the reduced presentation.

### 22.3 P2 gaps

| Gap | Screen | Closest source / current behavior | Post-V1 recommendation |
| --- | --- | --- | --- |
| Narrative/team-leading Tournament Pulse | Today | `/matches` supports status/current-hole counts only; existing web storylines are not a mobile contract | Add a bounded participant-safe Pulse DTO only if product evidence shows value; V1 omits narrative |
| Hole-by-hole spectator detail for non-owned Matches | Match Detail | `/matches` summary only; `/scoring/current` is membership-scoped | Add read-only participant Match detail product with canonical hole status if needed; preserve scoring authorization isolation |
| Passport handicap | Player Passport | `/session` intentionally omits handicap; scoring snapshot has Match-specific handicap context | Add an authoritative participant-safe current handicap only if product requirement is confirmed; do not reuse Match-specific value as global profile truth |
| Team/course/logo asset URLs or manifest | All visual identity | Stable IDs/names exist; repository has web assets but no native asset contract | Approve and bundle native asset catalog keyed by canonical IDs, or add a versioned public asset manifest later |
| Completed scorecard for non-owned Matches | Match Detail | Owned Match is available through membership-scoped scoring current; final summary exists for all | Same spectator Match detail product as above |
| Rich native Player detail/profile URL | Leaders | Standings has Player ID/name/team but no slug/URL/career DTO | Keep rows inert in V1; add native profile contract or explicit public URL later |
| Canonical tournament day number/date | Today header | Tournament DTO has current Round/status/timezone; Schedule has event dates | Add optional canonical tournament-day context if it improves multi-day navigation |
| Absolute Match tee-time instant | Matches/deep links/notifications | Match tee time has local clock/zone but no date | Add canonical tee timestamp/date before tee-time notifications; display-only V1 remains safe |
| Rich native Guide/Courses/History/Records | More | Existing web products | Convert selectively after the core tournament loop proves value |
| APNs categories/deep links | App-wide | Product concepts only | Post-core notifications project; not first TestFlight blocker |

### 22.4 Required expected-gap answers

- **Tournament Score on Today:** available by composing canonical `/leaders`; not a gap.
- **Round Scores on Leaders:** available through canonical `/leaders.roundStandings`; not a gap.
- **Your Matches across all Rounds on Today:** available from `/matches` filtered by canonical relationship; not a gap.
- **Match current score/status:** owned Match available from `/scoring/current`; non-owned live differential is P1.
- **Hole-by-hole non-scoring Match Detail:** P2 gap.
- **Player handicap for Player Passport:** P2 gap; omit in V1.
- **Tournament Pulse:** bounded counts available; narrative/team-lead form is P2.
- **Logos/team/course assets:** IDs/names exist; delivery/catalog is P2.
- **Completed scorecard access:** owned Match supported; non-owned scorecard is P2.

## 23. Screen inventory

Native V1 contains **13 native destinations**, plus a reusable web-browser container and small modal/sheet flows. Contextual states are not multiplied into separate screens.

| # | Destination | Type | Primary entry | Data source | Auth | Cache/offline | Major states and actions | Priority |
| ---: | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Sign In | Native | Launch/auth gate | Supabase Auth | No | Retain entered email transiently; no private cache | Email, network error, unauthorized identity path | Must ship |
| 2 | OTP Verification | Native | Sign In | Supabase Auth then `/session` | Pending | No scoring replay until verified | Invalid/expired/resend/change email | Must ship |
| 3 | Today | Native tab root | Tab/deep link | `/today`, `/matches`, `/leaders` | Yes | ETag cache; stale/offline labels | Before/live/between/final/no tournament | Must ship |
| 4 | Matches | Native tab root | Tab/deep link | `/matches` | Yes | ETag cache | Round selected/empty/live/final/offline | Must ship |
| 5 | Match Detail | Native | Today/Matches/deep link | `/matches`; owned augmentation `/scoring/current` | Yes | Summary cache; scoring no-store/last-known | Upcoming/live/final/missing; authorized CTA | Should ship |
| 6 | Score | Native tab root | Tab/Today/Matches/deep link | `/scoring/current`, `/scoring/hole`, Step 1D | Yes + Match authorization | No-store canonical + durable local queue | All 11 contextual states | Must ship |
| 7 | Scorecard | Native | Score/owned Match Detail | `/scoring/current.scores` + Step 1D overlay | Yes + Match membership | Protected last-known + durable local states | Active/review/final/prior edit | Must ship |
| 8 | Conflict Review | Native | Score status/Scorecard | Step 1D + scoring-current refresh | Same queue partition | Durable protected intent; no shared cache | Keep Official/Reapply/support review | Must ship |
| 9 | Leaders | Native tab root | Tab/Today/deep link | `/leaders` | Yes | ETag cache | No points/live/final/stale | Must ship |
| 10 | More | Native tab root | Tab | Static inventory/session | Basic shell; account actions yes | Static/offline | Grouped destinations | Must ship |
| 11 | Schedule | Native | More/Today/deep link | `/schedule` | Yes | ETag cache; full offline browsing | Day/current/next/empty/stale | Must ship |
| 12 | Player Passport | Native | More/Settings | `/session` | Yes | Minimal protected context | Signed in/team null/no tournament/sign out | Must ship |
| 13 | Settings | Native | More | Local build/session, approved links | Account actions yes | Available offline | Preview indicator/sign out/version | Must ship |
| — | Participant web browser | In-app Safari container | More items | Existing website | Page-dependent | Browser policy; network generally required | Separate web auth may appear; no token bridge | Should ship |

Modal/sheet flows include score numeric selection, finalization confirmation/unknown-outcome check, sign-out warning with unresolved intent, and optional localized error details. They are not independent navigation roots.

## 24. Low-fidelity text wireframes

The wireframes express hierarchy and actions only. Names, courses, times, teams, and results are synthetic examples.

### 24.1 Today — before Match

```text
┌─────────────────────────────────────┐
│ TODAY                         ↻     │
│ Bagger Invitational 2026            │
│ Round 2 · Upcoming                   │
├─────────────────────────────────────┤
│ YOUR NEXT MATCH · ROUND 2            │
│ Clay + Connor                        │
│              vs                      │
│ Jack + Wade                          │
│ Pinehurst No. 4 · 9:20 AM            │
│ [ View Match ]                       │
├─────────────────────────────────────┤
│ YOUR MATCHES                         │
│ ✓ Round 1   Won 2 & 1             › │
│   Round 2   9:20 AM               › │
│   Round 3   2:10 PM               › │
├─────────────────────────────────────┤
│ TOURNAMENT SCORE                     │
│ Pickles        4½ — 3½      Rippers │
│ Round 2 · Upcoming              ›    │
├─────────────────────────────────────┤
│ TODAY                                │
│ 7:00 AM  Breakfast                   │
│ 9:20 AM  Round 2 · Pinehurst No. 4   │
│ 1:30 PM  Lunch                       │
│ View Full Schedule                ›  │
└─────────────────────────────────────┘
 Today   Matches   Score   Leaders  More
```

### 24.2 Today — live Match

```text
┌─────────────────────────────────────┐
│ TODAY                               │
│ Bagger Invitational 2026            │
│ Round 2 · Live                       │
├─────────────────────────────────────┤
│ YOUR MATCH · THRU 7                  │
│ Clay + Connor                        │
│              2 UP                    │
│ Jack + Wade                          │
│ Pinehurst No. 4                      │
│ [ Continue Scoring ]                 │
│ ✓ Official through Hole 6            │
├─────────────────────────────────────┤
│ YOUR MATCHES                         │
│ ✓ Round 1   Won 2 & 1             › │
│ ● Round 2   Live · Thru 7          › │
│   Round 3   2:10 PM               › │
├─────────────────────────────────────┤
│ TOURNAMENT SCORE                     │
│ Pickles        8½ — 7½      Rippers │
│ Round 2 · In Progress           ›    │
├─────────────────────────────────────┤
│ TOURNAMENT PULSE                     │
│ 4 Matches live · 3 final             │
└─────────────────────────────────────┘
 Today   Matches   Score   Leaders  More
```

### 24.3 Matches — current Round

```text
┌─────────────────────────────────────┐
│ MATCHES                             │
│ ‹ Round 1     ROUND 2 · LIVE     3 ›│
├─────────────────────────────────────┤
│ YOUR MATCH · ROUND 2                 │
│ Clay + Connor       2 UP             │
│ Jack + Wade         Thru 7           │
│ Pinehurst No. 4 · Best Ball          │
│ [ Continue Scoring ]                 │
├─────────────────────────────────────┤
│ ROUND 2 MATCHES                      │
│ Smith + Lee vs Jones + Ray           │
│ Live · Thru 5                     ›  │
│                                     │
│ Davis + King vs Hill + Cole          │
│ Upcoming · 9:40 AM                ›  │
│                                     │
│ Bell + Long vs Wood + Park           │
│ Final · Won 1 UP                  ›  │
└─────────────────────────────────────┘
 Today   Matches   Score   Leaders  More
```

For non-owned live rows, the differential line is omitted until the P1 contract gap is closed; `Live · Thru N` remains.

### 24.4 Score — upcoming Match

```text
┌─────────────────────────────────────┐
│ SCORE                               │
│ YOUR NEXT MATCH · ROUND 3            │
│                                     │
│ Clay + Connor                        │
│              vs                      │
│ Jack + Wade                          │
│                                     │
│ Pinehurst No. 2 · 2:10 PM            │
│ Best Ball                            │
│                                     │
│ Scoring will become available for   │
│ this Match.                          │
│                                     │
│ [ View Match ]       [ Check Again ] │
└─────────────────────────────────────┘
 Today   Matches   Score   Leaders  More
```

### 24.5 Score — active scoring

```text
┌─────────────────────────────────────┐
│ SCORE        Round 2 · No. 4    ☷   │
│ Pickles 2 UP · Thru 6                │
│ ✓ Official through Hole 6            │
├─────────────────────────────────────┤
│                HOLE 7                │
│        Par 4 · 412 yds · HCP 3       │
│                                     │
│ Clay                    receives 1   │
│ [   −   ]     [  4  ]     [   +   ] │
│ Connor                               │
│ [   −   ]     [  5  ]     [   +   ] │
│ Jack                                 │
│ [   −   ]     [  5  ]     [   +   ] │
│ Wade                     receives 1  │
│ [   −   ]     [  6  ]     [   +   ] │
│                                     │
│ [          Save & Next          ]    │
│ ‹ Previous       Scorecard      Next ›│
└─────────────────────────────────────┘
 Today   Matches   Score   Leaders  More
```

### 24.6 Score — offline

```text
┌─────────────────────────────────────┐
│ SCORE        Round 2 · No. 4    ☷   │
│ Pickles 2 UP · Last updated 9:42 AM  │
│ Offline · 2 holes saved on iPhone    │
├─────────────────────────────────────┤
│                HOLE 9                │
│        Par 4 · 390 yds · HCP 7       │
│ [ same large score controls ]        │
│                                     │
│ [          Save & Next          ]    │
│ Scores stay on this iPhone and will  │
│ sync when Bagger is reachable.       │
│ Finish Match is unavailable offline. │
└─────────────────────────────────────┘
 Today   Matches   Score•  Leaders  More
```

### 24.7 Score — conflict

```text
┌─────────────────────────────────────┐
│ HOLE 7 NEEDS REVIEW                  │
│ Official scoring changed while your  │
│ saved score was waiting.             │
├──────────────────┬──────────────────┤
│ YOUR SAVED SCORE │ OFFICIAL SCORE   │
│ Clay       4     │ Clay       4     │
│ Connor     5     │ Connor     4     │
│ Jack       5     │ Jack       5     │
│ Wade       6     │ Wade       6     │
├──────────────────┴──────────────────┤
│ [ Keep Official Score ]              │
│ [ Reapply My Score ]                 │
│ Reapply will check the official      │
│ score again before saving.           │
└─────────────────────────────────────┘
```

### 24.8 Score — completed Match

```text
┌─────────────────────────────────────┐
│ SCORE                               │
│ ROUND 2 COMPLETE                     │
│                                     │
│ Clay + Connor                        │
│            WIN 3 & 2                 │
│ Jack + Wade                          │
│                                     │
│ Match Final                          │
│ [ View Scorecard ]                   │
│                                     │
│ NEXT: Round 3 · 2:10 PM              │
│ [ View Next Match ]                  │
└─────────────────────────────────────┘
 Today   Matches   Score   Leaders  More
```

### 24.9 Leaders

```text
┌─────────────────────────────────────┐
│ LEADERS                             │
│ BAGGER INVITATIONAL 2026             │
│                                     │
│ Pickles       8½ — 7½       Rippers │
│ Round 2 · In Progress                │
├─────────────────────────────────────┤
│ ROUND SCORES                         │
│ Appears only after P1 contract       │
│ support; no client-derived totals.   │
├─────────────────────────────────────┤
│ PLAYER LEADERS                       │
│ 1  Player One        Pickles   5 pts │
│ 2  Player Two        Rippers  4½ pts │
│ 3  Player Three      Pickles   4 pts │
│ ─  Your Position                    │
│ 9  Signed-in Golfer  Rippers   2 pts │
│ [ Show All ]                         │
└─────────────────────────────────────┘
 Today   Matches   Score   Leaders  More
```

### 24.10 More

```text
┌─────────────────────────────────────┐
│ MORE                                │
│ TOURNAMENT                           │
│ Schedule                          ›  │
│ Tournament Guide         Web      ↗  │
│ Courses                  Web      ↗  │
│ Rules                    Web      ↗  │
│ Published Odds           Web      ↗  │
│                                     │
│ YOU                                  │
│ Player Passport                  ›   │
│                                     │
│ HISTORY                              │
│ Tournament History       Web      ↗  │
│ Records                  Web      ↗  │
│ Career Statistics        Web      ↗  │
│                                     │
│ TRIP                                 │
│ Dining · Local Guide · Contacts   ↗  │
│                                     │
│ APP                                  │
│ Settings                         ›   │
└─────────────────────────────────────┘
 Today   Matches   Score   Leaders  More
```

### 24.11 Login

```text
┌─────────────────────────────────────┐
│          [ Bagger mark ]             │
│       Sign in to Bagger              │
│ Use the email linked to your         │
│ tournament identity.                 │
│                                     │
│ Email                                │
│ [ golfer@example.com              ]  │
│ [ Send Code ]                        │
│                                     │
│ No account creation. Need help?      │
│ Contact tournament support.          │
│                              PREVIEW │
└─────────────────────────────────────┘

OTP state:
│ Enter the code sent to …             │
│ [          code field             ]  │
│ [ Verify ]   Resend code              │
```

### 24.12 Match Detail

```text
┌─────────────────────────────────────┐
│ ‹ ROUND 2 MATCH                     │
│ Live · Thru 7                        │
│                                     │
│ Clay + Connor                        │
│              2 UP                    │
│ Jack + Wade                          │
│                                     │
│ Best Ball                            │
│ Pinehurst No. 4 · Blue Tee           │
│ 9:20 AM                              │
│                                     │
│ [ Continue Scoring ]  (if authorized)│
│ [ View Scorecard ]    (owned Match)  │
│                                     │
│ Other Matches show summary only      │
│ until spectator-hole contract exists.│
└─────────────────────────────────────┘
```

### 24.13 Scorecard

```text
┌─────────────────────────────────────┐
│ ‹ SCORECARD             Round 2      │
│ Pickles 2 UP · Thru 7                │
│                                     │
│ Hole  Par   Clay Con. Jack Wade State│
│  1    4      4    5    5    6   ✓   │
│  2    3      3    4    3    4   ✓   │
│  3    5      5    6    6    5   ✓   │
│  7    4      4    5    5    6 Review│
│  8    4      4    4    5    5 Local │
│  9    4      —    —    —    —       │
│                                     │
│ Tap an official prior hole, then     │
│ choose Edit Hole when authorized.    │
│                                     │
│ [ Review Hole 7 ]                    │
│ [ Finish Match ] (only when canonical│
│                    and queue resolved)│
└─────────────────────────────────────┘
```

## 25. Step 1D reliability-to-product mapping

Step 1D remains authoritative for persistence and transitions. This section defines only what those states mean to a golfer and how strongly the UI responds.

| Queue/server state | Golfer-facing state | Default treatment | Interaction consequence |
| --- | --- | --- | --- |
| No unresolved record; canonical value refreshed | Official | Subtle text/check in status row and scorecard | Normal scoring continues |
| `queued` before transport | Saved on iPhone | Persistent but calm status; optional pending count | Golfer may advance after durable save |
| `syncing` | Syncing | Inline activity, no full-screen block | Duplicate Save for same intent disabled |
| `retryable` with reachability unavailable | Offline / Waiting to sync | Persistent informational banner/row | Local Save may continue if Step 1D context remains valid; no finalization |
| `retryable` with repeated transient failure | Retrying / Waiting to sync | Persistent warning plus eligible Retry | Same mutation ID only; no retry of permanent conditions |
| `conflict` | Needs Review | High-priority persistent Match/hole indicator | Pause affected Match queue; open comparison |
| `actionRequired` | Needs Review, Sign in again, or Scoring access changed | Blocking message tailored to reason | No automatic score submission until canonical revalidation/resolution |
| `quarantined` | Needs Review / Support review | Blocking persistent state; no raw corruption details | No submission; explicit review/support/abandonment only |
| `acknowledged` with refresh pending | Saved officially; checking scorecard | Short persistent progress state | Do not resubmit; finalization remains blocked until refresh |
| `acknowledged` and refreshed | Official | Subtle success | Eligible for bounded local cleanup under Step 1D |
| `resolved` | Official or resolved review receipt | Usually disappears from active UI after canonical refresh | No submission; bounded local receipt only |
| Canonical read-only | Read-only | Persistent state and viewable official values | No mutation controls |
| Canonical completed | Match Final | Result-focused state | No mutation controls; scorecard read-only |

Severity guidance:

- **Subtle:** Official, short Syncing, recently updated.
- **Persistent but non-blocking:** Saved on iPhone, Offline, transient Retrying, stale read content.
- **Persistent warning:** Scoring unavailable, auth restoration required, access changed.
- **Blocking for affected Match/finalization:** Needs Review, read-only mutation attempt, identity mismatch, quarantine, unresolved finalization outcome.

### 25.1 App termination and recovery UX

The app makes no promise of background completion. On foreground launch/resume:

- `queued` stays saved and eligible;
- interrupted `syncing` becomes an unknown-outcome retry using the same mutation ID;
- a crash after server acceptance but before durable local acknowledgement safely obtains `idempotent:true` on replay;
- an acknowledgement with failed refresh displays checking/waiting and never resubmits;
- unresolved conflict remains Needs Review with original intent; and
- auth must be restored before any worker resumes.

Recovery should be quiet when successful. A golfer does not need a crash-recovery dialog merely because same-ID replay resolved canonically.

### 25.2 Same-hole edit UX

The product follows Step 1D's hybrid rule:

- identical unresolved intent selects the existing saved record;
- a different intent that is provably never transmitted can supersede the old record locally, but the new durable intent gets a new mutation ID;
- a submitted, possibly submitted, syncing, retryable, or conflicted intent is never coalesced away; correction waits in order or requires resolution; and
- an entry identical to official state creates no new write.

Normal UI says only `Saved on iPhone`, `Waiting to sync`, or `Needs Review`. It does not expose the local supersession receipt.

### 25.3 Manual Retry

`Retry` appears only for a transient eligible record. It reuses the same mutation ID and observes Step 1D's minimum delay/backoff. It is not present for revision conflict, idempotency conflict, invalid input, read-only, revoked permission, final Match, identity mismatch, or quarantine. The UI never suggests that Retry can override tournament authority.

## 26. Preview/development environment experience

Initial native builds use isolated Preview authority. Testers must see a clear environment marker without shaping eventual Production UX:

- a restrained but persistent `PREVIEW` capsule in the signed-in tab shell or navigation bar;
- a prominent `Preview Environment` row in Settings;
- app icon/build display name may use a development suffix during internal testing; and
- environment is fixed by signed build configuration, not a golfer-editable server picker.

Preview status is text plus an accessibility label, not color alone. No UI exposes Supabase URLs, source selectors, Google IDs, or environment variables. Production cutover is a separate approved phase; the Preview app continues to fail closed outside intentional authority.

## 27. Product acceptance criteria

### 27.1 Today

A golfer can determine within seconds:

- tournament year/state/current Round;
- their most relevant Match and its upcoming/live/final status;
- the primary action for that Match;
- personal Matches across Rounds without mistaking the list for all Matches;
- canonical Tournament Score; and
- up to three important immediate schedule events.

Today renders cached content immediately when available, refreshes sections without a full-screen spinner, labels material stale/offline data, and remains useful when one secondary product fails. It does not require Tournament Pulse.

### 27.2 Matches

A golfer can:

- see and change the selected Round;
- find their Match first when scheduled in that Round;
- scan every participant-visible Match in the Round;
- distinguish Upcoming, Live, and Final;
- see tee time before play, progress when live, and result when final to the extent the canonical DTO supplies it; and
- open Match Detail or activate authorized scoring.

The screen never calculates a live differential or exposes scoring/Director capability from the read DTO.

### 27.3 Score

An authorized scorer can:

- understand upcoming, unavailable, writable, read-only, and completed context;
- enter all format-required gross values one-handed without a keyboard;
- explicitly Save & Next only after required values are confirmed;
- have intent committed durably before any network attempt;
- continue through ordinary connectivity loss;
- distinguish Saved on iPhone, Syncing, Official, Offline, and Needs Review;
- review a scorecard and deliberately correct a prior hole while authorized;
- compare local intent with official score and Keep Official or Reapply safely;
- recover after app termination or response loss without duplicate effect; and
- finalize only online after all local work resolves and canonical `canFinalize=true`.

No golfer action submits Player identity, handicap, strokes, net, winner, result, points, or lifecycle state.

### 27.4 Leaders

A golfer can understand:

- the canonical overall Tournament Score;
- current Round/tournament state;
- leading/tied/final team treatment;
- canonical top Player ranks, points, and useful records; and
- their own canonical position when outside the initial top rows.

Round Scores use the authoritative `/leaders.roundStandings` projection. Their values cannot be filled or amended by client calculation.

### 27.5 More

A golfer can find native Schedule, Player Passport, and Settings quickly; can reach curated Guide/Courses/Rules/History/Trip resources without cluttering the main loop; can recognize web-backed content before opening it; and never sees Director/admin destinations.

### 27.6 Cross-cutting acceptance

- Every primary tab has cold-loading, cached, offline/stale, empty, authentication, unavailable, and unexpected-error behavior.
- Each tab stack restores reasonable context without creating duplicate Score screens.
- Dynamic Type, VoiceOver, contrast, Reduce Motion, and minimum target checks pass.
- Preview builds are unmistakable.
- No web view receives a native Bearer token.
- No stale cached Match/Leader value is presented as current while offline.
- No unresolved local scoring intent is presented as official or silently removed.

## 28. Twenty-day V1 scope check

The 20-day target is achievable only if the core tournament/scoring loop displaces optional native content. Scope classifications follow product value, not implementation novelty.

### MUST SHIP

- signed app shell on a physical iPhone;
- isolated Preview configuration and visible Preview marker;
- Supabase email OTP, secure session restoration, `/session`, sign-out partition safety;
- five-tab architecture;
- Today essentials: context, relevant Match, personal Matches, Tournament Score, immediate Schedule;
- Matches Round selector, personal hero, all-Round list, truthful status/progress;
- Score current-state UI, BB/SC/SI input controls, Save & Next, owned scorecard;
- Step 1D durable queue, Match serialization, retry, crash recovery, auth partitioning;
- conflict review, Keep Official/Reapply, read-only/revoked/final handling;
- online-only explicit finalization and unknown-outcome refresh;
- Leaders overall Tournament Score and Player Leaders;
- More with native Schedule, Player Passport, and Settings;
- cached-first read foundation and offline/stale presentation;
- core accessibility, outdoor one-handed physical-device QA, and regression/integration testing.

### SHOULD SHIP

- polished Match Detail summary;
- approved bundled team accents/marks and selective course identity;
- curated web-backed More links in in-app Safari;
- conceptual deep-link router for Today/Matches/Score/Leaders/Schedule;
- restrained haptics and state transitions after accessibility behavior is complete;
- canonical Round Score Breakdown;
- support/privacy links and bounded diagnostics.

### CAN SLIP

- rich/narrative Tournament Pulse;
- spectator hole-by-hole Match Detail and non-owned scorecards;
- native Player detail from Leaders;
- native Guide, Courses, History, Records, or Career beyond the approved Step 2H/2I scope;
- push notifications;
- elaborate tournament-final celebrations;
- advanced course logos/artwork; and
- phone/SMS auth.

No optional Guide/history/notification work may displace scoring reliability or physical-device QA.

## 29. First Xcode implementation order

### 2A — Signed shell, Preview environment, Auth, physical iPhone

Create the SwiftUI app target and signed build, define build-time Preview configuration, implement the five-tab shell and Preview marker, integrate Supabase email OTP/session restoration, call `/health` and `/session`, and prove the physical iPhone resolves to the same canonical Bagger Player as the PWA.

**First-day success condition:** a signed Bagger app launches on a physical iPhone, unmistakably identifies itself as Preview, signs in with the approved participant email/OTP flow, calls `/api/mobile/v1/session`, and displays the canonical Player/team/tournament. No scoring write is attempted.

### 2B — Shared v1 API client, models, cache, app state

Implement Codable DTOs from schemas, Bearer transport, stable errors, ETag/304 handling, partitioned read cache, auth-aware global state, deep-link router skeleton, and deterministic fixtures. Scoring remains no-store.

### 2C — Today

Implement tournament header, Match hero, Your Matches composition, Tournament Score composition, immediate Schedule, loading/cached/offline/empty states, and cross-tab actions. Omit narrative Pulse.

### 2D — Matches and Match Detail

Implement Round selection, Your Match hero, all Match rows, summary Match Detail, and Score-tab activation. Degrade non-owned live rows to `Live · Thru N` until the P1 field exists.

### 2E — Score read UI and native Scorecard

Implement `/scoring/current`, contextual Score states, BB/SC/SI layouts, large score controls without mutation submission, canonical status rendering, hole navigation, and owned scorecard.

### 2F — Durable native scoring queue

Implement the approved Step 1D store/state machine, identity partitioning, atomic Save-first transaction, Match locks, ordered replay, retry/backoff, schema migration, crash recovery, and safe diagnostics. Do not invent different semantics.

### 2G — Scoring mutation, conflict, and finalization UI

Connect `/scoring/hole`, authoritative acknowledgement/refresh, local/official status, correction, conflict comparison, Keep Official/Reapply, auth/permission changes, and explicit online finalization with unknown-outcome recovery.

### 2H — Leaders

Implement Tournament Score, canonical Round Scores from `/leaders.roundStandings`, Player Leaders, official-only Net Skins, and server-published Calcutta. Preserve independent cached refresh and partial-failure states, authenticated Player emphasis, canonical ties, and precision-safe Calcutta strings. Do not calculate standings, skins, ownership, payouts, or settlement in Swift.

### 2I — More, Schedule, Player Passport, Settings, web boundary

Implement exact grouping, native Schedule, lightweight account context, sign-out protection, Preview Settings, and curated `SFSafariViewController` destinations without a token bridge.

### 2J — Deep links, polish, accessibility, assets

Complete universal-link-ready routing, Dynamic Type/VoiceOver/contrast/Reduce Motion, team/course identity, haptics, animation restraint, empty/error copy, and one-handed outdoor usability.

### 2K — TestFlight hardening

Run physical-network scenarios, PWA/iPhone cross-device conflicts, force-quit/restart, auth expiry, account switching, tournament switching, finalization response loss, performance/battery review, security/privacy review, and TestFlight release checks. Production authority remains a separate cutover.

## 30. Physical-device scoring QA

The primary hole-entry workflow is not accepted solely through simulator tests. On representative iPhones, validate:

- one hand and thumb only;
- four-player Best Ball within normal on-course attention limits;
- direct score selection through the full valid 1–20 range;
- bright sun, dark appearance, Increase Contrast, and large Dynamic Type;
- VoiceOver increment/decrement and numeric selection;
- no hardware keyboard;
- no horizontal scrolling or swipe-only requirement;
- rapid double tap creates one durable intent;
- Airplane Mode Save & Next remains immediate and truthful;
- Wi-Fi/cellular transition and response-loss idempotent recovery;
- force quit immediately after Save and during HTTP submission;
- PWA changes the same hole before iPhone replay;
- sign out with pending intent and different Player sign-in;
- Match finalized elsewhere while local intent is pending; and
- Hole 18 → resolved queue → explicit online finalization.

## 31. Known limitations and decisions deferred only to implementation tooling

Behavioral decisions are complete. Only platform/API details that require Xcode remain open:

- exact available SF Symbol names for the deployment target;
- exact persistent-store technology, with Step 1D's SQLite-backed recommendation as the starting choice;
- exact Supabase Swift version and secure session storage API;
- exact cache library versus small repository-owned implementation;
- final approved team/course/app artwork;
- measured refresh intervals and timeout tuning;
- final public support/privacy URLs; and
- universal-link entitlement/domain configuration.

These implementation choices may not alter identity partitioning, queue semantics, Save & Next, local/official vocabulary, conflict behavior, navigation meanings, or native/web classifications without product review.

No Step 1A–1D runtime amendment is required to begin Xcode work. P1 contract work can proceed independently and additively while the client shell, auth, read cache, Today, Matches, and Score foundations are built.

## 32. Step 1E validation checklist

- [x] Primary information architecture is Today | Matches | Score | Leaders | More.
- [x] Every primary tab has purpose, stack, refresh, cache, empty, offline, auth, and deep-link behavior.
- [x] All screen data claims map to Step 1A–1C contracts or are labeled as gaps.
- [x] Step 1D controls every local scoring/retry/conflict/finalization state.
- [x] Score visually distinguishes Saved on iPhone from Official.
- [x] BB, SC, and SI input requirements match the Step 1C request shape.
- [x] Finalization is online-only and canonical.
- [x] Native and web boundaries are explicit; there is no token bridge.
- [x] Director/admin functionality is excluded.
- [x] P0/P1/P2 gaps are explicit, including expected gap-review fields.
- [x] Thirteen required structural wireframes are included.
- [x] Screen inventory, acceptance criteria, 20-day scope, and Xcode sequence are implementation-ready.
- [x] No Swift, runtime, API, database, PWA, Supabase, Google, Vercel, Preview alias, or Production change is prescribed by this document.
