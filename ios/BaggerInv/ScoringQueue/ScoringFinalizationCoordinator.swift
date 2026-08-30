import Combine
import Foundation

enum ScoringFinalizationProbePhase: String, Codable, Equatable, Sendable {
    case prepared
    case outcomeUnknown
    case acknowledged
}

struct ScoringFinalizationProbe: Codable, Equatable, Sendable, Identifiable {
    static let schemaVersion = 1

    let schemaVersion: Int
    let id: String
    let identity: ScoringQueueIdentityPartition
    let matchId: String
    let mutationId: String
    let expectedMatchRevision: Int
    var acknowledgedMatchRevision: Int?
    var phase: ScoringFinalizationProbePhase
    let createdAt: Date
    var updatedAt: Date
    var lastErrorCode: String?

    init(
        id: String,
        identity: ScoringQueueIdentityPartition,
        matchId: String,
        mutationId: String,
        expectedMatchRevision: Int,
        acknowledgedMatchRevision: Int? = nil,
        phase: ScoringFinalizationProbePhase,
        createdAt: Date,
        updatedAt: Date? = nil,
        lastErrorCode: String? = nil
    ) {
        schemaVersion = Self.schemaVersion
        self.id = id
        self.identity = identity
        self.matchId = matchId
        self.mutationId = mutationId
        self.expectedMatchRevision = expectedMatchRevision
        self.acknowledgedMatchRevision = acknowledgedMatchRevision
        self.phase = phase
        self.createdAt = createdAt
        self.updatedAt = updatedAt ?? createdAt
        self.lastErrorCode = lastErrorCode
    }

    var isStructurallyCompatible: Bool {
        schemaVersion == Self.schemaVersion &&
        UUID(uuidString: id) != nil && id == id.lowercased() &&
        MobileScoringIdentifier.isValid(matchId) &&
        MobileScoringIdentifier.isValid(mutationId) &&
        expectedMatchRevision >= 0 &&
        hasCompatibleAcknowledgementRevision &&
        !identity.authUserId.isEmpty &&
        !identity.playerId.isEmpty &&
        !identity.tournamentId.isEmpty &&
        createdAt.timeIntervalSinceReferenceDate.isFinite &&
        updatedAt.timeIntervalSinceReferenceDate.isFinite &&
        updatedAt >= createdAt &&
        (lastErrorCode?.utf8.count ?? 0) <= 128
    }

    private var hasCompatibleAcknowledgementRevision: Bool {
        switch phase {
        case .acknowledged:
            acknowledgedMatchRevision.map { $0 >= expectedMatchRevision } ?? false
        case .prepared, .outcomeUnknown:
            acknowledgedMatchRevision == nil
        }
    }
}

protocol ScoringFinalizationProbeStoring: Sendable {
    func probe(for identity: ScoringQueueIdentityPartition) async throws -> ScoringFinalizationProbe?
    func save(_ probe: ScoringFinalizationProbe) async throws
    func remove(probeId: String) async throws
}

enum ScoringFinalizationProbeStoreError: Error, Equatable {
    case corruptStore
    case invalidProbe
    case unresolvedProbeExists
    case capacityExceeded
}

/// A fixed-name, protected, non-backed-up probe file. It contains no score
/// payload or credential and exists only to reconcile a possibly committed
/// online finalization after process termination.
actor DiskScoringFinalizationProbeStore: ScoringFinalizationProbeStoring {
    private static let maximumProbeCount = 8

    private struct Envelope: Codable {
        let schemaVersion: Int
        var probes: [ScoringFinalizationProbe]
    }

    private let fileURL: URL
    private let fileManager: FileManager
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder

    init(
        fileURL: URL? = nil,
        fileManager: FileManager = .default
    ) throws {
        self.fileManager = fileManager
        if let fileURL {
            self.fileURL = fileURL
        } else {
            let applicationSupport = try fileManager.url(
                for: .applicationSupportDirectory,
                in: .userDomainMask,
                appropriateFor: nil,
                create: true
            )
            self.fileURL = applicationSupport
                .appendingPathComponent("BaggerInv", isDirectory: true)
                .appendingPathComponent("ScoringQueue", isDirectory: true)
                .appendingPathComponent("finalization-probes-v1.json", isDirectory: false)
        }
        encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.sortedKeys]
        decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        try Self.prepareDirectory(fileURL: self.fileURL, fileManager: fileManager)
    }

    func probe(for identity: ScoringQueueIdentityPartition) throws -> ScoringFinalizationProbe? {
        let envelope = try load()
        let matches = envelope.probes.filter { $0.identity == identity }
        guard matches.count <= 1 else {
            throw ScoringFinalizationProbeStoreError.corruptStore
        }
        return matches.first
    }

    func save(_ probe: ScoringFinalizationProbe) throws {
        guard probe.isStructurallyCompatible else {
            throw ScoringFinalizationProbeStoreError.invalidProbe
        }
        var envelope = try load()
        if let existing = envelope.probes.first(where: { $0.identity == probe.identity }),
           existing.id != probe.id {
            throw ScoringFinalizationProbeStoreError.unresolvedProbeExists
        }
        envelope.probes.removeAll { $0.id == probe.id }
        envelope.probes.append(probe)
        guard envelope.probes.count <= Self.maximumProbeCount else {
            // Never replace a readable envelope with one that `load()` must
            // reject. Every existing unresolved identity remains intact.
            throw ScoringFinalizationProbeStoreError.capacityExceeded
        }
        try persist(envelope)
    }

    func remove(probeId: String) throws {
        var envelope = try load()
        envelope.probes.removeAll { $0.id == probeId }
        try persist(envelope)
    }

    private func load() throws -> Envelope {
        guard fileManager.fileExists(atPath: fileURL.path) else {
            return Envelope(schemaVersion: 1, probes: [])
        }
        do {
            let data = try Data(contentsOf: fileURL, options: [.mappedIfSafe])
            guard data.count <= 64 * 1_024 else {
                throw ScoringFinalizationProbeStoreError.corruptStore
            }
            let envelope = try decoder.decode(Envelope.self, from: data)
            guard envelope.schemaVersion == 1,
                  envelope.probes.count <= Self.maximumProbeCount,
                  envelope.probes.allSatisfy(\.isStructurallyCompatible),
                  Set(envelope.probes.map(\.id)).count == envelope.probes.count,
                  Set(envelope.probes.map(\.identity)).count == envelope.probes.count
            else { throw ScoringFinalizationProbeStoreError.corruptStore }
            return envelope
        } catch let error as ScoringFinalizationProbeStoreError {
            throw error
        } catch {
            throw ScoringFinalizationProbeStoreError.corruptStore
        }
    }

    private func persist(_ envelope: Envelope) throws {
        let data = try encoder.encode(envelope)
        guard data.count <= 64 * 1_024 else {
            throw ScoringFinalizationProbeStoreError.corruptStore
        }
        try data.write(to: fileURL, options: [.atomic])
        try applyProtectionAndBackupPolicy()
    }

    private static func prepareDirectory(fileURL: URL, fileManager: FileManager) throws {
        let directory = fileURL.deletingLastPathComponent()
        try fileManager.createDirectory(
            at: directory,
            withIntermediateDirectories: true,
            attributes: [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication]
        )
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        var mutableDirectory = directory
        try mutableDirectory.setResourceValues(values)
    }

    private func applyProtectionAndBackupPolicy() throws {
        try fileManager.setAttributes(
            [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication],
            ofItemAtPath: fileURL.path
        )
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        var mutableURL = fileURL
        try mutableURL.setResourceValues(values)
    }
}

