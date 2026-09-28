import XCTest
@testable import BaggerInv

@MainActor
final class Build10CanonicalAcknowledgementRecoveryTests: XCTestCase {
    private final class Clock {
        var whole = Date(timeIntervalSince1970: 1_800_000_010)
        var calls = 0
        var fractionalAt = -1

        private lazy var fractional: Date = {
            let encoder = JSONEncoder()
            encoder.dateEncodingStrategy = .secondsSince1970
            let decoder = JSONDecoder()
            decoder.dateDecodingStrategy = .secondsSince1970
            for offset in 1...10_000 {
                let value = Date(
                    timeIntervalSinceReferenceDate:
                        whole.timeIntervalSinceReferenceDate + Double(offset) / 10_000_000
                )
                guard let data = try? encoder.encode(value),
                      let decoded = try? decoder.decode(Date.self, from: data)
                else { continue }
                if value != decoded { return value }
            }
            fatalError("No fractional Date witness found")
        }()

        func now() -> Date {
            calls += 1
            return calls == fractionalAt ? fractional : whole
        }
    }

    private struct Harness {
        let repository: SQLiteScoringQueueRepository
        let api: CoordinatorQueueAPI
        let clock: Clock
        let coordinator: ScoringQueueCoordinator
        let partition: ScoringQueuePartition
    }

    private static let stateRoot = URL(
        fileURLWithPath: "__NA006_STATE_ROOT__",
        isDirectory: true
    )
    private static var databaseURL: URL {
        stateRoot.appendingPathComponent("queue.sqlite")
    }
    private static var requestURL: URL {
        stateRoot.appendingPathComponent("accepted-request.json")
    }
    private static var metadataURL: URL {
        stateRoot.appendingPathComponent("prepare-metadata.json")
    }

    private func makeHarness(fractionalAt: Int) throws -> Harness {
        let clock = Clock()
        clock.fractionalAt = fractionalAt
        let partition = CoordinatorQueueFixtures.partition(matchId: "2026-R1-3")
        let repository = try SQLiteScoringQueueRepository(
            databaseURL: Self.databaseURL,
            deployment: .production,
            now: { Date(timeIntervalSince1970: 1_800_000_010) }
        )
        let api = CoordinatorQueueAPI()
        api.configureCanonical(for: partition)
        let activity = NativeApplicationActivity(isActive: true)
        let coordinator = ScoringQueueCoordinator(
            repository: repository,
            api: api,
            credentialProvider: CoordinatorQueueCredentials(),
            applicationActivity: activity,
            mutationAuthorization: TestScoringHoleMutationAuthorization(),
            now: { clock.now() },
            jitter: { 0 }
        )
        return Harness(
            repository: repository,
            api: api,
            clock: clock,
            coordinator: coordinator,
            partition: partition
        )
    }

    private func settle() async {
        for _ in 0..<80 {
            try? await Task.sleep(nanoseconds: 5_000_000)
        }
    }

    private func waitForResolution(_ harness: Harness) async throws {
        for _ in 0..<200 {
            let unresolved = try await harness.repository.unresolvedCount(
                in: harness.partition
            )
            if unresolved == 0 { return }
            try? await Task.sleep(nanoseconds: 10_000_000)
        }
        XCTFail("Matching canonical acknowledgement did not resolve")
    }

    private func emit(_ label: String, _ object: [String: Any]) throws {
        let data = try JSONSerialization.data(
            withJSONObject: object,
            options: [.sortedKeys]
        )
        let text = try XCTUnwrap(String(data: data, encoding: .utf8))
        print("\(label) \(text)")
    }

    func testPreparePersistedAcceptedAcknowledgement() async throws {
        try FileManager.default.createDirectory(
            at: Self.stateRoot,
            withIntermediateDirectories: true
        )
        for url in [
            Self.databaseURL,
            URL(fileURLWithPath: Self.databaseURL.path + "-wal"),
            URL(fileURLWithPath: Self.databaseURL.path + "-shm"),
            Self.requestURL,
            Self.metadataURL,
        ] {
            try? FileManager.default.removeItem(at: url)
        }

        let harness = try makeHarness(fractionalAt: 11)
        await harness.coordinator.activate(identity: harness.partition.identity)
        _ = try await harness.coordinator.save(
            CoordinatorQueueFixtures.input(
                partition: harness.partition,
                teamOne: [4, 5],
                teamTwo: [4, 5]
            )
        )
        await settle()

        let rows = try await harness.repository.records(in: harness.partition)
        let record = try XCTUnwrap(rows.first)
        let acknowledgement = try XCTUnwrap(record.acknowledgement)
        let current = try await harness.api.scoringCurrent(
            accessToken: "synthetic",
            certification: "synthetic",
            matchID: harness.partition.matchId
        )
        let score = try XCTUnwrap(current.data.scoring?.scores.first)
        let request = try XCTUnwrap(harness.api.holeRequests.first)
        let configuration = try await harness.repository.configuration()
        let databaseBytes = try Data(contentsOf: Self.databaseURL)

        XCTAssertEqual(rows.count, 1)
        XCTAssertTrue(databaseBytes.starts(with: Data("SQLite format 3\0".utf8)))
        XCTAssertEqual(configuration.journalMode.lowercased(), "wal")
        XCTAssertEqual(record.state, .acknowledged)
        XCTAssertTrue(acknowledgement.accepted)
        XCTAssertTrue(acknowledgement.refreshPending)
        XCTAssertTrue(harness.coordinator.state.lastPersistenceFailure)
        XCTAssertEqual(score.holeNumber, request.holeNumber)
        XCTAssertEqual(score.gross.teamOne, request.teamOneGrossScores)
        XCTAssertEqual(score.gross.teamTwo, request.teamTwoGrossScores)
        XCTAssertEqual(current.data.scoring?.match.matchRevision,
                       acknowledgement.canonicalMatchRevision)
        XCTAssertEqual(score.revision, acknowledgement.canonicalHoleRevision)

        try JSONEncoder().encode(request).write(
            to: Self.requestURL,
            options: [.atomic]
        )
        let metadata: [String: Any] = [
            "preparePID": ProcessInfo.processInfo.processIdentifier,
            "recordID": record.localQueueRecordId,
            "mutationID": record.mutationId,
            "canonicalMatchRevision": acknowledgement.canonicalMatchRevision,
            "canonicalHoleRevision": acknowledgement.canonicalHoleRevision,
        ]
        try JSONSerialization.data(
            withJSONObject: metadata,
            options: [.sortedKeys]
        ).write(to: Self.metadataURL, options: [.atomic])
        try emit("NA006_CANONICAL_PREPARE", [
            "accepted": acknowledgement.accepted,
            "canonicalGrossMatchesIntent": true,
            "canonicalHoleRevision": acknowledgement.canonicalHoleRevision,
            "canonicalMatchRevision": acknowledgement.canonicalMatchRevision,
            "databaseHeader": "SQLite format 3",
            "journalMode": configuration.journalMode,
            "persistenceFailure": harness.coordinator.state.lastPersistenceFailure,
            "pid": ProcessInfo.processInfo.processIdentifier,
            "refreshPending": acknowledgement.refreshPending,
            "state": record.state.rawValue,
        ])
        await harness.coordinator.deactivate()
        await harness.repository.close()
    }

