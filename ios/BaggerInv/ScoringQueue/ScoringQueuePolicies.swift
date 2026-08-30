import Foundation

enum ScoringQueueSide: String, Equatable, Sendable {
    case teamOne
    case teamTwo
}

enum ScoringQueueValidationIssue: Equatable, Sendable {
    case unsupportedQueueSchemaVersion(Int)
    case unsupportedAPIContractVersion(String)
    case invalidIdentifier(field: String)
    case invalidHoleNumber(Int)
    case invalidScoreCount(side: ScoringQueueSide, expected: Int, actual: Int)
    case invalidGrossScore(side: ScoringQueueSide, value: Int)
    case invalidSideSlotCount(expected: Int, actual: Int)
    case invalidRevision(field: String, value: Int)
    case invalidSequence(Int64)
    case invalidAttemptCount(Int)
    case invalidAutomaticRebaseCount(Int)
    case incoherentRevisionHandoff
    case incoherentOutcomeCertainty
    case incoherentSyncLease
    case incoherentTimestamps
    case invalidStateMetadata(ScoringQueueState)
    case invalidStateReason(state: ScoringQueueState, reason: ScoringQueueStateReasonCode?)
    case recordTooLarge(actualBytes: Int, maximumBytes: Int)
    case requestTooLarge(actualBytes: Int, maximumBytes: Int)
    case encodingFailed
}

struct ScoringQueueValidationResult: Equatable, Sendable {
    let issues: [ScoringQueueValidationIssue]

    var isValid: Bool { issues.isEmpty }
}

enum ScoringQueueValidator {
    static func validate(_ input: ScoringQueueSaveInput) -> ScoringQueueValidationResult {
        var issues: [ScoringQueueValidationIssue] = []
        validate(partition: input.partition, into: &issues)
        validate(intent: input.intent, base: input.base, into: &issues)
        validate(lastKnownServer: input.lastKnownServer, into: &issues)
        if input.originatingAppBuild.isEmpty {
            issues.append(.invalidIdentifier(field: "originatingAppBuild"))
        }
        validateRequestSize(intent: input.intent, base: input.base, matchId: input.partition.matchId, mutationId: UUID().uuidString.lowercased(), into: &issues)
        return ScoringQueueValidationResult(issues: issues)
    }

    static func validate(_ record: ScoringQueueRecord) -> ScoringQueueValidationResult {
        var issues: [ScoringQueueValidationIssue] = []

        if record.queueSchemaVersion != ScoringQueueContract.queueSchemaVersion {
            issues.append(.unsupportedQueueSchemaVersion(record.queueSchemaVersion))
        }
        if record.apiContractVersion != ScoringQueueContract.apiContractVersion {
            issues.append(.unsupportedAPIContractVersion(record.apiContractVersion))
        }
        if !isUUID(record.localQueueRecordId) {
            issues.append(.invalidIdentifier(field: "localQueueRecordId"))
        }
        if !isServerIdentifier(record.mutationId) {
            issues.append(.invalidIdentifier(field: "mutationId"))
        }

        validate(partition: record.partition, into: &issues)
        validate(intent: record.intent, base: record.base, into: &issues)
        validate(lastKnownServer: record.lastKnownServer, into: &issues)

        if record.sequence < 0 {
            issues.append(.invalidSequence(record.sequence))
        }
        if record.originatingAppBuild.isEmpty {
            issues.append(.invalidIdentifier(field: "originatingAppBuild"))
        }
        if record.attempt.count < 0 || record.attempt.count == Int.max {
            issues.append(.invalidAttemptCount(record.attempt.count))
        }
        validate(attempt: record.attempt, state: record.state, into: &issues)
        validate(stateMetadata: record, into: &issues)

        let retryOrderIsInvalid: Bool
        if let lastAttemptAt = record.attempt.lastAttemptAt,
           let nextRetryAt = record.attempt.nextRetryAt {
            retryOrderIsInvalid = nextRetryAt < lastAttemptAt
        } else {
            retryOrderIsInvalid = false
        }

        if record.updatedAt < record.createdAt ||
            record.attempt.lastAttemptAt.map({ $0 < record.createdAt }) == true ||
            record.attempt.syncLeaseStartedAt.map({ $0 < record.createdAt }) == true ||
            retryOrderIsInvalid ||
            record.acknowledgement.map({ $0.responseAt < record.createdAt }) == true ||
            record.resolution.map({ $0.resolvedAt < record.createdAt }) == true ||
            record.conflict.map({ $0.recordedAt < record.createdAt }) == true {
            issues.append(.incoherentTimestamps)
        }

        validateRecordSize(record, into: &issues)
        validateRequestSize(
            intent: record.intent,
            base: record.base,
            matchId: record.partition.matchId,
            mutationId: record.mutationId,
            into: &issues
        )
        return ScoringQueueValidationResult(issues: issues)
    }

