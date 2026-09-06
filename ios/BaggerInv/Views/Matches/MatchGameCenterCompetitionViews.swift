import SwiftUI

/// Display choices only. Every score, result, record, and clinch is supplied by
/// the certified Match Detail projection; these helpers never derive golf facts.
enum MatchGameCenterCompetitionPresentation {
    struct ScoreRow: Equatable, Sendable {
        let name: String
        let gross: Int?
        let strokes: Int?
    }

    struct PrimaryStat: Equatable, Identifiable, Sendable {
        let side: Int?
        let teamID: String?
        let teamName: String?
        let value: Int

        var id: String { side.map { "side.\($0)" } ?? "halved" }
        var label: String { side == nil ? "Halved" : "Holes won" }
        var accessibilityLabel: String {
            side == nil ? "\(value) holes halved" : "\(teamName ?? "Team"), \(value) holes won"
        }
    }

    static func narrative(for hole: MatchDetailHolePresentation) -> String {
        if let story = hole.story, !story.isEmpty {
            if let result = hole.resultLabel, !result.isEmpty,
               !story.localizedCaseInsensitiveContains(result) {
                // Some canonical stories are context-only. Keep their supplied
                // result too, without repeating a winner already in the story.
                return "\(result)\n\(story)"
            }
            return story
        }
        return hole.resultLabel ?? (hole.isPlayed ? "Result recorded" : "Not played")
    }

    static func secondaryResult(for hole: MatchDetailHolePresentation) -> String? {
        guard let result = hole.runningResult, !result.isEmpty,
              !narrative(for: hole).localizedCaseInsensitiveContains(result) else { return nil }
        return result
    }

    static func scoreRows(for side: MatchDetailHoleSidePresentation) -> [ScoreRow] {
        switch side.scope {
        case .players:
            side.playerScores.map { ScoreRow(name: $0.displayName, gross: $0.gross, strokes: $0.strokes) }
        case .team:
            [ScoreRow(name: "Team score", gross: side.teamGross, strokes: side.teamStrokes)]
        }
    }

    static func compactStrokeMarker(_ strokes: Int?) -> String? {
        guard let strokes, strokes != 0 else { return nil }
        return "(\(strokes > 0 ? "+" : "")\(strokes))"
    }

    static func clinchNarrative(
        _ clinch: MatchDetailClinchPresentation?,
        selection: MatchDetailFlowSelection
    ) -> String? {
        guard selection == .overall else { return nil }
        return clinch?.summary
    }

    static func team(side: Int, teams: [MatchDetailTeamPresentation]) -> MatchDetailTeamPresentation? {
        teams.first { $0.side == side }
    }

    static func primaryStats(
        _ stats: MatchDetailStatsPresentation,
        teams: [MatchDetailTeamPresentation]
    ) -> [PrimaryStat] {
        let first = team(side: 1, teams: teams)
        let second = team(side: 2, teams: teams)
        return [
            PrimaryStat(side: 1, teamID: first?.teamID, teamName: first?.name ?? "Team 1", value: stats.sideOneHolesWon),
            PrimaryStat(side: nil, teamID: nil, teamName: nil, value: stats.halved),
            PrimaryStat(side: 2, teamID: second?.teamID, teamName: second?.name ?? "Team 2", value: stats.sideTwoHolesWon),
        ]
    }
}

struct MatchGameCenterPolishSelectedHole: View {
    let hole: MatchDetailHolePresentation
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @State private var cellHeights: [String: CGFloat] = [:]

