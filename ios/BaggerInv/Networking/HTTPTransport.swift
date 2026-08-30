import Foundation

struct HTTPTransportResult: Sendable {
    let data: Data
    let response: HTTPURLResponse
}

protocol HTTPTransporting: Sendable {
    func data(for request: URLRequest) async throws -> HTTPTransportResult
}

enum HTTPTransportSecurityError: Error, Equatable, Sendable {
    case redirectRejected
    case originMismatch
}

/// URLSession follows redirects unless its delegate explicitly declines them.
/// Mobile-v1 requests can carry both bearer and Bagger certification headers,
/// so even a same-origin redirect is rejected before the redirected request is
/// allowed to leave the process.
final class RedirectRejectingURLSessionDelegate: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    func urlSession(
        _ session: URLSession,
        task: URLSessionTask,
        willPerformHTTPRedirection response: HTTPURLResponse,
        newRequest request: URLRequest,
        completionHandler: @escaping @Sendable (URLRequest?) -> Void
    ) {
        completionHandler(nil)
    }
}

final class URLSessionHTTPTransport: HTTPTransporting, @unchecked Sendable {
    private let session: URLSession
    private let redirectDelegate: RedirectRejectingURLSessionDelegate

    convenience init(timeout: TimeInterval = 20) {
        self.init(configuration: .ephemeral, timeout: timeout)
    }

    /// The injectable boundary remains configuration-only so callers cannot
    /// supply a URLSession whose delegate follows redirects. The production
    /// redirect rejector is installed for every configuration, including test
    /// protocol configurations.
    init(
        configuration: URLSessionConfiguration,
        timeout: TimeInterval = 20
    ) {
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        configuration.urlCache = nil
        configuration.httpCookieStorage = nil
        configuration.httpShouldSetCookies = false
        configuration.timeoutIntervalForRequest = timeout
        configuration.timeoutIntervalForResource = timeout
        let redirectDelegate = RedirectRejectingURLSessionDelegate()
        self.redirectDelegate = redirectDelegate
        session = URLSession(
            configuration: configuration,
            delegate: redirectDelegate,
            delegateQueue: nil
        )
    }

    func data(for request: URLRequest) async throws -> HTTPTransportResult {
        guard let requestURL = request.url,
              Self.origin(for: requestURL) != nil
        else {
            throw HTTPTransportSecurityError.originMismatch
        }
        let (data, response) = try await session.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw MobileAPIClientError.invalidHTTPResponse
        }
        guard !(300...399).contains(httpResponse.statusCode) || httpResponse.statusCode == 304 else {
            throw HTTPTransportSecurityError.redirectRejected
        }
        guard let responseURL = httpResponse.url,
              Self.hasSameOrigin(requestURL, responseURL)
        else {
            throw HTTPTransportSecurityError.originMismatch
        }
        return HTTPTransportResult(data: data, response: httpResponse)
    }

    static func hasSameOrigin(_ lhs: URL, _ rhs: URL) -> Bool {
        guard let lhsOrigin = origin(for: lhs),
              let rhsOrigin = origin(for: rhs)
        else { return false }
        return lhsOrigin == rhsOrigin
    }

    private struct Origin: Equatable {
        let scheme: String
        let host: String
        let port: Int
    }

    private static func origin(for url: URL) -> Origin? {
        guard let rawScheme = url.scheme?.lowercased(),
              let rawHost = url.host?.lowercased(),
              !rawHost.isEmpty
        else { return nil }

        let defaultPort: Int
        switch rawScheme {
        case "https": defaultPort = 443
        case "http": defaultPort = 80
        default: return nil
        }
        return Origin(
            scheme: rawScheme,
            host: rawHost,
            port: url.port ?? defaultPort
        )
    }
}
