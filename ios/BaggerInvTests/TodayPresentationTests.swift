import XCTest
@testable import BaggerInv

final class TodayPresentationTests: XCTestCase {
    func testCanonicalTodayCurrentMatchAndRelationshipFilteringPreserveAuthorityAndOrder() throws {
        let canonicalCurrent = makeMatch(
            id: "today-selected",
            status: .scheduled,
            involved: true,
            ownSide: 2,
            round: 2
        )
        let otherLive = makeMatch(
            id: "other-live",
            status: .inProgress,
            involved: true,
            ownSide: 1,
            round: 1,
            currentHole: 7
        )
        let unrelated = makeMatch(
            id: "unrelated",
            status: .completed,
            involved: false,
            ownSide: nil,
            round: 2,
            resultSummary: "2 & 1"
        )
        let laterPersonal = makeMatch(
            id: "later-personal",
            status: .completed,
            involved: true,
            ownSide: 1,
            round: 3,
            resultSummary: "1 UP"
        )
        let presentation = makePresentation(
            today: makeToday(currentMatch: canonicalCurrent),
            matches: makeMatches([otherLive, unrelated, canonicalCurrent, laterPersonal])
        )

        XCTAssertEqual(presentation.currentMatch.availability, .content)
        XCTAssertEqual(presentation.currentMatch.value?.matchID, "today-selected")
        XCTAssertEqual(presentation.currentMatch.value?.eyebrow, "YOUR NEXT MATCH")
        XCTAssertEqual(presentation.currentMatch.value?.statusText, "Upcoming")
        XCTAssertEqual(presentation.currentMatch.value?.ownSide?.side, 2)
        XCTAssertEqual(presentation.currentMatch.value?.opponentSide?.side, 1)
        XCTAssertEqual(
            presentation.currentMatch.value?.ownSide?.teamID,
            TestFixtures.participant.player.team?.teamId
        )
        XCTAssertNil(presentation.currentMatch.value?.opponentSide?.teamID)
        XCTAssertEqual(presentation.currentMatch.value?.courseID, "course-1")
        XCTAssertEqual(
            presentation.currentMatch.value?.ownSide?.participants.first(where: \.isAuthenticatedPlayer)?.playerID,
            TestFixtures.participant.player.playerId
        )

        let personal = try XCTUnwrap(presentation.personalMatches.value)
        XCTAssertEqual(personal.map(\.match.matchID), ["other-live", "today-selected", "later-personal"])
        XCTAssertEqual(personal.map(\.isCurrent), [false, true, false])
        XCTAssertFalse(personal.contains { $0.match.matchID == "unrelated" })
    }

    func testCanonicalTwoTeamIdentityJoinUsesIDsOnlyAndFailsClosedWhenAmbiguous() throws {
        let match = makeMatch(
            id: "identity-match",
            status: .scheduled,
            involved: true,
            ownSide: 1,
            round: 1
        )
        let ownTeamID = try XCTUnwrap(TestFixtures.participant.player.team?.teamId)
        let opponentTeamID = "canonical-opponent-id"
        let twoTeamPresentation = makePresentation(
            today: makeToday(currentMatch: match),
            leaders: makeLeaders([
                standing(rank: 1, teamID: ownTeamID, name: "A display name", points: 1),
                standing(rank: 2, teamID: opponentTeamID, name: "Another display name", points: 0),
            ])
        )

        XCTAssertEqual(twoTeamPresentation.currentMatch.value?.ownSide?.teamID, ownTeamID)
        XCTAssertEqual(twoTeamPresentation.currentMatch.value?.opponentSide?.teamID, opponentTeamID)
        XCTAssertEqual(twoTeamPresentation.currentMatch.value?.courseID, "course-1")

        let ambiguous = makePresentation(
            today: makeToday(currentMatch: match),
            leaders: makeLeaders([
                standing(rank: 1, teamID: ownTeamID, name: "Own", points: 1),
                standing(rank: 2, teamID: opponentTeamID, name: "Opponent", points: 0),
                standing(rank: 3, teamID: "third-team", name: "Third", points: 0),
            ])
        )
        XCTAssertEqual(ambiguous.currentMatch.value?.ownSide?.teamID, ownTeamID)
        XCTAssertNil(ambiguous.currentMatch.value?.opponentSide?.teamID)

        let participantAbsent = makePresentation(
            today: makeToday(currentMatch: match),
            leaders: makeLeaders([
                standing(rank: 1, teamID: "other-one", name: "Other One", points: 1),
                standing(rank: 2, teamID: "other-two", name: "Other Two", points: 0),
            ])
        )
        XCTAssertEqual(participantAbsent.currentMatch.value?.ownSide?.teamID, ownTeamID)
        XCTAssertNil(participantAbsent.currentMatch.value?.opponentSide?.teamID)

        let duplicateIDs = makePresentation(
            today: makeToday(currentMatch: match),
            leaders: makeLeaders([
                standing(rank: 1, teamID: ownTeamID, name: "Own One", points: 1),
                standing(rank: 1, teamID: ownTeamID, name: "Own Duplicate", points: 1),
            ])
        )
        XCTAssertEqual(duplicateIDs.currentMatch.value?.ownSide?.teamID, ownTeamID)
        XCTAssertNil(duplicateIDs.currentMatch.value?.opponentSide?.teamID)
    }

