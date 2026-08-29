import XCTest
@testable import BaggerInv

final class MobileReadModelDecodingTests: XCTestCase {
    private let decoder = JSONDecoder()

    func testTodayDecodesCompleteCurrentMatchAndCanonicalMetadata() throws {
        let response = try decoder.decode(
            MobileTodayResponse.self,
            from: ReadFixture.today(currentMatch: ReadFixture.match(
                id: "match:round/2#17",
                status: "inProgress",
                progress: ["currentHole": 7],
                result: NSNull()
            ))
        )

        XCTAssertTrue(response.isCompatible(expectedTournamentID: ReadFixture.tournamentID))
        XCTAssertEqual(response.apiVersion, "v1")
        XCTAssertEqual(response.meta.generatedAt.rawValue, "2026-09-24T12:00:00.000Z")
        XCTAssertEqual(response.meta.revision, "home:fingerprint/opaque-v1")
        XCTAssertEqual(response.data.player.playerId, "player:opaque/alpha")
        XCTAssertEqual(response.data.player.team?.teamId, "team:pickles/2026")
        XCTAssertEqual(response.data.currentMatch?.matchId, "match:round/2#17")
        XCTAssertEqual(response.data.currentMatch?.status, .inProgress)
        XCTAssertEqual(response.data.currentMatch?.round.roundNumber, 2)
        XCTAssertEqual(response.data.currentMatch?.course?.courseId, "course:sea/island")
        XCTAssertEqual(response.data.currentMatch?.teeTime?.localTime?.rawValue, "08:10:00")
        XCTAssertEqual(response.data.currentMatch?.authenticatedPlayer.partnerPlayerIds, ["player:partner/2"])
        XCTAssertEqual(response.data.currentMatch?.authenticatedPlayer.opponentPlayerIds, [
            "player:opponent/3",
            "player:opponent/4",
        ])
        XCTAssertEqual(response.data.currentMatch?.progress?.currentHole, 7)
        XCTAssertNil(response.data.currentMatch?.result)
        XCTAssertEqual(response.data.immediateSchedule.first?.date?.rawValue, "2026-09-24")
        XCTAssertEqual(response.data.immediateSchedule.first?.startAt?.rawValue, "2026-09-24T23:00:00.000Z")
        XCTAssertEqual(response.data.immediateSchedule.first?.localStartTime?.rawValue, "18:00:00")
    }

    func testTodayDecodesNoCurrentMatchAndNullableCanonicalFields() throws {
        let response = try decoder.decode(
            MobileTodayResponse.self,
            from: ReadFixture.today(
                currentMatch: NSNull(),
                tournament: ReadFixture.tournament(
                    year: NSNull(),
                    status: NSNull(),
                    currentRound: NSNull()
                ),
                playerTeam: NSNull(),
                events: [ReadFixture.event(
                    eventID: NSNull(),
                    date: NSNull(),
                    startAt: NSNull(),
                    endAt: NSNull(),
                    localStart: NSNull(),
                    localEnd: NSNull(),
                    subtitle: NSNull(),
                    location: NSNull(),
                    type: NSNull()
                )],
                revision: NSNull()
            )
        )

        XCTAssertTrue(response.isCompatible(expectedTournamentID: ReadFixture.tournamentID))
        XCTAssertNil(response.data.currentMatch)
        XCTAssertNil(response.data.tournament.year)
        XCTAssertNil(response.data.tournament.status)
        XCTAssertNil(response.data.tournament.currentRound)
        XCTAssertNil(response.data.player.team)
        XCTAssertNil(response.data.immediateSchedule[0].eventId)
        XCTAssertNil(response.data.immediateSchedule[0].date)
        XCTAssertNil(response.data.immediateSchedule[0].startAt)
        XCTAssertNil(response.data.immediateSchedule[0].endAt)
        XCTAssertNil(response.data.immediateSchedule[0].localStartTime)
        XCTAssertNil(response.data.immediateSchedule[0].localEndTime)
        XCTAssertNil(response.data.immediateSchedule[0].subtitle)
        XCTAssertNil(response.data.immediateSchedule[0].location)
        XCTAssertNil(response.data.immediateSchedule[0].type)
        XCTAssertNil(response.meta.revision)
    }

