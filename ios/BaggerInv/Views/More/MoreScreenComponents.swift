import SwiftUI

struct MoreFreshnessBannerView: View {
    let productName: String
    let freshness: MobileReadFreshness
    let identifierPrefix: String

    var body: some View {
        if let message {
            Label(message, systemImage: freshness == .offline ? "wifi.slash" : "clock.arrow.circlepath")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(BaggerPalette.deepEvergreen)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 13)
                .padding(.vertical, 10)
                .background(BaggerPalette.scoreGold.opacity(0.28), in: RoundedRectangle(cornerRadius: 12))
                .accessibilityElement(children: .combine)
                .accessibilityIdentifier("\(identifierPrefix).freshness")
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
        VStack(alignment: .leading, spacing: BaggerLayout.sectionSpacing) {
            BaggerSectionHeading(title)
            VStack(alignment: .leading, spacing: 12) {
                ForEach(0..<6, id: \.self) { index in
                    RoundedRectangle(cornerRadius: 5)
                        .fill(BaggerPalette.warmBorder.opacity(0.58))
                        .frame(maxWidth: index.isMultiple(of: 2) ? .infinity : 230)
                        .frame(height: index == 0 ? 20 : 14)
                }
            }
            .redacted(reason: .placeholder)
            .baggerCard()
        }
        .padding(BaggerLayout.pageInset)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(BaggerPalette.canvas.ignoresSafeArea())
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
        VStack(alignment: .leading, spacing: 12) {
            Label("\(title) isn’t available right now", systemImage: "wifi.exclamationmark")
                .font(.headline)
                .foregroundStyle(BaggerPalette.ink)
            Text(message)
                .font(.subheadline)
                .foregroundStyle(BaggerPalette.muted)
                .fixedSize(horizontal: false, vertical: true)
            Button("Try Again") { Task { await onRetry() } }
                .buttonStyle(.borderedProminent)
                .tint(BaggerPalette.actionGreen)
                .controlSize(.large)
                .accessibilityIdentifier("\(identifierPrefix).retry")
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .padding(BaggerLayout.pageInset)
        .background(BaggerPalette.canvas.ignoresSafeArea())
        .accessibilityIdentifier("\(identifierPrefix).unavailable")
    }
}

struct MoreEmptyStateView: View {
    let title: String
    let systemImage: String
    let identifier: String

    var body: some View {
        Label(title, systemImage: systemImage)
            .font(.headline)
            .foregroundStyle(BaggerPalette.ink)
            .frame(maxWidth: .infinity, alignment: .leading)
            .baggerCard()
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
