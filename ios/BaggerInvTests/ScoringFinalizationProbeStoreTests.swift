import XCTest
@testable import BaggerInv

final class ScoringFinalizationProbeStoreTests: XCTestCase {
    func testWriteReadAndDeleteExactIdentityProbe() async throws {
        let fixture = try makeFixture()
        defer { fixture.cleanup() }
        let probe = makeProbe()

        try await fixture.store.save(probe)
        let restored = try await fixture.store.probe(for: probe.identity)
        XCTAssertEqual(restored, probe)

        try await fixture.store.remove(probeId: probe.id)
        let deleted = try await fixture.store.probe(for: probe.identity)
        XCTAssertNil(deleted)
    }

    func testDifferentIdentityCannotLoadProbe() async throws {
        let fixture = try makeFixture()
        defer { fixture.cleanup() }
        let probe = makeProbe()
        try await fixture.store.save(probe)
        let other = ScoringQueueIdentityPartition(
            authUserId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            playerId: probe.identity.playerId,
            tournamentId: probe.identity.tournamentId
        )

        let hidden = try await fixture.store.probe(for: other)
        XCTAssertNil(hidden)
        let original = try await fixture.store.probe(for: probe.identity)
        XCTAssertEqual(original, probe)
    }

    func testAcceptedRefreshPendingPhaseSurvivesStoreReopen() async throws {
        let fixture = try makeFixture()
        defer { fixture.cleanup() }
        let original = makeProbe()
        let accepted = ScoringFinalizationProbe(
            id: original.id,
            identity: original.identity,
            matchId: original.matchId,
            mutationId: original.mutationId,
            expectedMatchRevision: original.expectedMatchRevision,
            acknowledgedMatchRevision: original.expectedMatchRevision + 1,
            phase: .acknowledged,
            createdAt: original.createdAt,
            updatedAt: original.updatedAt
        )
        try await fixture.store.save(accepted)

        let reopened = try DiskScoringFinalizationProbeStore(fileURL: fixture.fileURL)
        let restored = try await reopened.probe(for: accepted.identity)

        XCTAssertEqual(restored, accepted)
        XCTAssertEqual(restored?.phase, .acknowledged)
        XCTAssertEqual(
            restored?.acknowledgedMatchRevision,
            original.expectedMatchRevision + 1
        )
    }

    func testAcknowledgedProbeRequiresRevisionAtLeastRequestPrecondition() async throws {
        let fixture = try makeFixture()
        defer { fixture.cleanup() }
        let original = makeProbe()

        for acknowledgedRevision in [nil, original.expectedMatchRevision - 1] as [Int?] {
            let invalid = ScoringFinalizationProbe(
                id: original.id,
                identity: original.identity,
                matchId: original.matchId,
                mutationId: original.mutationId,
                expectedMatchRevision: original.expectedMatchRevision,
                acknowledgedMatchRevision: acknowledgedRevision,
                phase: .acknowledged,
                createdAt: original.createdAt
            )

            do {
                try await fixture.store.save(invalid)
                XCTFail("An acknowledged probe must retain a non-stale ACK revision")
            } catch {
                XCTAssertEqual(error as? ScoringFinalizationProbeStoreError, .invalidProbe)
            }
        }
    }

    func testEightIdentityCapacityRemainsReadableAcrossReopen() async throws {
        let fixture = try makeFixture()
        defer { fixture.cleanup() }
        let probes = (1...8).map { makeProbe(index: $0) }

        for probe in probes {
            try await fixture.store.save(probe)
        }

        let reopened = try DiskScoringFinalizationProbeStore(fileURL: fixture.fileURL)
        for probe in probes {
            let restored = try await reopened.probe(for: probe.identity)
            XCTAssertEqual(restored, probe)
        }
    }

    func testNinthIdentityFailsBeforePersistenceAndPreservesEightProbeEnvelope() async throws {
        let fixture = try makeFixture()
        defer { fixture.cleanup() }
        let existing = (1...8).map { makeProbe(index: $0) }
        for probe in existing {
            try await fixture.store.save(probe)
        }
        let ninth = makeProbe(index: 9)

        do {
            try await fixture.store.save(ninth)
            XCTFail("The ninth unresolved identity must fail before replacing the envelope")
        } catch {
            XCTAssertEqual(
                error as? ScoringFinalizationProbeStoreError,
                .capacityExceeded
            )
        }

        let reopened = try DiskScoringFinalizationProbeStore(fileURL: fixture.fileURL)
        for probe in existing {
            let restored = try await reopened.probe(for: probe.identity)
            XCTAssertEqual(restored, probe)
        }
        let rejectedIdentity = try await reopened.probe(for: ninth.identity)
        XCTAssertNil(rejectedIdentity)
    }

    func testSecondUnresolvedProbeForSameIdentityIsRejected() async throws {
        let fixture = try makeFixture()
        defer { fixture.cleanup() }
        let first = makeProbe()
        let second = ScoringFinalizationProbe(
            id: "33333333-3333-4333-8333-333333333333",
            identity: first.identity,
            matchId: "match-2",
            mutationId: "44444444-4444-4444-8444-444444444444",
            expectedMatchRevision: 15,
            phase: .prepared,
            createdAt: first.createdAt
        )
        try await fixture.store.save(first)

        do {
            try await fixture.store.save(second)
            XCTFail("An unresolved finalization probe must never be overwritten")
        } catch {
            XCTAssertEqual(
                error as? ScoringFinalizationProbeStoreError,
                .unresolvedProbeExists
            )
        }
        let restored = try await fixture.store.probe(for: first.identity)
        XCTAssertEqual(restored, first)
    }

    func testCorruptProbeStoreFailsClosedWithoutDeletion() async throws {
        let fixture = try makeFixture()
        defer { fixture.cleanup() }
        try Data("not-json".utf8).write(to: fixture.fileURL, options: [.atomic])

        do {
            _ = try await fixture.store.probe(for: CoordinatorQueueFixtures.identity)
            XCTFail("Corrupt finalization state must fail closed")
        } catch {
            XCTAssertEqual(error as? ScoringFinalizationProbeStoreError, .corruptStore)
        }
        XCTAssertTrue(FileManager.default.fileExists(atPath: fixture.fileURL.path))
    }

    private func makeProbe(index: Int = 1) -> ScoringFinalizationProbe {
        let suffix = String(format: "%012d", index)
        return ScoringFinalizationProbe(
            id: "11111111-1111-4111-8111-\(suffix)",
            identity: ScoringQueueIdentityPartition(
                authUserId: "aaaaaaaa-aaaa-4aaa-8aaa-\(suffix)",
                playerId: "P\(index)",
                tournamentId: "2026-\(index)"
            ),
            matchId: "match-\(index)",
            mutationId: "22222222-2222-4222-8222-\(suffix)",
            expectedMatchRevision: 12 + index,
            phase: .outcomeUnknown,
            createdAt: CoordinatorQueueFixtures.now
        )
    }

    private func makeFixture() throws -> ProbeStoreFixture {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        let fileURL = directory.appendingPathComponent("probe.json")
        return ProbeStoreFixture(
            directory: directory,
            fileURL: fileURL,
            store: try DiskScoringFinalizationProbeStore(fileURL: fileURL)
        )
    }
}

private struct ProbeStoreFixture {
    let directory: URL
    let fileURL: URL
    let store: DiskScoringFinalizationProbeStore

    func cleanup() {
        try? FileManager.default.removeItem(at: directory)
    }
}
