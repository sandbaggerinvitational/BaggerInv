import SwiftUI

enum BaggerAppTab: Hashable {
    case today
    case matches
    case score
    case leaders
    case more
}

struct BaggerAppShell: View {
    let participant: ParticipantSession
    let tournamentData: TournamentDataCoordinator?
    let fixturePresentation: TodayPresentation?
    let fixtureMatchesState: MobileReadState<MobileMatchesData>?
    let fixtureScoringState: ScoringCurrentState?
    let fixtureLeaders: LeadersFixturePresentation?
    let fixtureScheduleState: MobileReadState<MobileScheduleData>?
    let fixturePassportState: MobileReadState<MobilePassportData>?
    let fixtureGuideState: MobileReadState<MobileGuideData>?
    let fixtureHistoryState: MobileReadState<MobileHistoryArchiveData>?
    let fixtureHistoryDetailStates: [Int: MobileReadState<MobileHistoryDetailData>]
    let fixtureRecordsState: MobileReadState<MobileRecordsData>?
    let fixtureOddsState: MobileReadState<MobileOddsData>?
    let fixtureScheduleNow: Date
    let fixtureUsesDurableScoringQueue: Bool
    let onSignOut: () -> Void

    @State private var selection: BaggerAppTab = .today
    @State private var morePath: [MoreDestination] = []

    init(
        participant: ParticipantSession,
        tournamentData: TournamentDataCoordinator,
        onSignOut: @escaping () -> Void
    ) {
        self.participant = participant
        self.tournamentData = tournamentData
        fixturePresentation = nil
        fixtureMatchesState = nil
        fixtureScoringState = nil
        fixtureLeaders = nil
        fixtureScheduleState = nil
        fixturePassportState = nil
        fixtureGuideState = nil
        fixtureHistoryState = nil
        fixtureHistoryDetailStates = [:]
        fixtureRecordsState = nil
        fixtureOddsState = nil
        fixtureScheduleNow = Date()
        fixtureUsesDurableScoringQueue = false
        self.onSignOut = onSignOut
    }

    init(
        participant: ParticipantSession,
        fixturePresentation: TodayPresentation,
        fixtureMatchesState: MobileReadState<MobileMatchesData>,
        fixtureScoringState: ScoringCurrentState,
        fixtureLeaders: LeadersFixturePresentation? = nil,
        fixtureScheduleState: MobileReadState<MobileScheduleData>? = nil,
        fixturePassportState: MobileReadState<MobilePassportData>? = nil,
        fixtureGuideState: MobileReadState<MobileGuideData>? = nil,
        fixtureHistoryState: MobileReadState<MobileHistoryArchiveData>? = nil,
        fixtureHistoryDetailStates: [Int: MobileReadState<MobileHistoryDetailData>] = [:],
        fixtureRecordsState: MobileReadState<MobileRecordsData>? = nil,
        fixtureOddsState: MobileReadState<MobileOddsData>? = nil,
        fixtureScheduleNow: Date = Date(),
        fixtureUsesDurableScoringQueue: Bool = false,
        startsOnScore: Bool = false,
        startsOnLeaders: Bool = false,
        startsOnMore: Bool = false,
        startsOnSchedule: Bool = false,
        onSignOut: @escaping () -> Void = {}
    ) {
        self.participant = participant
        tournamentData = nil
        self.fixturePresentation = fixturePresentation
        self.fixtureMatchesState = fixtureMatchesState
        self.fixtureScoringState = fixtureScoringState
        self.fixtureLeaders = fixtureLeaders
        self.fixtureScheduleState = fixtureScheduleState
        self.fixturePassportState = fixturePassportState
        self.fixtureGuideState = fixtureGuideState
        self.fixtureHistoryState = fixtureHistoryState
        self.fixtureHistoryDetailStates = fixtureHistoryDetailStates
        self.fixtureRecordsState = fixtureRecordsState
        self.fixtureOddsState = fixtureOddsState
        self.fixtureScheduleNow = fixtureScheduleNow
        self.fixtureUsesDurableScoringQueue = fixtureUsesDurableScoringQueue
        self.onSignOut = onSignOut
        _selection = State(
            initialValue: startsOnMore || startsOnSchedule
                ? .more
                : startsOnLeaders ? .leaders : startsOnScore ? .score : .today
        )
        _morePath = State(initialValue: startsOnSchedule ? [.schedule] : [])
    }