enum ScoringFinalizationPhase: String, Equatable, Sendable {
    case idle
    case submitting
    case reconciling
    case acknowledgedRefreshPending
    case confirmationRequired
    case outcomeUnknown
    case blocked
    case matchFinal
}

enum ScoringFinalizationBlocker: String, Equatable, Sendable {
    case queue
    case canonicalUnavailable
    case notReady
    case readOnly
    case authentication
    case authorization
    case lifecycle
    case contract
}

struct ScoringFinalizationState: Equatable, Sendable {
    var phase: ScoringFinalizationPhase
    var matchId: String?
    var blocker: ScoringFinalizationBlocker?
    var lastServerCode: MobileErrorCode?

    static let idle = Self(
        phase: .idle,
        matchId: nil,
        blocker: nil,
        lastServerCode: nil
    )

    var isBusy: Bool { phase == .submitting || phase == .reconciling }
    var hasUnresolvedOutcome: Bool {
        phase == .outcomeUnknown || phase == .acknowledgedRefreshPending || isBusy
    }
}

enum ScoringFinalizationCoordinatorError: Error, Equatable {
    case mutationSendingDisabled
    case environmentSuspended
    case inactiveIdentity
    case queueNotReady
    case canonicalUnavailable
    case notReady
    case invalidCanonicalContext
    case persistenceFailure
}

/// Online-only finalization owner. Hole intent remains in the SQLite queue;
/// this coordinator stores only a tiny unknown-outcome probe and never
/// automatically repeats a finalization POST.
@MainActor
final class ScoringFinalizationCoordinator: ObservableObject {
    @Published private(set) var state: ScoringFinalizationState = .idle

    let liveMutationSendingEnabled: Bool

    private let api: any MobileAPIServing
    private let credentialProvider: any MobileReadCredentialProviding
    private let queue: ScoringQueueCoordinator
    private let probeStore: any ScoringFinalizationProbeStoring
    private let applicationActivity: NativeApplicationActivity
    private let now: () -> Date
    private let beforeFinalizationTransport: @MainActor @Sendable () async -> Void

    private var activeIdentity: ScoringQueueIdentityPartition?
    private var heldGuard: ScoringQueueFinalizationGuard?
    private var activeTransportTask: Task<MobileScoringFinalizeResponse, Error>?
    private var activeTransportOperationGeneration: UInt?
    private var activeProbeReconciliationID: UUID?
    private var generation: UInt = 0
    private var lifecycleAuthorization: NativeApplicationActivity.MutationTransportAuthorization?
    private var isSuspended = false
    private var isSignOutPrepared = false
    private var isRecoveringDurableProbe = false
    private var hasKnownDurableProbe = false
    private var canonicalUpdateHandler: (@MainActor @Sendable (MobileScoringCurrentResponse) -> Void)?
    private var accessInvalidationHandler: (@MainActor @Sendable () -> Void)?
    private var authorityRevalidationHandler: (@MainActor @Sendable () -> Void)?

    private var hasCurrentTransportAuthorization: Bool {
        guard let lifecycleAuthorization else { return false }
        return applicationActivity.permits(lifecycleAuthorization)
    }

    init(
        api: any MobileAPIServing,
        credentialProvider: any MobileReadCredentialProviding,
        queue: ScoringQueueCoordinator,
        probeStore: any ScoringFinalizationProbeStoring,
        applicationActivity: NativeApplicationActivity = NativeApplicationActivity(isActive: true),
        liveMutationSendingEnabled: Bool,
        now: @escaping () -> Date = Date.init,
        beforeFinalizationTransport: @escaping @MainActor @Sendable () async -> Void = {}
    ) {
        self.liveMutationSendingEnabled = liveMutationSendingEnabled
        self.api = api
        self.credentialProvider = credentialProvider
        self.queue = queue
        self.probeStore = probeStore
        self.applicationActivity = applicationActivity
        self.now = now
        self.beforeFinalizationTransport = beforeFinalizationTransport
    }

    func setCanonicalUpdateHandler(
        _ handler: @escaping @MainActor @Sendable (MobileScoringCurrentResponse) -> Void
    ) {
        canonicalUpdateHandler = handler
    }

    func setAccessInvalidationHandler(_ handler: @escaping @MainActor @Sendable () -> Void) {
        accessInvalidationHandler = handler
    }

    func setAuthorityRevalidationHandler(
        _ handler: @escaping @MainActor @Sendable () -> Void
    ) {
        authorityRevalidationHandler = handler
    }

    func activate(identity: ScoringQueueIdentityPartition) async {
        queue.beginFinalizationRecoveryBarrier(blockLocalSaves: true)
        isRecoveringDurableProbe = true
        generation &+= 1
        let activationGeneration = generation
        releaseHeldGuard()
        activeIdentity = identity
        lifecycleAuthorization = applicationActivity.mutationTransportAuthorization
        isSuspended = lifecycleAuthorization == nil
        isSignOutPrepared = false
        state = .idle
        do {
            guard let probe = try await probeStore.probe(for: identity) else {
                guard activationGeneration == generation,
                      activeIdentity == identity
                else { return }
                hasKnownDurableProbe = false
                if activeTransportTask == nil {
                    // Device-local absence of a probe is enough to restore
                    // durable offline Save even before health authority is
                    // available; replay remains governed by the full barrier.
                    queue.setFinalizationRecoveryLocalSaveBlocked(false)
                }
                await completeRecoveryBarrierIfProbeResolved(
                    identity: identity,
                    expectedGeneration: activationGeneration
                )
                return
            }
            guard activationGeneration == generation,
                  activeIdentity == identity
            else { return }
            hasKnownDurableProbe = true
            guard activeTransportTask == nil else {
                state = ScoringFinalizationState(
                    phase: .outcomeUnknown,
                    matchId: probe.matchId,
                    blocker: .canonicalUnavailable,
                    lastServerCode: probe.lastErrorCode.flatMap(MobileErrorCode.init(rawValue:))
                )
                return
            }
            guard probe.isStructurallyCompatible else {
                state = blocked(.contract, matchId: probe.matchId)
                return
            }
            switch probe.phase {
            case .prepared:
                // The outcome-unknown marker is committed before transport.
                // A prepared-only probe therefore proves no request began.
                try await removeProbe(probeId: probe.id)
                guard activationGeneration == generation,
                      activeIdentity == identity
                else { return }
                hasKnownDurableProbe = false
                state = ScoringFinalizationState(
                    phase: .confirmationRequired,
                    matchId: probe.matchId,
                    blocker: nil,
                    lastServerCode: nil
                )
                queue.completeFinalizationRecoveryBarrier()
                isRecoveringDurableProbe = false
            case .outcomeUnknown:
                guard !isSuspended else { return }
                await reconcileDurableProbe(probe)
            case .acknowledged:
                guard !isSuspended else { return }
                await reconcileDurableProbe(probe)
            }
            if !isSuspended {
                await completeRecoveryBarrierIfProbeResolved(
                    identity: identity,
                    expectedGeneration: activationGeneration
                )
            }
        } catch {
            guard activationGeneration == generation,
                  activeIdentity == identity
            else { return }
            state = blocked(.contract, matchId: nil)
        }
    }

    func deactivate() async {
        generation &+= 1
        cancelActiveTransport()
        activeIdentity = nil
        lifecycleAuthorization = nil
        isSuspended = false
        isSignOutPrepared = false
        isRecoveringDurableProbe = activeTransportTask != nil
        hasKnownDurableProbe = false
        releaseHeldGuard()
        state = .idle
    }