    static func isServerIdentifier(_ value: String) -> Bool {
        let bytes = Array(value.utf8)
        guard !bytes.isEmpty, bytes.count <= 128, isASCIIAlphaNumeric(bytes[0]) else {
            return false
        }
        return bytes.dropFirst().allSatisfy { byte in
            isASCIIAlphaNumeric(byte) || byte == 46 || byte == 95 || byte == 58 || byte == 45
        }
    }

    private static func validate(
        partition: ScoringQueuePartition,
        into issues: inout [ScoringQueueValidationIssue]
    ) {
        if !isUUID(partition.authUserId) {
            issues.append(.invalidIdentifier(field: "partition.authUserId"))
        }
        if !isBoundedNonempty(partition.playerId) {
            issues.append(.invalidIdentifier(field: "partition.playerId"))
        }
        if !isBoundedNonempty(partition.tournamentId) {
            issues.append(.invalidIdentifier(field: "partition.tournamentId"))
        }
        if !isServerIdentifier(partition.matchId) {
            issues.append(.invalidIdentifier(field: "partition.matchId"))
        }
    }

    private static func validate(
        intent: ScoringQueueIntent,
        base: ScoringQueueBase,
        into issues: inout [ScoringQueueValidationIssue]
    ) {
        if !(1...18).contains(intent.holeNumber) {
            issues.append(.invalidHoleNumber(intent.holeNumber))
        }

        let expectedCount = expectedScoreCount(for: base.scoringFormat)
        if base.sideSlotCount != expectedCount {
            issues.append(.invalidSideSlotCount(expected: expectedCount, actual: base.sideSlotCount))
        }
        validate(scores: intent.teamOneGrossScores, side: .teamOne, expectedCount: expectedCount, into: &issues)
        validate(scores: intent.teamTwoGrossScores, side: .teamTwo, expectedCount: expectedCount, into: &issues)

        if let officialGross = base.officialGrossAtSave {
            validate(scores: officialGross.teamOne, side: .teamOne, expectedCount: expectedCount, into: &issues)
            validate(scores: officialGross.teamTwo, side: .teamTwo, expectedCount: expectedCount, into: &issues)
        }

        validateRevision(base.expectedMatchRevision, field: "base.expectedMatchRevision", into: &issues)
        validateRevision(base.expectedHoleRevision, field: "base.expectedHoleRevision", into: &issues)
        validateRevision(base.originalExpectedMatchRevision, field: "base.originalExpectedMatchRevision", into: &issues)
        validateRevision(base.originalExpectedHoleRevision, field: "base.originalExpectedHoleRevision", into: &issues)
        validateRevision(base.snapshotRevision, field: "base.snapshotRevision", into: &issues)

        if base.expectedMatchRevision < base.originalExpectedMatchRevision ||
            base.expectedHoleRevision < base.originalExpectedHoleRevision {
            issues.append(.incoherentRevisionHandoff)
        }

        if base.automaticRebaseCount < 0 || base.automaticRebaseCount > ScoringQueueRevisionPolicy.maximumAutomaticRebases {
            issues.append(.invalidAutomaticRebaseCount(base.automaticRebaseCount))
        }
        if let snapshotId = base.snapshotId, snapshotId.isEmpty {
            issues.append(.invalidIdentifier(field: "base.snapshotId"))
        }
    }

