#if DEBUG
import Foundation

extension MoreUITestFixtures {
    static let passportData: MobilePassportData = {
        let team = MobilePassportTeam(teamId: "fixture-team-green", name: "Pines", side: 1)
        let careerRecord = passportRecord(wins: 12, losses: 6, halves: 2, points: 13)
        let formatRecord = passportRecord(wins: 4, losses: 2, halves: 1, points: 4.5)

        return MobilePassportData(
            contractVersion: "mobile-passport-v1",
            player: MobilePassportPlayer(
                playerId: "fixture-player-a",
                displayName: "Alex Morgan",
                active: true,
                careerYears: MobilePassportCareerYears(firstYear: 2019, lastYear: 2026, current: true),
                portraitAssetKey: nil,
                team: team
            ),
            currentTournament: MobilePassportCurrentTournament(
                tournamentId: "fixture-tournament",
                name: "Bagger Fixture Invitational",
                year: 2026,
                status: "In Progress",
                currentRound: 2,
                tournamentHandicap: 8.4,
                team: team,
                record: MobilePassportCurrentTournamentRecord(wins: 2, losses: 1, halves: 1, points: 2.5),
                standing: 2,
                teamStanding: 1,
                rounds: [
                    MobilePassportCurrentRound(
                        roundNumber: 2,
                        format: .scramble,
                        status: .inProgress,
                        throughHole: 7,
                        holesPlayed: 7,
                        scoringEntity: .team,
                        gross: 28,
                        net: 25.5,
                        rank: 2,
                        tied: true,
                        points: 1.5
                    ),
                    MobilePassportCurrentRound(
                        roundNumber: 1,
                        format: .bestBall,
                        status: .completed,
                        throughHole: 18,
                        holesPlayed: 18,
                        scoringEntity: .team,
                        gross: 72,
                        net: 68.5,
                        rank: 1,
                        tied: false,
                        points: 1
                    ),
                ]
            ),
            career: MobilePassportCareer(
                summary: MobilePassportCareerSummary(
                    record: careerRecord,
                    winPercentage: 62.5,
                    appearances: 8,
                    championships: 2,
                    runnerUpFinishes: 1,
                    averageHandicap: 9.25
                ),
                honors: MobilePassportHonors(
                    championshipYears: [2024, 2022],
                    sandbaggerOfYearYears: [2020],
                    pointsChampionYears: [2025],
                    boardOfGovernors: true,
                    handicapCommittee: false
                ),
                rankings: [
                    MobilePassportRanking(metric: .birdies, rank: 2),
                    MobilePassportRanking(metric: .careerPoints, rank: 1),
                    MobilePassportRanking(metric: .matchWins, rank: 3),
                    MobilePassportRanking(metric: .winPercentage, rank: 4),
                    MobilePassportRanking(metric: .holeDifferential, rank: 5),
                    MobilePassportRanking(metric: .averageGross, rank: 6),
                ],
                holePerformance: MobilePassportHolePerformance(
                    sample: MobilePassportSample(completeScorecards: 10, scoringHoles: 180, matchPlayHoles: 144),
                    totalHolesPlayed: 180,
                    holesWon: 72,
                    holesLost: 60,
                    holesHalved: 48,
                    holeDifferential: 12,
                    frontNineHolesWon: 38,
                    backNineHolesWon: 34,
                    closingHolesWon: 14,
                    birdies: 20,
                    eagles: 1,
                    pars: 92,
                    bogeys: 50,
                    doubleBogeysOrWorse: 17,
                    averageGrossScore: 4.3,
                    averageNetScore: 3.9,
                    averagePar3Score: 3.25,
                    averagePar4Score: 4.4,
                    averagePar5Score: 5.1,
                    averageFrontNineScore: 40.5,
                    averageBackNineScore: 39.75,
                    birdieRate: 11.1,
                    parRate: 51.1,
                    bogeyRate: 27.8,
                    doubleBogeyOrWorseRate: 9.4
                ),
                matchProgression: MobilePassportMatchProgression(
                    matches: 20,
                    largestLeadHeld: 5,
                    largestComebackCompleted: 3,
                    matchesWonAfterTrailing: 4,
                    largestLeadBlown: 2,
                    mostLeadChangesExperienced: 6,
                    totalLeadChangesExperienced: 28,
                    mostConsecutiveHolesWon: 4,
                    mostConsecutiveHolesLost: 3,
                    mostClosingHolesWon: 3,
                    totalClosingHolesWon: 15,
                    frontNine: MobilePassportSegmentRecord(won: 12, lost: 8, halved: 4),
                    backNine: MobilePassportSegmentRecord(won: 11, lost: 9, halved: 4),
                    closing: MobilePassportSegmentRecord(won: 8, lost: 5, halved: 2)
                ),
                tournamentHistory: [
                    MobilePassportTournamentHistory(
                        tournamentId: "fixture-tournament",
                        year: 2026,
                        team: team,
                        result: .upcoming,
                        record: formatRecord,
                        points: 4.5,
                        averageScore: 4.2,
                        scorecardSample: 3,
                        wasCaptain: false,
                        honors: []
                    ),
                    MobilePassportTournamentHistory(
                        tournamentId: "fixture-tournament-2024",
                        year: 2024,
                        team: team,
                        result: .champion,
                        record: formatRecord,
                        points: 4.5,
                        averageScore: 4.1,
                        scorecardSample: 5,
                        wasCaptain: true,
                        honors: [.champion, .pointsChampion]
                    ),
                ],
                formatPerformance: [
                    passportFormat(.scramble, label: "Scramble", record: formatRecord, team: team),
                    passportFormat(.bestBall, label: "Best Ball", record: formatRecord, team: team),
                    passportFormat(.singles, label: "Singles", record: formatRecord, team: team),
                ],
                recordsHeld: [
                    MobilePassportRecordHeld(recordId: "career-wins", title: "Most Career Match Wins"),
                    MobilePassportRecordHeld(recordId: "closing-holes", title: "Most Closing Holes Won"),
                ],
                captainLegacy: MobilePassportCaptainLegacy(
                    record: formatRecord,
                    championships: 1,
                    seasons: [
                        MobilePassportCaptainSeason(year: 2024, team: team, result: .champion),
                        MobilePassportCaptainSeason(year: 2023, team: team, result: .runnerUp),
                    ]
                ),
                biggestRival: MobilePassportRival(
                    player: MobilePassportPlayerReference(playerId: "fixture-player-c", displayName: "Taylor Kim"),
                    record: passportRecord(wins: 3, losses: 3, halves: 1, points: 3.5)
                ),
                draftHistory: [
                    MobilePassportDraftHistory(year: 2026, pick: 2, teamName: "Pines", finish: nil, draftValueScore: 8.75),
                    MobilePassportDraftHistory(year: 2024, pick: 4, teamName: "Pines", finish: 1, draftValueScore: 7.5),
                ],
                topPartners: [
                    MobilePassportPartner(
                        rank: 1,
                        tied: false,
                        player: MobilePassportPlayerReference(playerId: "fixture-player-b", displayName: "Jordan Lee"),
                        record: passportRecord(wins: 4, losses: 1, halves: 0, points: 4)
                    ),
                    MobilePassportPartner(
                        rank: 2,
                        tied: true,
                        player: MobilePassportPlayerReference(playerId: "fixture-player-d", displayName: "Cameron Diaz"),
                        record: passportRecord(wins: 3, losses: 1, halves: 1, points: 3.5)
                    ),
                ]
            )
        )
    }()