    var body: some View {
        TabView(selection: $selection) {
            NavigationStack {
                todayContent
                    .baggerNavigationChrome(
                        title: "Today",
                        participant: participant,
                        onSignOut: onSignOut
                    )
            }
            .tabItem { Label("Today", systemImage: "sun.max.fill") }
            .tag(BaggerAppTab.today)
            .accessibilityIdentifier("tab.today")

            NavigationStack {
                matchesContent
                    .baggerNavigationChrome(
                        title: "Matches",
                        participant: participant,
                        onSignOut: onSignOut
                    )
            }
            .tabItem { Label("Matches", systemImage: "person.2.fill") }
            .tag(BaggerAppTab.matches)
            .accessibilityIdentifier("tab.matches")

            NavigationStack {
                scoreContent
                    .baggerNavigationChrome(
                        title: "Score",
                        participant: participant,
                        onSignOut: onSignOut
                    )
            }
            .tabItem { Label("Score", systemImage: "list.bullet.clipboard.fill") }
            .tag(BaggerAppTab.score)
            .accessibilityIdentifier("tab.score")

            NavigationStack {
                leadersContent
                    .baggerNavigationChrome(
                        title: "Leaders",
                        participant: participant,
                        onSignOut: onSignOut
                    )
            }
            .tabItem { Label("Leaders", systemImage: "trophy.fill") }
            .tag(BaggerAppTab.leaders)
            .accessibilityIdentifier("tab.leaders")

            NavigationStack(path: $morePath) {
                MoreDirectoryView()
                    .baggerNavigationChrome(
                        title: "More",
                        participant: participant,
                        onSignOut: onSignOut
                    )
                    .navigationDestination(for: MoreDestination.self) { destination in
                        moreDestination(destination)
                    }
            }
            .tabItem { Label("More", systemImage: "ellipsis.circle.fill") }
            .tag(BaggerAppTab.more)
            .accessibilityIdentifier("tab.more")
        }
        .tint(BaggerPalette.goldText)
        .toolbarBackground(BaggerPalette.cream, for: .tabBar)
        .toolbarBackground(.visible, for: .tabBar)
        .accessibilityIdentifier("app.shell")
        .onChange(of: selection) { selectedTab in
            guard selectedTab == .score, fixtureScoringState == nil else { return }
            Task { await tournamentData?.scoring.refresh() }
        }
    }

