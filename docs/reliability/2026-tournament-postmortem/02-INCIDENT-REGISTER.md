# Canonical 2026 incident register

Historical retained evidence only. No Production queries were performed. Severity describes operational impact, not assumed corruption. INC-024/025 are warning/control gaps; INC-020 is a recovery workload. Diagnosis/recovery durations remain UNKNOWN when start/end evidence is incomplete. Source/release fields distinguish historical correction from proposed future prevention. Contributing factors distinguish established mechanisms, certification gaps and unproven hypotheses.

<a id="2026-inc-001"></a>

## 2026-INC-001 — PWA tournament-day timezone and mounted-clock defect

- **Date Time:** {"incident": "UNKNOWN", "boundedEvidence": "Correction commit authored 2026-09-22T20:49:15-05:00; Release 131 deployed 2026-09-23T02:12:58.750Z"}
- **Release:** {"affected": "<=130", "recovered": 131}
- **Activation:** {"affected": "UNKNOWN", "recovered": 230}
- **Sha:** {"affected": "bde9de21079d0a634ca5951915d9153d078918a9 (Release 130 baseline/rollback)", "recovered": "0e7ec617f16e37589917f8c73c6f5e1550a1ca5b"}
- **Surface:** ["PWA", "Backend presentation", "Certification"]
- **Severity:** P2
- **User Impact:** Tournament-day labels and mounted clock could disagree with tournament timezone/date boundaries.
- **Competitive Impact:** Presentation/workflow availability; no direct score or golf-result corruption established for this incident. Dependent failures are separate incident IDs.
- **Data Integrity Impact:** No canonical corruption established by the cited evidence; not an exhaustive historical database comparison.
- **Root Cause:** Tournament schedule/day presentation did not consistently derive the live clock, day boundary, and schedule status from the published IANA tournament timezone. The recovered code centralizes published timezone selection, IANA conversion, and a mounted minute/focus/visibility clock.
- **Confidence:** PROVEN
- **Contributing Factors:** ["Inconsistent treatment of tournament timezone and a long-mounted presentation clock.", "Certification gap: retained proof did not cover every physical midnight/timezone transition; those transitions are test requirements, not proven incident observations."]
- **Detection Method:** Preserved timezone source, boundary tests and hosted certification artifacts; comprehensive physical midnight coverage was not retained.
- **Recovery:** Release 131 carried the timezone correction. Browser refresh/focus/visibility now advances the mounted clock; this is presentation-only and does not change round authority.
- **Time To Diagnose:** UNKNOWN — exact first detection and diagnosis boundaries not fully retained
- **Time To Recover:** UNKNOWN — observations bound recovery, not full outage duration
- **Source Change Required:** Yes; PWA clock/timezone correction.
- **Release Required:** Release 131 (historical correction).
- **Native Build Required:** No native change for that PWA correction.
- **Why Certification Missed:** Earlier presentation or fresh-render success did not prove a long-mounted page across tournament-local midnight or a device timezone different from the tournament timezone.
- **Test That Would Catch:** NA-2026-001
- **Architectural Prevention:** {"requirement_ids": ["CERT-NA-001", "B11-READ-005"], "note": "Proposed acceptance and systemic prevention in REQUIREMENTS.md; implementation not performed."}
- **Automation Opportunity:** ["AUTO-015", "AUTO-024"]
- **Observability Requirement:** Scoped request/operation/mutation correlation; domain error, latency and resource context; no secrets.
- **Status:** resolved in Release 131; retain regression coverage
- **Proof Layers:** ["SOURCE_INSPECTED", "UNIT_TESTED", "STAGED_HOSTED_TESTED", "PRODUCTION_READBACK_VERIFIED"]
- **Limitations:** No retained artifact proves a physical iPhone exercised every timezone/midnight boundary. Hosted PWA readback is not physical-device proof.

Evidence: [EV-001-01](/private/tmp/bagger-build8-shipping/navigation-correction/PREDECESSOR-EVIDENCE.json); [EV-001-02](/private/tmp/bagger-pwa-time-production/FREEZE-CERTIFICATION.json); [EV-001-03](/private/tmp/bagger-r1-open-incident/source/lib/tournament-timeline.js); [EV-001-04](/private/tmp/bagger-r1-open-incident/source/app/useTournamentClock.js); [EV-001-05](/private/tmp/bagger-r1-open-incident/source/test/tournament-time-freeze.test.mjs)

<a id="2026-inc-002"></a>

## 2026-INC-002 — Spectator current-match navigation mixed tournament-wide links with round-scoped position

- **Date Time:** {"incident": "UNKNOWN; discovered during Build 8 shipping certification", "boundedEvidence": "Correction certification recorded 2026-09-23T12:27:50.605989Z"}
- **Release:** {"affected": 131, "recovered": 132}
- **Activation:** {"affected": 230, "recovered": 231}
- **Sha:** {"affectedBackend": "9f71ea73faa08b8e5c35e94e2bbf650b3468b511", "recoveredBackend": "4f880f04e19b13f97cab5cd1b0c5a20213f55d53", "nativeUnchanged": "1bcd531971ca44073c88694ea09a25c8c2a4bd3c"}
- **Surface:** ["Backend spectator projection", "Native spectator Match Detail", "Certification"]
- **Severity:** P2
- **User Impact:** Spectator current-match navigation could select the wrong match because the link set and positional scope differed.
- **Competitive Impact:** Presentation/workflow availability; no direct score or golf-result corruption established for this incident. Dependent failures are separate incident IDs.
- **Data Integrity Impact:** No canonical corruption established by the cited evidence; not an exhaustive historical database comparison.
- **Root Cause:** The authoritative Game Center view supplied tournament-wide previous/next IDs while its index/count were round-scoped. The spectator adapter copied both into a native DTO whose endpoint invariants require no previous at round index 1 and no next at round index count.
- **Confidence:** PROVEN
- **Contributing Factors:** ["The projection combined tournament-wide navigation IDs with round-scoped position/count.", "Certification gap: endpoint invariants were insufficient without same-round link membership."]
- **Detection Method:** Preserved backend spectator contract investigation and source/certification artifacts.
- **Recovery:** Release 132 computes spectator previous/next within canonical round scope; native source did not change.
- **Time To Diagnose:** UNKNOWN — exact first detection and diagnosis boundaries not fully retained
- **Time To Recover:** UNKNOWN — observations bound recovery, not full outage duration
- **Source Change Required:** Yes; backend spectator projection correction.
- **Release Required:** Release 132 (historical correction).
- **Native Build Required:** Build 8 source unchanged for this backend correction.
- **Why Certification Missed:** Fixture-based Build 8 navigation PASS lacked current canonical boundary responses. JSON decode and screen rendering were weaker than DTO semantic compatibility.
- **Test That Would Catch:** NA-2026-002
- **Architectural Prevention:** {"requirement_ids": ["CERT-NA-001", "B11-NAV-005"], "note": "Proposed acceptance and systemic prevention in REQUIREMENTS.md; implementation not performed."}
- **Automation Opportunity:** ["AUTO-015"]
- **Observability Requirement:** Scoped request/operation/mutation correlation; domain error, latency and resource context; no secrets.
- **Status:** resolved server-side in Release 132; native invariant retained
- **Proof Layers:** ["SOURCE_INSPECTED", "UNIT_TESTED", "API_RPC_TESTED", "STAGED_HOSTED_TESTED", "PRODUCTION_READBACK_VERIFIED"]
- **Limitations:** The blocker report explicitly did not claim three physical screens failed. Later live PWA captures and native compatibility proved corrected data, not a physical iPhone traversal of every round boundary.

Evidence: [EV-002-01](/private/tmp/bagger-build8-shipping/navigation-correction/CORRECTION.md); [EV-002-02](/private/tmp/bagger-build8-shipping/NAVIGATION-BLOCKER.md); [EV-002-03](/private/tmp/bagger-build8-shipping/NAVIGATION-BLOCKER.json); [EV-002-04](/private/tmp/bagger-build10-today/native/ios/BaggerInv/Models/MobileMatchDetailModels.swift)

Additional activation evidence: [EV-002-05](/private/tmp/bagger-build8-shipping/navigation-correction/closure-state.json:13).

<a id="2026-inc-003"></a>

## 2026-INC-003 — Spectator More rendered system dark grouped cards under fixed light Bagger colors

- **Date Time:** {"incident": "UNKNOWN; owner observation before local Build 9 correction", "boundedEvidence": "Build 9 report dated 2026-09-23"}
- **Release:** {"backend": 132, "nativeAffected": "Build 8", "nativeRecovered": "Build 9 candidate and inherited by Build 10"}
- **Activation:** NOT APPLICABLE to native binary; backend activation not causal
- **Sha:** {"affectedNative": "1bcd531971ca44073c88694ea09a25c8c2a4bd3c", "recoveredNative": "c468b0d625a64e3da9f88b1d264cfa6039c5b521", "build10": "e7652b9b65595861f4f7cdf0b8326491581a27b8"}
- **Surface:** ["Native spectator", "Visual certification"]
- **Severity:** P2
- **User Impact:** Spectator More displayed dark system rows behind fixed palette text, reducing readability.
- **Competitive Impact:** Presentation/workflow availability; no direct score or golf-result corruption established for this incident. Dependent failures are separate incident IDs.
- **Data Integrity Impact:** No canonical corruption established by the cited evidence; not an exhaustive historical database comparison.
- **Root Cause:** The Release window selected dark appearance for signed-out state. A nested light preference did not override the window, and inset-grouped List rows remained system-adaptive while Bagger text/icon colors were fixed. The DEBUG gallery forced outer light appearance and masked the defect.
- **Confidence:** PROVEN
- **Contributing Factors:** ["The DEBUG fixture forced light appearance while the shipping root could inherit system dark appearance.", "Fixed palette text and system grouped-card backgrounds could diverge."]
- **Detection Method:** Shipping source and DEBUG-fixture comparison, unit/simulator certification artifacts; not blanket physical acceptance.
- **Recovery:** Build 9 scoped the light color environment to the existing spectator More hierarchy; Build 10 inherits it.
- **Time To Diagnose:** UNKNOWN — exact first detection and diagnosis boundaries not fully retained
- **Time To Recover:** UNKNOWN — observations bound recovery, not full outage duration
- **Source Change Required:** Yes; native appearance correction.
- **Release Required:** Native Build 9; no backend release required for that correction.
- **Native Build Required:** Build 9 (historical correction).
- **Why Certification Missed:** Build 8's 19 participant visual comparisons did not cover spectator More under the Release signed-out window appearance. The DEBUG gallery's outer light mode produced a false-negative fixture.
- **Test That Would Catch:** NA-2026-003
- **Architectural Prevention:** {"requirement_ids": ["CERT-NA-001", "B11-READ-006"], "note": "Proposed acceptance and systemic prevention in REQUIREMENTS.md; implementation not performed."}
- **Automation Opportunity:** ["AUTO-024"]
- **Observability Requirement:** Scoped request/operation/mutation correlation; domain error, latency and resource context; no secrets.
- **Status:** corrected in Build 9/10 source; physical correction evidence incomplete
- **Proof Layers:** ["SOURCE_INSPECTED", "UNIT_TESTED", "SIMULATOR_TESTED"]
- **Limitations:** Owner-reported physical symptom exists, but Build 9 correction was not physically retested in its report. Simulator shipping-appearance reproduction is strong implementation proof, not physical acceptance.

Evidence: [EV-003-01](/private/tmp/bagger-build9-more/REPORT.md); [EV-003-02](/private/tmp/bagger-build9-more/REPORT.md); [EV-003-03](/private/tmp/bagger-build9-more/DIAGNOSIS.json); [EV-003-04](/private/tmp/bagger-build10-today/native/ios/BaggerInv/BaggerInvApp.swift); [EV-003-05](/private/tmp/bagger-build10-today/native/ios/BaggerInv/Spectator/SpectatorAppShell.swift)

