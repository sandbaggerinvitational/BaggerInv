import Foundation
import XCTest
@testable import BaggerInv

final class LeadersPresentationTests: XCTestCase {
    func testScorePreservesCanonicalTeamAndRoundOrderAndUsesCanonicalTeamIdentity() {
        let participant = makeParticipant(playerID: "player-auth", teamID: "team-auth", displayName: "Same Name")
        let leaders = MobileLeadersData(
            tournament: tournament(currentRound: 2),
            teamStandings: [
                teamStanding(id: "team-other", name: "Returned First", rank: 2, points: 7),
                teamStanding(id: "team-auth", name: "Returned Second", rank: 1, points: 7.5),
            ],
            roundStandings: [
                MobileRoundStanding(
                    roundNumber: 2,
                    roundName: "Second Returned Round",
                    status: .inProgress,
                    teamStandings: [
                        teamStanding(id: "team-other", name: "Returned First", rank: 2, points: 1),
                        teamStanding(id: "team-auth", name: "Returned Second", rank: 1, points: 1.5),
                    ]
                ),
                MobileRoundStanding(
                    roundNumber: 1,
                    roundName: "First Returned Round",
                    status: .final,
                    teamStandings: [
                        teamStanding(id: "team-auth", name: "Returned Second", rank: 1, points: 3.5),
                        teamStanding(id: "team-other", name: "Returned First", rank: 2, points: 2.5),
                    ]
                ),
                MobileRoundStanding(
                    roundNumber: 3,
                    roundName: "Future Round",
                    status: .upcoming,
                    teamStandings: [teamStanding(id: "team-auth", name: "Returned Second", rank: nil, points: nil)]
                ),
            ],
            playerStandings: []
        )

        let presentation = LeadersPresenter.score(participant: participant, state: state(leaders))

        XCTAssertEqual(presentation.availability, .content)
        XCTAssertEqual(presentation.teams.map(\.id), ["team-other", "team-auth"])
        XCTAssertEqual(presentation.teams.map(\.pointsText), ["7", "7½"])
        XCTAssertEqual(presentation.teams.map(\.isAuthenticatedTeam), [false, true])
        XCTAssertEqual(presentation.teams.map(\.standingLabel), [nil, "Leading"])
        XCTAssertEqual(presentation.rounds.map(\.roundNumber), [2, 1, 3])
        XCTAssertEqual(presentation.rounds.map(\.statusText), ["In Progress", "Final", "Upcoming"])
        XCTAssertEqual(presentation.rounds[1].teams.map(\.id), ["team-auth", "team-other"])
        XCTAssertEqual(presentation.rounds[2].teams[0].pointsText, "—")
        XCTAssertEqual(presentation.rounds[2].teams[0].pointsAccessibilityText, "points unavailable")
    }

    func testTournamentOutcomeUsesOnlyCanonicalRankAndTournamentStatus() {
        let participant = makeParticipant()
        let standings = [
            teamStanding(id: "team-auth", name: "Canonical First", rank: 1, points: 8.5),
            teamStanding(id: "team-other", name: "Canonical Second", rank: 2, points: 7.5),
        ]
        let final = MobileLeadersData(
            tournament: tournament(status: "completed"),
            teamStandings: standings,
            roundStandings: [],
            playerStandings: []
        )
        let finalPresentation = LeadersPresenter.score(participant: participant, state: state(final))
        XCTAssertEqual(finalPresentation.teams.map(\.standingLabel), ["Champions", nil])

        let tied = MobileLeadersData(
            tournament: tournament(status: "Live"),
            teamStandings: standings.map {
                MobileTeamStanding(
                    rank: 1,
                    teamId: $0.teamId,
                    name: $0.name,
                    points: $0.points,
                    record: $0.record,
                    remainingMatches: $0.remainingMatches
                )
            },
            roundStandings: [],
            playerStandings: []
        )
        let tiedPresentation = LeadersPresenter.score(participant: participant, state: state(tied))
        XCTAssertEqual(tiedPresentation.teams.map(\.standingLabel), ["Tournament tied", "Tournament tied"])

        let noPoints = MobileLeadersData(
            tournament: tournament(),
            teamStandings: [
                teamStanding(id: "team-auth", name: "One", rank: nil, points: nil),
                teamStanding(id: "team-other", name: "Two", rank: nil, points: nil),
            ],
            roundStandings: [],
            playerStandings: []
        )
        XCTAssertEqual(
            LeadersPresenter.score(participant: participant, state: state(noPoints)).scoreMessage,
            "No points yet"
        )
    }

