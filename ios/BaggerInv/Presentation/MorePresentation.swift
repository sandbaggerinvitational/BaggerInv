import Foundation

enum MoreDestination: Hashable, Sendable {
    case schedule
    case passport
    case passportTournamentHistory
    case passportFormat(code: String)
    case passportCaptainLegacy
    case tournamentGuide
    case courses
    case course(courseID: String)
    case rules
    case odds
    case history
    case historyYear(year: Int)
    case records
    case dining
    case localGuide
    case contacts
    case settings

    var id: String {
        switch self {
        case .schedule: "schedule"
        case .passport: "passport"
        case .passportTournamentHistory: "passport-tournament-history"
        case .passportFormat(let code): "passport-format-\(code)"
        case .passportCaptainLegacy: "passport-captain-legacy"
        case .tournamentGuide: "tournament-guide"
        case .courses: "courses"
        case .course(let courseID): "course-\(courseID)"
        case .rules: "rules"
        case .odds: "odds"
        case .history: "history"
        case .historyYear(let year): "history-\(year)"
        case .records: "records"
        case .dining: "dining"
        case .localGuide: "local-guide"
        case .contacts: "contacts"
        case .settings: "settings"
        }
    }

    var title: String {
        switch self {
        case .schedule: "Schedule"
        case .passport: "Player Passport"
        case .passportTournamentHistory: "Tournament History"
        case .passportFormat(let code): "\(code) Performance"
        case .passportCaptainLegacy: "Captain Legacy"
        case .tournamentGuide: "Tournament Guide"
        case .courses: "Courses"
        case .course: "Course"
        case .rules: "Rules & Formats"
        case .odds: "Published Odds"
        case .history: "Tournament History"
        case .historyYear(let year): "\(year) Tournament"
        case .records: "Records"
        case .dining: "Dining"
        case .localGuide: "Local Guide"
        case .contacts: "Important Contacts"
        case .settings: "Settings"
        }
    }

    var systemImage: String {
        switch self {
        case .schedule: "calendar"
        case .passport, .passportTournamentHistory, .passportFormat, .passportCaptainLegacy:
            "person.text.rectangle"
        case .tournamentGuide: "book.closed"
        case .courses, .course: "flag"
        case .rules: "list.clipboard"
        case .odds: "chart.line.uptrend.xyaxis"
        case .history, .historyYear: "clock.arrow.circlepath"
        case .records: "medal"
        case .dining: "fork.knife"
        case .localGuide: "map"
        case .contacts: "phone"
        case .settings: "gearshape"
        }
    }
}

struct MoreDirectoryItem: Equatable, Identifiable, Sendable {
    var id: String { destination.id }
    let destination: MoreDestination
    let title: String
    let subtitle: String
    let systemImage: String

    init(_ destination: MoreDestination, subtitle: String) {
        self.destination = destination
        title = destination.title
        self.subtitle = subtitle
        systemImage = destination.systemImage
    }
}

struct MoreDirectorySection: Equatable, Identifiable, Sendable {
    let id: String
    let title: String
    let items: [MoreDirectoryItem]
}

struct MoreDirectoryPresentation: Equatable, Sendable {
    let sections: [MoreDirectorySection]

    static let standard = MoreDirectoryPresentation(sections: [
        MoreDirectorySection(id: "tournament", title: "Tournament", items: [
            MoreDirectoryItem(.schedule, subtitle: "The complete tournament itinerary"),
            MoreDirectoryItem(.tournamentGuide, subtitle: "Tournament-week information"),
            MoreDirectoryItem(.courses, subtitle: "Courses, tees, and hole details"),
            MoreDirectoryItem(.rules, subtitle: "Official rules and Round formats"),
        ]),
        MoreDirectorySection(id: "my-bagger", title: "My Bagger", items: [
            MoreDirectoryItem(.passport, subtitle: "Career, history, and achievements"),
            MoreDirectoryItem(.history, subtitle: "Every tournament year"),
            MoreDirectoryItem(.records, subtitle: "The official record book"),
        ]),
        MoreDirectorySection(id: "competition", title: "Competition", items: [
            MoreDirectoryItem(.odds, subtitle: "Published championship projections"),
        ]),
        MoreDirectorySection(id: "local", title: "Local", items: [
            MoreDirectoryItem(.dining, subtitle: "Tournament dining itinerary"),
            MoreDirectoryItem(.localGuide, subtitle: "Transportation and local resources"),
            MoreDirectoryItem(.contacts, subtitle: "Tournament-week assistance"),
        ]),
        MoreDirectorySection(id: "app", title: "App", items: [
            MoreDirectoryItem(.settings, subtitle: "Account and app information"),
        ]),
    ])
}

enum FullScheduleEventState: Equatable, Sendable {
    case past
    case current
    case upcoming
    case undetermined
}

struct FullScheduleEventPresentation: Equatable, Identifiable, Sendable {
    let id: String
    let title: String
    let subtitle: String?
    let location: String?
    let type: String?
    let timeText: String?
    let accessibilityLabel: String
    let state: FullScheduleEventState
}

struct FullScheduleDayPresentation: Equatable, Identifiable, Sendable {
    let id: String
    let dateHeading: String
    let dateAccessibilityText: String
    let events: [FullScheduleEventPresentation]
}

struct FullSchedulePresentation: Equatable, Sendable {
    let timeZoneIdentifier: String
    let days: [FullScheduleDayPresentation]
    let isEmpty: Bool
}

// MARK: - Shared participant-content presentation

struct MoreLabeledValuePresentation: Equatable, Identifiable, Sendable {
    let id: String
    let label: String
    let value: String
}

enum MoreExternalActionKind: Equatable, Sendable {
    case phone
    case textMessage
    case email
    case website
    case directions
}

struct MoreExternalActionPresentation: Equatable, Identifiable, Sendable {
    let id: String
    let kind: MoreExternalActionKind
    let label: String
    let url: URL
}

// MARK: - Player Passport

struct PassportCurrentRoundPresentation: Equatable, Identifiable, Sendable {
    let id: Int
    let roundNumber: Int
    let formatCode: String
    let status: String
    let progress: String?
    let metrics: [MoreLabeledValuePresentation]
}

struct PassportCurrentTournamentPresentation: Equatable, Sendable {
    let tournamentID: String
    let name: String
    let year: String?
    let status: String?
    let teamName: String?
    let standing: String?
    let teamStanding: String?
    let tournamentHandicap: String?
    let record: String?
    let points: String?
    let rounds: [PassportCurrentRoundPresentation]
}

struct PassportHonorPresentation: Equatable, Identifiable, Sendable {
    let id: String
    let title: String
    let detail: String?
}

struct PassportRankingPresentation: Equatable, Identifiable, Sendable {
    let id: String
    let title: String
    let rank: String?
}

struct PassportTournamentHistoryPresentation: Equatable, Identifiable, Sendable {
    let id: String
    let tournamentID: String
    let year: Int
    let teamName: String?
    let result: String
    let record: String
    let points: String?
    let averageScore: String?
    let scorecardSample: Int
    let wasCaptain: Bool
    let honors: [String]
}

struct PassportFormatMatchPresentation: Equatable, Identifiable, Sendable {
    let id: String
    let year: Int
    let roundLabel: String
    let outcome: String
    let partnerNames: [String]
    let opponentNames: [String]
    let teamName: String?
    let opposingTeamName: String?
    let winner: String?
    let winnerSide: Int?
    let courseName: String?
    let segments: [MoreLabeledValuePresentation]
}

struct PassportFormatPresentation: Equatable, Identifiable, Sendable {
    let id: String
    let formatCode: String
    let label: String
    let scoringLabel: String
    let record: String
    let points: String?
    let winPercentage: String
    let scoringAverage: String?
    let scoringSample: Int
    let yearRange: String?
    let matches: [PassportFormatMatchPresentation]
}

struct PassportCaptainSeasonPresentation: Equatable, Identifiable, Sendable {
    let id: Int
    let year: Int
    let teamName: String?
    let result: String
}

struct PassportCaptainLegacyPresentation: Equatable, Sendable {
    let record: String
    let points: String?
    let championships: Int
    let seasons: [PassportCaptainSeasonPresentation]
}

