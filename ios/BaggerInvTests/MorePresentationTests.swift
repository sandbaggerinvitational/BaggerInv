import XCTest
@testable import BaggerInv

final class MorePresentationTests: XCTestCase {
    private let locale = Locale(identifier: "en_US")

    func testMoreDirectoryHasStableNativeHierarchyWithoutDuplicateCareerDestination() {
        let presentation = MoreDirectoryPresentation.standard

        XCTAssertEqual(presentation.sections.map(\.id), [
            "tournament", "my-bagger", "competition", "local", "app",
        ])
        XCTAssertEqual(
            presentation.sections.flatMap(\.items).map(\.destination),
            [
                .schedule, .tournamentGuide, .courses, .rules,
                .passport, .history, .records,
                .odds,
                .dining, .localGuide, .contacts,
                .settings,
            ]
        )
        XCTAssertEqual(Set(presentation.sections.flatMap(\.items).map(\.id)).count, 12)
    }

    func testFullSchedulePreservesCanonicalOrderAndOnlyUsesAbsoluteTimestampsForState() throws {
        let now = try MobileTimestamp("2026-09-24T17:00:00.000Z").date
        let events = [
            scheduleEvent(
                id: "second-on-server",
                date: "2026-09-25",
                startAt: nil,
                localStartTime: "08:00:00"
            ),
            scheduleEvent(
                id: "first-on-server",
                date: "2026-09-24",
                startAt: "2026-09-24T18:00:00.000Z",
                localStartTime: nil
            ),
        ]

        let presentation = FullSchedulePresenter.make(
            data: MobileScheduleData(
                tournamentId: "tournament-preview",
                timeZone: "America/Chicago",
                events: events
            ),
            now: now,
            locale: locale
        )

        XCTAssertEqual(presentation.days.map(\.id), ["2026-09-25", "2026-09-24"])
        XCTAssertEqual(presentation.days.flatMap(\.events).map(\.id), [
            "second-on-server", "first-on-server",
        ])
        XCTAssertEqual(presentation.days[0].events[0].state, .undetermined)
        XCTAssertEqual(presentation.days[1].events[0].state, .upcoming)
    }

    func testFullScheduleDerivesMissingCalendarDateFromAbsoluteStartInTournamentZone() throws {
        let presentation = FullSchedulePresenter.make(
            data: MobileScheduleData(
                tournamentId: "tournament-preview",
                timeZone: "America/Chicago",
                events: [
                    scheduleEvent(
                        id: "start-only",
                        date: nil,
                        startAt: "2026-09-25T02:30:00.000Z",
                        localStartTime: nil
                    ),
                    scheduleEvent(
                        id: "canonical-date",
                        date: "2026-09-24",
                        startAt: nil,
                        localStartTime: "08:00:00"
                    ),
                ]
            ),
            now: try MobileTimestamp("2026-09-24T17:00:00.000Z").date,
            locale: locale
        )

        XCTAssertEqual(presentation.days.map(\.id), ["2026-09-24"])
        XCTAssertEqual(
            presentation.days[0].events.map(\.id),
            ["start-only", "canonical-date"]
        )
        XCTAssertTrue(
            presentation.days[0].events[0].accessibilityLabel.contains("September 24, 2026")
        )
    }