    func testPlayersPreserveCanonicalOrderAndHighlightByPlayerIDNotName() {
        let participant = makeParticipant(playerID: "player-auth", teamID: "team-auth", displayName: "Same Name")
        let data = MobileLeadersData(
            tournament: tournament(),
            teamStandings: [],
            roundStandings: [],
            playerStandings: [
                playerStanding(id: "player-other", name: "Same Name", teamID: "team-other", rank: 2, points: 3),
                playerStanding(id: "player-auth", name: "Same Name", teamID: "team-auth", rank: 1, points: 4.5),
                playerStanding(id: "player-third", name: "Third", teamID: "team-other", rank: 1, points: 4.5),
            ]
        )

        let presentation = LeadersPresenter.players(participant: participant, state: state(data))

        XCTAssertEqual(presentation.players.map(\.playerID), ["player-other", "player-auth", "player-third"])
        XCTAssertEqual(presentation.players.map(\.rank), [2, 1, 1])
        XCTAssertEqual(presentation.players.map(\.pointsText), ["3 pts", "4½ pts", "4½ pts"])
        XCTAssertEqual(presentation.players.map(\.isAuthenticatedPlayer), [false, true, false])
    }

    func testNetSkinsCanonicalStateCopyDoesNotClaimProvisionalResultsAreOfficial() {
        let participant = makeParticipant()
        let cases: [(MobileNetSkinsState, String, String?)] = [
            (.notConfigured, "Not Configured", "Net Skins have not been configured for this tournament."),
            (.configured, "Configured", "Entries are configured. Official results will appear after they are published."),
            (.inProgress, "In Progress", "Play is underway. Provisional payouts remain private until results are official."),
            (.official, "Official", "No official Net Skins results are available."),
            (.unavailable, "Unavailable", "Official Net Skins are unavailable right now."),
        ]

        for (productState, expectedStatus, expectedMessage) in cases {
            let data = netSkinsData(state: productState, rounds: [])
            let presentation = LeadersPresenter.netSkins(
                participant: participant,
                state: state(data),
                leaders: state(emptyLeaders())
            )
            XCTAssertEqual(presentation.statusText, expectedStatus)
            XCTAssertEqual(presentation.message, expectedMessage)
            XCTAssertNil(presentation.rounds.first?.official)
        }
    }