    func suspendForEnvironmentReattestation() async {
        guard activeIdentity != nil, !isSuspended else { return }
        queue.beginFinalizationRecoveryBarrier(
            blockLocalSaves: hasKnownDurableProbe || state.hasUnresolvedOutcome || heldGuard != nil
        )
        isRecoveringDurableProbe = true
        generation &+= 1
        lifecycleAuthorization = nil
        isSuspended = true
        cancelActiveTransport()
        releaseHeldGuard()

        if state.hasUnresolvedOutcome {
            state = ScoringFinalizationState(
                phase: .outcomeUnknown,
                matchId: state.matchId,
                blocker: .canonicalUnavailable,
                lastServerCode: state.lastServerCode
            )
        }
    }

    /// Finalization is online-only. Backgrounding therefore cancels any
    /// active transport and leaves a durable outcome probe for foreground
    /// reconciliation instead of assuming background execution will finish.
    func pauseForBackground() async {
        await suspendForEnvironmentReattestation()
    }

    /// Synchronously invalidates any operation generation before the async
    /// background pause can yield on repository cleanup.
    func prepareForApplicationInactivity() {
        guard activeIdentity != nil else { return }
        queue.beginFinalizationRecoveryBarrier(
            blockLocalSaves: hasKnownDurableProbe || state.hasUnresolvedOutcome || heldGuard != nil
        )
        isRecoveringDurableProbe = true
        generation &+= 1
        lifecycleAuthorization = nil
        isSuspended = true
        cancelActiveTransport()
        releaseHeldGuard()
        if state.hasUnresolvedOutcome {
            state = ScoringFinalizationState(
                phase: .outcomeUnknown,
                matchId: state.matchId,
                blocker: .canonicalUnavailable,
                lastServerCode: state.lastServerCode
            )
        }
    }

    func prepareForForegroundRevalidation() {
        prepareForApplicationInactivity()
        guard let identity = activeIdentity else { return }
        let probeCheckGeneration = generation
        Task { @MainActor [weak self] in
            await self?.refreshLocalSaveFence(
                identity: identity,
                expectedGeneration: probeCheckGeneration
            )
        }
    }

    func resumeForForeground() async {
        await resumeAfterEnvironmentReattestation()
    }

    func resumeAfterEnvironmentReattestation() async {
        guard let identity = activeIdentity,
              isSuspended,
              let authorization = applicationActivity.mutationTransportAuthorization
        else { return }
        queue.beginFinalizationRecoveryBarrier(
            blockLocalSaves: hasKnownDurableProbe || state.hasUnresolvedOutcome || heldGuard != nil
        )
        isRecoveringDurableProbe = true
        generation &+= 1
        let resumeGeneration = generation
        lifecycleAuthorization = authorization
        isSuspended = false
        do {
            guard let probe = try await probeStore.probe(for: identity) else {
                guard resumeGeneration == generation,
                      activeIdentity == identity,
                      !isSuspended
                else { return }
                hasKnownDurableProbe = false
                state = .idle
                await completeRecoveryBarrierIfProbeResolved(
                    identity: identity,
                    expectedGeneration: resumeGeneration
                )
                return
            }
            guard resumeGeneration == generation,
                  activeIdentity == identity,
                  !isSuspended
            else { return }
            hasKnownDurableProbe = true
            guard activeTransportTask == nil else {
                state = ScoringFinalizationState(
                    phase: .outcomeUnknown,
                    matchId: probe.matchId,
                    blocker: .canonicalUnavailable,
                    lastServerCode: probe.lastErrorCode.flatMap(MobileErrorCode.init(rawValue:))
                )
                return
            }
            switch probe.phase {
            case .prepared:
                try await removeProbe(probeId: probe.id)
                guard resumeGeneration == generation,
                      activeIdentity == identity,
                      !isSuspended
                else { return }
                hasKnownDurableProbe = false
                state = ScoringFinalizationState(
                    phase: .confirmationRequired,
                    matchId: probe.matchId,
                    blocker: nil,
                    lastServerCode: nil
                )
            case .outcomeUnknown:
                await reconcileDurableProbe(probe)
            case .acknowledged:
                await reconcileDurableProbe(probe)
            }
            await completeRecoveryBarrierIfProbeResolved(
                identity: identity,
                expectedGeneration: resumeGeneration
            )
        } catch {
            guard resumeGeneration == generation,
                  activeIdentity == identity,
                  !isSuspended
            else { return }
            state = blocked(.contract, matchId: state.matchId)
        }
    }

    func prepareForSignOut() async {
        prepareForSignOutSynchronously()
    }

    /// The sign-out tap closes finalization transport before any queue/probe
    /// count I/O can yield on MainActor.
    func prepareForSignOutSynchronously() {
        queue.beginFinalizationRecoveryBarrier(blockLocalSaves: true)
        isRecoveringDurableProbe = true
        isSignOutPrepared = true
        generation &+= 1
        cancelActiveTransport()
        releaseHeldGuard()
    }

    func cancelSignOutPreparation() async {
        guard let activeIdentity else { return }
        await activate(identity: activeIdentity)
    }

    func unresolvedProbeCount() async -> Int? {
        guard let activeIdentity else { return 0 }
        do {
            return try await probeStore.probe(for: activeIdentity) == nil ? 0 : 1
        } catch {
            return nil
        }
    }

