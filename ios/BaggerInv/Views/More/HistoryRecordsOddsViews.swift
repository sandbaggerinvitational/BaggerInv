import SwiftUI

struct HistoryArchiveRepositoryView: View {
    @ObservedObject private var repository: MobileReadRepository<MobileHistoryArchiveResponse>
    let onLoad: @MainActor @Sendable () async -> Void
    let onRefresh: @MainActor @Sendable () async -> Void

    init(
        repository: MobileReadRepository<MobileHistoryArchiveResponse>,
        onLoad: @escaping @MainActor @Sendable () async -> Void,
        onRefresh: @escaping @MainActor @Sendable () async -> Void
    ) {
        _repository = ObservedObject(wrappedValue: repository)
        self.onLoad = onLoad
        self.onRefresh = onRefresh
    }

    var body: some View {
        HistoryArchiveStateView(state: repository.state, onRefresh: onRefresh)
            .task { await onLoad() }
    }
}

struct HistoryArchiveFixtureView: View {
    let state: MobileReadState<MobileHistoryArchiveData>

    var body: some View {
        HistoryArchiveStateView(state: state, onRefresh: {})
    }
}

private struct HistoryArchiveStateView: View {
    let state: MobileReadState<MobileHistoryArchiveData>
    let onRefresh: @MainActor @Sendable () async -> Void

    var body: some View {
        Group {
            if let data = state.value {
                HistoryArchiveScreen(
                    presentation: HistoryPresenter.archive(data: data),
                    freshness: state.freshness,
                    onRefresh: onRefresh
                )
            } else if state.freshness == .empty || state.freshness == .refreshing {
                MoreLoadingStateView(title: "Tournament History", identifier: "history.loading")
            } else {
                MoreUnavailableStateView(
                    title: "Tournament History",
                    message: "Bagger could not load Tournament History and there is no saved update on this device.",
                    identifierPrefix: "history",
                    onRetry: onRefresh
                )
            }
        }
        .navigationTitle("Tournament History")
        .navigationBarTitleDisplayMode(.inline)
    }
}

private struct HistoryArchiveScreen: View {
    let presentation: HistoryArchivePresentation
    let freshness: MobileReadFreshness
    let onRefresh: @MainActor @Sendable () async -> Void

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: BaggerLayout.sectionSpacing) {
                MoreFreshnessBannerView(
                    productName: "Tournament History",
                    freshness: freshness,
                    identifierPrefix: "history"
                )

                if presentation.isEmpty {
                    MoreEmptyStateView(
                        title: "No tournament history is published yet.",
                        systemImage: "clock.arrow.circlepath",
                        identifier: "history.empty"
                    )
                } else {
                    ForEach(presentation.tournaments) { tournament in
                        if tournament.detailAvailable {
                            NavigationLink(value: MoreDestination.historyYear(year: tournament.year)) {
                                HistoryTournamentCard(tournament: tournament)
                            }
                            .buttonStyle(.plain)
                            .accessibilityHint("Opens \(tournament.year) Tournament detail")
                            .accessibilityIdentifier("history.year.\(tournament.year)")
                        } else {
                            HistoryTournamentCard(tournament: tournament)
                                .accessibilityIdentifier("history.year.\(tournament.year)")
                        }
                    }
                }
            }
            .padding(BaggerLayout.pageInset)
        }
        .background(BaggerPalette.canvas.ignoresSafeArea())
        .refreshable(action: onRefresh)
        .accessibilityIdentifier("history.screen")
    }
}

