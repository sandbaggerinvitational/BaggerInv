import SwiftUI

@main
struct BaggerInvApp: App {
    @StateObject private var coordinator: AppCoordinator
#if DEBUG
    private let uiTestLaunch: TodayUITestLaunch
    private let assetGalleryEnabled: Bool
#endif

    init() {
#if DEBUG
        let launch = TodayUITestLaunch.resolve()
        uiTestLaunch = launch
        assetGalleryEnabled = BaggerAssetGalleryLaunch.isEnabled()
        switch (assetGalleryEnabled, launch) {
        case (false, .disabled):
            _coordinator = StateObject(wrappedValue: AppCoordinator.live())
        case (true, _), (false, .scenario), (false, .invalid):
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
        if assetGalleryEnabled {
            BaggerAssetGalleryView()
        } else {
            switch uiTestLaunch {
            case .disabled:
                RootView(coordinator: coordinator)
            case .scenario(let scenario):
                TodayUITestFixtureRoot(scenario: scenario)
            case .invalid:
                InvalidTodayUITestFixtureRoot()
            }
        }
#else
        RootView(coordinator: coordinator)
#endif
    }
}
