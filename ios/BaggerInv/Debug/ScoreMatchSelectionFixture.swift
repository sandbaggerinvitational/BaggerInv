#if DEBUG
import SwiftUI

/// Explicit deterministic fixture only. No MobileAPIClient, live credential
/// provider, auth owner, SQLite repository, replay worker or mutation sender.
@MainActor
final class ScoreMatchSelectionFixtureAPI: MobileAPIServing {
    static let bb = "fixture-score-bb"
    static let sc = "fixture-score-sc"
    static let si = "fixture-score-si"
    var responses: [String: MobileScoringCurrentResponse]
    var listed: [MobileMatchesMatch]
    var readError: (any Error)?
    var scoringErrors: [String: any Error] = [:]
    var scoringDelay: UInt64 = 0
    var onScoringRead: ((String) -> Void)?
    var tournamentID = "fixture-score-tournament"
    var returnNotModified = false
    private(set) var scoringIDs: [String] = []
    private(set) var etags: [String?] = []
    static let authID = "fixture-score-auth"
    var playerID: String { responses[Self.bb]!.data.scoring!.player.playerId }

    init(includeFinalizationReview: Bool = false) {
        var values: [String: MobileScoringCurrentResponse] = [:]
        for (id, scenario, round, final) in [
            (Self.bb, TodayUITestScenario.scoreActiveBestBall, 1, false),
            (Self.sc, .scoreActiveScramble, 2, false),
            (Self.si, .scoreActiveSingles, 3, true)
        ] {
            let state = ScoringUITestFixtures.state(for: scenario)
            let base = includeFinalizationReview && id == Self.sc
                ? ScoringUITestFixtures.finalizationReview(format: .scramble) : state.scoring!
            let value = MobileScoringCurrent(
                match: .init(matchId: id, roundNumber: round, format: base.match.format,
                             status: final ? .completed : .inProgress, matchRevision: base.match.matchRevision,
                             permissionRevision: base.match.permissionRevision, result: final ? .halved : nil),
                player: base.player, sides: base.sides, course: base.course, scores: base.scores,
                progress: base.progress,
                permission: .init(canScore: !final, readOnly: final, canFinalize: base.permission.canFinalize, reason: final ? .matchFinalized : nil),
                snapshot: base.snapshot)
            values[id] = .init(ok: true, apiVersion: "v1", data: .init(scoring: value), meta: .init(generatedAt: state.generatedAt!))
        }
        responses = values
        listed = [Self.bb, Self.sc, Self.si].map { Self.listing(values[$0]!.data.scoring!) }
    }

    static func listing(_ value: MobileScoringCurrent) -> MobileMatchesMatch {
        let teams: [MobileMatchesTeam] = value.sides.map { side in
            let players: [MobileMatchesParticipant] = side.participants.map { player in
                .init(playerId: player.playerId, displayName: player.displayName, teamSide: side.side,
                      isAuthenticatedPlayer: player.isAuthenticatedPlayer, playingHandicap: player.playingHandicap,
                      strokesReceived: value.match.format == .scramble ? nil : player.strokes.flatMap { Int(exactly: $0) })
            }
            return .init(side: side.side, teamId: side.teamId!, name: side.name,
                         playingHandicap: value.match.format == .scramble ? (side.side == 1 ? 3.0 : 1.0) : nil,
                         strokesReceived: value.match.format == .scramble ? (side.side == 1 ? 2 : 0) : nil,
                         participants: players)
        }
        return .init(matchId: value.match.matchId, displayMatchNumber: "4 of 6",
              round: .init(roundNumber: value.match.roundNumber, name: "Round", format: value.match.format.rawValue),
              status: value.match.status, course: nil,
              teeTime: .init(localTime: try! MobileLocalTime("09:30:00"), label: "9:30 AM", timeZone: "America/Chicago"),
              teams: teams,
              authenticatedPlayer: .init(involved: true, teamSide: value.player.teamSide,
                                         partnerPlayerIds: [], opponentPlayerIds: []),
              progress: value.match.status == .inProgress ? .init(currentHole: value.progress.currentHole) : nil,
              result: value.match.status == .completed ? .init(summary: "Halved", winner: nil, teamOnePoints: nil, teamTwoPoints: nil) : nil)
    }

    func matches(accessToken: String, certification: String, etag: String?) async throws -> MobileConditionalRead<MobileMatchesResponse> {
        etags.append(etag)
        if let readError { throw readError }
        if returnNotModified { return .notModified(etag: nil) }
        return .modified(.init(ok: true, apiVersion: "v1", data: .init(
            tournament: .init(tournamentId: tournamentID, name: "Score Review Fixture", year: 2026,
                              status: "Live", currentRound: 2, timeZone: "America/Chicago"), matches: listed),
            meta: .init(generatedAt: responses[Self.bb]!.meta.generatedAt, revision: nil)), etag: nil)
    }

