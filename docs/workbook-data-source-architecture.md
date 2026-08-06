# Workbook Data Source Architecture

This is a permanent repository requirement.

The workbook is the single source of truth, but features must consume it through the application's existing authoritative services, loaders, and normalized runtime models. A feature name or domain concept is never evidence that a worksheet with the same name exists.

Before adding any workbook read:

1. Identify the existing application service, loader, or runtime model that already owns the required data.
2. Reuse that source whenever it exists.
3. Verify every directly referenced worksheet title against the active Preview workbook schema.
4. Never introduce a worksheet dependency based on an inferred or convenient name.
5. If neither a verified worksheet nor an existing authoritative service exists, stop and report the missing dependency.

Official scores, round results, standings, handicaps, match status, players, and courses must use the same authoritative sources already consumed by Tournament, Leaderboards, Tournament Intelligence, Championship Projections, Net Skins, Home, and My Match. Features must not create parallel loaders or workbook interpretations.

Workbook integration is incomplete until every referenced worksheet has been verified in the active Preview workbook. Unknown worksheet names and unverified logical sources fail closed; the application must not create, rename, or infer workbook structure.

The attempted Calcutta dependency on `Round Results` is recorded as a violation of this rule. It must not be treated as an authoritative source unless that worksheet is first verified in the active workbook. Calcutta publication must instead bind to an existing verified application source, or remain blocked with the missing dependency reported explicitly.
