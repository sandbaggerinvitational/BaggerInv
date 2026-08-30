import Foundation
import SQLite3

struct SQLiteScoringQueueConfiguration: Equatable, Sendable {
    let databaseURL: URL
    let schemaVersion: Int
    let journalMode: String
    let synchronous: Int
    let foreignKeysEnabled: Bool
    let busyTimeoutMilliseconds: Int
    let isExcludedFromBackup: Bool
    let fileProtection: String?
}

/// `FileManager` itself has no `Sendable` conformance. The repository keeps
/// this value actor-confined after initialization, so the wrapper makes that
/// ownership boundary explicit without declaring Foundation's type globally
/// safe for unrelated concurrent use.
struct ScoringQueueFileManager: @unchecked Sendable {
    let value: FileManager

    init(_ value: FileManager) {
        self.value = value
    }

    static let `default` = Self(.default)
}

enum SQLiteScoringQueueRepositoryError: Error, Equatable {
    case storageUnavailable
    case databaseClosed
    case sqliteFailure(code: Int32, operation: String)
    case unsupportedSchema(Int)
    case unsafeMigration
    case databaseCorrupt
    case invalidRecord(ScoringQueueQuarantineReason)
    case invalidIdentifier
    case identifierCollision
    case matchQueueLimit
    case identityQueueLimit
    case reviewRequired
    case recordNotFound
    case concurrentModification
    case immutableRecordChanged
    case invalidStateTransition
    case leaseMismatch
    case receiptNotReady
    case queueHealth
}

private struct SQLiteIndexedQueueRow {
    let localID: String
    let mutationID: String
    let authUserID: String
    let playerID: String
    let tournamentID: String
    let matchID: String
    let sequence: Int64
    let state: String
    let holeNumber: Int
    let everSubmitted: Bool
    let outcomeCertainty: String
    let syncLeaseID: String?
    let createdAt: Double
    let updatedAt: Double
    let blob: Data
}