    private static func validate(
        scores: [Int],
        side: ScoringQueueSide,
        expectedCount: Int,
        into issues: inout [ScoringQueueValidationIssue]
    ) {
        if scores.count != expectedCount {
            issues.append(.invalidScoreCount(side: side, expected: expectedCount, actual: scores.count))
        }
        for score in scores where !(1...20).contains(score) {
            issues.append(.invalidGrossScore(side: side, value: score))
        }
    }

    private static func validate(
        lastKnownServer: ScoringQueueLastKnownServer,
        into issues: inout [ScoringQueueValidationIssue]
    ) {
        validateRevision(lastKnownServer.matchRevision, field: "lastKnownServer.matchRevision", into: &issues)
        validateRevision(lastKnownServer.holeRevision, field: "lastKnownServer.holeRevision", into: &issues)
        validateRevision(lastKnownServer.permissionRevision, field: "lastKnownServer.permissionRevision", into: &issues)
    }

    private static func validate(
        attempt: ScoringQueueAttempt,
        state: ScoringQueueState,
        into issues: inout [ScoringQueueValidationIssue]
    ) {
        switch attempt.outcomeCertainty {
        case .notSent where attempt.everSubmitted:
            issues.append(.incoherentOutcomeCertainty)
        case .unknown where !attempt.everSubmitted,
             .knownRejected where !attempt.everSubmitted,
             .knownAccepted where !attempt.everSubmitted:
            issues.append(.incoherentOutcomeCertainty)
        default:
            break
        }

        let hasLeaseId = attempt.syncLeaseId != nil
        let hasLeaseStart = attempt.syncLeaseStartedAt != nil
        if hasLeaseId != hasLeaseStart || (state == .syncing && (!hasLeaseId || !hasLeaseStart)) ||
            (state != .syncing && (hasLeaseId || hasLeaseStart)) ||
            attempt.syncLeaseId?.isEmpty == true {
            issues.append(.incoherentSyncLease)
        }
    }

