import SwiftUI

struct LeadersRepositoryDiagnostics: Equatable, Sendable {
    let leaders: String
    let netSkins: String
    let calcutta: String

    init(
        leaders: MobileReadState<MobileLeadersData>,
        netSkins: MobileReadState<MobileNetSkinsData>,
        calcutta: MobileReadState<MobileCalcuttaData>
    ) {
        let teamCount = leaders.value?.teamStandings.count ?? 0
        let roundCount = leaders.value?.roundStandings.count ?? 0
        let playerCount = leaders.value?.playerStandings.count ?? 0
        self.leaders = Self.summary(leaders) +
            "; teams \(teamCount); rounds \(roundCount); players \(playerCount)"
        self.netSkins = Self.summary(netSkins)
        self.calcutta = Self.summary(calcutta)
    }

    private static func summary<Value>(_ state: MobileReadState<Value>) -> String
    where Value: Equatable & Sendable {
        let availability = state.value == nil ? "no content" : "content"
        let source: String
        switch state.source {
        case .diskCache: source = "cache"
        case .network: source = "network"
        case nil: source = "none"
        }
        let validation = state.validatedAt.map { String(Int($0.timeIntervalSince1970 * 1_000)) } ?? "missing"
        return "\(availability); freshness \(state.freshness.rawValue); source \(source); " +
            "revision \(state.revision == nil ? "missing" : "present"); " +
            "http \(state.lastHTTPStatus.map(String.init) ?? "unknown"); validated \(validation)"
    }
}

struct LeadersFixturePresentation {
    let score: LeadersScorePresentation
    let players: LeadersPlayersPresentation
    let netSkins: LeadersNetSkinsPresentation
    let calcutta: LeadersCalcuttaPresentation
    let startingProduct: LeadersProduct
}

struct LeadersRepositoryView: View {
    let participant: ParticipantSession
    @Binding private var selection: LeadersProduct

    @ObservedObject private var leaders: MobileReadRepository<MobileLeadersResponse>
    @ObservedObject private var netSkins: MobileReadRepository<MobileNetSkinsResponse>
    @ObservedObject private var calcutta: MobileReadRepository<MobileCalcuttaResponse>

    init(
        participant: ParticipantSession,
        coordinator: TournamentDataCoordinator,
        selection: Binding<LeadersProduct>
    ) {
        self.participant = participant
        _selection = selection
        _leaders = ObservedObject(wrappedValue: coordinator.leaders)
        _netSkins = ObservedObject(wrappedValue: coordinator.netSkins)
        _calcutta = ObservedObject(wrappedValue: coordinator.calcutta)
    }

    var body: some View {
        LeadersScreen(
            scoreProvider: { LeadersPresenter.score(participant: participant, state: leaders.state) },
            playersProvider: { LeadersPresenter.players(participant: participant, state: leaders.state) },
            netSkinsProvider: {
                LeadersPresenter.netSkins(
                    participant: participant,
                    state: netSkins.state,
                    leaders: leaders.state
                )
            },
            calcuttaProvider: { LeadersPresenter.calcutta(participant: participant, state: calcutta.state) },
            selection: $selection,
            diagnostics: BaggerAcceptanceProbes.isEnabled()
                ? LeadersRepositoryDiagnostics(
                    leaders: leaders.state,
                    netSkins: netSkins.state,
                    calcutta: calcutta.state
                )
                : nil,
            onRefresh: refresh,
            onProductSelected: refreshIfNeeded
        )
    }

    private func refresh(_ product: LeadersProduct) async {
        switch product {
        case .score, .players: await leaders.refresh()
        case .netSkins: await netSkins.refresh()
        case .calcutta: await calcutta.refresh()
        }
    }

    private func refreshIfNeeded(_ product: LeadersProduct) async {
        let staleAfter: TimeInterval = 5 * 60
        switch product {
        case .score, .players: await leaders.refreshIfStale(olderThan: staleAfter)
        case .netSkins: await netSkins.refreshIfStale(olderThan: staleAfter)
        case .calcutta: await calcutta.refreshIfStale(olderThan: staleAfter)
        }
    }
}

struct LeadersScreen: View {
    private let scoreProvider: () -> LeadersScorePresentation
    private let playersProvider: () -> LeadersPlayersPresentation
    private let netSkinsProvider: () -> LeadersNetSkinsPresentation
    private let calcuttaProvider: () -> LeadersCalcuttaPresentation
    var diagnostics: LeadersRepositoryDiagnostics?
    let onRefresh: @MainActor @Sendable (LeadersProduct) async -> Void
    let onProductSelected: @MainActor @Sendable (LeadersProduct) async -> Void

    @Binding private var selection: LeadersProduct
    @State private var selectedNetSkinsRoundID: String?

    init(
        score: LeadersScorePresentation,
        players: LeadersPlayersPresentation,
        netSkins: LeadersNetSkinsPresentation,
        calcutta: LeadersCalcuttaPresentation,
        selection: Binding<LeadersProduct>,
        diagnostics: LeadersRepositoryDiagnostics? = nil,
        onRefresh: @escaping @MainActor @Sendable (LeadersProduct) async -> Void,
        onProductSelected: @escaping @MainActor @Sendable (LeadersProduct) async -> Void = { _ in }
    ) {
        scoreProvider = { score }
        playersProvider = { players }
        netSkinsProvider = { netSkins }
        calcuttaProvider = { calcutta }
        self.diagnostics = diagnostics
        self.onRefresh = onRefresh
        self.onProductSelected = onProductSelected
        _selection = selection
    }

