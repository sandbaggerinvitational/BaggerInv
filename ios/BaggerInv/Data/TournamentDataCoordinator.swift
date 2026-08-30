import Foundation

@MainActor
protocol TournamentDataLifecycle: AnyObject {
    func activate(authUserID: String, participant: ParticipantSession) async
    func deactivate(deleteCache: Bool) async
    func suspendForEnvironmentReattestation() async
    func resumeAfterEnvironmentReattestation() async
    func refreshAll() async
    func refreshForForeground() async
    func unresolvedScoringIntentCount() async -> Int?
    func prepareScoringQueueForSignOut() async
    func cancelScoringQueueSignOutPreparation() async
}

extension TournamentDataLifecycle {
    func unresolvedScoringIntentCount() async -> Int? { 0 }
    func prepareScoringQueueForSignOut() async {}
    func cancelScoringQueueSignOutPreparation() async {}
}

@MainActor
final class TournamentDataCoordinator: TournamentDataLifecycle {
    let today: MobileReadRepository<MobileTodayResponse>
    let matches: MobileReadRepository<MobileMatchesResponse>
    let leaders: MobileReadRepository<MobileLeadersResponse>
    let schedule: MobileReadRepository<MobileScheduleResponse>
    let scoring: ScoringCurrentStore
    let scoringReliability: ScoringQueueCoordinator?

    private let cache: any ReadCacheStoring
    private var activeContext: ActiveMobileReadContext?
    private var isSuspended = false
    private var scoringWasActiveBeforeSuspension = false
    private var lifecycleGeneration: UInt = 0
    private var pendingCleanupPartitions: Set<ReadCachePartition> = []
    private(set) var cacheCleanupIssue = false
    private var invalidationDelivered = false
    private var accessInvalidationHandler: (@MainActor @Sendable () -> Void)?
    private var authorityRevalidationHandler: (@MainActor @Sendable () -> Void)?

    init(
        api: any MobileAPIServing,
        credentialProvider: any MobileReadCredentialProviding,
        cache: any ReadCacheStoring,
        scoringQueueRepository: (any ScoringQueueRepository)? = nil,
        liveScoringMutationSendingEnabled: Bool = false,
        now: @escaping () -> Date = Date.init
    ) {
        self.cache = cache
        today = MobileReadRepository(
            product: .today,
            cache: cache,
            credentialProvider: credentialProvider,
            now: now
        ) { credentials, etag in
            try await api.today(
                accessToken: credentials.accessToken,
                certification: credentials.certification,
                etag: etag
            )
        }
        matches = MobileReadRepository(
            product: .matches,
            cache: cache,
            credentialProvider: credentialProvider,
            now: now
        ) { credentials, etag in
            try await api.matches(
                accessToken: credentials.accessToken,
                certification: credentials.certification,
                etag: etag
            )
        }
        leaders = MobileReadRepository(
            product: .leaders,
            cache: cache,
            credentialProvider: credentialProvider,
            now: now
        ) { credentials, etag in
            try await api.leaders(
                accessToken: credentials.accessToken,
                certification: credentials.certification,
                etag: etag
            )
        }
        schedule = MobileReadRepository(
            product: .schedule,
            cache: cache,
            credentialProvider: credentialProvider,
            now: now
        ) { credentials, etag in
            try await api.schedule(
                accessToken: credentials.accessToken,
                certification: credentials.certification,
                etag: etag
            )
        }
        scoring = ScoringCurrentStore(
            api: api,
            credentialProvider: credentialProvider
        )
        if let scoringQueueRepository {
            scoringReliability = ScoringQueueCoordinator(
                repository: scoringQueueRepository,
                api: api,
                credentialProvider: credentialProvider,
                liveMutationSendingEnabled: liveScoringMutationSendingEnabled,
                now: now
            )
        } else {
            scoringReliability = nil
        }

        let scoringStore = scoring
        scoringReliability?.setCanonicalUpdateHandler { [weak scoringStore] response in
            scoringStore?.applyCanonicalQueueRefresh(response)
        }

        let invalidation: @MainActor @Sendable () -> Void = { [weak self] in
            self?.deliverAccessInvalidationOnce()
        }
        today.setAccessInvalidationHandler(invalidation)
        matches.setAccessInvalidationHandler(invalidation)
        leaders.setAccessInvalidationHandler(invalidation)
        schedule.setAccessInvalidationHandler(invalidation)
        scoring.setAccessInvalidationHandler(invalidation)

        let authorityRevalidation: @MainActor @Sendable () -> Void = { [weak self] in
            self?.authorityRevalidationHandler?()
        }
        today.setAuthorityRevalidationHandler(authorityRevalidation)
        matches.setAuthorityRevalidationHandler(authorityRevalidation)
        leaders.setAuthorityRevalidationHandler(authorityRevalidation)
        schedule.setAuthorityRevalidationHandler(authorityRevalidation)
        scoring.setAuthorityRevalidationHandler(authorityRevalidation)
        scoringReliability?.setAccessInvalidationHandler(invalidation)
        scoringReliability?.setAuthorityRevalidationHandler(authorityRevalidation)
    }

