import Foundation
import CryptoKit

struct MobileHealthResponse: Codable, Equatable, Sendable {
    let ok: Bool
    let apiVersion: String
    let service: String
    let environment: String
    let authority: MobileHealthAuthority
    var contractVersion: String? = nil
    var compatibility: String? = nil
    var capabilities: [String: Bool]? = nil
    var scoringStatus: String? = nil

    var isExactIsolatedPreview: Bool {
        ok &&
        apiVersion == "v1" &&
        service == "bagger-mobile-api" &&
        environment == "preview" &&
        authority == .isolatedPreview
    }
}
struct MobileHealthAuthority: Codable, Equatable, Sendable {
    let mode: String?
    let authentication: String?
    let identity: String
    let reads: String?
    let scoringReads: String?
    let scoringWrites: String?
    let productionShadow: Bool?
    let nativeAuth: String?
    let antiAbuse: String?
    let sessionCertification: String?
    let authUserCreation: String?
    let requestRateLimit: String?
    var currentTournament: String? = nil

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

    static func decodeAndValidate(_ data: Data, decoder: JSONDecoder = JSONDecoder(), deployment: NativeDeployment = .preview) throws -> MobileHealthResponse {
        if deployment == .production {
            guard let object = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                  Set(object.keys) == responseKeys.union(["contractVersion", "compatibility", "capabilities", "scoringStatus"]),
                  let authority = object["authority"] as? [String: Any],
                  Set(authority.keys) == ["identity", "currentTournament"] else { throw MobileContractError.incompatibleHealth }
            let response = try decoder.decode(MobileHealthResponse.self, from: data)
            guard response.ok, response.apiVersion == "v1", response.service == "bagger-mobile-api",
                  response.environment == "production", response.contractVersion == "bagger-production-native-v1",
                  response.compatibility == "COMPATIBLE", response.authority.identity == "supabase",
                  response.authority.currentTournament == "server-current-active",
                  Set(response.capabilities?.keys.map { $0 } ?? []) == ["reads", "auth", "certification", "scoring"],
                  (response.capabilities?["scoring"] == true
                    ? response.scoringStatus == "AVAILABLE"
                    : ["SUSPENDED", "MAINTENANCE"].contains(response.scoringStatus ?? ""))
            else { throw MobileContractError.incompatibleHealth }
            return response
        }
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

    var isCompatible: Bool { isCompatible(deployment: .preview) }
    func isCompatible(deployment: NativeDeployment) -> Bool {
        ok && apiVersion == "v1" && data.isCompatible(deployment: deployment)
    }
}

struct OTPCertificationAcknowledgement: Codable, Equatable, Sendable {
    var phoneEnrollmentProof: String? = nil
    let certified: Bool
    let certificationToken: String
    let expiresInSeconds: Int

    var isCompatible: Bool { isCompatible(deployment: .preview) }
    func isCompatible(deployment: NativeDeployment) -> Bool {
        certified && ((expiresInSeconds == 43_200 && !certificationToken.hasPrefix("v3")) || (expiresInSeconds == 1_209_600 && certificationToken.hasPrefix("v3"))) && deployment.acceptsCertificate(certificationToken)
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

struct ReviewObserver: Codable, Equatable, Sendable {
    let subjectId: String
    var historicalFixture: ReviewHistoricalFixture? = nil
    var isCompatible: Bool { UUID(uuidString: subjectId) != nil }
    init(subjectId: String, historicalFixture: ReviewHistoricalFixture? = nil) {
        self.subjectId = subjectId
        self.historicalFixture = historicalFixture?.isCompatible == true ? historicalFixture : nil
    }
    init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        subjectId = try container.decode(String.self, forKey: .subjectId)
        let candidate = try? container.decode(ReviewHistoricalFixture.self, forKey: .historicalFixture)
        historicalFixture = candidate?.isCompatible == true ? candidate : nil
    }
}

struct ReviewHistoricalFixture: Codable, Equatable, Sendable {
    let tournamentId: String
    let year: Int
    let revisionId: String
    let matchId: String
    let bindingRevision: Int
    var isCompatible: Bool {
        MobileParticipantContentValidation.id(tournamentId) && (2017...2025).contains(year) &&
        UUID(uuidString: revisionId) != nil && MobileOpaqueMatchID.isValid(matchId) && bindingRevision > 0
    }
    var cacheIdentity: String {
        let material = ["review-history", tournamentId, String(year), revisionId, matchId, String(bindingRevision)].joined(separator: "\u{0}")
        return "review-history:" + SHA256.hash(data: Data(material.utf8)).map { String(format: "%02x", $0) }.joined()
    }

}

enum AuthenticatedIdentity: Equatable, Sendable {
    case participant(ParticipantPlayer)
    case observer(ReviewObserver)
    var playerId: String? { if case .participant(let player) = self { player.playerId } else { nil } }
    var displayName: String { if case .participant(let player) = self { player.displayName } else { "Read-only access" } }
    var team: ParticipantTeam? { if case .participant(let player) = self { player.team } else { nil } }
    var observer: ReviewObserver? { if case .observer(let value) = self { value } else { nil } }
}

struct ParticipantSession: Codable, Equatable, Sendable {
    let identity: AuthenticatedIdentity
    let tournament: ParticipantTournament
    init(player: ParticipantPlayer, tournament: ParticipantTournament) {
        identity = .participant(player); self.tournament = tournament
    }
    init(observer: ReviewObserver, tournament: ParticipantTournament) {
        identity = .observer(observer); self.tournament = tournament
    }
    private enum CodingKeys: String, CodingKey { case player, observer, tournament }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        tournament = try c.decode(ParticipantTournament.self, forKey: .tournament)
        let player = try c.decodeIfPresent(ParticipantPlayer.self, forKey: .player)
        let observer = try c.decodeIfPresent(ReviewObserver.self, forKey: .observer)
        switch (player, observer) {
        case (.some(let value), .none): identity = .participant(value)
        case (.none, .some(let value)): identity = .observer(value)
        default: throw DecodingError.dataCorruptedError(forKey: .player, in: c, debugDescription: "Exactly one authenticated principal required")
        }
    }
    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(tournament, forKey: .tournament)
        switch identity {
        case .participant(let player): try c.encode(player, forKey: .player)
        case .observer(let observer): try c.encode(observer, forKey: .observer)
        }
    }
    var isCompatible: Bool {
        let principalValid: Bool
        switch identity {
        case .participant(let player): principalValid = !player.playerId.isEmpty && !player.displayName.isEmpty && (player.team?.isCompatible ?? true)
        case .observer(let observer): principalValid = observer.isCompatible
        }
        return principalValid && !tournament.tournamentId.isEmpty && !tournament.name.isEmpty
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
