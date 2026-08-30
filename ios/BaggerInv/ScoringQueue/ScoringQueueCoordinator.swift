import Combine
import Foundation

enum ScoringQueueCoordinatorError: Error, Equatable {
    case inactiveIdentity
    case identityMismatch
    case invalidCanonicalContext
    case notEligibleForRetry
    case notReviewable
    case liveMutationDisabled
    case canonicalRefreshFailed
    case finalizationQueueNotReady
    case invalidFinalizationGuard
    case matchRequiresReview
}

struct ScoringQueueFinalizationGuard: Equatable, Sendable {
    let id: String
    let partition: ScoringQueuePartition
}

struct ScoringQueueCoordinatorState: Equatable, Sendable {
    var records: [ScoringQueueRecord]
    var isOffline: Bool
    var isSuspended: Bool
    var lastPersistenceFailure: Bool
    var hasHiddenQuarantinedRecords: Bool
    var agedPendingRecordIDs: Set<String>
    var supportMetadataByRecordID: [String: ScoringQueueSupportMetadata]

    static let inactive = Self(
        records: [],
        isOffline: false,
        isSuspended: false,
        lastPersistenceFailure: false,
        hasHiddenQuarantinedRecords: false,
        agedPendingRecordIDs: [],
        supportMetadataByRecordID: [:]
    )

    var unresolvedCount: Int {
        records.filter(\.isUnresolved).count
    }

    /// New local intent remains available while ordinary queued/syncing work
    /// progresses (including offline multi-hole entry), but an authority,
    /// lifecycle, conflict, or quarantine blocker freezes the entire Match.
    /// A stale writable scoring snapshot must never reopen admission after a
    /// canonical rejection whose follow-up refresh failed.
    func allowsNewLocalIntent(matchId: String) -> Bool {
        guard !isSuspended,
              !lastPersistenceFailure,
              !hasHiddenQuarantinedRecords
        else { return false }
        return !records.contains {
            $0.partition.matchId == matchId &&
                $0.isUnresolved &&
                $0.blocksNewLocalIntentForMatch
        }
    }
}

/// Owns durable scoring intent, replay ordering, and reconciliation. The
/// canonical scoring reader remains a separate authority and the live mutation
/// capability remains an explicit integration input so ineligible builds fail
/// closed.
@MainActor
final class ScoringQueueCoordinator: ObservableObject {
    @Published private(set) var state: ScoringQueueCoordinatorState = .inactive

    private let repository: any ScoringQueueRepository
    private let api: any MobileAPIServing
    private let credentialProvider: any MobileReadCredentialProviding
    private let applicationActivity: NativeApplicationActivity
    private let now: () -> Date
    private let jitter: @Sendable () -> Double
    private let processId: String
    private let mutationAuthorization: any ScoringHoleMutationAuthorizing
    private let maximumWorkers: Int
    private var capabilityScopeBlocked = false

    var liveMutationSendingEnabled: Bool { mutationAuthorization.allowsTransport }

    private var activeIdentity: ScoringQueueIdentityPartition?
    private var signOutAdmissionPaused = false
    private var finalizationGateID: String?
    /// A durable finalization probe must regain exclusive Match ownership (or
    /// be proven absent) before hole admission/replay can resume after launch,
    /// foregrounding, environment recovery, or cancelled sign-out.
    private var finalizationRecoveryInProgress = false
    /// Local offline Save remains available during an ordinary foreground
    /// authority outage. It is fenced only when a durable finalization probe
    /// is known/potentially present for the active identity.
    private var finalizationRecoveryBlocksLocalSave = false
    /// Closes the MainActor reentrancy gap between admission and durable Save.
    private var saveAdmissionsInFlight: [ScoringQueuePartition: Int] = [:]
    private var didRecoverProcessLeases = false
    private var lifecycleGeneration: UInt = 0
    private var schedulerTask: Task<Void, Never>?
    private var workerTasks: [ScoringQueuePartition: Task<Void, Never>] = [:]
    private var retryWakeTask: Task<Void, Never>?
    private var roundRobinCursor = 0
    private var foregroundTransientFailureCount = 0
    /// A successful scene health check still must be followed by a canonical
    /// scoring refresh before queued writes may resume.
    private var foregroundRevalidationInProgress = false
    private var partitionsRequiringCanonicalRefresh: Set<ScoringQueuePartition> = []
    private var refreshFailureCounts: [String: Int] = [:]
    /// A failed authoritative queue transition is not equivalent to a failed
    /// read. Keep the affected identity fail-closed for this coordinator
    /// lifetime so a later successful reload cannot erase the safety signal.
    private var stickyReliabilityFailureIdentity: ScoringQueueIdentityPartition?
    private var canonicalUpdateHandler: (@MainActor @Sendable (MobileScoringCurrentResponse) -> Void)?
    private var accessInvalidationHandler: (@MainActor @Sendable () -> Void)?
    private var authorityRevalidationHandler: (@MainActor @Sendable () -> Void)?

    private var isAdmissionPaused: Bool {
        signOutAdmissionPaused ||
            finalizationGateID != nil ||
            finalizationRecoveryInProgress ||
            foregroundRevalidationInProgress ||
            capabilityScopeBlocked ||
            applicationActivity.mutationTransportAuthorization == nil
    }

    /// A transient foreground health/canonical failure blocks transport but
    /// must not destroy Step 2F's ability to commit new intent locally while
    /// the already-authenticated golfer is active and using an in-memory
    /// canonical snapshot.
    private var isLocalSavePaused: Bool {
        signOutAdmissionPaused ||
            finalizationGateID != nil ||
            finalizationRecoveryBlocksLocalSave ||
            capabilityScopeBlocked ||
            !applicationActivity.isActive
    }

    init(
        repository: any ScoringQueueRepository,
        api: any MobileAPIServing,
        credentialProvider: any MobileReadCredentialProviding,
        applicationActivity: NativeApplicationActivity = NativeApplicationActivity(isActive: true),
        mutationAuthorization: (any ScoringHoleMutationAuthorizing)? = nil,
        maximumWorkers: Int = 2,
        processId: String = UUID().uuidString.lowercased(),
        now: @escaping () -> Date = Date.init,
        jitter: @escaping @Sendable () -> Double = { Double.random(in: -0.2...0.2) }
    ) {
        self.repository = repository
        self.api = api
        self.credentialProvider = credentialProvider
        self.applicationActivity = applicationActivity
        self.mutationAuthorization = mutationAuthorization ?? DisabledScoringHoleMutationAuthorization()
        self.maximumWorkers = min(max(maximumWorkers, 1), 2)
        self.processId = processId
        self.now = now
        self.jitter = jitter
    }

    func setCanonicalUpdateHandler(
        _ handler: @escaping @MainActor @Sendable (MobileScoringCurrentResponse) -> Void
    ) {
        canonicalUpdateHandler = handler
    }

    func setAccessInvalidationHandler(_ handler: @escaping @MainActor @Sendable () -> Void) {
        accessInvalidationHandler = handler
    }

    func setAuthorityRevalidationHandler(_ handler: @escaping @MainActor @Sendable () -> Void) {
        authorityRevalidationHandler = handler
    }

    func activate(identity: ScoringQueueIdentityPartition) async {
        guard Self.valid(identity) else {
            await deactivate()
            accessInvalidationHandler?()
            return
        }
        lifecycleGeneration &+= 1
        let activationGeneration = lifecycleGeneration
        cancelSchedulingAndWorkers()
        if stickyReliabilityFailureIdentity != identity {
            stickyReliabilityFailureIdentity = nil
        }
        activeIdentity = identity
        capabilityScopeBlocked = false
        signOutAdmissionPaused = false
        finalizationGateID = nil
        foregroundRevalidationInProgress = true
        state.isSuspended = applicationActivity.mutationTransportAuthorization == nil

        do {
            if !didRecoverProcessLeases {
                _ = try await repository.recoverInterruptedSync(at: now())
                guard activationGeneration == lifecycleGeneration,
                      activeIdentity == identity
                else { return }
                didRecoverProcessLeases = true
            }
            if let isolationRepository = repository as? any ScoringQueuePartitionIsolationRepository {
                _ = try await isolationRepository.markRelatedPartitionsForReview(
                    activeIdentity: identity,
                    at: now()
                )
                guard activationGeneration == lifecycleGeneration,
                      activeIdentity == identity
                else { return }
            }
            try await applyStalePolicyAndReload(
                expectedGeneration: activationGeneration,
                expectedIdentity: identity
            )
            guard activationGeneration == lifecycleGeneration,
                  activeIdentity == identity
            else { return }
            await compactReceiptEligibleRecords()
            guard activationGeneration == lifecycleGeneration,
                  activeIdentity == identity
            else { return }
            partitionsRequiringCanonicalRefresh = Set(
                state.records.filter(\.isUnresolved).map(\.partition)
            )
            guard activationGeneration == lifecycleGeneration,
                  activeIdentity == identity,
                  applicationActivity.mutationTransportAuthorization != nil
            else { return }
            state.isSuspended = false
            guard await refreshUnresolvedMatchesBeforeReplay() else { return }
            guard activationGeneration == lifecycleGeneration,
                  activeIdentity == identity,
                  applicationActivity.mutationTransportAuthorization != nil,
                  !state.isSuspended
            else { return }
            foregroundRevalidationInProgress = false
            wakeReplay()
        } catch {
            guard activationGeneration == lifecycleGeneration,
                  activeIdentity == identity,
                  !state.isSuspended
            else { return }
            state.lastPersistenceFailure = true
        }
    }

    func deactivate() async {
        lifecycleGeneration &+= 1
        cancelSchedulingAndWorkers()
        activeIdentity = nil
        capabilityScopeBlocked = false
        signOutAdmissionPaused = false
        finalizationGateID = nil
        finalizationRecoveryInProgress = false
        finalizationRecoveryBlocksLocalSave = false
        foregroundRevalidationInProgress = false
        foregroundTransientFailureCount = 0
        partitionsRequiringCanonicalRefresh = []
        refreshFailureCounts = [:]
        state = .inactive
    }

    func suspendForEnvironmentReattestation() async {
        lifecycleGeneration &+= 1
        cancelSchedulingAndWorkers()
        foregroundRevalidationInProgress = true
        state.isSuspended = true
    }

    /// Called synchronously from the scene callback so a worker cannot cross
    /// the MainActor handoff before the async suspension begins.
    func prepareForApplicationInactivity() {
        lifecycleGeneration &+= 1
        cancelSchedulingAndWorkers()
        foregroundRevalidationInProgress = true
        state.isSuspended = true
    }

    /// Arms the canonical-refresh barrier before foreground health begins.
    func prepareForForegroundRevalidation() {
        guard activeIdentity != nil else { return }
        lifecycleGeneration &+= 1
        cancelSchedulingAndWorkers()
        foregroundRevalidationInProgress = true
        state.isSuspended = false
    }

    /// Foreground execution is never assumed after iOS backgrounds the app.
    /// Cancel replay scheduling while allowing an already-started atomic local
    /// SQLite save to finish. Foreground resume revalidates canonical state
    /// before any eligible record is sent again.
    func pauseForBackground() async {
        await suspendForEnvironmentReattestation()
    }

    func resumeAfterEnvironmentReattestation() async {
        guard let identity = activeIdentity,
              applicationActivity.mutationTransportAuthorization != nil
        else { return }
        lifecycleGeneration &+= 1
        let resumeGeneration = lifecycleGeneration
        cancelSchedulingAndWorkers()
        foregroundRevalidationInProgress = true
        foregroundTransientFailureCount = 0
        state.isSuspended = false
        partitionsRequiringCanonicalRefresh.formUnion(
            state.records.filter(\.isUnresolved).map(\.partition)
        )
        guard await refreshUnresolvedMatchesBeforeReplay() else { return }
        guard resumeGeneration == lifecycleGeneration,
              activeIdentity == identity,
              applicationActivity.mutationTransportAuthorization != nil,
              !state.isSuspended
        else { return }
        foregroundRevalidationInProgress = false
        wakeReplay()
    }

    func refreshForForeground() async {
        guard let identity = activeIdentity,
              applicationActivity.mutationTransportAuthorization != nil
        else { return }
        lifecycleGeneration &+= 1
        let refreshGeneration = lifecycleGeneration
        cancelSchedulingAndWorkers()
        foregroundRevalidationInProgress = true
        state.isSuspended = false
        foregroundTransientFailureCount = 0
        refreshFailureCounts = [:]
        do {
            try await applyStalePolicyAndReload(
                expectedGeneration: refreshGeneration,
                expectedIdentity: identity
            )
        } catch {
            state.lastPersistenceFailure = true
            return
        }
        guard refreshGeneration == lifecycleGeneration,
              activeIdentity == identity,
              applicationActivity.mutationTransportAuthorization != nil,
              !state.isSuspended
        else { return }
        partitionsRequiringCanonicalRefresh.formUnion(
            state.records.filter(\.isUnresolved).map(\.partition)
        )
        guard await refreshUnresolvedMatchesBeforeReplay() else { return }
        guard refreshGeneration == lifecycleGeneration,
              activeIdentity == identity,
              applicationActivity.mutationTransportAuthorization != nil,
              !state.isSuspended
        else { return }
        foregroundRevalidationInProgress = false
        wakeReplay()
    }

    func prepareForSignOut() async {
        signOutAdmissionPaused = true
        lifecycleGeneration &+= 1
        cancelSchedulingAndWorkers()
        await reloadActiveRecords()
    }

    func cancelSignOutPreparation() async {
        guard activeIdentity != nil else { return }
        signOutAdmissionPaused = false
        wakeReplay()
    }

    /// Synchronously fences both local Save and hole replay while the separate
    /// online-only finalization owner reloads/reconciles its durable probe.
    /// The fence intentionally survives queue activation and scene barriers.
    func beginFinalizationRecoveryBarrier(blockLocalSaves: Bool = false) {
        finalizationRecoveryInProgress = true
        if blockLocalSaves {
            finalizationRecoveryBlocksLocalSave = true
        }
        lifecycleGeneration &+= 1
        cancelSchedulingAndWorkers()
    }

