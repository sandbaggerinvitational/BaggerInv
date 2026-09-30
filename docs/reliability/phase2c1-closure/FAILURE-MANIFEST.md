# Retirement failure manifest

The immutable starting retirement run has 188 failures: 26 existing baseline identities and 162 additional identities. Classification was completed before edits. A/B/C distinguish obsolete provider expectations, fixtures and old assertion contracts; D/E remain actual capability/routing proof work. No G/UNKNOWN classification remains.

| Class | Count | Meaning |
|---|---:|---|
| A |116|Obsolete retired-provider expectation|
| B |18|Fixture models the old architecture|
| C |14|Assertion expects the old contract|
| D |11|Required Director capability gaps|
| E |3|Canonical routing proof gaps|
| BASELINE |26|Individually compared with Phase 2C|

Each row includes its exact identity, source, reason, source impact, test action, replacement, and observed result in [failure-manifest.json](failure-manifest.json). Deletions receive REMOVED_NOT_PASS. An absent final execution receives NOT_EXECUTED_AT_FINAL_SOURCE.

| ID | Test | Class | Action | Result |
|---|---|---|---|---|
| BROAD-BASE-001 | current Calcutta candidate preserves every runtime blob except the exact approved analytics identity update | BASELINE | DELETE_OBSOLETE | REMOVED_NOT_PASS |
| BROAD-BASE-002 | Release 133 runtime is byte-preserved except the authorized additive recovery SQL | BASELINE | DELETE_OBSOLETE | REMOVED_NOT_PASS |
| BROAD-BASE-003 | Clear scope remains limited to Calcutta; other Director and participant files unchanged from Release 132 | BASELINE | DELETE_OBSOLETE | REMOVED_NOT_PASS |
| BROAD-BASE-004 | analytics implementation digest requires an explicit version update | BASELINE | KEEP_REQUIRED_TEST | FAIL |
| BROAD-BASE-005 | Google-backed secondary failures are isolated from the core route | BASELINE | KEEP_REQUIRED_TEST | FAIL |
| BROAD-BASE-006 | Players uses one compact accessible Round and Rank By control surface | BASELINE | KEEP_REQUIRED_TEST | FAIL |
| BROAD-BASE-007 | polish is presentation-only and does not add a leaderboard request path | BASELINE | KEEP_REQUIRED_TEST | FAIL |
| BROAD-BASE-008 | Supabase verification distinguishes rejected tokens from provider outages | BASELINE | KEEP_REQUIRED_TEST | FAIL |
| BROAD-BASE-009 | native certification receives only a server-verified Auth UUID and confirmed email | BASELINE | KEEP_REQUIRED_TEST | FAIL |
| BROAD-BASE-010 | Release 134 application, guards, Calcutta, Odds and participant runtime remain byte-identical | BASELINE | DELETE_OBSOLETE | REMOVED_NOT_PASS |
| BROAD-BASE-011 | OTP route is no-signup, six-digit, scoped, durably audited, and returns generic unapproved behavior | BASELINE | KEEP_REQUIRED_TEST | FAIL |
| BROAD-BASE-012 | SSR session, logout, shadow comparison, and participant context stay Passport-authoritative | BASELINE | KEEP_REQUIRED_TEST | FAIL |
| BROAD-BASE-013 | participant navigation uses one fixed safe-area-aware native shell | BASELINE | KEEP_REQUIRED_TEST | FAIL |
| BROAD-BASE-014 | PN-1 preserves Production authority, dispatch, fencing, scoring and post-commit implementations byte-for-byte | BASELINE | DELETE_OBSOLETE | REMOVED_NOT_PASS |
| BROAD-BASE-015 | every compiled mobile route denies Production before Auth, database, provider or worker transport | BASELINE | KEEP_REQUIRED_TEST | FAIL |
| BROAD-BASE-016 | PN-2 web/PWA, Production authority, Preview safeguards and canonical persistence are unchanged | BASELINE | DELETE_OBSOLETE | REMOVED_NOT_PASS |
| BROAD-BASE-017 | Email provider flow remains byte-identical apart from optional enrollment proof issuance | BASELINE | KEEP_REQUIRED_TEST | FAIL |
| BROAD-BASE-018 | Phase 2 public pages consume the shared scorecard analytics service | BASELINE | REWRITE_CANONICAL_CONTRACT | FAIL |
| BROAD-BASE-019 | CLI writes one immutable local artifact and never calls a provider | BASELINE | KEEP_REQUIRED_TEST | FAIL |
| BROAD-BASE-020 | historical writer-scope evidence is generated from exact retained inputs | BASELINE | KEEP_REQUIRED_TEST | FAIL |
| BROAD-BASE-021 | historical READY deployments with the safe-method Google writer are exact | BASELINE | KEEP_REQUIRED_TEST | FAIL |
| BROAD-BASE-022 | the provider contract uses one exact all-method path OR group | BASELINE | KEEP_REQUIRED_TEST | FAIL |
| BROAD-BASE-023 | v4 credential confinement classifies the complete provider and environment inventories | BASELINE | KEEP_REQUIRED_TEST | FAIL |
| BROAD-BASE-024 | phone lifecycle dispatch is individually enumerated for frozen and future Production, with no Director namespace | BASELINE | KEEP_REQUIRED_TEST | FAIL |
| BROAD-BASE-025 | phone candidate introduces no identity tables or Director mutation and keeps service-only grants | BASELINE | KEEP_REQUIRED_TEST | FAIL |
| BROAD-BASE-026 | routes report feedback only after canonical completion; no client-selected receipt | BASELINE | KEEP_REQUIRED_TEST | FAIL |
| BROAD-NEW-001 | Preview flag is server-only and Production fails closed to Google | B | REWRITE_CANONICAL_CONTRACT | PASS |
| BROAD-NEW-002 | Preview finalization exposes generated rows and workbook read-back diagnostics | A | DELETE_OBSOLETE | REMOVED_NOT_PASS |
| BROAD-NEW-003 | Preview flags fail closed in Production | B | REWRITE_CANONICAL_CONTRACT | PASS |
| BROAD-NEW-004 | migration and route are service/Director-only, idempotent, isolated, and retain v2 simulation seeds | A | REWRITE_CANONICAL_CONTRACT | PASS |
| BROAD-NEW-005 | Preview flags fail closed to application outside an isolated Preview deployment | B | REWRITE_CANONICAL_CONTRACT | PASS |
| BROAD-NEW-006 | participant reads consume prepared state and never calculate Storylines on Home | A | REWRITE_CANONICAL_CONTRACT | PASS |
| BROAD-NEW-007 | course tee read-back includes refreshed handicap lookup verification | D | REWRITE_CANONICAL_CONTRACT | PASS |
| BROAD-NEW-008 | new operations reuse the verified Director transaction and read-back pipeline | D | REWRITE_CANONICAL_CONTRACT | PASS |
| BROAD-NEW-009 | Round Pairings uses the active-year team roster and one verified batch mutation | D | REWRITE_CANONICAL_CONTRACT | PASS |
| BROAD-NEW-010 | Net Skins eligibility is edited, batch-written, and verified across configured rounds | D | REWRITE_CANONICAL_CONTRACT | PASS |
| BROAD-NEW-011 | Calcutta purchase and ownership are edited and verified as one transaction | D | REWRITE_CANONICAL_CONTRACT | PASS |
| BROAD-NEW-012 | Match Management exposes contextual lifecycle controls through the verified Director pipeline | D | REWRITE_CANONICAL_CONTRACT | PASS |
| BROAD-NEW-013 | Draft source selection is reversible, Preview-only, isolated, and fail-closed | A | REWRITE_CANONICAL_CONTRACT | PASS |
| BROAD-NEW-014 | schema, synchronization, services, routes, analytics, and profiles share one protected contract | C | REWRITE_CANONICAL_CONTRACT | PASS |
| BROAD-NEW-015 | Game Center read source is Preview-only, server-controlled, and fails closed when Preview Supabase config is incomplete | B | REWRITE_CANONICAL_CONTRACT | PASS |
| BROAD-NEW-016 | Director exposes explicit Preview presentation refresh and parity operations | A | DELETE_OBSOLETE | REMOVED_NOT_PASS |
| BROAD-NEW-017 | protected Guide worker endpoint is POST-only, Preview-gated, and requires application authorization before every action | A | DELETE_OBSOLETE | REMOVED_NOT_PASS |
| BROAD-NEW-018 | protected worker configure/status actions use deployment configuration and return only allowlisted safe status | A | DELETE_OBSOLETE | REMOVED_NOT_PASS |
| BROAD-NEW-019 | Guide and course reads are Preview-only, workbook-isolated, and project-scoped | C | REWRITE_CANONICAL_CONTRACT | PASS |
| BROAD-NEW-020 | automatic sync is separately gated while manual sync remains eligible in isolated Preview | A | DELETE_OBSOLETE | REMOVED_NOT_PASS |
| BROAD-NEW-021 | Guide worker bootstrap takes its fixed endpoint and bearer only from server deployment configuration | A | DELETE_OBSOLETE | REMOVED_NOT_PASS |
| BROAD-NEW-022 | canonical sync claims before Google, publishes one validated projection, and reports a no-op safely | A | DELETE_OBSOLETE | REMOVED_NOT_PASS |
| BROAD-NEW-023 | invalid Google content records a fixed safe failure and preserves last-known-good | A | DELETE_OBSOLETE | REMOVED_NOT_PASS |
| BROAD-NEW-024 | transient Google failures are classified safely and preserve last-known-good | A | DELETE_OBSOLETE | REMOVED_NOT_PASS |
| BROAD-NEW-025 | Supabase publication failure is isolated and leaves the verified projection current | A | DELETE_OBSOLETE | REMOVED_NOT_PASS |
| BROAD-NEW-026 | Production blocks synchronization before a claim or Google import | A | DELETE_OBSOLETE | REMOVED_NOT_PASS |
| BROAD-NEW-027 | 2026 History source is explicitly Preview-only, year-bound, and Production-hard-blocked | A | REWRITE_CANONICAL_CONTRACT | PASS |
| BROAD-NEW-028 | Director import action uses the canonical builder and same bounded import RPC for team metadata | A | DELETE_OBSOLETE | REMOVED_NOT_PASS |
| BROAD-NEW-029 | Step 5 Google to Supabase rollback is explicit, Preview-only, and year-isolated | A | REWRITE_CANONICAL_CONTRACT | PASS |
| BROAD-NEW-030 | completed History source gate is reversible, Preview-only, and fails closed | A | REWRITE_CANONICAL_CONTRACT | PASS |
| BROAD-NEW-031 | secondary History gate is explicit, reversible, Preview-only, and fails closed | A | REWRITE_CANONICAL_CONTRACT | PASS |
| BROAD-NEW-032 | Supabase branches reuse canonical calculations and scorecards without a hidden Google fallback | C | REWRITE_CANONICAL_CONTRACT | PASS |
| BROAD-NEW-033 | historical-course source is reversible, Preview-only, and fails closed | A | REWRITE_CANONICAL_CONTRACT | PASS |
| BROAD-NEW-034 | Home Supabase source is Preview-only and Production fails closed to Google | A | REWRITE_CANONICAL_CONTRACT | PASS |
| BROAD-NEW-035 | Homepage current source inherits the certified Tournament flag, supports an isolated override, and protects Production | A | REWRITE_CANONICAL_CONTRACT | PASS |
| BROAD-NEW-036 | Google to Supabase to Google to Supabase rollback preserves the consumer presentation contract | A | REWRITE_CANONICAL_CONTRACT | PASS |
| BROAD-NEW-037 | source flags are Preview-only and fail closed outside isolated Preview | B | REWRITE_CANONICAL_CONTRACT | PASS |
| BROAD-NEW-038 | Leaderboards core source is Preview-only and Production fails closed | A | REWRITE_CANONICAL_CONTRACT | PASS |
| BROAD-NEW-039 | Preview page and API use Supabase core with no Google fallback or Passport-named identity request | A | REWRITE_CANONICAL_CONTRACT | PASS |
| BROAD-NEW-040 | legacy QR and match-code sessions cannot cross the Supabase participant boundary | B | KEEP_REQUIRED_TEST | PASS |
| BROAD-NEW-041 | Director and rollback legacy routes remain present after participant caller cleanup | A | REWRITE_CANONICAL_CONTRACT | PASS |
| BROAD-NEW-042 | match authorization source is Preview-only, server-controlled, and fails closed | B | REWRITE_CANONICAL_CONTRACT | PASS |
| BROAD-NEW-043 | Director parity exercises 24 players, every action, and independent timing classes | A | DELETE_OBSOLETE | REMOVED_NOT_PASS |
| BROAD-NEW-045 | My Match read source is Preview-only, server-controlled, and fail-closed | B | REWRITE_CANONICAL_CONTRACT | PASS |
| BROAD-NEW-046 | Director parity compares all 24 active participants and reports independent query/service timings | A | DELETE_OBSOLETE | REMOVED_NOT_PASS |
| BROAD-NEW-047 | source flag is Preview-only, server-controlled, and Production fail-closed | B | REWRITE_CANONICAL_CONTRACT | PASS |
| BROAD-NEW-048 | mirror delivery is claimed, retryable, checkpointed, and idempotent | A | DELETE_OBSOLETE | REMOVED_NOT_PASS |
| BROAD-NEW-049 | Director rehearsal route is Preview-only, read-only for Google, and protects real retry behind Supabase authority | A | DELETE_OBSOLETE | REMOVED_NOT_PASS |
| BROAD-NEW-050 | runtime eligibility attests the exact dormant single-deployment capability | B | REWRITE_CANONICAL_CONTRACT | PASS |
| BROAD-NEW-051 | the live route derives replacement deployment and epoch claims from server env | B | REWRITE_CANONICAL_CONTRACT | PASS |
| BROAD-NEW-052 | Auth rehearsal requires Preview, isolated workbook, Passport authority, and complete config | A | REWRITE_CANONICAL_CONTRACT | PASS |
| BROAD-NEW-058 | identity authority defaults to Passport, shadow defaults off, and Production hard-blocks Supabase | A | REWRITE_CANONICAL_CONTRACT | PASS |
| BROAD-NEW-060 | Preview source boundary is reversible, Production-hard-blocked, and never falls back | B | REWRITE_CANONICAL_CONTRACT | PASS |
| BROAD-NEW-061 | projection migration reuses Odds configuration revisions and the route reads one Google tab | C | REWRITE_CANONICAL_CONTRACT | PASS |
| BROAD-NEW-072 | impersonation API and QA Tools are strictly Preview gated | D | REWRITE_CANONICAL_CONTRACT | PASS |
| BROAD-NEW-073 | Mission Control embeds the existing publisher and uses Director authorization | D | REWRITE_CANONICAL_CONTRACT | PASS |
| BROAD-NEW-074 | published Odds source is Preview-only and Production fail-closed | B | REWRITE_CANONICAL_CONTRACT | PASS |
| BROAD-NEW-075 | Odds Center and Insights expose the shared freshness contract without a Supabase-to-Google fallback | A | REWRITE_CANONICAL_CONTRACT | PASS |
| BROAD-NEW-076 | archive feature flag is Preview/Supabase-only and Production-hard-blocked | A | DELETE_OBSOLETE | REMOVED_NOT_PASS |
| BROAD-NEW-077 | worker writes, freshly verifies, and checkpoints one claimed archive job | A | DELETE_OBSOLETE | REMOVED_NOT_PASS |
| BROAD-NEW-078 | Reopen job uses invalidation writer and checkpoints INVALIDATED | A | DELETE_OBSOLETE | REMOVED_NOT_PASS |
| BROAD-NEW-079 | archive 429 failure remains retryable and never checkpoints | A | DELETE_OBSOLETE | REMOVED_NOT_PASS |
| BROAD-NEW-080 | archive 503 failure remains retryable and never checkpoints | A | DELETE_OBSOLETE | REMOVED_NOT_PASS |
| BROAD-NEW-081 | archive timeout failure remains retryable and never checkpoints | A | DELETE_OBSOLETE | REMOVED_NOT_PASS |
| BROAD-NEW-082 | readback mismatch and stale/newest-wins checkpoint failures remain durable | A | DELETE_OBSOLETE | REMOVED_NOT_PASS |
| BROAD-NEW-083 | service reconciliation proves formulas, values, checkpoints, and evidence cases from fresh state | A | DELETE_OBSOLETE | REMOVED_NOT_PASS |
| BROAD-NEW-084 | cron endpoint requires the server-only Preview flag and worker secret | A | DELETE_OBSOLETE | REMOVED_NOT_PASS |
| BROAD-NEW-085 | request-scoped workbook access reuses sheets and workbook metadata | A | DELETE_OBSOLETE | REMOVED_NOT_PASS |
| BROAD-NEW-086 | authority flag fails closed unless the environment-specific isolation and activation gates are complete | B | REWRITE_CANONICAL_CONTRACT | PASS |
| BROAD-NEW-087 | Preview administrative route is Director-gated and leaves participant scoring authority untouched | A | DELETE_OBSOLETE | REMOVED_NOT_PASS |
| BROAD-NEW-088 | authority defaults Production to Google but explicit ineligible Supabase fails closed | A | REWRITE_CANONICAL_CONTRACT | PASS |
| BROAD-NEW-089 | Director mirror reconciliation inspects and delivers exactly one confirmed reopen event | A | DELETE_OBSOLETE | REMOVED_NOT_PASS |
| BROAD-NEW-090 | Preview Live Matches migration inserts exactly one canonical column and verifies preservation | A | DELETE_OBSOLETE | REMOVED_NOT_PASS |
| BROAD-NEW-091 | Preview Director repair is gated, audited, and never re-finalizes or changes holes | A | DELETE_OBSOLETE | REMOVED_NOT_PASS |
| BROAD-NEW-092 | participant scoring routes preserve the API and delegate persistence server-side | A | REWRITE_CANONICAL_CONTRACT | PASS |
| BROAD-NEW-093 | Preview Director exposes only the explicit prepared cutover and rollback controls | A | DELETE_OBSOLETE | REMOVED_NOT_PASS |
| BROAD-NEW-094 | Phase 2 Director diagnostics retain safe PostgREST errors without exposing credentials | A | DELETE_OBSOLETE | REMOVED_NOT_PASS |
| BROAD-NEW-095 | generic updates cannot bypass dedicated lifecycle transactions | A | REWRITE_CANONICAL_CONTRACT | PASS |
| BROAD-NEW-096 | scoring read source is Preview-only, server-controlled, and has no browser override | B | REWRITE_CANONICAL_CONTRACT | PASS |
| BROAD-NEW-098 | Director diagnostics expose a read-only 24-match scoring contract parity action | A | DELETE_OBSOLETE | REMOVED_NOT_PASS |
| BROAD-NEW-099 | legacy normalization is Preview-only, audited, versioned, and leaves scoring authority unchanged | A | DELETE_OBSOLETE | REMOVED_NOT_PASS |
| BROAD-NEW-100 | Preview benchmark administration is Director-gated, reversible, and covers every authorized stage | A | DELETE_OBSOLETE | REMOVED_NOT_PASS |
| BROAD-NEW-101 | participant scoring client remains database-inactive while server authority selects the current source | A | REWRITE_CANONICAL_CONTRACT | PASS |
| BROAD-NEW-102 | live Production source selectors remain Google and Passport | A | REWRITE_CANONICAL_CONTRACT | PASS |
| BROAD-NEW-104 | Production-shadow candidate blocks explicit Production archive reads before transport or fallback | A | REWRITE_CANONICAL_CONTRACT | PASS |
| BROAD-NEW-105 | malformed requested Production-shadow candidate also blocks explicit Google reads | A | REWRITE_CANONICAL_CONTRACT | PASS |
| BROAD-NEW-106 | live Production fails closed when candidate variables explicitly request Supabase identity | A | REWRITE_CANONICAL_CONTRACT | PASS |
| BROAD-NEW-109 | all migrated candidate selectors resolve only certified Production shadow reads | E | RETAIN_REQUIRED_RED_PROOF | FAIL |
| BROAD-NEW-110 | missing candidate transport fails closed without a Google fallback | C | REWRITE_CANONICAL_CONTRACT | PASS |
| BROAD-NEW-111 | live Production remains Google/Passport and rejects injected candidate read selection | A | REWRITE_CANONICAL_CONTRACT | PASS |
| BROAD-NEW-112 | candidate can never acquire Odds publication authority | E | RETAIN_REQUIRED_RED_PROOF | FAIL |
| BROAD-NEW-113 | candidate War Room cannot select the Google rollback adapter | C | REWRITE_CANONICAL_CONTRACT | PASS |
| BROAD-NEW-115 | route dispatch has an exact Step 11.6 ACL action map and no legacy fallback | A | DELETE_OBSOLETE | REMOVED_NOT_PASS |
| BROAD-NEW-116 | Production server import surface cannot dispatch the retired protected-range executor | A | DELETE_OBSOLETE | REMOVED_NOT_PASS |
| BROAD-NEW-117 | canonical route matrix is exact, POST-only, lease-bound, and fail-closed when admission is CLOSED | A | DELETE_OBSOLETE | REMOVED_NOT_PASS |
| BROAD-NEW-118 | canonical wrapper and participant adapter import surfaces are closed to the matrix | A | DELETE_OBSOLETE | REMOVED_NOT_PASS |
| BROAD-NEW-119 | the private Sheets transport dynamically marks WRITE_STARTED after OAuth and before every canonical provider write | A | DELETE_OBSOLETE | REMOVED_NOT_PASS |
| BROAD-NEW-120 | v3 canonical boundary has no v1 completion-success escape | A | DELETE_OBSOLETE | REMOVED_NOT_PASS |
| BROAD-NEW-121 | v3 admission fails closed and uses the fenceable legacy credential identity | A | DELETE_OBSOLETE | REMOVED_NOT_PASS |
| BROAD-NEW-122 | lost BEGIN response replays the exact OPEN payload during CLOSING without a second lease | A | DELETE_OBSOLETE | REMOVED_NOT_PASS |
| BROAD-NEW-123 | settled callback revokes detached dispatch before outcome reporting can pause | A | DELETE_OBSOLETE | REMOVED_NOT_PASS |
| BROAD-NEW-124 | Director and Live Match routes assert the client authority contract before branching to either backend | A | REWRITE_CANONICAL_CONTRACT | PASS |
| BROAD-NEW-125 | credential operations are identity-bound to canonical, authoring, and mirror mutation intents | A | DELETE_OBSOLETE | REMOVED_NOT_PASS |
| BROAD-NEW-126 | v3 reports no-write, ambiguous, and partial outcomes without a finally-success path | A | DELETE_OBSOLETE | REMOVED_NOT_PASS |
| BROAD-NEW-127 | retired Sheets rehearsal and Drive ACL/WAF executor surface are exact | A | KEEP_REQUIRED_TEST | PASS |
| BROAD-NEW-128 | both browser clients gate quiesce execution on the attestation workflow | A | DELETE_OBSOLETE | REMOVED_NOT_PASS |
| BROAD-NEW-129 | module-owned Vercel WAF executor couples durable dispatch to exact provider readback | A | KEEP_REQUIRED_TEST | PASS |
| BROAD-NEW-130 | Production activation requires the exact normalized server resource tuple and frozen SHA | A | REWRITE_CANONICAL_CONTRACT | PASS |
| BROAD-NEW-131 | Production Google write lease is opt-in, epoch-bound, and replaces caller resource claims | A | DELETE_OBSOLETE | REMOVED_NOT_PASS |
| BROAD-NEW-132 | all foreground and high-impact Google writer boundaries include the dormant lease gate | A | DELETE_OBSOLETE | REMOVED_NOT_PASS |
| BROAD-NEW-134 | ODDS_WAR_ROOM inputs require their later phase and publication uses one exact authority tuple | C | REWRITE_CANONICAL_CONTRACT | PASS |
| BROAD-NEW-135 | activation disabled preserves certified live Production legacy resolution | A | REWRITE_CANONICAL_CONTRACT | PASS |
| BROAD-NEW-136 | optional side-game reads preserve canonical empty states without an obsolete deployment-configuration gate | A | REWRITE_CANONICAL_CONTRACT | PASS |
| BROAD-NEW-137 | legacy Drive principal fingerprint is normalized and survives key rotation | A | DELETE_OBSOLETE | REMOVED_NOT_PASS |
| BROAD-NEW-138 | validated canonical credential pair is captured once before callback dispatch | A | DELETE_OBSOLETE | REMOVED_NOT_PASS |
| BROAD-NEW-139 | legacy application traffic remains on GOOGLE_* even when Production credentials exist | A | DELETE_OBSOLETE | REMOVED_NOT_PASS |
| BROAD-NEW-140 | an exact read-only Production worker context selects only the dedicated pair | A | DELETE_OBSOLETE | REMOVED_NOT_PASS |
| BROAD-NEW-141 | an exact canonical admission scope selects only the legacy writer identity | A | DELETE_OBSOLETE | REMOVED_NOT_PASS |
| BROAD-NEW-142 | Production worker selection never falls back to legacy credentials | A | DELETE_OBSOLETE | REMOVED_NOT_PASS |
| BROAD-NEW-143 | Step 11 metadata route is Director-only, exact-candidate, read-only, and secret-safe | A | DELETE_OBSOLETE | REMOVED_NOT_PASS |
| BROAD-NEW-144 | Step 11 browser certificate alias reuses the exact metadata handler | A | DELETE_OBSOLETE | REMOVED_NOT_PASS |
| BROAD-NEW-145 | dormant live Production fails closed when Supabase identity was explicitly selected | A | REWRITE_CANONICAL_CONTRACT | PASS |
| BROAD-NEW-146 | Preview identity behavior remains separate from Production activation | B | REWRITE_CANONICAL_CONTRACT | PASS |
| BROAD-NEW-147 | Production scoring authority activates only at the exact committed cutover gate | A | REWRITE_CANONICAL_CONTRACT | PASS |
| BROAD-NEW-148 | worker routes are authenticated POST-only gates | A | DELETE_OBSOLETE | REMOVED_NOT_PASS |
| BROAD-NEW-149 | participant scoring queues mirrors until the explicit Production worker phase | A | REWRITE_CANONICAL_CONTRACT | PASS |
| BROAD-NEW-150 | representative candidate Supabase services fail closed with zero Google fallback | E | RETAIN_REQUIRED_RED_PROOF | FAIL |
| BROAD-NEW-151 | canonical Supabase Odds publication cannot resolve a Production Google read fallback | C | REWRITE_CANONICAL_CONTRACT | PASS |
| BROAD-NEW-152 | Production route uses active Director + retained job while Preview behavior remains isolated | A | REWRITE_CANONICAL_CONTRACT | PASS |
| BROAD-NEW-153 | writer copies protected formulas and worker transport stays exact-scoped and private POST-only | A | REWRITE_CANONICAL_CONTRACT | PASS |
| BROAD-NEW-154 | nested Director API is same-origin guarded and does not forward destination input | A | DELETE_OBSOLETE | REMOVED_NOT_PASS |
| BROAD-NEW-155 | future live/guide/archive source paths cannot use a caller-selected year | A | REWRITE_CANONICAL_CONTRACT | PASS |
| BROAD-NEW-156 | future scoring strips caller annual authority and uses one certified dispatcher | A | REWRITE_CANONICAL_CONTRACT | PASS |
| BROAD-NEW-157 | Google worker resources require the branded exact annual context | A | DELETE_OBSOLETE | REMOVED_NOT_PASS |
| BROAD-NEW-158 | annual Odds scope is server-selected and cannot be replaced by caller input | A | REWRITE_CANONICAL_CONTRACT | PASS |
| BROAD-NEW-159 | application dispatcher preserves the frozen 2026 RPC and binds future calls to one annual RPC | A | REWRITE_CANONICAL_CONTRACT | PASS |
| BROAD-NEW-160 | Production Admin CMS schedule authority is retired without changing isolated Preview behavior | A | REWRITE_CANONICAL_CONTRACT | PASS |
| BROAD-NEW-161 | missing and explicit legacy Preview selectors preserve their approved authorities | A | REWRITE_CANONICAL_CONTRACT | PASS |
| BROAD-NEW-162 | eligible Preview selectors resolve Supabase without blocking | B | KEEP_REQUIRED_TEST | PASS |
| BROAD-NEW-163 | Scoring accepts an isolated Preview workbook when the optional exact workbook selector is absent | B | REWRITE_CANONICAL_CONTRACT | PASS |
| BROAD-NEW-164 | invalid Preview authority tokens fail closed instead of selecting a legacy authority | C | REWRITE_CANONICAL_CONTRACT | PASS |
| BROAD-NEW-165 | ineligible Preview Supabase requests fail closed with prerequisite diagnostics | C | REWRITE_CANONICAL_CONTRACT | PASS |
| BROAD-NEW-166 | Production preserves legacy defaults but explicit Supabase authority fails closed until cutover is eligible | A | REWRITE_CANONICAL_CONTRACT | PASS |
| BROAD-NEW-167 | Odds calculation and publication selectors remain independently enforceable | A | REWRITE_CANONICAL_CONTRACT | PASS |
| BROAD-NEW-168 | Director mutation guards execute before legacy Google reads and writes | A | REWRITE_CANONICAL_CONTRACT | PASS |
| BROAD-NEW-169 | Supabase Director lifecycle operations use canonical state before any legacy workbook read | A | REWRITE_CANONICAL_CONTRACT | PASS |
| BROAD-NEW-170 | live-match authorization does not accept Guide or Odds secrets | C | REWRITE_CANONICAL_CONTRACT | PASS |
| BROAD-NEW-171 | migrated Preview source boundaries reject unknown tokens instead of reaching Google/application | C | REWRITE_CANONICAL_CONTRACT | PASS |
| BROAD-NEW-172 | Production retains its approved legacy resolution when Supabase is requested | A | REWRITE_CANONICAL_CONTRACT | PASS |
| BROAD-NEW-173 | secondary-history route selection cannot turn an invalid token into a Google refresh | C | REWRITE_CANONICAL_CONTRACT | PASS |
| BROAD-NEW-174 | Director LIVE transitions also open scoring and explicit lock controls remain available | D | REWRITE_CANONICAL_CONTRACT | PASS |
| BROAD-NEW-175 | Director API requires canonical account Director authorization and uses audited writers | D | REWRITE_CANONICAL_CONTRACT | PASS |
| BROAD-NEW-176 | Director actions log every transaction boundary and verify workbook read-back | D | REWRITE_CANONICAL_CONTRACT | PASS |
| BROAD-NEW-177 | Tournament foundation source is independently Preview-gated and cannot move live scoring | A | REWRITE_CANONICAL_CONTRACT | PASS |
| BROAD-NEW-178 | Tournament Supabase source is Preview-only and Production fails closed | A | REWRITE_CANONICAL_CONTRACT | PASS |
| BROAD-NEW-179 | one source boundary defaults Preview to Google and hard-resolves Production to Google | A | REWRITE_CANONICAL_CONTRACT | PASS |
| BROAD-NEW-180 | Step 7D does not alter engine formulas, UI styling, publication, or consumer source configuration | C | REWRITE_CANONICAL_CONTRACT | PASS |
| BROAD-SECOND-ONLY-001 | environment documentation defaults completed History reads to Google | A | REWRITE_CANONICAL_CONTRACT | PASS |
| BROAD-SECOND-ONLY-002 | Players and Profiles use the shared service branch without page-level Supabase queries | A | REWRITE_CANONICAL_CONTRACT | PASS |
| BROAD-SECOND-ONLY-003 | course routes use the shared service with an isolated current Guide path and no direct Supabase query | A | REWRITE_CANONICAL_CONTRACT | PASS |
| BROAD-SECOND-ONLY-004 | environment example keeps rehearsal and persistent-fence gates explicit and disabled | A | REWRITE_CANONICAL_CONTRACT | PASS |
| BROAD-SECOND-ONLY-005 | live legacy Production Director authorization is unchanged while dormant activation is disabled | A | REWRITE_CANONICAL_CONTRACT | PASS |

## Closure-only findings

The three source assertions newly exposed during closure are classified C (stale retired-surface assertions), separately from the immutable original 162 additional failures. Their reviewed replacements pass in the final broad run; no required capability is credited as complete from those source assertions. Exact identities and reasons are in failure-manifest.json.closureAdditionalFailures.

**Remaining observed failures:** 20 unchanged-cause baseline tests and BROAD-NEW-109, BROAD-NEW-112, BROAD-NEW-150 (required canonical routing; not waived). **Unknown failure classifications:** 0. **Unaccounted new failure identities:** 0. Capability-level completion remains governed by [CAPABILITY-GAPS.md](CAPABILITY-GAPS.md); seven required identities remain PARTIAL despite passing rewritten test expectations.
