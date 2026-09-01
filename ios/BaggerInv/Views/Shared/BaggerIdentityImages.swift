import SwiftUI

enum BaggerImageAccessibility: Equatable, Sendable {
    case decorative
    case identity(label: String)
}

enum BaggerIdentitySize: CaseIterable, Sendable {
    case small
    case medium
    case large
    case hero

    var dimension: CGFloat {
        switch self {
        case .small: BaggerDesign.Size.Avatar.small
        case .medium: BaggerDesign.Size.Avatar.medium
        case .large: BaggerDesign.Size.Avatar.large
        case .hero: BaggerDesign.Size.Avatar.hero
        }
    }
}

enum BaggerLogoSize: CaseIterable, Sendable {
    case small
    case medium
    case large
    case hero

    var dimension: CGFloat {
        switch self {
        case .small: BaggerDesign.Size.Logo.small
        case .medium: BaggerDesign.Size.Logo.medium
        case .large: BaggerDesign.Size.Logo.large
        case .hero: BaggerDesign.Size.Logo.hero
        }
    }

    fileprivate var inset: CGFloat {
        switch self {
        case .small: 5
        case .medium: 7
        case .large: 9
        case .hero: 12
        }
    }
}

enum BaggerInitials {
    static func make(from displayName: String) -> String {
        let words = displayName
            .split(whereSeparator: { $0.isWhitespace })
            .filter { !$0.isEmpty }

        guard let first = words.first else { return "?" }
        if words.count == 1 {
            return String(first.prefix(2)).uppercased()
        }

        let last = words[words.count - 1]
        return "\(first.prefix(1))\(last.prefix(1))".uppercased()
    }
}

struct BaggerPlayerAvatar: View {
    let playerID: String
    let assetKey: String?
    let displayName: String
    let size: BaggerIdentitySize
    let accessibility: BaggerImageAccessibility

    init(
        playerID: String,
        assetKey: String? = nil,
        displayName: String,
        size: BaggerIdentitySize = .medium,
        accessibility: BaggerImageAccessibility
    ) {
        self.playerID = playerID
        self.assetKey = assetKey
        self.displayName = displayName
        self.size = size
        self.accessibility = accessibility
    }

    var body: some View {
        let lookup = BaggerAsset.player(playerID: playerID, assetKey: assetKey)
        Group {
            if let reference = lookup.reference {
                Image(reference.catalogName)
                    .resizable()
                    .scaledToFill()
            } else {
                Text(BaggerInitials.make(from: displayName))
                    .font(avatarFont)
                    .foregroundStyle(BaggerDesign.Color.brandEvergreenDeep)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(BaggerDesign.Color.statusWarningBackground)
            }
        }
        .frame(width: size.dimension, height: size.dimension)
        .clipShape(Circle())
        .overlay {
            Circle().stroke(BaggerDesign.Color.borderStrong, lineWidth: BaggerDesign.Border.thin)
        }
        .modifier(BaggerImageAccessibilityModifier(accessibility: accessibility))
    }

    private var avatarFont: Font {
        switch size {
        case .small: .caption.weight(.bold)
        case .medium: .subheadline.weight(.bold)
        case .large: .title3.weight(.bold)
        case .hero: .title.weight(.bold)
        }
    }
}

struct BaggerTeamLogo: View {
    let teamID: String
    let assetKey: String?
    let teamName: String
    let size: BaggerLogoSize
    let accessibility: BaggerImageAccessibility

    init(
        teamID: String,
        assetKey: String? = nil,
        teamName: String,
        size: BaggerLogoSize = .medium,
        accessibility: BaggerImageAccessibility
    ) {
        self.teamID = teamID
        self.assetKey = assetKey
        self.teamName = teamName
        self.size = size
        self.accessibility = accessibility
    }

    var body: some View {
        logoPlate(
            lookup: BaggerAsset.team(teamID: teamID, assetKey: assetKey),
            fallbackText: BaggerInitials.make(from: teamName),
            fallbackSymbol: nil
        )
        .modifier(BaggerImageAccessibilityModifier(accessibility: accessibility))
    }

    private func logoPlate(
        lookup: BaggerAssetLookup,
        fallbackText: String,
        fallbackSymbol: String?
    ) -> some View {
        BaggerLogoPlate(
            lookup: lookup,
            fallbackText: fallbackText,
            fallbackSymbol: fallbackSymbol,
            size: size
        )
    }
}

