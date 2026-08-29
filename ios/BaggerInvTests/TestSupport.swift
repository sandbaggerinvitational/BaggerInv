import Foundation
@testable import BaggerInv

enum TestFixtures {
    static let now = Date(timeIntervalSince1970: 1_800_000_000)
    static let challengeID = "02da9f92-43d7-494c-9b11-d1bb2d5631dc"
    static let certificationToken =
        "v1.1234567890.1234567890." + String(repeating: "a", count: 22) + "." + String(repeating: "b", count: 43)

    static let environment = try! NativeEnvironment(
        apiBaseURL: NativeEnvironment.previewAPIURL,
        supabaseURL: NativeEnvironment.previewSupabaseURL,
        supabasePublishableKey: "sb_publishable_test_client_key"
    )

    static let health = MobileHealthResponse(
        ok: true,
        apiVersion: "v1",
        service: "bagger-mobile-api",
        environment: "preview",
        authority: .isolatedPreview
    )

    static let otpAcknowledgement = OTPRequestAcknowledgement(
        accepted: true,
        method: "email",
        verificationType: "email",
        challengeId: challengeID,
        expiresInSeconds: 900,
        resendAfterSeconds: 60,
        message: "If the identifier is eligible, a sign-in code will be sent."
    )

    static let certificationAcknowledgement = OTPCertificationAcknowledgement(
        certified: true,
        certificationToken: certificationToken,
        expiresInSeconds: 43_200
    )

    static let participant = ParticipantSession(
        player: ParticipantPlayer(
            playerId: "player-preview-1",
            displayName: "Preview Golfer",
            team: ParticipantTeam(teamId: "team-preview-1", name: "Preview Team")
        ),
        tournament: ParticipantTournament(
            tournamentId: "tournament-preview-1",
            name: "Preview Invitational",
            year: 2026
        )
    )

    static let authSession = SupabaseAuthSession(
        accessToken: "access-token-not-for-diagnostics",
        userID: "7d52b7ee-6e4b-4f5f-bb73-9ba47135c16e",
        accessTokenExpiresAt: now.addingTimeInterval(3_600)
    )

    static let readTournament = MobileReadTournament(
        tournamentId: participant.tournament.tournamentId,
        name: participant.tournament.name,
        year: participant.tournament.year,
        status: "Live",
        currentRound: 2,
        timeZone: "America/Chicago"
    )

    static let readMeta = MobileReadMeta(
        generatedAt: try! MobileTimestamp("2027-01-15T08:00:00.000Z"),
        revision: "fixture-revision-1"
    )

    static let todayResponse = MobileTodayResponse(
        ok: true,
        apiVersion: "v1",
        data: MobileTodayData(
            tournament: readTournament,
            player: MobileReadPlayer(
                playerId: participant.player.playerId,
                displayName: participant.player.displayName,
                team: MobileReadTeam(teamId: participant.player.team?.teamId, name: participant.player.team?.name ?? "")
            ),
            currentMatch: nil,
            immediateSchedule: []
        ),
        meta: readMeta
    )

    static let matchesResponse = MobileMatchesResponse(
        ok: true,
        apiVersion: "v1",
        data: MobileMatchesData(tournament: readTournament, matches: []),
        meta: readMeta
    )

    static let leadersResponse = MobileLeadersResponse(
        ok: true,
        apiVersion: "v1",
        data: MobileLeadersData(tournament: readTournament, teamStandings: [], playerStandings: []),
        meta: readMeta
    )

    static let scheduleResponse = MobileScheduleResponse(
        ok: true,
        apiVersion: "v1",
        data: MobileScheduleData(
            tournamentId: participant.tournament.tournamentId,
            timeZone: "America/Chicago",
            events: []
        ),
        meta: readMeta
    )

