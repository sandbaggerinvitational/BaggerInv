import Foundation

enum LeadersProduct: String, CaseIterable, Identifiable, Sendable {
    case score
    case players
    case netSkins
    case calcutta

    var id: String { rawValue }

    var title: String {
        switch self {
        case .score: "Score"
        case .players: "Players"
        case .netSkins: "Net Skins"
        case .calcutta: "Calcutta"
        }
    }
}

enum LeadersAvailability: Equatable, Sendable {
    case loading
    case content
    case empty
    case unavailable
}

enum LeadersFreshnessKind: Equatable, Sendable {
    case cached
    case refreshing
    case stale
    case offline
}

struct LeadersFreshnessPresentation: Equatable, Sendable {
    let kind: LeadersFreshnessKind
    let lastValidated: Date?
}

struct LeadersTeamPresentation: Equatable, Identifiable, Sendable {
    let id: String
    let name: String
    let rank: Int?
    let pointsText: String
    let pointsAccessibilityText: String
    let record: String
    let remainingMatches: Int?
    let standingLabel: String?
    let isAuthenticatedTeam: Bool
}

struct LeadersRoundPresentation: Equatable, Identifiable, Sendable {
    var id: Int { roundNumber }
    let roundNumber: Int
    let name: String
    let status: MobileRoundStandingStatus
    let statusText: String
    let teams: [LeadersTeamPresentation]
}

struct LeadersScorePresentation: Equatable, Sendable {
    let availability: LeadersAvailability
    let tournamentName: String
    let tournamentContext: String?
    let teams: [LeadersTeamPresentation]
    let rounds: [LeadersRoundPresentation]
    let scoreMessage: String?
    let freshness: LeadersFreshnessPresentation?
    let isRefreshing: Bool
}

struct LeadersPlayerPresentation: Equatable, Identifiable, Sendable {
    var id: String { playerID }
    let playerID: String
    let rank: Int?
    let displayName: String
    let teamName: String
    let pointsText: String
    let pointsAccessibilityText: String
    let record: String
    let isAuthenticatedPlayer: Bool
}

struct LeadersPlayersPresentation: Equatable, Sendable {
    let availability: LeadersAvailability
    let players: [LeadersPlayerPresentation]
    let freshness: LeadersFreshnessPresentation?
    let isRefreshing: Bool
}

struct LeadersNetSkinsEntryPresentation: Equatable, Identifiable, Sendable {
    let id: String
    let displayName: String
    let isAuthenticatedEntry: Bool
}

struct LeadersNetSkinPresentation: Equatable, Identifiable, Sendable {
    let id: String
    let holeNumber: Int
    let winnerName: String
    let winningNetText: String
    let valueText: String
    let valueAccessibilityText: String
    let isAuthenticatedWinner: Bool
}

struct LeadersNetSkinsRowPresentation: Equatable, Identifiable, Sendable {
    let id: String
    let rankText: String
    let displayName: String
    let skinsText: String
    let winningsText: String
    let winningsAccessibilityText: String
    let winningHolesText: String?
    let isAuthenticatedEntry: Bool
}

struct LeadersNetSkinsOfficialPresentation: Equatable, Sendable {
    let potText: String
    let potAccessibilityText: String
    let skinValueText: String
    let skinValueAccessibilityText: String
    let eligibleText: String
    let progressText: String
    let completedText: String
    let skins: [LeadersNetSkinPresentation]
    let leaderboard: [LeadersNetSkinsRowPresentation]
}

struct LeadersNetSkinsRoundPresentation: Equatable, Identifiable, Sendable {
    let id: String
    let roundNumber: Int
    let formatText: String
    let state: MobileNetSkinsRoundState
    let statusText: String
    let buyInText: String
    let entryCountText: String
    let entries: [LeadersNetSkinsEntryPresentation]
    let official: LeadersNetSkinsOfficialPresentation?
}

struct LeadersNetSkinsPresentation: Equatable, Sendable {
    let availability: LeadersAvailability
    let state: MobileNetSkinsState?
    let statusText: String
    let message: String?
    let rounds: [LeadersNetSkinsRoundPresentation]
    let defaultRoundID: String?
    let freshness: LeadersFreshnessPresentation?
    let isRefreshing: Bool
}

struct LeadersCalcuttaOwnerPresentation: Equatable, Identifiable, Sendable {
    var id: String { playerID }
    let playerID: String
    let displayName: String
    let ownershipText: String
    let ownershipAccessibilityText: String
    let isAuthenticatedPlayer: Bool
}

struct LeadersCalcuttaPurchasePresentation: Equatable, Identifiable, Sendable {
    var id: String { playerID }
    let playerID: String
    let displayName: String
    let purchasePriceText: String
    let purchasePriceAccessibilityText: String
    let owners: [LeadersCalcuttaOwnerPresentation]
    let isAuthenticatedPlayer: Bool
}