/// The durable scoring-intent store is deliberately separate from the
/// disposable Step 2B JSON read cache. One actor owns one SQLite connection;
/// network requests never hold a database transaction open.
actor SQLiteScoringQueueRepository: ScoringQueueReceiptRepository, ScoringQueuePartitionIsolationRepository {
    static let schemaVersion = ScoringQueueContract.queueSchemaVersion
    static let busyTimeoutMilliseconds = 5_000

    private let databaseURL: URL
    private let fileManager: ScoringQueueFileManager
    private let now: @Sendable () -> Date
    private let identifierGenerator: @Sendable () -> String
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder
    private var connection: SQLiteConnection?

    init(
        databaseURL: URL? = nil,
        fileManager: ScoringQueueFileManager = .default,
        now: @escaping @Sendable () -> Date = { Date() },
        identifierGenerator: @escaping @Sendable () -> String = {
            UUID().uuidString.lowercased()
        }
    ) throws {
        let fileManagerValue = fileManager.value
        let resolvedURL = try databaseURL ?? Self.liveDatabaseURL(fileManager: fileManagerValue)
        self.databaseURL = resolvedURL
        self.fileManager = fileManager
        self.now = now
        self.identifierGenerator = identifierGenerator

        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        encoder.dateEncodingStrategy = .secondsSince1970
        self.encoder = encoder

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .secondsSince1970
        self.decoder = decoder

        try Self.prepareProtectedDirectory(
            resolvedURL.deletingLastPathComponent(),
            fileManager: fileManagerValue
        )
        if databaseURL == nil {
            try Self.adoptLegacyVersionedStoreIfNeeded(
                stableURL: resolvedURL,
                fileManager: fileManagerValue
            )
        }
        let connection = try SQLiteConnection(
            path: resolvedURL.path,
            busyTimeoutMilliseconds: Self.busyTimeoutMilliseconds
        )
        do {
            // Protect a newly created or pre-existing database before any
            // schema inspection. Failure paths (unsupported schema, corrupt
            // store, unsafe migration) must not leave scoring intent with weak
            // attributes merely because initialization fails closed.
            try Self.applyProtection(
                databaseURL: resolvedURL,
                fileManager: fileManagerValue
            )
            try Self.configure(connection)
            try Self.migrate(connection)
            try Self.verifyIntegrity(connection)
            try Self.verifyVersionOneQueueIntegrity(connection)
            try Self.quarantineInvalidRows(
                connection,
                decoder: decoder,
                encoder: encoder,
                at: now()
            )
            try Self.verifyQueueHealthBounds(connection, decoder: decoder)
            try Self.repairSequenceHighWater(connection)
            self.connection = connection
            try Self.applyProtection(
                databaseURL: resolvedURL,
                fileManager: fileManagerValue
            )
        } catch {
            try? Self.applyProtection(
                databaseURL: resolvedURL,
                fileManager: fileManagerValue
            )
            connection.close()
            throw error
        }
    }

    static func liveDatabaseURL(fileManager: FileManager = .default) throws -> URL {
        guard let applicationSupport = fileManager.urls(
            for: .applicationSupportDirectory,
            in: .userDomainMask
        ).first else {
            throw SQLiteScoringQueueRepositoryError.storageUnavailable
        }
        return applicationSupport
            .appendingPathComponent("BaggerInv", isDirectory: true)
            .appendingPathComponent("ScoringQueue", isDirectory: true)
            .appendingPathComponent("scoring-queue.sqlite3", isDirectory: false)
    }

    func save(_ input: ScoringQueueSaveInput) throws -> ScoringQueueSaveResult {
        try validate(input)

        let connection = try openConnection()
        let result = try connection.immediateTransaction {
            let sameHole = try fetchRecords(
                matching: input.partition,
                holeNumber: input.intent.holeNumber,
                connection: connection
            ).filter(Self.isUnresolved)

            if let existing = sameHole.first(where: { $0.intent == input.intent }) {
                return ScoringQueueSaveResult.reused(existing)
            }

            guard !sameHole.contains(where: {
                $0.state == .conflict ||
                    $0.state == .actionRequired ||
                    $0.state == .quarantined
            }) else {
                throw SQLiteScoringQueueRepositoryError.reviewRequired
            }

            let supersededCandidate = sameHole
                .filter(Self.isProvablyNeverTransmitted)
                .max(by: { $0.sequence < $1.sequence })

            let matchCount = try unresolvedCount(
                in: input.partition,
                connection: connection
            ) - (supersededCandidate == nil ? 0 : 1)
            guard matchCount < ScoringQueueContract.maximumUnresolvedRecordsPerMatch else {
                throw SQLiteScoringQueueRepositoryError.matchQueueLimit
            }

            let identityCount = try unresolvedCount(
                for: input.partition.identity,
                connection: connection
            ) - (supersededCandidate == nil ? 0 : 1)
            guard identityCount < ScoringQueueContract.maximumUnresolvedRecordsPerIdentityTournament else {
                throw SQLiteScoringQueueRepositoryError.identityQueueLimit
            }

            let localRecordID = identifierGenerator()
            let mutationID = identifierGenerator()
            guard Self.isLowercaseUUID(localRecordID), Self.isValidMutationID(mutationID) else {
                throw SQLiteScoringQueueRepositoryError.invalidIdentifier
            }
            guard try !identifierExists(
                localRecordID: localRecordID,
                mutationID: mutationID,
                matchID: input.partition.matchId,
                connection: connection
            ) else {
                throw SQLiteScoringQueueRepositoryError.identifierCollision
            }

            let sequence = try allocateSequence(for: input.partition, connection: connection)
            let createdAt = now()
            let record = input.makeQueuedRecord(
                localQueueRecordId: localRecordID,
                mutationId: mutationID,
                sequence: sequence,
                createdAt: createdAt
            )
            try validate(record)

            var resolvedPrevious: ScoringQueueRecord?
            if var previous = supersededCandidate {
                let resolutionDate = max(createdAt, previous.updatedAt)
                previous.state = .resolved
                previous.stateReasonCode = nil
                previous.resolution = ScoringQueueResolution(
                    reason: .supersededBeforeTransmission,
                    resolvedAt: resolutionDate,
                    relatedLocalQueueRecordId: record.localQueueRecordId
                )
                previous.attempt.syncLeaseId = nil
                previous.attempt.syncLeaseStartedAt = nil
                previous.updatedAt = resolutionDate
                try write(previous, replacing: supersededCandidate, connection: connection)
                resolvedPrevious = previous
            }

            try insert(record, connection: connection)
            if let resolvedPrevious {
                return .superseded(previous: resolvedPrevious, record: record)
            }
            return .inserted(record)
        }
        applySidecarProtectionBestEffort()
        return result
    }

    func records(in partition: ScoringQueuePartition) throws -> [ScoringQueueRecord] {
        try validate(partition)
        return try fetchRecords(matching: partition, connection: openConnection())
    }

    func records(for identity: ScoringQueueIdentityPartition) throws -> [ScoringQueueRecord] {
        try validate(identity)
        let connection = try openConnection()
        let statement = try connection.prepare(
            """
            SELECT record_blob FROM queue_records
            WHERE auth_user_id = ? AND player_id = ? AND tournament_id = ?
            ORDER BY match_id, sequence
            """
        )
        try statement.bind(identity.authUserId, at: 1)
        try statement.bind(identity.playerId, at: 2)
        try statement.bind(identity.tournamentId, at: 3)
        return try decodeRows(statement)
    }

    func oldestUnresolved(in partition: ScoringQueuePartition) throws -> ScoringQueueRecord? {
        try validate(partition)
        return try oldestUnresolved(in: partition, connection: openConnection())
    }

    func unresolvedCount(in partition: ScoringQueuePartition) throws -> Int {
        try validate(partition)
        return try unresolvedCount(in: partition, connection: openConnection())
    }

    func unresolvedCount(for identity: ScoringQueueIdentityPartition) throws -> Int {
        try validate(identity)
        return try unresolvedCount(for: identity, connection: openConnection())
    }

    @discardableResult
    func replace(
        _ updated: ScoringQueueRecord,
        expecting current: ScoringQueueRecord
    ) throws -> ScoringQueueRecord {
        let connection = try openConnection()
        return try connection.immediateTransaction {
            guard let stored = try fetchRecord(
                id: current.localQueueRecordId,
                connection: connection
            ) else {
                throw SQLiteScoringQueueRepositoryError.recordNotFound
            }
            guard stored == current else {
                throw SQLiteScoringQueueRepositoryError.concurrentModification
            }
            try validateReplacement(updated, from: stored)
            try write(updated, replacing: stored, connection: connection)
            return updated
        }
    }

    func acquireSyncLease(
        in partition: ScoringQueuePartition,
        leaseId: String,
        at date: Date
    ) throws -> ScoringQueueRecord? {
        try validate(partition)
        guard Self.isValidLeaseID(leaseId) else {
            throw SQLiteScoringQueueRepositoryError.invalidIdentifier
        }
        let connection = try openConnection()
        return try connection.immediateTransaction {
            guard var record = try oldestUnresolved(in: partition, connection: connection),
                  record.state == .queued
            else { return nil }

            let current = record
            let leaseDate = max(date, record.updatedAt)
            record.state = .syncing
            record.stateReasonCode = nil
            record.attempt.nextRetryAt = nil
            record.attempt.syncLeaseId = leaseId
            record.attempt.syncLeaseStartedAt = leaseDate
            record.updatedAt = leaseDate
            try validateReplacement(
                record,
                from: current,
                allowsSyncLeaseAcquisition: true
            )
            try write(record, replacing: current, connection: connection)
            return record
        }
    }

    func markTransportStarted(
        recordId: String,
        leaseId: String,
        at date: Date
    ) throws -> ScoringQueueRecord {
        let connection = try openConnection()
        return try connection.immediateTransaction {
            guard var record = try fetchRecord(id: recordId, connection: connection) else {
                throw SQLiteScoringQueueRepositoryError.recordNotFound
            }
            guard record.state == .syncing,
                  record.attempt.syncLeaseId == leaseId
            else {
                throw SQLiteScoringQueueRepositoryError.leaseMismatch
            }
            let current = record
            let attemptDate = max(date, record.updatedAt)
            record.attempt.count += 1
            record.attempt.lastAttemptAt = attemptDate
            record.attempt.everSubmitted = true
            record.attempt.outcomeCertainty = .unknown
            record.updatedAt = attemptDate
            try validateReplacement(record, from: current)
            try write(record, replacing: current, connection: connection)
            return record
        }
    }

    func handOffCanonicalRevisions(
        recordId: String,
        afterAcknowledgedRecordId: String,
        evidence: ScoringQueueRevisionHandoffEvidence,
        at date: Date
    ) throws -> ScoringQueueRecord {
        try validate(server: evidence.server)
        let connection = try openConnection()
        return try connection.immediateTransaction {
            guard var current = try fetchRecord(id: recordId, connection: connection),
                  let predecessor = try fetchRecord(
                      id: afterAcknowledgedRecordId,
                      connection: connection
                  )
            else {
                throw SQLiteScoringQueueRepositoryError.invalidStateTransition
            }
            let hasUnresolvedDependencyBetween = try fetchRecords(
                matching: current.partition,
                connection: connection
            ).contains {
                $0.sequence > predecessor.sequence &&
                    $0.sequence < current.sequence &&
                    Self.isUnresolved($0)
            }
            let hasQuarantinedDependencyBetween = try hasQuarantineSequence(
                in: current.partition,
                after: predecessor.sequence,
                before: current.sequence,
                connection: connection
            )
            let isSameHoleCorrection = predecessor.intent.holeNumber == current.intent.holeNumber
            let canonicalTargetIsSafe = isSameHoleCorrection
                ? evidence.targetOfficialGross == predecessor.intent.gross
                : evidence.targetOfficialGross == nil ||
                    evidence.targetOfficialGross == current.base.officialGrossAtSave
            guard
                  current.state == .queued,
                  Self.isProvablyNeverTransmitted(current),
                  predecessor.state == .acknowledged,
                  let acknowledgement = predecessor.acknowledgement,
                  acknowledgement.accepted,
                  predecessor.partition == current.partition,
                  predecessor.sequence < current.sequence,
                  predecessor.base.snapshotId == current.base.snapshotId,
                  predecessor.base.snapshotRevision == current.base.snapshotRevision,
                  evidence.matchId == current.partition.matchId,
                  evidence.playerId == current.partition.playerId,
                  evidence.snapshotId == current.base.snapshotId,
                  evidence.snapshotRevision == current.base.snapshotRevision,
                  evidence.matchStatus == .inProgress,
                  evidence.canScore,
                  !evidence.readOnly,
                  evidence.server.matchRevision == acknowledgement.canonicalMatchRevision,
                  evidence.server.refreshedAt >= acknowledgement.responseAt,
                  evidence.server.refreshedAt >= predecessor.updatedAt,
                  evidence.server.refreshedAt >= current.lastKnownServer.refreshedAt,
                  evidence.server.matchRevision >= current.base.expectedMatchRevision,
                  evidence.server.holeRevision >= current.base.expectedHoleRevision,
                  evidence.server.permissionRevision >= current.lastKnownServer.permissionRevision,
                  !hasUnresolvedDependencyBetween,
                  !hasQuarantinedDependencyBetween,
                  canonicalTargetIsSafe,
                  !isSameHoleCorrection ||
                    evidence.server.holeRevision == acknowledgement.canonicalHoleRevision
            else {
                throw SQLiteScoringQueueRepositoryError.invalidStateTransition
            }

            let stored = current
            current.base.expectedMatchRevision = acknowledgement.canonicalMatchRevision
            current.base.expectedHoleRevision = evidence.server.holeRevision
            current.lastKnownServer = evidence.server
            current.updatedAt = max(date, max(current.updatedAt, evidence.server.refreshedAt))
            try validateReplacement(current, from: stored, allowsQueuedRevisionHandoff: true)
            try write(current, replacing: stored, connection: connection)
            return current
        }
    }

    func applyDeterministicSafeRebase(
        recordId: String,
        canonical: MobileScoringCurrent,
        at date: Date
    ) throws -> ScoringQueueRecord {
        let connection = try openConnection()
        return try connection.immediateTransaction {
            guard var current = try fetchRecord(id: recordId, connection: connection),
                  current.state == .conflict,
                  current.stateReasonCode == .revision,
                  let conflict = current.conflict,
                  conflict.refreshRequired,
                  current.attempt.syncLeaseId == nil,
                  current.attempt.syncLeaseStartedAt == nil,
                  current.base.automaticRebaseCount < 3,
                  canonical.match.matchId == current.partition.matchId,
                  canonical.player.playerId == current.partition.playerId,
                  canonical.snapshot.snapshotId == current.base.snapshotId,
                  canonical.snapshot.revision == current.base.snapshotRevision,
                  canonical.match.status == .inProgress,
                  canonical.permission.canScore,
                  !canonical.permission.readOnly
            else {
                throw SQLiteScoringQueueRepositoryError.invalidStateTransition
            }
            let officialScore = canonical.scores.first {
                $0.holeNumber == current.intent.holeNumber
            }
            let officialGross = officialScore.map {
                ScoringQueueGross(
                    teamOne: $0.gross.teamOne,
                    teamTwo: $0.gross.teamTwo
                )
            }
            let canonicalHoleRevision = officialScore?.revision ?? 0
            guard officialGross == nil || officialGross == current.base.officialGrossAtSave,
                  canonical.match.matchRevision >= current.base.expectedMatchRevision,
                  canonicalHoleRevision >= current.base.expectedHoleRevision,
                  canonical.match.permissionRevision >= current.lastKnownServer.permissionRevision,
                  date >= conflict.recordedAt,
                  date >= current.lastKnownServer.refreshedAt
            else {
                throw SQLiteScoringQueueRepositoryError.invalidStateTransition
            }

            let stored = current
            current.state = .queued
            current.stateReasonCode = nil
            current.base.expectedMatchRevision = canonical.match.matchRevision
            current.base.expectedHoleRevision = canonicalHoleRevision
            current.base.automaticRebaseCount += 1
            current.lastKnownServer = ScoringQueueLastKnownServer(
                matchRevision: canonical.match.matchRevision,
                holeRevision: canonicalHoleRevision,
                permissionRevision: canonical.match.permissionRevision,
                refreshedAt: date
            )
            current.conflict = nil
            current.attempt.nextRetryAt = nil
            current.updatedAt = max(date, current.updatedAt)
            try validateReplacement(
                current,
                from: stored,
                allowsDeterministicSafeRebase: true
            )
            try write(current, replacing: stored, connection: connection)
            return current
        }
    }

    func recoverInterruptedSync(at date: Date) throws -> [ScoringQueueRecord] {
        try recoverLeases(notOwnedBy: nil, at: date)
    }

    @discardableResult
    func markRelatedPartitionsForReview(
        activeIdentity: ScoringQueueIdentityPartition,
        at date: Date
    ) throws -> Int {
        try validate(activeIdentity)
        let connection = try openConnection()
        return try connection.immediateTransaction {
            let statement = try connection.prepare(
                """
                SELECT record_blob FROM queue_records
                WHERE (auth_user_id = ? OR player_id = ?)
                  AND NOT (auth_user_id = ? AND player_id = ? AND tournament_id = ?)
                ORDER BY auth_user_id, player_id, tournament_id, match_id, sequence
                """
            )
            try statement.bind(activeIdentity.authUserId, at: 1)
            try statement.bind(activeIdentity.playerId, at: 2)
            try statement.bind(activeIdentity.authUserId, at: 3)
            try statement.bind(activeIdentity.playerId, at: 4)
            try statement.bind(activeIdentity.tournamentId, at: 5)
            let related = try decodeRows(statement)
            var changed = 0
            for current in related where Self.isUnresolved(current) {
                guard current.state != .acknowledged,
                      current.state != .quarantined
                else { continue }
                var updated = current
                updated.state = .actionRequired
                updated.stateReasonCode = current.partition.authUserId == activeIdentity.authUserId &&
                    current.partition.playerId == activeIdentity.playerId
                    ? .staleTournament
                    : .identityChanged
                if current.state == .actionRequired,
                   current.stateReasonCode == updated.stateReasonCode,
                   current.attempt.nextRetryAt == nil,
                   current.attempt.syncLeaseId == nil,
                   current.attempt.syncLeaseStartedAt == nil
                {
                    continue
                }
                updated.attempt.nextRetryAt = nil
                updated.attempt.syncLeaseId = nil
                updated.attempt.syncLeaseStartedAt = nil
                updated.updatedAt = max(date, current.updatedAt)
                try validateReplacement(
                    updated,
                    from: current,
                    allowsActionRequiredPartitionReview: true
                )
                try write(updated, replacing: current, connection: connection)
                changed += 1
            }
            return changed
        }
    }

    /// A process owner may use `processID:leaseUUID` lease identifiers. Passing
    /// that process ID preserves leases owned by the live process and recovers
    /// every other persisted `syncing` row conservatively as unknown outcome.
    func recoverLeases(notOwnedBy processID: String?, at date: Date) throws -> [ScoringQueueRecord] {
        let connection = try openConnection()
        return try connection.immediateTransaction {
            let statement = try connection.prepare(
                "SELECT record_blob FROM queue_records WHERE state = 'syncing' ORDER BY created_at, sequence"
            )
            let syncing = try decodeRows(statement)
            var recovered: [ScoringQueueRecord] = []
            for current in syncing {
                if let processID,
                   let leaseID = current.attempt.syncLeaseId,
                   leaseID == processID || leaseID.hasPrefix(processID + ":")
                {
                    continue
                }
                var record = current
                let recoveryDate = max(date, current.updatedAt)
                record.state = .retryable
                record.stateReasonCode = .unknownOutcome
                record.attempt.everSubmitted = true
                record.attempt.outcomeCertainty = .unknown
                record.attempt.nextRetryAt = recoveryDate
                record.attempt.syncLeaseId = nil
                record.attempt.syncLeaseStartedAt = nil
                record.updatedAt = recoveryDate
                try validateReplacement(record, from: current)
                try write(record, replacing: current, connection: connection)
                recovered.append(record)
            }
            return recovered
        }
    }

    func convertToReceipt(
        recordId: String,
        at date: Date,
        retention: TimeInterval
    ) throws -> ScoringQueueReceipt {
        guard retention > 0, retention.isFinite else {
            throw SQLiteScoringQueueRepositoryError.receiptNotReady
        }
        let connection = try openConnection()
        let receipt = try connection.immediateTransaction {
            guard let record = try fetchRecord(id: recordId, connection: connection) else {
                throw SQLiteScoringQueueRepositoryError.recordNotFound
            }

            let kind: ScoringQueueReceiptKind
            switch record.state {
            case .acknowledged:
                guard let acknowledgement = record.acknowledgement,
                      acknowledgement.accepted,
                      !acknowledgement.refreshPending
                else { throw SQLiteScoringQueueRepositoryError.receiptNotReady }
                kind = .acknowledgement
            case .resolved:
                guard record.resolution != nil else {
                    throw SQLiteScoringQueueRepositoryError.receiptNotReady
                }
                kind = .resolution
            default:
                throw SQLiteScoringQueueRepositoryError.receiptNotReady
            }

            let acknowledgement = record.acknowledgement
            let receipt = ScoringQueueReceipt(
                localQueueRecordId: record.localQueueRecordId,
                mutationId: record.mutationId,
                matchId: record.partition.matchId,
                holeNumber: record.intent.holeNumber,
                kind: kind,
                accepted: acknowledgement?.accepted,
                idempotent: acknowledgement?.idempotent,
                canonicalMatchRevision: acknowledgement?.canonicalMatchRevision,
                canonicalHoleRevision: acknowledgement?.canonicalHoleRevision,
                attemptCount: record.attempt.count,
                createdAt: record.createdAt,
                acknowledgedAt: acknowledgement?.responseAt,
                refreshedAt: kind == .acknowledgement ? record.lastKnownServer.refreshedAt : nil,
                resolutionReason: record.resolution?.reason,
                originatingAppBuild: record.originatingAppBuild,
                expiresAt: date.addingTimeInterval(retention)
            )
            try insert(receipt, identity: record.partition.identity, connection: connection)
            try deleteRecord(id: record.localQueueRecordId, connection: connection)
            _ = try pruneExpiredReceipts(at: date, connection: connection)
            try capReceipts(for: record.partition.identity, connection: connection)
            return receipt
        }
        applySidecarProtectionBestEffort()
        return receipt
    }

    func receipts(for identity: ScoringQueueIdentityPartition) throws -> [ScoringQueueReceipt] {
        try validate(identity)
        let connection = try openConnection()
        return try connection.immediateTransaction {
            let readAt = now()
            _ = try pruneExpiredReceipts(at: readAt, connection: connection)
            let statement = try connection.prepare(
                """
                SELECT local_record_id, mutation_id, match_id, created_at, expires_at, receipt_blob
                FROM queue_receipts
                WHERE auth_user_id = ? AND player_id = ? AND tournament_id = ?
                ORDER BY created_at DESC, local_record_id DESC
                """
            )
            try statement.bind(identity.authUserId, at: 1)
            try statement.bind(identity.playerId, at: 2)
            try statement.bind(identity.tournamentId, at: 3)
            var values: [ScoringQueueReceipt] = []
            var invalidOrExpiredIDs: [String] = []
            while try statement.step() == .row {
                let localID = statement.text(at: 0)
                guard let receipt = try? decoder.decode(
                    ScoringQueueReceipt.self,
                    from: statement.blob(at: 5)
                ), receipt.localQueueRecordId == localID,
                   receipt.mutationId == statement.text(at: 1),
                   receipt.matchId == statement.text(at: 2),
                   receipt.createdAt.timeIntervalSince1970 == statement.double(at: 3),
                   receipt.expiresAt.timeIntervalSince1970 == statement.double(at: 4),
                   receipt.expiresAt > readAt
                else {
                    invalidOrExpiredIDs.append(localID)
                    continue
                }
                values.append(receipt)
            }
            for localID in invalidOrExpiredIDs {
                let delete = try connection.prepare(
                    "DELETE FROM queue_receipts WHERE local_record_id = ?"
                )
                try delete.bind(localID, at: 1)
                try delete.requireDone()
            }
            return values
        }
    }

    @discardableResult
    func pruneExpiredReceipts(at date: Date) throws -> Int {
        let connection = try openConnection()
        return try connection.immediateTransaction {
            try pruneExpiredReceipts(at: date, connection: connection)
        }
    }

    func databaseByteCount() throws -> Int64 {
        let urls = [
            databaseURL,
            URL(fileURLWithPath: databaseURL.path + "-wal"),
            URL(fileURLWithPath: databaseURL.path + "-shm"),
        ]
        return try urls.reduce(into: Int64(0)) { total, url in
            guard fileManager.value.fileExists(atPath: url.path) else { return }
            let attributes = try fileManager.value.attributesOfItem(atPath: url.path)
            total += (attributes[.size] as? NSNumber)?.int64Value ?? 0
        }
    }

    func configuration() throws -> SQLiteScoringQueueConfiguration {
        let connection = try openConnection()
        let directory = databaseURL.deletingLastPathComponent()
        let backup = try directory.resourceValues(forKeys: [.isExcludedFromBackupKey])
        let attributes = try? fileManager.value.attributesOfItem(atPath: databaseURL.path)
        let protection = (attributes?[.protectionKey] as? FileProtectionType)?.rawValue
            ?? attributes?[.protectionKey] as? String
        return SQLiteScoringQueueConfiguration(
            databaseURL: databaseURL,
            schemaVersion: try connection.scalarInt("PRAGMA user_version"),
            journalMode: try connection.scalarText("PRAGMA journal_mode"),
            synchronous: try connection.scalarInt("PRAGMA synchronous"),
            foreignKeysEnabled: try connection.scalarInt("PRAGMA foreign_keys") == 1,
            busyTimeoutMilliseconds: try connection.scalarInt("PRAGMA busy_timeout"),
            isExcludedFromBackup: backup.isExcludedFromBackup == true,
            fileProtection: protection
        )
    }

    func close() {
        connection?.close()
        connection = nil
    }
}