    static let scoringResponse = MobileScoringCurrentResponse(
        ok: true,
        apiVersion: "v1",
        data: MobileScoringCurrentData(
            scoring: MobileScoringCurrent(
                match: MobileScoringMatch(
                    matchId: "match-preview-1",
                    roundNumber: 2,
                    format: .bestBall,
                    status: .inProgress,
                    matchRevision: 7,
                    permissionRevision: 3,
                    result: nil
                ),
                player: MobileScoringPlayer(
                    playerId: participant.player.playerId,
                    displayName: participant.player.displayName,
                    teamSide: 1
                ),
                sides: [
                    MobileScoringSide(
                        side: 1,
                        teamId: "team-preview-1",
                        name: "Preview Team",
                        participants: [
                            MobileScoringParticipant(
                                playerId: participant.player.playerId,
                                displayName: participant.player.displayName,
                                slot: 1,
                                isAuthenticatedPlayer: true,
                                handicapIndex: 8.4,
                                courseHandicap: 9,
                                playingHandicap: 8,
                                strokes: 1
                            ),
                            MobileScoringParticipant(
                                playerId: "player-preview-2",
                                displayName: "Preview Partner",
                                slot: 2,
                                isAuthenticatedPlayer: false,
                                handicapIndex: 10.1,
                                courseHandicap: 11,
                                playingHandicap: 10,
                                strokes: 1
                            ),
                        ]
                    ),
                    MobileScoringSide(
                        side: 2,
                        teamId: "team-preview-2",
                        name: "Other Team",
                        participants: [
                            MobileScoringParticipant(
                                playerId: "player-preview-3",
                                displayName: "Preview Opponent",
                                slot: 1,
                                isAuthenticatedPlayer: false,
                                handicapIndex: 7.2,
                                courseHandicap: 8,
                                playingHandicap: 7,
                                strokes: 0
                            ),
                            MobileScoringParticipant(
                                playerId: "player-preview-4",
                                displayName: "Preview Opponent Two",
                                slot: 2,
                                isAuthenticatedPlayer: false,
                                handicapIndex: 12.3,
                                courseHandicap: 13,
                                playingHandicap: 12,
                                strokes: 1
                            ),
                        ]
                    ),
                ],
                course: MobileScoringCourse(
                    courseId: "course-preview-1",
                    name: "Preview Course",
                    tee: "Blue",
                    rating: 72.1,
                    slope: 131,
                    par: 72,
                    holes: [
                        MobileScoringCourseHole(holeNumber: 1, par: 4, strokeIndex: 5, yardage: 411),
                    ]
                ),
                scores: [
                    MobileScoringHoleScore(
                        holeNumber: 1,
                        revision: 2,
                        gross: MobileScoringGross(teamOne: [4, 5], teamTwo: [5, 6]),
                        strokes: MobileScoringStrokes(teamOne: [1, 0], teamTwo: [0, 1]),
                        net: MobileScoringNet(teamOne: 3, teamTwo: 5),
                        winner: .teamOne,
                        updatedAt: try! MobileTimestamp("2027-01-15T08:01:00.000Z")
                    ),
                ],
                progress: MobileScoringProgress(
                    currentHole: 2,
                    holesRemaining: 17,
                    scorecardComplete: false,
                    statusText: "1 UP through 1"
                ),
                permission: MobileScoringPermission(
                    canScore: true,
                    readOnly: false,
                    canFinalize: false,
                    reason: nil
                ),
                snapshot: MobileScoringSnapshot(snapshotId: "snapshot-preview-1", revision: 4)
            )
        ),
        meta: MobileScoringMeta(generatedAt: try! MobileTimestamp("2027-01-15T08:02:00.000Z"))
    )

    static func healthObject(
        environment: String = "preview",
        apiVersion: String = "v1",
        authorityOverrides: [String: Any] = [:],
        rootExtras: [String: Any] = [:]
    ) -> [String: Any] {
        var authority: [String: Any] = [
            "mode": "isolated-development",
            "authentication": "preview",
            "identity": "preview",
            "reads": "preview",
            "scoringReads": "preview",
            "scoringWrites": "preview",
            "productionShadow": false,
            "nativeAuth": "email-otp",
            "antiAbuse": "supabase-turnstile",
            "sessionCertification": "signed-proof-v1",
            "authUserCreation": "disabled",
            "requestRateLimit": "edge-ip+server-hash",
        ]
        authorityOverrides.forEach { authority[$0.key] = $0.value }

        var response: [String: Any] = [
            "ok": true,
            "apiVersion": apiVersion,
            "service": "bagger-mobile-api",
            "environment": environment,
            "authority": authority,
        ]
        rootExtras.forEach { response[$0.key] = $0.value }
        return response
    }