    /// Refines only local score admission after the finalization owner has
    /// inspected its device-local probe. Network replay stays fenced until
    /// `completeFinalizationRecoveryBarrier()` is called after canonical
    /// recovery under a current Preview authority grant.
    func setFinalizationRecoveryLocalSaveBlocked(_ blocked: Bool) {
        guard finalizationRecoveryInProgress else { return }
        finalizationRecoveryBlocksLocalSave = blocked
    }

    /// Called only after the finalization owner has durably removed its probe
    /// or proved that no probe exists for the exact active identity.
    func completeFinalizationRecoveryBarrier() {
        guard finalizationRecoveryInProgress else { return }
        finalizationRecoveryInProgress = false
        finalizationRecoveryBlocksLocalSave = false
        wakeReplay()
    }

    /// Atomically pauses new local score admission and proves the exact Match
    /// has no unresolved durable intent before an online-only finalization.
    /// The caller must release this guard after canonical reconciliation.
    func acquireFinalizationGuard(matchId: String) async throws -> ScoringQueueFinalizationGuard {
        guard let identity = activeIdentity,
              MobileScoringIdentifier.isValid(matchId)
        else { throw ScoringQueueCoordinatorError.finalizationQueueNotReady }

        let partition = ScoringQueuePartition(
            authUserId: identity.authUserId,
            playerId: identity.playerId,
            tournamentId: identity.tournamentId,
            matchId: matchId
        )
        guard saveAdmissionsInFlight[partition, default: 0] == 0,
              finalizationGateID == nil,
              !signOutAdmissionPaused,
              !foregroundRevalidationInProgress,
              applicationActivity.mutationTransportAuthorization != nil,
              !state.isSuspended,
              !state.lastPersistenceFailure,
              !state.hasHiddenQuarantinedRecords
        else { throw ScoringQueueCoordinatorError.finalizationQueueNotReady }

        let guardID = UUID().uuidString.lowercased()
        finalizationGateID = guardID
        lifecycleGeneration &+= 1
        cancelSchedulingAndWorkers()

        do {
            let records = try await repository.records(in: partition)
            let durableUnresolved = try await repository.unresolvedCount(in: partition)
            let visibleUnresolved = records.filter(\.isUnresolved).count
            guard durableUnresolved == 0,
                  visibleUnresolved == 0,
                  durableUnresolved == visibleUnresolved,
                  finalizationGateID == guardID,
                  activeIdentity == identity,
                  !signOutAdmissionPaused,
                  !foregroundRevalidationInProgress,
                  applicationActivity.mutationTransportAuthorization != nil,
                  !state.isSuspended
            else { throw ScoringQueueCoordinatorError.finalizationQueueNotReady }
            return ScoringQueueFinalizationGuard(id: guardID, partition: partition)
        } catch {
            if finalizationGateID == guardID {
                finalizationGateID = nil
                wakeReplay()
            }
            throw error
        }
    }

    func releaseFinalizationGuard(_ guardToken: ScoringQueueFinalizationGuard) throws {
        guard finalizationGateID == guardToken.id,
              guardToken.partition.identity == activeIdentity
        else { throw ScoringQueueCoordinatorError.invalidFinalizationGuard }
        finalizationGateID = nil
        wakeReplay()
    }

    func unresolvedActiveCount() async -> Int? {
        guard let identity = activeIdentity else { return 0 }
        // Sign-out confirmation must account for a Save that has crossed the
        // MainActor admission boundary but has not yet committed to SQLite.
        // Returning an apparent zero here would skip the participant warning.
        guard !hasSaveAdmissionInFlight(for: identity) else { return nil }
        do {
            let count = try await repository.unresolvedCount(for: identity)
            guard activeIdentity == identity,
                  !hasSaveAdmissionInFlight(for: identity)
            else { return nil }
            return count
        } catch {
            state.lastPersistenceFailure = true
            return nil
        }
    }

    @discardableResult
    func save(_ input: ScoringQueueSaveInput) async throws -> ScoringQueueSaveResult {
        guard let activeIdentity, !isLocalSavePaused, !state.isSuspended else {
            throw ScoringQueueCoordinatorError.inactiveIdentity
        }
        guard input.partition.identity == activeIdentity else {
            throw ScoringQueueCoordinatorError.identityMismatch
        }
        guard state.allowsNewLocalIntent(matchId: input.partition.matchId) else {
            throw ScoringQueueCoordinatorError.matchRequiresReview
        }

        saveAdmissionsInFlight[input.partition, default: 0] += 1
        defer {
            let remaining = saveAdmissionsInFlight[input.partition, default: 1] - 1
            if remaining == 0 {
                saveAdmissionsInFlight.removeValue(forKey: input.partition)
            } else {
                saveAdmissionsInFlight[input.partition] = remaining
            }
        }

        do {
            // Transport capability is deliberately not local-save authority:
            // Step 2F must be able to commit offline intent in an eligible,
            // active identity partition even when official transport is
            // disabled. Reassert every admission guard immediately before the
            // durable repository boundary.
            guard self.activeIdentity == activeIdentity,
                  input.partition.identity == activeIdentity,
                  !isLocalSavePaused,
                  !state.isSuspended,
                  state.allowsNewLocalIntent(matchId: input.partition.matchId)
            else { throw ScoringQueueCoordinatorError.inactiveIdentity }

            let result = try await repository.save(input)
            state.lastPersistenceFailure = stickyReliabilityFailureIdentity == activeIdentity
            if case .superseded(let previous, _) = result {
                await makeReceiptIfSupported(
                    recordId: previous.localQueueRecordId,
                    retention: ScoringQueueReceiptPolicy.resolutionRetention
                )
            }
            // A Save may commit after the foreground barrier took its initial
            // queue snapshot. Always require that newly durable partition to
            // receive canonical scoring-current preflight before any POST.
            // This is intentionally conservative on the online fast path.
            partitionsRequiringCanonicalRefresh.insert(input.partition)
            await reloadActiveRecords()
            wakeReplay()
            return result
        } catch {
            if (error as? SQLiteScoringQueueRepositoryError) != .reviewRequired {
                state.lastPersistenceFailure = true
            }
            throw error
        }
    }

    @discardableResult
    func save(
        draft: ScoringDraft,
        presentation: ScoringPresentation,
        originatingAppBuild: String = Bundle.main.object(
            forInfoDictionaryKey: "CFBundleVersion"
        ) as? String ?? "unknown"
    ) async throws -> ScoringQueueSaveResult {
        guard let activeIdentity else {
            throw ScoringQueueCoordinatorError.inactiveIdentity
        }
        let input = try presentation.queueSaveInput(
            draft: draft,
            identity: activeIdentity,
            originatingAppBuild: originatingAppBuild,
            now: now()
        )
        return try await save(input)
    }

    func markNetworkUnavailable(_ unavailable: Bool) {
        let wasOffline = state.isOffline
        state.isOffline = unavailable
        if wasOffline && !unavailable {
            foregroundTransientFailureCount = 0
            if applicationActivity.mutationTransportAuthorization == nil {
                // A successful protected read is a useful connectivity signal,
                // but only exact /health may reopen scoring transport.
                authorityRevalidationHandler?()
            } else {
                wakeReplay()
            }
        }
    }

    func records(for matchId: String) -> [ScoringQueueRecord] {
        state.records
            .filter { $0.partition.matchId == matchId }
            .sorted { $0.sequence < $1.sequence }
    }

    func latestRecord(matchId: String, holeNumber: Int) -> ScoringQueueRecord? {
        records(for: matchId)
            .filter { $0.intent.holeNumber == holeNumber }
            .max { $0.sequence < $1.sequence }
    }

    func reliabilityStatus(matchId: String, holeNumber: Int? = nil) -> ScoringReliabilityStatus {
        if state.lastPersistenceFailure || state.hasHiddenQuarantinedRecords {
            return .needsReview
        }
        let candidates = records(for: matchId).filter { record in
            holeNumber.map { record.intent.holeNumber == $0 } ?? true
        }
        if candidates.contains(where: { $0.state == .conflict || $0.state == .actionRequired || $0.state == .quarantined }) {
            if candidates.contains(where: { $0.stateReasonCode == .authentication }) { return .signInAgain }
            return .needsReview
        }
        if candidates.contains(where: { $0.state == .syncing || ($0.state == .acknowledged && $0.acknowledgement?.refreshPending == true) }) {
            return .syncing
        }
        if candidates.contains(where: { $0.state == .retryable }) {
            return state.isOffline ? .offline : .retrying
        }
        if candidates.contains(where: { $0.state == .queued }) {
            return state.isOffline ? .offline : .savedOnIPhone
        }
        return .official
    }

    func manualRetry(recordId: String) async throws {
        guard !isAdmissionPaused,
              !state.isSuspended,
              let current = state.records.first(where: { $0.localQueueRecordId == recordId }),
              current.state == .retryable,
              mutationAuthorization.permitsReplay(current),
              current.attempt.lastAttemptAt.map({ now().timeIntervalSince($0) >= 2 }) ?? true
        else { throw ScoringQueueCoordinatorError.notEligibleForRetry }
        var updated = current
        updated.state = .queued
        updated.stateReasonCode = nil
        updated.attempt.nextRetryAt = nil
        updated.updatedAt = now()
        _ = try await repository.replace(updated, expecting: current)
        foregroundTransientFailureCount = 0
        await reloadActiveRecords()
        wakeReplay()
    }

    func keepOfficial(recordId: String) async throws {
        guard !isAdmissionPaused,
              !state.isSuspended,
              let current = state.records.first(where: { $0.localQueueRecordId == recordId }),
              current.state == .conflict,
              let recordedConflict = current.conflict,
              !recordedConflict.refreshRequired
        else { throw ScoringQueueCoordinatorError.notReviewable }

        // "Keep Official" releases later work only after a fresh canonical
        // read proves that the reviewed official target and immutable scoring
        // snapshot are still the ones the participant chose to keep.
        let canonical = try await canonicalRefresh(for: current.partition)
        guard canonicalRevisionEvidenceDoesNotRegress(
            canonical,
            from: current
        ) else {
            throw ScoringQueueCoordinatorError.canonicalRefreshFailed
        }
        guard canonical.snapshot.snapshotId == current.base.snapshotId,
              canonical.snapshot.revision == current.base.snapshotRevision
        else {
            try await transitionReviewToActionRequired(
                current,
                reason: .identityMismatch,
                canonical: canonical
            )
            throw ScoringQueueCoordinatorError.notReviewable
        }
        let refreshedOfficial = canonicalGross(
            in: canonical,
            holeNumber: current.intent.holeNumber
        )
        guard refreshedOfficial == recordedConflict.officialGross else {
            try await persistRefreshedConflictEvidence(current, canonical: canonical)
            // The golfer's confirmation referred to a previous official
            // value. Persist the new comparison and require a fresh choice.
            throw ScoringQueueCoordinatorError.notReviewable
        }

        var updated = current
        let resolvedAt = nextConflictEvidenceTimestamp(after: current)
        updated.state = .resolved
        updated.stateReasonCode = nil
        updated.resolution = ScoringQueueResolution(
            reason: .keptOfficial,
            resolvedAt: resolvedAt,
            relatedLocalQueueRecordId: nil
        )
        updated.acknowledgement = nil
        updated.conflict = nil
        updated.attempt.syncLeaseId = nil
        updated.attempt.syncLeaseStartedAt = nil
        updated.lastKnownServer = canonicalServerState(
            canonical,
            holeNumber: current.intent.holeNumber,
            refreshedAt: resolvedAt
        )
        updated.updatedAt = resolvedAt
        _ = try await repository.replace(updated, expecting: current)
        await makeReceiptIfSupported(recordId: recordId, retention: 7 * 24 * 60 * 60)
        partitionsRequiringCanonicalRefresh.insert(current.partition)
        await reloadActiveRecords()
        wakeReplay()
    }

    @discardableResult
    func reapplyMyScore(
        recordId: String,
        originatingAppBuild: String = Bundle.main.object(
            forInfoDictionaryKey: "CFBundleVersion"
        ) as? String ?? "unknown"
    ) async throws -> ScoringQueueConflictReapplyResult {
        guard mutationAuthorization.allowsReapply else {
            throw ScoringQueueCoordinatorError.liveMutationDisabled
        }
        guard !isAdmissionPaused,
              !state.isSuspended,
              let current = state.records.first(where: { $0.localQueueRecordId == recordId }),
              current.state == .conflict,
              current.stateReasonCode == .revision,
              current.conflict?.refreshRequired == false
        else { throw ScoringQueueCoordinatorError.notReviewable }

        let canonical = try await canonicalRefresh(for: current.partition)
        guard canonical.snapshot.snapshotId == current.base.snapshotId,
              canonical.snapshot.revision == current.base.snapshotRevision
        else {
            try await transitionReviewToActionRequired(
                current,
                reason: .identityMismatch,
                canonical: canonical
            )
            throw ScoringQueueCoordinatorError.notReviewable
        }
        guard canonical.match.status == .inProgress else {
            try await transitionReviewToActionRequired(
                current,
                reason: .finalized,
                canonical: canonical
            )
            throw ScoringQueueCoordinatorError.notReviewable
        }
        guard !canonical.permission.readOnly else {
            try await transitionReviewToActionRequired(
                current,
                reason: .readOnly,
                canonical: canonical
            )
            throw ScoringQueueCoordinatorError.notReviewable
        }
        guard canonical.permission.canScore else {
            try await transitionReviewToActionRequired(
                current,
                reason: .authorization,
                canonical: canonical
            )
            throw ScoringQueueCoordinatorError.notReviewable
        }
        guard canonicalGross(in: canonical, holeNumber: current.intent.holeNumber) ==
                current.conflict?.officialGross
        else {
            try await persistRefreshedConflictEvidence(current, canonical: canonical)
            throw ScoringQueueCoordinatorError.notReviewable
        }
        let canonicalFormat: ScoringQueueFormat
        switch canonical.match.format {
        case .bestBall:
            canonicalFormat = .bestBall
        case .scramble:
            canonicalFormat = .scramble
        case .singles:
            canonicalFormat = .singles
        case .unknown:
            throw ScoringQueueCoordinatorError.notReviewable
        }
        let canonicalSideSlotCount = canonicalFormat == .bestBall ? 2 : 1
        let evidence = ScoringQueueConflictReapplyEvidence(
            partition: current.partition,
            matchId: canonical.match.matchId,
            playerId: canonical.player.playerId,
            snapshotId: canonical.snapshot.snapshotId,
            snapshotRevision: canonical.snapshot.revision,
            scoringFormat: canonicalFormat,
            sideSlotCount: canonicalSideSlotCount,
            matchStatus: canonical.match.status,
            canScore: canonical.permission.canScore,
            readOnly: canonical.permission.readOnly,
            officialGross: canonicalGross(
                in: canonical,
                holeNumber: current.intent.holeNumber
            ),
            server: canonicalServerState(
                canonical,
                holeNumber: current.intent.holeNumber,
                refreshedAt: now()
            )
        )
        let result = try await repository.reapplyConflict(
            recordId: recordId,
            evidence: evidence,
            originatingAppBuild: originatingAppBuild
        )
        await makeReceiptIfSupported(
            recordId: result.resolvedConflict.localQueueRecordId,
            retention: 7 * 24 * 60 * 60
        )
        partitionsRequiringCanonicalRefresh.insert(current.partition)
        await reloadActiveRecords()
        wakeReplay()
        return result
    }

