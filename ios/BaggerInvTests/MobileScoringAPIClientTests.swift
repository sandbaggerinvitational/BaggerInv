import XCTest
@testable import BaggerInv

@MainActor
final class MobileScoringAPIClientTests: XCTestCase {
    private let accessToken = "scoring-access-token-never-log"
    private let certification = "scoring-certification-never-log"

    func testCurrentScoringUsesCertifiedGETNoStoreWithoutConditionalCaching() async throws {
        let transport = RecordingHTTPTransport(
            statusCode: 200,
            responseData: try JSONEncoder().encode(TestFixtures.scoringResponse)
        )
        let client = MobileAPIClient(baseURL: NativeEnvironment.previewAPIURL, transport: transport)

        let response = try await client.scoringCurrent(
            accessToken: accessToken,
            certification: certification,
            matchID: "match:round-2.7"
        )

        XCTAssertTrue(response.isContractCompatible)
        let request = try XCTUnwrap(transport.requests.first)
        XCTAssertEqual(request.httpMethod, "GET")
        XCTAssertEqual(request.url?.path, "/api/mobile/v1/scoring/current")
        XCTAssertEqual(
            URLComponents(url: try XCTUnwrap(request.url), resolvingAgainstBaseURL: false)?.queryItems,
            [URLQueryItem(name: "matchId", value: "match:round-2.7")]
        )
        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer \(accessToken)")
        XCTAssertEqual(request.value(forHTTPHeaderField: "X-Bagger-Certification"), certification)
        XCTAssertEqual(request.value(forHTTPHeaderField: "Cache-Control"), "no-store")
        XCTAssertNil(request.value(forHTTPHeaderField: "If-None-Match"))
        XCTAssertEqual(request.timeoutInterval, 20)
        XCTAssertEqual(request.cachePolicy, .reloadIgnoringLocalCacheData)
    }

    func testUnscopedCurrentScoringOmitsMatchQuery() async throws {
        let transport = RecordingHTTPTransport(
            statusCode: 200,
            responseData: try JSONEncoder().encode(TestFixtures.scoringResponse)
        )
        let client = MobileAPIClient(baseURL: NativeEnvironment.previewAPIURL, transport: transport)

        _ = try await client.scoringCurrent(
            accessToken: accessToken,
            certification: certification,
            matchID: nil
        )

        let request = try XCTUnwrap(transport.requests.first)
        XCTAssertNil(request.url?.query)
    }

    func testMissingCredentialsAndEmptyMatchIDFailBeforeTransport() async throws {
        let transport = RecordingHTTPTransport(statusCode: 200, responseData: Data())
        let client = MobileAPIClient(baseURL: NativeEnvironment.previewAPIURL, transport: transport)

        await assertFailure(.missingBearer) {
            try await client.scoringCurrent(
                accessToken: "",
                certification: certification,
                matchID: nil
            )
        }
        await assertFailure(.missingCertification) {
            try await client.scoringCurrent(
                accessToken: accessToken,
                certification: "",
                matchID: nil
            )
        }
        await assertFailure(.invalidURL) {
            try await client.scoringCurrent(
                accessToken: accessToken,
                certification: certification,
                matchID: ""
            )
        }

        XCTAssertTrue(transport.requests.isEmpty)
    }

    func testScoringServerErrorsPreserveStableCodesWithoutCredentialsInDiagnostics() async throws {
        for (status, code) in [
            (401, MobileErrorCode.unauthorized),
            (403, MobileErrorCode.scoringNotAuthorized),
            (404, MobileErrorCode.matchNotFound),
            (503, MobileErrorCode.scoringUnavailable),
        ] {
            let body = try TestFixtures.jsonData([
                "ok": false,
                "apiVersion": "v1",
                "error": [
                    "code": code.rawValue,
                    "message": "Rejected \(accessToken) and \(certification)",
                ],
            ])
            let transport = RecordingHTTPTransport(statusCode: status, responseData: body)
            let client = MobileAPIClient(baseURL: NativeEnvironment.previewAPIURL, transport: transport)

            do {
                _ = try await client.scoringCurrent(
                    accessToken: accessToken,
                    certification: certification,
                    matchID: nil
                )
                XCTFail("Expected HTTP \(status) failure")
            } catch {
                XCTAssertEqual(error as? MobileAPIClientError, .server(code: code, status: status))
                XCTAssertFalse(String(describing: error).contains(accessToken))
                XCTAssertFalse(String(describing: error).contains(certification))
            }
        }
    }

