import SwiftUI

/// Shared visual decisions for the participant app.
///
/// Product views should select semantic roles from this namespace instead of
/// inventing colors, type sizes, spacing, or elevation. These values are
/// presentation-only and must never encode tournament or scoring authority.
enum BaggerDesign {
    enum Color {
        static let backgroundPrimary = SwiftUI.Color(red: 246 / 255, green: 243 / 255, blue: 235 / 255)
        static let backgroundSecondary = SwiftUI.Color(red: 245 / 255, green: 240 / 255, blue: 230 / 255)

        static let surfacePrimary = SwiftUI.Color(red: 1, green: 253 / 255, blue: 248 / 255)
        static let surfaceElevated = SwiftUI.Color.white
        static let surfaceMuted = SwiftUI.Color(red: 245 / 255, green: 240 / 255, blue: 230 / 255)
        static let surfaceBrand = SwiftUI.Color(red: 6 / 255, green: 31 / 255, blue: 24 / 255)

        static let textPrimary = SwiftUI.Color(red: 23 / 255, green: 52 / 255, blue: 43 / 255)
        static let textSecondary = SwiftUI.Color(red: 85 / 255, green: 101 / 255, blue: 94 / 255)
        static let textMuted = SwiftUI.Color(red: 109 / 255, green: 116 / 255, blue: 111 / 255)
        static let textInverse = SwiftUI.Color.white

        static let brandEvergreen = SwiftUI.Color(red: 8 / 255, green: 63 / 255, blue: 49 / 255)
        static let brandEvergreenDeep = SwiftUI.Color(red: 6 / 255, green: 31 / 255, blue: 24 / 255)
        static let brandAction = SwiftUI.Color(red: 11 / 255, green: 68 / 255, blue: 53 / 255)
        static let brandEvergreenSoft = SwiftUI.Color(red: 23 / 255, green: 75 / 255, blue: 59 / 255)
        static let brandGold = SwiftUI.Color(red: 212 / 255, green: 177 / 255, blue: 95 / 255)
        static let brandGoldMuted = SwiftUI.Color(red: 241 / 255, green: 212 / 255, blue: 126 / 255)
        /// Accessible ordinary-size gold text on warm paper.
        static let brandGoldText = SwiftUI.Color(red: 121 / 255, green: 88 / 255, blue: 15 / 255)

        static let borderDefault = SwiftUI.Color(red: 222 / 255, green: 212 / 255, blue: 193 / 255)
        static let borderStrong = SwiftUI.Color(red: 216 / 255, green: 198 / 255, blue: 157 / 255)

        static let statusLive = SwiftUI.Color(red: 200 / 255, green: 50 / 255, blue: 57 / 255)
        static let statusSuccess = brandAction
        static let statusWarning = brandGoldText
        static let statusOffline = SwiftUI.Color(red: 103 / 255, green: 82 / 255, blue: 46 / 255)
        static let statusError = SwiftUI.Color(red: 166 / 255, green: 65 / 255, blue: 63 / 255)

        static let statusSuccessBackground = SwiftUI.Color(red: 231 / 255, green: 240 / 255, blue: 234 / 255)
        static let statusWarningBackground = SwiftUI.Color(red: 1, green: 248 / 255, blue: 229 / 255)
        static let statusOfflineBackground = SwiftUI.Color(red: 247 / 255, green: 237 / 255, blue: 211 / 255)
        static let statusErrorBackground = SwiftUI.Color(red: 250 / 255, green: 232 / 255, blue: 230 / 255)
        static let statusNeutralBackground = SwiftUI.Color(red: 239 / 255, green: 238 / 255, blue: 233 / 255)
    }

