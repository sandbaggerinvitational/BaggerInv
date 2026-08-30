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
}

/// Owns durable scoring intent, replay ordering, and reconciliation. The
/// canonical scoring reader remains a separate authority and the live mutation
/// gate is deliberately disabled for Step 2F production code.
@MainActor
final class ScoringQueueCoordinator: ObservableObject {
    @Published private(set) var state: ScoringQueueCoordinatorState = .inactive

    private let repository: any ScoringQueueRepository
    private let api: any MobileAPIServing
    private let credentialProvider: any MobileReadCredentialProviding
    private let now: () -> Date
    private let jitter: @Sendable () -> Double
    private let processId: String
    private let liveMutationSendingEnabled: Bool
    private let maximumWorkers: Int

    private var activeIdentity: ScoringQueueIdentityPartition?
    private var isAdmissionPaused = false
    private var didRecoverProcessLeases = false
    private var lifecycleGeneration: UInt = 0
    private var schedulerTask: Task<Void, Never>?
    private var workerTasks: [ScoringQueuePartition: Task<Void, Never>] = [:]
    private var retryWakeTask: Task<Void, Never>?
    private var roundRobinCursor = 0
    private var foregroundTransientFailureCount = 0
    private var partitionsRequiringCanonicalRefresh: Set<ScoringQueuePartition> = []
    private var refreshFailureCounts: [String: Int] = [:]
    private var canonicalUpdateHandler: (@MainActor @Sendable (MobileScoringCurrentResponse) -> Void)?
    private var accessInvalidationHandler: (@MainActor @Sendable () -> Void)?
    private var authorityRevalidationHandler: (@MainActor @Sendable () -> Void)?

    init(
        repository: any ScoringQueueRepository,
        api: any MobileAPIServing,
        credentialProvider: any MobileReadCredentialProviding,
        liveMutationSendingEnabled: Bool = false,
        maximumWorkers: Int = 2,
        processId: String = UUID().uuidString.lowercased(),
        now: @escaping () -> Date = Date.init,
        jitter: @escaping @Sendable () -> Double = { Double.random(in: -0.2...0.2) }
    ) {
        self.repository = repository
        self.api = api
        self.credentialProvider = credentialProvider
        self.liveMutationSendingEnabled = liveMutationSendingEnabled
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
        cancelSchedulingAndWorkers()
        activeIdentity = identity
        isAdmissionPaused = false
        state.isSuspended = false

        do {
            if !didRecoverProcessLeases {
                _ = try await repository.recoverInterruptedSync(at: now())
                didRecoverProcessLeases = true
            }
            if let isolationRepository = repository as? any ScoringQueuePartitionIsolationRepository {
                _ = try await isolationRepository.markRelatedPartitionsForReview(
                    activeIdentity: identity,
                    at: now()
                )
            }
            try await applyStalePolicyAndReload()
            await compactReceiptEligibleRecords()
            partitionsRequiringCanonicalRefresh = Set(
                state.records.filter(\.isUnresolved).map(\.partition)
            )
            await refreshUnresolvedMatchesBeforeReplay()
            wakeReplay()
        } catch {
            state.lastPersistenceFailure = true
        }
    }

    func deactivate() async {
        lifecycleGeneration &+= 1
        cancelSchedulingAndWorkers()
        activeIdentity = nil
        isAdmissionPaused = false
        foregroundTransientFailureCount = 0
        partitionsRequiringCanonicalRefresh = []
        refreshFailureCounts = [:]
        state = .inactive
    }

    func suspendForEnvironmentReattestation() async {
        lifecycleGeneration &+= 1
        cancelSchedulingAndWorkers()
        state.isSuspended = true
    }

    func resumeAfterEnvironmentReattestation() async {
        guard activeIdentity != nil else { return }
        lifecycleGeneration &+= 1
        foregroundTransientFailureCount = 0
        state.isSuspended = false
        partitionsRequiringCanonicalRefresh.formUnion(
            state.records.filter(\.isUnresolved).map(\.partition)
        )
        await refreshUnresolvedMatchesBeforeReplay()
        wakeReplay()
    }

    func refreshForForeground() async {
        guard activeIdentity != nil, !state.isSuspended else { return }
        foregroundTransientFailureCount = 0
        refreshFailureCounts = [:]
        do {
            try await applyStalePolicyAndReload()
        } catch {
            state.lastPersistenceFailure = true
            return
        }
        partitionsRequiringCanonicalRefresh.formUnion(
            state.records.filter(\.isUnresolved).map(\.partition)
        )
        await refreshUnresolvedMatchesBeforeReplay()
        wakeReplay()
    }

