import Foundation
import XCTest
@testable import BaggerInv

final class MobileLeadersModelDecodingTests: XCTestCase {
    func testLeadersDecodesRoundStatusesRequiredNullsAndCanonicalOrder() throws {
        let response = try decode(
            MobileLeadersResponse.self,
            object: leadersEnvelope(rounds: [
                roundStanding(number: 3, name: "Closing Round", status: "upcoming", points: nil),
                roundStanding(number: 1, name: "Opening Round", status: "final", points: 2.5),
                roundStanding(number: 2, name: "Middle Round", status: "inProgress", points: 1.5),
            ])
        )

        XCTAssertTrue(response.isReadContractCompatible)
        XCTAssertEqual(response.data.roundStandings.map(\.roundNumber), [3, 1, 2])
        XCTAssertEqual(response.data.roundStandings.map(\.status), [.upcoming, .final, .inProgress])
        XCTAssertNil(response.data.roundStandings[0].teamStandings[0].rank)
        XCTAssertNil(response.data.roundStandings[0].teamStandings[0].points)
        XCTAssertNil(response.data.roundStandings[0].teamStandings[0].remainingMatches)
        XCTAssertEqual(response.data.roundStandings[1].teamStandings[0].points, 2.5)
    }

    func testLeadersRejectsMissingRoundStandingsAndUnknownRoundStatus() throws {
        var missing = leadersEnvelope(rounds: [])
        var missingData = try XCTUnwrap(missing["data"] as? [String: Any])
        missingData.removeValue(forKey: "roundStandings")
        missing["data"] = missingData
        XCTAssertThrowsError(try decode(MobileLeadersResponse.self, object: missing))

        let invalid = leadersEnvelope(rounds: [roundStanding(number: 1, name: "Round 1", status: "complete", points: 3)])
        XCTAssertThrowsError(try decode(MobileLeadersResponse.self, object: invalid))

        var missingNullable = leadersEnvelope(rounds: [roundStanding(number: 1, name: "Round 1", status: "upcoming", points: nil)])
        var data = try XCTUnwrap(missingNullable["data"] as? [String: Any])
        var rounds = try XCTUnwrap(data["roundStandings"] as? [[String: Any]])
        var teams = try XCTUnwrap(rounds[0]["teamStandings"] as? [[String: Any]])
        teams[0].removeValue(forKey: "points")
        rounds[0]["teamStandings"] = teams
        data["roundStandings"] = rounds
        missingNullable["data"] = data
        XCTAssertThrowsError(try decode(MobileLeadersResponse.self, object: missingNullable))
    }

    func testNetSkinsDecodesEveryCanonicalProductState() throws {
        let states: [(String, String?, Bool)] = [
            ("NOT_CONFIGURED", nil, false),
            ("CONFIGURED", "CONFIGURED", false),
            ("IN_PROGRESS", "IN_PROGRESS", false),
            ("OFFICIAL", "OFFICIAL", true),
            ("UNAVAILABLE", "UNAVAILABLE", false),
        ]

        for (state, roundState, published) in states {
            let response = try decode(
                MobileNetSkinsResponse.self,
                object: netSkinsEnvelope(state: state, roundState: roundState, published: published)
            )
            XCTAssertTrue(response.isReadContractCompatible, state)
            XCTAssertEqual(response.data.state.rawValue, state)
            XCTAssertEqual(response.data.published, published)
        }
    }

