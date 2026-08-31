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
    func netSkins(accessToken: String, certification: String, etag: String?) async throws -> MobileConditionalRead<MobileNetSkinsResponse>
    func calcutta(accessToken: String, certification: String, etag: String?) async throws -> MobileConditionalRead<MobileCalcuttaResponse>
    func schedule(accessToken: String, certification: String, etag: String?) async throws -> MobileConditionalRead<MobileScheduleResponse>
    func scoringCurrent(accessToken: String, certification: String, matchID: String?) async throws -> MobileScoringCurrentResponse
    func scoringHole(
        request: MobileScoringHoleRequest,
        accessToken: String,
        certification: String
    ) async throws -> MobileScoringHoleResponse
    func scoringFinalize(
        request: MobileScoringFinalizeRequest,
        accessToken: String,
        certification: String
    ) async throws -> MobileScoringFinalizeResponse
}

extension MobileAPIServing {
    func netSkins(
        accessToken: String,
        certification: String,
        etag: String?
    ) async throws -> MobileConditionalRead<MobileNetSkinsResponse> {
        throw MobileAPIClientError.server(code: .mobileAPIUnavailable, status: 503)
    }

    func calcutta(
        accessToken: String,
        certification: String,
        etag: String?
    ) async throws -> MobileConditionalRead<MobileCalcuttaResponse> {
        throw MobileAPIClientError.server(code: .mobileAPIUnavailable, status: 503)
    }

    /// Fail-closed default keeps narrowly scoped test doubles source-compatible.
    func scoringCurrent(
        accessToken: String,
        certification: String,
        matchID: String?
    ) async throws -> MobileScoringCurrentResponse {
        throw MobileAPIClientError.server(code: .scoringUnavailable, status: 503)
    }

    /// Fail-closed default keeps read-only and narrowly scoped test doubles
    /// source-compatible. Step 2F can inject an explicit mutation sender without
    /// making a live score request through an unrelated mock.
    func scoringHole(
        request: MobileScoringHoleRequest,
        accessToken: String,
        certification: String
    ) async throws -> MobileScoringHoleResponse {
        throw MobileScoringMutationError.definitelyNotSent(.clientUnavailable)
    }

    /// Finalization is online-only and fail-closed. Callers must reconcile an
    /// unknown outcome with canonical scoring-current rather than retrying here.
    func scoringFinalize(
        request: MobileScoringFinalizeRequest,
        accessToken: String,
        certification: String
    ) async throws -> MobileScoringFinalizeResponse {
        throw MobileScoringFinalizationError.definitelyNotSent(.clientUnavailable)
    }
}

enum MobileConditionalRead<Response: Sendable>: Sendable {
    case modified(Response, etag: String?)
    case notModified(etag: String?)
}

/// Mutation classification must recognize a bounded future v1 error code
/// without teaching the rest of the app to act on that code. The public typed
/// envelope intentionally remains strict for ordinary mobile reads.
private struct MobileScoringErrorEnvelope: Decodable {
    struct ErrorBody: Decodable {
        let code: String
        let message: String

        var isBounded: Bool {
            code.utf8.count <= 128 &&
            code.range(
                of: #"^[A-Z][A-Z0-9_]{0,127}$"#,
                options: .regularExpression
            ) != nil &&
            !message.isEmpty &&
            message.utf8.count <= 1_024
        }
    }

    let ok: Bool
    let apiVersion: String
    let error: ErrorBody
    let data: MobileErrorData?

    var isCompatibleV1: Bool {
        !ok &&
        apiVersion == "v1" &&
        error.isBounded &&
        (data?.isBoundedScoringMutationContext ?? true)
    }
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

    func netSkins(
        accessToken: String,
        certification: String,
        etag: String?
    ) async throws -> MobileConditionalRead<MobileNetSkinsResponse> {
        try await protectedRead(
            path: "/api/mobile/v1/net-skins",
            accessToken: accessToken,
            certification: certification,
            etag: etag
        )
    }