    enum Typography {
        static let displayTournament = Font.system(.largeTitle, design: .serif, weight: .bold)
        static let displaySection = Font.system(.title, design: .serif, weight: .bold)
        static let titlePrimary = Font.system(.title2, design: .serif, weight: .bold)
        static let titleSecondary = Font.system(.title3, design: .serif, weight: .semibold)
        static let cardTitle = Font.headline
        static let body = Font.body
        static let bodyEmphasis = Font.body.weight(.semibold)
        static let caption = Font.footnote
        static let captionEmphasis = Font.footnote.weight(.semibold)
        static let eyebrow = Font.caption2.weight(.black)
        static let statLarge = Font.system(.title, design: .rounded, weight: .bold).monospacedDigit()
        static let statMedium = Font.system(.title3, design: .rounded, weight: .bold).monospacedDigit()
        static let numericCompact = Font.subheadline.weight(.semibold).monospacedDigit()
        static let button = Font.headline
        static let tab = Font.caption.weight(.semibold)
    }

    enum Space {
        static let hairline: CGFloat = 2
        static let xSmall: CGFloat = 4
        static let small: CGFloat = 8
        static let medium: CGFloat = 12
        static let large: CGFloat = 16
        static let xLarge: CGFloat = 20
        static let xxLarge: CGFloat = 24
        static let xxxLarge: CGFloat = 32
        static let hero: CGFloat = 40

        static let screenInset = large
        static let sectionGap = large
        static let headingToContent = medium
        static let cardGap = medium
        static let rowGap = small
        static let cardPadding = large
        static let compactCardPadding = medium
        static let editorialCardPadding = xxLarge
    }

    enum Radius {
        static let small: CGFloat = 8
        static let control: CGFloat = 12
        static let card: CGFloat = 18
        static let hero: CGFloat = 24
        static let pill: CGFloat = 1_000
    }

    enum Border {
        static let thin: CGFloat = 1
        static let strong: CGFloat = 2
    }

    struct ShadowStyle: Equatable, Sendable {
        let opacity: Double
        let radius: CGFloat
        let x: CGFloat
        let y: CGFloat
    }

    enum Shadow {
        static let none = ShadowStyle(opacity: 0, radius: 0, x: 0, y: 0)
        static let subtle = ShadowStyle(opacity: 0.055, radius: 12, x: 0, y: 6)
        static let raised = ShadowStyle(opacity: 0.14, radius: 24, x: 0, y: 12)
    }

    enum Size {
        static let minimumTouchTarget: CGFloat = 44
        static let scoreTouchTarget: CGFloat = 56
        static let iconSmall: CGFloat = 14
        static let iconMedium: CGFloat = 20
        static let iconLarge: CGFloat = 28

        enum Avatar {
            static let small: CGFloat = 32
            static let medium: CGFloat = 44
            static let large: CGFloat = 64
            static let hero: CGFloat = 96
        }

        enum Logo {
            static let small: CGFloat = 32
            static let medium: CGFloat = 44
            static let large: CGFloat = 64
            static let hero: CGFloat = 96
        }
    }

    enum Motion {
        static let quick: Double = 0.15
        static let standard: Double = 0.22
    }
}

// MARK: - Compatibility bridge

/// Existing product screens retain these names until their dedicated polish
/// steps. All values now resolve through the semantic foundation above.
enum BaggerPalette {
    static let canvas = BaggerDesign.Color.backgroundPrimary
    static let paper = BaggerDesign.Color.surfacePrimary
    static let cream = BaggerDesign.Color.backgroundSecondary
    static let evergreen = BaggerDesign.Color.brandEvergreen
    static let deepEvergreen = BaggerDesign.Color.brandEvergreenDeep
    static let actionGreen = BaggerDesign.Color.brandAction
    static let softGreen = BaggerDesign.Color.brandEvergreenSoft
    static let ink = BaggerDesign.Color.textPrimary
    static let muted = BaggerDesign.Color.textSecondary
    // Preserve certified product-screen rendering until each screen's polish step.
    static let gold = SwiftUI.Color(red: 181 / 255, green: 138 / 255, blue: 37 / 255)
    static let goldText = BaggerDesign.Color.brandGoldText
    static let scoreGold = BaggerDesign.Color.brandGoldMuted
    static let warmBorder = BaggerDesign.Color.borderDefault
    static let matchBorder = BaggerDesign.Color.borderStrong
    static let liveRed = BaggerDesign.Color.statusLive
}

enum BaggerLayout {
    // Preserve the established 14-point screen rhythm for certified screens.
    static let pageInset: CGFloat = 14
    static let sectionSpacing: CGFloat = 14
    static let cardRadius = BaggerDesign.Radius.card
    static let cardPadding = BaggerDesign.Space.cardPadding
}

