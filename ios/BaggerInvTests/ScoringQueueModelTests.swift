import Foundation
import XCTest
@testable import BaggerInv

final class ScoringQueueModelTests: XCTestCase {
    func testDurableEnumRawValuesRemainContractStable() {
        XCTAssertEqual(ScoringQueueState.allCases.map(\.rawValue), [
            "queued", "syncing", "retryable", "acknowledged",
            "conflict", "actionRequired", "quarantined", "resolved",
        ])
        XCTAssertEqual(ScoringQueueOutcomeCertainty.allCases.map(\.rawValue), [
            "notSent", "unknown", "knownRejected", "knownAccepted",
        ])
        XCTAssertEqual(ScoringQueueResolutionReason.allCases.map(\.rawValue), [
            "keptOfficial", "reappliedAsNewMutation", "supersededBeforeTransmission",
            "officialEquivalent", "userAbandoned",
        ])
        XCTAssertEqual(ScoringQueueStateReasonCode.allCases.map(\.rawValue), [
            "authRefresh", "environment", "unknownOutcome", "authentication", "identity",
            "identityChanged", "identityMismatch", "matchMissing", "authorization", "readOnly",
            "finalized", "staleTournament", "stale", "revision", "invalidRecordOrContract",
            "idempotencyConflict", "unknownPermanentResponse", "staleIdempotencyUncertain",
            "rebaseLimit", "queueHealth",
        ])
        XCTAssertEqual(ScoringQueueFormat.allCases.map(\.rawValue), ["BB", "SC", "SI"])
        XCTAssertEqual(ScoringQueueContract.queueSchemaVersion, 1)
        XCTAssertEqual(ScoringQueueContract.apiContractVersion, "v1")
    }

    func testEnvelopeRoundTripsWithoutLosingNormativeFields() throws {
        let record = ScoringQueueTestFixtures.record()
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.sortedKeys]
        let data = try encoder.encode(record)

