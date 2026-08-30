import XCTest
@testable import BaggerInv

@MainActor
final class ScoringFinalizationCoordinatorTests: XCTestCase {
    func testInactiveActivationWithoutProbeReopensLocalSaveAfterTransientForegroundHealthFailure() async throws {
        let matchId = "finalize-cold-no-probe"
        let activity = NativeApplicationActivity(
            isActive: false,
            mutationTransportAuthorized: false
        )
        let repository = InMemoryScoringQueueRepository()
        let api = CoordinatorQueueAPI()
        let credentials = CoordinatorQueueCredentials()
        let queue = makeQueue(
            repository: repository,
            api: api,
            credentials: credentials,
            applicationActivity: activity
        )
        await queue.activate(identity: CoordinatorQueueFixtures.identity)
        let probes = InMemoryScoringFinalizationProbeStore()
        let finalization = ScoringFinalizationCoordinator(
            api: api,
            credentialProvider: credentials,
            queue: queue,
            probeStore: probes,
            applicationActivity: activity,
            liveMutationSendingEnabled: true,
            now: { CoordinatorQueueFixtures.now }
        )

        await finalization.activate(identity: CoordinatorQueueFixtures.identity)
        activity.update(isActive: true)
        queue.prepareForForegroundRevalidation()
        finalization.prepareForForegroundRevalidation()

        let result = try await queue.save(
            CoordinatorQueueFixtures.input(
                partition: CoordinatorQueueFixtures.partition(matchId: matchId)
            )
        )
        guard case .inserted = result else {
            return XCTFail("A probe-free identity must retain durable offline Save")
        }
        XCTAssertTrue(api.holeRequests.isEmpty)
        XCTAssertTrue(api.finalizationRequests.isEmpty)
    }

    func testInactiveActivationWithUnknownProbeKeepsLocalSaveFencedUntilAuthorizedRecovery() async throws {
        let matchId = "finalize-cold-unknown-probe"
        let activity = NativeApplicationActivity(
            isActive: false,
            mutationTransportAuthorized: false
        )
        let repository = InMemoryScoringQueueRepository()
        let api = CoordinatorQueueAPI()
        let credentials = CoordinatorQueueCredentials()
        let queue = makeQueue(
            repository: repository,
            api: api,
            credentials: credentials,
            applicationActivity: activity
        )
        await queue.activate(identity: CoordinatorQueueFixtures.identity)
        let probes = InMemoryScoringFinalizationProbeStore()
        try await probes.save(finalizationProbe(matchId: matchId, phase: .outcomeUnknown))
        let finalization = ScoringFinalizationCoordinator(
            api: api,
            credentialProvider: credentials,
            queue: queue,
            probeStore: probes,
            applicationActivity: activity,
            liveMutationSendingEnabled: true,
            now: { CoordinatorQueueFixtures.now }
        )

        await finalization.activate(identity: CoordinatorQueueFixtures.identity)
        activity.update(isActive: true)
        queue.prepareForForegroundRevalidation()
        finalization.prepareForForegroundRevalidation()

        do {
            _ = try await queue.save(
                CoordinatorQueueFixtures.input(
                    partition: CoordinatorQueueFixtures.partition(matchId: matchId)
                )
            )
            XCTFail("An unknown finalization outcome must fence local hole admission")
        } catch {
            XCTAssertEqual(error as? ScoringQueueCoordinatorError, .inactiveIdentity)
        }
        XCTAssertTrue(api.holeRequests.isEmpty)
        XCTAssertTrue(api.finalizationRequests.isEmpty)
        let retained = try await probes.probe(for: CoordinatorQueueFixtures.identity)
        XCTAssertEqual(retained?.phase, .outcomeUnknown)
    }

    func testInterruptedInactiveProbeReadIsRecheckedLocallyBeforeTransientForegroundOfflineSave() async throws {
        let matchId = "finalize-interrupted-cold-probe"
        let activity = NativeApplicationActivity(
            isActive: false,
            mutationTransportAuthorized: false
        )
        let repository = InMemoryScoringQueueRepository()
        let api = CoordinatorQueueAPI()
        let credentials = CoordinatorQueueCredentials()
        let queue = makeQueue(
            repository: repository,
            api: api,
            credentials: credentials,
            applicationActivity: activity
        )
        await queue.activate(identity: CoordinatorQueueFixtures.identity)
        let probes = InMemoryScoringFinalizationProbeStore()
        await probes.suspendNextProbe(for: CoordinatorQueueFixtures.identity)
        let finalization = ScoringFinalizationCoordinator(
            api: api,
            credentialProvider: credentials,
            queue: queue,
            probeStore: probes,
            applicationActivity: activity,
            liveMutationSendingEnabled: true,
            now: { CoordinatorQueueFixtures.now }
        )

        let activation = Task { @MainActor in
            await finalization.activate(identity: CoordinatorQueueFixtures.identity)
        }
        let probeReadSuspended = await eventually {
            await probes.hasSuspendedProbe(for: CoordinatorQueueFixtures.identity)
        }
        XCTAssertTrue(probeReadSuspended)
        finalization.prepareForApplicationInactivity()
        await probes.resumeSuspendedProbe(for: CoordinatorQueueFixtures.identity)
        await activation.value

        activity.update(isActive: true)
        queue.prepareForForegroundRevalidation()
        finalization.prepareForForegroundRevalidation()
        let input = CoordinatorQueueFixtures.input(
            partition: CoordinatorQueueFixtures.partition(matchId: matchId)
        )
        let saveOpened = await eventually {
            (try? await queue.save(input)) != nil
        }

        XCTAssertTrue(saveOpened)
        XCTAssertTrue(api.holeRequests.isEmpty)
        XCTAssertTrue(api.finalizationRequests.isEmpty)
    }

    func testOutcomeUnknownProbeFencesLocalSaveUntilRelaunchReconciliationCompletes() async throws {
        let matchId = "finalize-recovery-fence-unknown"
        let repository = InMemoryScoringQueueRepository()
        let api = CoordinatorQueueAPI()
        let credentials = CoordinatorQueueCredentials()
        let queue = makeQueue(repository: repository, api: api, credentials: credentials)
        let partition = CoordinatorQueueFixtures.partition(matchId: matchId)
        api.configureCanonical(
            for: partition,
            scores: completeOfficialScores(),
            status: .inProgress,
            canScore: true,
            readOnly: false,
            canFinalize: true
        )
        await queue.activate(identity: CoordinatorQueueFixtures.identity)
        let probes = InMemoryScoringFinalizationProbeStore()
        try await probes.save(finalizationProbe(matchId: matchId, phase: .outcomeUnknown))
        let finalization = ScoringFinalizationCoordinator(
            api: api,
            credentialProvider: credentials,
            queue: queue,
            probeStore: probes,
            liveMutationSendingEnabled: true,
            now: { CoordinatorQueueFixtures.now }
        )
        api.suspendNextCurrent(for: matchId)

        let activation = Task { @MainActor in
            await finalization.activate(identity: CoordinatorQueueFixtures.identity)
        }
        let recoveryReadSuspended = await eventually {
            api.hasSuspendedCurrent(for: matchId)
        }
        XCTAssertTrue(recoveryReadSuspended)
        do {
            _ = try await queue.save(CoordinatorQueueFixtures.input(partition: partition))
            XCTFail("A pending finalization probe must fence local hole admission")
        } catch {
            XCTAssertEqual(error as? ScoringQueueCoordinatorError, .inactiveIdentity)
        }
        do {
            try await finalization.finalize(matchId: matchId)
            XCTFail("A new finalization must not interleave with probe recovery")
        } catch {
            XCTAssertEqual(
                error as? ScoringFinalizationCoordinatorError,
                .queueNotReady
            )
        }
        XCTAssertTrue(api.holeRequests.isEmpty)
        XCTAssertTrue(api.finalizationRequests.isEmpty)

        api.resumeSuspendedCurrent(for: matchId)
        await activation.value

        XCTAssertEqual(finalization.state.phase, .confirmationRequired)
        let resolvedProbe = try await probes.probe(for: CoordinatorQueueFixtures.identity)
        XCTAssertNil(resolvedProbe)
        let saveAfterResolution = try await queue.save(
            CoordinatorQueueFixtures.input(partition: partition)
        )
        guard case .inserted = saveAfterResolution else {
            return XCTFail("Queue admission should reopen after probe resolution")
        }
    }

    func testAcknowledgedProbeFencesQueueUntilCanonicalFinalRefreshCompletes() async throws {
        let matchId = "finalize-recovery-fence-ack"
        let repository = InMemoryScoringQueueRepository()
        let api = CoordinatorQueueAPI()
        let credentials = CoordinatorQueueCredentials()
        let queue = makeQueue(repository: repository, api: api, credentials: credentials)
        let partition = CoordinatorQueueFixtures.partition(matchId: matchId)
        api.configureCanonical(
            for: partition,
            matchRevision: 13,
            permissionRevision: 5,
            scores: completeOfficialScores(),
            status: .completed,
            canScore: false,
            readOnly: true,
            canFinalize: false
        )
        await queue.activate(identity: CoordinatorQueueFixtures.identity)
        let probes = InMemoryScoringFinalizationProbeStore()
        try await probes.save(finalizationProbe(matchId: matchId, phase: .acknowledged))
        let finalization = ScoringFinalizationCoordinator(
            api: api,
            credentialProvider: credentials,
            queue: queue,
            probeStore: probes,
            liveMutationSendingEnabled: true,
            now: { CoordinatorQueueFixtures.now }
        )
        api.suspendNextCurrent(for: matchId)

        let activation = Task { @MainActor in
            await finalization.activate(identity: CoordinatorQueueFixtures.identity)
        }
        let recoveryReadSuspended = await eventually {
            api.hasSuspendedCurrent(for: matchId)
        }
        XCTAssertTrue(recoveryReadSuspended)
        do {
            _ = try await queue.save(CoordinatorQueueFixtures.input(partition: partition))
            XCTFail("An acknowledged finalization probe must fence local hole admission")
        } catch {
            XCTAssertEqual(error as? ScoringQueueCoordinatorError, .inactiveIdentity)
        }
        XCTAssertTrue(api.holeRequests.isEmpty)

        api.resumeSuspendedCurrent(for: matchId)
        await activation.value

        XCTAssertEqual(finalization.state.phase, .matchFinal)
        let resolvedProbe = try await probes.probe(for: CoordinatorQueueFixtures.identity)
        XCTAssertNil(resolvedProbe)
        XCTAssertTrue(api.finalizationRequests.isEmpty)
        XCTAssertTrue(api.holeRequests.isEmpty)
    }

