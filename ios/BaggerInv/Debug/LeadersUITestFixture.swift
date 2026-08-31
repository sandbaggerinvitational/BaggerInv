#if DEBUG
import Foundation

enum LeadersUITestVariant: String {
    case standard
    case scoreTie = "score-tie"
    case scoreFinal = "score-final"
    case cachedOffline = "cached-offline"
    case netSkinsNotConfigured = "net-skins-not-configured"
    case netSkinsConfigured = "net-skins-configured"
    case netSkinsInProgress = "net-skins-in-progress"
    case netSkinsUnavailable = "net-skins-unavailable"
    case netSkinsOfficialEmpty = "net-skins-official-empty"
    case netSkinsMultiRound = "net-skins-multi-round"
    case calcuttaUnpublished = "calcutta-unpublished"
    case calcuttaFinal = "calcutta-final"
    case publicationRevoked = "publication-revoked"
    case partialFailure = "partial-failure"
    case longContent = "long-content"
    case playersDeep = "players-deep"

    static func resolve(arguments: [String] = ProcessInfo.processInfo.arguments) -> Self {
        guard let index = arguments.firstIndex(of: "--bagger-leaders-fixture"),
              arguments.indices.contains(index + 1),
              let value = Self(rawValue: arguments[index + 1])
        else { return .standard }
        return value
    }
}

enum LeadersUITestFixtures {
    static func bundle(
        participant: ParticipantSession,
        arguments: [String] = ProcessInfo.processInfo.arguments
    ) -> LeadersFixturePresentation {
        let variant = LeadersUITestVariant.resolve(arguments: arguments)
        let leadersState = leadersState(participant: participant, variant: variant)
        let netSkinsState = netSkinsState(participant: participant, variant: variant)
        let calcuttaState = calcuttaState(participant: participant, variant: variant)
        return LeadersFixturePresentation(
            score: LeadersPresenter.score(participant: participant, state: leadersState),
            players: LeadersPresenter.players(participant: participant, state: leadersState),
            netSkins: LeadersPresenter.netSkins(
                participant: participant,
                state: netSkinsState,
                leaders: leadersState
            ),
            calcutta: LeadersPresenter.calcutta(participant: participant, state: calcuttaState),
            startingProduct: startingProduct(arguments: arguments)
        )
    }

    private static let generatedAt = try! MobileTimestamp("2026-09-24T12:00:00.000Z")
    private static let validatedAt = Date(timeIntervalSince1970: 1_800_000_000)
    private static let fingerprint = String(repeating: "a", count: 64)
    private static let sourceFingerprint = String(repeating: "b", count: 64)

    private static func startingProduct(arguments: [String]) -> LeadersProduct {
        guard let index = arguments.firstIndex(of: "--bagger-leaders-product"),
              arguments.indices.contains(index + 1),
              let product = LeadersProduct(rawValue: arguments[index + 1])
        else { return .score }
        return product
    }