struct LeadersCalcuttaGolferPresentation: Equatable, Identifiable, Sendable {
    var id: String { playerID }
    let playerID: String
    let rank: Int
    let tieSize: Int
    let displayName: String
    let pointsText: String
    let tournamentValueText: String
    let tournamentValueAccessibilityText: String
    let guaranteedText: String
    let netProfitText: String
    let netProfitAccessibilityText: String
    let roiText: String
    let remainingUpsideText: String
    let rounds: [LeadersCalcuttaRoundPresentation]
    let isAuthenticatedPlayer: Bool
}

struct LeadersCalcuttaRoundPresentation: Equatable, Identifiable, Sendable {
    let id: String
    let roundNumber: Int
    let formatText: String
    let grossText: String
    let netText: String
    let courseHandicapText: String
    let finishText: String
    let pointsText: String
    let payoutFractionText: String
    let guaranteedText: String
}

struct LeadersCalcuttaInvestmentPresentation: Equatable, Identifiable, Sendable {
    var id: String { playerID }
    let playerID: String
    let displayName: String
    let ownershipText: String
    let purchaseCostText: String
    let guaranteedText: String
    let valueText: String
    let netProfitText: String
    let roiText: String
}

struct LeadersCalcuttaPortfolioPresentation: Equatable, Identifiable, Sendable {
    var id: String { ownerID }
    let ownerID: String
    let rank: Int
    let ownerName: String
    let purchaseCostText: String
    let guaranteedText: String
    let tournamentValueText: String
    let netProfitText: String
    let netProfitAccessibilityText: String
    let roiText: String
    let investments: [LeadersCalcuttaInvestmentPresentation]
    let isAuthenticatedOwner: Bool
}

struct LeadersCalcuttaPublishedPresentation: Equatable, Sendable {
    let potText: String
    let potAccessibilityText: String
    let purchases: [LeadersCalcuttaPurchasePresentation]
    let resultLabel: String?
    let completedRoundsText: String?
    let golfers: [LeadersCalcuttaGolferPresentation]
    let portfolios: [LeadersCalcuttaPortfolioPresentation]
}

struct LeadersCalcuttaPresentation: Equatable, Sendable {
    let availability: LeadersAvailability
    let state: MobileCalcuttaState?
    let publicationState: MobileCalcuttaPublicationState?
    let statusText: String
    let message: String?
    let published: LeadersCalcuttaPublishedPresentation?
    let freshness: LeadersFreshnessPresentation?
    let isRefreshing: Bool
}

enum LeadersFormatter {
    static func points(_ value: Double?) -> String {
        TodayPointsFormatter.string(for: value)
    }

    static func pointsAccessibility(_ value: Double?) -> String {
        guard let value, value.isFinite else { return "points unavailable" }
        let halfUnits = value * 2
        if halfUnits.rounded() == halfUnits {
            let whole = Int(abs(value).rounded(.down))
            let sign = value < 0 ? "negative " : ""
            if abs(value).truncatingRemainder(dividingBy: 1) == 0.5 {
                return whole == 0
                    ? "\(sign)one half point"
                    : "\(sign)\(whole) and a half points"
            }
            return "\(sign)\(whole) \(whole == 1 ? "point" : "points")"
        }
        return "\(value) points"
    }

    static func currency(
        _ value: Decimal,
        code: String = "USD",
        canonicalRawValue: String? = nil
    ) -> String {
        if let canonicalRawValue {
            return exactCurrency(canonicalRawValue, code: code)
        }
        let formatter = NumberFormatter()
        formatter.locale = .autoupdatingCurrent
        formatter.numberStyle = .currency
        formatter.currencyCode = code
        formatter.minimumFractionDigits = 0
        formatter.maximumFractionDigits = canonicalFractionDigits(
            value,
            canonicalRawValue: canonicalRawValue
        )
        return formatter.string(from: NSDecimalNumber(decimal: value)) ?? NSDecimalNumber(decimal: value).stringValue
    }

    static func currencyAccessibility(
        _ value: Decimal,
        code: String = "USD",
        canonicalRawValue: String? = nil
    ) -> String {
        currency(value, code: code, canonicalRawValue: canonicalRawValue)
    }

    static func percent(_ value: Decimal, canonicalRawValue: String? = nil) -> String {
        if let canonicalRawValue {
            return exactPercent(canonicalRawValue)
        }
        let formatter = NumberFormatter()
        formatter.locale = .autoupdatingCurrent
        formatter.numberStyle = .percent
        formatter.minimumFractionDigits = 0
        formatter.maximumFractionDigits = canonicalFractionDigits(
            value,
            canonicalRawValue: canonicalRawValue
        )
        return formatter.string(from: NSDecimalNumber(decimal: value)) ?? NSDecimalNumber(decimal: value).stringValue
    }

