import XCTest
@testable import BaggerInv

final class MobileScoringModelDecodingTests: XCTestCase {
    private let decoder = JSONDecoder()
    private let encoder = JSONEncoder()

    func testFullBestBallScoringCurrentDecodesCanonicalSnapshot() throws {
        let response = try decoder.decode(
            MobileScoringCurrentResponse.self,
            from: encoder.encode(TestFixtures.scoringResponse)
        )
        let scoring = try XCTUnwrap(response.data.scoring)

        XCTAssertTrue(response.isContractCompatible)
        XCTAssertEqual(scoring.match.matchId, "match-preview-1")
        XCTAssertEqual(scoring.match.format, .bestBall)
        XCTAssertEqual(scoring.match.status, .inProgress)
        XCTAssertEqual(scoring.match.matchRevision, 7)
        XCTAssertEqual(scoring.match.permissionRevision, 3)
        XCTAssertEqual(scoring.sides.map(\.side), [1, 2])
        XCTAssertEqual(scoring.sides[0].participants.map(\.slot), [1, 2])
        XCTAssertEqual(scoring.course.holes[0].holeNumber, 1)
        XCTAssertEqual(scoring.scores[0].gross.teamOne, [4, 5])
        XCTAssertEqual(scoring.scores[0].strokes.teamTwo, [0, 1])
        XCTAssertEqual(scoring.scores[0].net.teamOne, 3)
        XCTAssertEqual(scoring.scores[0].winner, .teamOne)
        XCTAssertEqual(scoring.progress.currentHole, 2)
        XCTAssertTrue(scoring.permission.canScore)
        XCTAssertEqual(scoring.snapshot.revision, 4)
    }

    func testNullScoringIsACompatibleIntentionalNoMatchResponse() throws {
        let data = try TestFixtures.jsonData([
            "ok": true,
            "apiVersion": "v1",
            "data": ["scoring": NSNull()],
            "meta": ["generatedAt": "2027-01-15T08:02:00.000Z"],
        ])

        let response = try decoder.decode(MobileScoringCurrentResponse.self, from: data)

        XCTAssertTrue(response.isContractCompatible)
        XCTAssertNil(response.data.scoring)
    }

    func testScoringUpdatedAtAcceptsCanonicalUTCOffset() throws {
        let response = try decode(mutating: { scoring in
            var scores = scoring["scores"] as! [[String: Any]]
            scores[0]["updatedAt"] = "2027-01-15T08:01:00.000+00:00"
            scoring["scores"] = scores
        })

        XCTAssertEqual(
            try XCTUnwrap(response.data.scoring?.scores[0].updatedAt).rawValue,
            "2027-01-15T08:01:00.000+00:00"
        )
        XCTAssertTrue(response.isContractCompatible)
    }

    func testAllKnownFormatsAndUnknownFormatDecodeDefensively() throws {
        for (rawValue, expected) in [
            ("BB", MobileScoringFormat.bestBall),
            ("SC", MobileScoringFormat.scramble),
            ("SI", MobileScoringFormat.singles),
        ] {
            let response = try decode(mutating: { scoring in
                var match = scoring["match"] as! [String: Any]
                match["format"] = rawValue
                scoring["match"] = match
            })
            XCTAssertEqual(response.data.scoring?.match.format, expected)
            XCTAssertTrue(response.data.scoring?.match.format.isKnown == true)
            XCTAssertTrue(response.isContractCompatible)
        }

        let future = try decode(mutating: { scoring in
            var match = scoring["match"] as! [String: Any]
            match["format"] = "FUTURE_FORMAT"
            scoring["match"] = match
        })
        XCTAssertEqual(future.data.scoring?.match.format, .unknown("FUTURE_FORMAT"))
        XCTAssertFalse(try XCTUnwrap(future.data.scoring?.match.format).isKnown)
        XCTAssertTrue(future.isContractCompatible, "Unknown formats must remain safely reviewable read-only")
    }

