import Foundation

/// A layout projection of certified scorecard facts, never a scoring engine.
struct MatchGolfScorecardPresentation: Equatable, Sendable {
    let nines: [MatchGolfScorecardNine]

    static func make(
        scorecard: MatchDetailScorecardPresentation,
        teams: [MatchDetailTeamPresentation],
        format: MobileScoringFormat
    ) -> Self {
        guard format.isKnown else { return Self(nines: []) }
        return Self(nines: [
            nine(id: "front", title: "Front Nine", range: 1...9,
                 scorecard: scorecard, teams: teams, format: format),
            nine(id: "back", title: "Back Nine", range: 10...18,
                 scorecard: scorecard, teams: teams, format: format),
        ])
    }

    private static func nine(
        id: String,
        title: String,
        range: ClosedRange<Int>,
        scorecard: MatchDetailScorecardPresentation,
        teams: [MatchDetailTeamPresentation],
        format: MobileScoringFormat
    ) -> MatchGolfScorecardNine {
        let holes = scorecard.holes.filter { range.contains($0.holeNumber) }
        let playerLabels = compactPlayerLabels(teams.flatMap(\.players))
        let largePlayerLabels = compactPlayerLabels(teams.flatMap(\.players), maximumLength: 5)
        var rows = [
            MatchGolfScorecardRow(id: "holes", label: "Hole", kind: .holes, cells: holes.map {
                .init(holeNumber: $0.holeNumber, value: String($0.holeNumber),
                      strokeMarker: nil, accessibilityLabel: "Hole \($0.holeNumber)")
            }),
            MatchGolfScorecardRow(id: "par", label: "Par", kind: .par, cells: holes.map {
                .init(holeNumber: $0.holeNumber, value: score($0.par), strokeMarker: nil,
                      accessibilityLabel: "Hole \($0.holeNumber), \(scoreDescription($0.par, name: "par"))")
            }),
        ]

        // Use the canonical side and participant arrays in their supplied order.
        for team in teams {
            let prefix = "side.\(team.side)"
            rows.append(.init(id: "\(prefix).team", label: team.name, kind: .team,
                              teamID: team.teamID, teamName: team.name, teamSide: team.side, cells: []))
            if format == .scramble {
                rows.append(.init(
                    id: "\(prefix).gross", label: "Score", kind: .gross,
                    teamName: team.name,
                    cells: holes.map { hole in
                        let side = sideScore(hole, side: team.side)
                        return cell(hole: hole, name: team.name, value: side.teamGross,
                                    strokes: side.teamStrokes, scoreName: "gross")
                    }
                ))
            } else {
                for (index, player) in team.players.enumerated() {
                    rows.append(.init(
                        id: "\(prefix).player.\(index)", label: player.displayName, kind: .gross,
                        teamName: team.name, compactLabel: playerLabels[player.playerID],
                        accessibilitySizeLabel: largePlayerLabels[player.playerID],
                        cells: holes.map { hole in
                            let value = sideScore(hole, side: team.side).playerScores.first {
                                $0.playerID == player.playerID
                            }
                            return cell(hole: hole, name: "\(player.displayName), \(team.name)",
                                        value: value?.gross, strokes: value?.strokes, scoreName: "gross")
                        }
                    ))
                }
            }
            if shouldShowNet(format: format, team: team, holes: scorecard.holes) {
                rows.append(.init(
                    id: "\(prefix).net", label: "Net", kind: .net, teamName: team.name,
                    cells: holes.map { hole in
                        cell(hole: hole, name: team.name,
                             value: sideScore(hole, side: team.side).netScore,
                             strokes: nil, scoreName: "net")
                    }
                ))
            }
        }

        rows.append(.init(id: "result", label: "Hole result", kind: .result, cells: holes.map { hole in
            let winner = teams.first { $0.side == hole.winningSide }
            let token: String
            switch hole.outcome {
            case .unplayed: token = "—"
            case .halved: token = "½"
            case .sideOne, .sideTwo: token = winner.map { String($0.side) } ?? "W"
            }
            let description: String
            switch hole.outcome {
            case .unplayed: description = "Hole \(hole.holeNumber), not played"
            case .halved: description = "Hole \(hole.holeNumber), halved"
            case .sideOne, .sideTwo:
                description = "Hole \(hole.holeNumber), \(winner?.name ?? "Winning side unavailable") won the hole"
            }
            return .init(holeNumber: hole.holeNumber, value: token,
                         strokeMarker: nil, accessibilityLabel: description,
                         teamID: winner?.teamID, teamName: winner?.name, teamSide: winner?.side)
        }))
        rows.append(.init(id: "status", label: "Match status", kind: .status,
                          cells: holes.map { statusCell(hole: $0, teams: teams) }))
        // The certified DTO has no OUT/IN totals: deliberately do not sum cells.
        return MatchGolfScorecardNine(id: id, title: title, rows: rows)
    }

    private static func sideScore(_ hole: MatchDetailHolePresentation, side: Int) -> MatchDetailHoleSidePresentation {
        side == 1 ? hole.sideOne : hole.sideTwo
    }

    private static func shouldShowNet(
        format: MobileScoringFormat,
        team: MatchDetailTeamPresentation,
        holes: [MatchDetailHolePresentation]
    ) -> Bool {
        guard format == .singles else { return true }
        guard holes.contains(where: { sideScore($0, side: team.side).netScore != nil }) else { return false }
        // Suppress only a proven duplicate. Unknown played net/gross is meaningful
        // unavailable data, not proof of equality. Unplayed holes do not decide it.
        let played = holes.filter(\.isPlayed)
        guard !played.isEmpty, let playerID = team.players.first?.playerID else { return true }
        return !played.allSatisfy { hole in
            let side = sideScore(hole, side: team.side)
            guard let net = side.netScore,
                  let gross = side.playerScores.first(where: { $0.playerID == playerID })?.gross
            else { return false }
            return gross == net
        }
    }

