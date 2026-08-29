#if DEBUG
import SwiftUI

enum TodayUITestScenario: String {
    case signedOut = "auth.signed-out"
    case standard = "today.standard"
    case live = "today.live"
    case final = "today.final"
    case noCurrentMatch = "today.no-current-match"
    case cachedOffline = "today.cached-offline"
    case emptyOffline = "today.empty-offline"
    case longContent = "today.long-content"
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
        default:
            BaggerAppShell(
                participant: TodayUITestFixtures.participant,
                fixturePresentation: TodayUITestFixtures.presentation(for: scenario)
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
        case .standard, .cachedOffline, .longContent:
            current = .init(
                availability: .content,
                value: match(status: "Upcoming", longContent: scenario == .longContent),
                freshness: scenario == .cachedOffline ? .offline : .current
            )
        case .emptyOffline:
            fatalError("Handled above")
        }

        let personalCurrent = current.value ?? match(status: "Upcoming", longContent: scenario == .longContent)
        let personal = [
            TodayPersonalMatchPresentation(match: completedMatch, isCurrent: false),
            TodayPersonalMatchPresentation(match: personalCurrent, isCurrent: scenario != .noCurrentMatch),
            TodayPersonalMatchPresentation(match: laterMatch, isCurrent: false),
        ]

        return TodayPresentation(
            participant: participantPresentation,
            tournament: .init(availability: .content, value: tournament(longContent: scenario == .longContent), freshness: freshness(scenario)),
            currentMatch: current,
            personalMatches: .init(availability: .content, value: personal, freshness: freshness(scenario)),
            tournamentScore: .init(availability: .content, value: score, freshness: freshness(scenario)),
            schedule: .init(availability: .content, value: schedule, freshness: freshness(scenario)),
            freshnessBanner: scenario == .cachedOffline
                ? TodayFreshnessBanner(kind: .offline, lastValidated: Date(timeIntervalSince1970: 1_800_000_000))
                : nil
        )
    }

    private static var emptyOffline: TodayPresentation {
        TodayPresentation(
            participant: participantPresentation,
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

    private static var participantPresentation: TodayParticipantPresentation {
        TodayParticipantPresentation(
            playerID: participant.player.playerId,
            displayName: participant.player.displayName,
            teamID: participant.player.team?.teamId,
            teamName: participant.player.team?.name,
            tournamentID: participant.tournament.tournamentId
        )
    }

    private static func tournament(longContent: Bool) -> TodayTournamentPresentation {
        TodayTournamentPresentation(
            name: longContent
                ? "The Exceptionally Long Bagger Invitational Tournament Name"
                : "Bagger Invitational",
            year: 2026,
            statusText: "Live",
            roundText: "Round 2",
            timeZoneIdentifier: "America/Chicago",
            isSessionFallback: false
        )
    }

    private static func match(status: String, longContent: Bool = false) -> TodayMatchPresentation {
        let progress = status == "Live" ? "Hole 7" : nil
        let result = status == "Final" ? "Won 2 & 1" : nil
        return TodayMatchPresentation(
            matchID: "fixture-match-current",
            eyebrow: status == "Upcoming" ? "YOUR NEXT MATCH" : "YOUR MATCH",
            statusText: status,
            roundText: "Round 2",
            format: "Four-Ball",
            ownSide: TodayMatchSidePresentation(
                side: 1,
                name: "Pines",
                participants: [
                    .init(playerID: "fixture-player-a", displayName: "Alex Morgan", isAuthenticatedPlayer: true),
                    .init(
                        playerID: "fixture-player-b",
                        displayName: longContent ? "Christopher Montgomery-Wellington" : "Jordan Lee",
                        isAuthenticatedPlayer: false
                    ),
                ]
            ),
            opponentSide: TodayMatchSidePresentation(
                side: 2,
                name: "Dunes",
                participants: [
                    .init(playerID: "fixture-player-c", displayName: "Taylor Kim", isAuthenticatedPlayer: false),
                    .init(playerID: "fixture-player-d", displayName: "Cameron Diaz", isAuthenticatedPlayer: false),
                ]
            ),
            courseName: longContent ? "The Ocean Course at Kiawah Island Resort" : "Ocean Course",
            tee: "Tournament Tees",
            teeTimeLabel: "8:10 AM",
            progressText: progress,
            resultText: result
        )
    }

    private static var completedMatch: TodayMatchPresentation {
        TodayMatchPresentation(
            matchID: "fixture-match-one",
            eyebrow: "YOUR MATCH",
            statusText: "Final",
            roundText: "Round 1",
            format: "Foursomes",
            ownSide: nil,
            opponentSide: TodayMatchSidePresentation(
                side: 2,
                name: "Dunes",
                participants: [.init(playerID: "fixture-player-e", displayName: "Riley Chen", isAuthenticatedPlayer: false)]
            ),
            courseName: "Turtle Point",
            tee: nil,
            teeTimeLabel: nil,
            progressText: nil,
            resultText: "Won 2 & 1"
        )
    }

    private static var laterMatch: TodayMatchPresentation {
        TodayMatchPresentation(
            matchID: "fixture-match-three",
            eyebrow: "YOUR NEXT MATCH",
            statusText: "Upcoming",
            roundText: "Round 3",
            format: "Singles",
            ownSide: nil,
            opponentSide: TodayMatchSidePresentation(
                side: 2,
                name: "Dunes",
                participants: [.init(playerID: "fixture-player-f", displayName: "Sam Rivera", isAuthenticatedPlayer: false)]
            ),
            courseName: "Cougar Point",
            tee: nil,
            teeTimeLabel: "2:10 PM",
            progressText: nil,
            resultText: nil
        )
    }

    private static var score: TodayTournamentScorePresentation {
        TodayTournamentScorePresentation(
            teams: [
                .init(
                    teamID: "fixture-team-green",
                    name: "Pines",
                    rank: 1,
                    points: 8.5,
                    pointsText: "8½",
                    record: "6-2-1",
                    remainingMatches: 5,
                    isSoleLeader: true,
                    isTiedForLead: false
                ),
                .init(
                    teamID: "fixture-team-gold",
                    name: "Dunes",
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

    private static var schedule: TodaySchedulePresentation {
        TodaySchedulePresentation(
            title: "Today’s Schedule",
            source: .fullScheduleToday,
            events: [
                .init(eventID: "breakfast", title: "Breakfast", subtitle: nil, location: "Clubhouse", type: "meal", startTimeText: "7:00 AM", endTimeText: "8:00 AM", isNow: false, isCompleted: true),
                .init(eventID: "round-two", title: "Round 2", subtitle: "Four-Ball", location: "Ocean Course", type: "golf", startTimeText: "8:10 AM", endTimeText: nil, isNow: true, isCompleted: false),
                .init(eventID: "dinner", title: "Team Dinner", subtitle: "Jacket optional", location: "Atlantic Room", type: "dinner", startTimeText: "7:00 PM", endTimeText: nil, isNow: false, isCompleted: false),
            ]
        )
    }

    private static func freshness(_ scenario: TodayUITestScenario) -> TodayPresentedFreshness {
        scenario == .cachedOffline ? .offline : .current
    }
}
#endif