private struct HistoryTournamentCard: View {
    let tournament: HistoryTournamentPresentation

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            HStack(alignment: .firstTextBaseline) {
                Text(String(tournament.year))
                    .font(.title2.bold())
                    .foregroundStyle(BaggerPalette.ink)
                Spacer(minLength: 12)
                Text(tournament.status)
                    .font(.caption.weight(.black))
                    .foregroundStyle(BaggerPalette.actionGreen)
            }
            Text(tournament.editionTitle ?? tournament.name)
                .font(.headline)
                .foregroundStyle(BaggerPalette.ink)
                .fixedSize(horizontal: false, vertical: true)
            Text([tournament.dates, tournament.destination].compactMap { $0 }.joined(separator: " · "))
                .font(.subheadline)
                .foregroundStyle(BaggerPalette.muted)
                .fixedSize(horizontal: false, vertical: true)
            if let champion = tournament.championName {
                Label("Champion: \(champion)", systemImage: "trophy.fill")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(BaggerPalette.goldText)
            }
            if let runnerUp = tournament.runnerUpName {
                Text("Runner-up: \(runnerUp)")
                    .font(.subheadline)
                    .foregroundStyle(BaggerPalette.muted)
            }
            if let finalScore = tournament.finalScore {
                Text(finalScore).font(.subheadline.weight(.semibold)).foregroundStyle(BaggerPalette.actionGreen)
            }
            VStack(spacing: 3) {
                ForEach(tournament.teams) { team in
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text(team.name)
                        Spacer(minLength: 8)
                        Text(team.points ?? "—")
                            .fontWeight(.semibold)
                            .monospacedDigit()
                    }
                    .font(.footnote)
                    .foregroundStyle(BaggerPalette.muted)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .baggerCard(border: BaggerPalette.matchBorder)
        .accessibilityElement(children: .combine)
    }
}

struct HistoryDetailRepositoryView: View {
    @ObservedObject private var repository: MobileReadRepository<MobileHistoryDetailResponse>
    let onRefresh: @MainActor @Sendable () async -> Void

    init(
        repository: MobileReadRepository<MobileHistoryDetailResponse>,
        onRefresh: @escaping @MainActor @Sendable () async -> Void
    ) {
        _repository = ObservedObject(wrappedValue: repository)
        self.onRefresh = onRefresh
    }

    var body: some View {
        HistoryDetailStateView(state: repository.state, onRefresh: onRefresh)
    }
}

struct HistoryYearRouteView: View {
    let coordinator: TournamentDataCoordinator
    let year: Int

    var body: some View {
        if let repository = coordinator.historyDetails[year] {
            HistoryDetailRepositoryView(
                repository: repository,
                onRefresh: { await coordinator.refreshHistoryDetail(year: year) }
            )
                .task(id: year) {
                    await coordinator.loadHistoryDetail(year: year)
                }
        } else {
            MoreUnavailableStateView(
                title: "\(year) Tournament",
                message: "This tournament year is outside the native History archive.",
                identifierPrefix: "history.detail",
                onRetry: {}
            )
        }
    }
}

struct HistoryDetailFixtureView: View {
    let state: MobileReadState<MobileHistoryDetailData>

    var body: some View {
        HistoryDetailStateView(state: state, onRefresh: {})
    }
}

private struct HistoryDetailStateView: View {
    let state: MobileReadState<MobileHistoryDetailData>
    let onRefresh: @MainActor @Sendable () async -> Void

    var body: some View {
        Group {
            if let data = state.value {
                HistoryDetailScreen(
                    presentation: HistoryPresenter.detail(data: data),
                    freshness: state.freshness,
                    onRefresh: onRefresh
                )
            } else if state.freshness == .empty || state.freshness == .refreshing {
                MoreLoadingStateView(title: "Tournament Detail", identifier: "history.detail.loading")
            } else {
                MoreUnavailableStateView(
                    title: "Tournament Detail",
                    message: "Bagger could not load this Tournament History detail and there is no saved update on this device.",
                    identifierPrefix: "history.detail",
                    onRetry: onRefresh
                )
            }
        }
        .navigationTitle(state.value.map { String($0.tournament.year) } ?? "Tournament Detail")
        .navigationBarTitleDisplayMode(.inline)
    }
}

private struct HistoryDetailScreen: View {
    let presentation: HistoryDetailPresentation
    let freshness: MobileReadFreshness
    let onRefresh: @MainActor @Sendable () async -> Void

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: BaggerLayout.sectionSpacing) {
                HistoryTournamentCard(tournament: presentation.tournament)

                MoreFreshnessBannerView(
                    productName: "Tournament Detail",
                    freshness: freshness,
                    identifierPrefix: "history.detail"
                )

                HistoryTeamSection(teams: presentation.teams)
                HistoryRoundSection(rounds: presentation.rounds)
                HistoryMatchSection(matches: presentation.matches)
                HistoryStandingSection(standings: presentation.standings)
                HistoryAwardSection(awards: presentation.awards)
                HistoryScorecardSection(scorecards: presentation.scorecards)
            }
            .padding(BaggerLayout.pageInset)
        }
        .background(BaggerPalette.canvas.ignoresSafeArea())
        .refreshable(action: onRefresh)
        .accessibilityIdentifier("history.detail.screen")
    }
}

