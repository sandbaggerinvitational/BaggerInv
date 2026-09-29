# Google retirement contract

Owner decision: **retire Google from tournament runtime**. The candidate disconnects Google transport, but required capability replacements and proof remain incomplete. Production has not changed. This document defines the target; [CERTIFICATION.md](CERTIFICATION.md) records the actual PARTIAL status.

Runtime includes boot, participant/Director reads, canonical mutations, round controls, side-game processing, jobs/cron, annual activation and History/Records rendering. A dependency is critical if its failure can prevent/corrupt required authentication, score/recovery, progression, results/points, financial or other required side-game authority, core reads, or audit.

Canonical authority is the protected PostgreSQL current/revision contract. A historical `source_workbook_id` can remain immutable provenance; it does not authorize a network lookup or Google write. Merely containing the word Google is not a retirement defect.

Required target: no Google auth/data read, enqueue, acknowledgement, financial callback or completion gate in scoring, recovery, controls, results, points, Net Skins, Calcutta, Odds, Competition, Intelligence, Director, participant reads, History, Records, audit, annual initialization, Round GO or Tournament Ready. Retired Google proof is **N/A — RETIRED**, not delivery PASS.

The identified Sheets/service-account runtime transport entry points reject before provider dispatch. Invalid canonical configuration fails closed and cannot fall back to Passport/Sheets. Request/canonical authorization, idempotency, receipts, score formulas and owner publication approvals remain required. Missing functionality cannot be masked by a 410 endpoint or unavailable screen.

No optional Google delivery is retained as a supported runtime tool. Pure import/export builders and legacy source remain for historical interpretation, not execution. Networked historical imports require a separately reviewed maintenance migration. No new SaaS, microservice or event system replaces Google. Canonical finalized scorecard snapshots and audit receipts remain atomically durable; human-friendly export is a future optional convenience, not authority.

Reintroduction of Google or another reporting provider requires architecture review. Any proposed integration must be downstream, non-authoritative, bounded and failure-isolated; it cannot enter scoring/round/financial completion gates without separate justification and certification.

Google reporting/export is **not** Bagger's database disaster-recovery strategy. Backup/restore P0 remains open.
