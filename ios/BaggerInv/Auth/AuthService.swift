import Foundation
import Supabase

@MainActor
protocol AuthServicing {
    func restoredSession() async -> SupabaseAuthSession?
    func validSession() async throws -> SupabaseAuthSession
    func verifyEmailOTP(email: String, code: String) async throws -> SupabaseAuthSession
    func signOut() async
}

@MainActor
final class SupabaseAuthService: AuthServicing {
    static let keychainService = "com.sandbaggerinvitational.bagger.preview.supabase"
    static let storageKey = "bagger.preview.auth.session"

    private let client: SupabaseClient

    init(environment: NativeEnvironment) {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        configuration.urlCache = nil
        configuration.httpCookieStorage = nil
        configuration.httpShouldSetCookies = false
        configuration.timeoutIntervalForRequest = 20
        configuration.timeoutIntervalForResource = 20
        let session = URLSession(configuration: configuration)

        let auth = SupabaseClientOptions.AuthOptions(
            storage: KeychainLocalStorage(service: Self.keychainService),
            storageKey: Self.storageKey,
            flowType: .pkce,
            autoRefreshToken: true,
            emitLocalSessionAsInitialSession: false
        )
        let options = SupabaseClientOptions(
            auth: auth,
            global: .init(session: session, logger: nil)
        )
        client = SupabaseClient(
            supabaseURL: environment.supabaseURL,
            supabaseKey: environment.supabasePublishableKey,
            options: options
        )
    }

    func restoredSession() async -> SupabaseAuthSession? {
        guard client.auth.currentSession != nil else { return nil }
        return try? await validSession()
    }

    func validSession() async throws -> SupabaseAuthSession {
        do {
            return map(try await client.auth.session)
        } catch is CancellationError {
            throw CancellationError()
        } catch let error as AuthError {
            if error.invalidatesLocalSession {
                throw SupabaseAuthServiceError.sessionMissing
            }
            throw SupabaseAuthServiceError.sessionUnavailable
        } catch {
            throw SupabaseAuthServiceError.sessionUnavailable
        }
    }

    func verifyEmailOTP(email: String, code: String) async throws -> SupabaseAuthSession {
        let response = try await client.auth.verifyOTP(email: email, token: code, type: .email)
        guard let session = response.session else {
            throw SupabaseAuthServiceError.sessionMissing
        }
        return map(session)
    }

    func signOut() async {
        try? await client.auth.signOut()
    }

    private func map(_ session: Session) -> SupabaseAuthSession {
        SupabaseAuthSession(
            accessToken: session.accessToken,
            userID: session.user.id.uuidString.lowercased(),
            accessTokenExpiresAt: Date(timeIntervalSince1970: session.expiresAt)
        )
    }
}

enum SupabaseAuthServiceError: Error, Equatable {
    case sessionMissing
    case sessionUnavailable
}

private extension AuthError {
    var invalidatesLocalSession: Bool {
        switch self {
        case .sessionMissing:
            return true
        case .api(_, let errorCode, _, _):
            return errorCode == .sessionNotFound ||
                errorCode == .sessionExpired ||
                errorCode == .refreshTokenNotFound ||
                errorCode == .refreshTokenAlreadyUsed ||
                errorCode == .userNotFound ||
                errorCode == .userBanned ||
                errorCode == .badJWT ||
                errorCode == .noAuthorization
        default:
            return false
        }
    }
}