// MARK: - Queue transactions

private extension SQLiteScoringQueueRepository {
    func openConnection() throws -> SQLiteConnection {
        guard let connection else {
            throw SQLiteScoringQueueRepositoryError.databaseClosed
        }
        return connection
    }

    func insert(_ record: ScoringQueueRecord, connection: SQLiteConnection) throws {
        let blob = try encodeAndValidateSize(record)
        let statement = try connection.prepare(
            """
            INSERT INTO queue_records (
                local_record_id, mutation_id, auth_user_id, player_id,
                tournament_id, match_id, sequence, state, hole_number,
                ever_submitted, outcome_certainty, sync_lease_id,
                created_at, updated_at, record_blob
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """
        )
        try bind(record, blob: blob, to: statement)
        do {
            try statement.requireDone()
        } catch let error as SQLiteScoringQueueRepositoryError {
            if case .sqliteFailure(let code, _) = error,
               (code & 0xff) == SQLITE_CONSTRAINT
            {
                throw SQLiteScoringQueueRepositoryError.identifierCollision
            }
            throw error
        }
    }

    func write(
        _ record: ScoringQueueRecord,
        replacing current: ScoringQueueRecord?,
        connection: SQLiteConnection
    ) throws {
        let blob = try encodeAndValidateSize(record)
        let statement = try connection.prepare(
            """
            UPDATE queue_records SET
                mutation_id = ?, auth_user_id = ?, player_id = ?, tournament_id = ?,
                match_id = ?, sequence = ?, state = ?, hole_number = ?,
                ever_submitted = ?, outcome_certainty = ?, sync_lease_id = ?,
                created_at = ?, updated_at = ?, record_blob = ?
            WHERE local_record_id = ? AND updated_at = ? AND state = ?
            """
        )
        try statement.bind(record.mutationId, at: 1)
        try statement.bind(record.partition.authUserId, at: 2)
        try statement.bind(record.partition.playerId, at: 3)
        try statement.bind(record.partition.tournamentId, at: 4)
        try statement.bind(record.partition.matchId, at: 5)
        try statement.bind(record.sequence, at: 6)
        try statement.bind(record.state.rawValue, at: 7)
        try statement.bind(record.intent.holeNumber, at: 8)
        try statement.bind(record.attempt.everSubmitted ? 1 : 0, at: 9)
        try statement.bind(record.attempt.outcomeCertainty.rawValue, at: 10)
        try statement.bind(record.attempt.syncLeaseId, at: 11)
        try statement.bind(record.createdAt.timeIntervalSince1970, at: 12)
        try statement.bind(record.updatedAt.timeIntervalSince1970, at: 13)
        try statement.bind(blob, at: 14)
        try statement.bind(record.localQueueRecordId, at: 15)
        try statement.bind((current ?? record).updatedAt.timeIntervalSince1970, at: 16)
        try statement.bind((current ?? record).state.rawValue, at: 17)
        try statement.requireDone()
        guard connection.changes == 1 else {
            throw SQLiteScoringQueueRepositoryError.concurrentModification
        }
    }

    func bind(_ record: ScoringQueueRecord, blob: Data, to statement: SQLiteStatement) throws {
        try statement.bind(record.localQueueRecordId, at: 1)
        try statement.bind(record.mutationId, at: 2)
        try statement.bind(record.partition.authUserId, at: 3)
        try statement.bind(record.partition.playerId, at: 4)
        try statement.bind(record.partition.tournamentId, at: 5)
        try statement.bind(record.partition.matchId, at: 6)
        try statement.bind(record.sequence, at: 7)
        try statement.bind(record.state.rawValue, at: 8)
        try statement.bind(record.intent.holeNumber, at: 9)
        try statement.bind(record.attempt.everSubmitted ? 1 : 0, at: 10)
        try statement.bind(record.attempt.outcomeCertainty.rawValue, at: 11)
        try statement.bind(record.attempt.syncLeaseId, at: 12)
        try statement.bind(record.createdAt.timeIntervalSince1970, at: 13)
        try statement.bind(record.updatedAt.timeIntervalSince1970, at: 14)
        try statement.bind(blob, at: 15)
    }

    func fetchRecord(id: String, connection: SQLiteConnection) throws -> ScoringQueueRecord? {
        let statement = try connection.prepare(
            "SELECT record_blob FROM queue_records WHERE local_record_id = ?"
        )
        try statement.bind(id, at: 1)
        guard try statement.step() == .row else { return nil }
        let record = try decoder.decode(ScoringQueueRecord.self, from: statement.blob(at: 0))
        try validate(record)
        return record
    }

    func fetchRecords(
        matching partition: ScoringQueuePartition,
        holeNumber: Int? = nil,
        connection: SQLiteConnection
    ) throws -> [ScoringQueueRecord] {
        let holeClause = holeNumber == nil ? "" : " AND hole_number = ?"
        let statement = try connection.prepare(
            """
            SELECT record_blob FROM queue_records
            WHERE auth_user_id = ? AND player_id = ? AND tournament_id = ? AND match_id = ?
            \(holeClause)
            ORDER BY sequence
            """
        )
        try statement.bind(partition.authUserId, at: 1)
        try statement.bind(partition.playerId, at: 2)
        try statement.bind(partition.tournamentId, at: 3)
        try statement.bind(partition.matchId, at: 4)
        if let holeNumber { try statement.bind(holeNumber, at: 5) }
        return try decodeRows(statement)
    }

    func decodeRows(_ statement: SQLiteStatement) throws -> [ScoringQueueRecord] {
        var values: [ScoringQueueRecord] = []
        while try statement.step() == .row {
            let record = try decoder.decode(ScoringQueueRecord.self, from: statement.blob(at: 0))
            try validate(record)
            values.append(record)
        }
        return values
    }

    func oldestUnresolved(
        in partition: ScoringQueuePartition,
        connection: SQLiteConnection
    ) throws -> ScoringQueueRecord? {
        let active = try fetchRecords(matching: partition, connection: connection)
            .first(where: Self.isUnresolved)
        let quarantineSequence = try minimumQuarantineSequence(
            in: partition,
            connection: connection
        )
        if let quarantineSequence,
           active == nil || quarantineSequence <= active!.sequence
        {
            return nil
        }
        return active
    }

    func unresolvedCount(
        in partition: ScoringQueuePartition,
        connection: SQLiteConnection
    ) throws -> Int {
        let active = try fetchRecords(matching: partition, connection: connection)
            .filter(Self.isUnresolved).count
        let raw = try scalarCount(
            """
            SELECT COUNT(*) FROM queue_quarantine
            WHERE auth_user_id = ? AND player_id = ? AND tournament_id = ? AND match_id = ?
            """,
            values: [
                partition.authUserId,
                partition.playerId,
                partition.tournamentId,
                partition.matchId,
            ],
            connection: connection
        )
        return active + raw
    }

    func unresolvedCount(
        for identity: ScoringQueueIdentityPartition,
        connection: SQLiteConnection
    ) throws -> Int {
        let active = try fetchRecords(for: identity, connection: connection)
            .filter(Self.isUnresolved).count
        let raw = try scalarCount(
            """
            SELECT COUNT(*) FROM queue_quarantine
            WHERE auth_user_id = ? AND player_id = ? AND tournament_id = ?
            """,
            values: [identity.authUserId, identity.playerId, identity.tournamentId],
            connection: connection
        )
        return active + raw
    }

    func fetchRecords(
        for identity: ScoringQueueIdentityPartition,
        connection: SQLiteConnection
    ) throws -> [ScoringQueueRecord] {
        let statement = try connection.prepare(
            """
            SELECT record_blob FROM queue_records
            WHERE auth_user_id = ? AND player_id = ? AND tournament_id = ?
            ORDER BY match_id, sequence
            """
        )
        try statement.bind(identity.authUserId, at: 1)
        try statement.bind(identity.playerId, at: 2)
        try statement.bind(identity.tournamentId, at: 3)
        return try decodeRows(statement)
    }

    func scalarCount(
        _ sql: String,
        values: [String],
        connection: SQLiteConnection
    ) throws -> Int {
        let statement = try connection.prepare(sql)
        for (offset, value) in values.enumerated() {
            try statement.bind(value, at: Int32(offset + 1))
        }
        guard try statement.step() == .row else { return 0 }
        return Int(statement.int64(at: 0))
    }

    func minimumQuarantineSequence(
        in partition: ScoringQueuePartition,
        connection: SQLiteConnection
    ) throws -> Int64? {
        let statement = try connection.prepare(
            """
            SELECT MIN(sequence) FROM queue_quarantine
            WHERE auth_user_id = ? AND player_id = ? AND tournament_id = ? AND match_id = ?
            """
        )
        try statement.bind(partition.authUserId, at: 1)
        try statement.bind(partition.playerId, at: 2)
        try statement.bind(partition.tournamentId, at: 3)
        try statement.bind(partition.matchId, at: 4)
        guard try statement.step() == .row, !statement.isNull(at: 0) else { return nil }
        return statement.int64(at: 0)
    }

    func hasQuarantineSequence(
        in partition: ScoringQueuePartition,
        after lowerBound: Int64,
        before upperBound: Int64,
        connection: SQLiteConnection
    ) throws -> Bool {
        let statement = try connection.prepare(
            """
            SELECT 1 FROM queue_quarantine
            WHERE auth_user_id = ? AND player_id = ? AND tournament_id = ? AND match_id = ?
              AND sequence > ? AND sequence < ?
            LIMIT 1
            """
        )
        try statement.bind(partition.authUserId, at: 1)
        try statement.bind(partition.playerId, at: 2)
        try statement.bind(partition.tournamentId, at: 3)
        try statement.bind(partition.matchId, at: 4)
        try statement.bind(lowerBound, at: 5)
        try statement.bind(upperBound, at: 6)
        return try statement.step() == .row
    }