    private static func statusCell(
        hole: MatchDetailHolePresentation,
        teams: [MatchDetailTeamPresentation]
    ) -> MatchGolfScorecardCell {
        guard let canonical = hole.runningResult, !canonical.isEmpty else {
            return .init(holeNumber: hole.holeNumber, value: "—", strokeMarker: nil,
                         accessibilityLabel: "Hole \(hole.holeNumber), match status \(hole.isPlayed ? "unavailable" : "not played")")
        }
        // Move an exact displayed team-name prefix into a compact side marker. No
        // result parsing, winner inference, arithmetic, trimming, or substitution.
        // Longest exact prefix avoids confusing teams whose names share a prefix.
        let matchingTeams = teams.filter {
            !$0.name.isEmpty && canonical.hasPrefix("\($0.name) ") && canonical.count > $0.name.count + 1
        }
        let longestLength = matchingTeams.map { $0.name.count }.max() ?? 0
        let longestMatches = matchingTeams.filter { $0.name.count == longestLength }
        // Duplicate display names cannot establish which distinct side is named.
        let namedTeam = longestMatches.count == 1 ? longestMatches.first : nil
        let visible = namedTeam.map { String(canonical.dropFirst($0.name.count + 1)) } ?? canonical
        return .init(holeNumber: hole.holeNumber, value: visible, strokeMarker: nil,
                     accessibilityLabel: "Hole \(hole.holeNumber), match status, \(canonical)",
                     teamID: namedTeam?.teamID, teamName: namedTeam?.name, teamSide: namedTeam?.side)
    }

    private static func cell(
        hole: MatchDetailHolePresentation,
        name: String,
        value: Int?,
        strokes: Int?,
        scoreName: String
    ) -> MatchGolfScorecardCell {
        // The certified shape permits 0–20 applied strokes. Dots cover ordinary
        // counts; a superscript count keeps exceptional values compact, exact,
        // and single-line. No count is inferred from a handicap or a score.
        let marker = strokes.flatMap { value -> String? in
            guard value > 0 else { return nil }
            return value <= 3 ? String(repeating: "•", count: value) : String(value)
        }
        var spoken = ["Hole \(hole.holeNumber)", name]
        if !hole.isPlayed { spoken.append("not played") }
        spoken.append(scoreDescription(value, name: scoreName))
        if scoreName == "gross" {
            if let strokes {
                spoken.append(strokes == 0 ? "no applied strokes" :
                    "\(strokes) applied \(strokes == 1 ? "stroke" : "strokes")")
            } else {
                spoken.append("applied strokes unavailable")
            }
        }
        if hole.isOfficial { spoken.append("official") }
        return .init(holeNumber: hole.holeNumber, value: score(value), strokeMarker: marker,
                     accessibilityLabel: spoken.joined(separator: ", "))
    }

    private static func score(_ value: Int?) -> String { value.map(String.init) ?? "—" }

    /// Display names only, never Match IDs. Pick a short unambiguous label across
    /// both teams; the untouched full name remains in row/cell accessibility.
    static func compactPlayerLabels(
        _ players: [MatchDetailPlayerPresentation], maximumLength: Int = 10
    ) -> [String: String] {
        let candidates = players.map { player -> [String] in
            let words = player.displayName.split(whereSeparator: \.isWhitespace).map(String.init)
            guard let first = words.first else { return [player.displayName] }
            guard let last = words.last, words.count > 1 else { return [first] }
            return [first, "\(first) \(last.prefix(1)).", "\(first.prefix(1)). \(last)",
                    "\(first.prefix(1)). \(last.prefix(1))."]
                + (2...6).map { "\(first.prefix(1)).\(last.prefix($0))" }
        }
        var result: [String: String] = [:]
        var used: Set<String> = []
        for (index, player) in players.enumerated() {
            let choice = candidates[index].first { candidate in
                candidate.count <= maximumLength && !used.contains(candidate.lowercased()) &&
                    !candidates.enumerated().contains { otherIndex, other in
                        otherIndex != index && other.contains { $0.caseInsensitiveCompare(candidate) == .orderedSame }
                    }
            } ?? "P\(index + 1)"
            result[player.playerID] = choice
            used.insert(choice.lowercased())
        }
        return result
    }

    private static func scoreDescription(_ value: Int?, name: String) -> String {
        value.map { "\(name) \($0)" } ?? "\(name) unavailable"
    }
}

struct MatchGolfScorecardNine: Identifiable, Equatable, Sendable {
    let id: String
    let title: String
    let rows: [MatchGolfScorecardRow]
}

struct MatchGolfScorecardRow: Identifiable, Equatable, Sendable {
    enum Kind: Equatable, Sendable { case holes, par, team, gross, net, result, status }
    let id: String
    let label: String
    let kind: Kind
    var teamID: String? = nil
    var teamName: String? = nil
    var teamSide: Int? = nil
    var compactLabel: String? = nil
    var accessibilitySizeLabel: String? = nil
    let cells: [MatchGolfScorecardCell]

    var visibleLabel: String {
        if let compactLabel { return compactLabel }
        switch kind {
        case .holes: return "HOLE"
        case .par: return "PAR"
        case .net: return "NET"
        case .result: return "HOLE"
        case .status: return "MATCH"
        default: return label
        }
    }
}

struct MatchGolfScorecardCell: Identifiable, Equatable, Sendable {
    let holeNumber: Int
    let value: String
    let strokeMarker: String?
    let accessibilityLabel: String
    var teamID: String? = nil
    var teamName: String? = nil
    var teamSide: Int? = nil
    var id: Int { holeNumber }
}
