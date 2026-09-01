import SwiftUI

// MARK: - Section hierarchy

struct BaggerSectionHeader<Trailing: View>: View {
    let eyebrow: String?
    let title: String
    let subtitle: String?
    private let trailing: Trailing

    init(
        _ title: String,
        eyebrow: String? = nil,
        subtitle: String? = nil,
        @ViewBuilder trailing: () -> Trailing
    ) {
        self.eyebrow = eyebrow
        self.title = title
        self.subtitle = subtitle
        self.trailing = trailing()
    }

    var body: some View {
        ViewThatFits(in: .horizontal) {
            HStack(alignment: .firstTextBaseline, spacing: BaggerDesign.Space.medium) {
                heading
                    .fixedSize(horizontal: true, vertical: false)
                Spacer(minLength: BaggerDesign.Space.small)
                trailing
            }
            VStack(alignment: .leading, spacing: BaggerDesign.Space.small) {
                heading
                trailing
            }
        }
    }

    private var heading: some View {
        VStack(alignment: .leading, spacing: BaggerDesign.Space.xSmall) {
            if let eyebrow {
                BaggerEyebrow(text: eyebrow)
            }
            Text(title)
                .font(BaggerDesign.Typography.titlePrimary)
                .foregroundStyle(BaggerDesign.Color.textPrimary)
                .fixedSize(horizontal: false, vertical: true)
            if let subtitle {
                Text(subtitle)
                    .font(BaggerDesign.Typography.caption)
                    .foregroundStyle(BaggerDesign.Color.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
    }
}

extension BaggerSectionHeader where Trailing == EmptyView {
    init(_ title: String, eyebrow: String? = nil, subtitle: String? = nil) {
        self.init(title, eyebrow: eyebrow, subtitle: subtitle) { EmptyView() }
    }
}

// MARK: - Buttons and selectors

struct BaggerPrimaryButtonStyle: ButtonStyle {
    var expands = false
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(BaggerDesign.Typography.button)
            .foregroundStyle(BaggerDesign.Color.textInverse)
            .padding(.horizontal, BaggerDesign.Space.large)
            .frame(maxWidth: expands ? .infinity : nil)
            .frame(
                minWidth: BaggerDesign.Size.minimumTouchTarget,
                minHeight: BaggerDesign.Size.minimumTouchTarget
            )
            .background(
                isEnabled
                    ? BaggerDesign.Color.brandAction
                    : BaggerDesign.Color.textMuted,
                in: RoundedRectangle(cornerRadius: BaggerDesign.Radius.control, style: .continuous)
            )
            .opacity(configuration.isPressed ? 0.84 : 1)
            .contentShape(Rectangle())
    }
}

struct BaggerSecondaryButtonStyle: ButtonStyle {
    var expands = false
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(BaggerDesign.Typography.button)
            .foregroundStyle(
                isEnabled ? BaggerDesign.Color.brandAction : BaggerDesign.Color.textMuted
            )
            .padding(.horizontal, BaggerDesign.Space.large)
            .frame(maxWidth: expands ? .infinity : nil)
            .frame(
                minWidth: BaggerDesign.Size.minimumTouchTarget,
                minHeight: BaggerDesign.Size.minimumTouchTarget
            )
            .background(
                BaggerDesign.Color.surfacePrimary,
                in: RoundedRectangle(cornerRadius: BaggerDesign.Radius.control, style: .continuous)
            )
            .overlay {
                RoundedRectangle(cornerRadius: BaggerDesign.Radius.control, style: .continuous)
                    .stroke(
                        isEnabled ? BaggerDesign.Color.brandAction : BaggerDesign.Color.borderStrong,
                        lineWidth: BaggerDesign.Border.thin
                    )
            }
            .opacity(configuration.isPressed ? 0.76 : 1)
            .contentShape(Rectangle())
    }
}

struct BaggerTertiaryButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(BaggerDesign.Typography.button)
            .foregroundStyle(
                isEnabled ? BaggerDesign.Color.brandAction : BaggerDesign.Color.textMuted
            )
            .padding(.horizontal, BaggerDesign.Space.medium)
            .frame(
                minWidth: BaggerDesign.Size.minimumTouchTarget,
                minHeight: BaggerDesign.Size.minimumTouchTarget
            )
            .opacity(configuration.isPressed ? 0.64 : 1)
            .contentShape(Rectangle())
    }
}

