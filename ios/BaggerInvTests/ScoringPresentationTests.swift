import XCTest
@testable import BaggerInv

final class ScoringPresentationTests: XCTestCase {
    func testBestBallPreservesCanonicalSideAndSlotOrder() throws {
        let presentation = makePresentation(format: .bestBall)

        XCTAssertEqual(presentation.format, .bestBall)
        XCTAssertEqual(presentation.sides.map(\.side), [1, 2])
        XCTAssertEqual(presentation.sides[0].participants.map(\.slot), [1, 2])
        XCTAssertEqual(presentation.sides[0].participants.map(\.displayName), ["Side 1 Slot 1", "Side 1 Slot 2"])
        XCTAssertEqual(presentation.inputRows(for: 1).map(\.key), [
            ScoringInputKey(side: 1, slot: 1),
            ScoringInputKey(side: 1, slot: 2),
            ScoringInputKey(side: 2, slot: 1),
            ScoringInputKey(side: 2, slot: 2),
        ])
        XCTAssertEqual(presentation.inputRows(for: 1).map(\.officialGross), [4, 5, 5, 6])
        XCTAssertTrue(presentation.hasValidInputShape)
        XCTAssertTrue(presentation.isEditable)
    }

    func testScrambleUsesOneCanonicalSideInputWithoutInventingParticipantScores() {
        let presentation = makePresentation(format: .scramble)
        let rows = presentation.inputRows(for: 1)

        XCTAssertEqual(rows.count, 2)
        XCTAssertEqual(rows.map(\.title), ["Side 1", "Side 2"])
        XCTAssertEqual(rows.map(\.key), [
            ScoringInputKey(side: 1, slot: 1),
            ScoringInputKey(side: 2, slot: 1),
        ])
        XCTAssertEqual(rows.map(\.officialGross), [4, 5])
        XCTAssertTrue(presentation.isEditable)
    }

    func testSinglesUsesOneCanonicalParticipantPerSide() {
        let presentation = makePresentation(format: .singles, participantsPerSide: 1)
        let rows = presentation.inputRows(for: 1)

        XCTAssertEqual(rows.count, 2)
        XCTAssertEqual(rows.map(\.title), ["Side 1 Slot 1", "Side 2 Slot 1"])
        XCTAssertEqual(rows.map(\.officialGross), [4, 5])
        XCTAssertTrue(presentation.isEditable)
    }

    func testUnknownFormatFailsIntoReadOnlyWithoutInputs() {
        let presentation = makePresentation(format: .unknown("ALT"))

        XCTAssertEqual(presentation.format, .unsupported("ALT"))
        XCTAssertEqual(presentation.availability, .readOnly)
        XCTAssertFalse(presentation.isEditable)
        XCTAssertTrue(presentation.inputRows(for: 1).isEmpty)
        XCTAssertFalse(presentation.officialHoles.isEmpty)
    }

    func testInitialHoleUsesCanonicalCurrentHoleAndExplicitSelectionIsRetained() {
        let presentation = makePresentation(format: .bestBall, currentHole: 7)

        XCTAssertEqual(presentation.initialSelectedHole(), 7)
        XCTAssertEqual(presentation.reconciledSelectedHole(3), 3)
        XCTAssertEqual(presentation.reconciledSelectedHole(99), 7)
    }

    func testCompletedMatchUsesLastOfficialHoleThenLastCourseHole() {
        let scored = makePresentation(
            format: .scramble,
            status: .completed,
            currentHole: 18,
            scoredHoles: [1, 2, 12]
        )
        XCTAssertEqual(scored.initialSelectedHole(), 12)
        XCTAssertEqual(scored.availability, .completed)
        XCTAssertFalse(scored.isEditable)

        let unscored = makePresentation(
            format: .scramble,
            status: .completed,
            currentHole: 18,
            scoredHoles: []
        )
        XCTAssertEqual(unscored.initialSelectedHole(), 18)
    }