    static let passportNewPlayerData: MobilePassportData = {
        let emptyRecord = passportRecord(wins: 0, losses: 0, halves: 0, points: nil)
        let emptySegment = MobilePassportSegmentRecord(won: 0, lost: 0, halved: 0)
        return MobilePassportData(
            contractVersion: "mobile-passport-v1",
            player: MobilePassportPlayer(
                playerId: "fixture-player-a",
                displayName: "New Golfer",
                active: true,
                careerYears: MobilePassportCareerYears(firstYear: nil, lastYear: nil, current: true),
                portraitAssetKey: nil,
                team: nil
            ),
            currentTournament: MobilePassportCurrentTournament(
                tournamentId: "fixture-tournament",
                name: "Bagger Fixture Invitational",
                year: nil,
                status: nil,
                currentRound: nil,
                tournamentHandicap: nil,
                team: nil,
                record: nil,
                standing: nil,
                teamStanding: nil,
                rounds: []
            ),
            career: MobilePassportCareer(
                summary: MobilePassportCareerSummary(
                    record: emptyRecord,
                    winPercentage: 0,
                    appearances: 0,
                    championships: 0,
                    runnerUpFinishes: 0,
                    averageHandicap: nil
                ),
                honors: MobilePassportHonors(
                    championshipYears: [],
                    sandbaggerOfYearYears: [],
                    pointsChampionYears: [],
                    boardOfGovernors: false,
                    handicapCommittee: false
                ),
                rankings: [],
                holePerformance: MobilePassportHolePerformance(
                    sample: MobilePassportSample(completeScorecards: 0, scoringHoles: 0, matchPlayHoles: 0),
                    totalHolesPlayed: 0,
                    holesWon: 0,
                    holesLost: 0,
                    holesHalved: 0,
                    holeDifferential: 0,
                    frontNineHolesWon: 0,
                    backNineHolesWon: 0,
                    closingHolesWon: 0,
                    birdies: 0,
                    eagles: 0,
                    pars: 0,
                    bogeys: 0,
                    doubleBogeysOrWorse: 0,
                    averageGrossScore: nil,
                    averageNetScore: nil,
                    averagePar3Score: nil,
                    averagePar4Score: nil,
                    averagePar5Score: nil,
                    averageFrontNineScore: nil,
                    averageBackNineScore: nil,
                    birdieRate: nil,
                    parRate: nil,
                    bogeyRate: nil,
                    doubleBogeyOrWorseRate: nil
                ),
                matchProgression: MobilePassportMatchProgression(
                    matches: 0,
                    largestLeadHeld: 0,
                    largestComebackCompleted: 0,
                    matchesWonAfterTrailing: 0,
                    largestLeadBlown: 0,
                    mostLeadChangesExperienced: 0,
                    totalLeadChangesExperienced: 0,
                    mostConsecutiveHolesWon: 0,
                    mostConsecutiveHolesLost: 0,
                    mostClosingHolesWon: 0,
                    totalClosingHolesWon: 0,
                    frontNine: emptySegment,
                    backNine: emptySegment,
                    closing: emptySegment
                ),
                tournamentHistory: [],
                formatPerformance: [],
                recordsHeld: [],
                captainLegacy: MobilePassportCaptainLegacy(
                    record: emptyRecord,
                    championships: 0,
                    seasons: []
                ),
                biggestRival: nil,
                draftHistory: [],
                topPartners: []
            )
        )
    }()