    func testMatchesDecodesScheduledInProgressAndCompletedLifecycleShapes() throws {
        let scheduled = ReadFixture.match(
            id: "scheduled:not-a-uuid",
            status: "scheduled",
            progress: NSNull(),
            result: NSNull()
        )
        let active = ReadFixture.match(
            id: "live:not-a-number",
            status: "inProgress",
            progress: ["currentHole": 11],
            result: NSNull()
        )
        let completed = ReadFixture.match(
            id: "completed:opaque/value",
            status: "completed",
            progress: NSNull(),
            result: [
                "summary": "Pickles win 2 & 1",
                "winner": "teamOne",
                "teamOnePoints": 1.5,
                "teamTwoPoints": 0.5,
            ]
        )

        let response = try decoder.decode(
            MobileMatchesResponse.self,
            from: ReadFixture.matches([scheduled, active, completed])
        )

        XCTAssertTrue(response.isCompatible(expectedTournamentID: ReadFixture.tournamentID))
        XCTAssertEqual(response.data.matches.map(\.status), [.scheduled, .inProgress, .completed])
        XCTAssertNil(response.data.matches[0].progress)
        XCTAssertNil(response.data.matches[0].result)
        XCTAssertEqual(response.data.matches[1].progress?.currentHole, 11)
        XCTAssertNil(response.data.matches[1].result)
        XCTAssertNil(response.data.matches[2].progress)
        XCTAssertEqual(response.data.matches[2].result?.summary, "Pickles win 2 & 1")
        XCTAssertEqual(response.data.matches[2].result?.teamOnePoints, 1.5)
        XCTAssertEqual(response.data.matches[2].result?.teamTwoPoints, 0.5)
        XCTAssertEqual(response.data.matches[2].teams.count, 2)
        XCTAssertEqual(response.meta.revision, "live:fingerprint/opaque-v2")
    }

    func testLeadersDecodesHalfPointsTiesAndNullableRanks() throws {
        let response = try decoder.decode(
            MobileLeadersResponse.self,
            from: ReadFixture.leaders()
        )

        XCTAssertTrue(response.isCompatible(expectedTournamentID: ReadFixture.tournamentID))
        XCTAssertEqual(response.data.teamStandings[0].points, 8.5)
        XCTAssertEqual(response.data.teamStandings[1].points, 7.5)
        XCTAssertEqual(response.data.teamStandings[0].rank, 1)
        XCTAssertNil(response.data.teamStandings[1].rank)
        XCTAssertNil(response.data.teamStandings[1].remainingMatches)
        XCTAssertEqual(response.data.playerStandings[0].points, 3.5)
        XCTAssertEqual(response.data.playerStandings[0].playerId, "player:leader/opaque")
        XCTAssertNil(response.data.playerStandings[0].team.teamId)
        XCTAssertEqual(response.meta.revision, "leaders:fingerprint/opaque-v3")
    }

    func testScheduleDecodesAbsoluteAndLocalTimesWithOptionalFields() throws {
        let response = try decoder.decode(
            MobileScheduleResponse.self,
            from: ReadFixture.schedule()
        )

        XCTAssertTrue(response.isCompatible(expectedTournamentID: ReadFixture.tournamentID))
        XCTAssertEqual(response.data.timeZone, "America/New_York")
        XCTAssertEqual(response.data.events[0].eventId, "event:round/one")
        XCTAssertEqual(response.data.events[0].date?.rawValue, "2026-09-25")
        XCTAssertEqual(response.data.events[0].startAt?.rawValue, "2026-09-25T11:20:00.000Z")
        XCTAssertEqual(response.data.events[0].endAt?.rawValue, "2026-09-25T16:00:00Z")
        XCTAssertEqual(response.data.events[0].localStartTime?.rawValue, "07:20:00")
        XCTAssertEqual(response.data.events[0].localEndTime?.rawValue, "12:00:00")
        XCTAssertNil(response.data.events[1].eventId)
        XCTAssertNil(response.data.events[1].endAt)
        XCTAssertNil(response.data.events[1].localEndTime)
        XCTAssertNil(response.data.events[1].subtitle)
        XCTAssertNil(response.data.events[1].location)
        XCTAssertNil(response.data.events[1].type)
        XCTAssertEqual(response.meta.revision, "guide:delivery/fingerprint-v4")
    }

    func testApprovedDateAndTimeFormatsAreStrictlyAccepted() throws {
        XCTAssertEqual(try MobileCalendarDate("2028-02-29").rawValue, "2028-02-29")
        XCTAssertEqual(try MobileLocalTime("00:00:00").rawValue, "00:00:00")
        XCTAssertEqual(try MobileLocalTime("23:59:59").rawValue, "23:59:59")
        XCTAssertEqual(
            try MobileTimestamp("2026-09-25T11:20:00.123Z").rawValue,
            "2026-09-25T11:20:00.123Z"
        )
        XCTAssertEqual(
            try MobileTimestamp("2026-09-25T11:20:00Z").rawValue,
            "2026-09-25T11:20:00Z"
        )
    }