    init(
        scoreProvider: @escaping () -> LeadersScorePresentation,
        playersProvider: @escaping () -> LeadersPlayersPresentation,
        netSkinsProvider: @escaping () -> LeadersNetSkinsPresentation,
        calcuttaProvider: @escaping () -> LeadersCalcuttaPresentation,
        selection: Binding<LeadersProduct>,
        diagnostics: LeadersRepositoryDiagnostics? = nil,
        onRefresh: @escaping @MainActor @Sendable (LeadersProduct) async -> Void,
        onProductSelected: @escaping @MainActor @Sendable (LeadersProduct) async -> Void = { _ in }
    ) {
        self.scoreProvider = scoreProvider
        self.playersProvider = playersProvider
        self.netSkinsProvider = netSkinsProvider
        self.calcuttaProvider = calcuttaProvider
        self.diagnostics = diagnostics
        self.onRefresh = onRefresh
        self.onProductSelected = onProductSelected
        _selection = selection
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: BaggerLayout.sectionSpacing) {
                header
                LeadersProductSelector(selection: $selection)
                selectedContent
            }
            .padding(.horizontal, BaggerLayout.pageInset)
            .padding(.top, 12)
            .padding(.bottom, 30)
        }
        .background(BaggerPalette.canvas.ignoresSafeArea())
        .refreshable { await onRefresh(selection) }
        .accessibilityIdentifier("leaders.screen")
        .overlay(alignment: .topLeading) { acceptanceDiagnosticProbe }
        .overlay(alignment: .topTrailing) { acceptanceRefreshProbe }
        .onAppear { Task { await onProductSelected(selection) } }
        .onChange(of: selection) { product in
            Task { await onProductSelected(product) }
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            BaggerEyebrow(text: "Competition")
            Text("Leaders")
                .font(.system(.title, design: .serif, weight: .bold))
                .foregroundStyle(BaggerPalette.ink)
            Text("Tournament score, standings, Net Skins, and published Calcutta")
                .font(.subheadline)
                .foregroundStyle(BaggerPalette.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal, 2)
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder
    private var acceptanceDiagnosticProbe: some View {
        if let diagnostic = selectedDiagnostic {
            Text("Read status")
                .font(.system(size: 1))
                .frame(width: 1, height: 1)
                .opacity(0.01)
                .allowsHitTesting(false)
                .accessibilityIdentifier(diagnostic.identifier)
                .accessibilityValue(Text(diagnostic.value))
        }
    }

    private var selectedDiagnostic: (identifier: String, value: String)? {
        guard let diagnostics else { return nil }
        switch selection {
        case .score: return ("leaders.read.score", diagnostics.leaders)
        case .players: return ("leaders.read.players", diagnostics.leaders)
        case .netSkins: return ("leaders.read.netSkins", diagnostics.netSkins)
        case .calcutta: return ("leaders.read.calcutta", diagnostics.calcutta)
        }
    }

    @ViewBuilder
    private var acceptanceRefreshProbe: some View {
        if diagnostics != nil {
            Button {
                Task { await onRefresh(selection) }
            } label: {
                Text("Refresh")
                    .font(.system(size: 1))
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .opacity(0.02)
            .accessibilityIdentifier("leaders.acceptance.refresh")
            .accessibilityLabel("Refresh selected Leaders product")
        }
    }

    @ViewBuilder
    private var selectedContent: some View {
        switch selection {
        case .score:
            LeadersScoreView(
                presentation: scoreProvider(),
                diagnostics: diagnostics?.leaders,
                onRetry: { await onRefresh(.score) }
            )
        case .players:
            LeadersPlayersView(
                presentation: playersProvider(),
                diagnostics: diagnostics?.leaders,
                onRetry: { await onRefresh(.players) }
            )
        case .netSkins:
            let presentation = netSkinsProvider()
            LeadersNetSkinsView(
                presentation: presentation,
                selectedRoundID: $selectedNetSkinsRoundID,
                diagnostics: diagnostics?.netSkins,
                onRetry: { await onRefresh(.netSkins) }
            )
            .onAppear { reconcileNetSkinsRound(presentation) }
            .onChange(of: presentation.defaultRoundID) { _ in
                reconcileNetSkinsRound(presentation)
            }
            .onChange(of: presentation.rounds.map(\.id)) { _ in
                reconcileNetSkinsRound(presentation)
            }
        case .calcutta:
            LeadersCalcuttaView(
                presentation: calcuttaProvider(),
                diagnostics: diagnostics?.calcutta,
                onRetry: { await onRefresh(.calcutta) }
            )
        }
    }

    private func reconcileNetSkinsRound(_ presentation: LeadersNetSkinsPresentation) {
        let validIDs = Set(presentation.rounds.map(\.id))
        guard selectedNetSkinsRoundID == nil || !validIDs.contains(selectedNetSkinsRoundID!) else { return }
        selectedNetSkinsRoundID = presentation.defaultRoundID ?? presentation.rounds.first?.id
    }
}

private struct LeadersProductSelector: View {
    @Binding var selection: LeadersProduct
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        LazyVGrid(columns: columns, spacing: 8) {
            ForEach(LeadersProduct.allCases) { product in
                Button {
                    selection = product
                } label: {
                    Text(product.title)
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(selection == product ? Color.white : BaggerPalette.deepEvergreen)
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: .infinity, minHeight: 48)
                        .padding(.horizontal, 7)
                        .background(
                            selection == product ? BaggerPalette.evergreen : BaggerPalette.paper,
                            in: RoundedRectangle(cornerRadius: 13, style: .continuous)
                        )
                        .overlay {
                            RoundedRectangle(cornerRadius: 13, style: .continuous)
                                .stroke(
                                    selection == product ? BaggerPalette.gold : BaggerPalette.warmBorder,
                                    lineWidth: selection == product ? 2 : 1
                                )
                        }
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(selection == product ? .isSelected : [])
                .accessibilityIdentifier("leaders.product.\(product.rawValue)")
            }
        }
        .accessibilityIdentifier("leaders.selector")
    }

    private var columns: [GridItem] {
        Array(
            repeating: GridItem(.flexible(), spacing: 8),
            count: dynamicTypeSize >= .xxLarge ? 2 : 4
        )
    }
}

private struct LeadersScoreView: View {
    let presentation: LeadersScorePresentation
    let diagnostics: String?
    let onRetry: @MainActor @Sendable () async -> Void

    var body: some View {
        LeadersProductState(availability: presentation.availability, onRetry: onRetry) {
            if let freshness = presentation.freshness {
                LeadersFreshnessBanner(presentation: freshness, financial: false)
            }
            tournamentScore
            roundScores
            LeadersRefreshingFooter(isRefreshing: presentation.isRefreshing, label: "Refreshing score")
        }
        .accessibilityIdentifier("leaders.score")
    }