    func testMalformedOrStructurallyInvalidSuccessFailsClosed() async throws {
        var object = try XCTUnwrap(
            JSONSerialization.jsonObject(with: JSONEncoder().encode(TestFixtures.scoringResponse)) as? [String: Any]
        )
        var data = object["data"] as! [String: Any]
        var scoring = data["scoring"] as! [String: Any]
        var scores = scoring["scores"] as! [[String: Any]]
        var gross = scores[0]["gross"] as! [String: Any]
        gross["teamOne"] = [0, 4]
        scores[0]["gross"] = gross
        scoring["scores"] = scores
        data["scoring"] = scoring
        object["data"] = data

        let transport = RecordingHTTPTransport(
            statusCode: 200,
            responseData: try TestFixtures.jsonData(object)
        )
        let client = MobileAPIClient(baseURL: NativeEnvironment.previewAPIURL, transport: transport)

        do {
            _ = try await client.scoringCurrent(
                accessToken: accessToken,
                certification: certification,
                matchID: nil
            )
            XCTFail("Expected invalid official gross score to fail closed")
        } catch {
            XCTAssertEqual(error as? MobileContractError, .incompatibleResponse)
        }
    }

    func testTransportCancellationRemainsCancellation() async throws {
        let transport = RecordingHTTPTransport(statusCode: 200, responseData: Data())
        transport.error = CancellationError()
        let client = MobileAPIClient(baseURL: NativeEnvironment.previewAPIURL, transport: transport)

        do {
            _ = try await client.scoringCurrent(
                accessToken: accessToken,
                certification: certification,
                matchID: nil
            )
            XCTFail("Expected cancellation")
        } catch is CancellationError {
            // Cancellation is control flow, not an unavailable-network error.
        } catch {
            XCTFail("Expected CancellationError, got \(error)")
        }
    }

    func testHoleMutationUsesCertifiedPOSTWithExactNoStoreBody() async throws {
        let intent = makeHoleRequest()
        let transport = RecordingHTTPTransport(
            statusCode: 200,
            responseData: try acknowledgementData(for: intent)
        )
        let client = MobileAPIClient(baseURL: NativeEnvironment.previewAPIURL, transport: transport)

        let response = try await client.scoringHole(
            request: intent,
            accessToken: accessToken,
            certification: certification
        )

        XCTAssertTrue(response.isContractCompatible(for: intent))
        let request = try XCTUnwrap(transport.requests.first)
        XCTAssertEqual(request.httpMethod, "POST")
        XCTAssertEqual(request.url?.path, "/api/mobile/v1/scoring/hole")
        XCTAssertNil(request.url?.query)
        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer \(accessToken)")
        XCTAssertEqual(request.value(forHTTPHeaderField: "X-Bagger-Certification"), certification)
        XCTAssertEqual(request.value(forHTTPHeaderField: "Cache-Control"), "no-store")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Content-Type"), "application/json")
        XCTAssertNil(request.value(forHTTPHeaderField: "If-None-Match"))
        XCTAssertEqual(
            try JSONDecoder().decode(MobileScoringHoleRequest.self, from: XCTUnwrap(request.httpBody)),
            intent
        )
    }

    func testHoleMutationInvalidIntentAndCredentialsAreDefinitelyNotSent() async throws {
        let transport = RecordingHTTPTransport(statusCode: 200, responseData: Data())
        let client = MobileAPIClient(baseURL: NativeEnvironment.previewAPIURL, transport: transport)
        let invalidIntent = MobileScoringHoleRequest(
            matchId: "",
            holeNumber: 7,
            teamOneGrossScores: [4, 5],
            teamTwoGrossScores: [5, 6],
            mutationId: "11111111-1111-4111-8111-111111111111",
            expectedMatchRevision: 12,
            expectedHoleRevision: 3
        )

        await assertMutationError(.definitelyNotSent(.invalidRequest)) {
            try await client.scoringHole(
                request: invalidIntent,
                accessToken: accessToken,
                certification: certification
            )
        }
        await assertMutationError(.definitelyNotSent(.missingBearer)) {
            try await client.scoringHole(
                request: self.makeHoleRequest(),
                accessToken: "",
                certification: self.certification
            )
        }
        await assertMutationError(.definitelyNotSent(.missingCertification)) {
            try await client.scoringHole(
                request: self.makeHoleRequest(),
                accessToken: self.accessToken,
                certification: ""
            )
        }

        XCTAssertTrue(transport.requests.isEmpty)
    }

