import XCTest
@testable import BaggerInv

@MainActor
final class ScoringQueueCoordinatorTests: XCTestCase {
    func testDurableSaveRejectsIdentityMismatchBeforeRepositoryWrite() async throws {
        let harness = makeHarness(liveMutationSendingEnabled: false)
        await harness.coordinator.activate(identity: CoordinatorQueueFixtures.identity)
        let otherIdentity = ScoringQueueIdentityPartition(
            authUserId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            playerId: "P2",
            tournamentId: "2026"
        )

        do {
            _ = try await harness.coordinator.save(
                CoordinatorQueueFixtures.input(
                    partition: CoordinatorQueueFixtures.partition(
                        matchId: "match-other",
                        identity: otherIdentity
                    )
                )
            )
            XCTFail("Expected identity mismatch")
        } catch {
            XCTAssertEqual(error as? ScoringQueueCoordinatorError, .identityMismatch)
        }

        let stored = await harness.repository.snapshot()
        let saveCalls = await harness.repository.saveCalls
        XCTAssertEqual(stored, [])
        XCTAssertEqual(saveCalls, 0)
    }

    func testOrderedReplayUsesOneInFlightMutationPerMatch() async throws {
        let records = (1...3).map {
            CoordinatorQueueFixtures.record(
                matchId: "match-ordered",
                holeNumber: $0,
                sequence: Int64($0)
            )
        }
        let harness = makeHarness(records: records)
        harness.api.mutationDelayNanoseconds = 30_000_000

        await harness.coordinator.activate(identity: CoordinatorQueueFixtures.identity)

        let replayCompleted = await eventually {
            let snapshot = await harness.repository.snapshot()
            return harness.api.holeRequests.count == 3 &&
                snapshot.allSatisfy { !$0.isUnresolved }
        }
        let finalSnapshot = await harness.repository.snapshot()
        let replaySummary = finalSnapshot.map {
            "hole=\($0.intent.holeNumber),state=\($0.state.rawValue),reason=\($0.stateReasonCode?.rawValue ?? "none"),base=\($0.base.expectedMatchRevision)/\($0.base.expectedHoleRevision),snapshot=\($0.base.snapshotId ?? "nil")/\($0.base.snapshotRevision),ack=\($0.acknowledgement?.canonicalMatchRevision ?? -1)/\($0.acknowledgement?.canonicalHoleRevision ?? -1)/pending:\($0.acknowledgement?.refreshPending.description ?? "nil"),last=\($0.lastKnownServer.matchRevision)/\($0.lastKnownServer.holeRevision)"
        }.joined(separator: ";")
        let handoffDiagnostics = await harness.repository.handoffDiagnostics
        XCTAssertTrue(replayCompleted, "\(replaySummary); handoff=\(handoffDiagnostics)")
        XCTAssertEqual(harness.api.holeRequests.map(\.holeNumber), [1, 2, 3])
        XCTAssertEqual(
            harness.api.holeRequests.map(\.mutationId),
            records.map(\.mutationId)
        )
        XCTAssertEqual(harness.api.maximumActiveByMatch["match-ordered"], 1)
    }

    func testAcceptedSameHolePredecessorHandsOffExactCanonicalRevisionToCorrection() async throws {
        let first = CoordinatorQueueFixtures.record(
            matchId: "match-same-hole-correction",
            holeNumber: 7,
            teamOne: [4, 5],
            teamTwo: [5, 6],
            sequence: 1
        )
        let correction = CoordinatorQueueFixtures.record(
            matchId: first.partition.matchId,
            holeNumber: 7,
            teamOne: [6, 5],
            teamTwo: [5, 6],
            sequence: 2
        )
        let harness = makeHarness(records: [first, correction], maximumWorkers: 1)

        await harness.coordinator.activate(identity: CoordinatorQueueFixtures.identity)

        let replayCompleted = await eventually {
            let snapshot = await harness.repository.snapshot()
            return harness.api.holeRequests.count == 2 &&
                snapshot.allSatisfy { !$0.isUnresolved }
        }
        XCTAssertTrue(replayCompleted)
        XCTAssertEqual(harness.api.holeRequests.map(\.mutationId), [first.mutationId, correction.mutationId])
        XCTAssertEqual(harness.api.holeRequests.map(\.holeNumber), [7, 7])
        XCTAssertEqual(harness.api.holeRequests[1].expectedMatchRevision, 13)
        XCTAssertEqual(harness.api.holeRequests[1].expectedHoleRevision, 1)
        XCTAssertEqual(harness.api.holeRequests[1].teamOneGrossScores, [6, 5])
        XCTAssertEqual(harness.api.maximumActiveByMatch[first.partition.matchId], 1)
        let handoffObservedPendingRefresh = await harness.repository
            .handoffObservedPredecessorRefreshPending
        XCTAssertEqual(handoffObservedPendingRefresh, true)
    }

    func testLifecycleReconciliationCannotResolveLaterSameHoleIntentAheadOfUnknownOlderIntent() async throws {
        let matchId = "match-same-hole-reconcile-order"
        let unknownAttempt = ScoringQueueAttempt(
            count: 1,
            lastAttemptAt: CoordinatorQueueFixtures.now.addingTimeInterval(-30),
            nextRetryAt: CoordinatorQueueFixtures.now.addingTimeInterval(60),
            everSubmitted: true,
            outcomeCertainty: .unknown,
            syncLeaseId: nil,
            syncLeaseStartedAt: nil,
            lastHttpStatus: nil,
            lastErrorCode: "transport"
        )
        let older = CoordinatorQueueFixtures.record(
            matchId: matchId,
            holeNumber: 7,
            teamOne: [4, 5],
            teamTwo: [5, 6],
            sequence: 1,
            state: .retryable,
            reason: .unknownOutcome,
            attempt: unknownAttempt
        )
        let later = CoordinatorQueueFixtures.record(
            matchId: matchId,
            holeNumber: 7,
            teamOne: [6, 5],
            teamTwo: [5, 6],
            sequence: 2
        )
        let harness = makeHarness(
            records: [older, later],
            liveMutationSendingEnabled: false
        )
        harness.api.configureCanonical(
            for: later.partition,
            matchRevision: 12,
            scores: [CoordinatorQueueFixtures.score(
                holeNumber: 7,
                revision: 1,
                gross: later.intent.gross
            )]
        )

        await harness.coordinator.activate(identity: CoordinatorQueueFixtures.identity)

        let snapshot = await harness.repository.snapshot()
        XCTAssertEqual(snapshot.first(where: { $0.localQueueRecordId == older.localQueueRecordId })?.state, .retryable)
        XCTAssertEqual(snapshot.first(where: { $0.localQueueRecordId == later.localQueueRecordId })?.state, .queued)
        XCTAssertNil(snapshot.first(where: { $0.localQueueRecordId == later.localQueueRecordId })?.resolution)
        XCTAssertTrue(harness.api.holeRequests.isEmpty)
    }

