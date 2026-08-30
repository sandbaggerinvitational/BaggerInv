@preconcurrency import Foundation
import SQLite3
import XCTest
@testable import BaggerInv

final class SQLiteScoringQueueRepositoryTests: XCTestCase {
    func testLiveDatabasePathIsStableAcrossQueueSchemaMigrations() throws {
        let applicationSupport = FileManager.default.temporaryDirectory
            .appendingPathComponent("SQLiteScoringQueueLivePathTests-\(UUID().uuidString)", isDirectory: true)
        let fileManager = FixedApplicationSupportFileManager(applicationSupport: applicationSupport)

        let databaseURL = try SQLiteScoringQueueRepository.liveDatabaseURL(fileManager: fileManager)

        XCTAssertEqual(
            databaseURL,
            applicationSupport
                .appendingPathComponent("BaggerInv", isDirectory: true)
                .appendingPathComponent("ScoringQueue", isDirectory: true)
                .appendingPathComponent("scoring-queue.sqlite3", isDirectory: false),
            "A schema version must migrate the one durable queue in place, not select an empty sibling directory."
        )
    }

    func testLegacyEnumerationFailureDoesNotCreateAnEmptyStableQueue() async throws {
        let applicationSupport = FileManager.default.temporaryDirectory
            .appendingPathComponent("SQLiteScoringQueueLegacyEnumerationTests-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: applicationSupport) }
        let queueDirectory = applicationSupport
            .appendingPathComponent("BaggerInv", isDirectory: true)
            .appendingPathComponent("ScoringQueue", isDirectory: true)
        let legacyURL = queueDirectory
            .appendingPathComponent("v1", isDirectory: true)
            .appendingPathComponent("scoring-queue.sqlite3", isDirectory: false)
        let stableURL = queueDirectory.appendingPathComponent(
            "scoring-queue.sqlite3",
            isDirectory: false
        )
        let seed = try SQLiteScoringQueueRepository(
            databaseURL: legacyURL,
            now: { Self.baseDate }
        )
        _ = try await seed.save(makeInput(partition: makePartition(), hole: 1))
        await seed.close()
        let fileManager = FixedApplicationSupportFileManager(
            applicationSupport: applicationSupport,
            failDirectoryEnumeration: true
        )

        XCTAssertThrowsError(
            try SQLiteScoringQueueRepository(fileManager: ScoringQueueFileManager(fileManager))
        ) { error in
            XCTAssertEqual(error as? TestFailure, .sqlite)
        }
        XCTAssertTrue(FileManager.default.fileExists(atPath: legacyURL.path))
        XCTAssertFalse(
            FileManager.default.fileExists(atPath: stableURL.path),
            "An unreadable legacy directory must fail closed instead of creating an empty sibling queue."
        )
    }

    func testLegacyCandidateMetadataFailureDoesNotCreateAnEmptyStableQueue() async throws {
        let applicationSupport = FileManager.default.temporaryDirectory
            .appendingPathComponent("SQLiteScoringQueueLegacyMetadataTests-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: applicationSupport) }
        let queueDirectory = applicationSupport
            .appendingPathComponent("BaggerInv", isDirectory: true)
            .appendingPathComponent("ScoringQueue", isDirectory: true)
        let legacyURL = queueDirectory
            .appendingPathComponent("v1", isDirectory: true)
            .appendingPathComponent("scoring-queue.sqlite3", isDirectory: false)
        let stableURL = queueDirectory.appendingPathComponent(
            "scoring-queue.sqlite3",
            isDirectory: false
        )
        let seed = try SQLiteScoringQueueRepository(
            databaseURL: legacyURL,
            now: { Self.baseDate }
        )
        _ = try await seed.save(makeInput(partition: makePartition(), hole: 1))
        await seed.close()
        let fileManager = FixedApplicationSupportFileManager(
            applicationSupport: applicationSupport,
            attributeFailurePaths: [legacyURL.path]
        )

        XCTAssertThrowsError(
            try SQLiteScoringQueueRepository(fileManager: ScoringQueueFileManager(fileManager))
        ) { error in
            XCTAssertEqual(error as? TestFailure, .sqlite)
        }
        XCTAssertTrue(FileManager.default.fileExists(atPath: legacyURL.path))
        XCTAssertFalse(FileManager.default.fileExists(atPath: stableURL.path))
    }

    func testUnsupportedLegacyStoreIsProtectedBeforeMigrationFailsClosed() throws {
        let applicationSupport = FileManager.default.temporaryDirectory
            .appendingPathComponent("SQLiteScoringQueueLegacyProtectionTests-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: applicationSupport) }
        let queueDirectory = applicationSupport
            .appendingPathComponent("BaggerInv", isDirectory: true)
            .appendingPathComponent("ScoringQueue", isDirectory: true)
        let legacyURL = queueDirectory
            .appendingPathComponent("v2", isDirectory: true)
            .appendingPathComponent("scoring-queue.sqlite3", isDirectory: false)
        try FileManager.default.createDirectory(
            at: legacyURL.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )
        try executeSQL("PRAGMA user_version = 2", databaseURL: legacyURL)
        let fileManager = FixedApplicationSupportFileManager(
            applicationSupport: applicationSupport
        )

        XCTAssertThrowsError(
            try SQLiteScoringQueueRepository(fileManager: ScoringQueueFileManager(fileManager))
        ) { error in
            XCTAssertEqual(error as? SQLiteScoringQueueRepositoryError, .unsupportedSchema(2))
        }
        XCTAssertTrue(
            fileManager.protectedPaths.contains(legacyURL.path),
            "A future-schema legacy database must be protected even when adoption fails closed."
        )
    }

    func testCreatesVersionOneWALFullProtectedNonBackupStore() async throws {
        let databaseURL = temporaryDatabaseURL()
        defer { removeDatabaseRoot(databaseURL) }

        let repository = try SQLiteScoringQueueRepository(
            databaseURL: databaseURL,
            now: { Self.baseDate }
        )
        let configuration = try await repository.configuration()

        XCTAssertEqual(configuration.databaseURL, databaseURL)
        XCTAssertEqual(configuration.schemaVersion, 1)
        XCTAssertEqual(configuration.journalMode.lowercased(), "wal")
        XCTAssertEqual(configuration.synchronous, 2)
        XCTAssertTrue(configuration.foreignKeysEnabled)
        XCTAssertEqual(configuration.busyTimeoutMilliseconds, 5_000)
        XCTAssertTrue(configuration.isExcludedFromBackup)
        XCTAssertTrue(FileManager.default.fileExists(atPath: databaseURL.path))
        if let fileProtection = configuration.fileProtection {
            XCTAssertEqual(
                fileProtection,
                FileProtectionType.completeUntilFirstUserAuthentication.rawValue
            )
        }
        for path in [databaseURL.path + "-wal", databaseURL.path + "-shm"]
        where FileManager.default.fileExists(atPath: path) {
            let attributes = try FileManager.default.attributesOfItem(atPath: path)
            if let protection = attributes[.protectionKey] as? FileProtectionType {
                XCTAssertEqual(protection, .completeUntilFirstUserAuthentication)
            } else if let protection = attributes[.protectionKey] as? String {
                XCTAssertEqual(
                    protection,
                    FileProtectionType.completeUntilFirstUserAuthentication.rawValue
                )
            }
        }
        await repository.close()
    }

    func testAtomicSaveOrderingReopenAndHighWaterSequence() async throws {
        let databaseURL = temporaryDatabaseURL()
        defer { removeDatabaseRoot(databaseURL) }
        let partition = makePartition()
        let firstRepository = try SQLiteScoringQueueRepository(
            databaseURL: databaseURL,
            now: { Self.baseDate }
        )

        for hole in 1...3 {
            _ = try await firstRepository.save(makeInput(partition: partition, hole: hole))
        }
        let firstRecords = try await firstRepository.records(in: partition)
        let firstUnresolvedCount = try await firstRepository.unresolvedCount(in: partition)
        XCTAssertEqual(firstRecords.map(\.sequence), [1, 2, 3])
        XCTAssertEqual(firstRecords.map(\.intent.holeNumber), [1, 2, 3])
        XCTAssertEqual(firstUnresolvedCount, 3)
        await firstRepository.close()

        let reopened = try SQLiteScoringQueueRepository(
            databaseURL: databaseURL,
            now: { Self.baseDate.addingTimeInterval(10) }
        )
        let reopenedRecords = try await reopened.records(in: partition)
        XCTAssertEqual(reopenedRecords, firstRecords)
        let fourth = try insertedRecord(
            try await reopened.save(makeInput(partition: partition, hole: 4))
        )
        XCTAssertEqual(fourth.sequence, 4)
        let byteCount = try await reopened.databaseByteCount()
        XCTAssertGreaterThan(byteCount, 0)
        XCTAssertLessThan(byteCount, 1_000_000)
        await reopened.close()
    }

    func testExactDuplicateSaveReusesDurableRecordAndMutationID() async throws {
        let databaseURL = temporaryDatabaseURL()
        defer { removeDatabaseRoot(databaseURL) }
        let partition = makePartition()
        let repository = try SQLiteScoringQueueRepository(
            databaseURL: databaseURL,
            now: { Self.baseDate }
        )
        let input = makeInput(partition: partition, hole: 7)

        let original = try insertedRecord(try await repository.save(input))
        let reused: ScoringQueueRecord
        switch try await repository.save(input) {
        case .reused(let record): reused = record
        default: return XCTFail("Exact unresolved intent must reuse its durable record")
        }

        XCTAssertEqual(reused.localQueueRecordId, original.localQueueRecordId)
        XCTAssertEqual(reused.mutationId, original.mutationId)
        XCTAssertEqual(reused.sequence, original.sequence)
        let records = try await repository.records(in: partition)
        XCTAssertEqual(records.count, 1)
        await repository.close()
    }

    func testOfficialLookingSaveStillPersistsIntentUntilFreshCanonicalReconciliation() async throws {
        let databaseURL = temporaryDatabaseURL()
        defer { removeDatabaseRoot(databaseURL) }
        let partition = makePartition()
        let official = ScoringQueueGross(teamOne: [4, 5], teamTwo: [5, 6])
        let repository = try SQLiteScoringQueueRepository(
            databaseURL: databaseURL,
            now: { Self.baseDate }
        )

        let result = try await repository.save(
            makeInput(partition: partition, hole: 7, official: official)
        )
        let persisted = try insertedRecord(result)
        let unresolvedCount = try await repository.unresolvedCount(in: partition)
        let oldest = try await repository.oldestUnresolved(in: partition)

        XCTAssertEqual(persisted.intent.gross, official)
        XCTAssertEqual(persisted.state, .queued)
        XCTAssertEqual(unresolvedCount, 1)
        XCTAssertEqual(oldest, persisted)
        await repository.close()
    }

    func testChangedNeverTransmittedIntentSupersedesAtomicallyWithNewIdentity() async throws {
        let databaseURL = temporaryDatabaseURL()
        defer { removeDatabaseRoot(databaseURL) }
        let partition = makePartition()
        let repository = try SQLiteScoringQueueRepository(
            databaseURL: databaseURL,
            now: { Self.baseDate }
        )
        let first = try insertedRecord(
            try await repository.save(makeInput(partition: partition, hole: 7, firstScore: 4))
        )

        let previous: ScoringQueueRecord
        let replacement: ScoringQueueRecord
        switch try await repository.save(makeInput(partition: partition, hole: 7, firstScore: 6)) {
        case .superseded(let old, let new):
            previous = old
            replacement = new
        default:
            return XCTFail("Changed never-sent intent must explicitly supersede")
        }

        XCTAssertEqual(previous.localQueueRecordId, first.localQueueRecordId)
        XCTAssertEqual(previous.state, .resolved)
        XCTAssertEqual(previous.resolution?.reason, .supersededBeforeTransmission)
        XCTAssertEqual(previous.resolution?.relatedLocalQueueRecordId, replacement.localQueueRecordId)
        XCTAssertNotEqual(replacement.localQueueRecordId, first.localQueueRecordId)
        XCTAssertNotEqual(replacement.mutationId, first.mutationId)
        XCTAssertEqual(replacement.sequence, 2)
        let records = try await repository.records(in: partition)
        let unresolvedCount = try await repository.unresolvedCount(in: partition)
        XCTAssertEqual(records.map(\.state), [.resolved, .queued])
        XCTAssertEqual(unresolvedCount, 1)
        await repository.close()
    }

    func testSameHoleReviewStateReusesExactIntentButBlocksDifferentIntent() async throws {
        let databaseURL = temporaryDatabaseURL()
        defer { removeDatabaseRoot(databaseURL) }
        let partition = makePartition()
        let repository = try SQLiteScoringQueueRepository(
            databaseURL: databaseURL,
            now: { Self.baseDate }
        )
        let input = makeInput(partition: partition, hole: 7, firstScore: 4)
        let saved = try insertedRecord(try await repository.save(input))
        var review = saved
        review.state = .actionRequired
        review.stateReasonCode = .authorization
        review.updatedAt = Self.baseDate.addingTimeInterval(1)
        review = try await repository.replace(review, expecting: saved)

        switch try await repository.save(input) {
        case .reused(let duplicate): XCTAssertEqual(duplicate, review)
        default: XCTFail("Exact unresolved intent should keep its original mutation identity")
        }
        do {
            _ = try await repository.save(
                makeInput(partition: partition, hole: 7, firstScore: 6)
            )
            XCTFail("A different same-hole intent must wait for explicit review")
        } catch {
            XCTAssertEqual(error as? SQLiteScoringQueueRepositoryError, .reviewRequired)
        }
        let records = try await repository.records(in: partition)
        XCTAssertEqual(records, [review])
        await repository.close()
    }

    func testChangedPossiblyTransmittedIntentRetainsOriginalAndCreatesLaterMutation() async throws {
        let databaseURL = temporaryDatabaseURL()
        defer { removeDatabaseRoot(databaseURL) }
        let partition = makePartition()
        let repository = try SQLiteScoringQueueRepository(
            databaseURL: databaseURL,
            now: { Self.baseDate }
        )
        let first = try insertedRecord(
            try await repository.save(makeInput(partition: partition, hole: 7, firstScore: 4))
        )
        let acquiredLease = try await repository.acquireSyncLease(
            in: partition,
            leaseId: "process-a:lease-1",
            at: Self.baseDate.addingTimeInterval(1)
        )
        let lease = try XCTUnwrap(acquiredLease)
        var retryable = try await repository.markTransportStarted(
            recordId: lease.localQueueRecordId,
            leaseId: "process-a:lease-1",
            at: Self.baseDate.addingTimeInterval(2)
        )
        retryable.state = .retryable
        retryable.stateReasonCode = .unknownOutcome
        retryable.attempt.syncLeaseId = nil
        retryable.attempt.syncLeaseStartedAt = nil
        retryable.attempt.nextRetryAt = Self.baseDate.addingTimeInterval(4)
        retryable.updatedAt = Self.baseDate.addingTimeInterval(3)
        retryable = try await repository.replace(retryable, expecting: leaseWithTransportState(
            lease,
            at: Self.baseDate.addingTimeInterval(2)
        ))

        let correction = try insertedRecord(
            try await repository.save(makeInput(partition: partition, hole: 7, firstScore: 6))
        )
        let records = try await repository.records(in: partition)

        XCTAssertEqual(records.count, 2)
        XCTAssertEqual(records[0], retryable)
        XCTAssertEqual(records[0].localQueueRecordId, first.localQueueRecordId)
        XCTAssertEqual(records[0].mutationId, first.mutationId)
        XCTAssertTrue(records[0].attempt.everSubmitted)
        XCTAssertEqual(records[0].attempt.outcomeCertainty, .unknown)
        XCTAssertEqual(records[1], correction)
        XCTAssertNotEqual(correction.mutationId, first.mutationId)
        XCTAssertEqual(correction.sequence, 2)
        let oldest = try await repository.oldestUnresolved(in: partition)
        XCTAssertEqual(oldest, retryable)
        await repository.close()
    }

    func testFailedInsertRollsBackSupersessionAndSequenceAllocation() async throws {
        let databaseURL = temporaryDatabaseURL()
        defer { removeDatabaseRoot(databaseURL) }
        let partition = makePartition()
        let repository = try SQLiteScoringQueueRepository(
            databaseURL: databaseURL,
            now: { Self.baseDate }
        )
        let original = try insertedRecord(
            try await repository.save(makeInput(partition: partition, hole: 7, firstScore: 4))
        )

        try executeSQL(
            "UPDATE queue_sequence_high_water SET last_sequence = 0",
            databaseURL: databaseURL
        )
        do {
            _ = try await repository.save(makeInput(partition: partition, hole: 7, firstScore: 6))
            XCTFail("Expected the intentionally duplicated sequence to fail")
        } catch {
            XCTAssertEqual(error as? SQLiteScoringQueueRepositoryError, .identifierCollision)
        }

        let records = try await repository.records(in: partition)
        XCTAssertEqual(records, [original])
        XCTAssertEqual(records[0].state, .queued)
        XCTAssertNil(records[0].resolution)
        XCTAssertEqual(try scalarInt(
            "SELECT last_sequence FROM queue_sequence_high_water",
            databaseURL: databaseURL
        ), 0)
        await repository.close()
    }

    func testMutationIdentifierCollisionNeverSilentlyAllocatesReplacement() async throws {
        let databaseURL = temporaryDatabaseURL()
        defer { removeDatabaseRoot(databaseURL) }
        let partition = makePartition()
        let IDs = LockedIdentifierSource([
            "aaaaaaaa-0000-4000-8000-000000000001",
            "bbbbbbbb-0000-4000-8000-000000000001",
            "aaaaaaaa-0000-4000-8000-000000000002",
            "bbbbbbbb-0000-4000-8000-000000000001",
        ])
        let repository = try SQLiteScoringQueueRepository(
            databaseURL: databaseURL,
            now: { Self.baseDate },
            identifierGenerator: { IDs.next() }
        )
        let first = try insertedRecord(
            try await repository.save(makeInput(partition: partition, hole: 1))
        )

        do {
            _ = try await repository.save(makeInput(partition: partition, hole: 2))
            XCTFail("A reused mutation identifier must fail closed")
        } catch {
            XCTAssertEqual(error as? SQLiteScoringQueueRepositoryError, .identifierCollision)
        }
        let records = try await repository.records(in: partition)
        XCTAssertEqual(records, [first])
        await repository.close()
    }

    func testCompareAndSwapRejectsImmutableChangesAndStaleExpectedRecord() async throws {
        let databaseURL = temporaryDatabaseURL()
        defer { removeDatabaseRoot(databaseURL) }
        let partition = makePartition()
        let repository = try SQLiteScoringQueueRepository(
            databaseURL: databaseURL,
            now: { Self.baseDate }
        )
        let original = try insertedRecord(
            try await repository.save(makeInput(partition: partition, hole: 1))
        )
        let incompatible = ScoringQueueRecord(
            localQueueRecordId: original.localQueueRecordId,
            mutationId: "cccccccc-0000-4000-8000-000000000001",
            partition: original.partition,
            intent: original.intent,
            base: original.base,
            sequence: original.sequence,
            state: original.state,
            stateReasonCode: original.stateReasonCode,
            attempt: original.attempt,
            lastKnownServer: original.lastKnownServer,
            conflict: original.conflict,
            acknowledgement: original.acknowledgement,
            resolution: original.resolution,
            quarantineReason: original.quarantineReason,
            originatingAppBuild: original.originatingAppBuild,
            createdAt: original.createdAt,
            updatedAt: original.updatedAt
        )
        do {
            _ = try await repository.replace(incompatible, expecting: original)
            XCTFail("Mutation identity is immutable")
        } catch {
            XCTAssertEqual(error as? SQLiteScoringQueueRepositoryError, .immutableRecordChanged)
        }

        _ = try await repository.acquireSyncLease(
            in: partition,
            leaseId: "process-a:lease-cas",
            at: Self.baseDate.addingTimeInterval(1)
        )
        var staleUpdate = original
        staleUpdate.state = .actionRequired
        staleUpdate.stateReasonCode = .authentication
        staleUpdate.updatedAt = Self.baseDate.addingTimeInterval(2)
        do {
            _ = try await repository.replace(staleUpdate, expecting: original)
            XCTFail("Stale compare-and-swap input must not overwrite the lease")
        } catch {
            XCTAssertEqual(error as? SQLiteScoringQueueRepositoryError, .concurrentModification)
        }
        await repository.close()
    }

    func testLeaseAcquisitionEnforcesOldestFirstOnePerMatchAndAllowsAnotherMatch() async throws {
        let databaseURL = temporaryDatabaseURL()
        defer { removeDatabaseRoot(databaseURL) }
        let firstMatch = makePartition(match: "match-1")
        let secondMatch = makePartition(match: "match-2")
        let repository = try SQLiteScoringQueueRepository(
            databaseURL: databaseURL,
            now: { Self.baseDate }
        )
        let firstRecord = try insertedRecord(
            try await repository.save(makeInput(partition: firstMatch, hole: 1))
        )
        var dueRecord = firstRecord
        dueRecord.attempt.nextRetryAt = Self.baseDate
        _ = try await repository.replace(dueRecord, expecting: firstRecord)
        _ = try await repository.save(makeInput(partition: firstMatch, hole: 2))
        _ = try await repository.save(makeInput(partition: secondMatch, hole: 1))

        let acquiredFirstLease = try await repository.acquireSyncLease(
            in: firstMatch,
            leaseId: "process-a:first",
            at: Self.baseDate.addingTimeInterval(1)
        )
        let firstLease = try XCTUnwrap(acquiredFirstLease)
        XCTAssertEqual(firstLease.sequence, 1)
        XCTAssertNil(firstLease.attempt.nextRetryAt)
        let duplicateLease = try await repository.acquireSyncLease(
            in: firstMatch,
            leaseId: "process-a:duplicate",
            at: Self.baseDate.addingTimeInterval(2)
        )
        XCTAssertNil(duplicateLease)
        let acquiredOtherLease = try await repository.acquireSyncLease(
            in: secondMatch,
            leaseId: "process-a:other",
            at: Self.baseDate.addingTimeInterval(2)
        )
        let otherLease = try XCTUnwrap(acquiredOtherLease)
        XCTAssertEqual(otherLease.sequence, 1)
        XCTAssertEqual(try scalarInt(
            "SELECT COUNT(*) FROM queue_records WHERE state = 'syncing'",
            databaseURL: databaseURL
        ), 2)
        await repository.close()
    }

    func testGenericReplaceCannotLeaseLaterRecordAheadOfOldest() async throws {
        let databaseURL = temporaryDatabaseURL()
        defer { removeDatabaseRoot(databaseURL) }
        let partition = makePartition(match: "match-generic-lease-bypass")
        let repository = try SQLiteScoringQueueRepository(
            databaseURL: databaseURL,
            now: { Self.baseDate }
        )
        let first = try insertedRecord(
            try await repository.save(makeInput(partition: partition, hole: 1))
        )
        let second = try insertedRecord(
            try await repository.save(makeInput(partition: partition, hole: 2))
        )
        var forgedLease = second
        forgedLease.state = .syncing
        forgedLease.attempt.syncLeaseId = "forged:lease"
        forgedLease.attempt.syncLeaseStartedAt = Self.baseDate.addingTimeInterval(1)
        forgedLease.updatedAt = Self.baseDate.addingTimeInterval(1)

        do {
            _ = try await repository.replace(forgedLease, expecting: second)
            XCTFail("Only atomic oldest-record lease acquisition may enter syncing")
        } catch {
            XCTAssertEqual(error as? SQLiteScoringQueueRepositoryError, .invalidStateTransition)
        }
        let retained = try await repository.records(in: partition)
        XCTAssertEqual(retained, [first, second])
        await repository.close()
    }

    func testRestartRecoversSyncLeaseAsUnknownOutcomeWithSameMutationID() async throws {
        let databaseURL = temporaryDatabaseURL()
        defer { removeDatabaseRoot(databaseURL) }
        let partition = makePartition()
        let firstRepository = try SQLiteScoringQueueRepository(
            databaseURL: databaseURL,
            now: { Self.baseDate }
        )
        let original = try insertedRecord(
            try await firstRepository.save(makeInput(partition: partition, hole: 1))
        )
        _ = try await firstRepository.acquireSyncLease(
            in: partition,
            leaseId: "old-process:lease-1",
            at: Self.baseDate.addingTimeInterval(1)
        )
        await firstRepository.close()

        let reopened = try SQLiteScoringQueueRepository(
            databaseURL: databaseURL,
            now: { Self.baseDate.addingTimeInterval(10) }
        )
        let recovered = try await reopened.recoverInterruptedSync(
            at: Self.baseDate.addingTimeInterval(-10)
        )
        let record = try XCTUnwrap(recovered.first)
        XCTAssertEqual(recovered.count, 1)
        XCTAssertEqual(record.localQueueRecordId, original.localQueueRecordId)
        XCTAssertEqual(record.mutationId, original.mutationId)
        XCTAssertEqual(record.state, .retryable)
        XCTAssertEqual(record.stateReasonCode, .unknownOutcome)
        XCTAssertTrue(record.attempt.everSubmitted)
        XCTAssertEqual(record.attempt.outcomeCertainty, .unknown)
        XCTAssertNil(record.attempt.syncLeaseId)
        XCTAssertNil(record.attempt.syncLeaseStartedAt)
        XCTAssertEqual(record.updatedAt, Self.baseDate.addingTimeInterval(1))
        XCTAssertEqual(record.attempt.nextRetryAt, Self.baseDate.addingTimeInterval(1))
        let persisted = try await reopened.records(in: partition)
        XCTAssertEqual(persisted, [record])
        await reopened.close()
    }

    func testAcknowledgementSurvivesReopenAndRefreshPendingPreventsResubmissionCleanup() async throws {
        let databaseURL = temporaryDatabaseURL()
        defer { removeDatabaseRoot(databaseURL) }
        let partition = makePartition()
        let firstRepository = try SQLiteScoringQueueRepository(
            databaseURL: databaseURL,
            now: { Self.baseDate }
        )
        _ = try await firstRepository.save(makeInput(partition: partition, hole: 1))
        let acquiredSyncing = try await firstRepository.acquireSyncLease(
            in: partition,
            leaseId: "process-a:ack",
            at: Self.baseDate.addingTimeInterval(1)
        )
        let syncing = try XCTUnwrap(acquiredSyncing)
        let transmitted = try await firstRepository.markTransportStarted(
            recordId: syncing.localQueueRecordId,
            leaseId: "process-a:ack",
            at: Self.baseDate.addingTimeInterval(2)
        )
        var acknowledged = transmitted
        acknowledged.state = .acknowledged
        acknowledged.stateReasonCode = nil
        acknowledged.attempt.outcomeCertainty = .knownAccepted
        acknowledged.attempt.syncLeaseId = nil
        acknowledged.attempt.syncLeaseStartedAt = nil
        acknowledged.acknowledgement = ScoringQueueAcknowledgement(
            accepted: true,
            idempotent: true,
            semanticNoop: false,
            canonicalMatchRevision: 13,
            canonicalHoleRevision: 4,
            responseAt: Self.baseDate.addingTimeInterval(3),
            refreshPending: true
        )
        acknowledged.updatedAt = Self.baseDate.addingTimeInterval(3)
        acknowledged = try await firstRepository.replace(acknowledged, expecting: transmitted)
        await firstRepository.close()

        let reopened = try SQLiteScoringQueueRepository(
            databaseURL: databaseURL,
            now: { Self.baseDate.addingTimeInterval(10) }
        )
        let pendingRefresh = try await reopened.oldestUnresolved(in: partition)
        XCTAssertEqual(pendingRefresh, acknowledged)
        do {
            _ = try await reopened.convertToReceipt(
                recordId: acknowledged.localQueueRecordId,
                at: Self.baseDate.addingTimeInterval(4),
                retention: 86_400
            )
            XCTFail("Acknowledged mutation cannot be removed before canonical refresh")
        } catch {
            XCTAssertEqual(error as? SQLiteScoringQueueRepositoryError, .receiptNotReady)
        }

        var refreshed = acknowledged
        refreshed.acknowledgement?.refreshPending = false
        refreshed.lastKnownServer = ScoringQueueLastKnownServer(
            matchRevision: 13,
            holeRevision: 4,
            permissionRevision: 4,
            refreshedAt: Self.baseDate.addingTimeInterval(5)
        )
        refreshed.updatedAt = Self.baseDate.addingTimeInterval(5)
        refreshed = try await reopened.replace(refreshed, expecting: acknowledged)
        let receipt = try await reopened.convertToReceipt(
            recordId: refreshed.localQueueRecordId,
            at: Self.baseDate.addingTimeInterval(6),
            retention: 86_400
        )
        XCTAssertEqual(receipt.kind, .acknowledgement)
        XCTAssertEqual(receipt.mutationId, refreshed.mutationId)
        XCTAssertEqual(receipt.accepted, true)
        XCTAssertEqual(receipt.idempotent, true)
        let recordsAfterReceipt = try await reopened.records(in: partition)
        let receiptsBeforePrune = try await reopened.receipts(for: partition.identity)
        XCTAssertTrue(recordsAfterReceipt.isEmpty)
        XCTAssertEqual(receiptsBeforePrune, [receipt])
        let prunedCount = try await reopened.pruneExpiredReceipts(at: receipt.expiresAt)
        let receiptsAfterPrune = try await reopened.receipts(for: partition.identity)
        XCTAssertEqual(prunedCount, 1)
        XCTAssertTrue(receiptsAfterPrune.isEmpty)
        await reopened.close()
    }

    func testAcknowledgementCannotClearRefreshPendingWithoutCanonicalProof() async throws {
        let databaseURL = temporaryDatabaseURL()
        defer { removeDatabaseRoot(databaseURL) }
        let partition = makePartition()
        let repository = try SQLiteScoringQueueRepository(
            databaseURL: databaseURL,
            now: { Self.baseDate }
        )
        _ = try await repository.save(makeInput(partition: partition, hole: 1))
        let acquired = try await repository.acquireSyncLease(
            in: partition,
            leaseId: "canonical-proof:lease",
            at: Self.baseDate.addingTimeInterval(1)
        )
        let leased = try XCTUnwrap(acquired)
        let transmitted = try await repository.markTransportStarted(
            recordId: leased.localQueueRecordId,
            leaseId: "canonical-proof:lease",
            at: Self.baseDate.addingTimeInterval(2)
        )
        var acknowledged = transmitted
        acknowledged.state = .acknowledged
        acknowledged.attempt.outcomeCertainty = .knownAccepted
        acknowledged.attempt.syncLeaseId = nil
        acknowledged.attempt.syncLeaseStartedAt = nil
        acknowledged.acknowledgement = ScoringQueueAcknowledgement(
            accepted: true,
            idempotent: false,
            semanticNoop: false,
            canonicalMatchRevision: 13,
            canonicalHoleRevision: 4,
            responseAt: Self.baseDate.addingTimeInterval(3),
            refreshPending: true
        )
        acknowledged.updatedAt = Self.baseDate.addingTimeInterval(3)
        acknowledged = try await repository.replace(acknowledged, expecting: transmitted)

        var unproven = acknowledged
        unproven.acknowledgement?.refreshPending = false
        unproven.lastKnownServer = ScoringQueueLastKnownServer(
            matchRevision: 0,
            holeRevision: 0,
            permissionRevision: 0,
            refreshedAt: Self.baseDate.addingTimeInterval(2)
        )
        unproven.updatedAt = Self.baseDate.addingTimeInterval(4)

        do {
            _ = try await repository.replace(unproven, expecting: acknowledged)
            XCTFail("Canonical refresh proof must precede acknowledgement cleanup")
        } catch {
            XCTAssertEqual(
                error as? SQLiteScoringQueueRepositoryError,
                .invalidRecord(.invalidState)
            )
        }
        do {
            _ = try await repository.convertToReceipt(
                recordId: acknowledged.localQueueRecordId,
                at: Self.baseDate.addingTimeInterval(5),
                retention: 86_400
            )
            XCTFail("An unconfirmed acknowledgement must remain durable")
        } catch {
            XCTAssertEqual(error as? SQLiteScoringQueueRepositoryError, .receiptNotReady)
        }
        await repository.close()
    }

    func testPersistedAcknowledgementCannotBypassCanonicalRefreshProofOnReopen() async throws {
        let databaseURL = temporaryDatabaseURL()
        defer { removeDatabaseRoot(databaseURL) }
        let partition = makePartition(match: "match-tampered-ack")
        let firstRepository = try SQLiteScoringQueueRepository(
            databaseURL: databaseURL,
            now: { Self.baseDate }
        )
        _ = try await firstRepository.save(makeInput(partition: partition, hole: 1))
        let acquired = try await firstRepository.acquireSyncLease(
            in: partition,
            leaseId: "tampered-ack:lease",
            at: Self.baseDate.addingTimeInterval(1)
        )
        let leased = try XCTUnwrap(acquired)
        let transmitted = try await firstRepository.markTransportStarted(
            recordId: leased.localQueueRecordId,
            leaseId: "tampered-ack:lease",
            at: Self.baseDate.addingTimeInterval(2)
        )
        var acknowledged = transmitted
        acknowledged.state = .acknowledged
        acknowledged.attempt.outcomeCertainty = .knownAccepted
        acknowledged.attempt.syncLeaseId = nil
        acknowledged.attempt.syncLeaseStartedAt = nil
        acknowledged.acknowledgement = ScoringQueueAcknowledgement(
            accepted: true,
            idempotent: false,
            semanticNoop: false,
            canonicalMatchRevision: 13,
            canonicalHoleRevision: 4,
            responseAt: Self.baseDate.addingTimeInterval(3),
            refreshPending: true
        )
        acknowledged.updatedAt = Self.baseDate.addingTimeInterval(3)
        acknowledged = try await firstRepository.replace(
            acknowledged,
            expecting: transmitted
        )
        await firstRepository.close()

        let originalBlob = try scalarData(
            "SELECT record_blob FROM queue_records",
            databaseURL: databaseURL
        )
        var json = try XCTUnwrap(
            JSONSerialization.jsonObject(with: originalBlob) as? [String: Any]
        )
        var acknowledgementJSON = try XCTUnwrap(
            json["acknowledgement"] as? [String: Any]
        )
        acknowledgementJSON["refreshPending"] = false
        json["acknowledgement"] = acknowledgementJSON
        let tamperedBlob = try JSONSerialization.data(
            withJSONObject: json,
            options: [.sortedKeys]
        )
        try executeSQL(
            "UPDATE queue_records SET record_blob = X'\(tamperedBlob.hexadecimalString)'",
            databaseURL: databaseURL
        )

        let reopened = try SQLiteScoringQueueRepository(
            databaseURL: databaseURL,
            now: { Self.baseDate.addingTimeInterval(10) }
        )
        let unresolved = try await reopened.unresolvedCount(in: partition)
        let replayable = try await reopened.oldestUnresolved(in: partition)
        XCTAssertEqual(unresolved, 1)
        XCTAssertNil(replayable)
        do {
            _ = try await reopened.convertToReceipt(
                recordId: acknowledged.localQueueRecordId,
                at: Self.baseDate.addingTimeInterval(11),
                retention: 86_400
            )
            XCTFail("Unproven acknowledgement must never be converted into a receipt")
        } catch {
            XCTAssertEqual(error as? SQLiteScoringQueueRepositoryError, .recordNotFound)
        }
        XCTAssertEqual(try scalarInt(
            "SELECT COUNT(*) FROM queue_quarantine",
            databaseURL: databaseURL
        ), 1)
        await reopened.close()
    }

    func testCanonicalHandoffAllowsSameTickWhenAcknowledgementRevisionProofMatches() async throws {
        let databaseURL = temporaryDatabaseURL()
        defer { removeDatabaseRoot(databaseURL) }
        let partition = makePartition(match: "match-same-tick-handoff")
        let repository = try SQLiteScoringQueueRepository(
            databaseURL: databaseURL,
            now: { Self.baseDate }
        )
        let first = try insertedRecord(
            try await repository.save(makeInput(partition: partition, hole: 1))
        )
        let sameTick = Self.baseDate.addingTimeInterval(3)
        let secondInput = ScoringQueueSaveInput(
            partition: partition,
            intent: ScoringQueueIntent(
                holeNumber: 2,
                teamOneGrossScores: [4, 5],
                teamTwoGrossScores: [5, 6]
            ),
            base: ScoringQueueBase(
                expectedMatchRevision: 12,
                expectedHoleRevision: 3,
                snapshotId: "snapshot-1",
                snapshotRevision: 1,
                scoringFormat: .bestBall,
                sideSlotCount: 2
            ),
            lastKnownServer: ScoringQueueLastKnownServer(
                matchRevision: 12,
                holeRevision: 3,
                permissionRevision: 4,
                refreshedAt: sameTick
            ),
            originatingAppBuild: "1.0.0-100"
        )
        let second = try insertedRecord(try await repository.save(secondInput))
        let acknowledged = try await makeCanonicallyAcknowledged(
            first,
            repository: repository,
            canonicalMatchRevision: 13,
            canonicalHoleRevision: 4,
            at: sameTick
        )

        let handedOff = try await repository.handOffCanonicalRevisions(
            recordId: second.localQueueRecordId,
            afterAcknowledgedRecordId: acknowledged.localQueueRecordId,
            evidence: handoffEvidence(
                partition: partition,
                server: ScoringQueueLastKnownServer(
                    matchRevision: 13,
                    holeRevision: 3,
                    permissionRevision: 4,
                    refreshedAt: sameTick
                )
            ),
            at: sameTick
        )

        XCTAssertEqual(handedOff.base.expectedMatchRevision, 13)
        XCTAssertEqual(handedOff.base.expectedHoleRevision, 3)
        XCTAssertEqual(handedOff.lastKnownServer.refreshedAt, sameTick)
        await repository.close()
    }

    func testSameHoleCorrectionHandoffRequiresExactAcknowledgedPredecessorCanonicalGross() async throws {
        let databaseURL = temporaryDatabaseURL()
        defer { removeDatabaseRoot(databaseURL) }
        let partition = makePartition(match: "match-same-hole-correction-handoff")
        let repository = try SQLiteScoringQueueRepository(
            databaseURL: databaseURL,
            now: { Self.baseDate }
        )
        let first = try insertedRecord(
            try await repository.save(makeInput(partition: partition, hole: 7, firstScore: 4))
        )
        let canonicalDate = Self.baseDate.addingTimeInterval(3)
        let acknowledged = try await makeCanonicallyAcknowledged(
            first,
            repository: repository,
            canonicalMatchRevision: 13,
            canonicalHoleRevision: 4,
            at: canonicalDate
        )
        let correction = try insertedRecord(
            try await repository.save(makeInput(partition: partition, hole: 7, firstScore: 6))
        )

        let evidence = handoffEvidence(
            partition: partition,
            server: ScoringQueueLastKnownServer(
                matchRevision: 13,
                holeRevision: 4,
                permissionRevision: 4,
                refreshedAt: canonicalDate
            ),
            targetOfficialGross: first.intent.gross
        )
        let handedOff = try await repository.handOffCanonicalRevisions(
            recordId: correction.localQueueRecordId,
            afterAcknowledgedRecordId: acknowledged.localQueueRecordId,
            evidence: evidence,
            at: canonicalDate
        )

        XCTAssertEqual(handedOff.mutationId, correction.mutationId)
        XCTAssertEqual(handedOff.intent, correction.intent)
        XCTAssertEqual(handedOff.base.expectedMatchRevision, 13)
        XCTAssertEqual(handedOff.base.expectedHoleRevision, 4)

        do {
            _ = try await repository.handOffCanonicalRevisions(
                recordId: correction.localQueueRecordId,
                afterAcknowledgedRecordId: acknowledged.localQueueRecordId,
                evidence: handoffEvidence(
                    partition: partition,
                    server: evidence.server,
                    targetOfficialGross: ScoringQueueGross(
                        teamOne: [3, 5],
                        teamTwo: [5, 6]
                    )
                ),
                at: canonicalDate
            )
            XCTFail("Same-hole handoff must reject canonical gross that does not confirm the predecessor")
        } catch {
            XCTAssertEqual(error as? SQLiteScoringQueueRepositoryError, .invalidStateTransition)
        }
        await repository.close()
    }

    func testHandoffSurvivesCrashBeforeAcknowledgementRefreshCompletion() async throws {
        let databaseURL = temporaryDatabaseURL()
        defer { removeDatabaseRoot(databaseURL) }
        let partition = makePartition(match: "match-handoff-refresh-crash")
        let firstRepository = try SQLiteScoringQueueRepository(
            databaseURL: databaseURL,
            now: { Self.baseDate }
        )
        let first = try insertedRecord(
            try await firstRepository.save(makeInput(partition: partition, hole: 7, firstScore: 4))
        )
        let canonicalDate = Self.baseDate.addingTimeInterval(3)
        let acknowledgedPendingRefresh = try await makeCanonicallyAcknowledged(
            first,
            repository: firstRepository,
            canonicalMatchRevision: 13,
            canonicalHoleRevision: 4,
            at: canonicalDate,
            completeRefresh: false
        )
        let correction = try insertedRecord(
            try await firstRepository.save(makeInput(partition: partition, hole: 7, firstScore: 6))
        )
        _ = try await firstRepository.handOffCanonicalRevisions(
            recordId: correction.localQueueRecordId,
            afterAcknowledgedRecordId: acknowledgedPendingRefresh.localQueueRecordId,
            evidence: handoffEvidence(
                partition: partition,
                server: ScoringQueueLastKnownServer(
                    matchRevision: 13,
                    holeRevision: 4,
                    permissionRevision: 4,
                    refreshedAt: canonicalDate
                ),
                targetOfficialGross: first.intent.gross
            ),
            at: canonicalDate
        )
        await firstRepository.close()

        let reopened = try SQLiteScoringQueueRepository(
            databaseURL: databaseURL,
            now: { canonicalDate.addingTimeInterval(1) }
        )
        let records = try await reopened.records(in: partition)
        let retainedPredecessor = try XCTUnwrap(
            records.first(where: { $0.localQueueRecordId == first.localQueueRecordId })
        )
        let handedOffCorrection = try XCTUnwrap(
            records.first(where: { $0.localQueueRecordId == correction.localQueueRecordId })
        )

        XCTAssertEqual(retainedPredecessor.state, .acknowledged)
        XCTAssertEqual(retainedPredecessor.acknowledgement?.refreshPending, true)
        XCTAssertFalse(retainedPredecessor.isReceiptEligible)
        XCTAssertEqual(handedOffCorrection.base.expectedMatchRevision, 13)
        XCTAssertEqual(handedOffCorrection.base.expectedHoleRevision, 4)
        XCTAssertEqual(handedOffCorrection.mutationId, correction.mutationId)
        XCTAssertEqual(handedOffCorrection.intent, correction.intent)
        await reopened.close()
    }

    func testCanonicalHandoffCannotSkipAnUnresolvedSequence() async throws {
        let databaseURL = temporaryDatabaseURL()
        defer { removeDatabaseRoot(databaseURL) }
        let partition = makePartition(match: "match-no-leapfrog-handoff")
        let repository = try SQLiteScoringQueueRepository(
            databaseURL: databaseURL,
            now: { Self.baseDate }
        )
        let first = try insertedRecord(
            try await repository.save(makeInput(partition: partition, hole: 1))
        )
        _ = try await repository.save(makeInput(partition: partition, hole: 2))
        let third = try insertedRecord(
            try await repository.save(makeInput(partition: partition, hole: 3))
        )
        let acknowledged = try await makeCanonicallyAcknowledged(
            first,
            repository: repository,
            canonicalMatchRevision: 13,
            canonicalHoleRevision: 4,
            at: Self.baseDate.addingTimeInterval(3)
        )

        do {
            _ = try await repository.handOffCanonicalRevisions(
                recordId: third.localQueueRecordId,
                afterAcknowledgedRecordId: acknowledged.localQueueRecordId,
                evidence: handoffEvidence(
                    partition: partition,
                    server: ScoringQueueLastKnownServer(
                        matchRevision: 13,
                        holeRevision: 3,
                        permissionRevision: 4,
                        refreshedAt: Self.baseDate.addingTimeInterval(4)
                    )
                ),
                at: Self.baseDate.addingTimeInterval(4)
            )
            XCTFail("Revision handoff must not leapfrog unresolved sequence two")
        } catch {
            XCTAssertEqual(error as? SQLiteScoringQueueRepositoryError, .invalidStateTransition)
        }
        let retained = try await repository.records(in: partition)
        XCTAssertEqual(retained.first(where: { $0.sequence == 3 })?.base, third.base)
        await repository.close()
    }

    func testCanonicalHandoffCannotRollBackTargetRevisionBase() async throws {
        let databaseURL = temporaryDatabaseURL()
        defer { removeDatabaseRoot(databaseURL) }
        let partition = makePartition(match: "match-no-revision-rollback")
        let repository = try SQLiteScoringQueueRepository(
            databaseURL: databaseURL,
            now: { Self.baseDate }
        )
        let first = try insertedRecord(
            try await repository.save(makeInput(partition: partition, hole: 1))
        )
        let newerInput = ScoringQueueSaveInput(
            partition: partition,
            intent: ScoringQueueIntent(
                holeNumber: 2,
                teamOneGrossScores: [4, 5],
                teamTwoGrossScores: [5, 6]
            ),
            base: ScoringQueueBase(
                expectedMatchRevision: 20,
                expectedHoleRevision: 5,
                snapshotId: "snapshot-1",
                snapshotRevision: 1,
                scoringFormat: .bestBall,
                sideSlotCount: 2
            ),
            lastKnownServer: ScoringQueueLastKnownServer(
                matchRevision: 20,
                holeRevision: 5,
                permissionRevision: 4,
                refreshedAt: Self.baseDate
            ),
            originatingAppBuild: "1.0.0-100"
        )
        let target = try insertedRecord(try await repository.save(newerInput))
        let acknowledged = try await makeCanonicallyAcknowledged(
            first,
            repository: repository,
            canonicalMatchRevision: 13,
            canonicalHoleRevision: 4,
            at: Self.baseDate.addingTimeInterval(3)
        )

        do {
            _ = try await repository.handOffCanonicalRevisions(
                recordId: target.localQueueRecordId,
                afterAcknowledgedRecordId: acknowledged.localQueueRecordId,
                evidence: handoffEvidence(
                    partition: partition,
                    server: ScoringQueueLastKnownServer(
                        matchRevision: 13,
                        holeRevision: 5,
                        permissionRevision: 4,
                        refreshedAt: Self.baseDate.addingTimeInterval(4)
                    )
                ),
                at: Self.baseDate.addingTimeInterval(4)
            )
            XCTFail("Canonical handoff must never lower an already newer revision base")
        } catch {
            XCTAssertEqual(error as? SQLiteScoringQueueRepositoryError, .invalidStateTransition)
        }
        let retained = try await repository.records(in: partition)
        XCTAssertEqual(retained.first(where: { $0.sequence == target.sequence })?.base, target.base)
        await repository.close()
    }

    func testCanonicalHandoffCannotRollBackPermissionRevision() async throws {
        let databaseURL = temporaryDatabaseURL()
        defer { removeDatabaseRoot(databaseURL) }
        let partition = makePartition(match: "match-no-permission-rollback")
        let repository = try SQLiteScoringQueueRepository(
            databaseURL: databaseURL,
            now: { Self.baseDate }
        )
        let predecessor = try insertedRecord(
            try await repository.save(makeInput(partition: partition, hole: 1))
        )
        let targetInput = ScoringQueueSaveInput(
            partition: partition,
            intent: ScoringQueueIntent(
                holeNumber: 2,
                teamOneGrossScores: [4, 5],
                teamTwoGrossScores: [5, 6]
            ),
            base: ScoringQueueBase(
                expectedMatchRevision: 12,
                expectedHoleRevision: 3,
                snapshotId: "snapshot-1",
                snapshotRevision: 1,
                scoringFormat: .bestBall,
                sideSlotCount: 2
            ),
            lastKnownServer: ScoringQueueLastKnownServer(
                matchRevision: 12,
                holeRevision: 3,
                permissionRevision: 10,
                refreshedAt: Self.baseDate
            ),
            originatingAppBuild: "1.0.0-100"
        )
        let target = try insertedRecord(try await repository.save(targetInput))
        let acknowledged = try await makeCanonicallyAcknowledged(
            predecessor,
            repository: repository,
            canonicalMatchRevision: 13,
            canonicalHoleRevision: 4,
            at: Self.baseDate.addingTimeInterval(3)
        )

        do {
            _ = try await repository.handOffCanonicalRevisions(
                recordId: target.localQueueRecordId,
                afterAcknowledgedRecordId: acknowledged.localQueueRecordId,
                evidence: handoffEvidence(
                    partition: partition,
                    server: ScoringQueueLastKnownServer(
                        matchRevision: 13,
                        holeRevision: 3,
                        permissionRevision: 9,
                        refreshedAt: Self.baseDate.addingTimeInterval(4)
                    )
                ),
                at: Self.baseDate.addingTimeInterval(4)
            )
            XCTFail("Canonical handoff must never lower the target permission revision")
        } catch {
            XCTAssertEqual(error as? SQLiteScoringQueueRepositoryError, .invalidStateTransition)
        }
        let retained = try await repository.records(in: partition)
        XCTAssertEqual(
            retained.first(where: { $0.sequence == target.sequence })?.lastKnownServer,
            target.lastKnownServer
        )
        await repository.close()
    }

    func testExpiredReceiptsAreNotRetainedIndefinitelyWithoutAnotherScore() async throws {
        let databaseURL = temporaryDatabaseURL()
        defer { removeDatabaseRoot(databaseURL) }
        let partition = makePartition()
        let firstRepository = try SQLiteScoringQueueRepository(
            databaseURL: databaseURL,
            now: { Self.baseDate }
        )
        let queued = try insertedRecord(
            try await firstRepository.save(makeInput(partition: partition, hole: 1))
        )
        var resolved = queued
        resolved.state = .resolved
        resolved.resolution = ScoringQueueResolution(
            reason: .userAbandoned,
            resolvedAt: Self.baseDate,
            relatedLocalQueueRecordId: nil
        )
        resolved.updatedAt = Self.baseDate
        resolved = try await firstRepository.replace(resolved, expecting: queued)
        _ = try await firstRepository.convertToReceipt(
            recordId: resolved.localQueueRecordId,
            at: Self.baseDate,
            retention: 1
        )
        await firstRepository.close()

        let reopened = try SQLiteScoringQueueRepository(
            databaseURL: databaseURL,
            now: { Self.baseDate.addingTimeInterval(2) }
        )
        let receipts = try await reopened.receipts(for: partition.identity)

        XCTAssertTrue(receipts.isEmpty, "Expired reliability metadata must not persist indefinitely.")
        await reopened.close()
    }

    func testReceiptBlobExpiryCannotBeExtendedByCorruptIndexedExpiry() async throws {
        let databaseURL = temporaryDatabaseURL()
        defer { removeDatabaseRoot(databaseURL) }
        let partition = makePartition(match: "match-receipt-expiry-integrity")
        let firstRepository = try SQLiteScoringQueueRepository(
            databaseURL: databaseURL,
            now: { Self.baseDate }
        )
        let queued = try insertedRecord(
            try await firstRepository.save(makeInput(partition: partition, hole: 1))
        )
        var resolved = queued
        resolved.state = .resolved
        resolved.resolution = ScoringQueueResolution(
            reason: .userAbandoned,
            resolvedAt: Self.baseDate,
            relatedLocalQueueRecordId: nil
        )
        resolved = try await firstRepository.replace(resolved, expecting: queued)
        _ = try await firstRepository.convertToReceipt(
            recordId: resolved.localQueueRecordId,
            at: Self.baseDate,
            retention: 1
        )
        await firstRepository.close()
        try executeSQL(
            "UPDATE queue_receipts SET expires_at = \(Self.baseDate.addingTimeInterval(31_536_000).timeIntervalSince1970)",
            databaseURL: databaseURL
        )

        let reopened = try SQLiteScoringQueueRepository(
            databaseURL: databaseURL,
            now: { Self.baseDate.addingTimeInterval(2) }
        )
        let receipts = try await reopened.receipts(for: partition.identity)
        XCTAssertTrue(receipts.isEmpty)
        XCTAssertEqual(try scalarInt(
            "SELECT COUNT(*) FROM queue_receipts",
            databaseURL: databaseURL
        ), 0)
        await reopened.close()
    }

    func testCorruptBlobIsQuarantinedRawWithoutDeletionAndBlocksLaterReplay() async throws {
        let databaseURL = temporaryDatabaseURL()
        defer { removeDatabaseRoot(databaseURL) }
        let partition = makePartition()
        let firstRepository = try SQLiteScoringQueueRepository(
            databaseURL: databaseURL,
            now: { Self.baseDate }
        )
        _ = try await firstRepository.save(makeInput(partition: partition, hole: 1))
        await firstRepository.close()
        try executeSQL(
            "UPDATE queue_records SET record_blob = X'7B00'",
            databaseURL: databaseURL
        )

        let reopened = try SQLiteScoringQueueRepository(
            databaseURL: databaseURL,
            now: { Self.baseDate.addingTimeInterval(10) }
        )
        let recordsAfterQuarantine = try await reopened.records(in: partition)
        let unresolvedAfterQuarantine = try await reopened.unresolvedCount(in: partition)
        let blockedByQuarantine = try await reopened.oldestUnresolved(in: partition)
        XCTAssertTrue(recordsAfterQuarantine.isEmpty)
        XCTAssertEqual(unresolvedAfterQuarantine, 1)
        XCTAssertNil(blockedByQuarantine)
        let later = try insertedRecord(
            try await reopened.save(makeInput(partition: partition, hole: 2))
        )
        XCTAssertEqual(later.sequence, 2)
        let stillBlocked = try await reopened.oldestUnresolved(in: partition)
        XCTAssertNil(stillBlocked)
        await reopened.close()

        XCTAssertEqual(try scalarText(
            "SELECT reason FROM queue_quarantine",
            databaseURL: databaseURL
        ), ScoringQueueQuarantineReason.corruptRecord.rawValue)
        XCTAssertEqual(try scalarText(
            "SELECT hex(raw_blob) FROM queue_quarantine",
            databaseURL: databaseURL
        ), "7B00")
        XCTAssertEqual(try scalarInt(
            "SELECT COUNT(*) FROM queue_records",
            databaseURL: databaseURL
        ), 1)
    }

    func testIndexBlobPartitionMismatchBlocksBothAmbiguousPartitions() async throws {
        let databaseURL = temporaryDatabaseURL()
        defer { removeDatabaseRoot(databaseURL) }
        let blobPartition = makePartition(match: "match-blob")
        let indexedPartition = ScoringQueuePartition(
            authUserId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            playerId: "player-indexed",
            tournamentId: "tournament-indexed",
            matchId: "match-indexed"
        )
        let firstRepository = try SQLiteScoringQueueRepository(
            databaseURL: databaseURL,
            now: { Self.baseDate }
        )
        _ = try await firstRepository.save(makeInput(partition: blobPartition, hole: 1))
        await firstRepository.close()

        try executeSQL(
            """
            UPDATE queue_records
            SET auth_user_id = '\(indexedPartition.authUserId)',
                player_id = '\(indexedPartition.playerId)',
                tournament_id = '\(indexedPartition.tournamentId)',
                match_id = '\(indexedPartition.matchId)'
            """,
            databaseURL: databaseURL
        )

        let reopened = try SQLiteScoringQueueRepository(
            databaseURL: databaseURL,
            now: { Self.baseDate.addingTimeInterval(10) }
        )
        _ = try await reopened.records(in: indexedPartition)
        let blobUnresolvedCount = try await reopened.unresolvedCount(in: blobPartition)
        let blobOldest = try await reopened.oldestUnresolved(in: blobPartition)
        let indexedUnresolvedCount = try await reopened.unresolvedCount(in: indexedPartition)
        let indexedOldest = try await reopened.oldestUnresolved(in: indexedPartition)

        XCTAssertEqual(blobUnresolvedCount, 1)
        XCTAssertNil(blobOldest)
        XCTAssertEqual(indexedUnresolvedCount, 1)
        XCTAssertNil(indexedOldest)
        _ = try await reopened.save(makeInput(partition: blobPartition, hole: 2))
        _ = try await reopened.save(makeInput(partition: indexedPartition, hole: 2))
        let blobStillBlocked = try await reopened.oldestUnresolved(in: blobPartition)
        let indexedStillBlocked = try await reopened.oldestUnresolved(in: indexedPartition)
        XCTAssertNil(
            blobStillBlocked,
            "A later score must not leapfrog the ambiguity under the decoded partition."
        )
        XCTAssertNil(
            indexedStillBlocked,
            "A later score must not leapfrog the ambiguity under the indexed partition."
        )
        XCTAssertEqual(try scalarInt(
            "SELECT COUNT(*) FROM queue_quarantine WHERE reason = 'identityIntegrity'",
            databaseURL: databaseURL
        ), 2)
        await reopened.close()
    }

    func testValidBlobPartitionMutationBlocksBothIndexedAndDecodedPartitions() async throws {
        let databaseURL = temporaryDatabaseURL()
        defer { removeDatabaseRoot(databaseURL) }
        let indexedPartition = makePartition(match: "match-indexed-valid")
        let decodedPartition = ScoringQueuePartition(
            authUserId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            playerId: "player-decoded",
            tournamentId: "tournament-decoded",
            matchId: "match-decoded-valid"
        )
        let firstRepository = try SQLiteScoringQueueRepository(
            databaseURL: databaseURL,
            now: { Self.baseDate }
        )
        _ = try await firstRepository.save(makeInput(partition: indexedPartition, hole: 1))
        await firstRepository.close()

        let originalBlob = try scalarData(
            "SELECT record_blob FROM queue_records",
            databaseURL: databaseURL
        )
        var json = try XCTUnwrap(
            JSONSerialization.jsonObject(with: originalBlob) as? [String: Any]
        )
        var partitionJSON = try XCTUnwrap(json["partition"] as? [String: Any])
        partitionJSON["authUserId"] = decodedPartition.authUserId
        partitionJSON["playerId"] = decodedPartition.playerId
        partitionJSON["tournamentId"] = decodedPartition.tournamentId
        partitionJSON["matchId"] = decodedPartition.matchId
        json["partition"] = partitionJSON
        let validButMismatchedBlob = try JSONSerialization.data(
            withJSONObject: json,
            options: [.sortedKeys]
        )
        try executeSQL(
            "UPDATE queue_records SET record_blob = X'\(validButMismatchedBlob.hexadecimalString)'",
            databaseURL: databaseURL
        )

        let reopened = try SQLiteScoringQueueRepository(
            databaseURL: databaseURL,
            now: { Self.baseDate.addingTimeInterval(10) }
        )
        let indexedCount = try await reopened.unresolvedCount(in: indexedPartition)
        let decodedCount = try await reopened.unresolvedCount(in: decodedPartition)
        let indexedOldest = try await reopened.oldestUnresolved(in: indexedPartition)
        let decodedOldest = try await reopened.oldestUnresolved(in: decodedPartition)
        XCTAssertEqual(indexedCount, 1)
        XCTAssertEqual(decodedCount, 1)
        XCTAssertNil(indexedOldest)
        XCTAssertNil(decodedOldest)

        _ = try await reopened.save(makeInput(partition: indexedPartition, hole: 2))
        _ = try await reopened.save(makeInput(partition: decodedPartition, hole: 2))
        let indexedStillBlocked = try await reopened.oldestUnresolved(in: indexedPartition)
        let decodedStillBlocked = try await reopened.oldestUnresolved(in: decodedPartition)
        XCTAssertNil(indexedStillBlocked)
        XCTAssertNil(decodedStillBlocked)
        XCTAssertEqual(try scalarInt(
            "SELECT COUNT(*) FROM queue_quarantine WHERE reason = 'identityIntegrity'",
            databaseURL: databaseURL
        ), 2)
        await reopened.close()
    }

    func testInvalidBlobIdentityCannotEscapeIndexedPartitionQuarantine() async throws {
        let databaseURL = temporaryDatabaseURL()
        defer { removeDatabaseRoot(databaseURL) }
        let indexedPartition = makePartition(match: "match-indexed-integrity")
        let firstRepository = try SQLiteScoringQueueRepository(
            databaseURL: databaseURL,
            now: { Self.baseDate }
        )
        _ = try await firstRepository.save(makeInput(partition: indexedPartition, hole: 1))
        await firstRepository.close()

        let originalBlob = try scalarData(
            "SELECT record_blob FROM queue_records",
            databaseURL: databaseURL
        )
        var json = try XCTUnwrap(
            JSONSerialization.jsonObject(with: originalBlob) as? [String: Any]
        )
        var partitionJSON = try XCTUnwrap(json["partition"] as? [String: Any])
        partitionJSON["authUserId"] = "not-a-valid-auth-uuid"
        json["partition"] = partitionJSON
        let invalidBlob = try JSONSerialization.data(withJSONObject: json, options: [.sortedKeys])
        try executeSQL(
            "UPDATE queue_records SET record_blob = X'\(invalidBlob.hexadecimalString)'",
            databaseURL: databaseURL
        )

        let reopened = try SQLiteScoringQueueRepository(
            databaseURL: databaseURL,
            now: { Self.baseDate.addingTimeInterval(10) }
        )
        let unresolved = try await reopened.unresolvedCount(in: indexedPartition)
        let replayable = try await reopened.oldestUnresolved(in: indexedPartition)
        XCTAssertEqual(unresolved, 1)
        XCTAssertNil(replayable)
        _ = try await reopened.save(makeInput(partition: indexedPartition, hole: 2))
        let stillBlocked = try await reopened.oldestUnresolved(in: indexedPartition)
        XCTAssertNil(
            stillBlocked,
            "An invalid decoded identity must remain a blocking quarantine under the trusted indexed partition."
        )
        await reopened.close()
    }

    func testRelatedAuthAndTournamentPartitionsBecomeReviewOnlyWithoutDeletion() async throws {
        let databaseURL = temporaryDatabaseURL()
        defer { removeDatabaseRoot(databaseURL) }
        let active = makePartition(match: "active-match").identity
        let staleTournament = ScoringQueuePartition(
            authUserId: active.authUserId,
            playerId: active.playerId,
            tournamentId: "tournament-2025",
            matchId: "old-tournament-match"
        )
        let changedAuth = ScoringQueuePartition(
            authUserId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            playerId: active.playerId,
            tournamentId: active.tournamentId,
            matchId: "changed-auth-match"
        )
        let unrelated = ScoringQueuePartition(
            authUserId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
            playerId: "player-unrelated",
            tournamentId: active.tournamentId,
            matchId: "unrelated-match"
        )
        let repository = try SQLiteScoringQueueRepository(
            databaseURL: databaseURL,
            now: { Self.baseDate }
        )
        for partition in [staleTournament, changedAuth, unrelated] {
            _ = try await repository.save(makeInput(partition: partition, hole: 1))
        }

        let changed = try await repository.markRelatedPartitionsForReview(
            activeIdentity: active,
            at: Self.baseDate.addingTimeInterval(10)
        )
        let staleRecords = try await repository.records(in: staleTournament)
        let changedAuthRecords = try await repository.records(in: changedAuth)
        let unrelatedRecords = try await repository.records(in: unrelated)
        let staleCount = try await repository.unresolvedCount(in: staleTournament)
        let changedAuthCount = try await repository.unresolvedCount(in: changedAuth)
        let unrelatedCount = try await repository.unresolvedCount(in: unrelated)

        XCTAssertEqual(changed, 2)
        XCTAssertEqual(staleRecords.first?.state, .actionRequired)
        XCTAssertEqual(staleRecords.first?.stateReasonCode, .staleTournament)
        XCTAssertEqual(changedAuthRecords.first?.state, .actionRequired)
        XCTAssertEqual(changedAuthRecords.first?.stateReasonCode, .identityChanged)
        XCTAssertEqual(unrelatedRecords.first?.state, .queued)
        XCTAssertEqual(staleCount, 1)
        XCTAssertEqual(changedAuthCount, 1)
        XCTAssertEqual(unrelatedCount, 1)

        let repeated = try await repository.markRelatedPartitionsForReview(
            activeIdentity: active,
            at: Self.baseDate.addingTimeInterval(11)
        )
        XCTAssertEqual(
            repeated,
            0,
            "Repeated activation must be idempotent after related partitions are already review-only."
        )
        await repository.close()
    }

    func testUnsupportedFutureSchemaIsPreservedAndFailsClosed() throws {
        let databaseURL = temporaryDatabaseURL()
        defer { removeDatabaseRoot(databaseURL) }
        try FileManager.default.createDirectory(
            at: databaseURL.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )
        try executeSQL("PRAGMA user_version = 2", databaseURL: databaseURL)

        XCTAssertThrowsError(try SQLiteScoringQueueRepository(databaseURL: databaseURL)) { error in
            XCTAssertEqual(error as? SQLiteScoringQueueRepositoryError, .unsupportedSchema(2))
        }
        XCTAssertTrue(FileManager.default.fileExists(atPath: databaseURL.path))
        XCTAssertEqual(try scalarInt("PRAGMA user_version", databaseURL: databaseURL), 2)
    }

    func testUnsupportedSchemaFailureStillProtectsExistingDatabaseFile() throws {
        let databaseURL = temporaryDatabaseURL()
        defer { removeDatabaseRoot(databaseURL) }
        try FileManager.default.createDirectory(
            at: databaseURL.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )
        try executeSQL("PRAGMA user_version = 2", databaseURL: databaseURL)
        let fileManager = FixedApplicationSupportFileManager(
            applicationSupport: databaseURL.deletingLastPathComponent()
        )

        XCTAssertThrowsError(
            try SQLiteScoringQueueRepository(
                databaseURL: databaseURL,
                fileManager: ScoringQueueFileManager(fileManager)
            )
        ) { error in
            XCTAssertEqual(error as? SQLiteScoringQueueRepositoryError, .unsupportedSchema(2))
        }
        XCTAssertTrue(
            fileManager.protectedPaths.contains(databaseURL.path),
            "A fail-closed migration path must not leave an existing scoring database weakly protected."
        )
    }

    func testMatchAndIdentityUnresolvedBoundsFailClosedWithoutDeletingIntent() async throws {
        let databaseURL = temporaryDatabaseURL()
        defer { removeDatabaseRoot(databaseURL) }
        let repository = try SQLiteScoringQueueRepository(
            databaseURL: databaseURL,
            now: { Self.baseDate }
        )
        let identity = makePartition().identity

        for matchIndex in 0..<4 {
            let partition = ScoringQueuePartition(
                authUserId: identity.authUserId,
                playerId: identity.playerId,
                tournamentId: identity.tournamentId,
                matchId: "bounded-match-\(matchIndex)"
            )
            try fillMatchToLimit(partition, databaseURL: databaseURL)
            let matchCount = try await repository.unresolvedCount(in: partition)
            XCTAssertEqual(
                matchCount,
                ScoringQueueContract.maximumUnresolvedRecordsPerMatch
            )
            do {
                _ = try await repository.save(
                    makeInput(partition: partition, hole: 1, firstScore: 8)
                )
                XCTFail("The 37th unresolved mutation in one Match must fail")
            } catch {
                XCTAssertEqual(error as? SQLiteScoringQueueRepositoryError, .matchQueueLimit)
            }
        }

        let fullIdentityCount = try await repository.unresolvedCount(for: identity)
        XCTAssertEqual(
            fullIdentityCount,
            ScoringQueueContract.maximumUnresolvedRecordsPerIdentityTournament
        )
        let fifthMatch = ScoringQueuePartition(
            authUserId: identity.authUserId,
            playerId: identity.playerId,
            tournamentId: identity.tournamentId,
            matchId: "bounded-match-4"
        )
        do {
            _ = try await repository.save(makeInput(partition: fifthMatch, hole: 1))
            XCTFail("The 145th unresolved mutation in one identity/tournament must fail")
        } catch {
            XCTAssertEqual(error as? SQLiteScoringQueueRepositoryError, .identityQueueLimit)
        }
        let retainedIdentityCount = try await repository.unresolvedCount(for: identity)
        XCTAssertEqual(
            retainedIdentityCount,
            ScoringQueueContract.maximumUnresolvedRecordsPerIdentityTournament
        )
        await repository.close()
    }

    func testDeterministicSafeRebaseIsNarrowlyAllowedAndOrdinaryConflictRequeueIsRejected() async throws {
        let databaseURL = temporaryDatabaseURL()
        defer { removeDatabaseRoot(databaseURL) }
        let partition = makePartition()
        let repository = try SQLiteScoringQueueRepository(
            databaseURL: databaseURL,
            now: { Self.baseDate }
        )
        _ = try await repository.save(
            makeInput(partition: partition, hole: 1, expectedHoleRevision: 0)
        )
        let acquiredSyncing = try await repository.acquireSyncLease(
            in: partition,
            leaseId: "process-a:conflict",
            at: Self.baseDate.addingTimeInterval(1)
        )
        let syncing = try XCTUnwrap(acquiredSyncing)
        var conflict = try await repository.markTransportStarted(
            recordId: syncing.localQueueRecordId,
            leaseId: "process-a:conflict",
            at: Self.baseDate.addingTimeInterval(2)
        )
        conflict.state = .conflict
        conflict.stateReasonCode = .revision
        conflict.attempt.outcomeCertainty = .knownRejected
        conflict.attempt.syncLeaseId = nil
        conflict.attempt.syncLeaseStartedAt = nil
        conflict.conflict = ScoringQueueConflict(
            officialGross: nil,
            currentMatchRevision: 13,
            currentHoleRevision: 0,
            currentPermissionRevision: 4,
            refreshRequired: true,
            recordedAt: Self.baseDate.addingTimeInterval(3)
        )
        conflict.updatedAt = Self.baseDate.addingTimeInterval(3)
        conflict = try await repository.replace(conflict, expecting: leaseWithTransportState(
            syncing,
            at: Self.baseDate.addingTimeInterval(2)
        ))

        var unsafe = conflict
        unsafe.state = .queued
        unsafe.stateReasonCode = nil
        unsafe.conflict = nil
        unsafe.updatedAt = Self.baseDate.addingTimeInterval(4)
        do {
            _ = try await repository.replace(unsafe, expecting: conflict)
            XCTFail("Conflict cannot be generically returned to queued")
        } catch {
            XCTAssertEqual(error as? SQLiteScoringQueueRepositoryError, .invalidStateTransition)
        }

        var rebased = unsafe
        rebased.base.expectedMatchRevision = 13
        rebased.base.expectedHoleRevision = 0
        rebased.base.automaticRebaseCount = 1
        rebased.lastKnownServer = ScoringQueueLastKnownServer(
            matchRevision: 13,
            holeRevision: 0,
            permissionRevision: 4,
            refreshedAt: Self.baseDate.addingTimeInterval(4)
        )
        rebased.updatedAt = Self.baseDate.addingTimeInterval(4)
        do {
            _ = try await repository.replace(rebased, expecting: conflict)
            XCTFail("Even a well-shaped rebase must use the dedicated canonical-proof operation")
        } catch {
            XCTAssertEqual(error as? SQLiteScoringQueueRepositoryError, .invalidStateTransition)
        }
        let canonical = try XCTUnwrap(
            CoordinatorQueueFixtures.canonicalResponse(
                partition: partition,
                matchRevision: 13,
                permissionRevision: 4,
                scores: [],
                status: .inProgress,
                canScore: true,
                readOnly: false,
                snapshotId: "snapshot-1"
            ).data.scoring
        )
        let persistedRebase = try await repository.applyDeterministicSafeRebase(
            recordId: conflict.localQueueRecordId,
            canonical: canonical,
            at: Self.baseDate.addingTimeInterval(4)
        )
        XCTAssertEqual(persistedRebase.state, .queued)
        XCTAssertEqual(persistedRebase.base.expectedMatchRevision, 13)
        XCTAssertEqual(persistedRebase.base.expectedHoleRevision, 0)
        XCTAssertEqual(persistedRebase.base.automaticRebaseCount, 1)
        XCTAssertNil(persistedRebase.conflict)
        await repository.close()
    }

    func testDeterministicSafeRebaseRejectsDifferingOfficialTarget() async throws {
        let databaseURL = temporaryDatabaseURL()
        defer { removeDatabaseRoot(databaseURL) }
        let partition = makePartition(match: "match-forged-rebase")
        let baseOfficial = ScoringQueueGross(
            teamOne: [4, 5],
            teamTwo: [5, 6]
        )
        let repository = try SQLiteScoringQueueRepository(
            databaseURL: databaseURL,
            now: { Self.baseDate }
        )
        _ = try await repository.save(
            makeInput(
                partition: partition,
                hole: 1,
                firstScore: 6,
                official: baseOfficial
            )
        )
        let acquired = try await repository.acquireSyncLease(
            in: partition,
            leaseId: "forged-rebase:lease",
            at: Self.baseDate.addingTimeInterval(1)
        )
        let leased = try XCTUnwrap(acquired)
        var conflict = try await repository.markTransportStarted(
            recordId: leased.localQueueRecordId,
            leaseId: "forged-rebase:lease",
            at: Self.baseDate.addingTimeInterval(2)
        )
        let differingOfficial = ScoringQueueGross(
            teamOne: [7, 5],
            teamTwo: [5, 6]
        )
        conflict.state = .conflict
        conflict.stateReasonCode = .revision
        conflict.attempt.outcomeCertainty = .knownRejected
        conflict.attempt.syncLeaseId = nil
        conflict.attempt.syncLeaseStartedAt = nil
        conflict.conflict = ScoringQueueConflict(
            officialGross: differingOfficial,
            currentMatchRevision: 13,
            currentHoleRevision: 4,
            currentPermissionRevision: 4,
            refreshRequired: true,
            recordedAt: Self.baseDate.addingTimeInterval(3)
        )
        conflict.updatedAt = Self.baseDate.addingTimeInterval(3)
        conflict = try await repository.replace(
            conflict,
            expecting: leaseWithTransportState(
                leased,
                at: Self.baseDate.addingTimeInterval(2)
            )
        )
        let canonical = try XCTUnwrap(
            CoordinatorQueueFixtures.canonicalResponse(
                partition: partition,
                matchRevision: 13,
                permissionRevision: 4,
                scores: [CoordinatorQueueFixtures.score(
                    holeNumber: 1,
                    revision: 4,
                    gross: differingOfficial
                )],
                status: .inProgress,
                canScore: true,
                readOnly: false,
                snapshotId: "snapshot-1"
            ).data.scoring
        )

        do {
            _ = try await repository.applyDeterministicSafeRebase(
                recordId: conflict.localQueueRecordId,
                canonical: canonical,
                at: Self.baseDate.addingTimeInterval(4)
            )
            XCTFail("A changed official score must remain conflict and require review")
        } catch {
            XCTAssertEqual(error as? SQLiteScoringQueueRepositoryError, .invalidStateTransition)
        }
        let retained = try await repository.records(in: partition)
        XCTAssertEqual(retained, [conflict])
        await repository.close()
    }

    func testQueuedSameStateReplacementCannotRewriteCanonicalRevisionBase() async throws {
        let databaseURL = temporaryDatabaseURL()
        defer { removeDatabaseRoot(databaseURL) }
        let partition = makePartition()
        let repository = try SQLiteScoringQueueRepository(
            databaseURL: databaseURL,
            now: { Self.baseDate }
        )
        let queued = try insertedRecord(
            try await repository.save(makeInput(partition: partition, hole: 1))
        )
        var tampered = queued
        tampered.base.expectedMatchRevision += 1
        tampered.base.expectedHoleRevision += 1
        tampered.updatedAt = Self.baseDate.addingTimeInterval(1)

        do {
            _ = try await repository.replace(tampered, expecting: queued)
            XCTFail("Queued same-state replacement must not bypass deterministic canonical rebase guards")
        } catch {
            XCTAssertEqual(error as? SQLiteScoringQueueRepositoryError, .invalidStateTransition)
        }
        let records = try await repository.records(in: partition)
        XCTAssertEqual(records, [queued])
        await repository.close()
    }

    func testOrdinaryCrossStateReplacementCannotRewriteCanonicalRevisionBase() async throws {
        let databaseURL = temporaryDatabaseURL()
        defer { removeDatabaseRoot(databaseURL) }
        let partition = makePartition()
        let repository = try SQLiteScoringQueueRepository(
            databaseURL: databaseURL,
            now: { Self.baseDate }
        )
        _ = try await repository.save(makeInput(partition: partition, hole: 1))
        let acquired = try await repository.acquireSyncLease(
            in: partition,
            leaseId: "cross-state-base:lease",
            at: Self.baseDate.addingTimeInterval(1)
        )
        let leased = try XCTUnwrap(acquired)
        let transmitted = try await repository.markTransportStarted(
            recordId: leased.localQueueRecordId,
            leaseId: "cross-state-base:lease",
            at: Self.baseDate.addingTimeInterval(2)
        )
        var retryable = transmitted
        retryable.state = .retryable
        retryable.stateReasonCode = .unknownOutcome
        retryable.attempt.syncLeaseId = nil
        retryable.attempt.syncLeaseStartedAt = nil
        retryable.attempt.nextRetryAt = Self.baseDate.addingTimeInterval(10)
        retryable.updatedAt = Self.baseDate.addingTimeInterval(3)
        retryable = try await repository.replace(retryable, expecting: transmitted)

        var forgedManualRetry = retryable
        forgedManualRetry.state = .queued
        forgedManualRetry.stateReasonCode = nil
        forgedManualRetry.base.expectedMatchRevision += 10
        forgedManualRetry.base.expectedHoleRevision += 10
        forgedManualRetry.base.automaticRebaseCount += 1
        forgedManualRetry.attempt.nextRetryAt = nil
        forgedManualRetry.updatedAt = Self.baseDate.addingTimeInterval(4)

        do {
            _ = try await repository.replace(forgedManualRetry, expecting: retryable)
            XCTFail("Ordinary replay transitions cannot forge canonical revision preconditions")
        } catch {
            XCTAssertEqual(error as? SQLiteScoringQueueRepositoryError, .invalidStateTransition)
        }
        let retained = try await repository.records(in: partition)
        XCTAssertEqual(retained, [retryable])
        await repository.close()
    }

    func testAttemptCountAtIntegerLimitIsRejectedBeforeTransportCanOverflow() async throws {
        let databaseURL = temporaryDatabaseURL()
        defer { removeDatabaseRoot(databaseURL) }
        let partition = makePartition()
        let repository = try SQLiteScoringQueueRepository(
            databaseURL: databaseURL,
            now: { Self.baseDate }
        )
        let queued = try insertedRecord(
            try await repository.save(makeInput(partition: partition, hole: 1))
        )
        var saturated = queued
        saturated.state = .syncing
        saturated.attempt.count = .max
        saturated.attempt.everSubmitted = true
        saturated.attempt.outcomeCertainty = .unknown
        saturated.attempt.syncLeaseId = "overflow:lease"
        saturated.attempt.syncLeaseStartedAt = Self.baseDate.addingTimeInterval(1)
        saturated.updatedAt = Self.baseDate.addingTimeInterval(1)

        do {
            _ = try await repository.replace(saturated, expecting: queued)
            XCTFail("An attempt count that would overflow on transport start must fail closed")
        } catch {
            XCTAssertEqual(
                error as? SQLiteScoringQueueRepositoryError,
                .invalidRecord(.queueHealth)
            )
        }
        let retained = try await repository.records(in: partition)
        XCTAssertEqual(retained, [queued])
        await repository.close()
    }

    func testReopenFailsClosedOnCrossTableLocalRecordIdentifierCollision() async throws {
        let databaseURL = temporaryDatabaseURL()
        defer { removeDatabaseRoot(databaseURL) }
        let partition = makePartition(match: "match-local-id-collision")
        let seed = try SQLiteScoringQueueRepository(
            databaseURL: databaseURL,
            now: { Self.baseDate }
        )
        let record = try insertedRecord(
            try await seed.save(makeInput(partition: partition, hole: 1))
        )
        await seed.close()
        let unrelatedMutationID = UUID().uuidString.lowercased()
        try executeSQL(
            """
            INSERT INTO queue_quarantine (
                source_local_record_id, mutation_id, auth_user_id, player_id,
                tournament_id, match_id, sequence, reason, quarantined_at, raw_blob
            ) VALUES (
                '\(record.localQueueRecordId)', '\(unrelatedMutationID)',
                '\(partition.authUserId)', '\(partition.playerId)',
                '\(partition.tournamentId)', '\(partition.matchId)', 99,
                'corruptRecord', \(Self.baseDate.timeIntervalSince1970), X'00'
            )
            """,
            databaseURL: databaseURL
        )

        XCTAssertThrowsError(
            try SQLiteScoringQueueRepository(databaseURL: databaseURL)
        ) { error in
            XCTAssertEqual(error as? SQLiteScoringQueueRepositoryError, .identifierCollision)
        }
    }

    func testReopenFailsClosedOnCrossTableMutationIdentifierCollision() async throws {
        let databaseURL = temporaryDatabaseURL()
        defer { removeDatabaseRoot(databaseURL) }
        let partition = makePartition(match: "match-mutation-id-collision")
        let seed = try SQLiteScoringQueueRepository(
            databaseURL: databaseURL,
            now: { Self.baseDate }
        )
        let record = try insertedRecord(
            try await seed.save(makeInput(partition: partition, hole: 1))
        )
        await seed.close()
        let unrelatedLocalRecordID = UUID().uuidString.lowercased()
        try executeSQL(
            """
            INSERT INTO queue_receipts (
                local_record_id, mutation_id, auth_user_id, player_id,
                tournament_id, match_id, created_at, expires_at, receipt_blob
            ) VALUES (
                '\(unrelatedLocalRecordID)', '\(record.mutationId)',
                '\(partition.authUserId)', '\(partition.playerId)',
                '\(partition.tournamentId)', '\(partition.matchId)',
                \(Self.baseDate.timeIntervalSince1970),
                \(Self.baseDate.addingTimeInterval(86_400).timeIntervalSince1970), X'00'
            )
            """,
            databaseURL: databaseURL
        )

        XCTAssertThrowsError(
            try SQLiteScoringQueueRepository(databaseURL: databaseURL)
        ) { error in
            XCTAssertEqual(error as? SQLiteScoringQueueRepositoryError, .identifierCollision)
        }
    }

    func testReopenRejectsWrongPartialSyncingIndexPredicate() async throws {
        let databaseURL = temporaryDatabaseURL()
        defer { removeDatabaseRoot(databaseURL) }
        let seed = try SQLiteScoringQueueRepository(
            databaseURL: databaseURL,
            now: { Self.baseDate }
        )
        await seed.close()
        try executeSQL(
            """
            DROP INDEX queue_one_syncing_per_match;
            CREATE UNIQUE INDEX queue_one_syncing_per_match
            ON queue_records(auth_user_id, player_id, tournament_id, match_id)
            WHERE state = 'resolved' AND state = 'syncing';
            """,
            databaseURL: databaseURL
        )

        XCTAssertThrowsError(
            try SQLiteScoringQueueRepository(databaseURL: databaseURL)
        ) { error in
            XCTAssertEqual(error as? SQLiteScoringQueueRepositoryError, .unsafeMigration)
        }
    }

    func testReopenRejectsDuplicateActiveMutationRowsEvenWithIndividuallyValidBlobs() async throws {
        let databaseURL = temporaryDatabaseURL()
        defer { removeDatabaseRoot(databaseURL) }
        let partition = makePartition(match: "match-duplicate-active")
        let seed = try SQLiteScoringQueueRepository(
            databaseURL: databaseURL,
            now: { Self.baseDate }
        )
        let original = try insertedRecord(
            try await seed.save(makeInput(partition: partition, hole: 1))
        )
        await seed.close()

        let duplicate = makeInput(partition: partition, hole: 2).makeQueuedRecord(
            localQueueRecordId: UUID().uuidString.lowercased(),
            mutationId: original.mutationId,
            sequence: original.sequence + 1,
            createdAt: Self.baseDate.addingTimeInterval(1)
        )
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        encoder.dateEncodingStrategy = .secondsSince1970
        let duplicateBlob = try encoder.encode(duplicate)
        try executeSQL(
            """
            DROP INDEX queue_one_syncing_per_match;
            DROP INDEX queue_partition_order;
            DROP INDEX queue_identity_state;
            ALTER TABLE queue_records RENAME TO queue_records_original;
            CREATE TABLE queue_records (
                local_record_id TEXT NOT NULL,
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
                record_blob BLOB NOT NULL
            );
            INSERT INTO queue_records SELECT * FROM queue_records_original;
            INSERT INTO queue_records (
                local_record_id, mutation_id, auth_user_id, player_id, tournament_id,
                match_id, sequence, state, hole_number, ever_submitted,
                outcome_certainty, sync_lease_id, created_at, updated_at, record_blob
            ) VALUES (
                '\(duplicate.localQueueRecordId)', '\(duplicate.mutationId)',
                '\(partition.authUserId)', '\(partition.playerId)',
                '\(partition.tournamentId)', '\(partition.matchId)',
                \(duplicate.sequence), 'queued', 2, 0, 'notSent', NULL,
                \(duplicate.createdAt.timeIntervalSince1970),
                \(duplicate.updatedAt.timeIntervalSince1970),
                X'\(duplicateBlob.hexadecimalString)'
            );
            DROP TABLE queue_records_original;
            CREATE UNIQUE INDEX queue_one_syncing_per_match
            ON queue_records(auth_user_id, player_id, tournament_id, match_id)
            WHERE state = 'syncing';
            CREATE INDEX queue_partition_order
            ON queue_records(auth_user_id, player_id, tournament_id, match_id, sequence);
            CREATE INDEX queue_identity_state
            ON queue_records(auth_user_id, player_id, tournament_id, state, updated_at);
            """,
            databaseURL: databaseURL
        )

        XCTAssertThrowsError(
            try SQLiteScoringQueueRepository(databaseURL: databaseURL)
        ) { error in
            XCTAssertEqual(
                error as? SQLiteScoringQueueRepositoryError,
                .invalidRecord(.duplicateMutationId)
            )
        }
    }
}

private extension SQLiteScoringQueueRepositoryTests {
    static let baseDate = Date(timeIntervalSince1970: 1_700_000_000)

    func temporaryDatabaseURL() -> URL {
        FileManager.default.temporaryDirectory
            .appendingPathComponent("SQLiteScoringQueueRepositoryTests-\(UUID().uuidString)", isDirectory: true)
            .appendingPathComponent("scoring-queue.sqlite3", isDirectory: false)
    }

    func removeDatabaseRoot(_ databaseURL: URL) {
        try? FileManager.default.removeItem(at: databaseURL.deletingLastPathComponent())
    }

    func makePartition(match: String = "match-1") -> ScoringQueuePartition {
        ScoringQueuePartition(
            authUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            playerId: "player-1",
            tournamentId: "tournament-2026",
            matchId: match
        )
    }

    func makeInput(
        partition: ScoringQueuePartition,
        hole: Int,
        firstScore: Int = 4,
        official: ScoringQueueGross? = nil,
        expectedMatchRevision: Int = 12,
        expectedHoleRevision: Int = 3
    ) -> ScoringQueueSaveInput {
        ScoringQueueSaveInput(
            partition: partition,
            intent: ScoringQueueIntent(
                holeNumber: hole,
                teamOneGrossScores: [firstScore, 5],
                teamTwoGrossScores: [5, 6]
            ),
            base: ScoringQueueBase(
                expectedMatchRevision: expectedMatchRevision,
                expectedHoleRevision: expectedHoleRevision,
                snapshotId: "snapshot-1",
                snapshotRevision: 1,
                scoringFormat: .bestBall,
                sideSlotCount: 2,
                officialGrossAtSave: official
            ),
            lastKnownServer: ScoringQueueLastKnownServer(
                matchRevision: expectedMatchRevision,
                holeRevision: expectedHoleRevision,
                permissionRevision: 4,
                refreshedAt: Self.baseDate.addingTimeInterval(-60)
            ),
            originatingAppBuild: "1.0.0-100"
        )
    }

    func insertedRecord(_ result: ScoringQueueSaveResult) throws -> ScoringQueueRecord {
        guard case .inserted(let record) = result else {
            throw TestFailure.unexpectedSaveResult
        }
        return record
    }

    func handoffEvidence(
        partition: ScoringQueuePartition,
        server: ScoringQueueLastKnownServer,
        targetOfficialGross: ScoringQueueGross? = nil,
        matchStatus: MobileMatchStatus = .inProgress,
        canScore: Bool = true,
        readOnly: Bool = false
    ) -> ScoringQueueRevisionHandoffEvidence {
        ScoringQueueRevisionHandoffEvidence(
            server: server,
            matchId: partition.matchId,
            playerId: partition.playerId,
            snapshotId: "snapshot-1",
            snapshotRevision: 1,
            matchStatus: matchStatus,
            canScore: canScore,
            readOnly: readOnly,
            targetOfficialGross: targetOfficialGross
        )
    }

    func makeCanonicallyAcknowledged(
        _ queued: ScoringQueueRecord,
        repository: SQLiteScoringQueueRepository,
        canonicalMatchRevision: Int,
        canonicalHoleRevision: Int,
        at date: Date,
        completeRefresh: Bool = true
    ) async throws -> ScoringQueueRecord {
        let acquired = try await repository.acquireSyncLease(
            in: queued.partition,
            leaseId: "ack-helper:\(queued.sequence)",
            at: date.addingTimeInterval(-2)
        )
        let leased = try XCTUnwrap(acquired)
        let transmitted = try await repository.markTransportStarted(
            recordId: leased.localQueueRecordId,
            leaseId: "ack-helper:\(queued.sequence)",
            at: date.addingTimeInterval(-1)
        )
        var acknowledged = transmitted
        acknowledged.state = .acknowledged
        acknowledged.stateReasonCode = nil
        acknowledged.attempt.outcomeCertainty = .knownAccepted
        acknowledged.attempt.syncLeaseId = nil
        acknowledged.attempt.syncLeaseStartedAt = nil
        acknowledged.acknowledgement = ScoringQueueAcknowledgement(
            accepted: true,
            idempotent: false,
            semanticNoop: false,
            canonicalMatchRevision: canonicalMatchRevision,
            canonicalHoleRevision: canonicalHoleRevision,
            responseAt: date,
            refreshPending: true
        )
        acknowledged.updatedAt = max(date, transmitted.updatedAt)
        acknowledged = try await repository.replace(
            acknowledged,
            expecting: transmitted
        )
        guard completeRefresh else { return acknowledged }
        var refreshed = acknowledged
        refreshed.acknowledgement?.refreshPending = false
        refreshed.lastKnownServer = ScoringQueueLastKnownServer(
            matchRevision: canonicalMatchRevision,
            holeRevision: canonicalHoleRevision,
            permissionRevision: acknowledged.lastKnownServer.permissionRevision,
            refreshedAt: date
        )
        refreshed.updatedAt = max(date, acknowledged.updatedAt)
        return try await repository.replace(refreshed, expecting: acknowledged)
    }

    func leaseWithTransportState(
        _ syncing: ScoringQueueRecord,
        at date: Date
    ) -> ScoringQueueRecord {
        var transmitted = syncing
        transmitted.attempt.count += 1
        transmitted.attempt.lastAttemptAt = date
        transmitted.attempt.everSubmitted = true
        transmitted.attempt.outcomeCertainty = .unknown
        transmitted.updatedAt = date
        return transmitted
    }

    func fillMatchToLimit(
        _ partition: ScoringQueuePartition,
        databaseURL: URL
    ) throws {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        encoder.dateEncodingStrategy = .secondsSince1970
        for index in 0..<ScoringQueueContract.maximumUnresolvedRecordsPerMatch {
            let hole = (index % 18) + 1
            let firstScore = 4 + (index / 18)
            let date = Self.baseDate.addingTimeInterval(Double(index))
            var record = makeInput(
                partition: partition,
                hole: hole,
                firstScore: firstScore
            ).makeQueuedRecord(
                localQueueRecordId: UUID().uuidString.lowercased(),
                mutationId: UUID().uuidString.lowercased(),
                sequence: Int64(index + 1),
                createdAt: date
            )
            record.state = .retryable
            record.stateReasonCode = .unknownOutcome
            record.attempt = ScoringQueueAttempt(
                count: 1,
                lastAttemptAt: date,
                nextRetryAt: date.addingTimeInterval(60),
                everSubmitted: true,
                outcomeCertainty: .unknown,
                syncLeaseId: nil,
                syncLeaseStartedAt: nil,
                lastHttpStatus: nil,
                lastErrorCode: nil
            )
            let blob = try encoder.encode(record)
            try executeSQL(
                """
                INSERT INTO queue_records (
                    local_record_id, mutation_id, auth_user_id, player_id, tournament_id,
                    match_id, sequence, state, hole_number, ever_submitted,
                    outcome_certainty, sync_lease_id, created_at, updated_at, record_blob
                ) VALUES (
                    '\(record.localQueueRecordId)', '\(record.mutationId)',
                    '\(partition.authUserId)', '\(partition.playerId)',
                    '\(partition.tournamentId)', '\(partition.matchId)',
                    \(record.sequence), 'retryable', \(hole), 1, 'unknown', NULL,
                    \(date.timeIntervalSince1970), \(date.timeIntervalSince1970),
                    X'\(blob.hexadecimalString)'
                )
                """,
                databaseURL: databaseURL
            )
        }
        try executeSQL(
            """
            INSERT INTO queue_sequence_high_water (
                auth_user_id, player_id, tournament_id, match_id, last_sequence
            ) VALUES (
                '\(partition.authUserId)', '\(partition.playerId)',
                '\(partition.tournamentId)', '\(partition.matchId)',
                \(ScoringQueueContract.maximumUnresolvedRecordsPerMatch)
            )
            ON CONFLICT(auth_user_id, player_id, tournament_id, match_id)
            DO UPDATE SET last_sequence = excluded.last_sequence
            """,
            databaseURL: databaseURL
        )
    }

    func executeSQL(_ sql: String, databaseURL: URL) throws {
        var database: OpaquePointer?
        guard sqlite3_open_v2(
            databaseURL.path,
            &database,
            SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE | SQLITE_OPEN_FULLMUTEX,
            nil
        ) == SQLITE_OK, let database else {
            throw TestFailure.sqlite
        }
        defer { sqlite3_close_v2(database) }
        guard sqlite3_exec(database, sql, nil, nil, nil) == SQLITE_OK else {
            throw TestFailure.sqlite
        }
    }

    func scalarInt(_ sql: String, databaseURL: URL) throws -> Int64 {
        var database: OpaquePointer?
        guard sqlite3_open_v2(databaseURL.path, &database, SQLITE_OPEN_READONLY, nil) == SQLITE_OK,
              let database
        else { throw TestFailure.sqlite }
        defer { sqlite3_close_v2(database) }
        var statement: OpaquePointer?
        guard sqlite3_prepare_v2(database, sql, -1, &statement, nil) == SQLITE_OK,
              let statement
        else { throw TestFailure.sqlite }
        defer { sqlite3_finalize(statement) }
        guard sqlite3_step(statement) == SQLITE_ROW else { throw TestFailure.sqlite }
        return sqlite3_column_int64(statement, 0)
    }

    func scalarText(_ sql: String, databaseURL: URL) throws -> String {
        var database: OpaquePointer?
        guard sqlite3_open_v2(databaseURL.path, &database, SQLITE_OPEN_READONLY, nil) == SQLITE_OK,
              let database
        else { throw TestFailure.sqlite }
        defer { sqlite3_close_v2(database) }
        var statement: OpaquePointer?
        guard sqlite3_prepare_v2(database, sql, -1, &statement, nil) == SQLITE_OK,
              let statement
        else { throw TestFailure.sqlite }
        defer { sqlite3_finalize(statement) }
        guard sqlite3_step(statement) == SQLITE_ROW,
              let text = sqlite3_column_text(statement, 0)
        else { throw TestFailure.sqlite }
        return String(cString: text)
    }

    func scalarData(_ sql: String, databaseURL: URL) throws -> Data {
        var database: OpaquePointer?
        guard sqlite3_open_v2(databaseURL.path, &database, SQLITE_OPEN_READONLY, nil) == SQLITE_OK,
              let database
        else { throw TestFailure.sqlite }
        defer { sqlite3_close_v2(database) }
        var statement: OpaquePointer?
        guard sqlite3_prepare_v2(database, sql, -1, &statement, nil) == SQLITE_OK,
              let statement
        else { throw TestFailure.sqlite }
        defer { sqlite3_finalize(statement) }
        guard sqlite3_step(statement) == SQLITE_ROW,
              let bytes = sqlite3_column_blob(statement, 0)
        else { throw TestFailure.sqlite }
        return Data(bytes: bytes, count: Int(sqlite3_column_bytes(statement, 0)))
    }
}

private enum TestFailure: Error, Equatable {
    case sqlite
    case unexpectedSaveResult
}

private final class LockedIdentifierSource: @unchecked Sendable {
    private let lock = NSLock()
    private var values: [String]

    init(_ values: [String]) {
        self.values = values
    }

    func next() -> String {
        lock.lock()
        defer { lock.unlock() }
        return values.removeFirst()
    }
}

private final class FixedApplicationSupportFileManager: FileManager, @unchecked Sendable {
    private let applicationSupport: URL
    private let failDirectoryEnumeration: Bool
    private let attributeFailurePaths: Set<String>
    private let lock = NSLock()
    private var recordedProtectedPaths: Set<String> = []

    var protectedPaths: Set<String> {
        lock.lock()
        defer { lock.unlock() }
        return recordedProtectedPaths
    }

    init(
        applicationSupport: URL,
        failDirectoryEnumeration: Bool = false,
        attributeFailurePaths: Set<String> = []
    ) {
        self.applicationSupport = applicationSupport
        self.failDirectoryEnumeration = failDirectoryEnumeration
        self.attributeFailurePaths = attributeFailurePaths
        super.init()
    }

    override func urls(
        for directory: FileManager.SearchPathDirectory,
        in domainMask: FileManager.SearchPathDomainMask
    ) -> [URL] {
        if directory == .applicationSupportDirectory, domainMask == .userDomainMask {
            return [applicationSupport]
        }
        return super.urls(for: directory, in: domainMask)
    }

    override func contentsOfDirectory(
        at url: URL,
        includingPropertiesForKeys keys: [URLResourceKey]?,
        options mask: FileManager.DirectoryEnumerationOptions = []
    ) throws -> [URL] {
        if failDirectoryEnumeration {
            throw TestFailure.sqlite
        }
        return try super.contentsOfDirectory(
            at: url,
            includingPropertiesForKeys: keys,
            options: mask
        )
    }

    override func setAttributes(
        _ attributes: [FileAttributeKey: Any],
        ofItemAtPath path: String
    ) throws {
        if attributes[.protectionKey] != nil {
            lock.lock()
            recordedProtectedPaths.insert(path)
            lock.unlock()
        }
        try super.setAttributes(attributes, ofItemAtPath: path)
    }

    override func attributesOfItem(atPath path: String) throws -> [FileAttributeKey: Any] {
        if attributeFailurePaths.contains(path) {
            throw TestFailure.sqlite
        }
        return try super.attributesOfItem(atPath: path)
    }
}

private extension Data {
    var hexadecimalString: String {
        map { String(format: "%02x", $0) }.joined()
    }
}