    func testProbeReconciliationRejectsCanonicalRevisionOlderThanProbePrecondition() async throws {
        let cases: [(ScoringFinalizationProbePhase, ScoringFinalizationPhase)] = [
            (.outcomeUnknown, .outcomeUnknown),
            (.acknowledged, .acknowledgedRefreshPending),
        ]

        for (probePhase, expectedStatePhase) in cases {
            let matchId = "finalize-stale-probe-\(probePhase.rawValue)"
            let repository = InMemoryScoringQueueRepository()
            let api = CoordinatorQueueAPI()
            let credentials = CoordinatorQueueCredentials()
            let queue = makeQueue(repository: repository, api: api, credentials: credentials)
            let partition = CoordinatorQueueFixtures.partition(matchId: matchId)
            api.configureCanonical(
                for: partition,
                matchRevision: 11,
                permissionRevision: 5,
                scores: completeOfficialScores(),
                status: .completed,
                canScore: false,
                readOnly: true,
                canFinalize: false
            )
            await queue.activate(identity: CoordinatorQueueFixtures.identity)
            let probes = InMemoryScoringFinalizationProbeStore()
            try await probes.save(finalizationProbe(matchId: matchId, phase: probePhase))
            let finalization = ScoringFinalizationCoordinator(
                api: api,
                credentialProvider: credentials,
                queue: queue,
                probeStore: probes,
                liveMutationSendingEnabled: true,
                now: { CoordinatorQueueFixtures.now }
            )
            var canonicalUpdates: [MobileScoringCurrentResponse] = []
            finalization.setCanonicalUpdateHandler { canonicalUpdates.append($0) }

            await finalization.activate(identity: CoordinatorQueueFixtures.identity)

            XCTAssertEqual(finalization.state.phase, expectedStatePhase)
            XCTAssertEqual(finalization.state.blocker, .canonicalUnavailable)
            XCTAssertTrue(canonicalUpdates.isEmpty, "Stale canonical state must not be published")
            XCTAssertEqual(api.scoringCurrentMatchIDs, [matchId])
            XCTAssertTrue(api.finalizationRequests.isEmpty)
            let retainedProbe = try await probes.probe(for: CoordinatorQueueFixtures.identity)
            XCTAssertEqual(retainedProbe?.phase, probePhase)

            await finalization.deactivate()
            await queue.deactivate()
        }
    }

    func testCanceledInitialTransportChildCannotEnterFinalizeAPIUnderNewActivityEpoch() async throws {
        let matchId = "finalize-cancel-before-initial-post"
        let activity = NativeApplicationActivity(
            isActive: true,
            mutationTransportAuthorized: true
        )
        let gate = FinalizationTransportStartGate(suspendingAttempt: 1)
        let harness = await makeHarness(
            matchId: matchId,
            applicationActivity: activity,
            beforeFinalizationTransport: { await gate.waitBeforeTransport() }
        )

        let finalizeTask = Task { @MainActor in
            try? await harness.finalization.finalize(matchId: matchId)
        }
        let childSuspended = await eventually { gate.isSuspended }
        XCTAssertTrue(childSuspended)
        XCTAssertTrue(harness.api.finalizationRequests.isEmpty)

        activity.update(isActive: false)
        harness.finalization.prepareForApplicationInactivity()
        activity.update(isActive: true)
        activity.authorizeMutationTransport()
        gate.resume()
        await finalizeTask.value

        XCTAssertTrue(harness.api.finalizationRequests.isEmpty)
        let retained = try await harness.probes.probe(for: CoordinatorQueueFixtures.identity)
        XCTAssertEqual(retained?.phase, .outcomeUnknown)
    }

    func testCanceledAuthRefreshTransportChildCannotEnterSecondFinalizeAPIUnderNewEpoch() async throws {
        let matchId = "finalize-cancel-before-auth-retry-post"
        let activity = NativeApplicationActivity(
            isActive: true,
            mutationTransportAuthorized: true
        )
        let gate = FinalizationTransportStartGate(suspendingAttempt: 2)
        let harness = await makeHarness(
            matchId: matchId,
            applicationActivity: activity,
            beforeFinalizationTransport: { await gate.waitBeforeTransport() }
        )
        harness.api.setFinalizationOutcomes(
            [
                .fail(.rejected(
                    code: .unauthorized,
                    status: 401,
                    data: nil,
                    retryAfter: nil
                )),
                .accept,
            ],
            for: matchId
        )

        let finalizeTask = Task { @MainActor in
            try? await harness.finalization.finalize(matchId: matchId)
        }
        let retryChildSuspended = await eventually { gate.isSuspended }
        XCTAssertTrue(retryChildSuspended)
        XCTAssertEqual(harness.api.finalizationRequests.count, 1)

        activity.update(isActive: false)
        harness.finalization.prepareForApplicationInactivity()
        activity.update(isActive: true)
        activity.authorizeMutationTransport()
        gate.resume()
        await finalizeTask.value

        XCTAssertEqual(
            harness.api.finalizationRequests.count,
            1,
            "The canceled auth-refresh child must not begin a second POST"
        )
        let retained = try await harness.probes.probe(for: CoordinatorQueueFixtures.identity)
        XCTAssertEqual(retained?.phase, .outcomeUnknown)
    }

    func testRevokedActivityGateDuringSuspendedCanonicalPreflightCannotFinalizeAfterNewEpoch() async throws {
        let matchId = "finalize-revoked-preflight"
        let activity = NativeApplicationActivity(
            isActive: true,
            mutationTransportAuthorized: true
        )
        let harness = await makeHarness(
            matchId: matchId,
            applicationActivity: activity
        )
        harness.api.suspendNextCurrent(for: matchId)

        let finalizeTask = Task { @MainActor () -> ScoringFinalizationCoordinatorError? in
            do {
                try await harness.finalization.finalize(matchId: matchId)
                return nil
            } catch {
                return error as? ScoringFinalizationCoordinatorError
            }
        }
        let preflightSuspended = await eventually {
            harness.api.hasSuspendedCurrent(for: matchId)
        }
        XCTAssertTrue(preflightSuspended)

        activity.update(isActive: false)
        harness.finalization.prepareForApplicationInactivity()
        activity.update(isActive: true)
        activity.authorizeMutationTransport()
        harness.api.resumeSuspendedCurrent(for: matchId)

        let finalizationError = await finalizeTask.value
        XCTAssertEqual(finalizationError, .inactiveIdentity)
        XCTAssertTrue(harness.api.finalizationRequests.isEmpty)
        let probe = try await harness.probes.probe(for: CoordinatorQueueFixtures.identity)
        XCTAssertNil(probe)
    }

    func testLiveMutationGateDisabledPreventsCanonicalReadProbeAndFinalizePOST() async throws {
        let matchId = "finalize-live-gate"
        let harness = await makeHarness(
            matchId: matchId,
            liveMutationSendingEnabled: false
        )

        do {
            try await harness.finalization.finalize(matchId: matchId)
            XCTFail("The explicit live-write gate must fail closed")
        } catch {
            XCTAssertEqual(
                error as? ScoringFinalizationCoordinatorError,
                .mutationSendingDisabled
            )
        }

        XCTAssertTrue(harness.api.scoringCurrentMatchIDs.isEmpty)
        XCTAssertTrue(harness.api.finalizationRequests.isEmpty)
        XCTAssertEqual(harness.finalization.state.phase, .blocked)
        XCTAssertEqual(harness.finalization.state.blocker, .authorization)
        let probe = try await harness.probes.probe(for: CoordinatorQueueFixtures.identity)
        XCTAssertNil(probe)
    }

    func testContradictoryFinalizationPermissionFailsClosedBeforePOST() async throws {
        let matchId = "finalize-contradictory-permission"
        let harness = await makeHarness(matchId: matchId)
        harness.api.configureCanonical(
            for: CoordinatorQueueFixtures.partition(matchId: matchId),
            scores: completeOfficialScores(),
            status: .inProgress,
            canScore: false,
            readOnly: false,
            canFinalize: true
        )

        do {
            try await harness.finalization.finalize(matchId: matchId)
            XCTFail("Finalization must require writable scoring authority")
        } catch {
            XCTAssertEqual(
                error as? ScoringFinalizationCoordinatorError,
                .invalidCanonicalContext
            )
        }

        XCTAssertTrue(harness.api.finalizationRequests.isEmpty)
        let probe = try await harness.probes.probe(for: CoordinatorQueueFixtures.identity)
        XCTAssertNil(probe)
    }

    func testEnvironmentSuspensionCancelsInFlightFinalizeAndReconcilesOnlyAfterResume() async throws {
        let matchId = "finalize-environment-suspension"
        let harness = await makeHarness(matchId: matchId)
        harness.api.finalizationDelayNanoseconds = 5_000_000_000

        let finalizeTask = Task { @MainActor in
            try? await harness.finalization.finalize(matchId: matchId)
        }
        let transportStarted = await eventually {
            harness.api.finalizationRequests.count == 1
        }
        XCTAssertTrue(transportStarted)
        XCTAssertEqual(harness.api.scoringCurrentMatchIDs, [matchId])

        await harness.finalization.suspendForEnvironmentReattestation()
        await finalizeTask.value
        XCTAssertEqual(harness.api.finalizationRequests.count, 1)
        XCTAssertEqual(
            harness.api.scoringCurrentMatchIDs,
            [matchId],
            "No canonical request may escape while environment authority is suspended"
        )
        XCTAssertEqual(harness.finalization.state.phase, .outcomeUnknown)
        let suspendedProbe = try await harness.probes.probe(for: CoordinatorQueueFixtures.identity)
        XCTAssertEqual(suspendedProbe?.phase, .outcomeUnknown)

        await harness.finalization.resumeAfterEnvironmentReattestation()

        XCTAssertEqual(harness.api.finalizationRequests.count, 1)
        XCTAssertEqual(harness.api.scoringCurrentMatchIDs, [matchId, matchId])
        XCTAssertEqual(harness.finalization.state.phase, .confirmationRequired)
        let reconciledProbe = try await harness.probes.probe(for: CoordinatorQueueFixtures.identity)
        XCTAssertNil(reconciledProbe)
    }