    static let passportLongContentData: MobilePassportData = {
        let canonical = passportData
        return MobilePassportData(
            contractVersion: canonical.contractVersion,
            player: MobilePassportPlayer(
                playerId: canonical.player.playerId,
                displayName: "Alexandria Morgan-Sutherland, Long-Name Accessibility Fixture Golfer",
                active: canonical.player.active,
                careerYears: canonical.player.careerYears,
                portraitAssetKey: canonical.player.portraitAssetKey,
                team: MobilePassportTeam(
                    teamId: "fixture-team-green",
                    name: "The Kiawah Atlantic Pines Championship Team",
                    side: 1
                )
            ),
            currentTournament: canonical.currentTournament,
            career: canonical.career
        )
    }()

    private static func passportRecord(
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

    private static func passportFormat(
        _ format: MobilePassportFormat,
        label: String,
        record: MobilePassportRecord,
        team: MobilePassportTeam
    ) -> MobilePassportFormatPerformance {
        MobilePassportFormatPerformance(
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
                    matchId: "fixture-\(format.rawValue.lowercased())-match",
                    year: 2026,
                    roundNumber: format == .bestBall ? 1 : format == .scramble ? 2 : 3,
                    matchNumber: 1,
                    outcome: .win,
                    partner: format == .singles
                        ? []
                        : [MobilePassportPlayerReference(playerId: "fixture-player-b", displayName: "Jordan Lee")],
                    opponents: [MobilePassportPlayerReference(playerId: "fixture-player-c", displayName: "Taylor Kim")],
                    team: team,
                    opposingTeam: MobilePassportTeam(teamId: "fixture-team-gold", name: "Dunes", side: 2),
                    winner: "Pines",
                    winnerSide: 1,
                    course: MobilePassportCourse(courseId: "ocean-course", name: "The Ocean Course"),
                    segments: [MobilePassportMatchSegment(label: "Overall", winner: "Pines", winnerSide: 1)]
                ),
            ]
        )
    }
}
#endif
