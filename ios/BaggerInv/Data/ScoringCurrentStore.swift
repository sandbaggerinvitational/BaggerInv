import Combine
import Foundation

enum ScoringCurrentPhase: String, Equatable, Sendable {
    case idle
    case loading
    case ready
    case noMatch
    case offline
    case unavailable
    case authenticationRequired
    case authorizationRequired
    case failed
}

enum ScoringCurrentFailure: String, Error, Equatable, Sendable {
    case authentication
    case authorization
    case unavailable
    case contract
    case transport
    case cancelled
}

struct ScoringCurrentState: Equatable, Sendable {
    var scoring: MobileScoringCurrent?
    var generatedAt: MobileTimestamp?
    var phase: ScoringCurrentPhase
    var isRefreshing: Bool
    var lastSafeError: ScoringCurrentFailure?
    var lastServerCode: MobileErrorCode?
    var lastHTTPStatus: Int?

    static let idle = Self(
        scoring: nil,
        generatedAt: nil,
        phase: .idle,
        isRefreshing: false,
        lastSafeError: nil,
        lastServerCode: nil,
        lastHTTPStatus: nil
    )

    /// A prior canonical server response may remain visible for orientation,
    /// but it is not writable authority while the current read is unavailable.
    var isOrientationOnly: Bool {
        guard scoring != nil else { return false }
        return phase == .offline || phase == .unavailable || phase == .failed
    }
}

@MainActor
final class ScoringCurrentStore: ObservableObject {
    @Published private(set) var state: ScoringCurrentState = .idle

    private let api: any MobileAPIServing
    private let credentialProvider: any MobileReadCredentialProviding
    private var activeAuthUserID: String?
    private var activeMatchID: String?
    private var refreshTask: Task<Void, Never>?
    private var generation: UInt = 0
    private var accessInvalidationHandler: (@MainActor @Sendable () -> Void)?
    private var authorityRevalidationHandler: (@MainActor @Sendable () -> Void)?

    init(
        api: any MobileAPIServing,
        credentialProvider: any MobileReadCredentialProviding
    ) {
        self.api = api
        self.credentialProvider = credentialProvider
    }

    func setAccessInvalidationHandler(_ handler: @escaping @MainActor @Sendable () -> Void) {
        accessInvalidationHandler = handler
    }

    func setAuthorityRevalidationHandler(_ handler: @escaping @MainActor @Sendable () -> Void) {
        authorityRevalidationHandler = handler
    }

    func activate(
        authUserID: String,
        matchID: String? = nil,
        beginRefresh: Bool = true
    ) async {
        guard !authUserID.isEmpty else {
            await deactivate()
            state.phase = .authenticationRequired
            state.lastSafeError = .authentication
            accessInvalidationHandler?()
            return
        }

        if activeAuthUserID != authUserID || activeMatchID != matchID {
            await deactivate()
            activeAuthUserID = authUserID
            activeMatchID = matchID
            generation &+= 1
        }

        if beginRefresh {
            await refresh()
        }
    }

    func refresh(matchID: String? = nil) async {
        guard activeAuthUserID != nil else { return }
        if let matchID, matchID != activeMatchID {
            generation &+= 1
            let previousTask = refreshTask
            refreshTask = nil
            previousTask?.cancel()
            await previousTask?.value
            activeMatchID = matchID
            state = .idle
        }
        if let refreshTask {
            await refreshTask.value
            return
        }

        let operationGeneration = generation
        let authUserID = activeAuthUserID
        let requestedMatchID = activeMatchID
        let task = Task { @MainActor [weak self] in
            guard let self, let authUserID else { return }
            await self.performRefresh(
                expectedAuthUserID: authUserID,
                matchID: requestedMatchID,
                operationGeneration: operationGeneration
            )
            if self.generation == operationGeneration {
                self.refreshTask = nil
                self.state.isRefreshing = false
            }
        }
        refreshTask = task
        await task.value
    }

    func cancelRefresh() async {
        let task = refreshTask
        refreshTask = nil
        task?.cancel()
        await task?.value
        state.isRefreshing = false
    }

    func suspendForEnvironmentReattestation() async {
        generation &+= 1
        let task = refreshTask
        refreshTask = nil
        task?.cancel()
        await task?.value
        state = .idle
    }

    func deactivate() async {
        generation &+= 1
        activeAuthUserID = nil
        activeMatchID = nil
        state = .idle
        let task = refreshTask
        refreshTask = nil
        task?.cancel()
        await task?.value
    }

