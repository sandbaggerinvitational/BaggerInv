#if DEBUG
import Foundation

extension MoreUITestFixtures {
    static func passportState(for scenario: TodayUITestScenario) -> MobileReadState<MobilePassportData> {
        switch scenario {
        case .morePassportEmpty:
            readState(passportNewPlayerData, revision: "fixture-passport-new-player-v1")
        case .moreLongContent:
            readState(passportLongContentData, revision: "fixture-passport-long-content-v1")
        default:
            readState(
                passportData,
                revision: "fixture-passport-v1",
                offline: scenario == .moreCachedOffline
            )
        }
    }

    static func guideState(for scenario: TodayUITestScenario) -> MobileReadState<MobileGuideData> {
        switch scenario {
        case .moreGuideUnpublished:
            readState(guideUnpublishedData, revision: "fixture-guide-unpublished-v1")
        case .moreLongContent:
            readState(guideLongContentData, revision: "fixture-guide-long-content-v1")
        default:
            readState(
                guideData,
                revision: "fixture-guide-v1",
                offline: scenario == .moreCachedOffline
            )
        }
    }

    static func historyState(for scenario: TodayUITestScenario) -> MobileReadState<MobileHistoryArchiveData> {
        let tournaments = scenario == .moreHistoryCurrent
            ? [historyCurrentTournament, priorHistoryTournament]
            : [historyTournament, priorHistoryTournament]
        return readState(
            MobileHistoryArchiveData(tournaments: tournaments),
            revision: scenario == .moreHistoryCurrent
                ? "fixture-history-current-v1"
                : "fixture-history-v1"
        )
    }

    static func historyDetailStates(
        for scenario: TodayUITestScenario
    ) -> [Int: MobileReadState<MobileHistoryDetailData>] {
        let detail = scenario == .moreHistoryCurrent ? historyCurrentDetailData : historyDetailData
        return [2026: readState(detail, revision: "fixture-history-2026-v1")]
    }

    static func recordsState(for scenario: TodayUITestScenario) -> MobileReadState<MobileRecordsData> {
        readState(
            scenario == .moreRecordsTied ? recordsTiedData : recordsData,
            revision: scenario == .moreRecordsTied
                ? "fixture-records-tied-v1"
                : "fixture-records-v1"
        )
    }

    static func oddsState(for scenario: TodayUITestScenario) -> MobileReadState<MobileOddsData> {
        readState(
            scenario == .moreOddsUnpublished ? oddsUnpublishedData : oddsData,
            revision: scenario == .moreOddsUnpublished
                ? "fixture-odds-unpublished-v1"
                : "fixture-odds-v1"
        )
    }

    private static func readState<Value: Equatable & Sendable>(
        _ value: Value,
        revision: String,
        offline: Bool = false
    ) -> MobileReadState<Value> {
        MobileReadState(
            value: value,
            source: offline ? .diskCache : .network,
            freshness: offline ? .offline : .fresh,
            isRefreshing: false,
            revision: revision,
            generatedAt: try! MobileTimestamp("2026-09-24T15:00:00.000Z"),
            fetchedAt: Date(timeIntervalSince1970: 1_800_000_000),
            validatedAt: Date(timeIntervalSince1970: 1_800_000_000),
            lastSafeError: offline ? .transport : nil,
            lastServerCode: nil,
            lastHTTPStatus: nil,
            cachePersistenceIssue: false
        )
    }

