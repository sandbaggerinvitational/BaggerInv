import CryptoKit
import Foundation

enum MobileReadProduct: String, CaseIterable, Codable, Sendable {
    case today
    case matches
    case leaders
    case netSkins
    case calcutta
    case schedule
    case passport
    case guide
    case history
    case historyDetail
    case records
    case odds
    case matchDetail
}

struct MobileReadCacheKey: Codable, Equatable, Hashable, Sendable {
    let product: MobileReadProduct
    let historyYear: Int?
    let matchID: String?

    init(product: MobileReadProduct) {
        precondition(
            product != .historyDetail && product != .matchDetail,
            "Dynamic read products require a validated discriminator."
        )
        self.product = product
        historyYear = nil
        matchID = nil
    }

    init(historyYear: Int) throws {
        guard (2017...2026).contains(historyYear) else {
            throw ReadCacheError.invalidCacheKey
        }
        product = .historyDetail
        self.historyYear = historyYear
        matchID = nil
    }

    init(matchID: String) throws {
        guard Self.isValidMatchID(matchID) else {
            throw ReadCacheError.invalidCacheKey
        }
        product = .matchDetail
        historyYear = nil
        self.matchID = matchID
    }

    var filename: String {
        if let historyYear {
            return "\(product.rawValue)-\(historyYear).json"
        }
        if let matchID {
            let digest = SHA256.hash(data: Data(matchID.utf8))
                .map { String(format: "%02x", $0) }
                .joined()
            return "\(product.rawValue)-\(digest).json"
        }
        return "\(product.rawValue).json"
    }

    init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let product = try container.decode(MobileReadProduct.self, forKey: .product)
        let historyYear = try container.decodeIfPresent(Int.self, forKey: .historyYear)
        let matchID = try container.decodeIfPresent(String.self, forKey: .matchID)
        if product == .historyDetail {
            guard let historyYear, matchID == nil, (2017...2026).contains(historyYear) else {
                throw ReadCacheError.invalidCacheKey
            }
        } else if product == .matchDetail {
            guard historyYear == nil, let matchID, Self.isValidMatchID(matchID) else {
                throw ReadCacheError.invalidCacheKey
            }
        } else if historyYear != nil || matchID != nil {
            throw ReadCacheError.invalidCacheKey
        }
        self.product = product
        self.historyYear = historyYear
        self.matchID = matchID
    }

    static func isValidMatchID(_ value: String) -> Bool {
        MobileOpaqueMatchID.isValid(value)
    }

    static func == (lhs: Self, rhs: Self) -> Bool {
        lhs.product == rhs.product &&
        lhs.historyYear == rhs.historyYear &&
        MobileOpaqueMatchID.isEqual(lhs.matchID, rhs.matchID)
    }

    func hash(into hasher: inout Hasher) {
        hasher.combine(product)
        hasher.combine(historyYear)
        hasher.combine(matchID.map { Data($0.utf8) })
    }
}

struct ReadCachePartition: Equatable, Hashable, Sendable {
    let digest: String

    init(environment: String, authUserID: String, playerID: String, tournamentID: String) throws {
        guard !environment.isEmpty, !authUserID.isEmpty, !playerID.isEmpty, !tournamentID.isEmpty else {
            throw ReadCacheError.invalidPartition
        }
        let material = [environment, authUserID, playerID, tournamentID].joined(separator: "\u{0}")
        digest = SHA256.hash(data: Data(material.utf8)).map { String(format: "%02x", $0) }.joined()
    }

    init(validatedDigest: String) throws {
        guard validatedDigest.range(of: #"^[a-f0-9]{64}$"#, options: .regularExpression) != nil else {
            throw ReadCacheError.invalidPartition
        }
        digest = validatedDigest
    }
}

protocol ReadCacheStoring: Sendable {
    func read(product: MobileReadProduct, partition: ReadCachePartition) async throws -> Data?
    func write(_ data: Data, product: MobileReadProduct, partition: ReadCachePartition) async throws
    func remove(product: MobileReadProduct, partition: ReadCachePartition) async throws
    func remove(partition: ReadCachePartition) async throws
    func byteCount(partition: ReadCachePartition) async throws -> Int
    func read(key: MobileReadCacheKey, partition: ReadCachePartition) async throws -> Data?
    func write(_ data: Data, key: MobileReadCacheKey, partition: ReadCachePartition) async throws
    func remove(key: MobileReadCacheKey, partition: ReadCachePartition) async throws
}

