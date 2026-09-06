import Foundation
import XCTest
@testable import BaggerInv

enum OpaqueMatchIDFixtures {
    // Mirrors every valid shared opaque-match-id-fixtures.json case without
    // requiring a Simulator test to read the host's source checkout.
    static let validIDs = [
        "2026-R1-2",
        " match",
        "match ",
        "match:round/2#opaque",
        "match with reserved characters",
        " \t\n\r ",
        "match/round/2",
        "match#opaque",
        "match:round:2",
        "match%2F%23%20%252F",
        "match-🏌️-𐐀",
        "match-é",
        "match-e\u{301}",
        "...",
        "match/../.",
        "nxtPmatchId",
        "nxtImatchId",
        "nxtPmatchId=match%2F2",
        "_NEXTSEP_",
        "_NEXTSEP_match:round/2#opaque",
        "match?viewer=other&next=1+2",
        "match%2Fnot-a-slash%23not-a-fragment",
        "../match",
        "/",
        "#",
        ":",
        " ",
        "match\\backslash",
        "大会:🏌/é#opaque",
        "café",
        "cafe\u{301}",
        String(repeating: "m", count: 200),
        String(repeating: "🏌", count: 200),
        String(repeating: "𐐀", count: 150),
        String(repeating: "m🏌", count: 100),
        "e" + String(repeating: "\u{301}", count: 199),
    ]

    static let invalidIDs = [
        "", ".", "..", "match\u{0}id", "\u{0}",
        String(repeating: "m", count: 201),
        String(repeating: "🏌", count: 201),
        "e" + String(repeating: "\u{301}", count: 200),
    ]

    static let malformedJSONSurrogateEscapes = [
        #"\uD800"#, #"\uDC00"#, #"\uDC00\uD800"#,
        #"\uD800x"#, #"\uD800\uD800\uDC00"#,
    ]
}