    var body: some View {
        VStack(alignment: .leading, spacing: BaggerDesign.Space.medium) {
            VStack(alignment: .leading, spacing: BaggerDesign.Space.small) {
                BaggerEyebrow(text: "Selected Hole")
                ViewThatFits(in: .horizontal) {
                    HStack(alignment: .firstTextBaseline) {
                        holeTitle
                        Spacer(minLength: BaggerDesign.Space.medium)
                        if hole.isOfficial { BaggerStatusBadge(kind: .official) }
                    }
                    VStack(alignment: .leading, spacing: BaggerDesign.Space.small) {
                        holeTitle
                        if hole.isOfficial { BaggerStatusBadge(kind: .official) }
                    }
                }
                Text(holeFacts)
                    .font(BaggerDesign.Typography.captionEmphasis)
                    .foregroundStyle(BaggerDesign.Color.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityLabel(holeFactsAccessibility)
                    .accessibilityIdentifier("match.gameCenter.selectedHole.facts")
            }

            VStack(alignment: .leading, spacing: BaggerDesign.Space.xSmall) {
                Text(MatchGameCenterCompetitionPresentation.narrative(for: hole))
                    .font(BaggerDesign.Typography.bodyEmphasis)
                    .foregroundStyle(BaggerDesign.Color.brandAction)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("match.gameCenter.selectedHole.result")
                if let secondary = MatchGameCenterCompetitionPresentation.secondaryResult(for: hole) {
                    Text(secondary)
                        .font(BaggerDesign.Typography.numericCompact)
                        .foregroundStyle(BaggerDesign.Color.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(.leading, BaggerDesign.Space.medium)
            .overlay(alignment: .leading) {
                RoundedRectangle(cornerRadius: 2)
                    .fill(BaggerDesign.Color.brandGold)
                    .frame(width: 3)
            }

            if hole.isPlayed {
                let layout = dynamicTypeSize.isAccessibilitySize
                    ? AnyLayout(VStackLayout(spacing: BaggerDesign.Space.medium))
                    : AnyLayout(HStackLayout(alignment: .top, spacing: BaggerDesign.Space.small))
                layout {
                    sideCard(hole.sideOne)
                    sideCard(hole.sideTwo)
                }
                .onPreferenceChange(MatchCompetitionCellHeights.self) { measured in
                    if cellHeights != measured { cellHeights = measured }
                }
            } else {
                Text("Scores will appear after this hole is confirmed.")
                    .font(BaggerDesign.Typography.caption)
                    .foregroundStyle(BaggerDesign.Color.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("match.gameCenter.selectedHole.awaitingScores")
            }
        }
        .baggerCard(style: .standard)
        .matchGameCenterAcceptanceProbe(
            identifier: "match.gameCenter.selectedHole",
            label: "Selected Hole, Hole \(hole.holeNumber)"
        )
    }

    private var holeTitle: some View {
        Text("Hole \(hole.holeNumber)")
            .font(BaggerDesign.Typography.titlePrimary)
            .foregroundStyle(BaggerDesign.Color.textPrimary)
            .fixedSize(horizontal: false, vertical: true)
    }

    private var holeFacts: String {
        [
            hole.par.map { "Par \($0)" },
            hole.yardage.map { "\(MatchGameCenterFormatter.integer($0)) yds" },
            hole.strokeIndex.map { "SI \($0)" },
        ].compactMap { $0 }.joined(separator: " · ")
    }

    private var holeFactsAccessibility: String {
        [
            hole.par.map { "Par \($0)" },
            hole.yardage.map { "\($0) yards" },
            hole.strokeIndex.map { "Stroke Index \($0)" },
        ].compactMap { $0 }.joined(separator: ", ")
    }

    private func sideCard(_ side: MatchDetailHoleSidePresentation) -> some View {
        let rows = MatchGameCenterCompetitionPresentation.scoreRows(for: side)
        let rowCount = max(
            MatchGameCenterCompetitionPresentation.scoreRows(for: hole.sideOne).count,
            MatchGameCenterCompetitionPresentation.scoreRows(for: hole.sideTwo).count
        )
        return VStack(alignment: .leading, spacing: BaggerDesign.Space.small) {
            BaggerTeamLogo(
                teamID: side.teamID,
                teamName: side.teamName,
                size: .medium,
                accessibility: .identity(label: "\(side.teamName) logo")
            )
            .frame(maxWidth: .infinity)
            .accessibilityIdentifier("match.gameCenter.selectedHole.side.\(side.side).logo")

            alignedCell(key: "title") {
                MatchCompetitionTeamName(name: side.teamName)
                    .frame(maxWidth: .infinity, alignment: .center)
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(side.teamName)
            .accessibilityIdentifier("match.gameCenter.selectedHole.side.\(side.side).title")

            Divider().overlay(BaggerDesign.Color.borderDefault)
            ForEach(0..<rowCount, id: \.self) { index in
                alignedCell(key: "player.\(index)") {
                    if rows.indices.contains(index) {
                        scoreRow(rows[index])
                            .accessibilityElement(children: .ignore)
                            .accessibilityLabel(scoreAccessibility(rows[index], team: side.teamName))
                    } else {
                        Color.clear.frame(height: 1).accessibilityHidden(true)
                    }
                }
                .accessibilityIdentifier("match.gameCenter.selectedHole.side.\(side.side).player.\(index)")
            }
            Divider().overlay(BaggerDesign.Color.borderDefault)
            HStack(alignment: .firstTextBaseline) {
                Text("Net")
                    .font(BaggerDesign.Typography.captionEmphasis)
                Spacer(minLength: BaggerDesign.Space.xSmall)
                Text(MatchGameCenterFormatter.score(side.netScore))
                    .font(BaggerDesign.Typography.statMedium)
            }
            .foregroundStyle(BaggerDesign.Color.brandAction)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("\(side.teamName), \(MatchGameCenterFormatter.accessibilityScore(side.netScore, label: "net"))")
            .accessibilityIdentifier("match.gameCenter.selectedHole.side.\(side.side).net")
        }
        .padding(BaggerDesign.Space.medium)
        .frame(maxWidth: .infinity, alignment: .topLeading)
        .background(
            BaggerDesign.Color.surfaceMuted,
            in: RoundedRectangle(cornerRadius: BaggerDesign.Radius.control, style: .continuous)
        )
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("match.gameCenter.selectedHole.side.\(side.side).card")
        .matchGameCenterAcceptanceProbe(
            identifier: "match.gameCenter.selectedHole.side.\(side.side)",
            label: "\(side.teamName) hole scores"
        )
    }

    private func alignedCell<Content: View>(key: String, @ViewBuilder content: () -> Content) -> some View {
        content()
            .fixedSize(horizontal: false, vertical: true)
            .background {
                GeometryReader { geometry in
                    Color.clear.preference(key: MatchCompetitionCellHeights.self, value: [key: geometry.size.height])
                }
            }
            .frame(minHeight: cellHeights[key] ?? 0, alignment: .top)
    }

    private func scoreRow(_ row: MatchGameCenterCompetitionPresentation.ScoreRow) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: BaggerDesign.Space.xSmall) {
            Text(row.name)
                .font(BaggerDesign.Typography.caption)
                .foregroundStyle(BaggerDesign.Color.textPrimary)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
            HStack(alignment: .firstTextBaseline, spacing: BaggerDesign.Space.hairline) {
                Text(MatchGameCenterFormatter.score(row.gross))
                    .font(BaggerDesign.Typography.numericCompact)
                    .foregroundStyle(BaggerDesign.Color.textPrimary)
                if let marker = MatchGameCenterCompetitionPresentation.compactStrokeMarker(row.strokes) {
                    Text(marker)
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(BaggerDesign.Color.brandGoldText)
                }
            }
            .fixedSize()
        }
    }

    private func scoreAccessibility(_ row: MatchGameCenterCompetitionPresentation.ScoreRow, team: String) -> String {
        [
            "Hole \(hole.holeNumber)", team, row.name,
            MatchGameCenterFormatter.accessibilityScore(row.gross, label: "gross"),
            MatchGameCenterFormatter.accessibilityStrokes(row.strokes),
        ].joined(separator: ", ")
    }
}

private struct MatchCompetitionCellHeights: PreferenceKey {
    static var defaultValue: [String: CGFloat] { [:] }

    static func reduce(value: inout [String: CGFloat], nextValue: () -> [String: CGFloat]) {
        value.merge(nextValue(), uniquingKeysWith: { max($0, $1) })
    }
}

private struct MatchCompetitionTeamName: View {
    let name: String
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        Group {
            if dynamicTypeSize.isAccessibilitySize {
                Text(name).fixedSize(horizontal: false, vertical: true)
            } else {
                Text(name).lineLimit(2, reservesSpace: true)
            }
        }
        .font(BaggerDesign.Typography.captionEmphasis)
        .foregroundStyle(BaggerDesign.Color.textPrimary)
        .multilineTextAlignment(.center)
    }
}

struct MatchGameCenterPolishFlow: View {
    let flow: MatchDetailFlowPresentation
    let teams: [MatchDetailTeamPresentation]
    let clinch: MatchDetailClinchPresentation?
    @Binding var selection: MatchDetailFlowSelection
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        let segment = flow.segment(for: selection)
        VStack(alignment: .leading, spacing: BaggerDesign.Space.headingToContent) {
            BaggerSectionHeading("Match Flow")
            let controlLayout = dynamicTypeSize.isAccessibilitySize
                ? AnyLayout(VStackLayout(spacing: BaggerDesign.Space.small))
                : AnyLayout(HStackLayout(spacing: BaggerDesign.Space.small))
            controlLayout {
                ForEach(MatchDetailFlowSelection.allCases) { item in
                    BaggerSelectionPill(title: item.rawValue, isSelected: selection == item) {
                        selection = item
                    }
                    .frame(maxWidth: .infinity, minHeight: BaggerDesign.Size.minimumTouchTarget)
                    .accessibilityLabel("\(item.rawValue) Match Flow")
                    .accessibilityIdentifier("match.gameCenter.flow.\(item.rawValue.lowercased())")
                }
            }
            VStack(spacing: BaggerDesign.Space.medium) {
                let identityLayout = dynamicTypeSize.isAccessibilitySize
                    ? AnyLayout(VStackLayout(spacing: BaggerDesign.Space.medium))
                    : AnyLayout(HStackLayout(alignment: .top, spacing: BaggerDesign.Space.large))
                identityLayout {
                    flowTeam(side: 1, segment: segment)
                    flowTeam(side: 2, segment: segment)
                }
                VStack(spacing: BaggerDesign.Space.xSmall) {
                    Text(segment.result ?? segment.statusText)
                        .font(BaggerDesign.Typography.statLarge)
                        .foregroundStyle(BaggerDesign.Color.brandAction)
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("match.gameCenter.flow.result")
                    Text("\(segment.holesRecorded) \(segment.holesRecorded == 1 ? "hole" : "holes") recorded")
                        .font(BaggerDesign.Typography.caption)
                        .foregroundStyle(BaggerDesign.Color.textSecondary)
                        .multilineTextAlignment(.center)
                }
                .frame(maxWidth: .infinity)
                if let narrative = MatchGameCenterCompetitionPresentation.clinchNarrative(clinch, selection: selection) {
                    Divider().overlay(BaggerDesign.Color.borderDefault)
                    Label(narrative, systemImage: "flag.checkered")
                        .font(BaggerDesign.Typography.captionEmphasis)
                        .foregroundStyle(BaggerDesign.Color.brandAction)
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .accessibilityIdentifier("match.gameCenter.clinch")
                }
            }
            .padding(BaggerDesign.Space.large)
            .background(
                BaggerDesign.Color.surfaceMuted,
                in: RoundedRectangle(cornerRadius: BaggerDesign.Radius.card, style: .continuous)
            )
            .accessibilityElement(children: .contain)
            .accessibilityLabel("\(selection.rawValue) Match Flow")
            .accessibilityIdentifier("match.gameCenter.flow.detail")
        }
        .matchGameCenterAcceptanceProbe(identifier: "match.gameCenter.flow", label: "Match Flow")
    }

    private func flowTeam(side: Int, segment: MatchDetailFlowSegmentPresentation) -> some View {
        let team = MatchGameCenterCompetitionPresentation.team(side: side, teams: teams)
        let name = team?.name ?? "Team \(side)"
        return VStack(spacing: BaggerDesign.Space.small) {
            BaggerTeamLogo(
                teamID: team?.teamID ?? "",
                teamName: name,
                size: .medium,
                accessibility: .decorative
            )
            MatchCompetitionTeamName(name: name)
            Text(segment.winnerSide == side ? (segment.status == .final ? "Winner" : "Leading") : " ")
                .font(BaggerDesign.Typography.eyebrow)
                .foregroundStyle(BaggerDesign.Color.brandGoldText)
                .accessibilityHidden(true)
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(
            segment.winnerSide == side ? "\(name), \(segment.status == .final ? "winner" : "leading")" : name
        )
        .accessibilityIdentifier("match.gameCenter.flow.side.\(side)")
    }
}

struct MatchGameCenterPolishStats: View {
    let stats: MatchDetailStatsPresentation
    let teams: [MatchDetailTeamPresentation]
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        VStack(alignment: .leading, spacing: BaggerDesign.Space.headingToContent) {
            BaggerSectionHeading("Match Stats")
            VStack(spacing: BaggerDesign.Space.medium) {
                let layout = dynamicTypeSize.isAccessibilitySize
                    ? AnyLayout(VStackLayout(spacing: BaggerDesign.Space.medium))
                    : AnyLayout(HStackLayout(alignment: .top, spacing: BaggerDesign.Space.small))
                layout {
                    ForEach(MatchGameCenterCompetitionPresentation.primaryStats(stats, teams: teams)) { stat in
                        primaryMetric(stat)
                    }
                }
                Divider().overlay(BaggerDesign.Color.borderDefault)
                layout {
                    secondaryMetric("Biggest lead", stats.biggestLead, id: "biggestLead")
                    secondaryMetric(stats.leadChanges == 1 ? "Lead change" : "Lead changes", stats.leadChanges, id: "leadChanges")
                    secondaryMetric("Remaining", stats.holesRemaining, id: "remaining")
                }
            }
            .padding(BaggerDesign.Space.large)
            .background(
                BaggerDesign.Color.surfacePrimary,
                in: RoundedRectangle(cornerRadius: BaggerDesign.Radius.card, style: .continuous)
            )
        }
        .matchGameCenterAcceptanceProbe(identifier: "match.gameCenter.stats", label: "Match Stats")
    }

    private func primaryMetric(_ stat: MatchGameCenterCompetitionPresentation.PrimaryStat) -> some View {
        return VStack(spacing: BaggerDesign.Space.xSmall) {
            Group {
                if stat.side != nil {
                    BaggerTeamLogo(teamID: stat.teamID ?? "", teamName: stat.teamName ?? "", size: .medium, accessibility: .decorative)
                } else {
                    Image(systemName: "equal.circle")
                        .font(.title2.weight(.medium))
                        .foregroundStyle(BaggerDesign.Color.textSecondary)
                        .frame(width: BaggerDesign.Size.Logo.medium, height: BaggerDesign.Size.Logo.medium)
                }
            }
            .accessibilityHidden(true)
            Text(String(stat.value))
                .font(BaggerDesign.Typography.statLarge)
                .foregroundStyle(BaggerDesign.Color.brandAction)
            Text(stat.label)
                .font(BaggerDesign.Typography.caption)
                .foregroundStyle(BaggerDesign.Color.textSecondary)
                .multilineTextAlignment(.center)
                .lineLimit(2, reservesSpace: !dynamicTypeSize.isAccessibilitySize)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(stat.accessibilityLabel)
        .accessibilityIdentifier("match.gameCenter.stats.\(stat.id)")
    }

    private func secondaryMetric(_ title: String, _ value: Int, id: String) -> some View {
        VStack(spacing: BaggerDesign.Space.xSmall) {
            Text(String(value))
                .font(BaggerDesign.Typography.statMedium)
                .foregroundStyle(BaggerDesign.Color.textPrimary)
            Text(title)
                .font(BaggerDesign.Typography.caption)
                .foregroundStyle(BaggerDesign.Color.textSecondary)
                .multilineTextAlignment(.center)
                .lineLimit(2, reservesSpace: !dynamicTypeSize.isAccessibilitySize)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(title), \(value)")
        .accessibilityIdentifier("match.gameCenter.stats.\(id)")
    }
}
