# Phase 2C.1 canonical capability and proof closure

**PARTIAL — not ready for owner review before hosted/staging certification.** Google remains retired as the chosen architecture. The completed changes preserve that decision; remaining required Director capability and read-routing proofs are listed rather than waived.

The retirement candidate exposed a contradictory annual CREATE year contract, a broken annual canonical readback, a wire-hash mismatch in annual operations, and a Director page still selecting a retired provider. This closure repairs annual CREATE and installs a small canonical Director current-read/Finalize/Reopen path. Separate Preview database branches also required retirement: the previous Production-shaped tournament proof did not cover them. The new source does not restore Google or change golf rules.

Annual CREATE uses current tournament identity for authorization and an explicit future target year for the new draft. It writes canonical draft/resource/audit/receipt authority and confirms it through readback. It does not create invented future pairings, handicaps, Ready state or activation. Director operations preserve server-bound identity, exact isolated database admission, canonical receipts, same-operation retry and readback.

The broad test inventory now distinguishes obsolete provider expectations from required functionality. Removed tests are individually accounted; known required routing failures remain RED. Passing rewritten source assertions do not close missing client capabilities. See the exact totals and identity bridge in [test accounting](TEST-ACCOUNTING.md).

Local evidence includes the 432-hole / 24-Final sequence, autonomous required workers, recovery after revocation, annual worker SQL execution, Net Skins deadlock behavior, finite timeouts, a zero-credential build/boot, and 12,000 history-scale benchmark samples. These proofs retain their individual fixture and transport limitations. None is hosted or Production evidence.

Required next work remains a safe isolated operation context that reuses the canonical setup, entry, auction and lifecycle ledgers, plus three bounded read-only routing cases. Preview bulk importers are not substitutes for those commands: [design review](CANONICAL-ADAPTER-DESIGN-REVIEW.md) records the conflicting invariants. A narrowly scoped read-admission edit was rejected by automatic approval review and remains pending explicit owner confirmation.

Production, hosted staging, real Google, real competitive data and shipping native source were untouched. Backup/restore, capacity, native physical scoring and the full tournament rehearsal remain outside this proof layer.

## Review index

- [Owner review](OWNER-REVIEW.md)
- [Certification](CERTIFICATION.md)
- [P0-F proof matrix](P0-F-PROOF-MATRIX.md)
- [Annual CREATE contract](ANNUAL-CREATE-CONTRACT.md)
- [Director canonical routing](DIRECTOR-CANONICAL-ROUTING.md)
- [Eleven capability identities](CAPABILITY-GAPS.md)
- [Three routing gaps](CANONICAL-ROUTING-GAPS.md)
- [Canonical capability register](CANONICAL-CAPABILITY-REGISTER.md)
- [Failure manifest](FAILURE-MANIFEST.md)
- [Test accounting](TEST-ACCOUNTING.md)
- [Client compatibility](CLIENT-COMPATIBILITY.md)
- [Performance](PERFORMANCE.md)
- [Security review](SECURITY-REVIEW.md)
- [Traceability](TRACEABILITY.md)
- [Evidence ledger](EVIDENCE.md)
- [Deployment and rollback: documentation only](DEPLOYMENT-AND-ROLLBACK.md)
- [Next single phase](NEXT-PHASE.md)

Scoped Odds addendum: the existing canonical calculation and owner publication path is now connected through the isolated Director API. Actual13-test proof covers no Google job, historical preservation, stale inputs, owner/role/scope checks, audit rollback and same-calculation replay/readback. Seven required Director capability identities remain PARTIAL; three are scoped PASS and one is optional maintenance.
