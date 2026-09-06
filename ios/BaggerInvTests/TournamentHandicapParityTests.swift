import Foundation
import XCTest
@testable import BaggerInv

/// Read-only verification of the real DTOs and presenters. No authentication,
/// networking, cache access, score calculation or canonical-value repair.
final class TournamentHandicapParityTests: XCTestCase {
    private struct Capture: Decodable {
        let origin: String
        let capturedAt: String
        let matchesResponse: MobileMatchesResponse
        let detailResponses: [MobileMatchDetailResponse]
    }

    private struct Audit: Encodable {
        var matches = 0
        var participantEntries = 0
        var uniquePlayers = 0
        var matchesByFormat: [String: Int] = [:]
        var participantsByFormat: [String: Int] = [:]
        var participantHandicaps: [String: Int] = [:]
        var teamHandicaps: [String: Int] = [:]
        var visibleParticipantContexts = 0
        var suppressedScrambleParticipants = 0
        var scrambleTeamContexts = 0
        var mismatches: [String] = []
    }

    func testCurrentPreviewTournamentFromExplicitReadOnlyCapture() throws {
        guard let path = ProcessInfo.processInfo.environment["BAGGER_TOURNAMENT_PARITY_CAPTURE"] else {
            throw XCTSkip("A fresh, explicitly collected Preview response capture is required.")
        }
        let capture = try JSONDecoder().decode(Capture.self, from: Data(contentsOf: URL(fileURLWithPath: path)))
        XCTAssertEqual(capture.origin, "https://native-preview.baggerinv.com")
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let capturedAt = try XCTUnwrap(formatter.date(from: capture.capturedAt))
        XCTAssertTrue((0...3600).contains(Date().timeIntervalSince(capturedAt)), "Capture must be current, not historical evidence.")
        let audit = try audit(capture.matchesResponse, details: capture.detailResponses)
        XCTAssertGreaterThan(audit.matches, 0)
        XCTAssertEqual(Set(audit.matchesByFormat.keys), Set(["BB", "SC", "SI"]))
        XCTAssertTrue(capture.matchesResponse.data.matches.contains { $0.matchId == "2026-R1-5" })
        let target = try XCTUnwrap(capture.detailResponses.first { $0.data.match.matchId == "2026-R1-5" })
        let expected: [String: (Double, Int)] = ["David Tatum": (6.9, 4), "Jupjee Kochar": (11.8, 8),
                                                "Jason Powell": (3.0, 0), "Nick Julian": (8.9, 5)]
        let targetPlayers = target.data.match.teams.flatMap(\.participants)
        XCTAssertEqual(targetPlayers.count, expected.count)
        for player in targetPlayers {
            let values = try XCTUnwrap(expected[player.displayName])
            XCTAssertEqual(player.playingHandicap, values.0)
            XCTAssertEqual(player.strokesReceived, values.1)
        }
        XCTAssertEqual(audit.mismatches, [], "Every returned Match must pass; no sampling or exclusion.")
        let output = try JSONEncoder().encode(audit)
        print("TOURNAMENT_NATIVE_HANDICAP_PARITY " + String(decoding: output, as: UTF8.self))
    }

    func testWholeTournamentAuditCoversZeroPositiveNegativeAndNullWithoutChangingValues() throws {
        let sample = try sampleTournament()
        let audit = try audit(sample.0, details: sample.1)
        XCTAssertEqual(audit.matches, 12)
        XCTAssertEqual(audit.participantEntries, 40)
        XCTAssertEqual(audit.participantHandicaps, ["zero": 10, "positive": 10, "negativePlus": 10, "null": 10])
        XCTAssertEqual(audit.suppressedScrambleParticipants, 16)
        XCTAssertEqual(audit.scrambleTeamContexts, 8)
        XCTAssertEqual(audit.visibleParticipantContexts, 24)
        XCTAssertEqual(audit.mismatches, [])
    }

    func testWholeTournamentAuditRejectsAValueMismatchEvenWhenOneDecimalDisplayAgrees() throws {
        let sample = try sampleTournament()
        var details = sample.1
        var object = try MatchDetailFixtureFactory.jsonObject(from: details[1])
        var data = try XCTUnwrap(object["data"] as? [String: Any])
        var match = try XCTUnwrap(data["match"] as? [String: Any])
        var teams = try XCTUnwrap(match["teams"] as? [[String: Any]])
        var players = try XCTUnwrap(teams[0]["participants"] as? [[String: Any]])
        players[0]["playingHandicap"] = 4.26 // Both 4.25 and 4.26 display as 4.3.
        teams[0]["participants"] = players
        match["teams"] = teams
        data["match"] = match
        object["data"] = data
        details[1] = try JSONDecoder().decode(MobileMatchDetailResponse.self, from: JSONSerialization.data(withJSONObject: object))
        let audit = try audit(sample.0, details: details)
        XCTAssertEqual(audit.matches, 12)
        XCTAssertTrue(audit.mismatches.contains { $0.contains("canonical participant HCP") })
    }