<a id="2026-inc-004"></a>

## 2026-INC-004 — Spectator Today showed unavailable while pending and retried only one required resource

- **Date Time:** {"incident": "Reported around 2026-09-23 08:42 local; exact physical request/cause UNKNOWN", "boundedEvidence": "Nearby tournament GETs at 13:42:07Z and 13:42:30Z were 200"}
- **Release:** {"backend": 132, "nativeAffected": "Build 9", "nativeRecovered": "Build 10"}
- **Activation:** UNKNOWN / not causal
- **Sha:** {"affectedNative": "c468b0d625a64e3da9f88b1d264cfa6039c5b521", "recoveredNative": "e7652b9b65595861f4f7cdf0b8326491581a27b8"}
- **Surface:** ["Native spectator Today", "Lifecycle", "Certification"]
- **Severity:** P1
- **User Impact:** Spectator Today could show unavailable while still pending and retry only one of two required resources.
- **Competitive Impact:** Presentation/workflow availability; no direct score or golf-result corruption established for this incident. Dependent failures are separate incident IDs.
- **Data Integrity Impact:** No canonical corruption established by the cited evidence; not an exhaustive historical database comparison.
- **Root Cause:** Today required serial tournament and Leaders reads but had no distinct initial-loading state, so empty nonfailed state rendered unavailable. The unavailable Try Again callback refreshed only Leaders even though tournament was also required.
- **Confidence:** PROVEN for the two code defects; UNKNOWN for which caused the reported physical event
- **Contributing Factors:** ["Today depended on two resources but pending/retry handling did not treat both consistently.", "Individual physical slow/unavailable events lack request-level attribution."]
- **Detection Method:** Preserved Today loading/retry source and test/simulator investigation; not attribution of every physical latency event.
- **Recovery:** Build 10 adds pending/retrying state and retries tournament then Leaders as one coalesced Today attempt. A Build 9 full shell refresh/background-reopen could recover after connectivity returned; the old Try Again could not recover tournament failure alone.
- **Time To Diagnose:** UNKNOWN — exact first detection and diagnosis boundaries not fully retained
- **Time To Recover:** UNKNOWN — observations bound recovery, not full outage duration
- **Source Change Required:** Yes; native Today loading/retry correction.
- **Release Required:** Native Build 10; no backend release required for that correction.
- **Native Build Required:** Build 10 (historical correction); unrelated physical slowness remains unattributed.
- **Why Certification Missed:** Build 8 public journeys and Build 9 appearance tests proved surfaces, not empty-cache pending semantics, resource-specific retry, provider attribution, or physical latency. Nearby HTTP 200s were not evidence against a transient client failure.
- **Test That Would Catch:** NA-2026-004
- **Architectural Prevention:** {"requirement_ids": ["CERT-NA-001", "B11-READ-003", "B11-READ-004", "B11-READ-007"], "note": "Proposed acceptance and systemic prevention in REQUIREMENTS.md; implementation not performed."}
- **Automation Opportunity:** ["AUTO-023", "AUTO-024"]
- **Observability Requirement:** Scoped request/operation/mutation correlation; domain error, latency and resource context; no secrets.
- **Status:** code defects corrected in Build 10; original physical trigger remains unknown
- **Proof Layers:** ["SOURCE_INSPECTED", "UNIT_TESTED", "SIMULATOR_TESTED", "PRODUCTION_READBACK_VERIFIED"]
- **Limitations:** A physical failure and successful Try Again were reported, but logs cannot identify the physical request. The Build 10 correction was ready for owner physical acceptance; no retained report closes that exact physical Today matrix.

Evidence: [EV-004-01](/private/tmp/bagger-build9-performance/REPORT.md); [EV-004-02](/private/tmp/bagger-build9-performance/REPORT.md); [EV-004-03](/private/tmp/bagger-build9-performance/REPORT.md); [EV-004-04](/private/tmp/bagger-build9-performance/REPORT.md); [EV-004-05](/private/tmp/bagger-build10-today/native/ios/BaggerInv/Spectator/SpectatorStore.swift); [EV-004-06](/private/tmp/bagger-build10-today/native/ios/BaggerInv/Spectator/SpectatorAppShell.swift); [EV-004-07](/private/tmp/bagger-build10-today/REPORT.md)

<a id="2026-inc-005"></a>

## 2026-INC-005 — Native score entry omitted canonical per-hole stroke indicators before first save

- **Date Time:** {"incident": "Physical observation on 2026-09-25 before 11:54:31Z", "boundedEvidence": "Read-only diagnostic during Release 136 / activation 235"}
- **Release:** 136
- **Activation:** 235
- **Sha:** {"native": "e7652b9b65595861f4f7cdf0b8326491581a27b8", "backend": "bae7d85ad72e81d42bee7a3f9d0f6c1ca0131ac9"}
- **Surface:** ["Native participant scoring presentation", "Mobile read contract", "Workflow design"]
- **Severity:** P1
- **User Impact:** Scorers could not see canonical per-hole stroke badges before entering the first gross score.
- **Competitive Impact:** Availability/completion risk; no proven formula or Official corruption in examined evidence.
- **Data Integrity Impact:** No canonical corruption established by the cited evidence; not an exhaustive historical database comparison.
- **Root Cause:** The scoring DTO carries per-hole strokes only inside persisted score rows. Score Entry derives badge values from officialHole(holeNumber); an unscored hole has no row, so canonicalStrokes is nil and the positive-only badge rule renders nothing. Match-level stroke totals exist, but no pre-entry 18-hole allocation matrix reaches this view.
- **Confidence:** PROVEN
- **Contributing Factors:** ["Pre-entry native presentation did not expose the canonical per-hole stroke indicators needed before the first Official score.", "Correct server allocation was narrower proof than correct entry UI."]
- **Detection Method:** Owner physical observation plus retained canonical server allocation validation and native presentation source.
- **Recovery:** Tournament-day workaround was the verified physical-match stroke matrix and continued gross entry. Server-owned strokes/net/winner remained correct; users must not subtract strokes before entry.
- **Time To Diagnose:** UNKNOWN — exact first detection and diagnosis boundaries not fully retained
- **Time To Recover:** UNKNOWN — observations bound recovery, not full outage duration
- **Source Change Required:** Yes for permanent native display correction; server-provided allocation contract must be verified.
- **Release Required:** Future native release; no tournament-day backend correction established.
- **Native Build Required:** Future Build 11 scoped presentation correction.
- **Why Certification Missed:** Prior score queue, Best Ball, and badge tests proved saved-hole presentation and server calculations. They did not prove canonical stroke visibility before entry on all 18 holes and formats.
- **Test That Would Catch:** NA-2026-005
- **Architectural Prevention:** {"requirement_ids": ["CERT-001", "CERT-NA-001", "CERT-PHY-001", "B11-SCORE-007", "B11-SCORE-008"], "note": "Proposed acceptance and systemic prevention in REQUIREMENTS.md; implementation not performed."}
- **Automation Opportunity:** ["AUTO-024"]
- **Observability Requirement:** Scoped request/operation/mutation correlation; domain error, latency and resource context; no secrets.
- **Status:** outstanding Build 11 presentation/contract requirement
- **Proof Layers:** ["SOURCE_INSPECTED", "DATABASE_SQL_TESTED", "API_RPC_TESTED", "SIMULATOR_TESTED", "PRODUCTION_READBACK_VERIFIED"]
- **Limitations:** The owner reported missing indicators on a physical match. The audit did not capture the phone's exact HTTP response or a new physical screenshot; it reproduced current canonical data through deployed projection and unchanged Build 10 models/presenter.

Evidence: [EV-005-01](/private/tmp/bagger-live-r1-strokes/REPORT.md); [EV-005-02](/private/tmp/bagger-live-r1-strokes/REPORT.md); [EV-005-03](/private/tmp/bagger-build10-today/native/ios/BaggerInv/Presentation/ScoringPresentation.swift); [EV-005-04](/private/tmp/bagger-build10-today/native/ios/BaggerInv/Presentation/ScoreHoleStrokeBadge.swift); [EV-005-05](/private/tmp/bagger-build10-today/native/ios/BaggerInv/Views/Score/ScoreEntryControls.swift)

<a id="2026-inc-006"></a>

## 2026-INC-006 — Fractional Swift Date round-trip caused false SQLite score-intent concurrency conflicts

- **Date Time:** {"incident": "Physical symptoms during live R1 on 2026-09-25; exact per-phone timestamp UNKNOWN", "boundedEvidence": "Accepted relevant commits 2026-09-25T11:43:05.82595Z through 12:21:36.22752Z; first focused snapshot 12:15:50Z"}
- **Release:** 136
- **Activation:** 235
- **Sha:** {"native": "e7652b9b65595861f4f7cdf0b8326491581a27b8", "backend": "bae7d85ad72e81d42bee7a3f9d0f6c1ca0131ac9"}
- **Surface:** ["Native scoring queue", "SQLite persistence", "Lifecycle", "Workflow design"]
- **Severity:** P1
- **User Impact:** An Official save could leave Needs Review and block subsequent local scoring despite correct server golf.
- **Competitive Impact:** Availability/completion risk; no proven formula or Official corruption in examined evidence.
- **Data Integrity Impact:** No canonical corruption established by the cited evidence; not an exhaustive historical database comparison.
- **Root Cause:** JSON secondsSince1970 can change a fractional Swift Date by one binary tick. Queue transitions compare the decoded SQLite record with the original in-memory Equatable record exactly. The mismatch throws concurrentModification after a valid server commit/ack or during refresh completion, then a sticky persistence-failure latch stops workers and blocks new local intents.
- **Confidence:** PROVEN for the defect and exact state machine; STRONGLY SUPPORTED, not device-extracted proof, for attribution to every affected phone
- **Contributing Factors:** ["Fractional Date precision was lost across SQLite persistence while optimistic concurrency compared timestamps.", "The unresolved durable intent blocked next-hole progression even when the canonical score matched."]
- **Detection Method:** Owner physical false-review observation followed by deterministic real-SQLite persistence/reconciliation investigation in isolation.
- **Recovery:** A full terminate/relaunch can reconcile a matching already-Official intent. A stranded syncing record replays the original mutation ID; a stored acknowledgement performs reads only. PWA remained the primary scoring path. Background/foreground, pull-to-refresh, navigation, sign-out/in, Clear Entry, and Keep Official do not clear this sticky failure state.
- **Time To Diagnose:** UNKNOWN — exact first detection and diagnosis boundaries not fully retained
- **Time To Recover:** UNKNOWN — observations bound recovery, not full outage duration
- **Source Change Required:** Yes for permanent native persistence/reconciliation correction.
- **Release Required:** Future native release; bounded existing relaunch recovery does not remove defect.
- **Native Build Required:** Build 11 required for permanent reliability correction.
- **Why Certification Missed:** Coordinator fixtures used an in-memory queue; SQLite fixtures predominantly used whole-second clocks. Five focused recovery tests proved supported states, not real SQLite plus fractional timestamps across consecutive transitions. Broad 'score queue regression PASS' language overstated lifecycle coverage.
- **Test That Would Catch:** NA-2026-006
- **Architectural Prevention:** {"requirement_ids": ["OBS-CORE-001", "CERT-001", "BE-CONTRACT-001", "PWA-001", "CERT-NA-001", "CERT-PHY-001", "CERT-IMPACT-001", "B11-NAV-004", "B11-SCORE-001", "B11-SCORE-002", "B11-SCORE-003", "B11-SCORE-004", "B11-SCORE-005", "B11-SCORE-006", "B11-READ-007"], "note": "Proposed acceptance and systemic prevention in REQUIREMENTS.md; implementation not performed."}
- **Automation Opportunity:** ["AUTO-003", "AUTO-005", "AUTO-027"]
- **Observability Requirement:** Scoped request/operation/mutation correlation; domain error, latency and resource context; no secrets.
- **Status:** outstanding P0 Build 11 defect; bounded Build 10 recovery exists
- **Proof Layers:** ["SOURCE_INSPECTED", "UNIT_TESTED", "DATABASE_SQL_TESTED", "API_RPC_TESTED", "SIMULATOR_TESTED", "PRODUCTION_READBACK_VERIFIED"]
- **Limitations:** Official server writes and owner-visible blocked review symptoms were physical/live. No phone SQLite store was extracted. The exact local timestamp/state on each affected phone is unknown.