    private static let guideData = MobileGuideData(
        contractVersion: "guide-v1",
        tournamentId: "fixture-tournament",
        publicationState: .published,
        publishedAt: try! MobileTimestamp("2026-09-01T12:00:00.000Z"),
        tournament: MobileGuideTournament(
            tournamentId: "fixture-tournament",
            year: 2026,
            name: "Bagger Fixture Invitational",
            editionTitle: "Kiawah Island",
            dates: "September 24–27, 2026",
            location: "Kiawah Island, South Carolina",
            timeZone: "America/New_York",
            logoAssetKey: nil,
            heroAssetKey: nil,
            mobileHeroAssetKey: nil
        ),
        overview: [
            MobileGuideOverviewSection(
                sectionId: "welcome",
                slug: "welcome",
                title: "Welcome to Tournament Week",
                body: "Four days of golf, team competition, and Bagger traditions on Kiawah Island.",
                sortOrder: 0
            ),
        ],
        rules: MobileGuideRules(
            roundFormats: [
                MobileGuideRoundFormat(
                    roundNumber: 1,
                    format: .bestBall,
                    name: "Opening Best Ball",
                    teamSize: 2,
                    pointsAvailable: 3,
                    frontNineUsed: true,
                    frontNinePoints: 1,
                    backNineUsed: true,
                    backNinePoints: 1,
                    overallUsed: true,
                    overallPoints: 1,
                    description: "Each player plays their own ball; the lower net score represents the side.",
                    rules: "Match-play concessions and the canonical posted result are final.",
                    handicapAllocation: "Current tournament handicaps",
                    handicap: "Full allocation",
                    handicapRules: "Strokes fall by hole stroke index.",
                    playingHandicap: "Tournament handicap",
                    scoringFormat: "Net match play",
                    scoring: "Front, back, and overall points",
                    matchFormat: "Two-player sides"
                ),
            ],
            items: [
                MobileGuideRuleItem(
                    ruleId: "pace-of-play",
                    category: "Tournament",
                    subcategory: "Pace of Play",
                    title: "Keep Pace With the Group Ahead",
                    body: "Play ready golf whenever it is safe and appropriate.",
                    sortOrder: 0,
                    effectiveYear: 2026,
                    important: true
                ),
            ]
        ),
        courses: [
            MobileGuideCourse(
                courseId: "ocean-course",
                name: "The Ocean Course",
                city: "Kiawah Island",
                state: "SC",
                location: "1000 Ocean Course Drive",
                yearOpened: 1991,
                designer: "Pete Dye",
                website: "https://www.kiawahresort.com/golf/the-ocean-course/",
                directionsUrl: "https://maps.apple.com/?q=The%20Ocean%20Course",
                logoAssetKey: nil,
                profileAssetKey: nil,
                overview: "A seaside championship course shaped by wind, angles, and exposed greens.",
                playingTips: "Choose conservative targets and account for the prevailing wind.",
                signatureHoles: "The closing stretch runs beside the Atlantic Ocean.",
                history: "Host of major championship golf.",
                assignments: [guideAssignment]
            ),
        ],
        dining: [
            MobileGuideDining(
                diningId: "welcome-dinner",
                year: 2026,
                day: "Thursday",
                meal: "Welcome Dinner",
                cuisine: "Lowcountry",
                startTime: "6:30 PM",
                endTime: "9:00 PM",
                location: "Atlantic Room",
                dressCode: "Resort casual",
                reservationRequired: false,
                notes: "Team announcements begin at 7:15 PM.",
                sortOrder: 0
            ),
        ],
        localGuide: [
            MobileGuideLocalEntry(
                entryId: "island-shuttle",
                year: 2026,
                category: "Transportation",
                title: "Island Shuttle",
                description: "Tournament transportation between the resort and courses.",
                address: "Kiawah Island, SC",
                phone: "+18435551212",
                website: "https://example.com/island-shuttle",
                sortOrder: 0
            ),
        ],
        contacts: [
            MobileGuideContact(
                contactId: "tournament-director",
                year: 2026,
                category: "Tournament Operations",
                name: "Morgan Taylor",
                role: "Tournament Director",
                phone: "+18435550126",
                textEnabled: true,
                email: "director@example.com",
                website: "https://example.com/tournament-help",
                sortOrder: 0
            ),
        ]
    )

