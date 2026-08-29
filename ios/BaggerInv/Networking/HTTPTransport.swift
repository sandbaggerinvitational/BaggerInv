import Foundation

struct HTTPTransportResult: Sendable {
    let data: Data
    let response: HTTPURLResponse
}

protocol HTTPTransporting: Sendable {
    func data(for request: URLRequest) async throws -> HTTPTransportResult
}

final class URLSessionHTTPTransport: HTTPTransporting, @unchecked Sendable {
    private let session: URLSession

    init(timeout: TimeInterval = 20) {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        configuration.urlCache = nil
        configuration.httpCookieStorage = nil
        configuration.httpShouldSetCookies = false
        configuration.timeoutIntervalForRequest = timeout
        configuration.timeoutIntervalForResource = timeout
        session = URLSession(configuration: configuration)
    }

    init(session: URLSession) {
        self.session = session
    }

    func data(for request: URLRequest) async throws -> HTTPTransportResult {
        let (data, response) = try await session.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw MobileAPIClientError.invalidHTTPResponse
        }
        return HTTPTransportResult(data: data, response: httpResponse)
    }
}
