# Sandbagger Invitational — v10.4.1

Adds the first working Captain's War Room and prediction engine.

## New in v10
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