    func testOfficialDraftDistinctionAndReturningToOfficialClearsEntry() throws {
        let presentation = makePresentation(format: .bestBall)
        let row = try XCTUnwrap(presentation.inputRows(for: 1).first)
        var draft = try XCTUnwrap(presentation.makeDraft(for: 1))

        XCTAssertEqual(ScoringInteraction.displayedGross(for: row, draft: draft), 4)
        XCTAssertFalse(ScoringInteraction.isEdited(row: row, draft: draft))

        draft.set(6, for: row.key)
        XCTAssertEqual(ScoringInteraction.displayedGross(for: row, draft: draft), 6)
        XCTAssertTrue(ScoringInteraction.isEdited(row: row, draft: draft))

        draft.set(nil, for: row.key)
        XCTAssertEqual(ScoringInteraction.displayedGross(for: row, draft: draft), 4)
        XCTAssertFalse(ScoringInteraction.isEdited(row: row, draft: draft))
        XCTAssertTrue(draft.isEmpty)

        draft.set(5, for: row.key)
        let restored = ScoringInteraction.changing(
            row: row,
            by: -1,
            in: draft,
            defaultValue: 4
        )
        XCTAssertTrue(restored.isEmpty, "Returning to the official gross removes local draft intent")
    }

    func testDraftRangeIsBoundedToCanonicalContractOneThroughTwenty() throws {
        let presentation = makePresentation(format: .bestBall)
        let row = try XCTUnwrap(presentation.inputRows(for: 1).first)
        var draft = try XCTUnwrap(presentation.makeDraft(for: 1))

        draft.set(0, for: row.key)
        XCTAssertEqual(draft.value(for: row.key), 1)
        draft.set(21, for: row.key)
        XCTAssertEqual(draft.value(for: row.key), 20)
    }

    func testDraftCompatibilityFailsOnPermissionSnapshotAndStructureChange() throws {
        let baseline = makePresentation(format: .bestBall)
        let draft = try XCTUnwrap(baseline.makeDraft(for: 1))
        XCTAssertTrue(baseline.isDraftCompatible(draft))

        let changedPermission = makePresentation(format: .bestBall, permissionRevision: 5)
        XCTAssertFalse(changedPermission.isDraftCompatible(draft))

        let changedSnapshot = makePresentation(format: .bestBall, snapshotRevision: 10)
        XCTAssertFalse(changedSnapshot.isDraftCompatible(draft))

        let changedStructure = makePresentation(format: .scramble)
        XCTAssertFalse(changedStructure.isDraftCompatible(draft))

        let offline = makePresentation(format: .bestBall, phase: .offline)
        XCTAssertFalse(offline.isDraftCompatible(draft))

        let readOnly = makePresentation(format: .bestBall, readOnly: true)
        XCTAssertFalse(readOnly.isDraftCompatible(draft))
    }

    func testPermissionStatusAndOfflineAllFailClosedForEditing() {
        XCTAssertTrue(makePresentation(format: .bestBall).isEditable)
        XCTAssertFalse(makePresentation(format: .bestBall, status: .scheduled).isEditable)
        XCTAssertFalse(makePresentation(format: .bestBall, status: .completed).isEditable)
        XCTAssertFalse(makePresentation(format: .bestBall, canScore: false).isEditable)
        XCTAssertFalse(makePresentation(format: .bestBall, readOnly: true).isEditable)

        let offline = makePresentation(format: .bestBall, phase: .offline)
        XCTAssertEqual(offline.availability, .offline)
        XCTAssertTrue(offline.orientationOnly)
        XCTAssertFalse(offline.isEditable)
        XCTAssertNotNil(offline.officialHole(1))
    }

    func testInvalidBestBallOrSinglesShapeCannotEdit() {
        XCTAssertFalse(makePresentation(format: .bestBall, participantsPerSide: 1).isEditable)
        XCTAssertFalse(makePresentation(format: .singles, participantsPerSide: 2).isEditable)
    }

