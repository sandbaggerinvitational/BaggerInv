import SwiftUI

struct TodayRepositoryDiagnostics: Equatable, Sendable {
    let today: String
    let matches: String
    let leaders: String
    let schedule: String

    init(
        today: MobileReadState<MobileTodayData>,
        matches: MobileReadState<MobileMatchesData>,
        leaders: MobileReadState<MobileLeadersData>,
        schedule: MobileReadState<MobileScheduleData>
    ) {
        self.today = Self.summary(today)
        self.matches = Self.summary(matches)
        self.leaders = Self.summary(leaders)
        self.schedule = Self.summary(schedule)
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
        return "\(availability); freshness \(state.freshness.rawValue); source \(source); revision \(state.revision == nil ? "missing" : "present")"
    }
}

struct TodayRepositoryView: View {
    let participant: ParticipantSession
    let coordinator: TournamentDataCoordinator
    let onOpenMatch: (String) -> Void
    let onOpenLeaders: () -> Void
    let onOpenFullSchedule: () -> Void

    @ObservedObject private var today: MobileReadRepository<MobileTodayResponse>
    @ObservedObject private var matches: MobileReadRepository<MobileMatchesResponse>
    @ObservedObject private var leaders: MobileReadRepository<MobileLeadersResponse>
    @ObservedObject private var schedule: MobileReadRepository<MobileScheduleResponse>

    init(
        participant: ParticipantSession,
        coordinator: TournamentDataCoordinator,
        onOpenMatch: @escaping (String) -> Void = { _ in },
        onOpenLeaders: @escaping () -> Void = {},
        onOpenFullSchedule: @escaping () -> Void = {}
    ) {
        self.participant = participant
        self.coordinator = coordinator
        self.onOpenMatch = onOpenMatch
        self.onOpenLeaders = onOpenLeaders
        self.onOpenFullSchedule = onOpenFullSchedule
        _today = ObservedObject(wrappedValue: coordinator.today)
        _matches = ObservedObject(wrappedValue: coordinator.matches)
        _leaders = ObservedObject(wrappedValue: coordinator.leaders)
        _schedule = ObservedObject(wrappedValue: coordinator.schedule)
    }

    var body: some View {
        let presentation = TodayPresenter.make(
            participant: participant,
            today: today.state,
            matches: matches.state,
            leaders: leaders.state,
            schedule: schedule.state,
            now: Date()
        )
        TodayScreen(
            presentation: presentation,
            readDiagnostics: BaggerAcceptanceProbes.isEnabled()
                ? TodayRepositoryDiagnostics(
                    today: today.state,
                    matches: matches.state,
                    leaders: leaders.state,
                    schedule: schedule.state
                )
                : nil,
            isRefreshing: today.state.isRefreshing || matches.state.isRefreshing ||
                leaders.state.isRefreshing || schedule.state.isRefreshing,
            onRefresh: { await coordinator.refreshTodaySurface() },
            onOpenMatch: onOpenMatch,
            onOpenLeaders: onOpenLeaders,
            onOpenFullSchedule: onOpenFullSchedule
        )
    }
}

struct TodayScreen: View {
    let presentation: TodayPresentation
    var readDiagnostics: TodayRepositoryDiagnostics?
    let isRefreshing: Bool
    let onRefresh: @MainActor @Sendable () async -> Void
    let onOpenMatch: (String) -> Void
    let onOpenLeaders: () -> Void
    let onOpenFullSchedule: () -> Void