Evidence: [EV-006-01](/private/tmp/bagger-build10-today/native/ios/BaggerInv/ScoringQueue/SQLiteScoringQueueRepository.swift); [EV-006-02](/private/tmp/bagger-build10-today/native/ios/BaggerInv/ScoringQueue/SQLiteScoringQueueRepository.swift); [EV-006-03](/private/tmp/bagger-build10-today/native/ios/BaggerInv/ScoringQueue/ScoringQueueCoordinator.swift); [EV-006-04](/private/tmp/bagger-build10-today/native/ios/BaggerInv/ScoringQueue/ScoringQueueCoordinator.swift); [EV-006-05](/private/tmp/bagger-live-r1-multidevice/REPORT.md); [EV-006-06](/private/tmp/bagger-live-r1-multidevice/REPORT.md); [EV-006-07](/private/tmp/bagger-live-r1-multidevice/SQLITE-PROBE.json); [EV-006-08](/private/tmp/bagger-live-r1-multidevice/REAL-CLOCK.json); [EV-006-09](/private/tmp/bagger-native-recovery-audit/REPORT.md); [EV-006-10](/private/tmp/bagger-native-recovery-audit/REPORT.md)

<a id="2026-inc-007"></a>

## 2026-INC-007 — Feature-coded unavailability globally replaced the authenticated shell and defaulted navigation to Today

- **Date Time:** {"incident": "Observed on multiple tournament features; exact request-to-phone correlation UNKNOWN", "boundedEvidence": "Pre-R1 Net Skins report, Sep 25 side-game observations, and Sep 26 read-only audit"}
- **Release:** {"observedAcross": "135-137", "auditBaseline": 137}
- **Activation:** {"auditBaseline": 236}
- **Sha:** {"native": "e7652b9b65595861f4f7cdf0b8326491581a27b8", "auditBackend": "bae7d85ad72e81d42bee7a3f9d0f6c1ca0131ac9"}
- **Surface:** ["Native participant navigation", "Read architecture", "Lifecycle", "Error taxonomy"]
- **Severity:** P1
- **User Impact:** A feature-local error could discard selected tab/subtab/navigation and return the participant to Today.
- **Competitive Impact:** Availability/completion risk; no proven formula or Official corruption in examined evidence.
- **Data Integrity Impact:** No canonical corruption established by the cited evidence; not an exhaustive historical database comparison.
- **Root Cause:** MobileReadRepository treats MOBILE_API_UNAVAILABLE as a global authority-revalidation signal for nearly every feature. AppCoordinator changes authenticated state to checkingEnvironment, RootView removes BaggerAppShell, and a healthy recheck creates a new shell whose local @State defaults to Today, Leaders Score, and empty paths. The feature error need not represent invalid participant identity.
- **Confidence:** PROVEN for the architecture and simulator reset; PLAUSIBLE/UNKNOWN for the exact request behind any unattributed physical reset
- **Contributing Factors:** ["Generic feature unavailability entered global authority revalidation.", "The authenticated shell was removed and a new shell initialized its default Today selection.", "A write-authority fence and feature-read failure were not isolated from navigation ownership."]
- **Detection Method:** Owner repeated-return observations plus exact Build 10 source-path inventory; exact device requests remain unattributed.
- **Recovery:** A healthy environment recheck restores the same participant but creates a new shell, usually on Today. A sticky explicit non-home destination can override that default. Full process relaunch also intentionally starts Today and is a separate trigger.
- **Time To Diagnose:** UNKNOWN — exact first detection and diagnosis boundaries not fully retained
- **Time To Recover:** UNKNOWN — observations bound recovery, not full outage duration
- **Source Change Required:** Yes for native navigation/error-domain isolation.
- **Release Required:** Future native release; backend error taxonomy coordination proposed.
- **Native Build Required:** Build 11 required for permanent reliability correction.
- **Why Certification Missed:** The prior coordinator test asserted final authenticated state after successful reattestation. It did not observe intermediate RootView branch destruction, controller identity, selected tab/subtab, or path. Generic repository and feature tests therefore passed while navigation context was lost.
- **Test That Would Catch:** NA-2026-007
- **Architectural Prevention:** {"requirement_ids": ["OBS-CORE-001", "BE-CONTRACT-001", "CERT-NA-001", "CERT-PHY-001", "AUTO-DEG-001", "B11-NAV-001", "B11-NAV-002", "B11-NAV-003", "B11-NAV-004", "B11-READ-003", "B11-READ-007"], "note": "Proposed acceptance and systemic prevention in REQUIREMENTS.md; implementation not performed."}
- **Automation Opportunity:** ["AUTO-023", "AUTO-024"]
- **Observability Requirement:** Scoped request/operation/mutation correlation; domain error, latency and resource context; no secrets.
- **Status:** outstanding P0 Build 11 architecture defect
- **Proof Layers:** ["SOURCE_INSPECTED", "UNIT_TESTED", "SIMULATOR_TESTED", "PRODUCTION_READBACK_VERIFIED"]
- **Limitations:** Owners reported feature-to-Today behavior, including pre-R1 Net Skins. The Sep 26 audit did not extract the affected phone's token/request ID. Simulator reproduction used actual shipping RootView/BaggerAppShell and showed four non-Today tabs reset with zero sign-outs.

Evidence: [EV-007-01](/private/tmp/bagger-build10-today/native/ios/BaggerInv/Data/MobileReadRepository.swift); [EV-007-02](/private/tmp/bagger-build10-today/native/ios/BaggerInv/Data/TournamentDataCoordinator.swift); [EV-007-03](/private/tmp/bagger-build10-today/native/ios/BaggerInv/App/AppCoordinator.swift); [EV-007-04](/private/tmp/bagger-build10-today/native/ios/BaggerInv/Views/RootView.swift); [EV-007-05](/private/tmp/bagger-build10-today/native/ios/BaggerInv/Views/AppTabShell.swift); [EV-007-06](/private/tmp/bagger-build10-today-fallback-audit/REPORT.md); [EV-007-07](/private/tmp/bagger-build10-today-fallback-audit/REPORT.md); [EV-007-08](/private/tmp/bagger-build10-today-fallback-audit/FALLBACK-INVENTORY.md); [EV-007-09](/private/tmp/bagger-build10-today-fallback-audit/NAVIGATION-ARCHITECTURE.md); [EV-007-10](/private/tmp/bagger-build10-today-fallback-audit/ERROR-MATRIX.md)

<a id="2026-inc-008"></a>

## 2026-INC-008 — Legitimate seven-digit American odds failed backend and native six-digit semantic bounds

- **Date Time:** {"incident": "Publication at 2026-09-25 22:23:43 America/New_York", "boundedEvidence": "Sep 26 audit sampled 12 hosted Odds 503 records, 2 older 200, 1 304"}
- **Release:** 137
- **Activation:** 236
- **Sha:** {"native": "e7652b9b65595861f4f7cdf0b8326491581a27b8", "backend": "bae7d85ad72e81d42bee7a3f9d0f6c1ca0131ac9"}
- **Surface:** ["Backend mobile projection", "Native Odds model", "Native navigation"]
- **Severity:** P1
- **User Impact:** A legitimate extreme Odds value could make the published projection unusable in backend/native semantic validation.
- **Competitive Impact:** Presentation/workflow availability; no direct score or golf-result corruption established for this incident. Dependent failures are separate incident IDs.
- **Data Integrity Impact:** No canonical corruption established by the cited evidence; not an exhaustive historical database comparison.
- **Root Cause:** Published MH01 odds +1666567 are legitimate but both the backend projector and native structural validator permit only one through six digits (or signed infinity). Backend returns MOBILE_API_UNAVAILABLE 503; even a synthetically intended 200 DTO decodes then fails native structural compatibility.
- **Confidence:** PROVEN
- **Contributing Factors:** ["The calculator could emit legitimate values beyond the backend/native six-digit presentation bound.", "Range conformance between calculator output and client/server semantic validators was missing."]
- **Detection Method:** Retained legitimate Odds values and backend/native semantic-bound source/contract analysis.
- **Recovery:** No safe Build 10 data workaround. Do not clip, recalculate, or withdraw legitimate odds to satisfy display validation. A server-only 200 with the same string still fails Build 10; future repair must coordinate representation and keep failures feature-local.
- **Time To Diagnose:** UNKNOWN — exact first detection and diagnosis boundaries not fully retained
- **Time To Recover:** UNKNOWN — observations bound recovery, not full outage duration
- **Source Change Required:** Yes; backend and native semantic bounds both require compatible correction.
- **Release Required:** Coordinated backend/native contract correction proposed; not implemented by this audit.
- **Native Build Required:** Build 11 must consume the legitimate output domain safely.
- **Why Certification Missed:** Prior published-Odds PASS used values within six digits and validated HTTP/decode/presentation under those fixtures. It did not exercise the full legitimate output domain. HTTP 200 from older publications did not prove the new publication's semantic usability.
- **Test That Would Catch:** NA-2026-008
- **Architectural Prevention:** {"requirement_ids": ["BE-CONTRACT-001", "CERT-NA-001", "B11-NAV-001", "B11-READ-001", "B11-READ-003", "B11-READ-007"], "note": "Proposed acceptance and systemic prevention in REQUIREMENTS.md; implementation not performed."}
- **Automation Opportunity:** ["AUTO-015", "AUTO-023"]
- **Observability Requirement:** Scoped request/operation/mutation correlation; domain error, latency and resource context; no secrets.
- **Status:** outstanding coordinated backend/native contract requirement
- **Proof Layers:** ["SOURCE_INSPECTED", "UNIT_TESTED", "DATABASE_SQL_TESTED", "API_RPC_TESTED", "SIMULATOR_TESTED", "PRODUCTION_READBACK_VERIFIED"]
- **Limitations:** No exact owner-phone Odds request/body was captured. Hosted 503s and current canonical publication reproduce the backend defect; native seven-digit rejection is an isolated exact-model probe.

Evidence: [EV-008-01](/private/tmp/bagger-build10-today-fallback-audit/ODDS.md); [EV-008-02](/private/tmp/bagger-build10-today/native/ios/BaggerInv/Models/MobileOddsModels.swift); [EV-008-03](/private/tmp/bagger-build10-today-fallback-audit/REPORT.md)

<a id="2026-inc-009"></a>

## 2026-INC-009 — Side-game lifecycle envelopes could be valid while Build 10 detailed screens required a published presentation

