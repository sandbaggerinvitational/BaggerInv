import Foundation

enum AppState: Equatable {
    case launching
    case checkingEnvironment
    case environmentUnavailable
    case signedOut
    case solvingCaptcha(email: String)
    case requestingOTP
    case awaitingOTP(OTPChallengeContext)
    case verifyingOTP
    case certifyingBaggerIdentity
    case loadingParticipant
    case authenticated(ParticipantSession)
    case authenticationError(AuthenticationErrorPresentation)
}
struct OTPChallengeContext: Equatable {
    let email: String
    let challengeId: String
    let expiresAt: Date
    let resendAt: Date
}

struct AuthenticationErrorPresentation: Equatable {
    enum Recovery: Equatable {
        case signedOut
        case retryBootstrap
        case retryOTP(OTPChallengeContext)
    }

    let message: String
    let recovery: Recovery
}

struct ScoringQueueSignOutPresentation: Equatable {
    /// Nil means the durable queue could not be read. Sign-out still requires
    /// explicit confirmation and the database remains retained on device.
    let unresolvedCount: Int?
}
