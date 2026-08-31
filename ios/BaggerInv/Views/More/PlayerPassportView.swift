import SwiftUI

struct PassportRepositoryView: View {
    @ObservedObject private var repository: MobileReadRepository<MobilePassportResponse>
    let destination: MoreDestination
    let buildInfo: BaggerAppBuildInfo
    let onLoad: @MainActor @Sendable () async -> Void
    let onRefresh: @MainActor @Sendable () async -> Void
    let onSignOut: () -> Void

    init(
        repository: MobileReadRepository<MobilePassportResponse>,
        destination: MoreDestination = .passport,
        buildInfo: BaggerAppBuildInfo = .current(),
        onLoad: @escaping @MainActor @Sendable () async -> Void,
        onRefresh: @escaping @MainActor @Sendable () async -> Void,
        onSignOut: @escaping () -> Void
    ) {
        _repository = ObservedObject(wrappedValue: repository)
        self.destination = destination
        self.buildInfo = buildInfo
        self.onLoad = onLoad
        self.onRefresh = onRefresh
        self.onSignOut = onSignOut
    }

    var body: some View {
        PassportStateView(
            state: repository.state,
            destination: destination,
            buildInfo: buildInfo,
            onRefresh: onRefresh,
            onSignOut: onSignOut
        )
        .task { await onLoad() }
    }
}

struct PassportFixtureView: View {
    let state: MobileReadState<MobilePassportData>
    let destination: MoreDestination
    let buildInfo: BaggerAppBuildInfo
    let onSignOut: () -> Void

    init(
        state: MobileReadState<MobilePassportData>,
        destination: MoreDestination = .passport,
        buildInfo: BaggerAppBuildInfo = .init(version: "0.1.0", build: "1"),
        onSignOut: @escaping () -> Void = {}
    ) {
        self.state = state
        self.destination = destination
        self.buildInfo = buildInfo
        self.onSignOut = onSignOut
    }

    var body: some View {
        PassportStateView(
            state: state,
            destination: destination,
            buildInfo: buildInfo,
            onRefresh: {},
            onSignOut: onSignOut
        )
    }
}

private struct PassportStateView: View {
    let state: MobileReadState<MobilePassportData>
    let destination: MoreDestination
    let buildInfo: BaggerAppBuildInfo
    let onRefresh: @MainActor @Sendable () async -> Void
    let onSignOut: () -> Void

    var body: some View {
        Group {
            if let data = state.value {
                destinationView(PassportPresenter.make(data: data))
            } else if state.freshness == .empty || state.freshness == .refreshing {
                MoreLoadingStateView(title: destination.title, identifier: "passport.loading")
            } else {
                MoreUnavailableStateView(
                    title: destination.title,
                    message: "Bagger could not load this Player Passport and there is no saved update on this device.",
                    identifierPrefix: "passport",
                    onRetry: onRefresh
                )
            }
        }
        .navigationTitle(destination.title)
        .navigationBarTitleDisplayMode(.inline)
    }

    @ViewBuilder
    private func destinationView(_ presentation: PassportPresentation) -> some View {
        switch destination {
        case .passport:
            PlayerPassportScreen(
                presentation: presentation,
                freshness: state.freshness,
                isRefreshing: state.isRefreshing,
                buildInfo: buildInfo,
                onRefresh: onRefresh,
                onSignOut: onSignOut
            )
        case .passportTournamentHistory:
            PassportTournamentHistoryView(
                entries: presentation.tournamentHistory,
                freshness: state.freshness,
                onRefresh: onRefresh
            )
        case .passportFormat(let code):
            if let format = presentation.formatPerformance.first(where: { $0.formatCode == code }) {
                PassportFormatDetailView(
                    format: format,
                    freshness: state.freshness,
                    onRefresh: onRefresh
                )
            } else {
                MoreEmptyStatePage(
                    title: "Format unavailable",
                    message: "This format is not part of the current Player Passport.",
                    identifier: "passport.format.missing"
                )
            }
        case .passportCaptainLegacy:
            PassportCaptainLegacyView(
                legacy: presentation.captainLegacy,
                freshness: state.freshness,
                onRefresh: onRefresh
            )
        default:
            MoreEmptyStatePage(
                title: "Passport destination unavailable",
                message: "Return to Player Passport and choose another section.",
                identifier: "passport.destination.missing"
            )
        }
    }
}

