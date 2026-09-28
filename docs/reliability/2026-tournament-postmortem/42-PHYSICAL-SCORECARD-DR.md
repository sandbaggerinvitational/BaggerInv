# Physical scorecards as disaster recovery

**Audit boundary:** historical evidence and source review only. No Production/staging requests, mutations, builds, deployments or source changes in this audit. Proposed designs are not implemented or approved release evidence. Unknown measurements remain unknown.

Physical cards are an intentional backup for uncommitted golf, not an alternative authority to silently override Official scores. The 2026 recovery proves their value: four cards could be reconciled while existing Official golf was preserved.

Every group retains round, match, ordered hole numbers, participant names/IDs and actual gross values in the correct format. Include date and a scorer/attestation note. Keep original card after digital entry until closeout is verified. Do not calculate strokes/net/winners to reconstruct server authority.

When software is unavailable: continue golf if owner permits, record gross, stop ambiguous repeated submission. Once authority returns, Director compares each hole; matching Official skip, missing submit via canonical RPC, different Official owner review. Finalize only after complete canonical readback. For database restore, reconcile receipts/physical cards from the restore point forward before reopening digital scoring.

RPO objective: zero loss of committed Official data; actual infrastructure guarantee depends on verified backup/PITR and restore evidence. Physical cards provide recovery of uncommitted golf. RTO objective is rapid operational fallback during play, not an unsupported promise of provider recovery in minutes.

Owner rehearsal: complete one full synthetic physical card with a matching, missing and conflicting subset; interrupt recovery after a committed lost response; resume same IDs; verify finalization and zero access. No Codex or database credentials.
