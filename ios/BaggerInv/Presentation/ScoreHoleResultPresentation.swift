import Foundation

/// Copy from canonical read facts only. A winner is never inferred from Net.
struct ScoreHoleResultPresentation: Equatable {
    let resultText: String
    let netText: String?
    let authorityText: String?

    init(official: ScoringOfficialHolePresentation?, sides: [ScoringSidePresentation]) {
        switch official?.winner {
        case .side(let number):
            resultText = sides.first(where: { $0.side == number }).map { "Winner: \($0.name)" }
                ?? "Result: Unavailable"
        case .halved: resultText = "Result: Halved"
        case nil: resultText = "Result: Unavailable"
        }
        let values = official?.sides.compactMap { value -> String? in
            guard let net = value.net, let side = sides.first(where: { $0.side == value.side }) else { return nil }
            return "\(side.name) Net \(ScoringNumberFormatter.string(net))"
        } ?? []
        netText = values.isEmpty ? nil : values.joined(separator: " · ")
        authorityText = official == nil ? nil : "Official"
    }
}

enum ScoreCorrectionCopy {
    static func title(holeNumber: Int) -> String { "CORRECTING HOLE \(holeNumber)" }

    static func message(hasOfficialScores: Bool) -> String {
        hasOfficialScores
            ? "Official scores stay unchanged until saved and confirmed."
            : "Saved on iPhone · Not Official until confirmed."
    }
}