    func testNetSkinsRejectsInvalidEnumsAndRequiredShapeAndFailsClosedOnUnsafeFacts() throws {
        var unknown = netSkinsEnvelope(state: "CONFIGURED", roundState: "CONFIGURED", published: false)
        var unknownData = try XCTUnwrap(unknown["data"] as? [String: Any])
        unknownData["state"] = "PROVISIONAL"
        unknown["data"] = unknownData
        XCTAssertThrowsError(try decode(MobileNetSkinsResponse.self, object: unknown))

        var missingRequiredNull = netSkinsEnvelope(state: "NOT_CONFIGURED", roundState: nil, published: false)
        var missingData = try XCTUnwrap(missingRequiredNull["data"] as? [String: Any])
        missingData.removeValue(forKey: "resultRevision")
        missingRequiredNull["data"] = missingData
        XCTAssertThrowsError(try decode(MobileNetSkinsResponse.self, object: missingRequiredNull))

        var wrongPolicy = netSkinsEnvelope(state: "CONFIGURED", roundState: "CONFIGURED", published: false)
        var policyData = try XCTUnwrap(wrongPolicy["data"] as? [String: Any])
        policyData["publicationPolicy"] = "PROVISIONAL"
        wrongPolicy["data"] = policyData
        XCTAssertFalse(try decode(MobileNetSkinsResponse.self, object: wrongPolicy).isReadContractCompatible)

        var officialWithoutResults = netSkinsEnvelope(state: "OFFICIAL", roundState: "OFFICIAL", published: true)
        var officialData = try XCTUnwrap(officialWithoutResults["data"] as? [String: Any])
        var rounds = try XCTUnwrap(officialData["rounds"] as? [[String: Any]])
        rounds[0]["officialResults"] = NSNull()
        officialData["rounds"] = rounds
        officialWithoutResults["data"] = officialData
        XCTAssertFalse(try decode(MobileNetSkinsResponse.self, object: officialWithoutResults).isReadContractCompatible)

        var negativeBuyIn = netSkinsEnvelope(state: "CONFIGURED", roundState: "CONFIGURED", published: false)
        var negativeData = try XCTUnwrap(negativeBuyIn["data"] as? [String: Any])
        var negativeRounds = try XCTUnwrap(negativeData["rounds"] as? [[String: Any]])
        negativeRounds[0]["buyInPerEntry"] = -1
        negativeData["rounds"] = negativeRounds
        negativeBuyIn["data"] = negativeData
        XCTAssertFalse(try decode(MobileNetSkinsResponse.self, object: negativeBuyIn).isReadContractCompatible)
    }

    func testCalcuttaUnpublishedAndPublishedLifecycleShapesDecodeCompatibly() throws {
        let notConfigured = try decode(
            MobileCalcuttaResponse.self,
            object: calcuttaEnvelope(state: "NOT_CONFIGURED", publicationState: "UNPUBLISHED", includeResult: false)
        )
        XCTAssertTrue(notConfigured.isReadContractCompatible)
        XCTAssertNil(notConfigured.data.market)
        XCTAssertNil(notConfigured.data.result)

        let configured = try decode(
            MobileCalcuttaResponse.self,
            object: calcuttaEnvelope(state: "CONFIGURED", publicationState: "UNPUBLISHED", includeResult: false)
        )
        XCTAssertTrue(configured.isReadContractCompatible)

        let auction = try decode(
            MobileCalcuttaResponse.self,
            object: calcuttaEnvelope(state: "AUCTION_COMPLETE", publicationState: "PUBLISHED", includeResult: false)
        )
        XCTAssertTrue(auction.isReadContractCompatible)
        XCTAssertNotNil(auction.data.market)
        XCTAssertNil(auction.data.result)

        let inProgress = try decode(
            MobileCalcuttaResponse.self,
            object: calcuttaEnvelope(state: "IN_PROGRESS", publicationState: "PUBLISHED", includeResult: true)
        )
        XCTAssertTrue(inProgress.isReadContractCompatible)
        XCTAssertEqual(inProgress.data.result?.tournamentComplete, false)

        let official = try decode(
            MobileCalcuttaResponse.self,
            object: calcuttaEnvelope(state: "OFFICIAL", publicationState: "PUBLISHED", includeResult: true)
        )
        XCTAssertTrue(official.isReadContractCompatible)
        XCTAssertEqual(official.data.result?.tournamentComplete, true)
    }