    private func persistRefreshedConflictEvidence(
        _ current: ScoringQueueRecord,
        canonical: MobileScoringCurrent
    ) async throws {
        let refreshedAt = nextConflictEvidenceTimestamp(after: current)
        var updated = current
        updated.state = .conflict
        updated.stateReasonCode = .revision
        updated.attempt.nextRetryAt = nil
        updated.conflict = ScoringQueueConflict(
            officialGross: canonicalGross(
                in: canonical,
                holeNumber: current.intent.holeNumber
            ),
            currentMatchRevision: canonical.match.matchRevision,
            currentHoleRevision: canonicalHoleRevision(
                in: canonical,
                holeNumber: current.intent.holeNumber
            ),
            currentPermissionRevision: canonical.match.permissionRevision,
            refreshRequired: false,
            recordedAt: refreshedAt
        )
        updated.lastKnownServer = canonicalServerState(
            canonical,
            holeNumber: current.intent.holeNumber,
            refreshedAt: refreshedAt
        )
        updated.updatedAt = refreshedAt
        _ = try await repository.replace(updated, expecting: current)
        await reloadActiveRecords()
    }

    private func transitionReviewToActionRequired(
        _ current: ScoringQueueRecord,
        reason: ScoringQueueStateReasonCode,
        canonical: MobileScoringCurrent
    ) async throws {
        let refreshedAt = nextConflictEvidenceTimestamp(after: current)
        var updated = current
        updated.state = .actionRequired
        updated.stateReasonCode = reason
        updated.attempt.nextRetryAt = nil
        updated.attempt.syncLeaseId = nil
        updated.attempt.syncLeaseStartedAt = nil
        updated.conflict = ScoringQueueConflict(
            officialGross: canonicalGross(
                in: canonical,
                holeNumber: current.intent.holeNumber
            ),
            currentMatchRevision: canonical.match.matchRevision,
            currentHoleRevision: canonicalHoleRevision(
                in: canonical,
                holeNumber: current.intent.holeNumber
            ),
            currentPermissionRevision: canonical.match.permissionRevision,
            refreshRequired: false,
            recordedAt: refreshedAt
        )
        updated.lastKnownServer = canonicalServerState(
            canonical,
            holeNumber: current.intent.holeNumber,
            refreshedAt: refreshedAt
        )
        updated.updatedAt = refreshedAt
        do {
            _ = try await repository.replace(updated, expecting: current)
        } catch {
            failClosedAfterDurableTransitionFailure(
                publishState: true,
                operationGeneration: nil,
                partition: current.partition
            )
            throw error
        }
        await reloadActiveRecords()
    }

    private func wakeReplay() {
        guard liveMutationSendingEnabled,
              activeIdentity != nil,
              let authorization = applicationActivity.mutationTransportAuthorization,
              !state.isSuspended,
              !isAdmissionPaused,
              !state.lastPersistenceFailure,
              !state.hasHiddenQuarantinedRecords,
              !capabilityScopeBlocked,
              schedulerTask == nil
        else { return }
        if ScoringQueueRetryPolicy.shouldPauseAggressiveRetries(
            consecutiveForegroundFailures: foregroundTransientFailureCount
        ) {
            // The persisted due time is itself one of Step 1D's approved
            // resume signals. Do not spin immediately after eight failures,
            // but do not strand the queue until a manual lifecycle event.
            scheduleNextRetryWakeIfNeeded(resetForegroundPauseOnWake: true)
            return
        }
        let generation = lifecycleGeneration
        schedulerTask = Task { @MainActor [weak self] in
            guard let self else { return }
            await self.scheduleEligibleWorkers(
                generation: generation,
                authorization: authorization
            )
            if self.lifecycleGeneration == generation {
                self.schedulerTask = nil
            }
        }
    }

    private func scheduleEligibleWorkers(
        generation: UInt,
        authorization: NativeApplicationActivity.MutationTransportAuthorization
    ) async {
        guard generation == lifecycleGeneration,
              let identity = activeIdentity,
              applicationActivity.permits(authorization),
              !state.isSuspended,
              !isAdmissionPaused,
              !state.lastPersistenceFailure,
              !state.hasHiddenQuarantinedRecords,
              !capabilityScopeBlocked,
              foregroundTransientFailureCount < 8
        else { return }

        await reloadActiveRecords()
        let grouped = Dictionary(grouping: state.records.filter(\.isUnresolved), by: \.partition)
        var partitions = grouped.keys.sorted { lhs, rhs in
            lhs.matchId == rhs.matchId
                ? lhs.authUserId < rhs.authUserId
                : lhs.matchId < rhs.matchId
        }
        if !partitions.isEmpty {
            let offset = roundRobinCursor % partitions.count
            partitions = Array(partitions[offset...] + partitions[..<offset])
            roundRobinCursor = (offset + 1) % partitions.count
        }

        for partition in partitions where workerTasks.count < maximumWorkers {
            guard workerTasks[partition] == nil,
                  partition.identity == identity,
                  let oldest = grouped[partition]?.sorted(by: { $0.sequence < $1.sequence }).first,
                  mutationAuthorization.permitsReplay(oldest),
                  eligibleForWorker(oldest, at: now())
            else { continue }

            let task = Task { @MainActor [weak self] in
                guard let self else { return }
                await self.processOldest(
                    in: partition,
                    generation: generation,
                    authorization: authorization
                )
                // Cancellation does not guarantee an in-flight transport
                // returns immediately. A worker from an obsolete lifecycle
                // must never erase or publish over a replacement worker for
                // the same partition after suspend/resume or reactivation.
                guard self.transportLifecycleIsCurrent(
                    generation,
                    partition: partition
                ), !self.state.lastPersistenceFailure else { return }
                self.workerTasks[partition] = nil
                await self.reloadActiveRecords()
                guard self.transportLifecycleIsCurrent(
                    generation,
                    partition: partition
                ), !self.state.lastPersistenceFailure else { return }
                self.wakeReplay()
            }
            workerTasks[partition] = task
        }

        scheduleNextRetryWakeIfNeeded()
    }

    private func eligibleForWorker(_ record: ScoringQueueRecord, at date: Date) -> Bool {
        switch record.state {
        case .queued:
            return record.attempt.nextRetryAt.map { $0 <= date } ?? true
        case .retryable:
            return record.attempt.nextRetryAt.map { $0 <= date } ?? true
        case .acknowledged:
            return record.acknowledgement?.refreshPending == true &&
                (record.attempt.nextRetryAt.map { $0 <= date } ?? true)
        case .conflict:
            return record.conflict?.refreshRequired == true &&
                (record.attempt.nextRetryAt.map { $0 <= date } ?? true)
        case .syncing, .actionRequired, .quarantined, .resolved:
            return false
        }
    }

    private func processOldest(
        in partition: ScoringQueuePartition,
        generation: UInt,
        authorization: NativeApplicationActivity.MutationTransportAuthorization
    ) async {
        guard generation == lifecycleGeneration,
              partition.identity == activeIdentity,
              applicationActivity.permits(authorization)
        else { return }
        let initialOldest: ScoringQueueRecord?
        do {
            initialOldest = try await repository.oldestUnresolved(in: partition)
        } catch {
            failClosedAfterDurableTransitionFailure(
                publishState: true,
                operationGeneration: generation,
                partition: partition
            )
            return
        }
        guard var oldest = initialOldest,
              mutationAuthorization.permitsReplay(oldest),
              mutationAuthorization.permitsActiveRecords(state.records.filter(\.isUnresolved))
        else {
            capabilityScopeBlocked = liveMutationSendingEnabled
            return
        }

        if oldest.state == .acknowledged, oldest.acknowledgement?.refreshPending == true {
            await reconcileAcknowledgedAfterRefresh(oldest, generation: generation)
            return
        }

        if oldest.state == .conflict, oldest.conflict?.refreshRequired == true {
            await reconcileRevisionConflict(recordId: oldest.localQueueRecordId)
            return
        }


        if oldest.state == .retryable,
           oldest.attempt.nextRetryAt.map({ $0 <= now() }) ?? true
        {
            let current = oldest
            oldest.state = .queued
            oldest.stateReasonCode = nil
            oldest.attempt.nextRetryAt = nil
            oldest.updatedAt = now()
            do {
                oldest = try await repository.replace(oldest, expecting: current)
            } catch {
                failClosedAfterDurableTransitionFailure(
                    publishState: true,
                    operationGeneration: generation,
                    partition: partition
                )
                return
            }
        }

        guard await applyStaleGuard(to: oldest) else { return }
        var preflightCanonical: MobileScoringCurrent?
        if partitionsRequiringCanonicalRefresh.contains(partition) ||
            oldest.createdAt.addingTimeInterval(6 * 60 * 60) <= now()
        {
            do {
                let canonical = try await canonicalRefresh(for: partition)
                preflightCanonical = canonical
                partitionsRequiringCanonicalRefresh.remove(partition)
                if requiresSameIDRecovery(oldest) {
                    // A request with an unknown outcome may already have
                    // committed. Mutable permission/final-state changes must
                    // not suppress the contract's same-ID recovery path. Even
                    // when preflight already shows the intended score, an
                    // acknowledgement that was not durably stored remains
                    // indistinguishable from a lost response. Replay the same
                    // mutation ID and require the canonical idempotent ACK.
                } else {
                    await reconcileLifecycle(
                        canonical,
                        partition: partition,
                        generation: generation
                    )
                }
            } catch {
                guard generation == lifecycleGeneration,
                      partition.identity == activeIdentity,
                      !state.isSuspended
                else { return }
                await handleCanonicalPreflightFailure(
                    error,
                    for: oldest,
                    generation: generation
                )
                return
            }
        }

        if let canonical = preflightCanonical {
            let refreshedOldest: ScoringQueueRecord?
            do {
                refreshedOldest = try await repository.oldestUnresolved(in: partition)
            } catch {
                failClosedAfterDurableTransitionFailure(
                    publishState: true,
                    operationGeneration: generation,
                    partition: partition
                )
                return
            }
            guard let refreshedOldest,
                  refreshedOldest.localQueueRecordId == oldest.localQueueRecordId,
                  refreshedOldest.state == .queued,
                  mutationAuthorization.permitsReplay(refreshedOldest)
            else { return }
            oldest = refreshedOldest

            if !requiresSameIDRecovery(oldest) {
                guard canonical.snapshot.snapshotId == oldest.base.snapshotId,
                      canonical.snapshot.revision == oldest.base.snapshotRevision
                else {
                    await markActionRequired(oldest, reason: .identityMismatch)
                    return
                }

                let canonicalHole = canonicalHoleRevision(
                    in: canonical,
                    holeNumber: oldest.intent.holeNumber
                )
                if !canonicalTargetIsUnchanged(for: oldest, canonical: canonical) ||
                    canonical.match.matchRevision != oldest.base.expectedMatchRevision ||
                    canonicalHole != oldest.base.expectedHoleRevision
                {
                    guard await persistPreflightRevisionConflict(
                        oldest,
                        canonical: canonical,
                        generation: generation
                    ) else { return }
                    await reconcileRevisionConflict(
                        recordId: oldest.localQueueRecordId,
                        canonical: canonical
                    )
                    guard let safelyReconciled = try? await repository.oldestUnresolved(in: partition),
                          safelyReconciled.localQueueRecordId == oldest.localQueueRecordId,
                          safelyReconciled.state == .queued,
                          safelyReconciled.base.snapshotId == canonical.snapshot.snapshotId,
                          safelyReconciled.base.snapshotRevision == canonical.snapshot.revision,
                          safelyReconciled.base.expectedMatchRevision == canonical.match.matchRevision,
                          safelyReconciled.base.expectedHoleRevision == canonicalHoleRevision(
                              in: canonical,
                              holeNumber: safelyReconciled.intent.holeNumber
                          ),
                          canonicalTargetIsUnchanged(for: safelyReconciled, canonical: canonical)
                    else { return }
                    oldest = safelyReconciled
                }
            }
        }

        let leaseId = "\(processId):\(UUID().uuidString.lowercased())"
        let leased: ScoringQueueRecord?
        do {
            leased = try await repository.acquireSyncLease(
                in: partition,
                leaseId: leaseId,
                at: now()
            )
        } catch {
            failClosedAfterDurableTransitionFailure(
                publishState: true,
                operationGeneration: generation,
                partition: partition
            )
            return
        }
        guard let leased else { return }
        guard mutationAuthorization.permitsReplay(leased) else {
            capabilityScopeBlocked = true
            return
        }

        let credentials: MobileReadCredentials
        do {
            credentials = try await credentialProvider.credentials(expectedAuthUserID: partition.authUserId)
            guard credentials.authUserID == partition.authUserId else {
                throw MobileReadCredentialError.authIdentityChanged
            }
        } catch {
            await markActionRequired(
                leased,
                reason: credentialReason(error),
                publishState: transportLifecycleIsCurrent(generation, partition: partition),
                operationGeneration: generation
            )
            return
        }
        guard generation == lifecycleGeneration,
              partition.identity == activeIdentity,
              applicationActivity.permits(authorization),
              !state.isSuspended,
              !isAdmissionPaused,
              mutationAuthorization.permitsReplay(leased),
              !Task.isCancelled
        else {
            await makeRetryable(
                leased,
                reason: .unknownOutcome,
                errorCode: nil,
                status: nil,
                retryAfter: nil,
                publishState: false
            )
            return
        }

        let transmitted: ScoringQueueRecord
        do {
            transmitted = try await repository.markTransportStarted(
                recordId: leased.localQueueRecordId,
                leaseId: leaseId,
                at: now()
            )
        } catch {
            failClosedAfterDurableTransitionFailure(
                publishState: true,
                operationGeneration: generation,
                partition: partition
            )
            return
        }

        // Persisting transport-start intentionally happens before bytes may
        // leave the device. Re-check lifecycle authority after that actor/DB
        // suspension point so sign-out or environment suspension cannot send
        // using credentials captured by an obsolete queue generation.
        guard generation == lifecycleGeneration,
              partition.identity == activeIdentity,
              applicationActivity.permits(authorization),
              !state.isSuspended,
              !isAdmissionPaused,
              mutationAuthorization.permitsReplay(transmitted),
              !Task.isCancelled
        else {
            await makeRetryable(
                transmitted,
                reason: .unknownOutcome,
                errorCode: nil,
                status: nil,
                retryAfter: nil,
                publishState: false
            )
            return
        }

        let request = MobileScoringHoleRequest(record: transmitted)
        guard mutationAuthorization.permitsReplay(transmitted) else {
            capabilityScopeBlocked = true
            return
        }
        do {
            let response = try await api.scoringHole(
                request: request,
                accessToken: credentials.accessToken,
                certification: credentials.certification
            )
            await persistAcknowledgement(response, for: transmitted, generation: generation)
        } catch let error as MobileScoringMutationError {
            if await retryAfterAuthenticationIfNeeded(
                error,
                record: transmitted,
                request: request,
                generation: generation,
                authorization: authorization
            ) {
                return
            }
            await classify(error, for: transmitted, generation: generation)
        } catch {
            await makeRetryable(
                transmitted,
                reason: .unknownOutcome,
                errorCode: nil,
                status: nil,
                retryAfter: nil,
                publishState: transportLifecycleIsCurrent(generation, partition: partition),
                operationGeneration: generation
            )
        }
    }