    private static let guideUnpublishedData = MobileGuideData(
        contractVersion: "guide-v1",
        tournamentId: "fixture-tournament",
        publicationState: .unpublished,
        publishedAt: nil,
        tournament: nil,
        overview: [],
        rules: MobileGuideRules(roundFormats: [], items: []),
        courses: [],
        dining: [],
        localGuide: [],
        contacts: []
    )

    private static let guideLongContentData: MobileGuideData = {
        let canonical = guideData
        return MobileGuideData(
            contractVersion: canonical.contractVersion,
            tournamentId: canonical.tournamentId,
            publicationState: canonical.publicationState,
            publishedAt: canonical.publishedAt,
            tournament: MobileGuideTournament(
                tournamentId: "fixture-tournament",
                year: 2026,
                name: "The Bagger Invitational Championship Week With An Intentionally Long Tournament Name",
                editionTitle: "Kiawah Island Atlantic Coast Championship Edition",
                dates: "Thursday, September 24 through Sunday, September 27, 2026",
                location: "Kiawah Island, South Carolina — Oceanfront Tournament Campus",
                timeZone: "America/New_York",
                logoAssetKey: nil,
                heroAssetKey: nil,
                mobileHeroAssetKey: nil
            ),
            overview: [
                MobileGuideOverviewSection(
                    sectionId: "welcome-long",
                    slug: "welcome-long",
                    title: "Welcome to a Full Championship Week of Competition and Bagger Traditions",
                    body: "This deliberately long fixture verifies that canonical editorial copy wraps cleanly without being truncated at larger accessibility text sizes.",
                    sortOrder: 0
                ),
            ],
            rules: canonical.rules,
            courses: canonical.courses,
            dining: canonical.dining,
            localGuide: canonical.localGuide,
            contacts: canonical.contacts
        )
    }()

    private static let guideAssignment = MobileGuideCourseAssignment(
        assignmentId: "ocean-round-one",
        roundNumber: 1,
        format: .bestBall,
        tee: "Bagger Gold",
        rating: 72.4,
        slope: 138,
        par: 72,
        yardage: 6_720,
        holes: (1...18).map { number in
            MobileGuideHole(
                holeNumber: number,
                par: [4, 5, 3, 4][(number - 1) % 4],
                yardage: 145 + number * 14,
                strokeIndex: number
            )
        }
    )

    private static let historyTeamOne = MobileHistoryTeamResult(
        teamId: "fixture-team-green",
        name: "Pines",
        side: 1,
        points: 9
    )
    private static let historyTeamTwo = MobileHistoryTeamResult(
        teamId: "fixture-team-gold",
        name: "Dunes",
        side: 2,
        points: 7
    )
    private static let historyTournament = MobileHistoryTournamentSummary(
        tournamentId: "fixture-tournament",
        year: 2026,
        name: "Bagger Fixture Invitational",
        editionTitle: "Kiawah Island",
        destination: "Kiawah Island, SC",
        startDate: try! MobileCalendarDate("2026-09-24"),
        endDate: try! MobileCalendarDate("2026-09-27"),
        status: .final,
        teams: [historyTeamOne, historyTeamTwo],
        champion: historyTeamOne,
        runnerUp: historyTeamTwo,
        finalScore: MobileHistoryFinalScore(teamOnePoints: 9, teamTwoPoints: 7, label: "Pines 9 – Dunes 7"),
        detailAvailable: true,
        revision: "fixture-history-2026"
    )
    private static let priorHistoryTournament = MobileHistoryTournamentSummary(
        tournamentId: "fixture-tournament-2025",
        year: 2025,
        name: "Bagger Invitational",
        editionTitle: "Pinehurst",
        destination: "Pinehurst, NC",
        startDate: try! MobileCalendarDate("2025-09-25"),
        endDate: try! MobileCalendarDate("2025-09-28"),
        status: .final,
        teams: [historyTeamTwo, historyTeamOne],
        champion: historyTeamTwo,
        runnerUp: historyTeamOne,
        finalScore: MobileHistoryFinalScore(teamOnePoints: 7, teamTwoPoints: 9, label: "Dunes 9 – Pines 7"),
        detailAvailable: false,
        revision: "fixture-history-2025"
    )