    func testScorecardGroupsFrontAndBackAndRetainsOnlyCanonicalValues() throws {
        let presentation = makePresentation(format: .bestBall, scoredHoles: [1, 9, 10, 18])

        XCTAssertEqual(presentation.scorecardSections.map(\.title), ["Front 9", "Back 9"])
        XCTAssertEqual(presentation.scorecardSections[0].holes.map(\.hole.holeNumber), Array(1...9))
        XCTAssertEqual(presentation.scorecardSections[1].holes.map(\.hole.holeNumber), Array(10...18))

        let hole = try XCTUnwrap(presentation.scorecardSections[0].holes.first)
        XCTAssertEqual(hole.official?.sides[0].gross, [4, 5])
        XCTAssertEqual(hole.official?.sides[0].strokes, [1, 0])
        XCTAssertEqual(hole.official?.sides[0].net, 3)
        XCTAssertEqual(hole.official?.winner, .side(1))
    }

    func testOfficialScorecardRemainsReviewableWithoutCourseHoleMetadata() throws {
        let presentation = makePresentation(
            format: .bestBall,
            status: .completed,
            currentHole: 18,
            scoredHoles: [1, 9, 10, 18],
            includeCourseHoles: false
        )

        XCTAssertEqual(presentation.canonicalHoleNumbers, [1, 9, 10, 18])
        XCTAssertEqual(presentation.initialSelectedHole(), 18)
        XCTAssertEqual(presentation.scorecardSections.map(\.title), ["Front 9", "Back 9"])
        XCTAssertNil(presentation.hole(1)?.par)
        XCTAssertEqual(presentation.officialHole(1)?.winner, .side(1))
        XCTAssertFalse(presentation.isEditable)
    }

    func testMissingCourseLayoutFailsClosedForActiveDrafts() {
        let presentation = makePresentation(
            format: .bestBall,
            scoredHoles: [1],
            includeCourseHoles: false
        )

        XCTAssertFalse(presentation.isEditable)
        XCTAssertNil(presentation.makeDraft(for: 1))
    }

    func testNoMatchAuthenticationAndUnavailableStatesAreIntentional() {
        XCTAssertEqual(ScoringPresenter.make(state: emptyState(.noMatch)).availability, .noMatch)
        XCTAssertEqual(
            ScoringPresenter.make(state: emptyState(.authenticationRequired)).availability,
            .authenticationRequired
        )
        XCTAssertEqual(ScoringPresenter.make(state: emptyState(.unavailable)).availability, .unavailable)
        XCTAssertNil(ScoringPresenter.make(state: emptyState(.noMatch)).matchID)
    }

    func testCanonicalServerNetWinnerProgressAndResultPassThrough() throws {
        let presentation = makePresentation(
            format: .bestBall,
            status: .completed,
            currentHole: 18,
            scoredHoles: [1]
        )
        let hole = try XCTUnwrap(presentation.officialHole(1))

        XCTAssertEqual(hole.sides[0].net, 3)
        XCTAssertEqual(hole.sides[1].net, 4)
        XCTAssertEqual(hole.winner, .side(1))
        XCTAssertEqual(presentation.result, .side(2))
        XCTAssertEqual(presentation.statusText, "Canonical status text")
        XCTAssertEqual(presentation.holesRemaining, 0)
        XCTAssertTrue(presentation.scorecardComplete)
    }

