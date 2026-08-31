import SwiftUI

struct FullScheduleRepositoryView: View {
    @ObservedObject private var repository: MobileReadRepository<MobileScheduleResponse>

    init(repository: MobileReadRepository<MobileScheduleResponse>) {
        _repository = ObservedObject(wrappedValue: repository)
    }

    var body: some View {
        FullScheduleStateView(
            state: repository.state,
            now: Date(),
            onRefresh: { await repository.refresh() }
        )
        .task {
            await repository.refreshIfStale(olderThan: 5 * 60)
        }
    }
}

struct FullScheduleFixtureView: View {
    let state: MobileReadState<MobileScheduleData>
    let now: Date

    var body: some View {
        FullScheduleStateView(state: state, now: now, onRefresh: {})
    }
}

private struct FullScheduleStateView: View {
    let state: MobileReadState<MobileScheduleData>
    let now: Date
    let onRefresh: @MainActor @Sendable () async -> Void

    var body: some View {
        Group {
            if let data = state.value {
                FullScheduleScreen(
                    presentation: FullSchedulePresenter.make(data: data, now: now),
                    freshness: state.freshness,
                    isRefreshing: state.isRefreshing,
                    onRefresh: onRefresh
                )
            } else if state.freshness == .empty || state.freshness == .refreshing {
                FullScheduleLoadingView()
            } else {
                FullScheduleUnavailableView(onRetry: onRefresh)
            }
        }
        .background(BaggerPalette.canvas.ignoresSafeArea())
        .navigationTitle("Schedule")
        .navigationBarTitleDisplayMode(.inline)
    }
}

struct FullScheduleScreen: View {
    let presentation: FullSchedulePresentation
    let freshness: MobileReadFreshness
    let isRefreshing: Bool
    let onRefresh: @MainActor @Sendable () async -> Void

    private var nextEventID: String? {
        presentation.days
            .lazy
            .flatMap(\.events)
            .first { $0.state == .upcoming }?
            .id
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: BaggerLayout.sectionSpacing, pinnedViews: [.sectionHeaders]) {
                scheduleHeader

                if let freshnessMessage {
                    FullScheduleFreshnessBanner(
                        message: freshnessMessage,
                        isOffline: freshness == .offline
                    )
                }

                if presentation.isEmpty {
                    FullScheduleEmptyView()
                } else {
                    ForEach(presentation.days) { day in
                        Section {
                            VStack(spacing: 0) {
                                ForEach(Array(day.events.enumerated()), id: \.element.id) { index, event in
                                    FullScheduleEventRow(
                                        event: event,
                                        isNext: event.id == nextEventID
                                    )
                                    if index < day.events.count - 1 {
                                        Divider().overlay(BaggerPalette.warmBorder)
                                    }
                                }
                            }
                            .baggerCard()
                        } header: {
                            Text(day.dateHeading)
                                .font(.caption.weight(.black))
                                .tracking(0.8)
                                .foregroundStyle(BaggerPalette.goldText)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(.horizontal, 2)
                                .padding(.vertical, 8)
                                .background(BaggerPalette.canvas.opacity(0.97))
                                .accessibilityLabel(day.dateAccessibilityText)
                                .accessibilityAddTraits(.isHeader)
                                .accessibilityIdentifier("schedule.day.\(day.id)")
                        }
                    }
                }

                if isRefreshing {
                    HStack(spacing: 8) {
                        ProgressView()
                        Text("Refreshing Schedule")
                            .font(.footnote.weight(.semibold))
                    }
                    .foregroundStyle(BaggerPalette.muted)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
                    .accessibilityElement(children: .combine)
                }
            }
            .padding(.horizontal, BaggerLayout.pageInset)
            .padding(.top, 12)
            .padding(.bottom, 28)
        }
        .background(BaggerPalette.canvas.ignoresSafeArea())
        .refreshable(action: onRefresh)
        .accessibilityIdentifier("schedule.screen")
    }

    private var scheduleHeader: some View {
        VStack(alignment: .leading, spacing: 5) {
            BaggerEyebrow(text: "Tournament")
            Text("Full Schedule")
                .font(.system(.title2, design: .serif, weight: .bold))
                .foregroundStyle(BaggerPalette.ink)
                .fixedSize(horizontal: false, vertical: true)
            Text("Times are shown in the tournament’s local time.")
                .font(.subheadline)
                .foregroundStyle(BaggerPalette.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal, 2)
        .accessibilityElement(children: .combine)
    }

    private var freshnessMessage: String? {
        switch freshness {
        case .cached, .refreshing:
            "Showing the saved Schedule while Bagger refreshes."
        case .stale, .failed:
            "Showing the last saved Schedule. Refresh is temporarily unavailable."
        case .offline:
            "Offline — showing the last saved Schedule."
        case .empty, .fresh:
            nil
        }
    }
}