    func testRecoverPersistedAcknowledgementFromMatchingOfficialReadback() async throws {
        let metadata = try XCTUnwrap(
            try JSONSerialization.jsonObject(
                with: Data(contentsOf: Self.metadataURL)
            ) as? [String: Any]
        )
        let preparePID = try XCTUnwrap(metadata["preparePID"] as? Int)
        XCTAssertNotEqual(preparePID, Int(ProcessInfo.processInfo.processIdentifier))
        let request = try JSONDecoder().decode(
            MobileScoringHoleRequest.self,
            from: Data(contentsOf: Self.requestURL)
        )

        let harness = try makeHarness(fractionalAt: -1)
        let storedBefore = try await harness.repository.records(in: harness.partition)
        let acknowledged = try XCTUnwrap(storedBefore.first)
        XCTAssertEqual(storedBefore.count, 1)
        XCTAssertEqual(acknowledged.state, .acknowledged)
        XCTAssertTrue(acknowledged.acknowledgement?.refreshPending == true)
        XCTAssertEqual(acknowledged.mutationId, request.mutationId)

        // Reconstruct the already-committed isolated server in this new test
        // process. Coordinator activation below must perform reads only.
        _ = try await harness.api.scoringHole(
            request: request,
            accessToken: "synthetic",
            certification: "synthetic"
        )
        let writesBeforeActivation = harness.api.holeRequests.count
        await harness.coordinator.activate(identity: harness.partition.identity)
        try await waitForResolution(harness)
        await settle()

        let recordsAfter = try await harness.repository.records(in: harness.partition)
        let receipts = try await harness.repository.receipts(
            for: harness.partition.identity
        )
        let receipt = try XCTUnwrap(receipts.first)
        let current = try await harness.api.scoringCurrent(
            accessToken: "synthetic",
            certification: "synthetic",
            matchID: harness.partition.matchId
        )
        let score = try XCTUnwrap(current.data.scoring?.scores.first)

        XCTAssertTrue(recordsAfter.isEmpty)
        XCTAssertEqual(receipts.count, 1)
        XCTAssertEqual(receipt.kind, .acknowledgement)
        XCTAssertEqual(receipt.mutationId, request.mutationId)
        XCTAssertEqual(receipt.accepted, true)
        XCTAssertEqual(
            receipt.canonicalMatchRevision,
            metadata["canonicalMatchRevision"] as? Int
        )
        XCTAssertEqual(
            receipt.canonicalHoleRevision,
            metadata["canonicalHoleRevision"] as? Int
        )
        XCTAssertEqual(harness.api.holeRequests.count, writesBeforeActivation,
                       "persisted acknowledgement recovery must be refresh-only")
        XCTAssertEqual(score.holeNumber, request.holeNumber)
        XCTAssertEqual(score.gross.teamOne, request.teamOneGrossScores)
        XCTAssertEqual(score.gross.teamTwo, request.teamTwoGrossScores)
        XCTAssertFalse(harness.coordinator.state.lastPersistenceFailure)
        XCTAssertTrue(
            harness.coordinator.state.allowsNewLocalIntent(
                matchId: harness.partition.matchId
            )
        )

        try emit("NA006_CANONICAL_RECOVER", [
            "canonicalGrossMatchesIntent": true,
            "differentProcess": true,
            "extraScorePostsDuringRecovery":
                harness.api.holeRequests.count - writesBeforeActivation,
            "persistenceFailure": harness.coordinator.state.lastPersistenceFailure,
            "pid": ProcessInfo.processInfo.processIdentifier,
            "preparePID": preparePID,
            "receiptAccepted": receipt.accepted == true,
            "receiptMutationMatches": receipt.mutationId == request.mutationId,
            "recordsAfter": recordsAfter.count,
            "unresolvedAfter": try await harness.repository.unresolvedCount(
                in: harness.partition
            ),
        ])
        await harness.coordinator.deactivate()
        await harness.repository.close()
    }
}