    static func number(_ value: Decimal, canonicalRawValue: String? = nil) -> String {
        if let canonicalRawValue {
            return localizedCanonicalDecimal(canonicalRawValue)
        }
        let formatter = NumberFormatter()
        formatter.locale = .autoupdatingCurrent
        formatter.numberStyle = .decimal
        formatter.minimumFractionDigits = 0
        formatter.maximumFractionDigits = canonicalFractionDigits(
            value,
            canonicalRawValue: canonicalRawValue
        )
        return formatter.string(from: NSDecimalNumber(decimal: value)) ?? NSDecimalNumber(decimal: value).stringValue
    }

    /// Preserve the scale of canonical base-10 strings when formatting. This
    /// keeps presentation from collapsing two distinct server financial facts
    /// into the same rounded value while still applying native separators.
    private static func canonicalFractionDigits(
        _ value: Decimal,
        canonicalRawValue: String?
    ) -> Int {
        let raw = canonicalRawValue ?? NSDecimalNumber(decimal: value).stringValue
        return raw.split(separator: ".", omittingEmptySubsequences: false).dropFirst().first?.count ?? 0
    }

    /// Calcutta strings are already canonical base-10 facts. Grouping and
    /// affixes are applied directly to their digits so Foundation Decimal's
    /// finite precision can never round a participant-visible money value.
    private static func exactCurrency(_ rawValue: String, code: String) -> String {
        let formatter = NumberFormatter()
        formatter.locale = .autoupdatingCurrent
        formatter.numberStyle = .currency
        formatter.currencyCode = code
        formatter.minimumFractionDigits = 0
        formatter.maximumFractionDigits = 0

        let negative = rawValue.hasPrefix("-")
        let magnitude = negative ? String(rawValue.dropFirst()) : rawValue
        let number = localizedCanonicalDecimal(magnitude)
        let prefix = negative
            ? (formatter.negativePrefix ?? "-")
            : (formatter.positivePrefix ?? formatter.currencySymbol ?? "\(code) ")
        let suffix = negative
            ? (formatter.negativeSuffix ?? "")
            : (formatter.positiveSuffix ?? "")
        return "\(prefix)\(number)\(suffix)"
    }

    private static func exactPercent(_ rawValue: String) -> String {
        let formatter = NumberFormatter()
        formatter.locale = .autoupdatingCurrent
        formatter.numberStyle = .percent
        let shifted = shiftCanonicalDecimal(rawValue, places: 2)
        let negative = shifted.hasPrefix("-")
        let magnitude = negative ? String(shifted.dropFirst()) : shifted
        let prefix = negative ? (formatter.negativePrefix ?? "-") : (formatter.positivePrefix ?? "")
        let suffix = negative ? (formatter.negativeSuffix ?? "%") : (formatter.positiveSuffix ?? "%")
        return "\(prefix)\(localizedCanonicalDecimal(magnitude))\(suffix)"
    }

    private static func localizedCanonicalDecimal(_ rawValue: String) -> String {
        let negative = rawValue.hasPrefix("-")
        let magnitude = negative ? String(rawValue.dropFirst()) : rawValue
        let components = magnitude.split(separator: ".", omittingEmptySubsequences: false)
        let integer = String(components[0])
        let fraction = components.count > 1 ? String(components[1]) : nil

        let formatter = NumberFormatter()
        formatter.locale = .autoupdatingCurrent
        formatter.numberStyle = .decimal
        let separator = formatter.groupingSeparator ?? ","
        let decimalSeparator = formatter.decimalSeparator ?? "."
        let grouped = groupCanonicalInteger(
            integer,
            separator: separator,
            primarySize: max(formatter.groupingSize, 3),
            secondarySize: formatter.secondaryGroupingSize
        )
        return (negative ? "-" : "") + grouped + (fraction.map { decimalSeparator + $0 } ?? "")
    }

    private static func groupCanonicalInteger(
        _ integer: String,
        separator: String,
        primarySize: Int,
        secondarySize: Int
    ) -> String {
        guard integer.count > primarySize else { return integer }
        var groups: [String] = []
        var end = integer.endIndex
        var groupSize = primarySize
        while end > integer.startIndex {
            let start = integer.index(end, offsetBy: -min(groupSize, integer.distance(from: integer.startIndex, to: end)))
            groups.append(String(integer[start..<end]))
            end = start
            if secondarySize > 0 { groupSize = secondarySize }
        }
        return groups.reversed().joined(separator: separator)
    }