    static func jsonData(_ object: Any) throws -> Data {
        try JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
    }

    static func otpResponseData() throws -> Data {
        try jsonData([
            "ok": true,
            "apiVersion": "v1",
            "data": [
                "accepted": true,
                "method": "email",
                "verificationType": "email",
                "challengeId": challengeID,
                "expiresInSeconds": 900,
                "resendAfterSeconds": 60,
                "message": "If the identifier is eligible, a sign-in code will be sent.",
            ],
        ])
    }

    static func certificationResponseData() throws -> Data {
        try jsonData([
            "ok": true,
            "apiVersion": "v1",
            "data": [
                "certified": true,
                "certificationToken": certificationToken,
                "expiresInSeconds": 43_200,
            ],
        ])
    }

    static func participantResponseData(team: Any? = nil, year: Any? = nil) throws -> Data {
        let teamValue: Any = team ?? ["teamId": "team-preview-1", "name": "Preview Team"]
        let yearValue: Any = year ?? 2026
        return try jsonData([
            "ok": true,
            "apiVersion": "v1",
            "data": [
                "player": [
                    "playerId": "player-preview-1",
                    "displayName": "Preview Golfer",
                    "team": teamValue,
                ],
                "tournament": [
                    "tournamentId": "tournament-preview-1",
                    "name": "Preview Invitational",
                    "year": yearValue,
                ],
            ],
        ])
    }
}

enum StubError: Error {
    case planned
}

final class RecordingHTTPTransport: HTTPTransporting, @unchecked Sendable {
    private(set) var requests: [URLRequest] = []
    var statusCode: Int
    var responseData: Data
    var error: (any Error)?

    init(statusCode: Int, responseData: Data) {
        self.statusCode = statusCode
        self.responseData = responseData
    }

    func data(for request: URLRequest) async throws -> HTTPTransportResult {
        requests.append(request)
        if let error { throw error }
        let response = HTTPURLResponse(
            url: request.url!,
            statusCode: statusCode,
            httpVersion: "HTTP/1.1",
            headerFields: ["Content-Type": "application/json"]
        )!
        return HTTPTransportResult(data: responseData, response: response)
    }
}

final class InMemorySecureStore: SecureKeyValueStoring {
    private(set) var values: [String: Data] = [:]
    private(set) var writeCount = 0
    private(set) var deleteCount = 0

    func write(_ data: Data, service: String, account: String) throws {
        writeCount += 1
        values[key(service: service, account: account)] = data
    }

    func read(service: String, account: String) throws -> Data? {
        values[key(service: service, account: account)]
    }

    func delete(service: String, account: String) throws {
        deleteCount += 1
        values.removeValue(forKey: key(service: service, account: account))
    }

    private func key(service: String, account: String) -> String {
        "\(service)|\(account)"
    }
}

final class MockMobileAPI: MobileAPIServing {
    var healthValue = TestFixtures.health
    var healthError: (any Error)?
    var otpValue = TestFixtures.otpAcknowledgement
    var otpError: (any Error)?
    var certificationValue = TestFixtures.certificationAcknowledgement
    var certificationError: (any Error)?
    var participantValue = TestFixtures.participant
    var participantError: (any Error)?
    var todayValue: MobileConditionalRead<MobileTodayResponse> = .modified(TestFixtures.todayResponse, etag: "\"fixture-revision-1\"")
    var matchesValue: MobileConditionalRead<MobileMatchesResponse> = .modified(TestFixtures.matchesResponse, etag: "\"fixture-revision-1\"")
    var leadersValue: MobileConditionalRead<MobileLeadersResponse> = .modified(TestFixtures.leadersResponse, etag: "\"fixture-revision-1\"")
    var scheduleValue: MobileConditionalRead<MobileScheduleResponse> = .modified(TestFixtures.scheduleResponse, etag: "\"fixture-revision-1\"")
    var readError: (any Error)?
    var scoringValue = TestFixtures.scoringResponse
    var scoringError: (any Error)?
    var scoringDelayNanoseconds: UInt64?

