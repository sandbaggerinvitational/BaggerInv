import Foundation

enum ScoringQueueContract {
    static let queueSchemaVersion = 1
    static let apiContractVersion = "v1"
    static let maximumRecordBytes = 32 * 1_024
    static let maximumRequestBytes = 16 * 1_024
    static let maximumUnresolvedRecordsPerMatch = 36
    static let maximumUnresolvedRecordsPerIdentityTournament = 144
    static let maximumReceiptsPerIdentity = 50
}

struct ScoringQueueIdentityPartition: Codable, Equatable, Hashable, Sendable {
    let authUserId: String
    let playerId: String
    let tournamentId: String
}

struct ScoringQueuePartition: Codable, Equatable, Hashable, Sendable {
    let authUserId: String
    let playerId: String
    let tournamentId: String
    let matchId: String

    var identity: ScoringQueueIdentityPartition {
        ScoringQueueIdentityPartition(
            authUserId: authUserId,
            playerId: playerId,
            tournamentId: tournamentId
        )
    }
}

enum ScoringQueueFormat: String, Codable, CaseIterable, Equatable, Sendable {
    case bestBall = "BB"
    case scramble = "SC"
    case singles = "SI"
}

struct ScoringQueueGross: Codable, Equatable, Sendable {
    let teamOne: [Int]
    let teamTwo: [Int]
}

struct ScoringQueueIntent: Codable, Equatable, Sendable {
    let holeNumber: Int
    let teamOneGrossScores: [Int]
    let teamTwoGrossScores: [Int]

    var gross: ScoringQueueGross {
        ScoringQueueGross(teamOne: teamOneGrossScores, teamTwo: teamTwoGrossScores)
    }
}

/// Immutable scoring context plus the only concurrency metadata that a safe
/// authoritative handoff may advance. Original revisions are retained so a
/// metadata-only rebase never erases the record's diagnostic base.
struct ScoringQueueBase: Codable, Equatable, Sendable {
    var expectedMatchRevision: Int
    var expectedHoleRevision: Int
    let originalExpectedMatchRevision: Int
    let originalExpectedHoleRevision: Int
    let snapshotId: String?
    let snapshotRevision: Int
    let scoringFormat: ScoringQueueFormat
    let sideSlotCount: Int
    let officialGrossAtSave: ScoringQueueGross?
    var automaticRebaseCount: Int

    init(
        expectedMatchRevision: Int,
        expectedHoleRevision: Int,
        originalExpectedMatchRevision: Int? = nil,
        originalExpectedHoleRevision: Int? = nil,
        snapshotId: String?,
        snapshotRevision: Int,
        scoringFormat: ScoringQueueFormat,
        sideSlotCount: Int,
        officialGrossAtSave: ScoringQueueGross? = nil,
        automaticRebaseCount: Int = 0
    ) {
        self.expectedMatchRevision = expectedMatchRevision
        self.expectedHoleRevision = expectedHoleRevision
        self.originalExpectedMatchRevision = originalExpectedMatchRevision ?? expectedMatchRevision
        self.originalExpectedHoleRevision = originalExpectedHoleRevision ?? expectedHoleRevision
        self.snapshotId = snapshotId
        self.snapshotRevision = snapshotRevision
        self.scoringFormat = scoringFormat
        self.sideSlotCount = sideSlotCount
        self.officialGrossAtSave = officialGrossAtSave
        self.automaticRebaseCount = automaticRebaseCount
    }
}

enum ScoringQueueState: String, Codable, CaseIterable, Equatable, Sendable {
    case queued
    case syncing
    case retryable
    case acknowledged
    case conflict
    case actionRequired
    case quarantined
    case resolved
}

/// Fixed, non-sensitive reason codes. The queue state supplies the namespace
/// used by Step 1D, for example `retryable/environment`.
enum ScoringQueueStateReasonCode: String, Codable, CaseIterable, Equatable, Sendable {
    case authRefresh
    case environment
    case unknownOutcome
    case authentication
    case identity
    case identityChanged
    case identityMismatch
    case matchMissing
    case authorization
    case readOnly
    case finalized
    case staleTournament
    case stale
    case revision
    case invalidRecordOrContract
    case idempotencyConflict
    case unknownPermanentResponse
    case staleIdempotencyUncertain
    case rebaseLimit
    case queueHealth
}

enum ScoringQueueOutcomeCertainty: String, Codable, CaseIterable, Equatable, Sendable {
    case notSent
    case unknown
    case knownRejected
    case knownAccepted
}

