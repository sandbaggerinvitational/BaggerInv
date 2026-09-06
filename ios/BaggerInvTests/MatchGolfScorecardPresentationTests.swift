import Foundation
import XCTest
@testable import BaggerInv

final class MatchGolfScorecardPresentationTests: XCTestCase {
    func testFrontAndBackPreserveNineCanonicalColumnsAndOmitInventedTotals() throws {
        let result = try grid()
        XCTAssertEqual(result.nines.map(\.id), ["front", "back"])
        XCTAssertEqual(result.nines[0].rows[0].cells.map(\.holeNumber), Array(1...9))
        XCTAssertEqual(result.nines[1].rows[0].cells.map(\.holeNumber), Array(10...18))
        XCTAssertTrue(result.nines.flatMap(\.rows).filter { $0.kind != .team }.allSatisfy { $0.cells.count == 9 })
        XCTAssertFalse(result.nines.flatMap(\.rows).contains { ["OUT", "IN", "Total"].contains($0.label) })
    }

    func testBestBallGroupsCanonicalPlayersBeforeTheirTeamNet() throws {
        let rows = try grid().nines[0].rows
        XCTAssertEqual(rows.map(\.id), [
            "holes", "par", "side.1.team", "side.1.player.0", "side.1.player.1", "side.1.net",
            "side.2.team", "side.2.player.0", "side.2.player.1", "side.2.net", "result", "status",
        ])
        let match = try presented(.bestBall)
        XCTAssertEqual(rows.filter { $0.kind == .gross }.map(\.label), match.teams.flatMap(\.players).map(\.displayName))
    }

    func testParticipantOrderComesFromTeamRatherThanHoleScoreArray() throws {
        let match = try presented(.bestBall)
        let team = match.teams[0]
        let reversed = MatchDetailTeamPresentation(side: team.side, teamID: team.teamID, name: team.name,
            golfContext: team.golfContext, players: Array(team.players.reversed()))
        let result = MatchGolfScorecardPresentation.make(scorecard: match.scorecard,
            teams: [reversed, match.teams[1]], format: .bestBall)
        let rows = result.nines[0].rows.filter { $0.kind == .gross }
        XCTAssertEqual(rows[0].label, team.players[1].displayName)
        let canonical = match.scorecard.holes[0].sideOne.playerScores.first { $0.playerID == team.players[1].playerID }
        XCTAssertEqual(rows[0].cells[0].value, canonical?.gross.map(String.init) ?? "—")
    }

    func testBestBallGrossStrokesAndNetAreExactCanonicalPassthrough() throws {
        let result = try grid(mutate: { hole in
            var side = try XCTUnwrap(hole["sideOne"] as? [String: Any])
            var players = try XCTUnwrap(side["playerScores"] as? [[String: Any]])
            players[0]["gross"] = 5
            players[0]["strokes"] = 2
            side["playerScores"] = players
            side["netScore"] = 13
            hole["sideOne"] = side
        })
        let gross = try cell(result, row: "side.1.player.0")
        XCTAssertEqual(gross.value, "5")
        XCTAssertEqual(gross.strokeMarker, "••")
        XCTAssertEqual(try cell(result, row: "side.1.net").value, "13")
        XCTAssertTrue(gross.accessibilityLabel.contains("gross 5, 2 applied strokes"))
    }

    func testZeroStrokesStayVisuallyQuietButRemainAccessible() throws {
        let result = try grid(mutate: { hole in
            var side = try XCTUnwrap(hole["sideOne"] as? [String: Any])
            var players = try XCTUnwrap(side["playerScores"] as? [[String: Any]])
            players[0]["strokes"] = 0
            side["playerScores"] = players
            hole["sideOne"] = side
        })
        let value = try cell(result, row: "side.1.player.0")
        XCTAssertNil(value.strokeMarker)
        XCTAssertTrue(value.accessibilityLabel.contains("no applied strokes"))
    }

