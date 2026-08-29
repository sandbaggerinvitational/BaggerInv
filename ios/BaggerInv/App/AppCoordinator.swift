import Foundation
import Combine

@MainActor
final class AppCoordinator: ObservableObject {
    @Published private(set) var state: AppState = .launching

    let environment: NativeEnvironment?
    private let api: (any MobileAPIServing)?
    private let auth: (any AuthServicing)?
    private let certificationStore: (any BaggerCertificationStoring)?
    private let now: () -> Date
    private var authenticationEpoch: UInt = 0

    init(
        environment: NativeEnvironment,
        api: any MobileAPIServing,
        auth: any AuthServicing,
        certificationStore: any BaggerCertificationStoring,
        now: @escaping () -> Date = Date.init
    ) {
        self.environment = environment
        self.api = api
        self.auth = auth
        self.certificationStore = certificationStore
        self.now = now
    }

    init(configurationFailure: Void = ()) {
        environment = nil
        api = nil
        auth = nil
        certificationStore = nil
        now = Date.init
        state = .environmentUnavailable
    }

    static func live(bundle: Bundle = .main) -> AppCoordinator {
        do {
            let environment = try NativeEnvironment.load(bundle: bundle)
            return AppCoordinator(
                environment: environment,
                api: MobileAPIClient(baseURL: environment.apiBaseURL),
                auth: SupabaseAuthService(environment: environment),
                certificationStore: BaggerCertificationStore()
            )
        } catch {
            return AppCoordinator(configurationFailure: ())
        }
    }

    func bootstrap() async {
        let epoch = authenticationEpoch
        guard let api, let auth, let certificationStore else {
            state = .environmentUnavailable
            return
        }
        state = .checkingEnvironment
        do {
            _ = try await api.health()
        } catch {
            guard epoch == authenticationEpoch else { return }
            state = .environmentUnavailable
            return
        }

        guard !Task.isCancelled, epoch == authenticationEpoch else { return }
        guard let session = await auth.restoredSession() else {
            guard epoch == authenticationEpoch else { return }
            state = .signedOut
            return
        }
        guard epoch == authenticationEpoch else {
            await discardAuthentication()
            return
        }
        guard let certification = try? certificationStore.credential(for: session.userID, now: now()) else {
            await discardAuthentication()
            guard epoch == authenticationEpoch else { return }
            state = .signedOut
            return
        }

        state = .loadingParticipant
        do {
            let participant = try await api.participantSession(
                accessToken: session.accessToken,
                certification: certification.token
            )
            guard !Task.isCancelled, epoch == authenticationEpoch else { return }
            state = .authenticated(participant)
        } catch let error as MobileAPIClientError where error.requiresCredentialDiscard {
            await discardAuthentication()
            guard epoch == authenticationEpoch else { return }
            state = .signedOut
        } catch {
            guard epoch == authenticationEpoch else { return }
            state = .authenticationError(.init(
                message: "Bagger could not refresh participant information. Try again.",
                recovery: .retryBootstrap
            ))
        }
    }

    func beginSignIn(email: String) {
        let normalized = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard Self.isValidEmail(normalized) else {
            state = .authenticationError(.init(
                message: "Enter a valid email address.",
                recovery: .signedOut
            ))
            return
        }
        state = .solvingCaptcha(email: normalized)
    }

    func cancelCaptcha() {
        state = .signedOut
    }

    func completeCaptcha(token: String, email: String) async {
        let epoch = authenticationEpoch
        guard case .solvingCaptcha(let expectedEmail) = state,
              expectedEmail == email,
              token.count >= 20,
              token.count <= 4_096,
              !token.contains(where: \Character.isWhitespace),
              let api
        else {
            state = .authenticationError(.init(
                message: "Request verification could not be completed. Try again.",
                recovery: .signedOut
            ))
            return
        }

        state = .requestingOTP
        do {
            let acknowledgement = try await api.requestOTP(identifier: email, captchaToken: token)
            guard !Task.isCancelled, epoch == authenticationEpoch else { return }
            let current = now()
            state = .awaitingOTP(.init(
                email: email,
                challengeId: acknowledgement.challengeId,
                expiresAt: current.addingTimeInterval(TimeInterval(acknowledgement.expiresInSeconds)),
                resendAt: current.addingTimeInterval(TimeInterval(acknowledgement.resendAfterSeconds))
            ))
        } catch {
            guard epoch == authenticationEpoch else { return }
            state = .authenticationError(.init(
                message: "A sign-in code could not be requested right now. Try again.",
                recovery: .signedOut
            ))
        }
    }

