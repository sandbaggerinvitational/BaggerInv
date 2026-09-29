# Independent import-order review addendum

Reviewed 2026-09-29T21:06:12.197669+00:00. Proof layer: SOURCE byte comparison and retained provenance review. No runtime tests were run by this review.

**PROVEN:** only the first two import declarations were swapped in `lib/production-calcutta-server.js` and `lib/production-net-skins-server.js`. The preserved pre-correction files match the original engineering-review hashes exactly; every byte from line 3 onward remains identical. The other 15 files in the original 17-source review manifest are unchanged. The companion JSON contains all 17 current hashes.

- Calcutta: `cb183d4b5f8159dad552541a72ec5b83e18378c7c50705955c129ec2784be89b`
- Net Skins: `4007eee4e309d18ae2e2d89f80980c306de29e7e78b5e9fad07f68f408690952`

The correction moves the existing `server-only` marker before the existing `derivedFailureCode` import. It changes module evaluation ordering intentionally. It does not change any function body, golf calculation or authorization logic. This SOURCE conclusion is not a claim that module evaluation is runtime-equivalent; the affected test/build/runtime reruns remain separately required.

**PROVEN within the captured set:** all 493 directly listed test files and all 557 unique captured `test/` files (including support dependencies) match the preserved pre-correction application receipt. Across that receipt's 78-file implementation manifest, the only changed files are the two reviewed modules. No test assertions in that captured set changed to accommodate the correction.

Original review: `docs/reliability/phase2c/evidence/independent-engineering-review.json` (SHA256 `3b7e647ce04e6e73eb8490e5537b9cc2407ec7bb9eb2ae182dac593916b35b72`). Preserved pre-correction receipt: `docs/reliability/phase2c/evidence/server-only-order-regression/application.json`. Original runtime receipts retain their historical dates and source hashes; this addendum does not declare them current after the correction. Parent verification of targeted fresh reruns is pending.

**Overall Phase 2C remains PARTIAL.** `P2C-OPEN-GOOGLE-DELIVERY` is not scoped away. Existing canonical score/Finalize Google reporting and archive work is outside the three-family delivery proof. The legacy Finalize mirror invokes side-game synchronization and an independently gated publication path; automatic pickup requires explicit mirror-only/owner-publication semantics and isolated SQL/fake-sink proof before activation. Source coupling does not prove that unauthorized historical publication occurred. See `docs/reliability/phase2c/evidence/google-outbox-scope-review.json`.

No staging or Production authorization is granted. No repository source, database, network, native shipping code or real tournament data was changed. Owner acceptance was not performed.