        let object = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        XCTAssertEqual(object["queueSchemaVersion"] as? Int, 1)
        XCTAssertEqual(object["apiContractVersion"] as? String, "v1")
        XCTAssertEqual(object["localQueueRecordId"] as? String, record.localQueueRecordId)
        XCTAssertEqual(object["mutationId"] as? String, record.mutationId)
        XCTAssertNotNil(object["partition"])
        XCTAssertNotNil(object["intent"])
        XCTAssertNotNil(object["base"])
        XCTAssertNotNil(object["attempt"])
        XCTAssertNotNil(object["lastKnownServer"])

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        XCTAssertEqual(try decoder.decode(ScoringQueueRecord.self, from: data), record)
    }

    func testSaveInputCreatesQueuedRecordUsingRepositoryOwnedIdentityTimeAndSequence() {
        let input = ScoringQueueTestFixtures.input()
        let record = input.makeQueuedRecord(
            localQueueRecordId: ScoringQueueTestFixtures.localRecordId,
            mutationId: ScoringQueueTestFixtures.mutationId,
            sequence: 42,
            createdAt: ScoringQueueTestFixtures.now
        )

        XCTAssertEqual(record.localQueueRecordId, ScoringQueueTestFixtures.localRecordId)
        XCTAssertEqual(record.mutationId, ScoringQueueTestFixtures.mutationId)
        XCTAssertEqual(record.sequence, 42)
        XCTAssertEqual(record.state, .queued)
        XCTAssertEqual(record.attempt, .unattempted)
        XCTAssertEqual(record.createdAt, ScoringQueueTestFixtures.now)
        XCTAssertEqual(record.updatedAt, ScoringQueueTestFixtures.now)
    }

    func testPartitionRetainsFullAuthPlayerTournamentMatchHierarchy() {
        let partition = ScoringQueueTestFixtures.partition

        XCTAssertEqual(partition.authUserId, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
        XCTAssertEqual(partition.playerId, "P1")
        XCTAssertEqual(partition.tournamentId, "2026")
        XCTAssertEqual(partition.matchId, "2026-R2-1")
        XCTAssertEqual(
            partition.identity,
            ScoringQueueIdentityPartition(
                authUserId: partition.authUserId,
                playerId: partition.playerId,
                tournamentId: partition.tournamentId
            )
        )
    }

    func testValidationAcceptsEachCanonicalFormatAndScoreShape() {
        for (format, count) in [
            (ScoringQueueFormat.bestBall, 2),
            (.scramble, 1),
            (.singles, 1),
        ] {
            let input = ScoringQueueTestFixtures.input(format: format, scoresPerSide: count)
            XCTAssertTrue(ScoringQueueValidator.validate(input).isValid, "Expected \(format) to validate")
            XCTAssertTrue(ScoringQueueValidator.validate(ScoringQueueTestFixtures.record(input: input)).isValid)
        }
    }

    func testValidationRejectsBadFormatShapeRangeIdentifiersAndRevisions() {
        let partition = ScoringQueuePartition(
            authUserId: "not-a-uuid",
            playerId: "",
            tournamentId: "",
            matchId: "bad match"
        )
        let base = ScoringQueueBase(
            expectedMatchRevision: -1,
            expectedHoleRevision: -2,
            snapshotId: "",
            snapshotRevision: -3,
            scoringFormat: .bestBall,
            sideSlotCount: 1,
            automaticRebaseCount: 4
        )
        let input = ScoringQueueSaveInput(
            partition: partition,
            intent: ScoringQueueIntent(
                holeNumber: 19,
                teamOneGrossScores: [0],
                teamTwoGrossScores: [21, 5, 6]
            ),
            base: base,
            lastKnownServer: ScoringQueueLastKnownServer(
                matchRevision: -1,
                holeRevision: -1,
                permissionRevision: -1,
                refreshedAt: ScoringQueueTestFixtures.now
            ),
            originatingAppBuild: ""
        )

        let issues = ScoringQueueValidator.validate(input).issues
        XCTAssertTrue(issues.contains(.invalidIdentifier(field: "partition.authUserId")))
        XCTAssertTrue(issues.contains(.invalidIdentifier(field: "partition.playerId")))
        XCTAssertTrue(issues.contains(.invalidIdentifier(field: "partition.tournamentId")))
        XCTAssertTrue(issues.contains(.invalidIdentifier(field: "partition.matchId")))
        XCTAssertTrue(issues.contains(.invalidHoleNumber(19)))
        XCTAssertTrue(issues.contains(.invalidSideSlotCount(expected: 2, actual: 1)))
        XCTAssertTrue(issues.contains(.invalidScoreCount(side: .teamOne, expected: 2, actual: 1)))
        XCTAssertTrue(issues.contains(.invalidScoreCount(side: .teamTwo, expected: 2, actual: 3)))
        XCTAssertTrue(issues.contains(.invalidGrossScore(side: .teamOne, value: 0)))
        XCTAssertTrue(issues.contains(.invalidGrossScore(side: .teamTwo, value: 21)))
        XCTAssertTrue(issues.contains(.invalidRevision(field: "base.expectedMatchRevision", value: -1)))
        XCTAssertTrue(issues.contains(.invalidAutomaticRebaseCount(4)))
    }

    func testMutationIdentifierUsesExactStep1CPattern() {
        XCTAssertTrue(ScoringQueueValidator.isServerIdentifier("a"))
        XCTAssertTrue(ScoringQueueValidator.isServerIdentifier("abc.DEF_123:4-5"))
        XCTAssertTrue(ScoringQueueValidator.isServerIdentifier(ScoringQueueTestFixtures.mutationId))
        XCTAssertFalse(ScoringQueueValidator.isServerIdentifier(""))
        XCTAssertFalse(ScoringQueueValidator.isServerIdentifier("-starts-wrong"))
        XCTAssertFalse(ScoringQueueValidator.isServerIdentifier("contains space"))
        XCTAssertFalse(ScoringQueueValidator.isServerIdentifier(String(repeating: "a", count: 129)))
        XCTAssertFalse(ScoringQueueValidator.isServerIdentifier("é"))
    }

    func testValidationRejectsAttemptCountThatCannotBeIncrementedSafely() {
        var record = ScoringQueueTestFixtures.record()
        record.attempt.count = .max

        XCTAssertTrue(
            ScoringQueueValidator.validate(record).issues.contains(.invalidAttemptCount(.max))
        )
    }

    func testValidationEnforcesRecordAndProjectedRequestByteBounds() {
        let hugeBuild = String(repeating: "x", count: ScoringQueueContract.maximumRecordBytes + 1)
        let hugeRecord = ScoringQueueTestFixtures.record(originatingAppBuild: hugeBuild)
        XCTAssertTrue(ScoringQueueValidator.validate(hugeRecord).issues.contains { issue in
            if case .recordTooLarge = issue { return true }
            return false
        })

        let hugeIntent = ScoringQueueIntent(
            holeNumber: 1,
            teamOneGrossScores: Array(repeating: 20, count: 10_000),
            teamTwoGrossScores: Array(repeating: 20, count: 10_000)
        )
        let hugeInput = ScoringQueueSaveInput(
            partition: ScoringQueueTestFixtures.partition,
            intent: hugeIntent,
            base: ScoringQueueTestFixtures.base(),
            lastKnownServer: ScoringQueueTestFixtures.lastKnownServer,
            originatingAppBuild: "1.0.0-100"
        )
        XCTAssertTrue(ScoringQueueValidator.validate(hugeInput).issues.contains { issue in
            if case .requestTooLarge = issue { return true }
            return false
        })
    }

    func testStateMetadataOutcomeAndLeaseCoherenceAreValidated() {
        let missingAcknowledgement = ScoringQueueTestFixtures.record(state: .acknowledged)
        XCTAssertTrue(ScoringQueueValidator.validate(missingAcknowledgement).issues.contains(
            .invalidStateMetadata(.acknowledged)
        ))

        let invalidUnknown = ScoringQueueAttempt(
            count: 1,
            lastAttemptAt: ScoringQueueTestFixtures.now,
            nextRetryAt: nil,
            everSubmitted: false,
            outcomeCertainty: .unknown,
            syncLeaseId: nil,
            syncLeaseStartedAt: nil,
            lastHttpStatus: nil,
            lastErrorCode: nil
        )
        let invalidRetry = ScoringQueueTestFixtures.record(
            state: .retryable,
            reason: .unknownOutcome,
            attempt: invalidUnknown
        )
        XCTAssertTrue(ScoringQueueValidator.validate(invalidRetry).issues.contains(.incoherentOutcomeCertainty))

        let noLeaseSync = ScoringQueueTestFixtures.record(state: .syncing)
        XCTAssertTrue(ScoringQueueValidator.validate(noLeaseSync).issues.contains(.incoherentSyncLease))
    }

    func testAllowedAndProhibitedStateTransitionsMatchStep1D() {
        XCTAssertTrue(ScoringQueueTransitionPolicy.canTransition(from: .queued, to: .syncing))
        XCTAssertTrue(ScoringQueueTransitionPolicy.canTransition(from: .syncing, to: .acknowledged))
        XCTAssertTrue(ScoringQueueTransitionPolicy.canTransition(from: .retryable, to: .queued))
        XCTAssertTrue(ScoringQueueTransitionPolicy.canTransition(from: .conflict, to: .actionRequired))
        XCTAssertFalse(ScoringQueueTransitionPolicy.canTransition(from: .actionRequired, to: .queued))
        XCTAssertTrue(ScoringQueueTransitionPolicy.canTransition(from: .quarantined, to: .resolved))
        XCTAssertFalse(ScoringQueueTransitionPolicy.canTransition(from: .queued, to: .queued))

        XCTAssertFalse(ScoringQueueTransitionPolicy.canTransition(from: .conflict, to: .queued))
        XCTAssertFalse(ScoringQueueTransitionPolicy.canTransition(from: .acknowledged, to: .syncing))
        XCTAssertFalse(ScoringQueueTransitionPolicy.canTransition(from: .quarantined, to: .syncing))
        XCTAssertFalse(ScoringQueueTransitionPolicy.canTransition(from: .quarantined, to: .actionRequired))
        XCTAssertFalse(ScoringQueueTransitionPolicy.canTransition(from: .resolved, to: .queued))

        XCTAssertTrue(ScoringQueueTransitionPolicy.canTransition(
            from: .conflict,
            to: .queued,
            context: .deterministicSafeRebase
        ))
    }

    func testUnresolvedBlockingSubmissionAndReceiptSemantics() {
        let queued = ScoringQueueTestFixtures.record()
        XCTAssertTrue(queued.isUnresolved)
        XCTAssertTrue(queued.mustPrecedeLaterRecords)
        XCTAssertTrue(queued.isEligibleForAutomaticSubmission)
        XCTAssertFalse(queued.isTerminalForSubmission)
        XCTAssertFalse(queued.isReceiptEligible)

        let conflict = ScoringQueueTestFixtures.conflictRecord()
        XCTAssertTrue(conflict.isUnresolved)
        XCTAssertTrue(conflict.blocksAutomaticReplayForMatch)
        XCTAssertTrue(conflict.isTerminalForSubmission)

        let pendingAck = ScoringQueueTestFixtures.acknowledgedRecord(refreshPending: true)
        XCTAssertTrue(pendingAck.isUnresolved)
        XCTAssertTrue(pendingAck.blocksAutomaticReplayForMatch)
        XCTAssertFalse(pendingAck.isReceiptEligible)

        let refreshedAck = ScoringQueueTestFixtures.acknowledgedRecord(refreshPending: false)
        XCTAssertFalse(refreshedAck.isUnresolved)
        XCTAssertTrue(refreshedAck.isReceiptEligible)

        let resolved = ScoringQueueTestFixtures.resolvedRecord()
        XCTAssertFalse(resolved.isUnresolved)
        XCTAssertTrue(resolved.isReceiptEligible)
    }

    func testSavePolicyReusesSupersedesRetainsAndBlocksCorrectly() {
        let input = ScoringQueueTestFixtures.input()
        let queued = ScoringQueueTestFixtures.record(input: input)

        XCTAssertEqual(
            ScoringQueueSavePolicy.decision(
                for: input,
                existingRecords: [queued],
                officialTarget: .blank,
                unresolvedMatchCount: 1,
                unresolvedIdentityTournamentCount: 1
            ),
            .reuse(queued)
        )

        let changedInput = ScoringQueueTestFixtures.input(teamOne: [6, 5])
        XCTAssertEqual(
            ScoringQueueSavePolicy.decision(
                for: changedInput,
                existingRecords: [queued],
                officialTarget: .blank,
                unresolvedMatchCount: 1,
                unresolvedIdentityTournamentCount: 1
            ),
            .supersede(queued)
        )

        let transmitted = ScoringQueueTestFixtures.retryableRecord()
        XCTAssertEqual(
            ScoringQueueSavePolicy.decision(
                for: changedInput,
                existingRecords: [transmitted],
                officialTarget: .blank,
                unresolvedMatchCount: 1,
                unresolvedIdentityTournamentCount: 1
            ),
            .insertBehind(transmitted)
        )

        let conflict = ScoringQueueTestFixtures.conflictRecord()
        XCTAssertEqual(
            ScoringQueueSavePolicy.decision(
                for: changedInput,
                existingRecords: [conflict],
                officialTarget: .blank,
                unresolvedMatchCount: 1,
                unresolvedIdentityTournamentCount: 1
            ),
            .blockedByReview(conflict)
        )

        XCTAssertEqual(
            ScoringQueueSavePolicy.decision(
                for: input,
                existingRecords: [],
                officialTarget: .scored(input.intent.gross),
                unresolvedMatchCount: 0,
                unresolvedIdentityTournamentCount: 0
            ),
            .insert,
            "A cached official-looking value is not fresh authority; persist the intent and reconcile canonically before resolving it."
        )
    }

    func testSavePolicyRejectsAdmissionAtEitherUnresolvedBound() {
        let input = ScoringQueueTestFixtures.input()
        XCTAssertEqual(
            ScoringQueueSavePolicy.decision(
                for: input,
                existingRecords: [],
                officialTarget: .blank,
                unresolvedMatchCount: ScoringQueueContract.maximumUnresolvedRecordsPerMatch,
                unresolvedIdentityTournamentCount: 1
            ),
            .rejectQueueHealth
        )
        XCTAssertEqual(
            ScoringQueueSavePolicy.decision(
                for: ScoringQueueTestFixtures.input(teamOne: [6, 5]),
                existingRecords: [ScoringQueueTestFixtures.retryableRecord()],
                officialTarget: .blank,
                unresolvedMatchCount: ScoringQueueContract.maximumUnresolvedRecordsPerMatch,
                unresolvedIdentityTournamentCount: 1
            ),
            .rejectQueueHealth
        )
        XCTAssertEqual(
            ScoringQueueSavePolicy.decision(
                for: input,
                existingRecords: [],
                officialTarget: .blank,
                unresolvedMatchCount: 1,
                unresolvedIdentityTournamentCount: ScoringQueueContract.maximumUnresolvedRecordsPerIdentityTournament
            ),
            .rejectQueueHealth
        )
    }

    func testReceiptRetentionRequiresRefreshOrExplicitResolution() {
        XCTAssertNil(ScoringQueueReceiptPolicy.retention(for: ScoringQueueTestFixtures.record()))
        XCTAssertNil(ScoringQueueReceiptPolicy.retention(
            for: ScoringQueueTestFixtures.acknowledgedRecord(refreshPending: true)
        ))
        XCTAssertEqual(
            ScoringQueueReceiptPolicy.retention(
                for: ScoringQueueTestFixtures.acknowledgedRecord(refreshPending: false)
            ),
            24 * 60 * 60
        )
        XCTAssertEqual(
            ScoringQueueReceiptPolicy.retention(for: ScoringQueueTestFixtures.resolvedRecord()),
            7 * 24 * 60 * 60
        )
    }
}

