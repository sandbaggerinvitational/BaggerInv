import SwiftUI

struct ScoreRepositoryView: View {
    @ObservedObject private var store: ScoringCurrentStore
    private let reliability: ScoringQueueCoordinator?

    init(store: ScoringCurrentStore, reliability: ScoringQueueCoordinator?) {
        _store = ObservedObject(wrappedValue: store)
        self.reliability = reliability
    }

    @ViewBuilder
    var body: some View {
        if let reliability {
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
            }
        )
        .onChange(of: store.state.phase) { _ in
            reliability.markNetworkUnavailable(store.state.isOrientationOnly)
        }
    }
}

struct ScoreFixtureView: View {
    let state: ScoringCurrentState

    var body: some View {
        ScoreScreen(
            presentation: ScoringPresenter.make(state: state),
            queueState: .inactive,
            onRefresh: {},
            onSave: { _ in throw ScoringQueueCoordinatorError.inactiveIdentity }
        )
    }
}