    func testGlobalWorkerLimitIsTwoAndLaterMatchReceivesFairTurn() async throws {
        let records = (1...4).map {
            CoordinatorQueueFixtures.record(
                matchId: "match-\($0)",
                sequence: Int64($0)
            )
        }
        let harness = makeHarness(records: records, maximumWorkers: 2)
        harness.api.mutationDelayNanoseconds = 80_000_000

        await harness.coordinator.activate(identity: CoordinatorQueueFixtures.identity)

        let twoWorkersStarted = await eventually { harness.api.holeRequests.count >= 2 }
        XCTAssertTrue(twoWorkersStarted)
        XCTAssertEqual(harness.api.maximumActiveMutations, 2)
        XCTAssertEqual(Set(harness.api.holeRequests.prefix(2).map(\.matchId)).count, 2)
        let allWorkersCompleted = await eventually {
            let snapshot = await harness.repository.snapshot()
            return harness.api.holeRequests.count == 4 &&
                snapshot.allSatisfy { !$0.isUnresolved }
        }
        XCTAssertTrue(allWorkersCompleted)
        XCTAssertEqual(Set(harness.api.holeRequests.map(\.matchId)), Set(records.map(\.partition.matchId)))
        XCTAssertLessThanOrEqual(harness.api.maximumActiveMutations, 2)
    }

    func testBlockingOldestRecordPreventsLaterSameMatchLeapfrog() async throws {
        let first = CoordinatorQueueFixtures.record(
            matchId: "match-blocked",
            sequence: 1,
            state: .conflict,
            reason: .revision
        )
        let later = CoordinatorQueueFixtures.record(
            matchId: "match-blocked",
            holeNumber: 2,
            sequence: 2
        )
        let harness = makeHarness(records: [first, later])

        await harness.coordinator.activate(identity: CoordinatorQueueFixtures.identity)
        try await Task.sleep(nanoseconds: 50_000_000)

        XCTAssertTrue(harness.api.holeRequests.isEmpty)
        let persistedLater = await harness.repository.record(id: later.localQueueRecordId)
        XCTAssertEqual(persistedLater?.state, .queued)
    }

    func testUnknownOutcomeManualRetryReusesExactMutationID() async throws {
        let record = CoordinatorQueueFixtures.record(matchId: "match-unknown")
        let harness = makeHarness(records: [record])
        harness.api.setOutcomes(
            [
                .fail(.unknownOutcome(
                    reason: .transport,
                    code: nil,
                    status: nil,
                    data: nil,
                    retryAfter: nil
                )),
                .accept,
            ],
            for: record.partition.matchId
        )

        await harness.coordinator.activate(identity: CoordinatorQueueFixtures.identity)
        let firstAttemptFailed = await eventually {
            await harness.repository.record(id: record.localQueueRecordId)?.state == .retryable
        }
        XCTAssertTrue(firstAttemptFailed)
        let retryableValue = await harness.repository.record(id: record.localQueueRecordId)
        let retryable = try XCTUnwrap(retryableValue)
        XCTAssertTrue(retryable.attempt.everSubmitted)
        XCTAssertEqual(retryable.attempt.outcomeCertainty, .unknown)

        harness.clock.advance(2)
        try await harness.coordinator.manualRetry(recordId: record.localQueueRecordId)

        let retryCompleted = await eventually {
            (await harness.repository.record(id: record.localQueueRecordId))?.isUnresolved == false
        }
        XCTAssertTrue(retryCompleted)
        XCTAssertEqual(harness.api.holeRequests.count, 2)
        XCTAssertEqual(Set(harness.api.holeRequests.map(\.mutationId)), [record.mutationId])
    }

    func testInterruptedSyncRecoversAsUnknownOutcomeWithSameIdentity() async throws {
        let attempt = ScoringQueueAttempt(
            count: 1,
            lastAttemptAt: CoordinatorQueueFixtures.now.addingTimeInterval(-1),
            nextRetryAt: nil,
            everSubmitted: true,
            outcomeCertainty: .unknown,
            syncLeaseId: "old-process:lease",
            syncLeaseStartedAt: CoordinatorQueueFixtures.now.addingTimeInterval(-1),
            lastHttpStatus: nil,
            lastErrorCode: nil
        )
        let record = CoordinatorQueueFixtures.record(
            matchId: "match-crash",
            state: .syncing,
            attempt: attempt
        )
        let harness = makeHarness(records: [record], liveMutationSendingEnabled: false)

        await harness.coordinator.activate(identity: CoordinatorQueueFixtures.identity)

        let recoveredValue = await harness.repository.record(id: record.localQueueRecordId)
        let recovered = try XCTUnwrap(recoveredValue)
        XCTAssertEqual(recovered.state, .retryable)
        XCTAssertEqual(recovered.stateReasonCode, .unknownOutcome)
        XCTAssertEqual(recovered.mutationId, record.mutationId)
        XCTAssertEqual(recovered.attempt.outcomeCertainty, .unknown)
        let recoveryCalls = await harness.repository.recoveryCalls
        XCTAssertEqual(recoveryCalls, 1)
    }

    func testAcknowledgedRefreshPendingPerformsRefreshOnlyAfterRelaunch() async throws {
        let gross = ScoringQueueGross(teamOne: [4, 5], teamTwo: [5, 6])
        let acknowledgement = ScoringQueueAcknowledgement(
            accepted: true,
            idempotent: true,
            semanticNoop: false,
            canonicalMatchRevision: 13,
            canonicalHoleRevision: 1,
            responseAt: CoordinatorQueueFixtures.now.addingTimeInterval(-1),
            refreshPending: true
        )
        let attempt = acceptedAttempt()
        let record = CoordinatorQueueFixtures.record(
            matchId: "match-ack-refresh",
            state: .acknowledged,
            attempt: attempt,
            acknowledgement: acknowledgement
        )
        let harness = makeHarness(records: [record])
        harness.api.configureCanonical(
            for: record.partition,
            matchRevision: 13,
            scores: [CoordinatorQueueFixtures.score(holeNumber: 1, revision: 1, gross: gross)]
        )

        await harness.coordinator.activate(identity: CoordinatorQueueFixtures.identity)

        let refreshCompleted = await eventually {
            await harness.repository.record(id: record.localQueueRecordId)?.acknowledgement?.refreshPending == false
        }
        XCTAssertTrue(refreshCompleted)
        XCTAssertTrue(harness.api.holeRequests.isEmpty)
        XCTAssertGreaterThanOrEqual(harness.api.scoringCurrentMatchIDs.count, 1)
    }

