import XCTest
@testable import BaggerInv

@MainActor
final class ScoringQueueCoordinatorTests: XCTestCase {
    func testInactiveActivationLoadsDurableRecordsButWaitsForAuthorizedForegroundRefresh() async throws {
        let record = CoordinatorQueueFixtures.record(matchId: "inactive-activation")
        let activity = NativeApplicationActivity(
            isActive: false,
            mutationTransportAuthorized: false
        )
        let harness = makeHarness(records: [record], applicationActivity: activity)

        await harness.coordinator.activate(identity: CoordinatorQueueFixtures.identity)

        XCTAssertEqual(harness.coordinator.state.records, [record])
        XCTAssertTrue(harness.coordinator.state.isSuspended)
        XCTAssertTrue(harness.api.scoringCurrentMatchIDs.isEmpty)
        XCTAssertTrue(harness.api.holeRequests.isEmpty)

        activity.update(isActive: true)
        harness.coordinator.prepareForForegroundRevalidation()
        activity.authorizeMutationTransport()
        await harness.coordinator.refreshForForeground()

        let becameOfficial = await eventually {
            (await harness.repository.record(id: record.localQueueRecordId))?.isUnresolved == false
        }
        XCTAssertTrue(becameOfficial)
        XCTAssertFalse(harness.api.scoringCurrentMatchIDs.isEmpty)
        XCTAssertEqual(harness.api.holeRequests.map(\.mutationId), [record.mutationId])
    }

    func testOldActivityEpochCannotSendAfterTransportStartSuspendsAndNewEpochIsAuthorized() async throws {
        let record = CoordinatorQueueFixtures.record(matchId: "old-activity-epoch")
        let activity = NativeApplicationActivity(
            isActive: true,
            mutationTransportAuthorized: true
        )
        let harness = makeHarness(records: [record], applicationActivity: activity)
        await harness.repository.suspendNextTransportStart()

        await harness.coordinator.activate(identity: CoordinatorQueueFixtures.identity)
        let transportStartSuspended = await eventually {
            await harness.repository.hasSuspendedTransportStart()
        }
        XCTAssertTrue(transportStartSuspended)

        activity.update(isActive: false)
        activity.update(isActive: true)
        activity.authorizeMutationTransport()
        await harness.repository.resumeSuspendedTransportStart()

        let stoppedBeforePOST = await eventually {
            (await harness.repository.record(id: record.localQueueRecordId))?.state == .retryable
        }
        XCTAssertTrue(stoppedBeforePOST)
        XCTAssertTrue(harness.api.holeRequests.isEmpty)
        let persisted = await harness.repository.record(id: record.localQueueRecordId)
        XCTAssertEqual(persisted?.mutationId, record.mutationId)
        XCTAssertEqual(persisted?.attempt.count, 1)
        XCTAssertEqual(persisted?.attempt.outcomeCertainty, .unknown)
    }

    func testExactPreviewCapabilityCannotOverrideRevokedApplicationActivity() async throws {
        let record = CoordinatorQueueFixtures.record(matchId: "preview-capability-revoked")
        let activity = NativeApplicationActivity(
            isActive: true,
            mutationTransportAuthorized: true
        )
        let capability = PreviewScoringMutationCapability.resolve(
            environment: TestFixtures.environment,
            bundleIdentifier: PreviewScoringMutationCapability.previewBundleIdentifier
        )
        XCTAssertTrue(capability.allowsTransport)
        let harness = makeHarness(
            records: [record],
            applicationActivity: activity,
            mutationAuthorization: capability
        )
        await harness.repository.suspendNextTransportStart()

        await harness.coordinator.activate(identity: CoordinatorQueueFixtures.identity)
        let transportStartSuspended = await eventually {
            await harness.repository.hasSuspendedTransportStart()
        }
        XCTAssertTrue(transportStartSuspended)

        activity.update(isActive: false)
        await harness.repository.resumeSuspendedTransportStart()

        let stoppedBeforePOST = await eventually {
            (await harness.repository.record(id: record.localQueueRecordId))?.state == .retryable
        }
        XCTAssertTrue(stoppedBeforePOST)
        XCTAssertTrue(harness.api.holeRequests.isEmpty)
        let persisted = await harness.repository.record(id: record.localQueueRecordId)
        XCTAssertEqual(persisted?.mutationId, record.mutationId)
    }

    func testSuspendedForegroundCanonicalReadBlocksPOSTButStillAllowsDurableLocalSave() async throws {
        let record = CoordinatorQueueFixtures.record(matchId: "foreground-canonical-barrier")
        let activity = NativeApplicationActivity(
            isActive: false,
            mutationTransportAuthorized: false
        )
        let harness = makeHarness(records: [record], applicationActivity: activity)
        await harness.coordinator.activate(identity: CoordinatorQueueFixtures.identity)

        harness.api.suspendNextCurrent(for: record.partition.matchId)
        activity.update(isActive: true)
        harness.coordinator.prepareForForegroundRevalidation()
        activity.authorizeMutationTransport()
        let foregroundRefresh = Task { @MainActor in
            await harness.coordinator.refreshForForeground()
        }
        let canonicalReadSuspended = await eventually {
            harness.api.hasSuspendedCurrent(for: record.partition.matchId)
        }
        XCTAssertTrue(canonicalReadSuspended)

        let localSave = try await harness.coordinator.save(
            CoordinatorQueueFixtures.input(
                partition: record.partition,
                holeNumber: 2,
                expectedMatchRevision: record.base.expectedMatchRevision
            )
        )
        guard case .inserted(let inserted) = localSave else {
            return XCTFail("Expected a new durable local intent during foreground revalidation")
        }
        let persistedLocalSave = await harness.repository.record(
            id: inserted.localQueueRecordId
        )
        XCTAssertNotNil(persistedLocalSave)
        XCTAssertTrue(harness.api.holeRequests.isEmpty)

        // End the lifecycle before releasing the delayed GET so this test also
        // proves its stale completion cannot open the mutation gate.
        activity.update(isActive: false)
        harness.coordinator.prepareForApplicationInactivity()
        harness.api.resumeSuspendedCurrent(for: record.partition.matchId)
        await foregroundRefresh.value

        XCTAssertTrue(harness.api.holeRequests.isEmpty)
        let persistedRecords = await harness.repository.snapshot()
        XCTAssertEqual(persistedRecords.filter(\.isUnresolved).count, 2)
    }

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

    func testFinalizationGuardRejectsSaveThatPassedAdmissionBeforeDurableCommit() async throws {
        let harness = makeHarness(liveMutationSendingEnabled: false)
        await harness.coordinator.activate(identity: CoordinatorQueueFixtures.identity)
        let input = CoordinatorQueueFixtures.input()
        await harness.repository.suspendNextSave()

        let saveTask = Task { @MainActor in
            try await harness.coordinator.save(input)
        }
        let saveSuspended = await eventually {
            await harness.repository.hasSuspendedSave()
        }
        guard saveSuspended else {
            XCTFail("Expected the admitted Save to suspend before its durable commit")
            return
        }
        let recordsBeforeCommit = await harness.repository.snapshot()
        XCTAssertTrue(recordsBeforeCommit.isEmpty)

        do {
            let unexpectedGuard = try await harness.coordinator.acquireFinalizationGuard(
                matchId: input.partition.matchId
            )
            try harness.coordinator.releaseFinalizationGuard(unexpectedGuard)
            XCTFail("Finalization must not prove an admitted Save's Match queue empty")
        } catch {
            XCTAssertEqual(
                error as? ScoringQueueCoordinatorError,
                .finalizationQueueNotReady
            )
        }

        await harness.repository.resumeSuspendedSave()
        let result = try await saveTask.value
        guard case .inserted(let inserted) = result else {
            return XCTFail("Expected the admitted Save to commit")
        }
        let persisted = await harness.repository.record(id: inserted.localQueueRecordId)
        XCTAssertEqual(persisted, inserted)
    }

    func testSignOutCountFailsClosedWhileAdmittedSaveHasNotCommitted() async throws {
        let harness = makeHarness(liveMutationSendingEnabled: false)
        await harness.coordinator.activate(identity: CoordinatorQueueFixtures.identity)
        let input = CoordinatorQueueFixtures.input(
            partition: CoordinatorQueueFixtures.partition(matchId: "signout-admitted-save")
        )
        await harness.repository.suspendNextSave()

        let saveTask = Task { @MainActor in
            try await harness.coordinator.save(input)
        }
        let saveSuspended = await eventually {
            await harness.repository.hasSuspendedSave()
        }
        XCTAssertTrue(saveSuspended)

        await harness.coordinator.prepareForSignOut()
        let inFlightCount = await harness.coordinator.unresolvedActiveCount()
        XCTAssertNil(inFlightCount)

        await harness.repository.resumeSuspendedSave()
        _ = try await saveTask.value
        let committedCount = await harness.coordinator.unresolvedActiveCount()
        XCTAssertEqual(committedCount, 1)
    }

    func testSaveCommittedAfterEmptyForegroundBarrierStillRequiresCanonicalPreflight() async throws {
        let activity = NativeApplicationActivity(
            isActive: false,
            mutationTransportAuthorized: false
        )
        let harness = makeHarness(applicationActivity: activity)
        let input = CoordinatorQueueFixtures.input(
            partition: CoordinatorQueueFixtures.partition(matchId: "late-foreground-save")
        )
        harness.api.configureCanonical(for: input.partition)
        harness.api.setCurrentOutcomes(
            [.fail(.transportUnavailable)],
            for: input.partition.matchId
        )
        await harness.coordinator.activate(identity: CoordinatorQueueFixtures.identity)
        await harness.repository.suspendNextSave()

        activity.update(isActive: true)
        harness.coordinator.prepareForForegroundRevalidation()
        activity.authorizeMutationTransport()
        let saveTask = Task { @MainActor in
            try await harness.coordinator.save(input)
        }
        let saveSuspended = await eventually {
            await harness.repository.hasSuspendedSave()
        }
        XCTAssertTrue(saveSuspended)

        // The initial barrier observes an empty queue and completes before the
        // admitted Save reaches SQLite.
        await harness.coordinator.refreshForForeground()
        XCTAssertTrue(harness.api.scoringCurrentMatchIDs.isEmpty)

        await harness.repository.resumeSuspendedSave()
        _ = try await saveTask.value
        let canonicalPreflightAttempted = await eventually {
            harness.api.scoringCurrentMatchIDs.contains(input.partition.matchId)
        }
        XCTAssertTrue(canonicalPreflightAttempted)
        XCTAssertTrue(harness.api.holeRequests.isEmpty)
    }