    func testWholeTournamentAuditRejectsMissingMatchInsteadOfPassingASample() throws {
        let sample = try sampleTournament()
        let audit = try audit(sample.0, details: Array(sample.1.dropLast()))
        XCTAssertTrue(audit.mismatches.contains { $0.contains("detail response count") })
        XCTAssertTrue(audit.mismatches.contains { $0.contains("exactly one Detail") })
    }

    private func audit(_ collection: MobileMatchesResponse, details: [MobileMatchDetailResponse]) throws -> Audit {
        var result = Audit()
        func check(_ passes: Bool, _ message: String) {
            if !passes { result.mismatches.append(message) }
        }
        func category(_ value: Double?) -> String {
            guard let value else { return "null" }
            return value == 0 ? "zero" : value < 0 ? "negativePlus" : "positive"
        }
        func checkContext(_ context: MatchesGolfContextPresentation?, hcp: Double?, strokes: Int?, scope: MatchesGolfContextScope, label: String) {
            check(context?.playingHandicap?.bitPattern == hcp?.bitPattern, label + " canonical context HCP")
            check(context?.strokesReceived == strokes, label + " canonical context strokes")
            if let hcp {
                let text = context?.playingHandicapText ?? ""
                let prefix = scope == .team ? "Team HCP " : "HCP "
                let pattern = hcp < 0 ? "^\\(\\d+\\.\\d\\)$" : "^\\d+\\.\\d$"
                check(text.hasPrefix(prefix), label + " HCP label")
                check(String(text.dropFirst(prefix.count)).range(of: pattern, options: .regularExpression) != nil, label + " exactly one decimal")
                check(context?.accessibilityText?.contains(HandicapDisplayFormatter.string(hcp)) == true, label + " accessible one-decimal HCP")
            } else {
                check(context?.playingHandicapText == nil, label + " missing HCP stays absent")
            }
            if let strokes {
                let expected = strokes == 0 ? "No strokes" : "+\(strokes) \(strokes == 1 ? "stroke" : "strokes")"
                check(context?.strokesText == expected, label + " stroke grammar")
            }
        }
        check(collection.isReadContractCompatible, "collection DTO compatibility")
        check(details.count == collection.data.matches.count, "detail response count")
        let encoder = JSONEncoder()
        encoder.outputFormatting = .sortedKeys
        let originalCollection = try encoder.encode(collection)
        let originalDetails = try encoder.encode(details)
        var indexState = MobileReadState<MobileMatchesData>.empty
        indexState.value = collection.data
        indexState.source = .network
        indexState.freshness = .fresh
        let index = MatchesPresenter.make(state: indexState)
        var playerIDs = Set<String>()
        for listed in collection.data.matches {
            let label = listed.matchId
            let matches = details.filter { MobileOpaqueMatchID.isEqual($0.data.match.matchId, listed.matchId) }
            check(matches.count == 1, label + " exactly one Detail")
            guard matches.count == 1, let response = matches.first else { continue }
            check(response.isReadContractCompatible, label + " Detail DTO compatibility")
            check(response.data.tournament.tournamentId == collection.data.tournament.tournamentId, label + " tournament context")
            let canonical = response.data.match
            let format = canonical.round.format.rawValue
            var detailState = MobileReadState<MobileMatchDetailData>.empty
            detailState.value = response.data
            detailState.source = .network
            detailState.freshness = .fresh
            detailState.lastHTTPStatus = 200
            let presented = try XCTUnwrap(MatchDetailPresenter.make(state: detailState, requestedMatchID: listed.matchId, now: Date()).match)
            let indexMatch = try XCTUnwrap(index.match(withID: listed.matchId))
            // The collection supplies format names while Detail supplies codes.
            // Compare the established native format types, not unlike wire strings.
            check((format == "BB" && indexMatch.format == .bestBall) ||
                  (format == "SC" && indexMatch.format == .scramble) ||
                  (format == "SI" && indexMatch.format == .singles), label + " canonical format")
            result.matches += 1
            result.matchesByFormat[format, default: 0] += 1
            check(canonical.teams.count == listed.teams.count, label + " team count")
            for team in canonical.teams {
                let listedTeam = try XCTUnwrap(listed.teams.first { $0.side == team.side && $0.teamId == team.teamId })
                let shownTeam = try XCTUnwrap(presented.teams.first { $0.side == team.side && $0.teamID == team.teamId })
                let indexTeam = try XCTUnwrap(indexMatch.teams.first { $0.side == team.side && $0.teamID == team.teamId })
                check(team.participants.count == listedTeam.participants.count, label + " participant count")
                if format == "SC" {
                    check(team.playingHandicap != nil && team.strokesReceived != nil, label + " canonical Team HCP/strokes available")
                    check(team.playingHandicap?.bitPattern == listedTeam.playingHandicap?.bitPattern, label + " canonical Team HCP")
                    check(team.strokesReceived == listedTeam.strokesReceived, label + " canonical team strokes")
                    checkContext(shownTeam.golfContext, hcp: team.playingHandicap, strokes: team.strokesReceived, scope: .team, label: label + " team \(team.side)")
                    check(shownTeam.golfContext == indexTeam.golfContext, label + " Team HCP Matches/Detail presentation")
                    result.scrambleTeamContexts += 1
                    result.teamHandicaps[category(team.playingHandicap), default: 0] += 1
                }
                for player in team.participants {
                    let playerLabel = label + " / " + player.displayName
                    let listedPlayer = try XCTUnwrap(listedTeam.participants.first { $0.playerId == player.playerId })
                    let shown = try XCTUnwrap(shownTeam.players.first { $0.playerID == player.playerId })
                    let indexPlayer = try XCTUnwrap(indexTeam.participants.first { $0.playerID == player.playerId })
                    check(player.playingHandicap?.bitPattern == listedPlayer.playingHandicap?.bitPattern, playerLabel + " canonical participant HCP")
                    check(player.strokesReceived == listedPlayer.strokesReceived, playerLabel + " canonical participant strokes")
                    check(shown.displayName == player.displayName && shown.displayName == indexPlayer.displayName, playerLabel + " canonical names")
                    playerIDs.insert(player.playerId)
                    result.participantEntries += 1
                    result.participantsByFormat[format, default: 0] += 1
                    result.participantHandicaps[category(player.playingHandicap), default: 0] += 1
                    if format == "SC" {
                        check(shown.golfContext == nil && indexPlayer.golfContext == nil, playerLabel + " Scramble individual context suppressed")
                        result.suppressedScrambleParticipants += 1
                    } else {
                        checkContext(shown.golfContext, hcp: player.playingHandicap, strokes: player.strokesReceived, scope: .participant, label: playerLabel)
                        check(shown.golfContext == indexPlayer.golfContext, playerLabel + " Matches/Detail presentation")
                        result.visibleParticipantContexts += 1
                    }
                }
            }
        }
        result.uniquePlayers = playerIDs.count
        check(try encoder.encode(collection) == originalCollection, "collection canonical values unchanged")
        check(try encoder.encode(details) == originalDetails, "Detail canonical values unchanged")
        return result
    }