    private static func shiftCanonicalDecimal(_ rawValue: String, places: Int) -> String {
        let negative = rawValue.hasPrefix("-")
        let magnitude = negative ? String(rawValue.dropFirst()) : rawValue
        let components = magnitude.split(separator: ".", omittingEmptySubsequences: false)
        let integer = String(components[0])
        let fraction = components.count > 1 ? String(components[1]) : ""
        var digits = integer + fraction
        var decimalIndex = integer.count + places
        if decimalIndex > digits.count {
            digits += String(repeating: "0", count: decimalIndex - digits.count)
        }
        if decimalIndex < 0 {
            digits = String(repeating: "0", count: -decimalIndex) + digits
            decimalIndex = 0
        }
        let split = digits.index(digits.startIndex, offsetBy: decimalIndex)
        var whole = String(digits[..<split])
        let remainder = String(digits[split...])
        whole = String(whole.drop(while: { $0 == "0" }))
        if whole.isEmpty { whole = "0" }
        let shifted = remainder.isEmpty ? whole : "\(whole).\(remainder)"
        return negative ? "-\(shifted)" : shifted
    }
}

enum LeadersPresenter {
    static func score(
        participant: ParticipantSession,
        state: MobileReadState<MobileLeadersData>
    ) -> LeadersScorePresentation {
        guard let data = state.value else {
            return LeadersScorePresentation(
                availability: unavailableOrLoading(state),
                tournamentName: participant.tournament.name,
                tournamentContext: nil,
                teams: [],
                rounds: [],
                scoreMessage: nil,
                freshness: freshness(state),
                isRefreshing: state.isRefreshing
            )
        }
        let authenticatedTeamID = participant.player.team?.teamId
        let firstPlaceCount = data.teamStandings.filter { $0.rank == 1 }.count
        let isFinal = tournamentIsFinal(data.tournament.status)
        let teams = data.teamStandings.map { standing in
            team(
                standing,
                authenticatedTeamID: authenticatedTeamID,
                standingLabel: tournamentStandingLabel(
                    standing,
                    firstPlaceCount: firstPlaceCount,
                    isFinal: isFinal
                )
            )
        }
        let rounds = data.roundStandings.map { round in
            LeadersRoundPresentation(
                roundNumber: round.roundNumber,
                name: round.roundName,
                status: round.status,
                statusText: roundStatusText(round.status),
                teams: round.teamStandings.map {
                    team($0, authenticatedTeamID: authenticatedTeamID)
                }
            )
        }
        return LeadersScorePresentation(
            availability: teams.isEmpty && rounds.isEmpty ? .empty : .content,
            tournamentName: data.tournament.name,
            tournamentContext: tournamentContext(data.tournament),
            teams: teams,
            rounds: rounds,
            scoreMessage: data.teamStandings.isEmpty || !data.teamStandings.allSatisfy({ $0.points == nil })
                ? nil
                : "No points yet",
            freshness: freshness(state),
            isRefreshing: state.isRefreshing
        )
    }

    static func players(
        participant: ParticipantSession,
        state: MobileReadState<MobileLeadersData>
    ) -> LeadersPlayersPresentation {
        guard let data = state.value else {
            return LeadersPlayersPresentation(
                availability: unavailableOrLoading(state),
                players: [],
                freshness: freshness(state),
                isRefreshing: state.isRefreshing
            )
        }
        let rows = data.playerStandings.map { standing in
            LeadersPlayerPresentation(
                playerID: standing.playerId,
                rank: standing.rank,
                displayName: standing.displayName,
                teamName: standing.team.name,
                pointsText: pointsLabel(standing.points),
                pointsAccessibilityText: LeadersFormatter.pointsAccessibility(standing.points),
                record: standing.record,
                isAuthenticatedPlayer: standing.playerId == participant.player.playerId
            )
        }
        return LeadersPlayersPresentation(
            availability: rows.isEmpty ? .empty : .content,
            players: rows,
            freshness: freshness(state),
            isRefreshing: state.isRefreshing
        )
    }

    static func netSkins(
        participant: ParticipantSession,
        state: MobileReadState<MobileNetSkinsData>,
        leaders: MobileReadState<MobileLeadersData>
    ) -> LeadersNetSkinsPresentation {
        guard let data = state.value else {
            return LeadersNetSkinsPresentation(
                availability: unavailableOrLoading(state),
                state: nil,
                statusText: "Net Skins",
                message: nil,
                rounds: [],
                defaultRoundID: nil,
                freshness: freshness(state),
                isRefreshing: state.isRefreshing
            )
        }
        var names: [String: String] = [:]
        for player in leaders.value?.playerStandings ?? [] where names[player.playerId] == nil {
            names[player.playerId] = player.displayName
        }
        let roundPresentations = data.rounds.map { round in
            netSkinsRound(round, data: data, names: names)
        }
        let currentRound = leaders.value?.tournament.currentRound
        let defaultRoundID = roundPresentations.first(where: { $0.roundNumber == currentRound })?.id ??
            roundPresentations.first?.id
        return LeadersNetSkinsPresentation(
            availability: .content,
            state: data.state,
            statusText: netSkinsStateText(data.state),
            message: netSkinsMessage(data.state, hasRounds: !roundPresentations.isEmpty),
            rounds: roundPresentations,
            defaultRoundID: defaultRoundID,
            freshness: freshness(state, canonicalStale: data.freshness.stale),
            isRefreshing: state.isRefreshing
        )
    }

