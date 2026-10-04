# Reviewed plan — NOT EXECUTED

Requires the owner's subsequent explicit authorization to deploy the remediation candidate, safely rebind Certification, execute the preserved-fixture repair and resume Part 2A. No hosted action is performed in this local remediation.

1. Refresh the existing Vercel CLI authorization before provider readback. The prior final-readback 403 occurred on a direct REST request using the locally stored access token without the CLI refresh flow. Local metadata shows access-token expiry `2026-10-04T13:41:32Z`; the inspected token is expired and a refresh credential is present. This establishes stale local authorization as the operational problem; it does not prove a project/configuration defect. Use normal CLI refresh/reauthentication (`vercel login` if needed), then verify access to the existing team/project. Do not alter Vercel variables, roles, protection or application behavior to fix 403. No login/provider request was attempted during this remediation.
2. Reconfirm the accepted disabled/PAUSED checkpoint in **only** `trmcwrljjxwhgtikfdgu`, resource `CERTIFICATION:2857f707-065a-405d-b5fc-b5b6fa1b0f51`, revision 1. Verify Auth three, players four, matches two UPCOMING, zero scores/leases/unresolved work, valid installation receipt, current binding and original fixture audit. Verify Ethereal remains capture-only, phone/hooks/OAuth disabled and no external execution. Stop on drift.
3. Verify the existing branch-specific Certification Vercel environment unchanged, deploy the exact reviewed new candidate once to the existing isolated Preview project, independently verify READY/team/project/branch/SHA/origin, and use the existing certified owner-only release rebind while admission remains disabled and ingress PAUSED. Verify replay and the new current binding. No schema migration is required; no resource registration or initialization is repeated.
4. Read exact current resource/deployment/release/CAS values and original fixture receipt from the Certification database. The retained original receipt is event **5**, fingerprint `a7f3f709e64eed72ef04136f5e28d57a70ae68f2744bc7b41a21b0a7fa7749a4`, old package `fd4dcf5aef0bc06e3977340d894d751834ae82a785c63681e73e09ec093296e2`, original fixture-state hash `72db60cb024b05bf4527f7afde1946510db72b39d7feb31ea7cd73d411124983`. These are retained non-secret facts, not fresh hosted readback. Reverify each; do not invent or replace a receipt if it differs.
5. Create the non-secret request outside Git, mode 0600, using this exact shape. Descriptions below are not executable values; every deployment/revision field must come from the new independently verified hosted binding.

```json
{
  "contract": "repair-certification-part2a-identity-contacts-v1",
  "operation_id": "certification-part2a-identity-contacts-repair",
  "resource": {"COPY": "complete checked-in registration object"},
  "deployment": {
    "vercel_team_id": "actual registered team",
    "vercel_project_id": "actual registered project",
    "git_branch": "actual registered branch",
    "deployment_class": "preview",
    "release_commit": "exact new candidate SHA",
    "deployment_id": "real READY deployment ID",
    "deployment_origin": "real canonical Preview origin"
  },
  "expected": {
    "binding_id": "current UUID",
    "authority_epoch_id": "current UUID",
    "activation_revision": 0,
    "admission_revision": 0,
    "pointer_revision": 0,
    "generation_id": "current UUID",
    "generation_revision": 0
  },
  "fixture_receipt": {
    "event_id": 5,
    "request_fingerprint": "a7f3f709e64eed72ef04136f5e28d57a70ae68f2744bc7b41a21b0a7fa7749a4",
    "package_sha256": "fd4dcf5aef0bc06e3977340d894d751834ae82a785c63681e73e09ec093296e2",
    "fixture_state_sha256": "72db60cb024b05bf4527f7afde1946510db72b39d7feb31ea7cd73d411124983"
  }
}
```

Do not include credentials, contact overrides, arbitrary identities or an invented deployment. Zero revisions above must be replaced by readback; the renderer rejects them.

6. Render without execution:

```sh
node tools/reliability/certification-part2a-fixture.mjs --repair /private/tmp/part2a-contact-repair-request.json /private/tmp/part2a-contact-repair-reviewed.sql
```

The renderer refuses existing output, writes mode 0600, uses no network and prints only contract/hash metadata. Verify all three named package artifacts against the certified source manifest, inspect the emitted transaction and record its hash. Do not hand-edit SQL.

7. Through the reviewed secure local credential-file connection, verify the exact physical database again immediately before execution. Use managed `postgres`, the Certification hostname, `sslmode=verify-full` and the reviewed CA. Do not place secrets in argv, chat, SQL or evidence. Execute the complete reviewed file with `psql -X -v ON_ERROR_STOP=1 -f /private/tmp/part2a-contact-repair-reviewed.sql`. One stop-on-error transaction, fixed search_path, finite lock/statement limits; any failure means STOP without patching/skipping/reconstructing rows.
8. Read back exactly the three active contacts, normalized emails equal to the existing verified identifiers, synthetic provenance and context revision 1; one approved import with 4/3/3/1 counts; one identity audit and one repair audit. Verify the original fixture receipt/state and all 24 preserved tables unchanged; registered resource/receipt/current binding/revisions unchanged by repair; admission disabled, ingress PAUSED; no messages, scores, financial mutation or jobs.
9. Replay the **identical reviewed repair request** once before further authority changes. Expect `CERTIFICATION_CONTACT_REPAIR_IDEMPOTENT`, identical counts/state, no revision change or second audit. Do not rerun the original fresh fixture package. A conflicting context or partial/contact drift must fail closed, not be corrected automatically.
10. Only under the separate hosted-resume authorization, activate with the existing certified owner control and prove actual hosted sessions resolve Director→P01, A→P12, B→P11. Signed-out remains 401 `AUTH_SESSION_REQUIRED`; unlinked/cross identity remains denied. Resume the remaining bounded Part 2A sequence from the preserved fixture, then return to disabled/PAUSED using certified controls. No full tournament, worker certification, Odds publication, FinalRecap or annual transition.

An OPEN structural ingress generation remains non-admitting while the gate is PAUSED and admission disabled. Repair never changes that state. Leave all local credentials in place; do not revoke tokens, rotate keys, alter SMTP, delete users or change Vercel configuration during this remediation.
