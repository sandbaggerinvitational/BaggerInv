import Foundation

enum TodaySectionAvailability: Equatable, Sendable {
    case loading
    case content
    case empty
    case unavailable
}

enum TodayPresentedFreshness: Equatable, Sendable {
    case current
    case cached
    case refreshing
    case stale
    case offline
}

struct TodaySection<Value: Equatable & Sendable>: Equatable, Sendable {
    let availability: TodaySectionAvailability
    let value: Value?
    let freshness: TodayPresentedFreshness?
}

struct TodayParticipantPresentation: Equatable, Sendable {
    let playerID: String
    let displayName: String
    let teamID: String?
    let teamName: String?
    let tournamentID: String
}

struct TodayTournamentPresentation: Equatable, Sendable {
    let name: String
    let year: Int?
    let statusText: String?
    let roundText: String?
    let timeZoneIdentifier: String?
    let isSessionFallback: Bool
}

struct TodayMatchParticipantPresentation: Equatable, Sendable {
    let playerID: String
    let displayName: String
    let isAuthenticatedPlayer: Bool
}

struct TodayMatchSidePresentation: Equatable, Sendable {
    let side: Int
    let name: String?
    let participants: [TodayMatchParticipantPresentation]
}

struct TodayMatchPresentation: Equatable, Sendable {
    let matchID: String
    let eyebrow: String
    let statusText: String
    let roundText: String?
    let format: String?
    let ownSide: TodayMatchSidePresentation?
    let opponentSide: TodayMatchSidePresentation?
    let courseName: String?
    let tee: String?
    let teeTimeLabel: String?
    let progressText: String?
    let resultText: String?
}

struct TodayPersonalMatchPresentation: Equatable, Sendable {
    let match: TodayMatchPresentation
    let isCurrent: Bool
}

struct TodayTeamScorePresentation: Equatable, Sendable {
    let teamID: String
    let name: String
    let rank: Int?
    let points: Double?
    let pointsText: String
    let record: String
    let remainingMatches: Int?
    let isSoleLeader: Bool
    let isTiedForLead: Bool
}

struct TodayTournamentScorePresentation: Equatable, Sendable {
    let teams: [TodayTeamScorePresentation]
    let contextText: String?
}

enum TodayScheduleSource: Equatable, Sendable {
    case fullScheduleToday
    case immediateScheduleFallback
}

struct TodayScheduleEventPresentation: Equatable, Sendable {
    let eventID: String?
    let title: String
    let subtitle: String?
    let location: String?
    let type: String?
    let startTimeText: String?
    let endTimeText: String?
    let isNow: Bool
    let isCompleted: Bool
}

struct TodaySchedulePresentation: Equatable, Sendable {
    let title: String
    let source: TodayScheduleSource
    let events: [TodayScheduleEventPresentation]
}

enum TodayFreshnessBannerKind: Equatable, Sendable {
    case cached
    case stale
    case offline
}

struct TodayFreshnessBanner: Equatable, Sendable {
    let kind: TodayFreshnessBannerKind
    let lastValidated: Date?
}

struct TodayPresentation: Equatable, Sendable {
    let participant: TodayParticipantPresentation
    let tournament: TodaySection<TodayTournamentPresentation>
    let currentMatch: TodaySection<TodayMatchPresentation>
    let personalMatches: TodaySection<[TodayPersonalMatchPresentation]>
    let tournamentScore: TodaySection<TodayTournamentScorePresentation>
    let schedule: TodaySection<TodaySchedulePresentation>
    let freshnessBanner: TodayFreshnessBanner?
}

enum TodayPointsFormatter {
    static func string(for points: Double?) -> String {
        guard let points, points.isFinite else { return "—" }

        let magnitude = abs(points)
        let whole = magnitude.rounded(.down)
        let fraction = magnitude - whole
        let sign = points < 0 ? "-" : ""

        if fraction == 0, whole <= Double(Int.max) {
            return "\(sign)\(Int(whole))"
        }
        if fraction == 0.5, whole <= Double(Int.max) {
            return whole == 0 ? "\(sign)½" : "\(sign)\(Int(whole))½"
        }
        return String(points)
    }
}

