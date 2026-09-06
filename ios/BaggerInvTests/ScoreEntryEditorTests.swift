import XCTest
@testable import BaggerInv

final class ScoreEntryEditorTests: XCTestCase {
    private func presentation(_ scenario: TodayUITestScenario = .scoreActiveBestBall) -> ScoringPresentation {
        ScoringPresenter.make(state: ScoringUITestFixtures.state(for: scenario))
    }
    private func editor(_ scenario: TodayUITestScenario = .scoreActiveBestBall, hole: Int = 7) throws -> ScoreEntryEditor {
        let p = presentation(scenario)
        return ScoreEntryEditor(base: try XCTUnwrap(p.makeDraft(for: hole)), rows: p.inputRows(for: hole))
    }

    func testFormatShapeAndCanonicalTargetOrder() throws {
        for (scenario, expected) in [(TodayUITestScenario.scoreActiveBestBall, ["1:1", "1:2", "2:1", "2:2"]), (.scoreActiveScramble, ["1:1", "2:1"]), (.scoreActiveSingles, ["1:1", "2:1"])] {
            let e = try editor(scenario)
            XCTAssertEqual(e.rows.map { "\($0.key.side):\($0.key.slot)" }, expected)
            XCTAssertFalse(e.isCorrection)
        }
    }
    func testDirectKeysReplaceWholeValueAndAreLocalOnly() throws {
        var e = try editor(); let key = try XCTUnwrap(e.selectedKey)
        for value in 1...10 {
            e.select(key); e.apply(.number(value))
            XCTAssertEqual(e.value(for: key), value)
        }
        XCTAssertTrue(e.base.isEmpty)
        XCTAssertNil(e.saveDraft())
    }
    func testBlankPlusIsElevenAndMinusIsOne() throws {
        var e = try editor(); let key = try XCTUnwrap(e.selectedKey)
        e.apply(.increment); XCTAssertEqual(e.value(for: key), 11)
        e.apply(.clear); e.apply(.decrement); XCTAssertEqual(e.value(for: key), 1)
        XCTAssertEqual(e.selectedKey, key)
    }
    func testBoundsClampOneThroughTwenty() throws {
        var e = try editor(); let key = try XCTUnwrap(e.selectedKey)
        for _ in 0..<30 { e.apply(.increment) }
        XCTAssertEqual(e.value(for: key), 20)
        for _ in 0..<30 { e.apply(.decrement) }
        XCTAssertEqual(e.value(for: key), 1)
    }
    func testIllegalDirectKeyDoesNotChangeOrAdvance() throws {
        var e = try editor(); let original = e
        for value in [-1, 0, 11, 20, 21] { e.apply(.number(value)); XCTAssertEqual(e, original) }
    }
    func testFirstEntriesAutoAdvanceWithoutWrapOrSave() throws {
        var e = try editor()
        for (index, row) in e.rows.enumerated() {
            XCTAssertEqual(e.selectedKey, row.key)
            e.apply(.number(index + 4))
        }
        XCTAssertEqual(e.selectedKey, e.rows.last?.key)
        XCTAssertTrue(e.canSave)
        XCTAssertTrue(e.base.isEmpty)
    }
    func testAutoAdvanceSkipsEnteredTargetsAndNeverOverwrites() throws {
        var e = try editor(); let keys = e.rows.map(\.key)
        e.select(keys[1]); e.apply(.number(8))
        e.select(keys[0]); e.apply(.number(4))
        XCTAssertEqual(e.selectedKey, keys[2]); XCTAssertEqual(e.value(for: keys[1]), 8)
    }
    func testManualPopulatedTargetEditStaysSelected() throws {
        var e = try editor(); let key = try XCTUnwrap(e.selectedKey)
        e.apply(.number(4)); e.select(key); e.apply(.number(7))
        XCTAssertEqual(e.selectedKey, key)
    }
    func testCorrectionNeverAutoAdvances() throws {
        var e = try editor(hole: 1); let key = try XCTUnwrap(e.selectedKey)
        XCTAssertTrue(e.isCorrection); e.apply(.number(8))
        XCTAssertEqual(e.selectedKey, key); XCTAssertTrue(e.canSave)
        XCTAssertEqual(e.rows.first?.officialGross, 4)
    }
    func testClearOfficialCannotResurrectOrSaveIncomplete() throws {
        var e = try editor(hole: 1); let key = try XCTUnwrap(e.selectedKey)
        e.apply(.clear)
        XCTAssertNil(e.value(for: key)); XCTAssertNil(e.saveDraft())
        XCTAssertEqual(e.baseline[key], 4); XCTAssertEqual(e.rows.first?.officialGross, 4)
        XCTAssertTrue(e.hasChanges); XCTAssertEqual(e.selectedKey, key)
    }
    func testRestoreOfficialValueHasNoSave() throws {
        var e = try editor(hole: 1)
        e.apply(.clear); e.apply(.number(4))
        XCTAssertFalse(e.hasChanges); XCTAssertNil(e.saveDraft())
    }
    func testCompleteAdapterUsesExistingOrderedQueueInput() throws {
        let p = presentation(); var e = try editor()
        for value in [4, 5, 6, 7] { e.apply(.number(value)) }
        let draft = try XCTUnwrap(e.saveDraft())
        XCTAssertTrue(p.isDraftCompatible(draft))
        XCTAssertEqual(e.rows.map { draft.value(for: $0.key) }, [4, 5, 6, 7])
        XCTAssertEqual(draft.snapshotID, e.base.snapshotID)
        XCTAssertEqual(draft.permissionRevision, e.base.permissionRevision)
    }
    func testHoleOneMiddleAndEighteenKeepSeparateLocalState() throws {
        var editors = try Dictionary(uniqueKeysWithValues: [1, 7, 18].map { ($0, try editor(hole: $0)) })
        editors[7]?.apply(.increment)
        XCTAssertFalse(try XCTUnwrap(editors[1]).hasChanges)
        XCTAssertFalse(try XCTUnwrap(editors[18]).hasChanges)
        XCTAssertTrue(try XCTUnwrap(editors[7]).hasChanges)
        XCTAssertEqual(editors[18]?.base.holeNumber, 18)
    }
    func testPendingCorrectionPreservesSavedAndOfficialBaselines() throws {
        let p = presentation(); let rows = p.inputRows(for: 1)
        let pending = Dictionary(uniqueKeysWithValues: rows.map { ($0.key, 6) })
        var e = ScoreEntryEditor(base: try XCTUnwrap(p.makeDraft(for: 1)), rows: rows, pending: pending)
        XCTAssertTrue(e.isCorrection); XCTAssertFalse(e.canSave)
        e.apply(.clear); XCTAssertNil(e.saveDraft())
        XCTAssertEqual(e.baseline[rows[0].key], 6); XCTAssertEqual(rows[0].officialGross, 4)
        XCTAssertEqual(e.pendingKeys, Set(rows.map(\.key)))
    }
    func testClearedPreviouslyEnteredTargetDoesNotAutoAdvance() throws {
        var e = try editor(); let first = try XCTUnwrap(e.selectedKey)
        e.apply(.number(4)); e.select(first); e.apply(.clear); e.apply(.number(6))
        XCTAssertEqual(e.selectedKey, first)
    }
    func testHandicapDisplayUsesOnlyPlayingHcpWithOneDecimal() {
        for (raw, displayed) in [(4.25, "HCP 4.3"), (0, "HCP 0.0"), (-0.875, "HCP (0.9)")] {
            let player = ScoringParticipantPresentation(playerID: "p", displayName: "Player", slot: 1, isAuthenticatedPlayer: true,
                handicapIndex: 99, courseHandicap: 98, playingHandicap: raw, totalStrokes: 6)
            XCTAssertEqual(ScoreEntryEditor.handicapText(player), displayed)
            XCTAssertEqual(player.playingHandicap, raw)
        }
    }
    func testScrambleRowsKeepNamesAndNeverIndividualHcp() {
        let p = presentation(.scoreActiveScramble)
        XCTAssertTrue(p.inputRows(for: 7).allSatisfy { !($0.detail ?? "").contains("HCP") && !($0.detail ?? "").contains("PH ") })
        XCTAssertTrue(p.inputRows(for: 7)[0].detail?.contains("Alex Morgan") == true)
        XCTAssertTrue(p.sides.flatMap(\.participants).allSatisfy { $0.playingHandicap != nil })
    }
    func testMissingPreEntryStrokesRemainMissing() {
        for scenario in [TodayUITestScenario.scoreActiveBestBall, .scoreActiveScramble, .scoreActiveSingles] {
            XCTAssertTrue(presentation(scenario).inputRows(for: 7).allSatisfy { $0.canonicalStrokes == nil })
        }
    }
    func testSharedScorecardGrammarAndCanonicalOnlyValues() {
        for (scenario, grossCount) in [(TodayUITestScenario.scoreActiveBestBall, 4), (.scoreActiveScramble, 2), (.scoreActiveSingles, 2)] {
            let p = presentation(scenario); let nines = ScoreGolfScorecardPresentation.make(p)
            XCTAssertEqual(nines.count, 2)
            XCTAssertEqual(nines[0].rows.map(\.kind), nines[1].rows.map(\.kind))
            XCTAssertEqual(nines[0].rows.filter { $0.kind == .gross }.count, grossCount)
            XCTAssertFalse(nines[0].rows.contains { $0.kind == .status || $0.label.contains("HCP") || $0.label == "TOT" })
            XCTAssertTrue(nines[1].rows.filter { $0.kind == .gross }.flatMap(\.cells).allSatisfy { $0.value == "—" })
            let gross = nines[0].rows.first { $0.kind == .gross }
            XCTAssertEqual(gross?.cells.first?.value, "4")
            XCTAssertEqual(gross?.cells.first?.strokeMarker, "•")
            XCTAssertTrue(gross?.cells.first?.accessibilityLabel.contains("1 applied stroke") == true)
        }
    }