struct PlayerPassportScreen: View {
    let presentation: PassportPresentation
    let freshness: MobileReadFreshness
    let isRefreshing: Bool
    let buildInfo: BaggerAppBuildInfo
    let onRefresh: @MainActor @Sendable () async -> Void
    let onSignOut: () -> Void
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: BaggerLayout.sectionSpacing) {
                passportHero

                MoreFreshnessBannerView(
                    productName: "Player Passport",
                    freshness: freshness,
                    identifierPrefix: "passport"
                )

                currentTournament

                PassportValueSection(
                    title: "Career Summary",
                    values: presentation.careerSummary,
                    identifier: "passport.careerSummary"
                )

                PassportExpandableValueSection(
                    title: "Scoring & Hole Profile",
                    values: presentation.holePerformance,
                    identifier: "passport.holePerformance"
                )

                PassportExpandableValueSection(
                    title: "Match Play Profile",
                    values: presentation.matchProgression,
                    identifier: "passport.matchProgression"
                )

                navigationSections

                PassportHonorSection(
                    title: "Honors",
                    honors: presentation.honors,
                    emptyMessage: "No career honors are published yet."
                )

                if !presentation.rankings.isEmpty {
                    PassportRankingSection(rankings: presentation.rankings)
                }

                PassportHonorSection(
                    title: "Records Held",
                    honors: presentation.recordsHeld,
                    emptyMessage: "No current records held."
                )

                if let rival = presentation.biggestRival {
                    PassportRivalCard(rival: rival)
                } else {
                    PassportSimpleEmptySection(
                        title: "Biggest Rival",
                        message: "No rivalry is published yet."
                    )
                }

                PassportPartnerSection(partners: presentation.topPartners)

                PassportDraftSection(entries: presentation.draftHistory)

                accountSection

                if isRefreshing {
                    HStack(spacing: 8) {
                        ProgressView()
                        Text("Refreshing Player Passport")
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
        .accessibilityIdentifier("passport.screen")
    }

    private var passportHero: some View {
        VStack(alignment: .leading, spacing: 7) {
            BaggerEyebrow(text: presentation.active ? "Signed In" : "Player Passport")
            Text(presentation.displayName)
                .font(.system(.largeTitle, design: .serif, weight: .bold))
                .foregroundStyle(BaggerPalette.ink)
                .fixedSize(horizontal: false, vertical: true)
            if let teamName = presentation.teamName {
                Label(teamName, systemImage: "person.3.fill")
                    .font(.headline)
                    .foregroundStyle(BaggerPalette.actionGreen)
            }
            if let careerYears = presentation.careerYears {
                Text(careerYears)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(BaggerPalette.muted)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .baggerCard(border: BaggerPalette.matchBorder)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("passport.hero")
    }

    private var currentTournament: some View {
        VStack(alignment: .leading, spacing: 10) {
            BaggerSectionHeading("Current Tournament")
            VStack(alignment: .leading, spacing: 8) {
                Text(presentation.currentTournament.name)
                    .font(.title3.weight(.bold))
                    .foregroundStyle(BaggerPalette.ink)
                    .fixedSize(horizontal: false, vertical: true)
                Text([
                    presentation.currentTournament.year,
                    presentation.currentTournament.status,
                    presentation.currentTournament.teamName,
                ].compactMap { $0 }.joined(separator: " · "))
                    .font(.subheadline)
                    .foregroundStyle(BaggerPalette.muted)
                    .fixedSize(horizontal: false, vertical: true)

                let metrics = currentTournamentMetrics
                if !metrics.isEmpty {
                    PassportLabeledValueGrid(values: metrics)
                }

                ForEach(presentation.currentTournament.rounds) { round in
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Round \(round.roundNumber) · \(round.formatCode)")
                            .font(.headline)
                            .foregroundStyle(BaggerPalette.ink)
                        Text([round.status, round.progress].compactMap { $0 }.joined(separator: " · "))
                            .font(.subheadline)
                            .foregroundStyle(BaggerPalette.muted)
                        PassportLabeledValueGrid(values: round.metrics)
                    }
                    .padding(.top, 6)
                    .accessibilityElement(children: .contain)
                    .accessibilityIdentifier("passport.current.round.\(round.roundNumber)")
                }
            }
            .baggerCard()
        }
        .accessibilityIdentifier("passport.currentTournament")
    }

    private var currentTournamentMetrics: [MoreLabeledValuePresentation] {
        [
            presentation.currentTournament.record.map { value("record", "Record", $0) },
            presentation.currentTournament.points.map { value("points", "Points", $0) },
            presentation.currentTournament.standing.map { value("standing", "Player Standing", $0) },
            presentation.currentTournament.teamStanding.map { value("team-standing", "Team Standing", $0) },
            presentation.currentTournament.tournamentHandicap.map { value("handicap", "Tournament Handicap", $0) },
        ].compactMap { $0 }
    }

    private var navigationSections: some View {
        VStack(alignment: .leading, spacing: 10) {
            BaggerSectionHeading("Career Detail")
            VStack(spacing: 0) {
                NavigationLink(value: MoreDestination.passportTournamentHistory) {
                    PassportNavigationRow(
                        title: "Tournament History",
                        detail: "\(presentation.tournamentHistory.count) appearances",
                        systemImage: "calendar.badge.clock"
                    )
                }
                .accessibilityIdentifier("passport.open.tournamentHistory")

                Divider().overlay(BaggerPalette.warmBorder)

                ForEach(Array(presentation.formatPerformance.enumerated()), id: \.element.id) { index, format in
                    NavigationLink(value: MoreDestination.passportFormat(code: format.formatCode)) {
                        PassportNavigationRow(
                            title: format.label,
                            detail: format.record,
                            systemImage: "chart.bar"
                        )
                    }
                    .accessibilityIdentifier("passport.open.format.\(format.formatCode)")
                    if index < presentation.formatPerformance.count - 1 {
                        Divider().overlay(BaggerPalette.warmBorder)
                    }
                }

                if !presentation.formatPerformance.isEmpty {
                    Divider().overlay(BaggerPalette.warmBorder)
                }

                NavigationLink(value: MoreDestination.passportCaptainLegacy) {
                    PassportNavigationRow(
                        title: "Captain Legacy",
                        detail: presentation.captainLegacy.record,
                        systemImage: "person.badge.shield.checkmark"
                    )
                }
                .accessibilityIdentifier("passport.open.captainLegacy")
            }
            .baggerCard()
        }
    }

    private var accountSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            BaggerSectionHeading("Account")
            VStack(alignment: .leading, spacing: 12) {
                DisclosureGroup("App Details") {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(buildInfo.versionAndBuildText)
                            .font(.footnote)
                            .foregroundStyle(BaggerPalette.muted)
                    }
                    .padding(.top, 8)
                }
                .tint(BaggerPalette.actionGreen)
                .accessibilityIdentifier("passport.supportDetails")

                Button("Sign Out", role: .destructive, action: onSignOut)
                    .buttonStyle(.bordered)
                    .controlSize(.large)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .accessibilityHint("Signs out after checking for unresolved saved scores")
                    .accessibilityIdentifier("passport.signOut")
            }
            .baggerCard()
        }
    }

    private func value(_ id: String, _ label: String, _ value: String) -> MoreLabeledValuePresentation {
        MoreLabeledValuePresentation(id: id, label: label, value: value)
    }
}