    func allocateSequence(
        for partition: ScoringQueuePartition,
        connection: SQLiteConnection
    ) throws -> Int64 {
        let select = try connection.prepare(
            """
            SELECT last_sequence FROM queue_sequence_high_water
            WHERE auth_user_id = ? AND player_id = ? AND tournament_id = ? AND match_id = ?
            """
        )
        try select.bind(partition.authUserId, at: 1)
        try select.bind(partition.playerId, at: 2)
        try select.bind(partition.tournamentId, at: 3)
        try select.bind(partition.matchId, at: 4)

        let next: Int64
        if try select.step() == .row {
            let last = select.int64(at: 0)
            guard last < Int64.max else {
                throw SQLiteScoringQueueRepositoryError.queueHealth
            }
            next = last + 1
            let update = try connection.prepare(
                """
                UPDATE queue_sequence_high_water SET last_sequence = ?
                WHERE auth_user_id = ? AND player_id = ? AND tournament_id = ? AND match_id = ?
                """
            )
            try update.bind(next, at: 1)
            try update.bind(partition.authUserId, at: 2)
            try update.bind(partition.playerId, at: 3)
            try update.bind(partition.tournamentId, at: 4)
            try update.bind(partition.matchId, at: 5)
            try update.requireDone()
        } else {
            next = 1
            let insert = try connection.prepare(
                """
                INSERT INTO queue_sequence_high_water (
                    auth_user_id, player_id, tournament_id, match_id, last_sequence
                ) VALUES (?, ?, ?, ?, 1)
                """
            )
            try insert.bind(partition.authUserId, at: 1)
            try insert.bind(partition.playerId, at: 2)
            try insert.bind(partition.tournamentId, at: 3)
            try insert.bind(partition.matchId, at: 4)
            try insert.requireDone()
        }
        return next
    }

    func identifierExists(
        localRecordID: String,
        mutationID: String,
        matchID: String,
        connection: SQLiteConnection
    ) throws -> Bool {
        let statement = try connection.prepare(
            """
            SELECT 1 FROM queue_records WHERE local_record_id = ? OR (match_id = ? AND mutation_id = ?)
            UNION ALL
            SELECT 1 FROM queue_receipts WHERE local_record_id = ? OR (match_id = ? AND mutation_id = ?)
            UNION ALL
            SELECT 1 FROM queue_quarantine WHERE source_local_record_id = ? OR (match_id = ? AND mutation_id = ?)
            LIMIT 1
            """
        )
        for offset in stride(from: 1, through: 7, by: 3) {
            try statement.bind(localRecordID, at: Int32(offset))
            try statement.bind(matchID, at: Int32(offset + 1))
            try statement.bind(mutationID, at: Int32(offset + 2))
        }
        return try statement.step() == .row
    }

    func insert(
        _ receipt: ScoringQueueReceipt,
        identity: ScoringQueueIdentityPartition,
        connection: SQLiteConnection
    ) throws {
        let blob = try encoder.encode(receipt)
        let statement = try connection.prepare(
            """
            INSERT INTO queue_receipts (
                local_record_id, mutation_id, auth_user_id, player_id,
                tournament_id, match_id, created_at, expires_at, receipt_blob
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """
        )
        try statement.bind(receipt.localQueueRecordId, at: 1)
        try statement.bind(receipt.mutationId, at: 2)
        try statement.bind(identity.authUserId, at: 3)
        try statement.bind(identity.playerId, at: 4)
        try statement.bind(identity.tournamentId, at: 5)
        try statement.bind(receipt.matchId, at: 6)
        try statement.bind(receipt.createdAt.timeIntervalSince1970, at: 7)
        try statement.bind(receipt.expiresAt.timeIntervalSince1970, at: 8)
        try statement.bind(blob, at: 9)
        try statement.requireDone()
    }

    func deleteRecord(id: String, connection: SQLiteConnection) throws {
        let statement = try connection.prepare(
            "DELETE FROM queue_records WHERE local_record_id = ?"
        )
        try statement.bind(id, at: 1)
        try statement.requireDone()
        guard connection.changes == 1 else {
            throw SQLiteScoringQueueRepositoryError.concurrentModification
        }
    }

    func pruneExpiredReceipts(at date: Date, connection: SQLiteConnection) throws -> Int {
        let statement = try connection.prepare(
            "DELETE FROM queue_receipts WHERE expires_at <= ?"
        )
        try statement.bind(date.timeIntervalSince1970, at: 1)
        try statement.requireDone()
        return connection.changes
    }

    func capReceipts(
        for identity: ScoringQueueIdentityPartition,
        connection: SQLiteConnection
    ) throws {
        let statement = try connection.prepare(
            """
            DELETE FROM queue_receipts WHERE local_record_id IN (
                SELECT local_record_id FROM queue_receipts
                WHERE auth_user_id = ? AND player_id = ? AND tournament_id = ?
                ORDER BY created_at DESC, local_record_id DESC
                LIMIT -1 OFFSET ?
            )
            """
        )
        try statement.bind(identity.authUserId, at: 1)
        try statement.bind(identity.playerId, at: 2)
        try statement.bind(identity.tournamentId, at: 3)
        try statement.bind(ScoringQueueContract.maximumReceiptsPerIdentity, at: 4)
        try statement.requireDone()
    }
}

// MARK: - Validation

private extension SQLiteScoringQueueRepository {
    func validate(_ input: ScoringQueueSaveInput) throws {
        guard ScoringQueueValidator.validate(input).isValid else {
            throw SQLiteScoringQueueRepositoryError.invalidRecord(.invalidRecordOrContract)
        }
        try validate(input.partition)
        try validate(intent: input.intent, base: input.base)
        try validate(base: input.base)
        try validate(server: input.lastKnownServer)
        guard !input.originatingAppBuild.isEmpty, input.originatingAppBuild.utf8.count <= 128 else {
            throw SQLiteScoringQueueRepositoryError.invalidRecord(.invalidRecordOrContract)
        }
    }

    func validate(_ partition: ScoringQueuePartition) throws {
        try validate(partition.identity)
        guard Self.isValidMutationID(partition.matchId) else {
            throw SQLiteScoringQueueRepositoryError.invalidRecord(.missingPartition)
        }
    }

    func validate(_ identity: ScoringQueueIdentityPartition) throws {
        guard Self.isLowercaseUUID(identity.authUserId),
              Self.isBoundedIdentifier(identity.playerId),
              Self.isBoundedIdentifier(identity.tournamentId)
        else {
            throw SQLiteScoringQueueRepositoryError.invalidRecord(.missingPartition)
        }
    }

    func validate(_ record: ScoringQueueRecord) throws {
        guard record.attempt.count < Int.max else {
            throw SQLiteScoringQueueRepositoryError.invalidRecord(.queueHealth)
        }
        guard ScoringQueueValidator.validate(record).isValid else {
            throw SQLiteScoringQueueRepositoryError.invalidRecord(.invalidRecordOrContract)
        }
        guard record.queueSchemaVersion == Self.schemaVersion else {
            throw SQLiteScoringQueueRepositoryError.invalidRecord(.unsupportedSchema)
        }
        guard record.apiContractVersion == ScoringQueueContract.apiContractVersion else {
            throw SQLiteScoringQueueRepositoryError.invalidRecord(.invalidRecordOrContract)
        }
        guard Self.isLowercaseUUID(record.localQueueRecordId),
              Self.isValidMutationID(record.mutationId)
        else {
            throw SQLiteScoringQueueRepositoryError.invalidRecord(.invalidRecordOrContract)
        }
        try validate(record.partition)
        try validate(intent: record.intent, base: record.base)
        try validate(base: record.base)
        try validate(server: record.lastKnownServer)
        guard record.sequence > 0,
              record.attempt.count >= 0,
              record.createdAt.timeIntervalSinceReferenceDate.isFinite,
              record.updatedAt.timeIntervalSinceReferenceDate.isFinite,
              record.updatedAt >= record.createdAt,
              !record.originatingAppBuild.isEmpty,
              record.originatingAppBuild.utf8.count <= 128
        else {
            throw SQLiteScoringQueueRepositoryError.invalidRecord(.invalidRecordOrContract)
        }
        if let lastAttemptAt = record.attempt.lastAttemptAt,
           !lastAttemptAt.timeIntervalSinceReferenceDate.isFinite
        {
            throw SQLiteScoringQueueRepositoryError.invalidRecord(.invalidRecordOrContract)
        }
        if let nextRetryAt = record.attempt.nextRetryAt,
           !nextRetryAt.timeIntervalSinceReferenceDate.isFinite
        {
            throw SQLiteScoringQueueRepositoryError.invalidRecord(.invalidRecordOrContract)
        }
        if record.state == .syncing {
            guard let leaseID = record.attempt.syncLeaseId,
                  Self.isValidLeaseID(leaseID),
                  record.attempt.syncLeaseStartedAt != nil
            else {
                throw SQLiteScoringQueueRepositoryError.invalidRecord(.invalidState)
            }
        } else if record.attempt.syncLeaseId != nil || record.attempt.syncLeaseStartedAt != nil {
            throw SQLiteScoringQueueRepositoryError.invalidRecord(.invalidState)
        }
        if record.state == .acknowledged {
            guard record.acknowledgement?.accepted == true,
                  Self.acknowledgementRefreshProofIsCoherent(record)
            else {
                throw SQLiteScoringQueueRepositoryError.invalidRecord(.invalidState)
            }
        }
        if record.state == .resolved, record.resolution == nil {
            throw SQLiteScoringQueueRepositoryError.invalidRecord(.invalidState)
        }
        if record.state == .quarantined, record.quarantineReason == nil {
            throw SQLiteScoringQueueRepositoryError.invalidRecord(.invalidState)
        }
        _ = try encodeAndValidateSize(record)
    }

    func validate(intent: ScoringQueueIntent, base: ScoringQueueBase) throws {
        guard (1...18).contains(intent.holeNumber),
              intent.teamOneGrossScores.count == base.sideSlotCount,
              intent.teamTwoGrossScores.count == base.sideSlotCount,
              intent.teamOneGrossScores.allSatisfy({ (1...20).contains($0) }),
              intent.teamTwoGrossScores.allSatisfy({ (1...20).contains($0) })
        else {
            throw SQLiteScoringQueueRepositoryError.invalidRecord(.invalidIntent)
        }
    }

    func validate(base: ScoringQueueBase) throws {
        let expectedSlots = base.scoringFormat == .bestBall ? 2 : 1
        guard base.sideSlotCount == expectedSlots,
              base.expectedMatchRevision >= 0,
              base.expectedHoleRevision >= 0,
              base.originalExpectedMatchRevision >= 0,
              base.originalExpectedHoleRevision >= 0,
              base.snapshotRevision >= 0,
              (0...3).contains(base.automaticRebaseCount)
        else {
            throw SQLiteScoringQueueRepositoryError.invalidRecord(.invalidRevision)
        }
        if let official = base.officialGrossAtSave {
            guard official.teamOne.count == expectedSlots,
                  official.teamTwo.count == expectedSlots,
                  official.teamOne.allSatisfy({ (1...20).contains($0) }),
                  official.teamTwo.allSatisfy({ (1...20).contains($0) })
            else {
                throw SQLiteScoringQueueRepositoryError.invalidRecord(.invalidIntent)
            }
        }
    }

    func validate(server: ScoringQueueLastKnownServer) throws {
        guard server.matchRevision >= 0,
              server.holeRevision >= 0,
              server.permissionRevision >= 0,
              server.refreshedAt.timeIntervalSinceReferenceDate.isFinite
        else {
            throw SQLiteScoringQueueRepositoryError.invalidRecord(.invalidRevision)
        }
    }

    func validateReplacement(
        _ updated: ScoringQueueRecord,
        from current: ScoringQueueRecord,
        allowsQueuedRevisionHandoff: Bool = false,
        allowsActionRequiredPartitionReview: Bool = false,
        allowsSyncLeaseAcquisition: Bool = false,
        allowsDeterministicSafeRebase: Bool = false
    ) throws {
        try validate(updated)
        guard Self.replacementPreservesImmutableEnvelope(updated, from: current) else {
            throw SQLiteScoringQueueRepositoryError.immutableRecordChanged
        }
        guard Self.replacementInvariantAllows(
            updated,
            from: current,
            allowsQueuedRevisionHandoff: allowsQueuedRevisionHandoff,
            allowsActionRequiredPartitionReview: allowsActionRequiredPartitionReview,
            allowsSyncLeaseAcquisition: allowsSyncLeaseAcquisition,
            allowsDeterministicSafeRebase: allowsDeterministicSafeRebase
        ) else {
            throw SQLiteScoringQueueRepositoryError.invalidStateTransition
        }
    }

