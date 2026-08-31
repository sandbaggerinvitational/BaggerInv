import Foundation
import XCTest
@testable import BaggerInv

final class ParticipantContentModelTests: XCTestCase {
    private let decoder = JSONDecoder()

    func testPassportDecodesExactContractAndBindsPlayerAndTournament() throws {
        let response = try decoder.decode(
            MobilePassportResponse.self,
            from: ParticipantContentFixture.passport()
        )

        XCTAssertTrue(response.isCompatible(
            expectedTournamentID: "tournament-preview-1",
            expectedPlayerID: "player-preview-1"
        ))
        XCTAssertFalse(response.isCompatible(
            expectedTournamentID: "different-tournament",
            expectedPlayerID: "player-preview-1"
        ))
        XCTAssertFalse(response.isCompatible(
            expectedTournamentID: "tournament-preview-1",
            expectedPlayerID: "different-player"
        ))
        XCTAssertEqual(response.data.career.rankings.count, 6)
        XCTAssertEqual(response.data.career.formatPerformance.count, 3)
    }

    func testGuideUsesCanonicalGuideV1AndRequiresNullableMembers() throws {
        let response = try decoder.decode(
            MobileGuideResponse.self,
            from: ParticipantContentFixture.guide(contractVersion: "guide-v1")
        )

        XCTAssertTrue(response.isCompatible(
            expectedTournamentID: "tournament-preview-1",
            expectedPlayerID: "player-preview-1"
        ))
        XCTAssertTrue(response.data.revocableParticipantRepresentationKeys.isEmpty)

        let wrongVersion = try decoder.decode(
            MobileGuideResponse.self,
            from: ParticipantContentFixture.guide(contractVersion: "mobile-guide-v1")
        )
        XCTAssertFalse(wrongVersion.isReadContractCompatible)

        var missingPublishedAt = ParticipantContentFixture.guideData(contractVersion: "guide-v1")
        missingPublishedAt.removeValue(forKey: "publishedAt")
        XCTAssertThrowsError(try decoder.decode(
            MobileGuideResponse.self,
            from: ParticipantContentFixture.response(data: missingPublishedAt)
        ))
    }

    func testHistoryArchiveAndDetailUseRequestScopedContextWithoutActiveTournamentEquality() throws {
        let archive = try decoder.decode(
            MobileHistoryResponse.self,
            from: ParticipantContentFixture.historyArchive()
        )
        XCTAssertTrue(archive.isCompatible(
            expectedTournamentID: "currently-active-tournament",
            expectedPlayerID: "currently-active-player"
        ))
        XCTAssertEqual(archive.data.tournaments.first?.revision, "")
        XCTAssertEqual(archive.data.tournaments.first?.finalScore?.label, "8½ – 7½")

        let detail = try decoder.decode(
            MobileHistoryDetailResponse.self,
            from: ParticipantContentFixture.historyDetail(detailAvailable: false)
        )
        XCTAssertTrue(detail.isCompatible(
            expectedTournamentID: "currently-active-tournament",
            expectedPlayerID: "currently-active-player"
        ))
        XCTAssertEqual(detail.data.tournament.year, 2025)
    }

    func testHistoryRejectsNullableFieldsThatSchemaDeclaresRequiredStrings() throws {
        var archive = ParticipantContentFixture.historyArchiveData()
        var tournaments = try XCTUnwrap(archive["tournaments"] as? [[String: Any]])
        var tournament = tournaments[0]
        var teams = try XCTUnwrap(tournament["teams"] as? [[String: Any]])
        teams[0]["teamId"] = NSNull()
        tournament["teams"] = teams
        tournaments[0] = tournament
        archive["tournaments"] = tournaments

        XCTAssertThrowsError(try decoder.decode(
            MobileHistoryResponse.self,
            from: ParticipantContentFixture.response(data: archive)
        ))
    }

    func testRecordsAndWithdrawnOddsDecodeAsAuthenticatedRequestScopedProducts() throws {
        let records = try decoder.decode(
            MobileRecordsResponse.self,
            from: ParticipantContentFixture.records()
        )
        XCTAssertTrue(records.isCompatible(
            expectedTournamentID: "any-active-tournament",
            expectedPlayerID: "any-active-player"
        ))

        let odds = try decoder.decode(
            MobileOddsResponse.self,
            from: ParticipantContentFixture.withdrawnOdds()
        )
        XCTAssertTrue(odds.isCompatible(
            expectedTournamentID: "any-active-tournament",
            expectedPlayerID: "any-active-player"
        ))
        XCTAssertTrue(odds.data.revocableParticipantRepresentationKeys.isEmpty)
    }