    private var tournamentScore: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .firstTextBaseline) {
                BaggerSectionHeading("Tournament Score", eyebrow: "Leaders")
                Spacer(minLength: 8)
                if let context = presentation.tournamentContext {
                    Text(context)
                        .font(.caption.weight(.bold))
                        .foregroundStyle(BaggerPalette.muted)
                        .multilineTextAlignment(.trailing)
                }
            }
            Text(presentation.tournamentName)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(BaggerPalette.actionGreen)
                .fixedSize(horizontal: false, vertical: true)

            if let message = presentation.scoreMessage {
                Label(message, systemImage: "flag")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(BaggerPalette.muted)
            }

            ForEach(Array(presentation.teams.enumerated()), id: \.element.id) { index, team in
                LeadersTournamentTeamRow(team: team)
                if index < presentation.teams.count - 1 {
                    Divider().overlay(BaggerPalette.warmBorder)
                }
            }
        }
        .baggerCard(border: BaggerPalette.matchBorder)
        .accessibilityIdentifier("leaders.tournamentScore")
    }

    private var roundScores: some View {
        VStack(alignment: .leading, spacing: 10) {
            BaggerSectionHeading("Round Scores")
            if presentation.rounds.isEmpty {
                LeadersEmptyCard(
                    symbol: "flag.checkered",
                    title: "No Round scores yet",
                    message: "Canonical Round results will appear when available."
                )
            } else {
                ForEach(presentation.rounds) { round in
                    LeadersRoundScoreCard(round: round)
                }
            }
        }
        .accessibilityIdentifier("leaders.roundScores")
    }
}

private struct LeadersTournamentTeamRow: View {
    let team: LeadersTeamPresentation

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            teamInitial
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 7) {
                    Text(team.name)
                        .font(.headline)
                        .foregroundStyle(BaggerPalette.ink)
                        .fixedSize(horizontal: false, vertical: true)
                    if team.isAuthenticatedTeam {
                        Text("YOUR TEAM")
                            .font(.caption2.weight(.black))
                            .foregroundStyle(BaggerPalette.goldText)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 3)
                            .background(BaggerPalette.scoreGold.opacity(0.5), in: Capsule())
                    }
                    if let label = team.standingLabel {
                        Text(label.uppercased())
                            .font(.caption2.weight(.black))
                            .foregroundStyle(BaggerPalette.deepEvergreen)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 3)
                            .background(BaggerPalette.scoreGold.opacity(0.35), in: Capsule())
                    }
                }
                Text(teamDetail)
                    .font(.caption)
                    .foregroundStyle(BaggerPalette.muted)
            }
            Spacer(minLength: 8)
            Text(team.pointsText)
                .font(.system(.largeTitle, design: .serif, weight: .bold))
                .monospacedDigit()
                .foregroundStyle(BaggerPalette.deepEvergreen)
                .accessibilityLabel(team.pointsAccessibilityText)
        }
        .padding(.vertical, 3)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilitySummary)
        .accessibilityIdentifier("leaders.tournament.team.\(team.id)")
    }

    private var teamInitial: some View {
        Text(String(team.name.prefix(1)).uppercased())
            .font(.headline.weight(.black))
            .foregroundStyle(team.isAuthenticatedTeam ? BaggerPalette.deepEvergreen : Color.white)
            .frame(width: 44, height: 44)
            .background(
                team.isAuthenticatedTeam ? BaggerPalette.scoreGold : BaggerPalette.evergreen,
                in: Circle()
            )
            .accessibilityHidden(true)
    }

    private var remainingText: String {
        guard let remaining = team.remainingMatches else { return "" }
        return "\(remaining) \(remaining == 1 ? "Match" : "Matches") remaining"
    }

    private var teamDetail: String {
        let rank = team.rank.map { "Rank \($0)" }
        let record = team.record.isEmpty ? nil : team.record
        return [rank, record, remainingText.isEmpty ? nil : remainingText]
            .compactMap { $0 }
            .joined(separator: " · ")
    }

    private var accessibilitySummary: String {
        var values = [team.name, team.pointsAccessibilityText]
        if let rank = team.rank { values.append("rank \(rank)") }
        if let label = team.standingLabel { values.append(label) }
        if team.isAuthenticatedTeam { values.append("your team") }
        if !team.record.isEmpty { values.append("record \(team.record)") }
        return values.joined(separator: ", ")
    }
}

private struct LeadersRoundScoreCard: View {
    let round: LeadersRoundPresentation

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                VStack(alignment: .leading, spacing: 2) {
                    BaggerEyebrow(text: "Round \(round.roundNumber)")
                    if !round.name.isEmpty {
                        Text(round.name)
                            .font(.headline)
                            .foregroundStyle(BaggerPalette.ink)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                Spacer(minLength: 8)
                LeadersStatusPill(
                    text: round.statusText,
                    emphasized: round.status == .final
                )
            }
            if round.status == .upcoming && round.teams.allSatisfy({ $0.rank == nil && $0.pointsText == "—" }) {
                Label("Scores available when play begins", systemImage: "clock")
                    .font(.subheadline)
                    .foregroundStyle(BaggerPalette.muted)
            } else {
                ForEach(round.teams) { team in
                    HStack(alignment: .center, spacing: 8) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(team.name)
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(BaggerPalette.ink)
                                .fixedSize(horizontal: false, vertical: true)
                            if !teamRoundDetail(team).isEmpty {
                                Text(teamRoundDetail(team))
                                    .font(.caption2)
                                    .foregroundStyle(BaggerPalette.muted)
                            }
                        }
                        Spacer(minLength: 8)
                        Text(team.pointsText)
                            .font(.title3.weight(.bold))
                            .monospacedDigit()
                            .foregroundStyle(BaggerPalette.deepEvergreen)
                            .accessibilityLabel(team.pointsAccessibilityText)
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel(
                        "\(team.name), \(team.pointsAccessibilityText)" +
                        (teamRoundDetail(team).isEmpty ? "" : ", \(teamRoundDetail(team))")
                    )
                    .accessibilityIdentifier("leaders.round.\(round.roundNumber).team.\(team.id)")
                }
            }
        }
        .baggerCard()
        .accessibilityIdentifier("leaders.round.\(round.roundNumber)")
    }

    private func teamRoundDetail(_ team: LeadersTeamPresentation) -> String {
        let rank = team.rank.map { "Rank \($0)" }
        let remaining = team.remainingMatches.map {
            "\($0) \($0 == 1 ? "Match" : "Matches") remaining"
        }
        let record = team.record.isEmpty ? nil : team.record
        return [rank, record, remaining].compactMap { $0 }.joined(separator: " · ")
    }
}

