import SwiftUI

/// One printed-scorecard grammar. Only score columns scroll; identities stay anchored.
struct MatchGameCenterGolfScorecard: View {
    let match: MatchDetailMatchPresentation
    @Binding var isExpanded: Bool
    @ScaledMetric(relativeTo: .caption) private var minimumCellWidth: CGFloat = 62
    @ScaledMetric(relativeTo: .caption) private var minimumBandHeight: CGFloat = 44
    @State private var measuredCellWidth: CGFloat = 0
    @State private var measuredBandHeight: CGFloat = 0

    var body: some View {
        VStack(alignment: .leading, spacing: BaggerDesign.Space.medium) {
            Button {
                isExpanded.toggle()
            } label: {
                HStack(alignment: .center, spacing: BaggerDesign.Space.medium) {
                    Text("Hole-by-Hole Scorecard")
                        .font(BaggerDesign.Typography.titleSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: 0)
                    Image(systemName: isExpanded ? "chevron.down" : "chevron.right")
                        .font(BaggerDesign.Typography.captionEmphasis)
                }
                .foregroundStyle(BaggerDesign.Color.textPrimary)
                .frame(minHeight: BaggerDesign.Size.minimumTouchTarget)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("match.gameCenter.scorecard.toggle")
            .accessibilityValue(isExpanded ? "Expanded" : "Collapsed")
            .accessibilityHint(isExpanded ? "Collapses the official scorecard" : "Expands the official scorecard")

            VStack(alignment: .leading, spacing: BaggerDesign.Space.xSmall) {
                Text(match.scorecard.state.title).font(BaggerDesign.Typography.captionEmphasis)
                if let confirmation = match.scorecard.confirmationText {
                    Text(confirmation).font(BaggerDesign.Typography.caption)
                }
            }
            .foregroundStyle(BaggerDesign.Color.textSecondary)
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("match.gameCenter.scorecard.official")

            if isExpanded {
                if match.scorecard.state == .unavailable {
                    Text("Official scores will appear after play begins.")
                        .font(BaggerDesign.Typography.caption)
                        .foregroundStyle(BaggerDesign.Color.textSecondary)
                }
                ForEach(MatchGolfScorecardPresentation.make(
                    scorecard: match.scorecard, teams: match.teams, format: match.format
                ).nines) { nine in
                    ScorecardNineView(nine: nine, cellWidth: max(minimumCellWidth, measuredCellWidth + 16),
                                      bandHeight: max(minimumBandHeight, measuredBandHeight))
                }
                Text("• Applied stroke · ½ Halved · — Not played or unavailable")
                    .font(BaggerDesign.Typography.caption)
                    .foregroundStyle(BaggerDesign.Color.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityLabel("Dots or raised counts indicate canonical applied strokes. Half means halved. Dash means not played or unavailable.")
            }
        }
        .onPreferenceChange(ScorecardNaturalCellWidth.self) { measuredCellWidth = $0 }
        .onPreferenceChange(ScorecardNaturalBandHeight.self) { measuredBandHeight = $0 }
        .padding(BaggerDesign.Space.medium)
        .background(BaggerDesign.Color.surfacePrimary, in: RoundedRectangle(cornerRadius: BaggerDesign.Radius.card))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("match.gameCenter.scorecard")
    }
}

/// Both nines share measured widths and type-based heights. Names/statuses cannot
/// stretch scoring rows; both team bands share the tallest intrinsic team title.
private struct ScorecardNineView: View {
    let nine: MatchGolfScorecardNine
    let cellWidth: CGFloat
    let bandHeight: CGFloat
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @ScaledMetric(relativeTo: .caption) private var rowHeight: CGFloat = 36

    private var prefix: String { "match.gameCenter.scorecard.\(nine.id)" }
    private var identityWidth: CGFloat { dynamicTypeSize.isAccessibilitySize ? 116 : 84 }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(nine.title)
                .font(.system(.subheadline, design: .default, weight: .semibold))
                .foregroundStyle(BaggerDesign.Color.brandAction)
                .accessibilityAddTraits(.isHeader)
                .accessibilityHint("Hole columns scroll horizontally; identities stay in place")

            ZStack(alignment: .topLeading) {
                HStack(alignment: .top, spacing: 0) {
                    VStack(spacing: 0) {
                        ForEach(nine.rows) { row in
                            identity(row)
                                .frame(width: identityWidth, height: height(row), alignment: .leading)
                                .contentShape(Rectangle())
                                .accessibilityElement(children: .ignore)
                                .accessibilityLabel(row.teamName.map { "\($0), \(row.label)" } ?? row.label)
                                .accessibilityIdentifier("\(prefix).label.\(row.id)")
                                .accessibilityHidden(row.kind == .team)
                                .background(surface(row.kind), in: Rectangle())
                                .overlay(alignment: .bottom) { horizontalRule }
                        }
                    }
                    .overlay(alignment: .trailing) { verticalRule }
                    .accessibilityElement(children: .contain)
                    .accessibilityIdentifier("\(prefix).identities")

                    ScrollView(.horizontal) {
                        VStack(spacing: 0) {
                            ForEach(nine.rows) { row in
                                HStack(spacing: 0) {
                                    if row.kind == .team {
                                        Color.clear.frame(width: cellWidth * 9).accessibilityHidden(true)
                                    } else {
                                        ForEach(row.cells) { cell in
                                            ScorecardHoleCell(cell: cell, kind: row.kind)
                                                .frame(width: cellWidth, height: height(row))
                                                .contentShape(Rectangle())
                                                .accessibilityElement(children: .ignore)
                                                .accessibilityLabel(cell.accessibilityLabel)
                                                .overlay(alignment: .trailing) { verticalRule }
                                                .accessibilityIdentifier("\(prefix).cell.\(row.id).hole.\(cell.holeNumber)")
                                        }
                                    }
                                }
                                .frame(height: height(row))
                                .contentShape(Rectangle())
                                .background(surface(row.kind), in: Rectangle())
                                .overlay(alignment: .bottom) { horizontalRule }
                                .accessibilityElement(children: .contain)
                                .accessibilityIdentifier("\(prefix).row.\(row.id)")
                            }
                        }
                    }
                    .scrollIndicators(.visible)
                    .accessibilityIdentifier("\(prefix).scroll")
                }

                // Team bands span the viewport, not the narrow identity column.
                VStack(spacing: 0) {
                    ForEach(nine.rows) { row in
                        if row.kind == .team {
                            ScorecardTeamBand(row: row)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .frame(height: height(row))
                                .contentShape(Rectangle())
                                .accessibilityElement(children: .ignore)
                                .accessibilityLabel("Side \(row.teamSide ?? 0), \(row.label)")
                                .accessibilityAddTraits(.isHeader)
                                .background(surface(.team), in: Rectangle())
                                .overlay(alignment: .bottom) { horizontalRule }
                                .accessibilityIdentifier("\(prefix).label.\(row.id)")
                        } else {
                            Color.clear.frame(height: height(row)).accessibilityHidden(true)
                        }
                    }
                }
                .allowsHitTesting(false)
            }
            .clipped()
            .overlay {
                Rectangle().strokeBorder(BaggerDesign.Color.borderDefault, lineWidth: 0.5)
                    .accessibilityHidden(true)
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier(prefix)
    }

    @ViewBuilder private func identity(_ row: MatchGolfScorecardRow) -> some View {
        if row.kind == .team {
            Color.clear.accessibilityHidden(true)
        } else {
            Text(identityLabel(row))
                .font(.system(.caption, design: .default, weight: row.kind == .gross ? .regular : .semibold))
                .lineLimit(2)
                .padding(.horizontal, 6)
                .foregroundStyle(row.kind == .holes ? .white : BaggerDesign.Color.textPrimary)
        }
    }

    private func height(_ row: MatchGolfScorecardRow) -> CGFloat { row.kind == .team ? bandHeight : rowHeight }

    private func identityLabel(_ row: MatchGolfScorecardRow) -> String {
        guard dynamicTypeSize.isAccessibilitySize else { return row.visibleLabel }
        if row.kind == .status { return "State" }
        if row.kind == .holes || row.kind == .result { return "Hole" }
        return row.accessibilitySizeLabel ?? row.visibleLabel
    }

    private var horizontalRule: some View {
        Rectangle().fill(BaggerDesign.Color.borderDefault.opacity(0.65)).frame(height: 0.5)
            .accessibilityHidden(true)
    }
    private var verticalRule: some View {
        Rectangle().fill(BaggerDesign.Color.borderDefault.opacity(0.65)).frame(width: 0.5)
            .accessibilityHidden(true)
    }

    private func surface(_ kind: MatchGolfScorecardRow.Kind) -> Color {
        switch kind {
        case .holes: BaggerDesign.Color.brandEvergreen
        case .team: BaggerDesign.Color.surfaceMuted
        case .net: BaggerDesign.Color.statusWarningBackground.opacity(0.65)
        case .par: BaggerDesign.Color.surfaceMuted.opacity(0.5)
        case .result, .status, .gross: BaggerDesign.Color.surfacePrimary
        }
    }
}

private struct ScorecardTeamBand: View {
    let row: MatchGolfScorecardRow

    var body: some View {
        HStack(spacing: 7) {
            if let side = row.teamSide { ScorecardSideMark(side: side) }
            if let teamID = row.teamID {
                BaggerTeamLogo(teamID: teamID, teamName: row.label, size: .small, accessibility: .decorative)
            }
            Text(row.label)
                .font(.system(.caption, design: .default, weight: .semibold))
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 6)
        .background {
            GeometryReader { geometry in
                Color.clear.preference(key: ScorecardNaturalBandHeight.self, value: geometry.size.height)
            }
        }
        .foregroundStyle(BaggerDesign.Color.brandAction)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Side \(row.teamSide ?? 0), \(row.label)")
        .accessibilityAddTraits(.isHeader)
    }
}

/// Number plus shape remains side-safe even when team names/initials collide.
/// The same mark appears in the team band and canonical result/status cells.
private struct ScorecardSideMark: View {
    let side: Int

    var body: some View {
        Text(String(side))
            .font(.system(.caption2, design: .default, weight: .semibold))
            .monospacedDigit()
            .padding(.horizontal, 4)
            .padding(.vertical, 1)
            .overlay { RoundedRectangle(cornerRadius: side == 1 ? 3 : 10).strokeBorder(lineWidth: 0.75) }
            .accessibilityHidden(true)
    }
}

private struct ScorecardHoleCell: View {
    let cell: MatchGolfScorecardCell
    let kind: MatchGolfScorecardRow.Kind

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 4) {
            if let side = cell.teamSide { ScorecardSideMark(side: side) }
            if kind != .result || cell.teamSide == nil {
                Text("\(Text(cell.value))\(Text(cell.strokeMarker ?? "").font(.system(.caption2, design: .default, weight: .semibold)).baselineOffset(4))")
                    .font(.system(kind == .status ? .caption : .subheadline, design: .default,
                                  weight: kind == .net || kind == .holes ? .semibold : .regular))
                    .monospacedDigit()
                    .lineLimit(1)
                    .fixedSize(horizontal: true, vertical: true)
            }
        }
        .fixedSize(horizontal: true, vertical: true)
        .background {
            GeometryReader { geometry in
                Color.clear.preference(key: ScorecardNaturalCellWidth.self, value: geometry.size.width)
            }
        }
        .foregroundStyle(kind == .holes ? .white : BaggerDesign.Color.textPrimary)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(cell.accessibilityLabel)
    }
}

private struct ScorecardNaturalCellWidth: PreferenceKey {
    static let defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = max(value, nextValue()) }
}

private struct ScorecardNaturalBandHeight: PreferenceKey {
    static let defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = max(value, nextValue()) }
}
