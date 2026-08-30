#if DEBUG
import Combine
import Foundation
import SwiftUI

/// Step 2G UI-only scenarios. These fixtures never construct MobileAPIClient,
/// an auth owner, or a replay worker. Their callbacks mutate deterministic
/// in-memory state so conflict and finalization UX can be exercised without a
/// Preview request or an official score mutation.
enum ScoringWorkflowUITestScenario: Equatable {
    case conflictReview
    case correctionPending
    case finalizationReady
    case finalizationUnknown

    static func resolve(
        arguments: [String] = ProcessInfo.processInfo.arguments
    ) -> Self? {
        guard case .scenario(let scenario) = TodayUITestLaunch.resolve(arguments: arguments) else {
            return nil
        }
        switch scenario {
        case .scoreConflictReview: return .conflictReview
        case .scoreCorrectionPending: return .correctionPending
        case .scoreFinalizationReady: return .finalizationReady
        case .scoreFinalizationUnknown: return .finalizationUnknown
        default: return nil
        }
    }
}

@MainActor
final class ScoringWorkflowUITestModel: ObservableObject {
    @Published private(set) var scoringState: ScoringCurrentState
    @Published private(set) var queueState: ScoringQueueCoordinatorState
    @Published private(set) var finalizationState: ScoringFinalizationState

    private let scenario: ScoringWorkflowUITestScenario

    init(
        scoringState: ScoringCurrentState,
        scenario: ScoringWorkflowUITestScenario
    ) {
        self.scoringState = scoringState
        self.scenario = scenario
        switch scenario {
        case .conflictReview:
            queueState = Self.queueState(record: Self.conflictRecord())
            finalizationState = .idle
        case .correctionPending:
            queueState = Self.queueState(record: Self.correctionRecord())
            finalizationState = .idle
        case .finalizationReady:
            queueState = .inactive
            finalizationState = .idle
        case .finalizationUnknown:
            queueState = .inactive
            finalizationState = ScoringFinalizationState(
                phase: .outcomeUnknown,
                matchId: Self.matchID,
                blocker: nil,
                lastServerCode: nil
            )
        }
    }

    func keepOfficial(recordID: String) async throws {
        guard scenario == .conflictReview,
              let index = queueState.records.firstIndex(where: {
                  $0.localQueueRecordId == recordID && $0.state == .conflict
              })
        else { throw ScoringQueueCoordinatorError.notReviewable }

        var record = queueState.records[index]
        record.state = .resolved
        record.stateReasonCode = nil
        record.resolution = ScoringQueueResolution(
            reason: .keptOfficial,
            resolvedAt: Self.now,
            relatedLocalQueueRecordId: nil
        )
        record.updatedAt = Self.now
        queueState.records[index] = record
    }

    func reapply(recordID: String) async throws {
        guard scenario == .conflictReview,
              let index = queueState.records.firstIndex(where: {
                  $0.localQueueRecordId == recordID && $0.state == .conflict
              })
        else { throw ScoringQueueCoordinatorError.notReviewable }

        let conflict = queueState.records[index]
        let replacementID = "fixture-reapplied-record"
        var resolved = conflict
        resolved.state = .resolved
        resolved.stateReasonCode = nil
        resolved.resolution = ScoringQueueResolution(
            reason: .reappliedAsNewMutation,
            resolvedAt: Self.now,
            relatedLocalQueueRecordId: replacementID
        )
        resolved.updatedAt = Self.now

        let replacement = ScoringQueueRecord(
            localQueueRecordId: replacementID,
            mutationId: "fixture-reapplied-mutation",
            partition: conflict.partition,
            intent: conflict.intent,
            base: ScoringQueueBase(
                expectedMatchRevision: 17,
                expectedHoleRevision: 7,
                snapshotId: "fixture-snapshot-v1",
                snapshotRevision: 9,
                scoringFormat: .bestBall,
                sideSlotCount: 2,
                officialGrossAtSave: Self.officialGross
            ),
            sequence: conflict.sequence + 1,
            lastKnownServer: Self.lastKnownServer,
            originatingAppBuild: "ui-test",
            createdAt: Self.now
        )
        queueState.records[index] = resolved
        queueState.records.append(replacement)
    }

    func finalize(matchID: String) async throws {
        guard scenario == .finalizationReady,
              matchID == Self.matchID
        else { throw ScoringFinalizationCoordinatorError.notReady }

        finalizationState = ScoringFinalizationState(
            phase: .submitting,
            matchId: matchID,
            blocker: nil,
            lastServerCode: nil
        )
        await Task.yield()
        publishCanonicalFinalState()
    }