    private static let historyCurrentTournament = MobileHistoryTournamentSummary(
        tournamentId: "fixture-tournament",
        year: 2026,
        name: "Bagger Fixture Invitational",
        editionTitle: "Kiawah Island",
        destination: "Kiawah Island, SC",
        startDate: try! MobileCalendarDate("2026-09-24"),
        endDate: try! MobileCalendarDate("2026-09-27"),
        status: .inProgress,
        teams: [
            MobileHistoryTeamResult(teamId: "fixture-team-green", name: "Pines", side: 1, points: 7.5),
            MobileHistoryTeamResult(teamId: "fixture-team-gold", name: "Dunes", side: 2, points: 6.5),
        ],
        champion: nil,
        runnerUp: nil,
        finalScore: nil,
        detailAvailable: true,
        revision: "fixture-history-2026-current"
    )

    private static let historyDetailData = MobileHistoryDetailData(
        tournament: historyTournament,
        teams: historyTeams,
        rounds: historyRounds,
        matches: historyMatches,
        standings: historyStandings,
        awards: historyAwards,
        scorecards: historyScorecards
    )

    private static let historyCurrentDetailData = MobileHistoryDetailData(
        tournament: historyCurrentTournament,
        teams: historyTeams,
        rounds: historyRounds,
        matches: historyMatches,
        standings: historyStandings,
        awards: historyAwards,
        scorecards: historyScorecards
    )

    private static let historyTeams: [MobileHistoryTeam] = [
        MobileHistoryTeam(
            teamId: "fixture-team-green",
            name: "Pines",
            side: 1,
            points: 9,
            captain: MobileHistoryPlayerReference(playerId: "fixture-player-a", displayName: "Alex Morgan"),
            averageHandicap: 8.4,
            roster: [
                MobileHistoryRosterPlayer(playerId: "fixture-player-a", displayName: "Alex Morgan", handicap: 8.4, isCaptain: true),
                MobileHistoryRosterPlayer(playerId: "fixture-player-b", displayName: "Jordan Lee", handicap: 10.2, isCaptain: false),
            ]
        ),
        MobileHistoryTeam(
            teamId: "fixture-team-gold",
            name: "Dunes",
            side: 2,
            points: 7,
            captain: MobileHistoryPlayerReference(playerId: "fixture-player-c", displayName: "Taylor Kim"),
            averageHandicap: 9.1,
            roster: [
                MobileHistoryRosterPlayer(playerId: "fixture-player-c", displayName: "Taylor Kim", handicap: 9.1, isCaptain: true),
                MobileHistoryRosterPlayer(playerId: "fixture-player-d", displayName: "Cameron Diaz", handicap: 11.3, isCaptain: false),
            ]
        ),
    ]

    private static let historyRounds: [MobileHistoryRound] = [
        MobileHistoryRound(
            roundNumber: 1,
            name: "Opening Best Ball",
            status: .final,
            format: "BB",
            course: historyCourse,
            teamStandings: [historyTeamOne, historyTeamTwo],
            matchIds: ["fixture-history-match"]
        ),
    ]

    private static let historyMatches: [MobileHistoryMatch] = [
        MobileHistoryMatch(
            matchId: "fixture-history-match",
            matchNumber: 1,
            status: .final,
            format: "BB",
            course: historyCourse,
            sides: [
                MobileHistorySide(side: 1, participants: [MobileHistoryPlayerReference(playerId: "fixture-player-a", displayName: "Alex Morgan")]),
                MobileHistorySide(side: 2, participants: [MobileHistoryPlayerReference(playerId: "fixture-player-c", displayName: "Taylor Kim")]),
            ],
            result: MobileHistoryResult(summary: "Pines won 2 & 1", winner: "Pines", teamOnePoints: 1, teamTwoPoints: 0),
            scorecardIds: ["fixture-scorecard"]
        ),
    ]

