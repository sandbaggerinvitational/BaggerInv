import Combine
import Foundation

enum MobileReadSource: String, Equatable, Sendable {
    case diskCache
    case network
}

enum MobileReadFreshness: String, Equatable, Sendable {
    case empty
    case cached
    case refreshing
    case fresh
    case stale
    case offline
    case failed
}

enum MobileReadFailure: String, Error, Equatable, Sendable {
    case authentication
    case authorization
    case unavailable
    case rateLimited
    case contract
    case transport
    case cancelled
    case cacheInconsistency
}

struct MobileReadState<Value: Equatable & Sendable>: Equatable, Sendable {
    var value: Value?
    var source: MobileReadSource?
    var freshness: MobileReadFreshness
    var isRefreshing: Bool
    var revision: String?
    var generatedAt: MobileTimestamp?
    var fetchedAt: Date?
    var validatedAt: Date?
    var lastSafeError: MobileReadFailure?
    var lastServerCode: MobileErrorCode?
    var lastHTTPStatus: Int?
    var cachePersistenceIssue: Bool

    static var empty: Self {
        Self(
            value: nil,
            source: nil,
            freshness: .empty,
            isRefreshing: false,
            revision: nil,
            generatedAt: nil,
            fetchedAt: nil,
            validatedAt: nil,
            lastSafeError: nil,
            lastServerCode: nil,
            lastHTTPStatus: nil,
            cachePersistenceIssue: false
        )
    }
}

struct ActiveMobileReadContext: Equatable, Sendable {
    let cachePartition: ReadCachePartition
    let authUserID: String
    let playerID: String
    let tournamentID: String
}

private struct ReadCacheEnvelope<Response: MobileReadPayloadResponse>: Codable, Sendable {
    let cacheSchemaVersion: Int
    let partitionDigest: String
    let product: MobileReadProduct
    var response: Response
    var etag: String?
    let fetchedAt: Date
    var validatedAt: Date
}

private enum RevocableCacheReplacement {
    case persisted
    case invalidated
    case unsafe
}

protocol MobileReadPayloadResponse: Codable, Equatable, Sendable {
    associatedtype Payload: MobileReadPayload
    var data: Payload { get }
    var meta: MobileReadMeta { get }
    func isCompatible(expectedTournamentID: String, expectedPlayerID: String) -> Bool
}

extension MobileReadResponse: MobileReadPayloadResponse {
    typealias Payload = Payload
}

@MainActor
final class MobileReadRepository<Response: MobileReadPayloadResponse>: ObservableObject {
    typealias Value = Response.Payload
    typealias Fetcher = @MainActor @Sendable (
        _ credentials: MobileReadCredentials,
        _ etag: String?
    ) async throws -> MobileConditionalRead<Response>

    @Published private(set) var state: MobileReadState<Value> = .empty

    let product: MobileReadProduct

    private let cache: any ReadCacheStoring
    private let credentialProvider: any MobileReadCredentialProviding
    private let fetcher: Fetcher
    private let now: () -> Date
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder
    private var activeContext: ActiveMobileReadContext?
    private var cachedEntry: ReadCacheEnvelope<Response>?
    private var inFlight: Task<Void, Never>?
    private var generation: UInt = 0
    private var accessInvalidationHandler: (@MainActor @Sendable () -> Void)?
    private var authorityRevalidationHandler: (@MainActor @Sendable () -> Void)?

    init(
        product: MobileReadProduct,
        cache: any ReadCacheStoring,
        credentialProvider: any MobileReadCredentialProviding,
        now: @escaping () -> Date = Date.init,
        fetcher: @escaping Fetcher
    ) {
        self.product = product
        self.cache = cache
        self.credentialProvider = credentialProvider
        self.now = now
        self.fetcher = fetcher
        encoder = JSONEncoder()
        decoder = JSONDecoder()
        encoder.dateEncodingStrategy = .millisecondsSince1970
        encoder.outputFormatting = [.sortedKeys]
        decoder.dateDecodingStrategy = .millisecondsSince1970
    }

    func setAccessInvalidationHandler(_ handler: @escaping @MainActor @Sendable () -> Void) {
        accessInvalidationHandler = handler
    }

