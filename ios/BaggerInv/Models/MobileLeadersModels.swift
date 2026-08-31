import Foundation

enum MobileLeadersModelError: Error, Equatable {
    case invalidDecimalString
    case invalidNonnegativeDecimalString
    case invalidOwnershipFraction
    case invalidJSONNumber
}

/// A canonical signed base-10 string. The original representation is retained
/// so Calcutta values never acquire binary floating-point authority in Swift.
struct MobileDecimalString: Codable, Equatable, Sendable {
    let rawValue: String
    let decimalValue: Decimal

    init(_ rawValue: String) throws {
        guard rawValue.range(
            of: #"^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$"#,
            options: .regularExpression
        ) != nil,
        let value = Decimal(string: rawValue, locale: Locale(identifier: "en_US_POSIX")),
        !Self.isNaN(value)
        else { throw MobileLeadersModelError.invalidDecimalString }
        self.rawValue = rawValue
        decimalValue = value
    }

    init(from decoder: any Decoder) throws {
        try self.init(decoder.singleValueContainer().decode(String.self))
    }

    func encode(to encoder: any Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(rawValue)
    }

    fileprivate static func isNaN(_ value: Decimal) -> Bool {
        var copy = value
        return NSDecimalIsNotANumber(&copy)
    }
}

struct MobileNonnegativeDecimalString: Codable, Equatable, Sendable {
    let rawValue: String
    let decimalValue: Decimal

    init(_ rawValue: String) throws {
        guard rawValue.range(
            of: #"^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$"#,
            options: .regularExpression
        ) != nil,
        let value = Decimal(string: rawValue, locale: Locale(identifier: "en_US_POSIX")),
        !MobileDecimalString.isNaN(value), value >= .zero
        else { throw MobileLeadersModelError.invalidNonnegativeDecimalString }
        self.rawValue = rawValue
        decimalValue = value
    }

    init(from decoder: any Decoder) throws {
        try self.init(decoder.singleValueContainer().decode(String.self))
    }

    func encode(to encoder: any Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(rawValue)
    }
}

struct MobileOwnershipFractionString: Codable, Equatable, Sendable {
    let rawValue: String
    let decimalValue: Decimal

    init(_ rawValue: String) throws {
        guard rawValue.range(
            of: #"^(?:1|0\.[0-9]*[1-9])$"#,
            options: .regularExpression
        ) != nil,
        let value = Decimal(string: rawValue, locale: Locale(identifier: "en_US_POSIX")),
        !MobileDecimalString.isNaN(value), value > .zero, value <= 1
        else { throw MobileLeadersModelError.invalidOwnershipFraction }
        self.rawValue = rawValue
        decimalValue = value
    }

    init(from decoder: any Decoder) throws {
        try self.init(decoder.singleValueContainer().decode(String.self))
    }

    func encode(to encoder: any Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(rawValue)
    }
}

/// A JSON number represented with Foundation Decimal. Net Skins defines its
/// money-like values as JSON numbers, so this preserves their base-10 value
/// without accepting the Calcutta string representation by accident.
struct MobileCanonicalNumber: Codable, Equatable, Sendable {
    let decimalValue: Decimal

    init(_ decimalValue: Decimal) throws {
        guard !MobileDecimalString.isNaN(decimalValue) else {
            throw MobileLeadersModelError.invalidJSONNumber
        }
        self.decimalValue = decimalValue
    }

    init(from decoder: any Decoder) throws {
        try self.init(decoder.singleValueContainer().decode(Decimal.self))
    }

    func encode(to encoder: any Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(decimalValue)
    }

    var isNonnegative: Bool { decimalValue >= .zero }
}

enum MobileNetSkinsState: String, Codable, Equatable, Sendable {
    case notConfigured = "NOT_CONFIGURED"
    case configured = "CONFIGURED"
    case inProgress = "IN_PROGRESS"
    case official = "OFFICIAL"
    case unavailable = "UNAVAILABLE"
}

enum MobileNetSkinsRoundState: String, Codable, Equatable, Sendable {
    case configured = "CONFIGURED"
    case inProgress = "IN_PROGRESS"
    case official = "OFFICIAL"
    case unavailable = "UNAVAILABLE"
}

enum MobileNetSkinsEntryType: String, Codable, Equatable, Sendable {
    case individual = "INDIVIDUAL"
    case pairing = "PAIRING"
}

