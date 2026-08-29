import XCTest
@testable import BaggerInv

@MainActor
final class MobileReadAPIClientTests: XCTestCase {
    private let accessToken = "read-access-token-never-log"
    private let certification = "read-certification-never-log"

    func testAllReadProductsUseCentralizedProtectedHeadersAndCertifiedPaths() async throws {
        let transport = ScriptedMobileReadHTTPTransport(steps: [
            .response(status: 200, data: try ReadResponseFixtures.today(), headers: [:]),
            .response(status: 200, data: try ReadResponseFixtures.matches(), headers: [:]),
            .response(status: 200, data: try ReadResponseFixtures.leaders(), headers: [:]),
            .response(status: 200, data: try ReadResponseFixtures.schedule(), headers: [:]),
        ])
        let client = MobileAPIClient(baseURL: NativeEnvironment.previewAPIURL, transport: transport)

        _ = try await client.today(accessToken: accessToken, certification: certification, etag: nil)
        _ = try await client.matches(accessToken: accessToken, certification: certification, etag: nil)
        _ = try await client.leaders(accessToken: accessToken, certification: certification, etag: nil)
        _ = try await client.schedule(accessToken: accessToken, certification: certification, etag: nil)

        let requests = await transport.recordedRequests()
        XCTAssertEqual(
            requests.compactMap(\.url?.path),
            [
                "/api/mobile/v1/today",
                "/api/mobile/v1/matches",
                "/api/mobile/v1/leaders",
                "/api/mobile/v1/schedule",
            ]
        )
        for request in requests {
            XCTAssertEqual(request.httpMethod, "GET")
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer \(accessToken)")
            XCTAssertEqual(request.value(forHTTPHeaderField: "X-Bagger-Certification"), certification)
            XCTAssertEqual(request.value(forHTTPHeaderField: "Cache-Control"), "no-cache")
        }
    }

    func testPublicAndProtectedRequestsKeepAuthenticationHeadersSeparated() async throws {
        let healthData = try TestFixtures.jsonData(TestFixtures.healthObject())
        let transport = ScriptedMobileReadHTTPTransport(steps: [
            .response(status: 200, data: healthData, headers: [:]),
            .response(status: 200, data: try ReadResponseFixtures.today(), headers: [:]),
        ])
        let client = MobileAPIClient(baseURL: NativeEnvironment.previewAPIURL, transport: transport)

        _ = try await client.health()
        _ = try await client.today(accessToken: accessToken, certification: certification, etag: nil)

        let requests = await transport.recordedRequests()
        XCTAssertEqual(requests.count, 2)
        XCTAssertNil(requests[0].value(forHTTPHeaderField: "Authorization"))
        XCTAssertNil(requests[0].value(forHTTPHeaderField: "X-Bagger-Certification"))
        XCTAssertEqual(requests[1].value(forHTTPHeaderField: "Authorization"), "Bearer \(accessToken)")
        XCTAssertEqual(requests[1].value(forHTTPHeaderField: "X-Bagger-Certification"), certification)
    }

    func testWeakQuotedETagRoundTripsExactlyAndCapturesResponseETag() async throws {
        let cachedETag = #"W/\"today-revision-17\""#
        let returnedETag = #"W/\"today-revision-18\""#
        let transport = ScriptedMobileReadHTTPTransport(steps: [
            .response(
                status: 200,
                data: try ReadResponseFixtures.today(revision: "revision-18"),
                headers: ["ETag": returnedETag]
            ),
        ])
        let client = MobileAPIClient(baseURL: NativeEnvironment.previewAPIURL, transport: transport)

        let result = try await client.today(
            accessToken: accessToken,
            certification: certification,
            etag: cachedETag
        )

        let recordedRequests = await transport.recordedRequests()
        let request = try XCTUnwrap(recordedRequests.first)
        XCTAssertEqual(request.value(forHTTPHeaderField: "If-None-Match"), cachedETag)
        guard case .modified(let response, let etag) = result else {
            return XCTFail("Expected a modified response")
        }
        XCTAssertEqual(response.meta.revision, "revision-18")
        XCTAssertEqual(etag, returnedETag)
    }

    func testNotModifiedAcceptsEmptyBodyAndCapturesReturnedETag() async throws {
        let requestETag = #"\"matches-revision-4\""#
        let returnedETag = #"W/\"matches-revision-4\""#
        let transport = ScriptedMobileReadHTTPTransport(steps: [
            .response(status: 304, data: Data(), headers: ["ETag": returnedETag]),
        ])
        let client = MobileAPIClient(baseURL: NativeEnvironment.previewAPIURL, transport: transport)

        let result = try await client.matches(
            accessToken: accessToken,
            certification: certification,
            etag: requestETag
        )

        let recordedRequests = await transport.recordedRequests()
        let request = try XCTUnwrap(recordedRequests.first)
        XCTAssertEqual(request.value(forHTTPHeaderField: "If-None-Match"), requestETag)
        guard case .notModified(let etag) = result else {
            return XCTFail("Expected a not-modified response")
        }
        XCTAssertEqual(etag, returnedETag)
    }