struct ScoringQueueAttempt: Codable, Equatable, Sendable {
    var count: Int
    var lastAttemptAt: Date?
    var nextRetryAt: Date?
    var everSubmitted: Bool
    var outcomeCertainty: ScoringQueueOutcomeCertainty
    var syncLeaseId: String?
    var syncLeaseStartedAt: Date?
    var lastHttpStatus: Int?
    var lastErrorCode: String?

    static let unattempted = ScoringQueueAttempt(
        count: 0,
        lastAttemptAt: nil,
        nextRetryAt: nil,
        everSubmitted: false,
        outcomeCertainty: .notSent,
        syncLeaseId: nil,
        syncLeaseStartedAt: nil,
        lastHttpStatus: nil,
        lastErrorCode: nil
    )
}

struct ScoringQueueLastKnownServer: Codable, Equatable, Sendable {
    let matchRevision: Int
    let holeRevision: Int
    let permissionRevision: Int
    let refreshedAt: Date
}

/// Fresh canonical evidence required for the only automatic revision handoff
/// between two queued intents. Keeping this evidence explicit lets the SQLite
/// transaction re-check the complete Step 1D safety boundary instead of
/// trusting a caller-computed boolean.
struct ScoringQueueRevisionHandoffEvidence: Equatable, Sendable {
    let server: ScoringQueueLastKnownServer
    let matchId: String
    let playerId: String
    let snapshotId: String?
    let snapshotRevision: Int
    let matchStatus: MobileMatchStatus
    let canScore: Bool
    let readOnly: Bool
    let targetOfficialGross: ScoringQueueGross?
}

/// Fresh canonical evidence used by the explicit "Reapply My Score" path.
/// This is deliberately a storage input, not a capability: the coordinator
/// must still obtain it through an authenticated, no-store scoring refresh.
struct ScoringQueueConflictReapplyEvidence: Equatable, Sendable {
    let partition: ScoringQueuePartition
    let matchId: String
    let playerId: String
    let snapshotId: String?
    let snapshotRevision: Int
    let scoringFormat: ScoringQueueFormat
    let sideSlotCount: Int
    let matchStatus: MobileMatchStatus
    let canScore: Bool
    let readOnly: Bool
    let officialGross: ScoringQueueGross?
    let server: ScoringQueueLastKnownServer
}

struct ScoringQueueConflict: Codable, Equatable, Sendable {
    let officialGross: ScoringQueueGross?
    let currentMatchRevision: Int?
    let currentHoleRevision: Int?
    let currentPermissionRevision: Int?
    let refreshRequired: Bool
    let recordedAt: Date
}

struct ScoringQueueAcknowledgement: Codable, Equatable, Sendable {
    let accepted: Bool
    let idempotent: Bool
    let semanticNoop: Bool
    let canonicalMatchRevision: Int
    let canonicalHoleRevision: Int
    let responseAt: Date
    var refreshPending: Bool
}

enum ScoringQueueResolutionReason: String, Codable, CaseIterable, Equatable, Sendable {
    case keptOfficial
    case reappliedAsNewMutation
    case supersededBeforeTransmission
    case officialEquivalent
    case userAbandoned
}

struct ScoringQueueResolution: Codable, Equatable, Sendable {
    let reason: ScoringQueueResolutionReason
    let resolvedAt: Date
    let relatedLocalQueueRecordId: String?
}

enum ScoringQueueQuarantineReason: String, Codable, CaseIterable, Equatable, Sendable {
    case unsupportedSchema
    case missingPartition
    case invalidIntent
    case duplicateMutationId
    case invalidRevision
    case invalidState
    case recordTooLarge
    case invalidRecordOrContract
    case idempotencyConflict
    case unknownPermanentResponse
    case staleIdempotencyUncertain
    case unsafeMigration
    case identityIntegrity
    case corruptRecord
    case queueHealth
}

struct ScoringQueueRecord: Codable, Equatable, Sendable, Identifiable {
    let queueSchemaVersion: Int
    let apiContractVersion: String
    let localQueueRecordId: String
    let mutationId: String
    let partition: ScoringQueuePartition
    let intent: ScoringQueueIntent
    var base: ScoringQueueBase
    let sequence: Int64
    var state: ScoringQueueState
    var stateReasonCode: ScoringQueueStateReasonCode?
    var attempt: ScoringQueueAttempt
    var lastKnownServer: ScoringQueueLastKnownServer
    var conflict: ScoringQueueConflict?
    var acknowledgement: ScoringQueueAcknowledgement?
    var resolution: ScoringQueueResolution?
    var quarantineReason: ScoringQueueQuarantineReason?
    let originatingAppBuild: String
    let createdAt: Date
    var updatedAt: Date

