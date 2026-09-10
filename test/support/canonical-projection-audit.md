# Canonical projection audit (local/test only)

This helper is not a route, authentication facility, environment loader or
credential provisioner. Do not import it into application/runtime code.

`probeCanonicalInputs()` invokes the existing six service boundaries plus Guide
and returns availability classifications only. It does not export raw history,
player, publication or provider payloads. No configured authority means unavailable;
it is not evidence of a failing Production endpoint.

`auditParticipantProjections()` invokes the existing fourteen mobile adapters.
The caller supplies an already-authorized identity, a schema validator and a
local DTO consumer. It does not sign in or create an identity. Passing fixture
dependencies labels every successful result `FIXTURE_DEPENDENCIES`; those results
must never be counted as current Production service execution. The helper retains
all errors as safe classifications and continues through the entire matrix.

By default, network is disabled. For a genuinely existing configured server
execution context, the operator may supply that context's transport. Existing
application modules still construct scope, resolve current tournament authority,
enforce deployment/resource binding, and create their own internal request
headers. The helper accepts no service credential argument and does not load
provider configuration or environment files. A transport function alone does
not supply the missing server execution context.

The fetch guard permits only explicit current Production read RPCs. It rejects
other origins, SQL/table APIs, Auth, writes, unknown RPCs, future-year RPCs,
unexpected current-view surfaces, redirects and over-budget requests. The match
authorization RPC only returns a decision and takes a shared transaction lock;
`START_SCORING` in this reader is a permission inquiry, never a score command or
lease creation. No scoring mutation function is imported or selected.

Use a dedicated process. For the local no-network safety tests on Node 26:

```sh
node --permission --allow-fs-read=. --allow-fs-read=/path/to/dependencies \
  --conditions=react-server --test --test-isolation=none \
  test/canonical-projection-audit.test.mjs
```

Do not add `--allow-net` to the local fixture run. Node permissions provide the
local network/process denial; the fetch allowlist alone is not an OS sandbox.
No command here retrieves service credentials or deploys this helper remotely.

Guide remains a blocking integration finding: its Production projection
translation supplies content and revision metadata, but does not add the nested
authority tournament or immutable course context required by the native Guide
adapter. Public Guide JSON and empty leaderboard hole arrays cannot substitute
for those inputs. Director authoring context must not be obtained by fabricated
Director/service claims. This helper intentionally does not fill missing fields.

The fourteen-surface commit gate requires complete current canonical inputs,
schema and exact iOS validation, cross-surface/cache/security checks and zero
unknowns. A passing diagnostic/safety test does not satisfy that gate.