    private static let historyStandings: [MobileHistoryStanding] = [
        MobileHistoryStanding(rank: 1, playerId: "fixture-player-a", displayName: "Alex Morgan", teamName: "Pines", points: 4.5, wins: 4, losses: 1, ties: 1),
        MobileHistoryStanding(rank: 2, playerId: "fixture-player-c", displayName: "Taylor Kim", teamName: "Dunes", points: 3.5, wins: 3, losses: 2, ties: 1),
    ]

    private static let historyAwards: [MobileHistoryAward] = [
        MobileHistoryAward(awardId: "points-champion", title: "Points Champion", recipient: "Alex Morgan", playerId: "fixture-player-a"),
    ]

    private static let historyScorecards: [MobileHistoryScorecard] = [
        MobileHistoryScorecard(
            scorecardId: "fixture-scorecard",
            matchId: "fixture-history-match",
            entityType: .individual,
            playerId: "fixture-player-a",
            teamId: "fixture-team-green",
            participantPlayerIds: ["fixture-player-a"],
            status: "FINAL",
            grossTotal: 78,
            netTotal: 70,
            holes: historyHoles
        ),
    ]

    private static let historyHoles: [MobileHistoryHole] = (1...18).map { number in
        let grossAndPar = [4, 5, 3, 4][(number - 1) % 4]
        return MobileHistoryHole(
            holeNumber: number,
            grossScore: grossAndPar,
            par: grossAndPar,
            strokeIndex: number,
            strokesReceived: number <= 8 ? 1 : 0,
            netScore: number <= 8 ? grossAndPar - 1 : grossAndPar
        )
    }

    private static let historyCourse = MobileHistoryCourse(
        courseId: "ocean-course",
        name: "The Ocean Course",
        location: "Kiawah Island, SC",
        tee: "Bagger Gold",
        par: 72,
        yardage: 6_720
    )

    private static let recordsData = MobileRecordsData(
        coverage: MobileRecordsCoverage(
            firstCompleteMatchYear: 2017,
            scorecardHistoryComplete: true,
            note: "Official Bagger record book; complete match history begins in 2017."
        ),
        categories: [
            MobileRecordCategory(
                categoryId: .individual,
                title: "Individual Records",
                order: 1,
                records: [
                    MobileRecord(
                        recordId: "career-wins",
                        title: "Most Career Match Wins",
                        source: .official,
                        direction: .highest,
                        unit: "wins",
                        decimals: 0,
                        signed: false,
                        aggregate: true,
                        eligibilityNote: "Official completed matches only.",
                        value: .number(12),
                        valueDisplay: "12 wins",
                        tied: false,
                        holders: [
                            MobileRecordHolder(
                                entityType: .player,
                                playerIds: ["fixture-player-a"],
                                displayName: "Alex Morgan",
                                participantNames: ["Alex Morgan"],
                                teamId: "fixture-team-green",
                                teamName: "Pines",
                                courseId: nil,
                                courseName: nil,
                                holeNumber: nil,
                                matchId: nil,
                                year: 2026,
                                roundNumber: nil,
                                format: nil,
                                value: .number(12),
                                valueDisplay: "12 wins",
                                secondaryValue: nil
                            ),
                        ]
                    ),
                    MobileRecord(
                        recordId: "low-round-even",
                        title: "Lowest Tournament Round",
                        source: .scorecard,
                        direction: .lowest,
                        unit: "strokes",
                        decimals: 0,
                        signed: false,
                        aggregate: false,
                        eligibilityNote: "Completed canonical scorecards only.",
                        value: .number(70),
                        valueDisplay: "70 strokes",
                        tied: false,
                        holders: [
                            MobileRecordHolder(
                                entityType: .player,
                                playerIds: ["fixture-player-a"],
                                displayName: "Alex Morgan",
                                participantNames: ["Alex Morgan"],
                                teamId: "fixture-team-green",
                                teamName: "Pines",
                                courseId: "ocean-course",
                                courseName: "The Ocean Course",
                                holeNumber: nil,
                                matchId: "fixture-history-match",
                                year: 2026,
                                roundNumber: 1,
                                format: "BB",
                                value: .number(70),
                                valueDisplay: "70 strokes",
                                secondaryValue: 0
                            ),
                        ]
                    ),
                ]
            ),
        ]
    )