struct PassportPartnerPresentation: Equatable, Identifiable, Sendable {
    let id: String
    let playerID: String
    let rank: String
    let tied: Bool
    let displayName: String
    let record: String
    let points: String?
}

struct PassportRivalPresentation: Equatable, Sendable {
    let playerID: String
    let displayName: String
    let record: String
    let points: String?
}

struct PassportDraftPresentation: Equatable, Identifiable, Sendable {
    let id: Int
    let year: Int
    let pick: String
    let teamName: String
    let finish: String?
    let draftValueScore: String?
}

struct PassportPresentation: Equatable, Sendable {
    let playerID: String
    let displayName: String
    let active: Bool
    let teamName: String?
    let careerYears: String?
    let portraitAssetKey: String?
    let currentTournament: PassportCurrentTournamentPresentation
    let careerSummary: [MoreLabeledValuePresentation]
    let honors: [PassportHonorPresentation]
    let rankings: [PassportRankingPresentation]
    let holePerformance: [MoreLabeledValuePresentation]
    let matchProgression: [MoreLabeledValuePresentation]
    let tournamentHistory: [PassportTournamentHistoryPresentation]
    let formatPerformance: [PassportFormatPresentation]
    let recordsHeld: [PassportHonorPresentation]
    let captainLegacy: PassportCaptainLegacyPresentation
    let biggestRival: PassportRivalPresentation?
    let draftHistory: [PassportDraftPresentation]
    let topPartners: [PassportPartnerPresentation]
}

enum PassportPresenter {
    static func make(data: MobilePassportData, locale: Locale = .autoupdatingCurrent) -> PassportPresentation {
        let summary = data.career.summary
        let hole = data.career.holePerformance
        let progression = data.career.matchProgression

        return PassportPresentation(
            playerID: data.player.playerId,
            displayName: data.player.displayName,
            active: data.player.active,
            teamName: data.player.team?.name,
            careerYears: yearRange(
                first: data.player.careerYears.firstYear,
                last: data.player.careerYears.lastYear
            ),
            portraitAssetKey: data.player.portraitAssetKey,
            currentTournament: currentTournament(data.currentTournament, locale: locale),
            careerSummary: [
                value("career-record", "Career Record", record(summary.record)),
                value("career-points", "Career Points", points(summary.record.points)),
                value("win-percentage", "Win Percentage", percentage(summary.winPercentage, locale: locale)),
                value("appearances", "Appearances", String(summary.appearances)),
                value("championships", "Championships", String(summary.championships)),
                value("runner-up-finishes", "Runner-Up Finishes", String(summary.runnerUpFinishes)),
                value("average-handicap", "Average Handicap", decimal(summary.averageHandicap, locale: locale)),
            ],
            honors: honors(data.career.honors),
            rankings: data.career.rankings.map {
                PassportRankingPresentation(
                    id: $0.metric.rawValue,
                    title: rankingLabel($0.metric),
                    rank: $0.rank.map { "#\($0)" }
                )
            },
            holePerformance: [
                value("holes-played", "Holes Played", String(hole.totalHolesPlayed)),
                value("holes-won", "Holes Won", String(hole.holesWon)),
                value("holes-lost", "Holes Lost", String(hole.holesLost)),
                value("holes-halved", "Holes Halved", String(hole.holesHalved)),
                value("hole-differential", "Hole Differential", signed(hole.holeDifferential)),
                value("front-nine-won", "Front Nine Holes Won", String(hole.frontNineHolesWon)),
                value("back-nine-won", "Back Nine Holes Won", String(hole.backNineHolesWon)),
                value("closing-holes-won", "Closing Holes Won", String(hole.closingHolesWon)),
                value("birdies", "Birdies", String(hole.birdies)),
                value("eagles", "Eagles", String(hole.eagles)),
                value("pars", "Pars", String(hole.pars)),
                value("bogeys", "Bogeys", String(hole.bogeys)),
                value("double-bogeys", "Double Bogey or Worse", String(hole.doubleBogeysOrWorse)),
                value("average-gross", "Average Gross", decimal(hole.averageGrossScore, locale: locale)),
                value("average-net", "Average Net", decimal(hole.averageNetScore, locale: locale)),
                value("average-par-3", "Par 3 Average", decimal(hole.averagePar3Score, locale: locale)),
                value("average-par-4", "Par 4 Average", decimal(hole.averagePar4Score, locale: locale)),
                value("average-par-5", "Par 5 Average", decimal(hole.averagePar5Score, locale: locale)),
                value("average-front-nine", "Front Nine Average", decimal(hole.averageFrontNineScore, locale: locale)),
                value("average-back-nine", "Back Nine Average", decimal(hole.averageBackNineScore, locale: locale)),
                value("birdie-rate", "Birdie Rate", percentage(hole.birdieRate, locale: locale)),
                value("par-rate", "Par Rate", percentage(hole.parRate, locale: locale)),
                value("bogey-rate", "Bogey Rate", percentage(hole.bogeyRate, locale: locale)),
                value("double-bogey-rate", "Double Bogey or Worse Rate", percentage(hole.doubleBogeyOrWorseRate, locale: locale)),
                value("complete-scorecards", "Complete Scorecards", String(hole.sample.completeScorecards)),
                value("scoring-holes", "Scoring Holes", String(hole.sample.scoringHoles)),
                value("match-play-holes", "Match Play Holes", String(hole.sample.matchPlayHoles)),
            ],
            matchProgression: [
                value("matches", "Matches", String(progression.matches)),
                value("largest-lead", "Largest Lead Held", String(progression.largestLeadHeld)),
                value("largest-comeback", "Largest Comeback", String(progression.largestComebackCompleted)),
                value("wins-after-trailing", "Wins After Trailing", String(progression.matchesWonAfterTrailing)),
                value("largest-lead-blown", "Largest Lead Blown", String(progression.largestLeadBlown)),
                value("most-lead-changes", "Most Lead Changes", String(progression.mostLeadChangesExperienced)),
                value("total-lead-changes", "Total Lead Changes", String(progression.totalLeadChangesExperienced)),
                value("consecutive-won", "Most Consecutive Holes Won", String(progression.mostConsecutiveHolesWon)),
                value("consecutive-lost", "Most Consecutive Holes Lost", String(progression.mostConsecutiveHolesLost)),
                value("closing-won", "Most Closing Holes Won", String(progression.mostClosingHolesWon)),
                value("total-closing-won", "Total Closing Holes Won", String(progression.totalClosingHolesWon)),
                value("front-nine", "Front Nine", segmentRecord(progression.frontNine)),
                value("back-nine", "Back Nine", segmentRecord(progression.backNine)),
                value("closing", "Closing Holes", segmentRecord(progression.closing)),
            ],
            tournamentHistory: data.career.tournamentHistory.map { history($0, locale: locale) },
            formatPerformance: data.career.formatPerformance.map { format($0, locale: locale) },
            recordsHeld: data.career.recordsHeld.map {
                PassportHonorPresentation(id: $0.recordId, title: $0.title, detail: nil)
            },
            captainLegacy: PassportCaptainLegacyPresentation(
                record: record(data.career.captainLegacy.record),
                points: points(data.career.captainLegacy.record.points),
                championships: data.career.captainLegacy.championships,
                seasons: data.career.captainLegacy.seasons.map {
                    PassportCaptainSeasonPresentation(
                        id: $0.year,
                        year: $0.year,
                        teamName: $0.team?.name,
                        result: $0.result.rawValue
                    )
                }
            ),
            biggestRival: data.career.biggestRival.map {
                PassportRivalPresentation(
                    playerID: $0.player.playerId,
                    displayName: $0.player.displayName,
                    record: record($0.record),
                    points: points($0.record.points)
                )
            },
            draftHistory: data.career.draftHistory.map {
                PassportDraftPresentation(
                    id: $0.year,
                    year: $0.year,
                    pick: "#\($0.pick)",
                    teamName: $0.teamName,
                    finish: $0.finish.map { "#\($0)" },
                    draftValueScore: decimal($0.draftValueScore, locale: locale)
                )
            },
            topPartners: data.career.topPartners.map {
                PassportPartnerPresentation(
                    id: $0.player.playerId,
                    playerID: $0.player.playerId,
                    rank: $0.tied ? "T#\($0.rank)" : "#\($0.rank)",
                    tied: $0.tied,
                    displayName: $0.player.displayName,
                    record: record($0.record),
                    points: points($0.record.points)
                )
            }
        )
    }