    func testDelayedCanonicalGETAfterSignOutPreparationCannotMutateQueueOrInvalidateAccess() async throws {
        let record = CoordinatorQueueFixtures.record(matchId: "late-current-sign-out")
        let harness = makeHarness(records: [record])
        var canonicalUpdateCount = 0
        var invalidationCount = 0
        harness.coordinator.setCanonicalUpdateHandler { _ in canonicalUpdateCount += 1 }
        harness.coordinator.setAccessInvalidationHandler { invalidationCount += 1 }
        harness.api.suspendNextCurrent(for: record.partition.matchId)

        let activation = Task { @MainActor in
            await harness.coordinator.activate(identity: CoordinatorQueueFixtures.identity)
        }
        let readSuspended = await eventually {
            harness.api.hasSuspendedCurrent(for: record.partition.matchId)
        }
        XCTAssertTrue(readSuspended)

        await harness.coordinator.prepareForSignOut()
        harness.api.resumeSuspendedCurrent(for: record.partition.matchId)
        await activation.value

        let persistedRecords = await harness.repository.snapshot()
        XCTAssertEqual(persistedRecords, [record])
        XCTAssertEqual(harness.coordinator.state.records, [record])
        XCTAssertFalse(harness.coordinator.state.lastPersistenceFailure)
        XCTAssertEqual(canonicalUpdateCount, 0)
        XCTAssertEqual(invalidationCount, 0)
        XCTAssertTrue(harness.api.holeRequests.isEmpty)
    }

    func testDelayedCanonicalGETAfterEnvironmentSuspensionCannotMutateQueueOrInvalidateAccess() async throws {
        let record = CoordinatorQueueFixtures.record(matchId: "late-current-environment")
        let harness = makeHarness(records: [record])
        var canonicalUpdateCount = 0
        var invalidationCount = 0
        harness.coordinator.setCanonicalUpdateHandler { _ in canonicalUpdateCount += 1 }
        harness.coordinator.setAccessInvalidationHandler { invalidationCount += 1 }
        harness.api.suspendNextCurrent(for: record.partition.matchId)

        let activation = Task { @MainActor in
            await harness.coordinator.activate(identity: CoordinatorQueueFixtures.identity)
        }
        let readSuspended = await eventually {
            harness.api.hasSuspendedCurrent(for: record.partition.matchId)
        }
        XCTAssertTrue(readSuspended)

        await harness.coordinator.suspendForEnvironmentReattestation()
        harness.api.resumeSuspendedCurrent(for: record.partition.matchId)
        await activation.value

        let persistedRecords = await harness.repository.snapshot()
        XCTAssertEqual(persistedRecords, [record])
        XCTAssertEqual(harness.coordinator.state.records, [record])
        XCTAssertTrue(harness.coordinator.state.isSuspended)
        XCTAssertFalse(harness.coordinator.state.lastPersistenceFailure)
        XCTAssertEqual(canonicalUpdateCount, 0)
        XCTAssertEqual(invalidationCount, 0)
        XCTAssertTrue(harness.api.holeRequests.isEmpty)
    }

    func testDelayedCanonicalGETAfterAccountSwitchCannotMutateOldPartitionOrNewState() async throws {
        let record = CoordinatorQueueFixtures.record(matchId: "late-current-account-switch")
        let harness = makeHarness(records: [record])
        let replacementIdentity = ScoringQueueIdentityPartition(
            authUserId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            playerId: "P2",
            tournamentId: "2026"
        )
        var canonicalUpdateCount = 0
        var invalidationCount = 0
        harness.coordinator.setCanonicalUpdateHandler { _ in canonicalUpdateCount += 1 }
        harness.coordinator.setAccessInvalidationHandler { invalidationCount += 1 }
        harness.api.suspendNextCurrent(for: record.partition.matchId)

        let oldActivation = Task { @MainActor in
            await harness.coordinator.activate(identity: CoordinatorQueueFixtures.identity)
        }
        let readSuspended = await eventually {
            harness.api.hasSuspendedCurrent(for: record.partition.matchId)
        }
        XCTAssertTrue(readSuspended)

        await harness.coordinator.deactivate()
        await harness.coordinator.activate(identity: replacementIdentity)
        harness.api.resumeSuspendedCurrent(for: record.partition.matchId)
        await oldActivation.value

        let persistedRecords = await harness.repository.snapshot()
        XCTAssertEqual(persistedRecords, [record])
        XCTAssertTrue(harness.coordinator.state.records.isEmpty)
        XCTAssertFalse(harness.coordinator.state.lastPersistenceFailure)
        XCTAssertEqual(canonicalUpdateCount, 0)
        XCTAssertEqual(invalidationCount, 0)
        XCTAssertTrue(harness.api.holeRequests.isEmpty)
    }

    func testDelayedHoleAcknowledgementAfterSignOutPreparationPersistsOldResultWithoutPublishingStaleState() async throws {
        let record = CoordinatorQueueFixtures.record(matchId: "late-hole-sign-out")
        let harness = makeHarness(records: [record])
        var canonicalUpdateCount = 0
        var accessInvalidationCount = 0
        var authorityRevalidationCount = 0
        harness.coordinator.setCanonicalUpdateHandler { _ in canonicalUpdateCount += 1 }
        harness.coordinator.setAccessInvalidationHandler { accessInvalidationCount += 1 }
        harness.coordinator.setAuthorityRevalidationHandler { authorityRevalidationCount += 1 }
        harness.api.suspendNextHole(for: record.partition.matchId)

        await harness.coordinator.activate(identity: CoordinatorQueueFixtures.identity)
        let postSuspended = await eventually {
            harness.api.hasSuspendedHole(for: record.partition.matchId)
        }
        XCTAssertTrue(postSuspended)
        let callbacksBeforeLifecycle = canonicalUpdateCount

        await harness.coordinator.prepareForSignOut()
        let stateBeforeCompletion = harness.coordinator.state
        harness.api.resumeSuspendedHole(for: record.partition.matchId)

        let acknowledgementPersisted = await eventually {
            let persisted = await harness.repository.record(id: record.localQueueRecordId)
            return persisted?.state == .acknowledged &&
                persisted?.acknowledgement?.refreshPending == true
        }
        XCTAssertTrue(acknowledgementPersisted)
        let persisted = await harness.repository.record(id: record.localQueueRecordId)
        XCTAssertEqual(persisted?.mutationId, record.mutationId)
        XCTAssertEqual(persisted?.attempt.outcomeCertainty, .knownAccepted)
        XCTAssertEqual(persisted?.attempt.lastHttpStatus, 200)
        XCTAssertNil(persisted?.attempt.syncLeaseId)
        XCTAssertEqual(harness.coordinator.state, stateBeforeCompletion)
        XCTAssertEqual(canonicalUpdateCount, callbacksBeforeLifecycle)
        XCTAssertEqual(accessInvalidationCount, 0)
        XCTAssertEqual(authorityRevalidationCount, 0)
        XCTAssertEqual(harness.api.holeRequests.count, 1)
        XCTAssertEqual(harness.api.scoringCurrentMatchIDs.count, 1)
    }

    func testDelayedHoleIdentityRejectionAfterEnvironmentSuspensionPersistsOldResultWithoutInvalidatingAccess() async throws {
        let record = CoordinatorQueueFixtures.record(matchId: "late-hole-environment")
        let harness = makeHarness(records: [record])
        var canonicalUpdateCount = 0
        var accessInvalidationCount = 0
        var authorityRevalidationCount = 0
        harness.coordinator.setCanonicalUpdateHandler { _ in canonicalUpdateCount += 1 }
        harness.coordinator.setAccessInvalidationHandler { accessInvalidationCount += 1 }
        harness.coordinator.setAuthorityRevalidationHandler { authorityRevalidationCount += 1 }
        harness.api.setOutcomes(
            [.fail(.rejected(
                code: .participantNotFound,
                status: 403,
                data: nil,
                retryAfter: nil
            ))],
            for: record.partition.matchId
        )
        harness.api.suspendNextHole(for: record.partition.matchId)

        await harness.coordinator.activate(identity: CoordinatorQueueFixtures.identity)
        let postSuspended = await eventually {
            harness.api.hasSuspendedHole(for: record.partition.matchId)
        }
        XCTAssertTrue(postSuspended)
        let callbacksBeforeLifecycle = canonicalUpdateCount

        await harness.coordinator.suspendForEnvironmentReattestation()
        let stateBeforeCompletion = harness.coordinator.state
        harness.api.resumeSuspendedHole(for: record.partition.matchId)

        let rejectionPersisted = await eventually {
            let persisted = await harness.repository.record(id: record.localQueueRecordId)
            return persisted?.state == .actionRequired &&
                persisted?.stateReasonCode == .identity
        }
        XCTAssertTrue(rejectionPersisted)
        let persisted = await harness.repository.record(id: record.localQueueRecordId)
        XCTAssertEqual(persisted?.mutationId, record.mutationId)
        XCTAssertEqual(persisted?.attempt.lastErrorCode, MobileErrorCode.participantNotFound.rawValue)
        XCTAssertEqual(persisted?.attempt.lastHttpStatus, 403)
        XCTAssertNil(persisted?.attempt.syncLeaseId)
        XCTAssertEqual(harness.coordinator.state, stateBeforeCompletion)
        XCTAssertTrue(harness.coordinator.state.isSuspended)
        XCTAssertEqual(canonicalUpdateCount, callbacksBeforeLifecycle)
        XCTAssertEqual(accessInvalidationCount, 0)
        XCTAssertEqual(authorityRevalidationCount, 0)
        XCTAssertEqual(harness.api.holeRequests.count, 1)
        XCTAssertEqual(harness.api.scoringCurrentMatchIDs.count, 1)
    }