    init(
        presentation: TodayPresentation,
        readDiagnostics: TodayRepositoryDiagnostics? = nil,
        isRefreshing: Bool,
        onRefresh: @escaping @MainActor @Sendable () async -> Void,
        onOpenMatch: @escaping (String) -> Void = { _ in },
        onOpenLeaders: @escaping () -> Void = {},
        onOpenFullSchedule: @escaping () -> Void = {}
    ) {
        self.presentation = presentation
        self.readDiagnostics = readDiagnostics
        self.isRefreshing = isRefreshing
        self.onRefresh = onRefresh
        self.onOpenMatch = onOpenMatch
        self.onOpenLeaders = onOpenLeaders
        self.onOpenFullSchedule = onOpenFullSchedule
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: BaggerDesign.Space.sectionGap) {
                TournamentContextSection(section: presentation.tournament)

                if let banner = presentation.freshnessBanner {
                    TodayFreshnessBannerView(banner: banner)
                }

                if hasNoUsableProductData {
                    NoProductDataView(onRetry: onRefresh)
                } else {
                    CurrentMatchSection(
                        section: presentation.currentMatch,
                        onOpenMatch: onOpenMatch
                    )

                    PersonalMatchesSection(
                        section: presentation.personalMatches,
                        onOpenMatch: onOpenMatch
                    )

                    TournamentScoreSection(
                        section: presentation.tournamentScore,
                        participantTeamID: presentation.participant.teamID,
                        onOpenLeaders: onOpenLeaders
                    )

                    TodayScheduleSection(
                        section: presentation.schedule,
                        onOpenFullSchedule: onOpenFullSchedule
                    )
                }

                if isRefreshing {
                    HStack(spacing: 8) {
                        ProgressView()
                        Text("Refreshing tournament data")
                            .font(.footnote.weight(.semibold))
                    }
                    .foregroundStyle(BaggerPalette.muted)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
                    .accessibilityElement(children: .combine)
                }
            }
            .padding(.horizontal, BaggerDesign.Space.screenInset)
            .padding(.top, BaggerDesign.Space.medium)
            .padding(.bottom, BaggerDesign.Space.xxxLarge)
        }
        .baggerScreenBackground()
        .refreshable(action: onRefresh)
        .accessibilityIdentifier("today.screen")
        .overlay(alignment: .topLeading) {
            if let readDiagnostics {
                TodayReadDiagnosticProbes(diagnostics: readDiagnostics)
            }
        }
    }

    private var hasNoUsableProductData: Bool {
        [
            presentation.currentMatch.availability,
            presentation.personalMatches.availability,
            presentation.tournamentScore.availability,
            presentation.schedule.availability,
        ].allSatisfy { $0 == .unavailable }
    }
}

private struct NoProductDataView: View {
    let onRetry: @MainActor @Sendable () async -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("Today isn’t available right now", systemImage: "wifi.exclamationmark")
                .font(.headline)
                .foregroundStyle(BaggerPalette.ink)
            Text("Bagger could not load tournament information and there is no saved update on this device.")
                .font(.subheadline)
                .foregroundStyle(BaggerPalette.muted)
            Button("Try Again") {
                Task { await onRetry() }
            }
            .buttonStyle(.borderedProminent)
            .tint(BaggerPalette.actionGreen)
            .controlSize(.large)
            .accessibilityIdentifier("today.retry")
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .baggerCard(border: BaggerPalette.matchBorder)
    }
}

