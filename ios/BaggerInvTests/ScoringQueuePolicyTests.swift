import Foundation
import XCTest
@testable import BaggerInv

final class ScoringQueuePolicyTests: XCTestCase {
    func testRetryScheduleUsesTwoFiveThenDeterministicExponentialDelays() {
        let policy = ScoringQueueRetryPolicy(jitterFraction: { _ in 0 })

        XCTAssertEqual(policy.delay(afterFailure: 1), 2)
        XCTAssertEqual(policy.delay(afterFailure: 2), 5)
        XCTAssertEqual(policy.delay(afterFailure: 3), 10)
        XCTAssertEqual(policy.delay(afterFailure: 4), 20)
        XCTAssertEqual(policy.delay(afterFailure: 5), 40)
        XCTAssertEqual(policy.delay(afterFailure: 6), 80)
        XCTAssertEqual(policy.delay(afterFailure: 7), 160)
        XCTAssertEqual(policy.delay(afterFailure: 8), 320)
        XCTAssertEqual(policy.delay(afterFailure: 9), 640)
        XCTAssertEqual(policy.delay(afterFailure: 10), 900)
        XCTAssertEqual(policy.delay(afterFailure: 100), 900)
    }

    func testRetryJitterIsBoundedToTwentyPercentAndFinalDelayCapsAtFifteenMinutes() {
        XCTAssertEqual(
            ScoringQueueRetryPolicy(jitterFraction: { _ in -1 }).delay(afterFailure: 3),
            8
        )
        XCTAssertEqual(
            ScoringQueueRetryPolicy(jitterFraction: { _ in 1 }).delay(afterFailure: 3),
            12
        )
        XCTAssertEqual(
            ScoringQueueRetryPolicy(jitterFraction: { _ in 0.2 }).delay(afterFailure: 10),
            900
        )
        XCTAssertEqual(
            ScoringQueueRetryPolicy(jitterFraction: { _ in -0.2 }).delay(afterFailure: 10),
            720
        )
    }

    func testLongerValidRetryAfterWinsEvenBeyondNormalCap() {
        let policy = ScoringQueueRetryPolicy(jitterFraction: { _ in 0 })

        XCTAssertEqual(policy.delay(afterFailure: 3, retryAfter: 30), 30)
        XCTAssertEqual(policy.delay(afterFailure: 10, retryAfter: 1_200), 1_200)
        XCTAssertEqual(policy.delay(afterFailure: 3, retryAfter: -1), 10)
        XCTAssertEqual(policy.delay(afterFailure: 3, retryAfter: .infinity), 10)
    }

    func testRetryDateManualThrottleAndForegroundFailurePauseUseInjectedTime() {
        let now = ScoringQueueTestFixtures.now
        let policy = ScoringQueueRetryPolicy(jitterFraction: { _ in 0 })

        XCTAssertEqual(policy.nextRetryAt(afterFailure: 2, now: now), now.addingTimeInterval(5))
        XCTAssertTrue(ScoringQueueRetryPolicy.isManualRetryAllowed(lastAttemptAt: nil, now: now))
        XCTAssertFalse(ScoringQueueRetryPolicy.isManualRetryAllowed(
            lastAttemptAt: now.addingTimeInterval(-1.999),
            now: now
        ))
        XCTAssertTrue(ScoringQueueRetryPolicy.isManualRetryAllowed(
            lastAttemptAt: now.addingTimeInterval(-2),
            now: now
        ))
        XCTAssertFalse(ScoringQueueRetryPolicy.shouldPauseAggressiveRetries(consecutiveForegroundFailures: 7))
        XCTAssertTrue(ScoringQueueRetryPolicy.shouldPauseAggressiveRetries(consecutiveForegroundFailures: 8))
    }

