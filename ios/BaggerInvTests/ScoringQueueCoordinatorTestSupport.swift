import Foundation
@testable import BaggerInv

enum ScoringQueueCoordinatorTestError: Error, Equatable {
    case missingRecord
    case concurrentModification
    case invalidTransition
    case missingCanonical
    case unsupportedAPI
    case persistenceUnavailable
}

actor InMemoryScoringQueueRepository: ScoringQueueRepository {
    private var storage: [String: ScoringQueueRecord]
    private var identifierCounter: Int
    private var sequenceByPartition: [ScoringQueuePartition: Int64]
    private let saveDate: Date
    private(set) var saveCalls = 0
    private(set) var recoveryCalls = 0
    private(set) var handoffDiagnostics: [String] = []
    private(set) var handoffObservedPredecessorRefreshPending: Bool?
    private var identityReadFailureEnabled = false
    private var unresolvedIdentityCountAdjustment = 0
    private var suspendNextTransportStartReturn = false
    private var transportStartContinuation: CheckedContinuation<Void, Never>?

    init(records: [ScoringQueueRecord] = [], saveDate: Date = CoordinatorQueueFixtures.now) {
        storage = Dictionary(uniqueKeysWithValues: records.map { ($0.localQueueRecordId, $0) })
        identifierCounter = records.count
        sequenceByPartition = Dictionary(grouping: records, by: \ScoringQueueRecord.partition)
            .mapValues { $0.map(\.sequence).max() ?? 0 }
        self.saveDate = saveDate
    }

    func save(_ input: ScoringQueueSaveInput) throws -> ScoringQueueSaveResult {
        saveCalls += 1
        let sameHole = storage.values
            .filter {
                $0.partition == input.partition &&
                    $0.intent.holeNumber == input.intent.holeNumber &&
                    $0.isUnresolved
            }
            .sorted { $0.sequence < $1.sequence }
        if let duplicate = sameHole.first(where: { $0.intent == input.intent }) {
            return .reused(duplicate)
        }

        identifierCounter += 1
        let sequence = (sequenceByPartition[input.partition] ?? 0) + 1
        sequenceByPartition[input.partition] = sequence
        let record = input.makeQueuedRecord(
            localQueueRecordId: Self.uuid(identifierCounter),
            mutationId: Self.uuid(identifierCounter + 10_000),
            sequence: sequence,
            createdAt: saveDate
        )
        storage[record.localQueueRecordId] = record
        return .inserted(record)
    }

    func records(in partition: ScoringQueuePartition) -> [ScoringQueueRecord] {
        storage.values
            .filter { $0.partition == partition }
            .sorted { $0.sequence < $1.sequence }
    }

    func records(for identity: ScoringQueueIdentityPartition) throws -> [ScoringQueueRecord] {
        guard !identityReadFailureEnabled else {
            throw ScoringQueueCoordinatorTestError.persistenceUnavailable
        }
        return storage.values
            .filter { $0.partition.identity == identity }
            .sorted {
                $0.partition.matchId == $1.partition.matchId
                    ? $0.sequence < $1.sequence
                    : $0.partition.matchId < $1.partition.matchId
            }
    }

    func oldestUnresolved(in partition: ScoringQueuePartition) -> ScoringQueueRecord? {
        storage.values
            .filter { $0.partition == partition && $0.isUnresolved }
            .min { $0.sequence < $1.sequence }
    }

    func unresolvedCount(in partition: ScoringQueuePartition) -> Int {
        storage.values.filter { $0.partition == partition && $0.isUnresolved }.count
    }

    func unresolvedCount(for identity: ScoringQueueIdentityPartition) throws -> Int {
        guard !identityReadFailureEnabled else {
            throw ScoringQueueCoordinatorTestError.persistenceUnavailable
        }
        return storage.values.filter { $0.partition.identity == identity && $0.isUnresolved }.count +
            unresolvedIdentityCountAdjustment
    }

    func replace(
        _ updated: ScoringQueueRecord,
        expecting current: ScoringQueueRecord
    ) throws -> ScoringQueueRecord {
        guard let stored = storage[current.localQueueRecordId] else {
            throw ScoringQueueCoordinatorTestError.missingRecord
        }
        guard stored == current else {
            throw ScoringQueueCoordinatorTestError.concurrentModification
        }
        guard SQLiteScoringQueueRepository.genericReplacementIsStructurallyAllowed(
            updated,
            from: current
        ) else {
            throw ScoringQueueCoordinatorTestError.invalidTransition
        }
        storage[updated.localQueueRecordId] = updated
        return updated
    }

    func acquireSyncLease(
        in partition: ScoringQueuePartition,
        leaseId: String,
        at date: Date
    ) throws -> ScoringQueueRecord? {
        guard var record = oldestUnresolved(in: partition), record.state == .queued else {
            return nil
        }
        let current = record
        record.state = .syncing
        record.stateReasonCode = nil
        record.attempt.syncLeaseId = leaseId
        record.attempt.syncLeaseStartedAt = date
        record.updatedAt = date
        guard current == storage[current.localQueueRecordId] else {
            throw ScoringQueueCoordinatorTestError.invalidTransition
        }
        storage[record.localQueueRecordId] = record
        return record
    }

    func markTransportStarted(
        recordId: String,
        leaseId: String,
        at date: Date
    ) async throws -> ScoringQueueRecord {
        guard var record = storage[recordId],
              record.state == .syncing,
              record.attempt.syncLeaseId == leaseId
        else { throw ScoringQueueCoordinatorTestError.missingRecord }
        let current = record
        record.attempt.count += 1
        record.attempt.lastAttemptAt = date
        record.attempt.everSubmitted = true
        record.attempt.outcomeCertainty = .unknown
        record.updatedAt = date
        let persisted = try replace(record, expecting: current)
        if suspendNextTransportStartReturn {
            suspendNextTransportStartReturn = false
            await withCheckedContinuation { continuation in
                transportStartContinuation = continuation
            }
        }
        return persisted
    }

    func suspendNextTransportStart() {
        suspendNextTransportStartReturn = true
    }

    func hasSuspendedTransportStart() -> Bool {
        transportStartContinuation != nil
    }

    func resumeSuspendedTransportStart() {
        transportStartContinuation?.resume()
        transportStartContinuation = nil
    }

    func handOffCanonicalRevisions(
        recordId: String,
        afterAcknowledgedRecordId: String,
        evidence: ScoringQueueRevisionHandoffEvidence,
        at date: Date
    ) throws -> ScoringQueueRecord {
        guard var current = storage[recordId],
              let predecessor = storage[afterAcknowledgedRecordId],
              let acknowledgement = predecessor.acknowledgement
        else {
            handoffDiagnostics.append("missing-record-or-ack")
            throw ScoringQueueCoordinatorTestError.invalidTransition
        }
        handoffObservedPredecessorRefreshPending = acknowledgement.refreshPending
        let hasUnresolvedDependencyBetween = storage.values.contains {
            $0.partition == current.partition &&
                $0.sequence > predecessor.sequence &&
                $0.sequence < current.sequence &&
                $0.isUnresolved
        }
        let isSameHoleCorrection = predecessor.intent.holeNumber == current.intent.holeNumber
        let canonicalTargetIsSafe = isSameHoleCorrection
            ? evidence.targetOfficialGross == predecessor.intent.gross
            : evidence.targetOfficialGross == nil ||
                evidence.targetOfficialGross == current.base.officialGrossAtSave
        let checks: [(String, Bool)] = [
            ("current-queued", current.state == .queued),
            ("never-sent", current.isProvablyNeverTransmitted),
            ("no-lease", current.attempt.syncLeaseId == nil),
            ("predecessor-ack", predecessor.state == .acknowledged),
            ("accepted", acknowledgement.accepted),
            ("partition", predecessor.partition == current.partition),
            ("sequence", predecessor.sequence < current.sequence),
            ("snapshot-id", predecessor.base.snapshotId == current.base.snapshotId),
            ("snapshot-revision", predecessor.base.snapshotRevision == current.base.snapshotRevision),
            ("canonical-match", evidence.matchId == current.partition.matchId),
            ("canonical-player", evidence.playerId == current.partition.playerId),
            ("canonical-snapshot-id", evidence.snapshotId == current.base.snapshotId),
            ("canonical-snapshot-revision", evidence.snapshotRevision == current.base.snapshotRevision),
            ("active", evidence.matchStatus == .inProgress),
            ("can-score", evidence.canScore),
            ("not-read-only", !evidence.readOnly),
            ("match-revision", evidence.server.matchRevision == acknowledgement.canonicalMatchRevision),
            ("refresh-after-response", evidence.server.refreshedAt >= acknowledgement.responseAt),
            ("refresh-after-predecessor", evidence.server.refreshedAt >= predecessor.updatedAt),
            ("non-backward-refresh", evidence.server.refreshedAt >= current.lastKnownServer.refreshedAt),
            ("non-backward-match", evidence.server.matchRevision >= current.base.expectedMatchRevision),
            ("non-backward-hole", evidence.server.holeRevision >= current.base.expectedHoleRevision),
            ("non-backward-permission", evidence.server.permissionRevision >= current.lastKnownServer.permissionRevision),
            ("no-unresolved-between", !hasUnresolvedDependencyBetween),
            ("canonical-target", canonicalTargetIsSafe),
            ("hole-revision", !isSameHoleCorrection ||
                evidence.server.holeRevision == acknowledgement.canonicalHoleRevision)
        ]
        let failed = checks.filter { !$0.1 }.map(\.0)
        guard failed.isEmpty else {
            handoffDiagnostics.append(failed.joined(separator: ","))
            throw ScoringQueueCoordinatorTestError.invalidTransition
        }

        current.base.expectedMatchRevision = acknowledgement.canonicalMatchRevision
        current.base.expectedHoleRevision = evidence.server.holeRevision
        current.lastKnownServer = evidence.server
        current.updatedAt = max(date, max(current.updatedAt, evidence.server.refreshedAt))
        storage[current.localQueueRecordId] = current
        handoffDiagnostics.append("ok-hole-\(current.intent.holeNumber)")
        return current
    }

    func applyDeterministicSafeRebase(
        recordId: String,
        canonical: MobileScoringCurrent,
        at date: Date
    ) throws -> ScoringQueueRecord {
        guard var current = storage[recordId],
              current.state == .conflict,
              current.stateReasonCode == .revision,
              let conflict = current.conflict,
              conflict.refreshRequired,
              current.base.automaticRebaseCount < 3,
              canonical.match.matchId == current.partition.matchId,
              canonical.player.playerId == current.partition.playerId,
              canonical.snapshot.snapshotId == current.base.snapshotId,
              canonical.snapshot.revision == current.base.snapshotRevision,
              canonical.match.status == .inProgress,
              canonical.permission.canScore,
              !canonical.permission.readOnly
        else { throw ScoringQueueCoordinatorTestError.invalidTransition }
        let officialScore = canonical.scores.first {
            $0.holeNumber == current.intent.holeNumber
        }
        let officialGross = officialScore.map {
            ScoringQueueGross(
                teamOne: $0.gross.teamOne,
                teamTwo: $0.gross.teamTwo
            )
        }
        let holeRevision = officialScore?.revision ?? 0
        guard officialGross == nil || officialGross == current.base.officialGrossAtSave,
              canonical.match.matchRevision >= current.base.expectedMatchRevision,
              holeRevision >= current.base.expectedHoleRevision,
              canonical.match.permissionRevision >= current.lastKnownServer.permissionRevision,
              date >= conflict.recordedAt,
              date >= current.lastKnownServer.refreshedAt
        else { throw ScoringQueueCoordinatorTestError.invalidTransition }

        current.state = .queued
        current.stateReasonCode = nil
        current.base.expectedMatchRevision = canonical.match.matchRevision
        current.base.expectedHoleRevision = holeRevision
        current.base.automaticRebaseCount += 1
        current.lastKnownServer = ScoringQueueLastKnownServer(
            matchRevision: canonical.match.matchRevision,
            holeRevision: holeRevision,
            permissionRevision: canonical.match.permissionRevision,
            refreshedAt: date
        )
        current.conflict = nil
        current.attempt.nextRetryAt = nil
        current.updatedAt = max(date, current.updatedAt)
        storage[current.localQueueRecordId] = current
        return current
    }

    func recoverInterruptedSync(at date: Date) throws -> [ScoringQueueRecord] {
        recoveryCalls += 1
        var recovered: [ScoringQueueRecord] = []
        for current in storage.values.filter({ $0.state == .syncing }) {
            var updated = current
            updated.state = .retryable
            updated.stateReasonCode = .unknownOutcome
            updated.attempt.everSubmitted = true
            updated.attempt.outcomeCertainty = .unknown
            updated.attempt.nextRetryAt = date
            updated.attempt.syncLeaseId = nil
            updated.attempt.syncLeaseStartedAt = nil
            updated.updatedAt = date
            storage[updated.localQueueRecordId] = updated
            recovered.append(updated)
        }
        return recovered.sorted { $0.sequence < $1.sequence }
    }

    func snapshot() -> [ScoringQueueRecord] {
        storage.values.sorted {
            $0.partition.matchId == $1.partition.matchId
                ? $0.sequence < $1.sequence
                : $0.partition.matchId < $1.partition.matchId
        }
    }

    func record(id: String) -> ScoringQueueRecord? {
        storage[id]
    }

    func setIdentityReadFailure(_ enabled: Bool) {
        identityReadFailureEnabled = enabled
    }

    func setUnresolvedIdentityCountAdjustment(_ adjustment: Int) {
        unresolvedIdentityCountAdjustment = adjustment
    }

    private static func uuid(_ value: Int) -> String {
        String(format: "00000000-0000-4000-8000-%012d", value)
    }

}