    static func calcutta(
        participant: ParticipantSession,
        state: MobileReadState<MobileCalcuttaData>
    ) -> LeadersCalcuttaPresentation {
        guard let data = state.value else {
            return LeadersCalcuttaPresentation(
                availability: unavailableOrLoading(state),
                state: nil,
                publicationState: nil,
                statusText: "Calcutta",
                message: nil,
                published: nil,
                freshness: freshness(state),
                isRefreshing: state.isRefreshing
            )
        }
        let published = data.publicationState == .published && data.published
            ? calcuttaPublished(data)
            : nil
        return LeadersCalcuttaPresentation(
            availability: .content,
            state: data.state,
            publicationState: data.publicationState,
            statusText: calcuttaStateText(data),
            message: calcuttaMessage(data),
            published: published,
            freshness: freshness(
                state,
                canonicalStale: data.freshness.stale || data.freshness.updating
            ),
            isRefreshing: state.isRefreshing
        )
    }

    private static func team(
        _ standing: MobileTeamStanding,
        authenticatedTeamID: String?,
        standingLabel: String? = nil
    ) -> LeadersTeamPresentation {
        LeadersTeamPresentation(
            id: standing.teamId,
            name: standing.name,
            rank: standing.rank,
            pointsText: LeadersFormatter.points(standing.points),
            pointsAccessibilityText: LeadersFormatter.pointsAccessibility(standing.points),
            record: standing.record,
            remainingMatches: standing.remainingMatches,
            standingLabel: standingLabel,
            isAuthenticatedTeam: standing.teamId == authenticatedTeamID
        )
    }

    private static func tournamentStandingLabel(
        _ standing: MobileTeamStanding,
        firstPlaceCount: Int,
        isFinal: Bool
    ) -> String? {
        guard standing.rank == 1 else { return nil }
        if firstPlaceCount > 1 { return "Tournament tied" }
        return isFinal ? "Champions" : "Leading"
    }

    private static func tournamentIsFinal(_ status: String?) -> Bool {
        guard let status else { return false }
        return switch status.trimmingCharacters(in: .whitespacesAndNewlines).uppercased() {
        case "FINAL", "FINALIZED", "COMPLETE", "COMPLETED": true
        default: false
        }
    }

    private static func pointsLabel(_ points: Double?) -> String {
        let value = LeadersFormatter.points(points)
        return value == "—" ? value : "\(value) pts"
    }

    private static func roundStatusText(_ status: MobileRoundStandingStatus) -> String {
        switch status {
        case .upcoming: "Upcoming"
        case .inProgress: "In Progress"
        case .final: "Final"
        }
    }

    private static func tournamentContext(_ tournament: MobileReadTournament) -> String? {
        [
            tournament.year.map(String.init),
            tournament.status?.trimmingCharacters(in: .whitespacesAndNewlines),
        ]
        .compactMap { value in value.flatMap { $0.isEmpty ? nil : $0 } }
        .joined(separator: " · ")
        .nilIfEmpty
    }