    private func retryAfterAuthenticationIfNeeded(
        _ error: MobileScoringMutationError,
        record: ScoringQueueRecord,
        request: MobileScoringHoleRequest,
        generation: UInt,
        authorization: NativeApplicationActivity.MutationTransportAuthorization
    ) async -> Bool {
        guard case .rejected(let code, _, _, _) = error,
              code == .unauthorized || code == .invalidToken,
              transportLifecycleIsCurrent(generation, partition: record.partition)
        else { return false }
        let credentials: MobileReadCredentials
        do {
            credentials = try await credentialProvider.refreshedCredentials(
                expectedAuthUserID: record.partition.authUserId
            )
        } catch {
            let publishState = transportLifecycleIsCurrent(generation, partition: record.partition)
            await markActionRequired(
                record,
                reason: .authentication,
                publishState: publishState,
                operationGeneration: generation
            )
            if transportLifecycleIsCurrent(generation, partition: record.partition) {
                accessInvalidationHandler?()
            }
            return true
        }

        guard credentials.authUserID == record.partition.authUserId else {
            let publishState = transportLifecycleIsCurrent(generation, partition: record.partition)
            await markActionRequired(
                record,
                reason: .identityChanged,
                publishState: publishState,
                operationGeneration: generation
            )
            if transportLifecycleIsCurrent(generation, partition: record.partition) {
                accessInvalidationHandler?()
            }
            return true
        }
        guard generation == lifecycleGeneration,
              record.partition.identity == activeIdentity,
              applicationActivity.permits(authorization),
              !state.isSuspended,
              !isAdmissionPaused,
              mutationAuthorization.permitsReplay(record),
              !Task.isCancelled
        else {
            await makeRetryable(
                record,
                reason: .unknownOutcome,
                errorCode: nil,
                status: nil,
                retryAfter: nil,
                publishState: false
            )
            return true
        }

        guard let leaseId = record.attempt.syncLeaseId else {
            failClosedAfterDurableTransitionFailure(
                publishState: true,
                operationGeneration: generation,
                partition: record.partition
            )
            return true
        }
        let retriedRecord: ScoringQueueRecord
        do {
            // The token-refresh retry is a second real transport attempt. It
            // must be durably counted before bytes may leave the device.
            retriedRecord = try await repository.markTransportStarted(
                recordId: record.localQueueRecordId,
                leaseId: leaseId,
                at: now()
            )
        } catch {
            failClosedAfterDurableTransitionFailure(
                publishState: true,
                operationGeneration: generation,
                partition: record.partition
            )
            return true
        }

        guard generation == lifecycleGeneration,
              record.partition.identity == activeIdentity,
              applicationActivity.permits(authorization),
              !state.isSuspended,
              !isAdmissionPaused,
              mutationAuthorization.permitsReplay(retriedRecord),
              !Task.isCancelled
        else {
            await makeRetryable(
                retriedRecord,
                reason: .unknownOutcome,
                errorCode: nil,
                status: nil,
                retryAfter: nil,
                publishState: false
            )
            return true
        }

        do {
            guard mutationAuthorization.permitsReplay(retriedRecord) else {
                capabilityScopeBlocked = true
                return true
            }
            let response = try await api.scoringHole(
                request: request,
                accessToken: credentials.accessToken,
                certification: credentials.certification
            )
            await persistAcknowledgement(response, for: retriedRecord, generation: generation)
        } catch let retryError as MobileScoringMutationError {
            if case .rejected(let retryCode, _, _, _) = retryError,
               retryCode == .unauthorized || retryCode == .invalidToken
            {
                let publishState = transportLifecycleIsCurrent(
                    generation,
                    partition: retriedRecord.partition
                )
                await markActionRequired(
                    retriedRecord,
                    reason: .authentication,
                    publishState: publishState,
                    operationGeneration: generation
                )
                if transportLifecycleIsCurrent(
                    generation,
                    partition: retriedRecord.partition
                ) {
                    accessInvalidationHandler?()
                }
            } else {
                await classify(retryError, for: retriedRecord, generation: generation)
            }
        } catch {
            await makeRetryable(
                retriedRecord,
                reason: .unknownOutcome,
                errorCode: nil,
                status: nil,
                retryAfter: nil,
                publishState: transportLifecycleIsCurrent(
                    generation,
                    partition: retriedRecord.partition
                ),
                operationGeneration: generation
            )
        }
        return true
    }

    private func persistAcknowledgement(
        _ response: MobileScoringHoleResponse,
        for current: ScoringQueueRecord,
        generation: UInt
    ) async {
        let publishState = transportLifecycleIsCurrent(
            generation,
            partition: current.partition
        )
        guard response.isContractCompatible(for: MobileScoringHoleRequest(record: current))
        else {
            await makeRetryable(
                current,
                reason: .unknownOutcome,
                errorCode: nil,
                status: 200,
                retryAfter: nil,
                publishState: publishState,
                operationGeneration: generation
            )
            return
        }
        var updated = current
        updated.state = .acknowledged
        updated.stateReasonCode = nil
        updated.attempt.outcomeCertainty = .knownAccepted
        updated.attempt.syncLeaseId = nil
        updated.attempt.syncLeaseStartedAt = nil
        updated.attempt.lastHttpStatus = 200
        updated.attempt.lastErrorCode = nil
        updated.acknowledgement = ScoringQueueAcknowledgement(
            accepted: true,
            idempotent: response.data.idempotent,
            semanticNoop: response.data.semanticNoop,
            canonicalMatchRevision: response.data.match.revision,
            canonicalHoleRevision: response.data.hole.revision,
            responseAt: now(),
            refreshPending: true
        )
        updated.updatedAt = now()
        do {
            let persisted = try await repository.replace(updated, expecting: current)
            guard transportLifecycleIsCurrent(generation, partition: current.partition) else {
                await notifyCurrentLifecycleAfterStaleDurableTransition(
                    partition: current.partition
                )
                return
            }
            foregroundTransientFailureCount = 0
            await reloadActiveRecords()
            await reconcileAcknowledgedAfterRefresh(persisted, generation: generation)
        } catch {
            // The server may have accepted while local acknowledgement storage
            // failed. Leave the durable syncing record for same-ID crash recovery.
            failClosedAfterDurableTransitionFailure(
                publishState: true,
                operationGeneration: generation,
                partition: current.partition
            )
        }
    }

    private func reconcileAcknowledgedAfterRefresh(
        _ current: ScoringQueueRecord,
        generation: UInt
    ) async {
        guard generation == lifecycleGeneration,
              let acknowledgement = current.acknowledgement,
              acknowledgement.refreshPending
        else { return }
        do {
            let canonical = try await canonicalRefresh(for: current.partition)
            try await applyAcknowledgementRefresh(
                current,
                acknowledgement: acknowledgement,
                canonical: canonical,
                generation: generation
            )
        } catch {
            guard generation == lifecycleGeneration,
                  current.partition.identity == activeIdentity,
                  !state.isSuspended
            else { return }
            // Acknowledged + refreshPending is durable and intentionally cannot
            // be resubmitted. Foreground/relaunch will retry refresh only.
            await scheduleRefreshOnlyRetry(current, generation: generation)
        }
    }

    private func applyAcknowledgementRefresh(
        _ current: ScoringQueueRecord,
        acknowledgement: ScoringQueueAcknowledgement,
        canonical: MobileScoringCurrent,
        generation: UInt
    ) async throws {
        guard generation == lifecycleGeneration else { return }
        let refreshedHoleRevision = canonicalHoleRevision(
            in: canonical,
            holeNumber: current.intent.holeNumber
        )
        guard canonical.match.matchRevision >= acknowledgement.canonicalMatchRevision,
              refreshedHoleRevision >= acknowledgement.canonicalHoleRevision
        else { throw ScoringQueueCoordinatorError.canonicalRefreshFailed }

        let canonicalRefreshedAt = now()
        let canonicalIntent = canonicalGross(
            in: canonical,
            holeNumber: current.intent.holeNumber
        )
        guard canonical.snapshot.snapshotId == current.base.snapshotId,
              canonical.snapshot.revision == current.base.snapshotRevision,
              canonicalIntent == current.intent.gross
        else {
            try await persistAcknowledgedCanonicalDisagreement(
                current,
                canonical: canonical,
                refreshedAt: canonicalRefreshedAt
            )
            return
        }

        if canonical.match.matchRevision == acknowledgement.canonicalMatchRevision,
           refreshedHoleRevision == acknowledgement.canonicalHoleRevision
        {
            // Hand revision proof to the next intent before making the
            // predecessor receipt-eligible. If the process dies between these
            // two durable operations, refreshPending remains true and blocks
            // replay/compaction; relaunch safely repeats this idempotent handoff
            // with the same canonical evidence.
            try await handOffRevision(after: current, canonical: canonical)
        }

        var updated = current
        updated.acknowledgement?.refreshPending = false
        updated.attempt.nextRetryAt = nil
        updated.lastKnownServer = canonicalServerState(
            canonical,
            holeNumber: current.intent.holeNumber,
            refreshedAt: canonicalRefreshedAt
        )
        updated.updatedAt = canonicalRefreshedAt
        let persisted = try await repository.replace(updated, expecting: current)
        refreshFailureCounts.removeValue(forKey: current.localQueueRecordId)
        await makeReceiptIfSupported(
            recordId: persisted.localQueueRecordId,
            retention: ScoringQueueReceiptPolicy.acknowledgementRetention
        )
        await reloadActiveRecords()
    }

    private func persistAcknowledgedCanonicalDisagreement(
        _ current: ScoringQueueRecord,
        canonical: MobileScoringCurrent,
        refreshedAt: Date
    ) async throws {
        var updated = current
        updated.state = .conflict
        updated.stateReasonCode = .revision
        updated.attempt.nextRetryAt = nil
        updated.conflict = ScoringQueueConflict(
            officialGross: canonicalGross(
                in: canonical,
                holeNumber: current.intent.holeNumber
            ),
            currentMatchRevision: canonical.match.matchRevision,
            currentHoleRevision: canonicalHoleRevision(
                in: canonical,
                holeNumber: current.intent.holeNumber
            ),
            currentPermissionRevision: canonical.match.permissionRevision,
            refreshRequired: false,
            recordedAt: refreshedAt
        )
        updated.lastKnownServer = canonicalServerState(
            canonical,
            holeNumber: current.intent.holeNumber,
            refreshedAt: refreshedAt
        )
        // Preserve the accepted acknowledgement. It proves what happened to
        // the original mutation ID while the newer canonical value is reviewed.
        updated.updatedAt = refreshedAt
        _ = try await repository.replace(updated, expecting: current)
        refreshFailureCounts.removeValue(forKey: current.localQueueRecordId)
        await reloadActiveRecords()
    }

    private func handOffRevision(
        after accepted: ScoringQueueRecord,
        canonical: MobileScoringCurrent
    ) async throws {
        guard let acknowledgement = accepted.acknowledgement,
              canonical.match.matchRevision == acknowledgement.canonicalMatchRevision,
              canonical.permission.canScore,
              !canonical.permission.readOnly,
              canonical.match.status == .inProgress,
              canonical.snapshot.snapshotId == accepted.base.snapshotId,
              canonical.snapshot.revision == accepted.base.snapshotRevision
        else { return }

        let records = try await repository.records(in: accepted.partition)
            .sorted { $0.sequence < $1.sequence }
        guard let next = records.first(where: { $0.sequence > accepted.sequence && $0.isUnresolved })
        else { return }

        let isSameHoleCorrection = next.intent.holeNumber == accepted.intent.holeNumber
        let canonicalTargetIsSafe = isSameHoleCorrection
            ? canonicalGross(in: canonical, holeNumber: next.intent.holeNumber) == accepted.intent.gross
            : canonicalTargetIsUnchanged(for: next, canonical: canonical)
        guard
              next.state == .queued,
              next.base.snapshotId == accepted.base.snapshotId,
              next.base.snapshotRevision == accepted.base.snapshotRevision,
              canonicalTargetIsSafe,
              !isSameHoleCorrection ||
                canonicalHoleRevision(in: canonical, holeNumber: next.intent.holeNumber) ==
                    acknowledgement.canonicalHoleRevision
        else { return }

        let refreshedAt = max(accepted.updatedAt, now())
        let evidence = ScoringQueueRevisionHandoffEvidence(
            server: canonicalServerState(
                canonical,
                holeNumber: next.intent.holeNumber,
                refreshedAt: refreshedAt
            ),
            matchId: canonical.match.matchId,
            playerId: canonical.player.playerId,
            snapshotId: canonical.snapshot.snapshotId,
            snapshotRevision: canonical.snapshot.revision,
            matchStatus: canonical.match.status,
            canScore: canonical.permission.canScore,
            readOnly: canonical.permission.readOnly,
            targetOfficialGross: canonicalGross(
                in: canonical,
                holeNumber: next.intent.holeNumber
            )
        )
        _ = try await repository.handOffCanonicalRevisions(
            recordId: next.localQueueRecordId,
            afterAcknowledgedRecordId: accepted.localQueueRecordId,
            evidence: evidence,
            at: refreshedAt
        )
    }

