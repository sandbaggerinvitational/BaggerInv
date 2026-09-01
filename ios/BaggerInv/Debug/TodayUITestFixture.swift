#if DEBUG
import SwiftUI

enum TodayUITestScenario: String {
    case signedOut = "auth.signed-out"
    case standard = "today.standard"
    case live = "today.live"
    case final = "today.final"
    case noCurrentMatch = "today.no-current-match"
    case cachedOffline = "today.cached-offline"
    case stale = "today.stale"
    case emptyOffline = "today.empty-offline"
    case longContent = "today.long-content"
    case canonicalAssets = "today.canonical-assets"
    case matchesStandard = "matches.standard"
    case matchesNoUserMatch = "matches.no-user-match"
    case matchesCachedOffline = "matches.cached-offline"
    case matchesEmptyOffline = "matches.empty-offline"
    case matchesLongContent = "matches.long-content"
    case scoreNoMatch = "score.no-match"
    case scoreUpcomingBestBall = "score.upcoming-bb"
    case scoreActiveBestBall = "score.active-bb"
    case scoreActiveScramble = "score.active-sc"
    case scoreActiveSingles = "score.active-si"
    case scoreReadOnly = "score.read-only"
    case scoreCompleted = "score.completed"
    case scoreUnknownFormat = "score.unknown-format"
    case scoreMixedHoles = "score.mixed-holes"
    case scoreLongContent = "score.long-content"
    case scoreOffline = "score.offline"
    case scoreDurableOffline = "score.durable-offline"
    case scoreSignOutWarning = "score.signout-warning"
    case scoreConflictReview = "score.conflict-review"
    case scoreCorrectionPending = "score.correction-pending"
    case scoreFinalizationReady = "score.finalization-ready"
    case scoreFinalizationUnknown = "score.finalization-unknown"
    case moreStandard = "more.standard"
    case moreSignOutWarning = "more.signout-warning"
    case morePassportEmpty = "more.passport-empty"
    case moreGuideUnpublished = "more.guide-unpublished"
    case moreOddsUnpublished = "more.odds-unpublished"
    case moreHistoryCurrent = "more.history-current"
    case moreRecordsTied = "more.records-tied"
    case moreLongContent = "more.long-content"
    case moreCachedOffline = "more.cached-offline"
    case scheduleStandard = "schedule.standard"
    case scheduleCachedOffline = "schedule.cached-offline"
    case scheduleEmpty = "schedule.empty"
}

enum TodayUITestLaunch {
    case disabled
    case scenario(TodayUITestScenario)
    case invalid

    static func resolve(arguments: [String] = ProcessInfo.processInfo.arguments) -> Self {
        guard arguments.contains("--bagger-ui-testing") else { return .disabled }
        guard let flagIndex = arguments.firstIndex(of: "--bagger-ui-test-scenario"),
              arguments.indices.contains(flagIndex + 1),
              let scenario = TodayUITestScenario(rawValue: arguments[flagIndex + 1])
        else {
            return .invalid
        }
        return .scenario(scenario)
    }
}

struct TodayUITestFixtureRoot: View {
    let scenario: TodayUITestScenario

