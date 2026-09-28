import Darwin
import Foundation

private enum HarnessFailure: Error, CustomStringConvertible {
    case usage(String)
    case assertion(String)

    var description: String {
        switch self {
        case let .usage(message), let .assertion(message): return message
        }
    }
}

private struct PersistedWitness: Codable {
    let preparePID: Int32
    let recordID: String
    let originalReferenceDateBits: UInt64
}

private struct DateProbe: Codable {
    let value: Date
}

private final class IdentifierSequence: @unchecked Sendable {
    private let lock = NSLock()
    private var values = [
        "00000000-0000-4000-8000-000000000101",
        "00000000-0000-4000-8000-000000000102",
    ]

    func next() -> String {
        lock.lock()
        defer { lock.unlock() }
        precondition(!values.isEmpty, "identifier sequence exhausted")
        return values.removeFirst()
    }
}

private let partition = ScoringQueuePartition(
    authUserId: "00000000-0000-4000-8000-000000000001",
    playerId: "CB01",
    tournamentId: "2026",
    matchId: "2026-R1-3"
)

private func findFractionalWitness() throws -> Date {
    let whole = Date(timeIntervalSince1970: 1_800_000_010)
    let encoder = JSONEncoder()
    encoder.dateEncodingStrategy = .secondsSince1970
    let decoder = JSONDecoder()
    decoder.dateDecodingStrategy = .secondsSince1970

    for offset in 1...10_000 {
        let candidate = Date(
            timeIntervalSinceReferenceDate:
                whole.timeIntervalSinceReferenceDate + Double(offset) / 10_000_000
        )
        let roundTripped = try decoder.decode(
            DateProbe.self,
            from: encoder.encode(DateProbe(value: candidate))
        ).value
        if candidate != roundTripped {
            return candidate
        }
    }
    throw HarnessFailure.assertion("no fractional Date witness changed under the Build 10 JSON codec")
}

private func saveInput() -> ScoringQueueSaveInput {
    ScoringQueueSaveInput(
        partition: partition,
        intent: ScoringQueueIntent(
            holeNumber: 1,
            teamOneGrossScores: [4, 5],
            teamTwoGrossScores: [4, 5]
        ),
        base: ScoringQueueBase(
            expectedMatchRevision: 12,
            expectedHoleRevision: 0,
            snapshotId: "snapshot-2026-r1",
            snapshotRevision: 7,
            scoringFormat: .bestBall,
            sideSlotCount: 2
        ),
        lastKnownServer: ScoringQueueLastKnownServer(
            matchRevision: 12,
            holeRevision: 0,
            permissionRevision: 3,
            refreshedAt: Date(timeIntervalSince1970: 1_800_000_000)
        ),
        originatingAppBuild: "10"
    )
}

private func record(
    copying stored: ScoringQueueRecord,
    originalCreatedAt: Date
) -> ScoringQueueRecord {
    ScoringQueueRecord(
        queueSchemaVersion: stored.queueSchemaVersion,
        apiContractVersion: stored.apiContractVersion,
        localQueueRecordId: stored.localQueueRecordId,
        mutationId: stored.mutationId,
        partition: stored.partition,
        intent: stored.intent,
        base: stored.base,
        sequence: stored.sequence,
        state: stored.state,
        stateReasonCode: stored.stateReasonCode,
        attempt: stored.attempt,
        lastKnownServer: stored.lastKnownServer,
        conflict: stored.conflict,
        acknowledgement: stored.acknowledgement,
        resolution: stored.resolution,
        quarantineReason: stored.quarantineReason,
        originatingAppBuild: stored.originatingAppBuild,
        createdAt: originalCreatedAt,
        updatedAt: originalCreatedAt
    )
}

private func sqliteHeaderIsPresent(at url: URL) throws -> Bool {
    let data = try Data(contentsOf: url, options: [.mappedIfSafe])
    return data.starts(with: Data("SQLite format 3\0".utf8))
}

private func emit(_ object: [String: Any]) throws {
    let data = try JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
    guard let line = String(data: data, encoding: .utf8) else {
        throw HarnessFailure.assertion("could not render JSON evidence")
    }
    print(line)
}

@main
private struct Build10SQLiteHarness {
    static func main() async {
        do {
            try await run()
        } catch {
            fputs("build10-sqlite-harness: \(error)\n", stderr)
            exit(1)
        }
    }