    func testSupplementUsesExactMatchIdentityAndCanonicalTeamContextOnly() throws {
        let scoring = try XCTUnwrap(ScoringUITestFixtures.state(for: .scoreActiveScramble).scoring)
        let teams = scoring.sides.map { side in
            MobileMatchesTeam(side: side.side, teamId: side.teamId!, name: side.name,
                playingHandicap: side.side == 1 ? 3 : 1, strokesReceived: side.side == 1 ? 2 : 0,
                participants: side.participants.map {
                    MobileMatchesParticipant(playerId: $0.playerId, displayName: $0.displayName, teamSide: side.side,
                        isAuthenticatedPlayer: $0.isAuthenticatedPlayer, playingHandicap: $0.playingHandicap, strokesReceived: nil)
                })
        }
        func state(id: String) -> MobileReadState<MobileMatchesData> {
            var state = MobileReadState<MobileMatchesData>.empty
            state.source = .network; state.freshness = .fresh
            state.value = MobileMatchesData(tournament: .init(tournamentId: "2026", name: "Preview", year: 2026, status: "Live", currentRound: 2, timeZone: "America/Chicago"), matches: [
                .init(matchId: id, displayMatchNumber: "5 of 6", round: .init(roundNumber: 2, name: nil, format: "SC"),
                      status: .inProgress, course: nil, teeTime: nil, teams: teams,
                      authenticatedPlayer: .init(involved: true, teamSide: 1, partnerPlayerIds: [], opponentPlayerIds: []),
                      progress: .init(currentHole: 7), result: nil),
            ])
            return state
        }
        let context = try XCTUnwrap(ScoreMatchDisplayContext.make(state: state(id: scoring.match.matchId), scoring: scoring))
        XCTAssertEqual(context.teamContext(side: 1), "Team HCP 3.0 · +2 strokes")
        XCTAssertEqual(context.teamContext(side: 2), "Team HCP 1.0 · No strokes")
        XCTAssertFalse(context.isCached)
        XCTAssertNil(ScoreMatchDisplayContext.make(state: state(id: scoring.match.matchId + " "), scoring: scoring))
        XCTAssertNil(ScoreMatchDisplayContext.make(state: .empty, scoring: scoring))
        XCTAssertEqual(scoring.sides[0].participants[0].playingHandicap, 9)
    }
}
