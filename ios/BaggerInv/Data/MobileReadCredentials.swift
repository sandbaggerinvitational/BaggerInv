import Foundation

struct MobileReadCredentials: Sendable {
    let authUserID: String
    let accessToken: String
    let certification: String
}

@MainActor
protocol MobileReadCredentialProviding {
    func credentials(expectedAuthUserID: String) async throws -> MobileReadCredentials
    func refreshedCredentials(expectedAuthUserID: String) async throws -> MobileReadCredentials
}

extension MobileReadCredentialProviding {
    /// Fail-closed compatibility for injected test providers. The live provider
    /// performs a forced Supabase refresh-token exchange below.
    func refreshedCredentials(expectedAuthUserID: String) async throws -> MobileReadCredentials {
        try await credentials(expectedAuthUserID: expectedAuthUserID)
    }
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
        return try credentials(from: session, expectedAuthUserID: expectedAuthUserID)
    }

    func refreshedCredentials(expectedAuthUserID: String) async throws -> MobileReadCredentials {
        let session: SupabaseAuthSession
        do {
            session = try await auth.refreshSession()
        } catch is CancellationError {
            throw CancellationError()
        } catch SupabaseAuthServiceError.sessionMissing {
            throw MobileReadCredentialError.authSessionMissing
        } catch {
            throw MobileReadCredentialError.authSessionUnavailable
        }
        return try credentials(from: session, expectedAuthUserID: expectedAuthUserID)
    }

    private func credentials(
        from session: SupabaseAuthSession,
        expectedAuthUserID: String
    ) throws -> MobileReadCredentials {
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