    func testMissingGrossAndStrokeRemainUnavailableNotZero() throws {
        let result = try grid(mutate: { hole in
            var side = try XCTUnwrap(hole["sideOne"] as? [String: Any])
            var players = try XCTUnwrap(side["playerScores"] as? [[String: Any]])
            players[0]["gross"] = NSNull()
            players[0]["strokes"] = NSNull()
            side["playerScores"] = players
            hole["sideOne"] = side
        })
        let value = try cell(result, row: "side.1.player.0")
        XCTAssertEqual(value.value, "—")
        XCTAssertNil(value.strokeMarker)
        XCTAssertTrue(value.accessibilityLabel.contains("gross unavailable, applied strokes unavailable"))
    }

    func testScrambleContainsOnlyCanonicalTeamGrossAndNetRows() throws {
        let result = try grid(format: .scramble, mutate: { hole in
            var side = try XCTUnwrap(hole["sideTwo"] as? [String: Any])
            side["teamScore"] = ["gross": 7, "strokes": 2]
            side["netScore"] = -4
            hole["sideTwo"] = side
        })
        XCTAssertEqual(result.nines[0].rows.map(\.id), [
            "holes", "par", "side.1.team", "side.1.gross", "side.1.net",
            "side.2.team", "side.2.gross", "side.2.net", "result", "status",
        ])
        XCTAssertFalse(result.nines.flatMap(\.rows).contains { $0.id.contains("player") })
        XCTAssertEqual(try cell(result, row: "side.2.gross").value, "7")
        XCTAssertEqual(try cell(result, row: "side.2.gross").strokeMarker, "••")
        XCTAssertEqual(try cell(result, row: "side.2.net").value, "-4")
    }

    func testSinglesDoesNotManufacturePartnerRows() throws {
        let result = try grid(format: .singles)
        XCTAssertEqual(result.nines[0].rows.filter { $0.kind == .gross }.count, 2)
        XCTAssertFalse(result.nines.flatMap(\.rows).contains { $0.id.contains("player.1") })
    }

    func testSinglesOmitsDuplicateNetWhenAllCanonicalGrossEqualsNet() throws {
        let result = try grid(format: .singles, mutate: { hole in
            for key in ["sideOne", "sideTwo"] {
                var side = try XCTUnwrap(hole[key] as? [String: Any])
                let players = try XCTUnwrap(side["playerScores"] as? [[String: Any]])
                side["netScore"] = players[0]["gross"]
                hole[key] = side
            }
        })
        XCTAssertFalse(result.nines.flatMap(\.rows).contains { $0.kind == .net })
    }

    func testSinglesShowsUsefulCanonicalNetWithoutComputingIt() throws {
        let result = try grid(format: .singles, mutate: { hole in
            var side = try XCTUnwrap(hole["sideOne"] as? [String: Any])
            side["netScore"] = 13
            hole["sideOne"] = side
        })
        XCTAssertEqual(try cell(result, row: "side.1.net").value, "13")
        XCTAssertTrue(result.nines.allSatisfy { $0.rows.contains { $0.id == "side.1.net" } })
    }

    func testLongNamesArePreservedInAnchoredRowsAndSemanticCells() throws {
        let match = try presented(.bestBall)
        let teamName = "The Very Long Invitational Team Name Without Truncation"
        let playerName = "Christopher Bartholomew Montgomery-Wellington"
        let original = match.teams[0]
        let player = MatchDetailPlayerPresentation(playerID: original.players[0].playerID,
            displayName: playerName, isAuthenticatedPlayer: true, golfContext: original.players[0].golfContext)
        let team = MatchDetailTeamPresentation(side: 1, teamID: original.teamID, name: teamName,
            golfContext: original.golfContext, players: [player, original.players[1]])
        let result = MatchGolfScorecardPresentation.make(scorecard: match.scorecard,
            teams: [team, match.teams[1]], format: .bestBall)
        XCTAssertEqual(result.nines[0].rows.first { $0.id == "side.1.team" }?.label, teamName)
        XCTAssertEqual(result.nines[0].rows.first { $0.id == "side.1.player.0" }?.label, playerName)
        let spoken = try cell(result, row: "side.1.player.0").accessibilityLabel
        XCTAssertTrue(spoken.contains(playerName))
        XCTAssertTrue(spoken.contains(teamName))
        XCTAssertTrue(spoken.hasPrefix("Hole 1,"))
        XCTAssertTrue(spoken.contains("official"))
    }