    func scoringCurrent(accessToken: String, certification: String, matchID: String?) async throws -> MobileScoringCurrentResponse {
        let id = matchID ?? Self.bb
        scoringIDs.append(id); onScoringRead?(id)
        if scoringDelay > 0 { try await Task.sleep(nanoseconds: scoringDelay) }
        if let error = scoringErrors[id] { throw error }
        guard let response = responses[id] else { throw MobileAPIClientError.server(code: .scoringNotAuthorized, status: 403) }
        return response
    }

    func health() async throws -> MobileHealthResponse { throw ScoreMatchSelectionError.unavailable }
    func requestOTP(identifier: String, captchaToken: String) async throws -> OTPRequestAcknowledgement { throw ScoreMatchSelectionError.unavailable }
    func certify(challengeId: String, accessToken: String) async throws -> OTPCertificationAcknowledgement { throw ScoreMatchSelectionError.unavailable }
    func participantSession(accessToken: String, certification: String) async throws -> ParticipantSession { throw ScoreMatchSelectionError.unavailable }
    func today(accessToken: String, certification: String, etag: String?) async throws -> MobileConditionalRead<MobileTodayResponse> { throw ScoreMatchSelectionError.unavailable }
    func leaders(accessToken: String, certification: String, etag: String?) async throws -> MobileConditionalRead<MobileLeadersResponse> { throw ScoreMatchSelectionError.unavailable }
    func schedule(accessToken: String, certification: String, etag: String?) async throws -> MobileConditionalRead<MobileScheduleResponse> { throw ScoreMatchSelectionError.unavailable }
}

@MainActor final class ScoreMatchSelectionFixtureCredentials: MobileReadCredentialProviding {
    var authID = ScoreMatchSelectionFixtureAPI.authID
    var error: (any Error)?
    func credentials(expectedAuthUserID: String) async throws -> MobileReadCredentials {
        if let error { throw error }
        return .init(authUserID: authID, accessToken: "fixture-only", certification: "fixture-only")
    }
}

@MainActor final class ScoreMatchSelectionFixtureModel: ObservableObject {
    @Published var state: ScoringCurrentState
    let api = ScoreMatchSelectionFixtureAPI(includeFinalizationReview: ProcessInfo.processInfo.arguments.contains("--bagger-ui-test-score-picker-two-states"))
    let selection: ScoreMatchSelectionStore
    init() {
        selection = ScoreMatchSelectionStore(api: api, credentials: ScoreMatchSelectionFixtureCredentials(), activity: NativeApplicationActivity(isActive: true))
        selection.activate(identity: .init(authUserId: ScoreMatchSelectionFixtureAPI.authID, playerId: api.playerID, tournamentId: api.tournamentID))
        let response = api.responses[ScoreMatchSelectionFixtureAPI.bb]!
        state = .init(scoring: response.data.scoring, generatedAt: response.meta.generatedAt, phase: .ready,
                      isRefreshing: false, lastSafeError: nil, lastServerCode: nil, lastHTTPStatus: nil)
        if ProcessInfo.processInfo.arguments.contains("--bagger-ui-test-picker-revoked") {
            api.onScoringRead = { [weak api] id in
                guard let api, id == ScoreMatchSelectionFixtureAPI.sc,
                      api.scoringIDs.filter({ $0 == id }).count > 1 else { return }
                api.scoringErrors[id] = MobileAPIClientError.server(code: .scoringNotAuthorized, status: 403)
            }
        }
    }

    func select(_ id: String) async throws {
        try await selection.verifySelection(matchID: id)
        // Exercise the same intermediate empty/loading presentation as the
        // production ScoringCurrentStore's explicit Match refresh.
        state.scoring = nil; state.phase = .loading
        await Task.yield()
        let response = try await api.scoringCurrent(accessToken: "fixture-only", certification: "fixture-only", matchID: id)
        guard selection.canCommitSelection(matchID: id) else { throw ScoreMatchSelectionError.unavailable }
        state.scoring = response.data.scoring; state.generatedAt = response.meta.generatedAt; state.phase = .ready
        selection.invalidate()
    }
}

struct ScoreMatchSelectionFixtureView: View {
    @StateObject private var model = ScoreMatchSelectionFixtureModel()
    var body: some View {
        ScoreScreen(presentation: ScoringPresenter.make(state: model.state), matchSelection: model.selection,
                    onSelectMatch: { try await model.select($0) }, onRefresh: {})
            .id(model.state.scoring.map { Data($0.match.matchId.utf8) })
            .environment(\.scoreMatchDisplay, model.api.listed.first(where: {
                $0.matchId == model.state.scoring?.match.matchId
            }).map { ScoreMatchDisplayContext(match: $0, isCached: false) })
            .safeAreaInset(edge: .top) {
                Text("Deterministic Score fixture · No live scoring")
                    .font(.caption2.weight(.semibold)).padding(5)
                    .frame(maxWidth: .infinity).background(BaggerPalette.scoreGold)
            }
    }
}
#endif