    func testDelayedAcceptedResponseAfterEnvironmentResumeReconcilesWithoutSecondPOST() async throws {
        let matchId = "finalize-delayed-accept-after-resume"
        let harness = await makeHarness(matchId: matchId)
        harness.api.suspendNextFinalization(for: matchId)

        let finalizeTask = Task { @MainActor in
            try? await harness.finalization.finalize(matchId: matchId)
        }
        let responseSuspended = await eventually {
            harness.api.hasSuspendedFinalization(for: matchId)
        }
        XCTAssertTrue(responseSuspended)
        XCTAssertEqual(harness.api.finalizationRequests.count, 1)

        await harness.finalization.suspendForEnvironmentReattestation()
        await harness.finalization.resumeAfterEnvironmentReattestation()
        XCTAssertEqual(harness.finalization.state.phase, .outcomeUnknown)
        let probeBeforeLateResponse = try await harness.probes.probe(
            for: CoordinatorQueueFixtures.identity
        )
        XCTAssertEqual(probeBeforeLateResponse?.phase, .outcomeUnknown)

        do {
            _ = try await harness.queue.save(
                CoordinatorQueueFixtures.input(
                    partition: CoordinatorQueueFixtures.partition(matchId: matchId)
                )
            )
            XCTFail("A cancellation-insensitive finalization must fence local Save until it drains")
        } catch {
            XCTAssertEqual(error as? ScoringQueueCoordinatorError, .inactiveIdentity)
        }
        do {
            try await harness.finalization.finalize(matchId: matchId)
            XCTFail("A second finalization must stay blocked until the first transport drains")
        } catch {
            XCTAssertEqual(
                error as? ScoringFinalizationCoordinatorError,
                .queueNotReady
            )
        }
        XCTAssertTrue(harness.api.holeRequests.isEmpty)
        XCTAssertEqual(harness.api.finalizationRequests.count, 1)

        harness.api.resumeSuspendedFinalization(for: matchId)
        await finalizeTask.value

        let reconciledFinal = await eventually {
            harness.finalization.state.phase == .matchFinal
        }
        XCTAssertTrue(reconciledFinal)
        XCTAssertEqual(harness.api.finalizationRequests.count, 1)
        let probe = try await harness.probes.probe(for: CoordinatorQueueFixtures.identity)
        XCTAssertNil(probe)
    }

    func testUnknownProbeRefreshIsSingleFlightAcrossConcurrentManualRequests() async throws {
        let matchId = "finalize-unknown-single-flight"
        let harness = await makeHarness(matchId: matchId)
        harness.api.setFinalizationOutcomes(
            [.commitThenFail(unknownOutcome())],
            for: matchId
        )
        harness.api.setCurrentOutcomes(
            [.canonical, .fail(.transportUnavailable)],
            for: matchId
        )

        try await harness.finalization.finalize(matchId: matchId)
        XCTAssertEqual(harness.finalization.state.phase, .outcomeUnknown)
        let partition = CoordinatorQueueFixtures.partition(matchId: matchId)
        harness.api.configureCanonical(
            for: partition,
            matchRevision: 13,
            permissionRevision: 5,
            scores: completeOfficialScores(),
            status: .completed,
            canScore: false,
            readOnly: true,
            canFinalize: false
        )
        let requestsBeforeRefresh = harness.api.scoringCurrentMatchIDs.count
        harness.api.suspendNextCurrent(for: matchId)

        let first = Task { @MainActor in
            await harness.finalization.refreshUnknownOutcome()
        }
        let unknownReadSuspended = await eventually {
            harness.api.hasSuspendedCurrent(for: matchId)
        }
        XCTAssertTrue(unknownReadSuspended)
        await harness.finalization.refreshUnknownOutcome()

        XCTAssertEqual(
            harness.api.scoringCurrentMatchIDs.count,
            requestsBeforeRefresh + 1,
            "Concurrent recovery requests must share one canonical read"
        )
        harness.api.resumeSuspendedCurrent(for: matchId)
        await first.value

        XCTAssertEqual(harness.finalization.state.phase, .matchFinal)
        let resolvedUnknownProbe = try await harness.probes.probe(
            for: CoordinatorQueueFixtures.identity
        )
        XCTAssertNil(resolvedUnknownProbe)
    }

    func testAcknowledgedProbeRefreshIsSingleFlightAcrossConcurrentManualRequests() async throws {
        let matchId = "finalize-ack-single-flight"
        let harness = await makeHarness(matchId: matchId)
        harness.api.setFinalizationOutcomes(
            [.acceptWithoutCanonicalProjection],
            for: matchId
        )

        try await harness.finalization.finalize(matchId: matchId)
        XCTAssertEqual(harness.finalization.state.phase, .acknowledgedRefreshPending)
        let partition = CoordinatorQueueFixtures.partition(matchId: matchId)
        harness.api.configureCanonical(
            for: partition,
            matchRevision: 13,
            permissionRevision: 5,
            scores: completeOfficialScores(),
            status: .completed,
            canScore: false,
            readOnly: true,
            canFinalize: false
        )
        let requestsBeforeRefresh = harness.api.scoringCurrentMatchIDs.count
        harness.api.suspendNextCurrent(for: matchId)

        let first = Task { @MainActor in
            await harness.finalization.refreshUnknownOutcome()
        }
        let acknowledgedReadSuspended = await eventually {
            harness.api.hasSuspendedCurrent(for: matchId)
        }
        XCTAssertTrue(acknowledgedReadSuspended)
        await harness.finalization.refreshUnknownOutcome()

        XCTAssertEqual(
            harness.api.scoringCurrentMatchIDs.count,
            requestsBeforeRefresh + 1,
            "Acknowledged recovery must remain refresh-only and single-flight"
        )
        harness.api.resumeSuspendedCurrent(for: matchId)
        await first.value

        XCTAssertEqual(harness.finalization.state.phase, .matchFinal)
        let resolvedAcknowledgedProbe = try await harness.probes.probe(
            for: CoordinatorQueueFixtures.identity
        )
        XCTAssertNil(resolvedAcknowledgedProbe)
        XCTAssertEqual(harness.api.finalizationRequests.count, 1)
    }

    func testAcceptedAcknowledgementRevisionIsDurableCanonicalRefreshFloor() async throws {
        let matchId = "finalize-ack-revision-floor"
        let harness = await makeHarness(matchId: matchId)
        harness.api.setFinalizationOutcomes(
            [.acceptWithoutCanonicalProjection],
            for: matchId
        )
        var canonicalUpdates: [MobileScoringCurrentResponse] = []
        harness.finalization.setCanonicalUpdateHandler { canonicalUpdates.append($0) }

        try await harness.finalization.finalize(matchId: matchId)

        XCTAssertEqual(harness.finalization.state.phase, .acknowledgedRefreshPending)
        XCTAssertEqual(harness.finalization.state.blocker, .canonicalUnavailable)
        let acknowledgedProbe = try await harness.probes.probe(
            for: CoordinatorQueueFixtures.identity
        )
        XCTAssertEqual(acknowledgedProbe?.expectedMatchRevision, 12)
        XCTAssertEqual(acknowledgedProbe?.acknowledgedMatchRevision, 13)
        XCTAssertEqual(acknowledgedProbe?.phase, .acknowledged)
        XCTAssertEqual(canonicalUpdates.count, 1, "The stale post-ACK projection must not publish")

        let partition = CoordinatorQueueFixtures.partition(matchId: matchId)
        harness.api.configureCanonical(
            for: partition,
            matchRevision: 12,
            permissionRevision: 5,
            scores: completeOfficialScores(),
            status: .completed,
            canScore: false,
            readOnly: true,
            canFinalize: false
        )
        await harness.finalization.refreshUnknownOutcome()

        XCTAssertEqual(harness.finalization.state.phase, .acknowledgedRefreshPending)
        XCTAssertEqual(harness.finalization.state.blocker, .canonicalUnavailable)
        XCTAssertEqual(canonicalUpdates.count, 1)
        let retainedProbe = try await harness.probes.probe(
            for: CoordinatorQueueFixtures.identity
        )
        XCTAssertEqual(retainedProbe?.acknowledgedMatchRevision, 13)

        harness.api.configureCanonical(
            for: partition,
            matchRevision: 13,
            permissionRevision: 5,
            scores: completeOfficialScores(),
            status: .completed,
            canScore: false,
            readOnly: true,
            canFinalize: false
        )
        await harness.finalization.refreshUnknownOutcome()

        XCTAssertEqual(harness.finalization.state.phase, .matchFinal)
        XCTAssertEqual(canonicalUpdates.count, 2)
        XCTAssertEqual(harness.api.finalizationRequests.count, 1)
        let resolvedProbe = try await harness.probes.probe(
            for: CoordinatorQueueFixtures.identity
        )
        XCTAssertNil(resolvedProbe)
    }

    func testKnownUnsentProbeDeletionFailureKeepsFinalizationFenceClosed() async throws {
        let matchId = "finalize-delete-failure"
        let harness = await makeHarness(matchId: matchId)
        harness.api.setFinalizationOutcomes(
            [.fail(.definitelyNotSent(.requestConstruction))],
            for: matchId
        )
        await harness.probes.failNextRemoval()

        try await harness.finalization.finalize(matchId: matchId)

        XCTAssertEqual(harness.finalization.state.phase, .blocked)
        XCTAssertEqual(harness.finalization.state.blocker, .contract)
        let retainedProbe = try await harness.probes.probe(
            for: CoordinatorQueueFixtures.identity
        )
        XCTAssertEqual(retainedProbe?.phase, .outcomeUnknown)
        do {
            _ = try await harness.queue.save(
                CoordinatorQueueFixtures.input(
                    partition: CoordinatorQueueFixtures.partition(matchId: matchId)
                )
            )
            XCTFail("Durable probe deletion failure must retain the finalization fence")
        } catch {
            XCTAssertEqual(error as? ScoringQueueCoordinatorError, .inactiveIdentity)
        }
    }

    func testEnvironmentSuspensionDuringInitialCredentialFetchCreatesNoProbeOrPOST() async throws {
        let matchId = "finalize-suspended-credentials"
        let harness = await makeHarness(matchId: matchId)
        harness.credentials.suspendNextCredentials()

        let finalizeTask = Task { @MainActor in
            try? await harness.finalization.finalize(matchId: matchId)
        }
        let credentialsSuspended = await eventually {
            harness.credentials.hasSuspendedCredentials()
        }
        XCTAssertTrue(credentialsSuspended)

        await harness.finalization.suspendForEnvironmentReattestation()
        harness.credentials.resumeSuspendedCredentials()
        await finalizeTask.value

        XCTAssertTrue(harness.api.scoringCurrentMatchIDs.isEmpty)
        XCTAssertTrue(harness.api.finalizationRequests.isEmpty)
        let probe = try await harness.probes.probe(for: CoordinatorQueueFixtures.identity)
        XCTAssertNil(probe)
    }