    func testCalcuttaAllOfRulesFailClosed() throws {
        let configuredPublished = calcuttaEnvelope(
            state: "CONFIGURED",
            publicationState: "PUBLISHED",
            includeResult: false
        )
        XCTAssertFalse(try decode(MobileCalcuttaResponse.self, object: configuredPublished).isReadContractCompatible)

        var missingAuctionFingerprint = calcuttaEnvelope(
            state: "AUCTION_COMPLETE",
            publicationState: "PUBLISHED",
            includeResult: false
        )
        var auctionData = try XCTUnwrap(missingAuctionFingerprint["data"] as? [String: Any])
        auctionData["auctionFingerprint"] = NSNull()
        missingAuctionFingerprint["data"] = auctionData
        XCTAssertFalse(try decode(MobileCalcuttaResponse.self, object: missingAuctionFingerprint).isReadContractCompatible)

        var resultWithoutRevision = calcuttaEnvelope(
            state: "IN_PROGRESS",
            publicationState: "PUBLISHED",
            includeResult: true
        )
        var resultData = try XCTUnwrap(resultWithoutRevision["data"] as? [String: Any])
        resultData["resultRevision"] = NSNull()
        resultData["revision"] = "calcutta-v1:2:1:1:0:IN_PROGRESS:PUBLISHED"
        resultWithoutRevision["data"] = resultData
        XCTAssertFalse(try decode(MobileCalcuttaResponse.self, object: resultWithoutRevision).isReadContractCompatible)

        var wrongCompletion = calcuttaEnvelope(
            state: "OFFICIAL",
            publicationState: "PUBLISHED",
            includeResult: true
        )
        var completionData = try XCTUnwrap(wrongCompletion["data"] as? [String: Any])
        var result = try XCTUnwrap(completionData["result"] as? [String: Any])
        result["tournamentComplete"] = false
        completionData["result"] = result
        wrongCompletion["data"] = completionData
        XCTAssertFalse(try decode(MobileCalcuttaResponse.self, object: wrongCompletion).isReadContractCompatible)
    }

    func testCalcuttaDecimalTypesPreserveBaseTenPrecisionAndRejectInvalidForms() throws {
        let signed = try MobileDecimalString("-12345678901234567890.123456789")
        let nonnegative = try MobileNonnegativeDecimalString("12345678901234567890.123456789")
        let fraction = try MobileOwnershipFractionString("0.3333333333333333")

        XCTAssertEqual(signed.rawValue, "-12345678901234567890.123456789")
        XCTAssertEqual(nonnegative.rawValue, "12345678901234567890.123456789")
        XCTAssertEqual(fraction.rawValue, "0.3333333333333333")
        XCTAssertEqual(signed.decimalValue, Decimal(string: signed.rawValue, locale: Locale(identifier: "en_US_POSIX")))
        XCTAssertEqual(nonnegative.decimalValue, Decimal(string: nonnegative.rawValue, locale: Locale(identifier: "en_US_POSIX")))
        XCTAssertEqual(fraction.decimalValue, Decimal(string: fraction.rawValue, locale: Locale(identifier: "en_US_POSIX")))

        XCTAssertThrowsError(try MobileDecimalString("1e3"))
        XCTAssertThrowsError(try MobileDecimalString("01.5"))
        XCTAssertThrowsError(try MobileNonnegativeDecimalString("-0.01"))
        XCTAssertThrowsError(try MobileOwnershipFractionString("0"))
        XCTAssertThrowsError(try MobileOwnershipFractionString("0.50"))
        XCTAssertThrowsError(try MobileOwnershipFractionString("1.0"))
    }

    private func decode<Response: Decodable>(_ type: Response.Type, object: [String: Any]) throws -> Response {
        let data = try JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
        return try JSONDecoder().decode(type, from: data)
    }

    private func envelope(data: [String: Any], revision: String) -> [String: Any] {
        [
            "ok": true,
            "apiVersion": "v1",
            "data": data,
            "meta": [
                "generatedAt": "2026-08-30T12:00:00.000Z",
                "revision": revision,
            ],
        ]
    }

    private func leadersEnvelope(rounds: [[String: Any]]) -> [String: Any] {
        envelope(
            data: [
                "tournament": [
                    "tournamentId": "tournament-preview",
                    "name": "Preview Invitational",
                    "year": 2026,
                    "status": "Live",
                    "currentRound": 2,
                    "timeZone": "America/Chicago",
                ],
                "teamStandings": [teamStanding(id: "team-b", name: "Returned First", rank: 2, points: 3.5)],
                "roundStandings": rounds,
                "playerStandings": [[
                    "rank": 1,
                    "playerId": "player-1",
                    "displayName": "Golfer One",
                    "team": ["teamId": "team-a", "name": "Team A"],
                    "points": 4.5,
                    "record": "4-0-1",
                ]],
            ],
            revision: "leaders-representation"
        )
    }