    func testInvalidCalendarDatesFailDecoding() throws {
        for invalidDate in ["2026-02-29", "2026-09-31", "2026-9-01", "09/01/2026"] {
            let payload = try ReadFixture.schedule(events: [ReadFixture.event(date: invalidDate)])
            XCTAssertThrowsError(try decoder.decode(MobileScheduleResponse.self, from: payload))
        }
    }

    func testInvalidLocalTimesFailDecoding() throws {
        for invalidTime in ["24:00:00", "08:60:00", "08:10", "8:10:00", "8:10 AM"] {
            let payload = try ReadFixture.schedule(events: [ReadFixture.event(localStart: invalidTime)])
            XCTAssertThrowsError(try decoder.decode(MobileScheduleResponse.self, from: payload))
        }
    }

    func testNonUTCOrMalformedTimestampsFailDecoding() throws {
        for invalidTimestamp in [
            "2026-09-25T11:20:00-04:00",
            "2026-09-25 11:20:00Z",
            "not-a-timestamp",
        ] {
            let payload = try ReadFixture.schedule(events: [ReadFixture.event(startAt: invalidTimestamp)])
            XCTAssertThrowsError(try decoder.decode(MobileScheduleResponse.self, from: payload))
        }
    }

    func testMissingRequiredReadFieldsFailDecoding() throws {
        var match = ReadFixture.match(
            id: "missing-required-field",
            status: "scheduled",
            progress: NSNull(),
            result: NSNull()
        )
        match.removeValue(forKey: "authenticatedPlayer")
        XCTAssertThrowsError(
            try decoder.decode(MobileMatchesResponse.self, from: ReadFixture.matches([match]))
        )

        var data = ReadFixture.matchesObject([
            ReadFixture.match(
                id: "valid-match",
                status: "scheduled",
                progress: NSNull(),
                result: NSNull()
            ),
        ])
        data.removeValue(forKey: "meta")
        XCTAssertThrowsError(
            try decoder.decode(MobileMatchesResponse.self, from: ReadFixture.jsonData(data))
        )
    }

    func testMissingRequiredNullableTodayFieldsFailDecoding() throws {
        var missingCurrentMatch = ReadFixture.todayObject(currentMatch: NSNull())
        var currentMatchData = try XCTUnwrap(missingCurrentMatch["data"] as? [String: Any])
        currentMatchData.removeValue(forKey: "currentMatch")
        missingCurrentMatch["data"] = currentMatchData
        XCTAssertThrowsError(
            try decoder.decode(MobileTodayResponse.self, from: ReadFixture.jsonData(missingCurrentMatch))
        )

        var missingRevision = ReadFixture.todayObject(currentMatch: NSNull())
        var meta = try XCTUnwrap(missingRevision["meta"] as? [String: Any])
        meta.removeValue(forKey: "revision")
        missingRevision["meta"] = meta
        XCTAssertThrowsError(
            try decoder.decode(MobileTodayResponse.self, from: ReadFixture.jsonData(missingRevision))
        )

        var missingTournamentYear = ReadFixture.todayObject(currentMatch: NSNull())
        var tournamentData = try XCTUnwrap(missingTournamentYear["data"] as? [String: Any])
        var tournament = try XCTUnwrap(tournamentData["tournament"] as? [String: Any])
        tournament.removeValue(forKey: "year")
        tournamentData["tournament"] = tournament
        missingTournamentYear["data"] = tournamentData
        XCTAssertThrowsError(
            try decoder.decode(MobileTodayResponse.self, from: ReadFixture.jsonData(missingTournamentYear))
        )

        var missingPlayerTeam = ReadFixture.todayObject(currentMatch: NSNull())
        var playerData = try XCTUnwrap(missingPlayerTeam["data"] as? [String: Any])
        var player = try XCTUnwrap(playerData["player"] as? [String: Any])
        player.removeValue(forKey: "team")
        playerData["player"] = player
        missingPlayerTeam["data"] = playerData
        XCTAssertThrowsError(
            try decoder.decode(MobileTodayResponse.self, from: ReadFixture.jsonData(missingPlayerTeam))
        )
    }