private struct LeadersPlayersView: View {
    let presentation: LeadersPlayersPresentation
    let diagnostics: String?
    let onRetry: @MainActor @Sendable () async -> Void
    @State private var showsAllPlayers = false

    var body: some View {
        LeadersProductState(availability: presentation.availability, onRetry: onRetry) {
            if let freshness = presentation.freshness {
                LeadersFreshnessBanner(presentation: freshness, financial: false)
            }
            BaggerSectionHeading("Player Leaders", eyebrow: "Overall")
            VStack(spacing: 0) {
                ForEach(Array(visiblePlayers.enumerated()), id: \.element.id) { index, player in
                    LeadersPlayerRow(player: player)
                    if index < visiblePlayers.count - 1 {
                        Divider().padding(.leading, 52).overlay(BaggerPalette.warmBorder)
                    }
                }
            }
            .baggerCard()
            .accessibilityIdentifier("leaders.players")
            if let authenticatedPlayerOutsideTopTen {
                BaggerSectionHeading("Your Position")
                LeadersPlayerRow(player: authenticatedPlayerOutsideTopTen)
                    .baggerCard(border: BaggerPalette.gold)
                    .accessibilityIdentifier("leaders.players.yourPosition")
            }
            if presentation.players.count > 10 {
                Button(showsAllPlayers ? "Show Top 10" : "Show All \(presentation.players.count)") {
                    showsAllPlayers.toggle()
                }
                .buttonStyle(.bordered)
                .tint(BaggerPalette.actionGreen)
                .accessibilityIdentifier("leaders.players.showAll")
            }
            LeadersRefreshingFooter(isRefreshing: presentation.isRefreshing, label: "Refreshing players")
        }
        .accessibilityIdentifier("leaders.players.product")
    }

    private var visiblePlayers: [LeadersPlayerPresentation] {
        showsAllPlayers ? presentation.players : Array(presentation.players.prefix(10))
    }

    private var authenticatedPlayerOutsideTopTen: LeadersPlayerPresentation? {
        guard !showsAllPlayers else { return nil }
        return presentation.players.dropFirst(10).first(where: \.isAuthenticatedPlayer)
    }
}

private struct LeadersPlayerRow: View {
    let player: LeadersPlayerPresentation

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            Text(player.rank.map(String.init) ?? "—")
                .font(.title3.weight(.black))
                .foregroundStyle(player.isAuthenticatedPlayer ? BaggerPalette.goldText : BaggerPalette.deepEvergreen)
                .frame(width: 34)
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 7) {
                    Text(player.displayName)
                        .font(.headline)
                        .foregroundStyle(BaggerPalette.ink)
                        .fixedSize(horizontal: false, vertical: true)
                    if player.isAuthenticatedPlayer {
                        Text("YOU")
                            .font(.caption2.weight(.black))
                            .foregroundStyle(BaggerPalette.goldText)
                    }
                }
                Text([player.teamName, player.record].filter { !$0.isEmpty }.joined(separator: " · "))
                    .font(.caption)
                    .foregroundStyle(BaggerPalette.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 8)
            Text(player.pointsText)
                .font(.headline.weight(.black))
                .monospacedDigit()
                .foregroundStyle(BaggerPalette.deepEvergreen)
        }
        .padding(.vertical, 11)
        .background(player.isAuthenticatedPlayer ? BaggerPalette.scoreGold.opacity(0.13) : Color.clear)
        .contentShape(Rectangle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(
            "Rank \(player.rank.map(String.init) ?? "unavailable"), \(player.displayName), " +
            "\(player.teamName), \(player.pointsAccessibilityText)" +
            (player.record.isEmpty ? "" : ", record \(player.record)") +
            (player.isAuthenticatedPlayer ? ", you" : "")
        )
        .accessibilityIdentifier("leaders.player.\(player.playerID)")
    }
}

private struct LeadersNetSkinsView: View {
    let presentation: LeadersNetSkinsPresentation
    @Binding var selectedRoundID: String?
    let diagnostics: String?
    let onRetry: @MainActor @Sendable () async -> Void

    var body: some View {
        LeadersProductState(availability: presentation.availability, onRetry: onRetry) {
            if let freshness = presentation.freshness {
                LeadersFreshnessBanner(presentation: freshness, financial: true)
            }
            statusCard
            if !presentation.rounds.isEmpty {
                roundSelector
                if let round = selectedRound {
                    roundContent(round)
                }
            }
            LeadersRefreshingFooter(isRefreshing: presentation.isRefreshing, label: "Refreshing Net Skins")
        }
        .accessibilityIdentifier("leaders.netSkins")
    }

    private var selectedRound: LeadersNetSkinsRoundPresentation? {
        presentation.rounds.first(where: { $0.id == selectedRoundID }) ?? presentation.rounds.first
    }