    func testGuidePreservesServerOrderAndOnlyCreatesSafeExternalActions() throws {
        let data = MobileGuideData(
            contractVersion: "guide-v1",
            tournamentId: "tournament-preview",
            publicationState: .published,
            publishedAt: try MobileTimestamp("2026-08-30T12:00:00.000Z"),
            tournament: MobileGuideTournament(
                tournamentId: "tournament-preview",
                year: 2026,
                name: "Bagger Invitational",
                editionTitle: "Preview",
                dates: "September 24–27",
                location: "Kiawah Island",
                timeZone: "America/New_York",
                logoAssetKey: nil,
                heroAssetKey: nil,
                mobileHeroAssetKey: nil
            ),
            overview: [
                MobileGuideOverviewSection(sectionId: "second", slug: "second", title: "Second", body: "B", sortOrder: 2),
                MobileGuideOverviewSection(sectionId: "first", slug: "first", title: "First", body: "A", sortOrder: 1),
            ],
            rules: MobileGuideRules(roundFormats: [], items: []),
            courses: [
                MobileGuideCourse(
                    courseId: "ocean-course",
                    name: "Ocean Course",
                    city: "Kiawah Island",
                    state: "SC",
                    location: nil,
                    yearOpened: 1991,
                    designer: "Pete Dye",
                    website: "https://example.com/course",
                    directionsUrl: "http://unsafe.example.com",
                    logoAssetKey: nil,
                    profileAssetKey: nil,
                    overview: nil,
                    playingTips: nil,
                    signatureHoles: nil,
                    history: nil,
                    assignments: []
                ),
            ],
            dining: [],
            localGuide: [
                MobileGuideLocalEntry(
                    entryId: "local",
                    year: 2026,
                    category: "Transportation",
                    title: "Shuttle",
                    description: nil,
                    address: nil,
                    phone: "not a phone",
                    website: "https://example.com/shuttle",
                    sortOrder: 0
                ),
            ],
            contacts: []
        )

        let presentation = GuidePresenter.make(data: data, locale: locale)

        XCTAssertEqual(presentation.overview.map(\.id), ["second", "first"])
        XCTAssertEqual(presentation.courses[0].actions.map(\.kind), [.website])
        XCTAssertEqual(presentation.localGuide[0].actions.map(\.kind), [.website])
        XCTAssertTrue(presentation.isPublished)
    }

    func testGuideUnpublishedPresentationDoesNotFabricateContent() {
        let presentation = GuidePresenter.make(
            data: MobileGuideData(
                contractVersion: "guide-v1",
                tournamentId: "tournament-preview",
                publicationState: .unpublished,
                publishedAt: nil,
                tournament: nil,
                overview: [],
                rules: MobileGuideRules(roundFormats: [], items: []),
                courses: [],
                dining: [],
                localGuide: [],
                contacts: []
            ),
            locale: locale
        )

        XCTAssertFalse(presentation.isPublished)
        XCTAssertNil(presentation.tournamentName)
        XCTAssertTrue(presentation.overview.isEmpty)
        XCTAssertTrue(presentation.courses.isEmpty)
    }

    func testGuidePhoneActionsSupportCertifiedShortCodesExtensionsAndDialControls() {
        let contacts = [
            guideContact(id: "emergency", phone: "911", textEnabled: true),
            guideContact(id: "extension", phone: "+1 (843) 555-0126 ext. 42", textEnabled: true),
            guideContact(id: "controls", phone: "+1 (843) 555-0126,123#", textEnabled: true),
            guideContact(id: "malformed", phone: "+1 843 555 0126<script>", textEnabled: true),
        ]

        let presentation = GuidePresenter.make(
            data: guideData(contacts: contacts),
            locale: locale
        )

        XCTAssertEqual(
            presentation.contacts[0].actions.map(\.url.absoluteString),
            ["tel:911", "sms:911"]
        )
        XCTAssertEqual(
            presentation.contacts[1].actions.map { $0.url.absoluteString.removingPercentEncoding },
            ["tel:+18435550126,42", "sms:+18435550126"]
        )
        XCTAssertEqual(
            presentation.contacts[2].actions.map { $0.url.absoluteString.removingPercentEncoding },
            ["tel:+18435550126,123#", "sms:+18435550126"]
        )
        XCTAssertTrue(presentation.contacts[3].actions.isEmpty)
    }