    func testHoleMutationTransportFailureAndCancellationAreUnknownOutcome() async throws {
        for (transportError, expectedReason) in [
            (StubError.planned as any Error, MobileScoringMutationUnknownReason.transport),
            (CancellationError() as any Error, MobileScoringMutationUnknownReason.cancelled),
        ] {
            let transport = RecordingHTTPTransport(statusCode: 200, responseData: Data())
            transport.error = transportError
            let client = MobileAPIClient(baseURL: NativeEnvironment.previewAPIURL, transport: transport)

            do {
                _ = try await client.scoringHole(
                    request: makeHoleRequest(),
                    accessToken: accessToken,
                    certification: certification
                )
                XCTFail("Expected an unknown mutation outcome")
            } catch let error as MobileScoringMutationError {
                guard case .unknownOutcome(let reason, let code, let status, let data, let retryAfter) = error else {
                    XCTFail("Expected unknown outcome, got \(error)")
                    continue
                }
                XCTAssertEqual(reason, expectedReason)
                XCTAssertNil(code)
                XCTAssertNil(status)
                XCTAssertNil(data)
                XCTAssertNil(retryAfter)
                XCTAssertEqual(error.outcomeCertainty, .unknown)
            }
            XCTAssertEqual(transport.requests.count, 1)
        }
    }

    func testHoleMutationRevisionConflictPreservesBoundedContextAndRetryAfter() async throws {
        let intent = makeHoleRequest()
        let body = try TestFixtures.jsonData([
            "ok": false,
            "apiVersion": "v1",
            "error": [
                "code": MobileErrorCode.revisionConflict.rawValue,
                "message": "Rejected \(accessToken) and \(certification)",
            ],
            "data": [
                "matchId": intent.matchId,
                "currentMatchRevision": 14,
                "currentHoleRevision": 5,
                "currentPermissionRevision": 4,
                "scoredHoles": 7,
                "refreshRequired": true,
            ],
        ])
        let transport = HeaderRecordingHTTPTransport(
            statusCode: 409,
            responseData: body,
            headers: ["Retry-After": "17"]
        )
        let client = MobileAPIClient(baseURL: NativeEnvironment.previewAPIURL, transport: transport)

        do {
            _ = try await client.scoringHole(
                request: intent,
                accessToken: accessToken,
                certification: certification
            )
            XCTFail("Expected revision conflict")
        } catch let error as MobileScoringMutationError {
            guard case .rejected(let code, let status, let data, let retryAfter) = error else {
                XCTFail("Expected known rejection, got \(error)")
                return
            }
            XCTAssertEqual(code, .revisionConflict)
            XCTAssertEqual(status, 409)
            XCTAssertEqual(data?.matchId, intent.matchId)
            XCTAssertEqual(data?.currentMatchRevision, 14)
            XCTAssertEqual(data?.currentHoleRevision, 5)
            XCTAssertEqual(retryAfter, .delay(17))
            XCTAssertEqual(error.outcomeCertainty, .knownRejected)
            XCTAssertFalse(error.description.contains(accessToken))
            XCTAssertFalse(error.description.contains(certification))
        }
    }

    func testHoleMutationRaw429WithoutV1EnvelopePreservesRetryableRejection() async throws {
        let intent = makeHoleRequest()
        let transport = HeaderRecordingHTTPTransport(
            statusCode: 429,
            responseData: Data("rate limited".utf8),
            headers: ["Retry-After": "17"]
        )
        let client = MobileAPIClient(baseURL: NativeEnvironment.previewAPIURL, transport: transport)

        do {
            _ = try await client.scoringHole(
                request: intent,
                accessToken: accessToken,
                certification: certification
            )
            XCTFail("Expected rate-limit rejection")
        } catch let error as MobileScoringMutationError {
            guard case .rejected(let code, let status, let data, let retryAfter) = error else {
                return XCTFail("Expected bounded known rejection, got \(error)")
            }
            XCTAssertNil(code)
            XCTAssertEqual(status, 429)
            XCTAssertNil(data)
            XCTAssertEqual(retryAfter, .delay(17))
            XCTAssertEqual(error.outcomeCertainty, .knownRejected)
            XCTAssertFalse(error.description.contains(accessToken))
            XCTAssertFalse(error.description.contains(certification))
        }
    }

    func testHoleMutationServerFailureIsUnknownOutcomeWithSameBoundedDiagnostics() async throws {
        let intent = makeHoleRequest()
        let body = try TestFixtures.jsonData([
            "ok": false,
            "apiVersion": "v1",
            "error": [
                "code": MobileErrorCode.internalError.rawValue,
                "message": "Internal failure",
            ],
            "data": [
                "matchId": intent.matchId,
                "refreshRequired": true,
            ],
        ])
        let transport = HeaderRecordingHTTPTransport(
            statusCode: 500,
            responseData: body,
            headers: ["Retry-After": "Wed, 21 Oct 2015 07:28:00 GMT"]
        )
        let client = MobileAPIClient(baseURL: NativeEnvironment.previewAPIURL, transport: transport)

        do {
            _ = try await client.scoringHole(
                request: intent,
                accessToken: accessToken,
                certification: certification
            )
            XCTFail("Expected unknown server outcome")
        } catch let error as MobileScoringMutationError {
            guard case .unknownOutcome(let reason, let code, let status, let data, let retryAfter) = error else {
                XCTFail("Expected unknown outcome, got \(error)")
                return
            }
            XCTAssertEqual(reason, .serverFailure)
            XCTAssertEqual(code, .internalError)
            XCTAssertEqual(status, 500)
            XCTAssertEqual(data?.matchId, intent.matchId)
            if case .some(.date) = retryAfter {
                // Parsed HTTP-date retained for the queue's deterministic clock.
            } else {
                XCTFail("Expected parsed HTTP-date Retry-After")
            }
        }
    }

