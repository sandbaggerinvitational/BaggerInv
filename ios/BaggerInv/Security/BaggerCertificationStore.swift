import Foundation

@MainActor
protocol BaggerCertificationStoring {
    func save(token: String, userID: String, expiresInSeconds: Int, now: Date) throws
    func credential(for userID: String, now: Date) throws -> StoredBaggerCertification?
    func delete() throws
}

struct StoredBaggerCertification: Codable, Equatable, Sendable {
    let token: String
    let userID: String
    let expiresAt: Date

    func isUsable(for activeUserID: String, now: Date) -> Bool {
        userID == activeUserID && expiresAt > now && token.hasPrefix("v1.")
    }
}

@MainActor
final class BaggerCertificationStore: BaggerCertificationStoring {
    static let service = "com.sandbaggerinvitational.bagger.preview.certification"
    static let account = "signed-proof-v1"

    private let keychain: any SecureKeyValueStoring
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder
    private let expirySafetyMargin: TimeInterval

    init(
        keychain: any SecureKeyValueStoring = KeychainStore(),
        expirySafetyMargin: TimeInterval = 60
    ) {
        self.keychain = keychain
        self.expirySafetyMargin = expirySafetyMargin
        encoder = JSONEncoder()
        decoder = JSONDecoder()
        encoder.dateEncodingStrategy = .iso8601
        decoder.dateDecodingStrategy = .iso8601
    }

    func save(token: String, userID: String, expiresInSeconds: Int, now: Date = Date()) throws {
        guard token.hasPrefix("v1."), !userID.isEmpty, expiresInSeconds > Int(expirySafetyMargin) else {
            throw CertificationStoreError.invalidCredential
        }
        let credential = StoredBaggerCertification(
            token: token,
            userID: userID,
            expiresAt: now.addingTimeInterval(TimeInterval(expiresInSeconds) - expirySafetyMargin)
        )
        try keychain.write(
            encoder.encode(credential),
            service: Self.service,
            account: Self.account
        )
    }

    func credential(for userID: String, now: Date = Date()) throws -> StoredBaggerCertification? {
        guard let data = try keychain.read(service: Self.service, account: Self.account) else {
            return nil
        }
        guard let credential = try? decoder.decode(StoredBaggerCertification.self, from: data),
              credential.isUsable(for: userID, now: now)
        else {
            try delete()
            return nil
        }
        return credential
    }

    func delete() throws {
        try keychain.delete(service: Self.service, account: Self.account)
    }
}

enum CertificationStoreError: Error, Equatable {
    case invalidCredential
}