private struct TournamentContextSection: View {
    let section: TodaySection<TodayTournamentPresentation>
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        Group {
            if let tournament = section.value {
                if dynamicTypeSize.isAccessibilitySize {
                    VStack(alignment: .leading, spacing: BaggerDesign.Space.small) {
                        tournamentMark(tournament)
                        tournamentCopy(tournament)
                    }
                } else {
                    HStack(alignment: .center, spacing: BaggerDesign.Space.medium) {
                        tournamentMark(tournament)
                        tournamentCopy(tournament)
                        Spacer(minLength: 0)
                    }
                }
            } else {
                HStack(spacing: BaggerDesign.Space.medium) {
                    BaggerBrandMark(size: .large, accessibility: .decorative)
                    TodayLoadingLines(count: 2)
                    Spacer(minLength: 0)
                    TodayPreviewIndicator()
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, BaggerDesign.Space.large)
        .padding(.vertical, BaggerDesign.Space.medium)
        .background(
            LinearGradient(
                colors: [
                    BaggerDesign.Color.surfacePrimary,
                    BaggerDesign.Color.backgroundSecondary.opacity(0.72),
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            ),
            in: RoundedRectangle(cornerRadius: BaggerDesign.Radius.hero, style: .continuous)
        )
        .overlay {
            RoundedRectangle(cornerRadius: BaggerDesign.Radius.hero, style: .continuous)
                .stroke(
                    BaggerDesign.Color.borderDefault.opacity(0.38),
                    lineWidth: BaggerDesign.Border.thin
                )
        }
    }

    private func tournamentMark(_ tournament: TodayTournamentPresentation) -> some View {
        BaggerTournamentMark(
            year: tournament.year ?? -1,
            size: .large,
            accessibility: .decorative
        )
        .accessibilityIdentifier("today.tournamentMark")
    }

    private func tournamentCopy(_ tournament: TodayTournamentPresentation) -> some View {
        VStack(alignment: .leading, spacing: BaggerDesign.Space.xSmall) {
            HStack(alignment: .firstTextBaseline, spacing: BaggerDesign.Space.small) {
                BaggerEyebrow(
                    text: tournament.year.map(String.init) ?? "TOURNAMENT"
                )
                .accessibilityIdentifier("today.tournamentYear")
                Spacer(minLength: BaggerDesign.Space.xSmall)
                TodayPreviewIndicator()
            }
            Text(tournament.name)
                .font(BaggerDesign.Typography.titlePrimary)
                .foregroundStyle(BaggerDesign.Color.textPrimary)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("today.tournamentContext")

            let context = [tournament.roundText, tournament.statusText].compactMap { $0 }
            if !context.isEmpty {
                Text(context.joined(separator: " · "))
                    .font(BaggerDesign.Typography.bodyEmphasis)
                    .foregroundStyle(BaggerDesign.Color.brandAction)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("today.tournamentLifecycle")
            }

            if tournament.isSessionFallback && section.availability != .content {
                Label("Tournament details are updating", systemImage: "arrow.triangle.2.circlepath")
                    .font(BaggerDesign.Typography.caption)
                    .foregroundStyle(BaggerDesign.Color.textSecondary)
            }
        }
        .accessibilityAddTraits(.isHeader)
    }
}

private struct TodayPreviewIndicator: View {
    var body: some View {
        Text("PREVIEW")
            .font(.caption2.weight(.semibold))
            .tracking(0.65)
            .foregroundStyle(BaggerDesign.Color.brandEvergreenDeep)
            .padding(.horizontal, 6)
            .padding(.vertical, BaggerDesign.Space.hairline)
            .background(BaggerDesign.Color.brandGoldMuted.opacity(0.64), in: Capsule())
            .overlay {
                Capsule()
                    .stroke(BaggerDesign.Color.brandGold.opacity(0.66), lineWidth: BaggerDesign.Border.thin)
            }
            .fixedSize()
            .accessibilityLabel("Preview environment")
            .accessibilityIdentifier("today.previewIndicator")
    }
}

private struct CurrentMatchSection: View {
    let section: TodaySection<TodayMatchPresentation>
    let onOpenMatch: (String) -> Void

    var body: some View {
        Group {
            switch section.availability {
            case .content:
                if let match = section.value {
                    Button {
                        onOpenMatch(match.matchID)
                    } label: {
                        CurrentMatchCard(match: match)
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("today.currentMatch.\(match.matchID)")
                    .accessibilityLabel(match.accessibilitySummary)
                    .accessibilityHint("View Match Details")
                }
            case .loading:
                VStack(alignment: .leading, spacing: 12) {
                    TodayLoadingLines(count: 5)
                }
                .baggerCard(border: BaggerPalette.matchBorder)
                .accessibilityLabel("Loading your current match")
            case .empty:
                TodayEmptyCard(
                    symbol: "flag.checkered",
                    title: "No current match",
                    message: "Your tournament match will appear here when one is available."
                )
            case .unavailable:
                TodayUnavailableCard(
                    title: "Match unavailable",
                    message: "Your current match could not be loaded right now."
                )
            }
        }
    }
}

private struct CurrentMatchCard: View {
    let match: TodayMatchPresentation
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        VStack(alignment: .leading, spacing: BaggerDesign.Space.medium) {
            Group {
                if dynamicTypeSize.isAccessibilitySize {
                    VStack(alignment: .leading, spacing: 10) {
                        matchHeading
                        MatchStatusPill(status: match.statusText)
                    }
                } else {
                    HStack(alignment: .top, spacing: 12) {
                        matchHeading
                        Spacer(minLength: 4)
                        MatchStatusPill(status: match.statusText)
                    }
                }
            }

            if let courseLine = courseLine {
                HStack(alignment: .center, spacing: BaggerDesign.Space.medium) {
                    BaggerCourseLogo(
                        courseID: match.courseID ?? "",
                        courseName: match.courseName ?? "Golf course",
                        size: .medium,
                        accessibility: .decorative
                    )
                    .accessibilityIdentifier("today.currentMatch.courseLogo")

                    VStack(alignment: .leading, spacing: BaggerDesign.Space.xSmall) {
                        Text(courseLine)
                            .font(BaggerDesign.Typography.bodyEmphasis)
                            .foregroundStyle(BaggerDesign.Color.brandAction)
                            .fixedSize(horizontal: false, vertical: true)
                        if let time = match.teeTimeLabel {
                            Label(time, systemImage: "clock.fill")
                                .font(BaggerDesign.Typography.captionEmphasis)
                                .foregroundStyle(BaggerDesign.Color.textPrimary)
                        }
                    }
                }
                .accessibilityIdentifier("today.currentMatch.courseIdentity")
            } else if let time = match.teeTimeLabel {
                Label(time, systemImage: "clock.fill")
                    .font(BaggerDesign.Typography.bodyEmphasis)
                    .foregroundStyle(BaggerDesign.Color.textPrimary)
            }

            if let own = match.ownSide, let opponent = match.opponentSide {
                MatchSidesView(own: own, opponent: opponent)
            }

            if let progress = match.progressText {
                Label(progress, systemImage: "location.fill")
                    .font(.headline)
                    .foregroundStyle(BaggerPalette.actionGreen)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(12)
                    .background(BaggerPalette.evergreen.opacity(0.09), in: RoundedRectangle(cornerRadius: 12))
            }

            if let result = match.resultText {
                Label(result, systemImage: "checkmark.seal.fill")
                    .font(.headline)
                    .foregroundStyle(BaggerPalette.actionGreen)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(12)
                    .background(BaggerPalette.evergreen.opacity(0.09), in: RoundedRectangle(cornerRadius: 12))
            }

            HStack(spacing: BaggerDesign.Space.small) {
                Text("View Match Details")
                    .font(BaggerDesign.Typography.button)
                Spacer(minLength: BaggerDesign.Space.small)
                Image(systemName: "chevron.right")
                    .font(.footnote.weight(.bold))
            }
            .foregroundStyle(BaggerDesign.Color.brandAction)
            .frame(minHeight: BaggerDesign.Size.minimumTouchTarget)
            .accessibilityHidden(true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
        .baggerCard(style: .selected)
    }

    private var courseLine: String? {
        [match.courseName, match.tee].compactMap { $0 }.joined(separator: " · ").nilIfEmpty
    }

    private var matchHeading: some View {
        VStack(alignment: .leading, spacing: 5) {
            BaggerEyebrow(text: match.eyebrow)
            if let round = match.roundText {
                Text([round, match.format].compactMap { $0 }.joined(separator: " · "))
                    .font(.system(.title3, design: .serif, weight: .bold))
                    .foregroundStyle(BaggerPalette.ink)
                    .fixedSize(horizontal: false, vertical: true)
            } else if let format = match.format {
                Text(format)
                    .font(.system(.title3, design: .serif, weight: .bold))
                    .foregroundStyle(BaggerPalette.ink)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

private struct MatchSidesView: View {
    let own: TodayMatchSidePresentation
    let opponent: TodayMatchSidePresentation
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        Group {
            if dynamicTypeSize.isAccessibilitySize {
                VStack(spacing: BaggerDesign.Space.small) {
                    MatchSideView(side: own, isOwnSide: true)
                    versus
                    MatchSideView(side: opponent, isOwnSide: false)
                }
            } else {
                HStack(alignment: .center, spacing: BaggerDesign.Space.small) {
                    MatchSideView(side: own, isOwnSide: true)
                        .frame(maxWidth: .infinity)
                    versus
                    MatchSideView(side: opponent, isOwnSide: false)
                        .frame(maxWidth: .infinity)
                }
            }
        }
        .accessibilityElement(children: .contain)
    }

    private var versus: some View {
        Text("VS")
            .font(.caption.weight(.black))
            .foregroundStyle(BaggerPalette.liveRed)
            .accessibilityHidden(true)
    }
}

private struct MatchSideView: View {
    let side: TodayMatchSidePresentation
    let isOwnSide: Bool

    var body: some View {
        VStack(spacing: 6) {
            BaggerTeamLogo(
                teamID: side.teamID ?? "",
                teamName: side.name ?? "Side \(side.side)",
                size: .medium,
                accessibility: .decorative
            )
            .scaleEffect(1.12)
            .frame(width: 50, height: 50)

            if let name = side.name {
                Text(name)
                    .font(.footnote.weight(.bold))
                    .foregroundStyle(BaggerDesign.Color.brandEvergreenSoft)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }
            ForEach(side.participants, id: \.playerID) { participant in
                Text(participant.displayName)
                    .font(.subheadline.weight(participant.isAuthenticatedPlayer ? .bold : .medium))
                    .foregroundStyle(BaggerPalette.ink)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilitySummary)
        .accessibilityIdentifier("today.currentMatch.side.\(side.side)")
    }

    private var accessibilitySummary: String {
        let ownership = isOwnSide ? "Your side" : "Opponents"
        let team = side.name.map { ", team \($0)" } ?? ""
        let players = side.participants.map(\.displayName).joined(separator: ", ")
        return "\(ownership)\(team): \(players)"
    }
}

private struct PersonalMatchesSection: View {
    let section: TodaySection<[TodayPersonalMatchPresentation]>
    let onOpenMatch: (String) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            BaggerSectionHeading("Your Matches")
                .accessibilityIdentifier("today.yourMatches")
            switch section.availability {
            case .content:
                if let matches = section.value {
                    VStack(spacing: 0) {
                        ForEach(Array(matches.enumerated()), id: \.element.match.matchID) { index, item in
                            Button {
                                onOpenMatch(item.match.matchID)
                            } label: {
                                PersonalMatchRow(item: item)
                            }
                            .buttonStyle(.plain)
                            .accessibilityIdentifier("today.personalMatch.\(item.match.matchID)")
                            .accessibilityLabel(item.accessibilitySummary)
                            .accessibilityHint("Opens Match Detail")
                            if index < matches.count - 1 {
                                Divider().overlay(BaggerPalette.warmBorder)
                            }
                        }
                    }
                    .baggerCard()
                }
            case .loading:
                TodayLoadingCard()
            case .empty:
                TodayEmptyCard(
                    symbol: "person.2",
                    title: "No personal matches",
                    message: "Your matches will appear here when the tournament publishes them."
                )
            case .unavailable:
                TodayUnavailableCard(
                    title: "Matches unavailable",
                    message: "Your match list could not be loaded right now."
                )
            }
        }
    }
}

private struct PersonalMatchRow: View {
    let item: TodayPersonalMatchPresentation

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 7) {
                    Text(item.match.roundText ?? "Match")
                        .font(.headline)
                    if item.isCurrent {
                        Text("CURRENT")
                            .font(.caption2.weight(.black))
                            .tracking(0.8)
                            .foregroundStyle(BaggerPalette.goldText)
                    }
                }
                if let opponents = opponentNames {
                    Text("vs \(opponents)")
                        .font(.subheadline)
                        .foregroundStyle(BaggerDesign.Color.textPrimary.opacity(0.78))
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            Spacer(minLength: 8)
            VStack(alignment: .trailing, spacing: 3) {
                Text(item.match.statusText)
                    .font(.caption.weight(.bold))
                    .foregroundStyle(statusColor)
                if let detail = item.match.resultText ?? item.match.progressText ?? item.match.teeTimeLabel {
                    Text(detail)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(BaggerPalette.ink)
                        .multilineTextAlignment(.trailing)
                }
            }
            Image(systemName: "chevron.right")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(BaggerDesign.Color.textMuted)
                .accessibilityHidden(true)
        }
        .frame(minHeight: BaggerDesign.Size.minimumTouchTarget)
        .contentShape(Rectangle())
        .padding(.vertical, 10)
    }

    private var opponentNames: String? {
        item.match.opponentSide?.participants.map(\.displayName).joined(separator: " + ").nilIfEmpty
    }

    private var statusColor: Color {
        item.match.statusText == "Live" ? BaggerPalette.liveRed : BaggerPalette.actionGreen
    }
}

private extension TodayPersonalMatchPresentation {
    var accessibilitySummary: String {
        let round = match.roundText ?? "Match"
        let opponents = match.opponentSide?.participants.map(\.displayName).joined(separator: ", ")
        let detail = match.resultText ?? match.progressText ?? match.teeTimeLabel
        return [
            isCurrent ? "Current match" : round,
            opponents.map { "versus \($0)" },
            match.statusText,
            detail,
        ].compactMap { $0 }.joined(separator: ", ")
    }
}

private extension TodayMatchPresentation {
    var accessibilitySummary: String {
        let course = [courseName, tee].compactMap { $0 }.joined(separator: ", ").nilIfEmpty
        let ownPlayers = ownSide?.participants.map(\.displayName).joined(separator: ", ").nilIfEmpty
        let opponentPlayers = opponentSide?.participants.map(\.displayName).joined(separator: ", ").nilIfEmpty
        let ownIdentity = [ownSide?.name, ownPlayers].compactMap { $0 }.joined(separator: ", ").nilIfEmpty
        let opponentIdentity = [opponentSide?.name, opponentPlayers]
            .compactMap { $0 }
            .joined(separator: ", ")
            .nilIfEmpty
        let matchup: String? = {
            switch (ownIdentity, opponentIdentity) {
            case let (.some(own), .some(opponents)):
                return "Your side, \(own), versus \(opponents)"
            case let (.some(own), .none):
                return "Your side, \(own)"
            case let (.none, .some(opponents)):
                return "Versus \(opponents)"
            case (.none, .none):
                return nil
            }
        }()

        return [
            "Current match",
            roundText,
            format,
            course,
            teeTimeLabel,
            matchup,
            "Status \(statusText)",
            progressText,
            resultText,
            "View Match Details",
        ].compactMap { $0 }.joined(separator: ", ")
    }
}

private struct TournamentScoreSection: View {
    let section: TodaySection<TodayTournamentScorePresentation>
    let participantTeamID: String?
    let onOpenLeaders: () -> Void
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            BaggerSectionHeading("Tournament Score")
                .accessibilityIdentifier("today.tournamentScore")
            switch section.availability {
            case .content:
                if let score = section.value {
                    Button(action: onOpenLeaders) {
                        VStack(alignment: .leading, spacing: 10) {
                            if let context = score.contextText {
                                Text(context.uppercased())
                                    .font(BaggerDesign.Typography.captionEmphasis)
                                    .tracking(1)
                                    .foregroundStyle(.white.opacity(0.78))
                            }
                            if dynamicTypeSize.isAccessibilitySize {
                                VStack(spacing: BaggerDesign.Space.medium) {
                                    teamScores(score.teams)
                                }
                            } else {
                                HStack(alignment: .top, spacing: BaggerDesign.Space.medium) {
                                    teamScores(score.teams)
                                }
                            }

                            HStack(spacing: BaggerDesign.Space.small) {
                                Text("View Leaders")
                                    .font(BaggerDesign.Typography.button)
                                Spacer(minLength: BaggerDesign.Space.small)
                                Image(systemName: "chevron.right")
                                    .font(.footnote.weight(.bold))
                            }
                            .foregroundStyle(.white)
                            .frame(minHeight: BaggerDesign.Size.minimumTouchTarget)
                            .accessibilityHidden(true)
                        }
                        .padding(.horizontal, BaggerDesign.Space.large)
                        .padding(.vertical, BaggerDesign.Space.medium)
                        .background(
                            LinearGradient(
                                colors: [BaggerPalette.deepEvergreen, BaggerPalette.actionGreen],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                        .clipShape(RoundedRectangle(cornerRadius: BaggerDesign.Radius.hero, style: .continuous))
                        .overlay {
                            RoundedRectangle(cornerRadius: BaggerDesign.Radius.hero, style: .continuous)
                                .stroke(BaggerPalette.softGreen, lineWidth: BaggerDesign.Border.thin)
                        }
                        .shadow(color: BaggerPalette.deepEvergreen.opacity(0.15), radius: 13, y: 7)
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("today.openLeaders")
                    .accessibilityHint("Opens Tournament Score in Leaders")
                }
            case .loading:
                TodayLoadingCard()
            case .empty:
                TodayEmptyCard(
                    symbol: "trophy",
                    title: "Score not posted",
                    message: "The canonical tournament score will appear when standings are available."
                )
            case .unavailable:
                TodayUnavailableCard(
                    title: "Tournament score unavailable",
                    message: "Standings could not be loaded right now."
                )
            }
        }
    }

    @ViewBuilder
    private func teamScores(_ teams: [TodayTeamScorePresentation]) -> some View {
        ForEach(teams, id: \.teamID) { team in
            VStack(alignment: .center, spacing: 4) {
                BaggerTeamLogo(
                    teamID: team.teamID,
                    teamName: team.name,
                    size: .medium,
                    accessibility: .decorative
                )
                .scaleEffect(1.12)
                .frame(width: 50, height: 50)
                .accessibilityIdentifier("today.tournamentScore.logo.\(team.teamID)")

                Text(team.name.uppercased())
                    .font(.caption.weight(.bold))
                    .tracking(0.7)
                    .foregroundStyle(.white.opacity(0.8))
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                    .overlay(alignment: .trailing) {
                        if team.teamID == participantTeamID {
                            Image(systemName: "person.fill")
                                .font(.caption2)
                                .foregroundStyle(BaggerPalette.scoreGold)
                                .offset(x: BaggerDesign.Space.large)
                                .accessibilityLabel("Your team")
                        }
                    }
                Text(team.pointsText)
                    .font(.system(.largeTitle, design: .rounded, weight: .bold))
                    .monospacedDigit()
                    .foregroundStyle(BaggerPalette.scoreGold)
                    .minimumScaleFactor(0.8)
                Text(team.record)
                    .font(.footnote.weight(.medium))
                    .foregroundStyle(.white.opacity(0.76))
                if team.isTiedForLead {
                    Text("Tied for lead")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(.white)
                } else if team.isSoleLeader {
                    Text("Leads")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(.white)
                }
            }
            .frame(maxWidth: .infinity, alignment: .center)
            .multilineTextAlignment(.center)
            .accessibilityElement(children: .combine)
            .accessibilityLabel(scoreAccessibilityLabel(team))
            .accessibilityIdentifier("today.tournamentScore.team.\(team.teamID)")
        }
    }

    private func scoreAccessibilityLabel(_ team: TodayTeamScorePresentation) -> String {
        var parts = ["\(team.name), \(team.pointsText) points, \(team.record)"]
        if team.teamID == participantTeamID { parts.append("your team") }
        if team.isTiedForLead { parts.append("tied for lead") }
        if team.isSoleLeader { parts.append("leads") }
        return parts.joined(separator: ", ")
    }
}

private struct TodayScheduleSection: View {
    let section: TodaySection<TodaySchedulePresentation>
    let onOpenFullSchedule: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            BaggerSectionHeading(section.value?.title ?? "Today’s Schedule")
                .accessibilityIdentifier("today.schedule")
            switch section.availability {
            case .content:
                if let schedule = section.value {
                    VStack(spacing: 0) {
                        ForEach(Array(schedule.events.enumerated()), id: \.offset) { index, event in
                            ScheduleEventRow(event: event)
                                .accessibilityIdentifier(
                                    "today.schedule.event.\(event.eventID ?? String(index))"
                                )
                            if index < schedule.events.count - 1 {
                                Divider().overlay(BaggerPalette.warmBorder)
                            }
                        }
                    }
                    .baggerCard()
                }
            case .loading:
                TodayLoadingCard()
            case .empty:
                TodayEmptyCard(
                    symbol: "calendar",
                    title: "No events today",
                    message: "There are no published schedule events for the current tournament day."
                )
            case .unavailable:
                TodayUnavailableCard(
                    title: "Schedule unavailable",
                    message: "Published tournament events could not be loaded right now."
                )
            }

            Button(action: onOpenFullSchedule) {
                Label("View Full Schedule", systemImage: "calendar")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(BaggerSecondaryButtonStyle(expands: true))
            .accessibilityHint("Opens the full tournament Schedule")
            .accessibilityIdentifier("today.fullSchedule")
        }
    }
}

private struct ScheduleEventRow: View {
    let event: TodayScheduleEventPresentation

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: symbol)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(BaggerPalette.actionGreen)
                .frame(width: 34, height: 34)
                .background(BaggerPalette.cream, in: Circle())
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 3) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(event.title)
                        .font(.headline)
                        .foregroundStyle(BaggerPalette.ink)
                    if event.isNow {
                        Text("NOW")
                            .font(.caption2.weight(.black))
                            .foregroundStyle(BaggerPalette.liveRed)
                    } else if event.isCompleted {
                        Text("ENDED")
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(BaggerPalette.muted)
                    }
                }
                if let time = eventTime {
                    Text(time)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(BaggerPalette.actionGreen)
                }
                if let subtitle = event.subtitle {
                    Text(subtitle)
                        .font(.subheadline)
                        .foregroundStyle(BaggerPalette.muted)
                }
                if let location = event.location {
                    Label(location, systemImage: "mappin")
                        .font(.footnote)
                        .foregroundStyle(BaggerPalette.muted)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, 10)
        .accessibilityElement(children: .combine)
    }