    private var statusCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                BaggerSectionHeading("Net Skins", eyebrow: "Official Only")
                Spacer(minLength: 8)
                LeadersStatusPill(
                    text: presentation.statusText,
                    emphasized: presentation.state == .official
                )
            }
            if let message = presentation.message {
                Text(message)
                    .font(.subheadline)
                    .foregroundStyle(BaggerPalette.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .baggerCard(border: presentation.state == .official ? BaggerPalette.matchBorder : BaggerPalette.warmBorder)
        .accessibilityElement(children: .combine)
    }

    private var roundSelector: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Round")
                .font(.caption.weight(.bold))
                .foregroundStyle(BaggerPalette.muted)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(presentation.rounds) { round in
                        Button {
                            selectedRoundID = round.id
                        } label: {
                            Text("Round \(round.roundNumber)")
                                .font(.subheadline.weight(.bold))
                                .foregroundStyle(selectedRoundID == round.id ? Color.white : BaggerPalette.deepEvergreen)
                                .padding(.horizontal, 15)
                                .frame(minHeight: 46)
                                .background(
                                    selectedRoundID == round.id ? BaggerPalette.evergreen : BaggerPalette.paper,
                                    in: Capsule()
                                )
                                .overlay {
                                    Capsule().stroke(
                                        selectedRoundID == round.id ? BaggerPalette.gold : BaggerPalette.warmBorder,
                                        lineWidth: selectedRoundID == round.id ? 2 : 1
                                    )
                                }
                        }
                        .buttonStyle(.plain)
                        .accessibilityAddTraits(selectedRoundID == round.id ? .isSelected : [])
                        .accessibilityIdentifier("leaders.netSkins.round.\(round.roundNumber)")
                    }
                }
                .padding(.vertical, 2)
            }
        }
    }

    @ViewBuilder
    private func roundContent(_ round: LeadersNetSkinsRoundPresentation) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 3) {
                    Text("Round \(round.roundNumber) · \(round.formatText)")
                        .font(.headline)
                        .foregroundStyle(BaggerPalette.ink)
                    Text("\(round.entryCountText) · \(round.buyInText) buy-in")
                        .font(.caption)
                        .foregroundStyle(BaggerPalette.muted)
                }
                Spacer(minLength: 8)
                LeadersStatusPill(text: round.statusText, emphasized: round.state == .official)
            }
        }
        .baggerCard()

        if let official = round.official {
            NetSkinsOfficialSummaryView(official: official)
            if !official.leaderboard.isEmpty {
                NetSkinsLeaderboardView(rows: official.leaderboard)
            }
            NetSkinsWinnersView(skins: official.skins)
        } else if round.state != .official {
            LeadersEmptyCard(
                symbol: "checkmark.seal",
                title: "No official results yet",
                message: "Only server-published official Net Skins results appear here."
            )
        }
    }
}

private struct NetSkinsOfficialSummaryView: View {
    let official: LeadersNetSkinsOfficialPresentation

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            BaggerSectionHeading("Official Results")
            HStack(spacing: 10) {
                LeadersMetric(title: "Pot", value: official.potText, accessibilityValue: official.potAccessibilityText)
                LeadersMetric(title: "Per Skin", value: official.skinValueText, accessibilityValue: official.skinValueAccessibilityText)
            }
            Text("\(official.eligibleText) · \(official.progressText) · \(official.completedText)")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(BaggerPalette.actionGreen)
        }
        .baggerCard(border: BaggerPalette.matchBorder)
        .accessibilityIdentifier("leaders.netSkins.official")
    }
}

private struct NetSkinsLeaderboardView: View {
    let rows: [LeadersNetSkinsRowPresentation]

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            BaggerSectionHeading("Leaderboard")
            VStack(spacing: 0) {
                ForEach(Array(rows.enumerated()), id: \.element.id) { index, row in
                    HStack(alignment: .center, spacing: 10) {
                        Text(row.rankText)
                            .font(.headline.weight(.black))
                            .frame(width: 28)
                            .foregroundStyle(row.isAuthenticatedEntry ? BaggerPalette.goldText : BaggerPalette.deepEvergreen)
                        VStack(alignment: .leading, spacing: 3) {
                            HStack(spacing: 6) {
                                Text(row.displayName)
                                    .font(.headline)
                                    .fixedSize(horizontal: false, vertical: true)
                                if row.isAuthenticatedEntry { Text("YOU").font(.caption2.weight(.black)).foregroundStyle(BaggerPalette.goldText) }
                            }
                            Text([row.skinsText, row.winningHolesText].compactMap { $0 }.joined(separator: " · "))
                                .font(.caption)
                                .foregroundStyle(BaggerPalette.muted)
                        }
                        Spacer(minLength: 8)
                        Text(row.winningsText)
                            .font(.headline.weight(.black))
                            .monospacedDigit()
                    }
                    .padding(.vertical, 10)
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel(
                        [
                            "Rank \(row.rankText)",
                            row.displayName,
                            row.isAuthenticatedEntry ? "you" : nil,
                            row.skinsText,
                            row.winningHolesText,
                            row.winningsAccessibilityText,
                        ]
                        .compactMap { $0 }
                        .joined(separator: ", ")
                    )
                    .accessibilityIdentifier("leaders.netSkins.entry.\(row.id)")
                    if index < rows.count - 1 { Divider().overlay(BaggerPalette.warmBorder) }
                }
            }
            .baggerCard()
        }
    }
}

private struct NetSkinsWinnersView: View {
    let skins: [LeadersNetSkinPresentation]

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            BaggerSectionHeading("Winning Holes")
            if skins.isEmpty {
                LeadersEmptyCard(symbol: "flag", title: "No skins awarded", message: "No official hole winners were published.")
            } else {
                ForEach(skins) { skin in
                    HStack(alignment: .center, spacing: 12) {
                        Text("\(skin.holeNumber)")
                            .font(.title2.weight(.black))
                            .foregroundStyle(BaggerPalette.deepEvergreen)
                            .frame(width: 44, height: 44)
                            .background(BaggerPalette.scoreGold.opacity(0.55), in: Circle())
                        VStack(alignment: .leading, spacing: 3) {
                            HStack(spacing: 6) {
                                Text(skin.winnerName)
                                    .font(.headline)
                                    .fixedSize(horizontal: false, vertical: true)
                                if skin.isAuthenticatedWinner {
                                    Text("YOU")
                                        .font(.caption2.weight(.black))
                                        .foregroundStyle(BaggerPalette.goldText)
                                }
                            }
                            Text("Winning net \(skin.winningNetText)")
                                .font(.caption)
                                .foregroundStyle(BaggerPalette.muted)
                        }
                        Spacer(minLength: 8)
                        Text(skin.valueText)
                            .font(.headline.weight(.black))
                            .monospacedDigit()
                    }
                    .baggerCard(border: skin.isAuthenticatedWinner ? BaggerPalette.gold : BaggerPalette.warmBorder)
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel("Hole \(skin.holeNumber), \(skin.winnerName)\(skin.isAuthenticatedWinner ? ", you" : ""), winning net \(skin.winningNetText), \(skin.valueAccessibilityText)")
                    .accessibilityIdentifier("leaders.netSkins.skin.\(skin.id)")
                }
            }
        }
    }
}