    func testAcknowledgedRefreshAcceptsCanonicalRevisionAdvancedBeyondAcknowledgement() async throws {
        let acknowledgement = ScoringQueueAcknowledgement(
            accepted: true,
            idempotent: false,
            semanticNoop: false,
            canonicalMatchRevision: 13,
            canonicalHoleRevision: 1,
            responseAt: CoordinatorQueueFixtures.now,
            refreshPending: true
        )
        let record = CoordinatorQueueFixtures.record(
            matchId: "match-ack-advanced",
            state: .acknowledged,
            attempt: acceptedAttempt(),
            acknowledgement: acknowledgement
        )
        let harness = makeHarness(records: [record])
        harness.api.configureCanonical(
            for: record.partition,
            matchRevision: 15,
            scores: [CoordinatorQueueFixtures.score(
                holeNumber: 1,
                revision: 2,
                gross: record.intent.gross
            )]
        )

        await harness.coordinator.activate(identity: CoordinatorQueueFixtures.identity)

        let advancedRefreshCompleted = await eventually {
            await harness.repository.record(id: record.localQueueRecordId)?.acknowledgement?.refreshPending == false
        }
        XCTAssertTrue(advancedRefreshCompleted)
        XCTAssertTrue(harness.api.holeRequests.isEmpty)
    }

    func testFailedAcknowledgementRefreshRemainsRefreshOnlyAndSchedulesRetry() async throws {
        let acknowledgement = ScoringQueueAcknowledgement(
            accepted: true,
            idempotent: false,
            semanticNoop: false,
            canonicalMatchRevision: 13,
            canonicalHoleRevision: 1,
            responseAt: CoordinatorQueueFixtures.now,
            refreshPending: true
        )
        let record = CoordinatorQueueFixtures.record(
            matchId: "match-ack-refresh-failure",
            state: .acknowledged,
            attempt: acceptedAttempt(),
            acknowledgement: acknowledgement
        )
        let harness = makeHarness(records: [record], jitter: { 0.2 })
        harness.api.configureCanonical(
            for: record.partition,
            matchRevision: 13,
            scores: [CoordinatorQueueFixtures.score(
                holeNumber: record.intent.holeNumber,
                revision: 1,
                gross: record.intent.gross
            )]
        )
        harness.api.setCurrentOutcomes(
            [.fail(.transportUnavailable), .fail(.transportUnavailable)],
            for: record.partition.matchId
        )

        await harness.coordinator.activate(identity: CoordinatorQueueFixtures.identity)

        let retryScheduled = await eventually {
            await harness.repository.record(id: record.localQueueRecordId)?.attempt.nextRetryAt != nil
        }
        XCTAssertTrue(retryScheduled)
        let persistedValue = await awaitRecord(record.localQueueRecordId, in: harness.repository)
        let persisted = try XCTUnwrap(persistedValue)
        XCTAssertEqual(persisted.state, .acknowledged)
        XCTAssertTrue(persisted.acknowledgement?.refreshPending == true)
        XCTAssertEqual(persisted.attempt.nextRetryAt, CoordinatorQueueFixtures.now.addingTimeInterval(2))
        XCTAssertTrue(harness.api.holeRequests.isEmpty)
    }

    func testUnauthorizedForcesCredentialRefreshExactlyOnceAndRetriesSameID() async throws {
        let record = CoordinatorQueueFixtures.record(matchId: "match-auth")
        let harness = makeHarness(records: [record])
        harness.api.setOutcomes(
            [
                .fail(.rejected(code: .unauthorized, status: 401, data: nil, retryAfter: nil)),
                .accept,
            ],
            for: record.partition.matchId
        )

        await harness.coordinator.activate(identity: CoordinatorQueueFixtures.identity)

        let authenticatedRetryCompleted = await eventually {
            (await harness.repository.record(id: record.localQueueRecordId))?.isUnresolved == false
        }
        XCTAssertTrue(authenticatedRetryCompleted)
        XCTAssertEqual(harness.credentials.refreshCalls, 1)
        XCTAssertEqual(harness.api.holeRequests.count, 2)
        XCTAssertEqual(Set(harness.api.holeRequests.map(\.mutationId)), [record.mutationId])
        XCTAssertEqual(harness.api.holeAccessTokens, ["test-access-normal", "test-access-refreshed"])
        let persisted = await harness.repository.record(id: record.localQueueRecordId)
        XCTAssertEqual(
            persisted?.attempt.count,
            2,
            "Each actual transport attempt, including the post-refresh retry, must be durable before bytes leave."
        )
    }

    func testSignOutDuringCredentialRefreshCannotIssueSecondMutationRequest() async throws {
        let record = CoordinatorQueueFixtures.record(matchId: "match-auth-signout")
        let harness = makeHarness(records: [record])
        harness.credentials.suspendNextRefresh()
        harness.api.setOutcomes(
            [
                .fail(.rejected(code: .unauthorized, status: 401, data: nil, retryAfter: nil)),
                .accept,
            ],
            for: record.partition.matchId
        )

        await harness.coordinator.activate(identity: CoordinatorQueueFixtures.identity)
        let refreshSuspended = await eventually { harness.credentials.hasSuspendedRefresh() }
        XCTAssertTrue(refreshSuspended)

        await harness.coordinator.prepareForSignOut()
        harness.credentials.resumeSuspendedRefresh()

        let safelyStopped = await eventually {
            let persisted = await harness.repository.record(id: record.localQueueRecordId)
            return persisted?.state == .retryable
        }
        XCTAssertTrue(safelyStopped)
        XCTAssertEqual(harness.api.holeRequests.count, 1)
        let persisted = await harness.repository.record(id: record.localQueueRecordId)
        XCTAssertEqual(persisted?.mutationId, record.mutationId)
        XCTAssertEqual(persisted?.attempt.count, 1)
        XCTAssertEqual(persisted?.attempt.outcomeCertainty, .unknown)
    }

    func testSignOutAfterDurableTransportStartCannotIssueCapturedRequest() async throws {
        let record = CoordinatorQueueFixtures.record(matchId: "match-transport-start-signout")
        let harness = makeHarness(records: [record])
        await harness.repository.suspendNextTransportStart()

        await harness.coordinator.activate(identity: CoordinatorQueueFixtures.identity)
        let transportStartSuspended = await eventually {
            await harness.repository.hasSuspendedTransportStart()
        }
        XCTAssertTrue(transportStartSuspended)

        await harness.coordinator.prepareForSignOut()
        await harness.repository.resumeSuspendedTransportStart()

        let safelyStopped = await eventually {
            let persisted = await harness.repository.record(id: record.localQueueRecordId)
            return persisted?.state == .retryable
        }
        XCTAssertTrue(safelyStopped)
        XCTAssertTrue(harness.api.holeRequests.isEmpty)
        let persisted = await harness.repository.record(id: record.localQueueRecordId)
        XCTAssertEqual(persisted?.mutationId, record.mutationId)
        XCTAssertEqual(persisted?.attempt.count, 1)
        XCTAssertEqual(persisted?.attempt.outcomeCertainty, .unknown)
    }