struct BaggerCourseLogo: View {
    let courseID: String
    let assetKey: String?
    let courseName: String
    let size: BaggerLogoSize
    let accessibility: BaggerImageAccessibility

    init(
        courseID: String,
        assetKey: String? = nil,
        courseName: String,
        size: BaggerLogoSize = .medium,
        accessibility: BaggerImageAccessibility
    ) {
        self.courseID = courseID
        self.assetKey = assetKey
        self.courseName = courseName
        self.size = size
        self.accessibility = accessibility
    }

    var body: some View {
        BaggerLogoPlate(
            lookup: BaggerAsset.courseLogo(courseID: courseID, assetKey: assetKey),
            fallbackText: BaggerInitials.make(from: courseName),
            fallbackSymbol: "flag.fill",
            size: size
        )
        .modifier(BaggerImageAccessibilityModifier(accessibility: accessibility))
    }
}

struct BaggerTournamentMark: View {
    let year: Int
    let assetKey: String?
    let size: BaggerLogoSize
    let accessibility: BaggerImageAccessibility

    init(
        year: Int,
        assetKey: String? = nil,
        size: BaggerLogoSize = .large,
        accessibility: BaggerImageAccessibility
    ) {
        self.year = year
        self.assetKey = assetKey
        self.size = size
        self.accessibility = accessibility
    }

    var body: some View {
        BaggerLogoPlate(
            lookup: BaggerAsset.tournamentLogo(year: year, assetKey: assetKey),
            fallbackText: String(year),
            fallbackSymbol: nil,
            size: size
        )
        .modifier(BaggerImageAccessibilityModifier(accessibility: accessibility))
    }
}

struct BaggerBrandMark: View {
    let size: BaggerLogoSize
    let accessibility: BaggerImageAccessibility

    init(
        size: BaggerLogoSize = .large,
        accessibility: BaggerImageAccessibility
    ) {
        self.size = size
        self.accessibility = accessibility
    }

    var body: some View {
        Image(BaggerAsset.primaryBrand.catalogName)
            .resizable()
            .scaledToFit()
            .padding(size.inset)
            .frame(width: size.dimension, height: size.dimension)
            .background(BaggerDesign.Color.surfacePrimary, in: Circle())
            .overlay {
                Circle().stroke(BaggerDesign.Color.borderStrong, lineWidth: BaggerDesign.Border.thin)
            }
            .modifier(BaggerImageAccessibilityModifier(accessibility: accessibility))
    }
}

private struct BaggerLogoPlate: View {
    let lookup: BaggerAssetLookup
    let fallbackText: String
    let fallbackSymbol: String?
    let size: BaggerLogoSize

    var body: some View {
        ZStack {
            Circle().fill(BaggerDesign.Color.surfacePrimary)
            if let reference = lookup.reference {
                Image(reference.catalogName)
                    .resizable()
                    .scaledToFit()
                    .padding(size.inset)
            } else if case .primaryBrand = lookup.fallback {
                Image(BaggerAsset.primaryBrand.catalogName)
                    .resizable()
                    .scaledToFit()
                    .padding(size.inset)
            } else if let fallbackSymbol {
                Image(systemName: fallbackSymbol)
                    .font(.system(size: size.dimension * 0.34, weight: .semibold))
                    .foregroundStyle(BaggerDesign.Color.brandEvergreen)
            } else {
                Text(fallbackText)
                    .font(.system(size: size.dimension * 0.26, weight: .bold, design: .rounded))
                    .foregroundStyle(BaggerDesign.Color.brandEvergreenDeep)
                    .minimumScaleFactor(0.55)
                    .lineLimit(1)
                    .padding(BaggerDesign.Space.xSmall)
            }
        }
        .frame(width: size.dimension, height: size.dimension)
        .clipShape(Circle())
        .overlay {
            Circle().stroke(BaggerDesign.Color.borderStrong, lineWidth: BaggerDesign.Border.thin)
        }
    }
}

private struct BaggerImageAccessibilityModifier: ViewModifier {
    let accessibility: BaggerImageAccessibility

    @ViewBuilder
    func body(content: Content) -> some View {
        switch accessibility {
        case .decorative:
            content.accessibilityHidden(true)
        case .identity(let label):
            content
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(label)
                .accessibilityAddTraits(.isImage)
        }
    }
}