    static func replacementPreservesImmutableEnvelope(
        _ updated: ScoringQueueRecord,
        from current: ScoringQueueRecord
    ) -> Bool {
        updated.localQueueRecordId == current.localQueueRecordId &&
            updated.mutationId == current.mutationId &&
            updated.partition == current.partition &&
            updated.intent == current.intent &&
            updated.sequence == current.sequence &&
            updated.queueSchemaVersion == current.queueSchemaVersion &&
            updated.apiContractVersion == current.apiContractVersion &&
            updated.base.originalExpectedMatchRevision == current.base.originalExpectedMatchRevision &&
            updated.base.originalExpectedHoleRevision == current.base.originalExpectedHoleRevision &&
            updated.base.snapshotId == current.base.snapshotId &&
            updated.base.snapshotRevision == current.base.snapshotRevision &&
            updated.base.scoringFormat == current.base.scoringFormat &&
            updated.base.sideSlotCount == current.base.sideSlotCount &&
            updated.base.officialGrossAtSave == current.base.officialGrossAtSave &&
            updated.originatingAppBuild == current.originatingAppBuild &&
            updated.createdAt == current.createdAt
    }

    static func replacementInvariantAllows(
        _ updated: ScoringQueueRecord,
        from current: ScoringQueueRecord,
        allowsQueuedRevisionHandoff: Bool = false,
        allowsActionRequiredPartitionReview: Bool = false,
        allowsSyncLeaseAcquisition: Bool = false,
        allowsDeterministicSafeRebase: Bool = false
    ) -> Bool {
        let baseChangeIsAudited = updated.base == current.base ||
            (allowsQueuedRevisionHandoff && current.state == .queued && updated.state == .queued) ||
            (allowsDeterministicSafeRebase && isDeterministicSafeRebase(from: current, to: updated))
        return replacementPreservesImmutableEnvelope(updated, from: current) &&
            baseChangeIsAudited &&
            isAllowedTransition(
                from: current,
                to: updated,
                allowsQueuedRevisionHandoff: allowsQueuedRevisionHandoff,
                allowsActionRequiredPartitionReview: allowsActionRequiredPartitionReview,
                allowsSyncLeaseAcquisition: allowsSyncLeaseAcquisition,
                allowsDeterministicSafeRebase: allowsDeterministicSafeRebase
            ) &&
            updated.attempt.count >= current.attempt.count &&
            (!current.attempt.everSubmitted || updated.attempt.everSubmitted) &&
            updated.base.automaticRebaseCount >= current.base.automaticRebaseCount &&
            updated.updatedAt >= current.updatedAt
    }

    func encodeAndValidateSize(_ record: ScoringQueueRecord) throws -> Data {
        let data = try encoder.encode(record)
        guard data.count <= ScoringQueueContract.maximumRecordBytes else {
            throw SQLiteScoringQueueRepositoryError.invalidRecord(.recordTooLarge)
        }
        return data
    }

    static func isUnresolved(_ record: ScoringQueueRecord) -> Bool {
        switch record.state {
        case .resolved:
            return false
        case .acknowledged:
            return record.acknowledgement?.refreshPending != false
        case .queued, .syncing, .retryable, .conflict, .actionRequired, .quarantined:
            return true
        }
    }

    static func isProvablyNeverTransmitted(_ record: ScoringQueueRecord) -> Bool {
        record.state == .queued &&
            !record.attempt.everSubmitted &&
            record.attempt.outcomeCertainty == .notSent &&
            record.attempt.syncLeaseId == nil
    }

    static func acknowledgementRefreshProofIsCoherent(
        _ record: ScoringQueueRecord
    ) -> Bool {
        guard record.state == .acknowledged,
              let acknowledgement = record.acknowledgement
        else { return true }
        guard !acknowledgement.refreshPending else { return true }
        return record.lastKnownServer.matchRevision >= acknowledgement.canonicalMatchRevision &&
            record.lastKnownServer.holeRevision >= acknowledgement.canonicalHoleRevision &&
            record.lastKnownServer.refreshedAt >= acknowledgement.responseAt
    }

    static func isAllowedTransition(
        from current: ScoringQueueRecord,
        to updated: ScoringQueueRecord,
        allowsQueuedRevisionHandoff: Bool = false,
        allowsActionRequiredPartitionReview: Bool = false,
        allowsSyncLeaseAcquisition: Bool = false,
        allowsDeterministicSafeRebase: Bool = false
    ) -> Bool {
        if current.state == updated.state {
            return isAllowedSameStateReplacement(
                from: current,
                to: updated,
                allowsQueuedRevisionHandoff: allowsQueuedRevisionHandoff,
                allowsActionRequiredPartitionReview: allowsActionRequiredPartitionReview
            )
        }
        if allowsDeterministicSafeRebase,
           isDeterministicSafeRebase(from: current, to: updated)
        {
            return true
        }
        switch current.state {
        case .queued:
            if updated.state == .syncing {
                return allowsSyncLeaseAcquisition &&
                    isDedicatedSyncLeaseAcquisition(from: current, to: updated)
            }
            return [.actionRequired, .conflict, .quarantined, .resolved].contains(updated.state)
        case .syncing:
            return [.acknowledged, .retryable, .conflict, .actionRequired, .quarantined].contains(updated.state)
        case .retryable:
            return [.queued, .acknowledged, .conflict, .actionRequired, .quarantined, .resolved].contains(updated.state)
        case .acknowledged:
            return false
        case .conflict:
            return [.actionRequired, .quarantined, .resolved].contains(updated.state)
        case .actionRequired:
            return [.conflict, .resolved, .quarantined].contains(updated.state)
        case .quarantined:
            return updated.state == .resolved
        case .resolved:
            return false
        }
    }

    static func isDedicatedSyncLeaseAcquisition(
        from current: ScoringQueueRecord,
        to updated: ScoringQueueRecord
    ) -> Bool {
        updated.base == current.base &&
            updated.stateReasonCode == nil &&
            updated.attempt.count == current.attempt.count &&
            updated.attempt.lastAttemptAt == current.attempt.lastAttemptAt &&
            updated.attempt.nextRetryAt == nil &&
            updated.attempt.everSubmitted == current.attempt.everSubmitted &&
            updated.attempt.outcomeCertainty == current.attempt.outcomeCertainty &&
            updated.attempt.syncLeaseId != nil &&
            updated.attempt.syncLeaseStartedAt == updated.updatedAt &&
            updated.attempt.lastHttpStatus == current.attempt.lastHttpStatus &&
            updated.attempt.lastErrorCode == current.attempt.lastErrorCode &&
            updated.lastKnownServer == current.lastKnownServer &&
            updated.conflict == current.conflict &&
            updated.acknowledgement == current.acknowledgement &&
            updated.resolution == current.resolution &&
            updated.quarantineReason == current.quarantineReason
    }

    static func isAllowedSameStateReplacement(
        from current: ScoringQueueRecord,
        to updated: ScoringQueueRecord,
        allowsQueuedRevisionHandoff: Bool,
        allowsActionRequiredPartitionReview: Bool
    ) -> Bool {
        switch current.state {
        case .queued:
            if allowsQueuedRevisionHandoff {
                return updated.base.automaticRebaseCount == current.base.automaticRebaseCount &&
                    updated.base.expectedMatchRevision == updated.lastKnownServer.matchRevision &&
                    updated.base.expectedHoleRevision == updated.lastKnownServer.holeRevision &&
                    updated.lastKnownServer.refreshedAt >= current.lastKnownServer.refreshedAt &&
                    updated.lastKnownServer.permissionRevision >= current.lastKnownServer.permissionRevision &&
                    updated.stateReasonCode == current.stateReasonCode &&
                    updated.attempt == current.attempt &&
                    updated.conflict == current.conflict &&
                    updated.acknowledgement == current.acknowledgement &&
                    updated.resolution == current.resolution &&
                    updated.quarantineReason == current.quarantineReason
            }
            return updated.base == current.base &&
                updated.stateReasonCode == current.stateReasonCode &&
                isRetryScheduleOnly(from: current, to: updated) &&
                updated.lastKnownServer == current.lastKnownServer &&
                updated.conflict == current.conflict &&
                updated.acknowledgement == current.acknowledgement &&
                updated.resolution == current.resolution &&
                updated.quarantineReason == current.quarantineReason

        case .syncing:
            return updated.base == current.base &&
                updated.stateReasonCode == current.stateReasonCode &&
                updated.lastKnownServer == current.lastKnownServer &&
                updated.conflict == current.conflict &&
                updated.acknowledgement == current.acknowledgement &&
                updated.resolution == current.resolution &&
                updated.quarantineReason == current.quarantineReason &&
                updated.attempt.count == current.attempt.count + 1 &&
                updated.attempt.lastAttemptAt != nil &&
                updated.attempt.lastAttemptAt! == updated.updatedAt &&
                updated.attempt.lastAttemptAt! >= (current.attempt.lastAttemptAt ?? current.updatedAt) &&
                updated.attempt.nextRetryAt == current.attempt.nextRetryAt &&
                updated.attempt.everSubmitted &&
                updated.attempt.outcomeCertainty == .unknown &&
                updated.attempt.syncLeaseId == current.attempt.syncLeaseId &&
                updated.attempt.syncLeaseStartedAt == current.attempt.syncLeaseStartedAt &&
                updated.attempt.lastHttpStatus == current.attempt.lastHttpStatus &&
                updated.attempt.lastErrorCode == current.attempt.lastErrorCode

        case .acknowledged:
            let retrySchedule = updated.base == current.base &&
                updated.stateReasonCode == current.stateReasonCode &&
                isRetryScheduleOnly(from: current, to: updated) &&
                updated.lastKnownServer == current.lastKnownServer &&
                updated.conflict == current.conflict &&
                updated.acknowledgement == current.acknowledgement &&
                updated.resolution == current.resolution &&
                updated.quarantineReason == current.quarantineReason
            let canonicalRefresh = updated.base == current.base &&
                updated.stateReasonCode == current.stateReasonCode &&
                updated.attempt.count == current.attempt.count &&
                updated.attempt.lastAttemptAt == current.attempt.lastAttemptAt &&
                updated.attempt.everSubmitted == current.attempt.everSubmitted &&
                updated.attempt.outcomeCertainty == current.attempt.outcomeCertainty &&
                updated.attempt.syncLeaseId == current.attempt.syncLeaseId &&
                updated.attempt.syncLeaseStartedAt == current.attempt.syncLeaseStartedAt &&
                updated.attempt.lastHttpStatus == current.attempt.lastHttpStatus &&
                updated.attempt.lastErrorCode == current.attempt.lastErrorCode &&
                updated.attempt.nextRetryAt == nil &&
                current.acknowledgement?.refreshPending == true &&
                updated.acknowledgement?.refreshPending == false &&
                immutableAcknowledgementFactsMatch(current, updated) &&
                updated.lastKnownServer.matchRevision >= (updated.acknowledgement?.canonicalMatchRevision ?? Int.max) &&
                updated.lastKnownServer.holeRevision >= (updated.acknowledgement?.canonicalHoleRevision ?? Int.max) &&
                updated.lastKnownServer.refreshedAt >= (updated.acknowledgement?.responseAt ?? .distantFuture) &&
                updated.lastKnownServer.refreshedAt >= current.lastKnownServer.refreshedAt &&
                updated.conflict == current.conflict &&
                updated.resolution == current.resolution &&
                updated.quarantineReason == current.quarantineReason
            return retrySchedule || canonicalRefresh

        case .conflict:
            let retrySchedule = updated.base == current.base &&
                updated.stateReasonCode == current.stateReasonCode &&
                isRetryScheduleOnly(from: current, to: updated) &&
                updated.lastKnownServer == current.lastKnownServer &&
                updated.conflict == current.conflict &&
                updated.acknowledgement == current.acknowledgement &&
                updated.resolution == current.resolution &&
                updated.quarantineReason == current.quarantineReason
            let canonicalReview = updated.base == current.base &&
                updated.stateReasonCode == current.stateReasonCode &&
                updated.attempt.count == current.attempt.count &&
                updated.attempt.lastAttemptAt == current.attempt.lastAttemptAt &&
                updated.attempt.everSubmitted == current.attempt.everSubmitted &&
                updated.attempt.outcomeCertainty == current.attempt.outcomeCertainty &&
                updated.attempt.syncLeaseId == current.attempt.syncLeaseId &&
                updated.attempt.syncLeaseStartedAt == current.attempt.syncLeaseStartedAt &&
                updated.attempt.lastHttpStatus == current.attempt.lastHttpStatus &&
                updated.attempt.lastErrorCode == current.attempt.lastErrorCode &&
                updated.attempt.nextRetryAt == nil &&
                current.conflict?.refreshRequired == true &&
                updated.conflict?.refreshRequired == false &&
                (updated.conflict?.recordedAt ?? .distantPast) >=
                    (current.conflict?.recordedAt ?? .distantPast) &&
                updated.conflict?.currentMatchRevision == updated.lastKnownServer.matchRevision &&
                updated.conflict?.currentHoleRevision == updated.lastKnownServer.holeRevision &&
                updated.conflict?.currentPermissionRevision == updated.lastKnownServer.permissionRevision &&
                updated.lastKnownServer.refreshedAt >= (updated.conflict?.recordedAt ?? .distantFuture) &&
                updated.lastKnownServer.refreshedAt > current.lastKnownServer.refreshedAt &&
                updated.acknowledgement == current.acknowledgement &&
                updated.resolution == current.resolution &&
                updated.quarantineReason == current.quarantineReason
            return retrySchedule || canonicalReview

        case .actionRequired:
            return allowsActionRequiredPartitionReview &&
                updated.base == current.base &&
                (updated.stateReasonCode == .identityChanged || updated.stateReasonCode == .staleTournament) &&
                updated.attempt.count == current.attempt.count &&
                updated.attempt.lastAttemptAt == current.attempt.lastAttemptAt &&
                updated.attempt.everSubmitted == current.attempt.everSubmitted &&
                updated.attempt.outcomeCertainty == current.attempt.outcomeCertainty &&
                updated.attempt.syncLeaseId == nil &&
                updated.attempt.syncLeaseStartedAt == nil &&
                updated.attempt.nextRetryAt == nil &&
                updated.attempt.lastHttpStatus == current.attempt.lastHttpStatus &&
                updated.attempt.lastErrorCode == current.attempt.lastErrorCode &&
                updated.lastKnownServer == current.lastKnownServer &&
                updated.conflict == current.conflict &&
                updated.acknowledgement == current.acknowledgement &&
                updated.resolution == current.resolution &&
                updated.quarantineReason == current.quarantineReason

        case .retryable, .quarantined, .resolved:
            return false
        }
    }

