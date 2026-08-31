import Foundation
import XCTest
@testable import BaggerInv

final class ReadCacheStoreTests: XCTestCase {
    func testPartitionDigestIsDeterministicAndDoesNotRevealIdentityMaterial() throws {
        let inputs = PartitionInputs.standard
        let first = try inputs.partition()
        let second = try inputs.partition()

        XCTAssertEqual(first, second)
        XCTAssertEqual(first.digest.count, 64)
        XCTAssertNotNil(
            first.digest.range(of: #"^[a-f0-9]{64}$"#, options: .regularExpression)
        )

        for privateValue in inputs.privateValues {
            XCTAssertFalse(first.digest.localizedCaseInsensitiveContains(privateValue))
        }
    }

    func testPartitionDigestChangesWhenAnyPartitionComponentChanges() throws {
        let baseline = try PartitionInputs.standard.partition()
        let variants = [
            try PartitionInputs(
                environment: "different-preview",
                authUserID: PartitionInputs.standard.authUserID,
                playerID: PartitionInputs.standard.playerID,
                tournamentID: PartitionInputs.standard.tournamentID
            ).partition(),
            try PartitionInputs(
                environment: PartitionInputs.standard.environment,
                authUserID: "different-auth-user",
                playerID: PartitionInputs.standard.playerID,
                tournamentID: PartitionInputs.standard.tournamentID
            ).partition(),
            try PartitionInputs(
                environment: PartitionInputs.standard.environment,
                authUserID: PartitionInputs.standard.authUserID,
                playerID: "different-player",
                tournamentID: PartitionInputs.standard.tournamentID
            ).partition(),
            try PartitionInputs(
                environment: PartitionInputs.standard.environment,
                authUserID: PartitionInputs.standard.authUserID,
                playerID: PartitionInputs.standard.playerID,
                tournamentID: "different-tournament"
            ).partition(),
        ]

        XCTAssertEqual(Set(variants.map(\.digest)).count, variants.count)
        XCTAssertTrue(variants.allSatisfy { $0 != baseline })
    }

    func testValidatedDigestRejectsTraversalAndNonDigestValues() throws {
        XCTAssertThrowsError(try ReadCachePartition(validatedDigest: "../participant")) { error in
            XCTAssertEqual(error as? ReadCacheError, .invalidPartition)
        }
        XCTAssertThrowsError(try ReadCachePartition(validatedDigest: String(repeating: "A", count: 64))) { error in
            XCTAssertEqual(error as? ReadCacheError, .invalidPartition)
        }

        let digest = String(repeating: "a", count: 64)
        XCTAssertEqual(try ReadCachePartition(validatedDigest: digest).digest, digest)
    }

    func testWriteReadAndAtomicReplacementLeaveOneCompleteProductFile() async throws {
        let root = try makeTemporaryRoot()
        defer { removeTemporaryRoot(root) }
        let store = try DiskReadCacheStore(rootDirectory: root)
        let partition = try PartitionInputs.standard.partition()
        let original = Data("original-complete-value".utf8)
        let replacement = Data("replacement-complete-value-with-a-different-size".utf8)

        try await store.write(original, product: .today, partition: partition)
        let originalRead = try await store.read(product: .today, partition: partition)
        XCTAssertEqual(originalRead, original)

        try await store.write(replacement, product: .today, partition: partition)
        let replacedRead = try await store.read(product: .today, partition: partition)
        XCTAssertEqual(replacedRead, replacement)

        let productURL = await store.fileURL(product: .today, partition: partition)
        let directoryContents = try FileManager.default.contentsOfDirectory(
            at: productURL.deletingLastPathComponent(),
            includingPropertiesForKeys: nil,
            options: []
        )
        XCTAssertEqual(directoryContents.map(\.lastPathComponent), ["today.json"])
    }

    func testProductPathUsesOnlyDigestAndProductName() async throws {
        let root = try makeTemporaryRoot()
        defer { removeTemporaryRoot(root) }
        let store = try DiskReadCacheStore(rootDirectory: root)
        let inputs = PartitionInputs.standard
        let partition = try inputs.partition()

        let productURL = await store.fileURL(product: .leaders, partition: partition)

        XCTAssertEqual(productURL.lastPathComponent, "leaders.json")
        XCTAssertEqual(productURL.deletingLastPathComponent().lastPathComponent, partition.digest)
        XCTAssertTrue(productURL.path.hasPrefix(root.path + "/"))
        for privateValue in inputs.privateValues {
            XCTAssertFalse(productURL.path.localizedCaseInsensitiveContains(privateValue))
        }
    }

    func testAllSixProtectedReadProductsUseDistinctParticipantPrivateFiles() async throws {
        let root = try makeTemporaryRoot()
        defer { removeTemporaryRoot(root) }
        let store = try DiskReadCacheStore(rootDirectory: root)
        let partition = try PartitionInputs.standard.partition()

        XCTAssertEqual(
            Set(MobileReadProduct.allCases),
            Set([.today, .matches, .leaders, .netSkins, .calcutta, .schedule])
        )
        for (index, product) in MobileReadProduct.allCases.enumerated() {
            try await store.write(Data([UInt8(index + 1)]), product: product, partition: partition)
        }

        let names = try FileManager.default.contentsOfDirectory(
            at: await store.fileURL(product: .leaders, partition: partition).deletingLastPathComponent(),
            includingPropertiesForKeys: nil
        ).map(\.lastPathComponent)
        XCTAssertEqual(
            Set(names),
            Set(["today.json", "matches.json", "leaders.json", "netSkins.json", "calcutta.json", "schedule.json"])
        )
    }

    func testWriteAppliesFileProtectionWhenThePlatformReportsIt() async throws {
        let root = try makeTemporaryRoot()
        defer { removeTemporaryRoot(root) }
        let store = try DiskReadCacheStore(rootDirectory: root)
        let partition = try PartitionInputs.standard.partition()

        try await store.write(Data("protected".utf8), product: .schedule, partition: partition)
        let productURL = await store.fileURL(product: .schedule, partition: partition)
        let attributes = try FileManager.default.attributesOfItem(atPath: productURL.path)

        if let protection = attributes[.protectionKey] as? FileProtectionType {
            XCTAssertEqual(protection, .completeUntilFirstUserAuthentication)
        } else if let protection = attributes[.protectionKey] as? String {
            XCTAssertEqual(protection, FileProtectionType.completeUntilFirstUserAuthentication.rawValue)
        }

        let directoryValues = try productURL.deletingLastPathComponent().resourceValues(
            forKeys: [.isExcludedFromBackupKey]
        )
        XCTAssertEqual(directoryValues.isExcludedFromBackup, true)
    }

    func testByteCountSumsOnlyFilesInTheRequestedPartition() async throws {
        let root = try makeTemporaryRoot()
        defer { removeTemporaryRoot(root) }
        let store = try DiskReadCacheStore(rootDirectory: root)
        let partition = try PartitionInputs.standard.partition()
        let otherPartition = try PartitionInputs(
            environment: "preview",
            authUserID: "another-auth-user",
            playerID: "another-player",
            tournamentID: "another-tournament"
        ).partition()
        let today = Data(repeating: 0x31, count: 17)
        let matches = Data(repeating: 0x32, count: 29)

        try await store.write(today, product: .today, partition: partition)
        try await store.write(matches, product: .matches, partition: partition)
        try await store.write(Data(repeating: 0x33, count: 101), product: .leaders, partition: otherPartition)

        let activeByteCount = try await store.byteCount(partition: partition)
        let otherByteCount = try await store.byteCount(partition: otherPartition)
        XCTAssertEqual(activeByteCount, today.count + matches.count)
        XCTAssertEqual(otherByteCount, 101)
    }

    func testPerProductRemovalPreservesOtherProducts() async throws {
        let root = try makeTemporaryRoot()
        defer { removeTemporaryRoot(root) }
        let store = try DiskReadCacheStore(rootDirectory: root)
        let partition = try PartitionInputs.standard.partition()
        let today = Data("today".utf8)
        let matches = Data("matches".utf8)

        try await store.write(today, product: .today, partition: partition)
        try await store.write(matches, product: .matches, partition: partition)
        try await store.remove(product: .today, partition: partition)

        let removed = try await store.read(product: .today, partition: partition)
        let preserved = try await store.read(product: .matches, partition: partition)
        XCTAssertNil(removed)
        XCTAssertEqual(preserved, matches)
    }

    func testPartitionDeletionRemovesEveryProductAndIsIdempotent() async throws {
        let root = try makeTemporaryRoot()
        defer { removeTemporaryRoot(root) }
        let store = try DiskReadCacheStore(rootDirectory: root)
        let partition = try PartitionInputs.standard.partition()

        for product in MobileReadProduct.allCases {
            try await store.write(Data(product.rawValue.utf8), product: product, partition: partition)
        }
        let partitionDirectory = await store.fileURL(product: .today, partition: partition)
            .deletingLastPathComponent()

        try await store.remove(partition: partition)
        try await store.remove(partition: partition)

        for product in MobileReadProduct.allCases {
            let value = try await store.read(product: product, partition: partition)
            XCTAssertNil(value, "Sign-out partition deletion retained \(product.rawValue)")
        }
        XCTAssertFalse(FileManager.default.fileExists(atPath: partitionDirectory.path))
        let byteCount = try await store.byteCount(partition: partition)
        XCTAssertEqual(byteCount, 0)
    }

    func testFailedPhysicalDeletionQuarantinesPartitionAcrossStoreReconstruction() async throws {
        let root = try makeTemporaryRoot()
        defer { removeTemporaryRoot(root) }
        let partition = try PartitionInputs.standard.partition()
        let failingFileManager = QuarantineRemovalFailingFileManager()
        let firstStore = try DiskReadCacheStore(
            rootDirectory: root,
            fileManager: failingFileManager
        )
        try await firstStore.write(
            Data("signed-out-participant-cache".utf8),
            product: .today,
            partition: partition
        )

        do {
            try await firstStore.remove(partition: partition)
            XCTFail("Expected planned quarantine cleanup failure")
        } catch {
            XCTAssertEqual(error as? QuarantineRemovalTestError, .planned)
        }

        let isolatedRead = try await firstStore.read(product: .today, partition: partition)
        XCTAssertNil(isolatedRead)
        let quarantinedNames = try FileManager.default.contentsOfDirectory(atPath: root.path)
            .filter { $0.hasPrefix(".pending-delete-") }
        XCTAssertEqual(quarantinedNames.count, 1)
        XCTAssertFalse(quarantinedNames[0].contains(PartitionInputs.standard.authUserID))
        XCTAssertFalse(quarantinedNames[0].contains(PartitionInputs.standard.playerID))

        // A new store represents a new app process. It must never resolve the
        // quarantined digest as an active participant cache, and opportunistically
        // removes the non-authoritative tombstone when the file system recovers.
        let reconstructedStore = try DiskReadCacheStore(
            rootDirectory: root,
            fileManager: .default
        )
        let reconstructedRead = try await reconstructedStore.read(product: .today, partition: partition)
        XCTAssertNil(reconstructedRead)
        let recoveredNames = try FileManager.default.contentsOfDirectory(atPath: root.path)
            .filter { $0.hasPrefix(".pending-delete-") }
        XCTAssertTrue(recoveredNames.isEmpty)
    }
}

private extension ReadCacheStoreTests {
    struct PartitionInputs {
        let environment: String
        let authUserID: String
        let playerID: String
        let tournamentID: String