    private func classify(
        _ error: MobileScoringMutationError,
        for current: ScoringQueueRecord,
        generation: UInt
    ) async {
        let publishState = transportLifecycleIsCurrent(
            generation,
            partition: current.partition
        )
        switch error {
        case .definitelyNotSent(let reason):
            switch reason {
            case .missingBearer, .missingCertification:
                await markActionRequired(
                    current,
                    reason: .authentication,
                    publishState: publishState,
                    operationGeneration: generation
                )
            case .invalidRequest, .encoding:
                await quarantine(
                    current,
                    reason: .invalidRecordOrContract,
                    code: nil,
                    status: nil,
                    publishState: publishState,
                    operationGeneration: generation
                )
            case .clientUnavailable, .invalidURL, .requestConstruction:
                await makeRetryable(
                    current,
                    reason: .environment,
                    errorCode: nil,
                    status: nil,
                    retryAfter: nil,
                    publishState: publishState,
                    operationGeneration: generation
                )
            }
        case .unknownOutcome(_, let code, let status, _, let retryAfter):
            await makeRetryable(
                current,
                reason: code == .mobileAPIUnavailable || code == .scoringUnavailable ? .environment : .unknownOutcome,
                errorCode: code,
                status: status,
                retryAfter: retryAfter,
                publishState: publishState,
                operationGeneration: generation
            )
            if transportLifecycleIsCurrent(generation, partition: current.partition),
               code == .mobileAPIUnavailable
            {
                authorityRevalidationHandler?()
            }
        case .rejected(let code, let status, let data, let retryAfter):
            await classifyKnownRejection(
                code: code,
                status: status,
                data: data,
                retryAfter: retryAfter,
                current: current,
                generation: generation,
                publishState: publishState
            )
        }
    }

    private func classifyKnownRejection(
        code: MobileErrorCode?,
        status: Int,
        data: MobileErrorData?,
        retryAfter: MobileRetryAfter?,
        current: ScoringQueueRecord,
        generation: UInt,
        publishState: Bool
    ) async {
        switch code {
        case .participantNotFound:
            await markActionRequired(
                current,
                reason: .identity,
                errorCode: code,
                status: status,
                publishState: publishState,
                operationGeneration: generation
            )
            if transportLifecycleIsCurrent(generation, partition: current.partition) {
                accessInvalidationHandler?()
            }
        case .mobileAPIUnavailable, .scoringUnavailable:
            await makeRetryable(
                current,
                reason: .environment,
                errorCode: code,
                status: status,
                retryAfter: retryAfter,
                publishState: publishState,
                operationGeneration: generation
            )
            if transportLifecycleIsCurrent(generation, partition: current.partition),
               code == .mobileAPIUnavailable
            {
                authorityRevalidationHandler?()
            }
        case .matchNotFound:
            await markActionRequired(current, reason: .matchMissing, errorCode: code, status: status, publishState: publishState, operationGeneration: generation)
            if transportLifecycleIsCurrent(generation, partition: current.partition) { await refreshKnownRejectionContext(current.partition, generation: generation) }
        case .scoringNotAuthorized:
            await markActionRequired(current, reason: .authorization, errorCode: code, status: status, publishState: publishState, operationGeneration: generation)
            if transportLifecycleIsCurrent(generation, partition: current.partition) { await refreshKnownRejectionContext(current.partition, generation: generation) }
        case .scoringReadOnly:
            await markActionRequired(current, reason: .readOnly, errorCode: code, status: status, publishState: publishState, operationGeneration: generation)
            if transportLifecycleIsCurrent(generation, partition: current.partition) { await refreshKnownRejectionContext(current.partition, generation: generation) }
        case .invalidScoreInput:
            await quarantine(current, reason: .invalidRecordOrContract, code: code, status: status, publishState: publishState, operationGeneration: generation)
        case .revisionConflict:
            await persistRevisionConflict(current, data: data, status: status, publishState: publishState, operationGeneration: generation)
            guard transportLifecycleIsCurrent(generation, partition: current.partition) else { return }
            await reconcileRevisionConflict(recordId: current.localQueueRecordId)
        case .idempotencyConflict:
            await quarantine(current, reason: .idempotencyConflict, code: code, status: status, publishState: publishState, operationGeneration: generation)
            if transportLifecycleIsCurrent(generation, partition: current.partition) { _ = try? await canonicalRefresh(for: current.partition) }
        case .matchAlreadyFinalized:
            await markActionRequired(current, reason: .finalized, errorCode: code, status: status, publishState: publishState, operationGeneration: generation)
            if transportLifecycleIsCurrent(generation, partition: current.partition) { await refreshAndReconcileLifecycle(current.partition, generation: generation) }
        case .internalError:
            await makeRetryable(current, reason: .unknownOutcome, errorCode: code, status: status, retryAfter: retryAfter, publishState: publishState, operationGeneration: generation)
        case .unauthorized, .invalidToken:
            await markActionRequired(current, reason: .authentication, errorCode: code, status: status, publishState: publishState, operationGeneration: generation)
            if transportLifecycleIsCurrent(generation, partition: current.partition) { accessInvalidationHandler?() }
        case .none:
            // A rejected response with no typed code can only originate from
            // a compatible v1 envelope carrying a bounded future code. Bare,
            // malformed, and non-v1 responses remain unknown at transport.
            await quarantine(current, reason: .unknownPermanentResponse, code: nil, status: status, publishState: publishState, operationGeneration: generation)
        case .finalizationNotReady:
            await quarantine(current, reason: .unknownPermanentResponse, code: code, status: status, publishState: publishState, operationGeneration: generation)
        case .invalidAuthRequest, .authMethodUnavailable, .authCertificationFailed:
            await markActionRequired(current, reason: .authentication, errorCode: code, status: status, publishState: publishState, operationGeneration: generation)
            if transportLifecycleIsCurrent(generation, partition: current.partition) { accessInvalidationHandler?() }
        }
    }

    private func refreshAndReconcileLifecycle(
        _ partition: ScoringQueuePartition,
        generation operationGeneration: UInt
    ) async {
        guard operationGeneration == lifecycleGeneration,
              partition.identity == activeIdentity,
              !state.isSuspended
        else { return }
        do {
            let canonical = try await canonicalRefresh(for: partition)
            guard operationGeneration == lifecycleGeneration,
                  partition.identity == activeIdentity,
                  !state.isSuspended
            else { return }
            await reconcileLifecycle(
                canonical,
                partition: partition,
                generation: operationGeneration
            )
        } catch {
            guard operationGeneration == lifecycleGeneration,
                  partition.identity == activeIdentity,
                  !state.isSuspended
            else { return }
            // The known mutation rejection is already durable. A failed
            // follow-up read must leave that blocker in place, while an auth
            // or environment authority failure still invalidates the shell.
            handleFollowUpCanonicalAccessFailure(error)
        }
    }

    /// Mandatory canonical refresh after a known authority/lifecycle
    /// rejection. The rejection remains the durable Match admission blocker:
    /// a contradictory or later-writable projection cannot turn a rejected
    /// mutation into an acknowledgement or silently resume submission.
    private func refreshKnownRejectionContext(
        _ partition: ScoringQueuePartition,
        generation operationGeneration: UInt
    ) async {
        guard operationGeneration == lifecycleGeneration,
              partition.identity == activeIdentity,
              !state.isSuspended
        else { return }
        do {
            _ = try await canonicalRefresh(for: partition)
        } catch {
            guard operationGeneration == lifecycleGeneration,
                  partition.identity == activeIdentity,
                  !state.isSuspended
            else { return }
            handleFollowUpCanonicalAccessFailure(error)
        }
    }

    private func handleFollowUpCanonicalAccessFailure(_ error: any Error) {
        if error is MobileReadCredentialError {
            accessInvalidationHandler?()
            return
        }
        guard let apiError = error as? MobileAPIClientError else { return }
        switch apiError {
        case .missingBearer, .missingCertification:
            accessInvalidationHandler?()
        case .unexpectedStatus(let status) where status == 401:
            accessInvalidationHandler?()
        case .server(let code, _):
            switch code {
            case .unauthorized, .invalidToken, .participantNotFound,
                 .invalidAuthRequest, .authMethodUnavailable,
                 .authCertificationFailed:
                accessInvalidationHandler?()
            case .mobileAPIUnavailable:
                authorityRevalidationHandler?()
            default:
                break
            }
        default:
            break
        }
    }

    private func persistRevisionConflict(
        _ current: ScoringQueueRecord,
        data: MobileErrorData?,
        status: Int,
        publishState: Bool = true,
        operationGeneration: UInt? = nil
    ) async {
        var updated = current
        updated.state = .conflict
        updated.stateReasonCode = .revision
        updated.attempt.outcomeCertainty = .knownRejected
        updated.attempt.syncLeaseId = nil
        updated.attempt.syncLeaseStartedAt = nil
        updated.attempt.lastHttpStatus = status
        updated.attempt.lastErrorCode = MobileErrorCode.revisionConflict.rawValue
        updated.conflict = ScoringQueueConflict(
            officialGross: nil,
            currentMatchRevision: data?.currentMatchRevision,
            currentHoleRevision: data?.currentHoleRevision,
            currentPermissionRevision: data?.currentPermissionRevision,
            refreshRequired: true,
            recordedAt: now()
        )
        updated.updatedAt = now()
        do {
            _ = try await repository.replace(updated, expecting: current)
        } catch {
            failClosedAfterDurableTransitionFailure(
                publishState: publishState,
                operationGeneration: operationGeneration,
                partition: current.partition
            )
            return
        }
        if shouldPublish(
            publishState,
            operationGeneration: operationGeneration,
            partition: current.partition
        ) {
            await reloadActiveRecords()
        } else {
            await notifyCurrentLifecycleAfterStaleDurableTransition(
                partition: current.partition
            )
        }
    }

    private func persistPreflightRevisionConflict(
        _ current: ScoringQueueRecord,
        canonical: MobileScoringCurrent,
        generation: UInt
    ) async -> Bool {
        guard current.state == .queued else { return false }
        var updated = current
        updated.state = .conflict
        updated.stateReasonCode = .revision
        updated.attempt.nextRetryAt = nil
        updated.conflict = ScoringQueueConflict(
            officialGross: canonicalGross(in: canonical, holeNumber: current.intent.holeNumber),
            currentMatchRevision: canonical.match.matchRevision,
            currentHoleRevision: canonicalHoleRevision(
                in: canonical,
                holeNumber: current.intent.holeNumber
            ),
            currentPermissionRevision: canonical.match.permissionRevision,
            // Reconciliation owns the bounded, metadata-only safe rebase.
            refreshRequired: true,
            recordedAt: now()
        )
        updated.lastKnownServer = canonicalServerState(
            canonical,
            holeNumber: current.intent.holeNumber,
            refreshedAt: now()
        )
        updated.updatedAt = now()
        do {
            _ = try await repository.replace(updated, expecting: current)
        } catch {
            failClosedAfterDurableTransitionFailure(
                publishState: true,
                operationGeneration: generation,
                partition: current.partition
            )
            return false
        }
        guard transportLifecycleIsCurrent(generation, partition: current.partition) else {
            await notifyCurrentLifecycleAfterStaleDurableTransition(
                partition: current.partition
            )
            return false
        }
        await reloadActiveRecords()
        return true
    }