private struct LeadersCalcuttaView: View {
    let presentation: LeadersCalcuttaPresentation
    let diagnostics: String?
    let onRetry: @MainActor @Sendable () async -> Void

    var body: some View {
        LeadersProductState(availability: presentation.availability, onRetry: onRetry) {
            if let freshness = presentation.freshness {
                LeadersFreshnessBanner(presentation: freshness, financial: true)
            }
            statusCard
            if let published = presentation.published {
                CalcuttaMarketView(published: published)
                if !published.golfers.isEmpty {
                    CalcuttaGolferResultsView(published: published)
                }
                if !published.portfolios.isEmpty {
                    CalcuttaPortfoliosView(portfolios: published.portfolios)
                }
            }
            LeadersRefreshingFooter(isRefreshing: presentation.isRefreshing, label: "Refreshing Calcutta")
        }
        .accessibilityIdentifier("leaders.calcutta")
    }

    private var statusCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                BaggerSectionHeading("Calcutta", eyebrow: "Published Participant View")
                Spacer(minLength: 8)
                LeadersStatusPill(
                    text: presentation.statusText,
                    emphasized: presentation.publicationState == .published
                )
            }
            if let message = presentation.message {
                Text(message)
                    .font(.subheadline)
                    .foregroundStyle(BaggerPalette.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .baggerCard(border: presentation.publicationState == .published ? BaggerPalette.matchBorder : BaggerPalette.warmBorder)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier(
            presentation.publicationState == .unpublished
                ? "leaders.calcutta.unpublished"
                : "leaders.calcutta.published"
        )
    }
}

private struct CalcuttaMarketView: View {
    let published: LeadersCalcuttaPublishedPresentation

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                BaggerSectionHeading("Market")
                Spacer(minLength: 8)
                VStack(alignment: .trailing, spacing: 1) {
                    Text("POT")
                        .font(.caption2.weight(.black))
                        .foregroundStyle(BaggerPalette.muted)
                    Text(published.potText)
                        .font(.title2.weight(.black))
                        .monospacedDigit()
                        .foregroundStyle(BaggerPalette.deepEvergreen)
                        .accessibilityLabel(published.potAccessibilityText)
                }
            }
            LazyVStack(alignment: .leading, spacing: 10) {
                ForEach(published.purchases) { purchase in
                    CalcuttaPurchaseCard(purchase: purchase)
                }
            }
        }
        .accessibilityIdentifier("leaders.calcutta.market")
    }
}

private struct CalcuttaPurchaseCard: View {
    let purchase: LeadersCalcuttaPurchasePresentation
    @State private var showsOwners = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(purchase.displayName)
                    .font(.headline)
                    .foregroundStyle(BaggerPalette.ink)
                    .fixedSize(horizontal: false, vertical: true)
                if purchase.isAuthenticatedPlayer { Text("YOU").font(.caption2.weight(.black)).foregroundStyle(BaggerPalette.goldText) }
                Spacer(minLength: 8)
                Text(purchase.purchasePriceText)
                    .font(.headline.weight(.black))
                    .monospacedDigit()
            }
            DisclosureGroup(isExpanded: $showsOwners) {
                LazyVStack(alignment: .leading, spacing: 8) {
                    ForEach(purchase.owners) { owner in
                        HStack(alignment: .firstTextBaseline, spacing: 8) {
                            Text(owner.displayName + (owner.isAuthenticatedPlayer ? " · You" : ""))
                                .font(.subheadline)
                                .foregroundStyle(BaggerPalette.muted)
                                .fixedSize(horizontal: false, vertical: true)
                            Spacer(minLength: 8)
                            Text(owner.ownershipText)
                                .font(.subheadline.weight(.bold))
                                .monospacedDigit()
                        }
                        .accessibilityElement(children: .combine)
                        .accessibilityLabel("Owner \(owner.displayName)\(owner.isAuthenticatedPlayer ? ", you" : ""), \(owner.ownershipAccessibilityText)")
                    }
                }
                .padding(.top, 6)
            } label: {
                Text("\(purchase.owners.count) \(purchase.owners.count == 1 ? "owner" : "owners")")
                    .font(.subheadline.weight(.semibold))
            }
            .tint(BaggerPalette.actionGreen)
        }
        .baggerCard(border: purchase.isAuthenticatedPlayer ? BaggerPalette.gold : BaggerPalette.warmBorder)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("\(purchase.displayName)\(purchase.isAuthenticatedPlayer ? ", you" : ""), purchase price \(purchase.purchasePriceAccessibilityText), \(purchase.owners.count) owners")
        .accessibilityIdentifier("leaders.calcutta.purchase.\(purchase.playerID)")
    }
}

