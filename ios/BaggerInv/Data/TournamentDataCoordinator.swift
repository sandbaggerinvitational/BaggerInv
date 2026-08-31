import Foundation

@MainActor
protocol TournamentDataLifecycle: AnyObject {
    func activate(authUserID: String, participant: ParticipantSession) async
    func deactivate(deleteCache: Bool) async
    func prepareForApplicationInactivity()
    func prepareForForegroundRevalidation()
    func suspendForEnvironmentReattestation() async
    func resumeAfterEnvironmentReattestation() async
    func pauseForBackground() async
    func refreshAll() async
    func refreshForForeground() async
    func unresolvedScoringIntentCount() async -> Int?
    func prepareScoringQueueForSignOut() async
    func cancelScoringQueueSignOutPreparation() async
}

extension TournamentDataLifecycle {
    func prepareForApplicationInactivity() {}
    func prepareForForegroundRevalidation() {}
    func pauseForBackground() async {}
    func unresolvedScoringIntentCount() async -> Int? { 0 }
    func prepareScoringQueueForSignOut() async {}
    func cancelScoringQueueSignOutPreparation() async {}
}

@MainActor
final class TournamentDataCoordinator: TournamentDataLifecycle {
    let today: MobileReadRepository<MobileTodayResponse>
    let matches: MobileReadRepository<MobileMatchesResponse>
    let leaders: MobileReadRepository<MobileLeadersResponse>
    let netSkins: MobileReadRepository<MobileNetSkinsResponse>
    let calcutta: MobileReadRepository<MobileCalcuttaResponse>
    let schedule: MobileReadRepository<MobileScheduleResponse>
    let passport: MobileReadRepository<MobilePassportResponse>
    let guide: MobileReadRepository<MobileGuideResponse>
    let history: MobileReadRepository<MobileHistoryResponse>
    let records: MobileReadRepository<MobileRecordsResponse>
    let odds: MobileReadRepository<MobileOddsResponse>
    let historyDetails: [Int: MobileReadRepository<MobileHistoryDetailResponse>]
    let scoring: ScoringCurrentStore
    let scoringReliability: ScoringQueueCoordinator?
    let scoringFinalization: ScoringFinalizationCoordinator?