enum ScoringQueueTestFixtures {
    static let now = Date(timeIntervalSince1970: 1_700_000_000)
    static let localRecordId = "9ae8de6a-8d8e-4b89-8c25-5ec47fd05c0a"
    static let mutationId = "11111111-1111-4111-8111-111111111111"
    static let partition = ScoringQueuePartition(
        authUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        playerId: "P1",
        tournamentId: "2026",
        matchId: "2026-R2-1"
    )
    static let lastKnownServer = ScoringQueueLastKnownServer(
        matchRevision: 12,
        holeRevision: 3,
        permissionRevision: 4,
        refreshedAt: now.addingTimeInterval(-300)
    )

    static func base(
        format: ScoringQueueFormat = .bestBall,
        scoresPerSide: Int? = nil
    ) -> ScoringQueueBase {
        ScoringQueueBase(
            expectedMatchRevision: 12,
            expectedHoleRevision: 3,
            snapshotId: "2026-R2-1:S1",
            snapshotRevision: 1,
            scoringFormat: format,
            sideSlotCount: scoresPerSide ?? (format == .bestBall ? 2 : 1)
        )
    }

    static func input(
        format: ScoringQueueFormat = .bestBall,
        scoresPerSide: Int? = nil,
        teamOne: [Int]? = nil,
        teamTwo: [Int]? = nil
    ) -> ScoringQueueSaveInput {
        let count = scoresPerSide ?? (format == .bestBall ? 2 : 1)
        return ScoringQueueSaveInput(
            partition: partition,
            intent: ScoringQueueIntent(
                holeNumber: 7,
                teamOneGrossScores: teamOne ?? Array([4, 5].prefix(count)),
                teamTwoGrossScores: teamTwo ?? Array([5, 6].prefix(count))
            ),
            base: base(format: format, scoresPerSide: count),
            lastKnownServer: lastKnownServer,
            originatingAppBuild: "1.0.0-100"
        )
    }

