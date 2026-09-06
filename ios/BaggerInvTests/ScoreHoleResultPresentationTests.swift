import XCTest
@testable import BaggerInv

final class ScoreHoleResultPresentationTests: XCTestCase {
    private let sides = [
        ScoringSidePresentation(side: 1, teamID: "pickles", name: "The Pickles", participants: []),
        ScoringSidePresentation(side: 2, teamID: "lipp", name: "Lipp it and Rip it", participants: []),
    ]

    private func hole(winner: ScoringWinnerPresentation?, nets: [Double?] = [3, 4]) -> ScoringOfficialHolePresentation {
        .init(holeNumber: 18, revision: 7, sides: [
            .init(side: 1, gross: [4], strokes: [1], net: nets[0]),
            .init(side: 2, gross: [4], strokes: [0], net: nets[1]),
        ], winner: winner, updatedAt: nil)
    }

    func testWinnerNetAndAuthorityAreSeparateCanonicalFacts() {
        let copy = ScoreHoleResultPresentation(official: hole(winner: .side(1)), sides: sides)
        XCTAssertEqual(copy.resultText, "Winner: The Pickles")
        XCTAssertEqual(copy.netText, "The Pickles Net 3 · Lipp it and Rip it Net 4")
        XCTAssertEqual(copy.authorityText, "Official")
    }

    func testSecondSideWinUsesCanonicalIdentity() {
        let copy = ScoreHoleResultPresentation(official: hole(winner: .side(2)), sides: sides)
        XCTAssertEqual(copy.resultText, "Winner: Lipp it and Rip it")
    }

    func testHalvedIsResultNotWinner() {
        let copy = ScoreHoleResultPresentation(official: hole(winner: .halved), sides: sides)
        XCTAssertEqual(copy.resultText, "Result: Halved")
        XCTAssertFalse(copy.resultText.contains("Winner"))
    }

    func testMissingWinnerIsNotInferredFromDifferentNetValues() {
        let copy = ScoreHoleResultPresentation(official: hole(winner: nil), sides: sides)
        XCTAssertEqual(copy.resultText, "Result: Unavailable")
        XCTAssertEqual(copy.authorityText, "Official")
    }

    func testCanonicalWinnerIsNeverRecomputedFromNet() {
        let official = hole(winner: .side(1), nets: [8, 2])
        let copy = ScoreHoleResultPresentation(official: official, sides: sides)
        XCTAssertEqual(copy.resultText, "Winner: The Pickles")
        XCTAssertEqual(copy.netText, "The Pickles Net 8 · Lipp it and Rip it Net 2")
        XCTAssertEqual(official.sides[0].net, 8)
    }

    func testUnavailableRecordDoesNotClaimOfficialOrFabricateNet() {
        let copy = ScoreHoleResultPresentation(official: nil, sides: sides)
        XCTAssertEqual(copy.resultText, "Result: Unavailable")
        XCTAssertNil(copy.netText)
        XCTAssertNil(copy.authorityText)
        XCTAssertNil(ScoreHoleResultPresentation(official: hole(winner: nil, nets: [nil, nil]), sides: sides).netText)
    }

    func testUnknownWinnerIdentityIsUnavailableRatherThanManufactured() {
        XCTAssertEqual(ScoreHoleResultPresentation(official: hole(winner: .side(3)), sides: sides).resultText, "Result: Unavailable")
    }

    func testCorrectionCopyKeepsLocalSaveSeparateFromOfficialConfirmation() {
        XCTAssertEqual(ScoreCorrectionCopy.title(holeNumber: 18), "CORRECTING HOLE 18")
        XCTAssertEqual(ScoreCorrectionCopy.message(hasOfficialScores: true), "Official scores stay unchanged until saved and confirmed.")
        XCTAssertEqual(ScoreCorrectionCopy.message(hasOfficialScores: false), "Saved on iPhone · Not Official until confirmed.")
    }

    func testScorecardNetAccessibilityCapitalizationDoesNotChangeRowsOrValues() {
        let presentation = ScoringPresenter.make(state: ScoringUITestFixtures.state(for: .scoreActiveBestBall))
        let netRows = ScoreGolfScorecardPresentation.make(presentation).flatMap(\.rows).filter { $0.kind == .net }
        XCTAssertEqual(netRows.count, 4)
        XCTAssertTrue(netRows.flatMap(\.cells).allSatisfy { $0.accessibilityLabel.contains(", Net ") })
        XCTAssertEqual(netRows.first?.cells.first?.value, "3")
    }

    func testSharedLiveGrammarIsBroadcastAndTitleCase() {
        XCTAssertEqual(BaggerStatusKind.live.defaultTitle, "Live")
        XCTAssertEqual(BaggerStatusKind.live.systemImage, "dot.radiowaves.left.and.right")
    }

    func testActiveCorrectionSuppressesOnlyFinalizationPresentationNotCanonicalReadiness() {
        let presentation = ScoringPresenter.make(state: ScoringUITestFixtures.state(for: .scoreFinalizationReady))
        let ordinary = ScoringFinalizationUIModel.make(presentation: presentation, queueState: .inactive, coordinatorState: .idle)
        let correction = ScoringFinalizationUIModel.make(presentation: presentation, queueState: .inactive, coordinatorState: .idle, hasActiveLocalReview: true)
        XCTAssertTrue(ordinary.canRequestFinalization)
        XCTAssertEqual(correction.phase, .hidden); XCTAssertFalse(correction.canRequestFinalization)
        XCTAssertTrue(presentation.canFinalize); XCTAssertTrue(presentation.scorecardComplete)
    }

    func testCorrectionNeverHidesUnknownFinalizationRecovery() {
        let presentation = ScoringPresenter.make(state: ScoringUITestFixtures.state(for: .scoreFinalizationReady))
        for phase in [ScoringFinalizationPhase.outcomeUnknown, .acknowledgedRefreshPending, .submitting, .reconciling] {
            let model = ScoringFinalizationUIModel.make(presentation: presentation, queueState: .inactive,
                coordinatorState: .init(phase: phase, matchId: presentation.matchID, blocker: nil, lastServerCode: nil), hasActiveLocalReview: true)
            XCTAssertNotEqual(model.phase, .hidden); XCTAssertFalse(model.canRequestFinalization)
        }
    }

    func testRepeatedConfirmationCannotPromoteFinalizeWhileCorrectionIsActive() {
        let presentation = ScoringPresenter.make(state: ScoringUITestFixtures.state(for: .scoreFinalizationReady))
        let model = ScoringFinalizationUIModel.make(presentation: presentation, queueState: .inactive,
            coordinatorState: .init(phase: .confirmationRequired, matchId: presentation.matchID, blocker: nil, lastServerCode: nil), hasActiveLocalReview: true)
        XCTAssertEqual(model.phase, .hidden); XCTAssertFalse(model.canRequestFinalization)
    }
}