    func testUpcomingScoresAndResultsRemainUnplayed() throws {
        let match = try presented(.bestBall, status: .scheduled)
        let result = MatchGolfScorecardPresentation.make(scorecard: match.scorecard, teams: match.teams, format: match.format)
        let score = try cell(result, row: "side.1.player.0")
        XCTAssertEqual(score.value, "—")
        XCTAssertTrue(score.accessibilityLabel.contains("not played"))
        XCTAssertEqual(try cell(result, row: "result").value, "—")
    }

    func testCanonicalResultAndRunningStateRemainAccessible() throws {
        let result = try grid(mutate: { hole in
            hole["runningResult"] = "Canonical lead 4 UP"
        })
        XCTAssertFalse(try cell(result, row: "result").accessibilityLabel.contains("Match after hole"))
        XCTAssertEqual(try cell(result, row: "status").value, "Canonical lead 4 UP")
        XCTAssertTrue(try cell(result, row: "status").accessibilityLabel.contains("Canonical lead 4 UP"))
    }

    func testVisibleRunningStatusUsesExactNamedTeamWithoutConfusingHoleWinner() throws {
        let result = try grid(mutate: { hole in
            hole["state"] = "sideTwo"
            hole["winningSide"] = 2
            hole["runningResult"] = "The Pickles 4 UP"
        })
        let status = try cell(result, row: "status")
        XCTAssertEqual(status.value, "4 UP")
        XCTAssertEqual(status.teamID, MatchDetailFixtureFactory.teamOneID)
        XCTAssertEqual(status.teamSide, 1)
        XCTAssertEqual(status.teamName, "The Pickles")
        XCTAssertEqual(status.accessibilityLabel, "Hole 1, match status, The Pickles 4 UP")
        XCTAssertEqual(try cell(result, row: "result").teamSide, 2)
    }

    func testStatusKeepsCanonicalUnknownAndAllSquareTextWithoutInferringATeam() throws {
        for canonical in ["All square", "Canonical unstructured status", " the pickles 2 UP "] {
            let result = try grid(mutate: { $0["runningResult"] = canonical })
            let status = try cell(result, row: "status")
            XCTAssertEqual(status.value, canonical)
            XCTAssertNil(status.teamID)
            XCTAssertNil(status.teamSide)
        }
    }

    func testDuplicateTeamNamesDoNotAssociateRunningStatusWithAnArbitrarySide() throws {
        let canonical = "Shared Team 4 UP"
        let match = try presented(.bestBall, mutate: { $0["runningResult"] = canonical })
        let teams = match.teams.map { team in
            MatchDetailTeamPresentation(side: team.side, teamID: team.teamID, name: "Shared Team",
                golfContext: team.golfContext, players: team.players)
        }
        let result = MatchGolfScorecardPresentation.make(scorecard: match.scorecard, teams: teams, format: .bestBall)
        let status = try cell(result, row: "status")
        XCTAssertEqual(status.value, canonical)
        XCTAssertNil(status.teamID)
        XCTAssertNil(status.teamSide)
        XCTAssertEqual(status.accessibilityLabel, "Hole 1, match status, \(canonical)")
    }