    func testMatchStatusCopyUsesOnlyCanonicalLifecycleAndResultFields() throws {
        let scheduled = makePresentation(
            today: makeToday(currentMatch: makeMatch(
                id: "scheduled",
                status: .scheduled,
                involved: true,
                ownSide: 1,
                round: 1
            ))
        )
        XCTAssertEqual(scheduled.currentMatch.value?.statusText, "Upcoming")
        XCTAssertEqual(scheduled.currentMatch.value?.progressText, nil)
        XCTAssertEqual(scheduled.currentMatch.value?.resultText, nil)

        let live = makePresentation(
            today: makeToday(currentMatch: makeMatch(
                id: "live",
                status: .inProgress,
                involved: true,
                ownSide: 1,
                round: 2,
                currentHole: 8
            ))
        )
        XCTAssertEqual(live.currentMatch.value?.statusText, "Live")
        XCTAssertEqual(live.currentMatch.value?.progressText, "Hole 8")
        XCTAssertEqual(live.currentMatch.value?.resultText, nil)

        let completed = makePresentation(
            today: makeToday(currentMatch: makeMatch(
                id: "final",
                status: .completed,
                involved: true,
                ownSide: 1,
                round: 3,
                resultSummary: "2 & 1"
            ))
        )
        XCTAssertEqual(completed.currentMatch.value?.statusText, "Final")
        XCTAssertEqual(completed.currentMatch.value?.progressText, nil)
        XCTAssertEqual(completed.currentMatch.value?.resultText, "2 & 1")
    }

    func testPointsFormattingAndCanonicalLeaderRanksPreserveReturnedOrder() throws {
        XCTAssertEqual(TodayPointsFormatter.string(for: nil), "—")
        XCTAssertEqual(TodayPointsFormatter.string(for: 0), "0")
        XCTAssertEqual(TodayPointsFormatter.string(for: 8), "8")
        XCTAssertEqual(TodayPointsFormatter.string(for: 0.5), "½")
        XCTAssertEqual(TodayPointsFormatter.string(for: 8.5), "8½")
        XCTAssertEqual(TodayPointsFormatter.string(for: 1.25), "1.25")

        let returnedSecond = standing(
            rank: 2,
            teamID: "team-second",
            name: "Returned Second",
            points: 8
        )
        let canonicalLeader = standing(
            rank: 1,
            teamID: "team-first",
            name: "Canonical Leader",
            points: 8.5
        )
        let presentation = makePresentation(
            leaders: makeLeaders([returnedSecond, canonicalLeader])
        )

        let score = try XCTUnwrap(presentation.tournamentScore.value)
        XCTAssertEqual(score.teams.map(\.teamID), ["team-second", "team-first"])
        XCTAssertEqual(score.teams.map(\.pointsText), ["8", "8½"])
        XCTAssertFalse(score.teams[0].isSoleLeader)
        XCTAssertTrue(score.teams[1].isSoleLeader)
        XCTAssertFalse(score.teams[1].isTiedForLead)
        XCTAssertEqual(score.contextText, "Round 2 · Live")
    }