    private var eventTime: String? {
        switch (event.startTimeText, event.endTimeText) {
        case let (.some(start), .some(end)): return "\(start)–\(end)"
        case let (.some(start), .none): return start
        case (.none, .some(let end)): return "Ends \(end)"
        case (.none, .none): return nil
        }
    }

    private var symbol: String {
        switch event.type?.lowercased() {
        case "golf", "round", "tee-time", "tee_time": return "flag.fill"
        case "meal", "breakfast", "lunch", "dinner": return "fork.knife"
        case "awards", "ceremony": return "trophy.fill"
        case "social", "meeting": return "person.3.fill"
        default: return "calendar"
        }
    }
}

private struct MatchStatusPill: View {
    let status: String

    var body: some View {
        BaggerStatusBadge(kind: kind, title: status)
        .accessibilityLabel("Match status: \(status)")
    }

    private var kind: BaggerStatusKind {
        switch status {
        case "Live": .live
        case "Final": .final
        default: .upcoming
        }
    }
}

private struct TodayFreshnessBannerView: View {
    let banner: TodayFreshnessBanner

    var body: some View {
        BaggerFreshnessBanner(kind: freshnessKind, message: fullMessage)
        .accessibilityIdentifier("today.offlineStatus")
    }

    private var fullMessage: String {
        guard let date = banner.lastValidated else { return message }
        return "\(message) Last checked \(date.formatted(date: .omitted, time: .shortened))."
    }