enum BaggerCardStyle: Equatable, Sendable {
    case standard
    case muted
    case selected
    case hero

    fileprivate var background: SwiftUI.Color {
        switch self {
        case .standard, .selected: BaggerDesign.Color.surfacePrimary
        case .muted: BaggerDesign.Color.surfaceMuted
        case .hero: BaggerDesign.Color.surfaceBrand
        }
    }

    fileprivate var border: SwiftUI.Color {
        switch self {
        case .standard, .muted: BaggerDesign.Color.borderDefault
        case .selected: BaggerDesign.Color.brandGold
        case .hero: BaggerDesign.Color.borderStrong
        }
    }

    fileprivate var lineWidth: CGFloat {
        self == .selected ? BaggerDesign.Border.strong : BaggerDesign.Border.thin
    }

    fileprivate var radius: CGFloat {
        self == .hero ? BaggerDesign.Radius.hero : BaggerDesign.Radius.card
    }

    fileprivate var shadow: BaggerDesign.ShadowStyle {
        self == .hero ? BaggerDesign.Shadow.raised : BaggerDesign.Shadow.subtle
    }
}

struct BaggerCardModifier: ViewModifier {
    let style: BaggerCardStyle
    let borderOverride: SwiftUI.Color?
    let backgroundOverride: SwiftUI.Color?

    func body(content: Content) -> some View {
        let shadow = style.shadow
        content
            .padding(BaggerDesign.Space.cardPadding)
            .background(backgroundOverride ?? style.background)
            .clipShape(RoundedRectangle(cornerRadius: style.radius, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: style.radius, style: .continuous)
                    .stroke(borderOverride ?? style.border, lineWidth: style.lineWidth)
            }
            .shadow(
                color: BaggerDesign.Color.brandEvergreen.opacity(shadow.opacity),
                radius: shadow.radius,
                x: shadow.x,
                y: shadow.y
            )
    }
}

extension View {
    func baggerCard(
        border: SwiftUI.Color? = nil,
        background: SwiftUI.Color? = nil,
        style: BaggerCardStyle = .standard
    ) -> some View {
        modifier(
            BaggerCardModifier(
                style: style,
                borderOverride: border,
                backgroundOverride: background
            )
        )
    }

    func baggerScreenBackground() -> some View {
        background(BaggerDesign.Color.backgroundPrimary.ignoresSafeArea())
    }
}

struct BaggerEyebrow: View {
    let text: String

    var body: some View {
        Text(text.uppercased())
            .font(BaggerDesign.Typography.eyebrow)
            .foregroundStyle(BaggerDesign.Color.brandGoldText)
            .fixedSize(horizontal: false, vertical: true)
            .lineLimit(nil)
            .padding(.horizontal, BaggerDesign.Space.hairline)
    }
}

struct BaggerSectionHeading: View {
    let eyebrow: String?
    let title: String

    init(_ title: String, eyebrow: String? = nil) {
        self.title = title
        self.eyebrow = eyebrow
    }

    var body: some View {
        VStack(alignment: .leading, spacing: BaggerDesign.Space.xSmall) {
            if let eyebrow {
                BaggerEyebrow(text: eyebrow)
            }
            Text(title)
                .font(BaggerDesign.Typography.titlePrimary)
                .foregroundStyle(BaggerDesign.Color.textPrimary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
    }
}

struct BaggerPreviewPill: View {
    var body: some View {
        Text("PREVIEW")
            .font(BaggerDesign.Typography.eyebrow)
            .tracking(1.2)
            .foregroundStyle(BaggerDesign.Color.brandEvergreenDeep)
            .padding(.horizontal, BaggerDesign.Space.medium)
            .padding(.vertical, BaggerDesign.Space.small)
            .background(BaggerDesign.Color.brandGoldMuted, in: Capsule())
            .overlay {
                Capsule().stroke(BaggerDesign.Color.brandGold, lineWidth: BaggerDesign.Border.thin)
            }
            .fixedSize()
            .accessibilityLabel("Preview environment")
    }
}