    func testDelayedHoleEnvironmentRejectionAfterAccountSwitchCannotAffectReplacementLifecycle() async throws {
        let record = CoordinatorQueueFixtures.record(matchId: "late-hole-account-switch")
        let harness = makeHarness(records: [record])
        let replacementIdentity = ScoringQueueIdentityPartition(
            authUserId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            playerId: "P2",
            tournamentId: "2026"
        )
        var canonicalUpdateCount = 0
        var accessInvalidationCount = 0
        var authorityRevalidationCount = 0
        harness.coordinator.setCanonicalUpdateHandler { _ in canonicalUpdateCount += 1 }
        harness.coordinator.setAccessInvalidationHandler { accessInvalidationCount += 1 }
        harness.coordinator.setAuthorityRevalidationHandler { authorityRevalidationCount += 1 }
        harness.api.setOutcomes(
            [.fail(.rejected(
                code: .mobileAPIUnavailable,
                status: 503,
                data: nil,
                retryAfter: nil
            ))],
            for: record.partition.matchId
        )
        harness.api.suspendNextHole(for: record.partition.matchId)

        await harness.coordinator.activate(identity: CoordinatorQueueFixtures.identity)
        let postSuspended = await eventually {
            harness.api.hasSuspendedHole(for: record.partition.matchId)
        }
        XCTAssertTrue(postSuspended)
        let callbacksBeforeLifecycle = canonicalUpdateCount

        await harness.coordinator.deactivate()
        await harness.coordinator.activate(identity: replacementIdentity)
        let replacementStateBeforeCompletion = harness.coordinator.state
        harness.api.resumeSuspendedHole(for: record.partition.matchId)

        let rejectionPersisted = await eventually {
            let persisted = await harness.repository.record(id: record.localQueueRecordId)
            return persisted?.state == .retryable &&
                persisted?.stateReasonCode == .environment
        }
        XCTAssertTrue(rejectionPersisted)
        let persisted = await harness.repository.record(id: record.localQueueRecordId)
        XCTAssertEqual(persisted?.mutationId, record.mutationId)
        XCTAssertEqual(persisted?.attempt.outcomeCertainty, .unknown)
        XCTAssertEqual(persisted?.attempt.lastErrorCode, MobileErrorCode.mobileAPIUnavailable.rawValue)
        XCTAssertEqual(persisted?.attempt.lastHttpStatus, 503)
        XCTAssertNil(persisted?.attempt.syncLeaseId)
        XCTAssertEqual(harness.coordinator.state, replacementStateBeforeCompletion)
        XCTAssertTrue(harness.coordinator.state.records.isEmpty)
        XCTAssertFalse(harness.coordinator.state.isOffline)
        XCTAssertFalse(harness.coordinator.state.lastPersistenceFailure)
        XCTAssertEqual(canonicalUpdateCount, callbacksBeforeLifecycle)
        XCTAssertEqual(accessInvalidationCount, 0)
        XCTAssertEqual(authorityRevalidationCount, 0)
        XCTAssertEqual(harness.api.holeRequests.count, 1)
        XCTAssertEqual(harness.api.scoringCurrentMatchIDs.count, 1)
    }

    func testDelayedUnknownOutcomeAfterEnvironmentResumeReloadsAndReplaysSameIdentity() async throws {
        let record = CoordinatorQueueFixtures.record(matchId: "late-retry-after-resume")
        let harness = makeHarness(records: [record], jitter: { -0.2 })
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
        harness.api.suspendNextHole(for: record.partition.matchId)

        await harness.coordinator.activate(identity: CoordinatorQueueFixtures.identity)
        let firstRequestSuspended = await eventually {
            harness.api.hasSuspendedHole(for: record.partition.matchId)
        }
        XCTAssertTrue(firstRequestSuspended)

        await harness.coordinator.suspendForEnvironmentReattestation()
        await harness.coordinator.resumeAfterEnvironmentReattestation()
        harness.api.resumeSuspendedHole(for: record.partition.matchId)

        let currentLifecycleReloaded = await eventually {
            let persisted = await harness.repository.record(id: record.localQueueRecordId)
            return persisted?.state == .retryable &&
                harness.coordinator.state.records.first?.state == .retryable
        }
        XCTAssertTrue(currentLifecycleReloaded)

        harness.clock.advance(3)
        await harness.coordinator.refreshForForeground()
        let replayCompleted = await eventually {
            let persisted = await harness.repository.record(id: record.localQueueRecordId)
            return harness.api.holeRequests.count == 2 && persisted?.isUnresolved == false
        }
        XCTAssertTrue(replayCompleted)
        XCTAssertEqual(harness.api.holeRequests.map(\.mutationId), [record.mutationId, record.mutationId])
        XCTAssertFalse(harness.coordinator.state.lastPersistenceFailure)
    }

    func testBackgroundPauseCancelsRetryWakeUntilForegroundCanonicalRefresh() async throws {
        var attempt = ScoringQueueAttempt.unattempted
        attempt.nextRetryAt = CoordinatorQueueFixtures.now.addingTimeInterval(0.05)
        let record = CoordinatorQueueFixtures.record(
            matchId: "background-retry-wake",
            state: .queued,
            attempt: attempt
        )
        let harness = makeHarness(records: [record])

        await harness.coordinator.activate(identity: CoordinatorQueueFixtures.identity)
        await harness.coordinator.pauseForBackground()
        try await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertTrue(harness.api.holeRequests.isEmpty)
        XCTAssertTrue(harness.coordinator.state.isSuspended)

        harness.clock.advance(1)
        await harness.coordinator.refreshForForeground()

        let replayCompleted = await eventually {
            let persisted = await harness.repository.record(id: record.localQueueRecordId)
            return harness.api.holeRequests.count == 1 && persisted?.isUnresolved == false
        }
        XCTAssertTrue(replayCompleted)
        XCTAssertFalse(harness.coordinator.state.isSuspended)
        XCTAssertGreaterThanOrEqual(harness.api.scoringCurrentMatchIDs.count, 2)
    }

    func testDelayedAcknowledgementAfterEnvironmentResumeRefreshesWithoutResubmitting() async throws {
        let record = CoordinatorQueueFixtures.record(matchId: "late-ack-after-resume")
        let harness = makeHarness(records: [record])
        harness.api.suspendNextHole(for: record.partition.matchId)

        await harness.coordinator.activate(identity: CoordinatorQueueFixtures.identity)
        let requestSuspended = await eventually {
            harness.api.hasSuspendedHole(for: record.partition.matchId)
        }
        XCTAssertTrue(requestSuspended)

        await harness.coordinator.suspendForEnvironmentReattestation()
        await harness.coordinator.resumeAfterEnvironmentReattestation()
        let canonicalReadsBeforeAcknowledgement = harness.api.scoringCurrentMatchIDs.count
        harness.api.resumeSuspendedHole(for: record.partition.matchId)

        let refreshCompleted = await eventually {
            let persisted = await harness.repository.record(id: record.localQueueRecordId)
            return persisted?.isUnresolved == false
        }
        XCTAssertTrue(refreshCompleted)
        XCTAssertEqual(harness.api.holeRequests.count, 1)
        XCTAssertGreaterThan(
            harness.api.scoringCurrentMatchIDs.count,
            canonicalReadsBeforeAcknowledgement
        )
        XCTAssertFalse(harness.coordinator.state.lastPersistenceFailure)
    }

    func testDelayedUnknownOutcomePersistenceFailureAfterEnvironmentResumeFailsCurrentIdentityClosed() async throws {
        let record = CoordinatorQueueFixtures.record(matchId: "late-retry-write-failure")
        let harness = makeHarness(records: [record])
        harness.api.setOutcomes(
            [.fail(.unknownOutcome(
                reason: .transport,
                code: nil,
                status: nil,
                data: nil,
                retryAfter: nil
            ))],
            for: record.partition.matchId
        )
        harness.api.suspendNextHole(for: record.partition.matchId)

        await harness.coordinator.activate(identity: CoordinatorQueueFixtures.identity)
        let requestSuspended = await eventually {
            harness.api.hasSuspendedHole(for: record.partition.matchId)
        }
        XCTAssertTrue(requestSuspended)

        await harness.coordinator.suspendForEnvironmentReattestation()
        await harness.coordinator.resumeAfterEnvironmentReattestation()
        await harness.repository.failNextReplacement(to: .retryable)
        harness.api.resumeSuspendedHole(for: record.partition.matchId)

        let failedClosed = await eventually {
            harness.coordinator.state.lastPersistenceFailure
        }
        XCTAssertTrue(failedClosed)
        XCTAssertEqual(harness.api.holeRequests.count, 1)
        let persisted = await harness.repository.record(id: record.localQueueRecordId)
        XCTAssertEqual(persisted?.state, .syncing)
        XCTAssertEqual(persisted?.attempt.outcomeCertainty, .unknown)
        XCTAssertEqual(
            harness.coordinator.reliabilityStatus(matchId: record.partition.matchId),
            .needsReview
        )
    }