    func setAuthorityRevalidationHandler(_ handler: @escaping @MainActor @Sendable () -> Void) {
        authorityRevalidationHandler = handler
    }

    func activate(_ context: ActiveMobileReadContext, beginRefresh: Bool = true) async {
        if let activeContext, activeContext != context {
            await deactivate(deleteCache: true)
        }
        guard activeContext == nil else {
            if beginRefresh { startRefresh() }
            return
        }

        generation &+= 1
        let activationGeneration = generation
        activeContext = context
        state = .empty
        cachedEntry = nil

        do {
            if let data = try await cache.read(product: product, partition: context.cachePartition) {
                let entry = try decoder.decode(ReadCacheEnvelope<Response>.self, from: data)
                guard entry.cacheSchemaVersion == DiskReadCacheStore.cacheSchemaVersion,
                      entry.partitionDigest == context.cachePartition.digest,
                      entry.product == product,
                      entry.response.isCompatible(
                          expectedTournamentID: context.tournamentID,
                          expectedPlayerID: context.playerID
                      ),
                      generation == activationGeneration,
                      activeContext == context
                else {
                    throw MobileReadFailure.cacheInconsistency
                }
                cachedEntry = entry
                state = state(from: entry, source: .diskCache, freshness: .cached)
            }
        } catch {
            try? await cache.remove(product: product, partition: context.cachePartition)
            guard generation == activationGeneration, activeContext == context else { return }
            cachedEntry = nil
            state = .empty
        }

        guard generation == activationGeneration, activeContext == context else { return }
        if beginRefresh { startRefresh() }
    }

    func refresh() async {
        guard activeContext != nil else { return }
        if let inFlight {
            await inFlight.value
            return
        }
        let task = makeRefreshTask()
        inFlight = task
        await task.value
    }

    func refreshIfStale(olderThan threshold: TimeInterval) async {
        guard let validatedAt = state.validatedAt else {
            await refresh()
            return
        }
        guard now().timeIntervalSince(validatedAt) >= threshold else { return }
        await refresh()
    }

    func cancelRefresh() async {
        let task = inFlight
        task?.cancel()
        await task?.value
        if activeContext != nil {
            state.isRefreshing = false
        }
    }

    /// Invalidates an in-flight read without discarding the last eligible value.
    /// Environment reattestation uses this stronger cancellation boundary so a
    /// transport that completes after cancellation cannot publish or persist a
    /// response obtained while authority is uncertain.
    func suspendRefresh() async {
        guard activeContext != nil else { return }
        generation &+= 1
        let task = inFlight
        inFlight = nil
        task?.cancel()
        await task?.value

        state.isRefreshing = false
        if state.value == nil {
            state.freshness = .empty
        } else if state.freshness == .refreshing {
            state.freshness = .stale
        }
    }

    func deactivate(deleteCache: Bool) async {
        generation &+= 1
        let previousContext = activeContext
        activeContext = nil
        cachedEntry = nil
        state = .empty

        let task = inFlight
        inFlight = nil
        task?.cancel()
        await task?.value

        if deleteCache, let previousContext {
            try? await cache.remove(partition: previousContext.cachePartition)
        }
    }

    private func startRefresh() {
        guard inFlight == nil, activeContext != nil else { return }
        inFlight = makeRefreshTask()
    }

    private func makeRefreshTask() -> Task<Void, Never> {
        let operationGeneration = generation
        let context = activeContext
        return Task { @MainActor [weak self] in
            guard let self, let context else { return }
            await self.performRefresh(context: context, operationGeneration: operationGeneration)
            if self.generation == operationGeneration {
                self.inFlight = nil
                self.state.isRefreshing = false
            }
        }
    }