    private static func validate(
        stateMetadata record: ScoringQueueRecord,
        into issues: inout [ScoringQueueValidationIssue]
    ) {
        if !ScoringQueueTransitionPolicy.isReason(record.stateReasonCode, allowedFor: record.state) {
            issues.append(.invalidStateReason(state: record.state, reason: record.stateReasonCode))
        }

        switch record.state {
        case .acknowledged:
            guard let acknowledgement = record.acknowledgement,
                  acknowledgement.accepted,
                  acknowledgement.canonicalMatchRevision >= 0,
                  acknowledgement.canonicalHoleRevision >= 0,
                  record.attempt.outcomeCertainty == .knownAccepted else {
                issues.append(.invalidStateMetadata(record.state))
                return
            }
        case .conflict:
            guard record.conflict != nil,
                  record.acknowledgement.map({ acknowledgement in
                      acknowledgement.accepted &&
                      acknowledgement.refreshPending &&
                      acknowledgement.canonicalMatchRevision >= 0 &&
                      acknowledgement.canonicalHoleRevision >= 0 &&
                      record.attempt.outcomeCertainty == .knownAccepted
                  }) ?? true else {
                issues.append(.invalidStateMetadata(record.state))
                return
            }
        case .actionRequired:
            // A server-accepted mutation can move from conflict into a
            // lifecycle/permission review state after its mandatory refresh.
            // Preserve that acceptance proof so this mutation ID can never be
            // treated as submit-eligible again. Ordinary action-required
            // records have neither acknowledgement nor conflict metadata.
            guard record.acknowledgement.map({ _ in
                record.hasAcceptedAcknowledgementProof && record.conflict != nil
            }) ?? true else {
                issues.append(.invalidStateMetadata(record.state))
                return
            }
        case .quarantined:
            guard record.quarantineReason != nil else {
                issues.append(.invalidStateMetadata(record.state))
                return
            }
        case .resolved:
            guard record.resolution != nil else {
                issues.append(.invalidStateMetadata(record.state))
                return
            }
        case .queued, .syncing, .retryable:
            break
        }

        // A later cross-device write can make the mandatory canonical refresh
        // disagree with an already accepted mutation. Keep the accepted proof
        // on that conflict/action-required record until the golfer explicitly
        // resolves it or canonical state proves it equivalent.
        if record.state != .acknowledged,
           record.state != .conflict,
           record.state != .actionRequired,
           record.acknowledgement != nil {
            issues.append(.invalidStateMetadata(record.state))
        }
        if record.state != .resolved, record.resolution != nil {
            issues.append(.invalidStateMetadata(record.state))
        }
        if record.state != .quarantined, record.quarantineReason != nil {
            issues.append(.invalidStateMetadata(record.state))
        }

        if let conflict = record.conflict {
            if let officialGross = conflict.officialGross {
                let expectedCount = expectedScoreCount(for: record.base.scoringFormat)
                validate(scores: officialGross.teamOne, side: .teamOne, expectedCount: expectedCount, into: &issues)
                validate(scores: officialGross.teamTwo, side: .teamTwo, expectedCount: expectedCount, into: &issues)
            }
            for (field, revision) in [
                ("conflict.currentMatchRevision", conflict.currentMatchRevision),
                ("conflict.currentHoleRevision", conflict.currentHoleRevision),
                ("conflict.currentPermissionRevision", conflict.currentPermissionRevision),
            ] {
                if let revision {
                    validateRevision(revision, field: field, into: &issues)
                }
            }
        }
    }

    private static func validateRevision(
        _ revision: Int,
        field: String,
        into issues: inout [ScoringQueueValidationIssue]
    ) {
        if revision < 0 {
            issues.append(.invalidRevision(field: field, value: revision))
        }
    }

    private static func validateRecordSize(
        _ record: ScoringQueueRecord,
        into issues: inout [ScoringQueueValidationIssue]
    ) {
        do {
            let byteCount = try encodedByteCount(record)
            if byteCount > ScoringQueueContract.maximumRecordBytes {
                issues.append(.recordTooLarge(
                    actualBytes: byteCount,
                    maximumBytes: ScoringQueueContract.maximumRecordBytes
                ))
            }
        } catch {
            issues.append(.encodingFailed)
        }
    }

    private static func validateRequestSize(
        intent: ScoringQueueIntent,
        base: ScoringQueueBase,
        matchId: String,
        mutationId: String,
        into issues: inout [ScoringQueueValidationIssue]
    ) {
        let request = HoleRequestProjection(
            matchId: matchId,
            holeNumber: intent.holeNumber,
            teamOneGrossScores: intent.teamOneGrossScores,
            teamTwoGrossScores: intent.teamTwoGrossScores,
            mutationId: mutationId,
            expectedMatchRevision: base.expectedMatchRevision,
            expectedHoleRevision: base.expectedHoleRevision
        )
        do {
            let byteCount = try encodedByteCount(request)
            if byteCount > ScoringQueueContract.maximumRequestBytes {
                issues.append(.requestTooLarge(
                    actualBytes: byteCount,
                    maximumBytes: ScoringQueueContract.maximumRequestBytes
                ))
            }
        } catch {
            issues.append(.encodingFailed)
        }
    }