    func testCanonicalTiedRankMarksEveryRankOneTeamWithoutComparingPoints() throws {
        let presentation = makePresentation(
            leaders: makeLeaders([
                standing(rank: 1, teamID: "team-a", name: "A", points: 7.5),
                standing(rank: 1, teamID: "team-b", name: "B", points: 99),
            ])
        )

        let teams = try XCTUnwrap(presentation.tournamentScore.value?.teams)
        XCTAssertEqual(teams.map(\.isTiedForLead), [true, true])
        XCTAssertEqual(teams.map(\.isSoleLeader), [false, false])
    }

    func testScheduleUsesTournamentLocalDateAcrossUTCBoundaryPreservesOrderAndBoundsFour() throws {
        let now = try MobileTimestamp("2026-09-25T00:30:00.000Z").date
        let events = [
            scheduleEvent(id: "one", date: "2026-09-24", startAt: "2026-09-24T22:00:00.000Z"),
            scheduleEvent(id: "derived", date: nil, startAt: "2026-09-25T00:15:00.000Z"),
            scheduleEvent(id: "three", date: "2026-09-24", startAt: "2026-09-25T01:00:00.000Z"),
            scheduleEvent(id: "four", date: "2026-09-24", startAt: "2026-09-25T02:00:00.000Z"),
            scheduleEvent(id: "bounded-out", date: "2026-09-24", startAt: "2026-09-25T03:00:00.000Z"),
            scheduleEvent(id: "tomorrow", date: "2026-09-25", startAt: "2026-09-25T15:00:00.000Z"),
        ]
        let fallback = scheduleEvent(
            id: "fallback-must-not-win",
            date: "2026-09-25",
            startAt: "2026-09-25T15:00:00.000Z"
        )
        let presentation = makePresentation(
            today: makeToday(currentMatch: nil, immediateSchedule: [fallback]),
            schedule: makeSchedule(events),
            now: now,
            locale: Locale(identifier: "en_US")
        )

        let schedule = try XCTUnwrap(presentation.schedule.value)
        XCTAssertEqual(schedule.title, "Today’s Schedule")
        XCTAssertEqual(schedule.source, .fullScheduleToday)
        XCTAssertEqual(schedule.events.compactMap(\.eventID), ["one", "derived", "three", "four"])
        XCTAssertFalse(schedule.events.contains { $0.eventID == "bounded-out" })
        XCTAssertFalse(schedule.events.contains { $0.eventID == "fallback-must-not-win" })
        XCTAssertEqual(
            schedule.events[1].startTimeText,
            TodayClockFormatter.string(
                for: try MobileTimestamp("2026-09-25T00:15:00.000Z").date,
                in: try XCTUnwrap(TimeZone(identifier: "America/Chicago")),
                locale: Locale(identifier: "en_US")
            )
        )
    }

    func testClockFormattingHonorsTheUsersTwelveOrTwentyFourHourLocale() throws {
        let local = try MobileLocalTime("19:15:00")
        let twelveHour = TodayClockFormatter.string(for: local, locale: Locale(identifier: "en_US"))
        let twentyFourHour = TodayClockFormatter.string(for: local, locale: Locale(identifier: "en_GB"))

        XCTAssertTrue(twelveHour.contains("7:15"))
        XCTAssertTrue(twelveHour.uppercased().contains("PM"))
        XCTAssertEqual(twentyFourHour, "19:15")
    }

    func testScheduleFallsBackToImmediateScheduleAsUpNextWhenNoLocalTodayEventMatches() throws {
        let now = try MobileTimestamp("2026-09-25T00:30:00.000Z").date
        let fallback = scheduleEvent(
            id: "up-next",
            date: "2026-09-25",
            startAt: "2026-09-25T15:00:00.000Z"
        )
        let presentation = makePresentation(
            today: makeToday(currentMatch: nil, immediateSchedule: [fallback]),
            schedule: makeSchedule([
                scheduleEvent(
                    id: "not-local-today",
                    date: "2026-09-25",
                    startAt: "2026-09-25T15:00:00.000Z"
                ),
            ]),
            now: now
        )

        let schedule = try XCTUnwrap(presentation.schedule.value)
        XCTAssertEqual(schedule.title, "Up Next")
        XCTAssertEqual(schedule.source, .immediateScheduleFallback)
        XCTAssertEqual(schedule.events.map(\.eventID), ["up-next"])
    }