    @ViewBuilder
    var body: some View {
        switch scenario {
        case .signedOut:
            VStack(spacing: 0) {
                HStack {
                    Spacer()
                    PreviewBadge()
                }
                .padding(.horizontal)
                .padding(.top, 8)

                SignInView(onSendCode: { _ in })
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            .background(Color(uiColor: .systemBackground))
            .accessibilityIdentifier("auth.signed-out.fixture")
        case .scoreSignOutWarning, .moreSignOutWarning:
            ScoringQueueSignOutUITestFixtureRoot(
                participant: TodayUITestFixtures.participant,
                presentation: TodayUITestFixtures.presentation(for: scenario),
                matchesState: MatchesUITestFixtures.state(for: scenario),
                scoringState: ScoringUITestFixtures.state(for: scenario),
                startsOnMore: scenario == .moreSignOutWarning
            )
        default:
            let arguments = ProcessInfo.processInfo.arguments
            let participant = TodayUITestFixtures.participant(for: scenario)
            BaggerAppShell(
                participant: participant,
                fixturePresentation: TodayUITestFixtures.presentation(for: scenario),
                fixtureMatchesState: MatchesUITestFixtures.state(for: scenario),
                fixtureScoringState: ScoringUITestFixtures.state(for: scenario),
                fixtureLeaders: LeadersUITestFixtures.bundle(
                    participant: participant,
                    arguments: arguments
                ),
                fixtureScheduleState: MoreUITestFixtures.scheduleState(for: scenario),
                fixturePassportState: MoreUITestFixtures.passportState(for: scenario),
                fixtureGuideState: MoreUITestFixtures.guideState(for: scenario),
                fixtureHistoryState: MoreUITestFixtures.historyState(for: scenario),
                fixtureHistoryDetailStates: MoreUITestFixtures.historyDetailStates(for: scenario),
                fixtureRecordsState: MoreUITestFixtures.recordsState(for: scenario),
                fixtureOddsState: MoreUITestFixtures.oddsState(for: scenario),
                fixtureScheduleNow: MoreUITestFixtures.now,
                fixtureUsesDurableScoringQueue: scenario == .scoreDurableOffline,
                startsOnScore: scenario.rawValue.hasPrefix("score."),
                startsOnLeaders: arguments.contains("--bagger-start-leaders"),
                startsOnMore: scenario.rawValue.hasPrefix("more."),
                startsOnSchedule: scenario.rawValue.hasPrefix("schedule.")
            )
        }
    }
}

struct InvalidTodayUITestFixtureRoot: View {
    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: "xmark.shield.fill")
            Text("Invalid UI test fixture")
                .font(.headline)
            Text("A recognized, explicit fixture scenario is required.")
                .multilineTextAlignment(.center)
        }
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(BaggerPalette.canvas)
        .accessibilityIdentifier("qa.fixture.invalid")
    }
}

private enum TodayUITestFixtures {
    static let participant = ParticipantSession(
        player: ParticipantPlayer(
            playerId: "fixture-player-a",
            displayName: "Alex Morgan",
            team: ParticipantTeam(teamId: "fixture-team-green", name: "Pines")
        ),
        tournament: ParticipantTournament(
            tournamentId: "fixture-tournament",
            name: "Bagger Fixture Invitational",
            year: 2026
        )
    )

    static func participant(for scenario: TodayUITestScenario) -> ParticipantSession {
        switch scenario {
        case .canonicalAssets:
            ParticipantSession(
                player: ParticipantPlayer(
                    playerId: "CB01",
                    displayName: "Clay Beltran",
                    team: ParticipantTeam(teamId: "PICKLES", name: "Pickles")
                ),
                tournament: participant.tournament
            )
        case .longContent:
            ParticipantSession(
                player: ParticipantPlayer(
                    playerId: "UNKNOWN_PLAYER",
                    displayName: "Clayton Alexander Beltran-Montgomery",
                    team: ParticipantTeam(
                        teamId: "UNKNOWN_TEAM_A",
                        name: "The Evergreen Invitational Pickle Society"
                    )
                ),
                tournament: participant.tournament
            )
        default:
            participant
        }
    }