struct BaggerDestructiveButtonStyle: ButtonStyle {
    var expands = false
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(BaggerDesign.Typography.button)
            .foregroundStyle(
                isEnabled ? BaggerDesign.Color.statusError : BaggerDesign.Color.textMuted
            )
            .padding(.horizontal, BaggerDesign.Space.large)
            .frame(maxWidth: expands ? .infinity : nil)
            .frame(
                minWidth: BaggerDesign.Size.minimumTouchTarget,
                minHeight: BaggerDesign.Size.minimumTouchTarget
            )
            .background(
                BaggerDesign.Color.statusErrorBackground,
                in: RoundedRectangle(cornerRadius: BaggerDesign.Radius.control, style: .continuous)
            )
            .overlay {
                RoundedRectangle(cornerRadius: BaggerDesign.Radius.control, style: .continuous)
                    .stroke(
                        isEnabled ? BaggerDesign.Color.statusError : BaggerDesign.Color.borderStrong,
                        lineWidth: BaggerDesign.Border.thin
                    )
            }
            .opacity(configuration.isPressed ? 0.76 : 1)
            .contentShape(Rectangle())
    }
}

struct BaggerSelectionPill: View {
    let title: String
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(BaggerDesign.Typography.captionEmphasis)
                .foregroundStyle(
                    isSelected ? BaggerDesign.Color.textInverse : BaggerDesign.Color.textPrimary
                )
                .padding(.horizontal, BaggerDesign.Space.large)
                .frame(
                    minWidth: BaggerDesign.Size.minimumTouchTarget,
                    minHeight: BaggerDesign.Size.minimumTouchTarget
                )
                .background(
                    isSelected
                        ? BaggerDesign.Color.brandAction
                        : BaggerDesign.Color.surfaceMuted,
                    in: Capsule()
                )
                .overlay {
                    Capsule()
                        .stroke(
                            isSelected
                                ? BaggerDesign.Color.brandAction
                                : BaggerDesign.Color.borderDefault,
                            lineWidth: BaggerDesign.Border.thin
                        )
                }
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }
}

// MARK: - Statuses and freshness

enum BaggerStatusKind: String, CaseIterable, Sendable {
    case upcoming
    case live
    case final
    case official
    case published
    case unpublished
    case projected
    case savedOnIPhone
    case editedNotSaved
    case offline
    case stale
    case unavailable
    case needsReview

    var defaultTitle: String {
        switch self {
        case .upcoming: "Upcoming"
        case .live: "Live"
        case .final: "Final"
        case .official: "Official"
        case .published: "Published"
        case .unpublished: "Unpublished"
        case .projected: "Projected"
        case .savedOnIPhone: "Saved on iPhone"
        case .editedNotSaved: "Edited · Not saved"
        case .offline: "Offline"
        case .stale: "Stale"
        case .unavailable: "Unavailable"
        case .needsReview: "Needs Review"
        }
    }

    var systemImage: String {
        switch self {
        case .upcoming: "clock"
        case .live: "dot.radiowaves.left.and.right"
        case .final: "flag.checkered"
        case .official: "checkmark.seal.fill"
        case .published: "eye.fill"
        case .unpublished: "eye.slash"
        case .projected: "chart.line.uptrend.xyaxis"
        case .savedOnIPhone: "iphone.gen3"
        case .editedNotSaved: "pencil"
        case .offline: "wifi.slash"
        case .stale: "clock.arrow.circlepath"
        case .unavailable: "exclamationmark.circle"
        case .needsReview: "exclamationmark.triangle.fill"
        }
    }

    fileprivate var tone: BaggerStatusTone {
        switch self {
        case .live: .live
        case .final, .official, .published: .success
        case .upcoming, .unpublished, .unavailable: .neutral
        case .projected, .savedOnIPhone, .editedNotSaved: .warning
        case .offline, .stale: .offline
        case .needsReview: .error
        }
    }
}