    func testStep1CNonConflictErrorsMapToExactDurableStates() async throws {
        struct Mapping {
            let matchId: String
            let code: MobileErrorCode
            let status: Int
            let state: ScoringQueueState
            let reason: ScoringQueueStateReasonCode
            let quarantine: ScoringQueueQuarantineReason?
        }
        let mappings: [Mapping] = [
            .init(matchId: "error-participant", code: .participantNotFound, status: 404, state: .actionRequired, reason: .identity, quarantine: nil),
            .init(matchId: "error-mobile-api", code: .mobileAPIUnavailable, status: 503, state: .retryable, reason: .environment, quarantine: nil),
            .init(matchId: "error-scoring-unavailable", code: .scoringUnavailable, status: 503, state: .retryable, reason: .environment, quarantine: nil),
            .init(matchId: "error-match", code: .matchNotFound, status: 404, state: .actionRequired, reason: .matchMissing, quarantine: nil),
            .init(matchId: "error-authorization", code: .scoringNotAuthorized, status: 403, state: .actionRequired, reason: .authorization, quarantine: nil),
            .init(matchId: "error-read-only", code: .scoringReadOnly, status: 409, state: .actionRequired, reason: .readOnly, quarantine: nil),
            .init(matchId: "error-invalid", code: .invalidScoreInput, status: 400, state: .quarantined, reason: .invalidRecordOrContract, quarantine: .invalidRecordOrContract),
            .init(matchId: "error-internal", code: .internalError, status: 500, state: .retryable, reason: .unknownOutcome, quarantine: nil),
        ]
        let records = mappings.enumerated().map { index, mapping in
            CoordinatorQueueFixtures.record(matchId: mapping.matchId, sequence: Int64(index + 1))
        }
        let harness = makeHarness(records: records)
        var revalidationCalls = 0
        harness.coordinator.setAuthorityRevalidationHandler { revalidationCalls += 1 }
        for mapping in mappings {
            harness.api.setOutcomes(
                [.fail(.rejected(code: mapping.code, status: mapping.status, data: nil, retryAfter: nil))],
                for: mapping.matchId
            )
        }

        await harness.coordinator.activate(identity: CoordinatorQueueFixtures.identity)
        let allMapped = await eventually {
            let snapshot = await harness.repository.snapshot()
            return mappings.allSatisfy { mapping in
                snapshot.first(where: { $0.partition.matchId == mapping.matchId })?.state == mapping.state
            }
        }
        XCTAssertTrue(allMapped)

        let snapshot = await harness.repository.snapshot()
        for mapping in mappings {
            let record = try XCTUnwrap(snapshot.first { $0.partition.matchId == mapping.matchId })
            XCTAssertEqual(record.state, mapping.state, mapping.matchId)
            XCTAssertEqual(record.stateReasonCode, mapping.reason, mapping.matchId)
            XCTAssertEqual(record.quarantineReason, mapping.quarantine, mapping.matchId)
        }
        XCTAssertEqual(revalidationCalls, 1)
    }

    func testSecondUnauthorizedAfterForcedRefreshBecomesAuthenticationActionRequired() async throws {
        for (index, code) in [MobileErrorCode.unauthorized, .invalidToken].enumerated() {
            let record = CoordinatorQueueFixtures.record(
                matchId: "match-auth-fail-\(index)",
                sequence: Int64(index + 1)
            )
            let harness = makeHarness(records: [record])
            harness.api.setOutcomes(
                [
                    .fail(.rejected(code: code, status: 401, data: nil, retryAfter: nil)),
                    .fail(.rejected(code: code, status: 401, data: nil, retryAfter: nil)),
                ],
                for: record.partition.matchId
            )

            await harness.coordinator.activate(identity: CoordinatorQueueFixtures.identity)
            let requiresAuthentication = await eventually {
                await harness.repository.record(id: record.localQueueRecordId)?.state == .actionRequired
            }
            XCTAssertTrue(requiresAuthentication)
            let persistedValue = await harness.repository.record(id: record.localQueueRecordId)
            let persisted = try XCTUnwrap(persistedValue)
            XCTAssertEqual(persisted.stateReasonCode, .authentication)
            XCTAssertEqual(harness.credentials.refreshCalls, 1)
            XCTAssertEqual(harness.api.holeRequests.count, 2)
        }
    }

    func testRevisionConflictEquivalentResolvesDifferingStaysAndBlankSafelyRebases() async throws {
        let equivalent = CoordinatorQueueFixtures.record(matchId: "conflict-equivalent", sequence: 1)
        let rebase = CoordinatorQueueFixtures.record(matchId: "conflict-rebase", sequence: 2)
        let differing = CoordinatorQueueFixtures.record(matchId: "conflict-differing", sequence: 3)
        let harness = makeHarness(records: [equivalent, rebase, differing])
        harness.api.configureCanonical(
            for: equivalent.partition,
            matchRevision: 14,
            scores: [CoordinatorQueueFixtures.score(
                holeNumber: equivalent.intent.holeNumber,
                revision: 2,
                gross: equivalent.intent.gross
            )]
        )
        harness.api.configureCanonical(for: rebase.partition, matchRevision: 14)
        let officialDifferent = ScoringQueueGross(teamOne: [6, 6], teamTwo: [5, 6])
        harness.api.configureCanonical(
            for: differing.partition,
            matchRevision: 14,
            scores: [CoordinatorQueueFixtures.score(
                holeNumber: differing.intent.holeNumber,
                revision: 2,
                gross: officialDifferent
            )]
        )
        for record in [equivalent, rebase, differing] {
            let data = MobileErrorData(
                matchId: record.partition.matchId,
                currentMatchRevision: 14,
                currentHoleRevision: 2,
                currentPermissionRevision: 4,
                scoredHoles: 1,
                refreshRequired: true
            )
            var outcomes: [CoordinatorQueueAPI.HoleOutcome] = [
                .fail(.rejected(code: .revisionConflict, status: 409, data: data, retryAfter: nil)),
            ]
            if record.partition == rebase.partition {
                outcomes.append(.fail(.definitelyNotSent(.clientUnavailable)))
            }
            harness.api.setOutcomes(outcomes, for: record.partition.matchId)
        }

        await harness.coordinator.activate(identity: CoordinatorQueueFixtures.identity)

        let conflictsReconciled = await eventually {
            let snapshot = await harness.repository.snapshot()
            return snapshot.first(where: { $0.partition == equivalent.partition })?.state == .resolved &&
                snapshot.first(where: { $0.partition == differing.partition })?.state == .conflict &&
                snapshot.first(where: { $0.partition == rebase.partition })?.state == .retryable
        }
        XCTAssertTrue(conflictsReconciled)
        let snapshot = await harness.repository.snapshot()
        XCTAssertEqual(
            snapshot.first(where: { $0.partition == equivalent.partition })?.resolution?.reason,
            .officialEquivalent
        )
        XCTAssertEqual(
            snapshot.first(where: { $0.partition == differing.partition })?.conflict?.officialGross,
            officialDifferent
        )
        let rebased = try XCTUnwrap(snapshot.first { $0.partition == rebase.partition })
        XCTAssertEqual(rebased.base.automaticRebaseCount, 1)
        XCTAssertEqual(rebased.base.expectedMatchRevision, 14)
        XCTAssertEqual(
            harness.api.holeRequests.filter { $0.matchId == rebase.partition.matchId }.map(\.expectedMatchRevision),
            [12, 14]
        )
    }