    func finalize(matchId: String) async throws {
        guard liveMutationSendingEnabled else {
            state = blocked(.authorization, matchId: matchId)
            throw ScoringFinalizationCoordinatorError.mutationSendingDisabled
        }
        guard !isRecoveringDurableProbe else {
            state = blocked(.queue, matchId: matchId)
            throw ScoringFinalizationCoordinatorError.queueNotReady
        }
        guard activeTransportTask == nil else {
            state = blocked(.queue, matchId: matchId)
            throw ScoringFinalizationCoordinatorError.queueNotReady
        }
        guard !isSuspended, hasCurrentTransportAuthorization else {
            throw ScoringFinalizationCoordinatorError.environmentSuspended
        }
        guard !isSignOutPrepared else {
            throw ScoringFinalizationCoordinatorError.inactiveIdentity
        }
        guard let identity = activeIdentity else {
            throw ScoringFinalizationCoordinatorError.inactiveIdentity
        }
        let operationGeneration = generation
        let guardToken: ScoringQueueFinalizationGuard
        do {
            guardToken = try await queue.acquireFinalizationGuard(matchId: matchId)
            guard operationGeneration == generation,
                  activeIdentity == identity,
                  hasCurrentTransportAuthorization,
                  !isSuspended
            else {
                try? queue.releaseFinalizationGuard(guardToken)
                throw ScoringFinalizationCoordinatorError.inactiveIdentity
            }
            heldGuard = guardToken
        } catch {
            guard lifecycleIsCurrent(operationGeneration, identity: identity) else {
                throw ScoringFinalizationCoordinatorError.inactiveIdentity
            }
            state = blocked(.queue, matchId: matchId)
            throw ScoringFinalizationCoordinatorError.queueNotReady
        }

        do {
            let canonical = try await canonicalRefresh(
                identity: identity,
                matchId: matchId
            )
            guard operationGeneration == generation,
                  hasCurrentTransportAuthorization,
                  !isSuspended
            else {
                throw ScoringFinalizationCoordinatorError.inactiveIdentity
            }
            guard isReadyToFinalize(canonical) else {
                state = blocked(
                    canonical.permission.readOnly ? .readOnly : .notReady,
                    matchId: matchId
                )
                releaseHeldGuard()
                throw ScoringFinalizationCoordinatorError.notReady
            }

            // Acquire current credentials before creating a durable probe. A
            // credential failure proves no finalization transport could have
            // begun and must not strand a prepared probe in this process.
            let credentials = try await credentials(for: identity)
            guard operationIsCurrent(operationGeneration, identity: identity) else {
                throw ScoringFinalizationCoordinatorError.inactiveIdentity
            }
            let timestamp = now()
            let mutationId = UUID().uuidString.lowercased()
            var probe = ScoringFinalizationProbe(
                id: UUID().uuidString.lowercased(),
                identity: identity,
                matchId: matchId,
                mutationId: mutationId,
                expectedMatchRevision: canonical.match.matchRevision,
                phase: .prepared,
                createdAt: timestamp
            )
            try await saveProbe(probe)
            guard operationIsCurrent(operationGeneration, identity: identity) else {
                try? await removeProbe(probeId: probe.id)
                throw ScoringFinalizationCoordinatorError.inactiveIdentity
            }

            let request = MobileScoringFinalizeRequest(
                matchId: matchId,
                mutationId: mutationId,
                expectedMatchRevision: canonical.match.matchRevision
            )
            probe.phase = .outcomeUnknown
            probe.updatedAt = now()
            try await saveProbe(probe)
            guard operationIsCurrent(operationGeneration, identity: identity) else {
                // No transport Task exists yet, so this probe is definitely
                // not an unknown server outcome and may be removed safely.
                try? await removeProbe(probeId: probe.id)
                throw ScoringFinalizationCoordinatorError.inactiveIdentity
            }
            state = ScoringFinalizationState(
                phase: .submitting,
                matchId: matchId,
                blocker: nil,
                lastServerCode: nil
            )

            do {
                guard let transportAuthorization = lifecycleAuthorization else {
                    throw ScoringFinalizationCoordinatorError.inactiveIdentity
                }
                let task = makeFinalizationTransportTask(
                    request: request,
                    credentials: credentials,
                    identity: identity,
                    operationGeneration: operationGeneration,
                    authorization: transportAuthorization
                )
                activeTransportTask = task
                activeTransportOperationGeneration = operationGeneration
                let response = try await task.value
                guard response.isContractCompatible(for: request) else {
                    clearActiveTransport(ifOwnedBy: operationGeneration)
                    if operationIsCurrent(operationGeneration, identity: identity) {
                        state = ScoringFinalizationState(
                            phase: .outcomeUnknown,
                            matchId: matchId,
                            blocker: .contract,
                            lastServerCode: nil
                        )
                        await reconcileDurableProbe(probe)
                    }
                    return
                }
                // A compatible accepted response is durable evidence even if
                // sign-out/suspension happened while transport was in flight.
                // Persist it under the original partition; publish/reconcile
                // only when that exact operation remains current.
                await persistAcceptedFinalization(
                    probe,
                    acknowledgedMatchRevision: response.data.match.revision,
                    operationGeneration: operationGeneration,
                    identity: identity
                )
            } catch let error as MobileScoringFinalizationError {
                clearActiveTransport(ifOwnedBy: operationGeneration)
                guard operationIsCurrent(operationGeneration, identity: identity) else { return }
                await handle(
                    error,
                    request: request,
                    probe: probe,
                    identity: identity,
                    operationGeneration: operationGeneration
                )
            } catch {
                clearActiveTransport(ifOwnedBy: operationGeneration)
                guard operationIsCurrent(operationGeneration, identity: identity) else { return }
                state = ScoringFinalizationState(
                    phase: .outcomeUnknown,
                    matchId: matchId,
                    blocker: .canonicalUnavailable,
                    lastServerCode: nil
                )
                await reconcileDurableProbe(probe)
            }
        } catch let error as ScoringFinalizationCoordinatorError {
            if operationIsCurrent(operationGeneration, identity: identity),
               error != .canonicalUnavailable,
               error != .persistenceFailure
            {
                releaseHeldGuard()
            }
            throw error
        } catch {
            guard operationIsCurrent(operationGeneration, identity: identity) else {
                throw ScoringFinalizationCoordinatorError.inactiveIdentity
            }
            if let blocker = canonicalAccessBlocker(for: error) {
                state = blocked(blocker, matchId: matchId)
                releaseHeldGuard()
                accessInvalidationHandler?()
            } else {
                state = blocked(.canonicalUnavailable, matchId: matchId)
                releaseHeldGuard()
                revalidateAuthorityIfRequired(
                    by: error,
                    generation: operationGeneration,
                    identity: identity
                )
            }
            throw ScoringFinalizationCoordinatorError.canonicalUnavailable
        }
    }

    func refreshUnknownOutcome() async {
        guard let identity = activeIdentity,
              hasCurrentTransportAuthorization,
              !isSuspended,
              activeTransportTask == nil
        else { return }
        let refreshGeneration = generation
        do {
            guard let probe = try await probeStore.probe(for: identity) else {
                guard refreshGeneration == generation,
                      activeIdentity == identity,
                      !isSuspended
                else { return }
                hasKnownDurableProbe = false
                await completeRecoveryBarrierIfProbeResolved(
                    identity: identity,
                    expectedGeneration: refreshGeneration
                )
                return
            }
            guard refreshGeneration == generation,
                  activeIdentity == identity,
                  !isSuspended
            else { return }
            hasKnownDurableProbe = true
            switch probe.phase {
            case .acknowledged:
                await reconcileDurableProbe(probe)
            case .outcomeUnknown:
                await reconcileDurableProbe(probe)
            case .prepared:
                try await removeProbe(probeId: probe.id)
                guard refreshGeneration == generation,
                      activeIdentity == identity,
                      !isSuspended
                else { return }
                hasKnownDurableProbe = false
                state = ScoringFinalizationState(
                    phase: .confirmationRequired,
                    matchId: probe.matchId,
                    blocker: nil,
                    lastServerCode: nil
                )
            }
            await completeRecoveryBarrierIfProbeResolved(
                identity: identity,
                expectedGeneration: refreshGeneration
            )
        } catch {
            guard refreshGeneration == generation,
                  activeIdentity == identity,
                  !isSuspended
            else { return }
            state = blocked(.contract, matchId: state.matchId)
        }
    }

    func reconsiderEligibility(using canonical: MobileScoringCurrent?) async {
        guard !isSuspended,
              hasCurrentTransportAuthorization,
              let identity = activeIdentity,
              state.phase == .blocked,
              state.blocker != .authentication,
              state.blocker != .authorization,
              state.blocker != .contract
        else { return }
        let reconsiderGeneration = generation
        do {
            guard try await probeStore.probe(for: identity) == nil else { return }
            guard reconsiderGeneration == generation,
                  activeIdentity == identity,
                  !isSuspended
            else { return }
        } catch {
            guard reconsiderGeneration == generation,
                  activeIdentity == identity,
                  !isSuspended
            else { return }
            state = blocked(.contract, matchId: state.matchId)
            return
        }
        guard let canonical,
              canonical.player.playerId == identity.playerId,
              state.matchId == nil || state.matchId == canonical.match.matchId
        else {
            state = blocked(.canonicalUnavailable, matchId: state.matchId)
            return
        }
        if canonical.match.status == .completed {
            state = ScoringFinalizationState(
                phase: .matchFinal,
                matchId: canonical.match.matchId,
                blocker: nil,
                lastServerCode: nil
            )
        } else if isReadyToFinalize(canonical) {
            // Explicit canonical refresh recovered eligibility. Return to idle
            // so the UI may offer a fresh confirmation; never POST here.
            state = .idle
        } else {
            state = blocked(
                canonical.permission.readOnly ? .readOnly : .notReady,
                matchId: canonical.match.matchId
            )
        }
    }

