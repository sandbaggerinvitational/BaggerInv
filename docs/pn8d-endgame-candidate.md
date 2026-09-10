# Controlled native read closure candidate

This server candidate is based on Production source
`657c727216bf54f181ef781c0da3fef39f5113b2` and pairs with unchanged certified
iOS source `7f2dae7d407ee0a2050931b384a69b43e312b6f4`. The native source retains
Production environment identity, working simulator Keychain access, same-process
staged certification and explicit local logout. Do not merge its older web tree
or import active native/More-screen polish into this server candidate.

Server corrections:

- Scheduled Match Detail status text is null as required by the schema and iOS.
- Today/Matches use the published Guide timezone consistently with Schedule.
- Schedule revision hashes its participant-visible representation.
- The existing Production Guide RPC includes canonical tournament and course
  context from the existing Guide authoring reader. Its delivery fingerprint
  covers the publication and canonical context. The transport preserves it.

Migration `202609100100_production_native_guide_delivery_context.sql` changes
only the body of the existing Guide read RPC. It preserves frozen-current and
release/resource/service checks and existing ACLs. It changes no data, publication
pointer, native capability, scoring permission, grant, RLS policy or worker.
Apply the reviewed transaction while native gates remain OFF, then deploy this
server source through one fresh serial release, promotion and authenticated
owner rebind. Verify runtime health and web/PWA before Stage A.

The local audit harness lives only under test/support. It does not provide an
API or credentials. Current unavailable career/optional-product inputs must be
observed through the authorized participant flow; fixture results are not live
certification. The final controlled run must attempt all fourteen surfaces,
collect ordinary failures, use local logout, and restore all gates OFF before
any correction replay or PN-9 work.

No scoring activation belongs to PN-8D. PN-9 begins only after PN-8D acceptance
and its comprehensive scoring sweep. This candidate does not authorize Apple
submission or import unrelated native changes.

Validation before the closure release: 367 server tests, three Guide render
checks, the disposable PostgreSQL Guide integration, and 277 selected native
tests passed. The server Production build and native simulator test build
passed. Current canonical Guide content/context also passed the mobile schema
and exact iOS Guide decoder. The selected match's existing 18-hole repair was
confirmed complete without changing data. Six remaining offline-unavailable
surfaces still require the authorized participant run; these tests do not
represent a completed live PN-8D or PN-9 certification.
