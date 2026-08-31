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

    @ObservedObject private var today: MobileReadRepository<MobileTodayResponse>
    @ObservedObject private var matches: MobileReadRepository<MobileMatchesResponse>
    @ObservedObject private var leaders: MobileReadRepository<MobileLeadersResponse>
    @ObservedObject private var schedule: MobileReadRepository<MobileScheduleResponse>

    init(participant: ParticipantSession, coordinator: TournamentDataCoordinator) {
        self.participant = participant
        self.coordinator = coordinator
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
            onRefresh: { await coordinator.refreshTodaySurface() }
        )
    }
}

struct TodayScreen: View {
    let presentation: TodayPresentation
    var readDiagnostics: TodayRepositoryDiagnostics?
    let isRefreshing: Bool
    let onRefresh: @MainActor @Sendable () async -> Void

    init(
        presentation: TodayPresentation,
        readDiagnostics: TodayRepositoryDiagnostics? = nil,
        isRefreshing: Bool,
        onRefresh: @escaping @MainActor @Sendable () async -> Void
    ) {
        self.presentation = presentation
        self.readDiagnostics = readDiagnostics
        self.isRefreshing = isRefreshing
        self.onRefresh = onRefresh
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: BaggerLayout.sectionSpacing) {
                TournamentContextSection(section: presentation.tournament)
                    .accessibilityIdentifier("today.tournamentContext")
                    .todayReadDiagnostic(readDiagnostics?.today)

                if let banner = presentation.freshnessBanner {
                    TodayFreshnessBannerView(banner: banner)
                }

                if hasNoUsableProductData {
                    NoProductDataView(onRetry: onRefresh)
                } else {
                    CurrentMatchSection(section: presentation.currentMatch)
                        .accessibilityIdentifier("today.matchHero")

                    PersonalMatchesSection(section: presentation.personalMatches)
                        .accessibilityIdentifier("today.yourMatches")
                        .todayReadDiagnostic(readDiagnostics?.matches)

                    TournamentScoreSection(
                        section: presentation.tournamentScore,
                        participantTeamID: presentation.participant.teamID
                    )
                    .accessibilityIdentifier("today.tournamentScore")
                    .todayReadDiagnostic(readDiagnostics?.leaders)

                    TodayScheduleSection(section: presentation.schedule)
                        .accessibilityIdentifier("today.schedule")
                        .todayReadDiagnostic(readDiagnostics?.schedule)
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
            .padding(.horizontal, BaggerLayout.pageInset)
            .padding(.top, 12)
            .padding(.bottom, 28)
        }
        .background(BaggerPalette.canvas.ignoresSafeArea())
        .refreshable(action: onRefresh)
        .accessibilityIdentifier("today.screen")
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

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            BaggerEyebrow(text: "Bagger Invitational")
            if let tournament = section.value {
                Text(tournament.name)
                    .font(.system(.title, design: .serif, weight: .bold))
                    .foregroundStyle(BaggerPalette.ink)
                    .fixedSize(horizontal: false, vertical: true)

                let details = [
                    tournament.year.map(String.init),
                    tournament.roundText,
                    tournament.statusText,
                ].compactMap { $0 }
                if !details.isEmpty {
                    Text(details.joined(separator: " · "))
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(BaggerPalette.actionGreen)
                }

                if tournament.isSessionFallback && section.availability != .content {
                    Label("Tournament details are updating", systemImage: "arrow.triangle.2.circlepath")
                        .font(.footnote)
                        .foregroundStyle(BaggerPalette.muted)
                }
            } else {
                TodayLoadingLines(count: 2)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 2)
        .accessibilityElement(children: .combine)
    }
}

private struct CurrentMatchSection: View {
    let section: TodaySection<TodayMatchPresentation>

