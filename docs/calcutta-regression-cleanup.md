# Bounded pre-Calcutta regression cleanup

Scope: the five identified baseline failures only. No Production operation,
financial mutation, SQL change, or publication change is performed by this cleanup.

## Net Skins boundary diagnosis

The existing configuration route requires Production activation, same-origin,
and active Director authorization with bootstrap disabled. The server adapter
requires saved round/revision expectations. The installed 055 configuration RPC
asserts runtime and Director actor, checks idempotency and current configuration
CAS, and constructs its manifest before inserting a configuration revision.
Migration 099 replaces the old all-input manifest with `full_net_skins_manifest_v2`.
That manifest reads the 098 entry registry and rejects missing, stale, zero-entry,
or review-required selected rounds, changed participant bindings, invalid active
roster membership and duplicate entries. Caller claims do not establish consent.

The older tournament-wide readiness summary is not this explicit-entry contract.
An unavailable summary can coexist with valid saved entries. Configuration is
allowed from those entries; it does not require all rounds (including unpaired
Singles) to be configured or scoring to have begun. No authorization bypass or
invalid configuration write was identified in this inspected path.

The UI now derives its action from the saved-entry read used by the Round Entries
editor: loading, unavailable, empty or review-required selections disable it;
ready saved entries enable it. Reads/reloads/save readbacks update that state.
Click still requires confirmation and a fresh entry read before the existing CAS
operation. A failed fresh read disables the action pending reload. The notice no
longer falsely promises that no action exists merely because the older summary
is unavailable. No server guard was changed.

## Five resolutions

1. Leaderboards: replace the literal constant-map spelling assertion with
   state-dependent module behavior (configured visible versus not configured;
   Production versus Preview). Existing navigation/privacy assertions remain.
2. Net Skins error text: execute the real card handler with isolated dependencies;
   a server conflict remains specific, creates no success state and does not refresh.
3. Readiness action: execute the real card for unavailable/not-ready/ready states,
   then browser-test actual hooks and reloads. Cover stale fresh reads, cancellation,
   current revision selection, and one confirmed synthetic write.
4. Director discovery: execute the real route and shared resolver for active,
   inactive, forbidden and unavailable states in Production and Preview. Production
   never bootstraps; participant access remains denied.
5. Director redirect: execute the real page authorization guard. Inactive/forbidden
   identities redirect to `/`; active and transient-unavailable cases preserve
   their intended behavior. No Auth runtime file is changed.

## Test execution

Use `--conditions=react-server` for server-context tests. Tests importing the
React DOM server renderer must run without that condition; React's server-component
entry does not export `renderToStaticMarkup`. This is runner separation, not skipped
assertions. PostgreSQL tests use disposable synthetic clusters only.

The broader repository-wide exploratory run also exposes failures outside these
five. Those are not repaired or waived by this bounded candidate. Final counts
and any remaining release gate must be reported separately and honestly.