    func testNetSkinsPreservesCanonicalEntrySkinAndLeaderboardOrderAndHighlightsByEntryID() throws {
        let participant = makeParticipant(playerID: "player-auth")
        let entries = [
            netSkinsEntry(id: "entry-other", playerID: "player-other"),
            netSkinsEntry(id: "entry-auth", playerID: "player-auth"),
        ]
        let official = MobileNetSkinsOfficialResults(
            pot: canonical(200),
            eligibleCount: 2,
            completedHoles: 18,
            skinsAwarded: 2,
            skinValue: canonical(100),
            complete: true,
            finalized: true,
            skins: [
                MobileNetSkin(
                    skinId: "skin-18",
                    holeNumber: 18,
                    matchId: "match-2",
                    winnerEntryId: "entry-other",
                    winnerPlayerIds: ["player-other"],
                    winningNetScore: canonical(3),
                    skinValue: canonical(100)
                ),
                MobileNetSkin(
                    skinId: "skin-4",
                    holeNumber: 4,
                    matchId: "match-1",
                    winnerEntryId: "entry-auth",
                    winnerPlayerIds: ["player-auth"],
                    winningNetScore: canonical(2),
                    skinValue: canonical(100)
                ),
            ],
            leaderboard: [
                MobileNetSkinsLeaderboardRow(
                    rank: 2,
                    displayRank: "2",
                    entryId: "entry-other",
                    playerIds: ["player-other"],
                    skinsWon: 1,
                    totalWinnings: canonical(100),
                    winningHoleNumbers: [18]
                ),
                MobileNetSkinsLeaderboardRow(
                    rank: 1,
                    displayRank: "1",
                    entryId: "entry-auth",
                    playerIds: ["player-auth"],
                    skinsWon: 1,
                    totalWinnings: canonical(100),
                    winningHoleNumbers: [4]
                ),
            ]
        )
        let round = netSkinsRound(id: "round-2", number: 2, entries: entries, official: official)
        let leaders = MobileLeadersData(
            tournament: tournament(currentRound: 2),
            teamStandings: [],
            roundStandings: [],
            playerStandings: [
                playerStanding(id: "player-other", name: "Other Golfer", teamID: "team-other", rank: 2, points: 2),
                playerStanding(id: "player-auth", name: "Authenticated Golfer", teamID: "team-auth", rank: 1, points: 3),
            ]
        )
        let data = netSkinsData(state: .official, rounds: [round], entryIDs: ["entry-auth"])

        let presentation = LeadersPresenter.netSkins(
            participant: participant,
            state: state(data),
            leaders: state(leaders)
        )
        let presentedRound = try XCTUnwrap(presentation.rounds.first)
        let presentedOfficial = try XCTUnwrap(presentedRound.official)

        XCTAssertEqual(presentedRound.entries.map(\.id), ["entry-other", "entry-auth"])
        XCTAssertEqual(presentedRound.entries.map(\.displayName), ["Other Golfer", "Authenticated Golfer"])
        XCTAssertEqual(presentedRound.entries.map(\.isAuthenticatedEntry), [false, true])
        XCTAssertEqual(presentedOfficial.skins.map(\.id), ["skin-18", "skin-4"])
        XCTAssertEqual(presentedOfficial.skins.map(\.isAuthenticatedWinner), [false, true])
        XCTAssertEqual(presentedOfficial.leaderboard.map(\.id), ["entry-other", "entry-auth"])
        XCTAssertEqual(presentedOfficial.leaderboard.map(\.rankText), ["2", "1"])
        XCTAssertEqual(presentedOfficial.leaderboard.map(\.isAuthenticatedEntry), [false, true])
    }

    func testCalcuttaUnpublishedHidesMarketAndPublishedProjectionPreservesCanonicalOrder() throws {
        let participant = makeParticipant(playerID: "viewer")
        let unpublished = calcuttaData(
            state: .configured,
            publication: .unpublished,
            market: nil,
            result: nil,
            viewerID: "viewer"
        )
        let hidden = LeadersPresenter.calcutta(participant: participant, state: state(unpublished))
        XCTAssertEqual(hidden.statusText, "Unpublished")
        XCTAssertEqual(hidden.message, "Calcutta results haven’t been published yet.")
        XCTAssertNil(hidden.published)

        let market = MobileCalcuttaMarket(
            pot: nonnegative("1000000.125"),
            purchases: [
                purchase(playerID: "player-z", name: "Returned First", ownerID: "owner-z", ownerName: "Other Owner"),
                purchase(playerID: "viewer", name: "Returned Second", ownerID: "viewer", ownerName: "Viewer"),
            ]
        )
        let result = MobileCalcuttaResult(
            tournamentComplete: false,
            completedRounds: [2, 1],
            golfers: [
                golfer(id: "player-z", name: "Returned First", rank: 2, tieSize: 2),
                golfer(id: "viewer", name: "Returned Second", rank: 1),
            ],
            portfolios: [
                portfolio(ownerID: "owner-z", name: "Other Owner", rank: 2),
                portfolio(ownerID: "viewer", name: "Viewer", rank: 1),
            ]
        )
        let publishedData = calcuttaData(
            state: .inProgress,
            publication: .published,
            market: market,
            result: result,
            viewerID: "viewer"
        )
        let visible = LeadersPresenter.calcutta(participant: participant, state: state(publishedData))
        let published = try XCTUnwrap(visible.published)

        XCTAssertEqual(visible.statusText, "Published · In Progress")
        XCTAssertEqual(published.resultLabel, "Current Projection")
        XCTAssertEqual(published.purchases.map(\.playerID), ["player-z", "viewer"])
        XCTAssertEqual(published.purchases.map(\.isAuthenticatedPlayer), [false, true])
        XCTAssertEqual(published.golfers.map(\.playerID), ["player-z", "viewer"])
        XCTAssertEqual(published.golfers.map(\.rank), [2, 1])
        XCTAssertEqual(published.golfers.first?.tieSize, 2)
        XCTAssertEqual(published.golfers.first?.rounds.first?.grossText, "78")
        XCTAssertEqual(published.golfers.first?.rounds.first?.netText, "72")
        XCTAssertEqual(published.golfers.first?.rounds.first?.courseHandicapText, "6")
        XCTAssertEqual(published.golfers.first?.rounds.first?.finishText, "Rank 2 · Tied 2")
        XCTAssertEqual(published.golfers.first?.rounds.first?.pointsText, "2.5")
        XCTAssertEqual(published.golfers.map(\.isAuthenticatedPlayer), [false, true])
        XCTAssertEqual(published.portfolios.map(\.ownerID), ["owner-z", "viewer"])
        XCTAssertEqual(published.portfolios.map(\.rank), [2, 1])
        XCTAssertEqual(published.portfolios.map(\.isAuthenticatedOwner), [false, true])
        XCTAssertEqual(published.portfolios.first?.guaranteedText, "$60")
        XCTAssertEqual(published.portfolios.first?.investments.first?.purchaseCostText, "$50")
        XCTAssertEqual(published.portfolios.first?.investments.first?.guaranteedText, "$60")
        XCTAssertEqual(published.portfolios.first?.investments.first?.netProfitText, "$50")
        XCTAssertEqual(published.portfolios.first?.investments.first?.roiText, "100%")
        XCTAssertEqual(published.completedRoundsText, "Completed Rounds 2, 1")
        XCTAssertEqual(published.potText, LeadersFormatter.currency(nonnegative("1000000.125").decimalValue))
    }