- **Date Time:** {"incident": "Net Skins configuration 3 committed 2026-09-25 22:26:06 America/New_York; exact physical request time UNKNOWN", "boundedEvidence": "Sep 26 current-state audit"}
- **Release:** 137
- **Activation:** 236
- **Sha:** {"native": "e7652b9b65595861f4f7cdf0b8326491581a27b8", "backend": "bae7d85ad72e81d42bee7a3f9d0f6c1ca0131ac9"}
- **Surface:** ["Backend side-game lifecycle", "Native Net Skins/Calcutta adapters", "Product design", "Certification"]
- **Severity:** P1
- **User Impact:** Mixed current/historical side-game lifecycle could appear unavailable even when configuration or prior results existed.
- **Competitive Impact:** Presentation/workflow availability; no direct score or golf-result corruption established for this incident. Dependent failures are separate incident IDs.
- **Data Integrity Impact:** No canonical corruption established by the cited evidence; not an exhaustive historical database comparison.
- **Root Cause:** A valid base side-game envelope can represent configured/in-progress/stale/unpublished state with presentation:null. Build 10's Production detailed adapters require a published compatible presentation and throw incompatibleResponse otherwise. In Net Skins, configuration 3 also marked prior current R1/R2 results noncurrent, so historical publications survived but no current presentation existed. This local semantic gap is independent from sibling 503-driven global resets.
- **Confidence:** PROVEN for Net Skins currentness and native adapter behavior; PROVEN for Calcutta adapter's null-presentation behavior; UNKNOWN for exact physical trigger attribution
- **Contributing Factors:** ["Build 10 detailed views expected a published presentation for lifecycle states that could validly have none.", "Current and historical side-game scope changed across configurations; exact server causes differ by side game."]
- **Detection Method:** Retained lifecycle projections and native/backend presentation source; exact causes separated by side game.
- **Recovery:** Build 10 correctly avoids fabricating unpublished results and shows a local unavailable state for semantic null presentation. Historical R1/R2 Net Skins results remain stored but are not current after configuration 3. Future design should render explicit configured/pending/stale/no-result states and preserve selected feature.
- **Time To Diagnose:** UNKNOWN — exact first detection and diagnosis boundaries not fully retained
- **Time To Recover:** UNKNOWN — observations bound recovery, not full outage duration
- **Source Change Required:** Yes for native lifecycle presentation; backend current/history contracts also require review by side game.
- **Release Required:** Future compatible lifecycle corrections proposed; not implemented by this audit.
- **Native Build Required:** Build 11 lifecycle support required.
- **Why Certification Missed:** Prior side-game PASS claims used published/calculated fixtures or single-lifecycle snapshots. They did not execute the chronological transition from Official earlier rounds to a newly Configured later round, nor distinguish base-envelope compatibility from detailed-screen usability.
- **Test That Would Catch:** NA-2026-009
- **Architectural Prevention:** {"requirement_ids": ["BE-CONTRACT-001", "CERT-NA-001", "AUTO-DEG-001", "B11-NAV-001", "B11-READ-002", "B11-READ-003", "B11-READ-007"], "note": "Proposed acceptance and systemic prevention in REQUIREMENTS.md; implementation not performed."}
- **Automation Opportunity:** ["AUTO-008", "AUTO-023"]
- **Observability Requirement:** Scoped request/operation/mutation correlation; domain error, latency and resource context; no secrets.
- **Status:** outstanding Build 11 lifecycle presentation requirement; backend 009A/009B require separate ownership
- **Proof Layers:** ["SOURCE_INSPECTED", "UNIT_TESTED", "DATABASE_SQL_TESTED", "API_RPC_TESTED", "SIMULATOR_TESTED", "PRODUCTION_READBACK_VERIFIED"]
- **Limitations:** Owner saw side-game unavailable/reset symptoms, but exact phone request attribution is absent. Current Net Skins 200/null cannot itself trigger global revalidation. Nearby sibling Calcutta/Odds 503s can reset the shell; that correlation is plausible, not device-proven.

Evidence: [EV-009-01](/private/tmp/bagger-build10-today-fallback-audit/R3-NET-SKINS.md); [EV-009-02](/private/tmp/bagger-build10-today-fallback-audit/R3-NET-SKINS.md); [EV-009-03](/private/tmp/bagger-build10-today/native/ios/BaggerInv/Networking/MobileAPIClient.swift); [EV-009-04](/private/tmp/bagger-build10-today/native/ios/BaggerInv/Models/MobileNetSkinsQAModels.swift); [EV-009-05](/private/tmp/bagger-build10-today/native/ios/BaggerInv/Models/MobileCalcuttaQAModels.swift); [EV-009-06](/private/tmp/bagger-build10-today-fallback-audit/REPORT.md)

<a id="2026-inc-010"></a>

## 2026-INC-010 — Calcutta claim SQL failed before a job could be claimed

- **Date Time:** {"observed": "2026-09-25T01:59:04.733Z", "local": "2026-09-24 21:59:04.733 America/New_York", "timeKnown": true}
- **Release:** 133
- **Activation:** 232
- **Sha:** f6929bbe5a254ab6e938c56184f336c5fc617666
- **Surface:** ["PostgreSQL", "Backend", "Calcutta"]
- **Severity:** P1
- **User Impact:** Published Calcutta auction lacked participant calculated presentation because the processor could not claim work.
- **Competitive Impact:** Presentation/workflow availability; no direct score or golf-result corruption established for this incident. Dependent failures are separate incident IDs.
- **Data Integrity Impact:** No partial result and no stuck lease; the job remained PENDING with attempts 0. Auction 37/publication 41 remained intact.
- **Root Cause:** The installed claim function used pg_catalog.greatest and pg_catalog.least as if they were catalog functions. PostgreSQL treats them as special expressions, so function initialization raised SQLSTATE 42883 before the function body, claim, attempt increment, lease, or calculation.
- **Confidence:** PROVEN
- **Contributing Factors:** ["The real PostgreSQL claim path was not covered by isolated JavaScript calculator proof.", "An auction publication could exist while its calculation had never been claimed."]
- **Detection Method:** Retained PostgreSQL error and exact claim-function investigation/reproduction.
- **Recovery:** Release 134 removed only the invalid qualifiers, preserved activation checks, carried the exact untouched job forward under a private audited contract, then claimed and completed it once.
- **Time To Diagnose:** UNKNOWN — exact first detection and diagnosis boundaries not fully retained
- **Time To Recover:** UNKNOWN — observations bound recovery, not full outage duration
- **Source Change Required:** Yes, bounded backend change
- **Release Required:** 134
- **Native Build Required:** No immediate native build required
- **Why Certification Missed:** The earlier PASS called the JavaScript calculation engine directly. It bypassed the installed PostgreSQL claim initializer, lease, receipt, and completion path.
- **Test That Would Catch:** NA-2026-010
- **Architectural Prevention:** {"requirement_ids": ["CERT-001", "CERT-NA-001", "CERT-SYN-001", "CERT-IMPACT-001", "DB-PERF-002", "BE-JOB-002"], "note": "Proposed acceptance and systemic prevention in REQUIREMENTS.md; implementation not performed."}
- **Automation Opportunity:** ["AUTO-015", "AUTO-016"]
- **Observability Requirement:** Scoped request/operation/mutation correlation; domain error, latency and resource context; no secrets.
- **Status:** resolved bounded patch; systemic prevention outstanding
- **Proof Layers:** ["SOURCE_INSPECTED", "DATABASE_SQL_TESTED", "PRODUCTION_READBACK_VERIFIED"]
- **Limitations:** []

Evidence: [EV-010-01](/private/tmp/bagger-calcutta-processor-incident/REPORT.md:7); [EV-010-02](/private/tmp/bagger-calcutta-processor-incident/REPORT.md:63); [EV-010-03](/private/tmp/bagger-calcutta-processor-incident/installed-claim.sql:1); [EV-010-04](/private/tmp/bagger-calcutta-processor-incident/local-reproduction.json:1); [EV-010-05](/private/tmp/bagger-r1-open-incident/candidate/supabase/production_migrations/202608290056_production_calcutta_v1.sql:2041)

<a id="2026-inc-011"></a>

## 2026-INC-011 — Normal release advancement stranded an activation-bound pending Calcutta job

- **Date Time:** {"eligibleBaselineObserved": "2026-09-25T02:09:47Z", "strandedByRebind": "2026-09-25T03:19:37.708551Z", "carriedForward": "2026-09-25T03:23:29.828056Z", "resolved": "2026-09-25T03:24:22.883037Z", "timeKnown": true}
- **Release:** {"before": 133, "after": 134}
- **Activation:** {"jobBefore": 232, "releaseAfter": 233, "jobAfterRecovery": 233}
- **Sha:** {"before": "f6929bbe5a254ab6e938c56184f336c5fc617666", "after": "f41a09a2b06f27147faf93721e8377878f6bdf1d"}
- **Surface:** ["Release Control", "Backend", "Calcutta"]
- **Severity:** P1
- **User Impact:** The pending Calcutta job became ineligible when the compatible release advanced activation.
- **Competitive Impact:** Presentation/workflow availability; no direct score or golf-result corruption established for this incident. Dependent failures are separate incident IDs.
- **Data Integrity Impact:** Same job ID, attempts 0 before processing, immutable carry receipt; result 1 PROVISIONAL completed successfully.
- **Root Cause:** Claim and completion require the job activation to equal current activation, while normal rebind increments activation and had no job carry-forward transition. A code repair through the normal release path therefore made the retained job ineligible.
- **Confidence:** PROVEN
- **Contributing Factors:** ["Pending calculation eligibility was bound to the exact activation.", "A normal compatible release could strand work without an explicit exact-job carry-forward operation."]
- **Detection Method:** Retained pending-job/activation authority and exact-job carry-forward evidence.
- **Recovery:** A private protected exact-job carry-forward changed only activation_revision after revalidating job, auction, publication, source, result and release authority. Exact activation guards stayed enabled.
- **Time To Diagnose:** UNKNOWN — exact first detection and diagnosis boundaries not fully retained
- **Time To Recover:** UNKNOWN — observations bound recovery, not full outage duration
- **Source Change Required:** Yes, bounded backend change
- **Release Required:** 134
- **Native Build Required:** No immediate native build required
- **Why Certification Missed:** Release certification tested activation exactness and processor behavior separately. It did not exercise an already-pending, activation-bound durable job across a normal activation increment.
- **Test That Would Catch:** NA-2026-011
- **Architectural Prevention:** {"requirement_ids": ["AUTO-JOB-001", "CERT-NA-001", "REL-001", "BE-JOB-002", "BE-JOB-004", "BE-DEP-001"], "note": "Proposed acceptance and systemic prevention in REQUIREMENTS.md; implementation not performed."}
- **Automation Opportunity:** ["AUTO-006", "AUTO-010", "AUTO-025"]
- **Observability Requirement:** Scoped request/operation/mutation correlation; domain error, latency and resource context; no secrets.
- **Status:** resolved bounded patch; systemic prevention outstanding
- **Proof Layers:** ["SOURCE_INSPECTED", "DATABASE_SQL_TESTED", "STAGED_HOSTED_TESTED", "PRODUCTION_READBACK_VERIFIED", "PHYSICAL_IPHONE_VERIFIED"]
- **Limitations:** []

Evidence: [EV-011-01](/private/tmp/bagger-calcutta-processor-repair/REPORT.md:82); [EV-011-02](/private/tmp/bagger-calcutta-processor-repair/release-job-authority.json:1); [EV-011-03](/private/tmp/bagger-calcutta-processor-repair/release-conflict-local-proof.json:1); [EV-011-04](/private/tmp/bagger-calcutta-activation-repair/REPORT.md:62)

<a id="2026-inc-012"></a>

## 2026-INC-012 — Net Skins configured read and latent worker paths contained invalid SQL expressions

