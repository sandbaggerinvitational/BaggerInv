# First scoring write must not invalidate its release

The first real 2026 round Open returned ROUND_TRANSACTION_ABORTED at the first match. All match writes rolled back. Exact installed PostgreSQL replay identified SQLSTATE 55000, PRODUCTION_POSTCUTOVER_NORMAL_RELEASE_REQUIRED, at ACCESS_ACTIVATE after MARK_LIVE. The first-write audit trigger advanced activation 234 to 235 while the approved release binding remained 234. This predates Release 135 and affects the first canonical scoring mutation after normal-release binding; it is not a match, handicap, or native defect.

The correction removes only the audit trigger's activation revision increment. The timestamp, first mutation key, match, match revision, conditional first-write latch, and operation audit are preserved. Exact release/activation guards remain unchanged. Installation replaces one function and changes no tournament rows.

Local evidence: /private/tmp/bagger-r1-open-incident/EXACT-REPLAY-CERTIFICATION.json and exact-original-replay.log. The captured R1/R2 fixture retains installed runtime guards, trigger dependencies and lossless PostgreSQL numeric values. Auth identity is synthetic. Existing round regression now retains the first-write audit trigger and explicitly reproduces the old abort before proving the repair. All actual tournament opening remains an owner action after protected deployment certification.