    func testOnlyTheUniqueLongestExactTeamNamePrefixMayBeCompacted() throws {
        let canonical = "Shared Team United 4 UP"
        let match = try presented(.bestBall, mutate: { $0["runningResult"] = canonical })
        let teams = zip(match.teams, ["Shared Team", "Shared Team United"]).map { team, name in
            MatchDetailTeamPresentation(side: team.side, teamID: team.teamID, name: name,
                golfContext: team.golfContext, players: team.players)
        }
        let result = MatchGolfScorecardPresentation.make(scorecard: match.scorecard, teams: teams, format: .bestBall)
        let status = try cell(result, row: "status")
        XCTAssertEqual(status.value, "4 UP")
        XCTAssertEqual(status.teamID, teams[1].teamID)
        XCTAssertEqual(status.teamSide, 2)
        XCTAssertEqual(status.accessibilityLabel, "Hole 1, match status, \(canonical)")
    }

    func testSameInitialTeamsUseDistinctSideLinkedWinnerMarkers() throws {
        let match = try presented(.bestBall, mutate: { hole in
            let side = (hole["holeNumber"] as? Int) == 2 ? 2 : 1
            hole["winningSide"] = side
            hole["state"] = side == 1 ? "sideOne" : "sideTwo"
        })
        let teams = zip(match.teams, ["Alpine Aces", "Amber Arrows"]).map { team, name in
            MatchDetailTeamPresentation(side: team.side, teamID: team.teamID, name: name,
                golfContext: team.golfContext, players: team.players)
        }
        let result = MatchGolfScorecardPresentation.make(scorecard: match.scorecard, teams: teams, format: .bestBall)
        let winners = try XCTUnwrap(result.nines[0].rows.first { $0.id == "result" }).cells
        XCTAssertEqual(winners[0].value, "1")
        XCTAssertEqual(winners[1].value, "2")
        XCTAssertNotEqual(winners[0].teamID, winners[1].teamID)
        XCTAssertEqual(winners[0].teamName, "Alpine Aces")
        XCTAssertEqual(winners[1].teamName, "Amber Arrows")
        XCTAssertEqual(result.nines[0].rows.first { $0.id == "side.1.team" }?.teamSide, 1)
        XCTAssertEqual(result.nines[0].rows.first { $0.id == "side.2.team" }?.teamSide, 2)
    }

    func testHalvedWinnerCellKeepsHalfSymbolWithoutTeamIdentity() throws {
        let result = try grid(mutate: { hole in
            hole["state"] = "halved"
            hole["winningSide"] = NSNull()
        })
        let winner = try cell(result, row: "result")
        XCTAssertEqual(winner.value, "½")
        XCTAssertNil(winner.teamID)
        XCTAssertNil(winner.teamSide)
    }

    func testPlayedSinglesMissingNetMustRemainVisibleAsUnavailable() throws {
        let result = try grid(format: .singles, mutate: { hole in
            var side = try XCTUnwrap(hole["sideOne"] as? [String: Any])
            let players = try XCTUnwrap(side["playerScores"] as? [[String: Any]])
            side["netScore"] = (hole["holeNumber"] as? Int) == 1 ? NSNull() : players[0]["gross"]
            hole["sideOne"] = side
        })
        let net = try cell(result, row: "side.1.net")
        XCTAssertEqual(net.value, "—")
        XCTAssertTrue(net.accessibilityLabel.contains("net unavailable"))
    }

    func testPlayedSinglesMissingGrossCannotProveNetDuplication() throws {
        let result = try grid(format: .singles, mutate: { hole in
            var side = try XCTUnwrap(hole["sideOne"] as? [String: Any])
            var players = try XCTUnwrap(side["playerScores"] as? [[String: Any]])
            side["netScore"] = players[0]["gross"]
            if (hole["holeNumber"] as? Int) == 1 { players[0]["gross"] = NSNull() }
            side["playerScores"] = players
            hole["sideOne"] = side
        })
        XCTAssertTrue(result.nines.allSatisfy { $0.rows.contains { $0.id == "side.1.net" } })
    }