    private func handle(
        _ error: MobileScoringFinalizationError,
        request: MobileScoringFinalizeRequest,
        probe: ScoringFinalizationProbe,
        identity: ScoringQueueIdentityPartition,
        operationGeneration: UInt
    ) async {
        guard !isSuspended, activeIdentity == identity else {
            state = ScoringFinalizationState(
                phase: .outcomeUnknown,
                matchId: probe.matchId,
                blocker: .canonicalUnavailable,
                lastServerCode: nil
            )
            releaseHeldGuard()
            return
        }
        switch error {
        case .definitelyNotSent:
            do {
                try await removeProbe(probeId: probe.id)
            } catch {
                guard operationIsCurrent(operationGeneration, identity: identity) else { return }
                state = blocked(.contract, matchId: probe.matchId)
                return
            }
            guard operationIsCurrent(operationGeneration, identity: identity) else { return }
            hasKnownDurableProbe = false
            state = blocked(.canonicalUnavailable, matchId: probe.matchId)
            releaseHeldGuard()
        case .unknownOutcome(_, let code, _, _, _):
            state = ScoringFinalizationState(
                phase: .outcomeUnknown,
                matchId: probe.matchId,
                blocker: .canonicalUnavailable,
                lastServerCode: code
            )
            if code == .mobileAPIUnavailable,
               lifecycleIsCurrent(operationGeneration, identity: identity)
            {
                authorityRevalidationHandler?()
                return
            }
            await reconcileDurableProbe(probe)
        case .rejected(let code, _, _, _):
            if code == .unauthorized || code == .invalidToken {
                do {
                    let refreshed = try await credentialProvider.refreshedCredentials(
                        expectedAuthUserID: identity.authUserId
                    )
                    guard refreshed.authUserID == identity.authUserId else {
                        throw MobileReadCredentialError.authIdentityChanged
                    }
                    guard operationIsCurrent(operationGeneration, identity: identity) else {
                        try? await removeProbe(probeId: probe.id)
                        return
                    }
                    do {
                        guard let transportAuthorization = lifecycleAuthorization else {
                            throw ScoringFinalizationCoordinatorError.inactiveIdentity
                        }
                        let retryTask = makeFinalizationTransportTask(
                            request: request,
                            credentials: refreshed,
                            identity: identity,
                            operationGeneration: operationGeneration,
                            authorization: transportAuthorization
                        )
                        activeTransportTask = retryTask
                        activeTransportOperationGeneration = operationGeneration
                        let response = try await retryTask.value
                        guard response.isContractCompatible(for: request) else {
                            clearActiveTransport(ifOwnedBy: operationGeneration)
                            if operationIsCurrent(operationGeneration, identity: identity) {
                                state = ScoringFinalizationState(
                                    phase: .outcomeUnknown,
                                    matchId: probe.matchId,
                                    blocker: .contract,
                                    lastServerCode: nil
                                )
                                await reconcileDurableProbe(probe)
                            }
                            return
                        }
                        await persistAcceptedFinalization(
                            probe,
                            acknowledgedMatchRevision: response.data.match.revision,
                            operationGeneration: operationGeneration,
                            identity: identity
                        )
                    } catch let retryError as MobileScoringFinalizationError {
                        clearActiveTransport(ifOwnedBy: operationGeneration)
                        guard operationIsCurrent(operationGeneration, identity: identity) else { return }
                        await handleKnownPostRefreshFailure(retryError, probe: probe)
                    } catch {
                        clearActiveTransport(ifOwnedBy: operationGeneration)
                        guard operationIsCurrent(operationGeneration, identity: identity) else { return }
                        state = ScoringFinalizationState(
                            phase: .outcomeUnknown,
                            matchId: probe.matchId,
                            blocker: .canonicalUnavailable,
                            lastServerCode: nil
                        )
                        releaseHeldGuard()
                    }
                } catch {
                    do {
                        try await removeProbe(probeId: probe.id)
                    } catch {
                        guard operationIsCurrent(operationGeneration, identity: identity) else {
                            return
                        }
                        state = blocked(.contract, matchId: probe.matchId)
                        return
                    }
                    guard operationIsCurrent(operationGeneration, identity: identity) else { return }
                    hasKnownDurableProbe = false
                    state = blocked(.authentication, matchId: probe.matchId, code: code)
                    releaseHeldGuard()
                    accessInvalidationHandler?()
                }
            } else {
                await handleKnownPostRefreshFailure(error, probe: probe)
            }
        }
    }

    private func handleKnownPostRefreshFailure(
        _ error: MobileScoringFinalizationError,
        probe: ScoringFinalizationProbe
    ) async {
        guard !isSuspended,
              let identity = activeIdentity,
              probe.identity == identity
        else { return }
        let handlerGeneration = generation
        switch error {
        case .unknownOutcome(_, let code, _, _, _):
            state = ScoringFinalizationState(
                phase: .outcomeUnknown,
                matchId: probe.matchId,
                blocker: .canonicalUnavailable,
                lastServerCode: code
            )
            if code == .mobileAPIUnavailable,
               lifecycleIsCurrent(handlerGeneration, identity: identity)
            {
                authorityRevalidationHandler?()
                return
            }
            await reconcileDurableProbe(probe)
        case .definitelyNotSent:
            do {
                try await removeProbe(probeId: probe.id)
            } catch {
                guard lifecycleIsCurrent(handlerGeneration, identity: identity) else { return }
                state = blocked(.contract, matchId: probe.matchId)
                return
            }
            guard lifecycleIsCurrent(handlerGeneration, identity: identity) else { return }
            hasKnownDurableProbe = false
            state = blocked(.canonicalUnavailable, matchId: probe.matchId)
            releaseHeldGuard()
        case .rejected(let code, _, _, _):
            if code == .unauthorized || code == .invalidToken || code == .authCertificationFailed {
                // The single credential refresh was exhausted and the second
                // POST was definitively rejected. This is not an unknown
                // finalization outcome; fail the entire authenticated shell
                // closed and do not retain a misleading probe.
                do {
                    try await removeProbe(probeId: probe.id)
                } catch {
                    guard lifecycleIsCurrent(handlerGeneration, identity: identity) else { return }
                    state = blocked(.contract, matchId: probe.matchId, code: code)
                    return
                }
                guard lifecycleIsCurrent(handlerGeneration, identity: identity) else { return }
                hasKnownDurableProbe = false
                state = blocked(.authentication, matchId: probe.matchId, code: code)
                releaseHeldGuard()
                accessInvalidationHandler?()
            } else if code == .participantNotFound {
                do {
                    try await removeProbe(probeId: probe.id)
                } catch {
                    guard lifecycleIsCurrent(handlerGeneration, identity: identity) else { return }
                    state = blocked(.contract, matchId: probe.matchId, code: code)
                    return
                }
                guard lifecycleIsCurrent(handlerGeneration, identity: identity) else { return }
                hasKnownDurableProbe = false
                state = blocked(.authorization, matchId: probe.matchId, code: code)
                releaseHeldGuard()
                accessInvalidationHandler?()
            } else if code == .mobileAPIUnavailable {
                // This is a known rejection, so no finalization committed and
                // the probe may be removed. Re-attest exact Preview authority
                // instead of treating a Production-style fail-closed response
                // as an ordinary scoring outage.
                do {
                    try await removeProbe(probeId: probe.id)
                } catch {
                    guard lifecycleIsCurrent(handlerGeneration, identity: identity) else { return }
                    state = blocked(.contract, matchId: probe.matchId, code: code)
                    return
                }
                guard lifecycleIsCurrent(handlerGeneration, identity: identity) else { return }
                hasKnownDurableProbe = false
                state = blocked(.canonicalUnavailable, matchId: probe.matchId, code: code)
                releaseHeldGuard()
                authorityRevalidationHandler?()
            } else {
                // Known rejection did not commit. Refresh still owns lifecycle,
                // permission, revision, and already-finalized resolution.
                await reconcileKnownRejection(probe, code: code)
            }
        }
    }

