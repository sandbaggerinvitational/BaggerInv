import XCTest
@testable import BaggerInv

final class MobileModelDecodingTests: XCTestCase {
    private let decoder = JSONDecoder()

    func testHealthAndAuthorityDecodeFromCertifiedPayload() throws {
        let data = try TestFixtures.jsonData(TestFixtures.healthObject())

        let decoded = try decoder.decode(MobileHealthResponse.self, from: data)

        XCTAssertEqual(decoded.authority, .isolatedPreview)
        XCTAssertTrue(decoded.isExactIsolatedPreview)
    }

    func testMobileErrorDecodesWithNullData() throws {
        let data = try TestFixtures.jsonData([
            "ok": false,
            "apiVersion": "v1",
            "error": [
                "code": "AUTH_CERTIFICATION_FAILED",
                "message": "Authentication could not be certified.",
            ],
            "data": NSNull(),
        ])

        let decoded = try decoder.decode(MobileErrorResponse.self, from: data)

        XCTAssertEqual(decoded.error.code, .authCertificationFailed)
        XCTAssertNil(decoded.data)
    }

    func testOTPRequestAcknowledgementDecodesAndValidates() throws {
        let decoded = try decoder.decode(
            OTPRequestResponse.self,
            from: TestFixtures.otpResponseData()
        )

        XCTAssertTrue(decoded.isCompatible)
        XCTAssertEqual(decoded.data.challengeId, TestFixtures.challengeID)
        XCTAssertEqual(decoded.data.resendAfterSeconds, 60)
    }

    func testOTPRequestWithNonUUIDChallengeIsIncompatible() throws {
        var root = try XCTUnwrap(
            JSONSerialization.jsonObject(with: TestFixtures.otpResponseData()) as? [String: Any]
        )
        var acknowledgement = try XCTUnwrap(root["data"] as? [String: Any])
        acknowledgement["challengeId"] = "client-chosen-player-id"
        root["data"] = acknowledgement

        let decoded = try decoder.decode(
            OTPRequestResponse.self,
            from: TestFixtures.jsonData(root)
        )

        XCTAssertFalse(decoded.isCompatible)
    }

    func testCertificationAcknowledgementDecodesAndValidates() throws {
        let decoded = try decoder.decode(
            OTPCertificationResponse.self,
            from: TestFixtures.certificationResponseData()
        )

        XCTAssertTrue(decoded.isCompatible)
        XCTAssertEqual(decoded.data.certificationToken, TestFixtures.certificationToken)
    }

    func testMalformedCertificationTokenIsIncompatible() throws {
        let data = try TestFixtures.jsonData([
            "ok": true,
            "apiVersion": "v1",
            "data": [
                "certified": true,
                "certificationToken": "not-a-signed-proof",
                "expiresInSeconds": 43_200,
            ],
        ])

        let decoded = try decoder.decode(OTPCertificationResponse.self, from: data)

        XCTAssertFalse(decoded.isCompatible)
    }

    func testParticipantSessionDecodesNullableTeamAndYear() throws {
        let data = try TestFixtures.jsonData([
            "ok": true,
            "apiVersion": "v1",
            "data": [
                "player": [
                    "playerId": "player-preview-1",
                    "displayName": "Preview Golfer",
                    "team": NSNull(),
                ],
                "tournament": [
                    "tournamentId": "tournament-preview-1",
                    "name": "Preview Invitational",
                    "year": NSNull(),
                ],
            ],
        ])

        let decoded = try decoder.decode(ParticipantSessionResponse.self, from: data)

        XCTAssertTrue(decoded.isCompatible)
        XCTAssertNil(decoded.data.player.team)
        XCTAssertNil(decoded.data.tournament.year)
    }

    func testParticipantSessionDecodesTeamAndTournament() throws {
        let decoded = try decoder.decode(
            ParticipantSessionResponse.self,
            from: TestFixtures.participantResponseData()
        )

        XCTAssertTrue(decoded.isCompatible)
        XCTAssertEqual(decoded.data, TestFixtures.participant)
    }

    func testMalformedParticipantSessionFailsDecoding() throws {
        let data = try TestFixtures.jsonData([
            "ok": true,
            "apiVersion": "v1",
            "data": [
                "player": ["displayName": "Missing canonical ID", "team": NSNull()],
                "tournament": [
                    "tournamentId": "tournament-preview-1",
                    "name": "Preview Invitational",
                    "year": NSNull(),
                ],
            ],
        ])

        XCTAssertThrowsError(
            try decoder.decode(ParticipantSessionResponse.self, from: data)
        )
    }
}
