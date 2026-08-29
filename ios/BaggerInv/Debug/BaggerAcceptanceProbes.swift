import Foundation

enum BaggerAcceptanceProbes {
    static let launchArgument = "--bagger-acceptance-probes"

    static func isEnabled(arguments: [String] = ProcessInfo.processInfo.arguments) -> Bool {
#if DEBUG
        arguments.contains(launchArgument)
#else
        false
#endif
    }
}