enum TodayClockFormatter {
    static func string(for localTime: MobileLocalTime, locale: Locale = .autoupdatingCurrent) -> String {
        let components = localTime.rawValue.split(separator: ":").compactMap { Int($0) }
        guard components.count == 3 else { return localTime.rawValue }

        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        guard let date = calendar.date(from: DateComponents(
            calendar: calendar,
            timeZone: calendar.timeZone,
            year: 2001,
            month: 1,
            day: 1,
            hour: components[0],
            minute: components[1],
            second: components[2]
        )) else {
            return localTime.rawValue
        }

        return formattedTime(date, timeZone: calendar.timeZone, locale: locale)
    }

    static func string(for timestamp: Date, in timeZone: TimeZone, locale: Locale = .autoupdatingCurrent) -> String {
        formattedTime(timestamp, timeZone: timeZone, locale: locale)
    }

    private static func formattedTime(_ date: Date, timeZone: TimeZone, locale: Locale) -> String {
        let formatter = DateFormatter()
        formatter.locale = locale
        formatter.timeZone = timeZone
        formatter.dateStyle = .none
        formatter.timeStyle = .short
        return formatter.string(from: date)
    }
}

enum TodayPresenter {
    static func make(
        participant: ParticipantSession,
        today: MobileReadState<MobileTodayData>,
        matches: MobileReadState<MobileMatchesData>,
        leaders: MobileReadState<MobileLeadersData>,
        schedule: MobileReadState<MobileScheduleData>,
        now: Date,
        locale: Locale = .autoupdatingCurrent
    ) -> TodayPresentation {
        let participantPresentation = TodayParticipantPresentation(
            playerID: participant.player.playerId,
            displayName: participant.player.displayName,
            teamID: participant.player.team?.teamId,
            teamName: participant.player.team?.name,
            tournamentID: participant.tournament.tournamentId
        )

        return TodayPresentation(
            participant: participantPresentation,
            tournament: tournamentSection(participant: participant, state: today),
            currentMatch: currentMatchSection(state: today),
            personalMatches: personalMatchesSection(today: today, matches: matches),
            tournamentScore: tournamentScoreSection(state: leaders),
            schedule: scheduleSection(today: today, schedule: schedule, now: now, locale: locale),
            freshnessBanner: freshnessBanner(states: [
                AnyReadPresentationState(today),
                AnyReadPresentationState(matches),
                AnyReadPresentationState(leaders),
                AnyReadPresentationState(schedule),
            ])
        )
    }

    private static func tournamentSection(
        participant: ParticipantSession,
        state: MobileReadState<MobileTodayData>
    ) -> TodaySection<TodayTournamentPresentation> {
        if let data = state.value {
            return contentSection(
                TodayTournamentPresentation(
                    name: data.tournament.name,
                    year: data.tournament.year,
                    statusText: tournamentStatusText(data.tournament.status),
                    roundText: roundText(
                        number: data.tournament.currentRound,
                        name: nil
                    ),
                    timeZoneIdentifier: data.tournament.timeZone,
                    isSessionFallback: false
                ),
                state: state
            )
        }

        let fallback = TodayTournamentPresentation(
            name: participant.tournament.name,
            year: participant.tournament.year,
            statusText: nil,
            roundText: nil,
            timeZoneIdentifier: nil,
            isSessionFallback: true
        )
        return TodaySection(
            availability: unavailableOrLoading(state),
            value: fallback,
            freshness: nil
        )
    }