private enum BaggerStatusTone {
    case neutral
    case success
    case warning
    case offline
    case error
    case live

    var foreground: SwiftUI.Color {
        switch self {
        case .neutral: BaggerDesign.Color.textSecondary
        case .success: BaggerDesign.Color.statusSuccess
        case .warning: BaggerDesign.Color.statusWarning
        case .offline: BaggerDesign.Color.statusOffline
        case .error, .live: BaggerDesign.Color.statusError
        }
    }

    var background: SwiftUI.Color {
        switch self {
        case .neutral: BaggerDesign.Color.statusNeutralBackground
        case .success: BaggerDesign.Color.statusSuccessBackground
        case .warning: BaggerDesign.Color.statusWarningBackground
        case .offline: BaggerDesign.Color.statusOfflineBackground
        case .error, .live: BaggerDesign.Color.statusErrorBackground
        }
    }
}

struct BaggerStatusBadge: View {
    let kind: BaggerStatusKind
    var title: String?

    var body: some View {
        Label(title ?? kind.defaultTitle, systemImage: kind.systemImage)
            .font(BaggerDesign.Typography.captionEmphasis)
            .foregroundStyle(kind.tone.foreground)
            .padding(.horizontal, BaggerDesign.Space.medium)
            .padding(.vertical, BaggerDesign.Space.small)
            .background(kind.tone.background, in: Capsule())
            .overlay {
                Capsule()
                    .stroke(kind.tone.foreground.opacity(0.28), lineWidth: BaggerDesign.Border.thin)
            }
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityElement(children: .combine)
    }
}

enum BaggerFreshnessKind: Sendable {
    case cached
    case refreshing
    case stale
    case offline

    var systemImage: String {
        switch self {
        case .cached: "internaldrive"
        case .refreshing: "arrow.clockwise"
        case .stale: "clock.arrow.circlepath"
        case .offline: "wifi.slash"
        }
    }

    fileprivate var tone: BaggerStatusTone {
        switch self {
        case .cached, .refreshing: .warning
        case .stale, .offline: .offline
        }
    }
}

struct BaggerFreshnessBanner: View {
    let kind: BaggerFreshnessKind
    let message: String

    var body: some View {
        Label(message, systemImage: kind.systemImage)
            .font(BaggerDesign.Typography.captionEmphasis)
            .foregroundStyle(kind.tone.foreground)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, BaggerDesign.Space.medium)
            .padding(.vertical, BaggerDesign.Space.small)
            .background(
                kind.tone.background,
                in: RoundedRectangle(cornerRadius: BaggerDesign.Radius.control, style: .continuous)
            )
            .overlay {
                RoundedRectangle(cornerRadius: BaggerDesign.Radius.control, style: .continuous)
                    .stroke(kind.tone.foreground.opacity(0.24), lineWidth: BaggerDesign.Border.thin)
            }
            .accessibilityElement(children: .combine)
    }
}

// MARK: - Loading, empty, and error states

struct BaggerLoadingState: View {
    let title: String
    var lineCount = 5

    var body: some View {
        VStack(alignment: .leading, spacing: BaggerDesign.Space.medium) {
            BaggerSectionHeading(title)
            VStack(alignment: .leading, spacing: BaggerDesign.Space.medium) {
                ForEach(0..<max(1, lineCount), id: \.self) { index in
                    RoundedRectangle(cornerRadius: BaggerDesign.Radius.small, style: .continuous)
                        .fill(BaggerDesign.Color.borderDefault.opacity(0.58))
                        .frame(maxWidth: index.isMultiple(of: 2) ? .infinity : 230)
                        .frame(height: index == 0 ? 20 : 14)
                }
            }
            .redacted(reason: .placeholder)
            .baggerCard(style: .muted)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Loading \(title)")
    }
}

struct BaggerEmptyState: View {
    let title: String
    let message: String?
    let systemImage: String
    let actionTitle: String?
    let onAction: (() -> Void)?

    init(
        title: String,
        message: String? = nil,
        systemImage: String,
        actionTitle: String? = nil,
        onAction: (() -> Void)? = nil
    ) {
        self.title = title
        self.message = message
        self.systemImage = systemImage
        self.actionTitle = actionTitle
        self.onAction = onAction
    }

