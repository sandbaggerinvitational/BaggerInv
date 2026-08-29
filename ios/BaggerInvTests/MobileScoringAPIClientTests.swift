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
}