    static func presentation(for scenario: TodayUITestScenario) -> TodayPresentation {
        if scenario == .emptyOffline { return emptyOffline }

        let current: TodaySection<TodayMatchPresentation>
        switch scenario {
        case .signedOut:
            fatalError("Signed-out fixture has no Today presentation")
        case .live:
            current = .init(availability: .content, value: match(status: "Live"), freshness: .current)
        case .final:
            current = .init(availability: .content, value: match(status: "Final"), freshness: .current)
        case .noCurrentMatch:
            current = .init(availability: .empty, value: nil, freshness: .current)
        case .standard, .cachedOffline, .stale, .longContent, .canonicalAssets,
             .matchesStandard, .matchesNoUserMatch, .matchesCachedOffline,
             .matchesEmptyOffline, .matchesLongContent,
             .scoreNoMatch, .scoreUpcomingBestBall, .scoreActiveBestBall,
             .scoreActiveScramble, .scoreActiveSingles, .scoreReadOnly,
             .scoreCompleted, .scoreUnknownFormat, .scoreMixedHoles,
             .scoreLongContent, .scoreOffline, .scoreDurableOffline,
             .scoreSignOutWarning, .scoreConflictReview,
             .scoreCorrectionPending, .scoreFinalizationReady,
             .scoreFinalizationUnknown, .moreStandard,
             .moreSignOutWarning, .morePassportEmpty,
             .moreGuideUnpublished, .moreOddsUnpublished,
             .moreHistoryCurrent, .moreRecordsTied,
             .moreLongContent, .moreCachedOffline, .scheduleStandard,
             .scheduleCachedOffline, .scheduleEmpty:
            current = .init(
                availability: .content,
                value: match(
                    status: "Upcoming",
                    scenario: scenario
                ),
                freshness: freshness(scenario)
            )
        case .emptyOffline:
            fatalError("Handled above")
        }

        let personalCurrent = current.value ?? match(status: "Upcoming", scenario: scenario)
        let personal = [
            TodayPersonalMatchPresentation(match: completedMatch, isCurrent: false),
            TodayPersonalMatchPresentation(match: personalCurrent, isCurrent: scenario != .noCurrentMatch),
            TodayPersonalMatchPresentation(match: laterMatch, isCurrent: false),
        ]

        return TodayPresentation(
            participant: participantPresentation(for: scenario),
            tournament: .init(availability: .content, value: tournament(longContent: scenario == .longContent), freshness: freshness(scenario)),
            currentMatch: current,
            personalMatches: .init(availability: .content, value: personal, freshness: freshness(scenario)),
            tournamentScore: .init(
                availability: .content,
                value: score(for: scenario),
                freshness: freshness(scenario)
            ),
            schedule: .init(
                availability: .content,
                value: schedule(longContent: scenario == .longContent),
                freshness: freshness(scenario)
            ),
            freshnessBanner: freshnessBanner(for: scenario)
        )
    }

    private static var emptyOffline: TodayPresentation {
        TodayPresentation(
            participant: participantPresentation(for: .emptyOffline),
            tournament: .init(
                availability: .unavailable,
                value: TodayTournamentPresentation(
                    name: participant.tournament.name,
                    year: participant.tournament.year,
                    statusText: nil,
                    roundText: nil,
                    timeZoneIdentifier: nil,
                    isSessionFallback: true
                ),
                freshness: nil
            ),
            currentMatch: .init(availability: .unavailable, value: nil, freshness: nil),
            personalMatches: .init(availability: .unavailable, value: nil, freshness: nil),
            tournamentScore: .init(availability: .unavailable, value: nil, freshness: nil),
            schedule: .init(availability: .unavailable, value: nil, freshness: nil),
            freshnessBanner: nil
        )
    }

    private static func participantPresentation(for scenario: TodayUITestScenario) -> TodayParticipantPresentation {
        let session = participant(for: scenario)
        return TodayParticipantPresentation(
            playerID: session.player.playerId,
            displayName: session.player.displayName,
            teamID: session.player.team?.teamId,
            teamName: session.player.team?.name,
            tournamentID: session.tournament.tournamentId
        )
    }

    private static func tournament(longContent: Bool) -> TodayTournamentPresentation {
        TodayTournamentPresentation(
            name: longContent
                ? "The Exceptionally Long Bagger Invitational Tournament Name"
                : "Bagger Invitational",
            year: longContent ? 2030 : 2026,
            statusText: "Live",
            roundText: "Round 2",
            timeZoneIdentifier: "America/Chicago",
            isSessionFallback: false
        )
    }

