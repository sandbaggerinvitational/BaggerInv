import XCTest
import SwiftUI
import Combine
@testable import BaggerInv

private actor CandidateShellCache: ReadCacheStoring {
    var items: [String: Data] = [:]
    func read(product: MobileReadProduct, partition: ReadCachePartition) -> Data? { items[product.rawValue] }
    func write(_ data: Data, product: MobileReadProduct, partition: ReadCachePartition) { items[product.rawValue] = data }
    func remove(product: MobileReadProduct, partition: ReadCachePartition) { items.removeValue(forKey: product.rawValue) }
    func remove(partition: ReadCachePartition) { items.removeAll() }
    func byteCount(partition: ReadCachePartition) -> Int { items.values.reduce(0) { $0 + $1.count } }
}

@MainActor
private final class CandidateShellCredentials: MobileReadCredentialProviding {
    func credentials(expectedAuthUserID: String) async throws -> MobileReadCredentials {
        .init(
            authUserID: expectedAuthUserID,
            accessToken: "isolated-candidate-gate",
            certification: "isolated-candidate-gate"
        )
    }
}

final class NativeShellPreservationExpectedRedTests: XCTestCase {
    @MainActor
    private func settle(_ seconds: Double = 0.25) async {
        try? await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
    }

    @MainActor
    private func tabs(_ controller: UIViewController) -> UITabBarController? {
        if let controller = controller as? UITabBarController { return controller }
        for child in controller.children {
            if let found = tabs(child) { return found }
        }
        return nil
    }

    @MainActor
    func testFeatureFailurePreservesCurrentShellAndSelectedDestination() async throws {
        let api = MockMobileAPI()
        let auth = MockAuthService()
        let store = MockCertificationStore()
        let lifecycle = MockTournamentDataLifecycle()
        auth.restoredSessionValue = TestFixtures.authSession
        store.credentialValue = .init(
            token: TestFixtures.certificationToken,
            userID: TestFixtures.authSession.userID,
            expiresAt: TestFixtures.now.addingTimeInterval(3600)
        )
        let data = TournamentDataCoordinator(
            api: api,
            credentialProvider: CandidateShellCredentials(),
            cache: CandidateShellCache(),
            applicationActivity: NativeApplicationActivity(isActive: false),
            now: { TestFixtures.now }
        )
        let coordinator = AppCoordinator(
            environment: TestFixtures.environment,
            api: api,
            auth: auth,
            certificationStore: store,
            tournamentDataLifecycle: lifecycle,
            tournamentData: data,
            now: { TestFixtures.now }
        )
        coordinator.handleApplicationSceneChange(isActive: true)
        await coordinator.bootstrap()

        let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.first as? UIWindowScene)
        let window = UIWindow(windowScene: scene)
        window.frame = scene.coordinateSpace.bounds
        let host = UIHostingController(rootView: RootView(coordinator: coordinator))
        window.rootViewController = host
        window.makeKeyAndVisible()
        await settle(0.7)

        for (index, name) in [(1, "Matches"), (2, "Score"), (3, "Leaders"), (4, "More")] {
            let before = try XCTUnwrap(tabs(host))
            before.selectedIndex = index
            before.delegate?.tabBarController?(before, didSelect: before.viewControllers![index])
            await settle()
            XCTAssertEqual(before.selectedIndex, index)

            api.suspendNextHealth()
            let revalidation = Task {
                await coordinator.revalidateReadAuthorityAfterUnavailableResponse()
            }
            await settle()
            api.resumeSuspendedHealth()
            await revalidation.value
            await settle(0.5)

            let after = try XCTUnwrap(tabs(host))
            XCTAssertEqual(coordinator.state, .authenticated(TestFixtures.participant), name)
            XCTAssertTrue(before === after, "\(name) feature failure replaced the authenticated tab shell")
            XCTAssertEqual(after.selectedIndex, index, "\(name) feature failure reset navigation")
            XCTAssertEqual(auth.signOutCallCount, 0, name)
        }
        window.isHidden = true
    }
}