    func testScheduleNowAndCompletedStateUseCanonicalAbsoluteInterval() throws {
        let now = try MobileTimestamp("2026-09-24T18:30:00.000Z").date
        let current = scheduleEvent(
            id: "current",
            date: "2026-09-24",
            startAt: "2026-09-24T18:00:00.000Z",
            endAt: "2026-09-24T19:00:00.000Z"
        )
        let completed = scheduleEvent(
            id: "completed",
            date: "2026-09-24",
            startAt: "2026-09-24T16:00:00.000Z",
            endAt: "2026-09-24T17:00:00.000Z"
        )
        let presentation = makePresentation(
            schedule: makeSchedule([current, completed]),
            now: now
        )

        let events = try XCTUnwrap(presentation.schedule.value?.events)
        XCTAssertTrue(events[0].isNow)
        XCTAssertFalse(events[0].isCompleted)
        XCTAssertFalse(events[1].isNow)
        XCTAssertTrue(events[1].isCompleted)
    }

    func testScheduleStartWithoutEndDoesNotInventCompletedState() throws {
        let now = try MobileTimestamp("2026-09-24T18:30:00.000Z").date
        let startedWithoutEnd = scheduleEvent(
            id: "open-ended",
            date: "2026-09-24",
            startAt: "2026-09-24T16:00:00.000Z"
        )
        let presentation = makePresentation(
            schedule: makeSchedule([startedWithoutEnd]),
            now: now
        )

        let event = try XCTUnwrap(presentation.schedule.value?.events.first)
        XCTAssertFalse(event.isNow)
        XCTAssertFalse(event.isCompleted)
    }

    func testPartialLoadingEmptyAndUnavailableSectionsRemainIndependent() {
        let today = makeToday(currentMatch: nil, immediateSchedule: [])
        let presentation = TodayPresenter.make(
            participant: TestFixtures.participant,
            today: readState(value: today),
            matches: readState(value: Optional<MobileMatchesData>.none, freshness: .refreshing),
            leaders: readState(value: Optional<MobileLeadersData>.none, freshness: .failed),
            schedule: readState(value: makeSchedule([])),
            now: TestFixtures.now
        )

        XCTAssertEqual(presentation.tournament.availability, .content)
        XCTAssertEqual(presentation.currentMatch.availability, .empty)
        XCTAssertEqual(presentation.personalMatches.availability, .loading)
        XCTAssertEqual(presentation.tournamentScore.availability, .unavailable)
        XCTAssertEqual(presentation.schedule.availability, .empty)
    }

    func testSessionTournamentFallbackRemainsParticipantSafeWhenTodayIsUnavailable() throws {
        let presentation = TodayPresenter.make(
            participant: TestFixtures.participant,
            today: readState(value: Optional<MobileTodayData>.none, freshness: .failed),
            matches: readState(value: Optional<MobileMatchesData>.none, freshness: .failed),
            leaders: readState(value: Optional<MobileLeadersData>.none, freshness: .failed),
            schedule: readState(value: Optional<MobileScheduleData>.none, freshness: .failed),
            now: TestFixtures.now
        )

        XCTAssertEqual(presentation.tournament.availability, .unavailable)
        let fallback = try XCTUnwrap(presentation.tournament.value)
        XCTAssertTrue(fallback.isSessionFallback)
        XCTAssertEqual(fallback.name, TestFixtures.participant.tournament.name)
        XCTAssertEqual(fallback.year, TestFixtures.participant.tournament.year)
        XCTAssertNil(fallback.statusText)
        XCTAssertNil(fallback.roundText)
    }

    func testOfflineAndCachedFreshnessBannersDoNotRemoveEligibleValues() throws {
        let oldValidation = TestFixtures.now.addingTimeInterval(-600)
        let offline = TodayPresenter.make(
            participant: TestFixtures.participant,
            today: readState(
                value: makeToday(currentMatch: makeMatch(
                    id: "offline-current",
                    status: .scheduled,
                    involved: true,
                    ownSide: 1,
                    round: 1
                )),
                source: .diskCache,
                freshness: .offline,
                validatedAt: oldValidation
            ),
            matches: readState(value: makeMatches([]), source: .diskCache, freshness: .stale),
            leaders: readState(value: Optional<MobileLeadersData>.none, freshness: .failed),
            schedule: readState(value: Optional<MobileScheduleData>.none, freshness: .failed),
            now: TestFixtures.now
        )

        XCTAssertEqual(offline.freshnessBanner, TodayFreshnessBanner(kind: .offline, lastValidated: oldValidation))
        XCTAssertEqual(offline.currentMatch.availability, .content)
        XCTAssertEqual(offline.currentMatch.freshness, .offline)
        XCTAssertEqual(offline.currentMatch.value?.matchID, "offline-current")

        let cached = makePresentation(
            todayState: readState(
                value: makeToday(currentMatch: nil),
                source: .diskCache,
                freshness: .refreshing,
                validatedAt: oldValidation
            )
        )
        XCTAssertEqual(cached.freshnessBanner?.kind, .cached)
        XCTAssertEqual(cached.tournament.freshness, .refreshing)
    }

