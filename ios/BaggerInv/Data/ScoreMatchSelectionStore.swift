import Combine
import Foundation

struct ScoreAuthorizedMatchChoice: Identifiable, Equatable, Sendable {
    let match: MobileMatchesMatch
    let scoring: MobileScoringCurrent
    var id: Data { Data(match.matchId.utf8) }
}

enum ScoreMatchSelectionPhase: Equatable { case idle, loading, ready, selecting, expired, unavailable }
enum ScoreMatchSelectionError: Error { case unavailable }

/// Ephemeral, online-only discovery. Neither /matches involvement nor a
/// previously displayed choice grants permission. No disk/cache/queue writes.
@MainActor
final class ScoreMatchSelectionStore: ObservableObject {
    @Published private(set) var choices: [ScoreAuthorizedMatchChoice] = []
    @Published private(set) var phase: ScoreMatchSelectionPhase = .idle
    private let api: any MobileAPIServing
    private let credentials: any MobileReadCredentialProviding
    private let activity: NativeApplicationActivity
    private let now: () -> Date
    private let uptime: () -> TimeInterval
    private var identity: ScoringQueueIdentityPartition?
    private var generation: UInt = 0
    private var validUntil: Date?
    private var validUntilUptime: TimeInterval?
    private var verifiedMatchID: String?
    private var expiryTask: Task<Void, Never>?
    private var onAccessInvalidation: (@MainActor @Sendable () -> Void)?
    private var onAuthorityRevalidation: (@MainActor @Sendable () -> Void)?

    init(api: any MobileAPIServing, credentials: any MobileReadCredentialProviding,
         activity: NativeApplicationActivity, now: @escaping () -> Date = Date.init,
         uptime: @escaping () -> TimeInterval = { ProcessInfo.processInfo.systemUptime }) {
        self.api = api; self.credentials = credentials; self.activity = activity; self.now = now; self.uptime = uptime
    }

    func setAccessInvalidationHandler(_ action: @escaping @MainActor @Sendable () -> Void) { onAccessInvalidation = action }
    func setAuthorityRevalidationHandler(_ action: @escaping @MainActor @Sendable () -> Void) { onAuthorityRevalidation = action }

    func activate(identity: ScoringQueueIdentityPartition) {
        invalidate(); self.identity = identity
    }

    func deactivate() { identity = nil; invalidate() }

    func invalidate() {
        generation &+= 1
        expiryTask?.cancel(); expiryTask = nil
        validUntil = nil; validUntilUptime = nil; verifiedMatchID = nil; choices = []; phase = .idle
    }

    func expireIfNeeded() {
        if (validUntil.map { now() >= $0 } == true) || (validUntilUptime.map { uptime() >= $0 } == true) {
            invalidate(); phase = .expired
        }
    }

    func refresh() async {
        invalidate()
        guard let identity, activity.isActive else { phase = .unavailable; return }
        let operation = generation
        // Bound the entire discovery, not just the last response. The sheet
        // never retains a rolling, partially verified permission list.
        let deadline = now().addingTimeInterval(30)
        let deadlineUptime = uptime() + 30
        phase = .loading
        do {
            let credential = try await currentCredentials(identity, operation)
            let indexRead = try await api.matches(accessToken: credential.accessToken,
                                             certification: credential.certification, etag: nil)
            try check(identity, operation)
            guard case .modified(let response, _) = indexRead,
                  response.isCompatible(expectedTournamentID: identity.tournamentId, expectedPlayerID: identity.playerId),
                  Set(response.data.matches.map { Data($0.matchId.utf8) }).count == response.data.matches.count
            else { throw MobileContractError.incompatibleResponse }
            var verified: [ScoreAuthorizedMatchChoice] = []
            for match in response.data.matches where match.authenticatedPlayer.involved {
                guard match.teams.flatMap(\.participants).filter(\.isAuthenticatedPlayer).map(\.playerId) == [identity.playerId]
                else { throw MobileContractError.incompatibleResponse }
                do {
                    let canonical = try await read(match, identity, operation)
                    if canonical.permission.canScore && !canonical.permission.readOnly {
                        guard canonical.match.status == .inProgress, canonical.match.format.isKnown else {
                            throw MobileContractError.incompatibleResponse
                        }
                        verified.append(.init(match: match, scoring: canonical))
                    }
                } catch let error as MobileAPIClientError {
                    // Only explicit scoped denials are exclusions. Transport,
                    // authentication or contract failures invalidate the list.
                    if case .server(let code, let status) = error,
                       (status == 403 && (code == .scoringNotAuthorized || code == .scoringReadOnly)) ||
                        (status == 404 && code == .matchNotFound) { continue }
                    throw error
                }
            }
            try check(identity, operation)
            guard now() < deadline, uptime() < deadlineUptime else { throw ScoreMatchSelectionError.unavailable }
            choices = verified; validUntil = deadline; validUntilUptime = deadlineUptime; phase = .ready
            expiryTask = Task { @MainActor [weak self] in
                do { try await Task.sleep(nanoseconds: UInt64(max(0, deadlineUptime - (self?.uptime() ?? deadlineUptime)) * 1_000_000_000)) }
                catch { return }
                guard let self, self.generation == operation else { return }
                self.invalidate(); self.phase = .expired
            }
        } catch { fail(error, operation: operation) }
    }