    func calcutta(
        accessToken: String,
        certification: String,
        etag: String?
    ) async throws -> MobileConditionalRead<MobileCalcuttaResponse> {
        try await protectedRead(
            path: "/api/mobile/v1/calcutta",
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

    func scoringCurrent(
        accessToken: String,
        certification: String,
        matchID: String?
    ) async throws -> MobileScoringCurrentResponse {
        let queryItems: [URLQueryItem]
        if let matchID {
            guard !matchID.isEmpty else { throw MobileAPIClientError.invalidURL }
            queryItems = [URLQueryItem(name: "matchId", value: matchID)]
        } else {
            queryItems = []
        }
        let request = try request(
            path: "/api/mobile/v1/scoring/current",
            method: "GET",
            queryItems: queryItems,
            accessToken: accessToken,
            certification: certification
        )
        let result = try await send(request, expectedStatus: 200)
        do {
            let response = try decoder.decode(MobileScoringCurrentResponse.self, from: result.data)
            guard response.isContractCompatible else {
                throw MobileContractError.incompatibleResponse
            }
            return response
        } catch let error as MobileContractError {
            throw error
        } catch is DecodingError {
            throw MobileContractError.incompatibleResponse
        } catch is MobileReadModelError {
            throw MobileContractError.incompatibleResponse
        } catch {
            throw MobileContractError.incompatibleResponse
        }
    }

    func scoringHole(
        request intent: MobileScoringHoleRequest,
        accessToken: String,
        certification: String
    ) async throws -> MobileScoringHoleResponse {
        guard intent.isContractCompatible else {
            throw MobileScoringMutationError.definitelyNotSent(.invalidRequest)
        }
        guard !accessToken.isEmpty else {
            throw MobileScoringMutationError.definitelyNotSent(.missingBearer)
        }
        guard !certification.isEmpty else {
            throw MobileScoringMutationError.definitelyNotSent(.missingCertification)
        }

        let body: Data
        do {
            body = try encoder.encode(intent)
        } catch {
            throw MobileScoringMutationError.definitelyNotSent(.encoding)
        }

        let urlRequest: URLRequest
        do {
            urlRequest = try request(
                path: "/api/mobile/v1/scoring/hole",
                method: "POST",
                body: body,
                accessToken: accessToken,
                certification: certification
            )
        } catch let error as MobileAPIClientError {
            let reason: MobileScoringMutationPreflightFailure
            switch error {
            case .invalidURL:
                reason = .invalidURL
            case .missingBearer:
                reason = .missingBearer
            case .missingCertification:
                reason = .missingCertification
            default:
                reason = .requestConstruction
            }
            throw MobileScoringMutationError.definitelyNotSent(reason)
        } catch {
            throw MobileScoringMutationError.definitelyNotSent(.requestConstruction)
        }

        let result: HTTPTransportResult
        do {
            // Once transport begins, even cancellation cannot prove that the
            // server did not commit. The queue must retry this same mutation ID.
            result = try await transport.data(for: urlRequest)
        } catch is CancellationError {
            throw MobileScoringMutationError.unknownOutcome(
                reason: .cancelled,
                code: nil,
                status: nil,
                data: nil,
                retryAfter: nil
            )
        } catch {
            throw MobileScoringMutationError.unknownOutcome(
                reason: .transport,
                code: nil,
                status: nil,
                data: nil,
                retryAfter: nil
            )
        }

        let status = result.response.statusCode
        let retryAfter = Self.retryAfter(from: result.response)
        if status == 200 {
            do {
                let response = try decoder.decode(MobileScoringHoleResponse.self, from: result.data)
                guard response.isContractCompatible(for: intent) else {
                    throw MobileContractError.incompatibleResponse
                }
                return response
            } catch {
                // A malformed or mismatched acknowledgement arrived only after
                // transport. It cannot safely be treated as a known rejection.
                throw MobileScoringMutationError.unknownOutcome(
                    reason: .invalidAcknowledgement,
                    code: nil,
                    status: status,
                    data: nil,
                    retryAfter: retryAfter
                )
            }
        }

        let errorResponse = (try? decoder.decode(MobileScoringErrorEnvelope.self, from: result.data)).flatMap { response in
            response.isCompatibleV1 ? response : nil
        }
        let code = errorResponse.flatMap { MobileErrorCode(rawValue: $0.error.code) }
        let errorData = errorResponse?.data.flatMap { data in
            data.isBoundedScoringMutationContext && data.matchId == intent.matchId ? data : nil
        }

        if (400...499).contains(status) {
            guard errorResponse != nil else {
                // Transport began, but an intermediary or incompatible server
                // may have produced this status. Only the exact v1 error
                // envelope proves that the mobile endpoint rejected the POST.
                throw MobileScoringMutationError.unknownOutcome(
                    reason: .unexpectedResponse,
                    code: nil,
                    status: status,
                    data: nil,
                    retryAfter: retryAfter
                )
            }
            throw MobileScoringMutationError.rejected(
                code: code,
                status: status,
                data: errorData,
                retryAfter: retryAfter
            )
        }

        throw MobileScoringMutationError.unknownOutcome(
            reason: status >= 500 ? .serverFailure : .unexpectedResponse,
            code: code,
            status: status,
            data: errorData,
            retryAfter: retryAfter
        )
    }

    func scoringFinalize(
        request intent: MobileScoringFinalizeRequest,
        accessToken: String,
        certification: String
    ) async throws -> MobileScoringFinalizeResponse {
        guard intent.isContractCompatible else {
            throw MobileScoringFinalizationError.definitelyNotSent(.invalidRequest)
        }
        guard !accessToken.isEmpty else {
            throw MobileScoringFinalizationError.definitelyNotSent(.missingBearer)
        }
        guard !certification.isEmpty else {
            throw MobileScoringFinalizationError.definitelyNotSent(.missingCertification)
        }

        let body: Data
        do {
            body = try encoder.encode(intent)
        } catch {
            throw MobileScoringFinalizationError.definitelyNotSent(.encoding)
        }

        let urlRequest: URLRequest
        do {
            urlRequest = try request(
                path: "/api/mobile/v1/scoring/finalize",
                method: "POST",
                body: body,
                accessToken: accessToken,
                certification: certification
            )
        } catch let error as MobileAPIClientError {
            let reason: MobileScoringMutationPreflightFailure
            switch error {
            case .invalidURL:
                reason = .invalidURL
            case .missingBearer:
                reason = .missingBearer
            case .missingCertification:
                reason = .missingCertification
            default:
                reason = .requestConstruction
            }
            throw MobileScoringFinalizationError.definitelyNotSent(reason)
        } catch {
            throw MobileScoringFinalizationError.definitelyNotSent(.requestConstruction)
        }

        let result: HTTPTransportResult
        do {
            // Finalization is deliberately not retried here. Once transport
            // begins, a lost response is an unknown outcome that must be
            // reconciled through scoring-current by the finalization owner.
            result = try await transport.data(for: urlRequest)
        } catch is CancellationError {
            throw MobileScoringFinalizationError.unknownOutcome(
                reason: .cancelled,
                code: nil,
                status: nil,
                data: nil,
                retryAfter: nil
            )
        } catch {
            throw MobileScoringFinalizationError.unknownOutcome(
                reason: .transport,
                code: nil,
                status: nil,
                data: nil,
                retryAfter: nil
            )
        }

        let status = result.response.statusCode
        let retryAfter = Self.retryAfter(from: result.response)
        if status == 200 {
            do {
                let response = try decoder.decode(MobileScoringFinalizeResponse.self, from: result.data)
                guard response.isContractCompatible(for: intent) else {
                    throw MobileContractError.incompatibleResponse
                }
                return response
            } catch {
                throw MobileScoringFinalizationError.unknownOutcome(
                    reason: .invalidAcknowledgement,
                    code: nil,
                    status: status,
                    data: nil,
                    retryAfter: retryAfter
                )
            }
        }

        let errorResponse = (try? decoder.decode(MobileScoringErrorEnvelope.self, from: result.data)).flatMap { response in
            response.isCompatibleV1 ? response : nil
        }
        let code = errorResponse.flatMap { MobileErrorCode(rawValue: $0.error.code) }
        let errorData = errorResponse?.data.flatMap { data in
            data.isBoundedScoringMutationContext && data.matchId == intent.matchId ? data : nil
        }

        if (400...499).contains(status) {
            guard errorResponse != nil else {
                // A bare or incompatible 4xx cannot prove that the mobile
                // finalization endpoint declined the POST after transport.
                throw MobileScoringFinalizationError.unknownOutcome(
                    reason: .unexpectedResponse,
                    code: nil,
                    status: status,
                    data: nil,
                    retryAfter: retryAfter
                )
            }
            throw MobileScoringFinalizationError.rejected(
                code: code,
                status: status,
                data: errorData,
                retryAfter: retryAfter
            )
        }

        throw MobileScoringFinalizationError.unknownOutcome(
            reason: status >= 500 ? .serverFailure : .unexpectedResponse,
            code: code,
            status: status,
            data: errorData,
            retryAfter: retryAfter
        )
    }

    private func request(
        path: String,
        method: String,
        body: Data? = nil,
        queryItems: [URLQueryItem] = [],
        accessToken: String? = nil,
        certification: String? = nil
    ) throws -> URLRequest {
        guard baseURL.scheme == "https",
              let relativeURL = URL(string: path, relativeTo: baseURL)?.absoluteURL,
              var components = URLComponents(url: relativeURL, resolvingAgainstBaseURL: false)
        else {
            throw MobileAPIClientError.invalidURL
        }
        if !queryItems.isEmpty {
            components.queryItems = queryItems
        }
        guard let url = components.url,
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

    private static func retryAfter(from response: HTTPURLResponse) -> MobileRetryAfter? {
        guard let header = response.value(forHTTPHeaderField: "Retry-After")?
            .trimmingCharacters(in: .whitespacesAndNewlines),
            !header.isEmpty,
            header.utf8.count <= 128
        else { return nil }

        if header.allSatisfy(\.isNumber),
           let seconds = TimeInterval(header),
           seconds.isFinite,
           seconds >= 0
        {
            return .delay(seconds)
        }

        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        for format in [
            "EEE',' dd MMM yyyy HH':'mm':'ss zzz",
            "EEEE',' dd-MMM-yy HH':'mm':'ss zzz",
            "EEE MMM d HH':'mm':'ss yyyy",
        ] {
            formatter.dateFormat = format
            if let date = formatter.date(from: header) {
                return .date(date)
            }
        }
        return nil
    }
}

enum MobileScoringMutationPreflightFailure: String, Equatable, Sendable {
    case clientUnavailable
    case invalidRequest
    case invalidURL
    case missingBearer
    case missingCertification
    case encoding
    case requestConstruction
}

enum MobileScoringMutationUnknownReason: String, Equatable, Sendable {
    case cancelled
    case transport
    case invalidAcknowledgement
    case serverFailure
    case unexpectedResponse
}

enum MobileScoringMutationOutcomeCertainty: String, Equatable, Sendable {
    case definitelyNotSent
    case knownRejected
    case unknown
}

enum MobileRetryAfter: Equatable, Sendable {
    case delay(TimeInterval)
    case date(Date)
}

enum MobileScoringMutationError: Error, Equatable, Sendable, CustomStringConvertible {
    case definitelyNotSent(MobileScoringMutationPreflightFailure)
    case rejected(
        code: MobileErrorCode?,
        status: Int,
        data: MobileErrorData?,
        retryAfter: MobileRetryAfter?
    )
    case unknownOutcome(
        reason: MobileScoringMutationUnknownReason,
        code: MobileErrorCode?,
        status: Int?,
        data: MobileErrorData?,
        retryAfter: MobileRetryAfter?
    )

    var outcomeCertainty: MobileScoringMutationOutcomeCertainty {
        switch self {
        case .definitelyNotSent: .definitelyNotSent
        case .rejected: .knownRejected
        case .unknownOutcome: .unknown
        }
    }

    var description: String {
        switch self {
        case .definitelyNotSent(let reason):
            "scoring_mutation_not_sent_\(reason.rawValue)"
        case .rejected(let code, let status, _, _):
            "scoring_mutation_rejected_\(code?.rawValue ?? "unknown")_\(status)"
        case .unknownOutcome(let reason, let code, let status, _, _):
            "scoring_mutation_unknown_\(reason.rawValue)_\(code?.rawValue ?? "unknown")_\(status.map(String.init) ?? "none")"
        }
    }
}

/// Distinct from the durable hole-mutation error so an unknown finalization
/// outcome cannot accidentally enter the queue's automatic same-ID retry path.
enum MobileScoringFinalizationError: Error, Equatable, Sendable, CustomStringConvertible {
    case definitelyNotSent(MobileScoringMutationPreflightFailure)
    case rejected(
        code: MobileErrorCode?,
        status: Int,
        data: MobileErrorData?,
        retryAfter: MobileRetryAfter?
    )
    case unknownOutcome(
        reason: MobileScoringMutationUnknownReason,
        code: MobileErrorCode?,
        status: Int?,
        data: MobileErrorData?,
        retryAfter: MobileRetryAfter?
    )

    var outcomeCertainty: MobileScoringMutationOutcomeCertainty {
        switch self {
        case .definitelyNotSent: .definitelyNotSent
        case .rejected: .knownRejected
        case .unknownOutcome: .unknown
        }
    }

    var description: String {
        switch self {
        case .definitelyNotSent(let reason):
            "scoring_finalization_not_sent_\(reason.rawValue)"
        case .rejected(let code, let status, _, _):
            "scoring_finalization_rejected_\(code?.rawValue ?? "unknown")_\(status)"
        case .unknownOutcome(let reason, let code, let status, _, _):
            "scoring_finalization_unknown_\(reason.rawValue)_\(code?.rawValue ?? "unknown")_\(status.map(String.init) ?? "none")"
        }
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