    func testEveryUnresolvedQueueStateBlocksFinalizationWithoutPOST() async throws {
        let states: [ScoringQueueState] = [
            .queued,
            .syncing,
            .retryable,
            .acknowledged,
            .conflict,
            .actionRequired,
            .quarantined,
        ]

        for (offset, queueState) in states.enumerated() {
            let matchId = "finalize-block-\(queueState.rawValue)"
            let record = blockingRecord(
                matchId: matchId,
                sequence: Int64(offset + 1),
                state: queueState
            )
            let harness = await makeHarness(
                matchId: matchId,
                records: [record]
            )

            do {
                try await harness.finalization.finalize(matchId: matchId)
                XCTFail("\(queueState.rawValue) must block finalization")
            } catch {
                XCTAssertEqual(
                    error as? ScoringFinalizationCoordinatorError,
                    .queueNotReady,
                    queueState.rawValue
                )
            }

            XCTAssertEqual(harness.finalization.state.phase, .blocked, queueState.rawValue)
            XCTAssertEqual(harness.finalization.state.blocker, .queue, queueState.rawValue)
            XCTAssertTrue(harness.api.finalizationRequests.isEmpty, queueState.rawValue)
            let probe = try await harness.probes.probe(for: CoordinatorQueueFixtures.identity)
            XCTAssertNil(probe)

            await harness.finalization.deactivate()
            await harness.queue.deactivate()
        }
    }

    func testExplicitCanonicalRefreshRecoversNotReadyWithoutAutomaticPOST() async throws {
        let matchId = "finalize-eligibility-refresh"
        let harness = await makeHarness(matchId: matchId)
        let partition = CoordinatorQueueFixtures.partition(matchId: matchId)
        harness.api.configureCanonical(
            for: partition,
            scores: completeOfficialScores(),
            status: .inProgress,
            canScore: true,
            readOnly: false,
            canFinalize: false
        )

        do {
            try await harness.finalization.finalize(matchId: matchId)
            XCTFail("Canonical not-ready state must block finalization")
        } catch {
            XCTAssertEqual(error as? ScoringFinalizationCoordinatorError, .notReady)
        }
        XCTAssertEqual(harness.finalization.state.phase, .blocked)
        XCTAssertEqual(harness.finalization.state.blocker, .notReady)
        XCTAssertTrue(harness.api.finalizationRequests.isEmpty)

        harness.api.configureCanonical(
            for: partition,
            scores: completeOfficialScores(),
            status: .inProgress,
            canScore: true,
            readOnly: false,
            canFinalize: true
        )
        let response = try await harness.api.scoringCurrent(
            accessToken: "test-access",
            certification: "test-certification",
            matchID: matchId
        )
        await harness.finalization.reconsiderEligibility(using: response.data.scoring)

        XCTAssertEqual(harness.finalization.state, .idle)
        XCTAssertTrue(harness.api.finalizationRequests.isEmpty)
    }

    func testSuccessfulFinalizationPostsOnceRefreshesCanonicalFinalAndRemovesProbe() async throws {
        let matchId = "finalize-success"
        let harness = await makeHarness(matchId: matchId)
        var canonicalUpdates: [MobileScoringCurrentResponse] = []
        harness.finalization.setCanonicalUpdateHandler { canonicalUpdates.append($0) }

        try await harness.finalization.finalize(matchId: matchId)

        XCTAssertEqual(harness.api.finalizationRequests.count, 1)
        XCTAssertEqual(harness.api.scoringCurrentMatchIDs, [matchId, matchId])
        XCTAssertEqual(harness.finalization.state.phase, .matchFinal)
        XCTAssertNil(harness.finalization.state.blocker)
        XCTAssertEqual(canonicalUpdates.last?.data.scoring?.match.status, .completed)
        let probe = try await harness.probes.probe(for: CoordinatorQueueFixtures.identity)
        XCTAssertNil(probe)
    }

    func testCommittedThenLostResponseReconcilesCanonicalFinalWithoutResend() async throws {
        let matchId = "finalize-lost-response"
        let harness = await makeHarness(matchId: matchId)
        harness.api.setFinalizationOutcomes(
            [.commitThenFail(unknownOutcome())],
            for: matchId
        )

        try await harness.finalization.finalize(matchId: matchId)

        XCTAssertEqual(harness.api.finalizationRequests.count, 1)
        XCTAssertEqual(harness.api.scoringCurrentMatchIDs, [matchId, matchId])
        XCTAssertEqual(harness.finalization.state.phase, .matchFinal)
        let probe = try await harness.probes.probe(for: CoordinatorQueueFixtures.identity)
        XCTAssertNil(probe)
    }

    func testAcceptedAcknowledgementWithLaggingProjectionStaysRefreshOnlyAcrossRelaunch() async throws {
        let matchId = "finalize-accepted-lagging-projection"
        let first = await makeHarness(matchId: matchId)
        first.api.setFinalizationOutcomes(
            [.acceptWithoutCanonicalProjection],
            for: matchId
        )

        try await first.finalization.finalize(matchId: matchId)

        XCTAssertEqual(first.api.finalizationRequests.count, 1)
        XCTAssertEqual(first.finalization.state.phase, .acknowledgedRefreshPending)
        let acceptedProbe = try await first.probes.probe(for: CoordinatorQueueFixtures.identity)
        XCTAssertEqual(acceptedProbe?.phase, .acknowledged)

        await first.finalization.deactivate()
        await first.queue.deactivate()
        let restoredQueue = makeQueue(
            repository: first.repository,
            api: first.api,
            credentials: first.credentials
        )
        await restoredQueue.activate(identity: CoordinatorQueueFixtures.identity)
        let restored = ScoringFinalizationCoordinator(
            api: first.api,
            credentialProvider: first.credentials,
            queue: restoredQueue,
            probeStore: first.probes,
            liveMutationSendingEnabled: true,
            now: { CoordinatorQueueFixtures.now }
        )

        await restored.activate(identity: CoordinatorQueueFixtures.identity)

        XCTAssertEqual(restored.state.phase, .acknowledgedRefreshPending)
        XCTAssertEqual(first.api.finalizationRequests.count, 1)
        let partition = CoordinatorQueueFixtures.partition(matchId: matchId)
        first.api.configureCanonical(
            for: partition,
            matchRevision: 13,
            permissionRevision: 5,
            scores: completeOfficialScores(),
            status: .completed,
            canScore: false,
            readOnly: true,
            canFinalize: false
        )

        await restored.refreshUnknownOutcome()

        XCTAssertEqual(restored.state.phase, .matchFinal)
        XCTAssertEqual(first.api.finalizationRequests.count, 1)
        let resolvedProbe = try await first.probes.probe(for: CoordinatorQueueFixtures.identity)
        XCTAssertNil(resolvedProbe)
    }

    func testUnknownOutcomeWithStillActiveFinalizableMatchRequiresNewConfirmation() async throws {
        let matchId = "finalize-unknown-active"
        let harness = await makeHarness(matchId: matchId)
        harness.api.setFinalizationOutcomes(
            [.fail(unknownOutcome())],
            for: matchId
        )

        try await harness.finalization.finalize(matchId: matchId)

        XCTAssertEqual(harness.api.finalizationRequests.count, 1)
        XCTAssertEqual(harness.api.scoringCurrentMatchIDs, [matchId, matchId])
        XCTAssertEqual(harness.finalization.state.phase, .confirmationRequired)
        XCTAssertNil(harness.finalization.state.blocker)
        let probe = try await harness.probes.probe(for: CoordinatorQueueFixtures.identity)
        XCTAssertNil(probe)

        await Task.yield()
        XCTAssertEqual(
            harness.api.finalizationRequests.count,
            1,
            "An unknown finalization outcome must never be posted again automatically"
        )
    }

    func testUnknownProbeSurvivesRefreshFailureAndResolvesOnLaterActivationWithoutPOST() async throws {
        let matchId = "finalize-relaunch-recovery"
        let first = await makeHarness(matchId: matchId)
        first.api.setFinalizationOutcomes(
            [.fail(unknownOutcome())],
            for: matchId
        )
        first.api.setCurrentOutcomes(
            [.canonical, .fail(.transportUnavailable)],
            for: matchId
        )

        try await first.finalization.finalize(matchId: matchId)

        XCTAssertEqual(first.api.finalizationRequests.count, 1)
        XCTAssertEqual(first.finalization.state.phase, .outcomeUnknown)
        XCTAssertEqual(first.finalization.state.blocker, .canonicalUnavailable)
        let durableProbe = try await first.probes.probe(for: CoordinatorQueueFixtures.identity)
        XCTAssertEqual(durableProbe?.phase, .outcomeUnknown)

        await first.finalization.deactivate()
        await first.queue.deactivate()

        let restoredQueue = makeQueue(
            repository: first.repository,
            api: first.api,
            credentials: first.credentials
        )
        await restoredQueue.activate(identity: CoordinatorQueueFixtures.identity)
        let restored = ScoringFinalizationCoordinator(
            api: first.api,
            credentialProvider: first.credentials,
            queue: restoredQueue,
            probeStore: first.probes,
            liveMutationSendingEnabled: true,
            now: { CoordinatorQueueFixtures.now }
        )

        await restored.activate(identity: CoordinatorQueueFixtures.identity)

        XCTAssertEqual(restored.state.phase, .confirmationRequired)
        let restoredProbe = try await first.probes.probe(for: CoordinatorQueueFixtures.identity)
        XCTAssertNil(restoredProbe)
        XCTAssertEqual(
            first.api.finalizationRequests.count,
            1,
            "Launch reconciliation must be refresh-only"
        )
    }

    func testAlreadyFinalizedKnownRejectionResolvesThroughCanonicalRefresh() async throws {
        let matchId = "finalize-already-final"
        let harness = await makeHarness(matchId: matchId)
        harness.api.setFinalizationOutcomes(
            [.commitThenFail(.rejected(
                code: .matchAlreadyFinalized,
                status: 409,
                data: nil,
                retryAfter: nil
            ))],
            for: matchId
        )

        try await harness.finalization.finalize(matchId: matchId)

        XCTAssertEqual(harness.api.finalizationRequests.count, 1)
        XCTAssertEqual(harness.finalization.state.phase, .matchFinal)
        XCTAssertEqual(harness.finalization.state.lastServerCode, .matchAlreadyFinalized)
        let probe = try await harness.probes.probe(for: CoordinatorQueueFixtures.identity)
        XCTAssertNil(probe)
    }

    func testMatchAlreadyFinalizedFollowUpAuthenticationFailureInvalidatesAndReleasesGuard() async throws {
        let matchId = "finalize-already-final-auth-refresh"
        let harness = await makeHarness(matchId: matchId)
        harness.api.setFinalizationOutcomes(
            [.fail(.rejected(
                code: .matchAlreadyFinalized,
                status: 409,
                data: nil,
                retryAfter: nil
            ))],
            for: matchId
        )
        harness.api.setCurrentOutcomes(
            [
                .canonical,
                .fail(.server(code: .unauthorized, status: 401)),
            ],
            for: matchId
        )
        var invalidated = false
        harness.finalization.setAccessInvalidationHandler { invalidated = true }

        try await harness.finalization.finalize(matchId: matchId)

        XCTAssertTrue(invalidated)
        XCTAssertEqual(harness.finalization.state.phase, .blocked)
        XCTAssertEqual(harness.finalization.state.blocker, .authentication)
        XCTAssertEqual(harness.finalization.state.lastServerCode, .matchAlreadyFinalized)
        XCTAssertEqual(harness.api.finalizationRequests.count, 1)
        XCTAssertEqual(harness.api.scoringCurrentMatchIDs, [matchId, matchId])
        let probe = try await harness.probes.probe(for: CoordinatorQueueFixtures.identity)
        XCTAssertNil(probe, "A known rejected POST must not retain an outcome-unknown probe")

        let releasedGuard = try await harness.queue.acquireFinalizationGuard(matchId: matchId)
        try harness.queue.releaseFinalizationGuard(releasedGuard)
    }

