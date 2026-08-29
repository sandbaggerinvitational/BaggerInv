import Foundation

@MainActor
protocol MobileAPIServing {
    func health() async throws -> MobileHealthResponse
    func requestOTP(identifier: String, captchaToken: String) async throws -> OTPRequestAcknowledgement
    func certify(challengeId: String, accessToken: String) async throws -> OTPCertificationAcknowledgement
    func participantSession(accessToken: String, certification: String) async throws -> ParticipantSession
    func today(accessToken: String, certification: String, etag: String?) async throws -> MobileConditionalRead<MobileTodayResponse>
    func matches(accessToken: String, certification: String, etag: String?) async throws -> MobileConditionalRead<MobileMatchesResponse>
    func leaders(accessToken: String, certification: String, etag: String?) async throws -> MobileConditionalRead<MobileLeadersResponse>
    func schedule(accessToken: String, certification: String, etag: String?) async throws -> MobileConditionalRead<MobileScheduleResponse>
}

enum MobileConditionalRead<Response: Sendable>: Sendable {
    case modified(Response, etag: String?)
    case notModified(etag: String?)
}

@MainActor
struct MobileAPIClient: MobileAPIServing {
    private let baseURL: URL
    private let transport: any HTTPTransporting
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder

    init(
        baseURL: URL,
        transport: any HTTPTransporting = URLSessionHTTPTransport(),
        encoder: JSONEncoder = JSONEncoder(),
        decoder: JSONDecoder = JSONDecoder()
    ) {
        self.baseURL = baseURL
        self.transport = transport
        self.encoder = encoder
        self.decoder = decoder
    }

    func health() async throws -> MobileHealthResponse {
        let request = try request(path: "/api/mobile/v1/health", method: "GET")
        let result = try await send(request, expectedStatus: 200)
        return try MobileHealthContract.decodeAndValidate(result.data, decoder: decoder)
    }

    func requestOTP(identifier: String, captchaToken: String) async throws -> OTPRequestAcknowledgement {
        let body = OTPRequestBody(identifier: identifier, captchaToken: captchaToken)
        let request = try request(
            path: "/api/mobile/v1/auth/otp/request",
            method: "POST",
            body: encoder.encode(body)
        )
        let result = try await send(request, expectedStatus: 202)
        let response = try decoder.decode(OTPRequestResponse.self, from: result.data)
        guard response.isCompatible else { throw MobileContractError.incompatibleResponse }
        return response.data
    }

    func certify(challengeId: String, accessToken: String) async throws -> OTPCertificationAcknowledgement {
        let body = OTPCertificationBody(challengeId: challengeId)
        let request = try request(
            path: "/api/mobile/v1/auth/otp/certify",
            method: "POST",
            body: encoder.encode(body),
            accessToken: accessToken
        )
        let result = try await send(request, expectedStatus: 200)
        let response = try decoder.decode(OTPCertificationResponse.self, from: result.data)
        guard response.isCompatible else { throw MobileContractError.incompatibleResponse }
        return response.data
    }

    func participantSession(accessToken: String, certification: String) async throws -> ParticipantSession {
        let request = try request(
            path: "/api/mobile/v1/session",
            method: "GET",
            accessToken: accessToken,
            certification: certification
        )
        let result = try await send(request, expectedStatus: 200)
        let response = try decoder.decode(ParticipantSessionResponse.self, from: result.data)
        guard response.isCompatible else { throw MobileContractError.incompatibleResponse }
        return response.data
    }

    func today(
        accessToken: String,
        certification: String,
        etag: String?
    ) async throws -> MobileConditionalRead<MobileTodayResponse> {
        try await protectedRead(
            path: "/api/mobile/v1/today",
            accessToken: accessToken,
            certification: certification,
            etag: etag
        )
    }

    func matches(
        accessToken: String,
        certification: String,
        etag: String?
    ) async throws -> MobileConditionalRead<MobileMatchesResponse> {
        try await protectedRead(
            path: "/api/mobile/v1/matches",
            accessToken: accessToken,
            certification: certification,
            etag: etag
        )
    }

    func leaders(
        accessToken: String,
        certification: String,
        etag: String?
    ) async throws -> MobileConditionalRead<MobileLeadersResponse> {
        try await protectedRead(
            path: "/api/mobile/v1/leaders",
            accessToken: accessToken,
            certification: certification,
            etag: etag
        )
    }