struct MobileNetSkinsFreshness: Codable, Equatable, Sendable {
    let stale: Bool
    @MobileRequiredNullable var configuredAt: MobileTimestamp?
    @MobileRequiredNullable var calculatedAt: MobileTimestamp?
    @MobileRequiredNullable var publishedAt: MobileTimestamp?
    @MobileRequiredNullable var sourceFingerprint: String?

    var isStructurallyCompatible: Bool {
        sourceFingerprint.map(Self.isFingerprint) ?? true
    }

    fileprivate static func isFingerprint(_ value: String) -> Bool {
        value.range(of: #"^[0-9a-f]{64}$"#, options: .regularExpression) != nil
    }
}

struct MobileNetSkinsEntry: Codable, Equatable, Sendable {
    let entryId: String
    let entryType: MobileNetSkinsEntryType
    let matchId: String
    let playerIds: [String]

    var isStructurallyCompatible: Bool {
        !entryId.isEmpty && !matchId.isEmpty &&
        Self.validUniqueIDs(playerIds) &&
        playerIds.count == (entryType == .pairing ? 2 : 1)
    }

    fileprivate static func validUniqueIDs(_ values: [String]) -> Bool {
        values.allSatisfy { !$0.isEmpty } && Set(values).count == values.count
    }
}

struct MobileNetSkin: Codable, Equatable, Sendable {
    let skinId: String
    let holeNumber: Int
    let matchId: String
    let winnerEntryId: String
    let winnerPlayerIds: [String]
    let winningNetScore: MobileCanonicalNumber
    let skinValue: MobileCanonicalNumber

    var isStructurallyCompatible: Bool {
        !skinId.isEmpty && !matchId.isEmpty && !winnerEntryId.isEmpty &&
        (1...18).contains(holeNumber) &&
        MobileNetSkinsEntry.validUniqueIDs(winnerPlayerIds) &&
        skinValue.isNonnegative
    }
}

struct MobileNetSkinsLeaderboardRow: Codable, Equatable, Sendable {
    let rank: Int
    let displayRank: String
    let entryId: String
    let playerIds: [String]
    let skinsWon: Int
    let totalWinnings: MobileCanonicalNumber
    let winningHoleNumbers: [Int]

    var isStructurallyCompatible: Bool {
        rank >= 1 && !displayRank.isEmpty && !entryId.isEmpty &&
        MobileNetSkinsEntry.validUniqueIDs(playerIds) &&
        skinsWon >= 0 && totalWinnings.isNonnegative &&
        Set(winningHoleNumbers).count == winningHoleNumbers.count &&
        winningHoleNumbers.allSatisfy { (1...18).contains($0) }
    }
}

struct MobileNetSkinsOfficialResults: Codable, Equatable, Sendable {
    let pot: MobileCanonicalNumber
    let eligibleCount: Int
    let completedHoles: Int
    let skinsAwarded: Int
    let skinValue: MobileCanonicalNumber
    let complete: Bool
    let finalized: Bool
    let skins: [MobileNetSkin]
    let leaderboard: [MobileNetSkinsLeaderboardRow]

    var isStructurallyCompatible: Bool {
        pot.isNonnegative && eligibleCount >= 0 &&
        (0...18).contains(completedHoles) &&
        (0...18).contains(skinsAwarded) &&
        skinValue.isNonnegative && complete && finalized &&
        skins.allSatisfy(\.isStructurallyCompatible) &&
        leaderboard.allSatisfy(\.isStructurallyCompatible)
    }
}

struct MobileNetSkinsRound: Codable, Equatable, Sendable {
    let roundId: String
    let roundNumber: Int
    let format: MobileScoringFormat
    let entryType: MobileNetSkinsEntryType
    let matchIds: [String]
    let buyInPerEntry: MobileCanonicalNumber
    let eligibleEntryCount: Int
    let eligiblePlayerIds: [String]
    let state: MobileNetSkinsRoundState
    let configurationRevision: Int
    @MobileRequiredNullable var resultRevision: Int?
    let configurationFingerprint: String
    let freshness: MobileNetSkinsFreshness
    let entries: [MobileNetSkinsEntry]
    @MobileRequiredNullable var officialResults: MobileNetSkinsOfficialResults?