    private static func encodedByteCount<T: Encodable>(_ value: T) throws -> Int {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.sortedKeys]
        return try encoder.encode(value).count
    }

    private static func expectedScoreCount(for format: ScoringQueueFormat) -> Int {
        format == .bestBall ? 2 : 1
    }

    private static func isUUID(_ value: String) -> Bool {
        UUID(uuidString: value) != nil
    }

    private static func isBoundedNonempty(_ value: String) -> Bool {
        !value.isEmpty && value.utf8.count <= 128
    }

    private static func isASCIIAlphaNumeric(_ byte: UInt8) -> Bool {
        (48...57).contains(byte) || (65...90).contains(byte) || (97...122).contains(byte)
    }

    private struct HoleRequestProjection: Encodable {
        let matchId: String
        let holeNumber: Int
        let teamOneGrossScores: [Int]
        let teamTwoGrossScores: [Int]
        let mutationId: String
        let expectedMatchRevision: Int
        let expectedHoleRevision: Int
    }
}

enum ScoringQueueTransitionContext: Equatable, Sendable {
    case ordinary
    case deterministicSafeRebase
}

enum ScoringQueueTransitionPolicy {
    static func allowedNextStates(from state: ScoringQueueState) -> [ScoringQueueState] {
        switch state {
        case .queued:
            [.syncing, .actionRequired, .conflict, .quarantined, .resolved]
        case .syncing:
            [.acknowledged, .retryable, .conflict, .actionRequired, .quarantined]
        case .retryable:
            [.queued, .syncing, .acknowledged, .conflict, .actionRequired, .quarantined, .resolved]
        case .acknowledged:
            [.conflict]
        case .conflict:
            [.actionRequired, .quarantined, .resolved]
        case .actionRequired:
            [.conflict, .resolved, .quarantined]
        case .quarantined:
            [.resolved]
        case .resolved:
            []
        }
    }

    static func canTransition(
        from: ScoringQueueState,
        to: ScoringQueueState,
        context: ScoringQueueTransitionContext = .ordinary
    ) -> Bool {
        if allowedNextStates(from: from).contains(to) {
            return true
        }
        switch context {
        case .deterministicSafeRebase:
            return from == .conflict && to == .queued
        case .ordinary:
            return false
        }
    }

    static func isReason(
        _ reason: ScoringQueueStateReasonCode?,
        allowedFor state: ScoringQueueState
    ) -> Bool {
        switch state {
        case .queued, .syncing, .acknowledged, .resolved:
            reason == nil
        case .retryable:
            reason == .authRefresh || reason == .environment || reason == .unknownOutcome
        case .conflict:
            reason == .revision
        case .actionRequired:
            switch reason {
            case .authentication, .identity, .identityChanged, .identityMismatch,
                 .matchMissing, .authorization, .readOnly, .finalized,
                 .staleTournament, .stale, .rebaseLimit, .queueHealth:
                true
            default:
                false
            }
        case .quarantined:
            switch reason {
            case .invalidRecordOrContract, .idempotencyConflict,
                 .unknownPermanentResponse, .staleIdempotencyUncertain, .queueHealth:
                true
            default:
                false
            }
        }
    }
}

extension ScoringQueueRecord {
    /// Durable proof that this logical mutation was already accepted by the
    /// server and is awaiting explicit/canonical reconciliation. Such a record
    /// is refresh/review-only and must never be automatically rebased or sent.
    var hasAcceptedAcknowledgementProof: Bool {
        guard let acknowledgement else { return false }
        return acknowledgement.accepted &&
            acknowledgement.refreshPending &&
            attempt.outcomeCertainty == .knownAccepted
    }

    var isUnresolved: Bool {
        switch state {
        case .acknowledged:
            acknowledgement?.refreshPending ?? true
        case .resolved:
            false
        case .queued, .syncing, .retryable, .conflict, .actionRequired, .quarantined:
            true
        }
    }

    var mustPrecedeLaterRecords: Bool { isUnresolved }

    var blocksAutomaticReplayForMatch: Bool {
        switch state {
        case .conflict, .actionRequired, .quarantined:
            true
        case .acknowledged:
            acknowledgement?.refreshPending ?? true
        case .queued, .syncing, .retryable, .resolved:
            false
        }
    }