private struct CalcuttaGolferResultsView: View {
    let published: LeadersCalcuttaPublishedPresentation

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .bottom) {
                BaggerSectionHeading(published.resultLabel ?? "Results")
                Spacer(minLength: 8)
                if let rounds = published.completedRoundsText {
                    Text(rounds)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(BaggerPalette.muted)
                        .multilineTextAlignment(.trailing)
                }
            }
            LazyVStack(alignment: .leading, spacing: 10) {
            ForEach(published.golfers) { golfer in
                VStack(alignment: .leading, spacing: 10) {
                    HStack(alignment: .firstTextBaseline, spacing: 10) {
                        Text(golfer.tieSize > 1 ? "T\(golfer.rank)" : "\(golfer.rank)")
                            .font(.title3.weight(.black))
                            .foregroundStyle(golfer.isAuthenticatedPlayer ? BaggerPalette.goldText : BaggerPalette.deepEvergreen)
                            .frame(width: 30)
                        Text(golfer.displayName)
                            .font(.headline)
                            .fixedSize(horizontal: false, vertical: true)
                        if golfer.isAuthenticatedPlayer { Text("YOU").font(.caption2.weight(.black)).foregroundStyle(BaggerPalette.goldText) }
                        Spacer(minLength: 8)
                        Text(golfer.tournamentValueText)
                            .font(.headline.weight(.black))
                            .monospacedDigit()
                    }
                    HStack(spacing: 8) {
                        LeadersSmallMetric(title: "Points", value: golfer.pointsText)
                        LeadersSmallMetric(title: "Guaranteed", value: golfer.guaranteedText)
                    }
                    HStack(spacing: 8) {
                        LeadersSmallMetric(title: "Net", value: golfer.netProfitText)
                        LeadersSmallMetric(title: "ROI", value: golfer.roiText)
                        LeadersSmallMetric(title: "Upside", value: golfer.remainingUpsideText)
                    }
                    if !golfer.rounds.isEmpty {
                        DisclosureGroup("Round Performance") {
                            LazyVStack(alignment: .leading, spacing: 8) {
                                ForEach(golfer.rounds) { round in
                                    CalcuttaRoundPerformanceRow(round: round)
                                }
                            }
                            .padding(.top, 6)
                        }
                        .font(.subheadline.weight(.semibold))
                        .tint(BaggerPalette.actionGreen)
                    }
                }
                .baggerCard(border: golfer.isAuthenticatedPlayer ? BaggerPalette.gold : BaggerPalette.warmBorder)
                .accessibilityElement(children: .combine)
                .accessibilityLabel(
                    ([
                        "Rank \(golfer.rank)",
                        golfer.tieSize > 1 ? "tied with \(golfer.tieSize) golfers" : nil,
                        golfer.displayName,
                        golfer.isAuthenticatedPlayer ? "you" : nil,
                        "points \(golfer.pointsText)",
                        "tournament value \(golfer.tournamentValueAccessibilityText)",
                        "guaranteed \(golfer.guaranteedText)",
                        "net \(golfer.netProfitAccessibilityText)",
                        "ROI \(golfer.roiText)",
                        "remaining upside \(golfer.remainingUpsideText)",
                    ]).compactMap { $0 }.joined(separator: ", ")
                )
                .accessibilityIdentifier("leaders.calcutta.golfer.\(golfer.playerID)")
            }
            }
        }
        .accessibilityIdentifier("leaders.calcutta.golfers")
    }
}

private struct CalcuttaRoundPerformanceRow: View {
    let round: LeadersCalcuttaRoundPresentation

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            Text("Round \(round.roundNumber) · \(round.formatText)")
                .font(.subheadline.weight(.bold))
            Text("Gross \(round.grossText) · Net \(round.netText) · HCP \(round.courseHandicapText)")
                .font(.caption)
                .foregroundStyle(BaggerPalette.muted)
            Text("\(round.finishText) · \(round.pointsText) points")
                .font(.caption)
                .foregroundStyle(BaggerPalette.muted)
            HStack {
                Text("Payout \(round.payoutFractionText)")
                Spacer(minLength: 8)
                Text("Guaranteed \(round.guaranteedText)")
            }
            .font(.caption.weight(.semibold))
        }
        .padding(10)
        .background(BaggerPalette.paper, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("leaders.calcutta.round.\(round.id)")
    }
}

private struct CalcuttaPortfoliosView: View {
    let portfolios: [LeadersCalcuttaPortfolioPresentation]

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            BaggerSectionHeading("Owner Portfolios")
            LazyVStack(alignment: .leading, spacing: 10) {
                ForEach(portfolios) { portfolio in
                    CalcuttaPortfolioCard(portfolio: portfolio)
                }
            }
        }
        .accessibilityIdentifier("leaders.calcutta.portfolios")
    }
}

private struct CalcuttaPortfolioCard: View {
    let portfolio: LeadersCalcuttaPortfolioPresentation
    @State private var showsInvestments = false

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text("\(portfolio.rank)")
                    .font(.title3.weight(.black))
                    .foregroundStyle(portfolio.isAuthenticatedOwner ? BaggerPalette.goldText : BaggerPalette.deepEvergreen)
                Text(portfolio.ownerName)
                    .font(.headline)
                    .fixedSize(horizontal: false, vertical: true)
                if portfolio.isAuthenticatedOwner { Text("YOU").font(.caption2.weight(.black)).foregroundStyle(BaggerPalette.goldText) }
                Spacer(minLength: 8)
                Text(portfolio.tournamentValueText)
                    .font(.headline.weight(.black))
                    .monospacedDigit()
            }
            HStack(spacing: 8) {
                LeadersSmallMetric(title: "Cost", value: portfolio.purchaseCostText)
                LeadersSmallMetric(title: "Guaranteed", value: portfolio.guaranteedText)
                LeadersSmallMetric(title: "Net", value: portfolio.netProfitText)
            }
            LeadersSmallMetric(title: "ROI", value: portfolio.roiText)
            DisclosureGroup(isExpanded: $showsInvestments) {
                LazyVStack(alignment: .leading, spacing: 8) {
                    ForEach(portfolio.investments) { investment in
                        VStack(alignment: .leading, spacing: 6) {
                            HStack(alignment: .firstTextBaseline, spacing: 8) {
                                Text(investment.displayName)
                                    .font(.subheadline.weight(.semibold))
                                    .fixedSize(horizontal: false, vertical: true)
                                Text(investment.ownershipText)
                                    .font(.caption.weight(.bold))
                                    .foregroundStyle(BaggerPalette.muted)
                                Spacer(minLength: 8)
                                Text(investment.valueText)
                                    .font(.subheadline.weight(.bold))
                                    .monospacedDigit()
                            }
                            Text("Cost \(investment.purchaseCostText) · Guaranteed \(investment.guaranteedText)")
                                .font(.caption)
                                .foregroundStyle(BaggerPalette.muted)
                            Text("Net \(investment.netProfitText) · ROI \(investment.roiText)")
                                .font(.caption)
                                .foregroundStyle(BaggerPalette.muted)
                        }
                        .accessibilityElement(children: .combine)
                        .accessibilityIdentifier("leaders.calcutta.investment.\(portfolio.ownerID).\(investment.playerID)")
                    }
                }
                .padding(.top, 6)
            } label: {
                Text("\(portfolio.investments.count) \(portfolio.investments.count == 1 ? "investment" : "investments")")
                    .font(.subheadline.weight(.semibold))
            }
            .tint(BaggerPalette.actionGreen)
        }
        .baggerCard(border: portfolio.isAuthenticatedOwner ? BaggerPalette.gold : BaggerPalette.warmBorder)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Rank \(portfolio.rank), owner \(portfolio.ownerName)\(portfolio.isAuthenticatedOwner ? ", you" : ""), value \(portfolio.tournamentValueText), net \(portfolio.netProfitAccessibilityText), ROI \(portfolio.roiText), \(portfolio.investments.count) investments")
        .accessibilityIdentifier("leaders.calcutta.portfolio.\(portfolio.ownerID)")
    }
}

