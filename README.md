# Sandbagger Invitational — v12.0.0

## Odds Center publishing

The Google-retirement candidate publishes owner-reviewed Odds through canonical PostgreSQL authority. Google Sheets, service accounts and archive delivery are not runtime authorities. See [Phase 2C.1](docs/reliability/phase2c1/README.md) for candidate proof, limitations and the later cleanup plan. Do not revoke credentials or delete historical Google artifacts before separately authorized hosted certification, deployment, observation and preservation.

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

Reliability work stays on isolated branches. Do not merge, deploy, or change live configuration from a local certification task. Production deployment requires separate owner authorization and the reviewed deployment plan. Historical v10/v11 notes above describe prior releases, not current runtime dependencies.
