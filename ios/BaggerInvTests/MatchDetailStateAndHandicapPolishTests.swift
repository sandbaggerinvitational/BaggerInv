import Combine
import Foundation
import XCTest
@testable import BaggerInv

@MainActor
final class MatchDetailStateAndHandicapPolishTests: XCTestCase {
    func testColdRepositorySuccessNeverPublishesFalseUnavailableDuringCacheLookupOrFetch() async throws {
        let response = MatchDetailFixtureFactory.response(format: .bestBall, status: .scheduled)
        let cacheRoot = temporaryCacheRoot()
        defer { try? FileManager.default.removeItem(at: cacheRoot) }
        let cache = try DiskReadCacheStore(rootDirectory: cacheRoot)
        let repository = try makeRepository(response: response, cache: cache) { _, _ in
            await Task.yield()
            return .modified(response, etag: "\"polish-first-read\"")
        }
        var snapshots: [MobileReadState<MobileMatchDetailData>] = []
        let observation = repository.$state.sink { snapshots.append($0) }
        defer { observation.cancel() }

        await repository.activate(try context(), beginRefresh: false)
        XCTAssertNil(repository.state.value, "The cold cache must not supply a representation.")
        XCTAssertEqual(present(repository.state, response: response).availability, .loading)
        await repository.refresh()

        XCTAssertTrue(snapshots.contains { $0.value == nil && $0.freshness == .empty })
        XCTAssertTrue(snapshots.contains { $0.value == nil && $0.freshness == .refreshing })
        XCTAssertTrue(snapshots.contains { $0.value == nil && $0.isRefreshing })
        for snapshot in snapshots {
            let presentation = present(snapshot, response: response)
            XCTAssertEqual(
                presentation.availability,
                snapshot.value == nil ? .loading : .content,
                "A normal successful first read must never assert absence."
            )
        }
        XCTAssertEqual(repository.state.freshness, .fresh)
        XCTAssertEqual(present(repository.state, response: response).match?.matchID, response.data.match.matchId)
    }

    func testRepositoryDiskCacheReloadRemainsContentThroughConditionalRefresh() async throws {
        let response = MatchDetailFixtureFactory.response(format: .singles, status: .scheduled)
        let cacheRoot = temporaryCacheRoot()
        defer { try? FileManager.default.removeItem(at: cacheRoot) }
        let cache = try DiskReadCacheStore(rootDirectory: cacheRoot)
        let first = try makeRepository(response: response, cache: cache) { _, _ in
            .modified(response, etag: "\"polish-cached-read\"")
        }
        await first.activate(try context(), beginRefresh: false)
        await first.refresh()
        await first.deactivate(deleteCache: false)

        let restored = try makeRepository(response: response, cache: cache) { _, etag in
            XCTAssertEqual(etag, "\"polish-cached-read\"")
            return .notModified(etag: etag)
        }
        var snapshots: [MobileReadState<MobileMatchDetailData>] = []
        let observation = restored.$state.sink { snapshots.append($0) }
        defer { observation.cancel() }

        await restored.activate(try context(), beginRefresh: false)
        XCTAssertEqual(restored.state.source, .diskCache)
        XCTAssertEqual(restored.state.freshness, .cached)
        XCTAssertEqual(present(restored.state, response: response).availability, .content)
        XCTAssertEqual(present(restored.state, response: response).freshnessBanner?.kind, .cached)
        await restored.refresh()

        for snapshot in snapshots {
            XCTAssertEqual(
                present(snapshot, response: response).availability,
                snapshot.value == nil ? .loading : .content
            )
        }
        XCTAssertEqual(restored.state.lastHTTPStatus, 304)
        XCTAssertEqual(restored.state.freshness, .fresh)
    }

    func testAllInitialNoValueResolvingStatesRemainLoading() {
        let response = MatchDetailFixtureFactory.response()
        for freshness in [MobileReadFreshness.empty, .cached, .refreshing] {
            for isRefreshing in [false, true] {
                var state = MobileReadState<MobileMatchDetailData>.empty
                state.freshness = freshness
                state.isRefreshing = isRefreshing
                let presentation = present(state, response: response)
                XCTAssertEqual(presentation.availability, .loading)
                XCTAssertNil(presentation.match)
                XCTAssertNil(presentation.tournament)
            }
        }

        // @Published exposes isRefreshing before freshness changes on a retry.
        var startingRetry = MobileReadState<MobileMatchDetailData>.empty
        startingRetry.freshness = .failed
        startingRetry.isRefreshing = true
        startingRetry.lastSafeError = .transport
        XCTAssertEqual(present(startingRetry, response: response).availability, .loading)
    }

