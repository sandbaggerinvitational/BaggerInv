import "server-only";

/**
 * Historical module boundary retained so stale imports fail at module-link
 * time instead of exposing a caller-supplied admission mint. Canonical V3
 * capability state now lives lexically inside production-cutover-scoring-
 * ingress.js, where the authoritative BEGIN/MARK RPCs and high-level legacy
 * credential scope are owned as one contract. This module intentionally
 * exports nothing.
 */