    /// Unlike queued/syncing/retryable/acknowledged work, these states prove
    /// that automatic progression is unsafe. They block admission of a new
    /// intent anywhere in the same Match until canonical review resolves the
    /// earlier record.
    var blocksNewLocalIntentForMatch: Bool {
        switch state {
        case .conflict, .actionRequired, .quarantined:
            true
        case .queued, .syncing, .retryable, .acknowledged, .resolved:
            false
        }
    }

    var isEligibleForAutomaticSubmission: Bool { state == .queued }

    var isTerminalForSubmission: Bool {
        switch state {
        case .acknowledged, .conflict, .actionRequired, .quarantined, .resolved:
            true
        case .queued, .syncing, .retryable:
            false
        }
    }

    var isReceiptEligible: Bool {
        switch state {
        case .acknowledged:
            acknowledgement?.refreshPending == false
        case .resolved:
            true
        case .queued, .syncing, .retryable, .conflict, .actionRequired, .quarantined:
            false
        }
    }

    var isProvablyNeverTransmitted: Bool {
        state == .queued && !attempt.everSubmitted && attempt.outcomeCertainty == .notSent
    }
}

enum ScoringQueueOfficialTarget: Equatable, Sendable {
    case unknown
    case blank
    case scored(ScoringQueueGross)
}

enum ScoringQueueAdmissionDecision: Equatable, Sendable {
    case insert
    case reuse(ScoringQueueRecord)
    case supersede(ScoringQueueRecord)
    case insertBehind(ScoringQueueRecord)
    case blockedByReview(ScoringQueueRecord)
    case rejectQueueHealth
}

enum ScoringQueueSavePolicy {
    static func decision(
        for input: ScoringQueueSaveInput,
        existingRecords: [ScoringQueueRecord],
        officialTarget _: ScoringQueueOfficialTarget,
        unresolvedMatchCount: Int,
        unresolvedIdentityTournamentCount: Int
    ) -> ScoringQueueAdmissionDecision {
        let sameHole = existingRecords
            .filter {
                $0.partition == input.partition &&
                $0.intent.holeNumber == input.intent.holeNumber &&
                $0.isUnresolved
            }
            .sorted { $0.sequence < $1.sequence }

        if let duplicate = sameHole.first(where: { $0.intent == input.intent }) {
            return .reuse(duplicate)
        }
        if let blocking = sameHole.first(where: {
            $0.state == .conflict || $0.state == .actionRequired || $0.state == .quarantined
        }) {
            return .blockedByReview(blocking)
        }
        if let prior = sameHole.last {
            if prior.isProvablyNeverTransmitted {
                return .supersede(prior)
            }
            if unresolvedMatchCount >= ScoringQueueContract.maximumUnresolvedRecordsPerMatch ||
                unresolvedIdentityTournamentCount >= ScoringQueueContract.maximumUnresolvedRecordsPerIdentityTournament {
                return .rejectQueueHealth
            }
            return .insertBehind(prior)
        }

        if unresolvedMatchCount >= ScoringQueueContract.maximumUnresolvedRecordsPerMatch ||
            unresolvedIdentityTournamentCount >= ScoringQueueContract.maximumUnresolvedRecordsPerIdentityTournament {
            return .rejectQueueHealth
        }
        return .insert
    }
}

struct ScoringQueueRetryPolicy: Sendable {
    static let firstForegroundDelay: TimeInterval = 2
    static let secondForegroundDelay: TimeInterval = 5
    static let maximumDelay: TimeInterval = 15 * 60
    static let manualRetryMinimumInterval: TimeInterval = 2
    static let foregroundFailurePauseThreshold = 8

    private let jitterFraction: @Sendable (Int) -> Double

    init(jitterFraction: @escaping @Sendable (Int) -> Double = { _ in
        Double.random(in: -0.2...0.2)
    }) {
        self.jitterFraction = jitterFraction
    }

