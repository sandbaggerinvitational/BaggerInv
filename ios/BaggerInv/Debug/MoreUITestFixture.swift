#if DEBUG
import Foundation

enum MoreUITestFixtures {
    static let now = try! MobileTimestamp("2026-09-24T15:30:00.000Z").date

    static func scheduleState(for scenario: TodayUITestScenario) -> MobileReadState<MobileScheduleData> {
        let isOffline = scenario == .scheduleCachedOffline
        let isEmpty = scenario == .scheduleEmpty
        return MobileReadState(
            value: MobileScheduleData(
                tournamentId: "fixture-tournament",
                timeZone: "America/Chicago",
                events: isEmpty ? [] : scheduleEvents
            ),
            source: isOffline ? .diskCache : .network,
            freshness: isOffline ? .offline : .fresh,
            isRefreshing: false,
            revision: "fixture-schedule-revision",
            generatedAt: try! MobileTimestamp("2026-09-24T15:00:00.000Z"),
            fetchedAt: Date(timeIntervalSince1970: 1_800_000_000),
            validatedAt: Date(timeIntervalSince1970: 1_800_000_000),
            lastSafeError: isOffline ? .transport : nil,
            lastServerCode: nil,
            lastHTTPStatus: nil,
            cachePersistenceIssue: false
        )
    }

    private static let scheduleEvents: [MobileScheduleEvent] = [
        event(
            id: "fixture-breakfast",
            date: "2026-09-24",
            start: "2026-09-24T13:00:00.000Z",
            end: "2026-09-24T14:00:00.000Z",
            localStart: "08:00:00",
            localEnd: "09:00:00",
            title: "Tournament Breakfast",
            subtitle: "Opening morning",
            location: "Clubhouse",
            type: "meal"
        ),
        event(
            id: "fixture-round",
            date: "2026-09-24",
            start: "2026-09-24T15:00:00.000Z",
            end: "2026-09-24T20:00:00.000Z",
            localStart: "10:00:00",
            localEnd: "15:00:00",
            title: "Opening Round",
            subtitle: "Best Ball",
            location: "Ocean Course",
            type: "golf"
        ),
        event(
            id: "fixture-dinner",
            date: "2026-09-24",
            start: "2026-09-24T23:00:00.000Z",
            end: "2026-09-25T01:00:00.000Z",
            localStart: "18:00:00",
            localEnd: "20:00:00",
            title: "Team Dinner",
            subtitle: nil,
            location: "Harbor Room",
            type: "dinner"
        ),
        event(
            id: "fixture-singles",
            date: "2026-09-25",
            start: "2026-09-25T14:00:00.000Z",
            end: nil,
            localStart: "09:00:00",
            localEnd: nil,
            title: "Singles Matches",
            subtitle: nil,
            location: "Turtle Point",
            type: "round"
        ),
    ]

    private static func event(
        id: String,
        date: String,
        start: String,
        end: String?,
        localStart: String,
        localEnd: String?,
        title: String,
        subtitle: String?,
        location: String?,
        type: String?
    ) -> MobileScheduleEvent {
        MobileScheduleEvent(
            eventId: id,
            date: try! MobileCalendarDate(date),
            startAt: try! MobileTimestamp(start),
            endAt: end.map { try! MobileTimestamp($0) },
            localStartTime: try! MobileLocalTime(localStart),
            localEndTime: localEnd.map { try! MobileLocalTime($0) },
            title: title,
            subtitle: subtitle,
            location: location,
            type: type
        )
    }
}
#endif