private struct PassportNavigationRow: View {
    let title: String
    let detail: String
    let systemImage: String

    var body: some View {
        Label {
            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(.body.weight(.semibold))
                    .foregroundStyle(BaggerPalette.ink)
                Text(detail)
                    .font(.footnote)
                    .foregroundStyle(BaggerPalette.muted)
            }
        } icon: {
            Image(systemName: systemImage)
                .foregroundStyle(BaggerPalette.actionGreen)
        }
        .padding(.vertical, 7)
        .accessibilityElement(children: .combine)
    }
}

private struct PassportValueSection: View {
    let title: String
    let values: [MoreLabeledValuePresentation]
    let identifier: String

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            BaggerSectionHeading(title)
            PassportLabeledValueGrid(values: values)
                .baggerCard()
        }
        .accessibilityIdentifier(identifier)
    }
}

private struct PassportExpandableValueSection: View {
    let title: String
    let values: [MoreLabeledValuePresentation]
    let identifier: String

    var body: some View {
        DisclosureGroup {
            if values.isEmpty {
                Text("No published values are available yet.")
                    .font(.subheadline)
                    .foregroundStyle(BaggerPalette.muted)
                    .padding(.top, 8)
            } else {
                PassportLabeledValueGrid(values: values)
                    .padding(.top, 10)
            }
        } label: {
            Text(title)
                .font(.headline)
                .foregroundStyle(BaggerPalette.ink)
        }
        .tint(BaggerPalette.actionGreen)
        .baggerCard()
        .accessibilityIdentifier(identifier)
    }
}