    func testUnplayedSinglesUnknownsDoNotPreventProvenPlayedNetDuplication() throws {
        let match = try presented(.singles, status: .inProgress, mutate: { hole in
            for key in ["sideOne", "sideTwo"] {
                var side = try XCTUnwrap(hole[key] as? [String: Any])
                let players = try XCTUnwrap(side["playerScores"] as? [[String: Any]])
                side["netScore"] = players[0]["gross"]
                hole[key] = side
            }
        })
        let result = MatchGolfScorecardPresentation.make(scorecard: match.scorecard, teams: match.teams, format: .singles)
        XCTAssertFalse(result.nines.flatMap(\.rows).contains { $0.kind == .net })
    }

    func testUpcomingSinglesOmitUnsuppliedNetButKeepStatusPlaceholders() throws {
        let match = try presented(.singles, status: .scheduled)
        let result = MatchGolfScorecardPresentation.make(scorecard: match.scorecard, teams: match.teams, format: .singles)
        XCTAssertFalse(result.nines.flatMap(\.rows).contains { $0.kind == .net })
        XCTAssertEqual(try cell(result, row: "status").value, "—")
        XCTAssertTrue(try cell(result, row: "status").accessibilityLabel.contains("not played"))
    }

    func testAllFormatsAndLifecyclesKeepCanonicalScoreCells() throws {
        for format in [MobileScoringFormat.bestBall, .scramble, .singles] {
            for status in [MobileMatchStatus.scheduled, .inProgress, .completed] {
                let match = try presented(format, status: status)
                let result = MatchGolfScorecardPresentation.make(scorecard: match.scorecard,
                    teams: match.teams, format: format)
                for nine in result.nines {
                    for row in nine.rows where row.kind == .net {
                        for value in row.cells {
                            let hole = try XCTUnwrap(match.hole(number: value.holeNumber))
                            let canonical = row.id == "side.1.net" ? hole.sideOne.netScore : hole.sideTwo.netScore
                            XCTAssertEqual(value.value, canonical.map(String.init) ?? "—")
                        }
                    }
                }
            }
        }
    }

    func testUnknownFormatDoesNotInventAScorecardShape() throws {
        let match = try presented(.bestBall)
        XCTAssertTrue(MatchGolfScorecardPresentation.make(scorecard: match.scorecard,
            teams: match.teams, format: .unknown("future")).nines.isEmpty)
    }

    func testAllFormatsFrontBackUseIdenticalRowKindsAndIdentityLabels() throws {
        for format in [MobileScoringFormat.bestBall, .scramble, .singles] {
            let result = try grid(format: format)
            XCTAssertEqual(result.nines[0].rows.map(\.kind), result.nines[1].rows.map(\.kind))
            XCTAssertEqual(result.nines[0].rows.map(\.visibleLabel), result.nines[1].rows.map(\.visibleLabel))
        }
    }

    func testSinglesLockedOrderWithoutRedundantNetRows() throws {
        let result = try grid(format: .singles, mutate: { hole in
            for key in ["sideOne", "sideTwo"] {
                var side = try XCTUnwrap(hole[key] as? [String: Any])
                let players = try XCTUnwrap(side["playerScores"] as? [[String: Any]])
                side["netScore"] = players[0]["gross"]
                hole[key] = side
            }
        })
        XCTAssertEqual(result.nines[0].rows.map(\.id), ["holes", "par", "side.1.team", "side.1.player.0",
            "side.2.team", "side.2.player.0", "result", "status"])
    }

    func testScorecardHasNoHandicapLinesOrPortraitRowsInAnyFormat() throws {
        for format in [MobileScoringFormat.bestBall, .scramble, .singles] {
            let result = try grid(format: format)
            for row in result.nines.flatMap(\.rows) {
                XCTAssertFalse(row.visibleLabel.contains("HCP"))
                XCTAssertFalse(row.visibleLabel.contains("strokes"))
                XCTAssertFalse(row.id.contains("handicap"))
                XCTAssertFalse(row.id.contains("portrait"))
            }
        }
    }