    private(set) var healthCallCount = 0
    private(set) var otpCallCount = 0
    private(set) var certificationCallCount = 0
    private(set) var participantCallCount = 0
    private(set) var requestedIdentifier: String?
    private(set) var requestedCaptchaToken: String?
    private(set) var certifiedChallengeID: String?
    private(set) var certifiedAccessToken: String?
    private(set) var sessionAccessToken: String?
    private(set) var sessionCertification: String?
    private(set) var readCallCount = 0
    private(set) var scoringCallCount = 0
    private(set) var scoringMatchID: String?
    private(set) var scoringAccessToken: String?
    private(set) var scoringCertification: String?
    private var suspendNextHealthCall = false
    private var healthSuspended = false
    private var healthContinuation: CheckedContinuation<Void, Never>?

    func health() async throws -> MobileHealthResponse {
        healthCallCount += 1
        if suspendNextHealthCall {
            suspendNextHealthCall = false
            healthSuspended = true
            await withCheckedContinuation { continuation in
                healthContinuation = continuation
            }
            healthSuspended = false
        }
        if let healthError { throw healthError }
        return healthValue
    }

    func suspendNextHealth() {
        suspendNextHealthCall = true
    }

    func hasSuspendedHealth() -> Bool { healthSuspended }

    func resumeSuspendedHealth() {
        healthContinuation?.resume()
        healthContinuation = nil
    }

    func requestOTP(identifier: String, captchaToken: String) async throws -> OTPRequestAcknowledgement {
        otpCallCount += 1
        requestedIdentifier = identifier
        requestedCaptchaToken = captchaToken
        if let otpError { throw otpError }
        return otpValue
    }

    func certify(challengeId: String, accessToken: String) async throws -> OTPCertificationAcknowledgement {
        certificationCallCount += 1
        certifiedChallengeID = challengeId
        certifiedAccessToken = accessToken
        if let certificationError { throw certificationError }
        return certificationValue
    }

    func participantSession(accessToken: String, certification: String) async throws -> ParticipantSession {
        participantCallCount += 1
        sessionAccessToken = accessToken
        sessionCertification = certification
        if let participantError { throw participantError }
        return participantValue
    }

    func today(accessToken: String, certification: String, etag: String?) async throws -> MobileConditionalRead<MobileTodayResponse> {
        readCallCount += 1
        if let readError { throw readError }
        return todayValue
    }

    func matches(accessToken: String, certification: String, etag: String?) async throws -> MobileConditionalRead<MobileMatchesResponse> {
        readCallCount += 1
        if let readError { throw readError }
        return matchesValue
    }

    func leaders(accessToken: String, certification: String, etag: String?) async throws -> MobileConditionalRead<MobileLeadersResponse> {
        readCallCount += 1
        if let readError { throw readError }
        return leadersValue
    }

    func schedule(accessToken: String, certification: String, etag: String?) async throws -> MobileConditionalRead<MobileScheduleResponse> {
        readCallCount += 1
        if let readError { throw readError }
        return scheduleValue
    }

    func scoringCurrent(
        accessToken: String,
        certification: String,
        matchID: String?
    ) async throws -> MobileScoringCurrentResponse {
        scoringCallCount += 1
        scoringMatchID = matchID
        scoringAccessToken = accessToken
        scoringCertification = certification
        if let scoringDelayNanoseconds {
            try await Task.sleep(nanoseconds: scoringDelayNanoseconds)
        }
        if let scoringError { throw scoringError }
        return scoringValue
    }
}

