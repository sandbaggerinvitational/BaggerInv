import SwiftUI

struct MoreFreshnessBannerView: View {
    let productName: String
    let freshness: MobileReadFreshness
    let identifierPrefix: String

    var body: some View {
        if let message {
            BaggerFreshnessBanner(kind: bannerKind, message: message)
                .accessibilityElement(children: .combine)
                .accessibilityIdentifier("\(identifierPrefix).freshness")
        }
    }

    private var bannerKind: BaggerFreshnessKind {
        switch freshness {
        case .cached: .cached
        case .refreshing: .refreshing
        case .stale, .failed: .stale
        case .offline: .offline
        case .empty, .fresh: .cached
        }
    }

    private var message: String? {
        switch freshness {
        case .cached, .refreshing:
            "Showing saved \(productName) while Bagger refreshes."
        case .stale, .failed:
            "Showing the last saved \(productName). Refresh is temporarily unavailable."
        case .offline:
            "Offline — showing the last saved \(productName)."
        case .empty, .fresh:
            nil
        }
    }
}

struct MoreLoadingStateView: View {
    let title: String
    let identifier: String

    var body: some View {
        BaggerLoadingState(title: title, lineCount: 6)
        .padding(BaggerLayout.pageInset)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .baggerScreenBackground()
        .accessibilityLabel("Loading \(title)")
        .accessibilityIdentifier(identifier)
    }
}

struct MoreUnavailableStateView: View {
    let title: String
    let message: String
    let identifierPrefix: String
    let onRetry: @MainActor @Sendable () async -> Void

    var body: some View {
        BaggerErrorState(
            title: "\(title) isn’t available right now",
            message: message,
            retryIdentifier: "\(identifierPrefix).retry",
            onRetry: { Task { await onRetry() } }
        )
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .padding(BaggerLayout.pageInset)
        .baggerScreenBackground()
        .accessibilityIdentifier("\(identifierPrefix).unavailable")
    }
}

struct MoreEmptyStateView: View {
    let title: String
    let systemImage: String
    let identifier: String

    var body: some View {
        BaggerEmptyState(title: title, systemImage: systemImage)
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier(identifier)
    }
}

struct MoreMetricView: View {
    let label: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label.uppercased())
                .font(.caption2.weight(.black))
                .foregroundStyle(BaggerPalette.goldText)
            Text(value)
                .font(.title3.weight(.bold))
                .foregroundStyle(BaggerPalette.ink)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(label), \(value)")
    }
}

struct MoreTextCardView: View {
    let title: String?
    let bodyText: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let title, !title.isEmpty {
                Text(title)
                    .font(.headline)
                    .foregroundStyle(BaggerPalette.ink)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Text(bodyText)
                .font(.body)
                .foregroundStyle(BaggerPalette.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .baggerCard()
        .accessibilityElement(children: .combine)
    }
}