    private var freshnessKind: BaggerFreshnessKind {
        switch banner.kind {
        case .cached: .cached
        case .stale: .stale
        case .offline: .offline
        }
    }

    private var message: String {
        switch banner.kind {
        case .cached: "Showing saved tournament data while Bagger refreshes."
        case .stale: "Showing the last update. Pull to refresh."
        case .offline: "Offline · showing the last verified update."
        }
    }
}

private struct TodayLoadingCard: View {
    var body: some View {
        TodayLoadingLines(count: 3)
            .baggerCard()
            .accessibilityLabel("Loading tournament information")
    }
}

private struct TodayLoadingLines: View {
    let count: Int

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            ForEach(0..<count, id: \.self) { index in
                RoundedRectangle(cornerRadius: 5)
                    .fill(BaggerPalette.warmBorder.opacity(0.58))
                    .frame(maxWidth: index.isMultiple(of: 2) ? .infinity : 230)
                    .frame(height: index == 0 ? 20 : 14)
            }
        }
        .redacted(reason: .placeholder)
        .accessibilityHidden(true)
    }
}

private struct TodayEmptyCard: View {
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
                Text(title)
                    .font(.headline)
                    .foregroundStyle(BaggerPalette.ink)
                Text(message)
                    .font(.subheadline)
                    .foregroundStyle(BaggerPalette.muted)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .baggerCard()
        .accessibilityElement(children: .combine)
    }
}