    static func isRetryScheduleOnly(
        from current: ScoringQueueRecord,
        to updated: ScoringQueueRecord
    ) -> Bool {
        updated.attempt.count == current.attempt.count &&
            updated.attempt.lastAttemptAt == current.attempt.lastAttemptAt &&
            updated.attempt.everSubmitted == current.attempt.everSubmitted &&
            updated.attempt.outcomeCertainty == current.attempt.outcomeCertainty &&
            updated.attempt.syncLeaseId == current.attempt.syncLeaseId &&
            updated.attempt.syncLeaseStartedAt == current.attempt.syncLeaseStartedAt &&
            updated.attempt.lastHttpStatus == current.attempt.lastHttpStatus &&
            updated.attempt.lastErrorCode == current.attempt.lastErrorCode
    }

    static func immutableAcknowledgementFactsMatch(
        _ current: ScoringQueueRecord,
        _ updated: ScoringQueueRecord
    ) -> Bool {
        guard let lhs = current.acknowledgement, let rhs = updated.acknowledgement else {
            return false
        }
        return lhs.accepted == rhs.accepted &&
            lhs.idempotent == rhs.idempotent &&
            lhs.semanticNoop == rhs.semanticNoop &&
            lhs.canonicalMatchRevision == rhs.canonicalMatchRevision &&
            lhs.canonicalHoleRevision == rhs.canonicalHoleRevision &&
            lhs.responseAt == rhs.responseAt
    }

    /// Storage admits the coordinator's deterministic metadata-only rebase
    /// only when the persisted envelope itself proves the bounded handoff. The
    /// score intent, identity, and snapshot are separately immutable above.
    static func isDeterministicSafeRebase(
        from current: ScoringQueueRecord,
        to updated: ScoringQueueRecord
    ) -> Bool {
        guard current.state == .conflict,
              current.stateReasonCode == .revision,
              current.conflict?.refreshRequired == true,
              updated.state == .queued,
              updated.stateReasonCode == nil,
              updated.conflict == nil,
              updated.acknowledgement == nil,
              updated.resolution == nil,
              updated.quarantineReason == nil,
              updated.base.automaticRebaseCount == current.base.automaticRebaseCount + 1,
              updated.base.automaticRebaseCount <= 3,
              updated.base.expectedMatchRevision == updated.lastKnownServer.matchRevision,
              updated.base.expectedHoleRevision == updated.lastKnownServer.holeRevision,
              updated.lastKnownServer.refreshedAt >= (current.conflict?.recordedAt ?? current.updatedAt),
              updated.lastKnownServer.refreshedAt > current.lastKnownServer.refreshedAt,
              updated.attempt.nextRetryAt == nil,
              updated.attempt.syncLeaseId == nil,
              updated.attempt.syncLeaseStartedAt == nil
        else { return false }
        return true
    }

    static func isBoundedIdentifier(_ value: String) -> Bool {
        !value.isEmpty && value.utf8.count <= 128 &&
            !value.contains("\u{0}") &&
            !value.contains(where: { $0.isNewline })
    }

    static func isLowercaseUUID(_ value: String) -> Bool {
        UUID(uuidString: value) != nil && value == value.lowercased()
    }

    static func isValidMutationID(_ value: String) -> Bool {
        value.utf8.count <= 128 &&
            value.range(
                of: #"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$"#,
                options: .regularExpression
            ) != nil
    }

    static func isValidLeaseID(_ value: String) -> Bool {
        !value.isEmpty && value.utf8.count <= 256 &&
            !value.contains("\u{0}") &&
            !value.contains(where: { $0.isNewline })
    }
}

extension SQLiteScoringQueueRepository {
    /// Shared by the deterministic in-memory coordinator test repository so
    /// tests cannot accept a transition that the durable SQLite store rejects.
    static func genericReplacementIsStructurallyAllowed(
        _ updated: ScoringQueueRecord,
        from current: ScoringQueueRecord
    ) -> Bool {
        replacementInvariantAllows(updated, from: current)
    }
}

// MARK: - SQLite configuration and migration

private extension SQLiteScoringQueueRepository {
    /// Early Step 2F development builds briefly placed the database under a
    /// schema-version directory. Adopt that one known store into the stable
    /// location before opening it so future `PRAGMA user_version` migrations
    /// operate in place. Multiple stores are an ambiguity, never a reason to
    /// select an apparently newer empty database and strand unresolved intent.
    static func adoptLegacyVersionedStoreIfNeeded(
        stableURL: URL,
        fileManager: FileManager
    ) throws {
        let queueDirectory = stableURL.deletingLastPathComponent()
        let contents = try fileManager.contentsOfDirectory(
            at: queueDirectory,
            includingPropertiesForKeys: [.isDirectoryKey],
            options: [.skipsHiddenFiles]
        )
        var legacyStores: [(version: Int, url: URL)] = []
        for directory in contents {
            guard directory.lastPathComponent.first == "v",
                  let version = Int(directory.lastPathComponent.dropFirst()),
                  version > 0
            else { continue }
            let directoryAttributes = try fileManager.attributesOfItem(
                atPath: directory.path
            )
            guard directoryAttributes[.type] as? FileAttributeType == .typeDirectory else {
                continue
            }
            let candidate = directory.appendingPathComponent(
                stableURL.lastPathComponent,
                isDirectory: false
            )
            do {
                let candidateAttributes = try fileManager.attributesOfItem(
                    atPath: candidate.path
                )
                guard candidateAttributes[.type] as? FileAttributeType == .typeRegular else {
                    throw SQLiteScoringQueueRepositoryError.unsafeMigration
                }
                legacyStores.append((version, candidate))
            } catch let error as CocoaError where error.code == .fileNoSuchFile {
                continue
            }
        }

        guard !legacyStores.isEmpty else { return }
        guard !fileManager.fileExists(atPath: stableURL.path), legacyStores.count == 1,
              let legacy = legacyStores.first
        else {
            throw SQLiteScoringQueueRepositoryError.unsafeMigration
        }

        try applyProtection(databaseURL: legacy.url, fileManager: fileManager)
        let legacyConnection = try SQLiteConnection(
            path: legacy.url.path,
            busyTimeoutMilliseconds: busyTimeoutMilliseconds
        )
        do {
            let storedVersion = try legacyConnection.scalarInt("PRAGMA user_version")
            guard storedVersion == legacy.version, storedVersion <= schemaVersion else {
                throw storedVersion > schemaVersion
                    ? SQLiteScoringQueueRepositoryError.unsupportedSchema(storedVersion)
                    : SQLiteScoringQueueRepositoryError.unsafeMigration
            }
            try verifyIntegrity(legacyConnection)
            let checkpoint = try legacyConnection.truncateWALCheckpoint()
            guard checkpoint.busy == 0,
                  checkpoint.logFrames == checkpoint.checkpointedFrames
            else {
                // Moving only the main file while committed frames remain in
                // a busy legacy WAL would silently strand scoring intent.
                throw SQLiteScoringQueueRepositoryError.unsafeMigration
            }
            legacyConnection.close()
            try fileManager.moveItem(at: legacy.url, to: stableURL)
        } catch {
            legacyConnection.close()
            throw error
        }
    }

    static func prepareProtectedDirectory(_ directory: URL, fileManager: FileManager) throws {
        if !fileManager.fileExists(atPath: directory.path) {
            try fileManager.createDirectory(
                at: directory,
                withIntermediateDirectories: true,
                attributes: [
                    .protectionKey: FileProtectionType.completeUntilFirstUserAuthentication,
                ]
            )
        }
        try fileManager.setAttributes(
            [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication],
            ofItemAtPath: directory.path
        )
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        var mutableDirectory = directory
        try mutableDirectory.setResourceValues(values)
    }

    static func applyProtection(databaseURL: URL, fileManager: FileManager) throws {
        for path in [databaseURL.path, databaseURL.path + "-wal", databaseURL.path + "-shm"] {
            guard fileManager.fileExists(atPath: path) else { continue }
            try fileManager.setAttributes(
                [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication],
                ofItemAtPath: path
            )
        }
    }

    func applySidecarProtectionBestEffort() {
        try? Self.applyProtection(databaseURL: databaseURL, fileManager: fileManager.value)
    }

    static func configure(_ connection: SQLiteConnection) throws {
        let journalMode = try connection.scalarText("PRAGMA journal_mode = WAL").lowercased()
        guard journalMode == "wal" else {
            throw SQLiteScoringQueueRepositoryError.sqliteFailure(
                code: SQLITE_ERROR,
                operation: "configure-journal"
            )
        }
        try connection.execute("PRAGMA synchronous = FULL")
        try connection.execute("PRAGMA foreign_keys = ON")
        try connection.execute("PRAGMA trusted_schema = OFF")
        try connection.execute("PRAGMA cell_size_check = ON")
        guard try connection.scalarInt("PRAGMA synchronous") == 2,
              try connection.scalarInt("PRAGMA foreign_keys") == 1,
              try connection.scalarInt("PRAGMA busy_timeout") == busyTimeoutMilliseconds
        else {
            throw SQLiteScoringQueueRepositoryError.sqliteFailure(
                code: SQLITE_ERROR,
                operation: "verify-configuration"
            )
        }
    }

    static func migrate(_ connection: SQLiteConnection) throws {
        var version = try connection.scalarInt("PRAGMA user_version")
        guard version <= schemaVersion else {
            throw SQLiteScoringQueueRepositoryError.unsupportedSchema(version)
        }
        while version < schemaVersion {
            switch version {
            case 0:
                let userTableCount = try connection.scalarInt(
                    "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
                )
                guard userTableCount == 0 else {
                    throw SQLiteScoringQueueRepositoryError.unsafeMigration
                }
                try connection.immediateTransaction {
                    try createVersionOneSchema(connection)
                    try connection.execute("PRAGMA user_version = 1")
                }
                version = 1
            default:
                throw SQLiteScoringQueueRepositoryError.unsafeMigration
            }
        }
    }

