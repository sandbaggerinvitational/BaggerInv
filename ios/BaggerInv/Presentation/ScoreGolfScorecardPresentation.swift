import Foundation

/// Adapts existing Score read facts to the approved printed-scorecard rows.
/// Pending intent is intentionally not inserted into these Official cells.
enum ScoreGolfScorecardPresentation {
    static func make(_ presentation: ScoringPresentation) -> [MatchGolfScorecardNine] {
        guard presentation.format?.isSupported == true else { return [] }
        return [("front", "Front Nine", 1...9), ("back", "Back Nine", 10...18)].map { id, title, range in
            let holes = presentation.reviewHoles.filter { range.contains($0.holeNumber) }
            var rows = [
                MatchGolfScorecardRow(id: "holes", label: "Hole", kind: .holes, cells: holes.map {
                    cell($0.holeNumber, "Hole", Double($0.holeNumber))
                }),
                MatchGolfScorecardRow(id: "par", label: "Par", kind: .par, cells: holes.map {
                    cell($0.holeNumber, "par", $0.par)
                }),
            ]
            for side in presentation.sides {
                let prefix = "side.\(side.side)"
                rows.append(.init(id: "\(prefix).team", label: side.name, kind: .team,
                                  teamID: side.teamID, teamName: side.name, teamSide: side.side, cells: []))
                let inputs = presentation.inputRows(for: holes.first?.holeNumber ?? range.lowerBound)
                    .filter { $0.key.side == side.side }
                for input in inputs {
                    let label = presentation.format == .scramble ? "Score" : input.title
                    rows.append(.init(id: "\(prefix).gross.\(input.key.slot)", label: label, kind: .gross,
                                      teamName: side.name, compactLabel: presentation.format == .scramble ? nil : compactName(input.title, in: presentation),
                                      cells: holes.map { hole in
                        let official = presentation.officialHole(hole.holeNumber)?.sides.first { $0.side == side.side }
                        let index = input.key.slot - 1
                        let gross = official.flatMap { $0.gross.indices.contains(index) ? Double($0.gross[index]) : nil }
                        let strokes = official.flatMap { $0.strokes.indices.contains(index) ? $0.strokes[index] : nil }
                        return cell(hole.holeNumber, "\(input.title), \(side.name), gross", gross, strokes: strokes, official: official != nil)
                    }))
                }
                // Omit only a proven duplicate Singles net row, without deriving a net.
                let officialSides = presentation.officialHoles.compactMap { $0.sides.first { $0.side == side.side } }
                let duplicateNet = presentation.format == .singles && !officialSides.isEmpty && officialSides.allSatisfy {
                    guard let net = $0.net, let gross = $0.gross.first else { return false }
                    return net == Double(gross)
                }
                if !duplicateNet {
                    rows.append(.init(id: "\(prefix).net", label: "Net", kind: .net, teamName: side.name, cells: holes.map { hole in
                        let official = presentation.officialHole(hole.holeNumber)?.sides.first { $0.side == side.side }
                        return cell(hole.holeNumber, "\(side.name), Net", official?.net, official: official != nil)
                    }))
                }
            }
            rows.append(.init(id: "result", label: "Hole result", kind: .result, cells: holes.map { hole in
                let winner = presentation.officialHole(hole.holeNumber)?.winner
                let sideNumber: Int? = { if case .side(let side) = winner { return side }; return nil }()
                let side = presentation.sides.first { $0.side == sideNumber }
                return .init(holeNumber: hole.holeNumber, value: winner == .halved ? "½" : sideNumber.map(String.init) ?? "—",
                             strokeMarker: nil, accessibilityLabel: "Hole \(hole.holeNumber), \(winner?.title(sides: presentation.sides) ?? "result unavailable")",
                             teamID: side?.teamID, teamName: side?.name, teamSide: sideNumber)
            }))
            // Score's certified read shape has no per-hole running Match status
            // or OUT/IN/TOT. Do not infer these from winners or sum any scores.
            return MatchGolfScorecardNine(id: id, title: title, rows: rows)
        }
    }

    private static func compactName(_ name: String, in presentation: ScoringPresentation) -> String {
        let names = presentation.sides.flatMap(\.participants).map(\.displayName)
        let first = name.split(whereSeparator: \.isWhitespace).first.map(String.init) ?? name
        return names.filter { $0.split(whereSeparator: \.isWhitespace).first.map(String.init) == first }.count == 1 ? first : name
    }

    private static func cell(_ hole: Int, _ name: String, _ value: Double?, strokes: Double? = nil, official: Bool = false) -> MatchGolfScorecardCell {
        let text = value.map(ScoringNumberFormatter.string) ?? "—"
        let marker = strokes.flatMap { value -> String? in
            guard value > 0 else { return nil }
            return value <= 3 && value.rounded() == value ? String(repeating: "•", count: Int(value)) : ScoringNumberFormatter.string(value)
        }
        let spokenStroke = strokes.map { ", \(ScoringNumberFormatter.string($0)) applied \($0 == 1 ? "stroke" : "strokes")" } ?? ""
        return .init(holeNumber: hole, value: text, strokeMarker: marker,
                     accessibilityLabel: "Hole \(hole), \(name) \(value == nil ? "unavailable" : text)\(spokenStroke)\(official ? ", Official" : "")")
    }
}