    func testSchemaLengthValidationAcceptsCanonicalUnicodeCharacterCounts() throws {
        var data = ParticipantContentFixture.passportData()
        var player = try XCTUnwrap(data["player"] as? [String: Any])
        player["displayName"] = String(repeating: "é", count: 160)
        data["player"] = player

        let response = try decoder.decode(
            MobilePassportResponse.self,
            from: ParticipantContentFixture.response(data: data)
        )

        XCTAssertTrue(response.isReadContractCompatible)
        XCTAssertEqual(response.data.player.displayName.count, 160)
    }

    func testInvalidButDecodableNestedValuesFailClosedAcrossParticipantProducts() throws {
        var passportData = ParticipantContentFixture.passportData()
        var career = try XCTUnwrap(passportData["career"] as? [String: Any])
        var summary = try XCTUnwrap(career["summary"] as? [String: Any])
        summary["winPercentage"] = 101
        career["summary"] = summary
        passportData["career"] = career
        let passport = try decoder.decode(
            MobilePassportResponse.self,
            from: ParticipantContentFixture.response(data: passportData)
        )
        XCTAssertFalse(passport.isReadContractCompatible)

        let guide = try decoder.decode(
            MobileGuideResponse.self,
            from: ParticipantContentFixture.publishedGuide(overviewBody: "")
        )
        XCTAssertFalse(guide.isReadContractCompatible)

        var historyData = ParticipantContentFixture.historyDetailData(detailAvailable: true)
        historyData["awards"] = [[
            "awardId": "award-1",
            "title": "",
            "recipient": NSNull(),
            "playerId": NSNull(),
        ]]
        let history = try decoder.decode(
            MobileHistoryDetailResponse.self,
            from: ParticipantContentFixture.response(data: historyData)
        )
        XCTAssertFalse(history.isReadContractCompatible)

        let records = try decoder.decode(
            MobileRecordsResponse.self,
            from: ParticipantContentFixture.recordsWithEmptyParticipantName()
        )
        XCTAssertFalse(records.isReadContractCompatible)

        let odds = try decoder.decode(
            MobileOddsResponse.self,
            from: ParticipantContentFixture.publishedOdds(
                expectedRecord: String(repeating: "1", count: 65) + "-0-0"
            )
        )
        XCTAssertFalse(odds.isReadContractCompatible)
    }

    func testGuideDoesNotDependOnDeviceTimeZoneDatabaseForSchemaValidZoneText() throws {
        let response = try decoder.decode(
            MobileGuideResponse.self,
            from: ParticipantContentFixture.publishedGuide(
                overviewBody: "Welcome",
                timeZone: "Future/Preview_Standard-Time"
            )
        )

        XCTAssertTrue(response.isReadContractCompatible)
    }

    @MainActor
    func testSchemaV1StaticEnvelopeWithoutHistoryYearRemainsReadable() async throws {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("BaggerInv-LegacyEnvelopeTests", isDirectory: true)
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }

        let partition = try ReadCachePartition(
            environment: "preview",
            authUserID: TestFixtures.authSession.userID,
            playerID: TestFixtures.participant.player.playerId,
            tournamentID: TestFixtures.participant.tournament.tournamentId
        )
        let store = try DiskReadCacheStore(rootDirectory: root)
        let encodedResponse = try JSONEncoder().encode(TestFixtures.guideResponse)
        let responseObject = try JSONSerialization.jsonObject(with: encodedResponse)
        let milliseconds = TestFixtures.now.timeIntervalSince1970 * 1_000
        let legacyEnvelope = try JSONSerialization.data(withJSONObject: [
            "cacheSchemaVersion": 1,
            "partitionDigest": partition.digest,
            "product": "guide",
            "response": responseObject,
            "etag": "\"guide-revision-1\"",
            "fetchedAt": milliseconds,
            "validatedAt": milliseconds,
        ])
        try await store.write(legacyEnvelope, product: .guide, partition: partition)