    func prepareForSignOut() async {
        isAdmissionPaused = true
        lifecycleGeneration &+= 1
        cancelSchedulingAndWorkers()
        await reloadActiveRecords()
    }

    func cancelSignOutPreparation() async {
        guard activeIdentity != nil else { return }
        isAdmissionPaused = false
        wakeReplay()
    }

    func unresolvedActiveCount() async -> Int? {
        guard let identity = activeIdentity else { return 0 }
        do {
            return try await repository.unresolvedCount(for: identity)
        } catch {
            state.lastPersistenceFailure = true
            return nil
        }
    }

    @discardableResult
    func save(_ input: ScoringQueueSaveInput) async throws -> ScoringQueueSaveResult {
        guard let activeIdentity, !isAdmissionPaused else {
            throw ScoringQueueCoordinatorError.inactiveIdentity
        }
        guard input.partition.identity == activeIdentity else {
            throw ScoringQueueCoordinatorError.identityMismatch
        }

        do {
            let result = try await repository.save(input)
            state.lastPersistenceFailure = false
            if case .superseded(let previous, _) = result {
                await makeReceiptIfSupported(
                    recordId: previous.localQueueRecordId,
                    retention: ScoringQueueReceiptPolicy.resolutionRetention
                )
            }
            await reloadActiveRecords()
            wakeReplay()
            return result
        } catch {
            state.lastPersistenceFailure = true
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
            wakeReplay()
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
        guard let current = state.records.first(where: { $0.localQueueRecordId == recordId }),
              current.state == .retryable,
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
        guard let current = state.records.first(where: { $0.localQueueRecordId == recordId }),
              current.state == .conflict,
              let recordedConflict = current.conflict,
              !recordedConflict.refreshRequired
        else { throw ScoringQueueCoordinatorError.notReviewable }

        // "Keep Official" releases later work only after a fresh canonical
        // read proves that the reviewed official target and immutable scoring
        // snapshot are still the ones the participant chose to keep.
        let canonical = try await canonicalRefresh(for: current.partition)
        guard canonical.snapshot.snapshotId == current.base.snapshotId,
              canonical.snapshot.revision == current.base.snapshotRevision,
              canonicalGross(in: canonical, holeNumber: current.intent.holeNumber) == recordedConflict.officialGross
        else { throw ScoringQueueCoordinatorError.canonicalRefreshFailed }

        var updated = current
        updated.state = .resolved
        updated.stateReasonCode = nil
        updated.resolution = ScoringQueueResolution(
            reason: .keptOfficial,
            resolvedAt: now(),
            relatedLocalQueueRecordId: nil
        )
        updated.attempt.syncLeaseId = nil
        updated.attempt.syncLeaseStartedAt = nil
        updated.lastKnownServer = canonicalServerState(
            canonical,
            holeNumber: current.intent.holeNumber,
            refreshedAt: now()
        )
        updated.updatedAt = now()
        _ = try await repository.replace(updated, expecting: current)
        await makeReceiptIfSupported(recordId: recordId, retention: 7 * 24 * 60 * 60)
        partitionsRequiringCanonicalRefresh.insert(current.partition)
        await reloadActiveRecords()
        wakeReplay()
    }

    private func wakeReplay() {
        guard liveMutationSendingEnabled,
              activeIdentity != nil,
              !state.isSuspended,
              !isAdmissionPaused,
              !state.lastPersistenceFailure,
              !state.hasHiddenQuarantinedRecords,
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
            await self.scheduleEligibleWorkers(generation: generation)
            if self.lifecycleGeneration == generation {
                self.schedulerTask = nil
            }
        }
    }