    func testPassportRichCareerPreservesEveryCanonicalCollectionOrder() {
        let presentation = PassportPresenter.make(data: passportData(rich: true), locale: locale)

        XCTAssertEqual(presentation.displayName, "Long Preview Golfer Name")
        XCTAssertEqual(presentation.teamName, "Preview Team")
        XCTAssertEqual(presentation.careerYears, "2019–2026")
        XCTAssertEqual(presentation.currentTournament.rounds.map(\.roundNumber), [2, 1])
        XCTAssertEqual(presentation.currentTournament.rounds.map(\.formatCode), ["SC", "BB"])
        XCTAssertEqual(
            presentation.honors.map(\.id),
            ["champion-2024", "champion-2022", "sandbagger-2020", "points-champion-2025", "board-of-governors"]
        )
        XCTAssertEqual(presentation.rankings.map(\.id), [
            "birdies", "careerPoints", "matchWins", "winPercentage", "holeDifferential", "averageGross",
        ])
        XCTAssertEqual(presentation.tournamentHistory.map(\.year), [2026, 2024])
        XCTAssertEqual(presentation.formatPerformance.map(\.formatCode), ["SC", "BB", "SI"])
        XCTAssertEqual(presentation.formatPerformance[0].matches.first?.teamName, "Preview Team")
        XCTAssertEqual(presentation.formatPerformance[0].matches.first?.winner, "Preview Team")
        XCTAssertEqual(presentation.formatPerformance[0].matches.first?.winnerSide, 1)
        XCTAssertEqual(presentation.recordsHeld.map(\.id), ["record-2", "record-1"])
        XCTAssertEqual(presentation.captainLegacy.seasons.map(\.year), [2025, 2023])
        XCTAssertEqual(presentation.biggestRival?.playerID, "player-rival")
        XCTAssertEqual(presentation.draftHistory.map(\.year), [2026, 2024])
        XCTAssertEqual(presentation.topPartners.map(\.playerID), ["partner-2", "partner-1"])
        XCTAssertEqual(presentation.topPartners.map(\.rank), ["T#2", "#1"])
        XCTAssertEqual(
            presentation.currentTournament.rounds[0].metrics.first(where: { $0.id == "round-2-rank" })?.value,
            "T#2"
        )
        XCTAssertEqual(
            presentation.holePerformance.first(where: { $0.id == "average-par-3" })?.value,
            "3.25"
        )
        XCTAssertEqual(
            presentation.matchProgression.first(where: { $0.id == "front-nine" })?.value,
            "12-8-4"
        )
    }

    func testPassportNewPlayerKeepsNullableAndEmptyCareerStateAbsent() {
        let presentation = PassportPresenter.make(data: passportData(rich: false), locale: locale)

        XCTAssertNil(presentation.teamName)
        XCTAssertNil(presentation.careerYears)
        XCTAssertNil(presentation.portraitAssetKey)
        XCTAssertNil(presentation.currentTournament.teamName)
        XCTAssertNil(presentation.currentTournament.record)
        XCTAssertNil(presentation.currentTournament.points)
        XCTAssertTrue(presentation.currentTournament.rounds.isEmpty)
        XCTAssertTrue(presentation.honors.isEmpty)
        XCTAssertTrue(presentation.rankings.isEmpty)
        XCTAssertTrue(presentation.tournamentHistory.isEmpty)
        XCTAssertTrue(presentation.formatPerformance.isEmpty)
        XCTAssertTrue(presentation.recordsHeld.isEmpty)
        XCTAssertTrue(presentation.captainLegacy.seasons.isEmpty)
        XCTAssertNil(presentation.biggestRival)
        XCTAssertTrue(presentation.draftHistory.isEmpty)
        XCTAssertTrue(presentation.topPartners.isEmpty)
    }

    func testHistoryArchivePreservesCanonicalTournamentAndTeamOrder() {
        let newest = historySummary(
            id: "tournament-2026",
            year: 2026,
            teams: [
                MobileHistoryTeamResult(teamId: "team-2", name: "Second", side: 2, points: 7.5),
                MobileHistoryTeamResult(teamId: "team-1", name: "First", side: 1, points: 8.5),
            ]
        )
        let oldest = historySummary(id: "tournament-2025", year: 2025, teams: newest.teams)

        let presentation = HistoryPresenter.archive(
            data: MobileHistoryArchiveData(tournaments: [newest, oldest]),
            locale: locale
        )

        XCTAssertEqual(presentation.tournaments.map(\.year), [2026, 2025])
        XCTAssertEqual(presentation.tournaments[0].teams.map(\.name), ["Second", "First"])
        XCTAssertEqual(presentation.tournaments[0].teams.map(\.points), ["7½", "8½"])
    }