    private static func leadersState(
        participant: ParticipantSession,
        variant: LeadersUITestVariant
    ) -> MobileReadState<MobileLeadersData> {
        let long = variant == .longContent
        let tied = variant == .scoreTie
        let final = variant == .scoreFinal
        let teamOne = MobileTeamStanding(
            rank: 1,
            teamId: participant.player.team?.teamId ?? "fixture-team-green",
            name: long ? "The Mighty Briny Pickle Preservation Society" : "Pines",
            points: tied ? 8 : 8.5,
            record: "7-4-1",
            remainingMatches: 2
        )
        let teamTwo = MobileTeamStanding(
            rank: tied ? 1 : 2,
            teamId: "fixture-team-gold",
            name: long ? "Long Drive Legends and Fairway Philosophers" : "Dunes",
            points: tied ? 8 : 7.5,
            record: "6-5-1",
            remainingMatches: 2
        )
        let playerStandings: [MobilePlayerStanding]
        if variant == .playersDeep {
            playerStandings = (1...11).map { rank in
                MobilePlayerStanding(
                    rank: rank,
                    playerId: "fixture-deep-player-\(rank)",
                    displayName: "Canonical Golfer \(rank)",
                    team: MobileReadTeam(
                        teamId: rank.isMultiple(of: 2) ? teamTwo.teamId : teamOne.teamId,
                        name: rank.isMultiple(of: 2) ? teamTwo.name : teamOne.name
                    ),
                    points: Double(12 - rank) / 2,
                    record: "2-1-0"
                )
            } + [
                MobilePlayerStanding(
                    rank: 12,
                    playerId: participant.player.playerId,
                    displayName: participant.player.displayName,
                    team: MobileReadTeam(teamId: teamOne.teamId, name: teamOne.name),
                    points: 0.5,
                    record: "0-2-1"
                ),
            ]
        } else {
            playerStandings = [
                MobilePlayerStanding(rank: 1, playerId: "fixture-player-b", displayName: long ? "Maximilian Alexander Montgomery-Wellington" : "Jordan Lee", team: MobileReadTeam(teamId: teamTwo.teamId, name: teamTwo.name), points: 5, record: "4-0-1"),
                MobilePlayerStanding(rank: 2, playerId: participant.player.playerId, displayName: participant.player.displayName, team: MobileReadTeam(teamId: teamOne.teamId, name: teamOne.name), points: 4.5, record: "3-1-1"),
                MobilePlayerStanding(rank: 2, playerId: "fixture-player-c", displayName: "Taylor Brooks", team: MobileReadTeam(teamId: teamTwo.teamId, name: teamTwo.name), points: 4.5, record: "3-1-1"),
                MobilePlayerStanding(rank: 4, playerId: "fixture-player-d", displayName: "Sam Rivera", team: MobileReadTeam(teamId: teamOne.teamId, name: teamOne.name), points: 3, record: "2-2-0"),
            ]
        }
        let data = MobileLeadersData(
            tournament: MobileReadTournament(
                tournamentId: participant.tournament.tournamentId,
                name: long
                    ? "The Exceptionally Long Bagger Invitational Championship Weekend"
                    : participant.tournament.name,
                year: 2026,
                status: final ? "Final" : "In Progress",
                currentRound: 2,
                timeZone: "America/Chicago"
            ),
            teamStandings: [teamOne, teamTwo],
            roundStandings: [
                MobileRoundStanding(
                    roundNumber: 1,
                    roundName: "Opening Round",
                    status: .final,
                    teamStandings: [
                        MobileTeamStanding(rank: 1, teamId: teamOne.teamId, name: teamOne.name, points: 3.5, record: "3-2-1", remainingMatches: 0),
                        MobileTeamStanding(rank: 2, teamId: teamTwo.teamId, name: teamTwo.name, points: 2.5, record: "2-3-1", remainingMatches: 0),
                    ]
                ),
                MobileRoundStanding(
                    roundNumber: 2,
                    roundName: "Moving Day",
                    status: final ? .final : .inProgress,
                    teamStandings: [
                        MobileTeamStanding(rank: 1, teamId: teamOne.teamId, name: teamOne.name, points: 2.5, record: "2-1-0", remainingMatches: 3),
                        MobileTeamStanding(rank: 2, teamId: teamTwo.teamId, name: teamTwo.name, points: 1.5, record: "1-2-0", remainingMatches: 3),
                    ]
                ),
                MobileRoundStanding(
                    roundNumber: 3,
                    roundName: "Final Round",
                    status: final ? .final : .upcoming,
                    teamStandings: final
                        ? [
                            MobileTeamStanding(rank: 1, teamId: teamOne.teamId, name: teamOne.name, points: 3, record: "3-3-0", remainingMatches: 0),
                            MobileTeamStanding(rank: 1, teamId: teamTwo.teamId, name: teamTwo.name, points: 3, record: "3-3-0", remainingMatches: 0),
                        ]
                        : [
                            MobileTeamStanding(rank: nil, teamId: teamOne.teamId, name: teamOne.name, points: nil, record: "", remainingMatches: 6),
                            MobileTeamStanding(rank: nil, teamId: teamTwo.teamId, name: teamTwo.name, points: nil, record: "", remainingMatches: 6),
                        ]
                ),
            ],
            playerStandings: playerStandings
        )
        return readState(value: data, variant: variant, revision: "fixture-leaders-revision")
    }