    var isStructurallyCompatible: Bool {
        !roundId.isEmpty && roundNumber >= 1 && format.isSupported &&
        MobileNetSkinsEntry.validUniqueIDs(matchIds) &&
        buyInPerEntry.isNonnegative && eligibleEntryCount >= 0 &&
        MobileNetSkinsEntry.validUniqueIDs(eligiblePlayerIds) &&
        configurationRevision >= 0 && (resultRevision.map { $0 >= 0 } ?? true) &&
        MobileNetSkinsFreshness.isFingerprint(configurationFingerprint) &&
        freshness.isStructurallyCompatible &&
        entries.count == eligibleEntryCount && entries.allSatisfy(\.isStructurallyCompatible) &&
        ((state == .official) == (officialResults != nil)) &&
        (officialResults?.isStructurallyCompatible ?? true)
    }
}

private extension MobileScoringFormat {
    var isSupported: Bool {
        switch self {
        case .bestBall, .scramble, .singles: true
        case .unknown: false
        }
    }
}

struct MobileNetSkinsPlayerContext: Codable, Equatable, Sendable {
    let playerId: String
    let eligibleRoundIds: [String]
    let entryIds: [String]

    var isStructurallyCompatible: Bool {
        !playerId.isEmpty &&
        MobileNetSkinsEntry.validUniqueIDs(eligibleRoundIds) &&
        MobileNetSkinsEntry.validUniqueIDs(entryIds)
    }
}

struct MobileNetSkinsData: MobileReadPayload {
    let contractVersion: String
    let tournamentId: String
    let state: MobileNetSkinsState
    let publicationPolicy: String
    let published: Bool
    let configurationRevision: Int
    @MobileRequiredNullable var resultRevision: Int?
    @MobileRequiredNullable var configurationFingerprint: String?
    let revision: String
    let freshness: MobileNetSkinsFreshness
    let rounds: [MobileNetSkinsRound]
    let player: MobileNetSkinsPlayerContext

    var tournamentID: String { tournamentId }
    var participantPlayerID: String? { player.playerId }
    /// Each official Round is an independently revocable participant-visible
    /// representation. Comparing this set prevents an older official Round
    /// from resurfacing when another Round remains official.
    var revocableParticipantRepresentationKeys: Set<String> {
        Set(rounds.compactMap { round in
            round.state == .official ? "official-round:\(round.roundId)" : nil
        })
    }

    func isCompatible(expectedPlayerID: String) -> Bool {
        player.playerId == expectedPlayerID
    }
    var isStructurallyCompatible: Bool {
        let expectedRevision = "net-skins-v1:\(configurationRevision):\(resultRevision ?? 0):\(state.rawValue)"
        return contractVersion == "production-net-skins-v1" &&
        !tournamentId.isEmpty && publicationPolicy == "OFFICIAL_ONLY" &&
        configurationRevision >= 0 && (resultRevision.map { $0 >= 0 } ?? true) &&
        (configurationFingerprint.map(MobileNetSkinsFreshness.isFingerprint) ?? true) &&
        revision == expectedRevision && freshness.isStructurallyCompatible &&
        rounds.allSatisfy(\.isStructurallyCompatible) &&
        player.isStructurallyCompatible &&
        published == rounds.contains(where: { $0.state == .official }) &&
        (state != .official || rounds.allSatisfy { $0.state == .official })
    }
}

typealias MobileNetSkinsResponse = MobileReadResponse<MobileNetSkinsData>

enum MobileCalcuttaState: String, Codable, Equatable, Sendable {
    case notConfigured = "NOT_CONFIGURED"
    case configured = "CONFIGURED"
    case auctionComplete = "AUCTION_COMPLETE"
    case inProgress = "IN_PROGRESS"
    case official = "OFFICIAL"
    case unavailable = "UNAVAILABLE"
}

enum MobileCalcuttaPublicationState: String, Codable, Equatable, Sendable {
    case unpublished = "UNPUBLISHED"
    case published = "PUBLISHED"
}

struct MobileCalcuttaFreshness: Codable, Equatable, Sendable {
    let stale: Bool
    let updating: Bool
    @MobileRequiredNullable var configuredAt: MobileTimestamp?
    @MobileRequiredNullable var auctionUpdatedAt: MobileTimestamp?
    @MobileRequiredNullable var publishedAt: MobileTimestamp?
    @MobileRequiredNullable var calculatedAt: MobileTimestamp?
    @MobileRequiredNullable var sourceFingerprint: String?

    var isStructurallyCompatible: Bool {
        sourceFingerprint.map(MobileNetSkinsFreshness.isFingerprint) ?? true
    }
}

struct MobileCalcuttaPlayer: Codable, Equatable, Sendable {
    let playerId: String
    let displayName: String