    func testHoleMutationMismatchedAcknowledgementIsUnknownOutcome() async throws {
        let intent = makeHoleRequest()
        var object = try acknowledgementObject(for: intent)
        var data = object["data"] as! [String: Any]
        data["mutationId"] = "22222222-2222-4222-8222-222222222222"
        object["data"] = data
        let transport = RecordingHTTPTransport(
            statusCode: 200,
            responseData: try TestFixtures.jsonData(object)
        )
        let client = MobileAPIClient(baseURL: NativeEnvironment.previewAPIURL, transport: transport)

        do {
            _ = try await client.scoringHole(
                request: intent,
                accessToken: accessToken,
                certification: certification
            )
            XCTFail("Expected invalid acknowledgement")
        } catch let error as MobileScoringMutationError {
            guard case .unknownOutcome(let reason, _, let status, _, _) = error else {
                XCTFail("Expected unknown outcome, got \(error)")
                return
            }
            XCTAssertEqual(reason, .invalidAcknowledgement)
            XCTAssertEqual(status, 200)
        }
    }

    func testHoleMutationDropsUnboundedOrCrossMatchErrorContext() async throws {
        let intent = makeHoleRequest()
        let body = try TestFixtures.jsonData([
            "ok": false,
            "apiVersion": "v1",
            "error": [
                "code": MobileErrorCode.revisionConflict.rawValue,
                "message": "Conflict",
            ],
            "data": [
                "matchId": "another-match",
                "currentMatchRevision": 14,
                "refreshRequired": true,
            ],
        ])
        let transport = RecordingHTTPTransport(statusCode: 409, responseData: body)
        let client = MobileAPIClient(baseURL: NativeEnvironment.previewAPIURL, transport: transport)

        do {
            _ = try await client.scoringHole(
                request: intent,
                accessToken: accessToken,
                certification: certification
            )
            XCTFail("Expected rejection")
        } catch let error as MobileScoringMutationError {
            guard case .rejected(let code, let status, let data, _) = error else {
                XCTFail("Expected rejection, got \(error)")
                return
            }
            XCTAssertEqual(code, .revisionConflict)
            XCTAssertEqual(status, 409)
            XCTAssertNil(data)
        }
    }

    private func assertFailure(
        _ expected: MobileAPIClientError,
        operation: () async throws -> MobileScoringCurrentResponse
    ) async {
        do {
            _ = try await operation()
            XCTFail("Expected \(expected)")
        } catch {
            XCTAssertEqual(error as? MobileAPIClientError, expected)
        }
    }

    private func assertMutationError(
        _ expected: MobileScoringMutationError,
        operation: () async throws -> MobileScoringHoleResponse
    ) async {
        do {
            _ = try await operation()
            XCTFail("Expected \(expected)")
        } catch {
            XCTAssertEqual(error as? MobileScoringMutationError, expected)
        }
    }

    private func makeHoleRequest() -> MobileScoringHoleRequest {
        MobileScoringHoleRequest(
            matchId: "match-preview-1",
            holeNumber: 7,
            teamOneGrossScores: [4, 5],
            teamTwoGrossScores: [5, 6],
            mutationId: "11111111-1111-4111-8111-111111111111",
            expectedMatchRevision: 12,
            expectedHoleRevision: 3
        )
    }

    private func acknowledgementData(
        for request: MobileScoringHoleRequest
    ) throws -> Data {
        try TestFixtures.jsonData(acknowledgementObject(for: request))
    }

    private func acknowledgementObject(
        for request: MobileScoringHoleRequest
    ) throws -> [String: Any] {
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

private final class HeaderRecordingHTTPTransport: HTTPTransporting, @unchecked Sendable {
    private(set) var requests: [URLRequest] = []
    let statusCode: Int
    let responseData: Data
    let headers: [String: String]

    init(statusCode: Int, responseData: Data, headers: [String: String]) {
        self.statusCode = statusCode
        self.responseData = responseData
        self.headers = headers
    }

    func data(for request: URLRequest) async throws -> HTTPTransportResult {
        requests.append(request)
        let response = HTTPURLResponse(
            url: request.url!,
            statusCode: statusCode,
            httpVersion: "HTTP/1.1",
            headerFields: headers.merging(["Content-Type": "application/json"]) { current, _ in current }
        )!
        return HTTPTransportResult(data: responseData, response: response)
    }
}