private struct HistoryTeamSection: View {
    let teams: [HistoryTeamPresentation]

    var body: some View {
        if !teams.isEmpty {
            BaggerSectionHeading("Teams")
            ForEach(teams) { team in
                DisclosureGroup {
                    VStack(alignment: .leading, spacing: 7) {
                        if let captain = team.captainName { Text("Captain: \(captain)") }
                        if let handicap = team.averageHandicap { Text("Average handicap: \(handicap)") }
                        ForEach(team.roster) { player in
                            Text([player.displayName, player.handicap.map { "Handicap \($0)" }, player.isCaptain ? "Captain" : nil]
                                .compactMap { $0 }.joined(separator: " · "))
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    .font(.subheadline)
                    .foregroundStyle(BaggerPalette.muted)
                    .padding(.top, 8)
                } label: {
                    HStack {
                        Text(team.name).font(.headline)
                        Spacer(minLength: 12)
                        if let points = team.points { Text(points).fontWeight(.bold) }
                    }
                }
                .tint(BaggerPalette.actionGreen)
                .baggerCard()
                .accessibilityIdentifier("history.team.\(team.teamID)")
            }
        }
    }
}

private struct HistoryRoundSection: View {
    let rounds: [HistoryRoundPresentation]

    var body: some View {
        if !rounds.isEmpty {
            BaggerSectionHeading("Rounds")
            ForEach(rounds) { round in
                VStack(alignment: .leading, spacing: 6) {
                    Text("Round \(round.roundNumber) · \(round.name)").font(.headline).foregroundStyle(BaggerPalette.ink)
                    Text([round.status, round.format, round.courseName, round.courseDetail]
                        .compactMap { $0 }.joined(separator: " · "))
                        .font(.subheadline)
                        .foregroundStyle(BaggerPalette.muted)
                        .fixedSize(horizontal: false, vertical: true)
                    ForEach(round.teamStandings) { team in
                        HStack {
                            Text(team.name)
                            Spacer(minLength: 12)
                            if let points = team.points { Text(points).fontWeight(.bold) }
                        }
                        .font(.subheadline)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .baggerCard()
                .accessibilityElement(children: .contain)
                .accessibilityIdentifier("history.round.\(round.roundNumber)")
            }
        }
    }
}

private struct HistoryMatchSection: View {
    let matches: [HistoryMatchPresentation]

    var body: some View {
        if !matches.isEmpty {
            BaggerSectionHeading("Matches")
            ForEach(matches) { match in
                VStack(alignment: .leading, spacing: 6) {
                    Text([match.matchNumber.map { "Match \($0)" }, match.format, match.status]
                        .compactMap { $0 }.joined(separator: " · "))
                        .font(.headline)
                        .foregroundStyle(BaggerPalette.ink)
                    ForEach(match.sides) { side in
                        Text(side.participantNames.joined(separator: " & "))
                            .font(.subheadline)
                    }
                    if let course = match.courseName { Label(course, systemImage: "flag").font(.footnote) }
                    Text([match.resultSummary, match.score].compactMap { $0 }.joined(separator: " · "))
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(BaggerPalette.actionGreen)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .baggerCard()
                .accessibilityElement(children: .combine)
                .accessibilityIdentifier("history.match.\(match.matchID)")
            }
        }
    }
}

private struct HistoryStandingSection: View {
    let standings: [HistoryStandingPresentation]
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        if !standings.isEmpty {
            BaggerSectionHeading("Player Standings")
            VStack(spacing: 0) {
                ForEach(Array(standings.enumerated()), id: \.element.id) { index, standing in
                    Group {
                        if dynamicTypeSize.isAccessibilitySize {
                            VStack(alignment: .leading, spacing: 3) {
                                Text("Rank \(standing.rank) · \(standing.displayName)")
                                    .font(.headline)
                                Text([standing.teamName, standing.record, standing.points]
                                    .compactMap { $0 }.joined(separator: " · "))
                                    .font(.footnote)
                                    .foregroundStyle(BaggerPalette.muted)
                            }
                        } else {
                            HStack(alignment: .top, spacing: 10) {
                                Text(String(standing.rank))
                                    .font(.headline.monospacedDigit())
                                    .frame(minWidth: 28, alignment: .leading)
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(standing.displayName).font(.headline)
                                    Text([standing.teamName, standing.record].compactMap { $0 }.joined(separator: " · "))
                                        .font(.footnote).foregroundStyle(BaggerPalette.muted)
                                }
                                Spacer(minLength: 8)
                                if let points = standing.points { Text(points).fontWeight(.bold) }
                            }
                        }
                    }
                    .padding(.vertical, 8)
                    .accessibilityElement(children: .combine)
                    .accessibilityIdentifier("history.standing.\(standing.id)")
                    if index < standings.count - 1 { Divider().overlay(BaggerPalette.warmBorder) }
                }
            }
            .baggerCard()
        }
    }
}

private struct HistoryAwardSection: View {
    let awards: [HistoryAwardPresentation]

    var body: some View {
        if !awards.isEmpty {
            BaggerSectionHeading("Awards")
            VStack(spacing: 0) {
                ForEach(Array(awards.enumerated()), id: \.element.id) { index, award in
                    Label {
                        VStack(alignment: .leading, spacing: 3) {
                            Text(award.title).font(.headline)
                            if let recipient = award.recipient { Text(recipient).font(.subheadline) }
                        }
                    } icon: {
                        Image(systemName: "medal.fill").foregroundStyle(BaggerPalette.goldText)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.vertical, 8)
                    .accessibilityElement(children: .combine)
                    if index < awards.count - 1 { Divider().overlay(BaggerPalette.warmBorder) }
                }
            }
            .baggerCard()
        }
    }
}

private struct HistoryScorecardSection: View {
    let scorecards: [HistoryScorecardPresentation]
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        if !scorecards.isEmpty {
            BaggerSectionHeading("Scorecards")
            ForEach(scorecards) { scorecard in
                DisclosureGroup {
                    VStack(spacing: 0) {
                        ForEach(scorecard.holes) { hole in
                            Group {
                                if dynamicTypeSize.isAccessibilitySize {
                                    VStack(alignment: .leading, spacing: 4) {
                                        Text(hole.holeNumber.map { "Hole \($0)" } ?? "Hole")
                                            .fontWeight(.semibold)
                                        Text(historyHoleDetail(hole))
                                    }
                                } else {
                                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                                        Text(hole.holeNumber.map { "Hole \($0)" } ?? "Hole")
                                            .fontWeight(.semibold)
                                        Spacer(minLength: 8)
                                        Text(historyHoleDetail(hole))
                                    }
                                }
                            }
                            .font(.subheadline)
                            .padding(.vertical, 4)
                            .accessibilityElement(children: .ignore)
                            .accessibilityLabel(
                                [hole.holeNumber.map { "Hole \($0)" }, historyHoleDetail(hole)]
                                    .compactMap { $0 }.joined(separator: ", ")
                            )
                        }
                    }
                    .padding(.top, 8)
                } label: {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(scorecard.participantLabel).font(.headline)
                        if scorecard.participantLabel != scorecard.entityType {
                            Text(scorecard.entityType)
                                .font(.caption)
                                .foregroundStyle(BaggerPalette.muted)
                        }
                        Text([scorecard.status, scorecard.grossTotal.map { "Gross \($0)" }, scorecard.netTotal.map { "Net \($0)" }]
                            .compactMap { $0 }.joined(separator: " · "))
                            .font(.subheadline).foregroundStyle(BaggerPalette.muted)
                    }
                }
                .tint(BaggerPalette.actionGreen)
                .baggerCard()
                .accessibilityIdentifier("history.scorecard.\(scorecard.scorecardID)")
            }
        }
    }