    private func makePresentation(
        today: MobileTodayData? = nil,
        matches: MobileMatchesData? = nil,
        leaders: MobileLeadersData? = nil,
        schedule: MobileScheduleData? = nil,
        now: Date = TestFixtures.now,
        locale: Locale = .autoupdatingCurrent,
        todayState: MobileReadState<MobileTodayData>? = nil
    ) -> TodayPresentation {
        TodayPresenter.make(
            participant: TestFixtures.participant,
            today: todayState ?? readState(value: today ?? makeToday(currentMatch: nil)),
            matches: readState(value: matches ?? makeMatches([])),
            leaders: readState(value: leaders ?? makeLeaders([])),
            schedule: readState(value: schedule ?? makeSchedule([])),
            now: now,
            locale: locale
        )
    }

    private func readState<Value>(
        value: Value?,
        source: MobileReadSource? = .network,
        freshness: MobileReadFreshness = .fresh,
        validatedAt: Date? = TestFixtures.now
    ) -> MobileReadState<Value> where Value: Equatable & Sendable {
        MobileReadState(
            value: value,
            source: value == nil ? nil : source,
            freshness: freshness,
            isRefreshing: freshness == .refreshing,
            revision: value == nil ? nil : "presentation-fixture",
            generatedAt: value == nil ? nil : TestFixtures.readMeta.generatedAt,
            fetchedAt: value == nil ? nil : TestFixtures.now,
            validatedAt: value == nil ? nil : validatedAt,
            lastSafeError: freshness == .failed ? .unavailable : nil,
            lastServerCode: nil,
            lastHTTPStatus: nil,
            cachePersistenceIssue: false
        )
    }

    private func makeToday(
        currentMatch: MobileMatch?,
        immediateSchedule: [MobileScheduleEvent] = []
    ) -> MobileTodayData {
        MobileTodayData(
            tournament: TestFixtures.readTournament,
            player: MobileReadPlayer(
                playerId: TestFixtures.participant.player.playerId,
                displayName: TestFixtures.participant.player.displayName,
                team: MobileReadTeam(
                    teamId: TestFixtures.participant.player.team?.teamId,
                    name: TestFixtures.participant.player.team?.name ?? ""
                )
            ),
            currentMatch: currentMatch,
            immediateSchedule: immediateSchedule
        )
    }

    private func makeMatches(_ matches: [MobileMatch]) -> MobileMatchesData {
        MobileMatchesData(
            tournament: TestFixtures.readTournament,
            matches: matches.map(matchesContractMatch)
        )
    }

    private func matchesContractMatch(_ match: MobileMatch) -> MobileMatchesMatch {
        MobileMatchesMatch(
            matchId: match.matchId,
            displayMatchNumber: nil,
            round: match.round,
            status: match.status,
            course: match.course,
            teeTime: match.teeTime,
            teams: match.teams.map { side in
                MobileMatchesTeam(
                    side: side.side,
                    teamId: "team-\(side.side)",
                    name: side.name,
                    playingHandicap: nil,
                    strokesReceived: nil,
                    participants: side.participants.map {
                        MobileMatchesParticipant(
                            playerId: $0.playerId,
                            displayName: $0.displayName,
                            teamSide: $0.teamSide,
                            isAuthenticatedPlayer: $0.isAuthenticatedPlayer,
                            playingHandicap: nil,
                            strokesReceived: nil
                        )
                    }
                )
            },
            authenticatedPlayer: match.authenticatedPlayer,
            progress: match.progress,
            result: match.result
        )
    }