    func testNilETagOmitsConditionalRequestHeader() async throws {
        let transport = ScriptedMobileReadHTTPTransport(steps: [
            .response(status: 200, data: try ReadResponseFixtures.schedule(), headers: [:]),
        ])
        let client = MobileAPIClient(baseURL: NativeEnvironment.previewAPIURL, transport: transport)

        _ = try await client.schedule(accessToken: accessToken, certification: certification, etag: nil)

        let recordedRequests = await transport.recordedRequests()
        let request = try XCTUnwrap(recordedRequests.first)
        XCTAssertNil(request.value(forHTTPHeaderField: "If-None-Match"))
    }

    func testMissingBearerOrCertificationFailsBeforeTransport() async throws {
        let transport = ScriptedMobileReadHTTPTransport(steps: [])
        let client = MobileAPIClient(baseURL: NativeEnvironment.previewAPIURL, transport: transport)

        do {
            _ = try await client.today(accessToken: "", certification: certification, etag: nil)
            XCTFail("Expected missing Bearer to fail")
        } catch {
            XCTAssertEqual(error as? MobileAPIClientError, .missingBearer)
        }

        do {
            _ = try await client.leaders(accessToken: accessToken, certification: "", etag: nil)
            XCTFail("Expected missing certification to fail")
        } catch {
            XCTAssertEqual(error as? MobileAPIClientError, .missingCertification)
        }

        let requestCount = await transport.requestCount()
        XCTAssertEqual(requestCount, 0)
    }

    func testProtectedReadStatusErrorsMapToStableServerErrors() async throws {
        let cases: [(Int, MobileErrorCode)] = [
            (401, .unauthorized),
            (403, .authCertificationFailed),
            (429, .mobileAPIUnavailable),
            (503, .mobileAPIUnavailable),
        ]

        for (status, code) in cases {
            let transport = ScriptedMobileReadHTTPTransport(steps: [
                .response(
                    status: status,
                    data: try ReadResponseFixtures.error(code: code),
                    headers: [:]
                ),
            ])
            let client = MobileAPIClient(baseURL: NativeEnvironment.previewAPIURL, transport: transport)

            do {
                _ = try await client.today(accessToken: accessToken, certification: certification, etag: nil)
                XCTFail("Expected HTTP \(status) to fail")
            } catch {
                XCTAssertEqual(
                    error as? MobileAPIClientError,
                    .server(code: code, status: status),
                    "Unexpected mapping for HTTP \(status)"
                )
            }
        }
    }

    func testMalformedSuccessAndWrongAPIVersionFailAsContractErrors() async throws {
        let transport = ScriptedMobileReadHTTPTransport(steps: [
            .response(status: 200, data: try ReadResponseFixtures.todayMissingCurrentMatch(), headers: [:]),
            .response(status: 200, data: try ReadResponseFixtures.today(apiVersion: "v2"), headers: [:]),
        ])
        let client = MobileAPIClient(baseURL: NativeEnvironment.previewAPIURL, transport: transport)

        for _ in 0..<2 {
            do {
                _ = try await client.today(
                    accessToken: accessToken,
                    certification: certification,
                    etag: nil
                )
                XCTFail("Expected incompatible HTTP 200 response to fail")
            } catch {
                XCTAssertEqual(error as? MobileContractError, .incompatibleResponse)
            }
        }
    }

    func testCancellationPropagatesAndDoesNotBecomeTransportUnavailable() async throws {
        let transport = ScriptedMobileReadHTTPTransport(steps: [.waitForCancellation])
        let client = MobileAPIClient(baseURL: NativeEnvironment.previewAPIURL, transport: transport)
        let task = Task {
            try await client.today(accessToken: accessToken, certification: certification, etag: nil)
        }

        for _ in 0..<1_000 where await transport.requestCount() == 0 {
            await Task.yield()
        }
        let requestCount = await transport.requestCount()
        XCTAssertEqual(requestCount, 1)
        task.cancel()

        do {
            _ = try await task.value
            XCTFail("Expected cancellation")
        } catch is CancellationError {
            // Cancellation is deliberately preserved as a control-flow signal.
        } catch {
            XCTFail("Expected CancellationError, received \(String(describing: type(of: error)))")
        }
    }