    func setAccessInvalidationHandler(_ handler: @escaping @MainActor @Sendable () -> Void) {
        accessInvalidationHandler = handler
    }

    func setAuthorityRevalidationHandler(_ handler: @escaping @MainActor @Sendable () -> Void) {
        authorityRevalidationHandler = handler
    }

    func activate(authUserID: String, participant: ParticipantSession) async {
        let partition: ReadCachePartition
        do {
            partition = try ReadCachePartition(
                environment: "preview",
                authUserID: authUserID,
                playerID: participant.player.playerId,
                tournamentID: participant.tournament.tournamentId
            )
        } catch {
            deliverAccessInvalidationOnce()
            return
        }

        let context = ActiveMobileReadContext(
            cachePartition: partition,
            authUserID: authUserID,
            tournamentID: participant.tournament.tournamentId
        )
        if let activeContext, activeContext != context {
            await deactivate(deleteCache: true)
        }
        guard self.activeContext == nil else {
            if isSuspended {
                await resumeAfterEnvironmentReattestation()
                return
            }
            Task { await refreshAll() }
            return
        }

        lifecycleGeneration &+= 1
        let activationGeneration = lifecycleGeneration
        await retryPendingCleanup()
        guard lifecycleGeneration == activationGeneration else { return }
        invalidationDelivered = false
        guard !pendingCleanupPartitions.contains(context.cachePartition) else {
            deliverAccessInvalidationOnce()
            return
        }

        isSuspended = false
        activeContext = context
        await today.activate(context, beginRefresh: false)
        guard isCurrent(context, generation: activationGeneration) else { return }
        await matches.activate(context, beginRefresh: false)
        guard isCurrent(context, generation: activationGeneration) else { return }
        await leaders.activate(context, beginRefresh: false)
        guard isCurrent(context, generation: activationGeneration) else { return }
        await schedule.activate(context, beginRefresh: false)
        guard isCurrent(context, generation: activationGeneration) else { return }
        await scoring.activate(
            authUserID: authUserID,
            playerID: participant.player.playerId,
            beginRefresh: false
        )
        guard isCurrent(context, generation: activationGeneration) else { return }
        await scoringReliability?.activate(
            identity: ScoringQueueIdentityPartition(
                authUserId: authUserID,
                playerId: participant.player.playerId,
                tournamentId: participant.tournament.tournamentId
            )
        )
        guard isCurrent(context, generation: activationGeneration) else { return }
        Task { await refreshAll() }
    }

    func deactivate(deleteCache: Bool) async {
        lifecycleGeneration &+= 1
        let deactivationGeneration = lifecycleGeneration
        let previous = activeContext
        activeContext = nil
        isSuspended = false
        scoringWasActiveBeforeSuspension = false
        await today.deactivate(deleteCache: false)
        guard lifecycleGeneration == deactivationGeneration else { return }
        await matches.deactivate(deleteCache: false)
        guard lifecycleGeneration == deactivationGeneration else { return }
        await leaders.deactivate(deleteCache: false)
        guard lifecycleGeneration == deactivationGeneration else { return }
        await schedule.deactivate(deleteCache: false)
        guard lifecycleGeneration == deactivationGeneration else { return }
        await scoring.deactivate()
        guard lifecycleGeneration == deactivationGeneration else { return }
        await scoringReliability?.deactivate()
        guard lifecycleGeneration == deactivationGeneration else { return }
        if deleteCache, let previous {
            await removePartitionWithRetry(previous.cachePartition)
        }
    }