    var body: some View {
        VStack(alignment: .leading, spacing: BaggerDesign.Space.small) {
            VStack(alignment: .leading, spacing: BaggerDesign.Space.small) {
                Label(title, systemImage: systemImage)
                    .font(BaggerDesign.Typography.cardTitle)
                    .foregroundStyle(BaggerDesign.Color.textPrimary)
                if let message {
                    Text(message)
                        .font(BaggerDesign.Typography.body)
                        .foregroundStyle(BaggerDesign.Color.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .accessibilityElement(children: .combine)
            if let actionTitle, let onAction {
                Button(actionTitle, action: onAction)
                    .buttonStyle(BaggerTertiaryButtonStyle())
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .baggerCard(style: .muted)
        .accessibilityElement(children: .contain)
    }
}

struct BaggerErrorState: View {
    let title: String
    let message: String
    var retryTitle = "Try Again"
    var retryIdentifier = "bagger.error.retry"
    let onRetry: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: BaggerDesign.Space.medium) {
            Label(title, systemImage: "exclamationmark.triangle")
                .font(BaggerDesign.Typography.titleSecondary)
                .foregroundStyle(BaggerDesign.Color.textPrimary)
            Text(message)
                .font(BaggerDesign.Typography.body)
                .foregroundStyle(BaggerDesign.Color.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
            Button(retryTitle, action: onRetry)
                .buttonStyle(BaggerPrimaryButtonStyle())
                .accessibilityIdentifier(retryIdentifier)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .baggerCard()
        .accessibilityElement(children: .contain)
    }
}

// MARK: - Common rows

struct BaggerNavigationRow: View {
    let title: String
    let subtitle: String?
    let systemImage: String?

    init(title: String, subtitle: String? = nil, systemImage: String? = nil) {
        self.title = title
        self.subtitle = subtitle
        self.systemImage = systemImage
    }

    var body: some View {
        HStack(spacing: BaggerDesign.Space.medium) {
            if let systemImage {
                Image(systemName: systemImage)
                    .font(.system(size: BaggerDesign.Size.iconMedium, weight: .semibold))
                    .foregroundStyle(BaggerDesign.Color.brandGoldText)
                    .frame(width: BaggerDesign.Size.minimumTouchTarget)
                    .accessibilityHidden(true)
            }
            VStack(alignment: .leading, spacing: BaggerDesign.Space.xSmall) {
                Text(title)
                    .font(BaggerDesign.Typography.bodyEmphasis)
                    .foregroundStyle(BaggerDesign.Color.textPrimary)
                if let subtitle {
                    Text(subtitle)
                        .font(BaggerDesign.Typography.caption)
                        .foregroundStyle(BaggerDesign.Color.textSecondary)
                }
            }
            .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: BaggerDesign.Space.small)
            Image(systemName: "chevron.right")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(BaggerDesign.Color.textMuted)
                .accessibilityHidden(true)
        }
        .frame(minHeight: BaggerDesign.Size.minimumTouchTarget)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }
}

struct BaggerMetricRow: View {
    let label: String
    let value: String
    let context: String?

    init(label: String, value: String, context: String? = nil) {
        self.label = label
        self.value = value
        self.context = context
    }

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: BaggerDesign.Space.medium) {
            VStack(alignment: .leading, spacing: BaggerDesign.Space.xSmall) {
                Text(label)
                    .font(BaggerDesign.Typography.bodyEmphasis)
                    .foregroundStyle(BaggerDesign.Color.textPrimary)
                if let context {
                    Text(context)
                        .font(BaggerDesign.Typography.caption)
                        .foregroundStyle(BaggerDesign.Color.textSecondary)
                }
            }
            .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: BaggerDesign.Space.small)
            Text(value)
                .font(BaggerDesign.Typography.statMedium)
                .foregroundStyle(BaggerDesign.Color.textPrimary)
                .multilineTextAlignment(.trailing)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(minHeight: BaggerDesign.Size.minimumTouchTarget)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(label), \(value)\(context.map { ", \($0)" } ?? "")")
    }
}