    private func reconcileKnownRejection(
        _ probe: ScoringFinalizationProbe,
        code: MobileErrorCode?
    ) async {
        guard let identity = activeIdentity,
              hasCurrentTransportAuthorization,
              !isSuspended
        else { return }
        let reconciliationGeneration = generation
        do {
            try await removeProbe(probeId: probe.id)
            guard reconciliationGeneration == generation,
                  activeIdentity == identity,
                  !isSuspended
            else { return }
            hasKnownDurableProbe = false
        } catch {
            guard reconciliationGeneration == generation,
                  activeIdentity == identity,
                  !isSuspended
            else { return }
            state = blocked(.contract, matchId: probe.matchId, code: code)
            // Deletion failed, so durable ownership is uncertain. Keep the
            // Match guard and recovery fence closed until storage is readable.
            return
        }
        do {
            let canonical = try await canonicalRefresh(
                identity: identity,
                matchId: probe.matchId,
                minimumMatchRevision: probe.expectedMatchRevision
            )
            if canonical.match.status == .completed {
                state = ScoringFinalizationState(
                    phase: .matchFinal,
                    matchId: probe.matchId,
                    blocker: nil,
                    lastServerCode: code
                )
            } else {
                state = blocked(
                    blocker(for: code, canonical: canonical),
                    matchId: probe.matchId,
                    code: code
                )
            }
            releaseHeldGuard()
        } catch {
            guard reconciliationGeneration == generation,
                  activeIdentity == identity,
                  !isSuspended
            else { return }
            // The POST outcome is a known rejection and the probe has already
            // been removed. A failed follow-up GET is unavailable canonical
            // state, never an unknown finalization result.
            if let accessBlocker = canonicalAccessBlocker(for: error) {
                state = blocked(accessBlocker, matchId: probe.matchId, code: code)
                accessInvalidationHandler?()
            } else {
                state = blocked(.canonicalUnavailable, matchId: probe.matchId, code: code)
                revalidateAuthorityIfRequired(
                    by: error,
                    generation: reconciliationGeneration,
                    identity: identity
                )
            }
            releaseHeldGuard()
        }
    }

    /// Serializes all durable-probe reconciliation. Callers may arrive from a
    /// manual refresh, lifecycle restoration, and a late transport completion
    /// at nearly the same time. Re-read the probe after acquiring ownership so
    /// only one canonical response may remove it or publish terminal state.
    private func reconcileDurableProbe(_ candidate: ScoringFinalizationProbe) async {
        guard activeTransportTask == nil,
              activeProbeReconciliationID == nil
        else { return }
        let reconciliationID = UUID()
        let startedGeneration = generation
        activeProbeReconciliationID = reconciliationID
        defer {
            finishProbeReconciliation(
                id: reconciliationID,
                startedGeneration: startedGeneration
            )
        }

        do {
            guard let current = try await probeStore.probe(for: candidate.identity),
                  current.id == candidate.id,
                  current.identity == candidate.identity,
                  activeProbeReconciliationID == reconciliationID,
                  activeTransportTask == nil,
                  lifecycleIsCurrent(startedGeneration, identity: candidate.identity)
            else { return }

            switch current.phase {
            case .outcomeUnknown:
                await performUnknownProbeReconciliation(current)
            case .acknowledged:
                await performAcknowledgedProbeReconciliation(current)
            case .prepared:
                // Prepared proves no transport began. Lifecycle entry points
                // own its local cleanup so they can publish confirmation state.
                return
            }

            if isRecoveringDurableProbe {
                await completeRecoveryBarrierIfProbeResolved(
                    identity: candidate.identity,
                    expectedGeneration: startedGeneration,
                    reconciliationOwner: reconciliationID
                )
            }
        } catch {
            guard lifecycleIsCurrent(startedGeneration, identity: candidate.identity) else {
                return
            }
            state = blocked(.contract, matchId: candidate.matchId)
        }
    }

    private func performUnknownProbeReconciliation(
        _ probe: ScoringFinalizationProbe
    ) async {
        guard !isSuspended,
              hasCurrentTransportAuthorization,
              let identity = activeIdentity,
              probe.identity == identity
        else { return }
        let reconciliationGeneration = generation
        if heldGuard == nil {
            do {
                let acquiredGuard = try await queue.acquireFinalizationGuard(matchId: probe.matchId)
                guard reconciliationGeneration == generation,
                      activeIdentity == identity,
                      !isSuspended
                else {
                    try? queue.releaseFinalizationGuard(acquiredGuard)
                    return
                }
                heldGuard = acquiredGuard
            } catch {
                guard reconciliationGeneration == generation,
                      activeIdentity == identity,
                      !isSuspended
                else { return }
                state = blocked(.queue, matchId: probe.matchId)
                return
            }
        }
        state.phase = .reconciling
        do {
            let canonical = try await canonicalRefresh(
                identity: identity,
                matchId: probe.matchId,
                minimumMatchRevision: probe.expectedMatchRevision
            )
            try await removeProbe(probeId: probe.id)
            guard reconciliationGeneration == generation,
                  activeIdentity == identity,
                  !isSuspended
            else { return }
            hasKnownDurableProbe = false
            if canonical.match.status == .completed {
                state = ScoringFinalizationState(
                    phase: .matchFinal,
                    matchId: probe.matchId,
                    blocker: nil,
                    lastServerCode: nil
                )
            } else if isReadyToFinalize(canonical) {
                // The prior attempt did not produce a canonical final Match.
                // Never repeat it automatically; another POST requires a new
                // explicit confirmation and mutation ID.
                state = ScoringFinalizationState(
                    phase: .confirmationRequired,
                    matchId: probe.matchId,
                    blocker: nil,
                    lastServerCode: nil
                )
            } else {
                state = blocked(
                    canonical.permission.readOnly ? .readOnly : .notReady,
                    matchId: probe.matchId
                )
            }
            releaseHeldGuard()
        } catch {
            guard reconciliationGeneration == generation,
                  activeIdentity == identity,
                  !isSuspended
            else { return }
            let accessBlocker = canonicalAccessBlocker(for: error)
            state = ScoringFinalizationState(
                phase: .outcomeUnknown,
                matchId: probe.matchId,
                blocker: accessBlocker ?? .canonicalUnavailable,
                lastServerCode: probe.lastErrorCode.flatMap(MobileErrorCode.init(rawValue:))
            )
            if accessBlocker != nil {
                releaseHeldGuard()
                accessInvalidationHandler?()
            } else {
                revalidateAuthorityIfRequired(
                    by: error,
                    generation: reconciliationGeneration,
                    identity: identity
                )
            }
            // Keep both the durable probe and queue admission guard until a
            // later canonical refresh resolves the unknown outcome.
        }
    }

