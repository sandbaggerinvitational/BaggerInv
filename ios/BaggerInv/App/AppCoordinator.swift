import Foundation
import Combine

@MainActor
final class NativeApplicationActivity {
    struct MutationTransportAuthorization: Equatable, Sendable {
        fileprivate let epoch: UInt
    }

    private(set) var isActive: Bool
    private var authorizationEpoch: UInt = 0
    private var authorizedEpoch: UInt?

    init(isActive: Bool, mutationTransportAuthorized: Bool? = nil) {
        self.isActive = isActive
        if mutationTransportAuthorized ?? isActive {
            authorizedEpoch = authorizationEpoch
        }
    }

    func update(isActive: Bool) {
        self.isActive = isActive
        if !isActive {
            revokeMutationTransport()
        }
    }

    /// Foreground scene state alone is not scoring authority. A current exact
    /// health response must grant a new transport epoch before any scoring
    /// POST may leave the device.
    func authorizeMutationTransport() {
        guard isActive else { return }
        authorizedEpoch = authorizationEpoch
    }

    func revokeMutationTransport() {
        authorizationEpoch &+= 1
        authorizedEpoch = nil
    }

    var mutationTransportAuthorization: MutationTransportAuthorization? {
        guard isActive, authorizedEpoch == authorizationEpoch else { return nil }
        return MutationTransportAuthorization(epoch: authorizationEpoch)
    }

    func permits(_ authorization: MutationTransportAuthorization) -> Bool {
        isActive &&
            authorizedEpoch == authorizationEpoch &&
            authorization.epoch == authorizationEpoch
    }
}

@MainActor
final class AppCoordinator: ObservableObject {
    @Published private(set) var state: AppState = .launching
    @Published private(set) var scoringQueueSignOutPresentation: ScoringQueueSignOutPresentation?
    let environment: NativeEnvironment?
    private let api: (any MobileAPIServing)?
    private let auth: (any AuthServicing)?
    private let certificationStore: (any BaggerCertificationStoring)?
    private let tournamentDataLifecycle: (any TournamentDataLifecycle)?
    private let applicationActivity: NativeApplicationActivity
    let tournamentData: TournamentDataCoordinator?
    private let now: () -> Date
    private var authenticationEpoch: UInt = 0
    private var readAuthorityRevalidationTask: Task<Void, Never>?
    private var readAuthorityRevalidationGeneration: UInt = 0
    private var applicationLifecycleGeneration: UInt = 0
    // Fail closed until RootView reports the initial scene phase. This keeps a
    // restored queue from replaying if launch begins while the app is already
    // inactive or backgrounded.
    private var environmentResumePending = false

    init(
        environment: NativeEnvironment,
        api: any MobileAPIServing,
        auth: any AuthServicing,
        certificationStore: any BaggerCertificationStoring,
        tournamentDataLifecycle: (any TournamentDataLifecycle)? = nil,
        tournamentData: TournamentDataCoordinator? = nil,
        applicationActivity: NativeApplicationActivity = NativeApplicationActivity(isActive: false),
        now: @escaping () -> Date = Date.init
    ) {
        self.environment = environment
        self.api = api
        self.auth = auth
        self.certificationStore = certificationStore
        self.tournamentDataLifecycle = tournamentDataLifecycle
        self.tournamentData = tournamentData
        self.applicationActivity = applicationActivity
        self.now = now
    }

    init(configurationFailure: Void = ()) {
        environment = nil
        api = nil
        auth = nil
        certificationStore = nil
        tournamentDataLifecycle = nil
        tournamentData = nil
        applicationActivity = NativeApplicationActivity(isActive: false)
        now = Date.init
        state = .environmentUnavailable
    }