    /// Recheck the exact selected Match with current credentials. The caller
    /// still activates it via the existing scoring-current read/store path.
    func verifySelection(matchID: String) async throws {
        expireIfNeeded()
        guard phase == .ready, let identity,
              let choice = choices.first(where: { MobileOpaqueMatchID.isEqual($0.match.matchId, matchID) })
        else { throw ScoreMatchSelectionError.unavailable }
        let operation = generation
        phase = .selecting; choices = []
        do {
            let canonical = try await read(choice.match, identity, operation)
            try check(identity, operation)
            guard let validUntil, now() < validUntil, let validUntilUptime, uptime() < validUntilUptime,
                  canonical.permission.canScore, !canonical.permission.readOnly,
                  canonical.match.status == .inProgress, canonical.match.format.isKnown
            else { throw ScoreMatchSelectionError.unavailable }
            verifiedMatchID = matchID
        } catch {
            fail(error, operation: operation)
            throw ScoreMatchSelectionError.unavailable
        }
    }

    func canCommitSelection(matchID: String) -> Bool {
        phase == .selecting && activity.isActive && identity != nil &&
        validUntil.map { now() < $0 } == true &&
        validUntilUptime.map { uptime() < $0 } == true &&
        verifiedMatchID.map { MobileOpaqueMatchID.isEqual($0, matchID) } == true
    }

    private func read(_ match: MobileMatchesMatch, _ identity: ScoringQueueIdentityPartition,
                      _ operation: UInt) async throws -> MobileScoringCurrent {
        let credential = try await currentCredentials(identity, operation)
        let response = try await api.scoringCurrent(accessToken: credential.accessToken,
                                                    certification: credential.certification, matchID: match.matchId)
        try check(identity, operation)
        guard response.isContractCompatible, let canonical = response.data.scoring,
              MobileOpaqueMatchID.isEqual(canonical.match.matchId, match.matchId),
              canonical.sides.count == match.teams.count
        else { throw MobileContractError.incompatibleResponse }
        guard canonical.player.playerId == identity.playerId else { throw MobileReadCredentialError.authIdentityChanged }
        for (side, team) in zip(canonical.sides, match.teams) {
            guard side.side == team.side, side.teamId == team.teamId,
                  side.participants.map(\.playerId) == team.participants.map(\.playerId),
                  side.participants.filter(\.isAuthenticatedPlayer).map(\.playerId) == team.participants.filter(\.isAuthenticatedPlayer).map(\.playerId)
            else { throw MobileContractError.incompatibleResponse }
        }
        return canonical
    }

    private func currentCredentials(_ identity: ScoringQueueIdentityPartition, _ operation: UInt) async throws -> MobileReadCredentials {
        try check(identity, operation)
        let value = try await credentials.credentials(expectedAuthUserID: identity.authUserId)
        try check(identity, operation)
        guard value.authUserID == identity.authUserId else { throw MobileReadCredentialError.authIdentityChanged }
        return value
    }

    private func check(_ identity: ScoringQueueIdentityPartition, _ operation: UInt) throws {
        try Task.checkCancellation()
        guard self.identity == identity, generation == operation, activity.isActive else { throw CancellationError() }
    }

    private func fail(_ error: any Error, operation: UInt) {
        guard operation == generation else { return }
        invalidate(); phase = .unavailable
        if let error = error as? MobileReadCredentialError, error != .authSessionUnavailable { onAccessInvalidation?() }
        if case MobileAPIClientError.server(let code, let status) = error {
            if status == 401 || code == .participantNotFound || code == .authCertificationFailed { onAccessInvalidation?() }
            if code == .mobileAPIUnavailable { onAuthorityRevalidation?() }
        }
    }
}