    private func scheduleEligibleWorkers(generation: UInt) async {
        guard generation == lifecycleGeneration,
              let identity = activeIdentity,
              !state.isSuspended,
              !isAdmissionPaused,
              !state.lastPersistenceFailure,
              !state.hasHiddenQuarantinedRecords,
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
                  eligibleForWorker(oldest, at: now())
            else { continue }

            let task = Task { @MainActor [weak self] in
                guard let self else { return }
                await self.processOldest(in: partition, generation: generation)
                self.workerTasks[partition] = nil
                await self.reloadActiveRecords()
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

    private func processOldest(in partition: ScoringQueuePartition, generation: UInt) async {
        guard generation == lifecycleGeneration, partition.identity == activeIdentity else { return }
        guard var oldest = try? await repository.oldestUnresolved(in: partition) else { return }

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
            guard let transitioned = try? await repository.replace(oldest, expecting: current) else { return }
            oldest = transitioned
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
                await reconcileLifecycle(canonical, partition: partition)
            } catch {
                await handleCanonicalPreflightFailure(error, for: oldest)
                return
            }
        }

        if let canonical = preflightCanonical {
            guard let refreshedOldest = try? await repository.oldestUnresolved(in: partition),
                  refreshedOldest.localQueueRecordId == oldest.localQueueRecordId,
                  refreshedOldest.state == .queued
            else { return }
            oldest = refreshedOldest

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
                await persistPreflightRevisionConflict(oldest, canonical: canonical)
                await reconcileRevisionConflict(
                    recordId: oldest.localQueueRecordId,
                    canonical: canonical
                )
                guard let safelyReconciled = try? await repository.oldestUnresolved(in: partition),
                      safelyReconciled.localQueueRecordId == oldest.localQueueRecordId,
                      safelyReconciled.state == .queued,
                      safelyReconciled.base.snapshotId == canonical.snapshot.snapshotId,
                      safelyReconciled.base.snapshotRevision == canonical.snapshot.revision,
                      canonicalTargetIsUnchanged(for: safelyReconciled, canonical: canonical)
                else { return }
                oldest = safelyReconciled
            }
        }

        let leaseId = "\(processId):\(UUID().uuidString.lowercased())"
        guard let leased = try? await repository.acquireSyncLease(
            in: partition,
            leaseId: leaseId,
            at: now()
        ) else { return }

        let credentials: MobileReadCredentials
        do {
            credentials = try await credentialProvider.credentials(expectedAuthUserID: partition.authUserId)
            guard credentials.authUserID == partition.authUserId else {
                throw MobileReadCredentialError.authIdentityChanged
            }
        } catch {
            await markActionRequired(leased, reason: credentialReason(error))
            return
        }
        guard generation == lifecycleGeneration,
              partition.identity == activeIdentity,
              !state.isSuspended,
              !isAdmissionPaused,
              !Task.isCancelled
        else {
            await makeRetryable(leased, reason: .unknownOutcome, errorCode: nil, status: nil, retryAfter: nil)
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
            state.lastPersistenceFailure = true
            return
        }

        // Persisting transport-start intentionally happens before bytes may
        // leave the device. Re-check lifecycle authority after that actor/DB
        // suspension point so sign-out or environment suspension cannot send
        // using credentials captured by an obsolete queue generation.
        guard generation == lifecycleGeneration,
              partition.identity == activeIdentity,
              !state.isSuspended,
              !isAdmissionPaused,
              !Task.isCancelled
        else {
            await makeRetryable(
                transmitted,
                reason: .unknownOutcome,
                errorCode: nil,
                status: nil,
                retryAfter: nil
            )
            return
        }