    func testActual404AlwaysRevokesPresentationIncludingRetainedValueAndRetry() {
        let response = MatchDetailFixtureFactory.response(format: .bestBall, status: .inProgress, holesPlayed: 7)
        for freshness in [MobileReadFreshness.empty, .cached, .refreshing, .fresh, .stale, .offline, .failed] {
            for retainsValue in [false, true] {
                for isRefreshing in [false, true] {
                    var state = populatedState(response)
                    if !retainsValue { state.value = nil }
                    state.freshness = freshness
                    state.isRefreshing = isRefreshing
                    state.lastHTTPStatus = 404
                    state.lastServerCode = .matchNotFound
                    let presentation = present(state, response: response)
                    XCTAssertEqual(presentation.availability, .unavailable)
                    XCTAssertNil(presentation.match)
                    XCTAssertNil(presentation.tournament)
                    XCTAssertNil(presentation.freshnessBanner)
                }
            }
        }
    }

    func testNoCacheTransientFailureIsLoadErrorNotAnAuthoritativeUnavailable() {
        let response = MatchDetailFixtureFactory.response()
        let failures: [(MobileReadFailure, Int?)] = [
            (.transport, nil), (.unavailable, 503), (.rateLimited, 429),
            (.contract, 200), (.cacheInconsistency, nil),
        ]
        for (failure, status) in failures {
            var state = MobileReadState<MobileMatchDetailData>.empty
            state.freshness = .failed
            state.lastSafeError = failure
            state.lastHTTPStatus = status
            // Only status404 is authoritative, never a misleading server code.
            state.lastServerCode = .matchNotFound
            let presentation = present(state, response: response)
            XCTAssertEqual(presentation.availability, .loadError)
            XCTAssertNil(presentation.match)
            XCTAssertNil(presentation.tournament)
            XCTAssertNil(presentation.freshnessBanner)
        }
    }

    func testEligibleTransientCachedContentRetainsOfflineAndStaleSemantics() {
        let response = MatchDetailFixtureFactory.response(format: .bestBall, status: .inProgress, holesPlayed: 7)
        let cases: [(MobileReadFreshness, MobileReadFailure, Int?, MatchDetailFreshnessBannerKind)] = [
            (.offline, .transport, nil, .offline),
            (.stale, .unavailable, 503, .stale),
            (.stale, .rateLimited, 429, .stale),
        ]
        for (freshness, failure, status, banner) in cases {
            var state = populatedState(response)
            state.source = .diskCache
            state.freshness = freshness
            state.lastSafeError = failure
            state.lastHTTPStatus = status
            let presentation = present(state, response: response)
            XCTAssertEqual(presentation.availability, .content)
            XCTAssertEqual(presentation.match?.matchID, response.data.match.matchId)
            XCTAssertEqual(presentation.freshnessBanner?.kind, banner)
        }
    }

    func testIdentityAndAuthorizationFailuresRemainFailClosedWithoutClaiming404() {
        let response = MatchDetailFixtureFactory.response(matchID: "match:caf\u{00E9}")
        for failure in [MobileReadFailure.authentication, .authorization] {
            var state = populatedState(response)
            state.lastSafeError = failure
            state.lastHTTPStatus = failure == .authentication ? 401 : 403
            let presentation = present(state, response: response)
            XCTAssertEqual(presentation.availability, .loadError)
            XCTAssertNil(presentation.match)
            XCTAssertNil(presentation.tournament)
        }
        let mismatch = MatchDetailPresenter.make(
            state: populatedState(response),
            requestedMatchID: "match:cafe\u{0301}",
            now: TestFixtures.now
        )
        XCTAssertEqual(mismatch.availability, .loadError)
        XCTAssertNil(mismatch.match)
        XCTAssertNil(mismatch.tournament)
    }