    private static let recordsTiedData: MobileRecordsData = {
        let canonical = recordsData
        let record = canonical.categories[0].records[0]
        let secondHolder = MobileRecordHolder(
            entityType: .player,
            playerIds: ["fixture-player-c"],
            displayName: "Taylor Kim",
            participantNames: ["Taylor Kim"],
            teamId: "fixture-team-gold",
            teamName: "Dunes",
            courseId: nil,
            courseName: nil,
            holeNumber: nil,
            matchId: nil,
            year: 2026,
            roundNumber: nil,
            format: nil,
            value: .number(12),
            valueDisplay: "12 wins",
            secondaryValue: nil
        )
        let tiedRecord = MobileRecord(
            recordId: record.recordId,
            title: record.title,
            source: record.source,
            direction: record.direction,
            unit: record.unit,
            decimals: record.decimals,
            signed: record.signed,
            aggregate: record.aggregate,
            eligibilityNote: record.eligibilityNote,
            value: record.value,
            valueDisplay: record.valueDisplay,
            tied: true,
            holders: record.holders + [secondHolder]
        )
        return MobileRecordsData(
            coverage: canonical.coverage,
            categories: [
                MobileRecordCategory(
                    categoryId: .individual,
                    title: canonical.categories[0].title,
                    order: canonical.categories[0].order,
                    records: [tiedRecord] + Array(canonical.categories[0].records.dropFirst())
                ),
            ]
        )
    }()

    private static let oddsData = MobileOddsData(
        publication: MobileOddsPublication(
            state: .published,
            revision: 3,
            publishedAt: try! MobileTimestamp("2026-09-24T12:00:00.000Z"),
            currentPhase: .afterRoundOne
        ),
        snapshots: [
            MobileOddsSnapshot(
                phase: .afterRoundOne,
                phaseOrder: 1,
                label: "After Round 1",
                isCurrent: true,
                publishedAt: try! MobileTimestamp("2026-09-24T12:00:00.000Z"),
                iterations: 100_000,
                totalPointsAvailable: 16,
                teams: [
                    MobileOddsTeam(side: 1, teamId: "fixture-team-green", name: "Pines", probability: 62, americanOdds: "-163", expectedPoints: 8.8),
                    MobileOddsTeam(side: 2, teamId: "fixture-team-gold", name: "Dunes", probability: 38, americanOdds: "+163", expectedPoints: 7.2),
                ],
                players: [
                    MobileOddsPlayer(rank: 1, playerId: "fixture-player-a", displayName: "Alex Morgan", teamSide: 1, probability: 28, americanOdds: "+257", expectedPoints: 4.6, expectedRecord: "4-1-1", averageFinish: 1.8),
                    MobileOddsPlayer(rank: 2, playerId: "fixture-player-c", displayName: "Taylor Kim", teamSide: 2, probability: 21, americanOdds: "+376", expectedPoints: 3.9, expectedRecord: "3-2-1", averageFinish: 2.4),
                ]
            ),
        ]
    )

    private static let oddsUnpublishedData = MobileOddsData(
        publication: MobileOddsPublication(
            state: .unpublished,
            revision: 0,
            publishedAt: nil,
            currentPhase: nil
        ),
        snapshots: []
    )
}
#endif