final class MockAuthService: AuthServicing {
    var restoredSessionValue: SupabaseAuthSession?
    var validSessionValue = TestFixtures.authSession
    var validSessionError: (any Error)?
    var verifiedSessionValue = TestFixtures.authSession
    var verificationError: (any Error)?

    private(set) var restoreCallCount = 0
    private(set) var verificationCallCount = 0
    private(set) var signOutCallCount = 0
    private(set) var verifiedEmail: String?
    private(set) var verifiedCode: String?

    func restoredSession() async -> SupabaseAuthSession? {
        restoreCallCount += 1
        return restoredSessionValue
    }

    func validSession() async throws -> SupabaseAuthSession {
        if let validSessionError { throw validSessionError }
        return validSessionValue
    }

    func verifyEmailOTP(email: String, code: String) async throws -> SupabaseAuthSession {
        verificationCallCount += 1
        verifiedEmail = email
        verifiedCode = code
        if let verificationError { throw verificationError }
        return verifiedSessionValue
    }

    func signOut() async {
        signOutCallCount += 1
    }
}

final class SuspendingAuthService: AuthServicing {
    private var verificationContinuation: CheckedContinuation<SupabaseAuthSession, any Error>?
    private(set) var signOutCallCount = 0

    func restoredSession() async -> SupabaseAuthSession? { nil }

    func validSession() async throws -> SupabaseAuthSession {
        TestFixtures.authSession
    }

    func verifyEmailOTP(email: String, code: String) async throws -> SupabaseAuthSession {
        try await withCheckedThrowingContinuation { continuation in
            verificationContinuation = continuation
        }
    }

    func finishVerification(with session: SupabaseAuthSession = TestFixtures.authSession) {
        verificationContinuation?.resume(returning: session)
        verificationContinuation = nil
    }

    func signOut() async {
        signOutCallCount += 1
    }
}

final class MockCertificationStore: BaggerCertificationStoring {
    var credentialValue: StoredBaggerCertification?
    var credentialError: (any Error)?
    var saveError: (any Error)?

    private(set) var saveCallCount = 0
    private(set) var credentialCallCount = 0
    private(set) var deleteCallCount = 0
    private(set) var savedToken: String?
    private(set) var savedUserID: String?
    private(set) var savedExpirySeconds: Int?
    private(set) var requestedUserID: String?

    func save(token: String, userID: String, expiresInSeconds: Int, now: Date) throws {
        saveCallCount += 1
        savedToken = token
        savedUserID = userID
        savedExpirySeconds = expiresInSeconds
        if let saveError { throw saveError }
    }

    func credential(for userID: String, now: Date) throws -> StoredBaggerCertification? {
        credentialCallCount += 1
        requestedUserID = userID
        if let credentialError { throw credentialError }
        return credentialValue
    }

    func delete() throws {
        deleteCallCount += 1
        credentialValue = nil
    }
}

@MainActor
final class MockTournamentDataLifecycle: TournamentDataLifecycle {
    private(set) var activateCallCount = 0
    private(set) var deactivateCallCount = 0
    private(set) var refreshAllCallCount = 0
    private(set) var foregroundRefreshCallCount = 0
    private(set) var suspendCallCount = 0
    private(set) var resumeCallCount = 0
    private(set) var activatedAuthUserID: String?
    private(set) var activatedParticipant: ParticipantSession?
    private(set) var deleteCacheValues: [Bool] = []

    func activate(authUserID: String, participant: ParticipantSession) async {
        activateCallCount += 1
        activatedAuthUserID = authUserID
        activatedParticipant = participant
    }

    func deactivate(deleteCache: Bool) async {
        deactivateCallCount += 1
        deleteCacheValues.append(deleteCache)
    }

    func suspendForEnvironmentReattestation() async {
        suspendCallCount += 1
    }

    func resumeAfterEnvironmentReattestation() async {
        resumeCallCount += 1
    }

    func refreshAll() async {
        refreshAllCallCount += 1
    }

    func refreshForForeground() async {
        foregroundRefreshCallCount += 1
    }
}