        static let standard = PartitionInputs(
            environment: "preview",
            authUserID: "auth-user-private-value",
            playerID: "player-private-value",
            tournamentID: "tournament-private-value"
        )

        var privateValues: [String] {
            [authUserID, playerID, tournamentID]
        }

        func partition() throws -> ReadCachePartition {
            try ReadCachePartition(
                environment: environment,
                authUserID: authUserID,
                playerID: playerID,
                tournamentID: tournamentID
            )
        }
    }

    func makeTemporaryRoot() throws -> URL {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("BaggerInv-ReadCacheStoreTests", isDirectory: true)
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(
            at: root,
            withIntermediateDirectories: true,
            attributes: nil
        )
        return root
    }

    func removeTemporaryRoot(_ root: URL) {
        let allowedParent = FileManager.default.temporaryDirectory
            .appendingPathComponent("BaggerInv-ReadCacheStoreTests", isDirectory: true)
            .standardizedFileURL
        let candidate = root.standardizedFileURL
        guard candidate.path.hasPrefix(allowedParent.path + "/"),
              candidate.lastPathComponent.count == UUID().uuidString.count
        else {
            XCTFail("Refused to clean an unexpected test directory: \(candidate.path)")
            return
        }
        try? FileManager.default.removeItem(at: candidate)
    }
}

private final class QuarantineRemovalFailingFileManager: FileManager, @unchecked Sendable {
    override func removeItem(at URL: URL) throws {
        if URL.lastPathComponent.hasPrefix(".pending-delete-") {
            throw QuarantineRemovalTestError.planned
        }
        try super.removeItem(at: URL)
    }
}

private enum QuarantineRemovalTestError: Error, Equatable {
    case planned
}