    var body: some View {
        Group {
            switch section.availability {
            case .content:
                if let match = section.value {
                    CurrentMatchCard(match: match)
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
        VStack(alignment: .leading, spacing: 15) {
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
                Label(courseLine, systemImage: "flag.fill")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(BaggerPalette.actionGreen)
            }
            if let time = match.teeTimeLabel {
                Label(time, systemImage: "clock.fill")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(BaggerPalette.ink)
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
        }
        .baggerCard(border: BaggerPalette.matchBorder)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Current match, \(match.statusText)")
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
                VStack(spacing: 12) {
                    MatchSideView(side: own, isOwnSide: true)
                    versus
                    MatchSideView(side: opponent, isOwnSide: false)
                }
            } else {
                HStack(alignment: .center, spacing: 9) {
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
        VStack(spacing: 7) {
            ZStack {
                Circle()
                    .fill(isOwnSide ? BaggerPalette.scoreGold.opacity(0.48) : BaggerPalette.cream)
                Text(initials)
                    .font(.caption.weight(.black))
                    .foregroundStyle(BaggerPalette.deepEvergreen)
            }
            .frame(width: 42, height: 42)
            .accessibilityHidden(true)

            if let name = side.name {
                Text(name)
                    .font(.caption.weight(.bold))
                    .foregroundStyle(BaggerPalette.muted)
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
    }

    private var initials: String {
        let source = side.name ?? side.participants.first?.displayName ?? "Team"
        let words = source.split(separator: " ").prefix(2)
        return words.compactMap(\.first).map(String.init).joined().uppercased()
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

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            BaggerSectionHeading("Your Matches")
            switch section.availability {
            case .content:
                if let matches = section.value {
                    VStack(spacing: 0) {
                        ForEach(Array(matches.enumerated()), id: \.element.match.matchID) { index, item in
                            PersonalMatchRow(item: item)
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
                        .foregroundStyle(BaggerPalette.muted)
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
        }
        .padding(.vertical, 10)
        .accessibilityElement(children: .combine)
    }

    private var opponentNames: String? {
        item.match.opponentSide?.participants.map(\.displayName).joined(separator: " + ").nilIfEmpty
    }

    private var statusColor: Color {
        item.match.statusText == "Live" ? BaggerPalette.liveRed : BaggerPalette.actionGreen
    }
}

private struct TournamentScoreSection: View {
    let section: TodaySection<TodayTournamentScorePresentation>
    let participantTeamID: String?
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            BaggerSectionHeading("Tournament Score")
            switch section.availability {
            case .content:
                if let score = section.value {
                    VStack(alignment: .leading, spacing: 15) {
                        if let context = score.contextText {
                            Text(context.uppercased())
                                .font(.caption.weight(.bold))
                                .tracking(1)
                                .foregroundStyle(.white.opacity(0.72))
                        }
                        if dynamicTypeSize.isAccessibilitySize {
                            VStack(spacing: 16) {
                                teamScores(score.teams)
                            }
                        } else {
                            HStack(alignment: .top, spacing: 18) {
                                teamScores(score.teams)
                            }
                        }
                    }
                    .padding(18)
                    .background(
                        LinearGradient(
                            colors: [BaggerPalette.deepEvergreen, BaggerPalette.actionGreen],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .clipShape(RoundedRectangle(cornerRadius: BaggerLayout.cardRadius, style: .continuous))
                    .overlay {
                        RoundedRectangle(cornerRadius: BaggerLayout.cardRadius, style: .continuous)
                            .stroke(BaggerPalette.softGreen, lineWidth: 1)
                    }
                    .shadow(color: BaggerPalette.deepEvergreen.opacity(0.15), radius: 13, y: 7)
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
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 7) {
                    Text(team.name.uppercased())
                        .font(.caption.weight(.bold))
                        .tracking(0.7)
                        .foregroundStyle(.white.opacity(0.8))
                    if team.teamID == participantTeamID {
                        Image(systemName: "person.fill")
                            .font(.caption2)
                            .foregroundStyle(BaggerPalette.scoreGold)
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
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityElement(children: .combine)
            .accessibilityLabel(scoreAccessibilityLabel(team))
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

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            BaggerSectionHeading(section.value?.title ?? "Today’s Schedule")
            switch section.availability {
            case .content:
                if let schedule = section.value {
                    VStack(spacing: 0) {
                        ForEach(Array(schedule.events.enumerated()), id: \.offset) { index, event in
                            ScheduleEventRow(event: event)
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
        }
    }
}

private struct ScheduleEventRow: View {
    let event: TodayScheduleEventPresentation

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: symbol)
                .font(.headline)
                .foregroundStyle(BaggerPalette.actionGreen)
                .frame(width: 36, height: 36)
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
        HStack(spacing: 5) {
            if status == "Live" {
                Circle()
                    .fill(BaggerPalette.liveRed)
                    .frame(width: 7, height: 7)
                    .accessibilityHidden(true)
            }
            Text(status.uppercased())
                .font(.caption2.weight(.black))
                .tracking(0.6)
        }
        .foregroundStyle(status == "Live" ? BaggerPalette.liveRed : BaggerPalette.actionGreen)
        .padding(.horizontal, 9)
        .padding(.vertical, 6)
        .background(BaggerPalette.evergreen.opacity(0.09), in: Capsule())
        .fixedSize()
        .accessibilityLabel("Match status: \(status)")
    }
}

private struct TodayFreshnessBannerView: View {
    let banner: TodayFreshnessBanner

    var body: some View {
        HStack(spacing: 9) {
            Image(systemName: icon)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(message)
                    .font(.footnote.weight(.bold))
                if let date = banner.lastValidated {
                    Text("Last checked \(date.formatted(date: .omitted, time: .shortened))")
                        .font(.caption)
                }
            }
            Spacer(minLength: 0)
        }
        .foregroundStyle(BaggerPalette.ink)
        .padding(12)
        .background(BaggerPalette.scoreGold.opacity(0.28), in: RoundedRectangle(cornerRadius: 12))
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("today.offlineStatus")
    }

    private var message: String {
        switch banner.kind {
        case .cached: "Showing saved tournament data while Bagger refreshes."
        case .stale: "Showing the last update. Pull to refresh."
        case .offline: "Offline · showing the last verified update."
        }
    }

    private var icon: String {
        switch banner.kind {
        case .cached: "arrow.triangle.2.circlepath"
        case .stale: "clock.badge.exclamationmark"
        case .offline: "wifi.slash"
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

private struct TodayReadDiagnosticModifier: ViewModifier {
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
    func todayReadDiagnostic(_ value: String?) -> some View {
        modifier(TodayReadDiagnosticModifier(value: value))
    }
}