    static func record(
        input: ScoringQueueSaveInput = input(),
        state: ScoringQueueState = .queued,
        reason: ScoringQueueStateReasonCode? = nil,
        attempt: ScoringQueueAttempt = .unattempted,
        acknowledgement: ScoringQueueAcknowledgement? = nil,
        conflict: ScoringQueueConflict? = nil,
        resolution: ScoringQueueResolution? = nil,
        quarantineReason: ScoringQueueQuarantineReason? = nil,
        originatingAppBuild: String? = nil
    ) -> ScoringQueueRecord {
        ScoringQueueRecord(
            localQueueRecordId: localRecordId,
            mutationId: mutationId,
            partition: input.partition,
            intent: input.intent,
            base: input.base,
            sequence: 42,
            state: state,
            stateReasonCode: reason,
            attempt: attempt,
            lastKnownServer: input.lastKnownServer,
            conflict: conflict,
            acknowledgement: acknowledgement,
            resolution: resolution,
            quarantineReason: quarantineReason,
            originatingAppBuild: originatingAppBuild ?? input.originatingAppBuild,
            createdAt: now
        )
    }

    static func retryableRecord() -> ScoringQueueRecord {
        let attempt = ScoringQueueAttempt(
            count: 1,
            lastAttemptAt: now,
            nextRetryAt: now.addingTimeInterval(2),
            everSubmitted: true,
            outcomeCertainty: .unknown,
            syncLeaseId: nil,
            syncLeaseStartedAt: nil,
            lastHttpStatus: nil,
            lastErrorCode: nil
        )
        return record(state: .retryable, reason: .unknownOutcome, attempt: attempt)
    }