- **Date Time:** {"observed": "UNKNOWN", "boundedContext": "Release 134 before Release 135 repair on 2026-09-25", "timeKnown": false}
- **Release:** {"incident": 134, "repair": 135}
- **Activation:** {"incident": 233, "repair": 234}
- **Sha:** {"incident": "f41a09a2b06f27147faf93721e8377878f6bdf1d", "repair": "2533b98a7d0de44b6d10c7f14444c6627e70a2ee"}
- **Surface:** ["PostgreSQL", "Backend", "Net Skins"]
- **Severity:** P1
- **User Impact:** Configured Net Skins participant reads returned 503; latent worker paths also failed exact SQL execution.
- **Competitive Impact:** Presentation/workflow availability; no direct score or golf-result corruption established for this incident. Dependent failures are separate incident IDs.
- **Data Integrity Impact:** Zero Net Skins jobs and results at incident time; configuration remained fully committed.
- **Root Cause:** Seven pg_catalog.greatest/least qualifications across the participant read, claim initializer and official-result normalizer were invalid. The live read failed 42883/503; claim and normalization were proven latent failures.
- **Confidence:** PROVEN
- **Contributing Factors:** ["Invalid SQL qualification existed in participant-read and latent worker paths.", "Configured/pre-golf and processor execution required different tests from calculator-only proof."]
- **Detection Method:** Retained participant 503/SQL error and real SQL read/worker path certification.
- **Recovery:** Release 135 removed seven qualifiers in three pinned functions. Configuration 2 and memberships were preserved; no job/result/publication was manufactured.
- **Time To Diagnose:** UNKNOWN — exact first detection and diagnosis boundaries not fully retained
- **Time To Recover:** UNKNOWN — observations bound recovery, not full outage duration
- **Source Change Required:** Yes, bounded backend change
- **Release Required:** 135
- **Native Build Required:** No immediate native build required
- **Why Certification Missed:** Pre-golf certification did not execute the installed configured-read branch or all worker SQL functions in PostgreSQL. Source and native DTO checks were incorrectly allowed to stand in for database execution.
- **Test That Would Catch:** NA-2026-012
- **Architectural Prevention:** {"requirement_ids": ["CERT-001", "CERT-NA-001", "CERT-SYN-001", "CERT-IMPACT-001", "DB-PERF-002", "BE-JOB-002"], "note": "Proposed acceptance and systemic prevention in REQUIREMENTS.md; implementation not performed."}
- **Automation Opportunity:** ["AUTO-015", "AUTO-016", "AUTO-023"]
- **Observability Requirement:** Scoped request/operation/mutation correlation; domain error, latency and resource context; no secrets.
- **Status:** resolved bounded patch; systemic prevention outstanding
- **Proof Layers:** ["SOURCE_INSPECTED", "DATABASE_SQL_TESTED", "API_RPC_TESTED", "STAGED_HOSTED_TESTED", "PRODUCTION_READBACK_VERIFIED", "PHYSICAL_IPHONE_VERIFIED"]
- **Limitations:** Physical acceptance covered safe pre-golf/no-result behavior and staying on destination, not a populated Official Net Skins result.

Evidence: [EV-012-01](/private/tmp/bagger-net-skins-incident/REPORT.md:82); [EV-012-02](/private/tmp/bagger-net-skins-incident/REPORT.md:124); [EV-012-03](/private/tmp/bagger-net-skins-sql-repair/REPORT.md:95); [EV-012-04](/private/tmp/bagger-net-skins-sql-repair/REPORT.md:111)

<a id="2026-inc-013"></a>

## 2026-INC-013 — First-write activation mutation aborted atomic R1 Open

- **Date Time:** {"observed": ["2026-09-25T10:23:32.137Z", "2026-09-25T10:24:12.206Z"], "timeKnown": true}
- **Release:** {"incident": 135, "repair": 136}
- **Activation:** {"incident": 234, "transientInsideRolledBackTransaction": 235, "repair": 235}
- **Sha:** {"incident": "2533b98a7d0de44b6d10c7f14444c6627e70a2ee", "repair": "bae7d85ad72e81d42bee7a3f9d0f6c1ca0131ac9"}
- **Surface:** ["Release Control", "PostgreSQL", "Director"]
- **Severity:** P0
- **User Impact:** Whole-round R1 Open failed and rolled back rather than opening six matches.
- **Competitive Impact:** Availability/completion risk; no proven formula or Official corruption in examined evidence.
- **Data Integrity Impact:** The round wrapper rolled back all six-match changes, permissions, audit evidence and the transient activation increment.
- **Root Cause:** The first canonical mutation audit trigger incremented activation. During atomic Open, the first MARK_LIVE changed activation 234 to 235 inside the transaction; the following ACCESS_ACTIVATE still required release binding 234 and raised 55000.
- **Confidence:** PROVEN
- **Contributing Factors:** ["The first-write audit advanced activation inside a batch whose remaining checks expected unchanged authority.", "Atomic guards correctly rolled back the entire Open operation."]
- **Detection Method:** Retained whole-round error/SQL guard trace and canonical atomic rollback readback.
- **Recovery:** Release 136 removed only the audit trigger's activation increment. First-write evidence and all activation guards remained.
- **Time To Diagnose:** UNKNOWN — exact first detection and diagnosis boundaries not fully retained
- **Time To Recover:** UNKNOWN — observations bound recovery, not full outage duration
- **Source Change Required:** Yes, bounded backend change
- **Release Required:** 136
- **Native Build Required:** No immediate native build required
- **Why Certification Missed:** The first-write audit path and the multi-step atomic Open path had not been tested together against exact release binding. Individual operations looked valid in isolation.
- **Test That Would Catch:** NA-2026-013
- **Architectural Prevention:** {"requirement_ids": ["DIR-OPS-001", "DIR-OPS-002", "CERT-NA-001", "REL-001", "BE-DEP-003"], "note": "Proposed acceptance and systemic prevention in REQUIREMENTS.md; implementation not performed."}
- **Automation Opportunity:** ["AUTO-002", "AUTO-003", "AUTO-025"]
- **Observability Requirement:** Scoped request/operation/mutation correlation; domain error, latency and resource context; no secrets.
- **Status:** resolved bounded patch; systemic prevention outstanding
- **Proof Layers:** ["SOURCE_INSPECTED", "DATABASE_SQL_TESTED", "API_RPC_TESTED", "STAGED_HOSTED_TESTED", "PRODUCTION_READBACK_VERIFIED"]
- **Limitations:** []

Evidence: [EV-013-01](/private/tmp/bagger-r1-open-incident/PREDEPLOY-REPORT.md:5); [EV-013-02](/private/tmp/bagger-r1-open-incident/REPORT.md:55); [EV-013-03](/private/tmp/bagger-r1-open-incident/EXACT-REPLAY-CERTIFICATION.json:1)

<a id="2026-inc-014"></a>

## 2026-INC-014 — PWA scoring-session signing key missing in Production

- **Date Time:** {"observedWindow": "2026-09-25 08:47:32–08:51:41 America/New_York", "timeKnown": true}
- **Release:** {"incident": 136, "repair": 137}
- **Activation:** {"incident": 235, "repair": 236}
- **Sha:** bae7d85ad72e81d42bee7a3f9d0f6c1ca0131ac9
- **Surface:** ["PWA", "Backend configuration"]
- **Severity:** P0
- **User Impact:** My Match Continue Scoring could not create the signed scoring session; PWA fallback was unavailable.
- **Competitive Impact:** Availability/completion risk; no proven formula or Official corruption in examined evidence.
- **Data Integrity Impact:** No failed score write occurred; existing Official scores remained unchanged.
- **Root Cause:** SCORING_SESSION_SECRET existed for Preview but was absent from Production. Authorized START_SCORING requests reached session creation, which threw before setting the match-scoped cookie.
- **Confidence:** PROVEN
- **Contributing Factors:** ["Preview configuration did not prove the equivalent Production signing-key binding.", "The web shell and My Match could work while scoring-session creation failed."]
- **Detection Method:** Retained Production scoring-session 503 requests and environment binding inspection, followed by owner physical acceptance.
- **Recovery:** Configuration-only Release 137 added a new Production key and preserved source. Physical PWA scoring then opened, saved one new hole, and advanced.
- **Time To Diagnose:** UNKNOWN — exact first detection and diagnosis boundaries not fully retained
- **Time To Recover:** UNKNOWN — observations bound recovery, not full outage duration
- **Source Change Required:** Configuration-only
- **Release Required:** 137
- **Native Build Required:** No immediate native build required
- **Why Certification Missed:** Staged source/UI acceptance did not assert the Production-target secret inventory or perform a real post-rebind scoring-session handshake before tournament use.
- **Test That Would Catch:** NA-2026-014
- **Architectural Prevention:** {"requirement_ids": ["BE-CONTRACT-001", "PWA-001", "CERT-NA-001", "CERT-PHY-001", "REL-001", "BE-JOB-005"], "note": "Proposed acceptance and systemic prevention in REQUIREMENTS.md; implementation not performed."}
- **Automation Opportunity:** ["AUTO-025", "AUTO-027"]
- **Observability Requirement:** Scoped request/operation/mutation correlation; domain error, latency and resource context; no secrets.
- **Status:** resolved bounded patch; systemic prevention outstanding
- **Proof Layers:** ["SOURCE_INSPECTED", "API_RPC_TESTED", "STAGED_HOSTED_TESTED", "PRODUCTION_READBACK_VERIFIED", "PHYSICAL_IPHONE_VERIFIED"]
- **Limitations:** []

Evidence: [EV-014-01](/private/tmp/bagger-live-pwa-incident/REPORT.md:96); [EV-014-02](/private/tmp/bagger-live-pwa-incident/REPORT.md:110); [EV-014-03](/private/tmp/bagger-live-pwa-incident/REPORT.md:15)

<a id="2026-inc-015"></a>

## 2026-INC-015 — Persistent physical-phone service-worker Update banner

- **Date Time:** {"observed": "2026-09-25 during the PWA scoring incident", "timeKnown": false}
- **Release:** 136
- **Activation:** 235
- **Sha:** bae7d85ad72e81d42bee7a3f9d0f6c1ca0131ac9
- **Surface:** ["PWA", "Service Worker"]
- **Severity:** P2
- **User Impact:** The owner saw an Update banner remain after tapping Update; exact phone worker/handler outcome unknown.
- **Competitive Impact:** Presentation/workflow availability; no direct score or golf-result corruption established for this incident. Dependent failures are separate incident IDs.
- **Data Integrity Impact:** Independent of canonical score correctness.
- **Root Cause:** UNKNOWN. The phone's active/waiting/installing worker state was not captured. Source reload behavior and Mac worker state cannot establish the physical phone cause.
- **Confidence:** UNKNOWN
- **Contributing Factors:** ["The affected phone active/waiting worker and controller-change trace was not retained.", "The simultaneous PWA server signing-key defect is separately proven; no causal relationship to the banner is established."]
- **Detection Method:** Owner physical phone observation; affected worker/controller trace unavailable.
- **Recovery:** No service-worker repair was required to fix the proven server failure. Ordinary reload was recommended after the signing-key repair; cache clearing was not justified.
- **Time To Diagnose:** UNKNOWN — exact first detection and diagnosis boundaries not fully retained
- **Time To Recover:** UNKNOWN — observations bound recovery, not full outage duration
- **Source Change Required:** UNKNOWN until affected-phone worker flow is reproduced.
- **Release Required:** UNKNOWN; no release justified solely by the retained banner observation.
- **Native Build Required:** No native change inferred from a PWA worker symptom.
- **Why Certification Missed:** Certification lacked device-visible worker version/state telemetry and a physical update lifecycle test across an already-installed PWA.
- **Test That Would Catch:** NA-2026-015
- **Architectural Prevention:** {"requirement_ids": ["PWA-001", "CERT-NA-001", "BE-JOB-005"], "note": "Proposed acceptance and systemic prevention in REQUIREMENTS.md; implementation not performed."}
- **Automation Opportunity:** ["AUTO-024"]
- **Observability Requirement:** Scoped request/operation/mutation correlation; domain error, latency and resource context; no secrets.
- **Status:** outstanding cause/control gap
- **Proof Layers:** ["SOURCE_INSPECTED", "STAGED_HOSTED_TESTED"]
- **Limitations:** []

Evidence: [EV-015-01](/private/tmp/bagger-live-pwa-incident/REPORT.md:130); [EV-015-02](/private/tmp/bagger-live-pwa-incident/REPORT.md:141); [EV-015-03](/private/tmp/bagger-live-pwa-incident/REPORT.md:44)

<a id="2026-inc-016"></a>

## 2026-INC-016 — Stale Odds lifecycle records blocked initial R3 pairing

