# Rebind request fields: effective capability versus configured values

SOURCE INSPECTED. `lib/production-maintenance-precommit-deployment-rebind.js` retains legacy wire fields when constructing the canonical rebind request. Its Google/archive booleans now attest **effective behavior in the candidate code**, not a provider inventory or proof of environmental secret absence.

| Retained request field | Effective candidate meaning |
|---|---|
| `runtime_google_ingress_lease_gate_enabled:false` | No tournament-runtime Google ingress/write capability is enabled by this candidate. |
| `runtime_google_mirror_enabled:false` | Retired Google mirror transport cannot run, even if old variables are still configured. |
| `runtime_scorecard_archive_enabled:false` | Retired external Google archive delivery is not enabled. Canonical score/audit history is separate. |
| `runtime_outbox_worker_secret_configured:false` | No effective Google outbox worker credential capability is admitted. This legacy field name does not attest that an environment variable was removed. |
| `runtime_archive_worker_secret_configured:false` | No effective Google archive worker credential capability is admitted. This does not attest that a credential was revoked. |

The source comment explicitly records that distinction. Low-level runtime Google transport is permanently denied by the retirement boundary; toggling legacy provider variables must not revive it. Remaining canonical internal worker admission is separate. These request fields do not prove actual SQL retirement of every old job: use the isolated PostgreSQL migration/job evidence for that claim.

**No Production configuration or real Google credential was inspected, changed or revoked.** Residual configured values may exist. Later owner-authorized cleanup must verify deployed zero-Google behavior, historical preservation and rollback requirements before environment deletion or external revocation. Do not generate credential-cleanup or external account claims from these effective false values.

No request field was renamed and no contract was widened by this clarification.