    static func conflictRecord() -> ScoringQueueRecord {
        record(
            state: .conflict,
            reason: .revision,
            attempt: ScoringQueueAttempt(
                count: 1,
                lastAttemptAt: now,
                nextRetryAt: nil,
                everSubmitted: true,
                outcomeCertainty: .knownRejected,
                syncLeaseId: nil,
                syncLeaseStartedAt: nil,
                lastHttpStatus: 409,
                lastErrorCode: "REVISION_CONFLICT"
            ),
            conflict: ScoringQueueConflict(
                officialGross: ScoringQueueGross(teamOne: [5, 5], teamTwo: [5, 6]),
                currentMatchRevision: 13,
                currentHoleRevision: 4,
                currentPermissionRevision: 4,
                refreshRequired: true,
                recordedAt: now
            )
        )
    }

    static func acknowledgedRecord(refreshPending: Bool) -> ScoringQueueRecord {
        record(
            state: .acknowledged,
            attempt: ScoringQueueAttempt(
                count: 1,
                lastAttemptAt: now,
                nextRetryAt: nil,
                everSubmitted: true,
                outcomeCertainty: .knownAccepted,
                syncLeaseId: nil,
                syncLeaseStartedAt: nil,
                lastHttpStatus: 200,
                lastErrorCode: nil
            ),
            acknowledgement: ScoringQueueAcknowledgement(
                accepted: true,
                idempotent: false,
                semanticNoop: false,
                canonicalMatchRevision: 13,
                canonicalHoleRevision: 4,
                responseAt: now,
                refreshPending: refreshPending
            )
        )
    }

    static func resolvedRecord(
        reason: ScoringQueueResolutionReason = .keptOfficial
    ) -> ScoringQueueRecord {
        record(
            state: .resolved,
            resolution: ScoringQueueResolution(
                reason: reason,
                resolvedAt: now,
                relatedLocalQueueRecordId: nil
            )
        )
    }
}