    var isStructurallyCompatible: Bool {
        Self.isIdentifier(playerId) && !displayName.isEmpty && displayName.count <= 128
    }

    fileprivate static func isIdentifier(_ value: String) -> Bool {
        value.range(
            of: #"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$"#,
            options: .regularExpression
        ) != nil
    }
}

struct MobileCalcuttaOwner: Codable, Equatable, Sendable {
    let player: MobileCalcuttaPlayer
    let ownershipFraction: MobileOwnershipFractionString
}

struct MobileCalcuttaPurchase: Codable, Equatable, Sendable {
    let player: MobileCalcuttaPlayer
    let purchasePrice: MobileNonnegativeDecimalString
    let owners: [MobileCalcuttaOwner]

    var isStructurallyCompatible: Bool {
        player.isStructurallyCompatible &&
        (1...128).contains(owners.count) &&
        owners.allSatisfy { $0.player.isStructurallyCompatible }
    }
}

struct MobileCalcuttaMarket: Codable, Equatable, Sendable {
    let pot: MobileNonnegativeDecimalString
    let purchases: [MobileCalcuttaPurchase]

    var isStructurallyCompatible: Bool {
        (1...128).contains(purchases.count) && purchases.allSatisfy(\.isStructurallyCompatible)
    }
}

struct MobileCalcuttaRoundResult: Codable, Equatable, Sendable {
    let roundId: String
    let roundNumber: Int
    let format: MobileScoringFormat
    let grossScore: MobileCanonicalNumber
    let netScore: MobileCanonicalNumber
    let courseHandicap: MobileCanonicalNumber
    let rank: Int
    let tieSize: Int
    let points: MobileCanonicalNumber
    let payoutFraction: MobileNonnegativeDecimalString
    let guaranteedWinnings: MobileNonnegativeDecimalString

    var isStructurallyCompatible: Bool {
        MobileCalcuttaPlayer.isIdentifier(roundId) && (1...3).contains(roundNumber) &&
        format.isSupported && rank >= 1 && tieSize >= 1
    }
}

struct MobileCalcuttaGolfer: Codable, Equatable, Sendable {
    let rank: Int
    let tieSize: Int
    let player: MobileCalcuttaPlayer
    let rounds: [MobileCalcuttaRoundResult]
    let totalPoints: MobileCanonicalNumber
    let overallPayoutFraction: MobileNonnegativeDecimalString
    let totalPayoutFraction: MobileNonnegativeDecimalString
    let guaranteedWinnings: MobileNonnegativeDecimalString
    let tournamentValue: MobileNonnegativeDecimalString
    let netProfit: MobileDecimalString
    let roi: MobileDecimalString
    let remainingUpside: MobileNonnegativeDecimalString

    var isStructurallyCompatible: Bool {
        rank >= 1 && tieSize >= 1 && player.isStructurallyCompatible &&
        rounds.count <= 3 && rounds.allSatisfy(\.isStructurallyCompatible)
    }
}

struct MobileCalcuttaInvestment: Codable, Equatable, Sendable {
    let player: MobileCalcuttaPlayer
    let ownershipFraction: MobileOwnershipFractionString
    let purchaseCost: MobileNonnegativeDecimalString
    let guaranteedWinnings: MobileNonnegativeDecimalString
    let tournamentValue: MobileNonnegativeDecimalString
    let netProfit: MobileDecimalString
    let roi: MobileDecimalString
}

struct MobileCalcuttaPortfolio: Codable, Equatable, Sendable {
    let rank: Int
    let owner: MobileCalcuttaPlayer
    let investments: [MobileCalcuttaInvestment]
    let purchaseCost: MobileNonnegativeDecimalString
    let guaranteedWinnings: MobileNonnegativeDecimalString
    let tournamentValue: MobileNonnegativeDecimalString
    let netProfit: MobileDecimalString
    let roi: MobileDecimalString

    var isStructurallyCompatible: Bool {
        rank >= 1 && owner.isStructurallyCompatible &&
        (1...128).contains(investments.count) &&
        investments.allSatisfy { $0.player.isStructurallyCompatible }
    }
}

struct MobileCalcuttaResult: Codable, Equatable, Sendable {
    let tournamentComplete: Bool
    let completedRounds: [Int]
    let golfers: [MobileCalcuttaGolfer]
    let portfolios: [MobileCalcuttaPortfolio]

