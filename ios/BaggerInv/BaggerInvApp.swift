import SwiftUI

@main
struct BaggerInvApp: App {
    @StateObject private var coordinator: AppCoordinator
#if DEBUG
    private let uiTestLaunch: TodayUITestLaunch
#endif

    init() {
#if DEBUG
        let launch = TodayUITestLaunch.resolve()
        uiTestLaunch = launch
        switch launch {
        case .disabled:
            _coordinator = StateObject(wrappedValue: AppCoordinator.live())
        case .scenario, .invalid:
            _coordinator = StateObject(wrappedValue: AppCoordinator(configurationFailure: ()))
        }
#else
        _coordinator = StateObject(wrappedValue: AppCoordinator.live())
#endif
    }

    var body: some Scene {
        WindowGroup {
            applicationRoot
                .preferredColorScheme(.light)
        }
    }

    @ViewBuilder
    private var applicationRoot: some View {
#if DEBUG
        switch uiTestLaunch {
        case .disabled:
            RootView(coordinator: coordinator)
        case .scenario(let scenario):
            TodayUITestFixtureRoot(scenario: scenario)
        case .invalid:
            InvalidTodayUITestFixtureRoot()
        }
#else
        RootView(coordinator: coordinator)
#endif
    }
}
