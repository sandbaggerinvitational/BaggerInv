import XCTest
@testable import BaggerInv

final class NativeEnvironmentTests: XCTestCase {
    private let publishableKey = "sb_publishable_preview_client_key"

    func testCertifiedPreviewConfigurationPasses() throws {
        let environment = try NativeEnvironment(
            apiBaseURL: NativeEnvironment.previewAPIURL,
            supabaseURL: NativeEnvironment.previewSupabaseURL,
            supabasePublishableKey: publishableKey
        )

        XCTAssertEqual(environment.apiBaseURL, NativeEnvironment.previewAPIURL)
        XCTAssertEqual(environment.supabaseURL, NativeEnvironment.previewSupabaseURL)
        XCTAssertEqual(environment.supabasePublishableKey, publishableKey)
    }

    func testProductionAPIHostFailsClosed() {
        XCTAssertThrowsError(
            try NativeEnvironment(
                apiBaseURL: URL(string: "https://production.invalid")!,
                supabaseURL: NativeEnvironment.previewSupabaseURL,
                supabasePublishableKey: publishableKey
            )
        ) { error in
            XCTAssertEqual(error as? NativeConfigurationError, .incompatibleEnvironment)
        }
    }

    func testDifferentSupabaseProjectFailsClosed() {
        XCTAssertThrowsError(
            try NativeEnvironment(
                apiBaseURL: NativeEnvironment.previewAPIURL,
                supabaseURL: URL(string: "https://production-project.supabase.co")!,
                supabasePublishableKey: publishableKey
            )
        ) { error in
            XCTAssertEqual(error as? NativeConfigurationError, .incompatibleEnvironment)
        }
    }

    func testNonPublishableSupabaseKeyFailsClosed() {
        XCTAssertThrowsError(
            try NativeEnvironment(
                apiBaseURL: NativeEnvironment.previewAPIURL,
                supabaseURL: NativeEnvironment.previewSupabaseURL,
                supabasePublishableKey: "server_secret_key_that_must_never_ship"
            )
        ) { error in
            XCTAssertEqual(error as? NativeConfigurationError, .missingPreviewConfiguration)
        }
    }

    func testPlaceholderPublishableKeyFailsClosed() {
        XCTAssertThrowsError(
            try NativeEnvironment(
                apiBaseURL: NativeEnvironment.previewAPIURL,
                supabaseURL: NativeEnvironment.previewSupabaseURL,
                supabasePublishableKey: "sb_publishable_REPLACE_WITH_PREVIEW_KEY"
            )
        ) { error in
            XCTAssertEqual(error as? NativeConfigurationError, .missingPreviewConfiguration)
        }
    }
}
