# Bootstrap function privilege portability

**PASS — local certification only.** Base application SHA:
`b992bc6501423e038fb5db5e424ae91f880bd9b6`. Candidate is the containing commit;
execution receipts identify the tested files by SHA256. Existing hosted project
`trmcwrljjxwhgtikfdgu` was not queried, installed, patched or registered in this run.

The bootstrap now deterministically installs the same certified function ACLs
under ordinary local defaults and managed Supabase-shaped EXECUTE defaults.
No application/migration body, owner, search_path, security mode, RLS, authority,
scoring rule or role changes. No hosted resumption is authorized by this PASS.

- [Certification and evidence](CERTIFICATION.md)
- [Per-function ACL strategy](ACL-STRATEGY.md)
- [Future hosted installation addendum](HOSTED-INSTALL-ADDENDUM.md)
- [Exact ACL parity](evidence/acl-parity.json)
- [Source impact and retained proof](evidence/source-impact.json)
- [Broad failure accounting](evidence/broad-accounting.json)

Reproduce affected local proof with
`node tools/reliability/run-bootstrap-compatibility.mjs bootstrap --privilege-portability`;
use `application` or `build` for the other required checks. The wrapper strips
provider credentials, denies outbound sockets, confines PostgreSQL to owned local
fixtures and writes this package instead of replacing prior evidence.

Next owner action: authorize resumption of Part1A on the existing project using
the new containing SHA. Complete provider Auth/messaging audit before advancing.
No second project, Vercel configuration, deployment, Production, Google or Build11.
