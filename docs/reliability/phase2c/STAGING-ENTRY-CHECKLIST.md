# Staging entry checklist — review artifact only

**Candidate advancement is blocked: Phase2C is PARTIAL.** Resolve [Google mirror/archive delivery and financial isolation](GOOGLE-OUTBOX-GAP.md) before owner staging review. The later-stage checklist below is a plan, not current readiness or deployment authorization.
No staging deployment or certification is performed or authorized by this document. Read [CERTIFICATION.md](CERTIFICATION.md) first; any unresolved local P0 blocks entry.

- [ ] Owner reviews the exact candidate commit, source/migration hashes, P0 disposition, failed-attempt history and proof limitations.
- [ ] All six local gates pass; required broad baseline differences are explained; candidate branch is clean and source/evidence manifest matches.
- [ ] A separately authorized isolated hosted environment has verified database identity, synthetic data, no shared Production authority and outbound OTP/email/SMS/push/Google delivery suppression.
- [ ] Existing certifications and pending jobs are inventoried through bounded non-Production reads; review/recertification preserves the historical receipts.
- [ ] Migration source hashes, grants, RLS, search paths, current pointers, exact trigger topology, finite budgets and UTC transport are verified.
- [ ] Hosted supervisor, bounded worker concurrency, secrets isolation, retry/halt alerting and recovery operator ownership are defined.
- [ ] Hosted score/recovery/control/worker compatibility,432holes, failure injection, history scale and rollback drills have an approved test plan.
- [ ] Abort conditions, preserved evidence and rollback owner are explicit.

Local proof is an input to owner review, never authority to run staging or Production. Production requires a later separate explicit authorization. No fake score is an acceptable Production smoke test.