    private static func match(
        status: String,
        scenario: TodayUITestScenario = .standard
    ) -> TodayMatchPresentation {
        let longContent = scenario == .longContent || scenario == .matchesLongContent
        let canonicalAssets = scenario == .canonicalAssets
        let session = participant(for: scenario)
        let progress = status == "Live" ? "Hole 7" : nil
        let result = status == "Final" ? "Won 2 & 1" : nil
        return TodayMatchPresentation(
            matchID: "fixture-r2-owned",
            eyebrow: status == "Upcoming" ? "YOUR NEXT MATCH" : "YOUR MATCH",
            statusText: status,
            roundText: "Round 2",
            format: "Scramble",
            ownSide: TodayMatchSidePresentation(
                side: 1,
                teamID: session.player.team?.teamId,
                name: session.player.team?.name,
                participants: [
                    .init(
                        playerID: session.player.playerId,
                        displayName: session.player.displayName,
                        isAuthenticatedPlayer: true
                    ),
                    .init(
                        playerID: "fixture-player-b",
                        displayName: longContent ? "Christopher Montgomery-Wellington" : "Jordan Lee",
                        isAuthenticatedPlayer: false
                    ),
                ]
            ),
            opponentSide: TodayMatchSidePresentation(
                side: 2,
                teamID: longContent ? "UNKNOWN_TEAM_B" : canonicalAssets ? "LIPPIT" : "fixture-team-gold",
                name: longContent ? "The Golden Coastal Links and Dunes Club" : canonicalAssets ? "Lippit" : "Dunes",
                participants: [
                    .init(playerID: "fixture-player-c", displayName: "Taylor Kim", isAuthenticatedPlayer: false),
                    .init(playerID: "fixture-player-d", displayName: "Cameron Diaz", isAuthenticatedPlayer: false),
                ]
            ),
            courseID: longContent ? "UNKNOWN_COURSE" : canonicalAssets ? "CPGC01" : "fixture-course-2",
            courseName: longContent ? "The Cougar Point Course at Kiawah Island Golf Resort" : "Cougar Point",
            tee: longContent ? "Championship Tournament Tees" : canonicalAssets ? "Tournament Tees" : "Gold",
            teeTimeLabel: "8:10 AM",
            progressText: progress,
            resultText: result
        )
    }

    private static var completedMatch: TodayMatchPresentation {
        TodayMatchPresentation(
            matchID: "fixture-r1-final",
            eyebrow: "YOUR MATCH",
            statusText: "Final",
            roundText: "Round 1",
            format: "Best Ball",
            ownSide: TodayMatchSidePresentation(
                side: 1,
                teamID: "fixture-team-green",
                name: "Pines",
                participants: [
                    .init(playerID: "fixture-player-a", displayName: "Alex Morgan", isAuthenticatedPlayer: true),
                    .init(playerID: "fixture-player-b", displayName: "Jordan Lee", isAuthenticatedPlayer: false),
                ]
            ),
            opponentSide: TodayMatchSidePresentation(
                side: 2,
                teamID: "fixture-team-gold",
                name: "Dunes",
                participants: [
                    .init(playerID: "fixture-player-c", displayName: "Taylor Kim", isAuthenticatedPlayer: false),
                    .init(playerID: "fixture-player-d", displayName: "Cameron Diaz", isAuthenticatedPlayer: false),
                ]
            ),
            courseID: "fixture-course-1",
            courseName: "Turtle Point",
            tee: "Gold",
            teeTimeLabel: "9:20 AM",
            progressText: nil,
            resultText: "Won 2 & 1"
        )
    }

    private static var laterMatch: TodayMatchPresentation {
        TodayMatchPresentation(
            matchID: "fixture-r3-scheduled",
            eyebrow: "YOUR NEXT MATCH",
            statusText: "Upcoming",
            roundText: "Round 3",
            format: "Singles",
            ownSide: TodayMatchSidePresentation(
                side: 1,
                teamID: "fixture-team-green",
                name: "Pines",
                participants: [
                    .init(playerID: "fixture-player-a", displayName: "Alex Morgan", isAuthenticatedPlayer: true),
                    .init(playerID: "fixture-player-b", displayName: "Jordan Lee", isAuthenticatedPlayer: false),
                ]
            ),
            opponentSide: TodayMatchSidePresentation(
                side: 2,
                teamID: "fixture-team-gold",
                name: "Dunes",
                participants: [
                    .init(playerID: "fixture-player-c", displayName: "Taylor Kim", isAuthenticatedPlayer: false),
                    .init(playerID: "fixture-player-d", displayName: "Cameron Diaz", isAuthenticatedPlayer: false),
                ]
            ),
            courseID: "fixture-course-3",
            courseName: "Ocean Course",
            tee: "Gold",
            teeTimeLabel: "9:20 AM",
            progressText: nil,
            resultText: nil
        )
    }

