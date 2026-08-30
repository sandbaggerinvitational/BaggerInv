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
    let fixtureUsesDurableScoringQueue: Bool
    let onSignOut: () -> Void

    @State private var selection: BaggerAppTab = .today

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
        fixtureUsesDurableScoringQueue = false
        self.onSignOut = onSignOut
    }

    init(
        participant: ParticipantSession,
        fixturePresentation: TodayPresentation,
        fixtureMatchesState: MobileReadState<MobileMatchesData>,
        fixtureScoringState: ScoringCurrentState,
        fixtureUsesDurableScoringQueue: Bool = false,
        startsOnScore: Bool = false,
        onSignOut: @escaping () -> Void = {}
    ) {
        self.participant = participant
        tournamentData = nil
        self.fixturePresentation = fixturePresentation
        self.fixtureMatchesState = fixtureMatchesState
        self.fixtureScoringState = fixtureScoringState
        self.fixtureUsesDurableScoringQueue = fixtureUsesDurableScoringQueue
        self.onSignOut = onSignOut
        _selection = State(initialValue: startsOnScore ? .score : .today)
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

            placeholderTab(
                title: "Leaders",
                message: "Full tournament and player standings arrive in a later step.",
                symbol: "trophy.fill"
            )
            .tabItem { Label("Leaders", systemImage: "trophy.fill") }
            .tag(BaggerAppTab.leaders)
            .accessibilityIdentifier("tab.leaders")

            placeholderTab(
                title: "More",
                message: "Schedule, Player Passport, and settings will live here.",
                symbol: "ellipsis.circle.fill"
            )
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
                onRefresh: {}
            )
        } else if let tournamentData {
            TodayRepositoryView(
                participant: participant,
                coordinator: tournamentData
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