    func testCanonicalStrokeCountsUseInlineDotsOrExactRaisedCount() throws {
        for (count, marker) in [(0, nil as String?), (1, "•"), (2, "••"), (3, "•••"), (4, "4"), (20, "20")] {
            let result = try grid(mutate: { hole in
                var side = try XCTUnwrap(hole["sideOne"] as? [String: Any])
                var players = try XCTUnwrap(side["playerScores"] as? [[String: Any]])
                players[0]["strokes"] = count
                side["playerScores"] = players
                hole["sideOne"] = side
            })
            let value = try cell(result, row: "side.1.player.0")
            XCTAssertEqual(value.strokeMarker, marker)
            XCTAssertFalse(value.strokeMarker?.contains("(") ?? false)
            XCTAssertFalse(value.strokeMarker?.contains("\n") ?? false)
            XCTAssertTrue(value.accessibilityLabel.contains(count == 0 ? "no applied strokes" : "\(count) applied"))
        }
    }

    func testNegativeHandicapDoesNotDeterminePerHoleMarkers() throws {
        let match = try presented(.bestBall)
        let original = match.teams[0]
        let player = original.players[0]
        let negative = MatchDetailPlayerPresentation(playerID: player.playerID, displayName: player.displayName,
            isAuthenticatedPlayer: player.isAuthenticatedPlayer,
            golfContext: MatchesGolfContextPresentation(scope: .participant, playingHandicap: -3.25, strokesReceived: 0))
        let team = MatchDetailTeamPresentation(side: original.side, teamID: original.teamID, name: original.name,
            golfContext: original.golfContext, players: [negative, original.players[1]])
        let before = MatchGolfScorecardPresentation.make(scorecard: match.scorecard, teams: match.teams, format: .bestBall)
        let after = MatchGolfScorecardPresentation.make(scorecard: match.scorecard, teams: [team, match.teams[1]], format: .bestBall)
        XCTAssertEqual(before, after)
    }

    func testResultSideMarksAreDistinctAndNeverRepeatFullTeamNames() throws {
        for side in [1, 2] {
            let result = try grid(mutate: { hole in
                hole["state"] = side == 1 ? "sideOne" : "sideTwo"
                hole["winningSide"] = side
            })
            let value = try cell(result, row: "result")
            XCTAssertEqual(value.value, String(side))
            XCTAssertEqual(value.teamSide, side)
            XCTAssertTrue(value.accessibilityLabel.contains("won the hole"))
            XCTAssertFalse(value.value.contains(value.teamName ?? "unexpected"))
        }
    }

    func testCompactStatusIsCanonicalNotCalculatedFromScores() throws {
        for text in ["AS", "1 UP", "15 UP", "7 & 6", "4 & 3", "Dormie"] {
            let result = try grid(mutate: { $0["runningResult"] = text })
            let value = try cell(result, row: "status")
            XCTAssertEqual(value.value, text)
            XCTAssertEqual(value.accessibilityLabel, "Hole 1, match status, \(text)")
        }
    }

    func testUnknownPlayedRunningStatusDoesNotInventAResult() throws {
        let result = try grid(mutate: { $0["runningResult"] = NSNull() })
        let value = try cell(result, row: "status")
        XCTAssertEqual(value.value, "—")
        XCTAssertEqual(value.accessibilityLabel, "Hole 1, match status unavailable")
    }

    func testCompactNamesChooseUnambiguousFirstNames() throws {
        let labels = try labels(for: ["Caleb Lewis", "Clay Beltran", "Jack Jones", "Patrick Smith"])
        XCTAssertEqual(labels, ["Caleb", "Clay", "Jack", "Patrick"])
    }

    func testCompactNamesResolveFirstNameCollisionsWithoutChangingIdentity() throws {
        let labels = try labels(for: ["Alex Lewis", "Alex Morgan", "Jack Jones", "Patrick Smith"])
        XCTAssertEqual(labels.prefix(2), ["Alex L.", "Alex M."])
        XCTAssertEqual(Set(labels).count, 4)
    }

    func testIdenticalNamesAndInitialsStillHaveDistinctLabels() throws {
        let labels = try labels(for: ["Alex Morgan", "Alex Morgan", "Alex Moore", "Alex Murphy"])
        XCTAssertEqual(Set(labels).count, 4)
        XCTAssertTrue(labels.allSatisfy { $0.count <= 10 })
    }