    func delay(
        afterFailure attemptIndex: Int,
        retryAfter: TimeInterval? = nil
    ) -> TimeInterval {
        let scheduled: TimeInterval
        switch attemptIndex {
        case ...0:
            scheduled = 0
        case 1:
            scheduled = Self.firstForegroundDelay
        case 2:
            scheduled = Self.secondForegroundDelay
        default:
            let exponent = min(attemptIndex - 3, 7)
            let uncappedBase = 10 * pow(2, Double(exponent))
            let base = min(Self.maximumDelay, uncappedBase)
            let boundedJitter = min(0.2, max(-0.2, jitterFraction(attemptIndex)))
            scheduled = min(Self.maximumDelay, base * (1 + boundedJitter))
        }

        guard let retryAfter, retryAfter.isFinite, retryAfter >= 0 else {
            return scheduled
        }
        return max(scheduled, retryAfter)
    }

    func nextRetryAt(
        afterFailure attemptIndex: Int,
        now: Date,
        retryAfter: TimeInterval? = nil
    ) -> Date {
        now.addingTimeInterval(delay(afterFailure: attemptIndex, retryAfter: retryAfter))
    }

    static func isManualRetryAllowed(lastAttemptAt: Date?, now: Date) -> Bool {
        guard let lastAttemptAt else { return true }
        return now.timeIntervalSince(lastAttemptAt) >= manualRetryMinimumInterval
    }

    static func shouldPauseAggressiveRetries(consecutiveForegroundFailures: Int) -> Bool {
        consecutiveForegroundFailures >= foregroundFailurePauseThreshold
    }
}

enum ScoringQueueAutomaticReplayEligibility: Equatable, Sendable {
    case normal
    case afterRefreshAndSafeReconciliation
    case explicitReviewOnly
    case never
}

enum ScoringQueueSupportMetadata: Equatable, Sendable {
    case none
    case thirtyDayGuidance
    case ninetyDayGuidance
}

enum ScoringQueueStaleDisposition: Equatable, Sendable {
    case current
    case agedPending
    case actionRequired
    case quarantined
}

struct ScoringQueueStaleAssessment: Equatable, Sendable {
    let disposition: ScoringQueueStaleDisposition
    let replayEligibility: ScoringQueueAutomaticReplayEligibility
    let requiresCanonicalRefresh: Bool
    let targetState: ScoringQueueState?
    let reason: ScoringQueueStateReasonCode?
    let quarantineReason: ScoringQueueQuarantineReason?
    let supportMetadata: ScoringQueueSupportMetadata
}

enum ScoringQueueStalePolicy {
    static let sixHours: TimeInterval = 6 * 60 * 60
    static let twentyFourHours: TimeInterval = 24 * 60 * 60
    static let sevenDays: TimeInterval = 7 * 24 * 60 * 60
    static let thirtyDays: TimeInterval = 30 * 24 * 60 * 60
    static let ninetyDays: TimeInterval = 90 * 24 * 60 * 60

    static func assess(createdAt: Date, now: Date) -> ScoringQueueStaleAssessment {
        let age = max(0, now.timeIntervalSince(createdAt))
        let supportMetadata: ScoringQueueSupportMetadata
        if age >= ninetyDays {
            supportMetadata = .ninetyDayGuidance
        } else if age >= thirtyDays {
            supportMetadata = .thirtyDayGuidance
        } else {
            supportMetadata = .none
        }

        if age >= sevenDays {
            return ScoringQueueStaleAssessment(
                disposition: .quarantined,
                replayEligibility: .never,
                requiresCanonicalRefresh: true,
                targetState: .quarantined,
                reason: .staleIdempotencyUncertain,
                quarantineReason: .staleIdempotencyUncertain,
                supportMetadata: supportMetadata
            )
        }
        if age >= twentyFourHours {
            return ScoringQueueStaleAssessment(
                disposition: .actionRequired,
                replayEligibility: .explicitReviewOnly,
                requiresCanonicalRefresh: true,
                targetState: .actionRequired,
                reason: .stale,
                quarantineReason: nil,
                supportMetadata: supportMetadata
            )
        }
        if age >= sixHours {
            return ScoringQueueStaleAssessment(
                disposition: .agedPending,
                replayEligibility: .afterRefreshAndSafeReconciliation,
                requiresCanonicalRefresh: true,
                targetState: nil,
                reason: nil,
                quarantineReason: nil,
                supportMetadata: supportMetadata
            )
        }
        return ScoringQueueStaleAssessment(
            disposition: .current,
            replayEligibility: .normal,
            requiresCanonicalRefresh: false,
            targetState: nil,
            reason: nil,
            quarantineReason: nil,
            supportMetadata: supportMetadata
        )
    }
}