    private static func currentTournament(
        _ tournament: MobilePassportCurrentTournament,
        locale: Locale
    ) -> PassportCurrentTournamentPresentation {
        PassportCurrentTournamentPresentation(
            tournamentID: tournament.tournamentId,
            name: tournament.name,
            year: tournament.year.map(String.init),
            status: tournament.status,
            teamName: tournament.team?.name,
            standing: tournament.standing.map { "#\($0)" },
            teamStanding: tournament.teamStanding.map { "#\($0)" },
            tournamentHandicap: decimal(tournament.tournamentHandicap, locale: locale),
            record: tournament.record.map { "\($0.wins)-\($0.losses)-\($0.halves)" },
            points: tournament.record.map { TodayPointsFormatter.string(for: $0.points) },
            rounds: tournament.rounds.map { round in
                let progress: String?
                if let through = round.throughHole {
                    progress = "Through \(through)"
                } else if round.holesPlayed > 0 {
                    progress = "\(round.holesPlayed) holes played"
                } else {
                    progress = nil
                }
                return PassportCurrentRoundPresentation(
                    id: round.roundNumber,
                    roundNumber: round.roundNumber,
                    formatCode: round.format.rawValue,
                    status: roundStatus(round.status),
                    progress: progress,
                    metrics: [
                        value("round-\(round.roundNumber)-gross", "Gross", decimal(round.gross, locale: locale)),
                        value("round-\(round.roundNumber)-net", "Net", decimal(round.net, locale: locale)),
                        value(
                            "round-\(round.roundNumber)-rank",
                            "Rank",
                            round.rank.map { round.tied ? "T#\($0)" : "#\($0)" }
                        ),
                        value("round-\(round.roundNumber)-points", "Points", points(round.points)),
                    ]
                )
            }
        )
    }

    private static func history(
        _ entry: MobilePassportTournamentHistory,
        locale: Locale
    ) -> PassportTournamentHistoryPresentation {
        PassportTournamentHistoryPresentation(
            id: entry.tournamentId,
            tournamentID: entry.tournamentId,
            year: entry.year,
            teamName: entry.team?.name,
            result: tournamentResult(entry.result),
            record: record(entry.record),
            points: points(entry.points),
            averageScore: decimal(entry.averageScore, locale: locale),
            scorecardSample: entry.scorecardSample,
            wasCaptain: entry.wasCaptain,
            honors: entry.honors.map(honorLabel)
        )
    }

    private static func format(
        _ performance: MobilePassportFormatPerformance,
        locale: Locale
    ) -> PassportFormatPresentation {
        PassportFormatPresentation(
            id: performance.format.rawValue,
            formatCode: performance.format.rawValue,
            label: performance.label,
            scoringLabel: performance.scoringLabel,
            record: record(performance.record),
            points: points(performance.record.points),
            winPercentage: percentage(performance.winPercentage, locale: locale) ?? "—",
            scoringAverage: decimal(performance.scoringAverage, locale: locale),
            scoringSample: performance.scoringSample,
            yearRange: yearRange(first: performance.firstYear, last: performance.latestYear),
            matches: performance.matches.map { match in
                PassportFormatMatchPresentation(
                    id: match.matchId,
                    year: match.year,
                    roundLabel: match.matchNumber.map {
                        "Round \(match.roundNumber) · Match \($0)"
                    } ?? "Round \(match.roundNumber)",
                    outcome: outcomeLabel(match.outcome),
                    partnerNames: match.partner.map(\.displayName),
                    opponentNames: match.opponents.map(\.displayName),
                    teamName: match.team?.name,
                    opposingTeamName: match.opposingTeam?.name,
                    winner: match.winner,
                    winnerSide: match.winnerSide,
                    courseName: match.course?.name,
                    segments: match.segments.enumerated().map { index, segment in
                        value(
                            "\(match.matchId)-segment-\(index)",
                            segment.label,
                            segment.winner
                        )
                    }
                )
            }
        )
    }

    private static func honors(_ honors: MobilePassportHonors) -> [PassportHonorPresentation] {
        var output: [PassportHonorPresentation] = []
        output.append(contentsOf: honors.championshipYears.map {
            PassportHonorPresentation(id: "champion-\($0)", title: "Champion", detail: String($0))
        })
        output.append(contentsOf: honors.sandbaggerOfYearYears.map {
            PassportHonorPresentation(id: "sandbagger-\($0)", title: "Sandbagger of the Year", detail: String($0))
        })
        output.append(contentsOf: honors.pointsChampionYears.map {
            PassportHonorPresentation(id: "points-champion-\($0)", title: "Points Champion", detail: String($0))
        })
        if honors.boardOfGovernors {
            output.append(PassportHonorPresentation(id: "board-of-governors", title: "Board of Governors", detail: nil))
        }
        if honors.handicapCommittee {
            output.append(PassportHonorPresentation(id: "handicap-committee", title: "Handicap Committee", detail: nil))
        }
        return output
    }

    private static func value(_ id: String, _ label: String, _ value: String?) -> MoreLabeledValuePresentation {
        MoreLabeledValuePresentation(id: id, label: label, value: value ?? "—")
    }

    private static func record(_ record: MobilePassportRecord) -> String {
        "\(record.wins)-\(record.losses)-\(record.halves)"
    }

    private static func segmentRecord(_ record: MobilePassportSegmentRecord) -> String {
        "\(record.won)-\(record.lost)-\(record.halved)"
    }

    private static func points(_ value: Double?) -> String? {
        value.map { TodayPointsFormatter.string(for: $0) }
    }

    private static func decimal(_ value: Double?, locale: Locale) -> String? {
        guard let value else { return nil }
        let formatter = NumberFormatter()
        formatter.locale = locale
        formatter.numberStyle = .decimal
        formatter.minimumFractionDigits = 0
        formatter.maximumFractionDigits = 2
        return formatter.string(from: NSNumber(value: value))
    }

    private static func percentage(_ value: Double?, locale: Locale) -> String? {
        guard let value else { return nil }
        let formatter = NumberFormatter()
        formatter.locale = locale
        formatter.numberStyle = .percent
        formatter.minimumFractionDigits = 0
        formatter.maximumFractionDigits = 1
        formatter.multiplier = 1
        return formatter.string(from: NSNumber(value: value))
    }

    private static func yearRange(first: Int?, last: Int?) -> String? {
        switch (first, last) {
        case let (first?, last?) where first == last: String(first)
        case let (first?, last?): "\(first)–\(last)"
        case let (first?, nil): String(first)
        case let (nil, last?): String(last)
        case (nil, nil): nil
        }
    }

    private static func signed(_ value: Int) -> String {
        value > 0 ? "+\(value)" : String(value)
    }

    private static func roundStatus(_ status: MobilePassportRoundStatus) -> String {
        switch status {
        case .scheduled: "Scheduled"
        case .inProgress: "In Progress"
        case .completed: "Completed"
        }
    }

    private static func tournamentResult(_ result: MobilePassportTournamentResult) -> String {
        switch result {
        case .champion: "Champion"
        case .runnerUp: "Runner-Up"
        case .completed: "Completed"
        case .upcoming: "Upcoming"
        }
    }

    private static func outcomeLabel(_ outcome: MobilePassportMatchOutcome) -> String {
        switch outcome {
        case .win: "Win"
        case .loss: "Loss"
        case .half: "Half"
        case .unknown: "Unknown"
        }
    }

    private static func honorLabel(_ honor: MobilePassportHonor) -> String {
        switch honor {
        case .champion: "Champion"
        case .sandbaggerOfYear: "Sandbagger of the Year"
        case .pointsChampion: "Points Champion"
        }
    }

