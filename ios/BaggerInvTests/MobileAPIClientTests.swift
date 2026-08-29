import XCTest
@testable import BaggerInv

@MainActor
final class MobileAPIClientTests: XCTestCase {
    func testHealthRequestIsPublicAndUsesCertifiedEndpoint() async throws {
        let transport = RecordingHTTPTransport(
            statusCode: 200,
            responseData: try TestFixtures.jsonData(TestFixtures.healthObject())
        )
        let client = MobileAPIClient(baseURL: NativeEnvironment.previewAPIURL, transport: transport)

        _ = try await client.health()

        let request = try XCTUnwrap(transport.requests.first)
        XCTAssertEqual(request.url?.absoluteString, "https://native-preview.baggerinv.com/api/mobile/v1/health")
        XCTAssertEqual(request.httpMethod, "GET")
        XCTAssertNil(request.value(forHTTPHeaderField: "Authorization"))
        XCTAssertNil(request.value(forHTTPHeaderField: "X-Bagger-Certification"))
    }

    func testOTPRequestIsPublicAndContainsOnlyContractFields() async throws {
        let transport = RecordingHTTPTransport(
            statusCode: 202,
            responseData: try TestFixtures.otpResponseData()
        )
        let client = MobileAPIClient(baseURL: NativeEnvironment.previewAPIURL, transport: transport)

        _ = try await client.requestOTP(
            identifier: "golfer@example.test",
            captchaToken: String(repeating: "c", count: 32)
        )

        let request = try XCTUnwrap(transport.requests.first)
        XCTAssertEqual(request.httpMethod, "POST")
        XCTAssertNil(request.value(forHTTPHeaderField: "Authorization"))
        XCTAssertNil(request.value(forHTTPHeaderField: "X-Bagger-Certification"))
        let body = try XCTUnwrap(request.httpBody)
        let object = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: String])
        XCTAssertEqual(Set(object.keys), ["method", "identifier", "captchaToken"])
        XCTAssertEqual(object["method"], "email")
        XCTAssertNil(object["playerId"])
        XCTAssertNil(object["authUuid"])
    }

    func testCertificationRequestReceivesBearerButNotBaggerProof() async throws {
        let transport = RecordingHTTPTransport(
            statusCode: 200,
            responseData: try TestFixtures.certificationResponseData()
        )
        let client = MobileAPIClient(baseURL: NativeEnvironment.previewAPIURL, transport: transport)

        _ = try await client.certify(
            challengeId: TestFixtures.challengeID,
            accessToken: TestFixtures.authSession.accessToken
        )

        let request = try XCTUnwrap(transport.requests.first)
        XCTAssertEqual(
            request.value(forHTTPHeaderField: "Authorization"),
            "Bearer \(TestFixtures.authSession.accessToken)"
        )
        XCTAssertNil(request.value(forHTTPHeaderField: "X-Bagger-Certification"))
    }

    func testProtectedSessionReceivesBearerAndBaggerCertification() async throws {
        let transport = RecordingHTTPTransport(
            statusCode: 200,
            responseData: try TestFixtures.participantResponseData()
        )
        let client = MobileAPIClient(baseURL: NativeEnvironment.previewAPIURL, transport: transport)

        let participant = try await client.participantSession(
            accessToken: TestFixtures.authSession.accessToken,
            certification: TestFixtures.certificationToken
        )

        XCTAssertEqual(participant, TestFixtures.participant)
        let request = try XCTUnwrap(transport.requests.first)
        XCTAssertEqual(
            request.value(forHTTPHeaderField: "Authorization"),
            "Bearer \(TestFixtures.authSession.accessToken)"
        )
        XCTAssertEqual(
            request.value(forHTTPHeaderField: "X-Bagger-Certification"),
            TestFixtures.certificationToken
        )
    }

    func testMissingBearerPreventsCertificationRequest() async throws {
        let transport = RecordingHTTPTransport(
            statusCode: 200,
            responseData: try TestFixtures.certificationResponseData()
        )
        let client = MobileAPIClient(baseURL: NativeEnvironment.previewAPIURL, transport: transport)

        do {
            _ = try await client.certify(challengeId: TestFixtures.challengeID, accessToken: "")
            XCTFail("Expected a missing-Bearer failure")
        } catch {
            XCTAssertEqual(error as? MobileAPIClientError, .missingBearer)
        }
        XCTAssertTrue(transport.requests.isEmpty)
    }

    func testMissingBaggerCertificationPreventsProtectedSessionRequest() async throws {
        let transport = RecordingHTTPTransport(
            statusCode: 200,
            responseData: try TestFixtures.participantResponseData()
        )
        let client = MobileAPIClient(baseURL: NativeEnvironment.previewAPIURL, transport: transport)

        do {
            _ = try await client.participantSession(
                accessToken: TestFixtures.authSession.accessToken,
                certification: ""
            )
            XCTFail("Expected a missing-certification failure")
        } catch {
            XCTAssertEqual(error as? MobileAPIClientError, .missingCertification)
        }
        XCTAssertTrue(transport.requests.isEmpty)
    }

    func testDiagnosticErrorsDoNotContainCredentialValues() {
        let accessToken = TestFixtures.authSession.accessToken
        let certification = TestFixtures.certificationToken
        let diagnosticValues = [
            MobileAPIClientError.missingBearer.description,
            MobileAPIClientError.missingCertification.description,
            MobileAPIClientError.server(code: .unauthorized, status: 401).description,
        ]

        for diagnostic in diagnosticValues {
            XCTAssertFalse(diagnostic.contains(accessToken))
            XCTAssertFalse(diagnostic.contains(certification))
        }
    }
}