    private func reconcileRevisionConflict(
        recordId: String,
        canonical canonicalOverride: MobileScoringCurrent? = nil
    ) async {
        let reconciliationGeneration = lifecycleGeneration
        await reloadActiveRecords()
        guard reconciliationGeneration == lifecycleGeneration else { return }
        guard let current = state.records.first(where: { $0.localQueueRecordId == recordId }),
              current.state == .conflict
        else { return }
        do {
            let canonical: MobileScoringCurrent
            if let canonicalOverride {
                canonical = canonicalOverride
            } else {
                canonical = try await canonicalRefresh(for: current.partition)
            }
            guard reconciliationGeneration == lifecycleGeneration,
                  current.partition.identity == activeIdentity,
                  !state.isSuspended
            else { return }
            guard canonicalRevisionEvidenceDoesNotRegress(
                canonical,
                from: current
            ) else {
                throw ScoringQueueCoordinatorError.canonicalRefreshFailed
            }
            let official = canonicalGross(in: canonical, holeNumber: current.intent.holeNumber)
            let refreshedAt = nextConflictEvidenceTimestamp(after: current)
            var updated = current
            updated.conflict = ScoringQueueConflict(
                officialGross: official,
                currentMatchRevision: canonical.match.matchRevision,
                currentHoleRevision: canonicalHoleRevision(in: canonical, holeNumber: current.intent.holeNumber),
                currentPermissionRevision: canonical.match.permissionRevision,
                refreshRequired: false,
                recordedAt: refreshedAt
            )
            updated.lastKnownServer = canonicalServerState(
                canonical,
                holeNumber: current.intent.holeNumber,
                refreshedAt: refreshedAt
            )
            updated.attempt.nextRetryAt = nil
            refreshFailureCounts.removeValue(forKey: current.localQueueRecordId)

            // Gross arrays are meaningful only within the immutable snapshot's
            // side/slot ordering. Equal numbers from a replacement snapshot can
            // belong to different golfers, so snapshot identity must be proven
            // before canonical equivalence may resolve local intent.
            if canonical.snapshot.snapshotId != current.base.snapshotId ||
                canonical.snapshot.revision != current.base.snapshotRevision
            {
                updated.state = .actionRequired
                updated.stateReasonCode = .identityMismatch
            } else if official == current.intent.gross {
                updated.state = .resolved
                updated.stateReasonCode = nil
                // The durable resolution receipt is now the terminal audit
                // artifact. Accepted proof and comparison metadata are review
                // state and cannot remain attached to a resolved queue row.
                updated.acknowledgement = nil
                updated.conflict = nil
                updated.resolution = ScoringQueueResolution(
                    reason: .officialEquivalent,
                    resolvedAt: refreshedAt,
                    relatedLocalQueueRecordId: nil
                )
            } else if canonical.match.status == .completed {
                // Finalized elsewhere with a differing official value remains
                // a reviewable comparison. Keep Official is still meaningful;
                // Reapply is independently prohibited by canonical lifecycle.
                updated.state = .conflict
                updated.stateReasonCode = .revision
            } else if canonical.permission.readOnly || !canonical.permission.canScore {
                updated.state = .actionRequired
                updated.stateReasonCode = canonical.permission.readOnly ? .readOnly : .authorization
            } else if !current.hasAcceptedAcknowledgementProof,
                      canonicalTargetIsUnchanged(for: current, canonical: canonical),
                      ScoringQueueRevisionPolicy.mayAttemptAnotherAutomaticRebase(
                          currentCount: current.base.automaticRebaseCount
                      )
            {
                _ = try await repository.applyDeterministicSafeRebase(
                    recordId: current.localQueueRecordId,
                    canonical: canonical,
                    at: now()
                )
                await reloadActiveRecords()
                return
            } else if !current.hasAcceptedAcknowledgementProof,
                      canonicalTargetIsUnchanged(for: current, canonical: canonical),
                      !ScoringQueueRevisionPolicy.mayAttemptAnotherAutomaticRebase(
                          currentCount: current.base.automaticRebaseCount
                      )
            {
                updated.state = .actionRequired
                updated.stateReasonCode = .rebaseLimit
            }
            updated.updatedAt = refreshedAt
            let persisted = try await repository.replace(updated, expecting: current)
            if persisted.state == .resolved {
                await makeReceiptIfSupported(recordId: persisted.localQueueRecordId, retention: 7 * 24 * 60 * 60)
            }
            await reloadActiveRecords()
        } catch {
            guard reconciliationGeneration == lifecycleGeneration,
                  current.partition.identity == activeIdentity,
                  !state.isSuspended
            else { return }
            // Conflict remains durable. Only canonical refresh is retried.
            await reloadActiveRecords()
            if let latest = state.records.first(where: { $0.localQueueRecordId == recordId }),
               latest.state == .conflict,
               latest.conflict?.refreshRequired == true
            {
                await scheduleRefreshOnlyRetry(
                    latest,
                    generation: reconciliationGeneration
                )
            }
        }
    }

    private func nextConflictEvidenceTimestamp(after current: ScoringQueueRecord) -> Date {
        let prior = max(
            current.updatedAt,
            max(
                current.lastKnownServer.refreshedAt,
                current.conflict?.recordedAt ?? .distantPast
            )
        )
        let candidate = now()
        return candidate > prior ? candidate : prior.addingTimeInterval(0.000_001)
    }

    private func scheduleRefreshOnlyRetry(
        _ current: ScoringQueueRecord,
        generation operationGeneration: UInt? = nil
    ) async {
        guard (current.state == .acknowledged && current.acknowledgement?.refreshPending == true) ||
                (current.state == .conflict && current.conflict?.refreshRequired == true)
        else { return }
        if let operationGeneration {
            guard canonicalLifecycleIsCurrent(
                operationGeneration,
                partition: current.partition
            ) else { return }
        } else {
            guard current.partition.identity == activeIdentity,
                  applicationActivity.mutationTransportAuthorization != nil,
                  !state.isSuspended,
                  !signOutAdmissionPaused,
                  finalizationGateID == nil
            else { return }
        }

        let failureCount = (refreshFailureCounts[current.localQueueRecordId] ?? 0) + 1
        refreshFailureCounts[current.localQueueRecordId] = failureCount
        var updated = current
        updated.attempt.nextRetryAt = ScoringQueueRetryPolicy(
            jitterFraction: { [jitter] _ in jitter() }
        ).nextRetryAt(afterFailure: failureCount, now: now())
        updated.updatedAt = now()
        do {
            _ = try await repository.replace(updated, expecting: current)
        } catch {
            failClosedAfterDurableTransitionFailure(
                publishState: true,
                operationGeneration: operationGeneration,
                partition: current.partition
            )
            return
        }
        if operationGeneration.map({
            canonicalLifecycleIsCurrent($0, partition: current.partition)
        }) ?? canonicalLifecycleIsCurrent(lifecycleGeneration, partition: current.partition) {
            await reloadActiveRecords()
        } else {
            await notifyCurrentLifecycleAfterStaleDurableTransition(
                partition: current.partition
            )
        }
    }

    private func scheduleCanonicalPreflightRetry(
        _ current: ScoringQueueRecord,
        reason: ScoringQueueStateReasonCode,
        code: MobileErrorCode?,
        status: Int?,
        marksOffline: Bool,
        generation operationGeneration: UInt
    ) async {
        guard current.state == .queued || current.state == .retryable else {
            if (current.state == .acknowledged && current.acknowledgement?.refreshPending == true) ||
                (current.state == .conflict && current.conflict?.refreshRequired == true)
            {
                await scheduleRefreshOnlyRetry(
                    current,
                    generation: operationGeneration
                )
            }
            return
        }
        let failureKey = "preflight:\(current.localQueueRecordId)"
        let failureCount = (refreshFailureCounts[failureKey] ?? 0) + 1
        refreshFailureCounts[failureKey] = failureCount
        var updated = current
        // A never-transmitted queued intent remains queued: its persisted
        // nextRetryAt is the durable preflight retry marker. The immutable
        // retry schedule transition intentionally does not rewrite transport
        // diagnostics because no mutation request was attempted.
        updated.attempt.nextRetryAt = ScoringQueueRetryPolicy(
            jitterFraction: { [jitter] _ in jitter() }
        ).nextRetryAt(afterFailure: failureCount, now: now())
        updated.updatedAt = now()
        do {
            _ = try await repository.replace(updated, expecting: current)
        } catch {
            failClosedAfterDurableTransitionFailure(
                publishState: true,
                operationGeneration: operationGeneration,
                partition: current.partition
            )
            return
        }
        if canonicalLifecycleIsCurrent(
            operationGeneration,
            partition: current.partition
        ) {
            state.isOffline = marksOffline
            await reloadActiveRecords()
        } else {
            await notifyCurrentLifecycleAfterStaleDurableTransition(
                partition: current.partition
            )
        }
    }

    private func makeRetryable(
        _ current: ScoringQueueRecord,
        reason: ScoringQueueStateReasonCode,
        errorCode: MobileErrorCode?,
        status: Int?,
        retryAfter: MobileRetryAfter?,
        publishState: Bool = true,
        operationGeneration: UInt? = nil
    ) async {
        var updated = current
        updated.state = .retryable
        updated.stateReasonCode = reason
        updated.attempt.everSubmitted = current.attempt.everSubmitted || current.state == .syncing
        updated.attempt.outcomeCertainty = updated.attempt.everSubmitted ? .unknown : .notSent
        updated.attempt.syncLeaseId = nil
        updated.attempt.syncLeaseStartedAt = nil
        updated.attempt.lastHttpStatus = status
        updated.attempt.lastErrorCode = errorCode?.rawValue
        let delay = retryDelay(
            attemptCount: max(updated.attempt.count, 1),
            retryAfter: retryAfter,
            at: now()
        )
        updated.attempt.nextRetryAt = now().addingTimeInterval(delay)
        updated.updatedAt = now()
        do {
            _ = try await repository.replace(updated, expecting: current)
        } catch {
            failClosedAfterDurableTransitionFailure(
                publishState: publishState,
                operationGeneration: operationGeneration,
                partition: current.partition
            )
            return
        }
        if shouldPublish(
            publishState,
            operationGeneration: operationGeneration,
            partition: current.partition
        ) {
            foregroundTransientFailureCount += 1
            state.isOffline = status == nil
            await reloadActiveRecords()
        } else {
            await notifyCurrentLifecycleAfterStaleDurableTransition(
                partition: current.partition
            )
        }
    }

    private func markActionRequired(
        _ current: ScoringQueueRecord,
        reason: ScoringQueueStateReasonCode,
        errorCode: MobileErrorCode? = nil,
        status: Int? = nil,
        publishState: Bool = true,
        operationGeneration: UInt? = nil
    ) async {
        var updated = current
        updated.state = .actionRequired
        updated.stateReasonCode = reason
        updated.attempt.syncLeaseId = nil
        updated.attempt.syncLeaseStartedAt = nil
        updated.attempt.nextRetryAt = nil
        updated.attempt.lastErrorCode = errorCode?.rawValue
        updated.attempt.lastHttpStatus = status
        updated.updatedAt = now()
        do {
            _ = try await repository.replace(updated, expecting: current)
        } catch {
            failClosedAfterDurableTransitionFailure(
                publishState: publishState,
                operationGeneration: operationGeneration,
                partition: current.partition
            )
            return
        }
        if shouldPublish(
            publishState,
            operationGeneration: operationGeneration,
            partition: current.partition
        ) {
            await reloadActiveRecords()
        } else {
            await notifyCurrentLifecycleAfterStaleDurableTransition(
                partition: current.partition
            )
        }
    }

    private func quarantine(
        _ current: ScoringQueueRecord,
        reason: ScoringQueueQuarantineReason,
        code: MobileErrorCode?,
        status: Int?,
        publishState: Bool = true,
        operationGeneration: UInt? = nil
    ) async {
        var updated = current
        updated.state = .quarantined
        updated.stateReasonCode = quarantineStateReason(reason)
        updated.quarantineReason = reason
        updated.attempt.syncLeaseId = nil
        updated.attempt.syncLeaseStartedAt = nil
        updated.attempt.nextRetryAt = nil
        updated.attempt.lastErrorCode = code?.rawValue
        updated.attempt.lastHttpStatus = status
        updated.updatedAt = now()
        do {
            _ = try await repository.replace(updated, expecting: current)
        } catch {
            failClosedAfterDurableTransitionFailure(
                publishState: publishState,
                operationGeneration: operationGeneration,
                partition: current.partition
            )
            return
        }
        if shouldPublish(
            publishState,
            operationGeneration: operationGeneration,
            partition: current.partition
        ) {
            await reloadActiveRecords()
        } else {
            await notifyCurrentLifecycleAfterStaleDurableTransition(
                partition: current.partition
            )
        }
    }

    private func applyStaleGuard(to current: ScoringQueueRecord) async -> Bool {
        let age = now().timeIntervalSince(current.createdAt)
        if age >= 7 * 24 * 60 * 60 {
            await quarantine(current, reason: .staleIdempotencyUncertain, code: nil, status: nil)
            return false
        }
        if age >= 24 * 60 * 60 {
            await markActionRequired(current, reason: .stale)
            return false
        }
        return true
    }

    private func applyStalePolicyAndReload(
        expectedGeneration: UInt? = nil,
        expectedIdentity: ScoringQueueIdentityPartition? = nil
    ) async throws {
        let policyGeneration = expectedGeneration ?? lifecycleGeneration
        guard let identity = expectedIdentity ?? activeIdentity,
              policyGeneration == lifecycleGeneration,
              identity == activeIdentity
        else { return }
        let records = try await repository.records(for: identity)
        guard policyGeneration == lifecycleGeneration,
              identity == activeIdentity
        else { return }
        for current in records where current.isUnresolved {
            guard policyGeneration == lifecycleGeneration,
                  identity == activeIdentity
            else { return }
            let age = now().timeIntervalSince(current.createdAt)
            // A known server acceptance waiting on its mandatory refresh is
            // refresh-only evidence, not an unsubmitted stale mutation. Keep
            // the acknowledgement intact at every age; never resubmit or
            // rewrite it into a state whose metadata cannot preserve the ACK.
            if current.attempt.outcomeCertainty == .knownAccepted,
               current.acknowledgement?.accepted == true
            {
                continue
            }
            if age >= 7 * 24 * 60 * 60, current.state != .quarantined {
                await quarantine(current, reason: .staleIdempotencyUncertain, code: nil, status: nil)
            } else if age >= 24 * 60 * 60,
                      current.state != .actionRequired,
                      current.state != .quarantined
            {
                await markActionRequired(current, reason: .stale)
            }
        }
        guard policyGeneration == lifecycleGeneration,
              identity == activeIdentity
        else { return }
        await reloadActiveRecords()
    }