    private static func rankingLabel(_ metric: MobilePassportRankingMetric) -> String {
        switch metric {
        case .careerPoints: "Career Points"
        case .matchWins: "Match Wins"
        case .winPercentage: "Win Percentage"
        case .holeDifferential: "Hole Differential"
        case .birdies: "Birdies"
        case .averageGross: "Average Gross"
        }
    }
}

// MARK: - Tournament Guide

struct GuideOverviewPresentation: Equatable, Identifiable, Sendable {
    let id: String
    let slug: String
    let title: String?
    let body: String
}

struct GuideRoundFormatPresentation: Equatable, Identifiable, Sendable {
    let id: Int
    let roundNumber: Int
    let formatCode: String
    let name: String
    let details: [MoreLabeledValuePresentation]
    let description: String?
    let rules: String?
}

struct GuideRulePresentation: Equatable, Identifiable, Sendable {
    let id: String
    let category: String
    let subcategory: String?
    let title: String
    let body: String
    let effectiveYear: Int?
    let important: Bool
}

struct GuideHolePresentation: Equatable, Identifiable, Sendable {
    var id: Int { holeNumber }
    let holeNumber: Int
    let par: Int
    let yardage: Int?
    let strokeIndex: Int
}

struct GuideCourseAssignmentPresentation: Equatable, Identifiable, Sendable {
    let id: String
    let roundNumber: Int
    let formatCode: String
    let tee: String
    let summary: [MoreLabeledValuePresentation]
    let holes: [GuideHolePresentation]
}

struct GuideCoursePresentation: Equatable, Identifiable, Sendable {
    let id: String
    let name: String
    let location: String?
    let yearOpened: Int?
    let designer: String?
    let overview: String?
    let playingTips: String?
    let signatureHoles: String?
    let history: String?
    let logoAssetKey: String?
    let profileAssetKey: String?
    let assignments: [GuideCourseAssignmentPresentation]
    let actions: [MoreExternalActionPresentation]
}

struct GuideDiningPresentation: Equatable, Identifiable, Sendable {
    let id: String
    let day: String
    let meal: String
    let cuisine: String?
    let time: String?
    let location: String
    let dressCode: String?
    let reservationRequired: Bool?
    let notes: String?
}

struct GuideLocalEntryPresentation: Equatable, Identifiable, Sendable {
    let id: String
    let category: String
    let title: String
    let description: String?
    let address: String?
    let phone: String?
    let website: String?
    let actions: [MoreExternalActionPresentation]
}

struct GuideContactPresentation: Equatable, Identifiable, Sendable {
    let id: String
    let category: String
    let name: String
    let role: String?
    let phone: String?
    let email: String?
    let website: String?
    let actions: [MoreExternalActionPresentation]
}

struct GuidePresentation: Equatable, Sendable {
    let publicationState: MobileGuidePublicationState
    let tournamentName: String?
    let editionTitle: String?
    let dates: String?
    let location: String?
    let timeZoneIdentifier: String?
    let logoAssetKey: String?
    let heroAssetKey: String?
    let mobileHeroAssetKey: String?
    let overview: [GuideOverviewPresentation]
    let roundFormats: [GuideRoundFormatPresentation]
    let rules: [GuideRulePresentation]
    let courses: [GuideCoursePresentation]
    let dining: [GuideDiningPresentation]
    let localGuide: [GuideLocalEntryPresentation]
    let contacts: [GuideContactPresentation]
    let isPublished: Bool
}

enum GuidePresenter {
    static func make(data: MobileGuideData, locale: Locale = .autoupdatingCurrent) -> GuidePresentation {
        GuidePresentation(
            publicationState: data.publicationState,
            tournamentName: data.tournament?.name,
            editionTitle: data.tournament?.editionTitle,
            dates: data.tournament?.dates,
            location: data.tournament?.location,
            timeZoneIdentifier: data.tournament?.timeZone,
            logoAssetKey: data.tournament?.logoAssetKey,
            heroAssetKey: data.tournament?.heroAssetKey,
            mobileHeroAssetKey: data.tournament?.mobileHeroAssetKey,
            overview: data.overview.map {
                GuideOverviewPresentation(
                    id: $0.sectionId,
                    slug: $0.slug,
                    title: $0.title,
                    body: $0.body
                )
            },
            roundFormats: data.rules.roundFormats.map { round in
                GuideRoundFormatPresentation(
                    id: round.roundNumber,
                    roundNumber: round.roundNumber,
                    formatCode: round.format.rawValue,
                    name: round.name,
                    details: [
                        labeled("team-size", "Team Size", round.teamSize.map(String.init)),
                        labeled("points-available", "Points Available", round.pointsAvailable.map { TodayPointsFormatter.string(for: $0) }),
                        labeled("front-nine", "Front Nine", segment(round.frontNineUsed, points: round.frontNinePoints)),
                        labeled("back-nine", "Back Nine", segment(round.backNineUsed, points: round.backNinePoints)),
                        labeled("overall", "Overall", segment(round.overallUsed, points: round.overallPoints)),
                        labeled("handicap-allocation", "Handicap Allocation", round.handicapAllocation),
                        labeled("handicap", "Handicap", round.handicap),
                        labeled("handicap-rules", "Handicap Rules", round.handicapRules),
                        labeled("playing-handicap", "Playing Handicap", round.playingHandicap),
                        labeled("scoring-format", "Scoring Format", round.scoringFormat),
                        labeled("scoring", "Scoring", round.scoring),
                        labeled("match-format", "Match Format", round.matchFormat),
                    ].compactMap { $0 },
                    description: round.description,
                    rules: round.rules
                )
            },
            rules: data.rules.items.map {
                GuideRulePresentation(
                    id: $0.ruleId,
                    category: $0.category,
                    subcategory: $0.subcategory,
                    title: $0.title,
                    body: $0.body,
                    effectiveYear: $0.effectiveYear,
                    important: $0.important
                )
            },
            courses: data.courses.map { course in
                GuideCoursePresentation(
                    id: course.courseId,
                    name: course.name,
                    location: [course.city, course.state].compactMap { $0?.nilIfEmpty }.joined(separator: ", ").nilIfEmpty
                        ?? course.location,
                    yearOpened: course.yearOpened,
                    designer: course.designer,
                    overview: course.overview,
                    playingTips: course.playingTips,
                    signatureHoles: course.signatureHoles,
                    history: course.history,
                    logoAssetKey: course.logoAssetKey,
                    profileAssetKey: course.profileAssetKey,
                    assignments: course.assignments.map { assignment in
                        GuideCourseAssignmentPresentation(
                            id: assignment.assignmentId,
                            roundNumber: assignment.roundNumber,
                            formatCode: assignment.format.rawValue,
                            tee: assignment.tee,
                            summary: [
                                MoreLabeledValuePresentation(id: "rating", label: "Rating", value: decimal(assignment.rating, locale: locale)),
                                MoreLabeledValuePresentation(id: "slope", label: "Slope", value: String(assignment.slope)),
                                MoreLabeledValuePresentation(id: "par", label: "Par", value: String(assignment.par)),
                                MoreLabeledValuePresentation(id: "yardage", label: "Yardage", value: assignment.yardage.map(String.init) ?? "—"),
                            ],
                            holes: assignment.holes.map {
                                GuideHolePresentation(
                                    holeNumber: $0.holeNumber,
                                    par: $0.par,
                                    yardage: $0.yardage,
                                    strokeIndex: $0.strokeIndex
                                )
                            }
                        )
                    },
                    actions: [
                        MoreExternalActionFactory.web(course.website, kind: .website, label: "Open Course Website", id: "\(course.courseId)-website"),
                        MoreExternalActionFactory.web(course.directionsUrl, kind: .directions, label: "Open Directions", id: "\(course.courseId)-directions"),
                    ].compactMap { $0 }
                )
            },
            dining: data.dining.map {
                GuideDiningPresentation(
                    id: $0.diningId,
                    day: $0.day,
                    meal: $0.meal,
                    cuisine: $0.cuisine,
                    time: [$0.startTime, $0.endTime].compactMap { $0?.nilIfEmpty }.joined(separator: " – ").nilIfEmpty,
                    location: $0.location,
                    dressCode: $0.dressCode,
                    reservationRequired: $0.reservationRequired,
                    notes: $0.notes
                )
            },
            localGuide: data.localGuide.map { entry in
                GuideLocalEntryPresentation(
                    id: entry.entryId,
                    category: entry.category,
                    title: entry.title,
                    description: entry.description,
                    address: entry.address,
                    phone: entry.phone,
                    website: entry.website,
                    actions: [
                        MoreExternalActionFactory.phone(entry.phone, kind: .phone, label: "Call \(entry.title)", id: "\(entry.entryId)-phone"),
                        MoreExternalActionFactory.directions(
                            entry.address,
                            label: "Directions to \(entry.title)",
                            id: "\(entry.entryId)-directions"
                        ),
                        MoreExternalActionFactory.web(entry.website, kind: .website, label: "Open \(entry.title) Website", id: "\(entry.entryId)-website"),
                    ].compactMap { $0 }
                )
            },
            contacts: data.contacts.map { contact in
                GuideContactPresentation(
                    id: contact.contactId,
                    category: contact.category,
                    name: contact.name,
                    role: contact.role,
                    phone: contact.phone,
                    email: contact.email,
                    website: contact.website,
                    actions: [
                        MoreExternalActionFactory.phone(contact.phone, kind: .phone, label: "Call \(contact.name)", id: "\(contact.contactId)-call"),
                        contact.textEnabled
                            ? MoreExternalActionFactory.phone(contact.phone, kind: .textMessage, label: "Text \(contact.name)", id: "\(contact.contactId)-text")
                            : nil,
                        MoreExternalActionFactory.email(contact.email, label: "Email \(contact.name)", id: "\(contact.contactId)-email"),
                        MoreExternalActionFactory.web(contact.website, kind: .website, label: "Open Website", id: "\(contact.contactId)-website"),
                    ].compactMap { $0 }
                )
            },
            isPublished: data.publicationState == .published
        )
    }