    var id: String { localQueueRecordId }

    init(
        queueSchemaVersion: Int = ScoringQueueContract.queueSchemaVersion,
        apiContractVersion: String = ScoringQueueContract.apiContractVersion,
        localQueueRecordId: String,
        mutationId: String,
        partition: ScoringQueuePartition,
        intent: ScoringQueueIntent,
        base: ScoringQueueBase,
        sequence: Int64,
        state: ScoringQueueState = .queued,
        stateReasonCode: ScoringQueueStateReasonCode? = nil,
        attempt: ScoringQueueAttempt = .unattempted,
        lastKnownServer: ScoringQueueLastKnownServer,
        conflict: ScoringQueueConflict? = nil,
        acknowledgement: ScoringQueueAcknowledgement? = nil,
        resolution: ScoringQueueResolution? = nil,
        quarantineReason: ScoringQueueQuarantineReason? = nil,
        originatingAppBuild: String,
        createdAt: Date,
        updatedAt: Date? = nil
    ) {
        self.queueSchemaVersion = queueSchemaVersion
        self.apiContractVersion = apiContractVersion
        self.localQueueRecordId = localQueueRecordId
        self.mutationId = mutationId
        self.partition = partition
        self.intent = intent
        self.base = base
        self.sequence = sequence
        self.state = state
        self.stateReasonCode = stateReasonCode
        self.attempt = attempt
        self.lastKnownServer = lastKnownServer
        self.conflict = conflict
        self.acknowledgement = acknowledgement
        self.resolution = resolution
        self.quarantineReason = quarantineReason
        self.originatingAppBuild = originatingAppBuild
        self.createdAt = createdAt
        self.updatedAt = updatedAt ?? createdAt
    }
}

struct ScoringQueueSaveInput: Equatable, Sendable {
    let partition: ScoringQueuePartition
    let intent: ScoringQueueIntent
    let base: ScoringQueueBase
    let lastKnownServer: ScoringQueueLastKnownServer
    let originatingAppBuild: String

    func makeQueuedRecord(
        localQueueRecordId: String,
        mutationId: String,
        sequence: Int64,
        createdAt: Date
    ) -> ScoringQueueRecord {
        ScoringQueueRecord(
            localQueueRecordId: localQueueRecordId,
            mutationId: mutationId,
            partition: partition,
            intent: intent,
            base: base,
            sequence: sequence,
            lastKnownServer: lastKnownServer,
            originatingAppBuild: originatingAppBuild,
            createdAt: createdAt
        )
    }
}

enum ScoringQueueSaveResult: Equatable, Sendable {
    case inserted(ScoringQueueRecord)
    case reused(ScoringQueueRecord)
    case superseded(previous: ScoringQueueRecord, record: ScoringQueueRecord)
}

struct ScoringQueueConflictReapplyResult: Equatable, Sendable {
    let resolvedConflict: ScoringQueueRecord
    let replacement: ScoringQueueRecord
}

/// Persistence boundary for the durable queue. Implementations own time,
/// identifier, and sequence allocation so Save remains one atomic transaction.
protocol ScoringQueueRepository: Sendable {
    func save(_ input: ScoringQueueSaveInput) async throws -> ScoringQueueSaveResult
    func records(in partition: ScoringQueuePartition) async throws -> [ScoringQueueRecord]
    func records(for identity: ScoringQueueIdentityPartition) async throws -> [ScoringQueueRecord]
    func oldestUnresolved(in partition: ScoringQueuePartition) async throws -> ScoringQueueRecord?
    func unresolvedCount(in partition: ScoringQueuePartition) async throws -> Int
    func unresolvedCount(for identity: ScoringQueueIdentityPartition) async throws -> Int

    @discardableResult
    func replace(
        _ updated: ScoringQueueRecord,
        expecting current: ScoringQueueRecord
    ) async throws -> ScoringQueueRecord

    func acquireSyncLease(
        in partition: ScoringQueuePartition,
        leaseId: String,
        at date: Date
    ) async throws -> ScoringQueueRecord?

    func markTransportStarted(
        recordId: String,
        leaseId: String,
        at date: Date
    ) async throws -> ScoringQueueRecord

