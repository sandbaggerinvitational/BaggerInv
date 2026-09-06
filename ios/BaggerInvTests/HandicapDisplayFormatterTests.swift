import Foundation
import XCTest
@testable import BaggerInv

final class HandicapDisplayFormatterTests: XCTestCase {
    func testDoubleHandicapsAlwaysDisplayExactlyOneDecimal() {
        let cases: [(Double, String)] = [
            (4.25, "4.3"), (3.25, "3.3"), (12.34567, "12.3"),
            (11.25, "11.3"), (4.24, "4.2"), (4.26, "4.3"),
            (3, "3.0"), (1, "1.0"), (0, "0.0"), (-0.0, "0.0"),
            (-4.25, "(4.3)"), (-2.75, "(2.8)"), (-0.875, "(0.9)"),
        ]
        for (canonical, expected) in cases {
            XCTAssertEqual(HandicapDisplayFormatter.string(canonical), expected)
            XCTAssertEqual(MatchGolfDisplayFormatter.playingHandicap(canonical), expected)
        }
    }

    func testDecimalHandicapsUseTheSameDisplayRuleWithoutChangingTheirValue() throws {
        for (source, expected) in [("4.25", "4.3"), ("6", "6.0"), ("-2.75", "(2.8)"), ("12.34567", "12.3")] {
            let canonical = try XCTUnwrap(Decimal(string: source, locale: Locale(identifier: "en_US_POSIX")))
            XCTAssertEqual(HandicapDisplayFormatter.string(canonical), expected)
            XCTAssertEqual(NSDecimalNumber(decimal: canonical).stringValue, source)
        }
    }

    func testNonFiniteHandicapsHaveSafeUnavailableDisplay() {
        for value in [Double.nan, .infinity, -.infinity] {
            XCTAssertEqual(HandicapDisplayFormatter.string(value), "—")
        }
        XCTAssertEqual(HandicapDisplayFormatter.string(Decimal.nan), "—")
    }

    func testScoreHandicapLabelsUseOneDecimalWhileCanonicalValuesRemainUnchanged() {
        let participant = ScoringParticipantPresentation(
            playerID: "player", displayName: "Canonical Player", slot: 1,
            isAuthenticatedPlayer: true, handicapIndex: 4.25,
            courseHandicap: 6, playingHandicap: -2.75, totalStrokes: 2
        )
        XCTAssertEqual(participant.handicapSummary, "HI 4.3 · CH 6.0 · PH (2.8)")
        XCTAssertEqual(participant.handicapIndex, 4.25)
        XCTAssertEqual(participant.courseHandicap, 6)
        XCTAssertEqual(participant.playingHandicap, -2.75)
        XCTAssertEqual(participant.totalStrokes, 2)
    }

    func testMissingHandicapsRemainMissing() {
        let participant = ScoringParticipantPresentation(
            playerID: "player", displayName: "Canonical Player", slot: 1,
            isAuthenticatedPlayer: false, handicapIndex: nil,
            courseHandicap: nil, playingHandicap: nil, totalStrokes: 2
        )
        XCTAssertNil(participant.handicapSummary)
        XCTAssertNil(MatchesGolfContextPresentation(
            scope: .team, playingHandicap: nil, strokesReceived: nil
        ).compactText)
    }

    func testHoleStrokeIndexAndScoresDoNotAcquireHandicapDecimalFormatting() {
        let hole = ScoringCourseHolePresentation(holeNumber: 1, par: 4, strokeIndex: 6, yardage: 425)
        XCTAssertEqual(hole.contextText, "Par 4 · 425 yds · HCP 6")
        XCTAssertEqual(ScoringNumberFormatter.string(4), "4")
    }
}
