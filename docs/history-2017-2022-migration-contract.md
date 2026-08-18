# 2017–2022 completed-year migration contract

This is the audit contract for the future combined 2017–2022 migration. It does not activate or change those years.

- Overview: Hero → History Navigation → Tournament Final → Tournament Rounds → The Teams → Final Player Standings → Tournament Records → Tournament Honors → approved archive ending.
- Round History: Hero → History Navigation → round result → participant-aware final match cards → supported Scorecard → independently supported Match Details → Round Statistics → Back to Top → BottomNav.
- Scorecard coverage: zero recorded scoring identities means no Scorecard; some but not all expected identities means a neutral partial historical Scorecard containing only canonical recorded identities; all expected identities means the complete Scorecard. Do not create a missing identity or hole score for visual parity, and do not infer match-play rows from partial evidence.
- Course/tee preflight: resolve Course ID plus archive tee label to one complete canonical Course Holes scoring set. Require 18 pars and a unique 1–18 stroke-index set; fail closed on ambiguity. Never hard-code a tee alias.
- Net projection: use the existing per-hole scoring helpers and match-specific stroke authority. Preserve numeric zero, distinguish missing strokes, and never use a UI Gross-minus-Strokes shortcut.
- Match Intelligence: reconstruct only from complete canonical hole evidence, and render only when the reconstructed Final reconciles with the authoritative match result.
- Round Statistics: Best Ball/Singles order is Front → Back → Round → Birdie → Average → Hardest → Easiest. Scramble order is Front → Back → Team Round → Birdie → Average → Hardest → Easiest. Evidence determines whether a card exists.
- Birdies: count format-appropriate gross birdies from complete hole/par evidence. Do not create an arbitrary leader when the maximum is zero.
- Hardest/Easiest: use the same canonical format population that selects the hole and report its one-decimal relationship to par; an easiest hole may remain above par.
- Tournament Average: use underlying individual Gross rounds only. Exclude Scramble pairing/team rounds and never average rounded round-level values.
- Record holders: use the canonical golfer or pairing scoring identity, preserve every tie, and expose no raw internal IDs.
- Navigation: preserve explicit year/round/team/course context across refresh and deep links. Do not rely on browser history or duplicate the hierarchy navigation at the bottom.