@MainActor
final class CoordinatorQueueCredentials: MobileReadCredentialProviding {
    var credentialError: MobileReadCredentialError?
    var refreshError: MobileReadCredentialError?
    var returnedAuthUserID: String?
    private(set) var credentialCalls = 0
    private(set) var refreshCalls = 0
    private var shouldSuspendNextRefresh = false
    private var refreshContinuation: CheckedContinuation<Void, Never>?

    func credentials(expectedAuthUserID: String) async throws -> MobileReadCredentials {
        credentialCalls += 1
        if let credentialError { throw credentialError }
        return credentialsValue(expectedAuthUserID: expectedAuthUserID, suffix: "normal")
    }

    func refreshedCredentials(expectedAuthUserID: String) async throws -> MobileReadCredentials {
        refreshCalls += 1
        if shouldSuspendNextRefresh {
            shouldSuspendNextRefresh = false
            await withCheckedContinuation { continuation in
                refreshContinuation = continuation
            }
        }
        if let refreshError { throw refreshError }
        return credentialsValue(expectedAuthUserID: expectedAuthUserID, suffix: "refreshed")
    }

    func suspendNextRefresh() {
        shouldSuspendNextRefresh = true
    }

    func hasSuspendedRefresh() -> Bool {
        refreshContinuation != nil
    }