    private let cache: any ReadCacheStoring
    private let applicationActivity: NativeApplicationActivity
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
        scoringFinalizationProbeStore: (any ScoringFinalizationProbeStoring)? = nil,
        applicationActivity: NativeApplicationActivity = NativeApplicationActivity(isActive: true),
        scoringHoleMutationAuthorization: (any ScoringHoleMutationAuthorizing)? = nil,
        liveScoringFinalizationSendingEnabled: Bool = false,
        now: @escaping () -> Date = Date.init
    ) {
        self.cache = cache
        self.applicationActivity = applicationActivity
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
        netSkins = MobileReadRepository(
            product: .netSkins,
            cache: cache,
            credentialProvider: credentialProvider,
            now: now
        ) { credentials, etag in
            try await api.netSkins(
                accessToken: credentials.accessToken,
                certification: credentials.certification,
                etag: etag
            )
        }
        calcutta = MobileReadRepository(
            product: .calcutta,
            cache: cache,
            credentialProvider: credentialProvider,
            now: now
        ) { credentials, etag in
            try await api.calcutta(
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
        passport = MobileReadRepository(
            product: .passport,
            cache: cache,
            credentialProvider: credentialProvider,
            now: now
        ) { credentials, etag in
            try await api.passport(
                accessToken: credentials.accessToken,
                certification: credentials.certification,
                etag: etag
            )
        }
        guide = MobileReadRepository(
            product: .guide,
            cache: cache,
            credentialProvider: credentialProvider,
            now: now
        ) { credentials, etag in
            try await api.guide(
                accessToken: credentials.accessToken,
                certification: credentials.certification,
                etag: etag
            )
        }
        history = MobileReadRepository(
            product: .history,
            cache: cache,
            credentialProvider: credentialProvider,
            now: now
        ) { credentials, etag in
            try await api.history(
                accessToken: credentials.accessToken,
                certification: credentials.certification,
                etag: etag
            )
        }
        records = MobileReadRepository(
            product: .records,
            cache: cache,
            credentialProvider: credentialProvider,
            now: now
        ) { credentials, etag in
            try await api.records(
                accessToken: credentials.accessToken,
                certification: credentials.certification,
                etag: etag
            )
        }
        odds = MobileReadRepository(
            product: .odds,
            cache: cache,
            credentialProvider: credentialProvider,
            now: now
        ) { credentials, etag in
            try await api.odds(
                accessToken: credentials.accessToken,
                certification: credentials.certification,
                etag: etag
            )
        }
        var details: [Int: MobileReadRepository<MobileHistoryDetailResponse>] = [:]
        for year in 2017...2026 {
            let cacheKey = try! MobileReadCacheKey(historyYear: year)
            details[year] = MobileReadRepository(
                cacheKey: cacheKey,
                cache: cache,
                credentialProvider: credentialProvider,
                now: now,
                responseValidator: { response, context in
                    response.isCompatible(
                        expectedTournamentID: context.tournamentID,
                        expectedPlayerID: context.playerID
                    ) && response.data.tournament.year == year
                }
            ) { credentials, etag in
                try await api.historyDetail(
                    year: year,
                    accessToken: credentials.accessToken,
                    certification: credentials.certification,
                    etag: etag
                )
            }
        }
        historyDetails = details
        scoring = ScoringCurrentStore(
            api: api,
            credentialProvider: credentialProvider
        )
        if let scoringQueueRepository {
            let reliability = ScoringQueueCoordinator(
                repository: scoringQueueRepository,
                api: api,
                credentialProvider: credentialProvider,
                applicationActivity: applicationActivity,
                mutationAuthorization: scoringHoleMutationAuthorization,
                now: now
            )
            scoringReliability = reliability
            if let scoringFinalizationProbeStore {
                scoringFinalization = ScoringFinalizationCoordinator(
                    api: api,
                    credentialProvider: credentialProvider,
                    queue: reliability,
                    probeStore: scoringFinalizationProbeStore,
                    applicationActivity: applicationActivity,
                    liveMutationSendingEnabled: liveScoringFinalizationSendingEnabled,
                    now: now
                )
            } else {
                scoringFinalization = nil
            }
        } else {
            scoringReliability = nil
            scoringFinalization = nil
        }

        let scoringStore = scoring
        scoringReliability?.setCanonicalUpdateHandler { [weak scoringStore] response in
            scoringStore?.applyCanonicalQueueRefresh(response)
        }
        scoringFinalization?.setCanonicalUpdateHandler { [weak scoringStore] response in
            scoringStore?.applyCanonicalQueueRefresh(response)
        }

        let invalidation: @MainActor @Sendable () -> Void = { [weak self] in
            self?.deliverAccessInvalidationOnce()
        }
        today.setAccessInvalidationHandler(invalidation)
        matches.setAccessInvalidationHandler(invalidation)
        leaders.setAccessInvalidationHandler(invalidation)
        netSkins.setAccessInvalidationHandler(invalidation)
        calcutta.setAccessInvalidationHandler(invalidation)
        schedule.setAccessInvalidationHandler(invalidation)
        passport.setAccessInvalidationHandler(invalidation)
        guide.setAccessInvalidationHandler(invalidation)
        history.setAccessInvalidationHandler(invalidation)
        records.setAccessInvalidationHandler(invalidation)
        odds.setAccessInvalidationHandler(invalidation)
        historyDetails.values.forEach { $0.setAccessInvalidationHandler(invalidation) }
        scoring.setAccessInvalidationHandler(invalidation)

        let authorityRevalidation: @MainActor @Sendable () -> Void = { [weak self] in
            self?.authorityRevalidationHandler?()
        }
        today.setAuthorityRevalidationHandler(authorityRevalidation)
        matches.setAuthorityRevalidationHandler(authorityRevalidation)
        leaders.setAuthorityRevalidationHandler(authorityRevalidation)
        netSkins.setAuthorityRevalidationHandler(authorityRevalidation)
        calcutta.setAuthorityRevalidationHandler(authorityRevalidation)
        schedule.setAuthorityRevalidationHandler(authorityRevalidation)
        passport.setAuthorityRevalidationHandler(authorityRevalidation)
        guide.setAuthorityRevalidationHandler(authorityRevalidation)
        history.setAuthorityRevalidationHandler(authorityRevalidation)
        records.setAuthorityRevalidationHandler(authorityRevalidation)
        odds.setAuthorityRevalidationHandler(authorityRevalidation)
        historyDetails.values.forEach { $0.setAuthorityRevalidationHandler(authorityRevalidation) }
        scoring.setAuthorityRevalidationHandler(authorityRevalidation)
        scoringReliability?.setAccessInvalidationHandler(invalidation)
        scoringFinalization?.setAccessInvalidationHandler(invalidation)
        scoringReliability?.setAuthorityRevalidationHandler(authorityRevalidation)
        scoringFinalization?.setAuthorityRevalidationHandler(authorityRevalidation)
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
            playerID: participant.player.playerId,
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
            if applicationActivity.isActive {
                Task { await refreshAll() }
            }
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
        await netSkins.activate(context, beginRefresh: false)
        guard isCurrent(context, generation: activationGeneration) else { return }
        await calcutta.activate(context, beginRefresh: false)
        guard isCurrent(context, generation: activationGeneration) else { return }
        await schedule.activate(context, beginRefresh: false)
        guard isCurrent(context, generation: activationGeneration) else { return }
        await scoring.activate(
            authUserID: authUserID,
            playerID: participant.player.playerId,
            beginRefresh: false
        )
        guard isCurrent(context, generation: activationGeneration) else { return }
        let scoringIdentity = ScoringQueueIdentityPartition(
            authUserId: authUserID,
            playerId: participant.player.playerId,
            tournamentId: participant.tournament.tournamentId
        )
        // Queue replay must remain fenced until the online-only finalization
        // owner has loaded its durable probe and either reclaimed Match
        // ownership or proved no probe exists for this exact identity.
        if scoringFinalization != nil {
            scoringReliability?.beginFinalizationRecoveryBarrier(blockLocalSaves: true)
        }
        await scoringReliability?.activate(identity: scoringIdentity)
        guard isCurrent(context, generation: activationGeneration) else { return }
        await scoringFinalization?.activate(identity: scoringIdentity)
        guard isCurrent(context, generation: activationGeneration) else { return }
        if applicationActivity.isActive {
            Task { await refreshAll() }
        }
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
        await netSkins.deactivate(deleteCache: false)
        guard lifecycleGeneration == deactivationGeneration else { return }
        await calcutta.deactivate(deleteCache: false)
        guard lifecycleGeneration == deactivationGeneration else { return }
        await schedule.deactivate(deleteCache: false)
        guard lifecycleGeneration == deactivationGeneration else { return }
        await passport.deactivate(deleteCache: false)
        guard lifecycleGeneration == deactivationGeneration else { return }
        await guide.deactivate(deleteCache: false)
        guard lifecycleGeneration == deactivationGeneration else { return }
        await history.deactivate(deleteCache: false)
        guard lifecycleGeneration == deactivationGeneration else { return }
        await records.deactivate(deleteCache: false)
        guard lifecycleGeneration == deactivationGeneration else { return }
        await odds.deactivate(deleteCache: false)
        guard lifecycleGeneration == deactivationGeneration else { return }
        for year in historyDetails.keys.sorted() {
            await historyDetails[year]?.deactivate(deleteCache: false)
            guard lifecycleGeneration == deactivationGeneration else { return }
        }
        await scoring.deactivate()
        guard lifecycleGeneration == deactivationGeneration else { return }
        await scoringFinalization?.deactivate()
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
        async let netSkinsSuspension: Void = netSkins.suspendRefresh()
        async let calcuttaSuspension: Void = calcutta.suspendRefresh()
        async let scheduleSuspension: Void = schedule.suspendRefresh()
        async let passportSuspension: Void = passport.suspendRefresh()
        async let guideSuspension: Void = guide.suspendRefresh()
        async let historySuspension: Void = history.suspendRefresh()
        async let recordsSuspension: Void = records.suspendRefresh()
        async let oddsSuspension: Void = odds.suspendRefresh()
        async let scoringSuspension: Void = scoring.suspendForEnvironmentReattestation()
        async let queueSuspension: Void = scoringReliability?.suspendForEnvironmentReattestation() ?? ()
        async let finalizationSuspension: Void = scoringFinalization?.suspendForEnvironmentReattestation() ?? ()
        _ = await (
            todaySuspension,
            matchesSuspension,
            leadersSuspension,
            netSkinsSuspension,
            calcuttaSuspension,
            scheduleSuspension,
            passportSuspension,
            guideSuspension,
            historySuspension,
            recordsSuspension,
            oddsSuspension,
            scoringSuspension,
            queueSuspension,
            finalizationSuspension
        )
        for year in historyDetails.keys.sorted() {
            await historyDetails[year]?.suspendRefresh()
        }
    }

    /// Closes scoring transport synchronously at the scene callback boundary;
    /// the async pause that follows performs the remaining repository work.
    func prepareForApplicationInactivity() {
        scoringReliability?.prepareForApplicationInactivity()
        scoringFinalization?.prepareForApplicationInactivity()
    }

    /// Foreground is not scoring authority until exact health and canonical
    /// scoring revalidation complete. Arm both barriers before starting health.
    func prepareForForegroundRevalidation() {
        scoringReliability?.prepareForForegroundRevalidation()
        scoringFinalization?.prepareForForegroundRevalidation()
    }

    func resumeAfterEnvironmentReattestation() async {
        guard let context = activeContext, isSuspended else { return }
        lifecycleGeneration &+= 1
        let resumeGeneration = lifecycleGeneration
        isSuspended = false
        let shouldRestoreScoring = scoringWasActiveBeforeSuspension
        scoringWasActiveBeforeSuspension = false
        if shouldRestoreScoring {
            await scoring.refresh()
            guard isCurrent(context, generation: resumeGeneration) else { return }
            scoringReliability?.markNetworkUnavailable(scoring.state.isOrientationOnly)
        }
        await scoringReliability?.resumeAfterEnvironmentReattestation()
        guard isCurrent(context, generation: resumeGeneration) else { return }
        await scoringFinalization?.resumeAfterEnvironmentReattestation()
    }

    func refreshAll() async {
        guard activeContext != nil, !isSuspended else { return }
        async let todayRefresh: Void = today.refresh()
        async let matchesRefresh: Void = matches.refresh()
        async let leadersRefresh: Void = leaders.refresh()
        async let netSkinsRefresh: Void = netSkins.refresh()
        async let calcuttaRefresh: Void = calcutta.refresh()
        async let scheduleRefresh: Void = schedule.refresh()
        _ = await (
            todayRefresh,
            matchesRefresh,
            leadersRefresh,
            netSkinsRefresh,
            calcuttaRefresh,
            scheduleRefresh
        )
    }

    /// Today owns the four original bounded read products. Pulling Today must
    /// not eagerly revalidate the optional Leaders subproducts that have their
    /// own selected-product refresh controls.
    func refreshTodaySurface() async {
        guard activeContext != nil, !isSuspended else { return }
        async let todayRefresh: Void = today.refresh()
        async let matchesRefresh: Void = matches.refresh()
        async let leadersRefresh: Void = leaders.refresh()
        async let scheduleRefresh: Void = schedule.refresh()
        _ = await (todayRefresh, matchesRefresh, leadersRefresh, scheduleRefresh)
    }

    func loadPassport() async { await activateAndLoad(passport) }
    func loadGuide() async { await activateAndLoad(guide) }
    func loadHistory() async { await activateAndLoad(history) }
    func loadRecords() async { await activateAndLoad(records) }
    func loadOdds() async { await activateAndLoad(odds) }

    func refreshPassport() async { await activateAndRefresh(passport) }
    func refreshGuide() async { await activateAndRefresh(guide) }
    func refreshHistory() async { await activateAndRefresh(history) }
    func refreshRecords() async { await activateAndRefresh(records) }
    func refreshOdds() async { await activateAndRefresh(odds) }

    func loadHistoryDetail(year: Int) async {
        guard let repository = historyDetails[year] else { return }
        await activateAndLoad(repository)
    }

    func refreshHistoryDetail(year: Int) async {
        guard let repository = historyDetails[year] else { return }
        await activateAndRefresh(repository)
    }

    private func activate<Response: MobileReadPayloadResponse>(
        _ repository: MobileReadRepository<Response>
    ) async -> Bool {
        guard let context = activeContext, !isSuspended else { return false }
        let refreshGeneration = lifecycleGeneration
        await repository.activate(context, beginRefresh: false)
        return isCurrent(context, generation: refreshGeneration)
    }

    private func activateAndLoad<Response: MobileReadPayloadResponse>(
        _ repository: MobileReadRepository<Response>
    ) async {
        let wasActive = repository.isActive
        guard await activate(repository) else { return }
        guard !wasActive || repository.state.freshness != .fresh else { return }
        await repository.refresh()
    }

    private func activateAndRefresh<Response: MobileReadPayloadResponse>(
        _ repository: MobileReadRepository<Response>
    ) async {
        guard await activate(repository) else { return }
        await repository.refresh()
    }

    func pauseForBackground() async {
        guard activeContext != nil else { return }
        async let queuePause: Void = scoringReliability?.pauseForBackground() ?? ()
        async let finalizationPause: Void = scoringFinalization?.pauseForBackground() ?? ()
        _ = await (queuePause, finalizationPause)
    }

    func refreshForForeground() async {
        guard let context = activeContext, !isSuspended else { return }
        let refreshGeneration = lifecycleGeneration
        let staleAfter: TimeInterval = 5 * 60
        async let todayRefresh: Void = today.refreshIfStale(olderThan: staleAfter)
        async let matchesRefresh: Void = matches.refreshIfStale(olderThan: staleAfter)
        async let leadersRefresh: Void = leaders.refreshIfStale(olderThan: staleAfter)
        async let netSkinsRefresh: Void = netSkins.refreshIfStale(olderThan: staleAfter)
        async let calcuttaRefresh: Void = calcutta.refreshIfStale(olderThan: staleAfter)
        async let scheduleRefresh: Void = schedule.refreshIfStale(olderThan: staleAfter)
        async let passportRefresh: Void = passport.isActive ? passport.refresh() : ()
        async let guideRefresh: Void = guide.isActive ? guide.refresh() : ()
        async let historyRefresh: Void = history.isActive ? history.refresh() : ()
        async let recordsRefresh: Void = records.isActive ? records.refresh() : ()
        async let oddsRefresh: Void = odds.isActive ? odds.refresh() : ()

        // Canonical scoring recovery is the foreground critical path. Optional
        // participant read products continue concurrently, but a slow Skins or
        // Calcutta response must never delay queue replay or finalization
        // reconciliation.
        if scoring.state.phase != .idle {
            await scoring.refresh()
            guard isCurrent(context, generation: refreshGeneration) else { return }
            scoringReliability?.markNetworkUnavailable(scoring.state.isOrientationOnly)
        }
        await scoringReliability?.refreshForForeground()
        guard isCurrent(context, generation: refreshGeneration) else { return }
        await scoringFinalization?.resumeForForeground()
        guard isCurrent(context, generation: refreshGeneration) else { return }
        if scoringFinalization?.state.phase == .outcomeUnknown ||
            scoringFinalization?.state.phase == .acknowledgedRefreshPending
        {
            await scoringFinalization?.refreshUnknownOutcome()
        } else {
            await scoringFinalization?.reconsiderEligibility(using: scoring.state.scoring)
        }
        _ = await (
            todayRefresh,
            matchesRefresh,
            leadersRefresh,
            netSkinsRefresh,
            calcuttaRefresh,
            scheduleRefresh,
            passportRefresh,
            guideRefresh,
            historyRefresh,
            recordsRefresh,
            oddsRefresh
        )
        for year in historyDetails.keys.sorted() {
            guard let repository = historyDetails[year], repository.isActive else { continue }
            await repository.refresh()
            guard isCurrent(context, generation: refreshGeneration) else { return }
        }
    }

    func unresolvedScoringIntentCount() async -> Int? {
        guard let context = activeContext else { return 0 }
        let countGeneration = lifecycleGeneration
        guard let scoringReliability else { return 0 }
        guard let queueCount = await scoringReliability.unresolvedActiveCount() else { return nil }
        guard isCurrent(context, generation: countGeneration) else { return nil }
        let finalizationCount: Int
        if let scoringFinalization {
            guard let count = await scoringFinalization.unresolvedProbeCount() else { return nil }
            guard isCurrent(context, generation: countGeneration) else { return nil }
            finalizationCount = count
        } else {
            finalizationCount = 0
        }
        return queueCount + finalizationCount
    }

    func prepareScoringQueueForSignOut() async {
        guard let context = activeContext else { return }
        let preparationGeneration = lifecycleGeneration
        // Close a previously confirmed finalization immediately on the sign-
        // out tap, before queue reload/count I/O yields.
        scoringFinalization?.prepareForSignOutSynchronously()
        // Finalization's synchronous preparation installs a recovery fence
        // before releasing its held guard; now finish the queue reload/count
        // preparation under that already-closed admission boundary.
        await scoringReliability?.prepareForSignOut()
        guard isCurrent(context, generation: preparationGeneration) else { return }
    }

    func cancelScoringQueueSignOutPreparation() async {
        guard let context = activeContext else { return }
        let cancellationGeneration = lifecycleGeneration
        // Arm probe recovery before reopening queue admission. The
        // finalization owner releases this fence only after durable probe I/O.
        if scoringFinalization != nil {
            scoringReliability?.beginFinalizationRecoveryBarrier(blockLocalSaves: true)
        }
        await scoringReliability?.cancelSignOutPreparation()
        guard isCurrent(context, generation: cancellationGeneration) else { return }
        await scoringFinalization?.cancelSignOutPreparation()
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