struct PassportLabeledValueGrid: View {
    let values: [MoreLabeledValuePresentation]
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        LazyVGrid(
            columns: Array(
                repeating: GridItem(.flexible(), alignment: .topLeading),
                count: dynamicTypeSize.isAccessibilitySize ? 1 : 2
            ),
            alignment: .leading,
            spacing: 14
        ) {
            ForEach(values) { value in
                MoreMetricView(label: value.label, value: value.value)
                    .accessibilityLabel(accessibilityLabel(for: value))
                    .accessibilityIdentifier("passport.metric.\(value.id)")
            }
        }
    }

    private func accessibilityLabel(for value: MoreLabeledValuePresentation) -> String {
        guard value.label == "Rank", value.value.hasPrefix("T#") else {
            return "\(value.label), \(value.value)"
        }
        return "Rank, tied for rank \(value.value.dropFirst(2))"
    }
}

private struct PassportHonorSection: View {
    let title: String
    let honors: [PassportHonorPresentation]
    let emptyMessage: String

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            BaggerSectionHeading(title)
            VStack(spacing: 0) {
                if honors.isEmpty {
                    Text(emptyMessage)
                        .font(.subheadline)
                        .foregroundStyle(BaggerPalette.muted)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.vertical, 4)
                } else {
                    ForEach(Array(honors.enumerated()), id: \.element.id) { index, honor in
                        HStack(alignment: .top, spacing: 10) {
                            Image(systemName: "medal.fill")
                                .foregroundStyle(BaggerPalette.goldText)
                                .accessibilityHidden(true)
                            VStack(alignment: .leading, spacing: 3) {
                                Text(honor.title).font(.headline)
                                if let detail = honor.detail {
                                    Text(detail).font(.subheadline).foregroundStyle(BaggerPalette.muted)
                                }
                            }
                            Spacer(minLength: 0)
                        }
                        .padding(.vertical, 8)
                        .accessibilityElement(children: .combine)
                        if index < honors.count - 1 { Divider().overlay(BaggerPalette.warmBorder) }
                    }
                }
            }
            .baggerCard()
        }
    }
}

private struct PassportRankingSection: View {
    let rankings: [PassportRankingPresentation]

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            BaggerSectionHeading("Career Rankings")
            VStack(spacing: 0) {
                ForEach(Array(rankings.enumerated()), id: \.element.id) { index, ranking in
                    HStack(alignment: .firstTextBaseline) {
                        Text(ranking.title)
                            .foregroundStyle(BaggerPalette.ink)
                        Spacer(minLength: 12)
                        Text(ranking.rank ?? "Not ranked")
                            .fontWeight(.bold)
                            .foregroundStyle(BaggerPalette.actionGreen)
                    }
                    .padding(.vertical, 9)
                    .accessibilityElement(children: .combine)
                    if index < rankings.count - 1 { Divider().overlay(BaggerPalette.warmBorder) }
                }
            }
            .baggerCard()
        }
    }
}