    func resumeSuspendedRefresh() {
        refreshContinuation?.resume()
        refreshContinuation = nil
    }

    private func credentialsValue(
        expectedAuthUserID: String,
        suffix: String
    ) -> MobileReadCredentials {
        MobileReadCredentials(
            authUserID: returnedAuthUserID ?? expectedAuthUserID,
            accessToken: "test-access-\(suffix)",
            certification: "test-certification-\(suffix)"
        )
    }
}

@MainActor
final class CoordinatorQueueAPI: MobileAPIServing {
    enum CurrentOutcome {
        case canonical
        case fail(MobileAPIClientError)
        case incompatibleContract
    }

    enum HoleOutcome {
        case accept
        case fail(MobileScoringMutationError)
    }

    private var canonicalByMatch: [String: MobileScoringCurrentResponse] = [:]
    private var currentOutcomesByMatch: [String: [CurrentOutcome]] = [:]
    private var outcomesByMatch: [String: [HoleOutcome]] = [:]
    private var activeByMatch: [String: Int] = [:]
    private(set) var scoringCurrentMatchIDs: [String] = []
    private(set) var holeRequests: [MobileScoringHoleRequest] = []
    private(set) var holeAccessTokens: [String] = []
    private(set) var maximumActiveMutations = 0
    private(set) var maximumActiveByMatch: [String: Int] = [:]
    var mutationDelayNanoseconds: UInt64 = 0