    func testRecordsUsesCanonicalValueDisplayAndPreservesHolderOrder() {
        let data = MobileRecordsData(
            coverage: MobileRecordsCoverage(
                firstCompleteMatchYear: 2017,
                scorecardHistoryComplete: true,
                note: "Official record book"
            ),
            categories: [
                MobileRecordCategory(
                    categoryId: .individual,
                    title: "Individual",
                    order: 1,
                    records: [
                        MobileRecord(
                            recordId: "most-wins",
                            title: "Most Wins",
                            source: .scorecard,
                            direction: .highest,
                            unit: nil,
                            decimals: 0,
                            signed: false,
                            aggregate: false,
                            eligibilityNote: nil,
                            value: .number(12),
                            valueDisplay: "Twelve canonical wins",
                            tied: true,
                            holders: [
                                recordHolder(name: "Second Holder", playerID: "player-2", secondaryValue: 0),
                                recordHolder(name: "First Holder", playerID: "player-1", secondaryValue: 2),
                            ]
                        ),
                    ]
                ),
            ]
        )

        let presentation = RecordsPresenter.make(data: data, locale: locale)

        XCTAssertEqual(presentation.categories[0].records[0].value, "Twelve canonical wins")
        XCTAssertEqual(
            presentation.categories[0].records[0].holders.map(\.displayName),
            ["Second Holder", "First Holder"]
        )
        XCTAssertEqual(
            presentation.categories[0].records[0].holders.map(\.secondaryValue),
            ["Even", "+2"]
        )
    }

    func testHistoryScorecardsResolveCanonicalNamesByIdentifierOnly() {
        let summary = historySummary(
            id: "history-2026",
            year: 2026,
            teams: [
                MobileHistoryTeamResult(teamId: "team-one", name: "Pines", side: 1, points: 8),
                MobileHistoryTeamResult(teamId: "team-two", name: "Dunes", side: 2, points: 8),
            ]
        )
        let teams = [
            MobileHistoryTeam(
                teamId: "team-one",
                name: "Pines",
                side: 1,
                points: 8,
                captain: nil,
                averageHandicap: nil,
                roster: [
                    MobileHistoryRosterPlayer(
                        playerId: "player-one",
                        displayName: "Alex Morgan",
                        handicap: nil,
                        isCaptain: false
                    ),
                ]
            ),
            MobileHistoryTeam(
                teamId: "team-two",
                name: "Dunes",
                side: 2,
                points: 8,
                captain: nil,
                averageHandicap: nil,
                roster: [
                    MobileHistoryRosterPlayer(
                        playerId: "player-two",
                        displayName: "Taylor Kim",
                        handicap: nil,
                        isCaptain: false
                    ),
                ]
            ),
        ]
        let presentation = HistoryPresenter.detail(
            data: MobileHistoryDetailData(
                tournament: summary,
                teams: teams,
                rounds: [],
                matches: [],
                standings: [],
                awards: [],
                scorecards: [
                    historyScorecard(
                        id: "individual-card",
                        entityType: .individual,
                        playerID: "player-one",
                        teamID: "team-one",
                        participantIDs: ["player-one"]
                    ),
                    historyScorecard(
                        id: "team-card",
                        entityType: .team,
                        playerID: nil,
                        teamID: "team-two",
                        participantIDs: ["player-two"]
                    ),
                ]
            ),
            locale: locale
        )

        XCTAssertEqual(presentation.scorecards.map(\.participantLabel), ["Alex Morgan", "Dunes"])
    }