    func testMissingRequiredNullableEventMatchAndLeaderFieldsFailDecoding() throws {
        var event = ReadFixture.event(endAt: NSNull())
        event.removeValue(forKey: "endAt")
        XCTAssertThrowsError(
            try decoder.decode(
                MobileScheduleResponse.self,
                from: ReadFixture.schedule(events: [event])
            )
        )

        var match = ReadFixture.match(
            id: "missing-required-nullable-course",
            status: "scheduled",
            progress: NSNull(),
            result: NSNull()
        )
        match.removeValue(forKey: "course")
        XCTAssertThrowsError(
            try decoder.decode(MobileMatchesResponse.self, from: ReadFixture.matches([match]))
        )

        var leaders = ReadFixture.leadersObject()
        var leadersData = try XCTUnwrap(leaders["data"] as? [String: Any])
        var teamStandings = try XCTUnwrap(leadersData["teamStandings"] as? [[String: Any]])
        teamStandings[0].removeValue(forKey: "rank")
        leadersData["teamStandings"] = teamStandings
        leaders["data"] = leadersData
        XCTAssertThrowsError(
            try decoder.decode(MobileLeadersResponse.self, from: ReadFixture.jsonData(leaders))
        )
    }

    func testStructurallyIncompatibleVersionAndTournamentFailClosed() throws {
        var wrongVersion = ReadFixture.todayObject(currentMatch: NSNull())
        wrongVersion["apiVersion"] = "v2"
        let versionResponse = try decoder.decode(
            MobileTodayResponse.self,
            from: ReadFixture.jsonData(wrongVersion)
        )
        XCTAssertFalse(versionResponse.isCompatible(expectedTournamentID: ReadFixture.tournamentID))

        let validResponse = try decoder.decode(
            MobileTodayResponse.self,
            from: ReadFixture.today(currentMatch: NSNull())
        )
        XCTAssertFalse(validResponse.isCompatible(expectedTournamentID: "different:tournament"))
    }
}

private enum ReadFixture {
    static let tournamentID = "tournament:opaque/2026"

    static func jsonData(_ object: Any) throws -> Data {
        try JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
    }

    static func tournament(
        year: Any = 2026,
        status: Any = "Live",
        currentRound: Any = 2
    ) -> [String: Any] {
        [
            "tournamentId": tournamentID,
            "name": "Bagger Invitational",
            "year": year,
            "status": status,
            "currentRound": currentRound,
            "timeZone": "America/New_York",
        ]
    }

    static func event(
        eventID: Any = "event:welcome/opaque",
        date: Any = "2026-09-24",
        startAt: Any = "2026-09-24T23:00:00.000Z",
        endAt: Any = "2026-09-25T00:30:00.000Z",
        localStart: Any = "18:00:00",
        localEnd: Any = "19:30:00",
        subtitle: Any = "Opening night",
        location: Any = "Clubhouse",
        type: Any = "Reception"
    ) -> [String: Any] {
        [
            "eventId": eventID,
            "date": date,
            "startAt": startAt,
            "endAt": endAt,
            "localStartTime": localStart,
            "localEndTime": localEnd,
            "title": "Welcome Reception",
            "subtitle": subtitle,
            "location": location,
            "type": type,
        ]
    }

    static func match(
        id: String,
        status: String,
        progress: Any,
        result: Any
    ) -> [String: Any] {
        [
            "matchId": id,
            "round": [
                "roundNumber": 2,
                "name": "Round 2",
                "format": "Best Ball",
            ],
            "status": status,
            "course": [
                "courseId": "course:sea/island",
                "name": "Ocean Course",
                "tee": "Blue",
            ],
            "teeTime": [
                "localTime": "08:10:00",
                "label": "8:10 AM",
                "timeZone": "America/New_York",
            ],
            "teams": [
                [
                    "side": 1,
                    "name": "Pickles",
                    "participants": [
                        participant(
                            id: "player:opaque/alpha",
                            name: "Preview Golfer",
                            side: 1,
                            authenticated: true
                        ),
                        participant(
                            id: "player:partner/2",
                            name: "Partner",
                            side: 1,
                            authenticated: false
                        ),
                    ],
                ],
                [
                    "side": 2,
                    "name": "Rippers",
                    "participants": [
                        participant(
                            id: "player:opponent/3",
                            name: "Opponent One",
                            side: 2,
                            authenticated: false
                        ),
                        participant(
                            id: "player:opponent/4",
                            name: "Opponent Two",
                            side: 2,
                            authenticated: false
                        ),
                    ],
                ],
            ],
            "authenticatedPlayer": [
                "involved": true,
                "teamSide": 1,
                "partnerPlayerIds": ["player:partner/2"],
                "opponentPlayerIds": ["player:opponent/3", "player:opponent/4"],
            ],
            "progress": progress,
            "result": result,
        ]
    }