    func testRequiredNullableFieldsDecodeNullWithoutSynthesizingValues() throws {
        let response = try decode(mutating: { scoring in
            var match = scoring["match"] as! [String: Any]
            match["roundNumber"] = NSNull()
            match["result"] = NSNull()
            scoring["match"] = match

            var player = scoring["player"] as! [String: Any]
            player["teamSide"] = NSNull()
            scoring["player"] = player

            var course = scoring["course"] as! [String: Any]
            for key in ["courseId", "name", "tee", "rating", "slope", "par"] {
                course[key] = NSNull()
            }
            scoring["course"] = course

            var scores = scoring["scores"] as! [[String: Any]]
            scores[0]["winner"] = NSNull()
            scores[0]["updatedAt"] = NSNull()
            var net = scores[0]["net"] as! [String: Any]
            net["teamOne"] = NSNull()
            net["teamTwo"] = NSNull()
            scores[0]["net"] = net
            scoring["scores"] = scores

            var progress = scoring["progress"] as! [String: Any]
            progress["statusText"] = NSNull()
            scoring["progress"] = progress

            var permission = scoring["permission"] as! [String: Any]
            permission["reason"] = NSNull()
            scoring["permission"] = permission

            var snapshot = scoring["snapshot"] as! [String: Any]
            snapshot["snapshotId"] = NSNull()
            scoring["snapshot"] = snapshot
        })
        let scoring = try XCTUnwrap(response.data.scoring)

        XCTAssertNil(scoring.match.roundNumber)
        XCTAssertNil(scoring.match.result)
        XCTAssertNil(scoring.player.teamSide)
        XCTAssertNil(scoring.course.courseId)
        XCTAssertNil(scoring.course.name)
        XCTAssertNil(scoring.course.tee)
        XCTAssertNil(scoring.course.rating)
        XCTAssertNil(scoring.course.slope)
        XCTAssertNil(scoring.course.par)
        XCTAssertNil(scoring.scores[0].winner)
        XCTAssertNil(scoring.scores[0].updatedAt)
        XCTAssertNil(scoring.scores[0].net.teamOne)
        XCTAssertNil(scoring.scores[0].net.teamTwo)
        XCTAssertNil(scoring.progress.statusText)
        XCTAssertNil(scoring.permission.reason)
        XCTAssertNil(scoring.snapshot.snapshotId)
        XCTAssertTrue(response.isContractCompatible)
    }

    func testMissingRequiredNullableFieldsFailDecoding() throws {
        for (section, key) in [
            ("match", "result"),
            ("player", "teamSide"),
            ("course", "tee"),
            ("progress", "statusText"),
            ("permission", "reason"),
            ("snapshot", "snapshotId"),
        ] {
            XCTAssertThrowsError(try decode(mutating: { scoring in
                var object = scoring[section] as! [String: Any]
                object.removeValue(forKey: key)
                scoring[section] = object
            }), "Expected missing \(section).\(key) to fail")
        }

        var root = try responseObject()
        var data = root["data"] as! [String: Any]
        data.removeValue(forKey: "scoring")
        root["data"] = data
        XCTAssertThrowsError(
            try decoder.decode(
                MobileScoringCurrentResponse.self,
                from: TestFixtures.jsonData(root)
            )
        )
    }

    func testGrossScoresEnforceExactContractRangeOneThroughTwenty() throws {
        for invalidScore in [0, 21] {
            let response = try decode(mutating: { scoring in
                var scores = scoring["scores"] as! [[String: Any]]
                var gross = scores[0]["gross"] as! [String: Any]
                gross["teamOne"] = [invalidScore, 4]
                scores[0]["gross"] = gross
                scoring["scores"] = scores
            })
            XCTAssertFalse(response.isContractCompatible)
        }

        for validScore in [1, 20] {
            let response = try decode(mutating: { scoring in
                var scores = scoring["scores"] as! [[String: Any]]
                var gross = scores[0]["gross"] as! [String: Any]
                gross["teamOne"] = [validScore, 4]
                scores[0]["gross"] = gross
                scoring["scores"] = scores
            })
            XCTAssertTrue(response.isContractCompatible)
        }
    }

    func testInvalidRevisionsAndHoleBoundsAreContractIncompatible() throws {
        let negativeRevision = try decode(mutating: { scoring in
            var match = scoring["match"] as! [String: Any]
            match["matchRevision"] = -1
            scoring["match"] = match
        })
        XCTAssertFalse(negativeRevision.isContractCompatible)

        let invalidHole = try decode(mutating: { scoring in
            var course = scoring["course"] as! [String: Any]
            var holes = course["holes"] as! [[String: Any]]
            holes[0]["holeNumber"] = 19
            course["holes"] = holes
            scoring["course"] = course
        })
        XCTAssertFalse(invalidHole.isContractCompatible)
    }

    private func decode(
        mutating mutation: (inout [String: Any]) -> Void
    ) throws -> MobileScoringCurrentResponse {
        var root = try responseObject()
        var data = root["data"] as! [String: Any]
        var scoring = data["scoring"] as! [String: Any]
        mutation(&scoring)
        data["scoring"] = scoring
        root["data"] = data
        return try decoder.decode(
            MobileScoringCurrentResponse.self,
            from: TestFixtures.jsonData(root)
        )
    }

    private func responseObject() throws -> [String: Any] {
        let data = try encoder.encode(TestFixtures.scoringResponse)
        return try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
    }
}