    static func live(bundle: Bundle = .main) -> AppCoordinator {
        do {
            let environment = try NativeEnvironment.load(bundle: bundle)
            let applicationActivity = NativeApplicationActivity(isActive: false)
            let api = MobileAPIClient(baseURL: environment.apiBaseURL)
            let auth = SupabaseAuthService(environment: environment)
            let certificationStore = BaggerCertificationStore()
            let credentialProvider = NativeMobileReadCredentialProvider(
                auth: auth,
                certificationStore: certificationStore
            )
            let cache = try DiskReadCacheStore()
            let scoringQueue = try SQLiteScoringQueueRepository()
            let finalizationProbeStore = try DiskScoringFinalizationProbeStore()
            let scoringMutationCapability = PreviewScoringMutationCapability.resolve(
                environment: environment,
                bundleIdentifier: bundle.bundleIdentifier
            )
            let tournamentData = TournamentDataCoordinator(
                api: api,
                credentialProvider: credentialProvider,
                cache: cache,
                scoringQueueRepository: scoringQueue,
                scoringFinalizationProbeStore: finalizationProbeStore,
                applicationActivity: applicationActivity,
                scoringHoleMutationAuthorization: scoringMutationCapability,
                liveScoringFinalizationSendingEnabled:
                    scoringMutationCapability.allowsFinalizationTransport
            )
            let coordinator = AppCoordinator(
                environment: environment,
                api: api,
                auth: auth,
                certificationStore: certificationStore,
                tournamentDataLifecycle: tournamentData,
                tournamentData: tournamentData,
                applicationActivity: applicationActivity
            )
            tournamentData.setAccessInvalidationHandler { [weak coordinator] in
                coordinator?.prepareForAccessInvalidation()
                Task { @MainActor [weak coordinator] in
                    await coordinator?.handleReadAccessInvalidation()
                }
            }
            tournamentData.setAuthorityRevalidationHandler { [weak coordinator] in
                coordinator?.startReadAuthorityRevalidation()
            }
            return coordinator
        } catch {
            return AppCoordinator(configurationFailure: ())
        }
    }