    private static func netSkinsState(
        participant: ParticipantSession,
        variant: LeadersUITestVariant
    ) -> MobileReadState<MobileNetSkinsData> {
        if variant == .partialFailure {
            return failedState()
        }
        let roundID = "fixture-tournament:R2"
        if variant == .netSkinsNotConfigured {
            return readState(
                value: MobileNetSkinsData(
                    contractVersion: "production-net-skins-v1",
                    tournamentId: participant.tournament.tournamentId,
                    state: .notConfigured,
                    publicationPolicy: "OFFICIAL_ONLY",
                    published: false,
                    configurationRevision: 0,
                    resultRevision: nil,
                    configurationFingerprint: nil,
                    revision: "net-skins-v1:0:0:NOT_CONFIGURED",
                    freshness: MobileNetSkinsFreshness(
                        stale: false,
                        configuredAt: nil,
                        calculatedAt: nil,
                        publishedAt: nil,
                        sourceFingerprint: nil
                    ),
                    rounds: [],
                    player: MobileNetSkinsPlayerContext(
                        playerId: participant.player.playerId,
                        eligibleRoundIds: [],
                        entryIds: []
                    )
                ),
                variant: variant,
                revision: "fixture-net-skins-not-configured"
            )
        }
        let entries = [
            MobileNetSkinsEntry(
                entryId: "fixture-entry-a",
                entryType: .individual,
                matchId: "fixture-match-a",
                playerIds: [participant.player.playerId]
            ),
            MobileNetSkinsEntry(
                entryId: "fixture-entry-b",
                entryType: .individual,
                matchId: "fixture-match-b",
                playerIds: ["fixture-player-b"]
            ),
        ]
        let official = MobileNetSkinsOfficialResults(
            pot: number(100),
            eligibleCount: 2,
            completedHoles: 18,
            skinsAwarded: variant == .netSkinsOfficialEmpty ? 0 : 2,
            skinValue: number(variant == .netSkinsOfficialEmpty ? 0 : 50),
            complete: true,
            finalized: true,
            skins: variant == .netSkinsOfficialEmpty ? [] : [
                MobileNetSkin(
                    skinId: "\(roundID):H7",
                    holeNumber: 7,
                    matchId: "fixture-match-a",
                    winnerEntryId: "fixture-entry-a",
                    winnerPlayerIds: [participant.player.playerId],
                    winningNetScore: number(-1),
                    skinValue: number(50)
                ),
                MobileNetSkin(
                    skinId: "\(roundID):H14",
                    holeNumber: 14,
                    matchId: "fixture-match-b",
                    winnerEntryId: "fixture-entry-b",
                    winnerPlayerIds: ["fixture-player-b"],
                    winningNetScore: number(0),
                    skinValue: number(50)
                ),
            ],
            leaderboard: variant == .netSkinsOfficialEmpty ? [] : [
                MobileNetSkinsLeaderboardRow(rank: 1, displayRank: "1", entryId: "fixture-entry-a", playerIds: [participant.player.playerId], skinsWon: 1, totalWinnings: number(50), winningHoleNumbers: [7]),
                MobileNetSkinsLeaderboardRow(rank: 1, displayRank: "T1", entryId: "fixture-entry-b", playerIds: ["fixture-player-b"], skinsWon: 1, totalWinnings: number(50), winningHoleNumbers: [14]),
            ]
        )
        let nonofficialState: MobileNetSkinsRoundState? = switch variant {
        case .netSkinsConfigured: .configured
        case .netSkinsInProgress: .inProgress
        case .netSkinsUnavailable: .unavailable
        default: nil
        }
        let globalState: MobileNetSkinsState = switch variant {
        case .netSkinsConfigured: .configured
        case .netSkinsInProgress: .inProgress
        case .netSkinsUnavailable: .unavailable
        default: .official
        }
        let isOfficial = nonofficialState == nil
        let freshness = MobileNetSkinsFreshness(
            stale: variant == .cachedOffline || globalState == .inProgress || globalState == .unavailable,
            configuredAt: generatedAt,
            calculatedAt: isOfficial ? generatedAt : nil,
            publishedAt: isOfficial ? generatedAt : nil,
            sourceFingerprint: sourceFingerprint
        )
        let round = MobileNetSkinsRound(
            roundId: roundID,
            roundNumber: 2,
            format: .singles,
            entryType: .individual,
            matchIds: ["fixture-match-a", "fixture-match-b"],
            buyInPerEntry: number(50),
            eligibleEntryCount: 2,
            eligiblePlayerIds: [participant.player.playerId, "fixture-player-b"],
            state: nonofficialState ?? .official,
            configurationRevision: 3,
            resultRevision: isOfficial ? 2 : nil,
            configurationFingerprint: fingerprint,
            freshness: freshness,
            entries: entries,
            officialResults: isOfficial ? official : nil
        )
        let rounds: [MobileNetSkinsRound]
        if variant == .netSkinsMultiRound {
            rounds = [
                MobileNetSkinsRound(
                    roundId: "fixture-tournament:R1",
                    roundNumber: 1,
                    format: .bestBall,
                    entryType: .individual,
                    matchIds: round.matchIds,
                    buyInPerEntry: round.buyInPerEntry,
                    eligibleEntryCount: round.eligibleEntryCount,
                    eligiblePlayerIds: round.eligiblePlayerIds,
                    state: .official,
                    configurationRevision: round.configurationRevision,
                    resultRevision: round.resultRevision,
                    configurationFingerprint: round.configurationFingerprint,
                    freshness: round.freshness,
                    entries: round.entries,
                    officialResults: official
                ),
                round,
            ]
        } else {
            rounds = [round]
        }
        let data = MobileNetSkinsData(
            contractVersion: "production-net-skins-v1",
            tournamentId: participant.tournament.tournamentId,
            state: globalState,
            publicationPolicy: "OFFICIAL_ONLY",
            published: isOfficial,
            configurationRevision: 3,
            resultRevision: isOfficial ? 2 : nil,
            configurationFingerprint: fingerprint,
            revision: "net-skins-v1:3:\(isOfficial ? 2 : 0):\(globalState.rawValue)",
            freshness: freshness,
            rounds: rounds,
            player: MobileNetSkinsPlayerContext(
                playerId: participant.player.playerId,
                eligibleRoundIds: rounds.map(\.roundId),
                entryIds: ["fixture-entry-a"]
            )
        )
        return readState(value: data, variant: variant, revision: "fixture-net-skins-revision")
    }

