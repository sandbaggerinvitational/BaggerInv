import Foundation

struct Fixture: Decodable {
    let nativeResponses: [Row]
    struct Row: Decodable {
        let format: String
        let request: MobileScoringHoleRequest
        let accepted: MobileScoringHoleResponse
        let replay: MobileScoringHoleResponse
        let conflict: MobileErrorResponse
        let timeout: MobileErrorResponse
    }
}
struct Check: Encodable {
    let id: String
    let format: String
    let result: String
}
func run() throws {
let input = URL(fileURLWithPath: CommandLine.arguments[1])
let bytes = try Data(contentsOf: input)
let fixture = try JSONDecoder().decode(Fixture.self, from: bytes)
precondition(Set(fixture.nativeResponses.map(\.format)) == Set(["BB", "SC", "SI"]))
var checks: [Check] = []
func verify(_ value: Bool, _ id: String, _ format: String) {
    checks.append(Check(id: id, format: format, result: value ? "PASS" : "FAIL"))
    precondition(value, "Failed \(id) \(format)")
}
for row in fixture.nativeResponses {
    verify(row.request.isContractCompatible, "REQUEST", row.format)
    verify(row.accepted.isContractCompatible(for: row.request), "ACCEPTED", row.format)
    verify(row.replay.isContractCompatible(for: row.request) && row.replay.data.idempotent, "REPLAY", row.format)
    verify(!row.conflict.ok && row.conflict.apiVersion == "v1" && row.conflict.error.code == .idempotencyConflict
        && row.conflict.data?.matchId == row.request.matchId && row.conflict.data?.refreshRequired == true,
        "CONFLICT_ERROR", row.format)
    verify(!row.timeout.ok && row.timeout.apiVersion == "v1" && row.timeout.error.code == .internalError,
        "SQL_TIMEOUT_ERROR", row.format)
    let wrongId = MobileScoringHoleRequest(matchId: row.request.matchId,
        holeNumber: row.request.holeNumber, teamOneGrossScores: row.request.teamOneGrossScores,
        teamTwoGrossScores: row.request.teamTwoGrossScores, mutationId: "different-mutation",
        expectedMatchRevision: row.request.expectedMatchRevision, expectedHoleRevision: row.request.expectedHoleRevision)
    verify(!row.accepted.isContractCompatible(for: wrongId), "WRONG_MUTATION_DENIED", row.format)
    let wrongGross = MobileScoringHoleRequest(matchId: row.request.matchId,
        holeNumber: row.request.holeNumber, teamOneGrossScores: row.request.teamOneGrossScores.map { $0 + 1 },
        teamTwoGrossScores: row.request.teamTwoGrossScores, mutationId: row.request.mutationId,
        expectedMatchRevision: row.request.expectedMatchRevision, expectedHoleRevision: row.request.expectedHoleRevision)
    verify(!row.accepted.isContractCompatible(for: wrongGross), "WRONG_GROSS_DENIED", row.format)
    var broken = try JSONSerialization.jsonObject(with: JSONEncoder().encode(row.accepted)) as! [String: Any]
    var data = broken["data"] as! [String: Any]
    data.removeValue(forKey: "accepted"); broken["data"] = data
    let invalid = try JSONSerialization.data(withJSONObject: broken)
    verify((try? JSONDecoder().decode(MobileScoringHoleResponse.self, from: invalid)) == nil,
        "MISSING_REQUIRED_ACK_DENIED", row.format)
}
let encoder = JSONEncoder(); encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
print(String(data: try encoder.encode(checks), encoding: .utf8)!)

}
do { try run() } catch {
    FileHandle.standardError.write(Data("Decoder error: \(error)\n".utf8))
    exit(2)
}