    private func makePresentation(
        format: MobileScoringFormat,
        status: MobileMatchStatus = .inProgress,
        currentHole: Int = 1,
        participantsPerSide: Int? = nil,
        scoredHoles: [Int] = [1],
        canScore: Bool = true,
        readOnly: Bool = false,
        permissionRevision: Int = 4,
        snapshotRevision: Int = 9,
        phase: ScoringCurrentPhase = .ready,
        includeCourseHoles: Bool = true
    ) -> ScoringPresentation {
        let participantCount: Int
        if let participantsPerSide {
            participantCount = participantsPerSide
        } else {
            participantCount = format == .singles ? 1 : 2
        }
        let sides = [1, 2].map { side in
            MobileScoringSide(
                side: side,
                teamId: "team-\(side)",
                name: "Side \(side)",
                participants: (1...participantCount).map { slot in
                    MobileScoringParticipant(
                        playerId: "player-\(side)-\(slot)",
                        displayName: "Side \(side) Slot \(slot)",
                        slot: slot,
                        isAuthenticatedPlayer: side == 1 && slot == 1,
                        handicapIndex: 8 + Double(slot),
                        courseHandicap: 9 + Double(slot),
                        playingHandicap: 7 + Double(slot),
                        strokes: side == 1 && slot == 1 ? 1 : 0
                    )
                }
            )
        }
        let holes = (1...18).map {
            MobileScoringCourseHole(
                holeNumber: $0,
                par: Double([4, 4, 3, 5][($0 - 1) % 4]),
                strokeIndex: Double($0),
                yardage: Double(300 + $0)
            )
        }
        let valuesPerSide = format == .bestBall ? 2 : 1
        let scores = scoredHoles.map { hole in
            MobileScoringHoleScore(
                holeNumber: hole,
                revision: hole,
                gross: MobileScoringGross(
                    teamOne: Array([4, 5].prefix(valuesPerSide)),
                    teamTwo: Array([5, 6].prefix(valuesPerSide))
                ),
                strokes: MobileScoringStrokes(
                    teamOne: Array([1, 0].prefix(valuesPerSide)),
                    teamTwo: Array([0, 1].prefix(valuesPerSide))
                ),
                net: MobileScoringNet(teamOne: 3, teamTwo: 4),
                winner: .teamOne,
                updatedAt: try! MobileTimestamp("2026-09-25T14:29:00.000Z")
            )
        }
        let scoring = MobileScoringCurrent(
            match: MobileScoringMatch(
                matchId: "match-scoring",
                roundNumber: 2,
                format: format,
                status: status,
                matchRevision: 12,
                permissionRevision: permissionRevision,
                result: status == .completed ? .teamTwo : nil
            ),
            player: MobileScoringPlayer(
                playerId: "player-1-1",
                displayName: "Side 1 Slot 1",
                teamSide: 1
            ),
            sides: sides,
            course: MobileScoringCourse(
                courseId: "course-1",
                name: "Ocean Course",
                tee: "Gold",
                rating: 72.4,
                slope: 131,
                par: 72,
                holes: includeCourseHoles ? holes : []
            ),
            scores: scores,
            progress: MobileScoringProgress(
                currentHole: currentHole,
                holesRemaining: status == .completed ? 0 : 18 - currentHole,
                scorecardComplete: status == .completed,
                statusText: "Canonical status text"
            ),
            permission: MobileScoringPermission(
                canScore: canScore && status == .inProgress,
                readOnly: readOnly || status != .inProgress,
                canFinalize: false,
                reason: status == .completed ? .matchFinalized : readOnly ? .matchLocked : nil
            ),
            snapshot: MobileScoringSnapshot(snapshotId: "snapshot-1", revision: snapshotRevision)
        )
        return ScoringPresenter.make(state: ScoringCurrentState(
            scoring: scoring,
            generatedAt: try! MobileTimestamp("2026-09-25T14:30:00.000Z"),
            phase: phase,
            isRefreshing: false,
            lastSafeError: phase == .offline ? .transport : nil,
            lastServerCode: nil,
            lastHTTPStatus: nil
        ))
    }

    private func emptyState(_ phase: ScoringCurrentPhase) -> ScoringCurrentState {
        ScoringCurrentState(
            scoring: nil,
            generatedAt: nil,
            phase: phase,
            isRefreshing: phase == .loading,
            lastSafeError: nil,
            lastServerCode: nil,
            lastHTTPStatus: nil
        )
    }
}
