# Owner execution after separate hosted authorization

Do not execute during this remediation. The existing hosted project remains disabled/PAUSED with three unlinked synthetic Auth users.

1. Approve the locally certified candidate, deploy exactly that repository commit to the isolated Preview branch, independently verify its real provider identity and perform the existing owner-only safe Certification release rebind. No admission enablement. The installed schema, registration and installation receipt are unchanged; this package requires no hosted DDL or schema migration.
2. Re-read the physical project, registry, receipt, initialization origin, current admission/binding/release, pointer, epoch, ingress gate and generation. Confirm the exact registered `trmcwrljjxwhgtikfdgu` resource, disabled admission, PAUSED gate, no active work/leases and the approved three confirmed synthetic Auth identities. Verify the managed owner's existing Auth table privileges; **do not grant or repair provider permissions**. Retained Part 1A platform metadata records the Auth provider table default `postgres=arwdDxtm/supabase_auth_admin`; local proof models that already-existing privilege. If hosted readback differs, stop before execution.
3. Save a non-secret owner request outside Git with exactly the following structure. Populate deployment and expected fields from the independent current readbacks, never invented placeholders. Copy `resource` exactly from `config/certification-resource-registration.json`.

```json
{
  "contract": "bootstrap-certification-part2a-fixture-v1",
  "operation_id": "certification-part2a-initial-fixture",
  "resource": {"COPY": "the complete checked-in registration object"},
  "deployment": {
    "vercel_team_id": "actual registered team",
    "vercel_project_id": "actual registered project",
    "git_branch": "actual registered branch",
    "deployment_class": "preview",
    "release_commit": "independently verified new candidate SHA",
    "deployment_id": "real READY deployment ID",
    "deployment_origin": "real canonical Preview origin"
  },
  "expected": {
    "binding_id": "current binding UUID",
    "authority_epoch_id": "current epoch UUID",
    "activation_revision": 0,
    "admission_revision": 0,
    "pointer_revision": 0,
    "generation_id": "current exact generation UUID",
    "generation_revision": 0
  }
}
```

The example is a shape description, **not executable input**; all zero revisions and explanatory values must be replaced by actual readback. No secrets or caller-selected identities belong in this request.

4. Render only: `node tools/reliability/certification-part2a-fixture.mjs /private/tmp/part2a-fixture-request.json /private/tmp/part2a-fixture-reviewed.sql`. Rendering uses no network and executes nothing; it refuses an existing output file and writes mode 0600. Review the emitted transaction and record its SHA-256. Verify the package template matches the certified evidence/source digest. No edits to generated SQL are allowed.
5. Reconfirm the dedicated direct installation connection uses managed `postgres`, the exact project hostname, `sslmode=verify-full`, the approved CA and secure local password handling. Use the existing reviewed local credential-file mechanism; do not put passwords/tokens in chat, argv, SQL or evidence. Independently verify the physical connection immediately before execution. Do not connect to Production or old Preview.
6. Run the reviewed file using `psql -X -v ON_ERROR_STOP=1 -f /private/tmp/part2a-fixture-reviewed.sql` through that already verified secure connection. The package has one transaction, finite lock/statement limits, fixed search_path and all constraints/triggers active. Any error aborts the transaction. **Stop; no ad hoc repair, statement skipping or initializer/admission calls.**
7. Read back one truthful owner audit receipt; exact links/entitlement; four players/two teams/two Singles matches/one round/18 course holes/36 match holes; revoked permissions; empty unpublished Calcutta; zero scores, jobs, Odds publications and FinalRecap. Compare resource/receipt/admission/epoch/pointer/ingress state with the pre-execution readback. They must be identical.
8. Re-execute the identical reviewed package only for its supported replay proof. It must report `CERTIFICATION_FIXTURE_IDEMPOTENT`, add no receipt/row and change no revision. A conflicting request or persisted fixture drift fails closed. This replay contract applies before later activation/mutation; it is not a reset or repair mechanism.
9. Remain disabled/PAUSED. Resume Part 2A only under its separate existing execution authorization and reviewed checkpoint. Activate through the existing certified owner control; use shipping Director operations to prepare scoring context, set lifecycle and grant match access. Bootstrap never opens scoring itself.

An OPEN Certification generation is an inert durable container while the separate gate is PAUSED and admission disabled; do not describe it as accepting scores. Future Part 2B/whole-tournament expansion is not supplied by this two-match fixture and requires its own supported plan. Preserve audit/receipts. Do not rerun the local-only full-tournament fixture against hosted.

References: PostgreSQL [DO](https://www.postgresql.org/docs/17/sql-do.html) is an invoker anonymous block; it is not a persistent RPC. The reviewed [Supabase PostgreSQL minor release](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes) affects legacy pgcrypto PGP ciphers; this package uses existing SHA-256 digest, not encryption, extension installation or custom operators. The [extension-pinning change](https://supabase.com/changelog/extension-version-pinning-ignored) does not affect this package: it installs no extension.