    private func performRefresh(
        context: ActiveMobileReadContext,
        operationGeneration: UInt
    ) async {
        guard isActive(context, generation: operationGeneration) else { return }
        let previousFreshness = state.freshness
        state.isRefreshing = true
        state.freshness = .refreshing
        state.lastSafeError = nil

        do {
            try Task.checkCancellation()
            let credentials = try await credentialProvider.credentials(
                expectedAuthUserID: context.authUserID
            )
            try Task.checkCancellation()
            guard credentials.authUserID == context.authUserID else {
                throw MobileReadCredentialError.authIdentityChanged
            }

            let sentETag = cachedEntry?.etag.flatMap { $0.isEmpty ? nil : $0 }
            var result = try await fetcher(credentials, sentETag)
            try Task.checkCancellation()
            guard isActive(context, generation: operationGeneration) else { return }

            if case .notModified = result, cachedEntry == nil || sentETag == nil {
                result = try await fetcher(credentials, nil)
                try Task.checkCancellation()
                guard isActive(context, generation: operationGeneration) else { return }
                if case .notModified = result {
                    throw MobileReadFailure.cacheInconsistency
                }
            }

            switch result {
            case .notModified(let returnedETag):
                guard var entry = cachedEntry else {
                    throw MobileReadFailure.cacheInconsistency
                }
                entry.etag = returnedETag ?? entry.etag
                entry.validatedAt = now()
                cachedEntry = entry
                state = state(from: entry, source: state.source ?? .diskCache, freshness: .fresh)
                state.lastHTTPStatus = 304
                await persist(entry, context: context, operationGeneration: operationGeneration)

            case .modified(let response, let etag):
                guard response.isCompatible(
                    expectedTournamentID: context.tournamentID,
                    expectedPlayerID: context.playerID
                ) else {
                    throw MobileReadFailure.contract
                }
                let fetchedAt = now()
                let entry = ReadCacheEnvelope(
                    cacheSchemaVersion: DiskReadCacheStore.cacheSchemaVersion,
                    partitionDigest: context.cachePartition.digest,
                    product: product,
                    response: response,
                    etag: etag,
                    fetchedAt: fetchedAt,
                    validatedAt: fetchedAt
                )

                let previouslyVisibleKeys =
                    cachedEntry?.response.data.revocableParticipantRepresentationKeys ?? []
                let currentlyVisibleKeys = response.data.revocableParticipantRepresentationKeys
                let revokesPreviouslyVisibleRepresentation =
                    !previouslyVisibleKeys.subtracting(currentlyVisibleKeys).isEmpty
                if revokesPreviouslyVisibleRepresentation {
                    let replacement = await replaceRevocableCacheFailClosed(
                        with: entry,
                        context: context,
                        operationGeneration: operationGeneration
                    )
                    guard isActive(context, generation: operationGeneration) else { return }
                    cachedEntry = entry
                    state = state(from: entry, source: .network, freshness: .fresh)
                    state.lastHTTPStatus = 200
                    switch replacement {
                    case .persisted:
                        break
                    case .invalidated:
                        state.cachePersistenceIssue = true
                    case .unsafe:
                        state.cachePersistenceIssue = true
                        accessInvalidationHandler?()
                    }
                    return
                }
                cachedEntry = entry
                state = state(from: entry, source: .network, freshness: .fresh)
                state.lastHTTPStatus = 200
                await persist(entry, context: context, operationGeneration: operationGeneration)
            }
        } catch is CancellationError {
            guard isActive(context, generation: operationGeneration) else { return }
            state.lastSafeError = .cancelled
            state.freshness = state.value == nil ? .empty : previousFreshness
        } catch {
            guard isActive(context, generation: operationGeneration) else { return }
            handle(error)
        }
    }

    /// A visibility-reducing canonical response must never leave the older
    /// published/official representation eligible on disk. Prefer atomic
    /// replacement; if persistence fails, remove that product (or quarantine
    /// the whole disposable partition) before publishing the reduced view.
    private func replaceRevocableCacheFailClosed(
        with entry: ReadCacheEnvelope<Response>,
        context: ActiveMobileReadContext,
        operationGeneration: UInt
    ) async -> RevocableCacheReplacement {
        do {
            let data = try encoder.encode(entry)
            guard isActive(context, generation: operationGeneration), !Task.isCancelled else {
                return .unsafe
            }
            try await cache.write(data, product: product, partition: context.cachePartition)
            return .persisted
        } catch {
            do {
                try await cache.remove(product: product, partition: context.cachePartition)
                return .invalidated
            } catch {
                do {
                    try await cache.remove(partition: context.cachePartition)
                    return .invalidated
                } catch {
                    return .unsafe
                }
            }
        }
    }