    private func historyHoleDetail(_ hole: HistoryHolePresentation) -> String {
        [
            hole.par.map { "Par \($0)" } ?? "Par —",
            hole.strokeIndex.map { "SI \($0)" } ?? "SI —",
            hole.strokesReceived.map { "Strokes \($0)" } ?? "Strokes —",
            hole.grossScore.map { "Gross \($0)" } ?? "Gross —",
            hole.netScore.map { "Net \($0)" } ?? "Net —",
        ].joined(separator: " · ")
    }
}

struct RecordsRepositoryView: View {
    @ObservedObject private var repository: MobileReadRepository<MobileRecordsResponse>
    let onLoad: @MainActor @Sendable () async -> Void
    let onRefresh: @MainActor @Sendable () async -> Void

    init(
        repository: MobileReadRepository<MobileRecordsResponse>,
        onLoad: @escaping @MainActor @Sendable () async -> Void,
        onRefresh: @escaping @MainActor @Sendable () async -> Void
    ) {
        _repository = ObservedObject(wrappedValue: repository)
        self.onLoad = onLoad
        self.onRefresh = onRefresh
    }

    var body: some View {
        RecordsStateView(state: repository.state, onRefresh: onRefresh)
            .task { await onLoad() }
    }
}

struct RecordsFixtureView: View {
    let state: MobileReadState<MobileRecordsData>