    private func roundStanding(number: Int, name: String, status: String, points: Double?) -> [String: Any] {
        [
            "roundNumber": number,
            "roundName": name,
            "status": status,
            "teamStandings": [teamStanding(id: "team-a", name: "Team A", rank: points == nil ? nil : 1, points: points)],
        ]
    }

    private func teamStanding(id: String, name: String, rank: Int?, points: Double?) -> [String: Any] {
        [
            "rank": rank ?? NSNull(),
            "teamId": id,
            "name": name,
            "points": points ?? NSNull(),
            "record": points == nil ? "" : "2-0-0",
            "remainingMatches": points == nil ? NSNull() : 0,
        ]
    }

    private func netSkinsEnvelope(state: String, roundState: String?, published: Bool) -> [String: Any] {
        let configurationRevision = state == "NOT_CONFIGURED" ? 0 : 1
        let resultRevision = state == "OFFICIAL" ? 2 : nil
        let fingerprint: Any = state == "NOT_CONFIGURED" ? NSNull() : String(repeating: "a", count: 64)
        let rounds: [[String: Any]] = roundState.map {
            [netSkinsRound(state: $0, official: state == "OFFICIAL")]
        } ?? []
        return envelope(
            data: [
                "contractVersion": "production-net-skins-v1",
                "tournamentId": "tournament-preview",
                "state": state,
                "publicationPolicy": "OFFICIAL_ONLY",
                "published": published,
                "configurationRevision": configurationRevision,
                "resultRevision": resultRevision ?? NSNull(),
                "configurationFingerprint": fingerprint,
                "revision": "net-skins-v1:\(configurationRevision):\(resultRevision ?? 0):\(state)",
                "freshness": netSkinsFreshness(fingerprint: fingerprint),
                "rounds": rounds,
                "player": [
                    "playerId": "player-1",
                    "eligibleRoundIds": roundState == nil ? [] : ["round-1"],
                    "entryIds": roundState == nil ? [] : ["entry-1"],
                ],
            ],
            revision: "net-skins-representation"
        )
    }

    private func netSkinsRound(state: String, official: Bool) -> [String: Any] {
        [
            "roundId": "round-1",
            "roundNumber": 1,
            "format": "SI",
            "entryType": "INDIVIDUAL",
            "matchIds": ["match-1"],
            "buyInPerEntry": 25.50,
            "eligibleEntryCount": 1,
            "eligiblePlayerIds": ["player-1"],
            "state": state,
            "configurationRevision": 1,
            "resultRevision": official ? 2 : NSNull(),
            "configurationFingerprint": String(repeating: "a", count: 64),
            "freshness": netSkinsFreshness(fingerprint: String(repeating: "b", count: 64)),
            "entries": [[
                "entryId": "entry-1",
                "entryType": "INDIVIDUAL",
                "matchId": "match-1",
                "playerIds": ["player-1"],
            ]],
            "officialResults": official ? netSkinsOfficialResults() : NSNull(),
        ]
    }

    private func netSkinsFreshness(fingerprint: Any) -> [String: Any] {
        [
            "stale": false,
            "configuredAt": "2026-08-28T12:00:00.000Z",
            "calculatedAt": NSNull(),
            "publishedAt": NSNull(),
            "sourceFingerprint": fingerprint,
        ]
    }

    private func netSkinsOfficialResults() -> [String: Any] {
        [
            "pot": 100.25,
            "eligibleCount": 1,
            "completedHoles": 18,
            "skinsAwarded": 1,
            "skinValue": 100.25,
            "complete": true,
            "finalized": true,
            "skins": [[
                "skinId": "skin-18",
                "holeNumber": 18,
                "matchId": "match-1",
                "winnerEntryId": "entry-1",
                "winnerPlayerIds": ["player-1"],
                "winningNetScore": 3,
                "skinValue": 100.25,
            ]],
            "leaderboard": [[
                "rank": 1,
                "displayRank": "1",
                "entryId": "entry-1",
                "playerIds": ["player-1"],
                "skinsWon": 1,
                "totalWinnings": 100.25,
                "winningHoleNumbers": [18],
            ]],
        ]
    }

