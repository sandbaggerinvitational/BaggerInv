# Bootstrap compatibility correction

**PASS — LOCAL/NON-PRODUCTION ONLY.** Base application SHA:
`9f09f6f15afe1f1a0b326edd078cd54ab4001f71`. The candidate is the commit containing
this package; execution receipts identify the base HEAD and the exact tested
worktree hashes. This is a bootstrap portability correction, not hosted certification.

The generated installer previously created `extensions` unconditionally and
reassigned it to `postgres`. It now creates the namespace only when absent and
preserves existing ownership/ACLs. Existing pgcrypto is reused; absent pgcrypto is
created using the existing `CREATE EXTENSION IF NOT EXISTS ... WITH SCHEMA extensions`
statement. The transaction rejects an incompatible schema/version/owner before
writing its installation receipt. No provider object is dropped, moved or recreated.

- [Certification and evidence](CERTIFICATION.md)
- [Hosted install addendum](HOSTED-INSTALL-ADDENDUM.md)
- [Source impact and receipt hashes](evidence/source-impact.json)
- [Focused PostgreSQL proof](evidence/bootstrap.json)
- [Broad accounting](evidence/broad-accounting.json)
- [Build](evidence/build.json)

Reproduce with `node tools/reliability/run-bootstrap-compatibility.mjs bootstrap`,
`check`, `application`, or `build`. The harness removes provider credentials,
denies outbound sockets, preserves historical evidence, and has no hosted target
argument. Local PostgreSQL needs permission to start an owned disposable process.

No Supabase project was created, no hosted resource registered, no Vercel
configuration changed, and nothing deployed. Production, old Preview, real Google,
real identities/messaging/competitive data and native shipping source were untouched.
The next action is owner authorization of **Part1A only**: dedicated Supabase
creation, reviewed install/readback and physical registration, left uninitialized.
No deployment or initialization is authorized by this PASS.