private struct TodayUnavailableCard: View {
    let title: String
    let message: String

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: "exclamationmark.circle")
                .foregroundStyle(BaggerPalette.goldText)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.headline)
                    .foregroundStyle(BaggerPalette.ink)
                Text(message)
                    .font(.subheadline)
                    .foregroundStyle(BaggerPalette.muted)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .baggerCard()
        .accessibilityElement(children: .combine)
    }
}

private extension String {
    var nilIfEmpty: String? { isEmpty ? nil : self }
}

private struct TodayReadDiagnosticProbes: View {
    let diagnostics: TodayRepositoryDiagnostics

    var body: some View {
        VStack(spacing: 0) {
            probe(identifier: "today.diagnostic.today", value: diagnostics.today)
            probe(identifier: "today.diagnostic.matches", value: diagnostics.matches)
            probe(identifier: "today.diagnostic.leaders", value: diagnostics.leaders)
            probe(identifier: "today.diagnostic.schedule", value: diagnostics.schedule)
        }
        .allowsHitTesting(false)
    }

    private func probe(identifier: String, value: String) -> some View {
        Text("Read diagnostic")
            .font(.system(size: 1))
            .frame(width: 1, height: 1)
            .opacity(0.01)
            .accessibilityValue(Text(value))
            .accessibilityIdentifier(identifier)
    }
}