- **Date Time:** {"failedAttempts": "2026-09-25 20:57:25–21:00:20 America/New_York", "timeKnown": true}
- **Release:** 137
- **Activation:** 236
- **Sha:** bae7d85ad72e81d42bee7a3f9d0f6c1ca0131ac9
- **Surface:** ["Director", "Odds lifecycle"]
- **Severity:** P1
- **User Impact:** R3 pairings were denied behind a generic dependency message with stale Odds work/publication hidden from normal workflow.
- **Competitive Impact:** Availability/completion risk; no proven formula or Official corruption in examined evidence.
- **Data Integrity Impact:** Pairing RPC validation rolled back before rebuild; no partial R3 pairing committed during failures.
- **Root Cause:** Two independent Odds records blocked setup: the current After-R2 publication and an old After-R1 SUCCEEDED/READY unpublished calculation whose canonical inputs had advanced but whose lifecycle state had not been superseded. Withdrawal itself was blocked by the orphan READY row, and the Director UI exposed no discard/supersede control.
- **Confidence:** PROVEN
- **Contributing Factors:** ["An obsolete calculation remained blocking alongside the current publication.", "The generic setup-dependency error hid the exact job/publication and supported clearance sequence."]
- **Detection Method:** Owner failed pairing operation and retained exact dependency/guard inspection.
- **Recovery:** The existing supported supersede RPC retired exactly one job as SUPERSEDED/STALE; the owner then had to withdraw current publication before pairing.
- **Time To Diagnose:** UNKNOWN — exact first detection and diagnosis boundaries not fully retained
- **Time To Recover:** UNKNOWN — observations bound recovery, not full outage duration
- **Source Change Required:** No source change required for the supported historical clearance; lifecycle automation is future work.
- **Release Required:** No release required for that supported clearance.
- **Native Build Required:** No.
- **Why Certification Missed:** Lifecycle certification did not simulate a completed-but-unpublished READY calculation surviving later canonical golf changes, or verify that every blocking state had a Director recovery action.
- **Test That Would Catch:** NA-2026-016
- **Architectural Prevention:** {"requirement_ids": ["DIR-OPS-001", "AUTO-JOB-001", "DIR-NEXT-001", "CERT-NA-001", "CERT-SYN-001", "DIR-MOB-001", "BE-JOB-002", "BE-JOB-003", "BE-DEP-001", "BE-DEP-002", "BE-DEP-003", "BE-DEP-004"], "note": "Proposed acceptance and systemic prevention in REQUIREMENTS.md; implementation not performed."}
- **Automation Opportunity:** ["AUTO-006", "AUTO-007", "AUTO-009"]
- **Observability Requirement:** Scoped request/operation/mutation correlation; domain error, latency and resource context; no secrets.
- **Status:** resolved bounded patch; systemic prevention outstanding
- **Proof Layers:** ["SOURCE_INSPECTED", "PRODUCTION_READBACK_VERIFIED", "API_RPC_TESTED"]
- **Limitations:** []

Evidence: [EV-016-01](/private/tmp/bagger-r3-pairing-blocker/REPORT.md:5); [EV-016-02](/private/tmp/bagger-r3-pairing-blocker/REPORT.md:44); [EV-016-03](/private/tmp/bagger-r3-pairing-blocker/REPORT.md:72); [EV-016-04](/private/tmp/bagger-r3-odds-clearance/REPORT.md:3)

<a id="2026-inc-017"></a>

## 2026-INC-017 — R3 pairings were committed without preparation, then trapped behind side-game dependencies

- **Date Time:** {"pairingCommitted": "2026-09-26T02:21:23.283894Z", "diagnosed": "2026-09-26T05:08:26.033907Z", "timeKnown": true}
- **Release:** {"incident": 137, "recovery": 138}
- **Activation:** {"incident": 236, "recovery": 237}
- **Sha:** {"incident": "bae7d85ad72e81d42bee7a3f9d0f6c1ca0131ac9", "recovery": "1f836836fbb547d847cda2166030da285e1cf8a9"}
- **Surface:** ["Director", "Backend", "Lifecycle"]
- **Severity:** P0
- **User Impact:** R3 had valid pairings but no prepared current contexts; normal preparation was blocked after side-game dependencies formed.
- **Competitive Impact:** Availability/completion risk; no proven formula or Official corruption in examined evidence.
- **Data Integrity Impact:** Pairings and handicap values were correct; missing prepared snapshots were an authority-completeness problem, not corrupted scores.
- **Root Cause:** REPLACE_ROUND_PAIRINGS explicitly committed snapshotPrepared:false. All twelve matches retained empty S1 snapshots with NULL prepared revision and handicap revision. Later Net Skins configuration, Odds publication, and Calcutta dependencies blocked ordinary per-match preparation; the late-R3 compatibility predicate was also invalidated by unrelated Net Skins history/pointer changes captured in its broad consumed fingerprint.
- **Confidence:** PROVEN
- **Contributing Factors:** ["Canonical pairing confirmation did not imply preparation; its receipt stated snapshotPrepared:false.", "Side-game dependencies formed before missing prepared contexts were materialized.", "Broad guards blocked normal preparation even though bounded semantic preservation was later proven."]
- **Detection Method:** Retained canonical prepared-context readback and pairing receipt with snapshotPrepared:false; bounded recovery receipts.
- **Recovery:** Release 138 added a bounded, one-transaction recovery for the exact existing pairings and compatible dependencies, producing S2 snapshots and 12/12 READY while preserving side games and golf.
- **Time To Diagnose:** UNKNOWN — exact first detection and diagnosis boundaries not fully retained
- **Time To Recover:** UNKNOWN — observations bound recovery, not full outage duration
- **Source Change Required:** Yes, bounded backend change
- **Release Required:** 138
- **Native Build Required:** No immediate native build required
- **Why Certification Missed:** Pairing success was allowed to appear operationally complete even though preparation was a separate action. The dependency graph was not tested in real operator order, and the hash represented history/control metadata unrelated to Calcutta economic correctness.
- **Test That Would Catch:** NA-2026-017
- **Architectural Prevention:** {"requirement_ids": ["CERT-001", "DIR-OPS-001", "DIR-OPS-002", "DIR-CLOSE-001", "DIR-NEXT-001", "CERT-NA-001", "CERT-SYN-001", "CERT-PHY-001", "DIR-MOB-001", "AUTO-HEALTH-001", "DB-PERF-001", "DB-PERF-003", "BE-DEP-001", "BE-DEP-002", "BE-DEP-003", "BE-DEP-004"], "note": "Proposed acceptance and systemic prevention in REQUIREMENTS.md; implementation not performed."}
- **Automation Opportunity:** ["AUTO-002", "AUTO-003", "AUTO-012"]
- **Observability Requirement:** Scoped request/operation/mutation correlation; domain error, latency and resource context; no secrets.
- **Status:** resolved bounded patch; systemic prevention outstanding
- **Proof Layers:** ["SOURCE_INSPECTED", "DATABASE_SQL_TESTED", "STAGED_HOSTED_TESTED", "PRODUCTION_READBACK_VERIFIED", "BOUNDED_RECOVERY_LIFECYCLE_VERIFIED"]
- **Limitations:** []

Evidence: [EV-017-01](/private/tmp/bagger-r3-readiness-recovery/REPORT.md:28); [EV-017-02](/private/tmp/bagger-r3-readiness-recovery/REPORT.md:56); [EV-017-03](/private/tmp/bagger-r3-readiness-recovery/REPORT.md:74); [EV-017-04](/private/tmp/bagger-r3-dependency-recovery/REPORT.md:65); [EV-017-05](/private/tmp/bagger-r3-continuous-recovery/REPORT.md:3)

<a id="2026-inc-018"></a>

## 2026-INC-018 — R3 whole-round Open returned an unknown outcome, then its expected fingerprint became stale

- **Date Time:** {"originalRequest": "UNKNOWN", "resolvedSnapshot": "2026-09-26T14:07:42.185201Z", "timeKnown": false}
- **Release:** 138
- **Activation:** 237
- **Sha:** 1f836836fbb547d847cda2166030da285e1cf8a9
- **Surface:** ["Director", "Backend operation status"]
- **Severity:** P0
- **User Impact:** Director could not resolve its saved Open intent; separate per-match changes made the old review fingerprint stale.
- **Competitive Impact:** Availability/completion risk; no proven formula or Official corruption in examined evidence.
- **Data Integrity Impact:** No evidence of partial whole-round commit; live matches had independent mutation keys and timestamps.
- **Root Cause:** The client retained the operation UUID but not original creation time or HTTP error. No round receipt or any of 24 child mutation keys existed, proving no commit by that operation. Separate per-match Opens changed round state, making the original request fingerprint obsolete; replay would correctly return ROUND_STATE_CHANGED.
- **Confidence:** PROVEN
- **Confidence Scope:** No commit by the retained operation and the later stale fingerprint are proven. The original request time, transport error, and initial failure cause remain UNKNOWN.
- **Contributing Factors:** ["The saved operation retained its original review fingerprint.", "Later independent per-match operations changed authority and made that fingerprint stale.", "The cause of the original HTTP outcome loss remains unknown."]
- **Detection Method:** Retained exact operation receipt/child-key lookup and canonical round-state comparison; original transport cause unknown.
- **Recovery:** No retry. Existing Live matches were preserved; remaining Upcoming matches were opened through supported per-match operations after refresh.
- **Time To Diagnose:** UNKNOWN — exact first detection and diagnosis boundaries not fully retained
- **Time To Recover:** UNKNOWN — observations bound recovery, not full outage duration
- **Source Change Required:** No new source change established as necessary for historical per-match fallback; status UX redesign is future work.
- **Release Required:** No new release established for original-outcome resolution.
- **Native Build Required:** No.
- **Why Certification Missed:** Unknown-outcome certification covered idempotent same-state replay, but the operator UI did not first reconcile receipt/state and invalidate a stale saved intent after other actors changed the round.
- **Test That Would Catch:** NA-2026-018
- **Architectural Prevention:** {"requirement_ids": ["OBS-CORE-001", "DIR-OPS-001", "DIR-OPS-002", "DIR-NEXT-001", "CERT-NA-001", "CERT-PHY-001", "DIR-MOB-001", "AUTO-HEALTH-001", "BE-SCORE-003", "BE-JOB-003", "BE-DEP-003"], "note": "Proposed acceptance and systemic prevention in REQUIREMENTS.md; implementation not performed."}
- **Automation Opportunity:** ["AUTO-003", "AUTO-005"]
- **Observability Requirement:** Scoped request/operation/mutation correlation; domain error, latency and resource context; no secrets.
- **Status:** outstanding cause/control gap
- **Proof Layers:** ["SOURCE_INSPECTED", "PRODUCTION_READBACK_VERIFIED"]
- **Limitations:** No commit by the retained operation and the later stale fingerprint are proven. The original request time, transport error, and initial failure cause remain UNKNOWN.

Evidence: [EV-018-01](/private/tmp/bagger-r3-open-outcome/REPORT.md:1); [EV-018-02](/private/tmp/bagger-r3-open-outcome/OUTCOME.json:1); [EV-018-03](/private/tmp/bagger-r3-open-outcome/final-current.json:1)

<a id="2026-inc-019"></a>

## 2026-INC-019 — Synchronous side-game invalidation made score writes time out