    private static func calcuttaState(
        participant: ParticipantSession,
        variant: LeadersUITestVariant
    ) -> MobileReadState<MobileCalcuttaData> {
        let unpublished = variant == .calcuttaUnpublished || variant == .publicationRevoked
        let final = variant == .calcuttaFinal
        let long = variant == .longContent
        let state: MobileCalcuttaState = unpublished ? .configured : final ? .official : .inProgress
        let publication: MobileCalcuttaPublicationState = unpublished ? .unpublished : .published
        let market: MobileCalcuttaMarket? = unpublished ? nil : MobileCalcuttaMarket(
            pot: money(long ? "1234567.875" : "1000.125"),
            purchases: [
                MobileCalcuttaPurchase(
                    player: MobileCalcuttaPlayer(
                        playerId: participant.player.playerId,
                        displayName: long ? "Alexandria Montgomery-Wellington the Third" : participant.player.displayName
                    ),
                    purchasePrice: money(long ? "345678.125" : "250.125"),
                    owners: [
                        MobileCalcuttaOwner(
                            player: MobileCalcuttaPlayer(
                                playerId: participant.player.playerId,
                                displayName: long ? "Alexandria Montgomery-Wellington the Third" : participant.player.displayName
                            ),
                            ownershipFraction: fraction("0.625")
                        ),
                        MobileCalcuttaOwner(
                            player: MobileCalcuttaPlayer(
                                playerId: "fixture-player-b",
                                displayName: long ? "Maximilian Alexander Montgomery-Wellington" : "Jordan Lee"
                            ),
                            ownershipFraction: fraction("0.375")
                        ),
                    ]
                ),
            ]
        )
        let result: MobileCalcuttaResult? = unpublished ? nil : MobileCalcuttaResult(
            tournamentComplete: final,
            completedRounds: final ? [1, 2, 3] : [1],
            golfers: [
                MobileCalcuttaGolfer(
                    rank: 1,
                    tieSize: 1,
                    player: MobileCalcuttaPlayer(playerId: participant.player.playerId, displayName: participant.player.displayName),
                    rounds: [
                        MobileCalcuttaRoundResult(
                            roundId: "fixture-round-1",
                            roundNumber: 1,
                            format: .singles,
                            grossScore: number(72),
                            netScore: number(70),
                            courseHandicap: number(2),
                            rank: 1,
                            tieSize: 1,
                            points: number(10),
                            payoutFraction: money("0.5"),
                            guaranteedWinnings: money("500.0625")
                        ),
                    ],
                    totalPoints: number(10),
                    overallPayoutFraction: money("0.5"),
                    totalPayoutFraction: money("0.5"),
                    guaranteedWinnings: money("500.0625"),
                    tournamentValue: money("750.1875"),
                    netProfit: signedMoney("500.0625"),
                    roi: signedMoney("2.00025"),
                    remainingUpside: money("250.125")
                ),
            ],
            portfolios: [
                MobileCalcuttaPortfolio(
                    rank: 1,
                    owner: MobileCalcuttaPlayer(playerId: participant.player.playerId, displayName: participant.player.displayName),
                    investments: [
                        MobileCalcuttaInvestment(
                            player: MobileCalcuttaPlayer(playerId: participant.player.playerId, displayName: participant.player.displayName),
                            ownershipFraction: fraction("0.625"),
                            purchaseCost: money("156.328125"),
                            guaranteedWinnings: money("312.5390625"),
                            tournamentValue: money("468.8671875"),
                            netProfit: signedMoney("312.5390625"),
                            roi: signedMoney("2.00025")
                        ),
                    ],
                    purchaseCost: money("156.328125"),
                    guaranteedWinnings: money("312.5390625"),
                    tournamentValue: money("468.8671875"),
                    netProfit: signedMoney("312.5390625"),
                    roi: signedMoney("2.00025")
                ),
            ]
        )
        let configurationRevision = unpublished ? 2 : 2
        let auctionRevision = unpublished ? 0 : 1
        let publicationRevision = unpublished ? 0 : 1
        let resultRevision: Int? = unpublished ? nil : 1
        let data = MobileCalcuttaData(
            contractVersion: "production-calcutta-v1",
            tournamentId: participant.tournament.tournamentId,
            state: state,
            publicationState: publication,
            published: !unpublished,
            currencyCode: "USD",
            configurationRevision: configurationRevision,
            auctionRevision: auctionRevision,
            publicationRevision: publicationRevision,
            resultRevision: resultRevision,
            configurationFingerprint: fingerprint,
            auctionFingerprint: unpublished ? nil : sourceFingerprint,
            revision: "calcutta-v1:\(configurationRevision):\(auctionRevision):\(publicationRevision):\(resultRevision ?? 0):\(state.rawValue):\(publication.rawValue)",
            freshness: MobileCalcuttaFreshness(
                stale: variant == .cachedOffline,
                updating: false,
                configuredAt: generatedAt,
                auctionUpdatedAt: unpublished ? nil : generatedAt,
                publishedAt: unpublished ? nil : generatedAt,
                calculatedAt: unpublished ? nil : generatedAt,
                sourceFingerprint: unpublished ? nil : sourceFingerprint
            ),
            market: market,
            result: result,
            viewer: MobileCalcuttaViewer(playerId: participant.player.playerId)
        )
        return readState(value: data, variant: variant, revision: "fixture-calcutta-revision")
    }

