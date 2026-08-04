# Championship Projection Architecture

## Ownership

| Responsibility | Owner |
| --- | --- |
| Projection engine | `lib/tournament-odds.js` (`simulateTournamentOdds`) |
| Projection inputs | `lib/odds-data.js` and the authenticated logical-name workbook resolver in `lib/prediction-data.js` |
| Authoritative published snapshot | The normalized JSON record in the `Odds Snapshots` worksheet |
| Publication service | `POST /api/odds/publish` and `publishOddsSnapshot` |
| Website consumer | `/odds-center`, which reads `readOddsSnapshots()` |
| PWA consumer | Leaderboards → Insights through `GET /api/leaderboards/insights`, which reads `readOddsSnapshots()` |
| Tournament Intelligence and Storylines | Derived at presentation time from the same ordered published snapshots |
| Projection History | Derived from the same snapshot sequence in the PWA |
| Player Projection History | Player-specific projection rows selected from that same snapshot sequence |

`Odds Team Results` and `Odds Player Results` are flattened reporting views written from the authoritative snapshot. They are not separately generated projections. Neither the Website nor PWA calculates or stores an independent projection.

## Publication flow

1. The Tournament Director reviews official pairings and completed results.
2. Director selects an official milestone and simulation count in Championship Projections.
3. `POST /api/odds/publish` validates the unchanged internal phase identifier and required pairings.
4. `loadOddsInputs()` loads the workbook by logical worksheet title and refreshes shared historical statistics.
5. The single Sandbagger Odds Engine runs the requested Monte Carlo simulation.
6. The endpoint prevents an opening projection from being republished after a later milestone exists.
7. `publishOddsSnapshot()` replaces the matching year/phase snapshot and writes its flattened reporting views.
8. The publication endpoint invalidates Website, PWA Leaderboards, and Home presentation caches before returning success.
9. Website `/odds-center` reads the authoritative snapshot directly.
10. PWA Insights retrieves the same snapshot through the read-only Insights API.
11. Favorite, movers, Tournament Intelligence, Storylines, Projection History, and Player Projection History are derived from the ordered published snapshots at presentation time.

The successful Director response therefore means the authoritative snapshot and all reporting views have completed writing and participant presentation caches have been invalidated.

## Internal phases and participant labels

Internal identifiers and ordering remain unchanged.

| Internal phase | Participant label | Purpose |
| --- | --- | --- |
| `Pre-Tournament` | Opening Championship Projection | Opening forecast using official Rounds 1–2 pairings and projected Singles |
| `After Round 1` | Round 2 Pairings Projection | Official Round 1 results plus official Round 2 pairings and projected Singles |
| `After Round 2` | Championship Outlook | Official Friday results before official Championship Singles pairings |
| `Round 3 Pairings Announced` | Championship Singles Projection | Final forward-looking projection using official Singles pairings |
| `Final Results` | Tournament Recap | Completed tournament outcome; participant surfaces stop presenting odds |

The mapping is owned by `lib/projection-phases.js`. Internal values continue to govern simulation behavior, snapshot ordering, API validation, and workbook persistence.

## Final transition

When the latest internal phase is `Final Results`, Website and PWA participant surfaces render Tournament Recap. They present the official champion, final team score, and final individual points rather than treating 100% and 0% outcomes as another forecast. The internal record remains compatible with the existing engine, API, and workbook schemas.

## Synchronization guarantees

- One engine generates the result.
- One `Odds Snapshots` JSON record is authoritative for each year and internal phase.
- Publishing the same phase replaces that record instead of creating another source.
- Website and PWA use the same reader.
- Intelligence and history are derived, not independently persisted.
- Publication cache invalidation occurs only after the snapshot write completes.