    private func makeLeaders(_ teams: [MobileTeamStanding]) -> MobileLeadersData {
        MobileLeadersData(
            tournament: TestFixtures.readTournament,
            teamStandings: teams,
            roundStandings: [],
            playerStandings: []
        )
    }

    private func makeSchedule(_ events: [MobileScheduleEvent]) -> MobileScheduleData {
        MobileScheduleData(
            tournamentId: TestFixtures.participant.tournament.tournamentId,
            timeZone: "America/Chicago",
            events: events
        )
    }

    private func standing(
        rank: Int?,
        teamID: String,
        name: String,
        points: Double?
    ) -> MobileTeamStanding {
        MobileTeamStanding(
            rank: rank,
            teamId: teamID,
            name: name,
            points: points,
            record: "2-1-0",
            remainingMatches: 1
        )
    }

    private func makeMatch(
        id: String,
        status: MobileMatchStatus,
        involved: Bool,
        ownSide: Int?,
        round: Int,
        currentHole: Int? = nil,
        resultSummary: String? = nil
    ) -> MobileMatch {
        let authPlayerID = TestFixtures.participant.player.playerId
        let authSide = involved ? ownSide : nil
        let teamOne = MobileMatchTeam(
            side: 1,
            name: "Team One",
            participants: [
                MobileMatchParticipant(
                    playerId: authSide == 1 ? authPlayerID : "team-one-player",
                    displayName: authSide == 1 ? "Preview Golfer" : "Team One Player",
                    teamSide: 1,
                    isAuthenticatedPlayer: authSide == 1
                ),
                MobileMatchParticipant(
                    playerId: "team-one-partner",
                    displayName: "Team One Partner",
                    teamSide: 1,
                    isAuthenticatedPlayer: false
                ),
            ]
        )
        let teamTwo = MobileMatchTeam(
            side: 2,
            name: "Team Two",
            participants: [
                MobileMatchParticipant(
                    playerId: authSide == 2 ? authPlayerID : "team-two-player",
                    displayName: authSide == 2 ? "Preview Golfer" : "Team Two Player",
                    teamSide: 2,
                    isAuthenticatedPlayer: authSide == 2
                ),
                MobileMatchParticipant(
                    playerId: "team-two-partner",
                    displayName: "Team Two Partner",
                    teamSide: 2,
                    isAuthenticatedPlayer: false
                ),
            ]
        )
        let ownParticipants = authSide == 1 ? teamOne.participants : authSide == 2 ? teamTwo.participants : []
        let opponentParticipants = authSide == 1 ? teamTwo.participants : authSide == 2 ? teamOne.participants : []
        return MobileMatch(
            matchId: id,
            round: MobileMatchRound(roundNumber: round, name: "Round \(round)", format: "Four-Ball"),
            status: status,
            course: MobileMatchCourse(courseId: "course-1", name: "Preview Course", tee: "Blue"),
            teeTime: MobileMatchTeeTime(
                localTime: try! MobileLocalTime("09:30:00"),
                label: "9:30 AM",
                timeZone: "America/Chicago"
            ),
            teams: [teamOne, teamTwo],
            authenticatedPlayer: MobileAuthenticatedPlayerRelationship(
                involved: involved,
                teamSide: authSide,
                partnerPlayerIds: ownParticipants.filter { !$0.isAuthenticatedPlayer }.map(\.playerId),
                opponentPlayerIds: opponentParticipants.map(\.playerId)
            ),
            progress: status == .inProgress ? MobileMatchProgress(currentHole: currentHole) : nil,
            result: status == .completed ? MobileMatchResult(
                summary: resultSummary,
                winner: nil,
                teamOnePoints: nil,
                teamTwoPoints: nil
            ) : nil
        )
    }

    private func scheduleEvent(
        id: String,
        date: String?,
        startAt: String,
        endAt: String? = nil
    ) -> MobileScheduleEvent {
        MobileScheduleEvent(
            eventId: id,
            date: date.map { try! MobileCalendarDate($0) },
            startAt: try! MobileTimestamp(startAt),
            endAt: endAt.map { try! MobileTimestamp($0) },
            localStartTime: nil,
            localEndTime: nil,
            title: "Event \(id)",
            subtitle: nil,
            location: nil,
            type: "tournament"
        )
    }
}