    private static func netSkinsRound(
        _ round: MobileNetSkinsRound,
        data: MobileNetSkinsData,
        names: [String: String]
    ) -> LeadersNetSkinsRoundPresentation {
        var entryNames: [String: String] = [:]
        for entry in round.entries where entryNames[entry.entryId] == nil {
            entryNames[entry.entryId] = entryName(entry, names: names)
        }
        let authenticatedEntries = Set(data.player.entryIds)
        let entries = round.entries.map { entry in
            LeadersNetSkinsEntryPresentation(
                id: entry.entryId,
                displayName: entryNames[entry.entryId] ?? neutralEntryName(entry),
                isAuthenticatedEntry: authenticatedEntries.contains(entry.entryId)
            )
        }
        let official = round.officialResults.map { results in
            LeadersNetSkinsOfficialPresentation(
                potText: LeadersFormatter.currency(results.pot.decimalValue),
                potAccessibilityText: LeadersFormatter.currencyAccessibility(results.pot.decimalValue),
                skinValueText: LeadersFormatter.currency(results.skinValue.decimalValue),
                skinValueAccessibilityText: LeadersFormatter.currencyAccessibility(results.skinValue.decimalValue),
                eligibleText: "\(results.eligibleCount) eligible",
                progressText: "\(results.completedHoles) of 18 holes complete",
                completedText: "\(results.skinsAwarded) \(results.skinsAwarded == 1 ? "skin" : "skins") awarded",
                skins: results.skins.map { skin in
                    LeadersNetSkinPresentation(
                        id: skin.skinId,
                        holeNumber: skin.holeNumber,
                        winnerName: entryNames[skin.winnerEntryId] ?? "Winning entry",
                        winningNetText: LeadersFormatter.number(skin.winningNetScore.decimalValue),
                        valueText: LeadersFormatter.currency(skin.skinValue.decimalValue),
                        valueAccessibilityText: LeadersFormatter.currencyAccessibility(skin.skinValue.decimalValue),
                        isAuthenticatedWinner: authenticatedEntries.contains(skin.winnerEntryId)
                    )
                },
                leaderboard: results.leaderboard.map { row in
                    LeadersNetSkinsRowPresentation(
                        id: row.entryId,
                        rankText: row.displayRank,
                        displayName: entryNames[row.entryId] ?? "Entry",
                        skinsText: "\(row.skinsWon) \(row.skinsWon == 1 ? "skin" : "skins")",
                        winningsText: LeadersFormatter.currency(row.totalWinnings.decimalValue),
                        winningsAccessibilityText: LeadersFormatter.currencyAccessibility(row.totalWinnings.decimalValue),
                        winningHolesText: row.winningHoleNumbers.isEmpty
                            ? nil
                            : "Holes \(row.winningHoleNumbers.map(String.init).joined(separator: ", "))",
                        isAuthenticatedEntry: authenticatedEntries.contains(row.entryId)
                    )
                }
            )
        }
        return LeadersNetSkinsRoundPresentation(
            id: round.roundId,
            roundNumber: round.roundNumber,
            formatText: round.format.displayName,
            state: round.state,
            statusText: netSkinsRoundStateText(round.state),
            buyInText: LeadersFormatter.currency(round.buyInPerEntry.decimalValue),
            entryCountText: "\(round.eligibleEntryCount) \(round.eligibleEntryCount == 1 ? "entry" : "entries")",
            entries: entries,
            official: official
        )
    }

    private static func entryName(
        _ entry: MobileNetSkinsEntry,
        names: [String: String]
    ) -> String {
        let resolved = entry.playerIds.compactMap { names[$0] }
        guard resolved.count == entry.playerIds.count else { return neutralEntryName(entry) }
        return resolved.joined(separator: " + ")
    }

    private static func neutralEntryName(_ entry: MobileNetSkinsEntry) -> String {
        entry.entryType == .pairing ? "Pairing" : "Individual entry"
    }

    private static func netSkinsStateText(_ state: MobileNetSkinsState) -> String {
        switch state {
        case .notConfigured: "Not Configured"
        case .configured: "Configured"
        case .inProgress: "In Progress"
        case .official: "Official"
        case .unavailable: "Unavailable"
        }
    }

    private static func netSkinsRoundStateText(_ state: MobileNetSkinsRoundState) -> String {
        switch state {
        case .configured: "Configured"
        case .inProgress: "In Progress"
        case .official: "Official"
        case .unavailable: "Unavailable"
        }
    }

    private static func netSkinsMessage(_ state: MobileNetSkinsState, hasRounds: Bool) -> String? {
        switch state {
        case .notConfigured: "Net Skins have not been configured for this tournament."
        case .configured: "Entries are configured. Official results will appear after they are published."
        case .inProgress: "Play is underway. Provisional payouts remain private until results are official."
        case .official: hasRounds ? nil : "No official Net Skins results are available."
        case .unavailable: "Official Net Skins are unavailable right now."
        }
    }