    func configureCanonical(
        for partition: ScoringQueuePartition,
        matchRevision: Int = 12,
        permissionRevision: Int = 4,
        scores: [MobileScoringHoleScore] = [],
        status: MobileMatchStatus = .inProgress,
        canScore: Bool = true,
        readOnly: Bool = false,
        snapshotId: String? = nil,
        snapshotRevision: Int = 1
    ) {
        canonicalByMatch[partition.matchId] = CoordinatorQueueFixtures.canonicalResponse(
            partition: partition,
            matchRevision: matchRevision,
            permissionRevision: permissionRevision,
            scores: scores,
            status: status,
            canScore: canScore,
            readOnly: readOnly,
            snapshotId: snapshotId,
            snapshotRevision: snapshotRevision
        )
    }

    func setOutcomes(_ outcomes: [HoleOutcome], for matchId: String) {
        outcomesByMatch[matchId] = outcomes
    }

    func setCurrentOutcomes(_ outcomes: [CurrentOutcome], for matchId: String) {
        currentOutcomesByMatch[matchId] = outcomes
    }

    func health() async throws -> MobileHealthResponse { TestFixtures.health }

    func requestOTP(identifier: String, captchaToken: String) async throws -> OTPRequestAcknowledgement {
        TestFixtures.otpAcknowledgement
    }