private struct PassportRivalCard: View {
    let rival: PassportRivalPresentation

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            BaggerSectionHeading("Biggest Rival")
            VStack(alignment: .leading, spacing: 5) {
                Text(rival.displayName)
                    .font(.headline)
                    .foregroundStyle(BaggerPalette.ink)
                Text([rival.record, rival.points].compactMap { $0 }.joined(separator: " · "))
                    .font(.subheadline)
                    .foregroundStyle(BaggerPalette.muted)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .baggerCard()
            .accessibilityElement(children: .combine)
        }
    }
}

private struct PassportPartnerSection: View {
    let partners: [PassportPartnerPresentation]

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            BaggerSectionHeading("Top Partners")
            VStack(spacing: 0) {
                if partners.isEmpty {
                    Text("No partner results are published yet.")
                        .font(.subheadline)
                        .foregroundStyle(BaggerPalette.muted)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.vertical, 4)
                } else {
                    ForEach(Array(partners.enumerated()), id: \.element.id) { index, partner in
                        HStack(alignment: .top, spacing: 10) {
                            Text(partner.rank)
                                .font(.headline.monospacedDigit())
                                .foregroundStyle(BaggerPalette.goldText)
                                .frame(minWidth: 32, alignment: .leading)
                            VStack(alignment: .leading, spacing: 3) {
                                Text(partner.displayName).font(.headline)
                                Text([partner.record, partner.points].compactMap { $0 }.joined(separator: " · "))
                                    .font(.subheadline)
                                    .foregroundStyle(BaggerPalette.muted)
                            }
                            Spacer(minLength: 0)
                        }
                        .padding(.vertical, 9)
                        .accessibilityElement(children: .combine)
                        .accessibilityLabel(
                            partner.tied
                                ? "Tied for rank \(partner.rank.dropFirst(2)), \(partner.displayName), \(partner.record)\(partner.points.map { ", \($0)" } ?? "")"
                                : "Rank \(partner.rank.dropFirst()), \(partner.displayName), \(partner.record)\(partner.points.map { ", \($0)" } ?? "")"
                        )
                        .accessibilityIdentifier("passport.partner.\(partner.id)")
                        if index < partners.count - 1 { Divider().overlay(BaggerPalette.warmBorder) }
                    }
                }
            }
            .baggerCard()
        }
    }
}

private struct PassportDraftSection: View {
    let entries: [PassportDraftPresentation]

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            BaggerSectionHeading("Draft History")
            VStack(spacing: 0) {
                if entries.isEmpty {
                    Text("No draft history is published yet.")
                        .font(.subheadline)
                        .foregroundStyle(BaggerPalette.muted)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.vertical, 4)
                } else {
                    ForEach(Array(entries.enumerated()), id: \.element.id) { index, entry in
                        VStack(alignment: .leading, spacing: 4) {
                            Text("\(entry.year) · \(entry.pick)")
                                .font(.headline)
                                .foregroundStyle(BaggerPalette.ink)
                            Text(entry.teamName)
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(BaggerPalette.actionGreen)
                            Text([entry.finish, entry.draftValueScore].compactMap { $0 }.joined(separator: " · "))
                                .font(.footnote)
                                .foregroundStyle(BaggerPalette.muted)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.vertical, 8)
                        .accessibilityElement(children: .combine)
                        .accessibilityIdentifier("passport.draft.\(entry.year)")
                        if index < entries.count - 1 { Divider().overlay(BaggerPalette.warmBorder) }
                    }
                }
            }
            .baggerCard()
        }
    }
}

private struct PassportSimpleEmptySection: View {
    let title: String
    let message: String

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            BaggerSectionHeading(title)
            Text(message)
                .font(.subheadline)
                .foregroundStyle(BaggerPalette.muted)
                .frame(maxWidth: .infinity, alignment: .leading)
                .baggerCard()
        }
    }
}