    func schedule(
        accessToken: String,
        certification: String,
        etag: String?
    ) async throws -> MobileConditionalRead<MobileScheduleResponse> {
        try await protectedRead(
            path: "/api/mobile/v1/schedule",
            accessToken: accessToken,
            certification: certification,
            etag: etag
        )
    }

    private func request(
        path: String,
        method: String,
        body: Data? = nil,
        accessToken: String? = nil,
        certification: String? = nil
    ) throws -> URLRequest {
        guard baseURL.scheme == "https",
              let url = URL(string: path, relativeTo: baseURL)?.absoluteURL,
              url.scheme == "https",
              url.host == baseURL.host
        else {
            throw MobileAPIClientError.invalidURL
        }

        if certification != nil && accessToken == nil {
            throw MobileAPIClientError.missingBearer
        }
        if path == "/api/mobile/v1/session" && certification == nil {
            throw MobileAPIClientError.missingCertification
        }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = 20
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue("no-store", forHTTPHeaderField: "Cache-Control")

        if let body {
            request.httpBody = body
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        if let accessToken {
            guard !accessToken.isEmpty else { throw MobileAPIClientError.missingBearer }
            request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        }
        if let certification {
            guard !certification.isEmpty else { throw MobileAPIClientError.missingCertification }
            request.setValue(certification, forHTTPHeaderField: "X-Bagger-Certification")
        }
        return request
    }

    private func protectedRead<Response: MobileReadResponseValidating>(
        path: String,
        accessToken: String,
        certification: String,
        etag: String?
    ) async throws -> MobileConditionalRead<Response> {
        var request = try request(
            path: path,
            method: "GET",
            accessToken: accessToken,
            certification: certification
        )
        request.setValue("no-cache", forHTTPHeaderField: "Cache-Control")
        if let etag, !etag.isEmpty {
            request.setValue(etag, forHTTPHeaderField: "If-None-Match")
        }

        let result = try await perform(request)
        let returnedETag = result.response.value(forHTTPHeaderField: "ETag")
        if result.response.statusCode == 304 {
            return .notModified(etag: returnedETag)
        }
        guard result.response.statusCode == 200 else {
            throw responseError(for: result)
        }
        do {
            let response = try decoder.decode(Response.self, from: result.data)
            guard response.isReadContractCompatible else {
                throw MobileContractError.incompatibleResponse
            }
            return .modified(response, etag: returnedETag)
        } catch let error as MobileContractError {
            throw error
        } catch {
            throw MobileContractError.incompatibleResponse
        }
    }

    private func send(_ request: URLRequest, expectedStatus: Int) async throws -> HTTPTransportResult {
        let result = try await perform(request)

        guard result.response.statusCode == expectedStatus else {
            throw responseError(for: result)
        }
        return result
    }

    private func perform(_ request: URLRequest) async throws -> HTTPTransportResult {
        do {
            return try await transport.data(for: request)
        } catch is CancellationError {
            throw CancellationError()
        } catch let error as MobileAPIClientError {
            throw error
        } catch {
            throw MobileAPIClientError.transportUnavailable
        }
    }

    private func responseError(for result: HTTPTransportResult) -> MobileAPIClientError {
        if let response = try? decoder.decode(MobileErrorResponse.self, from: result.data),
           response.ok == false,
           response.apiVersion == "v1"
        {
            return .server(code: response.error.code, status: result.response.statusCode)
        }
        return .unexpectedStatus(result.response.statusCode)
    }
}

enum MobileAPIClientError: Error, Equatable, CustomStringConvertible {
    case invalidURL
    case invalidHTTPResponse
    case transportUnavailable
    case unexpectedStatus(Int)
    case server(code: MobileErrorCode, status: Int)
    case missingBearer
    case missingCertification

    var description: String {
        switch self {
        case .invalidURL: "invalid_url"
        case .invalidHTTPResponse: "invalid_http_response"
        case .transportUnavailable: "transport_unavailable"
        case .unexpectedStatus(let status): "unexpected_status_\(status)"
        case .server(let code, let status): "server_\(code.rawValue)_\(status)"
        case .missingBearer: "missing_bearer"
        case .missingCertification: "missing_certification"
        }
    }
}
