import SwiftUI

struct DataFoundationDiagnosticView: View {
    @ObservedObject private var today: MobileReadRepository<MobileTodayResponse>
    @ObservedObject private var matches: MobileReadRepository<MobileMatchesResponse>
    @ObservedObject private var leaders: MobileReadRepository<MobileLeadersResponse>
    @ObservedObject private var netSkins: MobileReadRepository<MobileNetSkinsResponse>
    @ObservedObject private var calcutta: MobileReadRepository<MobileCalcuttaResponse>
    @ObservedObject private var schedule: MobileReadRepository<MobileScheduleResponse>

    private let coordinator: TournamentDataCoordinator

    init(coordinator: TournamentDataCoordinator) {
        self.coordinator = coordinator
        _today = ObservedObject(wrappedValue: coordinator.today)
        _matches = ObservedObject(wrappedValue: coordinator.matches)
        _leaders = ObservedObject(wrappedValue: coordinator.leaders)
        _netSkins = ObservedObject(wrappedValue: coordinator.netSkins)
        _calcutta = ObservedObject(wrappedValue: coordinator.calcutta)
        _schedule = ObservedObject(wrappedValue: coordinator.schedule)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("DATA FOUNDATION")
                .font(.caption.weight(.bold))
                .foregroundStyle(.secondary)

            diagnosticRow(label: "Today", state: today.state)
            diagnosticRow(label: "Matches", state: matches.state)
            diagnosticRow(label: "Leaders", state: leaders.state)
            diagnosticRow(label: "Net Skins", state: netSkins.state)
            diagnosticRow(label: "Calcutta", state: calcutta.state)
            diagnosticRow(label: "Schedule", state: schedule.state)

            if let lastValidated {
                Text("Last validated \(lastValidated.formatted(date: .omitted, time: .shortened))")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Button("Refresh All") {
                Task { await coordinator.refreshAll() }
            }
            .buttonStyle(.bordered)
            .frame(maxWidth: .infinity)
        }
        .accessibilityElement(children: .contain)
    }

    private var lastValidated: Date? {
        [
            today.state.validatedAt,
            matches.state.validatedAt,
            leaders.state.validatedAt,
            netSkins.state.validatedAt,
            calcutta.state.validatedAt,
            schedule.state.validatedAt,
        ].compactMap { $0 }.max()
    }

    private func diagnosticRow<Value>(
        label: String,
        state: MobileReadState<Value>
    ) -> some View where Value: Equatable & Sendable {
        HStack {
            Text(label)
            Spacer()
            if state.isRefreshing {
                ProgressView()
                    .controlSize(.small)
                    .accessibilityLabel("Refreshing")
            }
            Text(statusLabel(for: state))
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(color(for: state))
        }
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("dataFoundation.\(label.lowercased())")
        .accessibilityValue(accessibilityValue(for: state))
    }

    private func accessibilityValue<Value>(for state: MobileReadState<Value>) -> String
    where Value: Equatable & Sendable {
        let source: String
        switch state.source {
        case .diskCache: source = "cache"
        case .network: source = "network"
        case nil: source = "none"
        }
        let serverCode = state.lastServerCode.map { "; server code \($0.rawValue)" } ?? ""
        return "\(statusLabel(for: state)); source \(source); revision \(state.revision == nil ? "missing" : "present")\(serverCode)"
    }

    private func statusLabel<Value>(for state: MobileReadState<Value>) -> String
    where Value: Equatable & Sendable {
        switch state.freshness {
        case .empty: "Waiting"
        case .cached: "Cached"
        case .refreshing: state.value == nil ? "Loading" : "Cached"
        case .fresh: "Fresh"
        case .stale: "Stale"
        case .offline: "Offline cache"
        case .failed:
            switch state.lastSafeError {
            case .contract, .cacheInconsistency: "Contract mismatch"
            case .transport: "Network unavailable"
            case .rateLimited: "Rate limited"
            case .authentication, .authorization: "Authentication required"
            case .unavailable, .cancelled, nil: "Unavailable"
            }
        }
    }

    private func color<Value>(for state: MobileReadState<Value>) -> Color
    where Value: Equatable & Sendable {
        switch state.freshness {
        case .fresh: .green
        case .cached, .refreshing: .blue
        case .stale, .offline: .orange
        case .failed: .red
        case .empty: .secondary
        }
    }
}