private struct PassportTournamentHistoryView: View {
    let entries: [PassportTournamentHistoryPresentation]
    let freshness: MobileReadFreshness
    let onRefresh: @MainActor @Sendable () async -> Void

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: BaggerLayout.sectionSpacing) {
                MoreFreshnessBannerView(
                    productName: "Player Passport",
                    freshness: freshness,
                    identifierPrefix: "passport"
                )
                if entries.isEmpty {
                    MoreEmptyStateView(
                        title: "No tournament appearances are available yet.",
                        systemImage: "calendar.badge.exclamationmark",
                        identifier: "passport.history.empty"
                    )
                } else {
                    ForEach(entries) { entry in
                        VStack(alignment: .leading, spacing: 7) {
                            HStack(alignment: .firstTextBaseline) {
                                Text(String(entry.year))
                                    .font(.title2.bold())
                                    .foregroundStyle(BaggerPalette.ink)
                                Spacer(minLength: 12)
                                Text(entry.result)
                                    .font(.subheadline.weight(.bold))
                                    .foregroundStyle(BaggerPalette.actionGreen)
                            }
                            if let teamName = entry.teamName { Text(teamName).font(.headline) }
                            Text([entry.record, entry.points, entry.averageScore].compactMap { $0 }.joined(separator: " · "))
                                .font(.subheadline)
                                .foregroundStyle(BaggerPalette.muted)
                                .fixedSize(horizontal: false, vertical: true)
                            if entry.wasCaptain { Label("Captain", systemImage: "person.badge.shield.checkmark") }
                            if !entry.honors.isEmpty {
                                Text(entry.honors.joined(separator: " · "))
                                    .font(.footnote.weight(.semibold))
                                    .foregroundStyle(BaggerPalette.goldText)
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .baggerCard()
                        .accessibilityElement(children: .combine)
                        .accessibilityIdentifier("passport.history.\(entry.year)")
                    }
                }
            }
            .padding(BaggerLayout.pageInset)
        }
        .background(BaggerPalette.canvas.ignoresSafeArea())
        .refreshable(action: onRefresh)
        .accessibilityIdentifier("passport.history.screen")
    }
}