    func certify(challengeId: String, accessToken: String) async throws -> OTPCertificationAcknowledgement {
        TestFixtures.certificationAcknowledgement
    }

    func participantSession(accessToken: String, certification: String) async throws -> ParticipantSession {
        TestFixtures.participant
    }

    func today(
        accessToken: String,
        certification: String,
        etag: String?
    ) async throws -> MobileConditionalRead<MobileTodayResponse> {
        .modified(TestFixtures.todayResponse, etag: nil)
    }

    func matches(
        accessToken: String,
        certification: String,
        etag: String?
    ) async throws -> MobileConditionalRead<MobileMatchesResponse> {
        .modified(TestFixtures.matchesResponse, etag: nil)
    }

    func leaders(
        accessToken: String,
        certification: String,
        etag: String?
    ) async throws -> MobileConditionalRead<MobileLeadersResponse> {
        .modified(TestFixtures.leadersResponse, etag: nil)
    }

    func schedule(
        accessToken: String,
        certification: String,
        etag: String?
    ) async throws -> MobileConditionalRead<MobileScheduleResponse> {
        .modified(TestFixtures.scheduleResponse, etag: nil)
    }

    func scoringCurrent(
        accessToken: String,
        certification: String,
        matchID: String?
    ) async throws -> MobileScoringCurrentResponse {
        guard let matchID, let response = canonicalByMatch[matchID] else {
            throw ScoringQueueCoordinatorTestError.missingCanonical
        }
        scoringCurrentMatchIDs.append(matchID)
        if var outcomes = currentOutcomesByMatch[matchID], !outcomes.isEmpty {
            let outcome = outcomes.removeFirst()
            currentOutcomesByMatch[matchID] = outcomes
            switch outcome {
            case .canonical:
                break
            case .fail(let error):
                throw error
            case .incompatibleContract:
                throw MobileContractError.incompatibleResponse
            }
        }
        return response
    }

    func scoringHole(
        request: MobileScoringHoleRequest,
        accessToken: String,
        certification: String
    ) async throws -> MobileScoringHoleResponse {
        holeRequests.append(request)
        holeAccessTokens.append(accessToken)
        activeByMatch[request.matchId, default: 0] += 1
        let activeTotal = activeByMatch.values.reduce(0, +)
        maximumActiveMutations = max(maximumActiveMutations, activeTotal)
        maximumActiveByMatch[request.matchId] = max(
            maximumActiveByMatch[request.matchId] ?? 0,
            activeByMatch[request.matchId] ?? 0
        )
        defer { activeByMatch[request.matchId, default: 1] -= 1 }

        if mutationDelayNanoseconds > 0 {
            try await Task.sleep(nanoseconds: mutationDelayNanoseconds)
        }

        let outcome: HoleOutcome
        if var outcomes = outcomesByMatch[request.matchId], !outcomes.isEmpty {
            outcome = outcomes.removeFirst()
            outcomesByMatch[request.matchId] = outcomes
        } else {
            outcome = .accept
        }
        switch outcome {
        case .fail(let error):
            throw error
        case .accept:
            return try accept(request)
        }
    }