    func beginResend(from context: OTPChallengeContext) {
        guard now() >= context.resendAt else { return }
        state = .solvingCaptcha(email: context.email)
    }

    func verifyOTP(code: String, context: OTPChallengeContext) async {
        let epoch = authenticationEpoch
        guard let api, let auth, let certificationStore else {
            state = .environmentUnavailable
            return
        }
        let normalizedCode = code.trimmingCharacters(in: .whitespacesAndNewlines)
        guard now() < context.expiresAt, !normalizedCode.isEmpty else {
            state = .authenticationError(.init(
                message: "That code has expired. Request a new one.",
                recovery: .retryOTP(context)
            ))
            return
        }

        state = .verifyingOTP
        let supabaseSession: SupabaseAuthSession
        do {
            supabaseSession = try await auth.verifyEmailOTP(email: context.email, code: normalizedCode)
        } catch {
            guard epoch == authenticationEpoch else { return }
            state = .authenticationError(.init(
                message: "That code did not work. Request a new one or try again.",
                recovery: .retryOTP(context)
            ))
            return
        }

        guard !Task.isCancelled, epoch == authenticationEpoch else {
            await discardAuthentication()
            return
        }
        state = .certifyingBaggerIdentity
        let certification: OTPCertificationAcknowledgement
        do {
            certification = try await api.certify(
                challengeId: context.challengeId,
                accessToken: supabaseSession.accessToken
            )
            try certificationStore.save(
                token: certification.certificationToken,
                userID: supabaseSession.userID,
                expiresInSeconds: certification.expiresInSeconds,
                now: now()
            )
        } catch {
            await discardAuthentication()
            guard epoch == authenticationEpoch else { return }
            state = .authenticationError(.init(
                message: "This sign-in could not be certified for Bagger. Sign in again.",
                recovery: .signedOut
            ))
            return
        }

        guard !Task.isCancelled, epoch == authenticationEpoch else {
            await discardAuthentication()
            return
        }
        state = .loadingParticipant
        do {
            let participant = try await api.participantSession(
                accessToken: supabaseSession.accessToken,
                certification: certification.certificationToken
            )
            guard epoch == authenticationEpoch else { return }
            state = .authenticated(participant)
        } catch let error as MobileAPIClientError where error.requiresCredentialDiscard {
            await discardAuthentication()
            guard epoch == authenticationEpoch else { return }
            state = .authenticationError(.init(
                message: "This account is not linked to an active Bagger player.",
                recovery: .signedOut
            ))
        } catch {
            guard epoch == authenticationEpoch else { return }
            state = .authenticationError(.init(
                message: "Bagger could not load participant information. Try again.",
                recovery: .retryBootstrap
            ))
        }
    }

    func recover(_ recovery: AuthenticationErrorPresentation.Recovery) {
        switch recovery {
        case .signedOut:
            state = .signedOut
        case .retryBootstrap:
            state = .launching
        case .retryOTP(let context):
            if now() < context.expiresAt {
                state = .awaitingOTP(context)
            } else {
                state = .solvingCaptcha(email: context.email)
            }
        }
    }

    func signOut() async {
        authenticationEpoch &+= 1
        await discardAuthentication()
        state = .signedOut
    }

    private func discardAuthentication() async {
        try? certificationStore?.delete()
        await auth?.signOut()
    }

    private static func isValidEmail(_ email: String) -> Bool {
        email.range(
            of: #"^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$"#,
            options: [.regularExpression, .caseInsensitive]
        ) != nil
    }
}

private extension MobileAPIClientError {
    var requiresCredentialDiscard: Bool {
        switch self {
        case .server(let code, _):
            return code == .unauthorized ||
                code == .invalidToken ||
                code == .participantNotFound ||
                code == .authCertificationFailed
        default:
            return false
        }
    }
}