    /// Transactionally hands the accepted predecessor's canonical revision to
    /// the next queued record. Generic record replacement is intentionally not
    /// allowed to rewrite queued revision preconditions.
    func handOffCanonicalRevisions(
        recordId: String,
        afterAcknowledgedRecordId: String,
        evidence: ScoringQueueRevisionHandoffEvidence,
        at date: Date
    ) async throws -> ScoringQueueRecord

    /// Applies the only automatic conflict rebase through fresh canonical
    /// scoring evidence. Generic replacement cannot make a conflict replayable.
    func applyDeterministicSafeRebase(
        recordId: String,
        canonical: MobileScoringCurrent,
        at date: Date
    ) async throws -> ScoringQueueRecord

    /// Atomically preserves the reviewed conflict as resolved and creates a
    /// brand-new queued intent with a brand-new mutation ID. No network work
    /// occurs inside this persistence operation.
    func reapplyConflict(
        recordId: String,
        evidence: ScoringQueueConflictReapplyEvidence,
        originatingAppBuild: String
    ) async throws -> ScoringQueueConflictReapplyResult

    func recoverInterruptedSync(at date: Date) async throws -> [ScoringQueueRecord]
}

protocol ScoringQueueReceiptRepository: ScoringQueueRepository {
    func convertToReceipt(
        recordId: String,
        at date: Date,
        retention: TimeInterval
    ) async throws -> ScoringQueueReceipt

    func receipts(for identity: ScoringQueueIdentityPartition) async throws -> [ScoringQueueReceipt]

    @discardableResult
    func pruneExpiredReceipts(at date: Date) async throws -> Int

    func databaseByteCount() async throws -> Int64
}

/// Storage-level partition review is deliberately separate from the active
/// identity view. It can mark related hidden partitions without exposing one
/// participant's queued score intent to another participant's UI.
protocol ScoringQueuePartitionIsolationRepository: ScoringQueueRepository {
    @discardableResult
    func markRelatedPartitionsForReview(
        activeIdentity: ScoringQueueIdentityPartition,
        at date: Date
    ) async throws -> Int
}

enum ScoringQueueReceiptKind: String, Codable, Equatable, Sendable {
    case acknowledgement
    case resolution
}

/// A bounded, payload-free reliability receipt. It is local persistence, not
/// tournament score history and not a remote telemetry payload.
struct ScoringQueueReceipt: Codable, Equatable, Sendable, Identifiable {
    let localQueueRecordId: String
    let mutationId: String
    /// The compact receipt deliberately drops Auth UUID and Player ID from its
    /// encoded diagnostic projection. The protected SQLite index retains only
    /// the local partition columns required to retrieve/cap receipts safely.
    let matchId: String
    let holeNumber: Int
    let kind: ScoringQueueReceiptKind
    let accepted: Bool?
    let idempotent: Bool?
    let canonicalMatchRevision: Int?
    let canonicalHoleRevision: Int?
    let attemptCount: Int
    let createdAt: Date
    let acknowledgedAt: Date?
    let refreshedAt: Date?
    let resolutionReason: ScoringQueueResolutionReason?
    let originatingAppBuild: String
    let expiresAt: Date

    var id: String { localQueueRecordId }
}

enum ScoringQueueServerErrorCode: String, Codable, CaseIterable, Equatable, Sendable {
    case unauthorized = "UNAUTHORIZED"
    case invalidToken = "INVALID_TOKEN"
    case participantNotFound = "PARTICIPANT_NOT_FOUND"
    case invalidAuthRequest = "INVALID_AUTH_REQUEST"
    case authMethodUnavailable = "AUTH_METHOD_UNAVAILABLE"
    case authCertificationFailed = "AUTH_CERTIFICATION_FAILED"
    case mobileAPIUnavailable = "MOBILE_API_UNAVAILABLE"
    case scoringUnavailable = "SCORING_UNAVAILABLE"
    case matchNotFound = "MATCH_NOT_FOUND"
    case scoringNotAuthorized = "SCORING_NOT_AUTHORIZED"
    case scoringReadOnly = "SCORING_READ_ONLY"
    case invalidScoreInput = "INVALID_SCORE_INPUT"
    case revisionConflict = "REVISION_CONFLICT"
    case idempotencyConflict = "IDEMPOTENCY_CONFLICT"
    case finalizationNotReady = "FINALIZATION_NOT_READY"
    case matchAlreadyFinalized = "MATCH_ALREADY_FINALIZED"
    case internalError = "INTERNAL_ERROR"
}