    private static func score(for scenario: TodayUITestScenario) -> TodayTournamentScorePresentation {
        let longContent = scenario == .longContent
        let canonicalAssets = scenario == .canonicalAssets
        return TodayTournamentScorePresentation(
            teams: [
                .init(
                    teamID: longContent ? "UNKNOWN_TEAM_A" : canonicalAssets ? "PICKLES" : "fixture-team-green",
                    name: longContent ? "The Evergreen Invitational Pickle Society" : canonicalAssets ? "Pickles" : "Pines",
                    rank: 1,
                    points: 8.5,
                    pointsText: "8½",
                    record: "6-2-1",
                    remainingMatches: 5,
                    isSoleLeader: true,
                    isTiedForLead: false
                ),
                .init(
                    teamID: longContent ? "UNKNOWN_TEAM_B" : canonicalAssets ? "LIPPIT" : "fixture-team-gold",
                    name: longContent ? "The Golden Coastal Links and Dunes Club" : canonicalAssets ? "Lippit" : "Dunes",
                    rank: 2,
                    points: 7.5,
                    pointsText: "7½",
                    record: "5-3-1",
                    remainingMatches: 5,
                    isSoleLeader: false,
                    isTiedForLead: false
                ),
            ],
            contextText: "Round 2 · Live"
        )
    }

    private static func schedule(longContent: Bool) -> TodaySchedulePresentation {
        TodaySchedulePresentation(
            title: "Today’s Schedule",
            source: .fullScheduleToday,
            events: [
                .init(eventID: "breakfast", title: "Breakfast", subtitle: nil, location: "Clubhouse", type: "meal", startTimeText: "7:00 AM", endTimeText: "8:00 AM", isNow: false, isCompleted: true),
                .init(
                    eventID: "round-two",
                    title: longContent ? "Round 2 Championship Four-Ball Matches" : "Round 2",
                    subtitle: longContent ? "Four-Ball matches across every championship tournament pairing" : "Four-Ball",
                    location: longContent ? "The Ocean Course at Kiawah Island Golf Resort" : "Ocean Course",
                    type: "golf",
                    startTimeText: "8:10 AM",
                    endTimeText: nil,
                    isNow: true,
                    isCompleted: false
                ),
                .init(
                    eventID: "dinner",
                    title: longContent ? "Bagger Invitational Team Celebration Dinner" : "Team Dinner",
                    subtitle: longContent ? "Jacket optional · tournament guests welcome" : "Jacket optional",
                    location: longContent ? "The Atlantic Ballroom and Ocean Terrace" : "Atlantic Room",
                    type: "dinner",
                    startTimeText: "7:00 PM",
                    endTimeText: nil,
                    isNow: false,
                    isCompleted: false
                ),
            ]
        )
    }

    private static func freshness(_ scenario: TodayUITestScenario) -> TodayPresentedFreshness {
        switch scenario {
        case .cachedOffline: .offline
        case .stale: .stale
        default: .current
        }
    }

    private static func freshnessBanner(for scenario: TodayUITestScenario) -> TodayFreshnessBanner? {
        let kind: TodayFreshnessBannerKind
        switch scenario {
        case .cachedOffline: kind = .offline
        case .stale: kind = .stale
        default: return nil
        }
        return TodayFreshnessBanner(
            kind: kind,
            lastValidated: Date(timeIntervalSince1970: 1_800_000_000)
        )
    }
}
#endif