    private func sampleTournament() throws -> (MobileMatchesResponse, [MobileMatchDetailResponse]) {
        var details: [MobileMatchDetailResponse] = []
        for format in [MobileScoringFormat.bestBall, .scramble, .singles] {
            for (index, handicap) in [0.0, 4.25, -2.75, nil].enumerated() {
                var object = try MatchDetailFixtureFactory.jsonObject(from: MatchDetailFixtureFactory.response(
                    format: format, status: .scheduled, matchID: "fixture-\(format.rawValue)-\(index)"
                ))
                var data = try XCTUnwrap(object["data"] as? [String: Any])
                var match = try XCTUnwrap(data["match"] as? [String: Any])
                var teams = try XCTUnwrap(match["teams"] as? [[String: Any]])
                for side in teams.indices {
                    var players = try XCTUnwrap(teams[side]["participants"] as? [[String: Any]])
                    for p in players.indices { players[p]["playingHandicap"] = handicap.map { $0 as Any } ?? NSNull() }
                    teams[side]["participants"] = players
                }
                match["teams"] = teams
                data["match"] = match
                object["data"] = data
                details.append(try JSONDecoder().decode(MobileMatchDetailResponse.self, from: JSONSerialization.data(withJSONObject: object)))
            }
        }
        let tournament = details[0].data.tournament
        let matches = details.map { response in
            let m = response.data.match
            return MobileMatchesMatch(matchId: m.matchId, displayMatchNumber: m.displayMatchNumber,
                round: MobileMatchRound(roundNumber: m.round.roundNumber, name: m.round.name, format: m.round.formatName),
                status: .scheduled, course: nil, teeTime: nil,
                teams: m.teams.map { t in MobileMatchesTeam(side: t.side, teamId: t.teamId, name: t.name,
                    playingHandicap: t.playingHandicap, strokesReceived: t.strokesReceived,
                    participants: t.participants.map { p in MobileMatchesParticipant(playerId: p.playerId, displayName: p.displayName,
                        teamSide: p.teamSide, isAuthenticatedPlayer: p.isAuthenticatedPlayer, playingHandicap: p.playingHandicap, strokesReceived: p.strokesReceived) }) },
                authenticatedPlayer: MobileAuthenticatedPlayerRelationship(involved: m.authenticatedPlayer.involved, teamSide: m.authenticatedPlayer.teamSide,
                    partnerPlayerIds: m.authenticatedPlayer.partnerPlayerIds, opponentPlayerIds: m.authenticatedPlayer.opponentPlayerIds), progress: nil, result: nil)
        }
        let collection = MobileMatchesResponse(ok: true, apiVersion: "v1", data: MobileMatchesData(
            tournament: MobileReadTournament(tournamentId: tournament.tournamentId, name: tournament.name, year: tournament.year,
                status: tournament.status, currentRound: 1, timeZone: tournament.timeZone), matches: matches), meta: details[0].meta)
        let encoded = try JSONEncoder().encode(collection)
        return (try JSONDecoder().decode(MobileMatchesResponse.self, from: encoded), details)
    }
}
