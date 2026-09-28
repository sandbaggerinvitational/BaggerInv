# Consolidated test inventory

All tests are designed, not executed by this audit. Historical executions remain separate evidence. Automated=True identifies automation-capable components, not proof that a physical step can be omitted. Physical=True requires separately recorded physical/owner proof.

| Test | Incident/requirement | Layer | Environment | Automated | Physical | Frequency | Blocking |
|---|---|---|---|---|---|---|---|
| NA-2026-001 | 2026-INC-001, CERT-NA-001, B11-READ-005 | UNIT, PWA_BROWSER, INTEGRATION, PHYSICAL | Non-Production | True | True | Affected PR plus every tournament candidate | True |
| NA-2026-002 | 2026-INC-002, CERT-NA-001, B11-NAV-005 | SIMULATOR, INTEGRATION, PHYSICAL | Non-Production | True | True | Affected PR plus every tournament candidate | True |
| NA-2026-003 | 2026-INC-003, CERT-NA-001, B11-READ-006 | SIMULATOR, INTEGRATION, PHYSICAL | Non-Production | True | True | Affected PR plus every tournament candidate | True |
| NA-2026-004 | 2026-INC-004, CERT-NA-001, B11-READ-003, B11-READ-004, B11-READ-007 | SIMULATOR, INTEGRATION, PHYSICAL | Non-Production | True | True | Affected PR plus every tournament candidate | True |
| NA-2026-005 | 2026-INC-005, CERT-001, CERT-NA-001, CERT-PHY-001, B11-SCORE-007, B11-SCORE-008 | SIMULATOR, INTEGRATION, PHYSICAL | Non-Production | True | True | Affected PR plus every tournament candidate | True |
| NA-2026-006 | 2026-INC-006, OBS-CORE-001, CERT-001, BE-CONTRACT-001, PWA-001, CERT-NA-001, CERT-PHY-001, CERT-IMPACT-001, B11-NAV-004, B11-SCORE-001, B11-SCORE-002, B11-SCORE-003, B11-SCORE-004, B11-SCORE-005, B11-SCORE-006, B11-READ-007 | SQLITE_PERSISTENCE, SQL/RPC, API, SIMULATOR, PHYSICAL | Non-Production | True | True | Affected PR plus every tournament candidate | True |
| NA-2026-007 | 2026-INC-007, OBS-CORE-001, BE-CONTRACT-001, CERT-NA-001, CERT-PHY-001, AUTO-DEG-001, B11-NAV-001, B11-NAV-002, B11-NAV-003, B11-NAV-004, B11-READ-003, B11-READ-007 | SIMULATOR, INTEGRATION, PHYSICAL | Non-Production | True | True | Affected PR plus every tournament candidate | True |
| NA-2026-008 | 2026-INC-008, BE-CONTRACT-001, CERT-NA-001, B11-NAV-001, B11-READ-001, B11-READ-003, B11-READ-007 | SIMULATOR, INTEGRATION, PHYSICAL | Non-Production | True | True | Affected PR plus every tournament candidate | True |
| NA-2026-009 | 2026-INC-009, BE-CONTRACT-001, CERT-NA-001, AUTO-DEG-001, B11-NAV-001, B11-READ-002, B11-READ-003, B11-READ-007 | SQL/RPC, API, SIMULATOR, FULL_LIFECYCLE, PHYSICAL | Non-Production | True | True | Affected PR plus every tournament candidate | True |
| NA-2026-010 | 2026-INC-010, CERT-001, CERT-NA-001, CERT-SYN-001, CERT-IMPACT-001, DB-PERF-002, BE-JOB-002 | SQL/RPC, API | Non-Production | True | False | Affected PR plus every tournament candidate | True |
| NA-2026-011 | 2026-INC-011, AUTO-JOB-001, CERT-NA-001, REL-001, BE-JOB-002, BE-JOB-004, BE-DEP-001 | SQL/RPC, API | Non-Production | True | False | Affected PR plus every tournament candidate | True |
| NA-2026-012 | 2026-INC-012, CERT-001, CERT-NA-001, CERT-SYN-001, CERT-IMPACT-001, DB-PERF-002, BE-JOB-002 | SQL/RPC, API | Non-Production | True | False | Affected PR plus every tournament candidate | True |
| NA-2026-013 | 2026-INC-013, DIR-OPS-001, DIR-OPS-002, CERT-NA-001, REL-001, BE-DEP-003 | SQL/RPC, API | Non-Production | True | False | Affected PR plus every tournament candidate | True |
| NA-2026-014 | 2026-INC-014, BE-CONTRACT-001, PWA-001, CERT-NA-001, CERT-PHY-001, REL-001, BE-JOB-005 | SQL/RPC, API, PHYSICAL | Non-Production | True | True | Affected PR plus every tournament candidate | True |
| NA-2026-015 | 2026-INC-015, PWA-001, CERT-NA-001, BE-JOB-005 | SQL/RPC, API, PHYSICAL | Non-Production | True | True | Affected PR plus every tournament candidate | True |
| NA-2026-016 | 2026-INC-016, DIR-OPS-001, AUTO-JOB-001, DIR-NEXT-001, CERT-NA-001, CERT-SYN-001, DIR-MOB-001, BE-JOB-002, BE-JOB-003, BE-DEP-001, BE-DEP-002, BE-DEP-003, BE-DEP-004 | SQL/RPC, API | Non-Production | True | False | Affected PR plus every tournament candidate | True |
| NA-2026-017 | 2026-INC-017, CERT-001, DIR-OPS-001, DIR-OPS-002, DIR-CLOSE-001, DIR-NEXT-001, CERT-NA-001, CERT-SYN-001, CERT-PHY-001, DIR-MOB-001, AUTO-HEALTH-001, DB-PERF-001, DB-PERF-003, BE-DEP-001, BE-DEP-002, BE-DEP-003, BE-DEP-004 | SQL/RPC, API, FULL_LIFECYCLE | Non-Production | True | False | Affected PR plus every tournament candidate | True |
| NA-2026-018 | 2026-INC-018, OBS-CORE-001, DIR-OPS-001, DIR-OPS-002, DIR-NEXT-001, CERT-NA-001, CERT-PHY-001, DIR-MOB-001, AUTO-HEALTH-001, BE-SCORE-003, BE-JOB-003, BE-DEP-003 | SQL/RPC, API, PHYSICAL | Non-Production | True | True | Affected PR plus every tournament candidate | True |
| NA-2026-019 | 2026-INC-019, OBS-CORE-001, CERT-001, PERF-001, PWA-001, CERT-NA-001, CERT-SYN-001, OPS-DR-001, HIST-001, CERT-IMPACT-001, BE-SCORE-001, BE-SCORE-002, DB-PERF-001, DB-PERF-002, DB-PERF-003, BE-JOB-001, BE-JOB-002, BE-DEP-002 | SQL/RPC, API, PERFORMANCE, QUERY_PLAN | Non-Production | True | False | Affected PR plus every tournament candidate | True |
| NA-2026-020 | 2026-INC-020, DIR-REC-001, DIR-CLOSE-001, CERT-NA-001, CERT-PHY-001, OPS-DR-001, DIR-MOB-001, BE-SCORE-001, BE-SCORE-003, BE-SCORE-004, BE-JOB-003 | SQL/RPC, API, PHYSICAL | Non-Production | True | True | Affected PR plus every tournament candidate | True |
| NA-2026-021 | 2026-INC-021, DIR-FIN-001, CERT-NA-001 | SQL/RPC, API | Non-Production | True | False | Affected PR plus every tournament candidate | True |
| NA-2026-022 | 2026-INC-022, OBS-CORE-001, BE-CONTRACT-001, CERT-NA-001, OPS-DR-001, AUTO-HEALTH-001, AUTO-DEG-001 | FAILURE-INJECTION, PERFORMANCE, API | Non-Production | True | False | Affected PR plus every tournament candidate | True |
| NA-2026-023 | 2026-INC-023, OBS-CORE-001, PERF-001, OPS-SAFE-001, CERT-NA-001, HIST-001 | FAILURE-INJECTION, PERFORMANCE, API | Non-Production | True | False | Affected PR plus every tournament candidate | True |
| NA-2026-024 | 2026-INC-024, OBS-CORE-001, CERT-001, OPS-SAFE-001, CERT-NA-001, OPS-DR-001, AUTO-DEG-001 | FAILURE-INJECTION, PERFORMANCE, API | Non-Production | True | False | Affected PR plus every tournament candidate | True |
| NA-2026-025 | 2026-INC-025, OBS-CORE-001 | FAILURE-INJECTION, PERFORMANCE, API | Non-Production | True | False | Affected PR plus every tournament candidate | True |
| NA-2026-026 | 2026-INC-026, OBS-CORE-001 | FAILURE-INJECTION, PERFORMANCE, API, PHYSICAL | Non-Production | True | True | Affected PR plus every tournament candidate | True |
| TEST-OBS-CORE-001 | 2026-INC-006, 2026-INC-007, 2026-INC-018, 2026-INC-019, 2026-INC-022, 2026-INC-023, 2026-INC-024, 2026-INC-025, 2026-INC-026, OBS-CORE-001 | API, SQL/RPC, STAGED/HOSTED | Non-Production | True | False | Affected change; candidate; final physical where required | True |
| TEST-CERT-001 | 2026-INC-005, 2026-INC-006, 2026-INC-010, 2026-INC-012, 2026-INC-017, 2026-INC-019, 2026-INC-024, CERT-001 | UNIT, FULL-LIFECYCLE, PHYSICAL | Non-Production | True | True | Affected change; candidate; final physical where required | True |
| TEST-PERF-001 | 2026-INC-019, 2026-INC-023, PERF-001 | SQL/RPC, PERFORMANCE | Non-Production | True | False | Affected change; candidate; final physical where required | True |
| TEST-DIR-OPS-001 | 2026-INC-013, 2026-INC-016, 2026-INC-017, 2026-INC-018, DIR-OPS-001 | SQL/RPC, API, FULL-LIFECYCLE, PHYSICAL | Non-Production | True | True | Affected change; candidate; final physical where required | True |
| TEST-DIR-OPS-002 | 2026-INC-013, 2026-INC-017, 2026-INC-018, DIR-OPS-002 | SQL/RPC, API, FAILURE-INJECTION, FULL-LIFECYCLE, PHYSICAL | Non-Production | True | True | Affected change; candidate; final physical where required | True |
| TEST-DIR-REC-001 | 2026-INC-020, DIR-REC-001 | SQL/RPC, API, PHYSICAL, FULL-LIFECYCLE | Non-Production | True | True | Affected change; candidate; final physical where required | True |
| TEST-OPS-SAFE-001 | 2026-INC-023, 2026-INC-024, OPS-SAFE-001 | SECURITY, SQL/RPC, PERFORMANCE | Non-Production | True | False | Affected change; candidate; final physical where required | True |
| TEST-DIR-CLOSE-001 | 2026-INC-017, 2026-INC-020, DIR-CLOSE-001 | SQL/RPC, API, FULL-LIFECYCLE, PHYSICAL | Non-Production | True | True | Affected change; candidate; final physical where required | True |
| TEST-BE-CONTRACT-001 | 2026-INC-006, 2026-INC-007, 2026-INC-008, 2026-INC-009, 2026-INC-014, 2026-INC-022, BE-CONTRACT-001 | API, SIMULATOR, PHYSICAL | Non-Production | True | True | Affected change; candidate; final physical where required | True |
| TEST-PWA-001 | 2026-INC-006, 2026-INC-014, 2026-INC-015, 2026-INC-019, PWA-001 | API, PHYSICAL, FULL-LIFECYCLE | Non-Production | True | True | Affected change; candidate; final physical where required | True |
| TEST-AUTO-JOB-001 | 2026-INC-011, 2026-INC-016, AUTO-JOB-001 | SQL/RPC, API, FULL-LIFECYCLE | Non-Production | True | False | Affected change; candidate; final physical where required | False |
| TEST-DIR-NEXT-001 | 2026-INC-016, 2026-INC-017, 2026-INC-018, DIR-NEXT-001 | API, PHYSICAL, FULL-LIFECYCLE | Non-Production | True | True | Affected change; candidate; final physical where required | False |
| TEST-DIR-FIN-001 | 2026-INC-021, DIR-FIN-001 | SQL/RPC, API, FULL-LIFECYCLE, PHYSICAL | Non-Production | True | True | Affected change; candidate; final physical where required | False |
| TEST-CERT-NA-001 | 2026-INC-001, 2026-INC-002, 2026-INC-003, 2026-INC-004, 2026-INC-005, 2026-INC-006, 2026-INC-007, 2026-INC-008, 2026-INC-009, 2026-INC-010, 2026-INC-011, 2026-INC-012, 2026-INC-013, 2026-INC-014, 2026-INC-015, 2026-INC-016, 2026-INC-017, 2026-INC-018, 2026-INC-019, 2026-INC-020, 2026-INC-021, 2026-INC-022, 2026-INC-023, 2026-INC-024, CERT-NA-001 | SQL/RPC, API, SIMULATOR, PHYSICAL, PERFORMANCE, FULL-LIFECYCLE | Non-Production | True | True | Affected change; candidate; final physical where required | True |
| TEST-CERT-SYN-001 | 2026-INC-010, 2026-INC-012, 2026-INC-016, 2026-INC-017, 2026-INC-019, CERT-SYN-001 | FULL-LIFECYCLE, SQL/RPC, API | Non-Production | True | False | Affected change; candidate; final physical where required | True |
| TEST-CERT-PHY-001 | 2026-INC-005, 2026-INC-006, 2026-INC-007, 2026-INC-014, 2026-INC-017, 2026-INC-018, 2026-INC-020, CERT-PHY-001 | PHYSICAL, FULL-LIFECYCLE, OWNER-ACCEPTANCE | Non-Production | True | True | Affected change; candidate; final physical where required | True |
| TEST-OPS-DR-001 | 2026-INC-019, 2026-INC-020, 2026-INC-022, 2026-INC-024, OPS-DR-001 | INTEGRATION, PHYSICAL, FULL-LIFECYCLE | Non-Production | True | True | Affected change; candidate; final physical where required | True |
| TEST-REL-001 | 2026-INC-011, 2026-INC-013, 2026-INC-014, REL-001 | SQL/RPC, API, FULL-LIFECYCLE | Non-Production | True | False | Affected change; candidate; final physical where required | True |
| TEST-DIR-MOB-001 | 2026-INC-016, 2026-INC-017, 2026-INC-018, 2026-INC-020, DIR-MOB-001 | PHYSICAL, OWNER-ACCEPTANCE | Non-Production | True | True | Affected change; candidate; final physical where required | False |
| TEST-SEC-001 | SEC-001 | SECURITY, SQL/RPC, API | Non-Production | True | False | Affected change; candidate; final physical where required | True |
| TEST-HIST-001 | 2026-INC-019, 2026-INC-023, HIST-001 | SQL/RPC, PERFORMANCE | Non-Production | True | False | Affected change; candidate; final physical where required | False |
| TEST-AUTO-HEALTH-001 | 2026-INC-017, 2026-INC-018, 2026-INC-022, AUTO-HEALTH-001 | SQL/RPC, API, PERFORMANCE | Non-Production | True | False | Affected change; candidate; final physical where required | False |
| TEST-AUTO-DEG-001 | 2026-INC-007, 2026-INC-009, 2026-INC-022, 2026-INC-024, AUTO-DEG-001 | API, FAILURE-INJECTION, PHYSICAL | Non-Production | True | True | Affected change; candidate; final physical where required | False |
| TEST-CERT-IMPACT-001 | 2026-INC-006, 2026-INC-010, 2026-INC-012, 2026-INC-019, CERT-IMPACT-001 | UNIT, INTEGRATION | Non-Production | True | False | Affected change; candidate; final physical where required | False |
| TEST-B11-NAV-001 | 2026-INC-007, 2026-INC-008, 2026-INC-009, B11-NAV-001 | AUTOMATED, INTEGRATION, PHYSICAL | Non-Production | True | True | Affected change; candidate; final physical where required | True |
| TEST-B11-NAV-002 | 2026-INC-007, B11-NAV-002 | AUTOMATED, INTEGRATION, PHYSICAL | Non-Production | True | True | Affected change; candidate; final physical where required | True |
| TEST-B11-NAV-003 | 2026-INC-007, B11-NAV-003 | AUTOMATED, INTEGRATION, PHYSICAL | Non-Production | True | True | Affected change; candidate; final physical where required | True |
| TEST-B11-NAV-004 | 2026-INC-006, 2026-INC-007, B11-NAV-004 | AUTOMATED, INTEGRATION, PHYSICAL | Non-Production | True | True | Affected change; candidate; final physical where required | False |
| TEST-B11-NAV-005 | 2026-INC-002, B11-NAV-005 | AUTOMATED, INTEGRATION, PHYSICAL | Non-Production | True | True | Affected change; candidate; final physical where required | False |
| TEST-B11-SCORE-001 | 2026-INC-006, B11-SCORE-001 | AUTOMATED, INTEGRATION, PHYSICAL | Non-Production | True | True | Affected change; candidate; final physical where required | True |
| TEST-B11-SCORE-002 | 2026-INC-006, B11-SCORE-002 | AUTOMATED, INTEGRATION, PHYSICAL | Non-Production | True | True | Affected change; candidate; final physical where required | True |
| TEST-B11-SCORE-003 | 2026-INC-006, B11-SCORE-003 | AUTOMATED, INTEGRATION, PHYSICAL | Non-Production | True | True | Affected change; candidate; final physical where required | True |
| TEST-B11-SCORE-004 | 2026-INC-006, B11-SCORE-004 | AUTOMATED, INTEGRATION, PHYSICAL | Non-Production | True | True | Affected change; candidate; final physical where required | True |
| TEST-B11-SCORE-005 | 2026-INC-006, B11-SCORE-005 | AUTOMATED, INTEGRATION, PHYSICAL | Non-Production | True | True | Affected change; candidate; final physical where required | True |
| TEST-B11-SCORE-006 | 2026-INC-006, B11-SCORE-006 | AUTOMATED, INTEGRATION, PHYSICAL | Non-Production | True | True | Affected change; candidate; final physical where required | False |
| TEST-B11-SCORE-007 | 2026-INC-005, B11-SCORE-007 | AUTOMATED, INTEGRATION, PHYSICAL | Non-Production | True | True | Affected change; candidate; final physical where required | False |
| TEST-B11-SCORE-008 | 2026-INC-005, B11-SCORE-008 | AUTOMATED, INTEGRATION, PHYSICAL | Non-Production | True | True | Affected change; candidate; final physical where required | False |
| TEST-B11-READ-001 | 2026-INC-008, B11-READ-001 | AUTOMATED, INTEGRATION, PHYSICAL | Non-Production | True | True | Affected change; candidate; final physical where required | True |
| TEST-B11-READ-002 | 2026-INC-009, B11-READ-002 | AUTOMATED, INTEGRATION, PHYSICAL | Non-Production | True | True | Affected change; candidate; final physical where required | True |
| TEST-B11-READ-003 | 2026-INC-004, 2026-INC-007, 2026-INC-008, 2026-INC-009, B11-READ-003 | AUTOMATED, INTEGRATION, PHYSICAL | Non-Production | True | True | Affected change; candidate; final physical where required | True |
| TEST-B11-READ-004 | 2026-INC-004, B11-READ-004 | AUTOMATED, INTEGRATION, PHYSICAL | Non-Production | True | True | Affected change; candidate; final physical where required | False |
| TEST-B11-READ-005 | 2026-INC-001, B11-READ-005 | AUTOMATED, INTEGRATION, PHYSICAL | Non-Production | True | True | Affected change; candidate; final physical where required | False |
| TEST-B11-READ-006 | 2026-INC-003, B11-READ-006 | AUTOMATED, INTEGRATION, PHYSICAL | Non-Production | True | True | Affected change; candidate; final physical where required | False |
| TEST-B11-READ-007 | 2026-INC-004, 2026-INC-006, 2026-INC-007, 2026-INC-008, 2026-INC-009, B11-READ-007 | AUTOMATED, INTEGRATION, PHYSICAL | Non-Production | True | True | Affected change; candidate; final physical where required | False |
| TEST-BE-SCORE-001 | 2026-INC-019, 2026-INC-020, BE-SCORE-001 | AUTOMATED, INTEGRATION, PHYSICAL | Non-Production | True | True | Affected change; candidate; final physical where required | True |
| TEST-BE-SCORE-002 | 2026-INC-019, BE-SCORE-002 | AUTOMATED, INTEGRATION, PHYSICAL | Non-Production | True | True | Affected change; candidate; final physical where required | True |
| TEST-BE-SCORE-003 | 2026-INC-018, 2026-INC-020, BE-SCORE-003 | AUTOMATED, INTEGRATION, PHYSICAL | Non-Production | True | True | Affected change; candidate; final physical where required | True |
| TEST-BE-SCORE-004 | 2026-INC-020, BE-SCORE-004 | AUTOMATED, INTEGRATION, PHYSICAL | Non-Production | True | True | Affected change; candidate; final physical where required | True |
| TEST-DB-PERF-001 | 2026-INC-017, 2026-INC-019, DB-PERF-001 | AUTOMATED, INTEGRATION, LAYER-SPECIFIC | Non-Production | True | False | Affected change; candidate; final physical where required | True |
| TEST-DB-PERF-002 | 2026-INC-010, 2026-INC-012, 2026-INC-019, DB-PERF-002 | AUTOMATED, INTEGRATION, LAYER-SPECIFIC | Non-Production | True | False | Affected change; candidate; final physical where required | True |
| TEST-DB-PERF-003 | 2026-INC-017, 2026-INC-019, DB-PERF-003 | AUTOMATED, INTEGRATION, PHYSICAL | Non-Production | True | True | Affected change; candidate; final physical where required | False |
| TEST-BE-JOB-001 | 2026-INC-019, BE-JOB-001 | AUTOMATED, INTEGRATION, PHYSICAL | Non-Production | True | True | Affected change; candidate; final physical where required | True |
| TEST-BE-JOB-002 | 2026-INC-010, 2026-INC-011, 2026-INC-012, 2026-INC-016, 2026-INC-019, BE-JOB-002 | AUTOMATED, INTEGRATION, PHYSICAL | Non-Production | True | True | Affected change; candidate; final physical where required | True |
| TEST-BE-JOB-003 | 2026-INC-016, 2026-INC-018, 2026-INC-020, BE-JOB-003 | AUTOMATED, INTEGRATION, PHYSICAL | Non-Production | True | True | Affected change; candidate; final physical where required | True |
| TEST-BE-JOB-004 | 2026-INC-011, BE-JOB-004 | AUTOMATED, INTEGRATION, PHYSICAL | Non-Production | True | True | Affected change; candidate; final physical where required | False |
| TEST-BE-DEP-001 | 2026-INC-011, 2026-INC-016, 2026-INC-017, BE-DEP-001 | AUTOMATED, INTEGRATION, PHYSICAL | Non-Production | True | True | Affected change; candidate; final physical where required | True |
| TEST-BE-DEP-002 | 2026-INC-016, 2026-INC-017, 2026-INC-019, BE-DEP-002 | AUTOMATED, INTEGRATION, LAYER-SPECIFIC | Non-Production | True | False | Affected change; candidate; final physical where required | True |
| TEST-BE-DEP-003 | 2026-INC-013, 2026-INC-016, 2026-INC-017, 2026-INC-018, BE-DEP-003 | AUTOMATED, INTEGRATION, PHYSICAL | Non-Production | True | True | Affected change; candidate; final physical where required | True |
| TEST-BE-DEP-004 | 2026-INC-016, 2026-INC-017, BE-DEP-004 | AUTOMATED, INTEGRATION, PHYSICAL | Non-Production | True | True | Affected change; candidate; final physical where required | False |
| TEST-BE-DEP-005 | BE-DEP-005 | AUTOMATED, INTEGRATION, PHYSICAL | Non-Production | True | True | Affected change; candidate; final physical where required | False |
| TEST-BE-JOB-005 | 2026-INC-014, 2026-INC-015, BE-JOB-005 | AUTOMATED, INTEGRATION, PHYSICAL | Non-Production | True | True | Affected change; candidate; final physical where required | True |
| TEST-INFRA-001 | INFRA-001 | AUTOMATED, INTEGRATION, LAYER-SPECIFIC | Non-Production | True | False | Affected change; candidate; final physical where required | True |
| TEST-INFRA-002 | INFRA-002 | AUTOMATED, INTEGRATION, LAYER-SPECIFIC | Non-Production | True | False | Affected change; candidate; final physical where required | True |
| TEST-INFRA-003 | INFRA-003 | AUTOMATED, INTEGRATION, LAYER-SPECIFIC | Non-Production | True | False | Affected change; candidate; final physical where required | True |
| TEST-INFRA-004 | INFRA-004 | AUTOMATED, INTEGRATION, LAYER-SPECIFIC | Non-Production | True | False | Affected change; candidate; final physical where required | True |
| TEST-INFRA-005 | INFRA-005 | AUTOMATED, INTEGRATION, LAYER-SPECIFIC | Non-Production | True | False | Affected change; candidate; final physical where required | False |
| TEST-INFRA-006 | INFRA-006 | AUTOMATED, INTEGRATION, LAYER-SPECIFIC | Non-Production | True | False | Affected change; candidate; final physical where required | True |
| TEST-INFRA-007 | INFRA-007 | AUTOMATED, INTEGRATION, LAYER-SPECIFIC | Non-Production | True | False | Affected change; candidate; final physical where required | False |
| TEST-INFRA-008 | INFRA-008 | AUTOMATED, INTEGRATION, LAYER-SPECIFIC | Non-Production | True | False | Affected change; candidate; final physical where required | False |
| TEST-OBS-001 | OBS-001 | AUTOMATED, INTEGRATION, LAYER-SPECIFIC | Non-Production | True | False | Affected change; candidate; final physical where required | True |
| TEST-OBS-002 | OBS-002 | AUTOMATED, INTEGRATION, LAYER-SPECIFIC | Non-Production | True | False | Affected change; candidate; final physical where required | True |
| TEST-OBS-003 | OBS-003 | AUTOMATED, INTEGRATION, LAYER-SPECIFIC | Non-Production | True | False | Affected change; candidate; final physical where required | True |
| TEST-OBS-004 | OBS-004 | AUTOMATED, INTEGRATION, LAYER-SPECIFIC | Non-Production | True | False | Affected change; candidate; final physical where required | True |
| TEST-OBS-005 | OBS-005 | AUTOMATED, INTEGRATION, LAYER-SPECIFIC | Non-Production | True | False | Affected change; candidate; final physical where required | True |
| TEST-OBS-006 | OBS-006 | AUTOMATED, INTEGRATION, LAYER-SPECIFIC | Non-Production | True | False | Affected change; candidate; final physical where required | True |
| TEST-OBS-007 | OBS-007 | AUTOMATED, INTEGRATION, LAYER-SPECIFIC | Non-Production | True | False | Affected change; candidate; final physical where required | False |
| TEST-OBS-008 | OBS-008 | AUTOMATED, INTEGRATION, LAYER-SPECIFIC | Non-Production | True | False | Affected change; candidate; final physical where required | False |
| TEST-OBS-009 | OBS-009 | AUTOMATED, INTEGRATION, LAYER-SPECIFIC | Non-Production | True | False | Affected change; candidate; final physical where required | False |
| TEST-OPS-001 | OPS-001 | AUTOMATED, INTEGRATION, LAYER-SPECIFIC | Non-Production | True | False | Affected change; candidate; final physical where required | True |
| TEST-OPS-002 | OPS-002 | AUTOMATED, INTEGRATION, LAYER-SPECIFIC | Non-Production | True | False | Affected change; candidate; final physical where required | True |
| TEST-OPS-003 | OPS-003 | AUTOMATED, INTEGRATION, LAYER-SPECIFIC | Non-Production | True | False | Affected change; candidate; final physical where required | True |
| TEST-OPS-004 | OPS-004 | AUTOMATED, INTEGRATION, LAYER-SPECIFIC | Non-Production | True | False | Affected change; candidate; final physical where required | True |
| TEST-OPS-005 | OPS-005 | AUTOMATED, INTEGRATION, LAYER-SPECIFIC | Non-Production | True | False | Affected change; candidate; final physical where required | True |
| TEST-OPS-006 | OPS-006 | AUTOMATED, INTEGRATION, LAYER-SPECIFIC | Non-Production | True | False | Affected change; candidate; final physical where required | True |
| TEST-OPS-007 | OPS-007 | AUTOMATED, INTEGRATION, LAYER-SPECIFIC | Non-Production | True | False | Affected change; candidate; final physical where required | False |
| TEST-OPS-008 | OPS-008 | AUTOMATED, INTEGRATION, LAYER-SPECIFIC | Non-Production | True | False | Affected change; candidate; final physical where required | False |