    func testLongAndNonLatinNamesHaveBoundedUnambiguousAccessibleSizeLabels() throws {
        let names = ["Christopher Bartholomew Montgomery-Wellington", "Chris Michael", "李 小龙", "Alexanderthegreat"]
        let labels = try labels(for: names, maximumLength: 5)
        XCTAssertEqual(Set(labels).count, 4)
        XCTAssertTrue(labels.allSatisfy { $0.count <= 5 })
    }

    func testLongFullCanonicalNameRemainsAccessibleWhenVisuallyAbbreviated() throws {
        let result = try grid()
        let row = try XCTUnwrap(result.nines[0].rows.first { $0.id == "side.1.player.0" })
        XCTAssertNotEqual(row.visibleLabel, row.label)
        XCTAssertTrue(row.cells[0].accessibilityLabel.contains(row.label))
        XCTAssertLessThanOrEqual(row.visibleLabel.count, 10)
    }

    private func labels(for names: [String], maximumLength: Int = 10) throws -> [String] {
        let originals = try presented(.bestBall).teams.flatMap(\.players)
        let players = zip(originals, names).map { player, name in
            MatchDetailPlayerPresentation(playerID: player.playerID, displayName: name,
                isAuthenticatedPlayer: player.isAuthenticatedPlayer, golfContext: player.golfContext)
        }
        let labels = MatchGolfScorecardPresentation.compactPlayerLabels(players, maximumLength: maximumLength)
        return players.map { labels[$0.playerID] ?? "missing" }
    }

    func testBestBallEarlyClinchDoesNotDropCanonicalBackNineScores() throws {
        let response = MatchDetailFixtureFactory.response(format: .bestBall, status: .completed,
            holesPlayed: 18, clinchHole: 13)
        XCTAssertTrue(response.data.isStructurallyCompatible)
        let match = try project(response)
        XCTAssertEqual(match.clinch?.holeNumber, 13)
        let result = MatchGolfScorecardPresentation.make(scorecard: match.scorecard, teams: match.teams, format: .bestBall)
        XCTAssertEqual(result.nines[1].rows[0].cells.map(\.holeNumber), Array(10...18))
        for row in result.nines[1].rows where row.kind == .net {
            for value in row.cells {
                let hole = try XCTUnwrap(match.hole(number: value.holeNumber))
                let canonical = row.id == "side.1.net" ? hole.sideOne.netScore : hole.sideTwo.netScore
                XCTAssertEqual(value.value, canonical.map(String.init) ?? "—")
            }
        }
    }