    private static func run() async throws {
        let arguments = Array(CommandLine.arguments.dropFirst())
        guard arguments.count == 3 else {
            throw HarnessFailure.usage(
                "usage: build10-sqlite-harness prepare|reopen-defect|verify-fixed DATABASE STATE"
            )
        }
        let command = arguments[0]
        let databaseURL = URL(fileURLWithPath: arguments[1])
        let stateURL = URL(fileURLWithPath: arguments[2])

        switch command {
        case "prepare":
            try await prepare(databaseURL: databaseURL, stateURL: stateURL)
        case "reopen-defect":
            try await reopen(databaseURL: databaseURL, stateURL: stateURL, expectDefect: true)
        case "verify-fixed":
            try await reopen(databaseURL: databaseURL, stateURL: stateURL, expectDefect: false)
        default:
            throw HarnessFailure.usage("unknown command: \(command)")
        }
    }

    private static func prepare(databaseURL: URL, stateURL: URL) async throws {
        let witness = try findFractionalWitness()
        let identifiers = IdentifierSequence()
        let repository = try SQLiteScoringQueueRepository(
            databaseURL: databaseURL,
            deployment: .production,
            now: { witness },
            identifierGenerator: { identifiers.next() }
        )
        let result = try await repository.save(saveInput())
        let inserted: ScoringQueueRecord
        switch result {
        case let .inserted(record): inserted = record
        default: throw HarnessFailure.assertion("first save did not insert a record")
        }
        let configuration = try await repository.configuration()
        await repository.close()

        guard inserted.createdAt == witness, inserted.updatedAt == witness else {
            throw HarnessFailure.assertion("repository did not retain the caller's fractional Date")
        }
        guard try sqliteHeaderIsPresent(at: databaseURL) else {
            throw HarnessFailure.assertion("database does not have a SQLite file header")
        }

        let state = PersistedWitness(
            preparePID: ProcessInfo.processInfo.processIdentifier,
            recordID: inserted.localQueueRecordId,
            originalReferenceDateBits: witness.timeIntervalSinceReferenceDate.bitPattern
        )
        try JSONEncoder().encode(state).write(to: stateURL, options: [.atomic])
        try emit([
            "command": "prepare",
            "databaseHeader": "SQLite format 3",
            "journalMode": configuration.journalMode,
            "pid": state.preparePID,
            "recordID": state.recordID,
            "schemaVersion": configuration.schemaVersion,
        ])
    }

    private static func reopen(
        databaseURL: URL,
        stateURL: URL,
        expectDefect: Bool
    ) async throws {
        let state = try JSONDecoder().decode(
            PersistedWitness.self,
            from: Data(contentsOf: stateURL)
        )
        let currentPID = ProcessInfo.processInfo.processIdentifier
        guard currentPID != state.preparePID else {
            throw HarnessFailure.assertion("prepare and reopen ran in the same process")
        }

        let repository = try SQLiteScoringQueueRepository(
            databaseURL: databaseURL,
            deployment: .production
        )
        let rows = try await repository.records(in: partition)
        guard rows.count == 1, let stored = rows.first else {
            throw HarnessFailure.assertion("expected one durable queue row after reopen, found \(rows.count)")
        }
        guard stored.localQueueRecordId == state.recordID else {
            throw HarnessFailure.assertion("reopened a different queue record")
        }
        let originalDate = Date(
            timeIntervalSinceReferenceDate: Double(bitPattern: state.originalReferenceDateBits)
        )
        let expected = record(copying: stored, originalCreatedAt: originalDate)
        let dateDeltaNanoseconds = abs(
            stored.createdAt.timeIntervalSinceReferenceDate -
                expected.createdAt.timeIntervalSinceReferenceDate
        ) * 1_000_000_000

        if expectDefect {
            guard stored != expected, stored.createdAt != expected.createdAt else {
                throw HarnessFailure.assertion(
                    "Build 10 no longer reproduces the fractional timestamp equality mismatch"
                )
            }

            let observedError: SQLiteScoringQueueRepositoryError
            do {
                _ = try await repository.replace(expected, expecting: expected)
                throw HarnessFailure.assertion(
                    "replacement unexpectedly succeeded; the expected-red correction may now be present"
                )
            } catch let error as SQLiteScoringQueueRepositoryError {
                observedError = error
            }
            await repository.close()

            guard observedError == .concurrentModification else {
                throw HarnessFailure.assertion(
                    "expected concurrentModification, observed \(observedError)"
                )
            }
            try emit([
                "command": "reopen-defect",
                "dateDeltaNanoseconds": dateDeltaNanoseconds,
                "differentProcess": true,
                "expectedRecordEqualsStored": false,
                "observedError": "concurrentModification",
                "pid": currentPID,
                "preparePID": state.preparePID,
                "realSQLite": true,
            ])
        } else {
            _ = try await repository.replace(expected, expecting: expected)
            await repository.close()
            try emit([
                "command": "verify-fixed",
                "dateDeltaNanoseconds": dateDeltaNanoseconds,
                "differentProcess": true,
                "expectedRecordEqualsStored": stored == expected,
                "observedError": "none",
                "pid": currentPID,
                "preparePID": state.preparePID,
                "realSQLite": true,
            ])
        }
    }
}