    func testOddsOnlyFormatsCanonicalValuesAndPreservesRankingOrder() throws {
        let snapshot = MobileOddsSnapshot(
            phase: .preTournament,
            phaseOrder: 0,
            label: "Opening",
            isCurrent: true,
            publishedAt: try MobileTimestamp("2026-08-30T12:00:00.000Z"),
            iterations: 100_000,
            totalPointsAvailable: 16,
            teams: [
                MobileOddsTeam(side: 2, teamId: "team-2", name: "Second", probability: 40, americanOdds: "+150", expectedPoints: 7.5),
                MobileOddsTeam(side: 1, teamId: "team-1", name: "First", probability: 60, americanOdds: "-150", expectedPoints: 8.5),
            ],
            players: [
                MobileOddsPlayer(rank: 2, playerId: "player-2", displayName: "Second Player", teamSide: 2, probability: 20, americanOdds: "+400", expectedPoints: 3.5, expectedRecord: "3-1-1", averageFinish: 2.5),
                MobileOddsPlayer(rank: 1, playerId: "player-1", displayName: "First Player", teamSide: 1, probability: 30, americanOdds: "+233", expectedPoints: 4.5, expectedRecord: "4-0-1", averageFinish: 1.5),
            ]
        )
        let data = MobileOddsData(
            publication: MobileOddsPublication(
                state: .published,
                revision: 1,
                publishedAt: try MobileTimestamp("2026-08-30T12:00:00.000Z"),
                currentPhase: .preTournament
            ),
            snapshots: [snapshot]
        )

        let presentation = OddsPresenter.make(data: data, locale: locale)

        XCTAssertEqual(presentation.snapshots[0].teams.map(\.name), ["Second", "First"])
        XCTAssertEqual(presentation.snapshots[0].players.map(\.rank), [2, 1])
        XCTAssertEqual(presentation.snapshots[0].players.map(\.americanOdds), ["+400", "+233"])
        XCTAssertEqual(presentation.snapshots[0].players[0].probability, "20%")
        XCTAssertEqual(presentation.snapshots[0].publishedAt, snapshot.publishedAt.date)
    }

    private func scheduleEvent(
        id: String,
        date: String?,
        startAt: String?,
        localStartTime: String?
    ) -> MobileScheduleEvent {
        MobileScheduleEvent(
            eventId: id,
            date: date.map { try! MobileCalendarDate($0) },
            startAt: startAt.map { try! MobileTimestamp($0) },
            endAt: nil,
            localStartTime: localStartTime.map { try! MobileLocalTime($0) },
            localEndTime: nil,
            title: id,
            subtitle: nil,
            location: nil,
            type: "tournament"
        )
    }

    private func guideData(contacts: [MobileGuideContact]) -> MobileGuideData {
        MobileGuideData(
            contractVersion: "guide-v1",
            tournamentId: "tournament-preview",
            publicationState: .published,
            publishedAt: try! MobileTimestamp("2026-08-30T12:00:00.000Z"),
            tournament: MobileGuideTournament(
                tournamentId: "tournament-preview",
                year: 2026,
                name: "Bagger Invitational",
                editionTitle: "Preview",
                dates: "September 24–27",
                location: "Kiawah Island",
                timeZone: "America/New_York",
                logoAssetKey: nil,
                heroAssetKey: nil,
                mobileHeroAssetKey: nil
            ),
            overview: [],
            rules: MobileGuideRules(roundFormats: [], items: []),
            courses: [],
            dining: [],
            localGuide: [],
            contacts: contacts
        )
    }

    private func guideContact(
        id: String,
        phone: String,
        textEnabled: Bool
    ) -> MobileGuideContact {
        MobileGuideContact(
            contactId: id,
            year: 2026,
            category: "Tournament Operations",
            name: id.capitalized,
            role: nil,
            phone: phone,
            textEnabled: textEnabled,
            email: nil,
            website: nil,
            sortOrder: 0
        )
    }

    private func historySummary(
        id: String,
        year: Int,
        teams: [MobileHistoryTeamResult]
    ) -> MobileHistoryTournamentSummary {
        MobileHistoryTournamentSummary(
            tournamentId: id,
            year: year,
            name: "Bagger Invitational",
            editionTitle: nil,
            destination: nil,
            startDate: nil,
            endDate: nil,
            status: .final,
            teams: teams,
            champion: nil,
            runnerUp: nil,
            finalScore: nil,
            detailAvailable: true,
            revision: "revision-\(year)"
        )
    }