    private func accept(_ request: MobileScoringHoleRequest) throws -> MobileScoringHoleResponse {
        guard let currentResponse = canonicalByMatch[request.matchId],
              let current = currentResponse.data.scoring
        else { throw ScoringQueueCoordinatorTestError.missingCanonical }

        let previousHoleRevision = current.scores
            .first(where: { $0.holeNumber == request.holeNumber })?.revision ?? 0
        let hole = CoordinatorQueueFixtures.score(
            holeNumber: request.holeNumber,
            revision: previousHoleRevision + 1,
            gross: ScoringQueueGross(
                teamOne: request.teamOneGrossScores,
                teamTwo: request.teamTwoGrossScores
            )
        )
        let newMatchRevision = current.match.matchRevision + 1
        canonicalByMatch[request.matchId] = CoordinatorQueueFixtures.canonicalResponse(
            partition: ScoringQueuePartition(
                authUserId: CoordinatorQueueFixtures.identity.authUserId,
                playerId: current.player.playerId,
                tournamentId: CoordinatorQueueFixtures.identity.tournamentId,
                matchId: request.matchId
            ),
            matchRevision: newMatchRevision,
            permissionRevision: current.match.permissionRevision,
            scores: current.scores.filter { $0.holeNumber != request.holeNumber } + [hole],
            status: current.match.status,
            canScore: current.permission.canScore,
            readOnly: current.permission.readOnly
        )

        return MobileScoringHoleResponse(
            ok: true,
            apiVersion: "v1",
            data: MobileScoringHoleAcknowledgement(
                mutationId: request.mutationId,
                accepted: true,
                idempotent: false,
                semanticNoop: false,
                matchId: request.matchId,
                hole: hole,
                match: MobileScoringAcknowledgedMatch(
                    revision: newMatchRevision,
                    status: .inProgress,
                    currentHole: min(request.holeNumber + 1, 18),
                    holesRemaining: max(18 - request.holeNumber, 0),
                    scorecardComplete: false,
                    statusText: nil
                ),
                refreshRequired: false
            ),
            meta: TestFixtures.scoringResponse.meta
        )
    }
}

@MainActor
final class CoordinatorQueueClock {
    var value: Date

    init(_ value: Date = CoordinatorQueueFixtures.now) {
        self.value = value
    }

    func advance(_ interval: TimeInterval) {
        value = value.addingTimeInterval(interval)
    }
}

enum CoordinatorQueueFixtures {
    static let now = Date(timeIntervalSince1970: 1_800_000_000)
    static let identity = ScoringQueueIdentityPartition(
        authUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        playerId: "P1",
        tournamentId: "2026"
    )

    static func partition(
        matchId: String,
        identity: ScoringQueueIdentityPartition = identity
    ) -> ScoringQueuePartition {
        ScoringQueuePartition(
            authUserId: identity.authUserId,
            playerId: identity.playerId,
            tournamentId: identity.tournamentId,
            matchId: matchId
        )
    }

    static func input(
        partition: ScoringQueuePartition = partition(matchId: "match-1"),
        holeNumber: Int = 1,
        teamOne: [Int] = [4, 5],
        teamTwo: [Int] = [5, 6],
        expectedMatchRevision: Int = 12,
        expectedHoleRevision: Int = 0,
        officialGrossAtSave: ScoringQueueGross? = nil
    ) -> ScoringQueueSaveInput {
        ScoringQueueSaveInput(
            partition: partition,
            intent: ScoringQueueIntent(
                holeNumber: holeNumber,
                teamOneGrossScores: teamOne,
                teamTwoGrossScores: teamTwo
            ),
            base: ScoringQueueBase(
                expectedMatchRevision: expectedMatchRevision,
                expectedHoleRevision: expectedHoleRevision,
                snapshotId: "\(partition.matchId):snapshot",
                snapshotRevision: 1,
                scoringFormat: .bestBall,
                sideSlotCount: 2,
                officialGrossAtSave: officialGrossAtSave
            ),
            lastKnownServer: ScoringQueueLastKnownServer(
                matchRevision: expectedMatchRevision,
                holeRevision: expectedHoleRevision,
                permissionRevision: 4,
                refreshedAt: now.addingTimeInterval(-60)
            ),
            originatingAppBuild: "coordinator-tests"
        )
    }

