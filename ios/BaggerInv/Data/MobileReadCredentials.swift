import Foundation

struct MobileReadCredentials: Sendable {
    let authUserID: String
    let accessToken: String
    let certification: String
}

@MainActor
protocol MobileReadCredentialProviding {
    func credentials(expectedAuthUserID: String) async throws -> MobileReadCredentials
}

@MainActor
final class NativeMobileReadCredentialProvider: MobileReadCredentialProviding {
    private let auth: any AuthServicing
    private let certificationStore: any BaggerCertificationStoring
    private let now: () -> Date

    init(
        auth: any AuthServicing,
        certificationStore: any BaggerCertificationStoring,
        now: @escaping () -> Date = Date.init
    ) {
        self.auth = auth
        self.certificationStore = certificationStore
        self.now = now
    }

    func credentials(expectedAuthUserID: String) async throws -> MobileReadCredentials {
        let session: SupabaseAuthSession
        do {
            session = try await auth.validSession()
        } catch is CancellationError {
            throw CancellationError()
        } catch SupabaseAuthServiceError.sessionMissing {
            throw MobileReadCredentialError.authSessionMissing
        } catch {
            throw MobileReadCredentialError.authSessionUnavailable
        }
        guard session.userID == expectedAuthUserID else {
            throw MobileReadCredentialError.authIdentityChanged
        }
        let certification: StoredBaggerCertification?
        do {
            certification = try certificationStore.credential(
                for: expectedAuthUserID,
                now: now()
            )
        } catch {
            throw MobileReadCredentialError.certificationUnavailable
        }
        guard let certification else {
            throw MobileReadCredentialError.certificationUnavailable
        }
        return MobileReadCredentials(
            authUserID: expectedAuthUserID,
            accessToken: session.accessToken,
            certification: certification.token
        )
    }
}

enum MobileReadCredentialError: Error, Equatable {
    case authSessionMissing
    case authSessionUnavailable
    case authIdentityChanged
    case certificationUnavailable
}