    private func performRefresh(
        expectedAuthUserID: String,
        matchID: String?,
        operationGeneration: UInt
    ) async {
        guard isActive(expectedAuthUserID, matchID: matchID, generation: operationGeneration) else { return }
        let previousPhase = state.phase
        state.isRefreshing = true
        state.lastSafeError = nil
        state.lastServerCode = nil
        state.lastHTTPStatus = nil
        if state.scoring == nil {
            state.phase = .loading
        }

        do {
            try Task.checkCancellation()
            let credentials = try await credentialProvider.credentials(
                expectedAuthUserID: expectedAuthUserID
            )
            try Task.checkCancellation()
            guard credentials.authUserID == expectedAuthUserID else {
                throw MobileReadCredentialError.authIdentityChanged
            }
            let response = try await api.scoringCurrent(
                accessToken: credentials.accessToken,
                certification: credentials.certification,
                matchID: matchID
            )
            try Task.checkCancellation()
            guard isActive(expectedAuthUserID, matchID: matchID, generation: operationGeneration) else { return }
            guard response.isContractCompatible else {
                throw MobileContractError.incompatibleResponse
            }
            if let matchID, let scoring = response.data.scoring, scoring.match.matchId != matchID {
                throw MobileContractError.incompatibleResponse
            }

            state.scoring = response.data.scoring
            state.generatedAt = response.meta.generatedAt
            state.phase = response.data.scoring == nil ? .noMatch : .ready
            state.lastSafeError = nil
            state.lastServerCode = nil
            state.lastHTTPStatus = nil
        } catch is CancellationError {
            guard isActive(expectedAuthUserID, matchID: matchID, generation: operationGeneration) else { return }
            state.lastSafeError = .cancelled
            if state.scoring == nil {
                state.phase = previousPhase == .loading ? .idle : previousPhase
            }
        } catch {
            guard isActive(expectedAuthUserID, matchID: matchID, generation: operationGeneration) else { return }
            handle(error)
        }
    }

    private func handle(_ error: any Error) {
        let failure = classify(error)
        let diagnostic = serverDiagnostic(error)
        state.lastSafeError = failure
        state.lastServerCode = diagnostic.code
        state.lastHTTPStatus = diagnostic.status
        state.isRefreshing = false

        switch failure {
        case .authentication:
            state.scoring = nil
            state.generatedAt = nil
            state.phase = .authenticationRequired
            accessInvalidationHandler?()
        case .authorization:
            state.scoring = nil
            state.generatedAt = nil
            state.phase = .authorizationRequired
            if shouldInvalidateAccess(for: diagnostic.code, status: diagnostic.status) {
                accessInvalidationHandler?()
            }
        case .transport:
            state.phase = state.scoring == nil ? .failed : .offline
        case .unavailable, .contract:
            state.phase = state.scoring == nil ? .unavailable : .unavailable
        case .cancelled:
            state.phase = state.scoring == nil ? .idle : .ready
        }

        if diagnostic.code == .mobileAPIUnavailable {
            authorityRevalidationHandler?()
        }
    }

    private func classify(_ error: any Error) -> ScoringCurrentFailure {
        if let failure = error as? ScoringCurrentFailure { return failure }
        if let credentialError = error as? MobileReadCredentialError {
            switch credentialError {
            case .authSessionUnavailable:
                return .transport
            case .authSessionMissing, .authIdentityChanged, .certificationUnavailable:
                return .authentication
            }
        }
        if error is MobileContractError || error is DecodingError { return .contract }
        guard let apiError = error as? MobileAPIClientError else { return .transport }
        switch apiError {
        case .missingBearer, .missingCertification:
            return .authentication
        case .transportUnavailable, .invalidHTTPResponse:
            return .transport
        case .unexpectedStatus(let status):
            if status == 401 { return .authentication }
            if status == 403 { return .authorization }
            if status == 404 || status == 429 || status >= 500 { return .unavailable }
            return .contract
        case .server(let code, let status):
            if status == 401 || code == .unauthorized || code == .invalidToken {
                return .authentication
            }
            if status == 403 ||
                code == .participantNotFound ||
                code == .authCertificationFailed ||
                code == .scoringNotAuthorized
            {
                return .authorization
            }
            if status == 404 || status == 429 || status >= 500 ||
                code == .mobileAPIUnavailable ||
                code == .scoringUnavailable ||
                code == .matchNotFound ||
                code == .scoringReadOnly
            {
                return .unavailable
            }
            return .contract
        case .invalidURL:
            return .contract
        }
    }

    private func serverDiagnostic(_ error: any Error) -> (code: MobileErrorCode?, status: Int?) {
        guard let apiError = error as? MobileAPIClientError else { return (nil, nil) }
        switch apiError {
        case .server(let code, let status): return (code, status)
        case .unexpectedStatus(let status): return (nil, status)
        default: return (nil, nil)
        }
    }

    private func shouldInvalidateAccess(for code: MobileErrorCode?, status: Int?) -> Bool {
        if code == .scoringNotAuthorized || code == .matchNotFound || code == .scoringReadOnly {
            return false
        }
        return status == 401 || status == 403 ||
            code == .unauthorized ||
            code == .invalidToken ||
            code == .participantNotFound ||
            code == .authCertificationFailed
    }

    private func isActive(_ authUserID: String, matchID: String?, generation: UInt) -> Bool {
        activeAuthUserID == authUserID && activeMatchID == matchID && self.generation == generation
    }
}
