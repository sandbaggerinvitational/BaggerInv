import Foundation

enum BaggerAssetSemantic: Equatable, Sendable {
    case identity
    case decorative
}

enum BaggerAssetFallback: Equatable, Sendable {
    case initials
    case systemSymbol(String)
    case primaryBrand
}

struct BaggerAssetReference: Equatable, Hashable, Sendable {
    let catalogName: String
    let semantic: BaggerAssetSemantic
}

struct BaggerAssetLookup: Equatable, Sendable {
    let reference: BaggerAssetReference?
    let fallback: BaggerAssetFallback
}

/// Typed, fail-closed access to the reviewed native catalog.
///
/// The API accepts canonical identifiers and, when available, the exact
/// server-projected asset key. It never accepts or normalizes a display name.
enum BaggerAsset {
    static let primaryBrand = BaggerAssetReference(
        catalogName: BaggerAssetManifest.brandPrimary.catalogName,
        semantic: .identity
    )

    static func player(playerID: String, assetKey: String? = nil) -> BaggerAssetLookup {
        resolve(
            canonicalID: playerID,
            assetKey: assetKey,
            entries: BaggerAssetManifest.playersByID,
            fallback: .initials
        )
    }

    static func team(teamID: String, assetKey: String? = nil) -> BaggerAssetLookup {
        resolve(
            canonicalID: teamID,
            assetKey: assetKey,
            entries: BaggerAssetManifest.teamsByID,
            fallback: .initials
        )
    }

    static func courseLogo(courseID: String, assetKey: String? = nil) -> BaggerAssetLookup {
        resolve(
            canonicalID: courseID,
            assetKey: assetKey,
            entries: BaggerAssetManifest.coursesByID,
            fallback: .systemSymbol("flag.fill")
        )
    }

    static func tournamentLogo(year: Int, assetKey: String? = nil) -> BaggerAssetLookup {
        resolve(
            canonicalID: String(year),
            assetKey: assetKey,
            entries: BaggerAssetManifest.tournamentsByYear,
            fallback: .primaryBrand
        )
    }

    private static func resolve(
        canonicalID: String,
        assetKey: String?,
        entries: [String: BaggerAssetManifest.Entry],
        fallback: BaggerAssetFallback
    ) -> BaggerAssetLookup {
        let exactID = canonicalID.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        guard let entry = entries[exactID],
              assetKey.map({ $0 == entry.sourceAssetKey }) ?? true
        else {
            return BaggerAssetLookup(reference: nil, fallback: fallback)
        }

        return BaggerAssetLookup(
            reference: BaggerAssetReference(catalogName: entry.catalogName, semantic: .identity),
            fallback: fallback
        )
    }
}