    @ViewBuilder
    private var leadersContent: some View {
        if let fixtureLeaders {
            LeadersScreen(
                score: fixtureLeaders.score,
                players: fixtureLeaders.players,
                netSkins: fixtureLeaders.netSkins,
                calcutta: fixtureLeaders.calcutta,
                startingProduct: fixtureLeaders.startingProduct,
                onRefresh: { _ in }
            )
        } else if let tournamentData {
            LeadersRepositoryView(participant: participant, coordinator: tournamentData)
        } else {
            VStack(spacing: 14) {
                Image(systemName: "exclamationmark.shield")
                Text("Leaders are unavailable in this configuration.")
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(BaggerPalette.canvas.ignoresSafeArea())
        }
    }

    @ViewBuilder
    private var scoreContent: some View {
        if let fixtureScoringState {
            if fixtureUsesDurableScoringQueue {
#if DEBUG
                DurableScoringQueueUITestFixtureView(state: fixtureScoringState)
#else
                ScoreFixtureView(state: fixtureScoringState)
#endif
            } else {
                ScoreFixtureView(state: fixtureScoringState)
            }
        } else if let tournamentData {
            ScoreRepositoryView(
                store: tournamentData.scoring,
                reliability: tournamentData.scoringReliability,
                finalization: tournamentData.scoringFinalization
            )
        } else {
            VStack(spacing: 14) {
                Image(systemName: "exclamationmark.shield")
                Text("Scoring is unavailable in this configuration.")
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(BaggerPalette.canvas.ignoresSafeArea())
        }
    }

    @ViewBuilder
    private var matchesContent: some View {
        if let fixtureMatchesState {
            MatchesFixtureView(
                participant: participant,
                state: fixtureMatchesState
            )
        } else if let tournamentData {
            MatchesRepositoryView(
                participant: participant,
                repository: tournamentData.matches
            )
        } else {
            VStack(spacing: 14) {
                Image(systemName: "exclamationmark.shield")
                Text("Matches are unavailable in this configuration.")
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(BaggerPalette.canvas.ignoresSafeArea())
        }
    }

    @ViewBuilder
    private var todayContent: some View {
        if let fixturePresentation {
            TodayScreen(
                presentation: fixturePresentation,
                isRefreshing: false,
                onRefresh: {},
                onOpenFullSchedule: openFullSchedule
            )
        } else if let tournamentData {
            TodayRepositoryView(
                participant: participant,
                coordinator: tournamentData,
                onOpenFullSchedule: openFullSchedule
            )
        } else {
            VStack(spacing: 14) {
                Image(systemName: "exclamationmark.shield")
                Text("Today is unavailable in this configuration.")
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(BaggerPalette.canvas.ignoresSafeArea())
        }
    }

    @ViewBuilder
    private func moreDestination(_ destination: MoreDestination) -> some View {
        switch destination {
        case .schedule:
            if let fixtureScheduleState {
                FullScheduleFixtureView(state: fixtureScheduleState, now: fixtureScheduleNow)
            } else if let tournamentData {
                FullScheduleRepositoryView(repository: tournamentData.schedule)
            } else {
                MoreUnavailableStateView(
                    title: destination.title,
                    message: "The native tournament data foundation is unavailable.",
                    identifierPrefix: "schedule",
                    onRetry: {}
                )
            }
        case .settings:
            SettingsView(participant: participant, onSignOut: onSignOut)
        case .passport, .passportTournamentHistory, .passportFormat, .passportCaptainLegacy:
            if let fixturePassportState {
                PassportFixtureView(
                    state: fixturePassportState,
                    destination: destination,
                    onSignOut: onSignOut
                )
            } else if let tournamentData {
                PassportRepositoryView(
                    repository: tournamentData.passport,
                    destination: destination,
                    onLoad: { await tournamentData.loadPassport() },
                    onRefresh: { await tournamentData.refreshPassport() },
                    onSignOut: onSignOut
                )
            } else {
                missingMoreData(destination, identifierPrefix: "passport")
            }
        case .tournamentGuide, .courses, .course, .rules, .dining, .localGuide, .contacts:
            if let fixtureGuideState {
                GuideFixtureView(state: fixtureGuideState, destination: destination)
            } else if let tournamentData {
                GuideRepositoryView(
                    repository: tournamentData.guide,
                    destination: destination,
                    onLoad: { await tournamentData.loadGuide() },
                    onRefresh: { await tournamentData.refreshGuide() }
                )
            } else {
                missingMoreData(destination, identifierPrefix: "guide")
            }
        case .odds:
            if let fixtureOddsState {
                OddsFixtureView(state: fixtureOddsState)
            } else if let tournamentData {
                OddsRepositoryView(
                    repository: tournamentData.odds,
                    onLoad: { await tournamentData.loadOdds() },
                    onRefresh: { await tournamentData.refreshOdds() }
                )
            } else {
                missingMoreData(destination, identifierPrefix: "odds")
            }
        case .history:
            if let fixtureHistoryState {
                HistoryArchiveFixtureView(state: fixtureHistoryState)
            } else if let tournamentData {
                HistoryArchiveRepositoryView(
                    repository: tournamentData.history,
                    onLoad: { await tournamentData.loadHistory() },
                    onRefresh: { await tournamentData.refreshHistory() }
                )
            } else {
                missingMoreData(destination, identifierPrefix: "history")
            }
        case .historyYear(let year):
            if let state = fixtureHistoryDetailStates[year] {
                HistoryDetailFixtureView(state: state)
            } else if let tournamentData {
                HistoryYearRouteView(coordinator: tournamentData, year: year)
            } else {
                missingMoreData(destination, identifierPrefix: "history.detail")
            }
        case .records:
            if let fixtureRecordsState {
                RecordsFixtureView(state: fixtureRecordsState)
            } else if let tournamentData {
                RecordsRepositoryView(
                    repository: tournamentData.records,
                    onLoad: { await tournamentData.loadRecords() },
                    onRefresh: { await tournamentData.refreshRecords() }
                )
            } else {
                missingMoreData(destination, identifierPrefix: "records")
            }
        }
    }

    private func missingMoreData(
        _ destination: MoreDestination,
        identifierPrefix: String
    ) -> some View {
        MoreUnavailableStateView(
            title: destination.title,
            message: "The native tournament data foundation is unavailable.",
            identifierPrefix: identifierPrefix,
            onRetry: {}
        )
        .navigationTitle(destination.title)
        .navigationBarTitleDisplayMode(.inline)
    }

    private func openFullSchedule() {
        morePath = [.schedule]
        selection = .more
    }

    private func placeholderTab(
        title: String,
        message: String,
        symbol: String
    ) -> some View {
        NavigationStack {
            VStack(spacing: 18) {
                Image(systemName: symbol)
                    .font(.system(size: 38, weight: .semibold))
                    .foregroundStyle(BaggerPalette.goldText)
                    .accessibilityHidden(true)
                Text(title)
                    .font(.system(.largeTitle, design: .serif, weight: .bold))
                    .foregroundStyle(BaggerPalette.ink)
                Text(message)
                    .font(.body)
                    .foregroundStyle(BaggerPalette.muted)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: 320)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .padding(24)
            .background(BaggerPalette.canvas.ignoresSafeArea())
            .accessibilityIdentifier("placeholder.\(title.lowercased())")
            .baggerNavigationChrome(
                title: title,
                participant: participant,
                onSignOut: onSignOut
            )
        }
    }
}

private extension View {
    func baggerNavigationChrome(
        title: String,
        participant: ParticipantSession,
        onSignOut: @escaping () -> Void
    ) -> some View {
        navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    BaggerPreviewPill()
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Button("Sign Out", role: .destructive, action: onSignOut)
                    } label: {
                        Image(systemName: "person.crop.circle")
                            .frame(minWidth: 44, minHeight: 44)
                            .foregroundStyle(BaggerPalette.deepEvergreen)
                    }
                    .accessibilityLabel("Account")
                    .baggerAcceptanceProbeValue(
                        BaggerAcceptanceProbes.isEnabled()
                            ? "Canonical player \(participant.player.playerId); tournament \(participant.tournament.tournamentId)"
                            : nil
                    )
                    .accessibilityIdentifier("account.menu")
                }
            }
            .toolbarBackground(BaggerPalette.cream, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbarColorScheme(.light, for: .navigationBar)
    }
}

private struct BaggerAcceptanceProbeValueModifier: ViewModifier {
    let value: String?

    @ViewBuilder
    func body(content: Content) -> some View {
        if let value {
            content.accessibilityValue(Text(value))
        } else {
            content
        }
    }
}

private extension View {
    func baggerAcceptanceProbeValue(_ value: String?) -> some View {
        modifier(BaggerAcceptanceProbeValueModifier(value: value))
    }
}