    static func createVersionOneSchema(_ connection: SQLiteConnection) throws {
        try connection.execute(
            """
            CREATE TABLE queue_records (
                local_record_id TEXT NOT NULL PRIMARY KEY,
                mutation_id TEXT NOT NULL,
                auth_user_id TEXT NOT NULL,
                player_id TEXT NOT NULL,
                tournament_id TEXT NOT NULL,
                match_id TEXT NOT NULL,
                sequence INTEGER NOT NULL,
                state TEXT NOT NULL,
                hole_number INTEGER NOT NULL,
                ever_submitted INTEGER NOT NULL,
                outcome_certainty TEXT NOT NULL,
                sync_lease_id TEXT,
                created_at REAL NOT NULL,
                updated_at REAL NOT NULL,
                record_blob BLOB NOT NULL,
                UNIQUE(match_id, mutation_id),
                UNIQUE(auth_user_id, player_id, tournament_id, match_id, sequence)
            )
            """
        )
        try connection.execute(
            """
            CREATE UNIQUE INDEX queue_one_syncing_per_match
            ON queue_records(auth_user_id, player_id, tournament_id, match_id)
            WHERE state = 'syncing'
            """
        )
        try connection.execute(
            """
            CREATE INDEX queue_partition_order
            ON queue_records(auth_user_id, player_id, tournament_id, match_id, sequence)
            """
        )
        try connection.execute(
            """
            CREATE INDEX queue_identity_state
            ON queue_records(auth_user_id, player_id, tournament_id, state, updated_at)
            """
        )
        try connection.execute(
            """
            CREATE TABLE queue_sequence_high_water (
                auth_user_id TEXT NOT NULL,
                player_id TEXT NOT NULL,
                tournament_id TEXT NOT NULL,
                match_id TEXT NOT NULL,
                last_sequence INTEGER NOT NULL,
                PRIMARY KEY(auth_user_id, player_id, tournament_id, match_id)
            ) WITHOUT ROWID
            """
        )
        try connection.execute(
            """
            CREATE TABLE queue_receipts (
                local_record_id TEXT NOT NULL PRIMARY KEY,
                mutation_id TEXT NOT NULL,
                auth_user_id TEXT NOT NULL,
                player_id TEXT NOT NULL,
                tournament_id TEXT NOT NULL,
                match_id TEXT NOT NULL,
                created_at REAL NOT NULL,
                expires_at REAL NOT NULL,
                receipt_blob BLOB NOT NULL,
                UNIQUE(match_id, mutation_id)
            )
            """
        )
        try connection.execute(
            """
            CREATE INDEX queue_receipt_identity_expiration
            ON queue_receipts(auth_user_id, player_id, tournament_id, expires_at, created_at)
            """
        )
        try connection.execute(
            """
            CREATE TABLE queue_quarantine (
                quarantine_id INTEGER PRIMARY KEY AUTOINCREMENT,
                source_local_record_id TEXT,
                mutation_id TEXT,
                auth_user_id TEXT,
                player_id TEXT,
                tournament_id TEXT,
                match_id TEXT,
                sequence INTEGER,
                reason TEXT NOT NULL,
                quarantined_at REAL NOT NULL,
                raw_blob BLOB NOT NULL
            )
            """
        )
        try connection.execute(
            """
            CREATE INDEX queue_quarantine_partition_order
            ON queue_quarantine(auth_user_id, player_id, tournament_id, match_id, sequence)
            """
        )
    }

    static func verifyIntegrity(_ connection: SQLiteConnection) throws {
        guard try connection.scalarText("PRAGMA quick_check(1)").lowercased() == "ok" else {
            throw SQLiteScoringQueueRepositoryError.databaseCorrupt
        }
    }

    static func verifyVersionOneQueueIntegrity(
        _ connection: SQLiteConnection
    ) throws {
        let duplicateActiveMutationCount = try connection.scalarInt(
            """
            SELECT COUNT(*) FROM (
                SELECT match_id, mutation_id
                FROM queue_records
                GROUP BY match_id, mutation_id
                HAVING COUNT(*) > 1
            )
            """
        )
        let duplicateReceiptMutationCount = try connection.scalarInt(
            """
            SELECT COUNT(*) FROM (
                SELECT match_id, mutation_id
                FROM queue_receipts
                GROUP BY match_id, mutation_id
                HAVING COUNT(*) > 1
            )
            """
        )
        let crossTableLocalRecordCollisionCount = try connection.scalarInt(
            """
            SELECT COUNT(*) FROM (
                SELECT local_record_id
                FROM (
                    SELECT 'record' AS source, local_record_id FROM queue_records
                    UNION ALL
                    SELECT 'receipt' AS source, local_record_id FROM queue_receipts
                    UNION ALL
                    SELECT 'quarantine' AS source, source_local_record_id AS local_record_id
                    FROM queue_quarantine
                    WHERE source_local_record_id IS NOT NULL
                )
                GROUP BY local_record_id
                HAVING COUNT(DISTINCT source) > 1
            )
            """
        )
        let crossTableMutationCollisionCount = try connection.scalarInt(
            """
            SELECT COUNT(*) FROM (
                SELECT match_id, mutation_id
                FROM (
                    SELECT 'record' AS source, match_id, mutation_id FROM queue_records
                    UNION ALL
                    SELECT 'receipt' AS source, match_id, mutation_id FROM queue_receipts
                    UNION ALL
                    SELECT 'quarantine' AS source, match_id, mutation_id
                    FROM queue_quarantine
                    WHERE match_id IS NOT NULL AND mutation_id IS NOT NULL
                )
                GROUP BY match_id, mutation_id
                HAVING COUNT(DISTINCT source) > 1
            )
            """
        )
        guard duplicateActiveMutationCount == 0,
              duplicateReceiptMutationCount == 0
        else {
            throw SQLiteScoringQueueRepositoryError.invalidRecord(.duplicateMutationId)
        }
        guard crossTableLocalRecordCollisionCount == 0,
              crossTableMutationCollisionCount == 0
        else { throw SQLiteScoringQueueRepositoryError.identifierCollision }
        guard try connection.hasUniqueIndex(
            table: "queue_records",
            columns: ["local_record_id"]
        ), try connection.hasUniqueIndex(
            table: "queue_records",
            columns: ["match_id", "mutation_id"]
        ), try connection.hasUniqueIndex(
            table: "queue_records",
            columns: [
                "auth_user_id", "player_id", "tournament_id", "match_id", "sequence",
            ]
        ), try connection.hasUniqueIndex(
            table: "queue_records",
            columns: ["auth_user_id", "player_id", "tournament_id", "match_id"],
            partial: true,
            predicate: "state = 'syncing'"
        ), try connection.hasUniqueIndex(
            table: "queue_receipts",
            columns: ["local_record_id"]
        ), try connection.hasUniqueIndex(
            table: "queue_receipts",
            columns: ["match_id", "mutation_id"]
        ) else {
            throw SQLiteScoringQueueRepositoryError.unsafeMigration
        }
    }

    static func verifyQueueHealthBounds(
        _ connection: SQLiteConnection,
        decoder: JSONDecoder
    ) throws {
        var matchCounts: [ScoringQueuePartition: Int] = [:]
        var identityCounts: [ScoringQueueIdentityPartition: Int] = [:]
        let active = try connection.prepare("SELECT record_blob FROM queue_records")
        while try active.step() == .row {
            let record = try decoder.decode(
                ScoringQueueRecord.self,
                from: active.blob(at: 0)
            )
            guard isUnresolved(record) else { continue }
            matchCounts[record.partition, default: 0] += 1
            identityCounts[record.partition.identity, default: 0] += 1
        }
        let raw = try connection.prepare(
            """
            SELECT auth_user_id, player_id, tournament_id, match_id
            FROM queue_quarantine
            """
        )
        while try raw.step() == .row {
            let partition = ScoringQueuePartition(
                authUserId: raw.text(at: 0),
                playerId: raw.text(at: 1),
                tournamentId: raw.text(at: 2),
                matchId: raw.text(at: 3)
            )
            matchCounts[partition, default: 0] += 1
            identityCounts[partition.identity, default: 0] += 1
        }
        guard matchCounts.values.allSatisfy({
            $0 <= ScoringQueueContract.maximumUnresolvedRecordsPerMatch
        }), identityCounts.values.allSatisfy({
            $0 <= ScoringQueueContract.maximumUnresolvedRecordsPerIdentityTournament
        }) else {
            throw SQLiteScoringQueueRepositoryError.queueHealth
        }
    }

    static func quarantineInvalidRows(
        _ connection: SQLiteConnection,
        decoder: JSONDecoder,
        encoder: JSONEncoder,
        at date: Date
    ) throws {
        let statement = try connection.prepare(
            """
            SELECT local_record_id, mutation_id, auth_user_id, player_id,
                   tournament_id, match_id, sequence, state, hole_number,
                   ever_submitted, outcome_certainty, sync_lease_id,
                   created_at, updated_at, record_blob
            FROM queue_records ORDER BY auth_user_id, player_id, tournament_id, match_id, sequence
            """
        )
        // Keep the physical row used for deletion separate from the logical
        // envelope used to partition quarantine. If an index/blob mismatch is
        // the fault, the self-contained, otherwise-valid blob is the only
        // source that preserves the original identity/order boundary. Trusting
        // the corrupted index here could unblock later records for the real
        // participant partition.
        var invalid: [(
            source: SQLiteIndexedQueueRow,
            quarantines: [SQLiteIndexedQueueRow],
            reason: ScoringQueueQuarantineReason
        )] = []
        while try statement.step() == .row {
            let candidate = SQLiteIndexedQueueRow(
                localID: statement.text(at: 0),
                mutationID: statement.text(at: 1),
                authUserID: statement.text(at: 2),
                playerID: statement.text(at: 3),
                tournamentID: statement.text(at: 4),
                matchID: statement.text(at: 5),
                sequence: statement.int64(at: 6),
                state: statement.text(at: 7),
                holeNumber: Int(statement.int64(at: 8)),
                everSubmitted: statement.int64(at: 9) != 0,
                outcomeCertainty: statement.text(at: 10),
                syncLeaseID: statement.optionalText(at: 11),
                createdAt: statement.double(at: 12),
                updatedAt: statement.double(at: 13),
                blob: statement.blob(at: 14)
            )
            let reason: ScoringQueueQuarantineReason?
            var quarantineCandidates = [candidate]
            if candidate.blob.count > ScoringQueueContract.maximumRecordBytes {
                reason = .recordTooLarge
            } else if let record = try? decoder.decode(ScoringQueueRecord.self, from: candidate.blob) {
                if record.queueSchemaVersion != schemaVersion {
                    reason = .unsupportedSchema
                } else if !indexMatches(record: record, candidate: candidate) {
                    if (try? validateLoadedRecord(record, encoder: encoder)) != nil {
                        reason = .identityIntegrity
                        let decodedCandidate = SQLiteIndexedQueueRow(
                            localID: record.localQueueRecordId,
                            mutationID: record.mutationId,
                            authUserID: record.partition.authUserId,
                            playerID: record.partition.playerId,
                            tournamentID: record.partition.tournamentId,
                            matchID: record.partition.matchId,
                            sequence: record.sequence,
                            state: record.state.rawValue,
                            holeNumber: record.intent.holeNumber,
                            everSubmitted: record.attempt.everSubmitted,
                            outcomeCertainty: record.attempt.outcomeCertainty.rawValue,
                            syncLeaseID: record.attempt.syncLeaseId,
                            createdAt: record.createdAt.timeIntervalSince1970,
                            updatedAt: record.updatedAt.timeIntervalSince1970,
                            blob: candidate.blob
                        )
                        let indexBoundary = [
                            candidate.authUserID,
                            candidate.playerID,
                            candidate.tournamentID,
                            candidate.matchID,
                            String(candidate.sequence),
                        ]
                        let decodedBoundary = [
                            decodedCandidate.authUserID,
                            decodedCandidate.playerID,
                            decodedCandidate.tournamentID,
                            decodedCandidate.matchID,
                            String(decodedCandidate.sequence),
                        ]
                        if decodedBoundary != indexBoundary {
                            // A valid index/blob disagreement has no trusted
                            // attribution. Block both plausible identity/order
                            // boundaries so neither participant queue can skip
                            // the unresolved intent.
                            quarantineCandidates.append(decodedCandidate)
                        }
                    } else {
                        reason = .invalidRecordOrContract
                    }
                } else if (try? validateLoadedRecord(record, encoder: encoder)) == nil {
                    reason = .invalidRecordOrContract
                } else {
                    reason = nil
                }
            } else {
                reason = .corruptRecord
            }
            if let reason {
                invalid.append((
                    source: candidate,
                    quarantines: quarantineCandidates,
                    reason: reason
                ))
            }
        }

        guard !invalid.isEmpty else { return }
        try connection.immediateTransaction {
            for invalidRow in invalid {
                for candidate in invalidRow.quarantines {
                    let insert = try connection.prepare(
                        """
                        INSERT INTO queue_quarantine (
                            source_local_record_id, mutation_id, auth_user_id, player_id,
                            tournament_id, match_id, sequence, reason, quarantined_at, raw_blob
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """
                    )
                    try insert.bind(candidate.localID, at: 1)
                    try insert.bind(candidate.mutationID, at: 2)
                    try insert.bind(candidate.authUserID, at: 3)
                    try insert.bind(candidate.playerID, at: 4)
                    try insert.bind(candidate.tournamentID, at: 5)
                    try insert.bind(candidate.matchID, at: 6)
                    try insert.bind(candidate.sequence, at: 7)
                    try insert.bind(invalidRow.reason.rawValue, at: 8)
                    try insert.bind(date.timeIntervalSince1970, at: 9)
                    try insert.bind(candidate.blob, at: 10)
                    try insert.requireDone()
                }

                let delete = try connection.prepare(
                    "DELETE FROM queue_records WHERE local_record_id = ?"
                )
                try delete.bind(invalidRow.source.localID, at: 1)
                try delete.requireDone()
            }
        }
    }