        let request = MobileScoringHoleRequest(record: transmitted)
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
                generation: generation
            ) {
                return
            }
            await classify(error, for: transmitted, generation: generation)
        } catch {
            await makeRetryable(transmitted, reason: .unknownOutcome, errorCode: nil, status: nil, retryAfter: nil)
        }
    }

    private func retryAfterAuthenticationIfNeeded(
        _ error: MobileScoringMutationError,
        record: ScoringQueueRecord,
        request: MobileScoringHoleRequest,
        generation: UInt
    ) async -> Bool {
        guard case .rejected(let code, _, _, _) = error,
              code == .unauthorized || code == .invalidToken,
              generation == lifecycleGeneration
        else { return false }
        let credentials: MobileReadCredentials
        do {
            credentials = try await credentialProvider.refreshedCredentials(
                expectedAuthUserID: record.partition.authUserId
            )
        } catch {
            await markActionRequired(record, reason: .authentication)
            return true
        }

        guard credentials.authUserID == record.partition.authUserId else {
            await markActionRequired(record, reason: .identityChanged)
            return true
        }
        guard generation == lifecycleGeneration,
              record.partition.identity == activeIdentity,
              !state.isSuspended,
              !isAdmissionPaused,
              !Task.isCancelled
        else {
            await makeRetryable(
                record,
                reason: .unknownOutcome,
                errorCode: nil,
                status: nil,
                retryAfter: nil
            )
            return true
        }

        guard let leaseId = record.attempt.syncLeaseId else {
            state.lastPersistenceFailure = true
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
            state.lastPersistenceFailure = true
            return true
        }

        guard generation == lifecycleGeneration,
              record.partition.identity == activeIdentity,
              !state.isSuspended,
              !isAdmissionPaused,
              !Task.isCancelled
        else {
            await makeRetryable(
                retriedRecord,
                reason: .unknownOutcome,
                errorCode: nil,
                status: nil,
                retryAfter: nil
            )
            return true
        }

        do {
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
                await markActionRequired(retriedRecord, reason: .authentication)
            } else {
                await classify(retryError, for: retriedRecord, generation: generation)
            }
        } catch {
            await makeRetryable(
                retriedRecord,
                reason: .unknownOutcome,
                errorCode: nil,
                status: nil,
                retryAfter: nil
            )
        }
        return true
    }

    private func persistAcknowledgement(
        _ response: MobileScoringHoleResponse,
        for current: ScoringQueueRecord,
        generation: UInt
    ) async {
        guard response.data.accepted,
              response.data.matchId == current.partition.matchId,
              response.data.mutationId == current.mutationId,
              response.data.hole.holeNumber == current.intent.holeNumber
        else {
            await makeRetryable(current, reason: .unknownOutcome, errorCode: nil, status: 200, retryAfter: nil)
            return
        }
        foregroundTransientFailureCount = 0
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
            await reloadActiveRecords()
            guard generation == lifecycleGeneration else { return }
            await reconcileAcknowledgedAfterRefresh(persisted, generation: generation)
        } catch {
            // The server may have accepted while local acknowledgement storage
            // failed. Leave the durable syncing record for same-ID crash recovery.
            state.lastPersistenceFailure = true
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
            // Acknowledged + refreshPending is durable and intentionally cannot
            // be resubmitted. Foreground/relaunch will retry refresh only.
            await scheduleRefreshOnlyRetry(current)
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
        // Exact equality is required only for handing the acknowledged Match
        // revision to a later queued intent. Cleanup may also proceed when an
        // unrelated canonical write has advanced the Match, provided this read
        // is not older than the stored acknowledgement.
        guard canonical.match.matchRevision >= acknowledgement.canonicalMatchRevision,
              refreshedHoleRevision >= acknowledgement.canonicalHoleRevision
        else { throw ScoringQueueCoordinatorError.canonicalRefreshFailed }

        let canonicalRefreshedAt = now()
        if canonical.match.matchRevision == acknowledgement.canonicalMatchRevision,
           refreshedHoleRevision == acknowledgement.canonicalHoleRevision,
           canonicalGross(in: canonical, holeNumber: current.intent.holeNumber) == current.intent.gross
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
        switch error {
        case .definitelyNotSent(let reason):
            switch reason {
            case .missingBearer, .missingCertification:
                await markActionRequired(current, reason: .authentication)
            case .invalidRequest, .encoding:
                await quarantine(current, reason: .invalidRecordOrContract, code: nil, status: nil)
            case .clientUnavailable, .invalidURL, .requestConstruction:
                await makeRetryable(current, reason: .environment, errorCode: nil, status: nil, retryAfter: nil)
            }
        case .unknownOutcome(_, let code, let status, _, let retryAfter):
            await makeRetryable(
                current,
                reason: code == .mobileAPIUnavailable || code == .scoringUnavailable ? .environment : .unknownOutcome,
                errorCode: code,
                status: status,
                retryAfter: retryAfter
            )
            if code == .mobileAPIUnavailable { authorityRevalidationHandler?() }
        case .rejected(let code, let status, let data, let retryAfter):
            await classifyKnownRejection(
                code: code,
                status: status,
                data: data,
                retryAfter: retryAfter,
                current: current,
                generation: generation
            )
        }
    }

    private func classifyKnownRejection(
        code: MobileErrorCode?,
        status: Int,
        data: MobileErrorData?,
        retryAfter: MobileRetryAfter?,
        current: ScoringQueueRecord,
        generation: UInt
    ) async {
        switch code {
        case .participantNotFound:
            await markActionRequired(current, reason: .identity, errorCode: code, status: status)
        case .mobileAPIUnavailable, .scoringUnavailable:
            await makeRetryable(current, reason: .environment, errorCode: code, status: status, retryAfter: retryAfter)
            if code == .mobileAPIUnavailable { authorityRevalidationHandler?() }
        case .matchNotFound:
            await markActionRequired(current, reason: .matchMissing, errorCode: code, status: status)
            _ = try? await canonicalRefresh(for: current.partition)
        case .scoringNotAuthorized:
            await markActionRequired(current, reason: .authorization, errorCode: code, status: status)
            _ = try? await canonicalRefresh(for: current.partition)
        case .scoringReadOnly:
            await markActionRequired(current, reason: .readOnly, errorCode: code, status: status)
            _ = try? await canonicalRefresh(for: current.partition)
        case .invalidScoreInput:
            await quarantine(current, reason: .invalidRecordOrContract, code: code, status: status)
        case .revisionConflict:
            await persistRevisionConflict(current, data: data, status: status)
            guard generation == lifecycleGeneration else { return }
            await reconcileRevisionConflict(recordId: current.localQueueRecordId)
        case .idempotencyConflict:
            await quarantine(current, reason: .idempotencyConflict, code: code, status: status)
            _ = try? await canonicalRefresh(for: current.partition)
        case .matchAlreadyFinalized:
            await markActionRequired(current, reason: .finalized, errorCode: code, status: status)
            _ = try? await canonicalRefresh(for: current.partition)
        case .internalError:
            await makeRetryable(current, reason: .unknownOutcome, errorCode: code, status: status, retryAfter: retryAfter)
        case .unauthorized, .invalidToken:
            await markActionRequired(current, reason: .authentication, errorCode: code, status: status)
            accessInvalidationHandler?()
        case .none:
            if status == 429 {
                await makeRetryable(
                    current,
                    reason: .unknownOutcome,
                    errorCode: nil,
                    status: status,
                    retryAfter: retryAfter
                )
            } else if status >= 500 {
                await makeRetryable(current, reason: .unknownOutcome, errorCode: nil, status: status, retryAfter: retryAfter)
            } else {
                await quarantine(current, reason: .unknownPermanentResponse, code: nil, status: status)
            }
        case .finalizationNotReady:
            await quarantine(current, reason: .unknownPermanentResponse, code: code, status: status)
        case .invalidAuthRequest, .authMethodUnavailable, .authCertificationFailed:
            await markActionRequired(current, reason: .authentication, errorCode: code, status: status)
            accessInvalidationHandler?()
        }
    }

    private func persistRevisionConflict(
        _ current: ScoringQueueRecord,
        data: MobileErrorData?,
        status: Int
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
        _ = try? await repository.replace(updated, expecting: current)
        await reloadActiveRecords()
    }

    private func persistPreflightRevisionConflict(
        _ current: ScoringQueueRecord,
        canonical: MobileScoringCurrent
    ) async {
        guard current.state == .queued else { return }
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
        if (try? await repository.replace(updated, expecting: current)) != nil {
            await reloadActiveRecords()
        }
    }

    private func reconcileRevisionConflict(
        recordId: String,
        canonical canonicalOverride: MobileScoringCurrent? = nil
    ) async {
        await reloadActiveRecords()
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
            let official = canonicalGross(in: canonical, holeNumber: current.intent.holeNumber)
            var updated = current
            updated.conflict = ScoringQueueConflict(
                officialGross: official,
                currentMatchRevision: canonical.match.matchRevision,
                currentHoleRevision: canonicalHoleRevision(in: canonical, holeNumber: current.intent.holeNumber),
                currentPermissionRevision: canonical.match.permissionRevision,
                refreshRequired: false,
                recordedAt: now()
            )
            updated.lastKnownServer = canonicalServerState(
                canonical,
                holeNumber: current.intent.holeNumber,
                refreshedAt: now()
            )
            updated.attempt.nextRetryAt = nil
            refreshFailureCounts.removeValue(forKey: current.localQueueRecordId)

            if official == current.intent.gross {
                updated.state = .resolved
                updated.stateReasonCode = nil
                updated.resolution = ScoringQueueResolution(
                    reason: .officialEquivalent,
                    resolvedAt: now(),
                    relatedLocalQueueRecordId: nil
                )
            } else if canonical.match.status == .completed {
                updated.state = .actionRequired
                updated.stateReasonCode = .finalized
            } else if canonical.permission.readOnly || !canonical.permission.canScore {
                updated.state = .actionRequired
                updated.stateReasonCode = canonical.permission.readOnly ? .readOnly : .authorization
            } else if canonical.snapshot.snapshotId != current.base.snapshotId ||
                        canonical.snapshot.revision != current.base.snapshotRevision {
                updated.state = .actionRequired
                updated.stateReasonCode = .identityMismatch
            } else if canonicalTargetIsUnchanged(for: current, canonical: canonical),
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
            } else if canonicalTargetIsUnchanged(for: current, canonical: canonical),
                      !ScoringQueueRevisionPolicy.mayAttemptAnotherAutomaticRebase(
                          currentCount: current.base.automaticRebaseCount
                      )
            {
                updated.state = .actionRequired
                updated.stateReasonCode = .rebaseLimit
            }
            updated.updatedAt = now()
            let persisted = try await repository.replace(updated, expecting: current)
            if persisted.state == .resolved {
                await makeReceiptIfSupported(recordId: persisted.localQueueRecordId, retention: 7 * 24 * 60 * 60)
            }
            await reloadActiveRecords()
        } catch {
            // Conflict remains durable. Only canonical refresh is retried.
            await reloadActiveRecords()
            if let latest = state.records.first(where: { $0.localQueueRecordId == recordId }),
               latest.state == .conflict,
               latest.conflict?.refreshRequired == true
            {
                await scheduleRefreshOnlyRetry(latest)
            }
        }
    }

    private func scheduleRefreshOnlyRetry(_ current: ScoringQueueRecord) async {
        guard (current.state == .acknowledged && current.acknowledgement?.refreshPending == true) ||
                (current.state == .conflict && current.conflict?.refreshRequired == true)
        else { return }

        let failureCount = (refreshFailureCounts[current.localQueueRecordId] ?? 0) + 1
        refreshFailureCounts[current.localQueueRecordId] = failureCount
        var updated = current
        updated.attempt.nextRetryAt = ScoringQueueRetryPolicy(
            jitterFraction: { [jitter] _ in jitter() }
        ).nextRetryAt(afterFailure: failureCount, now: now())
        updated.updatedAt = now()
        if (try? await repository.replace(updated, expecting: current)) != nil {
            await reloadActiveRecords()
        }
    }

    private func scheduleCanonicalPreflightRetry(
        _ current: ScoringQueueRecord,
        reason: ScoringQueueStateReasonCode,
        code: MobileErrorCode?,
        status: Int?,
        marksOffline: Bool
    ) async {
        guard current.state == .queued || current.state == .retryable else {
            if (current.state == .acknowledged && current.acknowledgement?.refreshPending == true) ||
                (current.state == .conflict && current.conflict?.refreshRequired == true)
            {
                await scheduleRefreshOnlyRetry(current)
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
        if (try? await repository.replace(updated, expecting: current)) != nil {
            state.isOffline = marksOffline
            await reloadActiveRecords()
        }
    }

    private func makeRetryable(
        _ current: ScoringQueueRecord,
        reason: ScoringQueueStateReasonCode,
        errorCode: MobileErrorCode?,
        status: Int?,
        retryAfter: MobileRetryAfter?
    ) async {
        foregroundTransientFailureCount += 1
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
        _ = try? await repository.replace(updated, expecting: current)
        state.isOffline = status == nil
        await reloadActiveRecords()
    }

    private func markActionRequired(
        _ current: ScoringQueueRecord,
        reason: ScoringQueueStateReasonCode,
        errorCode: MobileErrorCode? = nil,
        status: Int? = nil
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
        _ = try? await repository.replace(updated, expecting: current)
        await reloadActiveRecords()
    }

    private func quarantine(
        _ current: ScoringQueueRecord,
        reason: ScoringQueueQuarantineReason,
        code: MobileErrorCode?,
        status: Int?
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
        _ = try? await repository.replace(updated, expecting: current)
        await reloadActiveRecords()
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

    private func applyStalePolicyAndReload() async throws {
        guard let identity = activeIdentity else { return }
        let records = try await repository.records(for: identity)
        for current in records where current.isUnresolved {
            let age = now().timeIntervalSince(current.createdAt)
            if age >= 7 * 24 * 60 * 60, current.state != .quarantined {
                await quarantine(current, reason: .staleIdempotencyUncertain, code: nil, status: nil)
            } else if age >= 24 * 60 * 60,
                      current.state != .actionRequired,
                      current.state != .quarantined
            {
                await markActionRequired(current, reason: .stale)
            }
        }
        await reloadActiveRecords()
    }

    private func refreshUnresolvedMatchesBeforeReplay() async {
        guard activeIdentity != nil else { return }
        let partitions = Set(state.records.filter(\.isUnresolved).map(\.partition))
        for partition in partitions.sorted(by: { $0.matchId < $1.matchId }) {
            guard let records = try? await repository.records(in: partition),
                  let oldest = records.filter(\.isUnresolved).min(by: { $0.sequence < $1.sequence })
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
                            generation: lifecycleGeneration
                        )
                    } catch {
                        await scheduleRefreshOnlyRetry(oldest)
                    }
                } else if oldest.state == .conflict,
                          oldest.conflict?.refreshRequired == true
                {
                    await reconcileRevisionConflict(
                        recordId: oldest.localQueueRecordId,
                        canonical: canonical
                    )
                } else {
                    await reconcileLifecycle(canonical, partition: partition)
                }
            } catch {
                await handleCanonicalPreflightFailure(error, for: oldest)
            }
        }
    }

    private func canonicalRefresh(for partition: ScoringQueuePartition) async throws -> MobileScoringCurrent {
        guard partition.identity == activeIdentity else {
            throw ScoringQueueCoordinatorError.identityMismatch
        }
        let credentials = try await credentialProvider.credentials(
            expectedAuthUserID: partition.authUserId
        )
        guard credentials.authUserID == partition.authUserId else {
            throw MobileReadCredentialError.authIdentityChanged
        }
        let response = try await api.scoringCurrent(
            accessToken: credentials.accessToken,
            certification: credentials.certification,
            matchID: partition.matchId
        )
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
        for current: ScoringQueueRecord
    ) async {
        if error is CancellationError { return }

        if let credentialError = error as? MobileReadCredentialError {
            let reason: ScoringQueueStateReasonCode = credentialError == .authIdentityChanged
                ? .identityChanged
                : .authentication
            await stopCanonicalPreflightForAccessFailure(current, reason: reason)
            return
        }

        if let coordinatorError = error as? ScoringQueueCoordinatorError {
            switch coordinatorError {
            case .identityMismatch, .inactiveIdentity:
                await stopCanonicalPreflightForAccessFailure(current, reason: .identityMismatch)
            case .invalidCanonicalContext, .canonicalRefreshFailed:
                await quarantineCanonicalPreflight(current, reason: .invalidRecordOrContract)
            case .notEligibleForRetry, .notReviewable, .liveMutationDisabled:
                await quarantineCanonicalPreflight(current, reason: .invalidRecordOrContract)
            }
            return
        }

        if error is MobileContractError || error is DecodingError {
            await quarantineCanonicalPreflight(current, reason: .invalidRecordOrContract)
            return
        }

        guard let apiError = error as? MobileAPIClientError else {
            await quarantineCanonicalPreflight(current, reason: .invalidRecordOrContract)
            return
        }

        switch apiError {
        case .missingBearer, .missingCertification:
            await stopCanonicalPreflightForAccessFailure(current, reason: .authentication)
        case .transportUnavailable, .invalidHTTPResponse:
            await scheduleCanonicalPreflightRetry(
                current,
                reason: .environment,
                code: nil,
                status: nil,
                marksOffline: true
            )
        case .invalidURL:
            await quarantineCanonicalPreflight(current, reason: .invalidRecordOrContract)
        case .unexpectedStatus(let status):
            if status == 401 {
                await stopCanonicalPreflightForAccessFailure(
                    current,
                    reason: .authentication,
                    status: status
                )
            } else if status == 429 || status >= 500 {
                await scheduleCanonicalPreflightRetry(
                    current,
                    reason: .environment,
                    code: nil,
                    status: status,
                    marksOffline: false
                )
            } else {
                await quarantineCanonicalPreflight(
                    current,
                    reason: .unknownPermanentResponse,
                    status: status
                )
            }
        case .server(let code, let status):
            switch code {
            case .unauthorized, .invalidToken:
                await stopCanonicalPreflightForAccessFailure(
                    current,
                    reason: .authentication,
                    code: code,
                    status: status
                )
            case .participantNotFound:
                await stopCanonicalPreflightForAccessFailure(
                    current,
                    reason: .identity,
                    code: code,
                    status: status
                )
            case .invalidAuthRequest, .authMethodUnavailable, .authCertificationFailed:
                await stopCanonicalPreflightForAccessFailure(
                    current,
                    reason: .authentication,
                    code: code,
                    status: status
                )
            case .matchNotFound:
                await markActionRequired(
                    current,
                    reason: .matchMissing,
                    errorCode: code,
                    status: status
                )
            case .scoringNotAuthorized:
                await markActionRequired(
                    current,
                    reason: .authorization,
                    errorCode: code,
                    status: status
                )
            case .scoringReadOnly, .matchAlreadyFinalized:
                await markActionRequired(
                    current,
                    reason: code == .scoringReadOnly ? .readOnly : .finalized,
                    errorCode: code,
                    status: status
                )
            case .mobileAPIUnavailable, .scoringUnavailable, .internalError:
                await scheduleCanonicalPreflightRetry(
                    current,
                    reason: .environment,
                    code: code,
                    status: status,
                    marksOffline: false
                )
                if code == .mobileAPIUnavailable { authorityRevalidationHandler?() }
            case .invalidScoreInput, .revisionConflict, .idempotencyConflict,
                 .finalizationNotReady:
                // These mutation/finalization codes are structurally invalid
                // on the read-only scoring-current preflight boundary.
                await quarantineCanonicalPreflight(
                    current,
                    reason: .unknownPermanentResponse,
                    code: code,
                    status: status
                )
            }
        }
    }

    private func stopCanonicalPreflightForAccessFailure(
        _ current: ScoringQueueRecord,
        reason: ScoringQueueStateReasonCode,
        code: MobileErrorCode? = nil,
        status: Int? = nil
    ) async {
        // An accepted record is never converted back into submit-eligible
        // state. Preserve its acknowledgement and refresh-only obligation; the
        // app-level invalidation handler hides participant access immediately.
        if current.state == .acknowledged {
            await scheduleRefreshOnlyRetry(current)
        } else {
            await markActionRequired(current, reason: reason, errorCode: code, status: status)
        }
        accessInvalidationHandler?()
    }

    private func quarantineCanonicalPreflight(
        _ current: ScoringQueueRecord,
        reason: ScoringQueueQuarantineReason,
        code: MobileErrorCode? = nil,
        status: Int? = nil
    ) async {
        // An accepted response awaiting canonical confirmation cannot be
        // rewritten as a new queue state without losing its acceptance proof.
        // Keep it refresh-only and fail the queue health gate instead.
        if current.state == .acknowledged {
            state.lastPersistenceFailure = true
            await scheduleRefreshOnlyRetry(current)
        } else {
            await quarantine(current, reason: reason, code: code, status: status)
        }
    }

    private func reconcileLifecycle(
        _ canonical: MobileScoringCurrent,
        partition: ScoringQueuePartition
    ) async {
        guard let records = try? await repository.records(in: partition),
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
        if official == current.intent.gross {
            var updated = current
            updated.state = .resolved
            updated.stateReasonCode = nil
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
            if (try? await repository.replace(updated, expecting: current)) != nil {
                await makeReceiptIfSupported(
                    recordId: updated.localQueueRecordId,
                    retention: 7 * 24 * 60 * 60
                )
            }
        } else if canonical.snapshot.snapshotId != current.base.snapshotId ||
                    canonical.snapshot.revision != current.base.snapshotRevision
        {
            await markActionRequired(current, reason: .identityMismatch)
        } else if canonical.match.status == .completed ||
                    canonical.permission.readOnly ||
                    !canonical.permission.canScore
        {
            await markActionRequired(
                current,
                reason: canonical.match.status == .completed ? .finalized : canonical.permission.readOnly ? .readOnly : .authorization
            )
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
            if (try? await repository.replace(updated, expecting: current)) != nil {
                await reconcileRevisionConflict(
                    recordId: current.localQueueRecordId,
                    canonical: canonical
                )
            }
        }
        await reloadActiveRecords()
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
            state.records = records
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
            state.lastPersistenceFailure = false
        } catch {
            // Preserve the last known in-memory view, but fail closed. Clearing
            // it here could falsely present an unresolved durable score as
            // Official and could bypass the sign-out warning.
            state.lastPersistenceFailure = true
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
