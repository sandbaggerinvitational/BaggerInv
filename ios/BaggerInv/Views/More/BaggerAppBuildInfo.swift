import Foundation

struct BaggerAppBuildInfo: Equatable, Sendable {
    let version: String
    let build: String

    static func current(bundle: Bundle = .main) -> Self {
        current(values: bundle.infoDictionary ?? [:])
    }

    static func current(values: [String: Any]) -> Self {
        Self(
            version: normalized(values["CFBundleShortVersionString"]),
            build: normalized(values["CFBundleVersion"])
        )
    }

    var versionAndBuildText: String {
        "Version \(version) (\(build))"
    }

    private static func normalized(_ value: Any?) -> String {
        guard let value = value as? String else { return "Unknown" }
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? "Unknown" : trimmed
    }
}