    func testCanonicalDerivedFreshnessDoesNotOverrideTransportOfflinePrecedence() {
        let participant = makeParticipant()
        let skins = netSkinsData(state: .configured, rounds: [], stale: true)
        let freshSkins = LeadersPresenter.netSkins(
            participant: participant,
            state: state(skins),
            leaders: state(emptyLeaders())
        )
        XCTAssertEqual(freshSkins.freshness?.kind, .stale)
        let offlineSkins = LeadersPresenter.netSkins(
            participant: participant,
            state: state(skins, freshness: .offline),
            leaders: state(emptyLeaders())
        )
        XCTAssertEqual(offlineSkins.freshness?.kind, .offline)

        let calcutta = calcuttaData(
            state: .auctionComplete,
            publication: .unpublished,
            market: nil,
            result: nil,
            viewerID: participant.player.playerId,
            stale: true,
            updating: true
        )
        let freshCalcutta = LeadersPresenter.calcutta(participant: participant, state: state(calcutta))
        XCTAssertEqual(freshCalcutta.freshness?.kind, .stale)
        let offlineCalcutta = LeadersPresenter.calcutta(
            participant: participant,
            state: state(calcutta, freshness: .offline)
        )
        XCTAssertEqual(offlineCalcutta.freshness?.kind, .offline)
    }