    func suspendForEnvironmentReattestation() async {
        guard activeContext != nil, !isSuspended else { return }
        lifecycleGeneration &+= 1
        isSuspended = true
        scoringWasActiveBeforeSuspension = scoring.state.phase != .idle
        async let todaySuspension: Void = today.suspendRefresh()
        async let matchesSuspension: Void = matches.suspendRefresh()
        async let leadersSuspension: Void = leaders.suspendRefresh()
        async let scheduleSuspension: Void = schedule.suspendRefresh()
        async let scoringSuspension: Void = scoring.suspendForEnvironmentReattestation()
        async let queueSuspension: Void = scoringReliability?.suspendForEnvironmentReattestation() ?? ()
        _ = await (
            todaySuspension,
            matchesSuspension,
            leadersSuspension,
            scheduleSuspension,
            scoringSuspension,
            queueSuspension
        )
    }

    func resumeAfterEnvironmentReattestation() async {
        guard activeContext != nil, isSuspended else { return }
        lifecycleGeneration &+= 1
        isSuspended = false
        let shouldRestoreScoring = scoringWasActiveBeforeSuspension
        scoringWasActiveBeforeSuspension = false
        if shouldRestoreScoring {
            await scoring.refresh()
            scoringReliability?.markNetworkUnavailable(scoring.state.isOrientationOnly)
        }
        await scoringReliability?.resumeAfterEnvironmentReattestation()
    }

    func refreshAll() async {
        guard activeContext != nil, !isSuspended else { return }
        async let todayRefresh: Void = today.refresh()
        async let matchesRefresh: Void = matches.refresh()
        async let leadersRefresh: Void = leaders.refresh()
        async let scheduleRefresh: Void = schedule.refresh()
        _ = await (todayRefresh, matchesRefresh, leadersRefresh, scheduleRefresh)
    }

    func refreshForForeground() async {
        guard activeContext != nil, !isSuspended else { return }
        let staleAfter: TimeInterval = 5 * 60
        async let todayRefresh: Void = today.refreshIfStale(olderThan: staleAfter)
        async let matchesRefresh: Void = matches.refreshIfStale(olderThan: staleAfter)
        async let leadersRefresh: Void = leaders.refreshIfStale(olderThan: staleAfter)
        async let scheduleRefresh: Void = schedule.refreshIfStale(olderThan: staleAfter)
        _ = await (todayRefresh, matchesRefresh, leadersRefresh, scheduleRefresh)
        if scoring.state.phase != .idle {
            await scoring.refresh()
            scoringReliability?.markNetworkUnavailable(scoring.state.isOrientationOnly)
        }
        await scoringReliability?.refreshForForeground()
    }

    func unresolvedScoringIntentCount() async -> Int? {
        guard let scoringReliability else { return 0 }
        return await scoringReliability.unresolvedActiveCount()
    }

    func prepareScoringQueueForSignOut() async {
        await scoringReliability?.prepareForSignOut()
    }

    func cancelScoringQueueSignOutPreparation() async {
        await scoringReliability?.cancelSignOutPreparation()
    }

    func activeCacheByteCount() async -> Int? {
        guard let activeContext else { return nil }
        return try? await cache.byteCount(partition: activeContext.cachePartition)
    }

    private func deliverAccessInvalidationOnce() {
        guard !invalidationDelivered else { return }
        invalidationDelivered = true
        accessInvalidationHandler?()
    }

    private func isCurrent(_ context: ActiveMobileReadContext, generation: UInt) -> Bool {
        lifecycleGeneration == generation && activeContext == context
    }

    private func removePartitionWithRetry(_ partition: ReadCachePartition) async {
        for _ in 0..<2 {
            do {
                try await cache.remove(partition: partition)
                pendingCleanupPartitions.remove(partition)
                cacheCleanupIssue = !pendingCleanupPartitions.isEmpty
                return
            } catch {
                // A second immediate attempt handles ordinary transient file-system
                // contention without blocking sign-out or exposing a path/identity.
            }
        }
        pendingCleanupPartitions.insert(partition)
        cacheCleanupIssue = true
    }

    private func retryPendingCleanup() async {
        let pending = pendingCleanupPartitions
        for partition in pending {
            await removePartitionWithRetry(partition)
        }
        cacheCleanupIssue = !pendingCleanupPartitions.isEmpty
    }
}