    @discardableResult
    private func refreshUnresolvedMatchesBeforeReplay() async -> Bool {
        guard let identity = activeIdentity,
              applicationActivity.mutationTransportAuthorization != nil,
              !state.isSuspended
        else { return false }
        let operationGeneration = lifecycleGeneration
        var allSucceeded = true
        let partitions = Set(state.records.filter(\.isUnresolved).map(\.partition))
        for partition in partitions.sorted(by: { $0.matchId < $1.matchId }) {
            let refreshGeneration = lifecycleGeneration
            guard refreshGeneration == operationGeneration,
                  activeIdentity == identity,
                  applicationActivity.mutationTransportAuthorization != nil,
                  !state.isSuspended
            else { return false }
            let records: [ScoringQueueRecord]
            do {
                records = try await repository.records(in: partition)
            } catch {
                state.lastPersistenceFailure = true
                allSucceeded = false
                continue
            }
            guard let oldest = records.filter(\.isUnresolved).min(by: { $0.sequence < $1.sequence })
            else { continue }
            do {
                let canonical = try await canonicalRefresh(for: partition)
                partitionsRequiringCanonicalRefresh.remove(partition)

                if oldest.state == .acknowledged,
                   let acknowledgement = oldest.acknowledgement,
                   acknowledgement.refreshPending
                {
                    do {
                        try await applyAcknowledgementRefresh(
                            oldest,
                            acknowledgement: acknowledgement,
                            canonical: canonical,
                            generation: refreshGeneration
                        )
                    } catch {
                        await scheduleRefreshOnlyRetry(
                            oldest,
                            generation: refreshGeneration
                        )
                    }
                } else if oldest.state == .conflict,
                          oldest.conflict?.refreshRequired == true
                {
                    await reconcileRevisionConflict(
                        recordId: oldest.localQueueRecordId,
                        canonical: canonical
                    )
                } else if !requiresSameIDRecovery(oldest) {
                    await reconcileLifecycle(
                        canonical,
                        partition: partition,
                        generation: refreshGeneration
                    )
                }
                // For an outcome-unknown request, refresh verifies immutable
                // identity and Match context but cannot replace the same-ID
                // acknowledgement proof. The worker must replay it.
            } catch {
                guard refreshGeneration == lifecycleGeneration,
                      partition.identity == activeIdentity,
                      applicationActivity.mutationTransportAuthorization != nil,
                      !state.isSuspended
                else { return false }
                allSucceeded = false
                await handleCanonicalPreflightFailure(
                    error,
                    for: oldest,
                    generation: refreshGeneration
                )
            }
        }
        return allSucceeded &&
            operationGeneration == lifecycleGeneration &&
            activeIdentity == identity &&
            applicationActivity.mutationTransportAuthorization != nil &&
            !state.isSuspended
    }

    private func canonicalRefresh(for partition: ScoringQueuePartition) async throws -> MobileScoringCurrent {
        let refreshGeneration = lifecycleGeneration
        guard partition.identity == activeIdentity,
              let authorization = applicationActivity.mutationTransportAuthorization,
              !state.isSuspended
        else {
            throw ScoringQueueCoordinatorError.identityMismatch
        }
        let credentials = try await credentialProvider.credentials(
            expectedAuthUserID: partition.authUserId
        )
        guard credentials.authUserID == partition.authUserId else {
            throw MobileReadCredentialError.authIdentityChanged
        }
        guard refreshGeneration == lifecycleGeneration,
              partition.identity == activeIdentity,
              applicationActivity.permits(authorization),
              !state.isSuspended
        else { throw ScoringQueueCoordinatorError.inactiveIdentity }
        let response = try await api.scoringCurrent(
            accessToken: credentials.accessToken,
            certification: credentials.certification,
            matchID: partition.matchId
        )
        guard refreshGeneration == lifecycleGeneration,
              partition.identity == activeIdentity,
              applicationActivity.permits(authorization),
              !state.isSuspended
        else { throw ScoringQueueCoordinatorError.inactiveIdentity }
        guard response.isContractCompatible,
              let canonical = response.data.scoring,
              canonical.match.matchId == partition.matchId,
              canonical.player.playerId == partition.playerId
        else { throw ScoringQueueCoordinatorError.invalidCanonicalContext }
        state.isOffline = false
        canonicalUpdateHandler?(response)
        return canonical
    }

    /// Classifies a failed canonical scoring read before any mutation lease is
    /// acquired. Permanent authority or contract failures stop the Match
    /// immediately; only transient failures receive a durable retry time. This
    /// helper must never call `scoringHole`.
    private func handleCanonicalPreflightFailure(
        _ error: any Error,
        for current: ScoringQueueRecord,
        generation operationGeneration: UInt
    ) async {
        if error is CancellationError { return }

        if let credentialError = error as? MobileReadCredentialError {
            let reason: ScoringQueueStateReasonCode = credentialError == .authIdentityChanged
                ? .identityChanged
                : .authentication
            await stopCanonicalPreflightForAccessFailure(
                current,
                reason: reason,
                generation: operationGeneration
            )
            return
        }

        if let coordinatorError = error as? ScoringQueueCoordinatorError {
            switch coordinatorError {
            case .identityMismatch, .inactiveIdentity:
                await stopCanonicalPreflightForAccessFailure(
                    current,
                    reason: .identityMismatch,
                    generation: operationGeneration
                )
            case .invalidCanonicalContext, .canonicalRefreshFailed:
                await quarantineCanonicalPreflight(
                    current,
                    reason: .invalidRecordOrContract,
                    generation: operationGeneration
                )
            case .notEligibleForRetry, .notReviewable, .liveMutationDisabled,
                 .finalizationQueueNotReady, .invalidFinalizationGuard,
                 .matchRequiresReview:
                await quarantineCanonicalPreflight(
                    current,
                    reason: .invalidRecordOrContract,
                    generation: operationGeneration
                )
            }
            return
        }

        if error is MobileContractError || error is DecodingError {
            await quarantineCanonicalPreflight(
                current,
                reason: .invalidRecordOrContract,
                generation: operationGeneration
            )
            return
        }

        guard let apiError = error as? MobileAPIClientError else {
            await quarantineCanonicalPreflight(
                current,
                reason: .invalidRecordOrContract,
                generation: operationGeneration
            )
            return
        }

        switch apiError {
        case .missingBearer, .missingCertification:
            await stopCanonicalPreflightForAccessFailure(
                current,
                reason: .authentication,
                generation: operationGeneration
            )
        case .transportUnavailable, .invalidHTTPResponse:
            await scheduleCanonicalPreflightRetry(
                current,
                reason: .environment,
                code: nil,
                status: nil,
                marksOffline: true,
                generation: operationGeneration
            )
        case .invalidURL:
            await quarantineCanonicalPreflight(
                current,
                reason: .invalidRecordOrContract,
                generation: operationGeneration
            )
        case .unexpectedStatus(let status):
            if status == 401 {
                await stopCanonicalPreflightForAccessFailure(
                    current,
                    reason: .authentication,
                    status: status,
                    generation: operationGeneration
                )
            } else if status == 429 || status >= 500 {
                await scheduleCanonicalPreflightRetry(
                    current,
                    reason: .environment,
                    code: nil,
                    status: status,
                    marksOffline: false,
                    generation: operationGeneration
                )
            } else {
                await quarantineCanonicalPreflight(
                    current,
                    reason: .unknownPermanentResponse,
                    status: status,
                    generation: operationGeneration
                )
            }
        case .server(let code, let status):
            switch code {
            case .unauthorized, .invalidToken:
                await stopCanonicalPreflightForAccessFailure(
                    current,
                    reason: .authentication,
                    code: code,
                    status: status,
                    generation: operationGeneration
                )
            case .participantNotFound:
                await stopCanonicalPreflightForAccessFailure(
                    current,
                    reason: .identity,
                    code: code,
                    status: status,
                    generation: operationGeneration
                )
            case .invalidAuthRequest, .authMethodUnavailable, .authCertificationFailed:
                await stopCanonicalPreflightForAccessFailure(
                    current,
                    reason: .authentication,
                    code: code,
                    status: status,
                    generation: operationGeneration
                )
            case .matchNotFound:
                await markActionRequired(
                    current,
                    reason: .matchMissing,
                    errorCode: code,
                    status: status,
                    publishState: canonicalLifecycleIsCurrent(
                        operationGeneration,
                        partition: current.partition
                    ),
                    operationGeneration: operationGeneration
                )
            case .scoringNotAuthorized:
                await markActionRequired(
                    current,
                    reason: .authorization,
                    errorCode: code,
                    status: status,
                    publishState: canonicalLifecycleIsCurrent(
                        operationGeneration,
                        partition: current.partition
                    ),
                    operationGeneration: operationGeneration
                )
            case .scoringReadOnly, .matchAlreadyFinalized:
                await markActionRequired(
                    current,
                    reason: code == .scoringReadOnly ? .readOnly : .finalized,
                    errorCode: code,
                    status: status,
                    publishState: canonicalLifecycleIsCurrent(
                        operationGeneration,
                        partition: current.partition
                    ),
                    operationGeneration: operationGeneration
                )
            case .mobileAPIUnavailable, .scoringUnavailable, .internalError:
                await scheduleCanonicalPreflightRetry(
                    current,
                    reason: .environment,
                    code: code,
                    status: status,
                    marksOffline: false,
                    generation: operationGeneration
                )
                if code == .mobileAPIUnavailable,
                   canonicalLifecycleIsCurrent(
                    operationGeneration,
                    partition: current.partition
                   ) {
                    authorityRevalidationHandler?()
                }
            case .invalidScoreInput, .revisionConflict, .idempotencyConflict,
                 .finalizationNotReady:
                // These mutation/finalization codes are structurally invalid
                // on the read-only scoring-current preflight boundary.
                await quarantineCanonicalPreflight(
                    current,
                    reason: .unknownPermanentResponse,
                    code: code,
                    status: status,
                    generation: operationGeneration
                )
            }
        }
    }

    private func stopCanonicalPreflightForAccessFailure(
        _ current: ScoringQueueRecord,
        reason: ScoringQueueStateReasonCode,
        code: MobileErrorCode? = nil,
        status: Int? = nil,
        generation operationGeneration: UInt
    ) async {
        // An accepted record is never converted back into submit-eligible
        // state. Preserve its acknowledgement and refresh-only obligation; the
        // app-level invalidation handler hides participant access immediately.
        if current.state == .acknowledged {
            await scheduleRefreshOnlyRetry(
                current,
                generation: operationGeneration
            )
        } else {
            await markActionRequired(
                current,
                reason: reason,
                errorCode: code,
                status: status,
                publishState: canonicalLifecycleIsCurrent(
                    operationGeneration,
                    partition: current.partition
                ),
                operationGeneration: operationGeneration
            )
        }
        if canonicalLifecycleIsCurrent(
            operationGeneration,
            partition: current.partition
        ) {
            accessInvalidationHandler?()
        }
    }

    private func quarantineCanonicalPreflight(
        _ current: ScoringQueueRecord,
        reason: ScoringQueueQuarantineReason,
        code: MobileErrorCode? = nil,
        status: Int? = nil,
        generation operationGeneration: UInt
    ) async {
        // An accepted response awaiting canonical confirmation cannot be
        // rewritten as a new queue state without losing its acceptance proof.
        // Keep it refresh-only and fail the queue health gate instead.
        if current.state == .acknowledged {
            await scheduleRefreshOnlyRetry(
                current,
                generation: operationGeneration
            )
            failClosedAfterDurableTransitionFailure(
                publishState: true,
                operationGeneration: operationGeneration,
                partition: current.partition
            )
        } else {
            await quarantine(
                current,
                reason: reason,
                code: code,
                status: status,
                publishState: canonicalLifecycleIsCurrent(
                    operationGeneration,
                    partition: current.partition
                ),
                operationGeneration: operationGeneration
            )
        }
    }

    private func reconcileLifecycle(
        _ canonical: MobileScoringCurrent,
        partition: ScoringQueuePartition,
        generation reconciliationGeneration: UInt
    ) async {
        guard canonicalLifecycleIsCurrent(
            reconciliationGeneration,
            partition: partition
        ) else { return }
        let records: [ScoringQueueRecord]
        do {
            records = try await repository.records(in: partition)
        } catch {
            failClosedAfterDurableTransitionFailure(
                publishState: true,
                operationGeneration: reconciliationGeneration,
                partition: partition
            )
            return
        }
        guard canonicalLifecycleIsCurrent(
            reconciliationGeneration,
            partition: partition
        ),
              let current = records
                .filter(\.isUnresolved)
                .min(by: { $0.sequence < $1.sequence })
        else { return }

        // Lifecycle reconciliation obeys the same strict Match ordering as
        // transport replay. A later canonical-equivalent correction must not
        // resolve while an earlier uncertain intent still blocks the Match;
        // otherwise the older intent could subsequently overwrite it.
        // Accepted records have their own refresh-only cleanup path, and a
        // quarantined consistency fault always requires explicit review.
        if current.state == .acknowledged || current.state == .quarantined {
            return
        }
        let official = canonicalGross(in: canonical, holeNumber: current.intent.holeNumber)
        // Never compare positional gross arrays across snapshots. A snapshot
        // change can remap a slot to another participant even when the numeric
        // values happen to match exactly.
        if canonical.snapshot.snapshotId != current.base.snapshotId ||
            canonical.snapshot.revision != current.base.snapshotRevision
        {
            // Repeated foreground refreshes must not rewrite an already
            // durable action-required record. Its accepted acknowledgement (if
            // present) remains the proof that automatic replay is forbidden.
            if current.state != .actionRequired {
                await markActionRequired(
                    current,
                    reason: .identityMismatch,
                    publishState: true,
                    operationGeneration: reconciliationGeneration
                )
            }
        } else if official == current.intent.gross {
            var updated = current
            updated.state = .resolved
            updated.stateReasonCode = nil
            updated.acknowledgement = nil
            updated.conflict = nil
            updated.resolution = ScoringQueueResolution(
                reason: .officialEquivalent,
                resolvedAt: now(),
                relatedLocalQueueRecordId: nil
            )
            updated.lastKnownServer = canonicalServerState(
                canonical,
                holeNumber: current.intent.holeNumber,
                refreshedAt: now()
            )
            updated.updatedAt = now()
            do {
                _ = try await repository.replace(updated, expecting: current)
                await makeReceiptIfSupported(
                    recordId: updated.localQueueRecordId,
                    retention: 7 * 24 * 60 * 60
                )
            } catch {
                failClosedAfterDurableTransitionFailure(
                    publishState: true,
                    operationGeneration: reconciliationGeneration,
                    partition: partition
                )
                return
            }
        } else if canonical.match.status == .completed {
            var updated = current
            updated.state = .conflict
            updated.stateReasonCode = .revision
            updated.attempt.nextRetryAt = nil
            updated.conflict = ScoringQueueConflict(
                officialGross: official,
                currentMatchRevision: canonical.match.matchRevision,
                currentHoleRevision: canonicalHoleRevision(
                    in: canonical,
                    holeNumber: current.intent.holeNumber
                ),
                currentPermissionRevision: canonical.match.permissionRevision,
                refreshRequired: false,
                recordedAt: now()
            )
            updated.lastKnownServer = canonicalServerState(
                canonical,
                holeNumber: current.intent.holeNumber,
                refreshedAt: now()
            )
            updated.updatedAt = now()
            do {
                _ = try await repository.replace(updated, expecting: current)
            } catch {
                failClosedAfterDurableTransitionFailure(
                    publishState: true,
                    operationGeneration: reconciliationGeneration,
                    partition: partition
                )
                return
            }
        } else if canonical.permission.readOnly || !canonical.permission.canScore {
            if current.state != .actionRequired {
                await markActionRequired(
                    current,
                    reason: canonical.permission.readOnly ? .readOnly : .authorization,
                    publishState: true,
                    operationGeneration: reconciliationGeneration
                )
            }
        } else if current.state == .actionRequired,
                  isRevalidatableActionRequiredReason(current.stateReasonCode)
        {
            var updated = current
            updated.attempt.nextRetryAt = nil
            // Re-enter automatic replay only through the audited conflict
            // reconciliation path. Generic actionRequired -> queued writes
            // could otherwise rewrite revision preconditions without the
            // bounded safe-rebase proof.
            updated.state = .conflict
            updated.stateReasonCode = .revision
            updated.conflict = ScoringQueueConflict(
                officialGross: nil,
                currentMatchRevision: canonical.match.matchRevision,
                currentHoleRevision: canonicalHoleRevision(
                    in: canonical,
                    holeNumber: current.intent.holeNumber
                ),
                currentPermissionRevision: canonical.match.permissionRevision,
                refreshRequired: true,
                recordedAt: now()
            )
            updated.updatedAt = now()
            do {
                _ = try await repository.replace(updated, expecting: current)
                await reconcileRevisionConflict(
                    recordId: current.localQueueRecordId,
                    canonical: canonical
                )
            } catch {
                failClosedAfterDurableTransitionFailure(
                    publishState: true,
                    operationGeneration: reconciliationGeneration,
                    partition: partition
                )
                return
            }
        }
        if canonicalLifecycleIsCurrent(
            reconciliationGeneration,
            partition: partition
        ), !state.lastPersistenceFailure {
            await reloadActiveRecords()
        }
    }