    func bootstrap() async {
        let epoch = authenticationEpoch
        applicationActivity.revokeMutationTransport()
        tournamentDataLifecycle?.prepareForForegroundRevalidation()
        let healthLifecycleGeneration = applicationLifecycleGeneration
        guard let api, let auth, let certificationStore else {
            state = .environmentUnavailable
            return
        }
        state = .checkingEnvironment
        do {
            _ = try await api.health()
            if healthLifecycleGeneration == applicationLifecycleGeneration,
               applicationActivity.isActive
            {
                applicationActivity.authorizeMutationTransport()
            }
        } catch {
            guard epoch == authenticationEpoch else { return }
            await tournamentDataLifecycle?.deactivate(deleteCache: true)
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
            guard await activateTournamentData(
                authUserID: session.userID,
                participant: participant,
                epoch: epoch
            ) else { return }
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
            guard await activateTournamentData(
                authUserID: supabaseSession.userID,
                participant: participant,
                epoch: epoch
            ) else { return }
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
        revokeMutationTransportAndPrepareLifecycle()
        scoringQueueSignOutPresentation = nil
        authenticationEpoch &+= 1
        readAuthorityRevalidationGeneration &+= 1
        readAuthorityRevalidationTask?.cancel()
        readAuthorityRevalidationTask = nil
        await discardAuthentication()
        state = .signedOut
    }

    func requestSignOut() async {
        // Pause new durable admissions before counting. This closes the race in
        // which Save could commit after a zero count but before authentication
        // was discarded.
        await tournamentDataLifecycle?.prepareScoringQueueForSignOut()
        guard let unresolvedCount = await tournamentDataLifecycle?.unresolvedScoringIntentCount() else {
            scoringQueueSignOutPresentation = ScoringQueueSignOutPresentation(
                unresolvedCount: nil
            )
            return
        }
        guard unresolvedCount > 0 else {
            await signOut()
            return
        }
        scoringQueueSignOutPresentation = ScoringQueueSignOutPresentation(
            unresolvedCount: unresolvedCount
        )
    }

    func cancelSignOut() async {
        scoringQueueSignOutPresentation = nil
        await tournamentDataLifecycle?.cancelScoringQueueSignOutPreparation()
    }

    func confirmSignOutWithUnresolvedScores() async {
        guard scoringQueueSignOutPresentation != nil else { return }
        await signOut()
    }

    func refreshTournamentDataForForeground() async {
        guard !Task.isCancelled else { return }
        applicationActivity.update(isActive: true)
        applicationActivity.revokeMutationTransport()
        tournamentDataLifecycle?.prepareForForegroundRevalidation()
        applicationLifecycleGeneration &+= 1
        await refreshTournamentDataForForeground(
            lifecycleGeneration: applicationLifecycleGeneration
        )
    }

    func pauseTournamentDataForBackground() async {
        guard !Task.isCancelled else { return }
        applicationActivity.update(isActive: false)
        tournamentDataLifecycle?.prepareForApplicationInactivity()
        applicationLifecycleGeneration &+= 1
        await pauseTournamentDataForBackground(
            lifecycleGeneration: applicationLifecycleGeneration
        )
    }

    /// Records the desired scene state synchronously before launching async
    /// health or suspension work. This prevents an obsolete task from
    /// re-enabling replay after a newer background transition.
    func handleApplicationSceneChange(isActive: Bool) {
        applicationActivity.update(isActive: isActive)
        if isActive {
            applicationActivity.revokeMutationTransport()
            tournamentDataLifecycle?.prepareForForegroundRevalidation()
        } else {
            tournamentDataLifecycle?.prepareForApplicationInactivity()
        }
        applicationLifecycleGeneration &+= 1
        let lifecycleGeneration = applicationLifecycleGeneration
        // Bootstrap already owns the initial exact health attestation. If the
        // scene arrives first, activation reconciles the still-revoked gate
        // after participant state becomes authenticated.
        if isActive {
            guard case .authenticated = state else { return }
        }
        Task { @MainActor [weak self] in
            guard let self,
                  self.applicationLifecycleGeneration == lifecycleGeneration,
                  self.applicationActivity.isActive == isActive
            else { return }
            if isActive {
                await self.refreshTournamentDataForForeground(
                    lifecycleGeneration: lifecycleGeneration
                )
            } else {
                await self.pauseTournamentDataForBackground(
                    lifecycleGeneration: lifecycleGeneration
                )
            }
        }
    }

    private func refreshTournamentDataForForeground(lifecycleGeneration: UInt) async {
        guard applicationLifecycleGeneration == lifecycleGeneration,
              applicationActivity.isActive,
              case .authenticated = state
        else { return }
        let epoch = authenticationEpoch
        guard let api else { return }
        do {
            _ = try await api.health()
            guard lifecycleGeneration == applicationLifecycleGeneration,
                  applicationActivity.isActive,
                  epoch == authenticationEpoch,
                  case .authenticated = state
            else { return }
            applicationActivity.authorizeMutationTransport()
            if environmentResumePending {
                await tournamentDataLifecycle?.resumeAfterEnvironmentReattestation()
                guard lifecycleGeneration == applicationLifecycleGeneration,
                      applicationActivity.isActive,
                      epoch == authenticationEpoch,
                      case .authenticated = state
                else { return }
                environmentResumePending = false
            }
            await tournamentDataLifecycle?.refreshForForeground()
        } catch is CancellationError {
            return
        } catch let error as MobileAPIClientError where error == .transportUnavailable || error == .invalidHTTPResponse {
            // A transient inability to reach health does not overturn the last
            // exact authority attestation or erase eligible offline snapshots.
            return
        } catch {
            guard !Task.isCancelled,
                  lifecycleGeneration == applicationLifecycleGeneration,
                  applicationActivity.isActive,
                  epoch == authenticationEpoch,
                  case .authenticated = state
            else { return }
            await failEnvironmentClosed()
        }
    }

    private func pauseTournamentDataForBackground(lifecycleGeneration: UInt) async {
        guard applicationLifecycleGeneration == lifecycleGeneration,
              !applicationActivity.isActive
        else { return }
        // Structural participant activation is allowed to finish under the
        // already-revoked synchronous scoring gate. The activation helper then
        // performs the ordinary async pause once all child owners exist.
        if case .loadingParticipant = state { return }
        await tournamentDataLifecycle?.pauseForBackground()
    }

    private func activateTournamentData(
        authUserID: String,
        participant: ParticipantSession,
        epoch: UInt
    ) async -> Bool {
        guard !Task.isCancelled, epoch == authenticationEpoch else { return false }
        await tournamentDataLifecycle?.activate(
            authUserID: authUserID,
            participant: participant
        )
        guard !Task.isCancelled, epoch == authenticationEpoch else { return false }
        state = .authenticated(participant)
        if !applicationActivity.isActive {
            await tournamentDataLifecycle?.pauseForBackground()
            guard !Task.isCancelled, epoch == authenticationEpoch else { return false }
        } else if applicationActivity.mutationTransportAuthorization == nil {
            applicationActivity.revokeMutationTransport()
            tournamentDataLifecycle?.prepareForForegroundRevalidation()
            applicationLifecycleGeneration &+= 1
            await refreshTournamentDataForForeground(
                lifecycleGeneration: applicationLifecycleGeneration
            )
            guard !Task.isCancelled,
                  epoch == authenticationEpoch,
                  case .authenticated = state
            else { return false }
        }
        return true
    }

    private func discardAuthentication() async {
        revokeMutationTransportAndPrepareLifecycle()
        environmentResumePending = false
        await tournamentDataLifecycle?.prepareScoringQueueForSignOut()
        await tournamentDataLifecycle?.deactivate(deleteCache: true)
        try? certificationStore?.delete()
        await auth?.signOut()
    }

    func handleReadAccessInvalidation() async {
        prepareForAccessInvalidation()
        guard case .authenticated = state else {
            guard state == .checkingEnvironment || state == .loadingParticipant else { return }
            readAuthorityRevalidationGeneration &+= 1
            readAuthorityRevalidationTask?.cancel()
            readAuthorityRevalidationTask = nil
            authenticationEpoch &+= 1
            await discardAuthentication()
            state = .signedOut
            return
        }
        readAuthorityRevalidationGeneration &+= 1
        readAuthorityRevalidationTask?.cancel()
        readAuthorityRevalidationTask = nil
        authenticationEpoch &+= 1
        await discardAuthentication()
        state = .signedOut
    }

    func revalidateReadAuthorityAfterUnavailableResponse() async {
        startReadAuthorityRevalidation()
        let task = readAuthorityRevalidationTask
        await task?.value
    }

    private func startReadAuthorityRevalidation() {
        guard readAuthorityRevalidationTask == nil,
              case .authenticated(let participant) = state,
              api != nil
        else { return }
        applicationActivity.revokeMutationTransport()
        tournamentDataLifecycle?.prepareForForegroundRevalidation()
        state = .checkingEnvironment
        let epoch = authenticationEpoch
        let lifecycleGeneration = applicationLifecycleGeneration
        readAuthorityRevalidationGeneration &+= 1
        let revalidationGeneration = readAuthorityRevalidationGeneration
        readAuthorityRevalidationTask = Task { @MainActor [weak self] in
            await self?.performReadAuthorityRevalidation(
                participant: participant,
                epoch: epoch,
                lifecycleGeneration: lifecycleGeneration
            )
            guard self?.readAuthorityRevalidationGeneration == revalidationGeneration else { return }
            self?.readAuthorityRevalidationTask = nil
        }
    }

    private func performReadAuthorityRevalidation(
        participant: ParticipantSession,
        epoch: UInt,
        lifecycleGeneration: UInt
    ) async {
        guard let api else { return }
        await tournamentDataLifecycle?.suspendForEnvironmentReattestation()
        environmentResumePending = true
        do {
            _ = try await api.health()
            guard !Task.isCancelled,
                  epoch == authenticationEpoch,
                  state == .checkingEnvironment
            else { return }
            guard lifecycleGeneration == applicationLifecycleGeneration else {
                state = .authenticated(participant)
                if applicationActivity.isActive {
                    handleApplicationSceneChange(isActive: true)
                }
                return
            }
            guard applicationActivity.isActive else {
                state = .authenticated(participant)
                return
            }
            applicationActivity.authorizeMutationTransport()
            await tournamentDataLifecycle?.resumeAfterEnvironmentReattestation()
            guard !Task.isCancelled,
                  epoch == authenticationEpoch,
                  state == .checkingEnvironment
            else { return }
            guard applicationActivity.isActive else {
                await tournamentDataLifecycle?.suspendForEnvironmentReattestation()
                state = .authenticated(participant)
                return
            }
            environmentResumePending = false
            state = .authenticated(participant)
        } catch {
            guard !Task.isCancelled,
                  epoch == authenticationEpoch,
                  state == .checkingEnvironment
            else { return }
            await failEnvironmentClosed()
        }
    }

    private func failEnvironmentClosed() async {
        authenticationEpoch &+= 1
        revokeMutationTransportAndPrepareLifecycle()
        environmentResumePending = false
        await tournamentDataLifecycle?.deactivate(deleteCache: true)
        state = .environmentUnavailable
    }

    func prepareForAccessInvalidation() {
        revokeMutationTransportAndPrepareLifecycle()
    }

    private func revokeMutationTransportAndPrepareLifecycle() {
        applicationActivity.revokeMutationTransport()
        tournamentDataLifecycle?.prepareForApplicationInactivity()
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