    private static func labeled(_ id: String, _ label: String, _ value: String?) -> MoreLabeledValuePresentation? {
        guard let value = value?.nilIfEmpty else { return nil }
        return MoreLabeledValuePresentation(id: id, label: label, value: value)
    }

    private static func segment(_ used: Bool?, points: Double?) -> String? {
        guard let used else { return nil }
        guard used else { return "Not used" }
        return points.map { "\(TodayPointsFormatter.string(for: $0)) points" } ?? "Used"
    }

    private static func decimal(_ value: Double, locale: Locale) -> String {
        let formatter = NumberFormatter()
        formatter.locale = locale
        formatter.numberStyle = .decimal
        formatter.minimumFractionDigits = 0
        formatter.maximumFractionDigits = 2
        return formatter.string(from: NSNumber(value: value)) ?? String(value)
    }
}

// MARK: - Tournament History

struct HistoryTeamResultPresentation: Equatable, Identifiable, Sendable {
    var id: String { teamID ?? "side-\(side)" }
    let teamID: String?
    let name: String
    let side: Int
    let points: String?
}

struct HistoryTournamentPresentation: Equatable, Identifiable, Sendable {
    var id: String { tournamentID }
    let tournamentID: String
    let year: Int
    let name: String
    let editionTitle: String?
    let destination: String?
    let dates: String?
    let status: String
    let teams: [HistoryTeamResultPresentation]
    let championName: String?
    let runnerUpName: String?
    let finalScore: String?
    let detailAvailable: Bool
}

struct HistoryArchivePresentation: Equatable, Sendable {
    let tournaments: [HistoryTournamentPresentation]
    let isEmpty: Bool
}

struct HistoryRosterPlayerPresentation: Equatable, Identifiable, Sendable {
    var id: String { playerID }
    let playerID: String
    let displayName: String
    let handicap: String?
    let isCaptain: Bool
}

struct HistoryTeamPresentation: Equatable, Identifiable, Sendable {
    var id: String { teamID }
    let teamID: String
    let name: String
    let side: Int
    let points: String?
    let captainName: String?
    let averageHandicap: String?
    let roster: [HistoryRosterPlayerPresentation]
}

struct HistoryRoundPresentation: Equatable, Identifiable, Sendable {
    var id: Int { roundNumber }
    let roundNumber: Int
    let name: String
    let status: String
    let format: String?
    let courseName: String?
    let courseDetail: String?
    let teamStandings: [HistoryTeamResultPresentation]
    let matchIDs: [String]
}

struct HistoryMatchSidePresentation: Equatable, Identifiable, Sendable {
    var id: Int { side }
    let side: Int
    let participantNames: [String]
}

struct HistoryMatchPresentation: Equatable, Identifiable, Sendable {
    var id: String { matchID }
    let matchID: String
    let matchNumber: Int?
    let status: String
    let format: String?
    let courseName: String?
    let sides: [HistoryMatchSidePresentation]
    let resultSummary: String?
    let winner: String?
    let score: String?
    let scorecardIDs: [String]
}

struct HistoryStandingPresentation: Equatable, Identifiable, Sendable {
    var id: String { playerID }
    let rank: Int
    let playerID: String
    let displayName: String
    let teamName: String?
    let points: String?
    let record: String?
}

struct HistoryAwardPresentation: Equatable, Identifiable, Sendable {
    var id: String { awardID }
    let awardID: String
    let title: String
    let recipient: String?
    let playerID: String?
}

struct HistoryHolePresentation: Equatable, Identifiable, Sendable {
    let id: Int
    let holeNumber: Int?
    let grossScore: Int?
    let par: Int?
    let strokeIndex: Int?
    let strokesReceived: Int?
    let netScore: Int?
}

struct HistoryScorecardPresentation: Equatable, Identifiable, Sendable {
    var id: String { scorecardID }
    let scorecardID: String
    let matchID: String
    let entityType: String
    let participantLabel: String
    let playerID: String?
    let teamID: String?
    let participantPlayerIDs: [String]
    let status: String
    let grossTotal: String?
    let netTotal: String?
    let holes: [HistoryHolePresentation]
}

struct HistoryDetailPresentation: Equatable, Sendable {
    let tournament: HistoryTournamentPresentation
    let teams: [HistoryTeamPresentation]
    let rounds: [HistoryRoundPresentation]
    let matches: [HistoryMatchPresentation]
    let standings: [HistoryStandingPresentation]
    let awards: [HistoryAwardPresentation]
    let scorecards: [HistoryScorecardPresentation]
}

enum HistoryPresenter {
    static func archive(
        data: MobileHistoryArchiveData,
        locale: Locale = .autoupdatingCurrent
    ) -> HistoryArchivePresentation {
        HistoryArchivePresentation(
            tournaments: data.tournaments.map { tournament($0, locale: locale) },
            isEmpty: data.tournaments.isEmpty
        )
    }