    static func validateLoadedRecord(_ record: ScoringQueueRecord, encoder: JSONEncoder) throws {
        guard ScoringQueueValidator.validate(record).isValid,
              record.apiContractVersion == ScoringQueueContract.apiContractVersion,
              isLowercaseUUID(record.localQueueRecordId),
              isValidMutationID(record.mutationId),
              isLowercaseUUID(record.partition.authUserId),
              isBoundedIdentifier(record.partition.playerId),
              isBoundedIdentifier(record.partition.tournamentId),
              isBoundedIdentifier(record.partition.matchId),
              (1...18).contains(record.intent.holeNumber),
              record.sequence > 0,
              record.base.expectedMatchRevision >= 0,
              record.base.expectedHoleRevision >= 0,
              record.base.originalExpectedMatchRevision >= 0,
              record.base.originalExpectedHoleRevision >= 0,
              record.base.snapshotRevision >= 0,
              (0...3).contains(record.base.automaticRebaseCount),
              record.attempt.count < Int.max,
              record.updatedAt >= record.createdAt,
              acknowledgementRefreshProofIsCoherent(record),
              try encoder.encode(record).count <= ScoringQueueContract.maximumRecordBytes
        else { throw SQLiteScoringQueueRepositoryError.invalidRecord(.invalidRecordOrContract) }
        let expectedSlots = record.base.scoringFormat == .bestBall ? 2 : 1
        guard record.base.sideSlotCount == expectedSlots,
              record.intent.teamOneGrossScores.count == expectedSlots,
              record.intent.teamTwoGrossScores.count == expectedSlots,
              record.intent.teamOneGrossScores.allSatisfy({ (1...20).contains($0) }),
              record.intent.teamTwoGrossScores.allSatisfy({ (1...20).contains($0) })
        else { throw SQLiteScoringQueueRepositoryError.invalidRecord(.invalidIntent) }
    }

    static func indexMatches(
        record: ScoringQueueRecord,
        candidate: SQLiteIndexedQueueRow
    ) -> Bool {
        return record.localQueueRecordId == candidate.localID &&
            record.mutationId == candidate.mutationID &&
            record.partition.authUserId == candidate.authUserID &&
            record.partition.playerId == candidate.playerID &&
            record.partition.tournamentId == candidate.tournamentID &&
            record.partition.matchId == candidate.matchID &&
            record.sequence == candidate.sequence &&
            record.state.rawValue == candidate.state &&
            record.intent.holeNumber == candidate.holeNumber &&
            record.attempt.everSubmitted == candidate.everSubmitted &&
            record.attempt.outcomeCertainty.rawValue == candidate.outcomeCertainty &&
            record.attempt.syncLeaseId == candidate.syncLeaseID &&
            record.createdAt.timeIntervalSince1970 == candidate.createdAt &&
            record.updatedAt.timeIntervalSince1970 == candidate.updatedAt
    }

    static func repairSequenceHighWater(_ connection: SQLiteConnection) throws {
        try connection.immediateTransaction {
            try connection.execute(
                """
                INSERT INTO queue_sequence_high_water (
                    auth_user_id, player_id, tournament_id, match_id, last_sequence
                )
                SELECT auth_user_id, player_id, tournament_id, match_id, MAX(sequence)
                FROM (
                    SELECT auth_user_id, player_id, tournament_id, match_id, sequence FROM queue_records
                    UNION ALL
                    SELECT auth_user_id, player_id, tournament_id, match_id, sequence FROM queue_quarantine
                    WHERE sequence IS NOT NULL
                )
                GROUP BY auth_user_id, player_id, tournament_id, match_id
                ON CONFLICT(auth_user_id, player_id, tournament_id, match_id)
                DO UPDATE SET last_sequence = MAX(last_sequence, excluded.last_sequence)
                """
            )
        }
    }
}

// MARK: - SQLite primitives

private enum SQLiteStepResult {
    case row
    case done
}

private final class SQLiteConnection: @unchecked Sendable {
    private var handle: OpaquePointer?

    var changes: Int { Int(sqlite3_changes(handle)) }

    init(path: String, busyTimeoutMilliseconds: Int) throws {
        var database: OpaquePointer?
        let flags = SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE | SQLITE_OPEN_FULLMUTEX | SQLITE_OPEN_PRIVATECACHE
        let result = sqlite3_open_v2(path, &database, flags, nil)
        guard result == SQLITE_OK, let database else {
            if let database { sqlite3_close_v2(database) }
            throw SQLiteScoringQueueRepositoryError.sqliteFailure(
                code: result,
                operation: "open"
            )
        }
        handle = database
        sqlite3_extended_result_codes(database, 1)
        let timeoutResult = sqlite3_busy_timeout(database, Int32(busyTimeoutMilliseconds))
        guard timeoutResult == SQLITE_OK else {
            close()
            throw SQLiteScoringQueueRepositoryError.sqliteFailure(
                code: timeoutResult,
                operation: "busy-timeout"
            )
        }
    }

    deinit {
        close()
    }

    func close() {
        guard let handle else { return }
        sqlite3_close_v2(handle)
        self.handle = nil
    }

    func execute(_ sql: String) throws {
        guard let handle else {
            throw SQLiteScoringQueueRepositoryError.databaseClosed
        }
        var errorMessage: UnsafeMutablePointer<CChar>?
        let result = sqlite3_exec(handle, sql, nil, nil, &errorMessage)
        if let errorMessage { sqlite3_free(errorMessage) }
        guard result == SQLITE_OK else {
            throw SQLiteScoringQueueRepositoryError.sqliteFailure(
                code: sqlite3_extended_errcode(handle),
                operation: "execute"
            )
        }
    }

    func prepare(_ sql: String) throws -> SQLiteStatement {
        guard let handle else {
            throw SQLiteScoringQueueRepositoryError.databaseClosed
        }
        var statement: OpaquePointer?
        let result = sqlite3_prepare_v2(handle, sql, -1, &statement, nil)
        guard result == SQLITE_OK, let statement else {
            throw SQLiteScoringQueueRepositoryError.sqliteFailure(
                code: sqlite3_extended_errcode(handle),
                operation: "prepare"
            )
        }
        return SQLiteStatement(statement: statement, database: handle)
    }

    func scalarInt(_ sql: String) throws -> Int {
        let statement = try prepare(sql)
        guard try statement.step() == .row else {
            throw SQLiteScoringQueueRepositoryError.sqliteFailure(
                code: SQLITE_ERROR,
                operation: "scalar-int"
            )
        }
        return Int(statement.int64(at: 0))
    }

    func scalarText(_ sql: String) throws -> String {
        let statement = try prepare(sql)
        guard try statement.step() == .row else {
            throw SQLiteScoringQueueRepositoryError.sqliteFailure(
                code: SQLITE_ERROR,
                operation: "scalar-text"
            )
        }
        return statement.text(at: 0)
    }

    func truncateWALCheckpoint() throws -> (
        busy: Int64,
        logFrames: Int64,
        checkpointedFrames: Int64
    ) {
        let statement = try prepare("PRAGMA wal_checkpoint(TRUNCATE)")
        guard try statement.step() == .row else {
            throw SQLiteScoringQueueRepositoryError.sqliteFailure(
                code: SQLITE_ERROR,
                operation: "wal-checkpoint"
            )
        }
        return (
            busy: statement.int64(at: 0),
            logFrames: statement.int64(at: 1),
            checkpointedFrames: statement.int64(at: 2)
        )
    }

    func hasUniqueIndex(
        table: String,
        columns expectedColumns: [String],
        partial expectedPartial: Bool? = nil,
        predicate expectedPredicate: String? = nil
    ) throws -> Bool {
        let escapedTable = table.replacingOccurrences(of: "\"", with: "\"\"")
        let indexes = try prepare("PRAGMA index_list(\"\(escapedTable)\")")
        while try indexes.step() == .row {
            guard indexes.int64(at: 2) == 1 else { continue }
            let partial = indexes.int64(at: 4) == 1
            if let expectedPartial, partial != expectedPartial { continue }
            let indexName = indexes.text(at: 1)
            let escapedIndex = indexName.replacingOccurrences(of: "\"", with: "\"\"")
            let info = try prepare("PRAGMA index_info(\"\(escapedIndex)\")")
            var columns: [String] = []
            while try info.step() == .row {
                columns.append(info.text(at: 2))
            }
            guard columns == expectedColumns else { continue }
            if let expectedPredicate {
                let schema = try prepare(
                    "SELECT sql FROM sqlite_schema WHERE type = 'index' AND name = ?"
                )
                try schema.bind(indexName, at: 1)
                guard try schema.step() == .row else { continue }
                let normalizedSQL = Self.normalizedSQL(schema.text(at: 0))
                let normalizedPredicate = Self.normalizedSQL(expectedPredicate)
                guard let whereRange = normalizedSQL.range(
                    of: " where ",
                    options: .backwards
                ), normalizedSQL[whereRange.upperBound...] == normalizedPredicate else { continue }
            }
            return true
        }
        return false
    }

    private static func normalizedSQL(_ sql: String) -> String {
        sql.lowercased()
            .split(whereSeparator: \.isWhitespace)
            .joined(separator: " ")
    }

    func immediateTransaction<T>(_ body: () throws -> T) throws -> T {
        try execute("BEGIN IMMEDIATE")
        do {
            let result = try body()
            try execute("COMMIT")
            return result
        } catch {
            try? execute("ROLLBACK")
            throw error
        }
    }
}

private final class SQLiteStatement {
    private let statement: OpaquePointer
    private let database: OpaquePointer

    init(statement: OpaquePointer, database: OpaquePointer) {
        self.statement = statement
        self.database = database
    }

    deinit {
        sqlite3_finalize(statement)
    }

    func bind(_ value: String, at index: Int32) throws {
        let result = sqlite3_bind_text(statement, index, value, -1, sqliteTransientDestructor)
        try requireOK(result, operation: "bind-text")
    }

    func bind(_ value: String?, at index: Int32) throws {
        guard let value else {
            try requireOK(sqlite3_bind_null(statement, index), operation: "bind-null")
            return
        }
        try bind(value, at: index)
    }

    func bind(_ value: Int, at index: Int32) throws {
        try requireOK(sqlite3_bind_int64(statement, index, Int64(value)), operation: "bind-int")
    }

    func bind(_ value: Int64, at index: Int32) throws {
        try requireOK(sqlite3_bind_int64(statement, index, value), operation: "bind-int64")
    }

    func bind(_ value: Double, at index: Int32) throws {
        try requireOK(sqlite3_bind_double(statement, index, value), operation: "bind-double")
    }

    func bind(_ value: Data, at index: Int32) throws {
        let result = value.withUnsafeBytes { bytes in
            sqlite3_bind_blob(
                statement,
                index,
                bytes.baseAddress,
                Int32(bytes.count),
                sqliteTransientDestructor
            )
        }
        try requireOK(result, operation: "bind-blob")
    }

    func step() throws -> SQLiteStepResult {
        let result = sqlite3_step(statement)
        switch result {
        case SQLITE_ROW: return .row
        case SQLITE_DONE: return .done
        default:
            throw SQLiteScoringQueueRepositoryError.sqliteFailure(
                code: sqlite3_extended_errcode(database),
                operation: "step"
            )
        }
    }

    func requireDone() throws {
        guard try step() == .done else {
            throw SQLiteScoringQueueRepositoryError.sqliteFailure(
                code: SQLITE_MISUSE,
                operation: "expected-done"
            )
        }
    }

    func text(at index: Int32) -> String {
        guard let text = sqlite3_column_text(statement, index) else { return "" }
        return String(cString: text)
    }

    func optionalText(at index: Int32) -> String? {
        isNull(at: index) ? nil : text(at: index)
    }

    func int64(at index: Int32) -> Int64 {
        sqlite3_column_int64(statement, index)
    }

    func double(at index: Int32) -> Double {
        sqlite3_column_double(statement, index)
    }

    func blob(at index: Int32) -> Data {
        let count = Int(sqlite3_column_bytes(statement, index))
        guard count > 0, let bytes = sqlite3_column_blob(statement, index) else {
            return Data()
        }
        return Data(bytes: bytes, count: count)
    }

    func isNull(at index: Int32) -> Bool {
        sqlite3_column_type(statement, index) == SQLITE_NULL
    }

    private func requireOK(_ result: Int32, operation: String) throws {
        guard result == SQLITE_OK else {
            throw SQLiteScoringQueueRepositoryError.sqliteFailure(
                code: sqlite3_extended_errcode(database),
                operation: operation
            )
        }
    }
}

private let sqliteTransientDestructor = unsafeBitCast(-1, to: sqlite3_destructor_type.self)