    private static func currentMatchSection(
        state: MobileReadState<MobileTodayData>
    ) -> TodaySection<TodayMatchPresentation> {
        guard let data = state.value else {
            return TodaySection(availability: unavailableOrLoading(state), value: nil, freshness: nil)
        }
        guard let match = data.currentMatch else {
            return emptySection(state: state)
        }
        return contentSection(matchPresentation(match), state: state)
    }

    private static func personalMatchesSection(
        today: MobileReadState<MobileTodayData>,
        matches: MobileReadState<MobileMatchesData>
    ) -> TodaySection<[TodayPersonalMatchPresentation]> {
        guard let data = matches.value else {
            return TodaySection(availability: unavailableOrLoading(matches), value: nil, freshness: nil)
        }

        let currentMatchID = today.value?.currentMatch?.matchId
        let personal = data.matches
            .filter(\.authenticatedPlayer.involved)
            .map { match in
                TodayPersonalMatchPresentation(
                    match: matchPresentation(match),
                    isCurrent: match.matchId == currentMatchID
                )
            }
        guard !personal.isEmpty else { return emptySection(state: matches) }
        return contentSection(personal, state: matches)
    }

    private static func tournamentScoreSection(
        state: MobileReadState<MobileLeadersData>
    ) -> TodaySection<TodayTournamentScorePresentation> {
        guard let data = state.value else {
            return TodaySection(availability: unavailableOrLoading(state), value: nil, freshness: nil)
        }
        guard !data.teamStandings.isEmpty else { return emptySection(state: state) }

        let rankOneCount = data.teamStandings.filter { $0.rank == 1 }.count
        let teams = data.teamStandings.map { standing in
            TodayTeamScorePresentation(
                teamID: standing.teamId,
                name: standing.name,
                rank: standing.rank,
                points: standing.points,
                pointsText: TodayPointsFormatter.string(for: standing.points),
                record: standing.record,
                remainingMatches: standing.remainingMatches,
                isSoleLeader: standing.rank == 1 && rankOneCount == 1,
                isTiedForLead: standing.rank == 1 && rankOneCount > 1
            )
        }
        let context = tournamentContextText(data.tournament)
        return contentSection(
            TodayTournamentScorePresentation(teams: teams, contextText: context),
            state: state
        )
    }

    private static func scheduleSection(
        today: MobileReadState<MobileTodayData>,
        schedule: MobileReadState<MobileScheduleData>,
        now: Date,
        locale: Locale
    ) -> TodaySection<TodaySchedulePresentation> {
        if let scheduleData = schedule.value,
           let zone = TimeZone(identifier: scheduleData.timeZone)
        {
            let localDate = calendarDateString(for: now, in: zone)
            let todaysEvents = scheduleData.events.filter { event in
                eventCalendarDate(event, in: zone) == localDate
            }
            if !todaysEvents.isEmpty {
                let presentation = TodaySchedulePresentation(
                    title: "Today’s Schedule",
                    source: .fullScheduleToday,
                    events: todaysEvents.prefix(4).map {
                        scheduleEventPresentation($0, timeZone: zone, now: now, locale: locale)
                    }
                )
                return contentSection(presentation, state: schedule)
            }
        }

        if let todayData = today.value, !todayData.immediateSchedule.isEmpty {
            let zone = TimeZone(identifier: todayData.tournament.timeZone) ?? TimeZone(secondsFromGMT: 0)!
            let presentation = TodaySchedulePresentation(
                title: "Up Next",
                source: .immediateScheduleFallback,
                events: todayData.immediateSchedule.prefix(4).map {
                    scheduleEventPresentation($0, timeZone: zone, now: now, locale: locale)
                }
            )
            return contentSection(presentation, state: today)
        }

        if schedule.value != nil, today.value != nil {
            return emptySection(state: schedule)
        }
        if schedule.value == nil, unavailableOrLoading(schedule) == .unavailable {
            return TodaySection(availability: .unavailable, value: nil, freshness: nil)
        }
        if today.value == nil, unavailableOrLoading(today) == .unavailable, schedule.value == nil {
            return TodaySection(availability: .unavailable, value: nil, freshness: nil)
        }
        return TodaySection(availability: .loading, value: nil, freshness: nil)
    }