private struct LeadersProductState<Content: View>: View {
    let availability: LeadersAvailability
    let onRetry: @MainActor @Sendable () async -> Void
    @ViewBuilder let content: () -> Content

    var body: some View {
        switch availability {
        case .loading:
            VStack(spacing: 12) {
                ProgressView()
                Text("Loading Leaders")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(BaggerPalette.muted)
            }
            .frame(maxWidth: .infinity, minHeight: 190)
            .baggerCard()
        case .content:
            content()
        case .empty:
            LeadersEmptyCard(
                symbol: "trophy",
                title: "Nothing published yet",
                message: "Canonical competition results will appear here when available."
            )
        case .unavailable:
            VStack(alignment: .leading, spacing: 12) {
                Label("Leaders unavailable", systemImage: "wifi.exclamationmark")
                    .font(.headline)
                    .foregroundStyle(BaggerPalette.ink)
                Text("This competition product could not be loaded and there is no eligible saved update on this device.")
                    .font(.subheadline)
                    .foregroundStyle(BaggerPalette.muted)
                Button("Try Again") { Task { await onRetry() } }
                    .buttonStyle(.borderedProminent)
                    .tint(BaggerPalette.actionGreen)
                    .controlSize(.large)
                    .accessibilityIdentifier("leaders.retry")
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .baggerCard()
        }
    }
}

private struct LeadersFreshnessBanner: View {
    let presentation: LeadersFreshnessPresentation
    let financial: Bool

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: icon)
                .foregroundStyle(BaggerPalette.goldText)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(BaggerPalette.ink)
                Text(message)
                    .font(.caption)
                    .foregroundStyle(BaggerPalette.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(BaggerPalette.scoreGold.opacity(0.22), in: RoundedRectangle(cornerRadius: 13))
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier(presentation.kind == .offline ? "leaders.offlineStatus" : "leaders.freshnessStatus")
    }

    private var title: String {
        switch presentation.kind {
        case .cached: "Saved update"
        case .refreshing: "Refreshing"
        case .stale: "Update may be stale"
        case .offline: "Offline · showing last update"
        }
    }

    private var message: String {
        let qualifier = financial ? " Published financial values may have changed." : ""
        if let lastValidated = presentation.lastValidated {
            return "Last checked \(lastValidated.formatted(date: .omitted, time: .shortened)).\(qualifier)"
        }
        return "Bagger will revalidate when connectivity is available.\(qualifier)"
    }

    private var icon: String {
        presentation.kind == .offline ? "wifi.slash" : "clock.arrow.circlepath"
    }
}

private struct LeadersStatusPill: View {
    let text: String
    let emphasized: Bool

    var body: some View {
        Text(text.uppercased())
            .font(.caption2.weight(.black))
            .foregroundStyle(emphasized ? BaggerPalette.deepEvergreen : BaggerPalette.muted)
            .padding(.horizontal, 9)
            .padding(.vertical, 6)
            .background(
                emphasized ? BaggerPalette.scoreGold.opacity(0.55) : BaggerPalette.cream,
                in: Capsule()
            )
            .fixedSize(horizontal: false, vertical: true)
    }
}

private struct LeadersMetric: View {
    let title: String
    let value: String
    let accessibilityValue: String

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(title.uppercased())
                .font(.caption2.weight(.black))
                .foregroundStyle(BaggerPalette.muted)
            Text(value)
                .font(.title3.weight(.black))
                .foregroundStyle(BaggerPalette.deepEvergreen)
                .monospacedDigit()
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(BaggerPalette.cream, in: RoundedRectangle(cornerRadius: 12))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(title), \(accessibilityValue)")
    }
}

private struct LeadersSmallMetric: View {
    let title: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title.uppercased())
                .font(.caption2.weight(.black))
                .foregroundStyle(BaggerPalette.muted)
            Text(value)
                .font(.caption.weight(.bold))
                .foregroundStyle(BaggerPalette.ink)
                .monospacedDigit()
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct LeadersEmptyCard: View {
    let symbol: String
    let title: String
    let message: String

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: symbol)
                .foregroundStyle(BaggerPalette.goldText)
                .frame(width: 32, height: 32)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 4) {
                Text(title).font(.headline).foregroundStyle(BaggerPalette.ink)
                Text(message)
                    .font(.subheadline)
                    .foregroundStyle(BaggerPalette.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .baggerCard()
        .accessibilityElement(children: .combine)
    }
}

private struct LeadersRefreshingFooter: View {
    let isRefreshing: Bool
    let label: String

    var body: some View {
        if isRefreshing {
            HStack(spacing: 8) {
                ProgressView()
                Text(label).font(.footnote.weight(.semibold))
            }
            .foregroundStyle(BaggerPalette.muted)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 8)
            .accessibilityElement(children: .combine)
        }
    }
}