    private func recordHolder(
        name: String,
        playerID: String,
        secondaryValue: Double? = nil
    ) -> MobileRecordHolder {
        MobileRecordHolder(
            entityType: .player,
            playerIds: [playerID],
            displayName: name,
            participantNames: [name],
            teamId: nil,
            teamName: nil,
            courseId: nil,
            courseName: nil,
            holeNumber: nil,
            matchId: nil,
            year: 2026,
            roundNumber: nil,
            format: nil,
            value: nil,
            valueDisplay: nil,
            secondaryValue: secondaryValue
        )
    }

    private func historyScorecard(
        id: String,
        entityType: MobileHistoryScorecardEntityType,
        playerID: String?,
        teamID: String?,
        participantIDs: [String]
    ) -> MobileHistoryScorecard {
        MobileHistoryScorecard(
            scorecardId: id,
            matchId: "match-one",
            entityType: entityType,
            playerId: playerID,
            teamId: teamID,
            participantPlayerIds: participantIDs,
            status: "FINAL",
            grossTotal: 72,
            netTotal: 70,
            holes: []
        )
    }

    private func passportData(rich: Bool) -> MobilePassportData {
        let emptyRecord = passportRecord(wins: 0, losses: 0, halves: 0, points: nil)
        let careerRecord = passportRecord(wins: 12, losses: 6, halves: 2, points: 13)
        let team = MobilePassportTeam(teamId: "team-preview", name: "Preview Team", side: 1)
        let rankings: [MobilePassportRanking] = rich ? [
            MobilePassportRanking(metric: .birdies, rank: 2),
            MobilePassportRanking(metric: .careerPoints, rank: 1),
            MobilePassportRanking(metric: .matchWins, rank: 3),
            MobilePassportRanking(metric: .winPercentage, rank: 4),
            MobilePassportRanking(metric: .holeDifferential, rank: 5),
            MobilePassportRanking(metric: .averageGross, rank: nil),
        ] : []
        let formatRecord = passportRecord(wins: 4, losses: 2, halves: 1, points: 4.5)

        return MobilePassportData(
            contractVersion: "mobile-passport-v1",
            player: MobilePassportPlayer(
                playerId: "player-preview",
                displayName: rich ? "Long Preview Golfer Name" : "New Golfer",
                active: true,
                careerYears: MobilePassportCareerYears(
                    firstYear: rich ? 2019 : nil,
                    lastYear: rich ? 2026 : nil,
                    current: true
                ),
                portraitAssetKey: rich ? "players/preview" : nil,
                team: rich ? team : nil
            ),
            currentTournament: MobilePassportCurrentTournament(
                tournamentId: "tournament-preview",
                name: "Bagger Invitational",
                year: rich ? 2026 : nil,
                status: rich ? "inProgress" : nil,
                currentRound: rich ? 2 : nil,
                tournamentHandicap: rich ? 8.4 : nil,
                team: rich ? team : nil,
                record: rich
                    ? MobilePassportCurrentTournamentRecord(wins: 2, losses: 1, halves: 1, points: 2.5)
                    : nil,
                standing: rich ? 3 : nil,
                teamStanding: rich ? 1 : nil,
                rounds: rich ? [
                    passportRound(number: 2, format: .scramble, rank: 2, points: 1.5),
                    passportRound(number: 1, format: .bestBall, rank: 1, points: 1),
                ] : []
            ),
            career: MobilePassportCareer(
                summary: MobilePassportCareerSummary(
                    record: rich ? careerRecord : emptyRecord,
                    winPercentage: rich ? 62.5 : 0,
                    appearances: rich ? 8 : 0,
                    championships: rich ? 2 : 0,
                    runnerUpFinishes: rich ? 1 : 0,
                    averageHandicap: rich ? 9.25 : nil
                ),
                honors: MobilePassportHonors(
                    championshipYears: rich ? [2024, 2022] : [],
                    sandbaggerOfYearYears: rich ? [2020] : [],
                    pointsChampionYears: rich ? [2025] : [],
                    boardOfGovernors: rich,
                    handicapCommittee: false
                ),
                rankings: rankings,
                holePerformance: MobilePassportHolePerformance(
                    sample: MobilePassportSample(
                        completeScorecards: rich ? 10 : 0,
                        scoringHoles: rich ? 180 : 0,
                        matchPlayHoles: rich ? 144 : 0
                    ),
                    totalHolesPlayed: rich ? 180 : 0,
                    holesWon: rich ? 72 : 0,
                    holesLost: rich ? 60 : 0,
                    holesHalved: rich ? 48 : 0,
                    holeDifferential: rich ? 12 : 0,
                    frontNineHolesWon: rich ? 38 : 0,
                    backNineHolesWon: rich ? 34 : 0,
                    closingHolesWon: rich ? 14 : 0,
                    birdies: rich ? 20 : 0,
                    eagles: rich ? 1 : 0,
                    pars: rich ? 92 : 0,
                    bogeys: rich ? 50 : 0,
                    doubleBogeysOrWorse: rich ? 17 : 0,
                    averageGrossScore: rich ? 4.3 : nil,
                    averageNetScore: rich ? 3.9 : nil,
                    averagePar3Score: rich ? 3.25 : nil,
                    averagePar4Score: rich ? 4.4 : nil,
                    averagePar5Score: rich ? 5.1 : nil,
                    averageFrontNineScore: rich ? 40.5 : nil,
                    averageBackNineScore: rich ? 39.75 : nil,
                    birdieRate: rich ? 11.1 : nil,
                    parRate: rich ? 51.1 : nil,
                    bogeyRate: rich ? 27.8 : nil,
                    doubleBogeyOrWorseRate: rich ? 9.4 : nil
                ),
                matchProgression: MobilePassportMatchProgression(
                    matches: rich ? 20 : 0,
                    largestLeadHeld: rich ? 5 : 0,
                    largestComebackCompleted: rich ? 3 : 0,
                    matchesWonAfterTrailing: rich ? 4 : 0,
                    largestLeadBlown: rich ? 2 : 0,
                    mostLeadChangesExperienced: rich ? 6 : 0,
                    totalLeadChangesExperienced: rich ? 28 : 0,
                    mostConsecutiveHolesWon: rich ? 4 : 0,
                    mostConsecutiveHolesLost: rich ? 3 : 0,
                    mostClosingHolesWon: rich ? 3 : 0,
                    totalClosingHolesWon: rich ? 15 : 0,
                    frontNine: MobilePassportSegmentRecord(won: rich ? 12 : 0, lost: rich ? 8 : 0, halved: rich ? 4 : 0),
                    backNine: MobilePassportSegmentRecord(won: rich ? 11 : 0, lost: rich ? 9 : 0, halved: rich ? 4 : 0),
                    closing: MobilePassportSegmentRecord(won: rich ? 8 : 0, lost: rich ? 5 : 0, halved: rich ? 2 : 0)
                ),
                tournamentHistory: rich ? [
                    passportTournamentHistory(id: "tournament-2026", year: 2026, team: team, result: .upcoming),
                    passportTournamentHistory(id: "tournament-2024", year: 2024, team: team, result: .champion),
                ] : [],
                formatPerformance: rich ? [
                    passportFormat(.scramble, label: "Scramble", record: formatRecord),
                    passportFormat(.bestBall, label: "Best Ball", record: formatRecord),
                    passportFormat(.singles, label: "Singles", record: formatRecord),
                ] : [],
                recordsHeld: rich ? [
                    MobilePassportRecordHeld(recordId: "record-2", title: "Second canonical record"),
                    MobilePassportRecordHeld(recordId: "record-1", title: "First canonical record"),
                ] : [],
                captainLegacy: MobilePassportCaptainLegacy(
                    record: rich ? formatRecord : emptyRecord,
                    championships: rich ? 1 : 0,
                    seasons: rich ? [
                        MobilePassportCaptainSeason(year: 2025, team: team, result: .runnerUp),
                        MobilePassportCaptainSeason(year: 2023, team: team, result: .champion),
                    ] : []
                ),
                biggestRival: rich ? MobilePassportRival(
                    player: MobilePassportPlayerReference(playerId: "player-rival", displayName: "Rival Golfer"),
                    record: passportRecord(wins: 3, losses: 3, halves: 1, points: 3.5)
                ) : nil,
                draftHistory: rich ? [
                    MobilePassportDraftHistory(year: 2026, pick: 2, teamName: "Preview Team", finish: nil, draftValueScore: 8.75),
                    MobilePassportDraftHistory(year: 2024, pick: 4, teamName: "Preview Team", finish: 1, draftValueScore: 7.5),
                ] : [],
                topPartners: rich ? [
                    MobilePassportPartner(
                        rank: 2,
                        tied: true,
                        player: MobilePassportPlayerReference(playerId: "partner-2", displayName: "Second Partner"),
                        record: passportRecord(wins: 3, losses: 1, halves: 1, points: 3.5)
                    ),
                    MobilePassportPartner(
                        rank: 1,
                        tied: false,
                        player: MobilePassportPlayerReference(playerId: "partner-1", displayName: "First Partner"),
                        record: passportRecord(wins: 4, losses: 1, halves: 0, points: 4)
                    ),
                ] : []
            )
        )
    }