    func testStalePolicyUsesExactSixHourTwentyFourHourAndSevenDayBoundaries() {
        let created = ScoringQueueTestFixtures.now

        let underSix = ScoringQueueStalePolicy.assess(
            createdAt: created,
            now: created.addingTimeInterval(ScoringQueueStalePolicy.sixHours - 1)
        )
        XCTAssertEqual(underSix.disposition, .current)
        XCTAssertEqual(underSix.replayEligibility, .normal)
        XCTAssertFalse(underSix.requiresCanonicalRefresh)

        let sixHours = ScoringQueueStalePolicy.assess(
            createdAt: created,
            now: created.addingTimeInterval(ScoringQueueStalePolicy.sixHours)
        )
        XCTAssertEqual(sixHours.disposition, .agedPending)
        XCTAssertEqual(sixHours.replayEligibility, .afterRefreshAndSafeReconciliation)
        XCTAssertTrue(sixHours.requiresCanonicalRefresh)
        XCTAssertNil(sixHours.targetState)

        let twentyFourHours = ScoringQueueStalePolicy.assess(
            createdAt: created,
            now: created.addingTimeInterval(ScoringQueueStalePolicy.twentyFourHours)
        )
        XCTAssertEqual(twentyFourHours.disposition, .actionRequired)
        XCTAssertEqual(twentyFourHours.replayEligibility, .explicitReviewOnly)
        XCTAssertEqual(twentyFourHours.targetState, .actionRequired)
        XCTAssertEqual(twentyFourHours.reason, .stale)

        let sevenDays = ScoringQueueStalePolicy.assess(
            createdAt: created,
            now: created.addingTimeInterval(ScoringQueueStalePolicy.sevenDays)
        )
        XCTAssertEqual(sevenDays.disposition, .quarantined)
        XCTAssertEqual(sevenDays.replayEligibility, .never)
        XCTAssertEqual(sevenDays.targetState, .quarantined)
        XCTAssertEqual(sevenDays.reason, .staleIdempotencyUncertain)
        XCTAssertEqual(sevenDays.quarantineReason, .staleIdempotencyUncertain)
    }

    func testStalePolicySurfacesThirtyAndNinetyDaySupportMetadataWithoutDeletion() {
        let created = ScoringQueueTestFixtures.now
        let thirty = ScoringQueueStalePolicy.assess(
            createdAt: created,
            now: created.addingTimeInterval(ScoringQueueStalePolicy.thirtyDays)
        )
        let ninety = ScoringQueueStalePolicy.assess(
            createdAt: created,
            now: created.addingTimeInterval(ScoringQueueStalePolicy.ninetyDays)
        )

        XCTAssertEqual(thirty.supportMetadata, .thirtyDayGuidance)
        XCTAssertEqual(ninety.supportMetadata, .ninetyDayGuidance)
        XCTAssertEqual(thirty.disposition, .quarantined)
        XCTAssertEqual(ninety.disposition, .quarantined)
        XCTAssertEqual(thirty.replayEligibility, .never)
        XCTAssertEqual(ninety.replayEligibility, .never)
    }

    func testFutureCreatedTimestampIsClampedToCurrentBand() {
        let assessment = ScoringQueueStalePolicy.assess(
            createdAt: ScoringQueueTestFixtures.now.addingTimeInterval(60),
            now: ScoringQueueTestFixtures.now
        )
        XCTAssertEqual(assessment.disposition, .current)
    }

    func testAutomaticRebaseCapAllowsThreeAndRejectsFourth() {
        XCTAssertTrue(ScoringQueueRevisionPolicy.mayAttemptAnotherAutomaticRebase(currentCount: 0))
        XCTAssertTrue(ScoringQueueRevisionPolicy.mayAttemptAnotherAutomaticRebase(currentCount: 1))
        XCTAssertTrue(ScoringQueueRevisionPolicy.mayAttemptAnotherAutomaticRebase(currentCount: 2))
        XCTAssertFalse(ScoringQueueRevisionPolicy.mayAttemptAnotherAutomaticRebase(currentCount: 3))
        XCTAssertFalse(ScoringQueueRevisionPolicy.mayAttemptAnotherAutomaticRebase(currentCount: -1))
    }

