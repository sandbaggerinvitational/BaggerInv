#if DEBUG
import SwiftUI

/// Deterministic visual inventory for Step 2J.1. It intentionally presents
/// primitives rather than simulated product screens.
struct BaggerDesignSystemGallerySections: View {
    var body: some View {
        Group {
            introduction
            colors
            typography
            cards
            buttons
            pills
            statuses
            headersAndRows
            states
            identity
        }
    }

    private var introduction: some View {
        VStack(alignment: .leading, spacing: BaggerDesign.Space.small) {
            BaggerEyebrow(text: "DEBUG ONLY")
            Text("Native Design System")
                .font(BaggerDesign.Typography.displaySection)
                .foregroundStyle(BaggerDesign.Color.textPrimary)
            Text("Tokens and primitives only. Participant products keep their certified hierarchy.")
                .font(BaggerDesign.Typography.body)
                .foregroundStyle(BaggerDesign.Color.textSecondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("design.gallery")
    }

    private var colors: some View {
        GallerySection(title: "Colors", identifier: "design.gallery.colors") {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 128), spacing: 8)], spacing: 8) {
                colorSwatch("Background", BaggerDesign.Color.backgroundPrimary)
                colorSwatch("Paper", BaggerDesign.Color.surfacePrimary)
                colorSwatch("Evergreen", BaggerDesign.Color.brandEvergreen)
                colorSwatch("Deep evergreen", BaggerDesign.Color.brandEvergreenDeep)
                colorSwatch("Gold", BaggerDesign.Color.brandGold)
                colorSwatch("Gold text", BaggerDesign.Color.brandGoldText)
                colorSwatch("Success", BaggerDesign.Color.statusSuccessBackground)
                colorSwatch("Warning", BaggerDesign.Color.statusWarningBackground)
                colorSwatch("Offline", BaggerDesign.Color.statusOfflineBackground)
                colorSwatch("Error", BaggerDesign.Color.statusErrorBackground)
            }
        }
    }

    private var typography: some View {
        GallerySection(title: "Typography", identifier: "design.gallery.typography") {
            VStack(alignment: .leading, spacing: BaggerDesign.Space.medium) {
                typeSample("Tournament Display", font: BaggerDesign.Typography.displayTournament)
                typeSample("Section Display", font: BaggerDesign.Typography.displaySection)
                typeSample("Primary Title", font: BaggerDesign.Typography.titlePrimary)
                typeSample("Card title", font: BaggerDesign.Typography.cardTitle)
                typeSample("Readable body copy scales with Dynamic Type.", font: BaggerDesign.Typography.body)
                typeSample("8½ · $123,456.78 · 4-1-1", font: BaggerDesign.Typography.statMedium)
                BaggerEyebrow(text: "Tournament context")
            }
        }
    }

    private var cards: some View {
        GallerySection(title: "Cards", identifier: "design.gallery.cards") {
            VStack(spacing: BaggerDesign.Space.cardGap) {
                galleryCard("Standard", detail: "Warm border and restrained elevation", style: .standard)
                galleryCard("Muted", detail: "Quiet inset or empty-state content", style: .muted)
                galleryCard("Selected", detail: "Stronger border without a new hierarchy", style: .selected)
                VStack(alignment: .leading, spacing: BaggerDesign.Space.small) {
                    Text("Hero surface")
                        .font(BaggerDesign.Typography.titleSecondary)
                    Text("Reserved for the most important tournament information.")
                        .font(BaggerDesign.Typography.body)
                }
                .foregroundStyle(BaggerDesign.Color.textInverse)
                .frame(maxWidth: .infinity, alignment: .leading)
                .baggerCard(style: .hero)
            }
        }
    }

    private var buttons: some View {
        GallerySection(title: "Buttons", identifier: "design.gallery.buttons") {
            VStack(alignment: .leading, spacing: BaggerDesign.Space.medium) {
                Button("Primary Action") {}
                    .buttonStyle(BaggerPrimaryButtonStyle(expands: true))
                    .accessibilityIdentifier("design.button.primary")
                Button("Secondary Action") {}
                    .buttonStyle(BaggerSecondaryButtonStyle(expands: true))
                    .accessibilityIdentifier("design.button.secondary")
                Button("Tertiary Action") {}
                    .buttonStyle(BaggerTertiaryButtonStyle())
                    .accessibilityIdentifier("design.button.tertiary")
                Button("Destructive Action", role: .destructive) {}
                    .buttonStyle(BaggerDestructiveButtonStyle(expands: true))
                    .accessibilityIdentifier("design.button.destructive")
                Button("Disabled Action") {}
                    .buttonStyle(BaggerPrimaryButtonStyle(expands: true))
                    .disabled(true)
                    .accessibilityIdentifier("design.button.disabled")
            }
        }
    }

    private var pills: some View {
        GallerySection(title: "Pills and selectors", identifier: "design.gallery.pills") {
            ViewThatFits(in: .horizontal) {
                HStack(spacing: BaggerDesign.Space.small) {
                    selectedPill
                    unselectedPill
                    BaggerStatusBadge(kind: .official)
                }
                VStack(alignment: .leading, spacing: BaggerDesign.Space.small) {
                    selectedPill
                    unselectedPill
                    BaggerStatusBadge(kind: .official)
                }
            }
        }
    }

    private var selectedPill: some View {
        BaggerSelectionPill(title: "Selected", isSelected: true) {}
            .accessibilityIdentifier("design.pill.selected")
    }

    private var unselectedPill: some View {
        BaggerSelectionPill(title: "Available", isSelected: false) {}
            .accessibilityIdentifier("design.pill.unselected")
    }

    private var statuses: some View {
        GallerySection(title: "Statuses", identifier: "design.gallery.statuses") {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 132), spacing: 8)], alignment: .leading, spacing: 8) {
                status(.live)
                status(.upcoming)
                status(.final)
                status(.official)
                status(.published)
                status(.unpublished)
                status(.projected)
                status(.savedOnIPhone)
                status(.editedNotSaved)
                status(.offline)
                status(.stale)
                status(.unavailable)
                status(.needsReview)
            }
        }
    }

    private var headersAndRows: some View {
        GallerySection(title: "Headers and rows", identifier: "design.gallery.rows") {
            VStack(alignment: .leading, spacing: BaggerDesign.Space.medium) {
                BaggerSectionHeader(
                    "A deliberately long section title that grows instead of clipping",
                    eyebrow: "Round 3 · Upcoming",
                    subtitle: "Optional supporting context remains secondary."
                ) {
                    Button("See All") {}
                        .buttonStyle(BaggerTertiaryButtonStyle())
                }
                Divider()
                BaggerNavigationRow(
                    title: "Tournament Guide",
                    subtitle: "Native published participant content",
                    systemImage: "book.closed"
                )
                .accessibilityIdentifier("design.row.navigation")
                Divider()
                BaggerMetricRow(
                    label: "Very Long Participant Name for Layout Testing",
                    value: "$123,456.78",
                    context: "Published canonical value"
                )
                .accessibilityIdentifier("design.row.metric")
            }
            .baggerCard()
        }
    }

    private var states: some View {
        GallerySection(title: "Loading, empty, error, and offline", identifier: "design.gallery.states") {
            VStack(spacing: BaggerDesign.Space.cardGap) {
                BaggerFreshnessBanner(
                    kind: .offline,
                    message: "Offline · showing the last saved update. Values may not be current."
                )
                .accessibilityIdentifier("design.state.offline")
                BaggerFreshnessBanner(
                    kind: .refreshing,
                    message: "Showing saved content while Bagger refreshes."
                )
                .accessibilityIdentifier("design.state.refreshing")
                BaggerEmptyState(
                    title: "Nothing published yet",
                    message: "This area will update when canonical participant content is available.",
                    systemImage: "flag",
                    actionTitle: "View Schedule"
                ) {}
                .accessibilityIdentifier("design.state.empty")
                BaggerErrorState(
                    title: "Temporarily unavailable",
                    message: "Bagger could not refresh this content. No participant action was changed.",
                    retryIdentifier: "design.state.retry"
                ) {}
                .accessibilityIdentifier("design.state.error")
                BaggerLoadingState(title: "Loading participant content", lineCount: 3)
                    .accessibilityIdentifier("design.state.loading")
            }
        }
    }

    private var identity: some View {
        GallerySection(title: "Identity imagery", identifier: "design.gallery.identity") {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 136), spacing: 12)], spacing: 12) {
                identityCard("Player") {
                    BaggerPlayerAvatar(
                        playerID: "CB01",
                        assetKey: "clay-beltran-pic",
                        displayName: "Participant Fixture",
                        size: .large,
                        accessibility: .decorative
                    )
                }
                .accessibilityIdentifier("design.identity.player.known")
                identityCard("Player fallback") {
                    BaggerPlayerAvatar(
                        playerID: "UNKNOWN",
                        displayName: "Alexandra Example",
                        size: .large,
                        accessibility: .decorative
                    )
                }
                .accessibilityIdentifier("design.identity.player.fallback")
                identityCard("Team") {
                    BaggerTeamLogo(
                        teamID: "PICKLES",
                        teamName: "Pickles",
                        size: .large,
                        accessibility: .decorative
                    )
                }
                .accessibilityIdentifier("design.identity.team.known")
                identityCard("Team fallback") {
                    BaggerTeamLogo(
                        teamID: "UNKNOWN",
                        teamName: "Long Team Name",
                        size: .large,
                        accessibility: .decorative
                    )
                }
                .accessibilityIdentifier("design.identity.team.fallback")
                identityCard("Course") {
                    BaggerCourseLogo(
                        courseID: "OCGC01",
                        courseName: "Ocean Course",
                        size: .large,
                        accessibility: .decorative
                    )
                }
                .accessibilityIdentifier("design.identity.course.known")
                identityCard("Course fallback") {
                    BaggerCourseLogo(
                        courseID: "UNKNOWN",
                        courseName: "Future Course",
                        size: .large,
                        accessibility: .decorative
                    )
                }
                .accessibilityIdentifier("design.identity.course.fallback")
                identityCard("Tournament") {
                    BaggerTournamentMark(year: 2026, size: .large, accessibility: .decorative)
                }
                .accessibilityIdentifier("design.identity.tournament.known")
                identityCard("Tournament fallback") {
                    BaggerTournamentMark(year: 2030, size: .large, accessibility: .decorative)
                }
                .accessibilityIdentifier("design.identity.tournament.fallback")
                identityCard("Bagger") {
                    BaggerBrandMark(size: .large, accessibility: .decorative)
                }
                .accessibilityIdentifier("design.identity.brand")
            }
        }
    }

    private func colorSwatch(_ title: String, _ color: SwiftUI.Color) -> some View {
        HStack(spacing: BaggerDesign.Space.small) {
            RoundedRectangle(cornerRadius: BaggerDesign.Radius.small, style: .continuous)
                .fill(color)
                .frame(width: 36, height: 36)
                .overlay {
                    RoundedRectangle(cornerRadius: BaggerDesign.Radius.small, style: .continuous)
                        .stroke(BaggerDesign.Color.borderDefault, lineWidth: BaggerDesign.Border.thin)
                }
                .accessibilityHidden(true)
            Text(title)
                .font(BaggerDesign.Typography.captionEmphasis)
                .foregroundStyle(BaggerDesign.Color.textPrimary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }

    private func typeSample(_ text: String, font: Font) -> some View {
        Text(text)
            .font(font)
            .foregroundStyle(BaggerDesign.Color.textPrimary)
            .fixedSize(horizontal: false, vertical: true)
    }

    private func galleryCard(_ title: String, detail: String, style: BaggerCardStyle) -> some View {
        VStack(alignment: .leading, spacing: BaggerDesign.Space.small) {
            Text(title)
                .font(BaggerDesign.Typography.cardTitle)
            Text(detail)
                .font(BaggerDesign.Typography.body)
                .foregroundStyle(BaggerDesign.Color.textSecondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .baggerCard(style: style)
    }

    private func status(_ kind: BaggerStatusKind) -> some View {
        BaggerStatusBadge(kind: kind)
            .accessibilityIdentifier("design.status.\(kind.rawValue)")
    }

    private func identityCard<Content: View>(
        _ title: String,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(spacing: BaggerDesign.Space.small) {
            content()
            Text(title)
                .font(BaggerDesign.Typography.captionEmphasis)
                .foregroundStyle(BaggerDesign.Color.textPrimary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity)
        .padding(BaggerDesign.Space.medium)
        .background(
            BaggerDesign.Color.surfaceMuted,
            in: RoundedRectangle(cornerRadius: BaggerDesign.Radius.card, style: .continuous)
        )
        .accessibilityElement(children: .combine)
    }
}

private struct GallerySection<Content: View>: View {
    let title: String
    let identifier: String
    private let content: Content

    init(
        title: String,
        identifier: String,
        @ViewBuilder content: () -> Content
    ) {
        self.title = title
        self.identifier = identifier
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: BaggerDesign.Space.headingToContent) {
            BaggerSectionHeading(title, eyebrow: "FOUNDATION")
            content
        }
        .accessibilityIdentifier(identifier)
    }
}
#endif