    func testGolfAndFinancialFormattersUseHalfPointAndPrecisionSafeDecimalValues() throws {
        XCTAssertEqual(LeadersFormatter.points(8.5), "8½")
        XCTAssertEqual(LeadersFormatter.points(nil), "—")
        XCTAssertEqual(LeadersFormatter.pointsAccessibility(8.5), "8 and a half points")
        XCTAssertEqual(LeadersFormatter.pointsAccessibility(0.5), "one half point")
        XCTAssertEqual(LeadersFormatter.pointsAccessibility(nil), "points unavailable")

        let precise = try MobileNonnegativeDecimalString("12345678901234567890.123456789")
        let third = try MobileOwnershipFractionString("0.3333333333333333")
        XCTAssertEqual(
            precise.decimalValue,
            Decimal(string: precise.rawValue, locale: Locale(identifier: "en_US_POSIX"))
        )
        XCTAssertEqual(
            third.decimalValue,
            Decimal(string: third.rawValue, locale: Locale(identifier: "en_US_POSIX"))
        )
        XCTAssertFalse(LeadersFormatter.currency(precise.decimalValue).isEmpty)
        XCTAssertFalse(LeadersFormatter.percent(third.decimalValue).isEmpty)

        let exactA = try MobileNonnegativeDecimalString("16.7083333333333333")
        let exactB = try MobileNonnegativeDecimalString("16.7083334")
        XCTAssertNotEqual(
            LeadersFormatter.currency(
                exactA.decimalValue,
                canonicalRawValue: exactA.rawValue
            ),
            LeadersFormatter.currency(
                exactB.decimalValue,
                canonicalRawValue: exactB.rawValue
            )
        )
        XCTAssertTrue(
            LeadersFormatter.percent(
                third.decimalValue,
                canonicalRawValue: third.rawValue
            ).contains("33")
        )

        let hugeA = try MobileNonnegativeDecimalString(
            "123456789012345678901234567890123456789.1234567890123456789"
        )
        let hugeB = try MobileNonnegativeDecimalString(
            "123456789012345678901234567890123456789.1234567890123456788"
        )
        let hugeAText = LeadersFormatter.currency(
            hugeA.decimalValue,
            canonicalRawValue: hugeA.rawValue
        )
        let hugeBText = LeadersFormatter.currency(
            hugeB.decimalValue,
            canonicalRawValue: hugeB.rawValue
        )
        XCTAssertNotEqual(hugeAText, hugeBText)
        XCTAssertTrue(hugeAText.contains("1234567890123456789"))
        XCTAssertTrue(hugeBText.contains("1234567890123456788"))

        let negativeZero = try MobileDecimalString("-0.000")
        let negativeZeroText = LeadersFormatter.currency(
            negativeZero.decimalValue,
            canonicalRawValue: negativeZero.rawValue
        )
        XCTAssertTrue(negativeZeroText.contains("0.000"))
        XCTAssertNotEqual(
            negativeZeroText,
            LeadersFormatter.currency(.zero, canonicalRawValue: "0.000")
        )
    }

    private func state<Value>(
        _ value: Value?,
        freshness: MobileReadFreshness = .fresh
    ) -> MobileReadState<Value> where Value: Equatable & Sendable {
        MobileReadState(
            value: value,
            source: value == nil ? nil : .network,
            freshness: freshness,
            isRefreshing: freshness == .refreshing,
            revision: value == nil ? nil : "presentation-revision",
            generatedAt: value == nil ? nil : TestFixtures.readMeta.generatedAt,
            fetchedAt: value == nil ? nil : TestFixtures.now,
            validatedAt: value == nil ? nil : TestFixtures.now,
            lastSafeError: freshness == .failed ? .unavailable : nil,
            lastServerCode: nil,
            lastHTTPStatus: nil,
            cachePersistenceIssue: false
        )
    }

    private func makeParticipant(
        playerID: String = "player-auth",
        teamID: String = "team-auth",
        displayName: String = "Authenticated Golfer"
    ) -> ParticipantSession {
        ParticipantSession(
            player: ParticipantPlayer(
                playerId: playerID,
                displayName: displayName,
                team: ParticipantTeam(teamId: teamID, name: "Authenticated Team")
            ),
            tournament: ParticipantTournament(
                tournamentId: "tournament-preview",
                name: "Preview Invitational",
                year: 2026
            )
        )
    }

    private func tournament(currentRound: Int? = 2, status: String = "Live") -> MobileReadTournament {
        MobileReadTournament(
            tournamentId: "tournament-preview",
            name: "Preview Invitational",
            year: 2026,
            status: status,
            currentRound: currentRound,
            timeZone: "America/Chicago"
        )
    }

    private func teamStanding(
        id: String,
        name: String,
        rank: Int?,
        points: Double?
    ) -> MobileTeamStanding {
        MobileTeamStanding(
            rank: rank,
            teamId: id,
            name: name,
            points: points,
            record: points == nil ? "" : "2-0-0",
            remainingMatches: points == nil ? nil : 0
        )
    }