        let repository = MobileReadRepository<MobileGuideResponse>(
            product: .guide,
            cache: store,
            credentialProvider: ParticipantContentCredentialProvider(),
            now: { TestFixtures.now }
        ) { _, _ in
            .modified(TestFixtures.guideResponse, etag: "\"guide-revision-1\"")
        }
        await repository.activate(
            ActiveMobileReadContext(
                cachePartition: partition,
                authUserID: TestFixtures.authSession.userID,
                playerID: TestFixtures.participant.player.playerId,
                tournamentID: TestFixtures.participant.tournament.tournamentId
            ),
            beginRefresh: false
        )

        XCTAssertEqual(repository.state.value, TestFixtures.guideResponse.data)
        XCTAssertEqual(repository.state.source, .diskCache)
        XCTAssertEqual(repository.state.freshness, .cached)
    }
}

@MainActor
private final class ParticipantContentCredentialProvider: MobileReadCredentialProviding {
    func credentials(expectedAuthUserID: String) async throws -> MobileReadCredentials {
        MobileReadCredentials(
            authUserID: expectedAuthUserID,
            accessToken: TestFixtures.authSession.accessToken,
            certification: TestFixtures.certificationToken
        )
    }
}

private enum ParticipantContentFixture {
    static func response(data: [String: Any]) throws -> Data {
        try JSONSerialization.data(withJSONObject: [
            "ok": true,
            "apiVersion": "v1",
            "data": data,
            "meta": [
                "generatedAt": "2026-08-30T12:00:00.000Z",
                "revision": NSNull(),
            ],
        ])
    }

    static func passport() throws -> Data {
        try response(data: passportData())
    }

    static func passportData() -> [String: Any] {
        [
            "contractVersion": "mobile-passport-v1",
            "player": [
                "playerId": "player-preview-1",
                "displayName": "Preview Golfer",
                "active": true,
                "careerYears": ["firstYear": 2025, "lastYear": 2026, "current": true],
                "portraitAssetKey": NSNull(),
                "team": NSNull(),
            ],
            "currentTournament": [
                "tournamentId": "tournament-preview-1",
                "name": "Preview Invitational",
                "year": 2026,
                "status": "inProgress",
                "currentRound": NSNull(),
                "tournamentHandicap": NSNull(),
                "team": NSNull(),
                "record": NSNull(),
                "standing": NSNull(),
                "teamStanding": NSNull(),
                "rounds": [],
            ],
            "career": [
                "summary": [
                    "record": record(),
                    "winPercentage": 0,
                    "appearances": 0,
                    "championships": 0,
                    "runnerUpFinishes": 0,
                    "averageHandicap": NSNull(),
                ],
                "honors": [
                    "championshipYears": [],
                    "sandbaggerOfYearYears": [],
                    "pointsChampionYears": [],
                    "boardOfGovernors": false,
                    "handicapCommittee": false,
                ],
                "rankings": [
                    ranking("careerPoints"), ranking("matchWins"), ranking("winPercentage"),
                    ranking("holeDifferential"), ranking("birdies"), ranking("averageGross"),
                ],
                "holePerformance": holePerformance(),
                "matchProgression": matchProgression(),
                "tournamentHistory": [],
                "formatPerformance": [
                    formatPerformance("BB"),
                    formatPerformance("SC"),
                    formatPerformance("SI"),
                ],
                "recordsHeld": [],
                "captainLegacy": ["record": record(), "championships": 0, "seasons": []],
                "biggestRival": NSNull(),
                "draftHistory": [],
                "topPartners": [],
            ],
        ]
    }

    static func guide(contractVersion: String) throws -> Data {
        try response(data: guideData(contractVersion: contractVersion))
    }

    static func guideData(contractVersion: String) -> [String: Any] {
        [
            "contractVersion": contractVersion,
            "tournamentId": "tournament-preview-1",
            "publicationState": "UNPUBLISHED",
            "publishedAt": NSNull(),
            "tournament": NSNull(),
            "overview": [],
            "rules": ["roundFormats": [], "items": []],
            "courses": [],
            "dining": [],
            "localGuide": [],
            "contacts": [],
        ]
    }