- **Date Time:** {"failures": ["2026-09-27T05:25:05.582Z", "2026-09-27T05:26:18.776Z"], "timeKnown": true}
- **Release:** {"incident": 138, "repair": 139}
- **Activation:** {"incident": 237, "repair": 238}
- **Sha:** {"incident": "1f836836fbb547d847cda2166030da285e1cf8a9", "repair": "b2065c901f9f6cbdc3dc2f1f37f6b1b782309ec6"}
- **Surface:** ["PostgreSQL", "Backend performance"]
- **Severity:** P0
- **User Impact:** PWA/server score writes timed out with SQLSTATE 57014; digital recovery was blocked until the bounded backend correction.
- **Competitive Impact:** Availability/completion risk; no proven formula or Official corruption in examined evidence.
- **Data Integrity Impact:** Both original mutation IDs and target holes remained absent; neither request was retried by the repair task.
- **Root Cause:** Hole and match writes synchronously fired Calcutta and Net Skins enqueue triggers. Calcutta current-result selection called a SQL STABLE compatibility function whose planner evaluated whole-history financial and consumed fingerprints even though result 407 had no qualifying receipt. Both score transactions hit the 8-second statement timeout (57014) and rolled back.
- **Confidence:** PROVEN
- **Contributing Factors:** ["Score/match triggers synchronously reached Calcutta compatibility and historical fingerprint work.", "Accumulated history made work exceed the statement budget; clean fixtures missed the cost."]
- **Detection Method:** Retained SQLSTATE 57014 error stack, isolated query profile and before/after correction evidence.
- **Recovery:** Release 139 converted the compatibility function to PL/pgSQL with a cheap receipt/current-result eligibility return before planning the unchanged expensive predicate. No trigger, score RPC, guard, timeout, or side-game formula was weakened.
- **Time To Diagnose:** UNKNOWN — exact first detection and diagnosis boundaries not fully retained
- **Time To Recover:** UNKNOWN — observations bound recovery, not full outage duration
- **Source Change Required:** Yes, bounded backend change
- **Release Required:** 139
- **Native Build Required:** No immediate native build required
- **Why Certification Missed:** Score certification tested core scoring correctness and downstream results but did not budget every synchronous trigger under historical data growth. Planner-time execution of nested STABLE hashes was absent from unit fixtures and small datasets.
- **Test That Would Catch:** NA-2026-019
- **Architectural Prevention:** {"requirement_ids": ["OBS-CORE-001", "CERT-001", "PERF-001", "PWA-001", "CERT-NA-001", "CERT-SYN-001", "OPS-DR-001", "HIST-001", "CERT-IMPACT-001", "BE-SCORE-001", "BE-SCORE-002", "DB-PERF-001", "DB-PERF-002", "DB-PERF-003", "BE-JOB-001", "BE-JOB-002", "BE-DEP-002"], "note": "Proposed acceptance and systemic prevention in REQUIREMENTS.md; implementation not performed."}
- **Automation Opportunity:** ["AUTO-010", "AUTO-013", "AUTO-016"]
- **Observability Requirement:** Scoped request/operation/mutation correlation; domain error, latency and resource context; no secrets.
- **Status:** resolved bounded patch; systemic prevention outstanding
- **Proof Layers:** ["SOURCE_INSPECTED", "DATABASE_SQL_TESTED", "API_RPC_TESTED", "STAGED_HOSTED_TESTED", "PRODUCTION_READBACK_VERIFIED"]
- **Limitations:** []

Evidence: [EV-019-01](/private/tmp/bagger-r3-write-timeout/REPORT.md:41); [EV-019-02](/private/tmp/bagger-r3-write-timeout/REPORT.md:62); [EV-019-03](/private/tmp/bagger-r3-write-timeout/REPORT.md:80); [EV-019-04](/private/tmp/bagger-r1-open-incident/candidate/supabase/production_migrations/202609270120_bounded_late_r3_result_compatibility_v1.sql:3); [EV-019-05](/private/tmp/bagger-r1-open-incident/candidate/supabase/production_migrations/202608240021_production_scoring_operations.sql:1073); [EV-019-06](/private/tmp/bagger-r1-open-incident/candidate/supabase/production_migrations/202608290056_production_calcutta_v1.sql:1601)

<a id="2026-inc-020"></a>

## 2026-INC-020 — Four physical R3 cards reconciled through supported authority; one was already complete at recovery

- **Date Time:** {"recoveryWindow": "2026-09-27T09:12:16.559922Z–2026-09-27T09:15:12.423482Z", "initialNeedTime": "UNKNOWN", "timeKnown": false}
- **Release:** 139
- **Activation:** 238
- **Sha:** b2065c901f9f6cbdc3dc2f1f37f6b1b782309ec6
- **Surface:** ["Director", "Scoring recovery workflow"]
- **Severity:** P1
- **User Impact:** Four cards required engineering-assisted comparison and finalization. Three needed 34 total missing-hole writes; the fourth completed independently and all 18 holes were exact skips. Across four cards, 38 matching Official holes were skipped.
- **Competitive Impact:** Availability/completion risk; no proven formula or Official corruption in examined evidence.
- **Data Integrity Impact:** Zero conflicts, zero unknown outcomes, zero direct table writes, zero existing Official overwrites. Final R3 was 216/216 Official and 12/12 Final.
- **Root Cause:** The retained evidence proves a physical-to-canonical completion gap after timeouts and concurrent scoring. It does not prove database corruption or establish one single cause for every missing hole. One card completed independently while recovery was running.
- **Confidence:** PROVEN
- **Confidence Scope:** The bounded recovery need, recovery behavior, and absence of corruption in the compared scope are proven. No single cause for every initially missing hole is established.
- **Contributing Factors:** ["Both participant clients depended on the same backend scoring path.", "Director lacked a complete physical-card compare/skip/conflict/recover workflow available without engineering.", "Fresh canonical reads were necessary because legitimate independent score activity continued."]
- **Detection Method:** Physical-card gross data compared with fresh canonical per-hole authority and recovery receipts.
- **Recovery:** Sequential per-hole canonical read, exact gross-only submit with fresh mutation ID, immediate receipt/readback, skip exact matches, then finalize only after complete-card verification.
- **Time To Diagnose:** UNKNOWN — exact first detection and diagnosis boundaries not fully retained
- **Time To Recover:** UNKNOWN — observations bound recovery, not full outage duration
- **Source Change Required:** No additional correction required for the supported card recovery after Release 139; productized recovery is future work.
- **Release Required:** Release 139 addressed the separate score timeout; no further release needed for the recovery itself.
- **Native Build Required:** No.
- **Why Certification Missed:** Pre-tournament certification did not include an operator-grade paper-card reconciliation workflow for partial cards, concurrent writers, unknown responses, and already-Official holes.
- **Test That Would Catch:** NA-2026-020
- **Architectural Prevention:** {"requirement_ids": ["DIR-REC-001", "DIR-CLOSE-001", "CERT-NA-001", "CERT-PHY-001", "OPS-DR-001", "DIR-MOB-001", "BE-SCORE-001", "BE-SCORE-003", "BE-SCORE-004", "BE-JOB-003"], "note": "Proposed acceptance and systemic prevention in REQUIREMENTS.md; implementation not performed."}
- **Automation Opportunity:** ["AUTO-003", "AUTO-011"]
- **Observability Requirement:** Scoped request/operation/mutation correlation; domain error, latency and resource context; no secrets.
- **Status:** resolved bounded patch; systemic prevention outstanding
- **Proof Layers:** ["API_RPC_TESTED", "PRODUCTION_READBACK_VERIFIED", "PHYSICAL_SCORECARD_VERIFIED", "BOUNDED_RECOVERY_LIFECYCLE_VERIFIED"]
- **Limitations:** The bounded recovery need, recovery behavior, and absence of corruption in the compared scope are proven. No single cause for every initially missing hole is established.

Evidence: [EV-020-01](/private/tmp/bagger-r3-physical-recovery139/REPORT.md:10); [EV-020-02](/private/tmp/bagger-r3-physical-recovery139/REPORT.md:29); [EV-020-03](/private/tmp/bagger-r3-physical-recovery139/FINAL-SUMMARY.json:1)

<a id="2026-inc-021"></a>

## 2026-INC-021 — No supported way to clear the last draft Calcutta purchase before real auction

- **Date Time:** 2026-09-23; bounded preflight17:11:56Z / clear~17:12:20Z
- **Release:** {"before": 132, "after": 133}
- **Activation:** {"after": 232}
- **Sha:** f6929bbe5a254ab6e938c56184f336c5fc617666
- **Surface:** ["Director", "Backend", "Workflow"]
- **Severity:** P1
- **User Impact:** Owner could not clear the last draft test purchase through the entry editor.
- **Competitive Impact:** Presentation/workflow availability; no direct score or golf-result corruption established for this incident. Dependent failures are separate incident IDs.
- **Data Integrity Impact:** Exact old revisions retained; one test entry removed through supported audited operation; no golf changed.
- **Root Cause:** Save-entry contract could replace an entry but did not represent clearing the final entry; missing supported product operation.
- **Confidence:** PROVEN
- **Contributing Factors:** ["The normal entry-save workflow did not provide a supported clear-last-draft-purchase operation.", "Complete test-entry cleanup was absent from the retained auction-entry lifecycle proof."]
- **Detection Method:** Retained Director last-entry cleanup report and supported bounded correction evidence.
- **Recovery:** Release133 protected exact draft clear; auction1→2,publication2→3 unpublished, config2; immutable historical rows retained.
- **Time To Diagnose:** UNKNOWN
- **Time To Recover:** UNKNOWN
- **Source Change Required:** Yes
- **Release Required:** 133
- **Native Build Required:** No
- **Why Certification Missed:** Auction entry/edit covered; final-entry removal lifecycle not represented as a supported operation.
- **Test That Would Catch:** NA-2026-021
- **Architectural Prevention:** {"requirement_ids": ["DIR-FIN-001", "CERT-NA-001"], "note": "Proposed acceptance and systemic prevention in REQUIREMENTS.md; implementation not performed."}
- **Automation Opportunity:** ["AUTO-008"]
- **Observability Requirement:** Current auction and reviewable change receipt.
- **Status:** bounded operation resolved; broader financial UX outstanding
- **Proof Layers:** ["SOURCE_INSPECTED", "DATABASE_SQL_TESTED", "PRODUCTION_READBACK_VERIFIED"]
- **Limitations:** Not financial corruption; test cleanup preceded real auction.

Evidence: [EV-021-01](/private/tmp/bagger-calcutta-clear-production/REPORT.md)

<a id="2026-inc-022"></a>

## 2026-INC-022 — Overnight Production authority 503

- **Date Time:** 2026-09-26 01:34-01:35 EDT observed
- **Release:** 137
- **Activation:** 236
- **Sha:** bae7d85ad72e81d42bee7a3f9d0f6c1ca0131ac9
- **Surface:** ["Infrastructure", "Observability"]
- **Severity:** P0
- **User Impact:** Identity/tournament/scoring authority became unavailable; recovery work had to stop.
- **Competitive Impact:** Availability/completion risk; no proven formula or Official corruption in examined evidence.
- **Data Integrity Impact:** Fail-closed health suspended dependent capabilities and recovery work; canonical data corruption was not reported.
- **Root Cause:** UNKNOWN: The reason for the restart; The exact outage start/end; A provider incident; Disk I/O budget reaching zero; A release binding mismatch; The historical query causing the outage
- **Confidence:** PROVEN service interruption; root cause UNKNOWN
- **Contributing Factors:** ["Database connection unavailability was surfaced as authority incompatibility.", "Resource pressure is a primary hypothesis supported by the separate warning, but exact outage causation is unknown."]
- **Detection Method:** Preserved health/connection failure reports and later bounded read recovery; no provider root-cause proof.
- **Recovery:** Bounded health observation and stopping unsafe work; see report. Root cause not closed by recovery.
- **Time To Diagnose:** UNKNOWN — exact first detection and diagnosis boundaries not fully retained
- **Time To Recover:** UNKNOWN — observations bound recovery, not full outage duration
- **Source Change Required:** No source change proven to explain recovery; typed health and capacity controls proposed.
- **Release Required:** No recovery release causally established for this outage.
- **Native Build Required:** No native change proven to cause infrastructure recovery.
- **Why Certification Missed:** No retained capacity/causal metric proof at relevant layer; see certification audit.
- **Test That Would Catch:** NA-2026-022
- **Architectural Prevention:** {"requirement_ids": ["OBS-CORE-001", "BE-CONTRACT-001", "CERT-NA-001", "OPS-DR-001", "AUTO-HEALTH-001", "AUTO-DEG-001"], "note": "Proposed acceptance and systemic prevention in REQUIREMENTS.md; implementation not performed."}
- **Automation Opportunity:** ["AUTO-001", "AUTO-013"]
- **Observability Requirement:** Scoped request/operation/mutation correlation; domain error, latency and resource context; no secrets.
- **Status:** outstanding cause/control gap
- **Proof Layers:** ["RETAINED_REPORT", "OWNER_OBSERVATION"]
- **Limitations:** ["The reason for the restart", "The exact outage start/end", "A provider incident", "Disk I/O budget reaching zero", "A release binding mismatch", "The historical query causing the outage"]

