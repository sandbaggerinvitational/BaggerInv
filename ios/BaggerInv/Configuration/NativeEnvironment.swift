import Foundation

struct NativeEnvironment: Equatable {
    static let previewAPIURL = URL(string: "https://native-preview.baggerinv.com")!
    static let previewSupabaseURL = URL(string: "https://idgigvjjqkfbqjeredpb.supabase.co")!

    let apiBaseURL: URL
    let supabaseURL: URL
    let supabasePublishableKey: String

    init(apiBaseURL: URL, supabaseURL: URL, supabasePublishableKey: String) throws {
        guard apiBaseURL == Self.previewAPIURL,
              apiBaseURL.scheme == "https",
              supabaseURL == Self.previewSupabaseURL,
              supabaseURL.scheme == "https"
        else {
            throw NativeConfigurationError.incompatibleEnvironment
        }

        let key = supabasePublishableKey.trimmingCharacters(in: .whitespacesAndNewlines)
        guard key.count >= 20,
              key.count <= 4_096,
              key.hasPrefix("sb_publishable_"),
              !key.contains(where: \Character.isWhitespace),
              !key.contains("REPLACE_WITH")
        else {
            throw NativeConfigurationError.missingPreviewConfiguration
        }

        self.apiBaseURL = apiBaseURL
        self.supabaseURL = supabaseURL
        self.supabasePublishableKey = key
    }

    static func load(bundle: Bundle = .main) throws -> NativeEnvironment {
        try load(values: bundle.infoDictionary ?? [:])
    }

    static func load(values: [String: Any]) throws -> NativeEnvironment {
        guard let apiValue = values["BAGGER_API_BASE_URL"] as? String,
              let apiURL = URL(string: apiValue),
              let supabaseValue = values["SUPABASE_URL"] as? String,
              let supabaseURL = URL(string: supabaseValue),
              let publishableKey = values["SUPABASE_PUBLISHABLE_KEY"] as? String
        else {
            throw NativeConfigurationError.missingPreviewConfiguration
        }

        return try NativeEnvironment(
            apiBaseURL: apiURL,
            supabaseURL: supabaseURL,
            supabasePublishableKey: publishableKey
        )
    }
}
enum NativeConfigurationError: Error, Equatable {
    case missingPreviewConfiguration
    case incompatibleEnvironment
}
