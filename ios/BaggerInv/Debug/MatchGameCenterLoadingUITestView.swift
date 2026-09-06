#if DEBUG
import SwiftUI

/// Deterministic playback of a successful cold read, using the same renderer
/// as the repository route. Enabled only inside the existing UI fixture shell;
/// it never changes live networking, cache behavior, or authentication.
struct MatchGameCenterLoadingUITestView: View {
    let loadedState: MobileReadState<MobileMatchDetailData>
    let matchID: String
    let onNavigateMatch: (String) -> Void
    @State private var phase = 0

    static var isEnabled: Bool {
        let arguments = ProcessInfo.processInfo.arguments
        return arguments.contains("--bagger-ui-testing") &&
            arguments.contains("--bagger-match-detail-cold-load")
    }

    var body: some View {
        MatchGameCenterContentView(
            state: state,
            requestedMatchID: matchID,
            onRefresh: {},
            onNavigate: onNavigateMatch,
            onBackToMyMatch: onNavigateMatch
        )
        .task {
            do {
                try await Task.sleep(for: .seconds(3))
                phase = 1
                try await Task.sleep(for: .seconds(12))
                phase = 2
            } catch { return }
        }
    }

    private var state: MobileReadState<MobileMatchDetailData> {
        guard phase < 2 else { return loadedState }
        var resolving = MobileReadState<MobileMatchDetailData>.empty
        if phase == 1 {
            resolving.freshness = .refreshing
            resolving.isRefreshing = true
        }
        return resolving
    }
}
#endif