    private static func matchPresentation(_ match: MobileMatch) -> TodayMatchPresentation {
        let ownSideNumber = match.authenticatedPlayer.teamSide
        let own = match.teams.first { $0.side == ownSideNumber }.map(matchSidePresentation)
        let opponent = match.teams.first { $0.side != ownSideNumber }.map(matchSidePresentation)

        let status: String
        let eyebrow: String
        let progress: String?
        switch match.status {
        case .scheduled:
            status = "Upcoming"
            eyebrow = "YOUR NEXT MATCH"
            progress = nil
        case .inProgress:
            status = "Live"
            eyebrow = "YOUR MATCH"
            progress = match.progress?.currentHole.map { "Hole \($0)" }
        case .completed:
            status = "Final"
            eyebrow = "YOUR MATCH"
            progress = nil
        }

        return TodayMatchPresentation(
            matchID: match.matchId,
            eyebrow: eyebrow,
            statusText: status,
            roundText: roundText(number: match.round.roundNumber, name: match.round.name),
            format: nonempty(match.round.format),
            ownSide: own,
            opponentSide: opponent,
            courseName: nonempty(match.course?.name),
            tee: nonempty(match.course?.tee),
            teeTimeLabel: nonempty(match.teeTime?.label),
            progressText: progress,
            resultText: nonempty(match.result?.summary)
        )
    }

    private static func matchSidePresentation(_ side: MobileMatchTeam) -> TodayMatchSidePresentation {
        TodayMatchSidePresentation(
            side: side.side,
            name: nonempty(side.name),
            participants: side.participants.map {
                TodayMatchParticipantPresentation(
                    playerID: $0.playerId,
                    displayName: $0.displayName,
                    isAuthenticatedPlayer: $0.isAuthenticatedPlayer
                )
            }
        )
    }

    private static func scheduleEventPresentation(
        _ event: MobileScheduleEvent,
        timeZone: TimeZone,
        now: Date,
        locale: Locale
    ) -> TodayScheduleEventPresentation {
        let starts = event.startAt?.date
        let ends = event.endAt?.date
        let isNow = starts.map { $0 <= now } == true && ends.map { now < $0 } == true
        // A start time alone is not canonical evidence that an event has ended.
        // Only an explicit end timestamp supports the completed presentation.
        let isCompleted = ends.map { $0 <= now } ?? false

        return TodayScheduleEventPresentation(
            eventID: event.eventId,
            title: event.title,
            subtitle: nonempty(event.subtitle),
            location: nonempty(event.location),
            type: nonempty(event.type),
            startTimeText: clockText(local: event.localStartTime, absolute: starts, in: timeZone, locale: locale),
            endTimeText: clockText(local: event.localEndTime, absolute: ends, in: timeZone, locale: locale),
            isNow: isNow,
            isCompleted: isCompleted
        )
    }

    private static func clockText(
        local: MobileLocalTime?,
        absolute: Date?,
        in timeZone: TimeZone,
        locale: Locale
    ) -> String? {
        if let local {
            return TodayClockFormatter.string(for: local, locale: locale)
        }
        guard let absolute else { return nil }
        return TodayClockFormatter.string(for: absolute, in: timeZone, locale: locale)
    }

    private static func eventCalendarDate(_ event: MobileScheduleEvent, in timeZone: TimeZone) -> String? {
        if let date = event.date { return date.rawValue }
        guard let absolute = event.startAt?.date else { return nil }
        return calendarDateString(for: absolute, in: timeZone)
    }

    private static func calendarDateString(for date: Date, in timeZone: TimeZone) -> String {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        let components = calendar.dateComponents([.year, .month, .day], from: date)
        return String(
            format: "%04d-%02d-%02d",
            components.year ?? 0,
            components.month ?? 0,
            components.day ?? 0
        )
    }