    private static func readState<Value: Equatable & Sendable>(
        value: Value,
        variant: LeadersUITestVariant,
        revision: String
    ) -> MobileReadState<Value> {
        let offline = variant == .cachedOffline
        return MobileReadState(
            value: value,
            source: offline ? .diskCache : .network,
            freshness: offline ? .offline : .fresh,
            isRefreshing: false,
            revision: revision,
            generatedAt: generatedAt,
            fetchedAt: validatedAt,
            validatedAt: validatedAt,
            lastSafeError: offline ? .transport : nil,
            lastServerCode: nil,
            lastHTTPStatus: offline ? nil : 200,
            cachePersistenceIssue: false
        )
    }

    private static func failedState<Value: Equatable & Sendable>() -> MobileReadState<Value> {
        MobileReadState(
            value: nil,
            source: nil,
            freshness: .failed,
            isRefreshing: false,
            revision: nil,
            generatedAt: nil,
            fetchedAt: nil,
            validatedAt: nil,
            lastSafeError: .unavailable,
            lastServerCode: .mobileAPIUnavailable,
            lastHTTPStatus: 503,
            cachePersistenceIssue: false
        )
    }

    private static func number(_ value: Decimal) -> MobileCanonicalNumber {
        try! MobileCanonicalNumber(value)
    }

    private static func money(_ value: String) -> MobileNonnegativeDecimalString {
        try! MobileNonnegativeDecimalString(value)
    }

    private static func signedMoney(_ value: String) -> MobileDecimalString {
        try! MobileDecimalString(value)
    }

    private static func fraction(_ value: String) -> MobileOwnershipFractionString {
        try! MobileOwnershipFractionString(value)
    }
}
#endif