private struct FullScheduleEventRow: View {
    let event: FullScheduleEventPresentation
    let isNext: Bool
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        Group {
            if dynamicTypeSize.isAccessibilitySize {
                VStack(alignment: .leading, spacing: 9) {
                    eventIcon
                    eventDetails
                }
            } else {
                HStack(alignment: .top, spacing: 12) {
                    eventIcon
                    eventDetails
                    Spacer(minLength: 0)
                }
            }
        }
        .padding(.vertical, 10)
        .opacity(event.state == .past ? 0.72 : 1)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityLabel)
        .accessibilityIdentifier("schedule.event.\(event.id)")
    }

    private var eventIcon: some View {
        Image(systemName: symbol)
            .font(.headline)
            .foregroundStyle(iconColor)
            .frame(width: 36, height: 36)
            .background(BaggerPalette.cream, in: Circle())
            .accessibilityHidden(true)
    }

    private var eventDetails: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(event.title)
                    .font(.headline)
                    .foregroundStyle(BaggerPalette.ink)
                    .fixedSize(horizontal: false, vertical: true)
                if let statusLabel {
                    Text(statusLabel)
                        .font(.caption2.weight(.black))
                        .foregroundStyle(statusColor)
                        .fixedSize()
                }
            }
            if let timeText = event.timeText {
                Text(timeText)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(BaggerPalette.actionGreen)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if let subtitle = event.subtitle, !subtitle.isEmpty {
                Text(subtitle)
                    .font(.subheadline)
                    .foregroundStyle(BaggerPalette.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if let location = event.location, !location.isEmpty {
                Label(location, systemImage: "mappin")
                    .font(.footnote)
                    .foregroundStyle(BaggerPalette.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if let type = event.type, !type.isEmpty {
                Text(type)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(BaggerPalette.goldText)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private var statusLabel: String? {
        if event.state == .current { return "NOW" }
        if isNext { return "NEXT" }
        if event.state == .past { return "ENDED" }
        return nil
    }

    private var statusColor: Color {
        event.state == .current ? BaggerPalette.liveRed : BaggerPalette.goldText
    }

    private var iconColor: Color {
        event.state == .current ? BaggerPalette.liveRed : BaggerPalette.actionGreen
    }

    private var accessibilityLabel: String {
        [statusLabel?.capitalized, event.accessibilityLabel]
            .compactMap { $0 }
            .joined(separator: ", ")
    }

    private var symbol: String {
        switch event.type?.lowercased() {
        case "golf", "round", "tee-time", "tee_time": "flag.fill"
        case "meal", "breakfast", "lunch", "dinner": "fork.knife"
        case "awards", "ceremony": "trophy.fill"
        case "social", "meeting": "person.3.fill"
        default: "calendar"
        }
    }
}

private struct FullScheduleFreshnessBanner: View {
    let message: String
    let isOffline: Bool

    var body: some View {
        Label(message, systemImage: isOffline ? "wifi.slash" : "clock.arrow.circlepath")
            .font(.footnote.weight(.semibold))
            .foregroundStyle(BaggerPalette.deepEvergreen)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 13)
            .padding(.vertical, 10)
            .background(BaggerPalette.scoreGold.opacity(0.28), in: RoundedRectangle(cornerRadius: 12))
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier(isOffline ? "schedule.offlineStatus" : "schedule.freshnessStatus")
    }
}

private struct FullScheduleLoadingView: View {
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: BaggerLayout.sectionSpacing) {
                BaggerSectionHeading("Full Schedule", eyebrow: "Tournament")
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
        }
        .accessibilityLabel("Loading Schedule")
        .accessibilityIdentifier("schedule.loading")
    }
}

private struct FullScheduleEmptyView: View {
    var body: some View {
        Label("No schedule events are published yet.", systemImage: "calendar.badge.exclamationmark")
            .font(.headline)
            .foregroundStyle(BaggerPalette.ink)
            .frame(maxWidth: .infinity, alignment: .leading)
            .baggerCard()
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("schedule.empty")
    }
}

private struct FullScheduleUnavailableView: View {
    let onRetry: @MainActor @Sendable () async -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("Schedule isn’t available right now", systemImage: "wifi.exclamationmark")
                .font(.headline)
                .foregroundStyle(BaggerPalette.ink)
            Text("Bagger could not load the Schedule and there is no saved update on this device.")
                .font(.subheadline)
                .foregroundStyle(BaggerPalette.muted)
                .fixedSize(horizontal: false, vertical: true)
            Button("Try Again") { Task { await onRetry() } }
                .buttonStyle(.borderedProminent)
                .tint(BaggerPalette.actionGreen)
                .controlSize(.large)
                .accessibilityIdentifier("schedule.retry")
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .padding(BaggerLayout.pageInset)
        .accessibilityIdentifier("schedule.unavailable")
    }
}