    func testServerAndTransportDiagnosticsNeverIncludeCredentials() async throws {
        let errorData = try ReadResponseFixtures.error(
            code: .unauthorized,
            message: "Rejected \(accessToken) with \(certification)"
        )
        let transport = ScriptedMobileReadHTTPTransport(steps: [
            .response(status: 401, data: errorData, headers: [:]),
        ])
        let client = MobileAPIClient(baseURL: NativeEnvironment.previewAPIURL, transport: transport)

        do {
            _ = try await client.today(accessToken: accessToken, certification: certification, etag: nil)
            XCTFail("Expected authentication failure")
        } catch {
            let diagnostic = String(describing: error)
            XCTAssertFalse(diagnostic.contains(accessToken))
            XCTAssertFalse(diagnostic.contains(certification))
            XCTAssertEqual(diagnostic, "server_UNAUTHORIZED_401")
        }

        let genericTransport = ScriptedMobileReadHTTPTransport(steps: [.failure(.planned)])
        let genericClient = MobileAPIClient(baseURL: NativeEnvironment.previewAPIURL, transport: genericTransport)
        do {
            _ = try await genericClient.today(
                accessToken: accessToken,
                certification: certification,
                etag: nil
            )
            XCTFail("Expected transport failure")
        } catch {
            let diagnostic = String(describing: error)
            XCTAssertEqual(error as? MobileAPIClientError, .transportUnavailable)
            XCTAssertFalse(diagnostic.contains(accessToken))
            XCTAssertFalse(diagnostic.contains(certification))
        }
    }
}

private actor ScriptedMobileReadHTTPTransport: HTTPTransporting {
    enum PlannedFailure: Error, Sendable {
        case planned
    }

    enum Step: Sendable {
        case response(status: Int, data: Data, headers: [String: String])
        case failure(PlannedFailure)
        case waitForCancellation
    }

    private var steps: [Step]
    private var requests: [URLRequest] = []

    init(steps: [Step]) {
        self.steps = steps
    }

    func data(for request: URLRequest) async throws -> HTTPTransportResult {
        requests.append(request)
        guard !steps.isEmpty else { throw PlannedFailure.planned }
        let step = steps.removeFirst()
        switch step {
        case .response(let status, let data, let headers):
            let response = HTTPURLResponse(
                url: request.url!,
                statusCode: status,
                httpVersion: "HTTP/1.1",
                headerFields: headers
            )!
            return HTTPTransportResult(data: data, response: response)
        case .failure(let error):
            throw error
        case .waitForCancellation:
            try await Task.sleep(nanoseconds: 60_000_000_000)
            throw PlannedFailure.planned
        }
    }

    func recordedRequests() -> [URLRequest] {
        requests
    }

    func requestCount() -> Int {
        requests.count
    }
}

private enum ReadResponseFixtures {
    static func today(
        revision: String = "today-revision-1",
        apiVersion: String = "v1"
    ) throws -> Data {
        try response(
            data: [
                "tournament": tournament(),
                "player": [
                    "playerId": "player-preview-1",
                    "displayName": "Preview Golfer",
                    "team": ["teamId": "team-preview-1", "name": "Preview Team"],
                ],
                "currentMatch": NSNull(),
                "immediateSchedule": [],
            ],
            revision: revision,
            apiVersion: apiVersion
        )
    }

    static func todayMissingCurrentMatch() throws -> Data {
        try response(
            data: [
                "tournament": tournament(),
                "player": [
                    "playerId": "player-preview-1",
                    "displayName": "Preview Golfer",
                    "team": ["teamId": "team-preview-1", "name": "Preview Team"],
                ],
                "immediateSchedule": [],
            ],
            revision: "today-revision-malformed"
        )
    }

    static func matches(revision: String = "matches-revision-1") throws -> Data {
        try response(data: ["tournament": tournament(), "matches": []], revision: revision)
    }

    static func leaders(revision: String = "leaders-revision-1") throws -> Data {
        try response(
            data: [
                "tournament": tournament(),
                "teamStandings": [],
                "playerStandings": [],
            ],
            revision: revision
        )
    }

    static func schedule(revision: String = "schedule-revision-1") throws -> Data {
        try response(
            data: [
                "tournamentId": "tournament-preview-1",
                "timeZone": "America/Chicago",
                "events": [],
            ],
            revision: revision
        )
    }

    static func error(code: MobileErrorCode, message: String = "Request unavailable") throws -> Data {
        try JSONSerialization.data(
            withJSONObject: [
                "ok": false,
                "apiVersion": "v1",
                "error": ["code": code.rawValue, "message": message],
            ],
            options: [.sortedKeys]
        )
    }

    private static func tournament() -> [String: Any] {
        [
            "tournamentId": "tournament-preview-1",
            "name": "Preview Invitational",
            "year": 2026,
            "status": "active",
            "currentRound": 1,
            "timeZone": "America/Chicago",
        ]
    }

    private static func response(
        data: [String: Any],
        revision: String,
        apiVersion: String = "v1"
    ) throws -> Data {
        try JSONSerialization.data(
            withJSONObject: [
                "ok": true,
                "apiVersion": apiVersion,
                "data": data,
                "meta": [
                    "generatedAt": "2026-08-28T18:00:00.000Z",
                    "revision": revision,
                ],
            ],
            options: [.sortedKeys]
        )
    }
}
