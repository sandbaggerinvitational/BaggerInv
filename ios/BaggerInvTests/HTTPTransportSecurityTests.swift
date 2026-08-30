import Foundation
import XCTest
@testable import BaggerInv

@MainActor
final class HTTPTransportSecurityTests: XCTestCase {
    func testRedirectDelegateDeclines307And308WithoutForwardingRequest() async throws {
        let delegate = RedirectRejectingURLSessionDelegate()
        let session = URLSession(configuration: .ephemeral)
        defer { session.invalidateAndCancel() }
        let sourceURL = try XCTUnwrap(
            URL(string: "https://native-preview.baggerinv.com/api/mobile/v1/scoring/hole")
        )

        for statusCode in [307, 308] {
            let task = session.dataTask(with: sourceURL)
            let response = try XCTUnwrap(
                HTTPURLResponse(
                    url: sourceURL,
                    statusCode: statusCode,
                    httpVersion: "HTTP/1.1",
                    headerFields: ["Location": "https://redirect.invalid/scoring/hole"]
                )
            )
            var redirectedRequest = URLRequest(
                url: try XCTUnwrap(URL(string: "https://redirect.invalid/scoring/hole"))
            )
            redirectedRequest.httpMethod = "POST"
            redirectedRequest.setValue("Bearer synthetic", forHTTPHeaderField: "Authorization")
            redirectedRequest.setValue(
                "synthetic-certification",
                forHTTPHeaderField: "X-Bagger-Certification"
            )

            let forwardedRequest: URLRequest? = await withCheckedContinuation { continuation in
                delegate.urlSession(
                    session,
                    task: task,
                    willPerformHTTPRedirection: response,
                    newRequest: redirectedRequest
                ) { request in
                    continuation.resume(returning: request)
                }
            }

            XCTAssertNil(
                forwardedRequest,
                "HTTP \(statusCode) must be declined before its redirected request can leave"
            )
        }
    }

    func testTransportRejects307And308Responses() async throws {
        for statusCode in [307, 308] {
            let transport = makeTransport()
            let request = URLRequest(
                url: try XCTUnwrap(
                    URL(string: "https://native-preview.baggerinv.com/fixture/\(statusCode)")
                )
            )

            do {
                _ = try await transport.data(for: request)
                XCTFail("HTTP \(statusCode) must fail closed")
            } catch {
                XCTAssertEqual(
                    error as? HTTPTransportSecurityError,
                    .redirectRejected
                )
            }
        }
    }

    func testNotModifiedResponseIsNotMisclassifiedAsRedirect() async throws {
        let transport = makeTransport()
        let request = URLRequest(
            url: try XCTUnwrap(
                URL(string: "https://native-preview.baggerinv.com/fixture/304")
            )
        )

        let result = try await transport.data(for: request)

        XCTAssertEqual(result.response.statusCode, 304)
    }

    func testOriginComparisonUsesSchemeHostAndEffectivePort() throws {
        let canonical = try XCTUnwrap(URL(string: "https://native-preview.baggerinv.com/path"))
        let explicitHTTPSPort = try XCTUnwrap(
            URL(string: "https://NATIVE-PREVIEW.BAGGERINV.COM:443/other")
        )
        let nonDefaultPort = try XCTUnwrap(
            URL(string: "https://native-preview.baggerinv.com:444/path")
        )
        let differentScheme = try XCTUnwrap(
            URL(string: "http://native-preview.baggerinv.com/path")
        )
        let differentHost = try XCTUnwrap(
            URL(string: "https://redirect.invalid/path")
        )

        XCTAssertTrue(URLSessionHTTPTransport.hasSameOrigin(canonical, explicitHTTPSPort))
        XCTAssertFalse(URLSessionHTTPTransport.hasSameOrigin(canonical, nonDefaultPort))
        XCTAssertFalse(URLSessionHTTPTransport.hasSameOrigin(canonical, differentScheme))
        XCTAssertFalse(URLSessionHTTPTransport.hasSameOrigin(canonical, differentHost))
    }

    func testTransportRejectsCrossOriginFinalResponse() async throws {
        let transport = makeTransport()
        let request = URLRequest(
            url: try XCTUnwrap(
                URL(string: "https://native-preview.baggerinv.com/fixture/cross-origin")
            )
        )

        do {
            _ = try await transport.data(for: request)
            XCTFail("A response from another origin must fail closed")
        } catch {
            XCTAssertEqual(
                error as? HTTPTransportSecurityError,
                .originMismatch
            )
        }
    }

    private func makeTransport() -> URLSessionHTTPTransport {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [HTTPTransportSecurityFixtureURLProtocol.self]
        return URLSessionHTTPTransport(configuration: configuration)
    }
}

private final class HTTPTransportSecurityFixtureURLProtocol: URLProtocol {
    override class func canInit(with request: URLRequest) -> Bool {
        request.url?.host?.lowercased() == "native-preview.baggerinv.com"
    }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest {
        request
    }

    override func startLoading() {
        guard let requestURL = request.url else {
            client?.urlProtocol(self, didFailWithError: URLError(.badURL))
            return
        }

        let statusCode = Int(requestURL.lastPathComponent) ?? 200
        let responseURL: URL
        if requestURL.lastPathComponent == "cross-origin" {
            guard let crossOrigin = URL(string: "https://redirect.invalid/final") else {
                client?.urlProtocol(self, didFailWithError: URLError(.badURL))
                return
            }
            responseURL = crossOrigin
        } else {
            responseURL = requestURL
        }
        let headers: [String: String]
        if statusCode == 307 || statusCode == 308 {
            headers = ["Location": "https://redirect.invalid/final"]
        } else {
            headers = [:]
        }
        guard let response = HTTPURLResponse(
            url: responseURL,
            statusCode: statusCode,
            httpVersion: "HTTP/1.1",
            headerFields: headers
        ) else {
            client?.urlProtocol(self, didFailWithError: URLError(.badServerResponse))
            return
        }

        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data())
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}