    private static func calcuttaPublished(_ data: MobileCalcuttaData) -> LeadersCalcuttaPublishedPresentation? {
        guard let market = data.market else { return nil }
        let viewerID = data.viewer.playerId
        let purchases = market.purchases.map { purchase in
            LeadersCalcuttaPurchasePresentation(
                playerID: purchase.player.playerId,
                displayName: purchase.player.displayName,
                purchasePriceText: LeadersFormatter.currency(
                    purchase.purchasePrice.decimalValue,
                    code: data.currencyCode,
                    canonicalRawValue: purchase.purchasePrice.rawValue
                ),
                purchasePriceAccessibilityText: LeadersFormatter.currencyAccessibility(
                    purchase.purchasePrice.decimalValue,
                    code: data.currencyCode,
                    canonicalRawValue: purchase.purchasePrice.rawValue
                ),
                owners: purchase.owners.map { owner in
                    LeadersCalcuttaOwnerPresentation(
                        playerID: owner.player.playerId,
                        displayName: owner.player.displayName,
                        ownershipText: LeadersFormatter.percent(
                            owner.ownershipFraction.decimalValue,
                            canonicalRawValue: owner.ownershipFraction.rawValue
                        ),
                        ownershipAccessibilityText: LeadersFormatter.percent(
                            owner.ownershipFraction.decimalValue,
                            canonicalRawValue: owner.ownershipFraction.rawValue
                        ),
                        isAuthenticatedPlayer: owner.player.playerId == viewerID
                    )
                },
                isAuthenticatedPlayer: purchase.player.playerId == viewerID
            )
        }
        let golfers = data.result?.golfers.map { golfer in
            LeadersCalcuttaGolferPresentation(
                playerID: golfer.player.playerId,
                rank: golfer.rank,
                tieSize: golfer.tieSize,
                displayName: golfer.player.displayName,
                pointsText: LeadersFormatter.number(golfer.totalPoints.decimalValue),
                tournamentValueText: LeadersFormatter.currency(golfer.tournamentValue.decimalValue, code: data.currencyCode, canonicalRawValue: golfer.tournamentValue.rawValue),
                tournamentValueAccessibilityText: LeadersFormatter.currencyAccessibility(golfer.tournamentValue.decimalValue, code: data.currencyCode, canonicalRawValue: golfer.tournamentValue.rawValue),
                guaranteedText: LeadersFormatter.currency(golfer.guaranteedWinnings.decimalValue, code: data.currencyCode, canonicalRawValue: golfer.guaranteedWinnings.rawValue),
                netProfitText: LeadersFormatter.currency(golfer.netProfit.decimalValue, code: data.currencyCode, canonicalRawValue: golfer.netProfit.rawValue),
                netProfitAccessibilityText: LeadersFormatter.currencyAccessibility(golfer.netProfit.decimalValue, code: data.currencyCode, canonicalRawValue: golfer.netProfit.rawValue),
                roiText: LeadersFormatter.percent(golfer.roi.decimalValue, canonicalRawValue: golfer.roi.rawValue),
                remainingUpsideText: LeadersFormatter.currency(golfer.remainingUpside.decimalValue, code: data.currencyCode, canonicalRawValue: golfer.remainingUpside.rawValue),
                rounds: golfer.rounds.map { round in
                    LeadersCalcuttaRoundPresentation(
                        id: round.roundId,
                        roundNumber: round.roundNumber,
                        formatText: round.format.displayName,
                        grossText: LeadersFormatter.number(round.grossScore.decimalValue),
                        netText: LeadersFormatter.number(round.netScore.decimalValue),
                        courseHandicapText: LeadersFormatter.number(round.courseHandicap.decimalValue),
                        finishText: round.tieSize > 1
                            ? "Rank \(round.rank) · Tied \(round.tieSize)"
                            : "Rank \(round.rank)",
                        pointsText: LeadersFormatter.number(round.points.decimalValue),
                        payoutFractionText: LeadersFormatter.percent(
                            round.payoutFraction.decimalValue,
                            canonicalRawValue: round.payoutFraction.rawValue
                        ),
                        guaranteedText: LeadersFormatter.currency(
                            round.guaranteedWinnings.decimalValue,
                            code: data.currencyCode,
                            canonicalRawValue: round.guaranteedWinnings.rawValue
                        )
                    )
                },
                isAuthenticatedPlayer: golfer.player.playerId == viewerID
            )
        } ?? []
        let portfolios = data.result?.portfolios.map { portfolio in
            LeadersCalcuttaPortfolioPresentation(
                ownerID: portfolio.owner.playerId,
                rank: portfolio.rank,
                ownerName: portfolio.owner.displayName,
                purchaseCostText: LeadersFormatter.currency(portfolio.purchaseCost.decimalValue, code: data.currencyCode, canonicalRawValue: portfolio.purchaseCost.rawValue),
                guaranteedText: LeadersFormatter.currency(portfolio.guaranteedWinnings.decimalValue, code: data.currencyCode, canonicalRawValue: portfolio.guaranteedWinnings.rawValue),
                tournamentValueText: LeadersFormatter.currency(portfolio.tournamentValue.decimalValue, code: data.currencyCode, canonicalRawValue: portfolio.tournamentValue.rawValue),
                netProfitText: LeadersFormatter.currency(portfolio.netProfit.decimalValue, code: data.currencyCode, canonicalRawValue: portfolio.netProfit.rawValue),
                netProfitAccessibilityText: LeadersFormatter.currencyAccessibility(portfolio.netProfit.decimalValue, code: data.currencyCode, canonicalRawValue: portfolio.netProfit.rawValue),
                roiText: LeadersFormatter.percent(portfolio.roi.decimalValue, canonicalRawValue: portfolio.roi.rawValue),
                investments: portfolio.investments.map { investment in
                    LeadersCalcuttaInvestmentPresentation(
                        playerID: investment.player.playerId,
                        displayName: investment.player.displayName,
                        ownershipText: LeadersFormatter.percent(investment.ownershipFraction.decimalValue, canonicalRawValue: investment.ownershipFraction.rawValue),
                        purchaseCostText: LeadersFormatter.currency(investment.purchaseCost.decimalValue, code: data.currencyCode, canonicalRawValue: investment.purchaseCost.rawValue),
                        guaranteedText: LeadersFormatter.currency(investment.guaranteedWinnings.decimalValue, code: data.currencyCode, canonicalRawValue: investment.guaranteedWinnings.rawValue),
                        valueText: LeadersFormatter.currency(investment.tournamentValue.decimalValue, code: data.currencyCode, canonicalRawValue: investment.tournamentValue.rawValue),
                        netProfitText: LeadersFormatter.currency(investment.netProfit.decimalValue, code: data.currencyCode, canonicalRawValue: investment.netProfit.rawValue),
                        roiText: LeadersFormatter.percent(investment.roi.decimalValue, canonicalRawValue: investment.roi.rawValue)
                    )
                },
                isAuthenticatedOwner: portfolio.owner.playerId == viewerID
            )
        } ?? []
        let resultLabel: String?
        if let result = data.result {
            resultLabel = result.tournamentComplete ? "Final Results" : "Current Projection"
        } else {
            resultLabel = nil
        }
        let completedRoundsText = data.result.map { result in
            result.completedRounds.isEmpty
                ? "No completed Rounds"
                : "Completed Rounds \(result.completedRounds.map(String.init).joined(separator: ", "))"
        }
        return LeadersCalcuttaPublishedPresentation(
            potText: LeadersFormatter.currency(market.pot.decimalValue, code: data.currencyCode, canonicalRawValue: market.pot.rawValue),
            potAccessibilityText: LeadersFormatter.currencyAccessibility(market.pot.decimalValue, code: data.currencyCode, canonicalRawValue: market.pot.rawValue),
            purchases: purchases,
            resultLabel: resultLabel,
            completedRoundsText: completedRoundsText,
            golfers: golfers,
            portfolios: portfolios
        )
    }