    func testMatchAlreadyFinalizedFollowUpAuthorityFailureInvalidatesAndReleasesGuard() async throws {
        let matchId = "finalize-already-final-authority-refresh"
        let harness = await makeHarness(matchId: matchId)
        harness.api.setFinalizationOutcomes(
            [.fail(.rejected(
                code: .matchAlreadyFinalized,
                status: 409,
                data: nil,
                retryAfter: nil
            ))],
            for: matchId
        )
        harness.api.setCurrentOutcomes(
            [
                .canonical,
                .fail(.server(code: .participantNotFound, status: 403)),
            ],
            for: matchId
        )
        var invalidated = false
        harness.finalization.setAccessInvalidationHandler { invalidated = true }

        try await harness.finalization.finalize(matchId: matchId)

        XCTAssertTrue(invalidated)
        XCTAssertEqual(harness.finalization.state.phase, .blocked)
        XCTAssertEqual(harness.finalization.state.blocker, .authorization)
        XCTAssertEqual(harness.finalization.state.lastServerCode, .matchAlreadyFinalized)
        XCTAssertEqual(harness.api.finalizationRequests.count, 1)
        XCTAssertEqual(harness.api.scoringCurrentMatchIDs, [matchId, matchId])
        let probe = try await harness.probes.probe(for: CoordinatorQueueFixtures.identity)
        XCTAssertNil(probe, "A known rejected POST must not retain an outcome-unknown probe")

        let releasedGuard = try await harness.queue.acquireFinalizationGuard(matchId: matchId)
        try harness.queue.releaseFinalizationGuard(releasedGuard)
    }

    func testFinalizationNotReadyKnownRejectionRefreshesAndDoesNotRetry() async throws {
        let matchId = "finalize-not-ready"
        let harness = await makeHarness(matchId: matchId)
        harness.api.setFinalizationOutcomes(
            [.fail(.rejected(
                code: .finalizationNotReady,
                status: 409,
                data: nil,
                retryAfter: nil
            ))],
            for: matchId
        )

        try await harness.finalization.finalize(matchId: matchId)

        XCTAssertEqual(harness.api.finalizationRequests.count, 1)
        XCTAssertEqual(harness.finalization.state.phase, .blocked)
        XCTAssertEqual(harness.finalization.state.blocker, .notReady)
        XCTAssertEqual(harness.finalization.state.lastServerCode, .finalizationNotReady)
        let probe = try await harness.probes.probe(for: CoordinatorQueueFixtures.identity)
        XCTAssertNil(probe)
    }

    func testUnauthorizedRefreshesCredentialsOnceAndRetriesSameFinalizationIntent() async throws {
        let matchId = "finalize-auth-refresh"
        let harness = await makeHarness(matchId: matchId)
        harness.api.setFinalizationOutcomes(
            [
                .fail(.rejected(
                    code: .unauthorized,
                    status: 401,
                    data: nil,
                    retryAfter: nil
                )),
                .accept,
            ],
            for: matchId
        )

        try await harness.finalization.finalize(matchId: matchId)

        XCTAssertEqual(harness.credentials.refreshCalls, 1)
        XCTAssertEqual(harness.api.finalizationRequests.count, 2)
        XCTAssertEqual(
            harness.api.finalizationRequests.map(\.mutationId),
            Array(repeating: harness.api.finalizationRequests[0].mutationId, count: 2)
        )
        XCTAssertEqual(harness.finalization.state.phase, .matchFinal)
        let probe = try await harness.probes.probe(for: CoordinatorQueueFixtures.identity)
        XCTAssertNil(probe)
    }

    func testSecondUnauthorizedFailsAuthenticationClosedAndReleasesGuard() async throws {
        let matchId = "finalize-auth-refresh-exhausted"
        let harness = await makeHarness(matchId: matchId)
        harness.api.setFinalizationOutcomes(
            [
                .fail(.rejected(code: .unauthorized, status: 401, data: nil, retryAfter: nil)),
                .fail(.rejected(code: .invalidToken, status: 401, data: nil, retryAfter: nil)),
            ],
            for: matchId
        )
        var invalidated = false
        harness.finalization.setAccessInvalidationHandler { invalidated = true }

        try await harness.finalization.finalize(matchId: matchId)

        XCTAssertEqual(harness.credentials.refreshCalls, 1)
        XCTAssertEqual(harness.api.finalizationRequests.count, 2)
        XCTAssertEqual(
            Set(harness.api.finalizationRequests.map(\.mutationId)).count,
            1
        )
        XCTAssertEqual(harness.finalization.state.phase, .blocked)
        XCTAssertEqual(harness.finalization.state.blocker, .authentication)
        XCTAssertTrue(invalidated)
        let probe = try await harness.probes.probe(for: CoordinatorQueueFixtures.identity)
        XCTAssertNil(probe)

        let releasedGuard = try await harness.queue.acquireFinalizationGuard(matchId: matchId)
        try harness.queue.releaseFinalizationGuard(releasedGuard)
    }

    func testSignOutDuringCredentialRefreshCannotIssueSecondFinalizePOST() async throws {
        let matchId = "finalize-signout-auth-refresh"
        let harness = await makeHarness(matchId: matchId)
        harness.api.setFinalizationOutcomes(
            [
                .fail(.rejected(code: .unauthorized, status: 401, data: nil, retryAfter: nil)),
                .accept,
            ],
            for: matchId
        )
        harness.credentials.suspendNextRefresh()

        let finalizeTask = Task { @MainActor in
            try? await harness.finalization.finalize(matchId: matchId)
        }
        let refreshSuspended = await eventually {
            harness.credentials.hasSuspendedRefresh()
        }
        XCTAssertTrue(refreshSuspended)
        XCTAssertEqual(harness.api.finalizationRequests.count, 1)

        await harness.finalization.prepareForSignOut()
        harness.credentials.resumeSuspendedRefresh()
        await finalizeTask.value

        XCTAssertEqual(harness.api.finalizationRequests.count, 1)
        let probe = try await harness.probes.probe(for: CoordinatorQueueFixtures.identity)
        XCTAssertNil(probe)
    }

    func testEnvironmentSuspensionDuringCredentialRefreshCannotIssueSecondFinalizePOST() async throws {
        let matchId = "finalize-environment-auth-refresh"
        let harness = await makeHarness(matchId: matchId)
        harness.api.setFinalizationOutcomes(
            [
                .fail(.rejected(code: .unauthorized, status: 401, data: nil, retryAfter: nil)),
                .accept,
            ],
            for: matchId
        )
        harness.credentials.suspendNextRefresh()

        let finalizeTask = Task { @MainActor in
            try? await harness.finalization.finalize(matchId: matchId)
        }
        let refreshSuspended = await eventually {
            harness.credentials.hasSuspendedRefresh()
        }
        XCTAssertTrue(refreshSuspended)
        XCTAssertEqual(harness.api.finalizationRequests.count, 1)

        await harness.finalization.suspendForEnvironmentReattestation()
        harness.credentials.resumeSuspendedRefresh()
        await finalizeTask.value

        XCTAssertEqual(harness.api.finalizationRequests.count, 1)
        let probe = try await harness.probes.probe(for: CoordinatorQueueFixtures.identity)
        XCTAssertNil(probe)
    }

    func testSignOutAfterSecondFinalizePOSTCommitsRetainsProbeAndNeverSendsThird() async throws {
        let matchId = "finalize-signout-after-retry-commit"
        let harness = await makeHarness(matchId: matchId)
        harness.api.setFinalizationOutcomes(
            [
                .fail(.rejected(code: .unauthorized, status: 401, data: nil, retryAfter: nil)),
                .accept,
            ],
            for: matchId
        )
        harness.api.finalizationDelayNanoseconds = 5_000_000_000
        harness.api.finalizationResponseDelayAttempt = 2
        harness.api.finalizationCommitBeforeResponseDelayAttempt = 2

        let finalizeTask = Task { @MainActor in
            try? await harness.finalization.finalize(matchId: matchId)
        }
        let secondPOSTStarted = await eventually {
            harness.api.finalizationRequests.count == 2
        }
        XCTAssertTrue(secondPOSTStarted)

        await harness.finalization.prepareForSignOut()
        await finalizeTask.value

        XCTAssertEqual(harness.api.finalizationRequests.count, 2)
        let retainedProbe = try await harness.probes.probe(for: CoordinatorQueueFixtures.identity)
        XCTAssertEqual(retainedProbe?.phase, .outcomeUnknown)

        await harness.finalization.cancelSignOutPreparation()

        XCTAssertEqual(harness.finalization.state.phase, .matchFinal)
        XCTAssertEqual(harness.api.finalizationRequests.count, 2)
        let resolvedProbe = try await harness.probes.probe(for: CoordinatorQueueFixtures.identity)
        XCTAssertNil(resolvedProbe)
    }

    func testEnvironmentSuspensionAfterSecondFinalizePOSTCommitsUsesRefreshOnlyRecovery() async throws {
        let matchId = "finalize-environment-after-retry-commit"
        let harness = await makeHarness(matchId: matchId)
        harness.api.setFinalizationOutcomes(
            [
                .fail(.rejected(code: .unauthorized, status: 401, data: nil, retryAfter: nil)),
                .accept,
            ],
            for: matchId
        )
        harness.api.finalizationDelayNanoseconds = 5_000_000_000
        harness.api.finalizationResponseDelayAttempt = 2
        harness.api.finalizationCommitBeforeResponseDelayAttempt = 2

        let finalizeTask = Task { @MainActor in
            try? await harness.finalization.finalize(matchId: matchId)
        }
        let secondPOSTStarted = await eventually {
            harness.api.finalizationRequests.count == 2
        }
        XCTAssertTrue(secondPOSTStarted)

        await harness.finalization.suspendForEnvironmentReattestation()
        await finalizeTask.value

        XCTAssertEqual(harness.api.finalizationRequests.count, 2)
        let retainedProbe = try await harness.probes.probe(for: CoordinatorQueueFixtures.identity)
        XCTAssertEqual(retainedProbe?.phase, .outcomeUnknown)

        await harness.finalization.resumeAfterEnvironmentReattestation()

        XCTAssertEqual(harness.finalization.state.phase, .matchFinal)
        XCTAssertEqual(harness.api.finalizationRequests.count, 2)
        let resolvedProbe = try await harness.probes.probe(for: CoordinatorQueueFixtures.identity)
        XCTAssertNil(resolvedProbe)
    }

