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

    func testHoleMutationRequestEncodesExactV1IntentShape() throws {
        let request = makeHoleRequest()

        XCTAssertTrue(request.isContractCompatible)
        let object = try XCTUnwrap(
            JSONSerialization.jsonObject(with: encoder.encode(request)) as? [String: Any]
        )
        XCTAssertEqual(
            Set(object.keys),
            Set([
                "matchId",
                "holeNumber",
                "teamOneGrossScores",
                "teamTwoGrossScores",
                "mutationId",
                "expectedMatchRevision",
                "expectedHoleRevision",
            ])
        )
        XCTAssertEqual(object["matchId"] as? String, request.matchId)
        XCTAssertEqual(object["holeNumber"] as? Int, request.holeNumber)
        XCTAssertEqual(object["teamOneGrossScores"] as? [Int], request.teamOneGrossScores)
        XCTAssertEqual(object["teamTwoGrossScores"] as? [Int], request.teamTwoGrossScores)
        XCTAssertEqual(object["mutationId"] as? String, request.mutationId)
        XCTAssertEqual(object["expectedMatchRevision"] as? Int, request.expectedMatchRevision)
        XCTAssertEqual(object["expectedHoleRevision"] as? Int, request.expectedHoleRevision)
    }

    func testHoleMutationRequestFailsClosedForInvalidIdentifiersScoresAndRevisions() {
        XCTAssertFalse(makeHoleRequest(mutationID: "-invalid").isContractCompatible)
        XCTAssertFalse(makeHoleRequest(teamOne: [0, 5]).isContractCompatible)
        XCTAssertFalse(makeHoleRequest(teamTwo: [5, 21]).isContractCompatible)
        XCTAssertFalse(makeHoleRequest(expectedMatchRevision: -1).isContractCompatible)
        XCTAssertFalse(makeHoleRequest(expectedHoleRevision: -1).isContractCompatible)
        XCTAssertFalse(makeHoleRequest(holeNumber: 19).isContractCompatible)
    }

    func testHoleAcknowledgementDecodesCanonicalAcceptedResponse() throws {
        let request = makeHoleRequest()
        let response = try decoder.decode(
            MobileScoringHoleResponse.self,
            from: TestFixtures.jsonData(acknowledgementObject(for: request))
        )

        XCTAssertTrue(response.isContractCompatible)
        XCTAssertTrue(response.isContractCompatible(for: request))
        XCTAssertEqual(response.data.mutationId, request.mutationId)
        XCTAssertTrue(response.data.accepted)
        XCTAssertFalse(response.data.idempotent)
        XCTAssertFalse(response.data.semanticNoop)
        XCTAssertEqual(response.data.matchId, request.matchId)
        XCTAssertEqual(response.data.hole.holeNumber, request.holeNumber)
        XCTAssertEqual(response.data.hole.revision, 4)
        XCTAssertEqual(response.data.match.revision, 13)
        XCTAssertEqual(response.data.match.status, .inProgress)
        XCTAssertEqual(response.data.match.currentHole, 8)
        XCTAssertEqual(response.data.match.statusText, "1 UP through 7")
    }

    func testHoleAcknowledgementRequiresAcceptedAndMatchingRequestIdentity() throws {
        let request = makeHoleRequest()
        var rejectedObject = acknowledgementObject(for: request)
        var rejectedData = rejectedObject["data"] as! [String: Any]
        rejectedData["accepted"] = false
        rejectedObject["data"] = rejectedData
        let rejected = try decoder.decode(
            MobileScoringHoleResponse.self,
            from: TestFixtures.jsonData(rejectedObject)
        )
        XCTAssertFalse(rejected.isContractCompatible)

        let otherMutation = makeHoleRequest(
            mutationID: "22222222-2222-4222-8222-222222222222"
        )
        let accepted = try decoder.decode(
            MobileScoringHoleResponse.self,
            from: TestFixtures.jsonData(acknowledgementObject(for: request))
        )
        XCTAssertFalse(accepted.isContractCompatible(for: otherMutation))
    }

    func testHoleAcknowledgementRequiresNullableStatusTextKey() throws {
        let request = makeHoleRequest()
        var root = acknowledgementObject(for: request)
        var data = root["data"] as! [String: Any]
        var match = data["match"] as! [String: Any]
        match.removeValue(forKey: "statusText")
        data["match"] = match
        root["data"] = data

        XCTAssertThrowsError(
            try decoder.decode(
                MobileScoringHoleResponse.self,
                from: TestFixtures.jsonData(root)
            )
        )
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

    private func makeHoleRequest(
        mutationID: String = "11111111-1111-4111-8111-111111111111",
        teamOne: [Int] = [4, 5],
        teamTwo: [Int] = [5, 6],
        expectedMatchRevision: Int = 12,
        expectedHoleRevision: Int = 3,
        holeNumber: Int = 7
    ) -> MobileScoringHoleRequest {
        MobileScoringHoleRequest(
            matchId: "match-preview-1",
            holeNumber: holeNumber,
            teamOneGrossScores: teamOne,
            teamTwoGrossScores: teamTwo,
            mutationId: mutationID,
            expectedMatchRevision: expectedMatchRevision,
            expectedHoleRevision: expectedHoleRevision
        )
    }

    private func acknowledgementObject(
        for request: MobileScoringHoleRequest
    ) -> [String: Any] {
        [
            "ok": true,
            "apiVersion": "v1",
            "data": [
                "mutationId": request.mutationId,
                "accepted": true,
                "idempotent": false,
                "semanticNoop": false,
                "matchId": request.matchId,
                "hole": [
                    "holeNumber": request.holeNumber,
                    "revision": 4,
                    "gross": [
                        "teamOne": request.teamOneGrossScores,
                        "teamTwo": request.teamTwoGrossScores,
                    ],
                    "strokes": [
                        "teamOne": [1, 0],
                        "teamTwo": [0, 1],
                    ],
                    "net": [
                        "teamOne": 3,
                        "teamTwo": 5,
                    ],
                    "winner": "teamOne",
                    "updatedAt": "2027-01-15T08:03:00.000Z",
                ],
                "match": [
                    "revision": 13,
                    "status": "inProgress",
                    "currentHole": 8,
                    "holesRemaining": 11,
                    "scorecardComplete": false,
                    "statusText": "1 UP through 7",
                ],
                "refreshRequired": false,
            ],
            "meta": [
                "generatedAt": "2027-01-15T08:03:00.000Z",
            ],
        ]
    }
}