    func testSharedHandicapFormatterMatchesApprovedVisualExamples() {
        let cases: [(Double, Int, String)] = [
            (13.3, 13, "HCP 13.3 · +13 strokes"),
            (9.1, 9, "HCP 9.1 · +9 strokes"),
            (-0.8, 0, "HCP (0.8) · No strokes"),
            (0.6, 1, "HCP 0.6 · +1 stroke"),
        ]
        for (handicap, strokes, expected) in cases {
            let context = MatchesGolfContextPresentation(
                scope: .participant,
                playingHandicap: handicap,
                strokesReceived: strokes
            )
            XCTAssertEqual(context.compactText, expected)
            XCTAssertEqual(context.playingHandicap, handicap)
            XCTAssertEqual(context.strokesReceived, strokes)
        }
    }

    func testSharedHandicapFormatterDisplaysOneDecimalWithoutChangingCanonicalPrecision() {
        let cases: [(Double, String)] = [
            (4.25, "4.3"), (3.25, "3.3"), (12.34567, "12.3"),
            (-0.875, "(0.9)"), (11, "11.0"), (12, "12.0"), (0, "0.0"),
        ]
        for (canonical, expected) in cases {
            XCTAssertEqual(MatchGolfDisplayFormatter.playingHandicap(canonical), expected)
            let context = MatchesGolfContextPresentation(
                scope: .participant, playingHandicap: canonical, strokesReceived: nil
            )
            XCTAssertEqual(context.playingHandicap, canonical)
            XCTAssertEqual(context.compactText, "HCP \(expected)")
        }
    }

    func testHandicapNeverDerivesMissingOrDifferentCanonicalStrokeValues() {
        let handicapOnly = MatchesGolfContextPresentation(
            scope: .participant, playingHandicap: 13.3, strokesReceived: nil
        )
        let strokesOnly = MatchesGolfContextPresentation(
            scope: .participant, playingHandicap: nil, strokesReceived: 2
        )
        let distinctValues = MatchesGolfContextPresentation(
            scope: .participant, playingHandicap: 13.3, strokesReceived: 2
        )
        let absent = MatchesGolfContextPresentation(
            scope: .participant, playingHandicap: nil, strokesReceived: nil
        )
        XCTAssertEqual(handicapOnly.compactText, "HCP 13.3")
        XCTAssertEqual(strokesOnly.compactText, "+2 strokes")
        XCTAssertEqual(distinctValues.compactText, "HCP 13.3 · +2 strokes")
        XCTAssertNil(absent.compactText)
        XCTAssertNil(absent.accessibilityText)
    }

    func testHandicapAccessibilityUsesOneDecimalAndRetainsTeamStrokeScope() {
        let participant = MatchesGolfContextPresentation(
            scope: .participant, playingHandicap: -0.8, strokesReceived: 0
        )
        let team = MatchesGolfContextPresentation(
            scope: .team, playingHandicap: 3.25, strokesReceived: 2
        )
        XCTAssertEqual(participant.accessibilityText, "Playing Handicap (0.8), No strokes")
        XCTAssertEqual(team.compactText, "Team HCP 3.3 · +2 strokes")
        XCTAssertEqual(team.accessibilityText, "Team Playing Handicap 3.3, 2 team strokes")
        XCTAssertEqual(team.playingHandicap, 3.25)
        XCTAssertEqual(
            MatchesGolfContextPresentation(scope: .team, playingHandicap: 3, strokesReceived: 0).accessibilityText,
            "Team Playing Handicap 3.0, No team strokes"
        )
    }