    func testMobileAPIUnavailableDuringInitialCanonicalPreflightRequestsAuthorityRevalidationOnly() async throws {
        let matchId = "finalize-mobile-unavailable-preflight"
        let harness = await makeHarness(matchId: matchId)
        harness.api.setCurrentOutcomes(
            [.fail(.server(code: .mobileAPIUnavailable, status: 503))],
            for: matchId
        )
        var authorityRevalidations = 0
        var accessInvalidations = 0
        harness.finalization.setAuthorityRevalidationHandler { authorityRevalidations += 1 }
        harness.finalization.setAccessInvalidationHandler { accessInvalidations += 1 }

        do {
            try await harness.finalization.finalize(matchId: matchId)
            XCTFail("Fail-closed mobile authority must prevent finalization")
        } catch {
            XCTAssertEqual(
                error as? ScoringFinalizationCoordinatorError,
                .canonicalUnavailable
            )
        }

        XCTAssertEqual(authorityRevalidations, 1)
        XCTAssertEqual(accessInvalidations, 0)
        XCTAssertEqual(harness.finalization.state.phase, .blocked)
        XCTAssertEqual(harness.finalization.state.blocker, .canonicalUnavailable)
        XCTAssertEqual(harness.api.scoringCurrentMatchIDs, [matchId])
        XCTAssertTrue(harness.api.finalizationRequests.isEmpty)
        let probe = try await harness.probes.probe(for: CoordinatorQueueFixtures.identity)
        XCTAssertNil(probe)
    }

    func testMobileAPIUnavailableDuringKnownRejectionFollowUpRequestsAuthorityRevalidationAndRemovesProbe() async throws {
        let matchId = "finalize-mobile-unavailable-known-follow-up"
        let harness = await makeHarness(matchId: matchId)
        harness.api.setFinalizationOutcomes(
            [.fail(.rejected(
                code: .matchAlreadyFinalized,
                status: 409,
                data: nil,
                retryAfter: nil
            ))],
            for: matchId
        )
        harness.api.setCurrentOutcomes(
            [
                .canonical,
                .fail(.server(code: .mobileAPIUnavailable, status: 503)),
            ],
            for: matchId
        )
        var authorityRevalidations = 0
        var accessInvalidations = 0
        harness.finalization.setAuthorityRevalidationHandler { authorityRevalidations += 1 }
        harness.finalization.setAccessInvalidationHandler { accessInvalidations += 1 }

        try await harness.finalization.finalize(matchId: matchId)

        XCTAssertEqual(authorityRevalidations, 1)
        XCTAssertEqual(accessInvalidations, 0)
        XCTAssertEqual(harness.finalization.state.phase, .blocked)
        XCTAssertEqual(harness.finalization.state.blocker, .canonicalUnavailable)
        XCTAssertEqual(harness.finalization.state.lastServerCode, .matchAlreadyFinalized)
        XCTAssertEqual(harness.api.scoringCurrentMatchIDs, [matchId, matchId])
        XCTAssertEqual(harness.api.finalizationRequests.count, 1)
        let probe = try await harness.probes.probe(for: CoordinatorQueueFixtures.identity)
        XCTAssertNil(probe, "A known rejected POST has no unknown outcome to retain")
    }

    func testMobileAPIUnavailableDuringUnknownProbeReconciliationRequestsAuthorityRevalidationAndRetainsProbe() async throws {
        let matchId = "finalize-mobile-unavailable-unknown-probe"
        let harness = await makeHarness(matchId: matchId)
        harness.api.setFinalizationOutcomes(
            [.fail(unknownOutcome())],
            for: matchId
        )
        harness.api.setCurrentOutcomes(
            [
                .canonical,
                .fail(.server(code: .mobileAPIUnavailable, status: 503)),
            ],
            for: matchId
        )
        var authorityRevalidations = 0
        var accessInvalidations = 0
        harness.finalization.setAuthorityRevalidationHandler { authorityRevalidations += 1 }
        harness.finalization.setAccessInvalidationHandler { accessInvalidations += 1 }

        try await harness.finalization.finalize(matchId: matchId)

        XCTAssertEqual(authorityRevalidations, 1)
        XCTAssertEqual(accessInvalidations, 0)
        XCTAssertEqual(harness.finalization.state.phase, .outcomeUnknown)
        XCTAssertEqual(harness.finalization.state.blocker, .canonicalUnavailable)
        XCTAssertEqual(harness.api.scoringCurrentMatchIDs, [matchId, matchId])
        XCTAssertEqual(harness.api.finalizationRequests.count, 1)
        let probe = try await harness.probes.probe(for: CoordinatorQueueFixtures.identity)
        XCTAssertEqual(probe?.phase, .outcomeUnknown)
    }

    func testMobileAPIUnavailableDuringAcknowledgedProbeReconciliationRequestsAuthorityRevalidationAndRetainsProbe() async throws {
        let matchId = "finalize-mobile-unavailable-acknowledged-probe"
        let harness = await makeHarness(matchId: matchId)
        harness.api.setFinalizationOutcomes(
            [.acceptWithoutCanonicalProjection],
            for: matchId
        )
        harness.api.setCurrentOutcomes(
            [
                .canonical,
                .fail(.server(code: .mobileAPIUnavailable, status: 503)),
            ],
            for: matchId
        )
        var authorityRevalidations = 0
        var accessInvalidations = 0
        harness.finalization.setAuthorityRevalidationHandler { authorityRevalidations += 1 }
        harness.finalization.setAccessInvalidationHandler { accessInvalidations += 1 }

        try await harness.finalization.finalize(matchId: matchId)

        XCTAssertEqual(authorityRevalidations, 1)
        XCTAssertEqual(accessInvalidations, 0)
        XCTAssertEqual(harness.finalization.state.phase, .acknowledgedRefreshPending)
        XCTAssertEqual(harness.finalization.state.blocker, .canonicalUnavailable)
        XCTAssertEqual(harness.api.scoringCurrentMatchIDs, [matchId, matchId])
        XCTAssertEqual(harness.api.finalizationRequests.count, 1)
        let probe = try await harness.probes.probe(for: CoordinatorQueueFixtures.identity)
        XCTAssertEqual(probe?.phase, .acknowledged)
    }

    func testMobileAPIUnavailableKnownPOSTRejectionRequestsAuthorityRevalidationOnlyAndRemovesProbe() async throws {
        let matchId = "finalize-mobile-unavailable-post-rejection"
        let harness = await makeHarness(matchId: matchId)
        harness.api.setFinalizationOutcomes(
            [.fail(.rejected(
                code: .mobileAPIUnavailable,
                status: 503,
                data: nil,
                retryAfter: nil
            ))],
            for: matchId
        )
        var authorityRevalidations = 0
        var accessInvalidations = 0
        harness.finalization.setAuthorityRevalidationHandler { authorityRevalidations += 1 }
        harness.finalization.setAccessInvalidationHandler { accessInvalidations += 1 }

        try await harness.finalization.finalize(matchId: matchId)

        XCTAssertEqual(authorityRevalidations, 1)
        XCTAssertEqual(accessInvalidations, 0)
        XCTAssertEqual(harness.finalization.state.phase, .blocked)
        XCTAssertEqual(harness.finalization.state.blocker, .canonicalUnavailable)
        XCTAssertEqual(harness.finalization.state.lastServerCode, .mobileAPIUnavailable)
        XCTAssertEqual(harness.api.scoringCurrentMatchIDs, [matchId])
        XCTAssertEqual(harness.api.finalizationRequests.count, 1)
        let probe = try await harness.probes.probe(for: CoordinatorQueueFixtures.identity)
        XCTAssertNil(probe, "A known fail-closed rejection proves the POST did not commit")
    }

    func testParticipantNotFoundDuringCanonicalPreflightInvalidatesWithoutProbeOrPOST() async throws {
        let matchId = "finalize-participant-preflight"
        let harness = await makeHarness(matchId: matchId)
        harness.api.setCurrentOutcomes(
            [.fail(.server(code: .participantNotFound, status: 403))],
            for: matchId
        )
        var invalidated = false
        harness.finalization.setAccessInvalidationHandler { invalidated = true }

        do {
            try await harness.finalization.finalize(matchId: matchId)
            XCTFail("A participant-bound canonical preflight must fail closed")
        } catch {
            XCTAssertEqual(
                error as? ScoringFinalizationCoordinatorError,
                .canonicalUnavailable
            )
        }

        XCTAssertTrue(invalidated)
        XCTAssertEqual(harness.finalization.state.phase, .blocked)
        XCTAssertEqual(harness.finalization.state.blocker, .authorization)
        XCTAssertEqual(harness.api.scoringCurrentMatchIDs, [matchId])
        XCTAssertTrue(harness.api.finalizationRequests.isEmpty)
        let probe = try await harness.probes.probe(for: CoordinatorQueueFixtures.identity)
        XCTAssertNil(probe)

        let releasedGuard = try await harness.queue.acquireFinalizationGuard(matchId: matchId)
        try harness.queue.releaseFinalizationGuard(releasedGuard)
    }

    func testParticipantNotFoundFromFinalizePOSTInvalidatesAndRemovesKnownRejectedProbe() async throws {
        let matchId = "finalize-participant-post"
        let harness = await makeHarness(matchId: matchId)
        harness.api.setFinalizationOutcomes(
            [.fail(.rejected(
                code: .participantNotFound,
                status: 403,
                data: nil,
                retryAfter: nil
            ))],
            for: matchId
        )
        var invalidated = false
        harness.finalization.setAccessInvalidationHandler { invalidated = true }

        try await harness.finalization.finalize(matchId: matchId)

        XCTAssertTrue(invalidated)
        XCTAssertEqual(harness.finalization.state.phase, .blocked)
        XCTAssertEqual(harness.finalization.state.blocker, .authorization)
        XCTAssertEqual(harness.finalization.state.lastServerCode, .participantNotFound)
        XCTAssertEqual(harness.api.scoringCurrentMatchIDs, [matchId])
        XCTAssertEqual(harness.api.finalizationRequests.count, 1)
        let probe = try await harness.probes.probe(for: CoordinatorQueueFixtures.identity)
        XCTAssertNil(probe)

        let releasedGuard = try await harness.queue.acquireFinalizationGuard(matchId: matchId)
        try harness.queue.releaseFinalizationGuard(releasedGuard)
    }