extension ReadCacheStoring {
    func read(key: MobileReadCacheKey, partition: ReadCachePartition) async throws -> Data? {
        guard key.historyYear == nil, key.matchID == nil else { throw ReadCacheError.invalidCacheKey }
        return try await read(product: key.product, partition: partition)
    }

    func write(_ data: Data, key: MobileReadCacheKey, partition: ReadCachePartition) async throws {
        guard key.historyYear == nil, key.matchID == nil else { throw ReadCacheError.invalidCacheKey }
        try await write(data, product: key.product, partition: partition)
    }

    func remove(key: MobileReadCacheKey, partition: ReadCachePartition) async throws {
        guard key.historyYear == nil, key.matchID == nil else { throw ReadCacheError.invalidCacheKey }
        try await remove(product: key.product, partition: partition)
    }
}

actor DiskReadCacheStore: ReadCacheStoring {
    static let cacheSchemaVersion = 1
    private static let quarantinePrefix = ".pending-delete-"

    private let rootDirectory: URL
    private let fileManager: FileManager
    private var quarantinedEntryPaths: Set<String> = []

    init(rootDirectory: URL? = nil, fileManager: FileManager = .default) throws {
        self.fileManager = fileManager
        if let rootDirectory {
            self.rootDirectory = rootDirectory
        } else {
            guard let applicationSupport = fileManager.urls(
                for: .applicationSupportDirectory,
                in: .userDomainMask
            ).first else {
                throw ReadCacheError.storageUnavailable
            }
            self.rootDirectory = applicationSupport
                .appendingPathComponent("BaggerInv", isDirectory: true)
                .appendingPathComponent("ReadCache", isDirectory: true)
                .appendingPathComponent("v\(Self.cacheSchemaVersion)", isDirectory: true)
        }
        // A previous process may have isolated a signed-out partition and then
        // terminated before physical deletion completed. Quarantined directories
        // are never eligible cache paths; this cleanup is opportunistic only.
        try? Self.purgeQuarantinedPartitions(
            in: self.rootDirectory,
            fileManager: fileManager,
            matching: nil
        )
    }

    func read(product: MobileReadProduct, partition: ReadCachePartition) async throws -> Data? {
        guard product != .historyDetail, product != .matchDetail else { throw ReadCacheError.invalidCacheKey }
        return try await read(key: MobileReadCacheKey(product: product), partition: partition)
    }

    func read(key: MobileReadCacheKey, partition: ReadCachePartition) async throws -> Data? {
        let url = fileURL(key: key, partition: partition)
        guard !quarantinedEntryPaths.contains(url.path),
              !fileManager.fileExists(atPath: entryRevocationURL(for: url).path) else { return nil }
        guard fileManager.fileExists(atPath: url.path) else { return nil }
        return try Data(contentsOf: url, options: [.mappedIfSafe])
    }

    func write(_ data: Data, product: MobileReadProduct, partition: ReadCachePartition) async throws {
        guard product != .historyDetail, product != .matchDetail else { throw ReadCacheError.invalidCacheKey }
        try await write(data, key: MobileReadCacheKey(product: product), partition: partition)
    }

    func write(_ data: Data, key: MobileReadCacheKey, partition: ReadCachePartition) async throws {
        let directory = partitionDirectory(partition)
        try createProtectedDirectory(directory)
        let destination = fileURL(key: key, partition: partition)
        try data.write(
            to: destination,
            options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication]
        )
        try fileManager.setAttributes(
            [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication],
            ofItemAtPath: destination.path
        )
        let marker = entryRevocationURL(for: destination)
        if fileManager.fileExists(atPath: marker.path) {
            try fileManager.removeItem(at: marker)
        }
        quarantinedEntryPaths.remove(destination.path)
    }

    func remove(product: MobileReadProduct, partition: ReadCachePartition) async throws {
        guard product != .historyDetail, product != .matchDetail else { throw ReadCacheError.invalidCacheKey }
        try await remove(key: MobileReadCacheKey(product: product), partition: partition)
    }

    func remove(key: MobileReadCacheKey, partition: ReadCachePartition) async throws {
        let url = fileURL(key: key, partition: partition)
        guard key.product == .matchDetail else {
            guard fileManager.fileExists(atPath: url.path) else { return }
            try fileManager.removeItem(at: url)
            return
        }
        quarantinedEntryPaths.insert(url.path)
        guard fileManager.fileExists(atPath: url.path) else { return }
        let quarantine = url.deletingLastPathComponent().appendingPathComponent(
            ".pending-delete-entry-\(key.filename)-\(UUID().uuidString.lowercased())"
        )
        do {
            // Exact-file rename is atomic, preserves every other Match/list,
            // and makes a failed physical delete ineligible after relaunch.
            try fileManager.moveItem(at: url, to: quarantine)
        } catch {
            // If rename is unavailable, a durable empty marker still denies
            // reads from the old exact path until a fresh write replaces it.
            try Data().write(
                to: entryRevocationURL(for: url),
                options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication]
            )
            try fileManager.removeItem(at: url)
            return
        }
        try fileManager.removeItem(at: quarantine)
    }

    func remove(partition: ReadCachePartition) throws {
        let directory = partitionDirectory(partition)
        if fileManager.fileExists(atPath: directory.path) {
            let quarantine = rootDirectory.appendingPathComponent(
                Self.quarantineName(for: partition),
                isDirectory: true
            )
            // Moving within Application Support is atomic. Once this succeeds,
            // the digest path cannot be read by this or a newly launched process,
            // even if physical deletion is interrupted or temporarily fails.
            try fileManager.moveItem(at: directory, to: quarantine)
        }
        try Self.purgeQuarantinedPartitions(
            in: rootDirectory,
            fileManager: fileManager,
            matching: partition.digest
        )
    }

    func byteCount(partition: ReadCachePartition) throws -> Int {
        let directory = partitionDirectory(partition)
        guard let enumerator = fileManager.enumerator(
            at: directory,
            includingPropertiesForKeys: [.fileSizeKey],
            options: [.skipsHiddenFiles]
        ) else { return 0 }
        return try enumerator.reduce(into: 0) { result, item in
            guard let url = item as? URL else { return }
            result += try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
        }
    }

    func fileURL(product: MobileReadProduct, partition: ReadCachePartition) -> URL {
        fileURL(key: MobileReadCacheKey(product: product), partition: partition)
    }

    func fileURL(key: MobileReadCacheKey, partition: ReadCachePartition) -> URL {
        partitionDirectory(partition).appendingPathComponent(key.filename, isDirectory: false)
    }

    private func partitionDirectory(_ partition: ReadCachePartition) -> URL {
        rootDirectory.appendingPathComponent(partition.digest, isDirectory: true)
    }

    private func entryRevocationURL(for url: URL) -> URL {
        url.deletingLastPathComponent().appendingPathComponent(".revoked-\(url.lastPathComponent)")
    }

    private func createProtectedDirectory(_ directory: URL) throws {
        if !fileManager.fileExists(atPath: directory.path) {
            try fileManager.createDirectory(
                at: directory,
                withIntermediateDirectories: true,
                attributes: [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication]
            )
        }
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        var mutableDirectory = directory
        try mutableDirectory.setResourceValues(values)
    }

    private static func quarantineName(for partition: ReadCachePartition) -> String {
        "\(quarantinePrefix)\(partition.digest)-\(UUID().uuidString.lowercased())"
    }

    private static func purgeQuarantinedPartitions(
        in rootDirectory: URL,
        fileManager: FileManager,
        matching digest: String?
    ) throws {
        guard fileManager.fileExists(atPath: rootDirectory.path) else { return }
        let candidates = try fileManager.contentsOfDirectory(
            at: rootDirectory,
            includingPropertiesForKeys: nil,
            options: []
        )
        for candidate in candidates {
            guard let candidateDigest = quarantineDigest(from: candidate.lastPathComponent),
                  digest == nil || candidateDigest == digest
            else { continue }
            try fileManager.removeItem(at: candidate)
        }
    }

    private static func quarantineDigest(from name: String) -> String? {
        guard name.hasPrefix(quarantinePrefix) else { return nil }
        let suffix = String(name.dropFirst(quarantinePrefix.count))
        guard suffix.count == 101 else { return nil }
        let digest = String(suffix.prefix(64))
        let separatorIndex = suffix.index(suffix.startIndex, offsetBy: 64)
        guard suffix[separatorIndex] == "-",
              digest.range(of: #"^[a-f0-9]{64}$"#, options: .regularExpression) != nil
        else { return nil }
        let uuidStart = suffix.index(after: separatorIndex)
        guard UUID(uuidString: String(suffix[uuidStart...])) != nil else { return nil }
        return digest
    }
}

enum ReadCacheError: Error, Equatable {
    case invalidPartition
    case invalidCacheKey
    case storageUnavailable
}