    static func detail(
        data: MobileHistoryDetailData,
        locale: Locale = .autoupdatingCurrent
    ) -> HistoryDetailPresentation {
        var teamNamesByID: [String: String] = [:]
        var playerNamesByID: [String: String] = [:]
        for team in data.teams {
            teamNamesByID[team.teamId] = team.name
            for player in team.roster where playerNamesByID[player.playerId] == nil {
                playerNamesByID[player.playerId] = player.displayName
            }
        }

        return HistoryDetailPresentation(
            tournament: tournament(data.tournament, locale: locale),
            teams: data.teams.map { team in
                HistoryTeamPresentation(
                    teamID: team.teamId,
                    name: team.name,
                    side: team.side,
                    points: team.points.map { TodayPointsFormatter.string(for: $0) },
                    captainName: team.captain?.displayName,
                    averageHandicap: number(team.averageHandicap, locale: locale),
                    roster: team.roster.map {
                        HistoryRosterPlayerPresentation(
                            playerID: $0.playerId,
                            displayName: $0.displayName,
                            handicap: number($0.handicap, locale: locale),
                            isCaptain: $0.isCaptain
                        )
                    }
                )
            },
            rounds: data.rounds.map { round in
                HistoryRoundPresentation(
                    roundNumber: round.roundNumber,
                    name: round.name,
                    status: status(round.status),
                    format: round.format,
                    courseName: round.course?.name,
                    courseDetail: courseDetail(round.course, locale: locale),
                    teamStandings: round.teamStandings.map { teamResult($0) },
                    matchIDs: round.matchIds
                )
            },
            matches: data.matches.map { match in
                HistoryMatchPresentation(
                    matchID: match.matchId,
                    matchNumber: match.matchNumber,
                    status: status(match.status),
                    format: match.format,
                    courseName: match.course?.name,
                    sides: match.sides.map {
                        HistoryMatchSidePresentation(
                            side: $0.side,
                            participantNames: $0.participants.map(\.displayName)
                        )
                    },
                    resultSummary: match.result?.summary,
                    winner: match.result?.winner,
                    score: historyScore(
                        sideOne: match.result?.teamOnePoints,
                        sideTwo: match.result?.teamTwoPoints
                    ),
                    scorecardIDs: match.scorecardIds
                )
            },
            standings: data.standings.map {
                HistoryStandingPresentation(
                    rank: $0.rank,
                    playerID: $0.playerId,
                    displayName: $0.displayName,
                    teamName: $0.teamName,
                    points: $0.points.map { TodayPointsFormatter.string(for: $0) },
                    record: historyRecord(wins: $0.wins, losses: $0.losses, ties: $0.ties, locale: locale)
                )
            },
            awards: data.awards.map {
                HistoryAwardPresentation(
                    awardID: $0.awardId,
                    title: $0.title,
                    recipient: $0.recipient,
                    playerID: $0.playerId
                )
            },
            scorecards: data.scorecards.map { scorecard in
                let participantNames = scorecard.participantPlayerIds.compactMap {
                    playerNamesByID[$0]
                }
                let participantLabel: String
                switch scorecard.entityType {
                case .individual:
                    participantLabel = scorecard.playerId.flatMap { playerNamesByID[$0] }
                        ?? participantNames.joined(separator: " & ").nilIfEmpty
                        ?? "Individual"
                case .team:
                    participantLabel = scorecard.teamId.flatMap { teamNamesByID[$0] }
                        ?? participantNames.joined(separator: " & ").nilIfEmpty
                        ?? "Team"
                }
                return HistoryScorecardPresentation(
                    scorecardID: scorecard.scorecardId,
                    matchID: scorecard.matchId,
                    entityType: scorecard.entityType == .individual ? "Individual" : "Team",
                    participantLabel: participantLabel,
                    playerID: scorecard.playerId,
                    teamID: scorecard.teamId,
                    participantPlayerIDs: scorecard.participantPlayerIds,
                    status: scorecard.status,
                    grossTotal: number(scorecard.grossTotal, locale: locale),
                    netTotal: number(scorecard.netTotal, locale: locale),
                    holes: scorecard.holes.enumerated().map { index, hole in
                        HistoryHolePresentation(
                            id: index,
                            holeNumber: hole.holeNumber,
                            grossScore: hole.grossScore,
                            par: hole.par,
                            strokeIndex: hole.strokeIndex,
                            strokesReceived: hole.strokesReceived,
                            netScore: hole.netScore
                        )
                    }
                )
            }
        )
    }

    private static func tournament(
        _ tournament: MobileHistoryTournamentSummary,
        locale: Locale
    ) -> HistoryTournamentPresentation {
        HistoryTournamentPresentation(
            tournamentID: tournament.tournamentId,
            year: tournament.year,
            name: tournament.name,
            editionTitle: tournament.editionTitle,
            destination: tournament.destination,
            dates: historyDates(start: tournament.startDate, end: tournament.endDate, locale: locale),
            status: status(tournament.status),
            teams: tournament.teams.map(teamResult),
            championName: tournament.champion?.name,
            runnerUpName: tournament.runnerUp?.name,
            finalScore: tournament.finalScore?.label
                ?? historyScore(
                    sideOne: tournament.finalScore?.teamOnePoints,
                    sideTwo: tournament.finalScore?.teamTwoPoints
                ),
            detailAvailable: tournament.detailAvailable
        )
    }

    private static func teamResult(_ team: MobileHistoryTeamResult) -> HistoryTeamResultPresentation {
        HistoryTeamResultPresentation(
            teamID: team.teamId,
            name: team.name,
            side: team.side,
            points: team.points.map { TodayPointsFormatter.string(for: $0) }
        )
    }

    private static func status(_ status: MobileHistoryStatus) -> String {
        switch status {
        case .upcoming: "Upcoming"
        case .inProgress: "In Progress"
        case .final: "Final"
        }
    }

    private static func number(_ value: Double?, locale: Locale) -> String? {
        guard let value else { return nil }
        return MoreNumberFormatter.decimal(value, maximumFractionDigits: 2, locale: locale)
    }

    private static func historyRecord(
        wins: Double?,
        losses: Double?,
        ties: Double?,
        locale: Locale
    ) -> String? {
        guard let wins, let losses, let ties else { return nil }
        return [wins, losses, ties]
            .map { MoreNumberFormatter.decimal($0, maximumFractionDigits: 1, locale: locale) }
            .joined(separator: "-")
    }

    private static func historyScore(sideOne: Double?, sideTwo: Double?) -> String? {
        guard let sideOne, let sideTwo else { return nil }
        return "\(TodayPointsFormatter.string(for: sideOne)) – \(TodayPointsFormatter.string(for: sideTwo))"
    }

    private static func courseDetail(_ course: MobileHistoryCourse?, locale: Locale) -> String? {
        guard let course else { return nil }
        return [
            course.location,
            course.tee.map { "\($0) tees" },
            course.par.map { "Par \(MoreNumberFormatter.decimal($0, maximumFractionDigits: 1, locale: locale))" },
            course.yardage.map { "\(MoreNumberFormatter.decimal($0, maximumFractionDigits: 0, locale: locale)) yards" },
        ].compactMap { $0?.nilIfEmpty }.joined(separator: " · ").nilIfEmpty
    }

    private static func historyDates(
        start: MobileCalendarDate?,
        end: MobileCalendarDate?,
        locale: Locale
    ) -> String? {
        let formatter = DateFormatter()
        formatter.locale = locale
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.setLocalizedDateFormatFromTemplate("MMM d, yyyy")
        let startText = start.flatMap { historyDate($0.rawValue) }.map(formatter.string)
        let endText = end.flatMap { historyDate($0.rawValue) }.map(formatter.string)
        return switch (startText, endText) {
        case let (start?, end?) where start == end: start
        case let (start?, end?): "\(start) – \(end)"
        case let (start?, nil): start
        case let (nil, end?): end
        case (nil, nil): nil
        }
    }

    private static func historyDate(_ rawValue: String) -> Date? {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.date(from: rawValue)
    }
}

// MARK: - Records

struct RecordHolderPresentation: Equatable, Identifiable, Sendable {
    let id: String
    let entityType: String
    let displayName: String
    let participantNames: [String]
    let teamName: String?
    let courseName: String?
    let context: String?
    let value: String?
    let secondaryValue: String?
}

struct RecordPresentation: Equatable, Identifiable, Sendable {
    var id: String { recordID }
    let recordID: String
    let title: String
    let source: String
    let direction: String
    let value: String?
    let tied: Bool
    let aggregate: Bool
    let eligibilityNote: String?
    let holders: [RecordHolderPresentation]
}

struct RecordCategoryPresentation: Equatable, Identifiable, Sendable {
    let id: String
    let title: String
    let records: [RecordPresentation]
}

struct RecordsPresentation: Equatable, Sendable {
    let coverageNote: String
    let firstCompleteMatchYear: Int
    let scorecardHistoryComplete: Bool
    let categories: [RecordCategoryPresentation]
    let isEmpty: Bool
}