    private func persistAcceptedFinalization(
        _ originalProbe: ScoringFinalizationProbe,
        acknowledgedMatchRevision: Int,
        operationGeneration: UInt,
        identity: ScoringQueueIdentityPartition
    ) async {
        var acknowledgedProbe = originalProbe
        acknowledgedProbe.acknowledgedMatchRevision = acknowledgedMatchRevision
        acknowledgedProbe.phase = .acknowledged
        acknowledgedProbe.updatedAt = now()
        acknowledgedProbe.lastErrorCode = nil
        do {
            try await saveProbe(acknowledgedProbe)
            // The response is now represented durably. Only at this point may
            // a canceled-but-running transport be considered drained and the
            // recovery path inspect/remove its probe.
            clearActiveTransport(ifOwnedBy: operationGeneration)
            guard operationIsCurrent(operationGeneration, identity: identity) else {
                return
            }
            state = ScoringFinalizationState(
                phase: .acknowledgedRefreshPending,
                matchId: acknowledgedProbe.matchId,
                blocker: nil,
                lastServerCode: nil
            )
            await reconcileDurableProbe(acknowledgedProbe)
        } catch {
            clearActiveTransport(ifOwnedBy: operationGeneration)
            guard operationIsCurrent(operationGeneration, identity: identity) else { return }
            // The accepted response is known in this process, but without a
            // durable acknowledgement marker it is unsafe to offer another
            // finalization. Retain the existing outcome-unknown probe and keep
            // the Match queue guard held for fail-closed recovery.
            state = blocked(.contract, matchId: originalProbe.matchId)
        }
    }

    private func performAcknowledgedProbeReconciliation(
        _ probe: ScoringFinalizationProbe
    ) async {
        guard !isSuspended,
              hasCurrentTransportAuthorization,
              let identity = activeIdentity,
              probe.identity == identity,
              probe.phase == .acknowledged
        else { return }
        guard let acknowledgedMatchRevision = probe.acknowledgedMatchRevision,
              acknowledgedMatchRevision >= probe.expectedMatchRevision
        else {
            state = blocked(.contract, matchId: probe.matchId)
            return
        }
        let reconciliationGeneration = generation
        if heldGuard == nil {
            do {
                let acquiredGuard = try await queue.acquireFinalizationGuard(matchId: probe.matchId)
                guard reconciliationGeneration == generation,
                      activeIdentity == identity,
                      !isSuspended
                else {
                    try? queue.releaseFinalizationGuard(acquiredGuard)
                    return
                }
                heldGuard = acquiredGuard
            } catch {
                guard reconciliationGeneration == generation,
                      activeIdentity == identity,
                      !isSuspended
                else { return }
                state = blocked(.queue, matchId: probe.matchId)
                return
            }
        }
        state = ScoringFinalizationState(
            phase: .acknowledgedRefreshPending,
            matchId: probe.matchId,
            blocker: nil,
            lastServerCode: nil
        )
        do {
            let canonical = try await canonicalRefresh(
                identity: identity,
                matchId: probe.matchId,
                minimumMatchRevision: acknowledgedMatchRevision
            )
            guard canonical.match.status == .completed else {
                // An accepted finalization is refresh-only until canonical
                // projection confirms Match Final. Never offer a second POST.
                return
            }
            try await removeProbe(probeId: probe.id)
            guard reconciliationGeneration == generation,
                  activeIdentity == identity,
                  !isSuspended
            else { return }
            hasKnownDurableProbe = false
            state = ScoringFinalizationState(
                phase: .matchFinal,
                matchId: probe.matchId,
                blocker: nil,
                lastServerCode: nil
            )
            releaseHeldGuard()
        } catch {
            guard reconciliationGeneration == generation,
                  activeIdentity == identity,
                  !isSuspended
            else { return }
            // Keep the durable accepted marker and queue admission guard. A
            // later foreground/manual refresh may confirm canonical finality.
            let accessBlocker = canonicalAccessBlocker(for: error)
            state = ScoringFinalizationState(
                phase: .acknowledgedRefreshPending,
                matchId: probe.matchId,
                blocker: accessBlocker ?? .canonicalUnavailable,
                lastServerCode: nil
            )
            if accessBlocker != nil {
                releaseHeldGuard()
                accessInvalidationHandler?()
            } else {
                revalidateAuthorityIfRequired(
                    by: error,
                    generation: reconciliationGeneration,
                    identity: identity
                )
            }
        }
    }

    private func canonicalRefresh(
        identity: ScoringQueueIdentityPartition,
        matchId: String,
        minimumMatchRevision: Int? = nil
    ) async throws -> MobileScoringCurrent {
        let refreshGeneration = generation
        guard activeIdentity == identity,
              hasCurrentTransportAuthorization,
              !isSuspended
        else {
            throw ScoringFinalizationCoordinatorError.inactiveIdentity
        }
        let credentials = try await credentials(for: identity)
        guard refreshGeneration == generation,
              activeIdentity == identity,
              hasCurrentTransportAuthorization,
              !isSuspended
        else { throw ScoringFinalizationCoordinatorError.inactiveIdentity }
        let response = try await api.scoringCurrent(
            accessToken: credentials.accessToken,
            certification: credentials.certification,
            matchID: matchId
        )
        guard refreshGeneration == generation,
              activeIdentity == identity,
              hasCurrentTransportAuthorization,
              !isSuspended
        else { throw ScoringFinalizationCoordinatorError.inactiveIdentity }
        guard response.isContractCompatible,
              let canonical = response.data.scoring,
              canonical.match.matchId == matchId,
              canonical.player.playerId == identity.playerId,
              minimumMatchRevision.map({ canonical.match.matchRevision >= $0 }) ?? true
        else { throw ScoringFinalizationCoordinatorError.invalidCanonicalContext }
        canonicalUpdateHandler?(response)
        return canonical
    }

    /// The unstructured child may be scheduled, then canceled while the
    /// MainActor processes a background/sign-out transition. Re-check the
    /// exact captured authority epoch and operation generation inside the
    /// child immediately before entering the API method so a stale child can
    /// never begin a finalization POST under a newer foreground grant.
    private func makeFinalizationTransportTask(
        request: MobileScoringFinalizeRequest,
        credentials: MobileReadCredentials,
        identity: ScoringQueueIdentityPartition,
        operationGeneration: UInt,
        authorization: NativeApplicationActivity.MutationTransportAuthorization
    ) -> Task<MobileScoringFinalizeResponse, Error> {
        Task { @MainActor [weak self] in
            guard let self else { throw CancellationError() }
            await self.beforeFinalizationTransport()
            try Task.checkCancellation()
            guard self.lifecycleAuthorization == authorization,
                  self.applicationActivity.permits(authorization),
                  self.operationIsCurrent(operationGeneration, identity: identity)
            else { throw CancellationError() }
            try Task.checkCancellation()
            return try await self.api.scoringFinalize(
                request: request,
                accessToken: credentials.accessToken,
                certification: credentials.certification
            )
        }
    }

    private func saveProbe(_ probe: ScoringFinalizationProbe) async throws {
        try await probeStore.save(probe)
        if activeIdentity == probe.identity {
            hasKnownDurableProbe = true
            if isRecoveringDurableProbe {
                queue.beginFinalizationRecoveryBarrier(blockLocalSaves: true)
            } else {
                queue.setFinalizationRecoveryLocalSaveBlocked(true)
            }
        }
    }

    private func removeProbe(probeId: String) async throws {
        try await probeStore.remove(probeId: probeId)
    }