    func testConflictRefreshFailureSchedulesRefreshOnlyRetryWithoutResubmission() async throws {
        let record = CoordinatorQueueFixtures.record(matchId: "conflict-refresh-failure")
        let harness = makeHarness(records: [record], jitter: { 0.2 })
        harness.api.setCurrentOutcomes(
            [.canonical, .fail(.transportUnavailable)],
            for: record.partition.matchId
        )
        harness.api.setOutcomes(
            [.fail(.rejected(
                code: .revisionConflict,
                status: 409,
                data: MobileErrorData(
                    matchId: record.partition.matchId,
                    currentMatchRevision: 14,
                    currentHoleRevision: 1,
                    currentPermissionRevision: 4,
                    scoredHoles: 0,
                    refreshRequired: true
                ),
                retryAfter: nil
            ))],
            for: record.partition.matchId
        )

        await harness.coordinator.activate(identity: CoordinatorQueueFixtures.identity)

        let retryScheduled = await eventually {
            let persisted = await harness.repository.record(id: record.localQueueRecordId)
            return persisted?.state == .conflict && persisted?.attempt.nextRetryAt != nil
        }
        XCTAssertTrue(retryScheduled)
        let persistedValue = await awaitRecord(record.localQueueRecordId, in: harness.repository)
        let persisted = try XCTUnwrap(persistedValue)
        XCTAssertTrue(persisted.conflict?.refreshRequired == true)
        XCTAssertEqual(persisted.attempt.nextRetryAt, CoordinatorQueueFixtures.now.addingTimeInterval(2))
        XCTAssertEqual(harness.api.holeRequests.count, 1)
        XCTAssertEqual(harness.api.holeRequests.first?.mutationId, record.mutationId)
    }

    func testFourthSafeRebaseRequiresReviewWithRebaseLimit() async throws {
        let record = CoordinatorQueueFixtures.record(
            matchId: "conflict-cap",
            automaticRebaseCount: 3
        )
        let harness = makeHarness(records: [record])
        harness.api.configureCanonical(for: record.partition, matchRevision: 14)
        harness.api.setOutcomes(
            [.fail(.rejected(
                code: .revisionConflict,
                status: 409,
                data: MobileErrorData(
                    matchId: record.partition.matchId,
                    currentMatchRevision: 14,
                    currentHoleRevision: 0,
                    currentPermissionRevision: 4,
                    scoredHoles: 0,
                    refreshRequired: true
                ),
                retryAfter: nil
            ))],
            for: record.partition.matchId
        )

        await harness.coordinator.activate(identity: CoordinatorQueueFixtures.identity)

        let rebaseLimitReached = await eventually {
            await harness.repository.record(id: record.localQueueRecordId)?.state == .actionRequired
        }
        XCTAssertTrue(rebaseLimitReached)
        let persistedValue = await harness.repository.record(id: record.localQueueRecordId)
        let persisted = try XCTUnwrap(persistedValue)
        XCTAssertEqual(persisted.stateReasonCode, .rebaseLimit)
        XCTAssertEqual(harness.api.holeRequests.count, 1)
    }

    func testIdempotencyConflictQuarantinesWithoutAutomaticRetry() async throws {
        let record = CoordinatorQueueFixtures.record(matchId: "match-idempotency")
        let harness = makeHarness(records: [record])
        harness.api.setOutcomes(
            [.fail(.rejected(code: .idempotencyConflict, status: 409, data: nil, retryAfter: nil))],
            for: record.partition.matchId
        )

        await harness.coordinator.activate(identity: CoordinatorQueueFixtures.identity)
        let quarantined = await eventually {
            await harness.repository.record(id: record.localQueueRecordId)?.state == .quarantined
        }
        XCTAssertTrue(quarantined)
        try await Task.sleep(nanoseconds: 30_000_000)

        let persistedValue = await harness.repository.record(id: record.localQueueRecordId)
        let persisted = try XCTUnwrap(persistedValue)
        XCTAssertEqual(persisted.quarantineReason, .idempotencyConflict)
        XCTAssertEqual(persisted.stateReasonCode, .idempotencyConflict)
        XCTAssertEqual(harness.api.holeRequests.count, 1)
    }

    func testInitialTwoAndFiveSecondRetryDelaysAreNotJittered() async throws {
        let record = CoordinatorQueueFixtures.record(matchId: "match-retry-schedule")
        let harness = makeHarness(records: [record], jitter: { 0.2 })
        let unknown = MobileScoringMutationError.unknownOutcome(
            reason: .transport,
            code: nil,
            status: nil,
            data: nil,
            retryAfter: nil
        )
        harness.api.setOutcomes([.fail(unknown), .fail(unknown)], for: record.partition.matchId)

        await harness.coordinator.activate(identity: CoordinatorQueueFixtures.identity)
        let firstRetryScheduled = await eventually {
            await harness.repository.record(id: record.localQueueRecordId)?.state == .retryable
        }
        XCTAssertTrue(firstRetryScheduled)
        let firstRetryRecord = await harness.repository.record(id: record.localQueueRecordId)
        XCTAssertEqual(firstRetryRecord?.attempt.nextRetryAt, CoordinatorQueueFixtures.now.addingTimeInterval(2))

        harness.clock.advance(2)
        try await harness.coordinator.manualRetry(recordId: record.localQueueRecordId)
        let secondRetryScheduled = await eventually {
            let persisted = await harness.repository.record(id: record.localQueueRecordId)
            return persisted?.state == .retryable && persisted?.attempt.count == 2
        }
        XCTAssertTrue(secondRetryScheduled)
        let secondRetryRecord = await harness.repository.record(id: record.localQueueRecordId)
        XCTAssertEqual(secondRetryRecord?.attempt.nextRetryAt, CoordinatorQueueFixtures.now.addingTimeInterval(7))
    }

    func testStalePolicyTransitionsAtTwentyFourHoursAndSevenDaysWithoutDeleting() async throws {
        let dayOld = CoordinatorQueueFixtures.record(
            matchId: "stale-day",
            sequence: 1,
            createdAt: CoordinatorQueueFixtures.now.addingTimeInterval(-24 * 60 * 60)
        )
        let weekOld = CoordinatorQueueFixtures.record(
            matchId: "stale-week",
            sequence: 2,
            createdAt: CoordinatorQueueFixtures.now.addingTimeInterval(-7 * 24 * 60 * 60)
        )
        let harness = makeHarness(
            records: [dayOld, weekOld],
            liveMutationSendingEnabled: false
        )

        await harness.coordinator.activate(identity: CoordinatorQueueFixtures.identity)

        let snapshot = await harness.repository.snapshot()
        XCTAssertEqual(snapshot.count, 2)
        XCTAssertEqual(snapshot.first(where: { $0.partition == dayOld.partition })?.state, .actionRequired)
        XCTAssertEqual(snapshot.first(where: { $0.partition == dayOld.partition })?.stateReasonCode, .stale)
        XCTAssertEqual(snapshot.first(where: { $0.partition == weekOld.partition })?.state, .quarantined)
        XCTAssertEqual(
            snapshot.first(where: { $0.partition == weekOld.partition })?.quarantineReason,
            .staleIdempotencyUncertain
        )
    }