@MainActor
final class OpaqueMatchIDTransportTests: XCTestCase {
    func testMatchesModelToRepositoryToProtectedSinglePathComponentRoundTrip() async throws {
        for (index, matchID) in OpaqueMatchIDFixtures.validIDs.enumerated() {
            let detail = MatchDetailFixtureFactory.response(
                format: [.bestBall, .scramble, .singles][index % 3],
                matchID: matchID,
                authenticatedInvolved: index.isMultiple(of: 2)
            )
            let transport = OpaqueMatchIDHTTPTransport(steps: [
                .response(200, try matchesData(from: detail), [:]),
                .response(200, try JSONEncoder().encode(detail), ["ETag": #""opaque-1""#]),
                .response(304, Data(), ["ETag": #"W/"opaque-1""#]),
            ])
            let root = FileManager.default.temporaryDirectory
                .appendingPathComponent("OpaqueMatchIDTransportTests-\(UUID().uuidString)", isDirectory: true)
            defer { try? FileManager.default.removeItem(at: root) }
            let cache = try DiskReadCacheStore(rootDirectory: root)
            let client = MobileAPIClient(baseURL: NativeEnvironment.previewAPIURL, transport: transport)
            let credentials = OpaqueMatchIDCredentials()
            let coordinator = TournamentDataCoordinator(
                api: client,
                credentialProvider: credentials,
                cache: cache,
                applicationActivity: NativeApplicationActivity(isActive: false),
                now: { TestFixtures.now }
            )
            await coordinator.activate(
                authUserID: TestFixtures.authSession.userID,
                participant: TestFixtures.participant
            )
            await coordinator.matches.refresh()
            let listMatch = try XCTUnwrap(coordinator.matches.state.value?.matches.first)
            XCTAssertEqual(Data(listMatch.matchId.utf8), Data(matchID.utf8))
            XCTAssertEqual(listMatch.displayMatchNumber, "2", "The display label must not become identity")

            let repository = try XCTUnwrap(coordinator.matchDetailRepository(matchID: listMatch.matchId))
            let sameRepository = try XCTUnwrap(coordinator.matchDetailRepository(matchID: matchID))
            XCTAssertTrue(repository === sameRepository)
            await coordinator.loadMatchDetail(matchID: listMatch.matchId)
            XCTAssertEqual(Data(try XCTUnwrap(repository.state.value?.match.matchId).utf8), Data(matchID.utf8))
            XCTAssertEqual(repository.state.source, .network)

            await coordinator.refreshMatchDetail(matchID: listMatch.matchId)
            XCTAssertEqual(repository.state.lastHTTPStatus, 304)
            XCTAssertEqual(repository.state.freshness, .fresh)
            XCTAssertEqual(Data(try XCTUnwrap(repository.state.value?.match.matchId).utf8), Data(matchID.utf8))

            let requests = await transport.requests()
            XCTAssertEqual(requests.count, 3)
            XCTAssertEqual(requests.first?.url?.path, "/api/mobile/v1/matches")
            for request in requests.dropFirst() {
                try assertExactMatchPath(request, matchID: matchID)
                XCTAssertEqual(request.httpMethod, "GET")
                XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer \(TestFixtures.authSession.accessToken)")
                XCTAssertEqual(request.value(forHTTPHeaderField: "X-Bagger-Certification"), TestFixtures.certificationToken)
            }
            XCTAssertEqual(requests[2].value(forHTTPHeaderField: "If-None-Match"), #""opaque-1""#)

            // A separate repository instance must read precisely the same disk
            // entry before it has made a network request.
            let key = try MobileReadCacheKey(matchID: listMatch.matchId)
            let context = try makeContext()
            let restored = MobileReadRepository<MobileMatchDetailResponse>(
                cacheKey: key,
                cache: cache,
                credentialProvider: credentials,
                now: { TestFixtures.now },
                responseValidator: { response, context in
                    response.isCompatible(
                        expectedTournamentID: context.tournamentID,
                        expectedPlayerID: context.playerID
                    ) && response.data.match.isCompatible(
                        expectedMatchId: matchID,
                        expectedPlayerId: context.playerID
                    )
                }
            ) { _, _ in throw MobileAPIClientError.transportUnavailable }
            await restored.activate(context, beginRefresh: false)
            XCTAssertEqual(restored.state.source, .diskCache)
            XCTAssertEqual(Data(try XCTUnwrap(restored.state.value?.match.matchId).utf8), Data(matchID.utf8))
            let postRestoreRequests = await transport.requests()
            XCTAssertEqual(postRestoreRequests.count, 3)
        }
    }

    func testCanonicalEquivalentUnicodeIDsHaveIndependentRepositoryLookupAndTransport() async throws {
        let ids = ["café", "cafe\u{301}"]
        let transport = OpaqueMatchIDHTTPTransport(steps: try ids.map {
            .response(200, try JSONEncoder().encode(MatchDetailFixtureFactory.response(matchID: $0)), [:])
        })
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("OpaqueMatchIDIdentityTests-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let cache = try DiskReadCacheStore(rootDirectory: root)
        let client = MobileAPIClient(baseURL: NativeEnvironment.previewAPIURL, transport: transport)
        let coordinator = TournamentDataCoordinator(
            api: client,
            credentialProvider: OpaqueMatchIDCredentials(),
            cache: cache,
            applicationActivity: NativeApplicationActivity(isActive: false),
            now: { TestFixtures.now }
        )
        await coordinator.activate(
            authUserID: TestFixtures.authSession.userID,
            participant: TestFixtures.participant
        )
        let first = try XCTUnwrap(coordinator.matchDetailRepository(matchID: ids[0]))
        let second = try XCTUnwrap(coordinator.matchDetailRepository(matchID: ids[1]))
        XCTAssertFalse(first === second)
        await coordinator.loadMatchDetail(matchID: ids[0])
        XCTAssertEqual(Data(try XCTUnwrap(first.state.value?.match.matchId).utf8), Data(ids[0].utf8))
        await coordinator.loadMatchDetail(matchID: ids[1])
        XCTAssertEqual(Data(try XCTUnwrap(second.state.value?.match.matchId).utf8), Data(ids[1].utf8))
        XCTAssertFalse(first.isActive)
        let requests = await transport.requests()
        XCTAssertEqual(requests.count, 2)
        for (request, id) in zip(requests, ids) {
            try assertExactMatchPath(request, matchID: id)
        }
        let context = try makeContext()
        for id in ids {
            let entry = try await cache.read(key: MobileReadCacheKey(matchID: id), partition: context.cachePartition)
            XCTAssertNotNil(entry)
        }
    }

    func testInvalidOpaqueIDsFailBeforeTransport() async throws {
        let transport = OpaqueMatchIDHTTPTransport(steps: [])
        let client = MobileAPIClient(baseURL: NativeEnvironment.previewAPIURL, transport: transport)
        for id in OpaqueMatchIDFixtures.invalidIDs {
            do {
                _ = try await client.matchDetail(
                    matchID: id,
                    accessToken: TestFixtures.authSession.accessToken,
                    certification: TestFixtures.certificationToken,
                    etag: nil
                )
                XCTFail("An out-of-schema Match ID must not produce an HTTP request")
            } catch {
                XCTAssertEqual(error as? MobileAPIClientError, .invalidURL)
            }
        }
        let requests = await transport.requests()
        XCTAssertTrue(requests.isEmpty)
    }

    func testCollectionRejectsOutOfContractOpaqueIDsWithoutReturningAModel() async throws {
        for matchID in OpaqueMatchIDFixtures.invalidIDs {
            let transport = OpaqueMatchIDHTTPTransport(steps: [
                .response(200, try matchesData(from: MatchDetailFixtureFactory.response(matchID: matchID)), [:]),
            ])
            let client = MobileAPIClient(baseURL: NativeEnvironment.previewAPIURL, transport: transport)
            do {
                _ = try await client.matches(
                    accessToken: TestFixtures.authSession.accessToken,
                    certification: TestFixtures.certificationToken,
                    etag: nil
                )
                XCTFail("An invalid collection ID must not enter the native model/repository path")
            } catch {
                XCTAssertEqual(error as? MobileContractError, .incompatibleResponse)
            }
            let requests = await transport.requests()
            XCTAssertEqual(requests.count, 1)
        }
    }

    func testMalformedJSONSurrogatesAreRejectedAtCollectionAndDetailTransportBoundaries() async throws {
        let fixture = MatchDetailFixtureFactory.response(matchID: "opaque-sentinel")
        let collectionJSON = String(decoding: try matchesData(from: fixture), as: UTF8.self)
        let detailJSON = String(decoding: try JSONEncoder().encode(fixture), as: UTF8.self)
        for escapes in OpaqueMatchIDFixtures.malformedJSONSurrogateEscapes {
            let transport = OpaqueMatchIDHTTPTransport(steps: [
                .response(200, Data(collectionJSON.replacingOccurrences(of: "opaque-sentinel", with: escapes).utf8), [:]),
                .response(200, Data(detailJSON.replacingOccurrences(of: "opaque-sentinel", with: escapes).utf8), [:]),
            ])
            let client = MobileAPIClient(baseURL: NativeEnvironment.previewAPIURL, transport: transport)
            do {
                _ = try await client.matches(
                    accessToken: TestFixtures.authSession.accessToken,
                    certification: TestFixtures.certificationToken,
                    etag: nil
                )
                XCTFail("Malformed JSON UTF-16 must not be silently repaired into a collection ID")
            } catch {
                XCTAssertEqual(error as? MobileContractError, .incompatibleResponse)
            }
            do {
                _ = try await client.matchDetail(
                    matchID: "opaque-sentinel",
                    accessToken: TestFixtures.authSession.accessToken,
                    certification: TestFixtures.certificationToken,
                    etag: nil
                )
                XCTFail("Malformed JSON UTF-16 must not be silently repaired into a Detail ID")
            } catch {
                XCTAssertEqual(error as? MobileContractError, .incompatibleResponse)
            }
            let requests = await transport.requests()
            XCTAssertEqual(requests.count, 2)
        }
    }

    private func assertExactMatchPath(
        _ request: URLRequest,
        matchID: String,
        file: StaticString = #filePath,
        line: UInt = #line
    ) throws {
        let url = try XCTUnwrap(request.url, file: file, line: line)
        let components = try XCTUnwrap(URLComponents(url: url, resolvingAgainstBaseURL: false), file: file, line: line)
        XCTAssertEqual(url.host, NativeEnvironment.previewAPIURL.host, file: file, line: line)
        XCTAssertEqual(url.scheme, "https", file: file, line: line)
        XCTAssertNil(components.query, file: file, line: line)
        XCTAssertNil(components.fragment, file: file, line: line)
        let prefix = "/api/mobile/v1/matches/"
        XCTAssertTrue(components.percentEncodedPath.hasPrefix(prefix), file: file, line: line)
        let component = String(components.percentEncodedPath.dropFirst(prefix.count))
        XCTAssertFalse(component.contains("/"), file: file, line: line)
        XCTAssertFalse(component.contains("#"), file: file, line: line)
        XCTAssertFalse(component == "." || component == "..", file: file, line: line)
        let logicalID = try XCTUnwrap(component.removingPercentEncoding, file: file, line: line)
        XCTAssertEqual(Data(logicalID.utf8), Data(matchID.utf8), file: file, line: line)
    }

    private func matchesData(from response: MobileMatchDetailResponse) throws -> Data {
        let detailObject = try MatchDetailFixtureFactory.jsonObject(from: response)
        let detailData = try XCTUnwrap(detailObject["data"] as? [String: Any])
        var match = try XCTUnwrap(detailData["match"] as? [String: Any])
        match["displayMatchNumber"] = "2"
        match["progress"] = NSNull()
        match["result"] = NSNull()
        let baseObject = try XCTUnwrap(
            JSONSerialization.jsonObject(with: JSONEncoder().encode(TestFixtures.matchesResponse)) as? [String: Any]
        )
        var object = baseObject
        var data = try XCTUnwrap(object["data"] as? [String: Any])
        data["matches"] = [match]
        object["data"] = data
        return try JSONSerialization.data(withJSONObject: object)
    }

    private func makeContext() throws -> ActiveMobileReadContext {
        ActiveMobileReadContext(
            cachePartition: try ReadCachePartition(
                environment: "preview",
                authUserID: TestFixtures.authSession.userID,
                playerID: TestFixtures.participant.player.playerId,
                tournamentID: TestFixtures.participant.tournament.tournamentId
            ),
            authUserID: TestFixtures.authSession.userID,
            playerID: TestFixtures.participant.player.playerId,
            tournamentID: TestFixtures.participant.tournament.tournamentId
        )
    }
}

@MainActor
private final class OpaqueMatchIDCredentials: MobileReadCredentialProviding {
    func credentials(expectedAuthUserID: String) async throws -> MobileReadCredentials {
        MobileReadCredentials(
            authUserID: expectedAuthUserID,
            accessToken: TestFixtures.authSession.accessToken,
            certification: TestFixtures.certificationToken
        )
    }
}

private actor OpaqueMatchIDHTTPTransport: HTTPTransporting {
    enum Step: Sendable {
        case response(Int, Data, [String: String])
    }

    private var steps: [Step]
    private var recorded: [URLRequest] = []

    init(steps: [Step]) {
        self.steps = steps
    }

    func data(for request: URLRequest) async throws -> HTTPTransportResult {
        recorded.append(request)
        guard !steps.isEmpty, let url = request.url else {
            throw MobileAPIClientError.transportUnavailable
        }
        switch steps.removeFirst() {
        case let .response(status, data, headers):
            guard let response = HTTPURLResponse(url: url, statusCode: status, httpVersion: "HTTP/1.1", headerFields: headers) else {
                throw MobileAPIClientError.invalidHTTPResponse
            }
            return HTTPTransportResult(data: data, response: response)
        }
    }

    func requests() -> [URLRequest] { recorded }
}