    /// Probe inspection is device-local and does not require environment or
    /// credential authority. It may relax only local Save admission; replay
    /// remains fenced until the normal authorized recovery path completes.
    private func refreshLocalSaveFence(
        identity: ScoringQueueIdentityPartition,
        expectedGeneration: UInt
    ) async {
        guard activeTransportTask == nil else {
            hasKnownDurableProbe = true
            queue.beginFinalizationRecoveryBarrier(blockLocalSaves: true)
            return
        }
        do {
            let probe = try await probeStore.probe(for: identity)
            guard expectedGeneration == generation,
                  activeIdentity == identity,
                  !isSignOutPrepared,
                  activeTransportTask == nil
            else { return }
            guard let probe else {
                hasKnownDurableProbe = false
                queue.setFinalizationRecoveryLocalSaveBlocked(false)
                return
            }
            hasKnownDurableProbe = true
            queue.setFinalizationRecoveryLocalSaveBlocked(true)
            guard probe.isStructurallyCompatible else { return }
            guard probe.phase == .prepared else { return }

            // A prepared probe proves no POST task was created. Removing it is
            // a local cleanup and is safe even while health re-attestation is
            // unavailable; unknown/acknowledged probes stay fully fenced.
            try await removeProbe(probeId: probe.id)
            guard expectedGeneration == generation,
                  activeIdentity == identity,
                  !isSignOutPrepared
            else { return }
            hasKnownDurableProbe = false
            queue.setFinalizationRecoveryLocalSaveBlocked(false)
            state = ScoringFinalizationState(
                phase: .confirmationRequired,
                matchId: probe.matchId,
                blocker: nil,
                lastServerCode: nil
            )
        } catch {
            guard expectedGeneration == generation,
                  activeIdentity == identity,
                  !isSignOutPrepared
            else { return }
            hasKnownDurableProbe = true
            queue.setFinalizationRecoveryLocalSaveBlocked(true)
        }
    }

    private func completeRecoveryBarrierIfProbeResolved(
        identity: ScoringQueueIdentityPartition,
        expectedGeneration: UInt,
        reconciliationOwner: UUID? = nil
    ) async {
        guard expectedGeneration == generation,
              activeIdentity == identity,
              !isSuspended,
              activeTransportTask == nil,
              activeProbeReconciliationID == nil ||
                activeProbeReconciliationID == reconciliationOwner
        else { return }
        do {
            guard try await probeStore.probe(for: identity) == nil else {
                hasKnownDurableProbe = true
                return
            }
            guard expectedGeneration == generation,
                  activeIdentity == identity,
                  !isSuspended,
                  activeTransportTask == nil,
                  activeProbeReconciliationID == nil ||
                    activeProbeReconciliationID == reconciliationOwner
            else { return }
            hasKnownDurableProbe = false
            isRecoveringDurableProbe = false
            queue.completeFinalizationRecoveryBarrier()
        } catch {
            // Probe ownership is uncertain, so the queue fence remains closed.
        }
    }

    private func credentials(
        for identity: ScoringQueueIdentityPartition
    ) async throws -> MobileReadCredentials {
        let value = try await credentialProvider.credentials(
            expectedAuthUserID: identity.authUserId
        )
        guard value.authUserID == identity.authUserId else {
            throw MobileReadCredentialError.authIdentityChanged
        }
        guard activeIdentity == identity,
              hasCurrentTransportAuthorization,
              !isSuspended
        else {
            throw ScoringFinalizationCoordinatorError.inactiveIdentity
        }
        return value
    }

    private func operationIsCurrent(
        _ operationGeneration: UInt,
        identity: ScoringQueueIdentityPartition
    ) -> Bool {
        lifecycleIsCurrent(operationGeneration, identity: identity) && heldGuard != nil
    }

    private func lifecycleIsCurrent(
        _ operationGeneration: UInt,
        identity: ScoringQueueIdentityPartition
    ) -> Bool {
        operationGeneration == generation &&
            activeIdentity == identity &&
            hasCurrentTransportAuthorization &&
            !isSuspended &&
            !isSignOutPrepared
    }

    private func finishProbeReconciliation(
        id: UUID,
        startedGeneration: UInt
    ) {
        guard activeProbeReconciliationID == id else { return }
        activeProbeReconciliationID = nil
        if startedGeneration != generation {
            scheduleDurableProbeRecoveryIfNeeded()
        }
    }

    private func scheduleDurableProbeRecoveryIfNeeded() {
        guard activeTransportTask == nil,
              isRecoveringDurableProbe,
              activeProbeReconciliationID == nil,
              let identity = activeIdentity,
              !isSignOutPrepared
        else { return }
        let expectedGeneration = generation
        Task { @MainActor [weak self] in
            guard let self,
                  expectedGeneration == self.generation,
                  self.activeIdentity == identity,
                  self.activeTransportTask == nil,
                  self.activeProbeReconciliationID == nil,
                  !self.isSignOutPrepared
            else { return }
            if self.hasCurrentTransportAuthorization && !self.isSuspended {
                await self.refreshUnknownOutcome()
            } else {
                await self.refreshLocalSaveFence(
                    identity: identity,
                    expectedGeneration: expectedGeneration
                )
            }
        }
    }

    private func clearActiveTransport(ifOwnedBy operationGeneration: UInt) {
        guard activeTransportOperationGeneration == operationGeneration else { return }
        activeTransportTask = nil
        activeTransportOperationGeneration = nil
        scheduleDurableProbeRecoveryIfNeeded()
    }

    private func cancelActiveTransport() {
        activeTransportTask?.cancel()
        // Cancellation is advisory. Keep ownership until the task actually
        // terminates so an insensitive transport cannot race a fresh Save,
        // queue replay, or second finalization while its outcome is unknown.
    }

    private func isReadyToFinalize(_ canonical: MobileScoringCurrent) -> Bool {
        canonical.match.status == .inProgress &&
        canonical.permission.canScore &&
        canonical.permission.canFinalize &&
        !canonical.permission.readOnly &&
        canonical.progress.scorecardComplete
    }

    private func canonicalAccessBlocker(for error: any Error) -> ScoringFinalizationBlocker? {
        if error is MobileReadCredentialError {
            return .authentication
        }
        guard let apiError = error as? MobileAPIClientError else { return nil }
        switch apiError {
        case .missingBearer, .missingCertification:
            return .authentication
        case .unexpectedStatus(let status) where status == 401:
            return .authentication
        case .server(let code, _):
            switch code {
            case .unauthorized, .invalidToken, .invalidAuthRequest,
                 .authMethodUnavailable, .authCertificationFailed:
                return .authentication
            case .participantNotFound:
                return .authorization
            default:
                return nil
            }
        case .invalidURL, .invalidHTTPResponse, .transportUnavailable,
             .unexpectedStatus:
            return nil
        }
    }

    private func revalidateAuthorityIfRequired(
        by error: any Error,
        generation operationGeneration: UInt,
        identity: ScoringQueueIdentityPartition
    ) {
        guard lifecycleIsCurrent(operationGeneration, identity: identity),
              let apiError = error as? MobileAPIClientError,
              case .server(let code, _) = apiError,
              code == .mobileAPIUnavailable
        else { return }
        authorityRevalidationHandler?()
    }

    private func blocker(
        for code: MobileErrorCode?,
        canonical: MobileScoringCurrent
    ) -> ScoringFinalizationBlocker {
        switch code {
        case .unauthorized, .invalidToken, .authCertificationFailed:
            .authentication
        case .participantNotFound, .scoringNotAuthorized:
            .authorization
        case .scoringReadOnly:
            .readOnly
        case .matchAlreadyFinalized:
            .lifecycle
        case .revisionConflict, .finalizationNotReady, .matchNotFound:
            .notReady
        case .mobileAPIUnavailable, .scoringUnavailable, .internalError, nil:
            canonical.permission.readOnly ? .readOnly : .canonicalUnavailable
        default:
            .contract
        }
    }

    private func blocked(
        _ blocker: ScoringFinalizationBlocker,
        matchId: String?,
        code: MobileErrorCode? = nil
    ) -> ScoringFinalizationState {
        ScoringFinalizationState(
            phase: .blocked,
            matchId: matchId,
            blocker: blocker,
            lastServerCode: code
        )
    }

    private func releaseHeldGuard() {
        guard let heldGuard else { return }
        try? queue.releaseFinalizationGuard(heldGuard)
        self.heldGuard = nil
    }
}