enum ScoringQueueRevisionPolicy {
    static let maximumAutomaticRebases = 3

    static func mayAttemptAnotherAutomaticRebase(currentCount: Int) -> Bool {
        currentCount >= 0 && currentCount < maximumAutomaticRebases
    }
}

enum ScoringReliabilityStatus: String, Codable, CaseIterable, Equatable, Sendable {
    case official
    case savedOnIPhone
    case syncing
    case offline
    case retrying
    case needsReview
    case readOnly
    case matchFinal
    case signInAgain

    var text: String {
        switch self {
        case .official: "Official"
        case .savedOnIPhone: "Saved on iPhone"
        case .syncing: "Syncing"
        case .offline: "Offline · Saved on iPhone"
        case .retrying: "Waiting to sync"
        case .needsReview: "Needs Review"
        case .readOnly: "Read-only"
        case .matchFinal: "Match Final"
        case .signInAgain: "Sign in again"
        }
    }
}

enum ScoringReliabilityCanonicalState: Equatable, Sendable {
    case writable
    case readOnly
    case matchFinal
}

struct ScoringReliabilityContext: Equatable, Sendable {
    let isOffline: Bool
    let canonicalState: ScoringReliabilityCanonicalState
    let canonicalRefreshConfirmed: Bool
    let authenticationRequired: Bool
}

enum ScoringQueueReliabilityPolicy {
    static func status(
        for record: ScoringQueueRecord?,
        context: ScoringReliabilityContext
    ) -> ScoringReliabilityStatus {
        if context.authenticationRequired || record?.stateReasonCode == .authentication {
            return .signInAgain
        }

        if let record {
            switch record.state {
            case .conflict, .quarantined:
                return .needsReview
            case .actionRequired:
                if record.stateReasonCode == .readOnly && !record.isUnresolved {
                    return .readOnly
                }
                return .needsReview
            case .syncing:
                return .syncing
            case .retryable:
                return context.isOffline ? .offline : .retrying
            case .queued:
                return context.isOffline ? .offline : .savedOnIPhone
            case .acknowledged:
                if record.acknowledgement?.refreshPending == true || !context.canonicalRefreshConfirmed {
                    return .syncing
                }
                return .official
            case .resolved:
                if record.resolution?.reason == .officialEquivalent && context.canonicalRefreshConfirmed {
                    return .official
                }
            }
        }

        switch context.canonicalState {
        case .matchFinal:
            return .matchFinal
        case .readOnly:
            return .readOnly
        case .writable:
            return context.canonicalRefreshConfirmed ? .official : (context.isOffline ? .offline : .syncing)
        }
    }
}

enum ScoringQueueReceiptPolicy {
    static let acknowledgementRetention: TimeInterval = 24 * 60 * 60
    static let resolutionRetention: TimeInterval = 7 * 24 * 60 * 60

    static func retention(for record: ScoringQueueRecord) -> TimeInterval? {
        switch record.state {
        case .acknowledged where record.acknowledgement?.refreshPending == false:
            acknowledgementRetention
        case .resolved:
            resolutionRetention
        default:
            nil
        }
    }
}