    var body: some View { RecordsStateView(state: state, onRefresh: {}) }
}

private struct RecordsStateView: View {
    let state: MobileReadState<MobileRecordsData>
    let onRefresh: @MainActor @Sendable () async -> Void

    var body: some View {
        Group {
            if let data = state.value {
                RecordsScreen(
                    presentation: RecordsPresenter.make(data: data),
                    freshness: state.freshness,
                    onRefresh: onRefresh
                )
            } else if state.freshness == .empty || state.freshness == .refreshing {
                MoreLoadingStateView(title: "Records", identifier: "records.loading")
            } else {
                MoreUnavailableStateView(
                    title: "Records",
                    message: "Bagger could not load the record book and there is no saved update on this device.",
                    identifierPrefix: "records",
                    onRetry: onRefresh
                )
            }
        }
        .navigationTitle("Records")
        .navigationBarTitleDisplayMode(.inline)
    }
}

private struct RecordsScreen: View {
    let presentation: RecordsPresentation
    let freshness: MobileReadFreshness
    let onRefresh: @MainActor @Sendable () async -> Void

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: BaggerLayout.sectionSpacing) {
                MoreFreshnessBannerView(productName: "Records", freshness: freshness, identifierPrefix: "records")
                MoreTextCardView(title: "Coverage", bodyText: presentation.coverageNote)
                    .accessibilityIdentifier("records.coverage")

                if presentation.isEmpty {
                    MoreEmptyStateView(
                        title: "No records are published yet.",
                        systemImage: "medal",
                        identifier: "records.empty"
                    )
                } else {
                    ForEach(presentation.categories) { category in
                        BaggerSectionHeading(category.title)
                            .accessibilityIdentifier("records.category.\(category.id)")
                        ForEach(category.records) { record in
                            RecordCard(record: record)
                        }
                    }
                }
            }
            .padding(BaggerLayout.pageInset)
        }
        .background(BaggerPalette.canvas.ignoresSafeArea())
        .refreshable(action: onRefresh)
        .accessibilityIdentifier("records.screen")
    }
}

private struct RecordCard: View {
    let record: RecordPresentation