    private func passportRecord(
        wins: Int,
        losses: Int,
        halves: Int,
        points: Double?
    ) -> MobilePassportRecord {
        MobilePassportRecord(
            wins: wins,
            losses: losses,
            halves: halves,
            matches: wins + losses + halves,
            points: points,
            recordedPointMatches: points == nil ? 0 : wins + losses + halves
        )
    }

    private func passportRound(
        number: Int,
        format: MobilePassportFormat,
        rank: Int?,
        points: Double?
    ) -> MobilePassportCurrentRound {
        MobilePassportCurrentRound(
            roundNumber: number,
            format: format,
            status: .completed,
            throughHole: 18,
            holesPlayed: 18,
            scoringEntity: .team,
            gross: 72,
            net: 68.5,
            rank: rank,
            tied: number == 2,
            points: points
        )
    }

    private func passportTournamentHistory(
        id: String,
        year: Int,
        team: MobilePassportTeam,
        result: MobilePassportTournamentResult
    ) -> MobilePassportTournamentHistory {
        MobilePassportTournamentHistory(
            tournamentId: id,
            year: year,
            team: team,
            result: result,
            record: passportRecord(wins: 3, losses: 1, halves: 1, points: 3.5),
            points: 3.5,
            averageScore: 4.25,
            scorecardSample: 3,
            wasCaptain: year == 2024,
            honors: result == .champion ? [.champion, .pointsChampion] : []
        )
    }

    private func passportFormat(
        _ format: MobilePassportFormat,
        label: String,
        record: MobilePassportRecord
    ) -> MobilePassportFormatPerformance {
        let team = MobilePassportTeam(teamId: "team-preview", name: "Preview Team", side: 1)
        return MobilePassportFormatPerformance(
            format: format,
            label: label,
            scoringLabel: "Gross",
            record: record,
            winPercentage: 62.5,
            scoringAverage: 4.25,
            scoringSample: 8,
            firstYear: 2019,
            latestYear: 2026,
            matches: [
                MobilePassportFormatMatch(
                    matchId: "match-\(format.rawValue.lowercased())",
                    year: 2026,
                    roundNumber: 1,
                    matchNumber: 1,
                    outcome: .win,
                    partner: [],
                    opponents: [MobilePassportPlayerReference(playerId: "opponent", displayName: "Opponent")],
                    team: team,
                    opposingTeam: MobilePassportTeam(teamId: "team-opponent", name: "Opponent Team", side: 2),
                    winner: "Preview Team",
                    winnerSide: 1,
                    course: nil,
                    segments: [MobilePassportMatchSegment(label: "Overall", winner: "Preview Team", winnerSide: 1)]
                ),
            ]
        )
    }
}