    func testSevenDayConflictTransitionsToQuarantineWithoutDeletingIntent() async throws {
        let conflict = ScoringQueueConflict(
            officialGross: nil,
            currentMatchRevision: 14,
            currentHoleRevision: 2,
            currentPermissionRevision: 4,
            refreshRequired: false,
            recordedAt: CoordinatorQueueFixtures.now.addingTimeInterval(-8 * 24 * 60 * 60)
        )
        let record = CoordinatorQueueFixtures.record(
            matchId: "stale-conflict",
            state: .conflict,
            reason: .revision,
            createdAt: CoordinatorQueueFixtures.now.addingTimeInterval(-8 * 24 * 60 * 60),
            conflict: conflict
        )
        let harness = makeHarness(records: [record], liveMutationSendingEnabled: false)

        await harness.coordinator.activate(identity: CoordinatorQueueFixtures.identity)

        let persisted = await harness.repository.record(id: record.localQueueRecordId)
        XCTAssertEqual(persisted?.state, .quarantined)
        XCTAssertEqual(persisted?.quarantineReason, .staleIdempotencyUncertain)
        XCTAssertEqual(persisted?.mutationId, record.mutationId)
        XCTAssertTrue(persisted?.isUnresolved == true)
    }

    func testCanonicalSnapshotMismatchFailsClosedBeforeTransport() async throws {
        let record = CoordinatorQueueFixtures.record(matchId: "snapshot-mismatch")
        let harness = makeHarness(records: [record])
        harness.api.configureCanonical(
            for: record.partition,
            snapshotId: "replacement-snapshot",
            snapshotRevision: 2
        )

        await harness.coordinator.activate(identity: CoordinatorQueueFixtures.identity)

        let rejected = await eventually {
            await harness.repository.record(id: record.localQueueRecordId)?.state == .actionRequired
        }
        XCTAssertTrue(rejected)
        let persisted = await harness.repository.record(id: record.localQueueRecordId)
        XCTAssertEqual(persisted?.stateReasonCode, .identityMismatch)
        XCTAssertTrue(harness.api.holeRequests.isEmpty)
    }

    func testPersistenceReadFailurePreservesKnownIntentAndFailsReliabilityClosed() async throws {
        let record = CoordinatorQueueFixtures.record(matchId: "persistence-failure")
        let harness = makeHarness(records: [record], liveMutationSendingEnabled: false)
        await harness.coordinator.activate(identity: CoordinatorQueueFixtures.identity)
        XCTAssertEqual(harness.coordinator.state.records, [record])

        await harness.repository.setIdentityReadFailure(true)
        await harness.coordinator.refreshForForeground()

        XCTAssertEqual(harness.coordinator.state.records, [record])
        XCTAssertTrue(harness.coordinator.state.lastPersistenceFailure)
        XCTAssertEqual(
            harness.coordinator.reliabilityStatus(matchId: record.partition.matchId),
            .needsReview
        )
    }

    func testHiddenRawQuarantineCountFailsClosedAndPreventsTransport() async throws {
        let record = CoordinatorQueueFixtures.record(matchId: "hidden-quarantine")
        let harness = makeHarness(records: [record])
        await harness.repository.setUnresolvedIdentityCountAdjustment(1)

        await harness.coordinator.activate(identity: CoordinatorQueueFixtures.identity)
        try await Task.sleep(nanoseconds: 30_000_000)

        XCTAssertTrue(harness.coordinator.state.hasHiddenQuarantinedRecords)
        XCTAssertEqual(
            harness.coordinator.reliabilityStatus(matchId: record.partition.matchId),
            .needsReview
        )
        XCTAssertTrue(harness.api.holeRequests.isEmpty)
    }

    func testKeepOfficialRequiresFreshCanonicalProofAndDoesNotReleaseLaterIntent() async throws {
        let conflictGross = ScoringQueueGross(teamOne: [6, 6], teamTwo: [5, 6])
        let conflict = ScoringQueueConflict(
            officialGross: conflictGross,
            currentMatchRevision: 14,
            currentHoleRevision: 2,
            currentPermissionRevision: 4,
            refreshRequired: false,
            recordedAt: CoordinatorQueueFixtures.now.addingTimeInterval(-1)
        )
        let first = CoordinatorQueueFixtures.record(
            matchId: "keep-official-refresh",
            sequence: 1,
            state: .conflict,
            reason: .revision,
            conflict: conflict
        )
        let later = CoordinatorQueueFixtures.record(
            matchId: first.partition.matchId,
            holeNumber: 2,
            sequence: 2
        )
        let harness = makeHarness(records: [first, later])
        harness.api.setCurrentOutcomes(
            [.canonical, .fail(.transportUnavailable)],
            for: first.partition.matchId
        )
        await harness.coordinator.activate(identity: CoordinatorQueueFixtures.identity)

        do {
            try await harness.coordinator.keepOfficial(recordId: first.localQueueRecordId)
            XCTFail("Keep Official must not release ordering without a fresh canonical proof")
        } catch {
            XCTAssertEqual(error as? MobileAPIClientError, .transportUnavailable)
        }

        let persistedFirst = await harness.repository.record(id: first.localQueueRecordId)
        let persistedLater = await harness.repository.record(id: later.localQueueRecordId)
        XCTAssertEqual(persistedFirst?.state, .conflict)
        XCTAssertEqual(persistedLater?.state, .queued)
        XCTAssertTrue(harness.api.holeRequests.isEmpty)
    }

    func testRawRateLimitWithoutV1BodyRemainsRetryableAndHonorsRetryAfter() async throws {
        let record = CoordinatorQueueFixtures.record(matchId: "raw-rate-limit")
        let harness = makeHarness(records: [record], jitter: { 0 })
        harness.api.setOutcomes(
            [.fail(.rejected(code: nil, status: 429, data: nil, retryAfter: .delay(17)))],
            for: record.partition.matchId
        )

        await harness.coordinator.activate(identity: CoordinatorQueueFixtures.identity)

        let retryable = await eventually {
            await harness.repository.record(id: record.localQueueRecordId)?.state == .retryable
        }
        XCTAssertTrue(retryable)
        let persisted = await harness.repository.record(id: record.localQueueRecordId)
        XCTAssertEqual(persisted?.stateReasonCode, .unknownOutcome)
        XCTAssertEqual(persisted?.attempt.lastHttpStatus, 429)
        XCTAssertEqual(
            persisted?.attempt.nextRetryAt,
            CoordinatorQueueFixtures.now.addingTimeInterval(17)
        )
        XCTAssertNil(persisted?.quarantineReason)
    }