    var isStructurallyCompatible: Bool {
        Set(completedRounds).count == completedRounds.count &&
        completedRounds.allSatisfy { (1...3).contains($0) } &&
        (1...128).contains(golfers.count) && golfers.allSatisfy(\.isStructurallyCompatible) &&
        (1...128).contains(portfolios.count) && portfolios.allSatisfy(\.isStructurallyCompatible)
    }
}

struct MobileCalcuttaViewer: Codable, Equatable, Sendable {
    let playerId: String
}

struct MobileCalcuttaData: MobileReadPayload {
    let contractVersion: String
    let tournamentId: String
    let state: MobileCalcuttaState
    let publicationState: MobileCalcuttaPublicationState
    let published: Bool
    let currencyCode: String
    let configurationRevision: Int
    let auctionRevision: Int
    let publicationRevision: Int
    @MobileRequiredNullable var resultRevision: Int?
    @MobileRequiredNullable var configurationFingerprint: String?
    @MobileRequiredNullable var auctionFingerprint: String?
    let revision: String
    let freshness: MobileCalcuttaFreshness
    @MobileRequiredNullable var market: MobileCalcuttaMarket?
    @MobileRequiredNullable var result: MobileCalcuttaResult?
    let viewer: MobileCalcuttaViewer

    var tournamentID: String { tournamentId }
    var participantPlayerID: String? { viewer.playerId }
    var revocableParticipantRepresentationKeys: Set<String> {
        publicationState == .published ? ["published-calcutta"] : []
    }

    func isCompatible(expectedPlayerID: String) -> Bool {
        viewer.playerId == expectedPlayerID
    }
    var isStructurallyCompatible: Bool {
        let expectedRevision = "calcutta-v1:\(configurationRevision):\(auctionRevision):" +
            "\(publicationRevision):\(resultRevision ?? 0):\(state.rawValue):\(publicationState.rawValue)"
        let publicationIsSafe = publicationState == .published
            ? published && market != nil
            : !published && market == nil && result == nil
        let lifecycleIsSafe: Bool
        switch state {
        case .notConfigured:
            lifecycleIsSafe = configurationRevision == 1 && auctionRevision == 0 &&
                publicationRevision == 0 && resultRevision == nil &&
                configurationFingerprint == nil && auctionFingerprint == nil &&
                publicationState == .unpublished
        case .configured:
            lifecycleIsSafe = configurationFingerprint != nil &&
                auctionRevision == 0 && auctionFingerprint == nil && resultRevision == nil &&
                result == nil && publicationState == .unpublished
        case .auctionComplete:
            lifecycleIsSafe = configurationFingerprint != nil &&
                auctionRevision >= 1 && auctionFingerprint != nil
        case .inProgress:
            lifecycleIsSafe = configurationFingerprint != nil &&
                auctionRevision >= 1 && auctionFingerprint != nil &&
                (publicationState != .published ||
                (result != nil && result?.tournamentComplete == false)
                )
        case .official:
            lifecycleIsSafe = configurationFingerprint != nil &&
                auctionRevision >= 1 && auctionFingerprint != nil &&
                (publicationState != .published ||
                (result != nil && result?.tournamentComplete == true)
                )
        case .unavailable:
            lifecycleIsSafe = configurationFingerprint != nil &&
                auctionRevision >= 1 && auctionFingerprint != nil && result == nil
        }
        return contractVersion == "production-calcutta-v1" &&
        MobileCalcuttaPlayer.isIdentifier(tournamentId) && currencyCode == "USD" &&
        configurationRevision >= 1 && auctionRevision >= 0 && publicationRevision >= 0 &&
        (resultRevision.map { $0 >= 1 } ?? true) &&
        (configurationFingerprint.map(MobileNetSkinsFreshness.isFingerprint) ?? true) &&
        (auctionFingerprint.map(MobileNetSkinsFreshness.isFingerprint) ?? true) &&
        revision == expectedRevision && freshness.isStructurallyCompatible &&
        publicationIsSafe && lifecycleIsSafe &&
        (result == nil || resultRevision != nil) &&
        (market?.isStructurallyCompatible ?? true) &&
        (result?.isStructurallyCompatible ?? true) &&
        MobileCalcuttaPlayer.isIdentifier(viewer.playerId)
    }
}

typealias MobileCalcuttaResponse = MobileReadResponse<MobileCalcuttaData>