    func testSchemaCompatibleHalvedSinglesUsesCanonicalASAndNoRedundantNet() throws {
        var object = try MatchDetailFixtureFactory.jsonObject(from:
            MatchDetailFixtureFactory.response(format: .singles, status: .completed))
        var data = try XCTUnwrap(object["data"] as? [String: Any])
        var match = try XCTUnwrap(data["match"] as? [String: Any])
        match["result"] = ["summary": "Match halved", "notation": "AS",
                           "winnerSide": NSNull(), "winnerTeamId": NSNull()]
        var progress = try XCTUnwrap(match["progress"] as? [String: Any])
        progress["statusText"] = "Match halved"
        match["progress"] = progress
        var flow = try XCTUnwrap(match["flow"] as? [String: Any])
        for key in ["front", "back", "overall"] {
            var segment = try XCTUnwrap(flow[key] as? [String: Any])
            segment["status"] = "final"
            segment["winnerSide"] = NSNull()
            segment["result"] = "AS"
            flow[key] = segment
        }
        match["flow"] = flow
        match["stats"] = ["holesPlayed": 18, "sideOneHolesWon": 0, "halved": 18,
                          "sideTwoHolesWon": 0, "biggestLead": 0, "leadChanges": 0, "holesRemaining": 0]
        var card = try XCTUnwrap(match["scorecard"] as? [String: Any])
        var holes = try XCTUnwrap(card["holes"] as? [[String: Any]])
        for index in holes.indices {
            holes[index]["state"] = "halved"
            holes[index]["winningSide"] = NSNull()
            holes[index]["resultLabel"] = "Halved"
            holes[index]["runningResult"] = "AS"
            holes[index]["story"] = "The hole was halved."
            for key in ["sideOne", "sideTwo"] {
                var side = try XCTUnwrap(holes[index][key] as? [String: Any])
                var players = try XCTUnwrap(side["playerScores"] as? [[String: Any]])
                players[0]["gross"] = 4
                players[0]["strokes"] = 0
                side["playerScores"] = players
                side["netScore"] = 4
                holes[index][key] = side
            }
        }
        card["holes"] = holes
        match["scorecard"] = card
        data["match"] = match
        object["data"] = data
        let response = try JSONDecoder().decode(MobileMatchDetailResponse.self,
            from: JSONSerialization.data(withJSONObject: object))
        XCTAssertTrue(response.data.isStructurallyCompatible)
        let presented = try project(response)
        let grid = MatchGolfScorecardPresentation.make(scorecard: presented.scorecard, teams: presented.teams, format: .singles)
        for nine in grid.nines {
            XCTAssertFalse(nine.rows.contains { $0.kind == .net })
            XCTAssertTrue(nine.rows.first { $0.kind == .result }!.cells.allSatisfy { $0.value == "½" && $0.teamSide == nil })
            XCTAssertTrue(nine.rows.first { $0.kind == .status }!.cells.allSatisfy { $0.value == "AS" })
        }
    }

    private func grid(
        format: MobileScoringFormat = .bestBall,
        mutate: ((inout [String: Any]) throws -> Void)? = nil
    ) throws -> MatchGolfScorecardPresentation {
        let match = try presented(format, mutate: mutate)
        return .make(scorecard: match.scorecard, teams: match.teams, format: format)
    }

    private func cell(_ grid: MatchGolfScorecardPresentation, row: String) throws -> MatchGolfScorecardCell {
        try XCTUnwrap(grid.nines.first?.rows.first { $0.id == row }?.cells.first)
    }

    private func presented(
        _ format: MobileScoringFormat,
        status: MobileMatchStatus = .completed,
        mutate: ((inout [String: Any]) throws -> Void)? = nil
    ) throws -> MatchDetailMatchPresentation {
        var response = MatchDetailFixtureFactory.response(format: format, status: status)
        if let mutate {
            var object = try MatchDetailFixtureFactory.jsonObject(from: response)
            var data = try XCTUnwrap(object["data"] as? [String: Any])
            var match = try XCTUnwrap(data["match"] as? [String: Any])
            var scorecard = try XCTUnwrap(match["scorecard"] as? [String: Any])
            var holes = try XCTUnwrap(scorecard["holes"] as? [[String: Any]])
            for index in holes.indices { try mutate(&holes[index]) }
            scorecard["holes"] = holes
            match["scorecard"] = scorecard
            data["match"] = match
            object["data"] = data
            response = try JSONDecoder().decode(MobileMatchDetailResponse.self,
                from: JSONSerialization.data(withJSONObject: object))
        }
        return try project(response)
    }

    private func project(_ response: MobileMatchDetailResponse) throws -> MatchDetailMatchPresentation {
        let state = MobileReadState(value: response.data, source: .network, freshness: .fresh,
            isRefreshing: false, revision: response.meta.revision, generatedAt: response.meta.generatedAt,
            fetchedAt: TestFixtures.now, validatedAt: TestFixtures.now, lastSafeError: nil,
            lastServerCode: nil, lastHTTPStatus: 200, cachePersistenceIssue: false)
        return try XCTUnwrap(MatchDetailPresenter.make(state: state,
            requestedMatchID: response.data.match.matchId, now: TestFixtures.now).match)
    }
}
