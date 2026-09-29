import Foundation

enum NativeDeployment: String, Codable, Sendable {
    case preview, production
    static let mobileContractHeader = "X-Bagger-Mobile-Contract"
    static let productionMobileContract = "bagger-production-native-v1"

    var mobileContract: String? {
        self == .production ? Self.productionMobileContract : nil
    }

    func applyMobileContract(to request: inout URLRequest) {
        if let mobileContract {
            request.setValue(mobileContract, forHTTPHeaderField: Self.mobileContractHeader)
        }
    }

    var certificateVersion: String { self == .production ? "v2p" : "v1" }
    var certificationService: String { "com.sandbaggerinvitational.bagger.\(rawValue).certification" }
    func acceptsCertificate(_ token: String) -> Bool {
        token.utf8.count <= 256 && token.range(
            of: #"\A"# + (self == .production ? "(?:v2p|v3e|v3t)" : certificateVersion) + #"\.[0-9]{10}\.[0-9]{10}\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\z"#,
            options: .regularExpression) != nil
    }

    var bundleIdentifier: String {
        self == .production ? "com.sandbaggerinvitational.bagger" : "com.sandbaggerinvitational.bagger.preview"
    }
    var authKeychainService: String { "com.sandbaggerinvitational.bagger.\(rawValue).supabase" }
    var authStorageKey: String { "bagger.\(rawValue).auth.session" }
}

struct NativeEnvironment: Equatable {
    static let previewAPIURL = URL(string: "https://native-preview.baggerinv.com")!
    static let previewSupabaseURL = URL(string: "https://idgigvjjqkfbqjeredpb.supabase.co")!

    static let productionAPIURL = URL(string: "https://baggerinv.com")!
    static let productionSupabaseURL = URL(string: "https://ymqhhtxaywtqllynrmxe.supabase.co")!

    let deployment: NativeDeployment
    let apiBaseURL: URL
    let supabaseURL: URL
    let supabasePublishableKey: String

    init(apiBaseURL: URL, supabaseURL: URL, supabasePublishableKey: String) throws {
        if apiBaseURL == Self.previewAPIURL && supabaseURL == Self.previewSupabaseURL {
            deployment = .preview
        } else if apiBaseURL == Self.productionAPIURL && supabaseURL == Self.productionSupabaseURL {
            deployment = .production
        } else {
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

        let environment = try NativeEnvironment(apiBaseURL: apiURL, supabaseURL: supabaseURL,
            supabasePublishableKey: publishableKey)
        guard values["BAGGER_DEPLOYMENT"] as? String == environment.deployment.rawValue,
              values["CFBundleIdentifier"] as? String == environment.deployment.bundleIdentifier else {
            throw NativeConfigurationError.incompatibleEnvironment
        }
        return environment
    }
}
enum NativeConfigurationError: Error, Equatable {
    case missingPreviewConfiguration
    case incompatibleEnvironment
}
