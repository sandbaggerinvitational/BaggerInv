import Foundation

/// Immutable application-build capability composed with the current health,
/// activity, identity, credential, canonical scoring, and queue guards. This
/// capability never authenticates a participant and never replaces those
/// per-request checks; it only determines whether this build/environment may
/// attempt official scoring transports at all.
@MainActor
protocol ScoringHoleMutationAuthorizing {
    var allowsTransport: Bool { get }
    var allowsReapply: Bool { get }
    func permitsReplay(_ record: ScoringQueueRecord) -> Bool
    func permitsActiveRecords(_ records: [ScoringQueueRecord]) -> Bool
}

extension ScoringHoleMutationAuthorizing {
    var allowsReapply: Bool { true }

    func permitsReplay(_ record: ScoringQueueRecord) -> Bool {
        allowsTransport
    }

    func permitsActiveRecords(_ records: [ScoringQueueRecord]) -> Bool {
        records.filter(\.isUnresolved).allSatisfy(permitsReplay)
    }
}

/// The sole native capability for official Preview scoring. Both hole replay
/// and online-only finalization derive from the same immutable decision.
/// Production, an alternate Supabase project, another bundle, or malformed
/// configuration all remain fail-closed.
struct PreviewScoringMutationCapability: ScoringHoleMutationAuthorizing, Equatable, Sendable {
    static let previewBundleIdentifier = "com.sandbaggerinvitational.bagger.preview"

    let allowsOfficialScoringMutations: Bool

    var allowsTransport: Bool { allowsOfficialScoringMutations }
    var allowsFinalizationTransport: Bool { allowsOfficialScoringMutations }

    static func resolve(
        environment: NativeEnvironment,
        bundleIdentifier: String?
    ) -> Self {
        resolve(
            apiBaseURL: environment.apiBaseURL,
            supabaseURL: environment.supabaseURL,
            bundleIdentifier: bundleIdentifier
        )
    }

    /// A pure strict resolver keeps environment-mismatch behavior testable
    /// without constructing an invalid `NativeEnvironment`, whose initializer
    /// already rejects non-Preview configuration.
    static func resolve(
        apiBaseURL: URL,
        supabaseURL: URL,
        bundleIdentifier: String?
    ) -> Self {
        Self(allowsOfficialScoringMutations:
            apiBaseURL == NativeEnvironment.previewAPIURL &&
            supabaseURL == NativeEnvironment.previewSupabaseURL &&
            bundleIdentifier == previewBundleIdentifier
        )
    }
}

/// Fail-closed default used when no explicit application capability is
/// supplied. Durable local intent remains available, but replay cannot send.
@MainActor
final class DisabledScoringHoleMutationAuthorization: ScoringHoleMutationAuthorizing {
    let allowsTransport = false
}