    var body: some View {
        DisclosureGroup {
            VStack(alignment: .leading, spacing: 9) {
                if let note = record.eligibilityNote {
                    Text(note).font(.footnote).foregroundStyle(BaggerPalette.muted)
                }
                ForEach(record.holders) { holder in
                    VStack(alignment: .leading, spacing: 3) {
                        HStack(alignment: .firstTextBaseline) {
                            Text(holder.displayName).font(.headline)
                            Spacer(minLength: 8)
                            let holderValues = [holder.value, holder.secondaryValue].compactMap { $0 }
                            if !holderValues.isEmpty {
                                Text(holderValues.joined(separator: " · ")).fontWeight(.bold)
                            }
                        }
                        Text([holder.entityType, holder.context, holder.teamName, holder.courseName]
                            .compactMap { $0 }.joined(separator: " · "))
                            .font(.footnote)
                            .foregroundStyle(BaggerPalette.muted)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityIdentifier("records.holder.\(holder.id)")
                }
            }
            .padding(.top, 8)
        } label: {
            VStack(alignment: .leading, spacing: 4) {
                HStack(alignment: .firstTextBaseline) {
                    Text(record.title).font(.headline).foregroundStyle(BaggerPalette.ink)
                    Spacer(minLength: 8)
                    if let value = record.value { Text(value).fontWeight(.bold).foregroundStyle(BaggerPalette.actionGreen) }
                }
                Text([record.source, record.direction, record.tied ? "Tied" : nil, record.aggregate ? "Aggregate" : nil]
                    .compactMap { $0 }.joined(separator: " · "))
                    .font(.footnote)
                    .foregroundStyle(BaggerPalette.muted)
            }
        }
        .tint(BaggerPalette.actionGreen)
        .baggerCard()
        .accessibilityIdentifier("records.record.\(record.recordID)")
    }
}

struct OddsRepositoryView: View {
    @ObservedObject private var repository: MobileReadRepository<MobileOddsResponse>
    let onLoad: @MainActor @Sendable () async -> Void
    let onRefresh: @MainActor @Sendable () async -> Void

    init(
        repository: MobileReadRepository<MobileOddsResponse>,
        onLoad: @escaping @MainActor @Sendable () async -> Void,
        onRefresh: @escaping @MainActor @Sendable () async -> Void
    ) {
        _repository = ObservedObject(wrappedValue: repository)
        self.onLoad = onLoad
        self.onRefresh = onRefresh
    }

    var body: some View {
        OddsStateView(state: repository.state, onRefresh: onRefresh)
            .task { await onLoad() }
    }
}

struct OddsFixtureView: View {
    let state: MobileReadState<MobileOddsData>

    var body: some View { OddsStateView(state: state, onRefresh: {}) }
}

private struct OddsStateView: View {
    let state: MobileReadState<MobileOddsData>
    let onRefresh: @MainActor @Sendable () async -> Void

    var body: some View {
        Group {
            if let data = state.value {
                let presentation = OddsPresenter.make(data: data)
                if presentation.isPublished {
                    OddsScreen(presentation: presentation, freshness: state.freshness, onRefresh: onRefresh)
                } else {
                    MoreEmptyStatePage(
                        title: "Published Odds are not available",
                        message: "Championship projections will appear only after they are published.",
                        identifier: "odds.unpublished"
                    )
                }
            } else if state.freshness == .empty || state.freshness == .refreshing {
                MoreLoadingStateView(title: "Published Odds", identifier: "odds.loading")
            } else {
                MoreUnavailableStateView(
                    title: "Published Odds",
                    message: "Bagger could not load Published Odds and there is no saved update on this device.",
                    identifierPrefix: "odds",
                    onRetry: onRefresh
                )
            }
        }
        .navigationTitle("Published Odds")
        .navigationBarTitleDisplayMode(.inline)
    }
}

private struct OddsScreen: View {
    let presentation: OddsPresentation
    let freshness: MobileReadFreshness
    let onRefresh: @MainActor @Sendable () async -> Void

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: BaggerLayout.sectionSpacing) {
                VStack(alignment: .leading, spacing: 6) {
                    BaggerEyebrow(text: "Published Projections")
                    Text("Championship Odds")
                        .font(.system(.title2, design: .serif, weight: .bold))
                        .foregroundStyle(BaggerPalette.ink)
                    Text("Published Odds are projections, not official Tournament Score or results.")
                        .font(.subheadline)
                        .foregroundStyle(BaggerPalette.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .baggerCard(border: BaggerPalette.matchBorder)

                MoreFreshnessBannerView(productName: "Published Odds", freshness: freshness, identifierPrefix: "odds")

                if presentation.isEmpty {
                    MoreEmptyStateView(
                        title: "No odds snapshots are published yet.",
                        systemImage: "chart.line.uptrend.xyaxis",
                        identifier: "odds.empty"
                    )
                } else {
                    ForEach(presentation.snapshots) { snapshot in
                        OddsSnapshotView(snapshot: snapshot)
                    }
                }
            }
            .padding(BaggerLayout.pageInset)
        }
        .background(BaggerPalette.canvas.ignoresSafeArea())
        .refreshable(action: onRefresh)
        .accessibilityIdentifier("odds.screen")
    }
}