    private static func calcuttaStateText(_ data: MobileCalcuttaData) -> String {
        guard data.publicationState == .published else { return "Unpublished" }
        return switch data.state {
        case .notConfigured: "Not Configured"
        case .configured: "Configured"
        case .auctionComplete: "Published Market"
        case .inProgress: "Published · In Progress"
        case .official: "Published · Final"
        case .unavailable: "Published · Unavailable"
        }
    }

    private static func calcuttaMessage(_ data: MobileCalcuttaData) -> String? {
        if data.publicationState == .unpublished {
            return "Calcutta results haven’t been published yet."
        }
        if data.freshness.stale || data.freshness.updating {
            return "Published values are being refreshed by the tournament authority."
        }
        return switch data.state {
        case .notConfigured: "Calcutta has not been configured for this tournament."
        case .configured: "The Calcutta auction has not been published yet."
        case .auctionComplete: data.result == nil ? "The published market is available. Results will appear after play." : nil
        case .inProgress: "Values are current projections, not final settlement."
        case .official: "Published Calcutta results are final."
        case .unavailable: "The published market remains visible, but current results are unavailable."
        }
    }

    private static func freshness<Payload>(
        _ state: MobileReadState<Payload>,
        canonicalStale: Bool = false
    ) -> LeadersFreshnessPresentation? where Payload: Equatable & Sendable {
        let kind: LeadersFreshnessKind?
        switch state.freshness {
        case .cached: kind = .cached
        case .refreshing: kind = .refreshing
        case .stale: kind = .stale
        case .offline: kind = .offline
        case .fresh: kind = canonicalStale ? .stale : nil
        case .empty, .failed: kind = nil
        }
        return kind.map { LeadersFreshnessPresentation(kind: $0, lastValidated: state.validatedAt) }
    }

    private static func unavailableOrLoading<Payload>(
        _ state: MobileReadState<Payload>
    ) -> LeadersAvailability where Payload: Equatable & Sendable {
        switch state.freshness {
        case .empty, .refreshing: .loading
        case .cached, .fresh, .stale, .offline, .failed: .unavailable
        }
    }
}

private extension MobileScoringFormat {
    var displayName: String {
        switch self {
        case .bestBall: "Best Ball"
        case .scramble: "Scramble"
        case .singles: "Singles"
        case .unknown(let value): value
        }
    }
}

private extension String {
    var nilIfEmpty: String? { isEmpty ? nil : self }
}
