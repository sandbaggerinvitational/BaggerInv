# Candidate manifest

BASE SHA: `ab909d4519ea1331e27b0924de1572ebaf690777`

CANDIDATE SOURCE SHA: `ab07b843dc20b8b4d3843c52f1be5755d19ec9af`

Branch: `codex/reliability-phase2c1-google-retirement`.

STATUS: **PARTIAL — NOT READY FOR STAGING**. This source commit contains the implementation; subsequent documentation/evidence commit does not change it. Final package commit is the branch HEAD reported by `git rev-parse HEAD` and the final response; no file can embed its own Git commit hash. No owner acceptance or deployment is implied.

## Source scope

Source commit: 20 added, 80 modified, 0 deleted files; 100 total. Large route implementations are replaced with explicit 410 tombstones, not counted as deleted files. Full per-file hashes: candidate-source-manifest.json. Exact original retired HTTP source hashes/paths are retained in tools/maintenance/retired-google-http-manifest.json at the base revision.

Packages removed: 0 (no Google SDK dependency). Package/lockfile changes: 0. Native shipping/Swift changes: 0. New external service/microservice/outbox: 0. Indexes added: 0. Real schemas changed: 0.

Migrations: production-track125 and126; Preview-track `202609290001_canonical_history_provenance_v1.sql`.125 removes Google-related edges from 27 exact functions, 4 binding triggers, 7 dispatcher operation allowlist entries and 34 service RPC grants; canonical functions remain active.126 changes 5 canonical release/admission functions. Existing snapshots/audit/jobs/receipts stay intact. Preview migration derives stored history provenance rather than requiring environment workbook selection. These are separate schema tracks; never apply Preview migrations to Production indiscriminately.

Automatic/selectable Google application groups before: 24, enumerated within 30 application groups. Source retirement after: 0 supported critical provider read/write-back/completion edges in examined implemented chains. Functional completeness remains PARTIAL for the isolated Director/annual/client gates. Google queues/workers are disconnected, their historical tables retained. No new supported optional Google export. Historical builders/provenance/forensic source remain; external artifacts require later preservation.

Configuration: .env.example removes Google runtime variables; real environments unchanged. vercel.json disables automatic Git deployment for this isolated branch while preserving the existing account-deletion cron. No external cron/project settings inspected or changed.

## Proof identity

Final broad receipt was source-stable. All 97 implementation paths in that receipt match this source commit's current bytes. Individual focused receipts retain their manifests and limitations. Full-sequence fixture `bagger-phase2c-recovery-delivery-v1` plus candidate125/126; history fixture `bagger-r139-synthetic-history-v1+phase2-eligible-history-v2`, seed `2026-never-again-139`; full annual initialization expected-red fixture `phase2c1-annual-initialization-v1`.

P0-A PASS; P0-B PASS scoped; P0-C worker42883 PASS; P0-D PASS; P0-E PASS; P0-F PARTIAL. Overall retirement PARTIAL. Build PASS; broad 3,971/188, not green. These are local proofs, not hosted/Production/physical evidence.

Known limitations: isolated Director replacement, actual annual CREATE contradiction, 3 canonical-read compatibility proof gaps, obsolete-test replacement/fixture adjudication, real historical completeness, higher local tails and global P0s. See CERTIFICATION.md. Rollback requires compatible function/grant/allowlist restoration and retained external credentials during the rollback window; do not revert competitive data. Future external cleanup and deployment are documentation only.

Existing Preview migration identifier collision (predates this task; not modified): `{"202608210011": ["202608210011_preview_signed_out_phone_login_surface.sql", "202608210011_preview_prediction_settings_projection.sql"]}`. Candidate migration identifiers are unique and ordered after their track's existing latest file. This local retirement proof is not full Production migration certification.
