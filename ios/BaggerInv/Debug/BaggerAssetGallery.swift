#if DEBUG
import SwiftUI

enum BaggerAssetGalleryLaunch {
    static let argument = "--bagger-asset-gallery"

    static func isEnabled(arguments: [String] = ProcessInfo.processInfo.arguments) -> Bool {
        arguments.contains(argument)
    }
}

/// Development-only visual proof for the asset catalog. It is never linked from
/// participant navigation and is compiled out of Release builds.
struct BaggerAssetGalleryView: View {
    private let columns = [GridItem(.adaptive(minimum: 112), spacing: 12)]

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 24) {
                    gallerySection(
                        title: "Brand",
                        kind: "brand",
                        entries: [BaggerAssetManifest.brandPrimary],
                        cropPortraits: false
                    )
                    gallerySection(
                        title: "Tournament",
                        kind: "tournament",
                        entries: BaggerAssetManifest.tournamentEntries,
                        cropPortraits: false
                    )
                    gallerySection(
                        title: "Teams",
                        kind: "team",
                        entries: BaggerAssetManifest.teamEntries,
                        cropPortraits: false
                    )
                    gallerySection(
                        title: "Players",
                        kind: "player",
                        entries: BaggerAssetManifest.playerEntries,
                        cropPortraits: true
                    )
                    gallerySection(
                        title: "Courses",
                        kind: "course",
                        entries: uniqueCatalogEntries(BaggerAssetManifest.courseEntries),
                        cropPortraits: false
                    )
                    fallbackSection
                }
                .padding(16)
            }
            .background(BaggerPalette.canvas)
            .navigationTitle("Asset Foundation")
            .accessibilityIdentifier("asset.gallery")
        }
    }

    private func gallerySection(
        title: String,
        kind: String,
        entries: [BaggerAssetManifest.Entry],
        cropPortraits: Bool
    ) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            BaggerSectionHeading(title, eyebrow: "DEBUG ONLY")
            LazyVGrid(columns: columns, spacing: 12) {
                ForEach(entries, id: \.catalogName) { entry in
                    AssetGalleryCard(entry: entry, kind: kind, crop: cropPortraits)
                }
            }
        }
    }

    private var fallbackSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            BaggerSectionHeading("Fallbacks", eyebrow: "UNKNOWN IDS")
            LazyVGrid(columns: columns, spacing: 12) {
                fallbackCard(title: "Player", identifier: "asset.fallback.player") {
                    Text("AB")
                        .font(.title2.bold())
                }
                fallbackCard(title: "Team", identifier: "asset.fallback.team") {
                    Text("T")
                        .font(.title2.bold())
                }
                fallbackCard(title: "Course", identifier: "asset.fallback.course") {
                    Image(systemName: "flag.fill")
                        .font(.title2)
                }
                fallbackCard(title: "Tournament", identifier: "asset.fallback.tournament") {
                    Image(BaggerAsset.primaryBrand.catalogName)
                        .resizable()
                        .scaledToFit()
                }
            }
        }
        .accessibilityIdentifier("asset.fallbacks")
    }

    private func fallbackCard<Content: View>(
        title: String,
        identifier: String,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(spacing: 8) {
            ZStack {
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(BaggerPalette.cream)
                content()
                    .foregroundStyle(BaggerPalette.evergreen)
                    .padding(12)
            }
            .frame(height: 104)
            Text(title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(BaggerPalette.ink)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(10)
        .background(BaggerPalette.paper, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(BaggerPalette.warmBorder)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Unknown \(title.lowercased()) fallback")
        .accessibilityIdentifier(identifier)
    }

    private func uniqueCatalogEntries(_ entries: [BaggerAssetManifest.Entry]) -> [BaggerAssetManifest.Entry] {
        var seen = Set<String>()
        return entries.filter { seen.insert($0.catalogName).inserted }
    }
}

private struct AssetGalleryCard: View {
    let entry: BaggerAssetManifest.Entry
    let kind: String
    let crop: Bool

    var body: some View {
        VStack(spacing: 8) {
            ZStack {
                checkerboard
                Image(entry.catalogName)
                    .resizable()
                    .aspectRatio(contentMode: crop ? .fill : .fit)
                    .padding(crop ? 0 : 8)
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
            .frame(height: 104)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))

            Text(entry.canonicalID)
                .font(.caption2.monospaced().weight(.semibold))
                .foregroundStyle(BaggerPalette.ink)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(10)
        .background(BaggerPalette.paper, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(BaggerPalette.warmBorder)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(kind.capitalized) identity asset \(entry.canonicalID)")
        .accessibilityIdentifier("asset.\(kind).\(entry.catalogName)")
    }

    private var checkerboard: some View {
        ZStack {
            Color.white
            LinearGradient(
                colors: [BaggerPalette.cream.opacity(0.55), Color.white],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        }
    }
}
#endif