private struct PassportFormatDetailView: View {
    let format: PassportFormatPresentation
    let freshness: MobileReadFreshness
    let onRefresh: @MainActor @Sendable () async -> Void

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: BaggerLayout.sectionSpacing) {
                MoreFreshnessBannerView(
                    productName: "Player Passport",
                    freshness: freshness,
                    identifierPrefix: "passport"
                )
                VStack(alignment: .leading, spacing: 7) {
                    BaggerEyebrow(text: format.formatCode)
                    Text(format.label)
                        .font(.system(.largeTitle, design: .serif, weight: .bold))
                        .foregroundStyle(BaggerPalette.ink)
                    Text(format.scoringLabel)
                        .font(.headline)
                        .foregroundStyle(BaggerPalette.actionGreen)
                    Text([format.record, format.points, format.winPercentage, format.scoringAverage, format.yearRange]
                        .compactMap { $0 }.joined(separator: " · "))
                        .font(.subheadline)
                        .foregroundStyle(BaggerPalette.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .baggerCard(border: BaggerPalette.matchBorder)

                BaggerSectionHeading("Matches")
                if format.matches.isEmpty {
                    MoreEmptyStateView(
                        title: "No matches are available for this format.",
                        systemImage: "flag.checkered",
                        identifier: "passport.format.empty"
                    )
                } else {
                    ForEach(format.matches) { match in
                        VStack(alignment: .leading, spacing: 6) {
                            HStack(alignment: .firstTextBaseline) {
                                Text("\(match.year) · \(match.roundLabel)")
                                    .font(.headline)
                                Spacer(minLength: 12)
                                Text(match.outcome)
                                    .font(.subheadline.weight(.bold))
                                    .foregroundStyle(BaggerPalette.actionGreen)
                            }
                            if !match.partnerNames.isEmpty {
                                Text("With \(match.partnerNames.joined(separator: ", "))")
                            }
                            if !match.opponentNames.isEmpty {
                                Text("Against \(match.opponentNames.joined(separator: ", "))")
                            }
                            if let teamName = match.teamName,
                               let opposingTeamName = match.opposingTeamName
                            {
                                Label("\(teamName) vs \(opposingTeamName)", systemImage: "person.2")
                                    .foregroundStyle(BaggerPalette.muted)
                            } else if let teamName = match.teamName {
                                Label(teamName, systemImage: "person.2")
                                    .foregroundStyle(BaggerPalette.muted)
                            }
                            if let winner = match.winner {
                                Text([
                                    "Winner: \(winner)",
                                    match.winnerSide.map { "Side \($0)" },
                                ].compactMap { $0 }.joined(separator: " · "))
                                    .fontWeight(.semibold)
                                    .foregroundStyle(BaggerPalette.actionGreen)
                            }
                            if let courseName = match.courseName {
                                Label(courseName, systemImage: "flag")
                                    .foregroundStyle(BaggerPalette.muted)
                            }
                            if !match.segments.isEmpty {
                                PassportLabeledValueGrid(values: match.segments)
                                    .padding(.top, 3)
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .font(.subheadline)
                        .baggerCard()
                        .accessibilityElement(children: .combine)
                        .accessibilityLabel(formatMatchAccessibilityLabel(match))
                        .accessibilityIdentifier("passport.format.match.\(match.id)")
                    }
                }
            }
            .padding(BaggerLayout.pageInset)
        }
        .background(BaggerPalette.canvas.ignoresSafeArea())
        .refreshable(action: onRefresh)
        .accessibilityIdentifier("passport.format.screen")
    }

    private func formatMatchAccessibilityLabel(_ match: PassportFormatMatchPresentation) -> String {
        var parts = ["\(match.year)", match.roundLabel, match.outcome]
        if !match.partnerNames.isEmpty {
            parts.append("With \(match.partnerNames.joined(separator: ", "))")
        }
        if !match.opponentNames.isEmpty {
            parts.append("Against \(match.opponentNames.joined(separator: ", "))")
        }
        if let teamName = match.teamName, let opposingTeamName = match.opposingTeamName {
            parts.append("\(teamName) vs \(opposingTeamName)")
        } else if let teamName = match.teamName {
            parts.append(teamName)
        }
        if let winner = match.winner {
            parts.append("Winner: \(winner)")
        }
        if let winnerSide = match.winnerSide {
            parts.append("Winner side \(winnerSide)")
        }
        if let courseName = match.courseName {
            parts.append(courseName)
        }
        parts.append(contentsOf: match.segments.map { "\($0.label), \($0.value)" })
        return parts.joined(separator: ", ")
    }
}

private struct PassportCaptainLegacyView: View {
    let legacy: PassportCaptainLegacyPresentation
    let freshness: MobileReadFreshness
    let onRefresh: @MainActor @Sendable () async -> Void

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: BaggerLayout.sectionSpacing) {
                MoreFreshnessBannerView(
                    productName: "Player Passport",
                    freshness: freshness,
                    identifierPrefix: "passport"
                )
                HStack(spacing: 12) {
                    MoreMetricView(label: "Captain Record", value: legacy.record)
                    MoreMetricView(label: "Championships", value: String(legacy.championships))
                }
                .baggerCard(border: BaggerPalette.matchBorder)

                BaggerSectionHeading("Seasons")
                ForEach(legacy.seasons) { season in
                    HStack(alignment: .top, spacing: 12) {
                        Text(String(season.year))
                            .font(.title3.bold())
                            .foregroundStyle(BaggerPalette.goldText)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(season.teamName ?? "Team not assigned").font(.headline)
                            Text(season.result).font(.subheadline).foregroundStyle(BaggerPalette.muted)
                        }
                        Spacer(minLength: 0)
                    }
                    .baggerCard()
                    .accessibilityElement(children: .combine)
                    .accessibilityIdentifier("passport.captain.\(season.year)")
                }
            }
            .padding(BaggerLayout.pageInset)
        }
        .background(BaggerPalette.canvas.ignoresSafeArea())
        .refreshable(action: onRefresh)
        .accessibilityIdentifier("passport.captain.screen")
    }
}

struct MoreEmptyStatePage: View {
    let title: String
    let message: String
    let identifier: String

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title).font(.headline).foregroundStyle(BaggerPalette.ink)
            Text(message).font(.subheadline).foregroundStyle(BaggerPalette.muted)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .padding(BaggerLayout.pageInset)
        .background(BaggerPalette.canvas.ignoresSafeArea())
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier(identifier)
    }
}
