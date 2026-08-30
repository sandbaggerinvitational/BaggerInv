import SwiftUI

struct ScoreRepositoryView: View {
    @ObservedObject private var store: ScoringCurrentStore
    private let reliability: ScoringQueueCoordinator?
    private let finalization: ScoringFinalizationCoordinator?

    init(
        store: ScoringCurrentStore,
        reliability: ScoringQueueCoordinator?,
        finalization: ScoringFinalizationCoordinator? = nil
    ) {
        _store = ObservedObject(wrappedValue: store)
        self.reliability = reliability
        self.finalization = finalization
    }

    @ViewBuilder
    var body: some View {
        if let reliability, let finalization {
            OfficialScoreRepositoryView(
                store: store,
                reliability: reliability,
                finalization: finalization
            )
        } else if let reliability {
            QueueBackedScoreRepositoryView(store: store, reliability: reliability)
        } else {
            ScoreScreen(
                presentation: ScoringPresenter.make(state: store.state),
                queueState: .inactive,
                onRefresh: { await store.refresh() },
                onSave: { _ in throw ScoringQueueCoordinatorError.inactiveIdentity }
            )
        }
    }
}

private struct QueueBackedScoreRepositoryView: View {
    @ObservedObject var store: ScoringCurrentStore
    @ObservedObject var reliability: ScoringQueueCoordinator

    var body: some View {
        ScoreScreen(
            presentation: ScoringPresenter.make(state: store.state),
            queueState: reliability.state,
            liveHoleMutationSendingEnabled: reliability.liveMutationSendingEnabled,
            onRefresh: {
                await store.refresh()
                reliability.markNetworkUnavailable(store.state.isOrientationOnly)
            },
            onSave: { draft in
                try await reliability.save(
                    draft: draft,
                    presentation: ScoringPresenter.make(state: store.state)
                )
            },
            onManualRetry: { recordID in
                try await reliability.manualRetry(recordId: recordID)
            },
            onKeepOfficial: { recordID in
                try await reliability.keepOfficial(recordId: recordID)
            },
            onReapplyMyScore: { recordID in
                try await reliability.reapplyMyScore(recordId: recordID)
            }
        )
        .onChange(of: store.state.phase) { _ in
            reliability.markNetworkUnavailable(store.state.isOrientationOnly)
        }
    }
}

private struct OfficialScoreRepositoryView: View {
    @ObservedObject var store: ScoringCurrentStore
    @ObservedObject var reliability: ScoringQueueCoordinator
    @ObservedObject var finalization: ScoringFinalizationCoordinator

    var body: some View {
        ScoreScreen(
            presentation: ScoringPresenter.make(state: store.state),
            queueState: reliability.state,
            finalizationState: finalization.state,
            liveHoleMutationSendingEnabled: reliability.liveMutationSendingEnabled,
            liveFinalizationSendingEnabled: finalization.liveMutationSendingEnabled,
            onRefresh: {
                let hadUnresolvedFinalization = finalization.state.phase == .outcomeUnknown ||
                    finalization.state.phase == .acknowledgedRefreshPending
                await store.refresh()
                reliability.markNetworkUnavailable(store.state.isOrientationOnly)
                if hadUnresolvedFinalization ||
                    finalization.state.phase == .outcomeUnknown ||
                    finalization.state.phase == .acknowledgedRefreshPending
                {
                    await finalization.refreshUnknownOutcome()
                } else {
                    await finalization.reconsiderEligibility(using: store.state.scoring)
                }
            },
            onSave: { draft in
                try await reliability.save(
                    draft: draft,
                    presentation: ScoringPresenter.make(state: store.state)
                )
            },
            onManualRetry: { recordID in
                try await reliability.manualRetry(recordId: recordID)
            },
            onKeepOfficial: { recordID in
                try await reliability.keepOfficial(recordId: recordID)
            },
            onReapplyMyScore: { recordID in
                try await reliability.reapplyMyScore(recordId: recordID)
            },
            onFinalize: { matchID in
                try await finalization.finalize(matchId: matchID)
            },
            onRefreshFinalizationOutcome: {
                if finalization.state.phase == .outcomeUnknown ||
                    finalization.state.phase == .acknowledgedRefreshPending
                {
                    await finalization.refreshUnknownOutcome()
                } else {
                    await store.refresh()
                    reliability.markNetworkUnavailable(store.state.isOrientationOnly)
                    await finalization.reconsiderEligibility(using: store.state.scoring)
                }
            }
        )
        .onChange(of: store.state.phase) { _ in
            reliability.markNetworkUnavailable(store.state.isOrientationOnly)
        }
    }
}

struct ScoreFixtureView: View {
    let state: ScoringCurrentState

    @ViewBuilder
    var body: some View {
#if DEBUG
        if let workflowScenario = ScoringWorkflowUITestScenario.resolve() {
            ScoringWorkflowUITestFixtureView(
                state: state,
                scenario: workflowScenario
            )
        } else {
            standardFixture
        }
#else
        standardFixture
#endif
    }

    private var standardFixture: some View {
        ScoreScreen(
            presentation: ScoringPresenter.make(state: state),
            queueState: .inactive,
            onRefresh: {},
            onSave: { _ in throw ScoringQueueCoordinatorError.inactiveIdentity }
        )
    }
}