    private static func participant(
        id: String,
        name: String,
        side: Int,
        authenticated: Bool
    ) -> [String: Any] {
        [
            "playerId": id,
            "displayName": name,
            "teamSide": side,
            "isAuthenticatedPlayer": authenticated,
        ]
    }

    static func today(
        currentMatch: Any,
        tournament: [String: Any] = tournament(),
        playerTeam: Any = ["teamId": "team:pickles/2026", "name": "Pickles"],
        events: [[String: Any]] = [event()],
        revision: Any = "home:fingerprint/opaque-v1"
    ) throws -> Data {
        try jsonData(todayObject(
            currentMatch: currentMatch,
            tournament: tournament,
            playerTeam: playerTeam,
            events: events,
            revision: revision
        ))
    }

    static func todayObject(
        currentMatch: Any,
        tournament: [String: Any] = tournament(),
        playerTeam: Any = ["teamId": "team:pickles/2026", "name": "Pickles"],
        events: [[String: Any]] = [event()],
        revision: Any = "home:fingerprint/opaque-v1"
    ) -> [String: Any] {
        [
            "ok": true,
            "apiVersion": "v1",
            "data": [
                "tournament": tournament,
                "player": [
                    "playerId": "player:opaque/alpha",
                    "displayName": "Preview Golfer",
                    "team": playerTeam,
                ],
                "currentMatch": currentMatch,
                "immediateSchedule": events,
            ],
            "meta": meta(revision: revision),
        ]
    }

    static func matches(_ values: [[String: Any]]) throws -> Data {
        try jsonData(matchesObject(values))
    }

    static func matchesObject(_ values: [[String: Any]]) -> [String: Any] {
        [
            "ok": true,
            "apiVersion": "v1",
            "data": [
                "tournament": tournament(),
                "matches": values,
            ],
            "meta": meta(revision: "live:fingerprint/opaque-v2"),
        ]
    }

    static func leaders() throws -> Data {
        try jsonData(leadersObject())
    }

    static func leadersObject() -> [String: Any] {
        [
            "ok": true,
            "apiVersion": "v1",
            "data": [
                "tournament": tournament(),
                "teamStandings": [
                    [
                        "rank": 1,
                        "teamId": "team:pickles/2026",
                        "name": "Pickles",
                        "points": 8.5,
                        "record": "5-1-1",
                        "remainingMatches": 2,
                    ],
                    [
                        "rank": NSNull(),
                        "teamId": "team:rippers/2026",
                        "name": "Rippers",
                        "points": 7.5,
                        "record": "4-2-1",
                        "remainingMatches": NSNull(),
                    ],
                ],
                "playerStandings": [
                    [
                        "rank": 1,
                        "playerId": "player:leader/opaque",
                        "displayName": "Leader",
                        "team": ["teamId": NSNull(), "name": "Pickles"],
                        "points": 3.5,
                        "record": "3-0-1",
                    ],
                ],
            ],
            "meta": meta(revision: "leaders:fingerprint/opaque-v3"),
        ]
    }

    static func schedule(events: [[String: Any]]? = nil) throws -> Data {
        let rows = events ?? [
            event(
                eventID: "event:round/one",
                date: "2026-09-25",
                startAt: "2026-09-25T11:20:00.000Z",
                endAt: "2026-09-25T16:00:00Z",
                localStart: "07:20:00",
                localEnd: "12:00:00",
                subtitle: "Best Ball",
                location: "Ocean Course",
                type: "Golf"
            ),
            event(
                eventID: NSNull(),
                date: "2026-09-26",
                startAt: "2026-09-26T23:30:00.000Z",
                endAt: NSNull(),
                localStart: "19:30:00",
                localEnd: NSNull(),
                subtitle: NSNull(),
                location: NSNull(),
                type: NSNull()
            ),
        ]
        return try jsonData([
            "ok": true,
            "apiVersion": "v1",
            "data": [
                "tournamentId": tournamentID,
                "timeZone": "America/New_York",
                "events": rows,
            ],
            "meta": meta(revision: "guide:delivery/fingerprint-v4"),
        ])
    }

    private static func meta(revision: Any) -> [String: Any] {
        [
            "generatedAt": "2026-09-24T12:00:00.000Z",
            "revision": revision,
        ]
    }
}
