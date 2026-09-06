import Foundation

/// Read-only Scorecard identity. No local intent or golf arithmetic enters this header.
struct ScorecardIdentityHeaderPresentation: Equatable {
    let roundAndFormat: String
    let matchNumberText: String?
    let courseID: String?
    let courseName: String?
    let courseAndTeeText: String?
    let sides: [ScoringSidePresentation]
    let resultText: String?

    init(score: ScoringPresentation, context: ScoreMatchDisplayContext?) {
        roundAndFormat = [score.roundText, score.format?.title].compactMap { $0 }.joined(separator: " · ")
        if let matchID = score.matchID, let context,
           MobileOpaqueMatchID.isEqual(matchID, context.match.matchId),
           let number = context.match.displayMatchNumber {
            matchNumberText = "Match \(number)"
        } else { matchNumberText = nil }
        courseID = score.courseID
        courseName = score.courseName
        courseAndTeeText = score.courseAndTeeText
        sides = score.sides
        if let status = score.statusText {
            resultText = Self.namedStatus(status, result: score.result, sides: score.sides)
        } else if let result = score.result {
            resultText = result == .halved ? "Result: Halved" : "Winner: \(result.title(sides: score.sides))"
        } else { resultText = nil }
    }

    func playerNames(for side: ScoringSidePresentation) -> String {
        side.participants.map(\.displayName).joined(separator: " · ")
    }

    private static func namedStatus(_ status: String, result: ScoringWinnerPresentation?,
                                    sides: [ScoringSidePresentation]) -> String {
        // The canonical result selects the identity, never the status text or scores.
        // Replace only its exact leading placeholder; preserve the supplied golf copy.
        guard case let .side(number) = result, (1...2).contains(number) else { return status }
        let matchingSides = sides.filter { $0.side == number }
        guard matchingSides.count == 1, let side = matchingSides.first,
              side.name.contains(where: { !$0.isWhitespace }) else { return status }
        let prefix = "Team \(number) "
        guard status.hasPrefix(prefix) else { return status }
        return side.name + " " + status.dropFirst(prefix.count)
    }
}