    private static func tournamentContextText(_ tournament: MobileReadTournament) -> String? {
        let status = tournamentStatusText(tournament.status)
        let round = roundText(number: tournament.currentRound, name: nil)
        switch (round, status) {
        case let (.some(round), .some(status)): return "\(round) · \(status)"
        case let (.some(round), .none): return round
        case let (.none, .some(status)): return status
        case (.none, .none): return nil
        }
    }

    private static func tournamentStatusText(_ status: String?) -> String? {
        guard let status = nonempty(status) else { return nil }
        switch status.uppercased() {
        case "LIVE", "ACTIVE", "IN PROGRESS", "IN-PROGRESS": return "Live"
        case "FINAL", "FINALIZED", "COMPLETE", "COMPLETED": return "Tournament Final"
        case "SCHEDULED", "UPCOMING": return "Upcoming"
        default: return status
        }
    }

    private static func roundText(number: Int?, name: String?) -> String? {
        if let number { return "Round \(number)" }
        return nonempty(name)
    }

    private static func nonempty(_ value: String?) -> String? {
        guard let value else { return nil }
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }

    private static func unavailableOrLoading<Value>(
        _ state: MobileReadState<Value>
    ) -> TodaySectionAvailability where Value: Equatable & Sendable {
        switch state.freshness {
        case .empty, .cached, .refreshing:
            return .loading
        case .fresh, .stale, .offline, .failed:
            return .unavailable
        }
    }

    private static func presentedFreshness<Value>(
        _ state: MobileReadState<Value>
    ) -> TodayPresentedFreshness where Value: Equatable & Sendable {
        switch state.freshness {
        case .fresh: return .current
        case .cached: return .cached
        case .refreshing: return .refreshing
        case .stale, .failed: return .stale
        case .offline: return .offline
        case .empty: return state.source == .diskCache ? .cached : .current
        }
    }

    private static func contentSection<Value, Product>(
        _ value: Value,
        state: MobileReadState<Product>
    ) -> TodaySection<Value>
    where Value: Equatable & Sendable, Product: Equatable & Sendable {
        TodaySection(
            availability: .content,
            value: value,
            freshness: presentedFreshness(state)
        )
    }

    private static func emptySection<Value, Product>(
        state: MobileReadState<Product>
    ) -> TodaySection<Value>
    where Value: Equatable & Sendable, Product: Equatable & Sendable {
        TodaySection(
            availability: .empty,
            value: nil,
            freshness: presentedFreshness(state)
        )
    }

    private static func freshnessBanner(states: [AnyReadPresentationState]) -> TodayFreshnessBanner? {
        let eligible = states.filter(\.hasValue)
        guard !eligible.isEmpty else { return nil }
        let kind: TodayFreshnessBannerKind?
        if eligible.contains(where: { $0.freshness == .offline }) {
            kind = .offline
        } else if eligible.contains(where: { $0.freshness == .stale || $0.freshness == .failed }) {
            kind = .stale
        } else if eligible.contains(where: {
            $0.freshness == .cached || ($0.freshness == .refreshing && $0.source == .diskCache)
        }) {
            kind = .cached
        } else {
            kind = nil
        }
        guard let kind else { return nil }
        return TodayFreshnessBanner(
            kind: kind,
            lastValidated: eligible.compactMap(\.validatedAt).min()
        )
    }
}

private struct AnyReadPresentationState: Sendable {
    let hasValue: Bool
    let source: MobileReadSource?
    let freshness: MobileReadFreshness
    let validatedAt: Date?

    init<Value>(_ state: MobileReadState<Value>) where Value: Equatable & Sendable {
        hasValue = state.value != nil
        source = state.source
        freshness = state.freshness
        validatedAt = state.validatedAt
    }
}