    func testEightForegroundTransientFailuresPauseNinthUntilCredibleResumeEvent() async throws {
        let records = (1...9).map {
            CoordinatorQueueFixtures.record(matchId: "failure-budget-\($0)", sequence: Int64($0))
        }
        let harness = makeHarness(records: records, maximumWorkers: 1)
        let unknown = MobileScoringMutationError.unknownOutcome(
            reason: .transport,
            code: nil,
            status: nil,
            data: nil,
            retryAfter: nil
        )
        for record in records {
            harness.api.setOutcomes([.fail(unknown)], for: record.partition.matchId)
        }

        await harness.coordinator.activate(identity: CoordinatorQueueFixtures.identity)

        let paused = await eventually { harness.api.holeRequests.count == 8 }
        XCTAssertTrue(paused)
        try await Task.sleep(nanoseconds: 30_000_000)
        XCTAssertEqual(harness.api.holeRequests.count, 8)
        let beforeResume = await harness.repository.snapshot()
        XCTAssertEqual(beforeResume.filter { $0.state == .retryable }.count, 8)
        XCTAssertEqual(beforeResume.filter { $0.state == .queued }.count, 1)

        harness.coordinator.markNetworkUnavailable(true)
        harness.coordinator.markNetworkUnavailable(false)
        let resumed = await eventually { harness.api.holeRequests.count == 9 }
        XCTAssertTrue(resumed)
    }

    func testSignOutPreparationPausesAdmissionAndDeactivationHidesButRetainsPartition() async throws {
        let harness = makeHarness(liveMutationSendingEnabled: false)
        await harness.coordinator.activate(identity: CoordinatorQueueFixtures.identity)
        let input = CoordinatorQueueFixtures.input()
        _ = try await harness.coordinator.save(input)

        await harness.coordinator.prepareForSignOut()
        do {
            _ = try await harness.coordinator.save(
                CoordinatorQueueFixtures.input(
                    partition: input.partition,
                    holeNumber: 2
                )
            )
            XCTFail("Expected paused admission")
        } catch {
            XCTAssertEqual(error as? ScoringQueueCoordinatorError, .inactiveIdentity)
        }
        let unresolvedActiveCount = await harness.coordinator.unresolvedActiveCount()
        XCTAssertEqual(unresolvedActiveCount, 1)

        await harness.coordinator.deactivate()
        XCTAssertTrue(harness.coordinator.state.records.isEmpty)
        let retainedAfterDeactivation = await harness.repository.snapshot()
        XCTAssertEqual(retainedAfterDeactivation.count, 1)

        let other = ScoringQueueIdentityPartition(
            authUserId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            playerId: "P2",
            tournamentId: "2026"
        )
        await harness.coordinator.activate(identity: other)
        XCTAssertTrue(harness.coordinator.state.records.isEmpty)
        let retainedAfterSwitch = await harness.repository.snapshot()
        XCTAssertEqual(retainedAfterSwitch.count, 1)
    }

    func testLiveMutationGateDisabledKeepsDurableRecordQueuedAndNeverCallsTransport() async throws {
        let harness = makeHarness(liveMutationSendingEnabled: false)
        await harness.coordinator.activate(identity: CoordinatorQueueFixtures.identity)

        let result = try await harness.coordinator.save(CoordinatorQueueFixtures.input())
        guard case .inserted(let inserted) = result else {
            return XCTFail("Expected inserted durable record")
        }
        try await Task.sleep(nanoseconds: 30_000_000)

        let persisted = await harness.repository.record(id: inserted.localQueueRecordId)
        XCTAssertEqual(persisted?.state, .queued)
        XCTAssertTrue(harness.api.holeRequests.isEmpty)
        XCTAssertEqual(harness.coordinator.reliabilityStatus(matchId: inserted.partition.matchId), .savedOnIPhone)
    }

    func testCanonicalPreflightAuthenticationAndIdentityFailuresStopBeforeMutation() async throws {
        let authentication = CoordinatorQueueFixtures.record(
            matchId: "preflight-authentication",
            sequence: 1
        )
        let identity = CoordinatorQueueFixtures.record(
            matchId: "preflight-identity",
            sequence: 2
        )
        let harness = makeHarness(records: [authentication, identity])
        harness.api.setCurrentOutcomes(
            [.fail(.server(code: .invalidToken, status: 401))],
            for: authentication.partition.matchId
        )
        harness.api.setCurrentOutcomes(
            [.fail(.server(code: .participantNotFound, status: 403))],
            for: identity.partition.matchId
        )
        var invalidationCount = 0
        harness.coordinator.setAccessInvalidationHandler { invalidationCount += 1 }

        await harness.coordinator.activate(identity: CoordinatorQueueFixtures.identity)

        let stopped = await eventually {
            let authRecord = await harness.repository.record(id: authentication.localQueueRecordId)
            let identityRecord = await harness.repository.record(id: identity.localQueueRecordId)
            return authRecord?.state == .actionRequired && identityRecord?.state == .actionRequired
        }
        XCTAssertTrue(stopped)
        let authPersisted = await harness.repository.record(id: authentication.localQueueRecordId)
        let identityPersisted = await harness.repository.record(id: identity.localQueueRecordId)
        XCTAssertEqual(authPersisted?.stateReasonCode, .authentication)
        XCTAssertEqual(authPersisted?.attempt.lastErrorCode, MobileErrorCode.invalidToken.rawValue)
        XCTAssertEqual(identityPersisted?.stateReasonCode, .identity)
        XCTAssertEqual(identityPersisted?.attempt.lastErrorCode, MobileErrorCode.participantNotFound.rawValue)
        XCTAssertEqual(invalidationCount, 2)
        XCTAssertTrue(harness.api.holeRequests.isEmpty)
    }

    func testCanonicalPreflightCredentialIdentityMismatchStopsBeforeMutation() async throws {
        let record = CoordinatorQueueFixtures.record(matchId: "preflight-credential-identity")
        let harness = makeHarness(records: [record])
        harness.credentials.returnedAuthUserID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
        var invalidationCount = 0
        harness.coordinator.setAccessInvalidationHandler { invalidationCount += 1 }

        await harness.coordinator.activate(identity: CoordinatorQueueFixtures.identity)

        let stopped = await eventually {
            await harness.repository.record(id: record.localQueueRecordId)?.state == .actionRequired
        }
        XCTAssertTrue(stopped)
        let persisted = await harness.repository.record(id: record.localQueueRecordId)
        XCTAssertEqual(persisted?.stateReasonCode, .identityChanged)
        XCTAssertEqual(invalidationCount, 1)
        XCTAssertTrue(harness.api.holeRequests.isEmpty)
    }