    private func calcuttaEnvelope(
        state: String,
        publicationState: String,
        includeResult: Bool
    ) -> [String: Any] {
        let isNotConfigured = state == "NOT_CONFIGURED"
        let isConfigured = state == "CONFIGURED"
        let hasAuction = !isNotConfigured && !isConfigured
        let published = publicationState == "PUBLISHED"
        let configurationRevision = isNotConfigured ? 1 : 2
        let auctionRevision = hasAuction ? 1 : 0
        let publicationRevision = published ? 1 : 0
        let resultRevision = includeResult ? 1 : nil
        let configurationFingerprint: Any = isNotConfigured ? NSNull() : String(repeating: "c", count: 64)
        let auctionFingerprint: Any = hasAuction ? String(repeating: "d", count: 64) : NSNull()
        let result: Any = includeResult ? calcuttaResult(complete: state == "OFFICIAL") : NSNull()
        return envelope(
            data: [
                "contractVersion": "production-calcutta-v1",
                "tournamentId": "tournament-preview",
                "state": state,
                "publicationState": publicationState,
                "published": published,
                "currencyCode": "USD",
                "configurationRevision": configurationRevision,
                "auctionRevision": auctionRevision,
                "publicationRevision": publicationRevision,
                "resultRevision": resultRevision ?? NSNull(),
                "configurationFingerprint": configurationFingerprint,
                "auctionFingerprint": auctionFingerprint,
                "revision": "calcutta-v1:\(configurationRevision):\(auctionRevision):\(publicationRevision):\(resultRevision ?? 0):\(state):\(publicationState)",
                "freshness": calcuttaFreshness(fingerprint: auctionFingerprint),
                "market": published ? calcuttaMarket() : NSNull(),
                "result": result,
                "viewer": ["playerId": "player-1"],
            ],
            revision: "calcutta-representation"
        )
    }

    private func calcuttaFreshness(fingerprint: Any) -> [String: Any] {
        [
            "stale": false,
            "updating": false,
            "configuredAt": "2026-08-27T12:00:00.000Z",
            "auctionUpdatedAt": NSNull(),
            "publishedAt": NSNull(),
            "calculatedAt": NSNull(),
            "sourceFingerprint": fingerprint,
        ]
    }

    private func calcuttaMarket() -> [String: Any] {
        [
            "pot": "12345678901234567890.123456789",
            "purchases": [[
                "player": player("player-1", "Preview Golfer"),
                "purchasePrice": "118.125",
                "owners": [[
                    "player": player("owner-1", "Owner One"),
                    "ownershipFraction": "0.3333333333333333",
                ]],
            ]],
        ]
    }

    private func calcuttaResult(complete: Bool) -> [String: Any] {
        [
            "tournamentComplete": complete,
            "completedRounds": [1],
            "golfers": [[
                "rank": 1,
                "tieSize": 1,
                "player": player("player-1", "Preview Golfer"),
                "rounds": [[
                    "roundId": "round-1",
                    "roundNumber": 1,
                    "format": "SI",
                    "grossScore": 72,
                    "netScore": 69.5,
                    "courseHandicap": 3,
                    "rank": 1,
                    "tieSize": 1,
                    "points": 4.5,
                    "payoutFraction": "0.25",
                    "guaranteedWinnings": "50.125",
                ]],
                "totalPoints": 4.5,
                "overallPayoutFraction": "0.25",
                "totalPayoutFraction": "0.25",
                "guaranteedWinnings": "50.125",
                "tournamentValue": "250.375",
                "netProfit": "132.25",
                "roi": "1.1197033898305085",
                "remainingUpside": "200.25",
            ]],
            "portfolios": [[
                "rank": 1,
                "owner": player("owner-1", "Owner One"),
                "investments": [[
                    "player": player("player-1", "Preview Golfer"),
                    "ownershipFraction": "0.3333333333333333",
                    "purchaseCost": "39.375",
                    "guaranteedWinnings": "16.7083333333333333",
                    "tournamentValue": "83.4583333333333333",
                    "netProfit": "44.0833333333333333",
                    "roi": "1.1195767195767196",
                ]],
                "purchaseCost": "39.375",
                "guaranteedWinnings": "16.7083333333333333",
                "tournamentValue": "83.4583333333333333",
                "netProfit": "44.0833333333333333",
                "roi": "1.1195767195767196",
            ]],
        ]
    }

    private func player(_ id: String, _ name: String) -> [String: Any] {
        ["playerId": id, "displayName": name]
    }
}