    func testReliabilityStatusMapsDurableQueueStatesWithoutFalseOfficialCopy() {
        let online = context()
        let offline = context(isOffline: true)

        XCTAssertEqual(
            ScoringQueueReliabilityPolicy.status(for: ScoringQueueTestFixtures.record(), context: online),
            .savedOnIPhone
        )
        XCTAssertEqual(
            ScoringQueueReliabilityPolicy.status(for: ScoringQueueTestFixtures.record(), context: offline),
            .offline
        )

        let syncingAttempt = ScoringQueueAttempt(
            count: 0,
            lastAttemptAt: nil,
            nextRetryAt: nil,
            everSubmitted: false,
            outcomeCertainty: .notSent,
            syncLeaseId: "lease-1",
            syncLeaseStartedAt: ScoringQueueTestFixtures.now,
            lastHttpStatus: nil,
            lastErrorCode: nil
        )
        XCTAssertEqual(
            ScoringQueueReliabilityPolicy.status(
                for: ScoringQueueTestFixtures.record(state: .syncing, attempt: syncingAttempt),
                context: online
            ),
            .syncing
        )
        XCTAssertEqual(
            ScoringQueueReliabilityPolicy.status(for: ScoringQueueTestFixtures.retryableRecord(), context: online),
            .retrying
        )
        XCTAssertEqual(
            ScoringQueueReliabilityPolicy.status(for: ScoringQueueTestFixtures.retryableRecord(), context: offline),
            .offline
        )
        XCTAssertEqual(
            ScoringQueueReliabilityPolicy.status(for: ScoringQueueTestFixtures.conflictRecord(), context: online),
            .needsReview
        )
    }

    func testOfficialRequiresAcknowledgementRefreshOrEquivalentCanonicalRefresh() {
        XCTAssertEqual(
            ScoringQueueReliabilityPolicy.status(
                for: ScoringQueueTestFixtures.acknowledgedRecord(refreshPending: true),
                context: context(canonicalRefreshConfirmed: false)
            ),
            .syncing
        )
        XCTAssertEqual(
            ScoringQueueReliabilityPolicy.status(
                for: ScoringQueueTestFixtures.acknowledgedRecord(refreshPending: false),
                context: context(canonicalRefreshConfirmed: true)
            ),
            .official
        )
        XCTAssertEqual(
            ScoringQueueReliabilityPolicy.status(
                for: ScoringQueueTestFixtures.resolvedRecord(reason: .officialEquivalent),
                context: context(canonicalRefreshConfirmed: true)
            ),
            .official
        )
        XCTAssertNotEqual(
            ScoringQueueReliabilityPolicy.status(
                for: ScoringQueueTestFixtures.acknowledgedRecord(refreshPending: false),
                context: context(canonicalRefreshConfirmed: false)
            ),
            .official
        )
    }

    func testReliabilityStatusExposesAuthenticationReadOnlyAndFinalStates() {
        XCTAssertEqual(
            ScoringQueueReliabilityPolicy.status(
                for: nil,
                context: context(authenticationRequired: true)
            ),
            .signInAgain
        )
        XCTAssertEqual(
            ScoringQueueReliabilityPolicy.status(
                for: nil,
                context: context(canonicalState: .readOnly)
            ),
            .readOnly
        )
        XCTAssertEqual(
            ScoringQueueReliabilityPolicy.status(
                for: nil,
                context: context(canonicalState: .matchFinal)
            ),
            .matchFinal
        )

        let action = ScoringQueueTestFixtures.record(
            state: .actionRequired,
            reason: .authentication
        )
        XCTAssertEqual(
            ScoringQueueReliabilityPolicy.status(for: action, context: context()),
            .signInAgain
        )
    }

    func testReliabilityStatusTextIsPersistentParticipantFacingCopy() {
        XCTAssertEqual(ScoringReliabilityStatus.official.text, "Official")
        XCTAssertEqual(ScoringReliabilityStatus.savedOnIPhone.text, "Saved on iPhone")
        XCTAssertEqual(ScoringReliabilityStatus.syncing.text, "Syncing")
        XCTAssertEqual(ScoringReliabilityStatus.offline.text, "Offline · Saved on iPhone")
        XCTAssertEqual(ScoringReliabilityStatus.retrying.text, "Waiting to sync")
        XCTAssertEqual(ScoringReliabilityStatus.needsReview.text, "Needs Review")
        XCTAssertEqual(ScoringReliabilityStatus.readOnly.text, "Read-only")
        XCTAssertEqual(ScoringReliabilityStatus.matchFinal.text, "Match Final")
        XCTAssertEqual(ScoringReliabilityStatus.signInAgain.text, "Sign in again")
    }

    private func context(
        isOffline: Bool = false,
        canonicalState: ScoringReliabilityCanonicalState = .writable,
        canonicalRefreshConfirmed: Bool = true,
        authenticationRequired: Bool = false
    ) -> ScoringReliabilityContext {
        ScoringReliabilityContext(
            isOffline: isOffline,
            canonicalState: canonicalState,
            canonicalRefreshConfirmed: canonicalRefreshConfirmed,
            authenticationRequired: authenticationRequired
        )
    }
}
