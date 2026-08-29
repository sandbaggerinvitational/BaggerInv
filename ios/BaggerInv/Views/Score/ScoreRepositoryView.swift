import SwiftUI

struct ScoreRepositoryView: View {
    @ObservedObject private var store: ScoringCurrentStore

    init(store: ScoringCurrentStore) {
        _store = ObservedObject(wrappedValue: store)
    }

    var body: some View {
        ScoreScreen(
            presentation: ScoringPresenter.make(state: store.state),
            onRefresh: { await store.refresh() }
        )
    }
}

struct ScoreFixtureView: View {
    let state: ScoringCurrentState

    var body: some View {
        ScoreScreen(
            presentation: ScoringPresenter.make(state: state),
            onRefresh: {}
        )
    }
}