enum RecordsPresenter {
    static func make(data: MobileRecordsData, locale: Locale = .autoupdatingCurrent) -> RecordsPresentation {
        RecordsPresentation(
            coverageNote: data.coverage.note,
            firstCompleteMatchYear: data.coverage.firstCompleteMatchYear,
            scorecardHistoryComplete: data.coverage.scorecardHistoryComplete,
            categories: data.categories.map { category in
                RecordCategoryPresentation(
                    id: category.categoryId.rawValue,
                    title: category.title,
                    records: category.records.map { record in
                        RecordPresentation(
                            recordID: record.recordId,
                            title: record.title,
                            source: sourceLabel(record.source),
                            direction: record.direction == .highest ? "Highest" : "Lowest",
                            value: displayValue(
                                preferred: record.valueDisplay,
                                value: record.value,
                                decimals: record.decimals,
                                signed: record.signed,
                                unit: record.unit,
                                locale: locale
                            ),
                            tied: record.tied,
                            aggregate: record.aggregate,
                            eligibilityNote: record.eligibilityNote,
                            holders: record.holders.enumerated().map { index, holder in
                                RecordHolderPresentation(
                                    id: "\(record.recordId)-holder-\(index)",
                                    entityType: holderLabel(holder.entityType),
                                    displayName: holderName(holder),
                                    participantNames: holder.participantNames,
                                    teamName: holder.teamName,
                                    courseName: holder.courseName,
                                    context: holderContext(holder),
                                    value: displayValue(
                                        preferred: holder.valueDisplay,
                                        value: holder.value,
                                        decimals: record.decimals,
                                        signed: record.signed,
                                        unit: record.unit,
                                        locale: locale
                                    ),
                                    secondaryValue: !record.aggregate
                                        ? scoreToPar(holder.secondaryValue, locale: locale)
                                        : nil
                                )
                            }
                        )
                    }
                )
            },
            isEmpty: data.categories.allSatisfy { $0.records.isEmpty }
        )
    }

    private static func displayValue(
        preferred: String?,
        value: MobileRecordValue?,
        decimals: Int,
        signed: Bool,
        unit: String?,
        locale: Locale
    ) -> String? {
        if let preferred = preferred?.nilIfEmpty { return preferred }
        guard let value else { return nil }
        let raw: String
        switch value {
        case .text(let text): raw = text
        case .number(let number):
            let formatted = MoreNumberFormatter.decimal(
                number,
                minimumFractionDigits: decimals,
                maximumFractionDigits: decimals,
                locale: locale
            )
            raw = signed && number > 0 ? "+\(formatted)" : formatted
        }
        return [raw, unit?.nilIfEmpty].compactMap { $0 }.joined(separator: " ")
    }

    private static func holderName(_ holder: MobileRecordHolder) -> String {
        if let name = holder.displayName?.nilIfEmpty { return name }
        if !holder.participantNames.isEmpty { return holder.participantNames.joined(separator: " & ") }
        if let team = holder.teamName?.nilIfEmpty { return team }
        if let course = holder.courseName?.nilIfEmpty { return course }
        return "Record holder"
    }

    private static func holderContext(_ holder: MobileRecordHolder) -> String? {
        [
            holder.year.map(String.init),
            holder.roundNumber.map { "Round \($0)" },
            holder.format,
            holder.courseName,
            holder.holeNumber.map { "Hole \($0)" },
        ].compactMap { $0?.nilIfEmpty }.joined(separator: " · ").nilIfEmpty
    }

    private static func scoreToPar(_ value: Double?, locale: Locale) -> String? {
        guard let value, value.isFinite else { return nil }
        if value == 0 { return "Even" }
        let formatted = MoreNumberFormatter.decimal(
            value,
            maximumFractionDigits: 2,
            locale: locale
        )
        return value > 0 ? "+\(formatted)" : formatted
    }

    private static func sourceLabel(_ source: MobileRecordSource) -> String {
        switch source {
        case .official: "Official"
        case .scorecard: "Scorecard"
        case .matchProgression: "Match Progression"
        }
    }

    private static func holderLabel(_ type: MobileRecordHolderEntityType) -> String {
        switch type {
        case .player: "Player"
        case .teamPerformance: "Team Performance"
        case .courseHole: "Course Hole"
        case .matchPerformance: "Match Performance"
        }
    }
}

// MARK: - Published Odds

struct OddsTeamPresentation: Equatable, Identifiable, Sendable {
    var id: String { teamID ?? "side-\(side)" }
    let side: Int
    let teamID: String?
    let name: String
    let probability: String
    let americanOdds: String
    let expectedPoints: String
}

struct OddsPlayerPresentation: Equatable, Identifiable, Sendable {
    var id: String { playerID }
    let rank: Int
    let playerID: String
    let displayName: String
    let teamSide: Int
    let probability: String
    let americanOdds: String
    let expectedPoints: String
    let expectedRecord: String
    let averageFinish: String
}

struct OddsSnapshotPresentation: Equatable, Identifiable, Sendable {
    var id: String { phase.rawValue }
    let phase: MobileOddsPhase
    let label: String
    let isCurrent: Bool
    let publishedAt: Date
    let iterationCount: String
    let totalPointsAvailable: String
    let teams: [OddsTeamPresentation]
    let players: [OddsPlayerPresentation]
}

struct OddsPresentation: Equatable, Sendable {
    let publicationState: MobileOddsPublicationState
    let revision: Int
    let currentPhase: MobileOddsPhase?
    let snapshots: [OddsSnapshotPresentation]
    let isPublished: Bool
    let isEmpty: Bool
}

enum OddsPresenter {
    static func make(data: MobileOddsData, locale: Locale = .autoupdatingCurrent) -> OddsPresentation {
        OddsPresentation(
            publicationState: data.publication.state,
            revision: data.publication.revision,
            currentPhase: data.publication.currentPhase,
            snapshots: data.snapshots.map { snapshot in
                OddsSnapshotPresentation(
                    phase: snapshot.phase,
                    label: snapshot.label,
                    isCurrent: snapshot.isCurrent,
                    publishedAt: snapshot.publishedAt.date,
                    iterationCount: MoreNumberFormatter.integer(snapshot.iterations, locale: locale),
                    totalPointsAvailable: TodayPointsFormatter.string(for: snapshot.totalPointsAvailable),
                    teams: snapshot.teams.map {
                        OddsTeamPresentation(
                            side: $0.side,
                            teamID: $0.teamId,
                            name: $0.name,
                            probability: MoreNumberFormatter.percentageFromWhole($0.probability, locale: locale),
                            americanOdds: $0.americanOdds,
                            expectedPoints: TodayPointsFormatter.string(for: $0.expectedPoints)
                        )
                    },
                    players: snapshot.players.map {
                        OddsPlayerPresentation(
                            rank: $0.rank,
                            playerID: $0.playerId,
                            displayName: $0.displayName,
                            teamSide: $0.teamSide,
                            probability: MoreNumberFormatter.percentageFromWhole($0.probability, locale: locale),
                            americanOdds: $0.americanOdds,
                            expectedPoints: TodayPointsFormatter.string(for: $0.expectedPoints),
                            expectedRecord: $0.expectedRecord,
                            averageFinish: MoreNumberFormatter.decimal(
                                $0.averageFinish,
                                maximumFractionDigits: 2,
                                locale: locale
                            )
                        )
                    }
                )
            },
            isPublished: data.publication.state == .published,
            isEmpty: data.snapshots.isEmpty
        )
    }
}

private enum MoreNumberFormatter {
    static func decimal(
        _ value: Double,
        minimumFractionDigits: Int = 0,
        maximumFractionDigits: Int,
        locale: Locale
    ) -> String {
        let formatter = NumberFormatter()
        formatter.locale = locale
        formatter.numberStyle = .decimal
        formatter.minimumFractionDigits = minimumFractionDigits
        formatter.maximumFractionDigits = maximumFractionDigits
        return formatter.string(from: NSNumber(value: value)) ?? String(value)
    }

    static func integer(_ value: Int, locale: Locale) -> String {
        let formatter = NumberFormatter()
        formatter.locale = locale
        formatter.numberStyle = .decimal
        formatter.maximumFractionDigits = 0
        return formatter.string(from: NSNumber(value: value)) ?? String(value)
    }

    static func percentageFromWhole(_ value: Double, locale: Locale) -> String {
        let formatter = NumberFormatter()
        formatter.locale = locale
        formatter.numberStyle = .percent
        formatter.multiplier = 1
        formatter.minimumFractionDigits = 0
        formatter.maximumFractionDigits = 1
        return formatter.string(from: NSNumber(value: value)) ?? "\(value)%"
    }
}