    static func publishedGuide(
        overviewBody: String,
        timeZone: String = "America/Chicago"
    ) throws -> Data {
        try response(data: [
            "contractVersion": "guide-v1",
            "tournamentId": "tournament-preview-1",
            "publicationState": "PUBLISHED",
            "publishedAt": "2026-08-30T12:00:00.000Z",
            "tournament": [
                "tournamentId": "tournament-preview-1",
                "year": 2026,
                "name": "Preview Invitational",
                "editionTitle": NSNull(),
                "dates": NSNull(),
                "location": NSNull(),
                "timeZone": timeZone,
                "logoAssetKey": NSNull(),
                "heroAssetKey": NSNull(),
                "mobileHeroAssetKey": NSNull(),
            ],
            "overview": [[
                "sectionId": "overview-1",
                "slug": "welcome",
                "title": NSNull(),
                "body": overviewBody,
                "sortOrder": 0,
            ]],
            "rules": ["roundFormats": [], "items": []],
            "courses": [],
            "dining": [],
            "localGuide": [],
            "contacts": [],
        ])
    }

    static func historyArchive() throws -> Data {
        try response(data: historyArchiveData())
    }

    static func historyArchiveData() -> [String: Any] {
        ["tournaments": [historyTournament(detailAvailable: true)]]
    }

    static func historyDetail(detailAvailable: Bool) throws -> Data {
        try response(data: historyDetailData(detailAvailable: detailAvailable))
    }

    static func historyDetailData(detailAvailable: Bool) -> [String: Any] {
        [
            "tournament": historyTournament(detailAvailable: detailAvailable),
            "teams": [historyTeam(id: "history-team-1", name: "Team One", side: 1),
                      historyTeam(id: "history-team-2", name: "Team Two", side: 2)],
            "rounds": [],
            "matches": [],
            "standings": [],
            "awards": [],
            "scorecards": [],
        ]
    }

    static func records() throws -> Data {
        try response(data: [
            "coverage": [
                "firstCompleteMatchYear": 2017,
                "scorecardHistoryComplete": true,
                "note": "Complete from 2017.",
            ],
            "categories": [],
        ])
    }

    static func recordsWithEmptyParticipantName() throws -> Data {
        try response(data: [
            "coverage": [
                "firstCompleteMatchYear": 2017,
                "scorecardHistoryComplete": true,
                "note": "Complete from 2017.",
            ],
            "categories": [[
                "categoryId": "ALL_TIME",
                "title": "All-Time",
                "order": 0,
                "records": [[
                    "recordId": "record-1",
                    "title": "Most points",
                    "source": "OFFICIAL",
                    "direction": "highest",
                    "unit": NSNull(),
                    "decimals": 0,
                    "signed": false,
                    "aggregate": false,
                    "eligibilityNote": NSNull(),
                    "value": NSNull(),
                    "valueDisplay": NSNull(),
                    "tied": false,
                    "holders": [[
                        "entityType": "PLAYER",
                        "playerIds": ["player-preview-1"],
                        "displayName": "Preview Golfer",
                        "participantNames": [""],
                        "teamId": NSNull(),
                        "teamName": NSNull(),
                        "courseId": NSNull(),
                        "courseName": NSNull(),
                        "holeNumber": NSNull(),
                        "matchId": NSNull(),
                        "year": NSNull(),
                        "roundNumber": NSNull(),
                        "format": NSNull(),
                        "value": NSNull(),
                        "valueDisplay": NSNull(),
                        "secondaryValue": NSNull(),
                    ]],
                ]],
            ]],
        ])
    }

    static func withdrawnOdds() throws -> Data {
        try response(data: [
            "publication": [
                "state": "UNPUBLISHED",
                "revision": 0,
                "publishedAt": NSNull(),
                "currentPhase": NSNull(),
            ],
            "snapshots": [],
        ])
    }

    static func publishedOdds(expectedRecord: String) throws -> Data {
        try response(data: [
            "publication": [
                "state": "PUBLISHED",
                "revision": 1,
                "publishedAt": "2026-08-30T12:00:00.000Z",
                "currentPhase": "Pre-Tournament",
            ],
            "snapshots": [[
                "phase": "Pre-Tournament",
                "phaseOrder": 0,
                "label": "Pre-Tournament",
                "isCurrent": true,
                "publishedAt": "2026-08-30T12:00:00.000Z",
                "iterations": 10_000,
                "totalPointsAvailable": 16,
                "teams": [
                    ["side": 1, "teamId": "team-1", "name": "Team One", "probability": 50,
                     "americanOdds": "+100", "expectedPoints": 8],
                    ["side": 2, "teamId": "team-2", "name": "Team Two", "probability": 50,
                     "americanOdds": "+100", "expectedPoints": 8],
                ],
                "players": [[
                    "rank": 1,
                    "playerId": "player-preview-1",
                    "displayName": "Preview Golfer",
                    "teamSide": 1,
                    "probability": 10,
                    "americanOdds": "+900",
                    "expectedPoints": 2,
                    "expectedRecord": expectedRecord,
                    "averageFinish": 1,
                ]],
            ]],
        ])
    }