    func testMatchesIndexAndGameCenterUseIdenticalCanonicalHandicapPresentation() throws {
        for format in [MobileScoringFormat.bestBall, .scramble, .singles] {
            let response = MatchDetailFixtureFactory.response(format: format, status: .scheduled)
            let detail = try XCTUnwrap(present(populatedState(response), response: response).match)
            let match = response.data.match
            let indexMatch = MobileMatchesMatch(
                matchId: match.matchId,
                displayMatchNumber: match.displayMatchNumber,
                round: MobileMatchRound(
                    roundNumber: match.round.roundNumber, name: match.round.name, format: format.rawValue
                ),
                status: .scheduled,
                course: nil,
                teeTime: nil,
                teams: match.teams.map { team in
                    MobileMatchesTeam(
                        side: team.side, teamId: team.teamId, name: team.name,
                        playingHandicap: team.playingHandicap, strokesReceived: team.strokesReceived,
                        participants: team.participants.map { player in
                            MobileMatchesParticipant(
                                playerId: player.playerId, displayName: player.displayName,
                                teamSide: player.teamSide, isAuthenticatedPlayer: player.isAuthenticatedPlayer,
                                playingHandicap: player.playingHandicap, strokesReceived: player.strokesReceived
                            )
                        }
                    )
                },
                authenticatedPlayer: MobileAuthenticatedPlayerRelationship(
                    involved: match.authenticatedPlayer.involved,
                    teamSide: match.authenticatedPlayer.teamSide,
                    partnerPlayerIds: match.authenticatedPlayer.partnerPlayerIds,
                    opponentPlayerIds: match.authenticatedPlayer.opponentPlayerIds
                ),
                progress: nil,
                result: nil
            )
            var indexState = MobileReadState<MobileMatchesData>.empty
            indexState.value = MobileMatchesData(tournament: TestFixtures.readTournament, matches: [indexMatch])
            indexState.freshness = .fresh
            let index = try XCTUnwrap(MatchesPresenter.make(state: indexState).match(withID: match.matchId))
            for (indexTeam, detailTeam) in zip(index.teams, detail.teams) {
                XCTAssertEqual(indexTeam.golfContext?.compactText, detailTeam.golfContext?.compactText)
                XCTAssertEqual(indexTeam.golfContext?.accessibilityText, detailTeam.golfContext?.accessibilityText)
                if format != .scramble {
                    for (indexPlayer, detailPlayer) in zip(indexTeam.participants, detailTeam.players) {
                        XCTAssertEqual(indexPlayer.golfContext?.compactText, detailPlayer.golfContext?.compactText)
                        XCTAssertEqual(indexPlayer.golfContext?.accessibilityText, detailPlayer.golfContext?.accessibilityText)
                    }
                }
            }
        }
    }

    private func present(
        _ state: MobileReadState<MobileMatchDetailData>,
        response: MobileMatchDetailResponse
    ) -> MatchDetailPresentation {
        MatchDetailPresenter.make(
            state: state, requestedMatchID: response.data.match.matchId, now: TestFixtures.now
        )
    }

    private func populatedState(_ response: MobileMatchDetailResponse) -> MobileReadState<MobileMatchDetailData> {
        var state = MobileReadState<MobileMatchDetailData>.empty
        state.value = response.data
        state.source = .network
        state.freshness = .fresh
        state.lastHTTPStatus = 200
        return state
    }

    private func temporaryCacheRoot() -> URL {
        FileManager.default.temporaryDirectory
            .appendingPathComponent("MatchDetailStatePolish-\(UUID().uuidString)", isDirectory: true)
    }

    private func context() throws -> ActiveMobileReadContext {
        let authUserID = "polish-fixture-auth-user"
        return ActiveMobileReadContext(
            cachePartition: try ReadCachePartition(
                environment: "preview", authUserID: authUserID,
                playerID: MatchDetailFixtureFactory.playerOneID,
                tournamentID: MatchDetailFixtureFactory.tournamentID
            ),
            authUserID: authUserID,
            playerID: MatchDetailFixtureFactory.playerOneID,
            tournamentID: MatchDetailFixtureFactory.tournamentID
        )
    }

    private func makeRepository(
        response: MobileMatchDetailResponse,
        cache: DiskReadCacheStore,
        fetcher: @escaping MobileReadRepository<MobileMatchDetailResponse>.Fetcher
    ) throws -> MobileReadRepository<MobileMatchDetailResponse> {
        let matchID = response.data.match.matchId
        return MobileReadRepository(
            cacheKey: try MobileReadCacheKey(matchID: matchID),
            cache: cache,
            credentialProvider: MatchDetailPolishCredentials(),
            now: { TestFixtures.now },
            responseValidator: { candidate, context in
                candidate.isCompatible(
                    expectedTournamentID: context.tournamentID, expectedPlayerID: context.playerID
                ) && candidate.data.match.isCompatible(
                    expectedMatchId: matchID, expectedPlayerId: context.playerID
                )
            },
            fetcher: fetcher
        )
    }
}

@MainActor
private final class MatchDetailPolishCredentials: MobileReadCredentialProviding {
    func credentials(expectedAuthUserID: String) async throws -> MobileReadCredentials {
        MobileReadCredentials(
            authUserID: expectedAuthUserID,
            accessToken: "inert-polish-test-token",
            certification: "inert-polish-test-certification"
        )
    }
}
