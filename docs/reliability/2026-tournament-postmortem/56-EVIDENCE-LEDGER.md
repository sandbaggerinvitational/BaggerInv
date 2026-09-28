# Evidence ledger and claim rules


The machine-readable [ledger](evidence-ledger.json) records historical source/receipt/report observations separately from proposed future proof. A retained report is secondary forensic evidence, even if it describes a primary test. Where primary JSON/SQL/xcresult survives, link it and retain checksum. This audit did not rerun historical tests or requery Production.

A claim needs capability/requirement, proof layer, environment, test ID, timestamp, release/activation/SHA, device where applicable, result, exact artifact, limitations and staleness rule. Missing timestamp or device is UNKNOWN, never filled with an invented value. SHA identifies inspected immutable source; main checkout is dirty and is not treated as deployed source.

PROVEN means direct evidence at the claimed layer. STRONGLY SUPPORTED is converging evidence with a missing causal link. PLAUSIBLE is a mechanism/hypothesis with incomplete correlation. UNKNOWN means evidence cannot decide. Recommendation confidence HIGH/MODERATE/LOW refers to design judgment, not implementation proof.

## Artifact result versus incident conclusion

Each ledger row describes what one artifact can support. Its `result` and `claim` are artifact-level fields; they must not inherit an incident's aggregate confidence or root cause merely because the artifact appears in that incident's evidence list.

Some source incident records retained only string paths and line references, without an artifact-specific `proves` statement. Those ledger rows are labeled `CITATION / NOT INDEPENDENTLY SUFFICIENT`. Their claim says only that the artifact contributes to the complete evidence set, and `aggregate_incident_conclusion_ref` points to the separately maintained incident conclusion. The citation label does not downgrade the aggregate conclusion. It prevents one report line, source line, or snapshot from being represented as independently proving every part of that conclusion.

Where a retained record already supplies a narrow artifact-level `proves` or `supports` statement, the ledger keeps that statement and its appropriately scoped result. A reader must evaluate the artifact, proof layer, environment, and limitations together.

Three incident scopes require particular care:

- `2026-INC-012`: physical acceptance covered the safe pre-golf/no-result response and remaining on the destination screen. It did not cover a populated Official Net Skins result.
- `2026-INC-018`: absence of commit by the retained operation and the later stale fingerprint are proven. The original request time, transport error, and initial failure cause remain `UNKNOWN`.
- `2026-INC-020`: the bounded comparison and recovery are proven, including no corruption in the compared scope. No single cause for every initially missing hole is established. One card completed independently while recovery was running; all four cards were compared, but recovery did not write all four.

No HTTP200→semantic success, simulator→physical, JS calculator→SQL, local12READY→Production12READY, test-count→full-lifecycle or symptom-recovery→root-cause closure inference is permitted. Absence of logs is NO EVIDENCE FOUND. Exact absence of receipt combined with installed atomic receipt semantics can prove noncommit for that operation; the semantics must also be evidenced.

Artifacts presently reside in requested temporary storage. Later, with owner approval, retain sanitized design/requirements in version control; large immutable CI/device/performance evidence in access-controlled artifact storage; canonical receipts in database audit/archive; provider logs/metrics in retained telemetry store. Do not commit secrets, auth tokens, private participant payloads or raw financial images to a public repository. This audit does not perform that move.

Additional lineage cross-check: **EV-002-05**, [retained Release 132 closure state](/private/tmp/bagger-build8-shipping/navigation-correction/closure-state.json:13), establishes activation revision 231 only. No current Production request was made.