Evidence: [EV-022-01](/private/tmp/bagger-r3-dependency-recovery/REPORT.md); [EV-022-02](/private/tmp/bagger-r3-morning-preflight/REPORT.md); [EV-022-03](/private/tmp/bagger-r3-morning-preflight/overnight-logs-sanitized.json)

<a id="2026-inc-023"></a>

## 2026-INC-023 — Morning authority outage recurrence and heavy live diagnostic risk

- **Date Time:** 2026-09-26 08:24 EDT observed
- **Release:** 137
- **Activation:** 236
- **Sha:** bae7d85ad72e81d42bee7a3f9d0f6c1ca0131ac9
- **Surface:** ["Infrastructure", "Observability"]
- **Severity:** P0
- **User Impact:** Morning authority/database outage recurred while a broad diagnostic query was running; causation unproven.
- **Competitive Impact:** Availability/completion risk; no proven formula or Official corruption in examined evidence.
- **Data Integrity Impact:** The operator stopped; no deployment, schema installation, or real recovery followed the failed health gate.
- **Root Cause:** UNKNOWN: A live query plan or block/temp/WAL profile for the 90-second query; OOM, I/O exhaustion, lock contention, or provider failure at the exact window; The broad query causing rather than coinciding with the outage
- **Confidence:** PROVEN recurrence; diagnostic hazard PROVEN; causal role UNKNOWN
- **Contributing Factors:** ["A broad historical eligibility query ran for over 90 seconds on the shared live primary.", "This created material diagnostic risk and coincided with the outage; causal attribution is unproven."]
- **Detection Method:** Preserved health/query-duration reports and owner observations; no causal query/resource time series.
- **Recovery:** Bounded health observation and stopping unsafe work; see report. Root cause not closed by recovery.
- **Time To Diagnose:** UNKNOWN — exact first detection and diagnosis boundaries not fully retained
- **Time To Recover:** UNKNOWN — observations bound recovery, not full outage duration
- **Source Change Required:** No source change proven to explain outage recovery; bounded diagnostic admission controls proposed.
- **Release Required:** No recovery release causally established for this outage.
- **Native Build Required:** No native change proven to cause infrastructure recovery.
- **Why Certification Missed:** No retained capacity/causal metric proof at relevant layer; see certification audit.
- **Test That Would Catch:** NA-2026-023
- **Architectural Prevention:** {"requirement_ids": ["OBS-CORE-001", "PERF-001", "OPS-SAFE-001", "CERT-NA-001", "HIST-001"], "note": "Proposed acceptance and systemic prevention in REQUIREMENTS.md; implementation not performed."}
- **Automation Opportunity:** ["AUTO-013", "AUTO-016"]
- **Observability Requirement:** Scoped request/operation/mutation correlation; domain error, latency and resource context; no secrets.
- **Status:** outstanding cause/control gap
- **Proof Layers:** ["RETAINED_REPORT", "OWNER_OBSERVATION"]
- **Limitations:** ["A live query plan or block/temp/WAL profile for the 90-second query", "OOM, I/O exhaustion, lock contention, or provider failure at the exact window", "The broad query causing rather than coinciding with the outage"]

Evidence: [EV-023-01](/private/tmp/bagger-r3-recovery-continuation/REPORT.md)

<a id="2026-inc-024"></a>

## 2026-INC-024 — Disk I/O budget warning and unproven capacity

- **Date Time:** Approximately 2026-09-26 02:30, timezone not independently verified
- **Release:** UNKNOWN in this source
- **Activation:** UNKNOWN in this source
- **Sha:** UNKNOWN in this source
- **Surface:** ["Infrastructure", "Observability"]
- **Severity:** P1
- **User Impact:** Owner received a Disk I/O depletion warning; safe resource headroom was not established.
- **Competitive Impact:** Availability/completion risk; no proven formula or Official corruption in examined evidence.
- **Data Integrity Impact:** The warning was preserved as a hypothesis and the known heavy Production aggregation was prohibited.
- **Root Cause:** UNKNOWN: The warning's underlying metric values and timezone; Whether the budget hit 100 percent; Whether I/O pressure caused INC-022, INC-023, or the later scoring timeouts; Current compute, storage, pool, region, or plan configuration
- **Confidence:** Owner warning PROVEN as reported; capacity gap STRONGLY SUPPORTED; outage causation UNKNOWN
- **Contributing Factors:** ["No adequate retained capacity/headroom certification or numerical provider time series was located.", "The owner-reported depletion warning establishes a warning, not the exact point of budget exhaustion or outage cause."]
- **Detection Method:** Owner-reported provider Disk I/O warning; numerical underlying metric series unavailable.
- **Recovery:** Bounded health observation and stopping unsafe work; see report. Root cause not closed by recovery.
- **Time To Diagnose:** UNKNOWN — exact first detection and diagnosis boundaries not fully retained
- **Time To Recover:** UNKNOWN — observations bound recovery, not full outage duration
- **Source Change Required:** Capacity/diagnostic policy and telemetry improvements proposed; no incident-specific source fix proven.
- **Release Required:** No application release required merely to acknowledge the provider warning.
- **Native Build Required:** No.
- **Why Certification Missed:** No retained capacity/causal metric proof at relevant layer; see certification audit.
- **Test That Would Catch:** NA-2026-024
- **Architectural Prevention:** {"requirement_ids": ["OBS-CORE-001", "CERT-001", "OPS-SAFE-001", "CERT-NA-001", "OPS-DR-001", "AUTO-DEG-001"], "note": "Proposed acceptance and systemic prevention in REQUIREMENTS.md; implementation not performed."}
- **Automation Opportunity:** ["AUTO-013", "AUTO-020"]
- **Observability Requirement:** Scoped request/operation/mutation correlation; domain error, latency and resource context; no secrets.
- **Status:** outstanding cause/control gap
- **Proof Layers:** ["RETAINED_REPORT", "OWNER_OBSERVATION"]
- **Limitations:** ["The warning's underlying metric values and timezone", "Whether the budget hit 100 percent", "Whether I/O pressure caused INC-022, INC-023, or the later scoring timeouts", "Current compute, storage, pool, region, or plan configuration"]

Evidence: [EV-024-01](/private/tmp/bagger-r3-continuous-recovery/DISK-IO-INCIDENT-ADDENDUM.md); [EV-024-02](/private/tmp/bagger-r3-write-timeout/RESOURCE-OBSERVATION.json)

<a id="2026-inc-025"></a>

## 2026-INC-025 — Insufficient observability prevented root-cause closure

- **Date Time:** Cross-cutting across Sep 23-27 investigations
- **Release:** UNKNOWN in this source
- **Activation:** UNKNOWN in this source
- **Sha:** UNKNOWN in this source
- **Surface:** ["Infrastructure", "Observability"]
- **Severity:** P1
- **User Impact:** Missing request/resource/phone correlation prevented complete causal diagnosis and precise operational measurement.
- **Competitive Impact:** Availability/completion risk; no proven formula or Official corruption in examined evidence.
- **Data Integrity Impact:** Reports consistently retained UNKNOWN rather than inventing causation.
- **Root Cause:** UNKNOWN: A single common root cause for all failures; That additional provider telemetry would by itself have prevented the incidents
- **Confidence:** PROVEN cross-cutting control gap; may be recorded as a contributing condition instead of a distinct outage
- **Contributing Factors:** ["Missing request/resource/physical-client correlation limited causal attribution and duration measurement.", "Temporary local evidence retention did not provide complete durable provider and application telemetry."]
- **Detection Method:** Audit of retained logs/reports revealed missing correlation and capacity evidence; not a separate outage trace.
- **Recovery:** Bounded health observation and stopping unsafe work; see report. Root cause not closed by recovery.
- **Time To Diagnose:** UNKNOWN — exact first detection and diagnosis boundaries not fully retained
- **Time To Recover:** UNKNOWN — observations bound recovery, not full outage duration
- **Source Change Required:** Yes for the proposed cross-layer telemetry and durable evidence system; not an outage patch.
- **Release Required:** Future scoped observability releases/configuration, not a historical recovery release.
- **Native Build Required:** Native telemetry requires a future build; not needed for past canonical data integrity.
- **Why Certification Missed:** No retained capacity/causal metric proof at relevant layer; see certification audit.
- **Test That Would Catch:** NA-2026-025
- **Architectural Prevention:** {"requirement_ids": ["OBS-CORE-001"], "note": "Proposed acceptance and systemic prevention in REQUIREMENTS.md; implementation not performed."}
- **Automation Opportunity:** ["AUTO-001", "AUTO-017"]
- **Observability Requirement:** Scoped request/operation/mutation correlation; domain error, latency and resource context; no secrets.
- **Status:** outstanding cause/control gap
- **Proof Layers:** ["RETAINED_REPORT", "OWNER_OBSERVATION"]
- **Limitations:** ["A single common root cause for all failures", "That additional provider telemetry would by itself have prevented the incidents"]

Evidence: [EV-025-01](/private/tmp/bagger-r3-morning-preflight/REPORT.md); [EV-025-02](/private/tmp/bagger-r3-write-timeout/REPORT.md); [EV-025-03](/private/tmp/bagger-build9-performance/REPORT.md)

<a id="2026-inc-026"></a>

## 2026-INC-026 — Physical spectator slow/unavailable observation without request-level causal proof

- **Date Time:** 2026-09-23 Build9 performance investigation; exact physical request UNKNOWN
- **Release:** 132
- **Activation:** UNKNOWN for exact physical request
- **Sha:** UNKNOWN for the exact physical event
- **Surface:** ["Native", "Network", "Observability"]
- **Severity:** P1
- **User Impact:** A physical spectator slow/unavailable experience could not be correlated conclusively to a particular request.
- **Competitive Impact:** Presentation/workflow availability; no direct score or golf-result corruption established for this incident. Dependent failures are separate incident IDs.
- **Data Integrity Impact:** No competitive write involved.
- **Root Cause:** UNKNOWN. Candidate requests near observation were200; duration/upstream/correlation unavailable.
- **Confidence:** UNKNOWN
- **Contributing Factors:** ["The physical observation lacked a matching request ID and retained network timings.", "No specific server or native source defect can be assigned to that event from the observation alone."]
- **Detection Method:** Owner physical spectator slow/unavailable observation without matching request/network timing.
- **Recovery:** Subsequent bounded reads healthy; this does not prove root-cause repair.
- **Time To Diagnose:** UNKNOWN
- **Time To Recover:** UNKNOWN
- **Source Change Required:** UNKNOWN
- **Release Required:** Not proven
- **Native Build Required:** Not proven
- **Why Certification Missed:** Latency snapshots and simulator response handling did not prove long-lived physical network performance.
- **Test That Would Catch:** NA-2026-026
- **Architectural Prevention:** {"requirement_ids": ["OBS-CORE-001"], "note": "Proposed acceptance and systemic prevention in REQUIREMENTS.md; implementation not performed."}
- **Automation Opportunity:** ["AUTO-023", "AUTO-024"]
- **Observability Requirement:** Client trace, response phase timing, network class without PII.
- **Status:** ROOT CAUSE UNKNOWN
- **Proof Layers:** ["PHYSICAL_OWNER_OBSERVATION", "RETAINED_REPORT"]
- **Limitations:** No deterministic reproduction of the exact physical event; test future analogous fault containment, not invented historical cause.

Evidence: [EV-026-01](/private/tmp/bagger-build9-performance/REPORT.md)