    func testDelayedOldIdentityPersistenceFailureCannotFailReplacementIdentityClosed() async throws {
        let record = CoordinatorQueueFixtures.record(matchId: "late-old-identity-write-failure")
        let harness = makeHarness(records: [record])
        let replacementIdentity = ScoringQueueIdentityPartition(
            authUserId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            playerId: "P2",
            tournamentId: "2026"
        )
        harness.api.setOutcomes(
            [.fail(.unknownOutcome(
                reason: .transport,
                code: nil,
                status: nil,
                data: nil,
                retryAfter: nil
            ))],
            for: record.partition.matchId
        )
        harness.api.suspendNextHole(for: record.partition.matchId)

        await harness.coordinator.activate(identity: CoordinatorQueueFixtures.identity)
        let requestSuspended = await eventually {
            harness.api.hasSuspendedHole(for: record.partition.matchId)
        }
        XCTAssertTrue(requestSuspended)

        await harness.coordinator.deactivate()
        await harness.coordinator.activate(identity: replacementIdentity)
        await harness.repository.failNextReplacement(to: .retryable)
        harness.api.resumeSuspendedHole(for: record.partition.matchId)
        try await Task.sleep(nanoseconds: 40_000_000)

        XCTAssertFalse(harness.coordinator.state.lastPersistenceFailure)
        XCTAssertTrue(harness.coordinator.state.records.isEmpty)
        XCTAssertEqual(harness.api.holeRequests.count, 1)
        let persisted = await harness.repository.record(id: record.localQueueRecordId)
        XCTAssertEqual(persisted?.state, .syncing)
        XCTAssertEqual(persisted?.attempt.outcomeCertainty, .unknown)
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

    func testCommittedLostResponseRelaunchRequiresSameIDIdempotentAcknowledgement() async throws {
        let record = CoordinatorQueueFixtures.record(matchId: "match-lost-response-relaunch")
        let harness = makeHarness(records: [record])
        harness.api.setOutcomes(
            [.commitThenFail(.unknownOutcome(
                reason: .transport,
                code: nil,
                status: nil,
                data: nil,
                retryAfter: nil
            ))],
            for: record.partition.matchId
        )

        await harness.coordinator.activate(identity: CoordinatorQueueFixtures.identity)
        let unknownPersisted = await eventually {
            let persisted = await harness.repository.record(id: record.localQueueRecordId)
            return persisted?.state == .retryable &&
                persisted?.attempt.outcomeCertainty == .unknown
        }
        XCTAssertTrue(unknownPersisted)
        XCTAssertEqual(harness.api.holeRequests.map(\.mutationId), [record.mutationId])

        await harness.coordinator.deactivate()
        harness.clock.advance(2)
        let restored = ScoringQueueCoordinator(
            repository: harness.repository,
            api: harness.api,
            credentialProvider: harness.credentials,
            mutationAuthorization: TestScoringHoleMutationAuthorization(),
            maximumWorkers: 2,
            processId: "coordinator-restored-process",
            now: { harness.clock.value },
            jitter: { 0 }
        )
        await restored.activate(identity: CoordinatorQueueFixtures.identity)

        let canonicalConfirmed = await eventually {
            let persisted = await harness.repository.record(id: record.localQueueRecordId)
            return persisted?.acknowledgement?.refreshPending == false
        }
        XCTAssertTrue(canonicalConfirmed)
        XCTAssertEqual(
            harness.api.holeRequests.map(\.mutationId),
            [record.mutationId, record.mutationId]
        )
        let recovered = await harness.repository.record(id: record.localQueueRecordId)
        XCTAssertEqual(recovered?.acknowledgement?.idempotent, true)
        XCTAssertEqual(recovered?.attempt.outcomeCertainty, .knownAccepted)

        await restored.deactivate()
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

    func testAcknowledgedRefreshWithDifferentCanonicalGrossRemainsDurableForReview() async throws {
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
            matchId: "match-ack-disagrees",
            state: .acknowledged,
            attempt: acceptedAttempt(),
            acknowledgement: acknowledgement
        )
        let officialDifferent = ScoringQueueGross(
            teamOne: [6, 6],
            teamTwo: [5, 6]
        )
        let harness = makeHarness(records: [record])
        harness.api.configureCanonical(
            for: record.partition,
            matchRevision: 15,
            scores: [CoordinatorQueueFixtures.score(
                holeNumber: record.intent.holeNumber,
                revision: 2,
                gross: officialDifferent
            )]
        )

        await harness.coordinator.activate(identity: CoordinatorQueueFixtures.identity)

        let reviewPersisted = await eventually {
            await harness.repository.record(id: record.localQueueRecordId)?.state == .conflict
        }
        XCTAssertTrue(reviewPersisted)
        let persistedValue = await harness.repository.record(id: record.localQueueRecordId)
        let persisted = try XCTUnwrap(persistedValue)
        XCTAssertEqual(persisted.stateReasonCode, .revision)
        XCTAssertEqual(persisted.conflict?.officialGross, officialDifferent)
        XCTAssertEqual(persisted.acknowledgement, acknowledgement)
        XCTAssertTrue(persisted.isUnresolved)
        XCTAssertEqual(
            harness.coordinator.reliabilityStatus(matchId: record.partition.matchId),
            .needsReview
        )
        XCTAssertTrue(harness.api.holeRequests.isEmpty)
    }

    func testAcceptedConflictCanonicalEquivalentResolvesWithoutReplayAndClearsReviewProof() async throws {
        let reviewedOfficial = ScoringQueueGross(teamOne: [6, 6], teamTwo: [5, 6])
        let record = acceptedConflictRecord(
            matchId: "accepted-equivalent",
            officialGross: reviewedOfficial
        )
        let harness = makeHarness(records: [record])
        harness.clock.advance(1)
        harness.api.configureCanonical(
            for: record.partition,
            matchRevision: 16,
            permissionRevision: 5,
            scores: [CoordinatorQueueFixtures.score(
                holeNumber: record.intent.holeNumber,
                revision: 3,
                gross: record.intent.gross
            )]
        )

        await harness.coordinator.activate(identity: CoordinatorQueueFixtures.identity)

        let resolved = await eventually {
            await harness.repository.record(id: record.localQueueRecordId)?.state == .resolved
        }
        XCTAssertTrue(resolved)
        let persistedValue = await harness.repository.record(id: record.localQueueRecordId)
        let persisted = try XCTUnwrap(persistedValue)
        XCTAssertEqual(persisted.resolution?.reason, .officialEquivalent)
        XCTAssertNil(persisted.acknowledgement)
        XCTAssertNil(persisted.conflict)
        XCTAssertTrue(ScoringQueueValidator.validate(persisted).isValid)
        XCTAssertTrue(harness.api.holeRequests.isEmpty)
        XCTAssertFalse(harness.coordinator.state.lastPersistenceFailure)
    }

    func testAcceptedConflictFinalizedWithDifferentOfficialRemainsReviewOnly() async throws {
        let official = ScoringQueueGross(teamOne: [6, 6], teamTwo: [5, 6])
        let record = acceptedConflictRecord(
            matchId: "accepted-final",
            officialGross: official
        )
        let harness = makeHarness(records: [record])
        harness.clock.advance(1)
        harness.api.configureCanonical(
            for: record.partition,
            matchRevision: 16,
            permissionRevision: 5,
            scores: [CoordinatorQueueFixtures.score(
                holeNumber: record.intent.holeNumber,
                revision: 3,
                gross: official
            )],
            status: .completed,
            canScore: false,
            readOnly: true
        )

        await harness.coordinator.activate(identity: CoordinatorQueueFixtures.identity)

        let persistedValue = await harness.repository.record(id: record.localQueueRecordId)
        let persisted = try XCTUnwrap(persistedValue)
        XCTAssertEqual(persisted.state, .conflict)
        XCTAssertEqual(persisted.stateReasonCode, .revision)
        XCTAssertEqual(persisted.acknowledgement, record.acknowledgement)
        XCTAssertEqual(persisted.conflict?.officialGross, official)
        XCTAssertTrue(persisted.hasAcceptedAcknowledgementProof)
        XCTAssertTrue(ScoringQueueValidator.validate(persisted).isValid)
        XCTAssertTrue(harness.api.holeRequests.isEmpty)
        XCTAssertFalse(harness.coordinator.state.lastPersistenceFailure)
    }

    func testAcceptedConflictPermissionRemovalPreservesProofAcrossForegroundAndCannotAutoRebase() async throws {
        struct Blocker {
            let name: String
            let canScore: Bool
            let readOnly: Bool
            let reason: ScoringQueueStateReasonCode
        }
        let blockers: [Blocker] = [
            .init(name: "read-only", canScore: false, readOnly: true, reason: .readOnly),
            .init(name: "authorization", canScore: false, readOnly: false, reason: .authorization),
        ]
        let official = ScoringQueueGross(teamOne: [6, 6], teamTwo: [5, 6])

        for (index, blocker) in blockers.enumerated() {
            let record = acceptedConflictRecord(
                matchId: "accepted-permission-\(blocker.name)",
                officialGross: official,
                sequence: Int64(index + 1)
            )
            let harness = makeHarness(records: [record])
            harness.clock.advance(1)
            harness.api.configureCanonical(
                for: record.partition,
                matchRevision: 16,
                permissionRevision: 6,
                scores: [CoordinatorQueueFixtures.score(
                    holeNumber: record.intent.holeNumber,
                    revision: 3,
                    gross: official
                )],
                status: .inProgress,
                canScore: blocker.canScore,
                readOnly: blocker.readOnly
            )

            await harness.coordinator.activate(identity: CoordinatorQueueFixtures.identity)

            var persistedValue = await harness.repository.record(id: record.localQueueRecordId)
            var persisted = try XCTUnwrap(persistedValue)
            XCTAssertEqual(persisted.state, .actionRequired, blocker.name)
            XCTAssertEqual(persisted.stateReasonCode, blocker.reason, blocker.name)
            XCTAssertEqual(persisted.acknowledgement, record.acknowledgement, blocker.name)
            XCTAssertTrue(persisted.hasAcceptedAcknowledgementProof, blocker.name)
            XCTAssertTrue(ScoringQueueValidator.validate(persisted).isValid, blocker.name)

            // Repeating foreground canonical reconciliation under the same
            // blocker must be a safe no-op rather than a failed same-state CAS.
            await harness.coordinator.refreshForForeground()
            persistedValue = await harness.repository.record(id: record.localQueueRecordId)
            persisted = try XCTUnwrap(persistedValue)
            XCTAssertEqual(persisted.state, .actionRequired, blocker.name)
            XCTAssertTrue(persisted.hasAcceptedAcknowledgementProof, blocker.name)
            XCTAssertFalse(harness.coordinator.state.lastPersistenceFailure, blocker.name)

            // Once writable again, an apparently blank target still cannot
            // auto-rebase an already accepted mutation ID back into replay.
            harness.clock.advance(1)
            harness.api.configureCanonical(
                for: record.partition,
                matchRevision: 17,
                permissionRevision: 7,
                scores: [],
                status: .inProgress,
                canScore: true,
                readOnly: false
            )
            await harness.coordinator.refreshForForeground()

            persistedValue = await harness.repository.record(id: record.localQueueRecordId)
            persisted = try XCTUnwrap(persistedValue)
            XCTAssertEqual(persisted.state, .conflict, blocker.name)
            XCTAssertEqual(persisted.base.automaticRebaseCount, 0, blocker.name)
            XCTAssertTrue(persisted.hasAcceptedAcknowledgementProof, blocker.name)
            XCTAssertFalse(persisted.conflict?.refreshRequired ?? true, blocker.name)
            XCTAssertTrue(harness.api.holeRequests.isEmpty, blocker.name)
            XCTAssertFalse(harness.coordinator.state.lastPersistenceFailure, blocker.name)
        }
    }

    func testAcceptedConflictSnapshotChangeRemainsActionRequiredUntilSafeForegroundReview() async throws {
        // The numeric gross arrays intentionally equal local intent. Snapshot
        // replacement still makes positional equivalence unsafe because those
        // slots may now identify different golfers.
        let official = ScoringQueueGross(teamOne: [4, 5], teamTwo: [5, 6])
        let record = acceptedConflictRecord(
            matchId: "accepted-snapshot-change",
            officialGross: official
        )
        let harness = makeHarness(records: [record])
        harness.clock.advance(1)
        harness.api.configureCanonical(
            for: record.partition,
            matchRevision: 16,
            permissionRevision: 6,
            scores: [CoordinatorQueueFixtures.score(
                holeNumber: record.intent.holeNumber,
                revision: 3,
                gross: official
            )],
            snapshotId: "replacement-snapshot",
            snapshotRevision: 2
        )

        await harness.coordinator.activate(identity: CoordinatorQueueFixtures.identity)
        await harness.coordinator.refreshForForeground()

        var persistedValue = await harness.repository.record(id: record.localQueueRecordId)
        var persisted = try XCTUnwrap(persistedValue)
        XCTAssertEqual(persisted.state, .actionRequired)
        XCTAssertEqual(persisted.stateReasonCode, .identityMismatch)
        XCTAssertTrue(persisted.hasAcceptedAcknowledgementProof)
        XCTAssertFalse(harness.coordinator.state.lastPersistenceFailure)

        harness.clock.advance(1)
        harness.api.configureCanonical(
            for: record.partition,
            matchRevision: 17,
            permissionRevision: 7,
            scores: [],
            status: .inProgress,
            canScore: true,
            readOnly: false
        )
        await harness.coordinator.refreshForForeground()

        persistedValue = await harness.repository.record(id: record.localQueueRecordId)
        persisted = try XCTUnwrap(persistedValue)
        XCTAssertEqual(persisted.state, .conflict)
        XCTAssertTrue(persisted.hasAcceptedAcknowledgementProof)
        XCTAssertEqual(persisted.base.automaticRebaseCount, 0)
        XCTAssertTrue(harness.api.holeRequests.isEmpty)
        XCTAssertFalse(harness.coordinator.state.lastPersistenceFailure)
    }

    func testRevisionConflictSnapshotChangeCannotResolveEqualGrossAsOfficialEquivalent() async throws {
        let record = CoordinatorQueueFixtures.record(matchId: "conflict-equal-replacement-snapshot")
        let harness = makeHarness(records: [record])
        let replacementCanonical = CoordinatorQueueFixtures.canonicalResponse(
            partition: record.partition,
            matchRevision: 14,
            permissionRevision: 5,
            scores: [CoordinatorQueueFixtures.score(
                holeNumber: record.intent.holeNumber,
                revision: 2,
                gross: record.intent.gross
            )],
            status: .inProgress,
            canScore: true,
            readOnly: false,
            snapshotId: "replacement-snapshot",
            snapshotRevision: 2
        )
        let conflictData = MobileErrorData(
            matchId: record.partition.matchId,
            currentMatchRevision: 14,
            currentHoleRevision: 2,
            currentPermissionRevision: 5,
            scoredHoles: 1,
            refreshRequired: true
        )
        harness.api.setOutcomes(
            [.replaceCanonicalThenFail(
                replacementCanonical,
                .rejected(
                    code: .revisionConflict,
                    status: 409,
                    data: conflictData,
                    retryAfter: nil
                )
            )],
            for: record.partition.matchId
        )

        await harness.coordinator.activate(identity: CoordinatorQueueFixtures.identity)

        let reviewRequired = await eventually {
            await harness.repository.record(id: record.localQueueRecordId)?.state == .actionRequired
        }
        XCTAssertTrue(reviewRequired)
        let persistedValue = await harness.repository.record(id: record.localQueueRecordId)
        let persisted = try XCTUnwrap(persistedValue)
        XCTAssertEqual(persisted.stateReasonCode, .identityMismatch)
        XCTAssertNil(persisted.resolution)
        XCTAssertEqual(persisted.base.automaticRebaseCount, 0)
        XCTAssertEqual(harness.api.holeRequests.count, 1)
        XCTAssertFalse(harness.coordinator.state.lastPersistenceFailure)
    }

    func testAcceptedConflictKeepOfficialClearsAcknowledgementIntoResolution() async throws {
        let official = ScoringQueueGross(teamOne: [6, 6], teamTwo: [5, 6])
        let record = acceptedConflictRecord(
            matchId: "accepted-keep-official",
            officialGross: official
        )
        let harness = makeHarness(records: [record], liveMutationSendingEnabled: false)
        harness.clock.advance(1)
        harness.api.configureCanonical(
            for: record.partition,
            matchRevision: 16,
            permissionRevision: 6,
            scores: [CoordinatorQueueFixtures.score(
                holeNumber: record.intent.holeNumber,
                revision: 3,
                gross: official
            )]
        )
        await harness.coordinator.activate(identity: CoordinatorQueueFixtures.identity)

        try await harness.coordinator.keepOfficial(recordId: record.localQueueRecordId)

        let persistedValue = await harness.repository.record(id: record.localQueueRecordId)
        let persisted = try XCTUnwrap(persistedValue)
        XCTAssertEqual(persisted.state, .resolved)
        XCTAssertEqual(persisted.resolution?.reason, .keptOfficial)
        XCTAssertNil(persisted.acknowledgement)
        XCTAssertNil(persisted.conflict)
        XCTAssertTrue(ScoringQueueValidator.validate(persisted).isValid)
        XCTAssertTrue(harness.api.holeRequests.isEmpty)
    }

    func testAcceptedConflictReapplyClearsOriginalProofAndUsesNewMutationID() async throws {
        let official = ScoringQueueGross(teamOne: [6, 6], teamTwo: [5, 6])
        let record = acceptedConflictRecord(
            matchId: "accepted-reapply",
            officialGross: official
        )
        let harness = makeHarness(records: [record], liveMutationSendingEnabled: false)
        harness.clock.advance(1)
        harness.api.configureCanonical(
            for: record.partition,
            matchRevision: 16,
            permissionRevision: 6,
            scores: [CoordinatorQueueFixtures.score(
                holeNumber: record.intent.holeNumber,
                revision: 3,
                gross: official
            )]
        )
        await harness.coordinator.activate(identity: CoordinatorQueueFixtures.identity)

        let result = try await harness.coordinator.reapplyMyScore(
            recordId: record.localQueueRecordId,
            originatingAppBuild: "step-2g-tests"
        )

        XCTAssertEqual(result.resolvedConflict.state, .resolved)
        XCTAssertEqual(result.resolvedConflict.resolution?.reason, .reappliedAsNewMutation)
        XCTAssertNil(result.resolvedConflict.acknowledgement)
        XCTAssertNil(result.resolvedConflict.conflict)
        XCTAssertNotEqual(result.replacement.mutationId, record.mutationId)
        XCTAssertEqual(result.replacement.intent, record.intent)
        XCTAssertEqual(result.replacement.state, .queued)
        XCTAssertTrue(ScoringQueueValidator.validate(result.resolvedConflict).isValid)
        XCTAssertTrue(ScoringQueueValidator.validate(result.replacement).isValid)
        XCTAssertTrue(harness.api.holeRequests.isEmpty)
    }

    func testUnknownOutcomeRetainsSameIDRecoveryAfterMatchBecomesFinal() async throws {
        var attempt = ScoringQueueAttempt.unattempted
        attempt.count = 1
        attempt.lastAttemptAt = CoordinatorQueueFixtures.now.addingTimeInterval(-10)
        attempt.nextRetryAt = CoordinatorQueueFixtures.now
        attempt.everSubmitted = true
        attempt.outcomeCertainty = .unknown
        let record = CoordinatorQueueFixtures.record(
            matchId: "match-unknown-final",
            state: .retryable,
            reason: .unknownOutcome,
            attempt: attempt
        )
        let officialDifferent = ScoringQueueGross(
            teamOne: [6, 6],
            teamTwo: [5, 6]
        )
        let harness = makeHarness(records: [record])
        harness.api.configureCanonical(
            for: record.partition,
            matchRevision: 14,
            scores: [CoordinatorQueueFixtures.score(
                holeNumber: record.intent.holeNumber,
                revision: 2,
                gross: officialDifferent
            )],
            status: .completed,
            canScore: false,
            readOnly: true
        )

        await harness.coordinator.activate(identity: CoordinatorQueueFixtures.identity)

        let sameIDRecoveryAttempted = await eventually {
            harness.api.holeRequests.count == 1
        }
        XCTAssertTrue(sameIDRecoveryAttempted)
        XCTAssertEqual(harness.api.holeRequests.first?.mutationId, record.mutationId)
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

    func testDirectParticipantNotFoundRejectionInvalidatesAccessExactlyOnce() async throws {
        let record = CoordinatorQueueFixtures.record(matchId: "participant-rejection")
        let harness = makeHarness(records: [record])
        var invalidationCount = 0
        harness.coordinator.setAccessInvalidationHandler { invalidationCount += 1 }
        harness.api.setOutcomes(
            [.fail(.rejected(
                code: .participantNotFound,
                status: 404,
                data: nil,
                retryAfter: nil
            ))],
            for: record.partition.matchId
        )

        await harness.coordinator.activate(identity: CoordinatorQueueFixtures.identity)

        let invalidated = await eventually {
            let persisted = await harness.repository.record(id: record.localQueueRecordId)
            return persisted?.state == .actionRequired && invalidationCount == 1
        }
        XCTAssertTrue(invalidated)
        let persistedValue = await harness.repository.record(id: record.localQueueRecordId)
        let persisted = try XCTUnwrap(persistedValue)
        XCTAssertEqual(persisted.stateReasonCode, .identity)
        XCTAssertEqual(persisted.attempt.lastErrorCode, MobileErrorCode.participantNotFound.rawValue)
        XCTAssertEqual(persisted.attempt.lastHttpStatus, 404)
        XCTAssertEqual(harness.api.holeRequests.count, 1)
        XCTAssertEqual(invalidationCount, 1)
    }

    func testKnownRejectionPersistenceFailureStopsReplayAndKeepsReliabilityFailedClosed() async throws {
        let record = CoordinatorQueueFixtures.record(matchId: "rejection-persistence-failure")
        let harness = makeHarness(records: [record])
        var invalidationCount = 0
        harness.coordinator.setAccessInvalidationHandler { invalidationCount += 1 }
        await harness.repository.failNextReplacement(to: .actionRequired)
        harness.api.setOutcomes(
            [.fail(.rejected(
                code: .participantNotFound,
                status: 404,
                data: nil,
                retryAfter: nil
            ))],
            for: record.partition.matchId
        )

        await harness.coordinator.activate(identity: CoordinatorQueueFixtures.identity)

        let failedClosed = await eventually {
            harness.coordinator.state.lastPersistenceFailure &&
                harness.api.holeRequests.count == 1 &&
                invalidationCount == 1
        }
        XCTAssertTrue(failedClosed)
        let persisted = await harness.repository.record(id: record.localQueueRecordId)
        XCTAssertEqual(persisted?.state, .syncing)
        XCTAssertEqual(persisted?.attempt.outcomeCertainty, .unknown)

        await harness.coordinator.refreshForForeground()
        try await Task.sleep(nanoseconds: 30_000_000)

        XCTAssertTrue(harness.coordinator.state.lastPersistenceFailure)
        XCTAssertEqual(harness.api.holeRequests.count, 1)
        XCTAssertEqual(invalidationCount, 1)
        XCTAssertEqual(
            harness.coordinator.reliabilityStatus(matchId: record.partition.matchId),
            .needsReview
        )
    }

    func testAuthorityLifecycleRejectionWithFailedRefreshBlocksNewIntentAcrossMatch() async throws {
        let cases: [(MobileErrorCode, Int, ScoringQueueStateReasonCode)] = [
            (.scoringNotAuthorized, 403, .authorization),
            (.scoringReadOnly, 409, .readOnly),
            (.matchAlreadyFinalized, 409, .finalized),
        ]

        for (index, rejection) in cases.enumerated() {
            let record = CoordinatorQueueFixtures.record(
                matchId: "rejection-admission-\(index)",
                holeNumber: 1
            )
            let harness = makeHarness(records: [record])
            harness.api.setCurrentOutcomes(
                [.canonical, .fail(.transportUnavailable)],
                for: record.partition.matchId
            )
            harness.api.setOutcomes(
                [.fail(.rejected(
                    code: rejection.0,
                    status: rejection.1,
                    data: nil,
                    retryAfter: nil
                ))],
                for: record.partition.matchId
            )

            await harness.coordinator.activate(identity: CoordinatorQueueFixtures.identity)

            let rejectionPersisted = await eventually {
                let persisted = await harness.repository.record(id: record.localQueueRecordId)
                return persisted?.state == .actionRequired &&
                    persisted?.stateReasonCode == rejection.2 &&
                    harness.api.scoringCurrentMatchIDs.count == 2
            }
            XCTAssertTrue(rejectionPersisted, rejection.0.rawValue)

            do {
                _ = try await harness.coordinator.save(
                    CoordinatorQueueFixtures.input(
                        partition: record.partition,
                        holeNumber: 2
                    )
                )
                XCTFail("\(rejection.0.rawValue) must block a different-hole Save")
            } catch {
                XCTAssertEqual(
                    error as? ScoringQueueCoordinatorError,
                    .matchRequiresReview,
                    rejection.0.rawValue
                )
            }

            let snapshot = await harness.repository.snapshot()
            XCTAssertEqual(snapshot.count, 1, rejection.0.rawValue)
            XCTAssertEqual(snapshot.first?.localQueueRecordId, record.localQueueRecordId)
            XCTAssertEqual(snapshot.first?.mutationId, record.mutationId)
            XCTAssertEqual(snapshot.first?.state, .actionRequired)
            XCTAssertEqual(snapshot.first?.stateReasonCode, rejection.2)
            let saveCalls = await harness.repository.saveCalls
            XCTAssertEqual(saveCalls, 0)
            XCTAssertEqual(harness.api.holeRequests.count, 1)
            XCTAssertFalse(harness.coordinator.state.lastPersistenceFailure)
        }
    }

    func testSecondUnauthorizedAfterForcedRefreshBecomesAuthenticationActionRequired() async throws {
        for (index, code) in [MobileErrorCode.unauthorized, .invalidToken].enumerated() {
            let record = CoordinatorQueueFixtures.record(
                matchId: "match-auth-fail-\(index)",
                sequence: Int64(index + 1)
            )
            let harness = makeHarness(records: [record])
            var invalidated = false
            harness.coordinator.setAccessInvalidationHandler { invalidated = true }
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
            XCTAssertTrue(invalidated)
        }
    }

    func testMatchAlreadyFinalizedReconcilesEquivalentIntentAndPreservesDifferingIntentForReview() async throws {
        let differingGross = ScoringQueueGross(
            teamOne: [6, 6],
            teamTwo: [5, 6]
        )
        let cases: [(String, ScoringQueueGross, ScoringQueueState, ScoringQueueStateReasonCode?)] = [
            ("equivalent", ScoringQueueGross(teamOne: [4, 5], teamTwo: [5, 6]), .resolved, nil),
            ("differing", differingGross, .conflict, .revision),
        ]

        for (index, expectation) in cases.enumerated() {
            let record = CoordinatorQueueFixtures.record(
                matchId: "already-finalized-\(expectation.0)",
                sequence: Int64(index + 1)
            )
            let harness = makeHarness(records: [record])
            let finalCanonical = CoordinatorQueueFixtures.canonicalResponse(
                partition: record.partition,
                matchRevision: 13,
                permissionRevision: 5,
                scores: [CoordinatorQueueFixtures.score(
                    holeNumber: record.intent.holeNumber,
                    revision: 1,
                    gross: expectation.1
                )],
                status: .completed,
                canScore: false,
                readOnly: true
            )
            harness.api.setOutcomes(
                [.replaceCanonicalThenFail(
                    finalCanonical,
                    .rejected(
                        code: .matchAlreadyFinalized,
                        status: 409,
                        data: nil,
                        retryAfter: nil
                    )
                )],
                for: record.partition.matchId
            )

            await harness.coordinator.activate(identity: CoordinatorQueueFixtures.identity)

            let reconciled = await eventually {
                let persisted = await harness.repository.record(id: record.localQueueRecordId)
                return persisted?.state == expectation.2 &&
                    persisted?.stateReasonCode == expectation.3 &&
                    (expectation.0 != "differing" ||
                        persisted?.conflict?.officialGross == differingGross) &&
                    harness.api.scoringCurrentMatchIDs.count == 2
            }
            XCTAssertTrue(reconciled, expectation.0)
            let persistedValue = await harness.repository.record(id: record.localQueueRecordId)
            let persisted = try XCTUnwrap(persistedValue)
            XCTAssertEqual(persisted.state, expectation.2)
            XCTAssertEqual(persisted.stateReasonCode, expectation.3)
            if expectation.2 == .resolved {
                XCTAssertEqual(persisted.resolution?.reason, .officialEquivalent)
            } else {
                XCTAssertNil(persisted.resolution)
                XCTAssertEqual(persisted.conflict?.officialGross, differingGross)
                XCTAssertEqual(persisted.conflict?.refreshRequired, false)

                try await harness.coordinator.keepOfficial(
                    recordId: persisted.localQueueRecordId
                )
                let keptOfficial = await harness.repository.record(
                    id: persisted.localQueueRecordId
                )
                XCTAssertEqual(keptOfficial?.state, .resolved)
                XCTAssertEqual(keptOfficial?.resolution?.reason, .keptOfficial)
            }
            XCTAssertEqual(harness.api.holeRequests.count, 1)
            XCTAssertEqual(harness.api.holeRequests.first?.mutationId, record.mutationId)
        }

        let reapplyRecord = CoordinatorQueueFixtures.record(
            matchId: "already-finalized-reapply",
            sequence: 3
        )
        let reapplyHarness = makeHarness(
            records: [reapplyRecord],
            liveMutationSendingEnabled: true
        )
        let finalCanonical = CoordinatorQueueFixtures.canonicalResponse(
            partition: reapplyRecord.partition,
            matchRevision: 13,
            permissionRevision: 5,
            scores: [CoordinatorQueueFixtures.score(
                holeNumber: reapplyRecord.intent.holeNumber,
                revision: 1,
                gross: differingGross
            )],
            status: .completed,
            canScore: false,
            readOnly: true
        )
        reapplyHarness.api.setOutcomes(
            [.replaceCanonicalThenFail(
                finalCanonical,
                .rejected(
                    code: .matchAlreadyFinalized,
                    status: 409,
                    data: nil,
                    retryAfter: nil
                )
            )],
            for: reapplyRecord.partition.matchId
        )
        await reapplyHarness.coordinator.activate(identity: CoordinatorQueueFixtures.identity)
        let finalConflictReady = await eventually {
            let persisted = await reapplyHarness.repository.record(
                id: reapplyRecord.localQueueRecordId
            )
            return persisted?.state == .conflict &&
                persisted?.stateReasonCode == .revision &&
                persisted?.conflict?.officialGross == differingGross
        }
        XCTAssertTrue(finalConflictReady)

        do {
            _ = try await reapplyHarness.coordinator.reapplyMyScore(
                recordId: reapplyRecord.localQueueRecordId,
                originatingAppBuild: "step-2g-tests"
            )
            XCTFail("A finalized Match must not permit Reapply My Score")
        } catch {
            XCTAssertEqual(error as? ScoringQueueCoordinatorError, .notReviewable)
        }
        let reapplyRejected = await reapplyHarness.repository.record(
            id: reapplyRecord.localQueueRecordId
        )
        XCTAssertEqual(reapplyRejected?.state, .actionRequired)
        XCTAssertEqual(reapplyRejected?.stateReasonCode, .finalized)
        let reapplySnapshot = await reapplyHarness.repository.snapshot()
        XCTAssertEqual(reapplySnapshot.count, 1)
        XCTAssertEqual(reapplySnapshot.first?.mutationId, reapplyRecord.mutationId)
        XCTAssertEqual(reapplyHarness.api.holeRequests.count, 1)
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
            let canonicalTargetIsBlank = record.partition == rebase.partition
            let data = MobileErrorData(
                matchId: record.partition.matchId,
                currentMatchRevision: 14,
                currentHoleRevision: canonicalTargetIsBlank ? 0 : 2,
                currentPermissionRevision: 4,
                scoredHoles: canonicalTargetIsBlank ? 0 : 1,
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

        let conflictsReconciled = await eventually(attempts: 5_000) {
            let snapshot = await harness.repository.snapshot()
            return snapshot.first(where: { $0.partition == equivalent.partition })?.state == .resolved &&
                snapshot.first(where: { $0.partition == differing.partition })?.state == .conflict &&
                snapshot.first(where: { $0.partition == differing.partition })?.conflict?.officialGross == officialDifferent &&
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

    func testRevisionConflictFinalizedElsewhereKeepsDifferingIntentReviewableUntilKeepOfficial() async throws {
        let record = CoordinatorQueueFixtures.record(matchId: "conflict-finalized-elsewhere")
        let harness = makeHarness(records: [record])
        let official = ScoringQueueGross(teamOne: [6, 6], teamTwo: [5, 6])
        let finalizedCanonical = CoordinatorQueueFixtures.canonicalResponse(
            partition: record.partition,
            matchRevision: 14,
            permissionRevision: 4,
            scores: [CoordinatorQueueFixtures.score(
                holeNumber: record.intent.holeNumber,
                revision: 2,
                gross: official
            )],
            status: .completed,
            canScore: false,
            readOnly: true
        )
        harness.api.setOutcomes(
            [.replaceCanonicalThenFail(
                finalizedCanonical,
                .rejected(
                    code: .revisionConflict,
                    status: 409,
                    data: MobileErrorData(
                        matchId: record.partition.matchId,
                        currentMatchRevision: 14,
                        currentHoleRevision: 2,
                        currentPermissionRevision: 4,
                        scoredHoles: 1,
                        refreshRequired: true
                    ),
                    retryAfter: nil
                )
            )],
            for: record.partition.matchId
        )

        await harness.coordinator.activate(identity: CoordinatorQueueFixtures.identity)

        let reviewable = await eventually {
            let persisted = await harness.repository.record(id: record.localQueueRecordId)
            return persisted?.state == .conflict &&
                persisted?.stateReasonCode == .revision &&
                persisted?.conflict?.officialGross == official &&
                persisted?.conflict?.refreshRequired == false
        }
        XCTAssertTrue(reviewable)

        try await harness.coordinator.keepOfficial(recordId: record.localQueueRecordId)
        let resolved = await harness.repository.record(id: record.localQueueRecordId)
        XCTAssertEqual(resolved?.state, .resolved)
        XCTAssertEqual(resolved?.resolution?.reason, .keptOfficial)
        XCTAssertEqual(harness.api.holeRequests.count, 1)
    }

    func testConflictRefreshRejectsEveryRevisionRegressionAgainstRetainedConflictEvidence() async throws {
        let official = ScoringQueueGross(teamOne: [6, 6], teamTwo: [5, 6])
        let expectations: [(
            name: String,
            matchRevision: Int,
            holeRevision: Int,
            permissionRevision: Int
        )] = [
            ("match", 14, 3, 6),
            ("hole", 15, 2, 6),
            ("permission", 15, 3, 5),
        ]

        for (index, expectation) in expectations.enumerated() {
            let conflict = ScoringQueueConflict(
                officialGross: official,
                currentMatchRevision: 15,
                currentHoleRevision: 3,
                currentPermissionRevision: 6,
                refreshRequired: true,
                recordedAt: CoordinatorQueueFixtures.now
            )
            var record = CoordinatorQueueFixtures.record(
                matchId: "conflict-refresh-regressed-\(expectation.name)",
                sequence: Int64(index + 1),
                state: .conflict,
                reason: .revision,
                conflict: conflict
            )
            record.lastKnownServer = ScoringQueueLastKnownServer(
                matchRevision: 14,
                holeRevision: 2,
                permissionRevision: 5,
                refreshedAt: CoordinatorQueueFixtures.now.addingTimeInterval(-1)
            )
            let harness = makeHarness(records: [record], jitter: { 0 })
            harness.api.configureCanonical(
                for: record.partition,
                matchRevision: expectation.matchRevision,
                permissionRevision: expectation.permissionRevision,
                scores: [CoordinatorQueueFixtures.score(
                    holeNumber: record.intent.holeNumber,
                    revision: expectation.holeRevision,
                    gross: official
                )]
            )

            await harness.coordinator.activate(identity: CoordinatorQueueFixtures.identity)

            let retryScheduled = await eventually {
                (await harness.repository.record(id: record.localQueueRecordId))?
                    .attempt.nextRetryAt != nil
            }
            XCTAssertTrue(retryScheduled, expectation.name)
            let persisted = await harness.repository.record(id: record.localQueueRecordId)
            XCTAssertEqual(persisted?.state, .conflict, expectation.name)
            XCTAssertEqual(persisted?.stateReasonCode, .revision, expectation.name)
            XCTAssertEqual(persisted?.conflict, record.conflict, expectation.name)
            XCTAssertEqual(
                persisted?.lastKnownServer,
                record.lastKnownServer,
                expectation.name
            )
            XCTAssertTrue(harness.api.holeRequests.isEmpty, expectation.name)
        }
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

    func testAgedAcceptedAcknowledgementRemainsRefreshOnlyAtSevenDays() async throws {
        let acknowledgement = ScoringQueueAcknowledgement(
            accepted: true,
            idempotent: true,
            semanticNoop: false,
            canonicalMatchRevision: 13,
            canonicalHoleRevision: 1,
            responseAt: CoordinatorQueueFixtures.now.addingTimeInterval(-8 * 24 * 60 * 60),
            refreshPending: true
        )
        let record = CoordinatorQueueFixtures.record(
            matchId: "aged-accepted-refresh",
            state: .acknowledged,
            createdAt: CoordinatorQueueFixtures.now.addingTimeInterval(-8 * 24 * 60 * 60),
            attempt: acceptedAttempt(),
            acknowledgement: acknowledgement
        )
        let harness = makeHarness(records: [record])
        harness.api.configureCanonical(
            for: record.partition,
            matchRevision: 13,
            scores: [CoordinatorQueueFixtures.score(
                holeNumber: record.intent.holeNumber,
                revision: 1,
                gross: record.intent.gross
            )]
        )

        await harness.coordinator.activate(identity: CoordinatorQueueFixtures.identity)

        let refreshed = await eventually {
            let persisted = await harness.repository.record(id: record.localQueueRecordId)
            return persisted?.acknowledgement?.refreshPending == false
        }
        XCTAssertTrue(refreshed)
        XCTAssertTrue(harness.api.holeRequests.isEmpty)
        XCTAssertTrue(harness.api.scoringCurrentMatchIDs.contains(record.partition.matchId))
    }

    func testAgedAcceptedConflictPreservesAcknowledgementAndReviewState() async throws {
        let acknowledgement = ScoringQueueAcknowledgement(
            accepted: true,
            idempotent: false,
            semanticNoop: false,
            canonicalMatchRevision: 13,
            canonicalHoleRevision: 1,
            responseAt: CoordinatorQueueFixtures.now.addingTimeInterval(-8 * 24 * 60 * 60),
            refreshPending: true
        )
        let conflict = ScoringQueueConflict(
            officialGross: ScoringQueueGross(teamOne: [6, 6], teamTwo: [5, 6]),
            currentMatchRevision: 15,
            currentHoleRevision: 2,
            currentPermissionRevision: 4,
            refreshRequired: false,
            recordedAt: CoordinatorQueueFixtures.now.addingTimeInterval(-8 * 24 * 60 * 60)
        )
        let record = CoordinatorQueueFixtures.record(
            matchId: "aged-accepted-conflict",
            state: .conflict,
            reason: .revision,
            createdAt: CoordinatorQueueFixtures.now.addingTimeInterval(-8 * 24 * 60 * 60),
            attempt: acceptedAttempt(),
            acknowledgement: acknowledgement,
            conflict: conflict
        )
        let harness = makeHarness(records: [record])

        await harness.coordinator.activate(identity: CoordinatorQueueFixtures.identity)

        let stored = await harness.repository.record(id: record.localQueueRecordId)
        let persisted = try XCTUnwrap(stored)
        XCTAssertEqual(persisted.state, .conflict)
        XCTAssertEqual(persisted.acknowledgement, acknowledgement)
        XCTAssertEqual(persisted.conflict, conflict)
        XCTAssertTrue(persisted.isUnresolved)
        XCTAssertTrue(harness.api.holeRequests.isEmpty)
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

    func testKeepOfficialRejectsEveryRevisionRegressionAgainstLastKnownEvidence() async throws {
        let official = ScoringQueueGross(teamOne: [6, 6], teamTwo: [5, 6])
        let expectations: [(
            name: String,
            matchRevision: Int,
            holeRevision: Int,
            permissionRevision: Int
        )] = [
            ("match", 15, 4, 7),
            ("hole", 16, 3, 7),
            ("permission", 16, 4, 6),
        ]

        for (index, expectation) in expectations.enumerated() {
            let conflict = ScoringQueueConflict(
                officialGross: official,
                currentMatchRevision: 15,
                currentHoleRevision: 3,
                currentPermissionRevision: 6,
                refreshRequired: false,
                recordedAt: CoordinatorQueueFixtures.now
            )
            var record = CoordinatorQueueFixtures.record(
                matchId: "keep-official-regressed-\(expectation.name)",
                sequence: Int64(index + 1),
                state: .conflict,
                reason: .revision,
                conflict: conflict
            )
            record.lastKnownServer = ScoringQueueLastKnownServer(
                matchRevision: 16,
                holeRevision: 4,
                permissionRevision: 7,
                refreshedAt: CoordinatorQueueFixtures.now
            )
            let harness = makeHarness(
                records: [record],
                liveMutationSendingEnabled: false
            )
            harness.api.configureCanonical(
                for: record.partition,
                matchRevision: expectation.matchRevision,
                permissionRevision: expectation.permissionRevision,
                scores: [CoordinatorQueueFixtures.score(
                    holeNumber: record.intent.holeNumber,
                    revision: expectation.holeRevision,
                    gross: official
                )]
            )
            await harness.coordinator.activate(identity: CoordinatorQueueFixtures.identity)

            do {
                try await harness.coordinator.keepOfficial(
                    recordId: record.localQueueRecordId
                )
                XCTFail("Regressed \(expectation.name) revision must not resolve Keep Official")
            } catch {
                XCTAssertEqual(
                    error as? ScoringQueueCoordinatorError,
                    .canonicalRefreshFailed,
                    expectation.name
                )
            }

            let persisted = await harness.repository.record(id: record.localQueueRecordId)
            XCTAssertEqual(persisted, record, expectation.name)
            XCTAssertTrue(harness.api.holeRequests.isEmpty, expectation.name)
        }
    }

    func testReapplyMyScoreUsesFreshCanonicalEvidenceAndCreatesNewMutationID() async throws {
        let officialGross = ScoringQueueGross(teamOne: [6, 6], teamTwo: [5, 6])
        let conflict = ScoringQueueConflict(
            officialGross: officialGross,
            currentMatchRevision: 14,
            currentHoleRevision: 2,
            currentPermissionRevision: 5,
            refreshRequired: false,
            recordedAt: CoordinatorQueueFixtures.now.addingTimeInterval(-1)
        )
        let original = CoordinatorQueueFixtures.record(
            matchId: "reapply-fresh-canonical",
            sequence: 1,
            state: .conflict,
            reason: .revision,
            conflict: conflict
        )
        let harness = makeHarness(
            records: [original],
            liveMutationSendingEnabled: false
        )
        harness.api.configureCanonical(
            for: original.partition,
            matchRevision: 15,
            permissionRevision: 6,
            scores: [CoordinatorQueueFixtures.score(
                holeNumber: original.intent.holeNumber,
                revision: 3,
                gross: officialGross
            )],
            status: .inProgress,
            canScore: true,
            readOnly: false
        )
        await harness.coordinator.activate(identity: CoordinatorQueueFixtures.identity)

        let result = try await harness.coordinator.reapplyMyScore(
            recordId: original.localQueueRecordId,
            originatingAppBuild: "step-2g-tests"
        )

        XCTAssertEqual(result.resolvedConflict.state, .resolved)
        XCTAssertEqual(result.resolvedConflict.resolution?.reason, .reappliedAsNewMutation)
        XCTAssertEqual(
            result.resolvedConflict.resolution?.relatedLocalQueueRecordId,
            result.replacement.localQueueRecordId
        )
        XCTAssertNotEqual(result.replacement.mutationId, original.mutationId)
        XCTAssertEqual(result.replacement.state, .queued)
        XCTAssertEqual(result.replacement.intent, original.intent)
        XCTAssertEqual(result.replacement.base.expectedMatchRevision, 15)
        XCTAssertEqual(result.replacement.base.expectedHoleRevision, 3)
        XCTAssertEqual(result.replacement.base.officialGrossAtSave, officialGross)
        XCTAssertEqual(result.replacement.lastKnownServer.permissionRevision, 6)
        XCTAssertTrue(harness.api.holeRequests.isEmpty)
    }

    func testReapplyMyScoreFailsClosedWhenCanonicalAuthorityLifecycleOrSnapshotChanged() async throws {
        struct Transition {
            let name: String
            let status: MobileMatchStatus
            let canScore: Bool
            let readOnly: Bool
            let snapshotId: String?
            let snapshotRevision: Int
            let expectedReason: ScoringQueueStateReasonCode
        }
        let transitions: [Transition] = [
            .init(
                name: "final",
                status: .completed,
                canScore: false,
                readOnly: true,
                snapshotId: nil,
                snapshotRevision: 1,
                expectedReason: .finalized
            ),
            .init(
                name: "read-only",
                status: .inProgress,
                canScore: false,
                readOnly: true,
                snapshotId: nil,
                snapshotRevision: 1,
                expectedReason: .readOnly
            ),
            .init(
                name: "authorization",
                status: .inProgress,
                canScore: false,
                readOnly: false,
                snapshotId: nil,
                snapshotRevision: 1,
                expectedReason: .authorization
            ),
            .init(
                name: "snapshot",
                status: .inProgress,
                canScore: true,
                readOnly: false,
                snapshotId: "replacement-snapshot",
                snapshotRevision: 2,
                expectedReason: .identityMismatch
            ),
        ]
        let reviewedOfficial = ScoringQueueGross(teamOne: [6, 6], teamTwo: [5, 6])

        for (index, transition) in transitions.enumerated() {
            let conflict = ScoringQueueConflict(
                officialGross: reviewedOfficial,
                currentMatchRevision: 14,
                currentHoleRevision: 2,
                currentPermissionRevision: 5,
                refreshRequired: false,
                recordedAt: CoordinatorQueueFixtures.now.addingTimeInterval(-1)
            )
            let original = CoordinatorQueueFixtures.record(
                matchId: "reapply-transition-\(transition.name)",
                sequence: Int64(index + 1),
                state: .conflict,
                reason: .revision,
                conflict: conflict
            )
            let harness = makeHarness(
                records: [original],
                liveMutationSendingEnabled: false
            )
            harness.api.configureCanonical(
                for: original.partition,
                matchRevision: 14,
                permissionRevision: 5,
                scores: [CoordinatorQueueFixtures.score(
                    holeNumber: original.intent.holeNumber,
                    revision: 2,
                    gross: reviewedOfficial
                )],
                status: .inProgress,
                canScore: true,
                readOnly: false
            )
            await harness.coordinator.activate(identity: CoordinatorQueueFixtures.identity)
            let activatedRecord = await harness.repository.record(
                id: original.localQueueRecordId
            )
            XCTAssertEqual(activatedRecord?.state, .conflict, transition.name)

            harness.api.configureCanonical(
                for: original.partition,
                matchRevision: 15,
                permissionRevision: 6,
                scores: [CoordinatorQueueFixtures.score(
                    holeNumber: original.intent.holeNumber,
                    revision: 3,
                    gross: reviewedOfficial
                )],
                status: transition.status,
                canScore: transition.canScore,
                readOnly: transition.readOnly,
                snapshotId: transition.snapshotId,
                snapshotRevision: transition.snapshotRevision
            )

            do {
                _ = try await harness.coordinator.reapplyMyScore(
                    recordId: original.localQueueRecordId,
                    originatingAppBuild: "step-2g-tests"
                )
                XCTFail("\(transition.name) must require a new review decision")
            } catch {
                XCTAssertEqual(
                    error as? ScoringQueueCoordinatorError,
                    .notReviewable,
                    transition.name
                )
            }

            let persistedValue = await harness.repository.record(id: original.localQueueRecordId)
            let persisted = try XCTUnwrap(persistedValue)
            XCTAssertEqual(persisted.state, .actionRequired, transition.name)
            XCTAssertEqual(persisted.stateReasonCode, transition.expectedReason, transition.name)
            XCTAssertEqual(persisted.mutationId, original.mutationId, transition.name)
            let snapshot = await harness.repository.snapshot()
            XCTAssertEqual(snapshot.count, 1, transition.name)
            XCTAssertTrue(harness.api.holeRequests.isEmpty)
        }
    }

    func testChangedConflictEvidenceRequiresFreshExplicitReapplyChoice() async throws {
        let previouslyReviewed = ScoringQueueGross(teamOne: [6, 6], teamTwo: [5, 6])
        let newlyOfficial = ScoringQueueGross(teamOne: [7, 6], teamTwo: [5, 6])
        let conflict = ScoringQueueConflict(
            officialGross: previouslyReviewed,
            currentMatchRevision: 14,
            currentHoleRevision: 2,
            currentPermissionRevision: 5,
            refreshRequired: false,
            recordedAt: CoordinatorQueueFixtures.now.addingTimeInterval(-1)
        )
        let original = CoordinatorQueueFixtures.record(
            matchId: "reapply-official-changed",
            state: .conflict,
            reason: .revision,
            conflict: conflict
        )
        let harness = makeHarness(
            records: [original],
            liveMutationSendingEnabled: false
        )
        harness.api.configureCanonical(
            for: original.partition,
            matchRevision: 14,
            permissionRevision: 5,
            scores: [CoordinatorQueueFixtures.score(
                holeNumber: original.intent.holeNumber,
                revision: 2,
                gross: previouslyReviewed
            )]
        )
        await harness.coordinator.activate(identity: CoordinatorQueueFixtures.identity)

        harness.api.configureCanonical(
            for: original.partition,
            matchRevision: 15,
            permissionRevision: 6,
            scores: [CoordinatorQueueFixtures.score(
                holeNumber: original.intent.holeNumber,
                revision: 3,
                gross: newlyOfficial
            )]
        )
        do {
            _ = try await harness.coordinator.reapplyMyScore(
                recordId: original.localQueueRecordId,
                originatingAppBuild: "step-2g-tests"
            )
            XCTFail("Changed official evidence must require a fresh explicit choice")
        } catch {
            XCTAssertEqual(error as? ScoringQueueCoordinatorError, .notReviewable)
        }

        let refreshedReviewValue = await harness.repository.record(
            id: original.localQueueRecordId
        )
        let refreshedReview = try XCTUnwrap(refreshedReviewValue)
        XCTAssertEqual(refreshedReview.state, .conflict)
        XCTAssertEqual(refreshedReview.conflict?.officialGross, newlyOfficial)
        XCTAssertEqual(refreshedReview.conflict?.currentMatchRevision, 15)
        XCTAssertEqual(refreshedReview.conflict?.currentHoleRevision, 3)
        XCTAssertEqual(refreshedReview.mutationId, original.mutationId)
        let snapshotAfterRefresh = await harness.repository.snapshot()
        XCTAssertEqual(snapshotAfterRefresh.count, 1)
        XCTAssertEqual(harness.api.scoringCurrentMatchIDs.count, 2)
        XCTAssertTrue(harness.api.holeRequests.isEmpty)

        harness.clock.advance(1)
        let freshChoice = try await harness.coordinator.reapplyMyScore(
            recordId: original.localQueueRecordId,
            originatingAppBuild: "step-2g-tests"
        )

        XCTAssertEqual(freshChoice.resolvedConflict.state, .resolved)
        XCTAssertEqual(freshChoice.resolvedConflict.resolution?.reason, .reappliedAsNewMutation)
        XCTAssertEqual(freshChoice.replacement.intent, original.intent)
        XCTAssertNotEqual(freshChoice.replacement.mutationId, original.mutationId)
        XCTAssertEqual(freshChoice.replacement.base.officialGrossAtSave, newlyOfficial)
        let snapshotAfterReapply = await harness.repository.snapshot()
        XCTAssertEqual(snapshotAfterReapply.count, 2)
        XCTAssertEqual(harness.api.scoringCurrentMatchIDs.count, 3)
        XCTAssertTrue(harness.api.holeRequests.isEmpty)
    }

    func testUnknownV1ErrorCodeIsQuarantinedWithoutRetry() async throws {
        let record = CoordinatorQueueFixtures.record(matchId: "future-v1-error")
        let harness = makeHarness(records: [record], jitter: { 0 })
        harness.api.setOutcomes(
            [.fail(.rejected(code: nil, status: 429, data: nil, retryAfter: .delay(17)))],
            for: record.partition.matchId
        )

        await harness.coordinator.activate(identity: CoordinatorQueueFixtures.identity)

        let quarantined = await eventually {
            await harness.repository.record(id: record.localQueueRecordId)?.state == .quarantined
        }
        XCTAssertTrue(quarantined)
        let persisted = await harness.repository.record(id: record.localQueueRecordId)
        XCTAssertEqual(persisted?.stateReasonCode, .unknownPermanentResponse)
        XCTAssertEqual(persisted?.attempt.lastHttpStatus, 429)
        XCTAssertNil(persisted?.attempt.nextRetryAt)
        XCTAssertEqual(persisted?.quarantineReason, .unknownPermanentResponse)
        XCTAssertEqual(harness.api.holeRequests.count, 1)
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

    private func acceptedConflictRecord(
        matchId: String,
        officialGross: ScoringQueueGross,
        sequence: Int64 = 1
    ) -> ScoringQueueRecord {
        let acknowledgement = ScoringQueueAcknowledgement(
            accepted: true,
            idempotent: false,
            semanticNoop: false,
            canonicalMatchRevision: 13,
            canonicalHoleRevision: 1,
            responseAt: CoordinatorQueueFixtures.now,
            refreshPending: true
        )
        let conflict = ScoringQueueConflict(
            officialGross: officialGross,
            currentMatchRevision: 15,
            currentHoleRevision: 2,
            currentPermissionRevision: 5,
            refreshRequired: false,
            recordedAt: CoordinatorQueueFixtures.now
        )
        return CoordinatorQueueFixtures.record(
            matchId: matchId,
            sequence: sequence,
            state: .conflict,
            reason: .revision,
            createdAt: CoordinatorQueueFixtures.now.addingTimeInterval(-2),
            attempt: acceptedAttempt(),
            acknowledgement: acknowledgement,
            conflict: conflict
        )
    }

    private func makeHarness(
        records: [ScoringQueueRecord] = [],
        liveMutationSendingEnabled: Bool = true,
        maximumWorkers: Int = 2,
        applicationActivity: NativeApplicationActivity = NativeApplicationActivity(isActive: true),
        mutationAuthorization: (any ScoringHoleMutationAuthorizing)? = nil,
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
            applicationActivity: applicationActivity,
            mutationAuthorization: mutationAuthorization ?? (
                liveMutationSendingEnabled
                    ? TestScoringHoleMutationAuthorization()
                    : DisabledScoringHoleMutationAuthorization()
            ),
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