private enum MoreExternalActionFactory {
    static func web(
        _ rawValue: String?,
        kind: MoreExternalActionKind,
        label: String,
        id: String
    ) -> MoreExternalActionPresentation? {
        guard let rawValue = rawValue?.nilIfEmpty,
              let url = URL(string: rawValue),
              url.scheme?.lowercased() == "https",
              url.host?.isEmpty == false
        else { return nil }
        return MoreExternalActionPresentation(id: id, kind: kind, label: label, url: url)
    }

    static func phone(
        _ rawValue: String?,
        kind: MoreExternalActionKind,
        label: String,
        id: String
    ) -> MoreExternalActionPresentation? {
        guard let rawValue = rawValue?.nilIfEmpty,
              MobileParticipantContentValidation.phone(rawValue)
        else { return nil }

        let trimmed = rawValue.trimmingCharacters(in: .whitespacesAndNewlines)
        let extensionRange = trimmed.range(
            of: #" *(?:[xX]|[eE][xX][tT]\.?)[ ]*([0-9]{1,8})$"#,
            options: .regularExpression
        )
        let base = extensionRange.map { String(trimmed[..<$0.lowerBound]) } ?? trimmed
        let extensionDigits = extensionRange.map { range in
            String(trimmed[range])
                .filter(\.isNumber)
        }

        let dialValue: String
        if kind == .textMessage {
            let safeBase = String(base.prefix { character in
                character != "," && character != "#"
            })
            dialValue = safeBase.filter { $0 == "+" || $0.isNumber }
        } else {
            let normalizedBase = base.filter { character in
                character == "+" || character == "," || character == "#" || character.isNumber
            }
            dialValue = normalizedBase + (extensionDigits.map { ",\($0)" } ?? "")
        }

        let baseDigitCount = dialValue.prefix { $0 != "," && $0 != "#" }
            .filter(\.isNumber)
            .count
        guard baseDigitCount >= 3,
              dialValue.first == "+" || dialValue.first?.isNumber == true,
              dialValue.filter({ $0 == "+" }).count <= 1,
              !dialValue.dropFirst().contains("+")
        else { return nil }

        var components = URLComponents()
        components.scheme = kind == .textMessage ? "sms" : "tel"
        components.path = dialValue
        guard let url = components.url else { return nil }
        return MoreExternalActionPresentation(id: id, kind: kind, label: label, url: url)
    }

    static func email(
        _ rawValue: String?,
        label: String,
        id: String
    ) -> MoreExternalActionPresentation? {
        guard let rawValue = rawValue?.nilIfEmpty,
              rawValue.range(
                of: #"^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$"#,
                options: [.regularExpression, .caseInsensitive]
              ) != nil
        else { return nil }
        var components = URLComponents()
        components.scheme = "mailto"
        components.path = rawValue
        guard let url = components.url else { return nil }
        return MoreExternalActionPresentation(id: id, kind: .email, label: label, url: url)
    }

    static func directions(
        _ address: String?,
        label: String,
        id: String
    ) -> MoreExternalActionPresentation? {
        guard let address = address?.nilIfEmpty else { return nil }
        var components = URLComponents()
        components.scheme = "https"
        components.host = "maps.apple.com"
        components.path = "/"
        components.queryItems = [URLQueryItem(name: "q", value: address)]
        guard let url = components.url else { return nil }
        return MoreExternalActionPresentation(id: id, kind: .directions, label: label, url: url)
    }
}

enum FullSchedulePresenter {
    static func make(
        data: MobileScheduleData,
        now: Date,
        locale: Locale = .autoupdatingCurrent
    ) -> FullSchedulePresentation {
        let timeZone = TimeZone(identifier: data.timeZone) ?? TimeZone(secondsFromGMT: 0)!
        var order: [String] = []
        var grouped: [String: [MobileScheduleEvent]] = [:]

        for event in data.events {
            let key = eventCalendarDate(event, timeZone: timeZone) ?? "undated"
            if grouped[key] == nil { order.append(key) }
            grouped[key, default: []].append(event)
        }

        let days = order.map { key in
            let date = key == "undated" ? nil : date(from: key, timeZone: timeZone)
            return FullScheduleDayPresentation(
                id: key,
                dateHeading: date.map { dateHeading($0, timeZone: timeZone, locale: locale) } ?? "Schedule",
                dateAccessibilityText: date.map { dateAccessibility($0, timeZone: timeZone, locale: locale) } ?? "Schedule",
                events: (grouped[key] ?? []).enumerated().map { index, event in
                    eventPresentation(
                        event,
                        fallbackID: "\(key)-\(index)",
                        now: now,
                        timeZone: timeZone,
                        locale: locale
                    )
                }
            )
        }

        return FullSchedulePresentation(
            timeZoneIdentifier: data.timeZone,
            days: days,
            isEmpty: data.events.isEmpty
        )
    }

    private static func eventPresentation(
        _ event: MobileScheduleEvent,
        fallbackID: String,
        now: Date,
        timeZone: TimeZone,
        locale: Locale
    ) -> FullScheduleEventPresentation {
        let startText = event.startAt.map {
            TodayClockFormatter.string(for: $0.date, in: timeZone, locale: locale)
        } ?? event.localStartTime.map {
            TodayClockFormatter.string(for: $0, locale: locale)
        }
        let endText = event.endAt.map {
            TodayClockFormatter.string(for: $0.date, in: timeZone, locale: locale)
        } ?? event.localEndTime.map {
            TodayClockFormatter.string(for: $0, locale: locale)
        }
        let timeText = [startText, endText].compactMap { $0 }.joined(separator: " – ")
        let spokenDate = eventCalendarDate(event, timeZone: timeZone)
            .flatMap { date(from: $0, timeZone: timeZone) }
            .map { dateAccessibility($0, timeZone: timeZone, locale: locale) }
        let accessibility = [spokenDate, timeText.nilIfEmpty, event.title, event.subtitle, event.location]
            .compactMap { $0?.nilIfEmpty }
            .joined(separator: ", ")

        return FullScheduleEventPresentation(
            id: event.eventId ?? fallbackID,
            title: event.title,
            subtitle: event.subtitle,
            location: event.location,
            type: event.type,
            timeText: timeText.nilIfEmpty,
            accessibilityLabel: accessibility,
            state: state(event, now: now)
        )
    }

    private static func state(_ event: MobileScheduleEvent, now: Date) -> FullScheduleEventState {
        if let start = event.startAt?.date, let end = event.endAt?.date {
            if now < start { return .upcoming }
            if now >= end { return .past }
            return .current
        }
        if let start = event.startAt?.date, now < start { return .upcoming }
        if let end = event.endAt?.date, now >= end { return .past }
        return .undetermined
    }

    private static func eventCalendarDate(
        _ event: MobileScheduleEvent,
        timeZone: TimeZone
    ) -> String? {
        if let date = event.date { return date.rawValue }
        guard let start = event.startAt?.date else { return nil }

        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        let components = calendar.dateComponents([.year, .month, .day], from: start)
        guard let year = components.year,
              let month = components.month,
              let day = components.day
        else { return nil }
        return String(format: "%04d-%02d-%02d", year, month, day)
    }

    private static func date(from value: String, timeZone: TimeZone) -> Date? {
        let components = value.split(separator: "-").compactMap { Int($0) }
        guard components.count == 3 else { return nil }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        return calendar.date(from: DateComponents(
            calendar: calendar,
            timeZone: timeZone,
            year: components[0],
            month: components[1],
            day: components[2]
        ))
    }

    private static func dateHeading(_ date: Date, timeZone: TimeZone, locale: Locale) -> String {
        let formatter = DateFormatter()
        formatter.locale = locale
        formatter.timeZone = timeZone
        formatter.setLocalizedDateFormatFromTemplate("EEEE MMMd")
        return formatter.string(from: date).uppercased(with: locale)
    }

    private static func dateAccessibility(_ date: Date, timeZone: TimeZone, locale: Locale) -> String {
        let formatter = DateFormatter()
        formatter.locale = locale
        formatter.timeZone = timeZone
        formatter.dateStyle = .full
        formatter.timeStyle = .none
        return formatter.string(from: date)
    }
}

private extension String {
    var nilIfEmpty: String? { isEmpty ? nil : self }
}