    func testCanonicalPreflightScoringAuthorityFailuresMapToExactActionRequiredReason() async throws {
        let expectations: [(MobileErrorCode, Int, ScoringQueueStateReasonCode)] = [
            (.matchNotFound, 404, .matchMissing),
            (.scoringNotAuthorized, 403, .authorization),
            (.scoringReadOnly, 409, .readOnly),
        ]
        let records = expectations.enumerated().map { index, _ in
            CoordinatorQueueFixtures.record(
                matchId: "preflight-authority-\(index)",
                sequence: Int64(index + 1)
            )
        }
        let harness = makeHarness(records: records)
        for (record, expectation) in zip(records, expectations) {
            harness.api.setCurrentOutcomes(
                [.fail(.server(code: expectation.0, status: expectation.1))],
                for: record.partition.matchId
            )
        }

        await harness.coordinator.activate(identity: CoordinatorQueueFixtures.identity)

        let stopped = await eventually {
            let snapshot = await harness.repository.snapshot()
            return snapshot.allSatisfy { $0.state == .actionRequired }
        }
        XCTAssertTrue(stopped)
        let snapshot = await harness.repository.snapshot()
        for (record, expectation) in zip(records, expectations) {
            let persisted = snapshot.first { $0.localQueueRecordId == record.localQueueRecordId }
            XCTAssertEqual(persisted?.stateReasonCode, expectation.2)
            XCTAssertEqual(persisted?.attempt.lastErrorCode, expectation.0.rawValue)
            XCTAssertEqual(persisted?.attempt.lastHttpStatus, expectation.1)
        }
        XCTAssertTrue(harness.api.holeRequests.isEmpty)
    }

    func testCanonicalPreflightTransientFailuresPersistRetryAndNeverMutate() async throws {
        let failures: [MobileAPIClientError] = [
            .transportUnavailable,
            .unexpectedStatus(429),
            .unexpectedStatus(502),
            .server(code: .mobileAPIUnavailable, status: 503),
            .server(code: .scoringUnavailable, status: 503),
            .server(code: .internalError, status: 500),
        ]
        let records = failures.enumerated().map { index, _ in
            CoordinatorQueueFixtures.record(
                matchId: "preflight-transient-\(index)",
                sequence: Int64(index + 1)
            )
        }
        let harness = makeHarness(records: records, jitter: { 0 })
        var authorityRevalidations = 0
        harness.coordinator.setAuthorityRevalidationHandler { authorityRevalidations += 1 }
        for (record, failure) in zip(records, failures) {
            harness.api.setCurrentOutcomes([.fail(failure)], for: record.partition.matchId)
        }

        await harness.coordinator.activate(identity: CoordinatorQueueFixtures.identity)

        let retriesPersisted = await eventually {
            let snapshot = await harness.repository.snapshot()
            return snapshot.allSatisfy { $0.attempt.nextRetryAt != nil }
        }
        XCTAssertTrue(retriesPersisted)
        let snapshot = await harness.repository.snapshot()
        XCTAssertTrue(snapshot.allSatisfy { $0.state == .queued })
        XCTAssertTrue(snapshot.allSatisfy {
            $0.attempt.nextRetryAt == CoordinatorQueueFixtures.now.addingTimeInterval(2)
        })
        XCTAssertEqual(authorityRevalidations, 1)
        XCTAssertTrue(harness.api.holeRequests.isEmpty)
    }

    func testCanonicalPreflightContractAndUnknownPermanentFailuresQuarantineWithoutMutation() async throws {
        let incompatible = CoordinatorQueueFixtures.record(
            matchId: "preflight-incompatible",
            sequence: 1
        )
        let unknownPermanent = CoordinatorQueueFixtures.record(
            matchId: "preflight-unknown-permanent",
            sequence: 2
        )
        let harness = makeHarness(records: [incompatible, unknownPermanent])
        harness.api.setCurrentOutcomes(
            [.incompatibleContract],
            for: incompatible.partition.matchId
        )
        harness.api.setCurrentOutcomes(
            [.fail(.unexpectedStatus(422))],
            for: unknownPermanent.partition.matchId
        )

        await harness.coordinator.activate(identity: CoordinatorQueueFixtures.identity)

        let quarantined = await eventually {
            let snapshot = await harness.repository.snapshot()
            return snapshot.allSatisfy { $0.state == .quarantined }
        }
        XCTAssertTrue(quarantined)
        let incompatiblePersisted = await harness.repository.record(id: incompatible.localQueueRecordId)
        let unknownPersisted = await harness.repository.record(id: unknownPermanent.localQueueRecordId)
        XCTAssertEqual(incompatiblePersisted?.quarantineReason, .invalidRecordOrContract)
        XCTAssertEqual(unknownPersisted?.quarantineReason, .unknownPermanentResponse)
        XCTAssertEqual(unknownPersisted?.attempt.lastHttpStatus, 422)
        XCTAssertTrue(harness.api.holeRequests.isEmpty)
    }

    private func acceptedAttempt() -> ScoringQueueAttempt {
        ScoringQueueAttempt(
            count: 1,
            lastAttemptAt: CoordinatorQueueFixtures.now.addingTimeInterval(-1),
            nextRetryAt: nil,
            everSubmitted: true,
            outcomeCertainty: .knownAccepted,
            syncLeaseId: nil,
            syncLeaseStartedAt: nil,
            lastHttpStatus: 200,
            lastErrorCode: nil
        )
    }

    private func makeHarness(
        records: [ScoringQueueRecord] = [],
        liveMutationSendingEnabled: Bool = true,
        maximumWorkers: Int = 2,
        jitter: @escaping @Sendable () -> Double = { 0 }
    ) -> (
        repository: InMemoryScoringQueueRepository,
        api: CoordinatorQueueAPI,
        credentials: CoordinatorQueueCredentials,
        clock: CoordinatorQueueClock,
        coordinator: ScoringQueueCoordinator
    ) {
        let repository = InMemoryScoringQueueRepository(records: records)
        let api = CoordinatorQueueAPI()
        for partition in Set(records.map(\.partition)) {
            api.configureCanonical(for: partition)
        }
        let credentials = CoordinatorQueueCredentials()
        let clock = CoordinatorQueueClock()
        let coordinator = ScoringQueueCoordinator(
            repository: repository,
            api: api,
            credentialProvider: credentials,
            liveMutationSendingEnabled: liveMutationSendingEnabled,
            maximumWorkers: maximumWorkers,
            processId: "coordinator-test-process",
            now: { clock.value },
            jitter: jitter
        )
        return (repository, api, credentials, clock, coordinator)
    }

    private func eventually(
        attempts: Int = 1_000,
        _ condition: @escaping @MainActor () async -> Bool
    ) async -> Bool {
        for _ in 0..<attempts {
            if await condition() { return true }
            try? await Task.sleep(nanoseconds: 2_000_000)
        }
        return false
    }

    private func awaitRecord(
        _ id: String,
        in repository: InMemoryScoringQueueRepository
    ) async -> ScoringQueueRecord? {
        await repository.record(id: id)
    }
}