    private func playerStanding(
        id: String,
        name: String,
        teamID: String,
        rank: Int,
        points: Double
    ) -> MobilePlayerStanding {
        MobilePlayerStanding(
            rank: rank,
            playerId: id,
            displayName: name,
            team: MobileReadTeam(teamId: teamID, name: "Team \(teamID)"),
            points: points,
            record: "3-1-1"
        )
    }

    private func emptyLeaders() -> MobileLeadersData {
        MobileLeadersData(
            tournament: tournament(),
            teamStandings: [],
            roundStandings: [],
            playerStandings: []
        )
    }

    private func canonical(_ value: Decimal) -> MobileCanonicalNumber {
        try! MobileCanonicalNumber(value)
    }

    private func nonnegative(_ value: String) -> MobileNonnegativeDecimalString {
        try! MobileNonnegativeDecimalString(value)
    }

    private func signed(_ value: String) -> MobileDecimalString {
        try! MobileDecimalString(value)
    }

    private func ownership(_ value: String) -> MobileOwnershipFractionString {
        try! MobileOwnershipFractionString(value)
    }

    private func netSkinsFreshness(stale: Bool = false) -> MobileNetSkinsFreshness {
        MobileNetSkinsFreshness(
            stale: stale,
            configuredAt: try! MobileTimestamp("2026-08-28T12:00:00.000Z"),
            calculatedAt: nil,
            publishedAt: nil,
            sourceFingerprint: String(repeating: "a", count: 64)
        )
    }

    private func netSkinsEntry(id: String, playerID: String) -> MobileNetSkinsEntry {
        MobileNetSkinsEntry(
            entryId: id,
            entryType: .individual,
            matchId: "match-\(id)",
            playerIds: [playerID]
        )
    }

    private func netSkinsRound(
        id: String,
        number: Int,
        entries: [MobileNetSkinsEntry],
        official: MobileNetSkinsOfficialResults?
    ) -> MobileNetSkinsRound {
        MobileNetSkinsRound(
            roundId: id,
            roundNumber: number,
            format: .singles,
            entryType: .individual,
            matchIds: entries.map(\.matchId),
            buyInPerEntry: canonical(25),
            eligibleEntryCount: entries.count,
            eligiblePlayerIds: entries.flatMap(\.playerIds),
            state: official == nil ? .configured : .official,
            configurationRevision: 1,
            resultRevision: official == nil ? nil : 2,
            configurationFingerprint: String(repeating: "a", count: 64),
            freshness: netSkinsFreshness(),
            entries: entries,
            officialResults: official
        )
    }

    private func netSkinsData(
        state productState: MobileNetSkinsState,
        rounds: [MobileNetSkinsRound],
        entryIDs: [String] = [],
        stale: Bool = false
    ) -> MobileNetSkinsData {
        let configurationRevision = productState == .notConfigured ? 0 : 1
        let resultRevision = productState == .official ? 2 : nil
        return MobileNetSkinsData(
            contractVersion: "production-net-skins-v1",
            tournamentId: "tournament-preview",
            state: productState,
            publicationPolicy: "OFFICIAL_ONLY",
            published: productState == .official,
            configurationRevision: configurationRevision,
            resultRevision: resultRevision,
            configurationFingerprint: productState == .notConfigured ? nil : String(repeating: "a", count: 64),
            revision: "net-skins-v1:\(configurationRevision):\(resultRevision ?? 0):\(productState.rawValue)",
            freshness: netSkinsFreshness(stale: stale),
            rounds: rounds,
            player: MobileNetSkinsPlayerContext(
                playerId: "player-auth",
                eligibleRoundIds: rounds.map(\.roundId),
                entryIds: entryIDs
            )
        )
    }

    private func calcuttaFreshness(stale: Bool = false, updating: Bool = false) -> MobileCalcuttaFreshness {
        MobileCalcuttaFreshness(
            stale: stale,
            updating: updating,
            configuredAt: try! MobileTimestamp("2026-08-27T12:00:00.000Z"),
            auctionUpdatedAt: nil,
            publishedAt: nil,
            calculatedAt: nil,
            sourceFingerprint: String(repeating: "b", count: 64)
        )
    }