    private func requiresSameIDRecovery(_ record: ScoringQueueRecord) -> Bool {
        record.attempt.everSubmitted &&
            record.attempt.outcomeCertainty == .unknown &&
            (record.state == .queued || record.state == .retryable)
    }

    private func transportLifecycleIsCurrent(
        _ operationGeneration: UInt,
        partition: ScoringQueuePartition
    ) -> Bool {
        operationGeneration == lifecycleGeneration &&
            partition.identity == activeIdentity &&
            !state.isSuspended &&
            !isAdmissionPaused
    }

    /// Canonical foreground reconciliation intentionally runs while the replay
    /// barrier is armed. It may update durable review/retry state, but it can
    /// never authorize a POST or bypass sign-out/finalization ownership.
    private func canonicalLifecycleIsCurrent(
        _ operationGeneration: UInt,
        partition: ScoringQueuePartition
    ) -> Bool {
        operationGeneration == lifecycleGeneration &&
            partition.identity == activeIdentity &&
            applicationActivity.mutationTransportAuthorization != nil &&
            !state.isSuspended &&
            !signOutAdmissionPaused &&
            finalizationGateID == nil
    }

    private func shouldPublish(
        _ requested: Bool,
        operationGeneration: UInt?,
        partition: ScoringQueuePartition
    ) -> Bool {
        guard requested else { return false }
        guard let operationGeneration else {
            return partition.identity == activeIdentity &&
                !state.isSuspended &&
                !isAdmissionPaused
        }
        return transportLifecycleIsCurrent(operationGeneration, partition: partition)
    }

    private func failClosedAfterDurableTransitionFailure(
        publishState _: Bool,
        operationGeneration _: UInt?,
        partition: ScoringQueuePartition
    ) {
        // A stale operation is forbidden from affecting a replacement
        // identity, but a failed authoritative write still compromises the
        // same identity after suspend/resume. Keep that current identity
        // fail-closed even when the operation began in an older generation.
        guard partition.identity == activeIdentity else { return }
        stickyReliabilityFailureIdentity = partition.identity
        state.lastPersistenceFailure = true
        // Stop every task in this identity's current lifecycle. The sticky
        // reliability latch keeps worker-tail reloads and future replay from
        // clearing the failure, while authority/auth callbacks for the known
        // server outcome may still fail the surrounding app shell closed.
        cancelSchedulingAndWorkers()
    }

    /// An obsolete same-identity worker may finish a required durable state
    /// transition after environment re-attestation has already resumed. The
    /// old worker may not publish its own generation, but the current
    /// lifecycle must reload that durable row and resume eligible work.
    private func notifyCurrentLifecycleAfterStaleDurableTransition(
        partition: ScoringQueuePartition
    ) async {
        guard partition.identity == activeIdentity,
              !state.isSuspended,
              !isAdmissionPaused,
              !state.lastPersistenceFailure
        else { return }
        let currentGeneration = lifecycleGeneration
        await reloadActiveRecords()
        guard transportLifecycleIsCurrent(
            currentGeneration,
            partition: partition
        ), !state.lastPersistenceFailure else { return }
        wakeReplay()
    }

    private func isRevalidatableActionRequiredReason(
        _ reason: ScoringQueueStateReasonCode?
    ) -> Bool {
        switch reason {
        case .authentication, .identity, .identityChanged, .identityMismatch,
             .matchMissing, .authorization, .readOnly:
            true
        case .authRefresh, .environment, .unknownOutcome, .staleTournament,
             .stale, .revision, .invalidRecordOrContract, .idempotencyConflict,
             .unknownPermanentResponse, .staleIdempotencyUncertain,
             .rebaseLimit, .queueHealth, .finalized, nil:
            false
        }
    }

    private func reloadActiveRecords() async {
        let reloadGeneration = lifecycleGeneration
        guard let identity = activeIdentity else {
            state.records = []
            state.hasHiddenQuarantinedRecords = false
            state.agedPendingRecordIDs = []
            state.supportMetadataByRecordID = [:]
            return
        }
        do {
            let records = try await repository.records(for: identity)
                .sorted {
                    $0.partition.matchId == $1.partition.matchId
                        ? $0.sequence < $1.sequence
                        : $0.partition.matchId < $1.partition.matchId
                }
            let durableUnresolvedCount = try await repository.unresolvedCount(for: identity)
            guard reloadGeneration == lifecycleGeneration,
                  activeIdentity == identity
            else { return }
            state.records = records
            capabilityScopeBlocked = mutationAuthorization.allowsTransport &&
                !mutationAuthorization.permitsActiveRecords(records.filter(\.isUnresolved))
            state.hasHiddenQuarantinedRecords = durableUnresolvedCount > records.filter(\.isUnresolved).count
            let assessments = records
                .filter(\.isUnresolved)
                .map { record in
                    (record.localQueueRecordId, ScoringQueueStalePolicy.assess(
                        createdAt: record.createdAt,
                        now: now()
                    ))
                }
            state.agedPendingRecordIDs = Set(assessments.compactMap { recordID, assessment in
                assessment.disposition == .agedPending ? recordID : nil
            })
            state.supportMetadataByRecordID = Dictionary(uniqueKeysWithValues: assessments.compactMap {
                recordID, assessment in
                assessment.supportMetadata == .none
                    ? nil
                    : (recordID, assessment.supportMetadata)
            })
            state.lastPersistenceFailure = stickyReliabilityFailureIdentity == identity
        } catch {
            guard reloadGeneration == lifecycleGeneration,
                  activeIdentity == identity
            else { return }
            // Preserve the last known in-memory view, but fail closed. Clearing
            // it here could falsely present an unresolved durable score as
            // Official and could bypass the sign-out warning.
            state.lastPersistenceFailure = true
        }
    }

    private func hasSaveAdmissionInFlight(
        for identity: ScoringQueueIdentityPartition
    ) -> Bool {
        saveAdmissionsInFlight.contains { partition, count in
            partition.identity == identity && count > 0
        }
    }

    private func makeReceiptIfSupported(recordId: String, retention: TimeInterval) async {
        guard let receiptRepository = repository as? any ScoringQueueReceiptRepository else { return }
        _ = try? await receiptRepository.convertToReceipt(
            recordId: recordId,
            at: now(),
            retention: retention
        )
        _ = try? await receiptRepository.pruneExpiredReceipts(at: now())
    }

    private func compactReceiptEligibleRecords() async {
        guard repository is any ScoringQueueReceiptRepository else { return }
        let eligible = state.records.filter(\.isReceiptEligible)
        for record in eligible {
            guard let retention = ScoringQueueReceiptPolicy.retention(for: record) else { continue }
            await makeReceiptIfSupported(
                recordId: record.localQueueRecordId,
                retention: retention
            )
        }
        await reloadActiveRecords()
    }

    private func scheduleNextRetryWakeIfNeeded(resetForegroundPauseOnWake: Bool = false) {
        retryWakeTask?.cancel()
        retryWakeTask = nil
        let next = state.records
            .filter {
                $0.state == .retryable ||
                    ($0.state == .queued && $0.attempt.nextRetryAt != nil) ||
                    ($0.state == .acknowledged && $0.acknowledgement?.refreshPending == true) ||
                    ($0.state == .conflict && $0.conflict?.refreshRequired == true)
            }
            .compactMap(\.attempt.nextRetryAt)
            .min()
        guard let next else { return }
        let delay = max(0, next.timeIntervalSince(now()))
        retryWakeTask = Task { @MainActor [weak self] in
            try? await Task.sleep(nanoseconds: UInt64(min(delay, 900) * 1_000_000_000))
            guard !Task.isCancelled else { return }
            guard let self else { return }
            self.retryWakeTask = nil
            if resetForegroundPauseOnWake {
                self.foregroundTransientFailureCount = 0
            }
            self.wakeReplay()
        }
    }

    private func cancelSchedulingAndWorkers() {
        schedulerTask?.cancel()
        schedulerTask = nil
        retryWakeTask?.cancel()
        retryWakeTask = nil
        for task in workerTasks.values { task.cancel() }
        workerTasks.removeAll()
    }

    private func retryDelay(
        attemptCount: Int,
        retryAfter: MobileRetryAfter?,
        at date: Date
    ) -> TimeInterval {
        let retryAfterDelay: TimeInterval
        switch retryAfter {
        case .delay(let seconds): retryAfterDelay = max(0, seconds)
        case .date(let retryDate): retryAfterDelay = max(0, retryDate.timeIntervalSince(date))
        case nil: retryAfterDelay = 0
        }
        return ScoringQueueRetryPolicy(
            jitterFraction: { [jitter] _ in jitter() }
        ).delay(
            afterFailure: attemptCount,
            retryAfter: retryAfterDelay > 0 ? retryAfterDelay : nil
        )
    }

    private func canonicalGross(
        in canonical: MobileScoringCurrent,
        holeNumber: Int
    ) -> ScoringQueueGross? {
        canonical.scores.first(where: { $0.holeNumber == holeNumber }).map {
            ScoringQueueGross(teamOne: $0.gross.teamOne, teamTwo: $0.gross.teamTwo)
        }
    }

    private func canonicalHoleRevision(
        in canonical: MobileScoringCurrent,
        holeNumber: Int
    ) -> Int {
        canonical.scores.first(where: { $0.holeNumber == holeNumber })?.revision ?? 0
    }

    private func canonicalTargetIsUnchanged(
        for record: ScoringQueueRecord,
        canonical: MobileScoringCurrent
    ) -> Bool {
        let official = canonicalGross(in: canonical, holeNumber: record.intent.holeNumber)
        return official == nil || official == record.base.officialGrossAtSave
    }

    /// A conflict retains the strongest revision evidence already observed
    /// from both the server rejection and prior canonical reads. A later read
    /// may advance any revision independently, but it cannot lower one and be
    /// used to replace the comparison or release ordered work.
    private func canonicalRevisionEvidenceDoesNotRegress(
        _ canonical: MobileScoringCurrent,
        from record: ScoringQueueRecord
    ) -> Bool {
        let conflict = record.conflict
        return canonical.match.matchRevision >= max(
            record.lastKnownServer.matchRevision,
            conflict?.currentMatchRevision ?? 0
        ) && canonicalHoleRevision(
            in: canonical,
            holeNumber: record.intent.holeNumber
        ) >= max(
            record.lastKnownServer.holeRevision,
            conflict?.currentHoleRevision ?? 0
        ) && canonical.match.permissionRevision >= max(
            record.lastKnownServer.permissionRevision,
            conflict?.currentPermissionRevision ?? 0
        )
    }

    private func canonicalServerState(
        _ canonical: MobileScoringCurrent,
        holeNumber: Int,
        refreshedAt: Date
    ) -> ScoringQueueLastKnownServer {
        ScoringQueueLastKnownServer(
            matchRevision: canonical.match.matchRevision,
            holeRevision: canonicalHoleRevision(in: canonical, holeNumber: holeNumber),
            permissionRevision: canonical.match.permissionRevision,
            refreshedAt: refreshedAt
        )
    }

    private func credentialReason(_ error: any Error) -> ScoringQueueStateReasonCode {
        guard let credentialError = error as? MobileReadCredentialError else { return .authentication }
        switch credentialError {
        case .authIdentityChanged: return .identityChanged
        case .authSessionUnavailable: return .authentication
        case .authSessionMissing, .certificationUnavailable: return .authentication
        }
    }

    private func quarantineStateReason(
        _ reason: ScoringQueueQuarantineReason
    ) -> ScoringQueueStateReasonCode {
        switch reason {
        case .idempotencyConflict: .idempotencyConflict
        case .unknownPermanentResponse: .unknownPermanentResponse
        case .staleIdempotencyUncertain: .staleIdempotencyUncertain
        default: .invalidRecordOrContract
        }
    }

    private static func valid(_ identity: ScoringQueueIdentityPartition) -> Bool {
        !identity.authUserId.isEmpty && !identity.playerId.isEmpty && !identity.tournamentId.isEmpty
    }
}

private extension MobileScoringHoleRequest {
    init(record: ScoringQueueRecord) {
        self.init(
            matchId: record.partition.matchId,
            holeNumber: record.intent.holeNumber,
            teamOneGrossScores: record.intent.teamOneGrossScores,
            teamTwoGrossScores: record.intent.teamTwoGrossScores,
            mutationId: record.mutationId,
            expectedMatchRevision: record.base.expectedMatchRevision,
            expectedHoleRevision: record.base.expectedHoleRevision
        )
    }
}