    private func persist(
        _ entry: ReadCacheEnvelope<Response>,
        context: ActiveMobileReadContext,
        operationGeneration: UInt
    ) async {
        do {
            let data = try encoder.encode(entry)
            guard isActive(context, generation: operationGeneration), !Task.isCancelled else { return }
            try await cache.write(data, product: product, partition: context.cachePartition)
        } catch {
            guard isActive(context, generation: operationGeneration) else { return }
            state.cachePersistenceIssue = true
        }
    }

    private func handle(_ error: any Error) {
        let failure = classify(error)
        let serverDiagnostic = serverDiagnostic(error)
        state.lastSafeError = failure
        state.lastServerCode = serverDiagnostic.code
        state.lastHTTPStatus = serverDiagnostic.status
        state.isRefreshing = false

        switch failure {
        case .authentication, .authorization:
            cachedEntry = nil
            state = .empty
            state.freshness = .failed
            state.lastSafeError = failure
            state.lastServerCode = serverDiagnostic.code
            state.lastHTTPStatus = serverDiagnostic.status
            accessInvalidationHandler?()
        case .transport:
            state.freshness = state.value == nil ? .failed : .offline
        case .rateLimited, .unavailable, .contract, .cacheInconsistency:
            state.freshness = state.value == nil ? .failed : .stale
        case .cancelled:
            state.freshness = state.value == nil ? .empty : .stale
        }

        if serverDiagnostic.code == .mobileAPIUnavailable {
            authorityRevalidationHandler?()
        }

    }

    private func serverDiagnostic(_ error: any Error) -> (code: MobileErrorCode?, status: Int?) {
        guard let apiError = error as? MobileAPIClientError else { return (nil, nil) }
        switch apiError {
        case .server(let code, let status): return (code, status)
        case .unexpectedStatus(let status): return (nil, status)
        default: return (nil, nil)
        }
    }

    private func classify(_ error: any Error) -> MobileReadFailure {
        if let failure = error as? MobileReadFailure { return failure }
        if let credentialError = error as? MobileReadCredentialError {
            switch credentialError {
            case .authSessionUnavailable:
                return .transport
            case .authSessionMissing, .authIdentityChanged, .certificationUnavailable:
                return .authentication
            }
        }
        if error is MobileContractError || error is DecodingError { return .contract }
        guard let apiError = error as? MobileAPIClientError else { return .transport }
        switch apiError {
        case .missingBearer, .missingCertification:
            return .authentication
        case .transportUnavailable, .invalidHTTPResponse:
            return .transport
        case .unexpectedStatus(let status):
            if status == 401 { return .authentication }
            if status == 403 { return .authorization }
            if status == 429 { return .rateLimited }
            if status == 404 || status >= 500 { return .unavailable }
            return .contract
        case .server(let code, let status):
            if status == 401 || code == .unauthorized || code == .invalidToken {
                return .authentication
            }
            if status == 403 || code == .participantNotFound || code == .authCertificationFailed {
                return .authorization
            }
            if status == 429 { return .rateLimited }
            if status == 404 || status >= 500 || code == .mobileAPIUnavailable {
                return .unavailable
            }
            return .contract
        case .invalidURL:
            return .contract
        }
    }

    private func state(
        from entry: ReadCacheEnvelope<Response>,
        source: MobileReadSource,
        freshness: MobileReadFreshness
    ) -> MobileReadState<Value> {
        MobileReadState(
            value: entry.response.data,
            source: source,
            freshness: freshness,
            isRefreshing: freshness == .refreshing,
            revision: entry.response.meta.revision,
            generatedAt: entry.response.meta.generatedAt,
            fetchedAt: entry.fetchedAt,
            validatedAt: entry.validatedAt,
            lastSafeError: nil,
            lastServerCode: nil,
            lastHTTPStatus: nil,
            cachePersistenceIssue: false
        )
    }

    private func isActive(_ context: ActiveMobileReadContext, generation: UInt) -> Bool {
        activeContext == context && self.generation == generation
    }
}