    private static func record() -> [String: Any] {
        ["wins": 0, "losses": 0, "halves": 0, "matches": 0,
         "points": NSNull(), "recordedPointMatches": 0]
    }

    private static func ranking(_ metric: String) -> [String: Any] {
        ["metric": metric, "rank": NSNull()]
    }

    private static func formatPerformance(_ format: String) -> [String: Any] {
        [
            "format": format,
            "label": format,
            "scoringLabel": "Score",
            "record": record(),
            "winPercentage": 0,
            "scoringAverage": NSNull(),
            "scoringSample": 0,
            "firstYear": NSNull(),
            "latestYear": NSNull(),
            "matches": [],
        ]
    }

    private static func holePerformance() -> [String: Any] {
        [
            "sample": ["completeScorecards": 0, "scoringHoles": 0, "matchPlayHoles": 0],
            "totalHolesPlayed": 0,
            "holesWon": 0,
            "holesLost": 0,
            "holesHalved": 0,
            "holeDifferential": 0,
            "frontNineHolesWon": 0,
            "backNineHolesWon": 0,
            "closingHolesWon": 0,
            "birdies": 0,
            "eagles": 0,
            "pars": 0,
            "bogeys": 0,
            "doubleBogeysOrWorse": 0,
            "averageGrossScore": NSNull(),
            "averageNetScore": NSNull(),
            "averagePar3Score": NSNull(),
            "averagePar4Score": NSNull(),
            "averagePar5Score": NSNull(),
            "averageFrontNineScore": NSNull(),
            "averageBackNineScore": NSNull(),
            "birdieRate": NSNull(),
            "parRate": NSNull(),
            "bogeyRate": NSNull(),
            "doubleBogeyOrWorseRate": NSNull(),
        ]
    }

    private static func matchProgression() -> [String: Any] {
        let segment = ["won": 0, "lost": 0, "halved": 0]
        return [
            "matches": 0,
            "largestLeadHeld": 0,
            "largestComebackCompleted": 0,
            "matchesWonAfterTrailing": 0,
            "largestLeadBlown": 0,
            "mostLeadChangesExperienced": 0,
            "totalLeadChangesExperienced": 0,
            "mostConsecutiveHolesWon": 0,
            "mostConsecutiveHolesLost": 0,
            "mostClosingHolesWon": 0,
            "totalClosingHolesWon": 0,
            "frontNine": segment,
            "backNine": segment,
            "closing": segment,
        ]
    }

    private static func historyTeamResult(id: String, name: String, side: Int, points: Double) -> [String: Any] {
        ["teamId": id, "name": name, "side": side, "points": points]
    }

    private static func historyTournament(detailAvailable: Bool) -> [String: Any] {
        let teamOne = historyTeamResult(id: "history-team-1", name: "Team One", side: 1, points: 8.5)
        let teamTwo = historyTeamResult(id: "history-team-2", name: "Team Two", side: 2, points: 7.5)
        return [
            "tournamentId": "history-tournament-2025",
            "year": 2025,
            "name": "2025 Preview Invitational",
            "editionTitle": NSNull(),
            "destination": NSNull(),
            "startDate": NSNull(),
            "endDate": NSNull(),
            "status": "final",
            "teams": [teamOne, teamTwo],
            "champion": teamOne,
            "runnerUp": teamTwo,
            "finalScore": ["teamOnePoints": 8.5, "teamTwoPoints": 7.5, "label": "8½ – 7½"],
            "detailAvailable": detailAvailable,
            "revision": "",
        ]
    }

    private static func historyTeam(id: String, name: String, side: Int) -> [String: Any] {
        [
            "teamId": id,
            "name": name,
            "side": side,
            "points": NSNull(),
            "captain": NSNull(),
            "averageHandicap": NSNull(),
            "roster": [],
        ]
    }
}
