import SwiftUI

struct ScoreRepositoryView: View {
    @ObservedObject private var store: ScoringCurrentStore
    @ObservedObject private var matches: MobileReadRepository<MobileMatchesResponse>
    private let reliability: ScoringQueueCoordinator?
    private let finalization: ScoringFinalizationCoordinator?
    private let matchSelection: ScoreMatchSelectionStore
    private let onSelectMatch: @MainActor @Sendable (String) async throws -> Void

    init(
        store: ScoringCurrentStore,
        matches: MobileReadRepository<MobileMatchesResponse>,
        reliability: ScoringQueueCoordinator?,
        finalization: ScoringFinalizationCoordinator? = nil,
        matchSelection: ScoreMatchSelectionStore,
        onSelectMatch: @escaping @MainActor @Sendable (String) async throws -> Void
    ) {
        _store = ObservedObject(wrappedValue: store)
        _matches = ObservedObject(wrappedValue: matches)
        self.reliability = reliability
        self.finalization = finalization
        self.matchSelection = matchSelection
        self.onSelectMatch = onSelectMatch
    }

    @ViewBuilder
    var body: some View {
        content
            .id(store.state.scoring.map { Data($0.match.matchId.utf8) })
            .environment(\.scoreMatchDisplay, ScoreMatchDisplayContext.make(state: matches.state, scoring: store.state.scoring))
    }

    @ViewBuilder private var content: some View {
        if let reliability, let finalization {
            OfficialScoreRepositoryView(
                store: store,
                reliability: reliability,
                finalization: finalization,
                matchSelection: matchSelection, onSelectMatch: onSelectMatch
            )
        } else if let reliability {
            QueueBackedScoreRepositoryView(store: store, reliability: reliability, matchSelection: matchSelection, onSelectMatch: onSelectMatch)
        } else {
            ScoreScreen(
                presentation: ScoringPresenter.make(state: store.state),
                queueState: .inactive,
                matchSelection: matchSelection, onSelectMatch: onSelectMatch,
                onRefresh: { await store.refresh() },
                onSave: { _ in throw ScoringQueueCoordinatorError.inactiveIdentity }
            )
        }
    }
}

private struct QueueBackedScoreRepositoryView: View {
    @ObservedObject var store: ScoringCurrentStore
    @ObservedObject var reliability: ScoringQueueCoordinator
    let matchSelection: ScoreMatchSelectionStore
    let onSelectMatch: @MainActor @Sendable (String) async throws -> Void

    var body: some View {
        ScoreScreen(
            presentation: ScoringPresenter.make(state: store.state),
            queueState: reliability.state,
            liveHoleMutationSendingEnabled: reliability.liveMutationSendingEnabled,
            matchSelection: matchSelection, onSelectMatch: onSelectMatch,
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
    let matchSelection: ScoreMatchSelectionStore
    let onSelectMatch: @MainActor @Sendable (String) async throws -> Void

    var body: some View {
        ScoreScreen(
            presentation: ScoringPresenter.make(state: store.state),
            queueState: reliability.state,
            finalizationState: finalization.state,
            liveHoleMutationSendingEnabled: reliability.liveMutationSendingEnabled,
            liveFinalizationSendingEnabled: finalization.liveMutationSendingEnabled,
            matchSelection: matchSelection, onSelectMatch: onSelectMatch,
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
        if ProcessInfo.processInfo.arguments.contains("--bagger-ui-test-score-picker") {
            ScoreMatchSelectionFixtureView()
        } else if let workflowScenario = ScoringWorkflowUITestScenario.resolve() {
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
