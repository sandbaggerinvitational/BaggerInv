import Foundation

struct MobileHealthResponse: Codable, Equatable, Sendable {
    let ok: Bool
    let apiVersion: String
    let service: String
    let environment: String
    let authority: MobileHealthAuthority

    var isExactIsolatedPreview: Bool {
        ok &&
        apiVersion == "v1" &&
        service == "bagger-mobile-api" &&
        environment == "preview" &&
        authority == .isolatedPreview
    }
}
struct MobileHealthAuthority: Codable, Equatable, Sendable {
    let mode: String
    let authentication: String
    let identity: String
    let reads: String
    let scoringReads: String
    let scoringWrites: String
    let productionShadow: Bool
    let nativeAuth: String
    let antiAbuse: String
    let sessionCertification: String
    let authUserCreation: String
    let requestRateLimit: String

    static let isolatedPreview = MobileHealthAuthority(
        mode: "isolated-development",
        authentication: "preview",
        identity: "preview",
        reads: "preview",
        scoringReads: "preview",
        scoringWrites: "preview",
        productionShadow: false,
        nativeAuth: "email-otp",
        antiAbuse: "supabase-turnstile",
        sessionCertification: "signed-proof-v1",
        authUserCreation: "disabled",
        requestRateLimit: "edge-ip+server-hash"
    )
}

enum MobileHealthContract {
    private static let responseKeys: Set<String> = [
        "ok", "apiVersion", "service", "environment", "authority",
    ]
    private static let authorityKeys: Set<String> = [
        "mode", "authentication", "identity", "reads", "scoringReads",
        "scoringWrites", "productionShadow", "nativeAuth", "antiAbuse",
        "sessionCertification", "authUserCreation", "requestRateLimit",
    ]

    static func decodeAndValidate(_ data: Data, decoder: JSONDecoder = JSONDecoder()) throws -> MobileHealthResponse {
        guard let object = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              Set(object.keys) == responseKeys,
              let authority = object["authority"] as? [String: Any],
              Set(authority.keys) == authorityKeys
        else {
            throw MobileContractError.incompatibleHealth
        }

        let response = try decoder.decode(MobileHealthResponse.self, from: data)
        guard response.isExactIsolatedPreview else {
            throw MobileContractError.incompatibleHealth
        }
        return response
    }
}

struct OTPRequestBody: Encodable, Equatable, Sendable {
    let method: String
    let identifier: String
    let captchaToken: String

    init(identifier: String, captchaToken: String) {
        method = "email"
        self.identifier = identifier
        self.captchaToken = captchaToken
    }
}

struct OTPRequestResponse: Codable, Equatable, Sendable {
    let ok: Bool
    let apiVersion: String
    let data: OTPRequestAcknowledgement

    var isCompatible: Bool {
        ok && apiVersion == "v1" && data.isCompatible
    }
}

struct OTPRequestAcknowledgement: Codable, Equatable, Sendable {
    let accepted: Bool
    let method: String
    let verificationType: String
    let challengeId: String
    let expiresInSeconds: Int
    let resendAfterSeconds: Int
    let message: String

    var isCompatible: Bool {
        accepted &&
        method == "email" &&
        verificationType == "email" &&
        UUID(uuidString: challengeId) != nil &&
        expiresInSeconds == 900 &&
        resendAfterSeconds == 60 &&
        !message.isEmpty
    }
}

struct OTPCertificationBody: Encodable, Equatable, Sendable {
    let challengeId: String
}

struct OTPCertificationResponse: Codable, Equatable, Sendable {
    let ok: Bool
    let apiVersion: String
    let data: OTPCertificationAcknowledgement

    var isCompatible: Bool {
        ok && apiVersion == "v1" && data.isCompatible
    }
}

struct OTPCertificationAcknowledgement: Codable, Equatable, Sendable {
    let certified: Bool
    let certificationToken: String
    let expiresInSeconds: Int

    var isCompatible: Bool {
        certified &&
        expiresInSeconds == 43_200 &&
        certificationToken.range(
            of: #"^v1\.[0-9]{10}\.[0-9]{10}\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}$"#,
            options: .regularExpression
        ) != nil
    }
}

struct ParticipantSessionResponse: Codable, Equatable, Sendable {
    let ok: Bool
    let apiVersion: String
    let data: ParticipantSession

    var isCompatible: Bool {
        ok && apiVersion == "v1" && data.isCompatible
    }
}

struct ParticipantSession: Codable, Equatable, Sendable {
    let player: ParticipantPlayer
    let tournament: ParticipantTournament

    var isCompatible: Bool {
        !player.playerId.isEmpty &&
        !player.displayName.isEmpty &&
        !tournament.tournamentId.isEmpty &&
        !tournament.name.isEmpty &&
        (player.team?.isCompatible ?? true)
    }
}

struct ParticipantPlayer: Codable, Equatable, Sendable {
    let playerId: String
    let displayName: String
    let team: ParticipantTeam?
}

struct ParticipantTeam: Codable, Equatable, Sendable {
    let teamId: String
    let name: String

    var isCompatible: Bool { !teamId.isEmpty && !name.isEmpty }
}

struct ParticipantTournament: Codable, Equatable, Sendable {
    let tournamentId: String
    let name: String
    let year: Int?
}

struct MobileErrorResponse: Codable, Equatable, Sendable {
    let ok: Bool
    let apiVersion: String
    let error: MobileErrorBody
    let data: MobileErrorData?
}

struct MobileErrorBody: Codable, Equatable, Sendable {
    let code: MobileErrorCode
    let message: String
}

enum MobileErrorCode: String, Codable, Equatable, Sendable {
    case unauthorized = "UNAUTHORIZED"
    case invalidToken = "INVALID_TOKEN"
    case participantNotFound = "PARTICIPANT_NOT_FOUND"
    case invalidAuthRequest = "INVALID_AUTH_REQUEST"
    case authMethodUnavailable = "AUTH_METHOD_UNAVAILABLE"
    case authCertificationFailed = "AUTH_CERTIFICATION_FAILED"
    case mobileAPIUnavailable = "MOBILE_API_UNAVAILABLE"
    case scoringUnavailable = "SCORING_UNAVAILABLE"
    case matchNotFound = "MATCH_NOT_FOUND"
    case scoringNotAuthorized = "SCORING_NOT_AUTHORIZED"
    case scoringReadOnly = "SCORING_READ_ONLY"
    case invalidScoreInput = "INVALID_SCORE_INPUT"
    case revisionConflict = "REVISION_CONFLICT"
    case idempotencyConflict = "IDEMPOTENCY_CONFLICT"
    case finalizationNotReady = "FINALIZATION_NOT_READY"
    case matchAlreadyFinalized = "MATCH_ALREADY_FINALIZED"
    case internalError = "INTERNAL_ERROR"
}

struct MobileErrorData: Codable, Equatable, Sendable {
    let matchId: String
    let currentMatchRevision: Int?
    let currentHoleRevision: Int?
    let currentPermissionRevision: Int?
    let scoredHoles: Int?
    let refreshRequired: Bool
}

enum MobileContractError: Error, Equatable {
    case incompatibleHealth
    case incompatibleResponse
}

struct SupabaseAuthSession: Equatable, Sendable {
    let accessToken: String
    let userID: String
    let accessTokenExpiresAt: Date
}