private struct OddsSnapshotView: View {
    let snapshot: OddsSnapshotPresentation
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Text(snapshot.label).font(.title3.bold()).foregroundStyle(BaggerPalette.ink)
                Spacer(minLength: 8)
                if snapshot.isCurrent {
                    Text("CURRENT").font(.caption2.weight(.black)).foregroundStyle(BaggerPalette.liveRed)
                }
            }
            Text("\(snapshot.iterationCount) iterations · \(snapshot.totalPointsAvailable) total points")
                .font(.footnote)
                .foregroundStyle(BaggerPalette.muted)
            Text("Published \(snapshot.publishedAt.formatted(date: .abbreviated, time: .shortened))")
                .font(.footnote)
                .foregroundStyle(BaggerPalette.muted)
                .accessibilityIdentifier("odds.publishedAt.\(snapshot.id)")

            ForEach(snapshot.teams) { team in
                HStack(alignment: .top, spacing: 10) {
                    Text(team.name).font(.headline).foregroundStyle(BaggerPalette.ink)
                    Spacer(minLength: 8)
                    VStack(alignment: .trailing, spacing: 2) {
                        Text(team.probability).font(.headline).foregroundStyle(BaggerPalette.actionGreen)
                        Text("\(team.americanOdds) · \(team.expectedPoints) pts")
                            .font(.caption).foregroundStyle(BaggerPalette.muted)
                    }
                }
                .accessibilityElement(children: .combine)
                .accessibilityIdentifier("odds.team.\(team.id)")
            }

            if !snapshot.players.isEmpty {
                Divider().overlay(BaggerPalette.warmBorder)
                DisclosureGroup("Player Projections") {
                    VStack(spacing: 0) {
                        ForEach(snapshot.players) { player in
                            Group {
                                if dynamicTypeSize.isAccessibilitySize {
                                    VStack(alignment: .leading, spacing: 3) {
                                        Text("Rank \(player.rank) · \(player.displayName)")
                                            .font(.headline)
                                        Text("\(player.probability) · \(player.americanOdds) · \(player.expectedPoints) expected points")
                                            .font(.subheadline)
                                            .foregroundStyle(BaggerPalette.actionGreen)
                                        Text("\(player.expectedRecord) · Avg finish \(player.averageFinish)")
                                            .font(.caption)
                                            .foregroundStyle(BaggerPalette.muted)
                                    }
                                } else {
                                    HStack(alignment: .top, spacing: 8) {
                                        Text(String(player.rank))
                                            .font(.headline.monospacedDigit())
                                            .frame(minWidth: 28, alignment: .leading)
                                        VStack(alignment: .leading, spacing: 2) {
                                            Text(player.displayName).font(.headline)
                                            Text("\(player.expectedRecord) · Avg finish \(player.averageFinish)")
                                                .font(.caption).foregroundStyle(BaggerPalette.muted)
                                            Text("\(player.americanOdds) · \(player.expectedPoints) expected points")
                                                .font(.caption).foregroundStyle(BaggerPalette.muted)
                                        }
                                        Spacer(minLength: 8)
                                        Text(player.probability)
                                            .fontWeight(.bold)
                                            .foregroundStyle(BaggerPalette.actionGreen)
                                    }
                                }
                            }
                            .padding(.vertical, 6)
                            .accessibilityElement(children: .combine)
                            .accessibilityIdentifier("odds.player.\(player.id)")
                        }
                    }
                    .padding(.top, 6)
                }
                .tint(BaggerPalette.actionGreen)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .baggerCard(border: snapshot.isCurrent ? BaggerPalette.liveRed.opacity(0.5) : BaggerPalette.warmBorder)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("odds.snapshot.\(snapshot.id)")
    }
}