    func testSignOutDuringDelayedCanonicalPreflightCannotCreateProbeOrPOSTOrReleaseNewGuard() async throws {
        let matchId = "finalize-signout-canonical-preflight"
        let harness = await makeHarness(matchId: matchId)
        harness.api.suspendNextCurrent(for: matchId)

        let finalizeTask = Task { @MainActor () -> ScoringFinalizationCoordinatorError? in
            do {
                try await harness.finalization.finalize(matchId: matchId)
                return nil
            } catch {
                return error as? ScoringFinalizationCoordinatorError
            }
        }
        let readSuspended = await eventually {
            harness.api.hasSuspendedCurrent(for: matchId)
        }
        XCTAssertTrue(readSuspended)

        await harness.finalization.prepareForSignOut()
        let replacementGuard = try await harness.queue.acquireFinalizationGuard(matchId: matchId)
        harness.api.resumeSuspendedCurrent(for: matchId)

        let finalizationError = await finalizeTask.value
        XCTAssertEqual(finalizationError, .inactiveIdentity)
        XCTAssertTrue(harness.api.finalizationRequests.isEmpty)
        let probe = try await harness.probes.probe(for: CoordinatorQueueFixtures.identity)
        XCTAssertNil(probe)
        try harness.queue.releaseFinalizationGuard(replacementGuard)
    }

    func testEnvironmentSuspensionDuringDelayedUnknownProbeRefreshRetainsProbeAndRecoversFinalWithoutSecondPOST() async throws {
        let matchId = "finalize-environment-canonical-recovery"
        let harness = await makeHarness(matchId: matchId)
        harness.api.setFinalizationOutcomes(
            [.commitThenFail(unknownOutcome())],
            for: matchId
        )
        harness.api.setCurrentOutcomes(
            [.canonical, .fail(.transportUnavailable)],
            for: matchId
        )

        try await harness.finalization.finalize(matchId: matchId)
        XCTAssertEqual(harness.finalization.state.phase, .outcomeUnknown)
        XCTAssertEqual(harness.api.finalizationRequests.count, 1)
        let initialProbe = try await harness.probes.probe(for: CoordinatorQueueFixtures.identity)
        XCTAssertEqual(initialProbe?.phase, .outcomeUnknown)

        harness.api.suspendNextCurrent(for: matchId)
        let refreshTask = Task { @MainActor in
            await harness.finalization.refreshUnknownOutcome()
        }
        let readSuspended = await eventually {
            harness.api.hasSuspendedCurrent(for: matchId)
        }
        XCTAssertTrue(readSuspended)

        await harness.finalization.suspendForEnvironmentReattestation()
        let replacementGuard = try await harness.queue.acquireFinalizationGuard(matchId: matchId)
        harness.api.resumeSuspendedCurrent(for: matchId)
        await refreshTask.value

        XCTAssertEqual(harness.api.finalizationRequests.count, 1)
        let retainedProbe = try await harness.probes.probe(for: CoordinatorQueueFixtures.identity)
        XCTAssertEqual(
            retainedProbe?.phase,
            .outcomeUnknown,
            "A stale canonical response must not remove the durable unknown-outcome probe"
        )
        try harness.queue.releaseFinalizationGuard(replacementGuard)

        await harness.finalization.resumeAfterEnvironmentReattestation()

        XCTAssertEqual(harness.finalization.state.phase, .matchFinal)
        XCTAssertEqual(harness.api.finalizationRequests.count, 1)
        let resolvedProbe = try await harness.probes.probe(for: CoordinatorQueueFixtures.identity)
        XCTAssertNil(resolvedProbe)
    }

    func testAccountSwitchDuringDelayedAcknowledgedProbeRefreshCannotPublishOrReleaseNewIdentityGuard() async throws {
        let matchId = "finalize-account-switch-canonical-recovery"
        let harness = await makeHarness(matchId: matchId)
        harness.api.setFinalizationOutcomes(
            [.acceptWithoutCanonicalProjection],
            for: matchId
        )

        try await harness.finalization.finalize(matchId: matchId)
        XCTAssertEqual(harness.finalization.state.phase, .acknowledgedRefreshPending)
        let initialProbe = try await harness.probes.probe(for: CoordinatorQueueFixtures.identity)
        XCTAssertEqual(initialProbe?.phase, .acknowledged)

        let originalPartition = CoordinatorQueueFixtures.partition(matchId: matchId)
        harness.api.configureCanonical(
            for: originalPartition,
            matchRevision: 13,
            permissionRevision: 5,
            scores: completeOfficialScores(),
            status: .completed,
            canScore: false,
            readOnly: true,
            canFinalize: false
        )
        harness.api.suspendNextCurrent(for: matchId)
        let refreshTask = Task { @MainActor in
            await harness.finalization.refreshUnknownOutcome()
        }
        let readSuspended = await eventually {
            harness.api.hasSuspendedCurrent(for: matchId)
        }
        XCTAssertTrue(readSuspended)

        let otherIdentity = ScoringQueueIdentityPartition(
            authUserId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            playerId: "P2",
            tournamentId: "2026"
        )
        await harness.finalization.activate(identity: otherIdentity)
        await harness.queue.deactivate()
        await harness.queue.activate(identity: otherIdentity)
        let otherIdentityGuard = try await harness.queue.acquireFinalizationGuard(matchId: matchId)

        harness.api.resumeSuspendedCurrent(for: matchId)
        await refreshTask.value

        XCTAssertEqual(harness.finalization.state, .idle)
        XCTAssertEqual(harness.api.finalizationRequests.count, 1)
        let switchedProbe = try await harness.probes.probe(for: CoordinatorQueueFixtures.identity)
        XCTAssertEqual(
            switchedProbe?.phase,
            .acknowledged,
            "The old identity's accepted probe must survive a stale canonical response"
        )
        try harness.queue.releaseFinalizationGuard(otherIdentityGuard)

        await harness.finalization.deactivate()
        await harness.queue.deactivate()
        await harness.queue.activate(identity: CoordinatorQueueFixtures.identity)
        await harness.finalization.activate(identity: CoordinatorQueueFixtures.identity)

        XCTAssertEqual(harness.finalization.state.phase, .matchFinal)
        XCTAssertEqual(harness.api.finalizationRequests.count, 1)
        let resolvedProbe = try await harness.probes.probe(for: CoordinatorQueueFixtures.identity)
        XCTAssertNil(resolvedProbe)
    }

    func testUnknownProbeManualRefreshConfirmsCanonicalFinalWithoutSecondPOST() async throws {
        let matchId = "finalize-unknown-manual-refresh"
        let harness = await makeHarness(matchId: matchId)
        harness.api.setFinalizationOutcomes(
            [.commitThenFail(unknownOutcome())],
            for: matchId
        )
        harness.api.setCurrentOutcomes(
            [.canonical, .fail(.transportUnavailable)],
            for: matchId
        )

        try await harness.finalization.finalize(matchId: matchId)
        XCTAssertEqual(harness.finalization.state.phase, .outcomeUnknown)
        XCTAssertEqual(harness.api.finalizationRequests.count, 1)

        await harness.finalization.refreshUnknownOutcome()

        XCTAssertEqual(harness.finalization.state.phase, .matchFinal)
        XCTAssertEqual(harness.api.finalizationRequests.count, 1)
        let probe = try await harness.probes.probe(for: CoordinatorQueueFixtures.identity)
        XCTAssertNil(probe)
    }

    func testUnknownProbeAuthenticationFailureInvalidatesAccessRetainsProbeAndReleasesGuard() async throws {
        let matchId = "finalize-unknown-probe-auth"
        let harness = await makeHarness(matchId: matchId)
        harness.api.setFinalizationOutcomes(
            [.fail(unknownOutcome())],
            for: matchId
        )
        harness.api.setCurrentOutcomes(
            [.canonical, .fail(.transportUnavailable)],
            for: matchId
        )
        var invalidated = false
        harness.finalization.setAccessInvalidationHandler { invalidated = true }

        try await harness.finalization.finalize(matchId: matchId)
        harness.api.setCurrentOutcomes(
            [.fail(.server(code: .unauthorized, status: 401))],
            for: matchId
        )

        await harness.finalization.refreshUnknownOutcome()

        XCTAssertTrue(invalidated)
        XCTAssertEqual(harness.finalization.state.phase, .outcomeUnknown)
        XCTAssertEqual(harness.finalization.state.blocker, .authentication)
        XCTAssertEqual(harness.api.finalizationRequests.count, 1)
        let retainedProbe = try await harness.probes.probe(for: CoordinatorQueueFixtures.identity)
        XCTAssertEqual(retainedProbe?.phase, .outcomeUnknown)
        let releasedGuard = try await harness.queue.acquireFinalizationGuard(matchId: matchId)
        try harness.queue.releaseFinalizationGuard(releasedGuard)
    }

    func testAcknowledgedProbeAuthenticationFailureInvalidatesAccessRetainsRefreshOnlyProbe() async throws {
        let matchId = "finalize-acknowledged-probe-auth"
        let harness = await makeHarness(matchId: matchId)
        harness.api.setFinalizationOutcomes(
            [.acceptWithoutCanonicalProjection],
            for: matchId
        )
        var invalidated = false
        harness.finalization.setAccessInvalidationHandler { invalidated = true }

        try await harness.finalization.finalize(matchId: matchId)
        XCTAssertEqual(harness.finalization.state.phase, .acknowledgedRefreshPending)
        harness.api.setCurrentOutcomes(
            [.fail(.server(code: .unauthorized, status: 401))],
            for: matchId
        )

        await harness.finalization.refreshUnknownOutcome()

        XCTAssertTrue(invalidated)
        XCTAssertEqual(harness.finalization.state.phase, .acknowledgedRefreshPending)
        XCTAssertEqual(harness.finalization.state.blocker, .authentication)
        XCTAssertEqual(harness.api.finalizationRequests.count, 1)
        let retainedProbe = try await harness.probes.probe(for: CoordinatorQueueFixtures.identity)
        XCTAssertEqual(retainedProbe?.phase, .acknowledged)
        let releasedGuard = try await harness.queue.acquireFinalizationGuard(matchId: matchId)
        try harness.queue.releaseFinalizationGuard(releasedGuard)
    }