    func refreshUnknownFinalization() async {
        guard scenario == .finalizationUnknown else { return }
        finalizationState = ScoringFinalizationState(
            phase: .reconciling,
            matchId: Self.matchID,
            blocker: nil,
            lastServerCode: nil
        )
        await Task.yield()
        publishCanonicalFinalState()
    }

    private func publishCanonicalFinalState() {
        scoringState = ScoringUITestFixtures.finalizedWorkflowState()
        finalizationState = ScoringFinalizationState(
            phase: .matchFinal,
            matchId: Self.matchID,
            blocker: nil,
            lastServerCode: nil
        )
    }

    private static let matchID = "fixture-scoring-match"
    private static let now = Date(timeIntervalSince1970: 1_800_000_000)
    private static let partition = ScoringQueuePartition(
        authUserId: "11111111-1111-4111-8111-111111111111",
        playerId: "fixture-player-a",
        tournamentId: "fixture-tournament",
        matchId: matchID
    )
    private static let officialGross = ScoringQueueGross(
        teamOne: [4, 5],
        teamTwo: [5, 4]
    )
    private static let localGross = ScoringQueueGross(
        teamOne: [6, 5],
        teamTwo: [5, 4]
    )
    private static let lastKnownServer = ScoringQueueLastKnownServer(
        matchRevision: 17,
        holeRevision: 7,
        permissionRevision: 4,
        refreshedAt: now
    )

    private static func queueState(record: ScoringQueueRecord) -> ScoringQueueCoordinatorState {
        var state = ScoringQueueCoordinatorState.inactive
        state.records = [record]
        return state
    }

    private static func conflictRecord() -> ScoringQueueRecord {
        queueRecord(
            localQueueRecordId: "fixture-conflict-record",
            mutationId: "fixture-conflict-mutation",
            state: .conflict,
            stateReasonCode: .revision,
            conflict: ScoringQueueConflict(
                officialGross: officialGross,
                currentMatchRevision: 17,
                currentHoleRevision: 7,
                currentPermissionRevision: 4,
                refreshRequired: false,
                recordedAt: now
            )
        )
    }

    private static func correctionRecord() -> ScoringQueueRecord {
        queueRecord(
            localQueueRecordId: "fixture-correction-record",
            mutationId: "fixture-correction-mutation",
            state: .queued,
            stateReasonCode: nil,
            conflict: nil
        )
    }

    private static func queueRecord(
        localQueueRecordId: String,
        mutationId: String,
        state: ScoringQueueState,
        stateReasonCode: ScoringQueueStateReasonCode?,
        conflict: ScoringQueueConflict?
    ) -> ScoringQueueRecord {
        ScoringQueueRecord(
            localQueueRecordId: localQueueRecordId,
            mutationId: mutationId,
            partition: partition,
            intent: ScoringQueueIntent(
                holeNumber: 7,
                teamOneGrossScores: localGross.teamOne,
                teamTwoGrossScores: localGross.teamTwo
            ),
            base: ScoringQueueBase(
                expectedMatchRevision: 16,
                expectedHoleRevision: 6,
                snapshotId: "fixture-snapshot-v1",
                snapshotRevision: 9,
                scoringFormat: .bestBall,
                sideSlotCount: 2,
                officialGrossAtSave: officialGross
            ),
            sequence: 1,
            state: state,
            stateReasonCode: stateReasonCode,
            lastKnownServer: lastKnownServer,
            conflict: conflict,
            originatingAppBuild: "ui-test",
            createdAt: now
        )
    }
}

struct ScoringWorkflowUITestFixtureView: View {
    @StateObject private var model: ScoringWorkflowUITestModel

    init(
        state: ScoringCurrentState,
        scenario: ScoringWorkflowUITestScenario
    ) {
        _model = StateObject(
            wrappedValue: ScoringWorkflowUITestModel(
                scoringState: state,
                scenario: scenario
            )
        )
    }

    var body: some View {
        ScoreScreen(
            presentation: ScoringPresenter.make(state: model.scoringState),
            queueState: model.queueState,
            finalizationState: model.finalizationState,
            // This enables only the confirmation presentation in this DEBUG
            // fixture. The callback below has no API client or transport.
            liveFinalizationSendingEnabled: true,
            onRefresh: {},
            onSave: { _ in throw ScoringQueueCoordinatorError.liveMutationDisabled },
            onKeepOfficial: { try await model.keepOfficial(recordID: $0) },
            onReapplyMyScore: { try await model.reapply(recordID: $0) },
            onFinalize: { try await model.finalize(matchID: $0) },
            onRefreshFinalizationOutcome: { await model.refreshUnknownFinalization() }
        )
    }
}
#endif