    static func record(
        matchId: String = "match-1",
        holeNumber: Int = 1,
        teamOne: [Int] = [4, 5],
        teamTwo: [Int] = [5, 6],
        sequence: Int64 = 1,
        state: ScoringQueueState = .queued,
        reason: ScoringQueueStateReasonCode? = nil,
        createdAt: Date = now,
        attempt: ScoringQueueAttempt = .unattempted,
        acknowledgement: ScoringQueueAcknowledgement? = nil,
        conflict: ScoringQueueConflict? = nil,
        identity: ScoringQueueIdentityPartition = identity,
        officialGrossAtSave: ScoringQueueGross? = nil,
        automaticRebaseCount: Int = 0
    ) -> ScoringQueueRecord {
        let partition = partition(matchId: matchId, identity: identity)
        let input = input(
            partition: partition,
            holeNumber: holeNumber,
            teamOne: teamOne,
            teamTwo: teamTwo,
            expectedMatchRevision: 12,
            officialGrossAtSave: officialGrossAtSave
        )
        var base = input.base
        base.automaticRebaseCount = automaticRebaseCount
        return ScoringQueueRecord(
            localQueueRecordId: String(format: "10000000-0000-4000-8000-%012lld", sequence),
            mutationId: String(format: "20000000-0000-4000-8000-%012lld", sequence),
            partition: partition,
            intent: input.intent,
            base: base,
            sequence: sequence,
            state: state,
            stateReasonCode: reason,
            attempt: attempt,
            lastKnownServer: input.lastKnownServer,
            conflict: conflict,
            acknowledgement: acknowledgement,
            originatingAppBuild: input.originatingAppBuild,
            createdAt: createdAt
        )
    }

    static func score(
        holeNumber: Int,
        revision: Int,
        gross: ScoringQueueGross
    ) -> MobileScoringHoleScore {
        MobileScoringHoleScore(
            holeNumber: holeNumber,
            revision: revision,
            gross: MobileScoringGross(teamOne: gross.teamOne, teamTwo: gross.teamTwo),
            strokes: MobileScoringStrokes(
                teamOne: Array(repeating: 0, count: gross.teamOne.count),
                teamTwo: Array(repeating: 0, count: gross.teamTwo.count)
            ),
            net: MobileScoringNet(teamOne: nil, teamTwo: nil),
            winner: nil,
            updatedAt: TestFixtures.scoringResponse.meta.generatedAt
        )
    }

    static func canonicalResponse(
        partition: ScoringQueuePartition,
        matchRevision: Int,
        permissionRevision: Int,
        scores: [MobileScoringHoleScore],
        status: MobileMatchStatus,
        canScore: Bool,
        readOnly: Bool,
        snapshotId: String? = nil,
        snapshotRevision: Int = 1
    ) -> MobileScoringCurrentResponse {
        let template = TestFixtures.scoringResponse.data.scoring!
        let scoring = MobileScoringCurrent(
            match: MobileScoringMatch(
                matchId: partition.matchId,
                roundNumber: 2,
                format: .bestBall,
                status: status,
                matchRevision: matchRevision,
                permissionRevision: permissionRevision,
                result: nil
            ),
            player: MobileScoringPlayer(
                playerId: partition.playerId,
                displayName: "Queue Test Player",
                teamSide: 1
            ),
            sides: template.sides,
            course: template.course,
            scores: scores.sorted { $0.holeNumber < $1.holeNumber },
            progress: MobileScoringProgress(
                currentHole: min((scores.map(\.holeNumber).max() ?? 0) + 1, 18),
                holesRemaining: max(18 - scores.count, 0),
                scorecardComplete: scores.count == 18,
                statusText: nil
            ),
            permission: MobileScoringPermission(
                canScore: canScore,
                readOnly: readOnly,
                canFinalize: false,
                reason: nil
            ),
            snapshot: MobileScoringSnapshot(
                snapshotId: snapshotId ?? "\(partition.matchId):snapshot",
                revision: snapshotRevision
            )
        )
        return MobileScoringCurrentResponse(
            ok: true,
            apiVersion: "v1",
            data: MobileScoringCurrentData(scoring: scoring),
            meta: TestFixtures.scoringResponse.meta
        )
    }
}
