# Real pg-safeupdate regression dependency

Unmodified upstream `safeupdate.c` from [eradman/pg-safeupdate](https://github.com/eradman/pg-safeupdate), commit `37dbc9c4acf5e2504adf2b218e9c6b41751022f3`, release 1.7. Source SHA-256: `1351fc18b9a1e2dcc72185d349c178244458b5d9eb30007609c3d599b38aeb38`. ISC license included.

The harness builds the module against the existing PostgreSQL 17 headers in an owned temporary directory. It sets `session_preload_libraries` only on the disposable socket-only test database. It neither installs a global extension nor changes a provider setting. No network download or credentials are needed. Tests fail if compilation/loading fails; there is no mock or skip fallback.