    func testCanonicalFinalPresentationDoesNotHideUnresolvedFinalizationRecoveryPhase() async throws {
        let matchId = "finalize-ui-priority"
        let harness = await makeHarness(matchId: matchId)
        let partition = CoordinatorQueueFixtures.partition(matchId: matchId)
        harness.api.configureCanonical(
            for: partition,
            matchRevision: 13,
            permissionRevision: 5,
            scores: completeOfficialScores(),
            status: .completed,
            canScore: false,
            readOnly: true,
            canFinalize: false
        )
        let response = try await harness.api.scoringCurrent(
            accessToken: "test-access",
            certification: "test-certification",
            matchID: matchId
        )
        let presentation = ScoringPresenter.make(state: ScoringCurrentState(
            scoring: response.data.scoring,
            generatedAt: response.meta.generatedAt,
            phase: .ready,
            isRefreshing: false,
            lastSafeError: nil,
            lastServerCode: nil,
            lastHTTPStatus: 200
        ))

        let acknowledged = ScoringFinalizationUIModel.make(
            presentation: presentation,
            queueState: .inactive,
            coordinatorState: ScoringFinalizationState(
                phase: .acknowledgedRefreshPending,
                matchId: matchId,
                blocker: .canonicalUnavailable,
                lastServerCode: nil
            )
        )
        XCTAssertEqual(acknowledged.phase, .acknowledgedRefreshPending)
        XCTAssertFalse(acknowledged.canRequestFinalization)

        let unknown = ScoringFinalizationUIModel.make(
            presentation: presentation,
            queueState: .inactive,
            coordinatorState: ScoringFinalizationState(
                phase: .outcomeUnknown,
                matchId: matchId,
                blocker: .canonicalUnavailable,
                lastServerCode: nil
            )
        )
        XCTAssertEqual(unknown.phase, .outcomeUnknown)
        XCTAssertFalse(unknown.canRequestFinalization)
    }

    private struct Harness {
        let repository: InMemoryScoringQueueRepository
        let api: CoordinatorQueueAPI
        let credentials: CoordinatorQueueCredentials
        let queue: ScoringQueueCoordinator
        let probes: InMemoryScoringFinalizationProbeStore
        let finalization: ScoringFinalizationCoordinator
    }

    private func makeHarness(
        matchId: String,
        records: [ScoringQueueRecord] = [],
        liveMutationSendingEnabled: Bool = true,
        applicationActivity: NativeApplicationActivity = NativeApplicationActivity(isActive: true),
        beforeFinalizationTransport: @escaping @MainActor @Sendable () async -> Void = {}
    ) async -> Harness {
        let repository = InMemoryScoringQueueRepository(records: records)
        let api = CoordinatorQueueAPI()
        let credentials = CoordinatorQueueCredentials()
        let queue = makeQueue(
            repository: repository,
            api: api,
            credentials: credentials,
            applicationActivity: applicationActivity
        )
        let partition = CoordinatorQueueFixtures.partition(matchId: matchId)
        api.configureCanonical(
            for: partition,
            scores: completeOfficialScores(),
            status: .inProgress,
            canScore: true,
            readOnly: false,
            canFinalize: true
        )
        await queue.activate(identity: CoordinatorQueueFixtures.identity)
        let probes = InMemoryScoringFinalizationProbeStore()
        let finalization = ScoringFinalizationCoordinator(
            api: api,
            credentialProvider: credentials,
            queue: queue,
            probeStore: probes,
            applicationActivity: applicationActivity,
            liveMutationSendingEnabled: liveMutationSendingEnabled,
            now: { CoordinatorQueueFixtures.now },
            beforeFinalizationTransport: beforeFinalizationTransport
        )
        await finalization.activate(identity: CoordinatorQueueFixtures.identity)
        return Harness(
            repository: repository,
            api: api,
            credentials: credentials,
            queue: queue,
            probes: probes,
            finalization: finalization
        )
    }

    private func makeQueue(
        repository: InMemoryScoringQueueRepository,
        api: CoordinatorQueueAPI,
        credentials: CoordinatorQueueCredentials,
        applicationActivity: NativeApplicationActivity = NativeApplicationActivity(isActive: true)
    ) -> ScoringQueueCoordinator {
        ScoringQueueCoordinator(
            repository: repository,
            api: api,
            credentialProvider: credentials,
            applicationActivity: applicationActivity,
            maximumWorkers: 2,
            processId: "finalization-tests",
            now: { CoordinatorQueueFixtures.now },
            jitter: { 0 }
        )
    }

    private func completeOfficialScores() -> [MobileScoringHoleScore] {
        (1...18).map { holeNumber in
            CoordinatorQueueFixtures.score(
                holeNumber: holeNumber,
                revision: 1,
                gross: ScoringQueueGross(
                    teamOne: [7, 7],
                    teamTwo: [8, 8]
                )
            )
        }
    }

    private func finalizationProbe(
        matchId: String,
        phase: ScoringFinalizationProbePhase
    ) -> ScoringFinalizationProbe {
        ScoringFinalizationProbe(
            id: "90000000-0000-4000-8000-000000000001",
            identity: CoordinatorQueueFixtures.identity,
            matchId: matchId,
            mutationId: "90000000-0000-4000-8000-000000000002",
            expectedMatchRevision: 12,
            acknowledgedMatchRevision: phase == .acknowledged ? 13 : nil,
            phase: phase,
            createdAt: CoordinatorQueueFixtures.now
        )
    }

    private func blockingRecord(
        matchId: String,
        sequence: Int64,
        state: ScoringQueueState
    ) -> ScoringQueueRecord {
        var record = CoordinatorQueueFixtures.record(
            matchId: matchId,
            sequence: sequence,
            state: state,
            reason: state == .conflict ? .revision :
                state == .actionRequired ? .authorization :
                state == .quarantined ? .idempotencyConflict : nil,
            attempt: attempt(for: state),
            acknowledgement: acknowledgement(for: state),
            conflict: conflict(for: state)
        )
        if state == .quarantined {
            record.quarantineReason = .idempotencyConflict
        }
        return record
    }

    private func attempt(for state: ScoringQueueState) -> ScoringQueueAttempt {
        switch state {
        case .syncing:
            ScoringQueueAttempt(
                count: 1,
                lastAttemptAt: CoordinatorQueueFixtures.now,
                nextRetryAt: nil,
                everSubmitted: true,
                outcomeCertainty: .unknown,
                syncLeaseId: "lease",
                syncLeaseStartedAt: CoordinatorQueueFixtures.now,
                lastHttpStatus: nil,
                lastErrorCode: nil
            )
        case .retryable:
            ScoringQueueAttempt(
                count: 1,
                lastAttemptAt: CoordinatorQueueFixtures.now,
                nextRetryAt: CoordinatorQueueFixtures.now.addingTimeInterval(60),
                everSubmitted: true,
                outcomeCertainty: .unknown,
                syncLeaseId: nil,
                syncLeaseStartedAt: nil,
                lastHttpStatus: nil,
                lastErrorCode: nil
            )
        case .acknowledged:
            ScoringQueueAttempt(
                count: 1,
                lastAttemptAt: CoordinatorQueueFixtures.now,
                nextRetryAt: nil,
                everSubmitted: true,
                outcomeCertainty: .knownAccepted,
                syncLeaseId: nil,
                syncLeaseStartedAt: nil,
                lastHttpStatus: 200,
                lastErrorCode: nil
            )
        default:
            .unattempted
        }
    }

    private func acknowledgement(for state: ScoringQueueState) -> ScoringQueueAcknowledgement? {
        guard state == .acknowledged else { return nil }
        return ScoringQueueAcknowledgement(
            accepted: true,
            idempotent: false,
            semanticNoop: false,
            canonicalMatchRevision: 12,
            canonicalHoleRevision: 1,
            responseAt: CoordinatorQueueFixtures.now,
            refreshPending: true
        )
    }

    private func conflict(for state: ScoringQueueState) -> ScoringQueueConflict? {
        guard state == .conflict else { return nil }
        return ScoringQueueConflict(
            officialGross: ScoringQueueGross(
                teamOne: [7, 7],
                teamTwo: [8, 8]
            ),
            currentMatchRevision: 12,
            currentHoleRevision: 1,
            currentPermissionRevision: 4,
            refreshRequired: false,
            recordedAt: CoordinatorQueueFixtures.now
        )
    }

    private func unknownOutcome() -> MobileScoringFinalizationError {
        .unknownOutcome(
            reason: .transport,
            code: nil,
            status: nil,
            data: nil,
            retryAfter: nil
        )
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
}

@MainActor
private final class FinalizationTransportStartGate {
    private let suspendingAttempt: Int
    private var attempt = 0
    private var continuation: CheckedContinuation<Void, Never>?

    init(suspendingAttempt: Int) {
        self.suspendingAttempt = suspendingAttempt
    }

    var isSuspended: Bool { continuation != nil }

    func waitBeforeTransport() async {
        attempt += 1
        guard attempt == suspendingAttempt else { return }
        await withCheckedContinuation { continuation in
            self.continuation = continuation
        }
    }

    func resume() {
        continuation?.resume()
        continuation = nil
    }
}

private actor InMemoryScoringFinalizationProbeStore: ScoringFinalizationProbeStoring {
    private var probesByIdentity: [ScoringQueueIdentityPartition: ScoringFinalizationProbe] = [:]
    private var identitiesSuspendingNextProbe: Set<ScoringQueueIdentityPartition> = []
    private var suspendedProbeContinuations: [
        ScoringQueueIdentityPartition: CheckedContinuation<Void, Never>
    ] = [:]
    private var shouldFailNextRemoval = false

    func probe(
        for identity: ScoringQueueIdentityPartition
    ) async throws -> ScoringFinalizationProbe? {
        if identitiesSuspendingNextProbe.remove(identity) != nil {
            await withCheckedContinuation { continuation in
                suspendedProbeContinuations[identity] = continuation
            }
        }
        return probesByIdentity[identity]
    }

    func suspendNextProbe(for identity: ScoringQueueIdentityPartition) {
        identitiesSuspendingNextProbe.insert(identity)
    }

    func hasSuspendedProbe(for identity: ScoringQueueIdentityPartition) -> Bool {
        suspendedProbeContinuations[identity] != nil
    }

    func resumeSuspendedProbe(for identity: ScoringQueueIdentityPartition) {
        suspendedProbeContinuations.removeValue(forKey: identity)?.resume()
    }

    func failNextRemoval() {
        shouldFailNextRemoval = true
    }

    func save(_ probe: ScoringFinalizationProbe) throws {
        guard probe.isStructurallyCompatible else {
            throw ScoringFinalizationProbeStoreError.invalidProbe
        }
        if let existing = probesByIdentity[probe.identity], existing.id != probe.id {
            throw ScoringFinalizationProbeStoreError.unresolvedProbeExists
        }
        probesByIdentity[probe.identity] = probe
    }

    func remove(probeId: String) throws {
        if shouldFailNextRemoval {
            shouldFailNextRemoval = false
            throw ScoringFinalizationProbeStoreError.corruptStore
        }
        guard let entry = probesByIdentity.first(where: { $0.value.id == probeId }) else {
            return
        }
        probesByIdentity.removeValue(forKey: entry.key)
    }
}
