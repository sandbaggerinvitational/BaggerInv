# Sandbagger Invitational — v11.2.0

War Room Evolution turns the matchup builder into a complete captain's decision desk.

## New in v11

- Team Vibes combines 65% same-format and 35% overall pairing performance
- Scannable matchup-driver strength bars
- Selected-matchup decision desk with confidence and Team Vibes
- Tournament Experience calculated from recorded appearances
- Seeded 10,000-run Match Simulator with format-aware segment results
- Best Ball and Scramble expected points and three-point scorelines
- Singles match-play finishing margins
- War Room navigation for Matchup Builder, Lineup Optimizer, and Match Simulator
- SBI Match Analyst voice for official scouting briefings
- Strategy-inspired rookie rook badge and trading-card player directory
- Hardened briefing API, corrected asset paths, duplicate-route cleanup, and tests

## Introduced in v10
- Live Google Sheets data for Prediction Settings, Course Scorecards, and Course Holes
- Best Ball, Scramble, and Singles handicap calculations
- Course Handicap recalculation for alternate tees
- Hole-by-hole stroke allocation
- Historical player, partnership, and head-to-head prediction inputs
- Win / halve probabilities, confidence, and key matchup factors
- New `/war-room` route and navigation link

## Local development

```bash
npm ci
npm test
npm run dev
```

Run `npm run build` before deploying. The Captain's Briefing requires `OPENAI_API_KEY`; `OPENAI_MODEL` is optional. The API applies a small per-instance request limit, but a shared rate-limit store is recommended if the site runs across multiple serverless instances.

Upload every file and folder in this package into the root of your GitHub `BaggerInv` repository and replace duplicate files. Commit to `main`; Vercel will deploy automatically.