    private func calcuttaData(
        state productState: MobileCalcuttaState,
        publication: MobileCalcuttaPublicationState,
        market: MobileCalcuttaMarket?,
        result: MobileCalcuttaResult?,
        viewerID: String,
        stale: Bool = false,
        updating: Bool = false
    ) -> MobileCalcuttaData {
        let configured = productState != .notConfigured
        let auctioned = ![MobileCalcuttaState.notConfigured, .configured].contains(productState)
        let published = publication == .published
        let configurationRevision = configured ? 2 : 1
        let auctionRevision = auctioned ? 1 : 0
        let publicationRevision = published ? 1 : 0
        let resultRevision = result == nil ? nil : 1
        return MobileCalcuttaData(
            contractVersion: "production-calcutta-v1",
            tournamentId: "tournament-preview",
            state: productState,
            publicationState: publication,
            published: published,
            currencyCode: "USD",
            configurationRevision: configurationRevision,
            auctionRevision: auctionRevision,
            publicationRevision: publicationRevision,
            resultRevision: resultRevision,
            configurationFingerprint: configured ? String(repeating: "a", count: 64) : nil,
            auctionFingerprint: auctioned ? String(repeating: "b", count: 64) : nil,
            revision: "calcutta-v1:\(configurationRevision):\(auctionRevision):\(publicationRevision):\(resultRevision ?? 0):\(productState.rawValue):\(publication.rawValue)",
            freshness: calcuttaFreshness(stale: stale, updating: updating),
            market: market,
            result: result,
            viewer: MobileCalcuttaViewer(playerId: viewerID)
        )
    }

    private func player(_ id: String, _ name: String) -> MobileCalcuttaPlayer {
        MobileCalcuttaPlayer(playerId: id, displayName: name)
    }

    private func purchase(
        playerID: String,
        name: String,
        ownerID: String,
        ownerName: String
    ) -> MobileCalcuttaPurchase {
        MobileCalcuttaPurchase(
            player: player(playerID, name),
            purchasePrice: nonnegative("118.125"),
            owners: [
                MobileCalcuttaOwner(
                    player: player(ownerID, ownerName),
                    ownershipFraction: ownership("0.3333333333333333")
                ),
            ]
        )
    }

    private func golfer(
        id: String,
        name: String,
        rank: Int,
        tieSize: Int = 1
    ) -> MobileCalcuttaGolfer {
        MobileCalcuttaGolfer(
            rank: rank,
            tieSize: tieSize,
            player: player(id, name),
            rounds: [
                MobileCalcuttaRoundResult(
                    roundId: "round-1-\(id)",
                    roundNumber: 1,
                    format: .singles,
                    grossScore: canonical(78),
                    netScore: canonical(72),
                    courseHandicap: canonical(6),
                    rank: rank,
                    tieSize: tieSize,
                    points: canonical(2.5),
                    payoutFraction: nonnegative("0.125"),
                    guaranteedWinnings: nonnegative("25.50")
                ),
            ],
            totalPoints: canonical(4.5),
            overallPayoutFraction: nonnegative("0.25"),
            totalPayoutFraction: nonnegative("0.25"),
            guaranteedWinnings: nonnegative("50.125"),
            tournamentValue: nonnegative("250.375"),
            netProfit: signed("132.25"),
            roi: signed("1.1197033898305085"),
            remainingUpside: nonnegative("200.25")
        )
    }

    private func portfolio(ownerID: String, name: String, rank: Int) -> MobileCalcuttaPortfolio {
        MobileCalcuttaPortfolio(
            rank: rank,
            owner: player(ownerID, name),
            investments: [
                MobileCalcuttaInvestment(
                    player: player("investment-\(ownerID)", "Investment"),
                    ownershipFraction: ownership("0.5"),
                    purchaseCost: nonnegative("50"),
                    guaranteedWinnings: nonnegative("60"),
                    tournamentValue: nonnegative("100"),
                    netProfit: signed("50"),
                    roi: signed("1")
                ),
            ],
            purchaseCost: nonnegative("50"),
            guaranteedWinnings: nonnegative("60"),
            tournamentValue: nonnegative("100"),
            netProfit: signed("50"),
            roi: signed("1")
        )
    }
}
