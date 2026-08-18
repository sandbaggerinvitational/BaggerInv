# 2023 completed-year migration requirements

Before classifying any 2023 historical scorecard as Gross-only, audit the full scoring-context join:

1. Resolve the scorecard's canonical Course ID.
2. Compare the archive display tee label with the canonical Course Holes scoring-set tee label.
3. Prove that the selected scoring set contains exactly 18 holes, complete par evidence, and a unique 1–18 stroke-index set.
4. Verify that the existing historical stroke-allocation and Net helpers receive that scoring set.
5. Treat ambiguous, incomplete, or multiply matching scoring sets as unsupported; do not infer or alias them.

Step 3B.2 confirmed that the first two rounds resolve exactly, while Round 3 scorecard rows carry a stale course ID. The 2023 projection therefore reuses the existing fail-closed scoring-set contract and must fail closed: it accepts the archive round/format assignment only when there is one canonical course and one complete, unambiguous 18-hole scoring set. It does not alias tee names or mutate source rows. The repair remains year-scoped, evidence-first, and preserves the proven 20-scorecard eligibility contract.

One Round 3 match reconstructs a result that conflicts with its authoritative halved result after the correct course context is restored. That match retains its canonical Gross/Strokes/Net summary, while Hole Winner and Match Progression stay suppressed. Official result and points remain authoritative.

## Completed-year Round Statistics target

- Best Ball and Singles: Lowest Front Nine → Lowest Back Nine → Lowest Round → Birdie Leader → Average Score → Hardest Hole → Easiest Hole.
- Scramble: Lowest Front Nine → Lowest Back Nine → Lowest Team Round → Birdie Leader → Average Score → Hardest Hole → Easiest Hole. Do not add a separate Lowest Round.
- Render Hardest/Easiest only when the canonical format-specific population supplies hole score, par, scoring average, and sample evidence. Display the resulting relationship to par at one decimal (`+0.8 TO PAR`, `−0.4 TO PAR`, or `EVEN TO PAR`).
